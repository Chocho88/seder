// The Logbook (Things-style): everything ever completed and cleared,
// grouped by day, searchable, restorable. Loads from IndexedDB on open -
// archived items never weigh down the live store.

import { useEffect, useMemo, useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { db } from '../lib/db';
import { useSeder } from '../lib/store';
import { t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import type { Item } from '../lib/types';
import './logbook.css';

export default function LogbookPanel() {
  const { logbookOpen, setLogbookOpen, restoreItem, categories } = useSeder();
  const [lang] = useLang();
  const [entries, setEntries] = useState<Item[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!logbookOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLogbookOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [logbookOpen, setLogbookOpen]);

  useEffect(() => {
    if (!logbookOpen) return;
    setQ('');
    void db.items
      .filter((i) => i.archivedAt !== null)
      .toArray()
      .then((rows) => setEntries(rows.sort((a, b) => (b.doneAt ?? b.archivedAt ?? 0) - (a.doneAt ?? a.archivedAt ?? 0))));
  }, [logbookOpen]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? entries.filter((i) => i.title.toLowerCase().includes(needle) || i.notes.toLowerCase().includes(needle))
      : entries;
    const fmt = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const byDay = new Map<string, Item[]>();
    for (const i of filtered) {
      const key = fmt.format(new Date(i.deletedAt ?? i.doneAt ?? i.archivedAt ?? 0));
      byDay.set(key, [...(byDay.get(key) ?? []), i]);
    }
    return [...byDay.entries()];
  }, [entries, q, lang]);

  if (!logbookOpen) return null;

  return (
    <>
      <div className="logbook-scrim" onClick={() => setLogbookOpen(false)} />
      <aside className="logbook-panel">
        <header className="logbook-header">
          <svg className="icon icon-md" aria-hidden="true">
            <use href={`${icons}#icon-archive`} />
          </svg>
          <h2 className="logbook-title">{t('logbook')}</h2>
          <button className="detail-close pressable" aria-label="Close" onClick={() => setLogbookOpen(false)}>
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-x`} />
            </svg>
          </button>
        </header>
        <div className="logbook-search-wrap">
          <svg className="icon" aria-hidden="true">
            <use href={`${icons}#icon-search`} />
          </svg>
          <input
            className="logbook-search"
            placeholder={t('search_placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            {...(q ? dirProps(q) : {})}
          />
        </div>
        <div className="logbook-body">
          {groups.length === 0 && <p className="logbook-empty">{t('logbook_empty')}</p>}
          {groups.map(([day, rows]) => (
            <section key={day} className="logbook-day">
              <h3 className="logbook-day-label">{day}</h3>
              {rows.map((i) => {
                const cat = categories.find((c) => c.id === i.categoryId);
                return (
                  <div key={i.id} className={`logbook-row${i.deletedAt ? ' is-deleted' : ''}`} data-cat={cat?.colorKey}>
                    <span className="logbook-check" aria-hidden>
                      <svg className="icon">
                        <use href={`${icons}#icon-${i.deletedAt ? 'trash' : 'check'}`} />
                      </svg>
                    </span>
                    <span className="logbook-row-title" {...dirProps(i.title)}>
                      {i.title}
                    </span>
                    <button
                      className="item-action tooltip logbook-restore"
                      data-tooltip={t('restore')}
                      aria-label={t('restore')}
                      onClick={() => {
                        void restoreItem(i.id).then(() =>
                          db.items
                            .filter((x) => x.archivedAt !== null)
                            .toArray()
                            .then((rows) => setEntries(rows.sort((a, b) => (b.deletedAt ?? b.doneAt ?? b.archivedAt ?? 0) - (a.deletedAt ?? a.doneAt ?? a.archivedAt ?? 0)))),
                        );
                      }}
                    >
                      <svg className="icon">
                        <use href={`${icons}#icon-arrow-left`} />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
