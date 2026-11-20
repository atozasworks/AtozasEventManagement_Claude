/* Minimal worker so Chromium treats EventSphere as installable.
   Requests stay on the network; this does not cache the app. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {});
