// Undo toast: a 5-second escape hatch after destructive actions.

import { useEffect } from 'react';
import { useSeder } from '../lib/store';
import { t } from '../lib/i18n';
import './toast.css';

export default function Toast() {
  const { toast, clearToast, undo } = useSeder();

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(clearToast, 5000);
    return () => window.clearTimeout(id);
  }, [toast, clearToast]);

  if (!toast) return null;
  return (
    <div className="toast-undo" role="status">
      <span>{toast.label}</span>
      <button className="toast-undo-btn pressable" onClick={() => void undo()}>
        {t('undo')}
      </button>
    </div>
  );
}
