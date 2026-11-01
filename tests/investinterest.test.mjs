// Investable balance: "Interest income still expected" = income not received yet in This month in detail + Income Bond not in the bank yet.
// A lending payment counts once (its income line), never twice (line and its Money to receive entry). Synthetic data, no argument.
import { computeAll, monthCashflow } from '../js/calc.js';
import { pendingToReceive, monthPlan } from '../js/monthinvest.js';
import { cfg } from '../js/projector.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const mk = () => ({
  settings: { goldRate: 12000, tdsRate: 0.1 }, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }],
  ledger: [{ id: 1, date: '2026-10-01', acct: 'a1', desc: 'open', category: 'Income', credit: 100000, debit: 0 }, { id: 2, date: '2026-11-01', acct: 'a1', desc: 'food', category: 'Food', credit: 0, debit: 500 }],
  categories: [], savings: [], fds: [], lending: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], jewellery: [], chits: [], others: [] }, liabilities: [], targets: [], proj: [], incomeSources: [], reportNotes: [],
  bonds: [{ id: 'b1', name: 'BondA', holder: 'X', principal: 600000, rate: 0.12, depositDate: '2026-01-01', maturityDate: '2028-01-01', credit: 'Monthly', dueRule: 'day', dueDay: 1 }],
  manualMonthlyIncome: [{ id: 'm1', name: 'Lending Pandi', amount: 8000, match: 'pandi' }],
  receivables: [{ id: 'r1', name: 'Alagu Pandi', expected: 5000, balanceDue: 500000, term: 'Monthly', startDate: '2026-02-07', dueDay: 5, active: true, lastReceived: '2026-10-05' },
    { id: 'r2', name: 'Alagu Pandi', expected: 3000, balanceDue: 300000, term: 'Monthly', startDate: '2026-02-07', dueDay: 6, active: true, lastReceived: '2026-10-06' },
    { id: 'r9', name: 'Other person', expected: 1000, balanceDue: 50000, term: 'Monthly', startDate: '2026-02-07', dueDay: 7, active: true, lastReceived: '2026-10-07' }],
});
let dat = mk(), all = computeAll(dat, { asOf: '2026-11-02' });
let mc = monthCashflow(dat, all, '2026-11'), p = pendingToReceive(dat, all, mc);
const pend = (n) => { const l = mc.income.find((x) => x.name === n); return l ? l.expected - l.received : 0; };
ok(pend('Lending Pandi') === 8000, 'the Pandi line shows 8000 pending in This month in detail');
ok(p.extra.length === 1 && p.extra[0].name === 'Other person', 'only a Money to receive entry no income line covers is added on its own');
ok(p.rows.length === 3, 'Home’s “Due to you” list still shows every unreceived entry');
ok(p.notInBank > 0 && p.notInBank === mc.income[0].bonds.filter((b) => b.received > 0.5).reduce((a, b) => a + b.expected, 0), 'a bond counted as received but not in the bank shows as not in the bank yet: ' + Math.round(p.notInBank));
ok(Math.abs(p.total - (pend('Income Bond') + pend('Lending Pandi') + 1000 + p.notInBank)) < 0.01, 'total = income not received + entries outside any line + Income Bond not in the bank (no double count)');
// the bank shows the bond credit: nothing "not in the bank"
dat.ledger.push({ id: 3, date: '2026-11-01', acct: 'a1', desc: 'bonda interest', category: 'Income Bond', credit: p.notInBank, debit: 0 });
all = computeAll(dat, { asOf: '2026-11-02' }); mc = monthCashflow(dat, all, '2026-11'); p = pendingToReceive(dat, all, mc);
ok(p.notInBank === 0, 'credited in the bank: not in the bank yet drops to 0');
// marking a payment received lowers the figure by that payment
const before = p.total; dat.receivables[0].lastReceived = '2026-11-05'; all = computeAll(dat, { asOf: '2026-11-02' }); mc = monthCashflow(dat, all, '2026-11'); p = pendingToReceive(dat, all, mc);
ok(Math.abs(before - p.total - 5000) < 0.01, 'marking a 5000 payment received lowers it by 5000');
const plan = monthPlan(dat, all, cfg(dat).outlooks);
ok(Math.abs(plan.interest - p.total) < 0.01, 'the Investable balance uses the same figure');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
