// Progressive depth: the full entity, unfolding in a side panel.
// Board stays visible behind. On phone this becomes a full-screen sheet.
//
// Craft notes (Things-level bar):
// - One field language: every field is a borderless row on a single text
//   column. Blocks (next-move / notes / checklist) are grouped by whitespace
//   — about 1.75x the checklist's own rhythm — with no rules inside the
//   reading column; the footer's fence is the panel's only hairline.
//   Nothing is drawn as a box; nothing out-shouts the title.
// - One mark gutter: the title's done-check, the next-move state glyph, the
//   sub-item checkboxes and the add-row plus all occupy the same 18px slot,
//   so every line of text shares one inline-start edge.
// - Properties live at the bottom edge, out of the reading path.

import { useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder, childrenOf } from '../lib/store';
import { analyzeMove, itemState } from '../lib/nextMove';
import { dirProps } from '../lib/rtl';
import { t, getLang } from '../lib/i18n';
import ItemRow from './ItemRow';
import './detail.css';

// Local copy (i18n dict is outside this component's editable surface).
// Voice matches the app's other affordances: "להוסיף כל דבר…", "להוסיף להיום".
const ADD_NOTES = { en: 'Add notes…', he: 'להוסיף הערות…' } as const;

export default function DetailPanel({ itemId }: { itemId: string }) {
  const { items, categories, updateItem, deleteItem, openItem, setToday, togglePinned, toggleDone, addItem } =
    useSeder();
  const item = items.find((i) => i.id === itemId);
  const [subTitle, setSubTitle] = useState('');
  if (!item) return null;

  const cat = categories.find((c) => c.id === item.categoryId);
  const state = itemState(item);
  const move = analyzeMove(item.nextMove || item.title);
  const kids = childrenOf(items, item.id);

  // Empty fields inherit the UI direction (dir="auto" on an empty control
  // falls back to LTR, which misaligns Hebrew placeholders).
  const dirIf = (text: string) => (text.trim() ? dirProps(text) : {});

  return (
    <>
      <div className="detail-scrim" onClick={() => openItem(null)} />
      <aside className="detail-panel" data-cat={cat?.colorKey}>
        <header className="detail-header">
          <span className="cat-dot" />
          <span className="detail-category">{cat?.name}</span>
          <button className="detail-close pressable" aria-label="Close" onClick={() => openItem(null)}>
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-x`} />
            </svg>
          </button>
        </header>

        <div className="detail-body">
          <div className="detail-title-row">
            {item.kind === 'task' ? (
              <button
                role="checkbox"
                aria-checked={item.done}
                className={`item-check ${item.done ? 'checked' : ''}`}
                aria-label={item.title}
                onClick={() => void toggleDone(item.id)}
              >
                {/* drawn check — same mark the board rows wear */}
                <svg className="check-draw" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.5 6.5 L5 9 L9.5 3.5" />
                </svg>
              </button>
            ) : (
              <span className="item-note-mark" aria-hidden />
            )}
            <textarea
              className={`detail-title${item.done ? ' done' : ''}`}
              value={item.title}
              rows={1}
              onChange={(e) => void updateItem(item.id, { title: e.target.value })}
              {...dirProps(item.title)}
            />
          </div>

          <section className="detail-move" data-state={state}>
            <div className="detail-move-row">
              <span className="detail-move-glyph" aria-hidden />
              <input
                id="detail-move-input"
                className="detail-move-input"
                aria-label={t('next_move')}
                value={item.nextMove}
                placeholder={t('next_move_placeholder')}
                onChange={(e) => void updateItem(item.id, { nextMove: e.target.value })}
                {...dirIf(item.nextMove)}
              />
              <span className="detail-move-state">{t(`state_${state}`)}</span>
            </div>
            {state === 'wait' && move.waitingFor && (
              <p className="detail-waiting">
                {t('waiting_for')} <b {...dirProps(move.waitingFor)}>{move.waitingFor}</b>
              </p>
            )}
          </section>

          {/* Empty notes collapse to a single placeholder row (progressive
              depth) — the field earns height only when content exists. */}
          <div className="detail-notes-row">
            <textarea
              className="detail-notes"
              value={item.notes}
              rows={1}
              placeholder={ADD_NOTES[getLang()]}
              onChange={(e) => void updateItem(item.id, { notes: e.target.value })}
              {...dirIf(item.notes)}
            />
          </div>

          <section className="detail-subitems">
            {kids.map((k) => (
              <ItemRow key={k.id} item={k} />
            ))}
            <div className="detail-subitem-addrow">
              <span className="detail-subitem-plus" aria-hidden>
                <svg className="icon">
                  <use href={`${icons}#icon-plus`} />
                </svg>
              </span>
              <input
                className="detail-subitem-add"
                placeholder={t('add_item')}
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && subTitle.trim()) {
                    void addItem({ title: subTitle.trim(), categoryId: item.categoryId, parentId: item.id });
                    setSubTitle('');
                  }
                }}
                {...dirIf(subTitle)}
              />
            </div>
          </section>
        </div>

        <footer className="detail-footer">
          <div className="detail-toggles">
            <button
              className={`detail-toggle detail-toggle--today pressable ${item.today ? 'on' : ''}`}
              aria-pressed={!!item.today}
              onClick={() => void setToday(item.id, !item.today)}
            >
              {t('today_flag')}
            </button>
            <button
              className={`detail-toggle detail-toggle--urgent pressable ${item.urgent ? 'on' : ''}`}
              aria-pressed={!!item.urgent}
              onClick={() => void updateItem(item.id, { urgent: item.urgent ? null : true })}
            >
              {t('urgent')}
            </button>
            <button
              className={`detail-toggle detail-toggle--important pressable ${item.important ? 'on' : ''}`}
              aria-pressed={!!item.important}
              onClick={() => void updateItem(item.id, { important: item.important ? null : true })}
            >
              {t('important')}
            </button>
            <button
              className={`detail-toggle detail-toggle--pin pressable ${item.pinned ? 'on' : ''}`}
              aria-pressed={!!item.pinned}
              onClick={() => void togglePinned(item.id)}
            >
              {t('pin')}
            </button>
          </div>
          <button className="detail-delete pressable" aria-label={t('delete')} onClick={() => void deleteItem(item.id)}>
            <svg className="icon icon-sm">
              <use href={`${icons}#icon-trash`} />
            </svg>
          </button>
        </footer>
      </aside>
    </>
  );
}
