// Omni-bar (Cmd+K): type naturally; #category picks a list, ! flags today.
// Doubles as search. Mic button uses Web Speech dictation (phase 1: no AI).

import { useEffect, useMemo, useRef, useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder } from '../lib/store';
import { useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import { parseDueDate, formatDue } from '../lib/dates';
import './capture.css';

// Footer syntax-hint labels (chrome strings local to this bar; the shared
// dictionary keeps the long-form placeholder for other surfaces).
const HINT_LABELS = {
  list: { en: 'list', he: 'רשימה' },
  today: { en: 'today', he: 'להיום' },
} as const;

export default function CaptureBar() {
  const { captureOpen, captureDictate, setCaptureOpen, categories, items, addItem, openItem } = useSeder();
  const [lang, t] = useLang();
  // Resting state stays a three-word invitation; the #/! cheat-sheet lives in
  // the footer as keycap tokens, so strip the parenthetical from the dict string.
  const placeholder = t('capture_placeholder').replace(/\s*\(.*?\)\s*$/u, '');
  const [text, setText] = useState('');
  const [sel, setSel] = useState(-1); // keyboard selection in matches; -1 = capture
  const [listening, setListening] = useState(false);
  const [chosenCatId, setChosenCatId] = useState<string | null>(null); // chip choice; null = Pool
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);

  // ?capture=1 → open on load (deep links, screenshot rigs)
  useEffect(() => {
    if (new URLSearchParams(location.search).get('capture') === '1') setCaptureOpen(true);
  }, [setCaptureOpen]);

  // Mobile mic button: open with dictation already running
  useEffect(() => {
    if (captureOpen && captureDictate && !listening) dictate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureOpen, captureDictate]);

  useEffect(() => {
    if (captureOpen) inputRef.current?.focus();
    else {
      setText('');
      setSel(-1);
      setChosenCatId(null);
      recRef.current?.stop?.();
      setListening(false);
    }
  }, [captureOpen]);

  // Parse: #category (prefix match, any language), ! = today.
  // Destination resolution: #syntax wins, then the tapped chip, then the Pool -
  // the basic intake for everything not yet assigned.
  const pool = categories.find((c) => c.system) ?? categories[0] ?? null;
  const parsed = useMemo(() => {
    let rest = text;
    let today = false;
    let category = categories.find((c) => c.id === chosenCatId) ?? pool;
    if (rest.includes('!')) {
      today = true;
      rest = rest.replace('!', '');
    }
    const hash = rest.match(/#(\S+)/);
    if (hash) {
      const match = categories.find((c) => c.name.toLowerCase().startsWith(hash[1].toLowerCase()));
      if (match) {
        category = match;
        rest = rest.replace(hash[0], '');
      }
    }
    // natural-language dates: "מחר", "friday"... "today/היום" means the flag
    let due: number | null = null;
    const parsedDate = parseDueDate(rest);
    if (parsedDate) {
      if (/^(today|היום)$/i.test(parsedDate.token)) today = true;
      else due = parsedDate.due;
      rest = rest.replace(parsedDate.token, ' ').replace(/\s{2,}/g, ' ');
    }
    return { title: rest.trim(), today, category, due };
  }, [text, categories, chosenCatId, pool]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [];
    return items.filter((i) => !i.done && i.title.toLowerCase().includes(q)).slice(0, 5);
  }, [text, items]);

  const catOf = (id: string) => categories.find((c) => c.id === id);

  const submit = async () => {
    if (!parsed.title || !parsed.category) return;
    await addItem({ title: parsed.title, categoryId: parsed.category.id, today: parsed.today, due: parsed.due });
    setCaptureOpen(false);
  };

  const openMatch = (id: string) => {
    openItem(id);
    setCaptureOpen(false);
  };

  const dictate = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = document.documentElement.lang === 'he' ? 'he-IL' : 'en-US';
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setText(transcript);
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  };

  if (!captureOpen) return null;

  return (
    <div className="capture-overlay" onClick={() => setCaptureOpen(false)}>
      <div
        className="capture"
        role="dialog"
        aria-modal="true"
        aria-label={t('search_or_add')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="capture-inputrow">
          <svg className="icon icon-md capture-lead" aria-hidden="true">
            <use href={`${icons}#icon-plus`} />
          </svg>
          <input
            ref={inputRef}
            className="capture-input"
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSel(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && matches.length > 0) {
                e.preventDefault();
                setSel((s) => (s + 1) % matches.length);
              } else if (e.key === 'ArrowUp' && matches.length > 0) {
                e.preventDefault();
                setSel((s) => (s <= 0 ? matches.length - 1 : s - 1));
              } else if (e.key === 'Enter') {
                if (sel >= 0 && matches[sel]) openMatch(matches[sel].id);
                else void submit();
              } else if (e.key === 'Escape') {
                setCaptureOpen(false);
              }
            }}
            {...dirProps(text || placeholder)}
          />
          {/* Live parse result rides the input line itself: a small text-scale
              token docked at the trailing edge, so it reads as "this line goes
              to X" rather than as footer chrome. data-cat supplies
              --cat-color/--cat-tint to the token and its dot. */}
          {parsed.category && (
            <span className="capture-dest-chip" data-cat={parsed.category.colorKey}>
              <span className="cat-dot" />
              <span
                className="capture-dest-name"
                {...dirProps(parsed.category.system ? t('pool') : parsed.category.name)}
              >
                {parsed.category.system ? t('pool') : parsed.category.name}
              </span>
            </span>
          )}
          {parsed.today && <span className="capture-today-flag">{t('today_flag')}</span>}
          {parsed.due !== null && (
            <span className="capture-today-flag capture-due-chip">{formatDue(parsed.due, lang)}</span>
          )}
          <button
            className={`capture-mic pressable ${listening ? 'listening' : ''}`}
            aria-label="Dictate"
            aria-pressed={listening}
            onClick={dictate}
          >
            <svg className="icon icon-md">
              <use href={`${icons}#icon-mic`} />
            </svg>
          </button>
        </div>

        {/* destination chooser: one tap per list; the Pool is home base */}
        <div className="capture-cats" role="radiogroup">
          {categories.map((c) => {
            const active = parsed.category?.id === c.id;
            return (
              <button
                key={c.id}
                role="radio"
                aria-checked={active}
                className={`capture-cat${active ? ' active' : ''}`}
                data-cat={c.colorKey}
                onClick={() => {
                  setChosenCatId(c.id);
                  inputRef.current?.focus();
                }}
              >
                <span className="cat-dot" />
                <span {...dirProps(c.system ? t('pool') : c.name)}>{c.system ? t('pool') : c.name}</span>
              </button>
            );
          })}
        </div>

        {matches.length > 0 && (
          <div className="capture-matches" role="listbox">
            {matches.map((m, i) => {
              const cat = catOf(m.categoryId);
              return (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={i === sel}
                  className={`capture-match ${i === sel ? 'is-selected' : ''}`}
                  onClick={() => openMatch(m.id)}
                  onMouseEnter={() => setSel(i)}
                >
                  <span className="cat-dot" data-cat={cat?.colorKey} />
                  <span className="capture-match-title" {...dirProps(m.title)}>
                    {m.title}
                  </span>
                  {cat && (
                    <span className="capture-match-cat" {...dirProps(cat.name)}>
                      {cat.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer is now a single keycap family — syntax guidance at the start,
            the commit key at the end. All live state lives up in the input line. */}
        <div className="capture-footer">
          <div className="capture-hints">
            <span
              className={`capture-hint capture-hint-syntax ${text ? 'is-quiet' : ''}`}
              aria-hidden="true"
            >
              <kbd className="capture-kbd">#</kbd>
              <span>{HINT_LABELS.list[lang]}</span>
            </span>
            <span
              className={`capture-hint capture-hint-syntax ${text ? 'is-quiet' : ''}`}
              aria-hidden="true"
            >
              <kbd className="capture-kbd">!</kbd>
              <span>{HINT_LABELS.today[lang]}</span>
            </span>
          </div>
          <span className="capture-hint">
            <kbd className="capture-kbd">↵</kbd>
            <span>{t('add_item')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
