// Tiny pointer-drag helper for resize handles.
// startDrag captures the pointer and streams physical deltas until release.

export function startDrag(
  e: React.PointerEvent,
  onMove: (dx: number, dy: number) => void,
  onEnd: () => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  const move = (ev: PointerEvent) => onMove(ev.clientX - startX, ev.clientY - startY);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    onEnd();
  };
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
