// The Action-centre card (icon, title, summary, chevron, tabs inside), so other screens can look exactly like the one on Home.
import { h } from './ui.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const ICONS = {
  budget: ['M21.21 15.89A10 10 0 1 1 8 2.83', 'M22 12A10 10 0 0 0 12 2v10z'],
  chev: ['M6 9l6 6 6-6'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
};
/** Small rounded icon, drawn the same way as Home's. */
export function axIcon(key, cls) {
  const e = document.createElement('span'); e.className = 'hico ' + cls; e.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVGNS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
  for (const d of ICONS[key]) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); svg.append(p); }
  e.append(svg); return e;
}

/** { icon, title, summary, open, onToggle, needs (red), badge (number on the icon), body (shown when open) } */
export function axCard({ icon = 'budget', title, summary, open, onToggle, needs = false, badge = 0, body = null, label = '' }) {
  return h('section', { class: 'card ax' + (open ? ' is-open' : ' is-closed') + (needs ? ' needs' : '') },
    h('button', { type: 'button', class: 'ax-top ax-toggle', 'aria-expanded': String(open), 'aria-label': `${label || title}. ${summary}${open ? '. Tap to collapse' : '. Tap to open'}`, onclick: onToggle },
      h('span', { class: 'ax-bellwrap' }, axIcon(icon, 'ax-logo'), badge ? h('span', { class: 'ax-badge' }, String(badge)) : null),
      h('div', { class: 'ax-ttl' }, h('h2', null, title), h('p', { class: 'ax-sub' }, summary)),
      axIcon('chev', 'ax-chev')),
    open ? h('div', { class: 'ax-panel' }, body) : null);
}
export const axAlertRow = ({ tone = '', title, meta, value, href }) => h('li', { class: 'ax-alert ' + tone, tabindex: 0, onclick: () => { if (href) location.hash = href; } },
  axIcon('alert', 'ax-ev'), h('div', { class: 'ax-main' }, h('b', null, title), h('span', { class: 'ax-meta' }, meta)), value ? h('span', { class: 'ax-val ' + tone }, value) : null);
