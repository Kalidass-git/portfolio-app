// Expenses → Categories: add, rename, merge, delete categories, set monthly budgets, and manage the auto-fill rules.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as CAT from '../categories.js';
import { h, money, dateStr, section, table, btn, formDialog, canEdit, toast, empty, num, monthLabel, rowList, dialog } from '../ui.js';
import * as BUD from '../budget.js';
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

/** The monthly budget: the interest income expected (default), or an amount you fix for the year, or for this month and the next two. */
function budgetForm() {
  const { data } = S, cur = C.monthKey(S.all.asOf), win = BUD.windowMonths(cur);
  const interestOf = (m) => C.monthCashflow(data, S.all, m).totalExpected;
  const fields = [
    { key: 'yearMode', label: `Budget for ${cur.slice(0, 4)} (from ${monthLabel(cur, true)})`, type: 'select', options: [{ value: 'interest', label: 'Interest income expected (default)' }, { value: 'fixed', label: 'A fixed amount every month' }], hint: 'Months before this one always use the interest income.' },
    { key: 'yearAmount', label: 'Amount per month (₹)', type: 'number', required: true, showIf: (v) => v.yearMode === 'fixed' },
  ];
  win.forEach((m, i) => fields.push(
    { key: 'm' + i, label: monthLabel(m, true) + (i === 0 ? ' (this month)' : ''), type: 'select', options: [{ value: 'follow', label: 'Same as the year setting' }, { value: 'interest', label: 'Interest income · ' + money(interestOf(m)) }, { value: 'fixed', label: 'A fixed amount' }] },
    { key: 'a' + i, label: 'Amount for ' + monthLabel(m) + ' (₹)', type: 'number', required: true, showIf: (v) => v['m' + i] === 'fixed' }));
  formDialog({ title: 'Monthly budget', fields, value: BUD.formValues(data, cur), saveLabel: 'Save budget',
    onSave: (v) => { try { mutate((d) => BUD.save(d, cur, v)); } catch (e) { return fail(e); } } });
}

/** Read-only summary of the monthly budget on this page: this month and the next two. Changing it opens a sheet. */
function budgetCard() {
  const { data, all } = S, cur = C.monthKey(all.asOf);
  const rows = BUD.windowMonths(cur).map((m) => { const b = BUD.budgetFor(data, m, cur, C.monthCashflow(data, all, m).totalExpected); return { title: monthLabel(m, true) + (m === cur ? ' · this month' : ''), sub: b.source === 'manual' ? 'Set by you' : 'Interest income expected', value: money(b.amount), tone: b.source === 'manual' ? 'inv' : '' }; });
  return section('Monthly budget', h('div', null,
    rowList(rows),
    h('p', { class: 'note' }, 'This is what Month in detail and Home’s “This month in detail” measure spending against. Months before this one always use the interest income (bonds and lending). Spending, received and expected amounts are not changed by this.')),
    canEdit() ? [btn('Change budget', budgetForm)] : null);
}

/**
 * Move descriptions from one category to another: pick the target, pick the descriptions (all categories, or from one), then move.
 * The past entries with those descriptions and their auto-fill rules go together, so future entries land in the new category as well.
 */
function moveDialog(startFrom = '') {
  const { data } = S, list = CAT.categoryList(data), kindOf = new Map(list.map((c) => [c.name.toLowerCase(), c.kind]));
  const groups = CAT.descriptionGroups(data).sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit));
  const picked = new Set(); let q = '', limit = 120;
  const keyOf = (g) => g.desc.toLowerCase() + '\u0001' + g.category.toLowerCase();
  const optGroups = (skipFrom) => CAT.KINDS.map((k) => h('optgroup', { label: k.label }, list.filter((c) => c.kind === k.key).map((c) => h('option', { value: c.name }, c.name))));
  const to = h('select', { 'aria-label': 'Move to' }, h('option', { value: '' }, 'Choose a category…'), h('option', { value: '__new' }, '＋ New category…'), ...optGroups());
  const newName = h('input', { type: 'text', placeholder: 'New category name', 'aria-label': 'New category name', maxlength: '40' });
  const newKind = h('select', { 'aria-label': 'New category type' }, CAT.KINDS.map((k) => h('option', { value: k.key, selected: k.key === 'expense' }, k.label)));
  const newBox = h('div', { class: 'mv-new', hidden: true }, newName, newKind);
  const from = h('select', { 'aria-label': 'Show descriptions from' }, h('option', { value: '' }, 'All categories'), ...optGroups());
  if (startFrom) from.value = startFrom;
  const search = h('input', { type: 'search', placeholder: 'Search descriptions', 'aria-label': 'Search descriptions' });
  const listEl = h('div', { class: 'mv-list', role: 'group', 'aria-label': 'Descriptions' }), sum = h('p', { class: 'mv-sum', 'aria-live': 'polite' }), warn = h('p', { class: 'mv-warn', hidden: true });
  const rules = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Also change the auto-fill rule' });
  const visible = () => {
    const tgt = to.value === '__new' ? '' : to.value.toLowerCase(), f = from.value.toLowerCase(), t = q.trim().toLowerCase();
    return groups.filter((g) => g.category.toLowerCase() !== tgt && (!f || g.category.toLowerCase() === f) && (!t || g.desc.toLowerCase().includes(t)));
  };
  const draw = () => {
    const vis = visible(), shown = vis.slice(0, limit);
    listEl.replaceChildren(...(shown.length ? shown.map((g) => { const k = keyOf(g);
      return h('label', { class: 'mv-row' + (picked.has(k) ? ' on' : '') },
        h('input', { type: 'checkbox', checked: picked.has(k), 'aria-label': g.desc, onchange: (e) => { e.target.checked ? picked.add(k) : picked.delete(k); e.target.closest('.mv-row').classList.toggle('on', e.target.checked); update(); } }),
        h('span', { class: 'mv-main' }, h('b', null, g.desc), h('small', null, `in ${g.category} · ${num(g.count)} ${g.count === 1 ? 'entry' : 'entries'} · last ${dateStr(g.last)}`)),
        h('span', { class: 'mv-amt' }, money(g.debit + g.credit))); })
      : [h('p', { class: 'note' }, 'No descriptions match.')]), ...(vis.length > limit ? [btn(`Show more (${vis.length - limit} left)`, () => { limit += 150; draw(); }, 'wide')] : []));
    update();
  };
  const update = () => {
    const sel = groups.filter((g) => picked.has(keyOf(g))), vis = visible();
    sum.textContent = sel.length ? `${sel.length} ${sel.length === 1 ? 'description' : 'descriptions'} selected · ${num(sel.reduce((a, g) => a + g.count, 0))} entries · ${money(sel.reduce((a, g) => a + g.debit + g.credit, 0))}` : 'Nothing picked yet.';
    const tk = to.value && to.value !== '__new' ? kindOf.get(to.value.toLowerCase()) : to.value === '__new' ? newKind.value : null;
    const diff = tk ? [...new Set(sel.map((g) => kindOf.get(g.category.toLowerCase())).filter((x) => x && x !== tk))] : [];
    warn.hidden = !diff.length; warn.textContent = diff.length ? `Some of these are now counted as ${diff.join(' and ')}. Moving them to a ${tk} category changes what they count as in your totals.` : '';
    selAll.textContent = vis.length && vis.every((g) => picked.has(keyOf(g))) ? 'Clear shown' : `Pick all shown (${vis.length})`;
  };
  const selAll = h('button', { type: 'button', class: 'chip-btn', onclick: () => { const vis = visible(), all = vis.length && vis.every((g) => picked.has(keyOf(g))); vis.forEach((g) => (all ? picked.delete(keyOf(g)) : picked.add(keyOf(g)))); draw(); } }, '');
  to.onchange = () => { newBox.hidden = to.value !== '__new'; draw(); }; newKind.onchange = update;
  from.onchange = () => { limit = 120; draw(); }; search.oninput = (e) => { q = e.target.value; limit = 120; draw(); };
  const body = h('div', { class: 'form mv' },
    h('p', { class: 'note', style: { marginTop: 0 } }, 'Pick the category to move into, then tick the descriptions to move. Their past entries move, and the auto-fill rule is updated so new entries with the same description land in the new category. Amounts do not change.'),
    h('label', { class: 'field' }, h('span', null, 'Move to'), to), newBox,
    h('label', { class: 'field' }, h('span', null, 'Show descriptions from'), from), search,
    h('div', { class: 'chips-row' }, selAll), listEl, sum, warn,
    h('label', { class: 'check-inline', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, rules, ' Also change the auto-fill rule for these descriptions'));
  dialog('Move descriptions', body, [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Move', class: 'primary', onclick: (c) => {
    const sel = groups.filter((g) => picked.has(keyOf(g)));
    if (!to.value) return toast('Choose the category to move into.', 'warn');
    if (to.value === '__new' && !newName.value.trim()) return toast('Type a name for the new category.', 'warn');
    if (!sel.length) return toast('Tick at least one description.', 'warn');
    let res, target;
    try { mutate((d) => { target = to.value === '__new' ? CAT.add(d, { name: newName.value.trim(), kind: newKind.value }) : to.value; res = CAT.moveDescriptions(d, sel.map((g) => ({ desc: g.desc, from: g.category })), target, { updateRules: rules.checked }); }); } catch (e) { return toast(e.message, 'warn'); }
    c(); toast(`Moved ${res.descriptions} ${res.descriptions === 1 ? 'description' : 'descriptions'} (${num(res.entries)} entries) to ${target}.`);
  } }]);
  draw();
}

// ---- one category on its own page: pick descriptions or single entries and move them to another category ----
const pg = { cat: '', tab: 'desc', q: '', sort: 'amount', open: new Set(), pd: new Set(), pe: new Set(), to: '', newName: '', newKind: 'expense', rules: true, limit: 60 };
const dkey = (g) => g.desc.toLowerCase();
const catLink = (name) => `#/flow/category?name=${encodeURIComponent(name)}`;
export const categoryLink = catLink;

export function renderCategory(name) {
  const { data } = S;
  if (pg.cat !== name) Object.assign(pg, { cat: name, tab: 'desc', q: '', sort: 'amount', open: new Set(), pd: new Set(), pe: new Set(), to: '', newName: '', newKind: 'expense', rules: true, limit: 60 });
  const root = h('div', { class: 'page cp' });
  const list = CAT.categoryList(data), cat = list.find((c) => c.name.toLowerCase() === (name || '').toLowerCase());
  const back = h('a', { class: 'cp-back', href: '#/flow/categories' }, '‹ All categories');
  if (!cat) { root.append(back, h('p', { class: 'note' }, 'This category no longer exists.')); return root; }
  const editable = canEdit(), lc = (x) => (x || '').toLowerCase();
  const entries = data.ledger.filter((e) => lc(e.category) === lc(cat.name));
  const amt = (e) => (e.debit || 0) + (e.credit || 0);
  const groups = CAT.descriptionGroups(data).filter((g) => lc(g.category) === lc(cat.name));
  const total = entries.reduce((a, e) => a + amt(e), 0);
  const k = CAT.KINDS.find((x) => x.key === cat.kind);
  root.append(back, h('div', { class: 'cp-head' },
    h('div', null, h('h2', null, cat.name + (CAT.isProtected(cat.name) ? ' 🔒' : '')), h('p', { class: 'note', style: { margin: 0 } }, `${k ? k.one : cat.kind} · ${num(entries.length)} entries · ${num(groups.length)} ${groups.length === 1 ? "description" : "descriptions"} · ${money(total)}${cat.budget ? ' · budget ' + money(cat.budget) + '/month' : ''}`)),
    editable ? h('div', { class: 'cp-actions' }, btn('Edit category', () => categoryForm(cat, cat.kind), 'small'), btn('Move from all categories', () => moveDialog(''), 'small')) : null));

  const tabs = [['desc', 'Descriptions'], ['entries', 'Entries'], ['rules', 'Rules']];
  root.append(h('nav', { class: 'seg', role: 'tablist', 'aria-label': 'Category views' }, tabs.map(([key, label]) => h('button', { type: 'button', role: 'tab', class: pg.tab === key ? 'on' : '', 'aria-selected': pg.tab === key ? 'true' : 'false', onclick: () => { pg.tab = key; pg.q = ''; pg.limit = 60; rerender(); } }, label))));

  if (pg.tab === 'rules') {
    const rules = data.categories.filter((r) => lc(r.category) === lc(cat.name)).sort((a, b) => a.desc.localeCompare(b.desc));
    root.append(h('p', { class: 'note' }, 'Auto-fill rules that put new entries into this category. Tap one to change or remove it.'),
      rules.length ? h('div', { class: 'cp-list' }, rules.map((r) => h('button', { type: 'button', class: 'cp-row', onclick: editable ? () => ruleForm(r) : null }, h('span', { class: 'mv-main' }, h('b', null, r.desc)), h('span', { class: 'mv-amt' }, r.type || '')))) : h('p', { class: 'note' }, 'No auto-fill rules point here.'));
    return root;
  }

  const search = h('input', { type: 'search', placeholder: pg.tab === 'desc' ? 'Search descriptions' : 'Search entries', value: pg.q, 'aria-label': 'Search', oninput: (e) => { pg.q = e.target.value; pg.limit = 60; clearTimeout(window.__cpq); window.__cpq = setTimeout(() => { rerender(); const i = document.querySelector('.cp input[type=search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } });
  const sorts = pg.tab === 'desc' ? [['amount', 'Biggest total'], ['count', 'Most entries'], ['latest', 'Latest first'], ['name', 'A to Z']] : [['latest', 'Latest first'], ['amount', 'Biggest first']];
  if (!sorts.some(([v]) => v === pg.sort)) pg.sort = sorts[0][0];
  const sortSel = h('select', { 'aria-label': 'Sort', onchange: (e) => { pg.sort = e.target.value; rerender(); } }, sorts.map(([v, l]) => h('option', { value: v, selected: v === pg.sort }, l)));
  root.append(h('div', { class: 'filters cp-filters' }, search, sortSel));

  const t = pg.q.trim().toLowerCase();
  const entryRow = (e, nested) => h('label', { class: 'mv-row' + (pg.pe.has(e.id) ? ' on' : '') + (nested ? ' cp-sub' : '') },
    h('input', { type: 'checkbox', checked: pg.pe.has(e.id), disabled: !editable, 'aria-label': `${e.desc} ${dateStr(e.date)}`, onchange: (ev) => { ev.target.checked ? pg.pe.add(e.id) : pg.pe.delete(e.id); rerender(); } }),
    h('span', { class: 'mv-main' }, nested ? h('b', null, dateStr(e.date)) : h('b', null, e.desc), nested ? null : h('small', null, dateStr(e.date))),
    h('span', { class: 'mv-amt' }, (e.credit ? '+' : '') + money(amt(e))));
  const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  let body;
  if (pg.tab === 'desc') {
    let rows = groups.filter((g) => !t || g.desc.toLowerCase().includes(t));
    const tot = (g) => g.debit + g.credit;
    rows.sort(pg.sort === 'count' ? (a, b) => b.count - a.count : pg.sort === 'latest' ? (a, b) => (a.last < b.last ? 1 : -1) : pg.sort === 'name' ? (a, b) => a.desc.localeCompare(b.desc) : (a, b) => tot(b) - tot(a));
    const shown = rows.slice(0, pg.limit);
    body = h('div', { class: 'cp-list' }, shown.length ? shown.map((g) => {
      const key = dkey(g), isOpen = pg.open.has(key), on = pg.pd.has(key);
      const kids = isOpen ? entries.filter((e) => lc(e.desc.trim()) === key).sort(byDate).map((e) => entryRow(e, true)) : [];
      return h('div', { class: 'cp-group' },
        h('div', { class: 'mv-row cp-desc' + (on ? ' on' : '') },
          h('input', { type: 'checkbox', checked: on, disabled: !editable, 'aria-label': g.desc, onchange: (ev) => { ev.target.checked ? pg.pd.add(key) : pg.pd.delete(key); rerender(); } }),
          h('button', { type: 'button', class: 'cp-exp', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { isOpen ? pg.open.delete(key) : pg.open.add(key); rerender(); } },
            h('span', { class: 'mv-main' }, h('b', null, g.desc), h('small', null, `${num(g.count)} ${g.count === 1 ? 'entry' : 'entries'} · last ${dateStr(g.last)}`))),
          h('span', { class: 'mv-amt' }, money(tot(g)), h('i', { class: 'cp-chev' }, isOpen ? '▴' : '▾'))),
        ...kids);
    }) : [h('p', { class: 'note' }, 'No descriptions match.')]);
    if (rows.length > pg.limit) body = h('div', null, body, btn(`Show more (${rows.length - pg.limit} left)`, () => { pg.limit += 100; rerender(); }, 'wide'));
  } else {
    const rows = entries.filter((e) => !t || (e.desc || '').toLowerCase().includes(t)).sort(pg.sort === 'amount' ? (a, b) => amt(b) - amt(a) : byDate);
    const shown = rows.slice(0, pg.limit);
    body = h('div', null, h('div', { class: 'cp-list' }, shown.length ? shown.map((e) => entryRow(e, false)) : [h('p', { class: 'note' }, 'No entries match.')]),
      rows.length > pg.limit ? btn(`Show more (${rows.length - pg.limit} left)`, () => { pg.limit += 100; rerender(); }, 'wide') : null);
  }
  root.append(body);

  if (!editable) return root;
  // sticky move bar
  const pickedDesc = groups.filter((g) => pg.pd.has(dkey(g)));
  const descIds = new Set(entries.filter((e) => pg.pd.has(lc(e.desc.trim()))).map((e) => e.id));
  const extra = entries.filter((e) => pg.pe.has(e.id) && !descIds.has(e.id));
  const nEntries = descIds.size + extra.length, nAmt = entries.filter((e) => descIds.has(e.id)).reduce((a, e) => a + amt(e), 0) + extra.reduce((a, e) => a + amt(e), 0);
  const others = list.filter((c) => c.name.toLowerCase() !== cat.name.toLowerCase());
  const to = h('select', { 'aria-label': 'Move to', onchange: (e) => { pg.to = e.target.value; rerender(); } }, h('option', { value: '' }, 'Move to…'), h('option', { value: '__new', selected: pg.to === '__new' }, '＋ New category…'),
    ...CAT.KINDS.map((kk) => h('optgroup', { label: kk.label }, others.filter((c) => c.kind === kk.key).map((c) => h('option', { value: c.name, selected: pg.to === c.name }, c.name)))));
  const tk = pg.to === '__new' ? pg.newKind : (list.find((c) => c.name === pg.to) || {}).kind;
  const warn = tk && tk !== cat.kind && nEntries ? h('p', { class: 'mv-warn' }, `These are counted as ${cat.kind} now. Moving them to a ${tk} category changes what they count as in your totals.`) : null;
  const newBox = pg.to === '__new' ? h('div', { class: 'mv-new' },
    h('input', { type: 'text', placeholder: 'New category name', 'aria-label': 'New category name', maxlength: '40', value: pg.newName, oninput: (e) => { pg.newName = e.target.value; } }),
    h('select', { 'aria-label': 'New category type', onchange: (e) => { pg.newKind = e.target.value; rerender(); } }, CAT.KINDS.map((kk) => h('option', { value: kk.key, selected: kk.key === pg.newKind }, kk.label)))) : null;
  const rulesBox = pickedDesc.length ? h('label', { class: 'check-inline cp-rule' }, h('input', { type: 'checkbox', checked: pg.rules, onchange: (e) => { pg.rules = e.target.checked; } }), ' Also update the auto-fill rule') : null;
  const go = () => {
    if (!nEntries) return toast('Tick something to move first.', 'warn');
    if (!pg.to) return toast('Choose where to move it.', 'warn');
    if (pg.to === '__new' && !pg.newName.trim()) return toast('Type a name for the new category.', 'warn');
    let res, target, n = 0;
    try {
      mutate((d) => {
        target = pg.to === '__new' ? CAT.add(d, { name: pg.newName.trim(), kind: pg.newKind }) : pg.to;
        if (pickedDesc.length) { res = CAT.moveDescriptions(d, pickedDesc.map((g) => ({ desc: g.desc, from: cat.name })), target, { updateRules: pg.rules }); n += res.entries; }
        if (extra.length) n += CAT.moveEntries(d, extra.map((e) => e.id), target).entries;
      });
    } catch (e) { return fail(e); }
    Object.assign(pg, { pd: new Set(), pe: new Set(), to: '', newName: '' });
    toast(`Moved ${num(n)} ${n === 1 ? 'entry' : 'entries'} to ${target}.`);
  };
  root.append(h('div', { class: 'cp-bar' + (nEntries ? ' has' : ''), role: 'region', 'aria-label': 'Move picked items' },
    h('div', { class: 'cp-bar-top' }, h('b', null, nEntries ? `${num(nEntries)} picked · ${money(nAmt)}` : 'Nothing picked'), nEntries ? h('button', { type: 'button', class: 'chip-btn', onclick: () => { pg.pd = new Set(); pg.pe = new Set(); rerender(); } }, 'Clear') : null),
    h('div', { class: 'cp-bar-row' }, to, btn('Move', go, 'primary')), newBox, rulesBox, warn));
  return root;
}

export function render() {
  const { data } = S;
  const root = h('div', { class: 'page' });
  const list = CAT.categoryList(data);
  const usage = CAT.usage(data, C.addMonths(C.monthStart(S.all.asOf), -11).slice(0, 7));
  const editable = canEdit();

  root.append(budgetCard());
  if (editable) root.append(section('Move descriptions', h('div', null, h('p', { class: 'note', style: { marginTop: 0 } }, 'Tidy up quickly: pick a category, tick the descriptions that belong in it (for example “To Amma” into a new “Family support”), and move them in one go. Past entries and the auto-fill rule move together.'), btn('Move descriptions between categories', () => moveDialog(), 'wide'))));
  root.append(h('p', { class: 'note', style: { marginTop: 0 } }, 'Categories decide where each transaction is counted. Tap a category to open its page: see its descriptions and entries, move them to another category, or edit the category itself (rename, budgets, merge).'));

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
        sort: [{ value: 'none', label: 'Most used first', kind: 'none' }, { value: 'recent', label: 'Spent in last 12 months', kind: 'num', get: (c) => c.u.recent }, { value: 'count', label: 'Number of entries', kind: 'num', get: (c) => c.u.count }, ...(showBudget ? [{ value: 'budget', label: 'Monthly budget', kind: 'num', get: (c) => c.budget || 0 }, { value: 'ybudget', label: 'Yearly budget', kind: 'num', get: (c) => c.yearlyBudget || 0 }] : []), { value: 'name', label: 'Category name', kind: 'text', get: (c) => String(c.name || '').toLowerCase() }], sortDefault: { value: 'none', dir: 'asc' } }, onRow: (c) => { location.hash = catLink(c.name); }, empty: 'No categories of this kind yet.' }),
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
