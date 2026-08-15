// Renders the app icon: green field, quiet matrix grid, סדר wordmark in
// Migdal Haemeq (the header's face). Outputs 512/192/180(apple)/32 PNGs.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const font = readFileSync(resolve('vendor/design-system/FONTS/Migdal Haemeq/MigdalFontwin.ttf')).toString('base64');
const GREEN = '#329051';

const html = (size) => `<!doctype html><html><head><style>
@font-face { font-family: 'Migdal'; src: url(data:font/ttf;base64,${font}) format('truetype'); }
html,body{margin:0;background:transparent}
.icon{position:relative;width:${size}px;height:${size}px;overflow:hidden;background:${GREEN};
  border-radius:${Math.round(size*0.2237)}px; /* iOS superellipse-ish */
}
/* the grid: the matrix, whispered - one cross emphasized, fine lines behind */
.grid{position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px);
  background-size:${size/8}px ${size/8}px;
  background-position:-0.5px -0.5px;
}
.cross-v,.cross-h{position:absolute;background:rgba(255,255,255,.22)}
.cross-v{left:50%;top:0;bottom:0;width:${Math.max(2, size*0.006)}px;transform:translateX(-50%)}
.cross-h{top:50%;left:0;right:0;height:${Math.max(2, size*0.006)}px;transform:translateY(-50%)}
.word{position:absolute;inset:0;display:grid;place-items:center;
  font-family:'Migdal';color:#fff;font-size:${size*0.40}px;line-height:1;
  direction:rtl;letter-spacing:${size*0.01}px;
  text-shadow:0 ${size*0.01}px ${size*0.03}px rgba(0,0,0,.18);
  padding-bottom:${size*0.015}px}
</style></head><body><div class="icon"><div class="grid"></div><div class="cross-v"></div><div class="cross-h"></div><div class="word">סדר</div></div></body></html>`;

const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [size, name] of [[1024, 'icon-1024'], [512, 'icon-512'], [192, 'icon-192'], [180, 'apple-touch-icon'], [64, 'icon-64'], [32, 'icon-32']]) {
  const p = await (await b.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })).newPage();
  await p.setContent(html(size));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `public/${name}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await b.close();

// favicon + maskable-safe SVG (flat, no rounded corners - the OS masks it)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${GREEN}"/>
<g stroke="#fff" stroke-opacity=".10" stroke-width="1">${[1,2,3,4,5,6,7].map(i=>`<line x1="${i*64}" y1="0" x2="${i*64}" y2="512"/><line x1="0" y1="${i*64}" x2="512" y2="${i*64}"/>`).join('')}</g>
<g stroke="#fff" stroke-opacity=".22" stroke-width="3"><line x1="256" y1="0" x2="256" y2="512"/><line x1="0" y1="256" x2="512" y2="256"/></g>
<image href="data:image/png;base64,${readFileSync('public/icon-512.png').toString('base64')}" width="512" height="512" clip-path="inset(0 round 0)" opacity="0"/>
</svg>`;
writeFileSync('public/icon.svg', svg);
console.log('svg written');
