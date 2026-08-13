// The lists as a bento grid: dense packing, every card resizable by its
// corner grip — width snaps to grid columns, height is free (content
// scrolls). Natural-height cards are measured and packed automatically.

import { useLayoutEffect, useRef, useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder } from '../lib/store';
import { startDrag } from '../lib/resize';
import { t } from '../lib/i18n';
import type { Category } from '../lib/types';
import ItemRow from './ItemRow';
import CategoryCard from './CategoryCard';
import './board.css';

const ROW_UNIT = 8; // grid-auto-rows px — fine granularity for dense packing
const GRID_GAP = 20;

const rowsFor = (px: number) => Math.max(6, Math.ceil((px + GRID_GAP) / (ROW_UNIT + GRID_GAP)));

/** One bento cell: measures itself when natural, obeys the grip when sized. */
function BentoItem({ category, children }: { category: Category; children: React.ReactNode }) {
  const { updateCategory } = useSeder();
  const cellRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [naturalPx, setNaturalPx] = useState(0);
  const [live, setLive] = useState<{ w: number; h: number } | null>(null);

  const w = live?.w ?? category.w ?? 2;
  const fixedH = live?.h ?? category.h ?? null;

  // natural height tracking (only drives layout while unfixed)
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNaturalPx(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = fixedH ?? naturalPx;

  const grip = (e: React.PointerEvent) => {
    const cell = cellRef.current;
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const grid = cell.parentElement!.getBoundingClientRect();
    const cols = getComputedStyle(cell.parentElement!).gridTemplateColumns.split(' ').length;
    const colPx = (grid.width - (cols - 1) * GRID_GAP) / cols;
    const rtl = document.documentElement.dir === 'rtl';
    const startW = rect.width;
    const startH = rect.height;
    let final = { w: category.w ?? 2, h: startH };
    startDrag(
      e,
      (dx, dy) => {
        const wantPx = startW + (rtl ? -dx : dx);
        const wantCols = Math.min(cols, Math.max(1, Math.round((wantPx + GRID_GAP) / (colPx + GRID_GAP))));
        const wantH = Math.max(80, startH + dy);
        final = { w: wantCols, h: wantH };
        setLive(final);
      },
      () => {
        setLive(null);
        void updateCategory(category.id, { w: final.w, h: Math.round(final.h) });
      },
    );
  };

  return (
    <div
      ref={cellRef}
      className={`bento-item${fixedH !== null ? ' bento-fixed' : ''}`}
      style={{ gridColumn: `span ${w}`, gridRow: `span ${rowsFor(h)}` }}
    >
      <div ref={innerRef} className="bento-inner" style={fixedH !== null ? { height: fixedH } : undefined}>
        {children}
      </div>
      <span
        className="bento-grip"
        title=""
        onPointerDown={grip}
        onDoubleClick={() => void updateCategory(category.id, { w: 2, h: null })}
      />
    </div>
  );
}

export default function Board() {
  const { items, categories, addCategory, dragItemId, dropOn } = useSeder();
  const pinned = items.filter((i) => i.pinned && !i.done);
  const [pinOver, setPinOver] = useState(false);
  const dragUnpinned = dragItemId !== null && !items.find((i) => i.id === dragItemId)?.pinned;

  return (
    <div className="board">
      {(pinned.length > 0 || dragUnpinned) && (
        <section
          className={`board-pinned${pinOver ? ' drag-over' : ''}`}
          data-drop="pin"
          onDragOver={(e) => {
            if (dragUnpinned) {
              e.preventDefault();
              setPinOver(true);
            }
          }}
          onDragLeave={() => setPinOver(false)}
          onDrop={() => {
            setPinOver(false);
            if (dragUnpinned && dragItemId) void dropOn('pin');
          }}
        >
          <header className="board-pinned-header">
            <span className="board-pinned-glyph" aria-hidden />
            <h2 className="board-pinned-title">{t('pinned')}</h2>
            <span className="board-pinned-count">{pinned.length}</span>
          </header>
          <div className="board-pinned-items">
            {pinned.map((i) => (
              <div key={i.id} className="board-pin-chip">
                <ItemRow item={i} leaf />
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="board-bento">
        {categories.map((c) => (
          <BentoItem key={c.id} category={c}>
            <CategoryCard category={c} />
          </BentoItem>
        ))}
        <button
          className="board-add-category pressable"
          onClick={() => {
            const name = window.prompt(t('add_category'));
            if (name?.trim()) void addCategory(name.trim());
          }}
        >
          <svg className="icon" aria-hidden>
            <use href={`${icons}#icon-plus`} />
          </svg>
          {t('add_category')}
        </button>
      </div>
    </div>
  );
}
