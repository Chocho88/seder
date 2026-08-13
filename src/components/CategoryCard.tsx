// One category as a card: title row + item rows + quiet inline add.

import { useState } from 'react';
import { useSeder, topLevelOf } from '../lib/store';
import { dirProps } from '../lib/rtl';
import { t } from '../lib/i18n';
import type { Category } from '../lib/types';
import ItemRow from './ItemRow';
import './categorycard.css';

export default function CategoryCard({ category }: { category: Category }) {
  const { items, addItem } = useSeder();
  const [adding, setAdding] = useState('');
  const top = topLevelOf(items, category.id);
  const open = top.filter((i) => !i.done);
  const done = top.filter((i) => i.done);

  const submit = async () => {
    const title = adding.trim();
    if (!title) return;
    setAdding('');
    await addItem({ title, categoryId: category.id });
  };

  return (
    <section className="category-card" data-cat={category.colorKey}>
      <header className="category-card-header">
        <span className="cat-dot" />
        <h2 className="category-card-title" {...dirProps(category.name)}>
          {category.name}
        </h2>
        <span className="category-card-count">{open.length}</span>
      </header>
      <div className="category-card-body">
        {open.map((i) => (
          <ItemRow key={i.id} item={i} />
        ))}
        {done.map((i) => (
          <ItemRow key={i.id} item={i} />
        ))}
        <input
          className="category-card-add"
          placeholder={t('add_item')}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          {...dirProps(adding || ' ')}
        />
      </div>
    </section>
  );
}
