// Monthly budget: interest income by default, or an amount the owner fixes. Pure logic, no data file needed.
// node tests/budget.test.mjs
import * as B from '../js/budget.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const d = (bp) => ({ settings: bp ? { budgetPlan: bp } : {} });
const cur = '2026-11';
ok(B.windowMonths('2026-11').join() === '2026-11,2026-12,2027-01', 'the window is this month and the next two, across a year end');
ok(B.budgetFor(d(), '2026-11', cur, 50000).amount === 50000 && B.budgetFor(d(), '2026-11', cur, 50000).source === 'interest', 'no setting: the budget is the interest income');
const yr = d({ year: { y: 2026, amount: 80000 } });
ok(B.budgetFor(yr, '2026-11', cur, 50000).amount === 80000 && B.budgetFor(yr, '2026-12', cur, 52000).source === 'manual', 'a fixed year amount covers this month and the rest of the year');
ok(B.budgetFor(yr, '2026-10', cur, 48000).amount === 48000 && B.budgetFor(yr, '2026-10', cur, 48000).source === 'interest', 'a past month always uses the interest income');
ok(B.budgetFor(yr, '2027-01', cur, 51000).amount === 51000, 'the year amount does not run into the next year');
const mo = d({ year: { y: 2026, amount: 80000 }, months: { '2026-12': 'interest', '2027-01': 90000 } });
ok(B.budgetFor(mo, '2026-12', cur, 52000).amount === 52000 && B.budgetFor(mo, '2027-01', cur, 51000).amount === 90000 && B.budgetFor(mo, '2026-11', cur, 50000).amount === 80000, 'a month can override the year: interest income or its own amount');
ok(B.budgetFor(mo, '2026-12', cur, 52000).interest === 52000, 'the interest income is always carried along');
const v = B.formValues(mo, cur);
ok(v.yearMode === 'fixed' && v.yearAmount === 80000 && v.m0 === 'follow' && v.m1 === 'interest' && v.m2 === 'fixed' && v.a2 === 90000, 'the form reads the saved plan');
const x = d(); B.save(x, cur, { yearMode: 'fixed', yearAmount: 70000, m0: 'follow', a0: '', m1: 'fixed', a1: 65000, m2: 'interest', a2: '' });
ok(x.settings.budgetPlan.year.amount === 70000 && x.settings.budgetPlan.months['2026-12'] === 65000 && x.settings.budgetPlan.months['2027-01'] === 'interest' && !('2026-11' in x.settings.budgetPlan.months), 'saving keeps only what differs');
B.save(x, cur, { yearMode: 'interest', yearAmount: '', m0: 'follow', a0: '', m1: 'follow', a1: '', m2: 'follow', a2: '' });
ok(!('budgetPlan' in x.settings), 'choosing the default everywhere removes the setting, so the file is as before');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
