import { computeAll, bondNetIn } from '../js/calc.js';
import * as I from '../js/insights.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, t = 0.01) => Math.abs(a - b) < t;
// two made-up bonds: A pays on the 5th (already due this month), B on the 24th (not due yet on 21 Oct)
const mk = (id, name, dueDay) => ({ id, name, holder: 'H', platform: 'P', company: name, principal: 200000, depositDate: '2025-01-01', maturityDate: '2030-01-01', credit: 'Monthly', rate: 0.1, dueRule: 'day', dueDay });
const bonds = [mk('b1', 'Alpha', 5), mk('b2', 'Beta', 24)];
const data = {
  settings: { tdsRate: 0.1, goldRate: 7000, assumptions: { monthlyInvestment: 0, interestPrediction: 0.1, salaryGrowth: 0 } },
  accounts: [{ id: 'a1', name: 'Bank', holder: 'H', type: 'Savings', openingBalance: 0 }], categories: [], categoryList: [{ name: 'Income Bond', kind: 'income', budget: 0 }],
  ledger: [], savings: [], bonds, fds: [], lending: [], receivables: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { chits: [], schemes: [], purchases: [], jewellery: [], others: [] }, liabilities: [], targets: [], proj: { months: [] }, incomeSources: [], manualMonthlyIncome: [], reportNotes: [],
};
const per = (b, m) => bondNetIn(b, m, 0.1);   // each payment covers the days since the previous payment day up to its due date
// credits for every payment that is due, on its due date (April to October, Alpha; April to September, Beta)
const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
for (const m of months) data.ledger.push({ id: data.ledger.length + 1, acct: 'a1', date: m + '-05', desc: 'Alpha', category: 'Income Bond', credit: per(bonds[0], m), debit: 0 });
for (const m of months.slice(0, 6)) data.ledger.push({ id: data.ledger.length + 1, acct: 'a1', date: m + '-24', desc: 'Beta', category: 'Income Bond', credit: per(bonds[1], m), debit: 0 });
const all = computeAll(data, { asOf: '2026-10-21' });
const row = (b) => ({ kind: 'Bonds', name: b.name, ref: b });
const beta = I.holdingMonths(data, all, row(bonds[1]), '2026-04-01', '2026-10-21');
const oct = beta.find((x) => x.month === '2026-10'), sep = beta.find((x) => x.month === '2026-09');
ok(!oct, 'Beta (due the 24th): October is not counted at all until its payment is due, and it is not pro-rated to today');
ok(sep && sep.days === 31 /* 25 Aug to 24 Sep */ && near(sep.due, per(bonds[1], '2026-09')) && near(sep.received, sep.due, 0.05), 'September is whole, due and found in the bank');
const alpha = I.holdingMonths(data, all, row(bonds[0]), '2026-04-01', '2026-10-21');
const aOct = alpha.find((x) => x.month === '2026-10');
ok(aOct.days === 30 /* 6 Sep to 5 Oct */ && near(aOct.due, per(bonds[0], '2026-10')) && near(aOct.received, aOct.due, 0.05), 'Alpha (due the 5th) has been paid: its payment (6 Sep to 5 Oct, 30 days) counts, matched to the bank');
const sumGross = (res) => res.interestBy.find((g) => g.kind === 'Bonds').rows.filter((r) => r.name === 'Beta').reduce((t, r) => t + r.gross, 0);
const ts = I.taxSummary(data, all, 2026, 'all'), ts25 = I.taxSummary(data, computeAll(data, { asOf: '2026-10-25' }), 2026, 'all');
const day = bonds[1].principal * bonds[1].rate / 365;
ok(near(sumGross(ts), day * 184, 0.5), 'tax holdings, Beta on 21 Oct: payments up to 24 Sep (25 Mar to 24 Sep = 184 days), nothing for October');
ok(near(sumGross(ts25), day * (184 + 30), 0.5), 'on the 25th Beta has paid 25 Sep to 24 Oct (30 days)');
// Bank against holdings: payments whose due date has passed against the bank credits, so a bond not yet due does not make the bank look short
const p = I.taxProjection(data, all, 2026, 'all', {});
const expected = months.reduce((t, m) => t + per(bonds[0], m), 0) + months.slice(0, 6).reduce((t, m) => t + per(bonds[1], m), 0);
ok(near(p.recon.expectedNow, expected, 0.5), 'expected from due payments only: ' + p.recon.expectedNow + ' vs ' + expected);
ok(p.recon.status === 'ok' && Math.abs(p.recon.diff) < 1, 'bank matches the holdings: ' + p.recon.status + ' ' + p.recon.diff);
// on the 25th Beta's October payment has come due, and the bank is short until it is credited
const all25 = computeAll(data, { asOf: '2026-10-25' });
const p25 = I.taxProjection(data, all25, 2026, 'all', {});
ok(near(p25.recon.expectedNow, expected + per(bonds[1], '2026-10'), 0.5) && near(p25.recon.diff, -per(bonds[1], '2026-10'), 0.5), 'once due, an uncredited payment shows as the gap');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
