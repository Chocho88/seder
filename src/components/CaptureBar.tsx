// Omni-bar (Cmd+K): type naturally; #category picks a list, ! flags today.
// Doubles as search. Mic button uses Web Speech dictation (phase 1: no AI).

import { useEffect, useMemo, useRef, useState } from 'react';
import icons from '../../../design-system/icons.svg';
import { useSeder } from '../lib/store';
import { t } from '../lib/i18n';
import { dirProps } from '../lib/rtl';
import './capture.css';

export default function CaptureBar() {
  const { captureOpen, setCaptureOpen, categories, items, addItem, openItem } = useSeder();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (captureOpen) inputRef.current?.focus();
    else {
      setText('');
      recRef.current?.stop?.();
      setListening(false);
    }
  }, [captureOpen]);

  // Parse: #category (prefix match, any language), ! = today
  const parsed = useMemo(() => {
    let rest = text;
    let today = false;
    let category = categories[0] ?? null;
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
    return { title: rest.trim(), today, category };
  }, [text, categories]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [];
    return items.filter((i) => !i.done && i.title.toLowerCase().includes(q)).slice(0, 5);
  }, [text, items]);

  const submit = async () => {
    if (!parsed.title || !parsed.category) return;
    await addItem({ title: parsed.title, categoryId: parsed.category.id, today: parsed.today });
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
      <div className="capture" onClick={(e) => e.stopPropagation()}>
        <div className="capture-inputrow">
          <input
            ref={inputRef}
            className="capture-input"
            placeholder={t('capture_placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
              if (e.key === 'Escape') setCaptureOpen(false);
            }}
            {...dirProps(text || t('capture_placeholder'))}
          />
          <button className={`capture-mic ${listening ? 'listening' : ''}`} aria-label="Dictate" onClick={dictate}>
            <svg className="icon icon-md">
              <use href={`${icons}#icon-mic`} />
            </svg>
          </button>
        </div>
        {parsed.title && (
          <div className="capture-preview">
            <span className="cat-dot" data-cat={parsed.category?.colorKey} style={{ background: `var(--cat-${parsed.category?.colorKey})` }} />
            <span>{parsed.category?.name}</span>
            {parsed.today && <span className="capture-today-flag">{t('today_flag')}</span>}
          </div>
        )}
        {matches.length > 0 && (
          <div className="capture-matches">
            {matches.map((m) => (
              <button
                key={m.id}
                className="capture-match"
                onClick={() => {
                  openItem(m.id);
                  setCaptureOpen(false);
                }}
                {...dirProps(m.title)}
              >
                {m.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
