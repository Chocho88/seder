// URL-addressable UI state, so any app state can be reached (and
// screenshotted) via a URL: ?view=board&lang=he&theme=dark&cardstyle=tint&detail=panel&open=<id>
// URL params override localStorage; they also persist so a reload keeps them.

import type { CardStyle, DetailMode, Lang, Theme, ViewId } from './types';

const KEYS = {
  view: 'seder-view',
  cardstyle: 'seder-cardstyle',
  detail: 'seder-detail',
  theme: 'klod-theme', // shared with design system
  lang: 'klod-lang',
} as const;

function applyOverridesNow(): void {
  const q = new URLSearchParams(window.location.search);
  for (const [param, storageKey] of Object.entries(KEYS)) {
    const v = q.get(param);
    if (v) localStorage.setItem(storageKey, v);
  }
  const theme = (localStorage.getItem(KEYS.theme) as Theme) || 'light';
  const lang = (localStorage.getItem(KEYS.lang) as Lang) || 'he';
  const cardstyle = (localStorage.getItem(KEYS.cardstyle) as CardStyle) || 'mono';
  const detail = (localStorage.getItem(KEYS.detail) as DetailMode) || 'panel';
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  html.setAttribute('lang', lang);
  html.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
  html.setAttribute('data-cardstyle', cardstyle);
  html.setAttribute('data-detail', detail);
}

// Run at module load — this module is imported by the store, so overrides land
// before any initial* reader runs, regardless of import graph order.
applyOverridesNow();

export function applyUrlOverrides(): void {
  applyOverridesNow();
}

export function initialView(): ViewId {
  const v = localStorage.getItem(KEYS.view);
  if (v === 'today' || v === 'board' || v === 'matrix' || v === 'all') return v;
  return 'today';
}

export function persistView(view: ViewId): void {
  localStorage.setItem(KEYS.view, view);
}

export function initialCardStyle(): CardStyle {
  const v = localStorage.getItem(KEYS.cardstyle);
  return v === 'tint' || v === 'header' ? v : 'mono';
}

export function persistCardStyle(style: CardStyle): void {
  localStorage.setItem(KEYS.cardstyle, style);
  document.documentElement.setAttribute('data-cardstyle', style);
}

export function initialDetailMode(): DetailMode {
  return localStorage.getItem(KEYS.detail) === 'inline' ? 'inline' : 'panel';
}

export function persistDetailMode(mode: DetailMode): void {
  localStorage.setItem(KEYS.detail, mode);
  document.documentElement.setAttribute('data-detail', mode);
}

/** ?open=<itemId> — open an item's detail on load (for screenshots/tests). */
export function initialOpenItem(): string | null {
  return new URLSearchParams(window.location.search).get('open');
}

/** ?seed=fresh forces re-seeding demo data (used by the screenshot rig). */
export function wantsFreshSeed(): boolean {
  return new URLSearchParams(window.location.search).get('seed') === 'fresh';
}
