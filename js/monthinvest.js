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
import { monthCashflow, accountBalances, daysInMonthOf, receivableStatus, monthStart } from './calc.js';

const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
/** Total of a chit's payments in a month ('YYYY-MM'). */
const paidIn = (c, m) => sum((c.entries || []).filter((e) => (e.date || '').slice(0, 7) === m && e.amount > 0), (e) => e.amount);
/** Gold chits run for 11 months unless the owner sets another length (Gold & others → Gold chits). */
export const GOLD_CHIT_MONTHS = 11;
export const goldChitMonths = (data) => { const n = Number(data && data.settings && data.settings.goldChitMonths); return n >= 1 ? Math.round(n) : GOLD_CHIT_MONTHS; };
/**
 * How many months a chit runs. Chits: from the tenure, else the start and end dates, else a duration entered in an older version. Gold chits: the length set for gold chits
 * (11 months unless changed), or a duration entered on that chit in an older version. 0 when unknown.
 */
export function chitMonths(c, kind, goldDefault = GOLD_CHIT_MONTHS) {
  if (kind === 'gold') return Number(c.months) > 0 ? Number(c.months) : goldDefault;
  if (c.tenure > 0) return Math.round(c.tenure * (c.tenureType === 'Years' ? 12 : c.tenureType === 'Days' ? 1 / 30.4 : 1));
  const a = c.startDate || c.depositDate;
  if (a && c.maturityDate) return Math.max(1, monthsBetween(a.slice(0, 7), c.maturityDate.slice(0, 7)) + 1);
  return Number(c.chitMonths) > 0 ? Number(c.chitMonths) : 0;
}
/**
 * Chit and gold chit payments for this month. Every running chit (gold schemes such as GRT Savings Account included) is either paid, if anything was paid into it this month
 * (the amount can change every month, so any payment counts), or pending, for what it took last month (else its monthly instalment). A chit is over, and not listed, when it is closed,
 * its end date has passed, or its payments reach its length (gold chits: also when their length in months has passed since the first payment).
 */
export function chitPending(data, cur) {
  const prev = addMonths(cur + '-01', -1).slice(0, 7), rows = [], gdef = goldChitMonths(data);
  const monthsPaid = (c) => new Set((c.entries || []).filter((e) => e.amount > 0 && e.date).map((e) => e.date.slice(0, 7))).size;
  const add = (c, kind) => {
    if (c.closed) return;
    const last = paidIn(c, prev), now = paidIn(c, cur), dur = chitMonths(c, kind, gdef), count = monthsPaid(c);
    const first = c.startDate || c.depositDate || (c.entries || []).map((e) => e.date).filter(Boolean).sort()[0] || '';
    const ended = !!c.maturityDate && c.maturityDate.slice(0, 7) < cur;
    const finished = dur > 0 && !now && (count >= dur || (kind === 'gold' && !!first && monthsBetween(first.slice(0, 7), cur) >= dur));
    if (ended || finished) return;
    const amount = last > 0 ? last : Number(c.monthly) > 0 ? Number(c.monthly) : 0;
    if (!(amount > 0) && !(now > 0)) return;
    rows.push({ name: c.name, kind, last: amount, paid: now, done: now > 0, pending: now > 0 ? 0 : amount, count, duration: dur });
  };
  for (const c of data.savings || []) if (c.type === 'Chit') add(c, 'chit');
  for (const c of (data.gold && data.gold.chits) || []) add(c, 'gold');
  for (const x of (data.gold && data.gold.schemes) || []) if (x.active) add(x, 'gold');
  const pending = rows.filter((r) => !r.done), done = rows.filter((r) => r.done);
  return { rows, pending, done, total: sum(pending, (r) => r.pending), paidTotal: sum(done, (r) => r.paid), chits: sum(pending.filter((r) => r.kind === 'chit'), (r) => r.pending), gold: sum(pending.filter((r) => r.kind === 'gold'), (r) => r.pending) };
}
/** Who runs a chit: the organiser typed on it, else the name without its amount ("5L_Ravi" and "10L_Ravi" are both Ravi). Same rule as the risk limits. */
export const chitOrganiser = (x) => String(x.organiser || '').trim() || String(x.name || '').replace(/^\s*\d+(\.\d+)?\s*L?\s*[_-]\s*/i, '').replace(/[\s_-]*\d+(\.\d+)?\s*L$/i, '').trim() || 'Other';
/**
 * Chits (not gold) for the cards on Savings → Chits. This month: what is still to pay and what is already paid. Next month: a projection from the months paid so far
 * (the average of the last three payments, since the amount changes every month), for every chit that is still running then.
 */
export function chitCards(data, cur) {
  const mp = chitPending(data, cur), next = addMonths(cur + '-01', 1).slice(0, 7);
  const mine = mp.rows.filter((r) => r.kind === 'chit');
  const orgOf = new Map((data.savings || []).filter((c) => c.type === 'Chit').map((c) => [c.name, chitOrganiser(c)]));
  const thisMonth = mine.map((r) => ({ name: r.name, org: orgOf.get(r.name) || 'Other', due: r.pending, paid: r.paid, expected: r.paid > 0 ? r.paid : r.pending }));
  const proj = [];
  for (const c of (data.savings || []).filter((x) => x.type === 'Chit' && !x.closed)) {
    const by = new Map();
    for (const e of c.entries || []) if (e.amount > 0 && e.date) by.set(e.date.slice(0, 7), (by.get(e.date.slice(0, 7)) || 0) + e.amount);
    const months = [...by.keys()].filter((m) => m <= cur).sort();
    if (!months.length) continue;
    const dur = chitMonths(c, 'chit');
    const paidCount = months.length;
    const ended = !!c.maturityDate && c.maturityDate.slice(0, 7) < next;
    // a chit with a tenure is finished once that many months are paid (this month counts only if it is paid); one not yet paid this month still owes it before next month
    const owesThis = !by.has(cur) && thisMonth.some((r) => r.name === c.name);
    if (ended || (dur > 0 && paidCount + (owesThis ? 1 : 0) >= dur)) continue;
    const last = months.slice(-3), amount = Math.round(last.reduce((a, m) => a + by.get(m), 0) / last.length);
    if (amount > 0) proj.push({ name: c.name, org: chitOrganiser(c), amount, basis: last.length });
  }
  const group = (rows, key) => { const m = new Map(); for (const r of rows) { const g = m.get(r.org) || { org: r.org, count: 0, amount: 0, items: [] }; g.count++; g.amount += r[key] || 0; g.items.push(r); m.set(r.org, g); } return [...m.values()].sort((a, b) => b.amount - a.amount); };
  const sumOf = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  return { month: cur, next, thisMonth, dueTotal: sumOf(thisMonth, 'due'), paidTotal: sumOf(thisMonth, 'paid'), dueByOrg: group(thisMonth, 'due'), paidByOrg: group(thisMonth, 'paid'),
    proj, projTotal: sumOf(proj, 'amount'), projByOrg: group(proj, 'amount') };
}
/** Regular spending still to come this month: what was spent so far per day, for the days left. Rent is left out, so are one-off and optional lines. */
export function expenseProjection(mc, asOf) {
  const dim = daysInMonthOf(asOf), day = Number(asOf.slice(8, 10)), left = Math.max(0, dim - day);
  const groups = ['Groceries & needs', 'Outside food', 'Medical', 'Travel', 'Utilities'];
  const rows = mc.spend.filter((g) => groups.includes(g.name)).map((g) => ({ name: g.name, spent: g.amount, perDay: g.amount / day, more: (g.amount / day) * left }));
  return { rows, days: day, left, total: sum(rows, (r) => r.more), spent: sum(rows, (r) => r.spent) };
}
/** Cash in hand: accounts marked as a wallet, or named wallet or cash. Everything else is a bank. */
export const isWallet = (a) => a.wallet === true || /wallet|\bcash\b/i.test(a.name || '');

/**
 * Interest still to come this month: exactly what Home's "Money to receive this month" card lists as waiting.
 * Money to receive entries that are due this month and not received (overdue and due today included, part months at their part amount),
 * plus the income lines (bonds, monthly lending) that are expected but not yet received. One rule, used by that card and by the Investable balance.
 */
export function pendingToReceive(data, all, mc) {
  const month = monthKey(all.asOf), monthEnd = addMonths(monthStart(all.asOf), 1);
  const rows = (data.receivables || []).filter((x) => x.active !== false && x.balanceDue > 0).map((x) => receivableStatus(x, all.asOf))
    .filter((r) => !r.received && !r.notStarted && r.due < monthEnd).sort((a, b) => (a.due < b.due ? -1 : 1));
  const cash = mc || monthCashflow(data, all, month);
  const lines = cash.income.filter((x) => x.expected - x.received > 1).map((x) => ({ name: x.name, expected: x.expected - x.received, received: x.received, total: x.expected, bonds: x.bonds }));
  const total = rows.reduce((a, r) => a + (r.dueAmount ?? r.expected ?? 0), 0) + lines.reduce((a, r) => a + r.expected, 0);
  return { month, rows, lines, total };
}

/** Everything the redesigned card shows. */
export function monthPlan(data, all, outlooks) {
  const base = monthInvest(data, all, outlooks);
  const cur = base.month, prev = addMonths(cur + '-01', -1).slice(0, 7);
  const mandatory = chitPending(data, cur);
  const mc = monthCashflow(data, all, cur);
  const proj = expenseProjection(mc, all.asOf);
  const banks = accountBalances(data).filter((a) => !isWallet(a)), wallets = accountBalances(data).filter(isWallet);
  const bank = sum(banks, (a) => a.balance), cash = sum(wallets, (a) => a.balance);
  // interest still to come this month (bonds and lending not received yet); expenses still to come are a projection
  const interest = Math.max(0, pendingToReceive(data, all, mc).total);
  const current = bank + cash + interest - mandatory.total - proj.total;
  // gold comes from actuals: last month's gold buying less what is already bought this month and what the gold chits will take
  const by = investedByMonth(data);
  const goldWanted = Math.max(0, actualOf(by, prev, 'gold') - actualOf(by, cur, 'gold') - mandatory.gold);
  const free = Math.max(0, current - goldWanted);
  const skip = new Set(['gold', 'chits', 'pf', 'cash']);
  const lines = base.rows.filter((r) => !skip.has(r.cls));
  const weight = sum(lines, (r) => Math.max(0, r.monthly));
  const alloc = lines.map((r) => ({ name: r.name, cls: r.cls, share: weight > 0 ? Math.max(0, r.monthly) / weight : 0, amount: weight > 0 ? (free * Math.max(0, r.monthly)) / weight : 0 }));
  return { ...base, mandatory, mc, proj, bank, banks, wallets, cash, interest, current, goldWanted, free, alloc, hasLines: lines.length > 0 };
}
