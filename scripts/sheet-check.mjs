// REAL touch verification for the phone card sheet + card long-press
// (wiki/testing.md rules: CDP Input.dispatchTouchEvent, never synthetic
// Touch/PointerEvent constructors).
//
// Scenario 1: a TAP on a grid card's header opens the bottom action sheet;
//   picking a color swatch really changes the list's color (asserted in
//   IndexedDB); tapping the scrim closes the sheet.
// Scenario 2 (added with the long-press milestone): a LONG-PRESS on a card
//   header lifts the card - ghost shows the list name - carrying it onto
//   another card reorders the lists (asserted in IndexedDB).
//
// Usage: node scripts/sheet-check.mjs   (dev server on 5183)

import { launchChromium } from './browser.mjs';

const browser = await launchChromium();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.addInitScript(() => localStorage.setItem('seder-listview', 'bento'));
await page.goto('http://localhost:5183/?lang=he&theme=light&seed=fresh', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const fail = async (msg) => {
  console.error(`FAIL  ${msg}`);
  await browser.close();
  process.exit(1);
};
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
const tapAt = async (x, y) => {
  await touch('touchStart', [{ x, y, id: 1 }]);
  await page.waitForTimeout(60);
  await touch('touchEnd', []);
  await page.waitForTimeout(250);
};
const readCats = () =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('seder');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const cats = await new Promise((res, rej) => {
      const rq = db.transaction('categories').objectStore('categories').getAll();
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    db.close();
    return cats;
  });

// ---------- Scenario 1: tap header -> sheet -> color -> scrim ----------
const header = page.locator('.board-bento .category-card:not([data-system]) .category-card-header').first();
await header.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const hb = await header.boundingBox();
if (!hb) await fail('no grid card header on screen');
// tap the title area (the middle), away from the color dot on the start edge
await tapAt(hb.x + hb.width / 2, hb.y + hb.height / 2);
if ((await page.locator('.cardsheet').count()) === 0) await fail('header tap did not open the card sheet');

const catId = await page.evaluate(() => document.querySelector('.board-bento .category-card:not([data-system])').getAttribute('data-drop').slice(4));
const before = (await readCats()).find((c) => c.id === catId);
// pick a swatch that is not the current color
const swatch = page.locator(`.cardsheet .category-colorswatch[data-cat]:not([data-cat="${before.colorKey}"])`).first();
const wantKey = await swatch.getAttribute('data-cat');
const sb = await swatch.boundingBox();
await tapAt(sb.x + sb.width / 2, sb.y + sb.height / 2);
await page.waitForTimeout(300);
const after = (await readCats()).find((c) => c.id === catId);
if (after.colorKey !== wantKey) await fail(`swatch tap did not change the color (want ${wantKey}, got ${after.colorKey})`);

// scrim closes
const scrim = await page.locator('.cardsheet-scrim').boundingBox();
await tapAt(scrim.x + scrim.width / 2, scrim.y + 40);
if ((await page.locator('.cardsheet').count()) !== 0) await fail('scrim tap did not close the sheet');
console.log(`PASS  real CDP touch: header tap opened the sheet, color ${before.colorKey} -> ${wantKey} verified in IndexedDB, scrim closed it`);

// ---------- Scenario 2: long-press header lifts the card, drop reorders ----------
const cards = page.locator('.board-bento .category-card');
const n = await cards.count();
if (n < 2) await fail('need two cards for the reorder scenario');
const srcHeader = page.locator('.board-bento .category-card .category-card-header').first();
await srcHeader.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const shb = await srcHeader.boundingBox();
const srcId = await page.evaluate(() => document.querySelector('.board-bento .category-card').getAttribute('data-drop').slice(4));
// a second card that is on screen right now
const target = await page.evaluate((srcId) => {
  for (const card of document.querySelectorAll('.board-bento .category-card')) {
    const id = card.getAttribute('data-drop').slice(4);
    if (id === srcId) continue;
    const r = card.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return { id, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}, srcId);
if (!target) await fail('no second on-screen card to drop on');

const ordBefore = (await readCats()).sort((a, b) => a.order - b.order).map((c) => c.id);
const sx = shb.x + shb.width / 2;
const sy = shb.y + shb.height / 2;
await touch('touchStart', [{ x: sx, y: sy, id: 1 }]);
await page.waitForTimeout(450); // > 320ms arm
if ((await page.locator('.touchdrag-ghost').count()) === 0) {
  await touch('touchEnd', []);
  await fail('long-press did not lift the card (no ghost)');
}
const steps = 12;
for (let i = 1; i <= steps; i++) {
  await touch('touchMove', [{ x: sx + ((target.x - sx) * i) / steps, y: sy + ((target.y - sy) * i) / steps, id: 1 }]);
  await page.waitForTimeout(30);
}
await touch('touchEnd', []);
await page.waitForTimeout(500);
// no sheet may have opened from the long-press (tap and lift are distinct)
if ((await page.locator('.cardsheet').count()) !== 0) await fail('long-press wrongly opened the sheet');
const ordAfter = (await readCats()).sort((a, b) => a.order - b.order).map((c) => c.id);
if (ordAfter.join() === ordBefore.join()) await fail('card drop did not reorder the lists');
console.log(`PASS  real CDP touch: long-press lifted list ${srcId}, drop onto ${target.id} reordered (${ordBefore.length} lists) in IndexedDB`);

await browser.close();
