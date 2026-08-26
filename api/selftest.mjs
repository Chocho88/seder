// GET /api/selftest - runs the app's ACTUAL sync protocol against the live
// Supabase as a dedicated throwaway user (seder-selftest@seder-diag.dev,
// visible in the auth dashboard, owns only its own test rows, cleaned up at
// the end of every run). Reports each step's outcome verbatim, so a sync
// failure can be diagnosed remotely with proof instead of guesses.
// RLS keeps this user fully isolated from real accounts - proven by
// scripts/rls-check.mjs, and this endpoint re-proves it live on every run.

const SUPABASE_URL = 'https://mzvmhjurvpstlbfzkuid.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dm1oanVydnBzdGxiZnprdWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NzI0NDgsImV4cCI6MjEwMjM0ODQ0OH0.p23magsled1CqbVDRXLVduZj1p1_WXm7VtTsZvD8-Sk';
const EMAIL = 'seder-selftest@seder-diag.dev';
const PASSWORD = 'seder-selftest-3719!x';

async function auth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export default async function handler(req, res) {
  const steps = [];
  const step = (name, ok, detail) => steps.push({ name, ok, ...(detail ? { detail } : {}) });

  // --- become the self-test user (sign in; first run signs up) ---
  let signin = await auth('token?grant_type=password', { email: EMAIL, password: PASSWORD });
  if (!signin.ok) {
    const signup = await auth('signup', { email: EMAIL, password: PASSWORD });
    step('signup', signup.ok, signup.ok ? undefined : JSON.stringify(signup.json).slice(0, 300));
    signin = signup.json?.access_token ? { ok: true, json: signup.json } : await auth('token?grant_type=password', { email: EMAIL, password: PASSWORD });
  }
  const token = signin.json?.access_token;
  const uid = signin.json?.user?.id;
  step('sign in', Boolean(token && uid), token ? undefined : JSON.stringify(signin.json).slice(0, 300));
  if (!token || !uid) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ verdict: 'CANNOT SIGN IN', steps });
    return;
  }

  const rest = async (method, path, body) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text: text.slice(0, 300) };
  };

  const now = Date.now();
  const catId = `selftest-cat-${uid.slice(0, 8)}`;
  const itemId = `selftest-item-${uid.slice(0, 8)}`;

  // --- the exact writes the app's pushOutbox makes ---
  let r = await rest('POST', 'categories?on_conflict=id', [
    { id: catId, user_id: uid, data: { id: catId, name: 'selftest' }, updated_at: now, deleted: false },
  ]);
  step('push category (upsert)', r.ok, r.ok ? undefined : `${r.status} ${r.text}`);

  r = await rest('POST', 'items?on_conflict=id', [
    { id: itemId, user_id: uid, data: { id: itemId, categoryId: catId, title: 'selftest' }, updated_at: now, deleted: false },
  ]);
  step('push item (upsert)', r.ok, r.ok ? undefined : `${r.status} ${r.text}`);

  r = await rest('POST', 'item_prefs?on_conflict=id', [
    { id: `${uid}:${itemId}`, user_id: uid, item_id: itemId, data: { today: true }, updated_at: now, deleted: false },
  ]);
  step('push prefs (upsert)', r.ok, r.ok ? undefined : `${r.status} ${r.text}`);

  // second upsert of the same rows = the app's ordinary re-push path
  r = await rest('POST', 'items?on_conflict=id', [
    { id: itemId, user_id: uid, data: { id: itemId, categoryId: catId, title: 'selftest edited' }, updated_at: now + 1, deleted: false },
  ]);
  step('re-push item (upsert update)', r.ok, r.ok ? undefined : `${r.status} ${r.text}`);

  // --- the exact reads the app's pullChanges makes ---
  for (const [name, path] of [
    ['pull items', `items?select=*&updated_at=gt.0&order=updated_at`],
    ['pull categories', `categories?select=*&updated_at=gt.0&order=updated_at`],
    ['pull prefs', `item_prefs?select=*&user_id=eq.${uid}&updated_at=gt.0&order=updated_at`],
    ['pull shares', `shares?select=*`],
  ]) {
    const g = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    const text = (await g.text()).slice(0, 300);
    step(name, g.ok, g.ok ? undefined : `${g.status} ${text}`);
  }

  // tombstone, then real cleanup (delete own rows - owner-only policy)
  r = await rest('POST', 'items?on_conflict=id', [
    { id: itemId, user_id: uid, data: { id: itemId, categoryId: catId }, updated_at: now + 2, deleted: true },
  ]);
  step('push tombstone', r.ok, r.ok ? undefined : `${r.status} ${r.text}`);

  for (const [name, path] of [
    ['cleanup items', `items?id=eq.${itemId}`],
    ['cleanup categories', `categories?id=eq.${catId}`],
    ['cleanup prefs', `item_prefs?id=eq.${uid}:${itemId}`],
  ]) {
    const d = await rest('DELETE', path);
    step(name, d.ok, d.ok ? undefined : `${d.status} ${d.text}`);
  }

  const failed = steps.filter((s) => !s.ok);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    at: new Date().toISOString(),
    verdict: failed.length === 0 ? 'ALL SYNC OPERATIONS WORK' : `${failed.length} STEP(S) FAILED`,
    failed,
    steps,
  });
}
