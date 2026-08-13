// Progressive depth: the full entity, unfolding in a side panel.
// Board stays visible behind. On phone this becomes a full-screen sheet.

import { useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder, childrenOf } from '../lib/store';
import { analyzeMove, itemState } from '../lib/nextMove';
import { dirProps } from '../lib/rtl';
import { t } from '../lib/i18n';
import ItemRow from './ItemRow';
import './detail.css';

export default function DetailPanel({ itemId }: { itemId: string }) {
  const { items, categories, updateItem, deleteItem, openItem, setToday, togglePinned, addItem } = useSeder();
  const item = items.find((i) => i.id === itemId);
  const [subTitle, setSubTitle] = useState('');
  if (!item) return null;

  const cat = categories.find((c) => c.id === item.categoryId);
  const state = itemState(item);
  const move = analyzeMove(item.nextMove || item.title);
  const kids = childrenOf(items, item.id);

  return (
    <>
      <div className="detail-scrim" onClick={() => openItem(null)} />
      <aside className="detail-panel" data-cat={cat?.colorKey}>
        <header className="detail-header">
          <span className="cat-dot" />
          <span className="detail-category">{cat?.name}</span>
          <span className={`detail-state detail-state-${state}`}>{t(`state_${state}`)}</span>
          <button className="header-toggle" aria-label="Close" onClick={() => openItem(null)}>
            <svg className="icon icon-md">
              <use href={`${icons}#icon-x`} />
            </svg>
          </button>
        </header>

        <textarea
          className="detail-title"
          value={item.title}
          rows={2}
          onChange={(e) => void updateItem(item.id, { title: e.target.value })}
          {...dirProps(item.title)}
        />

        <label className="detail-label">{t('next_move')}</label>
        <input
          className="detail-nextmove"
          value={item.nextMove}
          placeholder={t('next_move_placeholder')}
          onChange={(e) => void updateItem(item.id, { nextMove: e.target.value })}
          {...dirProps(item.nextMove || ' ')}
        />
        {move.state === 'wait' && move.waitingFor && (
          <p className="detail-waiting">
            {t('waiting_for')} <b {...dirProps(move.waitingFor)}>{move.waitingFor}</b>
          </p>
        )}

        <div className="detail-toggles">
          <button className={`detail-toggle ${item.today ? 'on' : ''}`} onClick={() => void setToday(item.id, !item.today)}>
            {t('today_flag')}
          </button>
          <button
            className={`detail-toggle ${item.urgent ? 'on' : ''}`}
            onClick={() => void updateItem(item.id, { urgent: item.urgent ? null : true })}
          >
            {t('urgent')}
          </button>
          <button
            className={`detail-toggle ${item.important ? 'on' : ''}`}
            onClick={() => void updateItem(item.id, { important: item.important ? null : true })}
          >
            {t('important')}
          </button>
          <button className={`detail-toggle ${item.pinned ? 'on' : ''}`} onClick={() => void togglePinned(item.id)}>
            {t('pin')}
          </button>
        </div>

        <label className="detail-label">{t('notes')}</label>
        <textarea
          className="detail-notes"
          value={item.notes}
          rows={4}
          onChange={(e) => void updateItem(item.id, { notes: e.target.value })}
          {...dirProps(item.notes || ' ')}
        />

        <label className="detail-label">{t('sub_items')}</label>
        <div className="detail-subitems">
          {kids.map((k) => (
            <ItemRow key={k.id} item={k} />
          ))}
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
            {...dirProps(subTitle || ' ')}
          />
        </div>

        <footer className="detail-footer">
          <button className="btn btn-ghost btn-sm detail-delete" onClick={() => void deleteItem(item.id)}>
            {t('delete')}
          </button>
        </footer>
      </aside>
    </>
  );
}
