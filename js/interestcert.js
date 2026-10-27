// Two ways of counting, chosen by the `projections` switch (default off):
//   off  money is counted when it is paid or credited, and only once that date has come: a compounding deposit's interest at maturity or closing, a chit's gain in its
//        completion month (the amount you entered once closed), bonds and payout deposits on each payment date, EPF and PPF in the March they are credited.
//   on   the same, spread the way it is earned (deposits and chits month by month, EPF and PPF monthly) and with payments still to come included as projections.
// Interest certificate: the interest every fixed-income holding (bonds, fixed deposits, private lending) pays or adds in a chosen period.
// Pure functions, no DOM. Each holding is worked out with its own settings:
//   Bonds:    each payment by the payment-period rule (days since the previous payment day up to its due date), counted in the month it falls due;
//             TDS at the rate in Settings, or the amount you entered as "what reaches me" when it is a full period.
//   Payout deposits and loans: every payout (monthly, quarterly or yearly from the start date) of the amount entered, else the rate on the amount. No TDS is cut here.
//   Compounding deposits and loans: the interest added to the balance in the month (balance at the end of the month less the month before).
//   EPF and PPF: what the money earns each completed month at the declared yearly rate (see epf.js); the passbook credits it in March.
//   Chits: the gain (what it paid at the end less the instalments paid in), spread over its life in proportion to the money held each month. A closed chit uses the
//   amount you received when you closed it; an open one is a PROJECTION from its expected payout or yearly rate and the instalments still to come (`projected`).
import * as C from './calc.js';
import { monthlyInterest, rateFor } from './epf.js';

export const KINDS = [['Bonds', 'Bonds'], ['Fixed deposits', 'Fixed deposits'], ['Private lending', 'Private lending'], ['EPF', 'EPF'], ['PPF', 'PPF'], ['Chits', 'Chits']];
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

/** Interest of one deposit or loan by month of [from, to]: { 'YYYY-MM': { gross, due, proj } }. See the notes at the top for the two ways of counting. */
function depositMonths(it, from, to, asOf, projections) {
  const out = {};
  if (!(it.principal > 0) || !it.depositDate) return out;
  const stop = it.closed && it.closed.date ? it.closed.date : it.maturityDate;
  if (it.interestType === 'Payout') {
    const step = C.payoutStep(it), amount = it.payoutAmount > 0 ? it.payoutAmount : C.payoutMonthly(it) * step;
    for (let n = 1; n < 1200; n++) {
      const d = C.addMonths(it.depositDate, step * n);
      if (d > to || (stop && d > stop)) break;
      if (d < from || (!projections && d > asOf)) continue;
      const m = d.slice(0, 7), o = out[m] || { gross: 0, due: d, proj: d > asOf };
      o.gross += amount; if (d > o.due) o.due = d; out[m] = o;
    }
  } else if (projections) {
    for (const m of monthsIn(from, to)) {
      const e = lastDay(m), v = accruedAt(it, e) - accruedAt(it, prevDay(m + '-01'));
      if (v > 0.005) out[m] = { gross: v, due: e, proj: e > asOf };
    }
  } else if (stop && stop <= asOf && stop >= from && stop <= to) {
    const gross = it.closed && it.closed.date && Number(it.closed.amount) > 0 ? Number(it.closed.amount) - it.principal : accruedAt(it, stop);
    if (gross > 0.005) out[stop.slice(0, 7)] = { gross, due: stop, proj: false };
  }
  return out;
}

/** Chit gain by month over its whole life: { total, end, closed, months: { m: gain } }; no months when it cannot be worked out. */
function chitMonths(sv) {
  const ents = (sv.entries || []).filter((e) => e.amount > 0 && e.date).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!ents.length) return null;
  const paid = ents.reduce((t, e) => t + e.amount, 0);
  let end, gain, inst = ents.map((e) => ({ date: e.date, amount: e.amount }));
  if (sv.closed && sv.closed.date) { end = sv.closed.date; gain = (Number(sv.closed.amount) || 0) - paid; }
  else {
    end = C.savingEnd(sv); const mat = C.savingMaturity(sv);
    if (!end || mat.kind === 'paid') return null;
    inst = inst.concat(C.remainingInstalments(sv));
    gain = mat.amount - inst.reduce((t, i) => t + i.amount, 0);
  }
  const wt = {};
  for (const i of inst) {
    if (i.date >= end) continue;
    for (const m of monthsIn(i.date, end)) {
      const a = m + '-01' > i.date ? m + '-01' : i.date, nxt = C.addMonths(m + '-01', 1), b = nxt < end ? nxt : end;
      const days = Math.round((C.toMs(b) - C.toMs(a)) / DAY);
      if (days > 0) wt[m] = (wt[m] || 0) + i.amount * days;
    }
  }
  const W = Object.values(wt).reduce((t, v) => t + v, 0);
  if (!W || Math.abs(gain) < 0.5) return null;
  const months = {}; for (const [m, v] of Object.entries(wt)) months[m] = (gain * v) / W;
  return { total: gain, end, closed: !!(sv.closed && sv.closed.date), paid, months };
}

/**
 * The certificate: one row per holding with its interest in every month of the period.
 * kinds: a list of types from KINDS (empty or 'all' = every type). Returns { rows, months, totals, byKind, byMonth }.
 * A payment counts as `received` once its date has come (as of `asOf`); later ones are `coming`.
 * row: { kind, name, holder, party, principal, rate, closedOn, months: { m: { gross, tds, net, due } }, gross, tds, net, received, coming, count }
 */
export function certificate(data, all, period, kinds = [], opts = {}) {
  const projections = !!opts.projections;
  const want = (k) => { const l = Array.isArray(kinds) ? kinds : kinds === 'all' ? [] : [kinds]; return !l.length || l.includes(k); };
  const { from, to } = period, asOf = all.asOf, tdsRate = data.settings.tdsRate ?? 0.1, months = monthsIn(from, to);
  const rows = [];
  const push = (r) => { r.gross = 0; r.tds = 0; r.net = 0; r.received = 0; r.coming = 0; r.count = 0; r.projNet = 0; for (const m of Object.values(r.months)) { r.gross += m.gross; r.tds += m.tds; r.net += m.net; if (m.due <= asOf) r.received += m.net; else r.coming += m.net; if (m.proj) r.projNet += m.net; r.count++; } r.projected = r.projNet > 0.005; if (r.count) rows.push(r); };
  if (want('Bonds')) {
    for (const b of data.bonds || []) {
      const r = { kind: 'Bonds', id: b.id, name: b.name, holder: b.holder || '', party: b.company || b.platform || '', principal: b.principal, rate: b.rate, closedOn: b.closed && b.closed.date ? b.closed.date : '', partOf: b.partOf || '', months: {} };
      for (const m of months) {
        const due = C.bondDueDate(b, m); if (due < from || due > to || (!projections && due > asOf)) continue;
        const gross = C.bondGrossIn(b, m); if (!(gross > 0)) continue;
        const net = C.bondNetIn(b, m, tdsRate);
        r.months[m] = { gross, tds: gross - net, net, due, proj: due > asOf };
      }
      push(r);
    }
  }
  for (const [list, k] of [[data.fds || [], 'Fixed deposits'], [data.lending || [], 'Private lending']]) {
    if (!want(k)) continue;
    for (const it of list) {
      const r = { kind: k, id: it.id, name: it.name, holder: it.holder || it.account || '', party: it.issuer || it.borrower || '', principal: it.principal, rate: it.rate, closedOn: it.closed && it.closed.date ? it.closed.date : '', months: {} };
      for (const [m, o] of Object.entries(depositMonths(it, from, to, asOf, projections))) r.months[m] = { gross: o.gross, tds: 0, net: o.gross, due: o.due, proj: o.proj };
      push(r);
    }
  }
  for (const sv of data.savings || []) {
    if (sv.type === 'EPF' || sv.type === 'PPF') {
      if (!want(sv.type)) continue;
      const r = { kind: sv.type, id: sv.id, name: sv.name, holder: sv.holder || '', party: '', principal: C.savingPrincipal(sv), rate: rateFor(sv, Number(asOf.slice(5, 7)) >= 4 ? Number(asOf.slice(0, 4)) : Number(asOf.slice(0, 4)) - 1), closedOn: sv.closed && sv.closed.date ? sv.closed.date : '', months: {} };
      const mi = monthlyInterest(sv, asOf);
      if (projections) { for (const [m, gross] of Object.entries(mi)) if (m >= from.slice(0, 7) && m <= to.slice(0, 7) && gross > 0.005) r.months[m] = { gross, tds: 0, net: gross, due: lastDay(m), proj: false }; }
      else {
        // credited on 31 March for the year just ended
        const fyTotal = {}; for (const [m, v] of Object.entries(mi)) { const fy = Number(m.slice(5, 7)) >= 4 ? Number(m.slice(0, 4)) : Number(m.slice(0, 4)) - 1; fyTotal[fy] = (fyTotal[fy] || 0) + v; }
        for (const [fy, gross] of Object.entries(fyTotal)) { const day = `${Number(fy) + 1}-03-31`; if (day <= asOf && day >= from && day <= to && gross > 0.005) r.months[day.slice(0, 7)] = { gross, tds: 0, net: gross, due: day, proj: false }; }
      }
      push(r);
    } else if (sv.type === 'Chit') {
      if (!want('Chits')) continue;
      const c = chitMonths(sv); if (!c) continue;
      const r = { kind: 'Chits', id: sv.id, name: sv.name, holder: sv.holder || '', party: '', principal: c.paid, rate: sv.rate || 0, closedOn: c.closed ? c.end : '', months: {} };
      if (projections) { for (const [m, gross] of Object.entries(c.months)) if (m >= from.slice(0, 7) && m <= to.slice(0, 7)) r.months[m] = { gross, tds: 0, net: gross, due: c.end, proj: !c.closed }; }
      else if (c.end <= asOf && c.end >= from && c.end <= to) r.months[c.end.slice(0, 7)] = { gross: c.total, tds: 0, net: c.total, due: c.end, proj: !c.closed };
      push(r);
    }
  }
  const sum = (f) => rows.reduce((t, r) => t + f(r), 0);
  const totals = { gross: sum((r) => r.gross), tds: sum((r) => r.tds), net: sum((r) => r.net), received: sum((r) => r.received), coming: sum((r) => r.coming), projected: rows.reduce((t, r) => t + r.projNet, 0), items: rows.length };
  const kindsIn = KINDS.map((k) => k[0]).filter((k) => rows.some((r) => r.kind === k));
  const byKind = kindsIn.map((k) => { const rs = rows.filter((r) => r.kind === k); return { kind: k, rows: rs, gross: rs.reduce((t, r) => t + r.gross, 0), tds: rs.reduce((t, r) => t + r.tds, 0), net: rs.reduce((t, r) => t + r.net, 0), received: rs.reduce((t, r) => t + r.received, 0), coming: rs.reduce((t, r) => t + r.coming, 0), projected: rs.reduce((t, r) => t + r.projNet, 0), principal: rs.reduce((t, r) => t + (r.closedOn ? 0 : r.principal), 0) }; });
  const byMonth = months.map((m) => ({ month: m, projected: rows.some((r) => r.months[m] && r.months[m].proj), parts: kindsIn.map((k) => ({ kind: k, gross: rows.filter((r) => r.kind === k).reduce((t, r) => t + ((r.months[m] || {}).gross || 0), 0), net: rows.filter((r) => r.kind === k).reduce((t, r) => t + ((r.months[m] || {}).net || 0), 0) })) }));
  return { rows, months, totals, kinds: kindsIn, byKind, byMonth };
}
