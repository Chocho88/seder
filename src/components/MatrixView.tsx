// The Eisenhower matrix: ONE card - the canvas's shared card primitive -
// subdivided internally by two full-bleed hairline axes, classic axis
// labels in the margins, whitespace inside.
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

// Section voice, Things-plain: name the shelf, skip the instruction -
// the drag affordance shows itself the moment a row is in the air.
const LOCAL = {
  unplaced: { en: 'For today', he: 'להיום' },
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
  const { items, dragItemId, dropOn } = useSeder();
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
    setOverKey(null);
    setInsertBefore(null);
  };

  return (
    <div className={`matrix${dragItemId ? ' matrix-dragging' : ''}`} data-scope="canvas">
      <span className="matrix-label matrix-label-x matrix-x1">{t('urgent')}</span>
      <span className="matrix-label matrix-label-x matrix-x2">{t('not_urgent')}</span>
      <span className="matrix-label matrix-label-y matrix-y1">{t('important')}</span>
      <span className="matrix-label matrix-label-y matrix-y2">{t('not_important')}</span>

      {/* the card frame, painted first; fields and seams live inside it */}
      <span className="matrix-card" aria-hidden />
      <span className="matrix-axis-v" aria-hidden />
      <span className="matrix-axis-h" aria-hidden />

      {QUADRANTS.map((q) => {
        const key = qKey(q);
        const inhabitants = inQuadrant(q);
        return (
          <div
            key={key}
            className={`matrix-quadrant mq-${key}${overKey === key ? ' drag-over' : ''}`}
            data-drop={`q:${key}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverKey(key);
            }}
            onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
            onDrop={() => {
              void dropOn(`q:${key}`);
              finishDrag();
            }}
          >
            {inhabitants.map((i) => (
              <div
                key={i.id}
                className={`matrix-slot${insertBefore === i.id ? ' insert-before' : ''}`}
                data-drop={`q:${key}:before:${i.id}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOverKey(key);
                  setInsertBefore(i.id);
                }}
                onDragLeave={() => setInsertBefore((v) => (v === i.id ? null : v))}
                onDrop={(e) => {
                  e.stopPropagation();
                  void dropOn(`q:${key}:before:${i.id}`);
                  finishDrag();
                }}
              >
                <ItemRow item={i} leaf />
              </div>
            ))}
          </div>
        );
      })}

      {(todayUnflagged.length > 0 || dragItemId !== null) && (
        <div
          className={`matrix-unplaced${overKey === 'tray' ? ' drag-over' : ''}`}
          data-drop="tray"
          onDragOver={(e) => {
            e.preventDefault();
            setOverKey('tray');
          }}
          onDragLeave={() => setOverKey((k) => (k === 'tray' ? null : k))}
          onDrop={() => {
            void dropOn('tray');
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
