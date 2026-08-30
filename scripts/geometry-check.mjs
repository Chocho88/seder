// Geometry invariants: nothing inside a card may cross the card's frame -
// at rest, on hover, on every card width, both directions. Exit 1 on breach.
import { launchChromium } from './browser.mjs';

const URL = 'http://localhost:5183/';
const cases = [
  { name: 'desktop-he', vw: 1440, q: 'lang=he&theme=light&seed=fresh' },
  { name: 'desktop-en', vw: 1440, q: 'lang=en&theme=light&seed=fresh' },
  { name: 'narrow-he', vw: 1024, q: 'lang=he&theme=light&seed=fresh' },
  { name: 'phone-he', vw: 390, q: 'lang=he&theme=light&seed=fresh', mobile: true },
  // lists view switcher: same card, different container - same invariants
  { name: 'gallery-desktop-he', vw: 1440, q: 'lang=he&theme=light&seed=fresh&listview=gallery' },
  { name: 'carousel-desktop-he', vw: 1440, q: 'lang=he&theme=light&seed=fresh&listview=carousel' },
  { name: 'gallery-phone-he', vw: 390, q: 'lang=he&theme=light&seed=fresh&listview=gallery', mobile: true },
  { name: 'carousel-phone-he', vw: 390, q: 'lang=he&theme=light&seed=fresh&listview=carousel', mobile: true },
];

const b = await launchChromium();
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
  // card headers: hover to reveal the tools (share / sweep / delete) and
  // make sure nothing in the header crosses the card frame
  const headers = p.locator('.category-card .category-card-header');
  const hn = await headers.count();
  for (let i = 0; i < hn; i++) {
    const h = headers.nth(i);
    if (!c.mobile) await h.hover();
    await p.waitForTimeout(30);
    const bad = await h.evaluate((el) => {
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
      return out;
    });
    if (bad.length) { breaches++; console.log(`[${c.name}] header ${i}:`, bad.join(' | ')); }
  }

  // the share popover (a portal) must sit fully inside the viewport
  const shareBtn = p.locator('.category-card:not([data-system]) .category-card-tools .item-action').first();
  if (await shareBtn.count()) {
    const header = p.locator('.category-card:not([data-system]) .category-card-header').first();
    if (!c.mobile) await header.hover();
    const toolsVisible = await shareBtn.isVisible();
    if (c.mobile && !toolsVisible) {
      // phone grids: the header tools are gone by design - a header tap
      // opens the card action sheet, and share lives inside it
      await header.tap();
      await p.waitForTimeout(200);
      const sheet = p.locator('.cardsheet');
      if ((await sheet.count()) === 0) { breaches++; console.log(`[${c.name}] card sheet did not open`); }
      else {
        const r = await sheet.boundingBox();
        if (r && (r.x < -0.5 || r.x + r.width > c.vw + 0.5)) { breaches++; console.log(`[${c.name}] card sheet crosses the viewport: ${Math.round(r.x)}..${Math.round(r.x + r.width)} vs 0..${c.vw}`); }
        const shareRow = sheet.locator('.cardsheet-row', { hasText: undefined }).nth(1); // rename, then share
        await shareRow.tap().catch(() => {});
        await p.waitForTimeout(150);
        if ((await p.locator('.cardsheet-share').count()) === 0) { breaches++; console.log(`[${c.name}] sheet share flow did not open`); }
        await p.locator('.cardsheet-scrim').click({ force: true }).catch(() => {});
        await p.waitForTimeout(100);
      }
    } else {
      await shareBtn.click({ force: c.mobile === true });
      await p.waitForTimeout(100);
      const pop = p.locator('.share-popover');
      if (await pop.count()) {
        const r = await pop.boundingBox();
        const vw = c.vw;
        if (r && (r.x < 0 || r.x + r.width > vw + 0.5)) { breaches++; console.log(`[${c.name}] share popover crosses the viewport: ${Math.round(r.x)}..${Math.round(r.x + r.width)} vs 0..${vw}`); }
      } else { breaches++; console.log(`[${c.name}] share popover did not open`); }
      await p.keyboard.press('Escape');
      await p.locator('.colorpicker-scrim').click({ force: true }).catch(() => {});
    }
  }

  // shared state: plant an accepted share, reload, the two-person mark must
  // render inside the frame
  await p.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('seder');
      req.onsuccess = () => {
        const idb = req.result;
        const tx = idb.transaction(['shares', 'categories'], 'readwrite');
        const cats = tx.objectStore('categories').getAll();
        cats.onsuccess = () => {
          const cat = cats.result.find((x) => !x.system);
          if (cat) tx.objectStore('shares').put({ id: 'geo-share', listId: cat.id, ownerId: 'geo', ownerEmail: 'a@b.c', memberId: 'geo2', memberEmail: 'd@e.f', status: 'accepted', createdAt: 1, updatedAt: 1 });
        };
        tx.oncomplete = () => { idb.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  await p.goto(`${URL}?${c.q.replace('&seed=fresh', '')}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const mark = p.locator('.category-card-sharedmark');
  if ((await mark.count()) === 0) { breaches++; console.log(`[${c.name}] shared mark did not render`); }
  else {
    const bad = await mark.first().evaluate((el) => {
      const cr = el.closest('.category-card').getBoundingClientRect();
      const r = el.getBoundingClientRect();
      // a mark that renders zero-size is a silent failure, not a pass
      const svg = el.querySelector('svg')?.getBoundingClientRect();
      if (!svg || svg.width < 8 || svg.height < 8) return `icon has no size (${svg?.width ?? 0}x${svg?.height ?? 0})`;
      return r.left < cr.left - 0.5 || r.right > cr.right + 0.5 ? `${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(cr.left)}..${Math.round(cr.right)}` : null;
    });
    if (bad) { breaches++; console.log(`[${c.name}] shared mark crosses the frame: ${bad}`); }
  }

  // page-level: no horizontal scroll
  const hs = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (hs) { breaches++; console.log(`[${c.name}] horizontal page overflow`); }
  console.log(`[${c.name}] ${n} rows checked, ${hn} headers checked, share popover + mark checked`);
  await ctx.close();
}
await b.close();
if (breaches) { console.log(`\n${breaches} geometry breach(es)`); process.exit(1); }
console.log('\nall geometry invariants hold');
