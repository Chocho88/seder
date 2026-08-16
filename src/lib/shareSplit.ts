// The heart of the sharing model: which Item fields are SHARED (one truth
// both owners keep) and which are PERSONAL (my triage is mine). Pure module,
// no browser APIs - scripts/split-check.mjs exercises it directly in node.
//
// Shared:   what the task IS - title, notes, structure, done, dates.
// Personal: where the task sits in MY day - today, matrix flags, pin, order.
// nudge stays shared: it belongs to the task's waiting state, next to due.

import type { Item } from './types';

/** Personal triage overlay - one row per (user, item) in item_prefs. */
export interface ItemPrefs {
  id: string; // `${userId}:${itemId}` - globally unique on the shared table
  itemId: string;
  today: boolean;
  todaySince: number | null;
  evening?: boolean;
  pinned: boolean;
  important: boolean | null;
  urgent: boolean | null;
  matrixOrder?: number;
  suggestSnooze?: number | null;
  updatedAt: number;
}

export const PERSONAL_FIELDS = [
  'today',
  'todaySince',
  'evening',
  'pinned',
  'important',
  'urgent',
  'matrixOrder',
  'suggestSnooze',
] as const;

export type PersonalField = (typeof PERSONAL_FIELDS)[number];

const personalSet: ReadonlySet<string> = new Set(PERSONAL_FIELDS);

export function isPersonalField(key: string): key is PersonalField {
  return personalSet.has(key);
}

export const prefsId = (userId: string, itemId: string): string => `${userId}:${itemId}`;

/** Neutral overlay for an item nobody triaged yet. */
export function emptyPrefs(userId: string, itemId: string, at: number): ItemPrefs {
  return {
    id: prefsId(userId, itemId),
    itemId,
    today: false,
    todaySince: null,
    evening: false,
    pinned: false,
    important: null,
    urgent: null,
    matrixOrder: undefined,
    suggestSnooze: null,
    updatedAt: at,
  };
}

/** Split an updateItem patch into its shared half and its personal half. */
export function splitPatch(patch: Partial<Item>): {
  shared: Partial<Item>;
  personal: Partial<ItemPrefs>;
} {
  const shared: Record<string, unknown> = {};
  const personal: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (isPersonalField(key)) personal[key] = value;
    else shared[key] = value;
  }
  return { shared: shared as Partial<Item>, personal: personal as Partial<ItemPrefs> };
}

/** Lift the personal fields OFF an item into a prefs row (db migration and
    first-write). The item keeps its values too - other devices that have not
    upgraded still read them; composeItem prefers the overlay. */
export function prefsFromItem(userId: string, item: Item): ItemPrefs {
  return {
    id: prefsId(userId, item.id),
    itemId: item.id,
    today: item.today,
    todaySince: item.todaySince,
    evening: item.evening ?? false,
    pinned: item.pinned,
    important: item.important,
    urgent: item.urgent,
    matrixOrder: item.matrixOrder,
    suggestSnooze: item.suggestSnooze ?? null,
    updatedAt: item.updatedAt,
  };
}

/** The item every component sees: shared truth + MY overlay. Without a
    prefs row the item's own (legacy) fields stand - so old devices and
    not-yet-migrated rows keep working. */
export function composeItem(item: Item, prefs: ItemPrefs | undefined): Item {
  if (!prefs) return item;
  return {
    ...item,
    today: prefs.today,
    todaySince: prefs.todaySince,
    evening: prefs.evening,
    pinned: prefs.pinned,
    important: prefs.important,
    urgent: prefs.urgent,
    matrixOrder: prefs.matrixOrder,
    suggestSnooze: prefs.suggestSnooze,
  };
}

/** Strip personal fields to NEUTRAL values for the row that goes to the
    server's items table - my triage never travels on the shared row. */
export function neutralizeShared(item: Item): Item {
  return {
    ...item,
    today: false,
    todaySince: null,
    evening: false,
    pinned: false,
    important: null,
    urgent: null,
    matrixOrder: undefined,
    suggestSnooze: null,
  };
}
