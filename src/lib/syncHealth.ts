// Pure sync-health logic: how failures are recorded, when a stuck row is
// parked instead of retried forever, and what the account panel should say.
// Browser-free on purpose (no Dexie, no supabase) - split-check.mjs runs
// this module directly, the same discipline as shareSplit.ts.

export interface SyncErrorInfo {
  at: number; // epoch ms - the UI formats; nothing is baked into strings
  detail: string; // raw technical detail, shown only behind a disclosure
}

/** A change that could not reach the server after self-heal and retries.
    It is set aside: the row itself stays intact in local Dexie (nothing is
    lost), the outbox drains, and sync can go clean again. */
export interface ParkedEntry {
  table: 'items' | 'categories' | 'prefs';
  rowId: string;
  deleted: boolean;
  at: number; // the original outbox timestamp
  categoryId?: string;
  reason: string;
  parkedAt: number;
  attempts: number;
}

/** The shape the outbox accepts back (OutboxEntry minus seq - db.ts owns
    the real type; kept structural here to stay browser-free). */
export interface OutboxLike {
  table: 'items' | 'categories' | 'prefs';
  rowId: string;
  deleted: boolean;
  at: number;
  categoryId?: string;
}

/** Read a stored lastSyncError. Structured {at, detail} passes; anything
    else - notably the legacy pre-stamped strings older builds wrote -
    returns null, so a frozen "[20:38] push categories: ..." line from a
    previous build dies the moment a new build reads it. */
export function parseSyncError(value: unknown): SyncErrorInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as { at?: unknown; detail?: unknown };
  if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
  if (typeof v.detail !== 'string' || v.detail.length === 0) return null;
  return { at: v.at, detail: v.detail };
}

/** Network-ish failures that a later cycle can plausibly fix on its own.
    These must never park - retrying is exactly right for them. */
export function isTransientError(message: string): boolean {
  return /load failed|failed to fetch|network|timeout|timed out|abort|socket|ECONN|offline/i.test(message) || isClockSkewError(message);
}

/** The server rejected a token as "issued at future" (or "not yet valid"):
    clock skew between the auth service that minted it and the API that
    checks it. Refreshing mints ANOTHER future-stamped token - the only cure
    is to wait a few seconds and retry the same one. */
export function isClockSkewError(message: string): boolean {
  return /issued at future|not yet valid|\bnbf\b/i.test(message);
}

/** How far in the future (positive) or past (negative) a JWT's iat claim
    sits relative to a clock - in ms. null when the token is unreadable.
    Shown next to a clock-skew failure so the panel itself says how big
    the gap is (and on which side). */
export function jwtIatOffsetMs(token: string | null | undefined, nowMs: number): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const iat = (JSON.parse(json) as { iat?: unknown }).iat;
    return typeof iat === 'number' ? iat * 1000 - nowMs : null;
  } catch {
    return null;
  }
}

/** Park immediately when self-heal explicitly declined (it will decline
    identically forever); park persistent non-transient push errors after
    5 attempts; never park transient ones. */
export function shouldPark(reason: 'heal-declined' | 'push-error', attempts: number, transient: boolean): boolean {
  if (transient) return false;
  if (reason === 'heal-declined') return true;
  return attempts >= 5;
}

/** Merge new parked entries into the stored list: one entry per
    table:rowId, newest wins, attempts accumulate. */
export function mergeParked(existing: ParkedEntry[], adds: ParkedEntry[]): ParkedEntry[] {
  const byKey = new Map<string, ParkedEntry>();
  for (const e of existing) byKey.set(`${e.table}:${e.rowId}`, e);
  for (const a of adds) {
    const key = `${a.table}:${a.rowId}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? { ...a, attempts: prev.attempts + a.attempts } : a);
  }
  return [...byKey.values()];
}

/** What goes back into the outbox when the user taps "try again". */
export function unparkPlan(parked: ParkedEntry[]): OutboxLike[] {
  return parked.map((p) => ({
    table: p.table,
    rowId: p.rowId,
    deleted: p.deleted,
    at: p.at,
    ...(p.categoryId ? { categoryId: p.categoryId } : {}),
  }));
}

export type StatusLine = 'pending' | 'fresh' | 'never';
export interface StatusViewInput {
  pending: number;
  parked: number;
  lastOk: number | null; // last fully clean cycle (push + pull)
  lastPullOk: number | null; // last clean core pull - honest freshness even
  // when one stubborn push keeps a cycle from being "fully" clean
  error: SyncErrorInfo | null;
  now: number;
}
export interface StatusView {
  line: StatusLine;
  freshAt: number | null; // timestamp behind the 'fresh' line
  errorVisible: boolean;
}

const ERROR_MAX_AGE = 24 * 60 * 60 * 1000;

/** The account panel's one calm truth: pending count wins; otherwise the
    freshest of lastOk/lastPullOk; "never synced" only when neither exists.
    An old error with nothing pending or parked is noise - hide it. */
export function statusView(input: StatusViewInput): StatusView {
  const freshAt = input.lastOk ?? input.lastPullOk;
  const line: StatusLine = input.pending > 0 ? 'pending' : freshAt !== null ? 'fresh' : 'never';
  const errorVisible =
    input.error !== null &&
    !(input.pending === 0 && input.parked === 0 && input.now - input.error.at > ERROR_MAX_AGE);
  return { line, freshAt, errorVisible };
}
