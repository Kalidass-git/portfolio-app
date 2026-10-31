import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import * as prices from '../prices.js';
import { h, monthLabel, money, dec, pct, dateStr, gainText, section, table, btn, formDialog, dialog, canEdit, toast, stat, num, segTabs, subTab, posNeg, icon, monthOptions } from '../ui.js';
import { meter, strip, legend } from '../charts.js';
import { insights, sold } from './equity-insights.js';
import * as dividends from './dividends.js';
import * as importView from './equity-import.js';
import * as holdingView from './equity-holding.js';
import * as watchView from './watch.js';
import * as W from '../watch.js';
import * as fundView from './equity-fund.js';
import { fundForm, linkFund } from './equity-fund.js';
import { xirrFor, symKey } from '../trades.js';
import { stockEditForm } from './equity-holding.js';
import { tradeForm, tradeMode } from './eqshared.js';
import { route } from '../ui.js';
import { sortFilterBar, chipGroup } from '../mobilebar.js';
import { monthlyBuys, lastMonths, byName, planDone } from '../buys.js';
import { barChart } from '../charts.js';

let sortKey = 'current', sortDir = 'desc', busy = false;
const TABS = [['overview', 'Overview'], ['holdings', 'Holdings'], ['watch', 'Watch'], ['manage', 'Manage'], ['history', 'History']];
const rerender = () => window.dispatchEvent(new Event('rerender'));

function stockForm(s, kind) {
  const isNew = !s;
  formDialog({
    title: isNew ? (kind === 'etf' ? 'Add ETF' : 'Add share') : 'Edit ' + s.name, value: s || { assetClass: kind || 'equity' },
    fields: [
      { key: 'name', label: 'Company / ETF name', required: true }, { key: 'symbol', label: 'NSE symbol', required: true, hint: 'For example INFY. Used to fetch live prices.' },
      { key: 'qty', label: 'Quantity', type: 'number', required: true, half: true }, { key: 'avgPrice', label: 'Average buy price (₹)', type: 'number', required: true, half: true },
      { key: 'price', label: 'Last price (₹)', type: 'number', required: true, hint: 'Replaced automatically when prices are refreshed.' },
      { key: 'assetClass', label: 'Kind', type: 'select', options: [{ value: 'equity', label: 'Share' }, { value: 'etf', label: 'ETF' }, { value: 'goldetf', label: 'Gold ETF' }] },
      { key: 'buyDate', label: 'First bought on (optional, for XIRR)', type: 'date' },
    ],
    onSave: (v) => { if (!v.buyDate) delete v.buyDate; mutate((d) => { if (isNew) d.stocks.push({ id: nextId('s', d.stocks), ...v }); else { const t = d.stocks.find((x) => x.id === s.id); if (v.price !== t.price) delete t.prevClose; Object.assign(t, v); } }); },
    onDelete: isNew ? null : () => mutate((d) => { d.stocks = d.stocks.filter((x) => x.id !== s.id); }),
  });
}
function sipForm(p) {
  const isNew = !p;
  formDialog({
    title: isNew ? 'Add monthly investment' : 'Edit ' + p.name,
    value: p ? { ...p, doneThisMonth: sipDone(p) } : {},
    fields: [{ key: 'name', label: 'Where', required: true }, { key: 'monthly', label: 'Planned each month (₹)', type: 'number', required: true },
      { key: 'match', label: 'Find its buys by (optional)', hint: 'Words from the name in your history, separated by commas. Leave empty to match by name. For example: nifty bees, niftybees.' },
      { key: 'manual', label: 'Type the amount myself instead of reading my buy history', type: 'checkbox' },
      { key: 'doneThisMonth', label: 'Invested this month so far (₹)', type: 'number', showIf: (v) => v.manual }],
    onSave: (v) => mutate((d) => { v.manual = !!v.manual; v.doneThisMonth = v.doneThisMonth || 0; v.doneMonth = C.monthKey(S.all.asOf); if (isNew) d.sipPlans.push({ id: nextId('sip', d.sipPlans), ...v }); else Object.assign(d.sipPlans.find((x) => x.id === p.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.sipPlans = d.sipPlans.filter((x) => x.id !== p.id); }),
  });
}

/** What was invested this month. The figure resets by itself when a new month starts. */
const manualDone = (p) => (p.doneMonth && p.doneMonth !== C.monthKey(S.all.asOf) ? 0 : p.doneThisMonth || 0);
let histDone = null;
/** Done this month: from your buy history when there is one, unless the line is set to manual. */
const sipDone = (p) => {
  const buys = monthlyBuys(S.data);
  if (!Object.keys(buys).length || p.manual) return manualDone(p);
  if (!histDone || histDone.key !== S.data.updatedAt + '|' + S.data.sipPlans.length) histDone = { key: S.data.updatedAt + '|' + S.data.sipPlans.length, v: planDone(S.data.sipPlans, buys, C.monthKey(S.all.asOf)) };
  return histDone.v.byPlan.get(p.id) || 0;
};
const fromHistory = (p) => Object.keys(monthlyBuys(S.data)).length > 0 && !p.manual;

/** "just now", "5 min ago", "3 hours ago", "2 days ago" */
export function agoText(ms) {
  const m = Math.floor(ms / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const hr = Math.floor(m / 60);
  if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
  const d = Math.floor(hr / 24);
  return d + (d === 1 ? ' day ago' : ' days ago');
}
export async function refresh(btnEl) {
  if (busy) return;
  busy = true; btnEl.disabled = true;
  const lb = btnEl.querySelector('.lb') || btnEl, label0 = lb.textContent;
  btnEl.classList.add('busy');
  try {
    const res = await prices.refreshAll((m) => (lb.textContent = m));
    let ind = { errors: [] };
    try { ind = await W.refreshMetrics(W.targetsOf(S.data, S.all), (m) => (lb.textContent = m)); } catch (e) { ind.errors.push(e.message); }
    const errs = res.errors.concat(ind.errors);
    toast(`Updated ${res.stocks} shares and ${res.funds} funds` + (errs.length ? `. ${errs.length} issue${errs.length > 1 ? 's' : ''}: ${errs[0]}` : ''), errs.length ? 'bad' : '');
  } finally { busy = false; lb.textContent = label0; btnEl.classList.remove('busy'); btnEl.disabled = false; rerender(); }
}

const dayCell = (x) => (x.day == null ? h('span', { class: 'muted' }, '–') : h('span', { class: posNeg(x.day) }, (x.day > 0 ? '+' : x.day < 0 ? '−' : '') + money(Math.abs(x.day)), h('small', { class: 'sub' }, ' ' + (x.dayPct > 0 ? '+' : '') + pct(x.dayPct, 2))));
const signedPct = (n, d = 2) => (n > 0 ? '+' : n < 0 ? '−' : '') + pct(Math.abs(n), d);
const signedMoney = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));

let todayScope = 'shares';
const isEtf = (x) => x.assetClass && x.assetClass !== 'equity';
/** Totals for one group of holdings (shares, ETFs or funds). */
function totalsOf(items) {
  const priced = items.filter((x) => x.day != null);
  const day = priced.reduce((a, x) => a + x.day, 0), base = priced.reduce((a, x) => a + x.current - x.day, 0);
  const invested = items.reduce((a, x) => a + x.invested, 0), current = items.reduce((a, x) => a + x.current, 0);
  return { items, day, dayPct: base ? day / base : 0, dayCount: priced.length, invested, current, pl: current - invested, ret: invested ? (current - invested) / invested : 0 };
}
const groups = () => {
  const { all } = S;
  return { shares: totalsOf(all.stocks.items.filter((x) => !isEtf(x))), etfs: totalsOf(all.stocks.items.filter(isEtf)), funds: totalsOf(all.mf.items) };
};
/** Yearly return of a group of shares or ETFs, from the dated trades. Null when there are no dated trades (hand-typed holdings). */
function groupXirr(items) {
  const eq = S.all.stocks.eq;
  if (!eq || !items.length) return null;
  const syms = items.map((x) => symKey(x.symbol));
  if ((S.data.trades || []).some((t) => t.src === 'opening' && syms.includes(symKey(t.symbol)))) return null;
  const v = xirrFor(eq, syms, items.reduce((a, x) => a + x.current, 0), S.all.asOf);
  return v == null || !isFinite(v) ? null : v;
}
const xiText = (v) => (v == null ? null : h('span', null, ' · XIRR ', h('span', { class: posNeg(v) }, pct(v, 1))));
const GROUP_LABEL = { shares: 'Shares', etfs: 'ETFs', funds: 'Mutual funds' };

/**
 * Summary cards above a holdings list. Phone: two cards, Invested first (with what it is worth now and the XIRR), then Gain / loss for overall and for today, each with its percentage.
 * Desktop: three cards as before (value, gain, today). Both sets use .eq-sum so every figure has the same size; CSS shows one set per screen size.
 */
function summaryCards(label, g, xi) {
  const dayOk = g.dayCount > 0;
  const glRow = (cap, n, p, ok = true, none = '') => h('div', { class: 'gl-row' }, h('span', { class: 'gl-cap' }, cap),
    ok ? h('div', { class: 'gl-line ' + posNeg(n) }, h('strong', { class: 'stat-value' }, gainText(n)), h('small', null, signedPct(p, 2)))
      : h('div', { class: 'gl-line' }, h('strong', { class: 'stat-value' }, '–'), none ? h('small', { class: 'muted' }, none) : null));
  // first card: what it is worth now is the big figure, what was put in sits under it
  const valueCard = h('div', { class: 'stat val-card' }, h('span', { class: 'stat-label' }, 'Current value'),
    h('strong', { class: 'stat-value val-big' }, money(g.current)),
    h('span', { class: 'val-inv' }, 'Invested ', h('b', null, money(g.invested))),
    h('span', { class: 'stat-sub' }, `${g.items.length} holdings`, xi == null ? null : h('span', null, ' · XIRR ', h('b', { class: posNeg(xi) }, pct(xi, 1)))));
  const glCard = h('div', { class: 'stat gl-card' }, h('span', { class: 'stat-label' }, 'Gain / loss'), glRow('Overall', g.pl, g.ret), glRow('Today', g.day, g.dayPct, dayOk, 'refresh prices'));
  return h('div', { class: 'eq-sum-wrap' }, h('div', { class: 'stats eq-sum eq-sum-m' }, valueCard, glCard),
    // desktop keeps three cards: value (with invested), overall gain, today
    h('div', { class: 'stats eq-sum eq-sum-d' }, valueCard.cloneNode(true),
      stat('Gain / loss', h('span', { class: posNeg(g.pl) }, gainText(g.pl)), h('span', { class: posNeg(g.pl) }, signedPct(g.ret, 2)), 'gain-card'),
      stat('Today', dayOk ? h('span', { class: posNeg(g.day) }, signedMoney(g.day)) : '–', dayOk ? signedPct(g.dayPct) : 'refresh prices')));
}

function today(root) {
  const { all, data } = S;
  const g = groups();
  const total = all.stocks.day + all.mf.day, base = all.stocks.current + all.mf.current - total;
  const have = all.stocks.dayCount + all.mf.dayCount;
  const upd = data.settings.pricesUpdatedAt;
  const when = upd ? new Date(upd).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  if (!have) {
    root.append(section('Today', h('div', null,
      h('p', null, 'No day-by-day prices yet. Press ', h('b', null, 'Refresh prices'), ' to fetch today’s share prices and fund NAVs. After that this page shows how much your shares, ETFs and funds moved today, and which ones moved most.'),
      h('p', { class: 'note' }, 'Share prices come through your Google Drive backend (Settings). Fund NAVs need each fund to be linked once on the Funds tab.'))));
    return;
  }
  const tile = (k) => { const t = g[k]; return h('a', { class: 'stat' + (todayScope === k ? ' on' : ''), href: 'javascript:void 0', onclick: (e) => { e.preventDefault(); todayScope = k; rerender(); }, style: { textDecoration: 'none', color: 'inherit', cursor: 'pointer' } },
    h('span', { class: 'stat-label' }, GROUP_LABEL[k]), h('strong', { class: 'stat-value ' + posNeg(t.day) }, t.dayCount ? signedMoney(t.day) : '–'),
    h('span', { class: 'stat-sub ' + posNeg(t.day) }, t.dayCount ? signedPct(t.dayPct) + ` · ${t.dayCount} of ${t.items.length} priced` : 'no day price yet')); };
  root.append(h('div', { class: 'stats' }, tile('shares'), tile('etfs'), tile('funds'),
    h('div', { class: 'stat today' }, h('span', { class: 'stat-label' }, 'All together'), h('strong', { class: 'stat-value ' + posNeg(total) }, signedMoney(total)), h('span', { class: 'stat-sub ' + posNeg(total) }, signedPct(base ? total / base : 0)))));
  root.append(h('nav', { class: 'seg', 'aria-label': 'Group' }, Object.keys(GROUP_LABEL).map((k) => h('a', { href: 'javascript:void 0', class: k === todayScope ? 'on' : '', 'aria-selected': String(k === todayScope), onclick: (e) => { e.preventDefault(); todayScope = k; rerender(); } }, GROUP_LABEL[k]))));
  const t = g[todayScope];
  const movers = t.items.filter((x) => x.day != null).map((x) => ({ name: x.name, day: x.day, dayPct: x.dayPct, value: x.current }));
  const cols = [
    { label: 'Name', get: (x) => x.name },
    { label: 'Today', cls: 'r', render: dayCell },
    { label: 'Value', cls: 'r', get: (x) => money(x.value) },
  ];
  const gain = movers.filter((x) => x.day > 0).sort((a, b) => b.day - a.day).slice(0, 5);
  const lose = movers.filter((x) => x.day < 0).sort((a, b) => a.day - b.day).slice(0, 5);
  const noun = GROUP_LABEL[todayScope].toLowerCase();
  root.append(h('div', { class: 'grid2' },
    section(`Biggest gains today · ${noun}`, table(cols, gain, { empty: `No ${noun} are up today.` })),
    section(`Biggest falls today · ${noun}`, table(cols, lose, { empty: `No ${noun} are down today.` }))));
  const flat = t.items.length - t.dayCount;
  root.append(h('p', { class: 'note' }, `${when ? 'Prices refreshed ' + when + '. ' : ''}Shares, ETFs and funds are listed separately because they behave differently. Change is against the previous close (shares, ETFs) or the previous NAV (funds), in rupees for the quantity you hold. Funds publish one NAV a day, usually in the evening, so a fund can show yesterday’s move until then.${flat ? ` ${flat} ${noun === 'mutual funds' ? 'fund' : 'holding'}${flat > 1 ? 's have' : ' has'} no day-by-day price yet and ${flat > 1 ? 'are' : 'is'} left out.` : ''}`));
}

const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const arrow = (n) => (n > 0 ? '▲ ' : n < 0 ? '▼ ' : '');
const sub2 = (...x) => h('div', { class: 'sub2' }, ...x);
/** Which group an item belongs to, and its share of that group only (a share against all shares, a fund against all funds). */
const isFund = (x) => x.units !== undefined && x.symbol === undefined;
const groupName = (x) => (isFund(x) ? 'funds' : isEtf(x) ? 'ETFs' : 'shares');
const groupBase = (x) => { const g = groups(); return isFund(x) ? g.funds.current : isEtf(x) ? g.etfs.current : g.shares.current; };
const expo = (x) => { const b = groupBase(x); return b > 0 ? x.current / b : 0; };
/** Compact cells: two lines each, colour-coded, so a row fits a phone without sideways scrolling. */
function holdCols(kind, tot) {
  // 'mixed' decides per row, so shares, ETFs and funds can sit in one list
  const isF = (x) => kind === 'fund' || (kind === 'mixed' && isFund(x));
  const mixed = kind === 'mixed';
  const gainLine = (x) => h('span', null, h('span', { class: posNeg(x.pl) }, (x.ret > 0 ? '+' : x.ret < 0 ? '−' : '') + pct(Math.abs(x.ret), 1)), x.xirr != null ? h('span', { class: 'xi' }, ' · XIRR ', h('span', { class: posNeg(x.xirr) }, pct(x.xirr, 1))) : null);
  return [
    { label: kind === 'fund' ? 'Fund' : 'Holding', render: (x) => { const fund = isF(x); return h('div', null, h('div', { class: 'nm' }, x.name, x.assetClass === 'goldetf' ? h('small', { class: 'tag' }, 'Gold') : (!fund && isEtf(x) ? h('small', { class: 'tag' }, 'ETF') : null)),
      sub2(fund ? `${dec(x.units, 3)} units · avg ${dec(x.units ? x.invested / x.units : 0, 2)}` : `${num(x.qty)} sh · avg ${dec(x.avgPrice)}`, fund ? (x.folio ? ' · ' + x.folio : '') : h('span', { class: 'desk-i' }, ' · ' + x.symbol),
        h('span', { class: 'with-meter phone-only-i', title: 'Share of all your ' + groupName(x) }, meter(Math.min(8, expo(x) * 40), 0), pct(expo(x), 1))), fund && canEdit() && !x.schemeCode ? h('button', { class: 'small', style: { marginTop: '4px' }, onclick: (e) => { e.stopPropagation(); linkFund(x); } }, 'Link live NAV') : null); } },
    { label: kind === 'fund' ? 'NAV · today' : mixed ? 'Price / NAV · today' : 'Price · today', cls: 'r pc-price', mob: 'under', mu: (x) => (x.day == null ? null : h('span', { class: posNeg(x.day) }, 'today ' + signed(x.day) + ' (' + pct(Math.abs(x.dayPct || 0), 2) + ')')), render: (x) => { const fund = isF(x); return h('div', null, h('div', null, h('span', { class: 'phone-only-i muted' }, fund ? 'NAV ' : 'Price '), dec(fund ? x.liveNav : x.livePrice, fund ? 4 : 2), fund && x.navDate ? h('small', { class: 'muted', title: 'The date of this NAV' }, ' · ' + dateStr(x.navDate).replace(/ \d{4}$/, '')) : null),
      x.day == null ? sub2('–') : sub2(h('span', { class: posNeg(x.day) }, signed(x.day) + ' (' + pct(Math.abs(x.dayPct || 0), 2) + ')'), h('span', { class: 'phone-only-i' }, ' today'))); } },
    { label: 'Value (invested)', cls: 'r', render: (x) => h('div', null, h('div', { class: 'b' }, money(x.current)), sub2(h('span', { class: 'desk-i' }, '(' + money(x.invested) + ')'), h('span', { class: 'phone-only-i' }, 'invested ' + money(x.invested)))) },
    { label: 'Gain · return', cls: 'r', render: (x) => h('div', null, h('div', { class: 'b ' + posNeg(x.pl) }, arrow(x.pl) + money(Math.abs(x.pl))), sub2(gainLine(x))) },
    { label: 'Exposure', cls: 'r', show: 'desk', render: (x) => h('span', { class: 'with-meter', title: 'Share of all your ' + groupName(x) }, meter(Math.min(8, expo(x) * 40), 0), pct(expo(x), 1)) },
  ];
}
/** Phone rows for shares, ETFs and funds. First column stays put; today's move sits in the middle (only when a day price exists); the last column cycles. */
function holdMobile(kind) {
  const mixed = kind === 'mixed', isF = (x) => kind === 'fund' || (mixed && isFund(x));
  const retTxt = (x) => h('span', { class: posNeg(x.pl) }, (x.ret > 0 ? '+' : x.ret < 0 ? '−' : '') + pct(Math.abs(x.ret), 1));
  const xirrTxt = (x) => (x.xirr == null ? null : h('span', null, 'XIRR ', h('span', { class: posNeg(x.xirr) }, pct(x.xirr, 1))));
  return {
    key: kind === 'fund' ? 'funds' : mixed ? 'all' : 'shares', head: kind === 'fund' ? 'Fund' : 'Holding', midHead: 'Today',
    first: (x) => { const fund = isF(x); return ({ title: x.name, tag: x.assetClass === 'goldetf' ? 'Gold' : (!fund && isEtf(x) ? 'ETF' : fund && mixed ? 'Fund' : null), sub: fund ? `${dec(x.units, 3)} units` : `${num(x.qty)} ${x.qty === 1 ? 'share' : 'shares'}`,
      extra: fund && canEdit() && !x.schemeCode ? h('button', { class: 'small', style: { marginTop: '4px' }, onclick: (e) => { e.stopPropagation(); linkFund(x); } }, 'Link live NAV') : null }); },
    mid: (x) => (x.day == null ? null : h('div', null, h('div', { class: posNeg(x.day) }, arrow(x.day) + money(Math.abs(x.day))), h('div', { class: posNeg(x.day) }, pct(Math.abs(x.dayPct || 0), 2)))),
    views: [
      { label: 'Value · Invested', main: (x) => money(x.current), sub: (x) => '(' + money(x.invested) + ')' },
      { label: 'Gain · Return', main: (x) => h('span', { class: posNeg(x.pl) }, arrow(x.pl) + money(Math.abs(x.pl))), sub: retTxt },
      { label: 'Gain · XIRR', main: (x) => h('span', { class: posNeg(x.pl) }, arrow(x.pl) + money(Math.abs(x.pl))), sub: xirrTxt },
      { label: (kind === 'fund' ? 'NAV' : mixed ? 'Price / NAV' : 'Price') + ' · Average', main: (x) => dec(isF(x) ? x.liveNav : x.livePrice, isF(x) ? 4 : 2), sub: (x) => 'avg ' + dec(isF(x) ? (x.units ? x.invested / x.units : 0) : x.avgPrice, 2) + (isF(x) && x.navDate ? ' · NAV of ' + dateStr(x.navDate).replace(/ \d{4}$/, '') : '') },
      { label: 'Share of ' + (kind === 'fund' ? 'funds' : 'group') + ' · XIRR', main: (x) => pct(expo(x), 1), sub: (x) => (x.xirr == null ? null : h('span', { class: posNeg(x.xirr) }, 'XIRR ' + pct(x.xirr, 1))) },
    ],
  };
}
const compactTable = (wrap) => { const t = wrap.querySelector('table'); if (t) t.classList.add('compact'); return wrap; };
const SORTS = [['current', 'Value'], ['exposure', 'Exposure (share within its group)'], ['day', 'Today'], ['ret', 'Return %'], ['pl', 'Gain in ₹'], ['xirr', 'XIRR'], ['name', 'Name']];
const sortVal = (x) => (sortKey === 'invested' ? x.invested : sortKey === 'qty' ? (isFund(x) ? x.units : x.qty) : sortKey === 'name' ? String(x.name || '').toLowerCase() : sortKey === 'exposure' ? expo(x) : sortKey === 'ret' ? x.ret : sortKey === 'pl' ? x.pl : sortKey === 'xirr' ? (x.xirr ?? -9) : sortKey === 'day' ? (x.dayPct ?? -9) : x.current);
/** Ascending or descending, as chosen. Names start A to Z and numbers highest first until the choice is changed. */
const sortItems = (items) => items.slice().sort((a, b) => { const x = sortVal(a), y = sortVal(b), c = typeof x === 'string' ? x.localeCompare(y) : x - y; return sortDir === 'desc' ? -c : c; });
/** Phone: Sort opens a bottom sheet over the same sortKey / sortDir the desktop selects use. Fields the desktop list does not offer (invested, quantity) only exist here. */
const mobileSort = () => sortFilterBar({ filterFirst: true, filters: typeFilters(), sort: { value: sortKey, dir: sortDir, apply: (v, d) => { sortKey = v; sortDir = d; rerender(); }, options: [
  { value: 'current', label: 'Current value', kind: 'num' }, { value: 'invested', label: 'Invested amount', kind: 'num' }, { value: 'pl', label: 'Gain in ₹', kind: 'num' }, { value: 'ret', label: 'Return %', kind: 'num' },
  { value: 'xirr', label: 'XIRR', kind: 'num' }, { value: 'day', label: 'Day change %', kind: 'num' }, { value: 'exposure', label: 'Share of its group', kind: 'num' }, { value: 'qty', label: 'Shares / units held', kind: 'num' }, { value: 'name', label: 'Name', kind: 'text' }] } });
const sortBox = () => h('span', { class: 'inline-label desk-ctl', style: { display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
  h('label', { class: 'inline-label' }, 'Sort by ', h('select', { 'aria-label': 'Sort by', onchange: (e) => { sortKey = e.target.value; sortDir = sortKey === 'name' ? 'asc' : 'desc'; rerender(); } },
    SORTS.map(([v, l]) => h('option', { value: v, selected: v === sortKey }, l)))),
  h('select', { 'aria-label': 'Sort direction', onchange: (e) => { sortDir = e.target.value; rerender(); } },
    [['desc', 'Descending'], ['asc', 'Ascending']].map(([v, l]) => h('option', { value: v, selected: v === sortDir }, l))));
/** Sort on the left, find box on the right, just above the table. */
/** What the Holdings list shows: any mix of shares, ETFs and mutual funds. All three are on until you switch some off (at least one stays on). */
const KINDS = [{ value: 'shares', label: 'Shares' }, { value: 'etfs', label: 'ETFs' }, { value: 'funds', label: 'Mutual funds' }];
const ALL_KINDS = KINDS.map((k) => k.value);
let typeSel = ALL_KINDS.slice();
const setType = (list) => { const l = ALL_KINDS.filter((k) => (list || []).includes(k)); typeSel = l.length ? l : ALL_KINDS.slice(); if (location.hash.includes('?')) location.hash = '#/equity/holdings'; else rerender(); };
const typeChips = () => h('div', { class: 'chipset-inline desk-ctl' }, h('span', { class: 'lab' }, 'Show'), chipGroup(KINDS, typeSel, setType, { label: 'Type of holding' }));
const kindsText = (sel) => { const t = sel.filter((k) => k !== 'funds').map((k) => (k === 'shares' ? 'Shares' : 'ETFs')); return (t.length === 2 ? ['Shares & ETFs'] : t).concat(sel.includes('funds') ? ['Mutual funds'] : []).join(' + '); };
const typeFilters = () => ({ fields: [{ key: 'type', label: 'Show', type: 'chips', options: KINDS, default: ALL_KINDS.slice(), chip: (v) => 'Showing ' + kindsText(v.type) }], values: { type: typeSel.slice() }, apply: (v) => setType(v.type) });
/** Type filter on the left, then sort, then the find box (computer only) above the list. */
const tableTools = () => h('div', { class: 'tbl-tools' }, mobileSort(), typeChips(), sortBox(), searchBox());
const totalRow = (g, label) => h('div', { class: 'totalbar' }, h('b', null, label + ' total'), h('span', null, money(g.current), h('small', null, ' (' + money(g.invested) + ')')), h('span', { class: posNeg(g.pl) }, arrow(g.pl) + money(Math.abs(g.pl)), h('small', null, ' ' + pct(Math.abs(g.ret), 1))), g.dayCount ? h('span', { class: posNeg(g.day) }, 'today ' + signed(g.day)) : null);

/** The one Holdings list. The type filter picks what it holds: everything, shares, ETFs, shares and ETFs, or mutual funds. */
function holdingsTab(root) {
  const { data, all } = S;
  const gr = groups(), mf = all.mf;
  const stocks = totalsOf(gr.shares.items.concat(gr.etfs.items));
  const has = (k) => typeSel.includes(k), one = typeSel.length === 1 ? typeSel[0] : null;
  const g = one === 'shares' ? gr.shares : one === 'etfs' ? gr.etfs : one === 'funds' ? mf : !has('funds') ? stocks : has('shares') && has('etfs') ? totalsOf(stocks.items.concat(mf.items)) : totalsOf((has('shares') ? gr.shares : gr.etfs).items.concat(mf.items));
  const all3 = typeSel.length === 3;
  const label = all3 ? 'All holdings' : kindsText(typeSel);
  const xi = one === 'funds' ? mf.xirr : has('funds') ? null : groupXirr(g.items);
  const kind = one === 'funds' ? 'fund' : has('funds') ? 'mixed' : 'stock';
  root.append(summaryCards(label, g, xi));
  const goRow = (x) => { if (isFund(x)) location.hash = '#/equity/fund?id=' + encodeURIComponent(x.id); else if (tradeMode()) location.hash = '#/equity/holding?sym=' + encodeURIComponent(x.symbol); else if (canEdit()) stockForm(data.stocks.find((y) => y.id === x.id)); };
  const funds = one === 'funds';
  root.append(section(label, h('div', null,
    tableTools(),
    compactTable(table(holdCols(kind, g.current), sortItems(g.items), { mobile: holdMobile(kind), empty: 'Nothing here yet.', onRow: goRow })),
    totalRow(g, label),
    h('p', { class: 'note' }, funds ? 'Tap a fund to see its buy history, record another buy or sell, and edit it. XIRR appears for funds with dated transactions (imported from Groww or recorded here).'
      : (tradeMode() ? 'Tap a holding to buy more, sell, see its purchase lots and XIRR, or add a split, bonus or dividend. Gain is value now minus what you put in. XIRR appears for holdings with dated buys that are over a month old.' : 'Import your Groww history (Import tab) to unlock buy and sell tracking and XIRR. Tap a holding to edit it.') + (kind === 'mixed' ? ' Funds are listed with the shares and ETFs; the summary XIRR is left out for the mixed list, so pick shares and ETFs, or funds, to see it.' : ''))),
    // not on phones: buys are recorded from a holding or on the computer
    canEdit() ? [btn(funds ? 'Add fund' : tradeMode() ? 'Record a buy' : one === 'etfs' ? 'Add ETF' : 'Add share', () => (funds ? fundForm() : tradeMode() ? tradeForm(null, { type: 'BUY' }) : stockForm(null, one === 'etfs' ? 'etf' : 'equity')), 'primary desk-ctl')] : null));
}

// ---------- search across everything you hold or sold ----------
let searchQ = '';
function findAll(q) {
  const t = q.trim().toLowerCase(); if (!t) return [];
  const { all, data } = S, out = [];
  const hit = (...f) => f.some((x) => (x || '').toLowerCase().includes(t));
  for (const x of all.stocks.items) if (hit(x.name, x.symbol)) out.push({ kind: isEtf(x) ? 'ETF' : 'Share', title: x.name, sub: x.symbol, value: money(x.current), tone: posNeg(x.pl), go: () => { if (tradeMode()) location.hash = '#/equity/holding?sym=' + encodeURIComponent(x.symbol); else location.hash = '#/equity/holdings' + (isEtf(x) ? '?f=etfs' : '?f=shares'); } });
  for (const x of all.mf.items) if (hit(x.name, x.folio)) out.push({ kind: 'Fund', title: x.name, sub: x.folio ? 'Folio ' + x.folio : '', value: money(x.current), tone: posNeg(x.pl), go: () => { location.hash = '#/equity/holdings?v=funds'; } });
  const eq = all.stocks.eq;
  if (eq) for (const x of eq.sold) if (hit(x.name, x.symbol, x.nowSymbol)) out.push({ kind: 'Sold', title: x.name, sub: x.symbol, value: '', tone: '', go: () => { location.hash = '#/equity/history?v=sold'; } });
  return out.slice(0, 12);
}
function searchBox() {
  const list = h('ul', { class: 'search-results', role: 'listbox' });
  const draw = () => {
    const r = findAll(searchQ);
    list.replaceChildren(...(searchQ.trim() ? (r.length ? r.map((x) => h('li', { role: 'option', tabindex: 0, onclick: () => { searchQ = ''; x.go(); rerender(); }, onkeydown: (e) => { if (e.key === 'Enter') { searchQ = ''; x.go(); rerender(); } } },
      h('span', { class: 'tag k-' + x.kind.toLowerCase() }, x.kind), h('span', { class: 'sr-main' }, h('b', null, x.title), h('small', null, x.sub)), h('span', { class: x.tone }, x.value))) : [h('li', { class: 'muted' }, 'No holding matches “' + searchQ + '”.')]) : []));
  };
  const input = h('input', { type: 'search', placeholder: 'Find by name or symbol…', 'aria-label': 'Find a holding', value: searchQ, oninput: (e) => { searchQ = e.target.value; draw(); }, onkeydown: (e) => { if (e.key === 'Enter') { const r = findAll(searchQ)[0]; if (r) { searchQ = ''; r.go(); rerender(); } } } });
  draw();
  return h('div', { class: 'eq-search desk-ctl' }, input, list);
}

let planMonth = null, planSpan = 6;
const GROUP_NAME = { shares: 'Shares', etfs: 'ETFs', funds: 'Funds' };
/** What was actually bought in a month, a month filter, and a chart of the last few months. */
function plannerBuys(data) {
  const cur = C.monthKey(S.all.asOf), buys = monthlyBuys(data);
  const keys = [...new Set([cur, ...Object.keys(buys)])].sort().reverse();
  if (!planMonth || !keys.includes(planMonth)) planMonth = cur;
  const b = buys[planMonth] || { shares: 0, etfs: 0, funds: 0, total: 0, items: [] };
  const planned = data.sipPlans.reduce((a, p) => a + p.monthly, 0);
  const mSel = h('select', { 'aria-label': 'Month', onchange: (e) => { planMonth = e.target.value; rerender(); } }, monthOptions(keys, planMonth, (k) => monthLabel(k) + (k === cur ? ' (this month)' : '')));
  const nSel = h('select', { 'aria-label': 'Months in chart', onchange: (e) => { planSpan = +e.target.value; rerender(); } }, [3, 6, 12, 24].map((n) => h('option', { value: n, selected: n === planSpan }, 'Last ' + n + ' months')));
  const wrap = h('div', null);
  wrap.append(
    h('div', { class: 'filters' }, h('label', null, 'Month ', mSel), h('label', null, 'Chart ', nSel)),
    h('div', { class: 'stats' },
      stat('Bought in ' + monthLabel(planMonth), money(b.total), planned ? `plan ${money(planned)} · ${b.total >= planned ? 'on target' : money(planned - b.total) + ' to go'}` : `${b.items.length} purchases`),
      stat('Shares', money(b.shares), ''), stat('ETFs', money(b.etfs), ''), stat('Funds', money(b.funds), '')));
  const rows = byName(b.items);
  wrap.append(table([
    { label: 'Bought', host: true, get: (r) => r.name }, { label: 'Type', mob: 'under', get: (r) => GROUP_NAME[r.group] }, { label: 'Times', mob: 'under', mlabel: 'times ', cls: 'r', get: (r) => String(r.count) },
    { label: 'Last on', mob: 'under', mlabel: 'last ', get: (r) => dateStr(r.last) }, { label: 'Amount', cls: 'r', get: (r) => money(r.amount), total: () => money(b.total) },
  ], rows, { footer: { label: 'Total' }, empty: 'No purchases recorded in this month.' }));
  const months = lastMonths(cur, planSpan);
  if (!Object.keys(buys).length) wrap.append(h('p', { class: 'note' }, 'Purchases appear here once your Groww files are imported or you add buys. Holdings entered by hand without dates are not counted.'));
  else wrap.append(barChart({ names: ['Shares', 'ETFs', 'Funds'], fmt: money, groups: months.map((m) => { const x = buys[m] || {}; return { label: monthLabel(m).slice(0, 3) + (m.endsWith('-01') ? " '" + m.slice(2, 4) : ''), title: monthLabel(m) + ' · total ' + money(x.total || 0), values: [x.shares || 0, x.etfs || 0, x.funds || 0] }; }) }),
    h('p', { class: 'note' }, 'Average per month over this period: ' + money(months.reduce((a, m) => a + ((buys[m] || {}).total || 0), 0) / months.length)));
  return section('Invested in ' + monthLabel(planMonth), wrap);
}

export function render() {
  const { all, data } = S;
  const root = h('div', { class: 'page' });
  if (route().sub === 'holding') { holdingView.render(root); return root; }
  if (route().sub === 'fund') { fundView.render(root); return root; }
  const rsub = route().sub;
  const LEGACY = { today: '#/equity/overview', alerts: '#/equity/watch?v=alerts', funds: '#/equity/holdings?v=funds', insights: '#/equity/watch?v=insights', sold: '#/equity/history?v=sold', dividends: '#/equity/history?v=dividends', sip: '#/equity/manage?v=planner', import: '#/equity/manage?v=import', stocks: '#/equity/holdings?v=stocks&f=shares', etfs: '#/equity/holdings?v=stocks&f=etfs' };
  if (LEGACY[rsub]) { location.replace(LEGACY[rsub]); return root; }
  const visible = TABS.filter((t) => t[0] !== 'manage' || canEdit());
  const tab = visible.some((t) => t[0] === rsub) ? rsub : 'overview';
  const q = route().query, view = q.get('v') || (tab === 'holdings' && q.get('f')) || '';
  const st = all.stocks, mf = all.mf;
  const upd = S.data.settings.pricesUpdatedAt, ageMs = upd ? Date.now() - new Date(upd).getTime() : null;
  const stale = ageMs == null || ageMs > 864e5;
  root.append(h('div', { class: 'pagebar' }, segTabs(visible, tab, 'Shares and funds views'),
    // on phones the refresh button and its time only show on Overview
    h('div', { class: 'price-bar inline' + (tab === 'overview' ? '' : ' desk-ctl') },
      h('span', { class: 'stamp' + (stale ? ' warn' : ''), title: (upd ? 'Prices ' + new Date(upd).toLocaleString('en-IN') : '') + (W.metricsAt() ? ' · P/E, 52-week data ' + new Date(W.metricsAt()).toLocaleString('en-IN') : '') }, stale ? '⚠ ' : '', ageMs == null ? 'Prices not fetched yet' : 'Prices updated ' + agoText(ageMs)),
      h('button', { class: 'refresh-btn small', type: 'button', title: 'Fetch latest prices, NAVs, P/E and 52-week data', onclick: (e) => refresh(e.currentTarget) }, h('span', { class: 'ic' }, icon('refresh')), h('span', { class: 'lb' }, 'Refresh')))));

  const sub = (items, cur, extra) => root.append(viewBar(tab, items, cur, extra));
  if (tab === 'overview') {
    watchView.autoRefresh();
    root.append(watchView.triggeredCard());
    today(root);
    const g = groups();
    root.append(section('What you hold', h('div', { class: 'stats' },
      ...['shares', 'etfs', 'funds'].map((k) => stat(GROUP_LABEL[k], money(g[k].current), h('span', null, 'invested ', money(g[k].invested), ' · ', gainText(g[k].pl), ' (', pct(g[k].ret), ')', xiText(k === 'funds' ? all.mf.xirr : groupXirr(g[k].items))))))));
    root.append(watchView.screensSection());
  } else if (tab === 'holdings') {
    // old links: v=funds, v=stocks&f=etfs, f=shares ... pick the type; old sold / dividends links go to History
    if (view === 'sold' || view === 'dividends') { location.replace('#/equity/history?v=' + view); return root; }
    const f = q.get('f'), want = view === 'funds' ? ['funds'] : ['shares', 'etfs'].includes(f) ? [f] : ['shares', 'etfs'].includes(view) ? [view] : view === 'stocks' ? ['shares', 'etfs'] : view === 'all' ? ALL_KINDS : null;
    if (want) typeSel = want.slice();
    holdingsTab(root);
  } else if (tab === 'history') {
    const v = view === 'dividends' ? 'dividends' : 'sold';
    sub([['sold', 'Sold shares'], ['dividends', 'Dividends']], v);
    if (v === 'dividends') dividends.render(root); else sold(root);
  } else if (tab === 'watch') {
    const v = view === 'insights' ? 'insights' : 'alerts';
    sub([['alerts', 'Alerts & watchlist'], ['insights', 'Insights']], v);
    if (v === 'insights') insights(root); else watchView.alertsTab(root);
  } else {
    const v = view === 'import' ? 'import' : 'planner';
    sub([['planner', 'Investment planner'], ['import', 'Import']], v);
    if (v === 'import') importView.render(root); else planner(root);
  }
  return root;
}

/** Second row of choices inside a tab. Real links, so the back button and a refresh keep your place. */
function viewBar(tab, items, cur, cls = '') {
  return h('nav', { class: 'seg sub ' + cls, role: 'tablist', 'aria-label': 'Choose a view' }, items.map(([k, l]) => h('a', { href: `#/equity/${tab}?v=${k}`, role: 'tab', 'aria-selected': k === cur ? 'true' : 'false', class: k === cur ? 'on' : '' }, l)));
}
function planner(root) {
  const { data } = S;
  const plans = data.sipPlans;
  const tot = plans.reduce((a, p) => a + p.monthly, 0), done = plans.reduce((a, p) => a + sipDone(p), 0);
  root.append(section('Plan for the month',
    h('div', null, table([
      { label: 'Where', host: true, get: (p) => p.name },
      { label: 'Each month', cls: 'r', get: (p) => money(p.monthly), total: () => money(tot) },
      { label: 'Each year', mob: 'hide', cls: 'r', get: (p) => money(p.monthly * 12), total: () => money(tot * 12) },
      { label: 'Done this month', cls: 'r', render: (p) => h('span', null, money(sipDone(p)), fromHistory(p) ? h('small', { class: 'sub' }, ' from history') : null), total: () => money(done) },
      { label: 'Left this month', mob: 'under', mlabel: 'left ', cls: 'r', get: (p) => money(Math.max(0, p.monthly - sipDone(p))), total: () => money(Math.max(0, tot - done)) },
      { label: '', render: (p) => (canEdit() && sipDone(p) < p.monthly ? h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); mutate((d) => { const t = d.sipPlans.find((x) => x.id === p.id); t.doneThisMonth = t.monthly; t.manual = true; t.doneMonth = C.monthKey(S.all.asOf); }); toast('Marked as invested'); } }, 'Mark done') : h('span', { class: 'tag good' }, 'Done')) },
    ], plans, { footer: { label: 'Total' }, onRow: canEdit() ? (p) => sipForm(plans.find((x) => x.id === p.id)) : null }),
      h('p', { class: 'note' }, Object.keys(monthlyBuys(data)).length ? 'Done this month is read from your buy history (shares, ETFs and funds), so it follows every purchase you import or record. It resets by itself each month. Lines you set to manual keep the amount you typed.' : 'Done this month is the amount you type or mark. Once your buy history exists (Groww import), it is filled in from that automatically.'),
      (() => { const bd = planDone(plans, monthlyBuys(data), C.monthKey(S.all.asOf)); return bd.other > 0 ? h('p', { class: 'note' }, `Bought this month but not matching any line above: ${money(bd.other)}. Add a line for it, or set “Find its buys by” on the right line.`) : null; })()),
    canEdit() ? [btn('Refresh from history', () => { if (!Object.keys(monthlyBuys(data)).length) return toast('No buy history yet. Import your Groww files first.', 'bad'); mutate((d) => { const bd = planDone(d.sipPlans, monthlyBuys(d), C.monthKey(S.all.asOf)); for (const t of d.sipPlans) { t.manual = false; t.doneThisMonth = bd.byPlan.get(t.id) || 0; t.doneMonth = C.monthKey(S.all.asOf); } }); histDone = null; toast('Updated from your buy history'); }), btn('Add', () => sipForm(), 'primary')] : null));
  root.append(plannerBuys(data));
}

