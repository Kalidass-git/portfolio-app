// Expenses → Categories: add, rename, merge, delete categories, set monthly budgets, and manage the auto-fill rules.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as CAT from '../categories.js';
import { h, money, dateStr, section, table, btn, formDialog, canEdit, toast, empty, num } from '../ui.js';
import { openLedger } from './cash.js';

const rerender = () => window.dispatchEvent(new Event('rerender'));
let ruleText = '', ruleLimit = 30;

function fail(e) { toast(e.message || String(e), 'bad'); return false; }

function categoryForm(cat, presetKind) {
  const { data } = S;
  const isNew = !cat;
  const use = cat ? CAT.usage(data).get(cat.name.toLowerCase()) : null;
  const locked = cat && CAT.isProtected(cat.name);
  const others = CAT.categoryList(data).filter((c) => !cat || c.name.toLowerCase() !== cat.name.toLowerCase()).map((c) => c.name).sort((a, b) => a.localeCompare(b));
  const dlg = formDialog({
    title: isNew ? 'Add category' : 'Edit ' + cat.name,
    value: cat ? { name: cat.name, kind: cat.kind, budget: cat.budget || '', yearlyBudget: cat.yearlyBudget || '', mergeInto: '' } : { kind: presetKind || 'expense', budget: '', yearlyBudget: '' },
    saveLabel: isNew ? 'Add' : 'Save',
    deleteMessage: use && use.count ? `“${cat && cat.name}” has ${use.count} entries. Next you will choose another category to move them to.` : 'Delete this category?',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, readonly: locked, hint: locked ? 'The Home screen groups its summary by this name, so the name cannot change. You can still change the budget.' : '' },
      { key: 'kind', label: 'Counts as', type: 'select', options: CAT.KINDS.map((k) => ({ value: k.key, label: k.one })), hint: 'Expenses are what you spent. Investments are money you put away, not spent. “Not counted” is for moves between your own accounts and cash withdrawals.' },
      { key: 'budget', label: 'Monthly budget (₹, optional)', type: 'number', showIf: (v) => v.kind === 'expense', hint: 'The Expenses screen shows how much of this is used each month.', half: true },
      { key: 'yearlyBudget', label: 'Yearly budget (₹, optional)', type: 'number', showIf: (v) => v.kind === 'expense', half: true, hint: 'You can set either or both. You are warned on Expenses when 80% of a budget is used.' },
      ...(!isNew && !locked && others.length ? [{ key: 'mergeInto', label: 'Merge into another category (optional)', type: 'select', options: [{ value: '', label: 'Keep as it is' }, ...others], hint: 'Moves all its entries and auto-fill rules into the chosen category and removes this one.' }] : []),
    ],
    onSave: (v) => {
      try {
        mutate((d) => {
          if (isNew) {
            if (CAT.exists(d, v.name)) throw new Error('A category with this name already exists.');
            CAT.add(d, { name: v.name, kind: v.kind, budget: v.kind === 'expense' ? v.budget : 0, yearlyBudget: v.kind === 'expense' ? v.yearlyBudget : 0 });
          } else if (v.mergeInto) CAT.merge(d, cat.name, v.mergeInto);
          else CAT.update(d, cat.name, { name: locked ? cat.name : v.name, kind: v.kind, budget: v.kind === 'expense' ? v.budget : 0, yearlyBudget: v.kind === 'expense' ? (v.yearlyBudget || 0) : 0 });
        });
        toast(isNew ? 'Category added' : v.mergeInto ? 'Categories merged' : 'Category saved');
      } catch (e) { return fail(e); }
    },
    onDelete: isNew ? null : () => {
      if (locked) return fail(new Error('This name is used by the Home screen, so it cannot be deleted.'));
      if (use && use.count) { moveAndDelete(cat, use.count, others, () => dlg.close()); return false; }
      try { mutate((d) => CAT.remove(d, cat.name)); toast('Category deleted'); } catch (e) { return fail(e); }
    },
  });
}

function moveAndDelete(cat, count, others, onDone) {
  formDialog({
    title: `Delete ${cat.name}`, saveLabel: 'Move and delete', value: { to: others[0] },
    fields: [{ key: 'to', label: `Move its ${count} entries to`, type: 'select', required: true, options: others }],
    onSave: (v) => { try { mutate((d) => { CAT.merge(d, cat.name, v.to); }); toast('Moved and deleted'); onDone && onDone(); } catch (e) { return fail(e); } },
  });
}

function ruleForm(rule) {
  const { data } = S;
  const names = CAT.categoryList(data).map((c) => c.name).sort((a, b) => a.localeCompare(b));
  const isNew = !rule;
  formDialog({
    title: isNew ? 'Add auto-fill rule' : 'Edit auto-fill rule', value: rule || { category: names[0] },
    fields: [
      { key: 'desc', label: 'Description', type: 'text', required: true, hint: 'When you type exactly this in a transaction, the category below is picked for you.' },
      { key: 'category', label: 'Category', type: 'select', options: names, required: true },
    ],
    onSave: (v) => mutate((d) => { if (!isNew && rule.desc.toLowerCase() !== v.desc.toLowerCase()) CAT.removeRule(d, rule.desc); CAT.setRule(d, v.desc, v.category); }),
    onDelete: isNew ? null : () => mutate((d) => CAT.removeRule(d, rule.desc)),
    deleteMessage: 'Delete this rule? Past transactions keep their category.',
  });
}

export function render() {
  const { data } = S;
  const root = h('div', { class: 'page' });
  const list = CAT.categoryList(data);
  const usage = CAT.usage(data, C.addMonths(C.monthStart(S.all.asOf), -11).slice(0, 7));
  const editable = canEdit();

  root.append(h('p', { class: 'note', style: { marginTop: 0 } }, 'Categories decide where each transaction is counted. Tap a row to rename it, change what it counts as, set a monthly and/or yearly budget, or merge it into another category.'));

  for (const k of CAT.KINDS) {
    const rows = list.filter((c) => c.kind === k.key).map((c) => ({ ...c, u: usage.get(c.name.toLowerCase()) || { count: 0, recent: 0, last: '' } })).sort((a, b) => b.u.recent - a.u.recent || a.name.localeCompare(b.name));
    const showBudget = k.key === 'expense';
    const budgetTotal = rows.reduce((a, c) => a + (c.budget || 0), 0), yearTotal = rows.reduce((a, c) => a + (c.yearlyBudget || 0), 0);
    root.append(section(`${k.label} (${rows.length})`,
      table([
        { label: 'Category', host: true, render: (c) => h('span', { title: CAT.isProtected(c.name) ? 'Name is fixed because the Home screen summary uses it' : null }, c.name + (CAT.isProtected(c.name) ? ' 🔒' : '')) },
        { label: 'Entries', mob: 'under', mlabel: 'entries ', cls: 'r', get: (c) => num(c.u.count) },
        { label: 'Last 12 months', cls: 'r', get: (c) => (c.u.recent ? money(c.u.recent) : '–') },
        ...(showBudget ? [{ label: 'Budget / month', cls: 'r', get: (c) => (c.budget ? money(c.budget) : '–'), total: () => (budgetTotal ? money(budgetTotal) : '') }, { label: 'Budget / year', cls: 'r', get: (c) => (c.yearlyBudget ? money(c.yearlyBudget) : '–'), total: () => (yearTotal ? money(yearTotal) : '') }] : []),
      ], rows, { footer: showBudget && (budgetTotal || yearTotal) ? { label: 'Total budget' } : null, m: { key: 'cat-' + k.key, head: 'Category', title: (c) => c.name + (CAT.isProtected(c.name) ? ' 🔒' : ''), sub: (c) => `${num(c.u.count)} ${c.u.count === 1 ? 'entry' : 'entries'}`,
        views: showBudget ? [['Last 12 months', 'Entries'], ['Budget / month', 'Budget / year']] : [['Last 12 months', 'Entries']],
        sort: [{ value: 'none', label: 'Most used first', kind: 'none' }, { value: 'recent', label: 'Spent in last 12 months', kind: 'num', get: (c) => c.u.recent }, { value: 'count', label: 'Number of entries', kind: 'num', get: (c) => c.u.count }, ...(showBudget ? [{ value: 'budget', label: 'Monthly budget', kind: 'num', get: (c) => c.budget || 0 }, { value: 'ybudget', label: 'Yearly budget', kind: 'num', get: (c) => c.yearlyBudget || 0 }] : []), { value: 'name', label: 'Category name', kind: 'text', get: (c) => String(c.name || '').toLowerCase() }], sortDefault: { value: 'none', dir: 'asc' } }, onRow: editable ? (c) => categoryForm(list.find((x) => x.name === c.name)) : null, empty: 'No categories of this kind yet.' }),
      editable ? [btn('Add category', () => categoryForm(null, k.key), 'primary')] : null));
  }

  // auto-fill rules
  const q = ruleText.toLowerCase();
  const rules = data.categories.filter((r) => !q || (r.desc + ' ' + r.category).toLowerCase().includes(q)).sort((a, b) => a.desc.localeCompare(b.desc));
  const box = h('input', { type: 'search', placeholder: 'Search descriptions', value: ruleText, 'aria-label': 'Search auto-fill rules', oninput: (e) => { ruleText = e.target.value; ruleLimit = 30; clearTimeout(window.__rt); window.__rt = setTimeout(() => { rerender(); const i = document.querySelector('input[aria-label="Search auto-fill rules"]'); i && (i.focus(), i.setSelectionRange(ruleText.length, ruleText.length)); }, 250); } });
  root.append(section(`Auto-fill rules (${data.categories.length})`,
    h('div', null,
      h('p', { class: 'note', style: { marginTop: 0 } }, 'A description you have used before fills in its category when you add a transaction. Fix a wrong rule here so future entries land in the right place.'),
      h('div', { class: 'filters' }, box),
      table([
        { label: 'Description', get: (r) => r.desc }, { label: 'Category', get: (r) => r.category },
      ], rules.slice(0, ruleLimit), { m: { key: 'cat-rules', head: 'Description', title: (r) => r.desc, views: [['Category']] }, onRow: editable ? (r) => ruleForm(r) : null, empty: 'No rules match.' }),
      rules.length > ruleLimit ? btn(`Show more (${rules.length - ruleLimit} left)`, () => { ruleLimit += 50; rerender(); }, 'wide') : null),
    editable ? [btn('Add rule', () => ruleForm())] : null));

  const unknown = data.ledger.filter((e) => (e.category || '').toLowerCase() === 'unknown').length;
  if (unknown) root.append(h('div', { class: 'card' }, h('p', null, `${unknown} transactions are in “Unknown”. `), btn('Review them', () => openLedger({ text: 'Unknown' }), 'small')));
  return root;
}
