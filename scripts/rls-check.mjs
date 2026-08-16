// RLS proof for the sharing model - runs the SHIPPED SQL (schema.sql +
// migrations/002_sharing.sql) against a throwaway LOCAL PostgreSQL 16
// cluster with Supabase's auth.uid()/auth.jwt() stubbed the way Supabase
// defines them, then asserts the whole access matrix as two real JWT
// identities (owner + member) plus anon.
//
// This is the honest substitute for a live two-account REST test when the
// Supabase project is not reachable: same SQL, same policy engine, local.
//
// Usage: node scripts/rls-check.mjs   (needs postgres 16 binaries on PATH
// or at /usr/lib/postgresql/16/bin; runs fine as root via su postgres)

import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PGBIN = existsSync('/usr/lib/postgresql/16/bin') ? '/usr/lib/postgresql/16/bin' : '';
const bin = (name) => (PGBIN ? join(PGBIN, name) : name);

const work = mkdtempSync(join(tmpdir(), 'seder-rls-'));
const dataDir = join(work, 'data');
const sockDir = join(work, 'sock');
execSync(`mkdir -p ${sockDir}`);

// initdb refuses root; the postgres OS user (from the postgresql package)
// owns the throwaway cluster instead.
const asRoot = process.getuid?.() === 0;
const run = (cmd) => {
  const full = asRoot ? `su -s /bin/bash postgres -c ${JSON.stringify(cmd)}` : cmd;
  return execSync(full, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
};
if (asRoot) execSync(`chown -R postgres:postgres ${work}`);
chmodSync(work, 0o777);

let started = false;
function cleanup() {
  try {
    if (started) run(`${bin('pg_ctl')} -D ${dataDir} -m immediate stop`);
  } catch {}
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {}
}
process.on('exit', cleanup);

// --- boot a cluster on a unix socket only (no TCP, no port conflicts) ---
run(`${bin('initdb')} -D ${dataDir} -A trust -U postgres`);
run(
  `${bin('pg_ctl')} -D ${dataDir} -o "-c listen_addresses='' -c unix_socket_directories=${sockDir}" -w -l ${join(work, 'pg.log')} start`,
);
started = true;

const psql = (file) =>
  run(`${bin('psql')} -v ON_ERROR_STOP=1 -h ${sockDir} -U postgres -d postgres -f ${file}`);

// --- harness: Supabase auth stubs, roles, then the SHIPPED schema files ---
const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';

const harness = `
-- Supabase parity: the auth schema, roles and JWT plumbing the policies use.
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as
  $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create role authenticated nologin;
create role anon nologin;
create publication supabase_realtime;

insert into auth.users values
  ('${OWNER}', 'chocho@example.com'),
  ('${MEMBER}', 'wife@example.com'),
  ('${THIRD}', 'stranger@example.com');
`;

const grants = `
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
`;

// jwt helper + assertion helpers used by the checks
const helpers = `
create function jwt_as(u uuid) returns void language sql security definer as
  $$ select set_config('request.jwt.claims',
       json_build_object('sub', u::text, 'email', (select email from auth.users where id = u))::text,
       false) $$;
create function jwt_none() returns void language sql security definer as
  $$ select set_config('request.jwt.claims', '', false) $$;

create table _results (n serial, name text, ok boolean);
create function check_eq(name text, got bigint, want bigint) returns void language plpgsql as $f$
begin
  insert into _results (name, ok) values (name || ' [' || got || '=' || want || ']', got = want);
end $f$;
grant all on _results, _results_n_seq to authenticated, anon;
grant execute on all functions in schema public to authenticated, anon;
`;

// --- the access matrix, as SQL. Each block: become a JWT, act, record. ---
const checks = `
---------------------------------------------------------------- seed: owner
set role authenticated;
select jwt_as('${OWNER}');
insert into public.categories (id, user_id, data, updated_at, deleted) values
  ('cat-home',   '${OWNER}', '{"id":"cat-home","name":"בית"}',   1000, false),
  ('cat-priv-o', '${OWNER}', '{"id":"cat-priv-o","name":"mine"}', 1000, false);
insert into public.items (id, user_id, data, updated_at, deleted) values
  ('it-home-1', '${OWNER}', '{"id":"it-home-1","categoryId":"cat-home","title":"buy soap"}', 1000, false),
  ('it-priv-o', '${OWNER}', '{"id":"it-priv-o","categoryId":"cat-priv-o","title":"secret"}', 1000, false);
insert into public.item_prefs (id, user_id, item_id, data, updated_at, deleted) values
  ('${OWNER}:it-home-1', '${OWNER}', 'it-home-1', '{"today":true}', 1000, false);
insert into public.shares (id, list_id, owner_id, owner_email, member_id, member_email, status, created_at, updated_at) values
  ('share-1', 'cat-home', '${OWNER}', 'chocho@example.com', null, 'wife@example.com', 'invited', 1000, 1000),
  ('share-x', 'cat-home', '${OWNER}', 'chocho@example.com', null, 'other@example.com', 'invited', 1000, 1000);

-- owner cannot invite on a list they do not own
do $$ begin
  insert into public.shares values ('share-bad', 'cat-nonexistent', '${OWNER}', 'c', null, 'w', 'invited', 1, 1);
  perform check_eq('owner cannot invite on unowned/unknown list', 1, 0);
exception when insufficient_privilege then
  perform check_eq('owner cannot invite on unowned/unknown list', 0, 0);
end $$;

---------------------------------------------------------------- seed: member
select jwt_as('${MEMBER}');
insert into public.categories (id, user_id, data, updated_at, deleted) values
  ('cat-priv-m', '${MEMBER}', '{"id":"cat-priv-m","name":"hers"}', 1000, false);
insert into public.items (id, user_id, data, updated_at, deleted) values
  ('it-priv-m', '${MEMBER}', '{"id":"it-priv-m","categoryId":"cat-priv-m","title":"her secret"}', 1000, false);

------------------------------------------------- before accept: still walled
select check_eq('pre-accept: member sees no shared category',
  (select count(*) from public.categories where id = 'cat-home'), 0);
select check_eq('pre-accept: member sees no shared items',
  (select count(*) from public.items where id = 'it-home-1'), 0);
select check_eq('member sees own invite by email',
  (select count(*) from public.shares where id = 'share-1'), 1);
select check_eq('member does not see the stranger invite',
  (select count(*) from public.shares where id = 'share-x'), 0);

-- cannot accept an invite addressed to someone else (row invisible -> 0)
update public.shares set member_id = '${MEMBER}', status = 'accepted', updated_at = 2000
  where id = 'share-x';
select check_eq('cannot accept an invite addressed to another email',
  (select count(*) from public.shares where id = 'share-x' and status = 'accepted'), 0);

-- cannot bind the invite to a third account
do $$ begin
  update public.shares set member_id = '${THIRD}', status = 'accepted' where id = 'share-1';
  perform check_eq('cannot bind invite to a third account', 1, 0);
exception when others then
  perform check_eq('cannot bind invite to a third account', 0, 0);
end $$;

---------------------------------------------------------------------- accept
update public.shares set member_id = '${MEMBER}', status = 'accepted', updated_at = 2000
  where id = 'share-1';
select check_eq('accept binds the member',
  (select count(*) from public.shares where id = 'share-1' and status = 'accepted' and member_id = '${MEMBER}'), 1);

select check_eq('member now sees the shared category',
  (select count(*) from public.categories where id = 'cat-home'), 1);
select check_eq('member now sees the shared item',
  (select count(*) from public.items where id = 'it-home-1'), 1);
select check_eq('member still cannot see owner private category',
  (select count(*) from public.categories where id = 'cat-priv-o'), 0);
select check_eq('member still cannot see owner private item',
  (select count(*) from public.items where id = 'it-priv-o'), 0);
select check_eq('member cannot read owner item_prefs',
  (select count(*) from public.item_prefs where user_id = '${OWNER}'), 0);

-- personal overlay stays personal: cannot write prefs under the owner's id
do $$ begin
  insert into public.item_prefs values ('${OWNER}:hijack', '${OWNER}', 'it-home-1', '{}', 2000, false);
  perform check_eq('member cannot insert prefs for the owner', 1, 0);
exception when insufficient_privilege then
  perform check_eq('member cannot insert prefs for the owner', 0, 0);
end $$;
insert into public.item_prefs values ('${MEMBER}:it-home-1', '${MEMBER}', 'it-home-1', '{"today":true,"urgent":true}', 2000, false);
select check_eq('member has their own prefs row for the shared item',
  (select count(*) from public.item_prefs where id = '${MEMBER}:it-home-1'), 1);

------------------------------------------------------- shared writes (member)
-- ordinary edit, client-style upsert carrying the owner id
insert into public.items (id, user_id, data, updated_at, deleted) values
  ('it-home-1', '${OWNER}', '{"id":"it-home-1","categoryId":"cat-home","title":"buy soap and towels"}', 3000, false)
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted;
select check_eq('member edits the shared item title',
  (select count(*) from public.items where id = 'it-home-1' and data->>'title' = 'buy soap and towels'), 1);

-- hijack attempt: an old client stamping the MEMBER id gets pinned back
-- (the row must stay the owner's while remaining inside the shared list)
insert into public.items (id, user_id, data, updated_at, deleted) values
  ('it-home-1', '${MEMBER}', '{"id":"it-home-1","categoryId":"cat-home","title":"pinned edit"}', 3500, false)
  on conflict (id) do update set user_id = excluded.user_id, data = excluded.data, updated_at = excluded.updated_at;
select check_eq('ownership pin: member upsert cannot steal the row',
  (select count(*) from public.items where id = 'it-home-1' and user_id = '${OWNER}' and data->>'title' = 'pinned edit'), 1);

-- new item created by the member inside the shared list (owner-keyed)
insert into public.items (id, user_id, data, updated_at, deleted) values
  ('it-home-2', '${OWNER}', '{"id":"it-home-2","categoryId":"cat-home","title":"her addition"}', 4000, false);
select check_eq('member creates an item in the shared list',
  (select count(*) from public.items where id = 'it-home-2'), 1);

-- but not on behalf of a third user
do $$ begin
  insert into public.items values ('it-home-3', '${THIRD}', '{"id":"it-home-3","categoryId":"cat-home"}', 4000, false);
  perform check_eq('member cannot insert rows for a third user', 1, 0);
exception when insufficient_privilege then
  perform check_eq('member cannot insert rows for a third user', 0, 0);
end $$;

-- shared delete: a member tombstone is accepted (data keeps categoryId)
update public.items set deleted = true, data = '{"id":"it-home-2","categoryId":"cat-home"}', updated_at = 5000
  where id = 'it-home-2';
select check_eq('member tombstones a shared item',
  (select count(*) from public.items where id = 'it-home-2' and deleted), 1);

-- a member may rename the shared list...
update public.categories set data = '{"id":"cat-home","name":"בית שלנו"}', updated_at = 5000 where id = 'cat-home';
-- ...but never tombstone it
do $$ begin
  update public.categories set deleted = true where id = 'cat-home';
  perform check_eq('member cannot tombstone the shared list', 1, 0);
exception when insufficient_privilege then
  perform check_eq('member cannot tombstone the shared list', 0, 0);
end $$;

----------------------------------------------- boundary moves transfer owner
-- member takes the shared item into her private list: ownership follows
update public.items
  set user_id = '${MEMBER}', data = '{"id":"it-home-1","categoryId":"cat-priv-m","title":"pinned edit"}', updated_at = 6000
  where id = 'it-home-1';
select check_eq('move out of shared list transfers ownership to the mover',
  (select count(*) from public.items where id = 'it-home-1' and user_id = '${MEMBER}'), 1);

select jwt_as('${OWNER}');
select check_eq('owner no longer sees the moved-out item',
  (select count(*) from public.items where id = 'it-home-1'), 0);

select jwt_as('${MEMBER}');
-- and hands it back into the shared list: it becomes the list owner's again
update public.items
  set user_id = '${OWNER}', data = '{"id":"it-home-1","categoryId":"cat-home","title":"pinned edit"}', updated_at = 7000
  where id = 'it-home-1';
select check_eq('move into shared list keys the item to the list owner',
  (select count(*) from public.items where id = 'it-home-1' and user_id = '${OWNER}'), 1);

--------------------------------------------------------------- owner's view
select jwt_as('${OWNER}');
select check_eq('owner sees the member rename',
  (select count(*) from public.categories where id = 'cat-home' and data->>'name' = 'בית שלנו'), 1);
select check_eq('owner sees the member edit',
  (select count(*) from public.items where id = 'it-home-1' and data->>'title' = 'pinned edit'), 1);
select check_eq('owner sees the member tombstone',
  (select count(*) from public.items where id = 'it-home-2' and deleted), 1);
select check_eq('owner cannot see member private category',
  (select count(*) from public.categories where id = 'cat-priv-m'), 0);
select check_eq('owner cannot see member private item',
  (select count(*) from public.items where id = 'it-priv-m'), 0);
select check_eq('owner cannot read member item_prefs',
  (select count(*) from public.item_prefs where user_id = '${MEMBER}'), 0);

------------------------------------------------------------------ leave
select jwt_as('${MEMBER}');
update public.shares set status = 'left', updated_at = 8000 where id = 'share-1';
select check_eq('member leaves',
  (select count(*) from public.shares where id = 'share-1' and status = 'left'), 1);
select check_eq('after leaving, the shared list is gone for the member',
  (select count(*) from public.categories where id = 'cat-home'), 0);
select check_eq('after leaving, shared items are gone for the member',
  (select count(*) from public.items where data->>'categoryId' = 'cat-home'), 0);

-- a left member cannot re-accept on their own
do $$ begin
  update public.shares set status = 'accepted' where id = 'share-1';
  perform check_eq('left member cannot self-re-accept', 1, 0);
exception when others then
  perform check_eq('left member cannot self-re-accept', 0, 0);
end $$;

------------------------------------------------- owner re-invites, then revoke
select jwt_as('${OWNER}');
-- the owner can never mark the share accepted on the member's behalf
do $$ begin
  update public.shares set status = 'accepted', member_id = '${MEMBER}' where id = 'share-1';
  perform check_eq('owner cannot accept for the member', 1, 0);
exception when others then
  perform check_eq('owner cannot accept for the member', 0, 0);
end $$;
update public.shares set status = 'invited', member_id = null, updated_at = 9000 where id = 'share-1';
select jwt_as('${MEMBER}');
update public.shares set member_id = '${MEMBER}', status = 'accepted', updated_at = 9500 where id = 'share-1';
select check_eq('re-invite then re-accept works',
  (select count(*) from public.categories where id = 'cat-home'), 1);

select jwt_as('${OWNER}');
update public.shares set status = 'revoked', updated_at = 9900 where id = 'share-1';
select jwt_as('${MEMBER}');
select check_eq('revoke cuts member access immediately',
  (select count(*) from public.items where data->>'categoryId' = 'cat-home'), 0);

--------------------------------------------------------------------- anon
select jwt_none();
select check_eq('anon sees no categories', (select count(*) from public.categories), 0);
select check_eq('anon sees no items', (select count(*) from public.items), 0);
select check_eq('anon sees no prefs', (select count(*) from public.item_prefs), 0);
select check_eq('anon sees no shares', (select count(*) from public.shares), 0);

reset role;
select (case when ok then 'PASS  ' else 'FAIL  ' end) || name as result from _results order by n;
select count(*) filter (where not ok) as failures from _results;
`;

writeFileSync(join(work, 'harness.sql'), harness);
writeFileSync(join(work, 'schema.sql'), readFileSync(join(root, 'supabase/schema.sql')));
writeFileSync(join(work, '002.sql'), readFileSync(join(root, 'supabase/migrations/002_sharing.sql')));
writeFileSync(join(work, 'grants.sql'), grants + helpers);
writeFileSync(join(work, 'checks.sql'), checks);
if (asRoot) execSync(`chown -R postgres:postgres ${work}`);

psql(join(work, 'harness.sql'));
psql(join(work, 'schema.sql'));
psql(join(work, '002.sql'));
psql(join(work, 'grants.sql'));
const out = psql(join(work, 'checks.sql'));

const lines = out.split('\n').filter((l) => /PASS|FAIL/.test(l));
for (const l of lines) console.log(l.trim());
const failures = /failures\s*-+\s*(\d+)/.exec(out.replace(/\n/g, ' '))?.[1];
console.log(`\n${lines.length} checks, ${failures} failure(s)`);
if (failures !== '0') process.exit(1);
console.log('ALL RLS CHECKS PASSED (local Postgres 16, shipped SQL, stubbed Supabase auth)');
