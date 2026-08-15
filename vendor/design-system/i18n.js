/**
 * KLOD Design System — i18n (Internationalization)
 *
 * Lightweight translation system for EN/HE.
 * Uses data-i18n attributes on elements.
 *
 * Usage:
 *   1. Add data-i18n="key" to any element:
 *      <h1 data-i18n="welcome">Welcome</h1>
 *      <input data-i18n-placeholder="search" placeholder="Search...">
 *      <button data-i18n="submit">Submit</button>
 *
 *   2. Register translations per app:
 *      import { i18n } from '../design-system/i18n.js';
 *      i18n.addTranslations({
 *        welcome: { en: 'Welcome', he: 'ברוכים הבאים' },
 *        search:  { en: 'Search...', he: 'חיפוש...' },
 *        submit:  { en: 'Submit', he: 'שלח' },
 *      });
 *      i18n.setLang('he'); // translates all [data-i18n] elements
 *
 *   3. Or use with the theme-toggle.js lang system:
 *      import { initDesignSystem } from '../design-system/theme-toggle.js';
 *      import { i18n } from '../design-system/i18n.js';
 *      i18n.addTranslations({...});
 *      initDesignSystem(); // lang toggle will auto-call i18n.setLang()
 */

class I18nManager {
  constructor() {
    this.translations = {};
    this.currentLang = 'en';
    this.fallbackLang = 'en';
  }

  /**
   * Register translations.
   * @param {Object} dict - { key: { en: '...', he: '...' }, ... }
   */
  addTranslations(dict) {
    for (const [key, langs] of Object.entries(dict)) {
      this.translations[key] = { ...(this.translations[key] || {}), ...langs };
    }
  }

  /**
   * Get translated string for a key.
   */
  t(key) {
    const entry = this.translations[key];
    if (!entry) return key;
    return entry[this.currentLang] || entry[this.fallbackLang] || key;
  }

  /**
   * Set language and translate all [data-i18n] elements in the DOM.
   */
  setLang(lang) {
    this.currentLang = lang;
    this._translateDOM();
  }

  /**
   * Translate all elements with data-i18n attributes.
   */
  _translateDOM() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = this.t(key);
      if (translated !== key) {
        el.textContent = translated;
      }
    });

    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translated = this.t(key);
      if (translated !== key) {
        el.placeholder = translated;
      }
    });

    // Aria-labels
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      const translated = this.t(key);
      if (translated !== key) {
        el.setAttribute('aria-label', translated);
      }
    });

    // Title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const translated = this.t(key);
      if (translated !== key) {
        el.title = translated;
      }
    });
  }
}

export const i18n = new I18nManager();
export default i18n;
