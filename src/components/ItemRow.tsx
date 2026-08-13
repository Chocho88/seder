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

  // One flag, one slot. A fixed-width gutter sits between checkbox and
  // title on EVERY row, so all titles share a single start edge. It holds
  // at most one glyph, and shape — not hue — carries the meaning:
  // triangle = urgent, diamond = important, ring = pinned. When states
  // stack, the loudest wins the slot; the detail panel holds the rest.
  const flag = item.urgent ? 'urgent' : item.important ? 'important' : item.pinned ? 'pinned' : null;
  const flagLabel = [
    item.urgent && t('urgent'),
    item.important && t('important'),
    item.pinned && t('pinned'),
  ]
    .filter(Boolean)
    .join(' · ');

  // Trailing metadata renders only when earned — it docks against the
  // title's edge, so an empty cluster must not leave a phantom gap.
  const hasSignals = Boolean(waitingFor) || age >= 2 || kids.length > 0 || Boolean(verb);

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

        {/* the flag slot: fixed width whether full or empty — this is
            what keeps every title on the same start edge */}
        <span className="item-flagslot" aria-hidden={!flag}>
          {flag && <span className={`item-flag item-flag-${flag}`} title={flagLabel} />}
        </span>

        <span className="item-title" {...dirProps(item.title)}>
          {item.title}
        </span>

        {/* Trailing metadata docks one gap unit off the title's edge —
            checkbox, title and text marks read as ONE group; the row's
            inline-end stays deliberate whitespace. Fixed inside→out
            order: waiting · age · count · verb (hover-revealed, holding
            a reserved slot at the outer end so nothing shifts under the
            hand). */}
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
            {kids.length > 0 && (
              <span className="item-kidcount">
                {kids.filter((k) => k.done).length}/{kids.length}
              </span>
            )}
            {verb && (
              <span className="item-verb" title={verb.key}>
                <svg className="icon">
                  <use href={`${icons}#icon-${verb.icon}`} />
                </svg>
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
