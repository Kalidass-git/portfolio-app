// Income & expenses: overview for any period, category filter, and a drill-down page for one category.
import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, pct, dateStr, monthLabel, section, stat, table, dialog, segTabs, btn, canEdit, dec, route, setOptions } from '../ui.js';
import { hbars, barChart, meter } from '../charts.js';
import * as CAT from '../categories.js';
import * as categoriesView from './categories.js';
import { openLedger, txnForm } from './cash.js';

let period = 'this';
let filter = { mode: 'all', cats: [] };
const rerender = () => window.dispatchEvent(new Event('rerender'));
import * as archiveView from './archive.js';
const TABS = [['month', 'Overview'], ['categories', 'Categories & budgets'], ['archive', 'Archive']];

const PERIODS = [['this', 'This month'], ['last', 'Last month'], ['ytd', 'This year so far'], ['12m', 'Past 12 months'], ['all', 'All time']];
const periodName = (key, range) => (/^\d{4}-\d\d$/.test(key) ? monthLabel(key, true) : range.label);

function periodSelect(months) {
  const sel = h('select', { class: 'month-select', 'aria-label': 'Period', onchange: (e) => { period = e.target.value; rerender(); } });
  setOptions(sel, [{ group: 'Period', options: PERIODS.map(([v, l]) => ({ value: v, label: l })) }, { group: 'A single month', options: months.slice().reverse().map((m) => ({ value: m, label: monthLabel(m, true) })) }], period);
  return sel;
}
const filterText = () => (filter.mode === 'all' || !filter.cats.length ? '' : (filter.mode === 'only' ? 'Only ' : 'Leaving out ') + (filter.cats.length > 3 ? filter.cats.length + ' categories' : filter.cats.join(', ')));

function filterDialog(data) {
  const kind = CAT.kindOf(data);
  const names = CAT.categoryList(data).filter((c) => c.kind === 'expense' || c.kind === 'investment').map((c) => c.name).sort((a, b) => a.localeCompare(b));
  const chosen = new Set(filter.cats.map((c) => c.toLowerCase()));
  let mode = filter.mode === 'all' ? 'except' : filter.mode;
  const boxes = names.map((n) => h('input', { type: 'checkbox', value: n, checked: chosen.has(n.toLowerCase()), 'aria-label': n }));
  const modeSel = h('select', { 'aria-label': 'Filter mode', onchange: (e) => { mode = e.target.value; } },
    [['only', 'Show only the categories I tick'], ['except', 'Show everything except the ones I tick']].map(([v, l]) => h('option', { value: v, selected: v === mode }, l)));
  const tick = (list) => { const set = new Set(list.map((x) => x.toLowerCase())); boxes.forEach((b) => (b.checked = set.has(b.value.toLowerCase()))); };
  const body = h('div', { class: 'form' },
    h('label', { class: 'field' }, h('span', null, 'How to filter'), modeSel),
    h('div', { class: 'chips-row' },
      h('button', { type: 'button', class: 'chip-btn', onclick: () => { modeSel.value = mode = 'except'; tick(['Loan', 'Rent', 'Tax']); } }, 'Leave out loan, rent & tax'),
      h('button', { type: 'button', class: 'chip-btn', onclick: () => tick([]) }, 'Clear ticks')),
    h('div', { class: 'checklist' }, names.map((n, i) => h('label', { class: 'check-row' }, boxes[i], h('span', null, n)))));
  dialog('Filter categories', body, [
    { label: 'Show everything', onclick: (c) => { filter = { mode: 'all', cats: [] }; c(); rerender(); } },
    { label: 'Apply', class: 'primary', onclick: (c) => { const cats = boxes.filter((b) => b.checked).map((b) => b.value); filter = cats.length ? { mode, cats } : { mode: 'all', cats: [] }; c(); rerender(); } },
  ]);
}

function controls(months, data) {
  const t = filterText();
  return h('div', { class: 'filters' },
    periodSelect(months),
    h('button', { class: 'chip-btn' + (t ? ' primary' : ''), onclick: () => filterDialog(data) }, t ? '⚙ ' + t : '⚙ Filter categories'),
    t ? h('button', { class: 'chip-btn', onclick: () => { filter = { mode: 'all', cats: [] }; rerender(); } }, 'Clear filter') : null);
}

const detailLink = (cat, dir) => `#/flow/detail?cat=${encodeURIComponent(cat)}&dir=${dir}`;

export function render() {
  const r = route();
  if (r.sub === 'categories') {
    const page = categoriesView.render();
    page.prepend(h('div', { class: 'pagebar' }, segTabs(TABS, 'categories', 'Expense views')));
    return page;
  }
  if (r.sub === 'archive') {
    const page = archiveView.render();
    page.prepend(h('div', { class: 'pagebar' }, segTabs(TABS, 'archive', 'Expense views')));
    return page;
  }
  return r.sub === 'detail' ? detail(r.query) : overview();
}

function overview() {
  const { data, all } = S;
  const months = C.ledgerMonths(data);
  const cur = C.monthKey(all.asOf);
  if (period === 'this' && !months.includes(cur) && months.length) { /* no entries yet this month: still show it as empty */ }
  const range = C.periodRange(period, all.asOf);
  const s = C.rangeSummary(data, range.from, range.to, filter);
  const filtered = !!filterText();
  const name = periodName(period, range);
  const root = h('div', { class: 'page' });
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, 'month', 'Expense views'),
    canEdit() ? h('span', { class: 'btn-row' }, btn('Add income', () => txnForm(null, { kind: 'credit', title: 'Add income' })), btn('Add expense', () => txnForm(null, { kind: 'debit', title: 'Add expense' }), 'primary')) : null));
  root.append(controls(months, data));
  root.append(h('div', { class: 'stats' },
    stat('Income', money(s.totalIncome), name),
    stat('Expenses', money(s.everyday), s.totalIncome ? pct(s.everyday / s.totalIncome, 0) + ' of income' : 'without loan EMI & tax'),
    stat('Loan EMI & tax', money(s.loanTax), 'shown apart from expenses'),
    stat('Invested', money(s.totalInvest), 'not an expense'),
    filtered ? stat('Filter total', money(s.totalExpense), 'expenses + loan & tax in the filter')
      : stat('Left over', h('span', { class: s.left >= 0 ? 'pos' : 'neg' }, money(s.left)), 'income − all money paid out')));

  // budgets: monthly budget × months in the period
  if (range.months) {
    const lines = CAT.budgetLines(data, s.expense).map((l) => ({ ...l, budget: l.budget * range.months, left: l.budget * range.months - l.spent, used: l.spent / (l.budget * range.months) })).filter((l) => passes(l.name));
    if (lines.length) {
      const tb = lines.reduce((a, l) => a + l.budget, 0), ts = lines.reduce((a, l) => a + l.spent, 0);
      root.append(section('Budget · ' + name, h('div', null,
        table([
          { label: 'Category', get: (l) => l.name },
          { label: 'Spent', cls: 'r', get: (l) => money(l.spent), total: () => money(ts) },
          { label: 'Budget', cls: 'r', get: (l) => money(l.budget), total: () => money(tb) },
          { label: 'Used', cls: 'r', render: (l) => h('span', { class: 'with-meter' }, meter(Math.min(1, l.used), l.used > 1 ? 7 : l.used > .85 ? 3 : 2), h('span', { class: l.used > 1 ? 'neg' : '' }, pct(l.used, 0))), total: () => pct(tb ? ts / tb : 0, 0) },
          { label: 'Left', cls: 'r', render: (l) => h('span', { class: l.left < 0 ? 'neg' : 'pos' }, money(l.left)), total: () => h('span', { class: tb - ts < 0 ? 'neg' : '' }, money(tb - ts)) },
        ], lines, { footer: { label: 'Total' } }),
        h('p', { class: 'note' }, 'Budgets are set per category each month. Categories without a budget are not listed.')),
        [h('a', { class: 'btn small', href: '#/flow/categories' }, 'Edit budgets')]));
    } else if (canEdit() && !filtered) {
      root.append(h('div', { class: 'card' }, h('p', null, 'Set a monthly budget for categories like groceries, food or travel to see how much is left.'), h('a', { class: 'btn small', href: '#/flow/categories' }, 'Set budgets')));
    }
  }

  root.append(h('div', { class: 'grid2' },
    section('Where the money went · ' + name, s.expense.length
      ? h('div', null, hbars(s.expense.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 1, onClick: (x) => { location.hash = detailLink(x.label, 'debit'); } }),
        h('p', { class: 'note' }, 'Tap a category to see it by description or entry by entry.'),
        h('a', { class: 'btn small', href: detailLink('*', 'debit') }, 'All of these by description'))
      : h('p', { class: 'empty' }, 'No expenses for this period' + (filtered ? ' and filter.' : '.'))),
    section('Income by source', s.income.length ? hbars(s.income.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 2, onClick: (x) => { location.hash = detailLink(x.label, 'credit'); } }) : h('p', { class: 'empty' }, 'No income in this period.'))));
  if (s.invest.length) root.append(section('Money put into investments', hbars(s.invest.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: 0, onClick: (x) => { location.hash = detailLink(x.label, 'debit'); } })));

  const rw = C.runway(data, all);
  if (rw.basis) {
    root.append(section('How long the money lasts', h('div', null,
      h('div', { class: 'stats' },
        stat('Bank cash covers', rw.months == null ? '–' : dec(rw.months, 1) + ' months', `${money(rw.cash)} ÷ ${money(rw.avg)} average monthly expenses`),
        stat('Interest pays for', rw.coverage == null ? '–' : pct(rw.coverage, 0), `${money(all.cfTotal.perMonth)} a month of interest against that spending`)),
      h('p', { class: 'note' }, `Based on the last ${rw.basis} full month${rw.basis > 1 ? 's' : ''}, including EMI and rent but not investments. Bonds, FDs and chits are not counted as cash here.`))));
  }
  const unknown = data.ledger.filter((e) => (e.category || '').toLowerCase() === 'unknown').length;
  if (unknown && canEdit()) root.append(h('div', { class: 'card' }, h('p', null, `${unknown} entries are in “Unknown”, so they are not telling you what the money was for. `), btn('Review them', () => openLedger({ text: 'Unknown' }), 'small')));

  const tr = C.monthlyTrend(data, months.slice(-12));
  root.append(section('Last 12 months', barChart({
    names: ['Income', 'Expenses', 'Invested'], fmt: money,
    groups: tr.map((t) => ({ label: monthLabel(t.month).slice(0, 3), title: monthLabel(t.month), values: [t.income, t.expense, t.invest] })),
  })));
  if (s.otherIn > 0) root.append(h('p', { class: 'note' }, `${money(s.otherIn)} was received in categories that are not marked as income (refunds, loan repayments, sales). It is not counted as income. If some of it is real income, change that category’s type under Categories.`));
  root.append(h('p', { class: 'note' }, 'Transfers between your own accounts and cash withdrawals are left out everywhere on this screen. Investments are never counted as expenses. The 12-month chart ignores the filter and counts loan EMI & tax inside expenses.'));
  return root;
}
const passes = (name) => C.passesFilter(filter, name);

// ----- drill-down page for one category (or all expenses) -----
function detail(q) {
  const { data, all } = S;
  const cat = q.get('cat') || '*', dir = q.get('dir') === 'credit' ? 'credit' : 'debit';
  const view = q.get('view') === 'all' ? 'all' : 'desc';
  const descFilter = q.get('desc') || '';
  const months = C.ledgerMonths(data);
  const range = C.periodRange(period, all.asOf);
  const s = C.rangeSummary(data, range.from, range.to, filter);
  let rows = dir === 'credit' ? s.incomeRows : s.expenseRows.concat(s.investRows);
  if (cat !== '*') rows = rows.filter((e) => (e.category || '').toLowerCase() === cat.toLowerCase());
  if (descFilter) rows = rows.filter((e) => (e.desc || '').trim().toLowerCase() === descFilter.toLowerCase());
  const total = rows.reduce((a, e) => a + (e[dir] || 0), 0);
  const name = periodName(period, range);
  const label = cat === '*' ? (dir === 'credit' ? 'All income' : 'All expenses & investments') : cat;
  const base = `#/flow/detail?cat=${encodeURIComponent(cat)}&dir=${dir}`;
  const root = h('div', { class: 'page' });
  root.append(h('div', { class: 'pagebar' }, h('a', { class: 'back', href: '#/flow' }, '← Income & expenses'), controls(months, data)));
  root.append(h('div', { class: 'card' },
    h('h2', { style: { margin: 0 } }, label + (descFilter ? ' · ' + descFilter : '')),
    h('p', { class: 'note', style: { marginTop: 4 } }, `${name} · ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`)));
  root.append(h('div', { class: 'stats' },
    stat('Total', money(total), name),
    stat('Entries', String(rows.length), rows.length ? `average ${money(total / rows.length)}` : ''),
    range.months ? stat('Per month', money(total / range.months), 'average over the period') : null));
  root.append(h('nav', { class: 'seg', 'aria-label': 'View' },
    [['desc', 'By description'], ['all', 'All entries']].map(([k, l]) => h('a', { href: `${base}&view=${k}${descFilter && k === 'all' ? '&desc=' + encodeURIComponent(descFilter) : ''}`, class: k === view ? 'on' : '', 'aria-selected': String(k === view) }, l))));
  if (view === 'desc') {
    const list = C.byDescription(rows, dir);
    root.append(h('div', { class: 'card' }, table([
      { label: 'Description', get: (r) => r.desc },
      { label: 'Entries', cls: 'r', get: (r) => String(r.count), total: () => String(rows.length) },
      { label: 'Total', cls: 'r', get: (r) => money(r.amount), total: () => money(total) },
      { label: 'Average', cls: 'r', get: (r) => money(r.avg) },
      { label: 'Share', cls: 'r', get: (r) => pct(r.share, 0) },
      { label: 'Last', get: (r) => dateStr(r.last) },
    ], list, { footer: { label: 'Total' }, onRow: (r) => { location.hash = `${base}&view=all&desc=${encodeURIComponent(r.desc)}`; }, empty: 'No entries for this period and filter.' }),
      h('p', { class: 'note' }, 'Tap a description to see its entries.')));
  } else {
    const acct = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
    const sorted = rows.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    root.append(h('div', { class: 'card' }, descFilter ? h('p', null, h('a', { href: `${base}&view=desc` }, '← all descriptions')) : null, table([
      { label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Description', get: (e) => e.desc },
      ...(cat === '*' ? [{ label: 'Category', get: (e) => e.category }] : []),
      { label: 'Account', get: (e) => acct.get(e.acct) },
      { label: 'Amount', cls: 'r', get: (e) => money(e[dir]), total: () => money(total) },
    ], sorted, { footer: { label: 'Total' }, onRow: canEdit() ? (e) => txnForm(data.ledger.find((x) => x.id === e.id)) : null, empty: 'No entries for this period and filter.' })));
  }
  return root;
}
