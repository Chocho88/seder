// All view: every open item in one flat, scannable list grouped by state.
// The "what can I actually push right now?" answer lives here.

import { useSeder } from '../lib/store';
import { itemState } from '../lib/nextMove';
import { t } from '../lib/i18n';
import type { ItemState } from '../lib/types';
import ItemRow from './ItemRow';

const GROUPS: ItemState[] = ['do', 'wait', 'shape'];

export default function AllView() {
  const { items } = useSeder();
  const open = items.filter((i) => !i.done && i.parentId === null);

  return (
    <div className="allview">
      {GROUPS.map((g) => {
        const group = open.filter((i) => itemState(i) === g);
        if (group.length === 0) return null;
        return (
          <section key={g} style={{ marginBottom: 'var(--space-6)' }}>
            <h3
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-medium)' as any,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-caps)',
                color: g === 'do' ? 'var(--color-accent-dark)' : 'var(--text-tertiary)',
                margin: '0 0 var(--space-2)',
                textAlign: 'start',
              }}
            >
              {t(`state_${g}`)} · {group.length}
            </h3>
            {group.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
