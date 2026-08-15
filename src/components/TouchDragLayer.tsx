// Touch drag controller: after a long-press picks a row up, this layer
// follows the finger, highlights [data-drop] targets, and executes the drop
// through the same store executor the mouse path uses.

import { useEffect, useRef } from 'react';
import { useSeder } from '../lib/store';
import { dirProps } from '../lib/rtl';
import './touchdrag.css';

export default function TouchDragLayer() {
  const { touchDrag, dragItemId, setTouchDrag, setDragItem, dropOn } = useSeder();
  const hoverEl = useRef<Element | null>(null);

  useEffect(() => {
    if (!touchDrag || !dragItemId) return;

    const clearHover = () => {
      hoverEl.current?.classList.remove('drag-over');
      hoverEl.current = null;
    };

    const move = (e: PointerEvent) => {
      e.preventDefault();
      setTouchDrag({ x: e.clientX, y: e.clientY, title: useSeder.getState().touchDrag?.title ?? '' });
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = under?.closest('[data-drop]') ?? null;
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
      if (key) void dropOn(key);
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
  }, [Boolean(touchDrag), dragItemId]);

  if (!touchDrag) return null;
  return (
    <div className="touchdrag-ghost" style={{ left: touchDrag.x, top: touchDrag.y }} {...dirProps(touchDrag.title)}>
      {touchDrag.title}
    </div>
  );
}
