// Share a list between exactly two accounts (wiki/sharing.md).
// A quiet header tool: the two-person icon opens a small popover - invite by
// email, see who the list is shared with, revoke (owner) or leave (member).
// The popover is a portal, like the color picker, so the card's overflow
// can never clip it; it is positioned physically on purpose (screen anchor).
// The popover BODY is its own component so the phone card sheet (CardSheet)
// can host the exact same flow inline - one share grammar everywhere.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { UsersIcon } from './SederIcons';
import { useSeder } from '../lib/store';
import { useAuth } from '../lib/auth';
import { t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import type { Category } from '../lib/types';
import './sharemenu.css';

/** The share flow itself: invite / status / revoke / leave. Hosted by the
    desktop popover and by the phone card sheet. */
export function ShareBody({ category, close, autoFocus = true }: { category: Category; close: () => void; autoFocus?: boolean }) {
  const { shareOf, shareList, revokeShare, leaveShare } = useSeder();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const share = shareOf(category.id);
  const me = auth.session?.user.id;
  const isOwner = !share || share.ownerId === me;

  const invite = async () => {
    if (busy) return;
    setBusy(true);
    const err = await shareList(category.id, email);
    setBusy(false);
    setErrorKey(err);
    if (!err) {
      setEmail('');
      close();
    }
  };

  return (
    <>
      {!share && (
        <>
          <p className="share-hint">{t('share_hint')}</p>
          <input
            className="share-email"
            type="email"
            placeholder={t('share_email_placeholder')}
            value={email}
            autoFocus={autoFocus}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void invite();
              if (e.key === 'Escape') close();
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
            <span>{t('share_invited_to')}</span>{' '}
            <span className="share-addr" {...dirProps(share.memberEmail)}>
              {share.memberEmail}
            </span>
          </p>
          {isOwner && (
            <button
              className="share-send share-quiet"
              onClick={() => {
                void revokeShare(share.id);
                close();
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
              close();
            }}
          >
            {isOwner ? t('revoke_share') : t('leave_share')}
          </button>
        </>
      )}
    </>
  );
}

export default function ShareMenu({ category }: { category: Category }) {
  const { shareOf } = useSeder();
  useLang();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});

  if (category.system) return null; // the Pool never shares
  const share = shareOf(category.id);
  const shared = share?.status === 'accepted';

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 264;
    // keep inside the viewport horizontally (physical coords by design)
    const left = Math.max(8, Math.min(r.left - width / 2, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 6, left });
    setOpen((o) => !o);
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
              <ShareBody category={category} close={() => setOpen(false)} />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
