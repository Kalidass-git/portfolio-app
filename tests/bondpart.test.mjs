import { bondSchedule, bondNetIn, bondDaysIn, calcBond } from '../js/calc.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, t = 0.01) => Math.abs(a - b) < t;
// the Navi case: 11.5%, due the 28th, bought 13 Jul 2026
const navi = { id: 'b1', name: 'Navi_Jul26_Nov32', principal: 200000, rate: 0.115, depositDate: '2026-07-13', maturityDate: '2032-11-13', credit: 'Monthly', dueRule: 'day', dueDay: 28 };
ok(bondDaysIn(navi, '2026-10') === 30 && near(bondNetIn(navi, '2026-10', 0.1), 200000 * 0.115 / 365 * 30 * 0.9), 'Oct: 29 Sep to 28 Oct = 30 days');
ok(near(bondNetIn(navi, '2026-10', 0.1), 1701.37, 0.01), 'Oct payment is 1,701');
ok(near(calcBond(navi, '2026-10-25', { tdsRate: 0.1 }).monthNet, 1701.37, 0.01), 'Bonds page figure matches Home: ' + calcBond(navi, '2026-10-25', { tdsRate: 0.1 }).monthNet);
const sc0 = bondSchedule([navi], navi, '2026-10-25', 0.1);
ok(sc0.rows[0].month === '2026-07' && sc0.rows[0].days === 16 && sc0.rows[0].from === '2026-07-13', 'first payment 13 to 28 Jul = 16 days');
ok(sc0.rows[sc0.rows.length - 1].month === '2032-11' && sc0.rows[sc0.rows.length - 1].back === 200000, 'principal back in the maturity month');
// part close: 1 lakh back on 15 Oct 2026
const rest = { ...navi, principal: 100000, partials: [] };
const part = { ...navi, id: 'b2', name: 'Navi (part 1)', principal: 100000, partOf: 'b1', partKey: 'b1-P1', closed: { date: '2026-10-15', amount: 100000 } };
const sc = bondSchedule([rest, part], rest, '2026-12-01', 0.1);
const oct = sc.rows.find((r) => r.month === '2026-10'), nov = sc.rows.find((r) => r.month === '2026-11');
ok(oct.back === 100000 && nov.back === 0, 'part principal returned in October only');
ok(near(nov.net, 100000 * 0.115 / 365 * 31 * 0.9), 'after the part-close only the remaining 1 lakh earns: ' + nov.net);
const sep = sc.rows.find((r) => r.month === '2026-09');
ok(near(sep.net, 200000 * 0.115 / 365 * 31 * 0.9), 'before it, both parts together earn on 2 lakh');
console.log(bad ? 'FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
