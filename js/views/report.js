import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, dateStr, section, table, formDialog, canEdit, toast, isMasked } from '../ui.js';
import { donut, hbars, legend, color } from '../charts.js';
import { isNative, sharePdf } from '../native.js';

function noteForm(item) {
  formDialog({
    title: `${item.label} · ${item.holder || item.type}`, value: { note: S.data.reportNotes?.[item.key] || '' },
    fields: [{ key: 'note', label: 'Who to contact, where it is, how to claim', type: 'textarea', hint: 'Do not store passwords or PINs here. Anyone with the family link can read this.' }],
    onSave: (v) => mutate((d) => { d.reportNotes = d.reportNotes || {}; if (v.note) d.reportNotes[item.key] = v.note; else delete d.reportNotes[item.key]; }),
  });
}

function metaForm() {
  const m = S.data.reportMeta || {};
  formDialog({
    title: 'Note for the family', value: { preparedBy: m.preparedBy || '', note: m.note || '', contacts: m.contacts || '' },
    fields: [
      { key: 'preparedBy', label: 'Prepared by' },
      { key: 'note', label: 'Message to the family', type: 'textarea', hint: 'For example: where the documents are kept, who to call first, what to do in the first week.' },
      { key: 'contacts', label: 'Key contacts (one per line)', type: 'textarea', hint: 'Relationship manager, advisor, CA, bank branch. Name, role, phone. No passwords or PINs.' },
    ],
    onSave: (v) => mutate((d) => { d.reportMeta = { preparedBy: v.preparedBy, note: v.note, contacts: v.contacts }; }),
  });
}

/** Print with real figures even if the screen is masked, then restore. In the Android app "share" makes a PDF and opens the share sheet instead (the phone's print screen is only the second choice). */
function printReport(share) {
  const was = S.masked;
  const restore = () => { if (S.masked !== was) { S.masked = was; window.dispatchEvent(new Event('rerender')); } window.removeEventListener('afterprint', restore); };
  if (was) { S.masked = false; window.dispatchEvent(new Event('rerender')); toast('Figures are shown while printing'); }
  if (share) {
    setTimeout(async () => {
      try { await sharePdf('Family-report-' + new Date().toISOString().slice(0, 10)); }
      catch (e) { toast((e && e.message) || 'Could not make the PDF', 'bad'); }
      restore();
    }, 400);
    return;
  }
  window.addEventListener('afterprint', restore);
  setTimeout(() => window.print(), 150);
}

/** 2.17 Crores, 14 Lakhs: how people say it. Smaller amounts stay in full. */
const trim = (x) => x.toFixed(2).replace(/\.?0+$/, '');
function words(v) {
  if (isMasked()) return money(v);
  const a = Math.abs(v), sg = v < 0 ? '-' : '';
  if (a >= 1e7) { const x = a / 1e7; return `${sg}₹${trim(x)} ${Number(trim(x)) === 1 ? 'Crore' : 'Crores'}`; }
  if (a >= 1e5) { const x = a / 1e5; return `${sg}₹${trim(x)} ${Number(trim(x)) === 1 ? 'Lakh' : 'Lakhs'}`; }
  return money(v);
}
const oneLine = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean).join(' · ');
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
/** Same-named items (and the same note) become one line with a count. */
function mergeSame(items, notes) {
  const m = new Map();
  for (const x of items) {
    const note = oneLine(notes[x.key]);
    const k = x.label + '|' + note;
    const r = m.get(k) || { label: x.label, note, count: 0, value: 0, type: x.type, holder: x.holder };
    r.count++; r.value += x.value; m.set(k, r);
  }
  return [...m.values()];
}
const pctOf = (v, t) => (t > 0 ? Math.round((v / t) * 100) + '%' : '');

/** Parent row per kind of holding, with every item underneath in smaller type (tap a parent on screen to fold it; print always shows all). */
function holdingsTable(secs, rep, notes) {
  const rows = [];
  const tbl = h('table', { class: 'rpt-tbl rpt-detail' },
    h('thead', null, h('tr', null, [['', ''], ['What', ''], ['Held by', 'hide-sm'], ['Amount', 'r'], ['Share', 'r hide-sm'], ['Monthly', 'r hide-sm'], ['Held with / contact', '']].map(([t, c]) => h('th', { class: c }, t)))));
  secs.forEach((sec, i) => {
    const items = sec.items.slice().sort((x, y) => y.value - x.value);
    const tb = h('tbody', { class: 'grp' });
    const parent = h('tr', { class: 'rpt-parent', style: { '--g': color(i) }, onclick: () => tb.classList.toggle('collapsed'), title: 'Tap to fold or unfold' },
      h('td', null, h('i', { class: 'dot', style: { background: color(i) } })), h('td', null, h('b', null, sec.type), h('span', { class: 'cnt' }, ` ${items.length} item${items.length === 1 ? '' : 's'}`)),
      h('td', { class: 'hide-sm' }), h('td', { class: 'r' }, h('b', null, money(sec.total))), h('td', { class: 'r hide-sm' }, pctOf(sec.total, rep.total)), h('td', { class: 'r hide-sm' }, sec.monthly ? money(sec.monthly) : ''), h('td'));
    tb.append(parent);
    let prev = null;
    for (const it of items) {
      const note = oneLine(notes[it.key]);
      tb.append(h('tr', { class: 'rpt-child' }, h('td'), h('td', { class: 'ch-name' }, it.label), h('td', { class: 'hide-sm' }, it.holder || ''), h('td', { class: 'r' }, money(it.value)), h('td', { class: 'r hide-sm' }), h('td', { class: 'r hide-sm' }, it.monthly ? money(it.monthly) : ''),
        h('td', { class: 'ch-note' }, note ? (note === prev ? '″' : clip(note, 150)) : '')));
      prev = note || prev;
    }
    tbl.append(tb);
  });
  return tbl;
}

export function render() {
  const { data, all } = S;
  const rep = C.familyReport(data, all);
  const notes = data.reportNotes || {};
  const meta = data.reportMeta || {};
  const secs = rep.sections.filter((s) => s.total > 0);
  const liab = all.liabTotal || 0;
  const net = rep.total - liab;
  const root = h('div', { class: 'page report' });

  root.append(h('div', { class: 'toolbar no-print' },
    h('div', null, h('h2', { class: 'page-title' }, 'Family report'), h('p', { class: 'note' }, 'Page 1 lists every holding under its kind, with who to contact. Page 2 has the charts, your note and the key contacts. Tap a heading to fold it on screen; the printout always shows everything. ' + (isNative() ? 'Share or save PDF opens the share sheet: save it to Drive, or send it on WhatsApp or email.' : 'Print or save as PDF.'))),
    h('div', { class: 'btn-row' }, h('button', { onclick: () => { const g = [...document.querySelectorAll('.rpt-detail .grp')], open = g.some((x) => x.classList.contains('collapsed')); g.forEach((x) => x.classList.toggle('collapsed', !open)); } }, 'Fold / unfold all'), canEdit() ? h('button', { onclick: metaForm }, 'Edit family note') : null, isNative() ? h('button', { onclick: () => printReport(false) }, 'Print') : null, h('button', { class: 'primary', onclick: () => printReport(isNative()) }, isNative() ? 'Share or save PDF' : 'Print or save as PDF'))));

  // ---------- page 1 ----------
  const contactLines = (meta.contacts || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const p1 = h('section', { class: 'rpt rpt-1' },
    h('header', { class: 'rpt-head' },
      h('div', null, h('h1', null, 'Family wealth summary'), h('p', null, 'Where our money is and whom to contact')),
      h('div', { class: 'rpt-date' }, h('span', null, 'As on'), h('strong', null, dateStr(all.asOf)), meta.preparedBy ? h('span', null, 'Prepared by ' + meta.preparedBy) : null)),
    h('div', { class: 'rpt-kpis' },
      h('div', { class: 'kpi k1' }, h('span', null, 'Total Assets'), h('strong', { title: money(rep.total) }, words(rep.total))),
      h('div', { class: 'kpi k2' }, h('span', null, 'Loans to repay'), h('strong', { title: money(liab) }, words(liab))),
      h('div', { class: 'kpi k3 key' }, h('span', null, 'Net worth'), h('strong', { title: money(net) }, words(net))),
      h('div', { class: 'kpi k4 key' }, h('span', null, 'Monthly interest income'), h('strong', null, money(rep.monthly)))),
    h('div', { class: 'rpt-scroll' }, holdingsTable(secs, rep, notes)),
    '');

  // ---------- page 2 ----------
  const holders = new Map();
  for (const s of secs) for (const it of s.items) { const k = (it.holder || 'Joint / other').trim() || 'Joint / other'; holders.set(k, (holders.get(k) || 0) + it.value); }
  const holderRows = [...holders].map(([label, value], i) => ({ label, value, ci: i })).sort((a, b) => b.value - a.value);
  const allocation = secs.map((s) => ({ label: s.type, value: s.total }));
  const income = secs.flatMap((s) => s.items.filter((x) => x.monthly > 0).map((x) => ({ label: x.label, value: x.monthly })));
  const p2 = h('section', { class: 'rpt rpt-2' },
    h('header', { class: 'rpt-head slim' }, h('div', null, h('h1', null, 'Charts and contacts')), h('div', { class: 'rpt-date' }, h('strong', null, dateStr(all.asOf)))),
    h('div', { class: 'rpt-two' },
      h('div', { class: 'box' }, h('h3', { class: 'rpt-h' }, 'How it is spread'), donut(allocation, { fmt: money, center: compact(rep.total), sub: 'total held', size: 190 }), legend(allocation, { fmt: money })),
      h('div', { class: 'box' }, h('h3', { class: 'rpt-h' }, 'Whose name it is in'), hbars(holderRows, { fmt: money }),
        income.length ? [h('h3', { class: 'rpt-h' }, 'Monthly income comes from'), hbars(income.sort((a, b) => b.value - a.value).slice(0, 6).map((r, i) => ({ ...r, ci: i + 2 })), { fmt: money })] : null)),
    h('div', { class: 'rpt-two' },
      h('div', { class: 'box b-note' }, h('h3', { class: 'rpt-h' }, 'A note for the family'),
        h('p', { class: 'pre' }, meta.note || (canEdit() ? 'Tap "Edit family note" to write what the family should do and where documents are kept.' : '—'))),
      h('div', { class: 'box b-contacts' }, h('h3', { class: 'rpt-h' }, 'Key contacts'),
        contactLines.length ? h('ul', null, contactLines.map((l) => h('li', null, l))) : h('p', { class: 'muted' }, canEdit() ? 'Add relationship manager and advisor details in "Edit family note".' : '—'))),
    h('footer', { class: 'rpt-foot' }, 'Confidential, for family use only. Values are as recorded on the date shown and may have changed since. Do not keep passwords or PINs on this page.'));

  root.append(h('div', { class: 'rpts' }, p1, p2));

  root.append(h('p', { class: 'note no-print other-reports' }, 'Other reports: ', h('a', { href: '#/incexp' }, 'Income vs expense'), ' · ', h('a', { href: '#/networth' }, 'Net worth over time')));

  // ---------- full list (screen only; tap to add notes) ----------
  // One foldable group per kind of holding, with its count and total on the bar. On a phone each group's holdings are the same two-line rows as Shares & funds
  // (name and holder on the left, value on the right; tap the right side to see monthly income instead).
  const phone = window.matchMedia('(max-width: 700px)').matches;
  const listed = rep.sections.filter((s) => s.items.length);
  const groupCard = (sec, gi) => {
    const open = !phone || gi === 0 ? true : false;
    const col = color(gi);
    const body = table([
      { label: 'Details', host: true, get: (i) => i.label },
      { label: 'Holder', mob: 'under', get: (i) => i.holder },
      { label: 'Current value', cls: 'r', get: (i) => money(i.value), total: () => money(sec.total) },
      { label: 'Monthly income', cls: 'r', get: (i) => (i.monthly ? money(i.monthly) : ''), total: () => (sec.monthly ? money(sec.monthly) : '') },
      { label: 'Contact / notes', mob: 'under', render: (i) => h('span', { class: 'note-cell' }, notes[i.key] || (canEdit() ? h('span', { class: 'muted' }, 'Add note') : '')) },
    ], sec.items, { footer: { label: 'Total' }, onRow: canEdit() ? noteForm : null,
      m: { key: 'rpt-' + sec.type, head: sec.type, sub: ['Holder'], extra: 'Contact / notes', views: [['Current value', 'Monthly income']] } });
    const wrap = h('div', { class: 'hg' + (open ? '' : ' collapsed'), style: { '--g': col } });
    const head = h('button', { type: 'button', class: 'hg-head', 'aria-expanded': String(open), onclick: () => { const c = wrap.classList.toggle('collapsed'); head.setAttribute('aria-expanded', String(!c)); } },
      h('i', { class: 'hg-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'hg-name' }, sec.type, h('small', { class: 'muted' }, ` ${sec.items.length} ${sec.items.length === 1 ? 'holding' : 'holdings'}`)),
      h('span', { class: 'hg-sum' }, h('b', null, money(sec.total)), sec.monthly ? h('small', { class: 'muted' }, money(sec.monthly) + ' a month') : null),
      h('span', { class: 'hg-caret', 'aria-hidden': 'true' }, '▸'));
    wrap.append(head, h('div', { class: 'hg-body' }, body));
    return wrap;
  };
  root.append(h('div', { class: 'no-print' },
    h('h2', { class: 'sec-title' }, 'All holdings and contact notes'),
    h('p', { class: 'note' }, 'Tap a group to open or close it.' + (canEdit() ? ' Tap a holding to add or change its contact note.' : '')),
    h('div', { class: 'hg-list' }, listed.map(groupCard))));
  return root;
}
