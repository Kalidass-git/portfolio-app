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
const MASK = '₹ ••••';
/** Figures are hidden until the eye icon is tapped (S.masked is true each time the app opens). */
export const isMasked = () => S.masked !== false;
export const money = (n) => (n == null || isNaN(n) ? '–' : isMasked() ? MASK : (n < 0 ? '-' : '') + '₹' + inr.format(Math.abs(Math.round(n))));
export const num = (n, d = 0) => (n == null || isNaN(n) ? '–' : d ? inr2.format(n).replace(/\.00$/, d === 2 ? '.00' : '') : inr.format(n));
export const dec = (n, d = 2) => (n == null || isNaN(n) ? '–' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n));
/** 1.23 Cr / 4.5 L / 12,300 */
export function compact(n) {
  if (n == null || isNaN(n)) return '–';
  if (isMasked()) return MASK;
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
    dialog('Please confirm', h('div', null, message && message.nodeType ? message : h('p', null, message)), [
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
export function formDialog({ title, fields, value = {}, onSave, onDelete, extraActions = [], saveLabel = 'Save', deleteMessage = 'Delete this entry? This cannot be undone.' }) {
  const inputs = {}, labels = {};
  const form = h('form', { class: 'form', novalidate: true });
  for (const f of fields) {
    let input;
    let v = value[f.key] ?? f.default ?? '';
    if (f.type === 'date' && v === '' && f.required) { const n = new Date(); v = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
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
    if (f.type === 'date' && v) input.value = v;
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
  // The confirmation names what is about to go, so a wrong tap is easy to spot.
  const summary = () => {
    const rows = [];
    for (const f of fields) {
      if (f.type === 'checkbox' || !visible(f)) continue;
      const el = inputs[f.key]; let v = el.value;
      if (el.tagName === 'SELECT') v = el.selectedOptions[0] ? el.selectedOptions[0].textContent : '';
      if (v === '' || v == null) continue;
      rows.push(h('li', null, h('span', { class: 'muted' }, f.label.replace(/\s*\(.*\)\s*$/, '') + ': '), String(v).slice(0, 80)));
      if (rows.length >= 5) break;
    }
    return h('div', null, h('p', null, deleteMessage), rows.length ? h('ul', { class: 'del-sum' }, rows) : null, h('p', { class: 'note' }, 'A restore point is saved every day, so a mistake can be undone from Settings.'));
  };
  if (onDelete) actions.push({ label: 'Delete', class: 'danger', onclick: async (c) => { if (await confirmDialog(summary(), 'Yes, delete')) { if (onDelete() !== false) c(); } } });
  for (const a of extraActions) actions.push({ label: a.label, class: a.class || '', onclick: (c) => { c(); a.onclick(); } });
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
const ICONS = {
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', refresh: 'M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  swap: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3', download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3', check: 'M5 12l5 5L20 7',
};
export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.plus); s.append(p);
  return s;
}
/** Which icon suits a button label, if any. Buttons without a clear icon stay as words. */
const iconFor = (l) => (/^(Add|Record|Buy)\b/.test(l) ? 'plus' : /^Sell\b/.test(l) ? 'minus' : /^Transfer\b/.test(l) ? 'swap' : /^(Edit|Change)\b/.test(l) ? 'edit'
  : /^Download\b/.test(l) ? 'download' : /^Upload\b/.test(l) ? 'upload' : /^(Refresh|Sync)\b/.test(l) ? 'refresh' : /^Fetch\b/.test(l) ? 'download' : /^Copy\b/.test(l) ? 'copy' : null);
/** Button. In page headers on a phone, buttons with an icon show only the icon (keep: true keeps the words). */
export const btn = (label, onclick, cls = '', { keep = false } = {}) => {
  const ic = keep ? null : iconFor(label);
  if (!ic) return h('button', { class: cls, onclick, type: 'button' }, label);
  return h('button', { class: (cls + ' ib').trim(), onclick, type: 'button', 'aria-label': label, title: label }, h('span', { class: 'ic' }, icon(ic)), h('span', { class: 'lb' }, label));
};
export const empty = (msg) => h('p', { class: 'empty' }, msg);

/** Table. cols: [{label, get(row), cls, render(row)->node|string, total}] */
/**
 * A table that stays readable on a phone.
 * Column options for small screens (under 700px):
 *   mob: 'under'  the value moves to a small grey line under the main (first or `host`) column
 *   mob: 'hide'   the column is left out (the "All columns" button brings it back)
 *   mlabel        short text put before an 'under' value, such as 'rate '
 *   mu(row)       what to show in the small line when it should differ from the cell
 *   host: true    the column that carries the small line (default: the first)
 */
export function table(cols, rows, { onRow, footer, rowClass, empty: emptyMsg = 'Nothing here yet.' } = {}) {
  if (!rows.length) return empty(emptyMsg);
  const small = (c) => (c.mob === 'under' || c.mob === 'hide' ? ' hide-sm' : '');
  let hostI = cols.findIndex((c) => c.host); if (hostI < 0) hostI = 0;
  const unders = cols.filter((c) => c.mob === 'under');
  const fit = cols.some((c) => c.mob);
  const cell = (c, r) => (c.render ? c.render(r) : c.get(r));
  const underLine = (r) => {
    const parts = unders.map((c) => { const v = c.mu ? c.mu(r) : cell(c, r); return v == null || v === '' || v === '–' ? null : [c.mlabel || '', v]; }).filter(Boolean);
    return parts.length ? h('div', { class: 'm-under sub2' }, parts.map((p, i) => [i ? ' · ' : '', p[0], p[1]])) : null;
  };
  const t = h('table', { class: 'tbl' + (fit ? ' fit' : '') },
    h('thead', null, h('tr', null, cols.map((c, i) => h('th', { class: (c.cls || '') + small(c) + (i === hostI ? ' host' : '') }, c.label)))),
    h('tbody', null, rows.map((r) => h('tr', { class: (onRow ? 'click ' : '') + (rowClass ? rowClass(r) || '' : ''), tabindex: onRow ? 0 : null, onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRow(r)) : null },
      cols.map((c, i) => h('td', { class: (c.cls || '') + small(c) + (i === hostI ? ' host' : ''), 'data-label': c.label }, cell(c, r), i === hostI ? underLine(r) : null))))),
    footer ? h('tfoot', null, h('tr', null, cols.map((c, i) => h('td', { class: (c.cls || '') + small(c) + (i === hostI ? ' host' : '') }, i === hostI ? footer.label || 'Total' : c.total ? c.total(rows) : '')))) : null);
  const wrap = h('div', { class: 'tbl-wrap' }, t);
  if (!fit) return wrap;
  const outer = h('div', { class: 'tbl-outer' });
  const tog = h('button', { type: 'button', class: 'small m-toggle', 'aria-pressed': 'false', onclick: () => { const on = outer.classList.toggle('show-all'); tog.textContent = on ? 'Fewer columns' : 'All columns'; tog.setAttribute('aria-pressed', String(on)); } }, 'All columns');
  outer.append(tog, wrap);
  return outer;
}

/**
 * Months split by year so the list starts with this year: this year's months, the last few months of last year, then everything earlier.
 * Returns [{ label, months }] (newest first). A single group has label ''.
 */
export function monthGroups(months, selected) {
  const y = Number(String((S.all && S.all.asOf) || new Date().toISOString()).slice(0, 4));
  const nowKey = String((S.all && S.all.asOf) || new Date().toISOString()).slice(0, 7);
  const list = [...new Set([...months, nowKey])].sort().reverse();
  const cur = list.filter((m) => m.startsWith(String(y))), prev = list.filter((m) => m.startsWith(String(y - 1)) && m.slice(5) >= '09');
  const rest = list.filter((m) => !cur.includes(m) && !prev.includes(m));
  // keep whatever is chosen visible even if it is older
  const g = [{ label: String(y), months: cur }, { label: 'Late ' + (y - 1), months: prev }, { label: 'Earlier', months: rest }].filter((x) => x.months.length);
  return g.length > 1 ? g : g.map((x) => ({ label: '', months: x.months }));
}
/** <option> / <optgroup> nodes for a month select. */
export function monthOptions(months, selected, fmt = (m) => monthLabel(m, true)) {
  const opt = (m) => h('option', { value: m, selected: m === selected }, fmt(m));
  return monthGroups(months, selected).map((g) => (g.label ? h('optgroup', { label: g.label }, g.months.map(opt)) : g.months.map(opt))).flat();
}
export function monthPicker(months, value, onChange) {
  return h('select', { class: 'month-select', 'aria-label': 'Month', onchange: (e) => onChange(e.target.value) }, monthOptions(months, value));
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
