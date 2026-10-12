import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import * as prices from '../prices.js';
import { h, money, dec, pct, dateStr, gainText, section, table, btn, formDialog, dialog, canEdit, toast, stat, num, segTabs, subTab, posNeg } from '../ui.js';
import { meter, strip, legend } from '../charts.js';

let sortKey = 'current', busy = false;
const TABS = [['today', 'Today'], ['stocks', 'Shares'], ['funds', 'Funds'], ['sip', 'Monthly']];
const rerender = () => window.dispatchEvent(new Event('rerender'));

function stockForm(s) {
  const isNew = !s;
  formDialog({
    title: isNew ? 'Add share or ETF' : 'Edit ' + s.name, value: s || { assetClass: 'equity' },
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

function today(root) {
  const { all, data } = S;
  const st = all.stocks, mf = all.mf;
  const total = st.day + mf.day, base = st.current + mf.current - total;
  const have = st.dayCount + mf.dayCount;
  const count = st.items.length + mf.items.length;
  const upd = data.settings.pricesUpdatedAt;
  const when = upd ? new Date(upd).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  if (!have) {
    root.append(section('Today', h('div', null,
      h('p', null, 'No day-by-day prices yet. Press ', h('b', null, 'Refresh prices'), ' to fetch today’s share prices and fund NAVs. After that this page shows how much your shares and funds moved today, and which ones moved most.'),
      h('p', { class: 'note' }, 'Share prices come through your Google Drive backend (Settings). Fund NAVs need each fund to be linked once on the Mutual funds tab.'))));
    return;
  }
  root.append(h('div', { class: 'stats' },
    h('div', { class: 'stat today' }, h('span', { class: 'stat-label' }, 'Today’s change'), h('strong', { class: 'stat-value ' + posNeg(total) }, signedMoney(total)), h('span', { class: 'stat-sub ' + posNeg(total) }, signedPct(base ? total / base : 0))),
    stat('Shares & ETFs', h('span', { class: posNeg(st.day) }, signedMoney(st.day)), st.dayCount ? signedPct(st.dayPct) + ` · ${st.dayCount} of ${st.items.length} priced` : 'not refreshed'),
    stat('Mutual funds', h('span', { class: posNeg(mf.day) }, signedMoney(mf.day)), mf.dayCount ? signedPct(mf.dayPct) + ` · ${mf.dayCount} of ${mf.items.length} linked` : 'link funds to see this')));
  const movers = [
    ...st.items.filter((x) => x.day != null).map((x) => ({ name: x.name, kind: x.assetClass === 'equity' ? 'Share' : x.assetClass === 'goldetf' ? 'Gold ETF' : 'ETF', day: x.day, dayPct: x.dayPct, value: x.current })),
    ...mf.items.filter((x) => x.day != null).map((x) => ({ name: x.name, kind: 'Fund', day: x.day, dayPct: x.dayPct, value: x.current })),
  ];
  const cols = [
    { label: 'Name', render: (x) => h('span', null, x.name, h('small', { class: 'tag' }, x.kind)) },
    { label: 'Today', cls: 'r', render: dayCell },
    { label: 'Value', cls: 'r', get: (x) => money(x.value) },
  ];
  const gain = movers.filter((x) => x.day > 0).sort((a, b) => b.day - a.day).slice(0, 5);
  const lose = movers.filter((x) => x.day < 0).sort((a, b) => a.day - b.day).slice(0, 5);
  root.append(h('div', { class: 'grid2' },
    section('Biggest gains today', table(cols, gain, { empty: 'Nothing is up today.' })),
    section('Biggest falls today', table(cols, lose, { empty: 'Nothing is down today.' }))));
  const flat = count - have;
  root.append(h('p', { class: 'note' }, `${when ? 'Prices refreshed ' + when + '. ' : ''}Change is against the previous close for shares and the previous NAV for funds, in rupees for the quantity you hold. Funds publish one NAV a day, usually in the evening, so a fund can show yesterday’s move until then.${flat ? ` ${flat} holding${flat > 1 ? 's have' : ' has'} no day-by-day price yet and ${flat > 1 ? 'are' : 'is'} left out.` : ''}`));
}

export function render() {
  const { all, data } = S;
  const tab = subTab(TABS.map((t) => t[0]));
  const root = h('div', { class: 'page' });
  const st = all.stocks, mf = all.mf;
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Shares and funds views'), h('button', { class: 'primary', onclick: (e) => refresh(e.currentTarget) }, 'Refresh prices')));

  if (tab === 'today') {
    today(root);
    root.append(h('div', { class: 'stats' },
      stat('Shares & ETFs', money(st.current), h('span', null, 'invested ', money(st.invested), ' · ', gainText(st.pl), ' (', pct(st.ret), ')')),
      stat('Mutual funds', money(mf.current), h('span', null, 'invested ', money(mf.invested), ' · ', gainText(mf.pl), ' (', pct(mf.ret), ')'))));
  } else if (tab === 'stocks') {
    const items = st.items.slice().sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : sortKey === 'ret' ? b.ret - a.ret : sortKey === 'day' ? (b.dayPct ?? -9) - (a.dayPct ?? -9) : b.current - a.current));
    const total = st.current;
    root.append(section('Holdings',
      h('div', null,
        h('div', { class: 'filters' }, h('label', { class: 'inline-label' }, 'Sort by ', h('select', { onchange: (e) => { sortKey = e.target.value; rerender(); } },
          [['current', 'Value'], ['day', 'Today'], ['ret', 'Return'], ['name', 'Name']].map(([v, l]) => h('option', { value: v, selected: v === sortKey }, l))))),
        table([
          { label: 'Name', render: (s) => h('span', null, s.name, s.assetClass !== 'equity' ? h('small', { class: 'tag' }, s.assetClass === 'goldetf' ? 'Gold ETF' : 'ETF') : null) },
          { label: 'Today', cls: 'r', render: dayCell, total: () => (st.dayCount ? h('span', { class: posNeg(st.day) }, signedMoney(st.day)) : '') },
          { label: 'Price', cls: 'r', get: (s) => dec(s.livePrice) },
          { label: 'Qty', cls: 'r', get: (s) => num(s.qty) },
          { label: 'Avg price', cls: 'r', get: (s) => dec(s.avgPrice) },
          { label: 'Invested', cls: 'r', get: (s) => money(s.invested), total: () => money(st.invested) },
          { label: 'Value', cls: 'r', get: (s) => money(s.current), total: () => money(st.current) },
          { label: 'Gain', cls: 'r', render: (s) => gainText(s.pl), total: () => money(st.pl) },
          { label: 'Return', cls: 'r', render: (s) => h('span', { class: s.ret >= 0 ? 'pos' : 'neg' }, pct(s.ret)), total: () => pct(st.ret) },
          { label: 'Weight', cls: 'r', render: (s) => h('span', { class: 'with-meter' }, meter((s.current / total) * 8, 0), pct(s.current / total)) },
        ], items, { footer: { label: 'Total' }, onRow: canEdit() ? (s) => stockForm(data.stocks.find((x) => x.id === s.id)) : null })),
      canEdit() ? [btn('Add share', () => stockForm(), 'primary')] : null));
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
    const tot = plans.reduce((a, p) => a + p.monthly, 0), done = plans.reduce((a, p) => a + sipDone(p), 0);
    root.append(section('Monthly investment plan',
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
