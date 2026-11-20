import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { clearDeferredPrompt, getDeferredPrompt, runningAsInstalledApp, subscribeInstallPrompt } from '../pwa.js';

const LATER_KEY = 'es_pwa_later';
const PwaInstallContext = createContext(null);

export function PwaInstallProvider({ children }) {
  const [prompt, setPrompt] = useState(() => getDeferredPrompt());
  const [installed, setInstalled] = useState(() => runningAsInstalledApp());
  const [later, setLater] = useState(() => {
    try {
      return localStorage.getItem(LATER_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  useEffect(() => subscribeInstallPrompt((event, meta) => {
    if (meta?.installed) {
      setInstalled(true);
      setPrompt(null);
      return;
    }
    setInstalled(false);
    setPrompt(event);
  }), []);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => { if (mq.matches) setInstalled(true); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    return undefined;
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(LATER_KEY, '1');
    } catch {
      /* the card still closes for this visit */
    }
    setLater(true);
  };

  const install = async () => {
    const event = promptRef.current;
    if (!event || busy || installed) return;
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      clearDeferredPrompt();
      setPrompt(null);
      if (choice?.outcome === 'accepted') setInstalled(true);
    } catch {
      clearDeferredPrompt();
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  };

  const canInstall = Boolean(prompt) && !installed;

  return (
    <PwaInstallContext.Provider value={{
      showCard: canInstall && !later,
      showHeader: canInstall && later,
      busy,
      install,
      dismiss,
    }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}
