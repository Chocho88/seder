// The Eisenhower matrix, drawn like the whiteboard original: two hairline
// axes forming a cross, classic axis labels in the margins, whitespace inside.
//
// The matrix MIRRORS the flags: the moment an item is marked urgent and/or
// important - anywhere in the app - it appears here, placed by exactly what
// is applied (an unset flag reads as "not"). Dragging any row into a
// quadrant applies both flags; dropping ONTO another row inserts before it,
// so the order inside a quadrant is yours to arrange. Empty quadrants are
// simply empty - calm room.

import { useState } from 'react';
import { useSeder } from '../lib/store';
import { t, useLang } from '../lib/i18n';
import type { Item } from '../lib/types';
import ItemRow from './ItemRow';
import './matrix.css';

const LOCAL = {
  unplaced: { en: 'Today, not placed', he: 'להיום, בלי מיקום' },
} as const;

type Quadrant = { urgent: boolean; important: boolean };

const QUADRANTS: Quadrant[] = [
  { urgent: true, important: true },
  { urgent: false, important: true },
  { urgent: true, important: false },
  { urgent: false, important: false },
];

const qKey = (q: Quadrant) => `${q.urgent ? 'u' : 'nu'}-${q.important ? 'i' : 'ni'}`;
const mo = (i: Item) => i.matrixOrder ?? i.createdAt;

export default function MatrixView() {
  const { items, updateItem, dragItemId, setDragItem } = useSeder();
  const [lang] = useLang();
  const [overKey, setOverKey] = useState<string | null>(null);
  const [insertBefore, setInsertBefore] = useState<string | null>(null);

  const pool = items.filter((i) => !i.done && i.parentId === null);
  const flagged = pool.filter((i) => i.urgent !== null || i.important !== null);
  const todayUnflagged = pool.filter((i) => i.today && i.urgent === null && i.important === null);

  const inQuadrant = (q: Quadrant): Item[] =>
    flagged
      .filter((i) => (i.urgent ?? false) === q.urgent && (i.important ?? false) === q.important)
      .sort((a, b) => mo(a) - mo(b));

  const finishDrag = () => {
    setDragItem(null);
    setOverKey(null);
    setInsertBefore(null);
  };

  /** Drop on quadrant background: apply flags, order at the end. */
  const dropOnQuadrant = (q: Quadrant) => {
    if (!dragItemId) return finishDrag();
    const siblings = inQuadrant(q).filter((i) => i.id !== dragItemId);
    const last = siblings.length ? mo(siblings[siblings.length - 1]) : 0;
    void updateItem(dragItemId, { urgent: q.urgent, important: q.important, matrixOrder: last + 1000 });
    finishDrag();
  };

  /** Drop on a row: same flags as that row, inserted visually before it. */
  const dropOnRow = (q: Quadrant, target: Item) => {
    if (!dragItemId || dragItemId === target.id) return finishDrag();
    const siblings = inQuadrant(q).filter((i) => i.id !== dragItemId);
    const idx = siblings.findIndex((i) => i.id === target.id);
    const prev = idx > 0 ? mo(siblings[idx - 1]) : mo(target) - 2000;
    void updateItem(dragItemId, {
      urgent: q.urgent,
      important: q.important,
      matrixOrder: (prev + mo(target)) / 2,
    });
    finishDrag();
  };

  return (
    <div className={`matrix${dragItemId ? ' matrix-dragging' : ''}`} data-scope="canvas">
      <span className="matrix-label matrix-label-x matrix-x1">{t('urgent')}</span>
      <span className="matrix-label matrix-label-x matrix-x2">{t('not_urgent')}</span>
      <span className="matrix-label matrix-label-y matrix-y1">{t('important')}</span>
      <span className="matrix-label matrix-label-y matrix-y2">{t('not_important')}</span>

      {QUADRANTS.map((q) => {
        const key = qKey(q);
        const inhabitants = inQuadrant(q);
        return (
          <div
            key={key}
            className={`matrix-quadrant mq-${key}${overKey === key ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverKey(key);
            }}
            onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
            onDrop={() => dropOnQuadrant(q)}
          >
            {inhabitants.map((i) => (
              <div
                key={i.id}
                className={`matrix-slot${insertBefore === i.id ? ' insert-before' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOverKey(key);
                  setInsertBefore(i.id);
                }}
                onDragLeave={() => setInsertBefore((v) => (v === i.id ? null : v))}
                onDrop={(e) => {
                  e.stopPropagation();
                  dropOnRow(q, i);
                }}
              >
                <ItemRow item={i} leaf />
              </div>
            ))}
          </div>
        );
      })}

      <span className="matrix-axis-v" aria-hidden />
      <span className="matrix-axis-h" aria-hidden />

      {(todayUnflagged.length > 0 || dragItemId !== null) && (
        <div
          className={`matrix-unplaced${overKey === 'tray' ? ' drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOverKey('tray');
          }}
          onDragLeave={() => setOverKey((k) => (k === 'tray' ? null : k))}
          onDrop={() => {
            if (dragItemId) void updateItem(dragItemId, { urgent: null, important: null });
            finishDrag();
          }}
        >
          <span className="matrix-unplaced-label">{LOCAL.unplaced[lang]}</span>
          {todayUnflagged.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </div>
      )}
    </div>
  );
}
