import { modelFlows } from '../js/epf.js';
import { xirr } from '../js/calc.js';
const toMs = (d) => Date.parse(d + 'T00:00:00Z');
const sv = { type: 'EPF', rate: 8.25, entries: [{ date: '2020-04-01', employee: 100000, employer: 0 }] };
const m = modelFlows(sv, '2025-04-01', toMs);
const x = xirr(m.flows);
if (!(x > 0.08 && x < 0.09)) { console.error('EPF XIRR off', x); process.exit(1); }
console.log('epf ok', (x * 100).toFixed(2));
