// A mutual fund's NAV chart with rolling returns: the NAV line on top, and under it the yearly return of every 1, 3 or 5-year holding period ending on each day.
// The same chart engine as the share terminal (zoom, drag, crosshair). Rolling returns answer "what return would I have got if I had held for N years, starting any day?".
import { h, dec, pct, dateStr, section, posNeg } from '../ui.js';
import { marketChart } from '../mchart.js';
import { fullView } from '../fullview.js';
import { colourPanel } from '../chartcolors.js';
import { aggregateOhlc, sliceRange, RANGES } from '../history.js';
import { rollingReturns, rollStats, performance } from '../ta.js';

const KEY = 'fw.fundchart';
const defaults = { range: '5Y', mode: 'line', roll: '3Y' };
const load = () => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d) => { const [y, m, dd] = d.split('-'); return `${+dd} ${MON[+m - 1]} '${y.slice(2)}`; };
const tick = (d) => { const [y, m] = d.split('-'); return MON[+m - 1] + " '" + y.slice(2); };
const nav = (v) => dec(v, v < 100 ? 2 : 1);
const rp = (v, d = 0) => (v >= 0 ? '' : '−') + Math.abs(v * 100).toFixed(d) + '%';
const median = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

/** loadNavs: async () => [{ d, v }] oldest first. avg: what you paid per unit on average. */
export function fundChart({ title = 'NAV history', loadNavs, avg = null, firstBuy = null }) {
  const st = load(), body = h('div', null, h('p', { class: 'note' }, 'Loading the NAV history…'));
  let all = null, chart = null, view = null, card = null, showCol = false;
  const fv = fullView(() => card, () => { if (all) draw(); }, 'F:' + title);
  const seg = (label, opts, cur, pick) => h('div', { class: 'tm-seg', role: 'group', 'aria-label': label }, opts.map(([k, l, tip]) => h('button', { type: 'button', class: k === cur ? 'on' : '', title: tip || null, 'aria-pressed': String(k === cur), onclick: () => pick(k) }, l)));
  const draw = () => {
    body.replaceChildren();
    const months = st.range === 'Mine' ? null : (RANGES.find((r) => r[0] === st.range) || [0, 60])[1];
    let cut = st.range === 'Mine' && firstBuy ? all.filter((r) => r.d >= firstBuy) : months ? sliceRange(all, months) : all;
    if (cut.length < 2) cut = all.slice(-2);
    const spanM = months || Math.max(1, Math.round((Date.parse(cut[cut.length - 1].d) - Date.parse(cut[0].d)) / (30 * 864e5)));
    const agg = spanM <= 6 ? 'D' : spanM <= 72 ? 'W' : 'M';
    const rows = agg === 'D' ? cut : aggregateOhlc(cut, agg);
    const years = st.roll === 'off' ? 0 : Number(st.roll.replace('Y', ''));
    const rolled = years ? rollingReturns(all, years) : null;
    const byDate = rolled ? new Map(all.map((r, i) => [r.d, rolled[i]])) : null;
    const rollRows = rolled ? rows.map((r) => (byDate.has(r.d) ? byDate.get(r.d) : null)) : null;
    const shown = rollRows ? rollRows.filter((x) => x != null) : [];
    const stats = shown.length ? rollStats(shown) : null;
    const ranges = seg('Time range', [...RANGES.map(([l]) => [l, l]), ...(firstBuy ? [['Mine', 'My buy', 'Since my first buy']] : [])], st.range, (k) => { st.range = k; view = null; save(st); draw(); });
    ranges.classList.add('scroll');
    body.append(h('div', { class: 'tm-bar' }, ranges,
      h('div', { class: 'tm-row tm-type' }, seg('Chart type', [['line', 'NAV'], ['pct', '% change']], st.mode, (k) => { st.mode = k; save(st); draw(); }),
        h('span', { class: 'tm-lab' }, 'Rolling'), seg('Rolling return window', [['off', 'Off'], ['1Y', '1Y'], ['3Y', '3Y'], ['5Y', '5Y']], st.roll, (k) => { st.roll = k; save(st); draw(); })),
      h('div', { class: 'tm-row tm-tools' }, h('div', { class: 'tm-seg', role: 'group', 'aria-label': 'Zoom' },
        ...[['Zoom out', '−', () => chart && chart.zoom(1.4)], ['Zoom in', '+', () => chart && chart.zoom(0.7)], ['Show everything', 'Reset', () => chart && chart.reset()]].map(([a, t, fn]) => h('button', { type: 'button', 'aria-label': a, title: a, onclick: fn }, t))),
        h('button', { type: 'button', class: 'tm-tg' + (showCol ? ' on' : ''), 'aria-pressed': String(showCol), title: 'Change line colours', onclick: () => { showCol = !showCol; draw(); } }, h('i', { class: 'cc-dot' }), 'Colours')))); 
    if (showCol) body.append(colourPanel([['pe', 'Rolling return'], ['median', 'Median'], ['avg', 'Your average NAV']], draw));
    if (years && !shown.length) body.append(h('p', { class: 'note' }, `This fund does not have ${years} years of history in this range yet, so there are no ${years}-year rolling returns to show.`));
    chart = marketChart({ rows: rows.map((r) => ({ d: r.d, o: r.c, h: r.c, l: r.c, c: r.c, v: 0 })), mode: st.mode, dma50: null, dma200: null, pe: shown.length ? rollRows : null, peMedian: stats ? stats.median : null,
      peLabel: `${years}Y rolling`, peFmt: (v, d) => rp(v, d || 0), peSigned: true, avg: avg || null, trades: [], ...fv.size(window.innerWidth < 640 ? 230 : 280), fmt: nav, dateFmt: short, tickFmt: tick, view, onView: (v) => { view = v; } });
    body.append(chart);
    const perf = performance(all.map((r) => ({ d: r.d, c: r.c })));
    if (perf.length) body.append(h('div', { class: 'tm-perf', 'aria-label': 'Returns over different periods' }, perf.map((p) => h('span', { class: 'tm-pf ' + posNeg(p.pct) }, h('small', null, p.label), `${p.pct >= 0 ? '▲' : '▼'} ${p.pct >= 0 ? '+' : '−'}${Math.abs(p.pct * 100).toFixed(1)}%`))));
    if (stats) {
      const t = (l, v, sub, cls = '') => h('div', { class: 'tm-fig' }, h('span', { class: 'tm-fl' }, l), h('b', { class: cls }, v), sub ? h('small', null, sub) : null);
      body.append(h('h4', null, `${years}-year rolling return, yearly rate`), h('div', { class: 'tm-figs' },
        t('Latest', rp(stats.latest, 1), 'ending today', posNeg(stats.latest)), t('Median', rp(stats.median, 1), 'the typical holder'), t('Average', rp(stats.avg, 1)),
        t('Best', rp(stats.best, 1), 'luckiest start day', 'pos'), t('Worst', rp(stats.worst, 1), 'unluckiest start day', stats.worst < 0 ? 'neg' : ''),
        t('Positive', Math.round(stats.positive * 100) + '%', `of ${stats.n.toLocaleString('en-IN')} start days`)),
      h('p', { class: 'note' }, `Each point is the yearly return you would have earned by holding for ${years} year${years > 1 ? 's' : ''} up to that day. The dashed line is the median in this range. A steady, high median with a small gap between best and worst means the fund has been consistent.`));
    }
    body.append(h('p', { class: 'note' }, `Latest NAV ${dec(all[all.length - 1].c, 4)} on ${dateStr(all[all.length - 1].d)}.${avg ? ` The dashed grey line is what you paid on average (${dec(avg, 2)}).` : ''} Scroll or pinch to zoom, drag to move. Past returns do not predict the future.`));
  };
  Promise.resolve().then(loadNavs).then((r) => { if (!r || r.length < 2) throw new Error('No NAV history found.'); all = r.map((x) => ({ d: x.d, c: x.v })); draw(); })
    .catch((e) => body.replaceChildren(h('p', { class: 'empty' }, e.message || 'Could not load the NAV history.')));
  card = section(title, body, fv.button);
  card.classList.add('tm-card');
  return card;
}
