# UI system

Tokens live in the vendored KLOD design system (Clean preset) plus
`src/styles/seder.css` (accent, palette, ink overrides, card styles).
Every surface = `Component.tsx` + `component.css`, side by side.

## The canonical row (`ItemRow.tsx` / `itemrow.css`)
ONE row drawn the same everywhere (cards, matrix chips, shelves, done trail):
34px min-height, 18px circle checkbox, 12px checkbox-to-title, title
shrink-to-fit with ellipsis, then a rest cluster (deadline flag, pin, wait
clock, age "2d", sub-count, depth mark), then **hover actions as an in-flow
flex sibling** (calendar / pin / trash) - zero width at rest, never an
overlay, so it can never overhang the card or cover the title. Right-click
opens `RowMenu` (today/evening/pin/move-to/delete); on touch the same menu
sits behind a "⋯" button (`.item-more`). Hover 380ms -> `HoverCard` preview
(state, next move, notes, age) via portal. `reference` prop = lighter
rendering for pinned/evening pointers. `data-cat` on the row supplies
`--cat-color/--cat-tint`; custom colors are inlined as CSS vars.

## Icons
Vendor sprite (`vendor/design-system/icons.svg`) via `<use href>`; app-local
icons are inline React components in `SederIcons.tsx` - NEVER a local .svg
sprite (Vite inlines small assets as data: URIs and `<use>` cannot resolve a
fragment inside one; this failed silently once).

## Cards (`CategoryCard.tsx`, `Board.tsx`)
Bento grid (`.board-bento`, dense, 8px row unit): each card spans `w`
columns, natural or fixed `h` (content scrolls). Corner grip resizes,
double-click resets. Header: color dot (opens the picker - a **portal**, so
the card's `overflow:hidden` can't clip it), title (double-click renames),
open count (or "N ✓" when all done), a small always-on two-person mark when
the list is shared, hover tools (share popover - see sharing.md - then
sweep, delete; a member of a shared list gets leave-in-popover instead of
delete). Body:
rows in `.card-slot` drop targets (insertion line), a `.card-endzone` while
dragging (drop at end), labeled done separator, inline add. Card body has
`overflow-x: clip` - nothing may poke past the frame (geometry test).

### Lists view switcher (`Board.tsx` dispatches to `BentoBoard` /
`GalleryBoard` / `CarouselBoard.tsx`)
Three ways to browse the SAME lists, click/tap to switch (not gesture -
swipe is reserved for inside Carousel, where it is the point); persisted
like `cardStyle` (`listView` in the store, `?listview=` URL-addressable).
The Matrix keeps its own permanent spot regardless of this switch - it
only changes the lists pane.
- **Bento** (default): today's resizable grid, unchanged.
- **Gallery**: real CSS multi-column masonry, natural height, no resize -
  for scanning many lists at once. The column count reacts to `.board`'s
  own width via **container queries**, not viewport media queries - the
  lists pane is usually far narrower than the viewport (desktop's split),
  and a viewport breakpoint once crammed 4 columns into a ~700px pane and
  crushed every title to a few letters.
- **Carousel**: one big list at a time - "like an Instagram carousel"
  (the user's phrase). Native `scroll-snap-type: x`, not hand-rolled
  gesture code - real touch scrolling, iOS momentum and gesture
  arbitration for free. Landing slide skips a leading Pool (system list)
  since it's usually near-empty; `align-items: flex-start` on the track
  so a short list is never stretched to its tallest neighbor's height.
  Desktop gets click arrows + dot indicators; RTL-correct via the same
  "draw for RTL, flip under `[dir='ltr']`" pattern as the logbook restore
  icon. Rows normally lock `touch-action: pan-y` (itemrow.css) so a touch
  on a row still scrolls the page - inside a carousel slide specifically
  that's widened to `pan-x pan-y` so the same touch-start can also reach
  the horizontal track; scoped to `.carousel-slide .item-row` only.

## Matrix (`MatrixView.tsx`)
Two hairline axes inside one card frame; classic labels; quadrants are drop
targets (`data-drop="q:u-i"` etc.), rows inside are `.matrix-slot` drop
targets (`q:key:before:id`) for manual order; tray = today items with no
flags. Mirrors flags: any item with urgent/important set appears. Phone: two
full-width columns, y-labels become in-quadrant captions (`data-caption`).

## Drag (one system, two inputs)
- Mouse: native HTML5 drag on rows/cards/section handles.
- Touch: long-press (320ms) lifts the row -> `TouchDragLayer` follows the
  finger, highlights `[data-drop]` under it, calls `store.dropOn(key)`.
- All drops go through `store.dropOn(key)`: `q:<u|nu>-<i|ni>[:before:<id>]`,
  `tray`, `evening`, `row:<id>` (reorder / sub-item reorder), `catend:<id>`,
  `cat:<id>` (move, or to-end if same list), `pin`.

## Panels
Detail (`DetailPanel`) - floating card, one text column, next-move field,
notes, dates (deadline / check-in), sub-items, icon toggles footer; Esc
closes. Logbook - sliding drawer, day groups, search, restore. Settings -
theme (light/dark/auto), card style, font size (S/M/L via `data-fontsize`),
colored lists, Sections editor, logbook, backup export/import, reset layout.
Account - Google button (primary) + magic link form / avatar + LIVE sync
state (pending changes count, last-synced time) + sync now / sign out. All panels are
positioned physically (`.settings`, `.account` are `direction:ltr` wrappers)
and become full-width sheets on phones.

## RTL
`<html dir>` flips the chrome; the canvas grid is laid out physically
(matrix left, lists right in both languages) with each side restoring the
reading direction. Titles anchor to the checkbox edge whatever their script
(`:dir()` rules in itemrow.css). Keycaps (⌘K) force `direction:ltr`.
