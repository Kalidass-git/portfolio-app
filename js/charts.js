// Dependency-free SVG/HTML charts. Colors come from CSS variables --s1..--s8 (validated categorical palette, light and dark).
import { h, isMasked } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  kids.flat().forEach((k) => k && el.append(k.nodeType ? k : document.createTextNode(k)));
  return el;
};
export const color = (i) => `var(--s${(i % 8) + 1})`;

// One shared floating tooltip
let tipEl;
function tip() {
  if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip' }); document.body.append(tipEl); }
  return tipEl;
}
export function showTip(e, html) {
  const t = tip();
  t.replaceChildren(...html);
  t.style.display = 'block';
  const r = t.getBoundingClientRect();
  const x = Math.min(e.clientX + 14, window.innerWidth - r.width - 8), y = Math.max(8, e.clientY - r.height - 12);
  t.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
}
export const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };
const hover = (el, build) => {
  el.addEventListener('pointermove', (e) => showTip(e, build()));
  el.addEventListener('pointerleave', hideTip);
};

/** Stacked strip: the portfolio "spine". items: [{label, value, fmt}] */
export function strip(items, { fmt, total } = {}) {
  const sum = total ?? items.reduce((a, x) => a + Math.max(0, x.value), 0);
  const bar = h('div', { class: 'strip', role: 'img', 'aria-label': items.map((i) => `${i.label} ${((i.value / sum) * 100).toFixed(1)}%`).join(', ') });
  items.forEach((it, i) => {
    if (it.value <= 0) return;
    const seg = h('span', { class: 'seg', style: { flexGrow: String(it.value), background: color(i) }, 'data-i': i });
    hover(seg, () => [h('b', null, it.label), h('div', null, (fmt ? fmt(it.value) : it.value) + '  ·  ' + ((it.value / sum) * 100).toFixed(1) + '%')]);
    bar.append(seg);
  });
  return bar;
}
export function legend(items, { fmt } = {}) {
  const sum = items.reduce((a, x) => a + Math.max(0, x.value), 0);
  return h('ul', { class: 'legend' }, items.map((it, i) => h('li', null,
    h('i', { style: { background: color(i) } }),
    h('span', { class: 'lg-name' }, it.label),
    h('span', { class: 'lg-val' }, fmt ? fmt(it.value) : it.value),
    h('span', { class: 'lg-pct' }, sum ? ((it.value / sum) * 100).toFixed(1) + '%' : ''))));
}

/** Horizontal bars for category breakdowns. rows: [{label, value, sub}] */
export function hbars(rows, { fmt = (v) => v, max, colorIndex = 0, onClick } = {}) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return h('ul', { class: 'hbars' }, rows.map((r) => h('li', { class: onClick ? 'click' : '', onclick: onClick ? () => onClick(r) : null },
    h('span', { class: 'hb-label' }, r.label),
    h('span', { class: 'hb-track' }, h('span', { class: 'hb-fill', style: { width: Math.max(1.5, (r.value / m) * 100) + '%', background: color(r.ci ?? colorIndex) } })),
    h('span', { class: 'hb-val' }, fmt(r.value)))));
}

/** Draw to about the size it will be shown at, so axis text stays readable on a phone. */
const defaultWidth = () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : 640);
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
const short = (v) => {
  if (isMasked()) return '';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e7) return s + +(a / 1e7).toFixed(2) + 'Cr';
  if (a >= 1e5) return s + +(a / 1e5).toFixed(2) + 'L';
  if (a >= 1e3) return s + +(a / 1e3).toFixed(0) + 'k';
  return s + Math.round(a);
};

/**
 * Line chart. series: [{name, values:[n|null], dashed}] ; labels: x labels (same length).
 */
export function lineChart({ labels, series, fmt = (v) => v, height = 220, yMin, area = false, width }) {
  const W = width || defaultWidth(), H = height, pad = { l: 44, r: 12, t: 12, b: 24 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const lo = yMin ?? Math.min(0, ...all), hi = niceMax(Math.max(...all, 1));
  const x = (i) => pad.l + (labels.length < 2 ? 0 : (i / (labels.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': series.map((s) => s.name).join(' and ') });
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, short(v)));
  }
  const step = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) root.append(svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }, l)); });
  series.forEach((s, si) => {
    let d = '', started = false;
    s.values.forEach((v, i) => { if (v == null) { started = false; return; } d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; started = true; });
    if (area && si === 0) root.append(svg('path', { d: d + `L${x(labels.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z`, fill: color(si), opacity: '.12' }));
    root.append(svg('path', { d, fill: 'none', stroke: color(s.color ?? si), 'stroke-width': 2, 'stroke-dasharray': s.dashed ? '5 4' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  });
  const cross = svg('line', { y1: pad.t, y2: H - pad.b, class: 'cross', style: 'display:none' });
  const dots = series.map((s, si) => svg('circle', { r: 4, fill: color(s.color ?? si), class: 'dot', style: 'display:none' }));
  root.append(cross, ...dots);
  const hit = svg('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
  hit.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (labels.length - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
    series.forEach((s, si) => { const v = s.values[i]; const d = dots[si]; if (v == null) d.style.display = 'none'; else { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(v)); d.style.display = ''; } });
    showTip(e, [h('b', null, labels[i]), ...series.filter((s) => s.values[i] != null).map((s, si) => h('div', null, h('i', { class: 'tip-dot', style: { background: color(s.color ?? si) } }), `${s.name}: ${fmt(s.values[i])}`))]);
  });
  hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; dots.forEach((d) => (d.style.display = 'none')); hideTip(); });
  root.append(hit);
  return h('div', { class: 'chart-box' }, root, series.length > 1 ? h('ul', { class: 'legend inline' }, series.map((s, i) => h('li', null, h('i', { style: { background: color(s.color ?? i), ...(s.dashed ? { opacity: '.6' } : {}) } }), h('span', { class: 'lg-name' }, s.name)))) : null);
}

/** Grouped column chart. groups: [{label, values:[n]}], names: series names */
export function barChart({ groups, names, fmt = (v) => v, height = 220, width, colors }) {
  const col = (i) => color(colors ? colors[i] : i);
  const W = width || defaultWidth(), H = height, pad = { l: 44, r: 8, t: 12, b: 24 };
  const hi = niceMax(Math.max(1, ...groups.flatMap((g) => g.values)));
  const y = (v) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const gw = (W - pad.l - pad.r) / groups.length;
  const bw = Math.min(26, (gw - 8) / names.length - 2);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': names.join(', ') });
  for (let i = 0; i <= 4; i++) {
    const v = (hi * i) / 4;
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, short(v)));
  }
  groups.forEach((g, gi) => {
    const cx = pad.l + gw * gi + gw / 2;
    const left = cx - ((bw + 2) * names.length) / 2;
    g.values.forEach((v, si) => {
      if (v <= 0) return;
      const bh = Math.max(1, H - pad.b - y(v));
      root.append(svg('path', { d: `M${left + si * (bw + 2)},${H - pad.b}v${-(bh - Math.min(4, bh))}q0,-${Math.min(4, bh)} ${Math.min(4, bw / 2)},-${Math.min(4, bh)}h${bw - 2 * Math.min(4, bw / 2)}q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, bh)}v${bh - Math.min(4, bh)}z`, fill: col(si) }));
    });
    root.append(svg('text', { x: cx, y: H - 6, class: 'axis', 'text-anchor': 'middle' }, g.label));
    const hit = svg('rect', { x: pad.l + gw * gi, y: pad.t, width: gw, height: H - pad.t - pad.b, fill: 'transparent' });
    hover(hit, () => [h('b', null, g.title || g.label), ...names.map((n, si) => h('div', null, h('i', { class: 'tip-dot', style: { background: col(si) } }), `${n}: ${fmt(g.values[si])}`))]);
    root.append(hit);
  });
  return h('div', { class: 'chart-box' }, root, h('ul', { class: 'legend inline' }, names.map((n, i) => h('li', null, h('i', { style: { background: col(i) } }), h('span', { class: 'lg-name' }, n)))));
}

/** Tiny progress bar (value 0..1) */
export const meter = (v, ci = 0) => h('span', { class: 'meter' }, h('span', { style: { width: Math.min(100, Math.max(0, v * 100)) + '%', background: color(ci) } }));

/** Donut with the grand total in the middle. items: [{label, value}] (colors follow the list order, same as legend()). */
export function donut(items, { fmt = (v) => v, center = '', sub = '', size = 200 } = {}) {
  const sum = items.reduce((a, x) => a + Math.max(0, x.value), 0) || 1;
  const cx = 100, cy = 100, R = 92, r = 62;
  const root = svg('svg', { viewBox: '0 0 200 200', class: 'donut-svg', role: 'img', 'aria-label': items.map((i) => `${i.label} ${((i.value / sum) * 100).toFixed(1)}%`).join(', '), style: `max-width:${size}px` });
  const pt = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  let a0 = 0;
  const live = items.filter((x) => x.value > 0).length;
  items.forEach((it, i) => {
    if (it.value <= 0) return;
    const frac = it.value / sum, gap = live > 1 ? 0.012 : 0;
    const s = a0 + gap, e = a0 + frac * 2 * Math.PI - gap;
    a0 += frac * 2 * Math.PI;
    let d;
    if (frac > 0.9999) d = `M${cx},${cy - R}A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}ZM${cx},${cy - r}A${r},${r} 0 1 0 ${cx - 0.01},${cy - r}Z`;
    else {
      const [x1, y1] = pt(R, s), [x2, y2] = pt(R, e), [x3, y3] = pt(r, e), [x4, y4] = pt(r, s), big = e - s > Math.PI ? 1 : 0;
      d = `M${x1.toFixed(2)},${y1.toFixed(2)}A${R},${R} 0 ${big} 1 ${x2.toFixed(2)},${y2.toFixed(2)}L${x3.toFixed(2)},${y3.toFixed(2)}A${r},${r} 0 ${big} 0 ${x4.toFixed(2)},${y4.toFixed(2)}Z`;
    }
    const seg = svg('path', { d, fill: color(i), class: 'dseg', 'fill-rule': 'evenodd' });
    hover(seg, () => [h('b', null, it.label), h('div', null, fmt(it.value) + '  ·  ' + ((it.value / sum) * 100).toFixed(1) + '%')]);
    root.append(seg);
  });
  root.append(svg('text', { x: cx, y: sub ? cy - 2 : cy + 7, class: 'donut-c', 'text-anchor': 'middle' }, center));
  if (sub) root.append(svg('text', { x: cx, y: cy + 16, class: 'donut-s', 'text-anchor': 'middle' }, sub));
  return h('div', { class: 'donut' }, root);
}

/** Small trend line without axes, for tiles. values: numbers. */
export function spark(values, { height = 36, width = 120, tone = 0 } = {}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const x = (i) => (i / (values.length - 1)) * (width - 4) + 2, y = (v) => height - 3 - ((v - lo) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'spark', 'aria-hidden': 'true', width, height },
    svg('path', { d: d + `L${x(values.length - 1)},${height}L${x(0)},${height}Z`, fill: color(tone), opacity: '.14' }),
    svg('path', { d, fill: 'none', stroke: color(tone), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
}
