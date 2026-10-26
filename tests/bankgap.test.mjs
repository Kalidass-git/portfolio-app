// Current-month cross-check of bond interest against the bank's Income Bond credits. No data file needed.
import { bondBankGap, BANK_TOLERANCE } from '../js/calc.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const mk = (bankCredit, bonds) => ({ income: [{ name: 'Income Bond', bonds, bankCredit }] });
const A = { name: 'A', expected: 3000, received: 3000, credited: 3000, due: '2026-10-05' }, B = { name: 'B', expected: 2500, received: 2500, credited: 0, due: '2026-10-12' }, C = { name: 'C', expected: 1800, received: 0, credited: 0, due: '2026-10-28' };
let g = bondBankGap(mk(3000, [A, B, C]), '2026-10', '2026-10-25');
ok(g && g.gap === 2500 && g.due === 5500 && g.bonds.length === 1 && g.bonds[0].name === 'B' && g.bonds[0].short === 2500, 'missing credit found: ' + JSON.stringify(g));
ok(bondBankGap(mk(5500, [A, B, C]), '2026-10', '2026-10-25') === null, 'all credited');
ok(bondBankGap(mk(5300, [A, B, C]), '2026-10', '2026-10-25') === null && BANK_TOLERANCE === 300, 'a gap under 300 is ignored');
ok(bondBankGap(mk(5200, [A, B, C]), '2026-10', '2026-10-25').gap === 300, 'exactly 300 is shown');
ok(bondBankGap(mk(0, [A, B, C]), '2026-09', '2026-10-25') === null, 'only the current month');
ok(bondBankGap(mk(0, [C]), '2026-10', '2026-10-25') === null, 'nothing due yet');
ok(bondBankGap({ income: [] }, '2026-10', '2026-10-25') === null, 'no bond line');
console.log(bad ? bad + ' failed' : 'bank gap tests passed'); process.exit(bad ? 1 : 0);
