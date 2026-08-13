// Screenshot the Logbook panel and the Settings popover for design review.
// Seeds a bilingual archive (Hebrew + English titles) so bidi alignment is
// actually exercised, then shoots he/light (the judged pair) plus en and
// dark variants for self-check.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5183';
mkdirSync('shots', { recursive: true });

const day = 86400000;

async function seedArchive(page) {
  await page.evaluate(async (day) => {
    const open = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('seder');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const idb = await open();
    const tx = idb.transaction(['items', 'categories'], 'readwrite');
    const cats = await new Promise((resolve) => {
      const r = tx.objectStore('categories').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    const cat = (name) => cats.find((c) => c.name === name)?.id ?? cats[0].id;
    const now = Date.now();
    const mk = (title, catName, ago) => ({
      id: crypto.randomUUID(),
      title,
      kind: 'task',
      categoryId: cat(catName),
      parentId: null,
      order: 0,
      nextMove: '',
      stateOverride: null,
      done: true,
      doneAt: now - ago,
      archivedAt: now - ago,
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
      createdAt: now - ago - 3 * day,
      updatedAt: now - ago,
    });
    const rows = [
      mk('לשלוח מסמכים לשגרירות', 'רילוקיישן', 2 * 3600e3),
      mk('Book flights to New York', 'רילוקיישן', 3 * 3600e3),
      mk('לקבוע תור לשיננית', 'כללי', 5 * 3600e3),
      mk('Update resume PDF', 'Sages', 7 * 3600e3),
      mk('Diplomas + English translation', 'רילוקיישן', day + 2 * 3600e3),
      mk('לשלם ארנונה', 'כללי', day + 4 * 3600e3),
      mk('לכתוב טיוטה ל-Value Doc', 'Sages', day + 6 * 3600e3),
      mk('Send POC summary to Danny', 'Sages', 3 * day + 2 * 3600e3),
      mk('לסגור ביטוח רפואי', 'רילוקיישן', 3 * day + 5 * 3600e3),
    ];
    const store = tx.objectStore('items');
    for (const r of rows) store.put(r);
    await new Promise((resolve) => (tx.oncomplete = resolve));
  }, day);
}

async function shoot(browser, { lang, theme, out, panel }) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  await page.goto(`${BASE}/?lang=${lang}&theme=${theme}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await seedArchive(page);
  if (panel === 'logbook') {
    await page.click('.canvas-logbook-btn');
  } else {
    await page.click('.settings button');
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  await page.close();
  console.log('wrote', out);
}

const browser = await chromium.launch({ channel: 'chrome' });
await shoot(browser, { lang: 'he', theme: 'light', panel: 'logbook', out: 'shots/g-panels.png' });
await shoot(browser, { lang: 'he', theme: 'light', panel: 'settings', out: 'shots/g-panels-settings.png' });
await shoot(browser, { lang: 'en', theme: 'light', panel: 'logbook', out: 'shots/g-panels-en.png' });
await shoot(browser, { lang: 'he', theme: 'dark', panel: 'logbook', out: 'shots/g-panels-dark.png' });
await shoot(browser, { lang: 'en', theme: 'dark', panel: 'settings', out: 'shots/g-panels-settings-en-dark.png' });
await browser.close();
