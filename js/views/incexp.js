// Income vs expense report: what came in, what was spent, what was invested and what is left, for a month or longer.
// Each block is a list of categories; open one to see the descriptions inside it.
import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, pct, monthLabel, section, stat, setOptions, monthGroups } from '../ui.js';

let period = 'this';
const open = new Set();            // categories left open, kept across redraws: 'inc|Salary'
const rerender = () => window.dispatchEvent(new Event('rerender'));
const PERIODS = [['this', 'This month'], ['last', 'Last month'], ['ytd', 'This year so far'], ['12m', 'Past 12 months'], ['all', 'All time']];
const SHOW = 12;                   // descriptions shown inside a category before "other"

function periodSelect(months) {
  const sel = h('select', { class: 'month-select', 'aria-label': 'Period', onchange: (e) => { period = e.target.value; rerender(); } });
  setOptions(sel, [{ group: 'Period', options: PERIODS.map(([v, l]) => ({ value: v, label: l })) }, ...monthGroups(months).map((g) => ({ group: g.label || 'A single month', options: g.months.map((m) => ({ value: m, label: monthLabel(m, true) })) }))], period);
  return sel;
}

/** One category: a row with amount and share bars; opens to its descriptions. */
function node(key, c, total, cls, ofIncome, incomeTotal) {
  const share = total ? c.amount / total : 0;
  const items = c.items.slice(0, SHOW), rest = c.items.slice(SHOW);
  const restAmt = rest.reduce((a, r) => a + r.amount, 0);
  const d = h('details', { class: 'ie-node ' + cls, open: open.has(key) });
  d.addEventListener('toggle', () => { if (d.open) open.add(key); else open.delete(key); });
  d.append(
    h('summary', null,
      h('span', { class: 'ie-name' }, c.category, h('small', null, ` ${c.count} entr${c.count === 1 ? 'y' : 'ies'}`)),
      h('span', { class: 'ie-amt' }, money(c.amount)),
      h('span', { class: 'ie-pct' }, pct(share, 0), ofIncome && incomeTotal ? h('small', null, ` · ${pct(c.amount / incomeTotal, 0)} of income`) : null),
      h('span', { class: 'ie-bar' }, h('i', { style: { width: Math.max(2, Math.round(share * 100)) + '%' } }))),
    h('ul', { class: 'ie-items' },
      ...items.map((r) => h('li', null, h('span', { class: 'ie-d' }, r.desc, r.count > 1 ? h('small', null, ` ×${r.count}`) : null), h('span', { class: 'ie-a' }, money(r.amount)), h('span', { class: 'ie-p' }, pct(c.amount ? r.amount / c.amount : 0, 0)))),
      rest.length ? h('li', { class: 'ie-more' }, h('span', { class: 'ie-d' }, `${rest.length} more descriptions`), h('span', { class: 'ie-a' }, money(restAmt)), h('span', { class: 'ie-p' }, pct(c.amount ? restAmt / c.amount : 0, 0))) : null));
  return d;
}

function block(title, tag, tree, total, cls, emptyMsg, note, incomeTotal, withIncome = true) {
  const list = h('div', { class: 'ie-list' }, tree.map((c) => node(tag + '|' + c.category, c, total, cls, withIncome, incomeTotal)));
  const all = (v) => (e) => { e.preventDefault(); list.querySelectorAll('details').forEach((d) => { d.open = v; }); tree.forEach((c) => (v ? open.add(tag + '|' + c.category) : open.delete(tag + '|' + c.category))); };
  const bar = tree.length ? [h('button', { class: 'btn small', onclick: all(true) }, 'Open all'), h('button', { class: 'btn small', onclick: all(false) }, 'Close all')] : [];
  return section(title, tree.length ? h('div', null, list, note ? h('p', { class: 'note' }, note) : null) : h('p', { class: 'empty' }, emptyMsg), bar);
}

export function render() {
  const { data, all } = S;
  const months = C.ledgerMonths(data);
  const range = C.periodRange(period, all.asOf);
  const r = C.flowReport(data, range.from, range.to);
  const name = /^\d{4}-\d\d$/.test(period) ? monthLabel(period, true) : range.label;
  const root = h('div', { class: 'page ie' });
  root.append(h('div', { class: 'filters' }, periodSelect(months)));

  const inc = r.totalIncome;
  root.append(h('div', { class: 'stats' },
    stat('Income', money(inc), name, 'inc'),
    stat('Expenses', money(r.totalExpense), inc ? pct(r.totalExpense / inc, 0) + ' of income' : 'incl. loan EMI & tax', 'exp'),
    stat('Invested', money(r.totalInvest), inc ? pct(r.totalInvest / inc, 0) + ' of income' : 'not an expense', 'inv'),
    stat(r.saved >= 0 ? 'Left over' : 'Spent more than earned', h('span', { class: r.saved >= 0 ? 'pos' : 'neg' }, money(Math.abs(r.saved))), inc ? pct(Math.abs(r.saved) / inc, 0) + ' of income' : '')));

  // where the income went, as one bar
  if (inc > 0) {
    const e = Math.min(1, r.totalExpense / inc), i = Math.min(1 - e, r.totalInvest / inc), l = Math.max(0, 1 - e - i);
    root.append(section('Where the income went', h('div', null,
      h('div', { class: 'ie-flow', role: 'img', 'aria-label': `Expenses ${pct(e, 0)}, invested ${pct(i, 0)}, left ${pct(l, 0)}` },
        h('span', { class: 'f-exp', style: { width: e * 100 + '%' } }), h('span', { class: 'f-inv', style: { width: i * 100 + '%' } }), h('span', { class: 'f-left', style: { width: l * 100 + '%' } })),
      h('div', { class: 'ie-key' },
        h('span', null, h('i', { class: 'f-exp' }), ` Expenses ${money(r.totalExpense)} · ${pct(e, 0)}`),
        h('span', null, h('i', { class: 'f-inv' }), ` Invested ${money(r.totalInvest)} · ${pct(i, 0)}`),
        h('span', null, h('i', { class: 'f-left' }), ` ${r.saved >= 0 ? 'Left over' : 'Short by'} ${money(Math.abs(r.saved))}`)))));
  }

  root.append(block('Income', 'inc', r.incomeTree, inc, 'is-inc', 'No income in this period.', 'Open a source to see where it came from. Refunds and loan repayments in categories not marked as income are left out.', 0, false));
  root.append(block('Expenses', 'exp', r.expenseTree, r.totalExpense, 'is-exp', 'No expenses in this period.', `Loan EMI and tax are included here (${money(r.loanTax)}). Open a category to see each description.`, inc));
  root.append(block('Investments', 'inv', r.investTree, r.totalInvest, 'is-inv', 'Nothing was put into investments in this period.', 'How the invested money was split. The percentage is the share of everything invested; open one to see where inside it the money went.', inc));
  if (r.otherIn > 0) root.append(h('p', { class: 'note' }, `${money(r.otherIn)} was received in categories that are not marked as income. It is not counted above.`));
  root.append(h('p', { class: 'note' }, 'Transfers between your own accounts and cash withdrawals are left out. Investments are shown apart from expenses.'));
  return root;
}
