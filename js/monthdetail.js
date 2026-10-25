// Month in detail: pure logic (no DOM). How far each month went against its limit, and what counts as spending.
//
// The limit of a month is the interest income expected in it (the same "budget" Home's "This month in detail" uses).
// Spending is the same list of lines as Home (groups, the clothes/entertainment line and the other payments the owner ticked there),
// and each line can be counted or left out here, for example one-time payments such as tax, EMI or rent.
import * as C from './calc.js';

/** From best to worst. `max` is the share of the limit used up to and including this level. */
export const LEVELS = [
  { id: 'well', max: 0.75, label: 'Well within', hint: 'under 75% of the limit used' },
  { id: 'marginal', max: 1, label: 'Marginal', hint: '75% to 100% used' },
  { id: 'over', max: 1.2, label: 'Over', hint: 'up to 20% above the limit' },
  { id: 'beyond', max: Infinity, label: 'Well beyond', hint: 'more than 20% above the limit' },
];
/** { used, level } for what was spent against the limit; null when there is nothing to judge. */
export function statusOf(spent, limit) {
  if (!(limit > 0)) return spent > 0 ? { used: null, level: { id: 'nolimit', label: 'No income expected', hint: 'no limit to compare with' } } : null;
  const used = spent / limit;
  return { used, level: LEVELS.find((l) => used <= l.max + 1e-9) || LEVELS[LEVELS.length - 1] };
}

/** Months in a period: 'this', 'prev', 'ty' (this year so far), 'py' (previous year), or one month 'YYYY-MM'. Only months with bank entries (or the current one). */
export function periodMonths(key, asOf, ledgerMonths) {
  const cur = C.monthKey(asOf), have = new Set(ledgerMonths.concat(cur)), y = Number(cur.slice(0, 4));
  const prev = C.addMonths(cur + '-01', -1).slice(0, 7);
  if (key === 'this') return [cur];
  if (key === 'prev') return [prev];
  if (/^\d{4}-\d\d$/.test(key)) return [key];
  const year = key === 'py' ? y - 1 : y;
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter((m) => m <= cur && (have.has(m)));
}

/**
 * The lines of a month with whether each counts. `override` maps a lowercase line name to true/false;
 * without one a line counts the way Home counts it (groups always, other payments only if ticked on Home).
 */
export function monthLines(mc, override = {}) {
  const other = new Map(mc.others.map((o) => [o.name.toLowerCase(), o]));
  const lines = mc.spend.concat([mc.lifestyle]).map((g) => ({ name: g.name, amount: g.amount, cats: g.cats || [], other: other.has(g.name.toLowerCase()), homeCounts: true }))
    .concat(mc.others.filter((o) => !o.counted).map((o) => ({ name: o.name, amount: o.amount, cats: [o.key], other: true, homeCounts: false })));
  return lines.filter((l) => l.amount > 0.5).map((l) => { const v = override[l.name.toLowerCase()]; return { ...l, counted: v == null ? l.homeCounts : !!v }; });
}

/** One month: limit (expected interest income), received, counted spending, the left over and the status. */
export function monthRow(data, all, month, override = {}) {
  const mc = C.monthCashflow(data, all, month), lines = monthLines(mc, override);
  const spent = lines.filter((l) => l.counted).reduce((a, l) => a + l.amount, 0), limit = mc.totalExpected;
  return { month, limit, received: mc.totalReceived, spent, left: limit - spent, status: statusOf(spent, limit), lines, mc };
}

/** Several months added up, with the status of the whole period. */
export function periodTotal(rows) {
  const limit = rows.reduce((a, r) => a + r.limit, 0), spent = rows.reduce((a, r) => a + r.spent, 0), received = rows.reduce((a, r) => a + r.received, 0);
  const byLevel = {}; for (const r of rows) if (r.status) byLevel[r.status.level.id] = (byLevel[r.status.level.id] || 0) + 1;
  return { limit, spent, received, left: limit - spent, status: statusOf(spent, limit), byLevel };
}
/** Spending lines added up over the months; counted lines first, biggest first. */
export function mixOf(rows) {
  const m = new Map();
  for (const r of rows) for (const l of r.lines) { const k = l.name.toLowerCase(), x = m.get(k) || { name: l.name, amount: 0, counted: l.counted, other: l.other, cats: l.cats }; x.amount += l.amount; x.counted = l.counted; m.set(k, x); }
  return [...m.values()].sort((a, b) => (b.counted - a.counted) || b.amount - a.amount);
}
