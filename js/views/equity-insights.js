// Shares & funds → Insights (exposure, sector, size, stocks vs ETFs) and Sold (what selling earned vs holding on).
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, formDialog, money, compact, pct, dateStr, section, table, stat, btn, canEdit, num, dec, posNeg, rowList } from '../ui.js';
import { hbars, donut, legend, strip } from '../charts.js';
import { classify, fundCategory } from '../classify.js';
import { symKey } from '../trades.js';
import { classifyForm, priceOfSymbol, sellForm } from './eqshared.js';
import * as prices from '../prices.js';
import { toast } from '../ui.js';
import { xirrFor } from '../trades.js';
import * as HL from '../health.js';
import { stockOhlc, stockInfo } from '../history.js';

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

// ---------- Health check: how each share and ETF you hold is doing, and what to think about ----------
const VERDICT = { well: ['Doing well', 'pos'], track: ['On track', ''], watch: ['Watch', 'warn'], review: ['Review', 'neg'] };
const ACTION = { add: 'Add more', hold: 'Hold', trim: 'Trim', review: 'Review or exit' };
const extra = new Map();   // symbol -> { trend, info } from the backend, kept until the page is reloaded
let extraState = 'idle';   // idle | loading | done

function healthRows(all) {
  const eq = all.stocks.eq, items = all.stocks.items.filter((s) => s.current > 0), total = items.reduce((a, s) => a + s.current, 0) || 1;
  const now = Number.isFinite(Date.parse(all.asOf)) ? Date.parse(all.asOf) : Date.now();
  return items.map((s) => {
    const sym = symKey(s.symbol), flows = eq ? eq.flows.get(sym) || [] : [], first = flows.length ? flows.map((f) => f.date).sort()[0] : null;
    const h0 = eq ? eq.holdings.find((x) => x.symbol === sym) : null, c = classify(s), ex = extra.get(sym) || {};
    const f = { key: s.id, name: s.name, symbol: s.symbol, yahoo: s.yahoo || '', sector: c.sector, value: s.current, invested: s.invested, ret: h0 && h0.cost > 0 ? s.current / h0.cost - 1 : Number.isFinite(s.ret) ? s.ret : null, price: s.livePrice, share: s.current / total,
      heldDays: first ? Math.max(0, (now - Date.parse(first)) / 864e5) : 0, xirr: eq && first ? xirrFor(eq, [sym], s.current, all.asOf) : null, lots: h0 ? h0.lots : null, trend: ex.trend || null, info: ex.info || null };
    return { ...f, ...HL.assess(f) };
  });
}
function soldRows(data, all) {
  const eq = all.stocks.eq; if (!eq) return [];
  return eq.sold.map((s) => { const o = (data.soldSettings || {})[s.symbol] || {}, sym = (o.nowSymbol || s.nowSymbol).toUpperCase(), px = o.suppress ? (o.manualPrice > 0 ? o.manualPrice : null) : priceOfSymbol(sym); return { ...s, nowValue: px ? s.nowQty * px : null }; });
}
async function loadExtra(rows, onProgress) {
  extraState = 'loading'; let done = 0; const queue = rows.slice();
  const work = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const sym = symKey(r.symbol), out = {};
      try { out.trend = HL.trendFrom((await stockOhlc(r.symbol, r.yahoo)).rows); } catch (e) { /* no history for this one */ }
      try { const v = await stockInfo(r.symbol, r.yahoo); out.info = { pe: v.q && v.q.pe, roe: v.d && v.d.roe, earnGrowth: v.d && v.d.earnGrowth }; } catch (e) { /* no figures */ }
      extra.set(sym, out); onProgress(++done, rows.length);
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  extraState = 'done';
}

function healthCard(all, data) {
  const rows = healthRows(all);
  if (!rows.length) return null;
  const count = (a) => rows.filter((r) => r.action === a).length;
  const order = { review: 0, trim: 1, add: 2, hold: 3 }, vo = { review: 0, watch: 1, track: 2, well: 3 };
  const sorted = rows.slice().sort((a, b) => order[a.action] - order[b.action] || vo[a.verdict] - vo[b.verdict] || b.value - a.value);
  const mv = HL.moves({ holdings: rows, sold: soldRows(data, all) }), ov = HL.overview(rows);
  const live = !!(S.cfg && S.cfg.backendUrl);
  const btnEl = live && extraState !== 'done' ? h('button', { type: 'button', class: 'refresh-btn small', disabled: extraState === 'loading', onclick: async (e) => {
    const b = e.currentTarget, lb = b.querySelector('.lb'); b.disabled = true;
    await loadExtra(rows, (d, n) => { lb.textContent = `Checking ${d} of ${n}…`; }); rerender();
  } }, h('span', { class: 'lb' }, 'Add price trend and key figures')) : null;
  const moveList = (list, none) => (list.length ? h('ul', { class: 'hc-moves' }, list.map((m) => h('li', null, h('b', null, m.title), ' ', m.text))) : h('p', { class: 'note' }, none));
  return h('div', null,
    section('Health check', h('div', null,
      h('div', { class: 'stats' }, stat('Add more', count('add'), 'doing well, small share'), stat('Hold', count('hold'), 'nothing to do'), stat('Trim', count('trim'), 'too big a share'), stat('Review or exit', count('review'), 'long loss, weak signs')),
      ov.length ? h('p', { class: 'note' }, ov.join(' ')) : null,
      h('div', { class: 'row-actions', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', margin: '8px 0' } }, btnEl,
        h('span', { class: 'stamp' }, extraState === 'done' ? 'Includes price trend and key figures' : live ? 'Based on your returns and holding sizes. Add the price trend and key figures for a fuller view.' : 'Based on your returns and holding sizes. Price trend and key figures need your backend.')),
      rowList(sorted.map((r) => ({ title: r.name, sub: r.reasons.slice(0, 2).join('. '), value: ACTION[r.action], tone: VERDICT[r.verdict][1], valueSub: VERDICT[r.verdict][0] + (r.xirr != null && r.heldDays >= 365 ? ' · ' + pct(r.xirr, 0) + ' a year' : r.ret != null ? ' · ' + pct(r.ret, 0) : ''),
        extra: r.reasons.length > 2 ? h('span', { class: 'rl-sub' }, r.reasons.slice(2).join('. ')) : null, onClick: () => { location.hash = '#/equity/holding?sym=' + encodeURIComponent(r.symbol); } }))),
      h('p', { class: 'note' }, `Rules in plain words: a share held over a year is judged by its yearly return (${pct(HL.RULES.great, 0)}+ is doing well, ${pct(HL.RULES.benchmark, 0)} is the market's long-run pace, below ${pct(HL.RULES.weak, 0)} is weak), its price trend and its profit. “Add more” is for a good holding under ${pct(HL.RULES.addBelow, 0)} of your shares and ETFs, “Trim” for one over ${pct(HL.RULES.trimAbove, 0)}. These are observations from your own numbers, not investment advice.`))),
    h('div', { class: 'grid2' }, section('Good moves', moveList(mv.good, 'Nothing stands out yet.')), section('Moves to learn from', moveList(mv.bad, 'No clear mistakes found. Press Refresh sold prices on the Sold tab to compare your sales with today.'))));
}

export function insights(root) {
  const { all } = S;
  const rows = holdingsFor(all);
  const total = rows.reduce((a, r) => a + r.value, 0);
  root.append(h('div', { class: 'filters' }, h('label', { class: 'inline-label' }, 'Look at ', h('select', { 'aria-label': 'Scope', onchange: (e) => { scope = e.target.value; rerender(); } }, SCOPES.map(([v, l]) => h('option', { value: v, selected: v === scope }, l))))));
  if (!rows.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Nothing in this selection yet.'))); return; }

  const hc = healthCard(all, S.data); if (hc) root.append(hc);
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
    const sym = (o.nowSymbol || s.nowSymbol).toUpperCase();
    const px = o.suppress ? (o.manualPrice > 0 ? o.manualPrice : null) : priceOfSymbol(sym);
    const pb = (data.priceBook || {})[sym], held = all.stocks.items.some((i) => i.symbol && i.symbol.toUpperCase() === sym && i.livePrice > 0);
    const pxAt = !o.suppress && px && !held && pb && pb.at ? pb.at : null, issue = !o.suppress && !px ? prices.soldIssues[sym] || null : null;
    const nowValue = px ? s.nowQty * px : null;
    return { ...s, o, px, pxAt, issue, nowValue, diff: nowValue == null ? null : nowValue - s.proceeds, ret: s.cost ? s.realized / s.cost : null, split: Math.abs(s.nowQty - s.qty) > 1e-6 };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
  const priced = list.filter((x) => x.nowValue != null);
  const proceeds = list.reduce((a, x) => a + x.proceeds, 0), cost = list.reduce((a, x) => a + x.cost, 0), realized = proceeds - cost;
  const pProceeds = priced.reduce((a, x) => a + x.proceeds, 0), kept = priced.reduce((a, x) => a + x.nowValue, 0), diff = kept - pProceeds;
  // These prices are fetched here, not by the holdings Refresh: only the sold shares, only when asked.
  const stamps = prices.soldSymbols().map((q) => ((data.priceBook || {})[q.symbol] || {}).at).filter(Boolean).sort();
  const age = stamps.length ? Date.now() - new Date(stamps[0]).getTime() : null;
  root.append(h('div', { class: 'row-actions', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
    canEdit() ? h('button', { type: 'button', class: 'refresh-btn small', title: 'Fetch current prices for the shares you sold, to show what they would be worth if kept', onclick: async (e) => {
      const b = e.currentTarget, lb = b.querySelector('.lb'), t0 = lb.textContent; b.disabled = true;
      try { const r = await prices.refreshSold((m) => (lb.textContent = m)); toast(r.total ? `Updated ${r.count} of ${r.total} sold share prices` + (r.errors.length ? `. ${r.errors.length} issue${r.errors.length > 1 ? 's' : ''}: ${r.errors[0]}` : '') : 'No sold shares to price', r.errors.length ? 'bad' : ''); }
      catch (err) { toast(err.message, 'bad'); } finally { lb.textContent = t0; b.disabled = false; rerender(); }
    } }, h('span', { class: 'lb' }, 'Refresh sold prices')) : null,
    h('span', { class: 'stamp' }, age == null ? 'Sold-share prices not fetched yet' : 'Prices ' + (age < 6e4 ? 'just now' : age < 36e5 ? Math.floor(age / 6e4) + ' min ago' : age < 864e5 ? Math.floor(age / 36e5) + ' hours ago' : Math.floor(age / 864e5) + ' days ago'))),
    h('div', { class: 'stats' },
    stat('Sold for', money(proceeds), `${list.length} sale${list.length === 1 ? '' : 's'} · cost ${money(cost)}`),
    stat('Profit or loss made', h('span', { class: posNeg(realized) }, money(realized)), cost ? pct(realized / cost, 1) + ' on cost' : ''),
    stat('If you had kept them', priced.length ? money(kept) : '–', priced.length < list.length ? (priced.length ? `${priced.length} of ${list.length} have a price` : 'press Refresh sold prices') : 'value today'),
    stat(diff >= 0 ? 'Holding on would have given' : 'Selling saved you', priced.length ? h('span', { class: diff >= 0 ? 'warn' : 'pos' }, money(Math.abs(diff))) : '–', diff >= 0 ? 'more than you sold for' : 'compared with holding on')));
  root.append(section('Every sale', h('div', null, table([
    { label: 'Sold on', mob: 'under', mlabel: 'sold ', get: (x) => dateStr(x.date) },
    { label: 'Share', host: true, render: (x) => h('span', null, x.name, x.split ? h('small', { class: 'tag' }, `now ${num(x.nowQty)} sh`) : null, x.o.suppress ? h('small', { class: 'tag' }, 'price off') : null, x.o.nowSymbol ? h('small', { class: 'sub' }, ' → ' + x.o.nowSymbol) : null) },
    { label: 'Qty', mob: 'under', mlabel: 'qty ', cls: 'r', get: (x) => num(x.qty) },
    { label: 'Sold for', cls: 'r', get: (x) => money(x.proceeds), total: () => money(proceeds) },
    { label: 'Bought for', mob: 'under', mlabel: 'bought ', cls: 'r', get: (x) => money(x.cost), total: () => money(cost) },
    { label: 'Profit / loss', cls: 'r', render: (x) => h('span', { class: posNeg(x.realized) }, money(x.realized), x.ret != null ? h('small', { class: 'sub' }, ' ' + pct(x.ret, 0)) : null), total: () => h('span', { class: posNeg(realized) }, money(realized)) },
    { label: 'Value today if kept', mob: 'under', mlabel: 'now ', cls: 'r', get: (x) => (x.nowValue == null ? h('span', { class: 'muted' }, x.o.suppress ? 'price off' : x.issue ? 'no price: ' + x.issue : 'no price yet') : h('span', null, money(x.nowValue) + (x.o.suppress && x.o.manualPrice ? ' (set by you)' : ''), x.pxAt ? h('small', { class: 'sub' }, ' · price ' + dateStr(x.pxAt.slice(0, 10))) : null)), total: () => (priced.length ? money(kept) : '') },
    { label: 'Kept vs sold', mob: 'under', mlabel: 'vs keeping: ', cls: 'r', render: (x) => (x.diff == null ? '–' : h('span', { class: x.diff > 0 ? 'warn' : 'pos' }, (x.diff > 0 ? '+' : '−') + money(Math.abs(x.diff)), h('small', { class: 'sub' }, x.diff > 0 ? ' missed' : ' saved'))) },
  ], list, { footer: { label: 'Total' }, m: { key: 'eq-sold', head: 'Share', sub: (x) => `${dateStr(x.date)} · ${num(x.qty)} ${x.qty === 1 ? 'share' : 'shares'}`,
    views: [['Profit / loss', 'Sold for'], ['Bought for', 'Value today if kept'], ['Kept vs sold']],
    sort: [{ value: 'none', label: 'As listed', kind: 'none' }, { value: 'date', label: 'Sold on', kind: 'date', get: (x) => x.date }, { value: 'profit', label: 'Profit / loss', kind: 'num', get: (x) => x.realized }, { value: 'sold', label: 'Sold for', kind: 'num', get: (x) => x.proceeds }, { value: 'name', label: 'Share', kind: 'text', get: (x) => String(x.name || '').toLowerCase() }] }, onRow: canEdit() ? (x) => soldSymbolForm(x) : null }),
    h('p', { class: 'note' }, 'Profit uses first-in-first-out cost, which is how the tax department matches sales to purchases. “Kept vs sold” is the value today of the shares you sold (after any later split or bonus) minus what you received. Fully sold shares get a price when you press Refresh sold prices (each row shows the day its price was fetched, or why none was found). Shares that no longer trade (merged or unlisted) have no price; tap a row to give it another symbol or set a price yourself. Brokerage and taxes are included only if they were in the file or the sale entry.'))));
}
