import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { h, money, dateStr, pct, section, table, btn, formDialog, canEdit, toast, stat, segTabs, subTab, dialog, confirmDialog, posNeg, datalistId } from '../ui.js';
import { closeForm, reopen } from './closing.js';

const FREQ = ['Monthly', 'Quarterly', 'Yearly', 'Daily'];
const rerender = () => window.dispatchEvent(new Event('rerender'));

/** Close a bond, FD or loan: record what came back, optionally credit a bank account, keep it in the Closed list. */
function closeItem(key, kind, it, suggested, label) {
  closeForm({
    title: 'Close ' + it.name, amount: suggested, desc: `${label} closed: ${it.name}`,
    hint: key === 'lending' && it.principal < 0 ? 'You borrowed this to lend onward. Enter what you paid back, as a positive amount.' : 'Suggested: the amount plus interest added so far. Change it to what you actually got back.',
    apply: (d, v, lid) => { const t = d[key].find((x) => x.id === it.id); t.closed = { date: v.date, amount: v.amount, acct: v.acct || '', ledgerId: lid, note: v.note || '' }; },
  });
}
function bondForm(b) {
  const isNew = !b;
  formDialog({
    title: isNew ? 'Add bond' : 'Edit ' + b.name, value: b || { credit: 'Monthly', depositDate: C.todayISO(), principal: 200000 },
    fields: [
      { key: 'name', label: 'Name', required: true, hint: 'For example Navi_Aug26_Aug29' }, { key: 'holder', label: 'Account holder', required: true },
      { key: 'platform', label: 'Bought through', required: true, hint: 'Golden Pi, Groww, AIOnion…' }, { key: 'company', label: 'Issuer', required: true },
      { key: 'principal', label: 'Amount invested (₹)', type: 'number', required: true }, { key: 'rate', label: 'Interest rate (0.1075 = 10.75%)', type: 'number', required: true },
      { key: 'credit', label: 'Interest paid', type: 'select', options: ['Monthly', 'Quarterly'] },
      { key: 'depositDate', label: 'Bought on', type: 'date', required: true }, { key: 'maturityDate', label: 'Matures on', type: 'date', required: true },
    ],
    onSave: (v) => mutate((d) => { if (isNew) d.bonds.push({ id: nextId('b', d.bonds), ...v }); else Object.assign(d.bonds.find((x) => x.id === b.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.bonds = d.bonds.filter((x) => x.id !== b.id); }),
    deleteMessage: 'Delete this bond completely? Use “Close it” instead to keep a history.',
    extraActions: isNew ? [] : [{ label: 'Close it', onclick: () => closeItem('bonds', 'b', b, b.principal, 'Bond') }],
  });
}

function depositForm(kind, it) {
  const key = kind === 'fd' ? 'fds' : 'lending';
  const isNew = !it;
  formDialog({
    title: (isNew ? 'Add ' : 'Edit ') + (kind === 'fd' ? 'fixed deposit' : 'private lending'), value: it || { tenureType: 'Years', compound: 'Yearly', interestType: 'Compound', account: kind === 'fd' ? 'HUF' : 'Private', depositDate: C.todayISO() },
    fields: [
      { key: 'name', label: 'Name', required: true },
      kind === 'fd' ? { key: 'issuer', label: 'Bank / issuer (optional)', list: datalistId('issuer-list', S.data.fds.map((x) => x.issuer)), hint: 'Used only to group deposits for your risk limits. Leave empty and the app works it out from the name.' } : { key: 'borrower', label: 'Lent to (optional)', list: datalistId('borrower-list', S.data.lending.map((x) => x.borrower)), hint: 'The person or company. Several loans to the same one are added together for your risk limits. Leave empty and the app uses the name.' },
      { key: 'account', label: kind === 'fd' ? 'Account holder' : 'Type', type: kind === 'fd' ? 'text' : 'select', options: ['Private', 'Family'], required: true },
      { key: 'principal', label: 'Amount (₹)', type: 'number', required: true, hint: kind === 'lending' ? 'Use a negative amount for money you borrowed to lend onward.' : '' },
      { key: 'rate', label: 'Interest rate (0.086 = 8.6%)', type: 'number', required: true },
      { key: 'interestType', label: 'Interest', type: 'select', options: [{ value: 'Compound', label: 'Added to the balance (compound)' }, { value: 'Payout', label: 'Paid out regularly' }] },
      { key: 'compound', label: 'Compounding / payout', type: 'select', options: FREQ },
      { key: 'tenure', label: 'Tenure', type: 'number', half: true, required: true }, { key: 'tenureType', label: 'Tenure unit', type: 'select', options: ['Years', 'Months', 'Days'], half: true },
      { key: 'depositDate', label: 'Started on', type: 'date', required: true }, { key: 'maturityDate', label: 'Matures on', type: 'date', required: true },
    ],
    onSave: (v) => mutate((d) => {
      const opt = kind === 'fd' ? 'issuer' : 'borrower';
      v[opt] = String(v[opt] || '').trim(); const keep = v[opt]; if (!keep) delete v[opt];
      if (isNew) d[key].push({ id: nextId(kind === 'fd' ? 'fd' : 'ln', d[key]), ...v });
      else { const t = d[key].find((x) => x.id === it.id); Object.assign(t, v); delete t.accruedOverride; if (!keep) delete t[opt]; }
    }),
    onDelete: isNew ? null : () => mutate((d) => { d[key] = d[key].filter((x) => x.id !== it.id); }),
    deleteMessage: 'Delete this completely? Use “Close it” instead to keep a history.',
    extraActions: isNew ? [] : [{ label: 'Close it', onclick: () => { const calc = C.calcDeposit(it, C.todayISO()); closeItem(key, kind, it, calc.interestType === 'Payout' ? it.principal : calc.value, kind === 'fd' ? 'Fixed deposit' : 'Loan'); } }],
  });
}

function receivableForm(r) {
  const isNew = !r;
  formDialog({
    title: isNew ? 'Add money to receive' : 'Edit ' + r.name, value: r || { term: 'Monthly', dueDay: 1, active: true },
    fields: [
      { key: 'name', label: 'From', required: true }, { key: 'balanceDue', label: 'Balance with them (₹)', type: 'number' },
      { key: 'expected', label: 'Payment expected each time (₹)', type: 'number', required: true }, { key: 'term', label: 'How often', type: 'select', options: ['Monthly', 'Yearly'] },
      { key: 'dueDay', label: 'Day of month it is due', type: 'number', half: true }, { key: 'startDate', label: 'Started on', type: 'date', half: true },
      { key: 'dueDate', label: 'Next due date (yearly payments only)', type: 'date' },
      { key: 'lastReceived', label: 'Last received on', type: 'date' }, { key: 'active', label: 'Still active', type: 'checkbox' },
    ],
    onSave: (v) => mutate((d) => { if (isNew) d.receivables.push({ id: nextId('rc', d.receivables), ...v }); else Object.assign(d.receivables.find((x) => x.id === r.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.receivables = d.receivables.filter((x) => x.id !== r.id); }),
    extraActions: isNew || r.active === false ? [] : [{ label: 'Close it', onclick: () => { mutate((d) => { const t = d.receivables.find((x) => x.id === r.id); t.active = false; t.closedOn = C.todayISO(); }); toast('Closed. It is now in the Closed list.'); } }],
  });
}

import * as loans from './loans.js';
const TABS = [['bonds', 'Bonds'], ['fds', 'FDs'], ['lending', 'Lendings'], ['loans', 'Loans'], ['closed', 'Closed']];
export function render() {
  const { all, data } = S;
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Fixed income views')));
  if (tab === 'closed') { closedView(root); return root; }
  if (tab === 'loans') { loans.view(root); return root; }
  const f = all.fixed;
  const stats = {
    bonds: () => h('div', { class: 'stats' }, stat('Bonds', money(f.bondPrincipal), `${all.bonds.length} bonds`), stat('Interest a month', money(all.cashflow[3].perMonth), 'before TDS')),
    fds: () => h('div', { class: 'stats' }, stat('Fixed deposits', money(f.fdPrincipal), `${all.fds.length} FDs`), stat('Interest added so far', money(all.fds.reduce((a, x) => a + (x.accrued || 0), 0)), 'on top of the amount')),
    lending: () => h('div', { class: 'stats' }, stat('Lent out', money(f.lendPrincipal), `${all.lending.filter((l) => l.principal > 0).length} loans given`), stat('Interest added so far', money(all.lending.reduce((a, x) => a + (x.accrued || 0), 0)), 'on top of the amount')),
  };
  if (stats[tab]) root.append(stats[tab]());

  if (tab === 'bonds') root.append(section('Bonds',
    table([
      { label: 'Bond', host: true, get: (b) => b.name },
      { label: 'Holder', mob: 'under', get: (b) => b.holder },
      { label: 'Via', mob: 'under', get: (b) => b.platform },
      { label: 'Invested', cls: 'r', get: (b) => money(b.principal), total: (rs) => money(rs.reduce((a, b) => a + b.principal, 0)) },
      { label: 'Rate', mob: 'under', mlabel: 'rate ', cls: 'r', get: (b) => pct(b.rate, 2) },
      { label: 'Paid', mob: 'under', mlabel: 'paid ', get: (b) => b.credit },
      { label: 'Per month (after TDS)', cls: 'r', get: (b) => money(b.monthNet), total: (rs) => money(rs.reduce((a, b) => a + b.monthNet, 0)) },
      { label: 'Matures', mob: 'under', mlabel: 'matures ', get: (b) => dateStr(b.maturityDate) },
    ], all.bonds, { footer: { label: 'Total' }, onRow: canEdit() ? (b) => bondForm(data.bonds.find((x) => x.id === b.id)) : null }),
    canEdit() ? [btn('Add bond', () => bondForm(), 'primary')] : null));

  const depCols = [
    { label: 'Name', host: true, get: (x) => x.name }, { label: 'Holder / type', mob: 'under', get: (x) => x.account },
    { label: 'Amount', cls: 'r', get: (x) => money(x.principal), total: (rs) => money(rs.reduce((a, x) => a + x.principal, 0)) },
    { label: 'Rate', mob: 'under', mlabel: 'rate ', cls: 'r', get: (x) => pct(x.rate, 2) },
    { label: 'Interest so far', mob: 'under', mlabel: 'earned ', cls: 'r', get: (x) => (x.interestType === 'Payout' ? 'paid out' : money(x.accrued)), total: (rs) => money(rs.reduce((a, x) => a + x.accrued, 0)) },
    { label: 'Per day', cls: 'r', get: (x) => money(x.daily) },
    { label: 'Matures', mob: 'under', mlabel: 'matures ', get: (x) => dateStr(x.maturityDate) },
  ];
  if (tab === 'fds') root.append(section('Fixed deposits', table(depCols, all.fds, { footer: { label: 'Total' }, onRow: canEdit() ? (x) => depositForm('fd', data.fds.find((y) => y.id === x.id)) : null }),
    canEdit() ? [btn('Add FD', () => depositForm('fd'))] : null));
  if (tab === 'lending') root.append(section('Private lending',
    table(depCols, all.lending, { footer: { label: 'Total' }, onRow: canEdit() ? (x) => depositForm('lending', data.lending.find((y) => y.id === x.id)) : null }),
    canEdit() ? [btn('Add loan', () => depositForm('lending'))] : null));

  if (tab !== 'lending') return root;
  const rc = data.receivables.filter((r) => r.active !== false).map((r) => C.receivableStatus(r, all.asOf)).sort((a, b) => (b.overdue - a.overdue) || (a.received - b.received) || (a.due < b.due ? -1 : 1));
  const late = rc.filter((r) => r.overdue), waiting = rc.filter((r) => !r.received && !r.overdue && !r.notStarted && C.monthKey(r.due) <= C.monthKey(all.asOf));
  const lateSum = late.reduce((a, r) => a + (r.expected || 0), 0), waitSum = waiting.reduce((a, r) => a + (r.expected || 0), 0);
  root.append(section('Money to receive',
    h('div', null,
      late.length ? h('div', { class: 'alert' }, h('b', null, `${late.length} payment${late.length > 1 ? 's' : ''} overdue · ${money(lateSum)}`), h('p', null, late.map((r) => `${r.name} (${money(r.expected)}, was due ${dateStr(r.due)})`).join(' · '))) : null,
      waiting.length ? h('div', { class: 'alert warn', style: { marginTop: late.length ? 8 : 0 } }, h('b', null, `${waiting.length} still to come this month · ${money(waitSum)}`), h('p', null, waiting.map((r) => `${r.name} (${money(r.expected)}, due ${dateStr(r.due)})`).join(' · '))) : null,
      h('div', { class: 'stats' },
        stat('Received this month', money(rc.filter((r) => r.received).reduce((x, r) => x + (r.expected || 0), 0)), `${rc.filter((r) => r.received).length} of ${rc.length} payments in`),
        stat('Received so far', money(rc.reduce((x, r) => x + (r.total || 0), 0)), `${rc.reduce((x, r) => x + (r.installmentsPaid || 0), 0)} payments since each started`)),
      !late.length && !waiting.length && rc.length ? h('p', { class: 'note', style: { marginTop: 0 } }, 'Everything due this month has been received.') : null,
      table([
      { label: 'From', host: true, get: (r) => r.name },
      { label: 'Balance with them', mob: 'under', mlabel: 'with them ', cls: 'r', get: (r) => money(r.balanceDue) },
      { label: 'Expected', cls: 'r', get: (r) => money(r.expected) },
      { label: 'How often', mob: 'under', get: (r) => r.term },
      { label: 'Last received', mob: 'under', mlabel: 'last ', get: (r) => dateStr(r.lastReceived) },
      { label: 'This month', render: (r) => (r.active === false ? h('span', { class: 'tag' }, 'Closed') : h('span', { class: r.received ? 'tag good' : r.overdue ? 'tag bad' : 'tag' }, r.received ? 'Received' : r.overdue ? 'Overdue' : r.notStarted ? 'Starts ' + dateStr(r.startDate) : 'Due ' + dateStr(r.due))) },
      { label: '', render: (r) => (canEdit() && r.active !== false && !r.received ? h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); mutate((d) => { d.receivables.find((x) => x.id === r.id).lastReceived = C.todayISO(); }); toast('Marked as received'); } }, 'Mark received') : '') },
    ], rc, { rowClass: (r) => (r.overdue ? 'row-bad' : !r.received && !r.notStarted && C.monthKey(r.due) <= C.monthKey(all.asOf) ? 'row-warn' : ''), onRow: canEdit() ? (r) => receivableForm(data.receivables.find((x) => x.id === r.id)) : null })),
    canEdit() ? [btn('Add', () => receivableForm())] : null));
  return root;
}

function closedView(root) {
  const { all, data } = S;
  const acct = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
  const kinds = [['Bonds', 'bonds', 'bonds'], ['Fixed deposits', 'fds', 'fds'], ['Private lending', 'lending', 'lending']];
  const all3 = kinds.flatMap(([, k]) => all.closed[k]);
  const inn = all3.reduce((a, x) => a + Math.abs(x.principal), 0), back = all3.reduce((a, x) => a + x.closed.amount, 0);
  root.append(h('div', { class: 'stats' }, stat('Closed', String(all3.length + all.closed.receivables.length), 'bonds, deposits, loans and dues'), stat('Money in', money(inn), ''), stat('Came back', money(back), h('span', { class: posNeg(back - inn) }, (back - inn >= 0 ? 'gain ' : 'loss ') + money(Math.abs(back - inn))))));
  for (const [title, key] of kinds) {
    const list = all.closed[key].slice().sort((a, b) => (a.closed.date < b.closed.date ? 1 : -1));
    root.append(section(title + ` (${list.length})`, table([
      { label: 'Name', host: true, get: (x) => x.name }, { label: 'Holder', mob: 'under', get: (x) => x.holder || x.account || '' },
      { label: 'Started', mob: 'hide', get: (x) => dateStr(x.depositDate) }, { label: 'Closed', mob: 'under', mlabel: 'closed ', get: (x) => dateStr(x.closed.date) },
      { label: 'Invested', cls: 'r', get: (x) => money(x.principal), total: (rs) => money(rs.reduce((a, x) => a + x.principal, 0)) },
      { label: 'Came back', cls: 'r', get: (x) => money(x.closed.amount), total: (rs) => money(rs.reduce((a, x) => a + x.closed.amount, 0)) },
      { label: 'XIRR', mob: 'under', mlabel: 'XIRR ', cls: 'r', render: (x) => (x.xirr == null ? '–' : h('span', { class: posNeg(x.xirr) }, pct(x.xirr, 1))) },
      { label: 'Money went to', mob: 'hide', get: (x) => (x.closed.acct ? acct.get(x.closed.acct) || '' : 'not added') },
    ], list, { footer: { label: 'Total' }, onRow: (x) => openClosedItem(key, x), empty: 'Nothing closed yet. Open one and press “Close it”.' })));
  }
  const rcs = all.closed.receivables;
  root.append(section(`Money to receive, closed (${rcs.length})`, table([
    { label: 'From', host: true, get: (r) => r.name }, { label: 'Expected each time', cls: 'r', get: (r) => money(r.expected) }, { label: 'Last received', mob: 'under', mlabel: 'last ', get: (r) => dateStr(r.lastReceived) }, { label: 'Closed on', mob: 'under', mlabel: 'closed ', get: (r) => dateStr(r.closedOn) },
  ], rcs, { onRow: canEdit() ? (r) => dialog(r.name, h('p', null, 'This is closed. Reopen it to track the payments again.'), [{ label: 'Reopen', class: 'primary', onclick: (c) => { mutate((d) => { const t = d.receivables.find((x) => x.id === r.id); t.active = true; delete t.closedOn; }); c(); } }, { label: 'Close', onclick: (c) => c() }]) : null, empty: 'None closed.' })));
}
function openClosedItem(key, x) {
  const it = S.data[key].find((y) => y.id === x.id);
  const body = h('p', { class: 'note' }, `Closed on ${dateStr(it.closed.date)}, ${money(it.closed.amount)} came back.${it.closed.note ? ' ' + it.closed.note : ''}`);
  dialog(it.name, body, canEdit() ? [
    { label: 'Delete', class: 'danger', onclick: async (c) => { if (await confirmDialog('Delete this closed record? The bank entry stays as it is.')) { mutate((d) => { d[key] = d[key].filter((y) => y.id !== it.id); }); c(); } } },
    { label: 'Reopen', onclick: (c) => { c(); reopen(it.name, (d) => { const t = d[key].find((y) => y.id === it.id); const lid = t.closed && t.closed.ledgerId; delete t.closed; if (lid) d.ledger = d.ledger.filter((e) => e.id !== lid); }); } },
    { label: 'Close window', onclick: (c) => c() },
  ] : [{ label: 'Close window', onclick: (c) => c() }]);
}
