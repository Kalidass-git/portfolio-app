// Money put into shares, ETFs and funds, by month (from dated buy trades and fund purchases).
import { BUY_TYPES, SELL_TYPES, guessClass, symKey } from './trades.js';

const monthOf = (d) => (d || '').slice(0, 7);

/** Which group a bought symbol belongs to. */
function groupOf(data, t) {
  const st = (data.stocks || []).find((s) => symKey(s.symbol) === symKey(t.symbol));
  const cls = (st && st.assetClass) || guessClass(t.name || (st && st.name), t.symbol);
  return cls && cls !== 'equity' ? 'etfs' : 'shares';
}

/** { 'YYYY-MM': { shares, etfs, funds, total, items:[{date,name,group,amount}] } } */
export function monthlyBuys(data) {
  const out = {};
  const bucket = (m) => (out[m] = out[m] || { shares: 0, etfs: 0, funds: 0, total: 0, items: [] });
  for (const t of data.trades || []) {
    if (t.type !== 'BUY' || t.src === 'opening' || !t.date) continue;
    const g = groupOf(data, t), b = bucket(monthOf(t.date));
    b[g] += t.amount; b.total += t.amount; b.items.push({ date: t.date, name: t.name || t.symbol, group: g, amount: t.amount });
  }
  for (const t of data.mfTxns || []) {
    if (!BUY_TYPES.test(t.type) || !t.date) continue;
    const b = bucket(monthOf(t.date));
    b.funds += t.amount; b.total += t.amount; b.items.push({ date: t.date, name: t.scheme, group: 'funds', amount: t.amount });
  }
  return out;
}

/** Money taken out of shares, ETFs and funds by selling, by month: { 'YYYY-MM': { shares, etfs, funds, total } }. */
export function monthlySells(data) {
  const out = {};
  const bucket = (m) => (out[m] = out[m] || { shares: 0, etfs: 0, funds: 0, total: 0 });
  for (const t of data.trades || []) {
    if (t.type !== 'SELL' || !t.date) continue;
    const g = groupOf(data, t), b = bucket(monthOf(t.date));
    b[g] += t.amount; b.total += t.amount;
  }
  for (const t of data.mfTxns || []) {
    if (!SELL_TYPES.test(t.type) || !t.date) continue;
    const b = bucket(monthOf(t.date));
    b.funds += Math.abs(t.amount); b.total += Math.abs(t.amount);
  }
  return out;
}

/** The last n month keys ending at `cur`, oldest first. */
export function lastMonths(cur, n) {
  const [y, m] = cur.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)); return d.toISOString().slice(0, 7); });
}

/** Combine rows of one month by name. */
export function byName(items) {
  const m = new Map();
  for (const x of items) { const k = x.group + '|' + x.name; const r = m.get(k) || { name: x.name, group: x.group, amount: 0, count: 0, last: '' }; r.amount += x.amount; r.count++; if (x.date > r.last) r.last = x.date; m.set(k, r); }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

const GENERIC = new Set(['fund', 'direct', 'growth', 'plan', 'regular', 'option', 'idcw', 'the', 'and', 'of', 'scheme']);
const words = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !GENERIC.has(w));

/** Does a buy (name, group) belong to a plan line? `p.match` (comma separated words) wins; "individual stocks" means all shares. */
export function planMatches(p, item) {
  if (p.match && p.match.trim()) return p.match.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).some((m) => item.name.toLowerCase().includes(m));
  if (/individual|stocks?\b|shares?\b|equity/i.test(p.name) && !/fund|etf|bees/i.test(p.name)) return item.group === 'shares';
  const pw = words(p.name), iw = new Set(words(item.name));
  if (!pw.length) return false;
  return pw.every((w) => iw.has(w) || [...iw].some((x) => x.startsWith(w) || w.startsWith(x)));
}

/** What was bought in `month` for each plan line (each buy counts once, for the first line that matches). */
export function planDone(plans, buys, month) {
  const items = (buys[month] || { items: [] }).items;
  const used = new Set(), out = new Map();
  // lines with an explicit match or a specific name go first, "individual stocks" last
  const order = plans.slice().sort((a, b) => (/individual|stocks?\b/i.test(a.name) ? 1 : 0) - (/individual|stocks?\b/i.test(b.name) ? 1 : 0));
  for (const p of order) {
    let sum = 0;
    items.forEach((it, i) => { if (!used.has(i) && planMatches(p, it)) { used.add(i); sum += it.amount; } });
    out.set(p.id, Math.round(sum));
  }
  return { byPlan: out, other: Math.round(items.reduce((a, it, i) => a + (used.has(i) ? 0 : it.amount), 0)) };
}
