// What you own, in four lines: shares & funds, debt & fixed income, gold, and the rest (cash and others).
// The daily reading the app keeps (`history`) now also carries `cls` with these four values, so Home can draw how each one moved.
// Older months come from the month-end check-ins that saved their asset classes. Pure functions, no DOM.
import * as P from './projector.js';
import { monthEnd } from './calc.js';

export const LINES = [
  { id: 'equity', label: 'Shares & funds', color: 0 },
  { id: 'debt', label: 'Debt & fixed income', color: 2 },
  { id: 'gold', label: 'Gold', color: 3 },
  { id: 'other', label: 'Others & cash', color: 4 },
];
const GROUP_OF = { bonds: 'debt', lending: 'debt', fds: 'debt', pf: 'debt', chits: 'debt', lic: 'debt', gold: 'gold', shares: 'equity', etfs: 'equity', funds: 'equity', cash: 'other', other: 'other' };

/** Add up projector class values (cash, bonds, shares, …) into the four lines. */
export function groupValues(values) {
  const out = { equity: 0, debt: 0, gold: 0, other: 0 };
  for (const [k, v] of Object.entries(values || {})) { const n = Number(v); if (Number.isFinite(n)) out[GROUP_OF[k] || 'other'] += n; }
  return out;
}
/** Today's four values, rounded to whole rupees. */
export function liveGroups(data, all) {
  const g = groupValues(P.baseline(data, all).values);
  return { equity: Math.round(g.equity), debt: Math.round(g.debt), gold: Math.round(g.gold), other: Math.round(g.other) };
}
/** A saved daily reading already holds the four lines (equity, debt, gold, other); run through groupValues it would pile shares and debt into "other". Raw class values (cash, bonds, shares, …) still go through groupValues. */
export function readGroups(c) {
  const four = LINES.map((l) => l.id);
  if (c && Object.keys(c).every((k) => four.includes(k))) return Object.fromEntries(four.map((k) => [k, Number.isFinite(Number(c[k])) ? Number(c[k]) : 0]));
  return groupValues(c);
}
export const sameGroups = (a, b) => !!a && !!b && LINES.every((l) => a[l.id] === b[l.id]);

/** Dated readings of the four lines, oldest first: month-end check-ins with classes, daily readings with `cls`, and today (which wins on its own date). */
export function classPoints(data, all) {
  const pts = new Map();
  for (const s of (data.projector && data.projector.snapshots) || []) {
    if (!s.classes) continue;
    const d = monthEnd(s.month + '-01'); if (d > all.asOf) continue;
    pts.set(d, { date: d, ...groupValues(s.classes), src: 'month end' });
  }
  for (const r of data.history || []) if (r.cls && r.date <= all.asOf) pts.set(r.date, { date: r.date, ...readGroups(r.cls), src: 'daily' });
  pts.set(all.asOf, { date: all.asOf, ...groupValues(P.baseline(data, all).values), src: 'today' });
  return [...pts.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
