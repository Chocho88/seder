// The Next Move engine.
// One natural-language phrase → derived state (do / wait / shape) + verb chip.
// No status dropdowns anywhere: state is a shadow of how the phrase is written.

import type { Item, ItemState } from './types';

// --- Waiting language (EN + HE) ---
const WAIT_PATTERNS: RegExp[] = [
  /^\s*(waiting|wait|blocked|pending|on hold)\b/i,
  /^\s*(מחכה|ממתין|ממתינה|מחכים|תקוע|תקועה)\b/,
  /^\s*עד ש/,
  /^\s*(until|after)\b/i,
];

// --- Canonical verb chips ---
// key → icon name in the design-system sprite (or closest available)
export interface VerbDef {
  key: string;
  icon: string; // icons.svg#icon-<name>
  en: string[];
  he: string[]; // matched with or without the ל infinitive prefix
}

export const VERBS: VerbDef[] = [
  { key: 'send',     icon: 'send',      en: ['send', 'submit', 'share'], he: ['לשלוח', 'לשתף', 'להגיש'] },
  { key: 'buy',      icon: 'download',  en: ['buy', 'order', 'purchase'], he: ['לקנות', 'להזמין'] },
  { key: 'read',     icon: 'eye',       en: ['read', 'review', 'go over'], he: ['לקרוא', 'לעבור על'] },
  { key: 'respond',  icon: 'arrow-left',en: ['respond', 'reply', 'answer'], he: ['לענות', 'להגיב'] },
  { key: 'choose',   icon: 'check',     en: ['choose', 'pick', 'decide'], he: ['לבחור', 'להחליט'] },
  { key: 'go',       icon: 'external',  en: ['go to', 'go', 'visit', 'attend'], he: ['ללכת', 'להגיע', 'לגשת'] },
  { key: 'call',     icon: 'mic',       en: ['call', 'phone'], he: ['להתקשר', 'לחייג'] },
  { key: 'close',    icon: 'check',     en: ['close', 'finalize', 'sign'], he: ['לסגור', 'לחתום'] },
  { key: 'schedule', icon: 'plus',      en: ['schedule', 'book', 'set'], he: ['לקבוע', 'לתאם'] },
  { key: 'build',    icon: 'edit',      en: ['build', 'create', 'make'], he: ['לבנות', 'ליצור', 'להכין'] },
  { key: 'collect',  icon: 'download',  en: ['collect', 'gather'], he: ['לאסוף', 'לרכז'] },
  { key: 'write',    icon: 'edit',      en: ['write', 'draft'], he: ['לכתוב', 'לנסח'] },
  { key: 'pay',      icon: 'copy',      en: ['pay', 'transfer'], he: ['לשלם', 'להעביר'] },
  { key: 'fix',      icon: 'settings',  en: ['fix', 'repair', 'solve'], he: ['לתקן', 'לפתור'] },
  { key: 'interview',icon: 'user',      en: ['interview', 'meet'], he: ['לראיין', 'להיפגש', 'ראיון'] },
];

// Generic Hebrew infinitive (ל + verb) — catches action-phrasing even when
// the verb isn't in our canonical table.
const HE_INFINITIVE = /^\s*ל[א-ת]{2,}/;
// Generic English imperative: starts with a plain word (not waiting-language)
const EN_IMPERATIVE = /^\s*[A-Za-z]+/;

export interface MoveAnalysis {
  state: ItemState;
  verb: string | null; // canonical verb key, if recognized
  waitingFor: string | null; // the phrase after the waiting marker
}

export function analyzeMove(nextMove: string): MoveAnalysis {
  const text = (nextMove || '').trim();
  if (!text) return { state: 'shape', verb: null, waitingFor: null };

  for (const p of WAIT_PATTERNS) {
    const m = text.match(p);
    if (m) {
      const rest = text.slice(m.index! + m[0].length).replace(/^\s*(for|ל|-|—|:)\s*/i, '').trim();
      return { state: 'wait', verb: null, waitingFor: rest || null };
    }
  }

  const lower = text.toLowerCase();
  for (const v of VERBS) {
    for (const en of v.en) {
      if (lower.startsWith(en + ' ') || lower === en) return { state: 'do', verb: v.key, waitingFor: null };
    }
    for (const he of v.he) {
      if (text.startsWith(he)) return { state: 'do', verb: v.key, waitingFor: null };
    }
  }

  if (HE_INFINITIVE.test(text) || EN_IMPERATIVE.test(text)) {
    return { state: 'do', verb: null, waitingFor: null };
  }
  return { state: 'do', verb: null, waitingFor: null };
}

/** Effective state, honoring the manual override. */
export function itemState(item: Pick<Item, 'nextMove' | 'stateOverride' | 'title'>): ItemState {
  if (item.stateOverride) return item.stateOverride;
  // An item with no explicit next move derives from its title when the title
  // itself is action-phrased (how the user actually writes: "לסגור ביטוח רפואי")
  const source = item.nextMove.trim() || item.title.trim();
  if (!source) return 'shape';
  // Title-only items: action-phrased title = do; otherwise shape
  if (!item.nextMove.trim()) {
    const a = analyzeMove(source);
    if (a.state === 'wait') return 'wait';
    const actionish = HE_INFINITIVE.test(source) || startsWithKnownVerb(source);
    return actionish ? 'do' : 'shape';
  }
  return analyzeMove(item.nextMove).state;
}

function startsWithKnownVerb(text: string): boolean {
  const lower = text.toLowerCase();
  return VERBS.some(
    (v) =>
      v.en.some((en) => lower.startsWith(en + ' ') || lower === en) ||
      v.he.some((he) => text.startsWith(he)),
  );
}

/** Verb chip for an item (from nextMove, falling back to title). */
export function itemVerb(item: Pick<Item, 'nextMove' | 'title'>): VerbDef | null {
  const a = analyzeMove(item.nextMove.trim() || item.title);
  if (!a.verb) return null;
  return VERBS.find((v) => v.key === a.verb) ?? null;
}

/** Who/what a wait item is stuck on, if stated. */
export function itemWaitingFor(item: Pick<Item, 'nextMove' | 'title'>): string | null {
  const a = analyzeMove(item.nextMove.trim() || item.title);
  return a.state === 'wait' ? a.waitingFor : null;
}
