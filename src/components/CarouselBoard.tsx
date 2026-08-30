// Carousel: one big list at a time - "like an Instagram carousel" (the
// user's words). Swipe moves between lists; this is native horizontal
// scroll-snap, not hand-rolled gesture code - it's real touch scrolling,
// gets iOS momentum and gesture arbitration for free, and reads correctly
// in RTL without any sign-flipping math (see the history file's lesson on
// synthetic touch handling being a repeat source of bugs).

import { useEffect, useRef, useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { t } from '../lib/i18n';
import type { Category } from '../lib/types';
import CategoryCard from './CategoryCard';
import './carouselboard.css';

export default function CarouselBoard({ categories, ghost }: { categories: Category[]; ghost: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const slots = categories.length + 1; // +1 for the "new list" ghost slot

  // The Pool sorts first (order: -1) in every other view - but it is the
  // stray-capture inbox, not what anyone opens a carousel to look at.
  // Land one slide past it on first open; the Pool is still one swipe away.
  const skippedInitial = useRef(false);
  useEffect(() => {
    if (skippedInitial.current) return;
    skippedInitial.current = true;
    if (categories[0]?.system && categories.length > 1) {
      // scrollIntoView may also scroll the PAGE vertically (block:
      // 'nearest' is not a no-op when the track sits off-screen) - that
      // yanked the viewport when cycling into carousel. Undo the page
      // part; keep only the track's own horizontal scroll.
      const y = window.scrollY;
      cardRefs.current[1]?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
      window.scrollTo({ top: y });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // which card is most visible drives the dots - direction-agnostic,
  // unlike computing an index from raw scrollLeft (whose sign flips
  // across browsers in RTL)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const idx = cardRefs.current.indexOf(visible.target as HTMLDivElement);
        if (idx >= 0) setActive(idx);
      },
      { root: track, threshold: [0.5, 0.6, 0.7, 0.8, 0.9] },
    );
    cardRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [categories.length]);

  const goTo = (idx: number) => {
    const el = cardRefs.current[Math.max(0, Math.min(slots - 1, idx))];
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <div className="carousel-wrap">
      <div className="carousel-track" ref={trackRef}>
        {categories.map((c, i) => (
          <div className="carousel-slide" key={c.id} ref={(el) => (cardRefs.current[i] = el)}>
            <CategoryCard category={c} />
          </div>
        ))}
        <div className="carousel-slide carousel-slide-ghost" ref={(el) => (cardRefs.current[categories.length] = el)}>
          {ghost}
        </div>
      </div>

      {slots > 1 && (
        <>
          {/* glyphs point the RTL-default way (prev=start=right, next=end=left);
              carouselboard.css flips both under [dir='ltr'], same pattern as
              logbook.css's restore icon */}
          <button
            className="carousel-arrow carousel-arrow-prev pressable"
            aria-label={t('carousel_prev')}
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          >
            <svg className="icon">
              <use href={`${icons}#icon-chevron-right`} />
            </svg>
          </button>
          <button
            className="carousel-arrow carousel-arrow-next pressable"
            aria-label={t('carousel_next')}
            disabled={active === slots - 1}
            onClick={() => goTo(active + 1)}
          >
            <svg className="icon">
              <use href={`${icons}#icon-chevron-left`} />
            </svg>
          </button>
          <div className="carousel-dots" role="tablist">
            {Array.from({ length: slots }, (_, i) => (
              <button
                key={i}
                className={`carousel-dot${i === active ? ' on' : ''}`}
                role="tab"
                aria-selected={i === active}
                aria-label={`${i + 1} / ${slots}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
