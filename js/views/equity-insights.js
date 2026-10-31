// Shares & funds → Insights (exposure, sector, size, stocks vs ETFs) and Sold (what selling earned vs holding on).
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, formDialog, money, compact, pct, dateStr, section, table, stat, btn, canEdit, num, dec, posNeg, rowList } from '../ui.js';
import { hbars, donut, legend, strip } from '../charts.js';
import { classify, fundCategory } from '../classify.js';
import { symKey } from '../trades.js';
import { classifyForm, priceOfSymbol, sellForm } from './eqshared.js';

let scope = 'all';
const rerender = () => window.dispatchEvent(new Event('rerender'));
const SCOPES = [['all', 'Everything (shares, ETFs, funds)'], ['shares', 'Individual shares only'], ['etf', 'ETFs only'], ['funds', 'Mutual funds only'], ['market', 'Shares and ETFs (no funds)']];
const kindName = (c) => (c === 'equity' ? 'Share' : c === 'goldetf' ? 'Gold ETF' : 'ETF');

/** All holdings as one list with a common shape, filtered by scope. */
function holdingsFor(all) {
  const rows = [
    ...all.stocks.items.map((s) => ({ key: 's:' + s.id, name: s.name, kind: kindName(s.assetClass), group: s.assetClass === 'equity' ? 'Individual shares' : s.assetClass === 'goldetf' ? 'Gold ETF' : 'ETFs', value: s.current, stock: s, ...classify(s) })),
    ...all.mf.items.map((m) => { const fc = fundCategory(m.name); return { key: 'm:' + m.id, name: m.name, kind: 'Fund', group: 'Mutual funds', value: m.current, fund: m, sector: null, cap: fc.cap, category: fc.category }; }),
  ];
  const ok = { all: () => true, shares: (r) => r.kind === 'Share', etf: (r) => r.kind === 'ETF' || r.kind === 'Gold ETF', funds: (r) => r.kind === 'Fund', market: (r) => r.kind !== 'Fund' }[scope];
  return rows.filter(ok).filter((r) => r.value > 0);
}
const sumBy = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key] || 'Other', (m.get(r[key] || 'Other') || 0) + r.value); return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };

export function insights(root) {
  const { all } = S;
  const rows = holdingsFor(all);
  const total = rows.reduce((a, r) => a + r.value, 0);
  root.append(h('div', { class: 'filters' }, h('label', { class: 'inline-label' }, 'Look at ', h('select', { 'aria-label': 'Scope', onchange: (e) => { scope = e.target.value; rerender(); } }, SCOPES.map(([v, l]) => h('option', { value: v, selected: v === scope }, l))))));
  if (!rows.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Nothing in this selection yet.'))); return; }

  const groups = sumBy(rows, 'group');
  root.append(section('How the money is split', h('div', null, strip(groups, { fmt: money }), legend(groups, { fmt: money }),
    h('p', { class: 'note' }, `Total ${money(total)} across ${rows.length} holdings. Pick another selection above to look at only the shares, only the ETFs or only the funds.`))));

  const sorted = rows.slice().sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5), low = sorted.slice(-5).reverse();
  const bar = (list) => hbars(list.map((r) => ({ label: r.name, value: r.value })), { fmt: (v) => money(v) + '  ·  ' + pct(v / total, 1), colorIndex: 0 });
  root.append(h('div', { class: 'grid2' },
    section('Highest exposure', bar(top)),
    section('Lowest exposure', bar(low))));
  const top5 = top.reduce((a, r) => a + r.value, 0);
  root.append(h('p', { class: 'note' }, `Your five biggest holdings are ${pct(top5 / total, 0)} of this selection. The biggest, ${top[0].name}, is ${pct(top[0].value / total, 0)}.`));

  const stocks = rows.filter((r) => r.stock);
  if (stocks.length) {
    const sectors = sumBy(stocks, 'sector');
    const sTotal = stocks.reduce((a, r) => a + r.value, 0);
    root.append(section('By sector', h('div', { class: 'alloc-main' }, donut(sectors, { fmt: money, center: compact(sTotal), sub: 'shares & ETFs' }), legend(sectors, { fmt: money })),
      null));
    root.append(h('p', { class: 'note' }, 'Sector ETFs are counted under the sector they hold (IT, pharma, banking), index ETFs under “Diversified”, gold ETFs under “Gold”. Mutual funds are not split by sector.'));
  }
  const caps = sumBy(rows, 'cap');
  const order = ['Large', 'Mid', 'Small', 'Large & mid', 'Flexi / multi', 'Hybrid', 'Gold', 'Debt', 'Other', 'Unclassified'];
  caps.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  root.append(section('By company size', h('div', { class: 'alloc-main' }, donut(caps, { fmt: money, center: pct((caps.find((c) => c.label === 'Large') || { value: 0 }).value / total, 0), sub: 'large cap' }), legend(caps, { fmt: money }))));
  root.append(h('p', { class: 'note' }, 'Size follows the AMFI large / mid / small lists (about the top 100 / next 150 / the rest). Funds are placed by their type: “Flexi / multi” funds hold a mix of all sizes, so they are shown on their own.'));

  const unknown = stocks.filter((r) => r.guessed);
  if (unknown.length) root.append(section(`Not classified yet (${unknown.length})`, h('div', null,
    h('p', { class: 'note', style: { marginTop: 0 } }, 'These shares are not in the built-in table. Tap one to set its sector and size.'),
    rowList(unknown.map((r) => ({ title: r.name, sub: r.stock.symbol, value: money(r.value), onClick: canEdit() ? () => classifyForm(r.stock) : null }))))));
  else if (stocks.length && canEdit()) root.append(h('p', { class: 'note' }, 'Sector or size wrong for a share? Open the share from the Shares tab and choose “Sector & size”.'));
}

// ---------- Sold ----------
/** Fix the symbol a sold share is priced with, or stop fetching its price (for shares that were delisted or merged). */
function soldSymbolForm(x) {
  const o = (S.data.soldSettings || {})[x.symbol] || {};
  formDialog({
    title: x.name + ' · price settings', saveLabel: 'Save',
    value: { nowSymbol: o.nowSymbol || x.nowSymbol, yahoo: o.yahoo || '', suppress: !!o.suppress, manualPrice: o.manualPrice || '' },
    fields: [
      { key: 'nowSymbol', label: 'Current symbol on the exchange', hint: `Sold as ${x.symbol}. Change it if the company was renamed or merged.`, required: true },
      { key: 'yahoo', label: 'Yahoo ticker (optional)', hint: 'Only if the usual NSE or BSE lookup fails, for example TATAMOTORS.NS.' },
      { key: 'suppress', label: 'Stop fetching the price for this sold share', type: 'checkbox', hint: 'Use this when the symbol no longer trades. It will not be asked for again when you refresh prices.' },
      { key: 'manualPrice', label: 'Price to use instead (₹, optional)', type: 'number', showIf: (v) => v.suppress, hint: 'Used for “if you had kept them”. Leave empty to show no price.' },
    ],
    onSave: (v) => mutate((d) => {
      d.soldSettings = d.soldSettings || {};
      const rec = { nowSymbol: v.nowSymbol.trim().toUpperCase() };
      if (v.yahoo) rec.yahoo = v.yahoo.trim();
      if (v.suppress) { rec.suppress = true; if (v.manualPrice > 0) rec.manualPrice = v.manualPrice; }
      if (rec.nowSymbol === x.nowSymbol && !rec.yahoo && !rec.suppress) delete d.soldSettings[x.symbol]; else d.soldSettings[x.symbol] = rec;
    }),
  });
}
export function sold(root) {
  const { data, all } = S;
  const eq = all.stocks.eq;
  if (!eq || !eq.sold.length) {
    root.append(section('Sold shares', h('div', null, h('p', null, 'Nothing sold yet.'), h('p', { class: 'note' }, 'When you sell, this page shows what you got, the profit or loss, and what the shares would be worth today if you had kept them. Sales in your imported Groww history appear here too. To record a sale, open a share on the Shares tab and press Sell.'))));
    return;
  }
  const list = eq.sold.map((s) => {
    const o = (data.soldSettings || {})[s.symbol] || {};
    const px = o.suppress ? (o.manualPrice > 0 ? o.manualPrice : null) : priceOfSymbol((o.nowSymbol || s.nowSymbol).toUpperCase());
    const nowValue = px ? s.nowQty * px : null;
    return { ...s, o, px, nowValue, diff: nowValue == null ? null : nowValue - s.proceeds, ret: s.cost ? s.realized / s.cost : null, split: Math.abs(s.nowQty - s.qty) > 1e-6 };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
  const priced = list.filter((x) => x.nowValue != null);
  const proceeds = list.reduce((a, x) => a + x.proceeds, 0), cost = list.reduce((a, x) => a + x.cost, 0), realized = proceeds - cost;
  const pProceeds = priced.reduce((a, x) => a + x.proceeds, 0), kept = priced.reduce((a, x) => a + x.nowValue, 0), diff = kept - pProceeds;
  root.append(h('div', { class: 'stats' },
    stat('Sold for', money(proceeds), `${list.length} sale${list.length === 1 ? '' : 's'} · cost ${money(cost)}`),
    stat('Profit or loss made', h('span', { class: posNeg(realized) }, money(realized)), cost ? pct(realized / cost, 1) + ' on cost' : ''),
    stat('If you had kept them', priced.length ? money(kept) : '–', priced.length < list.length ? (priced.length ? `${priced.length} of ${list.length} have a price` : 'press Refresh prices') : 'value today'),
    stat(diff >= 0 ? 'Holding on would have given' : 'Selling saved you', priced.length ? h('span', { class: diff >= 0 ? 'warn' : 'pos' }, money(Math.abs(diff))) : '–', diff >= 0 ? 'more than you sold for' : 'compared with holding on')));
  root.append(section('Every sale', h('div', null, table([
    { label: 'Sold on', mob: 'under', mlabel: 'sold ', get: (x) => dateStr(x.date) },
    { label: 'Share', host: true, render: (x) => h('span', null, x.name, x.split ? h('small', { class: 'tag' }, `now ${num(x.nowQty)} sh`) : null, x.o.suppress ? h('small', { class: 'tag' }, 'price off') : null, x.o.nowSymbol ? h('small', { class: 'sub' }, ' → ' + x.o.nowSymbol) : null) },
    { label: 'Qty', mob: 'under', mlabel: 'qty ', cls: 'r', get: (x) => num(x.qty) },
    { label: 'Sold for', cls: 'r', get: (x) => money(x.proceeds), total: () => money(proceeds) },
    { label: 'Bought for', mob: 'under', mlabel: 'bought ', cls: 'r', get: (x) => money(x.cost), total: () => money(cost) },
    { label: 'Profit / loss', cls: 'r', render: (x) => h('span', { class: posNeg(x.realized) }, money(x.realized), x.ret != null ? h('small', { class: 'sub' }, ' ' + pct(x.ret, 0)) : null), total: () => h('span', { class: posNeg(realized) }, money(realized)) },
    { label: 'Value today if kept', mob: 'under', mlabel: 'now ', cls: 'r', get: (x) => (x.nowValue == null ? h('span', { class: 'muted' }, x.o.suppress ? 'price off' : 'no price') : money(x.nowValue) + (x.o.suppress && x.o.manualPrice ? ' (set by you)' : '')), total: () => (priced.length ? money(kept) : '') },
    { label: 'Kept vs sold', mob: 'under', mlabel: 'vs keeping: ', cls: 'r', render: (x) => (x.diff == null ? '–' : h('span', { class: x.diff > 0 ? 'warn' : 'pos' }, (x.diff > 0 ? '+' : '−') + money(Math.abs(x.diff)), h('small', { class: 'sub' }, x.diff > 0 ? ' missed' : ' saved'))) },
  ], list, { footer: { label: 'Total' }, m: { key: 'eq-sold', head: 'Share', sub: (x) => `${dateStr(x.date)} · ${num(x.qty)} ${x.qty === 1 ? 'share' : 'shares'}`,
    views: [['Profit / loss', 'Sold for'], ['Bought for', 'Value today if kept'], ['Kept vs sold']],
    sort: [{ value: 'none', label: 'As listed', kind: 'none' }, { value: 'date', label: 'Sold on', kind: 'date', get: (x) => x.date }, { value: 'profit', label: 'Profit / loss', kind: 'num', get: (x) => x.realized }, { value: 'sold', label: 'Sold for', kind: 'num', get: (x) => x.proceeds }, { value: 'name', label: 'Share', kind: 'text', get: (x) => String(x.name || '').toLowerCase() }] }, onRow: canEdit() ? (x) => soldSymbolForm(x) : null }),
    h('p', { class: 'note' }, 'Profit uses first-in-first-out cost, which is how the tax department matches sales to purchases. “Kept vs sold” is the value today of the shares you sold (after any later split or bonus) minus what you received. Fully sold shares get a price when you press Refresh prices. Shares that no longer trade (merged or unlisted) have no price. Brokerage and taxes are included only if they were in the file or the sale entry.'))));
}
