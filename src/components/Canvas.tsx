// The holistic desktop surface — no tabs, no views. One canvas, like the
// whiteboard: the matrix side (today's battle plan) and the lists side
// (the whole life). Everything draggable; every region resizable — the
// split between the sides drags, the matrix pulls taller by its lower lip.

import { useRef, useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder, morningCandidates, endOfToday } from '../lib/store';
import { startDrag } from '../lib/resize';
import { t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import Board from './Board';
import MatrixView from './MatrixView';
import ItemRow from './ItemRow';
import './canvas.css';

const SPLIT_KEY = 'seder-split';
const ROWMIN_KEY = 'seder-matrix-rowmin';

export default function Canvas() {
  const { items, setToday, sweepDone, updateItem, suggestionsOn, setLogbookOpen, dragItemId, dropOn } = useSeder();
  const [lang] = useLang();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState<number>(() => Number(localStorage.getItem(SPLIT_KEY)) || 42);
  const [rowMin, setRowMin] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(ROWMIN_KEY));
    return v > 0 ? v : null;
  });
  const [eveningOver, setEveningOver] = useState(false);
  const suggestions = suggestionsOn ? morningCandidates(items).slice(0, 4) : [];
  const doneToday = items.filter((i) => i.done);
  const eveningItems = items.filter((i) => i.evening && i.today && !i.done);

  const dateLabel = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

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

  return (
    <div ref={canvasRef} className="canvas" style={{ ['--split' as string]: `${split}%` }}>
      <section className="canvas-side" style={rowMin ? { ['--matrix-row-min' as string]: `${rowMin}px` } : undefined}>
        <header className="canvas-date">
          <span className="canvas-date-dot" aria-hidden />
          <h1 className="canvas-date-label">{dateLabel}</h1>
          <button
            className="item-action tooltip canvas-logbook-btn"
            data-tooltip={t('logbook')}
            aria-label={t('logbook')}
            onClick={() => setLogbookOpen(true)}
          >
            <svg className="icon">
              <use href={`${icons}#icon-archive`} />
            </svg>
          </button>
        </header>

        {suggestions.length > 0 && (
          <div className="canvas-suggestions">
            <h3 className="canvas-section-label">
              <svg className="icon" aria-hidden="true">
                <use href={`${icons}#icon-sun`} />
              </svg>
              {t('suggestions')}
            </h3>
            <div className="canvas-card-body">
            {suggestions.map((i) => (
              <div key={i.id} className="canvas-suggestion">
                <span className="canvas-suggestion-title" {...dirProps(i.title)}>
                  {i.title}
                </span>
                <button
                  className="item-action tooltip"
                  data-tooltip={t('add_to_today')}
                  aria-label={t('add_to_today')}
                  onClick={() => void setToday(i.id, true)}
                >
                  <svg className="icon">
                    <use href={`${icons}#icon-calendar`} />
                  </svg>
                </button>
                <button
                  className="item-action tooltip"
                  data-tooltip={t('not_today')}
                  aria-label={t('not_today')}
                  onClick={() => void updateItem(i.id, { suggestSnooze: endOfToday(), nudge: null })}
                >
                  <svg className="icon">
                    <use href={`${icons}#icon-x`} />
                  </svg>
                </button>
              </div>
            ))}
            </div>
          </div>
        )}

        <MatrixView />
        <div
          className="canvas-matrix-lip"
          title={t('resize_hint')}
          onPointerDown={dragMatrixHeight}
          onDoubleClick={() => {
            setRowMin(null);
            localStorage.removeItem(ROWMIN_KEY);
          }}
        />

        {/* This Evening: today's quieter second shelf (Things). Always a
            drop target while dragging, so tonight is one gesture away. */}
        {(eveningItems.length > 0 || dragItemId !== null) && (
          <div
            className={`canvas-evening${dragItemId ? ' drag-target' : ''}${eveningOver ? ' drag-over' : ''}`}
            data-drop="evening"
            onDragOver={(e) => {
              e.preventDefault();
              setEveningOver(true);
            }}
            onDragLeave={() => setEveningOver(false)}
            onDrop={() => {
              void dropOn('evening');
              setEveningOver(false);
            }}
          >
            <h3 className="canvas-section-label">
              <svg className="icon" aria-hidden="true">
                <use href={`${icons}#icon-moon`} />
              </svg>
              {t('evening')}
            </h3>
            <div className="canvas-card-body">
              {eveningItems.map((i) => (
                <ItemRow key={i.id} item={i} leaf />
              ))}
            </div>
          </div>
        )}

        {doneToday.length > 0 && (
          <div className="canvas-done">
            <h3 className="canvas-section-label">
              <svg className="icon" aria-hidden="true">
                <use href={`${icons}#icon-check`} />
              </svg>
              <span className="canvas-done-count">{doneToday.length}</span>
              {t('done_today')}
              <button
                className="item-action tooltip canvas-sweep"
                data-tooltip={t('sweep_done')}
                aria-label={t('sweep_done')}
                onClick={() => void sweepDone()}
              >
                <svg className="icon">
                  <use href={`${icons}#icon-trash`} />
                </svg>
              </button>
            </h3>
            <div className="canvas-card-body">
              {doneToday.map((i) => (
                <ItemRow key={i.id} item={i} leaf />
              ))}
            </div>
          </div>
        )}
      </section>

      <div
        className="canvas-divider"
        role="separator"
        aria-orientation="vertical"
        onPointerDown={dragSplit}
        onDoubleClick={() => {
          setSplit(42);
          localStorage.setItem(SPLIT_KEY, '42');
        }}
      >
        <span className="canvas-divider-line" aria-hidden />
      </div>

      <section className="canvas-lists">
        <Board />
      </section>
    </div>
  );
}
