// Probe: what does the browser actually compute for the logbook title
// alignment in LTR vs RTL panels?

import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome' });

for (const lang of ['he', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://localhost:5183/?lang=${lang}&theme=light`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  // seed one archived row per script direction
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
    tx.objectStore('items').put(mk('English probe row'));
    tx.objectStore('items').put(mk('שורת בדיקה בעברית'));
    await new Promise((res) => (tx.oncomplete = res));
  });
  await page.click('.canvas-logbook-btn');
  await page.waitForTimeout(300);
  const report = await page.evaluate(() => {
    const html = document.documentElement;
    const out = { htmlDir: html.getAttribute('dir'), rows: [] };
    for (const el of document.querySelectorAll('.logbook-row-title')) {
      const cs = getComputedStyle(el);
      const row = el.parentElement;
      const rcs = getComputedStyle(row);
      out.rows.push({
        text: el.textContent.slice(0, 24),
        dirAttr: el.getAttribute('dir'),
        computedDirection: cs.direction,
        computedTextAlign: cs.textAlign,
        rowDirection: rcs.direction,
        rowTextAlign: rcs.textAlign,
        spanRect: { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width) },
      });
    }
    return out;
  });
  console.log(`--- lang=${lang} ---`);
  console.log(JSON.stringify(report, null, 1));
  await page.close();
}
await browser.close();
