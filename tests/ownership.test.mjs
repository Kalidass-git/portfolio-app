// Ownership: every asset by owner and by kind. node tests/ownership.test.mjs
import * as I from '../js/insights.js';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const all = { bonds: [{ name: 'B1', holder: 'Kalidass', principal: 1000 }, { name: 'B2', holder: 'suganya', principal: 500 }], lending: [{ name: 'To Raj', account: 'Private', principal: 200, accrued: 20 }, { name: 'To Zero', principal: 0 }],
  fds: [{ name: 'FD1', account: 'Amma', value: 300 }], savings: [{ name: 'EPF', holder: 'Kalidass', principal: 400, type: 'EPF' }, { name: 'Chit1', holder: 'Suganya', principal: 100, type: 'Chit' }],
  stocks: { current: 700 }, mf: { current: 300 }, gold: { value: 600, others: [{ name: 'Land', amount: 50 }] }, banks: [{ name: 'HDFC', holder: 'Kalidass', balance: 250 }] };
const data = { taxOwners: { stocks: 'Kalidass', funds: 'Suganya', gold: 'Amma' } };
const o = I.ownership(data, all), by = Object.fromEntries(o.people.map((p) => [p.owner.toLowerCase(), p.total]));
ok(o.total === 1000 + 500 + 220 + 300 + 400 + 100 + 700 + 300 + 600 + 50 + 250, 'total is every asset');
ok(by.kalidass === 1000 + 400 + 700 + 250 && by.suganya === 500 + 100 + 300 && by.amma === 300 + 600, 'each person gets their holdings (case-insensitive names, taxOwners for stocks, funds, gold)');
ok(by['not set'] === 220 + 50 && o.unassigned === 270, 'no owner: lending with only "Private" and others go to Not set');
ok(o.people[o.people.length - 1].owner === I.NO_OWNER, 'Not set is listed last');
ok(Math.abs(o.people.reduce((a, p) => a + p.share, 0) - 1) < 1e-9, 'shares add to 100%');
ok(o.people.every((p) => Math.abs(p.types.reduce((a, t) => a + t.value, 0) - p.total) < 0.5), 'each person\'s kinds add up to their total');
ok(I.ownership({}, { bonds: [], lending: [], fds: [], savings: [], banks: [], stocks: { current: 0 }, mf: { current: 0 }, gold: { value: 0, others: [] } }).total === 0, 'nothing owned: empty');
if (bad) { console.log('FAILED', bad); process.exit(1); } console.log('all passed');
