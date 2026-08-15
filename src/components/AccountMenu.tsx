// Account: sign in with Google to sync; signed-in shows the avatar and a
// quiet sync state. Local-only mode stays fully usable.

import { useEffect, useRef, useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { useAuth, signInWithGoogle, signOut, syncNow } from '../lib/auth';
import { t, useLang } from '../lib/i18n';
import './account.css';

export default function AccountMenu() {
  const auth = useAuth();
  useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
              <button className="account-google pressable" onClick={() => void signInWithGoogle()}>
                <svg className="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
                  <path fill="currentColor" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.7 19.8 8.1 22 12 22z" opacity=".8" />
                  <path fill="currentColor" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1C2.4 8.8 2 10.4 2 12s.4 3.2 1.1 4.6L6.4 14z" opacity=".6" />
                  <path fill="currentColor" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.2 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" opacity=".9" />
                </svg>
                {t('sign_in_google')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
