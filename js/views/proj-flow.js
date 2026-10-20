// Wealth outlook: what the projection does with income, spending and new investments, month by month or year by year.
// Shared by This year and Years ahead. Rows come from simulate().
import { h, money, compact, monthLabel, section, table } from '../ui.js';
import { stackedBars } from '../charts.js';

const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const SERIES = ['Income', 'Spending', 'Invested'];
let pick = null;   // { key: 'YYYY' | 'YYYY-MM' }

/** Add up the rows of one period. */
function total(rows) {
  return {
    salary: sum(rows, (r) => r.salary), interest: sum(rows, (r) => r.interest), other: sum(rows, (r) => r.other + r.oneIn),
    everyday: sum(rows, (r) => r.expenses), emi: sum(rows, (r) => r.emi), oneTime: sum(rows, (r) => r.oneOut), invested: sum(rows, (r) => r.invested),
    pf: sum(rows, (r) => r.pfAdd || 0), income: sum(rows, (r) => r.income), out: sum(rows, (r) => r.out), nw: rows.length ? rows[rows.length - 1].nw : 0, accrual: sum(rows, (r) => r.accrual || 0),
    items: rows.flatMap((r) => (r.items || []).filter((i) => i.kind !== 'income').map((i) => ({ ...i, month: r.month }))),
  };
}
const parts = (t) => [
  [{ name: 'Salary', value: t.salary }, { name: 'Interest paid out', value: t.interest }, { name: 'Other income', value: t.other }],
  [{ name: 'Everyday expenses', value: t.everyday }, { name: 'Loan EMI', value: t.emi }, { name: 'One-time items', value: t.oneTime }],
  [{ name: 'New investments', value: t.invested }],
];
const money0 = (v) => (v > 0.5 ? money(v) : '–');

/**
 * The chart. mode 'month' draws a column set per month, 'year' one per calendar year. Tap a column to see what it is made of:
 * a year shows its twelve months, a month shows each part and the one-time items in it.
 */
export function flowSection(rows, { mode = 'month', title = 'Income, spending and investing' } = {}) {
  if (!rows.length) return section(title, h('p', { class: 'empty' }, 'Nothing to show.'));
  const box = h('div');
  const groups = [];
  if (mode === 'year') {
    const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))];
    for (const y of years) { const yr = rows.filter((r) => r.month.startsWith(y)); groups.push({ key: y, label: y, title: `${y}${yr.length < 12 ? ` (${yr.length} months)` : ''}`, rows: yr, t: total(yr) }); }
  } else for (const r of rows) groups.push({ key: r.month, label: monthLabel(r.month).slice(0, 3), title: monthLabel(r.month, true), rows: [r], t: total([r]) });
  if (pick && !groups.some((g) => g.key === pick)) pick = null;
  const draw = () => {
    const chart = stackedBars({ names: SERIES, colors: [2, 1, 0], fmt: money, height: 250,
      groups: groups.map((g) => ({ label: g.label, title: g.title, bars: parts(g.t) })),
      selected: pick ? { g: groups.findIndex((g) => g.key === pick), s: 0 } : null,
      onSelect: (gi) => { pick = pick === groups[gi].key ? null : groups[gi].key; draw(); } });
    let detail = h('p', { class: 'note' }, mode === 'year' ? 'Tap a year to see its twelve months and how each figure was worked out.' : 'Tap a month to see what it is made of.');
    if (pick) {
      const g = groups.find((x) => x.key === pick);
      detail = mode === 'year' ? yearDetail(g) : monthDetail(g);
    }
    box.replaceChildren(chart, detail);
  };
  draw();
  return section(title, h('div', null, box,
    h('p', { class: 'note' }, 'Projected from today. Salary, everyday expenses and one-time items grow by the rates in the assumptions. Interest is what bonds and lending pay out after TDS. New investments are the monthly amounts you planned. The lighter shades are the parts further down the legend: salary, interest, other for income; everyday, EMI, one-time for spending.')));
}

function monthDetail(g) {
  const t = g.t, r = g.rows[0];
  const line = (label, val, sub, tone) => ({ label, val, sub, tone });
  const lines = [
    line('Salary', money(t.salary), 'today’s salary grown by the yearly raise'), line('Interest paid out', money(t.interest), 'bonds and lending after TDS, from the holdings'), t.other > 0.5 ? line('Other income and one-time income', money(t.other)) : null,
    line('Total income', money(t.income), null, 'b'),
    line('Everyday expenses', '−' + money(t.everyday), 'today’s monthly spending grown by the yearly rise'), t.emi > 0.5 ? line('Loan EMI', '−' + money(t.emi)) : null,
    ...(r.items || []).filter((i) => i.kind !== 'income').map((i) => line('One-time: ' + i.name, '−' + money(i.amount), 'yearly item, grown by the expense rise')),
    line('New investments', '−' + money(t.invested), 'planned monthly amounts'),
    line('Left in cash', money(r.surplus), 'income − spending − investments', 'b'),
    line('Net worth at the month end', money(r.nw), null, 'b'),
  ].filter(Boolean);
  return h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, g.title),
    table([{ label: 'Item', host: true, render: (x) => h('span', null, x.tone ? h('b', null, x.label) : x.label, x.sub ? h('small', { class: 'muted', style: { display: 'block' } }, x.sub) : null) }, { label: 'Amount', cls: 'r', render: (x) => (x.tone ? h('b', null, x.val) : x.val) }], lines, {}));
}

function yearDetail(g) {
  const rows = g.rows;
  return h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, `${g.title}, month by month`),
    table([
      { label: 'Month', host: true, get: (r) => monthLabel(r.month, true) },
      { label: 'Salary', cls: 'r', mob: 'under', mlabel: 'salary ', get: (r) => money(r.salary), total: () => money(g.t.salary) },
      { label: 'Interest', cls: 'r', mob: 'hide', get: (r) => money(r.interest), total: () => money(g.t.interest) },
      { label: 'Everyday', cls: 'r', mob: 'under', mlabel: 'everyday ', get: (r) => money(r.expenses + r.emi), total: () => money(g.t.everyday + g.t.emi) },
      { label: 'One-time', cls: 'r', mob: 'under', mlabel: 'one-time ', render: (r) => (r.oneOut > 0.5 ? h('span', { title: (r.items || []).filter((i) => i.kind !== 'income').map((i) => `${i.name} ${money(i.amount)}`).join(', ') }, money(r.oneOut), h('small', { class: 'muted', style: { display: 'block' } }, (r.items || []).filter((i) => i.kind !== 'income').map((i) => i.name).join(', '))) : '–'), total: () => money(g.t.oneTime) },
      { label: 'Invested', cls: 'r', mob: 'hide', get: (r) => money(r.invested), total: () => money(g.t.invested) },
      { label: 'Net worth', cls: 'r', mob: 'hide', get: (r) => money(r.nw) },
    ], rows, { footer: { label: 'Year' } }));
}

/**
 * A table grouped by year. Open a year to see its months: salary, spending (hover or read the line under it for the monthly and one-time parts),
 * interest income and net worth.
 */
export function yearsTable(rows, { title = 'Year by year, and month by month' } = {}) {
  if (!rows.length) return section(title, h('p', { class: 'empty' }, 'Nothing to show.'));
  const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))];
  const head = h('div', { class: 'yt-head', style: { display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.3fr 1fr 1fr', gap: '8px', padding: '4px 8px', fontSize: '.82rem', opacity: 0.7 } },
    h('span', null, 'Year'), h('span', { style: { textAlign: 'right' } }, 'Salary'), h('span', { style: { textAlign: 'right' } }, 'Spending'), h('span', { style: { textAlign: 'right' } }, 'Interest'), h('span', { style: { textAlign: 'right' } }, 'Net worth'));
  const spend = (r) => r.expenses + r.emi + r.oneOut;
  const spendCell = (monthly, once, items) => h('span', { style: { textAlign: 'right' }, title: `Monthly ${money(monthly)}${once > 0.5 ? ` + one-time ${money(once)}${items ? ' (' + items + ')' : ''}` : ''}` },
    money(monthly + once), once > 0.5 ? h('small', { class: 'muted', style: { display: 'block', fontSize: '.75rem' } }, `incl. one-time ${money(once)}`) : null);
  const blocks = years.map((y, yi) => {
    const yr = rows.filter((r) => r.month.startsWith(y)), t = total(yr);
    const sumRow = h('summary', { style: { display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.3fr 1fr 1fr', gap: '8px', cursor: 'pointer', padding: '8px', alignItems: 'baseline' } },
      h('b', null, y + (yr.length < 12 ? ` (${yr.length} mo)` : '')), h('span', { style: { textAlign: 'right' } }, money(t.salary)), spendCell(t.everyday + t.emi, t.oneTime, [...new Set(t.items.map((i) => i.name))].join(', ')),
      h('span', { style: { textAlign: 'right' }, title: t.accrual > 0.5 ? `plus ${money(t.accrual)} added to deposits, EPF and chits` : null }, money(t.interest)), h('span', { style: { textAlign: 'right' } }, money(t.nw)));
    return h('details', { class: 'cal-month', open: yi === 0 }, sumRow, table([
      { label: 'Month', host: true, get: (r) => monthLabel(r.month, true) },
      { label: 'Salary', cls: 'r', get: (r) => money(r.salary) },
      { label: 'Spending', cls: 'r', render: (r) => spendCell(r.expenses + r.emi, r.oneOut, (r.items || []).filter((i) => i.kind !== 'income').map((i) => i.name).join(', ')) },
      { label: 'Interest income', cls: 'r', get: (r) => money(r.interest) },
      { label: 'Net worth', cls: 'r', get: (r) => money(r.nw) },
    ], yr, {}));
  });
  return section(title, h('div', null, head, ...blocks,
    h('p', { class: 'note' }, 'Open a year to see its months. Spending is everyday expenses plus loan EMI, with one-time items shown under it (hover for the split). Interest income is what bonds and lending pay out after TDS. Net worth is the month end, and for a year its December.')));
}
