/** Captures the browser install prompt as early as the page loads. */

let deferred = null;
const listeners = new Set();

function notify(installed) {
  listeners.forEach((fn) => fn(deferred, { installed }));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    notify(false);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify(true);
  });
}

export function getDeferredPrompt() {
  return deferred;
}

export function clearDeferredPrompt() {
  deferred = null;
}

export function subscribeInstallPrompt(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function runningAsInstalledApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
