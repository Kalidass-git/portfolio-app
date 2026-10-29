// Offline shell: the app files are cached; data lives in the browser's storage, so the last synced numbers show without internet.
const CACHE = 'family-wealth-v99';
const FILES = ['./', './index.html', './css/app.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/mark.svg', './icons/favicon-32.png', './icons/apple-touch-180.png',
  './js/main.js', './js/notify.js', './js/native.js', './js/store.js', './js/remote.js', './js/calc.js', './js/prices.js', './js/ui.js', './js/mobilebar.js', './js/charts.js',
  './js/views/home.js', './js/views/cash.js', './js/views/fixed.js', './js/views/equity.js', './js/views/gold.js', './js/views/flow.js', './js/views/report.js', './js/views/settings.js', './js/views/savings.js', './js/views/dividends.js', './js/version.js', './js/history.js', './js/mfapi.js', './js/watch.js', './js/views/watch.js', './js/views/histcard.js', './js/epf.js', './js/divfetch.js', './js/views/equity-fund.js', './js/projector.js', './js/bankimport.js', './js/views/cash-import.js',
  './js/views/incexp.js', './js/views/networth.js', './js/views/insights.js', './js/views/groupmix.js', './js/insights.js', './js/views/projector.js', './js/views/risk.js', './js/views/proj-shared.js', './js/views/proj-year.js', './js/views/proj-plan.js', './js/planner.js', './js/growth.js', './js/views/proj-ahead.js', './js/views/proj-market.js', './js/actuals.js', './js/risk.js', './js/views/proj-actual.js', './js/views/proj-risk.js', './js/views/proj-whatif.js', './js/monthdetail.js', './js/allocation.js', './js/views/monthdetail.js', './js/interestcert.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // never cache API calls (backend, mfapi)
  // network first so updates arrive, cache as the offline fallback
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
