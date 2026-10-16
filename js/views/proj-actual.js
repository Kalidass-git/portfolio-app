// Wealth projector → planned versus actual new money, monthly and yearly.
import { S } from '../store.js';
import * as P from '../projector.js';
import * as A from '../actuals.js';
import { h, money, monthLabel, section, table } from '../ui.js';
import { barChart, color } from '../charts.js';
import { rerender, signed, tone } from './proj-shared.js';

let mode = 'month', selMonth = null, selYear = null;
const SKIP = new Set(['pf']); // EPF and PPF come out of salary and sit in the "EPF and loan" assumption

/** Planned amount for a class in a calendar month, from the plan's new-money lines. */
export function plannedFor(plan, month, cls) {
  return (plan.a.invest || []).filter((l) => l.cls === cls && (!l.from || month >= l.from) && (!l.to || month <= l.to)).reduce((s, l) => s + (l.monthly || 0), 0);
}
const toggle = (items, cur, set, label) => h('nav', { class: 'seg', 'aria-label': label }, items.map(([k, l]) => h('a', { href: 'javascript:void 0', class: k === cur ? 'on' : '', 'aria-selected': String(k === cur), onclick: (e) => { e.preventDefault(); set(k); rerender(); } }, l)));

export function render(root, plan) {
  const by = A.investedByMonth(S.data);
  const cur = String(S.all.asOf).slice(0, 7);
  const year = String(plan.year);
  const months = A.yearMonths(plan.year);
  if (!selMonth || !months.includes(selMonth)) selMonth = months.includes(cur) ? cur : months[months.length - 1];
  const years = [...new Set([year, ...A.yearsWithData(by).filter((y) => y >= String(Number(year) - 3) && y <= year)])].sort().reverse();
  if (!selYear || !years.includes(selYear)) selYear = year;

  const classes = (months2) => [...new Set([...(plan.a.invest || []).map((l) => l.cls), ...P.CLASSES.map((c) => c.key).filter((k) => months2.some((m) => A.actualOf(by, m, k) > 0))])].filter((k) => !SKIP.has(k) && P.classOf(k));
  const order = (a, b) => P.CLASSES.findIndex((c) => c.key === a) - P.CLASSES.findIndex((c) => c.key === b);
  const diffCell = (planned, actual) => { const d = actual - planned; return h('span', { class: planned ? tone(d) : '' }, planned || actual ? signed(d) : '–'); };

  let body;
  if (mode === 'month') {
    const ms = [selMonth];
    const rows = classes(ms).sort(order).map((k) => ({ k, label: P.classOf(k).label, planned: plannedFor(plan, selMonth, k), actual: A.actualOf(by, selMonth, k), src: A.sourcesOf(by, ms, k) }));
    const tp = rows.reduce((s, r) => s + r.planned, 0), ta = rows.reduce((s, r) => s + r.actual, 0);
    body = h('div', null,
      h('div', { class: 'filters' }, h('label', null, 'Month ', h('select', { class: 'month-select', 'aria-label': 'Month', onchange: (e) => { selMonth = e.target.value; rerender(); } }, months.map((m) => h('option', { value: m, selected: m === selMonth }, monthLabel(m, true)))))),
      table([
        { label: 'Goes into', host: true, get: (r) => r.label },
        { label: 'Planned', cls: 'r', get: (r) => money(r.planned), total: () => money(tp) },
        { label: 'Actual', cls: 'r', get: (r) => money(r.actual), total: () => money(ta) },
        { label: 'Difference', cls: 'r', render: (r) => diffCell(r.planned, r.actual), total: () => signed(ta - tp) },
        { label: 'Taken from', mob: 'hide', get: (r) => r.src.join(', ') },
      ], rows, { footer: { label: 'Total' }, empty: 'Nothing planned or invested this month.' }));
  } else {
    const ms = A.yearMonths(Number(selYear));
    const planYear = selYear === year;
    const upto = (m) => m <= cur;
    const rows = classes(ms).sort(order).map((k) => ({ k, label: P.classOf(k).label, planned: planYear ? ms.reduce((s, m) => s + plannedFor(plan, m, k), 0) : null, plannedSoFar: planYear ? ms.filter(upto).reduce((s, m) => s + plannedFor(plan, m, k), 0) : null, actual: A.yearTotal(by, selYear, k), src: A.sourcesOf(by, ms, k) }));
    const tp = rows.reduce((s, r) => s + (r.planned || 0), 0), tps = rows.reduce((s, r) => s + (r.plannedSoFar || 0), 0), ta = rows.reduce((s, r) => s + r.actual, 0);
    const groups = ms.map((m) => ({ label: monthLabel(m).slice(0, 3), values: [classes(ms).filter((k) => !SKIP.has(k)).reduce((s, k) => s + (planYear ? plannedFor(plan, m, k) : 0), 0), classes(ms).reduce((s, k) => s + A.actualOf(by, m, k), 0)] }));
    body = h('div', null,
      h('div', { class: 'filters' }, h('label', null, 'Year ', h('select', { 'aria-label': 'Year', onchange: (e) => { selYear = e.target.value; rerender(); } }, years.map((y) => h('option', { value: y, selected: y === selYear }, y))))),
      table([
        { label: 'Goes into', host: true, get: (r) => r.label },
        { label: planYear ? 'Planned so far' : 'Planned', mob: 'hide', cls: 'r', get: (r) => (r.plannedSoFar == null ? '–' : money(r.plannedSoFar)), total: () => (planYear ? money(tps) : '–') },
        { label: 'Actual', cls: 'r', get: (r) => money(r.actual), total: () => money(ta) },
        { label: planYear ? 'Against plan so far' : 'Difference', cls: 'r', render: (r) => (r.plannedSoFar == null ? h('span', null, '–') : diffCell(r.plannedSoFar, r.actual)), total: () => (planYear ? signed(ta - tps) : '–') },
        { label: 'Full-year plan', mob: 'under', mlabel: 'full year ', cls: 'r', get: (r) => (r.planned == null ? '–' : money(r.planned)), total: () => (planYear ? money(tp) : '–') },
        { label: 'Taken from', mob: 'hide', get: (r) => r.src.join(', ') },
      ], rows, { footer: { label: 'Total' }, empty: 'Nothing planned or invested this year.' }),
      groups.some((g) => g.values.some((v) => v > 0)) ? h('div', null, barChart({ groups, names: ['Planned', 'Actual'], fmt: money, colors: [7, 0] }), h('ul', { class: 'legend inline' }, [['Planned', 7], ['Actual', 0]].map(([l, c]) => h('li', null, h('i', { style: { background: color(c) } }), h('span', { class: 'lg-name' }, l))))) : null);
  }
  root.append(section('Planned and actual new money', h('div', null,
    toggle([['month', 'Monthly'], ['year', 'Yearly']], mode, (k) => { mode = k; }, 'Monthly or yearly'),
    body,
    h('p', { class: 'note' }, 'Actual comes from your records: share and ETF trades, fund purchases, the start date of each bond, deposit and loan, gold purchases and chit entries. Bank entries fill any month where no such record exists. EPF and PPF are left out, as they come out of salary. The plan amount is the “each month” figure of each line above.'))));
}
