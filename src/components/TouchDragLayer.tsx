// Touch drag controller: after a long-press picks a row OR a list card up,
// this layer follows the finger, highlights [data-drop] targets, and
// executes the drop through the same store paths the mouse uses (dropOn
// for items; reorderCategory for cards, mirroring CategoryCard's onDrop).

import { useEffect, useRef } from 'react';
import { useSeder } from '../lib/store';
import { dirProps } from '../lib/rtl';
import './touchdrag.css';

export default function TouchDragLayer() {
  const { touchDrag, dragItemId, dragCategoryId, setTouchDrag, setDragItem, setDragCategory, dropOn, reorderCategory } =
    useSeder();
  const hoverEl = useRef<Element | null>(null);

  useEffect(() => {
    if (!touchDrag || (!dragItemId && !dragCategoryId)) return;

    const clearHover = () => {
      hoverEl.current?.classList.remove('drag-over');
      hoverEl.current = null;
    };

    const move = (e: PointerEvent) => {
      e.preventDefault();
      setTouchDrag({ x: e.clientX, y: e.clientY, title: useSeder.getState().touchDrag?.title ?? '' });
      const under = document.elementFromPoint(e.clientX, e.clientY);
      // a card in the air only lands on other cards; a row lands anywhere
      const catId = useSeder.getState().dragCategoryId;
      let target = under?.closest(catId ? '[data-drop^="cat:"]' : '[data-drop]') ?? null;
      if (catId && target?.getAttribute('data-drop') === `cat:${catId}`) target = null; // not onto itself
      if (target !== hoverEl.current) {
        clearHover();
        if (target) {
          target.classList.add('drag-over');
          hoverEl.current = target;
        }
      }
    };
    let finished = false; // pointerup and touchend both fire on iOS - drop once
    const up = () => {
      if (finished) return;
      finished = true;
      const key = hoverEl.current?.getAttribute('data-drop');
      clearHover();
      const catId = useSeder.getState().dragCategoryId;
      if (catId) {
        if (key?.startsWith('cat:') && key.slice(4) !== catId) void reorderCategory(catId, key.slice(4));
        setDragCategory(null);
        setTouchDrag(null);
      } else if (key) void dropOn(key);
      else setDragItem(null);
    };

    // iOS Safari: pointer events alone lose to the native scroll gesture.
    // A non-passive touchmove that preventDefaults keeps the finger ours,
    // and we mirror the touch position into the same move handler.
    const touchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) move({ clientX: t.clientX, clientY: t.clientY, preventDefault() {} } as unknown as PointerEvent);
    };
    const touchEnd = () => up();
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchEnd);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
      clearHover();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(touchDrag), dragItemId, dragCategoryId]);

  if (!touchDrag) return null;
  return (
    <div className="touchdrag-ghost" style={{ left: touchDrag.x, top: touchDrag.y }} {...dirProps(touchDrag.title)}>
      {touchDrag.title}
    </div>
  );
}
