# Sharing - one list, two owners

A list (category) can be shared between exactly two accounts. Both see and
edit its items live; everything else stays private. First shared list: "בית".

## The split: ours vs mine

The whole design hangs on one question - what is the task, and where does it
sit in MY day. The first is shared truth; the second is personal.

| Shared (items row) | Personal (item_prefs row, per user) |
|---|---|
| title, notes, links, tags, source, kind | today, todaySince |
| categoryId, parentId, order | evening |
| nextMove, stateOverride | urgent, important |
| done, doneAt, archivedAt, deletedAt | pinned, matrixOrder |
| due, nudge | suggestSnooze |
| createdAt, updatedAt | |

`nudge` is shared by choice: a check-in date belongs to the task's waiting
state, next to `due`. My matrix placement, my Today, my pins - never hers,
and vice versa. A task both people see can sit in my "urgent+important" and
in none of her quadrants.

Personal fields live in a **separate overlay table**, not a per-user map on
the item, because:
1. RLS cannot authorize part of a jsonb blob - with a map, whoever may write
   the item may write MY triage. With `item_prefs`, `auth.uid() = user_id`
   is the whole policy; her account cannot reach my overlay by construction
   (proven in scripts/rls-check.mjs).
2. Two people triaging the same task never collide on one row.
3. Her triage does not bump the shared row's updated_at, so my client is not
   woken for changes it cannot see.

The overlay exists for EVERY item, shared or not - one code path, no
migration moment when a list becomes shared. `ensurePrefs()` (db.ts) lifts
legacy personal fields into overlay rows at init/sign-in; `composeItem()`
(shareSplit.ts) falls back to the item's own fields when no overlay row
exists, so old devices keep working mid-rollout. The item row keeps
NEUTRAL personal values on the server (`neutralizeShared`) - triage never
travels on the shared row.

## Tables (supabase/migrations/002_sharing.sql)

- `shares` - real columns, not a jsonb blob (the policies need them):
  `id, list_id, owner_id, owner_email, member_id (null until accept),
  member_email, status invited|accepted|declined|revoked|left, created_at,
  updated_at`. Invites address an **email** (the client cannot read
  auth.users); accepting binds `member_id` from the JWT.
- `item_prefs` - same row shape as items/categories (`id, user_id, item_id,
  data jsonb, updated_at, deleted`) so the sync engine treats all three
  uniformly. `id = '<userId>:<itemId>'`.

## Ownership model

**A row of a shared list belongs to the list owner.** A member's client
stamps the owner's user_id on rows it pushes into the shared list (sync.ts,
`sharedListOwners()`), so on leave/revoke the owner keeps everything,
including items the member created. Moving an item across the shared/private
boundary transfers ownership - and ONLY that (`items_pin_owner` trigger):
- take OUT of a shared list into a list of your own -> the row becomes yours;
- hand IN from your list -> the row becomes the list owner's;
- any other user_id change (including an old client stamping its own id on
  an ordinary edit) is silently pinned back. Categories never change owner.

## RLS in one breath

items/categories: `owner OR accepted member of the row's list`
(`is_member_of_list()`, security definer so it does not recurse into the
shares policies). Inserts by a member must key the row to the list owner
(`owner_of_list()` blocks inserting on behalf of third parties). A member
may tombstone shared items but never the shared category. item_prefs and
shares-visibility are plain per-user policies. The invite state machine
(who may flip status to what) is a **trigger**, `shares_guard`, because
permissive RLS policies OR their with-checks together and a with-check
cannot see the old row - RLS alone let a member who left re-accept
themselves (caught by rls-check, closed by the trigger).

## Sync engine changes (sync.ts)

- Pull drops `.eq('user_id', me)` for items/categories - RLS decides, which
  now includes shared rows. `item_prefs` pulls mine only. `shares` is
  re-fetched whole each pull (tiny) into the local cache.
- **Watermark backfill**: rows of a newly accepted list are older than
  `lastPull` and an incremental pull would never see them. After accept, the
  engine fetches that list whole (categories by id, items by
  `data->>categoryId`, indexed) once per acceptance (`shareSynced:` meta).
- **Prune**: a share that stops being accepted removes the list + its items
  from the member's device. My prefs rows stay (they are mine; my triage
  returns if re-invited).
- Item tombstones carry `categoryId` (captured by the Dexie deleting hook)
  so a member's delete passes the membership policy.
- Title conflicts: when a pending local edit loses to a newer remote row and
  the titles differ, the loser gets one toast (`onConflict` -> store).
  Last-write-wins per row otherwise, as before.
- Realtime subscribes to all four tables.

Share ACTIONS (invite/accept/decline/leave/revoke) are direct, online
Supabase calls, deliberately NOT outbox-replayed: replaying a stale invite
transition offline could violate the state machine. The shares Dexie table
is a cache the pull refreshes.

## Client

- `shareSplit.ts` - the pure split/compose module (split-check.mjs).
- Store composes `item = shared row + my overlay` in `loadAll`; components
  keep reading `item.today` etc. unchanged. `updateItem` splits each patch;
  matrix drops write prefs only. Undo snapshots include prefs.
- A shared list's **color and bento size are the viewer's**, per device
  (`seder-list-prefs` in localStorage), name and items are shared.
- The Pool never shares; sub-items follow their parent's list; a member
  gets "leave" instead of delete on a shared list.

## UI

Header tools gain a two-person button (ShareMenu.tsx): popover with email
field -> invite; shows who the list is shared with; owner revokes, member
leaves. Once accepted the card wears a small always-on two-person mark next
to the count. The invitee sees a quiet banner (InviteBanner.tsx) under the
header - accept / decline. Local icons live in `SederIcons.tsx` as inline
components - NOT a local svg sprite: Vite inlines small assets as data:
URIs and `<use href="data:...#id">` resolves nowhere.

## Verifying

`node scripts/rls-check.mjs` proves the whole access matrix (41 checks)
against a throwaway local Postgres 16 running the shipped SQL with
Supabase's auth stubs - both directions of privacy, ownership pinning,
the invite machine, revoke/leave. `node scripts/split-check.mjs` proves the
field split. Geometry covers the new header tools, popover and mark.
