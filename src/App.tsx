import { useEffect, useSyncExternalStore } from 'react';
import icons from '../../design-system/icons.svg';
import { useSeder } from './lib/store';
import { useLang, toggleLang, t } from './lib/i18n';
import Canvas from './components/Canvas';
import Board from './components/Board';
import MatrixView from './components/MatrixView';
import DetailPanel from './components/DetailPanel';
import CaptureBar from './components/CaptureBar';
import SettingsMenu from './components/SettingsMenu';
import MobileBar from './components/MobileBar';

// One clean scrollable column on phones: lists on top, matrix below (the
// user's whiteboard sketch). Desktop is the holistic canvas — no tabs.
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

export default function App() {
  const { ready, init, openItemId, setCaptureOpen } = useSeder();
  const [lang] = useLang();
  const isMobile = useIsMobile();

  useEffect(() => {
    void init();
  }, [init]);

  // Global shortcut: Cmd+K capture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCaptureOpen]);

  return (
    <div className="seder-shell">
      <header className="app-header">
        <div className="app-header-left" />
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

      <main className="seder-main">
        {!ready ? null : isMobile ? (
          <>
            <section className="mobile-section">
              <Board />
            </section>
            <section className="mobile-section">
              <h2 className="mobile-section-label">{t('view_today')}</h2>
              <MatrixView />
            </section>
          </>
        ) : (
          <Canvas />
        )}
      </main>

      {openItemId && <DetailPanel key={openItemId} itemId={openItemId} />}
      <CaptureBar />
      {isMobile && <MobileBar />}
    </div>
  );
}
