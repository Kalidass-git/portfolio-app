// Home: a dashboard of cards. The detail tables live on each asset screen.
import { evalAlerts } from '../watch.js';
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, section, monthPicker, rowList, kpi, dateChip, btn, canEdit, dec, toast, dialog } from '../ui.js';
import { strip, legend, hbars, lineChart, donut, spark, color, riskColor } from '../charts.js';
import * as R from '../risk.js';
import { rateHistory, ageText } from './gold.js';
import { GROUPS } from './groupmix.js';
import { allocationBody } from './allocview.js';
import { monthPlan } from '../monthinvest.js';
import * as P from '../projector.js';

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

/** The pieces of the investable balance, one line each: bank, cash in hand, interest still to come, chits still to pay and the projected expenses. */
function investableBody(m) {
  const mand = m.mandatory, pr = m.proj;
  return h('div', null,
    rowList([
      { title: 'Bank balance', sub: m.banks.length ? m.banks.map((a) => a.name).join(', ') : 'no bank account', value: money(m.bank) },
      { title: 'Cash in hand', sub: m.wallets.length ? m.wallets.map((w) => w.name).join(', ') : 'no wallet or cash account marked', value: money(m.cash) },
      { title: 'Interest income still expected', sub: 'bonds and lending still to come this month', value: h('span', { class: 'pos' }, '+ ' + money(m.interest)) },
      { title: 'Pending mandatory investments', sub: `${mand.pending.length} chit${mand.pending.length === 1 ? '' : 's'} and gold chit${mand.pending.length === 1 ? '' : 's'} not paid yet`, value: '− ' + money(mand.total) },
      { title: 'Expenses still to come', sub: h('i', null, `projected: ${pr.left} day${pr.left === 1 ? '' : 's'} left at the pace so far, no rent`), value: h('i', { class: 'neg' }, '− ' + money(pr.total)) },
      { title: 'Investable balance', value: h('b', { class: m.current >= 0 ? 'inv' : 'neg' }, money(m.current)) },
    ]),
    h('p', { class: 'note' }, 'Bank balance + cash in hand + interest still expected − pending mandatory investments − projected expenses. Mark an account as a wallet in its settings (or name it wallet or cash) to count it as cash in hand.'));
}
const showInvestable = (m) => dialog('Investable balance', investableBody(m), [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);

/** Blue Investable balance tile: on a phone a tap opens the breakdown, on a desktop it drops down. */
function place2(el, plan) { el.classList.add('blue'); el.addEventListener('click', (e) => { if (!mqDesk() && !e.target.closest('.kpi-pop')) showInvestable(plan); }); return el; }
function tiles(all, data, mc, plan) {
  const mk = marketGroups(all), gd = all.gold.day;
  const dayAll = mk.total.day + (gd ? gd.total : 0);
  const anyDay = mk.total.hasDay || !!gd;
  const baseAll = (mk.total.dayPct ? mk.total.day / mk.total.dayPct : 0) + (gd ? all.gold.value - gd.total : 0);
  const dayPctAll = baseAll ? dayAll / baseAll : 0;
  const spent = mc.totalSpent + mc.lifestyle.amount;
  return h('div', { class: 'kpis span-12' },
    plan ? place2(tile('Investable balance', money(plan.current), `bank ${money(plan.bank)} + cash ${money(plan.cash)} + interest ${money(plan.interest)} − chits − expenses`, { tone: plan.current >= 0 ? 'inv' : 'neg', pop: investableBody(plan) }), plan)
      : tile('Net monthly inflow', money(all.netMonthly), h('span', null, `${money(all.cfTotal.perMonth)} earned `, all.loans.monthlyInterest > 0 ? h('span', { class: 'neg' }, `− ${money(all.loans.monthlyInterest)} loan interest`) : '− ₹ 0 loan interest'), { tone: tone(all.netMonthly), href: '#/fixed/loans' }),
    tile('Earning every day', money(all.cfTotal.perDay), h('span', null, `${money(all.cfTotal.perDay - all.loans.monthlyInterest / 30)} after `, h('span', { class: 'neg' }, `${money(all.loans.monthlyInterest / 30)} loan interest`)), { href: '#/fixed', pop: h('div', null, earningBody(all, false), h('p', null, h('a', { href: '#/fixed' }, 'Open Fixed income'))) }),
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
/** A monthly income line that keeps showing as pending: mark it received for the month, or remove it. */
function fixIncome(name, month) {
  const m = (S.data.manualMonthlyIncome || []).find((x) => x.name === name);
  if (!m) return;
  dialog(name, h('p', null, `Expected ${money(m.amount)} each month. Mark it received for ${monthLabel(month, true)}, or remove it if you no longer expect it.`), [
    { label: 'Remove it for good', class: 'danger', onclick: (c) => { mutate((d) => { d.manualMonthlyIncome = d.manualMonthlyIncome.filter((x) => x.name !== name); }); c(); } },
    { label: 'Received this month', class: 'primary', onclick: (c) => { mutate((d) => { const t = d.manualMonthlyIncome.find((x) => x.name === name); t.paidMonths = [...new Set([...(t.paidMonths || []), month])]; }); c(); } },
    { label: 'Close', onclick: (c) => c() },
  ]);
}
/** Which bonds still have interest to come this month, with the amount and day each is due. */
function pendingBonds(bonds, month) {
  const list = bonds.slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const pend = list.filter((b) => b.pending > 0.5), got = list.filter((b) => b.received > 0.5);
  let tab = 'pending';
  const body = h('div');
  const draw = () => {
    const seg = h('nav', { class: 'seg', 'aria-label': 'Pending or received' }, [['pending', `Pending (${pend.length})`], ['received', `Received (${got.length})`]].map(([k, l]) => h('a', { href: 'javascript:void 0', class: tab === k ? 'on' : '', 'aria-selected': String(tab === k), onclick: (e) => { e.preventDefault(); tab = k; draw(); } }, l)));
    const rows = tab === 'pending'
      ? pend.map((b) => ({ title: b.name, sub: `${b.holder ? b.holder + ' · ' : ''}due ${shortDate(b.due)}`, value: h('span', { class: 'warn' }, money(b.pending)), valueSub: `not due yet` }))
      : got.map((b) => ({ title: b.name, sub: `${b.holder ? b.holder + ' · ' : ''}due ${shortDate(b.due)}`, value: h('span', { class: 'pos' }, money(b.received)), valueSub: `due date passed` }));
    body.replaceChildren(seg,
      rows.length ? rowList(rows) : h('p', { class: 'empty' }, tab === 'pending' ? 'Nothing pending: every bond due this month has passed its due date.' : 'No bond has reached its due date yet this month.'),
      h('p', { class: 'note' }, 'Interest for the real days in the month, after TDS. A bond is received once its due date has come; bank entries are not used here because they often come late or several together.'));
  };
  draw();
  dialog('Bond interest, ' + monthLabel(month, true), body, [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}
/** Which bonds still have interest to come this month, with the amount and day each is due (shown on hover). */
const pendingText = (bonds) => bonds.filter((b) => b.pending > 0.5).map((b) => `${b.name}: ${money(b.pending)} due ${shortDate(b.due)}`).join('\n') || 'Nothing pending';
function toReceiveCard(data, all) {
  const monthEnd = C.addMonths(C.monthStart(all.asOf), 1), month = C.monthKey(all.asOf);
  const rows = data.receivables.filter((x) => x.active !== false && x.balanceDue > 0).map((x) => C.receivableStatus(x, all.asOf))
    .filter((r) => !r.received && !r.notStarted && r.due < monthEnd).sort((a, b) => (a.due < b.due ? -1 : 1));
  const mc = C.monthCashflow(data, all, month);
  // bonds are one combined line (tap it to see each bond); other monthly income is a line of its own
  const pend = mc.income.filter((x) => x.expected - x.received > 1).map((x) => ({ due: null, name: x.name, expected: x.expected - x.received, income: true, bonds: x.bonds, sub: `expected ${money(x.expected)}, received ${money(x.received)}${x.bonds ? ' · tap to see which bonds' : canEdit() ? ' · tap to fix' : ''}` }));
  const total = rows.reduce((a, r) => a + (r.dueAmount ?? r.expected ?? 0), 0) + pend.reduce((a, r) => a + r.expected, 0), over = rows.filter((r) => r.overdue);
  const all2 = rows.concat(pend);
  return section('Money to receive this month', h('div', null,
    all2.length ? rowList(all2.map((r) => r.income ? { title: r.name, sub: r.sub, onClick: r.bonds ? () => pendingBonds(r.bonds, month) : canEdit() ? () => fixIncome(r.name, month) : null, value: money(r.expected), valueSub: h('span', { class: 'warn', title: r.bonds ? pendingText(r.bonds) : 'pending' }, 'pending') } : ({
      lead: dateChip(r.due), title: r.name, sub: r.overdue ? h('span', { class: 'neg' }, 'Overdue since ' + shortDate(r.due)) : r.dueToday ? h('span', { class: 'warn' }, 'Due today') : 'Due ' + shortDate(r.due),
      value: money(r.dueAmount ?? r.expected ?? 0), tone: r.overdue ? 'neg' : r.dueToday ? 'warn' : '',
    }))) : h('p', { class: 'empty' }, 'Everything due this month has been received.'),
    all2.length ? h('p', { class: 'summary-line' }, `Waiting for ${money(total)}`, over.length ? h('span', { class: 'neg' }, ` · ${over.length} overdue`) : null, rows.some((r) => r.dueToday) ? h('span', { class: 'warn' }, ` · ${rows.filter((r) => r.dueToday).length} due today`) : null) : null,
    h('p', null, h('a', { href: '#/fixed' }, 'Open Fixed income'))));
}

/** A card the person can tap for the working behind a figure. */
const tapStat = (label, val, sub, cls, onClick) => h('div', { class: 'stat tappable', role: 'button', tabindex: '0', onclick: onClick, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } },
  h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value ' + (cls || '') }, val), h('div', { class: 'stat-sub' }, sub));
const detail = (title, rows, notes) => dialog(title, h('div', null, rows.length ? rowList(rows) : h('p', { class: 'empty' }, 'Nothing to show.'), ...notes.map((n) => h('p', { class: 'note' }, n))), [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);

/** Chit and gold chit payments for the month: Pending first, then Received (paid this month). Any payment this month counts, since the amount can change. */
function mandatoryDialog(mand) {
  let tab = 'pending';
  const body = h('div');
  const kindText = (r) => `${r.kind === 'gold' ? 'Gold chit' : 'Chit'}${r.duration ? ` · ${r.count} of ${r.duration} payments` : ''}`;
  const draw = () => {
    const seg = h('nav', { class: 'seg', 'aria-label': 'Pending or received' }, [['pending', `Pending (${mand.pending.length})`], ['received', `Received (${mand.done.length})`]].map(([k, l]) => h('a', { href: 'javascript:void 0', class: tab === k ? 'on' : '', 'aria-selected': String(tab === k), onclick: (e) => { e.preventDefault(); tab = k; draw(); } }, l)));
    const rows = tab === 'pending'
      ? mand.pending.map((r) => ({ title: r.name, sub: `${kindText(r)} · took ${money(r.last)} last month`, value: h('span', { class: 'warn' }, money(r.pending)) }))
      : mand.done.map((r) => ({ title: r.name, sub: `${kindText(r)}${r.last > 0 ? ' · last month ' + money(r.last) : ''}`, value: h('span', { class: 'pos' }, money(r.paid)), valueSub: 'paid this month' }));
    body.replaceChildren(seg,
      rows.length ? rowList(rows) : h('p', { class: 'empty' }, tab === 'pending' ? 'Every running chit has a payment this month.' : 'No chit has been paid yet this month.'),
      h('p', { class: 'note' }, 'A chit counts as paid once anything is paid into it this month, because the amount can change every month. Pending shows what it took last month. Gold chits run for the number of months set on Gold & others → Gold chits (11 by default); chits use their tenure.'));
  };
  draw();
  dialog('Chit payments, ' + monthLabel(C.monthKey(S.all.asOf), true), body, [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}

/** Where this month's money stands: what came in, what is already promised (chits), what will be spent, and what that leaves to invest. */
function investCard(data, all, planIn) {
  let m = planIn;
  if (!m) { try { m = monthPlan(data, all, P.cfg(data).outlooks); } catch (e) { return null; } }
  const mand = m.mandatory, pr = m.proj;
  const incomeNote = m.planIn > m.actualIn ? 'expected' : 'received';
  const showInvestable = () => detail('Investable income added, ' + monthLabel(m.month, true), [
    { title: 'Money in this month', sub: `the higher of ${money(m.actualIn)} received so far and ${money(m.planIn)} the plan expects (${incomeNote})`, value: money(m.income) },
    { title: 'Money out this month', sub: `the higher of ${money(m.actualOut)} paid so far and ${money(m.planOut)} the plan expects (expenses, EMI, tax, yearly bills)`, value: '− ' + money(m.spend) },
    { title: 'Investable income added', sub: 'what is left to invest from this month’s money', value: h('b', { class: 'inv' }, money(m.investable)) },
  ], ['EPF is not counted: it goes straight to the EPF account and never reaches the bank.', 'This is the month’s income, not the bank balance. The bank balance is used for “Current investable amount” below.']);
  const showMandatory = () => mandatoryDialog(mand);
  const showSpend = () => detail('Expenses still to come this month', pr.rows.map((r) => ({ title: r.name, sub: `${money(r.spent)} spent in ${pr.days} day${pr.days === 1 ? '' : 's'} = ${money(r.perDay)} a day × ${pr.left} days left`, value: money(r.more) })),
    ['Projected from the Spent column in “This month in detail”: regular spending only. Rent, clothes, entertainment, vacation, gifts, EMI and tax are not projected.']);
  const showCurrent = () => showInvestable(m);
  return section('Investing this month · ' + monthLabel(m.month), h('div', null,
    h('div', { class: 'stats' },
      tapStat('Investable income added this month', money(m.investable), `${money(m.income)} in − ${money(m.spend)} out · tap for working`, 'inv', showInvestable),
      tapStat('Pending mandatory investments (approx.)', money(mand.total), mand.pending.length ? `${mand.pending.length} chit${mand.pending.length === 1 ? '' : 's'} not paid yet this month${mand.done.length ? ', ' + mand.done.length + ' paid' : ''} · chits and gold chits` : (mand.done.length ? `all ${mand.done.length} paid this month · chits and gold chits` : 'no chits running · chits and gold chits'), mand.total > 0.5 ? 'warn' : '', showMandatory),
      tapStat('Expenses still to come (projected)', money(pr.total), `${pr.left} day${pr.left === 1 ? '' : 's'} left · regular spending, no rent`, '', showSpend),
      tapStat('Investable balance', money(m.current), `bank ${money(m.bank)} + cash ${money(m.cash)} + interest ${money(m.interest)} − ${money(mand.total)} chits − ${money(pr.total)} expenses`, m.current >= 0 ? 'inv' : 'neg', showCurrent)),
    m.current < 0 ? h('p', { class: 'note warn' }, `The bank is short by ${money(-m.current)} for what is still expected this month.`) : null,
    h('h4', { style: { margin: '12px 0 4px' } }, 'Where the current investable amount can go'),
    m.current > 0.5 ? rowList([
      mand.chits > 0.5 ? { title: 'Chits', sub: 'already set aside, from last month', value: money(mand.chits) } : null,
      mand.gold > 0.5 ? { title: 'Gold chits', sub: 'already set aside, from last month', value: money(mand.gold) } : null,
      m.goldWanted > 0.5 ? { title: 'Gold', sub: 'what you bought last month, less this month so far', value: money(m.goldWanted) } : null,
      ...m.alloc.filter((r) => r.amount > 0.5).map((r) => ({ title: r.name, sub: `${P.classOf(r.cls).label} · ${Math.round(r.share * 100)}% of the rest, by your plan`, value: h('span', { class: 'inv' }, money(r.amount)) })),
    ].filter(Boolean)) : h('p', { class: 'empty' }, 'Nothing is free to invest right now.'),
    m.current > 0.5 && !m.hasLines ? h('p', { class: 'note' }, 'Make a plan under Wealth outlook to split the rest.') : null,
    h('p', { class: 'note' }, 'Gold and chits come from what actually happened. The rest of the amount is split by the shares of your plan lines. Figures are approximate.'),
    h('p', null, h('a', { href: '#/projector' }, 'Open Wealth outlook'))));
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

const DISMISS = 'fw.dismissed';
const dismissed = () => { try { const o = JSON.parse(localStorage.getItem(DISMISS) || '{}'), t = C.todayISO(); return Object.fromEntries(Object.entries(o).filter(([, d]) => d === t)); } catch (e) { return {}; } };
const setDismissed = (o) => { try { localStorage.setItem(DISMISS, JSON.stringify(o)); } catch (e) { /* private window */ } rerender(); };
/** Things that need a look: overdue money, old prices, loans, behind plan. Each can be hidden for the rest of today (this device only). */
function attention(data, all) {
  const out = [];
  const soon = C.upcoming(data, all, 30).filter((u) => u.kind !== 'Loan EMI' && u.kind !== 'Bond interest'), overdue = soon.filter((u) => u.days < 0);
  const emis = C.loanDues(data, all.asOf).filter((d) => !d.paid && d.days <= 7);
  const emiLate = emis.filter((d) => d.status === 'overdue'), emiSoon = emis.filter((d) => d.status !== 'overdue');
  if (emiLate.length) out.push({ title: `${emiLate.length} loan EMI${emiLate.length === 1 ? '' : 's'} overdue`, sub: emiLate.map((d) => `${d.name} (was due ${dateStr(d.date)})`).join(', '), value: money(emiLate.reduce((a, d) => a + d.emi, 0)), tone: 'neg', href: '#/fixed/loans' });
  if (emiSoon.length) out.push({ title: emiSoon.length === 1 ? `${emiSoon[0].name} EMI: ${emiSoon[0].days === 0 ? 'due today' : emiSoon[0].days === 1 ? 'due tomorrow' : 'due in ' + emiSoon[0].days + ' days'}` : `${emiSoon.length} loan EMIs due within a week`, sub: emiSoon.map((d) => `${d.name} · ${d.days === 0 ? 'today' : dateStr(d.date).replace(/ \d{4}$/, '')}`).join(', '), value: money(emiSoon.reduce((a, d) => a + d.emi, 0)), tone: 'warn', href: '#/fixed/loans' });
  if (overdue.length) out.push({ title: `${overdue.length} payment${overdue.length === 1 ? '' : 's'} overdue`, sub: overdue.slice(0, 2).map((u) => u.title).join(', '), value: money(overdue.reduce((a, u) => a + u.amount, 0)), tone: 'neg', href: '#/fixed/lending' });
  const due = soon.filter((u) => u.days >= 0 && u.days <= 14);
  const when = (u) => (u.days === 0 ? 'today' : u.days === 1 ? 'tomorrow' : dateStr(u.date).replace(/ \d{4}$/, ''));
  if (due.length) out.push({ title: due.length === 1 ? `${due[0].title}: due ${when(due[0])}` : `${due.length} falling due in 14 days`, sub: due.slice(0, 3).map((u) => `${u.title} · ${when(u)}`).join(', ') + (due.length > 3 ? ` and ${due.length - 3} more` : ''), value: money(due.reduce((a, u) => a + u.amount, 0)), tone: due.some((u) => u.days === 0) ? 'warn' : '', href: due.every((u) => u.kind === 'Money to receive') ? '#/fixed/lending' : '#/home' });
  const bn = C.bondNotify(data), bd = bn.on ? C.bondsDueSoon(all, all.asOf, bn.days) : [];
  if (bd.length) {
    const when = (d) => (d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : 'in ' + d.days + ' days');
    out.push({ title: bd.length === 1 ? `${bd[0].b.name}: interest due ${when(bd[0])}` : `${bd.length} bond interests due${bd.every((d) => d.days === 0) ? ' today' : ' soon'}`, sub: bd.slice(0, 3).map((d) => `${d.b.name} · ${when(d)}`).join(', ') + (bd.length > 3 ? ` and ${bd.length - 3} more` : ''), value: money(bd.reduce((a, d) => a + (d.b.credit === 'Quarterly' ? 3 : 1) * (d.b.monthNet || 0), 0)), tone: 'warn', href: '#/fixed/bonds' });
  }
  const al = evalAlerts(data).hit;
  if (al.length) out.push({ title: al.length === 1 ? `Price alert: ${al[0].alert.name}` : `${al.length} price alerts triggered`, sub: al.slice(0, 2).map((x) => x.text).join(' · '), value: '', tone: 'warn', href: '#/equity/overview' });
  const at = data.settings.pricesUpdatedAt;
  const age = at ? Math.round((Date.now() - new Date(at).getTime()) / 864e5) : null;
  if (age == null || age >= 3) out.push({ title: 'Share and fund prices are ' + (age == null ? 'not fetched yet' : age + ' days old'), sub: 'Refresh on Shares & funds', value: '', tone: 'warn', href: '#/equity' });
  if (all.loans.monthlyInterest > all.cfTotal.perMonth) out.push({ title: 'Loan interest is more than the interest you earn', sub: `${money(all.loans.monthlyInterest)} out, ${money(all.cfTotal.perMonth)} in each month`, value: '', tone: 'neg', href: '#/fixed/loans' });
  const hid = dismissed();
  const keyOf = (o) => o.title;
  const shown = out.filter((o) => !hid[keyOf(o)]), nHid = out.length - shown.length;
  if (!shown.length) return null;
  const today = C.todayISO();
  return section('Needs a look', h('div', null, rowList(shown.map((o) => ({ title: o.title, sub: o.sub, value: o.value, tone: o.tone, onClick: () => { location.hash = o.href; },
    extra: h('button', { type: 'button', class: 'small dismiss', title: 'Hide this until tomorrow', 'aria-label': 'Hide until tomorrow: ' + o.title, onclick: (e) => { e.stopPropagation(); setDismissed({ ...hid, [keyOf(o)]: today }); } }, 'Dismiss') }))),
    nHid ? h('p', { class: 'note' }, `${nHid} hidden until tomorrow. `, h('a', { href: '#', onclick: (e) => { e.preventDefault(); setDismissed({}); } }, 'Show again')) : null));
}

function riskState(all) {
  // risk groups and limits come from the settings on the Wealth outlook > Risk limits tab
  const cfg = R.riskCfg(S.data), ev = R.evaluate(cfg, R.stateNow(S.data, all));
  const pc1 = (x) => (Math.round(x * 1000) / 10) + '%';
  const ofw = (b) => (b.kind === 'item' ? ' ' + R.ofText(b.base) : b.of && b.of !== 'total' ? ' ' + R.ofText(b.of) : '');
  const lim = (b) => [b.max != null ? pc1(b.max) : null, b.maxAmt != null ? money(b.maxAmt) : null].filter(Boolean).join(' or ');
  const kindWord = (b) => (b.kind === 'item' ? 'single holding' : b.kind === 'bucket' ? 'risk group' : 'kind of holding');
  const flags = ev.breaches.map((b) => ({ title: b.name, sub: `${kindWord(b)}, limit ${lim(b)}`, value: h('span', { class: 'neg' }, 'over by ' + money(b.excess)), valueSub: h('span', { class: 'neg' }, pc1(b.pct) + ofw(b)), tone: 'neg' }));
  const nears = ev.near.map((b) => ({ title: b.name, sub: `${kindWord(b)}, limit ${lim(b)}`, value: h('span', { class: 'warn' }, Math.round(b.used * 100) + '% used'), valueSub: h('span', { class: 'warn' }, `${money(b.room || 0)} left`) }));
  return { cfg, ev, pc1, lim, flags, nears };
}

/** Where the money is, grouped by kind of investment (Debts, Gold, Equity, Others) or by risk. Tap a group in the chart or list to see what is inside it. */
function allocation(all) {
  const { cfg, ev } = riskState(all);
  return section('Allocation & risk', allocationBody(cfg, ev));
}

/** Over-limit and close-to-limit holdings, against the limits set under Risk. */
function riskAlerts(all) {
  const { flags, nears } = riskState(all);
  return section('Risk alerts', h('div', null,
    flags.length ? [h('p', { class: 'mini-title neg' }, `${flags.length} over your limit${flags.length > 1 ? 's' : ''}`), rowList(flags.slice(0, 5))] : null,
    nears.length ? [h('p', { class: 'mini-title warn' }, `${nears.length} close to a limit`), rowList(nears.slice(0, 5))] : null,
    !flags.length && !nears.length ? h('p', { class: 'note' }, '✓ Everything is within the limits you set.') : null,
    h('p', null, h('a', { href: '#/risk' }, 'See all'), ' · ', h('a', { href: '#/risk/limits' }, 'Set limits'), ' · ', h('a', { href: '#/risk/whatif' }, 'Try a what-if'))));
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
    h('p', { class: 'summary-line' }, out > 0 ? [h('span', { class: 'neg' }, 'Loan interest − ' + money(out) + ' a day · ' + money(ln.monthlyInterest) + ' a month'), h('br')] : null, 'After loan interest ', h('b', { class: tone(cf.perDay - out) }, money(cf.perDay - out) + ' a day')),
    fold ? h('details', { class: 'more' }, h('summary', null, `Show the ${rows.length} sources`), list) : list,
    h('p', { class: 'note' }, 'Covers EPF, PPF, chits, RD and LIC, bonds, fixed deposits and private lending. Shares, funds and gold pay no fixed interest, so they are not counted.'));
}
/** Phone only: on a computer this lives in the "Earning every day" tile. Sources are folded away to keep it short. */
const earning = (all) => section('Earning every day', earningBody(all, true));

function returnsCard(data, all, rets, cov) {
  const groupOf = (r) => (r.name === 'Gold' ? 'gold' : /^(Stocks|Mutual)/.test(r.name) ? 'equity' : /^(Bonds|FDs|Private lending|EPF|Chits|Insurance)/.test(r.name) ? 'debt' : 'other');
  const showRet = (r) => !(r.ret == null || r.name.includes('lending') || r.name === 'Bonds');
  const xirrTxt = (r) => (r.xirr == null ? null : `XIRR ${r.estimated ? '≈ ' : ''}${pct(r.xirr)}`);
  const parent = (g) => {
    const it = rets.filter((r) => groupOf(r) === g.id);
    const invested = it.reduce((a, r) => a + r.invested, 0), value = it.reduce((a, r) => a + r.value, 0), gain = value - invested;
    // the group's XIRR comes from all its rows' dated cash flows together; estimates from an assumed rate stay out
    const gx = C.groupXirr(it), x = gx.xirr;
    return { it, invested, value, gain, x, approx: gx.approx, partial: gx.count < it.length, ret: invested ? gain / invested : null };
  };
  const rows = GROUPS.map((g) => ({ g, p: parent(g) })).filter((x) => x.p.it.length);
  const tbl = h('div', { class: 'rets' }, rows.map(({ g, p }, i) => h('details', { class: 'ret-grp', open: false },
    h('summary', null, h('span', { class: 'rg-name' }, h('i', { class: 'dot', style: { background: color(i) } }), h('b', null, g.label)), h('span', { class: 'rg-flow' }, `${compact(p.invested)} in → ${compact(p.value)} now`),
      h('span', { class: 'rg-gain ' + tone(p.gain) }, `${p.gain >= 0 ? '▲' : '▼'} ${compact(Math.abs(p.gain))}`),
      h('span', { class: 'rg-x' }, [p.ret != null && g.id !== 'debt' ? 'Return ' + pct(p.ret) : null, p.x == null ? null : `XIRR ${p.approx ? '≈ ' : ''}${pct(p.x)}${p.partial ? '*' : ''}`].filter(Boolean).join(' · ') || '–')),
    rowList(p.it.map((r) => ({
      title: r.name, sub: `${compact(r.invested)} in → ${compact(r.value)} now`,
      value: h('span', { class: tone(r.gain) }, `${r.gain >= 0 ? '▲' : '▼'} ${compact(Math.abs(r.gain))}`),
      valueSub: [showRet(r) ? 'Return ' + pct(r.ret) : null, xirrTxt(r), r.xirrSuspect ? 'XIRR hidden: imported trades do not add up' : null].filter(Boolean).join(' · ') || null,
    }))))));
  return section('How your investments did', h('div', null, tbl,
    h('p', { class: 'note' }, '“Return” is the plain gain on the money put in; XIRR is the yearly return that accounts for when each rupee went in, so the two are different numbers. It needs dated cash flows, so shares and funds show plain return until buy dates are added. XIRR rows cover ' + pct(cov.coverage, 0) + ' of your assets.' + (cov.xirr != null ? ' Overall XIRR across everything with dates is ' + pct(cov.xirr, 1) + (cov.xirrNoPf != null ? ' (' + pct(cov.xirrNoPf, 1) + ' without EPF and PPF)' : '') + '. It is money-weighted: long-held money, such as EPF at a steady rate, counts for more than newer money.' : '') + ' Bond and lending XIRR assume coupons arrive on schedule. “≈” marks an estimate from an assumed rate (chits and savings); it is left out of the overall figure until the chit is closed with the real amount. A group’s XIRR is worked out from all its rows’ dated cash flows together; * means some rows are left out because they have no dates or are only estimates. Tap a group to see its rows.')));
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
          title: r.name, sub: 'expected ' + money(r.expected) + (r.bonds ? ' · tap to see each bond' : r.since ? ' · lent ' + dateStr(r.since) : ''), value: money(r.received),
          onClick: r.bonds ? () => pendingBonds(r.bonds, selMonth) : null,
          valueSub: r.expected - r.received > 0 ? h('span', { class: 'warn' }, money(r.expected - r.received) + ' pending') : '✓ received',
        })))),
      h('div', null,
        h('p', { class: 'mini-title' }, 'Expenses'),
        h('p', { class: 'big-line' }, h('b', null, money(spent)), h('span', { class: 'muted' }, ' spent')),
        spend.length ? hbars(spend.map((s) => ({ label: s.name, value: s.amount })), { fmt: money, colorIndex: 1 }) : h('p', { class: 'empty' }, 'No expenses recorded in this month.'),
        h('p', null, h('a', { href: '#/flow' }, 'See where it went'))))),
    [monthPicker(months, selMonth, (m) => { selMonth = m; rerender(); })]);
}

export function render() {
  const { all, data } = S;
  const months = C.ledgerMonths(data);
  const cur = C.monthKey(all.asOf);
  if (!selMonth || !months.includes(selMonth)) selMonth = months.includes(cur) ? cur : months[months.length - 1];
  const series = C.netWorthSeries(data, all);
  const rets = C.returns(data, all), ox = C.overallXirr(data, all, rets);
  let plan = null; try { plan = monthPlan(data, all, P.cfg(data).outlooks); } catch (e) { plan = null; }
  const place = (el, ...cls) => { if (el) el.classList.add(...cls); return el; };
  const root = h('div', { class: 'page dash' });
  const parts = [
    hero(all, series, ox), tiles(all, data, C.monthCashflow(data, all, C.monthKey(all.asOf)), plan),
    place(attention(data, all), 'span-12'),
    place(toReceiveCard(data, all), 'span-6'), place(comingUp(data, all), 'span-6'),
    place(thisMonth(data, all, months), 'span-12'),
    place(investCard(data, all, plan), 'span-12'),
    place(todayCard(all), 'm-only'), place(earning(all), 'm-only'),
    place(allocation(all), 'span-7'), place(riskAlerts(all), 'span-5'),
    place(returnsCard(data, all, rets, ox), 'span-12')];
  root.append(...parts.filter(Boolean));
  return root;
}
