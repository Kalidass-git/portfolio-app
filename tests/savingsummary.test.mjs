// Savings page summaries: interest so far on open holdings, actual results of closed ones. Synthetic data.
import { holdingNow, openSummary, closedSummary } from '../js/savingsummary.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, t = 0.01) => Math.abs(a - b) <= t;
// a recurring deposit: 1000 paid a year before today at 10% -> about 100 interest
const rd = { type: 'RD', rate: 0.10, principal: 1000, entries: [{ date: '2025-11-01', amount: 1000 }] };
const h1 = holdingNow(rd, '2026-11-01');
ok(near(h1.interest, 100, 0.5) && near(h1.worth, 1100, 0.5), 'RD: a year at 10% earns about a tenth');
ok(holdingNow({ ...rd, entries: [{ date: '2026-12-01', amount: 1000 }] }, '2026-11-01').interest === 0, 'a payment dated in the future earns nothing yet');
// provident fund: balance 10000 of which 500 was credited interest; credited on 2026-03-31, 7.1%, 100 days later
const pf = { type: 'EPF', rate: 0.071, principal: 10000, entries: [{ date: '2025-06-01', employee: 4750, employer: 4750 }, { date: '2026-03-31', kind: 'Interest', employee: 500, employer: 0 }] };
const hp = holdingNow(pf, '2026-07-09');
ok(hp.credited === 500 && hp.paid === 9500, 'PF: credited interest is split from what was paid in');
ok(near(hp.accruing, 10000 * 0.071 * 100 / 365, 0.01) && near(hp.worth, 10000 + hp.accruing, 0.01), 'PF: balance accrues from the last credit');
const sm = openSummary([rd, pf], '2026-11-01', (s) => s.principal * 1.2);
ok(near(sm.paid, 10500, 0.01) && sm.count === 2 && sm.maturity === null, 'totals add up; no end amount when a provident fund is in the mix');
const sm2 = openSummary([rd, { ...rd, principal: 500 }], '2026-11-01', (s) => s.principal * 1.2);
ok(near(sm2.maturity, 1800, 0.01), 'end amounts add up for deposits');
// closed: paid 1000 a year before and got 1100 back
const c1 = { type: 'Chit', principal: 1000, entries: [{ date: '2025-01-01', amount: 1000 }], closed: { date: '2026-01-01', amount: 1100 } };
const c2 = { type: 'RD', principal: 2000, entries: [{ date: '2025-01-01', amount: 2000 }], closed: { date: '2026-01-01', amount: 1900 } };
const cs = closedSummary([c1, c2]);
ok(cs.all.paid === 3000 && cs.all.got === 3000 && cs.all.gain === 0, 'closed totals: paid, received, gain');
ok(near(cs.byKind.find((k) => k.kind === 'Chit').xirr, 0.1, 0.002), 'a chit paid once and returned with 10% a year later has XIRR about 10%');
ok(cs.byKind.find((k) => k.kind === 'RD').gain === -100, 'a loss shows as a negative gain');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
