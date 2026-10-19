// Income & expenses: overview for any period, category filter, and a drill-down page for one category.
import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, pct, dateStr, monthLabel, section, stat, table, dialog, segTabs, btn, canEdit, dec, route, setOptions, monthGroups } from '../ui.js';
import { hbars, barChart, stackedBars, meter } from '../charts.js';
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
  setOptions(sel, [{ group: 'Period', options: PERIODS.map(([v, l]) => ({ value: v, label: l })) }, ...monthGroups(months).map((g) => ({ group: g.label || 'A single month', options: g.months.map((m) => ({ value: m, label: monthLabel(m, true) })) }))], period);
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

const bdView = { debit: 'category', credit: 'category' };
const descLink = (dir, desc) => `${detailLink('*', dir)}&view=all&desc=${encodeURIComponent(desc)}`;
/** Top items as bars, switchable between category and description. "Show all" opens the entry-by-entry page. */
function breakdown(title, dir, catRows, entryRows, ci, emptyMsg) {
  if (!catRows.length) return section(title, h('p', { class: 'empty' }, emptyMsg));
  const view = bdView[dir];
  const pick = (k) => (e) => { e.preventDefault(); bdView[dir] = k; rerender(); };
  const toggle = h('nav', { class: 'seg slim', 'aria-label': 'Break down by' },
    [['category', 'Category'], ['description', 'Description']].map(([k, l]) => h('a', { href: 'javascript:void 0', class: k === view ? 'on' : '', 'aria-selected': String(k === view), onclick: pick(k) }, l)),
    h('a', { href: detailLink('*', dir) + '&view=all' }, 'Show all ›'));
  let body;
  if (view === 'category') body = h('div', null, hbars(catRows.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: ci, onClick: (x) => { location.hash = detailLink(x.label, dir); } }), h('p', { class: 'note' }, 'Tap a category to see it by description or entry by entry.'));
  else {
    const list = C.byDescription(entryRows, dir);
    body = h('div', null, hbars(list.slice(0, 12).map((r) => ({ label: r.desc, value: r.amount })), { fmt: money, colorIndex: ci, onClick: (x) => { location.hash = descLink(dir, x.label); } }),
      h('p', { class: 'note' }, (list.length > 12 ? `Top 12 of ${list.length} descriptions. ` : '') + 'Tap one to see its entries. “Show all” lists every entry.'));
  }
  return section(title, h('div', null, toggle, body));
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
    canEdit() ? h('span', { class: 'btn-row' }, btn('Add income', () => txnForm(null, { kind: 'credit', title: 'Add income' }), '', { keep: true }), btn('Add expense', () => txnForm(null, { kind: 'debit', title: 'Add expense' }), 'primary', { keep: true })) : null));
  root.append(controls(months, data));
  root.append(h('div', { class: 'stats' },
    stat('Income', money(s.totalIncome), name, 'inc'),
    stat('Expenses', money(s.everyday), s.totalIncome ? pct(s.everyday / s.totalIncome, 0) + ' of income' : 'without loan EMI & tax', 'exp'),
    stat('Loan EMI & tax', money(s.loanTax), 'shown apart from expenses', 'exp'),
    stat('Invested', money(s.totalInvest), 'not an expense', 'inv'),
    filtered ? stat('Filter total', money(s.totalExpense), 'expenses + loan & tax in the filter', 'exp') : null));

  // alert: a budget that is nearly used up (this month against monthly budgets, this year against yearly ones)
  {
    const mo = C.periodRange('this', all.asOf), yr = C.periodRange('ytd', all.asOf);
    const none = { mode: 'all', cats: [] };
    const al = CAT.budgetAlerts(data, C.rangeSummary(data, mo.from, mo.to, none).expense, C.rangeSummary(data, yr.from, yr.to, none).expense);
    const sig = al.map((x) => x.name + (x.over ? '!' : '')).join('|');
    const DK = 'fw.budgetAlertDismissed';
    const dismissedOn = () => { try { return (JSON.parse(localStorage.getItem(DK) || '{}'))[sig] || ''; } catch (_) { return ''; } };
    const hidden = (() => { const d = dismissedOn(); return !!d && (new Date(C.todayISO()) - new Date(d)) / 86400000 < 5; })();
    if (al.length && !hidden) root.append(h('div', { class: 'alert' + (al.some((x) => x.over) ? '' : ' warn'), style: { position: 'relative' } },
      h('a', { href: '#', class: 'dismiss-link', title: 'Hide this for 5 days', style: { position: 'absolute', top: '8px', right: '12px', fontSize: '0.85em' },
        onclick: (e) => { e.preventDefault(); try { const o = JSON.parse(localStorage.getItem(DK) || '{}'); o[sig] = C.todayISO(); localStorage.setItem(DK, JSON.stringify(o)); } catch (_) { /* private mode */ } e.target.closest('.alert').remove(); } }, 'Dismiss'),
      h('b', null, al.some((x) => x.over) ? `${al.filter((x) => x.over).length} over budget` + (al.some((x) => !x.over) ? `, ${al.filter((x) => !x.over).length} close to it` : '') : `${al.length} budget${al.length > 1 ? 's' : ''} nearly used up`),
      h('ul', { class: 'findings' }, al.map((x) => h('li', null, h('b', { class: x.over ? 'neg' : 'warn' }, x.name), ` ${x.scope === 'month' ? 'this month' : 'this year'}: ${pct(x.used, 0)} of the ${x.scope === 'month' ? 'monthly' : 'yearly'} budget used (${money(x.spent)} of ${money(x.budget)})${x.over ? ', over by ' + money(-x.left) : ''}`)))));
    const yl = CAT.yearlyLines(data, C.rangeSummary(data, yr.from, yr.to, none).expense).filter((l) => passes(l.name));
    if (yl.length) root.append(section('Yearly budget · ' + yr.from.slice(0, 4), h('div', null,
      table([
        { label: 'Category', host: true, get: (l) => l.name },
        { label: 'Spent so far', cls: 'r', get: (l) => money(l.spent) },
        { label: 'Yearly budget', mob: 'under', mlabel: 'budget ', cls: 'r', get: (l) => money(l.budget) },
        { label: 'Used', mob: 'under', mlabel: 'used ', cls: 'r', render: (l) => h('span', { class: 'with-meter' }, meter(Math.min(1, l.used), l.used > 1 ? 7 : l.used >= 0.8 ? 3 : 2), h('span', { class: l.used > 1 ? 'neg' : l.used >= 0.8 ? 'warn' : '' }, pct(l.used, 0))) },
        { label: 'Left', cls: 'r', render: (l) => h('span', { class: l.left < 0 ? 'neg' : 'pos' }, money(l.left)) },
      ], yl),
      h('p', { class: 'note' }, 'Spending from 1 January to today, whatever period is chosen above.')),
      [h('a', { class: 'btn small', href: '#/flow/categories' }, 'Edit budgets')]));
  }

  // budgets: monthly budget × months in the period
  if (range.months) {
    const lines = CAT.budgetLines(data, s.expense).map((l) => ({ ...l, budget: l.budget * range.months, left: l.budget * range.months - l.spent, used: l.spent / (l.budget * range.months) })).filter((l) => passes(l.name));
    if (lines.length) {
      const tb = lines.reduce((a, l) => a + l.budget, 0), ts = lines.reduce((a, l) => a + l.spent, 0);
      root.append(section('Budget · ' + name, h('div', null,
        table([
          { label: 'Category', host: true, get: (l) => l.name },
          { label: 'Spent', cls: 'r', get: (l) => money(l.spent), total: () => money(ts) },
          { label: 'Budget', mob: 'under', mlabel: 'budget ', cls: 'r', get: (l) => money(l.budget), total: () => money(tb) },
          { label: 'Used', mob: 'under', mlabel: 'used ', cls: 'r', render: (l) => h('span', { class: 'with-meter' }, meter(Math.min(1, l.used), l.used > 1 ? 7 : l.used > .85 ? 3 : 2), h('span', { class: l.used > 1 ? 'neg' : '' }, pct(l.used, 0))), total: () => pct(tb ? ts / tb : 0, 0) },
          { label: 'Left', cls: 'r', render: (l) => h('span', { class: l.left < 0 ? 'neg' : 'pos' }, money(l.left)), total: () => h('span', { class: tb - ts < 0 ? 'neg' : '' }, money(tb - ts)) },
        ], lines, { footer: { label: 'Total' } }),
        h('p', { class: 'note' }, 'Budgets are set per category each month. Categories without a budget are not listed.')),
        [h('a', { class: 'btn small', href: '#/flow/categories' }, 'Edit budgets')]));
    } else if (canEdit() && !filtered) {
      root.append(h('div', { class: 'card' }, h('p', null, 'Set a monthly budget for categories like groceries, food or travel to see how much is left.'), h('a', { class: 'btn small', href: '#/flow/categories' }, 'Set budgets')));
    }
  }

  root.append(h('div', { class: 'grid2' },
    breakdown('Where the money went · ' + name, 'debit', s.expense, s.expenseRows, 1, 'No expenses for this period' + (filtered ? ' and filter.' : '.')),
    breakdown('Income by source', 'credit', s.income, s.incomeRows, 2, 'No income in this period.')));
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

  root.append(monthsSection(data, months));
  if (s.otherIn > 0) root.append(h('p', { class: 'note' }, `${money(s.otherIn)} was received in categories that are not marked as income (refunds, loan repayments, sales). It is not counted as income. If some of it is real income, change that category’s type under Categories.`));
  root.append(h('p', { class: 'note' }, 'Transfers between your own accounts and cash withdrawals are left out everywhere on this screen. Investments are never counted as expenses. The month-by-month chart ignores the filter and counts loan EMI & tax inside expenses.'));
  return root;
}
const passes = (name) => C.passesFilter(filter, name);

// ----- month by month: each column is stacked by category; tap one to see what is inside it -----
const RANGES = [[1, 'This month'], [2, '2 months'], [3, '3 months'], [6, '6 months'], [9, '9 months'], [12, '12 months']];
let mRange = 12, mPick = null;
function monthsSection(data, allMonths) {
  const cur = C.monthKey(S.all.asOf);
  const list = allMonths.filter((m) => m <= cur).slice(-mRange);
  const none = { mode: 'all', cats: [] };
  const sums = list.map((m) => C.rangeSummary(data, m + '-01', m + '-31', none));
  const KEYS = [['income', 'Income', 'credit'], ['expense', 'Expenses', 'debit'], ['invest', 'Invested', 'debit']];
  // the biggest categories over the whole window get their own shade, the rest are grouped
  const order = KEYS.map(([k]) => { const t = new Map(); sums.forEach((s) => s[k].forEach((c) => t.set(c.category, (t.get(c.category) || 0) + c.amount))); return [...t.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]); });
  const parts = (s, ki) => { const top = order[ki].slice(0, 5); const rows = top.map((c) => ({ name: c, value: (s[KEYS[ki][0]].find((x) => x.category === c) || {}).amount || 0 })); const rest = s[KEYS[ki][0]].filter((x) => !top.includes(x.category)).reduce((a, x) => a + x.amount, 0); if (rest > 0) rows.push({ name: 'Everything else', value: rest }); return rows; };
  if (mPick && !list.includes(mPick.month)) mPick = null;
  const box = h('div');
  const draw = () => {
    const chips = h('div', { class: 'row-actions', style: { marginBottom: '6px' } }, RANGES.map(([n, l]) => h('button', { type: 'button', class: 'chip-btn' + (mRange === n ? ' on' : ''), onclick: () => { mRange = n; rerender(); } }, l)));
    const chart = stackedBars({ names: KEYS.map((k) => k[1]), colors: [2, 1, 0], fmt: money,
      groups: list.map((m, i) => ({ label: monthLabel(m).slice(0, 3), title: monthLabel(m, true), bars: KEYS.map((_, ki) => parts(sums[i], ki)) })),
      selected: mPick ? { g: list.indexOf(mPick.month), s: mPick.ki } : null,
      onSelect: (g, ki) => { mPick = mPick && mPick.month === list[g] && mPick.ki === ki ? null : { month: list[g], ki }; draw(); } });
    let detail;
    if (mPick) {
      const [k, label, dir] = KEYS[mPick.ki], s = sums[list.indexOf(mPick.month)], rows = s[k], total = rows.reduce((a, x) => a + x.amount, 0);
      detail = h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, `${label}, ${monthLabel(mPick.month, true)} · ${money(total)}`),
        rows.length ? hbars(rows.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: [2, 1, 0][mPick.ki], onClick: (x) => { location.hash = detailLink(x.label, dir); } }) : h('p', { class: 'empty' }, 'Nothing in this month.'));
    } else detail = h('p', { class: 'note' }, 'Tap a column to see what it is made of, for example the income received in one month.');
    box.replaceChildren(chips, chart, detail);
  };
  draw();
  return section('Month by month', box);
}

// ----- drill-down page for one category (or all expenses) -----
function detail(q) {
  const { data, all } = S;
  const kindOf = CAT.kindOf(data);
  const cat = q.get('cat') || '*', dir = q.get('dir') === 'credit' ? 'credit' : 'debit';
  const viewQ = q.get('view');
  const view = ['cat', 'desc', 'all'].includes(viewQ) && (viewQ !== 'cat' || cat === '*') ? viewQ : (cat === '*' ? 'cat' : 'desc');
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
  root.append(h('div', { class: 'card dir-' + (dir === 'credit' ? 'in' : 'out') },
    h('h2', { style: { margin: 0 } }, label + (descFilter ? ' · ' + descFilter : '')),
    h('p', { class: 'note', style: { marginTop: 4 } }, `${name} · ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`)));
  root.append(h('div', { class: 'stats' },
    stat('Total', money(total), name),
    stat('Entries', String(rows.length), rows.length ? `average ${money(total / rows.length)}` : ''),
    range.months ? stat('Per month', money(total / range.months), 'average over the period') : null));
  root.append(h('nav', { class: 'seg', 'aria-label': 'View' },
    (cat === '*' ? [['cat', 'By category'], ['desc', 'By description'], ['all', 'All entries']] : [['desc', 'By description'], ['all', 'All entries']]).map(([k, l]) => h('a', { href: `${base}&view=${k}${descFilter && k === 'all' ? '&desc=' + encodeURIComponent(descFilter) : ''}`, class: k === view ? 'on' : '', 'aria-selected': String(k === view) }, l))));
  if (view === 'cat') {
    const m = new Map();
    for (const e of rows) m.set(e.category || 'Other', (m.get(e.category || 'Other') || 0) + (e[dir] || 0));
    const cats = [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    root.append(h('div', { class: 'card' }, cats.length ? hbars(cats.map((x) => ({ label: x.category, value: x.amount })), { fmt: money, colorIndex: dir === 'credit' ? 2 : 1, onClick: (x) => { location.hash = detailLink(x.label, dir); } }) : h('p', { class: 'empty' }, 'No entries for this period and filter.'),
      h('p', { class: 'note' }, 'Tap a category to open it.')));
  } else if (view === 'desc') {
    const list = C.byDescription(rows, dir);
    if (list.length) root.append(h('div', { class: 'card' }, hbars(list.slice(0, 15).map((r) => ({ label: r.desc, value: r.amount })), { fmt: money, colorIndex: dir === 'credit' ? 2 : 1, onClick: (x) => { location.hash = `${base}&view=all&desc=${encodeURIComponent(x.label)}`; } }),
      list.length > 15 ? h('p', { class: 'note' }, `Top 15 of ${list.length}. The table below has them all.`) : null));
    root.append(h('div', { class: 'card' }, table([
      { label: 'Description', host: true, get: (r) => r.desc },
      { label: 'Entries', cls: 'r', get: (r) => String(r.count), total: () => String(rows.length) },
      { label: 'Total', cls: 'r', get: (r) => money(r.amount), total: () => money(total) },
      { label: 'Average', mob: 'under', mlabel: 'avg ', cls: 'r', get: (r) => money(r.avg) },
      { label: 'Share', mob: 'under', mlabel: 'share ', cls: 'r', get: (r) => pct(r.share, 0) },
      { label: 'Last', mob: 'under', mlabel: 'last ', get: (r) => dateStr(r.last) },
    ], list, { footer: { label: 'Total' }, onRow: (r) => { location.hash = `${base}&view=all&desc=${encodeURIComponent(r.desc)}`; }, empty: 'No entries for this period and filter.' }),
      h('p', { class: 'note' }, 'Tap a description to see its entries.')));
  } else {
    const acct = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
    const sorted = rows.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    root.append(h('div', { class: 'card' }, descFilter ? h('p', null, h('a', { href: `${base}&view=desc` }, '← all descriptions')) : null, table([
      { label: 'Date', mob: 'under', get: (e) => dateStr(e.date) }, { label: 'Description', host: true, get: (e) => e.desc },
      ...(cat === '*' ? [{ label: 'Category', mob: 'under', get: (e) => e.category }] : []),
      { label: 'Account', mob: 'under', get: (e) => acct.get(e.acct) },
      { label: 'Amount', cls: 'r', render: (e) => h('span', { class: dir === 'credit' ? 'pos' : kindOf(e.category) === 'investment' ? 'inv' : 'neg' }, money(e[dir])), total: () => money(total) },
    ], sorted, { footer: { label: 'Total' }, onRow: canEdit() ? (e) => txnForm(data.ledger.find((x) => x.id === e.id)) : null, empty: 'No entries for this period and filter.' })));
  }
  return root;
}
