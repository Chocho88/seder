// One category as a card: title row + item rows + quiet inline add.
// The card is a living object: drag its header to reorder cards; drop any
// item row onto it to move that item (and its sub-items) into this list.

import { useState } from 'react';
import { useSeder, topLevelOf } from '../lib/store';
import { dirProps } from '../lib/rtl';
import { t } from '../lib/i18n';
import type { Category } from '../lib/types';
import ItemRow from './ItemRow';
import './categorycard.css';

export default function CategoryCard({ category }: { category: Category }) {
  const {
    items,
    addItem,
    dragItemId,
    dragCategoryId,
    setDragCategory,
    setDragItem,
    moveItemToCategory,
    reorderCategory,
  } = useSeder();
  const [adding, setAdding] = useState('');
  const [over, setOver] = useState(false);
  const top = topLevelOf(items, category.id);
  const open = top.filter((i) => !i.done);
  const done = top.filter((i) => i.done);

  const dragForeign = dragItemId !== null && items.find((i) => i.id === dragItemId)?.categoryId !== category.id;

  const submit = async () => {
    const title = adding.trim();
    if (!title) return;
    setAdding('');
    await addItem({ title, categoryId: category.id });
  };

  return (
    <section
      className={`category-card${over ? ' drag-over' : ''}`}
      data-cat={category.colorKey}
      onDragOver={(e) => {
        if (dragForeign || (dragCategoryId && dragCategoryId !== category.id)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        if (dragForeign && dragItemId) {
          void moveItemToCategory(dragItemId, category.id);
          setDragItem(null);
        } else if (dragCategoryId && dragCategoryId !== category.id) {
          void reorderCategory(dragCategoryId, category.id);
          setDragCategory(null);
        }
      }}
    >
      <header
        className="category-card-header"
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragCategory(category.id);
        }}
        onDragEnd={() => setDragCategory(null)}
      >
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
        {done.length > 0 && open.length > 0 && <div className="category-card-donesep" aria-hidden />}
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
