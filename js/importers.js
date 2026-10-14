// Reads Groww order-history and mutual-fund statements and merges them into the data. No DOM.
import { fundKey, BUY_TYPES, SELL_TYPES } from './trades.js';

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n) => String(n).padStart(2, '0');
const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
export const toNum = (v) => { if (typeof v === 'number') return v; if (v == null) return NaN; const n = Number(String(v).replace(/[,₹\s]/g, '')); return n; };

/** Returns { date: 'YYYY-MM-DD', time: 'HH:MM' | '' } or null. Handles 17-12-2021 02:48 PM, 30 Sep 2026, 2026-09-30 and Excel serial numbers. */
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const ms = Math.round((v - 25569) * 86400000); const d = new Date(ms); return { date: d.toISOString().slice(0, 10), time: v % 1 ? d.toISOString().slice(11, 16) : '' }; }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T,]+(\d{1,2}):(\d\d)(?::\d\d)?\s*([AP]M)?)?$/i);
  if (m) return { date: `${m[3]}-${p2(m[2])}-${p2(m[1])}`, time: m[4] ? hhmm(m[4], m[5], m[6]) : '' };
  m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d))?/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : '' };
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]+(\d{4})(?:\s+(\d{1,2}):(\d\d)\s*([AP]M)?)?$/);
  if (m && MON[m[2].toLowerCase()]) return { date: `${m[3]}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}`, time: m[4] ? hhmm(m[4], m[5], m[6]) : '' };
  return null;
}
function hhmm(h, mi, ap) { let H = Number(h); if (ap) { const pm = /p/i.test(ap); if (pm && H < 12) H += 12; if (!pm && H === 12) H = 0; } return `${p2(H)}:${mi}`; }

function findHeader(rows, mustHave) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const cells = (rows[i] || []).map(lc);
    if (mustHave.every((k) => cells.includes(k))) return { index: i, cols: Object.fromEntries(cells.map((c, j) => [c, j])) };
  }
  return null;
}

/** Groww "Order history for stocks" file. */
export function parseGrowwStocks(rows) {
  const hd = findHeader(rows, ['stock name', 'quantity', 'value']);
  if (!hd) throw new Error('This does not look like the Groww stocks order history. I could not find the “Stock name / Quantity / Value” header row.');
  const c = hd.cols, col = (name) => c[name];
  const trades = [], skipped = [];
  for (let i = hd.index + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.some((x) => x != null && x !== '')) continue;
    const name = r[col('stock name')], symbol = r[col('symbol')], type = String(r[col('type')] || '').toUpperCase().trim();
    const status = lc(r[col('order status')]);
    const dt = parseDate(r[col('execution date and time')]);
    const qty = toNum(r[col('quantity')]), amount = toNum(r[col('value')]);
    const label = `${name || r[col('isin')] || 'row ' + (i + 1)}`;
    const sym = symbol == null ? '' : String(symbol).trim();
    if (status && status !== 'executed') { skipped.push({ row: i + 1, label, reason: `order status is “${r[col('order status')]}”, not executed` }); continue; }
    if (type !== 'BUY' && type !== 'SELL') { skipped.push({ row: i + 1, label, reason: `unknown type “${type}”` }); continue; }
    if (!sym || /^\d+(\.0+)?$/.test(sym)) { skipped.push({ row: i + 1, label, reason: 'no share symbol. This is usually a bond or debenture, which belongs under Fixed income' }); continue; }
    if (!dt || !(qty > 0) || isNaN(amount)) { skipped.push({ row: i + 1, label, reason: 'date, quantity or value is missing' }); continue; }
    trades.push({ symbol: sym.toUpperCase(), name: String(name || sym).trim(), isin: r[col('isin')] || '', type, qty, amount, date: dt.date, time: dt.time, exch: r[col('exchange')] || '', orderId: r[col('exchange order id')] == null ? '' : String(r[col('exchange order id')]).trim(), src: 'groww' });
  }
  return { trades, skipped, from: trades.map((t) => t.date).sort()[0], to: trades.map((t) => t.date).sort().pop() };
}

/** Groww mutual fund transactions statement. */
export function parseGrowwMF(rows) {
  const hd = findHeader(rows, ['scheme name', 'transaction type', 'units']);
  if (!hd) throw new Error('This does not look like the Groww mutual fund statement. I could not find the “Scheme Name / Transaction Type / Units” header row.');
  const c = hd.cols, txns = [], skipped = [];
  for (let i = hd.index + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.some((x) => x != null && x !== '')) continue;
    const scheme = String(r[c['scheme name']] || '').trim(), type = String(r[c['transaction type']] || '').trim().toUpperCase();
    const units = toNum(r[c['units']]), nav = toNum(r[c['nav']]), amount = toNum(r[c['amount']]), dt = parseDate(r[c['date']]);
    if (!scheme || !dt || isNaN(units) || isNaN(amount)) { skipped.push({ row: i + 1, label: scheme || 'row ' + (i + 1), reason: 'scheme, date, units or amount is missing' }); continue; }
    if (!BUY_TYPES.test(type) && !SELL_TYPES.test(type)) { skipped.push({ row: i + 1, label: scheme, reason: `transaction type “${type}” is not a purchase or redemption` }); continue; }
    txns.push({ scheme, type, units: Math.abs(units), nav: isNaN(nav) ? (units ? amount / units : 0) : nav, amount: Math.abs(amount), date: dt.date, src: 'groww' });
  }
  return { txns, skipped, from: txns.map((t) => t.date).sort()[0], to: txns.map((t) => t.date).sort().pop() };
}

// ---------- duplicates and merging ----------
const r2 = (n) => Math.round(n * 100) / 100;
export const stockKey = (t) => (t.orderId ? 'o:' + t.orderId : `c:${t.symbol}|${t.date}|${t.time}|${t.type}|${t.qty}|${r2(t.amount)}`);
export const mfKey = (t) => `${fundKey(t.scheme)}|${t.date}|${/^(PURCHASE|SIP|BUY|NFO)/i.test(t.type) || BUY_TYPES.test(t.type) ? 'B' : 'S'}|${r2(t.units * 1000) / 1000}|${r2(t.amount)}`;
/** Same key twice in one list (two identical purchases the same day) gets #2, #3… so both are kept. */
function keyed(list, keyFn) { const seen = new Map(); return list.map((t) => { const k = keyFn(t); const n = (seen.get(k) || 0) + 1; seen.set(k, n); return n > 1 ? `${k}#${n}` : k; }); }

/**
 * mode 'replace': the file becomes the whole list.   mode 'add': new rows are appended; rows already present are duplicates.
 * overwrite (add mode): duplicates are replaced by the file's version instead of being left alone.
 * Returns { list, added, duplicates, replaced, removed } where `duplicates` are the incoming rows that matched.
 */
export function mergeList(existing, incoming, keyFn, { mode = 'add', overwrite = false } = {}) {
  let maxId = Math.max(0, ...existing.map((t) => Number(t.id) || 0));
  const withId = (t) => ({ ...t, id: ++maxId });
  if (mode === 'replace') {
    maxId = 0;
    return { list: incoming.map(withId), added: incoming.length, duplicates: [], replaced: 0, removed: existing.length };
  }
  const exKeys = keyed(existing, keyFn), inKeys = keyed(incoming, keyFn);
  const pos = new Map(exKeys.map((k, i) => [k, i]));
  const list = existing.slice(), duplicates = [];
  let added = 0, replaced = 0;
  incoming.forEach((t, i) => {
    const at = pos.get(inKeys[i]);
    if (at == null) { list.push(withId(t)); added++; return; }
    duplicates.push(t);
    if (overwrite) { list[at] = { ...t, id: existing[at].id }; replaced++; }
  });
  return { list, added, duplicates, replaced, removed: 0 };
}
/** Preview without changing anything. */
export function previewMerge(existing, incoming, keyFn, mode) {
  const r = mergeList(existing, incoming, keyFn, { mode });
  return { added: r.added, duplicates: r.duplicates.length, removed: r.removed };
}
