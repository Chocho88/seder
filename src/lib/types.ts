// Seder data model - "one entity, progressive depth".
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
  archivedAt: number | null;
  deletedAt?: number | null; // soft delete: archived AND marked deleted (Logbook shows it as such)

  important: boolean | null; // null = unset (most items never set these)
  urgent: boolean | null;

  today: boolean;
  todaySince: number | null; // for rollover aging ("2d")
  evening?: boolean; // Things-style "This Evening": today's quieter second shelf
  pinned: boolean;
  matrixOrder?: number; // manual visual order inside a matrix quadrant
  suggestSnooze?: number | null; // "not today": hides from suggestions until this time

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
  customColor?: string | null; // free-pick hex; overrides colorKey's hue when set
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

// Sharing: one list, exactly two accounts. The row lives on the server's
// shares table with real columns (RLS needs them); this is the client mirror.
export type ShareStatus = 'invited' | 'accepted' | 'declined' | 'revoked' | 'left';
export interface Share {
  id: string;
  listId: string;
  ownerId: string;
  ownerEmail: string;
  memberId: string | null; // bound when the invitee accepts
  memberEmail: string; // the invite address - how the invitee is found
  status: ShareStatus;
  createdAt: number;
  updatedAt: number;
}

// UI-level types
export type ViewId = 'today' | 'board' | 'matrix' | 'all';
export type CardStyle = 'mono' | 'tint' | 'header';

/** Canvas sections: each is a draggable, toggleable block. */
export type SectionId = 'date' | 'suggestions' | 'pinned' | 'matrix' | 'evening' | 'done' | 'lists';
export interface SectionPref {
  id: SectionId;
  on: boolean;
}
export const DEFAULT_SECTIONS: SectionPref[] = [
  { id: 'date', on: true },
  { id: 'suggestions', on: true },
  { id: 'matrix', on: true },
  { id: 'evening', on: true },
  { id: 'done', on: true },
  { id: 'pinned', on: true },
  { id: 'lists', on: true },
]; // the decide-by-looking switcher
export type DetailMode = 'panel' | 'inline';
export type Lang = 'en' | 'he';
export type Theme = 'light' | 'dark';
