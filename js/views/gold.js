import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { h, money, dec, dateStr, gainText, section, table, btn, formDialog, canEdit, toast, stat, num } from '../ui.js';

const rerender = () => window.dispatchEvent(new Event('rerender'));

function rateForm() {
  formDialog({
    title: 'Gold rate', value: { rate: S.data.settings.goldRate },
    fields: [{ key: 'rate', label: 'Price of 1 gram of gold (₹)', type: 'number', required: true, hint: 'Everything on this page and the dashboard is valued at this rate.' }],
    onSave: (v) => { mutate((d) => { d.settings.goldRate = v.rate; d.settings.goldRateDate = C.todayISO(); }); toast('Gold rate updated'); },
  });
}
function purchaseForm(p) {
  const isNew = !p;
  formDialog({
    title: isNew ? 'Add gold purchase' : 'Edit purchase', value: p || { date: C.todayISO() },
    fields: [{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'desc', label: 'What', required: true }, { key: 'grams', label: 'Weight (grams)', type: 'number', required: true }, { key: 'amount', label: 'Amount paid (₹)', type: 'number', required: true }],
    onSave: (v) => mutate((d) => { if (isNew) d.gold.purchases.push({ id: nextId('g', d.gold.purchases), ...v }); else Object.assign(d.gold.purchases.find((x) => x.id === p.id), v); d.gold.purchases.sort((a, b) => (a.date < b.date ? -1 : 1)); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.purchases = d.gold.purchases.filter((x) => x.id !== p.id); }),
  });
}
function schemeEntryForm(scheme, idx) {
  const isNew = idx == null;
  const e = isNew ? { date: C.todayISO(), amount: 75000 } : scheme.entries[idx];
  formDialog({
    title: (isNew ? 'Add instalment to ' : 'Edit instalment in ') + scheme.name, value: e,
    fields: [{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'amount', label: 'Amount paid (₹)', type: 'number', required: true }, { key: 'rate', label: 'Gold rate that day (₹/gram)', type: 'number', required: true, hint: 'Grams are worked out as amount ÷ rate.' }],
    onSave: (v) => mutate((d) => {
      const s = d.gold.schemes.find((x) => x.id === scheme.id);
      const rec = { date: v.date, amount: v.amount, rate: v.rate, grams: Math.round((v.amount / v.rate) * 1000) / 1000 };
      if (isNew) s.entries.push(rec); else s.entries[idx] = rec;
      s.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
    }),
    onDelete: isNew ? null : () => mutate((d) => d.gold.schemes.find((x) => x.id === scheme.id).entries.splice(idx, 1)),
  });
}
function jewelForm(j) {
  const isNew = !j;
  formDialog({
    title: isNew ? 'Add jewellery' : 'Edit ' + j.name, value: j || {},
    fields: [{ key: 'name', label: 'Item', required: true }, { key: 'grams', label: 'Weight (grams)', type: 'number', required: true }],
    onSave: (v) => mutate((d) => { if (isNew) d.gold.jewellery.push({ id: nextId('j', d.gold.jewellery), ...v }); else Object.assign(d.gold.jewellery.find((x) => x.id === j.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.jewellery = d.gold.jewellery.filter((x) => x.id !== j.id); }),
  });
}
function otherForm(o) {
  const isNew = !o;
  formDialog({
    title: isNew ? 'Add other holding' : 'Edit ' + o.name, value: o || {},
    fields: [{ key: 'name', label: 'Name', required: true, hint: 'Deposits and other money that is not in any other section.' }, { key: 'amount', label: 'Amount (₹)', type: 'number', required: true }],
    onSave: (v) => mutate((d) => { if (isNew) d.gold.others.push({ id: nextId('o', d.gold.others), ...v }); else Object.assign(d.gold.others.find((x) => x.id === o.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.others = d.gold.others.filter((x) => x.id !== o.id); }),
  });
}

export function render() {
  const { all, data } = S;
  const g = all.gold;
  const root = h('div', { class: 'page' });
  root.append(h('div', { class: 'stats' },
    stat('Gold value', money(g.value), `${dec(g.grams, 2)} g · ${dec(g.grams / 8, 1)} sovereigns (8 g)`),
    stat('Gain on gold', h('span', { class: g.value - g.invested >= 0 ? 'pos' : 'neg' }, money(g.value - g.invested)), `paid ${money(g.invested)}`),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Gold rate'), h('strong', { class: 'stat-value' }, money(g.rate) + ' / g'), h('span', { class: 'stat-sub' }, 'set on ' + dateStr(data.settings.goldRateDate), canEdit() ? btn('Update rate', rateForm, 'small') : null))));

  root.append(section('Gold purchases',
    table([
      { label: 'Date', get: (p) => dateStr(p.date) }, { label: 'What', get: (p) => p.desc },
      { label: 'Grams', cls: 'r', get: (p) => dec(p.grams, 2), total: () => dec(g.main.grams, 2) },
      { label: 'Paid', cls: 'r', get: (p) => money(p.amount), total: () => money(g.main.invested) },
      { label: 'Rate paid / g', cls: 'r', get: (p) => (p.grams ? money(p.amount / p.grams) : '–') },
      { label: 'Value now', cls: 'r', get: (p) => money(p.grams * g.rate), total: () => money(g.main.value) },
      { label: 'Gain', cls: 'r', render: (p) => gainText(p.grams * g.rate - p.amount), total: () => money(g.main.gain) },
    ], data.gold.purchases.slice().reverse().map((p) => p), { footer: { label: 'Total' }, onRow: canEdit() ? (p) => purchaseForm(data.gold.purchases.find((x) => x.id === p.id)) : null }),
    canEdit() ? [btn('Add purchase', () => purchaseForm(), 'primary')] : null));

  const sch = data.gold.schemes.find((s) => s.active);
  if (sch) {
    const ents = g.scheme.entries;
    root.append(section(sch.name + ' (monthly gold savings)',
      h('div', null, table([
        { label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Paid', cls: 'r', get: (e) => money(e.amount), total: () => money(g.scheme.invested) },
        { label: 'Rate / g', cls: 'r', get: (e) => money(e.rate) }, { label: 'Grams', cls: 'r', get: (e) => dec(e.grams, 3), total: () => dec(g.scheme.grams, 3) },
        { label: 'Value now', cls: 'r', get: (e) => money(e.grams * g.rate), total: () => money(g.scheme.value) },
      ], ents.map((e, i) => ({ ...e, _i: i })).reverse(), { footer: { label: 'Total' }, onRow: canEdit() ? (e) => schemeEntryForm(sch, e._i) : null }),
        h('p', { class: 'note' }, 'Earlier GRT accounts (2, 3 and 4) were converted into the purchases above, so they are not counted twice.')),
      canEdit() ? [btn('Add instalment', () => schemeEntryForm(sch), 'primary')] : null));
  }

  root.append(section('Jewellery list',
    h('div', null, table([
      { label: 'Item', get: (j) => j.name }, { label: 'Grams', cls: 'r', get: (j) => dec(j.grams, 1), total: () => dec(g.jewellery.grams, 1) },
      { label: 'Value now', cls: 'r', get: (j) => money(j.grams * g.rate), total: () => money(g.jewellery.value) },
    ], data.gold.jewellery, { footer: { label: 'Total' }, onRow: canEdit() ? (j) => jewelForm(data.gold.jewellery.find((x) => x.id === j.id)) : null }),
      h('p', { class: 'note' }, 'This list is for reference. As in your workbook, it is not added to net worth.')),
    canEdit() ? [btn('Add item', () => jewelForm(), 'primary')] : null));

  root.append(section('Other holdings (deposits)',
    table([{ label: 'Name', get: (o) => o.name }, { label: 'Amount', cls: 'r', get: (o) => money(o.amount), total: () => money(g.othersTotal) }],
      data.gold.others, { footer: { label: 'Total' }, onRow: canEdit() ? (o) => otherForm(data.gold.others.find((x) => x.id === o.id)) : null }),
    canEdit() ? [btn('Add', () => otherForm(), 'primary')] : null));
  return root;
}
