// Restore points: full copies of the data kept on this device (IndexedDB), created, restored and deleted by hand.
const DB = 'pt-backups', STORE = 'points';
const open = () => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('This browser cannot keep restore points.'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('Could not open storage'));
});
const run = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, mode); const out = fn(tx.objectStore(STORE)); tx.oncomplete = () => { db.close(); res(out && out.result !== undefined ? out.result : undefined); }; tx.onerror = () => { db.close(); rej(tx.error); }; });
};

const brief = (d) => ({ ledger: (d.ledger || []).length, trades: (d.trades || []).length, stocks: (d.stocks || []).length, funds: (d.mutualFunds || []).length });

export async function createPoint(data, name, kind = 'manual') {
  const json = JSON.stringify(data);
  const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: (name || '').trim() || 'Restore point', kind, createdAt: new Date().toISOString(), size: json.length, counts: brief(data), json };
  await run('readwrite', (s) => s.put(rec));
  return rec.id;
}
/** Newest first, without the heavy data. */
export async function listPoints() {
  const all = await run('readonly', (s) => s.getAll());
  return (all || []).map(({ json, ...r }) => r).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
export async function getPoint(id) { const r = await run('readonly', (s) => s.get(id)); return r ? { ...r, data: JSON.parse(r.json) } : null; }
export const deletePoint = (id) => run('readwrite', (s) => s.delete(id));
/** Keep the newest `keep` restore points, delete the rest. Returns how many were deleted. */
export async function pruneKeep(keep) { const l = await listPoints(); const old = l.slice(keep); for (const r of old) await deletePoint(r.id); return old.length; }

/** Keep the newest `keep` automatic restore points; never touches the ones you made. */
export async function pruneAuto(keep) {
  const l = (await listPoints()).filter((r) => r.kind === 'auto');
  for (const r of l.slice(keep)) await deletePoint(r.id);
}
export async function hasPointToday(kind = 'auto', prefix = 'Daily') {
  const today = new Date().toISOString().slice(0, 10);
  return (await listPoints()).some((r) => r.kind === kind && r.name.startsWith(prefix) && r.createdAt.slice(0, 10) === today);
}
