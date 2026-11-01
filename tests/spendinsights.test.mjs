// Spending insights: month pace, regular payments, possible double payments. Synthetic data.
import { computeAll } from '../js/calc.js';
import { weeklySpending, spendingPace, regularPayments, possibleDuplicates, payKey } from '../js/insights.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const led = []; let id = 1;
const add = (date, desc, debit, category = 'Groceries') => led.push({ id: id++, date, acct: 'a1', desc, category, credit: 0, debit });
for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) {
  add(m + '-03', 'House rent', 20000, 'Rent'); add(m + '-05', 'Netflix 1234', 649, 'Entertainment'); add(m + '-10', 'Big Basket', 3000); add(m + '-20', 'Big Basket', 3000);
}
add('2026-10-21', 'Netflix 1234', 649, 'Entertainment');
add('2026-11-03', 'House rent', 20000, 'Rent'); add('2026-11-04', 'Big Basket', 4000); add('2026-11-05', 'Netflix 5678', 799, 'Entertainment');
add('2026-11-06', 'Pharmacy', 850, 'Health'); add('2026-11-07', 'Pharmacy', 850, 'Health'); add('2026-11-08', 'Chai', 20, 'Food');
const data = { settings: {}, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }], ledger: led, categories: [], categoryList: [{ name: 'Rent', kind: 'expense' }, { name: 'Groceries', kind: 'expense' }, { name: 'Entertainment', kind: 'expense' }, { name: 'Health', kind: 'expense' }, { name: 'Food', kind: 'expense' }],
  savings: [], bonds: [], fds: [], lending: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], jewellery: [], chits: [], others: [] }, liabilities: [], targets: [], proj: [], incomeSources: [], reportNotes: [], manualMonthlyIncome: [], receivables: [] };
const all = computeAll(data, { asOf: '2026-11-10' });
ok(payKey('Netflix 1234') === payKey('NETFLIX 5678') && payKey('Netflix 1234') === 'netflix', 'payKey ignores numbers and case');
const p = spendingPace(data, all, '2026-11');
ok(p && p.day === 10 && p.daysLeft === 20 && p.basis === 4, 'pace: day and days left');
ok(Math.round(p.spent) === 26519, 'pace: spent so far counts this month up to today');
ok(Math.round(p.usualToDate) === 23649, 'pace: usual by the same day uses earlier months');
ok(p.projected > p.spent, 'pace: projected is more than spent so far');
ok(spendingPace(data, all, '2026-10') === null, 'pace: only for the month under way');
const r = regularPayments(data, all, '2026-11');
const rent = r.rows.find((x) => /rent/i.test(x.name)), net = r.rows.find((x) => /netflix/i.test(x.name));
ok(rent && rent.usual === 20000 && rent.status === 'ok', 'rent is a regular payment, same as usual');
ok(net && net.status === 'changed' && net.diff > 100, 'a price change is flagged');
ok(!r.rows.some((x) => /pharmacy|chai/i.test(x.name)), 'one-offs are not regular payments');
ok(r.rows.find((x) => /big basket/i.test(x.name)).status === 'part', 'a lower total in the month under way is "so far", not a drop');
const rOct = regularPayments(data, all, '2026-10');
ok(rOct.rows.find((x) => /netflix/i.test(x.name)).thisMonth === 1298, 'two charges in a month add up');
const missing = regularPayments({ ...data, ledger: led.filter((e) => e.date !== '2026-11-03') }, all, '2026-11').rows.find((x) => /rent/i.test(x.name));
ok(missing && missing.status === 'missing', 'a regular payment that has not happened by its usual day is flagged');
const d = possibleDuplicates(data, '2026-11');
ok(d.length === 1 && /pharmacy/i.test(d[0].desc) && d[0].extra === 850, 'same payment twice within three days is flagged');
ok(possibleDuplicates(data, '2026-10').every((x) => !/big basket/i.test(x.desc)), 'ten days apart is not flagged');
// weekly trend: October has the same four weeks every month; November's second week has the big basket and the pharmacy lines
const wkn = weeklySpending(data, all, '2026-11');
ok(wkn.weeks.length === 5 && wkn.weeks[0].label === '1–7' && wkn.weeks[4].label === '29–30', 'five weeks, the last one short');
ok(wkn.weeks[0].total === 26499 && Math.round(wkn.weeks[0].usual) === 20649, 'week 1 total (rent, basket, Netflix, pharmacy) and usual (rent + Netflix)');
ok(wkn.weeks[0].top[0].category === 'Rent' && wkn.weeks[1].total === 20 && Math.round(wkn.weeks[1].usual) === 3000, 'biggest category of week 1; week 2 has only the chai so far against a usual 3000');
ok(wkn.weeks[2].future && wkn.weeks[3].future, 'weeks not started are marked future');
ok(wkn.weeks[1].current, 'the week under way is marked');
ok(wkn.over === 1, 'the highest week above usual is found among finished ones (week 1; the week under way is not judged)');
const wko = weeklySpending(data, all, '2026-10');
ok(wko.weeks.every((w) => !w.future && !w.current), 'a finished month has no future or current weeks');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
