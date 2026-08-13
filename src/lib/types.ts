// Seder data model — "one entity, progressive depth".
// Everything is an Item. Depth (sub-items, notes, links, properties) exists
// only where the user added it.

export type ItemState = 'do' | 'wait' | 'shape';

export type ItemKind = 'task' | 'note';

export interface ItemLink {
  url: string;
  label?: string;
}

export interface Item {
  id: string;
  title: string;
  kind: ItemKind; // note = no checkbox, content only
  categoryId: string;
  parentId: string | null; // nesting: null = top level in its category
  order: number; // manual sort within siblings

  // The Next Move engine
  nextMove: string; // free natural-language phrase; '' = unset
  stateOverride: ItemState | null; // manual override when detection misreads
  // derived state lives in nextMove.ts, never stored

  done: boolean;
  doneAt: number | null; // epoch ms; done items linger until swept
  archivedAt: number | null; // swept items

  important: boolean | null; // null = unset (most items never set these)
  urgent: boolean | null;

  today: boolean;
  todaySince: number | null; // for rollover aging ("2d")
  evening?: boolean; // Things-style "This Evening": today's quieter second shelf
  pinned: boolean;
  matrixOrder?: number; // manual visual order inside a matrix quadrant

  due: number | null; // epoch ms, optional
  nudge: number | null; // for wait items: "check in on..."

  notes: string; // body text of the item (markdown-ish plain text)
  links: ItemLink[];
  source: { kind: string; ref: string } | null; // reserved: gmail/keep/obsidian/maps/monday
  tags: string[]; // free-form; verb chips live here as 'verb:<key>'

  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string; // user-facing, any language
  colorKey: CategoryColorKey;
  order: number;
  archived: boolean;
  system?: boolean; // the Pool: the basic intake list, undeletable, i18n-named
  // bento geometry - user-dragged size; unset = natural
  w?: number; // grid column span
  h?: number | null; // fixed pixel height (content scrolls); null/unset = natural
}

export type CategoryColorKey =
  | 'sage'
  | 'clay'
  | 'rose'
  | 'slate'
  | 'ochre'
  | 'plum'
  | 'teal'
  | 'coral'
  | 'mustard'
  | 'fog';

export const CATEGORY_COLOR_KEYS: CategoryColorKey[] = [
  'sage',
  'clay',
  'rose',
  'slate',
  'ochre',
  'plum',
  'teal',
  'coral',
  'mustard',
  'fog',
];

// UI-level types
export type ViewId = 'today' | 'board' | 'matrix' | 'all';
export type CardStyle = 'mono' | 'tint' | 'header'; // the decide-by-looking switcher
export type DetailMode = 'panel' | 'inline';
export type Lang = 'en' | 'he';
export type Theme = 'light' | 'dark';
