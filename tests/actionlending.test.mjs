// Action centre dates ahead of time (EMI and lending paid this month are listed at next month's date) and lending income that follows
// Money to receive marks only (mark received / not received). Synthetic data, no argument needed.
import { computeAll, upcoming, monthCashflow, markReceivedOn, markNotReceivedOn, receivableStatus } from '../js/calc.js';
import { pendingToReceive } from '../js/monthinvest.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const mk = () => ({
  settings: { goldRate: 12000, tdsRate: 0.1 }, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }],
  ledger: [
    { id: 1, date: '2026-10-02', acct: 'a1', desc: 'home loan', category: 'Loan', credit: 0, debit: 18450 },
    { id: 2, date: '2026-10-05', acct: 'a1', desc: 'pandi', category: 'Income Lending', credit: 8000, debit: 0 },
  ],
  categories: [], savings: [], bonds: [], fds: [], lending: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], jewellery: [], chits: [], others: [] },
  liabilities: [{ id: 'l1', name: 'Home loan', amount: 2000000, rate: 0.09, emi: 18450, emiDay: 3 }, { id: 'l2', name: 'Car loan', amount: 300000, rate: 0.09, emi: 12000, emiDay: 20 }],
  targets: [], proj: [], incomeSources: [], reportNotes: [],
  manualMonthlyIncome: [{ id: 'm1', name: 'Lending Pandi', amount: 8000, match: 'pandi', paidMonths: ['2026-11'] }],
  receivables: [
    { id: 'r1', name: 'Alagu Pandi', expected: 5000, balanceDue: 500000, term: 'Monthly', startDate: '2026-02-07', dueDay: 5, active: true, lastReceived: '2026-10-05' },
    { id: 'r2', name: 'Alagu Pandi', expected: 3000, balanceDue: 300000, term: 'Monthly', startDate: '2026-02-07', dueDay: 6, active: true, lastReceived: '2026-10-06' },
  ],
});

// ---- 31 Oct: this month's EMI and lending are already paid, next month's fall due on the 2nd-6th ----
let dat = mk(), all = computeAll(dat, { asOf: '2026-10-30' });
let up = upcoming(dat, all, 60);
const emi = up.find((u) => u.kind === 'Loan EMI' && /Home loan/.test(u.title));
ok(emi && emi.date === '2026-11-03' && emi.days === 4 && emi.ref === 'emi:l1|2026-11-03', 'an EMI paid this month is listed at next month’s date, with a stable ref');
ok(!/overdue|today/.test(emi.title), 'its wording is plain, not overdue');
const car = up.find((u) => /Car loan/.test(u.title));
ok(car && car.date === '2026-10-20' && car.days < 0 && /overdue/.test(car.title) && car.ref === 'emi:l2|2026-10-20', 'an EMI not paid this month is still overdue, and its ref is the same whatever the wording');
const pay = up.filter((u) => u.kind === 'Money to receive');
ok(pay.length === 2 && pay[0].date === '2026-11-05' && pay[0].amount === 5000 && pay[1].date === '2026-11-06', 'each lending payment received this month is listed individually at next month’s date');
ok(pay[0].ref === 'rc:r1|2026-11-05', 'lending items have a stable ref');

// ---- 1 Nov: nothing received yet this month ----
dat = mk(); all = computeAll(dat, { asOf: '2026-11-01' }); up = upcoming(dat, all, 60);
const due = up.filter((u) => u.kind === 'Money to receive');
ok(due.length === 2 && due.every((u) => u.days >= 4 && u.days <= 5), 'unreceived lending due this month is listed ahead of its day');
ok(due[0].ref === 'rc:r1|2026-11-05', 'the ref does not change between the next-month and this-month cases');

// ---- Home line follows the marks only, this month ----
let mc = monthCashflow(dat, all, '2026-11');
let line = mc.income.find((x) => x.name === 'Lending Pandi');
ok(line && line.expected === 8000 && line.received === 0, 'an old whole-amount “received” mark and a bank credit no longer count this month');
ok(line.payments && line.payments.length === 2 && line.payments.every((p) => !p.received) && line.payments[0].due === '2026-11-05', 'the line lists each payment behind it');
const r1 = () => dat.receivables.find((r) => r.id === 'r1');
markReceivedOn(r1(), all.asOf);
ok(r1().lastReceived === '2026-11-05' && r1().prevReceived === '2026-10-05', 'marked ahead of its due date it counts from the due date, and the old date is kept');
all = computeAll(dat, { asOf: '2026-11-01' }); mc = monthCashflow(dat, all, '2026-11'); line = mc.income.find((x) => x.name === 'Lending Pandi');
ok(line.received === 5000 && line.payments.find((p) => p.id === 'r1').received && !line.payments.find((p) => p.id === 'r2').received, 'marking one payment counts that payment only');
ok(receivableStatus(r1(), all.asOf).received, 'Money to receive shows the same payment as received');
markNotReceivedOn(r1(), all.asOf);
ok(r1().lastReceived === '2026-10-05' && r1().prevReceived === undefined, 'mark not received puts the old date back');
all = computeAll(dat, { asOf: '2026-11-01' }); mc = monthCashflow(dat, all, '2026-11'); line = mc.income.find((x) => x.name === 'Lending Pandi');
ok(line.received === 0 && !receivableStatus(r1(), all.asOf).received, 'both screens go back to not received');

// a record marked before the old date was kept goes back to last month’s due date
const r2 = dat.receivables.find((r) => r.id === 'r2'); r2.lastReceived = '2026-11-01';
markNotReceivedOn(r2, '2026-11-01');
ok(r2.lastReceived === '2026-10-06', 'without a kept date it goes back to last month’s due date');
const fresh = { id: 'r3', term: 'Monthly', expected: 1000, dueDay: 5, startDate: '2026-10-20', lastReceived: '2026-11-05' };
markNotReceivedOn(fresh, '2026-11-01');
ok(fresh.lastReceived === '', 'a line that only started last month goes back to nothing received');

// ---- past months are unchanged: the old mark and bank credits still count ----
mc = monthCashflow(dat, computeAll(dat, { asOf: '2026-11-01' }), '2026-10');
line = mc.income.find((x) => x.name === 'Lending Pandi');
ok(line && line.received === 8000, 'a past month still counts what the bank shows');

// ---- Investable balance interest follows the same marks ----
all = computeAll(dat, { asOf: '2026-11-01' });
const p0 = pendingToReceive(dat, all, monthCashflow(dat, all, '2026-11'));
markReceivedOn(dat.receivables[0], all.asOf); all = computeAll(dat, { asOf: '2026-11-01' });
const p1 = pendingToReceive(dat, all, monthCashflow(dat, all, '2026-11'));
ok(p1.total < p0.total, 'interest still to come drops when a payment is marked received');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
