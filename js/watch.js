// Watchlist, price alerts and "where to look" screens for shares and funds.
//  Indicators for shares (P/E, 52-week range, averages) come from the backend; for funds they are worked out from the NAV history.
//  Alert rules are saved in the data file (data.alerts, data.watchlist). The latest indicators are kept on this device only.
import { S } from './store.js';
import { call } from './remote.js';
import { fundNavs, fundMeta } from './history.js';

const KEY = 'fw.metrics', KEYAT = 'fw.metricsAt';
let M = {};
try { M = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { M = {}; }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(M)); localStorage.setItem(KEYAT, String(Date.now())); } catch { /* private window */ } };
export const metrics = () => M;
export const metricsAt = () => { try { return Number(localStorage.getItem(KEYAT)) || 0; } catch { return 0; } };
export const isStale = (ms = 4 * 3600e3) => !metricsAt() || Date.now() - metricsAt() > ms;
export const stockKey = (sym) => 'EQ:' + String(sym || '').toUpperCase().trim();
export const fundKey = (code) => 'MF:' + String(code || '').trim();

// ---------- fund indicators from the NAV history ----------
const back = (rows, days) => { const t = Date.parse(rows[rows.length - 1].d) - days * 86400000; for (let i = rows.length - 1; i >= 0; i--) if (Date.parse(rows[i].d) <= t) return rows[i]; return null; };
const avg = (rows, n) => (rows.length >= n ? rows.slice(-n).reduce((a, x) => a + x.v, 0) / n : null);
export function fundIndicators(rows) {
  if (!rows || rows.length < 2) return null;
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  const year = rows.filter((x) => Date.parse(x.d) >= Date.parse(last.d) - 365 * 86400000);
  const vs = year.map((x) => x.v);
  const ret = (d) => { const b = back(rows, d); return b ? last.v / b.v - 1 : null; };
  const cagr = (y) => { const b = back(rows, 365 * y); return b ? Math.pow(last.v / b.v, 1 / y) - 1 : null; };
  let ath = 0; for (const x of rows) if (x.v > ath) ath = x.v;
  const rets = []; for (let i = 1; i < year.length; i++) rets.push(year[i].v / year[i - 1].v - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1), sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1));
  const first = rows[0], yrs = (Date.parse(last.d) - Date.parse(first.d)) / (365 * 86400000);
  return { price: last.v, priceDate: last.d, dayPct: last.v / prev.v - 1, hi52: Math.max(...vs), lo52: Math.min(...vs), dma50: avg(rows, 50), dma200: avg(rows, 200),
    ret1m: ret(30), ret3m: ret(91), ret6m: ret(182), ret1y: ret(365), cagr3: cagr(3), cagr5: cagr(5), sinceStart: yrs >= 1 ? Math.pow(last.v / first.v, 1 / yrs) - 1 : null, startDate: first.d,
    fromAth: last.v / ath - 1, vol: rets.length > 20 ? sd * Math.sqrt(250) : null, pe: null };
}

// ---------- what to look at ----------
/** Every share and fund the screens and alerts cover: holdings, then watchlist. */
export function universe(data, all) {
  const out = [], seen = new Set();
  const add = (o) => { if (!seen.has(o.key)) { seen.add(o.key); out.push(o); } };
  const stockTotal = all.stocks.items.reduce((a, x) => a + (x.current || 0), 0), fundTotal = all.mf.items.reduce((a, x) => a + (x.current || 0), 0);
  for (const s of all.stocks.items) add({ kind: 'stock', ref: s.symbol, key: stockKey(s.symbol), name: s.name, yahoo: s.yahoo || '', held: true, value: s.current, ret: s.ret, weight: stockTotal ? s.current / stockTotal : 0, etf: s.assetClass && s.assetClass !== 'equity', href: '#/equity/holding?sym=' + encodeURIComponent(s.symbol) });
  for (const m of all.mf.items) if (m.schemeCode) add({ kind: 'fund', ref: String(m.schemeCode), key: fundKey(m.schemeCode), name: m.name, held: true, value: m.current, ret: m.ret, weight: fundTotal ? m.current / fundTotal : 0, href: '#/equity/fund?id=' + encodeURIComponent(m.id) });
  for (const w of data.watchlist || []) add({ kind: w.kind, ref: String(w.ref), key: w.kind === 'stock' ? stockKey(w.ref) : fundKey(w.ref), name: w.name || w.ref, yahoo: w.yahoo || '', held: false });
  return out;
}

// ---------- alert rules ----------
const R = (x) => '₹' + (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-IN') : x.toFixed(2));
const P = (x) => (x * 100).toFixed(1) + '%';
const both = ['stock', 'fund'];
export const RULES = [
  { id: 'priceBelow', label: 'Price falls to or below', kinds: ['stock'], unit: '₹', test: (m, v) => m.price != null && m.price <= v, text: (m, v) => `Price ${R(m.price)} is at or below ${R(v)}` },
  { id: 'priceAbove', label: 'Price rises to or above', kinds: ['stock'], unit: '₹', test: (m, v) => m.price != null && m.price >= v, text: (m, v) => `Price ${R(m.price)} is at or above ${R(v)}` },
  { id: 'navBelow', label: 'NAV falls to or below', kinds: ['fund'], unit: '₹', test: (m, v) => m.price != null && m.price <= v, text: (m, v) => `NAV ${R(m.price)} is at or below ${R(v)}` },
  { id: 'navAbove', label: 'NAV rises to or above', kinds: ['fund'], unit: '₹', test: (m, v) => m.price != null && m.price >= v, text: (m, v) => `NAV ${R(m.price)} is at or above ${R(v)}` },
  { id: 'peBelow', label: 'P/E falls to or below', kinds: ['stock'], unit: 'times', test: (m, v) => m.pe > 0 && m.pe <= v, text: (m, v) => `P/E ${m.pe.toFixed(1)} is at or below ${v}` },
  { id: 'peAbove', label: 'P/E rises to or above', kinds: ['stock'], unit: 'times', test: (m, v) => m.pe > 0 && m.pe >= v, text: (m, v) => `P/E ${m.pe.toFixed(1)} is at or above ${v}` },
  { id: 'pbBelow', label: 'Price to book falls to or below', kinds: ['stock'], unit: 'times', test: (m, v) => m.pb > 0 && m.pb <= v, text: (m, v) => `Price to book ${m.pb.toFixed(2)} is at or below ${v}` },
  { id: 'dyAbove', label: 'Dividend yield rises to or above', kinds: ['stock'], unit: '%', test: (m, v) => m.dy != null && m.dy >= v, text: (m, v) => `Dividend yield ${m.dy.toFixed(2)}% is at or above ${v}%` },
  { id: 'near52High', label: 'Within this % of the 52-week high (or above it)', kinds: both, unit: '%', dflt: 2, test: (m, v) => m.hi52 > 0 && m.price != null && m.price >= m.hi52 * (1 - v / 100), text: (m) => `${R(m.price)} is ${P(1 - m.price / m.hi52)} from its 52-week high of ${R(m.hi52)}`.replace('-', '') },
  { id: 'near52Low', label: 'Within this % of the 52-week low (or below it)', kinds: both, unit: '%', dflt: 3, test: (m, v) => m.lo52 > 0 && m.price != null && m.price <= m.lo52 * (1 + v / 100), text: (m) => `${R(m.price)} is close to its 52-week low of ${R(m.lo52)}` },
  { id: 'fallFromHigh', label: 'Down at least this % from the 52-week high', kinds: both, unit: '%', dflt: 20, test: (m, v) => m.hi52 > 0 && m.price != null && m.price <= m.hi52 * (1 - v / 100), text: (m) => `Down ${P(1 - m.price / m.hi52)} from its 52-week high of ${R(m.hi52)}` },
  { id: 'belowDma200', label: 'Falls below its 200-day average', kinds: both, unit: '', noValue: true, test: (m) => m.dma200 > 0 && m.price != null && m.price < m.dma200, text: (m) => `${R(m.price)} is under its 200-day average of ${R(m.dma200)}` },
  { id: 'aboveDma200', label: 'Rises above its 200-day average', kinds: both, unit: '', noValue: true, test: (m) => m.dma200 > 0 && m.price != null && m.price > m.dma200, text: (m) => `${R(m.price)} is over its 200-day average of ${R(m.dma200)}` },
  { id: 'dayDrop', label: 'Falls this % or more in a day', kinds: both, unit: '%', dflt: 4, test: (m, v) => m.dayPct != null && m.dayPct <= -v / 100, text: (m) => `Down ${P(-m.dayPct)} on the day` },
  { id: 'dayRise', label: 'Rises this % or more in a day', kinds: both, unit: '%', dflt: 5, test: (m, v) => m.dayPct != null && m.dayPct >= v / 100, text: (m) => `Up ${P(m.dayPct)} on the day` },
  { id: 'ret1yBelow', label: '1-year return falls to or below', kinds: ['fund'], unit: '%', test: (m, v) => m.ret1y != null && m.ret1y <= v / 100, text: (m, v) => `1-year return ${P(m.ret1y)} is at or below ${v}%` },
  { id: 'ret1yAbove', label: '1-year return rises to or above', kinds: ['fund'], unit: '%', test: (m, v) => m.ret1y != null && m.ret1y >= v / 100, text: (m, v) => `1-year return ${P(m.ret1y)} is at or above ${v}%` },
];
export const ruleTag = (id) => ({ priceBelow: 'Price low', priceAbove: 'Price high', navBelow: 'NAV low', navAbove: 'NAV high', peBelow: 'Low P/E', peAbove: 'High P/E', pbBelow: 'Low P/B', dyAbove: 'High yield', near52High: '52w high', near52Low: '52w low', fallFromHigh: 'Big fall', belowDma200: 'Below trend', aboveDma200: 'Above trend', dayDrop: 'Day drop', dayRise: 'Day rise', ret1yBelow: 'Weak 1y', ret1yAbove: 'Strong 1y' }[id] || id);
export const ruleOf = (id) => RULES.find((r) => r.id === id);
export const rulesFor = (kind) => RULES.filter((r) => r.kinds.includes(kind));
export const alertKey = (a) => (a.kind === 'stock' ? stockKey(a.ref) : fundKey(a.ref));

/** Alerts whose rule is true now. `waiting` are ones with no indicator yet. */
export function evalAlerts(data, store = M) {
  const hit = [], quiet = [], waiting = [];
  for (const a of data.alerts || []) {
    if (a.on === false) continue;
    const r = ruleOf(a.rule), m = store[alertKey(a)];
    if (!r || !m) { waiting.push(a); continue; }
    const v = Number(a.value);
    const res = r.test(m, v);
    if (res === true) hit.push({ alert: a, m, text: r.text(m, v) }); else quiet.push({ alert: a, m });
  }
  return { hit, quiet, waiting };
}
export const alertText = (a) => { const r = ruleOf(a.rule); return r ? r.label + (r.noValue ? '' : r.unit === '₹' ? ' ₹' + a.value : ' ' + a.value + (r.unit === '%' ? '%' : r.unit === 'times' ? ' times' : '')) : a.rule; };

// ---------- screens ----------
const first = (arr, n = 5) => arr.slice(0, n);
/** Lists that help decide what to buy more of, or sell. rows come from universe() joined with their indicators. */
export function buildScreens(rows) {
  const w = rows.filter((r) => r.m);
  const stocks = w.filter((r) => r.kind === 'stock' && !r.etf);
  const funds = w.filter((r) => r.kind === 'fund');
  const dist = (r) => 1 - r.m.price / r.m.hi52;
  const out = [];
  const add = (id, title, hint, items, fmt) => { if (items.length) out.push({ id, title, hint, items: items.map((r) => ({ r, ...fmt(r) })) }); };
  add('hi', 'Near the 52-week high', 'Strong run. Think about trimming, or wait for a dip before adding.', first(w.filter((r) => r.m.hi52 > 0 && dist(r) <= 0.03).sort((a, b) => dist(a) - dist(b)), 6), (r) => ({ main: dist(r) <= 0 ? 'at the high' : P(dist(r)) + ' below', sub: `${R(r.m.price)} · high ${R(r.m.hi52)}` }));
  add('lo', 'Near the 52-week low', 'Cheap compared with the past year. Find out why before buying more.', first(w.filter((r) => r.m.lo52 > 0 && r.m.price <= r.m.lo52 * 1.05).sort((a, b) => a.m.price / a.m.lo52 - b.m.price / b.m.lo52), 6), (r) => ({ main: r.m.price <= r.m.lo52 ? 'at the low' : P(r.m.price / r.m.lo52 - 1) + ' above', sub: `${R(r.m.price)} · low ${R(r.m.lo52)}`, tone: 'neg' }));
  add('lowpe', 'Lowest P/E', 'Cheaper per rupee of profit. A very low P/E can also mean trouble.', first(stocks.filter((r) => r.m.pe > 0).sort((a, b) => a.m.pe - b.m.pe)), (r) => ({ main: r.m.pe.toFixed(1) + ' times', sub: `price ${R(r.m.price)}${r.m.pb ? ' · P/B ' + r.m.pb.toFixed(1) : ''}` }));
  add('highpe', 'Highest P/E', 'Priced for strong growth. Any disappointment can hurt.', first(stocks.filter((r) => r.m.pe > 0).sort((a, b) => b.m.pe - a.m.pe)), (r) => ({ main: r.m.pe.toFixed(1) + ' times', sub: `price ${R(r.m.price)}`, tone: 'neg' }));
  add('fall', 'Fallen most from the 52-week high', 'Possible buy-more candidates if the business story is still good.', first(w.filter((r) => r.m.hi52 > 0 && dist(r) >= 0.15).sort((a, b) => dist(b) - dist(a))), (r) => ({ main: '−' + P(dist(r)), sub: `${R(r.m.price)} · high ${R(r.m.hi52)}`, tone: 'neg' }));
  add('dma', 'Below the 200-day average', 'Trading under its long-term trend (3% or more).', first(w.filter((r) => r.m.dma200 > 0 && r.m.price < r.m.dma200 * 0.97).sort((a, b) => a.m.price / a.m.dma200 - b.m.price / b.m.dma200)), (r) => ({ main: P(1 - r.m.price / r.m.dma200) + ' under', sub: `${R(r.m.price)} · average ${R(r.m.dma200)}`, tone: 'neg' }));
  add('win', 'Biggest winners you hold', 'Up a lot on what you paid. Decide whether to book some profit.', first(w.filter((r) => r.held && r.ret != null && r.ret >= 0.3).sort((a, b) => b.ret - a.ret)), (r) => ({ main: '+' + P(r.ret), sub: r.m.pe > 0 ? `P/E ${r.m.pe.toFixed(0)} · ${R(r.m.price)}` : R(r.m.price), tone: 'pos' }));
  add('big', 'Biggest positions', 'More than 10% of its group in one holding is concentrated.', first(w.filter((r) => r.held && r.weight >= 0.1).sort((a, b) => b.weight - a.weight)), (r) => ({ main: P(r.weight) + ' of ' + (r.kind === 'fund' ? 'funds' : 'shares'), sub: r.ret != null ? 'gain ' + P(r.ret) : '' }));
  add('div', 'Highest dividend yield', 'Shares paying the most dividend for their price.', first(stocks.filter((r) => r.m.dy > 0).sort((a, b) => b.m.dy - a.m.dy)), (r) => ({ main: r.m.dy.toFixed(2) + '%', sub: R(r.m.price) }));
  add('fbest', 'Funds: best 1-year return', '', first(funds.filter((r) => r.m.ret1y != null).sort((a, b) => b.m.ret1y - a.m.ret1y), 4), (r) => ({ main: '+' + P(r.m.ret1y), sub: r.m.cagr3 != null ? '3-year ' + P(r.m.cagr3) + ' a year' : '', tone: r.m.ret1y >= 0 ? 'pos' : 'neg' }));
  add('fworst', 'Funds: weakest 1-year return', 'Compare with similar funds before deciding to stay.', first(funds.filter((r) => r.m.ret1y != null).sort((a, b) => a.m.ret1y - b.m.ret1y), 4), (r) => ({ main: (r.m.ret1y >= 0 ? '+' : '−') + P(Math.abs(r.m.ret1y)), sub: r.m.cagr3 != null ? '3-year ' + P(r.m.cagr3) + ' a year' : '', tone: 'neg' }));
  return out;
}

// ---------- fetching ----------
let running = null;
/** Fetch indicators for the given shares ([{ref,yahoo,key}]) and funds ([{ref,key}]). Safe to call twice: the second call joins the first. */
export function refreshMetrics(targets, onProgress = () => {}) {
  if (running) return running;
  running = (async () => {
    const out = { shares: 0, funds: 0, errors: [] };
    const at = new Date().toISOString();
    const stocks = targets.filter((t) => t.kind === 'stock'), funds = targets.filter((t) => t.kind === 'fund');
    if (stocks.length) {
      if (!S.remote) out.errors.push('Share indicators need the Google Drive backend (Settings).');
      else {
        try {
          onProgress('Fetching share ratios…');
          const res = await call(S.cfg.backendUrl, S.cfg.key, 'fundamentals', { symbols: stocks.map((t) => ({ symbol: t.ref, yahoo: t.yahoo || '' })) });
          for (const t of stocks) { const q = res.data && res.data[t.ref]; if (q) { M[t.key] = { ...q, at }; out.shares++; } }
          for (const [sym, msg] of Object.entries(res.errors || {})) out.errors.push(`${sym}: ${msg}`);
        } catch (e) { out.errors.push(/Unknown action/i.test(e.message) ? 'Your backend needs the newer Code.gs (adds “fundamentals”). Paste backend/Code.gs into Apps Script and deploy a new version.' : 'Shares: ' + e.message); }
      }
    }
    let done = 0;
    const queue = funds.slice();
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try { onProgress(`Reading fund history ${++done}/${funds.length}…`); const rows = await fundNavs(t.ref); const ind = fundIndicators(rows); if (ind) { const meta = fundMeta(t.ref); M[t.key] = { ...ind, house: meta && meta.fund_house, category: meta && meta.scheme_category, at }; out.funds++; } }
        catch (e) { out.errors.push(`${t.name || t.ref}: ${e.message}`); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    persist();
    return out;
  })().finally(() => { running = null; });
  return running;
}
export const targetsOf = (data, all) => universe(data, all).map((u) => ({ kind: u.kind, ref: u.ref, key: u.key, yahoo: u.yahoo, name: u.name }));
