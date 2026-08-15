# Testing & verification

There is no unit-test suite; verification is **behavioral in a real
browser**, and it must be honest. Dev server: `npm run dev` (port 5183,
`host: true` for LAN/phone).

## Commands
- `npm run check` = `tsc --noEmit` + geometry invariants. Run before every push.
- `npm run check:geometry` -> `scripts/geometry-check.mjs`: hovers every row
  in every card at desktop/narrow/phone widths, HE and EN, and fails if any
  element inside a card crosses the card frame, if actions overlap a title,
  or if the page scrolls horizontally.
- `node scripts/shot.mjs <name> "<query>" [--mobile] [--full]` -> PNG in
  `shots/`. Query keys: `lang, theme, cardstyle, open=first|<id>, capture=1,
  seed=fresh` (see urlState.ts).

## Rules learned the hard way
1. **Touch must be tested with real touch input**: Chromium via CDP
   `Input.dispatchTouchEvent` (touchStart / touchMove... / touchEnd) in an
   iPhone device profile, or WebKit. Synthetic `PointerEvent`/`Touch`
   constructors are rejected by WebKit and bypass gesture arbitration in
   Chromium - they produce false passes.
2. **The target must be on screen.** Playwright's `boundingBox()` returns
   off-viewport coordinates happily; a touch there hits `<html>`. Call
   `scrollIntoViewIfNeeded()` first and sanity-check `elementFromPoint`.
3. Don't `import('/src/lib/store.ts')` from `page.evaluate` - Vite serves a
   second module instance with an empty store. Read the DOM, or IndexedDB
   directly (`indexedDB.open('seder')`).
4. `dragAndDrop()` resolves the target before React re-renders after
   dragstart; for targets that only exist mid-drag (end zones), dispatch
   `dragstart` then `dragover/drop` manually.
5. React `onChange` on inputs needs the native value setter + `input` event.

## What "verified" means in a report
State the engine, the input type, and the assertion. "Verified with real
touch on WebKit iPhone: lifted, dropped into Evening, item moved" - not
"tests pass".
