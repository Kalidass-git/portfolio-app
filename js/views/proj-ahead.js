// Wealth outlook → Years ahead: where you could stand in 5 to 25 years, from salary growth, expenses, new investments and returns.
import { S, mutate } from '../store.js';
import * as P from '../projector.js';
import { h, money, compact, pct, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, setOptions, dialog } from '../ui.js';
import { lineChart, donut, legend, stackedArea, color } from '../charts.js';
import * as PL from '../planner.js';
import { rerender, outlooks, ensure, signed, pc, tone, currentPlan, planPicker, notLiveCard, planSettingsCard, outlookWhatIf, outlookNow, outlookOverride, CASE_SHIFT, shiftOutlooks } from './proj-shared.js';
import { groupedTable, groupOfClass, GROUPS } from './groupmix.js';
import { flowSection, yearsTable, interestWhy } from './proj-flow.js';

const first0 = (r) => r[0] || {};
const yrs = (n) => (n === 1 ? '1 year' : n + ' years');
let compare = false, viewHorizon = null, netView = 'net', catPick = 'all';
const frac = (x) => (x == null || x === '' ? 0 : Number(x) / 100);
const pctIn = (x) => (x == null || x === '' ? '' : Math.round(x * 10000) / 100);

const setOwn = (patch) => mutate((d) => { const p = ensure(d); p.ahead = { ...(p.ahead || {}), ...patch }; });   // only the look-ahead length is kept here

/** Assumptions for the long view: exactly the live plan, with the market outlook what-if if one is chosen. */
export function aheadSetup() {
  const { plan } = currentPlan();
  const own = (S.data.projector && S.data.projector.ahead) || {};
  if (!plan) return { plan: null, horizon: viewHorizon || own.horizon || 10 };
  const a = { ...plan.a, outlook: { ...outlookNow(plan) }, invest: (plan.a.invest || []).map((l) => ({ ...l, from: '', to: '' })) };
  return { a, plan, horizon: viewHorizon || own.horizon || 10, target: PL.planTarget(plan, outlooks()) };
}

export function render(root) {
  const { data, all } = S;
  const ctx = currentPlan();
  root.append(planPicker({ versions: true }));
  if (!ctx.plan) { root.append(notLiveCard(ctx, 'this page')); return; }
  const s = aheadSetup();
  const oc = outlooks();
  // The long view starts from the plan's latest real position (its last snapshot, or the starting net worth entered on the Planner), never from today's holdings.
  const from = PL.yearTrack(data, all, s.plan, oc).from;
  const b = { values: from.values, liab: from.liab, month: from.month, net: from.nw, real: from.real };
  const start = { values: b.values, liab: b.liab, month: b.month };
  const asAt = monthLabel(b.month, true);
  const months = s.horizon * 12;
  const rows = P.simulate(start, s.a, oc, months);
  const yearRows = Array.from({ length: s.horizon }, (_, i) => rows[i * 12 + 11]);
  const end = rows[rows.length - 1];
  const year0 = (r) => monthLabel(r.month);
  // the plan's own path carried on past its year with the plan's own settings: the target for every year end
  const planRows = P.simulate(s.plan.start, { ...s.plan.a, loanPrincipal: 0 }, oc, 12 * (s.horizon + 2));
  const targetBy = new Map(planRows.map((r) => [r.month, r.nw]));
  const targetAt = (m) => (targetBy.has(m) ? targetBy.get(m) : null);

  // ---------- the plan this page works from ----------
  root.append(planSettingsCard(s.plan), section('Market outlook for this plan', outlookWhatIf(s.plan)));

  // ---------- controls ----------
  const hz = h('select', { 'aria-label': 'Years to look ahead', onchange: (e) => { viewHorizon = +e.target.value; if (canEdit()) setOwn({ horizon: viewHorizon }); else rerender(); } }, [1, 2, 3, 4, 5, 7, 10, 15, 20, 25].map((n) => h('option', { value: n, selected: n === s.horizon }, yrs(n))));
  const own = (data.projector && data.projector.ahead) || {}, safe = PL.SAFE_RATES.includes(own.safeRate) ? own.safeRate : 0.04;
  const sw = h('select', { 'aria-label': 'Safe withdrawal rate', onchange: (e) => { if (canEdit()) setOwn({ safeRate: +e.target.value }); } }, PL.SAFE_RATES.map((x) => h('option', { value: x, selected: x === safe }, pct(x, 1))));
  root.append(h('div', { class: 'filters' }, h('label', null, 'Look ahead ', hz), h('label', null, 'Safe withdrawal rate ', sw), h('label', { class: 'check-inline' }, h('input', { type: 'checkbox', checked: compare, onchange: (e) => { compare = e.target.checked; rerender(); } }), ' Compare all outlooks')));

  // ---------- numbers ----------
  const expOut = end.expenses + end.emi;
  const cover = expOut > 0 ? end.interest / expOut : null;
  root.append(h('div', { class: 'stats' },
    stat(`Net worth in ${yrs(s.horizon)}`, money(end.nw), `${monthLabel(end.month)}, from ${money(b.net)} at the end of ${asAt}`),
    stat('Interest income each month then', money(end.interest), cover != null ? `pays ${Math.round(cover * 100)}% of the ${money(expOut)} monthly spending` : ''),
    (() => { const tg = targetAt(end.month), g = tg == null ? null : end.nw - tg; return g == null ? stat('Against the plan', '–', 'no plan figure for that month') : stat(`Against the plan, ${monthLabel(end.month)}`, h('span', { class: tone(g) }, `${money(Math.abs(g))} ${g >= 0 ? 'ahead' : 'short'}`), `plan target ${money(tg)} · projected ${money(end.nw)}`); })(),
    stat('Saved each year at the end', money(yearRows[yearRows.length - 1] ? (byYearFlows(rows, s.horizon - 1)) : 0), 'income minus spending, before new investments')));

  // ---------- work-optional number ----------
  const long = P.simulate(start, s.a, oc, 12 * 40);
  // spending that will not be there after work (rent, tax and so on): left out of the number
  const shares = PL.regularShares(data, all), skipSaved = own.woSkip || {};
  const skipCats = new Set((skipSaved.cats || []).map((x) => String(x).toLowerCase())), skipItems = new Set((skipSaved.items || []).map((x) => String(x).toLowerCase()));
  const oneNames = [...new Set((s.a.oneOffs || []).filter((o) => o.kind !== 'income' && o.name).map((o) => o.name))];
  const skipShares = shares.filter((x) => skipCats.has(x.key)), frac = skipShares.reduce((a, x) => a + x.share, 0);
  const skipOnes = oneNames.filter((n) => skipItems.has(n.toLowerCase()));
  const wo = PL.workOptional(long, b.net, safe, { frac, items: skipOnes });
  const leftOut = [...skipShares.map((x) => x.name), ...skipOnes];
  if (wo) root.append(section('Work-optional number', h('div', null,
    h('div', { class: 'filters' },
      h('button', { class: 'chip-btn' + (leftOut.length ? ' primary' : ''), onclick: () => woSkipDialog(shares, oneNames, skipCats, skipItems) }, leftOut.length ? '⚙ Leaving out: ' + (leftOut.length > 3 ? leftOut.length + ' items' : leftOut.join(', ')) : '⚙ Leave out spending you will not have after work'),
      leftOut.length ? h('span', { class: 'muted' }, `${money(wo.skippedToday)} a year left out of ${money(wo.grossToday)}`) : null),
    h('div', { class: 'stats' },
      stat('Corpus needed today', money(wo.corpusToday), `${money(wo.needToday)} a year of spending${leftOut.length ? ' (after leaving out ' + money(wo.skippedToday) + ')' : ''} ÷ ${pct(safe, 1)}`),
      stat(`You had at the end of ${monthLabel(b.month)}`, h('span', { class: tone(b.net - wo.corpusToday) }, money(b.net)), `${Math.round(wo.progress * 100)}% of the number`),
      wo.reached ? stat('Reached in', h('span', { class: 'pos' }, wo.reached.month.slice(0, 4)), `in ${yrs(wo.yearsAway)} on this plan; by then you need ${money(wo.reached.corpus)}, you have ${money(wo.reached.nw)}`) : stat('Reached in', 'Not within 40 years', 'at the saving and returns in this plan'),
      stat('Spending covered by interest now', money(first0(rows).interest), `of ${money(first0(rows).expenses + first0(rows).emi)} a month`)),
    h('p', { class: 'note' }, `The number is a year of living costs (everyday expenses and the yearly one-time items, without loan EMI, which ends${leftOut.length ? ', and without ' + leftOut.join(', ') : ''}) divided by the safe withdrawal rate: at ${pct(safe, 1)} a year, that corpus could pay those costs without running out. Costs rise with the plan’s yearly rise, so the number grows each year. Net worth here counts everything you own, including EPF and gold, so treat it as a guide, not a promise.`))));

  // ---------- chart ----------
  const monthly = s.horizon <= 2, pts = monthly ? rows : yearRows, stepK = monthly ? 1 : 12;   // a short look-ahead is drawn month by month
  const labels = [monthLabel(b.month), ...pts.map(year0)];
  const line = (rr) => [b.net, ...rr.map((r, i) => (r ? r.nw : null))];
  const series = [];
  if (compare) {
    const sc = P.scenarios(start, s.a, oc, months);
    sc.forEach((x, i) => series.push({ name: `${x.outlook.name} (${pc(x.outlook.rate, 0)})`, values: [b.net, ...Array.from({ length: pts.length }, (_, k) => x.rows[k * stepK + stepK - 1].nw)], color: i }));
  } else {
    const lo = P.simulate(start, s.a, shiftOutlooks(oc, -CASE_SHIFT), months), hi = P.simulate(start, s.a, shiftOutlooks(oc, CASE_SHIFT), months);
    const at = (rr) => [b.net, ...Array.from({ length: pts.length }, (_, k) => rr[k * stepK + stepK - 1].nw)];
    series.push({ name: `Worse case (market ${pct(-CASE_SHIFT, 0)} a year)`, values: at(lo), color: 4 }, { name: 'Expected (plan outlook)', values: line(pts), color: 0 }, { name: `Better case (market +${pct(CASE_SHIFT, 0)} a year)`, values: at(hi), color: 2 });
  }
  if (wo) series.push({ name: 'Work-optional number', values: [wo.corpusToday, ...pts.map((r, k) => { const y = wo.years[Math.min(wo.years.length - 1, Math.floor((k * stepK + stepK - 1) / 12))]; return y ? y.corpus : null; })], dashed: true, color: 5 });
  series.push({ name: 'Plan target', values: [targetAt(b.month), ...pts.map((r) => (r ? targetAt(r.month) : null))], dashed: true, color: 7 });
  // by category: debts, gold, equity and others, each in its own colour
  const sumGroup = (vals, gid) => P.CLASSES.filter((c) => groupOfClass(c.key) === gid).reduce((a, c) => a + ((vals && vals[c.key]) || 0), 0);
  const catSeries = GROUPS.map((g, gi) => ({ id: g.id, name: g.label, color: gi, values: [sumGroup(b.values, g.id), ...pts.map((r) => (r ? sumGroup(r.values, g.id) : null))] })).filter((x) => x.values.some((v) => v > 1));
  const growth = catSeries.map((x) => { const a = x.values[0], z = x.values[x.values.length - 1]; return { ...x, now: a, far: z, change: z - a, mult: a > 1 ? z / a : null, cagr: a > 1 && s.horizon ? Math.pow(z / a, 1 / s.horizon) - 1 : null }; });
  if (catPick !== 'all' && !catSeries.some((x) => x.id === catPick)) catPick = 'all';
  const tabs = h('nav', { class: 'seg slim', 'aria-label': 'Chart view' }, [['net', 'Net worth'], ['cats', 'By category']].map(([k, l]) => h('a', { href: '#', class: netView === k ? 'on' : '', onclick: (e) => { e.preventDefault(); netView = k; rerender(); } }, l)));
  let netBody;
  if (netView === 'net' || !catSeries.length) netBody = lineChart({ labels, fmt: money, yMin: 0, series, area: false });
  else {
    const chips = h('div', { class: 'chips' }, [{ id: 'all', name: 'All together' }, ...catSeries].map((x) => h('button', { type: 'button', class: 'chip-btn' + (catPick === x.id ? ' on' : ''), onclick: () => { catPick = x.id; rerender(); } }, x.id !== 'all' ? [h('i', { class: 'gdot', style: { background: color(x.color) } }), x.name] : x.name)));
    const shown = catPick === 'all' ? catSeries : catSeries.filter((x) => x.id === catPick);
    const fastest = growth.filter((x) => x.cagr != null).sort((a, b) => b.cagr - a.cagr);
    netBody = h('div', null, chips, stackedArea({ labels, fmt: money, series: shown, height: 250 }),
      table([
        { label: 'Category', host: true, render: (x) => h('span', null, h('i', { class: 'gdot', style: { background: color(x.color) } }), x.name, fastest[0] && fastest[0].id === x.id && fastest.length > 1 ? h('small', { class: 'now-tag' }, ' fastest') : null) },
        { label: 'At start', cls: 'r', get: (x) => money(x.now) },
        { label: `In ${yrs(s.horizon)}`, cls: 'r', get: (x) => money(x.far) },
        { label: 'Grows by', cls: 'r', mob: 'under', mlabel: '', render: (x) => h('span', { class: x.change >= 0 ? 'pos' : 'neg' }, (x.change >= 0 ? '+' : '−') + money(Math.abs(x.change))) },
        { label: 'Times', cls: 'r', mob: 'hide', get: (x) => (x.mult == null ? '–' : x.mult.toFixed(2) + '×') },
        { label: 'Yearly growth', cls: 'r', mob: 'under', mlabel: 'per year ', get: (x) => (x.cagr == null ? '–' : pct(x.cagr, 1)) },
      ], growth.slice().sort((a, b) => (b.cagr ?? -9) - (a.cagr ?? -9)), { m: { key: 'ahead-growth', head: 'Category', views: [['At start', `In ${yrs(s.horizon)}`], ['Grows by', 'Yearly growth'], ['Times']],
        sort: [{ value: 'cagr', label: 'Yearly growth', kind: 'num', get: (x) => x.cagr }, { value: 'now', label: 'Value at start', kind: 'num', get: (x) => x.now }, { value: 'far', label: `Value in ${yrs(s.horizon)}`, kind: 'num', get: (x) => x.far }, { value: 'name', label: 'Category', kind: 'text', get: (x) => String(x.name || '').toLowerCase() }], sortDefault: { value: 'cagr', dir: 'desc' } } }),
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
    section(`What you held at the end of ${monthLabel(b.month)}`, h('div', null, donut(nowGrp, { fmt: money, center: compact(b.net + b.liab), sub: 'assets', size: 190 }), legend(nowGrp, { fmt: money }))),
    section(`What you could hold in ${yrs(s.horizon)}`, h('div', null, donut(grp, { fmt: money, center: compact(end.assets), sub: 'assets', size: 190 }), legend(grp, { fmt: money })))));

  // ---------- by class: today, this year end, horizon ----------
  const yEnd = rows.find((r) => r.month === `${String(b.month).slice(0, 4)}-12`) || rows[0];
  const plan0 = (s.a.invest || []).reduce((t, l) => t + (l.monthly || 0), 0);
  const cr = P.CLASSES.map((c) => ({ key: c.key, label: c.label, now: b.values[c.key] || 0, yr: (yEnd && yEnd.values[c.key]) || 0, far: (end.values[c.key]) || 0 })).filter((x) => x.now > 1 || x.yr > 1 || x.far > 1);
  const sumOf = (it, k) => it.reduce((a, x) => a + x[k], 0);
  const share = (v, tot) => (tot > 0 ? Math.round((v / tot) * 100) + '%' : '');
  const tNow = cr.reduce((a, x) => a + x.now, 0), tYr = cr.reduce((a, x) => a + x.yr, 0), tFar = cr.reduce((a, x) => a + x.far, 0);
  root.append(section('Where it sits: at the start, this year end, and later', h('div', null,
    cr.length ? groupedTable({
      rows: cr, groupOf: (x) => groupOfClass(x.key), footerLabel: 'Total assets',
      cols: [
        { label: 'Asset' },
        { label: 'At start', cls: 'r', parent: (it) => money(sumOf(it, 'now')), child: (x) => money(x.now), total: () => money(tNow) },
        { label: 'Share at start', cls: 'r', hide: true, parent: (it) => share(sumOf(it, 'now'), tNow), child: (x) => share(x.now, tNow) },
        { label: `End of ${String(yEnd.month).slice(0, 4)}`, cls: 'r', parent: (it) => money(sumOf(it, 'yr')), child: (x) => money(x.yr), total: () => money(tYr) },
        { label: 'Share', cls: 'r', hide: true, parent: (it) => share(sumOf(it, 'yr'), tYr), child: (x) => share(x.yr, tYr) },
        { label: `In ${yrs(s.horizon)}`, cls: 'r', parent: (it) => money(sumOf(it, 'far')), child: (x) => money(x.far), total: () => money(tFar) },
        { label: 'Share ', cls: 'r', hide: true, parent: (it) => share(sumOf(it, 'far'), tFar), child: (x) => share(x.far, tFar) },
      ],
    }) : h('p', { class: 'empty' }, 'Nothing to show.'),
    h('p', { class: 'note' }, plan0 ? `The starting position plus the ${money(plan0)} a month of new money from your plan, grown at the rates and outlook above. Cash is what is left after spending and investing.` : 'No new money is planned, so only growth of what you hold today is shown.'))));

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
    ], iy, { m: { key: 'ahead-interest', head: 'Year ending', views: [['Interest / month', 'Credit / day'], ['Debt investments'], ['Paid out that year', 'Added to balances that year']] }, empty: 'Nothing to show.' }),
    h('p', { class: 'note' }, 'Debt investments are bonds, private lending, FDs, EPF and PPF, chits, insurance and recurring deposits at that year end, growing with new money and their own rates. Paid out is cash from bonds and lending after tax; added to balances is interest that compounds inside deposits, EPF and chits. Credit a day counts both.'))));

  root.append(interestWhy(rows.slice(0, Math.min(rows.length, 36)), { tds: s.a.tds ?? 0.1 }));

  // ---------- table ----------
  const tbl = yearRows.map((r, i) => { const tg = targetAt(r.month); return { r, i, flow: byYearFlows(rows, i), tg, gap: tg == null ? null : r.nw - tg }; });
  root.append(section('Year by year', h('div', null,
    table([
      { label: 'Year ending', host: true, get: (x) => year0(x.r) },
      { label: 'Net worth', cls: 'r', get: (x) => money(x.r.nw) },
      { label: 'Plan target', cls: 'r', get: (x) => (x.tg == null ? '–' : money(x.tg)) },
      { label: 'Ahead / short', cls: 'r', render: (x) => (x.gap == null ? h('span', { class: 'muted' }, '–') : h('span', { class: tone(x.gap) }, signed(x.gap))) },
      { label: 'Saved that year', mob: 'under', mlabel: 'saved ', cls: 'r', get: (x) => money(x.flow) },
      { label: 'Interest / month', mob: 'under', mlabel: 'interest ', cls: 'r', get: (x) => money(x.r.interest) },
      { label: 'Market-linked', mob: 'hide', cls: 'r', get: (x) => money(x.r.market) },
      { label: 'Monthly spending', mob: 'hide', cls: 'r', get: (x) => money(x.r.expenses + x.r.emi) },
      { label: 'Interest covers spending', mob: 'under', mlabel: 'covers ', cls: 'r', get: (x) => { const sp = x.r.expenses + x.r.emi; return sp ? Math.round((x.r.interest / sp) * 100) + '%' : '–'; } },
    ], tbl, { m: { key: 'ahead-years', head: 'Year ending', views: [['Net worth', 'Plan target'], ['Ahead / short', 'Saved that year'], ['Interest / month', 'Interest covers spending'], ['Market-linked', 'Monthly spending']] }, empty: 'Nothing to show.' }),
    h('p', { class: 'note' }, 'Interest income is what bonds and lending pay out each month after tax. When it covers your monthly spending, your investments pay your living costs without selling anything. Plan target is what the plan itself reaches at that month end, carried on with the plan’s own settings; ahead / short is the projection from today’s real position against it. Saved that year = income − spending, before moving money into investments.')),
    ));
  root.append(h('p', { class: 'note' }, `Everything here follows plan ${s.plan.year}, ${s.plan.which === 'working' ? 'draft' : 'revision ' + s.plan.rev}, made on the Planner tab. New money each month is what is left after spending, split by the plan’s shares; yearly one-time items repeat every year and rise by their own rate.`));
}

/** Choose the spending that will not be there after work. Everyday categories take their share of the plan's monthly expenses (from the last 12 months of bank entries); one-time items come from the plan. */
function woSkipDialog(shares, oneNames, cats, items) {
  const cb = (checked, value) => h('input', { type: 'checkbox', checked, value, disabled: !canEdit() });
  const cBoxes = shares.map((x) => cb(cats.has(x.key), x.key)), iBoxes = oneNames.map((n) => cb(items.has(n.toLowerCase()), n));
  const preset = (re) => { shares.forEach((x, i) => { cBoxes[i].checked = re.test(x.name); }); oneNames.forEach((n, i) => { iBoxes[i].checked = re.test(n); }); };
  const body = h('div', { class: 'form' },
    h('p', { class: 'note', style: { marginTop: 0 } }, 'Tick what you will not spend after you stop working. The Work-optional number is worked out again without it. Loan EMI is already left out.'),
    canEdit() ? h('div', { class: 'chips-row' }, h('button', { type: 'button', class: 'chip-btn', onclick: () => preset(/rent|tax/i) }, 'Rent & tax'), h('button', { type: 'button', class: 'chip-btn', onclick: () => preset(/^$/) }, 'Clear ticks')) : null,
    shares.length ? h('div', null, h('p', { class: 'mini-title' }, 'Everyday expenses (per month, last 12 months)'),
      h('div', { class: 'checklist' }, shares.map((x, i) => h('label', { class: 'check-row' }, cBoxes[i], h('span', null, `${x.name} · ${money(x.monthly)} (${Math.round(x.share * 100)}%)`))))) : h('p', { class: 'note' }, 'No everyday expenses in the bank entries yet.'),
    oneNames.length ? h('div', null, h('p', { class: 'mini-title' }, 'Yearly and one-time items in the plan'),
      h('div', { class: 'checklist' }, oneNames.map((n, i) => h('label', { class: 'check-row' }, iBoxes[i], h('span', null, n))))) : null,
    canEdit() ? null : h('p', { class: 'note' }, 'Only the owner can change this.'));
  dialog('Spending left out after work', body, canEdit() ? [
    { label: 'Cancel', onclick: (c) => c() },
    { label: 'Apply', class: 'primary', onclick: (c) => { setOwn({ woSkip: { cats: cBoxes.filter((b) => b.checked).map((b) => b.value), items: iBoxes.filter((b) => b.checked).map((b) => b.value) } }); c(); rerender(); } },
  ] : [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}
/** Income minus spending (before new investments) in the i-th year of the run. */
function byYearFlows(rows, i) { let t = 0; for (const r of rows.slice(i * 12, i * 12 + 12)) t += r.income - r.out; return t; }
