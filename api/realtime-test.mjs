// GET /api/realtime-test - proves the "an edit appears on the other device
// within seconds" path LIVE: subscribes to postgres_changes as the isolated
// self-test user, inserts a row, and measures how long the realtime event
// takes to arrive. If realtime were off or broken, the app would fall back
// to its 60s poll - this endpoint is how we know which world we are in.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mzvmhjurvpstlbfzkuid.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dm1oanVydnBzdGxiZnprdWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NzI0NDgsImV4cCI6MjEwMjM0ODQ0OH0.p23magsled1CqbVDRXLVduZj1p1_WXm7VtTsZvD8-Sk';

export const maxDuration = 30;

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

    let eventAt = 0;
    const subscribed = await new Promise((resolve) => {
      const ch = sb
        .channel('rt-proof')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
          if (!eventAt) eventAt = Date.now();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve(true);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(false);
        });
      setTimeout(() => resolve(false), 8000);
      out.channel = () => ch; // keep a reference
    });
    out.subscribed = subscribed;
    delete out.channel;

    const id = `rt-item-${Date.now()}`;
    const t0 = Date.now();
    const { error: insErr } = await sb.from('items').insert({
      id,
      user_id: uid,
      data: { id, categoryId: 'rt-none', title: 'realtime probe' },
      updated_at: t0,
      deleted: false,
    });
    out.inserted = !insErr;
    if (insErr) out.insertError = insErr.message;

    // wait up to 8s for the event
    const deadline = Date.now() + 8000;
    while (!eventAt && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    out.eventReceived = eventAt > 0;
    if (eventAt) out.latencyMs = eventAt - t0;

    await sb.from('items').delete().eq('id', id);
    await sb.removeAllChannels();

    out.verdict = out.eventReceived
      ? `REALTIME WORKS - edit visible to other devices in ${out.latencyMs}ms`
      : subscribed
        ? 'SUBSCRIBED BUT NO EVENT - realtime may be off for these tables (app falls back to 60s poll + on-open sync)'
        : 'COULD NOT SUBSCRIBE - realtime disabled or unreachable (app falls back to 60s poll + on-open sync)';
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ ...out, verdict: 'TEST CRASHED', error: String(e).slice(0, 300) });
  }
}
