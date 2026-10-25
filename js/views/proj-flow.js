// Wealth outlook: what the projection does with income, spending and new investments, month by month or year by year.
// Shared by This year and Years ahead. Rows come from simulate().
import { h, money, compact, pct, monthLabel, section, table, tapSheet } from '../ui.js';
import * as P from '../projector.js';
import { stackedBars } from '../charts.js';
import { signed } from './proj-shared.js';

const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const SERIES = ['Income', 'Spending', 'Invested'];
const picks = {};   // which column is open, per chart title, so it survives a redraw

/** Add up the rows of one period. */
function total(rows) {
  return {
    salary: sum(rows, (r) => r.salary), interest: sum(rows, (r) => r.interest), other: sum(rows, (r) => r.other + r.oneIn), growth: sum(rows, (r) => r.growth || 0), left: sum(rows, (r) => r.left || 0), refill: sum(rows, (r) => r.refill || 0),
    everyday: sum(rows, (r) => r.expenses), emi: sum(rows, (r) => r.emi), oneTime: sum(rows, (r) => r.oneOut), invested: sum(rows, (r) => r.invested),
    pf: sum(rows, (r) => r.pfAdd || 0), income: sum(rows, (r) => r.income), out: sum(rows, (r) => r.out), nw: rows.length ? rows[rows.length - 1].nw : 0, accrual: sum(rows, (r) => r.accrual || 0),
    items: rows.flatMap((r) => (r.items || []).filter((i) => i.kind !== 'income').map((i) => ({ ...i, month: r.month }))), rows,
  };
}
/** The bars of one period. Interest, other income and new investments carry their breakup (by category or investment), shown when you hover a bar. */
const detailOf = (tip, rows) => tip(rows).parts.map((x) => ({ name: x.name, amount: x.amount }));
const parts = (t) => [
  [{ name: 'Salary', value: t.salary }, { name: 'Interest income', value: t.interest, detail: detailOf(interestTip, t.rows) }, { name: 'Other income', value: t.other, detail: detailOf(otherTip, t.rows) }],
  [{ name: 'Everyday expenses', value: t.everyday }, { name: 'Loan EMI', value: t.emi }, { name: 'One-time items', value: t.oneTime, detail: t.items.map((i) => ({ name: i.name, amount: i.amount })) }],
  [{ name: 'New investments', value: t.invested, detail: detailOf(investedTip, t.rows) }],
];
const money0 = (v) => (v > 0.5 ? money(v) : '–');

/**
 * The chart. mode 'month' draws a column set per month, 'year' one per calendar year. Tap a column to see what it is made of:
 * a year shows its twelve months, a month shows each part and the one-time items in it.
 */
const cls = (c, v) => h('span', { class: c }, v);
const inc = (v) => (v > 0.5 ? cls('inc', money(v)) : '–');
const exp = (v) => (v > 0.5 ? cls('exp', money(v)) : '–');
const inv = (v) => (v > 0.5 ? cls('inv', money(v)) : '–');

const needsCalc = (r) => r.src === 'actual' && !r.growthRecorded && !!r.growthItems;
const calcAlert = () => h('span', { class: 'calc-alert', title: WARN, 'aria-label': WARN, role: 'img' }, '⚠');
const calcMark = (r) => (needsCalc(r) ? calcAlert() : null);
const tone$ = (v) => (v > 0.5 ? 'inc' : v < -0.5 ? 'exp' : '');
const WARN = 'Worked out now from your current data: this month’s snapshot has no growth record. Save the snapshot again to record it.';
/** One class's growth, in words: the working behind the figure. */
function itemNote(x, n) {
  if (x.how === 'rate') return `${money(x.base)} × ${pct(x.rate, 1)} ÷ 12${n > 1 ? ` × ${n} months` : ''}${x.estimated ? ' (outlook rate: no recorded values yet)' : ''}`;
  if (x.how === 'market') return `closing ${money(x.close)} − opening ${money(x.base)} − put in ${money(x.put || 0)}${x.took ? ` + sold ${money(x.took)}` : ''}`;
  return x.note || null;
}
/**
 * The growth lines of some rows as sheet rows (a real month from its rules, a projected one from opening × rate ÷ 12).
 * A real month whose opening position is only the starting net worth you entered has no known split by asset class, so it shows as one figure (`unsplit`).
 */
export function growthRows(rows) {
  const by = new Map();
  let other = 0, calc = false, hasReal = false, unsplit = 0;
  for (const r of rows) {
    const real = r.src && r.src !== 'projected';
    if (real && r.growthItems) {
      hasReal = true;
      if (!(r.open && r.open.real)) { unsplit += r.growth || 0; continue; }
      if (r.src === 'actual' && !r.growthRecorded) calc = true;
      for (const x of r.growthItems) { const e = by.get(x.key) || { ...x, amount: 0, put: 0, took: 0 }; e.amount += x.amount; e.put += x.put || 0; e.took += x.took || 0; e.close = x.close; by.set(x.key, e); }
      other += r.growthOther || 0;
    } else for (const [k, v] of Object.entries(r.growthBy || {})) { const e = by.get(k) || { key: k, label: P.labelOf(k), amount: 0, base: v.base, close: v.close, rate: v.rate, how: 'rate' }; e.amount += v.amount; e.close = v.close; by.set(k, e); }
  }
  const n = rows.length === 1 ? (rows[0].spanMonths || 1) : 0;
  const list = [...by.values()].filter((x) => Math.abs(x.amount) > 0.5 || (x.how === 'market')).sort((a, b) => b.amount - a.amount);
  const out = list.map((x) => ({ l: x.label || P.labelOf(x.key), v: money(x.amount), tone: tone$(x.amount), n: rows.length === 1 ? itemNote(x, n) : null, warn: calc && hasReal && x.how !== 'projected' ? WARN : null }));
  if (Math.abs(unsplit) > 0.5) out.push({ l: 'Month after the starting figure', v: money(unsplit), tone: tone$(unsplit), n: 'how the starting net worth was spread over asset classes is not known, so this month is shown as one figure' });
  if (hasReal && Math.abs(other) > 0.5) out.push({ l: 'Not explained (difference)', v: money(other), tone: tone$(other), n: 'what saving, EPF and the rules above do not account for: spending paid in cash, the loan balance falling, money moved between assets, a snapshot taken on a different day', warn: calc ? WARN : null });
  return { rows: out, total: sum(rows, (r) => r.growth || 0), calc, hasReal, unsplit };
}
/** Sheet content: where a period's growth came from, class by class. */
export function growthTip(rows) {
  const g = growthRows(rows), one = rows.length === 1, real = rows.every((r) => r.src && r.src !== 'projected');
  const onlyTotal = one && g.unsplit !== 0 && !g.rows.some((x) => !x.l.startsWith('Month after'));
  return {
    title: one ? `Growth · ${monthLabel(rows[0].month, true)}` : 'Growth',
    note: onlyTotal ? 'This month starts from the net worth you entered on the Planner. How that was spread over asset classes is not known, so the growth is shown as one figure: what net worth gained beyond what was saved and put into EPF. From the next snapshot on it is explained class by class.'
      : real ? 'A real month. Growth is what net worth gained beyond what was saved and put into EPF, explained class by class: market assets by value change after buying and selling, EPF/PPF by interest credited, FDs, RDs, insurance and chits by their rate, cash only when no bank interest is recorded. Interest from bonds and lending, bank interest and dividends are income, so they are not counted here.'
        : 'A projected month: each class grows by its yearly rate ÷ 12 on its value at the start of the month. EPF and PPF, FDs, RDs, insurance and chits compound; shares, ETFs, funds and gold follow the market outlook. New money adds from the next month.',
    rows: [...g.rows, { l: 'Total growth', v: money(g.total), b: true, tone: tone$(g.total) }],
    foot: g.calc ? '⚠ means the figure was worked out now. Save the month’s snapshot again to record it.' : 'Interest paid out by bonds and lending is under Interest, not here.',
  };
}
const catLabel = (n) => (/bond/i.test(n) ? 'Bonds' : /lend/i.test(n) ? 'Private lending' : n);
const isReal = (r) => r.src && r.src !== 'projected';
/** Add up named parts across rows: [{ name, amount, note }]. */
function gather(rows, each) {
  const by = new Map();
  for (const r of rows) each(r, (name, amount, note) => { const e = by.get(name) || { name, amount: 0, note }; e.amount += amount; by.set(name, e); });
  return [...by.values()];
}
/** Sheet content: interest income by category. Real months from the bank's categories, projected ones from the holdings (and the one plain top-up line, when your expected figure differs). */
function interestTip(rows) {
  const one = rows.length === 1, all = rows.every(isReal), none = rows.every((r) => !isReal(r));
  const parts = gather(rows, (r, add) => {
    if (isReal(r)) { for (const x of r.interestByCat || []) add(catLabel(x.name), x.amount, `credits in your bank under “${x.name}”`); return; }
    for (const [k, v] of Object.entries(r.interestBy || {})) {
      if (k === 'adj') add('Adjustment to your expected figure', v.amount, `your expected interest income on the Planner is ${money(v.typed)} a month; the holdings gave ${money(v.holdings)} when the plan started. The difference is added so the plan starts from your figure (change it on the Planner, Income).`);
      else add((P.classOf(k) || {}).label || k, v.amount, `${money(v.base)} × ${pct(v.rate, 1)} ÷ 12, less TDS`);
    }
  });
  const total = sum(rows, (r) => r.interest);
  return {
    title: all ? 'Interest received' : none ? 'Interest paid out' : 'Interest income',
    note: all ? 'Interest credited to your bank in the month, by category.' : 'Bonds and lending pay interest on what is held at the start of the month, after TDS. FDs, EPF, chits and RDs do not pay out: their interest is added to the balance and shows as growth.',
    parts: parts.filter((x) => Math.abs(x.amount) > 0.5),
    rows: [...parts.filter((x) => Math.abs(x.amount) > 0.5).map((x) => ({ l: x.name, v: signedIf(x), tone: x.amount >= 0 ? 'inc' : 'exp', n: one ? x.note : null })), { l: 'Total', v: money(total), b: true, tone: 'inc' }],
  };
}
const signedIf = (x) => (x.name.startsWith('Adjustment') ? signed(x.amount) : money(x.amount));
/** Sheet content: other income, by category. */
function otherTip(rows) {
  const one = rows.length === 1, all = rows.every(isReal);
  const parts = gather(rows, (r, add) => {
    if (isReal(r)) { for (const x of r.otherByCat || []) add(x.name, x.amount, 'credits in your bank, and dividends from your trade records when the bank does not show them'); return; }
    if (r.other > 0.5) add('Other income in the plan', r.other, 'set on the Planner (Income), raised with the salary hike');
    for (const i of (r.items || []).filter((x) => x.kind === 'income')) add(i.name, i.amount, 'one-time income in the plan');
  });
  const total = sum(rows, (r) => r.other + (r.oneIn || 0));
  return { title: all ? 'Other income received' : 'Other income', parts: parts.filter((x) => x.amount > 0.5), rows: [...parts.filter((x) => x.amount > 0.5).map((x) => ({ l: x.name, v: money(x.amount), tone: 'inc', n: one ? x.note : null })), ...(!parts.some((x) => x.amount > 0.5) ? [{ l: 'Nothing', v: money(0) }] : []), { l: 'Total', v: money(total), b: true, tone: 'inc' }] };
}
/** Sheet content: where the money invested went, by investment. Real months from your records, projected ones from the plan's lines. */
export function investedTip(rows) {
  const one = rows.length === 1, all = rows.every(isReal), none = rows.every((r) => !isReal(r));
  const parts = gather(rows, (r, add) => {
    if (isReal(r)) { for (const [k, amt] of Object.entries(r.investedBy || {})) add((P.classOf(k) || {}).label || k, amt, ((r.investedSrc || {})[k] || []).length ? `from ${r.investedSrc[k].join(', ')}` : null); return; }
    for (const l of r.investedLines || []) add(l.name, l.amount, `goes into ${(P.classOf(l.cls) || {}).label || l.cls}`);
  });
  const total = sum(rows, (r) => r.invested);
  return {
    title: all ? 'Invested, from your records' : none ? 'Invested, as planned' : 'Invested',
    note: all ? 'What went into each kind of investment in the month: share and ETF trades, fund purchases, the start date of each bond, deposit and loan, gold purchases and chit entries. Bank entries fill any gap. EPF is counted with salary, not here.' : 'What is left each month after spending, split by the shares of the plan’s new-money lines. EPF is counted with salary, not here.',
    parts: parts.filter((x) => x.amount > 0.5).sort((x, y) => y.amount - x.amount),
    rows: [...parts.filter((x) => x.amount > 0.5).sort((x, y) => y.amount - x.amount).map((x) => ({ l: x.name, v: money(x.amount), tone: 'inv', n: one ? x.note : null })), ...(!parts.some((x) => x.amount > 0.5) ? [{ l: all ? 'Nothing recorded this month' : 'Nothing left to invest', v: money(0) }] : []), { l: 'Total invested', v: money(total), b: true, tone: 'inv' }],
  };
}
const spendTip = (rows) => {
  const one = [...new Set(rows.flatMap((r) => (r.items || []).filter((i) => i.kind !== 'income').map((i) => i.name)))].join(', ');
  return { title: 'Spending', rows: [{ l: 'Everyday', v: money(sum(rows, (r) => r.expenses)), tone: 'exp' }, { l: 'EMI', v: money(sum(rows, (r) => r.emi)), tone: 'exp' }, { l: 'One-time', v: money(sum(rows, (r) => r.oneOut)), tone: 'exp', n: one || null }, { l: 'Total', v: money(sum(rows, (r) => r.expenses + r.emi + r.oneOut)), b: true, tone: 'exp' }] };
};
const salaryTip = (rows) => ({ title: 'Salary + EPF', rows: [{ l: 'Salary to bank', v: money(sum(rows, (r) => r.salary)), tone: 'inc' }, { l: 'EPF', v: money(sum(rows, (r) => r.pfAdd || 0)), tone: 'inv', n: 'goes in before the salary reaches the bank' }, { l: 'Total', v: money(sum(rows, (r) => r.salary + (r.pfAdd || 0))), b: true }] });
/** A figure that opens its working in a bottom sheet (phone) or popup (desktop) when tapped. */
export const tipped = (rows, build, node) => tapSheet(h('span', null, node), () => build(rows));

/** Sheet content: how a month's net worth was reached, step by step: income, expenses and growth each in a group that folds. */
export function netWorthTip(r, label = 'Net worth') {
  const open = r.open ? r.open.nw : openingNw(r), real = r.src && r.src !== 'projected';
  const g = growthTip([r]), neg = (v) => '−' + money(v);
  const left = r.leftSpan != null ? r.leftSpan : r.left, pfIn = r.pfSpan != null ? r.pfSpan : (r.pfAdd || 0), more = (r.spanMonths || 1) > 1;
  const other = r.other + (r.oneIn || 0);
  const growthRows$ = g.rows.filter((x) => !x.b).map((x) => ({ ...x, sub: true }));
  const rows = [
    { l: 'Net worth at the start of the month', v: money(open), b: true, n: more ? `${r.spanMonths} months since the last snapshot, so saving and growth below cover all of them` : null },
    { group: 'Income', tone: 'inc', v: money(r.income), rows: [
      { l: 'Salary to the bank', v: money(r.salary), tone: 'inc' }, { l: 'Interest income (bonds, lending)', v: money(r.interest), tone: 'inc' },
      ...(other > 0.5 ? [{ l: 'Other income', v: money(other), tone: 'inc', n: r.dividends > 0.5 ? `includes dividends ${money(r.dividends)}` : null }] : [])] },
    { group: 'Expenses', tone: 'exp', v: neg(r.out), rows: [
      { l: 'Everyday expenses', v: neg(r.expenses), tone: 'exp' }, { l: 'Loan EMI', v: neg(r.emi), tone: 'exp' },
      ...(r.oneOut > 0.5 ? [{ l: 'One-time items', v: neg(r.oneOut), tone: 'exp', n: oneNames(r) || null }] : [])] },
    { l: 'Saved in the bank', v: money(left), b: true, tone: tone$(left), n: more ? 'income − spending, all the months' : 'income − spending (moving money into investments does not change net worth)' },
    { l: 'Added to EPF', v: money(pfIn), tone: 'inv', n: 'goes in before the salary reaches the bank' },
    { group: 'Growth of all assets', tone: tone$(r.growth || 0), v: money(r.growth || 0), rows: growthRows$ },
    { l: `${label} at the end of the month`, v: money(r.nw), b: true, n: `${money(open)} + saved ${money(left)} + EPF ${money(pfIn)} + growth ${money(r.growth || 0)}` },
  ];
  return { title: `${label} · ${monthLabel(r.month, true)}`, note: real ? 'What really happened: income and spending are from your bank entries, the closing figure is the month-end snapshot (or today’s position for the current month), and growth is what the assets gained beyond that. Tap a heading to fold it.' : 'Projected from the plan’s settings. Growth uses each asset class’s own yearly rate ÷ 12: EPF/PPF at their rate, market assets at the plan’s outlook. Tap a heading to fold it.', rows };
}
/** Net worth at the start of a run of rows, worked back from its first month. */
const openingNw = (r) => r.open ? r.open.nw : r.nw - (r.income - r.out) - (r.pfAdd || 0) - (r.growth || 0);
const oneNames = (r) => (r.items || []).filter((i) => i.kind !== 'income').map((i) => `${i.name} ${money(i.amount)}`).join(', ');

/**
 * The chart. mode 'month' draws a column set per month, 'year' one per calendar year. Tap a column to see what it is made of:
 * a year opens its own month by month chart, a month shows each part and the one-time items in it.
 */
export function flowSection(rows, { mode = 'month', title = 'Income, spending and investing', embed = false, initial = null, planBy = null } = {}) {
  if (!rows.length) return section(title, h('p', { class: 'empty' }, 'Nothing to show.'));
  const box = h('div');
  const groups = [];
  if (mode === 'year') {
    const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))];
    for (const y of years) { const yr = rows.filter((r) => r.month.startsWith(y)); groups.push({ key: y, label: y, title: `${y}${yr.length < 12 ? ` (${yr.length} months)` : ''}`, rows: yr, t: total(yr) }); }
  } else for (const r of rows) groups.push({ key: r.month, label: monthLabel(r.month).slice(0, 3), title: monthLabel(r.month, true), rows: [r], t: total([r]) });
  if (picks[title] === undefined && initial && groups.some((g) => g.key === initial)) picks[title] = initial;   // open with a month already chosen, so its table is not empty
  if (picks[title] && !groups.some((g) => g.key === picks[title])) picks[title] = null;
  const draw = () => {
    const pick = picks[title];
    const chart = stackedBars({ names: SERIES, colors: [2, 7, 0], fmt: money, height: 250,
      groups: groups.map((g) => ({ label: g.label, title: g.title + (g.rows.every((r) => r.src === 'projected') ? ' (projected)' : ''), bars: parts(g.t), faded: g.rows.every((r) => r.src === 'projected') })),
      selected: pick ? { g: groups.findIndex((g) => g.key === pick), s: 0 } : null,
      onSelect: (gi) => { picks[title] = pick === groups[gi].key ? null : groups[gi].key; draw(); } });
    let detail = h('p', { class: 'note' }, mode === 'year' ? 'Tap a year to see its months as a chart of its own.' : 'Tap a month to see what it is made of.');
    if (pick) {
      const g = groups.find((x) => x.key === pick);
      detail = mode === 'year' ? flowSection(g.rows, { mode: 'month', title: `${g.title}, month by month`, embed: true, planBy }) : monthDetail(g, planBy);
    }
    box.replaceChildren(chart, detail);
  };
  draw();
  const body = h('div', null, box,
    !embed && rows.some((r) => r.src === 'projected') ? h('p', { class: 'note' }, 'Paler bars are projected months; solid bars are what really happened.') : null,
    embed ? null : h('p', { class: 'note' }, 'Green is income, red is spending, blue is new investing. Each bar splits into its parts, from the darkest shade down: salary, interest, other income; everyday expenses, EMI, one-time items. Salary and EPF step up in the raise month; the EMI stays the same. New investing is whatever is left after spending, split by the shares of your plan, so a month with tax or fees invests little or nothing.'));
  return embed ? h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, title), body) : section(title, body);
}

/** One month, item by item: what the plan said next to what happened (or is projected). */
function compareDetail(g, pr) {
  const r = g.rows[0], real = r.src && r.src !== 'projected', now = r.src === 'now', actLabel = real ? (now ? 'So far' : 'Actual') : 'Projected';
  const low = (x) => String(x || '').toLowerCase();
  const names = [...new Set([...(pr.items || []), ...(r.items || [])].filter((i) => i.kind !== 'income').map((i) => i.name))];
  const amt = (row, n) => (row.items || []).filter((i) => i.kind !== 'income' && low(i.name) === low(n)).reduce((a, i) => a + i.amount, 0);
  const L = (label, a, b, o = {}) => ({ label, plan: a, act: b, ...o });
  const lines = [
    L('Salary', pr.salary, r.salary, { sign: 1, tone: 'inc' }), L('Interest income', pr.interest, r.interest, { sign: 1, tone: 'inc', pop: interestTip }), (pr.other + (pr.oneIn || 0) > 0.5 || r.other + (r.oneIn || 0) > 0.5) ? L('Other income', pr.other + (pr.oneIn || 0), r.other + (r.oneIn || 0), { sign: 1, tone: 'inc', pop: otherTip }) : null,
    L('Total income', pr.income, r.income, { sign: 1, b: true, tone: 'inc' }),
    L('Everyday expenses', pr.expenses, r.expenses, { sign: -1, tone: 'exp' }), L('Loan EMI', pr.emi, r.emi, { sign: -1, tone: 'exp' }),
    ...names.map((n) => L('One-time: ' + n, amt(pr, n), amt(r, n), { sign: -1, tone: 'exp' })),
    (pr.oneOut > 0.5 || r.oneOut > 0.5) && names.length > 1 ? L('One-time, total', pr.oneOut, r.oneOut, { sign: -1, b: true, tone: 'exp' }) : null,
    L('Saved in the bank', pr.left, r.left, { sign: 1, b: true }),
    L('New investments', pr.invested, r.invested, { sign: 0, tone: 'inv', pop: investedTip }), L('Added to EPF', pr.pfAdd || 0, r.pfAdd || 0, { sign: 1, tone: 'inv' }),
    L('Growth of assets', pr.growth || 0, r.growth || 0, { sign: 1, tip: true }),
    L('Net worth at month end', pr.nw, r.nw, { sign: 1, b: true, nw: true }),
  ].filter(Boolean);
  const diffNode = (x) => { const d = x.act - x.plan; if (Math.abs(d) < 0.5) return h('span', { class: 'muted' }, '–'); const good = x.sign === 0 ? 0 : d * x.sign; return h('span', { class: good > 0 ? 'pos' : good < 0 ? 'neg' : '' }, (d > 0 ? '+' : '−') + money(Math.abs(d))); };
  const cell = (row, x, v) => (x.tip ? tipped([row], growthTip, h('span', null, money(v), row === r ? calcMark(r) : null)) : x.nw ? tapSheet(h('span', null, money(v)), () => netWorthTip(row)) : x.pop && Math.abs(v) > 0.5 ? tipped([row], x.pop, h('span', { class: x.tone }, money(v))) : x.tone ? h('span', { class: x.tone }, money(v)) : money(v));
  return h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, g.title + (real ? '' : ' · projected')),
    table([
      { label: 'Item', host: true, render: (x) => (x.b ? h('b', null, x.label) : x.label) },
      { label: 'Plan', cls: 'r', render: (x) => (x.b ? h('b', null, cell(pr, x, x.plan)) : cell(pr, x, x.plan)) },
      { label: actLabel, cls: 'r', render: (x) => (x.b ? h('b', null, cell(r, x, x.act)) : cell(r, x, x.act)) },
      { label: 'Difference', cls: 'r', render: diffNode },
    ], lines, { m: { key: 'flow-compare', head: 'Item', views: [[actLabel, 'Plan'], ['Difference']] } }),
    h('p', { class: 'reco' }, real ? 'Plan is what the plan said for this month; the other column is what really happened (bank entries, with the month-end snapshot for net worth). Green is better than planned, red is worse: spending above plan is red. Tap growth or net worth to see how it was worked out.' : 'This month has not happened yet, so the second column is projected from the last real position with the plan’s settings; the plan column is the plan as first set. Tap growth or net worth to see the working.'));
}

function monthDetail(g, planBy = null) {
  if (planBy && g.rows.length === 1 && planBy.get(g.rows[0].month)) return compareDetail(g, planBy.get(g.rows[0].month));
  const t = g.t, r = g.rows[0], real = r.src && r.src !== 'projected';
  const line = (label, val, sub, tone) => ({ label, val: typeof val === 'function' ? val : () => val, sub, tone });   // val is built on every draw: one element cannot sit in the table and in the phone card at once
  const one = (r.items || []).filter((i) => i.kind !== 'income');
  const lines = [
    line('Salary', () => cls('inc', money(t.salary)), real ? 'salary credited in your bank' : 'today’s salary, raised in the raise month'), line('Interest income', () => tipped([r], interestTip, cls('inc', money(t.interest))), real ? 'interest credits in your bank (tap for each)' : 'bonds and lending after TDS (tap for each)'), t.other > 0.5 ? line('Other income and one-time income', () => tipped([r], otherTip, cls('inc', money(t.other))), 'tap for the breakup') : null,
    line('Total income', () => cls('inc', money(t.income)), null, 'b'),
    line('Everyday expenses', () => cls('exp', '−' + money(t.everyday)), real ? 'everyday spending in your bank, without EMI and one-time bills' : 'today’s monthly spending, grown by the yearly rise'), t.emi > 0.5 ? line('Loan EMI', () => cls('exp', '−' + money(t.emi)), 'stays the same') : null,
    ...one.map((i) => line('One-time: ' + i.name, () => cls('exp', '−' + money(i.amount)), 'yearly item, grown by the one-time rise')),
    line('Left after spending', () => cls(t.left >= 0 ? 'inc' : 'exp', (t.left < 0 ? '−' : '') + money(Math.abs(t.left))), 'income − spending', 'b'),
    t.refill > 0.5 ? line('Kept back to rebuild cash', money(Math.min(t.refill, Math.max(0, t.left))), 'cash is topped up to what you hold today before investing') : null,
    line('New investments', () => tipped([r], investedTip, cls('inv', '−' + money(t.invested))), real ? 'what went into investments, from your records (tap for each)' : t.invested > 0.5 ? 'what is left, split by the plan shares (tap for each)' : 'nothing left to invest this month'),
    line('Left in cash', money(r.surplus), 'left after spending − investments', 'b'),
    r.pfAdd > 0.5 ? line('Added to EPF', () => cls('inc', money(r.pfAdd)), 'goes in before salary reaches the bank') : null,
    line('Growth added to balances', () => tipped([r], growthTip, h('span', null, money(r.growth || 0), calcMark(r))), real ? 'what the assets gained beyond saving and EPF (tap for each class)' : 'market, deposits, chits, EPF, cash interest (tap for each)'),
    line('Net worth at the month end', money(r.nw), null, 'b'),
  ].filter(Boolean);
  return h('div', { class: 'card inner', style: { marginTop: '10px' } }, h('h4', { style: { margin: '0 0 6px' } }, g.title),
    table([{ label: 'Item', host: true, render: (x) => h('span', null, x.tone ? h('b', null, x.label) : x.label, x.sub ? h('small', { class: 'muted', style: { display: 'block' } }, x.sub) : null) }, { label: 'Amount', cls: 'r', render: (x) => (x.tone ? h('b', null, x.val()) : x.val()) }], lines, { m: { key: 'flow-lines', head: 'Item', views: [['Amount']] } }),
    h('p', { class: 'reco' }, `Net worth moves by income − spending + EPF + growth. New investing moves money from cash into assets and does not change it.`));
}

/** The month rows of a period, with every part that moves net worth, and a line adding them up. */
function monthsTable(rows) {
  const t = total(rows), start = openingNw(rows[0]);
  const any = (f) => rows.some((r) => f(r) > 0.5);
  const cols = [
    { label: 'Month', host: true, render: (r) => (r.src === 'projected' ? h('i', null, monthLabel(r.month, true)) : r.src === 'now' ? h('span', null, monthLabel(r.month, true), h('small', { class: 'now-tag' }, ' now')) : monthLabel(r.month, true)) },
    { label: 'Salary + EPF', cls: 'r', mob: 'under', mlabel: 'salary ', render: (r) => tipped([r], salaryTip, cls('inc', money(r.salary + (r.pfAdd || 0)))), total: () => tipped(rows, salaryTip, cls('inc', money(t.salary + t.pf))) },
    { label: 'Interest', cls: 'r', mob: 'hide', render: (r) => tipped([r], interestTip, inc(r.interest)), total: () => tipped(rows, interestTip, inc(t.interest)) },
    any((r) => r.other + r.oneIn) ? { label: 'Other income', cls: 'r', mob: 'hide', render: (r) => tipped([r], otherTip, inc(r.other + r.oneIn)), total: () => tipped(rows, otherTip, inc(t.other)) } : null,
    { label: 'Spending', cls: 'r', mob: 'under', mlabel: 'spending ', render: (r) => tipped([r], spendTip, exp(r.expenses + r.emi + r.oneOut)), total: () => tipped(rows, spendTip, exp(t.everyday + t.emi + t.oneTime)) },
    { label: 'Invested', cls: 'r', mob: 'under', mlabel: 'invested ', render: (r) => tipped([r], investedTip, inv(r.invested)), total: () => tipped(rows, investedTip, inv(t.invested)) },
    { label: 'Growth', cls: 'r', mob: 'hide', render: (r) => tipped([r], growthTip, h('span', null, money(r.growth || 0), calcMark(r))), total: () => tipped(rows, growthTip, h('span', null, money(t.growth), rows.some((r) => needsCalc(r)) ? calcAlert() : null)) },
    { label: 'Net worth', cls: 'r', mob: 'under', mlabel: 'net worth ', render: (r) => tapSheet(h('span', null, money(r.nw)), () => netWorthTip(r)), total: () => money(t.nw) },
  ].filter(Boolean);
  const labels = cols.map((c) => c.label), has = (l) => labels.includes(l);
  const views = [['Net worth', 'Salary + EPF'], ['Spending', 'Invested'], ...(has('Interest') ? [['Interest', 'Growth']] : []), ...(has('Other income') ? [['Other income']] : [])];
  const anyProj = rows.some((r) => r.src === 'projected');
  return h('div', null, table(cols, rows, { footer: { label: rows.length > 1 ? 'Total' : '' }, rowClass: (r) => (r.src === 'projected' ? 'proj-row' : r.src === 'now' ? 'cur-row' : ''), m: { key: 'flow-months', head: 'Month', views } }),
    anyProj ? h('p', { class: 'note' }, 'Italic months are projected from the plan’s settings. Plain months are what really happened, with net worth from the month-end snapshot (the month marked now is the month so far).') : null,
    h('p', { class: 'reco' }, `Net worth ${money(start)} at the start + income ${money(t.income)} − spending ${money(t.out)} + EPF ${money(t.pf)} + growth ${money(t.growth)} = ${money(t.nw)}. Invested ${money(t.invested)} is not in that sum: it only moves cash into assets.`));
}

/**
 * A table grouped by year. Open a year to see its months: salary, interest, expenses, EMI, one-time items, EPF, growth and net worth, with a line
 * that adds them up to the year's end. Hover a spending figure for the monthly and one-time parts.
 */
export function yearsTable(rows, { title = 'Year by year, and month by month', why = null } = {}) {
  if (!rows.length) return section(title, h('p', { class: 'empty' }, 'Nothing to show.'));
  const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))];
  const grid = { display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.3fr 1fr 1fr 1fr', gap: '8px' };
  const R = { textAlign: 'right' };
  const head = h('div', { class: 'yt-head', style: { ...grid, padding: '4px 8px', fontSize: '.82rem', opacity: 0.85 } },
    h('span', null, 'Year'), h('span', { class: 'inc', style: R }, 'Salary + EPF'), h('span', { class: 'exp', style: R }, 'Spending'), h('span', { class: 'inc', style: R }, 'Interest'), h('span', { class: 'inv', style: R }, 'Invested'), h('span', { style: R }, 'Net worth'));
  const spendCell = (monthly, once, items, yr) => h('span', { style: R }, tipped(yr, spendTip, h('span', { class: 'exp' }, money(monthly + once))), once > 0.5 ? h('small', { class: 'muted', style: { display: 'block', fontSize: '.75rem' } }, `incl. one-time ${money(once)}`) : null);
  const blocks = years.map((y, yi) => {
    const yr = rows.filter((r) => r.month.startsWith(y)), t = total(yr);
    const sumRow = h('summary', { style: { ...grid, cursor: 'pointer', padding: '8px', alignItems: 'baseline' } },
      h('b', null, y + (yr.length < 12 ? ` (${yr.length} mo)` : ''), yr.some((r) => r.src) ? h('small', { class: 'muted' }, ` ${yr.filter((r) => r.src && r.src !== 'projected').length} actual · ${yr.filter((r) => r.src === 'projected').length} projected`) : null), h('span', { style: R }, tipped(yr, salaryTip, cls('inc', money(t.salary + t.pf)))), spendCell(t.everyday + t.emi, t.oneTime, '', yr),
      h('span', { style: R }, tipped(yr, interestTip, cls('inc', money(t.interest)))), h('span', { class: 'inv', style: R }, money(t.invested)), h('span', { style: R }, money(t.nw)));
    // with `why`, the reason interest moves from month to month sits under the months of the same year
    const whyBox = why ? h('details', { class: 'more' }, h('summary', null, `Why the interest changes, month by month, ${y}`, h('small', { class: 'muted' }, `  ${money(yr[0].interest)} a month at the start, ${money(yr[yr.length - 1].interest)} at the end`)), interestWhyTable(rows, y, why.tds)) : null;
    return h('details', { class: 'cal-month', open: yi === 0 || years.length === 1 }, sumRow, monthsTable(yr), whyBox);
  });
  const NOTE = 'Open a year to see its months. Spending is everyday expenses plus loan EMI, with one-time items under it (hover for the split). Interest is what bonds and lending pay out after TDS. Invested is what was left after spending and went into your plan. Net worth is the month end, and for a year its December.';
  // with `why` the two explanations share one fold, to keep the card short
  return section(title, h('div', null, h('div', { class: 'yt-scroll' }, h('div', { class: 'yt-inner' }, head, ...blocks)),
    why ? h('details', { class: 'more' }, h('summary', null, 'How to read this'), h('p', { class: 'note' }, NOTE), h('p', { class: 'note' }, INTEREST_NOTE)) : h('p', { class: 'note' }, NOTE)));
}

const INTEREST_NOTE = 'Interest is worked out on what is held at the start of the month. New money only starts earning the month after it goes in, and the figure is after TDS. Deposits, EPF and chits do not pay out: their interest is added to the balance and shows as Growth.';

/** For one month: how much the interest moved, and the new money that moved it. */
function interestReason(r, prev, tds) {
  if (r.src && r.src !== 'projected') return { delta: prev ? r.interest - prev.interest : null, lines: [r.src === 'now' ? 'Interest received so far this month, from your bank entries.' : 'Interest that reached your bank this month.'] };
  if (r.interestBy && r.interestBy.adj && !prev) return { delta: null, lines: [`First month: ${money(r.interest)}, your expected interest income.`] };
  if (!prev) return { delta: null, lines: [`First month: ${money(r.interest)} comes from what you hold today.`] };
  const lines = [];
  if (prev.src && prev.src !== 'projected') return { delta: r.interest - prev.interest, lines: [`Worked from the plan’s settings, starting from last month’s real position (${money(prev.interest)} received).`] };
  for (const [k, amt] of Object.entries(prev.investedBy || {})) {
    const e = (r.interestBy || {})[k]; if (!e || amt < 0.5) continue;
    const extra = amt * (e.rate / 12) * (1 - tds);
    lines.push(`${money(amt)} put into ${(P.classOf(k) || {}).label || k} in ${monthLabel(prev.month).slice(0, 3)} × ${pct(e.rate, 1)} ÷ 12 less ${Math.round(tds * 100)}% TDS = +${money(extra)} a month`);
  }
  return { delta: r.interest - prev.interest, lines: lines.length ? lines : ['No new money went into bonds or lending last month, so nothing changed.'] };
}
/** The month table of one calendar year: interest a month, the change, and why. `rows` is the whole run, so January can look back at December. */
function interestWhyTable(rows, y, tds) {
  const list = rows.map((r, i) => ({ r, prev: rows[i - 1] })).filter((x) => x.r.month.startsWith(y)).map((x) => ({ ...x, w: interestReason(x.r, x.prev, tds) }));
  return table([
    { label: 'Month', host: true, get: (x) => monthLabel(x.r.month, true) },
    { label: 'Interest a month', cls: 'r', mob: 'under', mlabel: 'interest ', render: (x) => inc(x.r.interest) },
    { label: 'Change', cls: 'r', mob: 'under', mlabel: 'change ', render: (x) => (x.w.delta == null || Math.abs(x.w.delta) < 0.5 ? '–' : h('span', { class: x.w.delta > 0 ? 'inc' : 'exp' }, (x.w.delta > 0 ? '+' : '−') + money(Math.abs(x.w.delta)))) },
    { label: 'Why', mob: 'hide', render: (x) => h('span', null, x.w.lines.map((l) => h('small', { class: 'muted', style: { display: 'block' } }, l))) },
  ], list, { m: { key: 'flow-interest', head: 'Month', views: [['Interest a month', 'Change']] } });
}

/**
 * Why the interest paid out changes from month to month. Bonds and lending pay interest on what is held at the start of the month, so
 * money put into them one month raises the next month's interest by amount × rate ÷ 12, less TDS. Nothing else moves it.
 */
export function interestWhy(rows, { tds = 0.1, title = 'Interest: what changes it, month by month' } = {}) {
  if (!rows.length) return null;
  const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))];
  const blocks = years.map((y, yi) => {
    const mine = rows.filter((r) => r.month.startsWith(y));
    return h('details', { class: 'cal-month', open: yi === 0 }, h('summary', { style: { padding: '8px', cursor: 'pointer' } }, h('b', null, y), h('small', { class: 'muted' }, `  ${money(mine[0].interest)} a month at the start, ${money(mine[mine.length - 1].interest)} at the end`)), interestWhyTable(rows, y, tds));
  });
  return section(title, h('div', null, ...blocks, h('p', { class: 'note' }, INTEREST_NOTE)));
}
