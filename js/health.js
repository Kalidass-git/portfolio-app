// Portfolio health check for shares and ETFs you hold. Plain rules on your own numbers, no data is stored.
// Needs only what the app already knows (cost, value, dates). If the backend is connected it can also use the price trend and key figures.
// These are observations to think about, not investment advice.

export const RULES = {
  benchmark: 0.12,     // a yearly return to beat: roughly what the Indian market has given over the long run
  great: 0.18,         // yearly return counted as doing well
  weak: 0.04,          // yearly return counted as weak (below a safe deposit)
  addBelow: 0.05,      // a good holding smaller than this share of the portfolio is worth adding to
  trimAbove: 0.15,     // a holding bigger than this share of the portfolio is worth trimming
  richPe: 45,          // a P/E above this is expensive
  deepLoss: -0.15,     // a loss deeper than this, held over a year, is worth a hard look
  minDays: 365,        // returns are judged only after this long
};
const ok = (x) => x != null && isFinite(x);
export const sma = (v, n) => (v.length < n ? null : v.slice(-n).reduce((a, b) => a + b, 0) / n);

/** From daily rows [{d,c}] (oldest first): price, 50 / 200-day averages, 52-week high and low. */
export function trendFrom(rows) {
  if (!rows || rows.length < 20) return null;
  const c = rows.map((r) => r.c), yr = rows.slice(-252);
  const px = c[c.length - 1], hi52 = Math.max(...yr.map((r) => r.h || r.c)), lo52 = Math.min(...yr.map((r) => r.l || r.c));
  return { px, ma50: sma(c, 50), ma200: sma(c, 200), hi52, lo52, fromHi: px / hi52 - 1 };
}

/**
 * One holding in: { name, symbol, value, invested, ret, xirr, heldDays, share, trend?, info? }
 *   share = fraction of all shares and ETFs; trend = trendFrom(); info = { pe, roe, earnGrowth } from the backend (fractions, pe as a number)
 * Out: { verdict: 'well'|'track'|'watch'|'review', action: 'add'|'hold'|'trim'|'review', reasons: [text], score }
 */
export function assess(f, R = RULES) {
  const reasons = []; let score = 0;
  const old = f.heldDays >= R.minDays;
  if (old && ok(f.xirr)) {
    if (f.xirr >= R.great) { score += 2; reasons.push(`Earning ${pc(f.xirr)} a year, well above the ${pc(R.benchmark)} market benchmark`); }
    else if (f.xirr >= R.benchmark) { score += 1; reasons.push(`Earning ${pc(f.xirr)} a year, ahead of the ${pc(R.benchmark)} benchmark`); }
    else if (f.xirr >= R.weak) reasons.push(`Earning ${pc(f.xirr)} a year, below the ${pc(R.benchmark)} benchmark`);
    else if (f.xirr >= 0) { score -= 1; reasons.push(`Earning only ${pc(f.xirr)} a year, less than a fixed deposit`); }
    else { score -= 2; reasons.push(`Losing ${pc(-f.xirr)} a year over ${years(f.heldDays)}`); }
  } else if (ok(f.ret)) {
    if (f.ret <= -0.25) { score -= 1; reasons.push(`Down ${pc(-f.ret)} within its first year`); }
    else reasons.push(`Held only ${Math.max(1, Math.round(f.heldDays / 30))} months, too early to judge`);
  }
  const t = f.trend;
  if (t && t.ma200) {
    if (t.px > t.ma200 && t.px > (t.ma50 || 0)) { score += 1; reasons.push('Price is above its 50 and 200-day averages, the trend is up'); }
    else if (t.px < t.ma200 && t.px < (t.ma50 || Infinity)) { score -= 1; reasons.push('Price is below its 50 and 200-day averages, the trend is down'); }
    if (t.fromHi <= -0.3) { score -= 1; reasons.push(`${pc(-t.fromHi)} below its 52-week high`); }
  }
  const i = f.info;
  if (i) {
    const roe = ok(i.roe) ? (Math.abs(i.roe) > 1.5 ? i.roe / 100 : i.roe) : null, eg = ok(i.earnGrowth) ? (Math.abs(i.earnGrowth) > 5 ? i.earnGrowth / 100 : i.earnGrowth) : null;
    if (roe != null && roe >= 0.15) { score += 1; reasons.push(`Strong return on equity (${pc(roe)})`); }
    else if (roe != null && roe < 0.05) { score -= 1; reasons.push(`Weak return on equity (${pc(roe)})`); }
    if (eg != null && eg < -0.1) { score -= 1; reasons.push(`Profit is falling (${pc(eg)})`); }
    else if (eg != null && eg > 0.15) reasons.push(`Profit is growing (${pc(eg)})`);
    if (ok(i.pe) && i.pe > R.richPe) reasons.push(`P/E of ${i.pe.toFixed(0)} is on the expensive side`);
  }
  const rich = !!(f.info && ok(f.info.pe) && f.info.pe > R.richPe);
  const verdict = score >= 2 ? 'well' : score >= 1 ? 'track' : score === 0 ? (ok(f.ret) && f.ret < 0 && old ? 'watch' : 'track') : score === -1 ? 'watch' : 'review';
  let action = 'hold';
  if (f.share > R.trimAbove) { action = 'trim'; reasons.push(`It is ${pc(f.share)} of your shares and ETFs, more than ${pc(R.trimAbove)} in one name`); }
  else if (verdict === 'review' && old && ok(f.ret) && f.ret < 0) action = 'review';
  else if (verdict === 'well' && f.share < R.addBelow && !rich) { action = 'add'; reasons.push(`Only ${pc(f.share)} of your shares and ETFs, room to add`); }
  if (action === 'hold' && verdict === 'watch') reasons.push('Keep an eye on it');
  return { verdict, action, reasons, score };
}

/** Moves worth a look, from the current lots and the sales. { good: [{title, text}], bad: [...] } */
export function moves({ holdings, sold }) {
  const good = [], bad = [];
  for (const h of holdings) {
    if (h.lots && h.lots.length >= 2 && h.price > 0) {
      const l = h.lots.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => ({ date: x.date, px: x.cost / x.qty }));
      for (let k = 1; k < l.length; k++) if (l[k].px <= l[k - 1].px * 0.9 && h.price < l[k].px * 0.95) { bad.push({ title: h.name, text: `Bought more at ${rs(l[k].px)} after ${rs(l[k - 1].px)}, and it is now ${rs(h.price)}. Averaging down has not worked yet` }); break; }
        else if (l[k].px <= l[k - 1].px * 0.9 && h.price > l[k].px * 1.15) { good.push({ title: h.name, text: `Added at ${rs(l[k].px)} after a fall from ${rs(l[k - 1].px)}, now ${rs(h.price)}. Buying the dip paid off` }); break; }
    }
    if (h.heldDays >= 365 && ok(h.ret) && h.ret <= RULES.deepLoss) bad.push({ title: h.name, text: `Down ${pc(-h.ret)} after ${years(h.heldDays)}. Held through a long loss` });
    if (ok(h.xirr) && h.heldDays >= 365 && h.xirr >= 0.25) good.push({ title: h.name, text: `Earning ${pc(h.xirr)} a year over ${years(h.heldDays)}. One of your best picks` });
  }
  for (const s of sold) {
    if (s.nowValue == null || !(s.proceeds > 0)) continue;
    const d = s.nowValue / s.proceeds - 1;
    if (d >= 0.2) bad.push({ title: s.name, text: `Sold for ${rs(s.proceeds)}. Kept, it would be worth ${rs(s.nowValue)} (${pc(d)} more). Sold too early` });
    else if (d <= -0.15 && s.realized >= 0) good.push({ title: s.name, text: `Sold for ${rs(s.proceeds)} at a profit. Kept, it would be worth ${rs(s.nowValue)} today. Well timed` });
  }
  const rank = (a) => a.slice(0, 5);
  return { good: rank(good), bad: rank(bad) };
}

/** One or two sentences about the whole portfolio. */
export function overview(rows) {
  const out = [];
  if (!rows.length) return out;
  const down = rows.filter((r) => r.ret != null && r.ret <= -0.1).length;
  if (down) out.push(`${down} of your ${rows.length} holdings ${down === 1 ? 'is' : 'are'} down more than 10%.`);
  const sec = new Map(); let tot = 0;
  for (const r of rows) { sec.set(r.sector, (sec.get(r.sector) || 0) + r.value); tot += r.value; }
  const top = [...sec.entries()].filter(([k]) => k && !/diversified|gold|other/i.test(k)).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] / tot >= 0.3) out.push(`${pc(top[1] / tot)} of the money is in one sector, ${top[0]}. A bad year for it hurts the whole portfolio.`);
  const best = rows.filter((r) => r.xirr != null && r.heldDays >= 365).sort((a, b) => b.xirr - a.xirr)[0];
  if (best) out.push(`Best performer by yearly return: ${best.name} (${pc(best.xirr)}).`);
  return out;
}

const pc = (v) => (Math.abs(v * 100) >= 10 ? Math.round(v * 100) : Math.round(v * 1000) / 10) + '%';
const years = (d) => (d >= 730 ? `${Math.round(d / 36.5) / 10} years` : d >= 365 ? 'a year' : `${Math.round(d / 30)} months`);
const rs = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
