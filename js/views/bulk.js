// Bulk entry: add many income and expense lines to the bank ledger in one go, one line per entry.
// Each new line starts with the previous line's type, date and account. Typing a description then Tab fills the first match and, when that
// description is known, its category too; the cursor then goes to the amount. If the category is not known the category list opens.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as CAT from '../categories.js';
import { h, money, dialog, toast, setOptions, typeahead, fieldIcon, btn } from '../ui.js';
import { categoryOptions, NEW } from './cash.js';

const TYPES = { debit: ['Expense', 'down', 'neg'], credit: ['Income', 'up', 'pos'] };

export function bulkForm(preset = {}) {
  const { data } = S;
  if (!data.accounts.length) return toast('Add a bank account first.', 'bad');
  const accts = data.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.holder}` }));
  const known = new Map(data.categories.map((c) => [c.desc.trim().toLowerCase(), c.category]));
  const descs = () => data.categories.map((c) => c.desc);
  const catChoices = (type) => categoryOptions(data, type).filter((g) => !(g.options && g.options.some((o) => o && o.value === NEW)));
  const rows = [];
  const list = h('div', { class: 'bk-rows' });
  const sum = h('p', { class: 'bk-sum', role: 'status' });
  const err = h('p', { class: 'form-error', role: 'alert' });

  const refresh = () => {
    let n = 0, out = 0, inn = 0;
    for (const r of rows) { const amt = Number(r.amount.value); if (amt > 0 && r.desc.value.trim()) { n++; if (r.type === 'credit') inn += amt; else out += amt; } }
    sum.replaceChildren(h('b', null, `${n} ready`), '  ·  ', h('span', { class: 'neg' }, 'Expenses ' + money(out)), '  ·  ', h('span', { class: 'pos' }, 'Income ' + money(inn)));
  };
  const openPicker = (sel) => { sel.focus(); try { sel.showPicker && sel.showPicker(); } catch { /* needs a recent key press */ } };
  const fillCategory = (r) => {
    const c = known.get(r.desc.value.trim().toLowerCase());
    if (c && [...r.cat.options].some((o) => o.value === c)) { r.cat.value = c; return true; }
    return !!r.cat.value;
  };
  const afterDesc = (r) => { if (!r.desc.value.trim()) return; if (fillCategory(r)) { r.amount.focus(); r.amount.select(); } else openPicker(r.cat); refresh(); };

  const addRow = (from) => {
    const r = { type: (from && from.type) || preset.kind || 'debit' };
    const typeBtn = h('button', { type: 'button', class: 'bk-type', 'aria-label': 'Switch between expense and income' });
    const setType = (t) => { r.type = t; const [lab, ic, cls] = TYPES[t]; typeBtn.className = 'bk-type ' + cls; typeBtn.replaceChildren(fieldIcon(ic), lab); const keep = r.cat && r.cat.value; if (r.cat) { setOptions(r.cat, [{ value: '', label: 'Category…' }, ...catChoices(t)], keep); } refresh(); };
    typeBtn.onclick = () => setType(r.type === 'debit' ? 'credit' : 'debit');
    r.date = h('input', { type: 'date', value: from ? from.date.value : (preset.date || C.todayISO()), 'aria-label': 'Date' });
    r.acct = h('select', { 'aria-label': 'Account' }); setOptions(r.acct, accts, from ? from.acct.value : (preset.acct || accts[0].value));
    r.desc = h('input', { type: 'text', placeholder: 'Description', autocomplete: 'off', 'aria-label': 'Description' });
    r.cat = h('select', { 'aria-label': 'Category' });
    r.amount = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0', 'aria-label': 'Amount (₹)' });
    const descCell = h('div', { class: 'bk-cell bk-desc' }, r.desc);
    typeahead(r.desc, descs, { host: descCell, onPick: (v, viaTab) => { fillCategory(r); if (!viaTab) afterDesc(r); } });
    r.desc.addEventListener('keydown', (e) => { if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') { if (!r.desc.value.trim()) return; e.preventDefault(); afterDesc(r); } });
    r.cat.addEventListener('change', () => { if (r.cat.value) { r.amount.focus(); r.amount.select(); } });
    r.amount.addEventListener('input', refresh);
    r.amount.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && r === rows[rows.length - 1])) && r.amount.value !== '') { e.preventDefault(); const nr = addRow(r); nr.desc.focus(); } else if (e.key === 'Enter') e.preventDefault(); });
    const del = h('button', { type: 'button', class: 'bk-del', 'aria-label': 'Remove this line', title: 'Remove this line', onclick: () => { if (rows.length === 1) { r.desc.value = ''; r.amount.value = ''; r.cat.value = ''; refresh(); return; } rows.splice(rows.indexOf(r), 1); r.el.remove(); refresh(); } }, '✕');
    r.el = h('div', { class: 'bk-row' }, h('div', { class: 'bk-cell bk-t', 'data-l': 'Type' }, typeBtn), h('div', { class: 'bk-cell', 'data-l': 'Date' }, r.date), h('div', { class: 'bk-cell', 'data-l': 'Account' }, r.acct),
      Object.assign(descCell, { }), h('div', { class: 'bk-cell', 'data-l': 'Category' }, r.cat), h('div', { class: 'bk-cell bk-amt', 'data-l': 'Amount (₹)' }, r.amount), del);
    descCell.dataset.l = 'Description';
    rows.push(r); list.append(r.el); setType(r.type);
    refresh(); return r;
  };

  const head = h('div', { class: 'bk-head', 'aria-hidden': 'true' }, ['Type', 'Date', 'Account', 'Description', 'Category', 'Amount (₹)', ''].map((t) => h('span', null, t)));
  const first = addRow(null);
  const body = h('div', { class: 'bk' },
    h('p', { class: 'note' }, 'One line per entry. Type a description and press Tab: it fills the first match and its category, then the cursor goes to the amount. Press Enter after the amount for the next line, which starts with the same type, date and account.'),
    head, list, h('div', { class: 'bk-foot' }, btn('Add a line', () => { const r = addRow(rows[rows.length - 1]); r.desc.focus(); }), sum), err);

  const save = (close) => {
    err.textContent = ''; rows.forEach((r) => r.el.classList.remove('bad'));
    const live = rows.filter((r) => r.desc.value.trim() || r.amount.value !== '' || r.cat.value);
    if (!live.length) { err.textContent = 'Fill in at least one line.'; return; }
    let bad = 0;
    for (const r of live) { const ok = r.desc.value.trim() && Number(r.amount.value) > 0 && r.cat.value && r.date.value && r.acct.value; if (!ok) { bad++; r.el.classList.add('bad'); } }
    if (bad) { err.textContent = `${bad} line${bad > 1 ? 's need' : ' needs'} a description, a category and an amount above zero.`; const f = rows.find((r) => r.el.classList.contains('bad')); if (f) (f.desc.value.trim() ? (Number(f.amount.value) > 0 ? f.cat : f.amount) : f.desc).focus(); return; }
    mutate((d) => {
      let id = Math.max(0, ...d.ledger.map((e) => e.id || 0));
      for (const r of live) {
        let category = r.cat.value;
        if (category.toLowerCase() === 'transfer') category = CAT.add(d, { name: 'Transfer', kind: 'transfer' });
        const amt = Number(r.amount.value), desc = r.desc.value.trim();
        d.ledger.push({ id: ++id, acct: r.acct.value, date: r.date.value, desc, debit: r.type === 'debit' ? amt : 0, credit: r.type === 'credit' ? amt : 0, category });
        if (!d.categories.some((c) => c.desc.toLowerCase() === desc.toLowerCase())) d.categories.push({ desc, category, type: r.type === 'credit' ? 'Income' : 'Expense' });
      }
    });
    toast(`${live.length} entr${live.length > 1 ? 'ies' : 'y'} added`);
    close();
  };
  const dlg = dialog('Add many entries', body, [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Add all', class: 'primary', onclick: save }], { tone: 'brand', sub: 'Income and expenses, one line each', ic: 'edit' });
  dlg.el.classList.add('wide', 'bulk');
  setTimeout(() => first.desc.focus(), 40);
  return dlg;
}
