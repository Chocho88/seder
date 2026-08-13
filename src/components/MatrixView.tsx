// The Eisenhower matrix. scope="today" = the daily triage ritual (only today
// items); scope="all" = on-demand whole-life lens. Classic axis labels only.
// Drag a card between quadrants to set importance/urgency.

import { useState } from 'react';
import { useSeder, todayItems } from '../lib/store';
import { t } from '../lib/i18n';
import type { Item } from '../lib/types';
import ItemRow from './ItemRow';
import './matrix.css';

type Quadrant = { urgent: boolean; important: boolean };

const QUADRANTS: Quadrant[] = [
  { urgent: true, important: true },
  { urgent: false, important: true },
  { urgent: true, important: false },
  { urgent: false, important: false },
];

export default function MatrixView({ scope }: { scope: 'today' | 'all' }) {
  const { items, updateItem } = useSeder();
  const [dragId, setDragId] = useState<string | null>(null);
  const pool = scope === 'today' ? todayItems(items) : items.filter((i) => !i.done && i.parentId === null);
  const placed = pool.filter((i) => i.urgent !== null && i.important !== null);
  const unplaced = pool.filter((i) => i.urgent === null || i.important === null);

  const inQuadrant = (q: Quadrant): Item[] =>
    placed.filter((i) => i.urgent === q.urgent && i.important === q.important);

  const drop = (q: Quadrant) => {
    if (!dragId) return;
    void updateItem(dragId, { urgent: q.urgent, important: q.important });
    setDragId(null);
  };

  return (
    <div className="matrix" data-scope={scope}>
      <div className="matrix-axis matrix-axis-x">
        <span>{t('urgent')}</span>
        <span>{t('not_urgent')}</span>
      </div>
      <div className="matrix-frame">
        <div className="matrix-axis matrix-axis-y">
          <span>{t('important')}</span>
          <span>{t('not_important')}</span>
        </div>
        <div className="matrix-grid">
          {QUADRANTS.map((q) => (
            <div
              key={`${q.urgent}-${q.important}`}
              className="matrix-quadrant"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(q)}
            >
              {inQuadrant(q).map((i) => (
                <div key={i.id} draggable onDragStart={() => setDragId(i.id)}>
                  <ItemRow item={i} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {unplaced.length > 0 && (
        <div className="matrix-unplaced">
          {unplaced.map((i) => (
            <div key={i.id} draggable onDragStart={() => setDragId(i.id)}>
              <ItemRow item={i} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
