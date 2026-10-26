// Insights: Tax summary, Cash calendar, Annual review, Spending anomalies and the Allocation goal, as sub tabs of one menu.
import { currentPlan, planPicker, planSettingsCard } from './proj-shared.js';
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import * as I from '../insights.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, btn, segTabs, subTab, setOptions, formDialog, dialog, toast, canEdit } from '../ui.js';
import { barChart, lineChart, donut, color, stackedBars } from '../charts.js';
import { plannedByMonth } from './networth.js';
import { groupedTable } from './groupmix.js';

const TABS = [['tax', 'Tax summary'], ['calendar', 'Cash calendar'], ['review', 'Annual review'], ['anomalies', 'Spending anomalies'], ['allocation', 'Allocation goal']];
const rerender = () => window.dispatchEvent(new Event('rerender'));
const st = { fy: null, months: 12, year: null, month: null, who: 'all' };
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const note = (t) => h('p', { class: 'note' }, t);
const select = (opts, cur, label, on) => { const s = h('select', { class: 'month-select', 'aria-label': label, onchange: (e) => on(e.target.value) }); setOptions(s, opts, String(cur)); return s; };
function download(name, text, type = 'text/csv') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

export function render() {
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Insights')));
  ({ tax, calendar, review, anomalies, allocation })[tab](root);
  return root;
}

// ---------- 1. Tax summary ----------
function tax(root) {
  const { data, all } = S;
  const fys = I.fyList(data, all.asOf);
  if (!st.fy || !fys.some((f) => f.y === st.fy)) st.fy = fys[0].y;
  const people = I.taxPeople(data);
  if (st.who !== 'all' && st.who !== I.NO_OWNER && !people.some((p) => p.toLowerCase() === st.who.toLowerCase())) st.who = 'all';
  const t = I.taxSummary(data, all, st.fy, st.who);
  root.append(h('div', { class: 'filters' }, select(fys.map((f) => ({ value: String(f.y), label: f.label })), st.fy, 'Financial year', (v) => { st.fy = Number(v); rerender(); }),
    select([{ value: 'all', label: 'All people' }, ...people.map((p) => ({ value: p, label: p })), { value: I.NO_OWNER, label: 'Owner not set' }], st.who, 'Whose', (v) => { st.who = v; rerender(); }),
    btn('Download CSV', () => download(`tax-summary-${t.fy.replace(/\s/g, '-')}.csv`, I.taxCsv(t)), 'small')));
  root.append(projectionCard(data, all, people));
  const folds = [];
  const fold = (title, content) => h('details', { class: 'more' }, h('summary', null, title), content);
  if (st.who === 'all' && people.length > 1) {
    const bp = I.taxByPerson(data, all, st.fy);
    if (bp.length) folds.unshift(fold('By person', h('div', null, table([
      { label: 'Person', host: true, get: (r) => r.person },
      { label: 'Interest', cls: 'r', get: (r) => money(r.interest) }, { label: 'Salary', cls: 'r', mob: 'under', mlabel: 'salary ', get: (r) => money(r.salary) },
      { label: 'Dividends', cls: 'r', mob: 'under', mlabel: 'dividends ', get: (r) => money(r.dividends) },
      { label: 'Short-term', cls: 'r', mob: 'hide', get: (r) => money(r.stcg) }, { label: 'Long-term', cls: 'r', mob: 'hide', get: (r) => money(r.ltcg) },
    ], bp, { m: { key: 'tax-person', head: 'Person', views: [['Interest', 'Salary'], ['Dividends', 'Short-term'], ['Long-term']] } }), note('Pick a person above to see their full summary. Each person’s income is kept apart, so it can go into their own return.'))));
  }
  folds.push(ownersCard(data, people));
  if (t.bankOther.length) folds.push(fold(`Other income credited to the bank · ${money(t.bankOtherTotal)}`, table([{ label: 'Category', host: true, get: (r) => r.category }, { label: 'Amount', cls: 'r', get: (r) => money(r.amount) }], t.bankOther, { m: { key: 'tax-bankother', head: 'Category', views: [['Amount']] } })));
  folds.push(fold(`Interest on every holding, ${t.fy} · ${money(t.interestGross)}`, t.interestBy.length ? h('div', null, ...t.interestBy.map((g) => h('div', null, h('h4', null, g.kind), table([
    { label: 'Name', host: true, render: (r) => h('span', null, r.name, r.closedOn ? h('span', { class: 'chip-closed' }, ' Closed' + (r.closedOn.length === 10 ? ' ' + dateStr(r.closedOn) : '')) : null) },
    { label: 'Holder', mob: 'hide', get: (r) => r.holder || '–' },
    { label: 'Interest', cls: 'r', get: (r) => money(r.gross), total: (rs) => money(rs.reduce((a, r) => a + r.gross, 0)) },
    g.tds ? { label: `TDS at ${pct(t.tdsRate, 0)}`, cls: 'r', mob: 'under', mlabel: 'TDS ', get: (r) => money(r.tds), total: (rs) => money(rs.reduce((a, r) => a + r.tds, 0)) } : null,
  ].filter(Boolean), g.rows, { footer: {}, m: { key: 'tax-interest-' + g.kind, head: 'Name', sub: ['Holder'], views: g.tds ? [['Interest', `TDS at ${pct(t.tdsRate, 0)}`]] : [['Interest']],
    sort: [{ value: 'none', label: 'As listed', kind: 'none' }, { value: 'gross', label: 'Interest', kind: 'num', get: (r) => r.gross }, { value: 'name', label: 'Name', kind: 'text', get: (r) => String(r.name || '').toLowerCase() }], sortDefault: { value: 'none', dir: 'asc' } }, onRow: g.kind === 'Bonds' ? (r) => holdingDialog(data, all, t, r) : null }))),
  note(`Tap a bond to see it month by month against the bank. Closed bonds are included up to the day they were closed. Interest is worked out by days held inside the year, whether or not it has been paid out yet (accrual basis). TDS is an estimate for bonds only, at the rate in Settings; match it with Form 26AS.`)) : h('p', { class: 'empty' }, 'No interest-bearing holdings in this year.')));
  folds.push(fold(`Dividends · ${money(t.dividendTotal)}`, t.dividends.length ? table([
    { label: 'Company', host: true, get: (d) => d.name },
    { label: 'Payments', cls: 'r', mob: 'under', mlabel: 'x', get: (d) => d.count },
    { label: 'Amount', cls: 'r', get: (d) => money(d.amount) },
  ], t.dividends, { m: { key: 'tax-div', head: 'Company', sub: (d) => `${d.count} ${d.count === 1 ? 'payment' : 'payments'}`, views: [['Amount']] } }) : h('p', { class: 'empty' }, 'No dividends recorded in this year.')));
  folds.push(fold(`Capital gains, shares and mutual funds · short ${signed(t.stcg)}, long ${signed(t.ltcg)}`, t.gains.length ? table([
    { label: 'Name', host: true, get: (g) => g.name },
    { label: 'Type', mob: 'hide', get: (g) => g.kind },
    { label: 'Bought', mob: 'hide', get: (g) => dateStr(g.buyDate) },
    { label: 'Sold', mob: 'under', mlabel: 'sold ', get: (g) => dateStr(g.date) },
    { label: 'Sale value', cls: 'r', mob: 'hide', get: (g) => money(g.proceeds) },
    { label: 'Gain', cls: 'r', render: (g) => h('span', { class: tone(g.gain) }, signed(g.gain)) },
    { label: 'Term', mob: 'under', get: (g) => (g.term === 'LT' ? 'Long term' : 'Short term') },
  ], t.gains, { m: { key: 'tax-gains', head: 'Name', sub: (g) => `sold ${dateStr(g.date)} · ${g.term === 'LT' ? 'long term' : 'short term'}`, views: [['Gain', 'Sale value'], ['Bought', 'Type']],
    sort: [{ value: 'date', label: 'Date sold', kind: 'date', get: (g) => g.date }, { value: 'gain', label: 'Gain', kind: 'num', get: (g) => g.gain }, { value: 'proceeds', label: 'Sale value', kind: 'num', get: (g) => g.proceeds }, { value: 'name', label: 'Name', kind: 'text', get: (g) => String(g.name || '').toLowerCase() }], sortDefault: { value: 'date', dir: 'desc' },
    filters: [{ key: 'term', label: 'Term', get: (g) => (g.term === 'LT' ? 'Long term' : 'Short term'), options: ['Long term', 'Short term'] }, { key: 'kind', label: 'Type', get: (g) => g.kind, options: (rs) => [...new Set(rs.map((g) => g.kind).filter(Boolean))] }] } }) : h('p', { class: 'empty' }, 'No shares or funds sold in this year.')));
  root.append(h('div', { class: 'tax-folds' }, ...folds));
  root.append(note('A guide for filing, not tax advice. Gains use oldest units first. Debt funds, gold ETFs, bonus and split adjustments and the grandfathering rules are taxed differently, so check these with your accountant. Rental income, interest on savings accounts and other bank interest appear under Other income credited only if you categorised them.'));
}

/** The expected tax for the year, new regime. One card: the answer first, then how it is made up, then the assumptions behind it. */
function projectionCard(data, all, people) {
  const key = `${st.fy}|${st.who}`;
  const plan = (data.taxPlan && data.taxPlan[key]) || {};
  const p = I.taxProjection(data, all, st.fy, st.who, plan);
  const save = (field, val) => {
    if (!canEdit()) return toast('This device has read-only access.');
    const n = val === '' ? null : Number(String(val).replace(/,/g, ''));
    mutate((d) => { d.taxPlan = { ...(d.taxPlan || {}) }; const cur = { ...(d.taxPlan[key] || {}) }; if (n == null || !Number.isFinite(n)) delete cur[field]; else cur[field] = field === 'bondRate' ? n / 100 : n; if (Object.keys(cur).length) d.taxPlan[key] = cur; else delete d.taxPlan[key]; });
    rerender();
  };
  const field = (label, name, value, hint, ph) => h('label', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' } },
    h('span', null, label), h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: value == null || value === '' ? '' : String(value), placeholder: ph || '0', disabled: !canEdit(), 'aria-label': label, onchange: (e) => save(name, e.target.value), style: { width: '100%' } }), hint ? h('small', { class: 'muted' }, hint) : null);
  const c = p.calc, hd = p.headroom, rc = p.recon, r = c.regime;
  const tdsAll = p.tds.year + p.tds.other, refund = p.balance < -0.5;
  const line = (label, val, o = {}) => ({ label, val, ...o });
  const income = [
    line('Salary', money(p.salary.year), { sub: `${money(p.salary.soFar)} credited so far${p.salary.remaining ? ` + ${p.salary.remaining} month${p.salary.remaining > 1 ? 's' : ''} at ${money(p.salary.perMonth)}` : ''}` }),
    line('Bond and FD interest', money(p.interest.year), { sub: `${money(p.interest.soFar)} earned so far, the rest to March from the holdings` }),
    line('Savings account interest', money(p.savings.year), { sub: `${money(p.savings.soFar)} credited so far, the rest at the same pace` }),
    line('Dividends', money(p.dividends), { sub: 'recorded so far, none guessed for the rest' }),
    line('Other income', money(p.other), { sub: 'typed under Adjust' }),
    line('Total income expected', money(c.gross), { bold: true }),
    line('Standard deduction', '−' + money(c.stdDed), { sub: r.label }),
    line('Taxable income', money(c.taxable), { bold: true }),
  ];
  const taxLines = [
    line('Tax on slabs', money(c.slab)), c.rebate ? line('Rebate (section 87A)', '−' + money(c.rebate)) : null, line('Cess at 4%', money(c.cess)),
    line('Expected tax', money(c.tax), { bold: true }),
    line('TDS cut so far', '−' + money(p.tds.soFar), { sub: `${pct(p.tdsRate, 0)} on bonds, and on FDs over 40,000 a year` }),
    line('TDS by March', '−' + money(p.tds.year), { sub: 'worked out from the holdings for the whole year' }),
    p.tds.other ? line('Other TDS already cut', '−' + money(p.tds.other)) : null,
    line(refund ? 'Refund expected when you file' : 'Still to pay', money(Math.abs(p.balance)), { bold: true, tone: refund ? 'pos' : p.balance > 0.5 ? 'neg' : '' }),
  ].filter(Boolean);
  const cols = [{ label: 'Item', host: true, render: (x) => h('span', null, x.bold ? h('b', null, x.label) : x.label, x.sub ? h('small', { class: 'muted', style: { display: 'block' } }, x.sub) : null) }, { label: 'Amount', cls: 'r', render: (x) => (x.bold ? h('b', { class: x.tone || '' }, x.val) : x.val) }];
  const gap = Math.abs(rc.diff);
  const reconText = rc.status === 'ok'
    ? `Matches up to today. Bond payments whose due date has passed come to ${money(rc.expectedNow)} after TDS; the bank got ${money(rc.received)}${gap >= 1 ? `, a difference of ${money(gap)} ${rc.diff < 0 ? 'less' : 'more'}, which is small enough to ignore.` : '.'} Interest earned but not yet due is left out.`
    : rc.status === 'short'
      ? `Bond payments whose due date has passed come to ${money(rc.expectedNow)} after TDS, but the bank got ${money(rc.received)}: ${money(gap)} short. A payment may be missing or late, or TDS may have been cut at a higher rate. Interest earned but not yet due is left out.`
      : `Bond payments whose due date has passed come to ${money(rc.expectedNow)} after TDS, but the bank got ${money(rc.received)}: ${money(gap)} more. A rate or amount on a bond may be out of date, or TDS was not cut, or a payment came in early.`;
  return section(`Expected tax, ${p.fy} (new regime)`, h('div', null,
    h('div', { class: 'stats' },
      stat('Income expected', money(c.gross), 'salary, interest, dividends, other'),
      stat('Expected tax', h('span', { class: c.tax > 0.5 ? 'neg' : 'pos' }, money(c.tax)), c.tax > 0.5 ? `about ${pct(c.gross ? c.tax / c.gross : 0, 1)} of income` : 'nil, covered by the rebate'),
      stat(refund ? 'Refund expected' : 'Still to pay', h('span', { class: refund ? 'pos' : p.balance > 0.5 ? 'neg' : '' }, money(Math.abs(p.balance))), `after ${money(tdsAll)} TDS by March${c.tax < 0.5 && tdsAll > 0.5 ? ', all of it comes back' : ''}`),
      stat(hd.over > 0.5 ? 'Over tax-free limit' : 'Tax-free room', money(hd.over > 0.5 ? hd.over : hd.room), hd.over > 0.5 ? `tax-free up to ${money(hd.zeroLimit)} of income` : `before tax starts, up to ${money(hd.zeroLimit)}`)),
    h('div', { class: rc.status === 'ok' ? 'note-box' : 'alert warn', style: { margin: '10px 0' } }, h('b', { style: { display: 'block' } }, 'Bank against holdings'), h('p', { style: { margin: '4px 0 0', fontWeight: 400, color: 'var(--ink)', fontSize: '.9rem' } }, reconText)),
    h('div', { class: 'card inner', style: { margin: '8px 0' } }, h('b', null, 'More into bonds? '),
      hd.over > 0.5
        ? `You are already ${money(hd.over)} above the tax-free limit, so more bond interest would be taxed.`
        : `At ${pct(hd.rate, 1)} you could hold about ${money(hd.bondsFullYear)} more in bonds and still pay no tax, on a full year of interest.${hd.daysLeft > 0 ? ` Bought today, this year only gets ${hd.daysLeft} days of it, so up to ${money(hd.bondsThisYear)} fits in ${p.fy}.` : ''}`),
    h('details', { class: 'more tax-sec', open: true }, h('summary', null, 'How the income adds up'), table(cols, income, { m: { key: 'tax-income', head: 'Item', views: [['Amount']] } })),
    h('details', { class: 'more tax-sec', open: true }, h('summary', null, 'Tax, TDS and what is left'), table(cols, taxLines, { m: { key: 'tax-lines', head: 'Item', views: [['Amount']] } })),
    h('details', { class: 'more tax-sec' }, h('summary', null, 'Adjust the assumptions'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14em, 1fr))', gap: '12px 16px', margin: '8px 0' } },
        field('Other income for the year (₹)', 'other', plan.other, 'rent, expected dividends, anything else. Blank means 0.'),
        field('Monthly salary from now (₹)', 'salaryMonthly', plan.salaryMonthly, `blank uses the latest month (${money(p.salary.perMonth)})`),
        field('Other TDS already cut (₹)', 'otherTds', plan.otherTds, 'for example on salary. Blank means 0.'),
        field('Bond rate for the idea above (%)', 'bondRate', plan.bondRate ? +(plan.bondRate * 100).toFixed(2) : '', 'blank means 12', '12'))),
    h('details', { class: 'more tax-sec' }, h('summary', null, `Where the bond and FD interest comes from · ${money(p.interest.year)}`),
      p.interest.holdings.length ? table([
        { label: 'Holding', host: true, render: (x) => h('span', null, x.name, h('small', { class: 'muted', style: { display: 'block', fontWeight: 400 } }, [x.holder || '', x.kind].filter(Boolean).join(' · '))) },
        { label: 'Year interest', key: true, cls: 'r', get: (x) => money(x.yearInterest), total: (rs) => money(rs.reduce((a, x) => a + x.yearInterest, 0)) },
        { label: 'Earned so far', cls: 'r', mob: 'under', mlabel: 'so far ', get: (x) => money(x.soFar), total: (rs) => money(rs.reduce((a, x) => a + x.soFar, 0)) },
        { label: 'TDS (est.)', cls: 'r', mob: 'under', mlabel: 'TDS ', get: (x) => money(x.tdsYear), total: (rs) => money(rs.reduce((a, x) => a + x.tdsYear, 0)) },
      ], p.interest.holdings, { footer: {}, m: { key: 'tax-proj-hold', head: 'Holding', views: [['Year interest', 'Earned so far'], ['TDS (est.)']],
        sort: [{ value: 'none', label: 'As listed', kind: 'none' }, { value: 'year', label: 'Year interest', kind: 'num', get: (x) => x.yearInterest }, { value: 'sofar', label: 'Earned so far', kind: 'num', get: (x) => x.soFar }, { value: 'name', label: 'Holding', kind: 'text', get: (x) => String(x.name || '').toLowerCase() }], sortDefault: { value: 'none', dir: 'asc' } } }) : h('p', { class: 'empty' }, 'No bonds or FDs running in this year.'),
      note('Worked out from each holding: principal × rate × days held inside the year, up to maturity or closing. For bonds each payment covers the days since the previous payment day up to its due date (due on the 13th: 14th of last month to the 13th), and counts once that date has come. It is the gross interest, so it does not matter whether TDS was cut on what you received. Private lending and chits are left out.')),
    note('A quick guide, not tax advice. Salary, bond and FD interest, savings interest, recorded dividends and the other income you type are taxed as ordinary income. Capital gains are not included (they have their own rates and the 87A rebate does not apply to them). It assumes you keep today’s bonds and FDs until maturity without reinvesting. Check with your accountant before filing.')));
}

/** Who each account belongs to. Bonds, FDs, lending and savings already carry a holder; the Groww equity and fund accounts and the bank accounts are set here. */
function ownersCard(data, people) {
  const rows = [
    { key: 'stocks', label: 'Stocks & ETFs account', note: 'dividends and share gains', now: I.ownerOfSource(data, 'stocks') },
    { key: 'funds', label: 'Mutual fund account', note: 'fund gains', now: I.ownerOfSource(data, 'funds') },
    ...(data.accounts || []).map((a) => ({ key: 'acct:' + a.id, label: a.name + ' (bank)', note: 'salary and interest credited', now: I.acctOwner(data, a.id) })),
  ];
  const listId = 'tax-people';
  const save = (key, val) => { if (!canEdit()) return toast('This device has read-only access.'); try { mutate((d) => { d.taxOwners = { ...(d.taxOwners || {}) }; const v = String(val).trim(); if (v && v !== I.NO_OWNER) d.taxOwners[key] = v; else delete d.taxOwners[key]; }); } catch (e) { toast(e.message, 'error'); } };
  return h('details', { class: 'more' }, h('summary', null, 'Who owns which account'),
    h('p', { class: 'note' }, 'Bonds, FDs, lending and savings use the holder already on each one. Set the owner of the other accounts here, then pick a person above. Type a new name to add someone (a wife, a HUF, a parent).'),
    h('datalist', { id: listId }, people.map((p) => h('option', { value: p }))),
    h('div', { class: 'owner-rows' }, rows.map((r) => h('label', { class: 'owner-row' }, h('span', null, h('b', null, r.label), h('small', { class: 'muted' }, ' · ' + r.note)),
      h('input', { type: 'text', list: listId, value: r.now === I.NO_OWNER ? '' : r.now, placeholder: 'Owner', disabled: !canEdit(), 'aria-label': 'Owner of ' + r.label, onchange: (e) => save(r.key, e.target.value) })))));
}

// ---------- 2. Cash calendar ----------
let calPick = null;
function calendar(root) {
  const { data, all } = S;
  const cal = I.cashCalendar(data, all, st.months);
  const al = I.maturityAlerts(data, all);
  if (al.length) root.append(h('div', { class: 'card alert-card', role: 'alert' }, h('h3', null, `Maturing within a month${al.some((x) => x.overdue) ? ' or already due' : ''}`),
    h('ul', { class: 'findings' }, al.map((x) => h('li', { class: x.overdue || x.daysLeft <= 7 ? 'over' : 'amber' }, h('b', null, x.name), ` (${x.kind}) `, x.overdue ? h('span', { class: 'neg' }, `was due ${dateStr(x.date)}`) : h('span', { class: x.daysLeft <= 7 ? 'neg' : 'warn' }, x.daysLeft === 0 ? 'matures today' : `matures in ${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} (${dateStr(x.date)})`), ' · ', x.basis === 'projected' ? '≈ ' : '', money(x.amount), x.basis === 'projected' ? h('small', { class: 'muted' }, ' projected from the rate') : x.basis === 'entered' ? h('small', { class: 'muted' }, ' expected payout') : x.basis === 'paid' ? h('small', { class: 'muted' }, ' paid in so far (no payout or rate entered)') : null)))));
  root.append(h('div', { class: 'filters' }, select([3, 6, 12, 24].map((n) => ({ value: String(n), label: `Next ${n} months` })), st.months, 'Months ahead', (v) => { st.months = Number(v); calPick = null; rerender(); })));
  const MAT = (x) => !['Interest', 'Money to receive', 'Loan EMI'].includes(x.kind);
  const mats = cal.months.map((r) => ({ ...r, mat: r.items.filter(MAT) }));
  const total = mats.reduce((a, r) => a + r.mat.reduce((b, x) => b + x.amount, 0), 0);
  if (calPick && !mats.some((r) => r.month === calPick)) calPick = null;
  const box = h('div');
  const draw = () => {
    const chart = stackedBars({ names: ['Maturing'], colors: [2], fmt: compact, height: 240,
      groups: mats.map((r) => ({ label: monthLabel(r.month).slice(0, 3), title: monthLabel(r.month, true), bars: [Object.entries(r.mat.reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] || 0) + x.amount }), {})).map(([name, value]) => ({ name, value }))] })),
      selected: calPick ? { g: mats.findIndex((r) => r.month === calPick), s: 0 } : null,
      onSelect: (g) => { calPick = calPick === mats[g].month ? null : mats[g].month; draw(); } });
    let detail;
    if (calPick) {
      const r = mats.find((x) => x.month === calPick);
      detail = h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, `Maturing in ${monthLabel(r.month, true)} · ${money(r.mat.reduce((a, x) => a + x.amount, 0))}`),
        r.mat.length ? table([
          { label: 'Date', get: (x) => (x.late ? 'Overdue' : dateStr(x.date)) }, { label: 'What', host: true, get: (x) => x.title },
          { label: 'Kind', mob: 'hide', get: (x) => x.kind }, { label: 'Amount', cls: 'r', get: (x) => money(x.amount) },
        ], r.mat, { footer: { label: 'Total' }, m: { key: 'cal-mat', head: 'What', sub: ['Date', 'Kind'], views: [['Amount']] } }) : h('p', { class: 'empty' }, 'Nothing matures this month.'));
    } else detail = h('p', { class: 'note' }, 'Tap a column to see what matures in that month.');
    box.replaceChildren(chart, detail);
  };
  draw();
  root.append(section(`Money maturing, next ${st.months} months · ${money(total)}`, box));
  root.append(note('Bonds, FDs, private lending, chits and other savings by the month they mature. Overdue maturities are shown in this month, since the money is yet to be collected.'));
}

// ---------- 3. Annual review ----------
function review(root) {
  const { data, all } = S;
  const years = I.yearsWithLedger(data, all.asOf);
  if (!years.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No transactions yet.'))); return; }
  if (!st.year || !years.includes(st.year)) st.year = years[0];
  const r = I.annualReview(data, all, Number(st.year));
  const s = r.summary;
  root.append(h('div', { class: 'filters' }, select(years.map((y) => ({ value: y, label: y })), st.year, 'Year', (v) => { st.year = v; rerender(); }), btn('Print', () => window.print(), 'small')));
  root.append(h('div', { class: 'stats' },
    stat('Net worth', r.nwEnd != null ? money(r.nwEnd) : '–', r.nwChange != null ? h('span', { class: tone(r.nwChange) }, `${signed(r.nwChange)} since ${monthLabel(r.nwStartKey, true)}`) : 'no snapshots'),
    stat('Income', money(s.totalIncome), r.salary ? `salary ${money(r.salary)}` : ''),
    stat('Spent', money(s.totalExpense), r.savingsRate != null ? `${pct(1 - s.totalExpense / s.totalIncome, 0)} of income kept` : ''),
    stat('Invested', money(s.totalInvest), r.investRate != null ? `${pct(r.investRate, 0)} of income` : ''),
    stat('Left over', h('span', { class: tone(s.left) }, signed(s.left)), 'after spending and investing')));
  root.append(h('div', { class: 'grid2' },
    section('Highlights', h('ul', { class: 'plain' },
      r.best ? h('li', null, 'Best month: ', h('b', null, monthLabel(r.best.month, true)), ' · left ', money(r.best.left)) : null,
      r.worst && r.worst !== r.best ? h('li', null, 'Toughest month: ', h('b', null, monthLabel(r.worst.month, true)), ' · left ', h('span', { class: tone(r.worst.left) }, signed(r.worst.left))) : null,
      r.taxFy.dividendTotal ? h('li', null, 'Dividends received: ', money(r.taxFy.dividendTotal), ` (${r.taxFy.fy})`) : null,
      r.taxFy.gains.length ? h('li', null, 'Gains booked: ', h('span', { class: tone(r.taxFy.stcg + r.taxFy.ltcg) }, signed(r.taxFy.stcg + r.taxFy.ltcg)), ` (${r.taxFy.fy})`) : null,
      h('li', null, 'Interest and other income: ', money(r.interest)))),
    section('Where the money went', r.topExpenses.length ? table([{ label: 'Category', host: true, get: (x) => x.category }, { label: 'Spent', cls: 'r', get: (x) => money(x.amount) }, { label: 'Share', cls: 'r', mob: 'under', mlabel: '', get: (x) => pct(x.amount / s.totalExpense, 0) }], r.topExpenses, { m: { key: 'rev-top', head: 'Category', views: [['Spent', 'Share']] } }) : h('p', { class: 'empty' }, 'No spending.'))));
  root.append(interestSection(data, all, st.year));
  const planned = plannedByMonth(data, all);
  const havePlan = r.months.some((m) => planned.has(m.month) && m.nw != null);
  root.append(section('Month by month', table([
    { label: 'Month', host: true, get: (m) => monthLabel(m.month, true) },
    { label: 'Income', cls: 'r', get: (m) => money(m.income) },
    { label: 'Spent', cls: 'r', mob: 'under', mlabel: 'spent ', get: (m) => money(m.expense) },
    { label: 'Invested', cls: 'r', mob: 'hide', get: (m) => money(m.invest) },
    { label: 'Left', cls: 'r', mob: 'under', mlabel: 'left ', render: (m) => h('span', { class: tone(m.left) }, signed(m.left)) },
    { label: 'Net worth', cls: 'r', mob: 'hide', get: (m) => (m.nw != null ? money(m.nw) : '–') },
    havePlan ? { label: 'Against plan', cls: 'r', mob: 'hide', render: (m) => (m.nw != null && planned.has(m.month) ? h('span', { class: tone(m.nw - planned.get(m.month)) }, signed(m.nw - planned.get(m.month))) : '–') } : null,
  ].filter(Boolean), r.months, { m: { key: 'rev-months', head: 'Month', views: havePlan ? [['Income', 'Spent'], ['Left', 'Invested'], ['Net worth', 'Against plan']] : [['Income', 'Spent'], ['Left', 'Invested'], ['Net worth']],
    sort: [{ value: 'month', label: 'Month', kind: 'date', get: (m) => m.month }, { value: 'income', label: 'Income', kind: 'num', get: (m) => m.income }, { value: 'expense', label: 'Spent', kind: 'num', get: (m) => m.expense }, { value: 'left', label: 'Left', kind: 'num', get: (m) => m.left }], sortDefault: { value: 'month', dir: 'asc' } } })));
  root.append(note('Spent includes loan EMIs and tax. Invested is money moved to investments, so Left is what stayed in the bank. Net worth comes from your month-end snapshots.'));
}

let revPick = null;
/** Interest from bonds and lending against spending, month by month, with a regular / one-time split. */
function interestSection(data, all, year) {
  const rows = I.interestVsSpend(data, all, Number(year));
  if (!rows.length) return section('Interest income against spending', h('p', { class: 'empty' }, 'No entries in this year yet.'));
  if (revPick && !rows.some((r) => r.month === revPick)) revPick = null;
  const counted = [...new Set(rows.flatMap((r) => r.counted.map((x) => x.category)))];
  const once = I.oneTimeSet(data);
  const box = h('div');
  const catTable = (title, list, tot) => h('div', null, h('h4', { style: { margin: '6px 0 4px' } }, `${title} · ${money(tot)}`), list.length ? table([{ label: 'Category', host: true, get: (x) => x.category }, { label: 'Amount', cls: 'r', get: (x) => money(x.amount) }], list, { m: { key: 'rev-cat', head: 'Category', views: [['Amount']] } }) : h('p', { class: 'empty' }, 'None'));
  const draw = () => {
    const chart = stackedBars({ names: ['Monthly interest income', 'Monthly regular expense'], colors: [2, 7], fmt: money, height: 240,
      groups: rows.map((r) => ({ label: monthLabel(r.month).slice(0, 3), title: monthLabel(r.month, true), bars: [[{ name: 'Interest', value: r.interest }], [{ name: 'Regular spending', value: r.regular }]] })),
      selected: revPick ? { g: rows.findIndex((r) => r.month === revPick), s: 0 } : null,
      onSelect: (g) => { revPick = revPick === rows[g].month ? null : rows[g].month; draw(); } });
    const picks = null;
    let detail = h('p', { class: 'note' }, 'Tap a month’s column to see its income and spending by category. Regular spending leaves out EMI and the one-time categories, so it is what your interest should pay for.');
    if (revPick) {
      const r = rows.find((x) => x.month === revPick);
      detail = h('div', { class: 'card inner' }, h('h4', { style: { margin: '0 0 4px' } }, monthLabel(r.month, true)),
        h('div', { class: 'grid2' }, catTable('Interest counted (Income Bond, Income Lending)', r.counted, r.interest), h('div', null, catTable('Regular spending', r.expense.filter((x) => x.category.toLowerCase() !== 'loan' && !once.has(x.category.toLowerCase())), r.regular), r.oneTime > 0.5 ? catTable('One-time spending', r.expense.filter((x) => once.has(x.category.toLowerCase())), r.oneTime) : null)));
    }
    const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
    const dev = (v) => h('span', { class: v >= 0 ? 'pos' : 'neg' }, (v >= 0 ? '+' : '−') + money(Math.abs(v)));
    box.replaceChildren(chart, detail,
      h('h4', { style: { margin: '12px 0 4px' } }, 'The same in a table'),
      table([
        { label: 'Month', host: true, get: (r) => monthLabel(r.month, true) },
        { label: 'Monthly income (bond and lending interest)', cls: 'r', render: (r) => h('span', { class: 'pos' }, money(r.interest)), total: () => h('span', { class: 'pos' }, money(tot('interest'))) },
        { label: 'Regular expense', cls: 'r', mob: 'under', mlabel: 'regular ', render: (r) => h('span', { class: 'neg' }, money(r.regular)), total: () => h('span', { class: 'neg' }, money(tot('regular'))) },
        { label: 'One-time expense', cls: 'r', mob: 'under', mlabel: 'one-time ', get: (r) => money(r.oneTime), total: () => money(tot('oneTime')) },
        { label: 'Short by (income − regular expense)', cls: 'r', render: (r) => (r.deviation >= 0 ? h('span', { class: 'pos' }, 'Spare ' + money(r.deviation)) : h('span', { class: 'neg' }, 'Short by ' + money(-r.deviation))), total: () => { const v = tot('deviation'); return v >= 0 ? h('span', { class: 'pos' }, 'Spare ' + money(v)) : h('span', { class: 'neg' }, 'Short by ' + money(-v)); } },
      ], rows, { footer: { label: 'Year' }, rowClass: (r) => (r.deviation < 0 ? 'row-bad' : ''), m: { key: 'rev-interest', head: 'Month', views: [['Short by (income − regular expense)', 'Monthly income (bond and lending interest)'], ['Regular expense', 'One-time expense']],
        sort: [{ value: 'month', label: 'Month', kind: 'date', get: (r) => r.month }, { value: 'dev', label: 'Spare or short', kind: 'num', get: (r) => r.deviation }, { value: 'interest', label: 'Interest income', kind: 'num', get: (r) => r.interest }, { value: 'regular', label: 'Regular expense', kind: 'num', get: (r) => r.regular }], sortDefault: { value: 'month', dir: 'asc' } } }),
      h('p', { class: 'note' }, `Interest income counts the bank credits in ${counted.length ? counted.join(', ') : '“Income Bond” and “Income Lending” (none found)'}. All other income is ignored here. Loan EMI is left out of spending. One-time spending is: ${[...once].length ? [...once].join(', ') : 'nothing chosen'}; everything else is regular.`),
      needCard(data, rows),
      canEdit() ? btn('Choose the one-time categories', () => oneTimeDialog(data), 'small') : null);
  };
  draw();
  return section('Interest income against spending', box);
}
function oneTimeDialog(data) {
  const cats = I.allCategories(data).filter((c) => c.kind !== 'income' && c.kind !== 'transfer');   // only things you spend or invest can be one-time
  const chosen = I.oneTimeSet(data);
  const boxes = cats.map((c) => ({ c, el: h('input', { type: 'checkbox', checked: chosen.has(c.name.toLowerCase()) }) }));
  const kindWord = { expense: 'expense', income: 'income', investment: 'investment', transfer: 'transfer' };
  dialog('One-time categories', h('div', null, h('p', { class: 'note' }, 'Expense and investment categories are listed. Tick the ones you pay once or twice a year, like tax, school fees, a holiday or a function. Everything else counts as regular monthly spending.'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(13em, 1fr))', gap: '4px 12px', maxHeight: '50vh', overflow: 'auto' } }, boxes.map((b) => h('label', { class: 'check-inline' }, b.el, ' ' + b.c.name, h('small', { class: 'muted' }, ' · ' + (kindWord[b.c.kind] || b.c.kind || ''))))),),
    [{ label: 'Save', class: 'primary', onclick: (c) => { mutate((d) => { d.settings = { ...d.settings, oneTimeCats: boxes.filter((b) => b.el.checked).map((b) => b.c.name) }; }); c(); } }, { label: 'Cancel', onclick: (c) => c() }]);
}

/** How much more to put in at a given yearly rate for interest to pay the regular spending, from the average of the latest months. */
function needCard(data, rows) {
  const last = rows.slice(-6), n = last.length;
  if (!n) return null;
  const avg = (k) => last.reduce((a, r) => a + r[k], 0) / n;
  const interest = avg('interest'), regular = avg('regular'), gap = regular - interest, tds = data.settings.tdsRate ?? 0.1;
  const need = (rate) => (gap > 0 ? (gap * 12) / (rate * (1 - tds)) : 0);
  const rates = [0.10, 0.12, 0.15];
  return h('div', { class: 'card inner', style: { margin: '12px 0' } }, h('h4', { style: { margin: '0 0 6px' } }, gap > 0 ? 'How much more to invest so interest covers regular spending' : 'Interest covers your regular spending'),
    h('p', { class: 'note', style: { marginTop: 0 } }, `Average of the last ${n} month${n === 1 ? '' : 's'}: interest ${money(interest)} a month, regular spending ${money(regular)} (no EMI, no one-time). `, gap > 0 ? h('b', { class: 'neg' }, `Short by ${money(gap)} a month.`) : h('b', { class: 'pos' }, `${money(-gap)} a month to spare.`)),
    gap > 0 ? table([{ label: 'If the new money earns', host: true, get: (r) => pct(r, 0) + ' a year' }, { label: 'Invest about', cls: 'r', render: (r) => h('b', null, money(need(r))) }, { label: 'Which pays', mob: 'under', mlabel: 'pays ', cls: 'r', get: () => money(gap) + ' a month' }], rates, { m: { key: 'rev-need', head: 'If the new money earns', views: [['Invest about', 'Which pays']] } }) : null,
    gap > 0 ? h('p', { class: 'note' }, `Worked out as shortfall × 12 ÷ (rate × (1 − ${Math.round(tds * 100)}% TDS)), so the interest you keep after tax equals the shortfall.`) : null);
}

// ---------- 4. Spending anomalies ----------
function anomalies(root) {
  const { data, all } = S;
  const months = C.ledgerMonths(data).slice().reverse();
  if (!months.length) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No transactions yet.'))); return; }
  if (!st.month || !months.includes(st.month)) st.month = months[0];
  const a = I.anomalies(data, all, st.month);
  root.append(h('div', { class: 'filters' }, select(months.map((m) => ({ value: m, label: monthLabel(m, true) })), st.month, 'Month', (v) => { st.month = v; rerender(); })));
  const n = a.spikes.length + a.fresh.length + a.missing.length + a.big.length;
  root.append(h('div', { class: 'stats' },
    stat('Everyday spending', money(a.total), a.basis ? `usual ${money(a.avgTotal)}` : 'no earlier months'),
    stat('Things to look at', String(n), n ? 'listed below' : 'all looks normal')));
  if (a.basis < 2) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Needs at least two earlier months to compare against.'))); return; }
  const ents = (es) => es.map((e) => `${dateStr(e.date)} ${e.desc || ''} ${money(e.debit)}`.trim()).join(' · ');
  root.append(section('Higher than usual', a.spikes.length ? table([
    { label: 'Category', host: true, get: (x) => x.category },
    { label: 'This month', cls: 'r', get: (x) => money(x.amount) },
    { label: 'Usual', cls: 'r', mob: 'under', mlabel: 'usual ', get: (x) => money(x.avg) },
    { label: 'Times usual', cls: 'r', mob: 'under', mlabel: '', get: (x) => x.ratio.toFixed(1) + '×' },
    { label: 'Biggest entries', mob: 'hide', get: (x) => ents(x.entries) },
  ], a.spikes, { m: { key: 'anom-spikes', head: 'Category', views: [['This month', 'Usual'], ['Times usual', 'Biggest entries']],
    sort: [{ value: 'ratio', label: 'Times usual', kind: 'num', get: (x) => x.ratio }, { value: 'amount', label: 'This month', kind: 'num', get: (x) => x.amount }, { value: 'name', label: 'Category', kind: 'text', get: (x) => String(x.category || '').toLowerCase() }], sortDefault: { value: 'ratio', dir: 'desc' } } }) : h('p', { class: 'empty' }, 'No category is unusually high.')));
  if (a.fresh.length) root.append(section('New this month', table([{ label: 'Category', host: true, get: (x) => x.category }, { label: 'Amount', cls: 'r', get: (x) => money(x.amount) }, { label: 'Entries', mob: 'hide', get: (x) => ents(x.entries) }], a.fresh, { m: { key: 'anom-new', head: 'Category', sub: ['Entries'], views: [['Amount']] } })));
  if (a.big.length) root.append(section('Large single payments', table([{ label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Description', host: true, get: (e) => e.desc }, { label: 'Category', mob: 'under', get: (e) => e.category }, { label: 'Amount', cls: 'r', get: (e) => money(e.debit) }, { label: 'Usual entry', cls: 'r', mob: 'hide', get: (e) => money(e.median) }], a.big, { m: { key: 'anom-big', head: 'Description', sub: ['Date', 'Category'], views: [['Amount', 'Usual entry']],
    sort: [{ value: 'date', label: 'Date', kind: 'date', get: (e) => e.date }, { value: 'amount', label: 'Amount', kind: 'num', get: (e) => e.debit }, { value: 'desc', label: 'Description', kind: 'text', get: (e) => String(e.desc || '').toLowerCase() }], sortDefault: { value: 'date', dir: 'desc' } } })));
  if (a.missing.length) root.append(section('Usual spending that did not happen', h('div', null, table([{ label: 'Category', host: true, get: (x) => x.category }, { label: 'Usual per month', cls: 'r', get: (x) => money(x.avg) }], a.missing, { m: { key: 'anom-missing', head: 'Category', views: [['Usual per month']] } }), note('A regular bill missing can mean it was paid from another account or not yet entered.'))));
  root.append(note(`Compared with the average of the ${a.basis} months before. Loan EMIs and tax are left out.`));
}

// ---------- 5. Allocation goal ----------
const OUTLOOK_OPTS = P.OUTLOOKS.map((o) => ({ value: o.id, label: `${o.name} (${pct(o.rate, 0)} a year)` }));
const gname = (id) => (I.GOAL_GROUPS.find((x) => x.id === id) || {}).label || id;
function allocation(root) {
  const { data, all } = S;
  // The Wealth outlook plan the goal is read alongside: pick it like on the Wealth outlook pages. Its settings are shown read only, folded.
  const ctx = currentPlan();
  root.append(planPicker({ versions: true }));
  if (ctx.plan) root.append(planSettingsCard(ctx.plan));
  else root.append(h('p', { class: 'note' }, `Plan ${ctx.year} has no live plan to show. Make one on the Wealth outlook Planner tab.`));
  const goal = I.normGoal(data.allocGoal);
  const outlookId = (goal && goal.outlook) || 'steady';
  const outlook = P.OUTLOOKS.find((o) => o.id === outlookId);
  const now = I.allocNow(data, all, outlook.rate);
  const total = now.reduce((x, y) => x + y.value, 0);
  const monthly = goal && goal.monthly != null ? goal.monthly : I.defaultMonthly(data, all);
  const link = h('a', { class: 'crosslink', href: '#/projector/ahead' }, 'Wealth outlook');
  const edit = () => goalForm(goal, now, monthly, outlookId);
  if (!goal) {
    root.append(h('div', { class: 'card' }, h('h3', null, 'Set the mix you want to reach'),
      note('Choose a target for the groups you care about, for example Debts & fixed income 50% and Equity 25%. Anything you leave blank keeps the share it has today, and the rest is split for you. Inside a group you can do the same for its rows.'),
      h('div', { class: 'row-actions' }, ...I.PRESETS.map((p) => btn(p.name, () => (canEdit() ? saveGoal({ ...I.presetGoal(p.pct), monthly, outlook: outlookId }) : toast('This device has read-only access.')), 'small')), canEdit() ? btn('Set my own', edit, 'primary small') : null),
      note('The three presets are only starting points, not advice. You can change every number.')));
    root.append(h('h4', null, 'Where you are today'), groupedTable({ rows: now, groupOf: (x) => I.GROUP_OF[x.key], cols: [{ label: 'Group' }, { label: 'Value', cls: 'r', parent: (it) => money(it.reduce((a, x) => a + x.value, 0)), child: (x) => money(x.value), total: () => money(total) }, { label: 'Share', cls: 'r', parent: (it) => pct(total ? it.reduce((a, x) => a + x.value, 0) / total : 0, 1), child: (x) => pct(total ? x.value / total : 0, 1) }] }));
    return;
  }
  const res = I.resolveGoal(goal, now);
  const pathGoal = Object.fromEntries(Object.entries(res.items).map(([k, v]) => [k, v]));
  const path = I.allocPath(now, pathGoal, monthly);
  const gNow = (id) => now.filter((x) => I.GROUP_OF[x.key] === id).reduce((a, x) => a + x.value, 0);
  const rows = now.map((x) => {
    const id = I.GROUP_OF[x.key], gv = gNow(id), sh = total ? x.value / total : 0, goalSh = res.items[x.key] / 100, want = goalSh * total;
    return { ...x, gid: id, share: sh, goal: goalSh, withinNow: gv ? x.value / gv : 0, withinGoal: res.within[x.key] / 100, gap: sh - goalSh, move: want - x.value, add: path.firstSplit[x.key] || 0, auto: !res.itemSet[x.key] };
  });
  const grp = I.GOAL_GROUPS.map((g) => { const it = rows.filter((r) => r.gid === g.id); const v = it.reduce((a, r) => a + r.value, 0), goalSh = res.groups[g.id] / 100; return { id: g.id, label: g.label, value: v, share: total ? v / total : 0, goal: goalSh, gap: (total ? v / total : 0) - goalSh, move: goalSh * total - v, auto: res.autoG.includes(g.id) }; });
  const worst = grp.slice().sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  const toMove = rows.reduce((a, r) => a + Math.max(0, r.move), 0);
  root.append(h('div', { class: 'pagebar' }, h('span', { class: 'muted' }, 'Set the mix you want and see how long it takes'), h('span', null, link), canEdit() ? btn('Change goal', edit, 'small') : null));
  if (!res.ok) root.append(h('div', { class: 'card' }, ...res.errors.map((e) => h('p', { class: 'neg' }, e)), note('Open “Change goal” and fix these.')));
  root.append(h('div', { class: 'stats' },
    stat('Time to reach it', I.monthsText(path.reached), path.reached == null ? 'raise the monthly amount or relax the goal' : `by ${monthLabel(C.addMonths(all.asOf.slice(0, 7) + '-01', path.reached).slice(0, 7), true)}`),
    stat('New money each month', money(monthly), 'from income less spending'),
    stat('Furthest group from goal', worst.label, `${worst.gap > 0 ? 'over' : 'under'} by ${(Math.abs(worst.gap) * 100).toFixed(1)} points`),
    stat('Would have to move today', money(toMove), 'if you rebalanced at once instead of adding money')));
  const sm = (it, k) => it.reduce((a, x) => a + x[k], 0);
  const gapTxt = (gap) => h('span', { class: Math.abs(gap) <= 0.02 ? 'pos' : 'neg' }, (gap > 0 ? '+' : gap < 0 ? '−' : '') + (Math.abs(gap) * 100).toFixed(1) + ' pts');
  const moveTxt = (mv) => h('span', { class: mv > 0 ? 'pos' : mv < 0 ? 'neg' : '' }, mv > 0 ? 'add ' + money(mv) : mv < 0 ? 'trim ' + money(-mv) : '–');
  const tag = (auto) => (auto ? h('small', { class: 'muted' }, ' auto') : null);
  const multi = (id) => rows.filter((r) => r.gid === id).length > 1;
  root.append(section('Goal against today', h('div', null, groupedTable({
    rows, groupOf: (x) => x.gid,
    cols: [
      { label: 'Group' },
      { label: 'Now', cls: 'r', parent: (it) => money(sm(it, 'value')), child: (x) => money(x.value), total: () => money(total) },
      { label: 'Now %', cls: 'r', parent: (it) => pct(sm(it, 'share'), 1), child: (x) => (multi(x.gid) ? pct(x.withinNow, 1) : '') },
      { label: 'Goal %', cls: 'r', parent: (it) => h('span', null, pct(sm(it, 'goal'), 1), tag(grp.find((g) => g.id === it[0].gid).auto)), child: (x) => (multi(x.gid) ? h('span', null, pct(x.withinGoal, 1), tag(x.auto)) : '') },
      { label: 'Gap', cls: 'r', hide: true, parent: (it) => gapTxt(sm(it, 'gap')), child: (x) => (multi(x.gid) ? gapTxt(x.withinNow - x.withinGoal) : '') },
      { label: 'To reach goal today', cls: 'r', hide: true, parent: (it) => moveTxt(sm(it, 'move')), child: (x) => moveTxt(x.move) },
    ],
  }),
  note('A group row is its share of everything you own. The rows inside show the share within that group. “auto” means you left it blank and it follows your current mix. Within 2 points counts as reached. The plan below avoids selling and uses new money instead.'))));
  root.append(section('Where new money should go', h('div', null, path.reached === 0 ? h('p', null, 'You are already inside the goal. Keep adding in the goal proportions:') : null, groupedTable({
    rows: rows.map((x) => ({ ...x, amt: x.add || (path.reached === 0 ? monthly * x.goal : 0) })), groupOf: (x) => x.gid,
    cols: [
      { label: 'Group' },
      { label: 'Per month', cls: 'r', parent: (it) => money(sm(it, 'amt')), child: (x) => money(x.amt), total: (rs) => money(sm(rs, 'amt')) },
      { label: 'Share of new money', cls: 'r', parent: (it) => (monthly ? pct(sm(it, 'amt') / monthly, 0) : '–'), child: (x) => (monthly ? pct(x.amt / monthly, 0) : '–') },
    ],
  }), note('This is the split for the first month. It shifts toward the groups still short of the goal as the months go by. Add a monthly amount above zero to see it.'))));
  root.append(projection(now, pathGoal, monthly));
}
/** Today's mix next to the mix after investing the monthly amount the way the goal says, for a chosen horizon. */
function projection(now, pathGoal, monthly) {
  const { all } = S;
  const asOf = all.asOf, toYearEnd = 13 - Number(asOf.slice(5, 7)); // months until 31 Dec
  const hz = [
    { id: 'y0', label: 'This year end', m: Math.max(1, toYearEnd) }, { id: 'y1', label: 'Next year end', m: Math.max(1, toYearEnd) + 12 },
    { id: 'y2', label: '2 years', m: 24 }, { id: 'y3', label: '3 years', m: 36 }, { id: 'y4', label: '4 years', m: 48 }, { id: 'y5', label: '5 years', m: 60 },
  ];
  let cur = 'y1', drill = null;
  const box = h('div');
  const snapAt = (m) => { const r = I.allocPath(now, pathGoal, monthly, { tol: -1, maxMonths: m }); return r.path[r.path.length - 1]; };
  const draw = () => {
    const hzo = hz.find((x) => x.id === cur), p = snapAt(hzo.m);
    const nowVals = Object.fromEntries(now.map((x) => [x.key, x.value])), nowTot = Object.values(nowVals).reduce((a, b) => a + b, 0);
    const label = (k) => I.ALLOC.find((a) => a.key === k).label;
    const items = (vals, id) => (id ? I.ALLOC.filter((a) => I.GROUP_OF[a.key] === id).map((a) => ({ label: label(a.key), value: vals[a.key] || 0 }))
      : I.GOAL_GROUPS.map((g, i) => ({ id: g.id, label: g.label, value: I.ALLOC.filter((a) => I.GROUP_OF[a.key] === g.id).reduce((x, a) => x + (vals[a.key] || 0), 0), color: color(i) })));
    const pie = (title, vals, tot) => {
      const it = items(vals, drill), sub = it.reduce((a, x) => a + x.value, 0);
      return h('div', { class: 'alloc-chart', style: { textAlign: 'center' } }, h('h4', { style: { margin: '0 0 4px' } }, title),
        donut(it.map((x, i) => ({ ...x, color: drill ? color(i) : x.color })), { fmt: money, center: compact(sub), sub: drill ? `${tot ? pct(sub / tot, 0) : '–'} of all` : 'total assets', size: 200, onSelect: drill ? null : (x) => { drill = x.id; draw(); } }),
        h('ul', { class: 'legend-list', style: { listStyle: 'none', padding: 0, margin: '6px 0 0', fontSize: '0.9em' } }, it.map((x, i) => h('li', null, h('span', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: drill ? color(i) : x.color, marginRight: '6px' } }), `${x.label} ${sub ? pct(x.value / sub, 1) : '–'}`))));
    };
    const gl = (id) => (I.GOAL_GROUPS.find((g) => g.id === id) || {}).label;
    const rows = I.ALLOC.map((a) => ({ key: a.key, label: a.label, gid: I.GROUP_OF[a.key], now: nowVals[a.key] || 0, then: p.values[a.key] || 0 }));
    const sm = (it, k) => it.reduce((a, x) => a + x[k], 0);
    const multi = (id) => rows.filter((r) => r.gid === id).length > 1;
    const gTot = (id, k) => sm(rows.filter((r) => r.gid === id), k);
    const chg = (a, b) => h('span', { class: b - a >= 0 ? 'pos' : 'neg' }, (b - a >= 0 ? '+' : '−') + compact(Math.abs(b - a)));
    box.replaceChildren(
      h('div', { class: 'seg', style: { flexWrap: 'wrap', marginBottom: '8px' } }, hz.map((x) => h('button', { class: 'chip-btn' + (x.id === cur ? ' on' : ''), onclick: () => { cur = x.id; draw(); } }, x.label))),
      h('p', { class: 'note', style: { marginTop: 0 } }, `If you put ${money(monthly)} a month into the groups that are short of the goal, here is the mix by ${monthLabel(C.addMonths(asOf.slice(0, 7) + '-01', hzo.id === 'y0' || hzo.id === 'y1' ? hzo.m - 1 : hzo.m).slice(0, 7), true)}. Growth follows the market outlook you chose. This is an illustration, not a forecast.`),
      drill ? h('div', { style: { marginBottom: '6px' } }, btn('← All groups', () => { drill = null; draw(); }, 'small'), h('b', { style: { marginLeft: '8px' } }, gl(drill))) : h('p', { class: 'note', style: { margin: '0 0 6px' } }, 'Tap a slice to see what is inside it.'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' } }, pie('Today', nowVals, nowTot), pie(hzo.label, p.values, p.total)),
      h('h4', null, 'Same in numbers'),
      groupedTable({ rows, groupOf: (r) => r.gid, cols: [
        { label: 'Group' },
        { label: 'Today', cls: 'r', parent: (it) => money(sm(it, 'now')), child: (x) => money(x.now), total: (rs) => money(sm(rs, 'now')) },
        { label: 'Today %', cls: 'r', hide: true, parent: (it) => pct(nowTot ? sm(it, 'now') / nowTot : 0, 1), child: (x) => (multi(x.gid) && gTot(x.gid, 'now') ? pct(x.now / gTot(x.gid, 'now'), 1) : '') },
        { label: hzo.label, cls: 'r', parent: (it) => money(sm(it, 'then')), child: (x) => money(x.then), total: (rs) => money(sm(rs, 'then')) },
        { label: 'Then %', cls: 'r', hide: true, parent: (it) => pct(p.total ? sm(it, 'then') / p.total : 0, 1), child: (x) => (multi(x.gid) && gTot(x.gid, 'then') ? pct(x.then / gTot(x.gid, 'then'), 1) : '') },
        { label: 'Change', cls: 'r', parent: (it) => chg(sm(it, 'now'), sm(it, 'then')), child: (x) => chg(x.now, x.then) },
      ] }));
  };
  draw();
  return section('How the mix changes if you invest this way', box);
}
const monthsShort = (m) => (m >= 12 ? `${Math.floor(m / 12)}y ${m % 12 ? (m % 12) + 'm' : ''}`.trim() : `${m}m`);
function saveGoal(goal) { try { mutate((d) => { delete d.allocGoal; d.allocGoal = goal; }); rerender(); } catch (e) { toast(e.message, 'error'); } }
function goalForm(g0, now, monthly, outlook) {
  const goal = g0 || { groupTargets: {}, subTargets: {} };
  const total = now.reduce((a, x) => a + x.value, 0);
  const num = (ph, val) => h('input', { type: 'number', inputmode: 'decimal', step: '0.5', min: '0', max: '100', placeholder: ph, value: val == null ? '' : String(Math.round(val * 10) / 10), class: 'pct-in' });
  const gIn = {}, kIn = {}, resTxt = {}, blocks = [];
  const gNowV = (id) => now.filter((x) => I.GROUP_OF[x.key] === id).reduce((a, x) => a + x.value, 0);
  for (const gr of I.GOAL_GROUPS) {
    const ks = now.filter((x) => I.GROUP_OF[x.key] === gr.id);
    if (!ks.length) continue;
    gIn[gr.id] = num('auto', goal.groupTargets[gr.id]);
    resTxt[gr.id] = h('small', { class: 'muted' });
    const gv = gNowV(gr.id);
    const head = h('div', { class: 'goal-row goal-head' }, h('div', null, h('strong', null, gr.label), h('small', { class: 'muted' }, ` now ${pct(total ? gv / total : 0, 1)}`)), h('div', { class: 'goal-in' }, gIn[gr.id], h('span', null, '%')), resTxt[gr.id]);
    const kids = ks.length > 1 ? ks.map((x) => {
      kIn[x.key] = num('auto', (goal.subTargets || {})[x.key]); resTxt[x.key] = h('small', { class: 'muted' });
      return h('div', { class: 'goal-row goal-kid' }, h('div', null, I.ALLOC.find((a) => a.key === x.key).label, h('small', { class: 'muted' }, ` now ${pct(gv ? x.value / gv : 0, 1)} of group`)), h('div', { class: 'goal-in' }, kIn[x.key], h('span', null, '%')), resTxt[x.key]);
    }) : [];
    blocks.push(h('div', { class: 'goal-grp' }, head, ...kids));
  }
  const mIn = h('input', { type: 'number', step: '1000', min: '0', value: String(monthly) });
  const oSel = h('select', null); setOptions(oSel, OUTLOOK_OPTS, outlook);
  const summary = h('p', { class: 'note' }), errBox = h('p', { class: 'neg' });
  const read = () => {
    const groupTargets = {}, subTargets = {};
    for (const id in gIn) if (gIn[id].value !== '') groupTargets[id] = Number(gIn[id].value);
    for (const k in kIn) if (kIn[k].value !== '') subTargets[k] = Number(kIn[k].value);
    return { groupTargets, subTargets };
  };
  const refresh = () => {
    const r = I.resolveGoal(read(), now);
    for (const id in gIn) resTxt[id].textContent = gIn[id].value === '' ? `auto ${r.groups[id].toFixed(1)}%` : '';
    for (const k in kIn) resTxt[k].textContent = kIn[k].value === '' ? `auto ${r.within[k].toFixed(1)}% of group` : '';
    summary.textContent = `You set ${r.setSum.toFixed(1)}% across ${r.setG.length} group${r.setG.length === 1 ? '' : 's'}. ${r.autoG.length ? `The other ${r.autoG.length} share the remaining ${Math.max(0, 100 - r.setSum).toFixed(1)}% in the proportion you hold them today.` : ''}`;
    errBox.textContent = r.errors.join(' ');
  };
  [...Object.values(gIn), ...Object.values(kIn)].forEach((i) => i.addEventListener('input', refresh));
  refresh();
  const body = h('div', { class: 'goal-form' },
    note('Fill in only what you want to decide. Blank means “keep my current mix”; the rest is worked out for you and shown beside each box. Inside Debts & fixed income you can set a row (for example Bonds 25% of the group) and the other rows follow.'),
    ...blocks, summary, errBox,
    h('div', { class: 'row-actions' }, h('label', { class: 'field half' }, h('span', null, 'New money each month (₹)'), mIn), h('label', { class: 'field half' }, h('span', null, 'Market outlook'), oSel)));
  dialog('Target allocation', body, [
    { label: 'Cancel', onclick: (c) => c() },
    { label: 'Clear targets', onclick: (c) => { c(); Object.values(gIn).concat(Object.values(kIn)).forEach((i) => (i.value = '')); saveGoal({ groupTargets: {}, subTargets: {}, monthly: Math.max(0, Number(mIn.value) || 0), outlook: oSel.value || 'steady' }); } },
    { label: 'Save goal', class: 'primary', onclick: (c) => {
      const r = I.resolveGoal(read(), now);
      if (!r.ok) { toast(r.errors[0], 'error'); return; }
      c(); saveGoal({ ...read(), monthly: Math.max(0, Number(mIn.value) || 0), outlook: oSel.value || 'steady' });
    } },
  ]);
}

/** One bond, month by month for the year, to check against the bank statement. */
function holdingDialog(data, all, t, r) {
  const rows = I.holdingMonths(data, all, r, t.from, t.end);
  const tot = (k) => rows.reduce((a, x) => a + x[k], 0);
  dialog(r.name + ' · ' + t.fy, h('div', null,
    h('p', { class: 'note' }, `${r.holder || ''}${r.closedOn ? ' · closed' + (r.closedOn.length === 10 ? ' on ' + dateStr(r.closedOn) + ', interest counted up to that day' : '') : ''}. “Should reach the bank” is when the bond pays: ${r.ref && r.ref.credit === 'Quarterly' ? 'every third month' : 'every month'}. “In the bank” is what the statement shows, matched to this bond.`),
    rows.length ? table([
      { label: 'Month', host: true, get: (x) => monthLabel(x.month, true) },
      { label: 'Days', cls: 'r', mob: 'under', mlabel: 'days ', get: (x) => x.days || '–' },
      { label: 'Interest', cls: 'r', get: (x) => money(x.gross), total: () => money(tot('gross')) },
      { label: 'After TDS', cls: 'r', mob: 'under', mlabel: 'net ', get: (x) => money(x.net), total: () => money(tot('net')) },
      { label: 'Should reach the bank', cls: 'r', mob: 'under', mlabel: 'due ', get: (x) => (x.due > 0.5 ? money(x.due) : '–'), total: () => money(tot('due')) },
      { label: 'In the bank', cls: 'r', render: (x) => (x.received > 0.5 ? h('span', { class: Math.abs(x.received - x.due) < 2 ? 'pos' : 'warn' }, money(x.received)) : '–'), total: () => money(tot('received')) },
    ], rows, { footer: { label: 'Total' }, m: { key: 'tax-holdmonths', head: 'Month', views: [['Interest', 'After TDS'], ['Should reach the bank', 'In the bank']] } }) : h('p', { class: 'empty' }, 'No interest in this year.')),
    [{ label: 'Done', class: 'primary', onclick: (c) => c() }]);
}
