// Archive old bank entries so Expenses stays small. Bank balances stay exactly right:
// each account gets one "opening balance" entry on the cut-off date in place of the archived entries.
import { kindOf } from './categories.js';

const ARCHIVE_DESC = 'Opening balance (older history archived)';
const nextNum = (list) => list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;

/** What would be archived: entries dated before `cutoff` (YYYY-MM-DD). */
export function preview(data, cutoff) {
  const old = data.ledger.filter((e) => e.date < cutoff);
  const accts = new Set(old.map((e) => e.acct));
  return { count: old.length, accounts: accts.size, from: old.reduce((m, e) => (!m || e.date < m ? e.date : m), ''), to: old.reduce((m, e) => (e.date > m ? e.date : m), '') };
}

/** Monthly totals kept with the archive so history is still visible. */
export function monthSummary(data, entries) {
  const kind = kindOf(data), out = {};
  for (const e of entries) {
    const k = kind(e.category);
    if (k === 'transfer') continue;
    const m = (out[e.date.slice(0, 7)] = out[e.date.slice(0, 7)] || { income: 0, expenses: 0, invested: 0 });
    if (k === 'income') m.income += (e.credit || 0) - (e.debit || 0);
    else if (k === 'investment') m.invested += (e.debit || 0) - (e.credit || 0);
    else m.expenses += (e.debit || 0) - (e.credit || 0);
  }
  return out;
}

/** Move entries before `cutoff` into data.archive. Mutates `d`. Returns the archive record or null. */
export function archiveBefore(d, cutoff, now = new Date().toISOString()) {
  const old = d.ledger.filter((e) => e.date < cutoff);
  if (!old.length) return null;
  d.archive = d.archive || [];
  const months = monthSummary(d, old);
  const net = new Map();
  for (const e of old) net.set(e.acct, (net.get(e.acct) || 0) + (e.credit || 0) - (e.debit || 0));
  const id = 'a' + nextNum(d.archive.map((x) => ({ id: String(x.id).replace(/^a/, '') })));
  d.ledger = d.ledger.filter((e) => e.date >= cutoff);
  let n = nextNum(d.ledger.concat(old));
  const opening = [];
  for (const [acct, v] of net) {
    if (Math.abs(v) < 0.005) continue;
    const row = { id: n++, acct, date: cutoff, desc: ARCHIVE_DESC, debit: v < 0 ? -v : 0, credit: v > 0 ? v : 0, category: 'Transfer', archiveId: id };
    d.ledger.push(row); opening.push(row.id);
  }
  const rec = { id, createdAt: now, cutoff, count: old.length, from: old.reduce((m, e) => (!m || e.date < m ? e.date : m), ''), openingIds: opening, months, entries: old };
  d.archive.push(rec);
  return rec;
}

/** Put an archive's entries back and drop its opening-balance entries. Mutates `d`. */
export function restoreArchive(d, id) {
  const rec = (d.archive || []).find((a) => a.id === id);
  if (!rec) return false;
  d.ledger = d.ledger.filter((e) => e.archiveId !== id);
  const have = new Set(d.ledger.map((e) => e.id));
  for (const e of rec.entries) if (!have.has(e.id)) d.ledger.push(e);
  d.ledger.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id || 0) - (b.id || 0)));
  d.archive = d.archive.filter((a) => a.id !== id);
  return true;
}

export function toCsv(rec, data) {
  const acct = (id) => (data.accounts.find((a) => a.id === id) || {}).title || id;
  const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  return ['Date,Account,Description,Debit,Credit,Category', ...rec.entries.map((e) => [e.date, q(acct(e.acct)), q(e.desc), e.debit || 0, e.credit || 0, q(e.category)].join(','))].join('\n');
}
