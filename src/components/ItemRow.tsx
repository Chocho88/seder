// The atom of the whole app: one item as a light row.
// Surface = checkbox + title + docked signal cluster. Depth lives in the DetailPanel.

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

  // Signals render only when earned — the cluster docks against the
  // title's edge, so an empty cluster must not leave a phantom gap.
  const hasRail = Boolean(item.pinned || kids.length > 0 || item.urgent || item.important || verb);
  const hasSignals = Boolean(waitingFor) || age >= 2 || hasRail;

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
            role="checkbox"
            aria-checked={item.done}
            className={`item-check ${item.done ? 'checked' : ''}`}
            aria-label={item.title}
            onClick={(e) => {
              e.stopPropagation();
              void toggleDone(item.id);
            }}
          >
            {/* drawn check — the path draws itself in on toggle */}
            <svg className="check-draw" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6.5 L5 9 L9.5 3.5" />
            </svg>
          </button>
        ) : (
          <span className="item-note-mark" aria-hidden />
        )}

        <span className="item-title" {...dirProps(item.title)}>
          {item.title}
        </span>

        {/* The signal cluster docks one gap unit off the title's edge —
            checkbox, title and marks read as ONE group; the row's
            inline-end stays deliberate whitespace. Fixed inside→out
            order: waiting · age · pin · count · urgent · important ·
            verb (hover-revealed, holding a reserved slot at the outer
            end so nothing shifts under the hand). */}
        {hasSignals && (
          <span className="item-signals">
            {waitingFor && (
              <span className="item-waiting" {...dirProps(waitingFor)} title={`${t('waiting_for')} ${waitingFor}`}>
                {waitingFor}
              </span>
            )}
            {age >= 2 && (
              <span className="item-age">
                <span>{age}</span>
                <span>{t('days_short')}</span>
              </span>
            )}
            {hasRail && (
              <span className="item-rail">
                {item.pinned && <span className="item-pin" title={t('pinned')} />}
                {kids.length > 0 && (
                  <span className="item-kidcount">
                    {kids.filter((k) => k.done).length}/{kids.length}
                  </span>
                )}
                {item.urgent && <i className="flag-urgent" title={t('urgent')} />}
                {item.important && <i className="flag-important" title={t('important')} />}
                {verb && (
                  <span className="item-verb" title={verb.key}>
                    <svg className="icon">
                      <use href={`${icons}#icon-${verb.icon}`} />
                    </svg>
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </div>
      {kids.map((k) => (
        <ItemRow key={k.id} item={k} depth={depth + 1} />
      ))}
    </>
  );
}
