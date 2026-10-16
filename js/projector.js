// Wealth projector engine. Pure functions, no DOM.
//
// A plan starts from where you stand (asset classes and loans on a date) and walks month by month:
//   salary and other income come in, interest from bonds and lending is paid out, expenses go out,
//   what is left (or short) moves cash, planned new investments move cash into an asset class,
//   and every class grows at its own yearly rate. Market-linked classes grow at the "outlook" you pick.
//
// data.projector: {
//   outlooks:  [{ id, name, rate, hint }]                 the market outlook scale (editable)
//   years:     { '2027': plan }                           one plan per year, see newYearPlan()
//   snapshots: [{ id, month, date, net, assets, loans, classes, income, expenses, note }]   month-end positions
//   ahead:     { horizon, ... }                           the long-range setup
// }
import { monthActual } from './yearplan.js';
import { ledgerMonths, monthKey, addMonths, monthStart } from './calc.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const r0 = (n) => Math.round(n);

export const OUTLOOKS = [
  { id: 'loss', name: 'Loss', rate: -0.10, hint: 'Markets fall and stay down' },
  { id: 'flat', name: 'Flat', rate: 0, hint: 'No return at all' },
  { id: 'low', name: 'Low', rate: 0.05, hint: 'Below a fixed deposit' },
  { id: 'steady', name: 'Steady', rate: 0.09, hint: 'A cautious long-run average' },
  { id: 'good', name: 'Good', rate: 0.13, hint: 'A good year or two' },
  { id: 'strong', name: 'Strong', rate: 0.18, hint: 'A very strong run' },
];
export const MARKET = ['shares', 'etfs', 'funds', 'gold'];
export const CLASSES = [
  { key: 'cash', label: 'Cash in banks', kind: 'cash' },
  { key: 'bonds', label: 'Bonds', kind: 'payout' },
  { key: 'lending', label: 'Private lending', kind: 'payout' },
  { key: 'fds', label: 'FDs & compounding loans', kind: 'accrual' },
  { key: 'pf', label: 'EPF & PPF', kind: 'accrual' },
  { key: 'chits', label: 'Chits', kind: 'accrual' },
  { key: 'lic', label: 'Insurance & recurring deposits', kind: 'accrual' },
  { key: 'gold', label: 'Gold', kind: 'market' },
  { key: 'shares', label: 'Shares', kind: 'market' },
  { key: 'etfs', label: 'ETFs', kind: 'market' },
  { key: 'funds', label: 'Mutual funds', kind: 'market' },
  { key: 'other', label: 'Others', kind: 'accrual' },
];
export const classOf = (k) => CLASSES.find((c) => c.key === k);
export const isMarket = (k) => MARKET.includes(k);
const wavg = (items, val, rate) => { const pos = (x) => Math.max(0, Number(val(x)) || 0); const t = sum(items, pos); return t > 0 ? sum(items, (x) => pos(x) * (Number(rate(x)) || 0)) / t : 0; };

/** Where you stand now: value and typical yearly rate of every class, loans, and net worth. */
export function baseline(data, all) {
  const sv = (types) => all.savings.filter((s) => types.includes(s.type));
  const lend = all.lending;   // same set the Home totals use
  const payout = lend.filter((l) => l.interestType === 'Payout'), comp = lend.filter((l) => l.interestType !== 'Payout');
  const items = all.stocks.items;
  const fdItems = all.fds.concat(comp);
  const known = ['EPF', 'PPF', 'Chit'];
  const c = {
    cash: { value: all.cashTotal, rate: 0.03 },
    bonds: { value: all.fixed.bondPrincipal, rate: wavg(all.bonds, (x) => x.principal, (x) => x.rate) },
    lending: { value: sum(payout, (x) => x.principal), rate: wavg(payout, (x) => x.principal, (x) => x.rate) },
    fds: { value: sum(fdItems, (x) => x.value ?? x.principal + (x.accrued || 0)), rate: wavg(fdItems, (x) => x.principal, (x) => x.rate) },
    pf: { value: sum(sv(['EPF', 'PPF']), (x) => x.principal), rate: wavg(sv(['EPF', 'PPF']), (x) => x.principal, (x) => x.rate) },
    chits: { value: sum(sv(['Chit']), (x) => x.principal), rate: wavg(sv(['Chit']), (x) => x.principal, (x) => x.rate) },
    lic: { value: sum(all.savings.filter((s) => !known.includes(s.type)), (x) => x.principal), rate: wavg(all.savings.filter((s) => !known.includes(s.type)), (x) => x.principal, (x) => x.rate) },
    gold: { value: all.goldPlus, rate: 0 },
    shares: { value: sum(items.filter((x) => !x.assetClass || x.assetClass === 'equity'), (x) => x.current), rate: 0 },
    etfs: { value: sum(items.filter((x) => x.assetClass === 'etf'), (x) => x.current), rate: 0 },
    funds: { value: all.mf.current, rate: 0 },
  };
  const known$ = sum(Object.values(c), (x) => x.value);
  c.other = { value: all.totalAssets - known$, rate: 0 };
  const values = Object.fromEntries(Object.entries(c).map(([k, x]) => [k, x.value]));
  const rates = Object.fromEntries(Object.entries(c).map(([k, x]) => [k, Math.round(x.rate * 10000) / 10000]));
  const liab = all.liabTotal || 0;
  return { values, rates, liab, assets: all.totalAssets, net: all.totalAssets - liab, month: monthKey(all.asOf), date: all.asOf };
}

/** Sensible starting assumptions, read from what actually happened in the last few months. */
export function defaults(data, all) {
  const cur = monthKey(all.asOf);
  const months = ledgerMonths(data).filter((m) => m < cur);
  const act = (n) => months.slice(-n).map((m) => monthActual(data, m)).filter((a) => a.has);
  const avg = (rows, k) => (rows.length ? sum(rows, (x) => x[k]) / rows.length : 0);
  const last6 = act(6), last3 = act(3);
  const tax = new Map();
  for (const m of months.slice(-12)) { const a = monthActual(data, m); if (a.tax > 0) tax.set(m.slice(5), (tax.get(m.slice(5)) || 0) + a.tax); }
  const b = baseline(data, all);
  const map = { 'EPF + RD + FDs': ['fds', 'EPF, RD and FDs'], Gold: ['gold', 'Gold'], Bonds: ['bonds', 'Bonds'], 'Lending Private': ['lending', 'Private lending'], Stocks: ['shares', 'Shares and funds'], Chits: ['chits', 'Chits'], 'Lending Family': ['fds', 'Lending to family'] };
  const invest = ((data.targets && data.targets.investmentPlan) || []).filter((p) => p.capital > 0 && map[p.name]).map((p, i) => ({ id: 'i' + (i + 1), name: map[p.name][1], cls: map[p.name][0], monthly: r0(p.capital / 12) }));
  return {
    salary: r0(avg(last3, 'salary')), otherIncome: 0, expenses: r0(avg(last6, 'expenses')), emi: r0(avg(last3, 'emi')), pfAdd: r0(avg(last3, 'pf')),
    tds: (data.settings && data.settings.tdsRate) ?? 0.1,
    oneOffs: [...tax.entries()].sort().map(([mm, amount], i) => ({ id: 'o' + (i + 1), name: 'Tax', month: mm, amount: r0(amount), kind: 'expense' })),
    invest, rates: { ...b.rates }, growth: { salary: 0, expenses: 0, invest: 0 }, outlook: { gold: 'steady', shares: 'steady', etfs: 'steady', funds: 'steady' },
    basis: { months6: last6.length, months3: last3.length },
  };
}

const rateOf = (cls, a, outlooks) => {
  if (isMarket(cls)) {
    if (a.marketRate != null) return a.marketRate;
    const id = (a.outlook && a.outlook[cls]) || 'steady';
    return (outlooks.find((o) => o.id === id) || outlooks[3] || { rate: 0.09 }).rate;
  }
  return (a.rates && a.rates[cls]) ?? 0;
};

/**
 * Walk the months after `start.month`.
 * start: { values:{class:₹}, liab, month:'YYYY-MM' }.  a: assumptions (see defaults()).  months: how many months to run.
 * Returns rows: { month, salary, other, interest, oneIn, expenses, emi, oneOut, invested, surplus, cash, values, market, assets, liab, nw }.
 */
export function simulate(start, a, outlooks, months) {
  const pots = Object.entries(start.values).map(([cls, value]) => ({ cls, value, rate: null }));
  const line = (l) => ({ cls: l.cls, value: Number(l.lump) || 0, rate: l.rate != null && l.rate !== '' ? Number(l.rate) : l.outlook && isMarket(l.cls) ? rateOf(l.cls, { outlook: { [l.cls]: l.outlook } }, outlooks) : null, line: l });
  const linePots = (a.invest || []).map(line);
  const all = pots.concat(linePots);
  const g = a.growth || {};
  let liab = start.liab || 0;
  const rows = [];
  let cashBefore = 0;
  for (let i = 0; i < months; i++) {
    const month = addMonths(start.month + '-01', i + 1).slice(0, 7), mm = month.slice(5), yi = Math.floor(i / 12);
    const f = (rate) => Math.pow(1 + rate, 1 / 12) - 1;
    const salary = (a.salary || 0) * Math.pow(1 + (g.salary || 0), yi), other = (a.otherIncome || 0) * Math.pow(1 + (g.salary || 0), yi);
    const expenses = (a.expenses || 0) * Math.pow(1 + (g.expenses || 0), yi), emi = a.emi || 0;
    let oneIn = 0, oneOut = 0;
    for (const o of a.oneOffs || []) {
      if (!(o.month === mm || o.month === month)) continue;
      const amt = (o.amount || 0) * (o.month === mm && o.kind !== 'income' ? Math.pow(1 + (g.expenses || 0), yi) : 1);
      if (o.kind === 'income') oneIn += amt; else oneOut += amt;
    }
    // interest paid out by bonds and lending (after TDS), growth for everything else
    let interest = 0;
    for (const p of all) {
      const k = classOf(p.cls), r = p.rate ?? rateOf(p.cls, a, outlooks);
      if (k.kind === 'payout') interest += p.value * (r / 12) * (1 - (a.tds ?? 0.1));
      else p.value *= 1 + f(r);
    }
    // planned new money moves from cash into its class
    let invested = 0;
    for (const p of linePots) {
      const l = p.line;
      if (l.from && month < l.from) continue;
      if (l.to && month > l.to) continue;
      const amt = (l.monthly || 0) * Math.pow(1 + (g.invest || 0), yi);
      p.value += amt; invested += amt;
    }
    const pfAdd = a.pfAdd || 0;
    all.find((p) => p.cls === 'pf' && !p.line).value += pfAdd;
    const income = salary + other + interest + oneIn;
    const out = expenses + emi + oneOut;
    const surplus = income - out - invested;
    all.find((p) => p.cls === 'cash' && !p.line).value += surplus;
    if (a.loanPrincipal) liab = Math.max(0, liab - a.loanPrincipal);
    const values = {};
    for (const p of all) values[p.cls] = (values[p.cls] || 0) + p.value;
    const assets = sum(Object.values(values));
    rows.push({ month, salary, other, interest, oneIn, expenses, emi, oneOut, invested, pfAdd, surplus, income, out, cash: values.cash, values, market: sum(MARKET, (k) => values[k] || 0), assets, liab, nw: assets - liab });
    cashBefore = values.cash;
  }
  return rows;
}

/** Months from `from` (exclusive) to the end of `year`. */
export const monthsTo = (fromMonth, year) => { const [y, m] = fromMonth.split('-').map(Number); return Math.max(0, (Number(year) - y) * 12 + (12 - m)); };

/** Run every outlook on the same plan. Returns [{ outlook, rows, end }]. */
export function scenarios(start, a, outlooks, months, only = MARKET) {
  return outlooks.map((o) => {
    const outlook = { ...a.outlook }; for (const k of only) outlook[k] = o.id;
    const rows = simulate(start, { ...a, outlook, invest: (a.invest || []).map((l) => (isMarket(l.cls) ? { ...l, outlook: null } : l)) }, outlooks, months);
    return { outlook: o, rows, end: rows.length ? rows[rows.length - 1] : null };
  });
}

/** One market return, for all market classes together, that would just reach `target` at the end. Null if not reachable in -50%..+80%. */
export function breakEvenMarket(start, a, outlooks, months, target) {
  const at = (r) => { const rows = simulate(start, { ...a, marketRate: r, invest: (a.invest || []).map((l) => ({ ...l, outlook: null })) }, outlooks, months); return rows.length ? rows[rows.length - 1].nw : start.net; };
  let lo = -0.5, hi = 0.8;
  if (at(hi) < target) return null;
  if (at(lo) >= target) return lo;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (at(mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * Extra money to set aside every month (earn more or spend less) to just reach `target`. 0 when already on course.
 * Moving cash into a deposit only adds the small interest difference, so the shortfall has to come from saving more.
 */
export function extraMonthly(start, a, outlooks, months, target) {
  const at = (x) => { const rows = simulate(start, { ...a, otherIncome: (a.otherIncome || 0) + x }, outlooks, months); return rows.length ? rows[rows.length - 1].nw : start.net; };
  if (at(0) >= target) return 0;
  let lo = 0, hi = Math.max(1e4, (target - at(0)) / Math.max(1, months) * 2);
  while (at(hi) < target && hi < 1e10) hi *= 2;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (at(mid) < target) lo = mid; else hi = mid; }
  return hi;
}

/** Month rows grouped by calendar year (year-end values, yearly flows). */
export function byYear(rows) {
  const m = new Map();
  for (const r of rows) { const y = r.month.slice(0, 4); const x = m.get(y) || { year: y, income: 0, out: 0, invested: 0, interest: 0, months: 0 }; x.income += r.income; x.out += r.out; x.invested += r.invested; x.interest += r.interest; x.months++; x.end = r; m.set(y, x); }
  return [...m.values()];
}

// ---------- year plans ----------
export const cfg = (data) => {
  const p = data.projector || {};
  return { outlooks: p.outlooks && p.outlooks.length ? p.outlooks : OUTLOOKS, years: p.years || {}, snapshots: p.snapshots || [], ahead: p.ahead || null };
};
const snapOf = (data, all, month, note = '') => {
  const b = baseline(data, all), a = monthActual(data, month || b.month);
  return { id: 's' + (month || b.month), month: month || b.month, date: b.date, net: r0(b.net), assets: r0(b.assets), loans: r0(b.liab), classes: Object.fromEntries(Object.entries(b.values).map(([k, v]) => [k, r0(v)])), income: r0(a.income), expenses: r0(a.expenses + a.emi + a.tax), note };
};
export { snapOf as makeSnapshot };

/** A new plan for `year`, starting from today's position. Target defaults to what the Steady outlook reaches, rounded. */
export function newYearPlan(data, all, year) {
  const b = baseline(data, all), a = defaults(data, all);
  const outlooks = cfg(data).outlooks;
  const start = { values: b.values, liab: b.liab, month: b.month };
  const months = monthsTo(b.month, year);
  const end = months ? simulate(start, a, outlooks, months).pop() : null;
  return { id: String(year), year: Number(year), target: end ? Math.ceil(end.nw / 100000) * 100000 : Math.ceil(b.net / 100000) * 100000, startMonth: b.month, baseline: { date: b.date, month: b.month, net: r0(b.net), assets: r0(b.assets), loans: r0(b.liab), classes: Object.fromEntries(Object.entries(b.values).map(([k, v]) => [k, r0(v)])) }, a: { ...a, loanPrincipal: 0 }, retro: { well: '', improve: '', savedAt: '' } };
}

/** Planned path from the plan's starting position to December. */
export function planPath(plan, outlooks) {
  const start = { values: plan.baseline.classes, liab: plan.baseline.loans, month: plan.baseline.month };
  return simulate(start, plan.a, outlooks, monthsTo(plan.baseline.month, plan.year));
}
/** Forecast: from the latest month-end snapshot (or today's position) with the same assumptions. */
export function forecast(plan, outlooks, from) {
  const start = { values: from.classes, liab: from.loans, month: from.month };
  return simulate(start, plan.a, outlooks, monthsTo(from.month, plan.year));
}
