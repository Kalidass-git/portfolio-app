// Full view for a chart card: the card fills the screen, its controls become a toolbar along the top and
// the chart is sized from the screen. Esc, the close button or leaving the page ends it.
// The page is rebuilt after every save or refresh, which makes a new card: the full view (and the landscape turn in the Android app) is handed to it, so it stays open.
import { h, icon, toast } from './ui.js';
import { canTurnScreen, setOrientation } from './native.js';

let live = null, watching = null;   // the full view that is open now: { key, land, owner: { connected() }, miss }
// when the card that holds the full view disappears and no rebuilt card takes it over (you went to another page), close it and give the screen back
function watch() {
  clearInterval(watching);
  watching = setInterval(() => {
    if (!live) { clearInterval(watching); return; }
    if (live.owner.connected()) { live.miss = 0; return; }
    if (++live.miss >= 4) { const was = live.land; live = null; clearInterval(watching); document.body.classList.remove('tm-lock'); if (was) setOrientation('auto'); }
  }, 500);
}

/** @param {() => HTMLElement} getCard  @param {() => void} redraw called whenever the size changes  @param {string} key what is shown, so a rebuilt card of the same chart takes the full view over */
export function fullView(getCard, redraw, key = '') {
  let on = false, land = false, fsUsed = false;
  const me = { connected: () => !!getCard() && getCard().isConnected };
  const card = { get isConnected() { const c = getCard(); return !!c && c.isConnected; }, classList: { toggle: (...a) => getCard().classList.toggle(...a) }, requestFullscreen: () => getCard().requestFullscreen && getCard().requestFullscreen() };
  const b = h('button', { type: 'button', class: 'tm-ib tm-expand', 'aria-label': 'Full view', title: 'Full view', onclick: () => set(!on) }, icon('expand'));
  // Android app only: a button that turns the screen to landscape while the full view is open (and back when it closes)
  const showLand = () => { rot.classList.toggle('on', land); rot.setAttribute('aria-pressed', String(land)); };
  const rot = h('button', { type: 'button', class: 'tm-ib tm-expand tm-rotate', 'aria-label': 'Landscape view', title: 'Landscape view', onclick: async () => {
    const next = !land, err = await setOrientation(next ? 'landscape' : 'auto');
    if (err) { toast(err, 'bad'); return; }
    land = next; if (live) live.land = land; showLand();
  } }, icon('rotate'));
  rot.hidden = true;
  const fit = () => { if (on) redraw(); };
  // the card was replaced (page rebuilt): drop this one's listeners; a new card of the same chart takes the full view over, or watch() closes it
  const gone = () => { detach(); on = false; };
  const onKey = (e) => { if (!card.isConnected) return gone(); if (e.key === 'Escape') set(false); };
  const onSize = () => { if (!card.isConnected) return gone(); if (on) fit(); };
  const onFs = () => { if (!card.isConnected) return gone(); if (on && !document.fullscreenElement && fsUsed) set(false); };
  function attach() { document.addEventListener('keydown', onKey); window.addEventListener('resize', onSize); document.addEventListener('fullscreenchange', onFs); }
  function detach() { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onSize); document.removeEventListener('fullscreenchange', onFs); }
  function set(v, adopt = false) {
    if (v === on) return;
    on = v;
    card.classList.toggle('tm-full', on);
    document.body.classList.toggle('tm-lock', on);
    b.replaceChildren(icon(on ? 'close' : 'expand'));
    rot.hidden = !(on && canTurnScreen());
    b.setAttribute('aria-label', on ? 'Close full view' : 'Full view'); b.title = on ? 'Close full view (Esc)' : 'Full view';
    if (on) {
      attach(); fsUsed = false;
      if (!adopt) live = { key, land: false, owner: me, miss: 0 };
      watch();
      // in the Android app the overlay alone fills the screen (and the browser's own fullscreen would end when the screen is turned)
      if (!adopt && !canTurnScreen()) try { const p = card.requestFullscreen && card.requestFullscreen(); if (p && p.then) p.then(() => { fsUsed = true; }).catch(() => {}); } catch (e) { /* the overlay alone is enough */ }
    } else {
      detach(); fsUsed = false; document.body.classList.remove('tm-lock');
      if (land) { land = false; showLand(); setOrientation('auto'); }
      if (live && live.owner === me) live = null;
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
    }
    redraw();
  }
  // a card that replaces the one that was in full view: open it the same way, and keep the landscape turn
  if (key) requestAnimationFrame(() => {
    if (!live || live.key !== key || live.owner === me || !card.isConnected) return;
    live.owner = me; live.miss = 0; land = !!live.land; showLand(); set(true, true);
  });
  return {
    button: b,
    rotate: rot,
    get on() { return on; },
    /** size for marketChart in the current mode */
    size(normalHeight) {
      if (!on) return { height: normalHeight };
      const phone = window.innerWidth < 640, sideways = Math.min(window.innerWidth, window.innerHeight) < 600 && window.innerWidth > window.innerHeight;   // a phone turned sideways: little height, so the panels are made lower
      const width = Math.max(320, Math.min(Math.round(window.innerWidth - (phone ? 24 : 40)), 2400));
      if (sideways) return { height: Math.max(120, window.innerHeight - 215), width, dense: true };
      return { height: Math.max(180, window.innerHeight - (phone ? 520 : 360)), width };
    },
  };
}
