// Screenshots for the Google-sign-in + Today-shelf milestone report:
//   shots/today-shelf-desktop-he.png    Today shelf at the top, populated
//   shots/today-shelf-phone-he.png      the same on the phone
//   shots/today-shelf-desktop-en.png    English
//   shots/account-google-desktop-he.png the account panel with the Google button
import { launchChromium } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'shots'), { recursive: true });
const browser = await launchChromium();

async function shot(name, { vw, vh, mobile, lang, account }) {
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: 2,
    ...(mobile ? { hasTouch: true, isMobile: true } : {}),
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:5183/?lang=${lang}&theme=light&seed=fresh`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.evaluate(() => document.fonts.ready);
  if (account) {
    await p.locator('.account-btn').click();
    await p.waitForTimeout(250);
  }
  await p.screenshot({ path: join(root, 'shots', `${name}.png`) });
  console.log(join(root, 'shots', `${name}.png`));
  await ctx.close();
}

await shot('today-shelf-desktop-he', { vw: 1440, vh: 900, lang: 'he' });
await shot('today-shelf-desktop-en', { vw: 1440, vh: 900, lang: 'en' });
await shot('today-shelf-phone-he', { vw: 390, vh: 844, mobile: true, lang: 'he' });
await shot('account-google-desktop-he', { vw: 1440, vh: 900, lang: 'he', account: true });
await browser.close();
