// Screenshots of the sharing UI states for the milestone report:
//   shots/share-mark-desktop-he.png   shared list wearing the two-person mark
//   shots/share-popover-desktop-he.png  the invite popover open
//   shots/share-mark-phone-he.png     the same on the phone
//   shots/share-popover-desktop-en.png  popover, English
// (The invite banner needs a signed-in session to render; it is not
// screenshot-able without network access to Supabase.)
import { launchChromium } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'shots'), { recursive: true });
const browser = await launchChromium();

async function shot(name, { vw, vh, mobile, lang, open }) {
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: 2,
    ...(mobile ? { hasTouch: true, isMobile: true } : {}),
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:5183/?lang=${lang}&theme=light&seed=fresh`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  // plant an accepted share on the first real list, reload so the store sees it
  await p.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const rq = indexedDB.open('seder');
        rq.onsuccess = () => {
          const idb = rq.result;
          const tx = idb.transaction(['shares', 'categories'], 'readwrite');
          const cats = tx.objectStore('categories').getAll();
          cats.onsuccess = () => {
            const cat = cats.result.find((x) => !x.system);
            if (cat)
              tx.objectStore('shares').put({
                id: 'shot-share', listId: cat.id, ownerId: 'me', ownerEmail: 'chocho@example.com',
                memberId: 'her', memberEmail: 'wife@example.com', status: 'accepted', createdAt: 1, updatedAt: 1,
              });
          };
          tx.oncomplete = () => { idb.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        rq.onerror = () => reject(rq.error);
      }),
  );
  await p.goto(`http://localhost:5183/?lang=${lang}&theme=light`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.evaluate(() => document.fonts.ready);
  // the shared card must be in the frame (phone: it sits below the matrix)
  const sharedCard = p.locator('.category-card:has(.category-card-sharedmark)').first();
  if (await sharedCard.count()) {
    await sharedCard.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
  }
  if (open) {
    const header = p.locator('.category-card:not([data-system]) .category-card-header').first();
    if (!mobile) await header.hover();
    await p.locator('.category-card:not([data-system]) .category-card-tools .item-action').first().click({ force: mobile });
    await p.waitForTimeout(200);
  }
  const path = join(root, 'shots', `${name}.png`);
  await p.screenshot({ path });
  console.log(path);
  await ctx.close();
}

await shot('share-mark-desktop-he', { vw: 1440, vh: 900, lang: 'he' });
await shot('share-popover-desktop-he', { vw: 1440, vh: 900, lang: 'he', open: true });
await shot('share-popover-desktop-en', { vw: 1440, vh: 900, lang: 'en', open: true });
await shot('share-mark-phone-he', { vw: 390, vh: 844, mobile: true, lang: 'he' });
await browser.close();
