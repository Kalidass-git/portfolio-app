// Allocation goal maths. Uses made-up numbers only: node tests/allocgoal.test.mjs
import * as I from '../js/insights.js';
import * as C from '../js/calc.js';
let fail = 0;
const ok = (label, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'ok  ' : 'FAIL', label, extra); };
const near = (a, b, t = 0.05) => Math.abs(a - b) <= t;
const now = [
  { key: 'bonds', value: 170, rate: 0.08 }, { key: 'lending', value: 100, rate: 0.1 }, { key: 'safe', value: 600, rate: 0.07 }, { key: 'chits', value: 130, rate: 0.08 },
  { key: 'equity', value: 500, rate: 0.1 }, { key: 'gold', value: 300, rate: 0.08 }, { key: 'other', value: 200, rate: 0.03 },
]; // total 2000: debt 1000 (bonds 17%), equity 500, gold 300, other 200
const r = I.resolveGoal({ groupTargets: { debt: 50, equity: 25 }, subTargets: { bonds: 25 } }, now);
ok('set groups keep what was typed', r.groups.debt === 50 && r.groups.equity === 25);
ok('blank groups share the rest by current mix (gold 300 : other 200 of 25%)', near(r.groups.gold, 15) && near(r.groups.other, 10), JSON.stringify(r.groups));
ok('overall shares add to 100', near(Object.values(r.items).reduce((a, b) => a + b, 0), 100));
ok('bonds 25% of the debt group = 12.5% overall', near(r.items.bonds, 12.5) && near(r.within.bonds, 25));
ok('other debt rows follow their current mix inside the group', near(r.within.lending, 75 * 100 / 830) && near(r.within.safe, 75 * 600 / 830) && near(r.within.chits, 75 * 130 / 830), JSON.stringify(r.within));
ok('valid goal has no errors', r.ok);
ok('groups above 100% are refused', !I.resolveGoal({ groupTargets: { debt: 70, equity: 40 } }, now).ok);
ok('rows above 100% inside a group are refused', !I.resolveGoal({ groupTargets: { debt: 50 }, subTargets: { bonds: 60, lending: 60 } }, now).ok);
ok('all four set but not 100 is refused', !I.resolveGoal({ groupTargets: { debt: 40, gold: 10, equity: 20, other: 10 } }, now).ok);
ok('nothing typed keeps today\'s mix', near(I.resolveGoal({ groupTargets: {}, subTargets: {} }, now).groups.debt, 50));
const old = I.normGoal({ targets: { bonds: 10, lending: 5, safe: 15, equity: 45, gold: 10, chits: 5, other: 10 } });
ok('an older goal is converted', old.groupTargets.debt === 35 && old.groupTargets.equity === 45 && Math.abs(old.subTargets.bonds - 28.6) < 0.1);
const p = I.allocPath(now, I.resolveGoal({ groupTargets: { equity: 40 } }, now).items, 50);
ok('path reaches a goal by adding money', p.reached != null && p.reached > 0, 'months ' + p.reached);
ok('a bigger monthly amount is faster', (I.allocPath(now, I.resolveGoal({ groupTargets: { equity: 40 } }, now).items, 200).reached || 0) < p.reached);
const m = I.monthlyFor(now, I.resolveGoal({ groupTargets: { equity: 40 } }, now).items, 3);
ok('monthly needed for 3 years actually reaches it', m != null && (I.allocPath(now, I.resolveGoal({ groupTargets: { equity: 40 } }, now).items, m).reached || 999) <= 36, 'needs ' + m);
// group XIRR never lands far outside its rows
const T = (d) => C.toMs(d);
const rowA = { xirr: 0.12, value: 100, flows: [{ t: T('2024-01-01'), amount: -100 }, { t: T('2026-01-01'), amount: 125 }] };
const rowB = { xirr: 0.08, value: 100, flows: [{ t: T('2024-01-01'), amount: -100 }, { t: T('2026-01-01'), amount: 117 }] };
const g = C.groupXirr([rowA, rowB]);
ok('group XIRR sits between its rows', g.xirr > 0.07 && g.xirr < 0.13, g.xirr.toFixed(3));
const bad = C.groupXirr([{ xirr: 0.12, value: 100, flows: [{ t: T('2024-01-01'), amount: -100 }, { t: T('2025-01-01'), amount: 300 }, { t: T('2026-01-01'), amount: -150 }] }, { xirr: 0.08, value: 100, flows: [{ t: T('2024-01-01'), amount: -10 }, { t: T('2026-01-01'), amount: 11 }] }]);
ok('a far-off combined rate falls back to the weighted average', bad.xirr > 0.07 && bad.xirr < 0.13 && bad.approx === true, String(bad.xirr));
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
