// Order history of the whole account: every buy and sell of shares, ETFs and funds, for any period, with totals.
import { S } from '../store.js';
import * as C from '../calc.js';
import { h, money, dec, num, dateStr, section, table, stat, canEdit, monthLabel, setOptions } from '../ui.js';
import { symKey, fundKey, BUY_TYPES } from '../trades.js';

let period = 'all', side = 'all', kind = 'all', view = 'timeline', text = '';
const rerender = () => window.dispatchEvent(new Event('rerender'));

/** Period choices: [value, label, from, to]. A single month is chosen as its 'YYYY-MM'. */
function periods(asOf) {
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7)), fy = m >= 4 ? y : y - 1, back = (n) => C.addMonths(asOf.slice(0, 7) + '-01', -n), first = asOf.slice(0, 7) + '-01', lastM = C.addMonths(first, -1);
  return [['all', 'All time', '', '9999-12-31'], ['this', 'This month', first, asOf], ['last', 'Last month', lastM, C.addMonths(first, 0).slice(0, 7) + '-00'], ['3m', 'Last 3 months', back(3), asOf], ['6m', 'Last 6 months', back(6), asOf], ['12m', 'Last 12 months', back(12), asOf],
    ['ty', `This year (${y})`, `${y}-01-01`, `${y}-12-31`], ['ly', `Last year (${y - 1})`, `${y - 1}-01-01`, `${y - 1}-12-31`], ['tfy', `This financial year (Apr ${fy} – Mar ${fy + 1})`, `${fy}-04-01`, `${fy + 1}-03-31`], ['lfy', `Last financial year (Apr ${fy - 1} – Mar ${fy})`, `${fy - 1}-04-01`, `${fy}-03-31`]];
}
const inPeriod = (v, date, asOf) => { if (v === 'all') return true; if (/^\d{4}-\d\d$/.test(v)) return date.slice(0, 7) === v; const p = periods(asOf).find((x) => x[0] === v); return !!p && date >= p[2] && date <= p[3]; };

/** Every order as one shape: shares and ETFs from the trades, funds from the fund transactions. */
function allOrders() {
  const { data, all } = S, items = new Map(all.stocks.items.map((x) => [symKey(x.symbol), x])), funds = new Map(all.mf.items.map((x) => [fundKey(x.name), x]));
  const out = [];
  for (const t of data.trades || []) {
    const sk = symKey(t.symbol), it = items.get(sk), etf = it ? it.assetClass !== 'equity' : false, q = Number(t.qty) || 0, buy = t.type !== 'SELL';
    out.push({ id: t.id, src: 'trade', date: t.date, time: t.time || '', kind: etf ? 'ETF' : 'Share', name: (it && it.name) || t.name || t.symbol, buy, label: buy ? 'Buy' : 'Sell', qty: q, price: q ? t.amount / q : 0, amount: Number(t.amount) || 0, href: it ? '#/equity/holding?sym=' + encodeURIComponent(it.symbol) : null, hold: 's:' + sk });
  }
  for (const t of data.mfTxns || []) {
    const f = funds.get(fundKey(t.scheme)), buy = BUY_TYPES.test(t.type), q = Number(t.units) || 0;
    out.push({ id: t.id, src: 'fund', date: t.date, time: '', kind: 'Fund', name: (f && f.name) || t.scheme, buy, label: /sip/i.test(t.type) ? 'SIP' : buy ? 'Buy' : 'Sell', qty: q, price: t.nav > 0 ? t.nav : q ? t.amount / q : 0, amount: Number(t.amount) || 0, href: f ? '#/equity/fund?id=' + encodeURIComponent(f.id) : null, hold: 'f:' + fundKey(t.scheme) });
  }
  return out.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : a.date + a.time > b.date + b.time ? -1 : (b.id || 0) - (a.id || 0)));
}

export function render(root) {
  const { all } = S, asOf = all.asOf, everything = allOrders();
  root.append(h('div', { class: 'pagebar' }, h('a', { class: 'back', href: '#/equity/holdings' }, '← Holdings')));
  root.append(h('div', { class: 'card' }, h('h2', { style: { margin: 0 } }, 'Order history'), h('p', { class: 'note', style: { margin: '4px 0 0' } }, 'Everything you bought and sold across shares, ETFs and mutual funds. Pick a period, or keep All time.')));
  if (!everything.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No orders yet.'), h('p', { class: 'note' }, 'Orders appear when you import your Groww history (Manage → Import) or record buys and sells.'))); return; }
  const months = [...new Set(everything.map((o) => o.date.slice(0, 7)))].sort().reverse();
  const sel = h('select', { class: 'month-select', 'aria-label': 'Period', onchange: (e) => { period = e.target.value; rerender(); } });
  setOptions(sel, [{ group: 'Period', options: periods(asOf).map(([v, l]) => ({ value: v, label: l })) }, { group: 'A single month', options: months.map((m) => ({ value: m, label: monthLabel(m, true) })) }], period);
  const find = h('input', { type: 'search', placeholder: 'Find a holding', value: text, 'aria-label': 'Find a holding', oninput: (e) => { text = e.target.value; clearTimeout(window.__oq); window.__oq = setTimeout(rerender, 250); } });
  const segOf = (label, list, cur, set) => h('nav', { class: 'seg', 'aria-label': label }, list.map(([k, l]) => h('a', { href: 'javascript:void 0', class: k === cur ? 'on' : '', 'aria-selected': String(k === cur), onclick: (e) => { e.preventDefault(); set(k); rerender(); } }, l)));
  const q = text.trim().toLowerCase();
  const rows = everything.filter((o) => inPeriod(period, o.date, asOf) && (side === 'all' || (side === 'buy' ? o.buy : !o.buy)) && (kind === 'all' || o.kind === kind) && (!q || o.name.toLowerCase().includes(q)));
  root.append(h('div', { class: 'filters' }, sel, find),
    h('div', { class: 'filters' }, segOf('Orders shown', [['all', 'All'], ['buy', 'Buys'], ['sell', 'Sells']], side, (k) => { side = k; }), segOf('Type', [['all', 'All types'], ['Share', 'Shares'], ['ETF', 'ETFs'], ['Fund', 'Funds']], kind, (k) => { kind = k; })));
  const hn = (l) => { const n = new Set(l.map((o) => o.hold)).size; return `${n} holding${n === 1 ? '' : 's'}`; };
  const buys = rows.filter((o) => o.buy), sells = rows.filter((o) => !o.buy), sum = (l) => l.reduce((a, o) => a + o.amount, 0);
  root.append(h('div', { class: 'stats' }, stat('Orders', String(rows.length), `${buys.length} buy${buys.length === 1 ? '' : 's'} · ${sells.length} sell${sells.length === 1 ? '' : 's'}`),
    stat('Bought', money(sum(buys)), hn(buys)), stat('Sold', money(sum(sells)), sells.length ? hn(sells) : 'nothing sold'),
    stat('Net invested', (sum(buys) - sum(sells) < 0 ? '− ' : '') + money(Math.abs(sum(buys) - sum(sells))), 'bought minus sold')));
  root.append(segOf('View', [['timeline', 'Timeline'], ['orders', 'Table'], ['holding', 'By holding']], view, (k) => { view = k; }));
  if (!rows.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No orders match these filters.'))); return; }
  const open = (o) => { if (o.href) location.hash = o.href; };
  const tag = (o) => (o.kind === 'Share' ? null : h('small', { class: 'tag' }, o.kind));
  if (view === 'timeline') {
    // newest first, grouped by month; a line runs down the left with a dot for every order (blue for a buy, green for a sell)
    const groups = new Map(); for (const o of rows) { const k = o.date.slice(0, 7); groups.set(k, [...(groups.get(k) || []), o]); }
    root.append(h('div', { class: 'otl' }, [...groups.entries()].map(([m, list]) => {
      const b = list.filter((o) => o.buy), sl = list.filter((o) => !o.buy);
      return h('section', { class: 'otl-month' },
        h('header', { class: 'otl-mh' }, h('b', null, monthLabel(m, true)), h('span', null, [b.length ? `Bought ${money(sum(b))}` : '', sl.length ? `Sold ${money(sum(sl))}` : ''].filter(Boolean).join(' · '))),
        h('ol', { class: 'otl-list' }, list.map((o) => h('li', { class: 'otl-item ' + (o.buy ? 'buy' : 'sell') },
          h('span', { class: 'otl-dot', 'aria-hidden': 'true' }),
          h('div', { class: 'otl-card' + (o.href ? ' link' : ''), tabindex: o.href ? 0 : null, role: o.href ? 'link' : null, onclick: () => open(o), onkeydown: (e) => { if (o.href && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(o); } } },
            h('div', { class: 'otl-top' }, h('span', { class: 'otl-date' }, dateStr(o.date), o.time ? ' · ' + o.time.slice(0, 5) : ''), h('b', { class: o.buy ? 'inv' : 'pos' }, (o.buy ? '− ' : '+ ') + money(o.amount))),
            h('div', { class: 'otl-name' }, o.name, ' ', tag(o)),
            h('div', { class: 'otl-sub' }, `${o.label} · ${o.kind === 'Fund' ? dec(o.qty, 3) + ' units' : num(o.qty) + (o.qty === 1 ? ' share' : ' shares')} at ${dec(o.price, o.kind === 'Fund' ? 4 : 2)}`))))));
    })), h('p', { class: 'note' }, 'Newest first. Money out for a buy, money back for a sell. Tap an order to open that holding.'));
  } else if (view === 'orders') {
    root.append(section(`Orders (${rows.length})`, table([
      { label: 'Date', mob: 'under', get: (o) => dateStr(o.date) },
      { label: 'Holding', host: true, render: (o) => h('span', null, o.name, ' ', tag(o)) },
      { label: 'Order', render: (o) => h('span', { class: o.buy ? '' : 'neg' }, o.label) },
      { label: 'Qty / units', mob: 'under', mlabel: '', cls: 'r', get: (o) => (o.kind === 'Fund' ? dec(o.qty, 3) : num(o.qty)) },
      { label: 'Price / NAV', mob: 'under', mlabel: 'at ', cls: 'r', get: (o) => dec(o.price, o.kind === 'Fund' ? 4 : 2) },
      { label: 'Value', cls: 'r', render: (o) => h('span', { class: o.buy ? '' : 'neg' }, (o.buy ? '' : '− ') + money(o.amount)) },
    ], rows, { m: { key: 'eq-orders-all', head: 'Holding', sub: (o) => `${dateStr(o.date)} · ${o.label}`, views: [['Value', 'Qty / units'], ['Price / NAV']] }, onRow: open, empty: 'No orders.' }),
      h('p', { class: 'note' }, 'Newest first. Tap an order to open that holding. Quantities are as recorded on each order.')));
  } else {
    const m = new Map();
    for (const o of rows) { const r = m.get(o.hold) || { name: o.name, kind: o.kind, href: o.href, n: 0, bought: 0, sold: 0, last: '' }; r.n++; if (o.buy) r.bought += o.amount; else r.sold += o.amount; if (o.date > r.last) r.last = o.date; m.set(o.hold, r); }
    const list = [...m.values()].sort((a, b) => b.bought + b.sold - (a.bought + a.sold));
    root.append(section(`By holding (${list.length})`, table([
      { label: 'Holding', host: true, render: (r) => h('span', null, r.name, ' ', r.kind === 'Share' ? null : h('small', { class: 'tag' }, r.kind)) },
      { label: 'Orders', cls: 'r', get: (r) => String(r.n) }, { label: 'Bought', cls: 'r', get: (r) => money(r.bought) }, { label: 'Sold', cls: 'r', get: (r) => (r.sold ? money(r.sold) : '–') },
      { label: 'Net', mob: 'under', mlabel: 'net ', cls: 'r', get: (r) => (r.bought - r.sold < 0 ? '− ' : '') + money(Math.abs(r.bought - r.sold)) }, { label: 'Last order', mob: 'under', mlabel: 'last ', get: (r) => dateStr(r.last) },
    ], list, { m: { key: 'eq-orders-by', head: 'Holding', sub: (r) => `${r.n} order${r.n === 1 ? '' : 's'}`, views: [['Bought', 'Sold'], ['Net', 'Last order']] }, onRow: (r) => { if (r.href) location.hash = r.href; } }), h('p', { class: 'note' }, 'Tap a holding to open it.')));
  }
}
