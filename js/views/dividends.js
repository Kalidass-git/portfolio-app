// Shares & funds → Dividends: what each company paid, this year and all time.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, dateStr, section, stat, table, btn, formDialog, canEdit, toast, setOptions } from '../ui.js';
import { hbars, barChart } from '../charts.js';
import { symKey } from '../trades.js';

let yearSel = null;
const rerender = () => window.dispatchEvent(new Event('rerender'));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Every dividend you have recorded, with a readable company name. */
export function dividendList(data) {
  const names = new Map();
  for (const s of data.stocks || []) { names.set(symKey(s.symbol), s.name); }
  for (const t of data.trades || []) if (t.name) names.set(symKey(t.symbol), t.name);
  return (data.corporateActions || []).filter((a) => a.type === 'dividend' && a.amount > 0)
    .map((a) => ({ id: a.id, symbol: a.symbol, name: a.name || names.get(symKey(a.symbol)) || a.symbol, date: a.date, amount: a.amount, year: String(a.date || '').slice(0, 4) }))
    .sort((x, y) => (x.date < y.date ? 1 : -1));
}
/** Total per company, biggest first. */
export function byCompany(list) {
  const m = new Map();
  for (const d of list) { const k = symKey(d.symbol) || norm(d.name); const r = m.get(k) || { name: d.name, symbol: d.symbol, amount: 0, count: 0 }; r.amount += d.amount; r.count++; m.set(k, r); }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

function dividendForm(row) {
  const { data } = S;
  const isNew = !row;
  const opts = (data.stocks || []).map((s) => ({ value: s.name, label: `${s.name} (${s.symbol})` }));
  let dl = document.getElementById('div-list');
  if (!dl) { dl = h('datalist', { id: 'div-list' }); document.body.append(dl); }
  dl.replaceChildren(...opts.map((o) => h('option', { value: o.value }, o.label)));
  formDialog({
    title: isNew ? 'Add dividend' : 'Edit dividend', saveLabel: isNew ? 'Add' : 'Save', value: row ? { company: row.name, date: row.date, amount: row.amount } : { date: C.todayISO() },
    deleteMessage: 'Delete this dividend entry?',
    fields: [
      { key: 'company', label: 'Company (name or symbol)', required: true, list: 'div-list', hint: 'Pick from your shares, or type a company you no longer hold.' },
      { key: 'date', label: 'Date received', type: 'date', required: true },
      { key: 'amount', label: 'Amount received (₹)', type: 'number', required: true, hint: 'After tax deducted at source, as it reached your bank.' },
    ],
    onSave: (v) => {
      const q = norm(v.company);
      const hit = (data.stocks || []).find((s) => norm(s.symbol) === q || norm(s.name) === q);
      const rec = { type: 'dividend', symbol: hit ? symKey(hit.symbol) : symKey(v.company), name: hit ? hit.name : v.company, date: v.date, amount: v.amount };
      mutate((d) => {
        d.corporateActions = d.corporateActions || [];
        if (isNew) d.corporateActions.push({ id: 'a' + (Math.max(0, ...d.corporateActions.map((a) => Number(String(a.id).replace(/\D/g, '')) || 0)) + 1), ...rec });
        else Object.assign(d.corporateActions.find((a) => a.id === row.id), rec);
      });
      toast(isNew ? 'Dividend added' : 'Saved');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.corporateActions = d.corporateActions.filter((a) => a.id !== row.id); }),
  });
}

export function render(root) {
  const { data, all } = S;
  const list = dividendList(data);
  const thisYear = String(all.asOf).slice(0, 4);
  const years = [...new Set([thisYear, ...list.map((d) => d.year)])].sort().reverse();
  if (!yearSel || (yearSel !== 'all' && !years.includes(yearSel))) yearSel = thisYear;
  const inYear = list.filter((d) => d.year === thisYear), total = list.reduce((a, d) => a + d.amount, 0), yTotal = inYear.reduce((a, d) => a + d.amount, 0);
  const add = canEdit() ? btn('Add dividend', () => dividendForm(), 'primary') : null;

  root.append(h('div', { class: 'stats' },
    stat('Received in ' + thisYear, money(yTotal), `${inYear.length} payment${inYear.length === 1 ? '' : 's'}`),
    stat('All time', money(total), `${list.length} payment${list.length === 1 ? '' : 's'} · ${byCompany(list).length} compan${byCompany(list).length === 1 ? 'y' : 'ies'}`),
    stat('Best payer this year', inYear.length ? byCompany(inYear)[0].name : '–', inYear.length ? money(byCompany(inYear)[0].amount) : 'nothing yet')));

  if (!list.length) {
    root.append(section('Dividends', h('div', null, h('p', { class: 'empty' }, 'No dividends recorded yet.'),
      h('p', { class: 'note' }, 'Add each dividend as it reaches your bank (company, date, amount). This page then shows the totals and which companies pay you most.')), add ? [add] : null));
    return;
  }
  const chart = (rows, label) => (rows.length ? hbars(rows.slice(0, 10).map((r) => ({ label: r.name, value: r.amount })), { fmt: money, colorIndex: 2 }) : h('p', { class: 'empty' }, 'No dividends ' + label + '.'));
  root.append(h('div', { class: 'grid2' },
    section('Top payers in ' + thisYear, chart(byCompany(inYear), 'in ' + thisYear)),
    section('Top payers, all time', chart(byCompany(list), 'yet'))));
  const ys = years.slice().reverse().slice(-8);
  if (ys.length > 1) root.append(section('Dividends each year', barChart({ names: ['Dividends'], fmt: money, groups: ys.map((y) => ({ label: y, title: y + ' · ' + money(list.filter((d) => d.year === y).reduce((a, d) => a + d.amount, 0)), values: [list.filter((d) => d.year === y).reduce((a, d) => a + d.amount, 0)] })) })));

  const sel = h('select', { 'aria-label': 'Year', onchange: (e) => { yearSel = e.target.value; rerender(); } });
  setOptions(sel, [{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: y, label: y }))], yearSel);
  const shown = yearSel === 'all' ? list : list.filter((d) => d.year === yearSel);
  const sum = shown.reduce((a, d) => a + d.amount, 0);
  root.append(section('Every dividend', h('div', null,
    h('div', { class: 'tbl-tools' }, h('label', { class: 'inline-label' }, 'Show ', sel), h('span', { class: 'muted' }, `${shown.length} payment${shown.length === 1 ? '' : 's'} · ${money(sum)}`)),
    table([
      { label: 'Company', host: true, get: (d) => d.name },
      { label: 'Date', mob: 'under', get: (d) => dateStr(d.date) },
      { label: 'Amount', cls: 'r', get: (d) => money(d.amount), total: () => money(sum) },
    ], shown, { footer: { label: 'Total' }, onRow: canEdit() ? (d) => dividendForm(list.find((x) => x.id === d.id)) : null, empty: 'No dividends in this year.' })), add ? [add] : null));
}
