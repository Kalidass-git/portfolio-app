import { splitMonth, chitPending, expenseProjection, chitMonths, chitCards, chitOrganiser } from '../js/monthinvest.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const lines = [{ id: 'a', name: 'Shares', cls: 'shares', monthly: 30000 }, { id: 'b', name: 'Bonds', cls: 'bonds', monthly: 10000 }];
// income 100k, spending so far 40k but 60k expected: 40k left, split 75/25
let r = splitMonth({ actualIn: 100000, planIn: 90000, actualOut: 40000, planOut: 60000, bank: 200000, lines, doneByClass: { shares: 10000 } });
ok(r.income === 100000 && r.spend === 60000, 'higher of actual and plan');
ok(r.moreSpend === 20000 && r.investable === 40000, 'remaining spend and investable');
ok(Math.round(r.rows[0].target) === 30000 && Math.round(r.rows[0].left) === 20000, 'shares line');
ok(Math.round(r.stillToInvest) === 30000, 'still to invest');
ok(r.investNow === 30000 && !r.notEnough, 'bank can pay');
// bank low
r = splitMonth({ actualIn: 100000, planIn: 0, actualOut: 40000, planOut: 60000, bank: 30000, lines, doneByClass: {} });
ok(r.bankFree === 10000 && r.investNow === 10000 && r.notEnough, 'bank holds back the spending still expected');
// a tax month: nothing left
r = splitMonth({ actualIn: 100000, planIn: 100000, actualOut: 150000, planOut: 60000, bank: 500000, lines, doneByClass: {} });
ok(r.investable === 0 && r.stillToInvest === 0, 'tax month invests nothing');
// money into a class with no line is reported
r = splitMonth({ actualIn: 100000, planIn: 0, actualOut: 0, planOut: 0, bank: 0, lines, doneByClass: { gold: 5000 } });
ok(r.unplanned.length === 1 && r.unplanned[0].cls === 'gold', 'unplanned');
const cp = chitPending({ savings: [{ type: 'Chit', name: 'A', entries: [{ date: '2026-09-05', amount: 5000 }], maturityDate: '2026-12-15' }, { type: 'Chit', name: 'Done', entries: [{ date: '2026-09-05', amount: 5000 }], chitMonths: 1 }, { type: 'Chit', name: 'Ended', entries: [{ date: '2026-09-05', amount: 900 }], maturityDate: '2026-09-30' }, { type: 'Chit', name: 'Paid', entries: [{ date: '2026-09-05', amount: 900 }, { date: '2026-10-05', amount: 900 }] }], gold: { chits: [{ name: 'G', months: 11, entries: [{ date: '2026-09-02', amount: 3000 }] }] } }, '2026-10');
ok(cp.rows.length === 3 && cp.chits === 5000 && cp.gold === 3000 && cp.total === 8000, 'pending chits: running, finished by count, ended by date and paid are handled');
ok(chitMonths({ tenure: 2, tenureType: 'Years' }, 'chit') === 24 && chitMonths({ months: 11 }, 'gold') === 11, 'chit duration');
ok(chitMonths({ tenure: 20, tenureType: 'Months', chitMonths: 11 }, 'chit') === 20, 'tenure wins over an old duration');
ok(chitMonths({}, 'gold') === 11 && chitMonths({}, 'gold', 9) === 9 && chitMonths({ months: 6 }, 'gold') === 6, 'gold chits run 11 months unless the setting or an old per-chit length says otherwise');
ok(chitMonths({ startDate: '2026-01-10', maturityDate: '2026-12-20' }, 'chit') === 12 && chitMonths({ chitMonths: 9 }, 'chit') === 9, 'chits: dates, and an old duration when nothing else is set');
// paid this month = done, whatever the amount; a running gold scheme counts; 11 months over = not pending
const base = { settings: {}, savings: [{ type: 'Chit', name: 'Chit paid more', entries: [{ date: '2026-09-05', amount: 5000 }, { date: '2026-10-07', amount: 6500 }], chitMonths: 20 }, { type: 'Chit', name: 'Chit open', entries: [{ date: '2026-09-05', amount: 2000 }], chitMonths: 20 }],
  gold: { chits: [{ name: 'Gold running', startDate: '2026-02-01', entries: [{ date: '2026-09-02', amount: 3000 }] }, { name: 'Gold over', startDate: '2025-10-01', entries: [{ date: '2026-09-02', amount: 3000 }] }, { name: 'Gold last month', startDate: '2025-11-01', entries: [{ date: '2026-09-02', amount: 3000 }, { date: '2026-10-02', amount: 3500 }] }],
    schemes: [{ name: 'GRT scheme', active: true, entries: [{ date: '2026-09-12', amount: 4000 }] }, { name: 'Old scheme', active: false, entries: [{ date: '2026-09-12', amount: 4000 }] }] } };
const mp = chitPending(base, '2026-10');
ok(mp.done.map((r) => r.name).sort().join() === 'Chit paid more,Gold last month' && mp.paidTotal === 10000, 'paid this month, any amount, is done: ' + mp.done.map((r) => r.name));
ok(mp.pending.map((r) => r.name).sort().join() === 'Chit open,GRT scheme,Gold running' && mp.total === 9000 && mp.gold === 7000 && mp.chits === 2000, 'pending: open chit, gold chit and the running GRT scheme; the old scheme and the 12-month-old gold chit are not: ' + mp.pending.map((r) => r.name));
ok(chitPending({ ...base, settings: { goldChitMonths: 14 } }, '2026-10').pending.some((r) => r.name === 'Gold over'), 'a longer gold chit length brings it back');
// chit cards: due this month, paid this month, and next month projected from the last three payments, grouped by organiser
const cd = { settings: {}, savings: [
  { type: 'Chit', name: '5L_Ravi', organiser: '', tenure: 20, tenureType: 'Months', entries: [{ date: '2026-07-05', amount: 4000 }, { date: '2026-08-05', amount: 4500 }, { date: '2026-09-05', amount: 5000 }, { date: '2026-10-07', amount: 5200 }] },
  { type: 'Chit', name: '10L_Ravi', tenure: 20, tenureType: 'Months', entries: [{ date: '2026-08-05', amount: 9000 }, { date: '2026-09-05', amount: 9500 }] },
  { type: 'Chit', name: 'Sri chit', organiser: 'Sri Fin', maturityDate: '2026-10-30', entries: [{ date: '2026-09-05', amount: 1000 }] },
  { type: 'Chit', name: 'Last one', organiser: 'Sri Fin', tenure: 3, tenureType: 'Months', entries: [{ date: '2026-08-05', amount: 700 }, { date: '2026-09-05', amount: 700 }, { date: '2026-10-05', amount: 700 }] }], gold: { chits: [] } };
const cc = chitCards(cd, '2026-10');
ok(chitOrganiser(cd.savings[0]) === 'Ravi' && chitOrganiser(cd.savings[1]) === 'Ravi' && chitOrganiser(cd.savings[2]) === 'Sri Fin', 'organiser from the name or the field');
ok(cc.dueTotal === 9500 + 1000 && cc.paidTotal === 5200 + 700, 'due: the chits not paid yet (10L_Ravi and Sri chit); paid: the two that were: ' + cc.dueTotal + '/' + cc.paidTotal);
ok(cc.dueByOrg.map((g) => g.org + ':' + g.amount).join() === 'Ravi:9500,Sri Fin:1000' && cc.paidByOrg[0].org === 'Ravi' && cc.paidByOrg[0].amount === 5200, 'grouped by organiser');
// next month: 5L_Ravi = avg(4500,5000,5200) = 4900; 10L_Ravi = avg(9000,9500) = 9250 (owes October, then runs on); Sri chit ends in October; Last one has paid its 3 months
ok(cc.next === '2026-11' && cc.proj.map((r) => r.name + ':' + r.amount).sort().join() === '10L_Ravi:9250,5L_Ravi:4900' && cc.projTotal === 14150, 'projection, finished and ending chits left out: ' + cc.proj.map((r) => r.name + ':' + r.amount));
ok(cc.projByOrg.length === 1 && cc.projByOrg[0].org === 'Ravi' && cc.projByOrg[0].amount === 14150, 'projection grouped by organiser');
const pj = expenseProjection({ spend: [{ name: 'Groceries & needs', amount: 10000 }, { name: 'Rent', amount: 20000 }, { name: 'Medical', amount: 2000 }] }, '2026-10-10');
ok(pj.left === 21 && Math.round(pj.total) === 25200 && pj.rows.length === 2, 'projection skips rent: (10000+2000)/10*21');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
