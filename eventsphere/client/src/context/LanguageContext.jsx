import { createContext, useContext, useEffect, useState } from 'react';
import { LANGUAGES, readLanguage, saveLanguage, writeTranslateCookie } from '../languages.js';

const LanguageContext = createContext(null);
let scriptStarted = false;

const TRANSLATE_CHROME = [
  'iframe.skiptranslate',
  '.goog-te-banner-frame',
  '.goog-te-balloon-frame',
  '.goog-te-spinner-pos',
  '.goog-tooltip',
  '#goog-gt-tt',
  '.VIpgJd-ZVi9od-ORHb',
  '.VIpgJd-ZVi9od-aZ2wEe-wOHMyf',
  'body > .skiptranslate',
].join(',');

function hideTranslateChrome() {
  document.querySelectorAll(TRANSLATE_CHROME).forEach((el) => {
    el.setAttribute('hidden', '');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
  });
  const top = document.body?.style.top;
  if (top && top !== '0px') document.body.style.setProperty('top', '0px', 'important');
}

function watchTranslateChrome() {
  hideTranslateChrome();
  const observer = new MutationObserver(hideTranslateChrome);
  observer.observe(document.body, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  return () => observer.disconnect();
}

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
    hideTranslateChrome();
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
    if (language === 'en') {
      hideTranslateChrome();
      return undefined;
    }
    loadGoogleTranslate();
    return watchTranslateChrome();
  }, [language]);

  useEffect(() => {
    const onShow = (event) => {
      if (event.persisted && readLanguage() === 'en') window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const setLanguage = (code) => {
    const next = saveLanguage(code);
    if (next === language) return;
    setLanguageState(next);
    window.location.replace(`${window.location.pathname}${window.location.search}`);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <div id="google_translate_element" className="google-translate-host notranslate" translate="no" />
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
