// Net worth report: the month-end snapshots as one line, today's position, and a different-coloured line projected to December.
// Snapshots come from the Wealth outlook (month-end check-ins). Months that only exist in the Plan sheet are included too.
import { S } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import { h, money, pct, dateStr, monthLabel, section, stat, table, setOptions } from '../ui.js';
import { lineChart, stackedArea } from '../charts.js';
import * as I from '../insights.js';
import { btn } from '../ui.js';
import { model } from './proj-year.js';

let range = 'year';
const RANGES = [['3m', 'Past 3 months'], ['6m', 'Past 6 months'], ['12m', 'Past 12 months'], ['year', 'This year'], ['last', 'Last year'], ['2y', 'Past 2 years'], ['all', 'Everything']];
const rerender = () => window.dispatchEvent(new Event('rerender'));
const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b; m = C.addMonths(m + '-01', 1).slice(0, 7)) out.push(m); return out; };

/**
 * The plan as it was set at the start, month by month: the Plan sheet's own path (start position plus the planned saving
 * each month, never re-based on what really happened), then any Wealth outlook year plan for months the sheet does not cover.
 */
export function plannedByMonth(data, all) {
  const out = new Map();
  try {
    for (const t of C.targets(data, C.projection(data, all))) if (t.estAsset != null) out.set(t.date.slice(0, 7), Math.round(t.estAsset - t.plannedLiab));
  } catch (e) { /* no Plan sheet in this file */ }
  const cfg = P.cfg(data);
  for (const plan of Object.values(cfg.years).map((x) => P.effectivePlan(data, x))) {
    if (!out.has(plan.baseline.month)) out.set(plan.baseline.month, Math.round(plan.baseline.net));
    for (const r of P.planPath(plan, P.cfg(data).outlooks)) if (!out.has(r.month)) out.set(r.month, Math.round(r.nw));
  }
  return out;
}

const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

/** Rows { month, value, src } from the first snapshot to December: actual, today, then projected. */
export function netWorthRows(data, all) {
  const cur = C.monthKey(all.asOf), year = cur.slice(0, 4);
  const by = new Map();
  for (const s of P.planSheetSnapshots(data, all.asOf)) by.set(s.month, { month: s.month, value: s.net, src: 'Plan sheet' });
  for (const s of (data.projector && data.projector.snapshots) || []) if (s.month <= cur) by.set(s.month, { month: s.month, value: s.net, src: 'Snapshot' });
  // the current month is today's live position until its month-end snapshot is saved
  by.set(cur, { month: cur, value: Math.round(all.netAsset), src: 'Today' });
  const actual = [...by.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  // projection to December from today's position, using this year's plan (or what a fresh plan would assume)
  const cfg = P.cfg(data);
  const plan = P.effectivePlan(data, cfg.years[year] || P.newYearPlan(data, all, Number(year)));
  const m = model(plan);
  const live = P.baseline(data, all);
  const fc = (live.month === cur ? P.simulate({ values: live.values, liab: live.liab, month: live.month }, plan.a, m.oc, P.monthsTo(live.month, Number(year))) : []).filter((r) => r.month > cur && r.month <= year + '-12');
  const projected = fc.map((r) => ({ month: r.month, value: Math.round(r.nw), src: 'Projected' }));
  return { actual, projected, plan, hasPlan: !!cfg.years[year] };
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
    lineChart({ labels, fmt: money, yMin: Math.floor((lo * 0.97) / 1e5) * 1e5, height: 260, series }),
    h('p', { class: 'note' }, `The solid line is each month-end snapshot, ending at today. ${havePlan ? 'The dotted line is the plan as it was made at the start (the Plan sheet, or the year plan in the Wealth outlook), so the gap between the two is how far you have moved from it. ' : ''}${prj.length ? `The dashed line carries today’s position to December using ${hasPlan ? 'your ' + year + ' plan' : 'the standard assumptions (no ' + year + ' plan saved yet)'} and the market outlook set under Wealth outlook.` : ''}`))));

  root.append(mixChart(data, all, months, lbl));

  const rows = act.concat(prj).map((r, i, a) => ({ ...r, change: i ? r.value - a[i - 1].value : null, plan: planned.has(r.month) ? planned.get(r.month) : null, current: r.month === cur }));
  root.append(section('The numbers', h('div', null, table([
    { label: 'Month', host: true, render: (r) => h('span', null, monthLabel(r.month, true), r.current ? h('small', { class: 'now-tag' }, ' now') : null) },
    { label: 'Net worth', cls: 'r', get: (r) => money(r.value) },
    havePlan ? { label: 'Planned', mob: 'under', mlabel: 'plan ', cls: 'r', get: (r) => (r.plan != null ? money(r.plan) : '–') } : null,
    havePlan ? { label: 'Against plan', mob: 'under', mlabel: 'vs plan ', cls: 'r', render: (r) => (r.plan == null ? h('span', { class: 'muted' }, '–') : h('span', { class: tone(r.value - r.plan) }, signed(r.value - r.plan))) } : null,
    { label: 'Change', mob: 'under', mlabel: 'change ', cls: 'r', render: (r) => (r.change == null ? h('span', { class: 'muted' }, '–') : h('span', { class: tone(r.change) }, signed(r.change))) },
    { label: 'Source', mob: 'under', render: (r) => h('span', { class: r.src === 'Projected' ? 'muted' : '' }, r.src) },
  ].filter(Boolean), rows, { rowClass: (r) => (r.current ? 'cur-row' : r.src === 'Projected' ? 'proj-row' : '') }),
  h('p', { class: 'note' }, '“Plan sheet” months were typed in the Plan sheet before snapshots began; “Snapshot” months are saved on the Wealth outlook. Change is against the month before. “Against plan” is net worth minus the planned net worth for that month.'))));
  return root;
}

// Broad categories over time. Month-end snapshots that saved their asset classes, plus today's live position.
const ALLOC_OF = Object.fromEntries(I.ALLOC.flatMap((a) => a.from.map((c) => [c, a.key])));
let mixDrill = null;
function mixChart(data, all, months, lbl) {
  const cur = C.monthKey(all.asOf);
  const by = new Map();
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
    box.replaceChildren(...[
      mixDrill && ms.filter((m) => m < cur).length >= 2 ? h('div', { style: { marginBottom: '6px' } }, btn('← All groups', () => { mixDrill = null; draw(); }, 'small'), h('b', { style: { marginLeft: '8px' } }, title)) : ms.filter((m) => m < cur).length >= 2 ? h('p', { class: 'note', style: { marginTop: 0 } }, 'Tap a colour to see what is inside it.') : null,
      ms.filter((m) => m < cur).length < 2 ? h('p', { class: 'note', style: { margin: 0 } }, 'Not enough history to draw this yet. It needs at least two saved month-end check-ins (Wealth outlook → Month-end check-in). Each one keeps how much sat in debts, equity, gold and others, and the chart then shows how that mix moved.')
        : stackedArea({ labels: ms.map((m) => lbl(m, months.indexOf(m))), series, fmt: money, height: 240, onSelect: mixDrill ? null : (sr) => { mixDrill = sr.id; draw(); } })].filter(Boolean));
  };
  draw();
  return section('What you own, month by month', box);
}
