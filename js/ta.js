// Moving averages and a historical P/E line, worked out from daily closes and reported earnings. Pure functions (no screen code).

/** Simple moving average of closes[i] over the last n values. Entries before n values exist are null. */
export function sma(closes, n) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/**
 * Earnings per share as it was known on each date. quarterly / annual: [{ date: 'YYYY-MM-DD' (period end), eps }] from the company's reports.
 * A result is only used from some weeks after its period ends (results come out late), so the line never uses numbers nobody had yet.
 * Trailing twelve months = the latest four quarters added up. Years before the quarterly data starts use the yearly EPS.
 * Returns [{ from: 'YYYY-MM-DD', eps }] oldest first (use the last one whose `from` is on or before the day).
 */
export function epsTimeline({ quarterly = [], annual = [] } = {}, { quarterLag = 45, yearLag = 75 } = {}) {
  const pts = [];
  for (const a of annual) if (a && a.date && Number.isFinite(a.eps)) pts.push({ from: addDays(a.date, yearLag), eps: a.eps, src: 'year' });
  const q = quarterly.filter((x) => x && x.date && Number.isFinite(x.eps)).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 3; i < q.length; i++) {
    // four consecutive quarters: period ends roughly three months apart
    const span = (Date.parse(q[i].date) - Date.parse(q[i - 3].date)) / 864e5;
    if (span < 200 || span > 320) continue;
    pts.push({ from: addDays(q[i].date, quarterLag), eps: q[i].eps + q[i - 1].eps + q[i - 2].eps + q[i - 3].eps, src: 'ttm' });
  }
  pts.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return pts;
}

/** P/E for each row (price / EPS known on that day). Null where there was no EPS yet or the company made a loss (P/E means nothing then). */
export function peSeries(rows, timeline, { cap = 400 } = {}) {
  const out = new Array(rows.length).fill(null);
  if (!timeline || !timeline.length) return out;
  let k = -1;
  for (let i = 0; i < rows.length; i++) {
    while (k + 1 < timeline.length && timeline[k + 1].from <= rows[i].d) k++;
    if (k < 0) continue;
    const e = timeline[k].eps;
    if (e > 0) { const pe = rows[i].c / e; if (pe > 0 && pe <= cap) out[i] = pe; }
  }
  return out;
}

/** Change over fixed look-backs, from the last row: [{ label, pct }] (only those the history is long enough for). */
export function performance(rows, spans = [['1W', 7], ['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 365], ['3Y', 1095]]) {
  if (!rows.length) return [];
  const last = rows[rows.length - 1], t1 = Date.parse(last.d), out = [];
  for (const [label, days] of spans) {
    const target = t1 - days * 864e5;
    if (Date.parse(rows[0].d) > target + 4 * 864e5) continue; // history does not reach back that far
    let base = rows[0];
    for (let i = rows.length - 1; i >= 0; i--) if (Date.parse(rows[i].d) <= target) { base = rows[i]; break; }
    if (base.c > 0) out.push({ label, pct: last.c / base.c - 1 });
  }
  return out;
}

/**
 * Rolling returns: for each row, the yearly rate (CAGR) earned over the `years` ending on that row, from the row `years` earlier (or the nearest one before it).
 * rows: [{ d, c }] oldest first. Returns an array the same length (null until the history is long enough). 0.12 = 12% a year.
 */
export function rollingReturns(rows, years) {
  const out = new Array(rows.length).fill(null), days = years * 365.25;
  let j = 0;
  for (let i = 0; i < rows.length; i++) {
    const target = Date.parse(rows[i].d) - days * 864e5;
    if (Date.parse(rows[0].d) > target + 4 * 864e5) continue;   // the history does not reach back that far yet
    while (j + 1 < i && Date.parse(rows[j + 1].d) <= target) j++;
    const b = rows[j];
    if (b.c > 0 && rows[i].c > 0) out[i] = Math.pow(rows[i].c / b.c, 1 / years) - 1;
  }
  return out;
}
/** Median, average, best, worst, latest and the share of periods above zero of a list of rolling returns (nulls ignored). null when there are none. */
export function rollStats(vals) {
  const v = vals.filter((x) => x != null);
  if (!v.length) return null;
  const b = v.slice().sort((x, y) => x - y), m = b.length >> 1;
  return { n: v.length, median: b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2, avg: v.reduce((a, x) => a + x, 0) / v.length, best: b[b.length - 1], worst: b[0], latest: v[v.length - 1], positive: v.filter((x) => x > 0).length / v.length };
}

/** The price of a trendline on a date. The line carries on past its two end points in both directions: { d1, p1, d2, p2 } with ISO dates. */
export function lineValueAt(L, date) {
  const t1 = Date.parse(L.d1), t2 = Date.parse(L.d2), t = Date.parse(date);
  if (!(t2 !== t1)) return L.p1;
  return L.p1 + ((L.p2 - L.p1) * (t - t1)) / (t2 - t1);
}
/**
 * Candles that are finished, for a candle size. rows: daily [{ d, o, h, l, c }] oldest first; tf: 'D' | 'W' | 'M'; today: ISO date; afterClose: has today's market closed.
 * A day is finished once it is over (or the market has closed on it), a week once its Friday is over (or on Friday after the close, or past Sunday), a month once the next one starts.
 */
export function closedCandles(rows, tf, today, afterClose = false) {
  const wk = (d) => { const t = new Date(d + 'T00:00:00Z'), day = (t.getUTCDay() + 6) % 7; return new Date(t.getTime() - day * 864e5).toISOString().slice(0, 10); };
  let c = rows;
  if (tf !== 'D') {
    const out = []; let cur = null, ck = '';
    for (const r of rows) {
      const k = tf === 'M' ? r.d.slice(0, 7) : wk(r.d);
      if (!cur || k !== ck) { cur = { d: r.d, o: r.o, h: r.h, l: r.l, c: r.c, key: k }; out.push(cur); ck = k; } else { cur.h = Math.max(cur.h, r.h); cur.l = Math.min(cur.l, r.l); cur.c = r.c; cur.d = r.d; }
    }
    c = out;
  }
  const over = (r) => {
    if (tf === 'D') return r.d < today || (r.d === today && afterClose);
    if (tf === 'M') return r.key < today.slice(0, 7);
    const end = new Date(Date.parse(r.key + 'T00:00:00Z') + 6 * 864e5).toISOString().slice(0, 10), fri = new Date(r.d + 'T00:00:00Z').getUTCDay() === 5;
    return end < today || (fri && (r.d < today || (r.d === today && afterClose)));
  };
  return c.filter(over);
}
/** The candle still being formed (today's day, this week, this month) as { d, close, line }, or null when the latest candle is already finished. */
export function openCandle(rows, tf, today, afterClose = false, L = null) {
  const all = closedCandles(rows, tf, '9999-12-31', true), done = closedCandles(rows, tf, today, afterClose);
  if (!all.length || all.length === done.length) return null;
  const r = all[all.length - 1];
  return { d: r.d, close: r.c, line: L ? lineValueAt(L, r.d) : null };
}
/**
 * Did a candle close above (dir 'above') or below ('below') the trendline, having been on the other side the candle before?
 * candles: finished candles [{ d, c }]; since: ignore candles before this date; recent: how many of the latest candles count as "just happened".
 * Returns { hit, d, close, line } for the latest such cross among the recent candles, plus { last: { d, close, line, beyond } } for the most recent candle.
 */
export function lineCross(candles, L, dir, { since = '', recent = 3 } = {}) {
  const beyond = (r) => (dir === 'above' ? r.c > lineValueAt(L, r.d) : r.c < lineValueAt(L, r.d));
  const n = candles.length, lastR = n ? candles[n - 1] : null;
  const last = lastR ? { d: lastR.d, close: lastR.c, line: lineValueAt(L, lastR.d), beyond: beyond(lastR) } : null;
  for (let i = n - 1; i >= Math.max(1, n - recent); i--) {
    const r = candles[i];
    if (since && r.d < since) break;
    if (beyond(r) && !beyond(candles[i - 1])) return { hit: true, d: r.d, close: r.c, line: lineValueAt(L, r.d), last };
  }
  return { hit: false, last };
}
