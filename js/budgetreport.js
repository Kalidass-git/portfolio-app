// Budget report: how spending stands against the budgets set on the expense categories (Expenses → Categories).
// A category has a monthly budget, a yearly budget, or both. Nothing is stored here: it only reads data.categoryList and the bank entries.
//   month budget = monthly + yearly / 12      year budget = monthly x 12 + yearly
// Only categories of kind "expense" count (investments, transfers and income never use up a budget).
import { categoryList, kindOf } from './categories.js';
import { monthKey } from './calc.js';

const lc = (s) => (s || '').trim().toLowerCase();
export const monthBudget = (c) => (c.budget || 0) + (c.yearlyBudget || 0) / 12;
export const yearBudget = (c) => (c.budget || 0) * 12 + (c.yearlyBudget || 0);
export const hasBudget = (c) => (c.budget || 0) > 0 || (c.yearlyBudget || 0) > 0;
export const daysIn = (month) => new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();

/** How much of a month has gone by: 1 for a finished month, 0 for a future one, day/days for the current month. */
export function monthFrac(month, asOf) {
  const cur = monthKey(asOf);
  if (month < cur) return 1;
  if (month > cur) return 0;
  return Number(asOf.slice(8, 10)) / daysIn(month);
}
export const statusOf = (used) => (used > 1 + 1e-9 ? 'over' : used >= 0.8 ? 'near' : 'ok');

/** Spending of every expense category by month and by day: { byMonth: Map(month -> Map(key -> amount)), byDay: Map(date -> Map(key -> amount)), names: Map(key -> name) } */
export function spendIndex(data) {
  const kind = kindOf(data), byMonth = new Map(), byDay = new Map(), names = new Map();
  for (const e of data.ledger || []) {
    if (!(e.debit > 0) || !e.category || kind(e.category) !== 'expense') continue;
    const k = lc(e.category), m = monthKey(e.date);
    names.set(k, names.get(k) || e.category.trim());
    const a = byMonth.get(m) || new Map(); a.set(k, (a.get(k) || 0) + e.debit); byMonth.set(m, a);
    const b = byDay.get(e.date) || new Map(); b.set(k, (b.get(k) || 0) + e.debit); byDay.set(e.date, b);
  }
  return { byMonth, byDay, names };
}
const budgeted = (data) => categoryList(data).filter((c) => c.kind === 'expense' && hasBudget(c));

/** One month against the budgets. */
export function monthReport(data, month, asOf, idx = spendIndex(data)) {
  const frac = monthFrac(month, asOf), sp = idx.byMonth.get(month) || new Map(), cats = budgeted(data), days = daysIn(month);
  const lines = cats.map((c) => {
    const budget = monthBudget(c), spent = sp.get(lc(c.name)) || 0, used = budget ? spent / budget : 0;
    const expected = budget * frac, projected = frac > 0 && frac < 1 && Number(asOf.slice(8, 10)) >= 5 ? spent / frac : spent;
    return { name: c.name, key: lc(c.name), budget, spent, left: budget - spent, used, status: statusOf(used), expected, projected, ahead: frac > 0 && frac < 1 && spent > expected * 1.1 && spent > 0, yearlyOnly: !(c.budget > 0) };
  }).sort((a, b) => b.used - a.used);
  const keys = new Set(lines.map((l) => l.key));
  const sum = (f) => lines.reduce((a, l) => a + f(l), 0), budget = sum((l) => l.budget), spent = sum((l) => l.spent);
  const unbudgeted = [...sp].filter(([k]) => !keys.has(k)).map(([k, amount]) => ({ key: k, name: idx.names.get(k) || k, spent: amount })).sort((a, b) => b.spent - a.spent);
  const daily = []; let cum = 0;
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`, dm = idx.byDay.get(date) || new Map();
    const amount = [...dm].filter(([k]) => keys.has(k)).reduce((a, [, v]) => a + v, 0);
    const future = month > monthKey(asOf) || (month === monthKey(asOf) && d > Number(asOf.slice(8, 10)));
    cum += future ? 0 : amount; daily.push({ d, date, amount, cum, future });
  }
  return { month, frac, days, lines, budget, spent, left: budget - spent, used: budget ? spent / budget : 0, status: statusOf(budget ? spent / budget : 0), expected: budget * frac, projected: frac > 0 && frac < 1 && Number(asOf.slice(8, 10)) >= 5 ? spent / frac : spent,
    unbudgeted, unbudgetedTotal: unbudgeted.reduce((a, u) => a + u.spent, 0), daily, allowance: budget / days, over: lines.filter((l) => l.status === 'over'), near: lines.filter((l) => l.status === 'near') };
}

/** A whole year: every budgeted category by month (against its monthly budget; a category with only a yearly budget is judged against the share of the year gone so far), and the year so far. */
export function yearReport(data, year, asOf, idx = spendIndex(data)) {
  const cur = monthKey(asOf), months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const cats = budgeted(data), elapsed = months.reduce((a, m) => a + monthFrac(m, asOf), 0);
  const rows = cats.map((c) => {
    const mb = monthBudget(c), yb = yearBudget(c), yearlyOnly = !(c.budget > 0); let cum = 0;
    const cells = months.map((m, i) => {
      const spent = (idx.byMonth.get(m) || new Map()).get(lc(c.name)) || 0, f = monthFrac(m, asOf); cum += spent;
      // monthly budget: this month's spending against it. yearly only: money spent so far in the year against the share of the year allowed so far
      const allowed = yearlyOnly ? yb * (i + f) / 12 : mb * f, used = f === 0 ? null : yearlyOnly ? (allowed ? cum / allowed : null) : (mb ? spent / mb : null);
      return { month: m, spent, used, future: f === 0, cur: m === cur, cum };
    });
    const spent = cells.reduce((a, x) => a + x.spent, 0), projected = elapsed > 0 ? spent / elapsed * 12 : spent;
    return { name: c.name, key: lc(c.name), monthly: c.budget || 0, yearly: c.yearlyBudget || 0, budget: yb, spent, left: yb - spent, used: yb ? spent / yb : 0, status: statusOf(yb ? spent / yb : 0), projected, yearlyOnly, cells };
  }).sort((a, b) => b.used - a.used);
  const totals = months.map((m, i) => {
    const f = monthFrac(m, asOf), spent = rows.reduce((a, r) => a + r.cells[i].spent, 0), budget = rows.reduce((a, r) => a + monthBudget({ budget: r.monthly, yearlyBudget: r.yearly }), 0);
    return { month: m, spent, budget, used: f === 0 || !budget ? null : spent / (budget * f), future: f === 0, cur: m === cur, full: spent / (budget || 1) };
  });
  const budget = rows.reduce((a, r) => a + r.budget, 0), spent = rows.reduce((a, r) => a + r.spent, 0);
  const done = totals.filter((t) => !t.future && !t.cur && t.budget > 0);
  const overMonths = done.filter((t) => t.spent > t.budget + 1e-9).length;
  const best = done.length ? done.reduce((a, t) => (t.spent / t.budget < a.spent / a.budget ? t : a)) : null, worst = done.length ? done.reduce((a, t) => (t.spent / t.budget > a.spent / a.budget ? t : a)) : null;
  const unspent = new Set(rows.map((r) => r.key));
  let un = 0; for (const m of months) for (const [k, v] of idx.byMonth.get(m) || []) if (!unspent.has(k)) un += v;
  return { year, months, rows, totals, budget, spent, left: budget - spent, used: budget ? spent / budget : 0, projected: elapsed > 0 ? spent / elapsed * 12 : spent, elapsed, overMonths, doneMonths: done.length, best, worst, unbudgetedTotal: un,
    over: rows.filter((r) => r.status === 'over'), near: rows.filter((r) => r.status === 'near') };
}
/** Years that have bank entries, newest last, always including the current one. */
export function budgetYears(data, asOf) {
  const ys = new Set([asOf.slice(0, 4)]); for (const e of data.ledger || []) if (e.date) ys.add(e.date.slice(0, 4));
  return [...ys].sort();
}
