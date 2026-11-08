// Trading-style price chart: line, percent change or candles; 50 and 200-day averages on the price; your average cost and buy / sell marks;
// a P/E panel; volume; zoom and pan; trendlines you draw. One touch or hover shows every figure for that bar. Draws SVG only (no libraries).
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  kids.flat().forEach((k) => k && el.append(k.nodeType ? k : document.createTextNode(k)));
  return el;
};
// terminal-style colours, one clearly different hue per line: 50-day blue, 200-day orange, P/E purple, your average cost grey (dashed), trendlines cyan
export const DEFAULT_COLORS = { dma50: '#2962ff', dma200: '#ff9800', pe: '#9c27b0', median: '#e91e63', avg: '#b08900', trend: '#00b8d4' };
/** The line colours in use: the defaults, with anything the person changed (kept on this device only). */
export const LINE_COLORS = { ...DEFAULT_COLORS };
const CK = 'fw.chartcolors';
try { Object.assign(LINE_COLORS, JSON.parse(localStorage.getItem(CK) || '{}')); } catch (e) { /* defaults */ }
const keepColors = () => { try { const d = {}; for (const k in DEFAULT_COLORS) if (LINE_COLORS[k] !== DEFAULT_COLORS[k]) d[k] = LINE_COLORS[k]; if (Object.keys(d).length) localStorage.setItem(CK, JSON.stringify(d)); else localStorage.removeItem(CK); } catch (e) { /* not kept */ } };
export const setLineColor = (k, v) => { if (/^#[0-9a-f]{6}$/i.test(v) && k in DEFAULT_COLORS) { LINE_COLORS[k] = v; keepColors(); } };
export const resetLineColors = () => { Object.assign(LINE_COLORS, DEFAULT_COLORS); keepColors(); };
const nice = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-IN') : v.toFixed(Math.abs(v) < 10 ? 2 : 1));
const DAY = 864e5, tms = (d) => Date.parse(d + 'T00:00:00Z'), isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const POS = 'var(--pos, #1a7f4b)', NEG = 'var(--neg, #c24141)';
// candle and volume colours as on trading terminals: teal up, red down
const CUP = '#089981', CDN = '#f23645';
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A round step (1, 2 or 5 times a power of ten) that gives about the wanted number of grid lines. */
const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

/**
 * rows: [{ d, o, h, l, c, v }] oldest first (one per day, week or month). dma50, dma200, pe: arrays the same length as rows (null where unknown) or null.
 * avg: your average cost (flat dashed line). trades: [{ d, side: 'BUY' | 'SELL', price, qty }]. mode: 'line' | 'pct' | 'candle'.
 * Zoom and pan: mouse wheel or pinch zooms, dragging moves; the returned element also has zoom(factor), reset(), isZoomed().
 *   view: { d0, d1 } the dates shown (null = all); onView(view) is told whenever it changes.
 * Editing: press a line to select it, drag it to move it, drag a round end handle to change one end; onLine.update(id, { d1, p1, d2, p2 }) saves it.
 * Trendlines: lines [{ id, d1, p1, d2, p2 }] (a date and a price at each end, so they stay put when the candle size changes); tool 'line' lets two taps
 *   place a new one (onLine.add({ d1, p1, d2, p2 })); tapping a line calls onLine.select(id); selected highlights one.
 */
export function marketChart({ rows, mode = 'line', dma50 = null, dma200 = null, pe = null, avg = null, trades = [], height = 250, fmt = nice, vfmt = (v) => String(Math.round(v)), dateFmt = (d) => d, tickFmt = (d) => d,
  lines = [], tool = 'none', selected = null, onLine = null, view = null, onView = () => {}, peMedian = null, peLabel = 'P/E', peFmt = (v, d = 0) => v.toFixed(d), peSigned = false, newColor = null, width = 0, dense = false, pending: pending0 = null, onPending = () => {}, lockAll = false } = {}) {
  const N = rows.length;
  if (N < 2) return h('p', { class: 'empty' }, 'Not enough history for this range.');
  const MINBARS = Math.min(12, N);
  let a = 0, z = N - 1;                   // first and last bar shown
  if (view && view.d0) { const i0 = rows.findIndex((r) => r.d >= view.d0); let i1 = N - 1; while (i1 > 0 && rows[i1].d > view.d1) i1--; if (i0 >= 0 && i1 - i0 + 1 >= MINBARS) { a = i0 - (view.l || 0); z = i1 + (view.r || 0); } }
  const W = width || (typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : 880);
  const box = h('div', { class: 'chart-box' });
  const read = h('div', { class: 'cd-read mc-read', 'aria-live': 'polite' });
  let yz = null;                          // price range chosen by dragging the price axis: { lo, hi } (null = fit what is on screen)
  let ctx = null, pending = pending0, preview = null, sel = selected, live = null;   // sel: the selected line; live: a line being dragged { id, line }      // first point of a trendline being drawn, and where the pointer is now
  // you may drag past either end, up to half a screen of empty space, so the first or last candle can be brought to the middle
  const room = (len) => { const half = Math.floor(len / 2); return [-half, N - len + half]; };
  const fix = () => { const len = Math.max(MINBARS, Math.min(N, Math.round(z - a + 1))), [mn, mx] = room(len); a = Math.max(mn, Math.min(mx, Math.round(a))); z = a + len - 1; };
  const redraw = () => { fix(); box.replaceChildren(paint(), read); onView(a === 0 && z === N - 1 ? null : { d0: rows[Math.max(0, a)].d, d1: rows[Math.min(N - 1, z)].d, l: Math.max(0, -a), r: Math.max(0, z - (N - 1)) }); };
  const zoomAt = (f, frac = 0.5) => { const len = z - a + 1, nl = Math.max(MINBARS, Math.min(N, len * f)); if (Math.round(nl) === len) return; const anchor = a + len * frac; a = anchor - nl * frac; z = a + nl - 1; redraw(); };
  box.zoom = (f) => zoomAt(f, 0.5); box.reset = () => { a = 0; z = N - 1; yz = null; redraw(); }; box.isZoomed = () => !(a === 0 && z === N - 1) || !!yz;

  function paint() {
    const ia = Math.max(0, a), iz = Math.min(N - 1, z), off = Math.max(0, -a), right = Math.max(0, z - (N - 1)), slots = z - a + 1;   // off / right: empty slots before the first and after the last bar
    const R = rows.slice(ia, iz + 1), n = R.length, sub = (arr) => (arr ? arr.slice(ia, iz + 1) : null);
    const m50 = sub(dma50), m200 = sub(dma200), peS = sub(pe);
    const showPe = !!peS && peS.some((x) => x != null), hasVol = R.some((r) => r.v > 0);
    const padL = 6, padR = W < 520 ? 56 : 64, padT = 8, axisH = 22, gap = 8, peH = showPe ? (dense ? 44 : 66) : 0, volH = hasVol ? (dense ? 30 : 44) : 0;   // dense: a phone turned sideways has little height
    const priceT = padT, priceB = padT + height, peT = priceB + gap, peB = peT + peH, volT = (showPe ? peB : priceB) + gap, volB = volT + volH;
    const H = (hasVol ? volB : showPe ? peB : priceB) + axisH, bottom = hasVol ? volB : showPe ? peB : priceB;
    const gw = (W - padL - padR) / slots, cx = (i) => padL + gw * (off + i) + gw / 2;
    const base = R[0].c, val = (x) => (mode === 'pct' ? x / base - 1 : x);
    const f = mode === 'pct' ? (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%` : fmt;

    // price range of what is on screen
    const vals = [];
    R.forEach((r) => { if (mode === 'candle') vals.push(r.l, r.h); else vals.push(r.c); });
    for (const arr of [m50, m200]) if (arr) arr.forEach((x) => { if (x != null) vals.push(x); });
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (avg != null && avg > lo - (hi - lo) * 0.5 && avg < hi + (hi - lo) * 0.5) { lo = Math.min(lo, avg); hi = Math.max(hi, avg); }
    const span = hi - lo || hi * 0.02 || 1; lo -= span * 0.06; hi += span * 0.06;
    const fitLo = lo, fitHi = hi;
    if (yz) { lo = yz.lo; hi = yz.hi; }
    const y = (v) => priceT + (1 - (val(v) - val(lo)) / (val(hi) - val(lo))) * (priceB - priceT);
    const priceAt = (py) => lo + (1 - (py - priceT) / (priceB - priceT)) * (hi - lo);

    // a date <-> a (fractional) bar position, extended past both ends by the typical gap between bars
    const perBar = Math.max(0.5, (tms(R[n - 1].d) - tms(R[0].d)) / DAY / Math.max(1, n - 1));
    const posOf = (d) => {
      const t = tms(d);
      if (t <= tms(R[0].d)) return (t - tms(R[0].d)) / DAY / perBar;
      if (t >= tms(R[n - 1].d)) return n - 1 + (t - tms(R[n - 1].d)) / DAY / perBar;
      let i = R.findIndex((r) => r.d >= d); if (i <= 0) return 0;
      const t0 = tms(R[i - 1].d), t1 = tms(R[i].d);
      return i - 1 + (t1 > t0 ? (t - t0) / (t1 - t0) : 1);
    };
    const dateOf = (p) => {
      if (p <= 0) return isoOf(tms(R[0].d) + p * perBar * DAY);
      if (p >= n - 1) return isoOf(tms(R[n - 1].d) + (p - (n - 1)) * perBar * DAY);
      const i = Math.floor(p), t0 = tms(R[i].d), t1 = tms(R[i + 1].d);
      return isoOf(t0 + (t1 - t0) * (p - i));
    };
    const px = (p) => padL + gw * (off + p) + gw / 2;

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart mchart', role: 'img', 'aria-label': `Price chart from ${dateFmt(R[0].d)} to ${dateFmt(R[n - 1].d)}` });
    const clip = 'mc-clip-' + Math.random().toString(36).slice(2, 8);
    root.append(svg('defs', {}, svg('clipPath', { id: clip }, svg('rect', { x: padL, y: priceT, width: W - padL - padR, height: priceB - priceT }))));
    // price grid on round numbers; every second line is a "major" one, drawn bold like on trading terminals. Labels sit on the right.
    const vlo = val(lo), vhi = val(hi), yv = (q) => priceT + (1 - (q - vlo) / (vhi - vlo)) * (priceB - priceT);
    const step = niceStep((vhi - vlo) / Math.max(3, Math.round((priceB - priceT) / 38)));
    for (let k = Math.ceil(vlo / step - 1e-9); k <= Math.floor(vhi / step + 1e-9); k++) {
      const q = k * step, yy = yv(q);
      root.append(svg('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: 'grid' }), svg('text', { x: W - padR + 6, y: yy + 3.5, class: 'axis' + (k % 2 === 0 ? ' major' : ''), 'text-anchor': 'start' }, f(q)));
    }
    // time grid: a vertical line and label at each year, quarter, month (or Monday on short ranges); the year is bold
    {
      const t0 = tms(R[0].d) - off * perBar * DAY, t1 = tms(R[n - 1].d) + right * perBar * DAY, spanD = (t1 - t0) / DAY, cand = [];
      const d0 = new Date(t0);
      for (let yy = d0.getUTCFullYear(), mm = d0.getUTCMonth(); ; ) {
        const t = Date.UTC(yy, mm, 1); if (t > t1) break;
        if (t >= t0) {
          if (spanD > 3 * 365) { if (mm === 0) cand.push({ t, label: String(yy), rank: 3, year: true }); else if (mm === 6) cand.push({ t, label: 'Jul', rank: 2 }); }
          else if (spanD > 420) { if (mm === 0) cand.push({ t, label: String(yy), rank: 3, year: true }); else if (mm % 3 === 0) cand.push({ t, label: MON3[mm], rank: 2 }); }
          else cand.push({ t, label: mm === 0 ? String(yy) : MON3[mm], rank: mm === 0 ? 3 : 2, year: mm === 0 });
        }
        if (++mm > 11) { mm = 0; yy++; }
      }
      if (spanD <= 130) { for (let t = t0 + ((8 - new Date(t0).getUTCDay()) % 7) * DAY; t <= t1; t += 7 * DAY) { const dd = new Date(t); if (dd.getUTCDate() > 1) cand.push({ t, label: String(dd.getUTCDate()), rank: 1 }); } }
      const gap = W < 520 ? 46 : 58, placed = [];
      cand.map((c) => ({ ...c, x: px(posOf(isoOf(c.t))) })).filter((c) => c.x > padL + 8 && c.x < W - padR - 8).sort((p, q) => q.rank - p.rank || p.x - q.x)
        .forEach((c) => { if (placed.every((o) => Math.abs(o.x - c.x) >= gap)) placed.push(c); });
      placed.forEach((c) => root.append(svg('line', { x1: c.x, x2: c.x, y1: priceT, y2: bottom, class: 'grid gv' }), svg('text', { x: c.x, y: bottom + 15, class: 'axis' + (c.year ? ' major' : ''), 'text-anchor': 'middle' }, c.label)));
    }

    // price
    const up = R[n - 1].c >= R[0].c, main = up ? CUP : CDN;
    const pg = svg('g', { 'clip-path': `url(#${clip})` });
    if (mode === 'candle') {
      const cw = Math.max(1, Math.min(14, gw * 0.7));
      R.forEach((r, i) => {
        const col = r.c >= r.o ? CUP : CDN, yo = y(r.o), yc = y(r.c);
        pg.append(svg('line', { x1: cx(i), x2: cx(i), y1: y(r.h), y2: y(r.l), stroke: col, 'stroke-width': 1 }), svg('rect', { x: cx(i) - cw / 2, y: Math.min(yo, yc), width: cw, height: Math.max(1, Math.abs(yo - yc)), fill: col }));
      });
    } else {
      const pts = R.map((r, i) => `${cx(i).toFixed(1)},${y(r.c).toFixed(1)}`);
      pg.append(svg('path', { d: `M${cx(0).toFixed(1)},${priceB} L${pts.join(' L')} L${cx(n - 1).toFixed(1)},${priceB} Z`, fill: main, opacity: '.10' }), svg('polyline', { points: pts.join(' '), fill: 'none', stroke: main, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
    }
    // averages: thicker, own colours, so they cannot be mistaken for your own average-cost line
    const overlay = (arr, col) => {
      if (!arr) return;
      let seg = [];
      const flush = () => { if (seg.length > 1) pg.append(svg('polyline', { points: seg.join(' '), fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); seg = []; };
      arr.forEach((x, i) => { if (x == null) flush(); else seg.push(`${cx(i).toFixed(1)},${y(x).toFixed(1)}`); });
      flush();
    };
    overlay(m200, LINE_COLORS.dma200); overlay(m50, LINE_COLORS.dma50);
    root.append(pg);
    if (avg != null && avg >= lo && avg <= hi) {
      root.append(svg('line', { x1: padL, x2: W - padR, y1: y(avg), y2: y(avg), stroke: LINE_COLORS.avg, 'stroke-width': 1.3, 'stroke-dasharray': '6 4' }),
        svg('text', { x: W - padR - 2, y: y(avg) - 4, class: 'axis', 'text-anchor': 'end', fill: LINE_COLORS.avg }, 'Your average ' + fmt(avg)));
    }
    // your buys and sells
    for (const t of trades || []) {
      if (t.d < R[0].d || t.d > R[n - 1].d) continue;
      const i = R.findIndex((r) => r.d >= t.d); if (i < 0) continue;
      const buy = t.side !== 'SELL', x0 = cx(i), py = buy ? y(mode === 'candle' ? R[i].l : R[i].c) + 10 : y(mode === 'candle' ? R[i].h : R[i].c) - 10;
      root.append(svg('path', { d: buy ? `M${x0},${py - 6} l5,9 h-10 z` : `M${x0},${py + 6} l5,-9 h-10 z`, fill: buy ? POS : NEG, stroke: 'var(--surface, #fff)', 'stroke-width': 1 }, svg('title', {}, `${buy ? 'Bought' : 'Sold'} ${t.qty != null ? t.qty + ' ' : ''}on ${dateFmt(t.d)}${t.price ? ' at ' + fmt(t.price) : ''}`)));
    }

    // P/E panel
    let peY = null;
    if (showPe) {
      const pv = peS.filter((x) => x != null), plo0 = Math.min(...pv), phi0 = Math.max(...pv), ps = phi0 - plo0 || phi0 * 0.1 || 1, plo = peSigned ? plo0 - ps * 0.12 : Math.max(0, plo0 - ps * 0.12), phi = phi0 + ps * 0.12;
      peY = (v) => peT + (1 - (v - plo) / (phi - plo)) * (peB - peT);
      root.append(svg('line', { x1: padL, x2: W - padR, y1: peT, y2: peT, class: 'grid' }), svg('line', { x1: padL, x2: W - padR, y1: peB, y2: peB, class: 'grid' }),
        svg('text', { x: W - padR + 6, y: peT + 9, class: 'axis', 'text-anchor': 'start' }, peFmt(phi)), svg('text', { x: W - padR + 6, y: peB, class: 'axis', 'text-anchor': 'start' }, peFmt(plo)),
        svg('text', { x: padL + 4, y: peT + 11, class: 'axis', fill: LINE_COLORS.pe, style: 'font-weight:700' }, peLabel));
      if (peSigned && plo < 0 && phi > 0) root.append(svg('line', { x1: padL, x2: W - padR, y1: peY(0), y2: peY(0), stroke: 'var(--muted, #888)', 'stroke-width': 1, opacity: '.6' }));
      if (peMedian != null && peMedian >= plo && peMedian <= phi) root.append(svg('line', { x1: padL, x2: W - padR, y1: peY(peMedian), y2: peY(peMedian), stroke: LINE_COLORS.median, 'stroke-width': 1.2, 'stroke-dasharray': '5 4', opacity: '.8' }), svg('text', { x: W - padR - 2, y: peY(peMedian) - 3, class: 'axis', 'text-anchor': 'end', fill: LINE_COLORS.median }, 'Median ' + peFmt(peMedian, 1)));
      let seg = [];
      const flush = () => { if (seg.length > 1) root.append(svg('polyline', { points: seg.join(' '), fill: 'none', stroke: LINE_COLORS.pe, 'stroke-width': 2.2, 'stroke-linejoin': 'round' })); seg = []; };
      peS.forEach((x, i) => { if (x == null) flush(); else seg.push(`${cx(i).toFixed(1)},${peY(x).toFixed(1)}`); });
      flush();
    }
    // volume
    if (hasVol) {
      const vmax = Math.max(1, ...R.map((r) => r.v || 0)), cw = Math.max(1, Math.min(14, gw * 0.7));
      R.forEach((r, i) => { if (r.v > 0) { const hh = (r.v / vmax) * volH; root.append(svg('rect', { x: cx(i) - cw / 2, y: volB - hh, width: cw, height: hh, fill: r.c >= (i ? R[i - 1].c : r.o) ? CUP : CDN, opacity: '.4' })); } });
    }

    // trendlines (not in % mode: the price axis there is relative)
    const lineLayer = svg('g', { 'clip-path': `url(#${clip})` }), segs = [];
    if (mode !== 'pct') {
      const locked = (L) => lockAll || !!L.locked;
      const draw = (L, sel, ghost) => {
        const col = L.color || LINE_COLORS.trend, x1 = px(posOf(L.d1)), x2 = px(posOf(L.d2)), y1 = y(L.p1), y2 = y(L.p2);
        lineLayer.append(svg('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': sel ? 2.8 : 1.8, 'stroke-linecap': 'round', 'stroke-dasharray': ghost ? '5 4' : null, opacity: ghost ? '.8' : null }));
        if (sel && !locked(L)) for (const [xx, yy] of [[x1, y1], [x2, y2]]) lineLayer.append(svg('circle', { cx: xx, cy: yy, r: 5, fill: 'var(--surface, #fff)', stroke: col, 'stroke-width': 2 }));
        if (!ghost && locked(L)) lineLayer.append(svg('text', { x: x2 + (x2 >= x1 ? -4 : 4), y: y2 - 6, 'text-anchor': x2 >= x1 ? 'end' : 'start', class: 'axis', fill: col, style: 'font-size:11px' }, '🔒'));
        return { x1, y1, x2, y2 };
      };
      for (const L0 of lines || []) { const L = live && live.id === L0.id ? { ...L0, ...live.line } : L0; segs.push({ id: L.id, ...draw(L, L.id === sel, false) }); }
      if (pending && preview) draw({ d1: pending.d, p1: pending.p, d2: preview.d, p2: preview.p, color: newColor }, false, true);
      else if (pending) lineLayer.append(svg('circle', { cx: px(posOf(pending.d)), cy: y(pending.p), r: 4.5, fill: newColor || LINE_COLORS.trend }));
    }
    root.append(lineLayer);

    // price tags on the right axis: the last price (filled, with a dotted line across), and the highest and lowest price on screen
    const tag = (yy, text, { fill, stroke, ink }) => svg('g', { class: 'mc-tag' }, svg('rect', { x: W - padR + 2, y: yy - 9, width: padR - 4, height: 18, rx: 3, fill, stroke: stroke || 'none' }), svg('text', { x: W - padR + 2 + (padR - 4) / 2, y: yy + 4, 'text-anchor': 'middle', class: 'tagtxt', fill: ink }, text));
    const inPrice = (yy) => yy >= priceT + 6 && yy <= priceB - 6;
    let lastY = null;
    if (z >= N - 1) {
      const lc = R[n - 1].c, prevC = n > 1 ? R[n - 2].c : R[n - 1].o, yy = y(lc);
      if (inPrice(yy)) {
        lastY = yy; const col = lc >= prevC ? CUP : CDN;
        root.append(svg('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '1 3', opacity: '.9' }), tag(yy, f(val(lc)), { fill: col, ink: '#fff' }));
      }
    }
    if (mode !== 'pct') {
      let hv = -Infinity, lv = Infinity;
      R.forEach((r) => { const a1 = mode === 'candle' ? r.h : r.c, b1 = mode === 'candle' ? r.l : r.c; if (a1 > hv) hv = a1; if (b1 < lv) lv = b1; });
      for (const [lab, v] of [['High', hv], ['Low', lv]]) {
        const yy = y(v); if (!inPrice(yy) || (lastY != null && Math.abs(yy - lastY) < 20)) continue;
        root.append(tag(yy, fmt(v), { fill: 'var(--surface-2, #f1f3f6)', stroke: 'var(--line, #d9dde3)', ink: 'var(--ink, #111)' }),
          svg('text', { x: W - padR - 5, y: yy + 4, 'text-anchor': 'end', class: 'axis hl-lab', style: 'paint-order:stroke;stroke:var(--surface,#fff);stroke-width:3px' }, lab));
      }
    }

    // touch / hover readout
    const cross = svg('line', { y1: priceT, y2: bottom, class: 'cross', style: 'display:none' });
    const hline = svg('line', { x1: padL, x2: W - padR, class: 'cross', style: 'display:none' }), tagBox = svg('g', {});
    const dots = svg('g', {});
    const show = (i, Y) => {
      const r = R[i], prev = i > 0 ? R[i - 1].c : r.o, ch = r.c - prev;
      tagBox.replaceChildren();
      { // the price under the pointer (or the bar's close) as an outlined tag on the right axis, and the bar's date as a dark tag on the time axis
        const yy = Y != null ? Math.max(priceT, Math.min(priceB, Y)) : y(r.c), pv = Y != null ? priceAt(yy) : r.c, col = ch >= 0 ? CUP : CDN;
        hline.setAttribute('y1', yy); hline.setAttribute('y2', yy); hline.style.display = '';
        tagBox.append(tag(yy, f(val(pv)), { fill: 'var(--surface, #fff)', stroke: col, ink: col }));
        const dt = dateFmt(r.d), tw = Math.max(54, dt.length * 6.4 + 12), tx = Math.max(padL, Math.min(W - padR - tw, cx(i) - tw / 2));
        tagBox.append(svg('g', { class: 'mc-tag' }, svg('rect', { x: tx, y: bottom + 3, width: tw, height: 17, rx: 3, fill: 'var(--ink, #111)' }), svg('text', { x: tx + tw / 2, y: bottom + 15.5, 'text-anchor': 'middle', class: 'tagtxt', fill: 'var(--surface, #fff)' }, dt)));
      }
      cross.setAttribute('x1', cx(i)); cross.setAttribute('x2', cx(i)); cross.style.display = '';
      dots.replaceChildren();
      const dot = (yy, col) => dots.append(svg('circle', { cx: cx(i), cy: yy, r: 3.6, fill: col, stroke: 'var(--surface, #fff)', 'stroke-width': 1.2 }));
      if (mode !== 'candle') dot(y(r.c), main);
      if (m50 && m50[i] != null) dot(y(m50[i]), LINE_COLORS.dma50);
      if (m200 && m200[i] != null) dot(y(m200[i]), LINE_COLORS.dma200);
      if (showPe && peS[i] != null) dot(peY(peS[i]), LINE_COLORS.pe);
      if (showPe && peS[i] != null) {   // the P/E reading as a tag beside the P/E line itself, so it is read where it is drawn (the other figures stay in the line below the chart)
        const v = peS[i], txt = peLabel + ' ' + peFmt(v, 1), tw = Math.max(48, txt.length * 6.4 + 12), py = peY(v);
        const tx = Math.max(padL + 2, Math.min(W - padR - tw - 2, cx(i) - tw / 2)), ty = Math.min(peB - 18, py - 26 >= peT + 1 ? py - 26 : py + 8);
        tagBox.append(svg('g', { class: 'mc-tag' }, svg('rect', { x: tx, y: ty, width: tw, height: 17, rx: 3, fill: 'var(--surface, #fff)', stroke: LINE_COLORS.pe }), svg('text', { x: tx + tw / 2, y: ty + 12.5, 'text-anchor': 'middle', class: 'tagtxt', fill: LINE_COLORS.pe }, txt)));
      }
      if (hasVol && r.v > 0) {   // the volume as a tag above its bar, inside the volume panel (the other figures stay below the chart)
        const vmax = Math.max(1, ...R.map((q) => q.v || 0)), hh = (r.v / vmax) * volH, txt = 'Vol ' + vfmt(r.v), tw = Math.max(52, txt.length * 6.4 + 12);
        const tx = Math.max(padL + 2, Math.min(W - padR - tw - 2, cx(i) - tw / 2)), ty = Math.max(volT, volB - hh - 19);
        tagBox.append(svg('g', { class: 'mc-tag' }, svg('rect', { x: tx, y: ty, width: tw, height: 17, rx: 3, fill: 'var(--surface, #fff)', stroke: r.c >= (i ? R[i - 1].c : r.o) ? CUP : CDN }), svg('text', { x: tx + tw / 2, y: ty + 12.5, 'text-anchor': 'middle', class: 'tagtxt', fill: r.c >= (i ? R[i - 1].c : r.o) ? CUP : CDN }, txt)));
      }
      const chip = (label, v, col) => (v == null ? null : h('span', { class: 'mc-chip' }, h('i', { style: { background: col } }), `${label} ${v}`));
      read.replaceChildren(h('b', null, dateFmt(r.d)), mode === 'candle' ? ` O ${fmt(r.o)} · H ${fmt(r.h)} · L ${fmt(r.l)} · C ${fmt(r.c)}` : ` ${fmt(r.c)}`,
        h('span', { class: ch >= 0 ? 'pos' : 'neg' }, ` ${ch >= 0 ? '+' : '−'}${(Math.abs(ch / prev) * 100).toFixed(2)}%`),
        mode === 'pct' ? h('span', { class: r.c >= base ? 'pos' : 'neg' }, ` · since start ${r.c >= base ? '+' : '−'}${(Math.abs(r.c / base - 1) * 100).toFixed(1)}%`) : '', 
        h('div', { class: 'mc-chips' }, chip('50d', m50 && m50[i] != null ? fmt(m50[i]) : null, LINE_COLORS.dma50), chip('200d', m200 && m200[i] != null ? fmt(m200[i]) : null, LINE_COLORS.dma200)));
    };
    const rect = () => root.getBoundingClientRect();
    const toSvg = (e) => { const bb = rect(); return { x: ((e.clientX - bb.left) / bb.width) * W, y: ((e.clientY - bb.top) / bb.height) * H }; };
    const barAt = (X) => Math.max(0, Math.min(n - 1, Math.floor((X - padL) / gw) - off));
    const drawing = tool === 'line' && mode !== 'pct';
    const hit = svg('rect', { x: padL, y: priceT, width: W - padL - padR, height: bottom - priceT, fill: 'transparent', style: `cursor: ${drawing ? 'crosshair' : 'grab'}` });
    root.style.touchAction = drawing || sel || box.isZoomed() ? 'none' : 'pan-y';   // once zoomed or moved, a drag moves the chart in any direction instead of scrolling the page
    // what a tap at (X, Y) means when drawing: the date of the bar and the price, snapped to the nearest high, low, open or close when it is close by
    const point = (X, Y) => {
      const p = (X - padL) / gw - off - 0.5, i = barAt(X);
      let price = priceAt(Y);
      if (mode === 'candle') { let best = null; for (const v of [R[i].o, R[i].h, R[i].l, R[i].c]) if (best == null || Math.abs(y(v) - Y) < Math.abs(y(best) - Y)) best = v; if (Math.abs(y(best) - Y) < 12) price = best; }
      return { d: dateOf(Math.max(-off, Math.min(n - 1 + right, p))), p: price };
    };
    const near = (X, Y) => { let best = null, bd = 12; for (const s of segs) { const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((X - s.x1) * dx + (Y - s.y1) * dy) / L2)), d = Math.hypot(X - (s.x1 + t * dx), Y - (s.y1 + t * dy)); if (d < bd) { bd = d; best = s.id; } } return best; };
    // a tap or press on a line: its end handles first (when it is selected), then its body
    const hitLine = (X, Y) => {
      const sg = segs.find((q) => q.id === sel);
      if (sg) { if (Math.hypot(X - sg.x1, Y - sg.y1) < 16) return { id: sg.id, kind: 'p1' }; if (Math.hypot(X - sg.x2, Y - sg.y2) < 16) return { id: sg.id, kind: 'p2' }; }
      const id = near(X, Y); return id ? { id, kind: 'move' } : null;
    };
    // the line with the whole of it moved by the distance from (X0, Y0) to (X, Y)
    const shift = (L, X0, Y0, X, Y) => { const dp = (X - X0) / gw, dq = priceAt(Y) - priceAt(Y0); return { d1: dateOf(posOf(L.d1) + dp), p1: L.p1 + dq, d2: dateOf(posOf(L.d2) + dp), p2: L.p2 + dq }; };
    ctx = { H, lo, hi, fitLo, fitHi, plotH: priceB - priceT, zone: (X, Y) => (Y >= bottom && Y <= H && X >= padL && X <= W - padR ? 'x' : X > W - padR && Y >= priceT && Y <= priceB && mode !== 'pct' ? 'y' : null), hitLine, shift, show, point, near, barAt, toSvg, drawing, gw, padL, padR, W, rect, plot: [padL, priceT, W - padR, bottom] };
    // dragging the month labels stretches time, dragging the price labels stretches the price scale (double-click either to undo)
    const axX = svg('rect', { x: padL, y: bottom, width: W - padL - padR, height: axisH + 4, fill: 'transparent', style: 'cursor: ew-resize' });
    const axY = svg('rect', { x: W - padR, y: priceT, width: padR, height: priceB - priceT, fill: 'transparent', style: 'cursor: ns-resize' });
    root.append(axX, axY, cross, hline, dots, tagBox, hit);
    show(n - 1); cross.style.display = 'none'; hline.style.display = 'none'; dots.replaceChildren(); tagBox.replaceChildren();
    return root;
  }
  // pointer handling sits on the stable wrapper, because the chart is redrawn while you drag or pinch
  const inPlot = (e) => { if (!ctx) return null; const s = ctx.toSvg(e), [x0, y0, x1, y1] = ctx.plot; return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 ? s : null; };
  const ptrs = new Map(); let drag = null, pinch = null;
  box.addEventListener('pointerdown', (e) => {
    if (ctx) { const zs = ctx.toSvg(e), zone = ctx.zone(zs.x, zs.y); if (zone) { try { box.setPointerCapture(e.pointerId); } catch { /* not supported */ } drag = { zone, x: e.clientX, y: e.clientY, a, z, lo: ctx.lo, hi: ctx.hi, moved: true, frac: Math.max(0, Math.min(1, (zs.x - ctx.padL) / (ctx.W - ctx.padL - ctx.padR))) }; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; } }
    const s = inPlot(e); if (!s) return;
    try { box.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), a, z }; drag = null; return; }
    drag = { x: e.clientX, y: e.clientY, a, z, moved: false, touch: e.pointerType === 'touch', yz: yz ? { ...yz } : null, vr: { lo: ctx.lo, hi: ctx.hi } };
    if (!ctx.drawing) {
      const hl = ctx.hitLine(s.x, s.y), L = hl && (lines || []).find((q) => q.id === hl.id);
      // only the line that is selected (and not locked) can be dragged; pressing any other line just moves the chart, and a tap selects it
      if (hl && L && sel === hl.id && !lockAll && !L.locked && onLine && onLine.update) drag.edit = { ...hl, X0: s.x, Y0: s.y, orig: L };
      else ctx.show(ctx.barAt(s.x), s.y);
    }
  });
  box.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [p, q] = [...ptrs.values()], d = Math.hypot(p.x - q.x, p.y - q.y), len0 = pinch.z - pinch.a + 1, nl = Math.max(MINBARS, Math.min(N, len0 * (pinch.d / (d || 1))));
      const bb = ctx.rect(), mid = (p.x + q.x) / 2, frac = Math.max(0, Math.min(1, (((mid - bb.left) / bb.width) * ctx.W - ctx.padL) / (ctx.W - ctx.padL - ctx.padR))), anchor = pinch.a + len0 * frac;
      a = anchor - nl * frac; z = a + nl - 1; redraw(); return;
    }
    if (drag && drag.zone) {
      if (drag.zone === 'x') { const len0 = drag.z - drag.a + 1, nl = Math.max(MINBARS, Math.min(N, len0 * Math.exp(-(e.clientX - drag.x) / 150))), anchor = drag.a + len0 * drag.frac; a = anchor - nl * drag.frac; z = a + nl - 1; redraw(); }   // the bars under the pointer stay put while the rest stretches around them
      else { const r0 = drag.hi - drag.lo, mid = (drag.hi + drag.lo) / 2, r = r0 * Math.exp((e.clientY - drag.y) / 150); yz = { lo: mid - r / 2, hi: mid + r / 2 }; redraw(); }
      return;
    }
    const s = inPlot(e); if (!s && !drag) return;
    const sv = s || ctx.toSvg(e);
    if (ctx.drawing) { if (pending) { preview = ctx.point(sv.x, sv.y); redraw(); } else ctx.show(ctx.barAt(sv.x), sv.y); return; }
    if (drag && drag.edit && ptrs.size === 1 && (e.buttons || drag.touch)) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > (drag.edit.kind === 'move' ? (drag.touch ? 10 : 6) : (drag.touch ? 6 : 4))) drag.moved = true;   // a small slip of the finger or mouse does not move a line
      if (drag.moved) {
        const ed = drag.edit, L = ed.orig;
        const line = ed.kind === 'move' ? ctx.shift(L, ed.X0, ed.Y0, sv.x, sv.y) : (() => { const q = ctx.point(sv.x, sv.y); return ed.kind === 'p1' ? { d1: q.d, p1: q.p, d2: L.d2, p2: L.p2 } : { d1: L.d1, p1: L.p1, d2: q.d, p2: q.p }; })();
        live = { id: ed.id, line }; redraw();
      }
      return;
    }
    if (drag && ptrs.size === 1 && (e.buttons || drag.touch)) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      if (Math.abs(dy) > 6) drag.vert = true;          // from here this drag also moves the chart up and down (a sideways-only drag keeps the price scale fitting itself)
      if (drag.moved && (box.isZoomed() || !drag.touch)) {
        let ch = false;
        if (drag.vert) {
          // the price range follows the pointer; it may leave the data by up to one data-height either way, so the chart cannot be lost
          const k = (drag.vr.hi - drag.vr.lo) / ctx.plotH, sh = (dy / (ctx.rect().height / ctx.H)) * k, dh = ctx.fitHi - ctx.fitLo;
          let lo2 = drag.vr.lo + sh, hi2 = drag.vr.hi + sh;
          const mid = (lo2 + hi2) / 2, mn = ctx.fitLo - dh, mx = ctx.fitHi + dh, adj = mid < mn ? mn - mid : mid > mx ? mx - mid : 0;
          lo2 += adj; hi2 += adj;
          if (!yz || Math.abs(yz.lo - lo2) > 1e-9) { yz = { lo: lo2, hi: hi2 }; ch = true; }
        }
        const bars = Math.round(((dx / ctx.rect().width) * ctx.W) / ctx.gw), len = drag.z - drag.a + 1, na = Math.max(room(len)[0], Math.min(room(len)[1], drag.a - bars));
        if (Math.round(na) !== Math.round(a)) { a = na; z = a + len - 1; ch = true; }
        if (ch) redraw();
        return;
      }
    }
    ctx.show(ctx.barAt(sv.x), sv.y);
  });
  const here = (e) => { const bb = box.getBoundingClientRect(); return { x: e.clientX - bb.left, y: e.clientY - bb.top }; };   // where on the chart the pointer is, for a popup
  const finish = (e) => {
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (!drag) return;
    if (drag.zone) { drag = null; return; }
    const moved = drag.moved, ed = drag.edit; drag = null;
    if (moved && ed) { const L = live && live.line; live = null; if (L) onLine.update(ed.id, L); return; }
    if (moved) return;
    const s = inPlot(e); if (!s) return;
    if (ctx.drawing) {
      const pt = ctx.point(s.x, s.y);
      if (!pending) { pending = pt; preview = null; onPending(pt); redraw(); }
      else if (onLine && onLine.add) { const L = { d1: pending.d, p1: pending.p, d2: pt.d, p2: pt.p }; pending = null; preview = null; onPending(null); onLine.add(L, here(e)); }
      return;
    }
    const id = ctx.near(s.x, s.y);
    if (id && onLine && onLine.select) { sel = id === selected ? null : id; onLine.select(sel, here(e)); }
    else if (selected && onLine && onLine.select) onLine.select(null);
  };
  box.addEventListener('pointerup', finish);
  // right-click (or a long press on a phone) on a line selects it and opens its options
  box.addEventListener('contextmenu', (e) => {
    if (!ctx || ctx.drawing || !onLine || !onLine.menu) return;
    const s = inPlot(e); if (!s) return;
    const id = ctx.near(s.x, s.y); if (!id) return;
    e.preventDefault(); drag = null; live = null; ptrs.clear(); pinch = null; sel = id; onLine.menu(id, here(e));
  });
  box.addEventListener('dblclick', (e) => { if (!ctx) return; const zs = ctx.toSvg(e), zone = ctx.zone(zs.x, zs.y); if (zone === 'y') { yz = null; redraw(); } else if (zone === 'x') { a = 0; z = N - 1; redraw(); } });
  box.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); pinch = null; drag = null; if (live) { live = null; redraw(); } });
  box.addEventListener('wheel', (e) => {
    const s = inPlot(e); if (!s) return;
    e.preventDefault();
    const frac = Math.max(0, Math.min(1, (s.x - ctx.padL) / (ctx.W - ctx.padL - ctx.padR)));
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const len = z - a + 1, step = Math.max(1, Math.round(len * 0.1)) * Math.sign(e.deltaX || e.deltaY); a = Math.max(room(len)[0], Math.min(room(len)[1], a + step)); z = a + len - 1; redraw(); }
    else zoomAt(e.deltaY < 0 ? 0.8 : 1.25, frac);
  }, { passive: false });
  box.append(paint(), read);
  return box;
}
