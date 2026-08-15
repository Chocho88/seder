// One category as a card: title row + item rows + quiet inline add.
// The card is a living object: drag its header to reorder cards; drop any
// item row onto it to move that item into this list; drop onto a specific
// row to place it exactly there. Double-click the title to rename. Hover
// the header for sweep (when done items exist) and delete (items -> Pool).

import { useState } from 'react';
import { createPortal } from 'react-dom';
import icons from '../../vendor/design-system/icons.svg';
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
    dropOn,
    reorderCategory,
    updateCategory,
    deleteCategory,
    sweepDone,
  } = useSeder();
  const [adding, setAdding] = useState('');
  const [over, setOver] = useState(false);
  const [insertBefore, setInsertBefore] = useState<string | null>(null);
  const [endOver, setEndOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<React.CSSProperties>({});
  const [renaming, setRenaming] = useState<string | null>(null);
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

  const commitRename = () => {
    const name = renaming?.trim();
    if (name && name !== category.name) void updateCategory(category.id, { name });
    setRenaming(null);
  };

  return (
    <section
      className={`category-card${over ? ' drag-over' : ''}`}
      data-cat={category.colorKey}
      data-system={category.system ? '' : undefined}
      data-drop={`cat:${category.id}`}
      style={
        category.customColor
          ? ({
              '--cat-color': category.customColor,
              // the wash follows the hue: same 15% weight the presets use
              '--cat-tint': `color-mix(in srgb, ${category.customColor} 15%, transparent)`,
            } as React.CSSProperties)
          : undefined
      }
      onDragOver={(e) => {
        if (dragItemId || (dragCategoryId && dragCategoryId !== category.id)) {
          e.preventDefault();
          if (dragForeign || dragCategoryId) setOver(true);
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
        draggable={renaming === null}
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
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const rtl = document.documentElement.dir === 'rtl';
              // anchor under the dot; keep inside the viewport horizontally
              const width = 11 * 22 + 24;
              const left = rtl ? Math.max(8, r.right - width) : Math.min(r.left - 6, window.innerWidth - width - 8);
              setPickerPos({ top: r.bottom + 6, left: Math.max(8, left) });
              setPickerOpen((o) => !o);
            }}
          />
          {pickerOpen &&
            createPortal(
              <>
                <div className="colorpicker-scrim" onClick={() => setPickerOpen(false)} />
                <span
                  className="category-colorpicker"
                  data-cat={category.colorKey}
                  dir={document.documentElement.dir}
                  style={pickerPos}
                  onClick={(e) => e.stopPropagation()}
                >
                  {CATEGORY_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      className={`category-colorswatch${key === category.colorKey && !category.customColor ? ' current' : ''}`}
                      data-cat={key}
                      aria-label={key}
                      onClick={() => {
                        void updateCategory(category.id, { colorKey: key, customColor: null });
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                  {/* the eleventh circle: any color at all */}
                  <label
                    className={`category-colorswatch category-colorswatch-custom${category.customColor ? ' current' : ''}`}
                    title={t('custom_color')}
                    style={category.customColor ? { background: category.customColor } : undefined}
                  >
                    <input
                      type="color"
                      value={category.customColor ?? '#888888'}
                      onChange={(e) => void updateCategory(category.id, { customColor: e.target.value })}
                    />
                  </label>
                </span>
              </>,
              document.body,
            )}
        </span>

        {renaming !== null ? (
          <input
            className="category-card-rename"
            value={renaming}
            autoFocus
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(null);
            }}
            {...dirProps(renaming || category.name)}
          />
        ) : (
          <h2
            className="category-card-title"
            title={category.system ? undefined : t('rename_hint')}
            onDoubleClick={() => {
              if (!category.system) setRenaming(category.name);
            }}
            {...dirProps(displayName)}
          >
            {displayName}
          </h2>
        )}
        <span className={`category-card-count${open.length === 0 && done.length > 0 ? ' all-done' : ''}`}>
          {open.length > 0 ? open.length : done.length > 0 ? `${done.length} ✓` : 0}
        </span>

        {/* header hover actions - quiet until needed */}
        <span className="category-card-tools">
          {done.length > 0 && (
            <button
              className="item-action tooltip"
              data-tooltip={t('sweep_done')}
              aria-label={t('sweep_done')}
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                void sweepDone(category.id);
              }}
            >
              <svg className="icon">
                <use href={`${icons}#icon-check`} />
              </svg>
            </button>
          )}
          {!category.system && (
            <button
              className="item-action tooltip"
              data-tooltip={t('delete')}
              aria-label={t('delete')}
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                void deleteCategory(category.id);
              }}
            >
              <svg className="icon">
                <use href={`${icons}#icon-trash`} />
              </svg>
            </button>
          )}
        </span>
      </header>

      <div className="category-card-body">
        {category.system && top.length === 0 && <p className="pool-empty">{t('pool_empty')}</p>}
        {open.map((i) => (
          <div
            key={i.id}
            className={`card-slot${insertBefore === i.id ? ' insert-before' : ''}`}
            data-drop={`row:${i.id}`}
            onDragOver={(e) => {
              if (!dragItemId || dragItemId === i.id) return;
              e.preventDefault();
              e.stopPropagation();
              setInsertBefore(i.id);
            }}
            onDragLeave={() => setInsertBefore((v) => (v === i.id ? null : v))}
            onDrop={(e) => {
              e.stopPropagation();
              setInsertBefore(null);
              setOver(false);
              void dropOn(`row:${i.id}`);
            }}
          >
            <ItemRow item={i} />
          </div>
        ))}
        {/* end-of-list landing zone: appears while a top-level row is in the air */}
        {dragItemId && (
          <div
            className={`card-endzone${endOver ? ' drag-over' : ''}`}
            data-drop={`catend:${category.id}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEndOver(true);
            }}
            onDragLeave={() => setEndOver(false)}
            onDrop={(e) => {
              e.stopPropagation();
              setEndOver(false);
              setOver(false);
              void dropOn(`catend:${category.id}`);
            }}
          />
        )}
        {done.length > 0 && open.length > 0 && (
          <div className="category-card-donesep" aria-hidden>
            <span>{t('done_section')}</span>
          </div>
        )}
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
          // empty input inherits the UI direction so the placeholder stands
          // on the rows' start edge; typed content re-detects per-line
          {...(adding.trim() ? dirProps(adding) : {})}
        />
      </div>
    </section>
  );
}
