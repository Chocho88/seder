import { useEffect, useSyncExternalStore } from 'react';
import icons from '../vendor/design-system/icons.svg';
import { useSeder } from './lib/store';
import { useLang, toggleLang, t } from './lib/i18n';
import Canvas from './components/Canvas';
import { SectionShell, renderSection } from './components/Sections';
import DetailPanel from './components/DetailPanel';
import CaptureBar from './components/CaptureBar';
import SettingsMenu from './components/SettingsMenu';
import MobileBar from './components/MobileBar';
import Toast from './components/Toast';
import TouchDragLayer from './components/TouchDragLayer';
import LogbookPanel from './components/LogbookPanel';
import AccountMenu from './components/AccountMenu';
import InviteBanner from './components/InviteBanner';
import RecoveryBanner from './components/RecoveryBanner';

// One clean scrollable column on phones: lists on top, matrix below (the
// user's whiteboard sketch). Desktop is the holistic canvas - no tabs.
const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)') : null;
function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => mq?.matches ?? false,
  );
}

/** Phone: the same sections, one clean scrollable column, same order. */
function MobileCanvas() {
  const { sections } = useSeder();
  return (
    <div className="mobile-canvas">
      {sections
        .filter((s) => s.on)
        .map((s) => (
          <SectionShell key={s.id} id={s.id}>
            {renderSection(s.id)}
          </SectionShell>
        ))}
    </div>
  );
}

export default function App() {
  const { ready, init, openItemId, setCaptureOpen } = useSeder();
  const [lang] = useLang();
  const isMobile = useIsMobile();

  useEffect(() => {
    void init();
  }, [init]);

  // Global shortcuts: Cmd+K capture, Cmd+Z undo (outside text fields)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCaptureOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          void useSeder.getState().undo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCaptureOpen]);

  return (
    <div className="seder-shell">
      <header className="app-header">
        <div className="app-header-left">
          <AccountMenu />
        </div>
        <div className="app-header-center">
          {/* The wordmark is always the Hebrew brand, in Migdal Haemeq */}
          <span className="app-logo-text">סדר</span>
        </div>
        <div className="app-header-right">
          <SettingsMenu />
          <button className="header-toggle lang-toggle" data-toggle="lang" onClick={() => toggleLang()}>
            {lang === 'en' ? 'HE' : 'EN'}
          </button>
          <button
            className="header-toggle"
            aria-label="Toggle theme"
            onClick={() => {
              const html = document.documentElement;
              const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
              html.setAttribute('data-theme', next);
              localStorage.setItem('klod-theme', next);
            }}
          >
            <svg className="icon icon-md">
              <use href={`${icons}#icon-sun`} />
            </svg>
          </button>
        </div>
      </header>

      <InviteBanner />
      <RecoveryBanner />
      <main className="seder-main">
        {!ready ? null : isMobile ? <MobileCanvas /> : <Canvas />}
      </main>

      {openItemId && <DetailPanel key={openItemId} itemId={openItemId} />}
      <CaptureBar />
      <MobileBar />
      <Toast />
      <TouchDragLayer />
      <LogbookPanel />
    </div>
  );
}
