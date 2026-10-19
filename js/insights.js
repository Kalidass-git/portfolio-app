// Insights: tax summary, cash calendar, annual review, spending anomalies and the allocation goal. Pure functions, no DOM.
import * as C from './calc.js';
import * as P from './projector.js';
import { kindOf } from './categories.js';
import { BUY_TYPES, SELL_TYPES } from './trades.js';

const DAY = 86400000;
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const lc = (s) => String(s || '').trim().toLowerCase();
const spanDays = (a, b) => Math.round((C.toMs(b) - C.toMs(a)) / DAY);      // b - a
const incl = (a, b) => spanDays(a, b) + 1;                                  // both days counted

// ---------- financial year (April to March) ----------
export const fyOf = (date) => (Number(date.slice(5, 7)) >= 4 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1);
export const fyRange = (y) => ({ y, from: `${y}-04-01`, to: `${y + 1}-03-31`, label: `FY ${y}-${String(y + 1).slice(2)}` });
/** Financial years that have any record, newest first. */
export function fyList(data, asOf) {
  const dates = [...data.ledger.map((e) => e.date), ...['bonds', 'fds', 'lending'].flatMap((k) => (data[k] || []).map((x) => x.depositDate)), ...((data.mfTxns || []).map((t) => t.date)), ...((data.trades || []).map((t) => t.date))].filter(Boolean).sort();
  const first = dates.length ? fyOf(dates[0]) : fyOf(asOf), last = fyOf(asOf);
  const out = []; for (let y = last; y >= first; y--) out.push(fyRange(y));
  return out;
}

/** Realised gains on mutual funds, oldest units first. Holding over 12 months is long term. */
export function fundGains(data) {
  const out = [], lots = new Map();
  const txns = (data.mfTxns || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id || 0) - (b.id || 0)));
  const BUY = BUY_TYPES, SELL = SELL_TYPES;
  const key = (s) => lc(s).replace(/\b(plan|option|fund)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
  for (const t of txns) {
    const k = key(t.scheme), list = lots.get(k) || [];
    if (BUY.test(t.type)) { list.push({ units: t.units, cost: t.amount, date: t.date }); lots.set(k, list); continue; }
    if (!SELL.test(t.type)) continue;
    let need = t.units, cost = 0, firstDate = null, firstUnits = 0;
    const unitPrice = t.units ? t.amount / t.units : 0;
    while (need > 1e-9 && list.length) {
      const lot = list[0], take = Math.min(lot.units, need), part = lot.cost * (take / lot.units);
      const proceeds = unitPrice * take;
      out.push({ scheme: t.scheme, date: t.date, buyDate: lot.date, units: take, proceeds, cost: part, gain: proceeds - part, term: spanDays(lot.date, t.date) > 365 ? 'LT' : 'ST' });
      cost += part; need -= take; lot.units -= take; lot.cost -= part; if (lot.units <= 1e-9) list.shift();
    }
  }
  return out;
}

// ---------- 1. Tax summary ----------
export const NO_OWNER = 'Not set';
/** Whose a bond, FD, lending or savings item is: its holder, else (FDs and lending) the account it sits in, unless that only says Private or Family. */
export const itemOwner = (it) => { const h = String(it.holder || '').trim(); if (h) return h; const a = String(it.account || '').trim(); return /^(private|family)$/i.test(a) ? '' : a; };
/** Who owns what for the tax summary: data.taxOwners maps 'stocks', 'funds' and 'acct:<id>' to a person. Bonds, FDs, lending and savings use their own holder. */
export const ownerOfSource = (data, key, fallback) => String((data.taxOwners && data.taxOwners[key]) || fallback || '').trim() || NO_OWNER;
export const acctOwner = (data, acctId) => ownerOfSource(data, 'acct:' + acctId, ((data.accounts || []).find((a) => a.id === acctId) || {}).holder);
/** Everyone named anywhere, each spelled once, with the app's own owner first. */
export function taxPeople(data) {
  const seen = new Map();
  const add = (n) => { const t = String(n || '').trim(); if (t && !seen.has(lc(t))) seen.set(lc(t), t); };
  (data.accounts || []).forEach((a) => add(a.holder));
  ['bonds', 'fds', 'lending', 'savings'].forEach((k) => (data[k] || []).forEach((x) => add(itemOwner(x))));
  Object.values(data.taxOwners || {}).forEach(add);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
export function taxSummary(data, all, y, who = 'all', opts = {}) {
  const { from, to, label } = fyRange(y);
  const mine = (name) => who === 'all' || lc(name || NO_OWNER) === lc(who);
  const end = opts.full || to < all.asOf ? to : all.asOf;
  const tdsRate = data.settings.tdsRate ?? 0.1;
  const span = (it) => {
    if (!it.depositDate) return null;
    const a = it.depositDate > from ? it.depositDate : from;
    const stop = it.closed ? it.closed.date : it.maturityDate;
    const b = stop && stop < end ? stop : end;
    return a <= b ? { a, b, days: incl(a, b) } : null;
  };
  const compound = (it, date) => { const cap = it.maturityDate && it.maturityDate < date ? it.maturityDate : date; return C.calcDeposit({ ...it, accruedOverride: undefined }, cap).accrued; };
  const interest = [];
  for (const b of data.bonds || []) { const s = span(b); if (!s || !mine(itemOwner(b))) continue; const gross = (b.principal * b.rate * s.days) / 365; interest.push({ kind: 'Bonds', name: b.name, holder: itemOwner(b) || NO_OWNER, gross, tds: gross * tdsRate }); }
  for (const [list, kind] of [[data.fds || [], 'Fixed deposits'], [data.lending || [], 'Private lending']]) {
    for (const it of list) {
      const s = span(it); if (!s || !mine(itemOwner(it))) continue;
      let gross;
      if (it.interestType === 'Compound') {
        const before = it.depositDate < from ? compound(it, new Date(C.toMs(from) - DAY).toISOString().slice(0, 10)) : 0;
        gross = compound(it, s.b) - before;
      } else gross = (it.principal * it.rate * s.days) / 365;
      interest.push({ kind, name: it.name, holder: itemOwner(it) || NO_OWNER, party: it.borrower || it.issuer, gross, tds: 0 });
    }
  }
  const interestBy = ['Bonds', 'Fixed deposits', 'Private lending'].map((kind) => { const rows = interest.filter((r) => r.kind === kind); return { kind, rows, gross: sum(rows, (r) => r.gross), tds: sum(rows, (r) => r.tds) }; }).filter((g) => g.rows.length);

  // what really reached the bank
  const rs = C.rangeSummary(who === 'all' ? data : { ...data, ledger: data.ledger.filter((e) => mine(acctOwner(data, e.acct))) }, from, end);
  const salary = sum(rs.income.filter((x) => lc(x.category) === 'salary'), (x) => x.amount);
  const bankOther = rs.income.filter((x) => lc(x.category) !== 'salary');

  // dividends
  const divs = new Map();
  const stockOwner = ownerOfSource(data, 'stocks'), fundOwner = ownerOfSource(data, 'funds');
  for (const d of (mine(stockOwner) && all.stocks.eq && all.stocks.eq.dividends) || []) if (d.date >= from && d.date <= end) { const r = divs.get(d.symbol) || { name: d.name || d.symbol, amount: 0, count: 0 }; r.amount += d.amount; r.count++; divs.set(d.symbol, r); }
  const dividends = [...divs.values()].sort((a, b) => b.amount - a.amount);

  // capital gains
  const sales = ((mine(stockOwner) && all.stocks.eq && all.stocks.eq.sold) || []).filter((s) => s.date >= from && s.date <= end)
    .map((s) => ({ kind: 'Shares', name: s.name, date: s.date, buyDate: s.buyDate, proceeds: s.proceeds, cost: s.cost, gain: s.realized, term: spanDays(s.buyDate, s.date) > 365 ? 'LT' : 'ST' }));
  const funds = (mine(fundOwner) ? fundGains(data) : []).filter((g) => g.date >= from && g.date <= end).map((g) => ({ kind: 'Mutual funds', name: g.scheme, date: g.date, buyDate: g.buyDate, proceeds: g.proceeds, cost: g.cost, gain: g.gain, term: g.term }));
  const gains = sales.concat(funds).sort((a, b) => (a.date < b.date ? -1 : 1));
  const stcg = sum(gains.filter((g) => g.term === 'ST'), (g) => g.gain), ltcg = sum(gains.filter((g) => g.term === 'LT'), (g) => g.gain);

  return {
    fy: label, from, to, end, tdsRate, who, interestBy, interestGross: sum(interestBy, (g) => g.gross), tdsBonds: sum(interestBy, (g) => g.tds),
    salary, bankOther, bankOtherTotal: sum(bankOther, (x) => x.amount),
    dividends, dividendTotal: sum(dividends, (d) => d.amount), gains, stcg, ltcg, proceeds: sum(gains, (g) => g.proceeds),
  };
}

/** One line per person for the year, so each person's figures can be taken to their own return. */
export function taxByPerson(data, all, y) {
  const people = [...taxPeople(data), NO_OWNER];
  return people.map((p) => { const t = taxSummary(data, all, y, p); return { person: p, interest: t.interestGross, tds: t.tdsBonds, salary: t.salary, other: t.bankOtherTotal, dividends: t.dividendTotal, stcg: t.stcg, ltcg: t.ltcg }; })
    .filter((r) => [r.interest, r.salary, r.other, r.dividends, r.stcg, r.ltcg].some((v) => Math.abs(v) > 0.5));
}
export function taxCsv(t) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const r = (a) => a.map(q).join(',');
  const n = (v) => Math.round(v);
  const L = [r([`Tax summary ${t.fy}`, `${t.from} to ${t.end}`, t.who === 'all' ? 'All people' : t.who])];
  L.push('', r(['Interest (accrual basis)']), r(['Type', 'Name', 'Holder', 'Gross interest', 'TDS (estimate)']));
  for (const g of t.interestBy) for (const x of g.rows) L.push(r([g.kind, x.name, x.holder || '', n(x.gross), n(x.tds)]));
  L.push('', r(['Income credited to bank']), r(['Category', 'Amount']), r(['Salary', n(t.salary)]));
  for (const x of t.bankOther) L.push(r([x.category, n(x.amount)]));
  L.push('', r(['Dividends']), r(['Company', 'Amount']));
  for (const d of t.dividends) L.push(r([d.name, n(d.amount)]));
  L.push('', r(['Capital gains']), r(['Type', 'Name', 'Bought', 'Sold', 'Sale value', 'Cost', 'Gain', 'Term']));
  for (const g of t.gains) L.push(r([g.kind, g.name, g.buyDate, g.date, n(g.proceeds), n(g.cost), n(g.gain), g.term === 'LT' ? 'Long term' : 'Short term']));
  L.push('', r(['Short-term gain', n(t.stcg)]), r(['Long-term gain', n(t.ltcg)]));
  return L.join('\n');
}

// ---------- 2. Cash calendar and maturity ladder ----------
export function cashCalendar(data, all, nMonths) {
  const cur = C.monthKey(all.asOf);
  const months = Array.from({ length: nMonths }, (_, i) => C.addMonths(cur + '-01', i).slice(0, 7));
  const by = new Map(months.map((m) => [m, []]));
  const add = (date, title, amount, kind, dir) => { const m = date < all.asOf ? cur : date.slice(0, 7); if (by.has(m)) by.get(m).push({ date: date < all.asOf ? all.asOf : date, title, amount, kind, dir, late: date < all.asOf }); };
  for (const b of all.bonds) if (b.maturityDate) add(b.maturityDate, b.name + ' matures', b.principal, 'Bond maturity', 'in');
  for (const f of all.fds) if (f.maturityDate) add(f.maturityDate, f.name + ' matures', f.interestType === 'Compound' ? f.principal + f.totalInterest : f.principal, 'FD maturity', 'in');
  for (const l of all.lending) if (l.maturityDate && l.principal > 0) add(l.maturityDate, l.name + ' due back', l.interestType === 'Compound' ? l.principal + l.totalInterest : l.principal, 'Lending back', 'in');
  for (const s of all.savings) { const end = C.savingEnd(s); if (end && s.type !== 'EPF' && s.type !== 'PPF') { const m = C.savingMaturity(s); add(end, s.name + (m.kind === 'projected' ? ' matures (projected)' : ' matures'), m.amount, s.type === 'Chit' ? 'Chit payout' : 'Savings maturity', 'in'); } }
  // interest paid out every month while it runs
  for (const m of months) {
    const first = m + '-01';
    const bondsNet = sum(all.bonds.filter((b) => !b.maturityDate || b.maturityDate >= first), (b) => b.monthNet);
    const payout = sum(all.lending.concat(all.fds).filter((x) => x.interestType === 'Payout' && x.principal > 0 && (!x.maturityDate || x.maturityDate >= first)), (x) => C.payoutMonthly(x));
    if (bondsNet > 0) by.get(m).push({ date: first, title: 'Bond interest after TDS', amount: bondsNet, kind: 'Interest', dir: 'in' });
    if (payout > 0) by.get(m).push({ date: first, title: 'Lending and deposit interest', amount: payout, kind: 'Interest', dir: 'in' });
  }
  // money to receive
  for (const r of data.receivables || []) {
    if (r.active === false || !(r.balanceDue > 0) || !(r.expected > 0)) continue;
    const left = Math.ceil(r.balanceDue / r.expected);
    const st = C.receivableStatus(r, all.asOf);
    let n = 0;
    months.forEach((m, i) => {
      if (n >= left || st.notStarted && i === 0 && st.startDate > m + '-31') return;
      if (i === 0 && st.received) return;
      if (r.term === 'Yearly') { if (r.dueDate && r.dueDate.slice(0, 7) === m) { add(r.dueDate, r.name, r.expected, 'Money to receive', 'in'); n++; } return; }
      const day = String(Math.min(28, Math.max(1, r.dueDay || 1))).padStart(2, '0');
      add(`${m}-${day}`, r.name, r.expected, 'Money to receive', 'in'); n++;
    });
  }
  // loan EMIs
  for (const l of data.liabilities || []) {
    if (!(l.emi > 0) || !(l.amount > 0)) continue;
    const interest = (l.amount * (l.rate || 0)) / 12, principalPart = Math.max(0, l.emi - interest);
    const count = principalPart > 0 ? Math.ceil(l.amount / principalPart) : 120;
    const day = String(Math.min(28, Math.max(1, l.emiDay || 1))).padStart(2, '0');
    months.slice(0, count).forEach((m, i) => { if (i === 0 && `${m}-${day}` < all.asOf) return; add(`${m}-${day}`, l.name + ' EMI', l.emi, 'Loan EMI', 'out'); });
  }
  const rows = months.map((m) => {
    const items = by.get(m).sort((a, b) => (a.date < b.date ? -1 : 1));
    const inflow = sum(items.filter((x) => x.dir === 'in'), (x) => x.amount), outflow = sum(items.filter((x) => x.dir === 'out'), (x) => x.amount);
    const maturing = sum(items.filter((x) => /maturity|back|payout/i.test(x.kind)), (x) => x.amount);
    return { month: m, items, inflow, outflow, net: inflow - outflow, maturing };
  });
  let run = all.cashTotal;
  for (const r of rows) { run += r.net; r.cash = run; }
  return { months: rows, totalIn: sum(rows, (r) => r.inflow), totalOut: sum(rows, (r) => r.outflow), maturing: sum(rows, (r) => r.maturing) };
}

/** Everything that matures within `days` days (or is already past its date and still open), soonest first. */
export function maturityAlerts(data, all, days = 31) {
  const lim = new Date(C.toMs(all.asOf) + days * DAY).toISOString().slice(0, 10);
  const out = [];
  const push = (it, kind, amount, basis) => { if (it.maturityDate && it.maturityDate <= lim) out.push({ name: it.name, kind, date: it.maturityDate, amount, basis, daysLeft: spanDays(all.asOf, it.maturityDate), overdue: it.maturityDate < all.asOf }); };
  for (const b of all.bonds) push(b, 'Bond', b.principal);
  for (const f of all.fds) push(f, 'Fixed deposit', f.interestType === 'Compound' ? f.principal + f.totalInterest : f.principal);
  for (const l of all.lending) if (l.principal > 0) push(l, 'Private lending', l.interestType === 'Compound' ? l.principal + l.totalInterest : l.principal);
  for (const s of all.savings) { if (s.type === 'EPF' || s.type === 'PPF') continue; const end = C.savingEnd(s), m = C.savingMaturity(s); if (end) push({ ...s, maturityDate: end }, s.type === 'Chit' ? 'Chit' : s.type || 'Savings', m.amount, m.kind); }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- 3. Annual review ----------
/** Net worth readings from the Plan sheet, projector snapshots and the daily history, one per month (the latest in that month). */
export function netWorthPoints(data, all) {
  const by = new Map();
  for (const s of P.planSheetSnapshots(data, all.asOf)) by.set(s.month, s.net);
  for (const s of (data.projector && data.projector.snapshots) || []) if (s.month <= C.monthKey(all.asOf)) by.set(s.month, s.net);
  by.set(C.monthKey(all.asOf), all.netAsset);
  return by;
}
export function yearsWithLedger(data) { return [...new Set(data.ledger.map((e) => e.date.slice(0, 4)))].sort().reverse(); }

export function annualReview(data, all, year) {
  const from = `${year}-01-01`, to = `${year}-12-31`, end = to < all.asOf ? to : all.asOf;
  const s = C.rangeSummary(data, from, end);
  const pts = netWorthPoints(data, all);
  const keys = [...pts.keys()].sort();
  const startKey = keys.filter((k) => k < `${year}-01`).pop() || keys.find((k) => k.startsWith(String(year)));
  const endKey = keys.filter((k) => k <= end.slice(0, 7)).pop();
  const nwStart = startKey != null ? pts.get(startKey) : null, nwEnd = endKey != null ? pts.get(endKey) : null;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (key > end.slice(0, 7)) break;
    const ms = C.monthSummary(data, key);
    if (!ms.count) continue;
    months.push({ month: key, income: ms.totalIncome, expense: ms.totalExpense, invest: ms.totalInvest, left: ms.saved, nw: pts.has(key) ? pts.get(key) : null });
  }
  const salary = sum(s.income.filter((x) => lc(x.category) === 'salary'), (x) => x.amount);
  const everyday = s.expense.filter((x) => !C.LOAN_TAX.has(lc(x.category)));
  const tax = taxSummary(data, all, C.monthKey(all.asOf) >= `${year}-04` ? year : year - 1);
  const best = months.slice().sort((a, b) => b.left - a.left)[0], worst = months.slice().sort((a, b) => a.left - b.left)[0];
  return {
    year, from, end, summary: s, months, salary, interest: s.totalIncome - salary,
    savingsRate: s.totalIncome ? (s.totalIncome - s.totalExpense) / s.totalIncome : null, investRate: s.totalIncome ? s.totalInvest / s.totalIncome : null,
    nwStart, nwEnd, nwStartKey: startKey, nwEndKey: endKey, nwChange: nwStart != null && nwEnd != null ? nwEnd - nwStart : null,
    topExpenses: everyday.slice(0, 6), best, worst, taxFy: tax,
  };
}

// ---------- 4. Spending anomalies ----------
export function anomalies(data, all, month, { back = 6 } = {}) {
  const kind = kindOf(data);
  const months = C.ledgerMonths(data);
  const prior = months.filter((m) => m < month).slice(-back);
  const cur = C.monthKey(all.asOf);
  const spend = (m) => { const mp = new Map(); for (const e of C.monthLedger(data, m)) if (e.debit > 0 && kind(e.category) === 'expense' && !C.LOAN_TAX.has(lc(e.category))) mp.set(e.category || 'Unknown', (mp.get(e.category || 'Unknown') || 0) + e.debit); return mp; };
  const now = spend(month), hist = prior.map(spend);
  const cats = new Set([...now.keys(), ...hist.flatMap((m) => [...m.keys()])]);
  const entriesOf = (cat) => C.monthLedger(data, month).filter((e) => e.debit > 0 && (e.category || 'Unknown') === cat).sort((a, b) => b.debit - a.debit);
  const spikes = [], missing = [], fresh = [];
  for (const cat of cats) {
    const vals = hist.map((m) => m.get(cat) || 0), avg = vals.length ? sum(vals) / vals.length : 0, seen = vals.filter((v) => v > 0).length;
    const amount = now.get(cat) || 0;
    if (amount > 0 && seen === 0 && prior.length >= 2 && amount >= 1000) fresh.push({ category: cat, amount, entries: entriesOf(cat).slice(0, 3) });
    else if (amount > 0 && avg > 0 && amount >= Math.max(1.5 * avg, avg + 2000)) spikes.push({ category: cat, amount, avg, ratio: amount / avg, extra: amount - avg, entries: entriesOf(cat).slice(0, 3) });
    else if (amount === 0 && seen >= Math.max(3, prior.length - 1) && avg >= 1000 && month < cur) missing.push({ category: cat, avg });
  }
  spikes.sort((a, b) => b.extra - a.extra); fresh.sort((a, b) => b.amount - a.amount); missing.sort((a, b) => b.avg - a.avg);
  // single entries far above what is normal for the category
  const big = [];
  const past = data.ledger.filter((e) => prior.includes(C.monthKey(e.date)) && e.debit > 0);
  for (const e of C.monthLedger(data, month)) {
    if (!(e.debit >= 5000) || kind(e.category) !== 'expense' || C.LOAN_TAX.has(lc(e.category))) continue;
    const ds = past.filter((x) => lc(x.category) === lc(e.category)).map((x) => x.debit).sort((a, b) => a - b);
    const med = ds.length ? ds[Math.floor(ds.length / 2)] : 0;
    if (ds.length >= 3 && e.debit >= 3 * med) big.push({ ...e, median: med });
  }
  big.sort((a, b) => b.debit - a.debit);
  const total = sum([...now.values()]), avgTotal = prior.length ? sum(hist, (m) => sum([...m.values()])) / prior.length : 0;
  return { month, prior, spikes, fresh, missing, big: big.slice(0, 8), total, avgTotal, basis: prior.length };
}

// ---------- 5. Allocation goal ----------
export const ALLOC = [
  { key: 'bonds', label: 'Bonds', from: ['bonds'], dflt: 0.08 },
  { key: 'lending', label: 'Private lending', from: ['lending'], dflt: 0.10 },
  { key: 'safe', label: 'EPF, PPF, FDs, RDs & insurance', from: ['pf', 'fds', 'lic'], dflt: 0.075 },
  { key: 'equity', label: 'Stocks, ETFs & funds', from: ['shares', 'etfs', 'funds'], dflt: null },
  { key: 'gold', label: 'Gold', from: ['gold'], dflt: null },
  { key: 'chits', label: 'Chits', from: ['chits'], dflt: 0.08 },
  { key: 'other', label: 'Others (including cash)', from: ['cash', 'other'], dflt: 0.03 },
];
/** Illustrative starting points, not advice. Each adds up to 100. */
export const PRESETS = [
  { id: 'conservative', name: 'Conservative', note: 'Mostly fixed income and gold', pct: { bonds: 20, lending: 5, safe: 30, equity: 20, gold: 10, chits: 5, other: 10 } },
  { id: 'balanced', name: 'Balanced', note: 'A middle path', pct: { bonds: 15, lending: 10, safe: 20, equity: 30, gold: 10, chits: 5, other: 10 } },
  { id: 'growth', name: 'Growth', note: 'Leans on shares and funds', pct: { bonds: 10, lending: 5, safe: 15, equity: 45, gold: 10, chits: 5, other: 10 } },
];
export const goalTotal = (t) => sum(ALLOC, (g) => t[g.key] || 0);

/** Today's value and typical yearly rate of each of the seven groups. */
export function allocNow(data, all, outlookRate) {
  const b = P.baseline(data, all);
  return ALLOC.map((g) => {
    const parts = g.from.map((k) => ({ v: Math.max(0, b.values[k] || 0), r: P.isMarket(k) ? outlookRate : (b.rates[k] || 0) }));
    const value = sum(parts, (p) => p.v);
    let rate = value > 0 ? sum(parts, (p) => p.v * p.r) / value : (g.dflt ?? outlookRate);
    if (!(rate > 0) && g.dflt) rate = g.dflt;
    return { key: g.key, label: g.label, value, rate };
  });
}
/** Money you can put in each month: salary and other income less expenses and EMI, from the last few months. */
export function defaultMonthly(data, all) {
  const a = P.defaults(data, all);
  return Math.max(0, Math.round((a.salary + a.otherIncome - a.expenses - a.emi) / 1000) * 1000);
}

/**
 * Month by month: every group grows at its rate, then the new money goes to the groups furthest below their goal.
 * Nothing is sold. Done when every group is within `tol` (a share of the total, 0.02 = 2 points) of its goal.
 */
export function allocPath(groups, goal, monthly, { tol = 0.02, maxMonths = 360 } = {}) {
  const tot0 = sum(groups, (g) => g.value);
  const target = Object.fromEntries(ALLOC.map((g) => [g.key, (goal[g.key] || 0) / 100]));
  const within = (v) => { const t = sum(Object.values(v)); return t > 0 && ALLOC.every((g) => Math.abs(v[g.key] / t - target[g.key]) <= tol); };
  const v = Object.fromEntries(groups.map((g) => [g.key, g.value]));
  const rate = Object.fromEntries(groups.map((g) => [g.key, g.rate]));
  const path = [], firstSplit = {};
  const snap = (m) => { const t = sum(Object.values(v)); path.push({ m, total: t, values: { ...v }, shares: Object.fromEntries(ALLOC.map((g) => [g.key, t ? v[g.key] / t : 0])) }); };
  snap(0);
  if (tot0 > 0 && within(v)) return { reached: 0, path, firstSplit, target };
  for (let m = 1; m <= maxMonths; m++) {
    for (const g of ALLOC) v[g.key] *= 1 + rate[g.key] / 12;
    if (monthly > 0) {
      const T = sum(Object.values(v)) + monthly;
      const short = Object.fromEntries(ALLOC.map((g) => [g.key, Math.max(0, target[g.key] * T - v[g.key])]));
      const S = sum(Object.values(short));
      for (const g of ALLOC) {
        const add = S > 0 ? (S >= monthly ? (short[g.key] / S) * monthly : short[g.key] + ((monthly - S) * target[g.key])) : monthly * target[g.key];
        v[g.key] += add; if (m === 1) firstSplit[g.key] = add;
      }
    }
    if (m % 12 === 0 || m === maxMonths) snap(m);
    if (within(v)) { if (m % 12 !== 0 && m !== maxMonths) snap(m); return { reached: m, path, firstSplit, target }; }
  }
  return { reached: null, path, firstSplit, target };
}

// ---- group-level goals: set what you care about, the rest follows your current mix ----
export const GOAL_GROUPS = [
  { id: 'debt', label: 'Debts & fixed income' }, { id: 'gold', label: 'Gold' },
  { id: 'equity', label: 'Equity, ETFs & mutual funds' }, { id: 'other', label: 'Others' },
];
export const GROUP_OF = { bonds: 'debt', lending: 'debt', safe: 'debt', chits: 'debt', equity: 'equity', gold: 'gold', other: 'other' };
const isSet = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
/** A goal saved by an older release (one overall % for each of the seven groups) turned into group and within-group targets. */
export function normGoal(g) {
  if (!g) return null;
  if (g.groupTargets || g.subTargets) return { groupTargets: g.groupTargets || {}, subTargets: g.subTargets || {}, monthly: g.monthly, outlook: g.outlook };
  if (!g.targets) return null;
  const groupTargets = {}, subTargets = {};
  for (const gr of GOAL_GROUPS) {
    const ks = ALLOC.filter((a) => GROUP_OF[a.key] === gr.id), tot = sum(ks, (a) => Number(g.targets[a.key]) || 0);
    groupTargets[gr.id] = tot;
    if (ks.length > 1 && tot > 0) for (const a of ks) subTargets[a.key] = Math.round(((Number(g.targets[a.key]) || 0) / tot) * 1000) / 10;
  }
  return { groupTargets, subTargets, monthly: g.monthly, outlook: g.outlook };
}
/** Turns what you typed into the full picture. Blank groups share what is left in the proportion they hold today; the same inside a group. */
export function resolveGoal(goal, now) {
  const val = (k) => Math.max(0, (now.find((x) => x.key === k) || {}).value || 0);
  const gNow = (id) => sum(now.filter((x) => GROUP_OF[x.key] === id), (x) => Math.max(0, x.value));
  const gt = (goal && goal.groupTargets) || {}, stt = (goal && goal.subTargets) || {};
  const setG = GOAL_GROUPS.map((g) => g.id).filter((id) => isSet(gt[id]));
  const autoG = GOAL_GROUPS.map((g) => g.id).filter((id) => !setG.includes(id));
  const setSum = sum(setG, (id) => Number(gt[id]));
  const remain = Math.max(0, 100 - setSum), autoNow = sum(autoG, gNow);
  const groups = {}, items = {}, within = {}, itemSet = {}, errors = [];
  for (const id of setG.concat(autoG)) groups[id] = setG.includes(id) ? Number(gt[id]) : autoNow > 0 ? (remain * gNow(id)) / autoNow : remain / autoG.length;
  if (setSum > 100.05) errors.push(`The groups you set add up to ${setSum.toFixed(1)}%. They cannot go above 100%.`);
  else if (!autoG.length && Math.abs(setSum - 100) > 0.05) errors.push(`All four groups are set and add up to ${setSum.toFixed(1)}%. Leave one blank to take the rest, or make it 100%.`);
  for (const gr of GOAL_GROUPS) {
    const ks = ALLOC.filter((a) => GROUP_OF[a.key] === gr.id).map((a) => a.key);
    if (ks.length === 1) { within[ks[0]] = 100; itemSet[ks[0]] = false; }
    else {
      const sk = ks.filter((k) => isSet(stt[k])), ak = ks.filter((k) => !sk.includes(k));
      const ss = sum(sk, (k) => Number(stt[k])), rem = Math.max(0, 100 - ss), av = sum(ak, val);
      for (const k of ks) { itemSet[k] = sk.includes(k); within[k] = sk.includes(k) ? Number(stt[k]) : av > 0 ? (rem * val(k)) / av : rem / ak.length; }
      if (ss > 100.05) errors.push(`Inside ${gr.label}, the rows you set add up to ${ss.toFixed(1)}%. They cannot go above 100%.`);
      else if (!ak.length && Math.abs(ss - 100) > 0.05) errors.push(`Inside ${gr.label} every row is set and they add up to ${ss.toFixed(1)}%. Leave one blank or make it 100%.`);
    }
    for (const k of ks) items[k] = (groups[gr.id] * within[k]) / 100;
  }
  return { groups, items, within, setG, autoG, itemSet, setSum, errors, ok: !errors.length };
}
/** A preset (overall % for the seven groups) written as group and within-group targets. */
export const presetGoal = (pct) => normGoal({ targets: pct });
/** Monthly amount needed to reach the goal within `years`, or null when even a very large amount is not enough. */
export function monthlyFor(groups, goal, years, hi = 5000000) {
  const ok = (m) => { const r = allocPath(groups, goal, m); return r.reached != null && r.reached <= years * 12; };
  if (ok(0)) return 0;
  if (!ok(hi)) return null;
  let lo = 0, up = hi;
  for (let i = 0; i < 22; i++) { const mid = (lo + up) / 2; if (ok(mid)) up = mid; else lo = mid; }
  return Math.ceil(up / 1000) * 1000;
}
export const monthsText = (m) => { if (m == null) return 'more than 30 years'; const y = Math.floor(m / 12), r = m % 12; return [y ? `${y} year${y > 1 ? 's' : ''}` : '', r ? `${r} month${r > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ') || 'already there'; };

// ---------- new tax regime: a quick yearly estimate ----------
/** New-regime slabs by financial year (start year). Rebate (section 87A) makes income up to the limit tax free. */
export function regimeFor(y) {
  if (y >= 2025) return { slabs: [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]], std: 75000, rebateLimit: 1200000, rebateMax: 60000, label: 'new regime, FY 2025-26 onwards' };
  if (y === 2024) return { slabs: [[300000, 0], [700000, 0.05], [1000000, 0.10], [1200000, 0.15], [1500000, 0.20], [Infinity, 0.30]], std: 75000, rebateLimit: 700000, rebateMax: 25000, label: 'new regime, FY 2024-25' };
  return { slabs: [[300000, 0], [600000, 0.05], [900000, 0.10], [1200000, 0.15], [1500000, 0.20], [Infinity, 0.30]], std: 50000, rebateLimit: 700000, rebateMax: 25000, label: 'new regime, before FY 2024-25' };
}
/** Tax on normal-slab income (interest, salary, other) under the new regime, with standard deduction, rebate with marginal relief, and 4% cess. */
export function newRegimeTax(y, salary, otherIncome) {
  const r = regimeFor(y);
  const gross = Math.max(0, salary) + Math.max(0, otherIncome);
  const stdDed = Math.min(r.std, Math.max(0, salary));
  const taxable = Math.max(0, gross - stdDed);
  let prev = 0, slab = 0;
  for (const [hi, rate] of r.slabs) { if (taxable > prev) slab += (Math.min(taxable, hi) - prev) * rate; prev = hi; }
  let rebate = 0;
  if (taxable <= r.rebateLimit) rebate = Math.min(slab, r.rebateMax);
  else slab = Math.min(slab, taxable - r.rebateLimit); // marginal relief: never more than the income above the limit
  const base = Math.max(0, slab - rebate), cess = base * 0.04;
  return { gross, stdDed, taxable, slab, rebate, cess, tax: base + cess, regime: r };
}
/**
 * The year's expected income and tax: salary so far plus the months still to come, interest on bonds and FDs worked out from the
 * holdings for the whole year (gross, so it does not matter whether TDS was cut), plus any other income typed in.
 * Private lending and chits are left out on purpose.
 */
export function taxProjection(data, all, y, who = 'all', plan = {}) {
  const now = taxSummary(data, all, y, who);
  const full = taxSummary(data, all, y, who, { full: true });
  const { from, to } = fyRange(y);
  const mine = (name) => who === 'all' || lc(name || NO_OWNER) === lc(who);
  const cur = C.monthKey(all.asOf);
  const months = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = C.addMonths(m + '-01', 1).slice(0, 7)) months.push(m);
  const curIn = months.includes(cur) ? cur : (cur > to.slice(0, 7) ? to.slice(0, 7) : null);
  const sal = new Map();
  for (const e of data.ledger) if (lc(e.category) === 'salary' && e.date >= from && e.date <= to && mine(acctOwner(data, e.acct))) sal.set(C.monthKey(e.date), (sal.get(C.monthKey(e.date)) || 0) + (Number(e.credit) || 0));
  const credited = months.filter((m) => m <= cur && (sal.get(m) || 0) > 0);
  const latest = credited.length ? sal.get(credited[credited.length - 1]) : 0;
  const perMonth = Number(plan.salaryMonthly) > 0 ? Number(plan.salaryMonthly) : latest;
  const salSoFar = sum(credited, (m) => sal.get(m));
  const remaining = months.filter((m) => m > cur || (m === cur && !(sal.get(m) > 0))).length;
  const salaryYear = salSoFar + perMonth * remaining;
  const keep = (g) => g.rows.map((r) => r);
  const part = (res, kind) => (res.interestBy.find((g) => g.kind === kind) || { rows: [] }).rows;
  const holdings = [];
  const tdsRate = data.settings.tdsRate ?? 0.1;
  for (const kind of ['Bonds', 'Fixed deposits']) {
    const fullRows = part(full, kind), nowRows = part(now, kind);
    for (const r of fullRows) {
      const n = nowRows.find((x) => x.name === r.name && x.holder === r.holder) || { gross: 0 };
      const tdsFull = kind === 'Bonds' ? r.gross * tdsRate : (r.gross > 40000 ? r.gross * tdsRate : 0);
      const tdsNow = kind === 'Bonds' ? n.gross * tdsRate : (r.gross > 40000 ? n.gross * tdsRate : 0);
      holdings.push({ kind, name: r.name, holder: r.holder, yearInterest: r.gross, soFar: n.gross, tdsYear: tdsFull, tdsSoFar: tdsNow });
    }
  }
  const interestYear = sum(holdings, (x) => x.yearInterest), interestSoFar = sum(holdings, (x) => x.soFar);
  const other = Math.max(0, Number(plan.other) || 0);
  // savings-account interest credited to the bank (bond income is already counted from the holdings), carried forward at the pace so far
  const savSoFar = sum(now.bankOther.filter((x) => /interest/.test(lc(x.category)) && !/bond|fd|deposit/.test(lc(x.category))), (x) => x.amount);
  const elapsed = Math.max(1, months.filter((m) => m <= cur).length), monthsLeft = months.filter((m) => m > cur).length;
  const savings = { soFar: savSoFar, year: curIn && cur <= to.slice(0, 7) ? savSoFar + (savSoFar / elapsed) * monthsLeft : savSoFar };
  const dividends = now.dividendTotal;   // what is recorded so far; nothing is guessed for the months ahead
  const calc = newRegimeTax(y, salaryYear, interestYear + savings.year + dividends + other);
  // headroom: how much more income the year can take before tax starts, and what that means in bond money at the chosen rate
  const r = regimeFor(y);
  const stdDed = Math.min(r.std, Math.max(0, salaryYear));
  const zeroLimit = r.rebateLimit + stdDed;                    // gross income at which tax is still nil
  const room = Math.max(0, zeroLimit - calc.gross);
  const rate = Number(plan.bondRate) > 0 ? Number(plan.bondRate) : 0.12;
  const daysLeft = Math.max(0, spanDays(all.asOf, to));
  return {
    fy: fyRange(y).label, y, from, to, who, months: months.length,
    salary: { soFar: salSoFar, perMonth, remaining, year: salaryYear },
    interest: { year: interestYear, soFar: interestSoFar, holdings },
    other, dividends, savings, calc, tdsRate,
    tds: { soFar: sum(holdings, (x) => x.tdsSoFar), year: sum(holdings, (x) => x.tdsYear) },
    totalIncome: calc.gross,
    headroom: { zeroLimit, room, over: Math.max(0, calc.gross - zeroLimit), rate, daysLeft, bondsFullYear: room / rate, bondsThisYear: daysLeft > 0 ? room / (rate * (daysLeft / 365)) : 0 },
  };
}
