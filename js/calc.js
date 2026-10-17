// Pure financial calculations. No DOM, no network: runs in the browser and in Node tests.
// Every formula here mirrors the workbook (Portfolio_2026_Lite.xlsx); sheet/cell references are noted in comments.

import { kindOf } from './categories.js';
import { liveParity } from './goldlive.js';
import { modelFlows } from './epf.js';
import { buildEquity, buildFunds, xirrFor, fundKey, flowsFor, symKey } from './trades.js';
export const DAY = 86400000;
export const toMs = (s) => (s ? Date.parse(s + 'T00:00:00Z') : NaN);
export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const monthStart = (isoDate) => isoDate.slice(0, 7) + '-01';
export const monthKey = (isoDate) => isoDate.slice(0, 7);
export function monthEnd(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  return iso(Date.UTC(y, m, 0));
}
export function addMonths(isoDate, k) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last)));
}
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const ceil3 = (x) => (x >= 0 ? Math.ceil(x * 1000 - 1e-9) / 1000 : Math.floor(x * 1000 + 1e-9) / 1000); // Excel ROUNDUP(x,3)

// ---------- fixed income ----------
const compFreq = (c) => ({ Yearly: 1, Monthly: 12, Daily: 365, Quarterly: 4 }[c] ?? 10);
const tenureFactor = (t) => (t === 'Months' ? 12 : t === 'Days' ? 365 : 1);

/** Bonds (Fixed Income!A3:N22). Interest is paid out, nothing accrues into the principal. */
export function calcBond(b, asOf, s) {
  const dim = s.daysInMonth || 30;
  const completed = (toMs(asOf) - toMs(monthStart(asOf))) / DAY + 1; // Fixed Income!Q4
  const daily = (b.principal * b.rate) / 365; // N
  return {
    ...b,
    daily,
    monthGross: daily * dim, // L
    monthNet: daily * dim * (1 - (s.tdsRate ?? 0.1)), // M ("TDS" column = payout after 10% TDS)
    accruedMonth: daily * completed, // K
  };
}

/** FDs and private lending (Fixed Income!A27:P31 and A35:P45). */
export function calcDeposit(it, asOf) {
  const f = tenureFactor(it.tenureType);
  const m = compFreq(it.compound);
  const dep = toMs(it.depositDate);
  const L = Math.max(0, ceil3(((toMs(asOf) - dep) / DAY / 365) * f)); // Comp.Tenure
  const P = it.principal, r = it.rate;
  let accrued = 0, total = 0;
  if (it.interestType === 'Compound') {
    accrued = P * (Math.pow(1 + r / m, (L / f) * m) - 1);
    total = P * (Math.pow(1 + r / m, (it.tenure / f) * m) - 1);
  } else if (it.interestType === 'Payout') {
    accrued = 0; // interest is paid out monthly, so it is income, not part of the balance
    total = (r * P * it.tenure) / f;
  }
  if (it.accruedOverride != null) accrued = it.accruedOverride;
  return { ...it, elapsed: L, accrued, totalInterest: total, daily: (P * r) / 365, value: P + accrued };
}

// ---------- small savings (Cash!A12:Q23 + Chits & Savings) ----------
export function savingPrincipal(sv) {
  if (sv.type === 'EPF') return sum(sv.entries, (e) => (e.employee || 0) + (e.employer || 0));
  return sum(sv.entries, (e) => e.amount);
}
export function calcSaving(sv, asOf) {
  const principal = savingPrincipal(sv);
  return { ...sv, principal, daily: (principal * sv.rate) / 365, ...savingXirr(sv, asOf) };
}
const tenureMonths = (sv) => (sv.tenure ? Math.round(sv.tenure * ({ Years: 12, Months: 1, Days: 1 / 30.4 }[sv.tenureType] || 1)) : 0);
/**
 * Real return of a chit or recurring deposit from its dated payments.
 *   closed: the payments plus the amount received when it was closed.
 *   open:   only an estimate, and only when you entered the expected payout. Remaining instalments are assumed equal to the average paid so far.
 */
export function savingXirr(sv, asOf) {
  if (sv.type === 'EPF' || sv.type === 'PPF') return {};
  const ents = sv.entries.filter((e) => e.amount > 0 && e.date);
  if (!ents.length) return {};
  const flows = ents.map((e) => ({ t: toMs(e.date), amount: -e.amount }));
  if (sv.closed) { const x = xirr(flows.concat([{ t: toMs(sv.closed.date), amount: sv.closed.amount }])); return { xirr: x, xirrKind: 'actual' }; }
  if (sv.payout > 0 && sv.maturityDate) {
    const f = flows.slice(), avg = sum(ents, (e) => e.amount) / ents.length;
    const left = Math.max(0, tenureMonths(sv) - ents.length);
    let d = ents[ents.length - 1].date;
    for (let i = 0; i < left; i++) { d = addMonths(d, 1); f.push({ t: toMs(d), amount: -avg }); }
    f.push({ t: toMs(sv.maturityDate), amount: sv.payout });
    return { xirr: xirr(f), xirrKind: 'estimate', xirrBasis: 'payout' };
  }
  // no expected payout: the assumed yearly rate stands in for the return
  if (sv.rate > 0) return { xirr: sv.rate, xirrKind: 'estimate', xirrBasis: 'rate' };
  return {};
}
/** Return on a closed bond, deposit or loan: money in, coupons while it lasted (assumed paid on time), money back. */
export function closedXirr(it, kind, asOf) {
  if (!it.closed || !it.depositDate) return null;
  const f = [{ t: toMs(it.depositDate), amount: -it.principal }];
  if (kind === 'bond') {
    const step = it.credit === 'Quarterly' ? 3 : 1;
    let d = addMonths(it.depositDate, step);
    while (d <= it.closed.date) { f.push({ t: toMs(d), amount: it.principal * it.rate * (step / 12) }); d = addMonths(d, step); }
  }
  f.push({ t: toMs(it.closed.date), amount: it.closed.amount });
  return xirr(f);
}

// ---------- bank accounts ----------
export function accountBalances(data, upTo) {
  return data.accounts.map((a) => {
    let bal = 0, last = '';
    for (const e of data.ledger) {
      if (e.acct !== a.id) continue;
      if (upTo && e.date > upTo) continue;
      bal += (e.credit || 0) - (e.debit || 0);
      if (e.date > last) last = e.date;
    }
    return { ...a, balance: bal, lastDate: last };
  });
}

// ---------- equity ----------
export function priceOf(stock, quotes, useLive) {
  const q = quotes && quotes[stock.symbol];
  return useLive && q && q.price > 0 ? q.price : stock.price;
}
export function calcStocks(data, quotes, useLive) {
  const items = data.stocks.map((s) => {
    const price = priceOf(s, quotes, useLive);
    const q = quotes && quotes[s.symbol];
    const prev = useLive && q && q.price > 0 && q.prevClose > 0 ? q.prevClose : s.prevClose || 0;
    const invested = s.qty * s.avgPrice, current = s.qty * price;
    // yesterday's close is only trusted when it came with the same refresh as the price
    const day = prev > 0 ? s.qty * (price - prev) : null;
    return { ...s, livePrice: price, prevClose: prev || null, invested, current, pl: current - invested, ret: invested ? (current - invested) / invested : 0, day, dayPct: prev > 0 ? price / prev - 1 : null };
  });
  const invested = sum(items, (x) => x.invested), current = sum(items, (x) => x.current);
  const dayItems = items.filter((x) => x.day != null);
  const day = sum(dayItems, (x) => x.day), dayBase = sum(dayItems, (x) => x.current - x.day);
  const etf = sum(items.filter((x) => x.assetClass !== 'equity'), (x) => x.current);
  const goldEtf = sum(items.filter((x) => x.assetClass === 'goldetf'), (x) => x.current);
  return { items, invested, current, pl: current - invested, ret: invested ? (current - invested) / invested : 0, etf, goldEtf, equityOnly: current - etf, day, dayPct: dayBase ? day / dayBase : 0, dayCount: dayItems.length };
}
export function calcMFs(data, quotes, useLive) {
  const items = data.mutualFunds.map((m) => {
    const q = quotes && m.schemeCode && quotes['MF:' + m.schemeCode];
    const nav = useLive && q && q.price > 0 ? q.price : m.nav;
    const prev = useLive && q && q.price > 0 && q.prev > 0 ? q.prev : m.prevNav || 0;
    const current = m.units * nav;
    const day = prev > 0 ? m.units * (nav - prev) : null;
    return { ...m, liveNav: nav, prevNav: prev || null, current, pl: current - m.invested, ret: m.invested ? (current - m.invested) / m.invested : 0, day, dayPct: prev > 0 ? nav / prev - 1 : null };
  });
  const invested = sum(items, (x) => x.invested), current = sum(items, (x) => x.current);
  const dayItems = items.filter((x) => x.day != null);
  const day = sum(dayItems, (x) => x.day), dayBase = sum(dayItems, (x) => x.current - x.day);
  return { items, invested, current, pl: current - invested, ret: invested ? (current - invested) / invested : 0, day, dayPct: dayBase ? day / dayBase : 0, dayCount: dayItems.length };
}

// ---------- gold ----------
export function calcGold(data) {
  const rate = data.settings.goldRate;
  const g = data.gold;
  const grams = sum(g.purchases, (p) => p.grams);
  const invested = sum(g.purchases, (p) => p.amount);
  const gold = { name: 'Gold (coins, chains, purchases)', grams, invested, value: grams * rate };
  gold.gain = gold.value - invested;
  const active = g.schemes.find((s) => s.active);
  const scheme = active
    ? (() => {
        const ents = active.entries.map((e) => ({ ...e, grams: e.grams || (e.rate ? e.amount / e.rate : 0) }));
        const gr = sum(ents, (e) => e.grams), inv = sum(ents, (e) => e.amount);
        return { name: active.name, grams: gr, invested: inv, value: gr * rate, gain: gr * rate - inv, entries: ents };
      })()
    : { name: '', grams: 0, invested: 0, value: 0, gain: 0, entries: [] };
  const jewelGrams = sum(g.jewellery, (j) => j.grams);
  // gold chits (jeweller savings schemes): the money paid in counts at cost until the chit is closed and becomes a gold purchase
  const chitList = (g.chits || []).map((c) => ({ ...c, paid: sum(c.entries, (e) => e.amount), months: c.entries.length }));
  const chits = { active: chitList.filter((c) => !c.closed), closed: chitList.filter((c) => c.closed) };
  chits.invested = sum(chits.active, (c) => c.paid);
  const live = liveParity(data.settings.goldLive);
  const dayPct = live && live.prev > 0 ? live.now / live.prev - 1 : null;
  const perGramDay = dayPct == null ? null : rate - rate / (1 + dayPct);
  const day = dayPct == null ? null : { pct: dayPct, perGram: perGramDay, total: (gold.grams + scheme.grams) * perGramDay, at: data.settings.goldLive.at };
  return {
    rate, day, main: gold, scheme, chits,
    value: gold.value + scheme.value + chits.invested, // Home!C4
    invested: gold.invested + scheme.invested + chits.invested,
    grams: gold.grams + scheme.grams, // chit money has no grams until it is closed
    jewellery: { items: g.jewellery, grams: jewelGrams, value: jewelGrams * rate }, // informational (not part of Home totals)
    others: g.others, othersTotal: sum(g.others, (o) => o.amount),
  };
}

// ---------- the whole portfolio (Home sheet) ----------
export const RISK = {
  'EPF + RD + FDs': 'Safe', Gold: 'Safe', Bonds: 'Medium', 'Lending Private': 'High', Stocks: 'Medium',
  Chits: 'Medium High', 'Lending Family': 'Medium High', 'Others (Cash, Others etc)': 'Safe',
};

export function computeAll(data, opts = {}) {
  const asOf = opts.asOf || todayISO();
  const quotes = opts.quotes || {};
  const useLive = opts.useLive !== false;
  const s = data.settings;

  const banks = accountBalances(data);
  const cashTotal = sum(banks, (b) => b.balance);

  const savings = data.savings.filter((x) => !x.closed).map((x) => calcSaving(x, asOf));
  const closedSavings = data.savings.filter((x) => x.closed).map((x) => calcSaving(x, asOf));
  const ofType = (...t) => savings.filter((x) => t.includes(x.type));
  const chitsTotal = sum(ofType('Chit'), (x) => x.principal);
  const savingsTotal = sum(savings, (x) => x.principal);
  const smallSavings = savingsTotal - chitsTotal; // Home!C3

  const bonds = data.bonds.filter((x) => !x.closed).map((b) => calcBond(b, asOf, s));
  const fds = data.fds.filter((x) => !x.closed).map((f) => calcDeposit(f, asOf));
  const lending = data.lending.filter((x) => !x.closed).map((l) => calcDeposit(l, asOf));
  const closed = {
    savings: closedSavings,
    bonds: data.bonds.filter((x) => x.closed).map((b) => ({ ...b, xirr: closedXirr(b, 'bond', asOf) })),
    fds: data.fds.filter((x) => x.closed).map((f) => ({ ...f, xirr: closedXirr(f, 'deposit', asOf) })),
    lending: data.lending.filter((x) => x.closed).map((l) => ({ ...l, xirr: closedXirr(l, l.interestType === 'Payout' ? 'bond' : 'deposit', asOf) })),
    receivables: data.receivables.filter((r) => r.active === false),
  };
  const stocks = calcStocks(data, quotes, useLive);
  const mf = calcMFs(data, quotes, useLive);
  // dated cash flows (from imported trades) give a real XIRR
  stocks.eq = data.trades && data.trades.length ? buildEquity(data) : null;
  if (stocks.eq && !data.trades.some((t) => t.src === 'opening')) stocks.xirr = xirrFor(stocks.eq, [...stocks.eq.flows.keys()], stocks.current, asOf);
  mf.book = data.mfTxns && data.mfTxns.length ? buildFunds(data) : null;
  if (mf.book) {
    const keys = new Set(mf.book.flows.keys());
    const covered = mf.items.filter((m) => keys.has(fundKey(m.name)));
    const f = [];
    for (const k of keys) for (const x of mf.book.flows.get(k)) f.push({ t: toMs(x.date), amount: x.amount });
    const val = covered.reduce((a, m) => a + m.current, 0);
    if (val > 0) f.push({ t: toMs(asOf), amount: val });
    mf.xirr = covered.some((m) => data.mutualFunds.some((o) => o.id === m.id && o.opening)) || !covered.length ? null : xirr(f);
    mf.xflows = mf.xirr == null ? null : f;
    mf.realized = mf.book.holdings.reduce((a, h) => a + h.realized, 0);
  }
  // XIRR for each holding that has dated buys (hidden when the first buy is under a month old: it would be a wild number)
  const young = (flows) => !flows || !flows.length || flows.every((x) => asOf < addDays(x.date, 30));
  const addDays = (d, n) => iso(toMs(d) + n * DAY);
  if (stocks.eq) for (const it of stocks.items) {
    const fl = stocks.eq.flows.get(symKey(it.symbol));
    if (!fl || young(fl) || (data.trades || []).some((t) => t.src === 'opening' && symKey(t.symbol) === symKey(it.symbol))) continue;
    it.xirr = xirr(flowsFor(stocks.eq, [symKey(it.symbol)], it.current, asOf));
  }
  if (mf.book) for (const it of mf.items) {
    const fl = mf.book.flows.get(fundKey(it.name));
    if (!fl || young(fl) || data.mutualFunds.some((m) => m.id === it.id && m.opening)) continue;
    const f = fl.map((x) => ({ t: toMs(x.date), amount: x.amount }));
    if (it.current > 0) f.push({ t: toMs(asOf), amount: it.current });
    it.xirr = xirr(f);
  }
  const gold = calcGold(data);

  const bondPrincipal = sum(bonds, (x) => x.principal);
  const fdPrincipal = sum(fds, (x) => x.principal), lendPrincipal = sum(lending, (x) => x.principal);
  const accruedDeposits = sum(fds, (x) => x.accrued) + sum(lending, (x) => x.accrued);
  const fdAndBonds = bondPrincipal + fdPrincipal + lendPrincipal + accruedDeposits; // Home!C7

  const othersTotal = gold.othersTotal; // Home!C8
  const liabTotal = sum(data.liabilities, (l) => l.amount);
  const loans = loanSummary(data);

  // Home!C2:C9
  const rows = [
    { type: 'Cash', amount: cashTotal },
    { type: 'Small Savings', amount: smallSavings },
    { type: 'Gold', amount: gold.value },
    { type: 'Equity', amount: stocks.current },
    { type: 'Mutual Fund', amount: mf.current },
    { type: 'FD & Bonds', amount: fdAndBonds },
    { type: 'Others', amount: othersTotal },
    { type: 'Chits', amount: chitsTotal },
  ];
  // Home!C12:C16 (Gold ETF moves from equity to gold)
  const totalDebts = smallSavings + fdAndBonds + chitsTotal;
  const totalEquity = stocks.current + mf.current - stocks.goldEtf;
  const goldPlus = gold.value + stocks.goldEtf;
  const totalAssets = totalDebts + totalEquity + cashTotal + goldPlus + othersTotal;
  rows.forEach((r) => (r.pct = totalAssets ? r.amount / totalAssets : 0));
  const groups = [
    { type: 'Debt (savings, FDs, bonds, chits)', amount: totalDebts },
    { type: 'Equity & funds', amount: totalEquity },
    { type: 'Cash', amount: cashTotal },
    { type: 'Gold (incl. Gold ETF)', amount: goldPlus },
    { type: 'Others', amount: othersTotal },
  ].map((g) => ({ ...g, pct: totalAssets ? g.amount / totalAssets : 0 }));

  // Home!A26:G31 cash flow ("credit" = interest earned)
  const sd = (f) => sum(f, (x) => x.daily);
  const cf = (name, capital, perDay) => ({ name, capital, perDay, perMonth: perDay * 30, perYear: perDay * 360, yield: capital ? (perDay / capital) * 365 : 0 });
  const epfPpf = ofType('EPF', 'PPF'), rdLic = savings.filter((x) => !['EPF', 'PPF', 'Chit'].includes(x.type)), chits = ofType('Chit');
  const cashflow = [
    cf('EPF & PPF', sum(epfPpf, (x) => x.principal), sd(epfPpf)),
    cf('Chits', chitsTotal, sd(chits)),
    cf('RD & LIC', sum(rdLic, (x) => x.principal), sd(rdLic)),
    cf('Bonds', bondPrincipal, sd(bonds)),
    cf('Fixed deposits', fdPrincipal, sd(fds)),
    cf('Private lending', lendPrincipal, sd(lending)),
  ];
  const cfTotal = cf('Total', sum(cashflow, (x) => x.capital), sum(cashflow, (x) => x.perDay));

  // Home!I26:M33 capital exposure
  const lendBy = (acct) => sum(lending.filter((l) => l.account === acct), (l) => l.principal + l.accrued);
  const fdFirst4 = fds.slice(0, 4); // sheet uses F27:F30 / N27:N30
  const exposureRaw = [
    ['EPF + RD + FDs', sum(epfPpf.concat(rdLic), (x) => x.principal) + sum(fdFirst4, (x) => x.principal + x.accrued)],
    ['Gold', goldPlus],
    ['Bonds', bondPrincipal],
    ['Lending Private', lendBy('Private')],
    ['Stocks', totalEquity],
    ['Chits', chitsTotal],
    ['Lending Family', lendBy('Family')],
    ['Others (Cash, Others etc)', othersTotal + cashTotal],
  ];
  const exposure = exposureRaw.map(([type, capital]) => ({ type, capital, risk: RISK[type], pct: totalAssets ? capital / totalAssets : 0 }));

  const dailyCredit = cfTotal.perDay;
  return {
    asOf, banks, cashTotal, savings, closed, chitsTotal, smallSavings, savingsTotal,
    bonds, fds, lending, stocks, mf, gold, loans,
    fixed: { bondPrincipal, fdPrincipal, lendPrincipal, accruedDeposits, total: fdAndBonds },
    rows, groups, totalDebts, totalEquity, goldPlus, totalAssets, liabTotal,
    netAsset: totalAssets - liabTotal,
    cashflow, cfTotal, exposure, dailyCredit,
    monthlyIncomeExpected: sum(bonds, (b) => b.monthNet) + 0,
    netMonthly: cfTotal.perMonth - loans.monthlyInterest,
  };
}

// ---------- ledger analytics (Home monthly cash flow + Expenses sheet) ----------
// Which category is spending, income, an investment or just a transfer comes from data.categoryList (see categories.js).
export function monthLedger(data, month) {
  const kind = kindOf(data);
  return data.ledger.filter((e) => monthKey(e.date) === month && kind(e.category) !== 'transfer');
}
export function ledgerMonths(data) {
  const kind = kindOf(data);
  return [...new Set(data.ledger.filter((e) => kind(e.category) !== 'transfer').map((e) => monthKey(e.date)))].sort();
}
const byCat = (rows, field) => {
  const m = new Map();
  for (const e of rows) {
    const v = e[field] || 0;
    if (!v) continue;
    m.set(e.category || 'Unknown', (m.get(e.category || 'Unknown') || 0) + v);
  }
  return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
};

/** Expenses sheet: income vs expenses vs investments for a month. */
export function monthSummary(data, month) {
  const rows = monthLedger(data, month);
  const income = byCat(rows, 'credit');
  const debits = byCat(rows, 'debit');
  const kind = kindOf(data);
  const invest = debits.filter((x) => kind(x.category) === 'investment');
  const expense = debits.filter((x) => kind(x.category) !== 'investment');
  const totalIncome = sum(income, (x) => x.amount), totalExpense = sum(expense, (x) => x.amount), totalInvest = sum(invest, (x) => x.amount);
  return {
    month, income, expense, invest, totalIncome, totalExpense, totalInvest,
    saved: totalIncome - totalExpense - totalInvest,
    expenseRatio: totalIncome ? totalExpense / totalIncome : 0,
    count: rows.length,
  };
}
// ----- any period: this month, last month, this year, past 12 months, all time, or one named month -----
export const LOAN_TAX = new Set(['loan', 'tax']);
export function periodRange(key, asOf) {
  const first = (d) => d.slice(0, 7) + '-01';
  const y = asOf.slice(0, 4);
  if (/^\d{4}-\d\d$/.test(key)) return { from: key + '-01', to: iso(toMs(addMonths(key + '-01', 1)) - DAY), label: key, months: 1 };
  if (key === 'last') { const f = addMonths(first(asOf), -1); return { from: f, to: iso(toMs(first(asOf)) - DAY), label: 'last month', months: 1 }; }
  if (key === 'ytd') return { from: y + '-01-01', to: asOf, label: 'this year', months: Number(asOf.slice(5, 7)) };
  if (key === '12m') return { from: addMonths(first(asOf), -11), to: asOf, label: 'past 12 months', months: 12 };
  if (key === 'all') return { from: '0000-01-01', to: '9999-12-31', label: 'all time', months: null };
  return { from: first(asOf), to: asOf, label: 'this month', months: 1 };
}
export function rangeLedger(data, from, to) {
  const kind = kindOf(data);
  return data.ledger.filter((e) => e.date >= from && e.date <= to && kind(e.category) !== 'transfer');
}
/** filter: { mode: 'all' | 'only' | 'except', cats: [names] } applies to money going out (expenses and investments). */
export const passesFilter = (f, category) => {
  if (!f || f.mode === 'all' || !f.cats || !f.cats.length) return true;
  const hit = f.cats.some((c) => c.toLowerCase() === (category || '').toLowerCase());
  return f.mode === 'only' ? hit : !hit;
};
export function rangeSummary(data, from, to, filter) {
  const kind = kindOf(data);
  const all = rangeLedger(data, from, to);
  const out = all.filter((e) => (e.debit || 0) > 0);
  const credits = all.filter((e) => (e.credit || 0) > 0);
  const incomeRows = credits.filter((e) => kind(e.category) === 'income');   // refunds and loan repayments sitting in other categories are not income
  const otherIn = credits.filter((e) => kind(e.category) !== 'income').reduce((a, e) => a + e.credit, 0);
  const expenseRows = out.filter((e) => kind(e.category) !== 'investment' && passesFilter(filter, e.category));
  const investRows = out.filter((e) => kind(e.category) === 'investment' && passesFilter(filter, e.category));
  const income = byCat(incomeRows, 'credit'), expense = byCat(expenseRows, 'debit'), invest = byCat(investRows, 'debit');
  const totalIncome = sum(income, (x) => x.amount);
  const totalExpense = sum(expense, (x) => x.amount);
  const loanTax = sum(expense.filter((x) => LOAN_TAX.has(x.category.toLowerCase())), (x) => x.amount);
  const totalInvest = sum(invest, (x) => x.amount);
  const everything = out.reduce((a, e) => a + e.debit, 0);
  return {
    from, to, income, expense, invest, expenseRows, investRows, incomeRows,
    totalIncome, otherIn, totalExpense, loanTax, everyday: totalExpense - loanTax, totalInvest,
    left: totalIncome - everything, count: all.length,
  };
}
/** Group rows by description: count, total, average, last date. field is 'debit' or 'credit'. */
export function byDescription(rows, field) {
  const m = new Map();
  for (const e of rows) {
    const k = (e.desc || '(no description)').trim().toLowerCase();
    const r = m.get(k) || { desc: (e.desc || '(no description)').trim(), count: 0, amount: 0, last: '' };
    r.count++; r.amount += e[field] || 0; if (e.date > r.last) r.last = e.date;
    m.set(k, r);
  }
  const list = [...m.values()].sort((a, b) => b.amount - a.amount);
  const total = list.reduce((a, r) => a + r.amount, 0);
  return list.map((r) => ({ ...r, avg: r.count ? r.amount / r.count : 0, share: total ? r.amount / total : 0 }));
}
export function monthlyTrend(data, months) {
  return months.map((m) => {
    const s = monthSummary(data, m);
    return { month: m, income: s.totalIncome, expense: s.totalExpense, invest: s.totalInvest };
  });
}

/** Home!A38:J56 monthly cash flow: expected interest vs received, and spending groups. */
export function monthCashflow(data, all, month) {
  const rows = monthLedger(data, month);
  const credit = (cat) => sum(rows.filter((e) => (e.category || '').toLowerCase() === cat), (e) => e.credit);
  const debit = (cat) => sum(rows.filter((e) => (e.category || '').toLowerCase() === cat), (e) => e.debit);
  const monthNo = Number(month.slice(5, 7));
  const quarterMonth = (monthNo - 1) % 3 === 0;
  const monthlyBonds = sum(all.bonds.filter((b) => b.credit === 'Monthly'), (b) => b.monthNet);
  const quarterlyBonds = sum(all.bonds.filter((b) => b.credit === 'Quarterly'), (b) => b.monthNet);
  const income = [
    { name: 'Bonds', expected: quarterMonth ? monthlyBonds + 3 * quarterlyBonds : monthlyBonds, received: credit('income bond') },
  ];
  for (const m of data.manualMonthlyIncome || []) {
    income.push({
      name: m.name, expected: m.amount,
      received: sum(rows.filter((e) => (e.desc || '').toLowerCase() === m.match), (e) => e.credit),
    });
  }
  const totalExpected = sum(income, (x) => x.expected), totalReceived = sum(income, (x) => x.received);
  const groupOf = (label, cats) => ({ name: label, amount: sum(cats, debit) });
  const spend = [
    groupOf('Groceries & needs', ['family budget']), groupOf('Outside food', ['food']), groupOf('Medical', ['medical']),
    groupOf('Travel', ['travel']), groupOf('Rent', ['rent']), groupOf('Utilities', ['utilities']),
  ];
  const lifestyle = groupOf('Clothes, entertainment, vacation, gifts', ['cloths', 'entertainment', 'vacation', 'gifts']);
  // Everything else that was paid out and is not income, an investment or a transfer (EMI, tax, "others", custom categories).
  // These are not in Home's groups. The owner can choose to count each one (optional setting, old files work without it).
  const grouped = new Set(['family budget', 'food', 'medical', 'travel', 'rent', 'utilities', 'cloths', 'entertainment', 'vacation', 'gifts']);
  const kinds = kindOf(data), counted = new Set((data.settings.homeSpendExtra || []).map((x) => String(x).toLowerCase()));
  const oth = new Map();
  for (const e of rows) {
    const key = (e.category || '').trim().toLowerCase();
    if (!key || grouped.has(key) || !(e.debit > 0) || kinds(e.category) !== 'expense') continue;
    const r = oth.get(key) || { key, name: (e.category || '').trim(), amount: 0, count: 0, counted: counted.has(key) };
    r.amount += e.debit; r.count++; oth.set(key, r);
  }
  const others = [...oth.values()].sort((a, b) => b.amount - a.amount);
  for (const o of others) if (o.counted) spend.push({ name: o.name, amount: o.amount });
  const notCounted = sum(others.filter((o) => !o.counted), (o) => o.amount);
  const totalSpent = sum(spend, (x) => x.amount); // sheet's G55 excludes the lifestyle line, we show it separately
  return { month, income, totalExpected, totalReceived, yetToReceive: totalExpected - totalReceived, spend, lifestyle, totalSpent, remaining: totalExpected - totalSpent, others, notCounted };
}

// ---------- receivables (Fixed Income!A50:L59) ----------
export function receivableStatus(r, asOf) {
  const ms = monthStart(asOf);
  const due = r.term === 'Yearly' && r.dueDate ? r.dueDate : iso(toMs(ms) + (Math.max(1, r.dueDay || 1) - 1) * DAY);
  const notStarted = !!r.startDate && r.startDate > due && r.startDate > asOf;
  const received = !!r.lastReceived && r.lastReceived >= due;
  let paid = 0;
  if (r.startDate && r.lastReceived) {
    const a = r.startDate.split('-').map(Number), b = r.lastReceived.split('-').map(Number);
    paid = (b[0] - a[0]) * 12 + (b[1] - a[1]) - (b[2] < a[2] ? 1 : 0);
  }
  return { ...r, due, received, notStarted, overdue: !received && !notStarted && due < asOf, dueToday: !received && !notStarted && due === asOf, installmentsPaid: Math.max(0, paid), total: Math.max(0, paid) * (r.expected || 0) };
}

// ---------- projections (Proj + Targets sheets) ----------
/** Cash!B33:E45: interest earned per day, growing as new money is invested each month. */
export function dailyCreditSeries(all, data, months) {
  const a = data.settings.assumptions;
  const fdsPerDay = all.cashflow.slice(3).reduce((x, c) => x + c.perDay, 0); // Home!D29:D31 (bonds, FDs, lending)
  const savPerDay = all.cashflow.slice(0, 3).reduce((x, c) => x + c.perDay, 0); // Home!D26:D28
  const step = (a.monthlyInvestment * a.interestPrediction) / 365;
  const out = [];
  let fd = fdsPerDay;
  months.forEach((m, i) => {
    if (i > 0) { const mo = Number(m.slice(5, 7)); if (mo !== 3 && mo !== 4) fd += step; }
    out.push({ month: m, fdPerDay: fd, savPerDay, total: fd + savPerDay });
  });
  return out;
}

export function projection(data, all) {
  const rows = data.proj.months;
  const series = dailyCreditSeries(all, data, rows.map((r) => r.date.slice(0, 7)));
  return rows.map((r, i) => {
    const annual = series[i].total * 30 - r.monthlyInterest;
    const projected = r.salary + r.monthlyInterest + annual + r.pf + r.family + r.other + r.emi + r.tax;
    return { ...r, annual, projected };
  });
}

export function actualMonthFlow(data, month) {
  const rows = monthLedger(data, month);
  const cr = (f) => sum(rows.filter(f), (e) => e.credit), db = (f) => sum(rows.filter(f), (e) => e.debit);
  const cat = (e) => (e.category || '').toLowerCase();
  const salary = cr((e) => cat(e) === 'salary');
  const interest = cr((e) => cat(e) !== 'salary');
  const emi = db((e) => cat(e) === 'loan');
  const tax = db((e) => cat(e) === 'tax');
  const kind = kindOf(data);
  const living = db((e) => kind(e.category) !== 'investment' && cat(e) !== 'loan' && cat(e) !== 'tax');
  return { month, salary, interest, living: -living, emi: -emi, tax: -tax, net: salary + interest - living - emi - tax, has: rows.length > 0 };
}

/** Targets sheet rows 2-14 (planned vs actual net worth). */
export function targets(data, proj) {
  const t = data.targets;
  const out = [];
  t.months.forEach((m, i) => {
    const prev = out[i - 1];
    const k = i === 0 ? 0 : proj[i - 1]?.projected || 0;
    const plannedAsset = i === 0 ? t.startAsset : (prev.actualAsset > 0 ? prev.actualAsset : prev.plannedAsset) + k;
    const plannedLiab = i === 0 ? t.startLiability : prev.plannedLiab - t.liabilityStep;
    const estAsset = i === 0 ? plannedAsset : prev.estAsset + k;
    const row = {
      date: m.date, plannedAsset, plannedLiab, plannedNet: plannedAsset - plannedLiab, projected: k, estAsset,
      actualAsset: m.actualAsset || (i === 0 ? t.startAsset : null), actualLiab: m.actualLiability || (i === 0 ? t.startLiability : null),
    };
    row.actualNet = row.actualAsset != null ? row.actualAsset - (row.actualLiab || 0) : null;
    row.slippage = row.actualNet != null ? row.actualNet - row.plannedNet : null;
    out.push(row);
  });
  return out;
}

/** Targets!B19:D27 and A31:K42. */
export function investmentTargets(data, all) {
  const t = data.targets;
  const plan = t.investmentPlan;
  const totalPlan = sum(plan, (p) => p.capital);
  const rows = plan.map((p) => {
    const cur = all.exposure.find((e) => e.type.startsWith(p.name)) || { capital: 0, pct: 0, risk: '' };
    return { name: p.name, plan: p.capital, planPct: totalPlan ? p.capital / totalPlan : 0, current: cur.capital, currentPct: cur.pct, risk: cur.risk };
  });
  const extra = sum(t.otherReturns, (o) => o.capital * o.rate);
  return { rows, totalPlan, extraReturns: extra, otherReturns: t.otherReturns };
}

/** Proj!L13:T85 long-term wealth simulation. */
export function longTerm(data) {
  const p = data.proj.longTerm;
  const out = [];
  let portfolio = p.startPortfolio;
  let monthly = (p.kaliSalaryYear + p.suguSalaryYear) / 12;
  let date = p.startDate;
  for (let i = 0; i < p.months; i++) {
    const [y, mo] = date.split('-').map(Number);
    if (i > 0 && mo === 2) monthly *= 1 + p.hike;
    const tax = mo >= 2 && mo <= 4 ? p.taxPerYear + p.taxStep * (y - Number(p.startDate.slice(0, 4))) : 0;
    const net = monthly - tax;
    const returns = (portfolio * p.returns) / 12;
    const after = portfolio + net - p.monthlyExpense + returns;
    out.push({ date, income: monthly, tax, net, expense: p.monthlyExpense, before: portfolio, returns, after });
    portfolio = after;
    date = addMonths(date, 1);
  }
  return out;
}

// ---------- XIRR ----------
export function xirr(flows, guess = 0.1) {
  const f = flows.filter((x) => x.amount && !isNaN(x.t)).sort((a, b) => a.t - b.t);
  if (f.length < 2 || !f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null;
  const t0 = f[0].t;
  const npv = (r) => f.reduce((a, x) => a + x.amount / Math.pow(1 + r, (x.t - t0) / DAY / 365), 0);
  let lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** Return metrics per asset class. XIRR needs dated cash flows, so only classes that carry dates are included. */
export function returns(data, all) {
  const asOf = toMs(all.asOf);
  const out = [];
  const add = (name, flows, value, invested, note) => {
    const f = flows.slice();
    if (value) f.push({ t: asOf, amount: value });
    out.push({ name, invested, value, gain: value - invested, ret: invested ? (value - invested) / invested : null, xirr: xirr(f), note, flows: f });
  };
  // Gold
  const gf = data.gold.purchases.filter((p) => p.amount && p.date).map((p) => ({ t: toMs(p.date), amount: -p.amount }));
  const sch = data.gold.schemes.find((s) => s.active);
  const sf = sch ? sch.entries.map((e) => ({ t: toMs(e.date), amount: -e.amount })) : [];
  add('Gold', gf.concat(sf), all.gold.value, all.gold.invested);
  // Bonds: principal out, coupons in monthly (quarterly for quarterly bonds)
  const coupons = (it, gross) => {
    const fl = [{ t: toMs(it.depositDate), amount: -it.principal }];
    const step = it.credit === 'Quarterly' ? 3 : 1;
    let d = addMonths(it.depositDate, step);
    while (toMs(d) <= asOf) { fl.push({ t: toMs(d), amount: it.principal * it.rate * (step / 12) * (gross ? 1 : 1) }); d = addMonths(d, step); }
    return fl;
  };
  const bf = all.bonds.flatMap((b) => coupons(b));
  add('Bonds', bf, all.fixed.bondPrincipal, all.fixed.bondPrincipal, 'Coupons assumed paid on schedule, before TDS');
  // FDs and compounding lending: value = principal + accrued
  const comp = all.fds.concat(all.lending.filter((l) => l.interestType === 'Compound' && l.principal > 0));
  add('FDs & compounding loans', comp.map((x) => ({ t: toMs(x.depositDate), amount: -x.principal })),
    sum(comp, (x) => x.value), sum(comp, (x) => x.principal));
  const pay = all.lending.filter((l) => l.interestType === 'Payout' && l.principal > 0);
  add('Private lending (monthly payout)', pay.flatMap((l) => coupons({ ...l, credit: 'Monthly' })), sum(pay, (x) => x.principal), sum(pay, (x) => x.principal), 'Coupons assumed paid on schedule');
  // EPF / PPF: your entries say how much went in and when; the yearly rate is the declared one (see epf.js).
  const ep = all.savings.filter((s) => s.type === 'EPF' || s.type === 'PPF');
  const ems = ep.map((s) => modelFlows(s, all.asOf, toMs));
  const recorded = sum(ep, (x) => x.principal), put = sum(ems, (m) => m.put);
  const passFlows = ep.flatMap((s) => s.entries.filter((e) => e.date && !/interest/i.test((e.kind || '') + ' ' + (e.remarks || ''))).map((e) => ({ t: toMs(e.date), amount: -((e.employee || 0) + (e.employer || 0) + (e.amount || 0)) }))).concat(recorded ? [{ t: asOf, amount: recorded }] : []);
  const passbook = xirr(passFlows);
  add('EPF & PPF', ems.flatMap((m) => m.flows.slice(0, -1)), sum(ems, (m) => m.value), put,
    'At the interest rates declared each year' + (passbook != null ? `; the interest credited in your entries works out to ${(passbook * 100).toFixed(1)}%` : ''));
  const er = out[out.length - 1]; er.value = recorded; er.gain = recorded - put; er.ret = put ? (recorded - put) / put : null; er.passbookXirr = passbook;
  // Chits, insurance, recurring deposits and other savings: payments out, an estimated value today.
  // The estimate uses the XIRR from the expected payout when one is entered, otherwise the assumed yearly rate. Closing a chit gives the real figure.
  const cs = all.savings.filter((s) => s.type !== 'EPF' && s.type !== 'PPF' && s.entries.some((e) => e.amount > 0 && e.date));
  if (cs.length) {
    const flows = [], rate = (s) => (s.xirr != null && isFinite(s.xirr) ? s.xirr : s.rate || 0);
    let est = 0, paid = 0;
    for (const s of cs) for (const e of s.entries) {
      if (!(e.amount > 0) || !e.date) continue;
      flows.push({ t: toMs(e.date), amount: -e.amount });
      est += e.amount * Math.pow(1 + rate(s), Math.max(0, asOf - toMs(e.date)) / DAY / 365); paid += e.amount;
    }
    add('Chits & savings', flows, est, paid, 'Estimated from each expected payout, or the assumed yearly rate. Close a chit with the amount received to see its real return');
    out[out.length - 1].estimated = true;
  }
  // Equity: no purchase dates in the workbook, so only absolute return
  out.push({ name: 'Stocks & ETFs', invested: all.stocks.invested, value: all.stocks.current, gain: all.stocks.pl, ret: all.stocks.ret, xirr: all.stocks.xirr ?? null, flows: all.stocks.xirr != null ? flowsFor(all.stocks.eq, [...all.stocks.eq.flows.keys()], all.stocks.current, asOf) : null, note: all.stocks.eq ? 'XIRR from your imported trades, including sold shares and dividends' : 'Import your Groww history to get XIRR' });
  out.push({ name: 'Mutual funds', invested: all.mf.invested, value: all.mf.current, gain: all.mf.pl, ret: all.mf.ret, xirr: all.mf.xirr ?? null, flows: all.mf.xflows || null, note: all.mf.book ? 'XIRR from your imported transactions' : 'Import your Groww history to get XIRR' });
  return out;
}

/** Dated cash flows of investments that have ended (money in, coupons while they lasted, money back). Their returns are part of the story. */
function closedFlows(all) {
  const out = [];
  const bondish = (it, step) => { const f = [{ t: toMs(it.depositDate), amount: -it.principal }]; let d = addMonths(it.depositDate, step); while (d <= it.closed.date) { f.push({ t: toMs(d), amount: it.principal * it.rate * (step / 12) }); d = addMonths(d, step); } return f; };
  const fin = (it, f) => out.push(f.concat([{ t: toMs(it.closed.date), amount: it.closed.amount }]));
  for (const b of all.closed.bonds) if (b.closed && b.depositDate) fin(b, bondish(b, b.credit === 'Quarterly' ? 3 : 1));
  for (const x of all.closed.fds) if (x.closed && x.depositDate) fin(x, [{ t: toMs(x.depositDate), amount: -x.principal }]);
  for (const l of all.closed.lending) if (l.closed && l.depositDate) fin(l, l.interestType === 'Payout' ? bondish(l, 1) : [{ t: toMs(l.depositDate), amount: -l.principal }]);
  for (const sv of all.closed.savings || []) if (sv.closed) { const ents = (sv.entries || []).filter((e) => e.amount > 0 && e.date); if (ents.length) fin(sv, ents.map((e) => ({ t: toMs(e.date), amount: -e.amount }))); }
  return out.flat();
}
/**
 * One yearly return for everything that has dated cash flows: gold, bonds, deposits, lending, EPF and PPF, shares, funds, plus
 * investments you have already closed. It is money-weighted, so long-held money counts for more. `xirrNoPf` leaves EPF and PPF out,
 * because those are long, steady savings and pull the figure down.
 */
export function overallXirr(data, all, rets) {
  const covered = rets.filter((r) => r.xirr != null && r.flows && !r.estimated);   // estimates built from an assumed rate stay out of the headline figure
  const closed = closedFlows(all);
  const merged = covered.flatMap((r) => r.flows).concat(closed);
  const noPf = covered.filter((r) => !/^EPF/.test(r.name)).flatMap((r) => r.flows).concat(closed);
  return { xirr: covered.length ? xirr(merged) : null, xirrNoPf: covered.length ? xirr(noPf) : null, closedCount: all.closed.bonds.length + all.closed.fds.length + all.closed.lending.length + (all.closed.savings || []).length,
    covered: covered.map((r) => r.name), coverage: all.totalAssets ? sum(covered, (r) => r.value) / all.totalAssets : 0 };
}

// ---------- family report (Report sheet) ----------
export function familyReport(data, all) {
  const groups = [];
  const g = (type, label, holder, value, monthly, key) => groups.push({ type, label, holder, value, monthly, key: key || `${type}|${label}|${holder}` });
  const by = (arr, ...keys) => {
    const m = new Map();
    for (const x of arr) { const k = keys.map((f) => f(x)).join('|'); m.set(k, [...(m.get(k) || []), x]); }
    return [...m.values()];
  };
  for (const items of by(all.bonds, (b) => b.platform, (b) => b.holder)) {
    g('Bonds', items[0].platform, items[0].holder, sum(items, (x) => x.principal), sum(items, (x) => x.monthNet));
  }
  const isPrivate = (l) => l.principal > 0 && l.account !== 'Family' || (l.account === 'Family' && l.principal > 0);
  for (const items of by(all.lending.filter((l) => l.principal !== 0), (l) => l.name.replace(/^(To |Money ?[Ll]ending_?)/, '').trim())) {
    const first = items[0];
    g('Private lending', first.name.replace(/^To /, ''), first.account, sum(items, (x) => x.principal + x.accrued),
      sum(items.filter((x) => x.interestType === 'Payout'), (x) => (x.principal * x.rate) / 12));
  }
  for (const f of all.fds) g('Fixed deposits', f.name, f.account, f.value, 0);
  for (const sv of all.savings.filter((x) => x.type !== 'Chit')) g('EPF, PPF & LIC', sv.name, sv.holder, sv.principal, 0);
  for (const sv of all.savings.filter((x) => x.type === 'Chit')) g('Chits', sv.name, sv.holder, sv.principal, 0);
  g('Equity, ETFs & funds', 'Stocks & mutual funds', 'Suganya', all.stocks.current + all.mf.current, 0);
  g('Gold', 'Jewellery & gold', 'Suganya', all.gold.value, 0);
  for (const b of all.banks) g('Bank accounts', `${b.name}`, b.holder, b.balance, 0);
  for (const o of all.gold.others) g('Others', o.name, '', o.amount, 0);
  // Items with the same name (for example three chits called the same) must stay separate: the 2nd and later get their own key.
  const seen = new Map();
  for (const x of groups) { const n = (seen.get(x.key) || 0) + 1; seen.set(x.key, n); if (n > 1) x.key = x.key + '#' + n; }
  const order = ['Bonds', 'Private lending', 'Fixed deposits', 'EPF, PPF & LIC', 'Chits', 'Equity, ETFs & funds', 'Gold', 'Bank accounts', 'Others'];
  const sections = order.map((type) => {
    const items = groups.filter((x) => x.type === type);
    return { type, items, total: sum(items, (x) => x.value), monthly: sum(items, (x) => x.monthly) };
  });
  return { sections, total: sum(sections, (x) => x.total), monthly: sum(sections, (x) => x.monthly) };
}

// ---------- extras: coming up, net worth over time, cash runway ----------
/** Things that fall due soon: maturities, overdue or due money to receive. */
export function upcoming(data, all, days = 60) {
  const from = all.asOf, to = iso(toMs(from) + days * DAY);
  const out = [];
  const add = (date, title, amount, kind) => out.push({ date, title, amount, kind, days: Math.round((toMs(date) - toMs(from)) / DAY) });
  for (const b of all.bonds) if (b.maturityDate >= from && b.maturityDate <= to) add(b.maturityDate, b.name + ' matures', b.principal, 'Bond');
  for (const f of all.fds) if (f.maturityDate >= from && f.maturityDate <= to) add(f.maturityDate, f.name + ' matures', f.value || f.principal, 'Fixed deposit');
  for (const l of all.lending) if (l.principal > 0 && l.maturityDate >= from && l.maturityDate <= to) add(l.maturityDate, l.name + ' due back', l.principal + (l.accrued || 0), 'Lending');
  for (const s of all.savings) if (s.maturityDate && s.maturityDate >= from && s.maturityDate <= to) add(s.maturityDate, s.name + ' matures', s.principal, s.type);
  for (const r of data.receivables.filter((x) => x.active !== false && x.balanceDue > 0).map((x) => receivableStatus(x, from))) {
    if (r.received || r.notStarted) continue;
    if (r.due <= to) add(r.due, r.name + (r.overdue ? ' (overdue)' : r.dueToday ? ' (due today)' : ' to pay you'), r.expected, 'Money to receive');
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Net worth over time: month-end positions from the Targets sheet plus daily snapshots the app keeps. */
export function netWorthSeries(data, all) {
  const pts = new Map();
  for (const m of data.targets?.months || []) if (m.actualAsset > 0 && m.date <= all.asOf) pts.set(m.date, { date: m.date, value: m.actualAsset - (m.actualLiability || 0), src: 'month end' });
  const hist = (data.history || []).filter((h) => h.date <= all.asOf);
  for (const h of hist) pts.set(h.date, { date: h.date, value: h.net, src: 'daily' });
  pts.set(all.asOf, { date: all.asOf, value: all.netAsset, src: 'today' });
  return [...pts.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** How many months the cash in the bank would cover, from the last three full months of spending. */
export function runway(data, all) {
  const cur = monthKey(all.asOf);
  const months = ledgerMonths(data).filter((m) => m < cur).slice(-3);
  if (!months.length) return { avg: 0, months: null, cash: all.cashTotal, basis: 0, coverage: null };
  const avg = sum(months, (m) => monthSummary(data, m).totalExpense) / months.length;
  // coverage: how much of the monthly spending the interest income pays for
  return { avg, months: avg ? all.cashTotal / avg : null, cash: all.cashTotal, basis: months.length, coverage: avg ? all.cfTotal.perMonth / avg : null };
}


// ---------- loans you owe ----------
/** Interest on each loan is outstanding x rate / 12. EMI, if given, splits into interest and principal. */
export function loanSummary(data) {
  const items = (data.liabilities || []).map((l) => {
    const amount = l.amount || 0, rate = l.rate || 0;
    const monthlyInterest = (amount * rate) / 12;
    const emi = l.emi || 0;
    return { ...l, amount, rate, monthlyInterest, yearlyInterest: monthlyInterest * 12, emi, principalPart: emi ? Math.max(0, emi - monthlyInterest) : 0 };
  });
  const sumBy = (k) => items.reduce((a, x) => a + (x[k] || 0), 0);
  return { items, total: sumBy('amount'), monthlyInterest: sumBy('monthlyInterest'), yearlyInterest: sumBy('yearlyInterest'), emi: sumBy('emi'), avgRate: sumBy('amount') ? sumBy('monthlyInterest') * 12 / sumBy('amount') : 0 };
}
