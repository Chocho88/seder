// Self-update: a page that keeps running an old copy of the app is how
// "it's fixed" and "I still see the bug" coexist. Every few minutes (and
// whenever the app comes back to the foreground) the page peeks at the
// served HTML; if the app bundle changed, it reloads itself at a safe
// moment. Production only; one reload per new version (no loops).

const CHECK_MS = 5 * 60_000;
const SEEN_KEY = 'seder-updated-to';

function currentBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[src^="/assets/index-"]');
  return el?.getAttribute('src') ?? null;
}

async function servedBundle(): Promise<string | null> {
  try {
    const res = await fetch('/', { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    return /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1] ?? null;
  } catch {
    return null;
  }
}

let reloadWhenVisible = false;

async function check(dragActive: () => boolean): Promise<void> {
  const running = currentBundle();
  const served = await servedBundle();
  if (!running || !served || running === served) return;
  try {
    if (sessionStorage.getItem(SEEN_KEY) === served) return; // already tried once
    sessionStorage.setItem(SEEN_KEY, served);
  } catch {}
  // reload at a calm moment: not mid-drag, and only when the page is visible
  if (document.visibilityState === 'visible' && !dragActive()) {
    location.reload();
  } else {
    reloadWhenVisible = true;
  }
}

export function startSelfUpdate(dragActive: () => boolean): void {
  if (!/vercel\.app$/.test(location.hostname)) return; // dev stays put
  window.setInterval(() => void check(dragActive), CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (reloadWhenVisible && !dragActive()) {
      reloadWhenVisible = false;
      location.reload();
      return;
    }
    void check(dragActive);
  });
}
