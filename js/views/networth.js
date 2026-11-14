// Net worth report: the month-end snapshots as one line, today's position, and a different-coloured line projected to December.
// Snapshots come from the Wealth outlook (month-end check-ins). The plan line comes from the Wealth outlook plan of each year (the live revision, else the draft).
import { S } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import { fitAxis } from '../axis.js';
import { h, money, pct, dateStr, monthLabel, section, stat, table, setOptions } from '../ui.js';
import { lineChart, stackedArea, spark, color } from '../charts.js';
import * as I from '../insights.js';
import { btn } from '../ui.js';
import * as PL from '../planner.js';

let range = 'year';
const RANGES = [['3m', 'Past 3 months'], ['6m', 'Past 6 months'], ['12m', 'Past 12 months'], ['year', 'This year'], ['last', 'Last year'], ['2y', 'Past 2 years'], ['all', 'Everything']];
const rerender = () => window.dispatchEvent(new Event('rerender'));
const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b; m = C.addMonths(m + '-01', 1).slice(0, 7)) out.push(m); return out; };

/**
 * The plan month by month: for every year that has a Wealth outlook plan, its starting net worth and each month of its path.
 * A year uses its live revision, or its draft when it has not been made live.
 */
export function plannedByMonth(data, all) {
  const out = new Map(), cfg = P.cfg(data);
  for (const y of Object.keys(cfg.years)) {
    const plan = PL.bestPlan(data, y); if (!plan) continue;
    if (!out.has(plan.baseline.month)) out.set(plan.baseline.month, Math.round(plan.baseline.net));
    for (const r of PL.planPath(plan, cfg.outlooks)) if (!out.has(r.month)) out.set(r.month, Math.round(r.nw));
  }
  return out;
}

const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

/** Rows { month, value, src } from the first snapshot to December: actual, today, then projected. */
export function netWorthRows(data, all) {
  const cur = C.monthKey(all.asOf), year = cur.slice(0, 4);
  const by = new Map();
  for (const s of (data.projector && data.projector.snapshots) || []) if (s.month <= cur) by.set(s.month, { month: s.month, value: s.net, src: 'Snapshot' });
  // the current month is today's live position until its month-end snapshot is saved
  by.set(cur, { month: cur, value: Math.round(all.netAsset), src: 'Today' });
  const actual = [...by.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  // the rest of the year, as This year shows it: the plan's settings carried forward from today's position
  const cfg = P.cfg(data), plan = PL.bestPlan(data, year);
  let projected;
  if (plan) projected = PL.yearTrack(data, all, plan, cfg.outlooks).rows.filter((r) => r.src === 'projected' && r.month > cur).map((r) => ({ month: r.month, value: Math.round(r.nw), src: 'Projected' }));
  else { const live = P.baseline(data, all); projected = (live.month === cur ? P.simulate({ values: live.values, liab: live.liab, month: live.month }, PL.fallbackA(data, all), cfg.outlooks, P.monthsTo(live.month, Number(year))) : []).filter((r) => r.month > cur && r.month <= year + '-12').map((r) => ({ month: r.month, value: Math.round(r.nw), src: 'Projected' })); }
  return { actual, projected, plan, hasPlan: !!plan };
}

export function render() {
  const { data, all } = S;
  const cur = C.monthKey(all.asOf), year = cur.slice(0, 4);
  const { actual, projected, plan, hasPlan } = netWorthRows(data, all);
  const planned = plannedByMonth(data, all);
  const root = h('div', { class: 'page' });
  if (actual.length < 2) {
    root.append(h('div', { class: 'card' }, h('p', null, 'The graph needs at least two month-end snapshots.'), h('p', { class: 'note' }, 'Save one on the last day of each month under Wealth outlook → This year → Month-end check-in. Month-ends you typed into the Plan sheet can be brought in from the Month by month table there.')));
    return root;
  }
  // the window
  const first = actual[0].month, back = (n) => C.addMonths(cur + '-01', -n).slice(0, 7);
  let from = { '3m': back(3), '6m': back(6), '12m': back(12), year: year + '-01', last: (Number(year) - 1) + '-01', '2y': back(24), all: first }[range] || year + '-01';
  const to = range === 'last' ? (Number(year) - 1) + '-12' : year + '-12';
  if (from < first && range !== 'all') from = range === 'last' || range === 'year' ? from : first;
  const inWin = (r) => r.month >= from && r.month <= to;
  const act = actual.filter(inWin), prj = range === 'last' ? [] : projected.filter(inWin);
  const sel = h('select', { class: 'month-select', 'aria-label': 'Period', onchange: (e) => { range = e.target.value; rerender(); } });
  setOptions(sel, RANGES.map(([v, l]) => ({ value: v, label: l })), range);
  root.append(h('div', { class: 'filters' }, sel));
  if (!act.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No month-end snapshots in this period.'), h('p', { class: 'note' }, 'Pick a longer period, or “Everything”.'))); return root; }

  const firstA = act[0], last = act[act.length - 1], end = prj.length ? prj[prj.length - 1] : null;
  const months = monthsBetween(from < first ? first : from, to);
  const lbl = (mo, i) => monthLabel(mo).slice(0, 3) + (mo.slice(5) === '01' || i === 0 ? " '" + mo.slice(2, 4) : '');
  const labels = months.map(lbl);
  const aVals = months.map((mo) => { const r = act.find((x) => x.month === mo); return r ? r.value : null; });
  const pVals = months.map((mo) => { if (!prj.length) return null; if (mo === last.month) return last.value; const r = prj.find((x) => x.month === mo); return r ? r.value : null; });
  const planVals = months.map((mo) => (planned.has(mo) ? planned.get(mo) : null));
  const havePlan = planVals.some((v) => v != null);
  const all3 = aVals.concat(pVals, planVals).filter((v) => v != null);
  const lo = Math.min(...all3);
  const vsPlan = planned.has(last.month) ? last.value - planned.get(last.month) : null;
  root.append(h('div', { class: 'stats' },
    stat('Net worth now', money(all.netAsset), `as on ${dateStr(all.asOf)}`),
    stat('Change since ' + monthLabel(firstA.month, true), h('span', { class: tone(last.value - firstA.value) }, signed(last.value - firstA.value)), firstA.value ? pct((last.value - firstA.value) / firstA.value, 1) : ''),
    vsPlan != null ? stat('Against the plan', h('span', { class: tone(vsPlan) }, signed(vsPlan)), `${vsPlan >= 0 ? 'ahead of' : 'behind'} the plan for ${monthLabel(last.month, true)}`) : null,
    end ? stat(`Projected, ${monthLabel(end.month, true)}`, money(end.value), planned.has(end.month) ? h('span', { class: tone(end.value - planned.get(end.month)) }, `${signed(end.value - planned.get(end.month))} against the plan`) : h('span', { class: tone(end.value - last.value) }, `${signed(end.value - last.value)} from today`)) : null));

  const series = [{ name: 'Actual (month-end snapshots)', values: aVals, color: 0 }];
  if (havePlan) series.push({ name: 'Planned at the start', values: planVals, color: 2, dash: '2 4' });
  if (prj.length) series.push({ name: 'Projected from today', values: pVals, dashed: true, color: 3 });
  root.append(section('Net worth, month by month', h('div', null,
    lineChart({ labels, fmt: money, ...(() => { const ax = fitAxis(series.flatMap((x) => x.values)); return { yMin: ax.yMin, yMax: ax.yMax, ticks: ax.ticks }; })(), height: 260, series }),
    h('p', { class: 'note' }, `The solid line is each month-end snapshot, ending at today. ${havePlan ? 'The dotted line is the plan as it was made at the start (your Wealth outlook plan for the year), so the gap between the two is how far you have moved from it. ' : ''}${prj.length ? `The dashed line carries today’s position to December using ${hasPlan ? 'your ' + year + ' plan' : 'the standard assumptions (no ' + year + ' plan yet)'} and the market outlook set under Wealth outlook.` : ''}`))));

  root.append(mixChart(data, all, months, lbl));

  const rows = act.concat(prj).map((r, i, a) => ({ ...r, change: i ? r.value - a[i - 1].value : null, plan: planned.has(r.month) ? planned.get(r.month) : null, current: r.month === cur }));
  root.append(section('The numbers', h('div', null, table([
    { label: 'Month', host: true, render: (r) => h('span', null, monthLabel(r.month, true), r.current ? h('small', { class: 'now-tag' }, ' now') : null) },
    { label: 'Net worth', cls: 'r', get: (r) => money(r.value) },
    havePlan ? { label: 'Planned', mob: 'under', mlabel: 'plan ', cls: 'r', get: (r) => (r.plan != null ? money(r.plan) : '–') } : null,
    havePlan ? { label: 'Against plan', mob: 'under', mlabel: 'vs plan ', cls: 'r', render: (r) => (r.plan == null ? h('span', { class: 'muted' }, '–') : h('span', { class: tone(r.value - r.plan) }, signed(r.value - r.plan))) } : null,
    { label: 'Change', mob: 'under', mlabel: 'change ', cls: 'r', render: (r) => (r.change == null ? h('span', { class: 'muted' }, '–') : h('span', { class: tone(r.change) }, signed(r.change))) },
    { label: 'Source', mob: 'under', render: (r) => h('span', { class: r.src === 'Projected' ? 'muted' : '' }, r.src) },
  ].filter(Boolean), rows, { rowClass: (r) => (r.current ? 'cur-row' : r.src === 'Projected' ? 'proj-row' : ''), m: { key: 'networth', head: 'Month', sub: ['Source'],
    views: havePlan ? [['Net worth', 'Change'], ['Planned', 'Against plan']] : [['Net worth', 'Change']],
    sort: [{ value: 'month', label: 'Month', kind: 'date', get: (r) => r.month }, { value: 'value', label: 'Net worth', kind: 'num', get: (r) => r.value }, { value: 'change', label: 'Change from the month before', kind: 'num', get: (r) => r.change }], sortDefault: { value: 'month', dir: 'asc' } } }),
  h('p', { class: 'note' }, '“Snapshot” months are the month-end snapshots saved on the Wealth outlook; “Today” is the live position. Change is against the month before. “Against plan” is net worth minus the planned net worth for that month.'))));
  return root;
}

// Broad categories over time. Month-end snapshots that saved their asset classes, plus today's live position.
const ALLOC_OF = Object.fromEntries(I.ALLOC.flatMap((a) => a.from.map((c) => [c, a.key])));
let mixDrill = null, mixMode = 'amt';
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const sgp = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pct(Math.abs(n), 1);
const MIX_RANGES = [['3m', '3M'], ['6m', '6M'], ['12m', '12M'], ['year', 'YTD'], ['all', 'All']];
function mixChart(data, all, months, lbl) {
  const cur = C.monthKey(all.asOf);
  const by = new Map();
  // Saved month-end snapshots with their asset classes, plus today's live position for the current month (a snapshot saved for the current month is replaced by it).
  // Two points are enough to draw: a saved month and today. (Before, saved months had to be before the current month, so Oct + Nov saved on 1 Nov counted as one.)
  for (const s of (data.projector && data.projector.snapshots) || []) if (s.classes && s.month < cur) by.set(s.month, s.classes);
  const live = P.baseline(data, all);
  by.set(cur, live.values);
  const ms = months.filter((m) => by.has(m));
  const box = h('div');
  const draw = () => {
    const keys = mixDrill ? I.ALLOC.filter((a) => I.GROUP_OF[a.key] === mixDrill) : I.GOAL_GROUPS;
    const val = (classes, k) => Object.entries(classes).reduce((a, [c, v]) => a + ((mixDrill ? ALLOC_OF[c] === k : I.GROUP_OF[ALLOC_OF[c]] === k) ? Math.max(0, Number(v) || 0) : 0), 0);
    const series = keys.map((k, i) => ({ id: mixDrill ? k.key : k.id, name: k.label, color: i, values: ms.map((m) => val(by.get(m), mixDrill ? k.key : k.id)) }));
    const title = mixDrill ? (I.GOAL_GROUPS.find((g) => g.id === mixDrill) || {}).label : 'All groups';
    const seg = (arr, cur, on, label) => h('div', { class: 'nwp-seg', role: 'group', 'aria-label': label }, arr.map(([k, l]) => h('button', { type: 'button', class: cur === k ? 'on' : '', 'aria-pressed': String(cur === k), onclick: () => on(k) }, l)));
    const ctl = h('div', { class: 'nwp-ctl' },
      seg(MIX_RANGES, range, (k) => { range = k; rerender(); }, 'Period'),
      seg([['amt', 'Value (₹)'], ['share', 'Share %']], mixMode, (k) => { mixMode = k; draw(); }, 'Measure'));
    const tot = ms.map((_, i) => series.reduce((a, x) => a + x.values[i], 0));
    const shown = mixMode === 'share' ? series.map((x) => ({ ...x, values: x.values.map((v, i) => (tot[i] ? (v / tot[i]) * 100 : 0)) })) : series;
    const fmt = mixMode === 'share' ? (v) => v.toFixed(1) + '%' : money;
    const pick = mixDrill ? null : (sr) => { mixDrill = sr.id; draw(); };
    const info = (x) => { const at = x.values.findIndex((v) => v > 0); if (at < 0) return null; const a0 = x.values[at], a1 = x.values[x.values.length - 1]; return { now: a1, change: a1 - a0, ret: a0 ? (a1 - a0) / a0 : null }; };
    const rows = h('div', { class: 'nwp-rows' }, series.map((x) => { const i = info(x); if (!i) return null; const t = i.change > 0 ? 'pos' : i.change < 0 ? 'neg' : '', last = tot[tot.length - 1];
      return h(pick ? 'button' : 'div', pick ? { type: 'button', class: 'nwp-row', onclick: () => pick(x) } : { class: 'nwp-row' },
        h('span', { class: 'nwp-dot', style: { background: color(x.color) } }),
        h('span', { class: 'nwp-nm' }, h('b', null, x.name), h('small', null, money(i.now) + (last ? ' · ' + pct(i.now / last, 1) : ''))),
        h('span', { class: 'nwp-sp' }, spark(x.values, { height: 34, width: 110, tone: x.color })),
        h('span', { class: 'nwp-ch ' + t }, h('b', null, i.ret != null ? sgp(i.ret) : '–'), h('small', null, sgn(i.change)))); }).filter(Boolean));
    const infos = series.map((x) => ({ x, i: info(x) })).filter((q) => q.i).sort((a, b) => Math.abs(b.i.change) - Math.abs(a.i.change));
    const insight = infos.length ? h('p', { class: 'nwp-insight' }, h('b', null, 'Key insight'), ` ${infos[0].x.name} moved the most since ${monthLabel(ms[0], true)} (${sgn(infos[0].i.change)}${infos[0].i.ret != null ? ', ' + sgp(infos[0].i.ret) : ''}).`) : null;
    box.replaceChildren(...[
      mixDrill && ms.length >= 2 ? h('div', { style: { marginBottom: '6px' } }, btn('← All groups', () => { mixDrill = null; draw(); }, 'small'), h('b', { style: { marginLeft: '8px' } }, title)) : null,
      ms.length < 2 ? h('p', { class: 'note', style: { margin: 0 } }, 'Not enough history to draw this yet. It needs at least one saved month-end check-in before this month, besides today (Wealth outlook → Month-end check-in). Each one keeps how much sat in debts, equity, gold and others, and the chart then shows how that mix moved.')
        : h('div', { class: 'nwp' }, ctl, stackedArea({ labels: ms.map((m) => lbl(m, months.indexOf(m))), series: shown, fmt, height: 240, onSelect: pick, yMax: mixMode === 'share' ? 100 : null }), rows, insight,
          h('p', { class: 'note' }, mixDrill ? 'Each row is one part of ' + title + '. Change is since the first month shown.' : 'Tap a colour or a row to see what is inside it. Change is since the first month shown, so it also moves when you put new money in.'))].filter(Boolean));
  };
  draw();
  return section('What you own, month by month', box);
}
