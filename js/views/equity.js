import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import * as prices from '../prices.js';
import { h, monthLabel, money, dec, pct, dateStr, gainText, section, table, btn, formDialog, dialog, canEdit, toast, stat, num, segTabs, subTab, posNeg, icon, monthOptions } from '../ui.js';
import { meter, strip, legend } from '../charts.js';
import { insights, sold } from './equity-insights.js';
import * as dividends from './dividends.js';
import * as importView from './equity-import.js';
import * as holdingView from './equity-holding.js';
import * as fundView from './equity-fund.js';
import { fundForm, linkFund } from './equity-fund.js';
import { xirrFor, symKey } from '../trades.js';
import { stockEditForm } from './equity-holding.js';
import { tradeForm, tradeMode } from './eqshared.js';
import { route } from '../ui.js';
import { monthlyBuys, lastMonths, byName, planDone } from '../buys.js';
import { barChart } from '../charts.js';

let sortKey = 'current', busy = false;
const TABS = [['today', 'Today'], ['holdings', 'Shares & ETFs'], ['funds', 'Funds'], ['insights', 'Insights'], ['sold', 'Sold'], ['dividends', 'Dividends'], ['sip', 'Investment Planner'], ['import', 'Import']];
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

export async function refresh(btnEl) {
  if (busy) return;
  busy = true; btnEl.disabled = true;
  const lb = btnEl.querySelector('.lb') || btnEl, label0 = lb.textContent;
  btnEl.classList.add('busy');
  try {
    const res = await prices.refreshAll((m) => (lb.textContent = m));
    toast(`Updated ${res.stocks} shares and ${res.funds} funds` + (res.errors.length ? `. ${res.errors.length} issue${res.errors.length > 1 ? 's' : ''}: ${res.errors[0]}` : ''), res.errors.length ? 'bad' : '');
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
  const fund = kind === 'fund';
  return [
    { label: fund ? 'Fund' : 'Holding', render: (x) => h('div', null, h('div', { class: 'nm' }, x.name, x.assetClass === 'goldetf' ? h('small', { class: 'tag' }, 'Gold') : (!fund && isEtf(x) ? h('small', { class: 'tag' }, 'ETF') : null)),
      sub2(fund ? `${dec(x.units, 3)} units · avg ${dec(x.units ? x.invested / x.units : 0, 2)}` : `${num(x.qty)} sh · avg ${dec(x.avgPrice)}`, fund ? (x.folio ? ' · ' + x.folio : '') : ' · ' + x.symbol), fund && canEdit() && !x.schemeCode ? h('button', { class: 'small', style: { marginTop: '4px' }, onclick: (e) => { e.stopPropagation(); linkFund(x); } }, 'Link live NAV') : null) },
    { label: fund ? 'NAV · today' : 'Price · today', cls: 'r', mob: 'under', mu: (x) => (x.day == null ? null : h('span', { class: posNeg(x.day) }, 'today ' + signed(x.day) + ' (' + pct(Math.abs(x.dayPct || 0), 2) + ')')), render: (x) => h('div', null, h('div', null, dec(fund ? x.liveNav : x.livePrice, fund ? 4 : 2)),
      x.day == null ? sub2('–') : sub2(h('span', { class: posNeg(x.day) }, signed(x.day) + ' (' + pct(Math.abs(x.dayPct || 0), 2) + ')'))) },
    { label: 'Value (invested)', cls: 'r', render: (x) => h('div', null, h('div', { class: 'b' }, money(x.current)), sub2('(' + money(x.invested) + ')')) },
    { label: 'Gain · return', cls: 'r', render: (x) => h('div', null, h('div', { class: 'b ' + posNeg(x.pl) }, arrow(x.pl) + money(Math.abs(x.pl))),
      sub2(h('span', { class: posNeg(x.pl) }, (x.ret > 0 ? '+' : x.ret < 0 ? '−' : '') + pct(Math.abs(x.ret), 1)), x.xirr != null ? h('span', { class: 'xi' }, ' · XIRR ', h('span', { class: posNeg(x.xirr) }, pct(x.xirr, 1))) : null)) },
    { label: 'Exposure', cls: 'r', mob: 'under', mlabel: 'exposure ', mu: (x) => pct(expo(x), 1), render: (x) => h('span', { class: 'with-meter', title: 'Share of all your ' + groupName(x) }, meter(Math.min(8, expo(x) * 40), 0), pct(expo(x), 1)) },
  ];
}
const compactTable = (wrap) => { const t = wrap.querySelector('table'); if (t) t.classList.add('compact'); return wrap; };
const SORTS = [['current', 'Value'], ['exposure', 'Exposure (share within its group)'], ['day', 'Today'], ['ret', 'Return %'], ['pl', 'Gain in ₹'], ['xirr', 'XIRR'], ['name', 'Name']];
const sortItems = (items) => items.slice().sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : sortKey === 'exposure' ? expo(b) - expo(a) : sortKey === 'ret' ? b.ret - a.ret : sortKey === 'pl' ? b.pl - a.pl
  : sortKey === 'xirr' ? (b.xirr ?? -9) - (a.xirr ?? -9) : sortKey === 'day' ? (b.dayPct ?? -9) - (a.dayPct ?? -9) : b.current - a.current));
const sortBox = () => h('label', { class: 'inline-label' }, 'Sort by ', h('select', { onchange: (e) => { sortKey = e.target.value; rerender(); } },
  SORTS.map(([v, l]) => h('option', { value: v, selected: v === sortKey }, l))));
/** Sort on the left, find box on the right, just above the table. */
const tableTools = () => h('div', { class: 'tbl-tools' }, sortBox(), searchBox());
const totalRow = (g, label) => h('div', { class: 'totalbar' }, h('b', null, label + ' total'), h('span', null, money(g.current), h('small', null, ' (' + money(g.invested) + ')')), h('span', { class: posNeg(g.pl) }, arrow(g.pl) + money(Math.abs(g.pl)), h('small', null, ' ' + pct(Math.abs(g.ret), 1))), g.dayCount ? h('span', { class: posNeg(g.day) }, 'today ' + signed(g.day)) : null);

/** Shares and ETFs together; switch to see only one. */
function holdingsTab(root) {
  const { data } = S;
  const f = ['all', 'shares', 'etfs'].includes(route().query.get('f')) ? route().query.get('f') : 'all';
  const gr = groups();
  const merged = totalsOf(gr.shares.items.concat(gr.etfs.items));
  const g = f === 'shares' ? gr.shares : f === 'etfs' ? gr.etfs : merged;
  const label = f === 'shares' ? 'Shares' : f === 'etfs' ? 'ETFs' : 'Shares & ETFs';
  const seg = h('nav', { class: 'seg', 'aria-label': 'Show' }, [['all', 'Both'], ['shares', 'Shares only'], ['etfs', 'ETFs only']].map(([k, l]) => h('a', { href: '#/equity/holdings' + (k === 'all' ? '' : '?f=' + k), class: k === f ? 'on' : '', 'aria-selected': String(k === f) }, l + ' (' + (k === 'all' ? merged.items.length : gr[k].items.length) + ')')));
  root.append(h('div', { class: 'stats' },
    stat(label, money(g.current), `${g.items.length} holdings`),
    stat('Invested', money(g.invested), h('span', null, gainText(g.pl), ' (', pct(g.ret), ')', xiText(groupXirr(g.items)))),
    stat('Today', g.dayCount ? h('span', { class: posNeg(g.day) }, signedMoney(g.day)) : '–', g.dayCount ? signedPct(g.dayPct) : 'refresh prices')));
  const items = sortItems(g.items);
  root.append(section(label, h('div', null,
    h('div', { class: 'filters' }, seg), tableTools(),
    compactTable(table(holdCols('stock', g.current), items, { empty: 'Nothing here yet.', onRow: (x) => { if (tradeMode()) location.hash = '#/equity/holding?sym=' + encodeURIComponent(x.symbol); else if (canEdit()) stockForm(data.stocks.find((y) => y.id === x.id)); } })),
    totalRow(g, label),
    h('p', { class: 'note' }, tradeMode() ? 'Tap a holding to buy more, sell, see its purchase lots and XIRR, or add a split, bonus or dividend. Gain is value now minus what you put in. XIRR appears for holdings with dated buys that are over a month old.' : 'Import your Groww history (Import tab) to unlock buy and sell tracking and XIRR. Tap a holding to edit it.')),
    canEdit() ? [btn(tradeMode() ? 'Record a buy' : f === 'etfs' ? 'Add ETF' : 'Add share', () => (tradeMode() ? tradeForm(null, { type: 'BUY' }) : stockForm(null, f === 'etfs' ? 'etf' : 'equity')), 'primary')] : null));
}

function fundsTab(root) {
  const { data, all } = S, mf = all.mf;
  root.append(h('div', { class: 'stats' },
    stat('Mutual funds', money(mf.current), `${mf.items.length} funds`),
    stat('Invested', money(mf.invested), h('span', null, gainText(mf.pl), ' (', pct(mf.ret), ')', xiText(mf.xirr))),
    stat('Today', mf.dayCount ? h('span', { class: posNeg(mf.day) }, signedMoney(mf.day)) : '–', mf.dayCount ? signedPct(mf.dayPct) : 'refresh prices')));
  root.append(section('Mutual funds', h('div', null,
    tableTools(),
    compactTable(table(holdCols('fund', mf.current), sortItems(mf.items), { onRow: (m) => { location.hash = '#/equity/fund?id=' + encodeURIComponent(m.id); } })),
    totalRow(mf, 'Funds'),
    h('p', { class: 'note' }, 'Tap a fund to see its buy history, record another buy or sell, and edit it. XIRR appears for funds with dated transactions (imported from Groww or recorded here).')),
    canEdit() ? [btn('Add fund', () => fundForm(), 'primary')] : null));
}

// ---------- search across everything you hold or sold ----------
let searchQ = '';
function findAll(q) {
  const t = q.trim().toLowerCase(); if (!t) return [];
  const { all, data } = S, out = [];
  const hit = (...f) => f.some((x) => (x || '').toLowerCase().includes(t));
  for (const x of all.stocks.items) if (hit(x.name, x.symbol)) out.push({ kind: isEtf(x) ? 'ETF' : 'Share', title: x.name, sub: x.symbol, value: money(x.current), tone: posNeg(x.pl), go: () => { if (tradeMode()) location.hash = '#/equity/holding?sym=' + encodeURIComponent(x.symbol); else location.hash = '#/equity/holdings' + (isEtf(x) ? '?f=etfs' : '?f=shares'); } });
  for (const x of all.mf.items) if (hit(x.name, x.folio)) out.push({ kind: 'Fund', title: x.name, sub: x.folio ? 'Folio ' + x.folio : '', value: money(x.current), tone: posNeg(x.pl), go: () => { location.hash = '#/equity/funds'; } });
  const eq = all.stocks.eq;
  if (eq) for (const x of eq.sold) if (hit(x.name, x.symbol, x.nowSymbol)) out.push({ kind: 'Sold', title: x.name, sub: x.symbol, value: '', tone: '', go: () => { location.hash = '#/equity/sold'; } });
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
  return h('div', { class: 'eq-search' }, input, list);
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
  if (rsub === 'stocks' || rsub === 'etfs') location.replace('#/equity/holdings' + (rsub === 'etfs' ? '?f=etfs' : '?f=shares'));
  const tab = rsub === 'stocks' || rsub === 'etfs' ? 'holdings' : subTab(TABS.map((t) => t[0]));
  const st = all.stocks, mf = all.mf;
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Shares and funds views'), h('button', { class: 'primary ib', type: 'button', title: 'Refresh prices', 'aria-label': 'Refresh prices', onclick: (e) => refresh(e.currentTarget) }, h('span', { class: 'ic' }, icon('refresh')), h('span', { class: 'lb' }, 'Refresh prices'))));

  if (tab === 'insights') insights(root);
  else if (tab === 'sold') sold(root);
  else if (tab === 'dividends') dividends.render(root);
  else if (tab === 'import') importView.render(root);
  else if (tab === 'today') {
    today(root);
    const g = groups();
    root.append(section('What you hold', h('div', { class: 'stats' },
      ...['shares', 'etfs', 'funds'].map((k) => stat(GROUP_LABEL[k], money(g[k].current), h('span', null, 'invested ', money(g[k].invested), ' · ', gainText(g[k].pl), ' (', pct(g[k].ret), ')', xiText(k === 'funds' ? all.mf.xirr : groupXirr(g[k].items))))))));
  } else if (tab === 'holdings') {
    holdingsTab(root);
  } else if (tab === 'funds') {
    fundsTab(root);
  } else {
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
  return root;
}
