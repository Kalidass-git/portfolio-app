import fs from 'node:fs';
import * as C from '../js/calc.js';
import * as CAT from '../js/categories.js';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let fail = 0;
const t = (label, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', label, extra); };
const clone = () => JSON.parse(JSON.stringify(data));

// derived kinds match the workbook's rules
const k = CAT.kindOf(data);
t('Transfer is not counted', k('Transfer') === 'transfer' && k('Withdrawal') === 'transfer');
t('Investment names are investments', k('Investment Gold') === 'investment' && k('Investment MF') === 'investment');
t('Salary and bond interest are income', k('Salary') === 'income' && k('Income Bond') === 'income');
t('Rent is spending, Others is spending', k('Rent') === 'expense' && k('Others') === 'expense');
t('Unknown names default to spending', k('Brand new') === 'expense');

// materialising the list does not change any monthly result
const before = JSON.stringify(['2026-08', '2026-09', '2026-10'].map((m) => C.monthSummary(data, m)));
const d = clone(); CAT.ensure(d);
t('Monthly summaries unchanged after the list is stored', before === JSON.stringify(['2026-08', '2026-09', '2026-10'].map((m) => C.monthSummary(d, m))));

// add / change kind affects the totals
CAT.add(d, { name: 'Pet care', kind: 'expense', budget: 3000 });
t('Add category', CAT.exists(d, 'pet care') && d.categoryList.find((c) => c.name === 'Pet care').budget === 3000);
t('Adding the same name again does nothing', (CAT.add(d, { name: 'PET CARE' }), d.categoryList.filter((c) => c.name.toLowerCase() === 'pet care').length === 1));
const i0 = C.monthSummary(d, '2026-10').totalInvest;
CAT.update(d, 'Education', { kind: 'investment' });
const s1 = C.monthSummary(d, '2026-10');
t('Changing a category to investment moves its spending', s1.totalInvest >= i0);
CAT.update(d, 'Education', { kind: 'expense' });

// rename carries through ledger and rules
const n = d.ledger.filter((e) => e.category === 'Donation').length;
CAT.update(d, 'Donation', { name: 'Charity' });
t('Rename moves ledger entries', d.ledger.filter((e) => e.category === 'Charity').length === n && !d.ledger.some((e) => e.category === 'Donation'));
t('Rename moves auto-fill rules', !d.categories.some((r) => r.category === 'Donation'));
// protected
let threw = false; try { CAT.update(d, 'Rent', { name: 'Home rent' }); } catch { threw = true; }
t('Fixed names cannot be renamed', threw);
threw = false; try { CAT.remove(d, 'Salary'); } catch { threw = true; }
t('Fixed names cannot be deleted', threw);
// merge
const th = d.ledger.filter((e) => e.category === 'Treat').length + d.ledger.filter((e) => e.category === 'Gifts').length;
CAT.merge(d, 'Treat', 'Gifts');
t('Merge moves entries and removes the source', d.ledger.filter((e) => e.category === 'Gifts').length === th && !CAT.exists(d, 'Treat'));
// rename onto an existing name merges
CAT.add(d, { name: 'Temp A' }); CAT.add(d, { name: 'Temp B' });
d.ledger.push({ id: 99999, acct: 'scb', date: '2026-10-01', desc: 'x', debit: 5, credit: 0, category: 'Temp A' });
CAT.update(d, 'Temp A', { name: 'Temp B' });
t('Renaming onto an existing name merges', d.ledger.find((e) => e.id === 99999).category === 'Temp B' && !CAT.exists(d, 'Temp A'));
// delete used needs a move first
threw = false; try { CAT.remove(d, 'Temp B'); } catch { threw = true; }
t('A used category cannot be deleted directly', threw);
d.ledger = d.ledger.filter((e) => e.id !== 99999);
CAT.remove(d, 'Temp B');
t('An unused category can be deleted', !CAT.exists(d, 'Temp B'));
// ledger name that is missing from the list still shows up
const d2 = clone(); CAT.ensure(d2); d2.ledger.push({ id: 5, acct: 'scb', date: '2026-10-02', desc: 'y', debit: 1, credit: 0, category: 'Surprise' });
t('Unlisted ledger categories are picked up', CAT.categoryList(d2).some((c) => c.name === 'Surprise'));
// budgets
const d3 = clone(); CAT.ensure(d3); CAT.update(d3, 'Food', { budget: 3000 }); CAT.update(d3, 'Travel', { budget: 500 });
const lines = CAT.budgetLines(d3, C.monthSummary(d3, '2026-10').expense);
const food = lines.find((l) => l.name === 'Food'), travel = lines.find((l) => l.name === 'Travel');
t('Budget line for Food: spent 3581 of 3000', Math.round(food.spent) === 3581 && food.left < 0, JSON.stringify(food));
t('Over-budget categories sort first', lines[0].used >= lines[1].used);
t('Travel line present', !!travel);
// rules
CAT.setRule(d3, 'New shop', 'Food');
t('Add rule', d3.categories.some((r) => r.desc === 'New shop' && r.category === 'Food'));
CAT.removeRule(d3, 'new shop');
t('Remove rule', !d3.categories.some((r) => r.desc === 'New shop'));

// ---- day change for shares and funds
const q = {}; const s0 = data.stocks[0];
q[s0.symbol] = { price: s0.price + 10, prevClose: s0.price };
const m0 = data.mutualFunds[0]; data.mutualFunds[0].schemeCode = '123';
q['MF:123'] = { price: m0.nav * 1.01, prev: m0.nav };
const all = C.computeAll(data, { asOf: '2026-10-12', quotes: q, useLive: true });
const si = all.stocks.items[0];
t('Stock day change = qty x move', Math.abs(si.day - s0.qty * 10) < 1e-6, String(si.day));
t('Stock day % ', Math.abs(si.dayPct - 10 / s0.price) < 1e-9);
t('Fund day change', Math.abs(all.mf.items[0].day - m0.units * m0.nav * 0.01) < 0.01);
t('Totals count only priced holdings', all.stocks.dayCount === 1 && all.mf.dayCount === 1);
const none = C.computeAll(data, { asOf: '2026-10-12', useLive: false });
t('No quotes means no day change', none.stocks.dayCount === 0 && none.stocks.items[0].day === null);
// net worth series, upcoming, runway
const ser = C.netWorthSeries({ ...data, history: [{ date: '2026-10-05', net: 21000000 }] }, none);
t('Net worth series is in date order and ends today', ser.every((p, i) => !i || ser[i - 1].date <= p.date) && ser[ser.length - 1].date === '2026-10-12');
const up = C.upcoming(data, none, 60);
t('Upcoming dues sorted', up.every((u, i) => !i || up[i - 1].date <= u.date) && up.length > 0);
const rw = C.runway(data, none);
t('Runway uses full months only', rw.basis > 0 && rw.avg > 0 && rw.months > 0);
console.log(fail ? `\n${fail} FAILED` : '\nall category and day-change checks passed');
process.exit(fail ? 1 : 0);
