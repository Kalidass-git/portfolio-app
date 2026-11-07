// Summary figures for the Savings page. Pure functions, no DOM.
//   open holdings:  what was paid in, the interest earned so far, and what it is worth today
//   closed ones:    the actual result (what was paid in against what came back), overall and by kind
import { xirr } from './calc.js';
import { isInterestEntry } from './growth.js';

const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z');
const entryAmt = (e) => (e.employee || 0) + (e.employer || 0) + (e.amount || 0);
export const isPf = (s) => s.type === 'EPF' || s.type === 'PPF';

/** One open holding: paid in, interest so far (credited + accruing), worth today. `maturity` is the expected final amount (not for EPF / PPF). */
export function holdingNow(s, asOf, maturityOf) {
  if (isPf(s)) {
    const interestEntries = (s.entries || []).filter(isInterestEntry), credited = interestEntries.reduce((a, e) => a + entryAmt(e), 0);
    const dates = (interestEntries.length ? interestEntries : (s.entries || [])).map((e) => e.date).filter(Boolean).sort();
    const since = dates.length ? dates[dates.length - 1] : null;
    const days = since ? Math.min(365, Math.max(0, (ms(asOf) - ms(since)) / DAY)) : 0;
    const accruing = since ? Math.max(0, s.principal * (s.rate || 0) * days / 365) : 0;   // between credits the balance only accrues
    return { paid: s.principal - credited, credited, accruing, interest: credited + accruing, worth: s.principal + accruing, maturity: null, yearly: s.principal * (s.rate || 0) };
  }
  const rate = s.rate || 0;
  const interest = (s.entries || []).filter((e) => e.amount > 0 && e.date && e.date <= asOf).reduce((a, e) => a + e.amount * (Math.pow(1 + rate, (ms(asOf) - ms(e.date)) / DAY / 365) - 1), 0);
  return { paid: s.principal, credited: 0, accruing: interest, interest, worth: s.principal + interest, maturity: maturityOf ? maturityOf(s) : null, yearly: s.principal * rate };
}

/** Totals for a list of open holdings. */
export function openSummary(list, asOf, maturityOf) {
  const rows = list.map((s) => holdingNow(s, asOf, maturityOf));
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const withMat = rows.filter((r) => r.maturity != null);
  return { count: list.length, paid: sum('paid'), credited: sum('credited'), accruing: sum('accruing'), interest: sum('interest'), worth: sum('worth'), yearly: sum('yearly'), maturity: withMat.length === rows.length && rows.length ? sum('maturity') : null };
}

/** Actual result of the closed ones: overall and by kind. A kind's XIRR is worked out from all its payments and what came back. */
export function closedSummary(list) {
  const flowsOf = (s) => [...(s.entries || []).filter((e) => e.amount > 0 && e.date).map((e) => ({ t: ms(e.date), amount: -e.amount })), { t: ms(s.closed.date), amount: s.closed.amount }];
  const pack = (items) => {
    const paid = items.reduce((a, s) => a + s.principal, 0), got = items.reduce((a, s) => a + s.closed.amount, 0);
    let x = null; try { const v = xirr(items.flatMap(flowsOf)); x = Number.isFinite(v) ? v : null; } catch (e) { x = null; }
    return { count: items.length, paid, got, gain: got - paid, ret: paid ? (got - paid) / paid : null, xirr: x };
  };
  const kinds = [...new Set(list.map((s) => s.type || 'Other'))].sort();
  return { all: pack(list), byKind: kinds.map((k) => ({ kind: k, ...pack(list.filter((s) => (s.type || 'Other') === k)) })) };
}
