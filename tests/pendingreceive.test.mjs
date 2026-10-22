// The Investable balance's "interest still expected" must equal what Home's Money to receive card shows as waiting.
import { computeAll } from '../js/calc.js';
import { monthPlan, pendingToReceive } from '../js/monthinvest.js';
import { cfg } from '../js/projector.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const dat = { settings: { goldRate: 12000, tdsRate: 0.1 }, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }], ledger: [{ id: 1, date: '2026-10-01', acct: 'a1', desc: 'open', category: 'Income', credit: 100000, debit: 0 }],
  categories: [], savings: [], bonds: [], fds: [], lending: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], jewellery: [], chits: [], others: [] }, liabilities: [], targets: [], proj: [], incomeSources: [], manualMonthlyIncome: [], reportNotes: [],
  receivables: [{ id: 'r1', name: 'Pandi', expected: 3000, balanceDue: 200000, term: 'Monthly', startDate: '2026-02-07', dueDay: 7, active: true, lastReceived: '2026-09-07' }, { id: 'r2', name: 'Done', expected: 1000, balanceDue: 50000, term: 'Monthly', startDate: '2026-02-07', dueDay: 7, active: true, lastReceived: '2026-10-07' }] };
const all = computeAll(dat, { asOf: '2026-10-21' });
const p = pendingToReceive(dat, all);
ok(p.rows.length === 1 && p.rows[0].name === 'Pandi' && p.total > 0, 'unreceived Money to receive entry counts as pending');
const plan = monthPlan(dat, all, cfg(dat).outlooks);
ok(Math.abs(plan.interest - p.total) < 0.01, 'investable balance interest equals the card total');
ok(plan.interest > 0, 'not zero while money to receive is pending');
console.log(bad ? bad + ' failed' : 'all passed');
process.exit(bad ? 1 : 0);
