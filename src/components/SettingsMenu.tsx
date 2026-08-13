// Settings: one gear, one quiet panel.
// Appearance (theme / card style / font size / colored lists), behavior
// (morning suggestions), and data (logbook, backup export/import, layout reset).

import { useEffect, useRef, useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { db } from '../lib/db';
import { useSeder } from '../lib/store';
import { setFontSize, setColoredLists, getThemeMode, applyThemeMode, type ThemeMode } from '../lib/urlState';
import { t, useLang } from '../lib/i18n';
import type { CardStyle } from '../lib/types';
import './settings.css';

const STYLES: CardStyle[] = ['tint', 'mono', 'header'];
const SIZES = ['s', 'm', 'l'] as const;
const THEMES: ThemeMode[] = ['light', 'dark', 'system'];

export default function SettingsMenu() {
  const { cardStyle, setCardStyle, suggestionsOn, setSuggestionsOn, setLogbookOpen } = useSeder();
  useLang(); // re-render on language switch
  const [open, setOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeMode);
  const [fontsize, setFs] = useState(() => document.documentElement.getAttribute('data-fontsize') || 'm');
  const [colored, setColored] = useState(() => document.documentElement.getAttribute('data-colored') !== 'off');
  const ref = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const exportBackup = async () => {
    const [items, categories] = await Promise.all([db.items.toArray(), db.categories.toArray()]);
    const blob = new Blob([JSON.stringify({ seder: 1, exportedAt: Date.now(), items, categories }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seder-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBackup = async (file: File) => {
    const data = JSON.parse(await file.text());
    if (!data?.seder || !Array.isArray(data.items) || !Array.isArray(data.categories)) return;
    await db.transaction('rw', db.items, db.categories, async () => {
      await db.items.clear();
      await db.categories.clear();
      await db.categories.bulkAdd(data.categories);
      await db.items.bulkAdd(data.items);
    });
    location.reload();
  };

  const resetLayout = () => {
    for (const k of ['seder-split', 'seder-matrix-rowmin']) localStorage.removeItem(k);
    void db.categories.toCollection().modify((c) => {
      delete (c as any).w;
      (c as any).h = null;
    });
    location.reload();
  };

  return (
    <div className="settings" ref={ref}>
      <button className="header-toggle" aria-label={t('settings')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg className="icon icon-md">
          <use href={`${icons}#icon-settings`} />
        </svg>
      </button>
      {open && (
        <div className="settings-panel">
          <div className="settings-row">
            <span className="settings-label">{t('theme')}</span>
            <div className="settings-seg">
              {THEMES.map((m) => (
                <button
                  key={m}
                  aria-pressed={themeMode === m}
                  onClick={() => {
                    applyThemeMode(m);
                    setThemeMode(m);
                  }}
                >
                  {t(`theme_${m}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">{t('card_style')}</span>
            <div className="settings-seg">
              {STYLES.map((s) => (
                <button key={s} aria-pressed={cardStyle === s} onClick={() => setCardStyle(s)}>
                  {t(`style_${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">{t('font_size')}</span>
            <div className="settings-seg">
              {SIZES.map((s) => (
                <button
                  key={s}
                  aria-pressed={fontsize === s}
                  onClick={() => {
                    setFontSize(s);
                    setFs(s);
                  }}
                >
                  {t(`size_${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">{t('colored_lists')}</span>
            <button
              className={`settings-switch${colored ? ' on' : ''}`}
              role="switch"
              aria-checked={colored}
              onClick={() => {
                const next = !colored;
                setColoredLists(next);
                setColored(next);
              }}
            >
              <span className="settings-knob" />
            </button>
          </div>
          <div className="settings-row">
            <span className="settings-label">{t('suggestions')}</span>
            <button
              className={`settings-switch${suggestionsOn ? ' on' : ''}`}
              role="switch"
              aria-checked={suggestionsOn}
              onClick={() => setSuggestionsOn(!suggestionsOn)}
            >
              <span className="settings-knob" />
            </button>
          </div>

          <div className="settings-divider" />

          <button
            className="settings-action pressable"
            onClick={() => {
              setLogbookOpen(true);
              setOpen(false);
            }}
          >
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-archive`} />
            </svg>
            {t('logbook')}
          </button>
          <button className="settings-action pressable" onClick={() => void exportBackup()}>
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-download`} />
            </svg>
            {t('export_data')}
          </button>
          <button className="settings-action pressable" onClick={() => importRef.current?.click()}>
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-upload`} />
            </svg>
            {t('import_data')}
          </button>
          <button className="settings-action pressable" onClick={resetLayout}>
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-menu`} />
            </svg>
            {t('reset_layout')}
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
            }}
          />
        </div>
      )}
    </div>
  );
}
