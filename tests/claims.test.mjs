// Claim back: reimbursable spending and money lent to friends.
import * as CL from '../js/claims.js';
import * as CAT from '../js/categories.js';
import * as C from '../js/calc.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const mk = () => ({ settings: {}, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }], categoryList: [{ name: 'Utilities', kind: 'expense', budget: 3000 }, { name: 'Salary', kind: 'income', budget: 0 }],
  categories: [], ledger: [
    { id: 1, acct: 'a1', date: '2026-09-05', desc: 'Internet Sep', category: 'Utilities', debit: 1000, credit: 0 },
    { id: 2, acct: 'a1', date: '2026-10-05', desc: 'Internet Oct', category: 'Utilities', debit: 1000, credit: 0 },
    { id: 3, acct: 'a1', date: '2026-10-09', desc: 'To Ravi', category: 'Others', debit: 5000, credit: 0 },
    { id: 4, acct: 'a1', date: '2026-10-10', desc: 'Salary', category: 'Salary', debit: 0, credit: 90000 }] });
const d = mk();
const spent = (x, m) => C.monthSummary(x, m).totalExpense;
const before = spent(d, '2026-10');
CL.ensureCategory(d, CAT);
CL.markClaim(d.ledger[1], 'Company', 'Utilities'); CL.markClaim(d.ledger[0], 'Company', 'Utilities'); CL.markClaim(d.ledger[2], 'Ravi', 'Others');
ok(CAT.kindOf(d)(CL.CLAIM_CAT) === 'transfer', 'Claim back is a not-counted category');
ok(CAT.isProtected(CL.CLAIM_CAT), 'Claim back cannot be renamed or deleted');
ok(spent(d, '2026-10') === 0 && before === 6000, 'claims leave spending: ' + before + ' -> ' + spent(d, '2026-10'));
let s = CL.claimSummary(d);
ok(s.total === 7000 && s.people.length === 2 && s.people[0].from === 'Ravi', 'summary totals by person, biggest first');
ok(s.people[1].claims[0].id === 1, 'oldest claim first');
let threw = false; try { CL.markClaim(d.ledger[3], 'X', 'Salary'); } catch (e) { threw = true; } ok(threw, 'a credit cannot be a claim');
// part payment pays the oldest first
CL.applyRepayment(d, { from: 'company', amount: 1500, date: '2026-11-01', acct: 'a1' });
s = CL.claimSummary(d); const co = s.people.find((p) => p.from === 'Company');
ok(co.pending === 500 && co.claims.length === 1 && co.claims[0].id === 2, 'part payment settles Sep and part of Oct');
ok(spent(d, '2026-11') === 0 && C.monthSummary(d, '2026-11').totalIncome === 0, 'the repayment is not income');
threw = false; try { CL.applyRepayment(d, { from: 'Company', amount: 600, date: '2026-11-02', acct: 'a1' }); } catch (e) { threw = true; } ok(threw, 'more than owed is refused');
// link an existing bank credit
d.ledger.push({ id: 20, acct: 'a1', date: '2026-11-05', desc: 'NEFT Ravi', category: 'Others', debit: 0, credit: 5000 });
CL.applyRepayment(d, { from: 'Ravi', creditId: 20 });
ok(CL.claimSummary(d).people.every((p) => p.from !== 'Ravi') && d.ledger.find((e) => e.id === 20).category === CL.CLAIM_CAT, 'linked credit settles Ravi');
ok(CL.repayments(d).length === 2, 'two repayments listed');
CL.undoRepayment(d, 20);
ok(d.ledger.find((e) => e.id === 20).category === 'Others' && !d.ledger.find((e) => e.id === 20).claimFor, 'undo restores the linked credit');
ok(CL.claimSummary(d).total === 5500, 'Ravi is due again');
const newId = CL.repayments(d).find((r) => !r.linked).id; CL.undoRepayment(d, newId);
ok(!d.ledger.some((e) => e.id === newId) && CL.claimSummary(d).total === 7000, 'undo removes the credit made here');
// cancel
threw = false; CL.applyRepayment(d, { from: 'Ravi', amount: 100, date: '2026-11-06', acct: 'a1' }); try { CL.cancelClaim(d, 3); } catch (e) { threw = true; } ok(threw, 'cannot cancel after money came back');
CL.undoRepayment(d, CL.repayments(d)[0].id); CL.cancelClaim(d, 3);
ok(d.ledger[2].category === 'Others' && !d.ledger[2].claim && spent(d, '2026-10') === 5000, 'cancel puts it back as an expense');
console.log(bad ? bad + ' failed' : 'claims ok');
process.exit(bad ? 1 : 0);
