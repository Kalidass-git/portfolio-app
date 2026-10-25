import fs from 'node:fs';
import * as C from '../js/calc.js';
import * as P from '../js/projector.js';
import * as PL from '../js/planner.js';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const all = C.computeAll(data, { asOf: '2026-10-11', useLive: false });
let fail = 0;
const ok = (label, cond, info = '') => { if (!cond) fail++; console.log(cond ? 'ok  ' : 'FAIL', label, info); };
const oc = P.cfg(data).outlooks;
ok('old plans are listed as legacy', PL.legacyYears(data).includes('2026'));
const plan = PL.freshPlan(data, all, 2026);
ok('fresh plan is a draft', PL.isV2(plan) && !plan.live && PL.effective(plan, 'live') === null);
ok('salary taken from the last full month', plan.a.salary === 150000 && plan.a.salaryMonth === '2026-09', plan.a.salary + ' ' + plan.a.salaryMonth);
ok('old plan one-offs carried over', plan.a.oneOffs.some((o) => o.name === 'Tax'));
const w = PL.effective(plan, 'working'), path = PL.planPath(w, oc);
ok('plan runs from the month after its start to December', path.length === 3 && path[0].month === '2026-10' && path[2].month === '2026-12');   // made in October: starts from September's end
ok('start is the end of last month', w.start.month === '2026-09');
const rec = PL.commit(plan, 'first', oc);
ok('first commit is revision 1', rec.rev === 1 && plan.live.rev === 1 && rec.kind === 'first' && plan.revisions.length === 1);
ok('not dirty right after commit', !PL.isDirty(plan) && PL.commit(plan, '', oc) === null);
plan.a.salary = 170000; plan.a.growth.salary = 0.1; plan.a.oneOffs.push({ id: 'o9', name: 'Trip', kind: 'expense', month: '2026-12', amount: 50000 });
ok('dirty after an edit', PL.isDirty(plan));
const live1 = PL.planTarget(PL.effective(plan, 'live'), oc), work1 = PL.planTarget(PL.effective(plan, 'working'), oc);
ok('live copy unchanged by edits, working copy moves', work1 > live1 - 1e9 && live1 !== work1, `${Math.round(live1)} ${Math.round(work1)}`);
const r2 = PL.commit(plan, 'hike', oc);
ok('revision 2 lists what changed', r2.rev === 2 && r2.changes.some((c) => c.l === 'Expected salary' && c.from === 150000 && c.to === 170000) && r2.changes.some((c) => /Trip/.test(c.l) && c.t === 'added'), r2.changes.map((c) => c.l).join('; '));
plan.a.salary = 1; PL.discardChanges(plan);
ok('discard restores the live copy', plan.a.salary === 170000 && !PL.isDirty(plan));
// typed interest figure replaces the holdings level
const a0 = PL.simAssumptions({ ...plan.a, interestMonthly: 50000 }, 2026), a1 = PL.simAssumptions({ ...plan.a, interestMonthly: null }, 2026);
const s = { ...PL.effective(plan, 'live').start, month: '2025-12' };   // pure projection checks run from December, a full calendar year
ok('typed interest is paid in month 1', Math.abs(P.simulate(s, a0, oc, 1)[0].interest - 50000) < 1, Math.round(P.simulate(s, a0, oc, 1)[0].interest) + ' vs ' + Math.round(P.simulate(s, a1, oc, 1)[0].interest));
// a hike already behind the salary month is not applied twice
const hk = { ...plan.a, hikeMonth: 4, salaryMonth: '2026-09', growth: { ...plan.a.growth, salary: 0.1 }, otherIncome: 0 };
const rows = P.simulate(s, PL.simAssumptions(hk, 2026), oc, 12);
ok('salary after the hike month equals the figure when it was taken after the hike', Math.abs(rows[8].salary - 170000) < 1 && Math.abs(rows[11].salary - 170000) < 1, Math.round(rows[3].salary) + ' ' + Math.round(rows[8].salary));
ok('months before the hike month are scaled down', rows[0].salary < 170000, Math.round(rows[0].salary));
// per-item rise
const ones = [{ id: 'x', name: 'Fees', kind: 'expense', month: '04', amount: 100000, rise: 0.2 }];
const nx = P.simulate(s, { ...PL.simAssumptions(plan.a, 2026), oneOffs: ones }, oc, 24);
ok('yearly item rises at its own rate in the next year', Math.abs(nx[15].oneOut - 120000) < 1 && Math.abs(nx[3].oneOut - 100000) < 1, Math.round(nx[3].oneOut) + ' ' + Math.round(nx[15].oneOut));
// year track (from the plan's start month; snapshots inside the plan are actual, everything else projected)
data.projector.years['2026'] = plan;
const lv = PL.effective(plan, 'live');
const track0 = PL.yearTrack(data, all, lv, oc);
ok('track covers the months after the start', track0.rows.length === 3 && track0.rows[0].month === '2026-10');
ok('with no snapshot every month is projected', track0.rows.every((r) => r.src === 'projected'));
data.projector.snapshots.push({ id: 's2026-10', month: '2026-10', date: '2026-11-01', net: 3000000, assets: 3000000, loans: 0, classes: { cash: 3000000 }, classesEstimated: true });
const track = PL.yearTrack(data, all, lv, oc);
ok('a snapshot is actual, the rest projected from it', track.rows[0].src === 'actual' && track.rows[0].nw === 3000000 && track.rows[1].src === 'projected' && Math.abs(track.rows[2].nw - track.rows[0].nw) < 1e7);
const ww = PL.whereWent(lv, track, '2026-10');
ok('where it went for a snapshot month', ww && Math.abs(ww.diff - (3000000 - track.path[0].nw)) < 1);
const ov = PL.yearTrack(data, all, lv, oc, { outlook: { gold: 'loss', shares: 'loss', etfs: 'loss', funds: 'loss' } });
ok('what-if outlook only changes the projected months', ov.rows[0].nw === track.rows[0].nw && ov.projected <= track.projected, `${Math.round(ov.projected)} <= ${Math.round(track.projected)}`);
data.projector.snapshots = [];
data.projector.years['2026'] = plan;
const r1 = PL.effective(plan, 1), r2e = PL.effective(plan, 2);
ok('an earlier revision can be projected with its own settings', r1 && r1.rev === 1 && r1.a.salary === 150000 && r2e.a.salary === 170000 && PL.planTarget(r1, oc) !== PL.planTarget(r2e, oc));
ok('a revision without saved settings is not offered', PL.effective(plan, 99) === null);
const snap = PL.makeSnapshot(data, all, '2026-10', '', oc);
data.projector.snapshots.push(snap);   // a real October month, so the growth rules can be checked
const track1 = PL.yearTrack(data, all, PL.effective(plan, 'live'), oc);
ok('snapshot carries the live plan figures', snap.plan && snap.plan.rev === 2 && snap.projected && snap.projected.net > 0);
// growth of a real month: the rules' figures plus "other changes" make up the growth, and the net worth identity holds
const gm = track1.rows[0];
ok('real month growth: rules + other = growth, and net worth adds up', Math.abs(gm.growthItems.reduce((a, x) => a + x.amount, 0) + gm.growthOther - gm.growth) < 1 && Math.abs(gm.open.nw + gm.leftSpan + gm.pfSpan + gm.growth - gm.nw) < 1, Math.round(gm.growth));
ok('bonds and lending give no growth (their interest is income)', !gm.growthItems.some((x) => x.key === 'bonds' || x.key === 'lending'));
ok('a snapshot made now carries its growth record', snap.growth && snap.growth.v === 1 && Array.isArray(snap.growth.items));
// the snapshot month is chosen, never taken from the calendar: saving September while the date is October
ok('snapshot is for the month asked for', snap.month === '2026-10' && PL.makeSnapshot(data, all, '2026-08', '', oc).month === '2026-08');
ok('best plan is the live one, or the draft', PL.bestPlan(data, 2026).rev === 2 && PL.bestPlan(data, 2027) === null);
ok('a plan with a snapshot in its year cannot be deleted; one without can', !PL.canDeletePlan(data, 2026) && (() => { const d3 = JSON.parse(JSON.stringify(data)); d3.projector.years['2027'] = PL.freshPlan(d3, all, 2027); return PL.canDeletePlan(d3, 2027); })());
// deleting the latest revision goes back to the one before; the first goes back to a draft
const dp = JSON.parse(JSON.stringify(plan));
const res = PL.deleteLatestRevision(dp);
ok('latest revision deleted: back to revision 1 with its settings', res.back === 1 && dp.live.rev === 1 && dp.a.salary === 150000 && dp.revisions.length === 1 && !PL.isDirty(dp), JSON.stringify(res));
const res1 = PL.deleteLatestRevision(dp);
ok('first revision deleted: back to a draft that keeps its settings', res1.back === null && dp.live === null && dp.revisions.length === 0 && dp.a.salary === 150000);
const d2 = JSON.parse(JSON.stringify(data)); d2.projector.years['2025'] = { id: '2025', year: 2025, a: {}, baseline: {} }; d2.projector.ahead = { horizon: 7, salary: 5 };
PL.clearLegacy(d2);
ok('clearing removes old plans and old planning figures only', !d2.projector.years['2025'] && d2.projector.years['2026'].v === 2 && d2.projector.snapshots.length === data.projector.snapshots.length && d2.projector.ahead.horizon === 7 && d2.projector.ahead.salary === undefined);

// ---- 8.11: growth rules, work-optional number, suggested fix ----
import * as G from '../js/growth.js';
{
  const fl = { epfIn: 0, ppfIn: 0, pfInterest: 0, bankInterest: 0, putIn: { shares: 100000 }, taken: { shares: 20000 }, divExtra: 0 };
  const base = { months: ['2026-10'], open: { cash: 500000, shares: 1000000, pf: 800000, fds: 300000, bonds: 400000 }, close: { cash: 520000, shares: 1150000, pf: 805000, fds: 302500, bonds: 400000 }, openReal: true, closeReal: true, total: 60000, flows: fl, rate: (k) => ({ cash: 0.03, fds: 0.08, pf: 0.0825 })[k] || 0.09 };
  const e = G.explainGrowth(base), by = Object.fromEntries(e.items.map((x) => [x.key, x]));
  ok('market growth = closing − opening − bought + sold', by.shares.amount === 1150000 - 1000000 - 100000 + 20000 && by.shares.how === 'market', by.shares.amount);
  ok('bonds give no growth (interest is income)', !by.bonds);
  ok('deposits compound by rate ÷ 12', Math.abs(by.fds.amount - 300000 * (Math.pow(1.08, 1 / 12) - 1)) < 1);
  ok('EPF with no interest credited is a memo, not counted', !by.pf && e.memo.some((x) => x.key === 'pf' && x.how === 'memo'));
  const e2 = G.explainGrowth({ ...base, flows: { ...fl, pfInterest: 70000 }, total: 130000 });
  ok('EPF interest credited is counted once', e2.items.find((x) => x.key === 'pf').amount === 70000 && !e2.memo.some((x) => x.key === 'pf'));
  const e3 = G.explainGrowth({ ...base, flows: { ...fl, bankInterest: 900 } });
  ok('bank interest already in income: cash growth not counted again', !e3.items.some((x) => x.key === 'cash') && e3.memo.some((x) => x.key === 'cash'));
  const e4 = G.explainGrowth({ ...base, openReal: false });
  ok('market growth falls back to the outlook rate when values are not recorded', e4.items.find((x) => x.key === 'shares').how === 'rate' && e4.items.find((x) => x.key === 'shares').estimated === true);
  ok('rules + other = total', Math.abs(e.items.reduce((a, x) => a + x.amount, 0) + e.other - e.total) <= 1);
  ok('a gap of months is spanned', G.spanOf('2026-07', '2026-10').join() === '2026-08,2026-09,2026-10' && G.spanOf('2026-09', '2026-10').join() === '2026-10');
}
{
  const rows = Array.from({ length: 24 * 12 }, (_, i) => ({ month: `${2027 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, expenses: 50000 * Math.pow(1.06, Math.floor(i / 12)), oneOut: 0, nw: 2e6 + i * 400000 }));
  const wo = PL.workOptional(rows, 4e6, 0.04);
  ok('work-optional number is yearly spending ÷ rate', Math.abs(wo.corpusToday - 600000 / 0.04) < 5, wo.corpusToday);
  ok('work-optional year is the first year net worth reaches it', wo.reached && wo.reached.nw >= wo.reached.corpus && wo.years[wo.years.indexOf(wo.reached) - 1].nw < wo.years[wo.years.indexOf(wo.reached) - 1].corpus);
  ok('work-optional progress', Math.abs(wo.progress - 4e6 / wo.corpusToday) < 1e-9);
}
{
  const f = PL.suggestFix(PL.effective(plan, 'live'), { ...track, gap: -50000, extra: 8000, monthsLeft: 2, inYear: true, target: track.target }, oc);
  ok('a gap gets a save-more suggestion', f.some((x) => x.kind === 'save' && x.amount === 8000), f.map((x) => x.text).join(' | '));
  ok('no gap, no fix', PL.suggestFix(PL.effective(plan, 'live'), { ...track, gap: 100 }, oc).length === 0);
}

process.exit(fail ? 1 : 0);
