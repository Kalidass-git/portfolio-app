// Month in detail (status levels, periods, what counts) and Work-optional with spending left out.
// node tests/monthdetail.test.mjs <path-to-data-json>   (any file with a bank ledger; a synthetic one is fine)
import fs from 'node:fs';
import * as C from '../js/calc.js';
import * as M from '../js/monthdetail.js';
import * as PL from '../js/planner.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(M.statusOf(50, 100).level.id === 'well' && M.statusOf(75, 100).level.id === 'well' && M.statusOf(90, 100).level.id === 'marginal', 'under 75% is well within, up to 100% marginal');
ok(M.statusOf(100, 100).level.id === 'marginal' && M.statusOf(110, 100).level.id === 'over' && M.statusOf(120, 100).level.id === 'over' && M.statusOf(121, 100).level.id === 'beyond', 'over up to +20%, beyond after');
ok(M.statusOf(0, 0) === null && M.statusOf(500, 0).level.id === 'nolimit', 'no limit: nothing to judge, or "no income expected"');
const rows12 = Array.from({ length: 12 }, (_, i) => ({ month: '2025-' + String(i + 1).padStart(2, '0'), limit: 100, spent: 80, received: 100, status: M.statusOf(80, 100), lines: [] }));
const t = M.periodTotal(rows12);
ok(t.limit === 1200 && t.spent === 960 && t.left === 240 && t.status.level.id === 'marginal' && t.byLevel.marginal === 12, 'a period adds its months up');
const cur = { month: '2026-10', spend: [{ name: 'Rent', amount: 100, cats: ['rent'] }, { name: 'Tax', amount: 50, cats: ['tax'] }], lifestyle: { name: 'Clothes', amount: 0, cats: [] }, others: [{ name: 'Tax', key: 'tax', amount: 50, counted: true }, { name: 'EMI', key: 'emi', amount: 70, counted: false }], totalExpected: 400 };
const lines = M.monthLines(cur);
ok(lines.length === 3 && lines.find((l) => l.name === 'Rent').counted && lines.find((l) => l.name === 'Tax').counted && !lines.find((l) => l.name === 'EMI').counted, 'defaults follow Home: groups and ticked other payments count, others do not');
const lines2 = M.monthLines(cur, { rent: false, emi: true });
ok(!lines2.find((l) => l.name === 'Rent').counted && lines2.find((l) => l.name === 'EMI').counted, 'a choice overrides the default');
if (process.argv[2]) {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), all = C.computeAll(data, { asOf: '2026-10-24', useLive: false }), led = C.ledgerMonths(data);
  ok(M.periodMonths('this', all.asOf, led).join() === '2026-10' && M.periodMonths('prev', all.asOf, led).join() === '2026-09', 'this and previous month');
  const ty = M.periodMonths('ty', all.asOf, led); ok(ty.every((m) => m.startsWith('2026') && m <= '2026-10'), 'this year runs to the current month');
  const py = M.periodMonths('py', all.asOf, led); ok(py.every((m) => m.startsWith('2025')), 'previous year is the year before');
  const r = M.monthRow(data, all, '2026-10'), mc = C.monthCashflow(data, all, '2026-10');
  ok(Math.abs(r.spent - (mc.totalSpent + mc.lifestyle.amount)) < 1 && r.limit === mc.totalExpected, 'by default the spent figure equals Home’s Spent and the limit equals Home’s budget');
  const sh = PL.regularShares(data, all);
  ok(sh.length > 0 && Math.abs(sh.reduce((a, x) => a + x.share, 0) - 1) < 1e-9, 'everyday expense shares add to 100%');
}
// Work-optional: leaving out a share of the everyday spending and named one-time items
const mk = (i) => ({ month: `2027-${String((i % 12) + 1).padStart(2, '0')}`, expenses: 1000, oneOut: i % 12 === 3 ? 600 : 0, items: i % 12 === 3 ? [{ name: 'Tax', amount: 400, kind: 'expense' }, { name: 'Trip', amount: 200, kind: 'expense' }] : [], nw: 1e6 });
const rows = Array.from({ length: 36 }, (_, i) => mk(i));
const a = PL.workOptional(rows, 5e5, 0.04), b = PL.workOptional(rows, 5e5, 0.04, { frac: 0.25, items: ['tax'] });
ok(a.needToday === 12600 && a.skippedToday === 0 && a.corpusToday === 315000, 'no exclusions: 12 x 1000 + 600 a year, ÷ 4%');
ok(b.grossToday === 12600 && b.skippedToday === 3400 && b.needToday === 9200 && b.corpusToday === 230000, 'leaving out 25% of everyday spending and the Tax item: 12600 − 3000 − 400');
ok(PL.workOptional(rows, 5e5, 0.04, { frac: 0, items: [] }).needToday === a.needToday, 'empty exclusions change nothing');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
