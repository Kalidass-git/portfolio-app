// Closing a holding that comes back with interest: two bank entries (principal as a transfer, interest as income) that Reopen removes together. Synthetic data.
import { creditClose, removeCredits, incomeCategory } from '../js/views/closing.js';
import { kindOf } from '../js/categories.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const mk = () => ({ settings: {}, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }], ledger: [{ id: 5, date: '2026-01-01', acct: 'a1', desc: 'x', category: 'Food', credit: 0, debit: 10 }], categories: [], categoryList: [{ name: 'Income FD', kind: 'income' }, { name: 'Food', kind: 'expense' }], savings: [], bonds: [], fds: [], lending: [] });
let d = mk();
let r = creditClose(d, { acct: 'a1', date: '2026-11-02', amount: 108000, desc: 'FD closed: SBI', principal: 100000, word: 'FD' });
const p = d.ledger.find((e) => e.id === r.ledgerId), i = d.ledger.find((e) => e.id === r.interestLedgerId);
ok(p && p.credit === 100000 && p.category === 'Investment redemption' && /principal/.test(p.desc), 'principal goes in as a transfer');
ok(i && i.credit === 8000 && i.category === 'Income FD' && /interest/.test(i.desc), 'interest goes in under the existing Income FD category');
ok(kindOf(d)('Investment redemption') === 'transfer' && kindOf(d)('Income FD') === 'income', 'kinds: transfer and income');
ok(d.ledger.length === 3 && r.ledgerId !== r.interestLedgerId, 'two new entries');
removeCredits(d, { ledgerId: r.ledgerId, interestLedgerId: r.interestLedgerId });
ok(d.ledger.length === 1 && d.ledger[0].id === 5, 'Reopen removes both entries and nothing else');
// no category yet: it is created, and reused next time
d = mk(); d.categoryList = [{ name: 'Food', kind: 'expense' }];
creditClose(d, { acct: 'a1', date: '2026-11-02', amount: 55000, desc: 'Chit closed', principal: 50000, word: 'Chit' });
ok(d.ledger.some((e) => e.category === 'Income Chit' && e.credit === 5000), 'a missing Income Chit category is created');
creditClose(d, { acct: 'a1', date: '2026-11-03', amount: 21000, desc: 'Chit 2', principal: 20000, word: 'Chit' });
ok(d.ledger.filter((e) => e.category === 'Income Chit').length === 2 && d.categoryList.filter((c) => c.name === 'Income Chit').length <= 1, 'and reused');
// a user's own differently named income category is picked up
d = mk(); d.categoryList = [{ name: 'Income Lending Interest', kind: 'income' }];
ok(incomeCategory(d, 'Lending') === 'Income Lending Interest', 'a matching existing income category is used');
// nothing above the principal: one entry, as before
d = mk(); r = creditClose(d, { acct: 'a1', date: '2026-11-02', amount: 90000, desc: 'FD closed', principal: 100000, word: 'FD' });
ok(r.interestLedgerId === null && d.ledger.find((e) => e.id === r.ledgerId).credit === 90000 && d.ledger.length === 2, 'less than paid in: one transfer entry for what came back');
d = mk(); r = creditClose(d, { acct: 'a1', date: '2026-11-02', amount: 100000, desc: 'FD closed', principal: 100000, word: 'FD' });
ok(r.interestLedgerId === null && d.ledger.length === 2, 'exactly the principal: one entry');
d = mk(); r = creditClose(d, { acct: '', date: '2026-11-02', amount: 108000, desc: 'FD closed', principal: 100000, word: 'FD' });
ok(r.ledgerId === null && d.ledger.length === 1, 'no bank chosen: no entries');
d = mk(); r = creditClose(d, { acct: 'a1', date: '2026-11-02', amount: 108000, desc: 'x', principal: 0, word: 'FD' });
ok(r.interestLedgerId === null && d.ledger.length === 2, 'unknown principal: one entry as before');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
