// Moving descriptions between categories: past entries and the auto-fill rule move together.
import * as CAT from '../js/categories.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const e = (id, date, desc, category, debit, credit = 0) => ({ id, acct: 'a1', date, desc, category, debit, credit });
const mk = () => ({ settings: {}, accounts: [], categoryList: [{ name: 'Others', kind: 'expense', budget: 0 }, { name: 'Family support', kind: 'expense', budget: 0 }, { name: 'Utilities', kind: 'expense', budget: 0 }, { name: 'Salary', kind: 'income', budget: 0 }],
  categories: [{ desc: 'To Amma', category: 'Others', type: 'Expense' }, { desc: 'Gym Fees', category: 'Utilities', type: 'Expense' }],
  ledger: [e(1, '2026-10-01', 'To Amma', 'Others', 5000), e(2, '2026-11-01', 'to amma', 'Others', 6000), e(3, '2026-11-02', 'To Amma', 'Utilities', 100), e(4, '2026-11-03', 'Gym Fees', 'Utilities', 900), e(5, '2026-11-04', 'Refund', 'Others', 0, 300)] });
const g = CAT.descriptionGroups(mk());
const amma = g.find((x) => x.desc.toLowerCase() === 'to amma' && x.category === 'Others');
ok(g.length === 4 && amma.count === 2 && amma.debit === 11000, 'one row per description and category, case ignored');
const d = mk(), r = CAT.moveDescriptions(d, [{ desc: 'To Amma', from: 'Others' }], 'Family support');
ok(r.entries === 2 && r.descriptions === 1, 'two entries of one description moved');
ok(d.ledger[0].category === 'Family support' && d.ledger[1].category === 'Family support', 'both spellings moved');
ok(d.ledger[2].category === 'Utilities', 'the same description in another category stays');
ok(d.categories.find((x) => x.desc === 'To Amma').category === 'Family support', 'the auto-fill rule follows');
const d2 = mk(); CAT.moveDescriptions(d2, [{ desc: 'To Amma', from: 'Others' }], 'Family support', { updateRules: false });
ok(d2.categories.find((x) => x.desc === 'To Amma').category === 'Others', 'rules can be left alone');
const d3 = mk(); CAT.moveDescriptions(d3, [{ desc: 'Gym Fees', from: 'Utilities' }, { desc: 'Brand new', from: 'Others' }], 'Family support');
ok(d3.categories.some((x) => x.desc === 'Brand new' && x.category === 'Family support'), 'a rule is created when there was none');
let threw = false; try { CAT.moveDescriptions(mk(), [{ desc: 'x', from: 'y' }], 'Nowhere'); } catch (x) { threw = true; } ok(threw, 'an unknown target is refused');
const d4 = mk(), before = JSON.stringify(d4.ledger.map((x) => x.debit + '|' + x.credit)); CAT.moveDescriptions(d4, [{ desc: 'To Amma', from: 'Others' }], 'Family support');
ok(before === JSON.stringify(d4.ledger.map((x) => x.debit + '|' + x.credit)), 'amounts never change');
const d5 = mk(), r5 = CAT.moveEntries(d5, [1, 3], 'Family support');
ok(r5.entries === 2 && d5.ledger[0].category === 'Family support' && d5.ledger[2].category === 'Family support' && d5.ledger[1].category === 'Others', 'single entries move by id');
ok(d5.categories.find((r) => r.desc === 'To Amma').category === 'Others', 'moving single entries leaves the rule alone');
ok(CAT.moveEntries(d5, [1], 'Family support').entries === 0, 'already there: nothing moves');
let t2 = false; try { CAT.moveEntries(mk(), [1], 'Nowhere'); } catch (x) { t2 = true; } ok(t2, 'entries: unknown target refused');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
