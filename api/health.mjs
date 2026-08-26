// GET /api/health - a diagnostic window onto the app's backend, served by
// the app's own Vercel deployment (whose servers can always reach Supabase).
// It reports ONLY public facts: which tables exist and which auth providers
// are on - the same things any anonymous client learns by trying. The anon
// key is public by design (it ships in the app bundle); RLS guards the data,
// so every probe below sees zero rows.
//
// Built to answer, remotely and with proof: "did the sharing migration run,
// and is Google sign-in enabled?"

const SUPABASE_URL = 'https://mzvmhjurvpstlbfzkuid.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dm1oanVydnBzdGxiZnprdWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NzI0NDgsImV4cCI6MjEwMjM0ODQ0OH0.p23magsled1CqbVDRXLVduZj1p1_WXm7VtTsZvD8-Sk';

async function probeTable(name) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${name}?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (res.ok) return { table: name, exists: true };
    const body = await res.text();
    let code = null;
    let message = body.slice(0, 200);
    try {
      const j = JSON.parse(body);
      code = j.code ?? null;
      message = j.message ?? message;
    } catch {}
    const missing = code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table|schema cache/i.test(message);
    return { table: name, exists: !missing, status: res.status, code, message };
  } catch (e) {
    return { table: name, exists: null, error: String(e).slice(0, 200) };
  }
}

export default async function handler(req, res) {
  const [items, categories, itemPrefs, shares, settings] = await Promise.all([
    probeTable('items'),
    probeTable('categories'),
    probeTable('item_prefs'),
    probeTable('shares'),
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: ANON } })
      .then(async (r) => (r.ok ? r.json() : { error: r.status }))
      .catch((e) => ({ error: String(e).slice(0, 200) })),
  ]);

  const providers = settings?.external
    ? Object.entries(settings.external)
        .filter(([, on]) => on === true)
        .map(([k]) => k)
    : null;

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    at: new Date().toISOString(),
    supabase: SUPABASE_URL,
    tables: { items, categories, item_prefs: itemPrefs, shares },
    sharingInstalled: itemPrefs.exists === true && shares.exists === true,
    authProviders: providers,
    googleEnabled: providers ? providers.includes('google') : null,
  });
}
