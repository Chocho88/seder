// The Eisenhower matrix, drawn like the whiteboard original: two hairline
// axes forming a cross, classic axis labels in the margins, whitespace inside.
//
// The matrix MIRRORS the flags: the moment an item is marked urgent and/or
// important — anywhere in the app — it appears here, placed by exactly what
// is applied (an unset flag reads as "not"). Dragging any row (from a list,
// the shelf, or between quadrants) into a quadrant applies both flags; the
// tray below holds today's items that carry no flags yet.

import { useState } from 'react';
import { useSeder } from '../lib/store';
import { t, useLang } from '../lib/i18n';
import type { Item } from '../lib/types';
import ItemRow from './ItemRow';
import './matrix.css';

const LOCAL = {
  quadrant_clear: { en: 'All clear', he: 'פנוי' },
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

export default function MatrixView() {
  const { items, updateItem, dragItemId, setDragItem } = useSeder();
  const [lang] = useLang();
  const [overKey, setOverKey] = useState<string | null>(null);

  const pool = items.filter((i) => !i.done && i.parentId === null);
  const flagged = pool.filter((i) => i.urgent !== null || i.important !== null);
  const todayUnflagged = pool.filter((i) => i.today && i.urgent === null && i.important === null);

  const inQuadrant = (q: Quadrant): Item[] =>
    flagged.filter((i) => (i.urgent ?? false) === q.urgent && (i.important ?? false) === q.important);

  const drop = (patch: Pick<Item, 'urgent' | 'important'>) => {
    if (dragItemId) void updateItem(dragItemId, patch);
    setDragItem(null);
    setOverKey(null);
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
            onDrop={() => drop({ urgent: q.urgent, important: q.important })}
          >
            {inhabitants.length > 0 ? (
              inhabitants.map((i) => <ItemRow key={i.id} item={i} leaf />)
            ) : (
              <span className="matrix-quadrant-empty" aria-hidden>
                {LOCAL.quadrant_clear[lang]}
              </span>
            )}
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
          onDrop={() => drop({ urgent: null, important: null })}
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
