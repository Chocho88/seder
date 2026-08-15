# Principles

## Who this is for
One person (Chocho) and, next, their wife - people who want to *relax*. The
user's own words after I sent them to click through a dashboard: **"tedious
work is your role. don't let me click stuff on things you can do yourself."**
Before writing "go to X and click Y", exhaust: connectors, the app browser
(they sign in once with "in." and you drive), CLI, or redesign the step away.

## Taste (the north star)
- **Calm map, minimum mental load.** Nothing competes for attention that
  doesn't have to. Motion is load: micro-interactions on interaction only.
- **Obsidian-calm, PostHog-clicky.** Ink-black text and lines (light theme),
  rich card tints, one accent, tactile press states. Not gray minimalism.
- **Things 3 is the craft bar** (press-kit screenshots in `references/presskit`):
  precise 1px seams, patient whitespace, one drawn field at a time.
- Accent green is the user's: `#329051` (dark theme lifts to `#3da266`).
- **Circles, never abstract glyphs.** Checkboxes are circles; no triangles/
  diamonds as status marks (user: "not intuitive"). Icons carry actions,
  tooltips carry words. SVG sprite only, no emojis.
- Colors must feel good, never generic - dusty custom palette, ten swatches
  plus a free color wheel per list.

## Hard rules
- **Never use an em-dash (—).** Anywhere. Use "-". A one-time migration strips
  it from data; don't reintroduce it in strings, seed, docs, or commits.
- Every visible string: `t('key')` with EN + HE. Every piece of user content:
  `{...dirProps(text)}` for per-line direction.
- CSS logical properties (inline-start/end), never left/right, except where a
  popover is positioned physically on purpose (documented inline).
- **Verify touch with real input** (CDP touch events or WebKit), with the
  target ON SCREEN. Synthetic pointer events and off-screen targets produced
  false passes twice. See testing.md.
- Never sacrifice one platform for the other: desktop and phone render the
  same section list; a feature ships on both or is explicitly deferred.

## Working style that landed well
- Fix the *class* of bug, then add an invariant test so it cannot recur.
- Report faithfully: if a test was synthetic, say so; if a step is skipped,
  say so.
