import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { LanguageChoices } from '../components/LanguageMenu.jsx';

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    if (location.hash !== '#language') return;
    document.getElementById('language')?.scrollIntoView({ block: 'start' });
  }, [location.hash]);

  return (
    <div className="page narrow">
      <h1>Settings</h1>
      <section className="card settings-card">
        <h2>Appearance</h2>
        <p className="muted small">Choose how EventSphere looks on this device.</p>
        <div className="theme-bar" data-mode={theme} role="group" aria-label="Color theme">
          <span className="theme-bar-thumb" aria-hidden="true" />
          <button type="button" className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button type="button" className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </section>
      <section className="card settings-card" id="language">
        <h2>Language</h2>
        <p className="muted small">Google Translate rewrites the app into the language you pick. English shows the original text.</p>
        <LanguageChoices />
      </section>
    </div>
  );
}
