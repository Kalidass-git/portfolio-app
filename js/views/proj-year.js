// Wealth outlook → This year: the year-end target, a month-by-month path, month-end check-ins and the year review.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import { monthActual } from '../yearplan.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, confirmDialog, dialog } from '../ui.js';
import { lineChart, hbars } from '../charts.js';
import * as actual from './proj-actual.js';
import { flowSection, yearsTable, interestWhy } from './proj-flow.js';
import { rerender, outlooks, ensure, signed, pc, tone, outlookToggle, outlookSelects, planForm, oneOffForm, investForm, setAllOutlook, monthRange } from './proj-shared.js';

let selYear = null;
const C_months = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
const thisYear = () => Number(String(S.all.asOf).slice(0, 4));

/** Everything the page shows for one plan, worked out once. */
export function model(plan) {
  const oc = outlooks(), cfg = P.cfg(S.data);
  const path = P.planPath(plan, oc);
  const months = path.map((r) => r.month);
  const live = P.baseline(S.data, S.all);
  const snaps = cfg.snapshots.filter((s) => s.month > plan.baseline.month && s.month <= `${plan.year}-12`);
  const snapBy = new Map(snaps.map((s) => [s.month, s]));
  // every month-end snapshot of the plan's year, including months before the plan started
  const yearSnapBy = new Map(cfg.snapshots.filter((s) => s.month.slice(0, 4) === String(plan.year)).map((s) => [s.month, s]));
  const startFrom = live.month >= plan.baseline.month && live.month <= `${plan.year}-12`;   // always from where you stand today, so it matches Years ahead
  const fc = startFrom ? P.simulate({ values: live.values, liab: live.liab, month: live.month }, plan.a, oc, P.monthsTo(live.month, plan.year)) : path;
  const projected = fc.length ? fc[fc.length - 1].nw : live.month > `${plan.year}-12` ? (snaps.length ? snaps[snaps.length - 1].net : live.net) : plan.baseline.net;
  const planEnd = path.length ? path[path.length - 1].nw : plan.baseline.net;
  const gap = projected - plan.target;
  const status = gap >= 0 ? (gap > plan.target * 0.03 ? 'ahead' : 'on track') : gap >= -plan.target * 0.03 ? 'close' : 'behind';
  const monthsLeft = fc.length;
  const extra = gap < 0 && monthsLeft ? P.extraMonthly({ values: startFrom ? live.values : plan.baseline.classes, liab: startFrom ? live.liab : plan.baseline.loans, month: startFrom ? live.month : plan.baseline.month }, plan.a, oc, monthsLeft, plan.target) : 0;
  return { oc, path, months, live, snaps, snapBy, yearSnapBy, fc, startFrom, projected, planEnd, gap, status, monthsLeft, extra };
}
const STATUS = { ahead: ['Ahead of target', 'pos'], 'on track': ['On track', 'pos'], close: ['Slightly behind', 'warn'], behind: ['Behind target', 'neg'] };

/** "How is this worked out": every figure behind Available to invest, where it came from, and a check against what the bank shows you really kept. */
function availExplain(plan, a, m, f) {
  const { data, all } = S;
  const cur = C.monthKey(all.asOf);
  const hist = C.ledgerMonths(data).filter((x) => x < cur).slice(-6).map((x) => ({ month: x, ...monthActual(data, x) })).filter((x) => x.has);
  const last3 = hist.slice(-3), avg = (rows, k) => (rows.length ? rows.reduce((t, x) => t + (x[k] || 0), 0) / rows.length : 0);
  const b = P.baseline(data, all), tds = a.tds ?? 0.1;
  const bi = (b.values.bonds || 0) * (b.rates.bonds || 0) / 12 * (1 - tds), li = (b.values.lending || 0) * (b.rates.lending || 0) / 12 * (1 - tds);
  const kept = avg(hist, 'left'), diff = f.avail - kept;
  const row = (label, val, src, bold) => ({ label, val, src, bold });
  const list = (rows, k) => rows.map((x) => `${monthLabel(x.month).slice(0, 3)} ${money(x[k])}`).join(', ');
  const lines = [
    row('Salary reaching the bank', money(a.salary), `plan figure. Your last ${last3.length} months of salary credits averaged ${money(avg(last3, 'salary'))} (${list(last3, 'salary')})`),
    row('Other income', money(a.otherIncome || 0), 'plan figure, empty unless you set it'),
    row('Interest paid out by bonds and lending', money(bi + li), `from your holdings after ${pct(tds, 0)} TDS: bonds ${money(bi)}, private lending ${money(li)}. Deposits, EPF and chits add to their balances instead`),
    row('Money in each month', money(f.inc), '', true),
    row('Everyday expenses', '−' + money(a.expenses), `plan figure. Your last ${hist.length} months of everyday spending, without one-time bills, averaged ${money(avg(hist, 'regular'))} (${list(hist, 'regular')})`),
    row('Loan EMI', '−' + money(a.emi), `plan figure. Your last ${last3.length} months of EMI averaged ${money(avg(last3, 'emi'))}`),
    row('Yearly one-time bills, one twelfth', '−' + money(f.oneMonthly), `${money(f.yearOnce)} of tax, fees, trips and so on in ${plan.year}, spread evenly so the cash is there when they fall due`),
    row('Available to invest each month', money(f.avail), 'in − spending − EMI − bills set aside', true),
  ];
  return h('details', { class: 'more' }, h('summary', null, 'How this is worked out'),
    table([{ label: 'Step', host: true, render: (x) => h('span', null, x.bold ? h('b', null, x.label) : x.label, x.src ? h('small', { class: 'muted', style: { display: 'block', whiteSpace: 'normal' } }, x.src) : null) }, { label: 'Each month', cls: 'r', render: (x) => (x.bold ? h('b', null, x.val) : x.val) }], lines, {}),
    hist.length ? h('p', { class: Math.abs(diff) > Math.max(5000, 0.2 * Math.abs(kept)) ? 'form-error' : 'note' }, `Check against the bank: in the last ${hist.length} months you actually kept about ${money(kept)} a month after all spending, tax and one-time bills, before investing. This page says ${money(f.avail)}. ${Math.abs(diff) > Math.max(5000, 0.2 * Math.abs(kept)) ? (diff > 0 ? 'The page is more hopeful than your history. Check that the salary and expense figures in the plan are realistic.' : 'The page is more cautious than your history. The plan may be assuming more spending or less income than you have seen.') : 'They are close, so the plan matches how you have really been living.'}`) : h('p', { class: 'note' }, 'There is not enough bank history to check this against.'),
    h('p', { class: 'note' }, `Not in this figure: EPF (${money(a.pfAdd || 0)} a month goes in before the salary reaches the bank) and the new investments themselves. The plan figures can be changed under Edit target and assumptions.`));
}

function createPlan(year) {
  mutate((d) => { ensure(d).years[String(year)] = P.newYearPlan(d, S.all, year); });
  selYear = String(year); toast(`Plan ${year} created from today’s numbers`);
}

/** What a saved snapshot holds: the plan for that month beside what really happened. */
function snapshotDetail(s) {
  const pr = s.projected, ac = s.actual || {}, has = !!(pr && pr.salary != null);
  const rows = [
    ['Net worth', pr ? pr.net : null, s.net],
    ['Salary', has ? pr.salary : null, ac.salary], ['Interest and other income', has ? pr.interest + pr.other : null, ac.income != null && ac.salary != null ? ac.income - ac.salary : null],
    ['Everyday spending', has ? pr.expenses : null, ac.expenses], ['Loan EMI', has ? pr.emi : null, ac.emi], ['One-time and tax', has ? pr.oneOut : null, ac.tax != null ? ac.tax : null],
    ['Invested', has ? pr.invested : null, ac.invested], ['Added to EPF', has ? pr.pfAdd : null, ac.pf],
  ];
  const cls = P.CLASSES.filter((c) => (s.classes && s.classes[c.key] > 0) || (pr && pr.classes[c.key] > 0)).map((c) => [c.label, pr ? pr.classes[c.key] || 0 : null, (s.classes && s.classes[c.key]) || 0]);
  const t = (list) => table([{ label: 'Item', host: true, get: (x) => x[0] }, { label: 'Plan', cls: 'r', get: (x) => (x[1] == null ? '–' : money(x[1])) }, { label: 'Actual', cls: 'r', get: (x) => (x[2] == null ? '–' : money(x[2])) },
    { label: 'Difference', cls: 'r', render: (x) => (x[1] == null || x[2] == null ? '–' : h('span', { class: tone(x[2] - x[1]) }, signed(x[2] - x[1]))) }], list, {});
  dialog(`${monthLabel(s.month, true)} snapshot`, h('div', null,
    h('p', { class: 'note' }, `Saved ${s.date}. ${s.plan ? `Plan ${s.plan.year}, target ${money(s.plan.target)}. ` : 'No plan existed for this year when it was saved. '}${s.note ? 'Note: ' + s.note : ''}`),
    t(rows), h('h4', { style: { margin: '10px 0 4px' } }, 'Where the money sat'), t(cls),
    s.plan ? h('p', { class: 'note' }, 'The plan column is what the plan said for that month with the assumptions of the day: salary ' + money(s.plan.assumptions.salary) + ', everyday expenses ' + money(s.plan.assumptions.expenses) + ', EMI ' + money(s.plan.assumptions.emi) + '.') : null), [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}
function snapshotForm(plan, mo) {
  const s = P.cfg(S.data).snapshots.find((x) => x.month === mo);
  formDialog({
    title: `${monthLabel(mo, true)} month-end position`, saveLabel: 'Save', deleteMessage: 'Delete this month-end snapshot?',
    value: s ? { assets: s.assets, loans: s.loans, note: s.note || '' } : { assets: S.all.totalAssets, loans: S.all.liabTotal, note: '' },
    fields: [
      { key: 'assets', label: 'Total assets at month end (₹)', type: 'number', required: true, half: true }, { key: 'loans', label: 'Loans at month end (₹)', type: 'number', half: true },
      { key: 'note', label: 'Note (what happened this month)', type: 'text' },
    ],
    onSave: (v) => mutate((d) => {
      const p = ensure(d); const cur = p.snapshots.find((x) => x.month === mo);
      const rec = cur ? { ...cur } : P.makeSnapshot(d, S.all, mo);
      rec.assets = Math.round(v.assets); rec.loans = Math.round(v.loans || 0); rec.net = rec.assets - rec.loans; rec.note = v.note || '';
      if (cur) Object.assign(cur, rec); else p.snapshots.push(rec);
      p.snapshots.sort((a, b) => (a.month < b.month ? -1 : 1));
    }),
    onDelete: s ? () => mutate((d) => { ensure(d).snapshots = d.projector.snapshots.filter((x) => x.month !== mo); }) : null,
    extraActions: s && (s.projected || s.actual) ? [{ label: 'See what was saved', onclick: () => snapshotDetail(s) }] : [],
  });
}
/** Record today's real position as the month-end snapshot. */
function saveSnapshot(mo) {
  formDialog({
    title: `Save ${monthLabel(mo, true)} snapshot`, saveLabel: 'Save snapshot', value: { note: '' },
    fields: [{ key: 'note', label: 'Note (optional)', type: 'text', hint: `Saves today’s holdings: net worth ${money(S.all.netAsset)}. Do this on the last day of the month, after prices are refreshed.` }],
    onSave: (v) => mutate((d) => {
      const p = ensure(d); const rec = P.makeSnapshot(d, S.all, mo, v.note || '');
      const i = p.snapshots.findIndex((x) => x.month === mo); if (i >= 0) p.snapshots[i] = rec; else p.snapshots.push(rec);
      p.snapshots.sort((a, b) => (a.month < b.month ? -1 : 1));
      toast(`${monthLabel(mo)} snapshot saved`);
    }),
  });
}

/** The plan being looked at (the other tabs use it too). */
export function currentPlan() {
  const cfg = P.cfg(S.data), yrs = Object.keys(cfg.years).sort(), cy = thisYear();
  const choices = [...new Set([...yrs, String(cy), String(cy + 1)])].sort();
  if (!selYear || !choices.includes(selYear)) selYear = yrs.includes(String(cy)) ? String(cy) : yrs[yrs.length - 1] || String(cy);
  return { plan: P.effectivePlan(S.data, cfg.years[selYear]), year: selYear, choices, cfg };
}
export function createPlanFor(year) { createPlan(year); }

export function render(root) {
  const { data, all } = S;
  const cfg = P.cfg(data);
  const yrs = Object.keys(cfg.years).sort();
  const cy = thisYear();
  const { plan, choices } = currentPlan();
  const picker = h('div', { class: 'filters' }, h('label', null, 'Plan year ', h('select', { 'aria-label': 'Plan year', onchange: (e) => { selYear = e.target.value; rerender(); } }, choices.map((y) => h('option', { value: y, selected: y === selYear }, y + (cfg.years[y] ? '' : ' (not started)'))))));
  root.append(picker);

  if (!plan) {
    const b = P.baseline(data, all);
    root.append(section(`Plan ${selYear}`, h('div', null,
      h('p', null, `Set a net worth target for December ${selYear}. The projector starts from where you stand today (net worth ${money(b.net)}), adds the interest your fixed income will pay, your salary and expected expenses, the new investments you plan, and a market outlook for shares, funds and gold. Each month end you save a snapshot and see whether you are on track.`),
      h('p', { class: 'note' }, 'Best done in December (for the coming year) or January. Creating it now uses today’s numbers as the starting point.'),
      canEdit() ? btn(`Create plan ${selYear}`, () => createPlan(selYear), 'primary', { keep: true }) : h('p', { class: 'muted' }, 'The owner has not made a plan for this year yet.'))));
    return;
  }
  const m = model(plan);
  const [stLabel, stTone] = STATUS[m.status];
  const lastSnap = m.snaps.filter((x) => x.classes).pop() || m.snaps[m.snaps.length - 1];

  // ---------- headline ----------
  root.append(h('div', { class: 'stats' },
    stat(`Target, Dec ${plan.year}`, money(plan.target), `from ${money(plan.baseline.net)} on ${dateStr(plan.baseline.date)}`),
    stat('Projected year end', h('span', { class: tone(m.gap) }, money(m.projected)), m.startFrom ? `from today’s ${money(m.live.net)}` : 'following the plan'),
    stat(m.gap >= 0 ? 'Cushion' : 'Short by', h('span', { class: tone(m.gap) }, money(Math.abs(m.gap))), h('span', { class: stTone }, stLabel)),
    m.gap < 0 && m.extra > 0 ? stat('Extra to save', money(m.extra) + ' / month', `earn more or spend less, for the ${m.monthsLeft} months left`) : stat('Plan says', money(m.planEnd), 'year end, as planned at the start')));

  // ---------- outlook toggle ----------
  const sel = h('div', null,
    outlookToggle(plan.a.outlook, (id) => setAllOutlook(plan.id, id), { disabled: !canEdit() }),
    h('details', { class: 'more' }, h('summary', null, 'Set each market class separately'), outlookSelects(plan.a.outlook, (k, id) => canEdit() && mutate((d) => { const pl = ensure(d).years[plan.id]; pl.a.outlook[k] = id; d.projector.ahead = { ...(d.projector.ahead || {}), outlook: { ...pl.a.outlook } }; }))),
    h('p', { class: 'note' }, 'The outlook is the yearly return assumed for shares, ETFs, funds and gold (and fresh money put into them). Fixed income uses its own interest rates. Change it to see how the year end moves.'));
  root.append(section('Market outlook for this plan', sel));

  // ---------- chart ----------
  const labels = [monthLabel(plan.baseline.month), ...m.months.map((x) => monthLabel(x))];
  const idx = (mo) => (mo === plan.baseline.month ? 0 : m.months.indexOf(mo) + 1);
  const n = labels.length;
  const target = labels.map((_, i) => Math.round(plan.baseline.net + ((plan.target - plan.baseline.net) * i) / Math.max(1, n - 1)));
  const planS = [plan.baseline.net, ...m.path.map((r) => r.nw)];
  const act = Array(n).fill(null); act[0] = plan.baseline.net;
  for (const s of m.snaps) { const i = idx(s.month); if (i > 0) act[i] = s.net; }
  const fcS = Array(n).fill(null);
  if (m.startFrom) { const i = idx(m.live.month); if (i >= 0) { fcS[i] = m.live.net; m.fc.forEach((r, k) => { fcS[i + 1 + k] = r.nw; }); } }
  const lo = Math.min(...[...planS, ...act, ...fcS].filter((v) => v != null));
  root.append(section('Net worth: target, plan and what really happened', lineChart({
    labels, fmt: money, yMin: Math.floor((lo * 0.97) / 1e6) * 1e6,
    series: [{ name: 'Target path', values: target, dashed: true, color: 2 }, { name: 'Plan', values: planS, color: 1 }, { name: 'Actual (snapshots)', values: act, color: 0 }, ...(m.startFrom ? [{ name: 'Forecast from today', values: fcS, dashed: true, color: 3 }] : [])],
  })));

  // ---------- month-end check-in ----------
  const nowM = C.monthKey(all.asOf), nowRow = m.path.find((r) => r.month === nowM), mine = m.snapBy.get(nowM);
  const planNow = nowRow ? nowRow.nw : null;
  root.append(section(`Month-end check-in · ${monthLabel(nowM, true)}`, h('div', null,
    h('div', { class: 'stats' },
      stat('Net worth today', money(all.netAsset), `as on ${dateStr(all.asOf)}`),
      planNow != null ? stat(`Plan for end of ${monthLabel(nowM)}`, money(planNow), h('span', { class: tone(all.netAsset - planNow) }, `${signed(all.netAsset - planNow)} ${all.netAsset >= planNow ? 'ahead' : 'behind'} so far`)) : stat('This month', 'Starting point', 'the plan begins next month'),
      mine ? stat('Snapshot saved', money(mine.net), mine.note || dateStr(mine.date)) : stat('Snapshot', 'Not saved yet', 'save it on the last day of the month')),
    h('p', { class: 'note' }, 'On the last day of each month, refresh prices, then save a snapshot. It keeps your net worth and the value of every asset class, so the review below can show where you gained or lost against the plan.')),
    canEdit() ? [btn(mine ? 'Update snapshot' : 'Save snapshot', () => saveSnapshot(nowM), 'primary', { keep: true })] : null));

  // ---------- month by month ----------
  // Every month of the year: months before the plan started show their snapshot only; the plan columns are blank for them.
  const planBy = new Map(m.path.map((r) => [r.month, r]));
  const rows = C_months(plan.year).map((mo) => {
    const pr = planBy.get(mo);
    const nw = pr ? pr.nw : mo === plan.baseline.month ? plan.baseline.net : null;
    const snap = m.yearSnapBy.get(mo) || null;
    const a = mo <= nowM ? monthActual(data, mo) : null;
    return { month: mo, nw, income: pr ? pr.income : null, out: pr ? pr.out : null, snap, act: a && a.has ? a : null };
  });
  const stat1 = (r) => { if (!r.snap) return r.month > nowM ? 'later' : '–'; if (r.nw == null) return 'recorded'; const g = r.snap.net - r.nw, pcg = g / r.nw; return pcg > 0.01 ? 'ahead' : pcg >= -0.01 ? 'on track' : pcg >= -0.03 ? 'slightly behind' : 'behind'; };
  const fromSheet = P.planSheetSnapshots(data, all.asOf).filter((x) => x.month.slice(0, 4) === String(plan.year));
  root.append(section('Month by month', h('div', null,
    fromSheet.length && canEdit() ? h('div', { class: 'alert warn' }, h('b', null, `${fromSheet.length} month-end${fromSheet.length === 1 ? '' : 's'} from your Plan sheet ${fromSheet.length === 1 ? 'is' : 'are'} not in this table yet`),
      h('p', null, `${fromSheet.map((x) => monthLabel(x.month).slice(0, 3)).join(', ')}: these were typed into Plan → Month by month. Bring them in as snapshots so they show here. Months that already have a snapshot are not changed.`),
      btn('Bring them in', () => mutate((d) => { const add = P.planSheetSnapshots(d, S.all.asOf); const p = ensure(d); p.snapshots.push(...add); p.snapshots.sort((a, b) => (a.month < b.month ? -1 : 1)); toast(`${add.length} month-end${add.length === 1 ? '' : 's'} brought in`); }), 'small', { keep: true })) : null,
    table([
      { label: 'Month end', host: true, render: (r) => h('span', null, monthLabel(r.month), r.month === nowM ? h('small', { class: 'now-tag' }, ' now') : null) },
      { label: 'Plan: net worth', cls: 'r', get: (r) => (r.nw != null ? money(r.nw) : '–') },
      { label: 'Actual: net worth', mob: 'under', mlabel: 'actual ', cls: 'r', get: (r) => (r.snap ? money(r.snap.net) : '–') },
      { label: 'Ahead / behind', cls: 'r', render: (r) => (r.snap && r.nw != null ? h('span', { class: tone(r.snap.net - r.nw) }, signed(r.snap.net - r.nw)) : h('span', { class: 'muted' }, '–')) },
      { label: 'Income plan | actual', mob: 'hide', cls: 'r', get: (r) => `${r.income != null ? compact(r.income) : '–'} | ${r.act ? compact(r.act.income) : '–'}` },
      { label: 'Spending plan | actual', mob: 'hide', cls: 'r', get: (r) => `${r.out != null ? compact(r.out) : '–'} | ${r.act ? compact(r.act.expenses + r.act.emi + r.act.tax) : '–'}` },
      { label: 'Status', mob: 'under', render: (r) => { const s = stat1(r); return h('span', { class: s === 'ahead' || s === 'on track' ? 'pos' : s === 'behind' ? 'neg' : s === 'slightly behind' ? 'warn' : 'muted' }, s); } },
    ], rows, { rowClass: (r) => (r.month === nowM ? 'cur-row' : ''), onRow: canEdit() ? (r) => snapshotForm(plan, r.month) : null }),
    h('p', { class: 'note' }, 'The highlighted row is the current month. Plan net worth is the planned position at each month end; months before the plan started have no plan figure. Tap a month to type in its month-end position by hand. Spending includes loan EMI and one-time items; income includes interest that reached your bank.'))));

  // ---------- where it went (shown last) ----------
  let whereWent = null;
  const latest = lastSnap || (m.startFrom ? { month: m.live.month, classes: m.live.values, net: m.live.net, assets: m.live.assets, loans: m.live.liab, live: true } : null);
  if (latest && latest.classes) {
    const prow = m.path.find((r) => r.month === latest.month);
    const baseV = plan.baseline.classes;
    const planV = prow ? prow.values : baseV;
    const list = P.CLASSES.map((c) => { const pl = (planV[c.key] || 0) - (baseV[c.key] || 0), ac = (latest.classes[c.key] || 0) - (baseV[c.key] || 0); return { key: c.key, label: c.label, kind: c.kind, plan: pl, actual: ac, diff: ac - pl }; }).filter((x) => Math.abs(x.plan) + Math.abs(x.actual) > 1);
    const planNet = (prow ? prow.nw : plan.baseline.net), diff = latest.net - planNet;
    const grp = (f) => list.filter(f).reduce((a, x) => a + x.diff, 0);
    const market = grp((x) => x.kind === 'market'), fixed = grp((x) => x.kind === 'payout' || x.kind === 'accrual'), cash = grp((x) => x.kind === 'cash');
    const best = list.slice().sort((a, b) => b.diff - a.diff)[0], worst = list.slice().sort((a, b) => a.diff - b.diff)[0];
    const notes = [];
    notes.push(h('li', null, `Net worth is ${money(Math.abs(diff))} ${diff >= 0 ? 'ahead of' : 'behind'} the plan for ${monthLabel(latest.month)}${latest.live ? ' (using today’s numbers)' : ''}.`));
    if (Math.abs(market) > 1) notes.push(h('li', null, `Market-linked assets (shares, ETFs, funds, gold) are ${money(Math.abs(market))} ${market >= 0 ? 'above' : 'below'} what the ${P.cfg(data).outlooks.find((o) => o.id === plan.a.outlook.shares)?.name || 'chosen'} outlook expected.`));
    if (Math.abs(fixed) > 1) notes.push(h('li', null, `Fixed income, EPF and chits are ${money(Math.abs(fixed))} ${fixed >= 0 ? 'above' : 'below'} plan.`));
    if (Math.abs(cash) > 1) notes.push(h('li', null, `Cash is ${money(Math.abs(cash))} ${cash >= 0 ? 'higher' : 'lower'} than planned, which reflects saving ${cash >= 0 ? 'more' : 'less'} (or investing ${cash >= 0 ? 'less' : 'more'}) than the plan.`));
    if (worst && worst.diff < -1) notes.push(h('li', null, `Biggest shortfall: ${worst.label} (${signed(worst.diff)}).`));
    if (best && best.diff > 1) notes.push(h('li', null, `Biggest gain over plan: ${best.label} (${signed(best.diff)}).`));
    whereWent = (section(`Where it went right or wrong, up to ${monthLabel(latest.month)}`, h('div', null,
      h('ul', { class: 'findings' }, notes),
      table([
        { label: 'Asset class', host: true, get: (x) => x.label },
        { label: 'Planned change', mob: 'under', mlabel: 'plan ', cls: 'r', get: (x) => signed(x.plan) },
        { label: 'Actual change', mob: 'under', mlabel: 'actual ', cls: 'r', get: (x) => signed(x.actual) },
        { label: 'Difference', cls: 'r', render: (x) => h('span', { class: tone(x.diff) }, signed(x.diff)) },
      ], list.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)), { footer: { label: 'Net worth' } }),
      h('p', { class: 'note' }, 'Change since the plan started, per asset class. Cash absorbs the difference between what you saved and what you invested, so read it together with the rest.'))));
  }

  // ---------- assumptions ----------
  const a = plan.a;
  const oneOffs = (a.oneOffs || []).slice().sort((x, y) => (x.month < y.month ? -1 : 1));
  const inv = a.invest || [];
  const invTotal = inv.reduce((s, l) => s + (l.monthly || 0), 0);
  root.append(section('What the plan assumes', h('div', null,
    h('div', { class: 'stats' },
      stat('Salary with EPF', money((a.salary || 0) + (a.pfAdd || 0)), `${money(a.salary)} to bank + ${money(a.pfAdd)} to EPF`), stat('Everyday expenses', money(a.expenses), 'each month'),
      stat('Loan EMI', money(a.emi), 'each month'),
      stat('New investments', money(invTotal), 'each month, in total')),
    h('p', { class: 'note' }, `Interest from bonds and lending (about ${money(m.path[0] ? m.path[0].interest : 0)} a month after tax at the start) is added automatically from your holdings. New money is not a fixed amount: each month invests what is left after spending, EMI and one-time bills. Cash only dips in a month that costs more than comes in, such as tax.`),
    m.path.length && Math.min(...m.path.map((r) => r.cash)) < 0 ? h('p', { class: 'form-error' }, `Cash dips to its lowest point ${money(Math.min(...m.path.map((r) => r.cash)))} in ${monthLabel(m.path.reduce((b, r) => (r.cash < b.cash ? r : b)).month)}; the months after rebuild it before investing again. Check the one-time bills if that looks too low.`) : null),
    canEdit() ? [btn('Edit target and assumptions', () => planForm(plan), '', { keep: true })] : null));

  // money available to invest each month: what comes in, less everyday spending, EMI and the yearly one-time bills spread over twelve months
  const r0m = m.path[0];
  const inc = r0m ? r0m.salary + r0m.other + r0m.interest : 0, spend = r0m ? r0m.expenses + r0m.emi : 0;
  const yearOnce = (a.oneOffs || []).filter((o) => o.kind !== 'income' && (o.month.length === 2 || o.month.startsWith(String(plan.year)))).reduce((x, o) => x + (o.amount || 0), 0);
  const oneMonthly = yearOnce / 12;
  const availBefore = inc - spend, avail = availBefore - oneMonthly;
  const left = avail - invTotal;
  const shareOf = (v) => (invTotal > 0 ? pct(v / invTotal, 0) : '–');
  // interest income expected for the rest of the plan year
  if (m.path.length) {
    const paidYr = m.path.reduce((a, r) => a + r.interest, 0), addedYr = m.path.reduce((a, r) => a + (r.accrual || 0), 0), p0 = m.path[0], pL = m.path[m.path.length - 1];
    root.append(section('Interest income expected', h('div', null,
      h('div', { class: 'stats' },
        stat('Paid out each month', h('span', { class: 'pos' }, money(p0.interest)), `bonds and lending after tax · ${money(pL.interest)} by ${monthLabel(pL.month)}`),
        stat(`Paid out by December`, h('span', { class: 'pos' }, money(paidYr)), `${m.path.length} months left`),
        stat('Added to deposits, EPF, chits', h('span', { class: 'pos' }, money(addedYr)), 'compounds inside the balance'),
        stat('Credit every day', h('span', { class: 'pos' }, money((p0.interest + (p0.accrual || 0)) * 12 / 365)), 'paid out and compounding together')),
      h('p', { class: 'note' }, 'It grows as the plan adds to bonds, lending and deposits. See Years ahead for how it grows over many years.'))));
  }

  if (m.fc.length) root.append(interestWhy(m.fc, { tds: plan.a.tds ?? 0.1 }));
  if (m.fc.length) root.append(yearsTable(m.fc, { title: `Month by month, rest of ${plan.year}` }), flowSection(m.fc, { mode: 'month', title: `Income, spending and investing, rest of ${plan.year}` }));
  root.append(section('New money going in each month', h('div', null,
    h('div', { class: 'stats' },
      stat('Available to invest', h('span', { class: tone(avail) }, money(avail)), `each month · ${money(inc)} in, ${money(spend)} out${oneMonthly > 1 ? `, ${money(oneMonthly)} set aside for yearly bills` : ''}`),
      stat('New money is split', `${inv.length} ${inv.length === 1 ? 'line' : 'lines'}`, 'each month invests what is left, in the shares below; a month with tax or fees invests less')),
    (a.pfAdd || 0) > 0 ? h('p', { class: 'note' }, `Your EPF (${money(a.pfAdd)} a month, yours and the employer’s) goes in before salary reaches the bank, so it is already saved and is not part of the available amount.`) : null,
    availExplain(plan, a, m, { inc, spend, availBefore, oneMonthly, yearOnce, avail }),
    avail <= 0 ? h('p', { class: 'form-error' }, 'Nothing is left in an average month after expenses, EMI and the yearly bills, so little or nothing would be invested.') : null,
    table([
      { label: 'Investment', host: true, get: (l) => l.name }, { label: 'Goes into', mob: 'under', get: (l) => P.classOf(l.cls).label },
      { label: 'Planned each month', cls: 'r', render: (l) => h('span', { class: 'inv' }, money(l.monthly)), total: () => h('span', { class: 'inv' }, money(invTotal)) },
      { label: 'Share of new money', mob: 'under', mlabel: 'share ', cls: 'r', get: (l) => shareOf(l.monthly), total: () => shareOf(invTotal) },
      { label: 'Return', mob: 'under', mlabel: 'return ', cls: 'r', get: (l) => (P.isMarket(l.cls) ? (l.outlook ? (outlooks().find((o) => o.id === l.outlook) || {}).name : 'class outlook') : pc(l.rate != null ? l.rate : (a.rates || {})[l.cls] || 0)) },
      { label: 'Period', mob: 'hide', get: (l) => (l.from || l.to ? `${l.from ? monthLabel(l.from) : 'next month'} to ${l.to ? monthLabel(l.to) : 'Dec'}` : 'whole plan') },
    ], inv, { footer: { label: 'Total' }, onRow: canEdit() ? (l) => investForm(plan, inv.find((x) => x.id === l.id)) : null, empty: 'No new investments planned. Add where your savings will go.' }),
    h('p', { class: 'note' }, 'The planned amounts are a guide. In the projection each month, whatever is left after spending, EMI and one-time bills is invested in these shares, so a month with tax or fees invests less and a quiet month more. Fixed-income money earns the rate shown (bonds and lending pay it out monthly; deposits, EPF and chits compound). Market-linked money follows its outlook.')),
    canEdit() ? [btn('Add investment', () => investForm(plan), '', { keep: true })] : null));

  actual.render(root, plan);

  root.append(section('One-time income and expenses', h('div', null,
    table([
      { label: 'What', host: true, get: (o) => o.name }, { label: 'When', mob: 'under', get: (o) => (o.month.length === 2 ? `every ${monthLabel(plan.year + '-' + o.month).split(' ')[0]}` : monthLabel(o.month)) },
      { label: 'Amount', cls: 'r', render: (o) => h('span', { class: o.kind === 'income' ? 'pos' : 'neg' }, (o.kind === 'income' ? '+' : '−') + money(o.amount)) },
    ], oneOffs, { onRow: canEdit() ? (o) => oneOffForm(plan, a.oneOffs.find((x) => x.id === o.id)) : null, empty: 'Nothing added. Add tax, school fees, insurance, a trip or a bonus so the plan sees them coming.' })),
    canEdit() ? [btn('Add item', () => oneOffForm(plan), '', { keep: true })] : null));

  // ---------- year-end review ----------
  const r = plan.retro || {};
  const done = latest && (latest.month >= `${plan.year}-12`);
  root.append(section(done ? `Year-end review · ${plan.year}` : 'Year-end review', h('div', null,
    done ? h('p', null, h('b', null, latest.net >= plan.target ? 'Target reached. ' : 'Target missed. '), `Net worth ended at ${money(latest.net)} against a target of ${money(plan.target)} (${signed(latest.net - plan.target)}).`) : h('p', { class: 'note' }, 'Write this in December. The tables above show what drove the result; use these two boxes to decide what to keep and what to change next year.'),
    h('div', { class: 'retro' }, h('div', null, h('h4', null, 'What went well'), h('p', { class: 'pre' }, r.well || '—')), h('div', null, h('h4', null, 'What to do better'), h('p', { class: 'pre' }, r.improve || '—'))),
    r.savedAt ? h('p', { class: 'note' }, 'Written ' + dateStr(r.savedAt.slice(0, 10)) + '.') : null),
    canEdit() ? [btn('Write review', () => formDialog({
      title: `Review of ${plan.year}`, value: { well: r.well || '', improve: r.improve || '' },
      fields: [{ key: 'well', label: 'What went well', type: 'textarea' }, { key: 'improve', label: 'What to do better next year', type: 'textarea', hint: 'Spending, saving, how you chose market outlooks, one-time costs you missed.' }],
      onSave: (v) => mutate((d) => { ensure(d).years[plan.id].retro = { well: v.well, improve: v.improve, savedAt: new Date().toISOString() }; }),
    }), '', { keep: true }), btn('Start from today’s numbers again', async () => { if (await confirmDialog(`Reset the starting point of plan ${plan.year} to today’s holdings and assumptions? Month-end snapshots stay, but the plan path changes.`, 'Reset')) mutate((d) => { const old = ensure(d).years[plan.id]; const fresh = P.newYearPlan(d, S.all, plan.year); fresh.target = old.target; fresh.retro = old.retro; d.projector.years[plan.id] = fresh; }); }, '', { keep: true })] : null));
  if (whereWent) root.append(whereWent);
}
