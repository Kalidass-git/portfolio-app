// Weekly trendline alert: a week counts only after its Friday close; the open week is reported separately.
import assert from 'node:assert/strict';
import { closedCandles, lineCross, openCandle } from '../js/ta.js';
const rows = [];
const add = (d, c) => rows.push({ d, o: c, h: c + 1, l: c - 1, c });
['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].forEach((d) => add(d, 278));
['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].forEach((d) => add(d, 282));
const L = { d1: '2026-10-01', p1: 281, d2: '2026-11-01', p2: 281 };
let c = closedCandles(rows, 'W', '2026-11-12', true);
assert.equal(lineCross(c, L, 'above').hit, false, 'Thursday: week not finished, no alert yet');
assert.deepEqual(openCandle(rows, 'W', '2026-11-12', true, L), { d: '2026-11-12', close: 282, line: 281 });
add('2026-11-13', 282);
c = closedCandles(rows, 'W', '2026-11-13', true);
assert.equal(lineCross(c, L, 'above').hit, true, 'Friday after close: weekly close above the line fires');
assert.equal(openCandle(rows, 'W', '2026-11-13', true, L), null);
console.log('ALL OK');
