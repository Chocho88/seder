# Data model

## Item (`types.ts`) - the only entity ("one entity, progressive depth")
```
id, kind: 'task'|'note', categoryId, parentId (sub-items), order
title, notes, links[], tags[], source
nextMove: string          -> state derived: Do / Wait / Shape (nextMove.ts)
stateOverride             -> manual override of the derivation
done, doneAt, archivedAt  -> done lingers; sweep sets archivedAt (Logbook)
deletedAt                 -> soft delete: archived AND marked deleted (Logbook, restorable)
important, urgent: bool|null  -> null = unset; matrix mirrors any non-null
today, todaySince (aging "2d"), evening (This Evening shelf)
pinned, matrixOrder (manual order inside a quadrant)
due, nudge (check-in for Wait items), suggestSnooze ("not today" until)
createdAt, updatedAt
```
Rules: nesting is free (soft ~3); dragging a sub-item onto a sibling reorders
it (does NOT promote); deleting cascades to sub-items; restoring a sub-item
restores its archived parent.

Since sharing: the personal-triage fields (today, todaySince, evening,
urgent, important, pinned, matrixOrder, suggestSnooze) canonically live in a
per-user overlay row (`ItemPrefs`, Dexie table `prefs`, server `item_prefs`);
the store composes them onto the item before components see it, so reads are
unchanged. The fields remain on Item for legacy fallback only. See
[sharing.md](sharing.md).

## The Next Move engine (`nextMove.ts`)
One natural-language phrase. Starts with an action verb -> **Do** (verb
becomes an icon). Waiting language ("מחכה ל", "waiting for") -> **Wait**
(row wears a small clock, checkbox dashed, optional nudge date). Empty ->
**Shape** (needs thinking). No status dropdowns anywhere.

## Category (list)
`id, name, colorKey (10 presets), customColor (hex, drives tint too), order,
archived, system (the Pool), w/h (bento size)`.
The **Pool** is the intake list: `system: true`, name shown via `t('pool')`,
undeletable, id = `pool-<userId>` when signed in (`pool-local` before) -
`ensurePool()` in store.ts folds strays and re-keys on sign-in.

A list can be **shared** with exactly one other account (`Share` in types.ts,
status invited -> accepted; leave/revoke end it). A shared list's name and
items are shared; its color and bento size are per-viewer, per device. The
Pool never shares. Full model: [sharing.md](sharing.md).

## Sections (`DEFAULT_SECTIONS`)
`date, suggestions, matrix, evening, done, pinned, lists` - each toggleable
and orderable (Settings > Sections; drag handle on desktop, arrows on
touch). Persisted in localStorage `seder-sections`. Desktop: sections before
`lists` render on the matrix side, `lists` and after on the lists side.
Phone: same list, one column.

## Morning suggestions (`morningCandidates`)
Rule-based, no AI: urgent, due within 2 days, nudge passed; excludes today,
sub-items, and snoozed (`suggestSnooze > now`). "Not today" snoozes to end
of day.
