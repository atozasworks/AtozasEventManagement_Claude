import { usePwaInstall } from '../context/PwaInstallContext.jsx';

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  );
}

export function PwaInstallCard() {
  const pwa = usePwaInstall();
  if (!pwa?.showCard) return null;

  return (
    <aside className="pwa-card" role="dialog" aria-label="Install EventSphere">
      <div className="pwa-card-top">
        <img className="pwa-icon" src="/icons/icon-192.png" alt="" width="48" height="48" />
        <div className="pwa-copy">
          <b>Install EventSphere</b>
          <p>Faster load times and home-screen access for events and tickets.</p>
        </div>
        <button type="button" className="pwa-close" aria-label="Not now" onClick={pwa.dismiss}>×</button>
      </div>
      <div className="pwa-actions">
        <button type="button" className="pwa-install" disabled={pwa.busy} onClick={pwa.install}>
          <DownloadIcon /> {pwa.busy ? 'Installing…' : 'Install'}
        </button>
        <button type="button" className="pwa-later" disabled={pwa.busy} onClick={pwa.dismiss}>
          <ClockIcon /> Later
        </button>
      </div>
    </aside>
  );
}

export function PwaHeaderButton() {
  const pwa = usePwaInstall();
  if (!pwa?.showHeader) return null;

  return (
    <button
      type="button"
      className="pwa-header-btn"
      aria-label="Install EventSphere"
      title="Install EventSphere"
      disabled={pwa.busy}
      onClick={pwa.install}
    >
      <DownloadIcon />
    </button>
  );
}
