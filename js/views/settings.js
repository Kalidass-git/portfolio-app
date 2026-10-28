import { S, setCfg, setData, connect, pull, push, disconnect, resetAll, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { VERSION, RELEASED } from '../version.js';
import { section_ as restorePoints, doRestore } from './backups.js';
import { section_ as storageInfo } from './storage.js';
import { isNative, reminderOpts, setReminderOpts, reminderPermission, planReminders } from '../native.js';
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


/** Android app only: payment reminders. Kept on this phone (never in the data file). */
function remindersSection() {
  const o = reminderOpts();
  const chk = (key, label) => h('label', { class: 'inline-label check' }, h('input', { type: 'checkbox', checked: o[key] !== false, onchange: (e) => { setReminderOpts({ [key]: e.target.checked }); } }), ' ' + label);
  return section('Payment reminders (this phone)', h('div', { class: 'kv' },
    h('label', { class: 'inline-label check' }, h('input', { type: 'checkbox', checked: !!o.on, onchange: async (e) => {
      if (e.target.checked) { const p = await reminderPermission(true); if (p !== 'granted') { e.target.checked = false; toast('Allow notifications for Family Wealth in the phone settings', 'bad'); return; } }
      setReminderOpts({ on: e.target.checked }); rerender();
    } }), ' Remind me about payments'),
    o.on ? h('div', { class: 'kv' },
      h('label', { class: 'inline-label' }, 'Time of day ', h('select', { onchange: (e) => setReminderOpts({ hour: Number(e.target.value) }) }, [7, 8, 9, 10, 12, 18, 20].map((x) => h('option', { value: x, selected: o.hour === x }, (x % 12 || 12) + (x < 12 ? ' am' : ' pm'))))),
      chk('emi', 'Loan EMIs (the day before, on the day, and if late)'),
      chk('bonds', 'Bond interest (as many days before as set on Fixed income)'),
      chk('receipts', 'Money due to you'),
      chk('maturities', 'Bonds, deposits, chits and lending that mature'),
      chk('amounts', 'Show amounts in the note (turn off to keep them private on the lock screen)'),
      btn('Send a test reminder', async () => { const n = await planReminders(true); toast(n ? n + ' reminder' + (n === 1 ? '' : 's') + ' planned' : 'Nothing is due in the next 45 days'); }, 'small'),
      h('p', { class: 'note' }, 'Reminders are planned on this phone each time you open the app. If you do not open it for a few weeks they run out, so open it now and then.')) : null));
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

  { const rp = restorePoints(); if (rp) root.append(rp); }
  root.append(storageInfo());
  root.append(section('Data file',
    h('div', null, h('p', { class: 'note' }, 'A backup is a single JSON file. Keep one somewhere safe, for example in Google Drive.'),
      h('div', { class: 'row' },
        btn('Download backup', () => { download(`portfolio-data-${C.todayISO()}.json`, JSON.stringify(data, null, 1)); toast('Backup downloaded'); }, 'primary'),
        canEdit() ? btn('Restore from file', async () => { const d = await pickFile(); if (!d) return; if (!validData(d)) return toast('That file is not a portfolio data file.', 'bad'); if (await confirmDialog('Replace everything in the app with this file?', 'Restore')) { await doRestore(d); } }) : null))));

  root.append(section('About', h('p', null, 'Family Wealth version ', h('b', null, VERSION), ' · released ' + RELEASED + '. If this number is older than the one you expect, close the app fully and open it again so the new files load.')));
  if (isNative()) root.append(remindersSection());
  root.append(section('This device',
    h('div', { class: 'kv' },
      h('div', { class: 'inline-label' }, 'Text size ', h('span', { class: 'fs-pick' }, [['Smaller', 0.8], ['Small', 0.9], ['Normal', 1], ['Large', 1.15], ['Larger', 1.3], ['Largest', 1.5]].map(([l, v]) => h('button', { 'aria-pressed': String(Math.abs((S.cfg.fontScale || 1) - v) < 0.001), onclick: () => { setCfg({ fontScale: v }); document.documentElement.style.setProperty('--fs', v); rerender(); } }, l)))),
      h('label', { class: 'inline-label' }, 'Theme ', h('select', { onchange: (e) => { setCfg({ theme: e.target.value }); document.documentElement.dataset.theme = e.target.value === 'auto' ? '' : e.target.value; } },
        [['auto', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: S.cfg.theme === v }, l)))),
      h('label', { class: 'inline-label check' }, h('input', { type: 'checkbox', checked: S.cfg.useLive, onchange: (e) => setCfg({ useLive: e.target.checked }) }), ' Use refreshed live prices on this device'),
      h('p', { class: 'note' }, `App data last changed ${data.updatedAt ? new Date(data.updatedAt).toLocaleString('en-IN') : '–'}.`),
      btn('Erase data from this device', async () => { if (await confirmDialog('Erase the data and settings stored on this device? Data in Google Drive is not touched.', 'Erase')) resetAll(); }, 'danger'))));
  return root;
}
