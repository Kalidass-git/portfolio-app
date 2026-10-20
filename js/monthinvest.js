// This month's investing: what can still be invested, split by the plan, and what the bank can pay for now. Pure functions, no DOM.
//
// Money in the month = the higher of what has arrived so far and what the plan expects.
// Money out the month  = the higher of what has gone out so far and what the plan expects (expenses, EMI, tax and yearly bills).
// Whatever is left is the amount to invest this month. It is split by the shares of the plan lines. What the bank entries and asset
// records already show as invested this month is taken off each line. The bank can pay for the rest only after it keeps back the
// spending still expected before month end.
import { monthActual } from './yearplan.js';
import { investedByMonth, actualOf } from './actuals.js';
import { simulate, classOf, effectiveA, defaults, cfg, baseline } from './projector.js';
import { monthKey, addMonths } from './calc.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);

/**
 * The arithmetic, with plain numbers.
 * in: { actualIn, planIn, actualOut, planOut, bank, lines:[{id,name,cls,monthly}], doneByClass:{cls:₹} }
 */
export function splitMonth({ actualIn, planIn, actualOut, planOut, bank, lines, doneByClass }) {
  const income = Math.max(actualIn, planIn), spend = Math.max(actualOut, planOut);
  const moreSpend = Math.max(0, spend - actualOut);           // still expected before month end
  const investable = Math.max(0, income - spend);
  const weight = sum(lines, (l) => Math.max(0, l.monthly));
  // what each class already received is shared among its lines by their weights
  const classW = {}; for (const l of lines) classW[l.cls] = (classW[l.cls] || 0) + Math.max(0, l.monthly);
  const rows = lines.map((l) => {
    const share = weight > 0 ? Math.max(0, l.monthly) / weight : 0;
    const target = investable * share;
    const done = classW[l.cls] > 0 ? (doneByClass[l.cls] || 0) * Math.max(0, l.monthly) / classW[l.cls] : 0;
    return { ...l, share, target, done, left: Math.max(0, target - done), over: Math.max(0, done - target) };
  });
  // money that went into classes the plan has no line for
  const unplanned = Object.entries(doneByClass).filter(([c, v]) => v > 0 && !classW[c]).map(([cls, done]) => ({ cls, done }));
  const done = sum(Object.values(doneByClass));
  const stillToInvest = sum(rows, (r) => r.left);
  const bankFree = Math.max(0, bank - moreSpend);
  const investNow = Math.min(stillToInvest, bankFree);
  return { income, spend, moreSpend, investable, rows, unplanned, done, stillToInvest, bank, bankFree, investNow, notEnough: investNow < stillToInvest - 0.5, actualIn, planIn, actualOut, planOut };
}

/** Everything for the current month, from the data. `a` are the assumptions both Wealth outlook tabs use. */
export function monthInvest(data, all, outlooks) {
  const cur = monthKey(all.asOf);
  const c = cfg(data);
  const plan = c.years[cur.slice(0, 4)];
  const a = plan ? effectiveA(data, plan.a) : effectiveA(data, defaults(data, all));
  // the projection's first month, started from the month before this one, is this month
  const bl = baseline(data, all);
  const start = { values: bl.values, liab: bl.liab, month: addMonths(cur + '-01', -1).slice(0, 7) };
  const row = simulate(start, a, outlooks, 1)[0];
  const act = monthActual(data, cur);
  const by = investedByMonth(data);
  const classes = Object.keys(by[cur] || {}).filter((k) => k !== 'pf' && classOf(k));
  const doneByClass = Object.fromEntries(classes.map((k) => [k, actualOf(by, cur, k)]));
  const lines = (a.invest || []).filter((l) => (!l.from || cur >= l.from) && (!l.to || cur <= l.to) && l.cls !== 'pf' && classOf(l.cls)).map((l) => ({ id: l.id, name: l.name, cls: l.cls, monthly: l.monthly || 0 }));
  const r = splitMonth({
    actualIn: act.income, planIn: row.salary + row.other + row.interest + row.oneIn,
    actualOut: act.expenses + act.emi + act.tax, planOut: row.expenses + row.emi + row.oneOut,
    bank: all.cashTotal, lines, doneByClass,
  });
  return { month: cur, hasPlan: !!plan, ...r, act };
}
