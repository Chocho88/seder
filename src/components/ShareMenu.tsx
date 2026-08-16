// Share a list between exactly two accounts (wiki/sharing.md).
// A quiet header tool: the two-person icon opens a small popover - invite by
// email, see who the list is shared with, revoke (owner) or leave (member).
// The popover is a portal, like the color picker, so the card's overflow
// can never clip it; it is positioned physically on purpose (screen anchor).

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { UsersIcon } from './SederIcons';
import { useSeder } from '../lib/store';
import { useAuth } from '../lib/auth';
import { t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import type { Category } from '../lib/types';
import './sharemenu.css';

export default function ShareMenu({ category }: { category: Category }) {
  const { shareOf, shareList, revokeShare, leaveShare } = useSeder();
  const auth = useAuth();
  useLang();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const [email, setEmail] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (category.system) return null; // the Pool never shares
  const share = shareOf(category.id);
  const me = auth.session?.user.id;
  const isOwner = !share || share.ownerId === me;
  const shared = share?.status === 'accepted';

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 264;
    // keep inside the viewport horizontally (physical coords by design)
    const left = Math.max(8, Math.min(r.left - width / 2, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 6, left });
    setErrorKey(null);
    setOpen((o) => !o);
  };

  const invite = async () => {
    if (busy) return;
    setBusy(true);
    const err = await shareList(category.id, email);
    setBusy(false);
    setErrorKey(err);
    if (!err) {
      setEmail('');
      setOpen(false);
    }
  };

  return (
    <>
      <button
        className={`item-action tooltip${shared ? ' share-on' : ''}`}
        data-tooltip={shared ? t('shared_mark') : t('share_list')}
        aria-label={shared ? t('shared_mark') : t('share_list')}
        draggable={false}
        onClick={toggle}
      >
        <UsersIcon />
      </button>
      {open &&
        createPortal(
          <>
            <div className="colorpicker-scrim" onClick={() => setOpen(false)} />
            <div className="share-popover" dir={document.documentElement.dir} style={pos} onClick={(e) => e.stopPropagation()}>
              {!share && (
                <>
                  <p className="share-hint">{t('share_hint')}</p>
                  <input
                    className="share-email"
                    type="email"
                    placeholder={t('share_email_placeholder')}
                    value={email}
                    autoFocus
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void invite();
                      if (e.key === 'Escape') setOpen(false);
                    }}
                    dir="ltr"
                  />
                  {errorKey && <p className="share-error">{t(errorKey)}</p>}
                  <button className="share-send" disabled={busy} onClick={() => void invite()}>
                    {t('send_invite')}
                  </button>
                </>
              )}
              {share && share.status === 'invited' && (
                <>
                  <p className="share-status">
                    <span>{t('share_invited_to')}</span> <span className="share-addr" {...dirProps(share.memberEmail)}>{share.memberEmail}</span>
                  </p>
                  {isOwner && (
                    <button
                      className="share-send share-quiet"
                      onClick={() => {
                        void revokeShare(share.id);
                        setOpen(false);
                      }}
                    >
                      {t('revoke_share')}
                    </button>
                  )}
                </>
              )}
              {share && share.status === 'accepted' && (
                <>
                  <p className="share-status">
                    <span>{isOwner ? t('shared_with') : t('shared_by')}</span>{' '}
                    <span className="share-addr" {...dirProps(isOwner ? share.memberEmail : share.ownerEmail)}>
                      {isOwner ? share.memberEmail : share.ownerEmail}
                    </span>
                  </p>
                  <button
                    className="share-send share-quiet"
                    onClick={() => {
                      void (isOwner ? revokeShare(share.id) : leaveShare(share.id));
                      setOpen(false);
                    }}
                  >
                    {isOwner ? t('revoke_share') : t('leave_share')}
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
