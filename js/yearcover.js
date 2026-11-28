// The year against your interest income, and the yearly pools (pure logic, no DOM, nothing stored).
// A yearly pool is an expense with a yearly budget and no monthly one (for example lifestyle and household, ₹50,000 a year).
// It is spent any time in the year, so it is judged against the whole year and never spread over twelve months.
import * as C from './calc.js';
import { categoryList, kindOf, poolNames } from './categories.js';

const lc = (s) => (s || '').trim().toLowerCase();
const r0 = (n) => Math.round(n);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const ASSUMED = { fdRate: 0.07, savingsRate: 0.03, bufferMonths: 3, idleMin: 25000, maturingDays: 120, rateGap: 0.01 };

/** Yearly pools with what is spent so far this year: [{ name, budget, spent, left, used }], most used first. */
export function pools(data, asOf) {
  const year = asOf.slice(0, 4), names = poolNames(data), kind = kindOf(data), spent = new Map();
  for (const e of data.ledger || []) if (e.debit > 0 && e.date && e.date.slice(0, 4) === year && names.has(lc(e.category)) && kind(e.category) === 'expense') spent.set(lc(e.category), (spent.get(lc(e.category)) || 0) + e.debit);
  return categoryList(data).filter((c) => names.has(lc(c.name))).map((c) => { const s = spent.get(lc(c.name)) || 0; return { name: c.name, budget: c.yearlyBudget, spent: s, left: c.yearlyBudget - s, used: s / c.yearlyBudget }; }).sort((a, b) => b.used - a.used);
}

/**
 * This year: the interest income against what you spend, and the shortfall.
 *  interest  = received so far + still to come this year (what the app expects each month: bonds, lending, other fixed income)
 *  spending  = spent so far + the usual regular month for each month left + what is still unspent in the yearly pools
 *  usual regular month = the middle value of up to six finished months, without pool spending
 * Returns { year, interestSoFar, interestToCome, interest, spentSoFar, regularLeft, poolLeft, spending, gap, covered, usual, monthsLeft, rate, extraCapital, extraPerMonth }; gap > 0 is a shortfall.
 */
export function yearOutlook(data, all) {
  const cur = C.monthKey(all.asOf), year = cur.slice(0, 4), months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  let interestSoFar = 0, interestToCome = 0, spentSoFar = 0; const regular = []; let curRegular = 0;
  const byMonth = [], bySource = new Map(), byCat = new Map();   // detail behind the bars, for the tap-through sheet
  for (const m of months) {
    const mc = C.monthCashflow(data, all, m);
    byMonth.push({ month: m, expected: r0(mc.totalExpected), received: r0(m <= cur ? mc.totalReceived : 0), toCome: r0(m < cur ? 0 : m === cur ? Math.max(0, mc.totalExpected - mc.totalReceived) : mc.totalExpected), spent: r0(m <= cur ? mc.totalSpent : 0) });
    for (const x of mc.income) { const g = bySource.get(x.name) || { name: x.name, received: 0, toCome: 0 }; if (m <= cur) g.received += x.received; if (m === cur) g.toCome += Math.max(0, x.expected - x.received); else if (m > cur) g.toCome += x.expected; bySource.set(x.name, g); }
    if (m <= cur) for (const l of mc.spend) if (l.amount > 0) byCat.set(l.name, (byCat.get(l.name) || 0) + l.amount);
    if (m <= cur) { interestSoFar += mc.totalReceived; spentSoFar += mc.totalSpent; }
    if (m === cur) { interestToCome += Math.max(0, mc.totalExpected - mc.totalReceived); curRegular = mc.totalSpent - mc.poolSpent; }
    else if (m > cur) interestToCome += mc.totalExpected;
    else if (mc.totalSpent > 0) regular.push(mc.totalSpent - mc.poolSpent);
  }
  const usual = regular.length >= 2 ? median(regular.slice(-6)) : curRegular;
  const monthsLeft = 12 - Number(cur.slice(5, 7));
  const regularLeft = monthsLeft * usual + Math.max(0, usual - curRegular);
  const poolLeft = pools(data, all.asOf).reduce((a, p) => a + Math.max(0, p.left), 0);
  const interest = interestSoFar + interestToCome, spending = spentSoFar + regularLeft + poolLeft, gap = spending - interest;
  const cap = all.cfTotal && all.cfTotal.capital > 0 ? all.cfTotal.capital : 0, rate = cap ? Math.min(0.12, Math.max(0.05, (all.cfTotal.perDay * 365) / cap)) : ASSUMED.fdRate;
  return { year, interestSoFar: r0(interestSoFar), interestToCome: r0(interestToCome), interest: r0(interest), spentSoFar: r0(spentSoFar), regularLeft: r0(regularLeft), poolLeft: r0(poolLeft), spending: r0(spending), gap: r0(gap),
    covered: spending > 0 ? interest / spending : 1, usual: r0(usual), monthsLeft, rate, extraCapital: gap > 0 ? r0(gap / rate) : 0, extraPerMonth: gap > 0 ? r0(gap / Math.max(1, monthsLeft + 1)) : 0, hasHistory: regular.length >= 2, byMonth, bySource: [...bySource.values()].map((g) => ({ ...g, received: r0(g.received), toCome: r0(g.toCome) })).filter((g) => g.received > 0 || g.toCome > 0).sort((a, b) => b.received + b.toCome - a.received - a.toCome), byCat: [...byCat].map(([name, amount]) => ({ name, amount: r0(amount) })).sort((a, b) => b.amount - a.amount), pools: pools(data, all.asOf), curRegular: r0(curRegular) };
}

/** Ways to earn more interest from what you already hold. Each: { id, title, text, gain? (a year) }. Only things that are true of your own data. */
export function interestIdeas(data, all, o = yearOutlook(data, all)) {
  const out = [], A = ASSUMED;
  const buffer = o.usual * A.bufferMonths, idle = all.cashTotal - buffer;
  const rate = Math.max(A.fdRate, all.cfTotal && all.cfTotal.capital > 0 ? o.rate : 0);
  if (idle >= A.idleMin) {
    const put = Math.floor(idle / 5000) * 5000, gain = put * (rate - A.savingsRate);
    out.push({ id: 'idle', title: 'Idle cash in bank accounts', gain: r0(gain), short: `Move ₹${grp(put)} of idle cash to a deposit: about +₹${grp(gain)} a year`,
      text: `Your bank accounts hold ₹${grp(all.cashTotal)}, about ${(all.cashTotal / Math.max(1, o.usual)).toFixed(1)} months of spending. Keeping ${A.bufferMonths} months (₹${grp(buffer)}) is enough; ₹${grp(put)} in a deposit at about ${pc(rate)} instead of a savings account (about ${pc(A.savingsRate)}) would add about ₹${grp(gain)} a year.` });
  }
  const today = all.asOf, until = new Date(Date.parse(today) + A.maturingDays * 864e5).toISOString().slice(0, 10);
  const fixed = [...all.bonds.map((b) => ({ ...b, kind: 'Bond' })), ...all.fds.map((f) => ({ ...f, kind: 'Deposit' }))].filter((x) => x.maturityDate && x.principal > 0 && x.rate > 0);
  const soon = fixed.filter((x) => x.maturityDate >= today && x.maturityDate <= until).sort((a, b) => (a.maturityDate < b.maturityDate ? -1 : 1));
  if (soon.length) out.push({ id: 'maturing', title: 'Maturing soon: plan the reinvestment', short: `${soon.length} ${soon.length === 1 ? 'holding matures' : 'holdings mature'} within ${A.maturingDays} days: plan the reinvestment`, text: `${soon.slice(0, 3).map((x) => `${x.name} (₹${grp(x.principal)}, ${pc(x.rate)}, ${x.maturityDate})`).join('; ')}${soon.length > 3 ? ` and ${soon.length - 3} more` : ''}. Money that waits after maturity earns savings-account interest only.` });
  const best = fixed.reduce((m, x) => Math.max(m, x.rate), 0), low = fixed.filter((x) => x.rate <= best - A.rateGap && x.maturityDate > today).sort((a, b) => (b.principal * (best - b.rate)) - (a.principal * (best - a.rate)));
  if (best > 0 && low.length) {
    const x = low[0], gain = x.principal * (best - x.rate);
    out.push({ id: 'lowyield', title: 'Lowest-paying holding', gain: r0(gain), short: `${x.name} pays ${pc(x.rate)}, your best ${pc(best)}: about +₹${grp(gain)} a year at maturity`, text: `${x.name} pays ${pc(x.rate)} on ₹${grp(x.principal)}, while your best pays ${pc(best)}. When it matures (${x.maturityDate}), a similar rate would add about ₹${grp(gain)} a year. Check the safety of the issuer first: a higher rate usually means more risk.` });
  }
  if (o.gap > 0) out.push({ id: 'gap', title: 'To close the gap', short: `Close the gap: ₹${grp(o.extraCapital)} more in interest holdings, or ₹${grp(o.extraPerMonth)} less spending a month`, text: `A shortfall of ₹${grp(o.gap)} needs about ₹${grp(o.extraCapital)} more in interest-paying holdings at about ${pc(o.rate)}, or about ₹${grp(o.extraPerMonth)} a month less spending for the rest of the year.` });
  return out;
}
const grp = (n) => Math.round(n).toLocaleString('en-IN');
const pc = (v) => Math.round(v * 1000) / 10 + '%';
