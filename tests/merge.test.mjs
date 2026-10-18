import { merge } from '../js/merge.js';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
const base = { updatedAt: '1', ledger: [{ id: 1, desc: 'a', debit: 5 }, { id: 2, desc: 'b', debit: 6 }], settings: { x: 1, y: 2 }, gold: { rate: 100 }, accounts: [{ id: 'scb', name: 'SCB' }] };
const local = JSON.parse(JSON.stringify(base)); local.updatedAt = '3';
const remote = JSON.parse(JSON.stringify(base)); remote.updatedAt = '2';
local.ledger.push({ id: 3, desc: 'phone entry', debit: 10 });          // added on phone
remote.ledger.push({ id: 3, desc: 'desktop entry', debit: 20 });         // same id added on desktop
remote.ledger[0].debit = 50;                                             // desktop edited entry 1
local.ledger.splice(1, 1);                                               // phone deleted entry 2
local.settings.x = 9; remote.settings.y = 8;                             // different keys
remote.gold.rate = 120;                                                  // desktop only
const m = merge(base, local, remote);
const d = m.data;
ok(d.ledger.length === 3, 'ledger count ' + d.ledger.length);
ok(d.ledger.find((e) => e.id === 1).debit === 50, 'desktop edit kept');
ok(!d.ledger.find((e) => e.desc === 'b'), 'phone delete kept');
ok(d.ledger.some((e) => e.desc === 'phone entry') && d.ledger.some((e) => e.desc === 'desktop entry'), 'both new entries survive');
ok(new Set(d.ledger.map((e) => e.id)).size === 3, 'ids unique');
ok(d.settings.x === 9 && d.settings.y === 8, 'settings merged by key');
ok(d.gold.rate === 120, 'remote-only change');
ok(d.updatedAt === '3', 'latest updatedAt');
// same item edited on both: this device wins, counted
const l2 = JSON.parse(JSON.stringify(base)), r2 = JSON.parse(JSON.stringify(base));
l2.accounts[0].name = 'Phone'; r2.accounts[0].name = 'Desk';
const m2 = merge(base, l2, r2); ok(m2.data.accounts[0].name === 'Phone' && m2.clashes === 1, 'clash keeps local');
console.log('merge ok', m.renamed, 'renamed', m.clashes, 'clashes');
