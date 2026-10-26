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

/** Days in the calendar month of a date (YYYY-MM-DD). */
export const daysInMonthOf = (d) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();

/** Bonds (Fixed Income!A3:N22). Interest is paid out, nothing accrues into the principal. */
export function calcBond(b, asOf, s) {
  const dim = daysInMonthOf(asOf);   // the real length of the month, not a fixed 30
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

/**
 * Days a bond earned interest in a calendar month ('YYYY-MM'): from the day it was bought up to the day before it matured or was closed.
 * A bond bought after the month, or closed before it, earns nothing in that month.
 */
export function bondDaysIn(b, month) {
  const start = month + '-01', next = addMonths(start, 1);
  const from = b.depositDate && b.depositDate > start ? b.depositDate : start;
  const stop = b.closed && b.closed.date ? b.closed.date : b.maturityDate;
  const to = stop && stop < next ? stop : next;
  return Math.max(0, Math.round((toMs(to) - toMs(from)) / DAY));
}
/**
 * Interest a bond pays for one calendar month, after TDS: the daily interest times the days it was really held in that month
 * (28, 30 or 31, fewer in the month it was bought or closed). An amount entered on the bond as "what reaches me" wins for a full month.
 */
export function bondNetIn(b, month, tdsRate = 0.1) {
  const days = bondDaysIn(b, month);
  if (!days) return 0;
  const full = days === daysInMonthOf(month + '-01');
  if (b.payoutAmount > 0 && full) return b.payoutAmount / (b.credit === 'Quarterly' ? 3 : 1);
  return ((b.principal * b.rate) / 365) * days * (1 - tdsRate);
}
/**
 * Quarterly bonds: which months of the year the interest is paid in. 0 = Jan, Apr, Jul, Oct (the default), 1 = Feb, May, Aug, Nov, 2 = Mar, Jun, Sep, Dec.
 * The payment covers the three months ending in the payout month. In the month a bond matures or closes it also pays whatever is left since the last payout.
 */
export const quarterOffset = (b) => ([1, 2].includes(Number(b.quarterMonth)) ? Number(b.quarterMonth) : 0);
export const QUARTER_CHOICES = [{ value: 0, label: 'Jan · Apr · Jul · Oct' }, { value: 1, label: 'Feb · May · Aug · Nov' }, { value: 2, label: 'Mar · Jun · Sep · Dec' }];
const isPayMonth = (b, month) => (Number(month.slice(5, 7)) - 1) % 3 === quarterOffset(b);
/** Does this bond pay interest into the bank in `month`? Monthly bonds every month, quarterly ones in their payout months and in the month they end. */
export function bondPaysIn(b, month) {
  if (b.credit !== 'Quarterly') return true;
  if (isPayMonth(b, month)) return true;
  const end = b.closed && b.closed.date ? b.closed.date : b.maturityDate;
  return !!end && end.slice(0, 7) === month;
}
/** What a bond pays in `month` as a cash credit: every month for Monthly, the months since the last payout for Quarterly. */
export function bondDueAmount(b, month, tdsRate = 0.1) {
  if (b.credit !== 'Quarterly') {
    // A payment cannot fall due before the money went in: a bond bought on the 12th that pays on the 9th first pays next month, and that payment also covers the days since it was bought.
    const early = (m) => !!b.depositDate && m === b.depositDate.slice(0, 7) && bondDueDate(b, m) < b.depositDate;
    if (early(month)) return 0;
    const prev = addMonths(month + '-01', -1).slice(0, 7);
    return bondNetIn(b, month, tdsRate) + (early(prev) ? bondNetIn(b, prev, tdsRate) : 0);
  }
  if (!bondPaysIn(b, month)) return 0;
  let t = 0;
  for (let i = 0; i < 3; i++) { const m = addMonths(month + '-01', -i).slice(0, 7); if (i > 0 && isPayMonth(b, m)) break; t += bondNetIn(b, m, tdsRate); }
  return t;
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

/** Months between payouts of an interest-paying deposit or loan: from its Compounding / payout setting. */
export const payoutStep = (x) => ({ Monthly: 1, Quarterly: 3, Yearly: 12 }[x.compound] || 1);
/** What reaches you each month on average: the amount you entered per payout, else the rate on the amount. */
export const payoutMonthly = (x) => (x.payoutAmount > 0 ? x.payoutAmount / payoutStep(x) : (x.principal * x.rate) / 12);
/**
 * Interest received so far on a paying-out deposit or loan. With the payout amount entered: that amount for every payout date reached (one a month, quarter or year after the start, up to today or the end).
 * Without it: the rate on the amount, by days, up to today or the end.
 */
export function interestReceived(x, asOf) {
  if (!(x.principal > 0) || !x.depositDate) return 0;
  const stop = x.closed ? x.closed.date : x.maturityDate;
  const end = stop && stop < asOf ? stop : asOf;
  if (end <= x.depositDate) return 0;
  if (x.payoutAmount > 0) {
    const step = payoutStep(x); let n = 0, d = addMonths(x.depositDate, step);
    while (d <= end && n < 1200) { n++; d = addMonths(x.depositDate, step * (n + 1)); }
    return n * x.payoutAmount;
  }
  return ((toMs(end) - toMs(x.depositDate)) / DAY) * x.principal * x.rate / 365;
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
/** The date a chit or recurring deposit ends: the one entered, else the first payment plus its tenure. */
export function savingEnd(sv) {
  if (sv.maturityDate) return sv.maturityDate;
  const ents = (sv.entries || []).filter((e) => e.amount > 0 && e.date).map((e) => e.date).sort();
  const m = tenureMonths(sv);
  return ents.length && m ? addMonths(ents[0], m - 1) : null;
}
/**
 * The instalments still to be paid: one a month after the last payment up to the end date (or the tenure when there is no end date).
 * Each is the expected monthly payment you entered, otherwise the average paid so far.
 */
export function remainingInstalments(sv) {
  const ents = (sv.entries || []).filter((e) => e.amount > 0 && e.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!ents.length) return [];
  const amt = sv.nextPayment > 0 ? sv.nextPayment : sum(ents, (e) => e.amount) / ents.length;
  const endD = savingEnd(sv), out = [];
  const last = ents[ents.length - 1].date;
  const cap = endD ? 600 : Math.max(0, tenureMonths(sv) - ents.length);
  for (let i = 1; i <= cap; i++) { const d = addMonths(last, i); if (endD && d > endD) break; out.push({ date: d, amount: amt }); }
  return out;
}
/**
 * What a chit or recurring deposit is expected to pay at its end.
 * kind 'entered': the expected payout you typed. 'projected': payments so far and the remaining instalments grown at the yearly rate to the end date. 'paid': only what has been paid in, when there is no rate or end date to project with.
 */
export function savingMaturity(sv) {
  const paid = savingPrincipal(sv);
  if (sv.payout > 0) return { amount: sv.payout, kind: 'entered' };
  const ents = (sv.entries || []).filter((e) => e.amount > 0 && e.date);
  const endD = savingEnd(sv);
  if (endD && ents.length && sv.rate > 0 && sv.type !== 'EPF' && sv.type !== 'PPF') {
    const end = toMs(endD), fv = (amt, date) => amt * Math.pow(1 + sv.rate, Math.max(0, end - toMs(date)) / DAY / 365);
    const total = sum(ents, (e) => fv(e.amount, e.date)) + sum(remainingInstalments(sv), (r) => fv(r.amount, r.date));
    return { amount: total, kind: 'projected' };
  }
  return { amount: paid, kind: 'paid' };
}
export function savingXirr(sv, asOf) {
  if (sv.type === 'EPF' || sv.type === 'PPF') return {};
  const ents = sv.entries.filter((e) => e.amount > 0 && e.date);
  if (!ents.length) return {};
  const flows = ents.map((e) => ({ t: toMs(e.date), amount: -e.amount }));
  if (sv.closed) { const x = xirr(flows.concat([{ t: toMs(sv.closed.date), amount: sv.closed.amount }])); return { xirr: x, xirrKind: 'actual' }; }
  const endD = savingEnd(sv);
  if (sv.payout > 0 && endD) {
    const f = flows.concat(remainingInstalments(sv).map((r) => ({ t: toMs(r.date), amount: -r.amount })));
    f.push({ t: toMs(endD), amount: sv.payout });
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
/** Income vs expense report: income, expenses and investments for a period, each by category with its descriptions underneath. */
export function flowReport(data, from, to) {
  const s = rangeSummary(data, from, to);
  const tree = (cats, rows, field) => cats.map((c) => {
    const mine = rows.filter((e) => (e.category || 'Unknown') === c.category);
    return { category: c.category, amount: c.amount, count: mine.length, items: byDescription(mine, field) };
  });
  const out = s.totalExpense + s.totalInvest;
  return {
    ...s,
    incomeTree: tree(s.income, s.incomeRows, 'credit'),
    expenseTree: tree(s.expense, s.expenseRows, 'debit'),
    investTree: tree(s.invest, s.investRows, 'debit'),
    saved: s.totalIncome - out,
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

const nameWords = (n) => nameKey(n).split(' ').filter((w) => w.length >= 4 && w !== 'lending');
/** Same person: equal or contained names, or a shared word ("Lending Pandi" and "Alagu Pandi" both have "pandi"). */
const looseName = (a, b) => sameName(a, b) || nameWords(a).some((w) => nameWords(b).includes(w));
/**
 * What a monthly Money to receive line pays in `month`. Interest is paid in arrears: money lent in a month first pays the month after, and only for the days it was out
 * (lent on the 7th of a 31-day month: 25 of 31 days of the full amount). The month it went out pays nothing, every later month pays in full. Before the start and after
 * a closing date it is 0. Yearly lines are not monthly income and are 0 here.
 */
export function dueInMonth(r, month) {
  if (!r || r.term === 'Yearly') return 0;
  const amount = Number(r.expected) || 0;
  const end = r.active === false ? (r.closedOn || r.closedDate || r.lastReceived || '') : '';
  if (end && end < month + '-01') return 0;
  const s = r.startDate;
  if (!s) return amount;
  const sm = s.slice(0, 7);
  if (month <= sm) return 0;
  if (month === addMonths(sm + '-01', 1).slice(0, 7)) {
    const dim = daysInMonthOf(sm + '-01'), day = Math.min(dim, Math.max(1, Number(s.slice(8, 10)) || 1));
    return Math.round((amount * (dim - day + 1)) / dim);
  }
  return amount;
}
/**
 * Which Money to receive lines a monthly income line stands for. Several loans can share a person ("Alagu Pandi" has four), and the line may be named differently ("Lending Pandi"),
 * so: 1) lines of that person with exactly that amount, 2) all of that person's lines when their amounts add up to the line (one line for the person), 3) the one line of that person,
 * 4) the only line with that amount. When nothing matches, lending and deposits are used for the start and end dates instead. Returns `recs` and, as a fallback, `starts`/`ends`.
 */
export function incomeWindow(data, m) {
  const amt = Number(m.amount) || 0, same = (v) => Math.abs((v || 0) - amt) < 1;
  const recs0 = (data.receivables || []).filter((x) => x.term !== 'Yearly');
  const mine = recs0.filter((x) => looseName(x.name, m.name));
  let recs = mine.filter((x) => same(x.expected));
  if (!recs.length && mine.length > 1) { const act = mine.filter((x) => x.active !== false); for (const set of [act, mine]) if (set.length && same(sum(set, (x) => x.expected))) { recs = set; break; } }
  if (!recs.length && mine.length === 1) recs = mine;
  if (!recs.length) { const one = recs0.filter((x) => same(x.expected)); if (one.length === 1) recs = one; }
  const lend = (data.lending || []).concat(data.fds || []);
  let loans = [];
  if (!recs.length) {
    loans = lend.filter((x) => looseName(x.name, m.name));
    if (loans.length > 1) { const one = loans.filter((x) => same(payoutMonthly(x))); if (one.length) loans = one; }
    if (!loans.length) { const one = lend.filter((x) => same(payoutMonthly(x))); if (one.length === 1) loans = one; }
  }
  const min = (a) => a.filter(Boolean).sort()[0] || '', max = (a) => a.filter(Boolean).sort().pop() || '';
  const starts = recs.length ? min(recs.map((x) => x.startDate)) : min(loans.map((x) => x.depositDate));
  const ends = recs.length ? (recs.every((x) => x.active === false) ? max(recs.map((x) => x.closedOn || x.closedDate || x.lastReceived)) : '') : (loans.length && loans.every((x) => x.closed && x.closed.date) ? max(loans.map((x) => x.closed.date)) : '');
  return { recs, starts, ends };
}

/** Home!A38:J56 monthly cash flow: expected interest vs received, and spending groups. */
export function monthCashflow(data, all, month) {
  const rows = monthLedger(data, month);
  const credit = (cat) => sum(rows.filter((e) => (e.category || '').toLowerCase() === cat), (e) => e.credit);
  const debit = (cat) => sum(rows.filter((e) => (e.category || '').toLowerCase() === cat), (e) => e.debit);
  const tds = data.settings.tdsRate ?? 0.1;
  // every bond that was held in this month, today's and closed ones, so an old month is judged by what you held then
  const held = (all.bonds || []).concat((all.closed && all.closed.bonds) || []);
  const per = held.map((b) => ({ name: b.name, holder: b.holder, company: b.company, due: bondDueDate(b, month), expected: bondDueAmount(b, month, tds) })).filter((x) => x.expected > 0.5);
  const bondsExpected = sum(per, (x) => x.expected);
  // What the bank shows against each bond is kept as `credited`, for checking a tax year against the bank. It is NOT what decides received: bank entries often come late or several together.
  matchBondCredits(rows.filter((e) => (e.category || '').toLowerCase() === 'income bond' && e.credit > 0), per);
  // A bond counts as received once its due date has come (today included), and as pending until then.
  for (const x of per) { x.credited = x.received; x.received = x.due <= all.asOf ? x.expected : 0; x.pending = x.expected - x.received; }
  const bondsReceived = sum(per, (x) => x.received);
  const bankCredit = sum(rows.filter((e) => (e.category || '').toLowerCase() === 'income bond' && e.credit > 0), (e) => e.credit);
  const income = [
    { name: 'Income Bond', expected: bondsExpected, received: bondsReceived, bonds: per, bankCredit },
  ];
  const mStart = month + '-01', mEnd = `${month}-${String(daysInMonthOf(mStart)).padStart(2, '0')}`;
  for (const m of data.manualMonthlyIncome || []) {
    const w = incomeWindow(data, m);
    let expected = Number(m.amount) || 0, fromDues;
    if (w.recs.length) {
      // lines that are in Money to receive follow their own start date, with the first month pro-rated; the amount of a part month is shown as pending until it comes
      expected = sum(w.recs, (r) => dueInMonth(r, month));
      fromDues = sum(w.recs.filter((r) => r.lastReceived && r.lastReceived.slice(0, 7) === month), (r) => dueInMonth(r, month) || r.expected || 0);
    } else {
      // no Money to receive line: judge by the lending or deposit it belongs to; interest first pays the month after it was lent
      if ((w.starts && w.starts.slice(0, 7) >= month) || (w.ends && w.ends < mStart)) continue;
      fromDues = receivedFromDues(data, month, m.name);
    }
    if (!(expected > 0.5)) continue;
    const fromLedger = sum(rows.filter((e) => (e.desc || '').toLowerCase() === m.match), (e) => e.credit);
    const received = Math.max(fromLedger, fromDues, (m.paidMonths || []).includes(month) ? expected : 0);
    // What actually came in is always part of the budget: a pro-rated or estimated amount must never be lower than what was paid, or "received" ends up above "expected".
    income.push({ name: m.name, expected: Math.max(expected, received), received, since: w.starts, part: !!w.recs.length && expected < (Number(m.amount) || 0) - 0.5 });
  }
  const totalExpected = sum(income, (x) => x.expected), totalReceived = sum(income, (x) => x.received);
  const groupOf = (label, cats) => ({ name: label, amount: sum(cats, debit), cats });
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
  for (const o of others) if (o.counted) spend.push({ name: o.name, amount: o.amount, cats: [o.key] });
  const notCounted = sum(others.filter((o) => !o.counted), (o) => o.amount);
  const totalSpent = sum(spend, (x) => x.amount); // sheet's G55 excludes the lifestyle line, we show it separately
  return { month, income, totalExpected, totalReceived, yetToReceive: totalExpected - totalReceived, spend, lifestyle, totalSpent, remaining: totalExpected - totalSpent, others, notCounted };
}

/**
 * Sets the bank's "Income Bond" credits against the bonds due in a month. The credit does not say which bond it paid, so:
 * 1) a credit that equals a bond's expected interest (within a rupee or two) belongs to it, 2) a credit whose description names the bond or its company belongs to it,
 * 3) whatever is left goes to the bonds still short, in due-date order, but never to a bond that was not yet due when the money came. Fills received and pending on each row of `per`.
 */
export function matchBondCredits(credits, per) {
  const pool = credits.map((e) => ({ left: e.credit, desc: nameKey(e.desc), date: e.date || '' }));
  const order = per.slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.name.localeCompare(b.name)));
  for (const x of per) x.received = 0;
  const take = (x, c, amt) => { const u = Math.min(c.left, amt); c.left -= u; x.received += u; };
  // money cannot pay a bond before its due date (a few days early is allowed), whichever rule found the match
  const dueBy = (x, c) => !c.date || !x.due || c.date >= iso(toMs(x.due) - 3 * DAY);
  // 1) the amount fits. Every bond and credit that are within a rupee or two (or 1%) of each other are paired, closest amount first and then closest to the due date,
  // so two bonds with almost the same interest each get their own credit instead of the first one that happens to fit.
  const pairs = [];
  for (const x of per) for (const c of pool) {
    const d = Math.abs(c.left - x.expected);
    if (c.left > 0.5 && dueBy(x, c) && d <= Math.max(2, x.expected * 0.01)) pairs.push({ x, c, d, gap: c.date && x.due ? Math.abs(toMs(c.date) - toMs(x.due)) : 0 });
  }
  pairs.sort((p, q) => p.d - q.d || p.gap - q.gap);
  for (const p of pairs) if (p.c.left > 0.5 && p.x.received < 0.5) take(p.x, p.c, p.x.expected);
  const words = (n) => nameKey(String(n || '').split('_')[0]).split(' ').filter((w) => w.length >= 4);
  for (const x of order) {   // 2) the description names it
    if (x.received >= x.expected - 0.5) continue;
    const w = words(x.name), w2 = words(x.company);
    for (const c of pool) if (c.left > 0.5 && dueBy(x, c) && (w.concat(w2)).some((t) => c.desc.includes(t))) take(x, c, x.expected - x.received);
  }
  // 3) the rest, by due date. A credit cannot pay a bond before its due date (a few days early is allowed), so money that came on the 5th is not set against a bond due on the 28th
  for (const x of order) {
    for (const c of pool) { const u = c.left > 0 && dueBy(x, c) ? Math.min(c.left, Math.max(0, x.expected - x.received)) : 0; c.left -= u; x.received += u; }
  }
  for (const x of per) x.pending = Math.max(0, x.expected - x.received);
  return per;
}

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Same person or lender? Equal after tidying, or one name contains the other ("Lending Pandi" and "Pandi"). */
export function sameName(a, b) { const x = nameKey(a), y = nameKey(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))); }
/** Money marked received in `month` under Money to receive, for a person or lender. */
export function receivedFromDues(data, month, name) {
  return sum((data.receivables || []).filter((r) => r.lastReceived && r.lastReceived.slice(0, 7) === month && sameName(r.name, name)), (r) => r.expected || 0);
}

/** What has been received from each person under Money to receive, closed ones included. */
export function receivedByPerson(data, asOf) {
  const m = new Map();
  for (const r0 of data.receivables || []) {
    const r = receivableStatus(r0, asOf), k = nameKey(r.name) || r.id;
    const e = m.get(k) || { name: r.name, payments: 0, total: 0, last: '', open: 0, closed: 0, expected: 0 };
    e.payments += r.installmentsPaid || 0; e.total += r.total || 0;
    if (r.lastReceived && r.lastReceived > e.last) e.last = r.lastReceived;
    if (r.active === false) e.closed++; else { e.open++; e.expected += r.expected || 0; }
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}
/** Closed bonds, deposits and private lending: what went in, what was received on the way (interest, coupons), what came back. Private lending is added up per person. */
export function closedSummary(data, all) {
  const asOf = all.asOf;
  const rcs = (data.receivables || []).map((r) => receivableStatus(r, asOf));
  const row = (name, o) => { const total = o.interest + o.back; return { name, count: o.count, invested: o.invested, interest: o.interest, back: o.back, total, gain: total - o.invested, note: o.note || '' }; };
  const items = (list, withInterest) => list.map((x) => row(x.name, { count: 1, invested: Math.abs(x.principal), interest: withInterest(x), back: x.closed.amount }));
  const bonds = items(all.closed.bonds, (x) => interestReceived(x, asOf));
  const fds = items(all.closed.fds, () => 0);
  const people = new Map();
  for (const it of all.closed.lending) {
    const k = nameKey(it.name), e = people.get(k) || { name: it.name, count: 0, invested: 0, interest: 0, back: 0, dues: 0, hasDues: false };
    e.count++; e.invested += Math.abs(it.principal); e.back += it.closed.amount; e.interest += it.interestType === 'Payout' ? interestReceived(it, asOf) : 0;
    people.set(k, e);
  }
  for (const e of people.values()) { const m = rcs.filter((r) => sameName(r.name, e.name)); if (m.length) { e.dues = sum(m, (r) => r.total || 0); e.hasDues = true; } }
  for (const r of rcs.filter((r) => r.active === false)) if (![...people.values()].some((e) => sameName(e.name, r.name))) people.set('dues:' + nameKey(r.name), { name: r.name, count: 0, invested: 0, interest: 0, back: 0, dues: r.total || 0, hasDues: true, note: 'closed in Money to receive' });
  const lending = [...people.values()].map((e) => row(e.name, { ...e, interest: e.hasDues ? e.dues : e.interest })).sort((a, b) => b.total - a.total);
  const types = [{ id: 'bonds', label: 'Bonds', items: bonds }, { id: 'fds', label: 'Fixed deposits', items: fds }, { id: 'lending', label: 'Private lending, by person', items: lending }].filter((t) => t.items.length);
  const all2 = types.flatMap((t) => t.items);
  const tot = (k) => sum(all2, (x) => x[k]);
  return { types, invested: tot('invested'), interest: tot('interest'), back: tot('back'), total: tot('total'), gain: tot('gain'), count: all2.reduce((a, x) => a + x.count, 0) };
}

// ---------- receivables (Fixed Income!A50:L59) ----------
export function receivableStatus(r, asOf) {
  const ms = monthStart(asOf);
  const due = r.term === 'Yearly' && r.dueDate ? r.dueDate : iso(toMs(ms) + (Math.max(1, r.dueDay || 1) - 1) * DAY);
  // monthly interest is paid in arrears: money lent this month first pays next month (see dueInMonth)
  const notStarted = (!!r.startDate && r.startDate > due && r.startDate > asOf) || (r.term !== 'Yearly' && !!r.startDate && r.startDate.slice(0, 7) >= due.slice(0, 7));
  const received = !!r.lastReceived && r.lastReceived >= due;
  let paid = 0;
  if (r.startDate && r.lastReceived) {
    const a = r.startDate.split('-').map(Number), b = r.lastReceived.split('-').map(Number);
    paid = (b[0] - a[0]) * 12 + (b[1] - a[1]) - (b[2] < a[2] ? 1 : 0);
  }
  const dueAmount = r.term === 'Yearly' ? (r.expected || 0) : (dueInMonth(r, due.slice(0, 7)) || r.expected || 0);
  return { ...r, due, dueAmount, received, notStarted, overdue: !received && !notStarted && due < asOf, dueToday: !received && !notStarted && due === asOf, installmentsPaid: Math.max(0, paid), total: Math.max(0, paid) * (r.expected || 0) };
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

/**
 * XIRR for a group of rows. Dated flows with buys, sells and re-buys can have more than one rate that makes them balance, and a plain search may land on a far one.
 * This scans the whole range, and returns the rate nearest to `guess` (the value-weighted XIRR of the rows), so a group never lands far from its rows.
 */
export function xirrNear(flows, guess = 0.1) {
  const f = flows.filter((x) => x.amount && !isNaN(x.t)).sort((a, b) => a.t - b.t);
  if (f.length < 2 || !f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null;
  const t0 = f[0].t;
  const npv = (r) => f.reduce((a, x) => a + x.amount / Math.pow(1 + r, (x.t - t0) / DAY / 365), 0);
  const grid = []; for (let r = -0.9; r <= 12; r += r < 1 ? 0.01 : 0.25) grid.push(+r.toFixed(4));
  const roots = [];
  for (let i = 1; i < grid.length; i++) {
    let lo = grid[i - 1], hi = grid[i], flo = npv(lo), fhi = npv(hi);
    if (flo === 0) { roots.push(lo); continue; }
    if (flo * fhi > 0) continue;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2, fm = npv(mid); if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
    roots.push((lo + hi) / 2);
  }
  if (!roots.length) return null;
  return roots.reduce((best, r) => (Math.abs(r - guess) < Math.abs(best - guess) ? r : best));
}
const weightedGuess = (rows) => { const w = rows.filter((r) => r.xirr != null && r.value > 0); const t = w.reduce((a, r) => a + r.value, 0); return t ? w.reduce((a, r) => a + r.xirr * r.value, 0) / t : 0.1; };
/** The XIRR of several return rows together. */
export const groupXirr = (rows) => {
  const good = rows.filter((r) => r.xirr != null && r.flows && !r.estimated);
  if (!good.length) return { xirr: null, count: 0 };
  let x = xirrNear(good.flatMap((r) => r.flows), weightedGuess(good)), approx = false;
  const lo = Math.min(...good.map((r) => r.xirr)), hi = Math.max(...good.map((r) => r.xirr));
  // the combined rate of several rows cannot sensibly sit far outside the rows themselves; when it does, the flows have more than one answer, so use the value-weighted average
  if (x == null || x < lo - 0.05 || x > hi + 0.05) { const w = good.reduce((a, r) => a + Math.max(0, r.value), 0); x = w > 0 ? good.reduce((a, r) => a + r.xirr * Math.max(0, r.value), 0) / w : (lo + hi) / 2; approx = true; }
  return { xirr: x, count: good.length, approx };
};

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
  const lendFlows = (l) => {
    if (!(l.payoutAmount > 0)) return coupons({ ...l, credit: 'Monthly' });
    const step = payoutStep(l), fl = [{ t: toMs(l.depositDate), amount: -l.principal }];
    for (let n = 1; addMonths(l.depositDate, step * n) <= all.asOf; n++) fl.push({ t: toMs(addMonths(l.depositDate, step * n)), amount: l.payoutAmount });
    return fl;
  };
  add('Private lending (monthly payout)', pay.flatMap(lendFlows), sum(pay, (x) => x.principal), sum(pay, (x) => x.principal), 'Coupons assumed paid on schedule');
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
  // a yearly return that points the opposite way to the plain gain means the imported trades do not add up (a missing buy or sell); better to show no XIRR than a wrong one
  for (const r of out) {
    if (r.xirr != null && r.ret != null && ((r.ret > 0.02 && r.xirr < -0.05) || (r.ret < -0.02 && r.xirr > 0.05))) { r.rawXirr = r.xirr; r.xirr = null; r.xirrSuspect = true; }
  }
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
  const guess = weightedGuess(covered);
  return { xirr: covered.length ? xirrNear(merged, guess) : null, xirrNoPf: covered.length ? xirrNear(noPf, weightedGuess(covered.filter((r) => !/^EPF/.test(r.name)))) : null, closedCount: all.closed.bonds.length + all.closed.fds.length + all.closed.lending.length + (all.closed.savings || []).length,
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
      sum(items.filter((x) => x.interestType === 'Payout'), (x) => payoutMonthly(x)));
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
/** Bonds whose interest falls due on `date`, going by the due-date rule on the bond (first, last or a fixed day of the month). A bond with no rule is never listed. */
export function bondsDueOn(all, date) {
  const m = Number(date.slice(5, 7)), dim = new Date(Number(date.slice(0, 4)), m, 0).getDate(), day = Number(date.slice(8, 10));
  return (all.bonds || []).filter((b) => {
    if (!b.dueRule || date < b.depositDate || date > b.maturityDate) return false;
    const want = b.dueRule === 'first' ? 1 : b.dueRule === 'last' ? dim : Math.min(dim, Math.max(1, Number(b.dueDay) || 0));
    if (b.dueRule === 'day' && !(Number(b.dueDay) > 0)) return false;
    if (day !== want) return false;
    return bondPaysIn(b, date.slice(0, 7));   // quarterly bonds only on their payout months
  });
}

/** The day a bond's interest falls due in a month, by its due-date rule (first, last or a fixed day); the end of the month when no rule is set. */
export function bondDueDate(b, month) {
  const dim = daysInMonthOf(month + '-01');
  const day = b.dueRule === 'first' ? 1 : b.dueRule === 'day' && Number(b.dueDay) > 0 ? Math.min(dim, Number(b.dueDay)) : dim;
  return `${month}-${String(day).padStart(2, '0')}`;
}
/** The next day a bond's interest reaches the bank, from `asOf` on (today counts); '' when nothing more is due before it ends. */
export function bondNextDue(b, asOf) {
  const end = b.closed && b.closed.date ? b.closed.date : b.maturityDate;
  for (let i = 0; i < 14; i++) {
    const m = addMonths(asOf.slice(0, 7) + '-01', i).slice(0, 7);
    if (end && m > end.slice(0, 7)) return '';
    if (!bondPaysIn(b, m) || !(bondDueAmount(b, m) > 0.5)) continue;
    const d = bondDueDate(b, m);
    if (d >= asOf) return d;
  }
  return '';
}
/** The home-screen notice setting for bond interest: on or off, and how many days ahead to tell you. Unset means on, on the day itself. */
export const bondNotify = (data) => { const n = (data.settings && data.settings.bondNotify) || {}; return { on: n.on !== false, days: Math.max(0, Math.min(30, Number(n.days) || 0)) }; };
/** Bonds whose interest falls due from `asOf` up to `days` ahead, going by their due-date rule. */
export function bondsDueSoon(all, asOf, days) {
  const out = [];
  for (let i = 0; i <= days; i++) { const date = iso(toMs(asOf) + i * DAY); for (const b of bondsDueOn(all, date)) out.push({ b, date, days: i }); }
  return out;
}

export function upcoming(data, all, days = 60) {
  const from = all.asOf, to = iso(toMs(from) + days * DAY);
  const out = [];
  const add = (date, title, amount, kind) => out.push({ date, title, amount, kind, days: Math.round((toMs(date) - toMs(from)) / DAY) });
  for (const b of all.bonds) if (b.maturityDate >= from && b.maturityDate <= to) add(b.maturityDate, b.name + ' matures', b.principal, 'Bond');
  for (const f of all.fds) if (f.maturityDate >= from && f.maturityDate <= to) add(f.maturityDate, f.name + ' matures', f.value || f.principal, 'Fixed deposit');
  for (const l of all.lending) if (l.principal > 0 && l.maturityDate >= from && l.maturityDate <= to) add(l.maturityDate, l.name + ' due back', l.principal + (l.accrued || 0), 'Lending');
  for (const s of all.savings) { if (s.type === 'EPF' || s.type === 'PPF') continue; const end = savingEnd(s); if (end && end >= from && end <= to) { const m = savingMaturity(s); add(end, s.name + ' matures', m.amount, s.type); } }
  const bn = bondNotify(data);
  if (bn.on && bn.days > 0) for (const d of bondsDueSoon(all, from, bn.days)) if (d.days >= 1) add(d.date, d.b.name + ' interest due', bondDueAmount(d.b, d.date.slice(0, 7), data.settings.tdsRate ?? 0.1), 'Bond interest');
  for (const r of data.receivables.filter((x) => x.active !== false && x.balanceDue > 0).map((x) => receivableStatus(x, from))) {
    if (r.received || r.notStarted) continue;
    if (r.due <= to) add(r.due, r.name + (r.overdue ? ' (overdue)' : r.dueToday ? ' (due today)' : ' to pay you'), r.dueAmount ?? r.expected, 'Money to receive');
  }
  for (const d of loanDues(data, from)) if (!d.paid && d.date <= to) add(d.date, d.name + (d.status === 'overdue' ? ' EMI (overdue)' : d.status === 'today' ? ' EMI (due today)' : ' EMI due'), d.emi, 'Loan EMI');
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

/**
 * Every saved reading of net worth with its assets and loans, oldest first.
 * Sources: the daily readings the app keeps whenever the owner opens it (`history`: net, assets, liab), the month-end figures typed on the Plan sheet (`targets.months`),
 * month-end check-ins (`projector.snapshots`, net only) and today's live position. A day with a daily reading wins over a month-end figure for the same day.
 */
export function netWorthPoints(data, all) {
  const pts = new Map();
  for (const s of (data.projector && data.projector.snapshots) || []) { const d = monthEnd(s.month + '-01'); if (d <= all.asOf && s.net != null) pts.set(d, { date: d, net: s.net, assets: null, liab: null, src: 'month end' }); }
  for (const m of (data.targets && data.targets.months) || []) if (m.actualAsset > 0 && m.date <= all.asOf) pts.set(m.date, { date: m.date, net: m.actualAsset - (m.actualLiability || 0), assets: m.actualAsset, liab: m.actualLiability || 0, src: 'month end' });
  for (const h of data.history || []) if (h.date <= all.asOf) pts.set(h.date, { date: h.date, net: h.net, assets: h.assets != null ? h.assets : null, liab: h.liab != null ? h.liab : null, src: 'daily' });
  pts.set(all.asOf, { date: all.asOf, net: all.netAsset, assets: all.totalAssets, liab: all.liabTotal, src: 'today' });
  return [...pts.values()].filter((p) => Number.isFinite(p.net)).sort((a, b) => (a.date < b.date ? -1 : 1));
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

/**
 * EMI due dates for loans that have an EMI and an optional `emiDay` (day of month).
 * An EMI counts as paid this month when a bank entry in the "Loan" category is close to the EMI amount in the month,
 * or the loan has `emiPaidOn` in this month (set with "EMI paid this month").
 * status: paid | overdue | today | soon (within 7 days) | later
 */
export function loanDues(data, asOf) {
  const ms = monthStart(asOf), me = iso(toMs(addMonths(ms, 1)) - DAY), dim = Number(me.slice(8, 10));
  const entries = (data.ledger || []).filter((e) => e.debit > 0 && e.date >= ms && e.date <= asOf && /^loan$/i.test(e.category || '')).map((e) => ({ amt: e.debit, used: false }));
  const loans = (data.liabilities || []).filter((l) => l.emi > 0 && l.emiDay > 0).sort((a, b) => b.emi - a.emi);
  const out = loans.map((l) => {
    const day = Math.min(dim, Math.max(1, Math.round(l.emiDay)));
    const due = ms.slice(0, 8) + String(day).padStart(2, '0');
    const hit = entries.find((x) => !x.used && x.amt >= l.emi * 0.95 && x.amt <= l.emi * 1.05);
    if (hit) hit.used = true;
    const paid = !!hit || (!!l.emiPaidOn && l.emiPaidOn >= ms && l.emiPaidOn <= me);
    const nextDue = paid ? addMonths(ms, 1).slice(0, 8) + String(Math.min(Number(l.emiDay) || 1, 28)).padStart(2, '0') : due;
    const date = paid ? nextDue : due;
    const days = Math.round((toMs(date) - toMs(asOf)) / DAY);
    const status = paid ? 'paid' : days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later';
    return { id: l.id, name: l.name, emi: l.emi, date, days, status, paid };
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** A difference smaller than this (₹) between what bonds should have paid and what the bank shows is ignored. */
export const BANK_TOLERANCE = 300;
/**
 * Current month only: bond interest whose due date has passed counts as received on Home, whatever the bank says. This checks it against the bank's "Income Bond" credits.
 * Returns null when the month is not the current one, when nothing is due yet, or when the gap is under BANK_TOLERANCE.
 * Otherwise { due, credited, gap, bonds } where gap is the amount not yet seen in the bank (not credited yet, or the bank entry is missing)
 * and bonds lists the bonds that are due but have no matching credit, with what each is short.
 */
export function bondBankGap(mc, month, asOf) {
  if (month !== monthKey(asOf)) return null;
  const line = (mc.income || []).find((x) => x.bonds);
  if (!line) return null;
  const due = sum(line.bonds, (b) => b.received);
  if (!(due > 0.5)) return null;
  const credited = line.bankCredit || 0, gap = due - credited;
  if (gap < BANK_TOLERANCE) return null;
  const short = line.bonds.filter((b) => b.received > 0.5 && (b.credited || 0) < b.expected - 1).map((b) => ({ name: b.name, holder: b.holder, due: b.due, expected: b.expected, short: b.expected - (b.credited || 0) }));
  return { due, credited, gap, bonds: short };
}
