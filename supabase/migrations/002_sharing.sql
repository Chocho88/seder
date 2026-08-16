-- 002 - Shared lists (two owners). Paste this whole file once into the
-- Supabase SQL editor of project mzvmhjurvpstlbfzkuid and run it.
-- It is idempotent: running it twice is safe.
--
-- What it adds:
--   shares      - who shares which list with whom (invited -> accepted)
--   item_prefs  - per-user triage overlay (today/urgent/... are PERSONAL)
--   new RLS     - a row is visible/writable by its owner OR an accepted
--                 member of its list; personal prefs never cross accounts
--
-- Ownership rule: an item in a shared list belongs to the LIST OWNER.
-- Moving an item across the shared/private boundary transfers ownership
-- (the triggers below allow exactly that and nothing else).

-- ---------------------------------------------------------------- shares
create table if not exists public.shares (
  id text primary key,
  list_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  member_id uuid references auth.users(id) on delete cascade,
  member_email text not null,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined', 'revoked', 'left')),
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists shares_list on public.shares (list_id, status);
create index if not exists shares_member on public.shares (member_id);
create index if not exists shares_email on public.shares (lower(member_email));

alter table public.shares enable row level security;

-- ------------------------------------------------------------ item_prefs
-- One row per (user, item): the personal triage overlay. Same row shape as
-- items/categories so the sync engine treats it uniformly.
-- id = '<userId>:<itemId>'.
create table if not exists public.item_prefs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false
);
create index if not exists item_prefs_user_updated on public.item_prefs (user_id, updated_at);

alter table public.item_prefs enable row level security;

drop policy if exists "own prefs" on public.item_prefs;
create policy "own prefs" on public.item_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------- helpers
-- Membership check used inside items/categories policies. SECURITY DEFINER
-- so evaluating it does not recurse into the shares policies.
create or replace function public.is_member_of_list(p_list_id text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shares s
    where s.list_id = p_list_id
      and s.status = 'accepted'
      and (s.owner_id = auth.uid() or s.member_id = auth.uid())
  );
$$;

-- The uuid that owns a list (categories row). Used to keep shared items
-- keyed to the list owner and to stop inserts on behalf of third parties.
create or replace function public.owner_of_list(p_list_id text)
returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.categories where id = p_list_id;
$$;

-- ------------------------------------------------- ownership pin triggers
-- The client upserts whole rows and stamps a user_id; without a guard, a
-- member's ordinary edit would rewrite ownership of a shared row.
-- Items: user_id may change ONLY when the row crosses the shared/private
-- boundary, moved by someone entitled to both sides.
create or replace function public.items_pin_owner()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id then
    if not (
      -- taking an item OUT of a list shared with me, into a list of MY OWN
      -- (the destination must really be mine - otherwise this would let a
      -- member steal a row while leaving it inside the shared list)
      (new.user_id = auth.uid()
        and public.is_member_of_list(old.data->>'categoryId')
        and public.owner_of_list(new.data->>'categoryId') = auth.uid())
      or
      -- handing my own item INTO a shared list (it becomes the list owner's)
      (auth.uid() = old.user_id
        and public.is_member_of_list(new.data->>'categoryId')
        and new.user_id = public.owner_of_list(new.data->>'categoryId'))
    ) then
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_pin_owner on public.items;
create trigger items_pin_owner before update on public.items
  for each row execute function public.items_pin_owner();

-- Categories: ownership never moves.
create or replace function public.categories_pin_owner()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists categories_pin_owner on public.categories;
create trigger categories_pin_owner before update on public.categories
  for each row execute function public.categories_pin_owner();

-- ------------------------------------------- items / categories policies
-- Readable/writable by the owner OR an accepted member of the row's list.
drop policy if exists "own items" on public.items;
drop policy if exists "items select" on public.items;
create policy "items select" on public.items
  for select using (auth.uid() = user_id or public.is_member_of_list(data->>'categoryId'));

drop policy if exists "items insert" on public.items;
create policy "items insert" on public.items
  for insert with check (
    auth.uid() = user_id
    or (public.is_member_of_list(data->>'categoryId')
        and user_id = public.owner_of_list(data->>'categoryId'))
  );

drop policy if exists "items update" on public.items;
create policy "items update" on public.items
  for update
  using (auth.uid() = user_id or public.is_member_of_list(data->>'categoryId'))
  with check (
    auth.uid() = user_id
    or (public.is_member_of_list(data->>'categoryId')
        and user_id = public.owner_of_list(data->>'categoryId'))
  );

drop policy if exists "items delete" on public.items;
create policy "items delete" on public.items
  for delete using (auth.uid() = user_id);

drop policy if exists "own categories" on public.categories;
drop policy if exists "categories select" on public.categories;
create policy "categories select" on public.categories
  for select using (auth.uid() = user_id or public.is_member_of_list(id));

drop policy if exists "categories insert" on public.categories;
create policy "categories insert" on public.categories
  for insert with check (auth.uid() = user_id);

-- A member may edit a shared list (rename) but never tombstone it - only
-- the owner deletes a list. deleted=false in the member branch enforces it.
drop policy if exists "categories update" on public.categories;
create policy "categories update" on public.categories
  for update
  using (auth.uid() = user_id or public.is_member_of_list(id))
  with check (auth.uid() = user_id or (public.is_member_of_list(id) and deleted = false));

drop policy if exists "categories delete" on public.categories;
create policy "categories delete" on public.categories
  for delete using (auth.uid() = user_id);

-- --------------------------------------------------------- shares policies
-- See: the owner, the bound member, or the invited email address.
drop policy if exists "shares select" on public.shares;
create policy "shares select" on public.shares
  for select using (
    auth.uid() = owner_id
    or auth.uid() = member_id
    or lower(member_email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

-- Only the owner of a list may invite someone to it.
drop policy if exists "shares insert" on public.shares;
create policy "shares insert" on public.shares
  for insert with check (
    auth.uid() = owner_id and owner_id = public.owner_of_list(list_id)
  );

-- Owner may update their share rows (revoke, re-invite).
drop policy if exists "shares owner update" on public.shares;
create policy "shares owner update" on public.shares
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- The invited email may bind itself and accept or decline - exactly once.
drop policy if exists "shares invitee accept" on public.shares;
create policy "shares invitee accept" on public.shares
  for update
  using (
    member_id is null
    and status = 'invited'
    and lower(member_email) = lower(coalesce(auth.jwt()->>'email', ''))
  )
  with check (member_id = auth.uid() and status in ('accepted', 'declined'));

-- A bound member may leave.
drop policy if exists "shares member leave" on public.shares;
create policy "shares member leave" on public.shares
  for update
  using (auth.uid() = member_id)
  with check (auth.uid() = member_id and status = 'left');

drop policy if exists "shares owner delete" on public.shares;
create policy "shares owner delete" on public.shares
  for delete using (auth.uid() = owner_id);

-- Permissive RLS policies OR their with-check clauses together, and a with
-- check can never see the OLD row - so the invite state machine needs a
-- trigger. It closes the crack where a member who left could sanction their
-- own row against the invitee-accept check and re-accept themselves.
create or replace function public.shares_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.owner_id then
    -- the owner manages the invite but can never accept for the member
    if new.status = 'accepted' and old.status is distinct from 'accepted' then
      raise exception 'only the invited account can accept';
    end if;
    if new.status = 'invited' then
      new.member_id := null; -- a re-invite always starts unbound
    end if;
    return new;
  end if;
  if old.member_id = auth.uid() then
    -- a bound member has exactly one move: leave
    if new.status <> 'left' or new.member_id is distinct from old.member_id then
      raise exception 'a member may only leave a share';
    end if;
    return new;
  end if;
  if old.member_id is null and old.status = 'invited'
     and new.member_id = auth.uid() and new.status in ('accepted', 'declined') then
    return new; -- the invited email binding itself
  end if;
  raise exception 'illegal share transition';
end;
$$;

drop trigger if exists shares_guard on public.shares;
create trigger shares_guard before update on public.shares
  for each row execute function public.shares_guard();

-- ---------------------------------------------------------- lookup index
-- The client backfills a newly accepted list by categoryId; give it an index.
create index if not exists items_category on public.items ((data->>'categoryId'));

-- ------------------------------------------------------------- realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.shares;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.item_prefs;
  exception when duplicate_object then null;
  end;
end $$;
