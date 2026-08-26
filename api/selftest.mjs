// GET /api/selftest - proves the app's sync protocol LIVE, on the real
// backend, as three scenarios that mirror real life:
//   A. one account, two devices: device2 starts empty and must converge to
//      device1's lists; edits flow both ways (the user's Mac+iPhone case)
//   B. two accounts, one shared list: invite -> accept -> both edit ->
//      revoke cuts access; personal triage never crosses accounts
//   C. isolation: account2 never sees account1's private rows
// Uses two dedicated throwaway users (seder-selftest@/-2@seder-diag.dev,
// visible in the auth dashboard, own only their test rows, cleaned every
// run). RLS isolates them from real accounts. Public anon key only.

const SUPABASE_URL = 'https://mzvmhjurvpstlbfzkuid.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dm1oanVydnBzdGxiZnprdWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NzI0NDgsImV4cCI6MjEwMjM0ODQ0OH0.p23magsled1CqbVDRXLVduZj1p1_WXm7VtTsZvD8-Sk';
const USERS = [
  { email: 'seder-selftest@seder-diag.dev', password: 'seder-selftest-3719!x' },
  { email: 'seder-selftest-2@seder-diag.dev', password: 'seder-selftest-3719!x2' },
];

export const maxDuration = 60;

async function authCall(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

async function signIn({ email, password }) {
  let r = await authCall('token?grant_type=password', { email, password });
  if (!r.json?.access_token) {
    await authCall('signup', { email, password });
    r = await authCall('token?grant_type=password', { email, password });
  }
  return r.json?.access_token ? { token: r.json.access_token, uid: r.json.user.id } : null;
}

const rest = (token) => async (method, path, body, prefer) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: prefer ?? (method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=representation'),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { ok: r.ok, status: r.status, json, text: text.slice(0, 240) };
};

export default async function handler(req, res) {
  const steps = [];
  const step = (name, ok, detail) => {
    steps.push({ name, ok, ...(detail && !ok ? { detail } : {}) });
    return ok;
  };

  const s1 = await signIn(USERS[0]);
  const s2 = await signIn(USERS[1]);
  if (!s1 || !s2) {
    res.status(200).json({ verdict: 'CANNOT SIGN IN TEST USERS', s1: !!s1, s2: !!s2, steps });
    return;
  }
  const u1 = rest(s1.token); // "Mac" and "iPhone" share this account
  const u2 = rest(s2.token); // the second person
  const now = Date.now();
  const cat = `st-cat-${now}`;
  const item = `st-item-${now}`;

  // ---------- A. one account, two devices ----------
  // device1 pushes a list and an item (the app's exact upsert shape)
  let r = await u1('POST', 'categories?on_conflict=id', [
    { id: cat, user_id: s1.uid, data: { id: cat, name: 'בית' }, updated_at: now, deleted: false },
  ]);
  step('A: device1 pushes a list', r.ok, r.text);
  r = await u1('POST', 'items?on_conflict=id', [
    { id: item, user_id: s1.uid, data: { id: item, categoryId: cat, title: 'לקנות חלב' }, updated_at: now, deleted: false },
  ]);
  step('A: device1 pushes an item', r.ok, r.text);

  // device2 = same account, empty local store, watermark 0 -> full pull
  r = await u1('GET', `categories?select=*&updated_at=gt.0&order=updated_at`);
  step('A: device2 (fresh) pulls and SEES the list', r.ok && r.json?.some((x) => x.id === cat), r.text);
  r = await u1('GET', `items?select=*&updated_at=gt.0&order=updated_at`);
  step('A: device2 (fresh) pulls and SEES the item', r.ok && r.json?.some((x) => x.id === item), r.text);

  // device2 edits; device1 pulls incrementally and converges
  r = await u1('POST', 'items?on_conflict=id', [
    { id: item, user_id: s1.uid, data: { id: item, categoryId: cat, title: 'לקנות חלב ולחם' }, updated_at: now + 10, deleted: false },
  ]);
  step('A: device2 edits the item', r.ok, r.text);
  r = await u1('GET', `items?select=*&updated_at=gt.${now + 5}`);
  step(
    'A: device1 pulls the edit (incremental)',
    r.ok && r.json?.some((x) => x.id === item && x.data?.title === 'לקנות חלב ולחם'),
    r.text,
  );

  // ---------- C. isolation (before sharing) ----------
  r = await u2('GET', `categories?select=id&id=eq.${cat}`);
  step('C: account2 cannot see account1 private list', r.ok && (r.json?.length ?? 0) === 0, r.text);

  // ---------- B. the shared list, end to end ----------
  const shareId = `st-share-${now}`;
  r = await u1('POST', 'shares', [
    {
      id: shareId, list_id: cat, owner_id: s1.uid, owner_email: USERS[0].email,
      member_id: null, member_email: USERS[1].email, status: 'invited', created_at: now, updated_at: now,
    },
  ], 'return=minimal');
  step('B: owner sends the invite', r.ok, r.text);

  r = await u2('GET', `shares?select=*`);
  step('B: invitee discovers the invite on pull', r.ok && r.json?.some((x) => x.id === shareId), r.text);

  r = await u2('PATCH', `shares?id=eq.${shareId}`, { member_id: s2.uid, status: 'accepted', updated_at: now + 20 });
  step('B: invitee accepts', r.ok, r.text);

  r = await u2('GET', `categories?select=*&id=eq.${cat}`);
  step('B: member now sees the shared list', r.ok && (r.json?.length ?? 0) === 1, r.text);
  r = await u2('GET', `items?select=*&data->>categoryId=eq.${cat}`);
  step('B: member backfills the shared items', r.ok && r.json?.some((x) => x.id === item), r.text);

  // member edits (owner-keyed row, like the app pushes)
  r = await u2('POST', 'items?on_conflict=id', [
    { id: item, user_id: s1.uid, data: { id: item, categoryId: cat, title: 'לקנות חלב, לחם וביצים' }, updated_at: now + 30, deleted: false },
  ]);
  step('B: member edits a shared item', r.ok, r.text);
  r = await u1('GET', `items?select=*&id=eq.${item}`);
  step(
    'B: owner sees the member edit',
    r.ok && r.json?.[0]?.data?.title === 'לקנות חלב, לחם וביצים' && r.json?.[0]?.user_id === s1.uid,
    r.text,
  );

  // personal triage stays personal
  r = await u2('POST', 'item_prefs?on_conflict=id', [
    { id: `${s2.uid}:${item}`, user_id: s2.uid, item_id: item, data: { today: true, urgent: true }, updated_at: now + 40, deleted: false },
  ]);
  step('B: member sets their own today/matrix flags', r.ok, r.text);
  r = await u1('GET', `item_prefs?select=id&user_id=eq.${s2.uid}`);
  step('B: owner CANNOT read member triage', r.ok && (r.json?.length ?? 0) === 0, r.text);

  // revoke cuts access
  r = await u1('PATCH', `shares?id=eq.${shareId}`, { status: 'revoked', updated_at: now + 50 });
  step('B: owner revokes', r.ok, r.text);
  r = await u2('GET', `items?select=id&data->>categoryId=eq.${cat}`);
  step('B: revoke cut member access immediately', r.ok && (r.json?.length ?? 0) === 0, r.text);

  // ---------- cleanup (own rows only; delete policies are owner-only) ----------
  for (const [who, path] of [
    [u1, `items?id=eq.${item}`],
    [u1, `categories?id=eq.${cat}`],
    [u1, `shares?id=eq.${shareId}`],
    [u2, `item_prefs?id=eq.${s2.uid}:${item}`],
  ]) {
    const d = await who('DELETE', path, undefined, 'return=minimal');
    step(`cleanup ${path.split('?')[0]}`, d.ok, d.text);
  }

  const failed = steps.filter((x) => !x.ok);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    at: new Date().toISOString(),
    verdict:
      failed.length === 0
        ? 'TWO-DEVICE CONVERGENCE, SHARING AND ISOLATION ALL WORK LIVE'
        : `${failed.length} STEP(S) FAILED`,
    failed,
    steps,
  });
}
