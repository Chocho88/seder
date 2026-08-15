// Geometry invariants: nothing inside a card may cross the card's frame -
// at rest, on hover, on every card width, both directions. Exit 1 on breach.
import { chromium } from 'playwright-core';

const URL = 'http://localhost:5183/';
const cases = [
  { name: 'desktop-he', vw: 1440, q: 'lang=he&theme=light&seed=fresh' },
  { name: 'desktop-en', vw: 1440, q: 'lang=en&theme=light&seed=fresh' },
  { name: 'narrow-he', vw: 1024, q: 'lang=he&theme=light&seed=fresh' },
  { name: 'phone-he', vw: 390, q: 'lang=he&theme=light&seed=fresh', mobile: true },
];

const b = await chromium.launch({ channel: 'chrome', headless: true });
let breaches = 0;
for (const c of cases) {
  const ctx = await b.newContext({ viewport: { width: c.vw, height: 900 }, hasTouch: !!c.mobile, isMobile: !!c.mobile });
  const p = await ctx.newPage();
  await p.goto(`${URL}?${c.q}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);

  // shrink one card to a narrow bento width to stress the row layout (desktop only)
  if (!c.mobile) {
    await p.evaluate(() => {
      const item = document.querySelector('.bento-item');
      if (item) item.style.gridColumn = 'span 1';
    });
    await p.waitForTimeout(200);
  }

  const rows = p.locator('.category-card .item-row');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    if (!c.mobile) await row.hover();
    await p.waitForTimeout(30);
    const bad = await row.evaluate((el) => {
      const card = el.closest('.category-card');
      const cr = card.getBoundingClientRect();
      const out = [];
      el.querySelectorAll('*').forEach((ch) => {
        const cs = getComputedStyle(ch);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
        const r = ch.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.left < cr.left - 0.5 || r.right > cr.right + 0.5) out.push(`${(ch.className && ch.className.baseVal !== undefined ? ch.className.baseVal : ch.className) || ch.tagName}:${Math.round(r.left)}..${Math.round(r.right)} vs card ${Math.round(cr.left)}..${Math.round(cr.right)}`);
      });
      // title/actions overlap
      const t = el.querySelector('.item-title')?.getBoundingClientRect();
      const a = el.querySelector('.item-actions');
      if (t && a && getComputedStyle(a).opacity !== '0') {
        const ar = a.getBoundingClientRect();
        if (ar.width > 0 && !(ar.right <= t.left || ar.left >= t.right)) out.push(`actions overlap title (${Math.round(ar.left)}..${Math.round(ar.right)} vs ${Math.round(t.left)}..${Math.round(t.right)})`);
      }
      return out;
    });
    if (bad.length) { breaches++; console.log(`[${c.name}] row ${i}:`, bad.join(' | ')); }
  }
  // page-level: no horizontal scroll
  const hs = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (hs) { breaches++; console.log(`[${c.name}] horizontal page overflow`); }
  console.log(`[${c.name}] ${n} rows checked`);
  await ctx.close();
}
await b.close();
if (breaches) { console.log(`\n${breaches} geometry breach(es)`); process.exit(1); }
console.log('\nall geometry invariants hold');
