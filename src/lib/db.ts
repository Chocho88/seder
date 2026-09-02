// Local-first persistence (IndexedDB via Dexie) behind a sync-adapter seam.
// Phase 2 drops a Supabase adapter into SyncAdapter without touching the UI.

import Dexie, { type EntityTable } from 'dexie';
import type { Category, Item, Share } from './types';
import { prefsFromItem, type ItemPrefs } from './shareSplit';

export type OutboxTable = 'items' | 'categories' | 'prefs';

export interface OutboxEntry {
  seq?: number;
  table: OutboxTable;
  rowId: string;
  deleted: boolean;
  at: number;
  // item tombstones must carry their list so the server can check shared
  // membership on the delete (the row data is gone by then)
  categoryId?: string;
}

export const db = new Dexie('seder') as Dexie & {
  items: EntityTable<Item, 'id'>;
  categories: EntityTable<Category, 'id'>;
  prefs: EntityTable<ItemPrefs, 'id'>;
  shares: EntityTable<Share, 'id'>;
  outbox: EntityTable<OutboxEntry, 'seq'>;
  meta: EntityTable<{ key: string; value: unknown }, 'key'>;
};

db.version(1).stores({
  items: 'id, categoryId, parentId, today, pinned, done, archivedAt, updatedAt',
  categories: 'id, order, archived',
});
// v2: an outbox of local changes waiting to reach the server, and a
// tombstone list so deletes replicate. Both survive offline sessions.
db.version(2).stores({
  items: 'id, categoryId, parentId, today, pinned, done, archivedAt, updatedAt',
  categories: 'id, order, archived',
  outbox: '++seq, table, rowId',
  meta: 'key',
});
// v3 (shared lists): prefs = my personal triage overlay per item (today/
// urgent/... - see shareSplit.ts); shares = the invite/membership cache.
// ensurePrefs() (store.ts) lifts each item's personal fields into a prefs
// row at runtime - not here - because the row id needs the CURRENT owner id
// and Dexie upgrades run before we know who is signed in.
db.version(3).stores({
  items: 'id, categoryId, parentId, today, pinned, done, archivedAt, updatedAt',
  categories: 'id, order, archived',
  prefs: 'id, itemId, updatedAt',
  shares: 'id, listId, status',
  outbox: '++seq, table, rowId',
  meta: 'key',
});

export const outbox = db.outbox;
export const meta = db.meta;

// Whoever wants to react to new outbox entries (the sync engine schedules
// a push-on-write) registers here. db.ts stays below sync.ts in the
// import graph, so this is a callback seam, not an import.
let onFlush: (() => void) | null = null;
export function onOutboxFlush(cb: () => void): void {
  onFlush = cb;
}

/** Record that a row changed locally. */
export async function markDirty(table: OutboxTable, rowId: string, deleted = false): Promise<void> {
  await outbox.add({ table, rowId, deleted, at: Date.now() });
  onFlush?.();
}

// Every local write - from any store action - lands in the outbox via Dexie
// hooks. The hooks run INSIDE the caller's transaction (which may not include
// the outbox store), so they only collect keys; the actual outbox writes are
// flushed in a fresh transaction once the current one settles.
export let applyingRemote = false;
export function withRemote<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemote = true;
  return fn().finally(() => {
    applyingRemote = false;
  });
}
const pending: OutboxEntry[] = [];
let flushScheduled = false;
function queue(table: OutboxTable, rowId: string, deleted: boolean, categoryId?: string) {
  if (applyingRemote) return;
  pending.push({ table, rowId, deleted, at: Date.now(), ...(categoryId ? { categoryId } : {}) });
  if (!flushScheduled) {
    flushScheduled = true;
    // next macrotask: the originating transaction has committed by then
    setTimeout(() => {
      flushScheduled = false;
      const batch = pending.splice(0, pending.length);
      if (batch.length)
        void outbox
          .bulkAdd(batch)
          .then(() => onFlush?.())
          .catch((e) => console.warn('[outbox]', e));
    }, 0);
  }
}
function wire(table: OutboxTable) {
  const t = table === 'items' ? db.items : table === 'categories' ? db.categories : db.prefs;
  t.hook('creating', (key) => queue(table, String(key), false));
  t.hook('updating', (_mods, key) => queue(table, String(key), false));
  // deleting gets the object - item tombstones remember their list for RLS
  t.hook('deleting', (key, obj) =>
    queue(table, String(key), true, table === 'items' ? (obj as unknown as Item | undefined)?.categoryId : undefined),
  );
}
wire('items');
wire('categories');
wire('prefs');
// NOTE: shares is deliberately NOT outbox-wired. Sharing actions (invite,
// accept, leave, revoke) are online, transactional server calls - replaying
// them from an offline outbox could violate the invite state machine.
// The local table is a cache the pull refreshes.

/** The signed-in owner of this device's data ('local' before first sign-in). */
export async function ownerId(): Promise<string> {
  return ((await meta.get('owner'))?.value as string | undefined) ?? 'local';
}

/** Every live item gets a prefs row for the current owner; ids keyed to a
    previous owner ('local:' before sign-in) are re-keyed. Idempotent; runs
    on init and right after sign-in, BEFORE anything syncs. */
export async function ensurePrefs(): Promise<void> {
  const owner = await ownerId();
  const [items, prefs] = await Promise.all([db.items.toArray(), db.prefs.toArray()]);
  const have = new Set(prefs.map((p) => p.id));
  const adds: ItemPrefs[] = [];
  const drops: string[] = [];
  for (const p of prefs) {
    const [user, ...rest] = p.id.split(':');
    if (user !== owner) {
      const itemId = rest.join(':');
      drops.push(p.id);
      if (!have.has(`${owner}:${itemId}`)) adds.push({ ...p, id: `${owner}:${itemId}` });
    }
  }
  for (const it of items) {
    const id = `${owner}:${it.id}`;
    if (!have.has(id) && !adds.some((p) => p.id === id)) adds.push(prefsFromItem(owner, it));
  }
  if (adds.length) await db.prefs.bulkPut(adds); // queued to the outbox
  // the old-keyed rows never existed server-side; drop them silently
  if (drops.length) await withRemote(() => db.prefs.bulkDelete(drops));
}

// --- Sync adapter seam (phase 2: Supabase implementation) ---
export interface SyncAdapter {
  push(changes: { items: Item[]; categories: Category[] }): Promise<void>;
  pull(): Promise<{ items: Item[]; categories: Category[] } | null>;
}

export let syncAdapter: SyncAdapter | null = null;
export function registerSyncAdapter(adapter: SyncAdapter): void {
  syncAdapter = adapter;
}

export function uid(): string {
  return crypto.randomUUID();
}
