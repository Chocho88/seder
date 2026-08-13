// The atom of the whole app: one item as a light row.
// Surface = checkbox + title, nothing else at rest. Depth reveals on hover:
// a preview card (next move, notes, age) and quick icon actions. Every row
// is draggable — into matrix quadrants, other lists, or the pinned shelf.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import icons from '../../../design-system/icons.svg';
import { useSeder, childrenOf, todayAgeDays } from '../lib/store';
import { itemState, itemVerb, itemWaitingFor } from '../lib/nextMove';
import { dirProps } from '../lib/rtl';
import { t } from '../lib/i18n';
import type { Item } from '../lib/types';
import './itemrow.css';

const HOVER_DELAY = 380;

export default function ItemRow({ item, depth = 0, leaf = false }: { item: Item; depth?: number; leaf?: boolean }) {
  const { items, categories, toggleDone, openItem, openItemId, setDragItem, dragItemId, setToday, togglePinned } =
    useSeder();
  // every row carries its list's color as its accent, wherever it renders
  const catColor = categories.find((c) => c.id === item.categoryId)?.colorKey;
  const state = itemState(item);
  const kids = childrenOf(items, item.id);
  const rowRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const touchTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { setTouchDrag } = useSeder();
  const [preview, setPreview] = useState<{ x: number; y: number; end: boolean } | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const armPreview = () => {
    if (dragItemId) return;
    clearTimer();
    timer.current = window.setTimeout(() => {
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rtl = document.documentElement.dir === 'rtl';
      setPreview({
        x: rtl ? rect.right : rect.left,
        y: Math.min(rect.bottom + 6, window.innerHeight - 200),
        end: rtl,
      });
    }, HOVER_DELAY);
  };

  const disarmPreview = () => {
    clearTimer();
    setPreview(null);
  };

  useEffect(() => clearTimer, []);

  return (
    <>
      <div
        ref={rowRef}
        className={[
          'item-row',
          'pressable',
          state === 'wait' ? 'item-wait' : '',
          item.done ? 'item-done' : '',
          openItemId === item.id ? 'item-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-cat={catColor}
        style={depth ? { paddingInlineStart: `calc(var(--space-4) + ${depth} * var(--space-5))` } : undefined}
        draggable
        onDragStart={(e) => {
          disarmPreview();
          e.stopPropagation();
          setDragItem(item.id);
        }}
        onDragEnd={() => setDragItem(null)}
        onClick={() => {
          disarmPreview();
          openItem(item.id);
        }}
        onMouseEnter={armPreview}
        onMouseLeave={disarmPreview}
        // touch: long-press picks the row up (the TouchDragLayer takes over)
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          touchStart.current = { x: e.clientX, y: e.clientY };
          touchTimer.current = window.setTimeout(() => {
            setDragItem(item.id);
            setTouchDrag({ x: touchStart.current!.x, y: touchStart.current!.y, title: item.title });
            (navigator as any).vibrate?.(12);
          }, 320);
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'touch' || touchTimer.current === null || !touchStart.current) return;
          if (Math.hypot(e.clientX - touchStart.current.x, e.clientY - touchStart.current.y) > 10) {
            window.clearTimeout(touchTimer.current);
            touchTimer.current = null;
          }
        }}
        onPointerUp={() => {
          if (touchTimer.current !== null) window.clearTimeout(touchTimer.current);
          touchTimer.current = null;
        }}
        onPointerCancel={() => {
          if (touchTimer.current !== null) window.clearTimeout(touchTimer.current);
          touchTimer.current = null;
        }}
      >
        {item.kind === 'task' ? (
          <button
            role="checkbox"
            aria-checked={item.done}
            className={`item-check ${item.done ? 'checked' : ''}`}
            aria-label={item.title}
            onClick={(e) => {
              e.stopPropagation();
              void toggleDone(item.id);
            }}
          >
            <svg className="check-draw" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6.5 L5 9 L9.5 3.5" />
            </svg>
          </button>
        ) : (
          <span className="item-note-mark" aria-hidden />
        )}

        <span className="item-title" {...dirProps(item.title)}>
          {item.title}
        </span>

        {/* rest signals: only what's instantly legible - a pin, sub-count,
            and a Things-style deadline flag when a due date approaches */}
        <span className="item-rest">
          {item.due !== null && !item.done && (
            <span
              className={`item-due${item.due < Date.now() ? ' overdue' : item.due < Date.now() + 2 * 86400000 ? ' soon' : ''}`}
            >
              <svg className="icon" aria-hidden="true">
                <use href={`${icons}#icon-flag`} />
              </svg>
              {new Intl.DateTimeFormat(document.documentElement.lang === 'he' ? 'he-IL' : 'en-US', {
                day: 'numeric',
                month: 'short',
              }).format(new Date(item.due))}
            </span>
          )}
          {item.pinned && (
            <svg className="icon item-rest-pin" aria-hidden="true">
              <use href={`${icons}#icon-pin`} />
            </svg>
          )}
          {kids.length > 0 && (
            <span className="item-kidcount">
              {kids.filter((k) => k.done).length}/{kids.length}
            </span>
          )}
        </span>

        {/* hover actions: icons only, tooltips carry the words */}
        <span className="item-actions" onMouseEnter={disarmPreview}>
          <button
            className={`item-action tooltip ${item.today ? 'on' : ''}`}
            data-tooltip={t('today_flag')}
            aria-label={t('today_flag')}
            onClick={(e) => {
              e.stopPropagation();
              void setToday(item.id, !item.today);
            }}
          >
            <svg className="icon">
              <use href={`${icons}#icon-calendar`} />
            </svg>
          </button>
          <button
            className={`item-action tooltip ${item.pinned ? 'on' : ''}`}
            data-tooltip={item.pinned ? t('unpin') : t('pin')}
            aria-label={t('pin')}
            onClick={(e) => {
              e.stopPropagation();
              void togglePinned(item.id);
            }}
          >
            <svg className="icon">
              <use href={`${icons}#icon-pin`} />
            </svg>
          </button>
        </span>
      </div>

      {preview && <HoverCard item={item} x={preview.x} y={preview.y} end={preview.end} />}

      {!leaf &&
        kids.map((k) => (
          <ItemRow key={k.id} item={k} depth={depth + 1} />
        ))}
    </>
  );
}

/** The depth-at-a-glance preview: state, next move, notes, age — read-only. */
function HoverCard({ item, x, y, end }: { item: Item; x: number; y: number; end: boolean }) {
  const state = itemState(item);
  const verb = itemVerb(item);
  const waitingFor = itemWaitingFor(item);
  const age = item.today ? todayAgeDays(item) : 0;
  const hasBody = Boolean(item.nextMove.trim() || item.notes.trim() || waitingFor || age >= 2 || verb);
  if (!hasBody) return null;

  return createPortal(
    <div
      className="hovercard"
      dir={document.documentElement.dir}
      style={end ? { right: window.innerWidth - x, top: y } : { left: x, top: y }}
    >
      <div className="hovercard-state" data-state={state}>
        {verb && (
          <svg className="icon" aria-hidden="true">
            <use href={`${icons}#icon-${verb.icon}`} />
          </svg>
        )}
        <span>{t(`state_${state}`)}</span>
        {age >= 2 && (
          <span className="hovercard-age">
            <svg className="icon" aria-hidden="true">
              <use href={`${icons}#icon-clock`} />
            </svg>
            {age}
            {t('days_short')}
          </span>
        )}
      </div>
      {item.nextMove.trim() && (
        <p className="hovercard-move" {...dirProps(item.nextMove)}>
          {item.nextMove}
        </p>
      )}
      {waitingFor && !item.nextMove.trim() && (
        <p className="hovercard-move" {...dirProps(waitingFor)}>
          {t('waiting_for')} {waitingFor}
        </p>
      )}
      {item.notes.trim() && (
        <p className="hovercard-notes" {...dirProps(item.notes)}>
          {item.notes}
        </p>
      )}
    </div>,
    document.body,
  );
}
