// Local-first persistence (IndexedDB via Dexie) behind a sync-adapter seam.
// Phase 2 drops a Supabase adapter into SyncAdapter without touching the UI.

import Dexie, { type EntityTable } from 'dexie';
import type { Category, Item } from './types';

export interface OutboxEntry {
  seq?: number;
  table: 'items' | 'categories';
  rowId: string;
  deleted: boolean;
  at: number;
}

export const db = new Dexie('seder') as Dexie & {
  items: EntityTable<Item, 'id'>;
  categories: EntityTable<Category, 'id'>;
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

export const outbox = db.outbox;
export const meta = db.meta;

/** Record that a row changed locally. */
export async function markDirty(table: 'items' | 'categories', rowId: string, deleted = false): Promise<void> {
  await outbox.add({ table, rowId, deleted, at: Date.now() });
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
function queue(table: 'items' | 'categories', rowId: string, deleted: boolean) {
  if (applyingRemote) return;
  pending.push({ table, rowId, deleted, at: Date.now() });
  if (!flushScheduled) {
    flushScheduled = true;
    // next macrotask: the originating transaction has committed by then
    setTimeout(() => {
      flushScheduled = false;
      const batch = pending.splice(0, pending.length);
      if (batch.length) void outbox.bulkAdd(batch).catch((e) => console.warn('[outbox]', e));
    }, 0);
  }
}
function wire(table: 'items' | 'categories') {
  const t = table === 'items' ? db.items : db.categories;
  t.hook('creating', (key) => queue(table, String(key), false));
  t.hook('updating', (_mods, key) => queue(table, String(key), false));
  t.hook('deleting', (key) => queue(table, String(key), true));
}
wire('items');
wire('categories');

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
