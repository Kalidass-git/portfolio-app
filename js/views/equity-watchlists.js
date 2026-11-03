// Manage > Watchlists: your own lists of shares, a manual price refresh for these lists only, and links to each share's chart and alerts.
import { S, mutate } from '../store.js';
import { typeahead, h, money, dec, pct, section, btn, canEdit, toast, formDialog, confirmDialog, posNeg, icon } from '../ui.js';
import * as WL from '../watchlists.js';
import * as W from '../watch.js';

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
  const wrap = h('div', { class: 'card' }, h('div', { class: 'find-row' }, input), h('p', { class: 'note' }, 'Open any NSE share or index to see its chart and figures first. The ☆ Watch button on that page puts it on the watchlist you choose. You can also add straight from a list below.'));
  typeahead(input, () => [...known.values()].map(label), { onPick: go, host: wrap.firstChild });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(input.value); } });
  return wrap;
}

export function render(root) {
  const lists = WL.lists(S.data), rerender = () => window.dispatchEvent(new Event('rerender'));
  const at = WL.refreshedAt();
  const bar = h('div', { class: 'card' },
    h('p', { class: 'note' }, 'Your own lists of shares to follow. Their prices are fetched only when you press Refresh here. The main Refresh never touches them.'),
    h('div', { class: 'row-actions' },
      btn('Refresh prices', (e) => refreshAll(e.currentTarget, rerender), canEdit() ? '' : 'primary'),
      canEdit() ? btn('New watchlist', () => listForm(null), 'primary') : null,
      h('span', { class: 'stamp' }, at ? 'Prices ' + new Date(at).toLocaleString('en-IN') : 'Not refreshed yet')));
  root.append(bar);
  root.append(searchCard());
  if (!lists.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No watchlists yet.'), h('p', { class: 'note' }, canEdit() ? 'Press New watchlist, then add shares by their NSE symbol.' : ''))); return; }
  if (openId == null || !lists.some((l) => l.id === openId)) openId = lists[0].id;
  root.append(h('div', { class: 'row-actions', role: 'tablist', 'aria-label': 'Watchlists' }, lists.map((l) => h('button', { type: 'button', class: 'chip-btn' + (l.id === openId ? ' on' : ''), onclick: () => { openId = l.id; rerender(); } }, `${l.name} · ${(l.items || []).length}`))));
  const l = lists.find((x) => x.id === openId);
  const alerts = S.data.alerts || [];
  const cards = (l.items || []).map((it) => {
    const q = WL.quoteOf(it.symbol), n = alerts.filter((a) => a.kind === 'stock' && WL.norm(a.ref) === WL.norm(it.symbol)).length;
    const m = W.metrics()[W.stockKey(it.symbol)], px = q ? q.price : m ? m.price : null;
    const bits = [];
    if (m && m.pe > 0) bits.push('P/E ' + m.pe.toFixed(1));
    if (m && m.mcap > 0) bits.push('Mcap ' + (m.mcap >= 1e12 ? '₹' + (m.mcap / 1e12).toFixed(2) + ' L Cr' : '₹' + Math.round(m.mcap / 1e7).toLocaleString('en-IN') + ' Cr'));
    if (m && m.dy > 0) bits.push('Yield ' + m.dy.toFixed(1) + '%');
    if (m && m.dma200 > 0 && px) bits.push(px >= m.dma200 ? 'above 200d' : 'below 200d');
    const pos = m && m.hi52 > m.lo52 && px != null ? Math.max(0, Math.min(1, (px - m.lo52) / (m.hi52 - m.lo52))) : null;
    const extra = bits.length || pos != null ? h('span', { class: 'wl-info' },
      bits.length ? h('span', { class: 'rl-sub' }, bits.join(' · ')) : null,
      pos != null ? h('span', { class: 'wl-52' }, h('small', null, dec(m.lo52, 0)), h('span', { class: 'tm-rng' }, h('i', { style: { left: pos * 100 + '%' } })), h('small', null, dec(m.hi52, 0)), h('small', { class: 'wl-hi' }, (px / m.hi52 - 1 >= 0 ? '+' : '−') + Math.abs((px / m.hi52 - 1) * 100).toFixed(0) + '% from high')) : null) : null;
    return { extra, title: it.name || it.symbol, sub: [it.index ? 'Index' : it.symbol, n ? `${n} alert${n > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '),
      value: q ? money(q.price) : '–', valueSub: q && q.dayPct != null ? h('span', { class: posNeg(q.dayPct) }, (q.dayPct >= 0 ? '+' : '') + pct(q.dayPct, 2)) : '',
      onClick: () => { location.hash = '#/equity/quote?sym=' + encodeURIComponent(it.symbol); } };
  });
  const list = cards.length ? null : h('p', { class: 'empty' }, 'Nothing on this list yet.');
  root.append(section(l.name, h('div', null, list, cards.length ? rowListSafe(cards) : null,
    canEdit() ? h('div', { class: 'row-actions' }, btn('Add a share', () => addShare(l), ''), btn('Add an index', () => addIndex(l), ''), btn('Rename', () => listForm(l), 'small'),
      btn('Remove a share', () => removePicker(l), 'small')) : null)));
}
import { rowList } from '../ui.js';
const rowListSafe = (c) => rowList(c);
function removePicker(l) {
  const items = l.items || []; if (!items.length) return toast('Nothing to remove');
  formDialog({ title: 'Remove from ' + l.name, fields: [{ key: 'symbol', label: 'Share', type: 'select', options: items.map((i) => ({ value: i.symbol, label: `${i.name || i.symbol} (${i.symbol})` })) }], value: { symbol: items[0].symbol }, saveLabel: 'Remove',
    onSave: (v) => mutate((d) => WL.removeItem(d, l.id, v.symbol)) });
}
