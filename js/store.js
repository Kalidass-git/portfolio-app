// App state, local persistence and sync with the Google Drive backend (Apps Script).
import { createPoint, pruneAuto, hasPointToday } from './backups.js';
import { materialize, materializeFunds } from './trades.js';
import { computeAll, todayISO } from './calc.js';
import * as remote from './remote.js';
import { merge } from './merge.js';

const K = { data: 'pt.data', cfg: 'pt.cfg', quotes: 'pt.quotes', meta: 'pt.meta', base: 'pt.base' };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); if (S.saveFailed && (k === 'pt.data')) { S.saveFailed = false; } return true; } catch { if (k === 'pt.data') S.saveFailed = true; return false; } };

export const S = {
  saveFailed: false, guard: null,
  data: null,
  cfg: { backendUrl: '', key: '', useLive: true, theme: 'auto', asOf: '', fontScale: 1 },
  masked: true,           // hide figures until the eye icon is tapped; resets on every app open
  role: 'owner',          // 'owner' can edit, 'viewer' is read-only
  remote: false,          // true when a backend is configured
  meta: { version: 0, dirty: false, lastSync: null },
  quotes: {},
  status: 'idle',         // idle | syncing | error | offline | conflict
  error: '',
  all: null,              // computed portfolio
};
const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(S));

export function recompute() {
  if (!S.data) { S.all = null; return; }
  S.all = computeAll(S.data, { asOf: S.cfg.asOf || todayISO(), quotes: S.quotes, useLive: S.cfg.useLive });
}

export function init() {
  S.cfg = { ...S.cfg, ...read(K.cfg, {}) };
  S.meta = { ...S.meta, ...read(K.meta, {}) };
  S.quotes = read(K.quotes, {});
  S.data = read(K.data, null);
  S.remote = !!(S.cfg.backendUrl && S.cfg.key);
  S.role = S.remote ? (S.meta.role || 'viewer') : 'owner';
  if (S.data && !S.meta.dirty && !localStorage.getItem(K.base)) saveBase(S.data);
  recompute();
  return S;
}

export function setCfg(patch) {
  S.cfg = { ...S.cfg, ...patch };
  write(K.cfg, S.cfg);
  S.remote = !!(S.cfg.backendUrl && S.cfg.key);
  if (!S.remote) S.role = 'owner';
  recompute(); emit();
}

export function setData(data, { dirty = false, version } = {}) {
  S.data = data;
  if (version != null) S.meta.version = version;
  S.meta.dirty = dirty;
  write(K.data, data); write(K.meta, S.meta);
  if (!dirty) saveBase(data);
  recompute(); emit();
}

/** The copy as of the last sync: what a merge compares both sides against. */
const saveBase = (d) => { if (!write(K.base, d)) { try { localStorage.removeItem(K.base); } catch {} } };
const loadBase = () => read(K.base, null);

let pushTimer = null;
/** Apply a change to the data. Owner only. Saves locally right away and syncs to Drive shortly after. */
export function mutate(fn) {
  if (S.role !== 'owner') throw new Error('This device has read-only access.');
  let draft = S.data;
  const before = JSON.stringify(draft); // a change that fails half way must not leave half a change behind
  try {
    fn(draft);
    materialize(draft); materializeFunds(draft); // holdings follow the trades once a Groww history is imported
    const bad = sanity(draft);
    if (bad.length) throw new Error('That change would have damaged the data (' + bad[0] + '), so it was cancelled.');
  } catch (e) { S.data = JSON.parse(before); recompute(); emit(); throw e; }
  draft.updatedAt = new Date().toISOString();
  S.meta.dirty = true;
  recompute(); snapshot();
  write(K.data, draft); write(K.meta, S.meta);
  emit();
  if (S.remote) { clearTimeout(pushTimer); pushTimer = setTimeout(() => push().catch(() => {}), 1500); }
}

/** Keep one net worth reading per day so the Home screen can show a history. Owner only. */
function snapshot() {
  if (S.role !== 'owner' || !S.data || !S.all) return false;
  const hist = (S.data.history = S.data.history || []);
  const rec = { date: S.all.asOf, net: Math.round(S.all.netAsset), assets: Math.round(S.all.totalAssets), liab: Math.round(S.all.liabTotal) };
  const last = hist[hist.length - 1];
  if (last && last.date === rec.date) { if (last.net === rec.net && last.assets === rec.assets) return false; Object.assign(last, rec); return true; }
  if (last && last.date > rec.date) return false;
  hist.push(rec);
  return true;
}
/** Called when the app opens on the owner's device. */
export function startOfDaySnapshot() {
  if (!S.data || S.role !== 'owner') return;
  if (snapshot()) {
    S.meta.dirty = true; write(K.data, S.data); write(K.meta, S.meta);
    if (S.remote) { clearTimeout(pushTimer); pushTimer = setTimeout(() => push().catch(() => {}), 4000); }
  }
}

export function saveQuotes(q) {
  S.quotes = { ...S.quotes, ...q };
  write(K.quotes, S.quotes);
  recompute(); emit();
}

function fail(e) {
  S.status = navigator.onLine === false ? 'offline' : 'error';
  S.error = e.message || String(e);
  emit();
  throw e;
}

/** Check keys and learn whether this key can edit (owner) or only view. */
export async function connect(url, key) {
  const res = await remote.call(url, key, 'auth');
  S.cfg = { ...S.cfg, backendUrl: url, key };
  write(K.cfg, S.cfg);
  S.remote = true;
  S.role = res.role;
  S.meta.role = res.role;
  write(K.meta, S.meta);
  emit();
  return res.role;
}

export async function pull({ force = false } = {}) {
  if (!S.remote) return;
  S.status = 'syncing'; emit();
  try {
    const res = await remote.call(S.cfg.backendUrl, S.cfg.key, 'read');
    S.role = res.role; S.meta.role = res.role;
    if (S.meta.dirty && S.role === 'owner' && !force) {
      if (res.version !== S.meta.version) return reconcile(res);
      return push();
    }
    if (!res.data) { S.status = 'idle'; emit(); return { empty: true }; }
    if (S.data && S.role === 'owner' && sizes(res.data).ledger < sizes(S.data).ledger * 0.6) await safetyPoint('Before loading a much smaller Drive copy');
    setData(res.data, { dirty: false, version: res.version });
    S.meta.lastSync = new Date().toISOString(); write(K.meta, S.meta);
    S.status = 'idle'; S.error = ''; emit();
    return { ok: true };
  } catch (e) { return fail(e); }
}


// ---------- safety ----------
/** Counts that should not fall suddenly. */
const sizes = (d) => ({ ledger: (d.ledger || []).length, trades: (d.trades || []).length, mfTxns: (d.mfTxns || []).length, stocks: (d.stocks || []).length, funds: (d.mutualFunds || []).length, bonds: (d.bonds || []).length, lending: (d.lending || []).length, savings: (d.savings || []).length });
/** Structural check: refuse to save or upload something that is not a portfolio file. */
export function sanity(d) {
  const bad = [];
  if (!d || typeof d !== 'object') return ['data is empty'];
  for (const k of ['ledger', 'accounts', 'stocks', 'mutualFunds', 'bonds', 'fds', 'lending', 'savings', 'liabilities']) if (!Array.isArray(d[k])) bad.push(k + ' is missing');
  if (!d.settings || typeof d.settings !== 'object') bad.push('settings are missing');
  if (!bad.length) {
    const ids = new Set(); let dup = 0;
    for (const e of d.ledger) { if (ids.has(e.id)) dup++; ids.add(e.id); }
    if (dup) bad.push(dup + ' bank entries share an id');
    if (d.ledger.some((e) => !e.acct || !/^\d{4}-\d\d-\d\d/.test(e.date || ''))) bad.push('some bank entries have no account or date');
  }
  return bad;
}
/** Would uploading `d` throw away a lot compared with the last synced copy? Returns a list of what shrank. */
export function shrinkReport(d) {
  const base = loadBase(); if (!base) return [];
  const a = sizes(base), b = sizes(d), out = [];
  for (const k of Object.keys(a)) if (a[k] >= 10 && b[k] < a[k] * 0.6 && a[k] - b[k] >= 8) out.push({ what: k, from: a[k], to: b[k] });
  return out;
}
let shrinkOk = false;
/** Call just before a change that legitimately removes many entries (archive, full re-import). */
export const allowShrink = () => { shrinkOk = true; };
/** A restore point of this device's data, before something that could replace it. Keeps the newest 20 automatic ones. */
export async function safetyPoint(reason) {
  try { if (S.data) { await createPoint(S.data, reason, 'auto'); await pruneAuto(20); } } catch { /* storage may be unavailable: best effort */ }
}
/** Once a day, on the owner's device: a daily restore point. */
export async function dailyPoint() {
  if (!S.data || S.role !== 'owner') return;
  try { if (!(await hasPointToday('auto', 'Daily'))) await safetyPoint('Daily ' + new Date().toISOString().slice(0, 10)); } catch { /* ignore */ }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignore */ }
}
export function resolveGuard(choice) {
  const g = S.guard; S.guard = null;
  if (choice === 'sync') { shrinkOk = true; return push(); }
  if (choice === 'undo' && g && g.base) { setData(g.base, { dirty: false }); return pull({ force: true }); }
  emit();
}

export async function push({ force = false } = {}) {
  if (!S.remote || S.role !== 'owner') return;
  S.status = 'syncing'; emit();
  try {
    const bad = sanity(S.data);
    if (bad.length) { S.status = 'error'; S.error = 'Not uploaded because the data looks damaged: ' + bad[0] + '. Restore from a restore point in Settings.'; emit(); return { blocked: true }; }
    const shr = shrinkReport(S.data);
    if (shr.length && !shrinkOk && !force) { S.status = 'guard'; S.guard = { shrunk: shr, base: loadBase() }; emit(); return { guard: true }; }
    const sent = JSON.stringify(S.data);
    const res = await remote.call(S.cfg.backendUrl, S.cfg.key, 'write', { data: S.data, baseVersion: force ? null : S.meta.version });
    if (res.conflict) return reconcile();
    try { if (!write(K.base, JSON.parse(sent))) localStorage.removeItem(K.base); } catch {}
    shrinkOk = false; S.guard = null;
    S.meta.version = res.version; S.meta.dirty = S.data && JSON.stringify(S.data) !== sent; S.meta.lastSync = new Date().toISOString();
    write(K.meta, S.meta);
    S.status = 'idle'; S.error = ''; emit();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Another device saved first. Combine both sets of changes and upload the result. */
async function reconcile(remoteRes) {
  const res = remoteRes || await remote.call(S.cfg.backendUrl, S.cfg.key, 'read');
  const base = loadBase();
  if (!res.data || !base) { S.status = 'conflict'; emit(); return { conflict: true, remote: res }; }
  await safetyPoint('Before combining with another device');
  const m = merge(base, S.data, res.data);
  materialize(m.data); materializeFunds(m.data);
  m.data.updatedAt = new Date().toISOString();
  S.data = m.data; S.meta.version = res.version; S.meta.dirty = true;
  write(K.data, S.data); write(K.meta, S.meta);
  S.lastMerge = { at: Date.now(), clashes: m.clashes, renamed: m.renamed, fromRemote: m.fromRemote };
  recompute(); emit();
  const r = await push();
  return r && r.ok ? { ok: true, merged: S.lastMerge } : r;
}

/** Owner chose how to settle a conflict that could not be merged. */
export async function resolveConflict(choice) {
  if (choice === 'mine') return push({ force: true });
  return pull({ force: true });
}

export function disconnect() {
  S.cfg = { ...S.cfg, backendUrl: '', key: '' };
  write(K.cfg, S.cfg);
  S.remote = false; S.role = 'owner'; S.meta.role = null; write(K.meta, S.meta);
  emit();
}

export function resetAll() {
  Object.values(K).forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  location.hash = '#/home'; location.reload();
}

export const nextId = (prefix, list) => {
  const used = new Set(list.map((x) => String(x.id)));
  let i = list.length + 1;
  while (used.has(prefix + i)) i++;
  return prefix + i;
};
