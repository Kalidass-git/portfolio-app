// Alerts, watchlist, screens and fundamentals cards for shares and funds.
import { S, mutate, nextId } from '../store.js';
import { h, money, dec, pct, dateStr, section, table, stat, btn, canEdit, toast, formDialog, dialog, confirmDialog, rowList } from '../ui.js';
import * as W from '../watch.js';
import { searchScheme } from '../prices.js';
import { call } from '../remote.js';

const rerender = () => window.dispatchEvent(new Event('rerender'));
const ago = (ms) => { const m = Math.floor((Date.now() - ms) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
const rs = (n) => '₹' + (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2));
const pc = (n, d = 1) => (n == null ? '–' : (n < 0 ? '−' : '') + (Math.abs(n) * 100).toFixed(d) + '%');
let auto = false, busy = false;

/** Fetch now. Used by the button and, once per visit, when the numbers are old. */
export async function refreshIndicators(onProgress) {
  if (busy) return;
  busy = true;
  try {
    const res = await W.refreshMetrics(W.targetsOf(S.data, S.all), onProgress);
    toast(`Updated ${res.shares} shares and ${res.funds} funds` + (res.errors.length ? `. ${res.errors.length} issue${res.errors.length > 1 ? 's' : ''}: ${res.errors[0]}` : ''), res.errors.length ? 'bad' : '');
  } finally { busy = false; rerender(); }
}
export function refreshBar() {
  const at = W.metricsAt();
  if (!auto && W.isStale() && (W.targetsOf(S.data, S.all).length)) { auto = true; setTimeout(() => { if (!busy) refreshIndicators().catch(() => {}); }, 300); }
  return h('div', { class: 'price-bar' }, h('span', { class: 'stamp' + (at && !W.isStale(864e5) ? '' : ' warn') }, at ? `P/E, 52-week range and alerts updated ${ago(at)}. Use Refresh above to update.` : 'Indicators not fetched yet. Use Refresh above.'));
}

const heldKeys = () => new Set(W.universe(S.data, S.all).filter((u) => u.held).map((u) => u.key));
// ---------- triggered alerts ----------
export function triggeredCard({ link = true } = {}) {
  const { hit, waiting } = W.evalAlerts(S.data);
  const total = (S.data.alerts || []).filter((a) => a.on !== false).length;
  const rows = hit.map((x) => ({ title: x.alert.name, sub: x.text, value: h('span', { class: 'neg' }, W.ruleTag(x.alert.rule)), valueSub: heldKeys().has(W.alertKey(x.alert)) ? 'you hold it' : 'watchlist', onClick: () => alertForm(x.alert) }));
  return section(`Price alerts${hit.length ? ` · ${hit.length} triggered` : ''}`, h('div', null,
    hit.length ? rowList(rows) : h('p', { class: 'empty' }, total ? 'None of your alerts has triggered right now.' : 'No alerts yet. Set one up to be told when a share or fund reaches a price, P/E or 52-week mark.'),
    waiting.length ? h('p', { class: 'note' }, `${waiting.length} alert${waiting.length > 1 ? 's are' : ' is'} waiting for the first indicator fetch.`) : null,
    link ? h('p', null, h('a', { href: '#/equity/watch?v=alerts' }, total ? 'Manage alerts and watchlist' : 'Set up alerts')) : null));
}

// ---------- screens ----------
let scope = 'held';
export function screensSection() {
  const all = W.universe(S.data, S.all);
  const rows = all.filter((r) => scope === 'all' || r.held).map((r) => ({ ...r, m: W.metrics()[r.key] || null }));
  const hasWatch = all.some((r) => !r.held);
  const bar = h('div', { class: 'row-actions' }, [['held', 'My holdings'], ['all', 'Holdings + watchlist']].filter(([k]) => k === 'held' || hasWatch).map(([k, l]) => h('button', { type: 'button', class: 'chip-btn' + (scope === k ? ' on' : ''), onclick: () => { scope = k; rerender(); } }, l)));
  const have = rows.filter((r) => r.m).length;
  const secs = W.buildScreens(rows);
  const wrap = h('div', null, bar);
  if (!have) { wrap.append(h('p', { class: 'empty' }, 'Press Refresh indicators to load P/E, 52-week ranges and returns. Then this page lists what is near highs and lows, cheap, expensive and more.')); return section('Where to look', wrap); }
  wrap.append(h('div', { class: 'grid2' }, secs.map((s) => h('div', { class: 'card inner' }, h('h4', null, s.title), s.hint ? h('p', { class: 'note' }, s.hint) : null,
    rowList(s.items.map((it) => ({ title: it.r.name, sub: it.sub, value: h('span', { class: it.tone || '' }, it.main), valueSub: it.r.held ? '' : 'watchlist', onClick: it.r.href ? () => { location.hash = it.r.href; } : null })))))));
  wrap.append(h('p', { class: 'note' }, `Based on ${have} of ${rows.length} items with indicators. These lists are prompts to look closer, not advice to buy or sell.`));
  return section('Where to look', wrap);
}

// ---------- alert setup ----------
function nameOf(kind, ref) { const u = W.universe(S.data, S.all).find((x) => x.kind === kind && String(x.ref) === String(ref)); return u ? u.name : ref; }
export function alertForm(a) {
  const isNew = !a || !a.id;
  const uni = W.universe(S.data, S.all);
  const opts = (kind) => { const l = uni.filter((u) => u.kind === kind).map((u) => ({ value: String(u.ref), label: u.name + (u.held ? ' (you hold it)' : '') })); return kind === 'stock' ? [{ value: '__new', label: 'A share not in my list…' }, ...l] : l; };
  const rule = (kind) => W.rulesFor(kind).map((r) => ({ value: r.id, label: r.label }));
  const kind0 = a ? a.kind : 'stock';
  formDialog({
    title: isNew ? 'New alert' : 'Edit alert', value: a ? { kind: a.kind, stockRef: a.kind === 'stock' ? a.ref : '', fundRef: a.kind === 'fund' ? a.ref : '', stockRule: a.kind === 'stock' ? a.rule : '', fundRule: a.kind === 'fund' ? a.rule : '', value: a.value, on: a.on !== false } : { kind: 'stock', on: true },
    fields: [
      { key: 'kind', label: 'For a', type: 'select', options: [{ value: 'stock', label: 'Share or ETF' }, { value: 'fund', label: 'Mutual fund' }] },
      { key: 'stockRef', label: 'Which share', type: 'select', options: opts('stock'), showIf: (v) => v.kind === 'stock', required: false },
      { key: 'newSymbol', label: 'NSE symbol', hint: 'For example TCS. It is added to your watchlist so its numbers load.', showIf: (v) => v.kind === 'stock' && v.stockRef === '__new' },
      { key: 'fundRef', label: 'Which fund', type: 'select', options: opts('fund'), showIf: (v) => v.kind === 'fund', hint: opts('fund').length ? '' : 'Add the fund to your watchlist first (Alerts tab → Add fund).' },
      { key: 'stockRule', label: 'Tell me when', type: 'select', options: rule('stock'), showIf: (v) => v.kind === 'stock' },
      { key: 'fundRule', label: 'Tell me when', type: 'select', options: rule('fund'), showIf: (v) => v.kind === 'fund' },
      { key: 'value', label: 'Level', type: 'number', hint: 'Rupees, times, or percent, as the sentence above says. Leave empty for the “200-day average” rules.' },
      { key: 'on', label: 'Alert is on', type: 'checkbox' },
    ],
    onSave: (v) => {
      const kind = v.kind, rid = kind === 'stock' ? v.stockRule : v.fundRule, r = W.ruleOf(rid);
      let ref = kind === 'stock' ? v.stockRef : v.fundRef, name;
      if (kind === 'stock' && ref === '__new') { ref = String(v.newSymbol || '').toUpperCase().trim(); if (!ref) { toast('Enter the NSE symbol.', 'bad'); return false; } name = ref; }
      if (!ref) { toast('Choose which ' + (kind === 'fund' ? 'fund' : 'share') + '.', 'bad'); return false; }
      if (!r) { toast('Choose a rule.', 'bad'); return false; }
      if (!r.noValue && !(v.value != null && Number.isFinite(Number(v.value)))) { toast('Enter the level for this rule.', 'bad'); return false; }
      name = name || nameOf(kind, ref);
      const uni2 = W.universe(S.data, S.all);
      const known = uni2.find((u) => u.kind === kind && String(u.ref) === String(ref));
      mutate((d) => {
        d.alerts = d.alerts || []; d.watchlist = d.watchlist || [];
        if (!known) d.watchlist.push({ id: nextId('w', d.watchlist), kind, ref, name });
        const rec = { kind, ref, name, rule: rid, on: v.on !== false }; if (!r.noValue) rec.value = Number(v.value);
        if (isNew) d.alerts.push({ id: nextId('al', d.alerts), ...rec });
        else { const t = d.alerts.find((x) => x.id === a.id); delete t.value; Object.assign(t, rec); }
      });
      toast('Alert saved. Press Refresh indicators to check it now.');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.alerts = (d.alerts || []).filter((x) => x.id !== a.id); }),
  });
}
export function fundPicker() {
  const input = h('input', { type: 'search', placeholder: 'Part of the fund name, e.g. parag parikh flexi', autocomplete: 'off', style: { width: '100%' } });
  const list = h('ul', { class: 'pick' }), msg = h('p', { class: 'note' }, 'Type at least three letters, then press Search.');
  const dlg = dialog('Add a fund to watch', h('div', null, input, h('p', null, btn('Search', async () => {
    if (input.value.trim().length < 3) { msg.textContent = 'Type at least three letters.'; return; }
    msg.textContent = 'Searching…'; list.replaceChildren();
    try {
      const res = (await searchScheme(input.value.trim())).slice(0, 25);
      msg.textContent = res.length ? 'Tap the right one. Direct plan, growth option is usually the one to pick.' : 'No fund found. Try fewer words.';
      for (const s of res) list.append(h('li', null, h('button', { class: 'wide', onclick: () => { mutate((d) => { d.watchlist = d.watchlist || []; if (!d.watchlist.some((w) => w.kind === 'fund' && String(w.ref) === String(s.schemeCode))) d.watchlist.push({ id: nextId('w', d.watchlist), kind: 'fund', ref: String(s.schemeCode), name: s.schemeName }); }); dlg.close(); toast('Added to your watchlist.'); } }, s.schemeName)));
    } catch (e) { msg.textContent = e.message; }
  }, 'primary')), msg, list), [{ label: 'Close', onclick: (c) => c() }]);
  input.focus();
}
export function stockAdder() {
  formDialog({ title: 'Add a share to watch', fields: [{ key: 'symbol', label: 'NSE symbol', required: true, hint: 'For example TCS or HDFCBANK' }, { key: 'name', label: 'Name (optional)' }],
    onSave: (v) => { const ref = v.symbol.toUpperCase().trim(); mutate((d) => { d.watchlist = d.watchlist || []; if (!d.watchlist.some((w) => w.kind === 'stock' && w.ref.toUpperCase() === ref)) d.watchlist.push({ id: nextId('w', d.watchlist), kind: 'stock', ref, name: v.name || ref }); }); toast('Added. Press Refresh indicators to load its numbers.'); } });
}
export function alertsTab(root) {
  const data = S.data, wl = data.watchlist || [], al = data.alerts || [];
  root.append(refreshBar(), triggeredCard({ link: false }));
  const ev = W.evalAlerts(data), hitIds = new Set(ev.hit.map((x) => x.alert.id));
  const cur = (a) => { const m = W.metrics()[W.alertKey(a)]; if (!m) return '–'; return /^(price|nav)/.test(a.rule) || /Dma|52|fall|day/.test(a.rule) ? rs(m.price) : /^pe/.test(a.rule) ? (m.pe ? m.pe.toFixed(1) + ' times' : '–') : /^pb/.test(a.rule) ? (m.pb ? m.pb.toFixed(2) : '–') : /^dy/.test(a.rule) ? (m.dy != null ? m.dy.toFixed(2) + '%' : '–') : /ret1y/.test(a.rule) ? pc(m.ret1y) : '–'; };
  root.append(section('Your alerts', h('div', null, table([
    { label: 'Share or fund', host: true, get: (a) => a.name },
    { label: 'Rule', mob: 'under', mlabel: '', get: (a) => W.alertText(a) },
    { label: 'Now', cls: 'r', get: cur },
    { label: 'Status', cls: 'r', render: (a) => (a.on === false ? h('span', { class: 'muted' }, 'off') : hitIds.has(a.id) ? h('b', { class: 'neg' }, 'triggered') : h('span', { class: 'muted' }, 'waiting')) },
  ], al, { onRow: canEdit() ? (a) => alertForm(a) : null, empty: 'No alerts yet.' }), h('p', { class: 'note' }, 'Alerts are checked each time you open this page and when you press Refresh indicators. They show here and on Today; the app does not send phone notifications.')),
    canEdit() ? [btn('New alert', () => alertForm(), 'primary')] : null));
  root.append(section('Watchlist', h('div', null, table([
    { label: 'Name', host: true, get: (w) => w.name || w.ref }, { label: 'Kind', mob: 'under', mlabel: '', get: (w) => (w.kind === 'fund' ? 'Fund' : 'Share') },
    { label: 'P/E', cls: 'r', get: (w) => { const m = W.metrics()[w.kind === 'stock' ? W.stockKey(w.ref) : W.fundKey(w.ref)]; return m && m.pe ? m.pe.toFixed(1) : '–'; } },
    { label: 'Price / NAV', cls: 'r', get: (w) => { const m = W.metrics()[w.kind === 'stock' ? W.stockKey(w.ref) : W.fundKey(w.ref)]; return m ? rs(m.price) : '–'; } },
  ], wl, { onRow: canEdit() ? (w) => confirmRemove(w) : null, empty: 'Nothing on the watchlist. Add shares or funds you do not own to track them here.' }), h('p', { class: 'note' }, 'Anything on the watchlist is included in the “Where to look” lists. Tap a row to remove it.')),
    canEdit() ? [btn('Add share', () => stockAdder()), btn('Add fund', () => fundPicker())] : null));
}
async function confirmRemove(w) {
  if (!(await confirmDialog(`Remove ${w.name || w.ref} from the watchlist? Alerts that use it are removed too.`, 'Remove'))) return;
  mutate((d) => { d.watchlist = (d.watchlist || []).filter((x) => x.id !== w.id); d.alerts = (d.alerts || []).filter((a) => !(a.kind === w.kind && String(a.ref) === String(w.ref))); });
}

// ---------- fundamentals cards ----------
function rangeBar(m) {
  if (!(m.hi52 > m.lo52)) return null;
  const pos = Math.max(0, Math.min(1, (m.price - m.lo52) / (m.hi52 - m.lo52)));
  return h('div', { class: 'range52' }, h('div', { class: 'r52-labels' }, h('span', null, '52-week low ' + rs(m.lo52)), h('span', null, 'high ' + rs(m.hi52))),
    h('div', { class: 'r52-track' }, h('i', { class: 'r52-dot', style: { left: (pos * 100).toFixed(1) + '%' } })), h('div', { class: 'note' }, `Now ${rs(m.price)}: ${(pos * 100).toFixed(0)}% of the way from the low to the high.`));
}
const kv = (label, v, tone) => h('div', { class: 'kv' }, h('span', { class: 'mini-title' }, label), h('b', { class: tone || '' }, v == null || v === '' ? '–' : v));
const bigNum = (n) => (n == null ? null : n >= 1e12 ? '₹' + (n / 1e12).toFixed(2) + ' lakh cr' : n >= 1e7 ? '₹' + Math.round(n / 1e7).toLocaleString('en-IN') + ' cr' : rs(n));

/** Fundamentals for one share: ratios from the fetched indicators, deeper numbers asked on demand. */
export function stockFundamentals(s) {
  const key = W.stockKey(s.symbol), body = h('div', null);
  const draw = (det) => {
    const m = W.metrics()[key];
    body.replaceChildren();
    if (!m) { body.append(h('p', { class: 'note' }, 'No indicators yet. Press Refresh indicators on the Alerts tab (or the button below) to load them.'), btn('Load now', async (e) => { e.currentTarget.disabled = true; await W.refreshMetrics([{ kind: 'stock', ref: s.symbol, key, yahoo: s.yahoo || '' }]); draw(det); }, 'primary')); return; }
    body.append(h('div', { class: 'stats' },
      stat('P/E (trailing)', m.pe ? m.pe.toFixed(1) : '–', m.fpe ? `forward ${m.fpe.toFixed(1)}` : 'profit-making companies only'),
      stat('Price to book', m.pb ? m.pb.toFixed(2) : '–', m.eps ? `EPS ${rs(m.eps)}` : ''),
      stat('Dividend yield', m.dy != null ? m.dy.toFixed(2) + '%' : '–', m.mcap ? 'market value ' + bigNum(m.mcap) : '')),
      rangeBar(m),
      h('div', { class: 'trio' }, kv('50-day average', m.dma50 ? rs(m.dma50) : null), kv('200-day average', m.dma200 ? rs(m.dma200) : null), kv('Trend', m.dma200 ? (m.price >= m.dma200 ? 'above 200-day' : 'below 200-day') : null, m.dma200 && m.price < m.dma200 ? 'neg' : 'pos')));
    if (det) body.append(h('h4', null, 'Business quality'), h('div', { class: 'trio' }, kv('Return on equity', pc(det.roe)), kv('Debt to equity', det.de != null ? (det.de / 100).toFixed(2) : null), kv('Profit margin', pc(det.margin))),
      h('div', { class: 'trio' }, kv('Revenue growth', pc(det.revGrowth), det.revGrowth < 0 ? 'neg' : ''), kv('Profit growth', pc(det.earnGrowth), det.earnGrowth < 0 ? 'neg' : ''), kv('Beta', det.beta != null ? det.beta.toFixed(2) : null)),
      det.sector ? h('p', { class: 'note' }, `${det.sector}${det.industry ? ' · ' + det.industry : ''}${det.target ? ' · analysts’ average target ' + rs(det.target) : ''}`) : null);
    else if (S.remote) body.append(btn('Show business quality (ROE, debt, margins, growth)', async (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Loading…'; try { const r = await call(S.cfg.backendUrl, S.cfg.key, 'details', { symbol: s.symbol, yahoo: s.yahoo || '' }); draw(r.details); } catch (err) { b.disabled = false; b.textContent = /Unknown action/i.test(err.message) ? 'Needs the newer Code.gs (see Settings notes)' : err.message; } }));
    body.append(h('p', { class: 'note' }, m.at ? `Numbers fetched ${ago(Date.parse(m.at))} from Yahoo Finance. They can lag or be missing for some companies.` : ''));
  };
  draw(null);
  return section('Fundamentals', body);
}
/** Returns and risk for one fund, worked out from its NAV history. */
export function fundFundamentals(m0, code) {
  const key = W.fundKey(code), body = h('div', null);
  const draw = () => {
    const m = W.metrics()[key]; body.replaceChildren();
    if (!m) { body.append(h('p', { class: 'note' }, 'Loading from the NAV history…')); W.refreshMetrics([{ kind: 'fund', ref: String(code), key, name: m0.name }]).then(() => { if (W.metrics()[key]) draw(); else body.replaceChildren(h('p', { class: 'empty' }, 'Could not load the NAV history.')); }); return; }
    body.append(h('div', { class: 'stats' }, stat('1 year', pc(m.ret1y), m.ret6m != null ? '6 months ' + pc(m.ret6m) : ''), stat('3 years a year', pc(m.cagr3), m.cagr5 != null ? '5 years ' + pc(m.cagr5) + ' a year' : ''), stat('Since ' + dateStr(m.startDate), pc(m.sinceStart), 'a year, from the first NAV')),
      rangeBar(m),
      h('div', { class: 'trio' }, kv('Below its all-time high', pc(m.fromAth), m.fromAth < -0.1 ? 'neg' : ''), kv('Ups and downs (1 year)', m.vol != null ? pc(m.vol) + ' a year' : null), kv('1 month · 3 months', `${pc(m.ret1m)} · ${pc(m.ret3m)}`)),
      m.house || m.category ? h('p', { class: 'note' }, [m.house, m.category].filter(Boolean).join(' · ')) : null,
      h('p', { class: 'note' }, 'Worked out from the NAV history. Expense ratio and fund size are not available from this source; check the fund house factsheet.'));
  };
  draw();
  return section('Fund fundamentals', body);
}
