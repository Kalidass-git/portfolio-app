import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { h, money, dateStr, monthLabel, section, table, btn, formDialog, dialog, canEdit, toast, num, segTabs, subTab, setOptions } from '../ui.js';
import * as CAT from '../categories.js';
import { hbars } from '../charts.js';

let fAcct = 'all', fMonth = 'all', fText = '', limit = 60;
const TABS = [['accounts', 'Accounts'], ['ledger', 'Transactions'], ['savings', 'Savings & chits']];
/** Open the transactions list, optionally pre-filtered. Used by links from other screens. */
export function openLedger({ text = '', month = 'all', acct = 'all' } = {}) { fText = text; fMonth = month; fAcct = acct; limit = 60; location.hash = '#/cash/ledger'; }

export function render() {
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Cash views'), canEdit() && tab !== 'savings' ? h('span', { class: 'btn-row' }, btn('Transfer', () => transferForm()), btn('Add transaction', () => txnForm(), 'primary')) : null));
  root.append(tab === 'accounts' ? accounts() : tab === 'ledger' ? ledger() : savings());
  return root;
}
const rerender = () => window.dispatchEvent(new Event('rerender'));

// ----- accounts -----
function accounts() {
  const { all } = S;
  const wrap = h('div');
  wrap.append(section('Bank accounts & cash',
    table([
      { label: 'Account', get: (b) => `${b.name} · ${b.holder}` },
      { label: 'Balance', cls: 'r', get: (b) => money(b.balance), total: () => money(all.cashTotal) },
      { label: 'Last entry', get: (b) => dateStr(b.lastDate) },
    ], all.banks, { footer: { label: 'Total cash' }, onRow: (b) => openLedger({ acct: b.id }) }),
    null));
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
  formDialog({
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
        const rec = { acct: v.acct, date: v.date, desc: v.desc, debit: v.kind === 'debit' ? v.amount : 0, credit: v.kind === 'credit' ? v.amount : 0, category };
        if (isNew) d.ledger.push({ id: Math.max(0, ...d.ledger.map((e) => e.id || 0)) + 1, ...rec });
        else Object.assign(d.ledger.find((e) => e.id === entry.id), rec);
        // remember new descriptions so the next entry fills in automatically
        if (!d.categories.some((c) => c.desc.toLowerCase() === v.desc.toLowerCase())) d.categories.push({ desc: v.desc, category, type: v.kind === 'credit' ? 'Income' : 'Expense' });
      });
      toast(isNew ? 'Transaction added' : 'Transaction updated');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.ledger = d.ledger.filter((e) => e.id !== entry.id); }),
  });
}

function ledger() {
  const { data } = S;
  const wrap = h('div');
  const months = [...new Set(data.ledger.map((e) => C.monthKey(e.date)))].sort().reverse();
  const bar = h('div', { class: 'filters' },
    h('select', { 'aria-label': 'Account', onchange: (e) => { fAcct = e.target.value; limit = 60; rerender(); } },
      h('option', { value: 'all' }, 'All accounts'), data.accounts.map((a) => h('option', { value: a.id, selected: a.id === fAcct }, `${a.name} · ${a.holder}`))),
    h('select', { 'aria-label': 'Month', onchange: (e) => { fMonth = e.target.value; limit = 60; rerender(); } },
      h('option', { value: 'all' }, 'All months'), months.map((m) => h('option', { value: m, selected: m === fMonth }, monthLabel(m)))),
    h('input', { type: 'search', placeholder: 'Search description or category', value: fText, 'aria-label': 'Search', oninput: (e) => { fText = e.target.value; clearTimeout(window.__ft); window.__ft = setTimeout(() => { limit = 60; rerender(); const i = document.querySelector('input[type=search]'); i && (i.focus(), i.setSelectionRange(fText.length, fText.length)); }, 250); } }));
  // running balance per account
  const bal = new Map();
  const sorted = data.ledger.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id || 0) - (b.id || 0)));
  const withBal = sorted.map((e) => { const b = (bal.get(e.acct) || 0) + (e.credit || 0) - (e.debit || 0); bal.set(e.acct, b); return { ...e, balance: b }; });
  const q = fText.toLowerCase();
  let rows = withBal.filter((e) => (fAcct === 'all' || e.acct === fAcct) && (fMonth === 'all' || C.monthKey(e.date) === fMonth) && (!q || (e.desc + ' ' + e.category).toLowerCase().includes(q)));
  rows.reverse();
  const total = rows.length, credit = rows.reduce((a, e) => a + (e.credit || 0), 0), debit = rows.reduce((a, e) => a + (e.debit || 0), 0);
  const acctName = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
  wrap.append(section('Transactions',
    h('div', null, bar,
      h('p', { class: 'summary-line' }, `${num(total)} entries · received `, h('b', { class: 'pos' }, money(credit)), ' · paid out ', h('b', null, money(debit))),
      table([
        { label: 'Date', get: (e) => dateStr(e.date) },
        { label: 'Description', get: (e) => e.desc },
        { label: 'Category', get: (e) => e.category },
        { label: 'Account', get: (e) => acctName.get(e.acct) },
        { label: 'Out', cls: 'r', get: (e) => (e.debit ? money(e.debit) : '') },
        { label: 'In', cls: 'r', render: (e) => (e.credit ? h('span', { class: 'pos' }, money(e.credit)) : '') },
        { label: 'Balance', cls: 'r', get: (e) => money(e.balance) },
      ], rows.slice(0, limit), { onRow: canEdit() ? (e) => txnForm(data.ledger.find((x) => x.id === e.id)) : null, empty: 'No transactions match these filters.' }),
      total > limit ? btn(`Show more (${total - limit} left)`, () => { limit += 100; rerender(); }, 'wide') : null),
    null));
  return wrap;
}

// ----- savings & chits -----
const SAVING_TYPES = ['Chit', 'EPF', 'PPF', 'LIC', 'RD'];
function savingForm(sv) {
  const isNew = !sv;
  formDialog({
    title: isNew ? 'Add savings account' : 'Edit ' + sv.name, value: sv || { type: 'Chit', compound: 'Monthly', tenureType: 'Months', holder: 'Kalidass' },
    fields: [
      { key: 'name', label: 'Name', required: true }, { key: 'type', label: 'Type', type: 'select', options: SAVING_TYPES },
      { key: 'holder', label: 'Account holder', required: true }, { key: 'rate', label: 'Interest rate (e.g. 0.0825 = 8.25%)', type: 'number', required: true },
      { key: 'depositDate', label: 'Start date', type: 'date' }, { key: 'maturityDate', label: 'Maturity date', type: 'date' },
      { key: 'tenure', label: 'Tenure', type: 'number', half: true }, { key: 'tenureType', label: 'Tenure unit', type: 'select', options: ['Months', 'Years', 'Days'], half: true },
      { key: 'desc', label: 'Notes / who to contact', type: 'textarea' },
    ],
    onSave: (v) => mutate((d) => { if (isNew) d.savings.push({ id: nextId('sv', d.savings), entries: [], compound: 'Monthly', ...v }); else Object.assign(d.savings.find((x) => x.id === sv.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.savings = d.savings.filter((x) => x.id !== sv.id); }),
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
function savings() {
  const { all } = S;
  const wrap = h('div');
  const groups = [['Chits', 'Chit'], ['Provident fund & post office', ['EPF', 'PPF']], ['Insurance & recurring deposits', ['LIC', 'RD']]];
  for (const [title, types] of groups) {
    const list = all.savings.filter((s) => [].concat(types).includes(s.type));
    wrap.append(section(title,
      table([
        { label: 'Name', get: (s) => s.name },
        { label: 'Holder', get: (s) => s.holder },
        { label: 'Invested', cls: 'r', get: (s) => money(s.principal), total: (rs) => money(rs.reduce((a, s) => a + s.principal, 0)) },
        { label: 'Rate', cls: 'r', get: (s) => (s.rate * 100).toFixed(2) + '%' },
        { label: 'Interest / day', cls: 'r', get: (s) => money(s.daily), total: (rs) => money(rs.reduce((a, s) => a + s.daily, 0)) },
        { label: 'Matures', get: (s) => dateStr(s.maturityDate) },
      ], list, { footer: { label: 'Total' }, onRow: openSaving, empty: 'No accounts of this kind.' }),
      canEdit() && title === 'Chits' ? [btn('Add savings account', () => savingForm(), 'primary')] : null));
  }
  return wrap;
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
    { label: 'Add entry', class: 'primary', onclick: (c) => { c(); entryForm(S.data.savings.find((s) => s.id === sv.id)); } },
  ] : [];
  dialog(sv.name, h('div', null, h('p', { class: 'note' }, `${sv.type} · ${sv.holder} · balance ${money(row.principal)}`), sv.desc ? h('p', null, sv.desc) : null, list), acts);
}
