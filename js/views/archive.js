// Expenses → Archive: move old bank entries out of the way (balances stay right) and bring them back if needed.
import { S, mutate, allowShrink } from '../store.js';
import * as C from '../calc.js';
import { archiveBefore, restoreArchive, preview, toCsv } from '../archive.js';
import { autoPoint } from './backups.js';
import { h, money, dateStr, monthLabel, section, table, btn, formDialog, confirmDialog, canEdit, toast, stat } from '../ui.js';

const rerender = () => window.dispatchEvent(new Event('rerender'));
function save(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
const lastYearStart = () => (new Date(S.all.asOf).getUTCFullYear() - 1) + '-01-01';

function archiveForm() {
  formDialog({
    title: 'Archive old history', saveLabel: 'Review', value: { cutoff: lastYearStart() },
    fields: [{ key: 'cutoff', label: 'Archive everything before', type: 'date', required: true, hint: 'Entries before this date leave Expenses. Each bank account keeps its exact balance.' }],
    onSave: async (v) => {
      const p = preview(S.data, v.cutoff);
      if (!p.count) return toast('Nothing is older than that date.', 'bad');
      const ok = await confirmDialog(`Archive ${p.count} entries from ${dateStr(p.from)} to ${dateStr(p.to)} across ${p.accounts} accounts? Bank balances will not change. A restore point is saved first, and you can bring the entries back from this page.`, 'Archive');
      if (!ok) return;
      await autoPoint('Before archiving to ' + v.cutoff);
      allowShrink();
      mutate((d) => { archiveBefore(d, v.cutoff); });
      toast(p.count + ' entries archived');
    },
  });
}

export function render() {
  const { data } = S;
  const root = h('div', { class: 'page' });
  const arch = data.archive || [];
  const dates = data.ledger.map((e) => e.date).sort();
  root.append(h('div', { class: 'stats' },
    stat('Entries in use', String(data.ledger.length), dates.length ? dateStr(dates[0]) + ' to ' + dateStr(dates[dates.length - 1]) : ''),
    stat('Archived', String(arch.reduce((a, x) => a + x.count, 0)), arch.length + ' archives')));
  root.append(section('Archive old history',
    h('div', null, h('p', { class: 'note' }, 'You plan to keep only a few years. Archiving moves older bank entries out of Expenses and reports. Monthly totals stay visible below, you can download the entries as a spreadsheet file, and you can bring them back at any time.'),
      canEdit() ? btn('Archive older entries…', archiveForm, 'primary') : h('p', { class: 'note' }, 'Only the owner can archive.'))));
  for (const a of arch.slice().reverse()) {
    const ms = Object.keys(a.months).sort();
    root.append(section(`Archive: ${dateStr(a.from)} to before ${dateStr(a.cutoff)} · ${a.count} entries`,
      h('div', null,
        h('p', { class: 'note' }, 'Archived on ' + dateStr(a.createdAt.slice(0, 10)) + '. Totals exclude transfers; loan EMI and tax are counted in expenses here.'),
        table([
          { label: 'Month', get: (m) => monthLabel(m) },
          { label: 'Income', cls: 'r', get: (m) => money(a.months[m].income) },
          { label: 'Expenses', cls: 'r', get: (m) => money(a.months[m].expenses) },
          { label: 'Invested', cls: 'r', get: (m) => money(a.months[m].invested) },
        ], ms),
        h('div', { class: 'btn-row' },
          btn('Download entries (CSV)', () => save(`bank-entries-archive-${a.cutoff}.csv`, toCsv(a, data), 'text/csv')),
          canEdit() ? btn('Bring back', async () => { if (await confirmDialog(`Put these ${a.count} entries back into Expenses?`, 'Bring back')) { await autoPoint('Before restoring archive'); mutate((d) => { restoreArchive(d, a.id); }); toast('Entries restored'); } }) : null,
          canEdit() ? btn('Delete archive', async () => { if (await confirmDialog(`Permanently delete this archive of ${a.count} entries? Download the CSV first if you may need it. Bank balances stay the same.`, 'Delete')) mutate((d) => { d.archive = d.archive.filter((x) => x.id !== a.id); }); }, 'danger') : null))));
  }
  return root;
}
