// Wealth projector → Years ahead: where you could stand in 5 to 25 years, from salary growth, expenses, new investments and returns.
import { S, mutate } from '../store.js';
import * as P from '../projector.js';
import { h, money, compact, pct, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, setOptions } from '../ui.js';
import { lineChart, donut, legend } from '../charts.js';
import { rerender, outlooks, ensure, signed, pc, tone, outlookToggle, outlookSelects } from './proj-shared.js';
import { currentPlan } from './proj-year.js';

let compare = false, viewHorizon = null;
const frac = (x) => (x == null || x === '' ? 0 : Number(x) / 100);
const pctIn = (x) => (x == null || x === '' ? '' : Math.round(x * 10000) / 100);

/** Assumptions for the long view: the plan's rates, investments and recurring items, plus the growth settings stored here. */
export function aheadSetup() {
  const { plan } = currentPlan();
  const base = plan ? plan.a : P.defaults(S.data, S.all);
  const own = (S.data.projector && S.data.projector.ahead) || {};
  const hike = (S.data.proj && S.data.proj.longTerm && S.data.proj.longTerm.hike) ?? 0.06;
  const a = {
    ...base,
    salary: own.salary ?? base.salary, otherIncome: own.otherIncome ?? base.otherIncome, expenses: own.expenses ?? base.expenses, emi: own.emi ?? base.emi, pfAdd: own.pfAdd ?? base.pfAdd,
    growth: { salary: own.growthSalary ?? hike, expenses: own.growthExpenses ?? 0.06, invest: own.growthInvest ?? 0.05 },
    outlook: { ...(own.outlook || base.outlook) },
    oneOffs: (base.oneOffs || []).filter((o) => o.month.length === 2),
    invest: (base.invest || []).map((l) => ({ ...l, from: '', to: '' })),
    loanPrincipal: 0,
  };
  return { a, horizon: viewHorizon || own.horizon || 10, target: own.target || null, plan, own };
}

function setupForm(s) {
  const { a } = s;
  formDialog({
    title: 'Years ahead: assumptions', saveLabel: 'Save',
    value: { salary: a.salary, otherIncome: a.otherIncome, expenses: a.expenses, emi: a.emi, pfAdd: a.pfAdd, growthSalary: pctIn(a.growth.salary), growthExpenses: pctIn(a.growth.expenses), growthInvest: pctIn(a.growth.invest), target: s.target || '' },
    fields: [
      { key: 'salary', label: 'Salary each month today (₹)', type: 'number', half: true }, { key: 'growthSalary', label: 'Salary raise each year (%)', type: 'number', half: true, hint: 'Also applied to other income.' },
      { key: 'otherIncome', label: 'Other income each month (₹)', type: 'number' },
      { key: 'expenses', label: 'Everyday expenses each month today (₹)', type: 'number', half: true }, { key: 'growthExpenses', label: 'Expenses rise each year (%)', type: 'number', half: true, hint: 'Inflation and lifestyle.' },
      { key: 'emi', label: 'Loan EMI each month (₹)', type: 'number', half: true }, { key: 'pfAdd', label: 'Added to EPF each month (₹)', type: 'number', half: true },
      { key: 'growthInvest', label: 'Planned investments grow each year by (%)', type: 'number', hint: 'Your monthly investments from the This year plan, raised by this much each year.' },
      { key: 'target', label: 'Net worth I want at the end (₹, optional)', type: 'number' },
    ],
    onSave: (v) => mutate((d) => {
      const p = ensure(d);
      p.ahead = { ...(p.ahead || {}), salary: v.salary || 0, otherIncome: v.otherIncome || 0, expenses: v.expenses || 0, emi: v.emi || 0, pfAdd: v.pfAdd || 0, growthSalary: frac(v.growthSalary), growthExpenses: frac(v.growthExpenses), growthInvest: frac(v.growthInvest), target: v.target || null };
    }),
  });
}
const setOwn = (patch) => mutate((d) => { const p = ensure(d); p.ahead = { ...(p.ahead || {}), ...patch }; });

export function render(root) {
  const { data, all } = S;
  const s = aheadSetup();
  const oc = outlooks();
  const b = P.baseline(data, all);
  const start = { values: b.values, liab: b.liab, month: b.month };
  const months = s.horizon * 12;
  const rows = P.simulate(start, s.a, oc, months);
  const yearRows = Array.from({ length: s.horizon }, (_, i) => rows[i * 12 + 11]);
  const end = rows[rows.length - 1];
  const year0 = (r) => monthLabel(r.month);

  // ---------- controls ----------
  const hz = h('select', { 'aria-label': 'Years to look ahead', onchange: (e) => { viewHorizon = +e.target.value; if (canEdit()) setOwn({ horizon: viewHorizon }); else rerender(); } }, [5, 10, 15, 20, 25].map((n) => h('option', { value: n, selected: n === s.horizon }, `${n} years`)));
  root.append(h('div', { class: 'filters' }, h('label', null, 'Look ahead ', hz), h('label', { class: 'check-inline' }, h('input', { type: 'checkbox', checked: compare, onchange: (e) => { compare = e.target.checked; rerender(); } }), ' Compare all outlooks')));
  root.append(section('Market outlook for the years ahead', h('div', null,
    outlookToggle(s.a.outlook, (id) => canEdit() && setOwn({ outlook: Object.fromEntries(P.MARKET.map((k) => [k, id])) }), { disabled: !canEdit() }),
    h('details', { class: 'more' }, h('summary', null, 'Set each market class separately'), outlookSelects(s.a.outlook, (k, id) => canEdit() && setOwn({ outlook: { ...s.a.outlook, [k]: id } }))),
    h('p', { class: 'note' }, 'Applies to shares, ETFs, funds and gold, today’s holdings and new money alike. Over many years, a steady outlook matters far more than any single year.'))));

  // ---------- numbers ----------
  const expOut = end.expenses + end.emi;
  const cover = expOut > 0 ? end.interest / expOut : null;
  const hit = s.target ? rows.find((r) => r.nw >= s.target) : null;
  const need = s.target && !hit ? P.extraMonthly(start, s.a, oc, months, s.target) : 0;
  root.append(h('div', { class: 'stats' },
    stat(`Net worth in ${s.horizon} years`, money(end.nw), `${monthLabel(end.month)}, from ${money(b.net)} today`),
    stat('Interest income each month then', money(end.interest), cover != null ? `pays ${Math.round(cover * 100)}% of the ${money(expOut)} monthly spending` : ''),
    s.target ? (hit ? stat('Target reached', monthLabel(hit.month), `${money(s.target)} · ${Math.round((rows.indexOf(hit) + 1) / 12 * 10) / 10} years`) : stat('Target not reached', h('span', { class: 'neg' }, `${money(s.target - end.nw)} short`), need > 0 ? `save ${money(need)} more a month (earn more or spend less) to get there` : 'in this time')) : stat('Target', 'Not set', 'add one in the assumptions'),
    stat('Saved each year at the end', money(yearRows[yearRows.length - 1] ? (byYearFlows(rows, s.horizon - 1)) : 0), 'income minus spending, before new investments')));

  // ---------- chart ----------
  const labels = [monthLabel(b.month), ...yearRows.map(year0)];
  const line = (rr) => [b.net, ...rr.map((r, i) => (r ? r.nw : null))];
  const series = [];
  if (compare) {
    const sc = P.scenarios(start, s.a, oc, months);
    sc.forEach((x, i) => series.push({ name: `${x.outlook.name} (${pc(x.outlook.rate, 0)})`, values: [b.net, ...Array.from({ length: s.horizon }, (_, k) => x.rows[k * 12 + 11].nw)], color: i }));
  } else series.push({ name: 'Net worth', values: line(yearRows), color: 0 });
  if (s.target) series.push({ name: 'Target', values: labels.map(() => s.target), dashed: true, color: 7 });
  root.append(section('Net worth over the years', lineChart({ labels, fmt: money, yMin: 0, series, area: !compare })));

  // ---------- composition at the end ----------
  const v = end.values;
  const grp = [['Cash', v.cash || 0], ['Fixed income (bonds, lending, FDs, chits, insurance)', (v.bonds || 0) + (v.lending || 0) + (v.fds || 0) + (v.chits || 0) + (v.lic || 0) + (v.other || 0)], ['EPF & PPF', v.pf || 0], ['Shares, ETFs and funds', (v.shares || 0) + (v.etfs || 0) + (v.funds || 0)], ['Gold', v.gold || 0]].filter((x) => x[1] > 1).map(([label, value]) => ({ label, value }));
  const nowGrp = [['Cash', b.values.cash || 0], ['Fixed income (bonds, lending, FDs, chits, insurance)', (b.values.bonds || 0) + (b.values.lending || 0) + (b.values.fds || 0) + (b.values.chits || 0) + (b.values.lic || 0) + (b.values.other || 0)], ['EPF & PPF', b.values.pf || 0], ['Shares, ETFs and funds', (b.values.shares || 0) + (b.values.etfs || 0) + (b.values.funds || 0)], ['Gold', b.values.gold || 0]].filter((x) => x[1] > 1).map(([label, value]) => ({ label, value }));
  root.append(h('div', { class: 'grid2' },
    section('What you hold today', h('div', null, donut(nowGrp, { fmt: money, center: compact(b.net + b.liab), sub: 'assets', size: 190 }), legend(nowGrp, { fmt: money }))),
    section(`What you could hold in ${s.horizon} years`, h('div', null, donut(grp, { fmt: money, center: compact(end.assets), sub: 'assets', size: 190 }), legend(grp, { fmt: money })))));

  // ---------- by class: today, this year end, horizon ----------
  const yEnd = rows.find((r) => r.month === `${String(b.month).slice(0, 4)}-12`) || rows[0];
  const plan0 = (s.a.invest || []).reduce((t, l) => t + (l.monthly || 0), 0);
  const cr = P.CLASSES.map((c) => ({ key: c.key, label: c.label, now: b.values[c.key] || 0, yr: (yEnd && yEnd.values[c.key]) || 0, far: (end.values[c.key]) || 0 })).filter((x) => x.now > 1 || x.yr > 1 || x.far > 1);
  const share = (v, tot) => (tot > 0 ? Math.round((v / tot) * 100) + '%' : '');
  const tNow = cr.reduce((a, x) => a + x.now, 0), tYr = cr.reduce((a, x) => a + x.yr, 0), tFar = cr.reduce((a, x) => a + x.far, 0);
  root.append(section('Where it sits: today, this year end, and later', h('div', null,
    table([
      { label: 'Asset', host: true, get: (x) => x.label },
      { label: 'Today', mob: 'under', mlabel: 'today ', cls: 'r', get: (x) => money(x.now), total: () => money(tNow) },
      { label: 'Share today', mob: 'hide', cls: 'r', get: (x) => share(x.now, tNow) },
      { label: `End of ${String(yEnd.month).slice(0, 4)}`, cls: 'r', get: (x) => money(x.yr), total: () => money(tYr) },
      { label: 'Share', mob: 'hide', cls: 'r', get: (x) => share(x.yr, tYr) },
      { label: `In ${s.horizon} years`, cls: 'r', get: (x) => money(x.far), total: () => money(tFar) },
      { label: 'Share ', mob: 'hide', cls: 'r', get: (x) => share(x.far, tFar) },
    ], cr, { footer: { label: 'Total assets' }, empty: 'Nothing to show.' }),
    h('p', { class: 'note' }, plan0 ? `Today’s holdings plus the ${money(plan0)} a month of new money from your plan, grown at the rates and outlook above. Cash is what is left after spending and investing.` : 'No new money is planned, so only growth of what you hold today is shown.'))));

  // ---------- table ----------
  const tbl = yearRows.map((r, i) => ({ r, i, flow: byYearFlows(rows, i) }));
  root.append(section('Year by year', h('div', null,
    table([
      { label: 'Year ending', host: true, get: (x) => year0(x.r) },
      { label: 'Net worth', cls: 'r', get: (x) => money(x.r.nw) },
      { label: 'Saved that year', mob: 'under', mlabel: 'saved ', cls: 'r', get: (x) => money(x.flow) },
      { label: 'Interest / month', mob: 'under', mlabel: 'interest ', cls: 'r', get: (x) => money(x.r.interest) },
      { label: 'Market-linked', mob: 'hide', cls: 'r', get: (x) => money(x.r.market) },
      { label: 'Monthly spending', mob: 'hide', cls: 'r', get: (x) => money(x.r.expenses + x.r.emi) },
      { label: 'Interest covers spending', mob: 'under', mlabel: 'covers ', cls: 'r', get: (x) => { const sp = x.r.expenses + x.r.emi; return sp ? Math.round((x.r.interest / sp) * 100) + '%' : '–'; } },
    ], tbl, { empty: 'Nothing to show.' }),
    h('p', { class: 'note' }, 'Interest income is what bonds and lending pay out each month after tax. When it covers your monthly spending, your investments pay your living costs without selling anything. Saved that year = income − spending, before moving money into investments.')),
    canEdit() ? [btn('Edit assumptions', () => setupForm(s), 'primary', { keep: true })] : null));
  root.append(h('p', { class: 'note' }, s.plan ? `Investments, interest rates and recurring costs come from your ${s.plan.year} plan (This year tab). Change them there.` : 'No plan yet: investments and rates come from your recent history. Create a plan on the This year tab to set them.'));
}
/** Income minus spending (before new investments) in the i-th year of the run. */
function byYearFlows(rows, i) { let t = 0; for (const r of rows.slice(i * 12, i * 12 + 12)) t += r.income - r.out; return t; }
