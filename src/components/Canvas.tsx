// The holistic desktop surface — no tabs, no views. One canvas, like the
// whiteboard: the matrix side (today's battle plan) and the lists side
// (the whole life), everything visible, everything draggable between.

import icons from '../../../design-system/icons.svg';
import { useSeder, morningCandidates } from '../lib/store';
import { t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import Board from './Board';
import MatrixView from './MatrixView';
import ItemRow from './ItemRow';
import './canvas.css';

export default function Canvas() {
  const { items, setToday, sweepDone, updateItem } = useSeder();
  const [lang] = useLang();
  const suggestions = morningCandidates(items).slice(0, 4);
  const doneToday = items.filter((i) => i.done);

  const dateLabel = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="canvas">
      <section className="canvas-side">
        <header className="canvas-date">
          <span className="canvas-date-dot" aria-hidden />
          <h1 className="canvas-date-label">{dateLabel}</h1>
        </header>

        {suggestions.length > 0 && (
          <div className="canvas-suggestions">
            <h3 className="canvas-section-label">
              <svg className="icon" aria-hidden="true">
                <use href={`${icons}#icon-sun`} />
              </svg>
              {t('suggestions')}
            </h3>
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
                  data-tooltip={t('dismiss')}
                  aria-label={t('dismiss')}
                  onClick={() => void updateItem(i.id, { urgent: i.urgent, nudge: null })}
                >
                  <svg className="icon">
                    <use href={`${icons}#icon-x`} />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <MatrixView />

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
            {doneToday.map((i) => (
              <ItemRow key={i.id} item={i} leaf />
            ))}
          </div>
        )}
      </section>

      <section className="canvas-lists">
        <Board />
      </section>
    </div>
  );
}
