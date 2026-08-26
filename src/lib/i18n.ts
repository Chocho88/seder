// React-friendly i18n on top of the design-system dictionary approach.
// UI chrome strings only - user content is never translated, it renders with
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
  sections: { en: 'Sections', he: 'אזורים' },
  account: { en: 'Account', he: 'חשבון' },
  synced: { en: 'Syncing across your devices', he: 'מסתנכרן בין המכשירים שלך' },
  sync_now: { en: 'Sync now', he: 'לסנכרן עכשיו' },
  sign_out: { en: 'Sign out', he: 'להתנתק' },
  sign_in_google: { en: 'Continue with Google', he: 'להמשיך עם Google' },
  send_magic_link: { en: 'Email me a sign-in link', he: 'לשלוח לי קישור כניסה במייל' },
  email_placeholder: { en: 'you@example.com', he: 'you@example.com' },
  magic_sent: { en: 'Check your inbox - tap the link and you are in.', he: 'בדקו את המייל - לחיצה על הקישור ואתם בפנים.' },
  magic_error: { en: 'Could not send. Try again in a minute.', he: 'השליחה נכשלה. נסו שוב בעוד דקה.' },
  sign_in_hint: { en: 'Sign in to sync between your Mac and iPhone. Everything stays on this device until you do.', he: 'התחברות מסנכרנת בין המק לאייפון. עד אז הכל נשאר במכשיר הזה.' },
  evening_empty: { en: 'Drop a task here for tonight', he: 'גררו לכאן משימה להערב' },
  sections_hint: { en: 'Drag to reorder · toggle to show', he: 'גרירה לסידור · מתג להצגה' },
  section_date: { en: 'Date', he: 'תאריך' },
  section_suggestions: { en: 'Morning suggestions', he: 'הצעות בוקר' },
  section_pinned: { en: 'Pinned', he: 'מוצמדות' },
  section_matrix: { en: 'Matrix', he: 'מטריצה' },
  section_evening: { en: 'This Evening', he: 'הערב' },
  section_done: { en: 'Done today', he: 'הושלמו היום' },
  section_lists: { en: 'Lists', he: 'רשימות' },
  due_date: { en: 'Deadline', he: 'דדליין' },
  nudge_date: { en: 'Check in', he: 'תזכורת' },
  clear: { en: 'Clear', he: 'לנקות' },
  more_n: { en: 'more', he: 'עוד' },
  done_section: { en: 'Done', he: 'הושלמו' },
  search_notes_hint: { en: 'in notes', he: 'בהערות' },
  search_archived_hint: { en: 'archived', he: 'בארכיון' },
  card_style: { en: 'Card style', he: 'סגנון קלפים' },
  font_size: { en: 'Font size', he: 'גודל גופן' },
  colored_lists: { en: 'Colored lists', he: 'רשימות צבעוניות' },
  size_s: { en: 'S', he: 'ק' },
  size_m: { en: 'M', he: 'ב' },
  size_l: { en: 'L', he: 'ג' },
  // sharing (wiki/sharing.md)
  share_list: { en: 'Share list', he: 'לשתף רשימה' },
  shared_mark: { en: 'Shared list', he: 'רשימה משותפת' },
  share_email_placeholder: { en: 'Their email…', he: 'המייל שלהם…' },
  send_invite: { en: 'Send invite', he: 'לשלוח הזמנה' },
  toast_invite_sent: { en: 'Invite sent', he: 'ההזמנה נשלחה' },
  share_invited_to: { en: 'Invited', he: 'הוזמן' },
  shared_with: { en: 'Shared with', he: 'משותפת עם' },
  shared_by: { en: 'Shared by', he: 'משותפת מאת' },
  revoke_share: { en: 'Stop sharing', he: 'להפסיק את השיתוף' },
  leave_share: { en: 'Leave this list', he: 'לעזוב את הרשימה' },
  share_hint: { en: 'They will see and edit this list. Today and matrix stay personal.', he: 'הם יראו ויערכו את הרשימה. היום והמטריצה נשארים אישיים.' },
  share_signin_first: { en: 'Sign in to share lists', he: 'כדי לשתף צריך להתחבר' },
  share_bad_email: { en: 'That email does not look right', he: 'המייל הזה לא נראה תקין' },
  share_error: { en: 'Sharing failed. Try again.', he: 'השיתוף נכשל. נסו שוב.' },
  share_not_owner: { en: 'Only the list owner can share it', he: 'רק בעלת הרשימה יכולה לשתף' },
  invite_banner: { en: '{owner} shared "{list}" with you', he: '{owner} שיתפו איתך את "{list}"' },
  accept: { en: 'Accept', he: 'לקבל' },
  decline: { en: 'Decline', he: 'לא תודה' },
  toast_title_conflict: { en: 'Title changed on both sides - kept the newer one', he: 'הכותרת שונתה בשני הצדדים - נשמרה החדשה' },
  // sync visibility + Google sign-in
  google_not_ready: { en: 'Google sign-in is not switched on yet. Use the email link meanwhile.', he: 'התחברות עם Google עוד לא הופעלה. בינתיים אפשר להיכנס עם קישור במייל.' },
  or_email: { en: 'or with an email link', he: 'או עם קישור במייל' },
  sync_failed: { en: 'Sync failed - will keep retrying. Your changes are safe on this device.', he: 'הסנכרון נכשל - ננסה שוב. השינויים שמורים במכשיר הזה.' },
  sync_pending_n: { en: 'changes waiting to sync', he: 'שינויים ממתינים לסנכרון' },
  sync_all_clear: { en: 'Everything is synced', he: 'הכל מסונכרן' },
  last_synced: { en: 'Last synced', he: 'סונכרן לאחרונה' },
  never_synced: { en: 'Not synced yet on this device', he: 'עוד לא סונכרן במכשיר הזה' },
  // the Today shelf
  section_today: { en: 'Today', he: 'היום' },
  today_shelf_empty: { en: 'Drop a task here for today', he: 'גררו לכאן משימה להיום' },
  // sync diagnostics
  sharing_not_installed: { en: 'Sharing is not set up on the server yet (the SQL file was not run). Lists and tasks still sync.', he: 'השיתוף עוד לא הותקן בשרת (קובץ ה-SQL לא הורץ). רשימות ומשימות ממשיכות להסתנכרן.' },
  sync_error_detail: { en: 'Last error', he: 'שגיאה אחרונה' },
  // previous-account recovery
  recovery_found: { en: 'Found {n} tasks saved from a previous sign-in on this device', he: 'נמצאו {n} משימות שנשמרו מהתחברות קודמת במכשיר הזה' },
  recovery_restore: { en: 'Bring them into this account', he: 'להעביר אותן לחשבון הזה' },
  recovery_dismiss: { en: 'Not needed', he: 'אין צורך' },
  recovery_done: { en: 'Restored - syncing to your account', he: 'שוחזר - מסתנכרן לחשבון שלך' },
};

// The <html lang> attribute is the single source of truth (urlState applies
// ?lang= to it before React mounts); localStorage is only the memory.
const readLang = (): Lang => {
  const attr = document.documentElement.getAttribute('lang');
  if (attr === 'en' || attr === 'he') return attr;
  return (localStorage.getItem('klod-lang') as Lang) || 'he';
};
let currentLang: Lang = readLang();
const listeners = new Set<() => void>();

// If something else flips <html lang> (urlState, dev tools), follow it.
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    const next = readLang();
    if (next !== currentLang) {
      currentLang = next;
      listeners.forEach((l) => l());
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

export function t(key: string): string {
  const e = DICT[key];
  if (!e) return key;
  return e[currentLang] ?? e.en;
}

/** t() with {placeholder} substitution, for sentences that carry a name. */
export function tfmt(key: string, vars: Record<string, string>): string {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
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
