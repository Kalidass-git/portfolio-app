// Wealth outlook → Years ahead: where you could stand in 5 to 25 years, from salary growth, expenses, new investments and returns.
import { S, mutate } from '../store.js';
import * as P from '../projector.js';
import { h, money, compact, pct, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, setOptions } from '../ui.js';
import { lineChart, donut, legend, stackedArea, color } from '../charts.js';
import { rerender, outlooks, ensure, signed, pc, tone, outlookToggle, outlookSelects } from './proj-shared.js';
import { currentPlan } from './proj-year.js';
import { groupedTable, groupOfClass, GROUPS } from './groupmix.js';

const yrs = (n) => (n === 1 ? '1 year' : n + ' years');
let compare = false, viewHorizon = null, netView = 'net', catPick = 'all';
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
  const hz = h('select', { 'aria-label': 'Years to look ahead', onchange: (e) => { viewHorizon = +e.target.value; if (canEdit()) setOwn({ horizon: viewHorizon }); else rerender(); } }, [1, 2, 3, 4, 5, 7, 10, 15, 20, 25].map((n) => h('option', { value: n, selected: n === s.horizon }, yrs(n))));
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
    stat(`Net worth in ${yrs(s.horizon)}`, money(end.nw), `${monthLabel(end.month)}, from ${money(b.net)} today`),
    stat('Interest income each month then', money(end.interest), cover != null ? `pays ${Math.round(cover * 100)}% of the ${money(expOut)} monthly spending` : ''),
    s.target ? (hit ? stat('Target reached', monthLabel(hit.month), `${money(s.target)} · ${Math.round((rows.indexOf(hit) + 1) / 12 * 10) / 10} years`) : stat('Target not reached', h('span', { class: 'neg' }, `${money(s.target - end.nw)} short`), need > 0 ? `save ${money(need)} more a month (earn more or spend less) to get there` : 'in this time')) : stat('Target', 'Not set', 'add one in the assumptions'),
    stat('Saved each year at the end', money(yearRows[yearRows.length - 1] ? (byYearFlows(rows, s.horizon - 1)) : 0), 'income minus spending, before new investments')));

  // ---------- chart ----------
  const monthly = s.horizon <= 2, pts = monthly ? rows : yearRows, stepK = monthly ? 1 : 12;   // a short look-ahead is drawn month by month
  const labels = [monthLabel(b.month), ...pts.map(year0)];
  const line = (rr) => [b.net, ...rr.map((r, i) => (r ? r.nw : null))];
  const series = [];
  if (compare) {
    const sc = P.scenarios(start, s.a, oc, months);
    sc.forEach((x, i) => series.push({ name: `${x.outlook.name} (${pc(x.outlook.rate, 0)})`, values: [b.net, ...Array.from({ length: pts.length }, (_, k) => x.rows[k * stepK + stepK - 1].nw)], color: i }));
  } else series.push({ name: 'Net worth', values: line(pts), color: 0 });
  if (s.target) series.push({ name: 'Target', values: labels.map(() => s.target), dashed: true, color: 7 });
  // by category: debts, gold, equity and others, each in its own colour
  const sumGroup = (vals, gid) => P.CLASSES.filter((c) => groupOfClass(c.key) === gid).reduce((a, c) => a + ((vals && vals[c.key]) || 0), 0);
  const catSeries = GROUPS.map((g, gi) => ({ id: g.id, name: g.label, color: gi, values: [sumGroup(b.values, g.id), ...pts.map((r) => (r ? sumGroup(r.values, g.id) : null))] })).filter((x) => x.values.some((v) => v > 1));
  const growth = catSeries.map((x) => { const a = x.values[0], z = x.values[x.values.length - 1]; return { ...x, now: a, far: z, change: z - a, mult: a > 1 ? z / a : null, cagr: a > 1 && s.horizon ? Math.pow(z / a, 1 / s.horizon) - 1 : null }; });
  if (catPick !== 'all' && !catSeries.some((x) => x.id === catPick)) catPick = 'all';
  const tabs = h('nav', { class: 'seg slim', 'aria-label': 'Chart view' }, [['net', 'Net worth'], ['cats', 'By category']].map(([k, l]) => h('a', { href: '#', class: netView === k ? 'on' : '', onclick: (e) => { e.preventDefault(); netView = k; rerender(); } }, l)));
  let netBody;
  if (netView === 'net' || !catSeries.length) netBody = lineChart({ labels, fmt: money, yMin: 0, series, area: !compare });
  else {
    const chips = h('div', { class: 'chips' }, [{ id: 'all', name: 'All together' }, ...catSeries].map((x) => h('button', { type: 'button', class: 'chip-btn' + (catPick === x.id ? ' on' : ''), onclick: () => { catPick = x.id; rerender(); } }, x.id !== 'all' ? [h('i', { class: 'gdot', style: { background: color(x.color) } }), x.name] : x.name)));
    const shown = catPick === 'all' ? catSeries : catSeries.filter((x) => x.id === catPick);
    const fastest = growth.filter((x) => x.cagr != null).sort((a, b) => b.cagr - a.cagr);
    netBody = h('div', null, chips, stackedArea({ labels, fmt: money, series: shown, height: 250 }),
      table([
        { label: 'Category', host: true, render: (x) => h('span', null, h('i', { class: 'gdot', style: { background: color(x.color) } }), x.name, fastest[0] && fastest[0].id === x.id && fastest.length > 1 ? h('small', { class: 'now-tag' }, ' fastest') : null) },
        { label: 'Today', cls: 'r', get: (x) => money(x.now) },
        { label: `In ${yrs(s.horizon)}`, cls: 'r', get: (x) => money(x.far) },
        { label: 'Grows by', cls: 'r', mob: 'under', mlabel: '', render: (x) => h('span', { class: x.change >= 0 ? 'pos' : 'neg' }, (x.change >= 0 ? '+' : '−') + money(Math.abs(x.change))) },
        { label: 'Times', cls: 'r', mob: 'hide', get: (x) => (x.mult == null ? '–' : x.mult.toFixed(2) + '×') },
        { label: 'Yearly growth', cls: 'r', mob: 'under', mlabel: 'per year ', get: (x) => (x.cagr == null ? '–' : pct(x.cagr, 1)) },
      ], growth.slice().sort((a, b) => (b.cagr ?? -9) - (a.cagr ?? -9)), {}),
      h('p', { class: 'note' }, 'Assets only (loans are left out). Growth includes the new money you add to each category as well as returns, so a category can grow fast simply because you keep feeding it. Yearly growth is the compound rate from today to the end of the period.'));
  }
  root.append(section('Net worth over the years', h('div', null, tabs, netBody)));

  // ---------- composition at the end ----------
  const v = end.values;
  const grp = [['Cash', v.cash || 0], ['Fixed income (bonds, lending, FDs, chits, insurance)', (v.bonds || 0) + (v.lending || 0) + (v.fds || 0) + (v.chits || 0) + (v.lic || 0) + (v.other || 0)], ['EPF & PPF', v.pf || 0], ['Shares, ETFs and funds', (v.shares || 0) + (v.etfs || 0) + (v.funds || 0)], ['Gold', v.gold || 0]].filter((x) => x[1] > 1).map(([label, value]) => ({ label, value }));
  const nowGrp = [['Cash', b.values.cash || 0], ['Fixed income (bonds, lending, FDs, chits, insurance)', (b.values.bonds || 0) + (b.values.lending || 0) + (b.values.fds || 0) + (b.values.chits || 0) + (b.values.lic || 0) + (b.values.other || 0)], ['EPF & PPF', b.values.pf || 0], ['Shares, ETFs and funds', (b.values.shares || 0) + (b.values.etfs || 0) + (b.values.funds || 0)], ['Gold', b.values.gold || 0]].filter((x) => x[1] > 1).map(([label, value]) => ({ label, value }));
  root.append(h('div', { class: 'grid2' },
    section('What you hold today', h('div', null, donut(nowGrp, { fmt: money, center: compact(b.net + b.liab), sub: 'assets', size: 190 }), legend(nowGrp, { fmt: money }))),
    section(`What you could hold in ${yrs(s.horizon)}`, h('div', null, donut(grp, { fmt: money, center: compact(end.assets), sub: 'assets', size: 190 }), legend(grp, { fmt: money })))));

  // ---------- by class: today, this year end, horizon ----------
  const yEnd = rows.find((r) => r.month === `${String(b.month).slice(0, 4)}-12`) || rows[0];
  const plan0 = (s.a.invest || []).reduce((t, l) => t + (l.monthly || 0), 0);
  const cr = P.CLASSES.map((c) => ({ key: c.key, label: c.label, now: b.values[c.key] || 0, yr: (yEnd && yEnd.values[c.key]) || 0, far: (end.values[c.key]) || 0 })).filter((x) => x.now > 1 || x.yr > 1 || x.far > 1);
  const sumOf = (it, k) => it.reduce((a, x) => a + x[k], 0);
  const share = (v, tot) => (tot > 0 ? Math.round((v / tot) * 100) + '%' : '');
  const tNow = cr.reduce((a, x) => a + x.now, 0), tYr = cr.reduce((a, x) => a + x.yr, 0), tFar = cr.reduce((a, x) => a + x.far, 0);
  root.append(section('Where it sits: today, this year end, and later', h('div', null,
    cr.length ? groupedTable({
      rows: cr, groupOf: (x) => groupOfClass(x.key), footerLabel: 'Total assets',
      cols: [
        { label: 'Asset' },
        { label: 'Today', cls: 'r', parent: (it) => money(sumOf(it, 'now')), child: (x) => money(x.now), total: () => money(tNow) },
        { label: 'Share today', cls: 'r', hide: true, parent: (it) => share(sumOf(it, 'now'), tNow), child: (x) => share(x.now, tNow) },
        { label: `End of ${String(yEnd.month).slice(0, 4)}`, cls: 'r', parent: (it) => money(sumOf(it, 'yr')), child: (x) => money(x.yr), total: () => money(tYr) },
        { label: 'Share', cls: 'r', hide: true, parent: (it) => share(sumOf(it, 'yr'), tYr), child: (x) => share(x.yr, tYr) },
        { label: `In ${yrs(s.horizon)}`, cls: 'r', parent: (it) => money(sumOf(it, 'far')), child: (x) => money(x.far), total: () => money(tFar) },
        { label: 'Share ', cls: 'r', hide: true, parent: (it) => share(sumOf(it, 'far'), tFar), child: (x) => share(x.far, tFar) },
      ],
    }) : h('p', { class: 'empty' }, 'Nothing to show.'),
    h('p', { class: 'note' }, plan0 ? `Today’s holdings plus the ${money(plan0)} a month of new money from your plan, grown at the rates and outlook above. Cash is what is left after spending and investing.` : 'No new money is planned, so only growth of what you hold today is shown.'))));

  // ---------- interest income: how it grows ----------
  const debtSum = (r) => P.CLASSES.filter((c) => c.kind === 'payout' || c.kind === 'accrual').reduce((a, c) => a + ((r.values && r.values[c.key]) || 0), 0);
  const perDay = (r) => ((r.interest || 0) + (r.accrual || 0)) * 12 / 365;
  const iy = yearRows.map((r, i) => { const yr = rows.slice(i * 12, i * 12 + 12); return { r, paid: yr.reduce((a, x) => a + x.interest, 0), added: yr.reduce((a, x) => a + (x.accrual || 0), 0) }; });
  const first = rows[0];
  root.append(section('Interest income: how it grows', h('div', null,
    h('div', { class: 'stats' },
      stat('Interest each month now', h('span', { class: 'pos' }, money(first ? first.interest : 0)), `paid out by bonds and lending, after tax · ${money(first ? perDay(first) : 0)} a day with compounding`),
      stat(`Interest each month in ${yrs(s.horizon)}`, h('span', { class: 'pos' }, money(end.interest)), `${money(perDay(end))} a day credited · debt investments ${compact(debtSum(end))}`)),
    lineChart({ labels: yearRows.map(year0), fmt: money, yMin: 0, series: [{ name: 'Interest paid out each month', values: yearRows.map((r) => r.interest), color: 2 }, { name: 'Interest added to deposits, EPF and chits each month', values: yearRows.map((r) => r.accrual || 0), color: 4 }] }),
    table([
      { label: 'Year ending', host: true, get: (x) => year0(x.r) },
      { label: 'Debt investments', cls: 'r', get: (x) => money(debtSum(x.r)) },
      { label: 'Interest / month', key: true, cls: 'r', render: (x) => h('span', { class: 'pos' }, money(x.r.interest)) },
      { label: 'Credit / day', key: true, cls: 'r', render: (x) => h('span', { class: 'pos' }, money(perDay(x.r))) },
      { label: 'Paid out that year', mob: 'under', mlabel: 'paid out ', cls: 'r', get: (x) => money(x.paid) },
      { label: 'Added to balances that year', mob: 'under', mlabel: 'added ', cls: 'r', get: (x) => money(x.added) },
    ], iy, { empty: 'Nothing to show.' }),
    h('p', { class: 'note' }, 'Debt investments are bonds, private lending, FDs, EPF and PPF, chits, insurance and recurring deposits at that year end, growing with new money and their own rates. Paid out is cash from bonds and lending after tax; added to balances is interest that compounds inside deposits, EPF and chits. Credit a day counts both.'))));

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
