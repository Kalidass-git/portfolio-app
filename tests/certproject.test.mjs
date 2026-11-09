// EPF and PPF are projected forward when "Include projections" is on; "Next month" is a period of its own.
import fs from 'fs';
import * as C from '../js/calc.js';
import * as IC from '../js/interestcert.js';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const mk = (y, m) => `${y}-${String(m).padStart(2, '0')}-05`;
const epf = { id: 's1', type: 'EPF', name: 'EPF', entries: [] };
for (let i = 0; i < 14; i++) { const m = ((i + 8) % 12) + 1, y = 2025 + Math.floor((i + 8) / 12); epf.entries.push({ date: mk(y, m), deposit: 10000, amount: 10000 }); }
const ppf = { id: 's2', type: 'PPF', name: 'PPF', rate: 0.071, entries: [{ date: '2025-04-05', deposit: 150000, amount: 150000 }] };
data.savings = [epf, ppf]; data.bonds = []; data.fds = []; data.lending = [];
const asOf = '2026-11-09', all = C.computeAll(data, { asOf, useLive: false });
const per = IC.periods(asOf);
const nm = per.find((p) => p.id === 'nm');
ok(nm && nm.from === '2026-12-01' && nm.to === '2026-12-31', 'Next month is December 2026');
const off = IC.certificate(data, all, nm, [], { projections: false });
ok(off.rows.every((r) => Object.keys(r.months).length === 0), 'without projections nothing is counted for next month');
const on = IC.certificate(data, all, nm, [], { projections: true });
const e = on.rows.find((r) => r.kind === 'EPF'), p = on.rows.find((r) => r.kind === 'PPF');
ok(e && e.months['2026-12'] && e.months['2026-12'].proj && e.months['2026-12'].gross > 0, 'EPF has a projected figure for December (' + (e && e.months['2026-12'] && Math.round(e.months['2026-12'].gross)) + ')');
ok(p && p.months['2026-12'] && p.months['2026-12'].proj && p.months['2026-12'].gross >= 150000 * 0.071 / 12, 'PPF projected = balance x rate / 12 (' + (p && p.months['2026-12'] && Math.round(p.months['2026-12'].gross)) + ')');
const fy = IC.certificate(data, all, per.find((x) => x.id === 'cfy'), [], { projections: true });
ok(fy.rows.find((r) => r.kind === 'PPF').months['2026-11'].proj === true, 'this month is marked projected, earlier ones are not');
ok(!fy.rows.find((r) => r.kind === 'PPF').months['2026-10'].proj, 'a completed month is not marked projected');
ok(fy.rows.find((r) => r.kind === 'EPF').months['2026-11'] && fy.rows.find((r) => r.kind === 'EPF').months['2026-11'].gross > 0, 'EPF this month (rate not declared yet) uses the latest declared rate');
console.log(fails ? 'FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
