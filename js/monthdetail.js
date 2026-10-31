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
// Heat map colours. `used` is spending as a share of the limit. Under the limit: the less spent, the deeper the green, and it fades
// to a pale neutral at 100%. Over the limit: it grows from that same pale neutral into deep red by HEAT_MAX (160%) and stays there.
// Both sides meet at the same pale colour, so the change around the limit is smooth. The text colour is picked for contrast.
export const HEAT_MAX = 1.6;
const hsl = (hh, ss, ll) => { const a = (ss / 100) * Math.min(ll / 100, 1 - ll / 100), f = (n) => { const k = (n + hh / 30) % 12; return Math.round(255 * (ll / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const rgbCss = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** { bg, fg, bd } for a month that used `used` of its limit (1 = exactly the limit). */
export function heat(used) {
  const u = Math.max(0, Math.min(HEAT_MAX, used));
  const over = u > 1, d = over ? Math.min(1, (u - 1) / (HEAT_MAX - 1)) : 1 - u;     // depth 0 (pale) to 1 (deep)
  const e = Math.pow(d, 0.85);
  const bg = hsl(over ? 358 : 142, 12 + 58 * e, 93 - 56 * e);
  // dark ink on light fills, white on deep ones; whichever has the better contrast
  const L = lum(bg), dark = (L + 0.05) / (lum([17, 24, 39]) + 0.05), light = 1.05 / (L + 0.05);
  const fg = dark >= light ? '#111827' : '#ffffff';
  return { bg: rgbCss(bg), fg, bd: rgbCss(hsl(over ? 358 : 142, 20 + 55 * e, 93 - 56 * e - 12)) };
}
/** Stops for the legend: a smooth bar from 0% to HEAT_MAX of the limit. */
export function heatGradient(steps = 16) {
  return `linear-gradient(90deg, ${Array.from({ length: steps + 1 }, (_, i) => { const u = (HEAT_MAX * i) / steps; return `${heat(u).bg} ${((i / steps) * 100).toFixed(1)}%`; }).join(', ')})`;
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
