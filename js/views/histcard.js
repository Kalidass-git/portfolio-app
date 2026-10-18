// A price-history chart for one share or fund, with range and view filters.
import { h, money, dec, pct, dateStr, section, posNeg } from '../ui.js';
import { lineChart } from '../charts.js';
import { RANGES, sliceRange, sample, summarise } from '../history.js';

const KEY = 'fw.histRange';
const getRange = () => { try { return localStorage.getItem(KEY) || '1Y'; } catch { return '1Y'; } };
const setRange = (r) => { try { localStorage.setItem(KEY, r); } catch { /* private window */ } };
const short = (d) => { const [y, m] = d.split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1] + " '" + y.slice(2); };

/** load: async () => [{d, v}] oldest first. avg: your average cost per unit (drawn as a line). first: date of your first buy. */
export function historyCard({ title = 'Price history', load, avg = null, firstBuy = null, unit = 'price' }) {
  const body = h('div', null, h('p', { class: 'note' }, 'Loading the price history…'));
  let rows = null, range = getRange(), view = 'price';
  const draw = () => {
    body.replaceChildren();
    const chips = h('div', { class: 'row-actions', role: 'group', 'aria-label': 'Time range' }, RANGES.map(([l]) => h('button', { type: 'button', class: 'chip-btn' + (range === l ? ' on' : ''), onclick: () => { range = l; setRange(l); draw(); } }, l)),
      firstBuy ? h('button', { type: 'button', class: 'chip-btn' + (range === 'Mine' ? ' on' : ''), onclick: () => { range = 'Mine'; draw(); } }, 'Since my first buy') : null);
    const views = h('div', { class: 'row-actions', role: 'group', 'aria-label': 'View' }, [['price', 'Price'], ['pct', 'Change %']].map(([k, l]) => h('button', { type: 'button', class: 'chip-btn' + (view === k ? ' on' : ''), onclick: () => { view = k; draw(); } }, l)));
    let sel;
    if (range === 'Mine') sel = rows.filter((x) => x.d >= firstBuy); else sel = sliceRange(rows, (RANGES.find((r) => r[0] === range) || [0, 12])[1]);
    if (sel.length < 2) { body.append(chips, h('p', { class: 'empty' }, 'Not enough history for this range.')); return; }
    const sm = summarise(sel), pts = sample(sel, 110), base = sel[0].v;
    const vals = pts.map((x) => (view === 'pct' ? x.v / base - 1 : x.v));
    const series = [{ name: view === 'pct' ? 'Change' : 'Price', values: vals, color: 0 }];
    if (avg && view === 'price') series.push({ name: 'Your average cost', values: pts.map(() => avg), color: 3 });
    const all = series.flatMap((s) => s.values);
    const lo = Math.min(...all), hi = Math.max(...all), padv = (hi - lo) * 0.08 || 1;
    body.append(chips, views,
      lineChart({ labels: pts.map((x) => short(x.d)), series, fmt: view === 'pct' ? (v) => pct(v, 0) : (v) => (v >= 1000 ? Math.round(v).toLocaleString('en-IN') : dec(v, v < 10 ? 2 : 0)), height: 230, yMin: view === 'pct' ? Math.min(0, lo - padv) : Math.max(0, lo - padv) }),
      h('div', { class: 'trio' },
        h('div', null, h('span', { class: 'mini-title' }, `${dateStr(sm.from.d)} → ${dateStr(sm.to.d)}`), h('b', { class: posNeg(sm.change) }, (sm.change >= 0 ? '+' : '') + pct(sm.change, 1))),
        h('div', null, h('span', { class: 'mini-title' }, 'High · low'), h('b', null, `${dec(sm.high, 2)} · ${dec(sm.low, 2)}`)),
        h('div', null, h('span', { class: 'mini-title' }, sm.yearly != null ? 'Yearly rate' : 'From the high'), h('b', { class: posNeg(sm.yearly != null ? sm.yearly : sm.fromHigh) }, pct(sm.yearly != null ? sm.yearly : sm.fromHigh, 1)))),
      h('p', { class: 'note' }, `Latest ${unit} ${dec(sm.to.v, 2)} on ${dateStr(sm.to.d)}.${avg ? ` The dashed line is what you paid on average (${dec(avg, 2)}).` : ''} Past prices do not predict the future.`));
  };
  Promise.resolve().then(load).then((r) => { rows = r; if (!rows || rows.length < 2) throw new Error('No price history found.'); draw(); })
    .catch((e) => { body.replaceChildren(h('p', { class: 'empty' }, e.message || 'Could not load the history.')); });
  return section(title, body);
}
