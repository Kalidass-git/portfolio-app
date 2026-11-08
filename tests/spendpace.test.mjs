// The usual spending pace: rent early, groceries all month, one-offs not expected.
import { usualPace, paceSentence, lineTone, shiftMonths, usualByKey } from '../js/spendpace.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const led = []; const add = (m, d, cat, amt) => led.push({ date: `${m}-${String(d).padStart(2, '0')}`, category: cat, debit: amt, credit: 0, desc: cat });
for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) { add(m, 2, 'Rent', 15000); for (let d = 1; d <= 28; d += 3) add(m, d, 'Family Budget', 1000); if (m === '2026-07') add(m, 15, 'Medical', 9000); }
const data = { ledger: led, settings: {}, categories: [] };
// no calc kinds here: use a tiny stand-in for the month list through the real calc module
import * as C from '../js/calc.js';
let p = null; try {
  const mc = { spend: [{ name: 'Rent', amount: 15000, cats: ['rent'] }, { name: 'Groceries & needs', amount: 4000, cats: ['family budget'] }, { name: 'Medical', amount: 12000, cats: ['medical'] }], lifestyle: { name: 'Lifestyle', amount: 0, cats: ['cloths'] } };
  p = usualPace(data, mc, '2026-10', 8);
  ok(p && p.months === 5, 'learns from the 5 earlier months');
  const rent = p.lines.find((l) => l.name === 'Rent'), gro = p.lines.find((l) => l.name === 'Groceries & needs'), med = p.lines.find((l) => l.name === 'Medical');
  ok(rent.kind === 'early' && rent.usualNow === 15000 && rent.usualMonth === 15000, 'rent is expected early: all of it by day 8');
  ok(gro.kind === 'steady' && gro.usualNow === 3000 && gro.usualMonth === 10000, 'groceries: usual ₹3,000 by day 8 of ₹10,000 a month');
  ok(med.kind === 'oneoff' && med.usualNow === 0 && med.diff === 12000, 'medical in 1 of 5 months is a one-off, not expected');
  ok(Math.round(p.expectedNow) === 18000 && p.spent === 31000, 'expected by now 18,000 vs spent 31,000');
  ok(Math.round(p.projected) === 31000 + 7000, 'month end: spent + usual rest of groceries (7,000)');
  ok(/ahead of your usual pace/.test(paceSentence(p, (v) => '₹' + Math.round(v), 8)) && /medical/.test(paceSentence(p, (v) => '₹' + Math.round(v), 8)), 'sentence names the reason');
  ok(usualPace({ ledger: led.filter((e) => e.date.startsWith('2026-09')), settings: {}, categories: [] }, mc, '2026-10', 8) === null, 'one earlier month is not enough: null');
} catch (e) { bad++; console.log('FAIL threw', e.message); }
ok(lineTone(500, 1000) === 'good' && lineTone(849, 1000) === 'good' && lineTone(850, 1000) === 'warn' && lineTone(1150, 1000) === 'warn' && lineTone(1151, 1000) === 'bad', 'tone: under 85% green, 85-115% amber, above 115% red');
ok(lineTone(5000, 0, 'oneoff') === 'bad' && lineTone(5000, 0, 'steady') === null && lineTone(0, 1000) === null, 'tone: a one-off is red, nothing spent has no colour');
ok(shiftMonths('2026-03-31', -1) === '2026-02-28' && shiftMonths('2026-01-15', -2) === '2025-11-15' && shiftMonths('2026-11-08', -11) === '2025-12-08', 'shiftMonths keeps the day and cuts back in a shorter month');
{
  const val = { '2026-07': { Rent: 15000, Food: 2000 }, '2026-08': { Rent: 15000, Food: 2400, Travel: 6000 }, '2026-09': { Rent: 15000, Food: 2200 }, '2026-10': { Rent: 15000, Food: 2100 } };
  const sum = (f) => new Map(Object.entries(val[f.slice(0, 7)] || {}));
  const u = usualByKey('2026-11-01', '2026-11-08', sum, (m) => !!val[m]);
  ok(u && u.get('Rent').usual === 15000 && u.get('Food').usual === 2150 && u.get('Travel').kind === 'oneoff' && u.get('Travel').usual === 0, 'usual by category over the same days of earlier months; travel in 1 of 4 is a one-off');
  ok(usualByKey('2026-11-01', '2026-11-08', sum, (m) => m === '2026-10') === null, 'one earlier month is not enough');
}
console.log(bad ? bad + ' FAILED' : 'ALL OK'); process.exit(bad ? 1 : 0);
