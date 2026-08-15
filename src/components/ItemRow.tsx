// The atom of the whole app: one item as a light row.
// Surface = checkbox + title, nothing else at rest. Depth reveals on hover:
// a preview card (next move, notes, age) and quick icon actions. Every row
// is draggable — into matrix quadrants, other lists, or the pinned shelf.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import icons from '../../vendor/design-system/icons.svg';
import { useSeder, childrenOf, todayAgeDays } from '../lib/store';
import { itemState, itemVerb, itemWaitingFor } from '../lib/nextMove';
import { dirProps } from '../lib/rtl';
import { t } from '../lib/i18n';
import type { Item } from '../lib/types';
import './itemrow.css';

const HOVER_DELAY = 380;

// reference = a secondary rendering of an item that lives elsewhere (pinned
// shelf, evening shelf): drawn lighter so the eye knows it's a pointer, not
// a second copy.
export default function ItemRow({
  item,
  depth = 0,
  leaf = false,
  reference = false,
}: {
  item: Item;
  depth?: number;
  leaf?: boolean;
  reference?: boolean;
}) {
  const { items, categories, toggleDone, openItem, openItemId, setDragItem, dragItemId, setToday, togglePinned, deleteItem } =
    useSeder();
  // every row carries its list's color as its accent, wherever it renders
  const cat = categories.find((c) => c.id === item.categoryId);
  const catColor = cat?.colorKey;
  const state = itemState(item);
  const kids = childrenOf(items, item.id);
  const age = item.today ? todayAgeDays(item) : 0;
  const hasDepth = Boolean(item.notes.trim() || item.nextMove.trim() || kids.length > 0);
  const rowRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const touchTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { setTouchDrag } = useSeder();
  const [preview, setPreview] = useState<{ x: number; y: number; end: boolean } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

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
          reference ? 'item-reference' : '',
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
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          disarmPreview();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
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
          {/* waiting: a small clock says "not yours right now" at rest */}
          {state === 'wait' && (
            <svg className="icon item-rest-wait" aria-hidden="true">
              <use href={`${icons}#icon-clock`} />
            </svg>
          )}
          {/* rollover age: the one quiet alarm, visible without hovering */}
          {age >= 2 && (
            <span className="item-age">
              {age}
              {t('days_short')}
            </span>
          )}
          {kids.length > 0 && (
            <span className="item-kidcount">
              {kids.filter((k) => k.done).length}/{kids.length}
            </span>
          )}
          {/* depth mark: this row has more inside (hover previews, click opens) */}
          {hasDepth && kids.length === 0 && <span className="item-depth" aria-hidden />}
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
          <button
            className="item-action tooltip"
            data-tooltip={t('delete')}
            aria-label={t('delete')}
            onClick={(e) => {
              e.stopPropagation();
              void deleteItem(item.id);
            }}
          >
            <svg className="icon">
              <use href={`${icons}#icon-trash`} />
            </svg>
          </button>
        </span>
      </div>

      {menu && <RowMenu item={item} x={menu.x} y={menu.y} close={() => setMenu(null)} />}

      {preview && <HoverCard item={item} x={preview.x} y={preview.y} end={preview.end} />}

      {!leaf &&
        kids.map((k) => (
          <ChildSlot key={k.id} child={k}>
            <ItemRow item={k} depth={depth + 1} />
          </ChildSlot>
        ))}
    </>
  );
}

/** Drop slot around a sub-item: dropping a row here reorders it under the
    same parent (dropOn 'row:' routes to reorderChild for nested targets). */
function ChildSlot({ child, children }: { child: Item; children: React.ReactNode }) {
  const { dragItemId, dropOn } = useSeder();
  const [over, setOver] = useState(false);
  return (
    <div
      className={`card-slot child-slot${over ? ' insert-before' : ''}`}
      data-drop={`row:${child.id}`}
      onDragOver={(e) => {
        if (!dragItemId || dragItemId === child.id) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.stopPropagation();
        setOver(false);
        void dropOn(`row:${child.id}`);
      }}
    >
      {children}
    </div>
  );
}

/** Right-click menu: the fast verbs, one gesture from any row. */
function RowMenu({ item, x, y, close }: { item: Item; x: number; y: number; close: () => void }) {
  const { categories, setToday, updateItem, togglePinned, deleteItem, moveItemToCategory } = useSeder();

  useEffect(() => {
    const onAway = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onAway);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onAway);
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);

  const act = (fn: () => void) => () => {
    fn();
    close();
  };
  const left = Math.min(x, window.innerWidth - 210);
  const top = Math.min(y, window.innerHeight - 280);

  const entry = (icon: string, label: string, on: boolean, fn: () => void) => (
    <button className={`rowmenu-entry${on ? ' on' : ''}`} onMouseDown={(e) => e.stopPropagation()} onClick={act(fn)}>
      <svg className="icon" aria-hidden="true">
        <use href={`${icons}#icon-${icon}`} />
      </svg>
      {label}
    </button>
  );

  return createPortal(
    <div
      className="rowmenu"
      dir={document.documentElement.dir}
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {entry('calendar', t('today_flag'), item.today, () => void setToday(item.id, !item.today))}
      {entry('moon', t('evening'), !!item.evening, () =>
        void updateItem(item.id, {
          evening: !item.evening,
          ...(item.evening ? {} : { today: true, todaySince: item.todaySince ?? Date.now() }),
        }),
      )}
      {entry('pin', item.pinned ? t('unpin') : t('pin'), !!item.pinned, () => void togglePinned(item.id))}
      <div className="rowmenu-sep" />
      <div className="rowmenu-label">{t('move_to')}</div>
      {categories
        .filter((c) => c.id !== item.categoryId)
        .map((c) => (
          <button
            key={c.id}
            className="rowmenu-entry"
            data-cat={c.colorKey}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={act(() => void moveItemToCategory(item.id, c.id))}
          >
            <span className="cat-dot" />
            {c.system ? t('pool') : c.name}
          </button>
        ))}
      <div className="rowmenu-sep" />
      {entry('trash', t('delete'), false, () => void deleteItem(item.id))}
    </div>,
    document.body,
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
