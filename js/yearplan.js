// One-year plan: monthly targets, a conservative projection, where you stand, and a year-end review. Pure functions, no DOM.
//
// data.yearPlans: [{ id: '2026', startMonth: '2026-01', incomeHaircut: 0.1, expenseBuffer: 0.1,
//                    months: [{ month, salary, otherIncome, expenses, oneOff, emi, tax, pf, note }],
//                    retro: { wrong, why, better, savedAt } }]
// Money out is stored as positive numbers here.
import { monthLedger, monthKey, addMonths, monthEnd, netWorthSeries } from './calc.js';
import { kindOf, oneTimeSet } from './categories.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const cat = (e) => (e.category || '').toLowerCase();

export const DEFAULTS = { incomeHaircut: 0.1, expenseBuffer: 0.1 };

/** First plan, built from the older Proj sheet so nothing you entered is lost. */
export function seedFromProj(data) {
  const rows = (data.proj && data.proj.months) || [];
  if (!rows.length) return null;
  const start = rows[0].date.slice(0, 7);
  return {
    id: start.slice(0, 4), startMonth: start, ...DEFAULTS,
    months: rows.slice(0, 12).map((r) => ({
      month: r.date.slice(0, 7), salary: r.salary || 0, otherIncome: r.monthlyInterest || 0, expenses: Math.abs(r.family || 0), oneOff: Math.abs(r.other || 0),
      emi: Math.abs(r.emi || 0), tax: Math.abs(r.tax || 0), pf: r.pf || 0, note: r.remarks || '',
    })),
    retro: { wrong: '', why: '', better: '' },
  };
}
export const plansOf = (data) => (data.yearPlans && data.yearPlans.length ? data.yearPlans : (seedFromProj(data) ? [seedFromProj(data)] : []));

/** What really happened in a month, from the bank entries. Investments are savings, not spending. */
export function monthActual(data, month) {
  const rows = monthLedger(data, month);
  const kind = kindOf(data);
  const cr = (f) => sum(rows.filter(f), (e) => e.credit), db = (f) => sum(rows.filter(f), (e) => e.debit);
  const salary = cr((e) => cat(e) === 'salary');
  const income = cr((e) => kind(e.category) === 'income');   // refunds and loan repayments in other categories are not income
  const emi = db((e) => cat(e) === 'loan'), tax = db((e) => cat(e) === 'tax');
  const expenses = db((e) => kind(e.category) !== 'investment' && cat(e) !== 'loan' && cat(e) !== 'tax');
  const once = oneTimeSet(data);
  const oneTime = db((e) => kind(e.category) !== 'investment' && cat(e) !== 'loan' && cat(e) !== 'tax' && once.has(cat(e)));
  const invested = db((e) => kind(e.category) === 'investment');
  const pf = sum(data.savings.filter((s) => s.type === 'EPF'), (s) => sum(s.entries.filter((e) => monthKey(e.date) === month), (e) => (e.employee || 0) + (e.employer || 0)));
  return { salary, income, otherIncome: income - salary, expenses, oneTime, regular: expenses - oneTime, emi, tax, invested, pf, left: income - expenses - emi - tax, has: rows.length > 0 };
}

const planMonth = (m, p) => {
  const income = m.salary + m.otherIncome, out = m.expenses + m.oneOff + m.emi + m.tax;
  const cIncome = m.salary + m.otherIncome * (1 - p.incomeHaircut), cExpenses = (m.expenses + m.oneOff) * (1 + p.expenseBuffer);
  return {
    income, expenses: m.expenses + m.oneOff, emi: m.emi, tax: m.tax, pf: m.pf, left: income - out,
    cIncome, cExpenses, cLeft: cIncome - cExpenses - m.emi - m.tax,
  };
};

/**
 * Month by month: plan, conservative plan, actual so far, and a forecast that uses actuals for past months and the
 * conservative plan (or the actual, if it is already worse) for the rest.
 */
export function buildYear(data, all, plan) {
  const cur = monthKey(all.asOf);
  const rows = plan.months.map((m) => {
    const pl = planMonth(m, plan);
    const past = m.month < cur, now = m.month === cur;
    const a = past || now ? monthActual(data, m.month) : null;
    let state = 'ahead-of-us'; // future month
    let forecast, fIncome, fExpenses;
    if (past && a.has) { state = 'done'; fIncome = a.income; fExpenses = a.expenses; forecast = a.left; }
    else if (now) {
      state = 'running';
      fIncome = Math.max(a ? a.income : 0, pl.cIncome); fExpenses = Math.max(a ? a.expenses : 0, pl.cExpenses);
      forecast = fIncome - fExpenses - Math.max(a ? a.emi : 0, pl.emi) - Math.max(a ? a.tax : 0, pl.tax);
    } else { fIncome = pl.cIncome; fExpenses = pl.cExpenses; forecast = pl.cLeft; if (past) state = 'done'; }
    const diff = a && state === 'done' ? a.left - pl.left : null;
    const status = state !== 'done' ? null : diff >= -0.02 * Math.max(1, pl.income) ? (diff > 0.02 * Math.max(1, pl.income) ? 'ahead' : 'on track') : 'behind';
    return { ...m, plan: pl, actual: a, state, forecast, fIncome, fExpenses, diff, status };
  });
  let cp = 0, cc = 0, ca = 0, cf = 0;
  for (const r of rows) {
    cp += r.plan.left; cc += r.plan.cLeft; cf += r.forecast;
    if (r.state === 'done' && r.actual) ca += r.actual.left;
    r.cumPlan = cp; r.cumConservative = cc; r.cumForecast = cf; r.cumActual = r.state === 'done' ? ca : null;
  }
  const done = rows.filter((r) => r.state === 'done');
  const totals = (key) => ({ plan: sum(rows, (r) => r.plan[key]), actual: sum(done, (r) => (r.actual ? r.actual[key] : 0)), planDone: sum(done, (r) => r.plan[key]) });
  return {
    rows, done, cur,
    planTotal: cp, conservativeTotal: cc, forecastTotal: cf, ytdActual: ca, ytdPlan: sum(done, (r) => r.plan.left),
    lines: { income: totals('income'), expenses: totals('expenses'), emi: totals('emi'), tax: totals('tax'), pf: totals('pf') },
    complete: rows.every((r) => r.state === 'done'),
  };
}

/** Net worth the savings alone would reach, next to what it actually was. Market gains are not counted, so it is a cautious path. */
export function netWorthPath(data, all, plan, year) {
  const series = netWorthSeries(data, all);
  const before = series.filter((p) => p.date < plan.startMonth + '-01').pop();
  const start = before ? before.value : (series[0] ? series[0].value : all.netAsset);
  const pf = (r) => r.pf || 0;
  return year.rows.map((r) => {
    const end = monthEnd(r.month + '-01');
    const act = series.filter((p) => p.date <= end && p.date >= r.month + '-01').pop();
    return { month: r.month, plan: start + sum(year.rows.filter((x) => x.month <= r.month), (x) => x.plan.left + pf(x)), conservative: start + sum(year.rows.filter((x) => x.month <= r.month), (x) => x.plan.cLeft + pf(x)), actual: act ? act.value : null };
  });
}

/** Plain-language findings for the review. */
export function review(data, all, plan, year) {
  const done = year.done.filter((r) => r.actual && r.actual.has);
  const out = [];
  if (!done.length) return { findings: [{ tone: '', text: 'No month of this plan has finished yet, so there is nothing to review. Come back after the first month ends.' }], big: [], cats: [], suggest: null };
  const L = year.lines;
  const pctOff = (a, p) => (p ? (a - p) / p : 0);
  const fmtP = (x) => Math.abs(Math.round(x * 100)) + '%';
  const inc = pctOff(L.income.actual, L.income.planDone);
  out.push({ tone: inc >= -0.03 ? 'pos' : 'neg', text: `Income was ${fmtP(inc)} ${inc >= 0 ? 'above' : 'below'} the plan over ${done.length} month${done.length > 1 ? 's' : ''}.` + (inc < -0.03 ? ` Your plan expected more from interest and other income than arrived. The conservative setting would have caught ${plan.incomeHaircut ? fmtP(plan.incomeHaircut) : 'none'} of it.` : '') });
  const ex = pctOff(L.expenses.actual, L.expenses.planDone);
  out.push({ tone: ex <= 0.03 ? 'pos' : 'neg', text: `Expenses were ${fmtP(ex)} ${ex >= 0 ? 'over' : 'under'} plan (${Math.round(L.expenses.actual).toLocaleString('en-IN')} against ${Math.round(L.expenses.planDone).toLocaleString('en-IN')}).` });
  const overs = done.filter((r) => r.actual.expenses > r.plan.expenses * 1.05);
  if (overs.length) { const w = overs.slice().sort((a, b) => (b.actual.expenses - b.plan.expenses) - (a.actual.expenses - a.plan.expenses))[0]; out.push({ tone: 'neg', text: `${overs.length} of ${done.length} months went over the expense plan. The worst was ${w.month}, by ${Math.round(w.actual.expenses - w.plan.expenses).toLocaleString('en-IN')}.`, month: w.month }); }
  const met = done.filter((r) => r.actual.left >= r.plan.cLeft).length;
  out.push({ tone: met >= done.length * 0.8 ? 'pos' : 'neg', text: `The conservative plan was met in ${met} of ${done.length} months, and the main plan in ${done.filter((r) => r.actual.left >= r.plan.left - 1).length}.` });
  const mape = done.reduce((a, r) => a + Math.abs(r.actual.left - r.plan.left), 0) / done.length;
  out.push({ tone: '', text: `On average the monthly left-over was off by ${Math.round(mape).toLocaleString('en-IN')} either way. Months with a one-off cost drive most of that.` });
  // biggest single expenses: the surprises
  const from = plan.startMonth + '-01', to = monthEnd(plan.months[plan.months.length - 1].month + '-01');
  const kind = kindOf(data);
  const big = data.ledger.filter((e) => e.date >= from && e.date <= to && e.debit > 0 && kind(e.category) === 'expense' && !['loan', 'tax'].includes(cat(e))).sort((a, b) => b.debit - a.debit).slice(0, 6);
  // category totals
  const m = new Map();
  for (const r of done) for (const e of monthLedger(data, r.month)) if (e.debit > 0 && kind(e.category) === 'expense' && !['loan', 'tax'].includes(cat(e))) m.set(e.category || 'Unknown', (m.get(e.category || 'Unknown') || 0) + e.debit);
  const cats = [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8);
  const avgExp = L.expenses.actual / done.length;
  const suggest = { expenses: Math.round((avgExp * 1.05) / 1000) * 1000, incomeHaircut: Math.min(0.3, Math.max(0.05, inc < 0 ? Math.abs(inc) + 0.02 : plan.incomeHaircut)), note: `Next year: plan about ${Math.round(avgExp * 1.05).toLocaleString('en-IN')} a month for everyday expenses (your average plus 5%), and keep a larger buffer for one-off costs.` };
  return { findings: out, big, cats, suggest };
}

/** A fresh plan for the next 12 months from what was learned. */
export function nextPlan(prev, { salary, otherIncome, expenses, incomeHaircut, expenseBuffer }) {
  const start = addMonths(prev.months[prev.months.length - 1].month + '-01', 1).slice(0, 7);
  const taxByMonthNo = new Map(prev.months.map((m) => [m.month.slice(5, 7), m.tax]));
  return {
    id: start.slice(0, 4) + (prev.id.startsWith(start.slice(0, 4)) ? 'b' : ''), startMonth: start, incomeHaircut, expenseBuffer,
    months: Array.from({ length: 12 }, (_, i) => { const mo = addMonths(start + '-01', i).slice(0, 7); return { month: mo, salary, otherIncome, expenses, oneOff: 0, emi: prev.months[prev.months.length - 1].emi, tax: taxByMonthNo.get(mo.slice(5, 7)) || 0, pf: prev.months[prev.months.length - 1].pf, note: '' }; }),
    retro: { wrong: '', why: '', better: '' },
  };
}
