// Live prices.
//  - Mutual funds: NAV from mfapi.in (free, no key, allows browser requests).
//  - Stocks and ETFs: asked from the backend (Apps Script), which reads Yahoo Finance on the server side.
import { premiumFrom, applyLive } from './goldlive.js';
import { todayISO } from './calc.js';
import { S, mutate, saveQuotes } from './store.js';
import { call } from './remote.js';

const MFAPI = 'https://api.mfapi.in/mf';

export async function searchScheme(q) {
  const r = await fetch(`${MFAPI}/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error('Fund search failed');
  return r.json(); // [{schemeCode, schemeName}]
}
const isoDate = (s) => { const [d, m, y] = s.split('-'); return `${y}-${m}-${d}`; };
/** Latest NAV and the one before it (that gives the day's change). The full history call is used because it lists both. */
async function latestNav(code) {
  let rows;
  try {
    const r = await fetch(`${MFAPI}/${code}`);
    if (!r.ok) throw new Error('history');
    rows = (await r.json()).data;
  } catch {
    const r = await fetch(`${MFAPI}/${code}/latest`);
    if (!r.ok) throw new Error('NAV fetch failed for ' + code);
    rows = (await r.json()).data;
  }
  const row = rows && rows[0];
  if (!row) throw new Error('No NAV for ' + code);
  const prev = rows[1];
  return { price: parseFloat(row.nav), date: isoDate(row.date), prev: prev ? parseFloat(prev.nav) : null, prevDate: prev ? isoDate(prev.date) : null };
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

/** Store the live gold reading and move the rate with it, every time. (The rate can no longer be typed in; the "automatic rate off" switch is gone.) */
function applyGold(d, live, out) {
  d.settings.goldLive = live;
  const prem = d.settings.goldPremium || premiumFrom(d.settings.goldRate, live);
  if (!prem) return;
  d.settings.goldPremium = prem;
  const a = applyLive(live, prem);
  if (!a) return;
  const today = todayISO(); // the local date, so the card does not say "yesterday" just after midnight in India
  const hist = (d.gold.rateHistory && d.gold.rateHistory.length ? d.gold.rateHistory : d.settings.goldRate ? [{ date: d.settings.goldRateDate || today, rate: d.settings.goldRate }] : []).map((x) => ({ ...x }));
  const hit = hist.find((x) => x.date === today);
  if (hit) hit.rate = a.rate; else hist.push({ date: today, rate: a.rate, auto: true });
  hist.sort((x, y) => (x.date < y.date ? -1 : 1));
  d.gold.rateHistory = hist.slice(-400);
  d.settings.goldRate = a.rate; d.settings.goldRateDate = today;
  out.gold = a.rate;
}

/** Gold only: read the world gold price and USD/INR and move the rate. Owner only, because the rate is saved for everyone. Returns the new rate per gram. */
export async function refreshGold() {
  if (S.role !== 'owner') throw new Error('Only the owner can refresh the gold rate.');
  if (!S.remote) throw new Error('The gold rate needs the Google Drive backend (Settings).');
  const res = await call(S.cfg.backendUrl, S.cfg.key, 'quotes', { symbols: [{ symbol: '__GOLD_USD', yahoo: 'GC=F' }, { symbol: '__USD_INR', yahoo: 'INR=X' }] });
  const g = res.quotes && res.quotes.__GOLD_USD, fx = res.quotes && res.quotes.__USD_INR;
  if (!g || !fx) throw new Error('The live gold price is not available right now.');
  const out = { errors: [] };
  mutate((d) => applyGold(d, { usdOz: g.price, prevUsdOz: g.prevClose || g.price, inr: fx.price, prevInr: fx.prevClose || fx.price, at: new Date().toISOString() }, out));
  if (!out.gold) throw new Error('Could not work out the rate yet: there is no earlier gold rate to match the live price to.');
  return out.gold;
}

export async function refreshAll(onProgress = () => {}) {
  const out = { stocks: 0, funds: 0, errors: [] };
  const quotes = {};
  let goldLive = null;
  const now = new Date().toISOString();
  // Stocks (needs the backend)
  if (S.remote) {
    try {
      onProgress('Fetching share prices…');
      const symbols = S.data.stocks.map((s) => ({ symbol: s.symbol, yahoo: s.yahoo || '' }));
      symbols.push({ symbol: '__GOLD_USD', yahoo: 'GC=F' }, { symbol: '__USD_INR', yahoo: 'INR=X' });
      // fully sold shares too, so the Sold tab can show what they are worth today
      const eq = S.all && S.all.stocks.eq;
      if (eq) for (const x of eq.sold) { const o = (S.data.soldSettings || {})[x.symbol] || {}; if (o.suppress) continue; const sy = (o.nowSymbol || x.nowSymbol).toUpperCase(); if (!/\$/.test(sy) && !symbols.some((q) => q.symbol.toUpperCase() === sy)) symbols.push({ symbol: sy, yahoo: o.yahoo || '' }); }
      const res = await call(S.cfg.backendUrl, S.cfg.key, 'quotes', { symbols });
      const g = res.quotes && res.quotes.__GOLD_USD, fx = res.quotes && res.quotes.__USD_INR;
      if (g && fx) goldLive = { usdOz: g.price, prevUsdOz: g.prevClose || g.price, inr: fx.price, prevInr: fx.prevClose || fx.price, at: now };
      for (const [sym, q] of Object.entries(res.quotes || {})) {
        if (sym.startsWith('__')) continue;
        if (q && q.price > 0) { quotes[sym] = { ...q, ts: now }; out.stocks++; }
      }
      for (const [sym, msg] of Object.entries(res.errors || {})) if (!sym.startsWith('__')) out.errors.push(`${sym}: ${msg}`);
      if (!goldLive) out.errors.push('Gold: live price not available right now');
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
  if (S.role === 'owner' && (out.stocks || out.funds || goldLive)) {
    mutate((d) => {
      if (goldLive) applyGold(d, goldLive, out);
      for (const s of d.stocks) { const q = quotes[s.symbol]; if (q) { s.price = q.price; if (q.prevClose > 0) s.prevClose = q.prevClose; else delete s.prevClose; if (q.high52) s.high52 = q.high52; if (q.low52) s.low52 = q.low52; } }
      for (const m of d.mutualFunds) { const q = quotes['MF:' + m.schemeCode]; if (q) { m.nav = q.price; m.navDate = q.date; if (q.prev > 0) { m.prevNav = q.prev; m.prevNavDate = q.prevDate; } else delete m.prevNav; } }
      d.priceBook = d.priceBook || {};
      for (const [sym, q] of Object.entries(quotes)) if (!sym.startsWith('MF:') && q.price > 0) d.priceBook[sym.toUpperCase()] = { price: q.price, at: now };
      d.settings.pricesUpdatedAt = now;
    });
  }
  return out;
}
