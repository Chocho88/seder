// Account: sign in with Google to sync; signed-in shows the avatar and a
// quiet sync state. Local-only mode stays fully usable.

import { useEffect, useRef, useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { useAuth, signInWithEmail, signOut, syncNow } from '../lib/auth';
import { t, useLang } from '../lib/i18n';
import './account.css';

export default function AccountMenu() {
  const auth = useAuth();
  useLang();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const ref = useRef<HTMLDivElement>(null);

  const sendLink = async () => {
    if (!email.trim()) return;
    setSent('sending');
    const { error } = await signInWithEmail(email.trim());
    setSent(error ? 'error' : 'sent');
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  if (auth.status === 'unconfigured') return null;

  const avatar = auth.session?.user.user_metadata?.avatar_url as string | undefined;
  const name = (auth.session?.user.user_metadata?.full_name as string | undefined) ?? auth.session?.user.email ?? '';

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
      </button>
      {open && (
        <div className="account-panel">
          {auth.status === 'signed-in' ? (
            <>
              <div className="account-who">
                {avatar && <img className="account-avatar-lg" src={avatar} alt="" referrerPolicy="no-referrer" />}
                <div className="account-name">{name}</div>
                <div className="account-sub">{t('synced')}</div>
              </div>
              <button className="settings-action pressable" onClick={() => void syncNow()}>
                <svg className="icon icon-sm">
                  <use href={`${icons}#icon-download`} />
                </svg>
                {t('sync_now')}
              </button>
              <button className="settings-action pressable" onClick={() => void signOut()}>
                <svg className="icon icon-sm">
                  <use href={`${icons}#icon-logout`} />
                </svg>
                {t('sign_out')}
              </button>
            </>
          ) : (
            <>
              <p className="account-hint">{t('sign_in_hint')}</p>
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
                  <button className="account-google pressable" type="submit" disabled={sent === 'sending'}>
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
