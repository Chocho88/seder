// Headless screenshot rig for the gauntlet critics.
// Usage: node scripts/shot.mjs <name> "<query>" [--mobile] [--full]
//   name: output file shots/<name>.png
//   query: URL query, e.g. "view=board&theme=dark&cardstyle=tint&seed=fresh"
// Deterministic: fixed viewport, waits for network idle + fonts.

import { launchChromium } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const name = args[0] || 'shot';
const query = args[1] || '';
const mobile = args.includes('--mobile');
const full = args.includes('--full');

const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };

mkdirSync(join(root, 'shots'), { recursive: true });

const browser = await launchChromium();
const ctx = await browser.newContext({
  viewport,
  deviceScaleFactor: 2,
  ...(mobile
    ? {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        hasTouch: true,
        isMobile: true,
      }
    : {}),
});
const page = await ctx.newPage();
await page.goto(`http://localhost:5183/?${query}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const path = join(root, 'shots', `${name}.png`);
await page.screenshot({ path, fullPage: full });
await browser.close();
console.log(path);
