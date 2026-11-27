// Suggested budgets from your own last twelve months (pure logic, nothing is saved here; you review and save).
// A category spent in most months gets a monthly budget (the usual month, rounded up to ₹500).
// A category spent in only a few months is lumpy, so it gets a yearly pool (the year's total, rounded up to ₹1,000).
import { categoryList, kindOf } from './categories.js';

const lc = (s) => (s || '').trim().toLowerCase();
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const SUGGEST = { regularMonths: 8, minTotal: 1000 };

/** The 12 finished months before `asOf`'s month, oldest first. */
export function lastMonths(asOf, n = 12) {
  let y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7)) - 1; const out = [];
  for (let i = 0; i < n; i++) { if (m === 0) { m = 12; y--; } out.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; }
  return out;
}
/**
 * @returns [{ name, kind: 'monthly'|'yearly', amount, months (with spending), total, usual, text }] for expense categories that have no budget yet
 *   (or every expense category with `all: true`), biggest first. Empty when there is less than 3 months of history.
 */
export function suggestBudgets(data, asOf, { all = false } = {}) {
  const months = lastMonths(asOf), kind = kindOf(data), first = (data.ledger || []).reduce((a, e) => (e.date && (!a || e.date < a) ? e.date : a), '');
  const have = months.filter((m) => first && m >= first.slice(0, 7));
  if (have.length < 3) return [];
  const idx = new Set(have), by = new Map(), names = new Map();
  for (const e of data.ledger || []) {
    if (!(e.debit > 0) || kind(e.category) !== 'expense') continue;
    const m = e.date.slice(0, 7); if (!idx.has(m)) continue;
    const k = lc(e.category), c = by.get(k) || new Map(); c.set(m, (c.get(m) || 0) + e.debit); by.set(k, c); names.set(k, (e.category || '').trim());
  }
  const budgeted = new Set(categoryList(data).filter((c) => c.kind === 'expense' && (c.budget > 0 || c.yearlyBudget > 0)).map((c) => lc(c.name)));
  const out = [];
  for (const [k, c] of by) {
    if (!all && budgeted.has(k)) continue;
    const vals = [...c.values()], total = vals.reduce((a, b) => a + b, 0);
    if (total < SUGGEST.minTotal) continue;
    const scale = 12 / have.length, regular = vals.length >= Math.ceil(SUGGEST.regularMonths * have.length / 12);
    const usual = median(vals);
    out.push(regular
      ? { name: names.get(k), kind: 'monthly', amount: Math.ceil(usual / 500) * 500, months: vals.length, total, usual, text: `spent in ${vals.length} of ${have.length} months, usually about ${Math.round(usual).toLocaleString('en-IN')}` }
      : { name: names.get(k), kind: 'yearly', amount: Math.ceil((total * scale) / 1000) * 1000, months: vals.length, total, usual, text: `spent in only ${vals.length} of ${have.length} months, ${Math.round(total).toLocaleString('en-IN')} in all` });
  }
  return out.sort((a, b) => b.total - a.total);
}
