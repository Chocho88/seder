// Account: sign in (Google one-tap, or an email link as fallback) to sync;
// signed-in shows the avatar and the LIVE sync state - how many changes
// wait, when the last full sync landed. Local-only mode stays fully usable.

import { useEffect, useRef, useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { GoogleIcon } from './SederIcons';
import { useAuth, signInWithEmail, signInWithGoogle, signOut, syncNow } from '../lib/auth';
import { syncStatus, probeRoundTrip, retryParked } from '../lib/sync';
import { statusView, type SyncErrorInfo } from '../lib/syncHealth';
import { t, useLang } from '../lib/i18n';
import './account.css';

export default function AccountMenu() {
  const auth = useAuth();
  const [lang] = useLang();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [googleError, setGoogleError] = useState(false);
  const [status, setStatus] = useState<{
    pending: number;
    parked: number;
    lastOk: number | null;
    lastPullOk: number | null;
    lastError: SyncErrorInfo | null;
    sharingReady: boolean;
  } | null>(null);
  const [probe, setProbe] = useState<'idle' | 'running' | { ok: boolean; ms?: number; error?: string }>('idle');
  // Sync Now must visibly DO something: spin while running, land on a
  // clear verdict for a moment, then return to rest.
  const [manualSync, setManualSync] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle');
  const ref = useRef<HTMLDivElement>(null);

  const sendLink = async () => {
    if (!email.trim()) return;
    setSent('sending');
    const { error } = await signInWithEmail(email.trim());
    setSent(error ? 'error' : 'sent');
  };

  const google = async () => {
    setGoogleError(false);
    const { error } = await signInWithGoogle();
    // provider not enabled yet (or offline): say so instead of failing mute
    if (error) setGoogleError(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // touchstart too: iOS fires synthetic mousedown unreliably on some
    // targets, and the panel must dismiss on the first outside tap
    window.addEventListener('mousedown', close);
    window.addEventListener('touchstart', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('touchstart', close);
    };
  }, [open]);

  // live sync truth: every 2s while the panel is open, every 5s otherwise
  // (the button wears a small dot whenever changes are waiting or stuck,
  // so "is it syncing?" is answerable without opening anything)
  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    let alive = true;
    const read = () => {
      if (document.visibilityState === 'hidden') return;
      void syncStatus().then((s) => alive && setStatus(s));
    };
    read();
    const timer = window.setInterval(read, open ? 2000 : 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open, auth.status]);

  if (auth.status === 'unconfigured') return null;

  const avatar = auth.session?.user.user_metadata?.avatar_url as string | undefined;
  const name = (auth.session?.user.user_metadata?.full_name as string | undefined) ?? auth.session?.user.email ?? '';
  // one calm truth per state - statusView (pure, tested) decides which
  const vm = status
    ? statusView({
        pending: status.pending,
        parked: status.parked,
        lastOk: status.lastOk,
        lastPullOk: status.lastPullOk,
        error: status.lastError,
        now: Date.now(),
      })
    : null;
  const syncLine = !status
    ? t('synced')
    : vm!.line === 'pending'
      ? `${status.pending} ${t('sync_pending_n')}`
      : vm!.line === 'fresh'
        ? `${t('sync_all_clear')} · ${t('last_synced')} ${new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' }).format(vm!.freshAt!)}`
        : vm!.errorVisible
          ? t('never_synced')
          : // no freshness stamp yet but nothing wrong either: the first
            // cycle on this build is simply still in flight - say so
            // instead of the alarming "never synced on this device"
            t('sync_running');

  // the dot: amber while changes wait to leave the device, red when
  // something is stuck or failing; nothing at all when everything is clean
  const dot = !status || auth.status !== 'signed-in' ? null : vm!.errorVisible || status.parked > 0 ? 'issue' : status.pending > 0 ? 'busy' : null;

  return (
    <div className="account" ref={ref}>
      <button
        className={`header-toggle account-btn${auth.status === 'signed-in' ? ' on' : ''}`}
        aria-label={t('account')}
        onClick={() => setOpen((o) => !o)}
      >
        {avatar ? (
          <img className="account-avatar" src={avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <svg className="icon icon-md">
            <use href={`${icons}#icon-user`} />
          </svg>
        )}
        {dot && <span className={`account-dot account-dot-${dot}`} aria-hidden />}
      </button>
      {open && (
        <div className="account-panel">
          {auth.status === 'signed-in' ? (
            <>
              <div className="account-who">
                {avatar && <img className="account-avatar-lg" src={avatar} alt="" referrerPolicy="no-referrer" />}
                <div className="account-name">{name}</div>
                <div className="account-sub">{syncLine}</div>
                {/* a short humane line; the raw technical detail lives one
                    tap away, never in the reader's face */}
                {vm?.errorVisible && status?.lastError && (
                  <div className="account-sync-issue">
                    {t('sync_issue')}
                    {/* the reason stays visible - hiding it behind a tap
                        turned "why?" into a support question */}
                    <details className="account-sync-details" open>
                      <summary>{t('sync_details')}</summary>
                      <span dir="ltr">{status.lastError.detail}</span>
                    </details>
                  </div>
                )}
                {status !== null && status.parked > 0 && (
                  <div className="account-sync-note account-parked">
                    {status.parked} {t('sync_parked_n')}
                    <button
                      className="account-parked-retry pressable"
                      onClick={() => void retryParked().then(() => syncStatus().then(setStatus))}
                    >
                      {t('sync_parked_retry')}
                    </button>
                  </div>
                )}
                {status && !status.sharingReady && <div className="account-sync-note">{t('sharing_not_installed')}</div>}
              </div>
              <button
                className="settings-action pressable"
                disabled={manualSync === 'running'}
                onClick={async () => {
                  if (manualSync === 'running') return;
                  setManualSync('running');
                  try {
                    await syncNow();
                    const s = await syncStatus();
                    setStatus(s);
                    setManualSync(s.lastError ? 'fail' : 'ok');
                  } catch {
                    setManualSync('fail');
                  }
                  window.setTimeout(() => setManualSync('idle'), 2200);
                }}
              >
                <svg className={`icon icon-sm${manualSync === 'running' ? ' account-spin' : ''}`}>
                  <use href={`${icons}#icon-download`} />
                </svg>
                {manualSync === 'running'
                  ? t('sync_running')
                  : manualSync === 'ok'
                    ? `${t('sync_done')} ✓`
                    : manualSync === 'fail'
                      ? t('sync_failed_short')
                      : t('sync_now')}
              </button>
              <button
                className="settings-action pressable"
                disabled={probe === 'running'}
                onClick={async () => {
                  setProbe('running');
                  setProbe(await probeRoundTrip());
                }}
              >
                <svg className="icon icon-sm">
                  <use href={`${icons}#icon-bolt`} />
                </svg>
                {probe === 'idle'
                  ? t('sync_check')
                  : probe === 'running'
                    ? '…'
                    : probe.ok
                      ? `${t('sync_check_ok')} · ${probe.ms}ms ✓`
                      : `${t('sync_check_fail')}`}
              </button>
              {typeof probe === 'object' && !probe.ok && probe.error && (
                <p className="account-sync-error" dir="ltr">
                  {probe.error}
                </p>
              )}
              <button className="settings-action pressable" onClick={() => void signOut()}>
                <svg className="icon icon-sm">
                  <use href={`${icons}#icon-logout`} />
                </svg>
                {t('sign_out')}
              </button>
              {/* same stamp on both devices = both run the same version */}
              <p className="account-sync-note" dir="ltr">
                v {__SEDER_BUILD__}
              </p>
            </>
          ) : (
            <>
              <p className="account-hint">{t('sign_in_hint')}</p>
              <button className="account-google pressable" type="button" onClick={() => void google()}>
                <GoogleIcon className="icon icon-sm" />
                {t('sign_in_google')}
              </button>
              {googleError && <p className="account-error">{t('google_not_ready')}</p>}
              <p className="account-or">{t('or_email')}</p>
              {sent === 'sent' ? (
                <p className="account-sent">{t('magic_sent')}</p>
              ) : (
                <form
                  className="account-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendLink();
                  }}
                >
                  <input
                    className="account-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder={t('email_placeholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                  />
                  <button className="account-magic pressable" type="submit" disabled={sent === 'sending'}>
                    <svg className="icon icon-sm" aria-hidden="true">
                      <use href={`${icons}#icon-send`} />
                    </svg>
                    {sent === 'sending' ? '…' : t('send_magic_link')}
                  </button>
                  {sent === 'error' && <p className="account-error">{t('magic_error')}</p>}
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
