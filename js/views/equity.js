import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import * as prices from '../prices.js';
import { h, monthLabel, money, dec, pct, dateStr, gainText, section, table, btn, formDialog, dialog, canEdit, toast, stat, num, segTabs, subTab, posNeg } from '../ui.js';
import { meter, strip, legend } from '../charts.js';
import { insights, sold } from './equity-insights.js';
import * as importView from './equity-import.js';
import * as holdingView from './equity-holding.js';
import { stockEditForm } from './equity-holding.js';
import { tradeForm, tradeMode } from './eqshared.js';
import { route } from '../ui.js';
import { monthlyBuys, lastMonths, byName } from '../buys.js';
import { barChart } from '../charts.js';

let sortKey = 'current', busy = false;
const TABS = [['today', 'Today'], ['stocks', 'Shares'], ['etfs', 'ETFs'], ['funds', 'Funds'], ['insights', 'Insights'], ['sold', 'Sold'], ['sip', 'Investment Planner'], ['import', 'Import']];
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
function fundForm(m) {
  const isNew = !m;
  formDialog({
    title: isNew ? 'Add mutual fund' : 'Edit ' + m.name, value: m || {},
    fields: [
      { key: 'name', label: 'Scheme name', required: true }, { key: 'folio', label: 'Folio number' },
      { key: 'invested', label: 'Amount invested (₹)', type: 'number', required: true }, { key: 'units', label: 'Units held', type: 'number', required: true },
      { key: 'nav', label: 'Last NAV (₹)', type: 'number', required: true }, { key: 'schemeCode', label: 'Scheme code (for live NAV)', hint: 'Use “Link to live NAV” on the fund row to find it.' },
    ],
    onSave: (v) => mutate((d) => { if (isNew) d.mutualFunds.push({ id: nextId('m', d.mutualFunds), ...v }); else { const t = d.mutualFunds.find((x) => x.id === m.id); if (v.nav !== t.nav) delete t.prevNav; Object.assign(t, v); } }),
    onDelete: isNew ? null : () => mutate((d) => { d.mutualFunds = d.mutualFunds.filter((x) => x.id !== m.id); }),
  });
}
async function linkFund(m) {
  const body = h('div', null, h('p', null, 'Looking for “' + m.name + '”…'));
  const dlg = dialog('Link to live NAV', body, [{ label: 'Close', onclick: (c) => c() }]);
  try {
    const list = await prices.guessScheme(m.name);
    body.replaceChildren(h('p', { class: 'note' }, 'Pick the scheme that matches your fund (direct plan, growth option).'),
      list.length ? h('ul', { class: 'pick' }, list.map((s) => h('li', null, h('button', { class: 'wide', onclick: () => { mutate((d) => { d.mutualFunds.find((x) => x.id === m.id).schemeCode = String(s.schemeCode); }); dlg.close(); toast('Linked. Refresh prices to fetch the NAV.'); } }, s.schemeName, h('small', null, ' code ' + s.schemeCode))))) : h('p', { class: 'empty' }, 'No match found. Enter the scheme code by hand when editing the fund.'));
  } catch (e) { body.replaceChildren(h('p', { class: 'form-error' }, 'Could not search funds: ' + e.message)); }
}
function sipForm(p) {
  const isNew = !p;
  formDialog({
    title: isNew ? 'Add monthly investment' : 'Edit ' + p.name,
    value: p ? { ...p, doneThisMonth: sipDone(p) } : {},
    fields: [{ key: 'name', label: 'Where', required: true }, { key: 'monthly', label: 'Planned each month (₹)', type: 'number', required: true }, { key: 'doneThisMonth', label: 'Invested this month so far (₹)', type: 'number' }],
    onSave: (v) => mutate((d) => { v.doneThisMonth = v.doneThisMonth || 0; v.doneMonth = C.monthKey(S.all.asOf); if (isNew) d.sipPlans.push({ id: nextId('sip', d.sipPlans), ...v }); else Object.assign(d.sipPlans.find((x) => x.id === p.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.sipPlans = d.sipPlans.filter((x) => x.id !== p.id); }),
  });
}

/** What was invested this month. The figure resets by itself when a new month starts. */
const sipDone = (p) => (p.doneMonth && p.doneMonth !== C.monthKey(S.all.asOf) ? 0 : p.doneThisMonth || 0);

export async function refresh(btnEl) {
  if (busy) return;
  busy = true; btnEl.disabled = true;
  const label0 = btnEl.textContent;
  try {
    const res = await prices.refreshAll((m) => (btnEl.textContent = m));
    toast(`Updated ${res.stocks} shares and ${res.funds} funds` + (res.errors.length ? `. ${res.errors.length} issue${res.errors.length > 1 ? 's' : ''}: ${res.errors[0]}` : ''), res.errors.length ? 'bad' : '');
  } finally { busy = false; btnEl.textContent = label0; btnEl.disabled = false; rerender(); }
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

function holdingsTab(root, tab) {
  const { data } = S;
  const etf = tab === 'etfs';
  const g = groups()[etf ? 'etfs' : 'shares'];
  const noun = etf ? 'ETF' : 'share';
  const items = g.items.slice().sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : sortKey === 'ret' ? b.ret - a.ret : sortKey === 'day' ? (b.dayPct ?? -9) - (a.dayPct ?? -9) : b.current - a.current));
  const total = g.current;
  root.append(h('div', { class: 'stats' },
    stat(etf ? 'ETFs' : 'Shares', money(g.current), `${items.length} holdings`),
    stat('Invested', money(g.invested), h('span', null, gainText(g.pl), ' (', pct(g.ret), ')')),
    stat('Today', g.dayCount ? h('span', { class: posNeg(g.day) }, signedMoney(g.day)) : '–', g.dayCount ? signedPct(g.dayPct) : 'refresh prices')));
  root.append(section(etf ? 'ETFs' : 'Shares',
    h('div', null,
      h('div', { class: 'filters' }, h('label', { class: 'inline-label' }, 'Sort by ', h('select', { onchange: (e) => { sortKey = e.target.value; rerender(); } },
        [['current', 'Value'], ['day', 'Today'], ['ret', 'Return'], ['name', 'Name']].map(([v, l]) => h('option', { value: v, selected: v === sortKey }, l))))),
      table([
        { label: 'Name', render: (s) => h('span', null, s.name, s.assetClass === 'goldetf' ? h('small', { class: 'tag' }, 'Gold') : null) },
        { label: 'Today', cls: 'r', render: dayCell, total: () => (g.dayCount ? h('span', { class: posNeg(g.day) }, signedMoney(g.day)) : '') },
        { label: 'Price', cls: 'r', get: (s) => dec(s.livePrice) },
        { label: 'Qty', cls: 'r', get: (s) => num(s.qty) },
        { label: 'Avg price', cls: 'r', get: (s) => dec(s.avgPrice) },
        { label: 'Invested', cls: 'r', get: (s) => money(s.invested), total: () => money(g.invested) },
        { label: 'Value', cls: 'r', get: (s) => money(s.current), total: () => money(g.current) },
        { label: 'Gain', cls: 'r', render: (s) => gainText(s.pl), total: () => money(g.pl) },
        { label: 'Return', cls: 'r', render: (s) => h('span', { class: s.ret >= 0 ? 'pos' : 'neg' }, pct(s.ret)), total: () => pct(g.ret) },
        { label: 'Weight', cls: 'r', render: (s) => h('span', { class: 'with-meter' }, meter(total ? (s.current / total) * 8 : 0, 0), pct(total ? s.current / total : 0)) },
      ], items, { footer: { label: 'Total' }, empty: `No ${noun}s yet.`, onRow: (s) => { if (tradeMode()) location.hash = '#/equity/holding?sym=' + encodeURIComponent(s.symbol); else if (canEdit()) stockForm(data.stocks.find((x) => x.id === s.id)); } }),
      h('p', { class: 'note' }, tradeMode() ? `Tap a ${noun} to buy more, sell, see its purchase lots and XIRR, or add a split, bonus or dividend. The weight is the share of this tab’s total.` : 'Import your Groww history (Import tab) to unlock selling, XIRR, splits and dividends.')),
    canEdit() ? [btn(tradeMode() ? 'Record a buy' : etf ? 'Add ETF' : 'Add share', () => (tradeMode() ? tradeForm(null, etf ? { type: 'BUY' } : { type: 'BUY' }) : stockForm(null, etf ? 'etf' : 'equity')), 'primary')] : null));
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
  const mSel = h('select', { 'aria-label': 'Month', onchange: (e) => { planMonth = e.target.value; rerender(); } }, keys.map((k) => h('option', { value: k, selected: k === planMonth }, monthLabel(k) + (k === cur ? ' (this month)' : ''))));
  const nSel = h('select', { 'aria-label': 'Months in chart', onchange: (e) => { planSpan = +e.target.value; rerender(); } }, [3, 6, 12, 24].map((n) => h('option', { value: n, selected: n === planSpan }, 'Last ' + n + ' months')));
  const wrap = h('div', null);
  wrap.append(
    h('div', { class: 'filters' }, h('label', null, 'Month ', mSel), h('label', null, 'Chart ', nSel)),
    h('div', { class: 'stats' },
      stat('Bought in ' + monthLabel(planMonth), money(b.total), planned ? `plan ${money(planned)} · ${b.total >= planned ? 'on target' : money(planned - b.total) + ' to go'}` : `${b.items.length} purchases`),
      stat('Shares', money(b.shares), ''), stat('ETFs', money(b.etfs), ''), stat('Funds', money(b.funds), '')));
  const months = lastMonths(cur, planSpan);
  if (!Object.keys(buys).length) wrap.append(h('p', { class: 'note' }, 'Purchases appear here once your Groww files are imported or you add buys. Holdings entered by hand without dates are not counted.'));
  else wrap.append(barChart({ names: ['Shares', 'ETFs', 'Funds'], fmt: money, groups: months.map((m) => { const x = buys[m] || {}; return { label: monthLabel(m).slice(0, 3) + (m.endsWith('-01') ? " '" + m.slice(2, 4) : ''), title: monthLabel(m) + ' · total ' + money(x.total || 0), values: [x.shares || 0, x.etfs || 0, x.funds || 0] }; }) }),
    h('p', { class: 'note' }, 'Average per month over this period: ' + money(months.reduce((a, m) => a + ((buys[m] || {}).total || 0), 0) / months.length)));
  const rows = byName(b.items);
  wrap.append(table([
    { label: 'Bought', get: (r) => r.name }, { label: 'Type', get: (r) => GROUP_NAME[r.group] }, { label: 'Times', cls: 'r', get: (r) => String(r.count) },
    { label: 'Last on', get: (r) => dateStr(r.last) }, { label: 'Amount', cls: 'r', get: (r) => money(r.amount), total: () => money(b.total) },
  ], rows, { footer: { label: 'Total' }, empty: 'No purchases recorded in this month.' }));
  return section('Invested in ' + monthLabel(planMonth), wrap);
}

export function render() {
  const { all, data } = S;
  const root = h('div', { class: 'page' });
  if (route().sub === 'holding') { holdingView.render(root); return root; }
  const tab = subTab(TABS.map((t) => t[0]));
  const st = all.stocks, mf = all.mf;
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Shares and funds views'), h('button', { class: 'primary', onclick: (e) => refresh(e.currentTarget) }, 'Refresh prices')));

  if (tab === 'insights') insights(root);
  else if (tab === 'sold') sold(root);
  else if (tab === 'import') importView.render(root);
  else if (tab === 'today') {
    today(root);
    const g = groups();
    root.append(section('What you hold', h('div', { class: 'stats' },
      ...['shares', 'etfs', 'funds'].map((k) => stat(GROUP_LABEL[k], money(g[k].current), h('span', null, 'invested ', money(g[k].invested), ' · ', gainText(g[k].pl), ' (', pct(g[k].ret), ')'))))));
  } else if (tab === 'stocks' || tab === 'etfs') {
    holdingsTab(root, tab);
  } else if (tab === 'funds') {
    root.append(section('Mutual funds',
      table([
        { label: 'Scheme', get: (m) => m.name },
        { label: 'Today', cls: 'r', render: dayCell, total: () => (mf.dayCount ? h('span', { class: posNeg(mf.day) }, signedMoney(mf.day)) : '') },
        { label: 'NAV', cls: 'r', render: (m) => h('span', null, dec(m.liveNav, 4), m.navDate ? h('small', { class: 'sub' }, ' ' + dateStr(m.navDate).replace(/ \d{4}$/, '')) : null) },
        { label: 'Invested', cls: 'r', get: (m) => money(m.invested), total: () => money(mf.invested) },
        { label: 'Units', cls: 'r', get: (m) => dec(m.units, 3) },
        { label: 'Value', cls: 'r', get: (m) => money(m.current), total: () => money(mf.current) },
        { label: 'Gain', cls: 'r', render: (m) => gainText(m.pl), total: () => money(mf.pl) },
        { label: 'Return', cls: 'r', render: (m) => h('span', { class: m.ret >= 0 ? 'pos' : 'neg' }, pct(m.ret)), total: () => pct(mf.ret) },
        { label: 'Folio', get: (m) => m.folio },
        { label: '', render: (m) => (canEdit() && !m.schemeCode ? h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); linkFund(m); } }, 'Link to live NAV') : '') },
      ], mf.items, { footer: { label: 'Total' }, onRow: canEdit() ? (m) => fundForm(data.mutualFunds.find((x) => x.id === m.id)) : null }),
      canEdit() ? [btn('Add fund', () => fundForm(), 'primary')] : null));
  } else {
    const plans = data.sipPlans;
    root.append(plannerBuys(data));
    const tot = plans.reduce((a, p) => a + p.monthly, 0), done = plans.reduce((a, p) => a + sipDone(p), 0);
    root.append(section('Plan for the month',
      h('div', null, table([
        { label: 'Where', get: (p) => p.name },
        { label: 'Each month', cls: 'r', get: (p) => money(p.monthly), total: () => money(tot) },
        { label: 'Each year', cls: 'r', get: (p) => money(p.monthly * 12), total: () => money(tot * 12) },
        { label: 'Done this month', cls: 'r', get: (p) => money(sipDone(p)), total: () => money(done) },
        { label: 'Left this month', cls: 'r', get: (p) => money(Math.max(0, p.monthly - sipDone(p))), total: () => money(Math.max(0, tot - done)) },
        { label: '', render: (p) => (canEdit() && sipDone(p) < p.monthly ? h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); mutate((d) => { const t = d.sipPlans.find((x) => x.id === p.id); t.doneThisMonth = t.monthly; t.doneMonth = C.monthKey(S.all.asOf); }); toast('Marked as invested'); } }, 'Mark done') : h('span', { class: 'tag good' }, 'Done')) },
      ], plans, { footer: { label: 'Total' }, onRow: canEdit() ? (p) => sipForm(plans.find((x) => x.id === p.id)) : null }),
        h('p', { class: 'note' }, 'The “done this month” amounts reset by themselves when a new month starts.')),
      canEdit() ? [btn('Add', () => sipForm(), 'primary')] : null));
  }
  return root;
}
