import { S, restoreData } from '../store.js';
import { h, section, table, btn, formDialog, confirmDialog, toast, canEdit, dateStr } from '../ui.js';
import * as B from '../backups.js';

const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const when = (iso) => { const d = new Date(iso); return dateStr(iso.slice(0, 10)) + ' ' + d.toTimeString().slice(0, 5); };
const KIND = { manual: 'You made it', auto: 'Automatic' };

const rerender = () => window.dispatchEvent(new Event('rerender'));
/** Put a copy of the data back, upload it to Drive, and say plainly what happened. */
export async function doRestore(data) {
  toast('Restoring…');
  try {
    const r = await restoreData(data);
    if (r.local) toast('Restored on this device');
    else if (r.ok) toast('Restored and saved to Google Drive');
    else if (r.blocked) toast('Not restored: ' + (S.error || 'the data looks damaged'), 'bad');
    else toast('Restored on this device. Uploading to Google Drive failed' + (r.error ? ' (' + r.error + ')' : '') + '. It will try again by itself.', 'bad');
  } catch (e) { toast(e.message, 'bad'); }
  rerender();
}
export async function autoPoint(name) { try { await B.createPoint(S.data, name, 'auto'); } catch { /* best effort */ } }

function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

/** Settings section. */
export function section_() {
  const box = h('div', null, h('p', { class: 'note' }, 'Loading…'));
  const wrap = section('Restore points', box);
  const refresh = async () => {
    let list;
    try { list = await B.listPoints(); } catch (e) { box.replaceChildren(h('p', { class: 'note' }, e.message)); return; }
    const kids = [h('p', { class: 'note' }, 'A restore point is a full copy of your data, kept on this device. Make one before big changes (an import, archiving, a clean-up) and go back to it if something goes wrong. Download a copy too if you want it safe in Drive, because clearing the browser data also clears restore points.')];
    kids.push(h('div', { class: 'btn-row' },
      btn('Create restore point', () => formDialog({ title: 'New restore point', saveLabel: 'Create', value: { name: 'Before ' + new Date().toISOString().slice(0, 10) }, fields: [{ key: 'name', label: 'Name', hint: 'Say what it is for, so you can pick the right one later.' }],
        onSave: async (v) => { try { await B.createPoint(S.data, v.name); toast('Restore point created'); refresh(); } catch (e) { toast(e.message, 'bad'); } } }), 'primary'),
      list.length > 3 ? btn('Delete all but newest 3', async () => { if (await confirmDialog('Delete ' + (list.length - 3) + ' older restore points?', 'Delete')) { const n = await B.pruneKeep(3); toast(n + ' deleted'); refresh(); } }, 'danger') : null));
    kids.push(list.length ? table([
      { label: 'Name', get: (r) => r.name }, { label: 'Made', get: (r) => when(r.createdAt) }, { label: 'Type', get: (r) => KIND[r.kind] || r.kind },
      { label: 'Size', cls: 'r', get: (r) => kb(r.size) }, { label: 'Entries', cls: 'r', get: (r) => String(r.counts.ledger) },
      { label: '', render: (r) => h('span', { class: 'btn-row' },
        h('button', { class: 'small', onclick: async (e) => { e.stopPropagation(); if (!await confirmDialog(`Go back to "${r.name}" (${when(r.createdAt)})? Your current data is saved as a new restore point first.`, 'Restore')) return; const p = await B.getPoint(r.id); if (!p) return toast('That restore point could not be read.', 'bad'); await doRestore(p.data); refresh(); } }, 'Restore'),
        h('button', { class: 'small', onclick: async (e) => { e.stopPropagation(); const p = await B.getPoint(r.id); download(`portfolio-restore-${r.createdAt.slice(0, 10)}.json`, JSON.stringify(p.data, null, 1)); } }, 'Download'),
        h('button', { class: 'small danger', onclick: async (e) => { e.stopPropagation(); if (await confirmDialog(`Delete "${r.name}"? This cannot be undone.`, 'Delete')) { await B.deletePoint(r.id); toast('Deleted'); refresh(); } } }, 'Delete')) },
    ], list) : h('p', { class: 'empty' }, 'No restore points yet.'));
    box.replaceChildren(...kids);
  };
  refresh();
  return canEdit() ? wrap : null;
}
