// The monthly budget that Home's "This month in detail" and the Month in detail page measure spending against.
// By default it is the interest income expected in the month (bonds and lending). The owner can instead fix an amount:
//   settings.budgetPlan = { year: { y: 2026, amount: 80000 }, months: { '2026-11': 80000, '2026-12': 'interest' } }
// Both parts are optional, so older files work without them. Months before the current one are always the interest income.
// Nothing here changes what is expected, received or spent; it only picks the budget figure.

/** The three months the budget can be set for: this month and the next two. */
export const windowMonths = (curMonth) => { const y = Number(curMonth.slice(0, 4)), m = Number(curMonth.slice(5, 7)) - 1; return [0, 1, 2].map((i) => { const t = m + i; return `${y + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }); };

/** { amount, source: 'interest' | 'manual', interest } for one month. `interest` is the expected interest income of that month. */
export function budgetFor(data, month, curMonth, interest) {
  const bp = (data.settings && data.settings.budgetPlan) || null;
  const pick = (amount, source) => ({ amount, source, interest });
  if (!bp || month < curMonth) return pick(interest, 'interest');
  const own = bp.months && bp.months[month];
  if (typeof own === 'number' && own > 0) return pick(own, 'manual');
  if (own === 'interest') return pick(interest, 'interest');
  if (bp.year && Number(bp.year.amount) > 0 && String(bp.year.y) === month.slice(0, 4)) return pick(Number(bp.year.amount), 'manual');
  return pick(interest, 'interest');
}

/** What the setting form edits, read from the saved plan. */
export function formValues(data, curMonth) {
  const bp = (data.settings && data.settings.budgetPlan) || {}, v = {};
  v.yearMode = bp.year && Number(bp.year.amount) > 0 && String(bp.year.y) === curMonth.slice(0, 4) ? 'fixed' : 'interest';
  v.yearAmount = v.yearMode === 'fixed' ? Number(bp.year.amount) : '';
  windowMonths(curMonth).forEach((m, i) => {
    const own = bp.months && bp.months[m];
    v['m' + i] = typeof own === 'number' && own > 0 ? 'fixed' : own === 'interest' ? 'interest' : 'follow';
    v['a' + i] = typeof own === 'number' && own > 0 ? own : '';
  });
  return v;
}

/** Writes the form back. Only months from this month on are kept; older entries are dropped because those months follow the interest income. */
export function save(d, curMonth, v) {
  const months = {}, win = windowMonths(curMonth);
  win.forEach((m, i) => { if (v['m' + i] === 'fixed' && v['a' + i] > 0) months[m] = Number(v['a' + i]); else if (v['m' + i] === 'interest') months[m] = 'interest'; });
  const plan = {};
  if (v.yearMode === 'fixed' && v.yearAmount > 0) plan.year = { y: Number(curMonth.slice(0, 4)), amount: Number(v.yearAmount) };
  if (Object.keys(months).length) plan.months = months;
  if (plan.year || plan.months) d.settings.budgetPlan = plan; else delete d.settings.budgetPlan;
}
