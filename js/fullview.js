// Full view for a chart card: the card fills the screen, its controls become a toolbar along the top and
// the chart is sized from the screen. Esc, the close button or leaving the page ends it.
import { h, icon } from './ui.js';
import { canTurnScreen, setOrientation } from './native.js';

/** @param {() => HTMLElement} getCard  @param {() => void} redraw called whenever the size changes */
export function fullView(getCard, redraw) {
  let on = false, land = false;
  const card = { get isConnected() { const c = getCard(); return !!c && c.isConnected; }, classList: { toggle: (...a) => getCard().classList.toggle(...a) }, requestFullscreen: () => getCard().requestFullscreen && getCard().requestFullscreen() };
  const b = h('button', { type: 'button', class: 'tm-ib tm-expand', 'aria-label': 'Full view', title: 'Full view', onclick: () => set(!on) }, icon('expand'));
  // Android app only: a button that turns the screen to landscape while the full view is open (and back when it closes)
  const rot = h('button', { type: 'button', class: 'tm-ib tm-expand tm-rotate', 'aria-label': 'Landscape view', title: 'Landscape view', onclick: async () => { const next = !land; if (await setOrientation(next ? 'landscape' : 'auto')) { land = next; rot.classList.toggle('on', land); rot.setAttribute('aria-pressed', String(land)); } } }, icon('rotate'));
  rot.hidden = true;
  const leaveLandscape = () => { if (land) { land = false; rot.classList.remove('on'); setOrientation('auto'); } };
  const fit = () => {
    if (!on) return;
    redraw();
  };
  const onKey = (e) => { if (!card.isConnected) return stop(); if (e.key === 'Escape') set(false); };
  const onSize = () => { if (!card.isConnected) return stop(); if (on) fit(); };
  const onFs = () => { if (!card.isConnected) return stop(); if (on && !document.fullscreenElement && fsUsed) set(false); };
  let fsUsed = false;
  function stop() { leaveLandscape(); rot.hidden = true; document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onSize); document.removeEventListener('fullscreenchange', onFs); document.body.classList.remove('tm-lock'); }
  function set(v) {
    if (v === on) return;
    on = v;
    card.classList.toggle('tm-full', on);
    document.body.classList.toggle('tm-lock', on);
    b.replaceChildren(icon(on ? 'close' : 'expand'));
    rot.hidden = !(on && canTurnScreen());
    b.setAttribute('aria-label', on ? 'Close full view' : 'Full view'); b.title = on ? 'Close full view (Esc)' : 'Full view';
    if (on) {
      document.addEventListener('keydown', onKey); window.addEventListener('resize', onSize); document.addEventListener('fullscreenchange', onFs);
      fsUsed = false;
      // in the Android app the overlay alone fills the screen (and the browser's own fullscreen would end when the screen is turned)
      if (!canTurnScreen()) try { const p = card.requestFullscreen && card.requestFullscreen(); if (p && p.then) p.then(() => { fsUsed = true; }).catch(() => {}); } catch (e) { /* the overlay alone is enough */ }
    } else {
      stop(); fsUsed = false;
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
    }
    redraw();
  }
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
