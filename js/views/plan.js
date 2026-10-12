import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, pct, dateStr, monthLabel, gainText, section, stat, table, btn, formDialog, canEdit, toast, num } from '../ui.js';
import { lineChart, meter } from '../charts.js';

let tab = 'targets';
const rerender = () => window.dispatchEvent(new Event('rerender'));

function targetForm(i) {
  const m = S.data.targets.months[i];
  formDialog({
    title: 'Month-end position · ' + monthLabel(m.date.slice(0, 7)), value: { actualAsset: m.actualAsset, actualLiability: m.actualLiability },
    fields: [
      { key: 'actualAsset', label: 'Total assets at month end (₹)', type: 'number', hint: `Today the app shows ${money(S.all.totalAssets)}.` },
      { key: 'actualLiability', label: 'Loans outstanding at month end (₹)', type: 'number', hint: `Today the app shows ${money(S.all.liabTotal)}.` },
    ],
    onSave: (v) => mutate((d) => { const t = d.targets.months[i]; t.actualAsset = v.actualAsset || null; t.actualLiability = v.actualLiability || null; }),
  });
}
function projForm(i) {
  const r = S.data.proj.months[i];
  formDialog({
    title: 'Plan for ' + monthLabel(r.date.slice(0, 7)), value: r,
    fields: [
      { key: 'salary', label: 'Salary (₹)', type: 'number' }, { key: 'monthlyInterest', label: 'Monthly interest (₹)', type: 'number' }, { key: 'pf', label: 'Provident fund (₹)', type: 'number' },
      { key: 'family', label: 'Family spending (₹, negative)', type: 'number' }, { key: 'other', label: 'Other spending (₹, negative)', type: 'number' }, { key: 'emi', label: 'Loan EMI (₹, negative)', type: 'number' },
      { key: 'tax', label: 'Tax (₹, negative)', type: 'number' }, { key: 'remarks', label: 'Remarks' },
    ],
    onSave: (v) => mutate((d) => { Object.assign(d.proj.months[i], Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'remarks' ? x : x || 0]))); }),
  });
}
function paramsForm() {
  const lt = S.data.proj.longTerm, a = S.data.settings.assumptions;
  formDialog({
    title: 'Projection assumptions', value: { ...lt, ...a },
    fields: [
      { key: 'monthlyInvestment', label: 'New money invested each month (₹)', type: 'number' }, { key: 'interestPrediction', label: 'Interest expected on new money (0.1 = 10%)', type: 'number' },
      { key: 'startPortfolio', label: 'Long-term: starting portfolio (₹)', type: 'number' }, { key: 'kaliSalaryYear', label: 'Salary per year, Kalidass (₹)', type: 'number' }, { key: 'suguSalaryYear', label: 'Salary per year, Suganya (₹)', type: 'number' },
      { key: 'hike', label: 'Yearly raise (0.06 = 6%)', type: 'number' }, { key: 'returns', label: 'Expected yearly return (0.08 = 8%)', type: 'number' }, { key: 'monthlyExpense', label: 'Spending each month (₹)', type: 'number' },
      { key: 'taxPerYear', label: 'Tax per month in Feb to Apr (₹)', type: 'number' }, { key: 'taxStep', label: 'Yearly increase in that tax (₹)', type: 'number' },
    ],
    onSave: (v) => mutate((d) => {
      d.settings.assumptions.monthlyInvestment = v.monthlyInvestment; d.settings.assumptions.interestPrediction = v.interestPrediction;
      for (const k of ['startPortfolio', 'kaliSalaryYear', 'suguSalaryYear', 'hike', 'returns', 'monthlyExpense', 'taxPerYear', 'taxStep']) d.proj.longTerm[k] = v[k];
    }),
  });
}
function planForm(i) {
  const p = S.data.targets.investmentPlan[i];
  formDialog({
    title: p.name, value: p, fields: [{ key: 'capital', label: 'Planned new investment this year (₹)', type: 'number' }],
    onSave: (v) => mutate((d) => { d.targets.investmentPlan[i].capital = v.capital || 0; }),
  });
}

export function render() {
  const { data, all } = S;
  const proj = C.projection(data, all);
  const root = h('div', { class: 'page' });
  root.append(h('nav', { class: 'chips' }, [['targets', 'Year targets'], ['budget', 'Monthly plan vs actual'], ['future', 'Long-term']].map(([k, l]) => h('button', { class: tab === k ? 'chip on' : 'chip', onclick: () => { tab = k; rerender(); } }, l))));

  if (tab === 'targets') {
    const tg = C.targets(data, proj);
    const withActual = tg.filter((t) => t.actualNet != null);
    const lastA = withActual[withActual.length - 1];
    root.append(h('div', { class: 'stats' },
      stat('Net worth now', money(all.netAsset), 'from your holdings today'),
      stat('Last month-end entered', lastA ? money(lastA.actualNet) : '–', lastA ? monthLabel(lastA.date.slice(0, 7)) : 'none yet'),
      stat('Ahead or behind plan', lastA && lastA.slippage != null ? gainText(lastA.slippage) : '–', lastA ? 'at ' + monthLabel(lastA.date.slice(0, 7)) : '')));
    root.append(section('Net worth: plan vs actual', lineChart({
      labels: tg.map((t) => monthLabel(t.date.slice(0, 7))), fmt: money, yMin: Math.floor(tg[0].plannedNet / 1e6) * 1e6 - 1e6,
      series: [{ name: 'Plan', values: tg.map((t) => t.plannedNet), dashed: true, color: 1 }, { name: 'Actual', values: tg.map((t) => t.actualNet), color: 0 }],
    })));
    root.append(section('Month by month',
      h('div', null, table([
        { label: 'Month end', get: (t) => monthLabel(t.date.slice(0, 7)) },
        { label: 'Plan: net worth', cls: 'r', get: (t) => money(t.plannedNet) },
        { label: 'Actual: assets', cls: 'r', get: (t) => (t.actualAsset != null ? money(t.actualAsset) : '–') },
        { label: 'Actual: loans', cls: 'r', get: (t) => (t.actualLiab != null ? money(t.actualLiab) : '–') },
        { label: 'Actual: net worth', cls: 'r', get: (t) => (t.actualNet != null ? money(t.actualNet) : '–') },
        { label: 'Ahead / behind', cls: 'r', render: (t) => (t.slippage != null ? gainText(t.slippage) : '–') },
      ], tg.map((t, i) => ({ ...t, _i: i })), { onRow: canEdit() ? (t) => t._i > 0 && targetForm(t._i) : null }),
        canEdit() ? h('p', { class: 'note' }, 'At each month end, tap the month and enter total assets and loans.') : null)));
    const it = C.investmentTargets(data, all);
    root.append(section('Where new money should go this year',
      h('div', null, table([
        { label: 'Type', get: (r) => r.name }, { label: 'Planned to add', cls: 'r', get: (r) => money(r.plan), total: () => money(it.totalPlan) },
        { label: 'Share of plan', cls: 'r', get: (r) => pct(r.planPct, 0) }, { label: 'Held now', cls: 'r', get: (r) => money(r.current) },
        { label: 'Share of assets', cls: 'r', get: (r) => pct(r.currentPct, 1) }, { label: 'Risk', get: (r) => r.risk },
      ], it.rows.map((r, i) => ({ ...r, _i: i })), { footer: { label: 'Total' }, onRow: canEdit() ? (r) => planForm(r._i) : null }),
        h('p', { class: 'note' }, 'Extra yearly return expected on gold and shares: ' + money(it.extraReturns) + '.'))));
  }

  if (tab === 'budget') {
    const months = data.proj.months.map((r) => r.date.slice(0, 7));
    const rows = proj.map((r, i) => ({ ...r, i, actual: C.actualMonthFlow(data, months[i]) }));
    root.append(section('Plan vs what actually happened',
      h('div', null, table([
        { label: 'Month', get: (r) => monthLabel(months[r.i]) },
        { label: 'Planned left over', cls: 'r', get: (r) => money(r.projected) },
        { label: 'Actual income', cls: 'r', get: (r) => (r.actual.has ? money(r.actual.salary + r.actual.interest) : '–') },
        { label: 'Actual spending', cls: 'r', get: (r) => (r.actual.has ? money(-(r.actual.living + r.actual.emi + r.actual.tax)) : '–') },
        { label: 'Actual left over', cls: 'r', get: (r) => (r.actual.has ? money(r.actual.net) : '–') },
        { label: 'Plan note', get: (r) => r.remarks || '' },
      ], rows, { onRow: canEdit() ? (r) => projForm(r.i) : null }),
        h('p', { class: 'note' }, 'Actuals come from your bank entries: income is salary plus interest and other credits; spending is everything except investments, transfers and cash withdrawals. The plan also counts provident fund savings, which do not pass through the bank, so the two will not match exactly. Tap a month to change its plan.'))));
    root.append(section('Plan inputs', table([
      { label: 'Month', get: (r) => monthLabel(months[r.i]) }, { label: 'Salary', cls: 'r', get: (r) => money(r.salary) }, { label: 'Monthly interest', cls: 'r', get: (r) => money(r.monthlyInterest) },
      { label: 'Other interest', cls: 'r', get: (r) => money(r.annual) }, { label: 'Provident fund', cls: 'r', get: (r) => money(r.pf) }, { label: 'Family', cls: 'r', get: (r) => money(r.family) },
      { label: 'Other', cls: 'r', get: (r) => money(r.other) }, { label: 'EMI', cls: 'r', get: (r) => money(r.emi) }, { label: 'Tax', cls: 'r', get: (r) => money(r.tax) },
    ], rows, { onRow: canEdit() ? (r) => projForm(r.i) : null })));
  }

  if (tab === 'future') {
    const lt = C.longTerm(data);
    const yearEnds = lt.filter((r) => r.date.slice(5, 7) === '12');
    root.append(section('Projected portfolio', lineChart({
      labels: lt.map((r) => monthLabel(r.date.slice(0, 7))), fmt: money, area: true, yMin: 0,
      series: [{ name: 'Portfolio after returns', values: lt.map((r) => r.after) }],
    }), canEdit() ? [btn('Change assumptions', paramsForm)] : null));
    root.append(section('Year-end view',
      h('div', null, table([
        { label: 'Year end', get: (r) => r.date.slice(0, 4) }, { label: 'Portfolio', cls: 'r', get: (r) => money(r.after) },
        { label: 'In lakhs / crores', cls: 'r', get: (r) => compact(r.after) }, { label: 'Yearly return', cls: 'r', get: (r) => money(lt.filter((x) => x.date.slice(0, 4) === r.date.slice(0, 4)).reduce((a, x) => a + x.returns, 0)) },
      ], yearEnds),
        h('p', { class: 'note' }, `Assumes ${pct(data.proj.longTerm.returns, 1)} yearly return, ${pct(data.proj.longTerm.hike, 1)} yearly raise, spending ${money(data.proj.longTerm.monthlyExpense)} a month and tax in February to April. This is an estimate to plan with, not a forecast.`))));
  }
  return root;
}
