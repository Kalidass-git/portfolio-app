// A share's (or index's) own page for anything on a watchlist or typed in: the terminal chart and key figures, its alerts, and which lists it is on.
import { S, mutate } from '../store.js';
import { h, money, dec, pct, section, btn, canEdit, route, toast, posNeg, stat } from '../ui.js';
import * as WL from '../watchlists.js';
import { alertsCard } from './watch.js';
import { terminal } from './terminal.js';

function listsCard(symbol, name, yahoo, index) {
  const data = S.data, on = WL.listsOf(data, symbol), all = WL.lists(data);
  const wrap = h('div', null);
  wrap.append(on.length ? h('p', null, 'On: ', on.map((l) => h('span', { class: 'chip' }, l.name))) : h('p', { class: 'note' }, 'Not on any of your watchlists.'));
  if (canEdit()) {
    const rows = all.map((l) => {
      const has = on.some((x) => x.id === l.id);
      return btn(has ? 'Remove from ' + l.name : 'Add to ' + l.name, () => { mutate((d) => { if (has) WL.removeItem(d, l.id, symbol); else WL.addItem(d, l.id, { symbol, name, yahoo, index }); }); toast(has ? 'Removed' : 'Added'); }, 'small');
    });
    wrap.append(all.length ? h('div', { class: 'row-actions' }, rows) : h('p', { class: 'note' }, 'Create a watchlist first under Manage › Watchlists.'));
  }
  return section('Watchlists', wrap);
}

export function render(root) {
  const { data, all } = S, q = route().query;
  const symbol = WL.norm(q.get('sym') || '');
  const back = '#/equity/watchlists';
  root.append(h('div', { class: 'pagebar' }, h('a', { class: 'back', href: back }, '← Watchlists')));
  if (!symbol) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No share chosen.'))); return; }
  let item = null;
  for (const l of WL.lists(data)) for (const it of l.items || []) if (!item && WL.norm(it.symbol) === symbol) item = it;
  const held = all.stocks.items.find((x) => WL.norm(x.symbol) === symbol);
  const preset = WL.INDEXES.find((x) => x.symbol === symbol);
  const index = !!(item && item.index) || !!preset || q.get('index') === '1';
  const name = (item && item.name) || (held && held.name) || (preset && preset.name) || q.get('name') || symbol;
  const yahoo = (item && item.yahoo) || (held && held.yahoo) || (preset && preset.yahoo) || q.get('y') || '';
  const qt = WL.quoteOf(symbol);
  root.append(...terminal({ symbol, name, yahoo, index, indexPe: preset ? preset.pe || '' : index ? String(name).toUpperCase() : '', quote: qt ? { price: qt.price, prev: qt.prev, at: qt.at } : null, avgCost: held ? held.avgPrice : null }));
  root.append(alertsCard('stock', symbol, name), listsCard(symbol, name, yahoo, index));
}
