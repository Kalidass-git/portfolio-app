import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import { h, money, compact, dateStr, section, table, formDialog, canEdit, toast, btn } from '../ui.js';
import { strip, legend } from '../charts.js';

function noteForm(item) {
  formDialog({
    title: `${item.label} · ${item.holder || item.type}`, value: { note: S.data.reportNotes?.[item.key] || '' },
    fields: [{ key: 'note', label: 'Who to contact, where it is, how to claim', type: 'textarea', hint: 'Do not store passwords or PINs here. Anyone with the family link can read this.' }],
    onSave: (v) => mutate((d) => { d.reportNotes = d.reportNotes || {}; if (v.note) d.reportNotes[item.key] = v.note; else delete d.reportNotes[item.key]; }),
  });
}

export function render() {
  const { data, all } = S;
  const rep = C.familyReport(data, all);
  const notes = data.reportNotes || {};
  const root = h('div', { class: 'page report' });
  root.append(h('div', { class: 'toolbar' },
    h('div', null, h('h2', { class: 'page-title' }, 'Family portfolio report'), h('p', { class: 'note' }, 'Where the money is held and whom to contact · as on ' + dateStr(all.asOf))),
    h('button', { class: 'primary no-print', onclick: () => window.print() }, 'Print or save as PDF')));
  const spine = rep.sections.filter((s) => s.total > 0).map((s) => ({ label: s.type, value: s.total }));
  root.append(h('section', { class: 'card' }, h('div', { class: 'report-total' }, h('div', null, h('span', { class: 'stat-label' }, 'Total held'), h('strong', { class: 'stat-value' }, money(rep.total))), h('div', null, h('span', { class: 'stat-label' }, 'Monthly interest income'), h('strong', { class: 'stat-value' }, money(rep.monthly)))), strip(spine, { fmt: money }), legend(spine, { fmt: money })));
  for (const sec of rep.sections) {
    if (!sec.items.length) continue;
    root.append(section(sec.type + ' · ' + money(sec.total),
      table([
        { label: 'Details', get: (i) => i.label },
        { label: 'Holder', get: (i) => i.holder },
        { label: 'Current value', cls: 'r', get: (i) => money(i.value), total: () => money(sec.total) },
        { label: 'Monthly income', cls: 'r', get: (i) => (i.monthly ? money(i.monthly) : ''), total: () => (sec.monthly ? money(sec.monthly) : '') },
        { label: 'Contact / notes', render: (i) => h('span', { class: 'note-cell' }, notes[i.key] || (canEdit() ? h('span', { class: 'muted' }, 'Add note') : '')) },
      ], sec.items, { footer: { label: 'Total' }, onRow: canEdit() ? noteForm : null })));
  }
  return root;
}
