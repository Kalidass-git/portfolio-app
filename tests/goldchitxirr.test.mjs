// A running gold chit counts in the gold value at cost, so its payments must be in the gold return's cash flows too.
import fs from 'fs';
import * as C from '../js/calc.js';
const data = JSON.parse(fs.readFileSync(process.argv[2] || new URL('../data/sample.json', import.meta.url), 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
data.settings.goldRate = 10000;
data.gold.purchases = [{ id: 'g1', date: '2025-11-09', grams: 10, amount: 100000 }];   // 1 year, now worth 100000 -> 0%
data.gold.schemes = [];
const base = C.returns(data, C.computeAll(data, { asOf: '2026-11-09', useLive: false })).find((r) => r.name === 'Gold');
data.gold.chits = [{ id: 'c1', name: 'Jeweller', entries: [{ date: '2026-05-09', amount: 20000 }, { date: '2026-06-09', amount: 20000 }, { date: '2026-07-09', amount: 20000 }] }];
const withChit = C.returns(data, C.computeAll(data, { asOf: '2026-11-09', useLive: false })).find((r) => r.name === 'Gold');
ok(Math.abs(base.xirr) < 0.001, 'plain gold at cost: ~0% (' + base.xirr + ')');
ok(Math.abs(withChit.xirr) < 0.001, 'chit money at cost adds no return (' + withChit.xirr + ')');
// a chit paid month by month for a year, closed into gold worth exactly what was paid: ~0%, not a huge rate from a one-day purchase
data.gold.chits = [{ id: 'c2', name: 'Done', entries: Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.UTC(2025, 10 + i, 9)).toISOString().slice(0, 10), amount: 10000 })), closed: { date: '2026-11-09', grams: 12, amount: 120000, extra: 0, purchaseId: 'g9' } }];
data.gold.purchases = [{ id: 'g9', date: '2026-11-09', grams: 12, amount: 120000 }];
data.settings.goldRate = 10000;
const closedChit = C.returns(data, C.computeAll(data, { asOf: '2026-11-09', useLive: false })).find((r) => r.name === 'Gold');
ok(closedChit.xirr < 0.05, 'closed chit paid over a year is not shown as a one-day purchase (' + closedChit.xirr + ')');
console.log(fails ? 'FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
