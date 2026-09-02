// Self-update: a page that keeps running an old copy of the app is how
// "it's fixed" and "I still see the bug" coexist. Every few minutes (and
// whenever the app comes back to the foreground) the page peeks at the
// served HTML; if the app bundle changed, it reloads itself at a safe
// moment. Production only; one reload per new version (no loops).
//
// Coming to the foreground is ALSO exactly when auth.ts fires a resume
// `syncNow()` (the "show me what changed on the other device" pull, and a
// flush of anything typed right before backgrounding) - both are wired to
// the same visibilitychange event. A reload here is a navigation, and an
// in-flight fetch() has no guarantee of completing once one starts; without
// coordination, this reload can cut that sync cycle off mid-flight the
// moment it matters most - right when the user opened the app specifically
// to see what changed elsewhere. So every reload site below runs its OWN
// awaited, capped sync cycle first, rather than hoping the ambient one
// (auth.ts's listener, registered separately) happens to finish in time.

import { syncNow } from './sync';

const CHECK_MS = 5 * 60_000;
const SEEN_KEY = 'seder-updated-to';
const SYNC_WAIT_CAP_MS = 4000;

async function reloadAfterSync(): Promise<void> {
  try {
    await Promise.race([syncNow(), new Promise<void>((resolve) => setTimeout(resolve, SYNC_WAIT_CAP_MS))]);
  } catch {}
  location.reload();
}

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
    void reloadAfterSync();
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
      void reloadAfterSync();
      return;
    }
    void check(dragActive);
  });
}
