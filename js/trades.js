// Trade-based equity engine. Pure functions, no DOM.
//
// data.trades:           [{ id, symbol, name, isin, type: 'BUY'|'SELL', qty, amount, date, time, orderId, src }]   amount = total value of the order
// data.corporateActions: [{ id, type, symbol, date, ... }]
//     split      { ratio }                       each old share becomes `ratio` shares (1:10 split => 10)
//     bonus      { num, den }                    `num` free shares for every `den` held (1:1 bonus => 1, 1)
//     merger     { to, ratio }                   shares are swapped for `ratio` shares of `to` per old share, cost carries over
//     demerger   { to, toName, ratio, costFraction }   `ratio` shares of `to` per share held; costFraction of the cost moves to them
//     dividend   { amount }                      total rupees received
// data.mfTxns:           [{ id, scheme, type, units, nav, amount, date, src }]
//
// Cost is tracked in lots (first in, first out). Splits and bonus shares change the quantity, not the money paid.
import { xirr, toMs, DAY } from './calc.js';

const up = (s) => (s || '').trim().toUpperCase();
export const symKey = (s) => up(s);
const round2 = (n) => Math.round(n * 100) / 100;

/** Events in the order they happened. On the same day corporate actions come first, so a purchase on the ex-date is after the split. */
function timeline(data) {
  const ev = [];
  for (const t of data.trades || []) ev.push({ kind: 'trade', date: t.date, time: t.time || '', o: 1, t });
  for (const a of data.corporateActions || []) ev.push({ kind: 'action', date: a.date, time: '', o: 0, a });
  ev.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.o - y.o || (x.time < y.time ? -1 : x.time > y.time ? 1 : 0)));
  return ev;
}

/**
 * Replays every trade and corporate action.
 * Returns { holdings, sold, flows, dividends, warnings }.
 *   holdings: [{ symbol, name, qty, cost, avg, firstDate, lots }]
 *   sold:     [{ symbol, name, date, qty, proceeds, cost, realized, buyDate, nowQty, nowSymbol }]   nowQty is what the sold shares would be today after later splits/bonus
 *   flows:    Map symbol -> [{ date, amount }]  money in/out of your pocket (buys negative, sells and dividends positive)
 */
export function buildEquity(data) {
  const book = new Map();   // symbol -> { name, lots:[{qty,cost,date}] }
  const flows = new Map(), warnings = [], sold = [], dividends = [];
  const names = new Map();
  const flow = (sym, date, amount) => { if (!flows.has(sym)) flows.set(sym, []); flows.get(sym).push({ date, amount }); };
  const get = (sym) => { if (!book.has(sym)) book.set(sym, { name: names.get(sym) || sym, lots: [] }); return book.get(sym); };
  for (const ev of timeline(data)) {
    if (ev.kind === 'trade') {
      const t = ev.t, sym = symKey(t.symbol);
      if (t.name) names.set(sym, t.name);
      const pos = get(sym); if (t.name) pos.name = t.name;
      if (t.type === 'BUY') { pos.lots.push({ qty: t.qty, cost: t.amount, date: t.date }); flow(sym, t.date, -t.amount); } else {
        let need = t.qty, cost = 0, first = null;
        while (need > 1e-9 && pos.lots.length) {
          const lot = pos.lots[0], take = Math.min(lot.qty, need), part = lot.cost * (take / lot.qty);
          cost += part; need -= take; first = first || lot.date;
          lot.qty -= take; lot.cost -= part;
          if (lot.qty <= 1e-9) pos.lots.shift();
        }
        if (need > 1e-9) warnings.push(`${sym}: sold ${t.qty} on ${t.date} but only ${t.qty - need} were held before that. A split, bonus or merger may be missing.`);
        const sellQty = t.qty - Math.max(0, need);
        const proceeds = need > 1e-9 ? t.amount * (sellQty / t.qty) : t.amount;
        sold.push({ symbol: sym, name: pos.name, date: t.date, qty: sellQty, proceeds, cost, realized: proceeds - cost, buyDate: first || t.date, nowQty: sellQty, nowSymbol: sym, id: t.id });
        flow(sym, t.date, t.amount);
      }
      continue;
    }
    const a = ev.a, sym = symKey(a.symbol), pos = get(sym);
    if (a.type === 'split') {
      for (const l of pos.lots) l.qty *= a.ratio;
      for (const s of sold) if (s.nowSymbol === sym && s.date < a.date) s.nowQty *= a.ratio;
    } else if (a.type === 'bonus') {
      const f = a.num / a.den;
      const extra = pos.lots.map((l) => ({ qty: l.qty * f, cost: 0, date: a.date }));
      pos.lots.push(...extra);
      for (const s of sold) if (s.nowSymbol === sym && s.date < a.date) s.nowQty *= 1 + f;
    } else if (a.type === 'merger') {
      const to = symKey(a.to), target = get(to);
      for (const l of pos.lots) target.lots.push({ qty: l.qty * a.ratio, cost: l.cost, date: l.date });
      pos.lots = [];
      if (flows.has(sym)) { for (const x of flows.get(sym)) flow(to, x.date, x.amount); flows.delete(sym); }
      for (const s of sold) if (s.nowSymbol === sym) { s.nowSymbol = to; if (s.date < a.date) s.nowQty *= a.ratio; }
      if (!names.get(to)) target.name = pos.name;
    } else if (a.type === 'demerger') {
      const to = symKey(a.to), child = get(to);
      if (a.toName && !names.get(to)) child.name = a.toName;
      // fractions of a share are paid out in cash, so the total number of new shares is rounded down
      const total = pos.lots.reduce((x, l) => x + l.qty * a.ratio, 0);
      const scale = total > 0 ? Math.floor(total + 1e-9) / total : 0;
      for (const l of pos.lots) {
        const moved = l.cost * a.costFraction;
        if (l.qty * a.ratio * scale > 1e-9) child.lots.push({ qty: l.qty * a.ratio * scale, cost: moved, date: l.date });
        l.cost -= moved;
      }
    } else if (a.type === 'dividend') {
      dividends.push({ symbol: sym, date: a.date, amount: a.amount, name: pos.name, id: a.id });
      flow(sym, a.date, a.amount);
    }
  }
  const holdings = [];
  for (const [symbol, p] of book) {
    const lots = p.lots.filter((l) => l.qty > 1e-9);
    const qty = lots.reduce((a, l) => a + l.qty, 0);
    if (qty <= 1e-9) continue;
    const cost = lots.reduce((a, l) => a + l.cost, 0);
    holdings.push({ symbol, name: p.name, qty: Math.round(qty * 1e6) / 1e6, cost, avg: cost / qty, firstDate: lots.map((l) => l.date).sort()[0], lots });
  }
  holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { holdings, sold, flows, dividends, warnings };
}

const titleCase = (s) => (s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
export function guessClass(name, symbol) {
  const n = ((name || '') + ' ' + (symbol || '')).toUpperCase();
  if (/GOLD/.test(n) && /(ETF|BEES|GOLD)/.test(n) && !/GOLD ?(LOAN|FINANCE)/.test(n)) return /ETF|BEES|SETFGOLD|GOLDBEES|GOLDIETF/.test(n) ? 'goldetf' : 'equity';
  if (/ETF|BEES\b|NIFTYBEES|JUNIORBEES|ITBEES|PHARMABEES|BANKBEES|MON100|MAFANG/.test(n)) return 'etf';
  return 'equity';
}

/**
 * Rewrites data.stocks from the trades. Keeps the id, last price and kind of holdings that already exist.
 * Does nothing when there are no trades (older files managed by hand).
 */
export function materialize(d) {
  if (!d.trades || !d.trades.length) return null;
  const eq = buildEquity(d);
  const old = new Map((d.stocks || []).map((s) => [symKey(s.symbol), s]));
  const used = new Set();
  const out = eq.holdings.map((h) => {
    const o = old.get(h.symbol);
    const id = o ? o.id : null;
    if (o) used.add(o);
    const base = o || { name: titleCase(h.name).replace(/ Ltd\.?$| Limited$/i, ''), symbol: h.symbol, price: h.avg, assetClass: guessClass(h.name, h.symbol) };
    return { ...base, id, symbol: o ? o.symbol : h.symbol, qty: h.qty, avgPrice: h.avg, buyDate: h.firstDate };
  });
  let max = Math.max(0, ...(d.stocks || []).map((x) => Number(String(x.id || '').replace(/\D/g, '')) || 0));
  for (const s of out) if (!s.id) s.id = 's' + ++max;
  d.stocks = out;
  return eq;
}

/** Cash flows plus today's value, as XIRR needs them. */
export function flowsFor(eq, symbols, valueNow, asOf) {
  const f = [];
  for (const s of symbols) for (const x of eq.flows.get(s) || []) f.push({ t: toMs(x.date), amount: x.amount });
  if (valueNow > 0) f.push({ t: toMs(asOf), amount: valueNow });
  return f;
}
export const xirrFor = (eq, symbols, valueNow, asOf) => xirr(flowsFor(eq, symbols, valueNow, asOf));

// ---------- mutual funds ----------
export const BUY_TYPES = /^(PURCHASE|SIP|SWITCH[ _-]?IN|DIVIDEND[ _-]?REINVEST\w*|BUY|NFO|STP[ _-]?IN)$/i;
export const SELL_TYPES = /^(REDEEM\w*|REDEMPTION|SELL|SWITCH[ _-]?OUT|STP[ _-]?OUT|WITHDRAW\w*)$/i;
export const fundKey = (name) => (name || '').toLowerCase().replace(/\b(plan|option|fund)\b/g, ' ').replace(/[^a-z0-9]+/g, '');

export function buildFunds(data) {
  const by = new Map(), flows = new Map();
  const txns = (data.mfTxns || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id || 0) < (b.id || 0) ? -1 : 1));
  const warnings = [];
  for (const t of txns) {
    const k = fundKey(t.scheme);
    const p = by.get(k) || { scheme: t.scheme, units: 0, cost: 0, realized: 0, proceeds: 0 };
    const buy = BUY_TYPES.test(t.type);
    if (!flows.has(k)) flows.set(k, []);
    if (buy) { p.units += t.units; p.cost += t.amount; flows.get(k).push({ date: t.date, amount: -t.amount }); }
    else {
      const frac = p.units > 1e-9 ? Math.min(1, t.units / p.units) : 0;
      if (t.units - p.units > 1e-3) warnings.push(`${t.scheme}: redeemed ${t.units} units on ${t.date} but only ${p.units.toFixed(3)} were held.`);
      const c = p.cost * frac; p.cost -= c; p.units -= Math.min(p.units, t.units); p.realized += t.amount - c; p.proceeds += t.amount;
      flows.get(k).push({ date: t.date, amount: t.amount });
    }
    by.set(k, p);
  }
  const holdings = [...by.entries()].map(([key, p]) => ({ key, ...p, units: p.units < 1e-6 ? 0 : p.units })).filter((p) => p.units > 0 || p.proceeds > 0);
  return { holdings, flows, warnings };
}
export function materializeFunds(d) {
  if (!d.mfTxns || !d.mfTxns.length) return null;
  const mf = buildFunds(d);
  const byKey = new Map(mf.holdings.map((h) => [h.key, h]));
  const out = [];
  let max = Math.max(0, ...(d.mutualFunds || []).map((m) => Number(String(m.id || '').replace(/\D/g, '')) || 0));
  const seen = new Set();
  for (const o of d.mutualFunds || []) {
    const k = fundKey(o.name), h = byKey.get(k);
    if (!h) { out.push(o); continue; }              // no transactions for this fund: keep it as entered by hand
    seen.add(k);
    const op = o.opening || { units: 0, invested: 0 };
    const units = h.units + op.units;
    if (units <= 1e-6) continue;
    out.push({ ...o, invested: Math.round((h.cost + op.invested) * 100) / 100, units: Math.round(units * 1e4) / 1e4 });
  }
  for (const h of mf.holdings) {
    if (seen.has(h.key) || h.units <= 1e-6) continue;
    out.push({ id: 'm' + ++max, name: h.scheme, folio: '', invested: Math.round(h.cost * 100) / 100, units: Math.round(h.units * 1e4) / 1e4, nav: h.units ? h.cost / h.units : 0, schemeCode: '' });
  }
  d.mutualFunds = out;
  return mf;
}
