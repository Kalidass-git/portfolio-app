import assert from 'node:assert/strict';
import { fitAxis } from '../js/axis.js';
const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
// gold moving 54.7L to 57L in a week: the axis must hug it (it used to run 54.7L .. 1Cr)
let a = fitAxis([54.7e5, 55.2e5, 56e5, 57e5]);
assert.ok(a.yMin <= 54.7e5 && a.yMax >= 57e5, 'covers the data');
assert.ok(a.yMax - a.yMin <= 5e5, 'tight: ' + (a.yMax - a.yMin));
assert.ok(near(a.yMin % 1e5, 0) || near(a.yMin % 5e4, 0), 'starts on a round number: ' + a.yMin);
const step = (a.yMax - a.yMin) / a.ticks; assert.ok([0.5e5, 1e5, 2e5, 2.5e5].some((s) => near(step, s)), 'round step ' + step);
// wide range keeps round steps and covers everything, starting at 0 when the data is near zero
a = fitAxis([0, 3e7, 1.2e8]); assert.ok(a.yMin === 0 && a.yMax >= 1.2e8);
for (const vals of [[1, 2], [100, 100], [5.4e6, 5.9e6, 6.1e6], [2e7, 2.05e7], [-5e5, 2e5], [0.9, 1.4]]) {
  const x = fitAxis(vals); assert.ok(x.yMin <= Math.min(...vals) && x.yMax >= Math.max(...vals) && x.ticks >= 4 && x.ticks <= 6, JSON.stringify([vals, x]));
}
assert.deepEqual(fitAxis([]), { yMin: 0, yMax: 4, ticks: 4 });
console.log('axis ok', JSON.stringify(fitAxis([54.7e5, 57e5])), JSON.stringify(fitAxis([5.4e6, 6.1e6, 2.1e7])));
