// Manage > Watchlists: your own lists of shares, a manual price refresh for these lists only, and links to each share's chart and alerts.
import { S, mutate } from '../store.js';
import { typeahead, h, money, dec, pct, section, btn, canEdit, toast, formDialog, confirmDialog, posNeg, icon } from '../ui.js';
import * as WL from '../watchlists.js';
import * as W from '../watch.js';
import { table } from '../ui.js';
import { tradeForm } from './eqshared.js';

let busy = false, openId = null;

function listForm(l) {
  formDialog({ title: l ? 'Rename watchlist' : 'New watchlist', fields: [{ key: 'name', label: 'Name', type: 'text', required: true }], value: { name: l ? l.name : '' },
    onSave: (v) => mutate((d) => { if (l) WL.renameList(d, l.id, v.name); else openId = WL.addList(d, v.name).id; }),
    onDelete: l ? () => mutate((d) => WL.removeList(d, l.id)) : null, deleteMessage: 'Delete this watchlist? Alerts you set on its shares stay.' });
}
function addShare(l) {
  formDialog({ title: 'Add a share to ' + l.name, fields: [
    { key: 'symbol', label: 'NSE symbol', type: 'text', required: true, hint: 'For example TCS, RELIANCE or HDFCBANK. Use the symbol the trading app shows.' },
    { key: 'name', label: 'Name (optional)', type: 'text', required: false }], value: {},
  onSave: (v) => { let ok = true; mutate((d) => { ok = WL.addItem(d, l.id, { symbol: v.symbol, name: v.name }); }); if (!ok) toast('Already on this list'); } });
}
function addIndex(l) {
  const have = new Set((l.items || []).map((i) => WL.norm(i.symbol)));
  const opts = WL.INDEXES.filter((x) => !have.has(x.symbol)).map((x) => ({ value: x.symbol, label: x.name }));
  formDialog({ title: 'Add an index to ' + l.name, fields: [
    { key: 'pick', label: 'Index', type: 'select', options: [...opts, { value: '', label: 'Other (type the Yahoo symbol below)' }] },
    { key: 'yahoo', label: 'Yahoo symbol (only for Other)', type: 'text', required: false, hint: 'For example ^NSEI. Find it on finance.yahoo.com.' },
    { key: 'name', label: 'Name (only for Other)', type: 'text', required: false }], value: { pick: opts.length ? opts[0].value : '' },
  onSave: (v) => {
    const p = WL.INDEXES.find((x) => x.symbol === v.pick);
    const it = p ? { ...p } : { symbol: String(v.yahoo || '').replace(/[^A-Za-z0-9]/g, ''), name: v.name, yahoo: String(v.yahoo || '').trim() };
    if (!it.symbol) return toast('Type a Yahoo symbol');
    let ok = true; mutate((d) => { ok = WL.addItem(d, l.id, { ...it, index: true }); }); if (!ok) toast('Already on this list');
  } });
}
async function refreshAll(btnEl, rerender) {
  if (busy) return; busy = true; btnEl.disabled = true;
  try {
    const r = await WL.refreshQuotes(S.data);
    const keys = new Set(WL.allSymbols(S.data).map((x) => 'EQ:' + x.symbol));
    const targets = W.universe(S.data, S.all).filter((u) => u.kind === 'stock' && keys.has(u.key));
    if (targets.length && S.remote) { try { await W.refreshMetrics(targets); } catch { /* prices still updated */ } }
    toast(r.errors.length ? (r.n ? `${r.n} updated, ${r.errors.length} failed` : r.errors[0]) : `${r.n} price${r.n === 1 ? '' : 's'} updated`);
  } finally { busy = false; rerender(); }
}

/** Look a share or index up before deciding to watch it: type a name or symbol, pick or press Enter, and its page opens (the star there adds it to a list). */
function searchCard() {
  const known = new Map();
  const put = (symbol, name, yahoo, index) => { const sym = WL.norm(symbol); if (sym && !known.has(sym)) known.set(sym, { symbol: sym, name: name || sym, yahoo: yahoo || '', index: !!index }); };
  for (const x of S.all.stocks.items) put(x.symbol, x.name, x.yahoo, false);
  for (const l of WL.lists(S.data)) for (const it of l.items || []) put(it.symbol, it.name, it.yahoo, it.index);
  for (const x of WL.INDEXES) put(x.symbol, x.name, x.yahoo, true);
  const label = (k) => `${k.name}${k.name !== k.symbol ? ' · ' + k.symbol : ''}${k.index ? ' (index)' : ''}`;
  const input = h('input', { type: 'search', class: 'find-box', placeholder: 'Search a share or index: TCS, Karnataka Bank, Nifty 50…', 'aria-label': 'Search a share or index', autocomplete: 'off' });
  const go = (text) => {
    const t = String(text || '').trim(); if (!t) return;
    const k = [...known.values()].find((x) => label(x) === t) || known.get(WL.norm(t)) || [...known.values()].find((x) => x.name.toLowerCase() === t.toLowerCase());
    const sym = k ? k.symbol : WL.norm(t).replace(/[^A-Z0-9&-]/g, '');
    if (!sym) return;
    const qs = k ? (k.index && !WL.INDEXES.some((i) => i.symbol === k.symbol) ? `&index=1&y=${encodeURIComponent(k.yahoo)}&name=${encodeURIComponent(k.name)}` : '') : '';
    location.hash = '#/equity/quote?sym=' + encodeURIComponent(sym) + qs;
  };
  const wrap = h('div', { class: 'card wl-search' }, h('div', { class: 'find-row' }, input), h('p', { class: 'note' }, 'Search any NSE share or index to look at its chart first; the ☆ Watch button on its page adds it to a list.'));
  typeahead(input, () => [...known.values()].map(label), { onPick: go, host: wrap.firstChild });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(input.value); } });
  return wrap;
}

const rs = (v, d = 2) => (v == null ? '–' : '₹' + dec(v, d));
const crore = (v) => (v == null || !(v > 0) ? '' : v >= 1e12 ? '₹' + (v / 1e12).toFixed(2) + ' L Cr' : '₹' + Math.round(v / 1e7).toLocaleString('en-IN') + ' Cr');
const badge = (v, d = 2) => h('span', { class: 'wl-badge ' + (v >= 0 ? 'pos' : 'neg') }, (v >= 0 ? '▲ +' : '▼ −') + Math.abs(v * 100).toFixed(d) + '%');
function itemForm(l, it) {
  formDialog({ title: 'Edit ' + (it.name || it.symbol), sub: it.symbol, fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'target', label: 'Target price (₹, optional)', type: 'number', required: false, hint: 'The row shows how far the price is from it.' },
    { key: 'note', label: 'Note (optional)', type: 'text', required: false }],
  value: { name: it.name || it.symbol, target: it.target || '', note: it.note || '' }, saveLabel: 'Save', deleteLabel: 'Remove from list',
  onSave: (v) => mutate((d) => WL.updateItem(d, l.id, it.symbol, { name: v.name, target: v.target, note: v.note })),
  onDelete: () => mutate((d) => WL.removeItem(d, l.id, it.symbol)), deleteMessage: 'Remove ' + (it.name || it.symbol) + ' from ' + l.name + '? Alerts you set on it stay.' });
}
/** One row of the table: everything known about a watched share, from the last price refresh and the last fundamentals load. */
function rowOf(it) {
  const q = WL.quoteOf(it.symbol), m = W.metrics()[W.stockKey(it.symbol)] || null;
  const price = q ? q.price : m && m.price > 0 ? m.price : null;
  const lo = (q && q.lo52) || (m && m.lo52) || null, hi = (q && q.hi52) || (m && m.hi52) || null;
  return { it, sym: it.symbol, name: it.name || it.symbol, price, dayPct: q ? q.dayPct : null, dayLo: q && q.dayLo, dayHi: q && q.dayHi, lo, hi,
    fromHigh: price && hi ? price / hi - 1 : null, pos: price && hi > lo ? Math.max(0, Math.min(1, (price - lo) / (hi - lo))) : null, pe: m && m.pe > 0 ? m.pe : null, mcap: m && m.mcap > 0 ? m.mcap : null,
    target: it.target || null, note: it.note || '' };
}

export function render(root) {
  const lists = WL.lists(S.data), rerender = () => window.dispatchEvent(new Event('rerender'));
  const at = WL.refreshedAt();
  root.append(searchCard());
  if (!lists.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No watchlists yet.'), h('p', { class: 'note' }, canEdit() ? 'Press New watchlist, then add shares by their NSE symbol.' : ''), canEdit() ? btn('New watchlist', () => listForm(null), 'primary') : null)); return; }
  if (openId == null || !lists.some((l) => l.id === openId)) openId = lists[0].id;
  const l = lists.find((x) => x.id === openId);
  root.append(h('div', { class: 'wl-top' },
    h('div', { class: 'row-actions', role: 'tablist', 'aria-label': 'Watchlists' }, lists.map((x) => h('button', { type: 'button', class: 'chip-btn' + (x.id === openId ? ' on' : ''), onclick: () => { openId = x.id; rerender(); } }, `${x.name} · ${(x.items || []).length}`))),
    canEdit() ? h('div', { class: 'row-actions' }, btn('New watchlist', () => listForm(null), ''), btn('Edit list', () => listForm(l), '')) : null));
  const rows = (l.items || []).map(rowOf);
  const alerts = S.data.alerts || [];
  const cols = [
    { label: 'Share', host: true, render: (r) => h('div', null, h('b', null, r.it.index ? r.name : r.sym), r.it.index ? h('div', { class: 'wl-sub' }, 'Index') : r.name !== r.sym ? h('div', { class: 'wl-sub' }, r.name) : null) },
    { label: 'Price · Today', cls: 'r', render: (r) => h('div', null, h('div', null, rs(r.price)), r.dayPct != null ? badge(r.dayPct) : null) },
    { label: 'Day range', cls: 'r', mob: 'under', render: (r) => (r.dayLo && r.dayHi ? `${dec(r.dayLo, 2)} – ${dec(r.dayHi, 2)}` : '–') },
    { label: '52-week', cls: 'r', mob: 'under', render: (r) => (r.lo && r.hi ? h('div', { class: 'wl-52c' }, h('small', null, `${dec(r.lo, 0)} – ${dec(r.hi, 0)}`), r.pos != null ? h('span', { class: 'tm-rng' }, h('i', { style: { left: r.pos * 100 + '%' } })) : null,
      r.fromHigh != null ? h('div', null, h('span', { class: 'wl-badge ' + (r.fromHigh >= 0 ? 'pos' : 'neg') }, (r.fromHigh >= 0 ? '▲ +' : '▼ −') + Math.abs(r.fromHigh * 100).toFixed(1) + '%'), h('small', null, ' from high')) : null) : '–') },
    { label: 'P/E · Cap', cls: 'r', mob: 'under', render: (r) => (r.pe || r.mcap ? h('div', null, h('div', null, r.pe ? r.pe.toFixed(1) : '–'), r.mcap ? h('small', null, crore(r.mcap)) : null) : '–') },
    { label: 'Target · Distance', cls: 'r', mob: 'under', render: (r) => (r.target ? h('div', null, h('div', null, (r.target >= (r.price || 0) ? '≥ ' : '≤ ') + rs(r.target)), r.price ? h('small', { class: 'wl-away' }, `${r.target >= r.price ? '+' : '−'}${Math.abs((r.target / r.price - 1) * 100).toFixed(1)}% away`) : null) : '–') },
    { label: 'Note', mob: 'hide', render: (r) => h('span', { class: 'wl-note' }, r.note || '') },
    { label: 'Trade', cls: 'r', mob: 'hide', render: (r) => (canEdit() ? h('div', { class: 'wl-trade' }, h('button', { type: 'button', class: 'chip-btn small', onclick: (e) => { e.stopPropagation(); itemForm(l, r.it); } }, 'Edit'), r.it.index ? null : h('button', { type: 'button', class: 'chip-btn small buy', onclick: (e) => { e.stopPropagation(); tradeForm(null, { type: 'BUY', symbol: r.sym, name: r.name }); } }, 'Buy')) : '') },
  ];
  const nA = (r) => alerts.filter((a) => a.kind === 'stock' && WL.norm(a.ref) === WL.norm(r.sym)).length;
  const tbl = rows.length ? table(cols, rows, { onRow: (r) => { location.hash = '#/equity/quote?sym=' + encodeURIComponent(r.sym); }, mobile: null, m: { key: 'wl', head: 'Share', views: [['Price · Today', 'Day range'], ['52-week', 'P/E · Cap'], ['Target · Distance', 'Note']], extra: 'Trade' }, empty: 'Nothing on this list yet.' }) : h('p', { class: 'empty' }, 'Nothing on this list yet.');
  root.append(h('section', { class: 'card' },
    h('header', { class: 'card-head wl-head' }, h('h2', null, l.name),
      h('div', { class: 'row-actions' }, canEdit() ? btn('Add share', () => addShare(l), 'primary') : null, canEdit() ? btn('Add index', () => addIndex(l), '') : null, btn('Get prices', (e) => refreshAll(e.currentTarget, rerender), canEdit() ? 'small' : 'primary'))),
    tbl,
    h('p', { class: 'note' }, 'Tap a share for its page and chart. ', at ? 'Prices fetched ' + new Date(at).toLocaleString('en-IN') + '. ' : 'Prices are fetched only when you press Get prices; adding a share does not fetch anything. ', 'Day range and 52-week range appear after a price fetch; P/E and market cap after Get prices too (or after you open that share’s page). Set a target price or a note with Edit.'),
    rows.some((r) => nA(r)) ? h('p', { class: 'note' }, 'Shares with price alerts: ' + rows.filter((r) => nA(r)).map((r) => r.sym).join(', ') + '.') : null));
}
import { rowList } from '../ui.js';
const rowListSafe = (c) => rowList(c);
function removePicker(l) {
  const items = l.items || []; if (!items.length) return toast('Nothing to remove');
  formDialog({ title: 'Remove from ' + l.name, fields: [{ key: 'symbol', label: 'Share', type: 'select', options: items.map((i) => ({ value: i.symbol, label: `${i.name || i.symbol} (${i.symbol})` })) }], value: { symbol: items[0].symbol }, saveLabel: 'Remove',
    onSave: (v) => mutate((d) => WL.removeItem(d, l.id, v.symbol)) });
}
