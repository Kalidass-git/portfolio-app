// Small DOM and formatting helpers shared by every screen.
import { S } from './store.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only used with trusted, static markup
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);

/** Current route from the address bar: #/cash/ledger?x=1 -> { name:'cash', sub:'ledger', query } */
export function route() {
  const [path, q] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, sub] = path.split('/');
  return { name: name || 'home', sub: sub || '', query: new URLSearchParams(q || '') };
}
/** Tabs inside a page (second level). Real links, so the back button and a page refresh keep your place. */
export function segTabs(items, current, label = 'Sections') {
  const { name } = route();
  return h('nav', { class: 'seg', role: 'tablist', 'aria-label': label },
    items.map(([k, l]) => h('a', { href: `#/${name}/${k}`, role: 'tab', 'aria-selected': k === current ? 'true' : 'false', class: k === current ? 'on' : '' }, l)));
}
/** Pick the active sub tab from the address, falling back to the first one. */
export const subTab = (keys) => { const s = route().sub; return keys.includes(s) ? s : keys[0]; };

// ---------- formatting ----------
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => (n == null || isNaN(n) ? '–' : (n < 0 ? '-' : '') + '₹' + inr.format(Math.abs(Math.round(n))));
export const num = (n, d = 0) => (n == null || isNaN(n) ? '–' : d ? inr2.format(n).replace(/\.00$/, d === 2 ? '.00' : '') : inr.format(n));
export const dec = (n, d = 2) => (n == null || isNaN(n) ? '–' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n));
/** 1.23 Cr / 4.5 L / 12,300 */
export function compact(n) {
  if (n == null || isNaN(n)) return '–';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return money(n);
}
export const pct = (n, d = 1) => (n == null || isNaN(n) ? '–' : (n * 100).toFixed(d) + '%');
export const signed = (n, f = money) => (n > 0 ? '+' : '') + f(n);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateStr = (s) => (s ? `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : '–');
export const monthLabel = (m, long = false) => `${long ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m.slice(5, 7)) - 1] : MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const posNeg = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const gainText = (n, f = money) => h('span', { class: posNeg(n) }, (n > 0 ? '▲ ' : n < 0 ? '▼ ' : '') + f(Math.abs(n)));
export const canEdit = () => S.role === 'owner';

// ---------- toast ----------
let toastTimer;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), kind === 'bad' ? 6000 : 2600);
}

// ---------- dialogs ----------
export function dialog(title, body, actions = []) {
  const dlg = h('dialog', { class: 'sheet' });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    h('header', null, h('h2', null, title), h('button', { class: 'icon', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'dlg-body' }, body),
    actions.length ? h('footer', null, actions.map((a) => h('button', { class: a.class || '', onclick: () => a.onclick(close) }, a.label))) : null,
  );
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg };
}
export function confirmDialog(message, okLabel = 'Delete') {
  return new Promise((res) => {
    dialog('Please confirm', h('p', null, message), [
      { label: 'Cancel', onclick: (c) => (c(), res(false)) },
      { label: okLabel, class: 'danger', onclick: (c) => (c(), res(true)) },
    ]);
  });
}

/** Fill a <select>. options: ['a', {value,label}, {group:'Name', options:[...]}] */
export function setOptions(sel, options, value) {
  const opt = (o) => {
    const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o;
    return h('option', { value: ov, selected: String(ov) === String(value) }, ol);
  };
  sel.replaceChildren(...options.map((o) => (o && o.group ? h('optgroup', { label: o.group }, o.options.map(opt)) : opt(o))));
  if (![...sel.options].some((o) => o.selected) && sel.options.length) sel.selectedIndex = 0;
}

/**
 * Form dialog. fields: [{key,label,type:'text'|'number'|'date'|'select'|'textarea'|'checkbox', options, required, step, hint, half, showIf(values)}]
 * onSave(values) may return false to keep the dialog open.
 */
export function formDialog({ title, fields, value = {}, onSave, onDelete, saveLabel = 'Save', deleteMessage = 'Delete this entry? This cannot be undone.' }) {
  const inputs = {}, labels = {};
  const form = h('form', { class: 'form', novalidate: true });
  for (const f of fields) {
    let input;
    const v = value[f.key] ?? f.default ?? '';
    if (f.type === 'select') {
      input = h('select', { name: f.key });
      setOptions(input, f.options || [], v);
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.key, rows: 3 }, v);
    } else if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', name: f.key, checked: !!v });
    } else {
      input = h('input', { name: f.key, type: f.type === 'number' ? 'number' : f.type || 'text', step: f.step || (f.type === 'number' ? 'any' : null), inputmode: f.type === 'number' ? 'decimal' : null, value: v, autocomplete: 'off', list: f.list || null, readonly: f.readonly || null });
    }
    inputs[f.key] = input;
    if (f.onInput) input.addEventListener('input', () => f.onInput(input, inputs));
    labels[f.key] = h('label', { class: 'field' + (f.type === 'checkbox' ? ' check' : '') + (f.half ? ' half' : '') },
      h('span', null, f.label), input, f.hint ? h('small', null, f.hint) : null);
    form.append(labels[f.key]);
  }
  const raw = () => Object.fromEntries(fields.map((f) => [f.key, f.type === 'checkbox' ? inputs[f.key].checked : inputs[f.key].value]));
  const visible = (f) => !f.showIf || f.showIf(raw());
  const refreshVisibility = () => { for (const f of fields) if (f.showIf) labels[f.key].style.display = visible(f) ? '' : 'none'; };
  form.addEventListener('input', refreshVisibility); form.addEventListener('change', refreshVisibility);
  refreshVisibility();
  const err = h('p', { class: 'form-error', role: 'alert' });
  form.append(err);
  const collect = () => {
    const out = {};
    for (const f of fields) {
      if (!visible(f)) continue;
      const el = inputs[f.key];
      let val = f.type === 'checkbox' ? el.checked : el.value;
      if (f.type === 'number') val = val === '' ? null : Number(val);
      if (f.type === 'text' || f.type === 'textarea') val = val.trim();
      if (f.required && (val === '' || val == null || Number.isNaN(val))) { err.textContent = `${f.label} is required.`; el.focus(); return null; }
      out[f.key] = val;
    }
    return out;
  };
  const submit = (close) => {
    const vals = collect();
    if (!vals) return;
    if (onSave(vals) !== false) close();
  };
  const actions = [{ label: 'Cancel', onclick: (c) => c() }];
  if (onDelete) actions.push({ label: 'Delete', class: 'danger', onclick: async (c) => { if (await confirmDialog(deleteMessage)) { if (onDelete() !== false) c(); } } });
  actions.push({ label: saveLabel, class: 'primary', onclick: submit });
  const d = dialog(title, form, actions);
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(d.close); });
  setTimeout(() => form.querySelector('input,select,textarea')?.focus(), 30);
  return d;
}

// ---------- page building blocks ----------
export const section = (title, body, actions) => h('section', { class: 'card' },
  h('header', { class: 'card-head' }, h('h2', null, title), actions ? h('div', { class: 'card-actions' }, actions) : null), body);
export const stat = (label, value, sub, cls = '') => h('div', { class: 'stat ' + cls }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), sub ? h('span', { class: 'stat-sub' }, sub) : null);
export const btn = (label, onclick, cls = '') => h('button', { class: cls, onclick, type: 'button' }, label);
export const empty = (msg) => h('p', { class: 'empty' }, msg);

/** Table. cols: [{label, get(row), cls, render(row)->node|string, total}] */
export function table(cols, rows, { onRow, footer, empty: emptyMsg = 'Nothing here yet.' } = {}) {
  if (!rows.length) return empty(emptyMsg);
  const t = h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.cls || '' }, c.label)))),
    h('tbody', null, rows.map((r) => h('tr', { class: onRow ? 'click' : '', tabindex: onRow ? 0 : null, onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRow(r)) : null },
      cols.map((c) => h('td', { class: c.cls || '', 'data-label': c.label }, c.render ? c.render(r) : c.get(r)))))),
    footer ? h('tfoot', null, h('tr', null, cols.map((c, i) => h('td', { class: c.cls || '' }, i === 0 ? footer.label || 'Total' : c.total ? c.total(rows) : '')))) : null);
  return h('div', { class: 'tbl-wrap' }, t);
}

export function monthPicker(months, value, onChange) {
  return h('select', { class: 'month-select', 'aria-label': 'Month', onchange: (e) => onChange(e.target.value) },
    months.slice().reverse().map((m) => h('option', { value: m, selected: m === value }, monthLabel(m, true))));
}

/**
 * Plain list rows instead of a table: easier to read on a phone.
 * items: [{ lead?: node, title, sub?, value, valueSub?, tone?: 'pos'|'neg'|'warn', onClick?, extra?: node }]
 */
export function rowList(items, { empty: emptyMsg = 'Nothing here yet.' } = {}) {
  if (!items.length) return empty(emptyMsg);
  return h('ul', { class: 'rl' }, items.map((it) => h('li', { class: it.onClick ? 'click' : '', tabindex: it.onClick ? 0 : null, onclick: it.onClick || null, onkeydown: it.onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), it.onClick()) : null },
    it.lead ? h('span', { class: 'rl-lead' }, it.lead) : null,
    h('span', { class: 'rl-main' }, h('span', { class: 'rl-title' }, it.title), it.sub ? h('span', { class: 'rl-sub' }, it.sub) : null, it.extra || null),
    h('span', { class: 'rl-end' }, h('span', { class: 'rl-val ' + (it.tone || '') }, it.value), it.valueSub ? h('span', { class: 'rl-sub' }, it.valueSub) : null))));
}
/** Dashboard tile: small label, big number, one line of context. */
export function kpi(label, value, sub, { tone = '', href = null, spark: sp = null } = {}) {
  const el = h(href ? 'a' : 'div', { class: 'kpi' + (href ? ' link' : ''), href },
    h('span', { class: 'kpi-label' }, label), h('strong', { class: 'kpi-value ' + tone }, value), sub ? h('span', { class: 'kpi-sub' }, sub) : null, sp ? h('span', { class: 'kpi-spark' }, sp) : null);
  return el;
}
/** Calendar-style date badge: 13 / NOV */
export const dateChip = (iso) => h('span', { class: 'datechip' }, h('b', null, String(Number(iso.slice(8, 10)))), h('small', null, MON[Number(iso.slice(5, 7)) - 1].toUpperCase()));
