// Holdings grouped into four high-level groups (Debts, Gold, Equity, Others). Parent rows show the group, tap one to see its kinds underneath.
import { h } from '../ui.js';
import { color } from '../charts.js';

export const GROUPS = [
  { id: 'debt', label: 'Debts & fixed income', hint: 'bonds, FDs, RDs, EPF, PPF, lending, chits, insurance' },
  { id: 'gold', label: 'Gold', hint: '' },
  { id: 'equity', label: 'Equity, ETFs & mutual funds', hint: '' },
  { id: 'other', label: 'Others', hint: 'cash and the rest' },
];
const CLASS_GROUP = { bonds: 'debt', lending: 'debt', fds: 'debt', pf: 'debt', chits: 'debt', lic: 'debt', gold: 'gold', shares: 'equity', etfs: 'equity', funds: 'equity', cash: 'other', other: 'other' };
/** Group of a projector class key (cash, bonds, lending, fds, pf, chits, lic, gold, shares, etfs, funds, other). */
export const groupOfClass = (key) => CLASS_GROUP[key] || 'other';
/** Group of an allocation-goal key (bonds, lending, safe, equity, gold, chits, other). */
export const groupOfAlloc = (key) => ({ bonds: 'debt', lending: 'debt', safe: 'debt', chits: 'debt', equity: 'equity', gold: 'gold', other: 'other' }[key] || 'other');

/**
 * cols: [{ label, cls, hide (hide on phones), host, parent(items) -> node, child(row) -> node, total(rows) -> node }]
 * The first column is the name column: parent shows the group, child shows the row's own name.
 */
export function groupedTable({ cols, rows, groupOf, onRow, rowClass, footerLabel = 'Total', open = false, groups = GROUPS, openIds = [], childDot = null, parentDot = false }) {
  const t = h('table', { class: 'tbl gt' }, h('thead', null, h('tr', null, cols.map((c, i) => h('th', { class: [c.cls || '', c.hide ? 'hide-sm' : ''].join(' ').trim() }, i === 0 && c.label ? c.label : c.label)))));
  let n = 0;
  for (const g of groups) {
    const items = rows.filter((r) => groupOf(r) === g.id);
    if (!items.length) continue;
    const gc = color(n++), isOpen = open || openIds.includes(g.id);
    const tb = h('tbody', { class: 'grp' + (isOpen ? '' : ' collapsed'), style: { '--g': gc } });
    tb.append(h('tr', { class: 'gt-parent', style: { '--g': gc }, tabindex: 0, 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { tb.classList.toggle('collapsed'); tb.firstChild.setAttribute('aria-expanded', String(!tb.classList.contains('collapsed'))); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }, title: 'Tap to show or hide the kinds inside' },
      cols.map((c, i) => h('td', { class: [c.cls || '', c.hide ? 'hide-sm' : ''].join(' ').trim() }, i === 0 ? [h('span', { class: 'caret', 'aria-hidden': 'true' }, '▸'), parentDot ? h('i', { class: 'gdot', style: { background: gc } }) : null, h('b', null, g.label), h('span', { class: 'cnt' }, ` ${items.length}`)] : c.parent ? c.parent(items) : ''))));
    items.forEach((r, ri) => tb.append(h('tr', { class: 'gt-child ' + (onRow ? 'click ' : '') + ((rowClass && rowClass(r)) || ''), onclick: onRow ? () => onRow(r) : null },
      cols.map((c, i) => h('td', { class: [c.cls || '', c.hide ? 'hide-sm' : ''].join(' ').trim() }, i === 0 && childDot && childDot(g, ri) ? [h('i', { class: 'gdot', style: { background: childDot(g, ri) } }), r.label || r.name] : c.child ? c.child(r) : i === 0 ? (r.label || r.name) : '')))));
    t.append(tb);
  }
  if (cols.some((c) => c.total)) t.append(h('tfoot', null, h('tr', null, cols.map((c, i) => h('td', { class: [c.cls || '', c.hide ? 'hide-sm' : ''].join(' ').trim() }, i === 0 ? footerLabel : c.total ? c.total(rows) : '')))));
  return h('div', { class: 'tbl-wrap' }, t);
}
