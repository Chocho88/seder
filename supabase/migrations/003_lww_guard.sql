-- 003 - Server-side last-write-wins guard.
--
-- Until now, LWW was enforced ONLY on the client's pull/apply side
-- (sync.ts applyRow: "row.updated_at <= localAt -> ignore"). The PUSH side
-- was a plain `upsert`, which unconditionally replaces whatever is on the
-- server - there was no check at all comparing the incoming updated_at to
-- what a row already holds. Two devices (or two share members) pushing
-- concurrently could therefore have the write that happens to reach
-- Postgres LAST win, even if its updated_at is OLDER than the write that
-- got there first - a genuinely newer edit silently overwritten by a
-- stale one, purely because of network timing, not because it was newer.
--
-- This trigger makes the server itself refuse an UPDATE whose incoming
-- updated_at is older than the row's current one: the write is dropped
-- (BEFORE-trigger returns null, which skips the write for that row
-- entirely - no error, the upsert call still "succeeds") instead of
-- clobbering a row that a later-timestamped write already landed on.
-- Equal timestamps still apply (idempotent retries must keep working).
--
-- Idempotent; safe to re-run.

create or replace function public.lww_guard()
returns trigger
language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- an out-of-order write loses to one already applied
  end if;
  return new;
end;
$$;

drop trigger if exists items_lww_guard on public.items;
create trigger items_lww_guard before update on public.items
  for each row execute function public.lww_guard();

drop trigger if exists categories_lww_guard on public.categories;
create trigger categories_lww_guard before update on public.categories
  for each row execute function public.lww_guard();

drop trigger if exists item_prefs_lww_guard on public.item_prefs;
create trigger item_prefs_lww_guard before update on public.item_prefs
  for each row execute function public.lww_guard();

-- Trigger fire order is alphabetical by name: "items_lww_guard" runs before
-- "items_pin_owner" (and likewise for categories) - a stale write is
-- dropped before the ownership-pin logic ever sees it, which is correct:
-- there is nothing left to pin if the write does not happen.
