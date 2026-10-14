// Plan → Year plan: set a target for each month, see a cautious projection, where you stand, and a year-end review.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { plansOf, buildYear, review, netWorthPath, nextPlan, DEFAULTS, monthActual } from '../yearplan.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, btn, formDialog, canEdit, toast, rowList, posNeg } from '../ui.js';
import { lineChart, hbars } from '../charts.js';

let selId = null;
const rerender = () => window.dispatchEvent(new Event('rerender'));
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));

/** Make the plans part of the data so they can be edited. */
const ensure = (d) => { if (!d.yearPlans || !d.yearPlans.length) d.yearPlans = JSON.parse(JSON.stringify(plansOf(d))); return d.yearPlans; };

function monthForm(plan, month) {
  const m = plan.months.find((x) => x.month === month);
  const act = [-1, -2, -3].map((k) => C.addMonths(C.monthStart(S.all.asOf), k).slice(0, 7)).map((mo) => monthActual(S.data, mo));
  const have = act.filter((a) => a.has);
  const avg = (k) => (have.length ? Math.round(have.reduce((a, x) => a + x[k], 0) / have.length) : 0);
  formDialog({
    title: 'Plan for ' + monthLabel(month, true), value: m,
    fields: [
      { key: 'salary', label: 'Salary expected (₹)', type: 'number', half: true, hint: have.length ? `Last ${have.length} months average ${money(avg('salary'))}.` : '' },
      { key: 'otherIncome', label: 'Other income (₹)', type: 'number', half: true, hint: 'Interest, rent, dividends, chits you expect.' },
      { key: 'expenses', label: 'Everyday expenses (₹)', type: 'number', hint: have.length ? `Last ${have.length} months average ${money(avg('expenses'))} (without loan EMI and tax).` : 'Groceries, food, rent, utilities, school, travel.' },
      { key: 'oneOff', label: 'One-off costs you know about (₹)', type: 'number', hint: 'School fees, insurance, a trip, repairs. Counted as expenses.' },
      { key: 'emi', label: 'Loan EMI (₹)', type: 'number', half: true }, { key: 'tax', label: 'Tax (₹)', type: 'number', half: true },
      { key: 'pf', label: 'Provident fund added (₹)', type: 'number', hint: 'Savings that do not pass through the bank. Counted in net worth, not compared with bank entries.' },
      { key: 'note', label: 'Note' },
    ],
    onSave: (v) => mutate((d) => { const p = ensure(d).find((x) => x.id === plan.id); Object.assign(p.months.find((x) => x.month === month), Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'note' ? x : Number(x) || 0]))); }),
  });
}

function fillForm(plan, year) {
  const first = year.rows.find((r) => r.state !== 'done');
  formDialog({
    title: 'Set targets for the coming months', saveLabel: 'Apply', value: { salary: first ? first.salary : '', otherIncome: first ? first.otherIncome : '', expenses: first ? first.expenses : '' },
    fields: [
      { key: 'salary', label: 'Salary each month (₹)', type: 'number', half: true }, { key: 'otherIncome', label: 'Other income each month (₹)', type: 'number', half: true },
      { key: 'expenses', label: 'Everyday expenses each month (₹)', type: 'number', hint: 'Applies to every month that has not finished. Months with their own one-off costs, EMI and tax keep them. Leave a box empty to keep it as it is.' },
    ],
    onSave: (v) => mutate((d) => { const p = ensure(d).find((x) => x.id === plan.id); for (const m of p.months) { if (m.month < year.cur) continue; for (const k of ['salary', 'otherIncome', 'expenses']) if (v[k] != null) m[k] = v[k]; } }),
  });
}
function settingsForm(plan) {
  formDialog({
    title: 'How cautious should the projection be?', value: { incomeHaircut: Math.round(plan.incomeHaircut * 100), expenseBuffer: Math.round(plan.expenseBuffer * 100) },
    fields: [
      { key: 'incomeHaircut', label: 'Count only this much less of your other income (%)', type: 'number', hint: 'Interest, rent and similar income do not always arrive on time. 10 means the cautious plan counts 10% less. Salary is counted in full.' },
      { key: 'expenseBuffer', label: 'Add this much to expenses (%)', type: 'number', hint: 'Spending usually runs above the plan. 10 means the cautious plan assumes 10% more.' },
    ],
    onSave: (v) => mutate((d) => { const p = ensure(d).find((x) => x.id === plan.id); p.incomeHaircut = (v.incomeHaircut || 0) / 100; p.expenseBuffer = (v.expenseBuffer || 0) / 100; }),
  });
}
function nextYearForm(plan, year, rv) {
  const last = plan.months[plan.months.length - 1];
  formDialog({
    title: 'Start the next year', saveLabel: 'Create plan', value: { salary: last.salary, otherIncome: last.otherIncome, expenses: rv.suggest ? rv.suggest.expenses : last.expenses, incomeHaircut: Math.round((rv.suggest ? rv.suggest.incomeHaircut : plan.incomeHaircut) * 100), expenseBuffer: Math.round(plan.expenseBuffer * 100) },
    fields: [
      { key: 'salary', label: 'Salary each month (₹)', type: 'number', half: true }, { key: 'otherIncome', label: 'Other income each month (₹)', type: 'number', half: true },
      { key: 'expenses', label: 'Everyday expenses each month (₹)', type: 'number', hint: rv.suggest ? rv.suggest.note : '' },
      { key: 'incomeHaircut', label: 'Count less of other income by (%)', type: 'number', half: true }, { key: 'expenseBuffer', label: 'Add to expenses (%)', type: 'number', half: true },
    ],
    onSave: (v) => { let id; mutate((d) => { const ps = ensure(d); const np = nextPlan(ps.find((x) => x.id === plan.id), { salary: v.salary || 0, otherIncome: v.otherIncome || 0, expenses: v.expenses || 0, incomeHaircut: (v.incomeHaircut || 0) / 100, expenseBuffer: (v.expenseBuffer || 0) / 100 }); ps.push(np); id = np.id; }); selId = id; toast('Next year’s plan created. Set the one-off costs month by month.'); },
  });
}

const statusText = (r) => (r.status === 'ahead' ? `ahead by ${money(r.diff)}` : r.status === 'behind' ? `behind by ${money(-r.diff)}` : 'on track');

export function render(root) {
  const { data, all } = S;
  const plans = plansOf(data);
  if (!plans.length) { root.append(h('div', { class: 'card' }, h('p', null, 'No plan yet.'))); return; }
  if (!plans.some((p) => p.id === selId)) selId = (plans.find((p) => p.months.some((m) => m.month === C.monthKey(all.asOf))) || plans[plans.length - 1]).id;
  const plan = plans.find((p) => p.id === selId);
  const year = buildYear(data, all, plan);
  const rv = review(data, all, plan, year);

  root.append(h('div', { class: 'pagebar' },
    plans.length > 1 ? h('select', { class: 'month-select', 'aria-label': 'Plan year', onchange: (e) => { selId = e.target.value; rerender(); } }, plans.map((p) => h('option', { value: p.id, selected: p.id === selId }, `${monthLabel(p.startMonth)} to ${monthLabel(p.months[p.months.length - 1].month)}`))) : h('b', null, `${monthLabel(plan.startMonth)} to ${monthLabel(plan.months[11].month)}`),
    canEdit() ? h('span', { class: 'btn-row' }, btn('Set targets', () => fillForm(plan, year)), btn('Cautiousness', () => settingsForm(plan))) : null));

  const behind = year.ytdActual - year.ytdPlan;
  root.append(h('div', { class: 'stats' },
    stat('Planned to save this year', money(year.planTotal), 'income − expenses − EMI − tax'),
    stat('Cautious estimate', money(year.conservativeTotal), `${Math.round(plan.incomeHaircut * 100)}% less other income, ${Math.round(plan.expenseBuffer * 100)}% more expenses`),
    year.done.length ? stat('Where you stand', h('span', { class: posNeg(behind) }, (behind >= 0 ? 'Ahead ' : 'Behind ') + money(Math.abs(behind))), `${money(year.ytdActual)} saved against ${money(year.ytdPlan)} planned, ${year.done.length} month${year.done.length > 1 ? 's' : ''}`) : stat('Where you stand', '–', 'no month has finished yet'),
    stat('Likely year-end saving', h('span', { class: posNeg(year.forecastTotal - year.planTotal) }, money(year.forecastTotal)), `${year.forecastTotal >= year.planTotal ? 'above' : 'below'} plan by ${money(Math.abs(year.forecastTotal - year.planTotal))}`)));

  const rowsC = year.rows;
  root.append(section('Saved so far, month after month', h('div', null, lineChart({
    labels: rowsC.map((r) => monthLabel(r.month).slice(0, 3)), fmt: money, yMin: Math.min(0, ...rowsC.map((r) => Math.min(r.cumPlan, r.cumConservative, r.cumForecast, r.cumActual ?? 1e12))),
    series: [{ name: 'Plan', values: rowsC.map((r) => r.cumPlan), dashed: true, color: 1 }, { name: 'Cautious', values: rowsC.map((r) => r.cumConservative), dashed: true, color: 3 }, { name: 'Forecast', values: rowsC.map((r) => r.cumForecast), color: 2 }, { name: 'Actual', values: rowsC.map((r) => r.cumActual), color: 0 }],
  }), h('p', { class: 'note' }, 'Cumulative money left after expenses, EMI and tax. Actual comes from your bank entries. The forecast uses actuals for finished months and the cautious plan for the rest.'))));

  root.append(section('Month by month', h('div', null, rowList(rowsC.map((r) => {
    const a = r.actual;
    const lead = monthLabel(r.month).slice(0, 3);
    if (r.state === 'done') return { title: monthLabel(r.month, true), sub: `Planned ${money(r.plan.left)} · cautious ${money(r.plan.cLeft)}`, value: money(a.left), valueSub: h('span', { class: r.status === 'behind' ? 'neg' : r.status === 'ahead' ? 'pos' : '' }, statusText(r)), onClick: canEdit() ? () => monthForm(plan, r.month) : null };
    if (r.state === 'running') return { title: monthLabel(r.month, true) + ' (this month)', sub: `So far: income ${money(a ? a.income : 0)}, expenses ${money(a ? a.expenses : 0)}`, value: money(r.forecast), valueSub: `expected, plan ${money(r.plan.left)}`, onClick: canEdit() ? () => monthForm(plan, r.month) : null };
    return { title: monthLabel(r.month, true), sub: `${r.note ? r.note + ' · ' : ''}income ${money(r.plan.income)}, expenses ${money(r.plan.expenses)}`, value: money(r.plan.cLeft), valueSub: `cautious, plan ${money(r.plan.left)}`, onClick: canEdit() ? () => monthForm(plan, r.month) : null };
  })), h('p', { class: 'note' }, canEdit() ? 'Tap a month to change its targets: salary, other income, everyday expenses, one-off costs, EMI and tax.' : '')),
    null));

  root.append(h('details', { class: 'card more' }, h('summary', null, 'Show all the numbers'), table([
    { label: 'Month', host: true, get: (r) => monthLabel(r.month) },
    { label: 'Income plan', cls: 'r', mob: 'under', mu: (r) => 'income ' + money(r.plan.income) + (r.actual && r.state !== 'ahead-of-us' ? ' → ' + money(r.actual.income) : ''), get: (r) => money(r.plan.income) },
    { label: 'Income actual', cls: 'r', mob: 'hide', get: (r) => (r.actual && r.state !== 'ahead-of-us' ? money(r.actual.income) : '–') },
    { label: 'Expenses plan', cls: 'r', mob: 'under', mu: (r) => 'expenses ' + money(r.plan.expenses) + (r.actual && r.state !== 'ahead-of-us' ? ' → ' + money(r.actual.expenses) : ''), get: (r) => money(r.plan.expenses) },
    { label: 'Expenses actual', cls: 'r', mob: 'hide', get: (r) => (r.actual && r.state !== 'ahead-of-us' ? money(r.actual.expenses) : '–') },
    { label: 'EMI', cls: 'r', mob: 'under', mlabel: 'EMI ', get: (r) => money(r.plan.emi) }, { label: 'Tax', cls: 'r', mob: 'under', mlabel: 'tax ', get: (r) => money(r.plan.tax) },
    { label: 'Left: plan', cls: 'r', get: (r) => money(r.plan.left) }, { label: 'Left: cautious', cls: 'r', mob: 'under', mlabel: 'cautious ', get: (r) => money(r.plan.cLeft) },
    { label: 'Left: actual', cls: 'r', render: (r) => (r.actual && r.state !== 'ahead-of-us' ? h('span', { class: posNeg(r.actual.left) }, money(r.actual.left)) : '–') },
  ], rowsC, { onRow: canEdit() ? (r) => monthForm(plan, r.month) : null })));

  // net worth path
  const nw = netWorthPath(data, all, plan, year);
  root.append(section('Net worth against the savings path', h('div', null, lineChart({
    labels: nw.map((r) => monthLabel(r.month).slice(0, 3)), fmt: money, yMin: Math.floor(Math.min(...nw.map((r) => Math.min(r.conservative, r.actual ?? 1e15))) / 1e6) * 1e6 - 5e5,
    series: [{ name: 'Plan', values: nw.map((r) => r.plan), dashed: true, color: 1 }, { name: 'Cautious', values: nw.map((r) => r.conservative), dashed: true, color: 3 }, { name: 'Actual', values: nw.map((r) => r.actual), color: 0 }],
  }), h('p', { class: 'note' }, 'The plan lines add only your savings to where the year began. Market gains and gold are left out on purpose, so a net worth above the line means your investments did the extra work.'))));

  // review
  root.append(h('h2', { class: 'sec-title' }, year.complete ? 'Year-end review' : 'Review so far'));
  if (!year.complete) root.append(h('p', { class: 'note', style: { marginTop: 0 } }, `This updates as each month finishes. After ${monthLabel(plan.months[11].month, true)} it becomes your year-end review.`));
  const L = year.lines;
  const lineRow = (label, k, good) => ({ label, plan: L[k].planDone, actual: L[k].actual, diff: L[k].actual - L[k].planDone, good });
  const lr = [lineRow('Income', 'income', 'up'), lineRow('Everyday expenses', 'expenses', 'down'), lineRow('Loan EMI', 'emi', 'down'), lineRow('Tax', 'tax', 'down')];
  if (year.done.length) root.append(section('Plan against what happened', table([
    { label: '', get: (r) => r.label }, { label: 'Planned', cls: 'r', get: (r) => money(r.plan) }, { label: 'Actual', cls: 'r', get: (r) => money(r.actual) },
    { label: 'Difference', cls: 'r', render: (r) => h('span', { class: (r.good === 'up' ? r.diff >= 0 : r.diff <= 0) ? 'pos' : 'neg' }, signed(r.diff)) },
  ], lr, { empty: '' })));
  root.append(section('What the numbers say', rowList(rv.findings.map((f) => ({ title: f.text, tone: f.tone })), { empty: 'Nothing to report yet.' })));
  if (rv.big.length) root.append(section('Where the surprises came from', h('div', null, rowList(rv.big.map((e) => ({ lead: h('span', { class: 'datechip' }, h('b', null, e.date.slice(8)), h('small', null, monthLabel(e.date.slice(0, 7)).slice(0, 3).toUpperCase())), title: e.desc, sub: e.category, value: money(e.debit) }))), h('p', { class: 'note' }, 'The largest single expenses in the year. Plan for the ones that come back every year, such as school fees and insurance.'))));
  if (rv.cats.length) root.append(section('Where everyday money went', hbars(rv.cats.map((c) => ({ label: c.name, value: c.amount })), { fmt: money, colorIndex: 1 })));
  if (rv.suggest) root.append(h('div', { class: 'note-box' }, h('b', null, 'For next time: '), rv.suggest.note));

  const rt = plan.retro || {};
  const boxes = {};
  const area = (key, label, hint) => { boxes[key] = h('textarea', { rows: 3, 'aria-label': label, readonly: canEdit() ? null : true, placeholder: hint }, rt[key] || ''); return h('label', { class: 'field' }, h('span', null, label), boxes[key]); };
  root.append(section('My own review', h('div', { class: 'form' },
    area('wrong', 'Where did I go wrong?', 'Overspent on…, forgot…'),
    area('why', 'Why was my estimate off?', 'I assumed…, I did not count…'),
    area('better', 'What will I do better next year?', 'Set a budget for…, keep a buffer for…'),
    rt.savedAt ? h('p', { class: 'note' }, 'Saved ' + dateStr(rt.savedAt.slice(0, 10))) : null),
    canEdit() ? [btn('Save my notes', () => { mutate((d) => { const p = ensure(d).find((x) => x.id === plan.id); p.retro = { wrong: boxes.wrong.value, why: boxes.why.value, better: boxes.better.value, savedAt: new Date().toISOString() }; }); toast('Notes saved'); }, 'primary'), year.complete || year.done.length >= 10 ? btn('Start next year’s plan', () => nextYearForm(plan, year, rv)) : null] : null));
}
