// Price history for one share or fund.
//  - Mutual funds: every NAV since launch from mfapi.in (free, allows browser requests).
//  - Shares and ETFs: daily closes asked from the backend (Apps Script, reads Yahoo Finance). Needs the backend with the "history" action.
import { S } from './store.js';
import { call } from './remote.js';

const cache = new Map();
const iso = (s) => { const [d, m, y] = s.split('-'); return `${y}-${m}-${d}`; };

/** [{d:'2024-05-31', v:123.4}] oldest first. */
export async function fundNavs(code) {
  const key = 'mf:' + code;
  if (cache.has(key)) return cache.get(key);
  const r = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`);
  if (!r.ok) throw new Error('Could not load the NAV history.');
  const body = await r.json();
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
