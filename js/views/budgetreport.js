// Expenses → Budget report: where spending stands against the category budgets, for a month and for a year.
// Budgets are the ones set on the expense categories (monthly and/or yearly); this screen only reads them and can edit them in one place.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as CAT from '../categories.js';
import { h, money, compact, pct, monthLabel, section, stat, dialog, canEdit, num, setOptions, monthGroups, btn } from '../ui.js';
import { lineChart, barChart } from '../charts.js';
import { BANDS, bandOf } from '../monthdetail.js';
import { spendIndex, monthReport, yearReport, budgetYears, hasBudget, monthBudget } from '../budgetreport.js';

let mode = 'month', month = null, year = null;
const rerender = () => window.dispatchEvent(new Event('rerender'));
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const STATUS = { over: ['Over budget', 'bad'], near: ['Close to budget', 'mid'], ok: ['Within budget', 'ok'] };
const mon = (m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1];

/** The colour key, the same six bands as Month in detail. */
const legend = (note) => h('div', { class: 'bd-legend', role: 'img', 'aria-label': 'Colour key: ' + BANDS.map((b) => `${b.label}, ${b.range}`).join('; ') },
  h('div', { class: 'hz-bar' }, BANDS.map((b) => h('i', { class: 'hz-' + b.id, title: `${b.label}: ${b.range}` }))),
  h('div', { class: 'hz-names' }, BANDS.map((b) => h('span', null, b.label))),
  h('p', { class: 'note' }, note));

const bar = (used, expected) => h('div', { class: 'bd-bar hz hz-' + bandOf(used).id, role: 'img', 'aria-label': pct(used, 0) + ' of the budget used' },
  h('i', { style: { width: Math.min(100, used * 100) + '%' } }), expected != null && expected > 0 && expected < 1 ? h('u', { style: { left: expected * 100 + '%' }, title: 'Where an even pace would be today' }) : null);

/** Set or change monthly and yearly budgets for the expense categories, in one list. */
function setupDialog(data, idx) {
  const ed = canEdit();
  const spent = new Map(); for (const [, mm] of idx.byMonth) for (const [k, v] of mm) spent.set(k, (spent.get(k) || 0) + v);
  const cats = CAT.categoryList(data).filter((c) => c.kind === 'expense').sort((a, b) => (hasBudget(b) - hasBudget(a)) || ((spent.get(b.name.toLowerCase()) || 0) - (spent.get(a.name.toLowerCase()) || 0)) || a.name.localeCompare(b.name));
  const inp = (v, label) => h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '1', value: v || '', placeholder: '–', 'aria-label': label, disabled: !ed });
  const rows = cats.map((c) => ({ c, m: inp(c.budget, c.name + ' monthly budget'), y: inp(c.yearlyBudget, c.name + ' yearly budget') }));
  const body = h('div', { class: 'form' },
    h('p', { class: 'note', style: { marginTop: 0 } }, 'Set a monthly budget, a yearly budget, or both, on any expense. The same budgets show in Categories and in the passive income plan, so you only enter them once. With both, the month budget is the monthly amount plus a twelfth of the yearly one.'),
    h('div', { class: 'bd-setup' }, h('div', { class: 'bd-sh' }, h('span', null, 'Expense'), h('span', null, 'Monthly ₹'), h('span', null, 'Yearly ₹')),
      rows.map((r) => h('label', { class: 'bd-sr' }, h('span', null, r.c.name), r.m, r.y))));
  dialog('Set budgets', body, ed ? [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Save', class: 'primary', onclick: (c) => {
    c();
    mutate((d) => { for (const r of rows) { const m = Math.max(0, Number(r.m.value) || 0), y = Math.max(0, Number(r.y.value) || 0); if (m !== (r.c.budget || 0) || y !== (r.c.yearlyBudget || 0)) CAT.update(d, r.c.name, { budget: m, yearlyBudget: y }); } });
  } }] : [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}

const catCard = (l, cur) => h('div', { class: 'bd-row ' + STATUS[l.status][1] },
  h('div', { class: 'bd-top' }, h('b', null, l.name, l.yearlyOnly ? h('small', { class: 'tag' }, 'yearly ÷ 12') : null), h('span', { class: 'bd-st ' + STATUS[l.status][1] }, STATUS[l.status][0])),
  bar(l.used, cur ? l.expected / (l.budget || 1) : null),
  h('div', { class: 'bd-nums' }, h('span', null, h('b', null, money(l.spent)), ' of ', money(l.budget), ' · ', pct(l.used, 0)), h('span', { class: l.left < 0 ? 'neg' : 'pos' }, l.left < 0 ? money(-l.left) + ' over' : money(l.left) + ' left')),
  cur && l.ahead && l.status !== 'over' ? h('p', { class: 'bd-note' }, 'Ahead of an even pace: on course for ' + money(l.projected) + (l.projected > l.budget ? ', ' + money(l.projected - l.budget) + ' over.' : '.')) : null);

function monthView(root, data, asOf, idx, cur) {
  const r = monthReport(data, month, asOf, idx), now = month === cur;
  const dayNo = Number(asOf.slice(8, 10));
  const line = now ? `${pct(r.frac, 0)} of the month has gone and ${pct(r.used, 0)} of the budget is used.${r.frac > 0 && dayNo >= 5 ? ` At this pace the month ends at ${money(r.projected)}, ${money(Math.abs(r.budget - r.projected))} ${r.projected > r.budget ? 'over' : 'under'} the budget.` : ''}`
    : `The month ended at ${pct(r.used, 0)} of the budget, ${money(Math.abs(r.left))} ${r.left < 0 ? 'over' : 'under'}.${r.over.length ? ' Over budget: ' + r.over.map((l) => l.name).join(', ') + '.' : ''}`;
  root.append(h('div', { class: 'stats' },
    stat('Budget', money(r.budget), `${r.lines.length} budgeted ${r.lines.length === 1 ? 'expense' : 'expenses'}`),
    stat('Spent', money(r.spent), pct(r.used, 0) + ' used', r.status === 'over' ? 'neg' : ''),
    stat(r.left < 0 ? 'Over by' : 'Left', money(Math.abs(r.left)), now ? 'for the rest of the month' : '', r.left < 0 ? 'neg' : 'pos'),
    stat(now ? 'Even pace today' : 'Over budget', now ? money(r.expected) : `${r.over.length} of ${r.lines.length}`, now ? (r.spent > r.expected ? money(r.spent - r.expected) + ' ahead' : money(r.expected - r.spent) + ' behind') : '')),
  h('p', { class: 'bd-line ' + (r.projected > r.budget && now || r.left < 0 ? 'bad' : 'ok') }, line));
  // each expense against its budget
  root.append(section('Expense by expense', h('div', { class: 'bd-list' }, r.lines.map((l) => catCard(l, now)))));
  // running total against an even pace
  const labels = r.daily.map((d) => String(d.d)), pace = r.daily.map((d) => r.budget * d.d / r.days);
  root.append(section('Spent through the month', h('div', null,
    lineChart({ labels, tipLabels: r.daily.map((d) => `${d.d} ${mon(month)}`), fmt: money, yMin: 0, height: 210, series: [{ name: 'Budget, even pace', values: pace, dashed: true, color: 2 }, { name: 'Spent so far', values: r.daily.map((d) => (d.future ? null : d.cum)), color: 0 }] }),
    h('p', { class: 'note' }, 'Spending of budgeted expenses added up day by day. Staying under the dashed line means you are within an even pace for the budget.'))));
  // heat calendar
  const first = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1, 1).getDay(), lead = (first + 6) % 7;   // week starts Monday
  const cells = [...Array(lead).fill(null), ...r.daily];
  root.append(section('Day by day', h('div', null,
    h('div', { class: 'bd-cal', role: 'group', 'aria-label': 'Spending by day of ' + monthLabel(month, true) },
      ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => h('span', { class: 'bd-dow' }, x)),
      cells.map((d) => { if (!d) return h('span', { class: 'bd-day empty' });
        const used = r.allowance ? d.amount / r.allowance : 0, band = d.future ? null : bandOf(used);
        return h('span', { class: 'bd-day' + (band && d.amount > 0 ? ' hz hz-' + band.id : '') + (d.future ? ' future' : ''), title: `${d.d} ${mon(month)}: ${money(d.amount)}${d.amount ? ', ' + pct(used, 0) + ' of an even daily share' : ''}`, 'aria-label': `${d.d} ${mon(month)}: ${money(d.amount)}` }, h('b', null, d.d), h('small', null, d.amount > 0 ? compact(d.amount) : '')); })),
    legend(`Each day is coloured by what was spent that day against an even daily share of the budget (${money(r.allowance)} a day). A big one-off shows as a dark day.`))));
  // no budget
  if (r.unbudgeted.length) root.append(section('Spending with no budget', h('div', null, h('p', { class: 'note', style: { marginTop: 0 } }, `${money(r.unbudgetedTotal)} went to expenses that have no budget, so they are not in the totals above.`),
    h('div', { class: 'bd-plain' }, r.unbudgeted.slice(0, 8).map((u) => h('div', null, h('span', null, u.name), h('b', null, money(u.spent))))))));
}

function yearView(root, data, asOf, idx, cur) {
  const r = yearReport(data, year, asOf, idx), thisYear = String(year) === asOf.slice(0, 4);
  const mo = r.elapsed;
  root.append(h('div', { class: 'stats' },
    stat('Yearly budget', money(r.budget), `${r.rows.length} budgeted ${r.rows.length === 1 ? 'expense' : 'expenses'}`),
    stat(thisYear ? 'Spent so far' : 'Spent', money(r.spent), pct(r.used, 0) + ' of the year’s budget', r.used > 1 ? 'neg' : ''),
    stat(r.left < 0 ? 'Over by' : 'Left', money(Math.abs(r.left)), '', r.left < 0 ? 'neg' : 'pos'),
    stat(thisYear ? 'On course for' : 'Months over', thisYear ? money(r.projected) : `${r.overMonths} of ${r.doneMonths}`, thisYear ? (r.projected > r.budget ? money(r.projected - r.budget) + ' over' : money(r.budget - r.projected) + ' under') : '')),
  h('p', { class: 'bd-line ' + ((thisYear ? r.projected : r.spent) > r.budget ? 'bad' : 'ok') }, thisYear
    ? `${mo.toFixed(1)} of 12 months have gone and ${pct(r.used, 0)} of the year’s budget is used.${r.doneMonths ? ` ${r.overMonths} finished ${r.overMonths === 1 ? 'month was' : 'months were'} over budget.` : ''}`
    : `The year ended at ${pct(r.used, 0)} of its budget; ${r.overMonths} of ${r.doneMonths} months were over.`));
  // heat map: expense x month
  const cell = (c) => { const band = c.used == null ? null : bandOf(c.used);
    return h('td', { class: 'bd-hc' + (band ? ' hz hz-' + band.id : ' empty') + (c.cur ? ' cur' : ''), title: `${monthLabel(c.month, true)}: ${money(c.spent)}${c.used != null ? ', ' + pct(c.used, 0) : ''}` }, band ? h('span', null, pct(c.used, 0)) : ''); };
  const head = h('tr', null, h('th', { class: 'bd-h1' }, ''), r.months.map((m) => h('th', null, mon(m))), h('th', null, 'Year'));
  const body = r.rows.map((row) => h('tr', null, h('th', { class: 'bd-h1', scope: 'row' }, row.name, row.yearlyOnly ? h('small', null, ' yearly') : null), row.cells.map(cell), h('td', { class: 'bd-hc hz hz-' + bandOf(row.used).id }, h('span', null, pct(row.used, 0)))));
  const tot = h('tr', { class: 'bd-total' }, h('th', { class: 'bd-h1', scope: 'row' }, 'All budgeted'), r.totals.map((t) => cell({ month: t.month, spent: t.spent, used: t.used, cur: t.cur })), h('td', { class: 'bd-hc hz hz-' + bandOf(r.used).id }, h('span', null, pct(r.used, 0))));
  root.append(section('Heat map: expense by month', h('div', null, h('div', { class: 'bd-hscroll' }, h('table', { class: 'bd-heat' }, h('thead', null, head), h('tbody', null, body, tot))),
    legend('Each cell is that month’s spending as a share of the monthly budget. An expense that has only a yearly budget is judged by what is spent so far against the part of the year gone. The current month is judged by days gone.'))));
  // monthly spend against budget
  root.append(section('Spent against budget, month by month', h('div', null,
    barChart({ groups: r.totals.map((t) => ({ label: mon(t.month), values: [t.spent, t.budget] })), names: ['Spent', 'Budget'], fmt: money, height: 220, colors: [0, 2] }),
    h('p', { class: 'note' }, 'Spending of budgeted expenses each month next to the total monthly budget.'))));
  // running year
  let cum = 0; const budgetLine = r.totals.map((t, i) => r.budget * (i + 1) / 12);
  const run = r.totals.map((t) => { if (t.future) return null; cum += t.spent; return cum; });
  root.append(section('The year so far', h('div', null, lineChart({ labels: r.months.map(mon), fmt: money, yMin: 0, height: 210, series: [{ name: 'Budget, even pace', values: budgetLine, dashed: true, color: 2 }, { name: 'Spent so far', values: run, color: 0 }] }),
    h('p', { class: 'note' }, 'Running total of spending on budgeted expenses against the yearly budget spread evenly over twelve months.'))));
  // per expense table
  root.append(section('Expense by expense, whole year', h('div', { class: 'bd-list' }, r.rows.map((row) => h('div', { class: 'bd-row ' + STATUS[row.status][1] },
    h('div', { class: 'bd-top' }, h('b', null, row.name), h('span', { class: 'bd-st ' + STATUS[row.status][1] }, STATUS[row.status][0])),
    bar(row.used, thisYear ? r.elapsed / 12 : null),
    h('div', { class: 'bd-nums' }, h('span', null, h('b', null, money(row.spent)), ' of ', money(row.budget), ' · ', pct(row.used, 0)), h('span', { class: row.left < 0 ? 'neg' : 'pos' }, row.left < 0 ? money(-row.left) + ' over' : money(row.left) + ' left')),
    thisYear && row.spent > 0 ? h('p', { class: 'bd-note' }, 'On course for ' + money(row.projected) + (row.projected > row.budget ? ', ' + money(row.projected - row.budget) + ' over.' : '.')) : null)))));
  // stats
  const st = [];
  if (r.best) st.push(['Best month', monthLabel(r.best.month, true), pct(r.best.spent / r.best.budget, 0) + ' of the budget']);
  if (r.worst) st.push(['Costliest month', monthLabel(r.worst.month, true), pct(r.worst.spent / r.worst.budget, 0) + ' of the budget']);
  if (r.doneMonths) st.push(['Average month', money(r.totals.filter((t) => !t.future && !t.cur).reduce((a, t) => a + t.spent, 0) / r.doneMonths), 'against ' + money(r.totals[0].budget) + ' budgeted']);
  st.push(['Spending with no budget', money(r.unbudgetedTotal), 'not in the totals above']);
  root.append(section('Good to know', h('div', { class: 'stats' }, st.map(([a, b, c]) => stat(a, b, c)))));
}

export function render() {
  const { data, all } = S, asOf = all.asOf, cur = C.monthKey(asOf), idx = spendIndex(data);
  const months = C.ledgerMonths(data).filter((m) => m <= cur); if (!months.includes(cur)) months.push(cur);
  const years = budgetYears(data, asOf);
  if (!month || !months.includes(month)) month = cur;
  if (!year || !years.includes(String(year))) year = asOf.slice(0, 4);
  const root = h('div', { class: 'page' });
  const hasAny = CAT.categoryList(data).some((c) => c.kind === 'expense' && hasBudget(c));
  const seg = h('div', { class: 'nwp-seg', role: 'group', 'aria-label': 'View' }, [['month', 'Month'], ['year', 'Year']].map(([k, l]) => h('button', { type: 'button', class: mode === k ? 'on' : '', 'aria-pressed': String(mode === k), onclick: () => { mode = k; rerender(); } }, l)));
  const sel = h('select', { class: 'month-select', 'aria-label': mode === 'month' ? 'Month' : 'Year', onchange: (e) => { if (mode === 'month') month = e.target.value; else year = e.target.value; rerender(); } });
  if (mode === 'month') setOptions(sel, monthGroups(months.slice().sort()).map((g) => ({ group: g.label || 'A single month', options: g.months.map((m) => ({ value: m, label: monthLabel(m, true) })) })), month);
  else setOptions(sel, years.slice().reverse().map((y) => ({ value: y, label: y })), String(year));
  root.append(h('div', { class: 'filters bd-ctl' }, seg, sel, btn(hasAny ? 'Set budgets' : 'Set up budgets', () => setupDialog(data, idx), hasAny ? '' : 'primary')));
  if (!hasAny) {
    root.append(section('No budgets yet', h('div', null, h('p', null, 'Pick the expenses you want to keep an eye on and give each a monthly budget, a yearly budget, or both. This page then shows how far you stand, month by month and for the whole year, with a heat map and charts.'),
      canEdit() ? btn('Set up budgets', () => setupDialog(data, idx), 'primary') : h('p', { class: 'note' }, 'The owner can set budgets.'))));
    return root;
  }
  if (mode === 'month') monthView(root, data, asOf, idx, cur); else yearView(root, data, asOf, idx, cur);
  return root;
}
