// Auth: magic-link sign-in via Supabase; any number of users, each fully
// isolated by RLS (own rows only). The app runs unsigned in
// local-only mode; signing in turns sync on. Session drives sync.ts.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, syncConfigured } from './supabase';
import {
  setSyncSession,
  seedOutboxFromLocal,
  startRealtime,
  restartRealtime,
  syncNow,
  onRemote,
  isRealtimeDelivering,
  onAuthLostCallback,
} from './sync';
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
    // Safety net: the wipe would also destroy any UNPUSHED edits of the
    // previous account. Stash a snapshot in localStorage (survives the
    // Dexie clear) in the exact backup-file format, so Settings > Import
    // can bring it back if this switch was a mistake.
    try {
      const [items, categories] = await Promise.all([db.items.toArray(), db.categories.toArray()]);
      if (items.length || categories.length) {
        localStorage.setItem('seder-recovery', JSON.stringify({ seder: 1, exportedAt: Date.now(), items, categories }));
      }
    } catch (e) {
      console.warn('[auth] recovery snapshot failed', e);
    }
    await wipeLocal();
  }
  if (session) {
    await meta.put({ key: 'owner', value: session.user.id });
    // the Pool and the prefs overlay re-key to this user's canonical ids
    // before anything syncs
    const { ensurePool, useSeder } = await import('./store');
    const { ensurePrefs } = await import('./db');
    await ensurePool();
    await ensurePrefs();
    // reflect the re-key in live state if the app is already running
    if (useSeder.getState().ready) await useSeder.getState().reloadFromDb();
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
  // the sync engine could not refresh an expired session: drop it locally
  // so the account panel shows "sign in" - the truth - instead of a device
  // that looks signed in but is rejected on every request
  const client = supabase; // narrowed once; the callback runs later
  onAuthLostCallback(() => void client.auth.signOut({ scope: 'local' }));
  void supabase.auth.getSession().then(({ data }) => void onSession(data.session));
  supabase.auth.onAuthStateChange((_evt, session) => void onSession(session));
  // resync when the tab comes back and periodically as a safety net.
  // The poll runs every 20s until a realtime event has actually been seen
  // (then it relaxes to 60s) - devices must feel in-sync even when the
  // realtime fast lane is not delivering.
  window.addEventListener('focus', () => void syncNow());
  window.addEventListener('online', () => void syncNow());
  let tick = 0;
  window.setInterval(() => {
    tick += 1;
    if (!isRealtimeDelivering() || tick % 3 === 0) void syncNow();
  }, 20_000);
  // ...and when the app is being put away: entries typed right before
  // closing the phone app must leave the device, not wait for next open.
  // Coming BACK is just as important: iOS PWAs resume with a
  // visibilitychange (focus does not always fire), and that is exactly the
  // "I opened the app, show me what changed on the other device" moment.
  window.addEventListener('pagehide', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    // coming back: a suspended WebSocket does not always report its own
    // death (iOS backgrounding especially) - force a fresh subscription
    // rather than trust a channel object that merely still exists. Only
    // when we don't already have positive proof it's alive, though - a
    // quick alt-tab fires this same event, and reconnecting a channel that
    // was never actually dead is a pointless teardown/renegotiation.
    if (document.visibilityState === 'visible' && !isRealtimeDelivering()) restartRealtime();
    void syncNow(); // hidden: flush out; visible: pull in
  });
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

/** One-tap Google sign-in. The whole flow stays in THIS browser context -
    unlike the magic link, which opens in whatever browser the mail app
    picks and leaves the installed app signed out (the root of the "my data
    does not sync" pain). Returns an error string when the provider is not
    enabled yet in Supabase, so the UI can say so instead of failing mute. */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'unconfigured' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
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
  // prefs and shares must go too: ensurePrefs() re-keys any prefs row it
  // finds under a DIFFERENT owner id to the new owner (that is exactly right
  // for the local -> first-sign-in transition it was built for) - left
  // behind here, it would instead adopt the PREVIOUS account's triage rows
  // and push them into the new account's item_prefs table, referencing item
  // ids the new account never had.
  await d.transaction('rw', [d.items, d.categories, d.prefs, d.shares, d.outbox, d.meta], async () => {
    await d.items.clear();
    await d.categories.clear();
    await d.prefs.clear();
    await d.shares.clear();
    await d.outbox.clear();
    await d.meta.clear();
  });
}

export { onRemote, syncNow };
