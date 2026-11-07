// A y axis that fits the data. Round tick values (1, 2, 2.5 or 5 times a power of ten) with equal gaps, 4 to 6 gaps, and the range chosen so the lines use most of the height
// (an axis that starts at zero or jumps to the next power of ten leaves a small move squeezed along the bottom).
const MANT = [1, 2, 2.5, 5];
/** values: every number drawn. Returns { yMin, yMax, ticks } where ticks is the number of equal gaps between yMin and yMax. */
export function fitAxis(values, { floorZero = true } = {}) {
  const v = values.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return { yMin: 0, yMax: 4, ticks: 4 };
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || Math.max(Math.abs(hi) * 0.02, 1), pad = span * 0.12, a = floorZero && lo >= 0 ? Math.max(0, lo - pad) : lo - pad, b = hi + pad;   // data that is all above zero never gets an axis below zero
  let best = null;
  for (const n of [4, 5, 6]) {
    const raw = (b - a) / n, p0 = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const k of [0, 1]) for (const m of MANT) {
      const step = m * p0 * Math.pow(10, k);
      if (step * n < b - a - 1e-9) continue;
      let yMin = Math.floor(a / step + 1e-9) * step;
      let yMax = yMin + step * n;
      if (yMax < b - 1e-9) continue;                          // the floor moved down by up to one step: that may leave the top short
      const size = yMax - yMin;
      if (!best || size < best.size - 1e-9 || (Math.abs(size - best.size) < 1e-9 && n < best.ticks)) best = { yMin, yMax, ticks: n, size };
    }
  }
  if (!best) { const step = (b - a) / 4; best = { yMin: a, yMax: b, ticks: 4, size: step * 4 }; }
  return { yMin: best.yMin, yMax: best.yMax, ticks: best.ticks };
}
