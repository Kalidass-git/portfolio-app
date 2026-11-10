// Passive income planner: monthly equivalents, saved plan shape, allocation totals, carry forward, over-allocation and unmapped detection.
// node tests/passive.test.mjs <data.json>   (the data file is only needed for the last group of checks)
import fs from 'fs';
import * as C from '../js/calc.js';
import * as P from '../js/passive.js';
import { categoryList } from '../js/categories.js';
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
  ok(gs.length === 1 && gs[0].key === 'bondgrp:all' && gs[0].members.length > 0, 'all bonds appear as one bond interest income');
  const one = all.bonds.find((b) => b.monthNet > 0.5);
  if (one && rent) {
    const d = JSON.parse(JSON.stringify(data)); d.settings.passivePlan = { alloc: [{ id: 'a', src: 'bond:' + one.id, cat: rent.name, amount: 500 }, { id: 'b', src: P.bondGroup(one), cat: rent.name, amount: 300 }] };
    const pl = P.planOf(d, all); ok(pl.alloc.length === 1 && pl.alloc[0].src === 'bondgrp:all' && pl.alloc[0].amount === 800, 'an allocation on one bond moves into the bond interest income and duplicates are added together');
    d.settings.passivePlan = { alloc: [{ id: 'a', src: 'bondgrp:monthly', cat: rent.name, amount: 400 }, { id: 'b', src: 'bondgrp:quarterly', cat: rent.name, amount: 100 }], sorder: { 'bondgrp:monthly': ['A'], 'bondgrp:quarterly': ['B', 'A'] } };
    const p2 = P.planOf(d, all); ok(p2.alloc.length === 1 && p2.alloc[0].amount === 500 && p2.sorder['bondgrp:all'].join() === 'A,B', 'the older monthly and quarterly bond groups read as one income');
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
  // rent 25,000 every month plus 13,500 every 3 months planned as one expense of 29,500, with the quarter's share kept, not free
  {
    const d = JSON.parse(JSON.stringify(data)); P.savePlan(d, { alloc: [{ id: 'a', src: key, cat: 'Rent', amount: 3000 }, { id: 'b', src: key, cat: 'Food', amount: 1000 }], freq: {}, extra: [], skip: [], carry: true, from: '2026-07', order: ['Food', 'Rent'],
      expense: { rent: { name: 'Rent', mode: 'fixed', amount: 25000, freq: 'monthly', lump: { amount: 13500, every: 3 } } }, merge: {} });
    const r = P.categories(d, all).find((c) => c.name === 'Rent');
    ok(r && r.base === 29500 && r.fixed && r.lump.every === 3 && r.lumpMonthly === 4500, 'rent 25,000 a month plus 13,500 every 3 months plans as 29,500 a month');
    const al3 = P.allocation(d, all), ords = al3.links.filter((l) => l.src === key).sort((a, b) => a.ord - b.ord).map((l) => l.cat);
    ok(ords[0] === 'Food' && ords[1] === 'Rent', 'the order each income pays in follows the order of the expenses');
    const o2 = JSON.parse(JSON.stringify(d)); o2.settings.passivePlan.order = ['Rent', 'Food']; ok(P.allocation(o2, all).links.filter((l) => l.src === key).sort((a, b) => a.ord - b.ord)[0].cat === 'Rent', 'changing the order of the expenses renumbers the connections');
  }
  // the plan follows the category budgets: Rent budget 29,500 with 13,500 paid at quarter end, Education 60,000 a year
  {
    const d = JSON.parse(JSON.stringify(data)); d.categoryList = categoryList(d).filter((c) => !['rent', 'education'].includes(c.name.toLowerCase())).concat([{ name: 'Rent', kind: 'expense', budget: 29500 }, { name: 'Education', kind: 'expense', budget: 0, yearlyBudget: 60000 }]);
    P.savePlan(d, { alloc: [{ id: 'a', src: key, cat: 'Rent', amount: 29500 }], freq: {}, extra: [], skip: [], carry: true, from: '2026-11', order: [], expense: { rent: { name: 'Rent', lump: { amount: 13500, every: 3 } } }, merge: {} });
    const cs = P.categories(d, all), rent = cs.find((c) => c.name === 'Rent'), edu = cs.find((c) => c.name === 'Education');
    ok(rent && rent.base === 29500 && rent.src === 'budget' && rent.lump && rent.lumpMonthly === 4500, 'an expense costs what its category budget says');
    ok(edu && edu.base === 5000 && edu.yearly === 60000, 'a yearly budget plans as a twelfth every month');
    const d2 = JSON.parse(JSON.stringify(d)); d2.categoryList.find((c) => c.name === 'Rent').budget = 0; ok(P.categories(d2, all).find((c) => c.name === 'Rent').src !== 'budget', 'without a budget the older fixed amount or the average is used');
    const nov = P.actualVsPlan(d, all, '2026-11').rows.find((x) => x.name === 'Rent');
    ok(nov && nov.state !== 'over' && nov.available === 25000 && nov.kept === 9000, 'in November the regular 25,000 is allowed and 9,000 is put by, with no shortfall shown');
    const dec = P.actualVsPlan(d, all, '2026-12').rows.find((x) => x.name === 'Rent'); ok(dec && dec.lumpDue && dec.available === 38500, 'in the quarter-end month the payment is allowed on top');
    const sa = P.setAside(d, all, '2026-11'), sr = sa.rows.find((x) => x.name === 'Rent'), se = sa.rows.find((x) => x.name === 'Education');
    ok(sr && sr.accrued === 9000 && !sr.due && sr.nextIn === 1 && se && se.share === 5000 && se.kind === 'yearly', 'the set-aside card holds the quarter\'s share and the yearly budget');
    ok(P.setAside(d, all, '2026-12').rows.find((x) => x.name === 'Rent').due, 'the payment shows as due in its month');
  }
  // progress: every spent rupee is either on an income's expense or not planned; the periods add up
  {
    const m = P.progressMonth(data, all, '2026-10'), rowsSpent = m.sources.reduce((a, x) => a + x.rows.reduce((b, r) => b + r.spent, 0), 0), un = m.unplanned.reduce((a, u) => a + u.spent, 0);
    ok(Math.abs(rowsSpent + un - m.spent) < 1, 'progress: what is spent is split between the incomes\' expenses and the unplanned ones');
    ok(m.pocket <= m.spent + 0.5 && m.pocket >= 0, 'progress: the pocket amount is never more than was spent');
    const r3 = P.progressReport(data, all, ['2026-08', '2026-09', '2026-10']), one = ['2026-08', '2026-09', '2026-10'].map((x) => P.progressMonth(data, all, x));
    ok(Math.abs(r3.spent - one.reduce((a, x) => a + x.spent, 0)) < 1 && Math.abs(r3.pocket - one.reduce((a, x) => a + x.pocket, 0)) < 1, 'progress: a period is the sum of its months');
  }
  // each income has its own order, set by its column; without one it follows the order of the expenses
  {
    const d = JSON.parse(JSON.stringify(data)); P.savePlan(d, { alloc: [{ id: 'a', src: key, cat: 'Rent', amount: 100 }, { id: 'b', src: key, cat: 'Food', amount: 100 }, { id: 'c', src: 'inc:zz', cat: 'Rent', amount: 1 }], freq: {}, extra: [], skip: [], carry: true, from: '', order: ['Rent', 'Food'], sorder: { [key]: ['Food', 'Rent'] }, expense: {}, merge: {} });
    const l = P.allocation(d, all).links, own = l.filter((x) => x.src === key).sort((a, b) => a.ord - b.ord).map((x) => x.cat);
    ok(own[0] === 'Food' && own[1] === 'Rent', 'an income with its own order pays in that order, not the order of the expenses');
    d.settings.passivePlan.sorder = {}; const own2 = P.allocation(d, all).links.filter((x) => x.src === key).sort((a, b) => a.ord - b.ord).map((x) => x.cat);
    ok(own2[0] === 'Rent', 'without its own order an income follows the order of the expenses');
  }
  const s = P.summary(data, all); ok(s.required >= 0 && (s.coverage == null || s.coverage >= 0), 'coverage and the income still needed are sane');
}
console.log(bad ? 'FAILED' : 'ALL OK'); process.exit(bad ? 1 : 0);
