// Wealth outlook: what the projection does with income, spending and new investments, month by month or year by year.
// Shared by This year and Years ahead. Rows come from simulate().
import { h, money, compact, monthLabel, section, table } from '../ui.js';
import { stackedBars } from '../charts.js';

const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const SERIES = ['Income', 'Spending', 'Invested'];
const picks = {};   // which column is open, per chart title, so it survives a redraw

/** Add up the rows of one period. */
function total(rows) {
  return {
    salary: sum(rows, (r) => r.salary), interest: sum(rows, (r) => r.interest), other: sum(rows, (r) => r.other + r.oneIn), growth: sum(rows, (r) => r.growth || 0), loanPaid: sum(rows, (r) => r.loanPaid || 0), left: sum(rows, (r) => r.left || 0), refill: sum(rows, (r) => r.refill || 0),
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
const cls = (c, v) => h('span', { class: c }, v);
const inc = (v) => (v > 0.5 ? cls('inc', money(v)) : '–');
const exp = (v) => (v > 0.5 ? cls('exp', money(v)) : '–');
const inv = (v) => (v > 0.5 ? cls('inv', money(v)) : '–');
/** Net worth at the start of a run of rows, worked back from its first month. */
const openingNw = (r) => r.nw - (r.income - r.out) - (r.pfAdd || 0) - (r.growth || 0) - (r.loanPaid || 0);
const oneNames = (r) => (r.items || []).filter((i) => i.kind !== 'income').map((i) => `${i.name} ${money(i.amount)}`).join(', ');

/**
 * The chart. mode 'month' draws a column set per month, 'year' one per calendar year. Tap a column to see what it is made of:
 * a year opens its own month by month chart, a month shows each part and the one-time items in it.
 */
export function flowSection(rows, { mode = 'month', title = 'Income, spending and investing', embed = false } = {}) {
  if (!rows.length) return section(title, h('p', { class: 'empty' }, 'Nothing to show.'));
  const box = h('div');
  const groups = [];
  if (mode === 'year') {
    const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))];
    for (const y of years) { const yr = rows.filter((r) => r.month.startsWith(y)); groups.push({ key: y, label: y, title: `${y}${yr.length < 12 ? ` (${yr.length} months)` : ''}`, rows: yr, t: total(yr) }); }
  } else for (const r of rows) groups.push({ key: r.month, label: monthLabel(r.month).slice(0, 3), title: monthLabel(r.month, true), rows: [r], t: total([r]) });
  if (picks[title] && !groups.some((g) => g.key === picks[title])) picks[title] = null;
  const draw = () => {
    const pick = picks[title];
    const chart = stackedBars({ names: SERIES, colors: [2, 7, 0], fmt: money, height: 250,
      groups: groups.map((g) => ({ label: g.label, title: g.title, bars: parts(g.t) })),
      selected: pick ? { g: groups.findIndex((g) => g.key === pick), s: 0 } : null,
      onSelect: (gi) => { picks[title] = pick === groups[gi].key ? null : groups[gi].key; draw(); } });
    let detail = h('p', { class: 'note' }, mode === 'year' ? 'Tap a year to see its months as a chart of its own.' : 'Tap a month to see what it is made of.');
    if (pick) {
      const g = groups.find((x) => x.key === pick);
      detail = mode === 'year' ? flowSection(g.rows, { mode: 'month', title: `${g.title}, month by month`, embed: true }) : monthDetail(g);
    }
    box.replaceChildren(chart, detail);
  };
  draw();
  const body = h('div', null, box,
    embed ? null : h('p', { class: 'note' }, 'Green is income, red is spending, blue is new investing. Each bar splits into its parts, from the darkest shade down: salary, interest, other income; everyday expenses, EMI, one-time items. Salary and EMI step up in the raise month. New investing is whatever is left after spending, split by the shares of your plan, so a month with tax or fees invests little or nothing.'));
  return embed ? h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, title), body) : section(title, body);
}

function monthDetail(g) {
  const t = g.t, r = g.rows[0];
  const line = (label, val, sub, tone) => ({ label, val, sub, tone });
  const one = (r.items || []).filter((i) => i.kind !== 'income');
  const lines = [
    line('Salary', cls('inc', money(t.salary)), 'today’s salary, raised in the raise month'), line('Interest paid out', cls('inc', money(t.interest)), 'bonds and lending after TDS, from the holdings'), t.other > 0.5 ? line('Other income and one-time income', cls('inc', money(t.other))) : null,
    line('Total income', cls('inc', money(t.income)), null, 'b'),
    line('Everyday expenses', cls('exp', '−' + money(t.everyday)), 'today’s monthly spending, grown by the yearly rise'), t.emi > 0.5 ? line('Loan EMI', cls('exp', '−' + money(t.emi)), 'steps up with the salary raise') : null,
    ...one.map((i) => line('One-time: ' + i.name, cls('exp', '−' + money(i.amount)), 'yearly item, grown by the one-time rise')),
    line('Left after spending', cls(t.left >= 0 ? 'inc' : 'exp', (t.left < 0 ? '−' : '') + money(Math.abs(t.left))), 'income − spending', 'b'),
    t.refill > 0.5 ? line('Kept back to rebuild cash', money(Math.min(t.refill, Math.max(0, t.left))), 'cash is topped up to what you hold today before investing') : null,
    line('New investments', cls('inv', '−' + money(t.invested)), t.invested > 0.5 ? 'what is left, split by the plan shares' : 'nothing left to invest this month'),
    line('Left in cash', money(r.surplus), 'left after spending − investments', 'b'),
    r.pfAdd > 0.5 ? line('Added to EPF', cls('inc', money(r.pfAdd)), 'goes in before salary reaches the bank') : null,
    line('Growth and interest added to balances', money(r.growth || 0), 'market growth, deposits, chits, cash interest'),
    line('Net worth at the month end', money(r.nw), null, 'b'),
  ].filter(Boolean);
  return h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, g.title),
    table([{ label: 'Item', host: true, render: (x) => h('span', null, x.tone ? h('b', null, x.label) : x.label, x.sub ? h('small', { class: 'muted', style: { display: 'block' } }, x.sub) : null) }, { label: 'Amount', cls: 'r', render: (x) => (x.tone ? h('b', null, x.val) : x.val) }], lines, {}),
    h('p', { class: 'reco' }, `Net worth moves by income − spending + EPF + growth${t.loanPaid > 0.5 ? ' + loan paid down' : ''}. New investing moves money from cash into assets and does not change it.`));
}

/** The month rows of a period, with every part that moves net worth, and a line adding them up. */
function monthsTable(rows) {
  const t = total(rows), start = openingNw(rows[0]);
  const any = (f) => rows.some((r) => f(r) > 0.5);
  const cols = [
    { label: 'Month', host: true, get: (r) => monthLabel(r.month, true) },
    { label: 'Salary', cls: 'r', mob: 'under', mlabel: 'salary ', render: (r) => inc(r.salary), total: () => inc(t.salary) },
    { label: 'Interest', cls: 'r', mob: 'hide', render: (r) => inc(r.interest), total: () => inc(t.interest) },
    any((r) => r.other + r.oneIn) ? { label: 'Other income', cls: 'r', mob: 'hide', render: (r) => inc(r.other + r.oneIn), total: () => inc(t.other) } : null,
    { label: 'Expenses', cls: 'r', mob: 'under', mlabel: 'expenses ', render: (r) => exp(r.expenses), total: () => exp(t.everyday) },
    { label: 'EMI', cls: 'r', mob: 'hide', render: (r) => exp(r.emi), total: () => exp(t.emi) },
    { label: 'One-time', cls: 'r', mob: 'under', mlabel: 'one-time ', render: (r) => (r.oneOut > 0.5 ? h('span', { class: 'exp', title: oneNames(r) }, money(r.oneOut), h('small', { class: 'muted', style: { display: 'block' } }, (r.items || []).filter((i) => i.kind !== 'income').map((i) => i.name).join(', '))) : '–'), total: () => exp(t.oneTime) },
    { label: 'Invested', cls: 'r', mob: 'under', mlabel: 'invested ', render: (r) => inv(r.invested), total: () => inv(t.invested) },
    any((r) => r.pfAdd) ? { label: 'EPF added', cls: 'r', mob: 'hide', render: (r) => inc(r.pfAdd), total: () => inc(t.pf) } : null,
    { label: 'Growth', cls: 'r', mob: 'hide', get: (r) => money(r.growth || 0), total: () => money(t.growth) },
    any((r) => r.loanPaid) ? { label: 'Loan paid', cls: 'r', mob: 'hide', render: (r) => inc(r.loanPaid), total: () => inc(t.loanPaid) } : null,
    { label: 'Net worth', cls: 'r', mob: 'under', mlabel: 'net worth ', get: (r) => money(r.nw), total: () => money(t.nw) },
  ].filter(Boolean);
  return h('div', null, table(cols, rows, { footer: { label: rows.length > 1 ? 'Total' : '' } }),
    h('p', { class: 'reco' }, `Net worth ${money(start)} at the start + income ${money(t.income)} − spending ${money(t.out)} + EPF ${money(t.pf)} + growth ${money(t.growth)}${t.loanPaid > 0.5 ? ` + loan paid down ${money(t.loanPaid)}` : ''} = ${money(t.nw)}. Invested ${money(t.invested)} is not in that sum: it only moves cash into assets.`));
}

/**
 * A table grouped by year. Open a year to see its months: salary, interest, expenses, EMI, one-time items, EPF, growth and net worth, with a line
 * that adds them up to the year's end. Hover a spending figure for the monthly and one-time parts.
 */
export function yearsTable(rows, { title = 'Year by year, and month by month' } = {}) {
  if (!rows.length) return section(title, h('p', { class: 'empty' }, 'Nothing to show.'));
  const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))];
  const grid = { display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.3fr 1fr 1fr 1fr', gap: '8px' };
  const R = { textAlign: 'right' };
  const head = h('div', { class: 'yt-head', style: { ...grid, padding: '4px 8px', fontSize: '.82rem', opacity: 0.85 } },
    h('span', null, 'Year'), h('span', { class: 'inc', style: R }, 'Salary'), h('span', { class: 'exp', style: R }, 'Spending'), h('span', { class: 'inc', style: R }, 'Interest'), h('span', { class: 'inv', style: R }, 'Invested'), h('span', { style: R }, 'Net worth'));
  const spendCell = (monthly, once, items) => h('span', { class: 'exp', style: R, title: `Monthly ${money(monthly)}${once > 0.5 ? ` + one-time ${money(once)}${items ? ' (' + items + ')' : ''}` : ''}` },
    money(monthly + once), once > 0.5 ? h('small', { class: 'muted', style: { display: 'block', fontSize: '.75rem' } }, `incl. one-time ${money(once)}`) : null);
  const blocks = years.map((y, yi) => {
    const yr = rows.filter((r) => r.month.startsWith(y)), t = total(yr);
    const sumRow = h('summary', { style: { ...grid, cursor: 'pointer', padding: '8px', alignItems: 'baseline' } },
      h('b', null, y + (yr.length < 12 ? ` (${yr.length} mo)` : '')), h('span', { class: 'inc', style: R }, money(t.salary)), spendCell(t.everyday + t.emi, t.oneTime, [...new Set(t.items.map((i) => i.name))].join(', ')),
      h('span', { class: 'inc', style: R, title: t.accrual > 0.5 ? `plus ${money(t.accrual)} added to deposits, EPF and chits` : null }, money(t.interest)), h('span', { class: 'inv', style: R }, money(t.invested)), h('span', { style: R }, money(t.nw)));
    return h('details', { class: 'cal-month', open: yi === 0 }, sumRow, monthsTable(yr));
  });
  return section(title, h('div', null, head, ...blocks,
    h('p', { class: 'note' }, 'Open a year to see its months. Spending is everyday expenses plus loan EMI, with one-time items under it (hover for the split). Interest is what bonds and lending pay out after TDS. Invested is what was left after spending and went into your plan. Net worth is the month end, and for a year its December.')));
}
