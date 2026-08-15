# History - decisions and reversals (don't re-argue these)

- **Brainstorm (2026-08-13):** Next Move model, matrix-as-daily-ritual,
  real sync from day one, Things 3 as the bar. Spec:
  `/Users/chochosages/Desktop/BASES/KLOD/projects-app-spec.md`.
- **Gauntlet build:** builder/critic loops vs Things 3 press-kit; the blind
  critic never picked ours (fair - Things is an Apple Design Award app) but
  each round closed named gaps.
- **Direction shift after first hands-on:** tabs removed -> one holistic
  canvas; everything draggable; matrix mirrors flags; accent from emerald to
  the user's green `#329051`; abstract glyphs removed (circles only); less
  text more icons; hover reveals depth.
- **Bento + resize:** cards resize by grip, split divider, matrix lip.
  Per-list accent colors, color picker, custom color drives tint too.
- **Pool + settings + soul pass:** Pool intake list; capture list chooser;
  settings menu; ink-black lines, richer Keep-like tints, 4 new colors; no
  em-dashes.
- **Review fix rounds:** persistent suggestion snooze, Esc everywhere,
  in-list and sub-item reorder, hover delete + right-click menu, list
  rename/delete, inline new list, date-chip cancel, per-card sweep, visible
  aging, section system (toggle + order, desktop AND phone), due/nudge
  editing, deep search (notes + archive), soft delete into Logbook.
- **Things layer:** This Evening, deadline flags, Logbook + restore, theme
  Auto, backup export/import.
- **Publish:** vendored design system, public config in code (no env
  vars), magic-link auth (Google deferred - needs the user's Google console),
  PWA icons. Multi-user readiness: Pool id per user, account-switch wipe.
- **Bugs that taught rules:** outbox hooks writing inside the caller's
  transaction (sync silently pushed nothing); synthetic touch tests passing
  while real iPhone drag failed; overlay hover pill overhanging cards ->
  in-flow sibling + geometry invariant test.
- **Rejected:** Google sign-in for now (console friction); Cmd+K-only capture
  on desktop (user reached for the pill); dashed empty boxes on phone.
