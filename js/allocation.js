// How a month's investable money is shared among the plan's "New money" lines. Pure functions, no DOM.
//
// Every line may carry two optional settings (old plans without them work exactly as before):
//   mode:     'pct' (default) the line takes its calculated share of the month's money, or 'amt' a fixed amount (its `monthly`)
//   priority: 1, 2, 3 ... the line is filled in this order; lines without a priority come after the numbered ones, in the order listed
//
// The rules:
//   1. Lines are filled one by one in priority order from the money available.
//   2. A fixed line asks for its amount; a share line asks for its calculated share of the money available. The calculated share is the
//      line's `monthly` over the total of all share lines (so with no fixed lines it is the plain share of the plan, as before).
//   3. A line never gets more than what is still left, so a short month fills the top priorities and leaves the rest with nothing.
//   4. Money still left after every line has had its turn goes to the last line in the order.

/** 'amt' or 'pct'. Anything else (including no setting) is a share. */
export const modeOf = (l) => (l && l.mode === 'amt' ? 'amt' : 'pct');
/** The priority number, or null when there is none. */
export const priorityOf = (l) => { const n = Number(l && l.priority); return Number.isFinite(n) && n >= 1 ? Math.round(n) : null; };
/** A line that takes part: it has a positive amount (a fixed amount, or the weight of its share). */
const counts = (l) => (Number(l && l.monthly) || 0) > 0;

/** True when the plan uses a fixed amount or a priority anywhere, i.e. the new rules matter. */
export const hasRules = (lines) => (lines || []).some((l) => modeOf(l) === 'amt' || priorityOf(l) != null);

/** Positions of the lines in the order they are filled: by priority, then the order listed. */
export function orderOf(lines) {
  return lines.map((l, i) => ({ i, p: priorityOf(l) })).sort((a, b) => ((a.p ?? Infinity) - (b.p ?? Infinity)) || a.i - b.i || 0).map((x) => x.i);
}

/**
 * Share `amount` among `lines` ([{ monthly, mode, priority, ... }]).
 * Returns { rows, amounts, left }:
 *   rows    the lines in the order they are filled, each { ...line, i (position in `lines`), order (1,2,3..), want, amount, share (of `amount`), extra (excess added to it), capped }
 *   amounts the amount of each line, in the order of `lines`
 *   left    money that no line could take (only when there is no line with an amount at all)
 */
export function allocate(amount, lines) {
  const list = lines || [], money = Math.max(0, Number(amount) || 0);
  const amounts = list.map(() => 0);
  const order = orderOf(list).filter((i) => counts(list[i]));
  const shareTotal = order.reduce((t, i) => (modeOf(list[i]) === 'pct' ? t + Number(list[i].monthly) : t), 0);
  let rest = money;
  const rows = order.map((i, k) => {
    const l = list[i], fixed = modeOf(l) === 'amt';
    const want = fixed ? Number(l.monthly) : shareTotal > 0 ? (money * Number(l.monthly)) / shareTotal : 0;
    const got = Math.min(want, rest);
    rest -= got; amounts[i] = got;
    return { ...l, i, order: k + 1, want, amount: got, extra: 0, capped: got < want - 0.005 };
  });
  // the last option takes whatever is left, even beyond what it asked for
  if (rows.length && rest > 0.005) { const last = rows[rows.length - 1]; last.amount += rest; last.extra = rest; amounts[last.i] += rest; rest = 0; }
  for (const r of rows) r.share = money > 0 ? r.amount / money : 0;
  return { rows, amounts, left: rows.length ? 0 : money };
}

/**
 * The share each line stands for when no month's amount is known, e.g. on the plan page: the split of the lines' own amounts added together
 * (what the plan would invest if every line got what it asks for). Returns { rows, total }, rows as in `allocate`.
 */
export function plannedShares(lines) {
  const total = (lines || []).filter(counts).reduce((t, l) => t + Number(l.monthly), 0);
  return { ...allocate(total, lines), total };
}

/** A few plain words for a line: "Priority 2 · fixed" or "Share · no priority". */
export function describe(l) {
  const p = priorityOf(l);
  return (p != null ? 'Priority ' + p : 'No priority') + ' · ' + (modeOf(l) === 'amt' ? 'fixed amount' : 'share of the month');
}
