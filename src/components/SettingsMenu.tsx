// Settings: one gear, one quiet panel.
// Appearance (theme / card style / font size / colored lists), behavior
// (morning suggestions), and data (logbook, backup export/import, layout reset).

import { useEffect, useRef, useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { db, uid } from '../lib/db';
import { rekeySnapshot } from '../lib/shareSplit';
import { useSeder } from '../lib/store';
import { setFontSize, setColoredLists, getThemeMode, applyThemeMode, type ThemeMode } from '../lib/urlState';
import { t, useLang } from '../lib/i18n';
import type { CardStyle, SectionId } from '../lib/types';
import './settings.css';

/** Sections list: toggle visibility, drag to reorder - the canvas obeys. */
function SectionsEditor() {
  const { sections, setSectionOn, moveSection, resetSections } = useSeder();
  const [dragId, setDragId] = useState<SectionId | null>(null);
  const [overId, setOverId] = useState<SectionId | null>(null);
  return (
    <div className="settings-sections">
      <div className="settings-sections-head">
        <span className="settings-label">{t('sections')}</span>
        <button className="settings-link" onClick={resetSections}>
          {t('reset_layout')}
        </button>
      </div>
      <p className="settings-hint">{t('sections_hint')}</p>
      {sections.map((s, i) => (
        <div
          key={s.id}
          className={`settings-section-row${overId === s.id ? ' over' : ''}${dragId === s.id ? ' dragging' : ''}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            setDragId(s.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            if (dragId && dragId !== s.id) {
              e.preventDefault();
              setOverId(s.id);
            }
          }}
          onDragLeave={() => setOverId((v) => (v === s.id ? null : v))}
          onDrop={() => {
            if (dragId) moveSection(dragId, s.id);
            setDragId(null);
            setOverId(null);
          }}
        >
          <svg className="icon settings-grip" aria-hidden="true">
            <use href={`${icons}#icon-menu`} />
          </svg>
          <span className="settings-section-name">{t(`section_${s.id}`)}</span>
          {/* touch devices: arrows instead of drag */}
          <span className="settings-arrows">
            <button
              className="settings-arrow"
              aria-label="Up"
              disabled={i === 0}
              onClick={() => moveSection(s.id, sections[i - 1].id)}
            >
              <svg className="icon settings-arrow-up">
                <use href={`${icons}#icon-chevron-down`} />
              </svg>
            </button>
            <button
              className="settings-arrow"
              aria-label="Down"
              disabled={i === sections.length - 1}
              onClick={() => {
                // move below the next one = drop onto the one after next (or end)
                const target = sections[i + 2]?.id;
                if (target) moveSection(s.id, target);
                else moveSection(sections[i + 1].id, s.id);
              }}
            >
              <svg className="icon">
                <use href={`${icons}#icon-chevron-down`} />
              </svg>
            </button>
          </span>
          <button
            className={`settings-switch settings-switch-sm${s.on ? ' on' : ''}`}
            role="switch"
            aria-checked={s.on}
            disabled={s.id === 'lists'}
            onClick={() => setSectionOn(s.id, !s.on)}
          >
            <span className="settings-knob" />
          </button>
        </div>
      ))}
    </div>
  );
}

const STYLES: CardStyle[] = ['tint', 'mono', 'header'];
const SIZES = ['s', 'm', 'l'] as const;
const THEMES: ThemeMode[] = ['light', 'dark', 'system'];

export default function SettingsMenu() {
  const { cardStyle, setCardStyle, setLogbookOpen, importMarkdownText } = useSeder();
  useLang(); // re-render on language switch
  const [open, setOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeMode);
  const [fontsize, setFs] = useState(() => document.documentElement.getAttribute('data-fontsize') || 'm');
  const [colored, setColored] = useState(() => document.documentElement.getAttribute('data-colored') !== 'off');
  const ref = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const mdRef = useRef<HTMLInputElement>(null);

  const importMd = async (file: File) => {
    await importMarkdownText(await file.text());
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // touchstart too - see AccountMenu: outside taps must dismiss on iOS
    window.addEventListener('mousedown', close);
    window.addEventListener('touchstart', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('touchstart', close);
    };
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
    // Imports are RE-KEYED: a backup may come from another account (or a
    // pre-account-switch life), and its original row ids exist server-side
    // under that account - pushing them would be rejected by RLS forever.
    // Fresh ids make the imported rows unambiguously OURS.
    const owner = ((await db.meta.get('owner'))?.value as string | undefined) ?? 'local';
    const poolId = owner === 'local' ? 'pool-local' : `pool-${owner}`;
    const { categories, items, prefs } = rekeySnapshot(data, { poolId, ownerId: owner, nextOrder: 0, newId: uid });
    await db.transaction('rw', db.items, db.categories, db.prefs, async () => {
      await db.items.clear();
      await db.categories.clear();
      await db.prefs.clear();
      await db.categories.bulkAdd([
        { id: poolId, name: 'Pool', colorKey: 'fog', order: -1, archived: false, system: true },
        ...categories,
      ]);
      await db.items.bulkAdd(items);
      await db.prefs.bulkAdd(prefs);
    });
    location.reload();
  };

  const resetLayout = () => {
    for (const k of ['seder-split', 'seder-matrix-rowmin', 'seder-sections']) localStorage.removeItem(k);
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
          <div className="settings-divider" />

          <SectionsEditor />

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
          <button className="settings-action pressable" onClick={() => mdRef.current?.click()}>
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-copy`} />
            </svg>
            {t('import_md')}
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
          <input
            ref={mdRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            style={{ display: 'none' }}
            data-testid="md-import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importMd(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
