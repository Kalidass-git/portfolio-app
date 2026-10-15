// EPF and PPF: what the money would have earned at the interest rates the government declared each year.
// Your passbook entries decide HOW MUCH went in and when. The yearly rate comes from this table (or your own rate for years after it).
// EPFO declared rates, by financial year starting in April of the year shown (8.25 means 8.25%).
export const EPF_RATES = { 2008: 8.5, 2009: 8.5, 2010: 9.5, 2011: 8.25, 2012: 8.5, 2013: 8.75, 2014: 8.75, 2015: 8.8, 2016: 8.65, 2017: 8.55, 2018: 8.65, 2019: 8.5, 2020: 8.5, 2021: 8.1, 2022: 8.15, 2023: 8.25, 2024: 8.25, 2025: 8.25 };

const amt = (e) => (e.employee || 0) + (e.employer || 0) + (e.amount || 0);
const isInterest = (e) => /interest/i.test((e.kind || '') + ' ' + (e.remarks || ''));
const fyOf = (mk) => (Number(mk.slice(5, 7)) >= 4 ? Number(mk.slice(0, 4)) : Number(mk.slice(0, 4)) - 1);

/** Yearly rate (0.0825) for a financial year. EPF uses the declared table; years after it, and PPF, use the rate set on the account. */
export function rateFor(sv, fy) {
  if (sv.type === 'EPF') { const t = EPF_RATES[fy]; if (t != null) return t / 100; if (fy < 2008) return 0.085; }
  return sv.rate || 0;
}
/** Money put in: every entry that is not interest. An interest-labelled row on the first date is the opening balance and counts as money put in. */
export function deposits(sv, asOf) {
  const rows = (sv.entries || []).filter((e) => e.date && e.date <= asOf).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const firstDep = rows.find((e) => !isInterest(e) && amt(e) > 0);
  const out = [];
  for (const e of rows) {
    const a = amt(e); if (!(a > 0)) continue;
    const opening = isInterest(e) && sv.type === 'EPF' && (!firstDep || e.date <= firstDep.date) && e === rows.find((x) => amt(x) > 0);
    if (isInterest(e) && !opening) continue;
    out.push({ date: e.date, amount: a });
  }
  return out;
}
/** Balance today if every deposit earned the declared rate: monthly interest on the balance, added to it each March. */
export function modelValue(sv, asOf) {
  const dep = deposits(sv, asOf);
  if (!dep.length) return 0;
  const startM = dep[0].date.slice(0, 7), endM = asOf.slice(0, 7);
  let credited = 0, accrued = 0, i = 0;
  for (let y = Number(startM.slice(0, 4)), m = Number(startM.slice(5, 7)); ; ) {
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    if (mk > endM) break;
    while (i < dep.length && dep[i].date.slice(0, 7) === mk) credited += dep[i++].amount;
    if (mk < endM) accrued += (credited * rateFor(sv, fyOf(mk))) / 12;
    if (m === 3) { credited += accrued; accrued = 0; }
    if (++m > 12) { m = 1; y++; }
  }
  return credited + accrued;
}
/** Dated money flows for an XIRR: deposits out, estimated balance in. */
export function modelFlows(sv, asOf, toMs) {
  const dep = deposits(sv, asOf);
  if (!dep.length) return { flows: [], value: 0, put: 0 };
  const value = modelValue(sv, asOf);
  return { flows: dep.map((d) => ({ t: toMs(d.date), amount: -d.amount })).concat([{ t: toMs(asOf), amount: value }]), value, put: dep.reduce((a, d) => a + d.amount, 0) };
}
