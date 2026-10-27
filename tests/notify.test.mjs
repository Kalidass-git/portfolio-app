// Phone reminders: what gets planned, when, and that nothing runs away. Synthetic data only, no data file needed.
import { computeAll } from '../js/calc.js';
import { buildReminders, idFor, MAX_PENDING } from '../js/notify.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const base = () => ({ settings: { goldRate: 12000, tdsRate: 0.1 }, accounts: [{ id: 'a1', name: 'Bank', holder: 'X' }], ledger: [{ id: 1, date: '2026-10-01', acct: 'a1', desc: 'open', category: 'Income', credit: 100000, debit: 0 }],
  categories: [], savings: [], bonds: [], fds: [], lending: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], jewellery: [], chits: [], others: [] }, liabilities: [], targets: [], proj: [], incomeSources: [], manualMonthlyIncome: [], reportNotes: [], receivables: [] });
const dat = base();
dat.liabilities = [{ id: 'l1', name: 'Home loan', emi: 25000, emiDay: 28, principal: 1000000, rate: 0.09 }];
dat.receivables = [{ id: 'r1', name: 'Pandi', expected: 3000, balanceDue: 200000, term: 'Monthly', startDate: '2026-02-07', dueDay: 7, active: true, lastReceived: '2026-09-07' }];
dat.fds = [{ id: 'f1', name: 'Bank FD', principal: 100000, rate: 0.07, startDate: '2025-11-10', maturityDate: '2026-11-10', active: true }];
const asOf = '2026-10-26', all = computeAll(dat, { asOf });
const now = new Date(2026, 9, 26, 6, 0, 0);          // 26 Oct 2026, 6 am on the phone
const on = { on: true, hour: 9 };

ok(buildReminders(dat, all, {}, now).length === 0, 'off by default: nothing planned');
const r = buildReminders(dat, all, on, now);
ok(r.length > 0, 'something is planned');
ok(r.every((x) => x.at instanceof Date && x.at.getTime() > now.getTime()), 'all in the future');
ok(r.every((x, i) => i === 0 || r[i - 1].at <= x.at), 'soonest first');
ok(r.every((x) => x.at.getHours() === 9 && x.at.getMinutes() === 0), 'at the chosen hour');
ok(new Set(r.map((x) => x.id)).size === r.length, 'every reminder has its own id');
ok(r.every((x) => Number.isInteger(x.id) && x.id > 0 && x.id < 2147483647), 'ids fit in Android');
const emiDay = r.find((x) => x.slot === 'due' && /Home loan/.test(x.title));
ok(emiDay && emiDay.at.getDate() === 28 && /Home loan EMI due today/.test(emiDay.title) && /25,000/.test(emiDay.body), 'EMI reminder on its due day: ' + JSON.stringify(emiDay));
ok(emiDay && emiDay.href === '#/fixed/loans', 'EMI opens the Loans tab');
const eve = r.find((x) => x.slot.startsWith('before-') && /Home loan/.test(x.title));
ok(eve && eve.at.getDate() === 27 && /tomorrow/.test(eve.title), 'EMI reminder the day before: ' + JSON.stringify(eve));
const fd = r.find((x) => /Bank FD/.test(x.title));
ok(fd && fd.at.getMonth() === 10 && fd.at.getDate() === 10, 'FD maturity reminder on its date');

// amounts off: no rupee figures in the note
const priv = buildReminders(dat, all, { ...on, amounts: false }, now);
ok(priv.length === r.length && priv.every((x) => !/₹/.test(x.body)), 'amounts hidden on request');
// kinds can be switched off
const noEmi = buildReminders(dat, all, { ...on, emi: false }, now);
ok(noEmi.every((x) => !/Home loan/.test(x.title + x.body)), 'EMI reminders can be turned off');
ok(buildReminders(dat, all, { ...on, maturities: false }, now).every((x) => !/Bank FD/.test(x.title + x.body)), 'maturity reminders can be turned off');
// stable: same input, same plan
ok(JSON.stringify(buildReminders(dat, all, on, now)) === JSON.stringify(r), 'same data gives the same plan');
// a reminder time that has passed today is not planned
const late = buildReminders(dat, all, on, new Date(2026, 9, 26, 12, 0, 0));
ok(late.every((x) => x.at.getTime() > new Date(2026, 9, 26, 12, 0, 0).getTime()), 'past times dropped');

// overdue: the EMI was due on the 5th and is not paid: nudged for three mornings
const d2 = base(); d2.liabilities = [{ id: 'l1', name: 'Car loan', emi: 12000, emiDay: 5, principal: 500000, rate: 0.09 }];
const a2 = computeAll(d2, { asOf });
const od = buildReminders(d2, a2, on, now).filter((x) => x.slot === 'overdue');
ok(od.length === 3 && /Car loan EMI is overdue/.test(od[0].title), 'overdue EMI nudges three mornings: ' + JSON.stringify(od.map((x) => x.title)));
ok(od[0].at.getDate() === 26 && od[2].at.getDate() === 28, 'on consecutive mornings');

// money due to you, overdue, with the "(overdue)" wording of the app cleaned off
const d3 = base(); d3.receivables = dat.receivables;
const a3 = computeAll(d3, { asOf });
const rec = buildReminders(d3, a3, on, now);
ok(rec.every((x) => !/\(overdue\)|\(due today\)/.test(x.title + x.body)), 'no "(overdue)" leftovers in the words');

// never more than the cap, even with a lot of items
const d4 = base(); d4.liabilities = Array.from({ length: 80 }, (_, i) => ({ id: 'L' + i, name: 'Loan ' + i, emi: 1000 + i, emiDay: 1 + (i % 28), principal: 100000, rate: 0.1 }));
ok(buildReminders(d4, computeAll(d4, { asOf }), on, now).length <= MAX_PENDING, 'capped at ' + MAX_PENDING);
// several things on one day become one note
const d5 = base(); d5.liabilities = [{ id: 'a', name: 'Loan A', emi: 1000, emiDay: 28, principal: 1, rate: 0.1 }, { id: 'b', name: 'Loan B', emi: 2000, emiDay: 28, principal: 1, rate: 0.1 }];
const one = buildReminders(d5, computeAll(d5, { asOf }), on, now).find((x) => x.slot === 'due');
ok(one && /2 payments due today/.test(one.title) && /Total ₹3,000/.test(one.body), 'one note for the day: ' + JSON.stringify(one));
ok(idFor('x') === idFor('x') && idFor('x') !== idFor('y'), 'ids are repeatable');
console.log(bad ? bad + ' failed' : 'reminder tests passed'); process.exit(bad ? 1 : 0);
