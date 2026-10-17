// Wealth projector → Risk limits: set how much of your money each risk group, kind of holding and single holding may take.
import { S, mutate } from '../store.js';
import * as P from '../projector.js';
import * as R from '../risk.js';
import { h, money, compact, section, stat, table, btn, formDialog, canEdit, toast } from '../ui.js';
import { strip, legend } from '../charts.js';
import { signed, datalistId, rerender } from './proj-shared.js';

const pcs = (x, d = 1) => (x == null ? '–' : (Math.round(x * 100 * 10 ** d) / 10 ** d) + '%');
const inPct = (x) => (x == null ? '' : Math.round(x * 1000) / 10);
const outPct = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v) / 100);
const outAmt = (v) => (v === '' || v == null || isNaN(Number(v)) || Number(v) <= 0 ? null : Number(v));
const risk = (d) => (d.risk = d.risk || {});

export const statusTag = (r) => (r.over ? h('span', { class: 'tag bad' }, 'over') : r.near ? h('span', { class: 'tag warn', title: `${Math.round(r.used * 100)}% of the limit used` }, 'close') : (r.max != null || r.maxAmt != null) ? h('span', { class: 'tag good' }, 'ok') : h('span', { class: 'muted' }, 'no limit'));
export const limitText = (r) => [r.max != null ? pcs(r.max) + ' ' + R.ofText(r.base || r.of) : null, r.maxAmt != null ? '₹' + compact(r.maxAmt).replace('₹', '') : null].filter(Boolean).join(' or ') || '–';
export const toneOf = (r) => (r.over ? 'neg' : r.near ? 'warn' : '');
export const shareText = (b) => pcs(b.pct) + (b.kind === 'item' ? ' ' + R.ofText(b.base) : b.of && b.of !== 'total' ? ' ' + R.ofText(b.of) : '');

function groupForm(cfg) {
  formDialog({
    title: 'Risk groups', saveLabel: 'Save',
    value: Object.fromEntries(cfg.buckets.flatMap((b) => [[b.id + '_n', b.name], [b.id + '_m', inPct(b.max)], [b.id + '_a', b.maxAmt]])),
    fields: cfg.buckets.flatMap((b) => [{ key: b.id + '_n', label: 'Name', required: true }, { key: b.id + '_m', label: 'Most allowed (%)', type: 'number', half: true, hint: b.id === cfg.buckets[0].id ? 'Leave empty for no limit. Percent or rupees, or both: the stricter one applies.' : null }, { key: b.id + '_a', label: 'Or most rupees', type: 'number', half: true }]),
    onSave: (v) => mutate((d) => { risk(d).buckets = cfg.buckets.map((b) => ({ id: b.id, name: v[b.id + '_n'] || b.name, max: outPct(v[b.id + '_m']), maxAmt: outAmt(v[b.id + '_a']) })); }),
    extraActions: [{ label: 'Back to defaults', onclick: () => mutate((d) => { delete risk(d).buckets; }) }],
  });
}
function classForm(cfg, row) {
  formDialog({
    title: row.name, saveLabel: 'Save', value: { bucket: row.bucket, max: inPct(row.max), maxAmt: cfg.classes[row.key].maxAmt, of: cfg.classes[row.key].of || '' },
    fields: [
      { key: 'bucket', label: 'Risk group', type: 'select', options: cfg.buckets.map((b) => ({ value: b.id, label: b.name })) },
      { key: 'max', label: 'Most allowed (%)', type: 'number', half: true, hint: `Today it is ${pcs(row.pct)}. Leave empty for no limit.` },
      { key: 'of', label: 'Percent of', type: 'select', half: true, options: [{ value: '', label: 'Follow the main setting' }, { value: 'invest', label: 'Investments only' }] },
      { key: 'maxAmt', label: 'Or most rupees in total', type: 'number', hint: 'Percent, rupees or both: the stricter one applies.' },
    ],
    onSave: (v) => mutate((d) => { const r = risk(d); r.classes = r.classes || {}; r.classes[row.key] = { bucket: v.bucket, max: outPct(v.max), maxAmt: outAmt(v.maxAmt), of: v.of || null }; }),
  });
}
function ruleForm(cfg, scope) {
  const rl = cfg.rules[scope.key];
  formDialog({
    title: scope.label, saveLabel: 'Save', value: { max: inPct(rl.max), maxAmt: rl.maxAmt, of: rl.of },
    fields: [
      { key: 'max', label: `Most any one ${scope.unit} may be (%)`, type: 'number', half: true },
      { key: 'of', label: 'Percent of', type: 'select', half: true, options: R.BASES.map((b) => ({ value: b.value, label: b.value === 'group' ? `Its own group (all your ${({ stocks: 'shares', etfs: 'ETFs', funds: 'funds', bonds: 'bonds', lending: 'loans' })[scope.key]})` : b.label })) },
      { key: 'maxAmt', label: `Or most rupees in any one ${scope.unit}`, type: 'number', hint: 'Both can be set. The stricter one applies.' },
    ],
    onSave: (v) => mutate((d) => { const r = risk(d); r.rules = r.rules || {}; r.rules[scope.key] = { max: outPct(v.max), maxAmt: outAmt(v.maxAmt), of: v.of }; }),
  });
}
function overrideForm(cfg, ov) {
  const names = R.holdings(S.data, S.all);
  formDialog({
    title: ov ? 'Limit for ' + ov.name : 'Limit for one holding', saveLabel: 'Save', value: ov ? { scope: ov.scope, name: ov.name, max: inPct(ov.max), maxAmt: ov.maxAmt, of: ov.of || '' } : { scope: 'stocks', name: '', max: '', maxAmt: '', of: '' },
    fields: [
      { key: 'scope', label: 'Kind', type: 'select', options: R.SCOPES.map((s) => ({ value: s.key, label: s.label.replace('Each ', '') })) },
      { key: 'name', label: 'Name or symbol (a share, fund, ETF, bond issuer or person)', required: true, list: datalistId('risk-names', names.flatMap((x) => [x.name, ...x.keys.filter(Boolean)])) },
      { key: 'max', label: 'Most allowed (%)', type: 'number', half: true },
      { key: 'of', label: 'Percent of', type: 'select', half: true, options: [{ value: '', label: 'Same as the rule for its kind' }, ...R.BASES.map((b) => ({ value: b.value, label: b.label }))] },
      { key: 'maxAmt', label: 'Or most rupees', type: 'number', hint: 'Both can be set. The stricter one applies.' },
    ],
    onSave: (v) => mutate((d) => { const r = risk(d); r.overrides = r.overrides || cfg.overrides.map((x) => ({ ...x })); const rec = { id: ov ? ov.id : 'ov' + Date.now().toString(36), scope: v.scope, name: String(v.name).trim(), max: outPct(v.max), maxAmt: outAmt(v.maxAmt), of: v.of || null }; const i = r.overrides.findIndex((x) => x.id === rec.id); if (i >= 0) r.overrides[i] = rec; else r.overrides.push(rec); }),
    onDelete: ov ? () => mutate((d) => { const r = risk(d); r.overrides = (r.overrides || cfg.overrides).filter((x) => x.id !== ov.id); }) : null,
    deleteMessage: 'Remove this limit?',
  });
}

export function render(root) {
  const { data, all } = S;
  const cfg = R.riskCfg(data), st = R.stateNow(data, all), ev = R.evaluate(cfg, st);
  const T = ev.total;
  const worstItem = ev.items.slice().sort((a, b) => b.pct - a.pct)[0];
  const top = st.items.slice().sort((a, b) => b.value - a.value)[0];

  root.append(section('How limits work', h('div', null,
    h('div', { class: 'filters' }, h('label', null, 'Show amber when a limit is ', h('select', { 'aria-label': 'Amber at', onchange: (e) => { if (canEdit()) mutate((d) => { risk(d).nearAt = Number(e.target.value); }); else toast('Only the owner can change this'); } }, [0.8, 0.9, 0.95].map((v) => h('option', { value: v, selected: v === cfg.nearAt }, Math.round(v * 100) + '% used'))))),
    h('p', { class: 'note' }, 'Limits are shares of your investments only: bank balances are left out of both the amount and the total. A kind, rule or holding can instead be measured against market-linked holdings or its own group: tap it to change.'))));
  root.append(h('div', { class: 'stats' },
    stat('Limits', ev.breaches.length ? h('span', { class: 'neg' }, `${ev.breaches.length} over`) : ev.near.length ? h('span', { class: 'warn' }, `${ev.near.length} close`) : h('span', { class: 'pos' }, 'All within'), ev.breaches.length ? (ev.near.length ? `and ${ev.near.length} close to a limit` : 'see the list below') : ev.near.length ? 'nothing over, but close' : 'nothing is above a limit you set'),
    stat('Total assets', money(T), 'everything is measured against this'),
    stat('High and very high risk', pcs(ev.buckets.filter((b) => b.key === 'high' || b.key === 'vhigh').reduce((a, b) => a + b.pct, 0)), 'of your investments'),
    top ? stat('Largest single holding', pcs(top.value / T), `${top.name} · ${money(top.value)}`) : null));

  root.append(section('What needs attention', h('div', null, ev.breaches.length
    ? h('ul', { class: 'findings' }, ev.breaches.map((b) => h('li', null, h('b', null, b.name), b.kind === 'item' ? ` (${(R.SCOPES.find((s) => s.key === b.scope) || {}).unit || ''})` : b.kind === 'bucket' ? ' (risk group)' : '', ` is ${shareText(b)}`, b.max != null ? `, limit ${pcs(b.max)}` : '', b.maxAmt != null && b.kind === 'item' ? `, limit ${money(b.maxAmt)}` : '', '. ', h('span', { class: 'neg' }, `Over by ${money(b.excess)}.`), ' ', h('a', { href: '#/projector/whatif' }, 'Try a rebalance in What-if'))))
    : ev.near.length ? h('p', { class: 'empty' }, 'Nothing is over a limit.') : h('p', { class: 'empty' }, 'Everything is within the limits you set. Use What-if before a new investment to see if it still will be.'),
    ev.near.length ? h('ul', { class: 'findings' }, ev.near.map((b) => h('li', { class: 'amber' }, h('b', null, b.name), ` is ${shareText(b)}`, b.max != null ? `, limit ${pcs(b.max)}` : '', b.maxAmt != null ? `, limit ${money(b.maxAmt)}` : '', '. ', h('span', { class: 'warn' }, `${Math.round(b.used * 100)}% of the limit used, ${money(b.room == null ? 0 : b.room)} left.`)))) : null)));

  // ---------- risk groups ----------
  const bs = ev.buckets.filter((b) => b.value > 0).map((b) => ({ label: b.name, value: b.value }));
  root.append(section('By risk group', h('div', null,
    bs.length ? [strip(bs, { fmt: money }), legend(bs, { fmt: money })] : null,
    table([
      { label: 'Risk group', host: true, get: (b) => b.name },
      { label: 'Now', cls: 'r', get: (b) => pcs(b.pct), mob: 'under', mlabel: 'now ' },
      { label: 'Amount', mob: 'hide', cls: 'r', get: (b) => money(b.value) },
      { label: 'Limit', cls: 'r', get: (b) => limitText({ ...b, of: undefined }) },
      { label: 'Room left', mob: 'under', mlabel: 'room ', cls: 'r', get: (b) => (b.room == null ? '–' : money(b.room)) },
      { label: '', render: statusTag },
    ], ev.buckets),
    canEdit() ? btn('Edit risk groups', () => groupForm(cfg), '', { keep: true }) : null)));

  // ---------- kinds of holding ----------
  root.append(section('By kind of holding', h('div', null,
    table([
      { label: 'Kind', host: true, get: (c) => c.name },
      { label: 'Risk group', mob: 'under', get: (c) => (cfg.buckets.find((b) => b.id === c.bucket) || {}).name },
      { label: 'Now', cls: 'r', get: (c) => (c.inScope ? pcs(c.pct) : 'not counted'), mob: 'under', mlabel: 'now ' },
      { label: 'Amount', mob: 'hide', cls: 'r', get: (c) => money(c.value), total: () => money(T) },
      { label: 'Limit', cls: 'r', get: (c) => limitText({ ...c, base: undefined, of: c.of === cfg.basis ? undefined : c.of }) },
      { label: 'Room left', mob: 'hide', cls: 'r', get: (c) => (c.room == null ? '–' : money(c.room)) },
      { label: '', render: statusTag },
    ], ev.classes.filter((c) => c.value > 1 || c.max != null), { onRow: canEdit() ? (c) => classForm(cfg, c) : null, footer: { label: 'Total' } }),
    h('p', { class: 'note' }, 'Tap a row to change its risk group or its limit. Room left is how much more could go in, paid from cash, before the limit is reached.'))));

  // ---------- single-holding rules ----------
  root.append(section('One holding at a time', h('div', null,
    table([
      { label: 'Rule', host: true, get: (s) => s.label },
      { label: 'Most allowed', cls: 'r', get: (s) => { const r = cfg.rules[s.key]; return [r.max != null ? pcs(r.max) + ' ' + R.ofText(r.of) : null, r.maxAmt != null ? money(r.maxAmt) : null].filter(Boolean).join(' · ') || 'No limit'; } },
      { label: 'Largest now', mob: 'under', mlabel: 'largest ', get: (s) => { const g = st.items.filter((x) => x.scope === s.key), G = g.reduce((a, x) => a + x.value, 0), t = g.slice().sort((a, b) => b.value - a.value)[0]; if (!t) return '–'; const rl = cfg.rules[s.key]; return `${t.name} ${pcs(t.value / R.baseValue(rl.of, st, G))}`; } },
    ], R.SCOPES, { onRow: canEdit() ? (s) => ruleForm(cfg, s) : null }),
    h('p', { class: 'note' }, 'Bonds are counted per issuer (all Navi bonds together) and private lending per person. A limit of a few percent of a group is stricter than the same percent of everything.'))));

  root.append(section('Limits for named holdings', h('div', null,
    table([
      { label: 'Holding', host: true, get: (o) => o.name }, { label: 'Kind', mob: 'under', get: (o) => (R.SCOPES.find((s) => s.key === o.scope) || {}).label.replace('Each ', '') },
      { label: 'Most allowed', cls: 'r', get: (o) => [o.max != null ? pcs(o.max) + (o.of ? ' ' + R.ofText(o.of) : '') : null, o.maxAmt != null ? money(o.maxAmt) : null].filter(Boolean).join(' · ') || '–' },
    ], cfg.overrides, { onRow: canEdit() ? (o) => overrideForm(cfg, cfg.overrides.find((x) => x.id === o.id)) : null, empty: 'None yet. Add one for a share, fund, bond issuer or person you want to cap separately.' }),
    canEdit() ? btn('Add a limit', () => overrideForm(cfg, null), 'primary', { keep: true }) : null)));

  // ---------- single holdings against limits ----------
  const rows = ev.items.slice().sort((a, b) => b.used - a.used).slice(0, 15);
  if (rows.length) root.append(section('Closest to their limit', h('div', null,
    table([
      { label: 'Holding', host: true, get: (x) => x.name }, { label: 'Kind', mob: 'hide', get: (x) => R.SCOPES.find((s) => s.key === x.scope).unit },
      { label: 'Amount', cls: 'r', get: (x) => money(x.value) },
      { label: 'Share', mob: 'under', mlabel: 'share ', cls: 'r', get: (x) => shareText(x) },
      { label: 'Limit', mob: 'under', mlabel: 'limit ', cls: 'r', get: (x) => limitText(x) },
      { label: 'Room left', mob: 'hide', cls: 'r', get: (x) => money(x.room) }, { label: '', render: statusTag },
    ], rows), h('p', { class: 'note' }, 'Showing the 15 holdings nearest their limit.'))));
}
