import { matchBondCredits, bondPaysIn, bondDaysIn, bondNetIn, bondDueAmount, bondDueDate, daysInMonthOf, monthCashflow, incomeWindow, dueInMonth } from '../js/calc.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b) => Math.abs(a - b) < 0.01;
const b = { principal: 100000, rate: 0.1, depositDate: '2026-02-10', maturityDate: '2027-02-10', credit: 'Monthly' };
ok(daysInMonthOf('2026-02-01') === 28 && daysInMonthOf('2026-10-15') === 31, 'days in month');
ok(bondDaysIn(b, '2026-01') === 0, 'not bought yet');
ok(bondDaysIn(b, '2026-02') === 19, 'bought on the 10th: 10 Feb to 28 Feb is 19 days');
ok(bondDaysIn(b, '2026-03') === 31, 'full March');
ok(bondDaysIn(b, '2027-02') === 9, 'matures on the 10th: 9 days');
ok(near(bondNetIn(b, '2026-03', 0.1), 100000 * 0.1 / 365 * 31 * 0.9), '31 days, not 30');
ok(near(bondNetIn(b, '2026-04', 0.1), 100000 * 0.1 / 365 * 30 * 0.9), '30 days');
ok(!(near(bondNetIn(b, '2026-03', 0.1), bondNetIn(b, '2026-04', 0.1))), 'months differ');
const q = { ...b, credit: 'Quarterly', depositDate: '2025-01-01' };
ok(bondDueAmount(q, '2026-02') === 0, 'quarterly pays nothing in Feb');
ok(near(bondDueAmount(q, '2026-01'), [30, 31, 31].reduce((t, d) => t + 100000 * 0.1 / 365 * d * 0.9, 0)), 'quarterly pays the three months ending in the payout month');
const q2 = { ...q, quarterMonth: 2 };
ok(bondDueAmount(q2, '2026-01') === 0 && bondPaysIn(q2, '2026-03') && bondPaysIn(q2, '2026-12'), 'payout months can be Mar/Jun/Sep/Dec');
ok(near(bondDueAmount(q2, '2026-06'), [30, 31, 30].reduce((t, d) => t + 100000 * 0.1 / 365 * d * 0.9, 0)), 'Apr+May+Jun');
const qe = { ...q2, maturityDate: '2026-11-20' };
ok(bondPaysIn(qe, '2026-11') && near(bondDueAmount(qe, '2026-11'), 100000 * 0.1 / 365 * (31 + 19) * 0.9), 'final month pays the leftover since the last payout (Oct, 1-19 Nov)');
const per = [{ name: 'Annapurna_Dec23_Apr29', company: 'Annapurna', due: '2026-10-24', expected: 3000 }, { name: 'KeerthanaFinServ_Sep27', company: 'Keertana', due: '2026-10-22', expected: 1835 }, { name: 'Navi_Jul26_Nov32', company: 'Navi', due: '2026-10-28', expected: 2500 }];
matchBondCredits([{ credit: 1835, desc: 'NEFT whatever' }], per);
ok(per[1].received === 1835 && per[0].received === 0 && per[2].pending === 2500, 'an exact amount goes to its bond, not the first by date');
const per2 = [{ name: 'Navi_Jul26', company: 'Navi', due: '2026-10-28', expected: 2500 }, { name: 'X', company: 'Y', due: '2026-10-22', expected: 2000 }];
matchBondCredits([{ credit: 2300, desc: 'NAVI NBFC interest' }], per2);
ok(per2[0].received === 2300 && per2[1].received === 0, 'a name in the description wins over due order');
const per3 = [{ name: 'Late', due: '2026-10-28', expected: 2000 }, { name: 'Early', due: '2026-10-05', expected: 1000 }];
matchBondCredits([{ credit: 3000, date: '2026-10-06', desc: 'interest' }], per3);
ok(per3[1].received === 1000 && per3[0].received === 0 && per3[0].pending === 2000, 'money that came on the 6th is not set against a bond due on the 28th');
const c = { ...b, closed: { date: '2026-04-15' } };
ok(bondDaysIn(c, '2026-04') === 14 && bondDaysIn(c, '2026-05') === 0, 'closed bond stops earning');
const paid = { ...b, payoutAmount: 800 };
ok(bondNetIn(paid, '2026-03') === 800 && bondNetIn(paid, '2026-02') !== 800, 'entered payout wins for a full month only');
ok(bondDueDate({ dueRule: 'first' }, '2026-02') === '2026-02-01' && bondDueDate({ dueRule: 'last' }, '2026-02') === '2026-02-28' && bondDueDate({ dueRule: 'day', dueDay: 31 }, '2026-02') === '2026-02-28', 'due dates');
// a payment cannot fall due before the money went in: bought on the 12th, pays on the 9th -> first pays next month, with the days since it was bought
const late = { principal: 200000, rate: 0.1, depositDate: '2026-10-12', maturityDate: '2029-01-31', credit: 'Monthly', dueRule: 'day', dueDay: 9 };
ok(bondDueAmount(late, '2026-10') === 0, 'nothing due in October, the 9th was before the purchase');
ok(near(bondDueAmount(late, '2026-11'), 200000 * 0.1 / 365 * (20 + 30) * 0.9), 'November pays the 20 days of October and the 30 of November');
const ahead = { ...late, dueDay: 20 };
ok(near(bondDueAmount(ahead, '2026-10'), 200000 * 0.1 / 365 * 20 * 0.9) && near(bondDueAmount(ahead, '2026-11'), 200000 * 0.1 / 365 * 30 * 0.9), 'due after the purchase: pays in the month it was bought');
// two bonds with almost the same interest: each credit goes to the nearest bond, not the first one that fits
const per4 = [{ name: 'A', due: '2026-10-13', expected: 1590 }, { name: 'B', due: '2026-10-13', expected: 1643 }, { name: 'C', due: '2026-10-15', expected: 1643 }, { name: 'D', due: '2026-10-18', expected: 1605 }];
matchBondCredits([{ credit: 1643, date: '2026-10-15', desc: 'x' }, { credit: 1605, date: '2026-10-18', desc: 'x' }, { credit: 1590, date: '2026-10-13', desc: 'x' }, { credit: 1643, date: '2026-10-13', desc: 'x' }], per4);
ok(per4.every((x) => near(x.received, x.expected)), 'every bond gets its own credit: ' + per4.map((x) => x.received).join(','));
// a credit never settles a bond that is not yet due, whichever rule finds it
const per5 = [{ name: 'Later', company: 'Zeta', due: '2026-10-28', expected: 1758 }];
matchBondCredits([{ credit: 1758, date: '2026-10-02', desc: 'ZETA interest' }], per5);
ok(per5[0].received === 0 && per5[0].pending === 1758, 'money that came on the 2nd does not pay a bond due on the 28th, even with the same amount and name');
// Home: other "Income Bond" credits in the month (a quarterly bond paid early) must not hide a bond still to come
const mk = (name, dueDay, rule = 'day') => ({ id: name, name, company: name, holder: 'H', principal: 200000, rate: 0.1, depositDate: '2025-01-01', maturityDate: '2030-01-01', credit: 'Monthly', dueRule: rule, dueDay });
const bonds = [mk('One', 5), mk('Two', 24)];
const e1 = Math.round(bondDueAmount(bonds[0], '2026-10') * 100) / 100;
const dat = { settings: { tdsRate: 0.1 }, categories: [{ name: 'Income Bond', kind: 'income' }], ledger: [{ date: '2026-10-05', desc: 'One', category: 'Income Bond', credit: e1, debit: 0 }, { date: '2026-10-02', desc: 'quarterly bond', category: 'Income Bond', credit: 20000, debit: 0 }], bonds, receivables: [], manualMonthlyIncome: [], lending: [], fds: [] };
const mc = monthCashflow(dat, { bonds, closed: { bonds: [] }, asOf: '2026-10-21' }, '2026-10');
ok(mc.income[0].bonds.filter((x) => x.pending > 1).map((x) => x.name).join() === 'Two' && mc.yetToReceive > 1, 'bond Two stays pending: ' + mc.yetToReceive);
ok(mc.income[0].name === 'Income Bond' && near(mc.income[0].received, e1) && near(mc.income[0].bonds.find((x) => x.name === 'One').credited, e1), 'bond One is received (its due date passed) and the bank credit that paid it is kept as credited');
// received follows the due date, not the bank: no bank entry at all, still received once due; due later, still pending
const none = monthCashflow({ ...dat, ledger: [] }, { bonds, closed: { bonds: [] }, asOf: '2026-10-21' }, '2026-10');
ok(near(none.income[0].received, e1) && none.income[0].bonds.find((x) => x.name === 'Two').pending > 1 && none.income[0].bonds.find((x) => x.name === 'One').pending === 0, 'received by due date alone: One yes, Two (due the 24th) no');
const onDay = monthCashflow({ ...dat, ledger: [] }, { bonds, closed: { bonds: [] }, asOf: '2026-10-24' }, '2026-10');
ok(onDay.income[0].bonds.every((x) => x.pending === 0) && onDay.yetToReceive < 1, 'on the due day itself the bond counts as received');
const early = monthCashflow({ ...dat, ledger: [{ date: '2026-10-02', desc: 'Two', category: 'Income Bond', credit: 99999, debit: 0 }] }, { bonds, closed: { bonds: [] }, asOf: '2026-10-21' }, '2026-10');
ok(early.income[0].bonds.find((x) => x.name === 'Two').pending > 1, 'a bank credit, early or large, does not make a bond not yet due received');
// monthly lending lines: several loans share one name, so the amount says which one an income line is
const recs = [{ id: 'r1', name: 'Pat Lee', expected: 8750, startDate: '2025-08-01', active: true, lastReceived: '2026-10-01' }, { id: 'r2', name: 'Pat Lee', expected: 17500, startDate: '2026-09-19', active: true, lastReceived: '2026-10-19' }];
const w = incomeWindow({ receivables: recs }, { name: 'Pat Lee', amount: 17500 });
ok(w.starts === '2026-09-19' && w.recs.length === 1, 'the 17,500 line starts with the 17,500 loan, not the first loan of that name');
const d2 = { settings: { tdsRate: 0.1 }, categories: [], ledger: [], bonds: [], receivables: recs, manualMonthlyIncome: [{ name: 'Pat Lee', amount: 8750, match: 'x' }, { name: 'Pat Lee', amount: 17500, match: 'x' }], lending: [], fds: [] };
const a2 = { bonds: [], closed: { bonds: [] }, asOf: '2026-10-21' };
const sep = monthCashflow(d2, a2, '2026-09').income.map((x) => x.expected), oct = monthCashflow(d2, a2, '2026-10').income;
ok(sep.length === 2 && sep[1] === 8750, 'September expects only the first loan: ' + sep);
ok(oct.length === 3 && oct[2].expected === 7000 && oct[2].received === 7000 && oct[1].received === 8750, 'October: the 17,500 loan was lent on the 19th, so its first payment covers 12 of 30 days (7,000); each line received once: ' + oct.map((x) => x.expected + '/' + x.received));
// pro-rata first payment and later months in full
const lend = { name: 'Lathish', expected: 6250, startDate: '2025-12-07', active: true };
ok(dueInMonth(lend, '2025-12') === 0 && dueInMonth(lend, '2026-01') === Math.round(6250 * 25 / 31) && dueInMonth(lend, '2026-02') === 6250, 'lent on 7 Dec: nothing in Dec, 25/31 in Jan, full from Feb');
ok(dueInMonth({ expected: 3500, startDate: '2025-11-01', active: true }, '2025-12') === 3500, 'lent on the 1st: the whole month is paid the next month');
ok(dueInMonth({ expected: 3394, startDate: '2024-04-01', active: false, lastReceived: '2026-09-20' }, '2026-11') === 0, 'a closed line pays nothing after it closed');
ok(dueInMonth({ expected: 60000, term: 'Yearly', startDate: '2026-08-30' }, '2026-10') === 0, 'yearly lines are not monthly income');
// a line named "Lending Pandi" still finds the four loans of "Alagu Pandi" and does not appear before they started
const pandi = [{ name: 'Alagu Pandi', expected: 8750, startDate: '2025-08-01', active: true }, { name: 'Alagu Pandi', expected: 17500, startDate: '2026-09-19', active: true, lastReceived: '2026-10-19' }];
const pd = { settings: {}, categories: [], ledger: [], bonds: [], receivables: pandi, lending: [], fds: [], manualMonthlyIncome: [{ name: 'Lending Pandi', amount: 17500, match: 'x' }] };
const pa = { bonds: [], closed: { bonds: [] }, asOf: '2026-10-21' };
ok(['2026-06', '2026-07', '2026-09'].every((m) => monthCashflow(pd, pa, m).income.filter((x) => !x.bonds).length === 0), 'a differently named line: nothing in June, July or September, before the 17,500 loan started');
ok(monthCashflow(pd, pa, '2026-10').income[1].expected === 7000, 'October shows the part month, 7,000');
const agg = { ...pd, manualMonthlyIncome: [{ name: 'Lending Pandi', amount: 26250, match: 'x' }] };
ok(monthCashflow(agg, pa, '2026-08').income[1].expected === 8750 && monthCashflow(agg, pa, '2026-10').income[1].expected === 8750 + 7000 && monthCashflow(agg, pa, '2026-11').income[1].expected === 26250, 'one line for the whole person adds each loan from its own start');
const lat = { settings: {}, categories: [], ledger: [{ id: 1, acct: 'a', date: '2026-01-06', desc: 'lathish', category: 'Income Lending', credit: 5000, debit: 0 }], bonds: [], receivables: [lend], lending: [], fds: [], manualMonthlyIncome: [{ name: 'Lending Lathish', amount: 6250, match: 'lathish' }] };
const jan = monthCashflow(lat, pa, '2026-01').income[1];
ok(jan.expected === 5040 && jan.received === 5000 && jan.expected - jan.received === 40, 'January expects the pro-rated 5,040 and 5,000 came: ' + jan.expected + '/' + jan.received);
// Budget (expected) must never be below what actually came in: the total has to add up from its lines.
const ex = monthCashflow({ ...lat, ledger: [{ id: 1, acct: 'a', date: '2026-01-06', desc: 'lathish', category: 'Income Lending', credit: 6250, debit: 0 }] }, pa, '2026-01');
ok(ex.income.every((x) => x.expected >= x.received) && ex.totalExpected >= ex.totalReceived && Math.abs(ex.totalExpected - ex.income.reduce((a, x) => a + x.expected, 0)) < 0.01, 'expected is never below received, and the total adds up');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
