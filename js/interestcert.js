// Interest certificate: the interest every fixed-income holding (bonds, fixed deposits, private lending) pays or adds in a chosen period.
// Pure functions, no DOM. Each holding is worked out with its own settings:
//   Bonds:    each payment by the payment-period rule (days since the previous payment day up to its due date), counted in the month it falls due;
//             TDS at the rate in Settings, or the amount you entered as "what reaches me" when it is a full period.
//   Payout deposits and loans: every payout (monthly, quarterly or yearly from the start date) of the amount entered, else the rate on the amount. No TDS is cut here.
//   Compounding deposits and loans: the interest added to the balance in the month (balance at the end of the month less the month before).
import * as C from './calc.js';

export const KINDS = [['all', 'All'], ['Bonds', 'Bonds'], ['Fixed deposits', 'Fixed deposits'], ['Private lending', 'Private lending']];
const DAY = 86400000;
const lastDay = (m) => `${m}-${String(C.daysInMonthOf(m + '-01')).padStart(2, '0')}`;
const prevDay = (d) => new Date(C.toMs(d) - DAY).toISOString().slice(0, 10);

/** The periods offered, with the first and last day of each, as of `asOf`. */
export function periods(asOf) {
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7)), cur = asOf.slice(0, 7);
  const prev = C.addMonths(cur + '-01', -1).slice(0, 7), fy = m >= 4 ? y : y - 1;
  const P = (id, label, from, to) => ({ id, label, from, to });
  return [
    P('cm', 'This month', cur + '-01', lastDay(cur)),
    P('pm', 'Last month', prev + '-01', lastDay(prev)),
    P('ytd', 'Year to date (from 1 Jan)', `${y}-01-01`, asOf),
    P('cy', `This year (${y})`, `${y}-01-01`, `${y}-12-31`),
    P('py', `Last year (${y - 1})`, `${y - 1}-01-01`, `${y - 1}-12-31`),
    P('ny', `Next year (${y + 1})`, `${y + 1}-01-01`, `${y + 1}-12-31`),
    P('fytd', 'Financial year to date', `${fy}-04-01`, asOf),
    P('cfy', `This financial year (FY ${fy}-${String(fy + 1).slice(2)})`, `${fy}-04-01`, `${fy + 1}-03-31`),
    P('pfy', `Last financial year (FY ${fy - 1}-${String(fy).slice(2)})`, `${fy - 1}-04-01`, `${fy}-03-31`),
    P('nfy', `Next financial year (FY ${fy + 1}-${String(fy + 2).slice(2)})`, `${fy + 1}-04-01`, `${fy + 2}-03-31`),
  ];
}
export const monthsIn = (from, to) => { const out = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = C.addMonths(m + '-01', 1).slice(0, 7)) out.push(m); return out; };

/** Compounding balance interest at a date (never past maturity or closing). */
const accruedAt = (it, date) => { if (!it.depositDate || date < it.depositDate) return 0; const stop = it.closed && it.closed.date ? it.closed.date : it.maturityDate; const cap = stop && stop < date ? stop : date; return C.calcDeposit({ ...it, accruedOverride: undefined }, cap).accrued; };

/** Interest of one deposit or loan in each month of [from, to]: { 'YYYY-MM': gross }. */
function depositMonths(it, from, to) {
  const out = {};
  if (!(it.principal > 0) || !it.depositDate) return out;
  const stop = it.closed && it.closed.date ? it.closed.date : it.maturityDate;
  if (it.interestType === 'Payout') {
    const step = C.payoutStep(it), amount = it.payoutAmount > 0 ? it.payoutAmount : C.payoutMonthly(it) * step;
    for (let n = 1; n < 1200; n++) {
      const d = C.addMonths(it.depositDate, step * n);
      if (d > to || (stop && d > stop)) break;
      if (d >= from) out[d.slice(0, 7)] = (out[d.slice(0, 7)] || 0) + amount;
    }
  } else {
    for (const m of monthsIn(from, to)) {
      const e = lastDay(m), s = prevDay(m + '-01');
      const v = accruedAt(it, e) - accruedAt(it, s);
      if (v > 0.005) out[m] = v;
    }
  }
  return out;
}

/**
 * The certificate: one row per holding with its interest in every month of the period.
 * kind: 'all' | 'Bonds' | 'Fixed deposits' | 'Private lending'. Returns { rows, months, totals, byKind, byMonth }.
 * A payment counts as `received` once its date has come (as of `asOf`); later ones are `coming`.
 * row: { kind, name, holder, party, principal, rate, closedOn, months: { m: { gross, tds, net, due } }, gross, tds, net, received, coming, count }
 */
export function certificate(data, all, period, kind = 'all') {
  const { from, to } = period, asOf = all.asOf, tdsRate = data.settings.tdsRate ?? 0.1, months = monthsIn(from, to);
  const rows = [];
  const push = (r) => { r.gross = 0; r.tds = 0; r.net = 0; r.received = 0; r.coming = 0; r.count = 0; for (const m of Object.values(r.months)) { r.gross += m.gross; r.tds += m.tds; r.net += m.net; if (m.due <= asOf) r.received += m.net; else r.coming += m.net; r.count++; } if (r.count) rows.push(r); };
  if (kind === 'all' || kind === 'Bonds') {
    for (const b of data.bonds || []) {
      const r = { kind: 'Bonds', id: b.id, name: b.name, holder: b.holder || '', party: b.company || b.platform || '', principal: b.principal, rate: b.rate, closedOn: b.closed && b.closed.date ? b.closed.date : '', partOf: b.partOf || '', months: {} };
      for (const m of months) {
        const due = C.bondDueDate(b, m); if (due < from || due > to) continue;
        const gross = C.bondGrossIn(b, m); if (!(gross > 0)) continue;
        const net = C.bondNetIn(b, m, tdsRate);
        r.months[m] = { gross, tds: gross - net, net, due };
      }
      push(r);
    }
  }
  for (const [list, k] of [[data.fds || [], 'Fixed deposits'], [data.lending || [], 'Private lending']]) {
    if (kind !== 'all' && kind !== k) continue;
    for (const it of list) {
      const r = { kind: k, id: it.id, name: it.name, holder: it.holder || it.account || '', party: it.issuer || it.borrower || '', principal: it.principal, rate: it.rate, closedOn: it.closed && it.closed.date ? it.closed.date : '', months: {} };
      for (const [m, gross] of Object.entries(depositMonths(it, from, to))) r.months[m] = { gross, tds: 0, net: gross, due: m === asOf.slice(0, 7) ? asOf : lastDay(m) };
      push(r);
    }
  }
  const sum = (f) => rows.reduce((t, r) => t + f(r), 0);
  const totals = { gross: sum((r) => r.gross), tds: sum((r) => r.tds), net: sum((r) => r.net), received: sum((r) => r.received), coming: sum((r) => r.coming), items: rows.length };
  const kinds = [...new Set(rows.map((r) => r.kind))];
  const byKind = kinds.map((k) => { const rs = rows.filter((r) => r.kind === k); return { kind: k, rows: rs, gross: rs.reduce((t, r) => t + r.gross, 0), tds: rs.reduce((t, r) => t + r.tds, 0), net: rs.reduce((t, r) => t + r.net, 0), received: rs.reduce((t, r) => t + r.received, 0), coming: rs.reduce((t, r) => t + r.coming, 0), principal: rs.reduce((t, r) => t + (r.closedOn ? 0 : r.principal), 0) }; });
  const byMonth = months.map((m) => ({ month: m, parts: kinds.map((k) => ({ kind: k, gross: rows.filter((r) => r.kind === k).reduce((t, r) => t + ((r.months[m] || {}).gross || 0), 0), net: rows.filter((r) => r.kind === k).reduce((t, r) => t + ((r.months[m] || {}).net || 0), 0) })) }));
  return { rows, months, totals, kinds, byKind, byMonth };
}
