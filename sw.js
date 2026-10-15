// Offline shell: the app files are cached; data lives in the browser's storage, so the last synced numbers show without internet.
const CACHE = 'family-wealth-v13';
const FILES = ['./', './index.html', './css/app.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './js/main.js', './js/store.js', './js/remote.js', './js/calc.js', './js/prices.js', './js/ui.js', './js/charts.js',
  './js/views/home.js', './js/views/cash.js', './js/views/fixed.js', './js/views/equity.js', './js/views/gold.js', './js/views/flow.js', './js/views/plan.js', './js/views/report.js', './js/views/settings.js', './js/views/savings.js', './js/views/dividends.js', './js/version.js', './js/epf.js', './js/divfetch.js', './js/views/equity-fund.js', './js/projector.js', './js/views/projector.js', './js/views/proj-shared.js', './js/views/proj-year.js', './js/views/proj-ahead.js', './js/views/proj-market.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // never cache API calls (backend, mfapi)
  // network first so updates arrive, cache as the offline fallback
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
