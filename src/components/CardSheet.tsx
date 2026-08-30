// The phone grids' per-list actions: one bottom sheet, thumb-height rows.
// A ~170px grid card cannot seat always-on header tools, and hover does
// not exist on touch - so a tap on the card's header opens THIS instead:
// color, rename, share, sweep, delete, each a full-width 48px row. The
// sheet is a portal over a scrim; long-press on the header stays free for
// lifting the card (reorder).

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { UsersIcon } from './SederIcons';
import { ShareBody } from './ShareMenu';
import { useSeder } from '../lib/store';
import { t } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import { CATEGORY_COLOR_KEYS, type Category } from '../lib/types';
import './cardsheet.css';

export default function CardSheet({
  category,
  displayName,
  canDelete,
  doneCount,
  openCount,
  onRename,
  close,
}: {
  category: Category;
  displayName: string;
  canDelete: boolean;
  doneCount: number;
  openCount: number;
  onRename: () => void;
  close: () => void;
}) {
  const { updateCategory, deleteCategory, sweepDone, shareOf } = useSeder();
  const [shareOpen, setShareOpen] = useState(false);
  const shared = shareOf(category.id)?.status === 'accepted';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return createPortal(
    <>
      <div className="cardsheet-scrim" onClick={close} />
      <div
        className="cardsheet"
        role="menu"
        aria-label={t('list_actions')}
        data-cat={category.colorKey}
        dir={document.documentElement.dir}
        style={
          category.customColor
            ? ({ '--cat-color': category.customColor } as React.CSSProperties)
            : undefined
        }
      >
        <header className="cardsheet-head">
          <span className="cat-dot" aria-hidden />
          <span className="cardsheet-title" {...dirProps(displayName)}>
            {displayName}
          </span>
          <span className="cardsheet-count">{openCount}</span>
        </header>

        {/* the color ring, inline - no anchored popover to position */}
        <div className="cardsheet-colors" role="group" aria-label={t('custom_color')}>
          {CATEGORY_COLOR_KEYS.map((key) => (
            <button
              key={key}
              className={`category-colorswatch${key === category.colorKey && !category.customColor ? ' current' : ''}`}
              data-cat={key}
              aria-label={key}
              onClick={() => void updateCategory(category.id, { colorKey: key, customColor: null })}
            />
          ))}
          <label
            className={`category-colorswatch category-colorswatch-custom${category.customColor ? ' current' : ''}`}
            title={t('custom_color')}
            style={category.customColor ? { background: category.customColor } : undefined}
          >
            <input
              type="color"
              value={category.customColor ?? '#888888'}
              onChange={(e) => void updateCategory(category.id, { customColor: e.target.value })}
            />
          </label>
        </div>

        {!category.system && (
          <button
            className="cardsheet-row pressable"
            onClick={() => {
              close();
              onRename();
            }}
          >
            <svg className="icon" aria-hidden>
              <use href={`${icons}#icon-edit`} />
            </svg>
            {t('rename')}
          </button>
        )}
        {!category.system && (
          <button className="cardsheet-row pressable" aria-expanded={shareOpen} onClick={() => setShareOpen((o) => !o)}>
            <UsersIcon className="icon" />
            {shared ? t('shared_mark') : t('share_list')}
          </button>
        )}
        {shareOpen && (
          <div className="cardsheet-share">
            <ShareBody category={category} close={close} autoFocus={false} />
          </div>
        )}
        {doneCount > 0 && (
          <button
            className="cardsheet-row pressable"
            onClick={() => {
              void sweepDone(category.id);
              close();
            }}
          >
            <svg className="icon" aria-hidden>
              <use href={`${icons}#icon-check`} />
            </svg>
            {t('sweep_done')}
          </button>
        )}
        {canDelete && (
          <button
            className="cardsheet-row cardsheet-danger pressable"
            onClick={() => {
              void deleteCategory(category.id);
              close();
            }}
          >
            <svg className="icon" aria-hidden>
              <use href={`${icons}#icon-trash`} />
            </svg>
            {t('delete')}
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
