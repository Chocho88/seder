// REAL touch verification (wiki/testing.md rules): Chromium with an iPhone
// profile, touches dispatched through CDP Input.dispatchTouchEvent - the
// path that goes through gesture arbitration - never synthetic PointerEvent
// constructors. Targets are scrolled on screen and sanity-checked with
// elementFromPoint before any touch lands.
//
// Scenario: long-press lifts a row, the finger carries it onto ANOTHER list
// card (the drop key the sharing milestone cares about - dropping into a
// shared list uses the same 'cat:<id>' path), drop, then the move is
// asserted in IndexedDB - not in the DOM, in the working copy.
//
// Usage: node scripts/touch-check.mjs   (dev server on 5183)

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
await page.goto('http://localhost:5183/?lang=he&theme=light&seed=fresh', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const fail = async (msg) => {
  console.error(`FAIL  ${msg}`);
  await browser.close();
  process.exit(1);
};

// source: the first row of the first list card; target: the NEXT list card
const source = page.locator('.category-card .card-slot .item-row').first();
await source.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
const src = await source.boundingBox();
if (!src) await fail('no source row');
const title = (await source.locator('.item-title').first().textContent())?.trim();

// find a different card that is ALSO on screen right now
const target = await page.evaluate(({ sx, sy }) => {
  const srcCard = document.elementFromPoint(sx, sy)?.closest('.category-card');
  for (const card of document.querySelectorAll('.category-card')) {
    if (card === srcCard) continue;
    const r = card.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight && r.height > 60) {
      const body = card.querySelector('.category-card-body');
      const br = (body ?? card).getBoundingClientRect();
      return { key: card.getAttribute('data-drop'), x: br.left + br.width / 2, y: Math.min(br.top + 40, br.bottom - 8) };
    }
  }
  return null;
}, { sx: src.x + src.width / 2, sy: src.y + src.height / 2 });
if (!target?.key?.startsWith('cat:')) await fail(`no on-screen target card (got ${target?.key})`);
const targetCatId = target.key.slice(4);

// sanity: the touch point really hits the row (off-screen touches hit <html>)
const hit = await page.evaluate(
  ({ x, y }) => document.elementFromPoint(x, y)?.closest('.item-row') !== null,
  { x: src.x + src.width / 2, y: src.y + src.height / 2 },
);
if (!hit) await fail('source row is not under the touch point');

const sx = src.x + src.width / 2;
const sy = src.y + src.height / 2;

// --- the real gesture, via CDP ---
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

await touch('touchStart', [{ x: sx, y: sy, id: 1 }]);
await page.waitForTimeout(450); // > the 320ms long-press arm

// the lift must be visible: the drag ghost exists
const ghost = await page.locator('.touchdrag-ghost').count();
if (!ghost) {
  await touch('touchEnd', []);
  await fail('long-press did not lift the row (no drag ghost)');
}

// carry the finger to the target card in steps
const steps = 12;
for (let i = 1; i <= steps; i++) {
  const x = sx + ((target.x - sx) * i) / steps;
  const y = sy + ((target.y - sy) * i) / steps;
  await touch('touchMove', [{ x, y, id: 1 }]);
  await page.waitForTimeout(30);
}
// the card under the finger must light up as the drop target
const lit = await page.evaluate(() => document.querySelector('.category-card.drag-over') !== null);
await touch('touchEnd', []);
await page.waitForTimeout(500);

// --- assert in IndexedDB (the working copy), not the DOM ---
const moved = await page.evaluate(
  async ({ title, targetCatId }) => {
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('seder');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const items = await new Promise((res, rej) => {
      const rq = db.transaction('items').objectStore('items').getAll();
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    db.close();
    const it = items.find((i) => i.title === title);
    return { found: !!it, cat: it?.categoryId, want: targetCatId };
  },
  { title, targetCatId },
);

if (!moved.found) await fail(`item "${title}" not found in IndexedDB`);
if (moved.cat !== moved.want) await fail(`item "${title}" is in ${moved.cat}, expected ${moved.want}`);
if (!lit) console.log('note: drop target highlight was not observed mid-drag (drop still landed)');
console.log(`PASS  real CDP touch: long-pressed "${title}", carried it onto card ${targetCatId}, drop verified in IndexedDB`);
await browser.close();
