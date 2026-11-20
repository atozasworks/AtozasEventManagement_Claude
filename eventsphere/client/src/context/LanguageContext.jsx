import { createContext, useContext, useEffect, useState } from 'react';
import { LANGUAGES, isLanguage, readLanguage, writeTranslateCookie } from '../languages.js';

const LanguageContext = createContext(null);
let scriptStarted = false;

function loadGoogleTranslate() {
  if (scriptStarted || window.google?.translate?.TranslateElement) return;
  scriptStarted = true;
  window.googleTranslateElementInit = () => {
    const host = document.getElementById('google_translate_element');
    if (!host || host.dataset.ready === '1' || !window.google?.translate?.TranslateElement) return;
    host.dataset.ready = '1';
    const targets = LANGUAGES.map((item) => item.code).filter((code) => code !== 'en');
    new window.google.translate.TranslateElement(
      {
        pageLanguage: 'en',
        includedLanguages: targets.join(','),
        autoDisplay: false,
      },
      'google_translate_element'
    );
  };
  const script = document.createElement('script');
  script.id = 'google-translate-script';
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  document.body.appendChild(script);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readLanguage);

  useEffect(() => {
    writeTranslateCookie(language);
    document.documentElement.lang = language === 'zh-CN' ? 'zh-CN' : language;
    loadGoogleTranslate();
  }, [language]);

  const setLanguage = (code) => {
    const next = isLanguage(code) ? code : 'en';
    if (next === language) return;
    try {
      localStorage.setItem('es_lang', next);
    } catch {
      /* the cookie still carries the choice for this reload */
    }
    writeTranslateCookie(next);
    setLanguageState(next);
    window.location.reload();
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <div id="google_translate_element" className="google-translate-host" />
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
