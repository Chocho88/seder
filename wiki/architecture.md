# Architecture

React 19 + TypeScript + Vite. State in **zustand** (`src/lib/store.ts`);
persistence in **IndexedDB via Dexie** (`src/lib/db.ts`); sync to
**Supabase** (`src/lib/sync.ts`); auth via Supabase magic-link
(`src/lib/auth.ts`). No router - one canvas.

```
src/
  main.tsx            boot: applyUrlOverrides() -> <App/>
  App.tsx             header (account | wordmark | settings, lang, theme),
                      Canvas (desktop) or MobileCanvas (<=768px), overlays
  lib/
    types.ts          Item, Category, SectionPref, DEFAULT_SECTIONS
    store.ts          THE contract: state + every action; derived helpers at bottom
    db.ts             Dexie schema (v3: items, categories, prefs, shares,
                      outbox, meta) + outbox hooks + ensurePrefs()
    shareSplit.ts     shared vs personal field split + compose (pure; sharing.md)
    sync.ts           push/pull/realtime engine (see below)
    auth.ts           session -> sync wiring; magic link; account switch wipe
    supabase.ts       client (env vars override publicConfig)
    publicConfig.ts   public URL + anon key (public by design; RLS guards data)
    nextMove.ts       Do/Wait/Shape derivation from a phrase; verb icons
    dates.ts          natural-language due dates EN/HE
    i18n.ts           t(), useLang(); <html lang> is the source of truth
    rtl.ts            dirProps(text) -> per-line direction
    urlState.ts       ?lang/theme/cardstyle/open/seed for deep links + screenshots
    resize.ts         pointer-drag helper for grips/dividers
    seed.ts           demo data (DEV or ?seed=fresh only)
  components/         one .tsx + one .css per surface (see ui-system.md)
  styles/seder.css    tokens, palette, card styles; mobile.css phone layer
vendor/design-system/ mirrored KLOD design system (scripts/sync-design-system.sh)
scripts/              shot.mjs (screenshot rig), geometry-check.mjs,
                      touch-check.mjs (real CDP touch), rls-check.mjs (local
                      Postgres RLS proof), split-check.mjs, make-icon.mjs
supabase/schema.sql   base tables + RLS; migrations/002_sharing.sql adds
                      shares + item_prefs + membership policies + realtime
```

## Data flow
UI -> store action -> Dexie write -> `set()` live state.
Dexie table hooks (`creating/updating/deleting`) queue **outbox** entries
(flushed after the originating transaction; see the comment in db.ts - the
hooks must NOT write inside the caller's transaction, that was a real bug).
Remote applies wrap in `withRemote()` so they don't re-enter the outbox.

## Sync engine (`sync.ts`)
- **Local-first**: IndexedDB is the working copy; the app is fully usable
  unsigned and offline.
- Three uniform synced tables: `items`, `categories`, `item_prefs` (Dexie
  `prefs` - the per-user triage overlay, see sharing.md), plus `shares` as a
  pull-refreshed cache (share actions are direct online calls, not outboxed).
- `syncNow()` **pulls before it pushes**. Pulling first merges the freshest
  remote content into Dexie before push re-serializes local rows - this
  matters most for reorder-only writes (dropOn/reorderInCategory/etc.),
  which touch every sibling's `order` field without bumping the row's own
  `updatedAt`, so pushOutbox falls back to "now" for those rows and
  re-uploads the row's full local snapshot. Pulling first means that
  snapshot already carries any edit another device made that we had not
  yet seen, shrinking the window where a reorder's stale cached content
  could race a genuinely newer edit made elsewhere.
- `pushOutbox()`: collapse outbox to latest-per-row, upsert `{id, user_id,
  data(jsonb), updated_at, deleted}` per table, then delete pushed entries.
  Deletes are tombstones (`deleted: true`; item tombstones carry categoryId
  for the shared-membership policy). Rows of a shared list are pushed with
  the LIST OWNER's user_id and neutralized personal fields.
- `pullChanges()`: rows with `updated_at > lastPull`; items/categories are
  NOT filtered by user_id - RLS returns mine plus shared-with-me; prefs are
  mine only. Last-write-wins by `updated_at`; a pending local change beats an
  older remote one; tombstones delete locally; a lost pending edit (any
  field, not just title) toasts once, and losing to a delete elsewhere
  toasts a distinct message. A newly accepted share backfills its list past
  the watermark; a share that stops being accepted prunes the list from the
  member device.
- **LWW is enforced server-side too** (`003_lww_guard.sql`): a trigger on
  items/categories/item_prefs drops an incoming UPDATE whose `updated_at` is
  older than the row's current one. Without it, `upsert()` unconditionally
  replaces the row - two concurrent pushes would let whichever reached
  Postgres LAST win, even if its timestamp was older, purely from network
  timing. Equal timestamps still apply (retries stay idempotent).
- Realtime channel on all four tables triggers pull; also on
  focus/online/60s AND on pagehide/hidden (entries typed right before
  closing the app still leave the device). A bulk change fires one realtime
  event per row - `pullThenNotify()` guards against overlapping pulls the
  same way `pushOutbox` guards overlapping pushes (a pull already running
  absorbs everything that arrives into exactly one more pass). The channel's
  subscribe status is watched too: on CLOSED/CHANNEL_ERROR/TIMED_OUT (a
  WebSocket a backgrounded phone silently dropped) the channel tears itself
  down so the next poll tick or resume (`restartRealtime()`, called on
  visibilitychange-to-visible) starts a clean one, instead of leaving
  `isRealtimeDelivering()` reporting a dead channel as live and the poll
  relaxed to 60s. `syncStatus()` exposes pending count + last-ok time (shown
  live in AccountMenu); failures toast once per losing streak
  (`onSyncError`). `navigator.storage.persist()` is requested on init; an
  account SWITCH stashes a backup-format snapshot in localStorage
  `seder-recovery` before the wipe (restorable via Settings > Import) - the
  wipe itself clears items/categories/prefs/shares/outbox/meta, all of it,
  so a second account signing in on the same device never inherits the
  first account's leftover triage rows.
- The Supabase client's `fetch` sets `keepalive: true` on mutating requests
  only (`supabase.ts`) - a push must survive the tab backgrounding or
  closing right after an edit, which a plain `fetch()` does not guarantee.
  Left off GET/HEAD deliberately: keepalive requests are capped near 64KB
  combined in Chrome, and a pull after a long offline stretch can be much
  bigger than any one push ever is.
- First sign-in on a device with local data: `seedOutboxFromLocal()` uploads
  everything once (`meta.seededFor`).
- Server schema: `id text primary key`; RLS = owner OR accepted member of the
  row's list (plain owner for prefs). Row ids must therefore be globally
  unique - the Pool's id is `pool-<userId>` (see data-model.md), prefs ids
  are `<userId>:<itemId>`. **item_prefs additionally carries `item_id` as a
  NOT NULL COLUMN** (not just inside data) - every prefs push must send it
  (pushOutbox does; /api/selftest enforces the contract after a live bug
  where omitting it stalled the whole prefs outbox). A push rejected as an
  OWNERSHIP error (RLS/duplicate-key: the id exists under another account,
  e.g. an old-id backup import) self-heals: the row is re-keyed locally to
  a fresh id of our own and re-pushed (healForeignRow); imports re-key up
  front (SettingsMenu.importBackup -> rekeySnapshot).

## Auth (`auth.ts`)
Magic link (`signInWithOtp`). Google OAuth code exists but the provider is
not configured. On session: record `meta.owner`; if a *different* owner's
data is on this device, wipe local first; `ensurePool()` re-keys the Pool;
seed outbox; `syncNow()`; start realtime. Sign-out keeps local data.

## Undo
Full snapshots of `{items, categories}` (max 20) pushed by mutating actions;
`undo()` restores via bulkPut + deletes anything created after the snapshot.
Toast with an Undo button after delete/sweep/move; Cmd+Z outside inputs.
