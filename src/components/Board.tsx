// Board view: pinned strip + masonry of category cards (calm Keep energy).

import icons from '../../../design-system/icons.svg';
import { useSeder } from '../lib/store';
import { t } from '../lib/i18n';
import ItemRow from './ItemRow';
import CategoryCard from './CategoryCard';
import './board.css';

export default function Board() {
  const { items, categories, addCategory } = useSeder();
  const pinned = items.filter((i) => i.pinned && !i.done);

  return (
    <div className="board">
      {pinned.length > 0 && (
        <section className="board-pinned">
          {/* Same header anatomy as the cards below: glyph slot + title +
              docked count. The glyph is the app's one pin mark (accent
              ring) — the same ring the source rows carry in their cards. */}
          <header className="board-pinned-header">
            <span className="board-pinned-glyph" aria-hidden />
            <h2 className="board-pinned-title">{t('pinned')}</h2>
            <span className="board-pinned-count">{pinned.length}</span>
          </header>
          <div className="board-pinned-items">
            {pinned.map((i) => (
              <div key={i.id} className="board-pin-chip">
                <ItemRow item={i} />
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="board-masonry">
        {categories.map((c) => (
          <CategoryCard key={c.id} category={c} />
        ))}
        <button
          className="board-add-category pressable"
          onClick={() => {
            const name = window.prompt(t('add_category'));
            if (name?.trim()) void addCategory(name.trim());
          }}
        >
          <svg className="icon" aria-hidden>
            <use href={`${icons}#icon-plus`} />
          </svg>
          {t('add_category')}
        </button>
      </div>
    </div>
  );
}
