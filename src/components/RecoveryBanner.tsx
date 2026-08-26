// The one-tap way out of the two-accounts trap: when a different account
// signs in on a device, the previous account's data is snapshotted before
// the privacy wipe (auth.ts). This banner offers to bring those tasks into
// the CURRENT account - re-keyed, synced up, done. Quiet, dismissible.

import { useState } from 'react';
import { useSeder } from '../lib/store';
import { useAuth } from '../lib/auth';
import { t, tfmt, useLang } from '../lib/i18n';
import './invitebanner.css';

export default function RecoveryBanner() {
  const { recovery, restoreRecovery, dismissRecovery } = useSeder();
  const auth = useAuth();
  useLang();
  const [busy, setBusy] = useState(false);

  // only offer once signed in - restoring into local-only mode would hand
  // the data to whoever signs in next
  if (!recovery || recovery.itemCount === 0 || auth.status !== 'signed-in') return null;

  return (
    <div className="invite-banners">
      <div className="invite-banner" role="status">
        <span className="invite-banner-text">{tfmt('recovery_found', { n: String(recovery.itemCount) })}</span>
        <span className="invite-banner-actions">
          <button
            className="invite-accept"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await restoreRecovery();
              setBusy(false);
            }}
          >
            {t('recovery_restore')}
          </button>
          <button className="invite-decline" disabled={busy} onClick={dismissRecovery}>
            {t('recovery_dismiss')}
          </button>
        </span>
      </div>
    </div>
  );
}
