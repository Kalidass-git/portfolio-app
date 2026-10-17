// Home: a dashboard of cards. The detail tables live on each asset screen.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, section, monthPicker, rowList, kpi, dateChip, btn, canEdit, dec, toast, dialog } from '../ui.js';
import { strip, legend, hbars, lineChart, donut, spark, color } from '../charts.js';
import * as R from '../risk.js';
import { rateHistory, ageText } from './gold.js';
import { homeCard as loansCard } from './loans.js';

let selMonth = null;
const rerender = () => window.dispatchEvent(new Event('rerender'));
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const shortDate = (d) => dateStr(d).replace(/ (\d\d)(\d\d)$/, " '$2");
const sgp = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pct(Math.abs(n), 2);
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const RISK_ORDER = ['Safe', 'Medium', 'Medium High', 'High'];

function hero(all, series, ox) {
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
          h('div', null, h('dt', null, 'Loans'), h('dd', null, compact(all.liabTotal))),
          ox && ox.xirr != null ? h('div', { title: `Yearly return counting when each rupee went in, over gold, bonds, deposits, lending, EPF/PPF, shares, funds and anything you closed. Covers ${pct(ox.coverage, 0)} of your assets.` }, h('dt', null, 'Overall XIRR'), h('dd', { class: tone(ox.xirr) }, pct(ox.xirr, 1))) : null,
          ox && ox.xirrNoPf != null && Math.abs(ox.xirrNoPf - ox.xirr) > 0.002 ? h('div', { title: 'The same, leaving out EPF and PPF, which are long, steady savings.' }, h('dt', null, 'Without EPF/PPF'), h('dd', { class: tone(ox.xirrNoPf) }, pct(ox.xirrNoPf, 1))) : null,
          null))));
}

const isEtf = (x) => x.assetClass && x.assetClass !== 'equity';
/** Shares, ETFs and funds as three groups with one total. */
function marketGroups(all) {
  const mk = (name, items) => {
    const priced = items.filter((x) => x.day != null);
    const day = priced.reduce((a, x) => a + x.day, 0), base = priced.reduce((a, x) => a + x.current - x.day, 0);
    const invested = items.reduce((a, x) => a + x.invested, 0), current = items.reduce((a, x) => a + x.current, 0);
    return { name, count: items.length, invested, current, gain: current - invested, ret: invested ? (current - invested) / invested : 0, day, dayPct: base ? day / base : 0, hasDay: priced.length > 0 };
  };
  const rows = [mk('Shares', all.stocks.items.filter((x) => !isEtf(x))), mk('ETFs', all.stocks.items.filter(isEtf)), mk('Mutual funds', all.mf.items)].filter((r) => r.count);
  const total = mk('Total', all.stocks.items.concat(all.mf.items));
  return { rows, total };
}

const mqDesk = () => window.matchMedia('(min-width: 900px)').matches;
const closeTiles = () => document.querySelectorAll('.kpi.open').forEach((k) => k.classList.remove('open'));
if (!window.__tileClose) {
  window.__tileClose = true;
  document.addEventListener('click', (e) => { document.querySelectorAll('.kpi.open').forEach((k) => { if (!k.contains(e.target)) k.classList.remove('open'); }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTiles(); });
}
/** A summary tile. On a computer it opens a drop-down with the detail; on a phone it goes to the page. */
function tile(label, value, sub, { tone: t = '', href = null, pop = null, right = false } = {}) {
  const el = kpi(label, value, sub, { tone: t });
  el.classList.add('tap'); el.tabIndex = 0; el.setAttribute('role', pop ? 'button' : 'link');
  const go = () => {
    if (pop && mqDesk()) { const open = !el.classList.contains('open'); closeTiles(); el.classList.toggle('open', open); el.setAttribute('aria-expanded', String(open)); }
    else if (href) location.hash = href;
  };
  el.addEventListener('click', (e) => { if (!e.target.closest('.kpi-pop')) go(); });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.kpi-pop')) { e.preventDefault(); go(); } });
  if (pop) { el.classList.add('has-pop'); if (right) el.classList.add('pop-right'); el.append(h('span', { class: 'kpi-caret', 'aria-hidden': 'true' }, '▾'), h('div', { class: 'kpi-pop' }, pop)); }
  return el;
}

function tiles(all, data, mc) {
  const mk = marketGroups(all), gd = all.gold.day;
  const dayAll = mk.total.day + (gd ? gd.total : 0);
  const anyDay = mk.total.hasDay || !!gd;
  const baseAll = (mk.total.dayPct ? mk.total.day / mk.total.dayPct : 0) + (gd ? all.gold.value - gd.total : 0);
  const dayPctAll = baseAll ? dayAll / baseAll : 0;
  const spent = mc.totalSpent + mc.lifestyle.amount;
  return h('div', { class: 'kpis span-12' },
    tile('Net monthly inflow', money(all.netMonthly), `${money(all.cfTotal.perMonth)} earned − ${money(all.loans.monthlyInterest)} loan interest`, { tone: tone(all.netMonthly), href: '#/fixed/loans' }),
    tile('Earning every day', money(all.cfTotal.perDay), `${money(all.cfTotal.perDay - all.loans.monthlyInterest / 30)} after loan interest`, { href: '#/fixed', pop: h('div', null, earningBody(all, false), h('p', null, h('a', { href: '#/fixed' }, 'Open Fixed income'))) }),
    tile('Markets today', anyDay ? sgn(dayAll) : '–', anyDay ? `${sgp(dayPctAll)} · shares, funds, ETFs, gold` : 'refresh prices to see', { tone: anyDay ? tone(dayAll) : '', href: '#/equity', pop: h('div', null, todayBody(all), h('p', null, h('a', { href: '#/equity' }, 'Open Shares & funds'))) }),
    tile('Spent this month', money(spent), (mc.totalExpected ? `${pct(spent / mc.totalExpected, 0)} of ${money(mc.totalExpected)} budget` : 'no budget income yet') + (mc.notCounted > 0 ? ` · ${compact(mc.notCounted)} not counted` : ''), { tone: mc.totalExpected && spent > mc.totalReceived ? 'neg' : '', href: '#/flow', pop: spentBody(mc, spent), right: true }));
}

/** Short expense summary for the drop-down. */
function spentBody(mc, spent) {
  const top = mc.spend.concat([mc.lifestyle]).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const exp = mc.totalExpected;
  return h('div', null,
    h('p', { class: 'mini-title' }, 'Biggest spends so far'),
    top.length ? rowList(top.map((x) => ({ title: x.name, value: money(x.amount), valueSub: spent ? pct(x.amount / spent, 0) : null }))) : h('p', { class: 'empty' }, 'No expenses recorded this month.'),
    h('p', { class: 'summary-line' }, 'Spent ', h('b', null, money(spent)), exp ? ' of ' + money(exp) + ' budget · left ' : null, exp ? h('b', { class: tone(exp - spent) }, sgn(exp - spent)) : null),
    mc.notCounted > 0 ? h('p', { class: 'note' }, `${money(mc.notCounted)} of other payments (${mc.others.filter((o) => !o.counted).map((o) => o.name).join(', ')}) is not counted here. Open “Review” under This month in detail to count them.`) : null,
    h('p', null, h('a', { href: '#/flow' }, 'See where it went')));
}

/** Money you are waiting for this month, and anything overdue. */
function toReceiveCard(data, all) {
  const monthEnd = C.addMonths(C.monthStart(all.asOf), 1);
  const rows = data.receivables.filter((x) => x.active !== false && x.balanceDue > 0).map((x) => C.receivableStatus(x, all.asOf))
    .filter((r) => !r.received && !r.notStarted && r.due < monthEnd).sort((a, b) => (a.due < b.due ? -1 : 1));
  const mc = C.monthCashflow(data, all, C.monthKey(all.asOf));
  const pend = mc.income.filter((x) => x.expected - x.received > 1).map((x) => ({ due: null, name: x.name, expected: x.expected - x.received, income: true, sub: `expected ${money(x.expected)}, received ${money(x.received)}` }));
  const total = rows.reduce((a, r) => a + (r.expected || 0), 0) + pend.reduce((a, r) => a + r.expected, 0), over = rows.filter((r) => r.overdue);
  const all2 = rows.concat(pend);
  return section('Money to receive this month', h('div', null,
    all2.length ? rowList(all2.map((r) => r.income ? { title: r.name, sub: r.sub, value: money(r.expected), valueSub: h('span', { class: 'warn' }, 'pending') } : ({
      lead: dateChip(r.due), title: r.name, sub: r.overdue ? h('span', { class: 'neg' }, 'Overdue since ' + shortDate(r.due)) : r.dueToday ? h('span', { class: 'warn' }, 'Due today') : 'Due ' + shortDate(r.due),
      value: money(r.expected || 0), tone: r.overdue ? 'neg' : r.dueToday ? 'warn' : '',
    }))) : h('p', { class: 'empty' }, 'Everything due this month has been received.'),
    all2.length ? h('p', { class: 'summary-line' }, `Waiting for ${money(total)}`, over.length ? h('span', { class: 'neg' }, ` · ${over.length} overdue`) : null, rows.some((r) => r.dueToday) ? h('span', { class: 'warn' }, ` · ${rows.filter((r) => r.dueToday).length} due today`) : null) : null,
    h('p', null, h('a', { href: '#/fixed' }, 'Open Fixed income'))));
}

function todayBody(all) {
  const mk = marketGroups(all), gd = all.gold.day;
  const rows = mk.rows.filter((r) => r.hasDay).map((r) => ({ title: r.name, sub: sgp(r.dayPct), value: h('span', { class: tone(r.day) }, sgn(r.day)) }));
  if (gd) rows.push({ title: 'Gold', sub: `${sgp(gd.pct)} · ${money(all.gold.rate)}/g (${sgn(gd.perGram)})`, value: h('span', { class: tone(gd.total) }, sgn(gd.total)) });
  const total = rows.length ? mk.total.day + (gd ? gd.total : 0) : null;
  return h('div', null,
    rows.length ? rowList(rows) : h('p', { class: 'empty' }, 'Press Refresh prices on Shares & funds to see today’s change.'),
    total != null ? h('p', { class: 'summary-line' }, 'All together ', h('b', { class: tone(total) }, sgn(total)), (() => { const b = (mk.total.dayPct ? mk.total.day / mk.total.dayPct : 0) + (gd ? all.gold.value - gd.total : 0); return b ? h('span', { class: tone(total) }, ' (' + sgp(total / b) + ')') : null; })()) : null,
    gd ? null : h('p', { class: 'note' }, 'Gold today appears after a price refresh.'));
}
/** Phone only: on a computer this lives in the "Markets today" tile. */
const todayCard = (all) => section('Today', todayBody(all));

function breakupCard(all) {
  const { rows, total } = marketGroups(all);
  const line = (r, bold) => ({ title: bold ? h('b', null, r.name) : r.name, sub: `${money(r.invested)} in → ${money(r.current)} now`, value: h('span', { class: tone(r.gain) }, `${r.gain >= 0 ? '▲' : '▼'} ${money(Math.abs(r.gain))}`), valueSub: pct(r.ret) });
  return section('Shares, ETFs & funds: how each did', h('div', null, rowList(rows.map((r) => line(r)).concat([line(total, true)])),
    h('p', { class: 'note' }, 'Gain is today’s value minus what you put in. Details are on each tab under Shares & funds.')));
}

/** Things that need a look: overdue money, old prices, loans, behind plan. */
function attention(data, all) {
  const out = [];
  const soon = C.upcoming(data, all, 30).filter((u) => u.kind !== 'Loan EMI'), overdue = soon.filter((u) => u.days < 0);
  const emis = C.loanDues(data, all.asOf).filter((d) => !d.paid && d.days <= 7);
  const emiLate = emis.filter((d) => d.status === 'overdue'), emiSoon = emis.filter((d) => d.status !== 'overdue');
  if (emiLate.length) out.push({ title: `${emiLate.length} loan EMI${emiLate.length === 1 ? '' : 's'} overdue`, sub: emiLate.map((d) => `${d.name} (was due ${dateStr(d.date)})`).join(', '), value: money(emiLate.reduce((a, d) => a + d.emi, 0)), tone: 'neg', href: '#/fixed/loans' });
  if (emiSoon.length) out.push({ title: emiSoon.length === 1 ? `${emiSoon[0].name} EMI: ${emiSoon[0].days === 0 ? 'due today' : emiSoon[0].days === 1 ? 'due tomorrow' : 'due in ' + emiSoon[0].days + ' days'}` : `${emiSoon.length} loan EMIs due within a week`, sub: emiSoon.map((d) => `${d.name} · ${d.days === 0 ? 'today' : dateStr(d.date).replace(/ \d{4}$/, '')}`).join(', '), value: money(emiSoon.reduce((a, d) => a + d.emi, 0)), tone: 'warn', href: '#/fixed/loans' });
  if (overdue.length) out.push({ title: `${overdue.length} payment${overdue.length === 1 ? '' : 's'} overdue`, sub: overdue.slice(0, 2).map((u) => u.title).join(', '), value: money(overdue.reduce((a, u) => a + u.amount, 0)), tone: 'neg', href: '#/fixed/lending' });
  const due = soon.filter((u) => u.days >= 0 && u.days <= 14);
  const when = (u) => (u.days === 0 ? 'today' : u.days === 1 ? 'tomorrow' : dateStr(u.date).replace(/ \d{4}$/, ''));
  if (due.length) out.push({ title: due.length === 1 ? `${due[0].title}: due ${when(due[0])}` : `${due.length} falling due in 14 days`, sub: due.slice(0, 3).map((u) => `${u.title} · ${when(u)}`).join(', ') + (due.length > 3 ? ` and ${due.length - 3} more` : ''), value: money(due.reduce((a, u) => a + u.amount, 0)), tone: due.some((u) => u.days === 0) ? 'warn' : '', href: due.every((u) => u.kind === 'Money to receive') ? '#/fixed/lending' : '#/home' });
  const at = data.settings.pricesUpdatedAt;
  const age = at ? Math.round((Date.now() - new Date(at).getTime()) / 864e5) : null;
  if (age == null || age >= 3) out.push({ title: 'Share and fund prices are ' + (age == null ? 'not fetched yet' : age + ' days old'), sub: 'Refresh on Shares & funds', value: '', tone: 'warn', href: '#/equity' });
  if (all.loans.monthlyInterest > all.cfTotal.perMonth) out.push({ title: 'Loan interest is more than the interest you earn', sub: `${money(all.loans.monthlyInterest)} out, ${money(all.cfTotal.perMonth)} in each month`, value: '', tone: 'neg', href: '#/fixed/loans' });
  return out.length ? section('Needs a look', rowList(out.map((o) => ({ title: o.title, sub: o.sub, value: o.value, tone: o.tone, onClick: () => { location.hash = o.href; } })))) : null;
}

function allocation(all) {
  const rows = all.rows.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount).map((r) => ({ label: r.type, value: r.amount }));
  // risk groups and limits come from the settings on the Wealth projector > Risk limits tab
  const cfg = R.riskCfg(S.data), ev = R.evaluate(cfg, R.stateNow(S.data, all));
  const byRisk = ev.buckets.filter((b) => b.value > 0).map((b) => ({ label: b.name, value: b.value }));
  const pc1 = (x) => (Math.round(x * 1000) / 10) + '%';
  const ofw = (b) => (b.kind === 'item' ? ' ' + R.ofText(b.base) : b.of && b.of !== 'total' ? ' ' + R.ofText(b.of) : '');
  const lim = (b) => [b.max != null ? pc1(b.max) : null, b.maxAmt != null ? money(b.maxAmt) : null].filter(Boolean).join(' or ');
  const kindWord = (b) => (b.kind === 'item' ? 'single holding' : b.kind === 'bucket' ? 'risk group' : 'kind of holding');
  const flags = ev.breaches.map((b) => ({ title: b.name, sub: `${kindWord(b)}, limit ${lim(b)}`, value: h('span', { class: 'neg' }, 'over by ' + money(b.excess)), valueSub: h('span', { class: 'neg' }, pc1(b.pct) + ofw(b)), tone: 'neg' }));
  const nears = ev.near.map((b) => ({ title: b.name, sub: `${kindWord(b)}, limit ${lim(b)}`, value: h('span', { class: 'warn' }, Math.round(b.used * 100) + '% used'), valueSub: h('span', { class: 'warn' }, `${money(b.room || 0)} left`) }));
  const toneCls = (b) => (b.over ? 'neg' : b.near ? 'warn' : '');
  const limited = ev.classes.filter((c) => c.value > 1 || c.max != null).sort((a, b) => b.value - a.value);
  return section('Where your money is', h('div', { class: 'alloc' },
    h('div', { class: 'alloc-main' }, donut(rows, { fmt: money, center: compact(all.totalAssets), sub: 'total assets' }), legend(rows, { fmt: money })),
    h('div', { class: 'alloc-risk' },
      h('p', { class: 'mini-title' }, 'How risky is it'),
      strip(byRisk, { fmt: money }),
      h('ul', { class: 'legend' }, ev.buckets.filter((b) => b.value > 0).map((b, i) => h('li', null, h('i', { style: { background: color(i) } }), h('span', { class: 'lg-name' }, b.name), h('span', { class: 'lg-val' }, money(b.value)), h('span', { class: 'lg-pct ' + toneCls(b) }, pc1(b.pct))))),
      flags.length ? [h('p', { class: 'mini-title neg' }, `${flags.length} over your limit${flags.length > 1 ? 's' : ''}`), rowList(flags.slice(0, 4))] : null,
      nears.length ? [h('p', { class: 'mini-title warn' }, `${nears.length} close to a limit`), rowList(nears.slice(0, 4))] : null,
      !flags.length && !nears.length ? h('p', { class: 'note' }, 'Everything is within the limits you set.') : null,
      h('p', null, h('a', { href: '#/risk/limits' }, 'Set limits'), ' · ', h('a', { href: '#/risk/whatif' }, 'Try a what-if'))),
    h('details', { class: 'more' }, h('summary', null, 'Show by kind of holding'),
      rowList(limited.map((c) => ({ title: c.name, sub: (cfg.buckets.find((b) => b.id === c.bucket) || {}).name + (c.max != null || c.maxAmt != null ? ` · limit ${lim(c)}` : ''), value: money(c.value), valueSub: h('span', { class: toneCls(c) }, pc1(c.pct) + (c.over ? ' over' : c.near ? ' close' : '')) }))))));
}

function earningBody(all, fold) {
  const cf = all.cfTotal, ln = all.loans;
  const rows = all.cashflow.filter((r) => r.capital > 0).sort((a, b) => b.perDay - a.perDay);
  const max = Math.max(1, ...rows.map((r) => r.perDay));
  const out = ln.monthlyInterest / 30;
  const list = rowList(rows.map((r) => ({
    title: r.name, sub: `${compact(r.capital)} invested · ${pct(r.yield, 1)} a year`,
    value: money(r.perDay) + ' /day', valueSub: money(r.perMonth) + ' a month',
    extra: h('span', { class: 'rl-bar' }, h('span', { style: { width: Math.max(2, (r.perDay / max) * 100) + '%' } })),
  })).concat(out > 0 ? [{ title: 'Loan interest you pay', sub: `${money(ln.total)} borrowed · ${pct(ln.avgRate, 1)} a year`, value: h('span', { class: 'neg' }, '− ' + money(out) + ' /day'), valueSub: h('span', { class: 'neg' }, '− ' + money(ln.monthlyInterest) + ' a month') }] : []));
  return h('div', null,
    h('div', { class: 'trio' },
      h('div', null, h('span', { class: 'mini-title' }, 'a day'), h('b', { class: 'pos' }, money(cf.perDay))),
      h('div', null, h('span', { class: 'mini-title' }, 'a month'), h('b', { class: 'pos' }, money(cf.perMonth))),
      h('div', null, h('span', { class: 'mini-title' }, 'a year'), h('b', { class: 'pos' }, compact(cf.perYear)))),
    h('p', { class: 'summary-line' }, 'After loan interest ', h('b', { class: tone(cf.perDay - out) }, money(cf.perDay - out) + ' a day')),
    fold ? h('details', { class: 'more' }, h('summary', null, `Show the ${rows.length} sources`), list) : list,
    h('p', { class: 'note' }, 'Covers EPF, PPF, chits, RD and LIC, bonds, fixed deposits and private lending. Shares, funds and gold pay no fixed interest, so they are not counted.'));
}
/** Phone only: on a computer this lives in the "Earning every day" tile. Sources are folded away to keep it short. */
const earning = (all) => section('Earning every day', earningBody(all, true));

function returnsCard(data, all, rets, cov) {
  const items = rets.map((r) => {
    const showRet = !(r.ret == null || r.name.includes('lending') || r.name === 'Bonds');
    return {
      title: r.name, sub: `${compact(r.invested)} in → ${compact(r.value)} now`,
      value: h('span', { class: tone(r.gain) }, `${r.gain >= 0 ? '▲' : '▼'} ${compact(Math.abs(r.gain))}`),
      valueSub: [showRet ? pct(r.ret) : null, r.xirr == null ? null : `XIRR ${r.estimated ? '≈ ' : ''}${pct(r.xirr)}`].filter(Boolean).join(' · ') || null,
    };
  });
  return section('How your investments did', h('div', null, rowList(items),
    h('p', { class: 'note' }, 'XIRR is the yearly return that accounts for when each rupee went in. It needs dated cash flows, so shares and funds show plain return until buy dates are added. XIRR rows cover ' + pct(cov.coverage, 0) + ' of your assets.' + (cov.xirr != null ? ' Overall XIRR across everything with dates is ' + pct(cov.xirr, 1) + (cov.xirrNoPf != null ? ' (' + pct(cov.xirrNoPf, 1) + ' without EPF and PPF)' : '') + '. It is money-weighted: long-held money, such as EPF at a steady rate, counts for more than newer money.' : '') + ' Bond and lending XIRR assume coupons arrive on schedule. “≈” marks an estimate from an assumed rate (chits and savings); it is left out of the overall figure until the chit is closed with the real amount.')));
}

function comingUp(data, all) {
  const soon = C.upcoming(data, all, 60);
  const overdue = soon.filter((u) => u.days < 0).length;
  return section('Coming up', h('div', null,
    rowList(soon.slice(0, 8).map((u) => ({
      lead: dateChip(u.date), title: u.title, sub: h('span', { class: u.days === 0 ? 'warn' : '' }, `${u.kind} · ${u.days < 0 ? 'overdue' : u.days === 0 ? 'due today' : `in ${u.days} day${u.days === 1 ? '' : 's'}`}`),
      value: money(u.amount), tone: u.days < 0 ? 'neg' : u.days === 0 ? 'warn' : '',
    })), { empty: 'Nothing falls due in the next 60 days.' }),
    soon.length > 8 ? h('p', { class: 'note' }, `${soon.length - 8} more in the next 60 days.`) : null,
    soon.filter((u) => u.kind === 'Money to receive' && u.days < 0).length ? null : (data.receivables.length ? h('p', { class: 'note' }, 'No money to receive is overdue.') : null)));
}

function thisMonth(data, all, months) {
  const mc = C.monthCashflow(data, all, selMonth);
  const isCur = selMonth === C.monthKey(all.asOf);
  const spend = mc.spend.concat([mc.lifestyle]).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const spent = mc.totalSpent + mc.lifestyle.amount, exp = mc.totalExpected, rec = mc.totalReceived;
  const pend = Math.max(0, exp - rec), left = exp - spent;
  const got = exp ? Math.min(1, rec / exp) : 0;
  const bar = (v, of, cls) => h('div', { class: 'pbar ' + (cls || '') }, h('span', { style: { width: (of > 0 ? Math.min(100, Math.max(0, (v / of) * 100)) : 0).toFixed(1) + '%' } }));
  const asOf = new Date(all.asOf), day = asOf.getUTCDate(), dim = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)).getUTCDate();
  const pace = exp ? exp * (day / dim) : 0;
  const budget = h('div', { class: 'budget-box' },
    h('div', { class: 'trio' },
      h('div', null, h('span', { class: 'mini-title' }, 'Budget (expected)'), h('b', null, money(exp))),
      h('div', null, h('span', { class: 'mini-title' }, 'Received'), h('b', { class: 'pos' }, money(rec))),
      h('div', null, h('span', { class: 'mini-title' }, 'Spent'), h('b', { class: spent > rec ? 'neg' : '' }, money(spent)))),
    h('p', { class: 'mini-title' }, `Spent ${money(spent)} of ${money(exp)} budget` + (exp ? ` (${pct(spent / exp, 0)})` : '')), bar(spent, exp, spent > exp ? 'bad' : spent > rec ? 'warn' : ''),
    h('p', { class: 'summary-line' }, 'Left to spend from budget ', h('b', { class: tone(left) }, sgn(left)), pend > 0 ? h('span', { class: 'muted' }, ` · ${money(pend)} still to receive`) : null),
    isCur && exp && spent > pace * 1.15 && day < dim - 3 ? h('p', { class: 'note warn' }, `Spending is ahead of the month: ${money(spent)} spent by day ${day}, an even pace would be about ${money(pace)}.`) : null);
  const toggle = (o, on) => mutate((d) => { const set = new Set((d.settings.homeSpendExtra || []).map((x) => String(x).toLowerCase())); on ? set.add(o.key) : set.delete(o.key); d.settings.homeSpendExtra = [...set]; });
  const review = () => {
    const box = (o) => h('label', { class: 'check-inline', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: o.counted, disabled: !canEdit(), onchange: (e) => toggle(o, e.target.checked) }), ' count in Spent');
    dialog('Other payments in ' + monthLabel(selMonth), h('div', null,
      h('p', { class: 'note' }, 'Spent adds up groceries, outside food, medical, travel, rent, utilities and the clothes, entertainment, vacation and gifts line. These other payments from your bank entries are not in it unless you tick them. Investments, transfers and income are never counted as spending.'),
      rowList(mc.others.map((o) => ({ title: o.name, sub: `${o.count} ${o.count === 1 ? 'entry' : 'entries'}`, value: money(o.amount), valueSub: canEdit() ? box(o) : (o.counted ? 'counted' : 'not counted') }))),
      canEdit() ? null : h('p', { class: 'note' }, 'Only the owner can change this.')), [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
  };
  const others = mc.others.length ? h('p', { class: 'note' }, mc.notCounted > 0 ? `${money(mc.notCounted)} of other payments is not counted in Spent. ` : 'All other payments are counted in Spent. ', h('a', { href: 'javascript:void 0', onclick: (e) => { e.preventDefault(); review(); } }, 'Review')) : null;
  return section(isCur ? 'This month in detail' : monthLabel(selMonth) + ' in detail', h('div', null,
    budget, others,
    h('div', { class: 'month' },
      h('div', null,
        h('p', { class: 'mini-title' }, 'Income'),
        h('p', { class: 'big-line' }, h('b', null, money(rec)), h('span', { class: 'muted' }, ` of ${money(exp)} expected`)),
        bar(rec, exp, 'good'),
        rowList(mc.income.map((r) => ({
          title: r.name, sub: 'expected ' + money(r.expected), value: money(r.received),
          valueSub: r.expected - r.received > 0 ? h('span', { class: 'warn' }, money(r.expected - r.received) + ' pending') : '✓ received',
        })))),
      h('div', null,
        h('p', { class: 'mini-title' }, 'Expenses'),
        h('p', { class: 'big-line' }, h('b', null, money(spent)), h('span', { class: 'muted' }, ' spent')),
        spend.length ? hbars(spend.map((s) => ({ label: s.name, value: s.amount })), { fmt: money, colorIndex: 1 }) : h('p', { class: 'empty' }, 'No expenses recorded in this month.'),
        h('p', null, h('a', { href: '#/flow' }, 'See where it went'))))),
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
  const rets = C.returns(data, all), ox = C.overallXirr(data, all, rets);
  const place = (el, ...cls) => { if (el) el.classList.add(...cls); return el; };
  const root = h('div', { class: 'page dash' });
  const parts = [
    hero(all, series, ox), tiles(all, data, C.monthCashflow(data, all, C.monthKey(all.asOf))),
    place(attention(data, all), 'span-12'),
    place(toReceiveCard(data, all), 'span-6'), place(comingUp(data, all), 'span-6'),
    place(thisMonth(data, all, months), 'span-12'),
    place(todayCard(all), 'm-only'), place(earning(all), 'm-only'),
    place(breakupCard(all), 'span-7'), place(loansCard(all), 'span-5'),
    place(allocation(all), 'span-7'), place(networthChart(series, data), 'span-5'),
    place(returnsCard(data, all, rets, ox), 'span-12')];
  root.append(...parts.filter(Boolean));
  return root;
}
