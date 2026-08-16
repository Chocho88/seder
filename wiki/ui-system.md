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
Account - magic link form / avatar + sync now / sign out. All panels are
positioned physically (`.settings`, `.account` are `direction:ltr` wrappers)
and become full-width sheets on phones.

## RTL
`<html dir>` flips the chrome; the canvas grid is laid out physically
(matrix left, lists right in both languages) with each side restoring the
reading direction. Titles anchor to the checkbox edge whatever their script
(`:dir()` rules in itemrow.css). Keycaps (⌘K) force `direction:ltr`.
