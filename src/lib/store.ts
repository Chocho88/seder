// Zustand store — THE contract between all components.
// Components read state + call actions; persistence goes through Dexie here.

import { create } from 'zustand';
import { db, uid } from './db';
import { seedIfEmpty } from './seed';
import { t } from './i18n';
import type { CardStyle, Category, DetailMode, Item, ViewId } from './types';
import {
  initialCardStyle,
  initialDetailMode,
  initialOpenItem,
  initialView,
  persistCardStyle,
  persistDetailMode,
  persistView,
  wantsFreshSeed,
} from './urlState';

interface SederState {
  ready: boolean;
  items: Item[]; // non-archived
  categories: Category[]; // non-archived, ordered

  view: ViewId;
  cardStyle: CardStyle;
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

  // Undo: full item-state snapshots, restored by Cmd+Z or the toast button
  undoStack: Item[][];
  toast: { label: string; at: number } | null;

  suggestionsOn: boolean; // settings: morning suggestions visibility
  logbookOpen: boolean;

  // --- lifecycle ---
  init(): Promise<void>;

  // --- item actions ---
  addItem(partial: Partial<Item> & Pick<Item, 'title' | 'categoryId'>): Promise<Item>;
  updateItem(id: string, patch: Partial<Item>): Promise<void>;
  toggleDone(id: string): Promise<void>;
  sweepDone(): Promise<void>; // archive all done items (manual clear)
  deleteItem(id: string): Promise<void>;
  setToday(id: string, today: boolean): Promise<void>;
  togglePinned(id: string): Promise<void>;

  // --- category actions ---
  addCategory(name: string): Promise<Category>;
  updateCategory(id: string, patch: Partial<Category>): Promise<void>;

  // --- ui actions ---
  setView(view: ViewId): void;
  setCardStyle(style: CardStyle): void;
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
  /** Central drop executor - shared by mouse drops and touch drops. */
  dropOn(key: string): Promise<void>;

  undo(): Promise<void>;
  clearToast(): void;

  setSuggestionsOn(on: boolean): void;
  setLogbookOpen(open: boolean): void;
  /** Bring an archived item back to life in its list. */
  restoreItem(id: string): Promise<void>;
}

async function loadAll(): Promise<{ items: Item[]; categories: Category[] }> {
  const [items, categories] = await Promise.all([
    db.items.filter((i) => i.archivedAt === null).toArray(),
    db.categories.filter((c) => !c.archived).sortBy('order'),
  ]);
  items.sort((a, b) => a.order - b.order);
  return { items, categories };
}

export const useSeder = create<SederState>((set, get) => {
  /** Snapshot current items for undo (small dataset - full copy is fine). */
  const pushUndo = (toastLabel?: string) => {
    const stack = [...get().undoStack, get().items.map((i) => ({ ...i }))].slice(-20);
    set({ undoStack: stack, ...(toastLabel ? { toast: { label: toastLabel, at: Date.now() } } : {}) });
  };

  return {
  ready: false,
  items: [],
  categories: [],
  view: initialView(),
  cardStyle: initialCardStyle(),
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

  async init() {
    await seedIfEmpty(wantsFreshSeed());

    // The Pool: the basic intake list. Fixed id makes creation idempotent
    // (init can run twice under StrictMode); stray duplicates get removed.
    const pools = await db.categories.filter((c) => c.system === true).toArray();
    if (!pools.some((p) => p.id === 'pool-system')) {
      await db.categories.put({
        id: 'pool-system',
        name: 'Pool',
        colorKey: 'fog',
        order: -1,
        archived: false,
        system: true,
      });
    }
    const strays = pools.filter((p) => p.id !== 'pool-system');
    if (strays.length > 0) {
      await db.categories.bulkDelete(strays.map((p) => p.id));
    }

    // One-time cleanup: the user never wants an em-dash anywhere.
    await db.items
      .filter((i) => i.title.includes('—') || i.notes.includes('—'))
      .modify((i) => {
        i.title = i.title.split('—').join('-');
        i.notes = i.notes.split('—').join('-');
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
    await db.items.add(it);
    set({ items: [...get().items, it] });
    return it;
  },

  async updateItem(id, patch) {
    const now = Date.now();
    const full = { ...patch, updatedAt: now };
    await db.items.update(id, full);
    set({
      items: get()
        .items.map((i) => (i.id === id ? { ...i, ...full } : i))
        .filter((i) => i.archivedAt === null),
    });
  },

  async toggleDone(id) {
    const it = get().items.find((i) => i.id === id);
    if (!it) return;
    pushUndo();
    const done = !it.done;
    await get().updateItem(id, { done, doneAt: done ? Date.now() : null });
  },

  async sweepDone() {
    pushUndo(t('toast_swept'));
    const now = Date.now();
    const doneIds = get()
      .items.filter((i) => i.done)
      .map((i) => i.id);
    await db.items.where('id').anyOf(doneIds).modify({ archivedAt: now });
    set({ items: get().items.filter((i) => !i.done) });
  },

  async deleteItem(id) {
    pushUndo(t('toast_deleted'));
    await db.items.delete(id);
    set({ items: get().items.filter((i) => i.id !== id), openItemId: get().openItemId === id ? null : get().openItemId });
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
    await db.categories.update(id, patch);
    set({ categories: get().categories.map((c) => (c.id === id ? { ...c, ...patch } : c)).filter((c) => !c.archived) });
  },

  setView(view) {
    persistView(view);
    set({ view });
  },
  setCardStyle(style) {
    persistCardStyle(style);
    set({ cardStyle: style });
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

  async applyMatrixDrop(dragId, flags, orderedIds) {
    pushUndo();
    const now = Date.now();
    const orderOf = new Map(orderedIds.map((id, i) => [id, (i + 1) * 1000]));
    await db.transaction('rw', db.items, async () => {
      await db.items.update(dragId, { urgent: flags.urgent, important: flags.important, updatedAt: now });
      for (const [id, ord] of orderOf) await db.items.update(id, { matrixOrder: ord });
    });
    set({
      items: get().items.map((i) => {
        const patch: Partial<Item> = {};
        if (i.id === dragId) Object.assign(patch, { urgent: flags.urgent, important: flags.important, updatedAt: now });
        if (orderOf.has(i.id)) patch.matrixOrder = orderOf.get(i.id);
        return Object.keys(patch).length ? { ...i, ...patch } : i;
      }),
    });
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
    } else if (parts[0] === 'cat') {
      await get().moveItemToCategory(dragId, parts[1]);
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
    const currentIds = new Set(get().items.map((i) => i.id));
    const snapIds = new Set(snapshot.map((i) => i.id));
    await db.transaction('rw', db.items, async () => {
      await db.items.bulkPut(snapshot);
      // items created after the snapshot get removed on undo
      const added = [...currentIds].filter((id) => !snapIds.has(id));
      if (added.length) await db.items.bulkDelete(added);
    });
    set({ undoStack: stack, items: snapshot, toast: null, openItemId: null });
  },

  clearToast() {
    set({ toast: null });
  },

  setSuggestionsOn(on) {
    localStorage.setItem('seder-suggestions', on ? 'on' : 'off');
    set({ suggestionsOn: on });
  },
  setLogbookOpen(open) {
    set({ logbookOpen: open });
  },

  async restoreItem(id) {
    const patch = { archivedAt: null, done: false, doneAt: null, updatedAt: Date.now() };
    await db.items.update(id, patch);
    const restored = await db.items.get(id);
    if (restored) set({ items: [...get().items, restored] });
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

/** Rule-based morning suggestion candidates (no AI): urgent, due soon, aged. */
export function morningCandidates(items: Item[]): Item[] {
  const soon = Date.now() + 2 * 86400000;
  return items.filter(
    (i) =>
      !i.done &&
      !i.today &&
      i.parentId === null &&
      (i.urgent === true || (i.due !== null && i.due < soon) || (i.nudge !== null && i.nudge < Date.now())),
  );
}
