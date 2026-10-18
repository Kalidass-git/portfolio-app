import fs from 'node:fs';
import * as C from '../js/calc.js';
import * as R from '../js/risk.js';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const all = C.computeAll(data, { asOf: '2026-10-11', useLive: false });
let fail = 0; const ok = (l, c, i = '') => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', l, i); };
const cfg = R.riskCfg(data), st = R.stateNow(data, all), ev = R.evaluate(cfg, st);
ok('class values add to total assets', Math.abs(Object.values(st.cls).reduce((a, x) => a + x, 0) - st.total) < 1);
ok('bucket shares add to 100%', Math.abs(ev.buckets.reduce((a, b) => a + b.pct, 0) - 1) < 1e-6);
// a limit of 15% on lending: headroom puts it exactly at 15%
const T = st.total, v = st.cls.lending, c2 = { ...cfg, classes: { ...cfg.classes, lending: { ...cfg.classes.lending, max: 0.15 } } };
const hnew = R.headroom(c2, st, { cls: 'lending', funding: 'new' });
const after = R.evaluate(c2, R.applyEntries(st, [{ cls: 'lending', amount: hnew.room, funding: 'new' }])).classes.find((c) => c.key === 'lending');
ok('new-money headroom lands on the cap', Math.abs(after.pct - 0.15) < 1e-6, (after.pct * 100).toFixed(3));
const hcash = R.headroom(c2, st, { cls: 'lending', funding: 'cash' });
const after2 = R.evaluate(c2, R.applyEntries(st, [{ cls: 'lending', amount: hcash.room, funding: 'cash' }])).classes.find((c) => c.key === 'lending');
ok('cash-funded headroom lands on the cap', Math.abs(after2.pct - 0.15) < 1e-6, (after2.pct * 100).toFixed(3));
ok('cash funding allows no more than new money', hcash.room <= hnew.room + 1e-6);
// Navi override: 10L per issuer
const navi = st.items.find((x) => x.scope === 'bonds' && /navi/i.test(x.name));
if (navi) { const h = R.headroom(cfg, st, { cls: 'bonds', name: 'Navi', funding: 'new' }); ok('Navi room = 10L minus held', Math.abs(h.room - Math.max(0, 1e6 - navi.value)) < 1, `${Math.round(navi.value)} held, room ${Math.round(h.room)}`); }
// a share over the cap is flagged
const big = R.evaluate(cfg, R.applyEntries(st, [{ cls: 'shares', name: 'KTKBANK', amount: st.cls.shares, funding: 'cash' }]));
ok('doubling one share flags it', big.items.some((i) => /karnataka/i.test(i.name) && i.over));
ok('sell reduces and returns to cash', R.applyEntries(st, [{ cls: 'gold', amount: -1000, funding: 'cash' }]).cls.cash === st.cls.cash + 1000);
ok('settings always use investments only', cfg.basis === 'invest' && R.riskCfg({ risk: { basis: 'total' } }).basis === 'invest');
// bases: investments-only leaves bank balances out of the total
const cInv = { ...cfg, basis: 'invest', classes: { ...cfg.classes, lending: { ...cfg.classes.lending, max: 0.15 } } };
const evInv = R.evaluate(cInv, st);
const lend = evInv.classes.find((c) => c.key === 'lending');
ok('investments-only share is larger than share of everything', lend.pct > R.evaluate({ ...c2, basis: 'total' }, st).classes.find((c) => c.key === 'lending').pct, (lend.pct * 100).toFixed(2));
const hInv = R.headroom(cInv, st, { cls: 'lending', funding: 'cash' });
const aInv = R.evaluate(cInv, R.applyEntries(st, [{ cls: 'lending', amount: hInv.room, funding: 'cash' }])).classes.find((c) => c.key === 'lending');
ok('investments-only headroom lands on the cap', Math.abs(aInv.pct - 0.15) < 1e-6, (aInv.pct * 100).toFixed(3));
const cMkt = { ...cfg, rules: { ...cfg.rules, stocks: { max: 0.2, maxAmt: null, of: 'market' } } };
const k = st.items.find((x) => /karnataka/i.test(x.name));
const hM = R.headroom(cMkt, st, { cls: 'shares', name: 'KTKBANK', funding: 'cash' });
const aM = R.applyEntries(st, [{ cls: 'shares', name: 'KTKBANK', amount: hM.room, funding: 'cash' }]);
const eM = R.exposureOf(cMkt, aM, 'KTKBANK', 'shares');
ok('market-basis headroom lands on the cap', Math.abs(eM.pct - 0.2) < 1e-6, (eM.pct * 100).toFixed(3));
const anon = R.evaluate(cfg, R.applyEntries(st, [{ cls: 'shares', amount: 5e5, funding: 'cash' }]));
ok('unnamed purchase is not flagged as one holding', !anon.items.some((i) => i.over && /unnamed/.test(i.name)));
// chits by organiser, FDs by bank, caps in rupees on a kind, amber near a limit
const ch = st.items.filter((x) => x.scope === 'chits'); const fdh = st.items.filter((x) => x.scope === 'fds'); const lc = st.items.filter((x) => x.scope === 'lic');
console.log('chit groups:', ch.map((x) => `${x.name}=${Math.round(x.value)}(${x.count})`).join('; '));
console.log('FD issuers:', fdh.map((x) => `${x.name}=${Math.round(x.value)}(${x.count})`).join('; '), '| lic:', lc.map((x) => x.name).join(','));
ok('chit values add to the chits class', Math.abs(ch.reduce((a, x) => a + x.value, 0) - st.cls.chits) < 1);
const cAmt = { ...cfg, classes: { ...cfg.classes, lending: { ...cfg.classes.lending, max: null, maxAmt: 3000000 } } };
const rAmt = R.evaluate(cAmt, st).classes.find((c) => c.key === 'lending');
ok('a rupee cap on a kind works', rAmt.maxAmt === 3000000 && !rAmt.over && rAmt.room > 0, `room ${Math.round(rAmt.room)}`);
const hA = R.headroom(cAmt, st, { cls: 'lending', funding: 'cash' });
ok('rupee-cap headroom is cap minus held', Math.abs(hA.room - (3000000 - st.cls.lending)) < 1);
const over = R.evaluate(cAmt, R.applyEntries(st, [{ cls: 'lending', amount: hA.room + 1000, funding: 'cash' }])).classes.find((c) => c.key === 'lending');
ok('one rupee thousand over the cap is flagged', over.over);
const near = R.evaluate(cAmt, R.applyEntries(st, [{ cls: 'lending', amount: hA.room * 0.95, funding: 'cash' }]));
ok('95% used is amber, not red', near.near.some((r) => r.key === 'lending') && !near.breaches.some((r) => r.key === 'lending'));
const cChit = { ...cfg, rules: { ...cfg.rules, chits: { max: null, maxAmt: 500000, of: 'total' } } };
const chitOver = R.evaluate(cChit, st).items.filter((x) => x.scope === 'chits');
ok('a per-organiser rupee cap on chits is checked', chitOver.length === ch.length);
const newLoan = R.evaluate({ ...cfg, rules: { ...cfg.rules, lending: { max: null, maxAmt: 2500000, of: 'total' } } }, R.applyEntries(st, [{ cls: 'lending', name: 'Alagu Pandi', amount: 500000, funding: 'cash' }]));
ok('lending more to the same person adds to that person', newLoan.items.some((x) => /alagu/i.test(x.name) && x.over));
// optional organiser / issuer / borrower fields group things; records without them are unchanged
const d2 = JSON.parse(JSON.stringify(data));
d2.savings.filter((x) => x.type === 'Chit').forEach((x) => { x.organiser = 'Ravi Chits'; });
d2.fds.forEach((x) => { x.issuer = 'One Bank'; });
const a2 = C.computeAll(d2, { asOf: '2026-10-11', useLive: false });
const s2 = R.stateNow(d2, a2);
ok('organiser field groups all chits together', s2.items.filter((x) => x.scope === 'chits').length === 1 && s2.items.find((x) => x.scope === 'chits').name === 'Ravi Chits');
ok('issuer field groups all FDs together', s2.items.filter((x) => x.scope === 'fds').length === 1);
ok('records without the fields still work as before', st.items.filter((x) => x.scope === 'chits').length === 3);
process.exit(fail ? 1 : 0);
