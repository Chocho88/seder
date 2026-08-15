// Sync engine: local-first, last-write-wins by updatedAt, tombstones for
// deletes, realtime pull. IndexedDB stays the working copy; the server is
// the meeting point between devices. Everything here degrades to a no-op
// when there's no session or no network.

import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { db, outbox, meta, withRemote } from './db';
import { supabase } from './supabase';
import type { Category, Item } from './types';

type Table = 'items' | 'categories';
type Row = { id: string; user_id: string; data: Item | Category; updated_at: number; deleted: boolean };

let session: Session | null = null;
let channel: RealtimeChannel | null = null;
let pushing = false;
let onRemoteChange: (() => void) | null = null;

export function setSyncSession(s: Session | null): void {
  session = s;
  if (!s) stopRealtime();
}

export function onRemote(cb: () => void): void {
  onRemoteChange = cb;
}

const updatedAtOf = (table: Table, data: Item | Category): number =>
  table === 'items' ? (data as Item).updatedAt : ((data as Category & { updatedAt?: number }).updatedAt ?? 0);

/** Push every outbox entry to the server, newest state per row. */
export async function pushOutbox(): Promise<void> {
  if (!supabase || !session || pushing) return;
  pushing = true;
  try {
    const entries = await outbox.orderBy('seq').toArray();
    if (entries.length === 0) return;
    // collapse to one action per row
    const latest = new Map<string, (typeof entries)[number]>();
    for (const e of entries) latest.set(`${e.table}:${e.rowId}`, e);
    for (const table of ['items', 'categories'] as Table[]) {
      const rows: Row[] = [];
      for (const e of latest.values()) {
        if (e.table !== table) continue;
        if (e.deleted) {
          rows.push({ id: e.rowId, user_id: session.user.id, data: { id: e.rowId } as any, updated_at: e.at, deleted: true });
        } else {
          const data = await (table === 'items' ? db.items.get(e.rowId) : db.categories.get(e.rowId));
          if (!data) continue;
          rows.push({
            id: e.rowId,
            user_id: session.user.id,
            data,
            updated_at: Math.max(updatedAtOf(table, data), e.at),
            deleted: false,
          });
        }
      }
      if (rows.length === 0) continue;
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn('[sync] push failed', table, error.message);
        return; // keep outbox; retry later
      }
    }
    await outbox.where('seq').belowOrEqual(entries[entries.length - 1].seq!).delete();
  } finally {
    pushing = false;
  }
}

/** Pull rows changed on the server since our last pull; apply if newer. */
export async function pullChanges(): Promise<boolean> {
  if (!supabase || !session) return false;
  const since = ((await meta.get('lastPull'))?.value as number | undefined) ?? 0;
  let changed = false;
  let maxSeen = since;
  for (const table of ['items', 'categories'] as Table[]) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', session.user.id).gt('updated_at', since).order('updated_at');
    if (error) {
      console.warn('[sync] pull failed', table, error.message);
      return changed;
    }
    for (const row of (data ?? []) as Row[]) {
      maxSeen = Math.max(maxSeen, row.updated_at);
      const local = table === 'items' ? await db.items.get(row.id) : await db.categories.get(row.id);
      const localAt = local ? updatedAtOf(table, local) : -1;
      // a pending local change wins over an older remote one
      const pendingLocal = await outbox.where('rowId').equals(row.id).count();
      if (pendingLocal > 0 && localAt >= row.updated_at) continue;
      if (row.deleted) {
        if (local) {
          await withRemote(() => (table === 'items' ? db.items.delete(row.id) : db.categories.delete(row.id)));
          changed = true;
        }
      } else if (row.updated_at > localAt) {
        await withRemote(() =>
          table === 'items' ? db.items.put(row.data as Item) : db.categories.put(row.data as Category),
        );
        changed = true;
      }
    }
  }
  await meta.put({ key: 'lastPull', value: maxSeen });
  return changed;
}

/** First sign-in on a device with local data: everything local goes up. */
export async function seedOutboxFromLocal(): Promise<void> {
  const [items, cats, pending] = await Promise.all([db.items.toArray(), db.categories.toArray(), outbox.count()]);
  if (pending > 0) return;
  await db.transaction('rw', outbox, async () => {
    for (const c of cats) await outbox.add({ table: 'categories', rowId: c.id, deleted: false, at: Date.now() });
    for (const i of items) await outbox.add({ table: 'items', rowId: i.id, deleted: false, at: Date.now() });
  });
}

export function startRealtime(): void {
  if (!supabase || !session || channel) return;
  channel = supabase
    .channel('seder-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => void pullThenNotify())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => void pullThenNotify())
    .subscribe();
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
  await pushOutbox();
  await pullThenNotify();
}
