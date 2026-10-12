// Live prices.
//  - Mutual funds: NAV from mfapi.in (free, no key, allows browser requests).
//  - Stocks and ETFs: asked from the backend (Apps Script), which reads Yahoo Finance on the server side.
import { S, mutate, saveQuotes } from './store.js';
import { call } from './remote.js';

const MFAPI = 'https://api.mfapi.in/mf';

export async function searchScheme(q) {
  const r = await fetch(`${MFAPI}/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error('Fund search failed');
  return r.json(); // [{schemeCode, schemeName}]
}
async function latestNav(code) {
  const r = await fetch(`${MFAPI}/${code}/latest`);
  if (!r.ok) throw new Error('NAV fetch failed for ' + code);
  const j = await r.json();
  const row = j.data && j.data[0];
  if (!row) throw new Error('No NAV for ' + code);
  const [d, m, y] = row.date.split('-');
  return { price: parseFloat(row.nav), date: `${y}-${m}-${d}` };
}

/** Pick the most likely scheme for a fund name (direct plan, growth). Returns null when nothing matches. */
export async function guessScheme(name) {
  const clean = name.replace(/direct|growth|plan|fund/gi, ' ').replace(/\s+/g, ' ').trim();
  const list = await searchScheme(clean);
  const score = (s) => {
    const n = s.schemeName.toLowerCase();
    let sc = 0;
    if (n.includes('direct')) sc += 3;
    if (n.includes('growth')) sc += 3;
    if (/idcw|dividend|payout|bonus/.test(n)) sc -= 5;
    for (const w of clean.toLowerCase().split(' ')) if (w.length > 2 && n.includes(w)) sc += 1;
    return sc;
  };
  return list.map((s) => ({ ...s, score: score(s) })).sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function refreshAll(onProgress = () => {}) {
  const out = { stocks: 0, funds: 0, errors: [] };
  const quotes = {};
  const now = new Date().toISOString();
  // Stocks (needs the backend)
  if (S.remote) {
    try {
      onProgress('Fetching share prices…');
      const symbols = S.data.stocks.map((s) => ({ symbol: s.symbol, yahoo: s.yahoo || '' }));
      const res = await call(S.cfg.backendUrl, S.cfg.key, 'quotes', { symbols });
      for (const [sym, q] of Object.entries(res.quotes || {})) {
        if (q && q.price > 0) { quotes[sym] = { ...q, ts: now }; out.stocks++; }
      }
      for (const [sym, msg] of Object.entries(res.errors || {})) out.errors.push(`${sym}: ${msg}`);
    } catch (e) { out.errors.push('Shares: ' + e.message); }
  } else {
    out.errors.push('Share prices need the Google Drive backend (Settings).');
  }
  // Mutual funds (direct from mfapi.in)
  const linked = S.data.mutualFunds.filter((m) => m.schemeCode);
  for (let i = 0; i < linked.length; i++) {
    const m = linked[i];
    try {
      onProgress(`Fetching NAV ${i + 1}/${linked.length}…`);
      const n = await latestNav(m.schemeCode);
      quotes['MF:' + m.schemeCode] = { ...n, ts: now };
      out.funds++;
    } catch (e) { out.errors.push(`${m.name}: ${e.message}`); }
  }
  if (!S.data.mutualFunds.every((m) => m.schemeCode)) out.errors.push('Some funds are not linked to a scheme code yet (Equity → Funds → Link).');
  saveQuotes(quotes);
  // The owner's refresh becomes the shared snapshot, so family devices see the same prices without fetching anything.
  if (S.role === 'owner' && (out.stocks || out.funds)) {
    mutate((d) => {
      for (const s of d.stocks) { const q = quotes[s.symbol]; if (q) { s.price = q.price; if (q.high52) s.high52 = q.high52; if (q.low52) s.low52 = q.low52; } }
      for (const m of d.mutualFunds) { const q = quotes['MF:' + m.schemeCode]; if (q) { m.nav = q.price; m.navDate = q.date; } }
      d.settings.pricesUpdatedAt = now;
    });
  }
  return out;
}
