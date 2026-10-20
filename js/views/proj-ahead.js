// Wealth outlook → Years ahead: where you could stand in 5 to 25 years, from salary growth, expenses, new investments and returns.
import { S, mutate } from '../store.js';
import * as P from '../projector.js';
import { h, money, compact, pct, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, setOptions, dialog } from '../ui.js';
import { lineChart, donut, legend, stackedArea, color } from '../charts.js';
import { rerender, outlooks, ensure, signed, pc, tone, outlookToggle, outlookSelects } from './proj-shared.js';
import { currentPlan } from './proj-year.js';
import { groupedTable, groupOfClass, GROUPS } from './groupmix.js';
import { flowSection, yearsTable } from './proj-flow.js';

const yrs = (n) => (n === 1 ? '1 year' : n + ' years');
let compare = false, viewHorizon = null, netView = 'net', catPick = 'all';
const frac = (x) => (x == null || x === '' ? 0 : Number(x) / 100);
const pctIn = (x) => (x == null || x === '' ? '' : Math.round(x * 10000) / 100);

/** The one-time bills that come round every year: the ones you saved here, else the yearly ones in this year's plan. Month is 'MM'. */
const yearlyItems = (own, base) => (own.oneOffs ? own.oneOffs : (base.oneOffs || []).filter((o) => o.month.length === 2)).map((o) => ({ ...o }));
const nextItemId = (list) => 'y' + (Math.max(0, ...list.map((x) => Number(String(x.id).replace(/\D/g, '')) || 0)) + 1);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Assumptions for the long view: the plan's rates, investments and recurring items, plus the growth settings stored here. */
export function aheadSetup() {
  const { plan } = currentPlan();
  const base = plan ? plan.a : P.defaults(S.data, S.all);
  const own = (S.data.projector && S.data.projector.ahead) || {};
  const a = {
    ...base,
    salary: own.salary ?? base.salary, otherIncome: own.otherIncome ?? base.otherIncome, expenses: own.expenses ?? base.expenses, emi: own.emi ?? base.emi, pfAdd: own.pfAdd ?? base.pfAdd,
    growth: { salary: own.growthSalary ?? 0.06, expenses: own.growthExpenses ?? 0.06, oneTime: own.growthOneTime ?? own.growthExpenses ?? 0.06, invest: 0 },
    hikeMonth: own.hikeMonth ?? 3,
    outlook: { ...(own.outlook || base.outlook) },
    oneOffs: yearlyItems(own, base),
    invest: (base.invest || []).map((l) => ({ ...l, from: '', to: '' })),
    loanPrincipal: 0,
  };
  return { a, horizon: viewHorizon || own.horizon || 10, target: own.target || null, plan, own };
}

/** Every assumption of the long view, in one card: income, spending, saving and the market. Each field saves as soon as it is changed. */
function assumptionsCard(s) {
  const { a } = s;
  const num = (label, name, value, hint, { pctField = false, step = 'any' } = {}) => h('label', null, h('span', null, label),
    h('input', { type: 'number', step, inputmode: 'decimal', value: value === '' || value == null ? '' : String(value), disabled: !canEdit(), 'aria-label': label,
      onchange: (e) => { const n = e.target.value === '' ? 0 : Number(e.target.value); if (Number.isFinite(n)) setOwn({ [name]: pctField ? n / 100 : n }); } }), hint ? h('small', null, hint) : null);
  const group = (title, ...fields) => h('div', { class: 'assume-group' }, h('h4', null, title), h('div', { class: 'assume-fields' }, ...fields));
  const hike = h('label', null, h('span', null, 'Month the raise lands'),
    h('select', { disabled: !canEdit(), 'aria-label': 'Month the raise lands', onchange: (e) => setOwn({ hikeMonth: Number(e.target.value) }) }, MONTH_NAMES.map((m, i) => h('option', { value: i + 1, selected: i + 1 === a.hikeMonth }, m))),
    h('small', null, 'Salary and EMI step up together from this month'));
    return section('What the projection grows by', h('div', { class: 'assume' },
    group('Income',
      num('Salary each month today (₹)', 'salary', a.salary, 'take-home, to your bank'),
      num('Other income each month (₹)', 'otherIncome', a.otherIncome, 'rent, dividends and so on'),
      num('Salary raise each year (%)', 'growthSalary', pctIn(a.growth.salary), 'also raises other income and EMI', { pctField: true }), hike),
    group('Spending',
      num('Everyday expenses each month today (₹)', 'expenses', a.expenses, 'without EMI and one-time bills'),
      num('Expenses rise each year (%)', 'growthExpenses', pctIn(a.growth.expenses), 'each January', { pctField: true }),
      num('Loan EMI each month today (₹)', 'emi', a.emi, 'rises with the salary raise'),
      num('One-time bills rise each year (%)', 'growthOneTime', pctIn(a.growth.oneTime), 'tax, fees, trips (set below)', { pctField: true })),
    group('Saving',
      num('Added to EPF each month (₹)', 'pfAdd', a.pfAdd, 'goes in before salary reaches the bank'),
      num('Net worth I want at the end (₹, optional)', 'target', s.target || '', 'shows whether you get there')),
    group('Markets',
      outlookToggle(s.a.outlook, (id) => canEdit() && setOwn({ outlook: Object.fromEntries(P.MARKET.map((k) => [k, id])) }), { disabled: !canEdit() }),
      h('details', { class: 'more' }, h('summary', null, 'Set each market class separately'), outlookSelects(s.a.outlook, (k, id) => canEdit() && setOwn({ outlook: { ...s.a.outlook, [k]: id } }))),
      h('small', { class: 'muted' }, 'Shares, ETFs, funds and gold. Bonds and lending pay interest on what you hold and put in; deposits, EPF and chits grow at their own rates.')),
    h('p', { class: 'note' }, 'New money is not a fixed figure. Each month the projection invests whatever is left after spending, EMI and one-time bills, split by the shares in your plan. A month with tax or school fees leaves little or nothing; if cash dipped, it is topped up to today’s level before investing again. Everything below follows these settings.')));
}

function yearlyItemForm(s, it) {
  const isNew = !it, list = s.a.oneOffs.map((o) => ({ ...o }));
  formDialog({
    title: isNew ? 'Add a yearly one-time item' : 'Edit ' + it.name, saveLabel: isNew ? 'Add' : 'Save', deleteMessage: 'Remove this yearly item?',
    value: it ? { name: it.name, kind: it.kind || 'expense', month: it.month, amount: it.amount } : { kind: 'expense', month: '04' },
    fields: [
      { key: 'name', label: 'What', required: true, hint: 'Tax, school fees, vacation, insurance, a function, a bonus…' },
      { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Money going out' }, { value: 'income', label: 'Money coming in' }], half: true },
      { key: 'month', label: 'Paid in', type: 'select', options: MONTH_NAMES.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m })), half: true },
      { key: 'amount', label: 'Amount at today’s prices (₹)', type: 'number', required: true, hint: 'It goes up each year by the expense rise.' },
    ],
    onSave: (v) => { const rec = { name: v.name, kind: v.kind, month: v.month, amount: v.amount }; if (isNew) list.push({ id: nextItemId(list), ...rec }); else Object.assign(list.find((x) => x.id === it.id), rec); setOwn({ oneOffs: list }); },
    onDelete: isNew ? null : () => setOwn({ oneOffs: list.filter((x) => x.id !== it.id) }),
  });
}
/** Offer the one-time bills found in the last year of bank entries. */
function suggestDialog(s) {
  const found = P.suggestOneOffs(S.data, S.all);
  if (!found.length) return toast('No one-time bills found in the last 12 months of bank entries.');
  const rows = found.map((f) => ({ f, el: h('input', { type: 'checkbox', checked: true }) }));
  dialog('One-time bills from the last 12 months', h('div', null, h('p', { class: 'note' }, 'These were paid from your bank in the last year, in categories marked one-time (and tax). Tick the ones that come round every year. Each is added as a yearly item at what you paid.'),
    h('div', null, rows.map((x) => h('label', { class: 'check-inline', style: { display: 'block', padding: '3px 0' } }, x.el, ` ${x.f.name}, ${MONTH_NAMES[Number(x.f.month) - 1]} · ${money(x.f.amount)}`)))),
    [{ label: 'Add the ticked ones', class: 'primary', onclick: (c) => { const list = s.a.oneOffs.map((o) => ({ ...o })); for (const x of rows) if (x.el.checked) list.push({ id: nextItemId(list), name: x.f.name, kind: 'expense', month: x.f.month, amount: x.f.amount }); setOwn({ oneOffs: list }); c(); } }, { label: 'Cancel', onclick: (c) => c() }]);
}
function yearlyCard(s) {
  const list = s.a.oneOffs.slice().sort((x, y) => (x.month < y.month ? -1 : 1));
  const out = list.filter((o) => o.kind !== 'income');
  const total = out.reduce((a, o) => a + (o.amount || 0), 0);
  const names = [...new Set(out.map((o) => o.name))].slice(0, 4).join(', ');
  const det = h('details', { class: 'more' },
    h('summary', { style: { cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' } },
      h('b', null, list.length ? `${list.length} yearly ${list.length === 1 ? 'item' : 'items'}` : 'None yet'), list.length ? h('span', { class: 'exp' }, `−${money(total)} a year at today’s prices`) : null, names ? h('small', { class: 'muted' }, names) : null, h('small', { class: 'muted' }, 'tap to open')),
    table([
      { label: 'What', host: true, get: (o) => o.name }, { label: 'Paid in', mob: 'under', get: (o) => MONTH_NAMES[Number(o.month) - 1] || o.month },
      { label: 'Amount today', cls: 'r', render: (o) => h('span', { class: o.kind === 'income' ? 'inc' : 'exp' }, (o.kind === 'income' ? '+' : '−') + money(o.amount)), total: () => h('span', { class: 'exp' }, '−' + money(total)) },
    ], list, { footer: { label: 'Spending in a year' }, onRow: canEdit() ? (o) => yearlyItemForm(s, s.a.oneOffs.find((x) => x.id === o.id)) : null, empty: 'None yet. Add tax, school fees, vacations and so on, so the years ahead see them coming.' }),
    h('p', { class: 'note' }, `Bills you pay once a year, outside the monthly spending. Each repeats every year in its month and grows by ${pct(s.a.growth.oneTime, 1)} a year. They come out of that month’s money, so a month with tax leaves little to invest. Items entered in the This year plan as “every year” are picked up here until you save your own list.`),
    canEdit() ? h('div', { class: 'row-actions' }, btn('Add a yearly bill', () => yearlyItemForm(s), 'primary', { keep: true }), btn('Find them in my bank entries', () => suggestDialog(s), '', { keep: true })) : null);
  return section('Yearly one-time bills', det);
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

  // ---------- growth settings and yearly one-time bills: everything the projection grows by, in one place ----------
  root.append(assumptionsCard(s), yearlyCard(s));

  // ---------- controls ----------
  const hz = h('select', { 'aria-label': 'Years to look ahead', onchange: (e) => { viewHorizon = +e.target.value; if (canEdit()) setOwn({ horizon: viewHorizon }); else rerender(); } }, [1, 2, 3, 4, 5, 7, 10, 15, 20, 25].map((n) => h('option', { value: n, selected: n === s.horizon }, yrs(n))));
  root.append(h('div', { class: 'filters' }, h('label', null, 'Look ahead ', hz), h('label', { class: 'check-inline' }, h('input', { type: 'checkbox', checked: compare, onchange: (e) => { compare = e.target.checked; rerender(); } }), ' Compare all outlooks')));

  // ---------- numbers ----------
  const expOut = end.expenses + end.emi;
  const cover = expOut > 0 ? end.interest / expOut : null;
  const hit = s.target ? rows.find((r) => r.nw >= s.target) : null;
  const need = s.target && !hit ? P.extraMonthly(start, s.a, oc, months, s.target) : 0;
  root.append(h('div', { class: 'stats' },
    stat(`Net worth in ${yrs(s.horizon)}`, money(end.nw), `${monthLabel(end.month)}, from ${money(b.net)} today`),
    stat('Interest income each month then', money(end.interest), cover != null ? `pays ${Math.round(cover * 100)}% of the ${money(expOut)} monthly spending` : ''),
    s.target ? (hit ? stat('Target reached', monthLabel(hit.month), `${money(s.target)} · ${Math.round((rows.indexOf(hit) + 1) / 12 * 10) / 10} years`) : stat('Target not reached', h('span', { class: 'neg' }, `${money(s.target - end.nw)} short`), need > 0 ? `save ${money(need)} more a month (earn more or spend less) to get there` : 'in this time')) : stat('Target', 'Not set', 'add one under Saving above'),
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
  root.append(yearsTable(rows));
  root.append(flowSection(s.horizon <= 1 ? rows.slice(0, 12) : rows, { mode: s.horizon <= 1 ? 'month' : 'year', title: s.horizon <= 1 ? 'Income, spending and investing, month by month' : 'Income, spending and investing, year by year' }));

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
    ));
  root.append(h('p', { class: 'note' }, s.plan ? `New investments and interest rates come from your ${s.plan.year} plan on the This year tab. Everything else is set on this page.` : 'No plan yet: investments and rates come from your recent history. Create a plan on the This year tab to set them.'));
}
/** Income minus spending (before new investments) in the i-th year of the run. */
function byYearFlows(rows, i) { let t = 0; for (const r of rows.slice(i * 12, i * 12 + 12)) t += r.income - r.out; return t; }
