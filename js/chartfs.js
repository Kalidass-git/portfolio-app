// Double-tap (or double-click) a chart panel to open it full screen, then pinch / scroll / drag to zoom in on the detail.
// Works on any section that holds a chart. The panel itself is moved into the overlay, so its buttons keep working;
// when the page redraws (a period button, say) the fresh panel is moved in so the overlay stays open.
import { h } from './ui.js';

let ov = null, key = '', idx = 0, sec = null, hold = null, zoom = { z: 1, x: 0, y: 0 }, box = null;
const chartSecs = () => [...document.querySelectorAll('#main section')].filter((x) => !x.closest('.fs-overlay') && x.querySelector('.chart-box'));
const titleOf = (s) => ((s.querySelector('h2, h3') || {}).textContent || '').trim();
const MAX = 8;

function chartBox() { return sec ? sec.querySelector('.chart-box') : null; }
function apply() {
  if (!box) return;
  const svg = box.querySelector('svg.chart'); if (!svg) return;
  const w = box.clientWidth, hgt = svg.getBoundingClientRect().height / (zoom.z || 1);
  zoom.z = Math.min(MAX, Math.max(1, zoom.z));
  zoom.x = Math.min(0, Math.max(w * (1 - zoom.z), zoom.x)); zoom.y = Math.min(0, Math.max(hgt * (1 - zoom.z), zoom.y));
  if (zoom.z === 1) { zoom.x = 0; zoom.y = 0; }
  svg.style.transformOrigin = '0 0'; svg.style.transform = zoom.z === 1 ? '' : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})`;
  box.classList.toggle('fs-zoomed', zoom.z > 1);
  const r = ov && ov.querySelector('.fs-z'); if (r) r.textContent = zoom.z > 1 ? Math.round(zoom.z * 100) + '%' : '100%';
}
function zoomAt(cx, cy, nz) {
  nz = Math.min(MAX, Math.max(1, nz)); const k = nz / zoom.z;
  zoom.x = cx - (cx - zoom.x) * k; zoom.y = cy - (cy - zoom.y) * k; zoom.z = nz; apply();
}
function wire() {
  box = chartBox(); if (!box) return;
  box.classList.add('fs-box');
  const pts = new Map(); let last = null, pinch = 0, tapT = 0, tapX = 0, tapY = 0;
  const rel = (e) => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  box.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = rel(e); zoomAt(x, y, zoom.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
  box.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { const r = box.getBoundingClientRect(); zoomAt((a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, zoom.z * (d / pinch)); } pinch = d; return; }
    if (zoom.z > 1 && last && e.pointerType !== 'mouse') { zoom.x += e.clientX - last[0]; zoom.y += e.clientY - last[1]; apply(); }
    last = [e.clientX, e.clientY];
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; if (pts.size === 1) last = [...pts.values()][0]; };
  box.addEventListener('pointerup', (e) => {
    const was = pts.size; up(e);
    if (e.pointerType === 'touch' && was === 1) { const t = Date.now(); if (t - tapT < 320 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 30) { tapT = 0; const [x, y] = rel(e); zoom.z > 1 ? (zoom.z = 1, apply()) : zoomAt(x, y, 2.5); } else { tapT = t; tapX = e.clientX; tapY = e.clientY; } }
  });
  box.addEventListener('pointercancel', up);
  box.addEventListener('dblclick', (e) => { const [x, y] = rel(e); zoom.z > 1 ? (zoom.z = 1, apply()) : zoomAt(x, y, 2.5); });
  apply();
}

function adopt(s) {
  sec = s; key = titleOf(s);
  hold = document.createComment('chart-fs'); s.before(hold);
  ov.querySelector('.fs-body').replaceChildren(s); s.classList.add('fs-panel');
  ov.querySelector('.fs-title').textContent = key;
  zoom = { z: 1, x: 0, y: 0 }; wire();
}
function open(s) {
  if (ov) return;
  ov = h('div', { class: 'fs-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Chart full screen' },
    h('div', { class: 'fs-bar' }, h('b', { class: 'fs-title' }), h('span', { class: 'fs-hint' }, 'Pinch, scroll or double-tap to zoom'),
      h('div', { class: 'fs-btns' },
        h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => { const r = box.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, zoom.z / 1.5); } }, '−'),
        h('span', { class: 'fs-z' }, '100%'),
        h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => { const r = box.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, zoom.z * 1.5); } }, '+'),
        h('button', { type: 'button', class: 'fs-x', 'aria-label': 'Close full screen', onclick: close }, '✕'))),
    h('div', { class: 'fs-body' }));
  document.body.append(ov); document.documentElement.classList.add('fs-lock');
  idx = chartSecs().indexOf(s); adopt(s);
  try { if (ov.requestFullscreen) ov.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (ov) ov.dataset.fsAsked = '1'; }).catch(() => {}); } catch (_) { /* not allowed here: the overlay still fills the window */ }
}
function close() {
  if (!ov) return;
  if (sec) { sec.classList.remove('fs-panel'); const svg = sec.querySelector('svg.chart'); if (svg) { svg.style.transform = ''; } if (box) box.classList.remove('fs-zoomed'); if (hold && hold.isConnected) hold.replaceWith(sec); else sec.remove(); }
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_) { /* already out */ }
  ov.remove(); ov = null; sec = null; hold = null; box = null; key = ''; document.documentElement.classList.remove('fs-lock');
}
// the page was redrawn: move the fresh copy of the same panel in, so the overlay shows the new numbers
function sync() {
  if (!ov) return;
  const fresh = chartSecs()[idx];
  if (!fresh) { close(); return; }
  const old = sec; if (old && old !== fresh) { old.remove(); }
  const z = zoom.z; adopt(fresh); if (z > 1) { zoom.z = z; apply(); }
}

export function initChartFullscreen() {
  const target = (e) => { const t = e.target; if (!t || !t.closest || ov) return null; const b = t.closest('.chart-box'); if (!b || b.closest('.nwp-row, .nwp-sp, dialog, .modal')) return null; return b.closest('section'); };
  let tapT = 0, tapX = 0, tapY = 0;
  document.addEventListener('dblclick', (e) => { const s = target(e); if (s) { e.preventDefault(); open(s); } });
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || ov) return; const s = target(e); if (!s) { tapT = 0; return; }
    const t = Date.now(); if (t - tapT < 320 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 30) { tapT = 0; open(s); } else { tapT = t; tapX = e.clientX; tapY = e.clientY; }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov) close(); });
  document.addEventListener('fullscreenchange', () => { if (ov && !document.fullscreenElement && ov.dataset.fsAsked) close(); });
  window.addEventListener('hashchange', close);
  const main = document.getElementById('main');
  if (main) new MutationObserver(() => { if (ov) queueMicrotask(sync); }).observe(main, { childList: true });
}
