/* Offline support: app files are served from cache and refreshed in the background.
   Bump VERSION after changing app files so phones pick up the update quickly. */
const VERSION = 'ellipse-v5';
const APP = ['./', 'index.html', 'styles.css', 'pricing.js', 'app.js', 'view3d.js', 'rates.json', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'assets/company_logo.png', 'assets/sign-and-seal.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([...APP, ...CDN])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && url.hostname !== 'cdnjs.cloudflare.com' && url.hostname !== 'cdn.jsdelivr.net') return; // maps, NASA, price list: always network
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
