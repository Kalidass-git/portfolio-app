// Live gold: world gold price (COMEX, USD per ounce) and USD/INR, both from Yahoo through the Drive backend.
// India's price per gram = world price per gram x a steady premium (import duty, GST, local margin, 22K vs 24K).
// The premium is learned from the rate the owner types in, so the automatic rate stays on the same basis.
export const OZ = 31.1035;
export const parity = (usdOz, inr) => (usdOz > 0 && inr > 0 ? (usdOz / OZ) * inr : 0);

/** live = { usdOz, prevUsdOz, inr, prevInr, at }  ->  per-gram world prices now and at the previous close. */
export function liveParity(live) {
  if (!live) return null;
  const now = parity(live.usdOz, live.inr);
  const prev = parity(live.prevUsdOz || live.usdOz, live.prevInr || live.inr);
  return now > 0 ? { now, prev: prev > 0 ? prev : now } : null;
}

/** Premium that turns world price into the owner's rate. */
export const premiumFrom = (rate, live) => { const p = liveParity(live); return p && rate > 0 ? rate / p.now : null; };

/** Rate to use and today's change, from the live reading and the learned premium. */
export function applyLive(live, premium) {
  const p = liveParity(live);
  if (!p || !(premium > 0)) return null;
  const rate = p.now * premium;
  const pct = p.prev > 0 ? p.now / p.prev - 1 : 0;
  return { rate: Math.round(rate), pct, perGram: rate - rate / (1 + pct) };
}
