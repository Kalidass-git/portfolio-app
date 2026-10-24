// Growth of a real month, asset class by asset class. Pure functions, no DOM.
//
// A real month is one that has a month-end snapshot (or today's position). Its net worth change is
//   closing assets − opening assets = what was saved in the bank + EPF put in + GROWTH      (growth is whatever is left)
// and the growth is then explained class by class with a rule that fits the class, so that nothing is counted twice:
//   cash in banks           interest credited in the bank entries is already income; only when none is recorded, opening × rate ÷ 12 is used
//   bonds, private lending  nothing: the interest received is income (bank entries), not growth
//   EPF and PPF             interest credited in that month (the passbook entry, in March); between credits it only accrues, shown as a memo, not counted
//   FDs, chits, RDs, others opening × rate ÷ 12 (they compound)
//   shares, ETFs, funds, gold   closing value − opening value − money put in + money taken out (needs real values at both ends, else the outlook rate)
// Dividends are income. Whatever the rules do not explain is shown as "other changes" so the total always adds up.
import * as P from './projector.js';
import { monthLedger } from './calc.js';
import { isInterestCategory } from './insights.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const r0 = (n) => Math.round(n);
export const isInterestEntry = (e) => /interest/i.test((e.kind || '') + ' ' + (e.remarks || ''));
const mk = (d) => (d || '').slice(0, 7);

/** The months after `from` up to and including `to` (just `to` when there is no earlier position, or it is more than a year back). */
export function spanOf(from, to) {
  if (!from || from >= to) return [to];
  const out = []; let [y, m] = from.split('-').map(Number);
  for (let i = 0; i < 12; i++) { if (++m > 12) { m = 1; y++; } const k = `${y}-${String(m).padStart(2, '0')}`; out.push(k); if (k >= to) break; }
  return out[out.length - 1] === to ? out : [to];
}

/** Money movements that decide how growth is read, summed over some months. */
export function flowsOf(data, months, { by = {}, sells = {}, divs = [] } = {}) {
  const f = { epfIn: 0, ppfIn: 0, pfInterest: 0, bankInterest: 0, divLedger: 0, divTrades: 0, putIn: {}, taken: {} };
  for (const mo of months) {
    for (const sv of data.savings || []) {
      if (sv.type !== 'EPF' && sv.type !== 'PPF') continue;
      for (const e of sv.entries || []) {
        if (mk(e.date) !== mo) continue;
        const a = (e.employee || 0) + (e.employer || 0) + (e.amount || 0);
        if (isInterestEntry(e)) f.pfInterest += a; else if (sv.type === 'EPF') f.epfIn += a; else f.ppfIn += a;
      }
    }
    for (const e of monthLedger(data, mo)) {
      if (!(e.credit > 0)) continue;
      const c = e.category || '';
      if (/dividend/i.test(c)) f.divLedger += e.credit;
      else if (/interest/i.test(c) && !isInterestCategory(c)) f.bankInterest += e.credit;
    }
    f.divTrades += sum(divs.filter((d) => mk(d.date) === mo), (d) => d.amount);
    const inv = by[mo] || {}, sl = sells[mo] || {};
    for (const k of P.MARKET) { f.putIn[k] = (f.putIn[k] || 0) + (inv[k] ? inv[k].amount : 0); f.taken[k] = (f.taken[k] || 0) + (sl[k] || 0); }
  }
  f.divExtra = Math.max(0, f.divTrades - f.divLedger);   // dividends in your trade records that no bank entry shows
  f.dividends = f.divLedger + f.divExtra;
  return f;
}

/**
 * Explain the growth of a real period.
 *  open, close   { class: ₹ } at the start and the end.    openReal, closeReal: those values were recorded (a snapshot with classes, or today), not worked out.
 *  total         the growth to explain (closing assets − opening assets − saved − EPF put in).
 *  rate(k)       yearly rate of a class (plan rate; the outlook rate for market classes).
 */
export function explainGrowth({ months, open, close, openReal, closeReal, total, flows, rate }) {
  const n = months.length, grow = (r) => Math.pow(1 + r, n / 12) - 1;
  const items = [], memo = [];
  for (const c of P.CLASSES) {
    const o = open[c.key] || 0, cl = close[c.key] || 0;
    if (!(Math.abs(o) + Math.abs(cl) > 1)) continue;
    const r = rate(c.key), by = (extra) => ({ key: c.key, label: c.label, base: r0(o), close: r0(cl), rate: r, ...extra });
    if (c.kind === 'payout') continue;
    if (c.kind === 'cash') {
      if (flows.bankInterest > 0.5) memo.push(by({ amount: r0(flows.bankInterest), how: 'counted', note: 'Interest credited by the bank is already in your income, so it is not counted again here.' }));
      else items.push(by({ amount: r0(o * grow(r)), how: 'rate', note: 'No bank interest is recorded for this period, so opening × rate ÷ 12 is used.' }));
      continue;
    }
    if (c.key === 'pf') {
      if (flows.pfInterest > 0.5) items.push(by({ amount: r0(flows.pfInterest), how: 'credited', note: 'Interest credited to EPF and PPF in this period (your passbook entries).' }));
      else if (o > 1) memo.push(by({ amount: r0(o * grow(r)), how: 'memo', note: 'Interest building up. It is added to the balance when the passbook credits it (March), so it is not counted yet and will not be counted twice.' }));
      continue;
    }
    if (c.kind === 'market') {
      const put = flows.putIn[c.key] || 0, took = flows.taken[c.key] || 0;
      if (openReal && closeReal) items.push(by({ amount: r0(cl - o - put + took), how: 'market', flow: r0(put - took), put: r0(put), took: r0(took) }));
      else items.push(by({ amount: r0(o * grow(r)), how: 'rate', estimated: true, note: 'The value at the start or the end of this period is not recorded in a snapshot, so the outlook rate is used until one is.' }));
      continue;
    }
    items.push(by({ amount: r0(o * grow(r)), how: 'rate' }));   // FDs, chits, RDs, others compound
  }
  const counted = sum(items, (x) => x.amount);
  return { items, memo, other: r0(total - counted), total: r0(total), months: n };
}
