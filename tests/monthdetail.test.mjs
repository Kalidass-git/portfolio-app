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
// Heat map bands and the monthly insight
ok(M.bandOf(0).id === 'g' && M.bandOf(0.6).id === 'g' && M.bandOf(0.61).id === 'lg' && M.bandOf(0.8).id === 'lg' && M.bandOf(0.81).id === 'y', 'bands: 0-60 green, 60-80 light green, 80-100 amber');
ok(M.bandOf(1).id === 'y' && M.bandOf(1.01).id === 'o' && M.bandOf(1.2).id === 'o' && M.bandOf(1.21).id === 'r' && M.bandOf(1.6).id === 'r' && M.bandOf(1.61).id === 'd' && M.bandOf(9).id === 'd', 'bands: 100-120 light orange, 120-160 red, above 160 deep red');
const R = (month, spent, limit) => ({ month, spent, limit, status: M.statusOf(spent, limit) });
const yr = [R('2026-08', 190, 100), R('2026-09', 170, 100), R('2026-10', 120, 100), R('2026-11', 53, 100)];
const ins = M.monthInsight(yr, '2026-11', '2026-11');
ok(ins && ins.band === 'g' && ins.tone === 'good' && /53% of the limit used so far, lower than your usual 160%/.test(ins.text) && /47 still within/.test(ins.text), 'insight for the current month reads "so far" and compares with earlier months only');
const ins2 = M.monthInsight(yr, '2026-08', '2026-11');
ok(ins2.band === 'd' && ins2.tone === 'bad' && /90 over the limit/.test(ins2.text) && !/so far/.test(ins2.text), 'insight for a finished month: far over, and how much over');
ok(M.monthInsight(yr, '2026-12', '2026-11') === null && M.monthInsight([R('2026-05', 10, 0)], '2026-05', '2026-11') === null, 'nothing to judge: no insight');
// contrast of the tile text on every band colour, light and dark (WCAG AA, 4.5:1)
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const lumHex = (x) => { const v = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((u) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const [x, y] = [lumHex(a), lumHex(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [theme, re] of [['light', /^\.hz-(\w+)\s+\{ --hb: (#\w+); --hf: (#\w+);/gm], ['dark', /^:root\[data-theme="dark"\] \.hz-(\w+)\s+\{ --hb: (#\w+); --hf: (#\w+);/gm]]) {
  const found = [...css.matchAll(re)]; ok(found.length === 6, theme + ': six band colours defined');
  for (const [, id, bg, fg] of found) ok(ratio(bg, fg) >= 4.5, `${theme} ${id}: text contrast ${ratio(bg, fg).toFixed(1)}:1 is at least 4.5`);
}
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
