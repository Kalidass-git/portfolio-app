// Wealth projector: pieces shared by its three tabs (outlook toggle, forms for plans, one-offs and new investments).
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import { h, money, pct, monthLabel, formDialog, toast, num } from '../ui.js';

export const rerender = () => window.dispatchEvent(new Event('rerender'));
export const outlooks = () => P.cfg(S.data).outlooks;
export const outlookRate = (id) => (outlooks().find((o) => o.id === id) || { rate: 0.09 }).rate;
export const ensure = (d) => { d.projector = d.projector || {}; const p = d.projector; p.years = p.years || {}; p.snapshots = p.snapshots || []; return p; };
export const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
export const pc = (r, d = 1) => (r == null || isNaN(r) ? '–' : (Math.round(r * 10 ** (d + 2)) / 10 ** d).toString().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '%');
export const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

/** Month keys from `from` to `to` inclusive. */
export const monthRange = (from, to) => { const out = []; for (let m = from; m <= to; m = C.addMonths(m + '-01', 1).slice(0, 7)) out.push(m); return out; };

/**
 * One row of buttons to choose the market outlook for every market-linked class at once.
 * `current` is { gold, shares, etfs, funds } of outlook ids. onPick(id) sets all four.
 */
export function outlookToggle(current, onPick, { label = 'Market outlook', disabled = false } = {}) {
  const oc = outlooks();
  const ids = P.MARKET.map((k) => current[k] || 'steady');
  const common = ids.every((x) => x === ids[0]) ? ids[0] : 'mixed';
  const items = oc.map((o) => h('a', { href: 'javascript:void 0', class: o.id === common ? 'on' : '', 'aria-selected': String(o.id === common), title: o.hint || '', onclick: (e) => { e.preventDefault(); if (!disabled) onPick(o.id); } }, o.name, h('small', { class: 'seg-rate' }, ' ' + pc(o.rate, 0))));
  if (common === 'mixed') items.push(h('a', { href: 'javascript:void 0', class: 'on', 'aria-selected': 'true', onclick: (e) => e.preventDefault() }, 'Mixed'));
  return h('div', { class: 'outlook-bar' }, h('span', { class: 'ob-label' }, label), h('nav', { class: 'seg', 'aria-label': label }, items));
}

/** Per-class selects for market outlooks. */
export function outlookSelects(current, onPick) {
  const oc = outlooks();
  return h('div', { class: 'outlook-grid' }, P.MARKET.map((k) => h('label', { class: 'field' }, h('span', null, P.classOf(k).label),
    h('select', { onchange: (e) => onPick(k, e.target.value) }, oc.map((o) => h('option', { value: o.id, selected: o.id === (current[k] || 'steady') }, `${o.name} (${pc(o.rate, 0)} a year)`))))));
}

const pctIn = (x) => (x == null || x === '' ? '' : Math.round(x * 10000) / 100);
const frac = (x) => (x == null || x === '' ? 0 : Number(x) / 100);

/** Target and everyday numbers of a plan. */
export function planForm(plan) {
  const a = plan.a, r = a.rates || {};
  const base = P.baseline(S.data, S.all);
  formDialog({
    title: `Plan ${plan.year}: target and assumptions`, saveLabel: 'Save',
    value: { target: plan.target, salary: a.salary, otherIncome: a.otherIncome, expenses: a.expenses, emi: a.emi, pfAdd: a.pfAdd, bonds: pctIn(r.bonds), lending: pctIn(r.lending), fds: pctIn(r.fds), pf: pctIn(r.pf), chits: pctIn(r.chits), lic: pctIn(r.lic), cash: pctIn(r.cash), other: pctIn(r.other) },
    fields: [
      { key: 'target', label: `Net worth I want by December ${plan.year} (₹)`, type: 'number', required: true, hint: `Net worth today is ${money(base.net)}.` },
      { key: 'salary', label: 'Salary each month, take-home (₹)', type: 'number', half: true, hint: 'Default: average of the last 3 months.' },
      { key: 'otherIncome', label: 'Other income each month (₹)', type: 'number', half: true, hint: 'Rent, dividends and so on. Interest from bonds and lending is added automatically.' },
      { key: 'expenses', label: 'Everyday expenses each month (₹)', type: 'number', half: true, hint: 'Default: average of the last 6 months, without EMI and tax.' },
      { key: 'emi', label: 'Loan EMI each month (₹)', type: 'number', half: true },
      { key: 'pfAdd', label: 'Added to EPF each month (₹)', type: 'number', hint: 'Your share and the employer’s. It does not pass through the bank.' },
      { key: 'bonds', label: 'Bonds: yearly interest (%)', type: 'number', half: true }, { key: 'lending', label: 'Private lending: yearly interest (%)', type: 'number', half: true },
      { key: 'fds', label: 'FDs and compounding loans (%)', type: 'number', half: true }, { key: 'pf', label: 'EPF and PPF (%)', type: 'number', half: true },
      { key: 'chits', label: 'Chits (%)', type: 'number', half: true }, { key: 'lic', label: 'Insurance and recurring deposits (%)', type: 'number', half: true },
      { key: 'cash', label: 'Cash in banks (%)', type: 'number', half: true }, { key: 'other', label: 'Others (%)', type: 'number', half: true },
    ],
    onSave: (v) => mutate((d) => {
      const p = ensure(d).years[plan.id];
      p.target = v.target;
      Object.assign(p.a, { salary: v.salary || 0, otherIncome: v.otherIncome || 0, expenses: v.expenses || 0, emi: v.emi || 0, pfAdd: v.pfAdd || 0 });
      p.a.rates = { ...p.a.rates, bonds: frac(v.bonds), lending: frac(v.lending), fds: frac(v.fds), pf: frac(v.pf), chits: frac(v.chits), lic: frac(v.lic), cash: frac(v.cash), other: frac(v.other) };
    }),
  });
}

/** A one-off income or expense: tax, school fees, a trip, a bonus. */
export function oneOffForm(plan, o) {
  const isNew = !o;
  const from = plan.baseline.month, to = `${plan.year}-12`;
  const months = monthRange(from, to);
  const mm = (x) => (x && x.length === 2 ? x : x ? x.slice(5) : '');
  formDialog({
    title: isNew ? 'Add a one-time item' : 'Edit ' + o.name, saveLabel: isNew ? 'Add' : 'Save', deleteMessage: 'Remove this item from the plan?',
    value: o ? { name: o.name, kind: o.kind, month: o.month.length === 2 ? plan.year + '-' + o.month : o.month, amount: o.amount, repeat: o.month.length === 2 } : { kind: 'expense', month: months[Math.min(months.length - 1, 1)], repeat: false },
    fields: [
      { key: 'name', label: 'What', required: true, hint: 'For example Tax, School fees, Vacation, Insurance, Bonus.' },
      { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Money going out' }, { value: 'income', label: 'Money coming in' }] },
      { key: 'month', label: 'Month', type: 'select', options: months.map((m) => ({ value: m, label: monthLabel(m) })) },
      { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { key: 'repeat', label: 'It happens in this month every year', type: 'checkbox', hint: 'Used in the Years ahead projection too.' },
    ],
    onSave: (v) => mutate((d) => {
      const p = ensure(d).years[plan.id]; p.a.oneOffs = p.a.oneOffs || [];
      const rec = { name: v.name, kind: v.kind, amount: v.amount, month: v.repeat ? mm(v.month) : v.month };
      if (isNew) p.a.oneOffs.push({ id: 'o' + (Math.max(0, ...p.a.oneOffs.map((x) => Number(String(x.id).replace(/\D/g, '')) || 0)) + 1), ...rec });
      else Object.assign(p.a.oneOffs.find((x) => x.id === o.id), rec);
    }),
    onDelete: isNew ? null : () => mutate((d) => { const p = ensure(d).years[plan.id]; p.a.oneOffs = p.a.oneOffs.filter((x) => x.id !== o.id); }),
  });
}

/** New money going into an asset class every month. Market-linked lines can have their own outlook. */
export function investForm(plan, l) {
  const isNew = !l;
  const months = monthRange(plan.baseline.month, `${plan.year}-12`).slice(1);
  const classes = P.CLASSES.filter((c) => c.key !== 'cash');
  formDialog({
    title: isNew ? 'Add a monthly investment' : 'Edit ' + l.name, saveLabel: isNew ? 'Add' : 'Save', deleteMessage: 'Remove this investment from the plan?',
    value: l ? { name: l.name, cls: l.cls, monthly: l.monthly, from: l.from || '', to: l.to || '', outlook: l.outlook || '', rate: l.rate == null ? '' : pctIn(l.rate) } : { cls: 'bonds', from: '', to: '', outlook: '', rate: '' },
    fields: [
      { key: 'name', label: 'Name', required: true, hint: 'For example Navi bond, Index fund SIP, Gold coins.' },
      { key: 'cls', label: 'Goes into', type: 'select', options: classes.map((c) => ({ value: c.key, label: c.label + (c.kind === 'market' ? ' (market-linked)' : '') })) },
      { key: 'monthly', label: 'Amount each month (₹)', type: 'number', required: true },
      { key: 'from', label: 'Starting month (empty = from the next month)', type: 'select', options: [{ value: '', label: 'From the next month' }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))], half: true },
      { key: 'to', label: 'Last month (empty = until December)', type: 'select', options: [{ value: '', label: 'Until December' }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))], half: true },
      { key: 'outlook', label: 'Outlook for this money (market-linked only)', type: 'select', showIf: (v) => P.isMarket(v.cls), options: [{ value: '', label: 'Same as the class outlook' }, ...outlooks().map((o) => ({ value: o.id, label: `${o.name} (${pc(o.rate, 0)} a year)` }))], hint: 'Lets you plan fresh market money more or less boldly than what you already hold.' },
      { key: 'rate', label: 'Yearly return for this money (%), if different', type: 'number', showIf: (v) => !P.isMarket(v.cls), hint: 'Leave empty to use the class rate. For a bond, enter its interest rate.' },
    ],
    onSave: (v) => mutate((d) => {
      const p = ensure(d).years[plan.id]; p.a.invest = p.a.invest || [];
      const rec = { name: v.name, cls: v.cls, monthly: v.monthly, from: v.from || '', to: v.to || '' };
      if (P.isMarket(v.cls)) { rec.outlook = v.outlook || ''; rec.rate = null; } else { rec.outlook = ''; rec.rate = v.rate === '' || v.rate == null ? null : frac(v.rate); }
      if (isNew) p.a.invest.push({ id: 'i' + (Math.max(0, ...p.a.invest.map((x) => Number(String(x.id).replace(/\D/g, '')) || 0)) + 1), ...rec });
      else Object.assign(p.a.invest.find((x) => x.id === l.id), rec);
    }),
    onDelete: isNew ? null : () => mutate((d) => { const p = ensure(d).years[plan.id]; p.a.invest = p.a.invest.filter((x) => x.id !== l.id); }),
  });
}

/** Set the outlook of all market classes (and of lines that had their own). */
export const setAllOutlook = (planId, id) => mutate((d) => { const p = ensure(d).years[planId]; for (const k of P.MARKET) p.a.outlook[k] = id; for (const l of p.a.invest || []) if (P.isMarket(l.cls)) l.outlook = ''; });
