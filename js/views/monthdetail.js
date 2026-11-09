// Spend & plan → Month in detail: the "This month in detail" card of Home as a page, for a month or a whole year.
import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, monthLabel, section, stat, table, dialog, setOptions, monthGroups, rowList, canEdit } from '../ui.js';
import { hbars, barChart, donut, legend, usualKey } from '../charts.js';
import { usualPace, lineTone } from '../spendpace.js';
import { BANDS, HEAT_MAX, bandOf, monthInsight, periodMonths, monthRow, periodTotal, mixOf } from '../monthdetail.js';

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

/** The colour key: six bands from green (well under the limit) through amber (at it) to deep red (far over it). */
function legendRow() {
  return h('div', { class: 'hz-legend', role: 'img', 'aria-label': 'Colour key: ' + BANDS.map((b) => `${b.label}, ${b.range} of the limit`).join('; ') },
    h('div', { class: 'hz-bar' }, BANDS.map((b) => h('i', { class: 'hz-' + b.id, title: `${b.label}: ${b.range}` }))),
    h('div', { class: 'hz-ticks' }, ['0%', '60%', '80%', '100%', '120%', '160%+'].map((t, i) => h('span', { class: 'hz-tick' + (i === 0 ? ' first' : ''), style: { left: (i * 100 / 6).toFixed(2) + '%' } }, t))),
    h('div', { class: 'hz-names' }, BANDS.map((b) => h('span', null, b.label))),
    h('p', { class: 'note heat-note' }, 'Colour shows how much of the month\u2019s limit was spent. Green is well under it, amber is close to it, and red is over it.'));
}

/** The short sentence under the map: what the month in focus looks like. Tap it to open that month. */
function insightRow(yearRows, focus, cur, single) {
  const ins = monthInsight([...yearRows.values()], focus, cur, money, short);
  if (!ins) return null;
  return h(single ? 'div' : 'button', { type: single ? null : 'button', class: 'hz-insight hz-' + ins.band, onclick: single ? null : () => { period = focus; rerender(); }, 'aria-label': ins.title + '. ' + ins.text + (single ? '' : ' Tap to open this month.') },
    h('span', { class: 'hz-dot hz-' + ins.band, 'aria-hidden': 'true' }), h('span', { class: 'hz-txt' }, h('b', null, ins.title), h('small', null, ins.text)), single ? null : h('span', { class: 'hz-go', 'aria-hidden': 'true' }, '\u203a'));
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
    h('div', { class: 'count-list' }, names.map((x, i) => h('label', { class: 'count-row' }, boxes[i], h('span', { class: 'cr-name' }, x.name, x.other ? h('small', { class: 'tag' }, 'other payment') : null), h('span', { class: 'cr-amt' }, money(x.amount))))));
  dialog('What counts as spending', body, [
    { label: 'Like Home', onclick: (c) => { saveOv({}); c(); rerender(); } },
    { label: 'Apply', class: 'primary', onclick: (c) => { const o = {}; boxes.forEach((b) => { o[b.value] = b.checked; }); saveOv(o); c(); rerender(); } },
  ]);
}

/** One tile per month of the year, coloured by how much of its limit was used. Tap a month to open it. */
function monthMap(year, rowsByMonth, sel) {
  const cur = C.monthKey(S.all.asOf);
  return h('div', { class: 'mmap', role: 'group', 'aria-label': 'Months of ' + year }, Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`, r = rowsByMonth.get(m), st = r && r.status;
    const on = sel.includes(m), one = sel.length === 1, used = st && st.used != null ? st.used : null, band = used != null ? bandOf(used) : null;
    const title = r ? `${monthLabel(m, true)}: ${used != null ? pct(used, 0) + ' of the limit, ' + band.label.toLowerCase() : st ? st.level.label : 'nothing to judge'}${m === cur ? ' (this month, so far)' : ''}` : monthLabel(m, true) + ': no bank entries';
    return h('button', { type: 'button', class: 'mm' + (band ? ' hz hz-' + band.id : '') + (m === cur ? ' cur' : '') + (on ? (one ? ' on' : ' on-some') : ''), disabled: !r, 'aria-pressed': on ? 'true' : 'false', 'aria-current': m === cur ? 'date' : null, title, 'aria-label': title,
      onclick: () => { period = m; rerender(); } },
      h('b', null, short(m)), h('small', null, r ? (used != null ? pct(used, 0) : '\u2013') : ''),
      m === cur ? h('i', { class: 'mm-now' }, 'now') : null);
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
  root.append(section(`${year}, month by month`, h('div', null, monthMap(year, yearRows, months), legendRow(), insightRow(yearRows, single ? r0.month : [...yearRows.keys()].pop(), cur, single), h('p', { class: 'note' }, (tot.manual ? 'Each month is judged by the spending that counts against its budget: the interest income expected, or the amount you set in Categories & budgets. Tap a month to open it.' : 'Each month is judged by the spending that counts against the interest income expected in it. Tap a month to open it.')))));

  // headline
  const worst = rows.filter((r) => r.status && ['over', 'beyond'].includes(r.status.level.id)).length;
  root.append(h('div', { class: 'stats' },
    stat('Interest income', money(tot.received), `of ${money(tot.expected)} expected${single ? '' : ' over ' + rows.length + ' months'}`),
    stat('Spending that counts', h('span', { class: tot.spent > tot.limit ? 'neg' : '' }, money(tot.spent)), usedText(tot.status) || ''),
    stat(tot.left >= 0 ? 'Left within the limit' : 'Over the limit', h('span', { class: tone(tot.left) }, sgn(tot.left)), single ? '' : `${worst} of ${rows.length} months over`),
    stat('Status', pill(tot.status), tot.status ? tot.status.level.hint : '')));

  // interest income against spending
  if (!single) {
    root.append(section(`Interest income vs spending · ${label}`, h('div', null,
      barChart({ groups: rows.map((r) => ({ label: short(r.month), title: monthLabel(r.month, true) + (r.status ? ' · ' + r.status.level.label : ''), values: [r.limit, r.spent] })), names: [tot.manual ? 'Budget' : 'Interest income expected', 'Spending that counts'], colors: [2, 1], fmt: money }),
      h('p', { class: 'note' }, 'Where the red bar is taller than the green one, that month went over its limit.'))));
  } else {
    const bar = (v, of, cls) => h('div', { class: 'pbar ' + (cls || '') }, h('span', { style: { width: (of > 0 ? Math.min(100, Math.max(0, (v / of) * 100)) : 0).toFixed(1) + '%' } }));
    root.append(section(`Interest income vs spending · ${label}`, h('div', { class: 'month' },
      h('div', null, h('p', { class: 'mini-title' }, 'Interest income'), h('p', { class: 'big-line' }, h('b', null, money(r0.received)), h('span', { class: 'muted' }, ` of ${money(r0.expected)} expected`)), bar(r0.received, r0.expected, 'good'),
        rowList(r0.mc.income.map((x) => ({ title: x.name, sub: 'expected ' + money(x.expected), value: money(x.received), valueSub: x.expected - x.received > 0.5 ? h('span', { class: 'warn' }, money(x.expected - x.received) + ' pending') : '✓ received' })))),
      h('div', null, h('p', { class: 'mini-title' }, 'Spending that counts'), h('p', { class: 'big-line' }, h('b', { class: r0.spent > r0.limit ? 'neg' : '' }, money(r0.spent)), h('span', { class: 'muted' }, ` of ${money(r0.limit)} ${r0.source === 'manual' ? 'budget (set by you)' : 'limit'}`)), bar(r0.spent, r0.limit, r0.status && ['over', 'beyond'].includes(r0.status.level.id) ? 'bad' : r0.status && r0.status.level.id === 'marginal' ? 'warn' : '')))));
  }

  // what the spending is made of
  const mix = mixOf(rows), counted = mix.filter((x) => x.counted), left = mix.filter((x) => !x.counted);
  // for a single month: what each line usually is (by this day for the current month, over the whole month for a finished one), from the earlier months
  const dimOf = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  const ref = single ? usualPace(data, r0.mc, r0.month, r0.month === cur ? new Date(all.asOf).getUTCDate() : dimOf(r0.month)) : null, usualBy = new Map(ref ? ref.lines.map((l) => [l.name, l]) : []);
  root.append(h('div', { class: 'grid2' },
    section('Where it went', counted.length ? h('div', null, hbars(counted.map((x) => { const u = usualBy.get(x.name), tone = u ? lineTone(x.amount, u.usualNow, u.kind) : null; return { label: x.name, value: x.amount, mark: u && u.usualNow > 0 ? u.usualNow : 0, tone, note: u ? (u.usualNow > 0 ? `${x.name}: ${money(x.amount)} against a usual ${money(u.usualNow)}` : `${x.name}: ${money(x.amount)}, not usual in most months`) : null }; }), { fmt: money, colorIndex: 1 }),
      usualBy.size ? usualKey(cur === r0.month ? 'usual by now' : 'usual') : null,
      left.length ? h('p', { class: 'note' }, `Left out: ${left.map((x) => `${x.name} ${money(x.amount)}`).join(', ')}. Change this under “What counts as spending”.`) : null) : h('p', { class: 'empty' }, 'Nothing counted as spending.')),
    section('Share of spending', counted.length ? h('div', null, donut(counted.map((x) => ({ label: x.name, value: x.amount })), { fmt: money, center: compact(tot.spent), sub: 'spent', size: 190 }), legend(counted.map((x) => ({ label: x.name, value: x.amount })), { fmt: money })) : h('p', { class: 'empty' }, 'Nothing to show.'))));

  // month table
  if (!single) {
    root.append(section('Month by month', h('div', null, table([
      { label: 'Month', host: true, render: (r) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); period = r.month; rerender(); } }, monthLabel(r.month, true)) },
      { label: 'Interest income', cls: 'r', get: (r) => money(r.expected) },
      ...(tot.manual ? [{ label: 'Budget', cls: 'r', render: (r) => h('span', null, money(r.limit), r.source === 'manual' ? h('small', { class: 'muted' }, ' (set)') : null) }] : []),
      { label: 'Spending', cls: 'r', get: (r) => money(r.spent) },
      { label: 'Left', cls: 'r', render: (r) => h('span', { class: tone(r.left) }, sgn(r.left)) },
      { label: 'Used', cls: 'r', get: (r) => (r.status && r.status.used != null ? pct(r.status.used, 0) : '–') },
      { label: 'Status', render: (r) => pill(r.status) },
    ], rows.slice().reverse(), { m: { key: 'monthdetail', head: 'Month', sub: ['Status'], views: tot.manual ? [['Spending', 'Used'], ['Budget', 'Left'], ['Interest income']] : [['Spending', 'Used'], ['Interest income', 'Left']] } }),
      h('p', { class: 'note' }, (tot.manual ? 'Interest income is what the month was expected to bring (bonds and lending). Budget is that amount, or the one you set in Categories & budgets. Spending is what counts under your choice above.' : 'Interest income is what the month was expected to bring (bonds and lending); spending is what counts under your choice above.')))));
  }
  return root;
}
