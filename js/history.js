// Price history for one share or fund.
//  - Mutual funds: every NAV since launch from mfapi.in (free, allows browser requests).
//  - Shares and ETFs: daily closes asked from the backend (Apps Script, reads Yahoo Finance). Needs the backend with the "history" action.
import { S } from './store.js';
import { call } from './remote.js';
import { mfGet } from './mfapi.js';

const cache = new Map();
const iso = (s) => { const [d, m, y] = s.split('-'); return `${y}-${m}-${d}`; };

/** [{d:'2024-05-31', v:123.4}] oldest first. */
export async function fundNavs(code) {
  const key = 'mf:' + code;
  if (cache.has(key)) return cache.get(key);
  const body = await mfGet(`/${encodeURIComponent(code)}`);
  cache.set('mfmeta:' + code, body.meta || null);
  const rows = (body.data || []).map((x) => ({ d: iso(x.date), v: parseFloat(x.nav) })).filter((x) => x.v > 0).reverse();
  cache.set(key, rows);
  return rows;
}
export async function stockCloses(symbol, yahoo) {
  const key = 'eq:' + symbol;
  if (cache.has(key)) return cache.get(key);
  if (!S.cfg || !S.cfg.backendUrl) throw new Error('Price history for shares comes through your backend, which is not connected on this device.');
  let res;
  try { res = await call(S.cfg.backendUrl, S.cfg.key, 'history', { symbol, yahoo: yahoo || '' }); }
  catch (e) { throw new Error(/Unknown action/i.test(e.message) ? 'Your backend needs the newer Code.gs (it adds the “history” action). Copy backend/Code.gs into your Apps Script project and deploy a new version.' : e.message); }
  if (!res || res.error || !res.series) throw new Error((res && res.error && /Unknown action/i.test(res.error)) ? 'Your backend needs the newer Code.gs (it adds the “history” action). Copy backend/Code.gs into your Apps Script project and deploy a new version.' : (res && res.error) || 'No price history found for ' + symbol + '.');
  const rows = res.series.map((x) => ({ d: x[0], v: x[1] })).filter((x) => x.v > 0);
  cache.set(key, rows);
  return rows;
}

/**
 * Daily open, high, low, close and volume for a candlestick chart: [{d, o, h, l, c, v}] oldest first.
 * Needs the backend's newer "history" action (it adds the ohlc rows). When the backend is older, returns { rows: [], closesOnly: [...] } so a line can still be drawn.
 */
export async function stockOhlc(symbol, yahoo) {
  const key = 'ohlc:' + symbol;
  if (cache.has(key)) return cache.get(key);
  if (!S.cfg || !S.cfg.backendUrl) throw new Error('Price history for shares comes through your backend, which is not connected on this device.');
  let res;
  try { res = await call(S.cfg.backendUrl, S.cfg.key, 'history', { symbol, yahoo: yahoo || '', ohlc: true }); }
  catch (e) { throw new Error(/Unknown action/i.test(e.message) ? 'Your backend needs the newer Code.gs (it adds the “history” action). Copy backend/Code.gs into your Apps Script project and deploy a new version.' : e.message); }
  if (!res || res.error || !res.series) throw new Error((res && res.error) || 'No price history found for ' + symbol + '.');
  const out = res.ohlc ? { rows: res.ohlc.map((x) => ({ d: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 })).filter((x) => x.c > 0), closesOnly: null }
    : { rows: [], closesOnly: res.series.map((x) => ({ d: x[0], v: x[1] })) };
  cache.set(key, out);
  return out;
}
/** Forget what was loaded for a share, so the next view asks the backend again. */
export function dropCache(symbol) { for (const k of ['eq:', 'ohlc:', 'eps:', 'info:']) cache.delete(k + symbol); for (const k of [...cache.keys()]) if (k.startsWith('ipe:')) cache.delete(k); ipeFailed.clear(); }
/** Reported earnings per share for the P/E line: { quarterly: [{date, eps}], annual: [{date, eps}] }. Needs the newer Code.gs ("eps" action). */
export async function stockEps(symbol, yahoo) {
  const key = 'eps:' + symbol;
  if (cache.has(key)) return cache.get(key);
  if (!S.cfg || !S.cfg.backendUrl) throw new Error('Earnings history comes through your backend, which is not connected on this device.');
  let res;
  try { res = await call(S.cfg.backendUrl, S.cfg.key, 'eps', { symbol, yahoo: yahoo || '' }); }
  catch (e) { throw new Error(/Unknown action/i.test(e.message) ? 'Your backend needs the newer Code.gs (it adds the “eps” action) to draw the P/E history.' : e.message); }
  if (!res || res.error || !(res.quarterly || res.annual)) throw new Error((res && res.error && !/Unknown action/i.test(res.error)) ? res.error : 'Your backend needs the newer Code.gs (it adds the “eps” action) to draw the P/E history.');
  const out = { quarterly: res.quarterly || [], annual: res.annual || [] };
  cache.set(key, out);
  return out;
}
const ipeBusy = new Map(), ipeFailed = new Map();
const capObj = () => (typeof window !== 'undefined' ? window.Capacitor : null);
/** The index P/E is read straight from NSE by the phone, so it exists only inside the Android app (a web page cannot read NSE, and Google's servers are not allowed to). */
export const nativeApp = () => { const c = capObj(); return !!(c && c.isNativePlatform && c.isNativePlatform()); };
/** Forget a remembered failure so the next call asks again (Try again, Reload chart). */
export function retryIndexPe(name) { ipeFailed.delete(name); }
const pad2 = (n) => String(n).padStart(2, '0');
const ddmmyyyy = (d) => pad2(d.getUTCDate()) + pad2(d.getUTCMonth() + 1) + d.getUTCFullYear();
const weekday = (d) => { while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() - 86400000); return d; };
/** The days to read: the last trading day of every month for `years` years, plus every Friday of the last four months (so the recent end of the line is fine-grained). */
export function sampleDays(years, today = new Date()) {
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())), out = new Map();
  for (let m = 0; m < years * 12; m++) {
    const d = weekday(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - m + 1, 0)));
    if (d <= t) out.set(d.getTime(), d);
  }
  for (let k = 0; k < 17; k++) { const d = weekday(new Date(t.getTime() - k * 7 * 86400000)); out.set(d.getTime(), d); }
  return [...out.values()].sort((a, b) => a - b);
}
const csvSplit = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
/** One day's P/E for an index out of NSE's "all indices" closing file text: { d: 'YYYY-MM-DD', pe } or null. */
export function peFromCsv(text, name) {
  const lines = String(text || '').split(/\r?\n/); if (lines.length < 2) return null;
  const head = csvSplit(lines[0]).map((x) => x.toLowerCase()), iN = head.indexOf('index name'), iD = head.indexOf('index date'), iP = head.indexOf('p/e');
  if (iN < 0 || iD < 0 || iP < 0) return null;
  const want = String(name).trim().toUpperCase();
  for (let k = 1; k < lines.length; k++) {
    const f = csvSplit(lines[k]); if (String(f[iN] || '').toUpperCase() !== want) continue;
    const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(f[iD] || ''), pe = parseFloat(f[iP]);
    return m && pe > 0 ? { d: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, pe } : null;
  }
  return null;
}
const IPE_KEY = 'pt.ipe';
const ipeStore = () => { try { return JSON.parse(localStorage.getItem(IPE_KEY) || '{}'); } catch { return {}; } };
/**
 * Historical P/E of an NSE index, read by the Android app straight from NSE's daily "all indices" closing file through the phone's own connection:
 * [{ d, pe }] oldest first. Readings are kept on the phone (not in your data), so after the first load only new days are fetched.
 * Outside the Android app it says so and fetches nothing. One call per index at a time; a failure is remembered until Try again / Reload chart.
 */
export function stockIndexPe(name, years = 10) {
  const key = 'ipe:' + name, hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  if (ipeBusy.has(name)) return ipeBusy.get(name);
  if (ipeFailed.has(name)) return Promise.reject(new Error(ipeFailed.get(name)));
  const p = (async () => {
    if (!nativeApp()) throw new Error('The index P/E is available in the Android app only.');
    const cap = capObj(), http = (cap.Plugins && cap.Plugins.CapacitorHttp) || (cap.registerPlugin && cap.registerPlugin('CapacitorHttp'));
    if (!http || !http.request) throw new Error('This version of the Android app cannot read NSE directly. Update the app.');
    const store = ipeStore(), mine = store[name.toUpperCase()] || {}, codes = {};
    const tried = new Set(), UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
    let cookie = '';
    const one = async (day) => {
      const k = day.toISOString().slice(0, 10); if (mine[k] != null) return true;
      tried.add(k);
      try {
        const headers = { 'User-Agent': UA, Accept: 'text/csv,*/*', Referer: 'https://www.nseindia.com/' }; if (cookie) headers.Cookie = cookie;
        const r = await http.request({ url: 'https://nsearchives.nseindia.com/content/indices/ind_close_all_' + ddmmyyyy(day) + '.csv', method: 'GET', headers, responseType: 'text', connectTimeout: 15000, readTimeout: 20000 });
        codes[r.status] = (codes[r.status] || 0) + 1;
        if (r.status !== 200) return false;
        const v = peFromCsv(typeof r.data === 'string' ? r.data : '', name);
        if (v) { mine[v.d] = v.pe; return v.d === k; }
      } catch (e) { codes[e && e.message ? e.message.slice(0, 40) : 'error'] = (codes[e && e.message ? e.message.slice(0, 40) : 'error'] || 0) + 1; }
      return false;
    };
    const run = async (days) => {
      const q = days.slice();
      const worker = async () => { for (let d = q.shift(); d; d = q.shift()) await one(d); };
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    };
    let days = sampleDays(years);
    // today's readings first, so a block is seen at once: if the first few all come back refused, ask NSE's main page for its session cookie and go on with it
    await run(days.slice(-3));
    if (!Object.keys(mine).length && (codes[401] || codes[403])) {
      try { const r = await http.request({ url: 'https://www.nseindia.com/', method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html' }, responseType: 'text', connectTimeout: 15000, readTimeout: 20000 }); const sc = r.headers && (r.headers['Set-Cookie'] || r.headers['set-cookie']); if (sc) cookie = String(sc).split(/,(?=\s*\w+=)/).map((c) => c.split(';')[0].trim()).join('; '); } catch { /* the main page may refuse too */ }
    }
    await run(days.slice(0, -3));
    // holidays have no file: look at the day before, up to three times
    for (let pass = 0; pass < 3; pass++) {
      const missing = days.filter((d) => mine[d.toISOString().slice(0, 10)] == null);
      if (!missing.length || missing.length === days.length) break;
      days = missing.map((d) => weekday(new Date(d.getTime() - 86400000))).filter((d) => !tried.has(d.toISOString().slice(0, 10)));
      await run(days);
    }
    const keys = Object.keys(mine);
    if (!keys.length) {
      const sc = Object.entries(codes).map(([k, n]) => `${k} ×${n}`).join(', ');
      throw new Error('NSE gave no P/E readings for ' + name + (sc ? ' (it answered: ' + sc + ')' : '') + '. Check the index name, or press Try again later.');
    }
    try { store[name.toUpperCase()] = mine; localStorage.setItem(IPE_KEY, JSON.stringify(store)); } catch { /* the phone's storage is full or blocked: the readings are just fetched again next time */ }
    const out = keys.sort().map((d) => ({ d, pe: mine[d] }));
    cache.set(key, out);
    return out;
  })();
  ipeBusy.set(name, p);
  p.then(() => ipeBusy.delete(name), (e) => { ipeBusy.delete(name); ipeFailed.set(name, e.message); });
  return p;
}
/** Quote figures (P/E, 52-week range, volume ...) and deeper numbers (margins, growth, debt, target) for one share: { q, d } (either may be null). */
export async function stockInfo(symbol, yahoo) {
  const key = 'info:' + symbol, hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.v;
  if (!S.cfg || !S.cfg.backendUrl) throw new Error('Key figures come through your backend, which is not connected on this device.');
  const ask = (a, p) => call(S.cfg.backendUrl, S.cfg.key, a, p).catch(() => null);
  const [f, d] = await Promise.all([ask('fundamentals', { symbols: [{ symbol, yahoo: yahoo || '' }] }), ask('details', { symbol, yahoo: yahoo || '' })]);
  const v = { q: f && f.data ? f.data[symbol] || null : null, d: d && d.details ? d.details : null };
  if (!v.q && !v.d) throw new Error('No figures found for ' + symbol + '.');
  cache.set(key, { at: Date.now(), v });
  return v;
}
/**
 * Fewer, wider candles for long ranges: 'D' keeps days, 'W' joins each ISO week (Monday start), 'M' each month.
 * Open is the first day's open, close the last day's close, high and low the extremes, volume the sum.
 */
export function aggregateOhlc(rows, mode = 'D') {
  if (mode === 'D' || !rows.length) return rows;
  const keyOf = (d) => {
    if (mode === 'M') return d.slice(0, 7);
    const t = new Date(d + 'T00:00:00Z'), day = (t.getUTCDay() + 6) % 7;
    return new Date(t.getTime() - day * 86400000).toISOString().slice(0, 10);
  };
  const out = []; let cur = null, ck = '';
  for (const r of rows) {
    const k = keyOf(r.d);
    if (!cur || k !== ck) { cur = { d: r.d, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }; out.push(cur); ck = k; }
    else { cur.h = Math.max(cur.h, r.h); cur.l = Math.min(cur.l, r.l); cur.c = r.c; cur.v += r.v; cur.d = r.d; }
  }
  return out;
}
/** The candle size that keeps a chart readable: days up to 6 months, weeks up to 3 years, then months. */
export const candleMode = (months) => (months && months <= 6 ? 'D' : months && months <= 36 ? 'W' : 'M');
export const RANGES = [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['3Y', 36], ['5Y', 60], ['Max', 0]];
export function sliceRange(rows, months, asOf = null) {
  if (!months || !rows.length) return rows;
  const end = asOf || rows[rows.length - 1].d;
  const [y, m, d] = end.split('-').map(Number);
  const c = new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
  const out = rows.filter((x) => x.d >= c);
  return out.length > 1 ? out : rows.slice(-2);
}
/** At most n points, always keeping the first and last. */
export function sample(rows, n = 100) {
  if (rows.length <= n) return rows;
  const out = [], step = (rows.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(rows[Math.round(i * step)]);
  return out;
}
export function summarise(rows) {
  if (rows.length < 2) return null;
  const a = rows[0], b = rows[rows.length - 1];
  const vs = rows.map((x) => x.v), hi = Math.max(...vs), lo = Math.min(...vs);
  const days = (Date.parse(b.d) - Date.parse(a.d)) / 86400000;
  const change = b.v / a.v - 1;
  return { from: a, to: b, change, high: hi, low: lo, fromHigh: b.v / hi - 1, yearly: days >= 300 ? Math.pow(b.v / a.v, 365 / days) - 1 : null };
}

/** Fund house and category, known after the NAV history has been loaded. */
export const fundMeta = (code) => cache.get('mfmeta:' + code) || null;
