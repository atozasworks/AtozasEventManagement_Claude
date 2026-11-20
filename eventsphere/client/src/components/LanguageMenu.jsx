import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, languageShort } from '../languages.js';
import { useLanguage } from '../context/LanguageContext.jsx';

function TranslateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 8 6 8" />
      <path d="m4 16 6-8 2 3" />
      <path d="M2 5h12" />
      <path d="M7 2v3" />
      <path d="m14 19 4-9 4 9" />
      <path d="M15.5 15h5" />
    </svg>
  );
}

export function LanguageChoices({ onPick }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="lang-list notranslate" translate="no">
      {LANGUAGES.map((item) => (
        <button
          key={item.code}
          type="button"
          className={language === item.code ? 'lang-option on' : 'lang-option'}
          aria-pressed={language === item.code}
          onClick={() => {
            onPick?.();
            setLanguage(item.code);
          }}
        >
          <span>{item.native}</span>
          <span className="muted small">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function LanguageMenu() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const current = LANGUAGES.find((item) => item.code === language) || LANGUAGES[0];

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lang-menu notranslate" translate="no" ref={boxRef}>
      <button
        type="button"
        className="lang-header-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language, ${current.label}`}
        title={`Language: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <TranslateIcon />
        <span>{languageShort(language)}</span>
      </button>
      {open && (
        <div className="lang-panel" role="listbox" aria-label="Choose a language">
          <LanguageChoices onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
