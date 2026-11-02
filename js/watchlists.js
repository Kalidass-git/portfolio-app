// Your own watchlists of shares (like the lists a trading app keeps), stored in the data file as data.watchlists:
//   [{ id, name, items: [{ symbol, name, yahoo? }] }]      (optional field: files without it simply have no lists)
// Live prices for them are asked for only when the person taps Refresh on the Watchlists page. They are kept on this device (never in the data file)
// and are not touched by the app's main refresh.
import { S } from './store.js';
import { call } from './remote.js';

const KEY = 'fw.wl.quotes';
let Q = {};
try { Q = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { Q = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Q)); } catch { /* private window */ } };

export const lists = (data) => (data && data.watchlists) || [];
export const norm = (s) => String(s || '').toUpperCase().trim().replace(/\.(NS|BO)$/, '');
const nextId = (arr, p) => p + (Math.max(0, ...arr.map((x) => Number(String(x.id || '').replace(/\D/g, '')) || 0)) + 1);

/** Every symbol on any list, once each: [{ symbol, yahoo }]. */
export function allSymbols(data) {
  const seen = new Map();
  for (const l of lists(data)) for (const it of l.items || []) { const k = norm(it.symbol); if (k && !seen.has(k)) seen.set(k, { symbol: k, yahoo: it.yahoo || '' }); }
  return [...seen.values()];
}
/** Which lists a symbol is on. */
export const listsOf = (data, symbol) => lists(data).filter((l) => (l.items || []).some((it) => norm(it.symbol) === norm(symbol)));

// ---- changes (call inside mutate) ----
export function addList(d, name) { d.watchlists = d.watchlists || []; const l = { id: nextId(d.watchlists, 'wl'), name: String(name || '').trim() || 'My watchlist', items: [] }; d.watchlists.push(l); return l; }
export function renameList(d, id, name) { const l = lists(d).find((x) => x.id === id); if (l && String(name || '').trim()) l.name = String(name).trim(); }
export function removeList(d, id) { d.watchlists = lists(d).filter((x) => x.id !== id); }
/** Adds a share to a list (once). Returns false when it was already there. */
export function addItem(d, id, { symbol, name = '', yahoo = '' }) {
  const l = lists(d).find((x) => x.id === id), sym = norm(symbol); if (!l || !sym) return false;
  l.items = l.items || [];
  if (l.items.some((it) => norm(it.symbol) === sym)) return false;
  l.items.push({ symbol: sym, name: String(name || '').trim() || sym, ...(yahoo ? { yahoo } : {}) });
  return true;
}
export function removeItem(d, id, symbol) { const l = lists(d).find((x) => x.id === id); if (l) l.items = (l.items || []).filter((it) => norm(it.symbol) !== norm(symbol)); }

// ---- live prices (this device only) ----
export const quotes = () => Q;
export const quoteOf = (symbol) => Q[norm(symbol)] || null;
export const refreshedAt = () => Object.values(Q).reduce((m, q) => Math.max(m, q.at ? Date.parse(q.at) : 0), 0);
/** Asks the backend for the price of every share on any list. Does nothing else; the main refresh never calls this. */
export async function refreshQuotes(data = S.data) {
  const syms = allSymbols(data), out = { n: 0, errors: [] };
  if (!syms.length) return out;
  if (!S.remote) { out.errors.push('Share prices need the Google Drive backend (Settings).'); return out; }
  const at = new Date().toISOString();
  try {
    const res = await call(S.cfg.backendUrl, S.cfg.key, 'quotes', { symbols: syms });
    for (const [sym, q] of Object.entries(res.quotes || {})) {
      if (!(q && q.price > 0)) continue;
      const prev = q.prevClose > 0 ? q.prevClose : null;
      Q[norm(sym)] = { price: q.price, prev, change: prev ? q.price - prev : null, dayPct: prev ? q.price / prev - 1 : null, hi52: q.high52 || null, lo52: q.low52 || null, at };
      out.n++;
    }
    for (const [sym, msg] of Object.entries(res.errors || {})) out.errors.push(`${sym}: ${msg}`);
    save();
  } catch (e) { out.errors.push(e.message); }
  return out;
}
