// Supabase client. Env vars win when set; otherwise the public config ships
// with the build, so a fresh deploy needs no dashboard setup at all.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from './publicConfig';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PUBLIC_SUPABASE_URL;
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || PUBLIC_SUPABASE_ANON_KEY;

// A push must survive the tab being backgrounded/closed right after an edit
// (sync.ts's pagehide/visibilitychange flush exists exactly for that), but
// a plain fetch() has no guarantee of completing once the page starts going
// away. `keepalive: true` gives the browser that guarantee - kept off
// GET/HEAD (pulls) deliberately, since keepalive requests are capped around
// 64KB combined in Chrome and a pull after being offline a while can be far
// bigger; our own writes (one outbox batch of edited rows) never are.
const keepaliveFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return fetch(input, init);
  return fetch(input, { ...init, keepalive: true });
};

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon, { global: { fetch: keepaliveFetch } }) : null;
export const syncConfigured = supabase !== null;
