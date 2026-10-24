// Wealth outlook → This year: the plan's year, month by month. Months up to now are what really happened (month-end snapshots), the rest is projected from there
// with the plan's settings, shown in italics. The plan itself is set on the Planner tab; this page only reads the plan that is live.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import * as PL from '../planner.js';
import { h, money, compact, dateStr, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, dialog, popover } from '../ui.js';
import { lineChart } from '../charts.js';
import * as actual from './proj-actual.js';
import { flowSection, yearsTable } from './proj-flow.js';
import { rerender, outlooks, ensure, signed, pc, tone, currentPlan, planPicker, notLiveCard, planSettingsCard, outlookWhatIf, outlookOverride } from './proj-shared.js';

const STATUS = { ahead: ['Ahead of target', 'pos'], 'on track': ['On track', 'pos'], close: ['Slightly behind', 'warn'], behind: ['Behind target', 'neg'] };
const SHORT = { ahead: 'pos', 'on track': 'pos', 'slightly behind': 'warn', behind: 'neg' };
let whereMonth = null, whereYear = null;

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
    { label: 'Difference', cls: 'r', render: (x) => (x[1] == null || x[2] == null ? '–' : h('span', { class: tone(x[2] - x[1]) }, signed(x[2] - x[1]))) }], list, { m: { key: 'year-snap', head: 'Item', views: [['Actual', 'Plan'], ['Difference']] } });
  dialog(`${monthLabel(s.month, true)} snapshot`, h('div', null,
    h('p', { class: 'note' }, `Saved ${s.date}. ${s.plan ? `Plan ${s.plan.year}${s.plan.rev ? `, revision ${s.plan.rev}` : ''}, target ${money(s.plan.target)}. ` : 'No live plan existed for this year when it was saved. '}${s.note ? 'Note: ' + s.note : ''}`),
    t(rows), h('h4', { style: { margin: '10px 0 4px' } }, 'Where the money sat'), t(cls),
    s.plan ? h('p', { class: 'note' }, 'The plan column is what the plan said for that month with the assumptions of the day: salary ' + money(s.plan.assumptions.salary) + ', everyday expenses ' + money(s.plan.assumptions.expenses) + ', EMI ' + money(s.plan.assumptions.emi) + '.') : null), [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}
/** Type in a month-end position. A month with no snapshot starts from the projected position, so only what differs needs changing. */
function snapshotForm(mo, row) {
  const s = P.cfg(S.data).snapshots.find((x) => x.month === mo), cur = C.monthKey(S.all.asOf);
  const guess = row ? PL.snapshotGuess(row) : { assets: Math.round(S.all.totalAssets), loans: Math.round(S.all.liabTotal) };
  formDialog({
    title: `${monthLabel(mo, true)} month-end position`, saveLabel: 'Save', deleteMessage: 'Delete this month-end snapshot?',
    value: s ? { assets: s.assets, loans: s.loans, note: s.note || '' } : { assets: guess.assets, loans: guess.loans, note: '' },
    fields: [
      { key: 'assets', label: 'Total assets at month end (₹)', type: 'number', required: true, half: true, hint: s ? null : (mo < cur ? 'Starts from what the plan projects for this month.' : null) },
      { key: 'loans', label: 'Loans at month end (₹)', type: 'number', half: true },
      { key: 'note', label: 'Note (what happened this month)', type: 'text' },
    ],
    onSave: (v) => mutate((d) => {
      const p = ensure(d); const cur0 = p.snapshots.find((x) => x.month === mo);
      const rec = cur0 ? { ...cur0 } : PL.makeSnapshot(d, S.all, mo, '', outlooks());
      rec.assets = Math.round(v.assets); rec.loans = Math.round(v.loans || 0); rec.net = rec.assets - rec.loans; rec.note = v.note || '';
      if (!cur0 && mo < cur && row) rec.classes = PL.scaleClasses(row.values, rec.assets);   // an earlier month: not today's mix
      if (cur0) Object.assign(cur0, rec); else p.snapshots.push(rec);
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
      const p = ensure(d); const rec = PL.makeSnapshot(d, S.all, mo, v.note || '', outlooks());
      const i = p.snapshots.findIndex((x) => x.month === mo); if (i >= 0) p.snapshots[i] = rec; else p.snapshots.push(rec);
      p.snapshots.sort((a, b) => (a.month < b.month ? -1 : 1));
      toast(`${monthLabel(mo)} snapshot saved`);
    }),
  });
}

/** The working behind a month's "invested": what came in, what went out, what was left, and where it went. Same for the plan and for what happened. */
function investTip(r, title, source) {
  return () => {
    const one = (r.items || []).filter((i) => i.kind !== 'income').map((i) => i.name).join(', ');
    const saved = r.left + (r.pfAdd || 0);
    return {
      title,
      rows: [
        { l: 'Salary', v: money(r.salary) }, { l: 'EPF', v: money(r.pfAdd || 0), n: 'goes in before the salary reaches the bank' }, { l: 'Interest income', v: money(r.interest) },
        ...(r.other + (r.oneIn || 0) > 0.5 ? [{ l: 'Other income', v: money(r.other + (r.oneIn || 0)) }] : []),
        { l: 'Loan EMI', v: '−' + money(r.emi) }, { l: 'Everyday spending', v: '−' + money(r.expenses) }, { l: 'One-time items', v: '−' + money(r.oneOut), n: one || null },
        { l: 'Saved this month', v: money(saved), b: true, n: 'salary + EPF + interest − EMI − spending − one-time' },
        { l: 'Went into investments', v: money(r.invested), n: 'new money' }, { l: 'Added to EPF', v: money(r.pfAdd || 0) }, { l: 'Kept in cash', v: money(r.left - r.invested) },
      ],
      foot: source,
    };
  };
}
const tipNode = (build, node) => popover(h('span', null, node), build);

export function render(root) {
  const { data, all } = S;
  const ctx = currentPlan(), { plan, year } = ctx;
  root.append(planPicker());
  if (!plan) { root.append(notLiveCard(ctx, 'this page')); return; }
  const oc = outlooks(), ov = outlookOverride(plan);
  const t = PL.yearTrack(data, all, plan, oc, { outlook: ov });
  const nowM = t.cur, rows = t.rows, planBy = new Map(t.path.map((r) => [r.month, r]));
  const [stLabel, stTone] = STATUS[t.status];
  const lastActual = rows.filter((r) => r.src !== 'projected').pop();

  // ---------- the plan's settings, read only ----------
  root.append(planSettingsCard(plan));

  // ---------- headline ----------
  root.append(h('div', { class: 'stats' },
    stat(`Target as per plan, Dec ${year}`, money(t.target), `from ${money(plan.initial.net)} in January · revision ${plan.rev}`),
    stat('Projected year end', h('span', { class: tone(t.gap) }, money(t.projected)), t.inYear ? `from today’s ${money(t.live.net)}, with the plan’s settings${ov ? ' on the what-if outlook' : ''}` : 'following the plan'),
    stat(t.gap >= 0 ? 'Ahead by' : 'Short by', h('span', { class: tone(t.gap) }, money(Math.abs(t.gap))), h('span', { class: stTone }, stLabel)),
    t.gap < 0 && t.extra > 0 ? stat('Extra to save', money(t.extra) + ' / month', `to reach the planned target, over the ${t.monthsLeft} months left (earn more or spend less)`) : stat('Extra to save', t.gap >= 0 ? 'Nothing' : '–', t.gap >= 0 ? 'you are on course for the planned target' : 'no months left this year')));

  // ---------- outlook what-if ----------
  root.append(section('Market outlook for this plan', outlookWhatIf(plan)));

  // ---------- chart ----------
  const labels = ['Start', ...rows.map((r) => monthLabel(r.month))], n = labels.length;
  const targetS = labels.map((_, i) => Math.round(plan.initial.net + ((t.target - plan.initial.net) * i) / Math.max(1, n - 1)));
  const planS = [plan.initial.net, ...t.path.map((r) => r.nw)];
  const act = Array(n).fill(null); act[0] = plan.initial.net;
  rows.forEach((r, i) => { if (r.src !== 'projected') act[i + 1] = r.nw; });
  const fcS = Array(n).fill(null), ai = lastActual ? rows.indexOf(lastActual) + 1 : 0;
  if (lastActual) { fcS[ai] = lastActual.nw; rows.forEach((r, i) => { if (i + 1 > ai) fcS[i + 1] = r.nw; }); } else rows.forEach((r, i) => { fcS[i + 1] = r.nw; });
  const lo = Math.min(...[...planS, ...act, ...fcS].filter((v) => v != null));
  root.append(section('Net worth: target, plan and what really happened', lineChart({
    labels, fmt: money, yMin: Math.floor((lo * 0.97) / 1e6) * 1e6,
    series: [{ name: 'Target path', values: targetS, dashed: true, color: 2 }, { name: 'Plan', values: planS, color: 1 }, { name: 'Actual (snapshots, then today)', values: act, color: 0 }, { name: 'Projected from actuals', values: fcS, dashed: true, color: 3 }],
  })));

  // ---------- month-end check-in: every month of the year ----------
  const mine = t.snaps.get(nowM), planNow = planBy.has(nowM) ? planBy.get(nowM).nw : null;
  const lines = rows.map((r, i) => { const pr = t.path[i]; return { r, pr, month: r.month, planNw: pr.nw, nw: r.nw, diff: r.nw - pr.nw, status: PL.statusOf(r.nw, pr.nw), proj: r.src === 'projected', missing: !!r.missing, now: r.src === 'now' }; });
  const fromSheet = P.planSheetSnapshots(data, all.asOf).filter((x) => x.month.slice(0, 4) === String(year));
  const it = (x, node) => (x.proj ? h('i', null, node) : node);
  const src = (x) => (x.proj ? 'Projected from the plan’s settings, carried forward from the last real position.' : x.now ? 'Month to date from your bank entries; the month is not over.' : 'From your bank entries and the month-end snapshot.');
  root.append(section(`Month-end check-in · ${monthLabel(nowM, true)}`, h('div', null,
    h('div', { class: 'stats' },
      stat('Net worth today', money(all.netAsset), `as on ${dateStr(all.asOf)}`),
      planNow != null ? stat(`Plan for end of ${monthLabel(nowM)}`, money(planNow), h('span', { class: tone(all.netAsset - planNow) }, `${signed(all.netAsset - planNow)} ${all.netAsset >= planNow ? 'ahead' : 'behind'} so far`)) : stat('This month', year > Number(nowM.slice(0, 4)) ? 'Not started' : 'Finished', year > Number(nowM.slice(0, 4)) ? `plan ${year} begins in January` : `plan ${year} has ended`),
      mine ? stat('Snapshot saved', money(mine.net), mine.note || dateStr(mine.date)) : stat('Snapshot', 'Not saved yet', 'save it on the last day of the month')),
    fromSheet.length && canEdit() ? h('div', { class: 'alert warn' }, h('b', null, `${fromSheet.length} month-end${fromSheet.length === 1 ? '' : 's'} from your Plan sheet ${fromSheet.length === 1 ? 'is' : 'are'} not in this table yet`),
      h('p', null, `${fromSheet.map((x) => monthLabel(x.month).slice(0, 3)).join(', ')}: these were typed into Plan → Month by month. Bring them in as snapshots so they show here. Months that already have a snapshot are not changed.`),
      btn('Bring them in', () => mutate((d) => { const add = P.planSheetSnapshots(d, S.all.asOf); const p = ensure(d); p.snapshots.push(...add); p.snapshots.sort((a, b) => (a.month < b.month ? -1 : 1)); toast(`${add.length} month-end${add.length === 1 ? '' : 's'} brought in`); }), 'small', { keep: true })) : null,
    h('h4', { style: { margin: '14px 0 4px' } }, `Every month end of ${year}`),
    table([
      { label: 'Month end', host: true, render: (x) => h('span', null, x.proj ? h('i', null, monthLabel(x.month)) : monthLabel(x.month), x.now ? h('small', { class: 'now-tag' }, ' now') : null, x.missing && canEdit() ? h('small', { class: 'muted' }, ' · tap to add snapshot') : null) },
      { label: 'Plan: net worth', cls: 'r', get: (x) => money(x.planNw) },
      { label: 'Actual: net worth', mob: 'under', mlabel: 'actual ', cls: 'r', render: (x) => it(x, money(x.nw)) },
      { label: 'Short / ahead by', cls: 'r', render: (x) => it(x, h('span', { class: tone(x.diff) }, signed(x.diff))) },
      { label: 'Plan: invested', cls: 'r', render: (x) => tipNode(investTip(x.pr, `Plan · ${monthLabel(x.month, true)}`, 'What the plan expects for the month.'), h('span', { class: 'inv' }, money(x.pr.invested + (x.pr.pfAdd || 0)))) },
      { label: 'Actual: invested', cls: 'r', render: (x) => it(x, tipNode(investTip(x.r, `${x.proj ? 'Projected' : 'Actual'} · ${monthLabel(x.month, true)}`, src(x)), h('span', { class: 'inv' }, money(x.r.invested + (x.r.pfAdd || 0))))) },
      { label: 'Status', mob: 'under', render: (x) => (x.status ? it(x, h('span', { class: SHORT[x.status] }, x.status + (x.proj ? ' (projected)' : ''))) : h('span', { class: 'muted' }, '–')) },
    ], lines, { rowClass: (x) => (x.month === nowM ? 'cur-row ' : '') + (x.proj ? 'proj-row' : ''), m: { key: 'year-months2', head: 'Month end', mid: 'Status', views: [['Actual: net worth', 'Plan: net worth'], ['Short / ahead by'], ['Actual: invested', 'Plan: invested']],
      sort: [{ value: 'month', label: 'Month', kind: 'date', get: (x) => x.month }, { value: 'diff', label: 'Short / ahead by', kind: 'num', get: (x) => x.diff }, { value: 'nw', label: 'Actual net worth', kind: 'num', get: (x) => x.nw }], sortDefault: { value: 'month', dir: 'asc' } },
    onRow: canEdit() ? (x) => (x.month <= nowM ? snapshotForm(x.month, x.r) : toast('A month-end snapshot is saved on the last day of the month.')) : null }),
    h('details', { class: 'more' }, h('summary', null, 'How to read this'),
      h('p', { class: 'note' }, 'Plain rows are what really happened: net worth from the month-end snapshot (or today’s position for the current month, marked “now”). Italic rows are projected: the plan’s settings carried forward from the last real position, so a month you forgot to snapshot is filled in until you add it.'),
      h('p', { class: 'note' }, 'Plan net worth is recalculated from the plan’s settings and its starting net worth. Short / ahead is actual (or projected) minus plan. Tap the invested figures to see the working: salary + EPF + interest − EMI − spending − one-time items, and where the saving went. Tap a row to type in that month’s snapshot.')),
    canEdit() && year === Number(nowM.slice(0, 4)) ? [btn(mine ? 'Update snapshot' : 'Save snapshot', () => saveSnapshot(nowM), 'primary', { keep: true })] : null)));

  // ---------- the whole year, month by month ----------
  root.append(yearsTable(rows, { title: `Month by month, ${year}`, why: { tds: plan.a.tds ?? 0.1 }, legend: true }), flowSection(rows, { mode: 'month', title: `Income, spending and investing, ${year}` }));

  actual.render(root, plan, t.path);

  // ---------- where it went right or wrong, up to a chosen month ----------
  const cy = Number(nowM.slice(0, 4));
  const upto = year < cy ? rows.map((r) => r.month) : year === cy ? rows.map((r) => r.month).filter((m) => m <= nowM) : [];
  if (upto.length) {
    if (whereYear !== year || !upto.includes(whereMonth)) { whereYear = year; whereMonth = upto[upto.length - 1]; }
    const w = PL.whereWent(plan, t, whereMonth);
    if (w) {
      const list = w.list, grp = (f) => list.filter(f).reduce((a, x) => a + x.diff, 0);
      const market = grp((x) => x.kind === 'market'), fixed = grp((x) => x.kind === 'payout' || x.kind === 'accrual'), cash = grp((x) => x.kind === 'cash');
      const best = list.slice().sort((a, b) => b.diff - a.diff)[0], worst = list.slice().sort((a, b) => a.diff - b.diff)[0];
      const isNow = w.src === 'now', label = isNow ? 'today' : monthLabel(whereMonth);
      const notes = [h('li', null, `Net worth is ${money(Math.abs(w.diff))} ${w.diff >= 0 ? 'ahead of' : 'behind'} the plan for ${monthLabel(whereMonth)}${isNow ? ' (today’s position)' : w.src === 'projected' ? ' (projected: there is no snapshot for that month)' : ''}.`)];
      if (Math.abs(market) > 1) notes.push(h('li', null, `Market-linked assets (shares, ETFs, funds, gold) are ${money(Math.abs(market))} ${market >= 0 ? 'above' : 'below'} what the plan’s outlook expected.`));
      if (Math.abs(fixed) > 1) notes.push(h('li', null, `Fixed income, EPF and chits are ${money(Math.abs(fixed))} ${fixed >= 0 ? 'above' : 'below'} plan.`));
      if (Math.abs(cash) > 1) notes.push(h('li', null, `Cash is ${money(Math.abs(cash))} ${cash >= 0 ? 'higher' : 'lower'} than planned, which reflects saving ${cash >= 0 ? 'more' : 'less'} (or investing ${cash >= 0 ? 'less' : 'more'}) than the plan.`));
      if (worst && worst.diff < -1) notes.push(h('li', null, `Biggest shortfall: ${worst.label} (${signed(worst.diff)}).`));
      if (best && best.diff > 1) notes.push(h('li', null, `Biggest gain over plan: ${best.label} (${signed(best.diff)}).`));
      const pick = h('select', { 'aria-label': 'Compare up to', class: 'month-select', onchange: (e) => { whereMonth = e.target.value; rerender(); } }, upto.slice().reverse().map((m) => { const r = rows.find((x) => x.month === m); return h('option', { value: m, selected: m === whereMonth }, r.src === 'now' ? `Till today (${monthLabel(m)} so far)` : `Till end of ${monthLabel(m, true)}${r.src === 'projected' ? ' · projected' : ''}`); }));
      root.append(section(`Where it went right or wrong, up to ${label}`, h('div', null,
        h('div', { class: 'filters' }, h('label', null, 'Compare up to ', pick)),
        h('ul', { class: 'findings' }, notes),
        table([
          { label: 'Asset class', host: true, get: (x) => x.label },
          { label: 'Planned change', mob: 'under', mlabel: 'plan ', cls: 'r', get: (x) => signed(x.plan) },
          { label: 'Actual change', mob: 'under', mlabel: 'actual ', cls: 'r', get: (x) => signed(x.actual) },
          { label: 'Difference', cls: 'r', render: (x) => h('span', { class: tone(x.diff) }, signed(x.diff)) },
        ], list.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)), { footer: { label: 'Net worth' }, m: { key: 'year-where', head: 'Asset class', views: [['Difference', 'Actual change'], ['Planned change']] } }),
        h('p', { class: 'note' }, 'Change since the plan’s starting net worth, per asset class. Months before today use the month-end snapshot. Cash absorbs the difference between what you saved and what you invested, so read it together with the rest.'))));
    }
  }
}
