// Category rules and maintenance. Pure functions on the data object, no DOM.
//
// data.categoryList: [{ name, kind, budget }]   kind: expense | income | investment | transfer
//   expense     counts as an expense
//   income      counts as income
//   investment  money put into an investment (not spending)
//   transfer    moves between your own accounts or cash withdrawals, left out of income and spending
// data.categories: [{ desc, category, type }]   auto-fill rules: a known description picks its category
//
// Older data files have no categoryList. It is worked out from the names, exactly as the workbook did.

export const KINDS = [
  { key: 'expense', label: 'Expenses', one: 'Expense' },
  { key: 'income', label: 'Income', one: 'Income' },
  { key: 'investment', label: 'Investments', one: 'Investment' },
  { key: 'transfer', label: 'Not counted (transfers)', one: 'Not counted' },
];
export const kindLabel = (k) => (KINDS.find((x) => x.key === k) || KINDS[0]).one;

/** The Home screen groups these by name, so they cannot be renamed, merged or deleted. */
export const PROTECTED = new Set(['salary', 'income bond', 'loan', 'tax', 'family budget', 'food', 'medical', 'travel', 'rent', 'utilities', 'cloths', 'entertainment', 'vacation', 'gifts', 'transfer', 'withdrawal']);
export const isProtected = (name) => PROTECTED.has((name || '').toLowerCase());

const lc = (s) => (s || '').trim().toLowerCase();

export function deriveKind(name, types = []) {
  const n = lc(name);
  if (/^investment/.test(n)) return 'investment';
  if (n === 'transfer' || n === 'withdrawal') return 'transfer';
  if (types.length && types.every((t) => t === 'Income')) return 'income';
  return 'expense';
}

/** The list as stored, or derived from the rules and the ledger for older files. Never changes `data`. */
export function categoryList(data) {
  if (data.categoryList) {
    // names used in the ledger but missing from the list still need a place
    const have = new Set(data.categoryList.map((c) => lc(c.name)));
    const extra = [...new Set((data.ledger || []).map((e) => e.category).filter(Boolean))].filter((n) => !have.has(lc(n)));
    return data.categoryList.concat(extra.map((name) => ({ name, kind: deriveKind(name), budget: 0 })));
  }
  const types = new Map();
  for (const r of data.categories || []) {
    const k = lc(r.category);
    types.set(k, { name: r.category, types: [...((types.get(k) || { types: [] }).types), r.type] });
  }
  for (const e of data.ledger || []) if (e.category && !types.has(lc(e.category))) types.set(lc(e.category), { name: e.category, types: [] });
  return [...types.values()].map((t) => ({ name: t.name, kind: deriveKind(t.name, t.types), budget: 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

/** lower-case name -> kind */
export function kindMap(data) {
  return new Map(categoryList(data).map((c) => [lc(c.name), c.kind]));
}
/** Function form with a sensible fallback for names that are not in the list. */
export function kindOf(data) {
  const m = kindMap(data);
  return (name) => m.get(lc(name)) || deriveKind(name);
}

/** Make the list part of the data so it can be edited. */
export function ensure(d) {
  d.categoryList = categoryList(d).map((c) => ({ name: c.name, kind: c.kind, budget: c.budget || 0, ...(c.yearlyBudget > 0 ? { yearlyBudget: c.yearlyBudget } : {}) }));
  d.categories = d.categories || [];
  return d.categoryList;
}

/** entries, money in and out for each category (lower-case key) */
export function usage(data, sinceMonth = null) {
  const m = new Map();
  for (const e of data.ledger) {
    const k = lc(e.category);
    const u = m.get(k) || { count: 0, debit: 0, credit: 0, recent: 0, last: '' };
    u.count++; u.debit += e.debit || 0; u.credit += e.credit || 0;
    if (sinceMonth && e.date.slice(0, 7) >= sinceMonth) u.recent += (e.debit || 0) + (e.credit || 0);
    if (e.date > u.last) u.last = e.date;
    m.set(k, u);
  }
  return m;
}

export const exists = (data, name) => categoryList(data).some((c) => lc(c.name) === lc(name));

/** Add a category (does nothing when the name exists). Returns the stored name. */
export function add(d, { name, kind = 'expense', budget = 0, yearlyBudget = 0 }) {
  const list = ensure(d);
  const hit = list.find((c) => lc(c.name) === lc(name));
  if (hit) return hit.name;
  list.push({ name: name.trim(), kind, budget: budget || 0, ...(yearlyBudget > 0 ? { yearlyBudget } : {}) });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return name.trim();
}

/** Change name, type or budget. A new name that matches another category merges into it. */
export function update(d, oldName, { name, kind, budget, yearlyBudget }) {
  const list = ensure(d);
  const cur = list.find((c) => lc(c.name) === lc(oldName));
  if (!cur) return;
  const newName = (name || cur.name).trim();
  if (lc(newName) !== lc(cur.name) || newName !== cur.name) {
    if (isProtected(cur.name)) throw new Error('This name is used by the Home screen, so it cannot be changed.');
    const other = list.find((c) => c !== cur && lc(c.name) === lc(newName));
    if (other) { merge(d, cur.name, other.name); return; }
    for (const e of d.ledger) if (lc(e.category) === lc(cur.name)) e.category = newName;
    for (const r of d.categories) if (lc(r.category) === lc(cur.name)) r.category = newName;
    cur.name = newName;
  }
  if (kind) cur.kind = kind;
  if (budget != null) cur.budget = budget || 0;
  if (yearlyBudget !== undefined) { if (yearlyBudget > 0) cur.yearlyBudget = yearlyBudget; else delete cur.yearlyBudget; }
  list.sort((a, b) => a.name.localeCompare(b.name));
}

/** Move everything from one category into another and remove the first. */
export function merge(d, from, to) {
  const list = ensure(d);
  if (lc(from) === lc(to)) return;
  if (isProtected(from)) throw new Error('This name is used by the Home screen, so it cannot be merged away.');
  const target = list.find((c) => lc(c.name) === lc(to));
  if (!target) throw new Error('Pick a category to move to.');
  for (const e of d.ledger) if (lc(e.category) === lc(from)) e.category = target.name;
  for (const r of d.categories) if (lc(r.category) === lc(from)) r.category = target.name;
  const src = list.find((c) => lc(c.name) === lc(from));
  if (src && !target.budget && src.budget && src.kind === target.kind) target.budget = src.budget;
  if (src && !target.yearlyBudget && src.yearlyBudget && src.kind === target.kind) target.yearlyBudget = src.yearlyBudget;
  d.categoryList = list.filter((c) => lc(c.name) !== lc(from));
}

/** Remove an unused category. Used ones must be merged into another first. */
export function remove(d, name) {
  const list = ensure(d);
  if (isProtected(name)) throw new Error('This name is used by the Home screen, so it cannot be deleted.');
  if (d.ledger.some((e) => lc(e.category) === lc(name))) throw new Error('This category has entries. Move them to another category first.');
  d.categoryList = list.filter((c) => lc(c.name) !== lc(name));
  d.categories = d.categories.filter((r) => lc(r.category) !== lc(name));
}

/** Auto-fill rule: when a description is typed, which category to pick. */
export function setRule(d, desc, category) {
  const rule = d.categories.find((r) => lc(r.desc) === lc(desc));
  const kind = (categoryList(d).find((c) => lc(c.name) === lc(category)) || {}).kind;
  const type = kind === 'income' ? 'Income' : 'Expense';
  if (rule) { rule.category = category; rule.type = rule.type || type; } else d.categories.push({ desc: desc.trim(), category, type });
}
export function removeRule(d, desc) { d.categories = d.categories.filter((r) => lc(r.desc) !== lc(desc)); }

/** Budget lines for a month: spending categories that have a monthly budget. */
export function budgetLines(data, spentByCategory) {
  const spent = new Map(spentByCategory.map((x) => [lc(x.category), x.amount]));
  return categoryList(data).filter((c) => c.kind === 'expense' && c.budget > 0)
    .map((c) => ({ name: c.name, budget: c.budget, spent: spent.get(lc(c.name)) || 0 }))
    .map((x) => ({ ...x, left: x.budget - x.spent, used: x.budget ? x.spent / x.budget : 0 }))
    .sort((a, b) => b.used - a.used);
}

/** Spending categories that have a yearly budget: spent so far this year against it. */
export function yearlyLines(data, spentByCategory) {
  const spent = new Map(spentByCategory.map((x) => [lc(x.category), x.amount]));
  return categoryList(data).filter((c) => c.kind === 'expense' && c.yearlyBudget > 0)
    .map((c) => ({ name: c.name, budget: c.yearlyBudget, spent: spent.get(lc(c.name)) || 0 }))
    .map((x) => ({ ...x, left: x.budget - x.spent, used: x.spent / x.budget }))
    .sort((a, b) => b.used - a.used);
}
/** Categories close to (nearAt, default 80%) or over a budget: this month against the monthly budget, this year against the yearly one. */
export function budgetAlerts(data, monthSpent, yearSpent, nearAt = 0.8) {
  const out = [];
  for (const l of budgetLines(data, monthSpent)) if (l.used >= nearAt) out.push({ ...l, scope: 'month', over: l.used > 1 });
  for (const l of yearlyLines(data, yearSpent)) if (l.used >= nearAt) out.push({ ...l, scope: 'year', over: l.used > 1 });
  return out.sort((a, b) => (b.over - a.over) || (b.used - a.used));
}

// ---- one-time spending: tax, school fees, a holiday, a function. Paid once or twice a year, not part of the monthly run. ----
const ONE_TIME_GUESS = /tax|vacation|holiday|trip|school|tuition|fee|donat|function|gift|festival|insurance|premium|wedding/i;
/** Expense categories seen in the bank entries. */
export function expenseCategoryNames(data) {
  const kind = kindOf(data);
  return [...new Set((data.ledger || []).filter((e) => e.debit > 0 && kind(e.category) === 'expense').map((e) => e.category || 'Unknown'))];
}
/** Every category there is, from the category list and from bank entries, with its kind, so one-time choices can be made from the full set. */
export function allCategories(data) {
  const kind = kindOf(data), seen = new Map();
  for (const c of categoryList(data)) seen.set(lc(c.name), { name: c.name, kind: c.kind || kind(c.name) });
  for (const e of data.ledger || []) { const n = e.category || 'Unknown'; if (!seen.has(lc(n))) seen.set(lc(n), { name: n, kind: kind(n) }); }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
/** Categories treated as one-time: the saved choice (data.settings.oneTimeCats), else a guess from the names. Lower case. */
export function oneTimeSet(data) {
  const saved = data.settings && data.settings.oneTimeCats;
  if (Array.isArray(saved)) return new Set(saved.map(lc));
  return new Set(expenseCategoryNames(data).filter((n) => ONE_TIME_GUESS.test(n)).map(lc));
}
