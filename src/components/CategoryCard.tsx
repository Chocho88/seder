// One category as a card: title row + item rows + quiet inline add.
// The card is a living object: drag its header to reorder cards; drop any
// item row onto it to move that item (and its sub-items) into this list.

import { useState } from 'react';
import { useSeder, topLevelOf } from '../lib/store';
import { dirProps } from '../lib/rtl';
import { t } from '../lib/i18n';
import { CATEGORY_COLOR_KEYS, type Category } from '../lib/types';
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
    dropOn,
    reorderCategory,
    updateCategory,
  } = useSeder();
  const [adding, setAdding] = useState('');
  const [over, setOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const top = topLevelOf(items, category.id);
  const open = top.filter((i) => !i.done);
  const done = top.filter((i) => i.done);

  const dragForeign = dragItemId !== null && items.find((i) => i.id === dragItemId)?.categoryId !== category.id;
  // the Pool is a system list - its name speaks the UI language
  const displayName = category.system ? t('pool') : category.name;

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
      data-system={category.system ? '' : undefined}
      data-drop={`cat:${category.id}`}
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
          void dropOn(`cat:${category.id}`);
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
        <span className="category-card-colorwrap">
          <button
            className="cat-dot cat-dot-button"
            aria-label="Color"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((o) => !o);
            }}
          />
          {pickerOpen && (
            <span className="category-colorpicker" onClick={(e) => e.stopPropagation()}>
              {CATEGORY_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  className={`category-colorswatch${key === category.colorKey ? ' current' : ''}`}
                  data-cat={key}
                  aria-label={key}
                  onClick={() => {
                    void updateCategory(category.id, { colorKey: key });
                    setPickerOpen(false);
                  }}
                />
              ))}
            </span>
          )}
        </span>
        <h2 className="category-card-title" {...dirProps(displayName)}>
          {displayName}
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
