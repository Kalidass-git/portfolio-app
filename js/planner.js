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
import { monthlySells } from './buys.js';
import * as G from './growth.js';
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
  const invest = (oa.invest && oa.invest.length ? oa.invest : d.invest).map((l, i) => ({ ...l, name: String(l.name || '').replace(/^EPF,\s*/, ''), id: l.id || 'i' + (i + 1), from: inYear(l.from) ? l.from || '' : '', to: inYear(l.to) ? l.to || '' : '' }));
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
/** which: 'live' (the committed copy), 'working' (what is being edited) or a revision number (its saved settings). Null when there is no such copy. */
export function effective(plan, which = 'live') {
  if (!isV2(plan)) return null;
  let src;
  if (which === 'live') src = plan.live;
  else if (typeof which === 'number') { const r = (plan.revisions || []).find((x) => x.rev === which); src = r && r.state ? { a: r.state.a, initial: r.state.initial, rev: r.rev, at: r.at } : null; }
  else src = { a: plan.a, initial: plan.initial, rev: null, at: null };
  if (!src) return null;
  const ini = src.initial, start = { values: ini.classes, liab: ini.liab, month: prevDec(plan.year) };
  return { id: plan.id, year: plan.year, which, rev: src.rev, at: src.at, a: simAssumptions(src.a, plan.year), raw: src.a, initial: ini, start, baseline: { month: start.month, net: ini.net, assets: ini.assets, loans: ini.liab, classes: ini.classes, date: ini.date }, stored: plan };
}
export const livePlan = (data, year) => effective(P.cfg(data).years[String(year)], 'live');
/** The plan to show for a year when no version is picked: the live one, else the draft. Null when there is no plan. */
export const bestPlan = (data, year) => { const p = P.cfg(data).years[String(year)]; return isV2(p) ? effective(p, 'live') || effective(p, 'working') : null; };
/** A plan can be deleted until a month-end snapshot has been taken for its year. */
export const canDeletePlan = (data, year) => { const p = P.cfg(data).years[String(year)]; return isV2(p) && !P.cfg(data).snapshots.some((s) => s.month.slice(0, 4) === String(year)); };
/**
 * Delete the latest revision. The plan goes back to the one before (its settings become both the live and the working copy). With only one revision the plan
 * goes back to a draft with the settings it has now. Returns what happened, for the message. Call inside mutate().
 */
export function deleteLatestRevision(plan) {
  const revs = plan.revisions || [];
  if (!revs.length) return null;
  const gone = revs[revs.length - 1], prev = revs[revs.length - 2];
  plan.revisions = revs.slice(0, -1);
  if (!prev) { plan.live = null; return { gone: gone.rev, back: null }; }
  if (prev.state) { plan.live = { rev: prev.rev, at: prev.at, a: clone(prev.state.a), initial: clone(prev.state.initial) }; plan.a = clone(prev.state.a); plan.initial = clone(prev.state.initial); return { gone: gone.rev, back: prev.rev }; }
  plan.live = { rev: prev.rev, at: prev.at, a: clone(plan.live.a), initial: clone(plan.live.initial) };   // an older revision kept no settings: the figures stay as they are
  return { gone: gone.rev, back: prev.rev, kept: true };
}
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
  const rec = { id: 'r' + rev, rev, at: now, note: note || '', kind: prev ? 'revision' : 'first', changes, key: keyFigures(plan, oc), state: clone(next) };   // the full settings of this revision, so it can be looked at later
  plan.revisions = [...(plan.revisions || []), rec];
  return rec;
}
export const nextId = (list, prefix) => prefix + idx(list || []);

// ---------- the year against the plan ----------
export const statusOf = (nw, planNw) => { if (nw == null || planNw == null) return null; const p = (nw - planNw) / Math.max(1, Math.abs(planNw)); return p > 0.01 ? 'ahead' : p >= -0.01 ? 'on track' : p >= -0.03 ? 'slightly behind' : 'behind'; };

/** Yearly rate of every class for the growth rules: the plan's own rates, and the plan's outlook for the market classes. */
export function rateFn(data, all, plan, oc) {
  const b = P.baseline(data, all), rates = (plan && plan.a && plan.a.rates) || b.rates;
  return (k) => {
    if (P.isMarket(k)) { const id = (plan && plan.a && plan.a.outlook && plan.a.outlook[k]) || 'steady'; return (oc.find((o) => o.id === id) || oc[3] || { rate: 0.09 }).rate; }
    return rates[k] ?? b.rates[k] ?? (k === 'cash' ? 0.03 : 0);
  };
}
/** What goes into a snapshot about its growth: the rules' figures, kept so they do not shift later. */
const growthRecord = (row, from) => ({ v: 1, from, months: row.spanMonths, items: row.growthItems, memo: row.growthMemo, other: r0(row.growthOther), total: r0(row.growth) });

/** One month as it really was, in the shape of a projected month, so the same tables and charts can show both. `prev` is the position the month started from. */
function actualRow(data, mo, nw, classes, liab, prev, by, ctx = {}) {
  const a = monthActual(data, mo), once = oneTimeSet(data);
  const led = monthLedger(data, mo);
  const opt = { by, sells: ctx.sells || {}, divs: ctx.divs || [] };
  const months = G.spanOf(prev.month, mo);                       // normally just this month; more when an earlier month has no snapshot
  const fm = G.flowsOf(data, [mo], opt), fl = months.length === 1 ? fm : G.flowsOf(data, months, opt);
  const interest = sum(led.filter((e) => e.credit > 0 && isInterestCategory(e.category)), (e) => e.credit);
  const other = Math.max(0, a.income - a.salary - interest) + fm.divExtra;   // dividends in your trade records, when no bank entry shows them, are income too
  const oneOut = a.oneTime + a.tax, out = a.expenses + a.emi + a.tax, income = a.salary + other + interest;
  const items = new Map();
  for (const e of led) { const c = (e.category || '').toLowerCase(); if (e.debit > 0 && (once.has(c) || c === 'tax')) items.set(e.category || 'Other', (items.get(e.category || 'Other') || 0) + e.debit); }
  const inv = by[mo] || {}, total = sum(Object.values(inv), (x) => x.amount), pfc = inv.pf ? inv.pf.amount : 0;
  const invested = total - pfc + fm.ppfIn;   // EPF is shown on its own; PPF counts as invested; interest credited is growth, not money put in
  const left = income - out;
  const leftSpan = months.length === 1 ? left : sum(months, (m) => monthActual(data, m).left + G.flowsOf(data, [m], opt).divExtra);
  const investedBy = Object.fromEntries(Object.entries(inv).filter(([k]) => k !== 'pf').map(([k, x]) => [k, x.amount]));
  const assets = sum(Object.values(classes)), prevAssets = sum(Object.values(prev.values));
  const growth = assets - prevAssets - leftSpan - fl.epfIn;   // whatever the net worth gained beyond what was saved and put into EPF
  let ex, recorded = false;
  const st = ctx.stored;
  if (st && st.v === 1 && st.from === prev.month) { ex = { items: st.items || [], memo: st.memo || [], other: growth - sum(st.items || [], (x) => x.amount) }; recorded = true; }
  else ex = G.explainGrowth({ months, open: prev.values, close: classes, openReal: !!prev.real, closeReal: ctx.closeReal !== false, total: growth, flows: fl, rate: ctx.rate || (() => 0) });
  const growthBy = {};
  for (const x of ex.items) growthBy[x.key] = { amount: x.amount, base: x.base, close: x.close, flow: x.flow || 0, rate: x.how === 'rate' ? x.rate : null, how: x.how };
  const loanPaid = (prev.liab || 0) - liab;   // negative when loans grew
  return {
    month: mo, src: 'actual', has: a.has, salary: a.salary, other, interest, accrual: 0, growth, growthBy, growthItems: ex.items, growthMemo: ex.memo, growthOther: ex.other, growthRecorded: recorded, spanMonths: months.length, leftSpan, pfSpan: fl.epfIn,
    dividends: fm.dividends, bankInterest: fm.bankInterest, pfInterest: fm.pfInterest, interestBy: {}, open: { nw: prev.nw, values: prev.values, liab: prev.liab, real: !!prev.real },
    investedBy, loanPaid, left, refill: 0, avail: 0, oneIn: 0,
    expenses: a.regular, emi: a.emi, oneOut, items: [...items.entries()].map(([name, amount]) => ({ name, amount, kind: 'expense' })), invested, pfAdd: fm.epfIn, surplus: left - invested, income, out,
    cash: classes.cash || 0, values: classes, market: sum(P.MARKET, (k) => classes[k] || 0), assets, liab, nw,
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
  const ctx0 = { sells: monthlySells(data), divs: (all.stocks.eq && all.stocks.eq.dividends) || [], rate: rateFn(data, all, plan, oc) };
  const s0 = snaps.get(plan.start.month);   // the December snapshot, when there is one, is a real starting position
  let state = s0 && s0.classes ? { values: { ...s0.classes }, liab: s0.loans || 0, month: s0.month, nw: s0.net, real: !s0.classesEstimated } : { values: plan.start.values, liab: plan.start.liab, month: plan.start.month, nw: plan.initial.net, real: false };
  const seg = new Map();
  const project = (st) => { if (!seg.has(st.month)) seg.set(st.month, P.simulate({ values: st.values, liab: st.liab, month: st.month }, aProj, oc, P.monthsTo(st.month, year))); return seg.get(st.month); };
  const between = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
  const rows = [];
  for (const mo of months) {
    const snap = snaps.get(mo);
    if (snap || mo === cur) {
      let classes, liab, nw, closeReal = true;
      if (snap) { nw = snap.net; liab = snap.loans || 0; closeReal = !!(snap.classes && !snap.classesEstimated); classes = snap.classes ? { ...snap.classes } : scaleClasses(state.values, snap.assets != null ? snap.assets : nw + liab); }
      else { nw = live.net; liab = live.liab; classes = { ...live.values }; }
      const row = actualRow(data, mo, nw, classes, liab, state, by, { ...ctx0, closeReal, stored: snap && snap.growth });
      row.src = snap ? 'actual' : 'now';
      rows.push(row);
      state = { values: classes, liab, month: mo, nw, real: closeReal };
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
/** Where a month started from: the latest earlier snapshot (a real position), else the plan's own starting position. */
export function prevPosition(data, month) {
  const before = P.cfg(data).snapshots.filter((x) => x.month < month && x.classes).sort((x, y) => (x.month < y.month ? -1 : 1));
  const x = before[before.length - 1];
  if (x) return { values: { ...x.classes }, liab: x.loans || 0, month: x.month, nw: x.net, real: !x.classesEstimated };
  const plan = bestPlan(data, month.slice(0, 4));
  return plan ? { values: plan.start.values, liab: plan.start.liab, month: plan.start.month, nw: plan.initial.net, real: false } : null;
}
/** Work out the growth of the month a snapshot closes, class by class, and keep it in the snapshot (so it is recorded, not worked out again later). Call inside mutate() or on a fresh record. */
export function attachGrowth(data, all, snap, oc = P.cfg(data).outlooks) {
  const prev = prevPosition(data, snap.month);
  if (!prev || !snap.classes) { delete snap.growth; return snap; }
  const plan = bestPlan(data, snap.month.slice(0, 4));
  const ctx = { sells: monthlySells(data), divs: (all.stocks.eq && all.stocks.eq.dividends) || [], rate: rateFn(data, all, plan, oc), closeReal: !snap.classesEstimated };
  const row = actualRow(data, snap.month, snap.net, snap.classes, snap.loans || 0, prev, investedByMonth(data), ctx);
  snap.growth = growthRecord(row, prev.month);
  return snap;
}
export function makeSnapshot(data, all, month, note = '', oc = P.cfg(data).outlooks) {
  const b = P.baseline(data, all), m = month || b.month, a = monthActual(data, m);
  const snap = { id: 's' + m, month: m, date: b.date, net: r0(b.net), assets: r0(b.assets), loans: r0(b.liab), classes: Object.fromEntries(Object.entries(b.values).map(([k, v]) => [k, r0(v)])), income: r0(a.income), expenses: r0(a.expenses + a.emi + a.tax), note };
  const by = investedByMonth(data)[m] || {};
  snap.actual = { dividends: r0(G.flowsOf(data, [m], { divs: (all.stocks.eq && all.stocks.eq.dividends) || [] }).dividends), salary: r0(a.salary), income: r0(a.income), expenses: r0(a.expenses), oneTime: r0(a.oneTime), emi: r0(a.emi), tax: r0(a.tax), invested: r0(a.invested), pf: r0(a.pf), bank: r0(all.cashTotal), investedByClass: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, r0(v.amount)])) };
  const plan = livePlan(data, m.slice(0, 4));
  if (plan) {
    const row = planPath(plan, oc).find((r) => r.month === m);
    snap.plan = { year: plan.year, target: r0(planTarget(plan, oc)), rev: plan.rev, assumptions: clone(plan.raw) };
    if (row) {
      snap.projected = { net: r0(row.nw), salary: r0(row.salary), other: r0(row.other + row.oneIn), interest: r0(row.interest), expenses: r0(row.expenses), emi: r0(row.emi), oneOut: r0(row.oneOut), invested: r0(row.invested), pfAdd: r0(row.pfAdd), growth: r0(row.growth || 0), income: r0(row.income), out: r0(row.out), classes: Object.fromEntries(Object.entries(row.values).map(([k, v]) => [k, r0(v)])) };
      snap.variance = snap.net - snap.projected.net;
    }
  }
  attachGrowth(data, all, snap, oc);
  return snap;
}

// ---------- work-optional number ----------
export const SAFE_RATES = [0.03, 0.035, 0.04];
/**
 * The corpus at which investments could pay for living costs: yearly spending (everyday expenses and the yearly one-time items, without loan EMI, which ends)
 * divided by a safe withdrawal rate. `rows` is a long projection from today. Returns the number for today and for every year end, and the first year net worth reaches it.
 */
export function workOptional(rows, netNow, rate) {
  if (!(rate > 0) || rows.length < 12) return null;
  const years = [];
  for (let i = 0; i * 12 + 11 < rows.length; i++) {
    const yr = rows.slice(i * 12, i * 12 + 12), end = yr[11], need = sum(yr, (r) => r.expenses + r.oneOut);
    years.push({ month: end.month, need: r0(need), corpus: r0(need / rate), nw: r0(end.nw) });
  }
  const today = years[0], reached = years.find((y) => y.nw >= y.corpus) || null;
  return { rate, years, needToday: today.need, corpusToday: today.corpus, progress: netNow / today.corpus, reached, yearsAway: reached ? years.indexOf(reached) + 1 : null };
}

// ---------- suggested fix for a gap against the plan ----------
/**
 * One-line ways to close a shortfall at the year end, from what the plan itself says: save more each month, move a coming one-time item, or what the market would need to do.
 * `track` is a yearTrack. Returns [] when there is no gap or no month left.
 */
export function suggestFix(plan, track, oc) {
  if (!track.inYear || !(track.gap < 0) || !track.monthsLeft) return [];
  const short = -track.gap, out = [];
  if (track.extra > 0) out.push({ kind: 'save', amount: r0(track.extra), text: `save ${fmt(track.extra)} more each month for the ${track.monthsLeft} months left` });
  const coming = track.path.filter((r) => r.month > track.cur).flatMap((r) => (r.items || []).filter((i) => i.kind !== 'income').map((i) => ({ name: i.name, month: r.month, amount: i.amount })));
  const big = coming.sort((a, b) => b.amount - a.amount)[0];
  if (big) out.push({ kind: 'move', amount: r0(big.amount), text: big.amount >= short ? `push back ${big.name} (${fmt(big.amount)}, due ${big.month}) beyond the year end` : `push back ${big.name} (${fmt(big.amount)}, due ${big.month}) and save the rest, ${fmt(short - big.amount)}, another way` });
  const startNow = { values: track.live.values, liab: track.live.liab, month: track.cur };
  const need = P.breakEvenMarket(startNow, plan.a, oc, track.monthsLeft, track.target);
  if (need != null) out.push({ kind: 'market', amount: need, text: `or markets return about ${(need * 100).toFixed(1)}% a year from here, instead of the plan’s outlook` });
  return out;
}
const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
