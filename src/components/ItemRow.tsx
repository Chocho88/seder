// The atom of the whole app: one item as a light row.
// Surface = checkbox + title + quiet signals. Depth lives in the DetailPanel.

import icons from '../../../design-system/icons.svg';
import { useSeder, childrenOf, todayAgeDays } from '../lib/store';
import { itemState, itemVerb, itemWaitingFor } from '../lib/nextMove';
import { dirProps } from '../lib/rtl';
import { t } from '../lib/i18n';
import type { Item } from '../lib/types';
import './itemrow.css';

export default function ItemRow({ item, depth = 0 }: { item: Item; depth?: number }) {
  const { items, toggleDone, openItem, openItemId } = useSeder();
  const state = itemState(item);
  const verb = itemVerb(item);
  const waitingFor = itemWaitingFor(item);
  const kids = childrenOf(items, item.id);
  const age = item.today ? todayAgeDays(item) : 0;

  return (
    <>
      <div
        className={[
          'item-row',
          'pressable',
          state === 'wait' ? 'item-wait' : '',
          item.done ? 'item-done' : '',
          openItemId === item.id ? 'item-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={depth ? { paddingInlineStart: `calc(var(--space-4) + ${depth} * var(--space-5))` } : undefined}
        onClick={() => openItem(item.id)}
      >
        {item.kind === 'task' ? (
          <button
            className={`item-check ${item.done ? 'checked' : ''}`}
            aria-label={item.title}
            onClick={(e) => {
              e.stopPropagation();
              void toggleDone(item.id);
            }}
          >
            {item.done && (
              <svg className="icon">
                <use href={`${icons}#icon-check`} />
              </svg>
            )}
          </button>
        ) : (
          <span className="item-note-mark" aria-hidden />
        )}

        <span className="item-title" {...dirProps(item.title)}>
          {item.title}
        </span>

        <span className="item-signals">
          {age >= 2 && <span className="item-age">{age}{t('days_short')}</span>}
          {waitingFor && (
            <span className="item-waiting" {...dirProps(waitingFor)} title={`${t('waiting_for')} ${waitingFor}`}>
              {waitingFor}
            </span>
          )}
          {verb && (
            <span className="item-verb" title={verb.key}>
              <svg className="icon">
                <use href={`${icons}#icon-${verb.icon}`} />
              </svg>
            </span>
          )}
          {item.pinned && <span className="item-pin" title={t('pinned')} />}
          {(item.urgent || item.important) && (
            <span className="item-flags">
              {item.urgent && <i className="flag-urgent" title={t('urgent')} />}
              {item.important && <i className="flag-important" title={t('important')} />}
            </span>
          )}
          {kids.length > 0 && <span className="item-kidcount">{kids.filter((k) => k.done).length}/{kids.length}</span>}
        </span>
      </div>
      {kids.map((k) => (
        <ItemRow key={k.id} item={k} depth={depth + 1} />
      ))}
    </>
  );
}
