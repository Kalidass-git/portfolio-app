// Wealth outlook planner. Pure functions, no DOM.
//
// One plan per calendar year in data.projector.years['2027'] (a "version 2" plan, v: 2):
//   a        the working assumptions, edited on the Planner tab
//   initial  net worth at the start of the year (January) and how it is spread over asset classes
//   live     null until the plan is made live, then a frozen copy { rev, at, a, initial } that every other tab uses
//   revisions[]  one record per commit: what changed, when, and the key figures at that time
// Only optional fields are added, so older files and older records still work. Plans of the earlier version (no v) are left alone and ignored.
import * as P from './projector.js';
import { monthActual } from './yearplan.js';
import { investedByMonth } from './actuals.js';
import { oneTimeSet } from './categories.js';
import { isInterestCategory } from './insights.js';
import { ledgerMonths, monthKey, monthLedger, monthCashflow } from './calc.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const r0 = (n) => Math.round(n);
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const stable = (x) => JSON.stringify(x, (k, v) => (isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]])) : v));
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthsOfYear = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
const prevDec = (year) => `${Number(year) - 1}-12`;
const idx = (list, prefix) => 1 + Math.max(0, ...list.map((x) => Number(String(x.id).replace(/\D/g, '')) || 0));

export const isV2 = (p) => !!(p && p.v === 2);
/** Plans saved by the earlier version of Wealth outlook (no `v`). They are no longer used. */
export const legacyYears = (data) => Object.entries(P.cfg(data).years).filter(([, p]) => !isV2(p)).map(([y]) => y).sort();
const AHEAD_PLAN_KEYS = ['salary', 'otherIncome', 'expenses', 'emi', 'pfAdd', 'growthSalary', 'growthExpenses', 'growthOneTime', 'hikeMonth', 'outlook', 'oneOffs', 'target'];
/** Planning figures the earlier Years ahead page kept (the horizon is only a view setting and stays). */
export const legacyAheadKeys = (data) => AHEAD_PLAN_KEYS.filter((k) => data.projector && data.projector.ahead && data.projector.ahead[k] !== undefined);
/** Remove old plans and the old Years ahead planning figures. Month-end snapshots are never touched. Call inside mutate(). */
export function clearLegacy(d) {
  const p = d.projector; if (!p) return;
  for (const [y, plan] of Object.entries(p.years || {})) if (!isV2(plan)) delete p.years[y];
  if (p.ahead) for (const k of AHEAD_PLAN_KEYS) delete p.ahead[k];
}

// ---------- starting position ----------
export function scaleClasses(classes, assets) {
  const t = sum(Object.values(classes));
  if (!(Math.abs(t) > 0)) return { ...classes };
  const f = assets / t;
  return Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, r0(v * f)]));
}
/** Net worth at the start of the year. The spread over asset classes is today's mix, scaled to that net worth, then kept as it is. */
export function initialFrom(data, all, net = null) {
  const b = P.baseline(data, all);
  const n = net == null ? b.net : net, assets = n + b.liab;
  return { net: r0(n), assets: r0(assets), liab: r0(b.liab), classes: scaleClasses(b.values, assets), date: b.date };
}
export function setInitialNet(plan, net) {
  const liab = plan.initial.liab, assets = net + liab;
  plan.initial = { ...plan.initial, net: r0(net), assets: r0(assets), classes: scaleClasses(plan.initial.classes, assets) };
}

// ---------- what a new plan starts with ----------
/** Salary and EPF of the last full month that has a salary, expenses averaged over this year so far, and the interest Home expects this month. */
export function defaultsFor(data, all) {
  const cur = monthKey(all.asOf), d = P.defaults(data, all);
  const months = ledgerMonths(data).filter((m) => m < cur);
  let salary = 0, salaryMonth = null, pf = 0;
  for (const m of months.slice(-4).reverse().concat([cur])) {
    const a = monthActual(data, m);
    if (a.salary > 0) { salary = r0(a.salary); salaryMonth = m; pf = r0(a.pf); break; }
  }
  if (!salaryMonth) { salary = d.salary; pf = d.pfAdd; salaryMonth = months[months.length - 1] || cur; }
  if (!(pf > 0)) pf = d.pfAdd;
  const hist = (list) => list.map((m) => monthActual(data, m)).filter((a) => a.has);
  let rows = hist(months.filter((m) => m.startsWith(cur.slice(0, 4))));
  if (rows.length < 3) rows = hist(months.slice(-12));
  const expenses = rows.length ? r0(sum(rows, (a) => a.regular) / rows.length) : d.expenses;
  let interestMonthly = 0;
  try { interestMonthly = r0(monthCashflow(data, all, cur).totalExpected); } catch (e) { /* no interest lines */ }
  return { ...d, salary, pfAdd: pf, salaryMonth, expenses, interestMonthly };
}

/** A new draft plan. Where the earlier version had settings for the same year, they are the starting point, so nothing has to be typed again. */
export function freshPlan(data, all, year) {
  const c = P.cfg(data), ahead = c.ahead || {}, y = String(year);
  const old = c.years[y] && !isV2(c.years[y]) ? c.years[y] : null, oa = (old && old.a) || {};
  const d = defaultsFor(data, all);
  const inYear = (m) => !m || String(m).length === 2 || String(m).startsWith(y);
  const items = (list) => (list || []).filter((o) => inYear(o.month)).map((o, i) => ({ ...o, id: o.id || 'o' + (i + 1) }));
  const oneOffs = items(oa.oneOffs && oa.oneOffs.length ? oa.oneOffs : ahead.oneOffs && ahead.oneOffs.length ? ahead.oneOffs : d.oneOffs);
  const invest = (oa.invest && oa.invest.length ? oa.invest : d.invest).map((l, i) => ({ ...l, id: l.id || 'i' + (i + 1), from: inYear(l.from) ? l.from || '' : '', to: inYear(l.to) ? l.to || '' : '' }));
  const a = {
    salary: d.salary, pfAdd: d.pfAdd, salaryMonth: d.salaryMonth, otherIncome: 0, interestMonthly: d.interestMonthly,
    expenses: d.expenses, emi: d.emi, tds: d.tds,
    growth: { salary: ahead.growthSalary ?? 0.06, expenses: ahead.growthExpenses ?? 0.06, oneTime: ahead.growthOneTime ?? ahead.growthExpenses ?? 0.06 },
    hikeMonth: ahead.hikeMonth ?? 4,
    oneOffs, invest, rates: { ...d.rates, ...(oa.rates || {}) }, outlook: clone(oa.outlook || ahead.outlook || d.outlook),
  };
  return { id: y, year: Number(year), v: 2, a, initial: initialFrom(data, all), live: null, revisions: [], createdAt: new Date().toISOString() };
}

// ---------- plans as the projection sees them ----------
/** Assumptions in the shape simulate() reads. */
export function simAssumptions(a, year) {
  const g = a.growth || {};
  return { ...clone(a), baseYear: Number(year), tds: a.tds ?? 0.1, hikeMonth: Number(a.hikeMonth) || 4, loanPrincipal: 0,
    growth: { salary: g.salary || 0, expenses: g.expenses || 0, oneTime: g.oneTime ?? g.expenses ?? 0, invest: 0 }, outlook: { ...(a.outlook || {}) } };
}
/** which: 'live' (the committed copy) or 'working' (what is being edited). Null when there is no such copy. */
export function effective(plan, which = 'live') {
  if (!isV2(plan)) return null;
  const src = which === 'live' ? plan.live : { a: plan.a, initial: plan.initial, rev: null, at: null };
  if (!src) return null;
  const ini = src.initial, start = { values: ini.classes, liab: ini.liab, month: prevDec(plan.year) };
  return { id: plan.id, year: plan.year, which, rev: src.rev, at: src.at, a: simAssumptions(src.a, plan.year), raw: src.a, initial: ini, start, baseline: { month: start.month, net: ini.net, assets: ini.assets, loans: ini.liab, classes: ini.classes, date: ini.date }, stored: plan };
}
export const livePlan = (data, year) => effective(P.cfg(data).years[String(year)], 'live');
/** The plan every other tab uses for a year, or null. */
export const planPath = (p, oc) => P.simulate(p.start, p.a, oc, 12);
export const planTarget = (p, oc) => { const r = planPath(p, oc); return r.length ? r[r.length - 1].nw : p.initial.net; };
/** What the plan assumes when there is no live plan: the older defaults, only for screens that still need a number (Home's investing card, What-if). */
export function fallbackA(data, all) {
  const d = P.defaults(data, all), ahead = P.cfg(data).ahead || {};
  return { ...d, growth: { salary: ahead.growthSalary ?? 0.06, expenses: ahead.growthExpenses ?? 0.06, oneTime: ahead.growthOneTime ?? ahead.growthExpenses ?? 0.06, invest: 0 }, hikeMonth: ahead.hikeMonth ?? 4, loanPrincipal: 0 };
}

export const isDirty = (plan) => !!(plan && plan.live && stable({ a: plan.a, initial: plan.initial }) !== stable({ a: plan.live.a, initial: plan.live.initial }));
export function discardChanges(plan) { plan.a = clone(plan.live.a); plan.initial = clone(plan.live.initial); }

// ---------- what changed between two versions of a plan ----------
const nm = (list, oc, id) => ((oc || P.OUTLOOKS).find((o) => o.id === id) || { name: id || 'Steady' }).name;
const outlookText = (a, oc) => { const ids = P.MARKET.map((k) => (a.outlook && a.outlook[k]) || 'steady'); return ids.every((x) => x === ids[0]) ? nm(null, oc, ids[0]) : P.MARKET.map((k, i) => `${P.classOf(k).label}: ${nm(null, oc, ids[i])}`).join(', '); };
const oneName = (o) => `${o.name}${o.kind === 'income' ? ' (income)' : ''}, ${o.month && o.month.length === 2 ? 'every ' + MONTH_NAMES[Number(o.month) - 1] : o.month}`;
const FIELDS = [
  ['Income', 'Expected salary', (s) => s.a.salary || 0, 'money'], ['Income', 'Expected EPF', (s) => s.a.pfAdd || 0, 'money'],
  ['Income', 'Salary and EPF hike', (s) => (s.a.growth && s.a.growth.salary) || 0, 'pct'], ['Income', 'Hike month', (s) => MONTH_NAMES[(Number(s.a.hikeMonth) || 4) - 1], 'text'],
  ['Income', 'Salary figures are for', (s) => s.a.salaryMonth || '', 'ym'],
  ['Income', 'Expected interest income (monthly)', (s) => s.a.interestMonthly ?? 0, 'money'], ['Income', 'Other income (monthly)', (s) => s.a.otherIncome || 0, 'money'],
  ['Income', 'Net worth at the start of the year', (s) => s.initial.net, 'money'],
  ['Expenses', 'Expected expenses (monthly)', (s) => s.a.expenses || 0, 'money'], ['Expenses', 'Expenses rise each year', (s) => (s.a.growth && s.a.growth.expenses) || 0, 'pct'],
  ['Expenses', 'Loan EMI', (s) => s.a.emi || 0, 'money'],
];
export function diffPlans(prev, next, oc) {
  const out = [];
  for (const [g, l, get, f] of FIELDS) { const a = get(prev), b = get(next); if (a !== b && !(f === 'money' && Math.round(a) === Math.round(b))) out.push({ g, l, from: a, to: b, f }); }
  const oa = outlookText(prev.a, oc), ob = outlookText(next.a, oc);
  if (oa !== ob) out.push({ g: 'Market outlook', l: 'Market outlook', from: oa, to: ob, f: 'text' });
  const ra = prev.a.rates || {}, rb = next.a.rates || {};
  for (const k of Object.keys({ ...ra, ...rb })) if (Math.abs((ra[k] || 0) - (rb[k] || 0)) > 1e-9) out.push({ g: 'Market outlook', l: `Yearly rate: ${P.labelOf(k)}`, from: ra[k] || 0, to: rb[k] || 0, f: 'pct' });
  const list = (s, key) => s.a[key] || [];
  for (const [key, g, label, desc, fields] of [['oneOffs', 'One-time items', 'One-time', oneName, ['amount', 'month', 'kind', 'rise']], ['invest', 'New money', 'Investment', (x) => `${x.name} (${P.labelOf(x.cls)})`, ['monthly', 'cls', 'from', 'to', 'rate', 'outlook']]]) {
    const A = new Map(list(prev, key).map((x) => [x.id, x])), B = new Map(list(next, key).map((x) => [x.id, x]));
    const amt = key === 'oneOffs' ? 'amount' : 'monthly';
    for (const [id, x] of B) {
      if (!A.has(id)) { out.push({ g, l: `${label} added: ${desc(x)}`, from: null, to: x[amt] || 0, f: 'money', t: 'added' }); continue; }
      const o = A.get(id);
      if (Math.round(o[amt] || 0) !== Math.round(x[amt] || 0)) out.push({ g, l: `${label}: ${desc(x)}`, from: o[amt] || 0, to: x[amt] || 0, f: 'money' });
      else if (fields.some((k) => stable(o[k] ?? null) !== stable(x[k] ?? null))) out.push({ g, l: `${label} changed: ${desc(x)}`, from: null, to: null, f: 'note', t: 'edited' });
    }
    for (const [id, x] of A) if (!B.has(id)) out.push({ g, l: `${label} removed: ${desc(x)}`, from: x[amt] || 0, to: null, f: 'money', t: 'removed' });
  }
  return out;
}
/** The settings a plan starts with, listed the same way as a change (nothing "from"). */
export function startingValues(s, oc) {
  const out = FIELDS.map(([g, l, get, f]) => ({ g, l, from: null, to: get(s), f }));
  out.push({ g: 'Market outlook', l: 'Market outlook', from: null, to: outlookText(s.a, oc), f: 'text' });
  out.push({ g: 'One-time items', l: 'One-time items', from: null, to: (s.a.oneOffs || []).length, f: 'count' }, { g: 'New money', l: 'Investment lines', from: null, to: (s.a.invest || []).length, f: 'count' });
  return out;
}
/** Figures that sum up a plan at the time it was committed. */
export function keyFigures(plan, oc) {
  const e = effective(plan, 'live'); if (!e) return null;
  const path = planPath(e, oc), n = path.length || 1;
  return { yearEnd: r0(path.length ? path[path.length - 1].nw : e.initial.net), saved: r0(sum(path, (r) => r.left + (r.pfAdd || 0)) / n), invested: r0(sum(path, (r) => r.invested) / n) };
}
/** Make the working copy live. Returns the new revision, or null when nothing differs from the live copy. Call inside mutate(). */
export function commit(plan, note, oc, now = new Date().toISOString()) {
  const next = { a: clone(plan.a), initial: clone(plan.initial) }, prev = plan.live;
  let changes = prev ? diffPlans(prev, next, oc) : startingValues(next, oc);
  if (prev && !isDirty(plan)) return null;
  if (prev && !changes.length) changes = [{ g: 'Other', l: 'Other settings changed', from: null, to: null, f: 'note' }];
  const rev = (prev ? prev.rev : 0) + 1;
  plan.live = { rev, at: now, ...next };
  const rec = { id: 'r' + rev, rev, at: now, note: note || '', kind: prev ? 'revision' : 'first', changes, key: keyFigures(plan, oc) };
  plan.revisions = [...(plan.revisions || []), rec];
  return rec;
}
export const nextId = (list, prefix) => prefix + idx(list || []);

// ---------- the year against the plan ----------
export const statusOf = (nw, planNw) => { if (nw == null || planNw == null) return null; const p = (nw - planNw) / Math.max(1, Math.abs(planNw)); return p > 0.01 ? 'ahead' : p >= -0.01 ? 'on track' : p >= -0.03 ? 'slightly behind' : 'behind'; };

/** One month as it really was, in the shape of a projected month, so the same tables and charts can show both. */
function actualRow(data, mo, nw, classes, liab, prevNw, by) {
  const a = monthActual(data, mo), once = oneTimeSet(data);
  const led = monthLedger(data, mo);
  const interest = sum(led.filter((e) => e.credit > 0 && isInterestCategory(e.category)), (e) => e.credit);
  const other = Math.max(0, a.income - a.salary - interest);
  const oneOut = a.oneTime + a.tax, out = a.expenses + a.emi + a.tax, income = a.salary + other + interest;
  const items = new Map();
  for (const e of led) { const c = (e.category || '').toLowerCase(); if (e.debit > 0 && (once.has(c) || c === 'tax')) items.set(e.category || 'Other', (items.get(e.category || 'Other') || 0) + e.debit); }
  const inv = by[mo] || {}, total = sum(Object.values(inv), (x) => x.amount), pfc = inv.pf ? inv.pf.amount : 0;
  const invested = total - pfc + Math.max(0, pfc - a.pf);   // EPF is shown on its own; PPF counts as invested
  const left = income - out;
  return {
    month: mo, src: 'actual', has: a.has, salary: a.salary, other, interest, accrual: 0, growth: nw - prevNw - left - a.pf, growthBy: {}, interestBy: {},
    investedBy: Object.fromEntries(Object.entries(inv).filter(([k]) => k !== 'pf').map(([k, x]) => [k, x.amount])), loanPaid: 0, left, refill: 0, avail: 0, oneIn: 0,
    expenses: a.regular, emi: a.emi, oneOut, items: [...items.entries()].map(([name, amount]) => ({ name, amount, kind: 'expense' })), invested, pfAdd: a.pf, surplus: left - invested, income, out,
    cash: classes.cash || 0, values: classes, market: sum(P.MARKET, (k) => classes[k] || 0), assets: sum(Object.values(classes)), liab, nw,
  };
}

/**
 * Walk the plan's year month by month. A month is "actual" when it has a month-end snapshot, "now" for the current month (today's position, the month is still running),
 * and "projected" otherwise: carried forward from the latest actual position with the plan's settings. `outlook` (optional) replaces the plan's market outlook for the
 * projected months only, to see how the year would go on another outlook.
 */
export function yearTrack(data, all, plan, oc, { outlook = null } = {}) {
  const cur = monthKey(all.asOf), year = plan.year, months = monthsOfYear(year);
  const path = planPath(plan, oc), target = path.length ? path[path.length - 1].nw : plan.initial.net;
  const aProj = outlook ? { ...plan.a, outlook: { ...outlook }, invest: (plan.a.invest || []).map((l) => (P.isMarket(l.cls) ? { ...l, outlook: '' } : l)) } : plan.a;
  const snaps = new Map(P.cfg(data).snapshots.map((s) => [s.month, s]));
  const live = P.baseline(data, all), by = investedByMonth(data);
  let state = { values: plan.start.values, liab: plan.start.liab, month: plan.start.month, nw: plan.initial.net };
  const seg = new Map();
  const project = (st) => { if (!seg.has(st.month)) seg.set(st.month, P.simulate({ values: st.values, liab: st.liab, month: st.month }, aProj, oc, P.monthsTo(st.month, year))); return seg.get(st.month); };
  const between = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
  const rows = [];
  for (const mo of months) {
    const snap = snaps.get(mo);
    if (snap || mo === cur) {
      let classes, liab, nw;
      if (snap) { nw = snap.net; liab = snap.loans || 0; classes = snap.classes ? { ...snap.classes } : scaleClasses(state.values, snap.assets != null ? snap.assets : nw + liab); }
      else { nw = live.net; liab = live.liab; classes = { ...live.values }; }
      const row = actualRow(data, mo, nw, classes, liab, state.nw, by);
      row.src = snap ? 'actual' : 'now';
      rows.push(row);
      state = { values: classes, liab, month: mo, nw };
    } else {
      const sim = project(state), row = sim[between(state.month, mo) - 1];
      rows.push({ ...row, src: 'projected', missing: mo < cur });
    }
  }
  const projected = rows.length ? rows[rows.length - 1].nw : plan.initial.net;
  const gap = projected - target;
  const status = gap >= 0 ? (gap > target * 0.03 ? 'ahead' : 'on track') : gap >= -target * 0.03 ? 'close' : 'behind';
  const inYear = cur >= plan.start.month && cur <= `${year}-12`;
  const monthsLeft = inYear ? P.monthsTo(cur, year) : 0;
  const startNow = inYear ? { values: live.values, liab: live.liab, month: cur } : null;
  const extra = gap < 0 && startNow && monthsLeft ? P.extraMonthly(startNow, aProj, oc, monthsLeft, target) : 0;
  return { rows, path, target, projected, gap, status, cur, live, inYear, monthsLeft, extra, snaps };
}

/** What a month's snapshot form should start from when the month has no snapshot yet: the projected position. */
export const snapshotGuess = (row) => ({ assets: r0(row.assets), loans: r0(row.liab) });

/**
 * Where the money moved against the plan up to a month: change per asset class since the start of the year, planned and actual.
 * For a month with no snapshot the figures are projected, and `src` says so.
 */
export function whereWent(plan, track, month) {
  const row = track.rows.find((r) => r.month === month), prow = track.path.find((r) => r.month === month);
  if (!row || !prow) return null;
  const base = plan.initial.classes;
  const list = P.CLASSES.map((c) => { const pl = (prow.values[c.key] || 0) - (base[c.key] || 0), ac = (row.values[c.key] || 0) - (base[c.key] || 0); return { key: c.key, label: c.label, kind: c.kind, plan: pl, actual: ac, diff: ac - pl }; }).filter((x) => Math.abs(x.plan) + Math.abs(x.actual) > 1);
  return { month, src: row.src, list, net: row.nw, planNet: prow.nw, diff: row.nw - prow.nw };
}

// ---------- month-end snapshots (moved here from projector.js: they carry the plan's own figures for the month) ----------
export function makeSnapshot(data, all, month, note = '', oc = P.cfg(data).outlooks) {
  const b = P.baseline(data, all), m = month || b.month, a = monthActual(data, m);
  const snap = { id: 's' + m, month: m, date: b.date, net: r0(b.net), assets: r0(b.assets), loans: r0(b.liab), classes: Object.fromEntries(Object.entries(b.values).map(([k, v]) => [k, r0(v)])), income: r0(a.income), expenses: r0(a.expenses + a.emi + a.tax), note };
  const by = investedByMonth(data)[m] || {};
  snap.actual = { salary: r0(a.salary), income: r0(a.income), expenses: r0(a.expenses), oneTime: r0(a.oneTime), emi: r0(a.emi), tax: r0(a.tax), invested: r0(a.invested), pf: r0(a.pf), bank: r0(all.cashTotal), investedByClass: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, r0(v.amount)])) };
  const plan = livePlan(data, m.slice(0, 4));
  if (plan) {
    const row = planPath(plan, oc).find((r) => r.month === m);
    snap.plan = { year: plan.year, target: r0(planTarget(plan, oc)), rev: plan.rev, assumptions: clone(plan.raw) };
    if (row) {
      snap.projected = { net: r0(row.nw), salary: r0(row.salary), other: r0(row.other + row.oneIn), interest: r0(row.interest), expenses: r0(row.expenses), emi: r0(row.emi), oneOut: r0(row.oneOut), invested: r0(row.invested), pfAdd: r0(row.pfAdd), growth: r0(row.growth || 0), income: r0(row.income), out: r0(row.out), classes: Object.fromEntries(Object.entries(row.values).map(([k, v]) => [k, r0(v)])) };
      snap.variance = snap.net - snap.projected.net;
    }
  }
  return snap;
}
