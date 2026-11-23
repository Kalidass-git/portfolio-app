// Money you paid for someone else and expect back: a company that reimburses your internet bill, a friend you sent money to.
// Pure functions on the data object, no DOM.
//
// A claim is a bank debit with an optional  claim: { from, cat }  field.
//   from  who owes it (a company, a friend)
//   cat   the category it would have had as a normal expense (kept so it can be turned back)
// The debit moves to the category "Claim back" (kind: transfer), so it is not spending, not in budgets and not income.
//
// A repayment is a bank credit in the same category with  claimFor: [{ id, amount }]  (the claims it pays off)
// and  claimPrev  (the category the credit had before it was linked, or null when it was created here).
// Both fields are optional, so older data files and the live data are untouched until you use the feature.

export const CLAIM_CAT = 'Claim back';
const lc = (s) => (s || '').trim().toLowerCase();
const r2 = (n) => Math.round(n * 100) / 100;

/** Make the "Claim back" category exist (as a not-counted kind). Returns its name. */
export function ensureCategory(d, CAT) { return CAT.add(d, { name: CLAIM_CAT, kind: 'transfer' }); }

/** Turn a debit entry into a claim on `from`. `cat` is the category it had (or would have had). */
export function markClaim(e, from, cat) {
  if (!(e.debit > 0)) throw new Error('Only money paid out can be claimed back.');
  if (!lc(from)) throw new Error('Say who will pay it back.');
  e.claim = { from: from.trim(), cat: cat || (e.claim && e.claim.cat) || 'Others' };
  e.category = CLAIM_CAT;
}

/** Amount already paid back for each claim id. */
function receivedMap(ledger) {
  const m = new Map();
  for (const e of ledger) for (const a of e.claimFor || []) m.set(a.id, r2((m.get(a.id) || 0) + a.amount));
  return m;
}

/** Every claim with what has come back and what is still due: { id, date, desc, from, cat, acct, amount, received, pending }. Oldest first. */
export function claimRows(data) {
  const ledger = data.ledger || [], rec = receivedMap(ledger);
  return ledger.filter((e) => e.claim && e.debit > 0).map((e) => {
    const received = Math.min(e.debit, rec.get(e.id) || 0);
    return { id: e.id, date: e.date, desc: e.desc, from: e.claim.from, cat: e.claim.cat, acct: e.acct, amount: e.debit, received, pending: r2(e.debit - received) };
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

/** { total, people: [{ from, pending, count, oldest, claims }], settled: [claim rows fully paid] } */
export function claimSummary(data) {
  const rows = claimRows(data), by = new Map();
  for (const r of rows.filter((x) => x.pending > 0.004)) {
    const g = by.get(lc(r.from)) || { from: r.from, pending: 0, count: 0, oldest: r.date, claims: [] };
    g.pending = r2(g.pending + r.pending); g.count++; g.claims.push(r); if (r.date < g.oldest) g.oldest = r.date;
    by.set(lc(r.from), g);
  }
  const people = [...by.values()].sort((a, b) => b.pending - a.pending);
  return { total: r2(people.reduce((a, p) => a + p.pending, 0)), people, settled: rows.filter((x) => x.pending <= 0.004) };
}

/** Names already used, for the "Claim back from" suggestions. */
export const claimPeople = (data) => [...new Set(claimRows(data).map((r) => r.from))].sort((a, b) => a.localeCompare(b));

/**
 * Record money coming back from `from`. Pays that person's open claims oldest first (or only `ids` when given).
 * Either creates a new bank credit ({ acct, date, amount }) or links an existing one ({ creditId }, whole amount).
 * Returns the allocation [{ id, amount }]. Throws when it is more than is owed.
 */
export function applyRepayment(d, { from, amount, date, acct, creditId = null, ids = null }) {
  const own = claimRows(d).filter((r) => lc(r.from) === lc(from) && r.pending > 0.004 && (!ids || ids.includes(r.id)));
  const owed = r2(own.reduce((a, r) => a + r.pending, 0));
  let credit = null;
  if (creditId != null) {
    credit = d.ledger.find((e) => e.id === creditId);
    if (!credit || !(credit.credit > 0)) throw new Error('Pick a bank credit.');
    if (credit.claimFor && credit.claimFor.length) throw new Error('That credit is already linked to a claim.');
    amount = credit.credit;
  }
  if (!(amount > 0)) throw new Error('Enter an amount above zero.');
  if (!own.length) throw new Error('Nothing is waiting to come back from ' + from + '.');
  if (amount > owed + 0.004) throw new Error(`That is more than the ${owed} still due from ${from}.`);
  let left = amount; const alloc = [];
  for (const r of own) { if (left <= 0.004) break; const a = r2(Math.min(left, r.pending)); alloc.push({ id: r.id, amount: a }); left = r2(left - a); }
  if (credit) { credit.claimPrev = credit.category || ''; credit.claimFor = alloc; credit.category = CLAIM_CAT; }
  else {
    const id = Math.max(0, ...d.ledger.map((e) => e.id || 0)) + 1;
    d.ledger.push({ id, acct, date, desc: 'Received from ' + from, debit: 0, credit: amount, category: CLAIM_CAT, claimFor: alloc, claimPrev: null });
  }
  return alloc;
}

/** Undo a repayment. A credit made here is removed; a linked bank credit gets its old category back. */
export function undoRepayment(d, creditId) {
  const c = d.ledger.find((e) => e.id === creditId);
  if (!c || !c.claimFor) return;
  if (c.claimPrev == null) d.ledger = d.ledger.filter((e) => e.id !== creditId);
  else { c.category = c.claimPrev || 'Others'; delete c.claimFor; delete c.claimPrev; }
}

/** Repayments (credits) with the people and claims they paid. */
export function repayments(data) {
  const claims = new Map(claimRows(data).map((r) => [r.id, r]));
  return (data.ledger || []).filter((e) => e.claimFor && e.claimFor.length).map((e) => {
    const parts = e.claimFor.map((a) => ({ ...a, claim: claims.get(a.id) })).filter((p) => p.claim);
    return { id: e.id, date: e.date, acct: e.acct, amount: e.credit, from: parts[0] ? parts[0].claim.from : '', parts, linked: e.claimPrev != null };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Stop treating a debit as a claim; it goes back to its normal category. Refused while money has already come back for it. */
export function cancelClaim(d, id) {
  const e = d.ledger.find((x) => x.id === id);
  if (!e || !e.claim) return;
  if (d.ledger.some((x) => (x.claimFor || []).some((a) => a.id === id))) throw new Error('Money has already come back for this. Undo those repayments first.');
  e.category = e.claim.cat; delete e.claim;
}

/** True when some repayment already points at this claim. */
export const hasRepayments = (data, id) => (data.ledger || []).some((e) => (e.claimFor || []).some((a) => a.id === id));
