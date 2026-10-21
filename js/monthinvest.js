// This month's investing: what can still be invested, split by the plan, and what the bank can pay for now. Pure functions, no DOM.
//
// Money in the month = the higher of what has arrived so far and what the plan expects.
// Money out the month  = the higher of what has gone out so far and what the plan expects (expenses, EMI, tax and yearly bills).
// Whatever is left is the amount to invest this month. It is split by the shares of the plan lines. What the bank entries and asset
// records already show as invested this month is taken off each line. The bank can pay for the rest only after it keeps back the
// spending still expected before month end.
import { monthActual } from './yearplan.js';
import { investedByMonth, actualOf } from './actuals.js';
import { simulate, classOf, effectiveA, defaults, cfg, baseline } from './projector.js';
import { monthKey, addMonths } from './calc.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);

/**
 * The arithmetic, with plain numbers.
 * in: { actualIn, planIn, actualOut, planOut, bank, lines:[{id,name,cls,monthly}], doneByClass:{cls:₹} }
 */
export function splitMonth({ actualIn, planIn, actualOut, planOut, bank, lines, doneByClass }) {
  const income = Math.max(actualIn, planIn), spend = Math.max(actualOut, planOut);
  const moreSpend = Math.max(0, spend - actualOut);           // still expected before month end
  const investable = Math.max(0, income - spend);
  const weight = sum(lines, (l) => Math.max(0, l.monthly));
  // what each class already received is shared among its lines by their weights
  const classW = {}; for (const l of lines) classW[l.cls] = (classW[l.cls] || 0) + Math.max(0, l.monthly);
  const rows = lines.map((l) => {
    const share = weight > 0 ? Math.max(0, l.monthly) / weight : 0;
    const target = investable * share;
    const done = classW[l.cls] > 0 ? (doneByClass[l.cls] || 0) * Math.max(0, l.monthly) / classW[l.cls] : 0;
    return { ...l, share, target, done, left: Math.max(0, target - done), over: Math.max(0, done - target) };
  });
  // money that went into classes the plan has no line for
  const unplanned = Object.entries(doneByClass).filter(([c, v]) => v > 0 && !classW[c]).map(([cls, done]) => ({ cls, done }));
  const done = sum(Object.values(doneByClass));
  const stillToInvest = sum(rows, (r) => r.left);
  const bankFree = Math.max(0, bank - moreSpend);
  const investNow = Math.min(stillToInvest, bankFree);
  return { income, spend, moreSpend, investable, rows, unplanned, done, stillToInvest, bank, bankFree, investNow, notEnough: investNow < stillToInvest - 0.5, actualIn, planIn, actualOut, planOut };
}

/** Everything for the current month, from the data. `a` are the assumptions both Wealth outlook tabs use. */
export function monthInvest(data, all, outlooks) {
  const cur = monthKey(all.asOf);
  const c = cfg(data);
  const plan = c.years[cur.slice(0, 4)];
  const a = plan ? effectiveA(data, plan.a) : effectiveA(data, defaults(data, all));
  // the projection's first month, started from the month before this one, is this month
  const bl = baseline(data, all);
  const start = { values: bl.values, liab: bl.liab, month: addMonths(cur + '-01', -1).slice(0, 7) };
  const row = simulate(start, a, outlooks, 1)[0];
  const act = monthActual(data, cur);
  const by = investedByMonth(data);
  const classes = Object.keys(by[cur] || {}).filter((k) => k !== 'pf' && classOf(k));
  const doneByClass = Object.fromEntries(classes.map((k) => [k, actualOf(by, cur, k)]));
  const lines = (a.invest || []).filter((l) => (!l.from || cur >= l.from) && (!l.to || cur <= l.to) && l.cls !== 'pf' && classOf(l.cls)).map((l) => ({ id: l.id, name: l.name, cls: l.cls, monthly: l.monthly || 0 }));
  const r = splitMonth({
    actualIn: act.income, planIn: row.salary + row.other + row.interest + row.oneIn,
    actualOut: act.expenses + act.emi + act.tax, planOut: row.expenses + row.emi + row.oneOut,
    bank: all.cashTotal, lines, doneByClass,
  });
  return { month: cur, hasPlan: !!plan, ...r, act };
}

// ---------- 8.9.34: the redesigned "Investing this month" ----------
import { monthCashflow, accountBalances, daysInMonthOf } from './calc.js';

const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
/** Total of a chit's payments in a month ('YYYY-MM'). */
const paidIn = (c, m) => sum((c.entries || []).filter((e) => (e.date || '').slice(0, 7) === m && e.amount > 0), (e) => e.amount);
/**
 * How many months a chit runs: from its tenure, else from its start and end dates, else a duration entered in an older version (still read, no longer asked for). 0 when unknown.
 * Gold chits have no tenure, so they use their dates.
 */
export function chitMonths(c, kind) {
  if (kind !== 'gold' && c.tenure > 0) return Math.round(c.tenure * (c.tenureType === 'Years' ? 12 : c.tenureType === 'Days' ? 1 / 30.4 : 1));
  const a = c.startDate || c.depositDate;
  if (a && c.maturityDate) return Math.max(1, monthsBetween(a.slice(0, 7), c.maturityDate.slice(0, 7)) + 1);
  const old = Number(kind === 'gold' ? c.months : c.chitMonths);
  return old > 0 ? old : 0;
}
/**
 * Chit instalments still to be paid this month, from last month: for every chit and gold chit that is not over, what was paid last month
 * less what has already been paid this month. A chit is over when its payments reach its tenure, its end date has passed or it is closed.
 */
export function chitPending(data, cur) {
  const prev = addMonths(cur + '-01', -1).slice(0, 7), rows = [];
  const add = (c, kind) => {
    if (c.closed) return;
    const last = paidIn(c, prev), now = paidIn(c, cur), dur = chitMonths(c, kind), count = (c.entries || []).length;
    const over = (dur > 0 && count >= dur && !now) || (c.maturityDate && c.maturityDate.slice(0, 7) < cur);
    if (over || !(last > 0)) return;
    rows.push({ name: c.name, kind, last, paid: now, pending: Math.max(0, last - now), count, duration: dur });
  };
  for (const c of data.savings || []) if (c.type === 'Chit') add(c, 'chit');
  for (const c of (data.gold && data.gold.chits) || []) add(c, 'gold');
  return { rows, total: sum(rows, (r) => r.pending), chits: sum(rows.filter((r) => r.kind === 'chit'), (r) => r.pending), gold: sum(rows.filter((r) => r.kind === 'gold'), (r) => r.pending) };
}
/** Regular spending still to come this month: what was spent so far per day, for the days left. Rent is left out, so are one-off and optional lines. */
export function expenseProjection(mc, asOf) {
  const dim = daysInMonthOf(asOf), day = Number(asOf.slice(8, 10)), left = Math.max(0, dim - day);
  const groups = ['Groceries & needs', 'Outside food', 'Medical', 'Travel', 'Utilities'];
  const rows = mc.spend.filter((g) => groups.includes(g.name)).map((g) => ({ name: g.name, spent: g.amount, perDay: g.amount / day, more: (g.amount / day) * left }));
  return { rows, days: day, left, total: sum(rows, (r) => r.more), spent: sum(rows, (r) => r.spent) };
}
/** Banks the person can invest from: wallets are left out. */
export const isWallet = (a) => a.wallet === true || /wallet/i.test(a.name || '');

/** Everything the redesigned card shows. */
export function monthPlan(data, all, outlooks) {
  const base = monthInvest(data, all, outlooks);
  const cur = base.month, prev = addMonths(cur + '-01', -1).slice(0, 7);
  const mandatory = chitPending(data, cur);
  const mc = monthCashflow(data, all, cur);
  const proj = expenseProjection(mc, all.asOf);
  const banks = accountBalances(data).filter((a) => !isWallet(a)), wallets = accountBalances(data).filter(isWallet);
  const bank = sum(banks, (a) => a.balance);
  const current = bank - mandatory.total - proj.total;
  // gold comes from actuals: last month's gold buying less what is already bought this month and what the gold chits will take
  const by = investedByMonth(data);
  const goldWanted = Math.max(0, actualOf(by, prev, 'gold') - actualOf(by, cur, 'gold') - mandatory.gold);
  const free = Math.max(0, current - goldWanted);
  const skip = new Set(['gold', 'chits', 'pf', 'cash']);
  const lines = base.rows.filter((r) => !skip.has(r.cls));
  const weight = sum(lines, (r) => Math.max(0, r.monthly));
  const alloc = lines.map((r) => ({ name: r.name, cls: r.cls, share: weight > 0 ? Math.max(0, r.monthly) / weight : 0, amount: weight > 0 ? (free * Math.max(0, r.monthly)) / weight : 0 }));
  return { ...base, mandatory, mc, proj, bank, banks, wallets, current, goldWanted, free, alloc, hasLines: lines.length > 0 };
}
