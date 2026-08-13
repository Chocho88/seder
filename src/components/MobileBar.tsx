// Mobile-only bottom capture bar (Keep's thumb-reach pattern, calmer).
// Hidden on desktop via CSS. Quick-add opens the omni capture; mic opens it
// with dictation already running.

import icons from '../../../design-system/icons.svg';
import { useSeder } from '../lib/store';
import { t } from '../lib/i18n';
import './mobilebar.css';

export default function MobileBar() {
  const { setCaptureOpen } = useSeder();
  return (
    <div className="mobile-bar" role="toolbar">
      <button className="mobile-bar-add pressable" onClick={() => setCaptureOpen(true)}>
        <svg className="icon icon-sm" aria-hidden="true">
          <use href={`${icons}#icon-plus`} />
        </svg>
        <span>{t('add_item')}</span>
      </button>
      <button className="mobile-bar-mic pressable" aria-label="Dictate" onClick={() => setCaptureOpen(true, true)}>
        <svg className="icon icon-md">
          <use href={`${icons}#icon-mic`} />
        </svg>
      </button>
    </div>
  );
}
