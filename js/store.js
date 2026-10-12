// App state, local persistence and sync with the Google Drive backend (Apps Script).
import { computeAll, todayISO } from './calc.js';
import * as remote from './remote.js';

const K = { data: 'pt.data', cfg: 'pt.cfg', quotes: 'pt.quotes', meta: 'pt.meta' };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const S = {
  data: null,
  cfg: { backendUrl: '', key: '', useLive: true, theme: 'auto', asOf: '' },
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
  recompute(); emit();
}

let pushTimer = null;
/** Apply a change to the data. Owner only. Saves locally right away and syncs to Drive shortly after. */
export function mutate(fn) {
  if (S.role !== 'owner') throw new Error('This device has read-only access.');
  const draft = S.data;
  fn(draft);
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
      if (res.version !== S.meta.version) { S.status = 'conflict'; emit(); return { conflict: true, remote: res }; }
      return push();
    }
    if (!res.data) { S.status = 'idle'; emit(); return { empty: true }; }
    setData(res.data, { dirty: false, version: res.version });
    S.meta.lastSync = new Date().toISOString(); write(K.meta, S.meta);
    S.status = 'idle'; S.error = ''; emit();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function push({ force = false } = {}) {
  if (!S.remote || S.role !== 'owner') return;
  S.status = 'syncing'; emit();
  try {
    const res = await remote.call(S.cfg.backendUrl, S.cfg.key, 'write', { data: S.data, baseVersion: force ? null : S.meta.version });
    if (res.conflict) { S.status = 'conflict'; emit(); return { conflict: true, remote: res }; }
    S.meta.version = res.version; S.meta.dirty = false; S.meta.lastSync = new Date().toISOString();
    write(K.meta, S.meta);
    S.status = 'idle'; S.error = ''; emit();
    return { ok: true };
  } catch (e) { return fail(e); }
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
