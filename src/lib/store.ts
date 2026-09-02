// Zustand store - THE contract between all components.
// Components read state + call actions; persistence goes through Dexie here.
//
// Sharing (wiki/sharing.md): every item the components see is COMPOSED of
// its shared row plus MY personal triage overlay (prefs). Components keep
// reading item.today / item.urgent exactly as before; only the writes are
// routed - updateItem splits each patch into its shared and personal half.

import { create } from 'zustand';
import { db, uid, ownerId, ensurePrefs } from './db';
import { seedIfEmpty } from './seed';
import { t, tfmt } from './i18n';
import { onRemote, onConflict, onDeleteConflict, onSyncError, shareToRow, isMissingTableError } from './sync';
import { startSelfUpdate } from './update';
import { parseMarkdownTasks } from './mdImport';
import { supabase } from './supabase';
import {
  composeItem,
  prefsFromItem,
  prefsId,
  rekeySnapshot,
  splitPatch,
  type ItemPrefs,
} from './shareSplit';
import {
  DEFAULT_SECTIONS,
  type CardStyle,
  type Category,
  type DetailMode,
  type Item,
  type ListView,
  type SectionId,
  type SectionPref,
  type Share,
  type ViewId,
} from './types';

const SECTIONS_KEY = 'seder-sections';
function loadSections(): SectionPref[] {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return DEFAULT_SECTIONS;
    const saved = JSON.parse(raw) as SectionPref[];
    // merge: keep the saved order; a section the app gained since this
    // device saved (e.g. 'today') slots in at its DEFAULT position, not at
    // the end - existing devices see new sections where they belong
    const known = new Set(saved.map((s) => s.id));
    const merged = saved.filter((s) => DEFAULT_SECTIONS.some((d) => d.id === s.id));
    for (const d of DEFAULT_SECTIONS) {
      if (known.has(d.id)) continue;
      const defIdx = DEFAULT_SECTIONS.findIndex((x) => x.id === d.id);
      const successor = DEFAULT_SECTIONS.slice(defIdx + 1).find((x) => merged.some((m) => m.id === x.id));
      const at = successor ? merged.findIndex((m) => m.id === successor.id) : merged.length;
      merged.splice(at, 0, d);
    }
    return merged;
  } catch {
    return DEFAULT_SECTIONS;
  }
}

// A shared list looks like any list, but its color and bento size are the
// VIEWER's, per device - they live here, not on the shared row.
// The account-switch wipe stashes the previous account's data here (auth.ts)
// so a wrong-account sign-in can never lose work - the banner restores it.
const RECOVERY_KEY = 'seder-recovery';
type RecoverySnapshot = { seder: number; exportedAt: number; items: Item[]; categories: Category[] };
function loadRecovery(): RecoverySnapshot | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as RecoverySnapshot;
    return snap.seder === 1 && Array.isArray(snap.items) ? snap : null;
  } catch {
    return null;
  }
}

const LIST_PREFS_KEY = 'seder-list-prefs';
type ListOverlay = Partial<Pick<Category, 'colorKey' | 'customColor' | 'w' | 'h'>>;
function loadListOverlays(): Record<string, ListOverlay> {
  try {
    return JSON.parse(localStorage.getItem(LIST_PREFS_KEY) ?? '{}') as Record<string, ListOverlay>;
  } catch {
    return {};
  }
}
function saveListOverlay(listId: string, patch: ListOverlay): void {
  const all = loadListOverlays();
  all[listId] = { ...all[listId], ...patch };
  localStorage.setItem(LIST_PREFS_KEY, JSON.stringify(all));
}

import {
  initialCardStyle,
  initialDetailMode,
  initialListView,
  initialOpenItem,
  initialView,
  persistCardStyle,
  persistDetailMode,
  persistListView,
  persistView,
  wantsFreshSeed,
} from './urlState';

interface SederState {
  ready: boolean;
  items: Item[]; // non-archived, COMPOSED with my prefs overlay
  categories: Category[]; // non-archived, ordered, viewer overlay applied
  prefs: ItemPrefs[]; // my triage overlay rows (all items, shared or not)
  shares: Share[]; // invite/membership cache (mine, either side)

  view: ViewId;
  cardStyle: CardStyle;
  listView: ListView; // how the lists pane renders: bento / gallery / carousel
  detailMode: DetailMode;
  openItemId: string | null; // detail panel target
  captureOpen: boolean; // omni-bar (Cmd+K)
  captureDictate: boolean; // open capture with dictation running (mobile mic)

  // One holistic drag layer: any row can be picked up anywhere and dropped
  // on a quadrant (sets flags), a category card (moves it), or the pinned
  // shelf (pins it). Cards themselves drag to reorder.
  dragItemId: string | null;
  dragCategoryId: string | null;
  touchDrag: { x: number; y: number; title: string } | null; // long-press drag on touch

  // Undo: full state snapshots, restored by Cmd+Z or toast
  undoStack: { items: Item[]; categories: Category[]; prefs: ItemPrefs[] }[];
  toast: { label: string; at: number; undoable?: boolean; ttl?: number } | null;

  suggestionsOn: boolean; // settings: morning suggestions visibility
  logbookOpen: boolean;

  // Canvas sections: order + visibility, user-arranged, persisted locally
  sections: SectionPref[];
  dragSectionId: SectionId | null;

  // --- lifecycle ---
  init(): Promise<void>;
  reloadFromDb(): Promise<void>;

  // --- recovery: the pre-wipe snapshot of a previous account ---
  recovery: { exportedAt: number; itemCount: number } | null;
  restoreRecovery(): Promise<void>;
  dismissRecovery(): void;

  /** Import a Markdown text: headings -> lists, blocks/bullets -> items.
      Returns how many lists and tasks landed. */
  importMarkdownText(text: string): Promise<{ lists: number; tasks: number }>;

  // --- item actions ---
  addItem(partial: Partial<Item> & Pick<Item, 'title' | 'categoryId'>): Promise<Item>;
  updateItem(id: string, patch: Partial<Item>): Promise<void>;
  toggleDone(id: string): Promise<void>;
  sweepDone(categoryId?: string): Promise<void>; // archive done items (all, or one list's)
  deleteItem(id: string): Promise<void>;
  setToday(id: string, today: boolean): Promise<void>;
  togglePinned(id: string): Promise<void>;

  // --- category actions ---
  addCategory(name: string): Promise<Category>;
  updateCategory(id: string, patch: Partial<Category>): Promise<void>;

  // --- sharing (wiki/sharing.md) ---
  /** True when this list has a live (invited or accepted) share. */
  shareOf(categoryId: string): Share | undefined;
  shareList(categoryId: string, email: string): Promise<string | null>; // error key or null
  acceptShare(shareId: string): Promise<void>;
  declineShare(shareId: string): Promise<void>;
  leaveShare(shareId: string): Promise<void>;
  revokeShare(shareId: string): Promise<void>;

  // --- ui actions ---
  setView(view: ViewId): void;
  setCardStyle(style: CardStyle): void;
  setListView(view: ListView): void;
  setDetailMode(mode: DetailMode): void;
  openItem(id: string | null): void;
  setCaptureOpen(open: boolean, dictate?: boolean): void;
  setDragItem(id: string | null): void;
  setDragCategory(id: string | null): void;
  setTouchDrag(v: { x: number; y: number; title: string } | null): void;
  moveItemToCategory(id: string, categoryId: string): Promise<void>;
  reorderCategory(dragId: string, targetId: string): Promise<void>;

  /** Reindexes a quadrant: dragged item gets flags + its visual position. */
  applyMatrixDrop(dragId: string, flags: { urgent: boolean | null; important: boolean | null }, orderedIds: string[]): Promise<void>;
  /** Reorder a top-level item inside a category (drop before target). */
  reorderInCategory(dragId: string, targetId: string): Promise<void>;
  /** Delete a list; its items flow to the Pool (undoable). */
  deleteCategory(id: string): Promise<void>;
  /** Central drop executor - shared by mouse drops and touch drops. */
  dropOn(key: string): Promise<void>;

  undo(): Promise<void>;
  clearToast(): void;
  /** Fire a transient info toast (no undo). ttl in ms, default 5000. */
  note(label: string, ttl?: number): void;

  setSuggestionsOn(on: boolean): void;
  setLogbookOpen(open: boolean): void;
  setSectionOn(id: SectionId, on: boolean): void;
  moveSection(dragId: SectionId, targetId: SectionId): void;
  resetSections(): void;
  setDragSection(id: SectionId | null): void;
  /** Move an item to the END of a category (drop on empty card space). */
  moveToEndOfCategory(id: string, categoryId: string): Promise<void>;
  /** Reorder sub-items under the same parent (drop before target). */
  reorderChild(dragId: string, targetId: string): Promise<void>;
  /** Bring an archived item back to life in its list. */
  restoreItem(id: string): Promise<void>;
}

/** The Pool's canonical id for the current owner (user id if signed in). */
async function poolIdFor(): Promise<string> {
  const owner = (await db.meta.get('owner'))?.value as string | undefined;
  return owner ? `pool-${owner}` : 'pool-local';
}

/** Ensure exactly one Pool exists under the canonical id; fold strays in. */
export async function ensurePool(): Promise<void> {
  const want = await poolIdFor();
  const pools = await db.categories.filter((c) => c.system === true).toArray();
  await db.transaction('rw', db.categories, db.items, async () => {
    let canonical = pools.find((p) => p.id === want);
    if (!canonical) {
      // adopt the first existing pool (rename) or create a fresh one
      const first = pools[0];
      canonical = first
        ? { ...first, id: want }
        : { id: want, name: 'Pool', colorKey: 'fog', order: -1, archived: false, system: true };
      await db.categories.put(canonical);
      if (first) {
        await db.items.where('categoryId').equals(first.id).modify({ categoryId: want });
        await db.categories.delete(first.id);
      }
    }
    for (const sp of pools) {
      if (sp.id === want || sp.id === canonical!.id) continue;
      await db.items.where('categoryId').equals(sp.id).modify({ categoryId: want });
      await db.categories.delete(sp.id);
    }
  });
}

async function loadAll(): Promise<{ items: Item[]; categories: Category[]; prefs: ItemPrefs[]; shares: Share[] }> {
  const owner = await ownerId();
  const [rawItems, rawCats, allPrefs, shares] = await Promise.all([
    db.items.filter((i) => i.archivedAt === null).toArray(),
    db.categories.filter((c) => !c.archived).sortBy('order'),
    db.prefs.toArray(),
    db.shares.toArray(),
  ]);
  const mine = new Map(allPrefs.filter((p) => p.id.startsWith(`${owner}:`)).map((p) => [p.itemId, p]));
  const items = rawItems.map((i) => composeItem(i, mine.get(i.id)));
  items.sort((a, b) => a.order - b.order);
  // shared lists wear the viewer's color/size, not the shared row's
  const overlays = loadListOverlays();
  const sharedIds = new Set(shares.filter((s) => s.status === 'accepted').map((s) => s.listId));
  const categories = rawCats.map((c) => (sharedIds.has(c.id) && overlays[c.id] ? { ...c, ...overlays[c.id] } : c));
  return { items, categories, prefs: allPrefs, shares };
}

export const useSeder = create<SederState>((set, get) => {
  /** Snapshot current state for undo (small dataset - full copy is fine). */
  const pushUndo = (toastLabel?: string) => {
    const snap = {
      items: get().items.map((i) => ({ ...i })),
      categories: get().categories.map((c) => ({ ...c })),
      prefs: get().prefs.map((p) => ({ ...p })),
    };
    const stack = [...get().undoStack, snap].slice(-20);
    set({ undoStack: stack, ...(toastLabel ? { toast: { label: toastLabel, at: Date.now() } } : {}) });
  };

  /** Write personal-overlay patches for one or more items (creating rows on
      first triage), then recompose the live items. One transaction. */
  const writePrefs = async (entries: { itemId: string; patch: Partial<ItemPrefs> }[]) => {
    const owner = await ownerId();
    const now = Date.now();
    const byItem = new Map(get().prefs.filter((p) => p.id.startsWith(`${owner}:`)).map((p) => [p.itemId, p]));
    const rows: ItemPrefs[] = [];
    for (const { itemId, patch } of entries) {
      const item = get().items.find((i) => i.id === itemId);
      const base = byItem.get(itemId) ?? (item ? prefsFromItem(owner, item) : null);
      if (!base) continue;
      rows.push({ ...base, ...patch, id: prefsId(owner, itemId), itemId, updatedAt: now });
    }
    if (!rows.length) return;
    await db.prefs.bulkPut(rows);
    const updated = new Map(rows.map((r) => [r.itemId, r]));
    const keep = get().prefs.filter((p) => !rows.some((r) => r.id === p.id));
    set({
      prefs: [...keep, ...rows],
      items: get().items.map((i) => (updated.has(i.id) ? composeItem(i, updated.get(i.id)) : i)),
    });
  };

  return {
  ready: false,
  items: [],
  categories: [],
  prefs: [],
  shares: [],
  view: initialView(),
  cardStyle: initialCardStyle(),
  listView: initialListView(),
  detailMode: initialDetailMode(),
  openItemId: null,
  captureOpen: false,
  captureDictate: false,
  dragItemId: null,
  dragCategoryId: null,
  touchDrag: null,
  undoStack: [],
  toast: null,
  suggestionsOn: localStorage.getItem('seder-suggestions') !== 'off',
  logbookOpen: false,
  sections: loadSections(),
  dragSectionId: null,
  recovery: (() => {
    const snap = loadRecovery();
    return snap ? { exportedAt: snap.exportedAt, itemCount: snap.items.filter((i) => i.archivedAt === null).length } : null;
  })(),

  async init() {
    // Demo seed only in dev (or on explicit ?seed=fresh). In production a
    // fresh device starts empty and fills from sync after sign-in.
    if (import.meta.env.DEV || wantsFreshSeed()) await seedIfEmpty(wantsFreshSeed());

    // The Pool: the basic intake list. Its id is deterministic PER USER
    // ('pool-<userId>') so every device of one account agrees on the same
    // row and different accounts never collide on the shared table. Before
    // sign-in it's a local id; on first sign-in it's renamed to the user's.
    await ensurePool();
    // Every item gets my personal-overlay row (today/urgent/... live there)
    await ensurePrefs();

    // One-time cleanup: the user never wants an em-dash anywhere.
    await db.items
      .filter((i) => i.title.includes('-') || i.notes.includes('-'))
      .modify((i) => {
        i.title = i.title.split('-').join('-');
        i.notes = i.notes.split('-').join('-');
      });

    const data = await loadAll();
    let open = initialOpenItem();
    // ?open=first → deterministically open the first rich item (screenshots/tests)
    if (open === 'first') {
      const first = data.items
        .filter((i) => i.parentId === null)
        .sort((a, b) => a.order - b.order)[0];
      open = first?.id ?? null;
    }
    set({ ...data, ready: true, openItemId: open });

    // remote changes (other device, other account) land in IndexedDB;
    // reload the live state
    onRemote(() => void get().reloadFromDb());
    // a pending edit lost to a newer remote write, or to a delete elsewhere
    // - never silently
    onConflict(() => set({ toast: { label: t('toast_edit_conflict'), at: Date.now(), undoable: false } }));
    onDeleteConflict(() => set({ toast: { label: t('toast_edit_lost_to_delete'), at: Date.now(), undoable: false } }));
    // sync trouble is a visible event, once per losing streak
    onSyncError(() => set({ toast: { label: t('sync_failed'), at: Date.now(), undoable: false } }));
    // ask the browser to shield IndexedDB from storage eviction - quiet
    // insurance against "my data vanished from this device"
    void navigator.storage?.persist?.().then((granted) => {
      void db.meta.put({ key: 'storagePersisted', value: granted });
    });
    // ...and keeps itself on the newest version (update.ts)
    startSelfUpdate(() => get().dragItemId !== null);
  },

  async reloadFromDb() {
    const fresh = await loadAll();
    // recovery re-read too: the account-switch snapshot is written AFTER
    // init (session resolves late), and its banner must not wait for a
    // manual reload
    const snap = loadRecovery();
    set({
      items: fresh.items,
      categories: fresh.categories,
      prefs: fresh.prefs,
      shares: fresh.shares,
      recovery: snap ? { exportedAt: snap.exportedAt, itemCount: snap.items.filter((i) => i.archivedAt === null).length } : null,
    });
  },

  async restoreRecovery() {
    // Bring the previous account's lists into THIS account. Every row gets
    // a fresh id: the old ids still exist on the server under the previous
    // account, and reusing them would collide on the shared tables.
    const snap = loadRecovery();
    if (!snap) return;
    const owner = await ownerId();
    const pool = get().categories.find((c) => c.system);
    const { categories: newCats, items: newItems, prefs: newPrefs } = rekeySnapshot(snap, {
      poolId: pool?.id ?? null,
      ownerId: owner,
      nextOrder: get().categories.length,
      newId: uid,
    });
    await db.transaction('rw', db.items, db.categories, db.prefs, async () => {
      if (newCats.length) await db.categories.bulkAdd(newCats);
      if (newItems.length) await db.items.bulkAdd(newItems);
      if (newPrefs.length) await db.prefs.bulkPut(newPrefs);
    });
    localStorage.removeItem(RECOVERY_KEY);
    set({ recovery: null, toast: { label: t('recovery_done'), at: Date.now(), undoable: false } });
    await get().reloadFromDb();
    const { syncNow } = await import('./sync');
    await syncNow(); // the restored rows ride the outbox up to this account
  },

  dismissRecovery() {
    localStorage.removeItem(RECOVERY_KEY);
    set({ recovery: null });
  },

  async importMarkdownText(text) {
    const parsed = parseMarkdownTasks(text);
    if (parsed.length === 0) return { lists: 0, tasks: 0 };
    const owner = await ownerId();
    const now = Date.now();
    const cats = get().categories;
    const pool = cats.find((c) => c.system);
    const byName = new Map(cats.filter((c) => !c.system).map((c) => [c.name.trim(), c]));
    const newCats: Category[] = [];
    const newItems: Item[] = [];
    const newPrefs: ItemPrefs[] = [];
    const touched = new Set<string>();
    let newLists = 0;
    const baseItem = (title: string, categoryId: string, parentId: string | null, order: number, done: boolean, notes: string): Item => ({
      id: uid(),
      title,
      kind: 'task',
      categoryId,
      parentId,
      order,
      nextMove: '',
      stateOverride: null,
      done,
      doneAt: done ? now : null,
      archivedAt: null,
      deletedAt: null,
      important: null,
      urgent: null,
      today: false,
      todaySince: null,
      evening: false,
      pinned: false,
      due: null,
      nudge: null,
      notes,
      links: [],
      source: { kind: 'md-import', ref: '' },
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    for (const listDef of parsed) {
      // a heading matching an existing list merges into it; the headingless
      // preamble goes to the Pool
      let target: Category | undefined =
        listDef.name === null ? pool : byName.get(listDef.name.trim());
      if (!target && listDef.name !== null) {
        target = {
          id: uid(),
          name: listDef.name.trim(),
          colorKey: (['sage', 'clay', 'rose', 'slate', 'ochre', 'plum', 'teal', 'coral', 'mustard', 'fog'] as const)[
            (cats.length + newCats.length) % 10
          ],
          order: cats.length + newCats.length,
          archived: false,
        };
        newCats.push(target);
        byName.set(target.name, target);
        newLists += 1;
      }
      if (!target) continue;
      if (listDef.items.length > 0) touched.add(target.id);
      const startOrder = get().items.filter((i) => i.categoryId === target!.id && i.parentId === null).length;
      listDef.items.forEach((md, n) => {
        const parent = baseItem(md.title, target!.id, null, startOrder + n, md.done, md.notes);
        newItems.push(parent);
        newPrefs.push(prefsFromItem(owner, parent));
        md.children.forEach((child, cn) => {
          const sub = baseItem(child.title, target!.id, parent.id, cn, child.done, '');
          newItems.push(sub);
          newPrefs.push(prefsFromItem(owner, sub));
        });
      });
    }
    await db.transaction('rw', db.items, db.categories, db.prefs, async () => {
      if (newCats.length) await db.categories.bulkAdd(newCats);
      if (newItems.length) await db.items.bulkAdd(newItems);
      if (newPrefs.length) await db.prefs.bulkPut(newPrefs);
    });
    await get().reloadFromDb();
    set({
      toast: {
        label:
          newItems.length === 0
            ? t('toast_md_empty')
            : tfmt('toast_md_imported', { n: String(newItems.length), m: String(touched.size) }),
        at: Date.now(),
        undoable: false,
      },
    });
    const { syncNow } = await import('./sync');
    void syncNow(); // ride straight up to the other devices
    return { lists: newLists, tasks: newItems.length };
  },

  async addItem(partial) {
    const now = Date.now();
    const siblings = get().items.filter(
      (i) => i.categoryId === partial.categoryId && i.parentId === (partial.parentId ?? null),
    );
    const it: Item = {
      id: uid(),
      kind: 'task',
      parentId: null,
      order: siblings.length,
      nextMove: '',
      stateOverride: null,
      done: false,
      doneAt: null,
      archivedAt: null,
      important: null,
      urgent: null,
      today: false,
      todaySince: null,
      pinned: false,
      due: null,
      nudge: null,
      notes: '',
      links: [],
      source: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    if (it.today && !it.todaySince) it.todaySince = now;
    const owner = await ownerId();
    const pref = prefsFromItem(owner, it); // capture "!"-style triage too
    await db.items.add(it);
    await db.prefs.put(pref);
    set({ items: [...get().items, it], prefs: [...get().prefs, pref] });
    return it;
  },

  async updateItem(id, patch) {
    // The sharing split: shared truth onto the item row, my triage into the
    // prefs overlay. A personal-only patch does not touch the item row (and
    // so never wakes the other account for a change it cannot see).
    const { shared, personal } = splitPatch(patch);
    const now = Date.now();
    if (Object.keys(shared).length > 0) {
      const full = { ...shared, updatedAt: now };
      await db.items.update(id, full);
      set({
        items: get()
          .items.map((i) => (i.id === id ? { ...i, ...full } : i))
          .filter((i) => i.archivedAt === null),
      });
    }
    if (Object.keys(personal).length > 0) {
      await writePrefs([{ itemId: id, patch: personal }]);
    }
  },

  async toggleDone(id) {
    const it = get().items.find((i) => i.id === id);
    if (!it) return;
    pushUndo();
    const done = !it.done;
    await get().updateItem(id, { done, doneAt: done ? Date.now() : null });
  },

  async sweepDone(categoryId) {
    pushUndo(t('toast_swept'));
    const now = Date.now();
    const hit = (i: Item) => i.done && (!categoryId || i.categoryId === categoryId);
    const doneIds = get().items.filter(hit).map((i) => i.id);
    await db.items.where('id').anyOf(doneIds).modify({ archivedAt: now });
    set({ items: get().items.filter((i) => !hit(i)) });
  },

  async deleteItem(id) {
    // Soft delete: the item (and its sub-items) leave the live board and
    // rest in the Logbook, marked deleted, restorable. Nothing truly vanishes.
    pushUndo(t('toast_deleted'));
    const all = get().items;
    const family = [id];
    const collect = (pid: string) => {
      for (const c of all.filter((i) => i.parentId === pid)) {
        family.push(c.id);
        collect(c.id);
      }
    };
    collect(id);
    const now = Date.now();
    await db.items.where('id').anyOf(family).modify({ archivedAt: now, deletedAt: now, updatedAt: now });
    set({
      items: all.filter((i) => !family.includes(i.id)),
      openItemId: get().openItemId === id ? null : get().openItemId,
    });
  },

  async setToday(id, today) {
    await get().updateItem(id, { today, todaySince: today ? Date.now() : null });
  },

  async togglePinned(id) {
    const it = get().items.find((i) => i.id === id);
    if (!it) return;
    await get().updateItem(id, { pinned: !it.pinned });
  },

  async addCategory(name) {
    const cats = get().categories;
    const usedColors = new Set(cats.map((c) => c.colorKey));
    const colorKey =
      (['sage', 'clay', 'rose', 'slate', 'ochre', 'plum'] as const).find((k) => !usedColors.has(k)) ?? 'sage';
    const cat: Category = { id: uid(), name, colorKey, order: cats.length, archived: false };
    await db.categories.add(cat);
    set({ categories: [...cats, cat] });
    return cat;
  },

  async updateCategory(id, patch) {
    // A shared list's color and bento size are the viewer's own (per device);
    // its name and existence are shared truth.
    const share = get().shareOf(id);
    if (share && share.status === 'accepted') {
      const local: ListOverlay = {};
      const shared: Partial<Category> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'colorKey' || k === 'customColor' || k === 'w' || k === 'h') (local as any)[k] = v;
        else (shared as any)[k] = v;
      }
      if (Object.keys(local).length > 0) saveListOverlay(id, local);
      if (Object.keys(shared).length > 0) await db.categories.update(id, shared);
      set({ categories: get().categories.map((c) => (c.id === id ? { ...c, ...patch } : c)).filter((c) => !c.archived) });
      return;
    }
    await db.categories.update(id, patch);
    set({ categories: get().categories.map((c) => (c.id === id ? { ...c, ...patch } : c)).filter((c) => !c.archived) });
  },

  // --- sharing ---

  shareOf(categoryId) {
    return get().shares.find((s) => s.listId === categoryId && (s.status === 'invited' || s.status === 'accepted'));
  },

  async shareList(categoryId, email) {
    const cat = get().categories.find((c) => c.id === categoryId);
    if (!cat || cat.system) return 'share_error'; // the Pool never shares
    if (!supabase) return 'share_error';
    const { data: sess } = await supabase.auth.getSession();
    const session = sess.session;
    if (!session) return 'share_signin_first';
    const address = email.trim().toLowerCase();
    if (!address || !address.includes('@')) return 'share_bad_email';
    if (address === session.user.email?.toLowerCase()) return 'share_bad_email';
    const now = Date.now();
    // one share per list: a dead share row (declined/revoked/left) is re-armed
    const dead = get().shares.find((s) => s.listId === categoryId);
    const share: Share = dead
      ? { ...dead, memberId: null, memberEmail: address, status: 'invited', updatedAt: now }
      : {
          id: uid(),
          listId: categoryId,
          ownerId: session.user.id,
          ownerEmail: session.user.email ?? '',
          memberId: null,
          memberEmail: address,
          status: 'invited',
          createdAt: now,
          updatedAt: now,
        };
    if (share.ownerId !== session.user.id) return 'share_not_owner';
    // sharing is an online, transactional act - the server speaks first
    const { error } = dead
      ? await supabase.from('shares').update(shareToRow(share)).eq('id', share.id)
      : await supabase.from('shares').insert(shareToRow(share));
    if (error) {
      console.warn('[share] invite failed', error.message);
      // the server has no shares table yet: name the real cause
      return isMissingTableError(error) ? 'sharing_not_installed' : 'share_error';
    }
    await db.shares.put(share);
    set({
      shares: [...get().shares.filter((s) => s.id !== share.id), share],
      toast: { label: t('toast_invite_sent'), at: Date.now(), undoable: false },
    });
    return null;
  },

  async acceptShare(shareId) {
    if (!supabase) return;
    const { data: sess } = await supabase.auth.getSession();
    const me = sess.session?.user.id;
    if (!me) return;
    const now = Date.now();
    const { error } = await supabase
      .from('shares')
      .update({ member_id: me, status: 'accepted', updated_at: now })
      .eq('id', shareId);
    if (error) {
      console.warn('[share] accept failed', error.message);
      set({ toast: { label: t('share_error'), at: Date.now(), undoable: false } });
      return;
    }
    const s = get().shares.find((x) => x.id === shareId);
    if (s) await db.shares.put({ ...s, memberId: me, status: 'accepted', updatedAt: now });
    set({ shares: get().shares.map((x) => (x.id === shareId ? { ...x, memberId: me, status: 'accepted', updatedAt: now } : x)) });
    // pull backfills the newly opened list past the watermark
    const { syncNow } = await import('./sync');
    await syncNow();
    await get().reloadFromDb();
  },

  async declineShare(shareId) {
    if (!supabase) return;
    const { data: sess } = await supabase.auth.getSession();
    const me = sess.session?.user.id;
    if (!me) return;
    const now = Date.now();
    const { error } = await supabase
      .from('shares')
      .update({ member_id: me, status: 'declined', updated_at: now })
      .eq('id', shareId);
    if (error) {
      console.warn('[share] decline failed', error.message);
      return;
    }
    await db.shares.delete(shareId);
    set({ shares: get().shares.filter((x) => x.id !== shareId) });
  },

  async leaveShare(shareId) {
    if (!supabase) return;
    const now = Date.now();
    const { error } = await supabase.from('shares').update({ status: 'left', updated_at: now }).eq('id', shareId);
    if (error) {
      console.warn('[share] leave failed', error.message);
      set({ toast: { label: t('share_error'), at: Date.now(), undoable: false } });
      return;
    }
    const s = get().shares.find((x) => x.id === shareId);
    if (s) {
      await db.shares.put({ ...s, status: 'left', updatedAt: now });
      // the list leaves with the share (my prefs stay - they come back if
      // I am ever re-invited); pruning also runs on every pull
      const { withRemote } = await import('./db');
      await withRemote(async () => {
        const ids = await db.items.where('categoryId').equals(s.listId).primaryKeys();
        await db.items.bulkDelete(ids as string[]);
        await db.categories.delete(s.listId);
      });
    }
    await get().reloadFromDb();
  },

  async revokeShare(shareId) {
    if (!supabase) return;
    const now = Date.now();
    const { error } = await supabase.from('shares').update({ status: 'revoked', updated_at: now }).eq('id', shareId);
    if (error) {
      console.warn('[share] revoke failed', error.message);
      set({ toast: { label: t('share_error'), at: Date.now(), undoable: false } });
      return;
    }
    const s = get().shares.find((x) => x.id === shareId);
    if (s) await db.shares.put({ ...s, status: 'revoked', updatedAt: now });
    set({ shares: get().shares.map((x) => (x.id === shareId ? { ...x, status: 'revoked', updatedAt: now } : x)) });
  },

  setView(view) {
    persistView(view);
    set({ view });
  },
  setCardStyle(style) {
    persistCardStyle(style);
    set({ cardStyle: style });
  },
  setListView(view) {
    persistListView(view);
    set({ listView: view });
  },
  setDetailMode(mode) {
    persistDetailMode(mode);
    set({ detailMode: mode });
  },
  openItem(id) {
    set({ openItemId: id });
  },
  setCaptureOpen(open, dictate = false) {
    set({ captureOpen: open, captureDictate: open && dictate });
  },

  setDragItem(id) {
    set({ dragItemId: id, ...(id === null ? { touchDrag: null } : {}) });
  },
  setDragCategory(id) {
    set({ dragCategoryId: id });
  },
  setTouchDrag(v) {
    set({ touchDrag: v });
  },

  async moveItemToCategory(id, categoryId) {
    const all = get().items;
    const it = all.find((i) => i.id === id);
    if (!it || it.categoryId === categoryId) return;
    pushUndo(t('toast_moved'));
    // the item becomes a top-level row of its new list; descendants follow
    const family = [id];
    const collect = (pid: string) => {
      for (const c of all.filter((i) => i.parentId === pid)) {
        family.push(c.id);
        collect(c.id);
      }
    };
    collect(id);
    const siblings = all.filter((i) => i.categoryId === categoryId && i.parentId === null);
    const now = Date.now();
    await db.items.where('id').anyOf(family).modify({ categoryId, updatedAt: now });
    await db.items.update(id, { parentId: null, order: siblings.length });
    set({
      items: all.map((i) =>
        family.includes(i.id)
          ? { ...i, categoryId, updatedAt: now, ...(i.id === id ? { parentId: null, order: siblings.length } : {}) }
          : i,
      ),
    });
  },

  async reorderCategory(dragId, targetId) {
    if (dragId === targetId) return;
    const cats = [...get().categories];
    const from = cats.findIndex((c) => c.id === dragId);
    const to = cats.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = cats.splice(from, 1);
    cats.splice(to, 0, moved);
    const reordered = cats.map((c, idx) => ({ ...c, order: idx }));
    await db.transaction('rw', db.categories, async () => {
      for (const c of reordered) await db.categories.update(c.id, { order: c.order });
    });
    set({ categories: reordered });
  },

  async reorderInCategory(dragId, targetId) {
    if (dragId === targetId) return;
    const all = get().items;
    const drag = all.find((i) => i.id === dragId);
    const target = all.find((i) => i.id === targetId);
    if (!drag || !target) return;
    pushUndo();
    // moving across lists lands the item at the target's position there
    const catId = target.categoryId;
    const siblings = all
      .filter((i) => i.categoryId === catId && i.parentId === null && !i.done && i.id !== dragId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((i) => i.id === targetId);
    siblings.splice(idx, 0, { ...drag, categoryId: catId, parentId: null });
    const orderOf = new Map(siblings.map((i, n) => [i.id, n]));
    const now = Date.now();
    await db.transaction('rw', db.items, async () => {
      await db.items.update(dragId, { categoryId: catId, parentId: null, updatedAt: now });
      for (const [id, ord] of orderOf) await db.items.update(id, { order: ord });
    });
    set({
      items: all.map((i) => {
        const patch: Partial<Item> = {};
        if (i.id === dragId) Object.assign(patch, { categoryId: catId, parentId: null, updatedAt: now });
        if (orderOf.has(i.id)) patch.order = orderOf.get(i.id);
        return Object.keys(patch).length ? { ...i, ...patch } : i;
      }),
    });
  },

  async deleteCategory(id) {
    const cat = get().categories.find((c) => c.id === id);
    const pool = get().categories.find((c) => c.system);
    if (!cat || cat.system || !pool) return;
    // a member never deletes the shared list - leaving is their move
    const share = get().shareOf(id);
    if (share && share.status === 'accepted') {
      const owner = await ownerId();
      if (share.ownerId !== owner) return;
    }
    pushUndo(t('toast_list_deleted'));
    const movedIds = get()
      .items.filter((i) => i.categoryId === id)
      .map((i) => i.id);
    await db.transaction('rw', db.items, db.categories, async () => {
      if (movedIds.length) await db.items.where('id').anyOf(movedIds).modify({ categoryId: pool.id });
      await db.categories.delete(id);
    });
    set({
      categories: get().categories.filter((c) => c.id !== id),
      items: get().items.map((i) => (i.categoryId === id ? { ...i, categoryId: pool.id } : i)),
    });
  },

  async applyMatrixDrop(dragId, flags, orderedIds) {
    pushUndo();
    // urgent/important/matrixOrder are PERSONAL - my matrix is mine
    await writePrefs([
      { itemId: dragId, patch: { urgent: flags.urgent, important: flags.important } },
      ...orderedIds.map((id, i) => ({ itemId: id, patch: { matrixOrder: (i + 1) * 1000 } as Partial<ItemPrefs> })),
    ]);
  },

  // Central drop executor. Keys:
  //   q:<u|nu>-<i|ni>[:before:<itemId>]  - quadrant, optional insert position
  //   tray                               - clear flags (stays today)
  //   cat:<categoryId>                   - move to list
  //   pin                                - pin to the shelf
  async dropOn(key) {
    const dragId = get().dragItemId;
    if (!dragId) return;
    const parts = key.split(':');
    if (parts[0] === 'q') {
      const [u, imp] = parts[1].split('-');
      const flags = { urgent: u === 'u', important: imp === 'i' };
      const pool = get()
        .items.filter(
          (i) =>
            !i.done &&
            i.parentId === null &&
            i.id !== dragId &&
            (i.urgent ?? false) === flags.urgent &&
            (i.important ?? false) === flags.important &&
            (i.urgent !== null || i.important !== null),
        )
        .sort((a, b) => (a.matrixOrder ?? a.createdAt) - (b.matrixOrder ?? b.createdAt));
      const ids = pool.map((i) => i.id);
      const beforeIdx = parts[2] === 'before' ? ids.indexOf(parts[3]) : -1;
      if (beforeIdx >= 0) ids.splice(beforeIdx, 0, dragId);
      else ids.push(dragId);
      await get().applyMatrixDrop(dragId, flags, ids);
    } else if (parts[0] === 'tray') {
      pushUndo();
      await get().updateItem(dragId, { urgent: null, important: null });
    } else if (parts[0] === 'evening') {
      pushUndo();
      await get().updateItem(dragId, { today: true, evening: true, todaySince: Date.now() });
    } else if (parts[0] === 'today') {
      pushUndo();
      await get().updateItem(dragId, { today: true, evening: false, todaySince: Date.now() });
    } else if (parts[0] === 'row') {
      const target = get().items.find((i) => i.id === parts[1]);
      if (target?.parentId) await get().reorderChild(dragId, parts[1]);
      else await get().reorderInCategory(dragId, parts[1]);
    } else if (parts[0] === 'catend') {
      await get().moveToEndOfCategory(dragId, parts[1]);
    } else if (parts[0] === 'cat') {
      const drag = get().items.find((i) => i.id === dragId);
      // dropping on a card's body: same list -> go to end; other list -> move
      if (drag?.categoryId === parts[1] && drag.parentId === null) await get().moveToEndOfCategory(dragId, parts[1]);
      else await get().moveItemToCategory(dragId, parts[1]);
    } else if (parts[0] === 'pin') {
      pushUndo();
      await get().updateItem(dragId, { pinned: true });
    }
    set({ dragItemId: null, touchDrag: null });
  },

  async undo() {
    const stack = [...get().undoStack];
    const snapshot = stack.pop();
    if (!snapshot) return;
    const curItemIds = new Set(get().items.map((i) => i.id));
    const snapItemIds = new Set(snapshot.items.map((i) => i.id));
    const curCatIds = new Set(get().categories.map((c) => c.id));
    const snapCatIds = new Set(snapshot.categories.map((c) => c.id));
    const curPrefIds = new Set(get().prefs.map((p) => p.id));
    const snapPrefIds = new Set(snapshot.prefs.map((p) => p.id));
    await db.transaction('rw', db.items, db.categories, db.prefs, async () => {
      await db.items.bulkPut(snapshot.items);
      await db.categories.bulkPut(snapshot.categories);
      await db.prefs.bulkPut(snapshot.prefs);
      // records created after the snapshot get removed on undo
      const addedItems = [...curItemIds].filter((id) => !snapItemIds.has(id));
      if (addedItems.length) await db.items.bulkDelete(addedItems);
      const addedCats = [...curCatIds].filter((id) => !snapCatIds.has(id));
      if (addedCats.length) await db.categories.bulkDelete(addedCats);
      const addedPrefs = [...curPrefIds].filter((id) => !snapPrefIds.has(id));
      if (addedPrefs.length) await db.prefs.bulkDelete(addedPrefs);
    });
    set({
      undoStack: stack,
      items: snapshot.items,
      categories: snapshot.categories,
      prefs: snapshot.prefs,
      toast: null,
      openItemId: null,
    });
  },

  clearToast() {
    set({ toast: null });
  },

  note(label, ttl) {
    set({ toast: { label, at: Date.now(), undoable: false, ...(ttl ? { ttl } : {}) } });
  },

  setSuggestionsOn(on) {
    localStorage.setItem('seder-suggestions', on ? 'on' : 'off');
    set({ suggestionsOn: on });
  },
  setLogbookOpen(open) {
    set({ logbookOpen: open });
  },

  setSectionOn(id, on) {
    const sections = get().sections.map((s) => (s.id === id ? { ...s, on } : s));
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
    set({ sections });
  },
  moveSection(dragId, targetId) {
    if (dragId === targetId) return;
    const sections = [...get().sections];
    const from = sections.findIndex((s) => s.id === dragId);
    const to = sections.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = sections.splice(from, 1);
    sections.splice(to, 0, moved);
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
    set({ sections });
  },
  resetSections() {
    localStorage.removeItem(SECTIONS_KEY);
    set({ sections: DEFAULT_SECTIONS });
  },
  setDragSection(id) {
    set({ dragSectionId: id });
  },

  async moveToEndOfCategory(id, categoryId) {
    const all = get().items;
    const it = all.find((i) => i.id === id);
    if (!it) return;
    pushUndo();
    const siblings = all
      .filter((i) => i.categoryId === categoryId && i.parentId === null && !i.done && i.id !== id)
      .sort((a, b) => a.order - b.order);
    const orderOf = new Map(siblings.map((i, n) => [i.id, n]));
    orderOf.set(id, siblings.length);
    const now = Date.now();
    await db.transaction('rw', db.items, async () => {
      await db.items.update(id, { categoryId, parentId: null, updatedAt: now });
      for (const [iid, ord] of orderOf) await db.items.update(iid, { order: ord });
    });
    set({
      items: all.map((i) => {
        const patch: Partial<Item> = {};
        if (i.id === id) Object.assign(patch, { categoryId, parentId: null, updatedAt: now });
        if (orderOf.has(i.id)) patch.order = orderOf.get(i.id);
        return Object.keys(patch).length ? { ...i, ...patch } : i;
      }),
    });
  },

  async reorderChild(dragId, targetId) {
    if (dragId === targetId) return;
    const all = get().items;
    const drag = all.find((i) => i.id === dragId);
    const target = all.find((i) => i.id === targetId);
    if (!drag || !target || !target.parentId) return;
    pushUndo();
    const parentId = target.parentId;
    const siblings = all
      .filter((i) => i.parentId === parentId && i.id !== dragId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((i) => i.id === targetId);
    siblings.splice(idx, 0, drag);
    const orderOf = new Map(siblings.map((i, n) => [i.id, n]));
    await db.transaction('rw', db.items, async () => {
      await db.items.update(dragId, { parentId, categoryId: target.categoryId });
      for (const [id, ord] of orderOf) await db.items.update(id, { order: ord });
    });
    set({
      items: all.map((i) => {
        const patch: Partial<Item> = {};
        if (i.id === dragId) Object.assign(patch, { parentId, categoryId: target.categoryId });
        if (orderOf.has(i.id)) patch.order = orderOf.get(i.id);
        return Object.keys(patch).length ? { ...i, ...patch } : i;
      }),
    });
  },

  async restoreItem(id) {
    // Restore the item with everything it needs to make sense: its archived
    // sub-items come along, and if it's a sub-item whose parent is archived,
    // the parent comes back too (a checklist row without its parent is noise).
    const all = await db.items.toArray();
    const byId = new Map(all.map((i) => [i.id, i]));
    const ids = new Set<string>([id]);
    // ancestors that are archived
    let cur = byId.get(id);
    while (cur?.parentId) {
      const par = byId.get(cur.parentId);
      if (!par) break;
      if (par.archivedAt !== null) ids.add(par.id);
      cur = par;
    }
    // descendants that are archived
    const collect = (pid: string) => {
      for (const c of all.filter((i) => i.parentId === pid && i.archivedAt !== null)) {
        ids.add(c.id);
        collect(c.id);
      }
    };
    collect(id);
    const now = Date.now();
    await db.items.where('id').anyOf([...ids]).modify({ archivedAt: null, deletedAt: null, done: false, doneAt: null, updatedAt: now });
    const restored = await db.items.where('id').anyOf([...ids]).toArray();
    const owner = await ownerId();
    const mine = new Map(get().prefs.filter((p) => p.id.startsWith(`${owner}:`)).map((p) => [p.itemId, p]));
    const live = new Set(get().items.map((i) => i.id));
    set({ items: [...get().items, ...restored.filter((i) => !live.has(i.id)).map((i) => composeItem(i, mine.get(i.id)))] });
  },
  };
});

// --- Derived helpers (pure, shared by views) ---

export function childrenOf(items: Item[], parentId: string): Item[] {
  return items.filter((i) => i.parentId === parentId).sort((a, b) => a.order - b.order);
}

export function topLevelOf(items: Item[], categoryId: string): Item[] {
  return items
    .filter((i) => i.categoryId === categoryId && i.parentId === null)
    .sort((a, b) => a.order - b.order);
}

export function todayItems(items: Item[]): Item[] {
  return items.filter((i) => i.today && !i.done);
}

/** Age in whole days an item has been sitting in Today. */
export function todayAgeDays(item: Item): number {
  if (!item.todaySince) return 0;
  return Math.floor((Date.now() - item.todaySince) / 86400000);
}

/** Rule-based morning suggestion candidates (no AI): urgent, due soon, aged.
    A dismissed ("not today") item stays hidden until its snooze passes. */
export function morningCandidates(items: Item[]): Item[] {
  const now = Date.now();
  const soon = now + 2 * 86400000;
  return items.filter(
    (i) =>
      !i.done &&
      !i.today &&
      i.parentId === null &&
      !(i.suggestSnooze != null && i.suggestSnooze > now) &&
      (i.urgent === true || (i.due !== null && i.due < soon) || (i.nudge !== null && i.nudge < now)),
  );
}

/** End of the current day - the natural horizon for "not today". */
export function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
