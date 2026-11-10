// Passive income planner: monthly equivalents, saved plan shape, allocation totals, carry forward, over-allocation and unmapped detection.
// node tests/passive.test.mjs <data.json>   (the data file is only needed for the last group of checks)
import fs from 'fs';
import * as C from '../js/calc.js';
import * as P from '../js/passive.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(P.monthlyEquivalent(9000, 'quarterly') === 3000 && P.monthlyEquivalent(12000, 'yearly') === 1000 && P.monthlyEquivalent(500, 'monthly') === 500, 'quarterly and yearly amounts become monthly equivalents');
ok(P.planOf({ settings: {} }).carry === true && P.planOf({ settings: {} }).alloc.length === 0, 'a file with no plan reads as an empty plan that carries forward');
const d0 = { settings: { goldRate: 1 } }; P.savePlan(d0, { alloc: [{ id: 'pa1', src: 'bond:b1', cat: 'Rent', amount: 1234.6 }], freq: {}, extra: [], skip: [], carry: false, from: '2026-09' });
ok(d0.settings.passivePlan.alloc[0].amount === 1235 && d0.settings.passivePlan.carry === false && d0.settings.goldRate === 1, 'saving the plan rounds rupees and leaves other settings alone');
ok(P.newId([{ id: 'pa1' }, { id: 'pa2' }], 'pa') === 'pa3', 'new ids do not clash');
ok(P.monthsBetween('2026-11', '2027-02').join() === '2026-11,2026-12,2027-01,2027-02', 'months run across a year end');
const file = process.argv[2];
if (file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')), all = C.computeAll(data, { asOf: '2026-11-09' });
  const src = P.sources(data, all); ok(src.length > 0 && src.every((s) => s.monthly > 0), 'sources are found with a monthly figure');
  ok(!src.some((s) => /salary/i.test(s.name)), 'salary is never a passive source');
  const cat = P.categories(data, all); ok(cat.length > 0, 'expense categories are found');
  const key = src[src.length - 1].key, rent = cat.find((c) => /rent/i.test(c.name));
  if (rent) {
    const d = JSON.parse(JSON.stringify(data)); P.savePlan(d, { alloc: [{ id: 'a', src: key, cat: rent.name, amount: 12000 }], freq: {}, extra: [], skip: [], carry: true, from: '2026-09' });
    const a = P.allocation(d, all); ok(a.sources.find((s) => s.key === key).over > 0 || a.sources.find((s) => s.key === key).monthly >= 12000, 'a source allocated beyond its income is reported as over');
    ok(a.unmapped.every((c) => c.funded === 0) && !a.unmapped.some((c) => c.name === rent.name), 'a funded category is not unmapped');
    const n = P.actualVsPlan(d, all, '2026-11').rows.find((r) => r.name === rent.name), o = P.actualVsPlan(d, all, '2026-10').rows.find((r) => r.name === rent.name);
    ok(o && n && Math.abs(n.carryIn - o.carryOut) < 1, 'unused allocation of one month is carried into the next');
    const e = JSON.parse(JSON.stringify(d)); e.settings.passivePlan.carry = false;
    ok(P.actualVsPlan(e, all, '2026-11').rows.every((r) => r.carryIn === 0), 'with carry forward off nothing is carried');
    const before = JSON.stringify(P.planOf(d).alloc); P.breaches(d, all); P.summary(d, all); ok(JSON.stringify(P.planOf(d).alloc) === before, 'monitoring never changes an allocation');
  }
  const s = P.summary(data, all); ok(s.required >= 0 && (s.coverage == null || s.coverage >= 0), 'coverage and the income still needed are sane');
}
console.log(bad ? 'FAILED' : 'ALL OK'); process.exit(bad ? 1 : 0);
