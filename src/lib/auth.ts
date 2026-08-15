// Auth: Google sign-in via Supabase, single-user. The app runs unsigned in
// local-only mode; signing in turns sync on. Session drives sync.ts.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, syncConfigured } from './supabase';
import { setSyncSession, seedOutboxFromLocal, startRealtime, syncNow, onRemote } from './sync';
import { meta } from './db';

export type AuthState = { status: 'loading' | 'signed-out' | 'signed-in' | 'unconfigured'; session: Session | null };

let state: AuthState = { status: syncConfigured ? 'loading' : 'unconfigured', session: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function onSession(session: Session | null) {
  state = { status: session ? 'signed-in' : 'signed-out', session };
  setSyncSession(session);
  emit();
  if (session) {
    // first sign-in on this device: push everything local, then sync
    const seeded = (await meta.get('seededFor'))?.value;
    if (seeded !== session.user.id) {
      await seedOutboxFromLocal();
      await meta.put({ key: 'seededFor', value: session.user.id });
    }
    await syncNow();
    startRealtime();
  }
}

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => void onSession(data.session));
  supabase.auth.onAuthStateChange((_evt, session) => void onSession(session));
  // resync when the tab comes back and periodically as a safety net
  window.addEventListener('focus', () => void syncNow());
  window.addEventListener('online', () => void syncNow());
  window.setInterval(() => void syncNow(), 60_000);
}

export function useAuth(): AuthState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const l = () => setS({ ...state });
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return s;
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

/** Magic link: no passwords, no OAuth console - an email with a one-tap link. */
export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'unconfigured' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export { onRemote, syncNow };
