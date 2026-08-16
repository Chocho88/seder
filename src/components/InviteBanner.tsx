// The quiet invite banner: "X shared 'בית' with you - accept / decline".
// Discovered on sign-in / pull (the shares table), no email infra involved.
// One line under the header; disappears the moment it is answered.

import { useState } from 'react';
import { useSeder } from '../lib/store';
import { useAuth } from '../lib/auth';
import { tfmt, t, useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import './invitebanner.css';

export default function InviteBanner() {
  const { shares, categories, acceptShare, declineShare } = useSeder();
  const auth = useAuth();
  useLang();
  const [busyId, setBusyId] = useState<string | null>(null);

  const myEmail = auth.session?.user.email?.toLowerCase();
  const myId = auth.session?.user.id;
  if (!myEmail) return null;
  const invites = shares.filter(
    (s) => s.status === 'invited' && s.memberId === null && s.ownerId !== myId && s.memberEmail.toLowerCase() === myEmail,
  );
  if (invites.length === 0) return null;

  return (
    <div className="invite-banners">
      {invites.map((s) => {
        // the list's name lives on the owner's category row, which RLS hides
        // until the invite is accepted - an ellipsis stands in until then
        const name = categories.find((c) => c.id === s.listId)?.name ?? '…';
        const line = tfmt('invite_banner', { owner: s.ownerEmail, list: name });
        return (
          <div key={s.id} className="invite-banner" role="status">
            <span className="invite-banner-text" {...dirProps(line)}>
              {line}
            </span>
            <span className="invite-banner-actions">
              <button
                className="invite-accept"
                disabled={busyId === s.id}
                onClick={async () => {
                  setBusyId(s.id);
                  await acceptShare(s.id);
                  setBusyId(null);
                }}
              >
                {t('accept')}
              </button>
              <button className="invite-decline" disabled={busyId === s.id} onClick={() => void declineShare(s.id)}>
                {t('decline')}
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
