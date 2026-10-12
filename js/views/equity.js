import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import * as prices from '../prices.js';
import { h, money, dec, pct, dateStr, gainText, section, table, btn, formDialog, dialog, canEdit, toast, stat, num } from '../ui.js';
import { meter, strip, legend } from '../charts.js';

let tab = 'stocks', sortKey = 'current', busy = false;
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
    onSave: (v) => { if (!v.buyDate) delete v.buyDate; mutate((d) => { if (isNew) d.stocks.push({ id: nextId('s', d.stocks), ...v }); else Object.assign(d.stocks.find((x) => x.id === s.id), v); }); },
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
    onSave: (v) => mutate((d) => { if (isNew) d.mutualFunds.push({ id: nextId('m', d.mutualFunds), ...v }); else Object.assign(d.mutualFunds.find((x) => x.id === m.id), v); }),
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
    title: isNew ? 'Add monthly investment' : 'Edit ' + p.name, value: p || {},
    fields: [{ key: 'name', label: 'Where', required: true }, { key: 'monthly', label: 'Planned each month (₹)', type: 'number', required: true }, { key: 'doneThisMonth', label: 'Invested this month so far (₹)', type: 'number' }],
    onSave: (v) => mutate((d) => { v.doneThisMonth = v.doneThisMonth || 0; if (isNew) d.sipPlans.push({ id: nextId('sip', d.sipPlans), ...v }); else Object.assign(d.sipPlans.find((x) => x.id === p.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.sipPlans = d.sipPlans.filter((x) => x.id !== p.id); }),
  });
}

async function refresh(btnEl) {
  if (busy) return;
  busy = true; btnEl.disabled = true;
  try {
    const res = await prices.refreshAll((m) => (btnEl.textContent = m));
    toast(`Updated ${res.stocks} shares and ${res.funds} funds` + (res.errors.length ? `. ${res.errors.length} issue${res.errors.length > 1 ? 's' : ''}: ${res.errors[0]}` : ''), res.errors.length ? 'bad' : '');
  } finally { busy = false; rerender(); }
}

export function render() {
  const { all, data } = S;
  const root = h('div', { class: 'page' });
  const st = all.stocks, mf = all.mf;
  const upd = data.settings.pricesUpdatedAt;
  root.append(h('div', { class: 'stats' },
    stat('Shares & ETFs', money(st.current), h('span', null, 'invested ', money(st.invested), ' · ', gainText(st.pl), ' (', pct(st.ret), ')')),
    stat('Mutual funds', money(mf.current), h('span', null, 'invested ', money(mf.invested), ' · ', gainText(mf.pl), ' (', pct(mf.ret), ')')),
    stat('Prices', upd ? dateStr(upd.slice(0, 10)) : 'Not refreshed', 'last refreshed')));
  root.append(h('div', { class: 'toolbar' },
    h('nav', { class: 'chips' }, [['stocks', 'Shares & ETFs'], ['funds', 'Mutual funds'], ['sip', 'Monthly plan']].map(([k, l]) => h('button', { class: tab === k ? 'chip on' : 'chip', onclick: () => { tab = k; rerender(); } }, l))),
    h('button', { class: 'primary', onclick: (e) => refresh(e.currentTarget) }, 'Refresh prices')));

  if (tab === 'stocks') {
    const items = st.items.slice().sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : sortKey === 'ret' ? b.ret - a.ret : b.current - a.current));
    const total = st.current;
    root.append(section('Holdings',
      h('div', null,
        h('div', { class: 'filters' }, h('label', { class: 'inline-label' }, 'Sort by ', h('select', { onchange: (e) => { sortKey = e.target.value; rerender(); } },
          [['current', 'Value'], ['ret', 'Return'], ['name', 'Name']].map(([v, l]) => h('option', { value: v, selected: v === sortKey }, l))))),
        table([
          { label: 'Name', render: (s) => h('span', null, s.name, s.assetClass !== 'equity' ? h('small', { class: 'tag' }, s.assetClass === 'goldetf' ? 'Gold ETF' : 'ETF') : null) },
          { label: 'Qty', cls: 'r', get: (s) => num(s.qty) },
          { label: 'Avg price', cls: 'r', get: (s) => dec(s.avgPrice) },
          { label: 'Price', cls: 'r', get: (s) => dec(s.livePrice) },
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
        { label: 'Scheme', get: (m) => m.name }, { label: 'Folio', get: (m) => m.folio },
        { label: 'Invested', cls: 'r', get: (m) => money(m.invested), total: () => money(mf.invested) },
        { label: 'Units', cls: 'r', get: (m) => dec(m.units, 3) }, { label: 'NAV', cls: 'r', get: (m) => dec(m.liveNav, 4) },
        { label: 'Value', cls: 'r', get: (m) => money(m.current), total: () => money(mf.current) },
        { label: 'Gain', cls: 'r', render: (m) => gainText(m.pl), total: () => money(mf.pl) },
        { label: 'Return', cls: 'r', render: (m) => h('span', { class: m.ret >= 0 ? 'pos' : 'neg' }, pct(m.ret)), total: () => pct(mf.ret) },
        { label: '', render: (m) => (canEdit() && !m.schemeCode ? h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); linkFund(m); } }, 'Link to live NAV') : '') },
      ], mf.items, { footer: { label: 'Total' }, onRow: canEdit() ? (m) => fundForm(data.mutualFunds.find((x) => x.id === m.id)) : null }),
      canEdit() ? [btn('Add fund', () => fundForm(), 'primary')] : null));
  } else {
    const plans = data.sipPlans;
    const tot = plans.reduce((a, p) => a + p.monthly, 0), done = plans.reduce((a, p) => a + (p.doneThisMonth || 0), 0);
    root.append(section('Monthly investment plan',
      h('div', null, table([
        { label: 'Where', get: (p) => p.name },
        { label: 'Each month', cls: 'r', get: (p) => money(p.monthly), total: () => money(tot) },
        { label: 'Each year', cls: 'r', get: (p) => money(p.monthly * 12), total: () => money(tot * 12) },
        { label: 'Done this month', cls: 'r', get: (p) => money(p.doneThisMonth || 0), total: () => money(done) },
        { label: 'Left this month', cls: 'r', get: (p) => money(Math.max(0, p.monthly - (p.doneThisMonth || 0))), total: () => money(Math.max(0, tot - done)) },
      ], plans, { footer: { label: 'Total' }, onRow: canEdit() ? (p) => sipForm(plans.find((x) => x.id === p.id)) : null }),
        h('p', { class: 'note' }, 'Reset “done this month” at the start of each month.')),
      canEdit() ? [btn('Add', () => sipForm(), 'primary')] : null));
  }
  return root;
}
