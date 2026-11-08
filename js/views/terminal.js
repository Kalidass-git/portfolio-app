// The share page "terminal": price chart (line, % change or candles) with 50 / 200-day averages and a historical P/E panel, performance chips,
// key figures and a short business description. Used by the page of a share you hold and by the page of a watchlist share or index.
import { h, money, dec, pct, dateStr, section, btn, posNeg, toast, canEdit } from '../ui.js';
import { S, mutate } from '../store.js';
import { watchButton } from './watchbtn.js';
import { lineAlertForm } from './linealert.js';
import * as W from '../watch.js';
import { marketChart, LINE_COLORS } from '../mchart.js';
import { fullView } from '../fullview.js';
import { colourPanel } from '../chartcolors.js';
import { stockOhlc, stockEps, stockIndexPe, retryIndexPe, nativeApp, stockInfo, aggregateOhlc, candleMode, sliceRange, dropCache, RANGES } from '../history.js';
import { sma, epsTimeline, peSeries, performance } from '../ta.js';

const KEY = 'fw.term';
const median = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export const TL_COLORS = ['#00b8d4', '#e91e63', '#ffb300', '#7cb342', '#546e7a', '#ff5722'];
const defaults = { range: '6M', mode: 'line', iv: 'auto', dma50: true, dma200: true, pe: true };
const mem = new Map();   // per symbol: the zoom you left the chart at and the line you had selected (the page is rebuilt after every save)
const load = () => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d) => { const [y, m, dd] = d.split('-'); return `${+dd} ${MON[+m - 1]} '${y.slice(2)}`; };
const tick = (d) => { const [y, m] = d.split('-'); return MON[+m - 1] + " '" + y.slice(2); };
const vfmt = (v) => (v >= 1e7 ? (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? (v / 1e5).toFixed(2) + ' L' : v >= 1e3 ? (v / 1e3).toFixed(1) + ' K' : String(Math.round(v)));
const pxf = (v) => (v >= 1000 ? Math.round(v).toLocaleString('en-IN') : dec(v, v < 10 ? 2 : 1));
const rs = (v, d = 2) => (v == null ? '–' : '₹' + dec(v, d));
const pc = (v, d = 1) => (v == null ? '–' : (v * 100).toFixed(d) + '%');
const crore = (v) => (v == null ? '–' : v >= 1e12 ? '₹' + (v / 1e12).toFixed(2) + ' L Cr' : '₹' + Math.round(v / 1e7).toLocaleString('en-IN') + ' Cr');
const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };

/** Daily rows [{d,o,h,l,c,v}] from whatever the backend gave (older backends give closes only). */
const normalise = (res) => (res.rows && res.rows.length ? { rows: res.rows, closesOnly: false } : { rows: (res.closesOnly || []).map((x) => ({ d: x.d, o: x.v, h: x.v, l: x.v, c: x.v, v: 0 })), closesOnly: true });

function chartCard({ symbol, name, yahoo, index, indexPe = '', avgCost, firstBuy, trades, quote }) {
  const st = load();
  const body = h('div', null, h('p', { class: 'note' }, 'Loading the price history…'));
  const headBox = h('div', { class: 'tm-head' });
  const symKey = String(symbol).toUpperCase().trim();
  const mm = mem.get(symKey) || {}; mem.set(symKey, mm);
  let tool = mm.tool || 'none', chart = null, card = null, showCol = false;   // the tool and a half-drawn line are kept in mm, so a page rebuild (a sync finishing, say) does not cancel them
  const setTool = (t) => { tool = t; mm.tool = t; if (t !== 'line') mm.pend = null; };
  const lineBy = (d, id) => (((d.trendlines || {})[symKey]) || []).find((l) => l.id === id);
  const fv = fullView(() => card, () => { if (data) { draw(); header(); } }, 'T:' + String(symbol).toUpperCase().trim());
  const myLines = () => ((S.data && S.data.trendlines) || {})[symKey] || [];
  const noIdxPe = index && !(indexPe && nativeApp());   // index P/E: Android app only for now
  let data = null, eps = { state: noIdxPe ? 'none' : 'idle', msg: '', tl: null }, peFull = null;

  const header = () => {
    const rows = data ? data.rows : [], last = rows[rows.length - 1], prev = rows[rows.length - 2];
    const price = quote && quote.price != null ? quote.price : last ? last.c : null;
    const pv = quote && quote.prev != null ? quote.prev : prev ? prev.c : null;
    const ch = price != null && pv ? price - pv : null, cp = ch != null ? ch / pv : null;
    headBox.replaceChildren(
      h('div', { class: 'tm-price' }, price != null ? h('b', null, '₹' + dec(price, 2)) : h('b', { class: 'muted' }, '–'),
        cp != null ? h('span', { class: 'tm-badge ' + posNeg(ch) }, `${ch >= 0 ? '▲' : '▼'} ${ch >= 0 ? '+' : '−'}${Math.abs(cp * 100).toFixed(2)}%`) : null,
        ch != null ? h('span', { class: 'muted tm-sub' }, `${ch >= 0 ? '+' : '−'}${dec(Math.abs(ch), 2)} today`) : null,
        quote && quote.at ? h('span', { class: 'muted tm-sub' }, 'price ' + ago(Date.parse(quote.at))) : last ? h('span', { class: 'muted tm-sub' }, 'last close ' + dateStr(last.d)) : null),
      h('div', { class: 'tm-actions' }, fv.rotate, fv.button, watchButton({ symbol, name, yahoo, index }), btn('Reload chart', () => { dropCache(symbol); data = null; peFull = null; eps = { state: noIdxPe ? 'none' : 'idle', msg: '', tl: null }; body.replaceChildren(h('p', { class: 'note' }, 'Loading the price history…')); start(); toast('Reloading'); }, 'small')));
  };

  const canPe = !noIdxPe;
  const ensureEps = () => {
    if (!canPe || !st.pe || eps.state !== 'idle') return;
    eps.state = 'loading'; draw();
    if (index) {
      stockIndexPe(indexPe).then((rowsPe) => {
        // the P/E known on each day: the latest reading on or before it
        let j = 0, last = null; const out = [];
        for (const r of data.rows) { while (j < rowsPe.length && rowsPe[j].d <= r.d) { last = rowsPe[j].pe; j++; } out.push(last); }
        peFull = out; eps.state = peFull.some((x) => x != null) ? 'ok' : 'err'; if (eps.state === 'err') eps.msg = 'No index P/E readings were found for these dates.';
        draw();
      }).catch((e) => { eps.state = 'err'; eps.msg = e.message || 'Could not load the index P/E.'; draw(); });
      return;
    }
    stockEps(symbol, yahoo).then((e) => {
      eps.tl = epsTimeline({ quarterly: e.quarterly.map((x) => ({ date: x.date, eps: x.eps })), annual: e.annual.map((x) => ({ date: x.date, eps: x.eps })) });
      if (!eps.tl.length) { eps.state = 'err'; eps.msg = 'No earnings history is available for this company, so a P/E line cannot be drawn.'; } else { eps.state = 'ok'; peFull = peSeries(data.rows, eps.tl); }
      draw();
    }).catch((e) => { eps.state = 'err'; eps.msg = e.message || 'Could not load the earnings history.'; draw(); });
  };

  // the trendline options (colour, alert, lock, delete): a row in the chart toolbar, shown when asked for
  const linePopup = (id) => {
    const L = myLines().find((l) => l.id === id); if (!L) return h('span');
    const mine = (S.data.alerts || []).filter((a) => a.rule === 'trendline' && a.lineId === id);
    const hitIds = new Set(W.evalAlerts(S.data).hit.map((x) => x.alert.id));
    const cur = L.color || TL_COLORS[0], ed = canEdit();
    const pop = h('div', { class: 'tm-pop float', role: 'dialog', 'aria-label': 'Trendline options' }, h('span', { class: 'tm-lab' }, 'Selected line'),
      ed ? h('div', { class: 'tm-pop-row' }, TL_COLORS.map((c) => h('button', { type: 'button', class: 'tm-sw' + (cur === c ? ' on' : ''), style: { background: c }, 'aria-label': 'Colour ' + c, onclick: () => mutate((d) => { const x = ((d.trendlines || {})[symKey] || []).find((l) => l.id === id); if (x) x.color = c; }) }))) : null,
      mine.length ? h('div', { class: 'tm-pop-alerts' }, mine.map((a) => h('button', { type: 'button', class: 'tm-al' + (hitIds.has(a.id) ? ' hit' : '') + (a.on === false ? ' off' : ''), onclick: () => (ed ? lineAlertForm({ alert: a, name }) : null) }, `🔔 ${a.tf === 'W' ? 'Week' : a.tf === 'M' ? 'Month' : 'Day'} ${a.dir === 'below' ? '↓' : '↑'}`))) : null,
      ed ? h('div', { class: 'tm-pop-row' },
        h('button', { type: 'button', class: 'chip-btn small', onclick: () => lineAlertForm({ symbol: symKey, name, yahoo, lineId: id }) }, mine.length ? '＋ Another alert' : '🔔 Set alert'),
        h('button', { type: 'button', class: 'chip-btn small', title: L.locked ? 'Let this line be moved again' : 'Stop this line from being moved by accident', onclick: () => mutate((d) => { const x = lineBy(d, id); if (x) { if (x.locked) delete x.locked; else x.locked = true; } }) }, L.locked ? '🔓 Unlock' : '🔒 Lock'),
        h('button', { type: 'button', class: 'chip-btn small', onclick: () => { mutate((d) => { d.trendlines[symKey] = (d.trendlines[symKey] || []).filter((l) => l.id !== id); if (!d.trendlines[symKey].length) delete d.trendlines[symKey]; if (!Object.keys(d.trendlines).length) delete d.trendlines; d.alerts = (d.alerts || []).filter((a) => !(a.rule === 'trendline' && a.lineId === id)); }); mm.sel = null; mm.pop = false; } }, 'Delete')) : null,
      h('button', { type: 'button', class: 'tm-x', 'aria-label': 'Close', onclick: () => { mm.pop = false; draw(); } }, '✕'));
    return pop;
  };
  const draw = () => {
    if (!data) return;
    body.replaceChildren();
    const all = data.rows, mode = st.mode === 'candle' && data.closesOnly ? 'line' : st.mode;
    const months = st.range === 'Mine' ? null : (RANGES.find((r) => r[0] === st.range) || [0, 6])[1];
    let cut;
    if (st.range === 'Mine' && firstBuy) cut = all.filter((r) => r.d >= firstBuy); else cut = months ? sliceRange(all, months) : all;
    if (cut.length < 2) cut = all.slice(-2);
    const spanM = months || Math.max(1, Math.round((Date.parse(cut[cut.length - 1].d) - Date.parse(cut[0].d)) / (30 * 864e5)));
    const agg = ['D', 'W', 'M'].includes(st.iv) ? st.iv : mode === 'candle' ? candleMode(spanM) : spanM <= 6 ? 'D' : spanM <= 72 ? 'W' : 'M';
    const vkey = st.range + '|' + agg;
    if (mm.key !== vkey) { mm.key = vkey; mm.view = null; }
    const rows = agg === 'D' ? cut : aggregateOhlc(cut, agg);
    const align = (m) => (m ? rows.map((r) => (m.has(r.d) ? m.get(r.d) : null)) : null);
    const wantPe = canPe && st.pe && peFull;
    const peM = wantPe ? new Map(all.map((r, i) => [r.d, peFull[i]])) : null;
    // a segmented group: one rounded strip, the chosen option filled
    const seg = (label, opts, cur, pick) => h('div', { class: 'tm-seg', role: 'group', 'aria-label': label }, opts.map(([k, l, tip]) => h('button', { type: 'button', class: k === cur ? 'on' : '', title: tip || null, 'aria-pressed': String(k === cur), onclick: () => pick(k) }, l)));
    const ranges = seg('Time range', [...RANGES.map(([l]) => [l, l]), ...(firstBuy ? [['Mine', 'My buy', 'Since my first buy']] : [])], st.range, (k) => { st.range = k; save(st); draw(); });
    ranges.classList.add('scroll');
    const type = seg('Chart type', [['line', 'Line'], ['pct', '%', 'Percent change'], ['candle', 'Candles']], st.mode, (k) => { st.mode = k; save(st); draw(); });
    const size = seg('Bar size: each candle or point covers', [['auto', 'Auto', 'Chosen from the range'], ['D', 'Day'], ['W', 'Week'], ['M', 'Month']], st.iv, (k) => { st.iv = k; save(st); draw(); });
    const tg = (key, label, col, extra = '') => h('button', { type: 'button', class: 'tm-tg' + (st[key] ? ' on' : ''), 'aria-pressed': String(!!st[key]), title: 'Show or hide the ' + label + ' line', onclick: () => { st[key] = !st[key]; save(st); if (key === 'pe') ensureEps(); draw(); } }, h('i', { style: { background: col } }), label, extra);
    const sel = mm.sel && myLines().some((l) => l.id === mm.sel) ? mm.sel : null;
    const ib = (label, text, fn, extra = '') => h('button', { type: 'button', class: 'tm-ib' + extra, 'aria-label': label, title: label, onclick: fn }, text);
    const zoom = h('div', { class: 'tm-seg', role: 'group', 'aria-label': 'Zoom' }, ib('Zoom out', '−', () => chart && chart.zoom(1.4)), ib('Zoom in', '+', () => chart && chart.zoom(0.7)), ib('Show everything', 'Reset', () => chart && chart.reset()));
    const draws = [h('button', { type: 'button', class: 'tm-tg' + (showCol ? ' on' : ''), 'aria-pressed': String(showCol), title: 'Change line colours', onclick: () => { showCol = !showCol; draw(); } }, h('i', { class: 'cc-dot' }), 'Colours')];
    if (mode !== 'pct' && canEdit()) draws.push(h('button', { type: 'button', class: 'tm-tg tm-draw' + (tool === 'line' ? ' on' : ''), 'aria-pressed': String(tool === 'line'), onclick: () => { setTool(tool === 'line' ? 'none' : 'line'); draw(); } }, h('i', { style: { background: LINE_COLORS.trend } }), tool === 'line' ? 'Tap two points…' : 'Trendline'));
    // the options box for a line opens only when asked: from this button, or by right-click / long press on a line
    if (mode !== 'pct' && myLines().length) {
      draws.push(h('button', { type: 'button', class: 'tm-tg' + (sel && mm.pop ? ' on' : ''), 'aria-pressed': String(!!(sel && mm.pop)), title: 'Colour, alert, lock or delete the selected line', onclick: () => { if (!sel) { toast('Tap a line on the chart first'); return; } mm.pop = !mm.pop; draw(); } }, 'Line options'));
      if (canEdit()) draws.push(h('button', { type: 'button', class: 'tm-tg' + (st.lockAll ? ' on' : ''), 'aria-pressed': String(!!st.lockAll), title: 'Stop every line on this device from being moved or its end points dragged', onclick: () => { st.lockAll = !st.lockAll; save(st); draw(); } }, st.lockAll ? '🔒 Lines locked' : '🔓 Lock lines'));
    }
    if (!sel && myLines().length && canEdit()) draws.push(h('button', { type: 'button', class: 'tm-tg', onclick: () => { if (confirm('Remove all ' + myLines().length + ' trendlines on ' + name + '?')) mutate((d) => { delete d.trendlines[symKey]; if (!Object.keys(d.trendlines).length) delete d.trendlines; }); } }, `Clear lines (${myLines().length})`));
    const swatches = canEdit() && mode !== 'pct' && tool === 'line' ? h('div', { class: 'tm-row tm-colors', role: 'group', 'aria-label': 'Trendline colour' }, h('span', { class: 'tm-lab' }, 'New lines'),
      TL_COLORS.map((c) => { const cur = sel ? ((myLines().find((l) => l.id === sel) || {}).color || TL_COLORS[0]) : (st.tc || TL_COLORS[0]); return h('button', { type: 'button', class: 'tm-sw' + (cur === c ? ' on' : ''), style: { background: c }, 'aria-label': 'Colour ' + c, title: 'Use this colour', onclick: () => { st.tc = c; save(st); if (sel) mutate((d) => { const x = ((d.trendlines || {})[symKey] || []).find((l) => l.id === sel); if (x) x.color = c; }); else draw(); } }); })) : null;
    const phone = Math.min(window.innerWidth, window.innerHeight) < 600, barOpen = !phone || !!st.barOpen;   // on a phone the controls start folded away so they do not cover the chart
    const bar = h('div', { class: 'tm-bar' },
      ranges,
      h('div', { class: 'tm-row tm-type' }, type, h('span', { class: 'tm-lab' }, 'Bars'), size),
      h('div', { class: 'tm-row tm-lines' }, h('span', { class: 'tm-lab' }, 'Lines'), tg('dma50', '50d', LINE_COLORS.dma50), tg('dma200', '200d', LINE_COLORS.dma200), canPe ? tg('pe', index ? 'Index P/E' : 'P/E', LINE_COLORS.pe, eps.state === 'loading' ? ' …' : '') : null),
      h('div', { class: 'tm-row tm-tools' }, zoom, ...draws), swatches);
    body.append(h('div', { class: 'tm-barwrap' },
      phone ? h('button', { type: 'button', class: 'tm-barbtn', 'aria-expanded': String(barOpen), onclick: () => { st.barOpen = !barOpen; save(st); draw(); } },
        h('span', null, barOpen ? 'Hide chart controls' : 'Chart controls'), h('small', null, barOpen ? '' : `${st.range} · ${st.mode === 'candle' ? 'Candles' : st.mode === 'pct' ? '%' : 'Line'}`), h('b', { 'aria-hidden': 'true' }, barOpen ? '▴' : '▾')) : null,
      barOpen ? bar : null));
    if (showCol) body.append(colourPanel([['dma50', '50-day average'], ['dma200', '200-day average'], ...(canPe ? [['pe', index ? 'Index P/E' : 'P/E'], ['median', 'Median P/E']] : []), ['avg', 'Your average cost']], draw));
    if (data.closesOnly) body.append(h('p', { class: 'note' }, 'Candles and volume need the newer Code.gs in your Apps Script (Settings explains how to paste and redeploy it). Showing closing prices until then.'));
    if (canPe && st.pe && eps.state === 'err') body.append(h('p', { class: 'note' }, 'P/E history: ' + eps.msg + ' ', h('button', { type: 'button', class: 'chip-btn small', onclick: () => { if (index && indexPe) retryIndexPe(indexPe); eps = { state: 'idle', msg: '', tl: null }; ensureEps(); } }, 'Try again')));
    chart = marketChart({ rows, mode, dma50: st.dma50 ? align(data.ma50) : null, dma200: st.dma200 ? align(data.ma200) : null, pe: wantPe ? align(peM) : null, peMedian: wantPe ? median(peFull.slice(Math.max(0, all.findIndex((r) => r.d >= cut[0].d))).filter((x) => x != null)) : null, peLabel: index ? 'Index P/E' : 'P/E', newColor: st.tc || null,
      avg: avgCost || null, trades: trades || [], ...fv.size(window.innerWidth < 640 ? 230 : 280, window.innerWidth < 640 ? (barOpen ? 520 : 355) : 0), fmt: pxf, vfmt, dateFmt: short, tickFmt: tick,
      lines: myLines(), tool: canEdit() ? tool : 'none', selected: sel, view: mm.view, onView: (v) => { mm.view = v; }, pending: tool === 'line' ? mm.pend || null : null, onPending: (pt) => { mm.pend = pt; }, lockAll: !!st.lockAll,
      onLine: { select: (id, pos) => { if (id !== mm.sel) mm.pop = false; mm.sel = id; if (pos) mm.pos = pos; draw(); },
        menu: (id, pos) => { mm.sel = id; mm.pop = true; if (pos) mm.pos = pos; draw(); },
        update: !canEdit() ? undefined : (id, L) => {
          mm.sel = id; const was = (() => { const o = myLines().find((l) => l.id === id); return o ? { d1: o.d1, p1: o.p1, d2: o.d2, p2: o.p2 } : null; })();
          try { mutate((d) => { const x = lineBy(d, id); if (x) Object.assign(x, L, { p1: Math.round(L.p1 * 100) / 100, p2: Math.round(L.p2 * 100) / 100 }); }); } catch (e) { toast(e.message); draw(); return; }
          if (was) toast('Line moved', '', { label: 'Undo', onClick: () => { try { mutate((d) => { const x = lineBy(d, id); if (x) Object.assign(x, was); }); } catch (e) { toast(e.message); } } });
        },
        add: (L, pos) => { if (pos) mm.pos = pos; const id = 'tl' + Date.now().toString(36); mm.sel = id; mm.pop = false; setTool('none'); try { mutate((d) => { d.trendlines = d.trendlines || {}; (d.trendlines[symKey] = d.trendlines[symKey] || []).push({ id, ...(st.tc ? { color: st.tc } : {}), ...L, p1: Math.round(L.p1 * 100) / 100, p2: Math.round(L.p2 * 100) / 100 }); }); toast('Trendline saved', '', { label: 'Undo', onClick: () => { try { mutate((d) => { if (!d.trendlines) return; d.trendlines[symKey] = (d.trendlines[symKey] || []).filter((l) => l.id !== id); if (!d.trendlines[symKey].length) delete d.trendlines[symKey]; if (!Object.keys(d.trendlines).length) delete d.trendlines; }); mm.sel = null; mm.pop = false; } catch (e) { toast(e.message); } } }); } catch (e) { toast(e.message); draw(); } } } });
    const wrap = h('div', { class: 'tm-chartwrap' }, chart);
    if (sel && mm.pop && mode !== 'pct') wrap.append(linePopup(sel));   // floats over the chart corner, so opening it never pushes the chart down
    body.append(wrap);
    const perf = performance(all);
    if (perf.length) body.append(h('div', { class: 'tm-perf', 'aria-label': 'Returns over different periods' }, perf.map((p) => h('span', { class: 'tm-pf ' + posNeg(p.pct) }, h('small', null, p.label), `${p.pct >= 0 ? '▲' : '▼'} ${p.pct >= 0 ? '+' : '−'}${Math.abs(p.pct * 100).toFixed(1)}%`))));
    const legend = [];
    if (avgCost && trades) legend.push(h('span', { class: 'mc-chip' }, h('i', { class: 'dash', style: { borderColor: LINE_COLORS.avg } }), 'Your average cost'));
    if (myLines().length && mode !== 'pct') legend.push(h('span', { class: 'mc-chip' }, h('i', { style: { background: LINE_COLORS.trend } }), `${myLines().length} trendline${myLines().length > 1 ? 's' : ''}`));
    if (trades && trades.length) legend.push(h('span', { class: 'mc-chip' }, h('b', { class: 'pos' }, '▲'), ' your buys ', h('b', { class: 'neg' }, '▼'), ' your sells'));
    if (legend.length) body.append(h('div', { class: 'mc-chips tm-legend' }, legend));
    body.append(h('p', { class: 'note' }, `Each ${agg === 'D' ? (mode === 'candle' ? 'candle is a day' : 'point is a day') : agg === 'W' ? (mode === 'candle' ? 'candle is a week' : 'point is a week') : (mode === 'candle' ? 'candle is a month' : 'point is a month')}. Scroll or pinch to zoom, drag to move${canEdit() && mode !== 'pct' ? '; Trendline then two taps draws a line that is saved for this share, and you can drag it or its end points to adjust it' : ''}. The 50 and 200-day averages are the average closing price over the last 50 or 200 trading days${index ? '' : '; P/E is the price divided by the last twelve months of reported earnings per share, as known on that day (a company that made a loss has no P/E)'}. Past prices do not predict the future.`));
  };

  const start = () => {
    stockOhlc(symbol, yahoo).then((res) => {
      const n = normalise(res); if (n.rows.length < 2) throw new Error('No price history found for ' + symbol + '.');
      const closes = n.rows.map((r) => r.c), m50 = sma(closes, 50), m200 = sma(closes, 200);
      data = { rows: n.rows, closesOnly: n.closesOnly, ma50: new Map(n.rows.map((r, i) => [r.d, m50[i]]).filter((x) => x[1] != null)), ma200: new Map(n.rows.map((r, i) => [r.d, m200[i]]).filter((x) => x[1] != null)) };
      header(); draw(); ensureEps();
    }).catch((e) => body.replaceChildren(h('p', { class: 'empty' }, e.message || 'Could not load the price history.')));
  };
  header(); start();
  card = h('section', { class: 'card tm-card' }, h('header', { class: 'card-head' }, h('h2', null, name), h('span', { class: 'muted tm-tick' }, symbol)), headBox, body);
  return card;
}

const tile = (label, value, sub, cls = '') => h('div', { class: 'tm-fig' }, h('span', { class: 'tm-fl' }, label), h('b', { class: cls }, value == null || value === '' ? '–' : value), sub ? h('small', null, sub) : null);
const rangeBar = (lo, hi, px) => (lo != null && hi != null && hi > lo && px != null ? h('span', { class: 'tm-rng' }, h('i', { style: { left: Math.max(0, Math.min(100, ((px - lo) / (hi - lo)) * 100)) + '%' } })) : null);

function figuresCard({ symbol, yahoo, index, price }) {
  const body = h('div', null, h('p', { class: 'note' }, 'Loading the figures…'));
  const wrap = section('Key figures', body);
  const draw = (v) => {
    const { q, d } = v, px = price != null ? price : q && q.price;
    const near = (x) => (x == null ? null : x);
    const grid = [];
    grid.push(tile('Day range', d && d.dayLow != null ? `${dec(d.dayLow, 2)} – ${dec(d.dayHigh, 2)}` : '–'),
      tile('Previous close', q && q.prevClose != null ? dec(q.prevClose, 2) : '–'),
      tile('52-week range', q && q.lo52 != null ? `${dec(q.lo52, 2)} – ${dec(q.hi52, 2)}` : '–', null), 
      tile('From 52-week high', q && q.hi52 && px ? `${((px / q.hi52 - 1) * 100).toFixed(1)}%` : '–', q && q.lo52 && px ? `${((px / q.lo52 - 1) * 100).toFixed(1)}% above the low` : '', q && q.hi52 && px && px < q.hi52 * 0.9 ? 'neg' : ''),
      tile('Volume', q && q.volume != null ? vfmt(q.volume) : '–', d && d.avgVolume != null ? 'avg ' + vfmt(d.avgVolume) : ''));
    if (!index) {
      grid.push(tile('Market cap', crore(q && q.mcap)), tile('P/E (trailing)', q && q.pe != null ? q.pe.toFixed(1) : '–', (q && q.fpe != null ? q.fpe : d && d.fpe) != null ? 'forward ' + (q && q.fpe != null ? q.fpe : d.fpe).toFixed(1) : 'profit-making companies only'),
        tile('Price to book', q && q.pb != null ? q.pb.toFixed(2) : '–'), tile('EPS (12 months)', q && q.eps != null ? rs(q.eps) : '–'), tile('Book value', d && d.bookValue != null ? rs(d.bookValue) : '–'),
        tile('Dividend yield', q && q.dy != null ? q.dy.toFixed(2) + '%' : '–'), tile('Beta', d && d.beta != null ? d.beta.toFixed(2) : '–'),
        tile('Return on equity', pc(d && d.roe), null, d && d.roe < 0 ? 'neg' : ''), tile('Return on assets', pc(d && d.roa)), tile('Profit margin', pc(d && d.margin)), tile('Operating margin', pc(d && d.opMargin)),
        tile('Revenue growth', pc(d && d.revGrowth), null, d && d.revGrowth < 0 ? 'neg' : ''), tile('Earnings growth', pc(d && d.earnGrowth), null, d && d.earnGrowth < 0 ? 'neg' : ''),
        tile('Debt to equity', d && d.de != null ? (d.de / 100).toFixed(2) : '–'), tile('Current ratio', d && d.currentRatio != null ? d.currentRatio.toFixed(2) : '–'),
        tile('Revenue', crore(d && d.revenue)), tile('Free cash flow', crore(d && d.fcf)),
        tile('Analyst target', d && d.target != null ? rs(d.target) : '–', d && d.target && px ? `${((d.target / px - 1) * 100).toFixed(1)}% ${d.target >= px ? 'above' : 'below'} the price${d.analysts ? ' · ' + d.analysts + ' analysts' : ''}${d.recommendation ? ' · ' + d.recommendation : ''}` : '', d && d.target && px ? posNeg(d.target - px) : ''));
      const bits = [d && d.sector, d && d.industry, d && d.employees ? Number(d.employees).toLocaleString('en-IN') + ' employees' : null].filter(Boolean);
      body.replaceChildren(h('div', { class: 'tm-figs' }, grid), h('p', { class: 'note' }, 'From Yahoo Finance. Numbers can lag or be missing for some companies.'));
      if (bits.length || (d && d.summary)) {
        const long = d && d.summary ? d.summary : '';
        const p = h('p', { class: 'tm-about clamp' }, long);
        body.append(h('h4', null, 'About'), bits.length ? h('p', { class: 'note' }, bits.join(' · ')) : null, long ? p : null,
          long.length > 260 ? h('button', { type: 'button', class: 'chip-btn small', onclick: (e) => { p.classList.toggle('clamp'); e.currentTarget.textContent = p.classList.contains('clamp') ? 'Read more' : 'Show less'; } }, 'Read more') : null);
      }
    } else body.replaceChildren(h('div', { class: 'tm-figs' }, grid), h('p', { class: 'note' }, 'An index has no P/E, earnings or company figures here; the chart shows its price level with the 50 and 200-day averages.'));
    // the 52-week position bar is drawn inside its tile
    const t = body.querySelectorAll('.tm-fig')[2]; const bar = q && rangeBar(q.lo52, q.hi52, px); if (t && bar) t.append(bar);
  };
  stockInfo(symbol, yahoo).then(draw).catch((e) => body.replaceChildren(h('p', { class: 'empty' }, e.message || 'Could not load the figures.')));
  return wrap;
}

/**
 * The terminal for one symbol. Returns the elements to add to a page: [chart card, key figures card].
 * held: your holding (or null); trades: [{ d, side, price, qty }]; quote: { price, prev, at } if known; index: true for an index.
 */
export function terminal({ symbol, name, yahoo = '', index = false, indexPe = '', avgCost = null, firstBuy = null, trades = [], quote = null }) {
  return [chartCard({ symbol, name, yahoo, index, indexPe, avgCost, firstBuy, trades, quote }), figuresCard({ symbol, yahoo, index, price: quote ? quote.price : null })];
}
