// Omni-bar (Cmd+K): type naturally; #category picks a list, ! flags today.
// Doubles as search. Mic button uses Web Speech dictation (phase 1: no AI).

import { useEffect, useMemo, useRef, useState } from 'react';
import icons from '../../vendor/design-system/icons.svg';
import { db } from '../lib/db';
import { useSeder } from '../lib/store';
import { useLang } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import { parseDueDate, formatDue } from '../lib/dates';
import type { Item } from '../lib/types';
import './capture.css';

// Footer syntax-hint labels (chrome strings local to this bar; the shared
// dictionary keeps the long-form placeholder for other surfaces).
const HINT_LABELS = {
  list: { en: 'list', he: 'רשימה' },
  today: { en: 'today', he: 'להיום' },
} as const;

export default function CaptureBar() {
  const { captureOpen, captureDictate, setCaptureOpen, categories, items, addItem, openItem, setLogbookOpen } =
    useSeder();
  const [lang, t] = useLang();
  // Resting state stays a three-word invitation; the #/! cheat-sheet lives in
  // the footer as keycap tokens, so strip the parenthetical from the dict string.
  const placeholder = t('capture_placeholder').replace(/\s*\(.*?\)\s*$/u, '');
  const [text, setText] = useState('');
  const [sel, setSel] = useState(-1); // keyboard selection in matches; -1 = capture
  const [listening, setListening] = useState(false);
  const [chosenCatId, setChosenCatId] = useState<string | null>(null); // chip choice; null = Pool
  const [dateOff, setDateOff] = useState(false); // user rejected the parsed date
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

  // Esc closes capture wherever focus is (chips, mic, chip-x...)
  useEffect(() => {
    if (!captureOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCaptureOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [captureOpen, setCaptureOpen]);

  useEffect(() => {
    if (captureOpen) inputRef.current?.focus();
    else {
      setText('');
      setSel(-1);
      setChosenCatId(null);
      setDateOff(false);
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
    // natural-language dates: "מחר", "friday"... "today/היום" means the flag.
    // Clicking the date chip rejects the parse - the word stays in the title.
    let due: number | null = null;
    const parsedDate = dateOff ? null : parseDueDate(rest);
    if (parsedDate) {
      if (/^(today|היום)$/i.test(parsedDate.token)) today = true;
      else due = parsedDate.due;
      rest = rest.replace(parsedDate.token, ' ').replace(/\s{2,}/g, ' ');
    }
    return { title: rest.trim(), today, category, due };
  }, [text, categories, chosenCatId, pool, dateOff]);

  // Quick find: titles first, then notes, then the archive (loaded lazily,
  // only while typing). Each match remembers where it was found.
  const [archived, setArchived] = useState<Item[]>([]);
  useEffect(() => {
    if (!captureOpen) {
      setArchived([]);
      return;
    }
    if (text.trim().length >= 2 && archived.length === 0) {
      void db.items
        .filter((i) => i.archivedAt !== null)
        .toArray()
        .then(setArchived);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureOpen, text]);

  const matches = useMemo<{ item: Item; where: 'title' | 'notes' | 'archived' }[]>(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [];
    const live = items.filter((i) => !i.done);
    const byTitle = live.filter((i) => i.title.toLowerCase().includes(q)).map((item) => ({ item, where: 'title' as const }));
    const byNotes = live
      .filter((i) => !i.title.toLowerCase().includes(q) && (i.notes.toLowerCase().includes(q) || i.nextMove.toLowerCase().includes(q)))
      .map((item) => ({ item, where: 'notes' as const }));
    const byArchive = archived
      .filter((i) => i.title.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q))
      .map((item) => ({ item, where: 'archived' as const }));
    return [...byTitle, ...byNotes, ...byArchive].slice(0, 7);
  }, [text, items, archived]);

  const catOf = (id: string) => categories.find((c) => c.id === id);

  const submit = async () => {
    if (!parsed.title || !parsed.category) return;
    await addItem({ title: parsed.title, categoryId: parsed.category.id, today: parsed.today, due: parsed.due });
    setCaptureOpen(false);
  };

  const openMatch = (id: string, fromArchive = false) => {
    if (fromArchive) {
      // archived items aren't in the live store: open the logbook instead
      setLogbookOpen(true);
    } else {
      openItem(id);
    }
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
                if (sel >= 0 && matches[sel]) openMatch(matches[sel].item.id, matches[sel].where === 'archived');
                else void submit();
              } else if (e.key === 'Escape') {
                setCaptureOpen(false);
              }
            }}
            {...dirProps(text || placeholder)}
          />
          {/* Destination is signaled exactly once - by the active chip in the
              chooser row below (it mirrors #syntax parsing live). Only the
              flags that have no other home ride the input line: today + due. */}
          {parsed.today && (
            <span className="capture-today-flag">
              <svg className="icon" aria-hidden="true">
                <use href={`${icons}#icon-star`} />
              </svg>
              {t('today_flag')}
            </span>
          )}
          {parsed.due !== null && (
            <button
              className="capture-today-flag capture-due-chip"
              type="button"
              title={t('dismiss')}
              onClick={() => setDateOff(true)}
            >
              <svg className="icon" aria-hidden="true">
                <use href={`${icons}#icon-calendar`} />
              </svg>
              {formatDue(parsed.due, lang)}
              <svg className="icon capture-chip-x" aria-hidden="true">
                <use href={`${icons}#icon-x`} />
              </svg>
            </button>
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
            {matches.map(({ item: m, where }, i) => {
              const cat = catOf(m.categoryId);
              const catName = cat?.system ? t('pool') : cat?.name;
              return (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={i === sel}
                  className={`capture-match ${i === sel ? 'is-selected' : ''}${where === 'archived' ? ' is-archived' : ''}`}
                  onClick={() => openMatch(m.id, where === 'archived')}
                  onMouseEnter={() => setSel(i)}
                >
                  <span className="cat-dot" data-cat={cat?.colorKey} />
                  <span className="capture-match-title" {...dirProps(m.title)}>
                    {m.title}
                  </span>
                  {where !== 'title' && (
                    <span className="capture-match-where">
                      {where === 'notes' ? t('search_notes_hint') : t('search_archived_hint')}
                    </span>
                  )}
                  {catName && (
                    <span className="capture-match-cat" {...dirProps(catName)}>
                      {catName}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer is now a single keycap family - syntax guidance at the start,
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
