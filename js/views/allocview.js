// The allocation widget shared by Home and the What-if page: a donut of groups (by investment type or by risk), tap a slice to zoom in,
// and an expandable list below with every kind's share of everything and of its group.
import { h, money, compact, section } from '../ui.js';
import { donut, color, riskColor } from '../charts.js';
import { groupedTable, GROUPS, groupOfClass } from './groupmix.js';

const rerender = () => window.dispatchEvent(new Event('rerender'));
export let allocMode = (() => { try { return localStorage.getItem('fw.allocMode') === 'risk' ? 'risk' : 'cat'; } catch (e) { return 'cat'; } })();
let allocDrill = null;
export const setAlloc = (m, d) => { allocMode = m; allocDrill = d; try { localStorage.setItem('fw.allocMode', m); } catch (e) { /* private window */ } rerender(); };
const pc1 = (x) => (Math.round(x * 1000) / 10) + '%';
const limText = (b) => [b.max != null ? pc1(b.max) : null, b.maxAmt != null ? money(b.maxAmt) : null].filter(Boolean).join(' or ');

/** Groups for the chosen way of grouping, with the risk colours when grouping by risk. */
export function groupSetup(cfg, mode = allocMode) {
  const groups = mode === 'cat' ? GROUPS : cfg.buckets.map((b, i) => ({ id: b.id, label: b.name, color: riskColor(b.id, i, cfg.buckets.length) }));
  const gOf = mode === 'cat' ? (c) => groupOfClass(c.key) : (c) => c.bucket;
  return { groups, gOf };
}
export const groupToggle = () => h('nav', { class: 'seg slim', 'aria-label': 'Group by' }, [['cat', 'By investment type'], ['risk', 'By risk']].map(([k, l]) => h('a', { href: '#', class: allocMode === k ? 'on' : '', onclick: (e) => { e.preventDefault(); setAlloc(k, null); } }, l)));

/** The widget: toggle, donut and the list. cfg = risk settings, ev = evaluated state. */
export function allocationBody(cfg, ev) {
  const kinds = ev.classes.filter((c) => c.value > 1).sort((a, b) => b.value - a.value);
  const tot = kinds.reduce((a, c) => a + c.value, 0);
  const { groups, gOf } = groupSetup(cfg);
  const parents = groups.map((g) => ({ id: g.id, label: g.label, color: g.color, value: kinds.filter((c) => gOf(c) === g.id).reduce((a, c) => a + c.value, 0) })).filter((p) => p.value > 0);
  const drill = parents.find((p) => p.id === allocDrill) || null;
  const toneCls = (b) => (b.over ? 'neg' : b.near ? 'warn' : '');
  const share = (v, t) => (t > 0 ? (Math.round((v / t) * 1000) / 10) + '%' : '–');
  const chart = !drill
    ? h('div', { class: 'alloc-chart' }, donut(parents, { fmt: money, center: compact(tot), sub: 'total assets', onSelect: (p) => setAlloc(allocMode, p.id), size: 210 }), h('p', { class: 'note' }, 'Tap a slice to zoom into it. The colours match the list below.'))
    : h('div', { class: 'alloc-chart' }, h('button', { type: 'button', class: 'back-link', onclick: () => setAlloc(allocMode, null) }, '← All groups'),
      donut(kinds.filter((c) => gOf(c) === drill.id).map((c) => ({ label: c.name, value: c.value })), { fmt: money, center: compact(drill.value), sub: `${share(drill.value, tot)} of all`, size: 210 }));
  const bar = (v, t, g) => h('span', { class: 'mbar', title: share(v, t) }, h('i', { style: { width: Math.max(2, (t > 0 ? v / t : 0) * 100) + '%' } }));
  const sumOf = (it) => it.reduce((a, c) => a + c.value, 0);
  const table = groupedTable({
    rows: kinds, groups, groupOf: gOf, footerLabel: 'Total assets', parentDot: true, openIds: drill ? [drill.id] : [],
    childDot: (g, ri) => (drill && drill.id === g.id ? color(ri) : null),
    cols: [
      { label: allocMode === 'cat' ? 'Type' : 'Risk group' },
      { label: 'Amount', cls: 'r', parent: (it) => money(sumOf(it)), child: (c) => money(c.value), total: () => money(tot) },
      { label: 'Of all', cls: 'r', parent: (it) => h('span', { class: 'share' }, share(sumOf(it), tot), bar(sumOf(it), tot)), child: (c) => h('span', { class: 'share' }, share(c.value, tot), bar(c.value, tot)), total: () => '100%' },
      { label: 'Within group', cls: 'r', hide: true, parent: () => '', child: (c) => share(c.value, sumOf(kinds.filter((k) => gOf(k) === gOf(c)))) },
      { label: 'Limit', cls: 'r', hide: true, parent: () => '', child: (c) => h('span', { class: toneCls(c) }, c.max != null || c.maxAmt != null ? `${limText(c)}${c.over ? ' · over' : c.near ? ' · close' : ''}` : '–') },
    ],
  });
  return h('div', { class: 'alloc' }, h('div', { class: 'alloc-top' }, groupToggle()), h('div', { class: 'alloc-grid' }, chart, h('div', null, table, h('p', { class: 'note' }, 'Tap a group to open or close it. Each kind shows its share of everything and of its group.'))));
}
