// Settings: one gear, one quiet panel. Card style, font size, colored lists.

import { useEffect, useRef, useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder } from '../lib/store';
import { setFontSize, setColoredLists } from '../lib/urlState';
import { t, useLang } from '../lib/i18n';
import type { CardStyle } from '../lib/types';
import './settings.css';

const STYLES: CardStyle[] = ['tint', 'mono', 'header'];
const SIZES = ['s', 'm', 'l'] as const;

export default function SettingsMenu() {
  const { cardStyle, setCardStyle } = useSeder();
  useLang(); // re-render on language switch
  const [open, setOpen] = useState(false);
  const [fontsize, setFs] = useState(() => document.documentElement.getAttribute('data-fontsize') || 'm');
  const [colored, setColored] = useState(() => document.documentElement.getAttribute('data-colored') !== 'off');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

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
        </div>
      )}
    </div>
  );
}
