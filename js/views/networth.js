// Net worth report: the month-end snapshots as one line, today's position, and a different-coloured line projected to December.
// Snapshots come from the Wealth projector (month-end check-ins). Months that only exist in the Plan sheet are included too.
import { S } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import { h, money, pct, dateStr, monthLabel, section, stat, table } from '../ui.js';
import { lineChart } from '../charts.js';
import { model } from './proj-year.js';

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
  const plan = cfg.years[year] || P.newYearPlan(data, all, Number(year));
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
  const root = h('div', { class: 'page' });
  if (actual.length < 2) {
    root.append(h('div', { class: 'card' }, h('p', null, 'The graph needs at least two month-end snapshots.'), h('p', { class: 'note' }, 'Save one on the last day of each month under Wealth projector → This year → Month-end check-in. Month-ends you typed into the Plan sheet can be brought in from the Month by month table there.')));
    return root;
  }
  const first = actual[0], last = actual[actual.length - 1], end = projected.length ? projected[projected.length - 1] : null;
  const months = [...actual.map((r) => r.month), ...projected.map((r) => r.month)];
  const labels = months.map((mo) => monthLabel(mo).slice(0, 3) + (mo.slice(5) === '01' || mo === months[0] ? " '" + mo.slice(2, 4) : ''));
  const act = months.map((mo) => { const r = actual.find((x) => x.month === mo); return r ? r.value : null; });
  const prj = months.map((mo) => { if (mo === last.month) return last.value; const r = projected.find((x) => x.month === mo); return r ? r.value : null; });
  const lo = Math.min(...act.concat(prj).filter((v) => v != null));
  root.append(h('div', { class: 'stats' },
    stat('Net worth now', money(all.netAsset), `as on ${dateStr(all.asOf)}`),
    stat('Change since ' + monthLabel(first.month, true), h('span', { class: tone(last.value - first.value) }, signed(last.value - first.value)), first.value ? pct((last.value - first.value) / first.value, 1) : ''),
    end ? stat(`Projected, ${monthLabel(end.month, true)}`, money(end.value), h('span', { class: tone(end.value - last.value) }, `${signed(end.value - last.value)} from today`)) : stat('Projected', '–', `nothing left in ${year}`),
    hasPlan ? stat(`Target, Dec ${year}`, money(plan.target), end ? (end.value >= plan.target ? 'projection reaches it' : `${money(plan.target - end.value)} short`) : '') : null));

  root.append(section('Net worth, month by month', h('div', null,
    lineChart({ labels, fmt: money, yMin: Math.floor((lo * 0.97) / 1e5) * 1e5, height: 260, series: [{ name: 'Actual (month-end snapshots)', values: act, color: 0 }, { name: 'Projected to December', values: prj, dashed: true, color: 3 }] }),
    h('p', { class: 'note' }, `The solid line is each month-end snapshot, ending at today. The dashed line carries today’s position to December using ${hasPlan ? 'your ' + year + ' plan' : 'the standard assumptions (no ' + year + ' plan saved yet)'} and the market outlook set under Wealth projector.`))));

  const rows = actual.concat(projected).map((r, i, a) => ({ ...r, change: i ? r.value - a[i - 1].value : null, current: r.month === cur }));
  root.append(section('The numbers', h('div', null, table([
    { label: 'Month', host: true, render: (r) => h('span', null, monthLabel(r.month, true), r.current ? h('small', { class: 'now-tag' }, ' now') : null) },
    { label: 'Net worth', cls: 'r', get: (r) => money(r.value) },
    { label: 'Change', mob: 'under', mlabel: 'change ', cls: 'r', render: (r) => (r.change == null ? h('span', { class: 'muted' }, '–') : h('span', { class: tone(r.change) }, signed(r.change))) },
    { label: 'Source', mob: 'under', render: (r) => h('span', { class: r.src === 'Projected' ? 'muted' : '' }, r.src) },
  ], rows, { rowClass: (r) => (r.current ? 'cur-row' : r.src === 'Projected' ? 'proj-row' : '') }),
  h('p', { class: 'note' }, '“Plan sheet” months were typed in the Plan sheet before snapshots began; “Snapshot” months are saved on the Wealth projector. Change is against the month before.'))));
  return root;
}
