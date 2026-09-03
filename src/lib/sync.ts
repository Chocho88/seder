// Sync engine: local-first, last-write-wins by updatedAt, tombstones for
// deletes, realtime pull. IndexedDB stays the working copy; the server is
// the meeting point between devices - and, for shared lists, between the
// two accounts of a share. Everything here degrades to a no-op when there's
// no session or no network.
//
// Sharing changes three things (see wiki/sharing.md):
//   - pull no longer filters by user_id: RLS decides what I may see, which
//     now includes rows of lists shared with me;
//   - rows of a shared list are pushed with the LIST OWNER's user_id, and
//     with personal triage fields neutralized - my triage travels in the
//     item_prefs overlay, one row per (user, item), mine only;
//   - a newly accepted share backfills the whole list past the pull
//     watermark, and a share that stops being accepted prunes the list
//     from this device.

import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { db, outbox, meta, withRemote, uid, onOutboxFlush, type OutboxTable } from './db';
import { isMissingTableError, neutralizeShared, prefsFromItem, type ItemPrefs } from './shareSplit';
import {
  isClockSkewError,
  isTransientError,
  jwtIatOffsetMs,
  mergeParked,
  parseSyncError,
  shouldPark,
  unparkPlan,
  type ParkedEntry,
  type SyncErrorInfo,
} from './syncHealth';
import { supabase } from './supabase';
import type { Category, Item, Share } from './types';

type Table = 'items' | 'categories' | 'item_prefs';
// item_id: the item_prefs TABLE carries it as a NOT NULL column (not just
// inside data) - omitting it fails every prefs push. See wiki/architecture.md.
type Row = {
  id: string;
  user_id: string;
  data: Item | Category | ItemPrefs;
  updated_at: number;
  deleted: boolean;
  item_id?: string;
};
type ShareRow = {
  id: string;
  list_id: string;
  owner_id: string;
  owner_email: string;
  member_id: string | null;
  member_email: string;
  status: Share['status'];
  created_at: number;
  updated_at: number;
};

let session: Session | null = null;
let channel: RealtimeChannel | null = null;
let pushing = false;
// a write that lands while a push is in flight must not wait for the next
// poll tick: remember it and run one more cycle as soon as this one ends
let pushQueued = false;
let onRemoteChange: (() => void) | null = null;
let onEditConflict: ((label: string) => void) | null = null;
let onDeleteConflictCb: ((label: string) => void) | null = null;
let onSyncFailure: (() => void) | null = null;
// sync failures surface ONCE per losing streak - a toast, not a siren
let cycleFailed = false;
let failureToasted = false;

export function setSyncSession(s: Session | null): void {
  session = s;
  if (!s) stopRealtime();
  else
    void meta.get('sharingReady').then((r) => {
      if (r?.value === false) sharingReady = false;
    });
}

export function onRemote(cb: () => void): void {
  onRemoteChange = cb;
}

/** A pending local edit (any field, not just title) lost to a newer remote
    write on the same row - toast once per row so it's never silent. */
export function onConflict(cb: (label: string) => void): void {
  onEditConflict = cb;
}

/** A pending local edit lost because the row was deleted elsewhere (another
    device, or the other side of a share) before our edit ever reached the
    server - distinct from onConflict because "it's gone" reads differently
    from "someone else's edit won". */
export function onDeleteConflict(cb: (label: string) => void): void {
  onDeleteConflictCb = cb;
}

/** Sync went wrong (network, policies) - the user must SEE it, once. */
export function onSyncError(cb: () => void): void {
  onSyncFailure = cb;
}

/** lastSyncError, structured. A legacy pre-stamped string written by an
    older build parses to null and is deleted on sight - the frozen
    "[20:38] push categories: ..." line dies right here. */
async function readLastError(): Promise<SyncErrorInfo | null> {
  const raw = (await meta.get('lastSyncError'))?.value;
  if (raw === undefined) return null;
  const parsed = parseSyncError(raw);
  if (!parsed) await meta.delete('lastSyncError');
  return parsed;
}

/** A thrown value's message, truncated - the one place every catch block
    turns an unknown exception into the short text noteFailure records. */
const errMsg = (e: unknown): string => String((e as { message?: string })?.message ?? e).slice(0, 200);

function noteFailure(detail: string): void {
  cycleFailed = true;
  if (isClockSkewError(detail)) {
    skewTrouble = true;
    // say how big the gap is, measured against THIS device's clock
    const off = jwtIatOffsetMs(session?.access_token, Date.now());
    if (off !== null) detail = `${detail} (token minted ${off >= 0 ? '+' : ''}${(off / 1000).toFixed(1)}s vs this device's clock)`;
  } else if (isAuthTrouble(detail)) authTrouble = true;
  void meta.put({ key: 'lastSyncError', value: { at: Date.now(), detail } satisfies SyncErrorInfo });
  if (!failureToasted) {
    failureToasted = true;
    onSyncFailure?.();
  }
}

// --- Auth-class failures: an expired or invalid token rejects EVERY
// request, which a user experiences as "it is not syncing" with nothing
// obviously wrong. The cycle after such a failure refreshes the session;
// if the refresh itself fails the device is truthfully signed out, so the
// panel shows the sign-in button instead of an endless red line.
let authTrouble = false;
let lastAuthRecovery = 0; // never hammer the auth service: one refresh per minute at most
// Clock skew ("JWT issued at future"): the token is fine, the API's clock
// is a little behind the auth service's. Retry with a growing pause -
// 3s, 6s, 12s, capped - and NEVER refresh for it (a fresh token would be
// future-stamped again, and the retry-refresh loop that produced hammers
// both services while every push keeps landing inside the skew window).
let skewTrouble = false;
let skewBackoff = 3000;
let onAuthLost: (() => void) | null = null;
export function onAuthLostCallback(cb: () => void): void {
  onAuthLost = cb;
}
function isAuthTrouble(detail: string): boolean {
  return /jwt|token|not authenticated|unauthori[sz]ed|\b401\b|PGRST301|invalid claim|session/i.test(detail);
}
async function recoverAuth(): Promise<void> {
  if (!supabase) return;
  if (Date.now() - lastAuthRecovery < 60_000) return; // the poll retries anyway
  lastAuthRecovery = Date.now();
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    console.warn('[sync] session refresh failed - signing this device out', error?.message);
    onAuthLost?.();
    return;
  }
  session = data.session;
  scheduleSync(0); // a fresh token: retry right away, not at the next tick
}

// --- Parked changes: rows the server keeps refusing for a durable reason.
// They leave the outbox (so sync can go clean and honest) but stay intact
// in local Dexie; the account panel shows a quiet count + one-tap retry.

async function readParked(): Promise<ParkedEntry[]> {
  return ((await meta.get('parked'))?.value as ParkedEntry[] | undefined) ?? [];
}

async function park(entry: Omit<ParkedEntry, 'parkedAt' | 'attempts' | 'reason'>, reason: string): Promise<void> {
  const merged = mergeParked(await readParked(), [{ ...entry, reason, parkedAt: Date.now(), attempts: 1 }]);
  await meta.put({ key: 'parked', value: merged });
  console.warn('[sync] parked', entry.table, entry.rowId, reason);
}

/** How often a specific row's push failed (non-transient, non-ownership) -
    the counter that decides parking via shouldPark. */
async function bumpAttempts(table: OutboxTable, rowId: string): Promise<number> {
  const counts = ((await meta.get('pushAttempts'))?.value as Record<string, number> | undefined) ?? {};
  const key = `${table}:${rowId}`;
  counts[key] = (counts[key] ?? 0) + 1;
  await meta.put({ key: 'pushAttempts', value: counts });
  return counts[key];
}

/** "Try again": everything parked goes back into the outbox and a sync
    cycle runs. Counters reset so the rows get a full set of fresh chances. */
export async function retryParked(): Promise<void> {
  const parked = await readParked();
  if (parked.length === 0) return;
  await outbox.bulkAdd(unparkPlan(parked));
  await meta.delete('parked');
  await meta.delete('pushAttempts');
  await syncNow();
}

// The sharing tables (item_prefs, shares) are OPTIONAL server furniture:
// until migrations/002_sharing.sql runs, they simply do not exist. That
// must degrade to "sharing off", never break items/categories sync.
let sharingReady = true;
export function isSharingReady(): boolean {
  return sharingReady;
}
export { isMissingTableError };
function markSharing(ready: boolean): void {
  if (sharingReady !== ready) {
    sharingReady = ready;
    void meta.put({ key: 'sharingReady', value: ready });
  }
}

/** What the account panel shows: how many changes wait, when we last fully
    synced, the last error's text, and whether the server has the sharing
    tables. Polled while the panel is open. */
export async function syncStatus(): Promise<{
  pending: number;
  parked: number;
  lastOk: number | null;
  lastPullOk: number | null;
  signedIn: boolean;
  lastError: SyncErrorInfo | null;
  sharingReady: boolean;
}> {
  // when the sharing tables are missing, prefs entries wait by design -
  // counting them would make the number lie about real unsynced work
  const pending = sharingReady
    ? await outbox.count()
    : await outbox.where('table').anyOf('items', 'categories').count();
  const parked = (await readParked()).length;
  const lastOk = ((await meta.get('lastSyncOk'))?.value as number | undefined) ?? null;
  const lastPullOk = ((await meta.get('lastPullOk'))?.value as number | undefined) ?? null;
  return { pending, parked, lastOk, lastPullOk, signedIn: session !== null, lastError: await readLastError(), sharingReady };
}

const updatedAtOf = (data: Item | Category | ItemPrefs): number =>
  (data as { updatedAt?: number }).updatedAt ?? 0;

export const shareToRow = (s: Share): ShareRow => ({
  id: s.id,
  list_id: s.listId,
  owner_id: s.ownerId,
  owner_email: s.ownerEmail,
  member_id: s.memberId,
  member_email: s.memberEmail,
  status: s.status,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});
const rowToShare = (r: ShareRow): Share => ({
  id: r.id,
  listId: r.list_id,
  ownerId: r.owner_id,
  ownerEmail: r.owner_email,
  memberId: r.member_id,
  memberEmail: r.member_email,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** listId -> owning user for every accepted share (either side of it). */
async function sharedListOwners(): Promise<Map<string, string>> {
  const shares = await db.shares.where('status').equals('accepted').toArray();
  return new Map(shares.map((s) => [s.listId, s.ownerId]));
}

const serverTable = (t: OutboxTable): Table => (t === 'prefs' ? 'item_prefs' : t);

/** The server said "that row id belongs to someone else": an upsert of an
    id that exists under ANOTHER account (no share) hits the update path
    and RLS rejects it, or the insert path trips the primary key. Happens
    when old-id data re-enters a new account (e.g. a backup imported after
    an account switch, before imports re-keyed). */
function isOwnershipError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = err.message ?? '';
  return /row-level security/i.test(msg) || /duplicate key value/i.test(msg) || err.code === '42501' || err.code === '23505';
}

/** Give a local row a fresh identity of OUR OWN: new id, links remapped,
    the old row removed WITHOUT a tombstone (it was never ours to delete
    server-side). The Dexie hooks queue the new rows for the next push. */
async function healForeignRow(table: 'items' | 'categories', oldId: string): Promise<boolean> {
  const owner = session?.user.id ?? 'local';
  if (table === 'categories') {
    const cat = await db.categories.get(oldId);
    if (!cat) return false;
    if (cat.system) {
      // A Pool wearing a foreign identity (old account's id, or a stale
      // meta.owner). Refusing left sync red forever - instead fold it into
      // OUR canonical pool: items move over, the foreign row is removed
      // locally without a tombstone (it was never ours server-side).
      const want = `pool-${owner}`;
      if (oldId === want) return false; // our own canonical id rejected: park it
      await meta.put({ key: 'owner', value: owner }); // heal a stale owner mark too
      const canonical = await db.categories.get(want);
      if (!canonical) await db.categories.put({ ...cat, id: want });
      await db.items.where('categoryId').equals(oldId).modify({ categoryId: want });
      await withRemote(() => db.categories.delete(oldId));
      console.warn('[sync] folded foreign pool', oldId, '->', want);
      return true;
    }
    const newId = uid();
    await db.categories.put({ ...cat, id: newId });
    await db.items.where('categoryId').equals(oldId).modify({ categoryId: newId });
    await withRemote(() => db.categories.delete(oldId));
    console.warn('[sync] healed foreign category', oldId, '->', newId);
    return true;
  }
  const it = await db.items.get(oldId);
  if (!it) return false;
  const newId = uid();
  await db.items.put({ ...it, id: newId });
  await db.items.where('parentId').equals(oldId).modify({ parentId: newId });
  await db.prefs.put(prefsFromItem(owner, { ...it, id: newId }));
  await withRemote(async () => {
    await db.items.delete(oldId);
    await db.prefs.delete(`${owner}:${oldId}`);
  });
  console.warn('[sync] healed foreign item', oldId, '->', newId);
  return true;
}

/** Push every outbox entry to the server, newest state per row. */
export async function pushOutbox(): Promise<void> {
  if (!supabase || !session) return;
  if (pushing) {
    pushQueued = true;
    return;
  }
  pushing = true;
  try {
    const entries = await outbox.orderBy('seq').toArray();
    if (entries.length === 0) return;
    const me = session.user.id;
    const owners = await sharedListOwners();
    // one shares refresh per push cycle, on the first ownership error -
    // a stale local share entry is a root cause worth ruling out first
    let sharesRefreshed = false;
    // collapse to one action per row
    const latest = new Map<string, (typeof entries)[number]>();
    for (const e of entries) latest.set(`${e.table}:${e.rowId}`, e);
    for (const table of ['items', 'categories', 'prefs'] as OutboxTable[]) {
      // every entry (queue duplicates included) for THIS table, so a
      // successful upsert drains exactly its own outbox slice - one failing
      // table must never hold the others' entries hostage
      const tableSeqs = entries.filter((e) => e.table === table).map((e) => e.seq!);
      try {
        const rows: Row[] = [];
        for (const e of latest.values()) {
          if (e.table !== table) continue;
          if (e.deleted) {
            // item tombstones keep their categoryId so a member's delete of a
            // shared item passes the membership policy
            const catId = table === 'items' ? e.categoryId : undefined;
            rows.push({
              id: e.rowId,
              user_id: (catId && owners.get(catId)) || me,
              data: { id: e.rowId, ...(catId ? { categoryId: catId } : {}) } as any,
              updated_at: e.at,
              deleted: true,
              // prefs row ids are '<userId>:<itemId>' - the table needs item_id
              ...(table === 'prefs' ? { item_id: e.rowId.split(':').slice(1).join(':') } : {}),
            });
          } else {
            const data = await (table === 'items'
              ? db.items.get(e.rowId)
              : table === 'categories'
                ? db.categories.get(e.rowId)
                : db.prefs.get(e.rowId));
            if (!data) continue;
            // rows of a shared list belong to the list owner; my triage never
            // rides on the shared item row
            let user_id = me;
            let payload: Item | Category | ItemPrefs = data;
            if (table === 'items') {
              const it = data as Item;
              user_id = owners.get(it.categoryId) ?? me;
              payload = neutralizeShared(it);
            } else if (table === 'categories') {
              user_id = owners.get((data as Category).id) ?? me;
            }
            rows.push({
              id: e.rowId,
              user_id,
              data: payload,
              updated_at: Math.max(updatedAtOf(data), e.at),
              deleted: false,
              ...(table === 'prefs' ? { item_id: (data as ItemPrefs).itemId } : {}),
            });
          }
        }
        if (rows.length === 0) {
          if (tableSeqs.length) await outbox.bulkDelete(tableSeqs); // stale entries for vanished rows
          continue;
        }
        const { error } = await supabase.from(serverTable(table)).upsert(rows, { onConflict: 'id' });
        if (error) {
          if (table === 'prefs' && isMissingTableError(error)) {
            // the sharing migration has not been applied - keep the entries
            // for the day it is, but this is NOT a sync failure
            markSharing(false);
            continue;
          }
          if ((table === 'items' || table === 'categories') && isOwnershipError(error)) {
            // Some row id in this batch belongs to another account. First
            // refresh the shares cache once - a stale accepted-share entry
            // makes us push the WRONG user_id, and that alone explains an
            // ownership rejection. Then retry rows one by one, self-heal the
            // real foreigners, and PARK what cannot heal (it stays intact
            // locally; retrying it forever only keeps sync red).
            if (!sharesRefreshed) {
              sharesRefreshed = true;
              await pullShares();
              const fresh = await sharedListOwners();
              owners.clear();
              for (const [k, v] of fresh) owners.set(k, v);
            }
            let healed = 0;
            for (const row of rows) {
              // recompute ownership from the refreshed cache before retrying
              if (!row.deleted) {
                row.user_id =
                  table === 'items'
                    ? (owners.get((row.data as Item).categoryId) ?? me)
                    : (owners.get(row.id) ?? me);
              }
              const single = await supabase.from(serverTable(table)).upsert([row], { onConflict: 'id' });
              if (!single.error) continue;
              const entry = latest.get(`${table}:${row.id}`);
              const base = {
                table,
                rowId: row.id,
                deleted: row.deleted,
                at: entry?.at ?? row.updated_at,
                ...(entry?.categoryId ? { categoryId: entry.categoryId } : {}),
              };
              if (isOwnershipError(single.error)) {
                if (row.deleted) {
                  // a tombstone for a row that was never ours server-side is
                  // a no-op - drop it silently instead of parking noise
                  console.warn('[sync] dropped foreign tombstone', table, row.id);
                  continue;
                }
                try {
                  if (await healForeignRow(table, row.id)) {
                    healed += 1;
                  } else {
                    // heal declined (row gone, or unhealable identity) - it
                    // would decline identically forever: park it
                    await park(base, `ownership: ${single.error.message.slice(0, 200)}`);
                  }
                } catch (healErr) {
                  // never let a heal bug silently break the whole sync cycle
                  await park(base, `heal threw: ${String(healErr).slice(0, 200)}`);
                }
              } else if (isTransientError(single.error.message)) {
                // network-ish: keep it queued, a later cycle fixes this
                await outbox.add(base);
                noteFailure(`push ${serverTable(table)}: ${single.error.message}`);
              } else {
                const attempts = await bumpAttempts(table, row.id);
                if (shouldPark('push-error', attempts, false)) {
                  await park(base, single.error.message.slice(0, 200));
                } else {
                  await outbox.add(base); // re-queue for a few more tries
                  noteFailure(`push ${serverTable(table)}: ${single.error.message}`);
                }
              }
            }
            await outbox.bulkDelete(tableSeqs); // survivors were explicitly re-queued above
            if (healed) {
              console.warn(`[sync] healed ${healed} foreign ${table} row(s)`);
              onRemoteChange?.(); // ids changed under the UI - reload state
            }
            continue;
          }
          console.warn('[sync] push failed', table, error.message);
          noteFailure(`push ${serverTable(table)}: ${error.message}`);
          continue; // this table retries later; the others still drain
        }
        if (table === 'prefs') markSharing(true);
        await outbox.bulkDelete(tableSeqs);
        // a clean push wipes this table's failure counters - the next error
        // starts a fresh streak instead of inheriting an old one
        const counts = ((await meta.get('pushAttempts'))?.value as Record<string, number> | undefined) ?? {};
        const kept = Object.fromEntries(Object.entries(counts).filter(([k]) => !k.startsWith(`${table}:`)));
        if (Object.keys(kept).length !== Object.keys(counts).length) await meta.put({ key: 'pushAttempts', value: kept });
      } catch (tableErr) {
        // ANY exception while processing this table (a thrown network
        // error, an IndexedDB read failure, anything) must never abort the
        // whole cycle silently - report it with a fresh timestamp and move
        // on to the next table. This is what a frozen error banner + a
        // climbing pending count (evidence from live beacons) looks like
        // when it's missing: the loop died here before ever reaching the
        // per-row handling above, so noteFailure was never called again.
        console.warn('[sync] push threw', table, tableErr);
        noteFailure(`push ${serverTable(table)} threw: ${errMsg(tableErr)}`);
      }
    }
  } catch (err) {
    // the preamble above (reading the outbox, refreshing the shares cache)
    // has no per-step guard the way the per-table loop does; one exception
    // here must still surface as a real, visible, recorded failure instead
    // of an unhandled rejection that escapes pushOutbox/syncNow silently.
    console.warn('[sync] push preamble threw', err);
    noteFailure(`push: ${errMsg(err)}`);
  } finally {
    pushing = false;
    if (pushQueued) {
      pushQueued = false;
      scheduleSync(0);
    }
  }
}

/** True when any field but updatedAt differs between two rows of the same
    shape - the generic "would this remote write actually change what I have
    pending" check, used by the edit-conflict branch below. */
function anyFieldDiffers(mine: Record<string, unknown>, theirs: Record<string, unknown>): boolean {
  return Object.keys(theirs).some((k) => k !== 'updatedAt' && JSON.stringify(mine[k]) !== JSON.stringify(theirs[k]));
}
/** A row's display name, for the conflict toasts - shared by both branches. */
const labelOf = (row: Record<string, unknown>): string =>
  (row.title as string | undefined) ?? (row.name as string | undefined) ?? '';

/** Apply one remote row locally if it wins; returns true when it changed us. */
async function applyRow(table: Table, row: Row): Promise<boolean> {
  const store = table === 'items' ? db.items : table === 'categories' ? db.categories : db.prefs;
  const local = await store.get(row.id);
  const localAt = local ? updatedAtOf(local) : -1;
  // a pending local change wins over an older remote one
  const pendingLocal = await outbox.where('rowId').equals(row.id).count();
  if (pendingLocal > 0 && localAt >= row.updated_at) return false;
  if (row.deleted) {
    if (!local) return false;
    // my pending edit never reached the server - someone else's delete got
    // there first. Distinct from an edit-vs-edit conflict: "it's gone", not
    // "someone else's version won" - and it must never happen silently.
    if (table !== 'item_prefs' && pendingLocal > 0) onDeleteConflictCb?.(labelOf(local as unknown as Record<string, unknown>));
    await withRemote(() => store.delete(row.id));
    return true;
  }
  if (row.updated_at <= localAt) return false;
  // never lose a pending edit silently: if it loses to a newer remote write
  // that actually differs - on ANY field, not just title - say so once.
  // (Personal prefs are excluded: those never cross accounts, and the same
  // person's own quick toggles across two devices are not worth a toast.)
  if (table !== 'item_prefs' && pendingLocal > 0 && local) {
    const mine = local as unknown as Record<string, unknown>;
    const theirs = row.data as unknown as Record<string, unknown>;
    if (anyFieldDiffers(mine, theirs)) onEditConflict?.(labelOf(mine));
  }
  await withRemote(() => store.put(row.data as any));
  return true;
}

/** Apply a batch of pulled rows defensively: one malformed row (e.g. a
    legacy row whose data blob is missing its id, so Dexie's put throws
    "key path did not yield a value") must never abort the rest of the
    batch, or the caller's own bookkeeping (pullChanges' watermark, via
    beforeEach) - the one thing that used to leave sync permanently stuck
    on a single poisoned row. Shared by pullChanges' main loop and
    backfillAcceptedShares' two loops, so a stuck row is reported the
    same way, and never silently, wherever it's hit. */
async function applyRowsSafely(table: Table, rows: Row[], beforeEach?: (row: Row) => void): Promise<boolean> {
  let changed = false;
  for (const row of rows) {
    beforeEach?.(row);
    try {
      changed = (await applyRow(table, row)) || changed;
    } catch (rowErr) {
      console.warn('[sync] applyRow threw', table, row.id, rowErr);
      noteFailure(`pull ${table} row ${row.id}: ${errMsg(rowErr)}`);
    }
  }
  return changed;
}

/** Refresh the local shares cache from the server (the table is tiny). */
async function pullShares(): Promise<{ changed: boolean; shares: Share[] }> {
  if (!supabase || !session) return { changed: false, shares: [] };
  const { data, error } = await supabase.from('shares').select('*');
  if (error) {
    if (isMissingTableError(error)) markSharing(false);
    else {
      console.warn('[sync] shares pull failed', error.message);
      noteFailure(`pull shares: ${error.message}`);
    }
    return { changed: false, shares: await db.shares.toArray() };
  }
  markSharing(true);
  const remote = ((data ?? []) as ShareRow[]).map(rowToShare);
  const local = await db.shares.toArray();
  const changed =
    remote.length !== local.length ||
    remote.some((r) => {
      const l = local.find((x) => x.id === r.id);
      return !l || l.updatedAt !== r.updatedAt || l.status !== r.status;
    });
  if (changed) {
    await withRemote(async () => {
      await db.shares.clear();
      await db.shares.bulkAdd(remote);
    });
  }
  return { changed, shares: remote };
}

/** A share I accepted opens a list whose rows are OLDER than my pull
    watermark - fetch that list whole, once per acceptance. */
async function backfillAcceptedShares(shares: Share[]): Promise<boolean> {
  if (!supabase || !session) return false;
  const me = session.user.id;
  let changed = false;
  for (const s of shares) {
    if (s.status !== 'accepted' || s.memberId !== me) continue;
    const markKey = `shareSynced:${s.id}:${s.updatedAt}`;
    if (await meta.get(markKey)) continue;
    const [cats, items] = await Promise.all([
      supabase.from('categories').select('*').eq('id', s.listId),
      supabase.from('items').select('*').eq('data->>categoryId', s.listId),
    ]);
    if (cats.error || items.error) {
      console.warn('[sync] backfill failed', s.listId, (cats.error ?? items.error)?.message);
      noteFailure(`backfill ${s.listId}: ${(cats.error ?? items.error)?.message}`);
      continue;
    }
    changed = (await applyRowsSafely('categories', (cats.data ?? []) as Row[])) || changed;
    changed = (await applyRowsSafely('items', (items.data ?? []) as Row[])) || changed;
    await meta.put({ key: markKey, value: Date.now() });
  }
  return changed;
}

/** A share that stopped being accepted takes its list with it (member side).
    My prefs rows stay - they are mine, and they bring my triage back if the
    share is ever re-accepted. */
async function pruneLostShares(shares: Share[]): Promise<boolean> {
  if (!session) return false;
  const me = session.user.id;
  let changed = false;
  for (const s of shares) {
    if (s.ownerId === me) continue; // owner keeps their list, always
    const wasMine = s.memberId === me || s.status === 'invited';
    if (!wasMine || s.status === 'accepted') continue;
    const cat = await db.categories.get(s.listId);
    if (!cat) continue;
    await withRemote(async () => {
      const ids = await db.items.where('categoryId').equals(s.listId).primaryKeys();
      await db.items.bulkDelete(ids as string[]);
      await db.categories.delete(s.listId);
    });
    changed = true;
  }
  return changed;
}

/** Pull rows changed on the server since our last pull; apply if newer.
    CORE FIRST: items and categories are the app; the sharing tables are
    optional extras whose absence or failure must never block them. */
export async function pullChanges(): Promise<boolean> {
  if (!supabase || !session) return false;
  const since = ((await meta.get('lastPull'))?.value as number | undefined) ?? 0;
  let changed = false;
  let maxSeen = since;
  let coreOk = true;

  for (const table of ['items', 'categories', 'item_prefs'] as Table[]) {
    // items/categories: NO user filter - RLS returns my rows plus the rows
    // of lists shared with me. Prefs are always mine alone.
    let query = supabase.from(table).select('*').gt('updated_at', since).order('updated_at');
    if (table === 'item_prefs') query = query.eq('user_id', session.user.id);
    const { data, error } = await query;
    if (error) {
      if (table === 'item_prefs' && isMissingTableError(error)) {
        markSharing(false); // migration not applied yet - not a failure
        continue;
      }
      console.warn('[sync] pull failed', table, error.message);
      noteFailure(`pull ${table}: ${error.message}`);
      if (table !== 'item_prefs') coreOk = false;
      continue;
    }
    if (table === 'item_prefs') markSharing(true);
    // the watermark advances BEFORE applyRow runs (beforeEach), so one
    // malformed row can never wedge the whole pull forever - see
    // applyRowsSafely's comment. Before this guard, a single throw aborted
    // the rest of the loop AND the watermark write below it, so the exact
    // same poisoned row was re-fetched and re-thrown on every future cycle -
    // permanently stuck, indistinguishable from "sync is broken".
    changed = (await applyRowsSafely(table, (data ?? []) as Row[], (row) => { maxSeen = Math.max(maxSeen, row.updated_at); })) || changed;
  }
  // advance the watermark only when the core tables pulled clean, so a
  // failed pull is retried from the same spot instead of skipping rows
  if (coreOk) {
    await meta.put({ key: 'lastPull', value: maxSeen });
    // honest freshness: the device DID hear the server, even if some push
    // is stuck - the panel prefers this over a scary "never synced"
    await meta.put({ key: 'lastPullOk', value: Date.now() });
  }

  // sharing extras - each guarded, none may take the pull down
  try {
    const sharesResult = await pullShares();
    changed = sharesResult.changed || changed;
    if (sharingReady) {
      changed = (await backfillAcceptedShares(sharesResult.shares)) || changed;
      changed = (await pruneLostShares(sharesResult.shares)) || changed;
    }
  } catch (e) {
    console.warn('[sync] shares stage failed', e);
  }
  return changed;
}

/** First sign-in on a device with local data: everything local goes up. */
export async function seedOutboxFromLocal(): Promise<void> {
  const [items, cats, prefs, pending] = await Promise.all([
    db.items.toArray(),
    db.categories.toArray(),
    db.prefs.toArray(),
    outbox.count(),
  ]);
  if (pending > 0) return;
  await db.transaction('rw', outbox, async () => {
    for (const c of cats) await outbox.add({ table: 'categories', rowId: c.id, deleted: false, at: Date.now() });
    for (const i of items) await outbox.add({ table: 'items', rowId: i.id, deleted: false, at: Date.now() });
    for (const p of prefs) await outbox.add({ table: 'prefs', rowId: p.id, deleted: false, at: Date.now() });
  });
}

// Realtime is the fast lane, not a dependency: when it is not actually
// delivering (service off, tables missing from the publication), the app
// tightens its poll instead of leaving a 60s hole between devices.
let realtimeDelivering = false;
export function isRealtimeDelivering(): boolean {
  return realtimeDelivering;
}

export function startRealtime(): void {
  if (!supabase || !session || channel) return;
  const ch = supabase.channel('seder-changes');
  for (const table of ['items', 'categories', 'item_prefs', 'shares']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      realtimeDelivering = true; // an actual event arrived - fast lane works
      void pullThenNotify();
    });
  }
  channel = ch;
  ch.subscribe((status) => {
    if (status !== 'CLOSED' && status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
    // the socket died - most often a phone backgrounded long enough that
    // iOS/the OS drops the connection with no JS-visible error. Left
    // unnoticed, `isRealtimeDelivering()` (having seen ONE event, ever)
    // keeps reporting true and the poll stays relaxed to 60s - two devices
    // can silently drift for a minute at a time. Tear down so the next
    // poll tick or resume calls startRealtime() again on a clean slate.
    realtimeDelivering = false;
    if (channel === ch) stopRealtime();
  });
}
export function stopRealtime(): void {
  if (channel && supabase) void supabase.removeChannel(channel);
  channel = null;
}
/** Force a fresh subscription regardless of whether the old channel object
    still looks alive - called on resume (auth.ts), since a suspended
    WebSocket is exactly the thing a status callback cannot always catch
    while the tab was backgrounded. */
export function restartRealtime(): void {
  stopRealtime();
  startRealtime();
}

// Realtime delivers one event PER CHANGED ROW: a bulk operation (markdown
// import, a big sweep, accepting a share with existing items) fires many
// nearly-simultaneous events, each naively triggering its own full
// pullChanges() - a read storm, and overlapping pulls each re-rendering the
// whole store. Same guard-and-coalesce idiom as pushOutbox/pushQueued: a
// pull already running absorbs everything that arrives while it runs into
// exactly one more pass, not one pass per event.
let pulling = false;
let pullQueued = false;
async function pullThenNotify() {
  if (pulling) {
    pullQueued = true;
    return;
  }
  pulling = true;
  try {
    if (await pullChanges()) onRemoteChange?.();
  } finally {
    pulling = false;
    if (pullQueued) {
      pullQueued = false;
      void pullThenNotify();
    }
  }
}

/** One-tap proof for THIS device: write a probe row through the real
    server and read it back. Green + milliseconds, or the exact error.
    The probe lives in item_prefs under a reserved id - my own row, never
    rendered (no item carries that id), overwritten on every check. */
export async function probeRoundTrip(): Promise<{ ok: boolean; ms?: number; error?: string }> {
  if (!supabase) return { ok: false, error: 'unconfigured' };
  if (!session) return { ok: false, error: 'signed-out' };
  const uid = session.user.id;
  const id = `${uid}:sync-probe`;
  const stamp = Date.now();
  const t0 = performance.now();
  const up = await supabase.from('item_prefs').upsert(
    { id, user_id: uid, item_id: 'sync-probe', data: { stamp }, updated_at: stamp, deleted: false },
    { onConflict: 'id' },
  );
  if (up.error) return { ok: false, error: up.error.message };
  const back = await supabase.from('item_prefs').select('data').eq('id', id).single();
  if (back.error) return { ok: false, error: back.error.message };
  if ((back.data?.data as { stamp?: number })?.stamp !== stamp) return { ok: false, error: 'probe mismatch' };
  return { ok: true, ms: Math.round(performance.now() - t0) };
}

// --- Push-on-write: the reliability contract users actually feel.
// A change must leave the device within about a second of being made -
// not on the next 20-60s poll tick, and not "when the tab regains focus"
// (on a phone the app is usually already backgrounded by then, and iOS
// kills in-flight requests). Every outbox growth schedules a cycle; rapid
// edits coalesce into one push.
let scheduled: number | null = null;
export const syncSignals = { scheduled: 0 }; // observable by tests, nothing else reads it
export function scheduleSync(delayMs = 1200): void {
  syncSignals.scheduled += 1; // the seam fired - counted even when signed out
  if (!supabase || !session) return;
  if (scheduled !== null) window.clearTimeout(scheduled);
  scheduled = window.setTimeout(() => {
    scheduled = null;
    void syncNow();
  }, delayMs);
}
onOutboxFlush(() => scheduleSync());

/** Full cycle: pull what's new, then push what we have. Safe to call often.
    Pull runs FIRST: it merges the freshest remote content into Dexie before
    push re-serializes local rows. This matters most for reorder-only writes
    (dropOn/reorderInCategory/etc.) - they touch every sibling's `order`
    field but never bump the row's own updatedAt, so pushOutbox falls back
    to "now" for those rows and re-uploads the row's FULL local snapshot.
    Pulling first means that snapshot already carries any edit another
    device made and we have not yet seen, instead of a stale cached copy
    racing a genuinely newer edit on updated_at alone (a pending edit of
    OURS still wins either way - applyRow checks the outbox, not push order). */
export function syncNow(): Promise<void> {
  if (inFlightSync) return inFlightSync; // see inFlightSync's own comment
  const run = runSyncCycle().finally(() => {
    if (inFlightSync === run) inFlightSync = null;
  });
  inFlightSync = run;
  return run;
}

// Concurrent callers on the SAME tick (e.g. auth.ts's resume listener and
// update.ts's reloadAfterSync, both firing on one visibilitychange) share
// this ONE real cycle instead of each kicking off their own. Without this,
// the second caller's pullThenNotify()/pushOutbox() calls would just see the
// first's own inner guard already set, queue behind it (pullQueued/
// pushQueued), and run a full extra pull+push pass once the first finished -
// 2-3x the network work for one event. Worse for reloadAfterSync specifically:
// its own syncNow() call would resolve almost immediately in that case
// (queueing, not awaiting, the real work), undermining the "wait for sync to
// actually land before reloading" guarantee it exists for.
let inFlightSync: Promise<void> | null = null;

async function runSyncCycle(): Promise<void> {
  if (!supabase || !session) return;
  cycleFailed = false;
  authTrouble = false;
  skewTrouble = false;
  try {
    await pullThenNotify();
    await pushOutbox();
    if (skewTrouble) {
      skewTrouble = false;
      scheduleSync(skewBackoff);
      skewBackoff = Math.min(skewBackoff * 2, 30_000);
    } else if (authTrouble) {
      authTrouble = false;
      await recoverAuth();
    }
  } catch (err) {
    // Last line of defense. pullChanges/pushOutbox are now hardened
    // per-row/per-table (a single malformed row - e.g. a legacy row whose
    // data blob is missing its id, which threw "key path did not yield a
    // value" on every device, every cycle, forever - used to escape as an
    // unhandled rejection here), but anything else that still slips
    // through must land as a RECORDED, visible failure, not a bare
    // rejection the account panel's Sync Now button can only relabel
    // "Sync failed" with zero diagnostic - exactly what made this bug so
    // hard to find in the first place.
    console.warn('[sync] cycle threw', err);
    noteFailure(`sync cycle: ${errMsg(err)}`);
  }
  if (!cycleFailed) {
    skewBackoff = 3000;
    failureToasted = false; // a clean cycle re-arms the one-shot warning
    await meta.put({ key: 'lastSyncOk', value: Date.now() });
    await meta.delete('lastSyncError');
  }
}
