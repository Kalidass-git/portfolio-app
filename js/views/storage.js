// Settings → Storage: how much room the app uses on this device.
import { S } from '../store.js';
import * as B from '../backups.js';
import { h, section, table, btn, confirmDialog, toast, canEdit } from '../ui.js';

const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : n >= 1024 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : n + ' B');
const lsSize = (k) => { try { const v = localStorage.getItem(k); return v ? v.length * 2 : 0; } catch { return 0; } }; // browsers store text as 2 bytes a character
const jsonBytes = (x) => { try { return new TextEncoder().encode(JSON.stringify(x)).length; } catch { return 0; } };

export function section_() {
  const box = h('div', null, h('p', { class: 'note' }, 'Measuring…'));
  const wrap = section('Storage on this device', box);
  const refresh = async () => {
    const d = S.data || {};
    let points = [], est = null;
    try { points = await B.listPoints(); } catch { /* storage unavailable */ }
    try { if (navigator.storage && navigator.storage.estimate) est = await navigator.storage.estimate(); } catch { /* ignore */ }
    const dataB = jsonBytes(d);
    const parts = Object.entries(d).map(([k, v]) => [k, jsonBytes(v)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const ptsAuto = points.filter((p) => p.kind === 'auto'), ptsMine = points.filter((p) => p.kind !== 'auto');
    const sum = (a) => a.reduce((t, p) => t + p.size, 0);
    const archB = jsonBytes(d.archive || []);
    const rows = [
      ['Your data (what the app shows)', dataB, 'Grows with bank entries, trades and daily readings'],
      ['Copy of last synced data', lsSize('pt.base'), 'Used to combine changes from two devices safely'],
      ['Stored copy on this device', lsSize('pt.data'), 'So the app opens with no internet'],
      ['Prices, settings and other small items', lsSize('pt.quotes') + lsSize('pt.cfg') + lsSize('pt.meta') + lsSize('pt.importBackup'), ''],
      [`Restore points you made (${ptsMine.length})`, sum(ptsMine), ''],
      [`Automatic restore points (${ptsAuto.length})`, sum(ptsAuto), 'The newest 20 are kept'],
    ];
    const total = rows.slice(1).reduce((t, r) => t + r[1], 0) + 0;
    const kids = [
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Used by this app here'), h('strong', { class: 'stat-value' }, kb(total)), h('span', { class: 'stat-sub' }, 'about, counted from the items below')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Data file'), h('strong', { class: 'stat-value' }, kb(dataB)), h('span', { class: 'stat-sub' }, 'what is uploaded to Drive')),
        est && est.quota ? h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Browser total / allowed'), h('strong', { class: 'stat-value' }, kb(est.usage || 0)), h('span', { class: 'stat-sub' }, 'of ' + kb(est.quota) + ' this browser allows')) : null),
      table([{ label: 'What', get: (r) => r[0] }, { label: 'Size', cls: 'r', get: (r) => kb(r[1]) }, { label: 'Note', get: (r) => r[2] }], rows.concat([['Total counted', total, '']])),
      h('p', { class: 'mini-title' }, 'Biggest parts of your data'),
      table([{ label: 'Part', get: (r) => r[0] }, { label: 'Size', cls: 'r', get: (r) => kb(r[1]) }, { label: 'Share', cls: 'r', get: (r) => (dataB ? Math.round((r[1] / dataB) * 100) + '%' : '') }], parts),
      archB > 10 ? h('p', { class: 'note' }, 'Archived entries take ' + kb(archB) + ' of your data. Download the archive and delete it on the Expenses → Archive page to free this space.') : null,
      h('p', { class: 'note' }, 'Google Drive holds the data file plus up to 30 daily backups, so about 30 times the data file size. The app’s own browser storage is limited (usually 5 MB for the live data and its synced copy), which is another reason to archive old expenses every year or two.'),
    ];
    if (canEdit() && ptsAuto.length) kids.push(h('div', { class: 'btn-row' }, btn('Delete automatic restore points', async () => { if (await confirmDialog(`Delete ${ptsAuto.length} automatic restore points (${kb(sum(ptsAuto))})? The ones you made yourself stay.`, 'Delete')) { for (const p of ptsAuto) await B.deletePoint(p.id); toast('Deleted'); refresh(); } }, 'danger')));
    box.replaceChildren(...kids.filter(Boolean));
  };
  refresh();
  return wrap;
}
