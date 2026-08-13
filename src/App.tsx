import { useEffect, useSyncExternalStore } from 'react';
import icons from '../../design-system/icons.svg';
import { useSeder } from './lib/store';
import { useLang, toggleLang, t } from './lib/i18n';
import Board from './components/Board';
import TodayView from './components/TodayView';
import MatrixView from './components/MatrixView';
import AllView from './components/AllView';
import DetailPanel from './components/DetailPanel';
import CaptureBar from './components/CaptureBar';
import StyleSwitcher from './components/StyleSwitcher';
import MobileBar from './components/MobileBar';
import type { ViewId } from './lib/types';

// One clean scrollable column on phones: lists on top, matrix below (the
// user's whiteboard sketch). Desktop keeps the view switcher.
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

const VIEWS: { id: ViewId; key: string }[] = [
  { id: 'today', key: 'view_today' },
  { id: 'board', key: 'view_board' },
  { id: 'matrix', key: 'view_matrix' },
  { id: 'all', key: 'view_all' },
];

export default function App() {
  const { ready, init, view, setView, openItemId, setCaptureOpen } = useSeder();
  const [lang] = useLang();
  const isMobile = useIsMobile();

  useEffect(() => {
    void init();
  }, [init]);

  // Global shortcuts: Cmd+K capture, 1-4 views
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCaptureOpen(true);
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        const idx = ['1', '2', '3', '4'].indexOf(e.key);
        if (idx >= 0) setView(VIEWS[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCaptureOpen, setView]);

  return (
    <div className="seder-shell">
      <header className="app-header">
        <div className="app-header-left">
          <nav className="view-switcher" aria-label="Views">
            {VIEWS.map((v) => (
              <button key={v.id} aria-current={view === v.id} onClick={() => setView(v.id)}>
                {t(v.key)}
              </button>
            ))}
          </nav>
        </div>
        <div className="app-header-center">
          {/* The wordmark is always the Hebrew brand, in Migdal Haemeq */}
          <span className="app-logo-text">סדר</span>
        </div>
        <div className="app-header-right">
          <StyleSwitcher />
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
              <MatrixView scope="today" />
            </section>
          </>
        ) : view === 'today' ? (
          <TodayView />
        ) : view === 'board' ? (
          <Board />
        ) : view === 'matrix' ? (
          <MatrixView scope="all" />
        ) : (
          <AllView />
        )}
      </main>

      {openItemId && <DetailPanel key={openItemId} itemId={openItemId} />}
      <CaptureBar />
      {isMobile && <MobileBar />}
    </div>
  );
}
