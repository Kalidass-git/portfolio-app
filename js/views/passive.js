// Spend & plan → Passive income: match passive income (bond and lending interest...) to the household's expenses, so the salary can stay invested.
// Four tabs: Overview, Allocations (drag or tap to connect), Actual vs plan, Progress. The plan is the owner's only saved data (settings.passivePlan, see passive.js).
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../passive.js';
import { h, money, compact, pct, monthLabel, section, kpi, segTabs, subTab, dialog, formDialog, toast, canEdit } from '../ui.js';

const TABS = [['overview', 'Overview'], ['allocations', 'Allocations'], ['actual', 'Actual vs plan'], ['progress', 'Progress']];
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return el; };
const PAL = ['#0f8a6a', '#3b82c4', '#c08a1e', '#8b5cf6', '#d4572e', '#2a9d8f'];
let sel = null, month = '', range = 12;   // sel: what is picked for tap-to-connect { side: 's' | 'c', id }
const tone = (cov) => (cov == null ? 'muted' : cov >= 1 ? 'pos' : cov >= 0.5 ? 'warn' : 'neg');
const KIND = { bond: 'Bond interest', lending: 'Lending interest', other: 'Other income' };
const srcColor = (al, key) => PAL[Math.max(0, al.sources.findIndex((s) => s.key === key)) % PAL.length];

// ---------- small pieces ----------
function ring(value, size = 84) {
  const v = Math.max(0, Math.min(1, value || 0)), r = size / 2 - 7, c = 2 * Math.PI * r;
  return svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'pi-ring ' + tone(value), role: 'img', 'aria-label': value == null ? 'No coverage yet' : `${Math.round(value * 100)} percent covered` },
    svg('circle', { cx: size / 2, cy: size / 2, r, class: 'pi-ring-bg' }),
    svg('circle', { cx: size / 2, cy: size / 2, r, class: 'pi-ring-fg', 'stroke-dasharray': `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }),
    svg('text', { x: size / 2, y: size / 2 + 5, 'text-anchor': 'middle', class: 'pi-ring-t' }, value == null ? '–' : Math.round(value * 100) + '%'));
}
const bar = (frac, cls = '') => h('span', { class: 'pi-bar ' + cls }, h('i', { style: { width: Math.max(0, Math.min(1, frac || 0)) * 100 + '%' } }));
const chip = (text, cls) => h('span', { class: 'pi-chip ' + cls }, text);

/** Income against expenses for the last months, as two lines. */
function trend(hist, height = 150) {
  const W = 560, H = height, pl = 52, pb = 22, pt = 10, pr = 10, max = Math.max(1, ...hist.flatMap((r) => [r.received, r.spent])) * 1.1, n = hist.length;
  const x = (i) => pl + (n < 2 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (n - 1)), y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const line = (key, cls) => svg('polyline', { class: 'pi-ln ' + cls, points: hist.map((r, i) => `${x(i)},${y(r[key])}`).join(' '), fill: 'none' });
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pi-trend', role: 'img', 'aria-label': 'Passive income received and expenses by month' });
  for (const f of [0, 0.5, 1]) s.append(svg('line', { x1: pl, x2: W - pr, y1: y(max * f / 1.1), y2: y(max * f / 1.1), class: 'pi-grid' }), svg('text', { x: pl - 6, y: y(max * f / 1.1) + 4, 'text-anchor': 'end', class: 'pi-ax' }, compact(max * f / 1.1)));
  s.append(line('spent', 'exp'), line('received', 'inc'));
  hist.forEach((r, i) => { s.append(svg('circle', { cx: x(i), cy: y(r.spent), r: 3, class: 'pi-dot exp' }), svg('circle', { cx: x(i), cy: y(r.received), r: 3, class: 'pi-dot inc' }), svg('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'pi-ax' }, monthLabel(r.month).slice(0, 3))); });
  return s;
}

// ---------- the match board: income on the left, expenses on the right, connections between ----------
function board(al, editable) {
  const wrap = h('div', { class: 'pb' + (editable ? ' edit' : '') });
  const left = h('div', { class: 'pb-col' }), right = h('div', { class: 'pb-col' }), over = svg('svg', { class: 'pb-svg', 'aria-hidden': 'false' });
  const cards = new Map();   // 's:key' / 'c:name' -> element
  const hint = h('p', { class: 'pb-hint', 'aria-live': 'polite' });
  const setHint = () => { hint.textContent = !editable ? '' : sel ? (sel.side === 's' ? 'Now tap the expense it should pay for.' : 'Now tap the income that should pay for it.') + ' Tap it again to cancel.' : 'Drag an income dot onto an expense, or tap one on each side.'; };
  const pick = (side, id) => {
    if (!editable) return;
    if (!sel) sel = { side, id }; else if (sel.side === side) sel = sel.id === id ? null : { side, id };
    else { const s = side === 'c' ? sel.id : id, c = side === 'c' ? id : sel.id; sel = null; refresh(); allocate(al, s, c); return; }
    refresh();
  };
  const refresh = () => { for (const [k, el] of cards) el.classList.toggle('sel', !!sel && k === sel.side + ':' + sel.id); setHint(); };
  for (const s of al.sources) {
    const frac = s.monthly > 0 ? s.allocated / s.monthly : 0, col = srcColor(al, s.key);
    const dot = h('span', { class: 'pb-dot', style: { '--c': col }, title: editable ? 'Drag onto an expense' : null });
    const card = h('div', { class: 'pb-card pb-s' + (s.over > 0.5 ? ' bad' : s.remaining < 1 && s.monthly > 0 ? ' done' : ''), tabindex: editable ? '0' : null, role: editable ? 'button' : null, style: { '--c': col },
      onclick: () => pick('s', s.key), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick('s', s.key); } } },
      h('span', { class: 'pb-t' }, h('b', null, s.name), h('small', null, s.members ? s.sub : `${KIND[s.kind]} · ${P.FREQ_LABEL[s.freq]}`)),
      h('span', { class: 'pb-n' }, money(s.monthly), h('small', null, ' / month')),
      bar(frac, s.over > 0.5 ? 'bad' : ''),
      h('span', { class: 'pb-r' }, s.over > 0.5 ? `Over-allocated by ${money(s.over)}` : `${money(s.allocated)} allocated · ${money(Math.max(0, s.remaining))} left`), dot);
    cards.set('s:' + s.key, card); left.append(card);
    s.dot = dot;
  }
  for (const c of al.cats) {
    const full = c.base > 0 && c.funded >= c.base - 0.5, st = c.funded === 0 ? (c.base > 0 ? 'none' : 'idle') : full ? 'full' : 'part';
    const card = h('div', { class: 'pb-card pb-c ' + st, 'data-cat': c.name, tabindex: editable ? '0' : null, role: editable ? 'button' : null,
      onclick: () => pick('c', c.name), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick('c', c.name); } } },
      h('span', { class: 'pb-dot c' }),
      h('span', { class: 'pb-t' }, h('b', null, h('i', { class: 'pb-rank', title: 'Paid in this order' }, c.rank), c.name), h('small', null, c.base > 0 ? `Usually ${money(c.base)} a month` : 'Nothing spent lately')),
      h('span', { class: 'pb-n' }, money(c.funded)),
      bar(c.base > 0 ? c.funded / c.base : 0, st === 'full' ? 'ok' : st === 'part' ? 'mid' : 'bad'),
      chip(st === 'full' ? (c.extra > 0.5 ? 'Funded · ' + money(c.extra) + ' extra' : 'Funded') : st === 'part' ? 'Needs ' + money(c.need) : st === 'none' ? 'Unmapped' : 'Not set', st === 'full' ? 'ok' : st === 'part' ? 'mid' : st === 'none' ? 'bad' : 'idle'));
    cards.set('c:' + c.name, card); right.append(card);
  }
  wrap.append(left, h('div', { class: 'pb-mid' }), right, over);
  if (!al.sources.length) left.append(h('p', { class: 'note' }, 'No passive income found yet. Add a bond or an interest income line, or add other income below.'));
  if (!al.cats.length) right.append(h('p', { class: 'note' }, 'No expense categories found in your bank entries yet.'));

  const at = (el) => { const a = wrap.getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2, r: b.right - a.left, l: b.left - a.left }; };
  const curve = (x1, y1, x2, y2) => { const dx = Math.max(20, (x2 - x1) / 2); return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`; };
  let ghost = null;
  const layout = () => {
    over.replaceChildren();
    const box = wrap.getBoundingClientRect(); if (!box.width) return;
    over.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`); over.setAttribute('width', box.width); over.setAttribute('height', box.height);
    const maxA = Math.max(1, ...al.links.map((l) => l.amount));
    for (const l of al.links) {
      const sc = cards.get('s:' + l.src), cc = cards.get('c:' + l.cat); if (!sc || !cc) continue;
      const a = at(sc.querySelector('.pb-dot')), b = at(cc.querySelector('.pb-dot')), col = srcColor(al, l.src), w = 2 + (l.amount / maxA) * 5;
      const g = svg('g', { class: 'pb-link', tabindex: editable ? '0' : null, role: editable ? 'button' : null, 'aria-label': `${l.cat} paid by ${(al.sources.find((s) => s.key === l.src) || {}).name}: ${l.amount} a month. ${editable ? 'Activate to edit.' : ''}` },
        svg('path', { d: curve(a.x, a.y, b.x, b.y), stroke: col, 'stroke-width': w, class: 'pb-path', fill: 'none' }));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, t = compact(l.amount), tw = Math.max(36, t.length * 6.6 + 14);
      g.append(svg('rect', { x: mx - tw / 2, y: my - 10, width: tw, height: 20, rx: 10, class: 'pb-pill', stroke: col }), svg('text', { x: mx, y: my + 4, 'text-anchor': 'middle', class: 'pb-pt' }, t));
      if (editable) { g.addEventListener('click', () => allocate(al, l.src, l.cat)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') allocate(al, l.src, l.cat); }); }
      over.append(g);
    }
    ghost = svg('path', { class: 'pb-ghost', fill: 'none', style: 'display:none' }); over.append(ghost);
  };
  // dragging an income dot onto an expense
  if (editable) for (const s of al.sources) {
    const dot = s.dot; let drag = null;
    dot.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { dot.setPointerCapture(e.pointerId); } catch { /* not supported */ } drag = { x: e.clientX, y: e.clientY, moved: false }; });
    dot.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      if (!drag.moved) { drag.moved = true; sel = { side: 's', id: s.key }; refresh(); wrap.classList.add('dragging'); }
      const box = wrap.getBoundingClientRect(), a = at(dot);
      ghost.style.display = ''; ghost.setAttribute('d', curve(a.x, a.y, e.clientX - box.left, e.clientY - box.top)); ghost.setAttribute('stroke', srcColor(al, s.key));
      drag.cx = e.clientX; drag.cy = e.clientY; if (!drag.raf) drag.raf = requestAnimationFrame(function tick() {   // near the top or bottom edge the page scrolls, so an expense off screen can still be reached
        if (!drag) return; const H = window.innerHeight, dy = drag.cy < 90 ? -12 : drag.cy > H - 90 ? 12 : 0; drag.raf = 0;
        if (dy) { window.scrollBy(0, dy); const box2 = wrap.getBoundingClientRect(), a2 = at(dot); ghost.setAttribute('d', curve(a2.x, a2.y, drag.cx - box2.left, drag.cy - box2.top)); const o3 = document.elementFromPoint(drag.cx, drag.cy), c3 = o3 && o3.closest && o3.closest('.pb-c'); for (const el of wrap.querySelectorAll('.pb-c.drop')) if (el !== c3) el.classList.remove('drop'); if (c3) c3.classList.add('drop'); drag.raf = requestAnimationFrame(tick); }
      });
      const over2 = document.elementFromPoint(e.clientX, e.clientY), cat = over2 && over2.closest && over2.closest('.pb-c');
      for (const el of wrap.querySelectorAll('.pb-c.drop')) if (el !== cat) el.classList.remove('drop');
      if (cat) cat.classList.add('drop');
    });
    const end = (e) => {
      if (!drag) return; const d = drag; drag = null; wrap.classList.remove('dragging'); if (ghost) ghost.style.display = 'none';
      const target = wrap.querySelector('.pb-c.drop'); wrap.querySelectorAll('.pb-c.drop').forEach((el) => el.classList.remove('drop'));
      if (!d.moved) { pick('s', s.key); return; }
      if (target && e.type === 'pointerup') { sel = null; refresh(); allocate(al, s.key, target.dataset.cat); } else { sel = null; refresh(); }
    };
    dot.addEventListener('pointerup', end); dot.addEventListener('pointercancel', end);
  }
  const redo = () => requestAnimationFrame(layout);
  setHint(); refresh();
  requestAnimationFrame(() => { layout(); if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => { if (!wrap.isConnected) { ro.disconnect(); return; } layout(); }); ro.observe(wrap); } });
  window.addEventListener('resize', redo);
  return h('div', null, editable ? hint : null, wrap);
}

// ---------- setting an allocation ----------
/** The amount sheet: how much of a source goes to a category. Refuses more than the source has left. */
function allocate(al, srcKey, catName) {
  if (!canEdit()) return;
  const src = al.sources.find((s) => s.key === srcKey), cat = al.cats.find((c) => c.name === catName); if (!src || !cat) return;
  const ex = al.links.find((l) => l.src === srcKey && l.cat.toLowerCase() === catName.toLowerCase());
  const own = ex ? ex.amount : 0, avail = Math.max(0, Math.round(src.remaining + own)), need = Math.max(0, Math.round(cat.base - (cat.funded - own)));
  const input = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '100', value: String(ex ? ex.amount : Math.min(avail, need || avail)), class: 'pi-amt', 'aria-label': 'Amount per month' });
  const note = h('p', { class: 'pi-note' }), left = h('b'), cov = h('span');
  const chips = [['All that is left', avail], ...(need ? [['What it needs', Math.min(need, avail)]] : []), ['Half', Math.round(avail / 2 / 100) * 100]].filter((c) => c[1] > 0);
  const body = h('div', { class: 'form' },
    h('div', { class: 'pi-pair' }, h('span', { class: 'pi-dotc', style: { background: srcColor(al, srcKey) } }), h('b', null, src.name), h('span', { class: 'muted' }, '→'), h('b', null, cat.name)),
    h('label', { class: 'pi-field' }, h('span', null, 'Pays towards it each month (₹)'), input),
    h('div', { class: 'chips-row' }, chips.map(([l, v]) => h('button', { type: 'button', class: 'chip-btn', onclick: () => { input.value = String(v); check(); } }, `${l} ${money(v)}`))),
    h('div', { class: 'pi-live' }, h('span', null, `${src.name} left after this`), left), h('div', { class: 'pi-live' }, h('span', null, `${cat.name} covered`), cov), note);
  let ok = true;
  const dlg = dialog(ex ? 'Change allocation' : 'Allocate income', body, [
    { label: 'Cancel', onclick: (c) => c() },
    ...(ex ? [{ label: 'Remove', class: 'danger', onclick: (c) => { c(); setAlloc(srcKey, catName, 0); } }] : []),
    { label: 'Save allocation', class: 'primary', onclick: (c) => { if (!ok) return; c(); setAlloc(srcKey, catName, Number(input.value) || 0); } }]);
  const saveBtn = dlg.el.querySelector('footer .primary');
  function check() {
    const v = Math.max(0, Number(input.value) || 0), after = avail - v, funded = cat.funded - own + v;
    ok = v <= avail + 0.5; left.textContent = money(after); left.className = after < -0.5 ? 'neg' : '';
    cov.textContent = cat.base > 0 ? `${money(funded)} of ${money(cat.base)} (${Math.round((funded / cat.base) * 100)}%)` : money(funded); cov.className = funded >= cat.base - 0.5 && cat.base > 0 ? 'pos' : '';
    note.textContent = !ok ? `${src.name} only has ${money(avail)} left each month. Lower the amount, or free some up from another expense.` : cat.base > 0 && funded > cat.base * 1.02 ? `That is more than ${cat.name} usually costs (${money(cat.base)}). Allowed, but the extra is not needed.` : cat.base === 0 ? `Nothing was spent on ${cat.name} lately, so this will sit unused until it is.` : '';
    if (ok && !note.textContent) note.textContent = 'This is a plan. Each month the income that really arrives pays the expenses in their priority order.';
    note.className = 'pi-note ' + (!ok ? 'bad' : note.textContent.startsWith('That is more') || note.textContent.startsWith('Nothing was') ? 'warn' : '');
    if (saveBtn) saveBtn.disabled = !ok;
  }
  input.addEventListener('input', check); check(); setTimeout(() => { input.focus(); input.select(); }, 60);
}
function setAlloc(srcKey, catName, amount) {
  mutate((d) => {
    const p = P.planOf(d, S.all), i = p.alloc.findIndex((a) => a.src === srcKey && a.cat.toLowerCase() === catName.toLowerCase());
    if (amount <= 0) { if (i >= 0) p.alloc.splice(i, 1); } else if (i >= 0) p.alloc[i].amount = amount; else p.alloc.push({ id: P.newId(p.alloc, 'pa'), src: srcKey, cat: catName, amount });
    if (!p.from) p.from = C.monthKey(S.all.asOf);
    P.savePlan(d, p);
  });
  toast(amount > 0 ? 'Allocation saved' : 'Allocation removed');
}
const setPlan = (fn) => mutate((d) => { const p = P.planOf(d, S.all); fn(p); P.savePlan(d, p); });
/** Moves a category one place up or down the priority order. Saves the whole order so it stays as it is shown. */
function move(al, name, dir) {
  const names = al.cats.map((c) => c.name), i = names.indexOf(name), j = i + dir; if (i < 0 || j < 0 || j >= names.length) return;
  [names[i], names[j]] = [names[j], names[i]]; setPlan((p) => { p.order = names; });
}

/** Choose which income pays for a category (from an expense that has none), then the amount. */
function assignDialog(al, catName) {
  const options = al.sources.filter((s) => s.remaining > 0.5);
  if (!options.length) { toast('No income is left to give. Free some on the Allocations tab first.'); return; }
  const body = h('div', { class: 'pi-pick' }, options.map((s) => h('button', { type: 'button', class: 'pi-opt', onclick: () => { d.close(); allocate(al, s.key, catName); } },
    h('i', { style: { background: srcColor(al, s.key) } }), h('span', null, h('b', null, s.name), h('small', null, `${money(s.remaining)} left each month`)))));
  const d = dialog('Which income pays for ' + catName + '?', body, [{ label: 'Cancel', onclick: (c) => c() }]);
}

/** Other passive income typed in (rent, dividends...). */
function extraForm(x) {
  formDialog({ title: x ? 'Edit ' + x.name : 'Add passive income', value: x || { freq: 'monthly' },
    fields: [{ key: 'name', label: 'Name', required: true, hint: 'For example Rent from flat, Dividends.' }, { key: 'amount', label: 'Amount each time it is credited (₹)', type: 'number', required: true, half: true },
      { key: 'freq', label: 'Credited', type: 'select', half: true, options: Object.entries(P.FREQ_LABEL).map(([value, label]) => ({ value, label })) },
      { key: 'match', label: 'Find its bank credits by (optional)', hint: 'Words from the bank description. Without it the income is taken as received on time.' }],
    onSave: (v) => setPlan((p) => { const rec = { name: v.name.trim(), amount: Number(v.amount) || 0, freq: v.freq || 'monthly', match: (v.match || '').trim() }; if (x) Object.assign(p.extra.find((e) => e.id === x.extraId || e.id === x.id), rec); else p.extra.push({ id: P.newId(p.extra, 'x'), ...rec }); }),
    onDelete: x ? () => setPlan((p) => { p.extra = p.extra.filter((e) => e.id !== (x.extraId || x.id)); p.alloc = p.alloc.filter((a) => a.src !== 'x:' + (x.extraId || x.id)); }) : null });
}
/** How often an interest income line is credited (its amount is then divided to a monthly figure). */
function freqForm(s) {
  if (s.kind === 'other') { extraForm(s); return; }
  if (s.kind === 'bond') { dialog(s.name, h('div', null, h('ul', { class: 'pi-links' }, s.members.map((m) => h('li', null, h('span', null, h('b', null, m.name)), h('em', null, money(m.monthly) + ' / mo')))), h('p', { class: 'note' }, `These bonds pay ${s.freq === 'quarterly' ? 'every quarter' : 'every month'}. The planning figure is ${money(s.monthly)} a month after TDS. The payout of a bond is changed on the bond itself (Fixed income).`)), [{ label: 'Close', onclick: (c) => c() }]); return; }
  formDialog({ title: s.name, sub: 'Interest income line', value: { freq: s.freq }, fields: [{ key: 'freq', label: 'This line is credited', type: 'select', options: Object.entries(P.FREQ_LABEL).map(([value, label]) => ({ value, label })), hint: `The amount on the line is ${money(s.amount)}. Quarterly means ${money(s.amount / 3)} a month for planning.` }],
    onSave: (v) => setPlan((p) => { if (v.freq === 'monthly') delete p.freq[s.key]; else p.freq[s.key] = v.freq; }) });
}
/** Which expense categories are part of the plan. */
function catsDialog() {
  const all = P.categories(S.data, S.all), boxes = all.map((c) => h('input', { type: 'checkbox', checked: !c.skipped, value: c.name }));
  const body = h('div', { class: 'form' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Untick what the plan should leave out, such as one-time payments. It then no longer counts as an expense to fund.'),
    h('div', { class: 'count-list' }, all.map((c, i) => h('label', { class: 'count-row' }, boxes[i], h('span', { class: 'cr-name' }, c.name), h('span', { class: 'cr-amt' }, money(c.base) + ' / mo')))));
  dialog('Expenses in the plan', body, [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Save', class: 'primary', onclick: (c) => { c(); setPlan((p) => { p.skip = boxes.filter((b) => !b.checked).map((b) => b.value); }); } }]);
}

// ---------- tabs ----------
function sourceTools(al) {
  return h('div', { class: 'pi-tools' },
    canEdit() ? h('button', { type: 'button', class: 'chip-btn', onclick: () => extraForm(null) }, '+ Add other income') : null,
    canEdit() ? h('button', { type: 'button', class: 'chip-btn', onclick: catsDialog }, 'Expenses in the plan') : null,
    al.sources.length ? h('details', { class: 'pi-edit' }, h('summary', { class: 'chip-btn' }, 'Income settings'),
      h('div', { class: 'pi-edit-list' }, al.sources.map((s) => h('button', { type: 'button', class: 'pi-opt', onclick: () => (canEdit() ? freqForm(s) : null) }, h('i', { style: { background: srcColor(al, s.key) } }), h('span', null, h('b', null, s.name), h('small', null, `${P.FREQ_LABEL[s.freq]} · ${money(s.monthly)} a month`)))))) : null);
}

function overview(root, sm) {
  const { al } = sm, cov = sm.coverage, tot = al.totalIncome;
  const parts = ['bond', 'lending', 'other'].map((k) => [k, al.sources.filter((s) => s.kind === k).reduce((a, s) => a + s.monthly, 0)]).filter((x) => x[1] > 0).map(([k, v]) => `${compact(v)} ${k === 'bond' ? 'bonds' : k === 'lending' ? 'lending' : 'other'}`).join(' + ');
  root.append(h('div', { class: 'kpis pi-kpis' },
    kpi('Passive income', money(tot) + ' / mo', parts || 'Nothing yet', { tone: 'pos' }),
    kpi('Monthly expenses', money(al.expenses) + ' / mo', 'Usual, from your last months'),
    h('div', { class: 'kpi pi-cov' }, ring(cov, 76), h('div', null, h('span', { class: 'kpi-label' }, 'Coverage'), h('strong', { class: 'kpi-value ' + tone(cov) }, cov == null ? '–' : pct(cov, 1)), h('span', { class: 'kpi-sub' }, 'Target 100%'))),
    kpi('Unmapped expenses', money(sm.unmappedAmount) + ' / mo', al.unmapped.length ? `${al.unmapped.length} categor${al.unmapped.length === 1 ? 'y' : 'ies'} with no income` : 'Everything has income', { tone: al.unmapped.length ? 'neg' : 'pos', href: '#/passive/allocations' })));
  root.append(section('Allocation overview', al.sources.length || al.cats.length ? board(al, false) : h('p', { class: 'empty' }, 'Nothing to connect yet.'), h('a', { class: 'chip-btn', href: '#/passive/allocations' }, canEdit() ? 'Adjust allocation' : 'View details')));
  const gap = sm.required, goal = h('div', { class: 'pi-goal ' + tone(cov) }, h('span', { class: 'pi-goal-t' }, h('b', null, 'Goal: fund every expense from passive income'),
    h('small', null, cov == null ? 'Add your income and expenses to begin.' : cov >= 1 ? `Reached. Passive income is ${money(tot - al.expenses)} above the monthly expenses.` : `${pct(cov, 1)} covered. Another ${money(gap)} a month of passive income is needed.`)), bar(cov || 0, tone(cov)));
  const hist6 = sm.hist.slice(-6), att = P.breaches(S.data, S.all);
  root.append(h('div', { class: 'pi-two' },
    section('Passive income vs expenses', hist6.length > 1 ? h('div', null, trend(hist6), h('p', { class: 'pi-legend' }, h('span', { class: 'pi-key inc' }, 'Income received'), h('span', { class: 'pi-key exp' }, 'Expenses'))) : h('p', { class: 'empty' }, 'The trend appears after a couple of months of bank entries.')),
    section('Needs attention', attention(att, sm), null)));
  root.append(goal);
  root.append(salaryCard(sm));
}
function attention(att, sm) {
  if (!att.length) return h('p', { class: 'pi-ok' }, h('i', null, '✓'), sm.al.links.length ? 'Nothing is off. Every expense that spends has income set aside, and income is arriving.' : 'Start on the Allocations tab by connecting an income to an expense.');
  return h('ul', { class: 'pi-att' }, att.slice(0, 6).map((a) => h('li', { class: a.level }, h('i', { 'aria-hidden': 'true' }, a.level === 'red' ? '!' : '•'), h('span', null, h('b', null, a.title), h('small', null, a.note)), h('em', null, a.amount ? money(a.amount) : ''))));
}
function salaryCard(sm) {
  const r = P.salaryProtection(S.data, S.all, sm.cur, (sm.hist.length > 1 ? sm.hist[sm.hist.length - 2].reserve : 0)), none = !(r.salary > 0);
  return section('Salary protection', h('div', null,
    h('div', { class: 'pi-sal' }, h('div', null, h('small', null, 'Salary this month'), h('b', null, none ? '–' : money(r.salary))), h('div', null, h('small', null, 'Invested'), h('b', { class: 'inv' }, money(r.invested))), h('div', null, h('small', null, 'Paid expenses'), h('b', { class: r.diverted > 0 ? 'neg' : 'pos' }, money(r.diverted))), h('div', null, h('small', null, 'Salary kept'), h('b', { class: r.protectedShare == null ? '' : r.protectedShare >= 0.999 ? 'pos' : 'warn' }, r.protectedShare == null ? '–' : pct(r.protectedShare, 0)))),
    h('p', { class: 'note' }, `Passive income paid ${money(r.funded)} of ${money(r.spent)} spent so far this month. ${r.diverted > 0 ? money(r.diverted) + ' had to come from salary.' : 'No salary was needed for expenses.'}${S.data.settings.passivePlan && P.planOf(S.data).carry && sm.hist.length > 1 && sm.hist[sm.hist.length - 2].reserve > 0 ? ' A reserve of ' + money(sm.hist[sm.hist.length - 2].reserve) + ' from earlier months was available.' : ''}`)));
}

function allocations(root, sm) {
  const al = sm.al, ed = canEdit();
  root.append(h('div', { class: 'kpis pi-kpis' }, kpi('Passive income', money(al.totalIncome) + ' / mo', 'planning figure', { tone: 'pos' }), kpi('Allocated', money(al.allocated), al.totalIncome > 0 ? pct(al.allocated / al.totalIncome, 0) + ' of income' : '', { tone: al.allocated > 0 ? 'pos' : '' }),
    kpi('Unallocated', money(al.unallocated), al.unallocated > 1 ? 'not paying any expense yet' : 'all of it has a job', { tone: al.unallocated > 1 ? 'warn' : 'pos' }), kpi('Unmapped expenses', money(sm.unmappedAmount) + ' / mo', al.unmapped.length ? `${al.unmapped.length} with no income` : 'none', { tone: al.unmapped.length ? 'neg' : 'pos' })));
  root.append(section('Match income to expenses', h('div', null, board(al, ed), !ed ? h('p', { class: 'note' }, 'Only the owner can change allocations.') : null), sourceTools(al)));
  root.append(section('Payment order', h('div', null, h('p', { class: 'note', style: { marginTop: 0 } }, 'Income is used from the top. If a month brings less than planned, the first expenses are paid in full and the last ones are left short. The amounts above are only a plan; nothing is paid out automatically.'),
    h('ol', { class: 'pi-order' }, al.cats.map((c, i) => h('li', null, h('i', { class: 'pb-rank' }, c.rank), h('span', null, h('b', null, c.name), h('small', null, `${money(c.funded)} planned · usually ${money(c.base)}`)), ed ? h('span', { class: 'pi-mv' }, h('button', { type: 'button', class: 'chip-btn small', disabled: i === 0 ? '' : null, 'aria-label': 'Move ' + c.name + ' up', onclick: () => move(al, c.name, -1) }, '▲'), h('button', { type: 'button', class: 'chip-btn small', disabled: i === al.cats.length - 1 ? '' : null, 'aria-label': 'Move ' + c.name + ' down', onclick: () => move(al, c.name, 1) }, '▼')) : null))))));
  const list = al.links.slice().sort((a, b) => a.cat.localeCompare(b.cat));
  root.append(section('Connections', list.length ? h('ul', { class: 'pi-links' }, list.map((l) => { const s = al.sources.find((x) => x.key === l.src); return h('li', null, h('i', { style: { background: srcColor(al, l.src) } }), h('span', null, h('b', null, s.name), ' → ', h('b', null, l.cat)), h('em', null, money(l.amount) + ' / mo'), ed ? h('button', { type: 'button', class: 'chip-btn small', onclick: () => allocate(al, l.src, l.cat) }, 'Edit') : null); })) : h('p', { class: 'empty' }, 'No connections yet. Tap an income, then an expense.'),
    ed ? h('label', { class: 'pi-carry' }, h('input', { type: 'checkbox', checked: al.plan.carry, onchange: (e) => setPlan((p) => { p.carry = e.target.checked; }) }), h('span', null, 'Carry unused allocation to the next month')) : null));
  if (al.orphans.length) root.append(section('Needs a look', h('div', null, h('p', { class: 'note' }, 'These point to income or an expense that is gone (a bond that ended, say).'), h('ul', { class: 'pi-links' }, al.orphans.map((o) => h('li', null, h('span', null, `${o.src} → ${o.cat}`), h('em', null, money(o.amount)), ed ? h('button', { type: 'button', class: 'chip-btn small', onclick: () => setPlan((p) => { p.alloc = p.alloc.filter((a) => a.id !== o.id); }) }, 'Remove') : null))))));
}

function actual(root, sm) {
  const cur = sm.cur, plan = sm.al.plan, months = [...new Set(C.ledgerMonths(S.data).concat(cur))].filter((m) => m <= cur).slice(-18);
  if (!months.includes(month)) month = cur;
  const a = P.actualVsPlan(S.data, S.all, month), inc = P.incomeActual(S.data, S.all, month);
  const sel2 = h('select', { class: 'month-select', 'aria-label': 'Month', onchange: (e) => { month = e.target.value; window.dispatchEvent(new Event('rerender')); } }, months.slice().reverse().map((m) => h('option', { value: m, selected: m === month ? '' : null }, monthLabel(m, true) + (m === cur ? ' (so far)' : ''))));
  root.append(h('div', { class: 'pi-row' }, sel2, h('label', { class: 'pi-carry' }, h('input', { type: 'checkbox', checked: plan.carry, disabled: !canEdit() ? '' : null, onchange: (e) => setPlan((p) => { p.carry = e.target.checked; }) }), h('span', null, 'Carry unused allocation forward'))));
  const pctUsed = a.planned + a.carryIn > 0 ? a.actual / (a.planned + a.carryIn) : null;
  root.append(h('div', { class: 'kpis pi-kpis' }, kpi('Set aside', money(a.planned), a.carryIn > 0 ? '+ ' + money(a.carryIn) + ' carried' : 'from passive income'), kpi('Spent', money(a.actual), pctUsed == null ? '' : pct(pctUsed, 0) + ' of it', { tone: pctUsed > 1 ? 'neg' : '' }),
    kpi('Left', money(a.remaining), plan.carry ? 'carries to next month' : 'not carried'), kpi('Over / unmapped', money(a.over + a.unmappedAmount), a.over ? `${money(a.over)} over · ${money(a.unmappedAmount)} unmapped` : a.unmappedAmount ? 'spent with no income set aside' : 'none', { tone: a.over + a.unmappedAmount > 0 ? 'neg' : 'pos' })));
  const wf = P.monthFlow(S.data, S.all, month);
  if (wf.al.links.length) root.append(section(`This month's income, used in order`, h('div', null,
    h('p', { class: 'note', style: { marginTop: 0 } }, `${money(wf.income)} of passive income ${wf.basis === 'due' ? 'is due' : 'was credited'} against ${money(wf.planned)} allocated. It pays the first expense in the order, then the next.`),
    h('ol', { class: 'pi-order' }, wf.rows.map((r) => h('li', { class: r.short > 0.5 ? 'short' : '' }, h('i', { class: 'pb-rank' }, r.rank), h('span', null, h('b', null, r.name), h('small', null, `planned ${money(r.planned)}`)), h('span', { class: 'pi-pay' }, bar(r.planned > 0 ? r.paid / r.planned : 0, r.short > 0.5 ? (r.paid > 0 ? 'mid' : 'bad') : 'ok'), h('em', { class: r.short > 0.5 ? 'neg' : 'pos' }, r.short > 0.5 ? `${money(r.paid)} paid · ${money(r.short)} short` : money(r.paid) + ' paid'))))),
    wf.unused > 0.5 ? h('p', { class: 'note' }, `${money(wf.unused)} of this month's income is not allocated to anything.`) : null)));
  root.append(section('Category by category', a.rows.length ? h('div', { class: 'pi-rows' }, a.rows.map((r) => {
    const lvl = r.state === 'over' || r.state === 'unmapped' ? 'bad' : r.state === 'near' || r.state === 'partial' ? 'mid' : 'ok', frac = r.available > 0 ? r.actual / r.available : r.actual > 0 ? 1 : 0;
    return h('div', { class: 'pi-r ' + lvl }, h('div', { class: 'pi-r-h' }, h('b', null, r.name), chip(r.state === 'over' ? 'Over by ' + money(r.over) : r.state === 'unmapped' ? 'No income set aside' : r.state === 'partial' ? 'Part funded' : r.state === 'near' ? 'Nearly used' : 'Within plan', lvl)),
      bar(frac, lvl), h('div', { class: 'pi-r-n' }, h('span', null, h('small', null, 'Set aside'), money(r.planned) + (r.carryIn > 0 ? ' + ' + compact(r.carryIn) : '')), h('span', null, h('small', null, 'Spent'), money(r.actual)), h('span', null, h('small', null, r.over > 0 ? 'Over' : 'Left'), money(r.over > 0 ? r.over : r.remaining)), h('span', null, h('small', null, 'Used'), r.used === Infinity ? '–' : pct(r.used, 0))),
      canEdit() && (r.state === 'unmapped' || r.state === 'over' || r.state === 'partial') ? h('button', { type: 'button', class: 'chip-btn small', onclick: () => (r.state === 'unmapped' ? assignDialog(sm.al, r.name) : (sm.al.sources.length ? assignDialog(sm.al, r.name) : toast('No income found')) ) }, r.state === 'unmapped' ? 'Set income aside' : 'Add more income to it') : null);
  })) : h('p', { class: 'empty' }, 'Nothing was spent and nothing is set aside for this month.')));
  root.append(section('Income: expected vs credited', h('div', null, h('ul', { class: 'pi-links inc' }, inc.rows.map((r) => h('li', { class: r.late ? 'late' : '' }, h('i', { style: { background: srcColor(sm.al, r.key) } }), h('span', null, h('b', null, r.name), h('small', null, `${P.FREQ_LABEL[r.freq]}${r.late ? ' · late' + (r.due ? ' since ' + r.due : '') : r.expected === 0 ? ' · pays in other months' : ''}`)), h('em', { class: r.late ? 'neg' : '' }, `${money(r.received)} of ${money(r.expected)}`))), h('li', { class: 'tot' }, h('span', null, h('b', null, 'Total')), h('em', null, `${money(inc.received)} of ${money(inc.expected)}`))),
    h('p', { class: 'note' }, 'Expected is what the interest schedule says is due. Credited counts what has arrived (a quarterly line shows 0 in the months it does not pay). Monthly planning figures are on the Allocations tab.'))));
  root.append(salaryCard({ ...sm, cur: month }));
}

function progress(root, sm) {
  const hist = sm.hist.filter((r) => r.spent > 0 || r.month === sm.cur).slice(-range), cov = sm.coverage;
  root.append(h('div', { class: 'pi-row' }, h('nav', { class: 'seg', 'aria-label': 'Months shown' }, [6, 12].map((n) => h('button', { type: 'button', class: range === n ? 'on' : '', onclick: () => { range = n; window.dispatchEvent(new Event('rerender')); } }, n + ' months')))));
  root.append(h('div', { class: 'kpis pi-kpis' },
    h('div', { class: 'kpi pi-cov' }, ring(cov, 76), h('div', null, h('span', { class: 'kpi-label' }, 'Planned coverage'), h('strong', { class: 'kpi-value ' + tone(cov) }, cov == null ? '–' : pct(cov, 1)), h('span', { class: 'kpi-sub' }, 'income ÷ usual expenses'))),
    kpi('Actually credited', sm.actualCoverage == null ? '–' : pct(sm.actualCoverage, 0), 'last 3 finished months', { tone: tone(sm.actualCoverage) }),
    kpi('More income needed', money(sm.required) + ' / mo', sm.required > 0 ? 'to reach 100%' : 'target reached', { tone: sm.required > 0 ? 'warn' : 'pos' }),
    kpi('Total monthly expenses', money(sm.al.expenses), `${money(sm.al.allocated)} mapped`)));
  const W = 560, H = 170, pl = 36, pb = 22, pt = 12, pr = 8, n = hist.length, mx = Math.max(1.2, ...hist.map((r) => r.coverage || 0)) * 1.05;
  const y = (v) => pt + (H - pt - pb) * (1 - v / mx), bw = n ? Math.min(34, (W - pl - pr) / n - 6) : 20, x = (i) => pl + ((i + 0.5) * (W - pl - pr)) / Math.max(1, n);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pi-trend', role: 'img', 'aria-label': 'Coverage by month' });
  s.append(svg('line', { x1: pl, x2: W - pr, y1: y(1), y2: y(1), class: 'pi-target' }), svg('text', { x: W - pr, y: y(1) - 4, 'text-anchor': 'end', class: 'pi-ax' }, '100% target'), svg('text', { x: pl - 6, y: y(0) + 4, 'text-anchor': 'end', class: 'pi-ax' }, '0%'));
  hist.forEach((r, i) => { const v = r.coverage || 0; s.append(svg('rect', { x: x(i) - bw / 2, y: y(Math.min(v, mx)), width: bw, height: Math.max(1, y(0) - y(Math.min(v, mx))), rx: 3, class: 'pi-bar-' + tone(r.coverage) }), svg('text', { x: x(i), y: y(Math.min(v, mx)) - 4, 'text-anchor': 'middle', class: 'pi-ax' }, r.coverage == null ? '' : Math.round(v * 100) + '%'), svg('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'pi-ax' }, monthLabel(r.month).slice(0, 3))); });
  root.append(section('Coverage by month', hist.length ? h('div', null, s, h('p', { class: 'note' }, sm.reachedAt ? 'First reached 100% in ' + monthLabel(sm.reachedAt, true) + '.' : 'Passive income received ÷ expenses. 100% means expenses were fully paid by passive income.')) : h('p', { class: 'empty' }, 'No months to show yet.')));
  root.append(section('Month by month', h('div', { class: 'pi-tbl' }, h('div', { class: 'pi-th' }, ['Month', 'Received', 'Expenses', 'Covered', 'Salary used'].map((t) => h('span', null, t))), hist.slice().reverse().map((r) => h('div', { class: 'pi-tr' }, h('span', null, monthLabel(r.month)), h('span', null, money(r.received)), h('span', null, money(r.spent)), h('span', { class: tone(r.coverage) }, r.coverage == null ? '–' : pct(r.coverage, 0)), h('span', { class: r.diverted > 0 ? 'neg' : 'pos' }, money(r.diverted)))))));
  root.append(salaryCard(sm));
}

export function render() {
  const tab = subTab(TABS.map((t) => t[0])), root = h('div', { class: 'page pi' });
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Passive income views'), h('p', { class: 'pi-sub' }, 'Pay the household from passive income. Keep the salary invested.')));
  const sm = P.summary(S.data, S.all);
  if (tab === 'overview') overview(root, sm); else if (tab === 'allocations') allocations(root, sm); else if (tab === 'actual') actual(root, sm); else progress(root, sm);
  return root;
}
