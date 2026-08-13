// The Eisenhower matrix, drawn like the whiteboard original: two hairline
// axes forming a cross, classic axis labels in the margins, whitespace inside.
// scope="today" = the daily triage ritual (only today items); scope="all" =
// on-demand whole-life lens. Drag a card between quadrants to set
// importance/urgency; drop on the tray below to unplace it.

import { useState } from 'react';
import { useSeder, todayItems } from '../lib/store';
import { t, useLang } from '../lib/i18n';
import type { Item } from '../lib/types';
import ItemRow from './ItemRow';
import './matrix.css';

// Strings local to the matrix (chrome-level, not user content).
const LOCAL = {
  quadrant_clear: { en: 'All clear', he: 'פנוי' },
  unplaced: { en: 'Not placed', he: 'בלי מיקום' },
} as const;

type Quadrant = { urgent: boolean; important: boolean };

const QUADRANTS: Quadrant[] = [
  { urgent: true, important: true },
  { urgent: false, important: true },
  { urgent: true, important: false },
  { urgent: false, important: false },
];

const qKey = (q: Quadrant) => `${q.urgent ? 'u' : 'nu'}-${q.important ? 'i' : 'ni'}`;

export default function MatrixView({ scope }: { scope: 'today' | 'all' }) {
  const { items, updateItem } = useSeder();
  const [lang] = useLang();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const pool =
    scope === 'today' ? todayItems(items) : items.filter((i) => !i.done && i.parentId === null);
  const placed = pool.filter((i) => i.urgent !== null && i.important !== null);
  const unplaced = pool.filter((i) => i.urgent === null || i.important === null);

  const inQuadrant = (q: Quadrant): Item[] =>
    placed.filter((i) => i.urgent === q.urgent && i.important === q.important);

  const drop = (patch: Pick<Item, 'urgent' | 'important'>) => {
    if (dragId) void updateItem(dragId, patch);
    setDragId(null);
    setOverKey(null);
  };

  const draggable = (i: Item) => (
    <div
      key={i.id}
      draggable
      onDragStart={() => setDragId(i.id)}
      onDragEnd={() => {
        setDragId(null);
        setOverKey(null);
      }}
    >
      <ItemRow item={i} />
    </div>
  );

  return (
    <div className={`matrix${dragId ? ' matrix-dragging' : ''}`} data-scope={scope}>
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
              inhabitants.map(draggable)
            ) : (
              // Designed emptiness: a whisper marker so a vacant quadrant
              // reads as rest, not as an unfinished render.
              <span className="matrix-quadrant-empty" aria-hidden>
                {LOCAL.quadrant_clear[lang]}
              </span>
            )}
          </div>
        );
      })}

      {/* the cross itself — hairlines that stop short of the frame */}
      <span className="matrix-axis-v" aria-hidden />
      <span className="matrix-axis-h" aria-hidden />

      {(unplaced.length > 0 || dragId !== null) && (
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
          {unplaced.map(draggable)}
        </div>
      )}
    </div>
  );
}
