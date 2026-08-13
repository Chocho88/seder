// The minimum-mental-load home: a dated header, today's matrix drawn as a
// calm cross, morning suggestions aside, and the done trail below.

import { useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder, todayItems, morningCandidates } from '../lib/store';
import { t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import MatrixView from './MatrixView';
import ItemRow from './ItemRow';
import './today.css';

export default function TodayView() {
  const { items, setToday, sweepDone } = useSeder();
  const [lang] = useLang();
  // Rejected suggestions stay away for the session; tomorrow is a new morning.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const today = todayItems(items);
  const doneToday = items.filter((i) => i.done && i.today);
  const suggestions = morningCandidates(items)
    .filter((i) => !dismissed.has(i.id))
    .slice(0, 5);
  const empty = today.length === 0 && doneToday.length === 0;

  const dateLabel = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  return (
    <div className="today">
      <header className="today-header">
        <span className="today-mark" aria-hidden />
        <h1 className="today-title">{t('view_today')}</h1>
        <span className="today-date">{dateLabel}</span>
      </header>

      <div className="today-body">
        <section className="today-main">
          {empty ? (
            <div className="today-empty">
              <span className="today-empty-ring" aria-hidden />
              <p>{t('today_empty')}</p>
            </div>
          ) : (
            <MatrixView scope="today" />
          )}

          {doneToday.length > 0 && (
            <section className="today-done">
              <header className="today-done-header">
                <span className="today-done-count">
                  {doneToday.length} {t('done_today')}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => void sweepDone()}>
                  {t('sweep_done')}
                </button>
              </header>
              {doneToday.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </section>
          )}
        </section>

        {suggestions.length > 0 && (
          <aside className="today-suggestions">
            <h2 className="today-suggestions-title">
              <svg className="icon" aria-hidden>
                <use href={`${icons}#icon-sun`} />
              </svg>
              {t('suggestions')}
            </h2>
            {suggestions.map((i) => (
              <div key={i.id} className="today-suggestion">
                <span className="today-suggestion-title" {...dirProps(i.title)}>
                  {i.title}
                </span>
                <div className="today-suggestion-actions">
                  <button
                    className="suggestion-accept pressable"
                    onClick={() => void setToday(i.id, true)}
                  >
                    {t('add_to_today')}
                  </button>
                  <button className="suggestion-dismiss pressable" onClick={() => dismiss(i.id)}>
                    {t('dismiss')}
                  </button>
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
