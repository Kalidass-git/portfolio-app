// Wealth outlook → Planner: the one place where a year's plan is set up.
// A plan is a draft until it is made live. Live, it is locked, and This year, Years ahead and Market outlook all work from it.
// "Revise plan" opens it for changes; "Commit changes" makes the revised plan live again and writes what changed into the revision history.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import * as PL from '../planner.js';
import { monthActual as monthActualOf } from '../yearplan.js';
import { h, money, pct, monthLabel, dateStr, section, stat, table, btn, formDialog, dialog, confirmDialog, canEdit, toast } from '../ui.js';
import { rerender, outlooks, ensure, pc, tone, outlookToggle, outlookSelects, currentPlan, planPicker, planSettingsCard, fmtValue, when, monthRange } from './proj-shared.js';

const revising = new Set();   // years being revised on this device (a plan with changes not yet live counts as revising too)
const frac = (x) => (x == null || x === '' ? 0 : Number(x) / 100);
const pctIn = (x) => (x == null || x === '' ? '' : Math.round(x * 10000) / 100);
const MON = PL.MONTH_NAMES;
const upd = (st, fn) => mutate((d) => fn(ensure(d).years[st.id], d));
/** Open for editing: the owner, and the plan is a draft, being revised, or has changes that are not live yet. */
const editable = (st) => canEdit() && (!st.live || revising.has(st.year) || PL.isDirty(st));
const homeInterest = () => { try { return Math.round(C.monthCashflow(S.data, S.all, C.monthKey(S.all.asOf)).totalExpected); } catch (e) { return 0; } };

/** A card that shows one setting and opens its bottom sheet on a tap. */
function tile(label, value, sub, onTap, ed) {
  return h('button', { type: 'button', class: 'stat tap' + (ed ? ' editable' : ''), onclick: onTap || null, 'aria-label': `${label}. ${ed ? 'Tap to change.' : ''}` },
    h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), sub ? h('span', { class: 'stat-sub' }, sub) : null, ed ? h('span', { class: 'tap-edit', 'aria-hidden': 'true' }, '✎') : null);
}
const subHead = (t) => h('h4', { class: 'plan-sub' }, t);
const locked = () => toast('The plan is live and locked. Press “Revise plan” to change it.');

// ---------- bottom sheets ----------
function salarySheet(st, focus) {
  const a = st.a, g = a.growth || {};
  const from = `${st.year - 1}-09`, months = monthRange(from, `${st.year}-12`);
  if (a.salaryMonth && !months.includes(a.salaryMonth)) months.unshift(a.salaryMonth);
  formDialog({
    title: 'Salary and EPF', focus, saveLabel: 'Save',
    value: { salary: a.salary, pfAdd: a.pfAdd, hike: pctIn(g.salary), hikeMonth: String(a.hikeMonth || 4), salaryMonth: a.salaryMonth || months[0] },
    fields: [
      { key: 'salary', label: 'Expected salary each month, take-home (₹)', type: 'number', required: true, hint: 'Starts as the last full month’s salary in your bank.' },
      { key: 'pfAdd', label: 'Expected EPF each month (₹)', type: 'number', hint: 'Your share and the employer’s. It goes in before the salary reaches the bank.' },
      { key: 'hike', label: 'Salary and EPF hike each year (%)', type: 'number', half: true },
      { key: 'hikeMonth', label: 'Hike month', type: 'select', half: true, options: MON.map((m, i) => ({ value: String(i + 1), label: m })) },
      { key: 'salaryMonth', label: 'These salary and EPF amounts are for', type: 'select', options: months.map((m) => ({ value: m, label: monthLabel(m, true) })), hint: 'So a hike that has already happened is not added again. Months after the hike month use the raised figure.' },
    ],
    onSave: (v) => upd(st, (p) => { p.a.salary = v.salary || 0; p.a.pfAdd = v.pfAdd || 0; p.a.growth = { ...(p.a.growth || {}), salary: frac(v.hike) }; p.a.hikeMonth = Number(v.hikeMonth) || 4; p.a.salaryMonth = v.salaryMonth; }),
  });
}
function otherIncomeSheet(st, focus) {
  const a = st.a, now = homeInterest();
  formDialog({
    title: 'Other income (monthly)', focus, saveLabel: 'Save',
    value: { interest: a.interestMonthly ?? now, other: a.otherIncome || 0 },
    fields: [
      { key: 'interest', label: 'Expected interest income each month (₹)', type: 'number', hint: `This month’s card on Home expects ${money(now)}. The plan starts from this figure and adds the interest on new money put into bonds and lending.` },
      { key: 'other', label: 'Any other income each month (₹)', type: 'number', hint: 'Rent, dividends and so on. It rises with the salary hike.' },
    ],
    onSave: (v) => upd(st, (p) => { p.a.interestMonthly = v.interest || 0; p.a.otherIncome = v.other || 0; }),
    extraActions: [{ label: 'Use this month’s Home figure', onclick: () => { upd(st, (p) => { p.a.interestMonthly = homeInterest(); }); toast('Interest income set from Home'); } }],
  });
}
function initialSheet(st) {
  const b = P.baseline(S.data, S.all), dec = P.cfg(S.data).snapshots.find((s) => s.month === `${st.year - 1}-12`);
  formDialog({
    title: 'Net worth at the start of the year', saveLabel: 'Save', value: { net: st.initial.net },
    fields: [{ key: 'net', label: `Net worth in January ${st.year} (₹)`, type: 'number', required: true,
      hint: `Treated as where you stood at the start of January: January’s income and spending are added on top. Today it is ${money(b.net)}.${dec ? ` Your saved month-end for December ${st.year - 1} was ${money(dec.net)}.` : ''}` }],
    onSave: (v) => upd(st, (p) => PL.setInitialNet(p, v.net)),
    extraActions: [{ label: 'Use today’s net worth', onclick: () => { upd(st, (p, d) => { p.initial = PL.initialFrom(d, S.all); }); toast('Starting net worth set to today'); } },
      ...(dec ? [{ label: `Use December ${st.year - 1}`, onclick: () => { upd(st, (p) => { const liab = dec.loans || 0, assets = dec.assets != null ? dec.assets : dec.net + liab; p.initial = { net: dec.net, assets, liab, classes: dec.classes ? { ...dec.classes } : PL.scaleClasses(p.initial.classes, assets), date: dec.date }; }); toast('Starting net worth set from the December snapshot'); } }] : [])],
  });
}
function expensesSheet(st, focus) {
  const a = st.a, g = a.growth || {};
  formDialog({
    title: 'Monthly expenses', focus, saveLabel: 'Save', value: { expenses: a.expenses, rise: pctIn(g.expenses), emi: a.emi },
    fields: [
      { key: 'expenses', label: 'Expected expenses each month (₹)', type: 'number', required: true, hint: 'Starts as your average this year so far, without EMI, tax and one-time bills.' },
      { key: 'rise', label: 'Expenses rise each year (%)', type: 'number', half: true, hint: 'From January of the next year.' },
      { key: 'emi', label: 'Loan EMI each month (₹)', type: 'number', half: true, hint: 'Fixed by the loan: it does not rise.' },
    ],
    onSave: (v) => upd(st, (p) => { p.a.expenses = v.expenses || 0; p.a.emi = v.emi || 0; p.a.growth = { ...(p.a.growth || {}), expenses: frac(v.rise) }; }),
  });
}
/** A one-time income or expense: tax, school fees, a trip, a bonus. */
function oneOffForm(st, o) {
  const isNew = !o, months = monthRange(`${st.year}-01`, `${st.year}-12`), g = st.a.growth || {};
  const mm = (x) => (x && x.length === 2 ? x : x ? x.slice(5) : '');
  formDialog({
    title: isNew ? 'Add a one-time item' : 'Edit ' + o.name, saveLabel: isNew ? 'Add' : 'Save', deleteMessage: 'Remove this item from the plan?',
    value: o ? { name: o.name, kind: o.kind, month: o.month.length === 2 ? st.year + '-' + o.month : o.month, amount: o.amount, repeat: o.month.length === 2, rise: o.rise == null ? '' : pctIn(o.rise) } : { kind: 'expense', month: months[3], repeat: false, rise: '' },
    fields: [
      { key: 'name', label: 'What', required: true, hint: 'For example Tax, School fees, Vacation, Insurance, Bonus.' },
      { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Money going out' }, { value: 'income', label: 'Money coming in' }] },
      { key: 'month', label: 'Month', type: 'select', options: months.map((m) => ({ value: m, label: monthLabel(m, true) })) },
      { key: 'amount', label: 'Amount in this plan year (₹)', type: 'number', required: true },
      { key: 'repeat', label: 'It happens in this month every year', type: 'checkbox', hint: 'Tick this for yearly bills like tax and school fees. Years after this one use it too.' },
      { key: 'rise', label: 'Rises each year by (%)', type: 'number', showIf: (v) => v.repeat, hint: `Empty uses the yearly expense rise (${pc(g.expenses || 0, 1)}). Used for the years after ${st.year}.` },
    ],
    onSave: (v) => upd(st, (p) => {
      p.a.oneOffs = p.a.oneOffs || [];
      const rec = { name: v.name, kind: v.kind, amount: v.amount, month: v.repeat ? mm(v.month) : v.month };
      if (v.repeat && v.rise != null) rec.rise = frac(v.rise);
      if (isNew) p.a.oneOffs.push({ id: PL.nextId(p.a.oneOffs, 'o'), ...rec });
      else { const t = p.a.oneOffs.find((x) => x.id === o.id); delete t.rise; Object.assign(t, rec); }
    }),
    onDelete: isNew ? null : () => upd(st, (p) => { p.a.oneOffs = p.a.oneOffs.filter((x) => x.id !== o.id); }),
  });
}
/** Offer the one-time bills found in the last year of bank entries. */
function suggestDialog(st) {
  const found = P.suggestOneOffs(S.data, S.all);
  if (!found.length) return toast('No one-time bills found in the last 12 months of bank entries.');
  const rows = found.map((f) => ({ f, el: h('input', { type: 'checkbox', checked: true }) }));
  dialog('One-time bills from the last 12 months', h('div', null, h('p', { class: 'note' }, 'These were paid from your bank in the last year, in categories marked one-time (and tax). Tick the ones that come round every year. Each is added as a yearly item at what you paid.'),
    h('div', null, rows.map((x) => h('label', { class: 'check-inline', style: { display: 'block', padding: '3px 0' } }, x.el, ` ${x.f.name}, ${MON[Number(x.f.month) - 1]} · ${money(x.f.amount)}`)))),
    [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Add the ticked ones', class: 'primary', onclick: (c) => { upd(st, (p) => { p.a.oneOffs = p.a.oneOffs || []; for (const x of rows) if (x.el.checked) p.a.oneOffs.push({ id: PL.nextId(p.a.oneOffs, 'o'), name: x.f.name, kind: 'expense', month: x.f.month, amount: x.f.amount }); }); c(); } }]);
}
/** New money going into an asset class every month. Market-linked lines can have their own outlook. */
function investForm(st, l) {
  const isNew = !l, months = monthRange(`${st.year}-01`, `${st.year}-12`), classes = P.CLASSES.filter((c) => c.key !== 'cash');
  formDialog({
    title: isNew ? 'Add a monthly investment' : 'Edit ' + l.name, saveLabel: isNew ? 'Add' : 'Save', deleteMessage: 'Remove this investment from the plan?',
    value: l ? { name: l.name, cls: l.cls, monthly: l.monthly, from: l.from || '', to: l.to || '', outlook: l.outlook || '', rate: l.rate == null ? '' : pctIn(l.rate) } : { cls: 'bonds', from: '', to: '', outlook: '', rate: '' },
    fields: [
      { key: 'name', label: 'Name', required: true, hint: 'For example Navi bond, Index fund SIP, Gold coins.' },
      { key: 'cls', label: 'Goes into', type: 'select', options: classes.map((c) => ({ value: c.key, label: c.label + (c.kind === 'market' ? ' (market-linked)' : '') })) },
      { key: 'monthly', label: 'Illustrative amount each month (₹)', type: 'number', required: true, hint: 'Only its share of all the lines matters: each month the projection invests what is really left, split by these shares.' },
      { key: 'from', label: 'Starting month (empty = whole year)', type: 'select', options: [{ value: '', label: 'Whole year' }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))], half: true },
      { key: 'to', label: 'Last month (empty = until December)', type: 'select', options: [{ value: '', label: 'Until December' }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))], half: true },
      { key: 'outlook', label: 'Outlook for this money (market-linked only)', type: 'select', showIf: (v) => P.isMarket(v.cls), options: [{ value: '', label: 'Same as the class outlook' }, ...outlooks().map((o) => ({ value: o.id, label: `${o.name} (${pc(o.rate, 0)} a year)` }))], hint: 'Lets you plan fresh market money more or less boldly than what you already hold.' },
      { key: 'rate', label: 'Yearly return for this money (%), if different', type: 'number', showIf: (v) => !P.isMarket(v.cls), hint: 'Leave empty to use the class rate. For a bond, enter its interest rate.' },
    ],
    onSave: (v) => upd(st, (p) => {
      p.a.invest = p.a.invest || [];
      const rec = { name: v.name, cls: v.cls, monthly: v.monthly, from: v.from || '', to: v.to || '' };
      if (P.isMarket(v.cls)) { rec.outlook = v.outlook || ''; rec.rate = null; } else { rec.outlook = ''; rec.rate = v.rate === '' || v.rate == null ? null : frac(v.rate); }
      if (isNew) p.a.invest.push({ id: PL.nextId(p.a.invest, 'i'), ...rec }); else Object.assign(p.a.invest.find((x) => x.id === l.id), rec);
    }),
    onDelete: isNew ? null : () => upd(st, (p) => { p.a.invest = p.a.invest.filter((x) => x.id !== l.id); }),
  });
}
const RATE_KEYS = [['bonds', 'Bonds'], ['lending', 'Private lending'], ['fds', 'FDs and compounding loans'], ['pf', 'EPF and PPF'], ['chits', 'Chits'], ['lic', 'Insurance and recurring deposits'], ['cash', 'Cash in banks'], ['other', 'Others']];
function ratesSheet(st) {
  const r = st.a.rates || {};
  formDialog({
    title: 'Yearly interest rates', saveLabel: 'Save', value: Object.fromEntries(RATE_KEYS.map(([k]) => [k, pctIn(r[k])])),
    fields: RATE_KEYS.map(([k, l]) => ({ key: k, label: `${l} (%)`, type: 'number', half: true })),
    onSave: (v) => upd(st, (p) => { p.a.rates = { ...(p.a.rates || {}), ...Object.fromEntries(RATE_KEYS.map(([k]) => [k, frac(v[k])])) }; }),
  });
}

// ---------- committing, revising, discarding ----------
export function changeList(changes) {
  if (!changes || !changes.length) return h('p', { class: 'note' }, 'Nothing changed.');
  return h('ul', { class: 'chg' }, changes.map((c) => h('li', null, h('span', { class: 'chg-g' }, c.g), ' ', h('b', null, c.l),
    c.f === 'note' ? null : c.from == null && c.to != null ? h('span', null, ': ', fmtValue(c.to, c.f)) : c.to == null && c.from != null ? h('span', { class: 'muted' }, ` (was ${fmtValue(c.from, c.f)})`) : h('span', null, ': ', h('span', { class: 'muted' }, fmtValue(c.from, c.f)), ' → ', h('b', null, fmtValue(c.to, c.f))))));
}
function commitDialog(st) {
  const oc = outlooks(), first = !st.live;
  const changes = first ? PL.startingValues({ a: st.a, initial: st.initial }, oc) : PL.diffPlans(st.live, { a: st.a, initial: st.initial }, oc);
  if (!first && !PL.isDirty(st)) { revising.delete(st.year); toast('Nothing has changed since the plan went live.'); return rerender(); }
  const note = h('textarea', { rows: 3, placeholder: first ? 'Anything to remember about this plan (optional)' : 'Why did it change? For example: hike came in higher (optional)', 'aria-label': 'Note for the revision history', style: { width: '100%' } });
  dialog(first ? `Make plan ${st.year} live` : `Commit revision ${st.live.rev + 1}`, h('div', null,
    h('p', null, first ? `Once it is live the plan is locked. This year, Years ahead and Market outlook then use it. You can change it later with “Revise plan”, and every change is kept in the revision history.` : `This replaces revision ${st.live.rev} on This year, Years ahead and Market outlook. The change is added to the revision history.`),
    h('h4', { style: { margin: '10px 0 4px' } }, first ? 'The plan starts with' : 'What changed'), changeList(changes), note),
    [{ label: 'Cancel', onclick: (c) => c() }, { label: first ? 'Make it live' : 'Commit changes', class: 'primary', onclick: (c) => {
      mutate((d) => { PL.commit(ensure(d).years[st.id], note.value.trim(), oc); });
      revising.delete(st.year); c(); toast(first ? `Plan ${st.year} is live` : 'Revision committed');
    } }]);
}
async function discard(st) {
  if (!(await confirmDialog(`Throw away the changes made since revision ${st.live.rev}? The plan goes back to what is live.`, 'Discard changes'))) return;
  mutate((d) => PL.discardChanges(ensure(d).years[st.id]));
  revising.delete(st.year); toast('Changes discarded');
}

// ---------- cards ----------
function statusBar(st, path) {
  const dirty = PL.isDirty(st), live = !!st.live, rev = revising.has(st.year) || dirty;
  const badge = !live ? h('span', { class: 'plan-badge warn' }, 'Draft · not live') : rev ? h('span', { class: 'plan-badge warn' }, `Revising · revision ${st.live.rev} is live`) : h('span', { class: 'plan-badge pos' }, `Live · revision ${st.live.rev}`);
  const text = !live ? 'Everything is open for editing. Set it up the way you want; when it is ready, make it live. The other tabs start using it only then, and the plan is locked.'
    : rev ? `You are revising. The other tabs keep using revision ${st.live.rev} until you commit these changes${dirty ? '' : ' (nothing has changed yet)'}.`
      : `Live since ${when(st.live.at)}. It is locked, and This year, Years ahead and Market outlook use it. Press “Revise plan” to change it.`;
  const actions = !canEdit() ? null : !live ? [btn('Make this plan live', () => commitDialog(st), 'primary', { keep: true })]
    : rev ? [btn('Commit changes', () => commitDialog(st), 'primary', { keep: true }), btn(dirty ? 'Discard changes' : 'Cancel', () => (dirty ? discard(st) : (revising.delete(st.year), rerender())), '', { keep: true })]
      : [btn('Revise plan', () => { revising.add(st.year); rerender(); }, 'primary', { keep: true })];
  const end = path.length ? path[path.length - 1].nw : st.initial.net;
  const saved = path.length ? path.reduce((s, r) => s + r.left + (r.pfAdd || 0), 0) / path.length : 0, inv = path.length ? path.reduce((s, r) => s + r.invested, 0) / path.length : 0;
  return section(`Plan ${st.year}`, h('div', null, h('div', { class: 'plan-state' }, badge, h('p', { class: 'note', style: { margin: 0 } }, text)),
    h('div', { class: 'stats' }, stat(`Net worth, December ${st.year}`, money(end), `as this plan projects it, from ${money(st.initial.net)} in January`), stat('Saved each month', h('span', { class: tone(saved) }, money(saved)), 'on average, with EPF'), stat('Invested each month', money(inv), 'on average, new money')),
    actions ? h('div', { class: 'row-actions' }, ...actions) : null));
}

function incomeCard(st, ed) {
  const a = st.a, g = a.growth || {}, tap = (fn, focus) => (ed ? () => fn(st, focus) : canEdit() ? locked : null);
  const now = homeInterest();
  return section('Income', h('div', null,
    subHead('Salary'),
    h('div', { class: 'stats' },
      tile('Expected salary', money(a.salary || 0), 'a month, take-home', tap(salarySheet, 'salary'), ed),
      tile('Expected EPF', money(a.pfAdd || 0), 'a month, yours and the employer’s', tap(salarySheet, 'pfAdd'), ed),
      tile('Salary and EPF hike', pc(g.salary || 0, 1), 'each year', tap(salarySheet, 'hike'), ed),
      tile('Hike month', MON[(Number(a.hikeMonth) || 4) - 1], a.salaryMonth ? `figures above are for ${monthLabel(a.salaryMonth, true)}` : 'when the raise lands', tap(salarySheet, 'hikeMonth'), ed)),
    subHead('Other income (monthly)'),
    h('div', { class: 'stats' },
      tile('Expected interest income', money(a.interestMonthly || 0), `a month · Home expects ${money(now)} this month`, tap(otherIncomeSheet, 'interest'), ed),
      tile('Any other income', money(a.otherIncome || 0), 'a month', tap(otherIncomeSheet, 'other'), ed)),
    subHead('Starting point'),
    h('div', { class: 'stats' }, tile(`Net worth at the start of ${st.year}`, money(st.initial.net), `treated as January ${st.year}; projections start here`, ed ? () => initialSheet(st) : canEdit() ? locked : null, ed)),
    ed ? h('p', { class: 'note' }, 'Tap any card to change it.') : null));
}

function expensesCard(st, ed) {
  const a = st.a, g = a.growth || {}, tap = (fn, focus) => (ed ? () => fn(st, focus) : canEdit() ? locked : null);
  const ones = (a.oneOffs || []).slice().sort((x, y) => (x.month < y.month ? -1 : 1));
  const when1 = (o) => (o.month.length === 2 ? `every ${MON[Number(o.month) - 1]}` : monthLabel(o.month));
  const riseOf = (o) => (o.month.length !== 2 ? '–' : o.rise != null && o.rise !== '' ? pc(o.rise, 1) : `${pc(g.oneTime ?? g.expenses ?? 0, 1)} (as expenses)`);
  return section('Expenses', h('div', null,
    subHead('Monthly expenses'),
    h('div', { class: 'stats' },
      tile('Expected expenses', money(a.expenses || 0), 'a month, without EMI and one-time bills', tap(expensesSheet, 'expenses'), ed),
      tile('Expenses rise each year', pc(g.expenses || 0, 1), `from January ${st.year + 1}`, tap(expensesSheet, 'rise'), ed),
      tile('Loan EMI', money(a.emi || 0), 'a month, fixed: it does not rise', tap(expensesSheet, 'emi'), ed)),
    subHead('One-time expenses'),
    table([
      { label: 'What', host: true, get: (o) => o.name }, { label: 'When', mob: 'under', get: when1 },
      { label: 'Amount', cls: 'r', render: (o) => h('span', { class: o.kind === 'income' ? 'pos' : 'neg' }, (o.kind === 'income' ? '+' : '−') + money(o.amount)) },
      { label: 'Rises each year', mob: 'under', mlabel: 'rises ', cls: 'r', get: riseOf },
    ], ones, { m: { key: 'plan-oneoff', head: 'What', sub: ['When'], views: [['Amount', 'Rises each year']] }, onRow: ed ? (o) => oneOffForm(st, a.oneOffs.find((x) => x.id === o.id)) : null, empty: 'Nothing added. Add tax, school fees, insurance, a trip or a bonus so the plan sees them coming.' }),
    ed ? h('div', { class: 'row-actions' }, btn('Add item', () => oneOffForm(st), '', { keep: true }), btn('Find them in my bank entries', () => suggestDialog(st), '', { keep: true })) : null));
}

function marketCard(st, ed) {
  const a = st.a, set = (fn) => (ed ? fn() : canEdit() ? locked() : null);
  const rates = RATE_KEYS.filter(([k]) => k !== 'cash' && k !== 'other').map(([k, l]) => `${l.split(' ')[0]} ${pc((a.rates || {})[k] || 0, 1)}`).join(' · ');
  return section('Market outlook for this plan', h('div', null,
    outlookToggle(a.outlook, (id) => set(() => upd(st, (p) => { for (const k of P.MARKET) p.a.outlook[k] = id; for (const l of p.a.invest || []) if (P.isMarket(l.cls)) l.outlook = ''; })), { disabled: !ed }),
    h('details', { class: 'more' }, h('summary', null, 'Set each market class separately, and what the outlook means'),
      outlookSelects(a.outlook, (k, id) => set(() => upd(st, (p) => { p.a.outlook[k] = id; }))),
      h('p', { class: 'note' }, 'The outlook is the yearly return assumed for shares, ETFs, funds and gold (and fresh money put into them). Fixed income uses its own interest rates, below.')),
    h('div', { class: 'stats', style: { marginTop: '10px' } }, tile('Yearly interest rates', rates || 'From your holdings', 'bonds, lending, deposits, EPF, chits… tap to change', ed ? () => ratesSheet(st) : canEdit() ? locked : null, ed))));
}

/** "How this is worked out": every figure behind Available to invest, where it came from, and a check against what the bank shows you really kept. */
function availExplain(st, a, f) {
  const { data, all } = S;
  const cur = C.monthKey(all.asOf);
  const hist = C.ledgerMonths(data).filter((x) => x < cur).slice(-6).map((x) => ({ month: x, ...monthActualOf(data, x) })).filter((x) => x.has);
  const last3 = hist.slice(-3), avg = (rows, k) => (rows.length ? rows.reduce((t, x) => t + (x[k] || 0), 0) / rows.length : 0);
  const kept = avg(hist, 'left'), diff = f.avail - kept, tds = a.tds ?? 0.1;
  const row = (label, val, src, bold) => ({ label, val, src, bold });
  const list = (rows, k) => rows.map((x) => `${monthLabel(x.month).slice(0, 3)} ${money(x[k])}`).join(', ');
  const lines = [
    row('Salary reaching the bank', money(f.salary), `from the plan. Your last ${last3.length} months of salary credits averaged ${money(avg(last3, 'salary'))} (${list(last3, 'salary')})`),
    row('Other income', money(f.other), 'from the plan'),
    row('Interest paid out by bonds and lending', money(f.interest), `your expected interest income, after ${pct(tds, 0)} TDS. Deposits, EPF and chits add to their balances instead`),
    row('Money in each month', money(f.inc), '', true),
    row('Everyday expenses', '−' + money(a.expenses), `from the plan. Your last ${hist.length} months of everyday spending, without one-time bills, averaged ${money(avg(hist, 'regular'))} (${list(hist, 'regular')})`),
    row('Loan EMI', '−' + money(a.emi), `from the plan. Your last ${last3.length} months of EMI averaged ${money(avg(last3, 'emi'))}`),
    row('Yearly one-time bills, one twelfth', '−' + money(f.oneMonthly), `${money(f.yearOnce)} of tax, fees, trips and so on in ${st.year}, spread evenly so the cash is there when they fall due`),
    row('Available to invest each month', money(f.avail), 'in − spending − EMI − bills set aside', true),
  ];
  return h('details', { class: 'more' }, h('summary', null, 'How this is worked out'),
    table([{ label: 'Step', host: true, render: (x) => h('span', null, x.bold ? h('b', null, x.label) : x.label, x.src ? h('small', { class: 'muted', style: { display: 'block', whiteSpace: 'normal' } }, x.src) : null) }, { label: 'Each month', cls: 'r', render: (x) => (x.bold ? h('b', null, x.val) : x.val) }], lines, {}),
    hist.length ? h('p', { class: Math.abs(diff) > Math.max(5000, 0.2 * Math.abs(kept)) ? 'form-error' : 'note' }, `Check against the bank: in the last ${hist.length} months you actually kept about ${money(kept)} a month after all spending, tax and one-time bills, before investing. This plan says ${money(f.avail)}. ${Math.abs(diff) > Math.max(5000, 0.2 * Math.abs(kept)) ? (diff > 0 ? 'The plan is more hopeful than your history. Check that the salary and expense figures are realistic.' : 'The plan is more cautious than your history. It may be assuming more spending or less income than you have seen.') : 'They are close, so the plan matches how you have really been living.'}`) : h('p', { class: 'note' }, 'There is not enough bank history to check this against.'),
    h('p', { class: 'note' }, `Not in this figure: EPF (${money(a.pfAdd || 0)} a month goes in before the salary reaches the bank) and the new investments themselves.`));
}
function newMoneyCard(st, ed, path) {
  const w = PL.effective(st, 'working'), a = w.a, inv = a.invest || [], invTotal = inv.reduce((s, l) => s + (l.monthly || 0), 0);
  const r0m = path[0];
  const inc = r0m ? r0m.salary + r0m.other + r0m.interest : 0, spend = r0m ? r0m.expenses + r0m.emi : 0;
  const yearOnce = (a.oneOffs || []).filter((o) => o.kind !== 'income' && (o.month.length === 2 || o.month.startsWith(String(st.year)))).reduce((x, o) => x + (o.amount || 0), 0);
  const oneMonthly = yearOnce / 12, avail = inc - spend - oneMonthly;
  const shareOf = (v) => (invTotal > 0 ? pct(v / invTotal, 0) : '–');
  return section('New money going in each month', h('div', null,
    h('div', { class: 'stats' },
      stat('Available to invest', h('span', { class: tone(avail) }, money(avail)), `each month · ${money(inc)} in, ${money(spend)} out${oneMonthly > 1 ? `, ${money(oneMonthly)} set aside for yearly bills` : ''}`),
      stat('New money is split', `${inv.length} ${inv.length === 1 ? 'line' : 'lines'}`, 'each month invests what is left, by the shares below')),
    (a.pfAdd || 0) > 0 ? h('p', { class: 'note' }, `Your EPF (${money(a.pfAdd)} a month, yours and the employer’s) goes in before salary reaches the bank, so it is already saved and is not part of the available amount.`) : null,
    availExplain(st, a, { inc, salary: r0m ? r0m.salary : 0, other: r0m ? r0m.other : 0, interest: r0m ? r0m.interest : 0, oneMonthly, yearOnce, avail }),
    avail <= 0 ? h('p', { class: 'form-error' }, 'Nothing is left in an average month after expenses, EMI and the yearly bills, so little or nothing would be invested.') : null,
    table([
      { label: 'Investment', host: true, get: (l) => l.name }, { label: 'Goes into', mob: 'under', get: (l) => P.classOf(l.cls).label },
      { label: 'Share of new money', mob: 'under', mlabel: 'share ', cls: 'r', render: (l) => h('b', null, shareOf(l.monthly)), total: () => shareOf(invTotal) },
      { label: 'Illustrative amount', cls: 'r', render: (l) => h('span', { class: 'inv' }, money(l.monthly)), total: () => h('span', { class: 'inv' }, money(invTotal)) },
      { label: 'Return', mob: 'under', mlabel: 'return ', cls: 'r', get: (l) => (P.isMarket(l.cls) ? (l.outlook ? (outlooks().find((o) => o.id === l.outlook) || {}).name : 'class outlook') : pc(l.rate != null ? l.rate : (a.rates || {})[l.cls] || 0)) },
      { label: 'Period', mob: 'hide', get: (l) => (l.from || l.to ? `${l.from ? monthLabel(l.from) : 'January'} to ${l.to ? monthLabel(l.to) : 'Dec'}` : 'whole year') },
    ], inv, { footer: { label: 'Total' }, m: { key: 'plan-invest', head: 'Investment', sub: ['Goes into'], views: [['Share of new money', 'Illustrative amount'], ['Return', 'Period']] }, onRow: ed ? (l) => investForm(st, inv.find((x) => x.id === l.id)) : null, empty: 'No new investments planned. Add where your savings will go.' }),
    h('p', { class: 'note' }, 'The amounts are only to show the split. In the projection each month, whatever is really left after spending, EMI and one-time bills is invested by these shares (percentages), so a month with tax or fees invests less and a quiet month more. Fixed-income money earns the rate shown; market-linked money follows its outlook.'),
    ed ? h('div', { class: 'row-actions' }, btn('Add investment', () => investForm(st), '', { keep: true })) : null));
}

function historyCard(st) {
  const oc = outlooks(), revs = (st.revisions || []).slice().reverse();
  const dirty = PL.isDirty(st);
  const pending = dirty ? PL.diffPlans(st.live, { a: st.a, initial: st.initial }, oc) : null;
  const items = revs.map((r, i) => {
    const prev = revs[i + 1], k = r.key, pk = prev && prev.key;
    const dEnd = k && pk ? k.yearEnd - pk.yearEnd : null;
    return h('details', { class: 'cal-month rev', open: i === 0 },
      h('summary', { style: { padding: '8px', cursor: 'pointer' } }, h('b', null, `Revision ${r.rev}`), ' ', h('small', { class: 'muted' }, when(r.at)), st.live && st.live.rev === r.rev ? h('small', { class: 'tag good' }, 'live') : null, r.kind === 'first' ? h('small', { class: 'tag' }, 'first version') : null,
        k ? h('small', { class: 'muted', style: { display: 'block' } }, `net worth in December ${money(k.yearEnd)}${dEnd != null && Math.abs(dEnd) >= 1 ? ` (${dEnd > 0 ? '+' : '−'}${money(Math.abs(dEnd))} against revision ${prev.rev})` : ''}`) : null),
      h('div', { style: { padding: '0 8px 8px' } },
        r.note ? h('p', { class: 'note-box' }, r.note) : null,
        h('h4', { style: { margin: '6px 0 4px' } }, r.kind === 'first' ? 'The plan started with' : 'What changed'), changeList(r.changes),
        k ? h('p', { class: 'note' }, `Key figures then: net worth in December ${money(k.yearEnd)}, saved about ${money(k.saved)} a month (with EPF), invested about ${money(k.invested)} a month.`) : null));
  });
  return section('Revision history', h('div', null,
    pending ? h('div', { class: 'alert warn' }, h('b', null, `Not live yet: ${pending.length || 1} ${pending.length === 1 ? 'change' : 'changes'} since revision ${st.live.rev}`), changeList(pending.length ? pending : [{ g: 'Other', l: 'Other settings changed', f: 'note' }])) : null,
    items.length ? items : h('p', { class: 'empty' }, 'No revisions yet. The first one is written when you make the plan live.'),
    h('p', { class: 'note' }, 'Every time a plan is made live or revised, what changed and when is kept here, with the key figures at that time. Revisions cannot be edited.')));
}

function legacyCard(data) {
  const years = PL.legacyYears(data), keys = PL.legacyAheadKeys(data);
  if (!years.length && !keys.length) return null;
  return section('Settings from the earlier version', h('div', null,
    h('p', null, `${years.length ? `Plans from the earlier Wealth outlook exist for ${years.join(', ')}. ` : ''}${keys.length ? 'The old Years ahead page also kept its own salary, expense and outlook figures. ' : ''}They are not used any more: every tab now works only from the plan made here.`),
    h('p', { class: 'note' }, 'When you create a plan for a year, the one-time items, investment lines and rates of the old plan for that year are used as its starting point. Month-end snapshots are never touched.'),
    canEdit() ? btn('Delete old plans and settings', async () => {
      if (!(await confirmDialog(h('div', null, h('p', null, `Delete the old ${years.length ? 'plans for ' + years.join(', ') : 'plan settings'}${keys.length ? ' and the old Years ahead figures' : ''}? Your month-end snapshots stay.`), h('p', { class: 'note' }, 'A restore point is saved every day, so a mistake can be undone from Settings.')), 'Delete'))) return;
      mutate((d) => PL.clearLegacy(d)); toast('Old plans and settings deleted');
    }, '', { keep: true }) : null));
}

function createCard(ctx) {
  const { year, legacy } = ctx;
  return section(`Plan ${year}`, h('div', null,
    h('p', null, `Set up the plan for ${year} here: salary and EPF, other income, expenses, one-time items, the market outlook and where new money goes. It starts from today’s figures, which you can change on each card.`),
    h('p', { class: 'note' }, 'It stays a draft until you make it live. Then it is locked and This year, Years ahead and Market outlook work from it. Later changes are made by revising it, and each revision is kept. Best done in December for the coming year, or in January.'),
    legacy ? h('p', { class: 'alert warn' }, `An older plan for ${year} exists. Creating this one replaces it, and its one-time items, investment lines and rates become the starting point.`) : null,
    canEdit() ? btn(`Create plan ${year}`, async () => {
      if (legacy && !(await confirmDialog(`Replace the older plan for ${year}? Its one-time items, investment lines and rates are carried over into the new plan.`, 'Replace'))) return;
      mutate((d) => { ensure(d).years[String(year)] = PL.freshPlan(d, S.all, year); }); toast(`Plan ${year} created as a draft`);
    }, 'primary', { keep: true }) : h('p', { class: 'muted' }, 'The owner has not made a plan for this year yet.')));
}

export function render(root) {
  const ctx = currentPlan(), { stored: st, year } = ctx, oc = outlooks();
  root.append(planPicker());
  if (!st) { root.append(createCard(ctx)); const lg = legacyCard(S.data); if (lg) root.append(lg); return; }
  if (!canEdit()) {
    // family: the plan that is live, read only
    if (!ctx.plan) root.append(section(`Plan ${year}`, h('p', { class: 'empty' }, 'The owner has not made this plan live yet.')));
    else root.append(planSettingsCard(ctx.plan), historyCard(st));
    return;
  }
  const ed = editable(st), w = PL.effective(st, 'working'), path = PL.planPath(w, oc);
  root.append(statusBar(st, path), incomeCard(st, ed), expensesCard(st, ed), marketCard(st, ed), newMoneyCard(st, ed, path), historyCard(st));
  const lg = legacyCard(S.data); if (lg) root.append(lg);
}
