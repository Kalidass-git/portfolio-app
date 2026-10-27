import { computeAll } from '../js/calc.js';
import * as IC from '../js/interestcert.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, t = 0.01) => Math.abs(a - b) < t;
const bond = { id: 'b1', name: 'Navi', holder: 'H', company: 'Navi', principal: 200000, rate: 0.115, depositDate: '2026-07-13', maturityDate: '2030-01-01', credit: 'Monthly', dueRule: 'day', dueDay: 28 };
const fdP = { id: 'f1', name: 'FD payout', account: 'HUF', principal: 100000, rate: 0.08, depositDate: '2026-01-10', maturityDate: '2028-01-10', tenure: 2, tenureType: 'Years', compound: 'Quarterly', interestType: 'Payout', payoutAmount: 2000 };
const fdC = { id: 'f2', name: 'FD comp', account: 'HUF', principal: 100000, rate: 0.08, depositDate: '2026-01-01', maturityDate: '2028-01-01', tenure: 2, tenureType: 'Years', compound: 'Monthly', interestType: 'Compound' };
const data = { settings: { tdsRate: 0.1, goldRate: 7000, assumptions: { monthlyInvestment: 0, interestPrediction: 0.1, salaryGrowth: 0 } }, accounts: [], categories: [], categoryList: [], ledger: [], savings: [], bonds: [bond], fds: [fdP, fdC], lending: [], receivables: [], stocks: [], mutualFunds: [], sipPlans: [], gold: { chits: [], schemes: [], purchases: [], jewellery: [], others: [] }, liabilities: [], targets: [], proj: { months: [] }, incomeSources: [], manualMonthlyIncome: [], reportNotes: [] };
const all = computeAll(data, { asOf: '2026-10-25' });
const ON = { projections: true };
const P = IC.periods('2026-10-25'), get = (id) => P.find((p) => p.id === id);
ok(get('cfy').from === '2026-04-01' && get('cfy').to === '2027-03-31' && get('pfy').from === '2025-04-01' && get('ny').from === '2027-01-01', 'period ranges');
ok(get('pm').from === '2026-09-01' && get('pm').to === '2026-09-30' && get('cm').to === '2026-10-31', 'month ranges');
const oct = IC.certificate(data, all, get('cm'), 'Bonds', ON);
ok(oct.rows.length === 1 && near(oct.totals.gross, 200000 * 0.115 / 365 * 30) && near(oct.totals.net, 200000 * 0.115 / 365 * 30 * 0.9) && near(oct.totals.tds, oct.totals.gross - oct.totals.net), 'Navi October 30 days: gross ' + oct.totals.gross);
ok(oct.totals.received === 0 || oct.totals.coming >= 0, 'received/coming split');
const ytd = IC.certificate(data, all, get('cy'), 'Bonds', ON);
ok(ytd.rows[0].count === 6 && near(ytd.rows[0].gross, 200000 * 0.115 / 365 * (16 + 31 + 31 + 30 + 30 + 31 + 0) , 200), 'bond payments Jul to Dec 2026: ' + ytd.rows[0].count + ' ' + ytd.rows[0].gross);
const fd = IC.certificate(data, all, get('cy'), 'Fixed deposits', ON);
const p = fd.rows.find((r) => r.name === 'FD payout');
ok(p.count === 3 && near(p.gross, 6000), 'payout FD pays 2,000 in Apr, Jul, Oct 2026 (quarterly from 10 Jan): ' + p.count + ' ' + p.gross);
const c = fd.rows.find((r) => r.name === 'FD comp');
ok(c.count === 12 && c.gross > 100000 * 0.08 * 0.99 && c.gross < 100000 * 0.0835, 'compounding FD: a year of monthly additions ' + c.gross);
ok(c.tds === 0, 'no TDS on deposits here');
const allr = IC.certificate(data, all, get('cy'), 'all', ON);
ok(allr.kinds.length === 2 && allr.byKind.length === 2 && near(allr.totals.gross, ytd.totals.gross + fd.totals.gross), 'all = bonds + deposits');
ok(near(allr.byMonth.reduce((t, m) => t + m.parts.reduce((a, x) => a + x.gross, 0), 0), allr.totals.gross), 'monthly chart adds up to the total');
const none = IC.certificate(data, all, get('py'), 'all', ON);
ok(none.rows.length === 0, 'nothing last year');
// EPF / PPF / chits
const ent = (n, a, start) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(start, i, 5)).toISOString().slice(0, 10), amount: a }));
data.savings = [
  { id: 's1', name: 'My EPF', type: 'EPF', holder: 'H', rate: 0.0825, entries: Array.from({ length: 9 }, (_, i) => ({ date: `2026-0${i + 1}-05`, employee: 3000, employer: 2000, kind: 'Deposit' })) },
  { id: 's2', name: 'My PPF', type: 'PPF', holder: 'H', rate: 0.071, entries: [{ date: '2026-01-05', amount: 120000 }] },
  { id: 's3', name: 'Open chit', type: 'Chit', holder: 'H', maturityDate: '2026-12-05', payout: 130000, entries: ent(10, 10000, 2026) },
  { id: 's4', name: 'Closed chit', type: 'Chit', holder: 'H', entries: ent(6, 10000, 2026), closed: { date: '2026-08-20', amount: 66000 } },
];
const all2 = computeAll(data, { asOf: '2026-10-25' });
const e = IC.certificate(data, all2, get('cy'), ['EPF', 'PPF'], ON);
const epf = e.rows.find((r) => r.kind === 'EPF'), ppf = e.rows.find((r) => r.kind === 'PPF');
ok(epf && epf.count === 9 && ppf.count === 9 && ppf.gross > 6390 && ppf.gross < 6500, 'PPF earns monthly on 1.2 lakh (plus March compounding) for 9 completed months: ' + ppf.gross);
ok(e.kinds.join() === 'EPF,PPF' && near(e.totals.gross, epf.gross + ppf.gross), 'two types selected');
const ch = IC.certificate(data, all2, get('cy'), ['Chits'], ON);
const open = ch.rows.find((r) => r.name === 'Open chit'), closed = ch.rows.find((r) => r.name === 'Closed chit');
ok(near(open.gross, 130000 - 120000, 0.5) && open.projected === true && open.coming > 0 && open.received === 0, 'open chit: projection of 10,000 = payout less 12 instalments: ' + open.gross);
ok(near(closed.gross, 6000, 0.5) && !closed.projected && closed.closedOn === '2026-08-20' && closed.received > 0, 'closed chit uses the amount received: ' + closed.gross);
ok(ch.totals.projected > 0 && near(ch.totals.projected, open.net), 'projected total');
const both = IC.certificate(data, all2, get('cy'), ['Chits', 'Bonds'], ON);
ok(both.kinds.join() === 'Bonds,Chits', 'multi-select order: ' + both.kinds.join());
// switch off (default): counted when paid, and only once that date has come
const offB = IC.certificate(data, all2, get('cfy'), ['Bonds']);
ok(offB.rows[0].count === 3 && offB.rows[0].projected === false, 'bonds off: only payments already due (Jul to Sep; the 28 Oct one is not due yet): ' + offB.rows[0].count);
const offC = IC.certificate(data, all2, get('cy'), ['Chits']);
ok(!offC.rows.find((r) => r.name === 'Open chit') && near(offC.rows.find((r) => r.name === 'Closed chit').gross, 6000, 0.5) && offC.rows[0].count === 1, 'chits off: open chit (ends Dec) left out; the closed one counts once, in August');
const asDec = computeAll(data, { asOf: '2026-12-20' });
const offC2 = IC.certificate(data, asDec, IC.periods('2026-12-20').find((p) => p.id === 'cy'), ['Chits']);
const oc = offC2.rows.find((r) => r.name === 'Open chit');
ok(oc && oc.count === 1 && Object.keys(oc.months)[0] === '2026-12' && oc.projected && near(oc.gross, 10000, 0.5), 'open chit counts in its completion month, as an estimate');
const fdm = { id: 'f3', name: 'FD maturing', account: 'HUF', principal: 100000, rate: 0.08, depositDate: '2025-10-27', maturityDate: '2026-10-27', tenure: 1, tenureType: 'Years', compound: 'Yearly', interestType: 'Compound' };
data.fds = [fdm];
const asM = computeAll(data, { asOf: '2026-10-27' });
const per2 = IC.periods('2026-10-27');
const fdOff = IC.certificate(data, asM, per2.find((p) => p.id === 'cfy'), ['Fixed deposits']);
ok(fdOff.rows[0].count === 1 && Object.keys(fdOff.rows[0].months)[0] === '2026-10' && fdOff.rows[0].gross > 7900 && fdOff.rows[0].gross < 8100, 'FD off: all its interest in the month it matures: ' + fdOff.rows[0].gross);
const asB = computeAll(data, { asOf: '2026-10-26' });
ok(IC.certificate(data, asB, IC.periods('2026-10-26').find((p) => p.id === 'cfy'), ['Fixed deposits']).rows.length === 0, 'FD off: nothing the day before it matures');
const fdOn = IC.certificate(data, asM, per2.find((p) => p.id === 'cfy'), ['Fixed deposits'], ON);
ok(fdOn.rows[0].count === 7, 'FD on: spread over the months of the year');
const epfOff = IC.certificate(data, all2, IC.periods('2026-10-25').find((p) => p.id === 'cfy'), ['PPF']);
ok(epfOff.rows.length === 0, 'PPF off: nothing until the March credit');
const ppfOff = IC.certificate(data, computeAll(data, { asOf: '2027-04-05' }), IC.periods('2027-04-05').find((p) => p.id === 'pfy'), ['PPF']);
ok(ppfOff.rows.length === 1 && Object.keys(ppfOff.rows[0].months).join() === '2027-03', 'PPF off: the year counted in March');
// payments later this month are not counted with the switch off, but are listed
data.lending = [{ id: 'l9', name: 'To Alagu Pandi 14', account: 'Private', borrower: 'Alagu', principal: 100000, rate: 0.12, depositDate: '2026-03-30', maturityDate: '2027-03-30', tenure: 1, tenureType: 'Years', compound: 'Monthly', interestType: 'Payout', payoutAmount: 1000 }];
const asL = computeAll(data, { asOf: '2026-10-27' });
const l1 = IC.certificate(data, asL, IC.periods('2026-10-27').find((p) => p.id === 'cm'), ['Private lending']);
ok(l1.rows.length === 0 && l1.later.length === 1 && l1.later[0].name === 'To Alagu Pandi 14' && l1.later[0].date === '2026-10-30' && near(l1.later[0].amount, 1000), 'lending due on the 30th is listed as later this month');
const l2 = IC.certificate(data, asL, IC.periods('2026-10-27').find((p) => p.id === 'pm'), ['Private lending']);
ok(l2.rows.length === 1 && l2.later.length === 0, 'last month shows it');
const l3 = IC.certificate(data, asL, IC.periods('2026-10-27').find((p) => p.id === 'cm'), ['Private lending'], ON);
ok(l3.rows.length === 1 && l3.rows[0].projected, 'switch on: counted as a projection');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
