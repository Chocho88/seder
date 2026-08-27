// The holistic desktop surface - no tabs, no views. One canvas, like the
// whiteboard: a matrix side and a lists side. Every section is a block the
// user can toggle (settings) and drag into any order (section handle).
// The split between the sides drags; the matrix pulls taller by its lip.
//
// Side membership is FIXED (MATRIX_SIDE below), not derived from array
// position: date/today/suggestions/matrix/evening/done/pinned always live
// left, lists always lives right. Dragging a section's order (Settings >
// Sections) only reorders it within its own side. Position used to decide
// the side too - dragging 'lists' above 'matrix' left the matrix side
// empty and dumped everything onto one side, wasting half the screen.

import { useRef, useState } from 'react';
import { useSeder } from '../lib/store';
import { startDrag } from '../lib/resize';
import { t } from '../lib/i18n';
import { SectionShell, renderSection } from './Sections';
import './canvas.css';

const SPLIT_KEY = 'seder-split';
const ROWMIN_KEY = 'seder-matrix-rowmin';
const MATRIX_SIDE = new Set(['date', 'today', 'suggestions', 'matrix', 'evening', 'done', 'pinned']);

export default function Canvas() {
  const { sections } = useSeder();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState<number>(() => Number(localStorage.getItem(SPLIT_KEY)) || 42);
  const [rowMin, setRowMin] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(ROWMIN_KEY));
    return v > 0 ? v : null;
  });

  const dragSplit = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = split;
    let final = start;
    startDrag(
      e,
      (dx) => {
        final = Math.min(65, Math.max(25, start + (dx / rect.width) * 100));
        setSplit(final);
      },
      () => localStorage.setItem(SPLIT_KEY, String(Math.round(final * 10) / 10)),
    );
  };

  const dragMatrixHeight = (e: React.PointerEvent) => {
    const start = rowMin ?? 220;
    let final = start;
    startDrag(
      e,
      (_dx, dy) => {
        final = Math.min(480, Math.max(120, start + dy / 2));
        setRowMin(final);
      },
      () => localStorage.setItem(ROWMIN_KEY, String(Math.round(final))),
    );
  };

  const matrixLip = (
    <div
      className="canvas-matrix-lip"
      title={t('resize_hint')}
      onPointerDown={dragMatrixHeight}
      onDoubleClick={() => {
        setRowMin(null);
        localStorage.removeItem(ROWMIN_KEY);
      }}
    />
  );

  const on = sections.filter((s) => s.on);
  const leftSide = on.filter((s) => MATRIX_SIDE.has(s.id));
  const rightSide = on.filter((s) => !MATRIX_SIDE.has(s.id));

  return (
    <div ref={canvasRef} className="canvas" style={{ ['--split' as string]: `${split}%` }}>
      <section className="canvas-side" style={rowMin ? { ['--matrix-row-min' as string]: `${rowMin}px` } : undefined}>
        {leftSide.map((s) => (
          <SectionShell key={s.id} id={s.id}>
            {renderSection(s.id, { matrixLip })}
          </SectionShell>
        ))}
      </section>

      <div
        className="canvas-divider"
        role="separator"
        aria-orientation="vertical"
        title={t('resize_hint')}
        onPointerDown={dragSplit}
        onDoubleClick={() => {
          setSplit(42);
          localStorage.setItem(SPLIT_KEY, '42');
        }}
      >
        <span className="canvas-divider-line" aria-hidden />
      </div>

      <section className="canvas-lists">
        {rightSide.map((s) => (
          <SectionShell key={s.id} id={s.id}>
            {renderSection(s.id)}
          </SectionShell>
        ))}
      </section>
    </div>
  );
}
