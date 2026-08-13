// Local-first persistence (IndexedDB via Dexie) behind a sync-adapter seam.
// Phase 2 drops a Supabase adapter into SyncAdapter without touching the UI.

import Dexie, { type EntityTable } from 'dexie';
import type { Category, Item } from './types';

export const db = new Dexie('seder') as Dexie & {
  items: EntityTable<Item, 'id'>;
  categories: EntityTable<Category, 'id'>;
};

db.version(1).stores({
  items: 'id, categoryId, parentId, today, pinned, done, archivedAt, updatedAt',
  categories: 'id, order, archived',
});

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
