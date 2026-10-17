// Bank CSV import: read rows (account, date, description, credit, debit), find what is new, and suggest a category for each.
// Pure functions, no DOM. The Cash page dialog (views/cash-import.js) shows the preview and saves.

const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
const norm = (s) => lc(s).replace(/[^a-z0-9]/g, '');

const HEADS = {
  account: ['account', 'acct', 'bank', 'a/c', 'account name', 'bank account'],
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date'],
  desc: ['description', 'desc', 'narration', 'particulars', 'details', 'remarks', 'transaction details'],
  credit: ['credit', 'deposit', 'cr', 'credit amount', 'deposits', 'money in'],
  debit: ['debit', 'withdrawal', 'dr', 'debit amount', 'withdrawals', 'money out'],
  category: ['category'],
};

/** Pasted text (from Excel, a bank site or a CSV) -> rows. Tab, comma or semicolon separated; quotes are understood. */
export function parseText(text) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = first.includes('\t') ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** Find the header row and which column is which. Returns null when date and an amount column are not both found. */
export function findColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(lc);
    const col = {};
    for (const [k, names] of Object.entries(HEADS)) { const j = cells.findIndex((c) => names.includes(c)); if (j >= 0) col[k] = j; }
    if (col.date != null && col.desc != null && (col.credit != null || col.debit != null)) return { header: i, col };
  }
  return null;
}

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const validDate = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
/** 2026-03-14, 14/03/2026 (day first), 14-Mar-2026, 14 Mar 26, or an Excel serial number. Returns YYYY-MM-DD or null. */
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { if (v > 20000 && v < 80000) { const t = new Date(Math.round((v - 25569) * 864e5)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; } return null; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return validDate(y, +m[2], +m[1]) ? `${y}-${pad(m[2])}-${pad(m[1])}` : null; }
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2}|\d{4})$/);
  if (m) { const mi = MON.indexOf(m[2].toLowerCase()); const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return mi >= 0 && validDate(y, mi + 1, +m[1]) ? `${y}-${pad(mi + 1)}-${pad(m[1])}` : null; }
  return null;
}
/** "1,23,456.50", "₹ 500", "(250)" -> number; blank or "-" -> 0; not a number -> NaN. */
export function parseAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.abs(v);
  let s = String(v).trim().replace(/[₹,\s]|rs\.?|inr/gi, '');
  if (s === '' || s === '-' || s === '–') return 0;
  s = s.replace(/^\((.*)\)$/, '$1').replace(/(cr|dr)$/i, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(n) : NaN;
}

/** Which of the app's accounts does this text mean? Returns the account id or ''. */
export function matchAccount(text, accounts) {
  const t = norm(text); if (!t) return '';
  for (const a of accounts) {
    const keys = [a.id, a.name + a.holder, a.holder + a.name, a.title, a.name + ' ' + a.holder].map(norm).filter(Boolean);
    if (keys.includes(t)) return a.id;
  }
  const byName = accounts.filter((a) => norm(a.name) === t);
  return byName.length === 1 ? byName[0].id : '';
}

/** Best known category for a description: exact rule, then the longest rule contained in it (or containing it). */
export function suggestCategory(desc, rules, direction) {
  const d = lc(desc); if (!d) return '';
  const ok = (r) => (direction === 'credit' ? r.type !== 'Expense' : r.type !== 'Income');
  let hit = rules.find((r) => lc(r.desc) === d && ok(r)) || rules.find((r) => lc(r.desc) === d);
  if (hit) return hit.category;
  let best = null;
  for (const r of rules) { const k = lc(r.desc); if (k.length < 4) continue; if ((d.includes(k) || k.includes(d)) && (!best || k.length > lc(best.desc).length || (k.length === lc(best.desc).length && ok(r) && !ok(best)))) best = r; }
  return best ? best.category : '';
}

/**
 * Turn the table into import rows.
 * Each row: { n, acctText, acct, date, desc, debit, credit, category, csvCategory, status: 'new' | 'duplicate' | 'invalid', reason }
 */
export function buildImport(table, data) {
  const found = findColumns(table);
  if (!found) throw new Error('Could not find the columns. The first row should have: account, date, description, credit, debit.');
  const { header, col } = found;
  const existing = new Map();
  const keyOf = (acct, date, desc, debit, credit) => [acct, date, lc(desc), Math.round(debit * 100), Math.round(credit * 100)].join('|');
  for (const e of data.ledger) { const k = keyOf(e.acct, e.date, e.desc, e.debit || 0, e.credit || 0); existing.set(k, (existing.get(k) || 0) + 1); }
  const rules = data.categories || [];
  const out = [];
  for (let i = header + 1; i < table.length; i++) {
    const r = table[i] || [];
    if (!r.some((c) => c != null && String(c).trim() !== '')) continue;
    const acctText = col.account != null ? String(r[col.account] ?? '').trim() : '';
    const date = parseDate(r[col.date]);
    const desc = String(r[col.desc] ?? '').trim();
    const debit = col.debit != null ? parseAmount(r[col.debit]) : 0, credit = col.credit != null ? parseAmount(r[col.credit]) : 0;
    const row = { n: i + 1, acctText, acct: matchAccount(acctText, data.accounts), date, desc, debit, credit, category: '', csvCategory: col.category != null ? String(r[col.category] ?? '').trim() : '', status: 'new', reason: '' };
    if (!date) { row.status = 'invalid'; row.reason = 'date not understood'; }
    else if (Number.isNaN(debit) || Number.isNaN(credit)) { row.status = 'invalid'; row.reason = 'amount not understood'; }
    else if (!(debit > 0) && !(credit > 0)) { row.status = 'invalid'; row.reason = 'no amount'; }
    else if (debit > 0 && credit > 0) { row.status = 'invalid'; row.reason = 'both credit and debit'; }
    else if (!desc) { row.status = 'invalid'; row.reason = 'no description'; }
    out.push(row);
  }
  // rows that are already in the app are skipped (the same account, date, description and amount), one for one
  for (const row of out) {
    if (row.status !== 'new') continue;
    row.dir = row.credit > 0 ? 'credit' : 'debit';
    const names = new Set((data.categoryList || []).map((c) => lc(c.name)).concat((data.ledger || []).map((e) => lc(e.category))));
    row.category = suggestCategory(row.desc, rules, row.dir) || (row.csvCategory && names.has(lc(row.csvCategory)) ? row.csvCategory : '');
    if (row.acct) {
      const k = keyOf(row.acct, row.date, row.desc, row.debit, row.credit);
      const c = existing.get(k) || 0;
      if (c > 0) { existing.set(k, c - 1); row.status = 'duplicate'; row.reason = 'already in the app'; }
    }
  }
  return { rows: out, columns: col };
}

/** Re-check duplicates after the user maps an account (rows without an account could not be compared before). */
export function recheckDuplicates(rows, data) {
  const keyOf = (acct, date, desc, debit, credit) => [acct, date, lc(desc), Math.round(debit * 100), Math.round(credit * 100)].join('|');
  const existing = new Map();
  for (const e of data.ledger) { const k = keyOf(e.acct, e.date, e.desc, e.debit || 0, e.credit || 0); existing.set(k, (existing.get(k) || 0) + 1); }
  for (const row of rows) {
    if (row.status === 'invalid') continue;
    row.status = 'new'; row.reason = '';
    if (!row.acct) continue;
    const k = keyOf(row.acct, row.date, row.desc, row.debit, row.credit), c = existing.get(k) || 0;
    if (c > 0) { existing.set(k, c - 1); row.status = 'duplicate'; row.reason = 'already in the app'; }
  }
}

export const SAMPLE_CSV = 'account,date,description,credit,debit\nSCB,2026-10-01,Salary,100000,\nSCB,2026-10-02,Groceries,,2500\nTMB (Suganya),2026-10-03,Milk,,450\n';
