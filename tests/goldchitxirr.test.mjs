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
console.log(fails ? 'FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
