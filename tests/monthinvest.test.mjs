import { splitMonth, chitPending, expenseProjection, chitMonths } from '../js/monthinvest.js';
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
const pj = expenseProjection({ spend: [{ name: 'Groceries & needs', amount: 10000 }, { name: 'Rent', amount: 20000 }, { name: 'Medical', amount: 2000 }] }, '2026-10-10');
ok(pj.left === 21 && Math.round(pj.total) === 25200 && pj.rows.length === 2, 'projection skips rent: (10000+2000)/10*21');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
