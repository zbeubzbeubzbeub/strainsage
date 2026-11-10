/* Service worker de StrainSage (PWA du chat client).
   À CHAQUE MODIFICATION d'index.html (ou des fichiers qu'il charge), incrémenter CACHE ('strainsage-v2', …)
   pour que les téléphones abandonnent l'ancien cache.
   Seules les requêtes GET du même domaine passent par ici : Worker Cloudflare, Firebase, Anthropic,
   streaming SSE et toute autre origine vont directement au réseau, sans cache. */
const CACHE = 'strainsage-v2';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // réseau d'abord (toujours la dernière version en ligne), cache en secours hors ligne
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('/index.html'))));
});
