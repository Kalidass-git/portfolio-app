// Insights: Tax summary, Cash calendar, Annual review, Spending anomalies and the Allocation goal, as sub tabs of one menu.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import * as I from '../insights.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, btn, segTabs, subTab, setOptions, formDialog, toast, canEdit } from '../ui.js';
import { barChart, lineChart } from '../charts.js';
import { plannedByMonth } from './networth.js';
import { groupedTable, groupOfAlloc } from './groupmix.js';

const TABS = [['tax', 'Tax summary'], ['calendar', 'Cash calendar'], ['review', 'Annual review'], ['anomalies', 'Spending anomalies'], ['allocation', 'Allocation goal']];
const rerender = () => window.dispatchEvent(new Event('rerender'));
const st = { fy: null, months: 12, year: null, month: null };
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const note = (t) => h('p', { class: 'note' }, t);
const select = (opts, cur, label, on) => { const s = h('select', { class: 'month-select', 'aria-label': label, onchange: (e) => on(e.target.value) }); setOptions(s, opts, String(cur)); return s; };
function download(name, text, type = 'text/csv') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

export function render() {
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Insights')));
  ({ tax, calendar, review, anomalies, allocation })[tab](root);
  return root;
}

// ---------- 1. Tax summary ----------
function tax(root) {
  const { data, all } = S;
  const fys = I.fyList(data, all.asOf);
  if (!st.fy || !fys.some((f) => f.y === st.fy)) st.fy = fys[0].y;
  const t = I.taxSummary(data, all, st.fy);
  root.append(h('div', { class: 'filters' }, select(fys.map((f) => ({ value: String(f.y), label: f.label })), st.fy, 'Financial year', (v) => { st.fy = Number(v); rerender(); }),
    btn('Download CSV', () => download(`tax-summary-${t.fy.replace(/\s/g, '-')}.csv`, I.taxCsv(t)), 'small')));
  if (t.bankOther.length) root.append(section('Other income credited to the bank', table([{ label: 'Category', host: true, get: (r) => r.category }, { label: 'Amount', cls: 'r', get: (r) => money(r.amount) }], t.bankOther, {})));
  root.append(h('div', { class: 'stats' },
    stat('Interest earned', money(t.interestGross), 'bonds, FDs and lending'),
    stat('Salary', money(t.salary), 'credited to the bank'),
    stat('Dividends', money(t.dividendTotal), `${t.dividends.length} companies`),
    stat('Short-term gains', h('span', { class: tone(t.stcg) }, signed(t.stcg)), 'sold within 12 months'),
    stat('Long-term gains', h('span', { class: tone(t.ltcg) }, signed(t.ltcg)), 'held over 12 months')));
  root.append(section(`Interest, ${t.fy}`, t.interestBy.length ? h('div', null, ...t.interestBy.map((g) => h('div', null, h('h4', null, g.kind), table([
    { label: 'Name', host: true, get: (r) => r.name },
    { label: 'Holder', mob: 'hide', get: (r) => r.holder || '–' },
    { label: 'Interest', cls: 'r', get: (r) => money(r.gross), total: (rs) => money(rs.reduce((a, r) => a + r.gross, 0)) },
    g.tds ? { label: `TDS at ${pct(t.tdsRate, 0)}`, cls: 'r', mob: 'under', mlabel: 'TDS ', get: (r) => money(r.tds), total: (rs) => money(rs.reduce((a, r) => a + r.tds, 0)) } : null,
  ].filter(Boolean), g.rows, { footer: {} }))),
  note(`Interest is worked out by days held inside the year, whether or not it has been paid out yet (accrual basis). TDS is an estimate for bonds only, at the rate in Settings; match it with Form 26AS.`)) : h('p', { class: 'empty' }, 'No interest-bearing holdings in this year.')));
  root.append(section('Dividends', t.dividends.length ? table([
    { label: 'Company', host: true, get: (d) => d.name },
    { label: 'Payments', cls: 'r', mob: 'under', mlabel: 'x', get: (d) => d.count },
    { label: 'Amount', cls: 'r', get: (d) => money(d.amount) },
  ], t.dividends, {}) : h('p', { class: 'empty' }, 'No dividends recorded in this year.')));
  root.append(section('Capital gains, shares and mutual funds', t.gains.length ? table([
    { label: 'Name', host: true, get: (g) => g.name },
    { label: 'Type', mob: 'hide', get: (g) => g.kind },
    { label: 'Bought', mob: 'hide', get: (g) => dateStr(g.buyDate) },
    { label: 'Sold', mob: 'under', mlabel: 'sold ', get: (g) => dateStr(g.date) },
    { label: 'Sale value', cls: 'r', mob: 'hide', get: (g) => money(g.proceeds) },
    { label: 'Gain', cls: 'r', render: (g) => h('span', { class: tone(g.gain) }, signed(g.gain)) },
    { label: 'Term', mob: 'under', get: (g) => (g.term === 'LT' ? 'Long term' : 'Short term') },
  ], t.gains, {}) : h('p', { class: 'empty' }, 'No shares or funds sold in this year.')));
  root.append(note('A guide for filing, not tax advice. Gains use oldest units first. Debt funds, gold ETFs, bonus and split adjustments and the grandfathering rules are taxed differently, so check these with your accountant. Rental income, interest on savings accounts and other bank interest appear under Other income credited only if you categorised them.'));
}

// ---------- 2. Cash calendar ----------
function calendar(root) {
  const { data, all } = S;
  const cal = I.cashCalendar(data, all, st.months);
  const al = I.maturityAlerts(data, all);
  if (al.length) root.append(h('div', { class: 'card alert-card', role: 'alert' }, h('h3', null, `Maturing within a month${al.some((x) => x.overdue) ? ' or already due' : ''}`),
    h('ul', { class: 'findings' }, al.map((x) => h('li', { class: x.overdue || x.daysLeft <= 7 ? 'over' : 'amber' }, h('b', null, x.name), ` (${x.kind}) `, x.overdue ? h('span', { class: 'neg' }, `was due ${dateStr(x.date)}`) : h('span', { class: x.daysLeft <= 7 ? 'neg' : 'warn' }, x.daysLeft === 0 ? 'matures today' : `matures in ${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} (${dateStr(x.date)})`), ' · ', x.basis === 'projected' ? '≈ ' : '', money(x.amount), x.basis === 'projected' ? h('small', { class: 'muted' }, ' projected from the rate') : x.basis === 'entered' ? h('small', { class: 'muted' }, ' expected payout') : x.basis === 'paid' ? h('small', { class: 'muted' }, ' paid in so far (no payout or rate entered)') : null)))));
  root.append(h('div', { class: 'filters' }, select([3, 6, 12, 24].map((n) => ({ value: String(n), label: `Next ${n} months` })), st.months, 'Months ahead', (v) => { st.months = Number(v); rerender(); })));
  root.append(h('div', { class: 'stats' },
    stat('Money coming in', money(cal.totalIn), `next ${st.months} months`),
    stat('Going out', money(cal.totalOut), 'loan EMIs'),
    stat('Maturing', money(cal.maturing), 'bonds, FDs, lending, chits'),
    stat('Cash then', money(cal.months[cal.months.length - 1].cash), `from ${money(all.cashTotal)} now`)));
  root.append(section('Maturity ladder', h('div', null, barChart({ groups: cal.months.map((r) => ({ label: monthLabel(r.month).slice(0, 3), title: monthLabel(r.month, true), values: [r.maturing, r.inflow - r.maturing] })), names: ['Maturities', 'Interest and dues'], colors: [2, 0], fmt: compact, height: 220 }),
    note('Overdue maturities are shown in this month, since the money is yet to be collected.'))));
  root.append(section('Month by month', table([
    { label: 'Month', host: true, get: (r) => monthLabel(r.month, true) },
    { label: 'In', cls: 'r', get: (r) => money(r.inflow) },
    { label: 'Out', cls: 'r', mob: 'under', mlabel: 'out ', get: (r) => money(r.outflow) },
    { label: 'Net', cls: 'r', mob: 'under', mlabel: 'net ', render: (r) => h('span', { class: tone(r.net) }, signed(r.net)) },
    { label: 'Cash after', cls: 'r', mob: 'hide', get: (r) => money(r.cash) },
  ], cal.months, {})));
  const dated = cal.months.filter((r) => r.items.some((x) => x.kind !== 'Interest'));
  root.append(section('What falls due', dated.length ? h('div', null, ...dated.map((r) => h('details', { class: 'cal-month' }, h('summary', null, monthLabel(r.month, true), ' · ', h('span', { class: 'muted' }, `${r.items.filter((x) => x.kind !== 'Interest').length} items`)),
    table([
      { label: 'Date', get: (x) => (x.late ? 'Overdue' : dateStr(x.date)) },
      { label: 'What', host: true, get: (x) => x.title },
      { label: 'Kind', mob: 'hide', get: (x) => x.kind },
      { label: 'Amount', cls: 'r', render: (x) => h('span', { class: x.dir === 'out' ? 'neg' : '' }, (x.dir === 'out' ? '−' : '') + money(x.amount)) },
    ], r.items.filter((x) => x.kind !== 'Interest'), {})))) : h('p', { class: 'empty' }, 'Nothing falls due in this period.')));
  root.append(note('Interest is shown as a monthly figure. Cash after = today’s bank and small savings balance plus the net of each month, before your day-to-day spending and salary.'));
}

// ---------- 3. Annual review ----------
function review(root) {
  const { data, all } = S;
  const years = I.yearsWithLedger(data);
  if (!years.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No transactions yet.'))); return; }
  if (!st.year || !years.includes(st.year)) st.year = years[0];
  const r = I.annualReview(data, all, Number(st.year));
  const s = r.summary;
  root.append(h('div', { class: 'filters' }, select(years.map((y) => ({ value: y, label: y })), st.year, 'Year', (v) => { st.year = v; rerender(); }), btn('Print', () => window.print(), 'small')));
  root.append(h('div', { class: 'stats' },
    stat('Net worth', r.nwEnd != null ? money(r.nwEnd) : '–', r.nwChange != null ? h('span', { class: tone(r.nwChange) }, `${signed(r.nwChange)} since ${monthLabel(r.nwStartKey, true)}`) : 'no snapshots'),
    stat('Income', money(s.totalIncome), r.salary ? `salary ${money(r.salary)}` : ''),
    stat('Spent', money(s.totalExpense), r.savingsRate != null ? `${pct(1 - s.totalExpense / s.totalIncome, 0)} of income kept` : ''),
    stat('Invested', money(s.totalInvest), r.investRate != null ? `${pct(r.investRate, 0)} of income` : ''),
    stat('Left over', h('span', { class: tone(s.left) }, signed(s.left)), 'after spending and investing')));
  root.append(h('div', { class: 'grid2' },
    section('Highlights', h('ul', { class: 'plain' },
      r.best ? h('li', null, 'Best month: ', h('b', null, monthLabel(r.best.month, true)), ' · left ', money(r.best.left)) : null,
      r.worst && r.worst !== r.best ? h('li', null, 'Toughest month: ', h('b', null, monthLabel(r.worst.month, true)), ' · left ', h('span', { class: tone(r.worst.left) }, signed(r.worst.left))) : null,
      r.taxFy.dividendTotal ? h('li', null, 'Dividends received: ', money(r.taxFy.dividendTotal), ` (${r.taxFy.fy})`) : null,
      r.taxFy.gains.length ? h('li', null, 'Gains booked: ', h('span', { class: tone(r.taxFy.stcg + r.taxFy.ltcg) }, signed(r.taxFy.stcg + r.taxFy.ltcg)), ` (${r.taxFy.fy})`) : null,
      h('li', null, 'Interest and other income: ', money(r.interest)))),
    section('Where the money went', r.topExpenses.length ? table([{ label: 'Category', host: true, get: (x) => x.category }, { label: 'Spent', cls: 'r', get: (x) => money(x.amount) }, { label: 'Share', cls: 'r', mob: 'under', mlabel: '', get: (x) => pct(x.amount / s.totalExpense, 0) }], r.topExpenses, {}) : h('p', { class: 'empty' }, 'No spending.'))));
  const planned = plannedByMonth(data, all);
  const havePlan = r.months.some((m) => planned.has(m.month) && m.nw != null);
  root.append(section('Month by month', table([
    { label: 'Month', host: true, get: (m) => monthLabel(m.month, true) },
    { label: 'Income', cls: 'r', get: (m) => money(m.income) },
    { label: 'Spent', cls: 'r', mob: 'under', mlabel: 'spent ', get: (m) => money(m.expense) },
    { label: 'Invested', cls: 'r', mob: 'hide', get: (m) => money(m.invest) },
    { label: 'Left', cls: 'r', mob: 'under', mlabel: 'left ', render: (m) => h('span', { class: tone(m.left) }, signed(m.left)) },
    { label: 'Net worth', cls: 'r', mob: 'hide', get: (m) => (m.nw != null ? money(m.nw) : '–') },
    havePlan ? { label: 'Against plan', cls: 'r', mob: 'hide', render: (m) => (m.nw != null && planned.has(m.month) ? h('span', { class: tone(m.nw - planned.get(m.month)) }, signed(m.nw - planned.get(m.month))) : '–') } : null,
  ].filter(Boolean), r.months, {})));
  root.append(note('Spent includes loan EMIs and tax. Invested is money moved to investments, so Left is what stayed in the bank. Net worth comes from your month-end snapshots.'));
}

// ---------- 4. Spending anomalies ----------
function anomalies(root) {
  const { data, all } = S;
  const months = C.ledgerMonths(data).slice().reverse();
  if (!months.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No transactions yet.'))); return; }
  if (!st.month || !months.includes(st.month)) st.month = months[0];
  const a = I.anomalies(data, all, st.month);
  root.append(h('div', { class: 'filters' }, select(months.map((m) => ({ value: m, label: monthLabel(m, true) })), st.month, 'Month', (v) => { st.month = v; rerender(); })));
  const n = a.spikes.length + a.fresh.length + a.missing.length + a.big.length;
  root.append(h('div', { class: 'stats' },
    stat('Everyday spending', money(a.total), a.basis ? `usual ${money(a.avgTotal)}` : 'no earlier months'),
    stat('Things to look at', String(n), n ? 'listed below' : 'all looks normal')));
  if (a.basis < 2) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Needs at least two earlier months to compare against.'))); return; }
  const ents = (es) => es.map((e) => `${dateStr(e.date)} ${e.desc || ''} ${money(e.debit)}`.trim()).join(' · ');
  root.append(section('Higher than usual', a.spikes.length ? table([
    { label: 'Category', host: true, get: (x) => x.category },
    { label: 'This month', cls: 'r', get: (x) => money(x.amount) },
    { label: 'Usual', cls: 'r', mob: 'under', mlabel: 'usual ', get: (x) => money(x.avg) },
    { label: 'Times usual', cls: 'r', mob: 'under', mlabel: '', get: (x) => x.ratio.toFixed(1) + '×' },
    { label: 'Biggest entries', mob: 'hide', get: (x) => ents(x.entries) },
  ], a.spikes, {}) : h('p', { class: 'empty' }, 'No category is unusually high.')));
  if (a.fresh.length) root.append(section('New this month', table([{ label: 'Category', host: true, get: (x) => x.category }, { label: 'Amount', cls: 'r', get: (x) => money(x.amount) }, { label: 'Entries', mob: 'hide', get: (x) => ents(x.entries) }], a.fresh, {})));
  if (a.big.length) root.append(section('Large single payments', table([{ label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Description', host: true, get: (e) => e.desc }, { label: 'Category', mob: 'under', get: (e) => e.category }, { label: 'Amount', cls: 'r', get: (e) => money(e.debit) }, { label: 'Usual entry', cls: 'r', mob: 'hide', get: (e) => money(e.median) }], a.big, {})));
  if (a.missing.length) root.append(section('Usual spending that did not happen', h('div', null, table([{ label: 'Category', host: true, get: (x) => x.category }, { label: 'Usual per month', cls: 'r', get: (x) => money(x.avg) }], a.missing, {}), note('A regular bill missing can mean it was paid from another account or not yet entered.'))));
  root.append(note(`Compared with the average of the ${a.basis} months before. Loan EMIs and tax are left out.`));
}

// ---------- 5. Allocation goal ----------
const OUTLOOK_OPTS = P.OUTLOOKS.map((o) => ({ value: o.id, label: `${o.name} (${pct(o.rate, 0)} a year)` }));
function allocation(root) {
  const { data, all } = S;
  const g = data.allocGoal || null;
  const outlookId = (g && g.outlook) || 'steady';
  const rate = P.OUTLOOKS.find((o) => o.id === outlookId).rate;
  const now = I.allocNow(data, all, rate);
  const total = now.reduce((s, x) => s + x.value, 0);
  const monthly = g && g.monthly != null ? g.monthly : I.defaultMonthly(data, all);
  const link = h('a', { class: 'crosslink', href: '#/projector/ahead' }, 'Wealth projector');
  const edit = () => goalForm(g, monthly, outlookId);
  if (!g || !g.targets) {
    root.append(h('div', { class: 'card' }, h('h3', null, 'Set the mix you want to reach'),
      note('Pick a goal for the seven groups below. The page then shows how long it takes to get there by adding new money each month (without selling anything) and where that money should go.'),
      h('div', { class: 'row-actions' }, ...I.PRESETS.map((p) => btn(p.name, () => canEdit() ? saveGoal({ targets: p.pct, monthly, outlook: outlookId }) : toast('This device has read-only access.'), 'small')), canEdit() ? btn('Set my own', edit, 'primary small') : null),
      note('The three presets are only starting points, not advice. You can change every number.')));
    root.append(h('h4', null, 'Where you are today'), table([{ label: 'Group', host: true, get: (x) => x.label }, { label: 'Value', cls: 'r', get: (x) => money(x.value) }, { label: 'Share', cls: 'r', get: (x) => pct(total ? x.value / total : 0, 1) }], now, {}));
    return;
  }
  const res = I.allocPath(now, g.targets, monthly);
  const tgt = (k) => (g.targets[k] || 0) / 100;
  const rows = now.map((x) => { const sh = total ? x.value / total : 0, want = tgt(x.key) * total; return { ...x, share: sh, goal: tgt(x.key), gap: sh - tgt(x.key), move: want - x.value, add: res.firstSplit[x.key] || 0 }; });
  const worst = rows.slice().sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  root.append(h('div', { class: 'pagebar' }, h('span', { class: 'muted' }, 'Set the mix you want and see how long it takes'), h('span', null, link), canEdit() ? btn('Change goal', edit, 'small') : null));
  root.append(h('div', { class: 'stats' },
    stat('Time to reach it', I.monthsText(res.reached), res.reached == null ? 'raise the monthly amount or relax the goal' : `by ${monthLabel(C.addMonths(all.asOf.slice(0, 7) + '-01', res.reached).slice(0, 7), true)}`),
    stat('New money each month', money(monthly), 'from income less spending'),
    stat('Furthest from goal', worst.label, `${worst.gap > 0 ? 'over' : 'under'} by ${(Math.abs(worst.gap) * 100).toFixed(1)} points`),
    stat('Market outlook', P.OUTLOOKS.find((o) => o.id === outlookId).name, 'for shares, funds and gold')));
  const sm = (it, k) => it.reduce((a, x) => a + x[k], 0);
  const gapTxt = (gap) => h('span', { class: Math.abs(gap) <= 0.02 ? 'pos' : 'neg' }, (gap > 0 ? '+' : gap < 0 ? '−' : '') + (Math.abs(gap) * 100).toFixed(1) + ' pts');
  const moveTxt = (mv) => h('span', { class: mv > 0 ? 'pos' : mv < 0 ? 'neg' : '' }, mv > 0 ? 'add ' + money(mv) : mv < 0 ? 'trim ' + money(-mv) : '–');
  root.append(section('Goal against today', h('div', null, groupedTable({
    rows, groupOf: (x) => groupOfAlloc(x.key),
    cols: [
      { label: 'Group' },
      { label: 'Now', cls: 'r', parent: (it) => money(sm(it, 'value')), child: (x) => money(x.value), total: () => money(total) },
      { label: 'Now %', cls: 'r', parent: (it) => pct(sm(it, 'share'), 1), child: (x) => pct(x.share, 1) },
      { label: 'Goal %', cls: 'r', parent: (it) => pct(sm(it, 'goal'), 1), child: (x) => pct(x.goal, 1), total: () => pct(I.goalTotal(g.targets) / 100, 0) },
      { label: 'Gap', cls: 'r', hide: true, parent: (it) => gapTxt(sm(it, 'gap')), child: (x) => gapTxt(x.gap) },
      { label: 'To reach goal today', cls: 'r', hide: true, parent: (it) => moveTxt(sm(it, 'move')), child: (x) => moveTxt(x.move) },
    ],
  }),
  note('Within 2 points of the goal counts as reached. “To reach goal today” is what would have to move now; the plan below avoids selling and uses new money instead.'))));
  root.append(section('Where new money should go', h('div', null, res.reached === 0 ? h('p', null, 'You are already inside the goal. Keep adding in the goal proportions:') : null, table([
    { label: 'Group', host: true, get: (x) => x.label },
    { label: 'Per month', cls: 'r', get: (x) => money(x.add || (res.reached === 0 ? monthly * x.goal : 0)) },
    { label: 'Share of new money', cls: 'r', mob: 'under', mlabel: '', get: (x) => (monthly ? pct((x.add || (res.reached === 0 ? monthly * x.goal : 0)) / monthly, 0) : '–') },
  ], rows.filter((x) => x.add > 0 || res.reached === 0), { empty: 'Add a monthly amount above zero to see the split.' }), note('This is the split for the first month. It shifts toward the groups still short of the goal as the months go by.'))));
  const scen = [1, 1.5, 2].map((k) => { const r = I.allocPath(now, g.targets, Math.round(monthly * k), {}); return { label: k === 1 ? 'As now' : `${k}× as much`, monthly: Math.round(monthly * k), months: r.reached }; });
  root.append(section('If you put in more', table([{ label: 'New money', host: true, get: (x) => `${x.label} (${money(x.monthly)} a month)` }, { label: 'Time to reach', cls: 'r', get: (x) => I.monthsText(x.months) }], scen, {})));
  const keys = I.ALLOC.map((a) => a.key);
  const yearly = res.path.filter((p) => p.m % 12 === 0 || p.m === res.reached).slice(0, 16);
  root.append(section('Year by year', h('div', null,
    lineChart({ labels: yearly.map((p) => (p.m ? (p.m % 12 ? monthsShort(p.m) : p.m / 12 + 'y') : 'Now')), fmt: (v) => pct(v, 0), height: 220, series: I.ALLOC.map((a, i) => ({ name: a.label, values: yearly.map((p) => p.shares[a.key]), color: i })) }),
    table([{ label: 'When', host: true, get: (p) => (p.m ? monthsShort(p.m) : 'Now') }, { label: 'Total', cls: 'r', get: (p) => compact(p.total) }, ...I.ALLOC.map((a) => ({ label: a.label.split(',')[0].split(' (')[0], cls: 'r', mob: 'hide', get: (p) => pct(p.shares[a.key], 0) }))], yearly, {}),
    note('Each group grows at the rate it has earned so far (shares, funds and gold at the market outlook chosen). Real returns will differ. Nothing is sold.'))));
}
const monthsShort = (m) => (m >= 12 ? `${Math.floor(m / 12)}y ${m % 12 ? (m % 12) + 'm' : ''}`.trim() : `${m}m`);
function saveGoal(goal) { try { mutate((d) => { d.allocGoal = goal; }); rerender(); } catch (e) { toast(e.message, 'error'); } }
function goalForm(g, monthly, outlook) {
  const t = (g && g.targets) || I.PRESETS[1].pct;
  formDialog({
    title: 'Target allocation',
    value: { ...t, monthly, outlook },
    fields: [
      ...I.ALLOC.map((a) => ({ key: a.key, label: `${a.label} (%)`, type: 'number', half: true, step: 1 })),
      { key: 'monthly', label: 'New money each month (₹)', type: 'number', half: true, hint: 'Leave your usual savings here' },
      { key: 'outlook', label: 'Market outlook', type: 'select', options: OUTLOOK_OPTS, half: true, hint: 'Used for shares, funds and gold' },
    ],
    onSave: (v) => {
      const targets = Object.fromEntries(I.ALLOC.map((a) => [a.key, Number(v[a.key]) || 0]));
      const sum = I.goalTotal(targets);
      if (Math.abs(sum - 100) > 0.5) { toast(`The seven groups add up to ${sum}%. They must add up to 100%.`, 'error'); return false; }
      saveGoal({ targets, monthly: Math.max(0, Number(v.monthly) || 0), outlook: v.outlook || 'steady' });
    },
  });
}
