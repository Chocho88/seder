// One place to launch the headless browser for all rigs. Prefers installed
// Chrome (the Mac), falls back to Playwright's bundled Chromium (CI or a
// container where the chrome channel does not exist).
import { chromium } from 'playwright-core';

export async function launchChromium(options = {}) {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, ...options });
  } catch {}
  try {
    return await chromium.launch({ headless: true, ...options });
  } catch {}
  // last resort: an explicit binary (containers expose one at this path)
  return await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, ...options });
}
