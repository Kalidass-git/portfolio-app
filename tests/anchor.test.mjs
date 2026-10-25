// Plans start from a month-end net worth: month-end anchor, snapshots only, no loans in the projection, FDs only.
// node tests/anchor.test.mjs <path-to-data-json>   (works on any data file that has bonds, lending, FDs and a bank ledger)
import fs from 'node:fs';
import * as C from '../js/calc.js';
import * as P from '../js/projector.js';
import * as PL from '../js/planner.js';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
data.projector = { years: {}, snapshots: [] };
const all = C.computeAll(data, { asOf: '2026-10-24', useLive: false });
const oc = P.cfg(data).outlooks;
let fail = 0;
const ok = (label, cond, info = '') => { if (!cond) fail++; console.log(cond ? 'ok  ' : 'FAIL', label, info); };

ok('this year starts from last month end, next year from December', PL.defaultAnchor(all, 2026) === '2026-09' && PL.defaultAnchor(all, 2027) === '2026-12');
ok('anchor choices run from December before up to last month end', PL.anchorOptions(all, 2026)[0] === '2025-12' && PL.anchorOptions(all, 2026).slice(-1)[0] === '2026-09');
const plan = PL.freshPlan(data, all, 2026);
ok('fresh plan starts at September with a net worth', plan.initial.asOfMonth === '2026-09' && plan.initial.net > 0);
ok('interest is worked out from holdings by default (no typed figure)', plan.a.interestMonthly === null);
PL.commit(plan, 'first', oc); data.projector.years['2026'] = plan;
const e = PL.effective(plan, 'live'), path = PL.planPath(e, oc);
ok('plan covers October to December only', path.length === 3 && path[0].month === '2026-10' && path[2].month === '2026-12', path.map((r) => r.month).join());
ok('no adjustment line when interest comes from holdings', path.every((r) => !(r.interestBy && r.interestBy.adj)));
ok('no loan paydown in any month', path.every((r) => r.loanPaid === undefined) && path.every((r) => r.liab === e.initial.liab));
ok('FDs hold fixed deposits only', Math.abs(P.baseline(data, all).values.fds - all.fds.reduce((a, x) => a + x.value, 0)) < 1);
ok('baseline still adds up to total assets', Math.abs(Object.values(P.baseline(data, all).values).reduce((a, b) => a + b, 0) - all.totalAssets) < 1);
const typed = PL.simAssumptions({ ...plan.a, interestMonthly: 50000 }, 2026), pt = P.simulate(e.start, typed, oc, 1)[0];
ok('a typed interest figure still works and is labelled as an adjustment', Math.abs(pt.interest - 50000) < 1 && pt.interestBy.adj && P.labelOf('adj') === 'Adjustment to your expected figure');
ok('invested lines are kept per plan line', path.some((r) => r.investedLines && r.investedLines.length));

// nothing but the plan's own snapshots count; today's holdings are never mixed in
let t = PL.yearTrack(data, all, e, oc);
ok('every month is projected until a snapshot exists', t.rows.length === 3 && t.rows.every((r) => r.src === 'projected') && t.from.month === '2026-09');
ok('projection with no snapshot equals the plan', Math.abs(t.projected - t.target) < 1);
data.projector.snapshots.push({ id: 'old', month: '2026-05', date: '2026-06-02', net: 1, assets: 1, loans: 0, classes: { cash: 1 } });
t = PL.yearTrack(data, all, e, oc);
ok('a snapshot from before the plan is ignored', t.rows.every((r) => r.src === 'projected') && Math.abs(t.projected - t.target) < 1);
const snap = PL.makeSnapshot(data, all, '2026-10', '', oc); data.projector.snapshots.push(snap);
t = PL.yearTrack(data, all, e, oc);
ok('October snapshot makes October actual, rest projected from it', t.rows[0].src === 'actual' && t.rows[1].src === 'projected' && t.from.month === '2026-10' && t.rows[0].nw === snap.net);
const r = t.rows[0];
ok('actual month: net worth adds up with no loan term', Math.abs(r.open.nw + r.leftSpan + r.pfSpan + r.growth - r.nw) < 1);
ok('actual month carries interest and other income by category', Array.isArray(r.interestByCat) && Array.isArray(r.otherByCat) && Math.abs(r.interestByCat.reduce((a, x) => a + x.amount, 0) - r.interest) < 1);
ok('starting split is not real, so growth is not split by class', r.open.real === false && snap.growth.real === false);
ok('a plan with a snapshot inside it cannot be deleted', !PL.canDeletePlan(data, 2026));

// next year starts from December of this one
const sug = PL.suggestStart(data, all, 2027, '2026-12', oc);
ok('plan 2027 suggests the end of the 2026 plan', sug.source === 'plan' && Math.abs(sug.net - Math.round(t.rows[2].nw)) <= 1, sug.source + ' ' + sug.net);
const p27 = PL.freshPlan(data, all, 2027);
ok('plan 2027 starts at December 2026 and runs twelve months', p27.initial.asOfMonth === '2026-12' && PL.planPath(PL.effective(p27, 'working'), oc).length === 12);
data.projector.snapshots.push({ id: 's2026-12', month: '2026-12', date: '2027-01-02', net: 12345678, assets: 14845678, loans: 2500000, classes: { cash: 14845678 } });
ok('a saved December snapshot beats the projection', PL.suggestStart(data, all, 2027, '2026-12', oc).source === 'snapshot' && PL.suggestStart(data, all, 2027, '2026-12', oc).net === 12345678);
process.exit(fail ? 1 : 0);
