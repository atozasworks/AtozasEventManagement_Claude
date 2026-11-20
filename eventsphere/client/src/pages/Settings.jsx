import { useTheme } from '../context/ThemeContext.jsx';

export default function Settings() {
  const { theme, setTheme } = useTheme();

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
    </div>
  );
}
