// Wealth projector → This year: the year-end target, a month-by-month path, month-end check-ins and the year review.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import { monthActual } from '../yearplan.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, confirmDialog } from '../ui.js';
import { lineChart, hbars } from '../charts.js';
import { rerender, outlooks, ensure, signed, pc, tone, outlookToggle, outlookSelects, planForm, oneOffForm, investForm, setAllOutlook, monthRange } from './proj-shared.js';

let selYear = null;
const thisYear = () => Number(String(S.all.asOf).slice(0, 4));

/** Everything the page shows for one plan, worked out once. */
export function model(plan) {
  const oc = outlooks(), cfg = P.cfg(S.data);
  const path = P.planPath(plan, oc);
  const months = path.map((r) => r.month);
  const live = P.baseline(S.data, S.all);
  const snaps = cfg.snapshots.filter((s) => s.month > plan.baseline.month && s.month <= `${plan.year}-12`);
  const snapBy = new Map(snaps.map((s) => [s.month, s]));
  const startFrom = live.month > plan.baseline.month && live.month <= `${plan.year}-12`;
  const fc = startFrom ? P.simulate({ values: live.values, liab: live.liab, month: live.month }, plan.a, oc, P.monthsTo(live.month, plan.year)) : path;
  const projected = fc.length ? fc[fc.length - 1].nw : live.month > `${plan.year}-12` ? (snaps.length ? snaps[snaps.length - 1].net : live.net) : plan.baseline.net;
  const planEnd = path.length ? path[path.length - 1].nw : plan.baseline.net;
  const gap = projected - plan.target;
  const status = gap >= 0 ? (gap > plan.target * 0.03 ? 'ahead' : 'on track') : gap >= -plan.target * 0.03 ? 'close' : 'behind';
  const monthsLeft = fc.length;
  const extra = gap < 0 && monthsLeft ? P.extraMonthly({ values: startFrom ? live.values : plan.baseline.classes, liab: startFrom ? live.liab : plan.baseline.loans, month: startFrom ? live.month : plan.baseline.month }, plan.a, oc, monthsLeft, plan.target) : 0;
  return { oc, path, months, live, snaps, snapBy, fc, startFrom, projected, planEnd, gap, status, monthsLeft, extra };
}
const STATUS = { ahead: ['Ahead of target', 'pos'], 'on track': ['On track', 'pos'], close: ['Slightly behind', 'warn'], behind: ['Behind target', 'neg'] };

function createPlan(year) {
  mutate((d) => { ensure(d).years[String(year)] = P.newYearPlan(d, S.all, year); });
  selYear = String(year); toast(`Plan ${year} created from today’s numbers`);
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
  return { plan: cfg.years[selYear], year: selYear, choices, cfg };
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
  const lastSnap = m.snaps[m.snaps.length - 1];

  // ---------- headline ----------
  root.append(h('div', { class: 'stats' },
    stat(`Target, Dec ${plan.year}`, money(plan.target), `from ${money(plan.baseline.net)} on ${dateStr(plan.baseline.date)}`),
    stat('Projected year end', h('span', { class: tone(m.gap) }, money(m.projected)), m.startFrom ? `from today’s ${money(m.live.net)}` : 'following the plan'),
    stat(m.gap >= 0 ? 'Cushion' : 'Short by', h('span', { class: tone(m.gap) }, money(Math.abs(m.gap))), h('span', { class: stTone }, stLabel)),
    m.gap < 0 && m.extra > 0 ? stat('Extra to invest', money(m.extra) + ' / month', `for the ${m.monthsLeft} months left, in a fixed deposit`) : stat('Plan says', money(m.planEnd), 'year end, as planned at the start')));

  // ---------- outlook toggle ----------
  const sel = h('div', null,
    outlookToggle(plan.a.outlook, (id) => setAllOutlook(plan.id, id), { disabled: !canEdit() }),
    h('details', { class: 'more' }, h('summary', null, 'Set each market class separately'), outlookSelects(plan.a.outlook, (k, id) => canEdit() && mutate((d) => { ensure(d).years[plan.id].a.outlook[k] = id; }))),
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
  const sameMonth = (r) => r.month <= nowM;
  const rows = m.path.map((r) => { const s = m.snapBy.get(r.month); const a = sameMonth(r) ? monthActual(data, r.month) : null; return { ...r, snap: s, act: a && a.has ? a : null }; });
  const stat1 = (r) => { if (!r.snap) return r.month > nowM ? 'later' : '–'; const g = r.snap.net - r.nw, pcg = g / r.nw; return pcg > 0.01 ? 'ahead' : pcg >= -0.01 ? 'on track' : pcg >= -0.03 ? 'slightly behind' : 'behind'; };
  root.append(section('Month by month', h('div', null,
    table([
      { label: 'Month end', host: true, get: (r) => monthLabel(r.month) },
      { label: 'Plan: net worth', cls: 'r', get: (r) => money(r.nw) },
      { label: 'Actual: net worth', mob: 'under', mlabel: 'actual ', cls: 'r', get: (r) => (r.snap ? money(r.snap.net) : '–') },
      { label: 'Ahead / behind', cls: 'r', render: (r) => (r.snap ? h('span', { class: tone(r.snap.net - r.nw) }, signed(r.snap.net - r.nw)) : h('span', { class: 'muted' }, '–')) },
      { label: 'Income plan | actual', mob: 'hide', cls: 'r', get: (r) => `${compact(r.income)} | ${r.act ? compact(r.act.income) : '–'}` },
      { label: 'Spending plan | actual', mob: 'hide', cls: 'r', get: (r) => `${compact(r.out)} | ${r.act ? compact(r.act.expenses + r.act.emi + r.act.tax) : '–'}` },
      { label: 'Status', mob: 'under', render: (r) => { const s = stat1(r); return h('span', { class: s === 'ahead' || s === 'on track' ? 'pos' : s === 'behind' ? 'neg' : s === 'slightly behind' ? 'warn' : 'muted' }, s); } },
    ], rows, { onRow: canEdit() ? (r) => snapshotForm(plan, r.month) : null }),
    h('p', { class: 'note' }, 'Plan net worth is the planned position at each month end. Tap a month to type in its month-end position by hand. Spending includes loan EMI and one-time items; income includes interest that reached your bank.'))));

  // ---------- where it went ----------
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
    root.append(section(`Where it went right or wrong, up to ${monthLabel(latest.month)}`, h('div', null,
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
      stat('Salary', money(a.salary), 'each month'), stat('Everyday expenses', money(a.expenses), 'each month'),
      stat('EMI and EPF', `${money(a.emi)} out · ${money(a.pfAdd)} in`, 'each month'),
      stat('New investments', money(invTotal), 'each month, in total')),
    h('p', { class: 'note' }, `Interest from bonds and lending (about ${money(m.path[0] ? m.path[0].interest : 0)} a month after tax at the start) is added automatically from your holdings. Planned investments beyond what you save come out of cash, so cash can go negative: that means the plan asks for more than you earn.`),
    m.path.length && Math.min(...m.path.map((r) => r.cash)) < 0 ? h('p', { class: 'form-error' }, `Cash would run short: lowest point ${money(Math.min(...m.path.map((r) => r.cash)))} in ${monthLabel(m.path.reduce((b, r) => (r.cash < b.cash ? r : b)).month)}. Lower the monthly investments or raise income.`) : null),
    canEdit() ? [btn('Edit target and assumptions', () => planForm(plan), 'primary', { keep: true })] : null));

  root.append(section('New money going in each month', h('div', null,
    table([
      { label: 'Investment', host: true, get: (l) => l.name }, { label: 'Goes into', mob: 'under', get: (l) => P.classOf(l.cls).label },
      { label: 'Each month', cls: 'r', get: (l) => money(l.monthly), total: () => money(invTotal) },
      { label: 'Return', mob: 'under', mlabel: 'return ', cls: 'r', get: (l) => (P.isMarket(l.cls) ? (l.outlook ? (outlooks().find((o) => o.id === l.outlook) || {}).name : 'class outlook') : pc(l.rate != null ? l.rate : (a.rates || {})[l.cls] || 0)) },
      { label: 'Period', mob: 'hide', get: (l) => (l.from || l.to ? `${l.from ? monthLabel(l.from) : 'next month'} to ${l.to ? monthLabel(l.to) : 'Dec'}` : 'whole plan') },
    ], inv, { footer: { label: 'Total' }, onRow: canEdit() ? (l) => investForm(plan, inv.find((x) => x.id === l.id)) : null, empty: 'No new investments planned. Add where your savings will go.' }),
    h('p', { class: 'note' }, 'Fixed-income money earns the rate shown (bonds and lending pay it out monthly; deposits, EPF and chits compound). Market-linked money follows its outlook.')),
    canEdit() ? [btn('Add investment', () => investForm(plan), 'primary', { keep: true })] : null));

  root.append(section('One-time income and expenses', h('div', null,
    table([
      { label: 'What', host: true, get: (o) => o.name }, { label: 'When', mob: 'under', get: (o) => (o.month.length === 2 ? `every ${monthLabel(plan.year + '-' + o.month).split(' ')[0]}` : monthLabel(o.month)) },
      { label: 'Amount', cls: 'r', render: (o) => h('span', { class: o.kind === 'income' ? 'pos' : 'neg' }, (o.kind === 'income' ? '+' : '−') + money(o.amount)) },
    ], oneOffs, { onRow: canEdit() ? (o) => oneOffForm(plan, a.oneOffs.find((x) => x.id === o.id)) : null, empty: 'Nothing added. Add tax, school fees, insurance, a trip or a bonus so the plan sees them coming.' })),
    canEdit() ? [btn('Add item', () => oneOffForm(plan), 'primary', { keep: true })] : null));

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
}
