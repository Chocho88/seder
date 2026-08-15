/**
 * KLOD Design System — Theme & Language Toggle
 *
 * Drop into any app. Handles:
 * - Dark/Light theme toggle (persists to localStorage)
 * - English/Hebrew language toggle (persists to localStorage)
 * - Header stays perfectly stable during toggles
 *
 * Usage (vanilla):
 *   import { initTheme, initLang } from '../design-system/theme-toggle.js';
 *   initTheme();
 *   initLang();
 *
 * Usage (React):
 *   import { useTheme, useLang } from '../design-system/theme-toggle.js';
 */

// ==========================================
// THEME (dark/light)
// ==========================================

const THEME_KEY = 'klod-theme';

export function getTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  updateThemeIcon(theme);
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

function updateThemeIcon(theme) {
  const btn = document.querySelector('[data-toggle="theme"]');
  if (!btn) return;
  const sunIcon = btn.querySelector('.icon-sun');
  const moonIcon = btn.querySelector('.icon-moon');
  if (sunIcon && moonIcon) {
    sunIcon.style.display = theme === 'dark' ? 'none' : 'block';
    moonIcon.style.display = theme === 'dark' ? 'block' : 'none';
  }
}

export function initTheme() {
  const theme = getTheme();
  setTheme(theme);

  const btn = document.querySelector('[data-toggle="theme"]');
  if (btn) {
    btn.addEventListener('click', () => toggleTheme());
  }

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });
}


// ==========================================
// LANGUAGE (en/he)
// ==========================================

const LANG_KEY = 'klod-lang';

export function getLang() {
  return localStorage.getItem(LANG_KEY) || 'en';
}

export function setLang(lang) {
  const html = document.documentElement;
  html.setAttribute('lang', lang);
  html.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
  localStorage.setItem(LANG_KEY, lang);
  updateLangButton(lang);

  // Auto-translate DOM if i18n module is loaded
  if (window.__klodI18n) {
    window.__klodI18n.setLang(lang);
  }
}

export function toggleLang() {
  const next = getLang() === 'en' ? 'he' : 'en';
  setLang(next);
  return next;
}

function updateLangButton(lang) {
  const btn = document.querySelector('[data-toggle="lang"]');
  if (!btn) return;
  btn.textContent = lang === 'en' ? 'HE' : 'EN';
  btn.setAttribute('aria-label', lang === 'en' ? 'Switch to Hebrew' : 'Switch to English');
}

export function initLang() {
  const lang = getLang();
  setLang(lang);

  const btn = document.querySelector('[data-toggle="lang"]');
  if (btn) {
    btn.addEventListener('click', () => toggleLang());
  }
}


// ==========================================
// INIT ALL (convenience)
// ==========================================

export function initDesignSystem() {
  initTheme();
  initLang();
}


// ==========================================
// REACT HOOKS (for React projects)
// ==========================================

/**
 * React hook: useTheme
 * Returns [theme, toggleTheme]
 *
 * Usage:
 *   const [theme, toggleTheme] = useTheme();
 */
export function useTheme() {
  // Lazy-check: if React is available
  if (typeof window !== 'undefined' && window.React) {
    const { useState, useEffect } = window.React;
    const [theme, _setTheme] = useState(getTheme);

    useEffect(() => {
      setTheme(theme);
    }, [theme]);

    const toggle = () => {
      _setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    return [theme, toggle];
  }
  return [getTheme(), toggleTheme];
}

/**
 * React hook: useLang
 * Returns [lang, toggleLang, isRTL]
 */
export function useLang() {
  if (typeof window !== 'undefined' && window.React) {
    const { useState, useEffect } = window.React;
    const [lang, _setLang] = useState(getLang);

    useEffect(() => {
      setLang(lang);
    }, [lang]);

    const toggle = () => {
      _setLang((prev) => (prev === 'en' ? 'he' : 'en'));
    };

    return [lang, toggle, lang === 'he'];
  }
  return [getLang(), toggleLang, getLang() === 'he'];
}
