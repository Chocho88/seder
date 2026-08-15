// Supabase client. Env vars win when set; otherwise the public config ships
// with the build, so a fresh deploy needs no dashboard setup at all.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from './publicConfig';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PUBLIC_SUPABASE_URL;
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
export const syncConfigured = supabase !== null;
