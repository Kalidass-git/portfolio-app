// A share's own page for anything on a watchlist (or any symbol): candlestick chart, key figures, its alerts, and which lists it is on.
import { S, mutate } from '../store.js';
import { h, money, dec, pct, dateStr, section, stat, btn, canEdit, route, toast, posNeg, formDialog } from '../ui.js';
import { candleChart } from '../charts.js';
import { stockOhlc, aggregateOhlc, candleMode, sliceRange } from '../history.js';
import * as WL from '../watchlists.js';
import { alertsCard } from './watch.js';

const RANGES = [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['3Y', 36], ['5Y', 60], ['Max', 0]];
const KEY = 'fw.candleRange';
const getRange = () => { try { return localStorage.getItem(KEY) || '6M'; } catch { return '6M'; } };
const setRange = (r) => { try { localStorage.setItem(KEY, r); } catch { /* private window */ } };
const short = (d) => { const [y, m, dd] = d.split('-'); return `${+dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} '${y.slice(2)}`; };
const tick = (d) => { const [y, m] = d.split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1] + " '" + y.slice(2); };
const vfmt = (v) => (v >= 1e7 ? (v / 1e7).toFixed(1) + ' Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + ' L' : v >= 1e3 ? (v / 1e3).toFixed(0) + ' K' : String(Math.round(v)));

function candleCard(symbol, yahoo) {
  const body = h('div', null, h('p', { class: 'note' }, 'Loading the price history…'));
  let data = null, range = getRange();
  const draw = () => {
    body.replaceChildren();
    const chips = h('div', { class: 'row-actions', role: 'group', 'aria-label': 'Time range' }, RANGES.map(([l]) => h('button', { type: 'button', class: 'chip-btn' + (range === l ? ' on' : ''), onclick: () => { range = l; setRange(l); draw(); } }, l)));
    if (data.closesOnly) {
      body.append(h('p', { class: 'note' }, 'Candles need the newer Code.gs in your Apps Script (Settings › Backend explains how to paste and redeploy it). Showing closing prices until then.'));
    }
    const months = (RANGES.find((r) => r[0] === range) || [0, 6])[1];
    const raw = data.rows.map((r) => ({ ...r, d: r.d, v: r.c }));
    const cut = months ? sliceRange(data.closesOnly ? raw : data.rows.map((r) => ({ ...r, v: r.c })), months) : raw;
    const rows = data.closesOnly ? cut.map((r) => ({ d: r.d, o: r.c, h: r.c, l: r.c, c: r.c, v: 0 })) : aggregateOhlc(cut, candleMode(months));
    if (rows.length < 2) { body.append(chips, h('p', { class: 'empty' }, 'Not enough history for this range.')); return; }
    const first = rows[0], last = rows[rows.length - 1], hi = Math.max(...rows.map((r) => r.h)), lo = Math.min(...rows.map((r) => r.l));
    const mode = months && months <= 6 ? 'a day' : months && months <= 36 ? 'a week' : 'a month';
    body.append(chips,
      candleChart(rows, { height: 300, fmt: (v) => dec(v, v < 10 ? 2 : 0), vfmt, dateFmt: short, tickFmt: tick }),
      h('div', { class: 'trio' },
        h('div', null, h('span', { class: 'mini-title' }, `${dateStr(first.d)} → ${dateStr(last.d)}`), h('b', { class: posNeg(last.c - first.o) }, (last.c >= first.o ? '+' : '') + pct(last.c / first.o - 1, 1))),
        h('div', null, h('span', { class: 'mini-title' }, 'High · low'), h('b', null, `${dec(hi, 2)} · ${dec(lo, 2)}`)),
        h('div', null, h('span', { class: 'mini-title' }, 'Last close'), h('b', null, dec(last.c, 2)))),
      data.closesOnly ? null : h('p', { class: 'note' }, `Each candle is ${mode}. Green closed higher than it opened, red lower. Touch or hover a candle for its figures. Past prices do not predict the future.`));
  };
  stockOhlc(symbol, yahoo).then((r) => { if (!r || !r.rows || r.rows.length < 2) throw new Error('No price history found for this symbol.'); data = r; draw(); })
    .catch((e) => body.replaceChildren(h('p', { class: 'empty' }, e.message || 'Could not load the price history.')));
  return section('Price chart', body);
}

function listsCard(symbol, name, yahoo) {
  const data = S.data, on = WL.listsOf(data, symbol), all = WL.lists(data);
  const wrap = h('div', null);
  wrap.append(on.length ? h('p', null, 'On: ', on.map((l) => h('span', { class: 'chip' }, l.name))) : h('p', { class: 'note' }, 'Not on any of your watchlists.'));
  if (canEdit()) {
    const rows = all.map((l) => {
      const has = on.some((x) => x.id === l.id);
      return btn(has ? 'Remove from ' + l.name : 'Add to ' + l.name, () => { mutate((d) => { if (has) WL.removeItem(d, l.id, symbol); else WL.addItem(d, l.id, { symbol, name, yahoo }); }); toast(has ? 'Removed' : 'Added'); }, 'small');
    });
    wrap.append(all.length ? h('div', { class: 'row-actions' }, rows) : h('p', { class: 'note' }, 'Create a watchlist first under Manage › Watchlists.'));
  }
  return section('Watchlists', wrap);
}

export function render(root) {
  const { data, all } = S, q = route().query;
  const symbol = WL.norm(q.get('sym') || '');
  const back = q.get('back') === 'watch' ? '#/equity/watch' : '#/equity/manage?v=watchlists';
  root.append(h('div', { class: 'pagebar' }, h('a', { class: 'back', href: back }, '← Watchlists')));
  if (!symbol) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No share chosen.'))); return; }
  let item = null;
  for (const l of WL.lists(data)) for (const it of l.items || []) if (!item && WL.norm(it.symbol) === symbol) item = it;
  const held = all.stocks.items.find((x) => WL.norm(x.symbol) === symbol);
  const name = (item && item.name) || (held && held.name) || symbol, yahoo = (item && item.yahoo) || (held && held.yahoo) || '';
  const qt = WL.quoteOf(symbol);
  root.append(h('div', { class: 'card' }, h('h2', null, name), h('p', { class: 'note' }, symbol + (held ? ' · you hold this' : ''))));
  const price = qt ? qt.price : held ? held.price : null;
  if (price != null) root.append(h('div', { class: 'stats' },
    stat('Price', money(price), qt && qt.at ? 'as of ' + new Date(qt.at).toLocaleString('en-IN') : ''),
    qt && qt.dayPct != null ? stat('Today', h('span', { class: posNeg(qt.dayPct) }, (qt.dayPct >= 0 ? '+' : '') + pct(qt.dayPct, 2)), qt.change != null ? (qt.change >= 0 ? '+' : '') + dec(qt.change, 2) : '') : null,
    qt && qt.hi52 ? stat('52-week range', `${dec(qt.lo52, 0)} – ${dec(qt.hi52, 0)}`, '') : null));
  else root.append(h('p', { class: 'note' }, 'No price yet. Press Refresh prices on the watchlist page.'));
  root.append(candleCard(symbol, yahoo), alertsCard('stock', symbol, name), listsCard(symbol, name, yahoo));
}
