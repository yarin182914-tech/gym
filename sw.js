// Minimal offline shell — network-first for same-origin GET requests,
// falling back to whatever was last cached when the network fails (spotty
// gym wifi, tunnel between sets, etc). Deliberately no hand-maintained
// precache list: this app has 30+ ES module files and no build step, so
// every successful same-origin GET is just cached opportunistically as it's
// fetched instead of enumerating files here that would drift out of sync.
const CACHE_NAME = 'gym-site-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
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
