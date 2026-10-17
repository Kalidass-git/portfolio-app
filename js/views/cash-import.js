// Cash & banks → Import: pick a CSV of bank transactions (account, date, description, credit, debit), preview what is new
// with a suggested category for each, fix categories (or create new ones), then add them to the ledger. Desktop only.
import { S, mutate } from '../store.js';
import * as CAT from '../categories.js';
import { h, money, dateStr, dialog, formDialog, toast, setOptions } from '../ui.js';
import { readTable } from '../xlsx.js';
import { autoPoint } from './backups.js';
import { buildImport, recheckDuplicates, parseText, SAMPLE_CSV } from '../bankimport.js';

const NEW = '__new__';
const lc = (s) => String(s || '').trim().toLowerCase();

function pickFile() {
  return new Promise((res) => { const i = h('input', { type: 'file', accept: '.csv,.xlsx,text/csv' }); i.onchange = () => res(i.files[0] || null); i.click(); });
}
function downloadSample() {
  const a = h('a', { href: URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' })), download: 'bank-transactions-sample.csv' });
  document.body.append(a); a.click(); a.remove();
}

/** categoryOptions(data, direction, current) comes from the Cash page so the choices match the Add transaction form. */
export function openBankImport(categoryOptions) {
  if (window.innerWidth <= 700) { toast('Import is available on a computer.'); return; }
  const { data } = S;
  const box = h('div');
  const dlg = dialog('Import bank transactions', box, []);
  dlg.el.classList.add('wide');
  let rows = [], pending = [], file = null, pasted = '';

  const known = () => new Set(CAT.categoryList(data).map((c) => lc(c.name)));
  const includedRows = () => rows.filter((r) => r.include);

  function start() {
    const ta = h('textarea', { class: 'imp-paste', rows: 9, spellcheck: false, 'aria-label': 'Paste bank transactions', placeholder: 'account,date,description,credit,debit\nSCB,17/10/2026,Groceries,,2500\nSCB,18/10/2026,Salary,100000,' }, pasted);
    box.replaceChildren(
      h('p', null, 'Paste the rows here, or choose a file. The columns are ', h('b', null, 'account, date, description, credit, debit'), '. You will see a preview before anything is saved.'),
      ta,
      h('div', { class: 'btn-row imp-actions' }, h('button', { class: 'primary', onclick: () => fromText(ta.value) }, 'Preview pasted rows'), h('button', { onclick: choose }, 'Choose a CSV file instead'), h('button', { onclick: downloadSample }, 'Download a sample')),
      h('ul', { class: 'imp-help' },
        h('li', null, 'You can paste straight from Excel or Google Sheets (tab separated) or CSV text. The first line must be the column names.'),
        h('li', null, 'Account can be the account name, “name · holder” or its id. Entries already in the app (same account, date, description and amount) are left out.'),
        h('li', null, 'Dates can be 2026-10-17, 17/10/2026 or 17-Oct-2026. Amounts can have commas.'),
        h('li', null, 'A “category” column is optional and used when it matches one of your categories.')));
    setTimeout(() => ta.focus(), 0);
  }
  function load(table, name) {
    try {
      const res = buildImport(table, data);
      file = { name }; rows = res.rows;
      for (const r of rows) { r.include = r.status === 'new' && !!r.acct; }
      preview();
    } catch (e) { toast(e.message || 'Could not read this.', 'bad'); }
  }
  function fromText(text) {
    pasted = text;
    if (!text.trim()) { toast('Paste the rows first.', 'bad'); return; }
    load(parseText(text), 'Pasted rows');
  }
  async function choose() {
    const f = await pickFile(); if (!f) return;
    try { load(await readTable(f), f.name); } catch (e) { toast(e.message || 'Could not read this file.', 'bad'); }
  }

  const optionsFor = (r) => {
    const groups = categoryOptions(data, r.dir, r.category).filter((g) => g.group !== 'Not in the list');
    const mine = pending.filter((p) => (r.dir === 'credit' ? p.kind === 'income' : p.kind !== 'income'));
    const opts = [{ value: '', label: '— choose —' }, ...groups];
    if (mine.length) opts.push({ group: 'New (created on import)', options: mine.map((p) => p.name) });
    // a category suggested by the file that does not exist yet stays selectable
    if (r.category && !known().has(lc(r.category)) && !pending.some((p) => lc(p.name) === lc(r.category))) opts.push({ group: 'From the file', options: [r.category] });
    opts.push({ group: 'Not in the list', options: [{ value: NEW, label: '+ New category…' }] });
    return opts;
  };

  function newCategory(r, sel) {
    formDialog({
      title: 'New category', saveLabel: 'Create', value: { name: r.csvCategory && !known().has(lc(r.csvCategory)) ? r.csvCategory : '', kind: r.dir === 'credit' ? 'income' : 'expense' },
      fields: [
        { key: 'name', label: 'Category name', type: 'text', required: true, hint: 'It is added to your categories when you import, and can be changed later under Expenses → Categories.' },
        { key: 'kind', label: 'Category type', type: 'select', options: CAT.KINDS.map((k) => ({ value: k.key, label: k.key === 'expense' ? 'Expense' : k.key === 'income' ? 'Income' : k.key === 'investment' ? 'Investment (not an expense)' : 'Not counted (transfers between your accounts)' })) },
      ],
      onSave: (v) => {
        const name = v.name.trim();
        if (!known().has(lc(name)) && !pending.some((p) => lc(p.name) === lc(name))) pending.push({ name, kind: v.kind });
        const real = (CAT.categoryList(data).find((c) => lc(c.name) === lc(name)) || pending.find((p) => lc(p.name) === lc(name))).name;
        setCategory(r, real);
      },
    });
    // forms close themselves; put the select back if the form is cancelled
    setTimeout(() => { sel.value = r.category || ''; }, 0);
  }
  /** Set a category, and give the same one to other rows with the same description that were not set by hand. */
  function setCategory(r, name) {
    r.category = name; r.manual = true;
    for (const o of rows) if (o !== r && !o.manual && o.status !== 'invalid' && lc(o.desc) === lc(r.desc) && (o.dir === r.dir)) o.category = name;
    preview();
  }

  function preview() {
    const scroll = box.querySelector('.imp-scroll'); const top = scroll ? scroll.scrollTop : 0;
    const accts = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
    const fresh = rows.filter((r) => r.status === 'new'), dup = rows.filter((r) => r.status === 'duplicate'), bad = rows.filter((r) => r.status === 'invalid');
    const inc = includedRows();
    const out = inc.reduce((a, r) => a + r.debit, 0), inn = inc.reduce((a, r) => a + r.credit, 0);
    // accounts in the file that were not recognised
    const unknownAcct = [...new Set(rows.filter((r) => r.status !== 'invalid' && !r.acct).map((r) => r.acctText))];
    const mapBox = unknownAcct.length ? h('div', { class: 'alert warn imp-map' }, h('b', null, 'Match the accounts'), h('p', null, 'These names in the file are not one of your accounts. Pick the account for each, or leave them out.'),
      unknownAcct.map((t) => h('label', { class: 'inline-label' }, h('span', null, t ? `“${t}” is` : 'Rows without an account are'), (() => {
        const s = h('select', { 'aria-label': 'Account for ' + t, onchange: (e) => {
          for (const r of rows) if (r.status !== 'invalid' && r.acctText === t) r.acct = e.target.value;
          recheckDuplicates(rows, data);
          for (const r of rows) if (r.status !== 'invalid' && r.acctText === t) r.include = r.status === 'new' && !!r.acct; else if (r.status === 'duplicate') r.include = false;
          preview();
        } });
        setOptions(s, [{ value: '', label: '— leave out —' }, ...data.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.holder}` }))], '');
        return s;
      })()))) : null;

    const trs = rows.map((r) => {
      const sel = h('select', { class: 'imp-cat' + (r.status === 'new' && !r.category ? ' need' : ''), 'aria-label': 'Category', disabled: r.status === 'invalid', onchange: (e) => { if (e.target.value === NEW) newCategory(r, e.target); else setCategory(r, e.target.value); } });
      if (r.status !== 'invalid') setOptions(sel, optionsFor(r), r.category || '');
      const tag = r.status === 'invalid' ? h('span', { class: 'tag bad' }, r.reason) : r.status === 'duplicate' ? h('span', { class: 'tag' }, 'already in the app') : !r.acct ? h('span', { class: 'tag warn' }, 'no account') : h('span', { class: 'tag good' }, 'new');
      return h('tr', { class: r.status === 'invalid' ? 'row-bad' : r.include ? '' : 'imp-off' },
        h('td', null, h('input', { type: 'checkbox', checked: r.include, disabled: r.status === 'invalid' || !r.acct, 'aria-label': 'Import this row', onchange: (e) => { r.include = e.target.checked; preview(); } })),
        h('td', null, r.date ? dateStr(r.date) : '–'), h('td', null, r.acct ? accts.get(r.acct) : r.acctText || '–'), h('td', { class: 'imp-desc' }, r.desc || '–'),
        h('td', { class: 'r neg' }, r.debit > 0 ? money(r.debit) : ''), h('td', { class: 'r pos' }, r.credit > 0 ? money(r.credit) : ''),
        h('td', null, r.status === 'invalid' ? '' : sel), h('td', null, tag));
    });
    const needCat = inc.filter((r) => !r.category).length;
    const doImport = h('button', { class: 'primary', disabled: !inc.length, onclick: save }, inc.length ? `Import ${inc.length} transaction${inc.length === 1 ? '' : 's'}` : 'Nothing to import');
    box.replaceChildren(
      h('p', { class: 'summary-line' }, h('b', null, file ? file.name : ''), ` · ${fresh.length} new`, dup.length ? ` · ${dup.length} already in the app` : '', bad.length ? [' · ', h('span', { class: 'neg' }, `${bad.length} with problems`)] : null),
      mapBox,
      h('div', { class: 'imp-scroll' }, h('table', { class: 'tbl imp' },
        h('thead', null, h('tr', null, ['', 'Date', 'Account', 'Description', 'Paid out', 'Received', 'Category', ''].map((t, i) => h('th', { class: i === 4 || i === 5 ? 'r' : '' }, t)))),
        h('tbody', null, trs))),
      h('p', { class: 'note' }, `Selected: paid out ${money(out)}, received ${money(inn)}.`, needCat ? ` ${needCat} still have no category and will go in as “Unknown”.` : '', ' Changing a category also changes the rows with the same description. “+ New category…” creates one with its type.'),
      h('div', { class: 'btn-row imp-foot' }, h('button', { onclick: start }, 'Back'), h('button', { onclick: () => dlg.close() }, 'Cancel'), doImport));
    const s2 = box.querySelector('.imp-scroll'); if (s2) s2.scrollTop = top;
  }

  async function save() {
    const inc = includedRows(); if (!inc.length) return;
    await autoPoint('Before importing bank transactions');
    try {
      mutate((d) => {
        const used = new Set(inc.map((r) => lc(r.category)));
        for (const p of pending) if (used.has(lc(p.name))) CAT.add(d, { name: p.name, kind: p.kind });
        let id = Math.max(0, ...d.ledger.map((e) => e.id || 0));
        for (const r of inc) {
          const category = r.category || 'Unknown';
          d.ledger.push({ id: ++id, acct: r.acct, date: r.date, desc: r.desc, debit: r.debit, credit: r.credit, category });
          // remember the description so the next entry fills in by itself
          if (r.category && !d.categories.some((c) => lc(c.desc) === lc(r.desc))) d.categories.push({ desc: r.desc, category, type: r.credit > 0 ? 'Income' : 'Expense' });
        }
      });
      toast(`Imported ${inc.length} transaction${inc.length === 1 ? '' : 's'}`);
      dlg.close();
    } catch (e) { toast(e.message || 'Could not import.', 'bad'); }
  }

  start();
}
