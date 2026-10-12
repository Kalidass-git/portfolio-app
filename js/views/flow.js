import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, monthPicker, dialog } from '../ui.js';
import { hbars, barChart, lineChart } from '../charts.js';

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

export function render() {
  const { data, all } = S;
  const months = C.ledgerMonths(data);
  const cur = C.monthKey(all.asOf);
  if (!selMonth || !months.includes(selMonth)) selMonth = months.includes(cur) ? cur : months[months.length - 1];
  const s = C.monthSummary(data, selMonth);
  const root = h('div', { class: 'page' });
  root.append(h('div', { class: 'toolbar' }, h('span'), monthPicker(months, selMonth, (m) => { selMonth = m; rerender(); })));
  root.append(h('div', { class: 'stats' },
    stat('Income', money(s.totalIncome), `${s.income.length} sources`),
    stat('Spending', money(s.totalExpense), s.totalIncome ? pct(s.expenseRatio, 0) + ' of income' : ''),
    stat('Invested', money(s.totalInvest), 'bonds, chits, gold, funds'),
    stat('Left over', h('span', { class: s.saved >= 0 ? 'pos' : 'neg' }, money(s.saved)), 'income − spending − invested')));

  root.append(h('div', { class: 'grid2' },
    section('Spending by category', s.expense.length ? hbars(s.expense.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 1, onClick: (r) => drill(selMonth, r.label, 'debit') }) : h('p', { class: 'empty' }, 'No spending in this month.')),
    section('Income by source', s.income.length ? hbars(s.income.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 2, onClick: (r) => drill(selMonth, r.label, 'credit') }) : h('p', { class: 'empty' }, 'No income in this month.'))));
  if (s.invest.length) root.append(section('Money put into investments', hbars(s.invest.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 0, onClick: (r) => drill(selMonth, r.label, 'debit') })));

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
