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
    db.ts             Dexie schema (v2: items, categories, outbox, meta) + outbox hooks
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
scripts/              shot.mjs (screenshot rig), geometry-check.mjs, make-icon.mjs
supabase/schema.sql   tables + RLS + realtime
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
- `pushOutbox()`: collapse outbox to latest-per-row, upsert `{id, user_id,
  data(jsonb), updated_at, deleted}` per table, then delete pushed entries.
  Deletes are tombstones (`deleted: true`).
- `pullChanges()`: rows with `updated_at > lastPull` for **my** user_id;
  last-write-wins by `updated_at`; a pending local change beats an older
  remote one; tombstones delete locally.
- Realtime channel on both tables triggers pull; also on focus/online/60s.
- First sign-in on a device with local data: `seedOutboxFromLocal()` uploads
  everything once (`meta.seededFor`).
- Server schema: `items` / `categories` with `id text primary key`, RLS
  `auth.uid() = user_id`. Row ids must therefore be globally unique - the
  Pool's id is `pool-<userId>` (see data-model.md).

## Auth (`auth.ts`)
Magic link (`signInWithOtp`). Google OAuth code exists but the provider is
not configured. On session: record `meta.owner`; if a *different* owner's
data is on this device, wipe local first; `ensurePool()` re-keys the Pool;
seed outbox; `syncNow()`; start realtime. Sign-out keeps local data.

## Undo
Full snapshots of `{items, categories}` (max 20) pushed by mutating actions;
`undo()` restores via bulkPut + deletes anything created after the snapshot.
Toast with an Undo button after delete/sweep/move; Cmd+Z outside inputs.
