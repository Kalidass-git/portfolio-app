// One holding: lots, trades, dividends, and the buttons to buy, sell, add a split or edit details.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, dec, pct, num, dateStr, section, table, stat, btn, canEdit, route, gainText, posNeg, formDialog } from '../ui.js';
import { classify } from '../classify.js';
import { symKey, xirrFor } from '../trades.js';
import { tradeForm, sellForm, actionForm, classifyForm, ACTION_LABEL, describeAction, tradeMode } from './eqshared.js';

export function stockEditForm(s) {
  formDialog({
    title: 'Edit ' + s.name, value: { name: s.name, symbol: s.symbol, price: s.price, assetClass: s.assetClass },
    fields: [
      { key: 'name', label: 'Name', required: true }, { key: 'symbol', label: 'NSE symbol', required: true, readonly: tradeMode(), hint: tradeMode() ? 'The symbol comes from the trades.' : 'Used to fetch live prices.' },
      { key: 'price', label: 'Last price (₹)', type: 'number', required: true, hint: 'Replaced automatically when prices are refreshed.' },
      { key: 'assetClass', label: 'Kind', type: 'select', options: [{ value: 'equity', label: 'Share' }, { value: 'etf', label: 'ETF' }, { value: 'goldetf', label: 'Gold ETF' }] },
    ],
    onSave: (v) => mutate((d) => { const t = d.stocks.find((x) => x.id === s.id); if (v.price !== t.price) delete t.prevClose; Object.assign(t, v); }),
  });
}

export function render(root) {
  const { data, all } = S;
  const sym = symKey(route().query.get('sym') || '');
  const s = all.stocks.items.find((x) => symKey(x.symbol) === sym);
  const isEtf = s && s.assetClass !== 'equity';
  root.append(h('div', { class: 'pagebar' }, h('a', { class: 'back', href: isEtf ? '#/equity/etfs' : '#/equity/stocks' }, isEtf ? '← ETFs' : '← Shares')));
  if (!s) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'This share is not in your holdings any more. If you sold all of it, see the Sold tab.'))); return; }
  const eq = all.stocks.eq;
  const flows = eq ? eq.flows.get(sym) || [] : [];
  const xi = eq ? xirrFor(eq, [sym], s.current, all.asOf) : null;
  const c = classify(s);
  const realized = eq ? eq.sold.filter((x) => symKey(x.symbol) === sym).reduce((a, x) => a + x.realized, 0) : 0;
  const divs = eq ? eq.dividends.filter((x) => x.symbol === sym) : [];
  const divTotal = divs.reduce((a, x) => a + x.amount, 0);
  root.append(h('div', { class: 'card' }, h('h2', { style: { margin: 0 } }, s.name), h('p', { class: 'note', style: { margin: '4px 0 0' } }, `${s.symbol} · ${s.assetClass === 'equity' ? 'Share' : s.assetClass === 'goldetf' ? 'Gold ETF' : 'ETF'} · ${c.sector} · ${c.cap}`),
    canEdit() ? h('div', { class: 'btn-row', style: { marginTop: 10 } }, btn('Buy more', () => tradeForm(null, { type: 'BUY', symbol: sym, name: s.name }), 'primary'), btn('Sell', () => sellForm(s)), btn('Split / bonus / dividend', () => actionForm(null, { symbol: sym })), btn('Sector & size', () => classifyForm(s)), btn('Edit details', () => stockEditForm(data.stocks.find((x) => x.id === s.id)))) : null));
  root.append(h('div', { class: 'stats' },
    stat('Value now', money(s.current), `${num(s.qty)} × ${dec(s.livePrice)}`),
    stat('Invested', money(s.invested), `average ${dec(s.avgPrice)} a share`),
    stat('Gain', gainText(s.pl), pct(s.ret, 1)),
    stat('XIRR', xi == null ? '–' : h('span', { class: posNeg(xi) }, pct(xi, 1)), eq ? (flows.length ? 'yearly return including timing' : 'no buy dates for this share') : 'import your history to see it'),
    realized || divTotal ? stat('Already earned', money(realized + divTotal), `${money(realized)} from sales · ${money(divTotal)} dividends`) : null));
  if (eq) {
    const h0 = eq.holdings.find((x) => x.symbol === sym);
    if (h0) root.append(section('Purchase lots', h('div', null, table([
      { label: 'Bought', get: (l) => dateStr(l.date) }, { label: 'Qty', cls: 'r', get: (l) => num(l.qty) },
      { label: 'Cost / share', cls: 'r', get: (l) => dec(l.cost / l.qty) }, { label: 'Cost', cls: 'r', get: (l) => money(l.cost) },
      { label: 'Gain', cls: 'r', render: (l) => gainText(l.qty * s.livePrice - l.cost) },
    ], h0.lots.slice().sort((a, b) => (a.date < b.date ? -1 : 1)), { footer: { label: 'Total' } }),
      h('p', { class: 'note' }, 'Quantities already include splits and bonus shares. A sale uses the oldest lot first. Bonus shares have no cost of their own.'))));
    const tr = (data.trades || []).filter((t) => symKey(t.symbol) === sym).sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
    root.append(section(`Trades (${tr.length})`, table([
      { label: 'Date', get: (t) => dateStr(t.date) }, { label: 'Type', render: (t) => h('span', { class: t.type === 'SELL' ? 'neg' : '' }, t.type === 'SELL' ? 'Sell' : 'Buy') },
      { label: 'Qty', cls: 'r', get: (t) => num(t.qty) }, { label: 'Price', cls: 'r', get: (t) => dec(t.amount / t.qty) }, { label: 'Value', cls: 'r', get: (t) => money(t.amount) },
    ], tr, { onRow: canEdit() ? (t) => tradeForm(data.trades.find((x) => x.id === t.id)) : null, empty: 'No trades for this share.' })));
    const ac = (data.corporateActions || []).filter((a) => [symKey(a.symbol), symKey(a.to || '')].includes(sym)).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (ac.length) root.append(section('Splits, bonus, dividends', table([
      { label: 'Date', get: (a) => dateStr(a.date) }, { label: 'What', get: (a) => ACTION_LABEL[a.type] }, { label: 'Details', get: (a) => (symKey(a.symbol) === sym ? '' : a.symbol + ': ') + describeAction(a) },
    ], ac, { onRow: canEdit() ? (a) => actionForm(data.corporateActions.find((x) => x.id === a.id)) : null })));
  } else root.append(h('div', { class: 'card' }, h('p', null, 'This holding was entered by hand, so there is no trade history. Import your Groww history to see lots, XIRR and sales.'), h('a', { class: 'btn small', href: '#/equity/import' }, 'Go to Import')));
}
