// Budget report: month and year against the budgets set on the expense categories.
import { monthReport, yearReport, monthBudget, yearBudget, monthFrac, statusOf } from '../js/budgetreport.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const e = (id, date, category, debit) => ({ id, acct: 'a1', date, desc: category, category, credit: 0, debit });
const data = { settings: {}, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }],
  categoryList: [{ name: 'Groceries', kind: 'expense', budget: 10000 }, { name: 'Vacation', kind: 'expense', budget: 0, yearlyBudget: 60000 }, { name: 'Dining', kind: 'expense', budget: 4000, yearlyBudget: 12000 }, { name: 'Pets', kind: 'expense', budget: 0 }, { name: 'SIP', kind: 'investment', budget: 5000 }, { name: 'Salary', kind: 'income', budget: 0 }],
  ledger: [e(1, '2026-09-05', 'Groceries', 12000), e(2, '2026-10-05', 'Groceries', 7000), e(3, '2026-10-20', 'Groceries', 1000), e(4, '2026-10-12', 'Vacation', 30000), e(5, '2026-10-15', 'Pets', 700), e(6, '2026-10-16', 'SIP', 5000), e(7, '2026-11-03', 'Groceries', 4000), e(8, '2026-11-08', 'Dining', 1500)] };
ok(monthBudget({ budget: 4000, yearlyBudget: 12000 }) === 5000 && yearBudget({ budget: 4000, yearlyBudget: 12000 }) === 60000, 'monthly + yearly/12, and monthly x 12 + yearly');
ok(statusOf(1) === 'near' && statusOf(1.01) === 'over' && statusOf(0.79) === 'ok', 'status bands');
ok(monthFrac('2026-09', '2026-11-10') === 1 && monthFrac('2026-12', '2026-11-10') === 0 && Math.abs(monthFrac('2026-11', '2026-11-15') - 0.5) < 1e-9, 'how much of a month has gone');
const oct = monthReport(data, '2026-10', '2026-11-10');
const g = oct.lines.find((l) => l.name === 'Groceries');
ok(g.spent === 8000 && g.budget === 10000 && g.left === 2000 && g.status === 'near', 'October groceries: 8,000 of 10,000 is 80%, near');
ok(oct.lines.some((l) => l.name === 'Vacation' && l.yearlyOnly && l.budget === 5000 && l.spent === 30000 && l.status === 'over'), 'a yearly budget is spread over the months for the month view');
ok(!oct.lines.some((l) => l.name === 'SIP'), 'investments never use up a budget');
ok(oct.unbudgeted.length === 1 && oct.unbudgeted[0].name === 'Pets' && oct.unbudgetedTotal === 700, 'spending with no budget is listed apart');
ok(oct.budget === 10000 + 5000 + 5000 && oct.spent === 8000 + 30000, 'totals: budgeted categories only');
ok(oct.daily.length === 31 && oct.daily[11].amount === 30000 && oct.daily[30].cum === 38000, 'daily cells and the running total (only budgeted categories)');
const nov = monthReport(data, '2026-11', '2026-11-10');
ok(Math.abs(nov.frac - 10 / 30) < 1e-9 && Math.abs(nov.expected - nov.budget * 10 / 30) < 1e-6, 'the current month is judged by days gone');
ok(nov.daily.filter((d) => d.future).length === 20 && nov.daily[29].cum === 5500, 'future days stay empty');
const y = yearReport(data, 2026, '2026-11-10');
const yg = y.rows.find((r) => r.name === 'Groceries');
ok(yg.budget === 120000 && yg.spent === 12000 + 8000 + 4000 && yg.cells.length === 12 && yg.cells[8].used === 1.2 && yg.cells[11].used === null, 'a year: groceries by month against 10,000, future months empty');
const yv = y.rows.find((r) => r.name === 'Vacation');
ok(yv.yearlyOnly && yv.budget === 60000 && yv.spent === 30000 && yv.status === 'ok', 'yearly budget: 30,000 of 60,000');
ok(y.totals[8].spent === 12000 && y.totals.length === 12, 'monthly totals');
ok(y.overMonths >= 1 && y.doneMonths >= 2 && y.best && y.worst, 'stats: months over, best and worst');
ok(y.unbudgetedTotal === 700, 'a year: spending with no budget');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
