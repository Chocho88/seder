// Board view: pinned strip + masonry of category cards (calm Keep energy).

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
        <div className="board-pinned">
          <h3 className="board-pinned-title">{t('pinned')}</h3>
          <div className="board-pinned-items">
            {pinned.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </div>
        </div>
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
          + {t('add_category')}
        </button>
      </div>
    </div>
  );
}
