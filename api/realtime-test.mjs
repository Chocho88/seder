// GET /api/realtime-test - pinpoints the live realtime state:
//   1. broadcast loopback: is the realtime SERVICE reachable at all?
//   2. postgres_changes per table (items/categories/item_prefs/shares):
//      which tables actually deliver change events?
// Run as the isolated self-test user. The app works without realtime (it
// polls and syncs on open/focus/resume) - this tells us whether edits show
// up in ~1s or in <=20s, and exactly what to flip if it is the slow path.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mzvmhjurvpstlbfzkuid.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dm1oanVydnBzdGxiZnprdWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NzI0NDgsImV4cCI6MjEwMjM0ODQ0OH0.p23magsled1CqbVDRXLVduZj1p1_WXm7VtTsZvD8-Sk';

export const maxDuration = 45;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  const out = { at: new Date().toISOString() };
  const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  try {
    const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
      email: 'seder-selftest@seder-diag.dev',
      password: 'seder-selftest-3719!x',
    });
    if (authErr || !auth?.user) {
      res.status(200).json({ ...out, verdict: 'CANNOT SIGN IN', error: authErr?.message });
      return;
    }
    const uid = auth.user.id;
    await sb.realtime.setAuth(auth.session.access_token);

    // 1. broadcast loopback - service reachability, independent of postgres
    let echoed = false;
    const bc = sb.channel('rt-echo', { config: { broadcast: { self: true } } });
    bc.on('broadcast', { event: 'ping' }, () => (echoed = true));
    await new Promise((resolve) => {
      bc.subscribe((s) => s === 'SUBSCRIBED' && resolve());
      setTimeout(resolve, 6000);
    });
    await bc.send({ type: 'broadcast', event: 'ping', payload: {} });
    const bcDeadline = Date.now() + 4000;
    while (!echoed && Date.now() < bcDeadline) await wait(100);
    out.broadcastWorks = echoed;

    // 2. postgres_changes per table
    const tables = ['items', 'categories', 'item_prefs', 'shares'];
    const got = Object.fromEntries(tables.map((t) => [t, 0]));
    const pg = sb.channel('rt-pg');
    for (const t of tables)
      pg.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
        if (!got[p.table]) got[p.table] = Date.now();
      });
    out.pgSubscribed = await new Promise((resolve) => {
      pg.subscribe((s) => {
        if (s === 'SUBSCRIBED') resolve(true);
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') resolve(false);
      });
      setTimeout(() => resolve(false), 6000);
    });

    const t0 = Date.now();
    const id = `rt-${t0}`;
    const ins = [];
    ins.push(await sb.from('items').insert({ id: `${id}-i`, user_id: uid, data: { id: `${id}-i`, categoryId: 'rt-none', title: 'probe' }, updated_at: t0, deleted: false }));
    ins.push(await sb.from('categories').insert({ id: `${id}-c`, user_id: uid, data: { id: `${id}-c`, name: 'probe' }, updated_at: t0, deleted: false }));
    ins.push(await sb.from('item_prefs').insert({ id: `${uid}:${id}-i`, user_id: uid, item_id: `${id}-i`, data: {}, updated_at: t0, deleted: false }));
    out.insertErrors = ins.map((r) => r.error?.message).filter(Boolean);

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !(got.items && got.categories && got.item_prefs)) await wait(150);
    out.delivered = Object.fromEntries(tables.map((t) => [t, got[t] ? `${got[t] - t0}ms` : false]));

    await sb.from('item_prefs').delete().eq('id', `${uid}:${id}-i`);
    await sb.from('items').delete().eq('id', `${id}-i`);
    await sb.from('categories').delete().eq('id', `${id}-c`);
    await sb.removeAllChannels();

    const anyPg = got.items || got.categories || got.item_prefs;
    out.verdict = anyPg
      ? `POSTGRES CHANGES DELIVER (items ${out.delivered.items}, categories ${out.delivered.categories}, prefs ${out.delivered.item_prefs})`
      : echoed
        ? 'REALTIME SERVICE UP but postgres changes are NOT flowing - the supabase_realtime publication does not include these tables (fix: Database > Publications, or re-run the two "alter publication" lines)'
        : 'REALTIME SERVICE UNREACHABLE - enable Realtime for the project (app still converges via 20s poll + sync-on-open)';
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ ...out, verdict: 'TEST CRASHED', error: String(e).slice(0, 300) });
  }
}
