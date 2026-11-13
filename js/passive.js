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
//     order: [category names, first = paid first]   the default priority, used for an income that has no order of its own
//     sorder: { [source key]: [category names] }   the order one income pays its expenses in (set by dragging cards in its column) }
// An allocation is a plan, not a promise: each month the income that really arrives is used in that order, so a smaller month pays the first expenses in full and leaves the last ones short.
// Nothing here changes a budget: allocations are only ever changed by the owner.
import * as C from './calc.js';
import { kindOf, categoryList } from './categories.js';

export const FREQ = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };
export const FREQ_LABEL = { monthly: 'Monthly', quarterly: 'Quarterly', halfyearly: 'Half-yearly', yearly: 'Yearly' };
const lc = (s) => String(s || '').trim().toLowerCase();
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const r0 = (n) => Math.round(n);
const money0 = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const SALARYISH = /salary|wage|payroll/i;

/** The saved plan with every part present. */
export function planOf(data, all) {
  const p = (data.settings && data.settings.passivePlan) || {};
  let alloc = (p.alloc || []).map((a) => ({ ...a }));
  {   // allocations saved against one bond, or against the older monthly / quarterly bond groups, now belong to the one bond interest income
    const one = new Set((all && all.bonds ? all.bonds : []).map((b) => 'bond:' + b.id));
    alloc = alloc.map((a) => (one.has(a.src) || LEGACY_GRP.has(a.src) ? { ...a, src: BONDS } : a));
    const seen = new Map(); for (const a of alloc) { const k = a.src + '|' + lc(a.cat), o = seen.get(k); if (o) o.amount = (Number(o.amount) || 0) + (Number(a.amount) || 0); else seen.set(k, a); }
    alloc = [...seen.values()];
  }
  const mg = p.merge || {};
  if (Object.keys(mg).length) {   // an allocation to a category that is now part of another belongs to the other one
    alloc = alloc.map((a) => (mg[lc(a.cat)] ? { ...a, cat: mg[lc(a.cat)] } : a));
    const seen = new Map(); for (const a of alloc) { const k = a.src + '|' + lc(a.cat), o = seen.get(k); if (o) o.amount = (Number(o.amount) || 0) + (Number(a.amount) || 0); else seen.set(k, a); }
    alloc = [...seen.values()];
  }
  return { alloc, freq: { ...(p.freq || {}) }, extra: (p.extra || []).map((x) => ({ ...x })), skip: [...(p.skip || [])], carry: p.carry !== false, from: p.from || '', order: [...(p.order || [])], sorder: (() => { const o = {}; for (const [k, v] of Object.entries(p.sorder || {})) { const key = LEGACY_GRP.has(k) ? BONDS : k; o[key] = [...(o[key] || []), ...v.filter((n) => !(o[key] || []).some((q) => lc(q) === lc(n)))]; } return o; })(), expense: { ...(p.expense || {}) }, merge: { ...(p.merge || {}) } };
}
export const BONDS = 'bondgrp:all';   // all bond interest is one income; older plans saved a monthly and a quarterly group
const LEGACY_GRP = new Set(['bondgrp:monthly', 'bondgrp:quarterly']);
export const bondGroup = () => BONDS;
/** Writes the plan into a data object inside mutate(). */
export function savePlan(d, plan) {
  d.settings = d.settings || {};
  d.settings.passivePlan = { alloc: plan.alloc.map((a) => ({ id: a.id, src: a.src, cat: a.cat, amount: r0(a.amount) })), freq: plan.freq, extra: plan.extra, skip: plan.skip, carry: plan.carry !== false, from: plan.from || '', order: plan.order || [], sorder: plan.sorder || {}, expense: plan.expense || {}, merge: plan.merge || {} };
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
  const g = { n: 0, monthly: 0, members: [], q: 0 };
  for (const b of all.bonds || []) {
    const monthly = Number(b.monthNet) || 0, end = b.closed && b.closed.date ? b.closed.date : b.maturityDate;
    if (!(monthly > 0.5) || (end && end < C.monthStart(asOf))) continue;
    g.n++; g.monthly += monthly; if (b.credit === 'Quarterly') g.q++; g.members.push({ id: b.id, name: b.name, monthly, quarterly: b.credit === 'Quarterly' });
  }
  if (g.n) out.push({ key: BONDS, name: 'Bond interest', kind: 'bond', sub: `${g.n} bond${g.n === 1 ? '' : 's'}${g.q ? ` · ${g.n - g.q} monthly, ${g.q} quarterly` : ' paying every month'}`, freq: 'monthly', monthly: g.monthly, fixedFreq: true, tds, members: g.members });
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

/** A payment made every few months inside an expense (maintenance at quarter end), where we are in it for a month number 1-12. `at` is the month it is paid in (default: the end of each period). */
export function lumpState(lump, mn) {
  const every = lump.every, at = lump.at ? ((lump.at - 1) % every) + 1 : every, k = (((mn - at) % every) + every) % every, share = lump.amount / every;
  return { k, due: k === 0, accrued: k === 0 ? lump.amount : share * k, share, nextIn: k === 0 ? every : every - k };
}

/** Expense categories with what each costs a month. The plan comes from the category budgets (Income & expenses → Categories): the monthly budget plus a twelfth of the yearly one.
 *  A category with no budget costs the fixed amount set earlier (older plans), else the average of up to three finished months, else this month so far. A category counted as part of another is folded into it.
 *  raw = true gives the categories as the bank entries name them, before folding. */
export function categories(data, all, raw = false) {
  const plan = planOf(data, all), kind = kindOf(data), cur = C.monthKey(all.asOf), skip = new Set(plan.skip.map(lc));
  const months = C.ledgerMonths(data).filter((m) => m < cur).slice(-3), use = months.length ? months : [cur];
  const by = new Map(), bud = new Map();
  for (const c of categoryList(data)) if (c.kind === 'expense' && (c.budget > 0 || c.yearlyBudget > 0)) bud.set(lc(c.name), { name: c.name, monthly: Number(c.budget) || 0, yearly: Number(c.yearlyBudget) || 0 });
  for (const e of data.ledger || []) {
    if (!(e.debit > 0) || kind(e.category) !== 'expense') continue;
    const m = C.monthKey(e.date), name = (e.category || 'Unknown').trim();
    if (!use.includes(m) && m !== cur) continue;
    const r = by.get(lc(name)) || { name, base: 0, cur: 0 };
    if (use.includes(m)) r.base += e.debit; if (m === cur) r.cur += e.debit;
    by.set(lc(name), r);
  }
  for (const [k, b] of bud) if (!by.has(k)) by.set(k, { name: b.name, base: 0, cur: 0 });
  for (const a of plan.alloc) if (!by.has(lc(a.cat))) by.set(lc(a.cat), { name: a.cat, base: 0, cur: 0 });
  for (const [k, x] of Object.entries(plan.expense)) if (x && (x.mode === 'fixed' || x.lump || x.carry) && !by.has(k)) by.set(k, { name: x.name || k, base: 0, cur: 0 });
  const rows = [...by.values()].map((r) => {
    const usual = r0(r.base / use.length), k = lc(r.name), b = bud.get(k), fx = plan.expense[k];
    const budget = b ? r0(b.monthly + b.yearly / 12) : 0, legacy = fx && fx.mode === 'fixed' && Number(fx.amount) > 0 ? r0(monthlyEquivalent(Number(fx.amount), fx.freq)) : 0;
    // a payment made every few months: set on the expense (timing only, the amount is still the budget), else a yearly budget accrues towards one payment a year
    const tl = fx && fx.lump && Number(fx.lump.amount) > 0 ? { amount: Number(fx.lump.amount), every: [2, 3, 4, 6, 12].includes(Number(fx.lump.every)) ? Number(fx.lump.every) : 3, ...(Number(fx.lump.at) >= 1 && Number(fx.lump.at) <= 12 ? { at: Number(fx.lump.at) } : {}) } : null;
    const lump = tl || null, yearly = !tl && b && b.yearly > 0 ? b.yearly : 0;
    const lumpMonthly = lump ? lump.amount / lump.every : 0, legacyLump = !budget && fx && fx.mode === 'fixed' ? r0(legacy + lumpMonthly) : 0;
    const src = budget > 0 ? 'budget' : legacyLump > 0 ? 'fixed' : 'usual';
    return { carry: !!(fx && fx.carry), name: r.name, usual, base: src === 'budget' ? budget : src === 'fixed' ? legacyLump : usual, cur: r0(r.cur), src, fixed: src !== 'usual', budget, yearly, lump, lumpMonthly: r0(lumpMonthly), skipped: skip.has(k), into: plan.merge[k] || '' };
  });
  if (raw) return rows.sort((a, b) => b.base - a.base || a.name.localeCompare(b.name));
  const out = new Map();
  for (const r of rows) {
    if (r.skipped) { if (!r.into) { out.set(lc(r.name), { ...r, parts: [] }); } continue; }   // a part that is left out is simply not counted
    const key = lc(r.into || r.name), part = { name: r.name, base: r.base, fixed: r.fixed };
    const o = out.get(key) || { carry: false, name: r.into || r.name, base: 0, usual: 0, cur: 0, fixed: true, src: r.src, budget: 0, yearly: 0, lump: null, lumpMonthly: 0, skipped: skip.has(key), parts: [] };
    o.base += r.base; o.usual += r.usual; o.cur += r.cur; o.budget += r.budget; o.yearly += r.yearly; o.parts.push(part); o.carry = o.carry || r.carry || !!(plan.expense[key] && plan.expense[key].carry); o.fixed = o.fixed && r.fixed; if (o.src !== r.src) o.src = o.src === 'usual' || r.src === 'usual' ? 'usual' : 'budget';
    if (r.lump && !o.lump) { o.lump = r.lump; o.lumpMonthly = r.lumpMonthly; }
    out.set(key, o);
  }
  const rank = new Map(plan.order.map((n, i) => [lc(n), i]));
  return [...out.values()].map((o) => ({ ...o, fixed: o.parts.length ? o.fixed : false, mixed: o.parts.length > 1 }))
    .sort((a, b) => (rank.has(lc(a.name)) ? rank.get(lc(a.name)) : 1e6) - (rank.has(lc(b.name)) ? rank.get(lc(b.name)) : 1e6) || b.base - a.base || a.name.localeCompare(b.name))
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/** Money to keep back for payments made every few months: a lump set on the expense (quarterly maintenance) or a yearly budget (education), for a month.
 *  accrued = what should be put by by now; paid = what has been paid out of it this year (yearly budgets only). */
export function setAside(data, all, month) {
  const al = allocation(data, all), mn = Number(month.slice(5)), yr = month.slice(0, 4), plan = al.plan, out = [];
  for (const c of al.cats) {
    if (c.lump) {
      const st = lumpState(c.lump, mn);
      out.push({ name: c.name, kind: 'lump', amount: c.lump.amount, every: c.lump.every, share: r0(st.share), accrued: r0(st.accrued), due: st.due, nextIn: st.nextIn, funded: c.base > 0 ? Math.min(1, c.funded / c.base) : 1, note: st.due ? `Falls due this month: ${money0(c.lump.amount)}` : `Next payment in ${st.nextIn} month${st.nextIn === 1 ? '' : 's'}` });
    } else if (c.yearly > 0) {
      const share = c.yearly / 12, monthly = c.budget - share; let spent = 0;
      for (let i = 1; i <= mn; i++) spent += sum(C.monthLedger(data, yr + '-' + String(i).padStart(2, '0')).filter((e) => e.debit > 0 && lc(e.category) === lc(c.name)), (e) => e.debit);
      const paid = Math.max(0, spent - monthly * mn);
      out.push({ name: c.name, kind: 'yearly', amount: c.yearly, every: 12, share: r0(share), accrued: r0(Math.max(0, share * mn - paid)), planned: r0(share * mn), paid: r0(paid), due: false, funded: c.base > 0 ? Math.min(1, c.funded / c.base) : 1, yearlyNote: true, note: `Yearly budget ${money0(c.yearly)}, ${money0(paid)} paid so far in ${yr}` });
    }
  }
  return { rows: out.sort((a, b) => b.accrued - a.accrued), total: sum(out, (r) => r.accrued) };
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
  for (const sx of sources2) {   // the order this source pays in: its own order if it has one, then the order of the expenses
    const own = new Map(((plan.sorder || {})[sx.key] || []).map((n, i) => [lc(n), i]));
    live.filter((a) => a.src === sx.key).sort((a, b) => (own.has(lc(a.cat)) ? own.get(lc(a.cat)) : 1e6 + rk.get(lc(a.cat))) - (own.has(lc(b.cat)) ? own.get(lc(b.cat)) : 1e6 + rk.get(lc(b.cat)))).forEach((a, i) => { a.ord = i + 1; });
  }
  const totalIncome = sum(sources2, (s) => s.monthly), allocated = sum(live, (a) => a.amount), expenses = sum(cats2, (c) => c.base);
  return { plan, sources: sources2, cats: cats2, links: live, orphans, totalIncome, allocated, unallocated: totalIncome - allocated, expenses,
    unmapped: cats2.filter((c) => c.base > 0 && c.funded === 0), partial: cats2.filter((c) => c.funded > 0 && c.funded < c.base - 0.5), covered: Math.min(allocated, expenses) };
}

/** Actual against plan for one month, with unused allocation carried to the next month when the plan says so. */
export function actualVsPlan(data, all, month) {
  const plan = planOf(data, all), al = allocation(data, all), cur = C.monthKey(all.asOf), from = plan.from && plan.from <= month ? plan.from : month;
  const names = new Set(al.cats.map((c) => c.name));
  const rows = new Map(al.cats.map((c) => [lc(c.name), { name: c.name, planned: c.funded, carryIn: 0, earlier: 0, actual: 0, carry: !!c.carry && !c.lump, bf: 0 }]));
  // walk the months from the start of the plan, so a reserve built earlier is there to use
  const carry = new Map();
  for (const m of monthsBetween(from, month)) {
    const spent = spendByCategory(data, m, plan);
    for (const nm of spent.keys()) if (!names.has(nm) && !rows.has(lc(nm))) rows.set(lc(nm), { name: nm, planned: 0, carryIn: 0, earlier: 0, actual: 0 });
    for (const [k, r] of rows) {
      const actual = spent.get(r.name) || 0, cIn = carry.get(k) || 0;
      // a category that carries forward keeps a running balance: what was set aside and not spent is there next month, and what is spent is taken from it first
      if (r.carry) { carry.set(k, Math.max(0, cIn + r.planned - actual)); if (m === month) { r.bf = cIn; r.actual = actual; } continue; }
      carry.set(k, cIn + Math.max(0, r.planned - actual));   // other categories: unused allocation of earlier months is only shown, never added to a month's allowance
      if (m === month) { r.earlier = cIn; r.actual = actual; }
    }
  }
  const mn = Number(month.slice(5));
  const list = [...rows.values()].map((r) => {
    const cat = al.cats.find((c) => lc(c.name) === lc(r.name)), lump = cat && cat.lump, f = cat && cat.base > 0 ? Math.min(1, r.planned / cat.base) : 1;
    // an expense with a payment every few months: only its regular part is allowed in an ordinary month, the whole payment in the month it falls due; the rest is set aside (see Set aside)
    const st = lump ? lumpState(lump, mn) : null, avail = lump ? f * (cat.base - cat.lumpMonthly + (st.due ? lump.amount : 0)) : r.planned + (r.carry ? r.bf : 0), carryIn = r.carry ? r.bf : 0, earlier = lump || r.carry ? 0 : r.earlier;
    const remaining = Math.max(0, avail - r.actual), over = avail > 0 ? Math.max(0, r.actual - avail) : 0;
    const used = avail > 0 ? r.actual / avail : r.actual > 0 ? Infinity : 0;
    const state = r.actual > 0 && avail === 0 ? 'unmapped' : over > 0.5 ? 'over' : r.actual > 0 && r.planned < r.actual && r.planned > 0 && !carryIn && !lump ? 'partial' : used >= 0.9 ? 'near' : 'ok';
    return { ...r, carryIn, earlier, available: avail, remaining, over, used, state, carryOut: r.carry ? remaining : 0, carry: r.carry, lump: lump || null, lumpDue: !!st && st.due, lumpAmount: lump ? lump.amount : 0, kept: st ? Math.round(st.accrued) : 0 };
  }).filter((r) => r.planned > 0 || r.actual > 0 || r.earlier > 0 || r.carryIn > 0).sort((a, b) => (b.over - a.over) || (b.actual - a.actual));
  return { month, rows: list, planned: sum(list, (r) => r.planned), actual: sum(list, (r) => r.actual), carryIn: 0, earlier: sum(list, (r) => r.earlier), remaining: sum(list, (r) => r.remaining), over: sum(list, (r) => r.over),
    unmappedAmount: sum(list.filter((r) => r.state === 'unmapped'), (r) => r.actual) };
}

/** Uses each source's income, in the order of the expenses, up to what is allocated. A source that has less than it was planned to give pays the first expenses in full and leaves the last ones short.
 *  `avail` maps a source key to the income it has to give. */
export function waterfall(al, avail) {
  const rank = new Map(al.cats.map((c) => [lc(c.name), c.rank])), paid = new Map(), bySource = [], takes = [];
  for (const s of al.sources) {
    let left = Math.max(0, Number(avail.get(s.key)) || 0);
    const links = al.links.filter((l) => l.src === s.key).sort((a, b) => (a.ord != null && b.ord != null ? a.ord - b.ord : (rank.get(lc(a.cat)) || 1e6) - (rank.get(lc(b.cat)) || 1e6)));
    for (const l of links) { const take = Math.min(left, l.amount); left -= take; paid.set(lc(l.cat), (paid.get(lc(l.cat)) || 0) + take); takes.push({ src: s.key, cat: l.cat, amount: l.amount, take }); }
    bySource.push({ key: s.key, name: s.name, income: Math.max(0, Number(avail.get(s.key)) || 0), allocated: sum(links, (l) => l.amount), unused: left });
  }
  const rows = al.cats.filter((c) => c.funded > 0).map((c) => { const p = paid.get(lc(c.name)) || 0; return { name: c.name, rank: c.rank, ord: Math.min(...al.links.filter((l) => lc(l.cat) === lc(c.name)).map((l) => (l.ord != null ? l.ord : 1e6))), planned: c.funded, paid: p, short: Math.max(0, c.funded - p), usual: c.base }; }).sort((a, b) => a.ord - b.ord || a.rank - b.rank);
  return { rows, bySource, takes, income: sum(bySource, (r) => r.income), planned: sum(rows, (r) => r.planned), paid: sum(rows, (r) => r.paid), short: sum(rows, (r) => r.short), unused: sum(bySource, (r) => r.unused), shortCats: rows.filter((r) => r.short > 0.5) };
}
/** The waterfall for a month: income that actually arrived for a finished month, what is due for the current one. */
export function monthFlow(data, all, month) {
  const al = allocation(data, all), cur = C.monthKey(all.asOf), inc = incomeActual(data, all, month), past = month < cur;
  const avail = new Map(inc.rows.map((r) => [r.key, past ? r.received : r.expected]));
  return { ...waterfall(al, avail), month, basis: past ? 'credited' : 'due', al };
}

/** Passive income actually credited in a month, per source and in total, against what was expected. */
/** How one month went, income by income. A month still running counts the income that is due (projected); a finished month counts what was credited.
 *  Each income lists the expenses planned on it: what was planned, spent, how much went over, and what was left over (shown only; it is not added to the next month).
 *  The spend of an expense is taken by its incomes in their order; anything above everything planned lands on the last one. */
export function progressMonth(data, all, month) {
  const al = allocation(data, all), cur = C.monthKey(all.asOf), past = month < cur, inc = incomeActual(data, all, month), av = actualVsPlan(data, all, month);
  const wf = waterfall(al, new Map(inc.rows.map((r) => [r.key, past ? r.received : Math.max(r.expected, r.received)])));
  const cat = new Map(av.rows.map((r) => [lc(r.name), r])), links = al.links.slice().sort((a, b) => (a.ord != null && b.ord != null ? a.ord - b.ord : 0));
  const by = new Map(); for (const l of links) { const k = lc(l.cat); by.set(k, [...(by.get(k) || []), l]); }
  const sources = al.sources.map((x) => ({ key: x.key, name: x.name, kind: x.kind, monthly: x.monthly, expected: 0, received: 0, allocated: 0, unused: 0, short: 0, rows: [] }));
  for (const r of inc.rows) { const t = sources.find((q) => q.key === r.key); if (t) { t.expected = r.expected; t.received = r.received; } }
  for (const b of wf.bySource) { const t = sources.find((q) => q.key === b.key); if (t) { t.allocated = b.allocated; t.unused = b.unused; t.short = Math.max(0, b.allocated - b.income); } }
  let pocket = 0, over = 0, left = 0, spent = 0;
  const unplanned = [], cats = [];
  for (const r of av.rows) {
    const ls = by.get(lc(r.name)) || [], P = ls.reduce((a, l) => a + l.amount, 0), takes = wf.takes.filter((t) => lc(t.cat) === lc(r.name)), paid = takes.reduce((a, t) => a + t.take, 0);
    const early = r.lump && r.lumpDue ? r.lumpAmount * (r.lump.every - 1) / r.lump.every : 0, used = Math.min(r.carryIn || 0, Math.max(0, r.actual - paid - early)), covered = Math.min(r.actual, paid + early + used), pk = Math.max(0, r.actual - covered);
    if (r.carry || ls.length) cats.push({ name: r.name, carry: !!r.carry, planned: P, bf: r.carryIn || 0, available: r.available, spent: r.actual, left: r.remaining, over: r.over, paid, short: Math.max(0, P - paid), pocket: pk, fromBalance: used, sources: ls.map((l) => { const t = takes.find((q) => q.src === l.src), sr = al.sources.find((q) => q.key === l.src); return { name: sr ? sr.name : l.src, key: l.src, planned: l.amount, paid: t ? t.take : 0 }; }) });
    spent += r.actual; pocket += pk; over += r.over; left += r.remaining;
    if (!ls.length || P <= 0) { if (r.actual > 0) unplanned.push({ cat: r.name, spent: r.actual }); continue; }
    let rest = r.actual;
    ls.forEach((l, i) => {
      const cap = r.available * (l.amount / P), take = Math.min(rest, cap), last = i === ls.length - 1, ov = last ? Math.max(0, rest - cap) : 0;
      rest -= take; if (last) rest = 0;
      const t = takes.find((q) => q.src === l.src), row = { cat: r.name, planned: l.amount, earlier: i === 0 ? r.earlier : 0, carryIn: i === 0 ? r.carryIn : 0, allowed: cap, spent: take + ov, over: ov, left: Math.max(0, cap - take), paid: t ? t.take : 0, short: Math.max(0, l.amount - (t ? t.take : 0)), lump: !!r.lump, lumpDue: r.lumpDue };
      const src = sources.find((q) => q.key === l.src); if (src) src.rows.push(row);
    });
  }
  const salary = salaryProtection(data, all, month, 0);
  return { month, past, sources, unplanned, cats, spent, pocket, over, left, earlier: av.earlier, credited: inc.received, expected: inc.expected, income: wf.income, short: wf.short, unused: wf.unused, salary };
}

/** One or many months, added up. Planned, spent and over are totals; left over is what stood at the end of the last month. */
export function progressReport(data, all, months) {
  const per = months.map((m) => progressMonth(data, all, m));
  if (!per.length) return { months: [], per, sources: [], unplanned: [], cats: [], spent: 0, pocket: 0, over: 0, left: 0, credited: 0, expected: 0, income: 0, short: 0, unused: 0 };
  const last = per[per.length - 1], sources = new Map(), un = new Map(), cats = new Map();
  for (const m of per) {
    for (const x of m.sources) {
      const t = sources.get(x.key) || { key: x.key, name: x.name, kind: x.kind, monthly: x.monthly, expected: 0, received: 0, allocated: 0, unused: 0, short: 0, rows: new Map() }; sources.set(x.key, t);
      t.expected += x.expected; t.received += x.received; t.allocated += x.allocated; t.unused += x.unused; t.short += x.short;
      for (const r of x.rows) { const k = lc(r.cat), o = t.rows.get(k) || { cat: r.cat, planned: 0, earlier: 0, spent: 0, over: 0, left: 0, paid: 0, short: 0, lump: r.lump, lumpDue: false }; t.rows.set(k, o);
        o.planned += r.planned; o.spent += r.spent; o.over += r.over; o.paid += r.paid; o.short += r.short; o.left += r.left; o.allowed = r.allowed; if (m === per[0]) o.earlier = r.earlier; o.lumpDue = r.lumpDue; }
    }
    for (const c of m.cats) {
      const o = cats.get(lc(c.name)) || { name: c.name, carry: c.carry, planned: 0, bf: c.bf, spent: 0, over: 0, paid: 0, short: 0, pocket: 0, fromBalance: 0, left: 0, available: 0, sources: new Map(), months: [] };
      cats.set(lc(c.name), o); o.carry = o.carry || c.carry; o.planned += c.planned; o.spent += c.spent; o.over += c.over; o.paid += c.paid; o.short += c.short; o.pocket += c.pocket; o.fromBalance += c.fromBalance; o.left = c.left; o.available = c.available;
      o.months.push({ month: m.month, bf: c.bf, planned: c.planned, spent: c.spent, left: c.left, over: c.over });
      for (const x of c.sources) { const q = o.sources.get(x.key) || { name: x.name, key: x.key, planned: 0, paid: 0 }; q.planned += x.planned; q.paid += x.paid; o.sources.set(x.key, q); }
    }
    for (const u of m.unplanned) un.set(lc(u.cat), { cat: u.cat, spent: (un.get(lc(u.cat)) || { spent: 0 }).spent + u.spent });
  }
  const sum2 = (f) => per.reduce((a, m) => a + f(m), 0);
  return { months, per, last, cats: [...cats.values()].map((c) => ({ ...c, sources: [...c.sources.values()] })), sources: [...sources.values()].map((t) => ({ ...t, rows: [...t.rows.values()] })), unplanned: [...un.values()], spent: sum2((m) => m.spent), pocket: sum2((m) => m.pocket), over: sum2((m) => m.over), left: sum2((m) => m.left), earlier: per[0].earlier, credited: sum2((m) => m.credited), expected: sum2((m) => m.expected), income: sum2((m) => m.income), short: sum2((m) => m.short), unused: last.unused, salary: last.salary };
}

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
  const funded = Math.min(spent, passive), diverted = Math.max(0, spent - funded);
  return { month, salary, invested, spent, passive, funded, diverted, reserveOut: 0, protectedShare: salary > 0 ? Math.max(0, (salary - diverted) / salary) : null };
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
