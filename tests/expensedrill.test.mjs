// Home's expense lines know their ledger categories, so a tap can list that month's entries by description.
import { computeAll, monthCashflow, monthLedger, byDescription } from '../js/calc.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const e = (id, date, desc, category, debit) => ({ id, acct: 'a1', date, desc, category, credit: 0, debit });
const dat = { settings: {}, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }], categories: [{ name: 'Family Budget', kind: 'expense' }, { name: 'Cloths', kind: 'expense' }, { name: 'Gifts', kind: 'expense' }, { name: 'Pets', kind: 'expense' }],
  ledger: [e(1, '2026-09-03', 'Vegetables', 'Family Budget', 400), e(2, '2026-09-09', 'Vegetables', 'Family Budget', 250), e(3, '2026-09-10', 'Milk', 'Family Budget', 100), e(4, '2026-10-02', 'Vegetables', 'Family Budget', 999),
    e(5, '2026-09-12', 'Shirt', 'Cloths', 800), e(6, '2026-09-14', 'Birthday', 'Gifts', 500), e(7, '2026-09-15', 'Vet', 'Pets', 700)],
  savings: [], bonds: [], fds: [], lending: [], receivables: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], jewellery: [], chits: [], others: [] }, liabilities: [], targets: [], proj: [], incomeSources: [], manualMonthlyIncome: [], reportNotes: [] };
const all = computeAll(dat, { asOf: '2026-10-22' });
const mc = monthCashflow(dat, all, '2026-09');
const groc = mc.spend.find((x) => x.name === 'Groceries & needs');
ok(groc && groc.cats.length === 1 && groc.cats[0] === 'family budget', 'groceries line lists its category');
ok(['Clothes', 'Entertainment', 'Vacation', 'Gifts'].every((n) => mc.lines.some((l) => l.name === n && l.cats.length === 1)), 'clothes, entertainment, vacation and gifts are each their own line');
const rows = monthLedger(dat, '2026-09').filter((x) => x.debit > 0 && groc.cats.includes(x.category.toLowerCase()));
const list = byDescription(rows, 'debit');
ok(list.length === 2 && list[0].desc === 'Vegetables' && list[0].amount === 650 && list[0].count === 2, 'September vegetables add up to 650 over 2 entries, October is left out');
ok(Math.abs(list.reduce((a, r) => a + r.amount, 0) - groc.amount) < 0.01, 'the list adds up to the line on Home');
// What counts as spending is one shared choice: each line on its own, turn lines off (homeSpendOff) or other payments on (homeSpendExtra).
{
  const total = (d) => monthCashflow(d, computeAll(d, { asOf: '2026-10-22' }), '2026-09');
  const base = total(dat);
  ok(base.totalSpent === 2050 && base.notCounted === 700, 'by default groceries 750, clothes 800 and gifts 500 count and the pets payment does not: ' + base.totalSpent);
  const off = JSON.parse(JSON.stringify(dat)); off.settings.homeSpendOff = ['cloths', 'gifts'];
  const o = total(off); ok(o.totalSpent === 750 && o.notCounted === 2000, 'turning clothes and gifts off takes them out of spent, on their own: ' + o.totalSpent);
  const on = JSON.parse(JSON.stringify(dat)); on.settings.homeSpendExtra = ['pets'];
  ok(total(on).totalSpent === 2750 && total(on).notCounted === 0, 'turning an other payment on adds it');
}

console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);