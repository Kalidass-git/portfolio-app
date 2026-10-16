// What was really invested, by asset class and month. Pure functions, no DOM.
//
// Sources (the most specific record wins; bank entries only fill months where no asset record exists):
//   shares, ETFs, funds   dated buy trades and fund purchases (buys.js)
//   bonds, FDs, lending   the deposit date and amount of each one (closed ones included)
//   gold                  gold purchases
//   chits, EPF/PPF, RD    the dated entries of each saving
//   everything else       bank entries whose category is an investment (Investment Chit, Investment Gold, ...)
import { monthlyBuys } from './buys.js';
import { kindOf } from './categories.js';

const mk = (d) => (d || '').slice(0, 7);
const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);

/** Bank category name -> asset class. */
export function ledgerClass(category) {
  const n = String(category || '').toLowerCase();
  if (/chit/.test(n)) return 'chits';
  if (/gold/.test(n)) return 'gold';
  if (/lend/.test(n)) return 'lending';
  if (/bond/.test(n)) return 'bonds';
  if (/equity|stock|share/.test(n)) return 'shares';
  if (/etf/.test(n)) return 'etfs';
  if (/\bmf\b|mutual|fund|sip/.test(n)) return 'funds';
  if (/\bfd\b|deposit/.test(n)) return 'fds';
  if (/ppf|epf|provident/.test(n)) return 'pf';
  if (/saving|lic|\brd\b|insurance/.test(n)) return 'lic';
  return null;
}

/**
 * { 'YYYY-MM': { [class]: ₹ } } plus per-class source labels.
 * Money moved between your own accounts and EMI payments are not investments and are left out.
 */
export function investedByMonth(data) {
  const out = {};
  const add = (m, cls, amt, src) => { if (!m || !cls || !(amt > 0)) return; const o = (out[m] = out[m] || {}); o[cls] = o[cls] || { amount: 0, src: new Set() }; o[cls].amount += amt; o[cls].src.add(src); };
  const have = new Set(); // 'month|class' that an asset record already covers
  const put = (m, cls, amt, src) => { if (amt > 0) { add(m, cls, amt, src); have.add(m + '|' + cls); } };

  const buys = monthlyBuys(data);
  for (const [m, b] of Object.entries(buys)) { put(m, 'shares', b.shares, 'trades'); put(m, 'etfs', b.etfs, 'trades'); put(m, 'funds', b.funds, 'fund purchases'); }
  for (const b of data.bonds || []) put(mk(b.depositDate), 'bonds', b.principal, 'bond records');
  for (const f of data.fds || []) put(mk(f.depositDate), 'fds', f.principal, 'deposit records');
  for (const l of data.lending || []) put(mk(l.depositDate), l.interestType === 'Payout' ? 'lending' : 'fds', l.principal, 'lending records');
  for (const g of (data.gold && data.gold.purchases) || []) put(mk(g.date), 'gold', g.amount, 'gold purchases');
  for (const s of data.savings || []) {
    const cls = s.type === 'Chit' ? 'chits' : s.type === 'EPF' || s.type === 'PPF' ? 'pf' : 'lic';
    for (const e of s.entries || []) put(mk(e.date), cls, (e.amount || 0) + (e.employee || 0) + (e.employer || 0), 'savings entries');
  }
  // the bank fills any month and class that no asset record covers
  const kind = kindOf(data);
  for (const e of data.ledger || []) {
    if (kind(e.category) !== 'investment' || !(e.debit > 0)) continue;
    const cls = ledgerClass(e.category), m = mk(e.date);
    if (!cls || have.has(m + '|' + cls)) continue;
    add(m, cls, e.debit, 'bank entries');
  }
  return out;
}

/** Flatten to plain numbers: amount of a class in a month. */
export const actualOf = (by, month, cls) => (by[month] && by[month][cls] ? by[month][cls].amount : 0);
export const monthTotal = (by, month) => Object.values(by[month] || {}).reduce((s, x) => s + x.amount, 0);
/** Months of a calendar year that have any record. */
export const yearMonths = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
export const yearTotal = (by, year, cls) => yearMonths(year).reduce((s, m) => s + (cls ? actualOf(by, m, cls) : monthTotal(by, m)), 0);
/** Years that have at least one record. */
export const yearsWithData = (by) => [...new Set(Object.keys(by).map((m) => m.slice(0, 4)))].sort();
/** Which sources fed a class over a set of months. */
export const sourcesOf = (by, months, cls) => [...new Set(months.flatMap((m) => (by[m] && by[m][cls] ? [...by[m][cls].src] : [])))];
