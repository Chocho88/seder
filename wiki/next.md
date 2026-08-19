# Next milestone: shared lists (two owners)

## ALSO ON THIS BRANCH (2026-08-19): Google sign-in, sync hardening, Today shelf

Built after the user reported sync data loss in daily use: a Google button
(primary sign-in; needs the one-time provider setup in deploy.md), live
sync status in the account panel, storage-persist + pre-wipe recovery
snapshot + flush-on-close, and a Today drop shelf at the top of the canvas
(twin of Evening; `dropOn('today')`). Same go-live order as below - the SQL
paste, then merge; the Google provider setup can happen any time after.

## STATUS (2026-08-16): BUILT, not yet live

The milestone below is implemented on branch
`claude/wiki-handoff-execution-75rg30` - model, SQL, sync, UI, docs
([sharing.md](sharing.md)). It was built in a sandboxed environment with no
network route to Supabase or Vercel, so the pieces that need the live
project are handed over, in order:

1. **Paste the SQL once**: open the Supabase SQL editor for project
   `mzvmhjurvpstlbfzkuid` and run the whole of
   `supabase/migrations/002_sharing.sql` (idempotent; safe to re-run).
2. **Merge the branch to `main`** - that deploys. Order matters: SQL first,
   then merge, or the sharing button errors against missing tables.
3. **Live two-account check** (10 minutes): sign in as the main account,
   share "בית" to a `+alias` email, sign in as that alias elsewhere, accept
   the banner, edit on both sides, check my-today-is-not-hers, leave,
   re-invite, revoke. The RLS matrix itself is already proven (41 checks,
   `node scripts/rls-check.mjs` - real Postgres 16 running the shipped SQL
   with Supabase's auth stubbed); what was NOT exercised is the live
   Supabase deployment of it, realtime latency, and magic-link auth.

What was verified here and how - see the report in the PR/commit and
[testing.md](testing.md): tsc + geometry (incl. new share UI) green, split
model proven, real CDP touch drag into a list card asserted in IndexedDB,
screenshots desktop+phone HE+EN. The invite banner renders only with a
session, so it was not visually verified - its CSS is a plain flex row.

## Handoff prompt (original, for reference - the build is done)

```
You are continuing Seder, a personal todo app at
/Users/chochosages/Desktop/BASES/KLOD/seder. Read wiki/README.md and every
page it links FIRST - principles.md is non-negotiable (no em-dash, do the
tedious work yourself, verify touch with real input, calm design, t() + dirProps
everywhere). Then build this milestone end to end and deploy it.

GOAL - shared lists. Chocho and his wife each have their own Seder (separate
Supabase users, RLS-isolated). Add the ability to SHARE a list (category)
between exactly two accounts so both see and edit its items live, while
everything else stays private. First shared list will be "בית" (home).

PRODUCT RULES
- Sharing is per list, opt-in, from the list's header tools: a "share" icon
  opens a small popover: enter the other person's email, they get an invite;
  the list shows a two-person mark once shared. Either owner can leave; the
  creator can revoke.
- A shared list looks like any list (color, bento size are per-device prefs
  of the viewer; name and items are shared). Items in a shared list carry
  the same model as everything else: today/evening/urgent/important/pinned
  are PERSONAL flags (my triage is mine), while title, notes, next move,
  sub-items, done, deleted, order, due are SHARED. Design the split so a
  task both people see can sit in my matrix and not in hers.
- The Pool never shares. Sub-items inherit their parent's list.
- Realtime: an edit by one appears for the other within seconds. Conflicts:
  last-write-wins per field group is acceptable; never lose a title edit
  silently - if two titles collide, keep the newer and toast the loser once.
- Invitations: the invitee sees a quiet banner "X shared 'בית' with you -
  accept / decline" on next open. No email infra beyond Supabase auth is
  required; the invite can live in a table and be discovered on sign-in.
- Everything works on phone and desktop identically (section system,
  touch drag into a shared list, etc.). RTL/LTR per user as today.

TECHNICAL SHAPE (adapt if you find better, but explain why)
- Supabase: add tables `shares` (list_id, owner_id, member_id, status
  invited|accepted, created_at) and change RLS on `categories`/`items` so a
  row is readable/writable by the owner OR an accepted member of its list.
  Personal flags for shared items live in a per-user overlay table
  (`item_prefs`: user_id, item_id, today, evening, urgent, important, pinned,
  matrixOrder, todaySince, suggestSnooze) OR keep them on the item under a
  per-user map - pick one, justify, migrate cleanly. Keep `id` globally
  unique (uuids; the Pool is `pool-<userId>`).
- Sync engine (`src/lib/sync.ts`): pull must fetch rows I own OR rows in
  lists shared with me; push must send my personal overlay separately from
  shared fields; realtime must subscribe to both. Tombstones must respect
  membership.
- Local-first stays: shared items are cached locally like everything else.
- The Supabase dashboard needs SQL + policy changes. The user will sign in
  once in the app's browser pane on request ("in.") - you drive everything.
  Never send them to click through settings.
- Add a `wiki/sharing.md` describing the final model, and update
  data-model.md, architecture.md, deploy.md.

DEFINITION OF DONE
- Two real accounts (create a second test account with a +alias email)
  share "בית"; both see it on desktop and phone; an edit on one appears on
  the other; my today/matrix placement is not hers; leave/revoke works;
  private lists remain invisible across accounts (verify with REST calls
  using each user's JWT).
- `npm run check` green; geometry test extended if you added UI; touch
  verified with real input; deployed to seder-plum.vercel.app; a short
  screenshot-backed report of what was verified and how.
```

## Why this shape (context for the agent)
The current isolation is by `user_id` at the row level. Sharing means a row
can have multiple readers, so membership must be a *relation* (`shares`),
policies must join through it, and the client must split "what is mine to
triage" from "what is ours to keep true". Getting that split right is the
whole design problem; the UI is small.
