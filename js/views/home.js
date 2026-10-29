// Home: a dashboard of cards. The detail tables live on each asset screen.
import { evalAlerts } from '../watch.js';
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, monthPicker, rowList, kpi, dateChip, btn, canEdit, dec, toast, dialog, icon as uiIcon } from '../ui.js';
import { strip, legend, hbars, lineChart, donut, spark, color, riskColor } from '../charts.js';
import * as R from '../risk.js';
import { rateHistory, ageText } from './gold.js';
import { GROUPS } from './groupmix.js';
import { allocationBody } from './allocview.js';
import { monthPlan, pendingToReceive } from '../monthinvest.js';
import { openInfo } from '../mobilebar.js';
import { refresh as refreshPrices, agoText } from './equity.js';
import * as P from '../projector.js';

let selMonth = null;
const rerender = () => window.dispatchEvent(new Event('rerender'));
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const shortDate = (d) => dateStr(d).replace(/ (\d\d)(\d\d)$/, " '$2");
const sgp = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pct(Math.abs(n), 2);
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const RISK_ORDER = ['Safe', 'Medium', 'Medium High', 'High'];


// ---------- net worth over time ----------
const NW_RANGES = [['1w', '1 week', 7], ['1m', '1 month', 1], ['3m', '3 months', 3], ['6m', '6 months', 6], ['1y', '1 year', 12]];
let nwRange = '3m';
const dayMs = 86400000, isoMs = (d) => Date.parse(d + 'T00:00:00Z'), msIso = (t) => new Date(t).toISOString().slice(0, 10);
/** Net worth for every day of the chosen range: readings where they exist, straight lines in between. */
function nwDaily(pts, from, to) {
  const out = [];
  let k = 0;
  for (let t = isoMs(from); t <= isoMs(to); t += dayMs) {
    const d = msIso(t);
    while (k < pts.length - 2 && pts[k + 1].date <= d) k++;
    const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
    const lerp = (x, y) => { if (x == null || y == null) return null; if (d <= a.date || a === b) return x; if (d >= b.date) return y; const f = (isoMs(d) - isoMs(a.date)) / (isoMs(b.date) - isoMs(a.date)); return x + (y - x) * f; };
    const exact = pts.find((p) => p.date === d);
    out.push({ date: d, net: exact ? exact.net : lerp(a.net, b.net), assets: exact ? exact.assets : lerp(a.assets, b.assets), exact: !!exact });
  }
  return out;
}
function netWorthHistory(data, all) {
  const pts = C.netWorthPoints(data, all);
  const r = NW_RANGES.find((x) => x[0] === nwRange) || NW_RANGES[2];
  const to = all.asOf;
  const from = r[0] === '1w' ? msIso(isoMs(to) - 6 * dayMs) : C.addMonths(to, -r[2]);
  const first = pts[0].date, start = from < first ? first : from;
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Period' }, NW_RANGES.map(([k, l]) => h('button', { type: 'button', class: 'chip-btn' + (nwRange === k ? ' on' : ''), 'aria-pressed': String(nwRange === k), onclick: () => { nwRange = k; rerender(); } }, l)));
  const inRange = pts.filter((p) => p.date >= start && p.date <= to);
  const daily = inRange.filter((p) => p.src === 'daily' || p.src === 'today').length, monthly = inRange.filter((p) => p.src === 'month end').length;
  if (inRange.length < 2) return section('Net worth over time', h('div', null, chips, h('p', { class: 'empty' }, 'Not enough saved readings in this period yet.'), h('p', { class: 'note' }, `The app saves one reading each day you open it on the owner’s device, and keeps the month-end figures too. The oldest reading is ${dateStr(first)}.`)));
  const days = nwDaily(pts, start, to);
  const nets = days.map((d) => d.net), hasAssets = days.every((d) => d.assets != null);
  const lo = Math.min(...nets), hi = Math.max(...nets);
  const step = (hi - lo) || 1, yMin = Math.max(0, Math.floor((lo - step * 0.15) / 1e4) * 1e4);
  const long = days.length > 100;
  const labels = days.map((d) => { const dt = new Date(isoMs(d.date)); const mon = dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }); return long ? `${mon} '${d.date.slice(2, 4)}` : `${dt.getUTCDate()} ${mon}`; });
  const series = [{ name: 'Net worth', values: nets, color: 0 }];
  if (hasAssets) series.push({ name: 'Total assets', values: days.map((d) => d.assets), color: 2, dashed: true });
  const yLo = hasAssets ? Math.max(0, Math.floor((Math.min(lo, ...days.map((d) => d.assets)) - step * 0.15) / 1e4) * 1e4) : yMin;
  const change = nets[nets.length - 1] - nets[0], hiDay = days.find((d) => d.net === hi), loDay = days.find((d) => d.net === lo);
  return section('Net worth over time', h('div', null, chips,
    h('div', { class: 'stats' },
      stat('Change in ' + r[1], h('span', { class: tone(change) }, sgn(change)), nets[0] ? sgp(change / nets[0]) + ' since ' + shortDate(days[0].date) : ''),
      stat('Highest', money(hi), shortDate(hiDay.date)),
      stat('Lowest', money(lo), shortDate(loDay.date)),
      stat('Readings used', `${daily + monthly}`, `${daily} daily · ${monthly} month-end`)),
    lineChart({ labels, tipLabels: days.map((d) => dateStr(d.date) + (d.exact ? '' : ' (between readings)')), fmt: money, yMin: yLo, height: 250, series }),
    h('p', { class: 'note' }, `Drawn from the readings the app has saved: one for each day you open it on the owner’s device (net worth, assets and loans on that day), plus the month-end figures from your Plan sheet and check-ins. Where a day has no reading, the line runs straight between the nearest two. The oldest reading is ${dateStr(first)}, so a longer period shows a flatter, month-end-only line until daily readings build up.${hasAssets ? '' : ' Total assets appear once the period has daily readings throughout.'} Hover or touch the chart for the figure on any day.`)));
}

/** Small round icon for the Net worth card (class says which colour). */
const hico = (k, cls) => { const e = document.createElement('span'); e.className = 'hico ' + cls; e.setAttribute('aria-hidden', 'true'); e.append(sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ...ICONS[k].map((d) => sv('path', { d })))); return e; };
function hero(all, series, ox) {
  const monthStartIso = C.monthStart(all.asOf);
  const base = series.filter((p) => p.date < monthStartIso).pop();
  const delta = base ? all.netAsset - base.value : null;
  const trend = series.slice(-14).map((p) => p.value);
  return h('section', { class: 'hero card span-12' },
    h('div', { class: 'hero-top' },
      h('div', null,
        h('p', { class: 'hero-label' }, hico('wallet', 'nw'), h('span', null, 'Net worth')),
        ox && ox.xirr != null ? h('span', { class: 'hero-pill ' + tone(ox.xirr), title: 'Overall XIRR' }, `${ox.xirr >= 0 ? '▲' : '▼'} ${pct(ox.xirr, 1)}`) : null,
        h('p', { class: 'hero-num' }, compact(all.netAsset)),
        h('p', { class: 'hero-exact' }, hico('cal', 'cal'), h('span', null, money(all.netAsset) + ' as on ' + dateStr(all.asOf))),
        delta != null ? h('p', { class: 'hero-delta ' + tone(delta) }, `${delta >= 0 ? '▲' : '▼'} ${money(Math.abs(delta))} since ${dateStr(base.date).replace(/ \d{4}$/, '')}`) : null),
      h('div', { class: 'hero-right' },
        spark(trend, { width: 150, height: 44, tone: 2 }),
        h('dl', { class: 'hero-side' },
          h('div', null, h('dt', null, hico('db', 'assets'), h('span', null, 'Assets')), h('dd', null, compact(all.totalAssets))),
          h('div', null, h('dt', null, hico('loan', 'loans'), h('span', null, 'Loans')), h('dd', null, compact(all.liabTotal))),
          ox && ox.xirr != null ? h('div', { title: `Yearly return counting when each rupee went in, over gold, bonds, deposits, lending, EPF/PPF, shares, funds and anything you closed. Covers ${pct(ox.coverage, 0)} of your assets.` }, h('dt', null, hico('chart', 'xirr'), h('span', null, 'Overall XIRR')), h('dd', { class: tone(ox.xirr) }, pct(ox.xirr, 1))) : null,
          ox && ox.xirrNoPf != null && Math.abs(ox.xirrNoPf - ox.xirr) > 0.002 ? h('div', { title: 'The same, leaving out EPF and PPF, which are long, steady savings.' }, h('dt', null, hico('shield', 'nopf'), h('span', null, 'Without EPF/PPF')), h('dd', { class: tone(ox.xirrNoPf) }, pct(ox.xirrNoPf, 1))) : null,
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
/** A summary tile. On a computer it opens a drop-down with the detail; on a phone it opens a bottom sheet (when it has one) or goes to the page. */
function tile(label, value, sub, { tone: t = '', href = null, pop = null, right = false, sheet = null } = {}) {
  const el = kpi(label, value, sub, { tone: t });
  el.classList.add('tap'); el.tabIndex = 0; el.setAttribute('role', pop ? 'button' : 'link');
  const go = () => {
    if (pop && mqDesk()) { const open = !el.classList.contains('open'); closeTiles(); el.classList.toggle('open', open); el.setAttribute('aria-expanded', String(open)); }
    else if (sheet) sheet();
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
      { title: 'Investable balance', value: h('b', { class: m.current >= 0 ? 'inv' : 'neg', style: { fontStyle: 'italic' } }, money(m.current)), sub: h('i', null, 'italic: it includes projected expenses') },
    ]),
    h('p', { class: 'note' }, 'Bank balance + cash in hand + interest still expected − pending mandatory investments − projected expenses. Mark an account as a wallet in its settings (or name it wallet or cash) to count it as cash in hand.'));
}
/** What went into each asset class this month against what the plan says is needed. */
function investedBody(m) {
  const cls = (c) => { try { return P.classOf(c).label; } catch (e) { return c; } };
  const rows = m.rows.map((r) => ({
    title: r.name, sub: `${cls(r.cls)} · ${r.priority != null ? 'P' + r.priority + ' · ' : ''}${r.fixed ? 'fixed' : Math.round(r.share * 100) + '% of the month'} · needed ${money(r.target)}`,
    value: h('span', { class: r.done > 0.5 ? 'pos' : '' }, money(r.done)),
    valueSub: r.over > 0.5 ? h('span', { class: 'warn' }, `${money(r.over)} over`) : r.left > 0.5 ? h('span', { class: 'neg' }, `${money(r.left)} to go`) : '✓ done',
  })).concat(m.unplanned.map((u) => ({ title: cls(u.cls), sub: 'not in your plan', value: h('span', { class: 'pos' }, money(u.done)) })));
  const needed = m.rows.reduce((a, r) => a + r.target, 0);
  return h('div', null,
    h('div', { class: 'trio' },
      h('div', null, h('span', { class: 'mini-title' }, 'Invested so far'), h('b', { class: 'pos' }, money(m.done))),
      h('div', null, h('span', { class: 'mini-title' }, 'Plan needs'), h('b', null, money(needed))),
      h('div', null, h('span', { class: 'mini-title' }, 'Still to go'), h('b', { class: m.stillToInvest > 0.5 ? 'neg' : 'pos' }, money(m.stillToInvest)))),
    m.rows.length || m.unplanned.length ? rowList(rows) : h('p', { class: 'empty' }, 'Nothing invested yet this month, and no plan lines to compare with.'),
    h('p', { class: 'note' }, `Invested comes from bank entries and asset records of ${monthLabel(m.month, true)}. “Needed” is the month’s income less its spending (${money(m.investable)}), shared out by the priority, fixed amount or share set on each Wealth outlook plan line${m.hasPlan ? '' : ' (no live plan yet, so standard assumptions are used)'}.`));
}
/** Both Investable balance cards open this: how it is worked out (first), and what was invested this month by asset class. */
function showInvestable(m, start = 'calc') {
  let tab = start;
  const body = h('div');
  const draw = () => {
    const seg = h('nav', { class: 'seg', 'aria-label': 'Investable balance' }, [['calc', 'How it is calculated'], ['done', 'Invested this month']].map(([k, l]) => h('a', { href: 'javascript:void 0', class: tab === k ? 'on' : '', 'aria-selected': String(tab === k), onclick: (e) => { e.preventDefault(); tab = k; draw(); } }, l)));
    body.replaceChildren(seg, tab === 'calc' ? investableBody(m) : investedBody(m));
  };
  draw();
  dialog('Investable balance · ' + monthLabel(m.month), body, [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}
const investSub = (m) => h('span', null, `invested so far ${money(m.done)} this month · tap for working`);
/** The remaining amount uses projected expenses, so it is shown in italics. */
const blueTile = (el) => { el.classList.add('blue'); el.setAttribute('role', 'button'); return el; };
const italicValue = (el) => { const v = el.querySelector('.kpi-value'); if (v) v.style.fontStyle = 'italic'; return el; };

// ----- the four summary cards: icon + label, a large amount, a quiet line, and one small extra per card (trend, progress or a hint) -----
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
const ICONS = {
  db: ['M3 5c0 1.66 4.03 3 9 3s9-1.34 9-3-4.03-3-9-3-9 1.34-9 3z', 'M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5', 'M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3'],
  up: ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  down: ['M22 17l-8.5-8.5-5 5L2 7', 'M16 17h6v-6'],
  cal: ['M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M16 3v4M8 3v4M4 11h16'],
  loan: ['M3 7h18v10H3z', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', 'M6.5 10v.01M17.5 14v.01'],
  chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  wallet: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
};
const icon = (k) => sv('svg', { viewBox: '0 0 24 24', class: 'kt-svg', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ...ICONS[k].map((d) => sv('path', { d })));
// A small decorative trend line (it shows direction only; it is not drawn from data).
const TREND = { up: 'M2,28 L12,22 L20,25 L30,15 L38,19 L48,10 L58,14 L68,6 L78,9 L88,3', down: 'M2,6 L10,10 L18,8 L26,14 L34,12 L44,20 L54,18 L64,25 L72,22 L88,30' };
let trendId = 0;
function trend(dir) {
  const id = 'kt-g' + (++trendId), d = TREND[dir];
  const end = d.split(' ').pop().slice(1).split(',').map(Number);
  return sv('svg', { viewBox: '0 0 92 34', class: 'kt-spark kt-' + dir, 'aria-hidden': 'true', width: '92', height: '34' },
    sv('defs', {}, sv('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' }, sv('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '.22' }), sv('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }))),
    sv('path', { d: d + ' L88,34 L2,34 Z', fill: `url(#${id})`, stroke: 'none' }),
    sv('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    sv('path', { d: dir === 'up' ? `M${end[0] - 7},${end[1] - 0.5} L${end[0]},${end[1]} L${end[0] - 0.5},${end[1] + 7}` : `M${end[0] - 7},${end[1] + 0.5} L${end[0]},${end[1]} L${end[0] - 0.5},${end[1] - 7}`, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
/** Give a summary tile the card layout: icon and label on top, the amount (with an optional trend line beside it), then what the card adds. Data, handlers and pop-ups are the tile's own. */
function dress(el, { kind, ico, trendDir = null, extra = [], foot = [] }) {
  const label = el.querySelector('.kpi-label'), value = el.querySelector('.kpi-value'), sub = el.querySelector('.kpi-sub');
  el.classList.add('kt', 'kt-' + kind);
  const head = h('div', { class: 'kt-head' }, h('span', { class: 'kt-ico' }, icon(ico)));
  el.insertBefore(head, label); head.append(label);
  const row = h('div', { class: 'kt-row' });
  el.insertBefore(row, value); row.append(value);
  if (trendDir) row.append(h('span', { class: 'kt-trend' }, trend(trendDir)));
  let at = row;
  for (const x of extra) { if (!x) continue; at.after(x); at = x; }   // between the amount and the quiet line (the budget bar)
  if (sub) { at.after(sub); at = sub; }
  for (const x of foot) { if (!x) continue; at.after(x); at = x; }    // after it (the "tap" hint)
  return el;
}

function tiles(all, data, mc, plan) {
  const mk = marketGroups(all), gd = all.gold.day;
  const dayAll = mk.total.day + (gd ? gd.total : 0);
  const anyDay = mk.total.hasDay || !!gd;
  const baseAll = (mk.total.dayPct ? mk.total.day / mk.total.dayPct : 0) + (gd ? all.gold.value - gd.total : 0);
  const dayPctAll = baseAll ? dayAll / baseAll : 0;
  const spent = mc.totalSpent + mc.lifestyle.amount;
  const budget = mc.totalExpected, used = budget ? spent / budget : 0;
  const bar = budget ? h('div', { class: 'kt-barrow' }, h('div', { class: 'kt-bar', role: 'img', 'aria-label': `${pct(used, 0)} of the budget spent` }, h('i', { style: { width: Math.min(100, Math.max(2, used * 100)).toFixed(1) + '%' } })), h('b', { class: 'kt-pctl' }, pct(used, 0))) : null;
  const spentSub = h('span', { class: 'kt-one' }, (budget ? `${pct(used, 0)} of ${money(budget)} budget` : 'no budget income yet') + (mc.notCounted > 0 ? ` · ${money(mc.notCounted)} not counted` : ''));
  const earnPerDay = all.cfTotal.perDay;
  return h('div', { class: 'kpis kpis-home span-12' },
    plan ? blueTile(italicValue(dress(tile('Investable balance', money(plan.current), h('span', null, `Invested so far ${money(plan.done)} this month`), { tone: plan.current >= 0 ? 'inv' : 'neg', sheet: () => showInvestable(plan) }), { kind: 'invest', ico: 'db' })))
      : dress(tile('Net monthly inflow', money(all.netMonthly), h('span', null, `${money(all.cfTotal.perMonth)} earned `, all.loans.monthlyInterest > 0 ? h('span', { class: 'neg' }, `− ${money(all.loans.monthlyInterest)} loan interest`) : '− ₹ 0 loan interest'), { tone: tone(all.netMonthly), href: '#/fixed/loans' }), { kind: 'invest', ico: 'db' }),
    dress(tile('Earning every day', money(earnPerDay), h('span', null, `${money(earnPerDay - all.loans.monthlyInterest / 30)} after `, h('span', { class: 'neg' }, `${money(all.loans.monthlyInterest / 30)} loan interest`)), { tone: 'pos', href: '#/fixed', pop: h('div', null, earningBody(all, false), h('p', null, h('a', { href: '#/fixed' }, 'Open Fixed income'))), sheet: () => openInfo('Earning every day', h('div', null, earningBody(all, true), h('p', null, h('a', { href: '#/fixed' }, 'Open Fixed income')))) }), { kind: 'earn', ico: 'up', trendDir: earnPerDay > 0 ? 'up' : null }),
    dress(tile('Markets today', anyDay ? sgn(dayAll) : '–', anyDay ? `${sgp(dayPctAll)} · shares, funds, ETFs, gold` : 'refresh prices to see', { tone: anyDay ? tone(dayAll) : '', href: '#/equity', pop: h('div', null, todayBody(all), h('p', null, h('a', { href: '#/equity' }, 'Open Shares & funds'))), sheet: () => openInfo('Markets today', h('div', null, todayBody(all), h('p', null, h('a', { href: '#/equity' }, 'Open Shares & funds')))) }), { kind: anyDay ? (dayAll < 0 ? 'down' : 'up') : 'flat', ico: anyDay && dayAll < 0 ? 'down' : 'up', trendDir: anyDay && Math.abs(dayAll) > 0 ? (dayAll < 0 ? 'down' : 'up') : null }),
    dress(tile('Spent this month', money(spent), spentSub, { tone: budget && spent > mc.totalReceived ? 'neg' : '', href: '#/flow', pop: spentBody(mc, spent), right: true }), { kind: 'spent', ico: 'wallet', extra: [bar] }));
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
/** Current month: bond interest due so far against what the bank has credited under Income Bond, in total (nothing is matched bond by bond). */
function bankGapDialog(g) {
  const dueRows = g.dueBonds.map((b) => ({ title: b.name, sub: `${b.holder ? b.holder + ' · ' : ''}due ${shortDate(b.due)}`, value: money(b.expected) }));
  const credRows = g.credits.map((c) => ({ title: c.desc || 'Bank credit', sub: shortDate(c.date), value: h('span', { class: 'pos' }, money(c.amount)) }));
  dialog('Bond interest and the bank, ' + monthLabel(C.monthKey(S.all.asOf), true), h('div', null,
    h('div', { class: 'trio' }, h('div', null, h('span', { class: 'mini-title' }, 'Due so far'), h('b', null, money(g.due))), h('div', null, h('span', { class: 'mini-title' }, 'In the bank'), h('b', null, money(g.credited))),
      h('div', null, h('span', { class: 'mini-title' }, g.gap >= 0 ? 'Not in bank' : 'Bank has more'), h('b', { class: g.short ? 'warn' : 'pos' }, money(Math.abs(g.gap))))),
    h('h4', { style: { margin: '10px 0 4px' } }, 'Due so far'), dueRows.length ? rowList(dueRows) : h('p', { class: 'empty' }, 'Nothing yet.'),
    h('h4', { style: { margin: '10px 0 4px' } }, 'Bank credits under Income Bond'), credRows.length ? rowList(credRows) : h('p', { class: 'empty' }, 'No Income Bond credit in the bank this month.'),
    h('p', { class: 'note' }, 'Home counts a bond as received once its due date has passed. This is a cross-check of the totals for this month only: what is due so far against everything the bank credited as Income Bond. No credit is tied to a particular bond. ' + (g.short ? 'The difference is either not credited yet, or its bank entry has not been made. ' : 'The difference is small, so nothing is flagged. ') + 'A difference under ₹' + C.BANK_TOLERANCE + ' is ignored. It is not added to the totals above.')),
  [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
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
  const showIncomeAdded = () => detail('Investable income added, ' + monthLabel(m.month, true), [
    { title: 'Money in this month', sub: `the higher of ${money(m.actualIn)} received so far and ${money(m.planIn)} the plan expects (${incomeNote})`, value: money(m.income) },
    { title: 'Money out this month', sub: `the higher of ${money(m.actualOut)} paid so far and ${money(m.planOut)} the plan expects (expenses, EMI, tax, yearly bills)`, value: '− ' + money(m.spend) },
    { title: 'Investable income added', sub: 'what is left to invest from this month’s money', value: h('b', { class: 'inv' }, money(m.investable)) },
  ], ['EPF is not counted: it goes straight to the EPF account and never reaches the bank.', 'This is the month’s income, not the bank balance. The bank balance is used for “Current investable amount” below.']);
  const showMandatory = () => mandatoryDialog(mand);
  const showSpend = () => detail('Expenses still to come this month', pr.rows.map((r) => ({ title: r.name, sub: `${money(r.spent)} spent in ${pr.days} day${pr.days === 1 ? '' : 's'} = ${money(r.perDay)} a day × ${pr.left} days left`, value: h('i', { class: 'neg' }, '− ' + money(r.more)) })),
    ['Projected from the Spent column in “This month in detail”: regular spending only. Rent, clothes, entertainment, vacation, gifts, EMI and tax are not projected.']);
  const showCurrent = () => showInvestable(m);
  return section('Investing this month · ' + monthLabel(m.month), h('div', null,
    h('div', { class: 'stats' },
      tapStat('Investable income added this month', money(m.investable), `${money(m.income)} in − ${money(m.spend)} out · tap for working`, 'inv', showIncomeAdded),
      tapStat('Pending mandatory investments (approx.)', money(mand.total), mand.pending.length ? `${mand.pending.length} chit${mand.pending.length === 1 ? '' : 's'} not paid yet this month${mand.done.length ? ', ' + mand.done.length + ' paid' : ''} · chits and gold chits` : (mand.done.length ? `all ${mand.done.length} paid this month · chits and gold chits` : 'no chits running · chits and gold chits'), mand.total > 0.5 ? 'warn' : '', showMandatory),
      tapStat('Expenses still to come (projected)', h('i', { class: 'neg' }, '− ' + money(pr.total)), h('i', null, `${pr.left} day${pr.left === 1 ? '' : 's'} left · regular spending, no rent`), '', showSpend),
      tapStat('Investable balance', h('i', null, money(m.current)), investSub(m), m.current >= 0 ? 'inv' : 'neg', showCurrent)),
    m.current < 0 ? h('p', { class: 'note warn' }, `The bank is short by ${money(-m.current)} for what is still expected this month.`) : null,
    h('h4', { style: { margin: '12px 0 4px' } }, 'Where the current investable amount can go'),
    m.current > 0.5 ? rowList([
      mand.chits > 0.5 ? { title: 'Chits', sub: 'already set aside, from last month', value: money(mand.chits) } : null,
      mand.gold > 0.5 ? { title: 'Gold chits', sub: 'already set aside, from last month', value: money(mand.gold) } : null,
      m.goldWanted > 0.5 ? { title: 'Gold', sub: 'what you bought last month, less this month so far', value: money(m.goldWanted) } : null,
      ...m.alloc.filter((r) => r.amount > 0.5).map((r) => ({ title: r.name, sub: m.rules ? `${P.classOf(r.cls).label} · ${r.priority != null ? 'priority ' + r.priority : 'no priority'}${r.fixed ? ' · fixed amount' : ''}${r.extra > 0.5 ? ' · includes ' + money(r.extra) + ' left over' : ''}` : `${P.classOf(r.cls).label} · ${Math.round(r.share * 100)}% of the rest, by your plan`, value: h('span', { class: 'inv' }, money(r.amount)) })),
    ].filter(Boolean)) : h('p', { class: 'empty' }, 'Nothing is free to invest right now.'),
    m.current > 0.5 && !m.hasLines ? h('p', { class: 'note' }, 'Make a plan under Wealth outlook to split the rest.') : null,
    h('p', { class: 'note' }, m.rules ? 'The amount is shared out by the priority, fixed amount or share set on each plan line (Wealth outlook), after chits already set aside. Money left over after every line goes to the last one. Figures are approximate.' : 'Gold and chits come from what actually happened. The rest of the amount is split by the shares of your plan lines. Figures are approximate.'),
    h('p', null, h('a', { href: '#/projector' }, 'Open Wealth outlook'))));
}

/** When prices were last fetched, and a button that fetches shares, ETFs, funds and gold again (the same refresh as Shares & funds). */
function refreshBar() {
  const upd = S.data.settings.pricesUpdatedAt, ms = upd ? Date.now() - new Date(upd).getTime() : null, stale = ms == null || ms > 864e5;
  return h('div', { class: 'price-bar inline mk-refresh' },
    h('span', { class: 'stamp' + (stale ? ' warn' : ''), title: upd ? 'Prices ' + new Date(upd).toLocaleString('en-IN') : '' }, stale ? '⚠ ' : '', ms == null ? 'Prices not fetched yet' : 'Prices updated ' + agoText(ms)),
    h('button', { class: 'refresh-btn small', type: 'button', title: 'Fetch the latest prices of shares, ETFs, funds and gold', 'aria-label': 'Refresh all market prices', onclick: (e) => { e.stopPropagation(); refreshPrices(e.currentTarget); } }, h('span', { class: 'ic' }, uiIcon('refresh')), h('span', { class: 'lb' }, 'Refresh')));
}
function todayBody(all) {
  const mk = marketGroups(all), gd = all.gold.day;
  const rows = mk.rows.filter((r) => r.hasDay).map((r) => ({ title: r.name, sub: sgp(r.dayPct), value: h('span', { class: tone(r.day) }, sgn(r.day)) }));
  if (gd) rows.push({ title: 'Gold', sub: `${sgp(gd.pct)} · ${money(all.gold.rate)}/g (${sgn(gd.perGram)})`, value: h('span', { class: tone(gd.total) }, sgn(gd.total)) });
  const total = rows.length ? mk.total.day + (gd ? gd.total : 0) : null;
  return h('div', null,
    refreshBar(),
    rows.length ? rowList(rows) : h('p', { class: 'empty' }, 'Press Refresh to see today’s change.'),
    total != null ? h('p', { class: 'summary-line' }, 'All together ', h('b', { class: tone(total) }, sgn(total)), (() => { const b = (mk.total.dayPct ? mk.total.day / mk.total.dayPct : 0) + (gd ? all.gold.value - gd.total : 0); return b ? h('span', { class: tone(total) }, ' (' + sgp(total / b) + ')') : null; })()) : null,
    gd ? null : h('p', { class: 'note' }, 'Gold today appears after a price refresh.'));
}

const DISMISS = 'fw.dismissed';
const dismissed = () => { try { const o = JSON.parse(localStorage.getItem(DISMISS) || '{}'), t = C.todayISO(); return Object.fromEntries(Object.entries(o).filter(([, d]) => d === t)); } catch (e) { return {}; } };
const setDismissed = (o) => { try { localStorage.setItem(DISMISS, JSON.stringify(o)); } catch (e) { /* private window */ } rerender(); };
/** Things that need a look: overdue money, old prices, loans, behind plan. Each can be hidden for the rest of today (this device only). */
// ---------- Action centre: everything dated that needs you, and the notices, in one card ----------
const ACTION_KIND = { 'Money to receive': { href: '#/fixed/lending', dir: 'in' }, 'Bond interest': { href: '#/fixed/bonds', dir: 'in' }, Bond: { href: '#/fixed/bonds', dir: 'in' }, 'Fixed deposit': { href: '#/fixed/fds', dir: 'in' }, Lending: { href: '#/fixed/lending', dir: 'in' }, 'Loan EMI': { href: '#/fixed/loans', dir: 'out' } };
const acState = { tab: 'all', more: {} };
/** One dated list from the single source (C.upcoming, 60 days: maturities, interest, money to receive, EMIs), plus bond interest due today, each item once. */
function agenda(data, all) {
  const items = C.upcoming(data, all, 60).map((u) => ({ ...u, key: u.date + '|' + u.title }));
  const seen = new Set(items.map((u) => u.key));
  const bn = C.bondNotify(data);
  if (bn.on) for (const d of C.bondsDueSoon(all, all.asOf, 0)) {
    const u = { date: d.date, title: d.b.name + ' interest due', amount: C.bondDueAmount(d.b, d.date.slice(0, 7), data.settings.tdsRate ?? 0.1), kind: 'Bond interest', days: 0 };
    u.key = u.date + '|' + u.title; if (!seen.has(u.key)) { seen.add(u.key); items.push(u); }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
/** Notices that have no date: price alerts, old prices, loan interest higher than what you earn. Each can be hidden until tomorrow. */
function notices(data, all) {
  const out = [];
  const al = evalAlerts(data).hit;
  if (al.length) out.push({ title: al.length === 1 ? `Price alert: ${al[0].alert.name}` : `${al.length} price alerts triggered`, sub: al.slice(0, 2).map((x) => x.text).join(' · '), value: '', tone: 'warn', href: '#/equity/overview' });
  const at = data.settings.pricesUpdatedAt;
  const age = at ? Math.round((Date.now() - new Date(at).getTime()) / 864e5) : null;
  if (age == null || age >= 3) out.push({ title: 'Share and fund prices are ' + (age == null ? 'not fetched yet' : age + ' days old'), sub: 'Refresh on Shares & funds', value: '', tone: 'warn', href: '#/equity' });
  if (all.loans.monthlyInterest > all.cfTotal.perMonth) out.push({ title: 'Loan interest is more than the interest you earn', sub: `${money(all.loans.monthlyInterest)} out, ${money(all.cfTotal.perMonth)} in each month`, value: '', tone: 'neg', href: '#/fixed/loans' });
  const hid = dismissed();
  return { shown: out.filter((o) => !hid[o.title]), hidden: out.filter((o) => hid[o.title]).length, hid };
}
function actionCentre(data, all) {
  const items = agenda(data, all), nt = notices(data, all), today = C.todayISO();
  const groups = [
    { id: 'overdue', label: 'Overdue', tone: 'neg', list: items.filter((u) => u.days < 0) },
    { id: 'today', label: 'Today', tone: 'warn', list: items.filter((u) => u.days === 0) },
    { id: 'week', label: 'Next 7 days', tone: '', list: items.filter((u) => u.days >= 1 && u.days <= 7) },
    { id: 'later', label: 'Later (to 60 days)', tone: '', list: items.filter((u) => u.days > 7) },
  ];
  const sumOf = (l) => l.reduce((a, u) => a + (u.amount || 0), 0);
  const od = groups[0].list, week = groups[1].list.concat(groups[2].list);
  const tabs = [['all', 'All', items.length + nt.shown.length], ['overdue', 'Overdue', od.length], ['week', 'This week', week.length], ['later', 'Later', groups[3].list.length], ['alerts', 'Alerts', nt.shown.length]];
  if (!tabs.some((t) => t[0] === acState.tab)) acState.tab = 'all';
  const dir = (u) => (ACTION_KIND[u.kind] || {}).dir;
  // Timeline: date on the left, a rail with one node per item, the item on the right. A date shows once for several items on the same day.
  const line = (u, g, first) => h('li', { class: 'ac-tl-row ' + (g.tone || '') + (dir(u) ? ' ' + dir(u) : ''), tabindex: 0, onclick: () => { location.hash = (ACTION_KIND[u.kind] || {}).href || '#/savings'; } },
    h('div', { class: 'ac-tl-date' }, first ? dateChip(u.date) : null),
    h('div', { class: 'ac-tl-node', 'aria-hidden': 'true' }, h('i', null, dir(u) === 'in' ? '↓' : dir(u) === 'out' ? '↑' : '•')),
    h('div', { class: 'ac-tl-card' },
      h('div', { class: 'ac-main' }, h('b', null, u.title.replace(/\s*\((overdue|due today)\)$/, '')), h('span', { class: 'ac-meta' }, u.kind, ' · ', g.id === 'overdue' ? h('span', { class: 'neg' }, `${-u.days} day${u.days === -1 ? '' : 's'} late`) : u.days === 0 ? h('span', { class: 'warn' }, 'today') : `in ${u.days} day${u.days === 1 ? '' : 's'}`)),
      h('div', { class: 'ac-amt' }, h('b', { class: g.id === 'overdue' ? 'neg' : dir(u) === 'in' ? 'pos' : '' }, (dir(u) === 'in' ? '+' : dir(u) === 'out' ? '−' : '') + money(u.amount)))));
  const block = (g) => {
    if (!g.list.length) return null;
    const open = acState.more[g.id], cap = g.id === 'later' ? 5 : 8, shown = open ? g.list : g.list.slice(0, cap);
    return h('div', { class: 'ac-group' },
      h('div', { class: 'ac-head ' + (g.tone || '') }, h('span', null, g.label, h('em', null, ' · ' + g.list.length)), h('span', { class: 'ac-sum' }, money(sumOf(g.list)))),
      h('ul', { class: 'ac-list ac-tl' }, shown.map((u, i) => line(u, g, i === 0 || shown[i - 1].date !== u.date))),
      g.list.length > cap ? h('button', { type: 'button', class: 'ac-more', onclick: () => { acState.more[g.id] = !open; rerender(); } }, open ? 'Show less' : `Show all ${g.list.length}`) : null);
  };
  const alerts = nt.shown.length ? h('div', { class: 'ac-group' },
    h('div', { class: 'ac-head' }, h('span', null, 'Alerts', h('em', null, ' · ' + nt.shown.length))),
    h('ul', { class: 'ac-list' }, nt.shown.map((o) => h('li', { class: 'ac-row ac-alert ' + (o.tone || ''), tabindex: 0, onclick: () => { location.hash = o.href; } },
      h('i', { class: 'ac-dot ' + (o.tone || ''), 'aria-hidden': 'true' }),
      h('div', { class: 'ac-main' }, h('b', null, o.title), o.sub ? h('span', { class: 'ac-meta' }, o.sub) : null),
      h('div', { class: 'ac-amt' }, o.value ? h('b', { class: o.tone === 'neg' ? 'neg' : '' }, o.value) : null, h('button', { type: 'button', class: 'small dismiss', title: 'Hide this until tomorrow', 'aria-label': 'Hide until tomorrow: ' + o.title, onclick: (e) => { e.stopPropagation(); setDismissed({ ...nt.hid, [o.title]: today }); } }, 'Dismiss')))))) : null;
  const pickGroups = acState.tab === 'overdue' ? [groups[0]] : acState.tab === 'week' ? [groups[1], groups[2]] : acState.tab === 'later' ? [groups[3]] : acState.tab === 'alerts' ? [] : groups;
  const body = [...pickGroups.map(block), acState.tab === 'all' || acState.tab === 'alerts' ? alerts : null].filter(Boolean);
  return h('section', { class: 'card ac' },
    h('div', { class: 'ac-top' }, h('div', null, h('h2', null, 'Action centre'), h('p', { class: 'ac-sub' }, 'What needs you now, and what is coming')),
      h('div', { class: 'ac-kpis' },
        h('div', { class: 'ac-kpi' + (od.length ? ' bad' : '') }, h('span', null, 'Overdue'), h('b', null, od.length ? money(sumOf(od)) : '–')),
        h('div', { class: 'ac-kpi' }, h('span', null, 'Next 7 days'), h('b', null, week.length ? money(sumOf(week)) : '–')),
        h('div', { class: 'ac-kpi' }, h('span', null, 'Next 60 days'), h('b', null, items.length ? money(sumOf(items.filter((u) => u.days >= 0))) : '–')))),
    h('nav', { class: 'seg ac-tabs', role: 'tablist', 'aria-label': 'Action centre' }, tabs.map(([k, l, n]) => h('a', { href: 'javascript:void 0', role: 'tab', class: acState.tab === k ? 'on' : '', 'aria-selected': String(acState.tab === k), onclick: (e) => { e.preventDefault(); acState.tab = k; rerender(); } }, l, n ? h('span', { class: 'ac-n' }, n) : null))),
    body.length ? h('div', null, body) : h('p', { class: 'empty' }, acState.tab === 'all' ? 'All clear: nothing overdue and nothing falls due in the next 60 days.' : 'Nothing here.'),
    nt.hidden ? h('p', { class: 'note' }, `${nt.hidden} alert${nt.hidden === 1 ? '' : 's'} hidden until tomorrow. `, h('a', { href: '#', onclick: (e) => { e.preventDefault(); setDismissed({}); } }, 'Show again')) : null);
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

/**
 * What one expense line of a month is made of, added up by description. A popup on a computer, a bottom sheet on a phone.
 * `cats` are the ledger categories behind the line (the Groceries line is one category, the clothes line is four).
 */
function expenseDrill(month, label, cats) {
  const want = new Set((cats || []).map((c) => String(c).toLowerCase()));
  const rows = C.monthLedger(S.data, month).filter((e) => e.debit > 0 && want.has((e.category || '').toLowerCase()));
  const list = C.byDescription(rows, 'debit'), total = list.reduce((a, r) => a + r.amount, 0);
  const one = (cats || []).length === 1 ? cats[0] : '*';
  const body = h('div', null,
    h('p', { class: 'summary-line' }, `${monthLabel(month, true)} · `, h('b', { class: 'neg' }, money(total)), ` · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`),
    list.length ? rowList(list.map((r) => ({ title: r.desc, sub: `${r.count} ${r.count === 1 ? 'entry' : 'entries'} · last ${shortDate(r.last)}`, value: h('span', { class: 'neg' }, money(r.amount)), valueSub: pct(r.share, 0) }))) : h('p', { class: 'empty' }, 'No entries in this month.'),
    h('p', { class: 'note' }, 'Added up by description. Money paid out only; transfers are left out.'),
    h('p', null, h('a', { href: `#/flow/detail?cat=${encodeURIComponent(one)}&dir=debit&m=${month}&view=${one === '*' ? 'cat' : 'desc'}` }, one === '*' ? 'See all expenses of this month' : 'See every entry')));
  if (window.matchMedia('(max-width: 700px)').matches) openInfo(label, body);
  else { const d = dialog(label, body, [{ label: 'Done', class: 'primary', onclick: (c) => c() }]); d.el.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href]')) d.close(); }); }
}

/**
 * Current month only, under Income: money to receive that is due or overdue (loans and other dues), and the cross-check of this month's bond interest against the
 * bank's Income Bond credits, in total (nothing is matched bond by bond; a difference under ₹300 is ignored).
 */
function toReceiveExtras(data, all, mc) {
  const month = C.monthKey(all.asOf);
  const { rows } = pendingToReceive(data, all, mc);
  const bankGap = C.bondBankGap(mc, month, all.asOf);
  const over = rows.filter((r) => r.overdue), today = rows.filter((r) => r.dueToday);
  return h('div', { class: 'to-receive' },
    rows.length ? h('div', null,
      h('p', { class: 'mini-title', style: { marginTop: '10px' } }, 'Due to you, not received yet'),
      rowList(rows.map((r) => ({ lead: dateChip(r.due), title: r.name, sub: r.overdue ? h('span', { class: 'neg' }, 'Overdue since ' + shortDate(r.due)) : r.dueToday ? h('span', { class: 'warn' }, 'Due today') : 'Due ' + shortDate(r.due), value: money(r.dueAmount ?? r.expected ?? 0), tone: r.overdue ? 'neg' : r.dueToday ? 'warn' : '' }))),
      h('p', { class: 'summary-line' }, `Waiting for ${money(rows.reduce((a, r) => a + (r.dueAmount ?? r.expected ?? 0), 0))}`, over.length ? h('span', { class: 'neg' }, ` · ${over.length} overdue`) : null, today.length ? h('span', { class: 'warn' }, ` · ${today.length} due today`) : null)) : null,
    bankGap ? (bankGap.short
      ? h('div', { class: 'bank-gap' }, rowList([{ title: 'Income Bond · not in the bank yet', sub: `due so far ${money(bankGap.due)}, bank shows ${money(bankGap.credited)} · tap for details`, onClick: () => bankGapDialog(bankGap), value: h('span', { class: 'warn' }, money(bankGap.gap)), valueSub: h('span', { class: 'warn' }, 'to check') }]))
      : h('p', { class: 'note bank-ok' }, '✓ Bank check: ', money(bankGap.due), ' of bond interest due so far, ', money(bankGap.credited), ' credited. ', h('a', { href: 'javascript:void 0', onclick: (e) => { e.preventDefault(); bankGapDialog(bankGap); } }, 'Details'))) : null);
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
          onClick: r.bonds ? () => pendingBonds(r.bonds, selMonth) : isCur && canEdit() && r.expected - r.received > 1 ? () => fixIncome(r.name, selMonth) : null,
          valueSub: r.expected - r.received > 0 ? h('span', { class: 'warn' }, money(r.expected - r.received) + ' pending') : '✓ received',
        }))),
        isCur ? toReceiveExtras(data, all, mc) : null),
      h('div', null,
        h('p', { class: 'mini-title' }, 'Expenses'),
        h('p', { class: 'big-line' }, h('b', null, money(spent)), h('span', { class: 'muted' }, ' spent')),
        spend.length ? hbars(spend.map((s) => ({ label: s.name, value: s.amount, cats: s.cats })), { fmt: money, colorIndex: 1, onClick: (x) => expenseDrill(selMonth, x.label, x.cats) }) : h('p', { class: 'empty' }, 'No expenses recorded in this month.'),
        spend.length ? h('p', { class: 'note' }, 'Tap a category or its amount to see what it is made of.') : null,
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
    place(actionCentre(data, all), 'span-12'),
    place(thisMonth(data, all, months), 'span-12'),
    place(investCard(data, all, plan), 'span-12'),
    place(allocation(all), 'span-7'), place(riskAlerts(all), 'span-5'),
    place(returnsCard(data, all, rets, ox), 'span-12'),
    place(netWorthHistory(data, all), 'span-12')];
  root.append(...parts.filter(Boolean));
  return root;
}
