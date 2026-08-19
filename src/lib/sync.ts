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
import { db, outbox, meta, withRemote, type OutboxTable } from './db';
import { neutralizeShared, type ItemPrefs } from './shareSplit';
import { supabase } from './supabase';
import type { Category, Item, Share } from './types';

type Table = 'items' | 'categories' | 'item_prefs';
type Row = { id: string; user_id: string; data: Item | Category | ItemPrefs; updated_at: number; deleted: boolean };
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
let onRemoteChange: (() => void) | null = null;
let onTitleConflict: ((loserTitle: string) => void) | null = null;
let onSyncFailure: (() => void) | null = null;
// sync failures surface ONCE per losing streak - a toast, not a siren
let cycleFailed = false;
let failureToasted = false;

export function setSyncSession(s: Session | null): void {
  session = s;
  if (!s) stopRealtime();
}

export function onRemote(cb: () => void): void {
  onRemoteChange = cb;
}

/** A pending local title edit lost to a newer remote one - toast once. */
export function onConflict(cb: (loserTitle: string) => void): void {
  onTitleConflict = cb;
}

/** Sync went wrong (network, policies) - the user must SEE it, once. */
export function onSyncError(cb: () => void): void {
  onSyncFailure = cb;
}

function noteFailure(): void {
  cycleFailed = true;
  if (!failureToasted) {
    failureToasted = true;
    onSyncFailure?.();
  }
}

/** What the account panel shows: how many changes wait, when we last
    fully synced. Polled while the panel is open. */
export async function syncStatus(): Promise<{ pending: number; lastOk: number | null; signedIn: boolean }> {
  const pending = await outbox.count();
  const lastOk = ((await meta.get('lastSyncOk'))?.value as number | undefined) ?? null;
  return { pending, lastOk, signedIn: session !== null };
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

/** Push every outbox entry to the server, newest state per row. */
export async function pushOutbox(): Promise<void> {
  if (!supabase || !session || pushing) return;
  pushing = true;
  try {
    const entries = await outbox.orderBy('seq').toArray();
    if (entries.length === 0) return;
    const me = session.user.id;
    const owners = await sharedListOwners();
    // collapse to one action per row
    const latest = new Map<string, (typeof entries)[number]>();
    for (const e of entries) latest.set(`${e.table}:${e.rowId}`, e);
    for (const table of ['items', 'categories', 'prefs'] as OutboxTable[]) {
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
          });
        }
      }
      if (rows.length === 0) continue;
      const { error } = await supabase.from(serverTable(table)).upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn('[sync] push failed', table, error.message);
        noteFailure();
        return; // keep outbox; retry later
      }
    }
    await outbox.where('seq').belowOrEqual(entries[entries.length - 1].seq!).delete();
  } finally {
    pushing = false;
  }
}

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
    await withRemote(() => store.delete(row.id));
    return true;
  }
  if (row.updated_at <= localAt) return false;
  // never lose a title edit silently: if my pending edit loses, say so once
  if (table === 'items' && pendingLocal > 0) {
    const mine = (local as Item | undefined)?.title;
    const theirs = (row.data as Item).title;
    if (mine && theirs && mine !== theirs) onTitleConflict?.(mine);
  }
  await withRemote(() => store.put(row.data as any));
  return true;
}

/** Refresh the local shares cache from the server (the table is tiny). */
async function pullShares(): Promise<{ changed: boolean; shares: Share[] }> {
  if (!supabase || !session) return { changed: false, shares: [] };
  const { data, error } = await supabase.from('shares').select('*');
  if (error) {
    console.warn('[sync] shares pull failed', error.message);
    noteFailure();
    return { changed: false, shares: await db.shares.toArray() };
  }
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
      noteFailure();
      continue;
    }
    for (const row of (cats.data ?? []) as Row[]) changed = (await applyRow('categories', row)) || changed;
    for (const row of (items.data ?? []) as Row[]) changed = (await applyRow('items', row)) || changed;
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

/** Pull rows changed on the server since our last pull; apply if newer. */
export async function pullChanges(): Promise<boolean> {
  if (!supabase || !session) return false;
  const since = ((await meta.get('lastPull'))?.value as number | undefined) ?? 0;
  let changed = false;
  let maxSeen = since;

  const sharesResult = await pullShares();
  changed = sharesResult.changed || changed;
  changed = (await backfillAcceptedShares(sharesResult.shares)) || changed;
  changed = (await pruneLostShares(sharesResult.shares)) || changed;

  for (const table of ['items', 'categories', 'item_prefs'] as Table[]) {
    // items/categories: NO user filter - RLS returns my rows plus the rows
    // of lists shared with me. Prefs are always mine alone.
    let query = supabase.from(table).select('*').gt('updated_at', since).order('updated_at');
    if (table === 'item_prefs') query = query.eq('user_id', session.user.id);
    const { data, error } = await query;
    if (error) {
      console.warn('[sync] pull failed', table, error.message);
      noteFailure();
      return changed;
    }
    for (const row of (data ?? []) as Row[]) {
      maxSeen = Math.max(maxSeen, row.updated_at);
      changed = (await applyRow(table, row)) || changed;
    }
  }
  await meta.put({ key: 'lastPull', value: maxSeen });
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

export function startRealtime(): void {
  if (!supabase || !session || channel) return;
  channel = supabase.channel('seder-changes');
  for (const table of ['items', 'categories', 'item_prefs', 'shares']) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void pullThenNotify());
  }
  channel.subscribe();
}
export function stopRealtime(): void {
  if (channel && supabase) void supabase.removeChannel(channel);
  channel = null;
}

async function pullThenNotify() {
  if (await pullChanges()) onRemoteChange?.();
}

/** Full cycle: push what we have, pull what's new. Safe to call often. */
export async function syncNow(): Promise<void> {
  if (!supabase || !session) return;
  cycleFailed = false;
  await pushOutbox();
  await pullThenNotify();
  if (!cycleFailed) {
    failureToasted = false; // a clean cycle re-arms the one-shot warning
    await meta.put({ key: 'lastSyncOk', value: Date.now() });
  }
}
