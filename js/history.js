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
/** Historical P/E of an NSE index from the backend ("indexpe" action): [{ d, pe }] oldest first. name is the NSE index name, for example "NIFTY 50". */
const ipeBusy = new Map(), ipeFailed = new Map();
/** Forget a remembered failure so the next call asks the backend again (Try again, Reload chart). */
export function retryIndexPe(name) { ipeFailed.delete(name); }
const IPE_YEAR_WAIT = 40000;   // how long one try waits; see ask() below for the retries
/**
 * Historical P/E of an NSE index, asked from the backend one calendar year at a time ("indexpeyear"): this year first, alone, so a blocked or very slow site
 * shows its reason within 40 seconds; then the other years a few at a time. A year that fails is skipped (the line starts where the readings start).
 * One call per index at a time; a failure is remembered until Try again / Reload chart.
 */
export function stockIndexPe(name, years = 10) {
  const key = 'ipe:' + name, hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  if (ipeBusy.has(name)) return ipeBusy.get(name);
  if (ipeFailed.has(name)) return Promise.reject(new Error(ipeFailed.get(name)));
  const p = (async () => {
    if (!S.cfg || !S.cfg.backendUrl) throw new Error('Index P/E comes through your backend, which is not connected on this device.');
    const old = 'Your backend needs the newer Code.gs (it adds the “indexpeyear” action) to draw the index P/E. Paste backend/Code.gs into Apps Script and deploy a new version.';
    const ask = async (k, patience = 120000) => {
      // NSE's site can take minutes. Each try waits 40 s; the backend keeps working after we stop waiting and keeps its answer, so asking again a little later gets it.
      const t0 = Date.now(); let last = null;
      for (let n = 0; ; n++) {
        try {
          const res = await call(S.cfg.backendUrl, S.cfg.key, 'indexpeyear', { name, yearsAgo: k }, IPE_YEAR_WAIT);
          if (res && res.ok) return { rows: res.rows || [] };
          if (!(res && res.pending)) return { err: (res && res.error) || 'no answer', step: res && res.step, ms: res && res.ms };
          last = 'NSE is still answering the first request';
        } catch (e) {
          if (/Unknown action/i.test(e.message)) throw new Error(old);
          if (!/took too long/i.test(e.message)) return { err: e.message };
          last = 'no answer in ' + IPE_YEAR_WAIT / 1000 + ' seconds';
        }
        if (Date.now() - t0 > patience) return { err: last + ', and still nothing after ' + Math.round((Date.now() - t0) / 60000 * 10) / 10 + ' minutes of waiting', timeout: true };
        await new Promise((r) => setTimeout(r, 8000));
      }
    };
    const why = (r) => 'The NSE index site (niftyindices.com) gave no P/E readings: ' + r.err + (r.step ? ' (at the ' + r.step + (r.ms ? ', after ' + Math.round(r.ms / 1000) + ' s' : '') + ')' : '') + '. Press Try again later.';
    const first = await ask(0, 240000);
    if (first.err) throw new Error(why(first));
    const all = [...first.rows], failed = [];
    const todo = Array.from({ length: Math.max(0, years - 1) }, (_, i) => i + 1);
    const worker = async () => { for (let k = todo.shift(); k != null; k = todo.shift()) { const r = await ask(k); if (r.err) failed.push(k); else all.push(...r.rows); } };
    await Promise.all([worker(), worker(), worker()]);
    if (!all.length) throw new Error('The NSE index site returned no P/E readings for ' + name + '.');
    const seen = new Set(), out = all.filter((x) => !seen.has(x[0]) && seen.add(x[0])).sort((x, y) => (x[0] < y[0] ? -1 : 1)).map((x) => ({ d: x[0], pe: x[1] }));
    if (!failed.length) cache.set(key, out);   // a partial answer is shown but not kept, so the next load asks for the missing years again
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
