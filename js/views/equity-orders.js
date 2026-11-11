// Order history of one share, ETF or mutual fund: every buy and sell, newest first, with totals and a filter.
import { S } from '../store.js';
import { h, money, dec, num, dateStr, section, table, stat, route, canEdit, segTabs } from '../ui.js';
import { symKey, fundKey, BUY_TYPES } from '../trades.js';
import { tradeForm } from './eqshared.js';
import { fundTxnForm } from './equity-fund.js';

let side = 'all';   // all | buy | sell (kept while looking at one holding's orders)
let seenKey = '';

export function render(root) {
  const { data, all } = S, q = route().query, fundId = q.get('fund'), sym = symKey(q.get('sym') || '');
  const fund = fundId ? all.mf.items.find((x) => x.id === fundId) : null, stock = !fund && sym ? all.stocks.items.find((x) => symKey(x.symbol) === sym) : null;
  const key = fund ? 'f:' + fund.id : 's:' + sym; if (key !== seenKey) { seenKey = key; side = 'all'; }
  const holdHref = fund ? '#/equity/fund?id=' + encodeURIComponent(fund.id) : '#/equity/holding?sym=' + encodeURIComponent(sym);
  root.append(h('div', { class: 'pagebar' }, h('a', { class: 'back', href: fund ? '#/equity/holdings?v=funds' : '#/equity/holdings' }, '← Holdings')));
  if (!fund && !stock) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'This holding is not in your list any more. Orders of shares you sold are under History.'))); return; }
  const name = fund ? fund.name : stock.name;
  // one list shape for both: date, side, quantity (units), price (NAV), amount
  const orders = (fund
    ? (data.mfTxns || []).filter((t) => fundKey(t.scheme) === fundKey(fund.name)).map((t) => ({ id: t.id, date: t.date, time: '', buy: BUY_TYPES.test(t.type), label: /sip/i.test(t.type) ? 'SIP' : BUY_TYPES.test(t.type) ? 'Buy' : 'Sell', qty: Number(t.units) || 0, price: t.nav > 0 ? t.nav : t.units ? t.amount / t.units : 0, amount: Number(t.amount) || 0, raw: t }))
    : (data.trades || []).filter((t) => symKey(t.symbol) === sym).map((t) => ({ id: t.id, date: t.date, time: t.time || '', buy: t.type !== 'SELL', label: t.type === 'SELL' ? 'Sell' : 'Buy', qty: Number(t.qty) || 0, price: t.qty ? t.amount / t.qty : 0, amount: Number(t.amount) || 0, raw: t })))
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : a.date + a.time > b.date + b.time ? -1 : (b.id || 0) - (a.id || 0)));
  const buys = orders.filter((o) => o.buy), sells = orders.filter((o) => !o.buy), sum = (l, f) => l.reduce((a, o) => a + o[f], 0);
  const unit = fund ? 'units' : 'shares', d = fund ? 3 : 0, p = fund ? 4 : 2;
  root.append(h('div', { class: 'card' }, h('h2', { style: { margin: 0 } }, name),
    h('p', { class: 'note', style: { margin: '4px 0 0' } }, fund ? [fund.folio ? 'Folio ' + fund.folio : null, 'Mutual fund'].filter(Boolean).join(' · ') : `${stock.symbol} · ${stock.assetClass === 'equity' ? 'Share' : stock.assetClass === 'goldetf' ? 'Gold ETF' : 'ETF'}`),
    h('div', { class: 'btn-row', style: { marginTop: 10 } }, h('a', { class: 'btn small', href: holdHref }, 'Open holding'),
      canEdit() ? h('button', { type: 'button', class: 'small', onclick: () => (fund ? fundTxnForm(fund, null, { type: 'Purchase' }) : tradeForm(null, { type: 'BUY', symbol: sym, name })) }, 'Record a buy') : null)));
  root.append(h('div', { class: 'stats' },
    stat('Orders', String(orders.length), orders.length ? `${buys.length} buy${buys.length === 1 ? '' : 's'} · ${sells.length} sell${sells.length === 1 ? '' : 's'}` : 'none recorded'),
    stat('Bought', money(sum(buys, 'amount')), `${dec(sum(buys, 'qty'), d)} ${unit}`),
    stat('Sold', money(sum(sells, 'amount')), sells.length ? `${dec(sum(sells, 'qty'), d)} ${unit}` : 'nothing sold'),
    stat('Average buy price', buys.length && sum(buys, 'qty') ? dec(sum(buys, 'amount') / sum(buys, 'qty'), p) : '–', orders.length ? `first order ${dateStr(orders[orders.length - 1].date)}` : '')));
  if (!orders.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No orders for this holding.'), h('p', { class: 'note' }, fund ? 'Press “Record a buy” each time you invest, or import your history.' : 'This holding was entered by hand, so it has no order history. Import your Groww history (Manage → Import) to see every order.'))); return; }
  const rows = orders.filter((o) => side === 'all' || (side === 'buy' ? o.buy : !o.buy));
  root.append(h('nav', { class: 'seg', 'aria-label': 'Orders shown' }, [['all', `All (${orders.length})`], ['buy', `Buys (${buys.length})`], ['sell', `Sells (${sells.length})`]].map(([k, l]) => h('a', { href: 'javascript:void 0', class: k === side ? 'on' : '', 'aria-selected': String(k === side), onclick: (e) => { e.preventDefault(); side = k; window.dispatchEvent(new Event('rerender')); } }, l))));
  const tone = (o) => (o.buy ? '' : 'neg');
  root.append(section(`Order history (${rows.length})`, table([
    { label: 'Date', host: true, get: (o) => dateStr(o.date) + (o.time ? ' · ' + o.time.slice(0, 5) : '') },
    { label: 'Order', render: (o) => h('span', { class: tone(o) }, o.label) },
    { label: fund ? 'Units' : 'Qty', mob: 'under', mlabel: '', cls: 'r', get: (o) => (fund ? dec(o.qty, 3) : num(o.qty)) },
    { label: fund ? 'NAV' : 'Price', mob: 'under', mlabel: 'at ', cls: 'r', get: (o) => dec(o.price, p) },
    { label: 'Value', cls: 'r', render: (o) => h('span', { class: tone(o) }, (o.buy ? '' : '− ') + money(o.amount)) },
  ], rows, { m: { key: 'eq-orders', head: 'Date', sub: ['Order'], views: [['Value', fund ? 'Units' : 'Qty'], [fund ? 'NAV' : 'Price']] },
    onRow: canEdit() ? (o) => (fund ? fundTxnForm(fund, data.mfTxns.find((x) => x.id === o.id)) : tradeForm(data.trades.find((x) => x.id === o.id))) : null, empty: 'No orders of this kind.' }),
    h('p', { class: 'note' }, 'Newest first. Quantities are as recorded on each order; splits and bonus shares are shown on the holding page.')));
}
