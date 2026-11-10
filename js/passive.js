// Passive Income Planner: fund the household's expenses from passive income (bond and lending interest, rent, dividends) and keep the salary invested.
// Everything here is read from data the app already has (bonds, income lines, the bank ledger and its categories). The only thing saved is the owner's plan,
// one optional object, settings.passivePlan, so older files work without it and nothing that exists is renamed or removed:
//   { alloc: [{ id, src, cat, amount }],      amount = ₹ per month that source pays towards that expense category
//     freq:  { [src]: 'monthly' | 'quarterly' | 'halfyearly' | 'yearly' },   how often an income line is credited (its amount is then divided to a monthly figure)
//     extra: [{ id, name, amount, freq, match }],   other passive income typed in (rent, dividends...); `match` finds its bank credits
//     skip:  [category names left out of the plan], carry: true | false, from: 'YYYY-MM' (first month of the plan),
//     expense: { [category in lower case]: { name, mode: 'fixed', amount, freq, lump: { amount, every } } }   an expense that costs the same every time, instead of the average of past months;
//              lump = a further payment made once every `every` months (maintenance at quarter end), planned as a share of every month
//     merge: { [category in lower case]: 'Other category' }   a category counted as part of another (Maintenance as part of Rent)
//     order: [category names, first = paid first]   the priority a month's income is used in }
// An allocation is a plan, not a promise: each month the income that really arrives is used in that order, so a smaller month pays the first expenses in full and leaves the last ones short.
// Nothing here changes a budget: allocations are only ever changed by the owner.
import * as C from './calc.js';
import { kindOf } from './categories.js';

export const FREQ = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };
export const FREQ_LABEL = { monthly: 'Monthly', quarterly: 'Quarterly', halfyearly: 'Half-yearly', yearly: 'Yearly' };
const lc = (s) => String(s || '').trim().toLowerCase();
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const r0 = (n) => Math.round(n);
const SALARYISH = /salary|wage|payroll/i;

/** The saved plan with every part present. */
export function planOf(data, all) {
  const p = (data.settings && data.settings.passivePlan) || {};
  let alloc = (p.alloc || []).map((a) => ({ ...a }));
  if (all && all.bonds) {   // allocations saved against one bond now belong to that bond's group (monthly or quarterly)
    const grp = new Map(all.bonds.map((b) => ['bond:' + b.id, bondGroup(b)]));
    alloc = alloc.map((a) => (grp.has(a.src) ? { ...a, src: grp.get(a.src) } : a));
    const seen = new Map(); for (const a of alloc) { const k = a.src + '|' + lc(a.cat), o = seen.get(k); if (o) o.amount = (Number(o.amount) || 0) + (Number(a.amount) || 0); else seen.set(k, a); }
    alloc = [...seen.values()];
  }
  const mg = p.merge || {};
  if (Object.keys(mg).length) {   // an allocation to a category that is now part of another belongs to the other one
    alloc = alloc.map((a) => (mg[lc(a.cat)] ? { ...a, cat: mg[lc(a.cat)] } : a));
    const seen = new Map(); for (const a of alloc) { const k = a.src + '|' + lc(a.cat), o = seen.get(k); if (o) o.amount = (Number(o.amount) || 0) + (Number(a.amount) || 0); else seen.set(k, a); }
    alloc = [...seen.values()];
  }
  return { alloc, freq: { ...(p.freq || {}) }, extra: (p.extra || []).map((x) => ({ ...x })), skip: [...(p.skip || [])], carry: p.carry !== false, from: p.from || '', order: [...(p.order || [])], expense: { ...(p.expense || {}) }, merge: { ...(p.merge || {}) } };
}
export const bondGroup = (b) => (b.credit === 'Quarterly' ? 'bondgrp:quarterly' : 'bondgrp:monthly');
/** Writes the plan into a data object inside mutate(). */
export function savePlan(d, plan) {
  d.settings = d.settings || {};
  d.settings.passivePlan = { alloc: plan.alloc.map((a) => ({ id: a.id, src: a.src, cat: a.cat, amount: r0(a.amount) })), freq: plan.freq, extra: plan.extra, skip: plan.skip, carry: plan.carry !== false, from: plan.from || '', order: plan.order || [], expense: plan.expense || {}, merge: plan.merge || {} };
}
export const newId = (list, p) => { let n = list.length + 1; const have = new Set(list.map((x) => x.id)); while (have.has(p + n)) n++; return p + n; };

/** Months between two month keys, oldest first. */
export function monthsBetween(a, b) { const out = []; let m = a; while (m <= b && out.length < 60) { out.push(m); m = C.addMonths(m + '-01', 1).slice(0, 7); } return out; }
const prevMonths = (cur, n) => { const out = []; let m = cur; for (let i = 0; i < n; i++) { m = C.addMonths(m + '-01', -1).slice(0, 7); out.unshift(m); } return out; };

/** The monthly figure of an amount credited every `freq`. */
export const monthlyEquivalent = (amount, freq) => (Number(amount) || 0) / (FREQ[freq] || 1);

/** Passive income sources: every bond held, every monthly income line that is not salary, and the extra lines typed in. monthly = the planning figure. */
export function sources(data, all) {
  const plan = planOf(data, all), asOf = all.asOf, tds = data.settings.tdsRate ?? 0.1, out = [];
  const groups = { 'bondgrp:monthly': { n: 0, monthly: 0, members: [] }, 'bondgrp:quarterly': { n: 0, monthly: 0, members: [] } };
  for (const b of all.bonds || []) {
    const monthly = Number(b.monthNet) || 0, end = b.closed && b.closed.date ? b.closed.date : b.maturityDate;
    if (!(monthly > 0.5) || (end && end < C.monthStart(asOf))) continue;
    const g = groups[bondGroup(b)]; g.n++; g.monthly += monthly; g.members.push({ id: b.id, name: b.name, monthly });
  }
  for (const [key, g] of Object.entries(groups)) if (g.n) {
    const q = key.endsWith('quarterly');
    out.push({ key, name: q ? 'Quarterly bonds' : 'Monthly bonds', kind: 'bond', sub: `${g.n} bond${g.n === 1 ? '' : 's'} paying ${q ? 'every quarter' : 'every month'}`, freq: q ? 'quarterly' : 'monthly', monthly: g.monthly, fixedFreq: true, tds, members: g.members });
  }
  for (const m of data.manualMonthlyIncome || []) {
    if (SALARYISH.test(m.name) || !(Number(m.amount) > 0)) continue;
    const w = C.incomeWindow(data, m);
    if (w.ends && w.ends < C.monthStart(asOf)) continue;
    const key = 'inc:' + lc(m.name), freq = plan.freq[key] || 'monthly';
    out.push({ key, name: m.name, kind: 'lending', sub: 'Interest income line', freq, amount: Number(m.amount), monthly: monthlyEquivalent(m.amount, freq), match: m.match });
  }
  for (const x of plan.extra) out.push({ key: 'x:' + x.id, name: x.name, kind: 'other', sub: 'Added by you', freq: x.freq || 'monthly', amount: Number(x.amount) || 0, monthly: monthlyEquivalent(x.amount, x.freq), match: x.match, extraId: x.id });
  return out.map((s) => ({ ...s, monthly: r0(s.monthly) }));
}

/** Expense categories with what each costs a month. A fixed expense costs its set amount (a quarterly one divided to a month); any other costs the average of up to three finished months,
 *  else this month so far. A category counted as part of another is folded into it. raw = true gives the categories as the bank entries name them, before folding, for the settings sheet. */
export function categories(data, all, raw = false) {
  const plan = planOf(data, all), kind = kindOf(data), cur = C.monthKey(all.asOf), skip = new Set(plan.skip.map(lc));
  const months = C.ledgerMonths(data).filter((m) => m < cur).slice(-3), use = months.length ? months : [cur];
  const by = new Map();
  for (const e of data.ledger || []) {
    if (!(e.debit > 0) || kind(e.category) !== 'expense') continue;
    const m = C.monthKey(e.date), name = (e.category || 'Unknown').trim();
    if (!use.includes(m) && m !== cur) continue;
    const r = by.get(lc(name)) || { name, base: 0, cur: 0 };
    if (use.includes(m)) r.base += e.debit; if (m === cur) r.cur += e.debit;
    by.set(lc(name), r);
  }
  for (const a of plan.alloc) if (!by.has(lc(a.cat))) by.set(lc(a.cat), { name: a.cat, base: 0, cur: 0 });
  for (const [k, x] of Object.entries(plan.expense)) if (x && x.mode === 'fixed' && !by.has(k)) by.set(k, { name: x.name || k, base: 0, cur: 0 });
  const rows = [...by.values()].map((r) => {
    const usual = r0(r.base / use.length), fx = plan.expense[lc(r.name)], lump = fx && fx.lump && Number(fx.lump.amount) > 0 ? { amount: Number(fx.lump.amount), every: [2, 3, 4, 6, 12].includes(Number(fx.lump.every)) ? Number(fx.lump.every) : 3 } : null;
    const fixed = !!(fx && fx.mode === 'fixed' && (Number(fx.amount) > 0 || lump)), regular = fixed ? monthlyEquivalent(Number(fx.amount) || 0, fx.freq) : 0, lumpMonthly = lump ? lump.amount / lump.every : 0;
    return { name: r.name, usual, base: fixed ? r0(regular + lumpMonthly) : usual, cur: r0(r.cur), fixed, fx: fixed ? { amount: Number(fx.amount) || 0, freq: fx.freq || 'monthly', lump } : null, lump, lumpMonthly: r0(lumpMonthly), skipped: skip.has(lc(r.name)), into: plan.merge[lc(r.name)] || '' };
  });
  if (raw) return rows.sort((a, b) => b.base - a.base || a.name.localeCompare(b.name));
  const out = new Map();
  for (const r of rows) {
    if (r.skipped) { if (!r.into) { out.set(lc(r.name), { ...r, parts: [] }); } continue; }   // a part that is left out is simply not counted
    const key = lc(r.into || r.name), part = { name: r.name, base: r.base, fixed: r.fixed, fx: r.fx };
    const o = out.get(key) || { name: r.into || r.name, base: 0, usual: 0, cur: 0, fixed: true, fx: null, skipped: skip.has(key), parts: [] };
    o.base += r.base; o.usual += r.usual; o.cur += r.cur; o.parts.push(part); o.fixed = o.fixed && r.fixed; o.fx = o.parts.length === 1 ? r.fx : null; if (r.lump && !o.lump) { o.lump = r.lump; o.lumpMonthly = r.lumpMonthly; }
    out.set(key, o);
  }
  const rank = new Map(plan.order.map((n, i) => [lc(n), i]));
  return [...out.values()].map((o) => ({ ...o, fixed: o.parts.length ? o.fixed : false, mixed: o.parts.length > 1 }))
    .sort((a, b) => (rank.has(lc(a.name)) ? rank.get(lc(a.name)) : 1e6) - (rank.has(lc(b.name)) ? rank.get(lc(b.name)) : 1e6) || b.base - a.base || a.name.localeCompare(b.name))
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/** What each source gave in a month: expected and received, from the same figures Home shows. */
export function incomeInMonth(data, all, month) {
  const cf = C.monthCashflow(data, all, month), map = new Map(), asOf = all.asOf, rows = C.monthLedger(data, month);
  const bonds = (cf.income[0] && cf.income[0].bonds) || [];
  for (const b of bonds) map.set('bond:name:' + lc(b.name), { expected: b.expected, received: b.received, due: b.due, late: false });
  for (const l of cf.income.slice(1)) {
    const late = (l.payments || []).some((p) => !p.received && p.due < asOf), pend = (l.payments || []).filter((p) => !p.received && p.due < asOf);
    map.set('inc:' + lc(l.name), { expected: l.expected, received: l.received, due: pend[0] ? pend[0].due : '', late: late || (month < C.monthKey(asOf) && l.received < l.expected - 1) });
  }
  const plan = planOf(data);
  for (const x of plan.extra) {
    const exp = monthlyEquivalent(x.amount, x.freq), got = x.match ? sum(rows.filter((e) => lc(e.desc).includes(lc(x.match)) && e.credit > 0), (e) => e.credit) : month <= C.monthKey(asOf) ? exp : 0;
    map.set('x:' + x.id, { expected: exp, received: got, due: '', late: !!x.match && month < C.monthKey(asOf) && got < exp - 1 });
  }
  return map;
}

/** Expected and received for one source in a month (a source that does not pay that month shows 0 expected). */
function sourceMonth(src, map) {
  if (src.members) { const rs = src.members.map((m) => map.get('bond:name:' + lc(m.name))).filter(Boolean); return { expected: sum(rs, (r) => r.expected), received: sum(rs, (r) => r.received), due: '', late: false }; }
  return map.get(src.key) || { expected: 0, received: 0, due: '', late: false };
}

/** Expense debits of a month by category (expense kind only), with a part folded into the category it belongs to and left-out categories dropped. */
export function spendByCategory(data, month, plan) {
  const kind = kindOf(data), skip = new Set((plan.skip || []).map(lc)), mg = plan.merge || {}, by = new Map();
  for (const e of C.monthLedger(data, month)) {
    if (!(e.debit > 0) || kind(e.category) !== 'expense') continue;
    const raw = (e.category || 'Unknown').trim(); if (skip.has(lc(raw))) continue;
    const name = mg[lc(raw)] || raw; if (skip.has(lc(name))) continue;
    by.set(name, (by.get(name) || 0) + e.debit);
  }
  return by;
}

/** Allocation totals: per source (allocated, remaining) and per category (funded), plus the problems with the allocation itself. */
export function allocation(data, all) {
  const plan = planOf(data, all), src = sources(data, all), cats = categories(data, all).filter((c) => !c.skipped);
  const srcBy = new Map(src.map((s) => [s.key, s])), catBy = new Map(cats.map((c) => [lc(c.name), c]));
  const live = plan.alloc.filter((a) => srcBy.has(a.src) && catBy.has(lc(a.cat)));
  const orphans = plan.alloc.filter((a) => !srcBy.has(a.src) || !catBy.has(lc(a.cat)));
  const sources2 = src.map((s) => { const al = sum(live.filter((a) => a.src === s.key), (a) => a.amount); return { ...s, allocated: al, remaining: s.monthly - al, over: Math.max(0, al - s.monthly) }; });
  const cats2 = cats.map((c) => { const fund = sum(live.filter((a) => lc(a.cat) === lc(c.name)), (a) => a.amount); return { ...c, funded: fund, need: Math.max(0, c.base - fund), extra: Math.max(0, fund - c.base) }; });
  const rk = new Map(cats.map((c, i) => [lc(c.name), i]));
  for (const sx of sources2) live.filter((a) => a.src === sx.key).sort((a, b) => rk.get(lc(a.cat)) - rk.get(lc(b.cat))).forEach((a, i) => { a.ord = i + 1; });   // the order this source pays in
  const totalIncome = sum(sources2, (s) => s.monthly), allocated = sum(live, (a) => a.amount), expenses = sum(cats2, (c) => c.base);
  return { plan, sources: sources2, cats: cats2, links: live, orphans, totalIncome, allocated, unallocated: totalIncome - allocated, expenses,
    unmapped: cats2.filter((c) => c.base > 0 && c.funded === 0), partial: cats2.filter((c) => c.funded > 0 && c.funded < c.base - 0.5), covered: Math.min(allocated, expenses) };
}

/** Actual against plan for one month, with unused allocation carried to the next month when the plan says so. */
export function actualVsPlan(data, all, month) {
  const plan = planOf(data, all), al = allocation(data, all), cur = C.monthKey(all.asOf), from = plan.from && plan.from <= month ? plan.from : month;
  const names = new Set(al.cats.map((c) => c.name));
  const rows = new Map(al.cats.map((c) => [lc(c.name), { name: c.name, planned: c.funded, carryIn: 0, actual: 0 }]));
  // walk the months from the start of the plan, so a reserve built earlier is there to use
  const carry = new Map();
  for (const m of monthsBetween(from, month)) {
    const spent = spendByCategory(data, m, plan);
    for (const nm of spent.keys()) if (!names.has(nm) && !rows.has(lc(nm))) rows.set(lc(nm), { name: nm, planned: 0, carryIn: 0, actual: 0 });
    for (const [k, r] of rows) {
      const actual = spent.get(r.name) || 0, cIn = plan.carry ? carry.get(k) || 0 : 0, avail = r.planned + cIn;
      const out = plan.carry ? Math.max(0, avail - actual) : 0;
      carry.set(k, out);
      if (m === month) { r.carryIn = cIn; r.actual = actual; }
    }
  }
  const list = [...rows.values()].map((r) => {
    const avail = r.planned + r.carryIn, remaining = Math.max(0, avail - r.actual), over = avail > 0 ? Math.max(0, r.actual - avail) : 0;
    const used = avail > 0 ? r.actual / avail : r.actual > 0 ? Infinity : 0;
    const state = r.actual > 0 && avail === 0 ? 'unmapped' : over > 0.5 ? 'over' : r.actual > 0 && r.planned < r.actual && r.planned > 0 && !r.carryIn ? 'partial' : used >= 0.9 ? 'near' : 'ok';
    const cat = al.cats.find((c) => lc(c.name) === lc(r.name)), lump = cat && cat.lump, mn = Number(month.slice(5)), kept = lump ? (mn % lump.every === 0 ? 0 : cat.lumpMonthly * (mn % lump.every)) : 0;
    const keptNow = Math.min(remaining, kept), short = lump && over < 0.5 ? Math.max(0, kept - remaining) : 0;
    return { ...r, available: avail, remaining, over, used, state: short > 0.5 && state === 'ok' ? 'near' : state, carryOut: plan.carry ? remaining : 0, lump: lump || null, kept: keptNow, free: Math.max(0, remaining - keptNow), keptShort: short, lumpDue: !!lump && mn % lump.every === 0 };
  }).filter((r) => r.planned > 0 || r.actual > 0 || r.carryIn > 0).sort((a, b) => (b.over - a.over) || (b.actual - a.actual));
  return { month, rows: list, planned: sum(list, (r) => r.planned), actual: sum(list, (r) => r.actual), carryIn: sum(list, (r) => r.carryIn), remaining: sum(list, (r) => r.remaining), over: sum(list, (r) => r.over),
    unmappedAmount: sum(list.filter((r) => r.state === 'unmapped'), (r) => r.actual) };
}

/** Uses each source's income, in the order of the expenses, up to what is allocated. A source that has less than it was planned to give pays the first expenses in full and leaves the last ones short.
 *  `avail` maps a source key to the income it has to give. */
export function waterfall(al, avail) {
  const rank = new Map(al.cats.map((c) => [lc(c.name), c.rank])), paid = new Map(), bySource = [];
  for (const s of al.sources) {
    let left = Math.max(0, Number(avail.get(s.key)) || 0);
    const links = al.links.filter((l) => l.src === s.key).sort((a, b) => (rank.get(lc(a.cat)) || 1e6) - (rank.get(lc(b.cat)) || 1e6));
    for (const l of links) { const take = Math.min(left, l.amount); left -= take; paid.set(lc(l.cat), (paid.get(lc(l.cat)) || 0) + take); }
    bySource.push({ key: s.key, name: s.name, income: Math.max(0, Number(avail.get(s.key)) || 0), allocated: sum(links, (l) => l.amount), unused: left });
  }
  const rows = al.cats.filter((c) => c.funded > 0).map((c) => { const p = paid.get(lc(c.name)) || 0; return { name: c.name, rank: c.rank, planned: c.funded, paid: p, short: Math.max(0, c.funded - p), usual: c.base }; }).sort((a, b) => a.rank - b.rank);
  return { rows, bySource, income: sum(bySource, (r) => r.income), planned: sum(rows, (r) => r.planned), paid: sum(rows, (r) => r.paid), short: sum(rows, (r) => r.short), unused: sum(bySource, (r) => r.unused), shortCats: rows.filter((r) => r.short > 0.5) };
}
/** The waterfall for a month: income that actually arrived for a finished month, what is due for the current one. */
export function monthFlow(data, all, month) {
  const al = allocation(data, all), cur = C.monthKey(all.asOf), inc = incomeActual(data, all, month), past = month < cur;
  const avail = new Map(inc.rows.map((r) => [r.key, past ? r.received : r.expected]));
  return { ...waterfall(al, avail), month, basis: past ? 'credited' : 'due', al };
}

/** Passive income actually credited in a month, per source and in total, against what was expected. */
export function incomeActual(data, all, month) {
  const map = incomeInMonth(data, all, month), src = sources(data, all);
  const rows = src.map((s) => ({ ...s, ...sourceMonth(s, map) }));
  return { rows, expected: sum(rows, (r) => r.expected), received: sum(rows, (r) => r.received), late: rows.filter((r) => r.late) };
}

/** Salary: what came in, what went into investments, and how much of the month's spending the salary had to pay because passive income did not (reserve counted when carrying). */
export function salaryProtection(data, all, month, reserveIn = 0) {
  const kind = kindOf(data), rows = C.monthLedger(data, month), plan = planOf(data);
  const salary = sum(rows.filter((e) => /salary/i.test(e.category || '')), (e) => e.credit);
  const invested = sum(rows.filter((e) => kind(e.category) === 'investment'), (e) => e.debit);
  const spent = sum([...spendByCategory(data, month, plan).values()]);
  const passive = incomeActual(data, all, month).received;
  const funded = Math.min(spent, passive + (plan.carry ? reserveIn : 0)), diverted = Math.max(0, spent - funded);
  return { month, salary, invested, spent, passive, funded, diverted, reserveOut: plan.carry ? Math.max(0, reserveIn + passive - spent) : 0, protectedShare: salary > 0 ? Math.max(0, (salary - diverted) / salary) : null };
}

/** Coverage month by month for the last `n` months: passive income received over expenses, with the income reserve running forward. */
export function history(data, all, n = 12) {
  const plan = planOf(data), cur = C.monthKey(all.asOf), months = prevMonths(cur, n - 1).concat(cur), out = []; let reserve = 0;
  for (const m of months) {
    const spent = sum([...spendByCategory(data, m, plan).values()]), inc = incomeActual(data, all, m), sal = salaryProtection(data, all, m, reserve);
    reserve = sal.reserveOut;
    out.push({ month: m, spent, received: inc.received, expected: inc.expected, coverage: spent > 0 ? inc.received / spent : null, reserve, diverted: sal.diverted, salary: sal.salary, invested: sal.invested });
  }
  return out.filter((r, i) => r.spent > 0 || r.received > 0 || i === out.length - 1);
}

/** The headline figures. Coverage is the monthly passive income over the usual monthly expenses. */
export function summary(data, all) {
  const al = allocation(data, all), cur = C.monthKey(all.asOf), inc = incomeActual(data, all, cur), hist = history(data, all, 12);
  const coverage = al.expenses > 0 ? al.totalIncome / al.expenses : null, funded = al.expenses > 0 ? al.covered / al.expenses : null;
  const last3 = hist.filter((r) => r.month < cur).slice(-3), actualCoverage = last3.length && sum(last3, (r) => r.spent) > 0 ? sum(last3, (r) => r.received) / sum(last3, (r) => r.spent) : null;
  return { al, cur, inc, hist, coverage, funded, actualCoverage, required: Math.max(0, al.expenses - al.totalIncome), unmappedAmount: sum(al.unmapped, (c) => c.base), reachedAt: (hist.find((r) => r.coverage != null && r.coverage >= 1) || {}).month || '' };
}

/** What needs attention, worst first. kind: red | amber. Never changes a budget. */
export function breaches(data, all) {
  const out = [], s = summary(data, all), al = s.al, cur = s.cur, avp = actualVsPlan(data, all, cur), plan = al.plan;
  for (const r of avp.rows.filter((x) => x.state === 'over')) out.push({ level: 'red', type: 'over', title: `${r.name} is over by`, amount: r.over, note: `Spent ${r.actual} of ${r.available} set aside` });
  for (const x of al.sources.filter((q) => q.over > 0.5)) out.push({ level: 'red', type: 'income', title: `${x.name} pays less than is allocated`, amount: x.over, note: 'Lower an allocation of this source' });
  const wf = monthFlow(data, all, cur);
  if (wf.short > 0.5) out.push({ level: 'red', type: 'short', title: 'This month\'s income will not cover every allocation', amount: wf.short, note: 'Left short, last in the order: ' + wf.shortCats.slice(-3).map((r) => r.name).join(', ') });
  if (plan.alloc.length && al.totalIncome < al.expenses - 0.5) out.push({ level: 'amber', type: 'gap', title: 'Passive income is below monthly expenses', amount: al.expenses - al.totalIncome, note: 'The rest comes from salary until more passive income is built' });
  for (const r of s.inc.late) out.push({ level: 'red', type: 'late', title: `${r.name} is late`, amount: Math.max(0, r.expected - r.received), note: r.due ? 'Was due ' + r.due : 'Not credited yet' });
  for (const r of avp.rows.filter((x) => x.state === 'unmapped')) out.push({ level: 'amber', type: 'unmapped', title: `${r.name} has no income set aside`, amount: r.actual, note: 'Spent this month with nothing allocated' });
  for (const c of al.orphans.slice(0, 1)) out.push({ level: 'amber', type: 'orphan', title: 'An allocation points to income or a category that no longer exists', amount: c.amount, note: 'Open Allocations and remove it' });
  return out.sort((a, b) => (a.level === b.level ? b.amount - a.amount : a.level === 'red' ? -1 : 1));
}
