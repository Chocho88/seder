// Supabase client - created only when the env is present, so the app keeps
// working fully offline / unconfigured (local-only mode).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
export const syncConfigured = supabase !== null;
