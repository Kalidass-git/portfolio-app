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
  // bonds are grouped by how often they pay, and older allocations saved against one bond move into its group
  const gs = src.filter((x) => x.key.startsWith('bondgrp:')), bondN = (all.bonds || []).filter((b) => b.monthNet > 0.5).length;
  ok(gs.length > 0 && gs.length <= 2 && gs.every((g) => g.members && g.members.length > 0), 'bonds appear as a monthly group and a quarterly group');
  const one = all.bonds.find((b) => b.monthNet > 0.5);
  if (one && rent) {
    const d = JSON.parse(JSON.stringify(data)); d.settings.passivePlan = { alloc: [{ id: 'a', src: 'bond:' + one.id, cat: rent.name, amount: 500 }, { id: 'b', src: P.bondGroup(one), cat: rent.name, amount: 300 }] };
    const pl = P.planOf(d, all); ok(pl.alloc.length === 1 && pl.alloc[0].src === P.bondGroup(one) && pl.alloc[0].amount === 800, 'an allocation on one bond moves into its group and duplicates are added together');
  }
  // the order income is used in: a small month pays the first expenses in full and leaves the last short
  const al2 = { sources: [{ key: 's1' }], cats: [{ name: 'Rent', rank: 1, funded: 10000, base: 10000 }, { name: 'Wages', rank: 2, funded: 5000, base: 5000 }, { name: 'Groceries', rank: 3, funded: 8000, base: 8000 }],
    links: [{ src: 's1', cat: 'Groceries', amount: 8000 }, { src: 's1', cat: 'Rent', amount: 10000 }, { src: 's1', cat: 'Wages', amount: 5000 }] };
  const w1 = P.waterfall(al2, new Map([['s1', 10000]])), by = (w, n) => w.rows.find((r) => r.name === n);
  ok(by(w1, 'Rent').paid === 10000 && by(w1, 'Wages').paid === 0 && by(w1, 'Groceries').paid === 0 && w1.short === 13000, 'with 10,000 of interest rent is paid and the rest is left short');
  const w2 = P.waterfall(al2, new Map([['s1', 40000]])); ok(w2.short === 0 && w2.unused === 17000, 'with 40,000 everything is paid and 17,000 is left over');
  const w3 = P.waterfall(al2, new Map([['s1', 16000]])); ok(by(w3, 'Wages').paid === 5000 && by(w3, 'Groceries').paid === 1000, 'income runs out part way through the last expense it reaches');
  // fixed expenses, quarterly parts and "part of" folding: Rent 25,000 a month plus Maintenance 13,500 a quarter, counted as one expense
  {
    const d = JSON.parse(JSON.stringify(data)); P.savePlan(d, { alloc: [{ id: 'a', src: 'inc:x', cat: 'Maintenance', amount: 1000 }], freq: {}, extra: [], skip: [], carry: true, from: '2026-09', order: [],
      expense: { rent: { name: 'Rent', mode: 'fixed', amount: 25000, freq: 'monthly' }, maintenance: { name: 'Maintenance', mode: 'fixed', amount: 13500, freq: 'quarterly' } }, merge: { maintenance: 'Rent' } });
    const cs = P.categories(d, all), rentC = cs.find((c) => c.name === 'Rent');
    ok(rentC && rentC.base === 29500 && rentC.fixed && rentC.mixed && rentC.parts.length === 2, 'rent 25,000 plus maintenance 13,500 a quarter plans as 29,500 a month');
    ok(!cs.some((c) => c.name === 'Maintenance'), 'a part is folded into the expense it belongs to');
    ok(P.planOf(d, all).alloc[0].cat === 'Rent', 'an allocation to a folded category moves to the expense it belongs to');
    const sp = P.spendByCategory(d, '2026-10', P.planOf(d, all)); const raw = P.spendByCategory(data, '2026-10', { skip: [], merge: {} });
    ok(Math.abs((sp.get('Rent') || 0) - ((raw.get('Rent') || 0) + (raw.get('Maintenance') || 0))) < 1 && !sp.has('Maintenance'), 'spending on the part counts as spending on the expense');
    const d2 = JSON.parse(JSON.stringify(d)); d2.settings.passivePlan.expense = {}; d2.settings.passivePlan.merge = {};
    ok(P.categories(d2, all).find((c) => c.name === 'Rent').fixed === false, 'without a fixed amount the average of past months is used');
  }
  const s = P.summary(data, all); ok(s.required >= 0 && (s.coverage == null || s.coverage >= 0), 'coverage and the income still needed are sane');
}
console.log(bad ? 'FAILED' : 'ALL OK'); process.exit(bad ? 1 : 0);
