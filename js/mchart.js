// Trading-style price chart: line, percent change or candles; 50 and 200-day averages on the price; your average cost and buy / sell marks;
// a P/E panel; volume. One touch or hover shows every figure for that day. Draws SVG only (no libraries).
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  kids.flat().forEach((k) => k && el.append(k.nodeType ? k : document.createTextNode(k)));
  return el;
};
export const LINE_COLORS = { dma50: 'var(--s1)', dma200: 'var(--s7)', pe: 'var(--s2)', avg: 'var(--gold, #b8892a)' };
const nice = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-IN') : v.toFixed(Math.abs(v) < 10 ? 2 : 1));

/**
 * rows: [{ d, o, h, l, c, v }] oldest first.
 * dma50, dma200, pe: arrays the same length as rows (null where unknown), or null to leave the line out.
 * avg: your average cost (a flat dashed line) or null. trades: [{ d, side: 'BUY' | 'SELL', price, qty }].
 * mode: 'line' | 'pct' | 'candle'.
 */
export function marketChart({ rows, mode = 'line', dma50 = null, dma200 = null, pe = null, avg = null, trades = [], height = 250, fmt = nice, vfmt = (v) => String(Math.round(v)), dateFmt = (d) => d, tickFmt = (d) => d } = {}) {
  const n = rows.length;
  if (n < 2) return h('p', { class: 'empty' }, 'Not enough history for this range.');
  const W = typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : 880;
  const showPe = !!pe && pe.some((x) => x != null);
  const hasVol = rows.some((r) => r.v > 0);
  const padL = 46, padR = 8, padT = 8, axisH = 20, gap = 8;
  const peH = showPe ? 66 : 0, volH = hasVol ? 44 : 0;
  const priceT = padT, priceB = padT + height;
  const peT = priceB + gap, peB = peT + peH;
  const volT = (showPe ? peB : priceB) + gap, volB = volT + volH;
  const H = (hasVol ? volB : showPe ? peB : priceB) + axisH;
  const gw = (W - padL - padR) / n, cx = (i) => padL + gw * i + gw / 2;
  const base = rows[0].c;
  const val = (x) => (mode === 'pct' ? x / base - 1 : x);
  const f = mode === 'pct' ? (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%` : fmt;

  // price range
  const vals = [];
  rows.forEach((r) => { if (mode === 'candle') { vals.push(r.l, r.h); } else vals.push(r.c); });
  for (const arr of [dma50, dma200]) if (arr) arr.forEach((x) => { if (x != null) vals.push(x); });
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (avg != null && avg > lo - (hi - lo) * 0.5 && avg < hi + (hi - lo) * 0.5) { lo = Math.min(lo, avg); hi = Math.max(hi, avg); }
  const span = hi - lo || hi * 0.02 || 1; lo -= span * 0.06; hi += span * 0.06;
  const y = (v) => priceT + (1 - (val(v) - val(lo)) / (val(hi) - val(lo))) * (priceB - priceT);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart mchart', role: 'img', 'aria-label': `Price chart from ${dateFmt(rows[0].d)} to ${dateFmt(rows[n - 1].d)}` });
  for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; root.append(svg('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: padL - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, f(val(v)))); }
  const bottom = hasVol ? volB : showPe ? peB : priceB;
  const ticks = Math.min(W < 520 ? 3 : 6, n), seen = new Set();
  for (let k = 0; k < ticks; k++) { const i = ticks === 1 ? 0 : Math.round((k * (n - 1)) / (ticks - 1)); if (seen.has(i)) continue; seen.add(i); root.append(svg('text', { x: cx(i), y: bottom + 15, class: 'axis', 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle' }, tickFmt(rows[i].d))); }

  // price
  const up = rows[n - 1].c >= rows[0].c, main = up ? 'var(--pos, #1a7f4b)' : 'var(--neg, #c24141)';
  if (mode === 'candle') {
    const cw = Math.max(1, Math.min(14, gw * 0.7));
    rows.forEach((r, i) => {
      const col = r.c >= r.o ? 'var(--pos, #1a7f4b)' : 'var(--neg, #c24141)', yo = y(r.o), yc = y(r.c);
      root.append(svg('line', { x1: cx(i), x2: cx(i), y1: y(r.h), y2: y(r.l), stroke: col, 'stroke-width': 1 }), svg('rect', { x: cx(i) - cw / 2, y: Math.min(yo, yc), width: cw, height: Math.max(1, Math.abs(yo - yc)), fill: col }));
    });
  } else {
    const pts = rows.map((r, i) => `${cx(i).toFixed(1)},${y(r.c).toFixed(1)}`);
    root.append(svg('path', { d: `M${cx(0).toFixed(1)},${priceB} L${pts.join(' L')} L${cx(n - 1).toFixed(1)},${priceB} Z`, fill: main, opacity: '.10' }), svg('polyline', { points: pts.join(' '), fill: 'none', stroke: main, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
  }
  // averages: thicker, own colours, so they cannot be mistaken for your own average-cost line
  const overlay = (arr, col) => {
    if (!arr) return;
    let seg = [];
    const flush = () => { if (seg.length > 1) root.append(svg('polyline', { points: seg.join(' '), fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); seg = []; };
    arr.forEach((x, i) => { if (x == null) flush(); else seg.push(`${cx(i).toFixed(1)},${y(x).toFixed(1)}`); });
    flush();
  };
  overlay(dma200, LINE_COLORS.dma200); overlay(dma50, LINE_COLORS.dma50);
  if (avg != null && avg >= lo && avg <= hi) {
    root.append(svg('line', { x1: padL, x2: W - padR, y1: y(avg), y2: y(avg), stroke: LINE_COLORS.avg, 'stroke-width': 1.3, 'stroke-dasharray': '6 4' }),
      svg('text', { x: W - padR - 2, y: y(avg) - 4, class: 'axis', 'text-anchor': 'end', fill: LINE_COLORS.avg }, 'Your average ' + fmt(avg)));
  }
  // your buys and sells
  const idxOn = (d) => { let i = rows.findIndex((r) => r.d >= d); return i < 0 ? -1 : i; };
  for (const t of trades || []) {
    if (t.d < rows[0].d || t.d > rows[n - 1].d) continue;
    const i = idxOn(t.d); if (i < 0) continue;
    const buy = t.side !== 'SELL', px = cx(i), py = buy ? y(mode === 'candle' ? rows[i].l : rows[i].c) + 10 : y(mode === 'candle' ? rows[i].h : rows[i].c) - 10;
    root.append(svg('path', { d: buy ? `M${px},${py - 6} l5,9 h-10 z` : `M${px},${py + 6} l5,-9 h-10 z`, fill: buy ? 'var(--pos, #1a7f4b)' : 'var(--neg, #c24141)', stroke: 'var(--surface, #fff)', 'stroke-width': 1 }, svg('title', {}, `${buy ? 'Bought' : 'Sold'} ${t.qty != null ? t.qty + ' ' : ''}on ${dateFmt(t.d)}${t.price ? ' at ' + fmt(t.price) : ''}`)));
  }

  // P/E panel
  let peY = null;
  if (showPe) {
    const pv = pe.filter((x) => x != null), plo0 = Math.min(...pv), phi0 = Math.max(...pv), ps = phi0 - plo0 || phi0 * 0.1 || 1, plo = Math.max(0, plo0 - ps * 0.12), phi = phi0 + ps * 0.12;
    peY = (v) => peT + (1 - (v - plo) / (phi - plo)) * (peB - peT);
    root.append(svg('line', { x1: padL, x2: W - padR, y1: peT, y2: peT, class: 'grid' }), svg('line', { x1: padL, x2: W - padR, y1: peB, y2: peB, class: 'grid' }),
      svg('text', { x: padL - 6, y: peT + 9, class: 'axis', 'text-anchor': 'end' }, phi.toFixed(0)), svg('text', { x: padL - 6, y: peB, class: 'axis', 'text-anchor': 'end' }, plo.toFixed(0)),
      svg('text', { x: padL + 4, y: peT + 11, class: 'axis', fill: LINE_COLORS.pe, style: 'font-weight:700' }, 'P/E'));
    let seg = [];
    const flush = () => { if (seg.length > 1) root.append(svg('polyline', { points: seg.join(' '), fill: 'none', stroke: LINE_COLORS.pe, 'stroke-width': 2.2, 'stroke-linejoin': 'round' })); seg = []; };
    pe.forEach((x, i) => { if (x == null) flush(); else seg.push(`${cx(i).toFixed(1)},${peY(x).toFixed(1)}`); });
    flush();
  }
  // volume
  if (hasVol) {
    const vmax = Math.max(1, ...rows.map((r) => r.v || 0)), cw = Math.max(1, Math.min(14, gw * 0.7));
    rows.forEach((r, i) => { if (r.v > 0) { const hh = (r.v / vmax) * volH; root.append(svg('rect', { x: cx(i) - cw / 2, y: volB - hh, width: cw, height: hh, fill: r.c >= (i ? rows[i - 1].c : r.o) ? 'var(--pos, #1a7f4b)' : 'var(--neg, #c24141)', opacity: '.38' })); } });
  }

  // touch / hover
  const cross = svg('line', { y1: priceT, y2: bottom - 0, class: 'cross', style: 'display:none' });
  const dots = svg('g', {});
  const read = h('div', { class: 'cd-read mc-read', 'aria-live': 'polite' });
  const show = (i) => {
    const r = rows[i], prev = i > 0 ? rows[i - 1].c : r.o, ch = r.c - prev;
    cross.setAttribute('x1', cx(i)); cross.setAttribute('x2', cx(i)); cross.style.display = '';
    dots.replaceChildren();
    const dot = (yy, col) => dots.append(svg('circle', { cx: cx(i), cy: yy, r: 3.6, fill: col, stroke: 'var(--surface, #fff)', 'stroke-width': 1.2 }));
    if (mode !== 'candle') dot(y(r.c), main);
    if (dma50 && dma50[i] != null) dot(y(dma50[i]), LINE_COLORS.dma50);
    if (dma200 && dma200[i] != null) dot(y(dma200[i]), LINE_COLORS.dma200);
    if (showPe && pe[i] != null) dot(peY(pe[i]), LINE_COLORS.pe);
    const chip = (label, v, col) => (v == null ? null : h('span', { class: 'mc-chip' }, h('i', { style: { background: col } }), `${label} ${v}`));
    read.replaceChildren(h('b', null, dateFmt(r.d)), mode === 'candle' ? ` O ${fmt(r.o)} · H ${fmt(r.h)} · L ${fmt(r.l)} · C ${fmt(r.c)}` : ` ${fmt(r.c)}`,
      h('span', { class: ch >= 0 ? 'pos' : 'neg' }, ` ${ch >= 0 ? '+' : '−'}${(Math.abs(ch / prev) * 100).toFixed(2)}%`), mode === 'pct' ? h('span', { class: r.c >= base ? 'pos' : 'neg' }, ` · since start ${r.c >= base ? '+' : '−'}${(Math.abs(r.c / base - 1) * 100).toFixed(1)}%`) : "", r.v > 0 ? ` · Vol ${vfmt(r.v)}` : '',
      h('div', { class: 'mc-chips' }, chip('50d', dma50 && dma50[i] != null ? fmt(dma50[i]) : null, LINE_COLORS.dma50), chip('200d', dma200 && dma200[i] != null ? fmt(dma200[i]) : null, LINE_COLORS.dma200), chip('P/E', showPe && pe[i] != null ? pe[i].toFixed(1) : null, LINE_COLORS.pe)));
  };
  const at = (e) => { const b = root.getBoundingClientRect(), px = ((e.clientX - b.left) / b.width) * W; return Math.max(0, Math.min(n - 1, Math.floor((px - padL) / gw))); };
  const hit = svg('rect', { x: padL, y: priceT, width: W - padL - padR, height: bottom - priceT, fill: 'transparent', style: 'touch-action: pan-y' });
  hit.addEventListener('pointermove', (e) => show(at(e))); hit.addEventListener('pointerdown', (e) => show(at(e)));
  root.append(cross, dots, hit);
  show(n - 1); cross.style.display = 'none'; dots.replaceChildren();
  return h('div', { class: 'chart-box' }, root, read);
}
