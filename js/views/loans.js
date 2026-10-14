// Loans you owe: add/edit, interest you pay each month, and a Home card showing net monthly inflow.
import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, section, table, btn, formDialog, canEdit, stat, kpi, rowList } from '../ui.js';
import { hbars } from '../charts.js';

export const LOAN_KINDS = ['Home loan', 'Personal loan', 'Vehicle loan', 'Gold loan', 'Education loan', 'Borrowed privately', 'Other'];

export function loanForm(l) {
  const isNew = !l;
  formDialog({
    title: isNew ? 'Add loan' : 'Edit ' + l.name, value: l || { kind: 'Personal loan', useFor: 'Own use' },
    fields: [
      { key: 'name', label: 'Loan name', required: true, hint: 'For example: Housing loan (SBI)' },
      { key: 'kind', label: 'Type', type: 'select', options: LOAN_KINDS },
      { key: 'amount', label: 'Outstanding now (₹)', type: 'number', required: true },
      { key: 'rate', label: 'Interest rate a year (0.084 = 8.4%)', type: 'number', required: true },
      { key: 'emi', label: 'Monthly EMI (₹, if any)', type: 'number', hint: 'Leave empty for interest-only loans.' },
      { key: 'useFor', label: 'Used for', type: 'select', options: ['Own use', 'Lent out to earn interest'] },
      { key: 'lender', label: 'Lender', half: true }, { key: 'startDate', label: 'Taken on', type: 'date', half: true },
      { key: 'note', label: 'Note' },
    ],
    onSave: (v) => mutate((d) => {
      v.rate = v.rate || 0; v.amount = v.amount || 0; v.emi = v.emi || 0;
      if (isNew) d.liabilities.push({ id: nextId('l', d.liabilities), ...v }); else Object.assign(d.liabilities.find((x) => x.id === l.id), v);
    }),
    onDelete: isNew ? null : () => mutate((d) => { d.liabilities = d.liabilities.filter((x) => x.id !== l.id); }),
  });
}

/** Full Loans page content (Fixed income → Loans). */
export function view(root) {
  const { all } = S; const ln = all.loans;
  root.append(h('div', { class: 'stats' },
    stat('You owe', money(ln.total), ln.items.length + ' loans'),
    h('div', { class: 'stat out' }, h('span', { class: 'stat-label' }, 'Interest you pay each month'), h('strong', { class: 'stat-value neg' }, money(ln.monthlyInterest)), h('span', { class: 'stat-sub' }, money(ln.yearlyInterest) + ' a year · average ' + pct(ln.avgRate, 2))),
    stat('EMIs each month', money(ln.emi), ln.emi ? 'includes interest' : 'none entered')));
  root.append(section('Your loans', h('div', null, table([
    { label: 'Loan', host: true, get: (l) => l.name }, { label: 'Type', mob: 'under', get: (l) => l.kind || '' },
    { label: 'Outstanding', cls: 'r', get: (l) => money(l.amount), total: () => money(ln.total) },
    { label: 'Rate', mob: 'under', mlabel: 'rate ', cls: 'r', get: (l) => (l.rate * 100).toFixed(2) + '%' },
    { label: 'Interest / month', cls: 'r neg', get: (l) => money(l.monthlyInterest), total: () => money(ln.monthlyInterest) },
    { label: 'EMI', mob: 'under', mlabel: 'EMI ', cls: 'r', get: (l) => (l.emi ? money(l.emi) : '–'), total: () => money(ln.emi) },
    { label: 'Used for', mob: 'under', mlabel: 'for ', get: (l) => l.useFor || '' },
  ], ln.items, { footer: { label: 'Total' }, onRow: canEdit() ? (l) => loanForm(S.data.liabilities.find((x) => x.id === l.id)) : null }),
    h('p', { class: 'note' }, 'Monthly interest is outstanding × rate ÷ 12. When you pay principal, update the outstanding amount so interest stays right.')),
    canEdit() ? [btn('Add loan', () => loanForm(), 'primary')] : null));
  const lent = ln.items.filter((l) => /lent/i.test(l.useFor || ''));
  if (lent.length) root.append(section('Borrowed to lend', h('p', { class: 'note' }, `You pay ${money(lent.reduce((a, l) => a + l.monthlyInterest, 0))} a month on loans used for lending. This is deducted from your monthly inflow on Home.`)));
}

/** Home card: what comes in, what goes out as loan interest, and what is left. */
export function homeCard(all) {
  const ln = all.loans, inn = all.cfTotal.perMonth, net = inn - ln.monthlyInterest;
  const rows = ln.items.filter((l) => l.monthlyInterest > 0).sort((a, b) => b.monthlyInterest - a.monthlyInterest);
  return section('Monthly inflow after loan interest', h('div', null,
    h('div', { class: 'trio' },
      h('div', null, h('span', { class: 'mini-title' }, 'Interest in'), h('b', { class: 'pos' }, money(inn))),
      h('div', null, h('span', { class: 'mini-title' }, 'Loan interest out'), h('b', { class: 'neg' }, '− ' + money(ln.monthlyInterest))),
      h('div', null, h('span', { class: 'mini-title' }, 'Net inflow'), h('b', { class: net >= 0 ? 'pos' : 'neg' }, money(net)))),
    rows.length ? hbars(rows.map((l) => ({ label: l.name, value: l.monthlyInterest, ci: 1 })), { fmt: (v) => money(v) + ' /mo' }) : h('p', { class: 'empty' }, 'No loans added yet.'),
    h('p', { class: 'note' }, `You owe ${money(ln.total)} at ${pct(ln.avgRate, 2)} on average.` ), 
    h('p', null, h('a', { href: '#/fixed/loans' }, 'See all loans'))));
}
