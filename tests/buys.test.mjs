import { monthlyBuys, planDone, planMatches } from '../js/buys.js';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
const d = { stocks: [{ symbol: 'NIFTYBEES', assetClass: 'etf' }], trades: [
  { type: 'BUY', symbol: 'NIFTYBEES', name: 'Nifty Bees', amount: 5000, date: '2026-10-03', src: 'groww' },
  { type: 'BUY', symbol: 'TCS', name: 'TCS', amount: 3500, date: '2026-10-04', src: 'groww' },
  { type: 'BUY', symbol: 'INFY', name: 'Infosys', amount: 2500, date: '2026-10-09', src: 'groww' }, { type: 'BUY', symbol: 'X', name: 'Old', amount: 999, date: '2026-09-09', src: 'groww' }],
  mfTxns: [{ scheme: 'Parag Parikh Flexi Cap Fund Direct Growth', type: 'SIP', amount: 25000, date: '2026-10-05' }, { scheme: 'Bandhan Small Cap Fund Direct Growth', type: 'SIP', amount: 25000, date: '2026-10-06' }] };
const plans = [{ id: 'a', name: 'Parag Parikh Flexi Cap Fund Growth' }, { id: 'b', name: 'Bandhan Small cap' }, { id: 'c', name: 'Nifty Bees' }, { id: 'd', name: 'Individual stocks' }, { id: 'e', name: 'Zerodha Nifty Large Midcap 250 Index Fund Direct Growth' }];
const r = planDone(plans, monthlyBuys(d), '2026-10');
ok(r.byPlan.get('a') === 25000 && r.byPlan.get('b') === 25000, 'funds match');
ok(r.byPlan.get('c') === 5000, 'etf matches nifty bees: ' + r.byPlan.get('c'));
ok(r.byPlan.get('d') === 6000, 'individual stocks = non-etf shares: ' + r.byPlan.get('d'));
ok(r.byPlan.get('e') === 0 && r.other === 0, 'no leakage');
console.log('buys ok');
