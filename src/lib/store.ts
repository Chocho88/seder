// Zustand store — THE contract between all components.
// Components read state + call actions; persistence goes through Dexie here.

import { create } from 'zustand';
import { db, uid } from './db';
import { seedIfEmpty } from './seed';
import { t } from './i18n';
import { onRemote } from './sync';
import { DEFAULT_SECTIONS, type CardStyle, type Category, type DetailMode, type Item, type SectionId, type SectionPref, type ViewId } from './types';

const SECTIONS_KEY = 'seder-sections';
function loadSections(): SectionPref[] {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return DEFAULT_SECTIONS;
    const saved = JSON.parse(raw) as SectionPref[];
    // merge: keep saved order, append any new default sections
    const known = new Set(saved.map((s) => s.id));
    return [...saved.filter((s) => DEFAULT_SECTIONS.some((d) => d.id === s.id)), ...DEFAULT_SECTIONS.filter((d) => !known.has(d.id))];
  } catch {
    return DEFAULT_SECTIONS;
  }
}
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

  // Undo: full state snapshots (items + categories), restored by Cmd+Z or toast
  undoStack: { items: Item[]; categories: Category[] }[];
  toast: { label: string; at: number } | null;

  suggestionsOn: boolean; // settings: morning suggestions visibility
  logbookOpen: boolean;

  // Canvas sections: order + visibility, user-arranged, persisted locally
  sections: SectionPref[];
  dragSectionId: SectionId | null;

  // --- lifecycle ---
  init(): Promise<void>;

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
  /** Reorder a top-level item inside a category (drop before target). */
  reorderInCategory(dragId: string, targetId: string): Promise<void>;
  /** Delete a list; its items flow to the Pool (undoable). */
  deleteCategory(id: string): Promise<void>;
  /** Central drop executor - shared by mouse drops and touch drops. */
  dropOn(key: string): Promise<void>;

  undo(): Promise<void>;
  clearToast(): void;

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

async function loadAll(): Promise<{ items: Item[]; categories: Category[] }> {
  const [items, categories] = await Promise.all([
    db.items.filter((i) => i.archivedAt === null).toArray(),
    db.categories.filter((c) => !c.archived).sortBy('order'),
  ]);
  items.sort((a, b) => a.order - b.order);
  return { items, categories };
}

export const useSeder = create<SederState>((set, get) => {
  /** Snapshot current state for undo (small dataset - full copy is fine). */
  const pushUndo = (toastLabel?: string) => {
    const snap = {
      items: get().items.map((i) => ({ ...i })),
      categories: get().categories.map((c) => ({ ...c })),
    };
    const stack = [...get().undoStack, snap].slice(-20);
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
  sections: loadSections(),
  dragSectionId: null,

  async init() {
    // Demo seed only in dev (or on explicit ?seed=fresh). In production a
    // fresh device starts empty and fills from sync after sign-in.
    if (import.meta.env.DEV || wantsFreshSeed()) await seedIfEmpty(wantsFreshSeed());

    // The Pool: the basic intake list. Its id is deterministic PER USER
    // ('pool-<userId>') so every device of one account agrees on the same
    // row and different accounts never collide on the shared table. Before
    // sign-in it's a local id; on first sign-in it's renamed to the user's.
    await ensurePool();

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

    // remote changes (other device) land in IndexedDB; reload the live state
    onRemote(() => {
      void loadAll().then((fresh) => set({ items: fresh.items, categories: fresh.categories }));
    });
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
    await db.transaction('rw', db.items, db.categories, async () => {
      await db.items.bulkPut(snapshot.items);
      await db.categories.bulkPut(snapshot.categories);
      // records created after the snapshot get removed on undo
      const addedItems = [...curItemIds].filter((id) => !snapItemIds.has(id));
      if (addedItems.length) await db.items.bulkDelete(addedItems);
      const addedCats = [...curCatIds].filter((id) => !snapCatIds.has(id));
      if (addedCats.length) await db.categories.bulkDelete(addedCats);
    });
    set({
      undoStack: stack,
      items: snapshot.items,
      categories: snapshot.categories,
      toast: null,
      openItemId: null,
    });
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
    const live = new Set(get().items.map((i) => i.id));
    set({ items: [...get().items, ...restored.filter((i) => !live.has(i.id))] });
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
