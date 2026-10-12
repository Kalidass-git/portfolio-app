import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, gainText, section, stat, table, monthPicker, num, signed } from '../ui.js';
import { strip, legend, meter, hbars } from '../charts.js';

let selMonth = null;

export function render() {
  const { all, data } = S;
  const months = C.ledgerMonths(data);
  const cur = C.monthKey(all.asOf);
  if (!selMonth || !months.includes(selMonth)) selMonth = months.includes(cur) ? cur : months[months.length - 1];
  const root = h('div', { class: 'page' });

  // --- hero: net worth and the allocation spine ---
  const rows = all.rows.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount).map((r) => ({ label: r.type, value: r.amount }));
  root.append(h('section', { class: 'hero card' },
    h('div', { class: 'hero-top' },
      h('div', null,
        h('p', { class: 'hero-label' }, 'Net worth'),
        h('p', { class: 'hero-num' }, compact(all.netAsset)),
        h('p', { class: 'hero-exact' }, money(all.netAsset) + ' as on ' + dateStr(all.asOf))),
      h('dl', { class: 'hero-side' },
        h('div', null, h('dt', null, 'Total assets'), h('dd', null, money(all.totalAssets))),
        h('div', null, h('dt', null, 'Liabilities'), h('dd', null, money(all.liabTotal))),
        h('div', null, h('dt', null, 'Earning every month'), h('dd', null, money(all.cfTotal.perMonth))))),
    strip(rows, { fmt: money }),
    legend(rows, { fmt: money })));

  // --- earning power ---
  const cfRows = all.cashflow;
  root.append(section('Interest earned',
    table([
      { label: 'Where', get: (r) => r.name },
      { label: 'Invested', cls: 'r', get: (r) => money(r.capital), total: (rs) => money(all.cfTotal.capital) },
      { label: 'Per day', cls: 'r', get: (r) => money(r.perDay), total: () => money(all.cfTotal.perDay) },
      { label: 'Per month', cls: 'r', get: (r) => money(r.perMonth), total: () => money(all.cfTotal.perMonth) },
      { label: 'Per year', cls: 'r', get: (r) => money(r.perYear), total: () => money(all.cfTotal.perYear) },
      { label: 'Yield', cls: 'r', get: (r) => pct(r.yield, 2), total: () => pct(all.cfTotal.yield, 2) },
    ], cfRows, { footer: { label: 'Total' } })));

  // --- returns ---
  const rets = C.returns(data, all);
  const cov = C.overallXirr(data, all, rets);
  root.append(section('Returns',
    h('div', null,
      table([
        { label: 'Asset', get: (r) => r.name },
        { label: 'Invested', cls: 'r', get: (r) => money(r.invested) },
        { label: 'Now', cls: 'r', get: (r) => money(r.value) },
        { label: 'Gain', cls: 'r', render: (r) => gainText(r.gain) },
        { label: 'Return', cls: 'r', get: (r) => (r.ret == null || r.name.includes('lending') || r.name === 'Bonds' ? '–' : pct(r.ret)) },
        { label: 'XIRR (yearly)', cls: 'r', get: (r) => (r.xirr == null ? '–' : pct(r.xirr)) },
      ], rets),
      h('p', { class: 'note' }, 'XIRR is the yearly return that accounts for when each rupee went in. It needs dated cash flows, so shares and funds show plain return until buy dates are added. XIRR rows cover ' + pct(cov.coverage, 0) + ' of your assets. Bond and lending XIRR assume coupons arrive on schedule.'))));

  // --- exposure ---
  root.append(section('Where the money sits',
    table([
      { label: 'Type', get: (r) => r.type },
      { label: 'Risk', get: (r) => r.risk },
      { label: 'Capital', cls: 'r', get: (r) => money(r.capital), total: (rs) => money(rs.reduce((a, r) => a + r.capital, 0)) },
      { label: 'Share', cls: 'r', render: (r) => h('span', { class: 'with-meter' }, meter(r.pct * 1.6, 0), pct(r.pct)), total: (rs) => pct(rs.reduce((a, r) => a + r.pct, 0)) },
    ], all.exposure.slice().sort((a, b) => b.capital - a.capital), { footer: { label: 'Total' } })));

  // --- month cash flow ---
  const mc = C.monthCashflow(data, all, selMonth);
  const incomeTbl = table([
    { label: 'Income', get: (r) => r.name },
    { label: 'Expected', cls: 'r', get: (r) => money(r.expected), total: () => money(mc.totalExpected) },
    { label: 'Received', cls: 'r', get: (r) => money(r.received), total: () => money(mc.totalReceived) },
    { label: 'Pending', cls: 'r', render: (r) => (r.expected - r.received > 0 ? h('span', { class: 'warn' }, money(r.expected - r.received)) : '✓'), total: () => money(Math.max(0, mc.yetToReceive)) },
  ], mc.income, { footer: { label: 'Total' } });
  const spend = mc.spend.concat([mc.lifestyle]).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  root.append(section('This month',
    h('div', { class: 'grid2' },
      h('div', null, incomeTbl),
      h('div', null,
        spend.length ? hbars(spend.map((s) => ({ label: s.name, value: s.amount })), { fmt: money, colorIndex: 1 }) : h('p', { class: 'empty' }, 'No spending recorded in this month.'),
        h('p', { class: 'summary-line' }, 'Spent ', h('b', null, money(mc.totalSpent + mc.lifestyle.amount)), ' · Expected income left after spending ', h('b', { class: mc.totalExpected - mc.totalSpent - mc.lifestyle.amount < 0 ? 'neg' : 'pos' }, money(mc.totalExpected - mc.totalSpent - mc.lifestyle.amount))))),
    [monthPicker(months, selMonth, (m) => { selMonth = m; window.dispatchEvent(new Event('rerender')); })]));

  // --- money due ---
  const due = data.receivables.filter((r) => r.active !== false && r.balanceDue > 0).map((r) => C.receivableStatus(r, all.asOf));
  const pending = due.filter((r) => !r.received && !r.notStarted && r.due <= C.monthEnd(all.asOf));
  if (due.length) {
    root.append(section('Money to receive this month',
      pending.length
        ? table([
          { label: 'From', get: (r) => r.name },
          { label: 'Amount', cls: 'r', get: (r) => money(r.expected) },
          { label: 'Due', get: (r) => dateStr(r.due) },
          { label: 'Status', render: (r) => h('span', { class: r.overdue ? 'tag bad' : 'tag' }, r.overdue ? 'Overdue' : 'Upcoming') },
        ], pending)
        : h('p', { class: 'empty' }, 'Everything due this month has been received.')));
  }
  return root;
}
