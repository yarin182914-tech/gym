// Minimal offline shell — network-first for same-origin GET requests,
// falling back to whatever was last cached when the network fails (spotty
// gym wifi, tunnel between sets, etc). Deliberately no hand-maintained
// precache list for the full app: this app has 30+ ES module files and no
// build step, so every successful same-origin GET is just cached
// opportunistically as it's fetched instead of enumerating every page module
// here that would drift out of sync.
const CACHE_NAME = 'gym-site-v2';

// The one exception: the top-level shell IS worth precaching explicitly, so
// a launch from the home-screen icon is instant/offline even on the very
// first cold start (before anything's been fetched opportunistically yet).
// Everything else — page modules, lib/, ui/ — still relies on the fetch
// handler below after first use, same as before.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/01-tokens.css',
  './css/02-base.css',
  './css/03-components.css',
  './css/04-utilities.css',
  './js/app.js',
  './images/favicon-32.png',
  './images/apple-touch-icon.png',
  './images/icon-192.png',
  './images/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
