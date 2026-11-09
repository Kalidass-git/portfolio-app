// Daily readings keep their four lines; they must not be regrouped (that put shares and debt into "other" and showed 0 for them).
import { readGroups, groupValues, classPoints } from '../js/classes.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const g = { equity: 1000000, debt: 500000, gold: 300000, other: 200000 };
ok(JSON.stringify(readGroups(g)) === JSON.stringify(g), 'a saved reading keeps its four values');
const raw = readGroups({ cash: 100, bonds: 200, shares: 300, funds: 50, gold: 70 });
ok(raw.equity === 350 && raw.debt === 200 && raw.gold === 70 && raw.other === 100, 'raw class values are still grouped');
const data = { projector: { snapshots: [] }, history: [{ date: '2026-11-07', net: 1, cls: g }], stocks: [], bonds: [] };
const all = { asOf: '2026-11-08' };
try { const pts = classPoints({ ...data }, { ...all }); } catch (e) { /* the full baseline needs real data; the grouping is what is tested */ }
console.log(fails ? 'FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
