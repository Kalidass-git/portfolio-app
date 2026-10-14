import { S, resolveGuard, dailyPoint, init, subscribe, pull, setData, setCfg, connect, recompute, startOfDaySnapshot, resolveConflict } from './store.js';
import { h, $, toast, dialog, btn, formDialog, route } from './ui.js';
import { autoPoint } from './views/backups.js';
import * as home from './views/home.js';
import * as cash from './views/cash.js';
import * as fixed from './views/fixed.js';
import * as equity from './views/equity.js';
import * as gold from './views/gold.js';
import * as flow from './views/flow.js';
import * as plan from './views/plan.js';
import * as report from './views/report.js';
import * as settings from './views/settings.js';

const ROUTES = {
  home: { label: 'Home', view: home, tab: 'home', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  cash: { label: 'Cash & savings', short: 'Cash', view: cash, tab: 'assets', group: 'Assets', icon: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' },
  fixed: { label: 'Fixed income', short: 'Fixed income', view: fixed, tab: 'assets', group: 'Assets', icon: 'M4 20V8l8-5 8 5v12M9 20v-6h6v6' },
  equity: { label: 'Shares & funds', short: 'Shares & funds', view: equity, tab: 'assets', group: 'Assets', icon: 'M4 19V5M4 19h16M8 15l4-5 3 3 5-6' },
  gold: { label: 'Gold & others', short: 'Gold & more', view: gold, tab: 'assets', group: 'Assets', icon: 'M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z' },
  flow: { label: 'Income & expenses', view: flow, tab: 'flow', icon: 'M4 6h16M4 12h10M4 18h6' },
  plan: { label: 'Plan', view: plan, tab: 'plan', icon: 'M5 19V9m7 10V5m7 14v-7' },
  report: { label: 'Family report', view: report, tab: 'report', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7' },
  settings: { label: 'Settings', view: settings, tab: 'settings', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h3m12 0h3M12 3v3m0 12v3' },
};
const TABS = [['home', 'Home', 'home'], ['assets', 'Assets', 'cash'], ['flow', 'Expenses', 'flow'], ['plan', 'Plan', 'plan'], ['report', 'Report', 'report']];
const icon = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; };

const FS = [1, 1.15, 1.3, 1.5];
const setFont = (n) => { setCfg({ fontScale: n }); document.documentElement.style.setProperty('--fs', n); renderView(); };
const eye = (masked) => icon(masked ? 'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a14 14 0 0 1-3 3.6M6.5 7.5C4.5 9 3.1 11 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2' : 'M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z');
const routeName = () => { const r = route().name; return ROUTES[r] ? r : 'home'; };

function shell() {
  const root = $('#app');
  root.replaceChildren(
    h('a', { href: '#main', class: 'skip' }, 'Skip to content'),
    h('aside', { class: 'side', id: 'side' }),
    h('div', { class: 'main-col' }, h('header', { class: 'top', id: 'top' }), h('main', { id: 'main', tabindex: '-1' })),
    h('nav', { class: 'tabbar', id: 'tabbar', 'aria-label': 'Main' }));
}

function chrome() {
  const cur = routeName();
  const side = $('#side');
  const groups = [];
  side.replaceChildren(h('div', { class: 'brand' }, h('span', { class: 'mark' }, '₹'), h('span', null, 'Family Wealth')));
  const list = h('ul');
  let lastGroup = null;
  for (const [k, r] of Object.entries(ROUTES)) {
    if (r.group && r.group !== lastGroup) list.append(h('li', { class: 'grp' }, r.group));
    lastGroup = r.group || null;
    list.append(h('li', null, h('a', { href: '#/' + k, class: k === cur ? 'on' : '', 'aria-current': k === cur ? 'page' : null }, icon(r.icon), r.label)));
  }
  side.append(list);

  const tb = $('#tabbar');
  tb.replaceChildren(...TABS.map(([t, label, to]) => h('a', { href: '#/' + to, class: ROUTES[cur].tab === t ? 'on' : '', 'aria-current': ROUTES[cur].tab === t ? 'page' : null }, icon(ROUTES[to].icon), h('span', null, label))));

  const top = $('#top');
  const st = S.status;
  const chip = S.saveFailed ? h('a', { class: 'chip-status bad', href: '#/settings', title: 'Storage on this device is full or blocked' }, 'Not saved on this device')
    : S.status === 'guard' ? h('button', { class: 'chip-status bad', onclick: guardDialog }, 'Check big change')
    : !S.remote ? h('span', { class: 'chip-status' }, 'This device only')
    : st === 'syncing' ? h('span', { class: 'chip-status' }, 'Syncing…')
    : st === 'conflict' ? h('button', { class: 'chip-status bad', onclick: conflictDialog }, 'Fix sync')
    : st === 'error' || st === 'offline' ? h('a', { class: 'chip-status bad', href: '#/settings' }, st === 'offline' ? 'Offline' : 'Sync problem')
    : S.meta.dirty ? h('span', { class: 'chip-status' }, 'Saving…') : h('span', { class: 'chip-status ok' }, S.role === 'owner' ? 'Saved to Drive' : 'View only');
  top.replaceChildren(
    h('div', { class: 'title' }, ROUTES[cur].group ? h('span', { class: 'crumb' }, ROUTES[cur].group) : null, h('h1', null, ROUTES[cur].label)),
    h('div', { class: 'top-right' }, chip,
      S.remote ? h('button', { class: 'icon', 'aria-label': 'Refresh from Drive', title: 'Refresh from Drive', onclick: async () => { try { await pull(); } catch (e) { toast(e.message, 'bad'); } } }, '↻') : null,
      h('button', { class: 'icon eye', 'aria-label': S.masked ? 'Show figures' : 'Hide figures', title: S.masked ? 'Show figures' : 'Hide figures', 'aria-pressed': S.masked ? 'false' : 'true', onclick: () => { S.masked = !S.masked; renderView(); } }, eye(S.masked)),
      h('button', { class: 'icon aa', 'aria-label': 'Text size', title: 'Text size', onclick: () => { const i = FS.findIndex((f) => f >= (S.cfg.fontScale || 1) - 0.001); const n = FS[(i + 1) % FS.length]; setFont(n); toast('Text size ' + Math.round(n * 100) + '%'); } }, h('span', { class: 'aa-t' }, 'Aa')),
      h('a', { class: 'icon', href: '#/settings', 'aria-label': 'Settings' }, icon(ROUTES.settings.icon))));
  document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
  document.title = ROUTES[cur].label + ' · Family Wealth';
}

function guardDialog() {
  const g = S.guard; if (!g) return;
  const names = { ledger: 'bank entries', trades: 'buy and sell records', mfTxns: 'fund transactions', stocks: 'shares', funds: 'funds', bonds: 'bonds', lending: 'lending items', savings: 'savings items' };
  dialog('A big deletion was held back', h('div', null,
    h('p', null, 'Before uploading to Drive, the app noticed that this device now has far fewer records than the last synced copy:'),
    h('ul', null, g.shrunk.map((x) => h('li', null, `${names[x.what] || x.what}: ${x.from} → ${x.to}`))),
    h('p', null, 'If you archived, replaced a history or deleted these on purpose, upload it. If not, go back to the last synced copy. A restore point is saved either way.')),
    [{ label: 'Upload this change', class: 'primary', onclick: async (c) => { c(); await autoPoint('Before uploading a big change'); try { await resolveGuard('sync'); toast('Uploaded'); } catch (e) { toast(e.message, 'bad'); } renderView(); } },
     { label: 'Go back to the last synced copy', class: 'danger', onclick: async (c) => { c(); await autoPoint('Before going back to the synced copy'); try { await resolveGuard('undo'); toast('Restored the last synced copy'); } catch (e) { toast(e.message, 'bad'); } renderView(); } },
     { label: 'Decide later', onclick: (c) => c() }]);
}

function conflictDialog() {
  const done = (msg) => (c) => { c(); msg && toast(msg); };
  dialog('Two devices changed the data', h('div', null,
    h('p', null, 'This device and Google Drive both have changes the app could not combine on its own. Choose which copy to keep. A restore point is saved first, so you can undo this from Settings.'),
    h('p', { class: 'note' }, 'Tip: edit on one device at a time, and let the "Saved to Drive" label show before you switch.')),
    [{ label: 'Keep this device’s data', class: 'primary', onclick: async (c) => { c(); await autoPoint('Before keeping this device (sync conflict)'); try { await resolveConflict('mine'); toast('Drive now has this device’s data'); } catch (e) { toast(e.message, 'bad'); } renderView(); } },
     { label: 'Use the Drive copy', class: 'danger', onclick: async (c) => { c(); await autoPoint('Before using the Drive copy (sync conflict)'); try { await resolveConflict('drive'); toast('Loaded the Drive copy'); } catch (e) { toast(e.message, 'bad'); } renderView(); } },
     { label: 'Decide later', onclick: done() }]);
}

let shownMerge = 0;
function mergeNotice() {
  const m = S.lastMerge;
  if (!m || m.at === shownMerge) return;
  shownMerge = m.at;
  toast(m.clashes ? `Combined with changes from your other device. ${m.clashes} item${m.clashes === 1 ? ' was' : 's were'} edited on both; this device’s version was kept.` : 'Combined with changes from your other device.');
}

function assetsSubnav(cur) {
  if (ROUTES[cur].tab !== 'assets') return null;
  return h('nav', { class: 'section-tabs', 'aria-label': 'Asset types' }, Object.entries(ROUTES).filter(([, r]) => r.group === 'Assets').map(([k, r]) => h('a', { class: k === cur ? 'on' : '', href: '#/' + k, 'aria-current': k === cur ? 'page' : null }, r.short || r.label)));
}

const NEG = /^\s*[-−–]\s?₹|^\s*[-−]\d|^\s*[-−]\s?[\d.,]+\s?(L|Cr|K|%)/;
function markNegatives(root) {
  for (const el of root.querySelectorAll('td, .stat-value, .rl-val, .kpi-value, .gain, strong, .chip-btn')) {
    if (el.children.length > 1) continue;
    const t = el.textContent || '';
    if (t.length < 30 && NEG.test(t)) el.classList.add('neg');
  }
}

let rendering = false;
function renderView() {
  if (rendering) return; rendering = true;
  try {
    if (!S.data) return welcome();
    chrome();
    const cur = routeName();
    const main = $('#main');
    const scroll = main.scrollTop, y = window.scrollY;
    const page = ROUTES[cur].view.render();
    main.replaceChildren(...[assetsSubnav(cur), page].filter(Boolean));
    markNegatives(main);
    const where = cur + '/' + route().sub;
    if (window.__lastRoute === where) window.scrollTo(0, y); else { window.scrollTo(0, 0); window.__lastRoute = where; }
  } catch (e) {
    console.error(e);
    $('#main').replaceChildren(h('div', { class: 'page' }, h('div', { class: 'card' }, h('h2', null, 'Something went wrong showing this page'), h('p', null, e.message), h('p', { class: 'note' }, 'Your data is safe. Go back to Home or reload the app.'))));
  } finally { rendering = false; }
}

function welcome() {
  const root = $('#app');
  root.className = 'welcome-root';
  const dataIn = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'file-in' });
  dataIn.onchange = async () => {
    const f = dataIn.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!settings.validData(d)) throw 0; setData(d, { dirty: false }); root.className = ''; shell(); renderView(); toast('Data loaded'); }
    catch { toast('That is not a portfolio data file. Pick the portfolio-data.json file.', 'bad'); }
  };
  const parts = new URLSearchParams(location.hash.split('?')[1] || '');
  root.replaceChildren(h('div', { class: 'welcome' },
    h('div', { class: 'brand big' }, h('span', { class: 'mark' }, '₹'), h('span', null, 'Family Wealth')),
    h('h1', null, 'Everything the family owns, in one place'),
    h('p', null, 'Open your data file to get started, or connect to the Google Drive backend to see the latest numbers.'),
    h('div', { class: 'row' },
      h('label', { class: 'primary btn', for: 'file-in' }, 'Open data file'), dataIn,
      h('button', { onclick: () => formDialog({ title: 'Connect to Google Drive backend', saveLabel: 'Connect', value: { url: parts.get('u') || '', key: parts.get('k') || '' }, fields: [{ key: 'url', label: 'Backend web app URL', required: true }, { key: 'key', label: 'Access key', required: true }], onSave: (v) => { connect(v.url.trim(), v.key.trim()).then(() => pull({ force: true })).then((r) => { if (r && r.empty) toast('The Drive file is empty. The owner needs to upload data first.', 'bad'); else { root.className = ''; shell(); renderView(); } }).catch((e) => toast(e.message, 'bad')); } }) }, 'Connect to Google Drive')),
    h('p', { class: 'note' }, 'Your numbers stay on your phone and in your own Google Drive. Nothing is sent to anyone else.')));
  if (parts.get('u') && parts.get('k')) setTimeout(() => $('.welcome .row button')?.click(), 100);
}

// ---------- boot ----------
init();
document.documentElement.style.setProperty('--fs', S.cfg.fontScale || 1);
document.documentElement.dataset.theme = S.cfg.theme === 'auto' ? '' : S.cfg.theme;
shell();
window.addEventListener('hashchange', renderView);
window.addEventListener('rerender', renderView);
let t;
subscribe(() => { mergeNotice(); clearTimeout(t); t = setTimeout(() => { if (S.data) renderView(); }, 30); });
renderView();
startOfDaySnapshot();
dailyPoint();
window.addEventListener('beforeunload', (e) => { if (S.meta && S.meta.dirty && S.remote && S.role === 'owner') { e.preventDefault(); e.returnValue = ''; } });
if (S.remote) pull().catch(() => {});
window.addEventListener('online', () => S.remote && pull().catch(() => {}));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.remote && !S.meta.dirty) pull().catch(() => {}); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
