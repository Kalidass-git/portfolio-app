// The allocation rules: priority order, fixed amounts or shares, excess to the last line. Plain numbers, no data file needed.
import { allocate, plannedShares, hasRules, modeOf, priorityOf } from '../js/allocation.js';
import { splitMonth } from '../js/monthinvest.js';
import { simulate } from '../js/projector.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b) => Math.abs(a - b) < 0.01;
const L = [
  { id: 'g', name: 'Gold', cls: 'gold', monthly: 75000, mode: 'amt', priority: 1 },
  { id: 's', name: 'Stocks', cls: 'shares', monthly: 50000, mode: 'amt', priority: 2 },
  { id: 'c', name: 'Chits', cls: 'chits', monthly: 25000, mode: 'amt', priority: 3 },
  { id: 'b', name: 'Bonds', cls: 'bonds', monthly: 300000, mode: 'pct', priority: 4 },
];
const by = (r) => Object.fromEntries(r.rows.map((x) => [x.name, Math.round(x.amount)]));
let r = allocate(200000, L);
ok(JSON.stringify(by(r)) === JSON.stringify({ Gold: 75000, Stocks: 50000, Chits: 25000, Bonds: 50000 }), 'case 1: ' + JSON.stringify(by(r)));
r = allocate(50000, L);
ok(JSON.stringify(by(r)) === JSON.stringify({ Gold: 50000, Stocks: 0, Chits: 0, Bonds: 0 }), 'case 2: ' + JSON.stringify(by(r)));
r = allocate(1000000, L);
ok(by(r).Bonds === 850000 && by(r).Gold === 75000, 'a share line takes what is left, even beyond its own amount ' + JSON.stringify(by(r)));
// case 3: every line fixed and money left over: the last line takes the excess
r = allocate(600000, L.map((l) => ({ ...l, mode: 'amt' })));
ok(by(r).Bonds === 450000 && Math.round(r.rows[3].extra) === 150000 && by(r).Gold === 75000, 'case 3: excess goes to the last line ' + JSON.stringify(by(r)));
ok(near(r.amounts.reduce((a, b) => a + b, 0), 600000), 'all the money is placed');
// the last line in the order, not the last listed
const M = [{ name: 'A', monthly: 10000, mode: 'amt', priority: 2 }, { name: 'B', monthly: 10000, mode: 'amt', priority: 1 }];
r = allocate(50000, M); ok(by(r).A === 40000 && by(r).B === 10000, 'excess goes to the last by priority');
// old plans: shares as before, priorities and modes absent
const old = [{ monthly: 10000 }, { monthly: 30000 }];
r = allocate(80000, old); ok(near(r.amounts[0], 20000) && near(r.amounts[1], 60000), 'plain shares'); ok(!hasRules(old) && hasRules(L), 'hasRules');
ok(modeOf({}) === 'pct' && modeOf({ mode: 'amt' }) === 'amt' && priorityOf({}) == null && priorityOf({ priority: '2' }) === 2 && priorityOf({ priority: 0 }) == null, 'mode and priority readers');
ok(allocate(-5, L).amounts.every((x) => x === 0) && allocate(100, []).left === 100, 'no money, no lines');
// unnumbered lines come after numbered ones, in the order listed
r = allocate(100000, [{ name: 'x', monthly: 60000, mode: 'amt' }, { name: 'y', monthly: 60000, mode: 'amt', priority: 2 }, { name: 'z', monthly: 60000, mode: 'amt', priority: 1 }]);
ok(r.rows.map((x) => x.name).join('') === 'zyx' && by(r).z === 60000 && by(r).y === 40000 && by(r).x === 0, 'order');
ok(near(plannedShares(L).rows.reduce((a, x) => a + x.share, 0), 1), 'planned shares add to 100%');

// Investing this month: targets follow the rules, done is shared by class
const sm = splitMonth({ actualIn: 300000, planIn: 0, actualOut: 100000, planOut: 100000, bank: 500000, lines: L, doneByClass: { gold: 30000 } });
ok(sm.investable === 200000 && Math.round(sm.rows[0].target) === 75000 && Math.round(sm.rows[3].target) === 50000, 'splitMonth targets');
ok(sm.rows.map((x) => x.name).join(',') === 'Gold,Stocks,Chits,Bonds' && Math.round(sm.rows[0].left) === 45000, 'splitMonth order and left');
// with no rules it behaves as before
const sm0 = splitMonth({ actualIn: 100000, planIn: 90000, actualOut: 40000, planOut: 60000, bank: 200000, lines: [{ id: 'a', name: 'Shares', cls: 'shares', monthly: 30000 }, { id: 'b', name: 'Bonds', cls: 'bonds', monthly: 10000 }], doneByClass: { shares: 10000 } });
ok(Math.round(sm0.rows[0].target) === 30000 && Math.round(sm0.rows[1].target) === 10000, 'splitMonth without rules');

// The projection uses the same rules
const oc = [{ id: 'steady', name: 'Steady', rate: 0.1 }];
const start = { values: { cash: 500000, gold: 0, shares: 0, bonds: 0, chits: 0, pf: 0 }, liab: 0, month: '2026-12' };
const a = { salary: 250000, expenses: 50000, emi: 0, tds: 0, growth: {}, hikeMonth: 4, oneOffs: [], rates: {}, outlook: {}, refillCash: false, invest: L.map((l) => ({ ...l })) };
const rows = simulate(start, a, oc, 1);
const inv = rows[0].investedBy;
ok(rows[0] && near(rows[0].invested, 200000) && near(inv.gold, 75000) && near(inv.shares, 50000) && near(inv.chits, 25000) && near(inv.bonds, 50000), 'simulate follows the rules: ' + JSON.stringify(inv));
console.log(bad ? bad + ' failed' : 'allocation tests passed');
process.exit(bad ? 1 : 0);
