// Auth: magic-link sign-in via Supabase; any number of users, each fully
// isolated by RLS (own rows only). The app runs unsigned in
// local-only mode; signing in turns sync on. Session drives sync.ts.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, syncConfigured } from './supabase';
import { setSyncSession, seedOutboxFromLocal, startRealtime, syncNow, onRemote } from './sync';
import { meta, db } from './db';

export type AuthState = { status: 'loading' | 'signed-out' | 'signed-in' | 'unconfigured'; session: Session | null };

let state: AuthState = { status: syncConfigured ? 'loading' : 'unconfigured', session: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function onSession(session: Session | null) {
  // A different account on this device than the one whose data is here:
  // wipe local first, so nothing leaks between users sharing a browser.
  const owner = (await meta.get('owner'))?.value as string | undefined;
  if (session && owner && owner !== session.user.id) {
    await wipeLocal();
  }
  if (session) {
    await meta.put({ key: 'owner', value: session.user.id });
    // the Pool re-keys to this user's canonical id before anything syncs
    const { ensurePool, useSeder } = await import('./store');
    await ensurePool();
    // reflect the re-key in live state if the app is already running
    const st = useSeder.getState();
    if (st.ready) {
      const [items, categories] = await Promise.all([db.items.filter((i) => i.archivedAt === null).toArray(), db.categories.filter((c) => !c.archived).sortBy('order')]);
      useSeder.setState({ items, categories });
    }
  }
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
  // local data stays (it is on the server too); if a DIFFERENT account signs
  // in on this device later, onSession wipes it before syncing theirs.
}

async function wipeLocal(): Promise<void> {
  const { db: d } = await import('./db');
  await d.transaction('rw', d.items, d.categories, d.outbox, d.meta, async () => {
    await d.items.clear();
    await d.categories.clear();
    await d.outbox.clear();
    await d.meta.clear();
  });
}

export { onRemote, syncNow };
