// Yearly pools, the year against interest income, ideas, and suggested budgets. Synthetic data, no data file needed.
import * as C from '../js/calc.js';
import * as YP from '../js/yearcover.js';
import * as BS from '../js/budgetsuggest.js';
import * as BR from '../js/budgetreport.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const e = (id, date, category, debit, credit = 0) => ({ id, acct: 'a1', date, desc: category, category, debit, credit });
const ledger = [];
let id = 1;
for (let m = 1; m <= 10; m++) { const mm = String(m).padStart(2, '0'); ledger.push(e(id++, `2026-${mm}-03`, 'Rent', 20000), e(id++, `2026-${mm}-10`, 'Groceries', 9000 + m * 100)); }
ledger.push(e(id++, '2026-03-15', 'Lifestyle', 12000), e(id++, '2026-08-20', 'Lifestyle', 8000), e(id++, '2026-06-01', 'Medical', 5000));
const data = { settings: { goldRate: 7000, homeSpendExtra: ['lifestyle', 'groceries', 'medical'] }, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }], ledger, categories: [],
  categoryList: [{ name: 'Rent', kind: 'expense', budget: 20000 }, { name: 'Groceries', kind: 'expense', budget: 0 }, { name: 'Lifestyle', kind: 'expense', budget: 0, yearlyBudget: 50000 }, { name: 'Medical', kind: 'expense', budget: 0 }],
  savings: [], bonds: [], fds: [], lending: [], receivables: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], chits: [], jewellery: [], others: [] }, liabilities: [], targets: [], proj: [], incomeSources: [], reportNotes: [],
  manualMonthlyIncome: [{ id: 1, name: 'Interest', amount: 30000 }] };
const all = C.computeAll(data, { asOf: '2026-11-15' });
// pools
const p = YP.pools(data, '2026-11-15');
ok(p.length === 1 && p[0].name === 'Lifestyle' && p[0].spent === 20000 && p[0].left === 30000 && Math.abs(p[0].used - 0.4) < 1e-9, 'a yearly-only budget is a pool, judged against the whole year');
const mc = C.monthCashflow(data, all, '2026-03');
ok(mc.poolSpent === 12000 && mc.totalSpent >= 12000, 'pool spending is reported apart from the month: ' + mc.poolSpent);
ok(C.monthCashflow(data, all, '2026-04').poolSpent === 0, 'a month with no pool spending has none');
// month report: a pool is judged by the year so far, and left out of the monthly totals
const idx = BR.spendIndex(data), mr = BR.monthReport(data, '2026-08', '2026-11-15', idx), l = mr.lines.find((x) => x.name === 'Lifestyle');
ok(l && l.yearlyOnly && l.ytd === 20000 && l.budget === 50000 && Math.abs(l.used - 0.4) < 1e-9, 'month report: pool judged by the whole year (not ÷12)');
ok(mr.budget === 20000, 'monthly budget total is the monthly lines only: ' + mr.budget);
ok(!mr.lines.filter((x) => !x.yearlyOnly).some((x) => x.name === 'Lifestyle') && mr.spent === mr.lines.filter((x) => !x.yearlyOnly).reduce((a, x) => a + x.spent, 0), 'monthly spent sums only the monthly lines');
const yr = BR.yearReport(data, '2026', '2026-11-15', idx), row = yr.rows.find((x) => x.name === 'Lifestyle');
ok(row.cells[2].used === 12000 / 50000 && Math.abs(row.cells[7].used - 0.4) < 1e-9, 'heat map: share of the whole year used so far');
// outlook
const o = YP.yearOutlook(data, all);
ok(o.year === '2026' && o.interest === o.interestSoFar + o.interestToCome, 'interest = so far + to come');
ok(o.spending === o.spentSoFar + o.regularLeft + o.poolLeft && o.poolLeft === 30000, 'spending = so far + regular months left + pool left');
ok(o.gap === o.spending - o.interest && o.monthsLeft === 1, 'gap is spending minus interest');
ok(o.usual > 0 && o.usual < 40000, 'usual regular month excludes pool spending: ' + o.usual);
const ideas = YP.interestIdeas(data, all, o);
ok(Array.isArray(ideas) && (o.gap <= 0 || ideas.some((i) => i.id === 'gap')), 'ideas include the gap sum when short');
// ideas: idle cash
const rich = { ...data, ledger: [...ledger, e(id++, '2026-01-01', 'Salary', 0, 2000000)], categoryList: data.categoryList };
const allR = C.computeAll(rich, { asOf: '2026-11-15' }), idle = YP.interestIdeas(rich, allR).find((i) => i.id === 'idle');
ok(idle && idle.gain > 0 && /deposit/.test(idle.text), 'idle cash idea with a yearly gain');
ok(idle && /₹/.test(idle.short || '') && ideas.every((i) => typeof i.short === 'string' && i.short.length < 140), 'every idea has a one-line short text');
const small = YP.interestIdeas(data, all).find((i) => i.id === 'idle'); ok(!small || small.gain >= 0, 'no idle idea without idle cash');
// suggestions
const sug = BS.suggestBudgets(data, '2026-11-15');
const g = sug.find((x) => x.name === 'Groceries'), m = sug.find((x) => x.name === 'Medical');
ok(g && g.kind === 'monthly' && g.amount % 500 === 0 && g.amount >= 9000, 'regular spending gets a monthly suggestion: ' + JSON.stringify(g));
ok(m && m.kind === 'yearly' && m.amount % 1000 === 0 && m.amount >= 5000, 'occasional spending gets a yearly pool suggestion');
ok(!sug.some((x) => x.name === 'Rent' || x.name === 'Lifestyle'), 'categories that already have a budget are not suggested');
ok(BS.suggestBudgets({ ...data, ledger: ledger.filter((x) => x.date >= '2026-09-01') }, '2026-11-15').length === 0, 'too little history: no suggestions');
console.log(bad ? bad + ' failed' : 'yearcover ok'); process.exit(bad ? 1 : 0);
