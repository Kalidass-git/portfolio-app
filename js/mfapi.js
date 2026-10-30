// One place that talks to mfapi.in.
// mfapi.in sometimes answers without the CORS header (the browser then blocks it, even though the server said 200).
// So: when a backend (Apps Script) is connected it reads mfapi.in on the server side, where CORS does not apply, and the browser is only a back-up.
import { S } from './store.js';
import { call } from './remote.js';

const BASE = 'https://api.mfapi.in/mf';

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hasBackend = () => !!(S.cfg && S.cfg.backendUrl);

/** path: '/152156', '/152156/latest' or '/search?q=hdfc'. Returns the parsed JSON.
 *  Up to 3 rounds. The backend (Apps Script) is asked first when connected, the browser only as a back-up or when there is no backend. */
export async function mfGet(path) {
  let lastErr;
  for (let round = 0; round < 3; round++) {
    const order = hasBackend() ? [viaBackend, direct] : [direct];   // with a backend connected it goes first, so the browser never makes the request that CORS blocks (and the console stays quiet)
    for (const fn of order) {
      try { return await fn(path); }
      catch (e) { lastErr = e; }
    }
    if (round < 2) await wait(500 * (round + 1));
  }
  throw lastErr || new Error('Fund price service did not answer.');
}

let batchOff = false;
/** Latest two NAVs for many funds from the backend in one call. Returns { navs: {code: {rows:[{date,nav},..]}}, errors } or null when the backend cannot do it (not connected, or an older Code.gs). */
export async function mfNavBatch(codes) {
  if (batchOff || !hasBackend() || !codes.length) return null;
  try {
    const res = await call(S.cfg.backendUrl, S.cfg.key, 'mfnav', { codes });
    return res && res.navs ? res : null;
  } catch (e) {
    if (/Unknown action/i.test(e.message)) batchOff = true;
    return null;
  }
}
