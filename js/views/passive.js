// Spend & plan → Passive income: match passive income (bond and lending interest...) to the household's expenses, so the salary can stay invested.
// Three tabs: Overview, Allocations (drag or tap to connect), Progress (the only place for actuals). The plan is the owner's only saved data (settings.passivePlan, see passive.js).
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../passive.js';
import { h, money, compact, pct, monthLabel, section, kpi, segTabs, subTab, dialog, formDialog, toast, canEdit } from '../ui.js';

const TABS = [['overview', 'Overview'], ['allocations', 'Allocations'], ['progress', 'Progress']];
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return el; };
const PAL = ['#0f8a6a', '#3b82c4', '#c08a1e', '#8b5cf6', '#d4572e', '#2a9d8f'];
let period = 'this'; const khide = new Set();   // khide: columns of the Allocations board the owner has switched off (empty = everything shown)
const tone = (cov) => (cov == null ? 'muted' : cov >= 1 ? 'pos' : cov >= 0.5 ? 'warn' : 'neg');
const KIND = { bond: 'Bond interest', lending: 'Lending interest', other: 'Other income' };
const srcColor = (al, key) => PAL[Math.max(0, al.sources.findIndex((s) => s.key === key)) % PAL.length];

// ---------- small pieces ----------
function ring(value, size = 84) {
  const v = Math.max(0, Math.min(1, value || 0)), r = size / 2 - 7, c = 2 * Math.PI * r;
  return svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'pi-ring ' + tone(value), role: 'img', 'aria-label': value == null ? 'No coverage yet' : `${Math.round(value * 100)} percent covered` },
    svg('circle', { cx: size / 2, cy: size / 2, r, class: 'pi-ring-bg' }),
    svg('circle', { cx: size / 2, cy: size / 2, r, class: 'pi-ring-fg', 'stroke-dasharray': `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }),
    svg('text', { x: size / 2, y: size / 2 + 5, 'text-anchor': 'middle', class: 'pi-ring-t' }, value == null ? '–' : Math.round(value * 100) + '%'));
}
const bar = (frac, cls = '') => h('span', { class: 'pi-bar ' + cls }, h('i', { style: { width: Math.max(0, Math.min(1, frac || 0)) * 100 + '%' } }));
const chip = (text, cls) => h('span', { class: 'pi-chip ' + cls }, text);

/** Income against expenses for the last months, as two lines. */
const basis = (c) => (c.src === 'budget' ? 'Budget' : c.src === 'fixed' ? 'Fixed' : 'Planned');
/** A simple read-only summary for the Overview: each income, how much of it is allocated and what it pays. Changing anything is done on the Allocations tab. */
function summaryList(al) {
  return h('ul', { class: 'pa-list' }, al.sources.map((x) => {
    const pays = al.links.filter((l) => l.src === x.key).sort((a, b) => a.ord - b.ord).map((l) => l.cat);
    return h('li', { class: 'pa-row ' + (x.over > 0.5 ? 'bad' : 'ok'), style: { borderLeftColor: srcColor(al, x.key) } },
      h('div', { class: 'pa-top' }, h('b', null, x.name), h('span', { class: 'pa-st' }, money(x.monthly) + ' / mo')),
      bar(x.monthly > 0 ? x.allocated / x.monthly : 0, x.over > 0.5 ? 'bad' : ''),
      h('div', { class: 'pa-sub' }, h('span', null, x.over > 0.5 ? `Over-allocated by ${money(x.over)}` : `${money(x.allocated)} allocated · ${money(Math.max(0, x.remaining))} left`), h('span', null, pays.length ? 'Pays ' + pays.join(', ') : 'Pays nothing yet')));
  }));
}

// ---------- setting an allocation ----------
/** One expense, all the income that pays for it: an amount per source in a single sheet. No source can be asked for more than it has left. */
function expenseSheet(al, catName) {
  if (!canEdit()) return;
  const cat = al.cats.find((c) => c.name === catName); if (!cat) return;
  const own = new Map(al.links.filter((l) => l.cat.toLowerCase() === catName.toLowerCase()).map((l) => [l.src, l.amount]));
  const rows = al.sources.map((s) => {
    const avail = Math.max(0, Math.round(s.remaining + (own.get(s.key) || 0))), input = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '100', value: own.has(s.key) ? String(own.get(s.key)) : '', placeholder: '0', class: 'pi-amt sm', 'aria-label': 'Amount from ' + s.name });
    const fill = h('button', { type: 'button', class: 'chip-btn small', onclick: () => { const others = [...rows0].reduce((a, r) => (r.s.key === s.key ? a : a + (Number(r.input.value) || 0)), 0); input.value = String(Math.max(0, Math.min(avail, Math.round(cat.base - others)))); check(); } }, 'Fill');
    return { s, avail, input, el: h('div', { class: 'pi-srow' }, h('span', { class: 'pi-dotc', style: { background: srcColor(al, s.key) } }), h('span', { class: 'pi-sname' }, h('b', null, s.name), h('small', null, `${money(avail)} left each month`)), fill, input) };
  }), rows0 = rows;
  // part of the budget that is paid only every few months: the budget already holds it, this only says when it is paid so its share is kept back
  const dlgRef = {}, cur = cat.lump, tAmt = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '100', value: cur ? String(cur.amount) : '', placeholder: 'Amount each time ₹', 'aria-label': 'Payment made every few months' });
  const tEvery = h('select', { 'aria-label': 'Paid every' }, [2, 3, 4, 6, 12].map((n) => h('option', { value: String(n), selected: (cur ? cur.every : 3) === n ? '' : null }, n === 12 ? 'every year' : n === 3 ? 'every 3 months (quarter end)' : `every ${n} months`)));
  const tAt = h('select', { 'aria-label': 'Paid in month' }, Array.from({ length: 12 }, (_, i) => h('option', { value: String(i + 1), selected: (cur && cur.at ? cur.at : 12) === i + 1 ? '' : null }, 'in ' + monthLabel('2026-' + String(i + 1).padStart(2, '0')).split(' ')[0])));
  const tNote = h('p', { class: 'pi-cat-sum' }), syncT = () => { tAt.style.display = tEvery.value === '12' ? '' : 'none'; const v = Number(tAmt.value) || 0; tNote.textContent = v > 0 ? `${money(Math.round(v / Number(tEvery.value)))} a month is kept back for it, inside the ${money(cat.base)} budget.` : ''; };
  [tAmt, tEvery].forEach((el) => el.addEventListener('input', syncT)); syncT();
  const timing = { el: h('details', { class: 'pi-edit pi-timing', open: cur ? '' : null }, h('summary', { class: 'chip-btn' }, 'Part of it is paid every few months'), h('p', { class: 'note' }, 'For maintenance paid at quarter end, say. The budget already includes it. Tell the planner how much and how often, so it keeps a share back each month and does not count it as free to spend.'), h('div', { class: 'pi-cat-fx' }, tAmt, tEvery), tAt, tNote) };
  const carryBox = h('input', { type: 'checkbox', checked: cat.carry ? '' : null, 'aria-label': 'Carry unused forward' }), carry = h('label', { class: 'pi-carry' }, carryBox, h('span', null, h('b', null, 'Carry unused forward'), h('small', null, 'Money set aside for this expense and not spent stays available next month and keeps adding up, like Travel. Off: each month starts fresh.')));
  const cov = h('b'), note = h('p', { class: 'pi-note' });
  const body = h('div', { class: 'form' }, h('div', { class: 'pi-pair' }, h('b', null, cat.name), h('span', { class: 'muted' }, `${basis(cat)} ${money(cat.base)} a month`)),
    cat.src === 'budget' ? null : h('p', { class: 'pi-note warn' }, 'No budget is set for this expense yet. ', h('a', { href: '#/flow/categories', onclick: () => { if (dlgRef.close) dlgRef.close(); } }, 'Set a budget'), ' and the plan follows it.'),
    h('p', { class: 'note', style: { margin: 0 } }, 'The amount comes from the category budget. Split it across your income. Each month the income that really arrives pays in the order of the list, so these amounts are a plan.'),
    rows.length ? h('div', { class: 'pi-srows' }, rows.map((r) => r.el)) : h('p', { class: 'empty' }, 'No passive income to pay from yet.'), h('div', { class: 'pi-live' }, h('span', null, 'Covered'), cov), note, carry, timing.el);
  let ok = true;
  const dlg = dlgRef.dlg = dialog('Pay ' + cat.name + ' from', body, [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Save', class: 'primary', onclick: (c) => { if (!ok) return; c(); setAllocs(catName, new Map(rows.map((r) => [r.s.key, Number(r.input.value) || 0])), (p) => { const k = catName.toLowerCase(), v = Number(tAmt.value) || 0, e = { ...(p.expense[k] || { name: catName }) }; if (v > 0) e.lump = { amount: v, every: Number(tEvery.value), ...(tEvery.value === '12' ? { at: Number(tAt.value) } : {}) }; else delete e.lump; if (carryBox.checked) e.carry = true; else delete e.carry; if (e.mode === 'fixed' || e.lump || e.carry) p.expense[k] = e; else delete p.expense[k]; }); } }]);
  dlgRef.close = dlg.close; const saveBtn = dlg.el.querySelector('footer .primary');
  function check() {
    const tot = rows.reduce((a, r) => a + (Number(r.input.value) || 0), 0), bad = rows.find((r) => (Number(r.input.value) || 0) > r.avail + 0.5);
    ok = !bad; cov.textContent = cat.base > 0 ? `${money(tot)} of ${money(cat.base)} (${Math.round((tot / cat.base) * 100)}%)` : money(tot); cov.className = cat.base > 0 && tot >= cat.base - 0.5 ? 'pos' : '';
    note.textContent = bad ? `${bad.s.name} only has ${money(bad.avail)} left each month. Lower the amount, or free some up from another expense.` : cat.base > 0 && tot > cat.base * 1.02 ? `That is more than ${cat.name} costs (${money(cat.base)}). Allowed, but the extra is not needed.` : '';
    note.className = 'pi-note ' + (bad ? 'bad' : note.textContent ? 'warn' : ''); if (saveBtn) saveBtn.disabled = !ok;
    rows.forEach((r) => r.el.classList.toggle('bad', (Number(r.input.value) || 0) > r.avail + 0.5));
  }
  rows.forEach((r) => r.input.addEventListener('input', check)); check(); setTimeout(() => { const f = rows.find((r) => r.avail > 0) || rows[0]; if (f) { f.input.focus(); f.input.select(); } }, 60);
}
function setAllocs(catName, amounts, after) {
  mutate((d) => {
    const p = P.planOf(d, S.all);
    for (const [src, amount] of amounts) {
      const i = p.alloc.findIndex((a) => a.src === src && a.cat.toLowerCase() === catName.toLowerCase());
      if (amount <= 0) { if (i >= 0) p.alloc.splice(i, 1); } else if (i >= 0) p.alloc[i].amount = amount; else p.alloc.push({ id: P.newId(p.alloc, 'pa'), src, cat: catName, amount });
    }
    if (!p.from) p.from = C.monthKey(S.all.asOf);
    if (after) after(p);
    P.savePlan(d, p);
  });
  toast('Allocation saved');
}
const setPlan = (fn) => mutate((d) => { const p = P.planOf(d, S.all); fn(p); P.savePlan(d, p); });
/** Other passive income typed in (rent, dividends...). */
function extraForm(x) {
  formDialog({ title: x ? 'Edit ' + x.name : 'Add passive income', value: x || { freq: 'monthly' },
    fields: [{ key: 'name', label: 'Name', required: true, hint: 'For example Rent from flat, Dividends.' }, { key: 'amount', label: 'Amount each time it is credited (₹)', type: 'number', required: true, half: true },
      { key: 'freq', label: 'Credited', type: 'select', half: true, options: Object.entries(P.FREQ_LABEL).map(([value, label]) => ({ value, label })) },
      { key: 'match', label: 'Find its bank credits by (optional)', hint: 'Words from the bank description. Without it the income is taken as received on time.' }],
    onSave: (v) => setPlan((p) => { const rec = { name: v.name.trim(), amount: Number(v.amount) || 0, freq: v.freq || 'monthly', match: (v.match || '').trim() }; if (x) Object.assign(p.extra.find((e) => e.id === x.extraId || e.id === x.id), rec); else p.extra.push({ id: P.newId(p.extra, 'x'), ...rec }); }),
    onDelete: x ? () => setPlan((p) => { p.extra = p.extra.filter((e) => e.id !== (x.extraId || x.id)); p.alloc = p.alloc.filter((a) => a.src !== 'x:' + (x.extraId || x.id)); }) : null });
}
/** How often an interest income line is credited (its amount is then divided to a monthly figure). */
function freqForm(s) {
  if (s.kind === 'other') { extraForm(s); return; }
  if (s.kind === 'bond') { dialog(s.name, h('div', null, h('ul', { class: 'pi-links' }, s.members.map((m) => h('li', null, h('span', null, h('b', null, m.name)), h('em', null, money(m.monthly) + ' / mo')))), h('p', { class: 'note' }, `These bonds pay ${s.freq === 'quarterly' ? 'every quarter' : 'every month'}. The planning figure is ${money(s.monthly)} a month after TDS. The payout of a bond is changed on the bond itself (Fixed income).`)), [{ label: 'Close', onclick: (c) => c() }]); return; }
  formDialog({ title: s.name, sub: 'Interest income line', value: { freq: s.freq }, fields: [{ key: 'freq', label: 'This line is credited', type: 'select', options: Object.entries(P.FREQ_LABEL).map(([value, label]) => ({ value, label })), hint: `The amount on the line is ${money(s.amount)}. Quarterly means ${money(s.amount / 3)} a month for planning.` }],
    onSave: (v) => setPlan((p) => { if (v.freq === 'monthly') delete p.freq[s.key]; else p.freq[s.key] = v.freq; }) });
}
function sourceTools(al) {
  return h('div', { class: 'pi-tools' },
    canEdit() ? h('button', { type: 'button', class: 'chip-btn', onclick: () => extraForm(null) }, '+ Add other income') : null,
    h('a', { class: 'chip-btn', href: '#/flow/categories' }, 'Expense budgets'),
    al.sources.length ? h('details', { class: 'pi-edit' }, h('summary', { class: 'chip-btn' }, 'Income settings'),
      h('div', { class: 'pi-edit-list' }, al.sources.map((s) => h('button', { type: 'button', class: 'pi-opt', onclick: () => (canEdit() ? freqForm(s) : null) }, h('i', { style: { background: srcColor(al, s.key) } }), h('span', null, h('b', null, s.name), h('small', null, `${P.FREQ_LABEL[s.freq]} · ${money(s.monthly)} a month`)))))) : null);
}

function overview(root, sm) {
  const { al } = sm, cov = sm.coverage, tot = al.totalIncome;
  const parts = ['bond', 'lending', 'other'].map((k) => [k, al.sources.filter((s) => s.kind === k).reduce((a, s) => a + s.monthly, 0)]).filter((x) => x[1] > 0).map(([k, v]) => `${compact(v)} ${k === 'bond' ? 'bonds' : k === 'lending' ? 'lending' : 'other'}`).join(' + ');
  root.append(h('div', { class: 'kpis pi-kpis' },
    kpi('Passive income', money(tot) + ' / mo', parts || 'Nothing yet', { tone: 'pos' }),
    kpi('Monthly expenses', money(al.expenses) + ' / mo', 'From your category budgets'),
    h('div', { class: 'kpi pi-cov' }, ring(cov, 76), h('div', null, h('span', { class: 'kpi-label' }, 'Coverage'), h('strong', { class: 'kpi-value ' + tone(cov) }, cov == null ? '–' : pct(cov, 1)), h('span', { class: 'kpi-sub' }, 'Target 100%'))),
    kpi('Unmapped expenses', money(sm.unmappedAmount) + ' / mo', al.unmapped.length ? `${al.unmapped.length} categor${al.unmapped.length === 1 ? 'y' : 'ies'} with no income` : 'Everything has income', { tone: al.unmapped.length ? 'neg' : 'pos', href: '#/passive/allocations' })));
  root.append(h('div', { class: 'pa-cards' }, al.sources.length ? al.sources.map((x) => {
    const mine = al.links.filter((l) => l.src === x.key).sort((a, b) => a.ord - b.ord);
    return h('section', { class: 'pa-card', style: { '--c': srcColor(al, x.key) } },
      h('header', null, h('b', null, h('i'), x.name), h('span', { class: 'pa-n' }, money(x.monthly)), h('small', null, x.members ? x.sub : `${KIND[x.kind]} · ${P.FREQ_LABEL[x.freq]}`)),
      bar(x.monthly > 0 ? x.allocated / x.monthly : 0, x.over > 0.5 ? 'bad' : ''),
      mine.length ? h('ul', { class: 'pa-plan' }, mine.map((l) => { const c = al.cats.find((q) => q.name.toLowerCase() === l.cat.toLowerCase()); return h('li', null, h('i', { class: 'pb-rank' }, l.ord), h('span', null, l.cat, c && c.lump ? h('small', null, ` · ${money(c.lump.amount)} every ${c.lump.every === 12 ? 'year' : c.lump.every === 3 ? 'quarter' : c.lump.every + ' months'} included`) : null), h('em', null, money(l.amount))); })) : h('p', { class: 'empty' }, 'Nothing planned on this income yet.'),
      h('p', { class: 'pa-foot' + (x.over > 0.5 ? ' neg' : '') }, x.over > 0.5 ? `Over-allocated by ${money(x.over)}` : `${money(x.allocated)} allocated · ${money(Math.max(0, x.remaining))} still free`));
  }) : h('p', { class: 'empty' }, 'No passive income found yet.')));
  const needs = al.cats.filter((c) => c.base > 0 && c.funded < c.base - 0.5);
  root.append(section('Expenses', al.cats.filter((c) => c.base > 0).length ? h('div', null, h('div', { class: 'pi-tbl pi-plan-tbl' }, h('div', { class: 'pi-th' }, ['Expense', 'Budget / mo', 'From passive income', 'Gap'].map((t) => h('span', null, t))),
    al.cats.filter((c) => c.base > 0).map((c) => h('div', { class: 'pi-tr' }, h('span', null, h('b', null, c.name), h('small', null, c.src === 'budget' ? '' : ' · no budget yet')), h('span', null, money(c.base)), h('span', null, money(c.funded)), h('span', { class: c.base - c.funded > 0.5 ? 'neg' : 'pos' }, c.base - c.funded > 0.5 ? money(c.base - c.funded) : 'Covered'))),
    h('div', { class: 'pi-tr pi-total' }, h('span', null, h('b', null, 'Total')), h('span', null, money(al.expenses)), h('span', null, money(al.allocated)), h('span', { class: al.expenses - al.allocated > 0.5 ? 'neg' : 'pos' }, al.expenses - al.allocated > 0.5 ? money(al.expenses - al.allocated) : 'Covered'))),
    needs.length ? h('p', { class: 'note' }, `${needs.length} expense${needs.length === 1 ? ' still needs' : 's still need'} income. Connect ${needs.length === 1 ? 'it' : 'them'} on the Allocations tab.`) : h('p', { class: 'pi-ok' }, h('i', null, '✓'), 'Every expense has income planned.')) : h('p', { class: 'empty' }, 'Add budgets for your expense categories to see the plan here.'), h('a', { class: 'chip-btn', href: '#/passive/allocations' }, canEdit() ? 'Open allocations' : 'View details')));
  const sa = P.setAside(S.data, S.all, sm.cur).rows;
  if (sa.length) root.append(section('Kept aside every month', h('div', null, h('p', { class: 'note', style: { marginTop: 0 } }, 'Part of the plan paid only every few months. A share is put by each month, inside the budget.'),
    h('ul', { class: 'pa-plan' }, sa.map((q) => h('li', null, h('span', null, q.name, h('small', null, ` · ${money(q.amount)} ${q.every === 12 ? 'a year' : q.every === 3 ? 'every quarter' : 'every ' + q.every + ' months'}`)), h('em', null, money(q.share) + ' / mo')))))));
  const gap = sm.required, goal = h('div', { class: 'pi-goal ' + tone(cov) }, h('span', { class: 'pi-goal-t' }, h('b', null, 'Goal: fund every expense from passive income'),
    h('small', null, cov == null ? 'Add your income and expenses to begin.' : cov >= 1 ? `Reached. Passive income is ${money(tot - al.expenses)} above the monthly expenses.` : `${pct(cov, 1)} covered. Another ${money(gap)} a month of passive income is needed.`)), bar(cov || 0, tone(cov)));
  root.append(goal);
}
function salaryCard(sm) {
  const r = P.salaryProtection(S.data, S.all, sm.cur, (sm.hist.length > 1 ? sm.hist[sm.hist.length - 2].reserve : 0)), none = !(r.salary > 0);
  return section('Salary protection', h('div', null,
    h('div', { class: 'pi-sal' }, h('div', null, h('small', null, 'Salary this month'), h('b', null, none ? '–' : money(r.salary))), h('div', null, h('small', null, 'Invested'), h('b', { class: 'inv' }, money(r.invested))), h('div', null, h('small', null, 'Paid expenses'), h('b', { class: r.diverted > 0 ? 'neg' : 'pos' }, money(r.diverted))), h('div', null, h('small', null, 'Salary kept'), h('b', { class: r.protectedShare == null ? '' : r.protectedShare >= 0.999 ? 'pos' : 'warn' }, r.protectedShare == null ? '–' : pct(r.protectedShare, 0)))),
    h('p', { class: 'note' }, `Passive income paid ${money(r.funded)} of ${money(r.spent)} spent so far this month. ${r.diverted > 0 ? money(r.diverted) + ' had to come from salary.' : 'No salary was needed for expenses.'}${S.data.settings.passivePlan && P.planOf(S.data).carry && sm.hist.length > 1 && sm.hist[sm.hist.length - 2].reserve > 0 ? ' A reserve of ' + money(sm.hist[sm.hist.length - 2].reserve) + ' from earlier months was available.' : ''}`)));
}

// ---------- the board: one column per income, a card per expense it pays, in the order it pays them ----------
const snapshot = () => JSON.stringify((S.data.settings && S.data.settings.passivePlan) || null);
/** Runs a plan change and offers to take it back. */
function change(msg, fn) {
  const before = snapshot();
  mutate((d) => { const p = P.planOf(d, S.all); fn(p); if (!p.from) p.from = C.monthKey(S.all.asOf); P.savePlan(d, p); });
  toast(msg, '', { label: 'Undo', onClick: () => mutate((d) => { d.settings = d.settings || {}; if (before === 'null') delete d.settings.passivePlan; else d.settings.passivePlan = JSON.parse(before); }) });
}
/** Puts `cat` at place `idx` in the order of the expenses a source pays. */
function place(p, al, src, cat, idx) {
  const names = al.links.filter((l) => l.src === src && l.cat.toLowerCase() !== cat.toLowerCase()).sort((a, b) => a.ord - b.ord).map((l) => l.cat);
  names.splice(Math.max(0, Math.min(idx, names.length)), 0, cat); p.sorder[src] = names;
}
const setAmount = (p, src, cat, amount) => {
  const i = p.alloc.findIndex((a) => a.src === src && a.cat.toLowerCase() === cat.toLowerCase());
  if (amount <= 0) { if (i >= 0) p.alloc.splice(i, 1); } else if (i >= 0) p.alloc[i].amount = amount; else p.alloc.push({ id: P.newId(p.alloc, 'pa'), src, cat, amount });
};
/** One income paying one expense, from a card dropped into a column: how much, up to what the income has left. */
function pairSheet(al, srcKey, catName, idx) {
  const src = al.sources.find((x) => x.key === srcKey), cat = al.cats.find((c) => c.name === catName); if (!src || !cat) return;
  const avail = Math.max(0, Math.round(src.remaining)), need = Math.max(0, Math.round(cat.need));
  if (avail < 1) { toast(`${src.name} has nothing left to give. Free some from another expense first.`); return; }
  const input = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '100', value: String(Math.min(avail, need || avail)), class: 'pi-amt', 'aria-label': 'Amount per month' }), note = h('p', { class: 'pi-note' }), left = h('b');
  const chips = [['All that is left', avail], ...(need ? [['What it needs', Math.min(need, avail)]] : [])];
  const body = h('div', { class: 'form' }, h('div', { class: 'pi-pair' }, h('span', { class: 'pi-dotc', style: { background: srcColor(al, srcKey) } }), h('b', null, src.name), h('span', { class: 'muted' }, '→'), h('b', null, cat.name)),
    h('label', { class: 'pi-field' }, h('span', null, 'Pays towards it each month (₹)'), input), h('div', { class: 'chips-row' }, chips.map(([l, v]) => h('button', { type: 'button', class: 'chip-btn', onclick: () => { input.value = String(v); check(); } }, `${l} ${money(v)}`))),
    h('div', { class: 'pi-live' }, h('span', null, `${src.name} left after this`), left), note);
  let ok = true;
  const dlg = dialog('Allocate income', body, [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Save allocation', class: 'primary', onclick: (c) => { if (!ok) return; c(); const v = Number(input.value) || 0; change('Allocation saved', (p) => { setAmount(p, srcKey, catName, v); if (v > 0) place(p, al, srcKey, catName, idx == null ? 1e6 : idx); }); } }]);
  const save = dlg.el.querySelector('footer .primary');
  function check() { const v = Math.max(0, Number(input.value) || 0); ok = v <= avail + 0.5 && v > 0; left.textContent = money(avail - v); left.className = v > avail ? 'neg' : ''; note.textContent = v > avail ? `${src.name} only has ${money(avail)} left each month.` : ''; note.className = 'pi-note bad'; if (save) save.disabled = !ok; }
  input.addEventListener('input', check); check(); setTimeout(() => { input.focus(); input.select(); }, 60);
}

/** Drops a card: reorder inside a column, give an expense to an income, move it to another income, or take it back to Needs income. */
function drop(al, from, to, cat, idx) {
  if (from === to) { if (to === 'need') return; change('Order changed', (p) => place(p, al, to, cat, idx)); return; }
  if (to === 'need') { change(`${cat} is no longer paid from ${(al.sources.find((x) => x.key === from) || {}).name}`, (p) => setAmount(p, from, cat, 0)); return; }
  if (from === 'need') { pairSheet(al, to, cat, idx); return; }
  const a = al.links.find((l) => l.src === from && l.cat.toLowerCase() === cat.toLowerCase()), t = al.sources.find((x) => x.key === to); if (!a || !t) return;
  const room = Math.max(0, Math.round(t.remaining)), mine = al.links.find((l) => l.src === to && l.cat.toLowerCase() === cat.toLowerCase()), take = Math.min(a.amount, room);
  if (take < 1) { toast(`${t.name} has nothing left to give. Free some from another expense first.`); return; }
  change(take < a.amount ? `Moved ${money(take)} of ${money(a.amount)} (all that ${t.name} had left)` : `${cat} is now paid from ${t.name}`, (p) => { setAmount(p, from, cat, a.amount - take); setAmount(p, to, cat, (mine ? mine.amount : 0) + take); place(p, al, to, cat, idx); });
}

function board(al, ed) {
  const need = al.cats.filter((c) => c.base > 0 && c.funded < c.base - 0.5), cols = [{ key: 'need', name: 'Needs income' }, ...al.sources.map((x) => ({ key: x.key, name: x.name, src: x }))];
  for (const k of [...khide]) if (!cols.some((c) => c.key === k)) khide.delete(k);
  const scroller = h('div', { class: 'pk' }), wrap = h('div', { class: 'pk-wrap' });
  const bodies = new Map();
  const card = (colKey, c, link) => {
    const full = c.base > 0 && c.funded >= c.base - 0.5, st = c.funded === 0 ? (c.base > 0 ? 'none' : 'idle') : full ? 'full' : 'part', line = link ? srcColor(al, link.src) : 'var(--neg)';
    const li = h('li', { class: 'pk-card ' + st, 'data-cat': c.name, 'data-col': colKey, tabindex: ed ? '0' : null, style: { '--c': line }, role: ed ? 'button' : null,
      onclick: (e) => { if (ed && !li._dragged && !e.target.closest('.pk-grip')) expenseSheet(al, c.name); li._dragged = false; }, onkeydown: (e) => { if (ed && e.target === li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); expenseSheet(al, c.name); } } },
      h('div', { class: 'pk-h' }, ed ? h('span', { class: 'pk-grip', 'aria-hidden': 'true', title: 'Drag' }, '⠿') : null, link ? h('i', { class: 'pb-rank', title: 'Order this income pays in' }, link.ord) : null, h('b', null, c.name), h('span', { class: 'pk-amt' }, link ? money(link.amount) : money(c.need))),
      h('small', null, link ? `${basis(c)} ${money(c.base)} a month · ${c.base > 0 ? Math.round((c.funded / c.base) * 100) : 0}% funded` : c.funded > 0 ? `${money(c.funded)} of ${money(c.base)} funded` : `${basis(c)} ${money(c.base)} a month, no income yet`));
    return li;
  };
  const needTotal = need.reduce((a, c) => a + c.need, 0);
  for (const col of cols) {
    const x = col.src, list = h('ul', { class: 'pk-list' + (x ? '' : ' pk-needlist'), 'data-col': col.key });
    if (col.key === 'need') for (const c of need) list.append(card('need', c, null));
    else for (const l of al.links.filter((q) => q.src === col.key).sort((a, b) => a.ord - b.ord)) { const c = al.cats.find((k) => k.name.toLowerCase() === l.cat.toLowerCase()); if (c) list.append(card(col.key, c, l)); }
    if (!list.children.length) list.append(h('li', { class: 'pk-empty' }, col.key === 'need' ? 'Every expense has income.' : 'Drop an expense here.'));
    bodies.set(col.key, list);
    if (!x) { wrap.append(h('section', { class: 'pk-col need pk-needcard', 'data-col': 'need', hidden: khide.has('need') ? '' : null }, h('header', { class: 'pk-ch pk-nh' }, h('b', null, h('i'), 'Needs income'), h('span', { class: 'pk-n' }, money(needTotal), h('small', null, ` a month · ${need.length} expense${need.length === 1 ? '' : 's'}`))), h('div', { class: 'pk-body' }, list))); continue; }
    scroller.append(h('section', { class: 'pk-col', 'data-col': col.key, style: { '--c': srcColor(al, x.key) }, hidden: khide.has(col.key) ? '' : null },
      h('header', { class: 'pk-ch' }, h('b', null, h('i'), col.name), h('span', { class: 'pk-n' }, money(x.monthly), h('small', null, ' / mo')),
        bar(x.monthly > 0 ? x.allocated / x.monthly : 0, x.over > 0.5 ? 'bad' : ''), h('small', { class: x.over > 0.5 ? 'neg' : x.remaining < 1 ? 'pos' : '' }, x.over > 0.5 ? `${money(x.over)} over-allocated` : `${money(Math.max(0, x.remaining))} left · ${money(x.allocated)} allocated`)),
      h('div', { class: 'pk-body' }, list)));
  }
  // dragging a card: it follows the pointer, the column under it lights up and a line shows where it will land
  if (ed) wrap.addEventListener('pointerdown', (e) => {
    const cardEl = e.target.closest('.pk-card'); if (!cardEl || e.button > 0) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen'; if (touch && !e.target.closest('.pk-grip')) return;
    if (touch) e.preventDefault();
    const from = cardEl.dataset.col, cat = cardEl.dataset.cat, sx = e.clientX, sy = e.clientY; let ghost = null, mark = null, target = null, idx = 0, cx = sx, cy = sy, raf = 0;
    const colUnder = () => { const el = document.elementFromPoint(cx, cy); return el && el.closest ? el.closest('.pk-col') : null; };
    const aim = () => {
      const col = colUnder(); wrap.querySelectorAll('.pk-col.over').forEach((q) => q.classList.remove('over')); target = col ? col.dataset.col : null;
      if (mark) { mark.remove(); mark = null; } if (!col) return; col.classList.add('over');
      const list = bodies.get(target), cards = [...list.querySelectorAll('.pk-card')].filter((q) => q !== cardEl); idx = cards.length;
      for (let i = 0; i < cards.length; i++) { const r = cards[i].getBoundingClientRect(); if (cy < r.top + r.height / 2) { idx = i; break; } }
      if (target !== 'need') { mark = h('li', { class: 'pk-mark' }); const empty = list.querySelector('.pk-empty'); if (empty) empty.style.display = 'none'; if (cards[idx]) list.insertBefore(mark, cards[idx]); else list.append(mark); }
    };
    const tick = () => {
      raf = 0; const H = window.innerHeight, W = window.innerWidth; let moved = false;
      const dy = cy < 80 ? -14 : cy > H - 80 ? 14 : 0; if (dy) { window.scrollBy(0, dy); moved = true; }
      const sb = scroller.getBoundingClientRect(), dx = cx < sb.left + 50 ? -16 : cx > sb.right - 50 ? 16 : 0; if (dx && scroller.scrollWidth > scroller.clientWidth) { scroller.scrollLeft += dx; moved = true; }
      const col = colUnder(), body = col && col.querySelector('.pk-body'); if (body) { const r = body.getBoundingClientRect(), by = cy < r.top + 40 ? -12 : cy > r.bottom - 40 ? 12 : 0; if (by && body.scrollHeight > body.clientHeight) { body.scrollTop += by; moved = true; } }
      if (moved) { aim(); raf = requestAnimationFrame(tick); }
    };
    const begin = () => {
      const r = cardEl.getBoundingClientRect(); ghost = cardEl.cloneNode(true); ghost.classList.add('pk-ghost'); ghost.style.width = r.width + 'px'; ghost.dataset.dx = String(sx - r.left); ghost.dataset.dy = String(sy - r.top); document.body.append(ghost);
      cardEl.classList.add('pk-ph'); cardEl._dragged = true; document.body.classList.add('pi-dragging');
    };
    const move = (ev) => {
      cx = ev.clientX; cy = ev.clientY;
      if (!ghost) { if (!touch && Math.hypot(cx - sx, cy - sy) < 6) return; begin(); }
      ghost.style.left = cx - Number(ghost.dataset.dx) + 'px'; ghost.style.top = cy - Number(ghost.dataset.dy) + 'px'; aim(); if (!raf) raf = requestAnimationFrame(tick);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (!ghost) return; const t = target; ghost.remove(); if (mark) mark.remove(); cardEl.classList.remove('pk-ph'); document.body.classList.remove('pi-dragging'); wrap.querySelectorAll('.pk-col.over').forEach((q) => q.classList.remove('over')); wrap.querySelectorAll('.pk-empty').forEach((q) => { q.style.display = ''; });
      if (ev.type === 'pointerup' && t) drop(al, from, t, cat, idx);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
  // every column is shown; switch one off to focus on the others (on a phone, when there is no room across)
  const toggle = (k) => { if (khide.has(k)) khide.delete(k); else if (cols.length - khide.size > 1) khide.add(k); window.dispatchEvent(new Event('rerender')); };
  const filter = h('nav', { class: 'pk-filter seg', 'aria-label': 'Columns shown' }, h('button', { type: 'button', class: khide.size === 0 ? 'on' : '', onclick: () => { khide.clear(); window.dispatchEvent(new Event('rerender')); } }, 'All'),
    cols.map((c) => h('button', { type: 'button', class: khide.has(c.key) ? '' : 'on', 'aria-pressed': khide.has(c.key) ? 'false' : 'true', onclick: () => toggle(c.key) }, c.name, c.key === 'need' ? ` ${need.length}` : '')));
  wrap.prepend(filter); wrap.append(scroller);
  return wrap;
}

function allocations(root, sm) {
  const al = sm.al, ed = canEdit();
  root.append(h('div', { class: 'kpis pi-kpis' }, kpi('Passive income', money(al.totalIncome) + ' / mo', 'planning figure', { tone: 'pos' }), kpi('Allocated', money(al.allocated), al.totalIncome > 0 ? pct(al.allocated / al.totalIncome, 0) + ' of income' : '', { tone: al.allocated > 0 ? 'pos' : '' }),
    kpi('Unallocated', money(al.unallocated), al.unallocated > 1 ? 'not paying any expense yet' : 'all of it has a job', { tone: al.unallocated > 1 ? 'warn' : 'pos' }), kpi('Unmapped expenses', money(sm.unmappedAmount) + ' / mo', al.unmapped.length ? `${al.unmapped.length} with no income` : 'none', { tone: al.unmapped.length ? 'neg' : 'pos' })));
  root.append(h('div', { class: 'pi-row' }, h('p', { class: 'pi-help', style: { flex: '1 1 260px' } }, ed ? 'Drag an expense into an income to pay it from there. Move it up or down to change the order (1 is paid first), or back to Needs income to take it off. Tap a card to split it across incomes; on a phone drag by the handle. Amounts are a plan: a smaller month pays the top cards first.' : 'Only the owner can change allocations.'), sourceTools(al)));
  const nob = al.cats.filter((c) => c.base > 0 && c.src === 'usual');
  if (nob.length) root.append(h('p', { class: 'pi-note warn' }, `Expenses come from your category budgets. ${nob.length} ha${nob.length === 1 ? 's' : 've'} no budget yet, so the plan has no exact figure for: ${nob.slice(0, 4).map((c) => c.name).join(', ')}${nob.length > 4 ? '…' : ''}. `, h('a', { href: '#/flow/categories' }, 'Set budgets')));
  root.append(board(al, ed));
  if (al.orphans.length) root.append(section('Needs a look', h('div', null, h('p', { class: 'note' }, 'These point to income or an expense that is gone (a bond that ended, say).'), h('ul', { class: 'pi-links' }, al.orphans.map((o) => h('li', null, h('span', null, `${o.src} → ${o.cat}`), h('em', null, money(o.amount)), ed ? h('button', { type: 'button', class: 'chip-btn small', onclick: () => setPlan((p) => { p.alloc = p.alloc.filter((a) => a.id !== o.id); }) }, 'Remove') : null))))));
}

const PERIODS = [['this', 'This month'], ['last', 'Last month'], ['3', '3 months'], ['6', '6 months'], ['ytd', 'Year to date'], ['12', '12 months']];
function periodMonths(cur) {
  const prev = (n) => Array.from({ length: n }, (_, i) => C.addMonths(cur + '-01', i - n)).map((d) => (typeof d === 'string' ? d.slice(0, 7) : C.monthKey(d)));
  if (period === 'this') return [cur];
  if (period === 'last') return prev(1);
  if (period === '3') return prev(3);
  if (period === '6') return prev(6);
  if (period === '12') return prev(12);
  return Array.from({ length: Number(cur.slice(5)) }, (_, i) => cur.slice(0, 4) + '-' + String(i + 1).padStart(2, '0'));
}

/** The only place that talks about actuals: how the months went against the plan, income by income. */
function progress(root, sm) {
  const cur = sm.cur, months = periodMonths(cur), r = P.progressReport(S.data, S.all, months), one = months.length === 1, al = sm.al, n = Math.max(1, months.length), live = months.includes(cur);
  root.append(h('div', { class: 'pi-row' }, h('nav', { class: 'seg pi-periods', 'aria-label': 'Period' }, PERIODS.map(([k, t]) => h('button', { type: 'button', class: period === k ? 'on' : '', onclick: () => { period = k; window.dispatchEvent(new Event('rerender')); } }, t)))));
  const incomeSub = live ? `${money(r.credited)} credited so far` : 'credited in the period';
  root.append(h('div', { class: 'kpis pi-kpis' },
    kpi('Passive income', money(live ? r.income : r.credited), live ? `incl. projected · ${incomeSub}` : incomeSub, { tone: 'pos' }),
    kpi('Spent', money(r.spent), `${monthLabel(months[0], true)}${one ? '' : ' – ' + monthLabel(months[months.length - 1], true)}`),
    kpi('From your pocket', money(r.pocket), r.pocket > 0.5 ? 'passive income was not enough' : 'passive income covered it', { tone: r.pocket > 0.5 ? 'neg' : 'pos' }),
    kpi('More income needed', money(Math.ceil(r.pocket / n)) + ' / mo', r.pocket > 0.5 ? 'would have covered it' : 'nothing more needed', { tone: r.pocket > 0.5 ? 'warn' : 'pos' })));
  root.append(h('div', { class: 'pa-ind' }, h('div', null, h('small', null, one ? 'Unused this month' : 'Unused in the period'), h('b', null, money(r.left)), h('em', null, 'allocated but not spent')),
    h('div', null, h('small', null, 'Unused from earlier months'), h('b', null, money(r.earlier)), h('em', null, `before ${monthLabel(months[0], true)}, not added to this plan`))));
  const row = (x) => {
    const lvl = x.over > 0.5 ? 'bad' : x.short > 0.5 ? 'mid' : 'ok';
    return h('li', { class: 'pa-row ' + lvl }, h('div', { class: 'pa-top' }, h('b', null, x.cat), h('span', { class: 'pa-st ' + lvl }, x.over > 0.5 ? `Over by ${money(x.over)}` : x.short > 0.5 ? 'Income fell short' : x.left > 0.5 && one ? `${money(x.left)} unused` : 'On plan')),
      bar(x.allowed > 0 ? x.spent / Math.max(x.allowed, x.spent) : x.spent > 0 ? 1 : 0, lvl === 'ok' ? 'ok' : lvl),
      h('div', { class: 'pa-sub' }, h('span', null, `Planned ${money(x.planned)}${one ? '' : ' in all'}`), h('span', null, `Spent ${money(x.spent)}`)),
      x.earlier > 0.5 && one ? h('p', { class: 'pa-note earlier' }, `Plus ${money(x.earlier)} unused from earlier months (separate, not added to this month).`) : null,
      x.short > 0.5 ? h('p', { class: 'pa-note' }, `This income paid only ${money(x.paid)} of the ${money(x.planned)} planned.`) : null,
      x.left > 0.5 && x.over < 0.5 ? h('p', { class: 'pa-note' }, `${money(x.left)} of the plan was not used${one ? ' this month' : ' in the period'}.`) : null,
      x.lump && x.lumpDue ? h('p', { class: 'pa-note' }, 'Includes the payment that falls due this month.') : null);
  };
  root.append(h('div', { class: 'pa-cards' }, r.sources.length ? r.sources.map((x) => h('section', { class: 'pa-card', style: { '--c': srcColor(al, x.key) } },
    h('header', null, h('b', null, h('i'), x.name), h('span', { class: 'pa-n' }, money(live ? Math.max(x.expected, x.received) : x.received)), h('small', null, live ? `${money(x.received)} credited of ${money(x.expected)} expected${x.expected > x.received + 1 ? ', rest projected' : ''}` : `${money(x.received)} credited`)),
    x.rows.length ? h('ul', { class: 'pa-list' }, x.rows.map(row)) : h('p', { class: 'empty' }, 'No expense is planned on this income.'),
    x.short > 0.5 ? h('p', { class: 'pa-foot neg' }, `${money(x.short)} short of what was allocated to it.`) : x.unused > 0.5 ? h('p', { class: 'pa-foot' }, `${money(x.unused)} of this income was not used.`) : null)) : h('p', { class: 'empty' }, 'No passive income found yet.')));
  if (r.cats.length) {
    const sorted = r.cats.slice().sort((a, b) => (b.carry - a.carry) || b.spent - a.spent);
    const card = (c) => {
      const lvl = c.over > 0.5 ? 'bad' : c.pocket > 0.5 || c.short > 0.5 ? 'mid' : 'ok', pool = c.bf + c.planned;
      const eq = c.carry
        ? [['Brought forward', money(c.bf)], [one ? 'Set aside' : 'Set aside in all', '+ ' + money(c.planned)], ['Spent', '− ' + money(c.spent)], ['Carried forward', money(c.left), 'tot']]
        : [['Planned', money(c.planned)], ['Spent', money(c.spent)], [c.over > 0.5 ? 'Over' : one ? 'Unused' : 'Unused in all', money(c.over > 0.5 ? c.over : Math.max(0, c.planned - c.spent))], null];
      return h('section', { class: 'pa-cat ' + lvl },
        h('header', null, h('b', null, c.name, c.carry ? h('span', { class: 'pa-tag' }, 'carries forward') : null), h('span', { class: 'pa-st ' + lvl }, c.over > 0.5 ? `Over by ${money(c.over)}` : c.pocket > 0.5 ? `${money(c.pocket)} from pocket` : c.short > 0.5 ? 'Income fell short' : 'Covered')),
        bar(pool > 0 ? c.spent / Math.max(pool, c.spent) : c.spent > 0 ? 1 : 0, lvl),
        h('dl', { class: 'pa-eq' }, eq.filter(Boolean).map(([t, v, k]) => h('div', { class: k || '' }, h('dt', null, t), h('dd', null, v)))),
        c.carry && !one ? h('ul', { class: 'pa-mini' }, c.months.map((m) => h('li', null, h('span', null, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.month.slice(5)) - 1] + ' ' + m.month.slice(2, 4)), h('span', null, `${money(m.bf)} + ${money(m.planned)} − ${money(m.spent)}`), h('b', null, money(m.left))))) : null,
        h('p', { class: 'pa-note' }, 'Met from ' + (c.sources.length ? c.sources.map((x) => `${x.name} ${money(x.paid)} of ${money(x.planned)}`).join(' · ') : 'no income') + (c.fromBalance > 0.5 ? `; ${money(c.fromBalance)} came from the balance carried forward` : '') + '.'));
    };
    root.append(section('Expense by expense', h('div', null, h('p', { class: 'note', style: { marginTop: 0 } }, 'How each expense was met: which income paid it, what it left over, and for expenses set to carry forward, the balance that builds up. Turn carrying on or off from the expense in Allocations.'), h('div', { class: 'pa-cats' }, sorted.map(card)))));
  }
  if (r.unplanned.length) root.append(h('section', { class: 'pa-card bad' }, h('header', null, h('b', null, 'Not planned on any income'), h('small', null, 'Paid from your pocket')),
    h('ul', { class: 'pa-list' }, r.unplanned.map((u) => h('li', { class: 'pa-row bad' }, h('div', { class: 'pa-top' }, h('b', null, u.cat), h('span', { class: 'pa-st bad' }, money(u.spent))))))));
  if (!one) root.append(section('Month by month', h('div', { class: 'pi-tbl' }, h('div', { class: 'pi-th' }, ['Month', 'Income', 'Spent', 'From pocket'].map((t) => h('span', null, t))),
    r.per.slice().reverse().map((m) => h('div', { class: 'pi-tr' }, h('span', null, monthLabel(m.month, true)), h('span', null, money(m.past ? m.credited : m.income)), h('span', null, money(m.spent)), h('span', { class: m.pocket > 0.5 ? 'neg' : 'pos' }, m.pocket > 0.5 ? money(m.pocket) : 'None'))))));
  const sa = P.setAside(S.data, S.all, months[months.length - 1]);
  if (sa.rows.length) root.append(section('Set aside for later payments', h('div', null,
    h('p', { class: 'note', style: { marginTop: 0 } }, `Part of the plan paid only every few months, such as maintenance at quarter end or a yearly fee. It builds up a little each month and is used when the payment falls due. ${money(sa.total)} should be put by as of ${monthLabel(months[months.length - 1], true)}.`),
    h('ul', { class: 'pa-list' }, sa.rows.map((q) => h('li', { class: 'pa-row ' + (q.due ? 'mid' : 'ok') },
      h('div', { class: 'pa-top' }, h('b', null, q.name), h('span', { class: 'pa-st ' + (q.due ? 'mid' : 'ok') }, q.due ? 'Falls due this month' : money(q.accrued) + ' put by')),
      bar(q.amount > 0 ? q.accrued / q.amount : 0, q.due ? 'mid' : 'ok'),
      h('div', { class: 'pa-sub' }, h('span', null, `${money(q.share)} a month`), h('span', null, q.kind === 'yearly' ? `${money(q.accrued)} of ${money(q.amount)} a year` : `${money(q.accrued)} of ${money(q.amount)} every ${q.every === 3 ? 'quarter' : q.every === 12 ? 'year' : q.every + ' months'}`)),
      h('p', { class: 'pa-note' }, q.note + '.')))))));
  root.append(salaryCard(sm));
}
export function render() {
  const tab = subTab(TABS.map((t) => t[0])), root = h('div', { class: 'page pi' });
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Passive income views'), h('p', { class: 'pi-sub' }, 'Pay the household from passive income. Keep the salary invested.')));
  const sm = P.summary(S.data, S.all);
  if (tab === 'overview') overview(root, sm); else if (tab === 'allocations') allocations(root, sm); else progress(root, sm);
  return root;
}
