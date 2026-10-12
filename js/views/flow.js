import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, monthPicker, dialog, segTabs, subTab, btn, canEdit, dec } from '../ui.js';
import { hbars, barChart, lineChart, meter } from '../charts.js';
import * as CAT from '../categories.js';
import * as categoriesView from './categories.js';
import { openLedger } from './cash.js';

let selMonth = null;
const rerender = () => window.dispatchEvent(new Event('rerender'));

function drill(month, category, field) {
  const rows = C.monthLedger(S.data, month).filter((e) => e.category === category && e[field] > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
  const acct = new Map(S.data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
  dialog(`${category} · ${monthLabel(month)}`, table([
    { label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Description', get: (e) => e.desc }, { label: 'Account', get: (e) => acct.get(e.acct) },
    { label: 'Amount', cls: 'r', get: (e) => money(e[field]), total: (rs) => money(rs.reduce((a, e) => a + e[field], 0)) },
  ], rows, { footer: { label: 'Total' } }), [{ label: 'Close', onclick: (c) => c() }]);
}

const TABS = [['month', 'Month'], ['categories', 'Categories & budgets']];

export function render() {
  const tab = subTab(TABS.map((t) => t[0]));
  if (tab === 'categories') {
    const page = categoriesView.render();
    page.prepend(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Spending views')));
    return page;
  }
  return month();
}

function month() {
  const { data, all } = S;
  const months = C.ledgerMonths(data);
  const cur = C.monthKey(all.asOf);
  if (!selMonth || !months.includes(selMonth)) selMonth = months.includes(cur) ? cur : months[months.length - 1];
  const s = C.monthSummary(data, selMonth);
  const root = h('div', { class: 'page' });
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, 'month', 'Spending views'), monthPicker(months, selMonth, (m) => { selMonth = m; rerender(); })));
  root.append(h('div', { class: 'stats' },
    stat('Income', money(s.totalIncome), `${s.income.length} sources`),
    stat('Spending', money(s.totalExpense), s.totalIncome ? pct(s.expenseRatio, 0) + ' of income' : ''),
    stat('Invested', money(s.totalInvest), 'bonds, chits, gold, funds'),
    stat('Left over', h('span', { class: s.saved >= 0 ? 'pos' : 'neg' }, money(s.saved)), 'income − spending − invested')));

  // budgets
  const lines = CAT.budgetLines(data, s.expense);
  if (lines.length) {
    const tb = lines.reduce((a, l) => a + l.budget, 0), ts = lines.reduce((a, l) => a + l.spent, 0);
    root.append(section('Budget this month', h('div', null,
      table([
        { label: 'Category', get: (l) => l.name },
        { label: 'Spent', cls: 'r', get: (l) => money(l.spent), total: () => money(ts) },
        { label: 'Budget', cls: 'r', get: (l) => money(l.budget), total: () => money(tb) },
        { label: 'Used', cls: 'r', render: (l) => h('span', { class: 'with-meter' }, meter(Math.min(1, l.used), l.used > 1 ? 7 : l.used > .85 ? 3 : 2), h('span', { class: l.used > 1 ? 'neg' : '' }, pct(l.used, 0))), total: () => pct(tb ? ts / tb : 0, 0) },
        { label: 'Left', cls: 'r', render: (l) => h('span', { class: l.left < 0 ? 'neg' : 'pos' }, money(l.left)), total: () => money(tb - ts) },
      ], lines, { footer: { label: 'Total' } }),
      h('p', { class: 'note' }, 'Budgets are set per category. Spending in categories without a budget is not included here.')),
      [h('a', { class: 'btn small', href: '#/flow/categories' }, 'Edit budgets')]));
  } else if (canEdit()) {
    root.append(h('div', { class: 'card' }, h('p', null, 'Set a monthly budget for categories like groceries, food or travel to see how much is left each month.'), h('a', { class: 'btn small', href: '#/flow/categories' }, 'Set budgets')));
  }

  root.append(h('div', { class: 'grid2' },
    section('Spending by category', s.expense.length ? hbars(s.expense.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 1, onClick: (r) => drill(selMonth, r.label, 'debit') }) : h('p', { class: 'empty' }, 'No spending in this month.')),
    section('Income by source', s.income.length ? hbars(s.income.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 2, onClick: (r) => drill(selMonth, r.label, 'credit') }) : h('p', { class: 'empty' }, 'No income in this month.'))));
  if (s.invest.length) root.append(section('Money put into investments', hbars(s.invest.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 0, onClick: (r) => drill(selMonth, r.label, 'debit') })));

  const rw = C.runway(data, all);
  if (rw.basis) {
    root.append(section('How long the money lasts', h('div', null,
      h('div', { class: 'stats' },
        stat('Bank cash covers', rw.months == null ? '–' : dec(rw.months, 1) + ' months', `${money(rw.cash)} ÷ ${money(rw.avg)} average monthly spending`),
        stat('Interest pays for', rw.coverage == null ? '–' : pct(rw.coverage, 0), `${money(all.cfTotal.perMonth)} a month of interest against that spending`)),
      h('p', { class: 'note' }, `Spending is the average of the last ${rw.basis} full month${rw.basis > 1 ? 's' : ''}, including EMI and rent but not investments. Bonds, FDs and chits are not counted as cash here.`))));
  }

  const unknown = data.ledger.filter((e) => (e.category || '').toLowerCase() === 'unknown').length;
  if (unknown && canEdit()) root.append(h('div', { class: 'card' }, h('p', null, `${unknown} transactions are in “Unknown”, so they are not telling you what the money was for. `), btn('Review them', () => openLedger({ text: 'Unknown' }), 'small')));

  const last = months.slice(-12);
  const tr = C.monthlyTrend(data, last);
  root.append(section('Last 12 months', barChart({
    names: ['Income', 'Spending', 'Invested'], fmt: money,
    groups: tr.map((t) => ({ label: monthLabel(t.month).slice(0, 3), title: monthLabel(t.month), values: [t.income, t.expense, t.invest] })),
  })));
  const avg = (k) => tr.reduce((a, t) => a + t[k], 0) / (tr.length || 1);
  root.append(h('p', { class: 'note' }, `Average over these ${tr.length} months: income ${money(avg('income'))}, spending ${money(avg('expense'))}, invested ${money(avg('invest'))}. Transfers between your own accounts and cash withdrawals are left out. Tap a bar in a list above to see the entries behind it.`));
  return root;
}
