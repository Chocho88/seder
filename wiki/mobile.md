# Mobile

Breakpoint 768px. `App.tsx` swaps `<Canvas/>` for `<MobileCanvas/>` - the
same section list, one scrollable column (`src/styles/mobile.css`).

## What differs on the phone
- Capture pill: full-width bottom bar (`MobileBar`, also present on desktop
  as a corner pill with ⌘K hint).
- Row actions: no hover -> "⋯" `.item-more` opens the row menu; the drag
  path is long-press.
- Section reorder: no handles; Settings > Sections shows up/down arrows.
- Bento resize grips hidden; matrix uses phone geometry (see ui-system.md).
- Account/settings panels: `position:fixed` full-width sheets under the
  header. Detail/logbook: full-screen sheets.
- Empty Evening shelf collapses to one line.

## Touch drag - why it's built this way (read before touching it)
iOS Safari arbitrates gestures BEFORE the page: ~300ms into a touch it starts
a scroll or the selection loupe and cancels the page's pointer stream. So:
- rows: `-webkit-user-select:none; -webkit-touch-callout:none;
  touch-action: pan-y` (scroll allowed until a lift), and `touch-action:none`
  while a drag ghost exists;
- `ItemRow` arms the long-press on `pointerdown` (touch/pen only - mouse uses
  native drag), attaches a non-passive `touchmove` blocker on the row that
  `preventDefault`s once this row is the drag item;
- `TouchDragLayer` listens to `pointermove` AND non-passive `touchmove`
  (mirrors touch coords into the same handler), drops once on
  pointerup/touchend (guarded against double fire).
A click/tap that ends a lift is not a click (guards in onClick / .item-more).
