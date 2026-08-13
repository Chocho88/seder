// The minimum-mental-load home: today's matrix + list, morning suggestions,
// done trail with manual sweep.

import { useSeder, todayItems, morningCandidates } from '../lib/store';
import { t } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import MatrixView from './MatrixView';
import ItemRow from './ItemRow';
import './today.css';

export default function TodayView() {
  const { items, setToday, sweepDone } = useSeder();
  const today = todayItems(items);
  const doneToday = items.filter((i) => i.done && i.today);
  const suggestions = morningCandidates(items).slice(0, 5);

  return (
    <div className="today">
      <section className="today-main">
        {today.length === 0 && doneToday.length === 0 ? (
          <p className="today-empty">{t('today_empty')}</p>
        ) : (
          <MatrixView scope="today" />
        )}
        {doneToday.length > 0 && (
          <div className="today-done">
            <div className="today-done-header">
              <span>
                {doneToday.length} {t('done_today')}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => void sweepDone()}>
                {t('sweep_done')}
              </button>
            </div>
            {doneToday.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </div>
        )}
      </section>

      {suggestions.length > 0 && (
        <aside className="today-suggestions">
          <h3 className="today-suggestions-title">{t('suggestions')}</h3>
          {suggestions.map((i) => (
            <div key={i.id} className="today-suggestion">
              <span className="today-suggestion-title" {...dirProps(i.title)}>
                {i.title}
              </span>
              <div className="today-suggestion-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => void setToday(i.id, true)}>
                  {t('add_to_today')}
                </button>
              </div>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}
