// The decide-by-looking switcher: card style variations, cycled in place.

import { useSeder } from '../lib/store';
import { t } from '../lib/i18n';
import type { CardStyle } from '../lib/types';

const ORDER: CardStyle[] = ['mono', 'tint', 'header'];

export default function StyleSwitcher() {
  const { cardStyle, setCardStyle } = useSeder();
  const next = ORDER[(ORDER.indexOf(cardStyle) + 1) % ORDER.length];
  return (
    <button
      className="header-toggle lang-toggle"
      title={`Card style: ${cardStyle}`}
      onClick={() => setCardStyle(next)}
    >
      {t(`style_${cardStyle}`)}
    </button>
  );
}
