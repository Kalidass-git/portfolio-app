// A matured holding stays in the Action centre list as overdue until it is closed or its maturity date is moved. Synthetic data.
import { computeAll, upcoming } from '../js/calc.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const mk = () => ({
  settings: { goldRate: 12000, tdsRate: 0.1 }, accounts: [], ledger: [], categories: [], savings: [
    { id: 's1', name: 'Old chit', type: 'Chit', maturityDate: '2026-10-20', entries: [{ date: '2026-01-05', amount: 5000 }] },
  ],
  bonds: [{ id: 'b1', name: 'Old bond', holder: 'H', principal: 100000, rate: 0.1, depositDate: '2024-01-01', maturityDate: '2026-10-10', credit: 'Monthly', dueRule: 'day', dueDay: 5 }],
  fds: [{ id: 'f1', name: 'Old FD', account: 'A', principal: 50000, rate: 0.07, depositDate: '2025-01-01', maturityDate: '2026-09-01', tenure: 1, tenureType: 'Years', compound: 'Quarterly', interestType: 'Compound' }],
  lending: [{ id: 'l1', name: 'Old loan', principal: 20000, rate: 0.12, depositDate: '2025-06-01', maturityDate: '2026-10-25', interestType: 'Compound', compound: 'Monthly' }],
  stocks: [], mutualFunds: [], sipPlans: [], gold: { purchases: [], schemes: [], jewellery: [], chits: [], others: [] }, liabilities: [], targets: [], proj: [], incomeSources: [], reportNotes: [], manualMonthlyIncome: [], receivables: [],
});
const run = (d) => upcoming(d, computeAll(d, { asOf: '2026-11-02' }), 60);
let d = mk(), up = run(d);
const by = (k) => up.find((u) => u.kind === k && u.days < 0);
ok(by('Bond') && by('Bond').date === '2026-10-10' && /matured \(overdue\)/.test(by('Bond').title), 'a matured bond is listed as overdue');
ok(by('Fixed deposit') && by('Fixed deposit').days === -62, 'a matured FD is listed as overdue');
ok(by('Lending') && /due back \(overdue\)/.test(by('Lending').title), 'matured lending is listed as overdue');
ok(by('Chit') && by('Chit').days < 0, 'a matured chit is listed as overdue');
ok(by('Bond').ref === 'bondmat:b1|2026-10-10', 'the ref is the same whatever the wording');
// moving the maturity date out takes it off the overdue list
d.bonds[0].maturityDate = '2027-10-10'; d.fds[0].maturityDate = '2026-12-01';
up = run(d);
ok(!up.some((u) => u.kind === 'Bond' && u.days < 0) && !up.some((u) => u.kind === 'Fixed deposit' && u.days < 0), 'an extended maturity date is no longer overdue');
ok(up.some((u) => u.kind === 'Fixed deposit' && u.days === 29), 'and the FD is listed ahead of its new date');
// closing removes it
d.lending[0].closed = { date: '2026-10-26', amount: 21000 };
up = run(d);
ok(!up.some((u) => u.kind === 'Lending'), 'a closed holding is gone');
// still ahead of its date: wording as before
d = mk(); d.bonds[0].maturityDate = '2026-11-20'; up = run(d);
ok(up.find((u) => u.kind === 'Bond' && u.days === 18).title === 'Old bond matures', 'before the date it still says matures');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
