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
export const LINE_COLORS = { dma50: '#2962ff', dma200: '#ff9100', pe: '#aa00ff', avg: '#8a94a6', trend: '#00b8d4' };
const nice = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-IN') : v.toFixed(Math.abs(v) < 10 ? 2 : 1));
const DAY = 864e5, tms = (d) => Date.parse(d + 'T00:00:00Z'), isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const POS = 'var(--pos, #1a7f4b)', NEG = 'var(--neg, #c24141)';

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
  lines = [], tool = 'none', selected = null, onLine = null, view = null, onView = () => {}, peMedian = null, peLabel = 'P/E', peFmt = (v, d = 0) => v.toFixed(d), peSigned = false, newColor = null } = {}) {
  const N = rows.length;
  if (N < 2) return h('p', { class: 'empty' }, 'Not enough history for this range.');
  const MINBARS = Math.min(12, N);
  let a = 0, z = N - 1;                   // first and last bar shown
  if (view && view.d0) { const i0 = rows.findIndex((r) => r.d >= view.d0); let i1 = N - 1; while (i1 > 0 && rows[i1].d > view.d1) i1--; if (i0 >= 0 && i1 - i0 + 1 >= MINBARS) { a = i0; z = i1; } }
  const W = typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : 880;
  const box = h('div', { class: 'chart-box' });
  const read = h('div', { class: 'cd-read mc-read', 'aria-live': 'polite' });
  let yz = null;                          // price range chosen by dragging the price axis: { lo, hi } (null = fit what is on screen)
  let ctx = null, pending = null, preview = null, sel = selected, live = null;   // sel: the selected line; live: a line being dragged { id, line }      // first point of a trendline being drawn, and where the pointer is now
  const fix = () => { const len = Math.max(MINBARS, Math.min(N, Math.round(z - a + 1))); a = Math.max(0, Math.min(N - len, Math.round(a))); z = a + len - 1; };
  const redraw = () => { fix(); box.replaceChildren(paint(), read); onView(a === 0 && z === N - 1 ? null : { d0: rows[a].d, d1: rows[z].d }); };
  const zoomAt = (f, frac = 0.5) => { const len = z - a + 1, nl = Math.max(MINBARS, Math.min(N, len * f)); if (Math.round(nl) === len) return; const anchor = a + len * frac; a = anchor - nl * frac; z = a + nl - 1; redraw(); };
  box.zoom = (f) => zoomAt(f, 0.5); box.reset = () => { a = 0; z = N - 1; yz = null; redraw(); }; box.isZoomed = () => !(a === 0 && z === N - 1) || !!yz;

  function paint() {
    const R = rows.slice(a, z + 1), n = R.length, sub = (arr) => (arr ? arr.slice(a, z + 1) : null);
    const m50 = sub(dma50), m200 = sub(dma200), peS = sub(pe);
    const showPe = !!peS && peS.some((x) => x != null), hasVol = R.some((r) => r.v > 0);
    const padL = 46, padR = 8, padT = 8, axisH = 20, gap = 8, peH = showPe ? 66 : 0, volH = hasVol ? 44 : 0;
    const priceT = padT, priceB = padT + height, peT = priceB + gap, peB = peT + peH, volT = (showPe ? peB : priceB) + gap, volB = volT + volH;
    const H = (hasVol ? volB : showPe ? peB : priceB) + axisH, bottom = hasVol ? volB : showPe ? peB : priceB;
    const gw = (W - padL - padR) / n, cx = (i) => padL + gw * i + gw / 2;
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
    if (yz && mode !== 'pct') { lo = yz.lo; hi = yz.hi; }
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
    const px = (p) => padL + gw * p + gw / 2;

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart mchart', role: 'img', 'aria-label': `Price chart from ${dateFmt(R[0].d)} to ${dateFmt(R[n - 1].d)}` });
    const clip = 'mc-clip-' + Math.random().toString(36).slice(2, 8);
    root.append(svg('defs', {}, svg('clipPath', { id: clip }, svg('rect', { x: padL, y: priceT, width: W - padL - padR, height: priceB - priceT }))));
    for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; root.append(svg('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: padL - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, f(val(v)))); }
    const ticks = Math.min(W < 520 ? 3 : 6, n), seen = new Set();
    for (let k = 0; k < ticks; k++) { const i = ticks === 1 ? 0 : Math.round((k * (n - 1)) / (ticks - 1)); if (seen.has(i)) continue; seen.add(i); root.append(svg('text', { x: cx(i), y: bottom + 15, class: 'axis', 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle' }, tickFmt(R[i].d))); }

    // price
    const up = R[n - 1].c >= R[0].c, main = up ? POS : NEG;
    const pg = svg('g', { 'clip-path': `url(#${clip})` });
    if (mode === 'candle') {
      const cw = Math.max(1, Math.min(14, gw * 0.7));
      R.forEach((r, i) => {
        const col = r.c >= r.o ? POS : NEG, yo = y(r.o), yc = y(r.c);
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
        svg('text', { x: padL - 6, y: peT + 9, class: 'axis', 'text-anchor': 'end' }, peFmt(phi)), svg('text', { x: padL - 6, y: peB, class: 'axis', 'text-anchor': 'end' }, peFmt(plo)),
        svg('text', { x: padL + 4, y: peT + 11, class: 'axis', fill: LINE_COLORS.pe, style: 'font-weight:700' }, peLabel));
      if (peSigned && plo < 0 && phi > 0) root.append(svg('line', { x1: padL, x2: W - padR, y1: peY(0), y2: peY(0), stroke: 'var(--muted, #888)', 'stroke-width': 1, opacity: '.6' }));
      if (peMedian != null && peMedian >= plo && peMedian <= phi) root.append(svg('line', { x1: padL, x2: W - padR, y1: peY(peMedian), y2: peY(peMedian), stroke: LINE_COLORS.pe, 'stroke-width': 1.2, 'stroke-dasharray': '5 4', opacity: '.8' }), svg('text', { x: W - padR - 2, y: peY(peMedian) - 3, class: 'axis', 'text-anchor': 'end', fill: LINE_COLORS.pe }, 'Median ' + peFmt(peMedian, 1)));
      let seg = [];
      const flush = () => { if (seg.length > 1) root.append(svg('polyline', { points: seg.join(' '), fill: 'none', stroke: LINE_COLORS.pe, 'stroke-width': 2.2, 'stroke-linejoin': 'round' })); seg = []; };
      peS.forEach((x, i) => { if (x == null) flush(); else seg.push(`${cx(i).toFixed(1)},${peY(x).toFixed(1)}`); });
      flush();
    }
    // volume
    if (hasVol) {
      const vmax = Math.max(1, ...R.map((r) => r.v || 0)), cw = Math.max(1, Math.min(14, gw * 0.7));
      R.forEach((r, i) => { if (r.v > 0) { const hh = (r.v / vmax) * volH; root.append(svg('rect', { x: cx(i) - cw / 2, y: volB - hh, width: cw, height: hh, fill: r.c >= (i ? R[i - 1].c : r.o) ? POS : NEG, opacity: '.45' })); } });
    }

    // trendlines (not in % mode: the price axis there is relative)
    const lineLayer = svg('g', { 'clip-path': `url(#${clip})` }), segs = [];
    if (mode !== 'pct') {
      const draw = (L, sel, ghost) => {
        const col = L.color || LINE_COLORS.trend, x1 = px(posOf(L.d1)), x2 = px(posOf(L.d2)), y1 = y(L.p1), y2 = y(L.p2);
        lineLayer.append(svg('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': sel ? 2.8 : 1.8, 'stroke-linecap': 'round', 'stroke-dasharray': ghost ? '5 4' : null, opacity: ghost ? '.8' : null }));
        if (sel) for (const [xx, yy] of [[x1, y1], [x2, y2]]) lineLayer.append(svg('circle', { cx: xx, cy: yy, r: 5, fill: 'var(--surface, #fff)', stroke: col, 'stroke-width': 2 }));
        return { x1, y1, x2, y2 };
      };
      for (const L0 of lines || []) { const L = live && live.id === L0.id ? { ...L0, ...live.line } : L0; segs.push({ id: L.id, ...draw(L, L.id === sel, false) }); }
      if (pending && preview) draw({ d1: pending.d, p1: pending.p, d2: preview.d, p2: preview.p, color: newColor }, false, true);
      else if (pending) lineLayer.append(svg('circle', { cx: px(posOf(pending.d)), cy: y(pending.p), r: 4.5, fill: newColor || LINE_COLORS.trend }));
    }
    root.append(lineLayer);

    // touch / hover readout
    const cross = svg('line', { y1: priceT, y2: bottom, class: 'cross', style: 'display:none' });
    const dots = svg('g', {});
    const show = (i) => {
      const r = R[i], prev = i > 0 ? R[i - 1].c : r.o, ch = r.c - prev;
      cross.setAttribute('x1', cx(i)); cross.setAttribute('x2', cx(i)); cross.style.display = '';
      dots.replaceChildren();
      const dot = (yy, col) => dots.append(svg('circle', { cx: cx(i), cy: yy, r: 3.6, fill: col, stroke: 'var(--surface, #fff)', 'stroke-width': 1.2 }));
      if (mode !== 'candle') dot(y(r.c), main);
      if (m50 && m50[i] != null) dot(y(m50[i]), LINE_COLORS.dma50);
      if (m200 && m200[i] != null) dot(y(m200[i]), LINE_COLORS.dma200);
      if (showPe && peS[i] != null) dot(peY(peS[i]), LINE_COLORS.pe);
      const chip = (label, v, col) => (v == null ? null : h('span', { class: 'mc-chip' }, h('i', { style: { background: col } }), `${label} ${v}`));
      read.replaceChildren(h('b', null, dateFmt(r.d)), mode === 'candle' ? ` O ${fmt(r.o)} · H ${fmt(r.h)} · L ${fmt(r.l)} · C ${fmt(r.c)}` : ` ${fmt(r.c)}`,
        h('span', { class: ch >= 0 ? 'pos' : 'neg' }, ` ${ch >= 0 ? '+' : '−'}${(Math.abs(ch / prev) * 100).toFixed(2)}%`),
        mode === 'pct' ? h('span', { class: r.c >= base ? 'pos' : 'neg' }, ` · since start ${r.c >= base ? '+' : '−'}${(Math.abs(r.c / base - 1) * 100).toFixed(1)}%`) : '', r.v > 0 ? ` · Vol ${vfmt(r.v)}` : '',
        h('div', { class: 'mc-chips' }, chip('50d', m50 && m50[i] != null ? fmt(m50[i]) : null, LINE_COLORS.dma50), chip('200d', m200 && m200[i] != null ? fmt(m200[i]) : null, LINE_COLORS.dma200), chip(peLabel, showPe && peS[i] != null ? peFmt(peS[i], 1) : null, LINE_COLORS.pe)));
    };
    const rect = () => root.getBoundingClientRect();
    const toSvg = (e) => { const bb = rect(); return { x: ((e.clientX - bb.left) / bb.width) * W, y: ((e.clientY - bb.top) / bb.height) * H }; };
    const barAt = (X) => Math.max(0, Math.min(n - 1, Math.floor((X - padL) / gw)));
    const drawing = tool === 'line' && mode !== 'pct';
    const hit = svg('rect', { x: padL, y: priceT, width: W - padL - padR, height: bottom - priceT, fill: 'transparent', style: `cursor: ${drawing ? 'crosshair' : 'grab'}` });
    root.style.touchAction = drawing || sel ? 'none' : 'pan-y';
    // what a tap at (X, Y) means when drawing: the date of the bar and the price, snapped to the nearest high, low, open or close when it is close by
    const point = (X, Y) => {
      const p = (X - padL) / gw - 0.5, i = barAt(X);
      let price = priceAt(Y);
      if (mode === 'candle') { let best = null; for (const v of [R[i].o, R[i].h, R[i].l, R[i].c]) if (best == null || Math.abs(y(v) - Y) < Math.abs(y(best) - Y)) best = v; if (Math.abs(y(best) - Y) < 12) price = best; }
      return { d: dateOf(Math.max(0, Math.min(n - 1, p))), p: price };
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
    ctx = { H, lo, hi, plotH: priceB - priceT, zone: (X, Y) => (Y >= bottom && Y <= H && X >= padL ? 'x' : X < padL && Y >= priceT && Y <= priceB && mode !== 'pct' ? 'y' : null), hitLine, shift, show, point, near, barAt, toSvg, drawing, gw, padL, padR, W, rect, plot: [padL, priceT, W - padR, bottom] };
    // dragging the month labels stretches time, dragging the price labels stretches the price scale (double-click either to undo)
    const axX = svg('rect', { x: padL, y: bottom, width: W - padL - padR, height: axisH + 4, fill: 'transparent', style: 'cursor: ew-resize' });
    const axY = svg('rect', { x: 0, y: priceT, width: padL, height: priceB - priceT, fill: 'transparent', style: 'cursor: ns-resize' });
    root.append(axX, axY, cross, dots, hit);
    show(n - 1); cross.style.display = 'none'; dots.replaceChildren();
    return root;
  }
  // pointer handling sits on the stable wrapper, because the chart is redrawn while you drag or pinch
  const inPlot = (e) => { if (!ctx) return null; const s = ctx.toSvg(e), [x0, y0, x1, y1] = ctx.plot; return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 ? s : null; };
  const ptrs = new Map(); let drag = null, pinch = null;
  box.addEventListener('pointerdown', (e) => {
    if (ctx) { const zs = ctx.toSvg(e), zone = ctx.zone(zs.x, zs.y); if (zone) { try { box.setPointerCapture(e.pointerId); } catch { /* not supported */ } drag = { zone, x: e.clientX, y: e.clientY, a, z, lo: ctx.lo, hi: ctx.hi, moved: true }; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; } }
    const s = inPlot(e); if (!s) return;
    try { box.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), a, z }; drag = null; return; }
    drag = { x: e.clientX, y: e.clientY, a, z, moved: false, touch: e.pointerType === 'touch', yz: yz ? { ...yz } : null };
    if (!ctx.drawing) {
      const hl = ctx.hitLine(s.x, s.y), L = hl && (lines || []).find((q) => q.id === hl.id);
      if (hl && L && onLine && onLine.update) { drag.edit = { ...hl, X0: s.x, Y0: s.y, orig: L }; sel = hl.id; }
      else ctx.show(ctx.barAt(s.x));
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
      if (drag.zone === 'x') { const len0 = drag.z - drag.a + 1, nl = Math.max(MINBARS, Math.min(N, len0 * Math.exp(-(e.clientX - drag.x) / 150))); z = drag.z; a = z - nl + 1; if (a < 0) { a = 0; z = nl - 1; } redraw(); }
      else { const r0 = drag.hi - drag.lo, mid = (drag.hi + drag.lo) / 2, r = r0 * Math.exp((e.clientY - drag.y) / 150); yz = { lo: mid - r / 2, hi: mid + r / 2 }; redraw(); }
      return;
    }
    const s = inPlot(e); if (!s && !drag) return;
    const sv = s || ctx.toSvg(e);
    if (ctx.drawing) { if (pending) { preview = ctx.point(sv.x, sv.y); redraw(); } else ctx.show(ctx.barAt(sv.x)); return; }
    if (drag && drag.edit && ptrs.size === 1 && (e.buttons || drag.touch)) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) drag.moved = true;
      if (drag.moved) {
        const ed = drag.edit, L = ed.orig;
        const line = ed.kind === 'move' ? ctx.shift(L, ed.X0, ed.Y0, sv.x, sv.y) : (() => { const q = ctx.point(sv.x, sv.y); return ed.kind === 'p1' ? { d1: q.d, p1: q.p, d2: L.d2, p2: L.p2 } : { d1: L.d1, p1: L.p1, d2: q.d, p2: q.p }; })();
        live = { id: ed.id, line }; redraw();
      }
      return;
    }
    if (drag && ptrs.size === 1 && (e.buttons || drag.touch)) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4 || (yz && Math.abs(e.clientY - drag.y) > 4)) drag.moved = true;
      if (drag.moved && (box.isZoomed() || !drag.touch)) {
        if (yz && drag.yz) { const k = (drag.yz.hi - drag.yz.lo) / ctx.plotH, sh = ((e.clientY - drag.y) / (ctx.rect().height / ctx.H)) * k; yz = { lo: drag.yz.lo + sh, hi: drag.yz.hi + sh }; }
        const bars = Math.round(((dx / ctx.rect().width) * ctx.W) / ctx.gw), len = drag.z - drag.a + 1, na = Math.max(0, Math.min(N - len, drag.a - bars));
        if (Math.round(na) !== Math.round(a)) { a = na; z = a + len - 1; redraw(); }
        return;
      }
    }
    ctx.show(ctx.barAt(sv.x));
  });
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
      if (!pending) { pending = pt; preview = null; redraw(); }
      else if (onLine && onLine.add) { const L = { d1: pending.d, p1: pending.p, d2: pt.d, p2: pt.p }; pending = null; preview = null; onLine.add(L); }
      return;
    }
    const id = ctx.near(s.x, s.y);
    if (id && onLine && onLine.select) { sel = id === selected ? null : id; onLine.select(sel); }
    else if (selected && onLine && onLine.select) onLine.select(null);
  };
  box.addEventListener('pointerup', finish);
  box.addEventListener('dblclick', (e) => { if (!ctx) return; const zs = ctx.toSvg(e), zone = ctx.zone(zs.x, zs.y); if (zone === 'y') { yz = null; redraw(); } else if (zone === 'x') { a = 0; z = N - 1; redraw(); } });
  box.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); pinch = null; drag = null; if (live) { live = null; redraw(); } });
  box.addEventListener('wheel', (e) => {
    const s = inPlot(e); if (!s) return;
    e.preventDefault();
    const frac = Math.max(0, Math.min(1, (s.x - ctx.padL) / (ctx.W - ctx.padL - ctx.padR)));
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const len = z - a + 1, step = Math.max(1, Math.round(len * 0.1)) * Math.sign(e.deltaX || e.deltaY); a = Math.max(0, Math.min(N - len, a + step)); z = a + len - 1; redraw(); }
    else zoomAt(e.deltaY < 0 ? 0.8 : 1.25, frac);
  }, { passive: false });
  box.append(paint(), read);
  return box;
}
