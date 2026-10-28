// One place that talks to mfapi.in.
// mfapi.in sometimes answers without the CORS header (the browser then blocks it, even though the server said 200).
// So: try the browser first; if that fails, ask the backend (Apps Script) to read it on the server side, where CORS does not apply.
// Once the browser path fails in a session, the backend is tried first for the rest of the session (no repeated red errors).
import { S } from './store.js';
import { call } from './remote.js';

const BASE = 'https://api.mfapi.in/mf';
let directBlocked = false;

async function direct(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error('mfapi ' + r.status);
  return r.json();
}

async function viaBackend(path) {
  if (!S.cfg || !S.cfg.backendUrl) throw new Error('Fund prices are blocked in this browser and no backend is connected.');
  let res;
  try { res = await call(S.cfg.backendUrl, S.cfg.key, 'mf', { path }); }
  catch (e) {
    throw new Error(/Unknown action/i.test(e.message) ? 'Fund prices need the newer backend/Code.gs (it adds the “mf” action). Copy it into your Apps Script project and deploy a new version.' : e.message);
  }
  if (!res || res.error || res.body === undefined) throw new Error((res && res.error) || 'Fund price service did not answer.');
  return res.body;
}

/** path: '/152156', '/152156/latest' or '/search?q=hdfc'. Returns the parsed JSON. */
export async function mfGet(path) {
  if (!directBlocked) {
    try { return await direct(path); }
    catch (e) {
      try { return await direct(path); }   // one quick retry: the missing header is often a one-off
      catch (e2) {
        directBlocked = true;
        try { return await viaBackend(path); }
        catch (be) { directBlocked = false; throw be; } // backend not usable: keep trying the browser next time
      }
    }
  }
  try { return await viaBackend(path); }
  catch (be) {
    try { const j = await direct(path); directBlocked = false; return j; } catch { throw be; }
  }
}
