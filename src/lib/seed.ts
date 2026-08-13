// Demo/seed data - the user's real whiteboard + Keep content, so screenshots
// and gauntlet reviews judge the app on real life, not lorem ipsum.

import { db, uid } from './db';
import type { Category, Item } from './types';

const now = Date.now();
const day = 86400000;

function item(partial: Partial<Item> & Pick<Item, 'title' | 'categoryId'>): Item {
  return {
    id: uid(),
    kind: 'task',
    parentId: null,
    order: 0,
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
    createdAt: now - 7 * day,
    updatedAt: now - day,
    ...partial,
  };
}

export async function seedIfEmpty(force = false): Promise<void> {
  const count = await db.categories.count();
  if (count > 0 && !force) return;
  await db.transaction('rw', db.items, db.categories, async () => {
    await db.items.clear();
    await db.categories.clear();

    const sages: Category = { id: uid(), name: 'Sages', colorKey: 'sage', order: 0, archived: false };
    const reloc: Category = { id: uid(), name: 'רילוקיישן', colorKey: 'slate', order: 1, archived: false };
    const general: Category = { id: uid(), name: 'כללי', colorKey: 'clay', order: 2, archived: false };
    await db.categories.bulkAdd([sages, reloc, general]);

    const visa = item({
      title: 'VISA E-2',
      categoryId: reloc.id,
      nextMove: 'לאסוף מסמכים לשגרירות',
      important: true,
      urgent: true,
      today: true,
      todaySince: now - 2 * day,
      pinned: true,
      order: 0,
    });

    const items: Item[] = [
      // --- Sages ---
      item({ title: 'לאסוף שאלות מחוקרים', categoryId: sages.id, important: true, urgent: true, today: true, todaySince: now, order: 0 }),
      item({ title: 'לבנות POC קבוצת ווצאפ', categoryId: sages.id, important: true, urgent: true, order: 1 }),
      item({
        title: 'Ku Domains - Value Doc',
        categoryId: sages.id,
        nextMove: 'לכתוב טיוטה ראשונה',
        important: true,
        order: 2,
        notes: 'Raw ↔ Processed. Data | Information | Knowledge | Wisdom.',
      }),
      item({ title: 'DG - Value Doc', categoryId: sages.id, important: true, order: 3 }),
      item({ title: 'AI Tools allocation', categoryId: sages.id, order: 4 }),
      item({
        title: 'Kahneman - Thinking Fast and Slow',
        categoryId: sages.id,
        nextMove: 'לקרוא את הפרק על היוריסטיקות',
        order: 5,
        tags: ['verb:read'],
      }),

      // --- רילוקיישן ---
      visa,
      item({ title: 'Personal Questionnaire', categoryId: reloc.id, parentId: visa.id, order: 0 }),
      item({ title: 'Diplomas + English translation', categoryId: reloc.id, parentId: visa.id, order: 1 }),
      item({ title: 'US Job Description (from Sages)', categoryId: reloc.id, parentId: visa.id, nextMove: 'מחכה לניסוח מעודכן מהחברה', order: 2 }),
      item({
        title: 'לסגור ביטוח רפואי',
        categoryId: reloc.id,
        important: true,
        urgent: true,
        today: true,
        todaySince: now,
        order: 1,
        notes: 'להשוות בין שלושה מסלולים. חשוב כיסוי שיניים.',
      }),
      item({
        title: 'לסגור חוזה עם סטורמי',
        categoryId: reloc.id,
        nextMove: 'מחכה לתשובה מסטורמי על הסעיף האחרון',
        nudge: now + 2 * day,
        important: true,
        order: 2,
      }),
      item({ title: 'ראיון בשגרירות', categoryId: reloc.id, nextMove: 'לקבוע תאריך לראיון', urgent: true, order: 3 }),
      item({ title: 'לסגור עוסק זעיר', categoryId: reloc.id, order: 4 }),
      item({
        title: 'רהיטים - מחירים',
        categoryId: reloc.id,
        kind: 'note',
        order: 5,
        notes: 'מקרר 1100\nמכונת כביסה\nספה 4300\nבסיס מיטה ומזרון 2250\nכוורת 200',
      }),

      // --- כללי ---
      item({ title: 'לקבוע תור לשיננית', categoryId: general.id, today: true, todaySince: now - 4 * day, order: 0 }),
      item({ title: 'סופ״ש עם אבירן', categoryId: general.id, nextMove: 'לבחור סופ״ש פנוי ביומן', order: 1 }),
      item({ title: 'סשן מוזיקה עם יותם', categoryId: general.id, nextMove: 'מחכה ליותם שיחזור מהמילואים', order: 2 }),
      item({
        title: 'New York gifts',
        categoryId: general.id,
        nextMove: 'לקנות מתנות: שירה, עמרי, עדי',
        order: 3,
        notes: 'שירה - תכשיט יהלום קטן\nעמרי - בגד\nיותם - כובע\nאבא ואמא - ציוד למוזיקה',
      }),
      item({ title: 'מחשבות על ניו יורק', categoryId: general.id, kind: 'note', order: 4, notes: 'נראה שבלי לדעת כל החיים אהבתי את ניו יורק והיא עיצבה לי את הטעם בלי להכיר אותי.' }),
    ];

    // fix parent linkage for visa children (they were created before visa id existed in db)
    await db.items.bulkAdd(items);
  });
}
