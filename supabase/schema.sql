-- Seder sync schema. Run once in the Supabase SQL editor.
-- Local-first: IndexedDB is the working copy; these tables mirror it per user.
-- Rows are JSON blobs keyed by id - the app owns the shape, the DB owns
-- ownership + timestamps. Row Level Security keeps every user to their own rows.

create table if not exists public.items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false
);
create index if not exists items_user_updated on public.items (user_id, updated_at);

create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false
);
create index if not exists categories_user_updated on public.categories (user_id, updated_at);

alter table public.items enable row level security;
alter table public.categories enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: let clients subscribe to their own row changes
alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.categories;
