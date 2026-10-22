import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { h, money, dateStr, monthLabel, section, table, btn, formDialog, dialog, canEdit, toast, num, segTabs, subTab, route, setOptions, monthOptions } from '../ui.js';
import * as CAT from '../categories.js';
import { hbars } from '../charts.js';
import { closeForm, reopen } from './closing.js';
import { openBankImport } from './cash-import.js';
import { confirmDialog, pct, posNeg, stat, datalistId, icon, rowList } from '../ui.js';
import { chitCards } from '../monthinvest.js';

/** Calendar and financial year (April to March) choices for the date filter. */
const PERIODS = (asOf) => {
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7)), fy = m >= 4 ? y : y - 1;
  return [['p:ty', `This year (${y})`, `${y}-01-01`, `${y}-12-31`], ['p:ly', `Last year (${y - 1})`, `${y - 1}-01-01`, `${y - 1}-12-31`],
    ['p:tfy', `This financial year (Apr ${fy} – Mar ${fy + 1})`, `${fy}-04-01`, `${fy + 1}-03-31`], ['p:lfy', `Last financial year (Apr ${fy - 1} – Mar ${fy})`, `${fy - 1}-04-01`, `${fy}-03-31`]];
};
const inPeriod = (v, date, asOf) => { if (v === 'all') return true; if (v.startsWith('p:')) { const p = PERIODS(asOf).find((x) => x[0] === v); return !!p && date >= p[2] && date <= p[3]; } return C.monthKey(date) === v; };
let fAcct = 'all', fMonth = null, fText = '', fKind = 'all', limit = 60;
let fCat = 'all', fAmtOp = 'any', fAmtVal = '', fSort = 'date', fDir = 'desc';
const TABS = [['accounts', 'Accounts'], ['ledger', 'Transactions']];
/** Open the transactions list, optionally pre-filtered. Used by links from other screens. */
export function openLedger({ text = '', month = null, acct = 'all', kind = 'all' } = {}) { fText = text; fMonth = month; fAcct = acct; fKind = kind; limit = 60; location.hash = '#/cash/ledger'; }

export function render() {
  const root = h('div', { class: 'page' });
  const old = route().sub;
  if (old === 'savings' || old === 'closed') location.replace('#/savings' + (old === 'closed' ? '/closed' : ''));
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Cash views'), canEdit() ? h('span', { class: 'btn-row' }, (() => { const b = btn('Import', () => openBankImport(categoryOptions)); b.classList.add('only-lg'); b.title = 'Import bank transactions from a CSV file'; return b; })(), btn('Transfer', () => transferForm()), btn('Add transaction', () => txnForm(), 'primary')) : null));
  root.append(tab === 'ledger' ? ledger() : accounts());
  return root;
}
const rerender = () => window.dispatchEvent(new Event('rerender'));

// ----- accounts -----
const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'acct';
function accountForm(acct) {
  const isNew = !acct;
  const { data } = S;
  formDialog({
    title: isNew ? 'Add bank account' : 'Edit ' + acct.name, saveLabel: isNew ? 'Add' : 'Save',
    value: acct ? { name: acct.name, holder: acct.holder, title: acct.title || '', wallet: !!acct.wallet } : { holder: (data.accounts[0] && data.accounts[0].holder) || '', openingDate: C.todayISO() },
    deleteMessage: 'Delete this account? It can only be deleted when it has no transactions.',
    fields: [
      { key: 'name', label: 'Bank / account name', required: true, hint: 'Short name, for example HDFC or Cash.' },
      { key: 'holder', label: 'Account holder', required: true },
      { key: 'wallet', label: 'This is a wallet, not a bank (leave it out of the investable amount)', type: 'checkbox' },
      { key: 'title', label: 'Full title (optional)', hint: 'Shown in reports, for example Standard Chartered (Kali).' },
      { key: 'opening', label: 'Balance today (₹)', type: 'number', showIf: () => isNew, hint: 'Optional. Added as an opening balance entry. It is not counted as income.' },
      { key: 'openingDate', label: 'Balance as on', type: 'date', showIf: (v) => isNew && v.opening !== '' && v.opening != null },
    ],
    onSave: (v) => {
      const name = v.name.trim();
      if (data.accounts.some((x) => (!acct || x.id !== acct.id) && x.name.toLowerCase() === name.toLowerCase() && x.holder.toLowerCase() === v.holder.trim().toLowerCase())) { toast('That account already exists.', 'bad'); return false; }
      mutate((d) => {
        if (isNew) {
          let id = slug(name + '_' + v.holder.split(' ')[0]); const taken = new Set(d.accounts.map((x) => x.id));
          for (let i = 2; taken.has(id); i++) id = slug(name + '_' + v.holder.split(' ')[0]) + i;
          d.accounts.push({ id, name, holder: v.holder.trim(), title: v.title || `${name} (${v.holder.trim()})`, ...(v.wallet ? { wallet: true } : {}) });
          if (v.opening) {
            const cat = CAT.add(d, { name: 'Opening balance', kind: 'transfer' });
            d.ledger.push({ id: Math.max(0, ...d.ledger.map((e) => e.id || 0)) + 1, acct: id, date: v.openingDate || C.todayISO(), desc: 'Opening balance', debit: v.opening < 0 ? -v.opening : 0, credit: v.opening > 0 ? v.opening : 0, category: cat });
          }
        } else { const auto = !acct.title || acct.title === `${acct.name} (${acct.holder})`; Object.assign(d.accounts.find((x) => x.id === acct.id), { name, holder: v.holder.trim(), title: auto && (!v.title || v.title === acct.title) ? `${name} (${v.holder.trim()})` : v.title || `${name} (${v.holder.trim()})` }); const t = d.accounts.find((x) => x.id === acct.id); if (v.wallet) t.wallet = true; else delete t.wallet; }
      });
      toast(isNew ? 'Account added' : 'Account updated');
    },
    onDelete: isNew ? null : () => {
      if (data.ledger.some((e) => e.acct === acct.id)) { toast('This account has transactions, so it cannot be deleted.', 'bad'); return false; }
      mutate((d) => { d.accounts = d.accounts.filter((x) => x.id !== acct.id); });
    },
  });
}
function accounts() {
  const { all, data } = S;
  const wrap = h('div');
  wrap.append(section('Bank accounts & cash',
    table([
      { label: 'Account', host: true, render: (b) => h('span', { class: 'name-edit' }, h('span', { class: 'ne-name' }, `${b.name} · ${b.holder}`), canEdit() ? h('button', { class: 'pencil', title: 'Edit account', 'aria-label': 'Edit ' + b.name, onclick: (e) => { e.stopPropagation(); accountForm(data.accounts.find((x) => x.id === b.id)); } }, icon('edit')) : null) },
      { label: 'Balance', cls: 'r', get: (b) => money(b.balance), total: () => money(all.cashTotal) },
      { label: 'Last entry', mob: 'under', mlabel: 'last ', get: (b) => dateStr(b.lastDate) },
    ], all.banks, { footer: { label: 'Total cash' }, mobile: {
      key: 'banks', head: 'Account', midHead: 'Last entry',
      first: (b) => ({ title: b.name, sub: b.holder, extra: null }),
      mid: (b) => (b.lastDate ? dateStr(b.lastDate) : null),
      views: [{ label: 'Balance', main: (b) => h('span', { class: 'name-edit' }, money(b.balance), canEdit() ? h('button', { class: 'pencil', title: 'Edit account', 'aria-label': 'Edit ' + b.name, onclick: (e) => { e.stopPropagation(); accountForm(data.accounts.find((x) => x.id === b.id)); } }, icon('edit')) : null), sub: null, total: () => ({ main: money(all.cashTotal) }) }] }, onRow: (b) => openLedger({ acct: b.id }) }),
    canEdit() ? [btn('Add account', () => accountForm())] : null));
  wrap.append(h('p', { class: 'note' }, 'Tap an account to see its transactions. Balances come from the transactions, so to correct a balance add or edit a transaction.'));
  return wrap;
}

// ----- ledger -----
const NEW = '__new__';
/** Category choices: money received shows income categories only, money paid out shows expenses (and investments). */
function categoryOptions(data, direction, current) {
  const list = CAT.categoryList(data).filter((c) => c.name.toLowerCase() !== 'transfer' || (current || '').toLowerCase() === 'transfer');
  const names = (arr) => arr.map((c) => c.name).sort((a, b) => a.localeCompare(b));
  const keep = (c) => c.name === current;
  const opts = [];
  if (direction === 'credit') opts.push({ group: 'Income', options: names(list.filter((c) => c.kind === 'income' || keep(c))) });
  else {
    opts.push({ group: 'Expenses', options: names(list.filter((c) => c.kind === 'expense' || (keep(c) && c.kind !== 'investment'))) });
    const inv = list.filter((c) => c.kind === 'investment' || (keep(c) && c.kind === 'investment'));
    if (inv.length) opts.push({ group: 'Money put into investments', options: names(inv) });
  }
  opts.push({ group: 'Between my own accounts', options: [{ value: 'Transfer', label: 'Transfer (money moved between my own accounts)' }] });
  opts.push({ group: 'Not in the list', options: [{ value: NEW, label: '+ New category…' }] });
  return opts;
}

/** Move money between two of your own accounts: one account is debited, the other credited. Both rows share a transferId. */
export function transferForm(entry) {
  const { data } = S;
  const accts = data.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.holder}` }));
  const isNew = !entry;
  let pair = [];
  if (entry) pair = data.ledger.filter((e) => e.transferId && e.transferId === entry.transferId);
  const out = pair.find((e) => e.debit > 0), inn = pair.find((e) => e.credit > 0);
  const base = entry && out && inn ? { from: out.acct, to: inn.acct, date: out.date, amount: out.debit, note: (out.note || '') } : { from: accts[0].value, to: (accts[1] || accts[0]).value, date: C.todayISO(), amount: '', note: '' };
  formDialog({
    title: isNew ? 'Transfer between accounts' : 'Edit transfer', value: base, saveLabel: isNew ? 'Transfer' : 'Save',
    deleteMessage: 'Delete this transfer? Both the debit and the credit entries are removed.',
    fields: [
      { key: 'from', label: 'From account (debited)', type: 'select', options: accts, required: true },
      { key: 'to', label: 'To account (credited)', type: 'select', options: accts, required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { key: 'note', label: 'Note (optional)', type: 'text' },
    ],
    onSave: (v) => {
      if (v.from === v.to) { toast('Pick two different accounts.', 'bad'); return false; }
      if (!(v.amount > 0)) { toast('Enter an amount above zero.', 'bad'); return false; }
      const name = (id) => { const a = data.accounts.find((x) => x.id === id); return a ? a.name : id; };
      mutate((d) => {
        const cat = CAT.add(d, { name: 'Transfer', kind: 'transfer' });
        const tid = (entry && entry.transferId) || 'tr' + Date.now().toString(36);
        d.ledger = d.ledger.filter((e) => !(e.transferId && e.transferId === tid));
        let id = Math.max(0, ...d.ledger.map((e) => e.id || 0));
        const note = v.note ? ' · ' + v.note : '';
        d.ledger.push({ id: ++id, acct: v.from, date: v.date, desc: `Transfer to ${name(v.to)}${note}`, debit: v.amount, credit: 0, category: cat, transferId: tid, note: v.note || '' });
        d.ledger.push({ id: ++id, acct: v.to, date: v.date, desc: `Transfer from ${name(v.from)}${note}`, debit: 0, credit: v.amount, category: cat, transferId: tid, note: v.note || '' });
      });
      toast(isNew ? 'Transfer recorded' : 'Transfer updated');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.ledger = d.ledger.filter((e) => !(e.transferId && e.transferId === entry.transferId)); }),
  });
}

/**
 * Split one bank entry into several. Date and account stay as they are; each row has its own description, category and amount. The rows must add up to the original amount
 * (one row can be left empty to take whatever is left). On Split the original entry is replaced by the new ones, in the same place.
 */
export function splitForm(entry) {
  const { data } = S;
  const kind = entry.credit > 0 ? 'credit' : 'debit', total = kind === 'credit' ? entry.credit : entry.debit;
  const acct = data.accounts.find((a) => a.id === entry.acct);
  const known = new Map(data.categories.map((c) => [c.desc.toLowerCase(), c.category]));
  const listId = datalistId('desc-list', data.categories.map((c) => c.desc));
  // categories you can split into: not transfers (they need two sides) and not a new category (add it first from Edit)
  const opts = categoryOptions(data, kind, entry.category).filter((g) => !g.group || !['Between my own accounts', 'Not in the list'].includes(g.group));
  const rows = [{ desc: entry.desc || '', category: entry.category || '', amount: String(total) }, { desc: '', category: '', amount: '' }];
  const list = h('div'), left = h('p', { class: 'summary-line', role: 'status' }), err = h('p', { class: 'form-error', role: 'alert' });
  const amt = (r) => (r.amount === '' || r.amount == null ? null : Number(r.amount));
  const leftOver = () => Math.round((total - rows.reduce((a, r) => a + (amt(r) || 0), 0)) * 100) / 100;
  const showLeft = () => {
    const l = leftOver(), blank = rows.filter((r) => amt(r) == null).length;
    left.replaceChildren(blank === 1 && l > 0.004 ? h('span', { class: 'muted' }, `The empty amount takes the rest: ${money(l)}`)
      : Math.abs(l) < 0.005 ? h('span', { class: 'pos' }, '✓ The rows add up to ' + money(total))
        : h('span', { class: l > 0 ? 'warn' : 'neg' }, (l > 0 ? 'Left to assign: ' : 'Over by: ') + money(Math.abs(l))));
  };
  const draw = () => {
    list.replaceChildren(...rows.map((r, i) => {
      const desc = h('input', { type: 'text', value: r.desc, list: listId, placeholder: 'Description', 'aria-label': `Row ${i + 1} description`, style: { flex: '2 1 11em', minWidth: '0' }, oninput: (e) => { r.desc = e.target.value; const c = known.get(r.desc.trim().toLowerCase()); if (c && [...cat.options].some((o) => o.value === c)) { cat.value = c; r.category = c; } } });
      const cat = h('select', { 'aria-label': `Row ${i + 1} category`, style: { flex: '2 1 10em', minWidth: '0' }, onchange: (e) => { r.category = e.target.value; } });
      setOptions(cat, [{ value: '', label: 'Category…' }, ...opts], r.category);
      const amount = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: r.amount, placeholder: 'Amount ₹', 'aria-label': `Row ${i + 1} amount`, style: { flex: '1 1 6em', minWidth: '0' }, oninput: (e) => { r.amount = e.target.value; showLeft(); } });
      const rm = rows.length > 2 ? h('button', { class: 'icon', type: 'button', 'aria-label': `Remove row ${i + 1}`, title: 'Remove this row', onclick: () => { rows.splice(i, 1); draw(); } }, '✕') : null;
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line-2)' } }, desc, cat, amount, rm);
    }));
    showLeft();
  };
  const save = (close) => {
    err.textContent = '';
    const blanks = rows.filter((r) => amt(r) == null);
    if (blanks.length > 1) { err.textContent = 'Only one row can have an empty amount.'; return; }
    const l = leftOver();
    if (blanks.length === 1) { if (!(l > 0.004)) { err.textContent = 'Nothing is left for the empty row. Enter its amount or remove the row.'; return; } blanks[0].amount = String(l); }
    for (const [i, r] of rows.entries()) {
      if (!r.desc.trim()) { err.textContent = `Row ${i + 1} needs a description.`; return; }
      if (!r.category) { err.textContent = `Row ${i + 1} needs a category.`; return; }
      if (!(amt(r) > 0)) { err.textContent = `Row ${i + 1} needs an amount above zero.`; return; }
    }
    if (Math.abs(leftOver()) >= 0.005) { err.textContent = `The rows add up to ${money(total - leftOver())}, not ${money(total)}.`; showLeft(); return; }
    mutate((d) => {
      const at = d.ledger.findIndex((e) => e.id === entry.id);
      if (at < 0) return;
      const orig = d.ledger[at];
      let id = Math.max(0, ...d.ledger.map((e) => e.id || 0));
      const parts = rows.map((r) => ({ ...orig, id: ++id, desc: r.desc.trim(), category: r.category, debit: kind === 'debit' ? amt(r) : 0, credit: kind === 'credit' ? amt(r) : 0 }));
      d.ledger.splice(at, 1, ...parts);
      for (const r of rows) if (!d.categories.some((c) => c.desc.toLowerCase() === r.desc.trim().toLowerCase())) d.categories.push({ desc: r.desc.trim(), category: r.category, type: kind === 'credit' ? 'Income' : 'Expense' });
    });
    toast(`Split into ${rows.length} entries`);
    close();
  };
  draw();
  const body = h('div', null,
    h('p', { class: 'note', style: { marginTop: 0 } }, `${dateStr(entry.date)} · ${acct ? acct.name + ' · ' + acct.holder : ''} · ${kind === 'credit' ? 'Received' : 'Paid out'} `, h('b', null, money(total)), ` · ${entry.desc || ''}`),
    h('p', { class: 'note' }, 'Date and account stay the same. Give each part its description, category and amount. The parts must add up to the original amount; leave one amount empty to give it what is left.'),
    list, h('div', { style: { margin: '8px 0' } }, btn('Add row', () => { const l = leftOver(); rows.push({ desc: '', category: '', amount: l > 0.004 && rows.every((r) => amt(r) != null) ? String(l) : '' }); draw(); })), left, err);
  dialog('Split transaction', body, [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Split', class: 'primary', onclick: save }]);
}

export function txnForm(entry, preset) {
  if (entry && entry.transferId) return transferForm(entry);
  const { data } = S;
  const accts = data.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.holder}` }));
  const known = new Map(data.categories.map((c) => [c.desc.toLowerCase(), c.category]));
  const isNew = !entry;
  const base = entry ? { ...entry, kind: entry.credit > 0 ? 'credit' : 'debit', amount: entry.credit > 0 ? entry.credit : entry.debit } : { acct: fAcct !== 'all' ? fAcct : accts[0].value, date: C.todayISO(), kind: (preset && preset.kind) || 'debit' };
  const descListId = 'desc-list';
  let dl = document.getElementById(descListId);
  if (!dl) { dl = h('datalist', { id: descListId }); document.body.append(dl); }
  dl.replaceChildren(...[...new Set(data.categories.map((c) => c.desc))].map((d) => h('option', { value: d })));
  formDialog({ focus: 'amount',
    title: !isNew ? 'Edit transaction' : preset && preset.title ? preset.title : 'Add transaction', value: base, saveLabel: isNew ? 'Add' : 'Save',
    fields: [
      { key: 'acct', label: 'Account', type: 'select', options: accts, required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'kind', label: 'Money', type: 'select', options: [{ value: 'debit', label: 'Paid out (expense)' }, { value: 'credit', label: 'Received (income)' }],
        onInput: (el, inputs) => setOptions(inputs.category, categoryOptions(data, el.value), '') },
      { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { key: 'desc', label: 'Description', type: 'text', required: true, list: descListId, hint: 'Pick a known description to fill the category automatically.',
        onInput: (el, inputs) => { const c = known.get(el.value.trim().toLowerCase()); if (c && [...inputs.category.options].some((o) => o.value === c)) inputs.category.value = c; } },
      { key: 'category', label: 'Category', type: 'select', options: categoryOptions(data, base.kind, base.category), required: true },
      { key: 'newCategory', label: 'Name of the new category', type: 'text', required: true, showIf: (v) => v.category === NEW, hint: 'It is added to your categories and can be changed later under Expenses → Categories.' },
      { key: 'newKind', label: 'This category is', type: 'select', default: 'expense', showIf: (v) => v.category === NEW && v.kind === 'debit',
        options: [{ value: 'expense', label: 'Expense' }, { value: 'investment', label: 'Investment (not an expense)' }] },
    ],
    onSave: (v) => {
      mutate((d) => {
        let category = v.category;
        if (category === NEW) category = CAT.add(d, { name: v.newCategory, kind: v.kind === 'credit' ? 'income' : (v.newKind || 'expense') });
        else if (String(category).toLowerCase() === 'transfer') category = CAT.add(d, { name: 'Transfer', kind: 'transfer' });
        const rec = { acct: v.acct, date: v.date, desc: v.desc, debit: v.kind === 'debit' ? v.amount : 0, credit: v.kind === 'credit' ? v.amount : 0, category };
        if (isNew) d.ledger.push({ id: Math.max(0, ...d.ledger.map((e) => e.id || 0)) + 1, ...rec });
        else Object.assign(d.ledger.find((e) => e.id === entry.id), rec);
        // remember new descriptions so the next entry fills in automatically
        if (!d.categories.some((c) => c.desc.toLowerCase() === v.desc.toLowerCase())) d.categories.push({ desc: v.desc, category, type: v.kind === 'credit' ? 'Income' : 'Expense' });
      });
      toast(isNew ? 'Transaction added' : 'Transaction updated');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.ledger = d.ledger.filter((e) => e.id !== entry.id); }),
    extraActions: isNew || !canEdit() || !(base.amount > 0) ? [] : [{ label: 'Split', onclick: () => splitForm(entry) }],
  });
}

function ledger() {
  const { data } = S;
  if (fMonth === null) fMonth = C.monthKey(S.all.asOf); // first visit: this month
  const kindOfCat = CAT.kindOf(data);
  const wrap = h('div');
  const months = [...new Set(data.ledger.map((e) => C.monthKey(e.date)))].sort().reverse();
  const bar = h('div', { class: 'filters' },
    h('select', { 'aria-label': 'Account', onchange: (e) => { fAcct = e.target.value; limit = 60; rerender(); } },
      h('option', { value: 'all' }, 'All accounts'), data.accounts.map((a) => h('option', { value: a.id, selected: a.id === fAcct }, `${a.name} · ${a.holder}`))),
    h('select', { 'aria-label': 'Month', onchange: (e) => { fMonth = e.target.value; limit = 60; rerender(); } },
      h('option', { value: 'all', selected: fMonth === 'all' }, 'All months'), h('optgroup', { label: 'Periods' }, PERIODS(S.all.asOf).map(([v, l]) => h('option', { value: v, selected: fMonth === v }, l))), monthOptions(months, fMonth, monthLabel)),
    h('input', { type: 'search', placeholder: 'Search description or category', value: fText, 'aria-label': 'Search', oninput: (e) => { fText = e.target.value; clearTimeout(window.__ft); window.__ft = setTimeout(() => { limit = 60; rerender(); const i = document.querySelector('input[type=search]'); i && (i.focus(), i.setSelectionRange(fText.length, fText.length)); }, 250); } }));
  // running balance per account
  const bal = new Map();
  const sorted = data.ledger.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id || 0) - (b.id || 0)));
  const withBal = sorted.map((e) => { const b = (bal.get(e.acct) || 0) + (e.credit || 0) - (e.debit || 0); bal.set(e.acct, b); return { ...e, balance: b }; });
  const q = fText.toLowerCase();
  const inKind = (e) => fKind === 'all' || (fKind === 'income' ? kindOfCat(e.category) === 'income' && e.credit > 0 : kindOfCat(e.category) === fKind && e.debit > 0);
  const amtOf = (e) => (e.credit > 0 ? e.credit : e.debit) || 0, lim = Number(fAmtVal);
  const amtOk = (e) => fAmtOp === 'any' || fAmtVal === '' || Number.isNaN(lim) || (fAmtOp === 'gt' ? amtOf(e) > lim : amtOf(e) < lim);
  let rows = withBal.filter((e) => (fAcct === 'all' || e.acct === fAcct) && inPeriod(fMonth, e.date, S.all.asOf) && inKind(e) && (fCat === 'all' || e.category === fCat) && amtOk(e) && (!q || (e.desc + ' ' + e.category).toLowerCase().includes(q)));
  rows.reverse();   // newest first
  if (fSort !== 'date' || fDir !== 'desc') {
    const key = (e) => (fSort === 'amount' ? amtOf(e) : fSort === 'category' ? String(e.category || '').toLowerCase() : fSort === 'desc' ? String(e.desc || '').toLowerCase() : e.date);
    const sign = fDir === 'asc' ? 1 : -1;
    rows = rows.map((e, i) => ({ e, i, k: key(e) })).sort((a, b) => (typeof a.k === 'string' ? sign * a.k.localeCompare(b.k) : sign * (a.k - b.k)) || a.i - b.i).map((o) => o.e);
  }
  const cats = [...new Set(data.ledger.map((e) => e.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const reset = () => { limit = 60; rerender(); };
  const bar2 = h('div', { class: 'filters' },
    h('select', { 'aria-label': 'Category', onchange: (e) => { fCat = e.target.value; reset(); } }, h('option', { value: 'all' }, 'Category: all'), cats.map((c) => h('option', { value: c, selected: c === fCat }, c))),
    h('select', { 'aria-label': 'Amount filter', onchange: (e) => { fAmtOp = e.target.value; reset(); } }, [['any', 'Amount: any'], ['gt', 'Amount greater than'], ['lt', 'Amount less than']].map(([v, l]) => h('option', { value: v, selected: v === fAmtOp }, l))),
    fAmtOp !== 'any' ? h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '₹ amount', value: fAmtVal, 'aria-label': 'Amount', style: { maxWidth: '9em' }, onchange: (e) => { fAmtVal = e.target.value; reset(); } }) : null,
    h('select', { 'aria-label': 'Sort by', onchange: (e) => { fSort = e.target.value; fDir = fSort === 'category' || fSort === 'desc' ? 'asc' : 'desc'; reset(); } }, [['date', 'Sort: Date'], ['amount', 'Sort: Amount'], ['category', 'Sort: Category'], ['desc', 'Sort: Description']].map(([v, l]) => h('option', { value: v, selected: v === fSort }, l))),
    h('select', { 'aria-label': 'Sort direction', onchange: (e) => { fDir = e.target.value; reset(); } }, [['desc', 'Descending'], ['asc', 'Ascending']].map(([v, l]) => h('option', { value: v, selected: v === fDir }, l))),
    fCat !== 'all' || fAmtOp !== 'any' || fSort !== 'date' || fDir !== 'desc' ? btn('Clear', () => { fCat = 'all'; fAmtOp = 'any'; fAmtVal = ''; fSort = 'date'; fDir = 'desc'; reset(); }) : null);
  const total = rows.length, credit = rows.reduce((a, e) => a + (e.credit || 0), 0), debit = rows.reduce((a, e) => a + (e.debit || 0), 0);
  const acctName = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
  const KINDS = [['all', 'All'], ['expense', 'Expenses'], ['investment', 'Investments'], ['income', 'Income']];
  const seg = h('nav', { class: 'seg', 'aria-label': 'Show' }, KINDS.map(([k, l]) => h('a', { href: 'javascript:void 0', class: k === fKind ? 'on' : '', 'aria-selected': String(k === fKind), onclick: (e) => { e.preventDefault(); fKind = k; limit = 60; rerender(); } }, l)));
  const tone = (e) => { const k = kindOfCat(e.category); return e.credit ? 'pos' : k === 'investment' ? 'inv' : k === 'expense' ? 'neg' : ''; };
  const tbl = table([
    { label: 'Date · account', render: (e) => h('div', null, h('div', { class: 'nm' }, dateStr(e.date)), h('div', { class: 'sub2' }, acctName.get(e.acct) || '')) },
    { label: 'Description · category', render: (e) => h('div', null, h('div', { class: 'nm' }, e.desc), h('div', { class: 'sub2 ' + (kindOfCat(e.category) === 'investment' ? 'inv' : kindOfCat(e.category) === 'expense' ? 'neg' : kindOfCat(e.category) === 'income' ? 'pos' : '') }, e.category || 'No category')) },
    { label: 'Amount', cls: 'r only-lg', render: (e) => h('span', { class: 'b ' + tone(e) }, e.credit ? '+ ' + money(e.credit) : '− ' + money(e.debit)) },
    { label: 'Balance', cls: 'r only-lg', get: (e) => money(e.balance) },
    { label: 'Amount · balance', cls: 'r only-sm', render: (e) => h('div', null, h('div', { class: 'b ' + tone(e) }, (e.credit ? '+ ' + money(e.credit) : '− ' + money(e.debit))), h('div', { class: 'sub2' }, 'bal ' + money(e.balance))) },
  ], rows.slice(0, limit), { mobile: {
    key: 'txns', head: 'Description',
    first: (e) => ({ title: e.desc, sub: h('span', null, dateStr(e.date), ' · ', h('span', { class: kindOfCat(e.category) === 'investment' ? 'inv' : kindOfCat(e.category) === 'expense' ? 'neg' : kindOfCat(e.category) === 'income' ? 'pos' : '' }, e.category || 'No category')) }),
    views: [
      { label: 'Amount · Balance', main: (e) => h('span', { class: tone(e) }, e.credit ? '+ ' + money(e.credit) : '− ' + money(e.debit)), sub: (e) => 'bal ' + money(e.balance) },
      { label: 'Amount · Account', main: (e) => h('span', { class: tone(e) }, e.credit ? '+ ' + money(e.credit) : '− ' + money(e.debit)), sub: (e) => acctName.get(e.acct) || '' },
    ] }, onRow: canEdit() ? (e) => txnForm(data.ledger.find((x) => x.id === e.id)) : null, empty: 'No transactions match these filters.' });
  const t0 = tbl.querySelector('table'); if (t0) t0.classList.add('compact');
  const label = fKind === 'income' ? 'received' : fKind === 'all' ? 'paid out' : 'paid out';
  wrap.append(section('Transactions',
    h('div', null, h('div', { class: 'filters' }, seg), bar, bar2,
      h('p', { class: 'summary-line' }, `${num(total)} entries`, fKind === 'all' || fKind === 'income' ? [' · received ', h('b', { class: 'pos' }, money(credit))] : null, fKind !== 'income' ? [' · ' + (fKind === 'all' ? 'paid out ' : fKind === 'investment' ? 'invested ' : 'spent '), h('b', { class: fKind === 'investment' ? 'inv' : fKind === 'expense' ? 'neg' : '' }, money(debit))] : null),
      tbl,
      total > limit ? btn(`Show more (${total - limit} left)`, () => { limit += 100; rerender(); }, 'wide') : null),
    null));
  return wrap;
}

// ----- savings & chits -----
const BASE_TYPES = ['Chit', 'EPF', 'PPF', 'LIC', 'RD'];
const NEWTYPE = '__new__';
const typeList = (data) => [...BASE_TYPES, ...(data.savingTypes || []).filter((t) => !BASE_TYPES.includes(t))];
function savingForm(sv) {
  const isNew = !sv;
  const { data } = S;
  formDialog({
    title: isNew ? 'Add savings account' : 'Edit ' + sv.name, value: sv ? { ...sv, tenureUnit: sv.tenureType } : { type: 'Chit', compound: 'Monthly', tenureUnit: 'Months', holder: 'Kalidass' },
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'type', label: 'Type', type: 'select', options: [...typeList(data).map((t) => ({ value: t, label: t })), { value: NEWTYPE, label: '+ New type…' }] },
      { key: 'newType', label: 'Name of the new type', type: 'text', required: true, showIf: (v) => v.type === NEWTYPE, hint: 'For example Post office, NSC, Sukanya, Gold savings. It appears in the type list from now on.' },
      { key: 'holder', label: 'Account holder', required: true },
      { key: 'organiser', label: 'Organiser / company (optional)', list: datalistId('org-list', data.savings.map((x) => x.organiser)), hint: 'Who runs the chit, or the insurer or bank. Only used to group things for your risk limits. Leave empty and the app works it out from the name.', showIf: (v) => v.type !== 'EPF' && v.type !== 'PPF' },
      { key: 'rate', label: 'Assumed yearly rate (e.g. 0.0825 = 8.25%)', type: 'number', required: true, hint: 'Only used for the interest-per-day figure. The real return of a chit is the XIRR, worked out from your payments.' },
      { key: 'depositDate', label: 'Start date', type: 'date' }, { key: 'maturityDate', label: 'Maturity date', type: 'date' },
      { key: 'tenure', label: 'Tenure', type: 'number', half: true, hint: 'For a chit, Home stops counting it as a pending payment once this many months of payments are in.' }, { key: 'tenureUnit', label: 'Tenure unit', type: 'select', options: ['Months', 'Years', 'Days'], half: true },
      { key: 'payout', label: 'Expected payout at the end (₹, optional)', type: 'number', showIf: (v) => v.type === 'Chit' || v.type === 'RD', hint: 'The amount you expect to receive. Leave it empty to project it from the assumed yearly rate. It gives an estimated XIRR while the chit runs. Close the chit with the real amount to get the actual XIRR.' },
      { key: 'nextPayment', label: 'Monthly payment for the remaining months (₹, optional)', type: 'number', showIf: (v) => v.type === 'Chit' || v.type === 'RD', hint: 'What you expect to pay each month from now to the end. Used for the estimated XIRR and the projected payout. Leave empty to assume the average paid so far.' },
      { key: 'desc', label: 'Notes / who to contact', type: 'textarea' },
    ],
    onSave: (v) => mutate((d) => {
      const rec = { ...v }; rec.tenureType = rec.tenureUnit; delete rec.tenureUnit;
      if (rec.type === NEWTYPE) { rec.type = rec.newType; d.savingTypes = [...new Set([...(d.savingTypes || []), rec.type])]; }
      delete rec.newType;
      const blank = (k) => !(Number(rec[k]) > 0); const clear = ['payout', 'nextPayment'].filter(blank); clear.forEach((k) => delete rec[k]);
      rec.organiser = String(rec.organiser || '').trim(); if (!rec.organiser) delete rec.organiser;
      if (isNew) d.savings.push({ id: nextId('sv', d.savings), entries: [], compound: 'Monthly', ...rec }); else { const t = d.savings.find((x) => x.id === sv.id); Object.assign(t, rec); clear.forEach((k) => delete t[k]); if (!rec.organiser) delete t.organiser; }
    }),
    onDelete: isNew ? null : () => mutate((d) => { d.savings = d.savings.filter((x) => x.id !== sv.id); }),
    deleteMessage: 'Delete this account and all its entries? Use “Close it” instead to keep a history.',
  });
}
function entryForm(sv, idx) {
  const isEpf = sv.type === 'EPF';
  const isNew = idx == null;
  const e = isNew ? { date: C.todayISO(), kind: 'DEPOSIT' } : sv.entries[idx];
  formDialog({
    title: (isNew ? 'Add to ' : 'Edit entry in ') + sv.name, value: e,
    fields: isEpf ? [
      { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'kind', label: 'Kind', type: 'select', options: ['DEPOSIT', 'INTEREST', 'WITHDRAWAL'] },
      { key: 'employee', label: 'Employee share', type: 'number' }, { key: 'employer', label: 'Employer share', type: 'number' }, { key: 'pension', label: 'Pension fund (not counted)', type: 'number' },
    ] : [
      { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'amount', label: 'Amount (₹)', type: 'number', required: true }, { key: 'remarks', label: 'Remarks', type: 'text' },
    ],
    onSave: (v) => mutate((d) => {
      const s = d.savings.find((x) => x.id === sv.id);
      const rec = isEpf ? { ...v, employee: v.employee || 0, employer: v.employer || 0, pension: v.pension || 0 } : { ...v, remarks: v.remarks || undefined };
      if (isNew) s.entries.push(rec); else s.entries[idx] = rec;
      s.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
    }),
    onDelete: isNew ? null : () => mutate((d) => { d.savings.find((x) => x.id === sv.id).entries.splice(idx, 1); }),
  });
}
/** This month's and next month's chit payments as two cards. Tap a card for the total per organiser / company. */
function chitDueCards(data) {
  const cur = C.monthKey(S.all.asOf), cc = chitCards(data, cur);
  if (!cc.thisMonth.length && !cc.proj.length) return null;
  const who = (g, sub) => ({ title: g.org, sub: `${g.count} chit${g.count === 1 ? '' : 's'}${sub ? ' · ' + sub(g) : ''}`, value: money(g.amount) });
  const thisPop = () => {
    let tab = 'due';
    const body = h('div'), seg = () => h('nav', { class: 'seg', 'aria-label': 'Due or paid' }, [['due', `Still to pay (${money(cc.dueTotal)})`], ['paid', `Paid (${money(cc.paidTotal)})`]].map(([k, l]) => h('a', { href: 'javascript:void 0', class: tab === k ? 'on' : '', 'aria-selected': String(tab === k), onclick: (e) => { e.preventDefault(); tab = k; draw(); } }, l)));
    const draw = () => {
      const groups = (tab === 'due' ? cc.dueByOrg : cc.paidByOrg).filter((g) => g.amount > 0.5);
      body.replaceChildren(seg(), groups.length ? rowList(groups.map((g) => who(g, (x) => x.items.filter((i) => (tab === 'due' ? i.due : i.paid) > 0.5).map((i) => i.name).join(', ')))) : h('p', { class: 'empty' }, tab === 'due' ? 'Every chit is paid for this month.' : 'No chit has been paid yet this month.'),
        h('p', { class: 'note' }, 'Grouped by Organiser / company (set on each chit). A chit counts as paid once anything is paid into it this month. “Still to pay” is what it took last month.'));
    };
    draw(); dialog('Chits, ' + monthLabel(cur, true), body, [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
  };
  const nextPop = () => dialog('Chits next month, ' + monthLabel(cc.next, true), h('div', null,
    cc.projByOrg.length ? rowList(cc.projByOrg.map((g) => ({ ...who(g, (x) => x.items.map((i) => i.name).join(', ')), value: h('i', null, money(g.amount) + '*') }))) : h('p', { class: 'empty' }, 'No chit is running next month.'),
    h('p', { class: 'note' }, '* Projected, not fixed: each chit is taken as the average of its last three payments, because the amount changes every month. Chits that finish before then are left out. Grouped by Organiser / company.')), [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
  const card = (label, val, sub, cls, onClick) => h('div', { class: 'stat tappable', role: 'button', tabindex: '0', onclick: onClick, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value ' + (cls || '') }, val), h('span', { class: 'stat-sub' }, sub));
  return h('div', { class: 'stats', style: { marginBottom: '12px' } },
    card('Chits due this month', money(cc.dueTotal), cc.dueTotal < 0.5 ? `all paid · ${money(cc.paidTotal)} paid this month · tap for details` : `${money(cc.paidTotal)} paid so far · tap for details`, cc.dueTotal > 0.5 ? 'warn' : 'pos', thisPop),
    card('Chits due next month *', h('i', null, money(cc.projTotal) + '*'), `* projected from the last 3 payments · ${cc.proj.length} chit${cc.proj.length === 1 ? '' : 's'} · tap for details`, '', nextPop));
}
export function savingsTab(only) {
  const { all } = S;
  const wrap = h('div');
  const known = ['Chit', 'EPF', 'PPF', 'LIC', 'RD'];
  const groups = [['Chits', 'Chit'], ['Provident fund', ['EPF', 'PPF']], ['Insurance', 'LIC'], ['Recurring deposits', 'RD'], ['Other savings', all.savings.filter((s) => !known.includes(s.type)).map((s) => s.type)]];
  for (const [title, types] of groups) {
    if (only && only !== title) continue;
    const list = all.savings.filter((s) => [].concat(types).includes(s.type));
    if (title === 'Other savings' && !list.length) continue;
    if (title === 'Chits') { const cards = chitDueCards(S.data); if (cards) wrap.append(cards); }
    const withX = title === 'Chits' || title === 'Insurance' || title === 'Recurring deposits' || title === 'Other savings';
    wrap.append(section(title,
      table([
        { label: 'Name', host: true, get: (s) => s.name },
        { label: 'Holder', mob: 'under', get: (s) => s.holder },
        { label: 'Invested', cls: 'r', get: (s) => money(s.principal), total: (rs) => money(rs.reduce((a, s) => a + s.principal, 0)) },
        { label: 'Assumed rate', mob: 'under', mlabel: 'rate ', cls: 'r', get: (s) => (s.rate * 100).toFixed(2) + '%' },
        ...(withX ? [{ label: 'XIRR', mob: 'under', mlabel: 'XIRR ', cls: 'r', render: xirrCell }] : []),
        { label: 'Interest / day', cls: 'r', get: (s) => money(s.daily), total: (rs) => money(rs.reduce((a, s) => a + s.daily, 0)) },
        { label: 'Matures', mob: 'under', mlabel: 'matures ', get: (s) => dateStr(s.maturityDate) },
      ], list, { footer: { label: 'Total' }, mobile: {
        key: 'sav-' + title, head: 'Name', midHead: 'Matures',
        first: (s) => ({ title: s.name, sub: s.holder }),
        mid: (s) => (s.maturityDate ? dateStr(s.maturityDate) : null),
        views: [
          { label: 'Invested · Rate', main: (s) => money(s.principal), sub: (s) => 'rate ' + (s.rate * 100).toFixed(2) + '%', total: (rs) => ({ main: money(rs.reduce((a, s) => a + s.principal, 0)) }) },
          { label: withX ? 'XIRR · Per day' : 'Per day', main: (s) => (withX ? xirrCell(s) : money(s.daily)), sub: (s) => (withX ? money(s.daily) + ' a day' : null), total: (rs) => ({ main: money(rs.reduce((a, s) => a + s.daily, 0)) + ' a day' }) },
        ] }, onRow: openSaving, empty: 'No accounts of this kind.' }),
      canEdit() ? [btn('Add savings account', () => savingForm())] : null));
    if (title === 'Chits') wrap.append(h('p', { class: 'note' }, 'For a running chit the XIRR (marked ≈) is an estimate: it uses the “Expected payout” if you entered one, otherwise the assumed yearly rate. When the chit ends, press “Close it”, enter the date you received the money and the amount you actually got after commission, and the real XIRR appears here and under Closed.'));
  }
  return wrap;
}
const xirrCell = (s) => (s.xirr == null ? h('span', { class: 'muted' }, '–') : h('span', { class: posNeg(s.xirr), title: s.xirrKind !== 'estimate' ? 'Actual, from the closing amount' : s.xirrBasis === 'rate' ? 'Estimate: the assumed yearly rate (no expected payout entered)' : 'Estimate from your expected payout' }, (s.xirrKind === 'estimate' ? '≈ ' : '') + pct(s.xirr, 1)));
function closeSaving(sv) {
  const paid = C.savingPrincipal(sv);
  closeForm({
    title: 'Close ' + sv.name, amount: Math.round(C.savingMaturity(sv).amount), desc: `${sv.type} closed: ${sv.name}`,
    dateLabel: 'Money received on', amountLabel: 'Amount you received, after commission (₹)',
    hint: 'Suggested: the expected payout if you entered one, otherwise a projection at the assumed rate. Change it to what actually reached you; the real XIRR is worked out from this date and amount.',
    apply: (d, v, lid) => { const t = d.savings.find((x) => x.id === sv.id); t.closed = { date: v.date, amount: v.amount, acct: v.acct || '', ledgerId: lid, note: v.note || '' }; },
  });
}
export function closedTab() {
  const { all, data } = S;
  const list = all.closed.savings.slice().sort((a, b) => (a.closed.date < b.closed.date ? 1 : -1));
  const acct = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
  const paid = list.reduce((a, s) => a + s.principal, 0), got = list.reduce((a, s) => a + s.closed.amount, 0);
  const wrap = h('div');
  wrap.append(h('div', { class: 'stats' }, stat('Closed accounts', String(list.length), 'chits, deposits and other savings'), stat('Paid in', money(paid), ''), stat('Received', money(got), h('span', { class: posNeg(got - paid) }, (got - paid >= 0 ? 'gain ' : 'loss ') + money(Math.abs(got - paid))))));
  wrap.append(section('Closed accounts', table([
    { label: 'Name', host: true, get: (s) => s.name }, { label: 'Type', mob: 'under', get: (s) => s.type }, { label: 'Holder', mob: 'under', get: (s) => s.holder },
    { label: 'Started', mob: 'hide', get: (s) => dateStr(s.depositDate || (s.entries[0] && s.entries[0].date)) }, { label: 'Closed', mob: 'under', mlabel: 'closed ', get: (s) => dateStr(s.closed.date) },
    { label: 'Paid in', cls: 'r', get: (s) => money(s.principal), total: () => money(paid) },
    { label: 'Received', cls: 'r', get: (s) => money(s.closed.amount), total: () => money(got) },
    { label: 'Gain', mob: 'under', mlabel: 'gain ', cls: 'r', render: (s) => h('span', { class: posNeg(s.closed.amount - s.principal) }, money(s.closed.amount - s.principal)), total: () => money(got - paid) },
    { label: 'XIRR', mob: 'under', mlabel: 'XIRR ', cls: 'r', render: xirrCell },
    { label: 'Money went to', mob: 'hide', get: (s) => (s.closed.acct ? acct.get(s.closed.acct) || '' : 'not added') },
  ], list, { footer: { label: 'Total' }, mobile: {
    key: 'sav-closed', head: 'Name',
    first: (s) => ({ title: s.name, sub: [s.type, s.holder, 'closed ' + dateStr(s.closed.date)].filter(Boolean).join(' · ') }),
    views: [
      { label: 'Paid in · Received', main: (s) => money(s.principal), sub: (s) => money(s.closed.amount), total: () => ({ main: money(paid), sub: money(got) }) },
      { label: 'Gain · XIRR', main: (s) => h('span', { class: posNeg(s.closed.amount - s.principal) }, money(s.closed.amount - s.principal)), sub: (s) => xirrCell(s), total: () => ({ main: money(got - paid) }) },
    ] }, onRow: (s) => openClosed(s), empty: 'Nothing closed yet. Open a chit on the Savings & chits tab and press “Close it” when it ends.' })));
  return wrap;
}
function openClosed(row) {
  const sv = S.data.savings.find((s) => s.id === row.id);
  const body = h('div', null, h('p', { class: 'note' }, `${sv.type} · ${sv.holder}. Closed on ${dateStr(sv.closed.date)}, received ${money(sv.closed.amount)}.${sv.closed.note ? ' ' + sv.closed.note : ''}`),
    table([{ label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Amount', cls: 'r', get: (e) => money(e.amount) }], sv.entries.slice().reverse(), { empty: 'No payments recorded.' }));
  dialog(sv.name, body, canEdit() ? [
    { label: 'Delete', class: 'danger', onclick: async (c) => { if (await confirmDialog('Delete this closed account and its history? The bank entry stays as it is.')) { mutate((d) => { d.savings = d.savings.filter((x) => x.id !== sv.id); }); c(); } } },
    { label: 'Reopen', onclick: (c) => { c(); reopen(sv.name, (d) => { const t = d.savings.find((x) => x.id === sv.id); const lid = t.closed && t.closed.ledgerId; delete t.closed; if (lid) d.ledger = d.ledger.filter((e) => e.id !== lid); }); } },
    { label: 'Close', onclick: (c) => c() },
  ] : [{ label: 'Close', onclick: (c) => c() }]);
}
function openSaving(row) {
  const sv = S.data.savings.find((s) => s.id === row.id);
  const isEpf = sv.type === 'EPF';
  const list = h('div');
  const draw = () => {
    const cur = S.data.savings.find((s) => s.id === sv.id);
    list.replaceChildren(table(
      isEpf ? [
        { label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Kind', get: (e) => e.kind },
        { label: 'Employee', cls: 'r', get: (e) => money(e.employee) }, { label: 'Employer', cls: 'r', get: (e) => money(e.employer) },
      ] : [
        { label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Amount', cls: 'r', get: (e) => money(e.amount) }, { label: 'Remarks', get: (e) => e.remarks || '' },
      ],
      cur.entries.map((e, i) => ({ ...e, _i: i })).reverse(), { onRow: canEdit() ? (e) => entryForm(cur, e._i) : null, empty: 'No entries yet.' }));
  };
  draw();
  const acts = canEdit() ? [
    { label: 'Edit account', onclick: (c) => { c(); savingForm(S.data.savings.find((s) => s.id === sv.id)); } },
    ...(sv.type !== 'EPF' && sv.type !== 'PPF' ? [{ label: 'Close it', onclick: (c) => { c(); closeSaving(S.data.savings.find((s) => s.id === sv.id)); } }] : []),
    { label: 'Add entry', class: 'primary', onclick: (c) => { c(); entryForm(S.data.savings.find((s) => s.id === sv.id)); } },
  ] : [];
  dialog(sv.name, h('div', null, h('p', { class: 'note' }, `${sv.type} · ${sv.holder} · balance ${money(row.principal)}`), sv.desc ? h('p', null, sv.desc) : null, list), acts);
}
