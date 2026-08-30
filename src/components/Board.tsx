// Lists pane dispatcher: picks Bento (resizable grid, the original),
// Gallery (dense Keep-style masonry) or Carousel (one big list at a time,
// swipe to the next - "like an Instagram carousel"). Matrix keeps its own
// permanent spot regardless of this switch - it only changes how the
// LISTS render. One unified switch, Keep-style: a single icon button that
// wears the current view's glyph and cycles bento → gallery → carousel.
// Swipe lives inside Carousel, where it is the whole point.

import { useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { BentoIcon, CarouselIcon, GalleryIcon } from './SederIcons';
import { useSeder } from '../lib/store';
import { t } from '../lib/i18n';
import type { ListView } from '../lib/types';
import BentoBoard from './BentoBoard';
import GalleryBoard from './GalleryBoard';
import CarouselBoard from './CarouselBoard';
import './board.css';

const MODES: { id: ListView; Icon: typeof BentoIcon; label: string }[] = [
  { id: 'bento', Icon: BentoIcon, label: 'view_bento' },
  { id: 'gallery', Icon: GalleryIcon, label: 'view_gallery' },
  { id: 'carousel', Icon: CarouselIcon, label: 'view_carousel' },
];

/** New list: the ghost becomes an inline input - no browser dialogs here.
    Shared by all three view modes. */
function NewListGhost({ onAdd }: { onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const commit = () => {
    if (name.trim()) onAdd(name.trim());
    setName('');
    setEditing(false);
  };
  if (!editing) {
    return (
      <button className="board-add-category pressable" onClick={() => setEditing(true)}>
        <svg className="icon" aria-hidden>
          <use href={`${icons}#icon-plus`} />
        </svg>
        {t('add_category')}
      </button>
    );
  }
  return (
    <div className="board-add-category board-add-editing">
      <input
        autoFocus
        className="board-add-input"
        placeholder={t('new_list_placeholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setName('');
            setEditing(false);
          }
        }}
      />
    </div>
  );
}

export default function Board() {
  const { categories, addCategory, listView, setListView, note } = useSeder();
  const ghost = <NewListGhost onAdd={(name) => void addCategory(name)} />;
  const modeIdx = Math.max(0, MODES.findIndex((m) => m.id === listView));
  const mode = MODES[modeIdx];
  const next = MODES[(modeIdx + 1) % MODES.length];

  return (
    <div className="board">
      <button
        className="board-viewswitch pressable tooltip"
        data-tooltip={`${t(mode.label)} · ${t('view_cycle')}`}
        aria-label={`${t(mode.label)} · ${t('view_cycle')}`}
        onClick={() => {
          setListView(next.id);
          // the glyph alone is mute on first use - say the new view's name
          note(t(next.label), 1400);
        }}
      >
        <mode.Icon className="icon" />
      </button>

      {listView === 'bento' && <BentoBoard categories={categories} ghost={ghost} />}
      {listView === 'gallery' && <GalleryBoard categories={categories} ghost={ghost} />}
      {listView === 'carousel' && <CarouselBoard categories={categories} ghost={ghost} />}
    </div>
  );
}
