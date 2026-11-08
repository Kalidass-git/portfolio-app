// Month in detail: pure logic (no DOM). How far each month went against its limit, and what counts as spending.
//
// The limit of a month is its budget: the interest income expected in it (default), or the amount the owner fixed in Categories & budgets. Home's "This month in detail" uses the same budget.
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
// Heat map: six colour bands by the share of the limit used (the colours themselves live in css/app.css as .hz-<id>, for light and dark).
//   under 60% green, 60-80% light green, 80-100% amber, 100-120% light orange, 120-160% red, above 160% deep red.
// This is only how a month is coloured; the status levels above and every figure are unchanged.
export const HEAT_MAX = 1.6;
export const BANDS = [
  { id: 'g', max: 0.6, label: 'Low', range: 'under 60%' },
  { id: 'lg', max: 0.8, label: 'Comfortable', range: '60 to 80%' },
  { id: 'y', max: 1, label: 'Near the limit', range: '80 to 100%' },
  { id: 'o', max: 1.2, label: 'Slightly over', range: '100 to 120%' },
  { id: 'r', max: 1.6, label: 'Over', range: '120 to 160%' },
  { id: 'd', max: Infinity, label: 'Far over', range: 'above 160%' },
];
/** The band of a month that used `used` of its limit (1 = exactly the limit). A month exactly on a boundary belongs to the lower band. */
export const bandOf = (used) => BANDS.find((b) => used <= b.max + 1e-9) || BANDS[BANDS.length - 1];

/**
 * One short, changing sentence about the month being looked at.
 * @param rows  [{ month, spent, limit, status }] for the months of the year shown (months with a limit have status.used)
 * @param month 'YYYY-MM' the month in focus
 * @param cur   'YYYY-MM' the current month (it is not finished, so it reads "so far")
 * @returns { tone: 'good'|'ok'|'warn'|'bad', title, text } or null when there is nothing to judge
 */
export function monthInsight(rows, month, cur, money = (v) => String(Math.round(v)), label = (m) => m) {
  const r = rows.find((x) => x.month === month);
  if (!r || !r.status || r.status.used == null) return null;
  const used = r.status.used, band = bandOf(used), pc = Math.round(used * 100) + '%', now = month === cur;
  const others = rows.filter((x) => x.month !== month && x.status && x.status.used != null && (!now || x.month < cur));
  const avg = others.length ? others.reduce((a, x) => a + x.status.used, 0) / others.length : null;
  const vs = avg == null ? '' : used < avg * 0.85 ? `, lower than your usual ${Math.round(avg * 100)}%` : used > avg * 1.15 ? `, higher than your usual ${Math.round(avg * 100)}%` : `, close to your usual ${Math.round(avg * 100)}%`;
  const left = r.limit - r.spent, m = label(month), so = now ? ' so far' : '';
  const title = { g: now ? 'Great control this month' : 'Well controlled', lg: 'Comfortably within the limit', y: 'Close to the limit', o: 'Slightly over the limit', r: 'Over the limit', d: 'Far over the limit' }[band.id];
  const tail = left >= 0 ? `${money(left)} still within the limit` : `${money(-left)} over the limit`;
  return { tone: { g: 'good', lg: 'good', y: 'ok', o: 'warn', r: 'bad', d: 'bad' }[band.id], band: band.id, title, text: `${m}: ${pc} of the limit used${so}${vs}. ${tail}.` };
}

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
  const spent = lines.filter((l) => l.counted).reduce((a, l) => a + l.amount, 0), limit = mc.budget;
  return { month, limit, expected: mc.totalExpected, source: mc.budgetSource, received: mc.totalReceived, spent, left: limit - spent, status: statusOf(spent, limit), lines, mc };
}

/** Several months added up, with the status of the whole period. */
export function periodTotal(rows) {
  const expected = rows.reduce((a, r) => a + r.expected, 0), manual = rows.some((r) => r.source === 'manual');
  const limit = rows.reduce((a, r) => a + r.limit, 0), spent = rows.reduce((a, r) => a + r.spent, 0), received = rows.reduce((a, r) => a + r.received, 0);
  const byLevel = {}; for (const r of rows) if (r.status) byLevel[r.status.level.id] = (byLevel[r.status.level.id] || 0) + 1;
  return { limit, expected, manual, spent, received, left: limit - spent, status: statusOf(spent, limit), byLevel };
}
/** Spending lines added up over the months; counted lines first, biggest first. */
export function mixOf(rows) {
  const m = new Map();
  for (const r of rows) for (const l of r.lines) { const k = l.name.toLowerCase(), x = m.get(k) || { name: l.name, amount: 0, counted: l.counted, other: l.other, cats: l.cats }; x.amount += l.amount; x.counted = l.counted; m.set(k, x); }
  return [...m.values()].sort((a, b) => (b.counted - a.counted) || b.amount - a.amount);
}
