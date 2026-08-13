// Probe: English query typed into the RTL logbook search (and Hebrew into
// LTR) - the input's own dir flips, alignment and icon clearance must hold.

import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome' });
for (const [lang, query, out] of [
  ['he', 'Value', 'shots/probe-search-rtl.png'],
  ['en', 'ארנונה', 'shots/probe-search-ltr.png'],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:5183/?lang=${lang}&theme=light`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const open = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('seder');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const idb = await open();
    const tx = idb.transaction(['items', 'categories'], 'readwrite');
    const cats = await new Promise((res) => {
      const r = tx.objectStore('categories').getAll();
      r.onsuccess = () => res(r.result);
    });
    const now = Date.now();
    const mk = (title) => ({
      id: crypto.randomUUID(), title, kind: 'task', categoryId: cats[0].id, parentId: null,
      order: 0, nextMove: '', stateOverride: null, done: true, doneAt: now, archivedAt: now,
      important: null, urgent: null, today: false, todaySince: null, pinned: false,
      due: null, nudge: null, notes: '', links: [], source: null, tags: [],
      createdAt: now, updatedAt: now,
    });
    tx.objectStore('items').put(mk('לכתוב טיוטה ל-Value Doc'));
    tx.objectStore('items').put(mk('לשלם ארנונה'));
    await new Promise((res) => (tx.oncomplete = res));
  });
  await page.click('.canvas-logbook-btn');
  await page.waitForTimeout(200);
  await page.fill('.logbook-search', query);
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => {
    const r = document.querySelector('.logbook-panel').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 340) };
  });
  await page.screenshot({ path: out, clip });
  console.log('wrote', out);
  await page.close();
}
await browser.close();
