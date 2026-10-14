// Money put into shares, ETFs and funds, by month (from dated buy trades and fund purchases).
import { BUY_TYPES, guessClass, symKey } from './trades.js';

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
