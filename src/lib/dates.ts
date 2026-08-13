// Natural-language due dates for capture, EN + HE.
// Conservative: only whole-word tokens; the capture preview shows what was
// understood, so parsing stays transparent.

const DAY = 86400000;

const HE_WEEKDAYS: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};
const EN_WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function nextWeekday(from: Date, weekday: number): number {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  let diff = (weekday - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7; // "friday" said on a friday means next week
  return d.getTime() + diff * DAY;
}

export interface ParsedDate {
  due: number;
  token: string; // the matched phrase, for stripping + preview
}

export function parseDueDate(text: string, now = new Date()): ParsedDate | null {
  const base = new Date(now);
  base.setHours(9, 0, 0, 0);

  const fixed: [RegExp, () => number][] = [
    [/(^|\s)(today|היום)(?=\s|$)/i, () => base.getTime()],
    [/(^|\s)(tomorrow|מחר)(?=\s|$)/i, () => base.getTime() + DAY],
    [/(^|\s)(מחרתיים)(?=\s|$)/, () => base.getTime() + 2 * DAY],
    [/(^|\s)(next week|שבוע הבא)(?=\s|$)/i, () => nextWeekday(now, 0)],
  ];
  for (const [re, calc] of fixed) {
    const m = text.match(re);
    if (m) return { due: calc(), token: m[2] };
  }

  // weekdays: EN plain; HE with optional יום/ב prefixes ("ביום שישי", "בשישי", "שישי")
  const heDay = text.match(/(^|\s)(ב?יום )?(ב)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=\s|$)/);
  if (heDay) {
    const token = ((heDay[2] ?? '') + (heDay[3] ?? '') + heDay[4]).trim();
    return { due: nextWeekday(now, HE_WEEKDAYS[heDay[4]]), token };
  }
  const enDay = text.match(/(^|\s)(on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\s|$)/i);
  if (enDay) {
    return { due: nextWeekday(now, EN_WEEKDAYS[enDay[3].toLowerCase()]), token: ((enDay[2] ?? '') + enDay[3]).trim() };
  }
  return null;
}

export function formatDue(due: number, lang: 'en' | 'he'): string {
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(due));
}
