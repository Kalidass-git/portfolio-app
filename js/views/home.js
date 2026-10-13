// Home: a dashboard of cards. The detail tables live on each asset screen.
import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, section, monthPicker, rowList, kpi, dateChip, btn, canEdit, dec, toast } from '../ui.js';
import { strip, legend, hbars, lineChart, donut, spark } from '../charts.js';
import { rateHistory, ageText } from './gold.js';

let selMonth = null;
const rerender = () => window.dispatchEvent(new Event('rerender'));
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const shortDate = (d) => dateStr(d).replace(/ (\d\d)(\d\d)$/, " '$2");
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const RISK_ORDER = ['Safe', 'Medium', 'Medium High', 'High'];

function hero(all, series) {
  const monthStartIso = C.monthStart(all.asOf);
  const base = series.filter((p) => p.date < monthStartIso).pop();
  const delta = base ? all.netAsset - base.value : null;
  const trend = series.slice(-14).map((p) => p.value);
  return h('section', { class: 'hero card span-12' },
    h('div', { class: 'hero-top' },
      h('div', null,
        h('p', { class: 'hero-label' }, 'Net worth'),
        h('p', { class: 'hero-num' }, compact(all.netAsset)),
        h('p', { class: 'hero-exact' }, money(all.netAsset) + ' as on ' + dateStr(all.asOf)),
        delta != null ? h('p', { class: 'hero-delta ' + tone(delta) }, `${delta >= 0 ? '▲' : '▼'} ${money(Math.abs(delta))} since ${dateStr(base.date).replace(/ \d{4}$/, '')}`) : null),
      h('div', { class: 'hero-right' },
        spark(trend, { width: 150, height: 44, tone: 2 }),
        h('dl', { class: 'hero-side' },
          h('div', null, h('dt', null, 'Assets'), h('dd', null, compact(all.totalAssets))),
          h('div', null, h('dt', null, 'Loans'), h('dd', null, compact(all.liabTotal)))))));
}

function tiles(all, data) {
  const dayN = all.stocks.dayCount + all.mf.dayCount, day = all.stocks.day + all.mf.day;
  const dayBase = all.stocks.current + all.mf.current - day;
  const hist = rateHistory(data), last = hist[hist.length - 1];
  const oldGold = last && Math.round((C.toMs(all.asOf) - C.toMs(last.date)) / C.DAY) > 7;
  const rw = C.runway(data, all);
  return h('div', { class: 'kpis span-12' },
    kpi('Earning every month', money(all.cfTotal.perMonth), `${money(all.cfTotal.perDay)} a day · ${pct(all.cfTotal.yield, 1)} a year`, { href: '#/fixed' }),
    kpi('Shares & funds today', dayN ? sgn(day) : '–', dayN ? `${day >= 0 ? '▲' : '▼'} ${pct(Math.abs(dayBase ? day / dayBase : 0), 2)}` : 'refresh prices to see', { tone: dayN ? tone(day) : '', href: '#/equity' }),
    kpi('Gold rate', last ? money(last.rate) + '/g' : '–', last ? (oldGold ? 'old, ' : 'set ') + ageText(last.date) : '', { tone: oldGold ? 'warn' : '', href: '#/gold' }),
    kpi('Bank cash lasts', rw.months == null ? '–' : dec(rw.months, 1) + ' months', rw.coverage != null ? `interest pays ${pct(rw.coverage, 0)} of expenses` : '', { href: '#/flow' }));
}

function allocation(all) {
  const rows = all.rows.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount).map((r) => ({ label: r.type, value: r.amount }));
  const byRisk = RISK_ORDER.map((r) => ({ label: r, value: all.exposure.filter((e) => e.risk === r).reduce((a, e) => a + e.capital, 0) })).filter((x) => x.value > 0);
  return section('Where your money is', h('div', { class: 'alloc' },
    h('div', { class: 'alloc-main' }, donut(rows, { fmt: money, center: compact(all.totalAssets), sub: 'total assets' }), legend(rows, { fmt: money })),
    h('div', { class: 'alloc-risk' },
      h('p', { class: 'mini-title' }, 'How risky is it'),
      strip(byRisk, { fmt: money }), legend(byRisk, { fmt: money })),
    h('details', { class: 'more' }, h('summary', null, 'Show exposure by type'),
      rowList(all.exposure.slice().sort((a, b) => b.capital - a.capital).map((e) => ({
        title: e.type, sub: e.risk + ' risk', value: money(e.capital), valueSub: pct(e.pct),
      }))))));
}

function earning(all) {
  const cf = all.cfTotal;
  const max = Math.max(1, ...all.cashflow.map((r) => r.perMonth));
  return section('Interest you earn', h('div', null,
    h('div', { class: 'trio' },
      h('div', null, h('span', { class: 'mini-title' }, 'a day'), h('b', null, money(cf.perDay))),
      h('div', null, h('span', { class: 'mini-title' }, 'a month'), h('b', null, money(cf.perMonth))),
      h('div', null, h('span', { class: 'mini-title' }, 'a year'), h('b', null, compact(cf.perYear)))),
    rowList(all.cashflow.filter((r) => r.capital > 0).sort((a, b) => b.perMonth - a.perMonth).map((r) => ({
      title: r.name, sub: `${compact(r.capital)} invested · ${pct(r.yield, 1)} a year`,
      value: money(r.perMonth) + ' /mo', valueSub: money(r.perDay) + ' a day',
      extra: h('span', { class: 'rl-bar' }, h('span', { style: { width: Math.max(2, (r.perMonth / max) * 100) + '%' } })),
    })))));
}

function returnsCard(data, all) {
  const rets = C.returns(data, all);
  const cov = C.overallXirr(data, all, rets);
  const items = rets.map((r) => {
    const showRet = !(r.ret == null || r.name.includes('lending') || r.name === 'Bonds');
    return {
      title: r.name, sub: `${compact(r.invested)} in → ${compact(r.value)} now`,
      value: h('span', { class: tone(r.gain) }, `${r.gain >= 0 ? '▲' : '▼'} ${compact(Math.abs(r.gain))}`),
      valueSub: [showRet ? pct(r.ret) : null, r.xirr == null ? null : `XIRR ${pct(r.xirr)}`].filter(Boolean).join(' · ') || null,
    };
  });
  return section('How your investments did', h('div', null, rowList(items),
    h('p', { class: 'note' }, 'XIRR is the yearly return that accounts for when each rupee went in. It needs dated cash flows, so shares and funds show plain return until buy dates are added. XIRR rows cover ' + pct(cov.coverage, 0) + ' of your assets. Bond and lending XIRR assume coupons arrive on schedule.')));
}

function comingUp(data, all) {
  const soon = C.upcoming(data, all, 60);
  const overdue = soon.filter((u) => u.days < 0).length;
  return section('Coming up', h('div', null,
    rowList(soon.slice(0, 8).map((u) => ({
      lead: dateChip(u.date), title: u.title, sub: `${u.kind} · ${u.days < 0 ? 'overdue' : u.days === 0 ? 'today' : `in ${u.days} day${u.days === 1 ? '' : 's'}`}`,
      value: money(u.amount), tone: u.days < 0 ? 'neg' : '',
    })), { empty: 'Nothing falls due in the next 60 days.' }),
    soon.length > 8 ? h('p', { class: 'note' }, `${soon.length - 8} more in the next 60 days.`) : null,
    overdue ? null : (data.receivables.length ? h('p', { class: 'note' }, 'No money to receive is overdue.') : null)));
}

function thisMonth(data, all, months) {
  const mc = C.monthCashflow(data, all, selMonth);
  const spend = mc.spend.concat([mc.lifestyle]).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const spent = mc.totalSpent + mc.lifestyle.amount;
  const got = mc.totalExpected ? Math.min(1, mc.totalReceived / mc.totalExpected) : 0;
  return section('This month', h('div', { class: 'month' },
    h('div', null,
      h('p', { class: 'mini-title' }, 'Income'),
      h('p', { class: 'big-line' }, h('b', null, money(mc.totalReceived)), h('span', { class: 'muted' }, ` of ${money(mc.totalExpected)} expected`)),
      h('div', { class: 'pbar' }, h('span', { style: { width: (got * 100).toFixed(1) + '%' } })),
      rowList(mc.income.map((r) => ({
        title: r.name, sub: 'expected ' + money(r.expected), value: money(r.received),
        valueSub: r.expected - r.received > 0 ? h('span', { class: 'warn' }, money(r.expected - r.received) + ' pending') : '✓ received',
      })))),
    h('div', null,
      h('p', { class: 'mini-title' }, 'Expenses'),
      h('p', { class: 'big-line' }, h('b', null, money(spent)), h('span', { class: 'muted' }, ' spent')),
      spend.length ? hbars(spend.map((s) => ({ label: s.name, value: s.amount })), { fmt: money, colorIndex: 1 }) : h('p', { class: 'empty' }, 'No expenses recorded in this month.'),
      h('p', { class: 'summary-line' }, 'Expected income left after expenses ', h('b', { class: tone(mc.totalExpected - spent) }, money(mc.totalExpected - spent))))),
    [monthPicker(months, selMonth, (m) => { selMonth = m; rerender(); })]);
}

function networthChart(series, data) {
  if (series.length < 3) return null;
  const first = series[0], last = series[series.length - 1];
  return section('Net worth over time', h('div', null,
    lineChart({ labels: series.map((p) => shortDate(p.date)), series: [{ name: 'Net worth', values: series.map((p) => p.value) }], fmt: money, height: 220, width: window.innerWidth < 640 ? 380 : 470, yMin: Math.min(...series.map((p) => p.value)) * 0.97, area: true }),
    h('p', { class: 'note' }, `Up ${money(last.value - first.value)} since ${dateStr(first.date)}. Early points are your month-end figures from the Plan sheet. From now on the app saves a reading each day you open it.`)));
}

export function render() {
  const { all, data } = S;
  const months = C.ledgerMonths(data);
  const cur = C.monthKey(all.asOf);
  if (!selMonth || !months.includes(selMonth)) selMonth = months.includes(cur) ? cur : months[months.length - 1];
  const series = C.netWorthSeries(data, all);
  const place = (el, cls) => { if (el) el.classList.add(cls); return el; };
  const root = h('div', { class: 'page dash' });
  root.append(
    hero(all, series), tiles(all, data),
    place(thisMonth(data, all, months), 'span-7'), place(comingUp(data, all), 'span-5'),
    place(allocation(all), 'span-7'), place(earning(all), 'span-5'),
    place(returnsCard(data, all), 'span-7'), place(networthChart(series, data), 'span-5'));
  return root;
}
