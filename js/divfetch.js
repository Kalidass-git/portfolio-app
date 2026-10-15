// Dividends found automatically. The backend reads each company's dividend history from Yahoo Finance (per share, by ex-date);
// this file works out how many shares you held on that day from your trades, splits and bonus issues.
import { S } from './store.js';
import { call } from './remote.js';
import { symKey } from './trades.js';

const r2 = (n) => Math.round(n * 100) / 100;
const DAYS = 86400000, ms = (d) => Date.parse(d + 'T00:00:00Z');

/** Shares held on `date` (before that day's trading), counted in today's shares so that they match Yahoo's split-adjusted dividends. */
export function qtyOn(data, sym, date) {
  const acts = (data.corporateActions || []).filter((a) => symKey(a.symbol) === sym);
  // a trade's quantity is in the shares of its own day; every later split or bonus issue multiplies it
  const factor = (from) => acts.reduce((f, a) => (a.date <= from ? f : a.type === 'split' && a.ratio > 0 ? f * a.ratio : a.type === 'bonus' && a.den > 0 ? f * (1 + a.num / a.den) : f), 1);
  let q = 0;
  for (const t of data.trades || []) {
    if (symKey(t.symbol) !== sym || t.date >= date) continue;
    q += (t.type === 'SELL' ? -t.qty : t.qty) * factor(t.date);
  }
  return q;
}
/** Symbols you ever bought, with the date of the first buy and a readable name. */
function symbols(data) {
  const m = new Map();
  for (const t of data.trades || []) {
    if (t.type !== 'BUY' || !t.date) continue;
    const k = symKey(t.symbol), r = m.get(k);
    if (!r || t.date < r.first) m.set(k, { symbol: k, name: t.name || (r && r.name) || k, first: t.date });
  }
  for (const s of data.stocks || []) { const r = m.get(symKey(s.symbol)); if (r) { r.name = s.name || r.name; r.yahoo = s.yahoo || ''; } }
  return [...m.values()];
}

/**
 * Looks up dividends and returns the ones that are not in your list yet:
 * { found: [{symbol,name,date,amount,dps,qty}], checked, errors, existing }
 */
export async function findDividends(onProgress = () => {}) {
  const { data, cfg } = S;
  if (!S.remote) throw new Error('Dividend look-up needs the Google Drive backend (Settings).');
  if (!(data.trades || []).length) throw new Error('Dividends are worked out from your buy history. Import your Groww history first (Shares & funds → Import).');
  const syms = symbols(data);
  onProgress('Looking up dividends…');
  let res;
  try { res = await call(cfg.backendUrl, cfg.key, 'dividends', { symbols: syms.map((s) => ({ symbol: s.symbol, yahoo: s.yahoo || '' })) }); }
  catch (e) { if (/Unknown action/i.test(e.message)) throw new Error('Your Google Drive backend needs a small update first. Paste the new backend/Code.gs into Apps Script and deploy a new version (see docs/SETUP.md, release 8.3).'); throw e; }
  const have = (data.corporateActions || []).filter((a) => a.type === 'dividend');
  const found = [];
  for (const s of syms) {
    for (const d of (res.dividends && res.dividends[s.symbol]) || []) {
      if (d.date < s.first) continue;
      const qty = qtyOn(data, s.symbol, d.date);
      if (!(qty > 0.0001)) continue;
      const amount = r2(qty * d.amount);
      if (amount <= 0) continue;
      // already recorded (by hand or earlier): same company, within two months of the ex-date
      const dup = have.some((a) => symKey(a.symbol) === s.symbol && Math.abs(ms(a.date) - ms(d.date)) <= 60 * DAYS);
      if (dup) continue;
      found.push({ symbol: s.symbol, name: s.name, date: d.date, amount, dps: d.amount, qty: Math.round(qty * 1000) / 1000 });
    }
  }
  found.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { found, checked: syms.length, errors: res.errors || {}, existing: have.length };
}
