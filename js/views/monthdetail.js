// Spend & plan → Month in detail: the "This month in detail" card of Home as a page, for a month or a whole year.
import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, monthLabel, section, stat, table, dialog, setOptions, monthGroups, rowList, canEdit } from '../ui.js';
import { hbars, barChart, donut, legend } from '../charts.js';
import { LEVELS, HEAT_MAX, heat, heatGradient, periodMonths, monthRow, periodTotal, mixOf } from '../monthdetail.js';

let period = 'this', ledgerOpen = false;
const rerender = () => window.dispatchEvent(new Event('rerender'));
const KEY = 'pt.md.count';
const loadOv = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const saveOv = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private window */ } };
const PERIODS = [['this', 'This month'], ['prev', 'Previous month'], ['ty', 'This year'], ['py', 'Previous year']];
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const short = (m) => monthLabel(m).slice(0, 3);

/** A coloured label for a month's status. */
const pill = (st) => (st ? h('span', { class: 'lvl lvl-' + st.level.id, title: st.level.hint }, st.level.label) : h('span', { class: 'muted' }, '–'));
const usedText = (st) => (st && st.used != null ? pct(st.used, 0) + ' used' : '');

/** The colour key: one smooth bar from 0% of the limit (deep green) through the limit (pale) to well beyond it (deep red). */
function legendRow() {
  const pos = (u) => ((u / HEAT_MAX) * 100).toFixed(1) + '%';
  const ticks = [[0, '0%', 'nothing spent'], [0.75, '75%', 'well within'], [1, '100%', 'the limit'], [1.2, '120%', 'over'], [HEAT_MAX, '160%+', 'well beyond']];
  return h('div', { class: 'heat-legend', role: 'img', 'aria-label': 'Colour key: deep green when spending is far under the limit, pale at the limit, deep red when far over it' },
    h('div', { class: 'heat-bar', style: { background: heatGradient() } }, h('i', { class: 'heat-limit', style: { left: pos(1) }, title: 'The limit (100%)' })),
    h('div', { class: 'heat-ticks' }, ticks.map(([u, a, b], i) => h('span', { class: 'heat-tick' + (i === 0 ? ' first' : i === ticks.length - 1 ? ' last' : '') + (i === 1 || i === 3 ? ' opt' : ''), style: { left: pos(u) } }, h('b', null, a), h('small', null, b)))),
    h('p', { class: 'note heat-note' }, 'The deeper the green, the less of the limit was used. The deeper the red, the further over it went.'));
}

/** Choose which lines count as spending. One-time payments (tax, EMI, rent, other) can be left out. */
function countDialog(rows, ov) {
  const names = mixOf(rows);
  const boxes = names.map((x) => h('input', { type: 'checkbox', checked: x.counted, 'aria-label': x.name, value: x.name.toLowerCase() }));
  const set = (f) => names.forEach((x, i) => { boxes[i].checked = f(x); });
  const body = h('div', { class: 'form' },
    h('p', { class: 'note', style: { marginTop: 0 } }, 'Tick what counts as spending against the interest income. Leave out one-time payments you do not want to judge a month by. This is kept on this device only.'),
    h('div', { class: 'chips-row' },
      h('button', { type: 'button', class: 'chip-btn', onclick: () => set((x) => !x.other && !/^rent$/i.test(x.name)) }, 'Regular only (no rent, EMI, tax, other)'),
      h('button', { type: 'button', class: 'chip-btn', onclick: () => set((x) => !x.other) }, 'Leave out EMI, tax & other'),
      h('button', { type: 'button', class: 'chip-btn', onclick: () => set(() => true) }, 'Count everything')),
    h('div', { class: 'checklist' }, names.map((x, i) => h('label', { class: 'check-row' }, boxes[i], h('span', null, `${x.name} · ${money(x.amount)}`, x.other ? h('small', { class: 'tag' }, 'other payment') : null)))));
  dialog('What counts as spending', body, [
    { label: 'Like Home', onclick: (c) => { saveOv({}); c(); rerender(); } },
    { label: 'Apply', class: 'primary', onclick: (c) => { const o = {}; boxes.forEach((b) => { o[b.value] = b.checked; }); saveOv(o); c(); rerender(); } },
  ]);
}

/** One box per month of the year, coloured by status. Tap a month to open it. */
function monthMap(year, rowsByMonth, sel) {
  const cur = C.monthKey(S.all.asOf);
  return h('div', { class: 'mmap', role: 'group', 'aria-label': 'Months of ' + year }, Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`, r = rowsByMonth.get(m), st = r && r.status;
    const on = sel.includes(m), one = sel.length === 1;
    const hc = st && st.used != null ? heat(st.used) : null;
    return h('button', { type: 'button', class: 'mm lvl-' + (st ? st.level.id : 'none') + (hc ? ' heat' : '') + (on ? (one ? ' on' : ' on-some') : ''), style: hc ? { '--hb': hc.bg, '--hf': hc.fg, '--hd': hc.bd } : null, disabled: !r, 'aria-pressed': on ? 'true' : 'false', title: r ? `${monthLabel(m, true)}: ${st ? st.level.label : 'nothing to judge'}${st && st.used != null ? ', ' + pct(st.used, 0) + ' of the limit' : ''}` : 'No data', onclick: () => { period = m; rerender(); } },
      h('b', null, short(m)), h('small', null, r ? (st && st.used != null ? pct(st.used, 0) : '–') : ''), m === cur ? h('i', { class: 'mm-now' }, 'now') : null);
  }));
}

export function render() {
  const { data, all } = S;
  const ov = loadOv();
  const ledger = C.ledgerMonths(data), cur = C.monthKey(all.asOf);
  if (!PERIODS.some((p) => p[0] === period) && !ledger.concat(cur).includes(period)) period = 'this';
  const months = periodMonths(period, all.asOf, ledger);
  const root = h('div', { class: 'page' });

  const sel = h('select', { class: 'month-select', 'aria-label': 'Period', onchange: (e) => { period = e.target.value; rerender(); } });
  setOptions(sel, [{ group: 'Period', options: PERIODS.map(([v, l]) => ({ value: v, label: l })) }, ...monthGroups(ledger).map((g) => ({ group: g.label || 'A single month', options: g.months.map((m) => ({ value: m, label: monthLabel(m, true) })) }))], period);
  const rows = months.map((m) => monthRow(data, all, m, ov));
  const customised = Object.keys(ov).length > 0;
  root.append(h('div', { class: 'filters' }, sel, h('button', { class: 'chip-btn' + (customised ? ' primary' : ''), onclick: () => countDialog(rows, ov) }, customised ? '⚙ Spending: your choice' : '⚙ What counts as spending')));

  if (!rows.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No bank entries in this period yet.'))); return root; }
  const tot = periodTotal(rows), single = rows.length === 1, r0 = rows[0];
  const label = single ? monthLabel(r0.month, true) : period === 'py' ? 'Previous year' : period === 'ty' ? 'This year so far' : 'Period';

  // the year map, so any month is one tap away
  const year = (single ? r0.month : months[0]).slice(0, 4);
  const yearRows = new Map(Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter((m) => m <= cur && (ledger.includes(m) || m === cur)).map((m) => [m, rows.find((r) => r.month === m) || monthRow(data, all, m, ov)]));
  root.append(section(`${year}, month by month`, h('div', null, monthMap(year, yearRows, months), legendRow(), h('p', { class: 'note' }, 'Each month is judged by the spending that counts against the interest income expected in it. Tap a month to open it.'))));

  // headline
  const worst = rows.filter((r) => r.status && ['over', 'beyond'].includes(r.status.level.id)).length;
  root.append(h('div', { class: 'stats' },
    stat('Interest income', money(tot.received), `of ${money(tot.limit)} expected${single ? '' : ' over ' + rows.length + ' months'}`),
    stat('Spending that counts', h('span', { class: tot.spent > tot.limit ? 'neg' : '' }, money(tot.spent)), usedText(tot.status) || ''),
    stat(tot.left >= 0 ? 'Left within the limit' : 'Over the limit', h('span', { class: tone(tot.left) }, sgn(tot.left)), single ? '' : `${worst} of ${rows.length} months over`),
    stat('Status', pill(tot.status), tot.status ? tot.status.level.hint : '')));

  // interest income against spending
  if (!single) {
    root.append(section(`Interest income vs spending · ${label}`, h('div', null,
      barChart({ groups: rows.map((r) => ({ label: short(r.month), title: monthLabel(r.month, true) + (r.status ? ' · ' + r.status.level.label : ''), values: [r.limit, r.spent] })), names: ['Interest income expected', 'Spending that counts'], colors: [2, 1], fmt: money }),
      h('p', { class: 'note' }, 'Where the red bar is taller than the green one, that month went over its limit.'))));
  } else {
    const bar = (v, of, cls) => h('div', { class: 'pbar ' + (cls || '') }, h('span', { style: { width: (of > 0 ? Math.min(100, Math.max(0, (v / of) * 100)) : 0).toFixed(1) + '%' } }));
    root.append(section(`Interest income vs spending · ${label}`, h('div', { class: 'month' },
      h('div', null, h('p', { class: 'mini-title' }, 'Interest income'), h('p', { class: 'big-line' }, h('b', null, money(r0.received)), h('span', { class: 'muted' }, ` of ${money(r0.limit)} expected`)), bar(r0.received, r0.limit, 'good'),
        rowList(r0.mc.income.map((x) => ({ title: x.name, sub: 'expected ' + money(x.expected), value: money(x.received), valueSub: x.expected - x.received > 0.5 ? h('span', { class: 'warn' }, money(x.expected - x.received) + ' pending') : '✓ received' })))),
      h('div', null, h('p', { class: 'mini-title' }, 'Spending that counts'), h('p', { class: 'big-line' }, h('b', { class: r0.spent > r0.limit ? 'neg' : '' }, money(r0.spent)), h('span', { class: 'muted' }, ` of ${money(r0.limit)} limit`)), bar(r0.spent, r0.limit, r0.status && ['over', 'beyond'].includes(r0.status.level.id) ? 'bad' : r0.status && r0.status.level.id === 'marginal' ? 'warn' : '')))));
  }

  // what the spending is made of
  const mix = mixOf(rows), counted = mix.filter((x) => x.counted), left = mix.filter((x) => !x.counted);
  root.append(h('div', { class: 'grid2' },
    section('Where it went', counted.length ? h('div', null, hbars(counted.map((x) => ({ label: x.name, value: x.amount })), { fmt: money, colorIndex: 1 }),
      left.length ? h('p', { class: 'note' }, `Left out: ${left.map((x) => `${x.name} ${money(x.amount)}`).join(', ')}. Change this under “What counts as spending”.`) : null) : h('p', { class: 'empty' }, 'Nothing counted as spending.')),
    section('Share of spending', counted.length ? h('div', null, donut(counted.map((x) => ({ label: x.name, value: x.amount })), { fmt: money, center: compact(tot.spent), sub: 'spent', size: 190 }), legend(counted.map((x) => ({ label: x.name, value: x.amount })), { fmt: money })) : h('p', { class: 'empty' }, 'Nothing to show.'))));

  // month table
  if (!single) {
    root.append(section('Month by month', h('div', null, table([
      { label: 'Month', host: true, render: (r) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); period = r.month; rerender(); } }, monthLabel(r.month, true)) },
      { label: 'Interest income', cls: 'r', get: (r) => money(r.limit) },
      { label: 'Spending', cls: 'r', get: (r) => money(r.spent) },
      { label: 'Left', cls: 'r', render: (r) => h('span', { class: tone(r.left) }, sgn(r.left)) },
      { label: 'Used', cls: 'r', get: (r) => (r.status && r.status.used != null ? pct(r.status.used, 0) : '–') },
      { label: 'Status', render: (r) => pill(r.status) },
    ], rows.slice().reverse(), { m: { key: 'monthdetail', head: 'Month', sub: ['Status'], views: [['Spending', 'Used'], ['Interest income', 'Left']] } }),
      h('p', { class: 'note' }, 'Interest income is what the month was expected to bring (bonds and lending); spending is what counts under your choice above.'))));
  }
  return root;
}
