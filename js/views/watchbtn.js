// The star on a share's page: "☆ Watch" / "★ Watching". One list: a tap adds or removes. Several: a small sheet to tick the lists. None yet: the sheet asks for a name.
import { S, mutate } from '../store.js';
import { h, btn, canEdit, dialog, toast } from '../ui.js';
import * as WL from '../watchlists.js';

function sheet({ symbol, name, yahoo, index }) {
  const lists = WL.lists(S.data), on = new Set(WL.listsOf(S.data, symbol).map((l) => l.id));
  const want = new Set(on);
  const checks = lists.map((l) => h('label', { class: 'check-inline', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0' } },
    h('input', { type: 'checkbox', checked: on.has(l.id), onchange: (e) => (e.target.checked ? want.add(l.id) : want.delete(l.id)) }), `${l.name} · ${(l.items || []).length}`));
  const fresh = h('input', { type: 'text', placeholder: lists.length ? 'New watchlist name (optional)' : 'Name your first watchlist', value: lists.length ? '' : 'My watchlist', 'aria-label': 'New watchlist', style: { width: '100%' } });
  dialog(`Watch ${name || symbol}`, h('div', null, h('p', { class: 'note' }, 'Pick the watchlists this share should be on.'), checks, h('div', { style: { marginTop: '10px' } }, fresh)), [
    { label: 'Cancel', onclick: (close) => close() },
    { label: 'Save', class: 'primary', onclick: (close) => {
      mutate((d) => {
        const nm = fresh.value.trim();
        if (nm) want.add(WL.addList(d, nm).id);
        for (const l of WL.lists(d)) {
          const has = (l.items || []).some((it) => WL.norm(it.symbol) === symbol);
          if (want.has(l.id) && !has) WL.addItem(d, l.id, { symbol, name, yahoo, index });
          else if (!want.has(l.id) && has) WL.removeItem(d, l.id, symbol);
        }
      });
      close(); toast('Watchlists updated');
    } }]);
}

export function watchButton({ symbol, name = '', yahoo = '', index = false }) {
  const sym = WL.norm(symbol), on = WL.listsOf(S.data, sym);
  if (!canEdit()) return on.length ? h('span', { class: 'chip watch-on' }, '★ Watching') : null;
  const one = (add) => { const l = WL.lists(S.data)[0]; mutate((d) => { if (add) WL.addItem(d, l.id, { symbol: sym, name, yahoo, index }); else WL.removeItem(d, l.id, sym); }); toast(add ? 'Added to ' + l.name : 'Removed from ' + l.name); };
  const click = () => { const n = WL.lists(S.data).length; if (n === 1) one(!on.length); else sheet({ symbol: sym, name, yahoo, index }); };
  const b = btn(on.length ? '★ Watching' + (on.length > 1 ? ` · ${on.length}` : '') : '☆ Watch', click, 'small' + (on.length ? ' watch-on' : ''));
  b.title = on.length ? 'On: ' + on.map((l) => l.name).join(', ') : 'Add to a watchlist';
  return b;
}
