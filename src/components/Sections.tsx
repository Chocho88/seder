// The canvas sections as standalone blocks. Each renders itself, knows when
// it's empty, and is wrapped by <SectionShell> which supplies the drag
// handle for reordering. Desktop and phone render the same list.

import { useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { useSeder, morningCandidates, endOfToday } from '../lib/store';
import { t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import type { SectionId } from '../lib/types';
import ItemRow from './ItemRow';
import MatrixView from './MatrixView';
import Board from './Board';

/* ------------------------------------------------------------------ */
/* Shell: the drag handle + drop target for reordering sections        */
/* ------------------------------------------------------------------ */
export function SectionShell({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const { dragSectionId, setDragSection, moveSection } = useSeder();
  const [over, setOver] = useState(false);
  return (
    <div
      className={`section-shell${over ? ' section-over' : ''}${dragSectionId === id ? ' section-dragging' : ''}`}
      data-section={id}
      onDragOver={(e) => {
        if (dragSectionId && dragSectionId !== id) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        if (dragSectionId) moveSection(dragSectionId, id);
        setDragSection(null);
      }}
    >
      <span
        className="section-handle"
        draggable
        title={t('sections_hint')}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          setDragSection(id);
        }}
        onDragEnd={() => setDragSection(null)}
        aria-hidden
      >
        <svg className="icon">
          <use href={`${icons}#icon-menu`} />
        </svg>
      </span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Date header + logbook entry                                          */
/* ------------------------------------------------------------------ */
export function DateSection() {
  const { setLogbookOpen } = useSeder();
  const [lang] = useLang();
  const dateLabel = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return (
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
  );
}

/* ------------------------------------------------------------------ */
/* Morning suggestions (rule-based) - "show more" beyond four            */
/* ------------------------------------------------------------------ */
export function SuggestionsSection() {
  const { items, setToday, updateItem } = useSeder();
  const [expanded, setExpanded] = useState(false);
  const all = morningCandidates(items);
  if (all.length === 0) return null;
  const shown = expanded ? all : all.slice(0, 4);
  const hidden = all.length - shown.length;
  return (
    <div className="canvas-suggestions">
      <h3 className="canvas-section-label">
        <svg className="icon" aria-hidden="true">
          <use href={`${icons}#icon-sun`} />
        </svg>
        {t('suggestions')}
      </h3>
      <div className="canvas-card-body">
        {shown.map((i) => (
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
        {hidden > 0 && (
          <button className="canvas-more pressable" onClick={() => setExpanded(true)}>
            +{hidden} {t('more_n')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Today shelf - the day's list, one drag away (twin of the Evening one) */
/* ------------------------------------------------------------------ */
export function TodaySection() {
  const { items, dragItemId, dropOn } = useSeder();
  const [over, setOver] = useState(false);
  // evening rows keep their own quieter shelf below
  const todayList = items.filter((i) => i.today && !i.evening && !i.done);
  const dragging = dragItemId !== null;
  return (
    <div
      className={`canvas-evening canvas-today${dragging ? ' drag-target' : ''}${over ? ' drag-over' : ''}${todayList.length === 0 && !dragging ? ' canvas-evening-empty' : ''}`}
      data-drop="today"
      onDragOver={(e) => {
        if (dragging) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        void dropOn('today');
      }}
    >
      <h3 className="canvas-section-label">
        <svg className="icon" aria-hidden="true">
          <use href={`${icons}#icon-sun`} />
        </svg>
        {t('section_today')}
      </h3>
      <div className="canvas-card-body">
        {todayList.length === 0 ? (
          <p className="canvas-empty-hint">{t('today_shelf_empty')}</p>
        ) : (
          todayList.map((i) => <ItemRow key={i.id} item={i} leaf reference />)
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* This Evening shelf                                                    */
/* ------------------------------------------------------------------ */
export function EveningSection() {
  const { items, dragItemId, dropOn } = useSeder();
  const [over, setOver] = useState(false);
  const eveningItems = items.filter((i) => i.evening && i.today && !i.done);
  // visible when populated, or while dragging (so tonight is one gesture away)
  const dragging = dragItemId !== null;
  return (
    <div
      className={`canvas-evening${dragging ? ' drag-target' : ''}${over ? ' drag-over' : ''}${eveningItems.length === 0 && !dragging ? ' canvas-evening-empty' : ''}`}
      data-drop="evening"
      onDragOver={(e) => {
        if (dragging) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        void dropOn('evening');
      }}
    >
      <h3 className="canvas-section-label">
        <svg className="icon" aria-hidden="true">
          <use href={`${icons}#icon-moon`} />
        </svg>
        {t('evening')}
      </h3>
      <div className="canvas-card-body">
        {eveningItems.length === 0 ? (
          <p className="canvas-empty-hint">{t('evening_empty')}</p>
        ) : (
          eveningItems.map((i) => <ItemRow key={i.id} item={i} leaf reference />)
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Done trail                                                            */
/* ------------------------------------------------------------------ */
export function DoneSection() {
  const { items, sweepDone } = useSeder();
  const doneToday = items.filter((i) => i.done);
  if (doneToday.length === 0) return null;
  return (
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
  );
}

/* ------------------------------------------------------------------ */
/* Pinned shelf                                                          */
/* ------------------------------------------------------------------ */
export function PinnedSection() {
  const { items, dragItemId, dropOn } = useSeder();
  const [over, setOver] = useState(false);
  const pinned = items.filter((i) => i.pinned && !i.done);
  const dragUnpinned = dragItemId !== null && !items.find((i) => i.id === dragItemId)?.pinned;
  if (pinned.length === 0 && !dragUnpinned) return null;
  return (
    <section
      className={`board-pinned${over ? ' drag-over' : ''}`}
      data-drop="pin"
      onDragOver={(e) => {
        if (dragUnpinned) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        if (dragUnpinned) void dropOn('pin');
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
            <ItemRow item={i} leaf reference />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Registry                                                              */
/* ------------------------------------------------------------------ */
export function renderSection(id: SectionId, opts: { matrixLip?: React.ReactNode } = {}) {
  switch (id) {
    case 'date':
      return <DateSection />;
    case 'today':
      return <TodaySection />;
    case 'suggestions':
      return <SuggestionsSection />;
    case 'pinned':
      return <PinnedSection />;
    case 'matrix':
      return (
        <>
          <MatrixView />
          {opts.matrixLip}
        </>
      );
    case 'evening':
      return <EveningSection />;
    case 'done':
      return <DoneSection />;
    case 'lists':
      return <Board />;
  }
}
