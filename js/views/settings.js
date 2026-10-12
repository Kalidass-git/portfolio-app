import { S, setCfg, setData, connect, pull, push, disconnect, resetAll, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { h, money, dateStr, section, btn, formDialog, dialog, confirmDialog, toast, canEdit, table } from '../ui.js';

const rerender = () => window.dispatchEvent(new Event('rerender'));

function download(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
export function pickFile() {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept: '.json,application/json' });
    i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); try { res(JSON.parse(await f.text())); } catch { toast('That file is not a valid portfolio data file.', 'bad'); res(null); } };
    i.click();
  });
}
export function validData(d) { return d && d.app === 'portfolio-tracker' && Array.isArray(d.ledger) && Array.isArray(d.stocks) && d.settings; }

function liabilityForm(l) {
  const isNew = !l;
  formDialog({
    title: isNew ? 'Add loan' : 'Edit ' + l.name, value: l || {},
    fields: [{ key: 'name', label: 'Loan', required: true }, { key: 'amount', label: 'Outstanding (₹)', type: 'number', required: true }, { key: 'rate', label: 'Interest rate (0.084 = 8.4%)', type: 'number' }],
    onSave: (v) => mutate((d) => { v.rate = v.rate || 0; if (isNew) d.liabilities.push({ id: nextId('l', d.liabilities), ...v }); else Object.assign(d.liabilities.find((x) => x.id === l.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.liabilities = d.liabilities.filter((x) => x.id !== l.id); }),
  });
}

function connectForm() {
  formDialog({
    title: 'Connect to Google Drive backend', saveLabel: 'Connect', value: { url: S.cfg.backendUrl, key: S.cfg.key },
    fields: [
      { key: 'url', label: 'Backend web app URL', required: true, hint: 'Ends with /exec. Created in docs/SETUP.md, step 2.' },
      { key: 'key', label: 'Access key', required: true, hint: 'Owner key to edit, family key to view only.' },
    ],
    onSave: (v) => {
      connect(v.url.trim(), v.key.trim()).then(async (role) => {
        toast(role === 'owner' ? 'Connected with edit access' : 'Connected with view-only access');
        if (role === 'owner' && S.data) {
          // First connection from the owner's device: upload local data if the Drive file is still empty.
          const r = await pull();
          if (r && r.empty && S.data) { await push({ force: true }); toast('Your data is now saved in Google Drive'); }
        } else await pull({ force: true });
        rerender();
      }).catch((e) => toast(e.message, 'bad'));
    },
  });
}

export function render() {
  const { data, all } = S;
  const root = h('div', { class: 'page' });
  const stLabel = { idle: 'Up to date', syncing: 'Syncing…', error: 'Sync problem', offline: 'Offline', conflict: 'Changed on another device' }[S.status];

  root.append(section('Google Drive sync',
    h('div', { class: 'kv' },
      h('p', null, S.remote ? h('span', null, 'Connected as ', h('b', null, S.role === 'owner' ? 'owner (can edit)' : 'family member (view only)')) : 'Not connected. Data is kept only on this device.'),
      S.remote ? h('p', { class: 'note' }, `${stLabel}${S.meta.lastSync ? ' · last sync ' + new Date(S.meta.lastSync).toLocaleString('en-IN') : ''}${S.meta.dirty ? ' · changes waiting to upload' : ''}${S.error ? ' · ' + S.error : ''}`) : null,
      h('div', { class: 'row' },
        btn(S.remote ? 'Change connection' : 'Connect', connectForm, 'primary'),
        S.remote ? btn('Sync now', async () => { try { const r = await pull({ force: false }); toast(r && r.conflict ? 'Drive has newer changes. Choose which to keep below.' : 'Synced'); } catch (e) { toast(e.message, 'bad'); } rerender(); }) : null,
        S.remote && canEdit() ? btn('Upload this device’s data', async () => { if (await confirmDialog('Replace the copy in Google Drive with the data on this device?', 'Replace')) { try { await push({ force: true }); toast('Uploaded'); } catch (e) { toast(e.message, 'bad'); } rerender(); } }) : null,
        S.remote ? btn('Download latest from Drive', async () => { if (!S.meta.dirty || await confirmDialog('This device has changes that are not uploaded. Replace them with the Drive copy?', 'Replace')) { try { await pull({ force: true }); toast('Downloaded'); } catch (e) { toast(e.message, 'bad'); } rerender(); } }) : null,
        S.remote ? btn('Disconnect', async () => { if (await confirmDialog('Disconnect this device? Its local copy of the data stays.', 'Disconnect')) { disconnect(); rerender(); } }, 'danger') : null))));


  if (S.remote && canEdit()) {
    const out = h('input', { readonly: true, value: '', 'aria-label': 'Family link', style: { width: '100%' } });
    const key = h('input', { type: 'text', placeholder: 'Paste the FAMILY key here', 'aria-label': 'Family key', style: { width: '100%' },
      oninput: () => { out.value = key.value.trim() ? `${location.href.split('#')[0]}#/home?u=${encodeURIComponent(S.cfg.backendUrl)}&k=${encodeURIComponent(key.value.trim())}` : ''; } });
    root.append(section('Share with family (view only)', h('div', { class: 'kv', style: { width: '100%' } },
      h('p', { class: 'note' }, 'Family members open this link once on their phone. It connects them with the view-only key, so they can look but never change anything. Never paste the owner key here.'),
      key, out,
      btn('Copy link', async () => { if (!out.value) return toast('Paste the family key first.', 'bad'); try { await navigator.clipboard.writeText(out.value); toast('Link copied'); } catch { out.select(); toast('Press copy on the selected link'); } }, 'primary'))));
  }

  root.append(section('Data file',
    h('div', null, h('p', { class: 'note' }, 'A backup is a single JSON file. Keep one somewhere safe, for example in Google Drive.'),
      h('div', { class: 'row' },
        btn('Download backup', () => { download(`portfolio-data-${C.todayISO()}.json`, JSON.stringify(data, null, 1)); toast('Backup downloaded'); }, 'primary'),
        canEdit() ? btn('Restore from file', async () => { const d = await pickFile(); if (!d) return; if (!validData(d)) return toast('That file is not a portfolio data file.', 'bad'); if (await confirmDialog('Replace everything in the app with this file?', 'Restore')) { setData(d, { dirty: true }); if (S.remote) push({ force: true }).catch(() => {}); toast('Data restored'); rerender(); } }) : null))));

  if (canEdit()) {
    root.append(section('Loans (liabilities)', table([
      { label: 'Loan', get: (l) => l.name }, { label: 'Outstanding', cls: 'r', get: (l) => money(l.amount) }, { label: 'Rate', cls: 'r', get: (l) => (l.rate * 100).toFixed(2) + '%' },
    ], data.liabilities, { onRow: (l) => liabilityForm(data.liabilities.find((x) => x.id === l.id)), footer: { label: 'Total' } }), [btn('Add loan', () => liabilityForm(), 'primary')]));
    root.append(section('Calculation settings', h('div', { class: 'kv' },
      h('p', null, 'Tax deducted on bond interest: ', h('b', null, (data.settings.tdsRate * 100).toFixed(0) + '%'), ' · days in month used for monthly interest: ', h('b', null, data.settings.daysInMonth)),
      btn('Change', () => formDialog({
        title: 'Calculation settings', value: { tds: data.settings.tdsRate * 100, dim: data.settings.daysInMonth },
        fields: [{ key: 'tds', label: 'Tax deducted on bond interest (%)', type: 'number' }, { key: 'dim', label: 'Days in month used for monthly interest', type: 'number' }],
        onSave: (v) => mutate((d) => { d.settings.tdsRate = (v.tds || 0) / 100; d.settings.daysInMonth = v.dim || 30; }),
      })))));
  }

  root.append(section('This device',
    h('div', { class: 'kv' },
      h('label', { class: 'inline-label' }, 'Theme ', h('select', { onchange: (e) => { setCfg({ theme: e.target.value }); document.documentElement.dataset.theme = e.target.value === 'auto' ? '' : e.target.value; } },
        [['auto', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: S.cfg.theme === v }, l)))),
      h('label', { class: 'inline-label check' }, h('input', { type: 'checkbox', checked: S.cfg.useLive, onchange: (e) => setCfg({ useLive: e.target.checked }) }), ' Use refreshed live prices on this device'),
      h('p', { class: 'note' }, `App data last changed ${data.updatedAt ? new Date(data.updatedAt).toLocaleString('en-IN') : '–'}.`),
      btn('Erase data from this device', async () => { if (await confirmDialog('Erase the data and settings stored on this device? Data in Google Drive is not touched.', 'Erase')) resetAll(); }, 'danger'))));
  return root;
}
