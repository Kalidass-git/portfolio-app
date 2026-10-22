import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { donut, legend, hbars } from '../charts.js';
import { h, money, setOptions, dateStr, pct, section, table, btn, formDialog, canEdit, toast, stat, segTabs, subTab, dialog, confirmDialog, posNeg, datalistId, compact } from '../ui.js';
import { closeForm, reopen } from './closing.js';

const FREQ = ['Monthly', 'Quarterly', 'Yearly', 'Daily'];
const rerender = () => window.dispatchEvent(new Event('rerender'));
const green = (v) => h('span', { class: 'pos' }, v);
/** Interest only (never the amount lent or deposited): added to the balance, or paid out so far at the stated rate. */
const interestSoFar = (x, asOf) => (x.principal > 0 ? (x.interestType === 'Payout' ? C.interestReceived(x, asOf) : x.accrued || 0) : 0);
const sumInterest = (list, asOf) => list.reduce((a, x) => a + interestSoFar(x, asOf), 0);

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
      { key: 'quarterMonth', label: 'Quarterly interest is paid in', type: 'select', options: C.QUARTER_CHOICES, showIf: (v) => v.credit === 'Quarterly', hint: 'Each payment covers the three months up to the month it is paid in.' },
      { key: 'dueRule', label: 'Interest due date (optional)', type: 'select', options: [{ value: '', label: 'Not set' }, { value: 'first', label: 'First day of the month' }, { value: 'last', label: 'Last day of the month' }, { value: 'day', label: 'A fixed day of the month' }], hint: 'When set, the bond shows under “Needs a look” on Home on that day.' },
      { key: 'dueDay', label: 'Day of the month (1 to 31)', type: 'number', showIf: (v) => v.dueRule === 'day' },
      { key: 'depositDate', label: 'Bought on', type: 'date', required: true }, { key: 'maturityDate', label: 'Matures on', type: 'date', required: true },
    ],
    onSave: (v) => {
      if (v.dueRule === 'day' && !(Number(v.dueDay) >= 1 && Number(v.dueDay) <= 31)) { toast('Enter a day between 1 and 31.', 'bad'); return false; }
      mutate((d) => {
        const rec = { ...v }; if (rec.credit === 'Quarterly') rec.quarterMonth = Number(rec.quarterMonth) || 0; else delete rec.quarterMonth; if (!rec.dueRule) { delete rec.dueRule; delete rec.dueDay; } else if (rec.dueRule !== 'day') delete rec.dueDay;
        if (isNew) d.bonds.push({ id: nextId('b', d.bonds), ...rec });
        else { const t = d.bonds.find((x) => x.id === b.id); Object.assign(t, rec); if (!('quarterMonth' in rec)) delete t.quarterMonth; if (!rec.dueRule) { delete t.dueRule; delete t.dueDay; } else if (rec.dueRule !== 'day') delete t.dueDay; }
      });
    },
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
      { key: 'payoutAmount', label: 'Amount you receive each payout (₹, optional)', type: 'number', showIf: (v) => v.interestType === 'Payout', hint: 'What actually reaches you each month, quarter or year (as set in Compounding / payout). Interest received so far and the monthly income use it. Leave empty to use the rate.' },
      { key: 'tenure', label: 'Tenure', type: 'number', half: true, required: true }, { key: 'tenureType', label: 'Tenure unit', type: 'select', options: ['Years', 'Months', 'Days'], half: true },
      { key: 'depositDate', label: 'Started on', type: 'date', required: true }, { key: 'maturityDate', label: 'Matures on', type: 'date', required: true },
    ],
    onSave: (v) => mutate((d) => {
      const opt = kind === 'fd' ? 'issuer' : 'borrower';
      v[opt] = String(v[opt] || '').trim(); const keep = v[opt]; if (!keep) delete v[opt];
      if (!(Number(v.payoutAmount) > 0)) delete v.payoutAmount;
      if (isNew) d[key].push({ id: nextId(kind === 'fd' ? 'fd' : 'ln', d[key]), ...v });
      else { const t = d[key].find((x) => x.id === it.id); Object.assign(t, v); delete t.accruedOverride; if (!keep) delete t[opt]; if (!(Number(v.payoutAmount) > 0)) delete t.payoutAmount; }
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
/** Interest that has reached you so far, after TDS unless the bond has a fixed payout amount. */
const bondReceived = (b) => { const r = C.interestReceived(b, S.all.asOf); return b.payoutAmount > 0 ? r : r * (1 - (S.data.settings.tdsRate ?? 0.1)); };
const shortD = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const flt = { bonds: { holder: 'all', via: 'all', sort: 'none', dir: 'asc' }, fds: { holder: 'all', via: 'all' }, lending: { holder: 'all', via: 'all' } };
const rerenderFixed = () => window.dispatchEvent(new Event('rerender'));
/** Quick filters above a list: account holder and where it was bought. Default is everything. Returns the bar and the rows that pass. */
function quickFilter(tab, items, holderOf, viaOf, viaLabel, sorts) {
  const f = flt[tab];
  const uniq = (fn) => [...new Set(items.map(fn).map((x) => String(x || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const holders = uniq(holderOf), vias = uniq(viaOf);
  if (f.holder !== 'all' && !holders.includes(f.holder)) f.holder = 'all';
  if (f.via !== 'all' && !vias.includes(f.via)) f.via = 'all';
  const mk = (label, key, opts) => { const sel = h('select', { class: 'month-select', 'aria-label': label, onchange: (e) => { f[key] = e.target.value; rerenderFixed(); } }); setOptions(sel, [{ value: 'all', label: `${label}: all` }, ...opts.map((o) => ({ value: o, label: o }))], f[key]); return sel; };
  let rows = items.filter((x) => (f.holder === 'all' || String(holderOf(x) || '').trim() === f.holder) && (f.via === 'all' || String(viaOf(x) || '').trim() === f.via));
  // optional sorting: pick what to sort by and which way. Rows with nothing to sort on (no next due date) always go last.
  let sortBar = null;
  if (sorts) {
    const cur = sorts.find((x) => x.value === f.sort);
    if (cur) {
      const sign = f.dir === 'desc' ? -1 : 1, empty = (v) => v === '' || v == null;
      rows = rows.map((x, i) => ({ x, i, v: cur.get(x) })).sort((a, b) => (empty(a.v) - empty(b.v)) || (empty(a.v) ? 0 : sign * (typeof a.v === 'string' ? a.v.localeCompare(b.v) : a.v - b.v)) || a.i - b.i).map((o) => o.x);
    }
    const pick = h('select', { class: 'month-select', 'aria-label': 'Sort by', onchange: (e) => { f.sort = e.target.value; rerenderFixed(); } });
    setOptions(pick, [{ value: 'none', label: 'Sort: as entered' }, ...sorts.map((x) => ({ value: x.value, label: 'Sort: ' + x.label }))], f.sort);
    const dir = h('select', { class: 'month-select', 'aria-label': 'Sort direction', disabled: f.sort === 'none', onchange: (e) => { f.dir = e.target.value; rerenderFixed(); } });
    setOptions(dir, [{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }], f.dir);
    sortBar = [pick, dir];
  }
  const bar = holders.length > 1 || vias.length > 1 || sorts ? h('div', { class: 'filters' }, holders.length > 1 ? mk('Holder', 'holder', holders) : null, vias.length > 1 ? mk(viaLabel, 'via', vias) : null, sortBar,
    rows.length !== items.length ? h('span', { class: 'muted' }, `${rows.length} of ${items.length}`) : null) : null;
  return { bar, rows };
}

export function render() {
  const { all, data } = S;
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Fixed income views')));
  if (tab === 'closed') { closedView(root); return root; }
  if (tab === 'loans') { loans.view(root); return root; }
  const f = all.fixed;
  const stats = {
    bonds: () => h('div', { class: 'stats' }, stat('Bonds', money(f.bondPrincipal), `${all.bonds.length} bonds`), stat('Interest to receive', green(money(all.bonds.reduce((a, b) => a + b.monthNet, 0))), 'after ' + money(all.bonds.reduce((a, b) => a + b.monthGross - b.monthNet, 0)) + ' TDS')),
    fds: () => h('div', { class: 'stats' }, stat('Fixed deposits', money(f.fdPrincipal), `${all.fds.length} FDs`), stat('Interest so far', green(money(sumInterest(all.fds, all.asOf))), 'interest only, paid-out included')),
    lending: () => h('div', { class: 'stats' }, stat('Lent out', money(f.lendPrincipal), `${all.lending.filter((l) => l.principal > 0).length} loans given`), stat('Interest so far', green(money(sumInterest(all.lending, all.asOf))), 'interest only, paid-out included')),
  };
  if (stats[tab]) root.append(stats[tab]());
  if (tab === 'bonds' && all.bonds.length) root.append(bondInsights(all, data));

  const bondSorts = [
    { value: 'rate', label: 'Rate', get: (b) => b.rate || 0 },
    { value: 'due', label: 'Next due', get: (b) => C.bondNextDue(b, all.asOf) },
    { value: 'paid', label: 'Paid so far', get: (b) => bondReceived(b) },
    { value: 'invested', label: 'Invested', get: (b) => b.principal || 0 },
    { value: 'holder', label: 'Holder', get: (b) => String(b.holder || '').trim().toLowerCase() },
    { value: 'via', label: 'Via', get: (b) => String(b.platform || '').trim().toLowerCase() },
    { value: 'maturity', label: 'Maturity', get: (b) => b.maturityDate || '' },
  ];
  const fb = tab === 'bonds' ? quickFilter('bonds', all.bonds, (b) => b.holder, (b) => b.platform, 'Via', bondSorts) : tab === 'fds' ? quickFilter('fds', all.fds, (x) => x.account, (x) => x.issuer, 'Bank') : tab === 'lending' ? quickFilter('lending', all.lending, (x) => x.account, (x) => x.borrower, 'Borrower') : null;
  if (tab === 'bonds') root.append(section('Bonds', h('div', null, fb.bar,
    table([
      { label: 'Bond', host: true, render: (b) => h('span', null, h('span', null, b.name), h('small', { class: 'muted', style: { display: 'block', fontWeight: 400, opacity: 0.75 } }, [b.holder, b.platform].filter(Boolean).join(' · ') + (b.maturityDate ? ' · matures ' + dateStr(b.maturityDate) : ''))) },
      { label: 'Invested', cls: 'r', get: (b) => money(b.principal), total: (rs) => money(rs.reduce((a, b) => a + b.principal, 0)) },
      { label: 'Rate (paid)', key: true, cls: 'r', render: (b) => h('span', null, pct(b.rate, 2), h('span', { class: 'plain' }, ' (' + String(b.credit || 'Monthly').toLowerCase() + ')')) },
      { label: 'Next due', key: true, cls: 'r', render: (b) => { const d = C.bondNextDue(b, S.all.asOf); return d ? h('span', { class: 'due-next' }, shortD(d)) : h('span', { class: 'muted' }, '–'); } },
      { label: 'Net per month', key: true, cls: 'r', render: (b) => h('span', null, h('b', null, money(b.monthNet)), h('small', { style: { display: 'block' } }, green('received ' + money(bondReceived(b))))), total: (rs) => h('span', null, h('b', null, money(rs.reduce((a, b) => a + b.monthNet, 0))), h('small', { style: { display: 'block' } }, green('received ' + money(rs.reduce((a, b) => a + bondReceived(b), 0))))) },
    ], fb.rows, { footer: { label: 'Total' }, mobile: {
      key: 'bonds', head: 'Bond',
      first: (b) => ({ title: b.name, sub: [b.holder, b.platform].filter(Boolean).join(' · ') }),
      views: [
        { label: 'Invested · Net / month', main: (b) => money(b.principal), sub: (b) => 'net ' + money(b.monthNet), total: (rs) => ({ main: money(rs.reduce((a, b) => a + b.principal, 0)), sub: 'net ' + money(rs.reduce((a, b) => a + b.monthNet, 0)) }) },
        { label: 'Rate · Next due', main: (b) => pct(b.rate, 2), sub: (b) => { const d = C.bondNextDue(b, S.all.asOf); return String(b.credit || 'Monthly').toLowerCase() + (d ? ' · due ' + shortD(d) : ''); } },
        { label: 'Received · Matures', main: (b) => green(money(bondReceived(b))), sub: (b) => (b.maturityDate ? 'matures ' + dateStr(b.maturityDate) : null), total: (rs) => ({ main: green(money(rs.reduce((a, b) => a + bondReceived(b), 0))) }) },
      ] }, onRow: canEdit() ? (b) => bondForm(data.bonds.find((x) => x.id === b.id)) : null })),
    canEdit() ? [btn('Add bond', () => bondForm(), 'primary')] : null));

  const depCols = [
    { label: 'Name', host: true, get: (x) => x.name }, { label: 'Holder / type', mob: 'under', get: (x) => x.account },
    { label: 'Amount', cls: 'r', get: (x) => money(x.principal), total: (rs) => money(rs.reduce((a, x) => a + x.principal, 0)) },
    { label: 'Rate', key: true, cls: 'r', get: (x) => pct(x.rate, 2) },
    { label: 'Interest so far', key: true, cls: 'r', render: (x) => (x.principal > 0 ? green(money(interestSoFar(x, all.asOf)) + (x.interestType === 'Payout' ? ' paid out' : '')) : '–'), total: (rs) => money(sumInterest(rs, all.asOf)) },
    { label: 'Per day', cls: 'r', get: (x) => money(x.daily) },
    { label: 'Matures', mob: 'under', mlabel: 'matures ', get: (x) => dateStr(x.maturityDate) },
  ];
  const depMobile = (key, midHead, midOf) => ({
    key, head: 'Name', midHead,
    first: (x) => ({ title: x.name, sub: x.account }),
    mid: (x) => midOf(x) || null,
    views: [
      { label: 'Amount · Rate', main: (x) => money(x.principal), sub: (x) => pct(x.rate, 2) },
      { label: 'Interest · Per day', main: (x) => (x.principal > 0 ? green(money(interestSoFar(x, all.asOf))) : '–'), sub: (x) => (x.principal > 0 ? money(x.daily) + ' a day' + (x.interestType === 'Payout' ? ' · paid out' : '') : null) },
      { label: 'Matures', main: (x) => dateStr(x.maturityDate), sub: null },
    ],
  });
  if (tab === 'fds') root.append(section('Fixed deposits', h('div', null, fb.bar, table(depCols, fb.rows, { mobile: depMobile('fds', 'Bank', (x) => x.issuer), footer: { label: 'Total', phone: false }, onRow: canEdit() ? (x) => depositForm('fd', data.fds.find((y) => y.id === x.id)) : null })),
    canEdit() ? [btn('Add FD', () => depositForm('fd'))] : null));
  if (tab === 'lending') root.append(section('Private lending',
    h('div', null, fb.bar, table(depCols, fb.rows, { mobile: depMobile('lending', 'Borrower', (x) => x.borrower), footer: { label: 'Total', phone: false }, onRow: canEdit() ? (x) => depositForm('lending', data.lending.find((y) => y.id === x.id)) : null })),
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
        stat('Received this month', green(money(rc.filter((r) => r.received).reduce((x, r) => x + (r.expected || 0), 0))), `${rc.filter((r) => r.received).length} of ${rc.length} payments in`),
        stat('Received so far', green(money(rc.reduce((x, r) => x + (r.total || 0), 0))), `${rc.reduce((x, r) => x + (r.installmentsPaid || 0), 0)} payments since each started`)),
      h('details', { class: 'by-person hide-sm' }, h('summary', null, 'Received so far, by person'), personList()),
      !late.length && !waiting.length && rc.length ? h('p', { class: 'note', style: { marginTop: 0 } }, 'Everything due this month has been received.') : null,
      table([
      { label: 'From', host: true, get: (r) => r.name },
      { label: 'Balance with them', mob: 'under', mlabel: 'with them ', cls: 'r', get: (r) => money(r.balanceDue) },
      { label: 'Expected', cls: 'r', get: (r) => money(r.expected) },
      { label: 'How often', mob: 'under', get: (r) => r.term },
      { label: 'Total received', key: true, cls: 'r', render: (r) => green(money(r.total || 0)) },
      { label: 'Last received', mob: 'under', mlabel: 'last ', get: (r) => dateStr(r.lastReceived) },
      { label: 'This month', render: (r) => (r.active === false ? h('span', { class: 'tag' }, 'Closed') : h('span', { class: r.received ? 'tag good' : r.overdue ? 'tag bad' : r.dueToday ? 'tag warn' : 'tag' }, r.received ? 'Received' : r.overdue ? 'Overdue' : r.dueToday ? 'Due today' : r.notStarted ? 'Starts ' + dateStr(r.startDate) : 'Due ' + dateStr(r.due))) },
      { label: '', render: (r) => (canEdit() && r.active !== false && !r.received ? h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); mutate((d) => { d.receivables.find((x) => x.id === r.id).lastReceived = C.todayISO(); }); toast('Marked as received'); } }, 'Mark received') : '') },
    ], rc, { mobile: {
      key: 'recv', head: 'From', midHead: 'This month',
      first: (r) => ({ title: r.name, sub: r.term,
        extra: canEdit() && r.active !== false && !r.received ? h('button', { class: 'small', style: { marginTop: '4px' }, onclick: (e) => { e.stopPropagation(); mutate((d) => { d.receivables.find((x) => x.id === r.id).lastReceived = C.todayISO(); }); toast('Marked as received'); } }, 'Mark received') : null }),
      mid: (r) => (r.active === false ? h('span', { class: 'tag' }, 'Closed') : h('span', { class: r.received ? 'tag good' : r.overdue ? 'tag bad' : r.dueToday ? 'tag warn' : 'tag' }, r.received ? 'Received' : r.overdue ? 'Overdue' : r.dueToday ? 'Due today' : r.notStarted ? 'Starts ' + dateStr(r.startDate) : 'Due ' + dateStr(r.due))),
      views: [
        { label: 'Expected · With them', main: (r) => money(r.expected), sub: (r) => 'with them ' + money(r.balanceDue) },
        { label: 'Received · Last', main: (r) => green(money(r.total || 0)), sub: (r) => (r.lastReceived ? 'last ' + dateStr(r.lastReceived) : null) },
      ] }, rowClass: (r) => (r.overdue ? 'row-bad' : !r.received && !r.notStarted && C.monthKey(r.due) <= C.monthKey(all.asOf) ? 'row-warn' : ''), onRow: canEdit() ? (r) => receivableForm(data.receivables.find((x) => x.id === r.id)) : null })),
    canEdit() ? [btn('Add', () => receivableForm())] : null));
  root.append(h('div', { class: 'phone-only' }, section('Received so far, by person', personList())));
  return root;
}

/** Who holds the bonds, which companies they are with, and when you want to be told about interest. */
function bondInsights(all, data) {
  const group = (key) => { const m = new Map(); for (const b of all.bonds) { const k = String(b[key] || '').trim() || 'Not set'; m.set(k, (m.get(k) || 0) + b.principal); } return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
  const owners = group('holder'), firms = group('company'), total = all.bonds.reduce((a, b) => a + b.principal, 0);
  const bn = C.bondNotify(data);
  const save = (patch) => { if (!canEdit()) return toast('This device has read-only access.'); mutate((d) => { d.settings = { ...d.settings, bondNotify: { ...C.bondNotify(d), ...patch } }; }); };
  const days = h('select', { 'aria-label': 'Days before', disabled: !canEdit() || !bn.on, onchange: (e) => save({ days: Number(e.target.value) }) });
  setOptions(days, [0, 1, 2, 3, 5, 7, 10, 14].map((n) => ({ value: n, label: n === 0 ? 'On the day itself' : n === 1 ? '1 day before' : n + ' days before' })), bn.days);
  return h('div', null,
    h('div', { class: 'grid2' },
      section('Who holds the bonds', h('div', null, donut(owners, { fmt: money, center: compact(total), sub: 'invested', size: 190 }), legend(owners, { fmt: money }))),
      section('Which companies', firms.length ? hbars(firms, { fmt: money, colorIndex: 1 }) : h('p', { class: 'empty' }, 'No issuer set on the bonds.'))),
    h('details', { class: 'card simple-settings' }, h('summary', null, 'Bond settings'),
      h('label', { style: { display: 'block', margin: '10px 0' } }, 'Tax deducted on interest (%) ', h('input', { type: 'number', step: 'any', min: '0', max: '100', value: String(Math.round((data.settings.tdsRate ?? 0.1) * 10000) / 100), disabled: !canEdit(), 'aria-label': 'Tax deducted on bond interest', style: { maxWidth: '6em' },
        onchange: (e) => { const n = Number(e.target.value); if (!Number.isFinite(n) || n < 0 || n > 100) return toast('Enter a percentage between 0 and 100.', 'bad'); if (!canEdit()) return toast('This device has read-only access.'); mutate((d) => { d.settings.tdsRate = n / 100; }); } })),
      h('label', { class: 'check-inline', style: { display: 'block', margin: '10px 0' } }, h('input', { type: 'checkbox', checked: bn.on, disabled: !canEdit(), onchange: (e) => save({ on: e.target.checked }) }), ' Remind me when interest is due, ', days),
      h('p', { class: 'note' }, 'Interest is the daily amount times the real days of the month. Reminders work for bonds with a due date set on the bond.')));
}

function personList() {
  const list = C.receivedByPerson(S.data, S.all.asOf).filter((p) => p.total > 0 || p.open);
  const tot = list.reduce((a, p) => a + p.total, 0);
  if (!list.length) return h('p', { class: 'note' }, 'Nothing received yet.');
  return h('div', { class: 'card inner' }, ...list.map((p) => h('div', { class: 'row-line', style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0', borderBottom: '1px solid var(--line, #ddd)' } },
    h('span', null, h('b', null, p.name), h('small', { style: { display: 'block', opacity: 0.7 } }, `${p.payments} payment${p.payments === 1 ? '' : 's'}${p.last ? ' · last ' + dateStr(p.last) : ''}${p.open ? '' : ' · closed'}`)),
    green(money(p.total)))), h('div', { style: { display: 'flex', justifyContent: 'space-between', paddingTop: '8px' } }, h('b', null, 'Total'), h('b', null, green(money(tot)))));
}

function closedView(root) {
  const { all, data } = S;
  const acct = new Map(data.accounts.map((a) => [a.id, `${a.name} · ${a.holder}`]));
  const kinds = [['Bonds', 'bonds', 'bonds'], ['Fixed deposits', 'fds', 'fds'], ['Private lending', 'lending', 'lending']];
  const all3 = kinds.flatMap(([, k]) => all.closed[k]);
  const inn = all3.reduce((a, x) => a + Math.abs(x.principal), 0), back = all3.reduce((a, x) => a + x.closed.amount, 0);
  root.append(h('div', { class: 'stats' }, stat('Closed', String(all3.length + all.closed.receivables.length), 'bonds, deposits, loans and dues'), stat('Money in', money(inn), ''), stat('Came back', money(back), h('span', { class: posNeg(back - inn) }, (back - inn >= 0 ? 'gain ' : 'loss ') + money(Math.abs(back - inn))))));
  const cs = C.closedSummary(data, all);
  if (cs.types.length) root.append(section('What came back, by type', h('div', null, ...cs.types.map((t) => h('div', { style: { marginBottom: '14px' } }, h('h4', { style: { margin: '0 0 4px' } }, t.label),
    table([
      { label: t.id === 'lending' ? 'Person' : 'Name', host: true, get: (x) => x.name + (x.count > 1 ? ` (${x.count})` : '') },
      { label: 'Put in', cls: 'r', get: (x) => money(x.invested), total: (rs) => money(rs.reduce((a, x) => a + x.invested, 0)) },
      { label: t.id === 'fds' ? '' : 'Interest received', mob: 'under', mlabel: 'interest ', cls: 'r', get: (x) => (t.id === 'fds' ? '' : money(x.interest)), total: (rs) => (t.id === 'fds' ? '' : money(rs.reduce((a, x) => a + x.interest, 0))) },
      { label: 'Principal back', mob: 'under', mlabel: 'back ', cls: 'r', get: (x) => money(x.back), total: (rs) => money(rs.reduce((a, x) => a + x.back, 0)) },
      { label: 'Total received', key: true, cls: 'r', render: (x) => h('span', { class: posNeg(x.gain) }, money(x.total)), total: (rs) => money(rs.reduce((a, x) => a + x.total, 0)) },
    ], t.items, { mobile: { key: 'closedgrp', head: 'Name', first: (x) => ({ title: x.name + (x.count > 1 ? ` (${x.count})` : ''), sub: t.id === 'fds' ? null : 'interest ' + money(x.interest) }),
      views: [{ label: 'Put in · Total received', main: (x) => money(x.invested), sub: (x) => h('span', { class: posNeg(x.gain) }, money(x.total)) }, { label: 'Principal back · Interest', main: (x) => money(x.back), sub: (x) => (t.id === 'fds' ? null : money(x.interest)) }] }, footer: { label: 'Total', phone: false }, empty: 'None', onRow: canEdit() ? (x) => closedGroupDialog(t.id, x) : null }))))));
  for (const [title, key] of kinds) {
    const list = all.closed[key].slice().sort((a, b) => (a.closed.date < b.closed.date ? 1 : -1));
    root.append(section(title + ` (${list.length})`, table([
      { label: 'Name', host: true, get: (x) => x.name }, { label: 'Holder', mob: 'under', get: (x) => x.holder || x.account || '' },
      { label: 'Started', mob: 'hide', get: (x) => dateStr(x.depositDate) }, { label: 'Closed', mob: 'under', mlabel: 'closed ', get: (x) => dateStr(x.closed.date) },
      { label: 'Invested', cls: 'r', get: (x) => money(x.principal), total: (rs) => money(rs.reduce((a, x) => a + x.principal, 0)) },
      { label: 'Came back', cls: 'r', get: (x) => money(x.closed.amount), total: (rs) => money(rs.reduce((a, x) => a + x.closed.amount, 0)) },
      { label: 'XIRR', mob: 'under', mlabel: 'XIRR ', cls: 'r', render: (x) => (x.xirr == null ? '–' : h('span', { class: posNeg(x.xirr) }, pct(x.xirr, 1))) },
      { label: 'Money went to', mob: 'hide', get: (x) => (x.closed.acct ? acct.get(x.closed.acct) || '' : 'not added') },
    ], list, { mobile: { key: 'closed', head: 'Name', first: (x) => ({ title: x.name, sub: [x.holder || x.account, 'closed ' + dateStr(x.closed.date)].filter(Boolean).join(' · ') }),
      views: [{ label: 'Invested · Came back', main: (x) => money(x.principal), sub: (x) => h('span', { class: posNeg(x.closed.amount - x.principal) }, money(x.closed.amount)) }, { label: 'XIRR · Started', main: (x) => (x.xirr == null ? '–' : h('span', { class: posNeg(x.xirr) }, pct(x.xirr, 1))), sub: (x) => 'started ' + dateStr(x.depositDate) }] }, footer: { label: 'Total', phone: false }, onRow: (x) => openClosedItem(key, x), empty: 'Nothing closed yet. Open one and press “Close it”.' })));
  }
  const rcs = all.closed.receivables;
  root.append(section(`Money to receive, closed (${rcs.length})`, table([
    { label: 'From', host: true, get: (r) => r.name }, { label: 'Expected each time', cls: 'r', get: (r) => money(r.expected) }, { label: 'Last received', mob: 'under', mlabel: 'last ', get: (r) => dateStr(r.lastReceived) }, { label: 'Closed on', mob: 'under', mlabel: 'closed ', get: (r) => dateStr(r.closedOn) },
  ], rcs, { onRow: canEdit() ? (r) => dialog(r.name, h('p', null, 'This is closed. Reopen it to track the payments again, or delete the record.'), [{ label: 'Delete', class: 'danger', onclick: async (c) => { if (await confirmDialog(`Delete this closed record of ${r.name} (${money(r.expected)} each time)? The bank entries stay as they are.`)) { mutate((d) => { d.receivables = d.receivables.filter((x) => x.id !== r.id); }); c(); } } }, { label: 'Reopen', class: 'primary', onclick: (c) => { mutate((d) => { const t = d.receivables.find((x) => x.id === r.id); t.active = true; delete t.closedOn; }); c(); } }, { label: 'Close', onclick: (c) => c() }]) : null, empty: 'None closed.' })));
}
/** The closed records behind one row of "What came back": each can be deleted. */
function closedGroupDialog(typeId, row) {
  const { all, data } = S;
  const base = row.name.replace(/\s*\(\d+\)$/, '');
  const same = (n) => C.sameName(n, base) || String(n || '').trim().toLowerCase() === base.trim().toLowerCase();
  const items = [];
  if (typeId === 'lending') {
    for (const it of all.closed.lending.filter((x) => same(x.name))) items.push({ key: 'lending', id: it.id, title: it.name, sub: `Lent ${money(it.principal)} · closed ${dateStr(it.closed.date)} · ${money(it.closed.amount)} came back` });
    for (const r of all.closed.receivables.filter((x) => same(x.name))) items.push({ key: 'receivables', id: r.id, title: r.name, sub: `Money to receive · ${money(r.expected)} each time · closed ${dateStr(r.closedOn)}` });
  } else {
    for (const it of all.closed[typeId].filter((x) => same(x.name))) items.push({ key: typeId, id: it.id, title: it.name, sub: `Put in ${money(Math.abs(it.principal))} · closed ${dateStr(it.closed.date)} · ${money(it.closed.amount)} came back` });
  }
  const body = h('div');
  const draw = () => {
    body.replaceChildren(items.length ? h('ul', { class: 'rows', style: { listStyle: 'none', margin: 0, padding: 0 } }, items.map((x) => h('li', { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-2)' } },
      h('span', null, h('b', null, x.title), h('small', { class: 'muted', style: { display: 'block' } }, x.sub)),
      h('button', { class: 'danger small', onclick: async () => { if (await confirmDialog(`Delete the closed record of ${x.title}? The bank entry stays as it is.`)) { mutate((d) => { d[x.key] = d[x.key].filter((y) => y.id !== x.id); }); items.splice(items.indexOf(x), 1); draw(); } } }, 'Delete')))) : h('p', { class: 'empty' }, 'Nothing left here.'));
  };
  draw();
  dialog(base, h('div', null, h('p', { class: 'note', style: { marginTop: 0 } }, 'Deleting only removes the closed record. Bank entries are not touched.'), body), [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
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
