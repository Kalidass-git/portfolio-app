// A usual pace for this month's spending, learned from your own earlier months (pure logic, no DOM).
// A flat "budget x day / days in month" treats every rupee alike. Rent and bills land early, groceries and food come all month, and
// one-off payments (medical, travel) come now and then. So for each spending line we look at the last few months and take the usual
// amount that had been paid by the same day, and the usual amount for the whole month. Lines that appear in less than half of the
// months are one-offs: they are not expected, so when one shows up it is named as the reason for being ahead.
import * as C from './calc.js';

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dayOf = (d) => Number(String(d).slice(8, 10)) || 1;

/** Usual timing of one line from its past months: 'early' (mostly paid in the first week or so), 'steady' (spread over the month) or 'oneoff'. */
function kindOf(byDay, total, present, n, day, dim) {
  if (present < Math.ceil(n / 2)) return 'oneoff';
  const early = byDay.filter((v, i) => total[i] > 0 && v / total[i] >= 0.9).length;   // months where 90%+ was paid by this day
  return day <= 10 && early >= Math.ceil(present * 0.7) ? 'early' : 'steady';
}

/**
 * @param data   the data file (needs ledger)
 * @param mc     C.monthCashflow of the month being judged (its spend groups say which categories make up each line)
 * @param month  'YYYY-MM' of the month being judged
 * @param day    the day of the month we are at (1..31)
 * @param opts   { months: how many earlier months to learn from (default 6) }
 * @returns null when there are fewer than 2 earlier months with spending, otherwise
 *   { months, expectedNow, expectedMonth, spent, projected, lines: [{ name, kind, spent, usualNow, usualMonth, diff }] }
 */
export function usualPace(data, mc, month, day, opts = {}) {
  const want = opts.months || 6;
  const groups = mc.spend.concat(mc.lifestyle && mc.lifestyle.cats && mc.lifestyle.cats.length ? [mc.lifestyle] : []).filter((g) => g.cats && g.cats.length);
  const hist = C.ledgerMonths(data).filter((m) => m < month).slice(-want);
  const per = hist.map((m) => {
    const rows = C.monthLedger(data, m).filter((e) => e.debit > 0);
    return groups.map((g) => { const set = new Set(g.cats), mine = rows.filter((e) => set.has((e.category || '').toLowerCase())); return { by: mine.filter((e) => dayOf(e.date) <= day).reduce((a, e) => a + e.debit, 0), all: mine.reduce((a, e) => a + e.debit, 0) }; });
  }).filter((r) => r.reduce((a, x) => a + x.all, 0) > 0);
  if (per.length < 2) return null;
  const n = per.length, dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const lines = groups.map((g, i) => {
    const by = per.map((r) => r[i].by), all = per.map((r) => r[i].all), present = all.filter((v) => v > 0.5).length;
    const kind = kindOf(by, all, present, n, day, dim);
    // a one-off is not expected; the others use the usual (median) amount by this day and over the whole month
    const usualNow = kind === 'oneoff' ? 0 : median(by), usualMonth = kind === 'oneoff' ? 0 : median(all);
    return { name: g.name, kind, spent: g.amount, usualNow, usualMonth, diff: g.amount - usualNow };
  }).filter((l) => l.spent > 0.5 || l.usualMonth > 0.5);
  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  // month end: what is spent already, plus what such a line usually still adds after this day
  const projected = lines.reduce((a, l) => a + l.spent + Math.max(0, l.usualMonth - l.usualNow), 0);
  return { months: n, expectedNow: sum('usualNow'), expectedMonth: sum('usualMonth'), spent: sum('spent'), projected, lines: lines.sort((a, b) => b.diff - a.diff) };
}

/** One plain sentence for Home. */
export function paceSentence(p, money, day) {
  const ahead = p.lines.filter((l) => l.diff > 0.5 && l.diff > p.spent * 0.05).slice(0, 2);
  const why = ahead.length ? ' Mostly ' + ahead.map((l) => `${l.name.toLowerCase()} (${money(l.diff)} ${l.kind === 'oneoff' ? 'not usual' : 'above usual'})`).join(' and ') + '.' : '';
  return `${money(p.spent)} spent by day ${day}. In your last ${p.months} months about ${money(p.expectedNow)} had gone by this day (bills like rent come early), so ${p.spent > p.expectedNow ? 'you are ' + money(p.spent - p.expectedNow) + ' ahead of your usual pace' : 'you are on or under your usual pace'}.${why} At this rate the month ends near ${money(p.projected)}.`;
}

/**
 * How a line's spending compares with its usual (the same day in earlier months): 'good' well within it (under 85%), 'warn' close to it or just over (85 to 115%),
 * 'bad' well above it (over 115%), and 'bad' for money spent on a line that is usually not paid at all (a one-off). null when there is no usual to compare with.
 */
export function lineTone(spent, usual, kind) {
  if (!(spent > 0)) return null;
  if (!(usual > 0)) return kind === 'oneoff' ? 'bad' : null;
  const r = spent / usual;
  return r < 0.85 ? 'good' : r <= 1.15 ? 'warn' : 'bad';
}

/** The date `k` months later (negative = earlier), same day of the month, cut back to the last day when that month is shorter. 'YYYY-MM-DD' in and out. */
export function shiftMonths(iso, k) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + k, d = Number(iso.slice(8, 10));
  const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12, dim = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}

/**
 * The usual amount per key (a category, say) for the span from..to, from the same span in the earlier months: the middle value of up to `want` of them.
 * @param sumFn   (from, to) => Map(key -> amount) for that span
 * @param hasData (month 'YYYY-MM') => whether that month has bank entries (empty months are skipped, not counted as zero)
 * @returns Map(key -> { usual, kind: 'steady' | 'oneoff' }), or null when fewer than 2 earlier months have entries. A key in under half of them is a one-off (usual 0).
 */
export function usualByKey(from, to, sumFn, hasData, want = 6) {
  const wins = [];
  for (let k = 1; wins.length < want && k <= 24; k++) { const f = shiftMonths(from, -k); if (hasData(f.slice(0, 7))) wins.push(sumFn(f, shiftMonths(to, -k))); }
  if (wins.length < 2) return null;
  const keys = new Set(); wins.forEach((w) => w.forEach((_, key) => keys.add(key)));
  const out = new Map(), n = wins.length;
  for (const key of keys) {
    const vals = wins.map((w) => w.get(key) || 0), present = vals.filter((v) => v > 0.5).length, oneoff = present < Math.ceil(n / 2);
    out.set(key, { usual: oneoff ? 0 : median(vals), kind: oneoff ? 'oneoff' : 'steady' });
  }
  return out;
}
