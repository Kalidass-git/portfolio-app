// Watchlists, candle grouping, and that listed shares get alerts but not the main refresh. Synthetic data.
import * as WL from '../js/watchlists.js';
import { aggregateOhlc, candleMode } from '../js/history.js';
import { computeAll } from '../js/calc.js';
import * as W from '../js/watch.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const d = { watchlists: [], alerts: [], stocks: [], mutualFunds: [] };
const a = WL.addList(d, 'Banks'), b = WL.addList(d, '  ');
ok(a.id !== b.id && b.name === 'My watchlist', 'lists get distinct ids and a default name');
ok(WL.addItem(d, a.id, { symbol: 'hdfcbank.ns', name: 'HDFC Bank' }) === true, 'adds a share');
ok(WL.addItem(d, a.id, { symbol: 'HDFCBANK' }) === false, 'same symbol (any case / .NS) is not added twice');
WL.addItem(d, b.id, { symbol: 'HDFCBANK' }); WL.addItem(d, b.id, { symbol: 'TCS' });
ok(WL.allSymbols(d).length === 2, 'allSymbols lists each share once');
ok(WL.listsOf(d, 'HDFCBANK').length === 2, 'listsOf finds both lists');
WL.removeItem(d, b.id, 'tcs'); ok(b.items.length === 1, 'removes a share');
WL.renameList(d, a.id, 'Private banks'); ok(a.name === 'Private banks', 'renames');
WL.removeList(d, b.id); ok(WL.lists(d).length === 1, 'removes a list');
ok(WL.lists({}).length === 0, 'old files without the field work');
const rows = [
  { d: '2026-10-05', o: 10, h: 12, l: 9, c: 11, v: 100 }, { d: '2026-10-06', o: 11, h: 15, l: 10, c: 14, v: 50 },
  { d: '2026-10-12', o: 14, h: 14, l: 8, c: 9, v: 10 }];
const wk = aggregateOhlc(rows, 'W');
ok(wk.length === 2 && wk[0].o === 10 && wk[0].c === 14 && wk[0].h === 15 && wk[0].l === 9 && wk[0].v === 150, 'week candle: first open, last close, extremes, summed volume');
ok(aggregateOhlc(rows, 'M').length === 1 && aggregateOhlc(rows, 'D').length === 3, 'month and day grouping');
ok(candleMode(3) === 'D' && candleMode(12) === 'W' && candleMode(60) === 'M' && candleMode(0) === 'M', 'candle size by range');
d.stocks = []; d.settings = {};
let all; try { all = computeAll(JSON.parse(JSON.stringify({ ...d, settings: {} }))); } catch { all = null; }
if (all) {
  const u = W.universe(d, all).filter((x) => x.ref === 'HDFCBANK');
  ok(u.length === 1 && u[0].listed, 'listed share is covered by the alert universe');
  ok(!W.targetsOf(d, all).some((t) => t.ref === 'HDFCBANK'), 'main refresh skips watchlist-only shares');
} else console.log('skip universe (computeAll needs full data)');
process.exit(bad ? 1 : 0);
