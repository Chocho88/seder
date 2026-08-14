// React-friendly i18n on top of the design-system dictionary approach.
// UI chrome strings only — user content is never translated, it renders with
// per-line direction via lib/rtl.ts.

import { useSyncExternalStore } from 'react';
import type { Lang } from './types';

const DICT: Record<string, { en: string; he: string }> = {
  app_title: { en: 'Seder', he: 'סדר' },
  view_today: { en: 'Today', he: 'היום' },
  view_board: { en: 'Board', he: 'לוח' },
  view_matrix: { en: 'Matrix', he: 'מטריצה' },
  view_all: { en: 'All', he: 'הכל' },
  pinned: { en: 'Pinned', he: 'מוצמדות' },
  inbox: { en: 'Inbox', he: 'נכנסות' },
  add_item: { en: 'Add item', he: 'פריט חדש' },
  add_category: { en: 'New list', he: 'רשימה חדשה' },
  capture_placeholder: { en: 'Add anything… (#list, ! today)', he: 'להוסיף כל דבר… (#רשימה, ! להיום)' },
  search_or_add: { en: 'Type to add or search…', he: 'הקלידו כדי להוסיף או לחפש…' },
  urgent: { en: 'Urgent', he: 'דחוף' },
  not_urgent: { en: 'Not urgent', he: 'לא דחוף' },
  important: { en: 'Important', he: 'חשוב' },
  not_important: { en: 'Not important', he: 'לא חשוב' },
  next_move: { en: 'Next move', he: 'הצעד הבא' },
  next_move_placeholder: { en: 'What is the next move?', he: 'מה הצעד הבא?' },
  state_do: { en: 'Do', he: 'לעשות' },
  state_wait: { en: 'Waiting', he: 'בהמתנה' },
  state_shape: { en: 'Shape', he: 'לחידוד' },
  waiting_for: { en: 'Waiting for', he: 'מחכה ל' },
  done_today: { en: 'done today', he: 'הושלמו היום' },
  sweep_done: { en: 'Clear done', he: 'לנקות שהושלמו' },
  today_empty: { en: 'Nothing planned yet. Pull tasks in from the board.', he: 'עוד לא תוכנן כלום. משכו משימות מהלוח.' },
  suggestions: { en: 'Morning suggestions', he: 'הצעות בוקר' },
  add_to_today: { en: 'Add to today', he: 'להוסיף להיום' },
  dismiss: { en: 'Dismiss', he: 'לא היום' },
  notes: { en: 'Notes', he: 'הערות' },
  sub_items: { en: 'Sub-items', he: 'תתי־משימות' },
  links: { en: 'Links', he: 'קישורים' },
  due: { en: 'Due', he: 'יעד' },
  nudge: { en: 'Nudge', he: 'תזכורת' },
  delete: { en: 'Delete', he: 'למחוק' },
  pin: { en: 'Pin', he: 'להצמיד' },
  unpin: { en: 'Unpin', he: 'לבטל הצמדה' },
  today_flag: { en: 'Today', he: 'היום' },
  style_mono: { en: 'Mono', he: 'מונו' },
  style_tint: { en: 'Tint', he: 'גוון' },
  style_header: { en: 'Header', he: 'כותרת' },
  settings: { en: 'Settings', he: 'הגדרות' },
  days_short: { en: 'd', he: 'י׳' },
  pool: { en: 'Pool', he: 'מאגר' },
  undo: { en: 'Undo', he: 'ביטול' },
  evening: { en: 'This Evening', he: 'הערב' },
  logbook: { en: 'Logbook', he: 'יומן' },
  logbook_empty: { en: 'Completed items you clear will rest here.', he: 'פריטים שהושלמו ונוקו ינוחו כאן.' },
  restore: { en: 'Restore', he: 'להחזיר' },
  theme: { en: 'Theme', he: 'תצוגה' },
  theme_light: { en: 'Light', he: 'בהיר' },
  theme_dark: { en: 'Dark', he: 'כהה' },
  theme_system: { en: 'Auto', he: 'אוטו' },
  export_data: { en: 'Export backup', he: 'גיבוי לקובץ' },
  import_data: { en: 'Import backup', he: 'שחזור מקובץ' },
  reset_layout: { en: 'Reset layout', he: 'איפוס פריסה' },
  search_placeholder: { en: 'Search…', he: 'חיפוש…' },
  toast_moved: { en: 'Moved', he: 'הועבר' },
  toast_deleted: { en: 'Deleted', he: 'נמחק' },
  toast_swept: { en: 'Done items cleared', he: 'הושלמו נוקו' },
  toast_list_deleted: { en: 'List deleted - items moved to Pool', he: 'הרשימה נמחקה - הפריטים עברו למאגר' },
  not_today: { en: 'Not today', he: 'לא היום' },
  move_to: { en: 'Move to', he: 'להעביר אל' },
  new_list_placeholder: { en: 'List name…', he: 'שם הרשימה…' },
  rename_hint: { en: 'Double-click to rename', he: 'לחיצה כפולה לשינוי שם' },
  pool_empty: { en: 'New captures land here', he: 'פריטים חדשים נוחתים כאן' },
  resize_hint: { en: 'Drag to resize · double-click to reset', he: 'גרירה לשינוי גודל · לחיצה כפולה לאיפוס' },
  custom_color: { en: 'Custom', he: 'מותאם' },
  card_style: { en: 'Card style', he: 'סגנון קלפים' },
  font_size: { en: 'Font size', he: 'גודל גופן' },
  colored_lists: { en: 'Colored lists', he: 'רשימות צבעוניות' },
  size_s: { en: 'S', he: 'ק' },
  size_m: { en: 'M', he: 'ב' },
  size_l: { en: 'L', he: 'ג' },
};

let currentLang: Lang = (localStorage.getItem('klod-lang') as Lang) || 'he';
const listeners = new Set<() => void>();

export function t(key: string): string {
  const e = DICT[key];
  if (!e) return key;
  return e[currentLang] ?? e.en;
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem('klod-lang', lang);
  const html = document.documentElement;
  html.setAttribute('lang', lang);
  html.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
  listeners.forEach((l) => l());
}

export function toggleLang(): Lang {
  setLang(currentLang === 'en' ? 'he' : 'en');
  return currentLang;
}

/** React hook: re-renders on language change. Returns [lang, t, isRTL]. */
export function useLang(): [Lang, typeof t, boolean] {
  const lang = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentLang,
  );
  return [lang, t, lang === 'he'];
}
