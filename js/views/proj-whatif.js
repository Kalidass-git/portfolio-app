// Wealth projector → What-if: try a purchase, a sale or a spend against your risk limits and see where you would stand.
// Nothing here is saved to your records; it is a scratch pad.
import { S } from '../store.js';
import * as P from '../projector.js';
import * as R from '../risk.js';
import { h, money, compact, monthLabel, section, stat, table, btn, formDialog, toast } from '../ui.js';
import { lineChart, donut, legend } from '../charts.js';
import { rerender, outlooks, signed, pc, tone, outlookToggle, datalistId } from './proj-shared.js';
import { currentPlan } from './proj-year.js';
import { statusTag, limitText, shareText } from './proj-risk.js';
import { groupedTable, groupOfClass } from './groupmix.js';

const KEY = 'pt.whatif';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } };
const wi = Object.assign({ entries: [], outlook: 'steady', keep: false, years: 5 }, load() || {});
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(wi)); } catch { /* private mode */ } };
const pcs = (x, d = 1) => (x == null ? '–' : (Math.round(x * 100 * 10 ** d) / 10 ** d) + '%');
const KINDS = [{ value: 'invest', label: 'Buy or invest (a trade, bond purchase, new loan, SIP)' }, { value: 'sell', label: 'Sell or withdraw' }, { value: 'spend', label: 'Spend (tax, trip, down payment)' }];
const WHERE = { shares: 'Shares (a trade)', etfs: 'ETFs (a trade)', funds: 'Mutual funds (buy or SIP)', bonds: 'Bonds (a purchase)', lending: 'Private lending (a new loan)', fds: 'FDs & compounding loans', chits: 'Chits', lic: 'Insurance & recurring deposits', gold: 'Gold', pf: 'EPF & PPF', other: 'Others' };
const FIXED = ['bonds', 'lending', 'fds', 'chits', 'lic'];
const kindLabel = (k) => (KINDS.find((x) => x.value === k) || {}).label;

const MKT = ['shares', 'etfs', 'funds'];
function entryForm(e) {
  const hold = R.holdings(S.data, S.all);
  const names = datalistId('wi-names', hold.flatMap((x) => [x.name, ...x.keys.filter(Boolean)]));
  const priceOf = (nm) => { const k = String(nm || '').trim().toLowerCase(); const x = k && hold.find((y) => y.price && [y.name, ...y.keys].some((z) => String(z || '').toLowerCase() === k)); return x ? x.price : null; };
  const isMkt = (v) => v.kind !== 'spend' && MKT.includes(v.cls);
  const calc = (el, inputs) => { const q = Number(inputs.qty.value), p = Number(inputs.price.value); if (q > 0 && p > 0) inputs.amount.value = Math.round(q * p * 100) / 100; };
  formDialog({
    title: e ? 'Change this what-if' : 'Add a what-if', saveLabel: 'Save', value: e ? { ...e, rate: e.rate != null ? Math.round(e.rate * 10000) / 100 : '' } : { kind: 'invest', cls: 'shares', name: '', qty: '', price: '', amount: '', rate: '', monthly: '', funding: 'cash' },
    deleteMessage: 'Remove this from the what-if?',
    fields: [
      { key: 'kind', label: 'What', type: 'select', options: KINDS },
      { key: 'cls', label: 'Where', type: 'select', options: P.CLASSES.filter((c) => c.key !== 'cash').map((c) => ({ value: c.key, label: WHERE[c.key] || c.label })), showIf: (v) => v.kind !== 'spend' },
      { key: 'name', label: 'Which one (optional)', list: names, hint: 'A share, ETF or fund (name or symbol), a bond issuer, or a person you would lend to. Pick one you hold, or type a new one. Leave empty to add to the whole group.', showIf: (v) => v.kind !== 'spend', onInput: (el, inputs) => { const p = priceOf(el.value); if (p && !inputs.price.value) { inputs.price.value = Math.round(p * 100) / 100; calc(null, inputs); } } },
      { key: 'qty', label: 'Quantity (shares or units)', type: 'number', half: true, showIf: isMkt, onInput: calc },
      { key: 'price', label: 'Price each (₹)', type: 'number', half: true, showIf: isMkt, hint: 'Filled from your holding’s last price when you pick one. Change it freely.', onInput: calc },
      { key: 'amount', label: 'Amount (₹)', type: 'number', half: true, hint: 'Or enter quantity and price above.' },
      { key: 'rate', label: 'Interest rate (% a year)', type: 'number', half: true, hint: 'Of this bond, loan or deposit. Empty uses your usual rate for it.', showIf: (v) => v.kind === 'invest' && FIXED.includes(v.cls) },
      { key: 'monthly', label: 'Then every month (₹)', type: 'number', half: true, hint: 'A monthly instalment on top, such as a SIP.', showIf: (v) => v.kind === 'invest' },
      { key: 'funding', label: 'Paid from', type: 'select', options: [{ value: 'cash', label: 'My bank balances' }, { value: 'new', label: 'New money from outside' }], showIf: (v) => v.kind === 'invest' },
    ],
    onSave: (v) => {
      const amount = v.qty > 0 && v.price > 0 ? Math.round(v.qty * v.price * 100) / 100 : Number(v.amount) || 0;
      if (!(amount > 0)) { toast('Enter an amount, or a quantity and a price.'); return false; }
      const rec = { id: e ? e.id : 'w' + Date.now().toString(36), kind: v.kind, cls: v.kind === 'spend' ? 'cash' : v.cls, name: v.kind === 'spend' ? '' : String(v.name || '').trim(), qty: v.qty || 0, price: v.price || 0, amount, rate: v.kind === 'invest' && FIXED.includes(v.cls) && v.rate !== '' && v.rate != null && !isNaN(Number(v.rate)) ? Number(v.rate) / 100 : null, monthly: v.kind === 'invest' ? Number(v.monthly) || 0 : 0, funding: v.kind === 'invest' ? v.funding : 'cash' };
      const i = wi.entries.findIndex((x) => x.id === rec.id); if (i >= 0) wi.entries[i] = rec; else wi.entries.push(rec); save(); rerender();
    },
    onDelete: e ? () => { wi.entries = wi.entries.filter((x) => x.id !== e.id); save(); rerender(); } : null,
  });
}
const toRisk = (e) => (e.kind === 'spend' ? { spend: e.amount } : e.kind === 'sell' ? { cls: e.cls, name: e.name, amount: -e.amount, funding: 'cash' } : { cls: e.cls, name: e.name, amount: e.amount, funding: e.funding });

export function render(root) {
  const { data, all } = S;
  const cfg = R.riskCfg(data), now = R.stateNow(data, all), evNow = R.evaluate(cfg, now);
  const after = R.applyEntries(now, wi.entries.map(toRisk)), evAfter = R.evaluate(cfg, after);
  const b = P.baseline(data, all);
  const { plan } = currentPlan();
  const oc = outlooks();

  // ---------- the what-ifs ----------
  const total = wi.entries.reduce((s, e) => s + (e.kind === 'invest' ? e.amount : 0), 0);
  root.append(section('Try something', h('div', null,
    wi.entries.length ? table([
      { label: 'What', host: true, render: (e) => h('span', null, h('b', null, e.kind === 'spend' ? 'Spend' : (e.kind === 'sell' ? 'Sell · ' : 'Invest · ') + (e.name || P.classOf(e.cls).label)), e.name && e.kind !== 'spend' ? h('small', { class: 'sub' }, ' ' + P.classOf(e.cls).label) : null, e.rate != null ? h('small', { class: 'sub' }, ' at ' + pc(e.rate, 2).replace(/\.?0+%$/, '%') + ' a year') : null) },
      { label: 'Amount', cls: 'r', render: (e) => h('span', null, money(e.amount), e.qty > 0 && e.price > 0 ? h('small', { class: 'sub' }, ` ${e.qty} × ₹${e.price}`) : null) },
      { label: 'Monthly', mob: 'under', mlabel: 'then ', cls: 'r', get: (e) => (e.monthly ? money(e.monthly) : '–') },
      { label: 'Paid from', mob: 'hide', get: (e) => (e.kind === 'invest' ? (e.funding === 'cash' ? 'bank balances' : 'new money') : e.kind === 'sell' ? 'goes to bank' : 'bank balances') },
      { label: 'Most you could put in', cls: 'r', mob: 'under', mlabel: 'room ', render: (e) => { if (e.kind !== 'invest') return h('span', null, '–'); const others = R.applyEntries(now, wi.entries.filter((x) => x.id !== e.id).map(toRisk)); const hr = R.headroom(cfg, others, { cls: e.cls, name: e.name, funding: e.funding }); return hr.room == null ? h('span', { class: 'muted' }, 'no limit') : h('span', { class: e.amount > hr.room + 1 ? 'neg' : 'pos', title: hr.why }, money(hr.room)); } },
      { label: 'Exposure of that holding', mob: 'under', mlabel: 'exposure ', render: (e) => { const a = R.exposureOf(cfg, after, e.name, e.cls); if (!a) return h('span', { class: 'muted' }, '–'); const b0 = R.exposureOf(cfg, now, e.name, e.cls); const over = (a.max != null && a.pct > a.max + 1e-9) || (a.maxAmt != null && a.value > a.maxAmt + 1); return h('span', { class: over ? 'neg' : '' }, `${pcs(b0 ? b0.pct : 0)} → ${pcs(a.pct)}`, h('small', { class: 'sub' }, a.max != null ? ` limit ${pcs(a.max, 0)} ${R.ofText(a.of)}` : a.maxAmt != null ? ` limit ${compact(a.maxAmt)}` : ' no limit')); } },
    ], wi.entries, { onRow: (e) => entryForm(wi.entries.find((x) => x.id === e.id)) }) : h('p', { class: 'empty' }, 'Nothing yet. Add an investment you are thinking about, such as ₹25,00,000 in private lending, or ₹1,00,000 more in a share, and see where it leaves you against your limits.'),
    h('div', { class: 'btn-row' }, btn('Add a what-if', () => entryForm(null), 'primary', { keep: true }), wi.entries.length ? btn('Clear all', () => { wi.entries = []; save(); rerender(); }, '', { keep: true }) : null),
    h('p', { class: 'note' }, 'Nothing here changes your records. It is a scratch pad: it is cleared when you close the app.'))));

  if (!wi.entries.length) { root.append(section('Where you stand today', summary(cfg, evNow, null, b))); root.append(h('p', { class: 'note' }, 'Limits are set on the Risk limits tab.')); return; }

  // ---------- right after ----------
  const newBreaches = evAfter.breaches.filter((x) => !evNow.breaches.some((y) => y.key === x.key));
  const newNear = evAfter.near.filter((x) => !evNow.near.some((y) => y.key === x.key));
  const cashAfter = after.cls.cash || 0;
  root.append(h('div', { class: 'stats' },
    stat('Verdict', evAfter.breaches.length ? h('span', { class: 'neg' }, newBreaches.length ? `Goes over ${newBreaches.length} limit${newBreaches.length > 1 ? 's' : ''}` : `${evAfter.breaches.length} limit${evAfter.breaches.length > 1 ? 's' : ''} still over`) : newNear.length ? h('span', { class: 'warn' }, `Close to ${newNear.length} limit${newNear.length > 1 ? 's' : ''}`) : h('span', { class: 'pos' }, 'Within your limits'), evAfter.breaches.length ? 'see what to change below' : newNear.length ? 'allowed, but nearly at the limit' : 'after all of this'),
    stat('Total assets after', money(after.total), `${signed(after.total - now.total)} from today`),
    stat('Bank balances after', h('span', { class: cashAfter < 0 ? 'neg' : '' }, money(cashAfter)), cashAfter < 0 ? 'not enough cash for this' : `${money(now.cls.cash || 0)} today`),
    stat('Monthly commitment', money(wi.entries.reduce((s, e) => s + (e.monthly || 0), 0)), 'extra every month')));

  if (evAfter.breaches.length) {
    root.append(section('What goes over, and how to fix it', h('ul', { class: 'findings' }, evAfter.breaches.map((x) => {
      const rel = wi.entries.find((e) => (x.kind === 'class' && e.cls === x.key) || (x.kind === 'item' && e.name && x.name.toLowerCase().includes(e.name.toLowerCase())) || (x.kind === 'bucket' && (cfg.classes[e.cls] || {}).bucket === x.key));
      let fix = '';
      if (rel && rel.kind === 'invest') { const others = R.applyEntries(now, wi.entries.filter((e) => e.id !== rel.id).map(toRisk)); const hr = R.headroom(cfg, others, { cls: rel.cls, name: rel.name, funding: rel.funding }); fix = hr.room != null ? ` You can put in at most ${money(hr.room)} (${hr.why}).` : ''; }
      return h('li', null, h('b', null, x.name), ` would be ${shareText(x)}`, x.max != null ? `, limit ${pcs(x.max)}` : '', x.maxAmt != null && x.kind === 'item' ? `, limit ${money(x.maxAmt)}` : '', '. ', h('span', { class: 'neg' }, `Over by ${money(x.excess)}.`), fix, evNow.breaches.some((y) => y.key === x.key) ? ' (already over today)' : '');
    }))));
  }

  if (!evAfter.breaches.length && newNear.length) root.append(section('Close to a limit', h('ul', { class: 'findings' }, newNear.map((x) => h('li', { class: 'amber' }, h('b', null, x.name), ` would be ${shareText(x)}`, x.max != null ? `, limit ${pcs(x.max)}` : '', x.maxAmt != null ? `, limit ${money(x.maxAmt)}` : '', '. ', h('span', { class: 'warn' }, `${Math.round(x.used * 100)}% of the limit used, ${money(x.room == null ? 0 : x.room)} left.`))))));

  root.append(section('Your mix, today and after', summary(cfg, evNow, evAfter, b)));

  // single holdings touched
  const touched = evAfter.items.filter((x) => wi.entries.some((e) => e.name && x.name.toLowerCase().includes(e.name.toLowerCase()))).concat(evAfter.items.filter((x) => x.over && !wi.entries.some((e) => e.name && x.name.toLowerCase().includes(e.name.toLowerCase()))));
  if (touched.length) root.append(section('Single holdings after', table([
    { label: 'Holding', host: true, get: (x) => x.name }, { label: 'Amount', cls: 'r', get: (x) => money(x.value) },
    { label: 'Share', mob: 'under', mlabel: 'share ', cls: 'r', get: (x) => shareText(x) },
    { label: 'Limit', mob: 'under', mlabel: 'limit ', cls: 'r', get: (x) => limitText(x) }, { label: 'Room left', mob: 'hide', cls: 'r', get: (x) => money(x.room) }, { label: '', render: statusTag },
  ], touched)));

  // ---------- over time ----------
  const years = wi.years, months = years * 12;
  const a0 = plan ? plan.a : P.defaults(data, all);
  const uni = Object.fromEntries(P.MARKET.map((k) => [k, wi.outlook]));
  const keepInv = wi.keep ? (a0.invest || []) : [];
  // a bond, loan or deposit with its own rate is its own pot from day one; everything else joins its kind at the usual rate
  const rated = wi.entries.filter((e) => e.kind === 'invest' && e.rate != null);
  const monthly = wi.entries.filter((e) => e.kind === 'invest' && e.rate == null && e.monthly > 0).map((e, i) => ({ id: 'wi' + i, name: e.name || P.classOf(e.cls).label, cls: e.cls, monthly: e.monthly }))
    .concat(rated.map((e, i) => ({ id: 'wr' + i, name: e.name || P.classOf(e.cls).label, cls: e.cls, monthly: e.monthly || 0, lump: e.amount, rate: e.rate })));
  const aBase = { ...a0, outlook: uni, invest: keepInv, marketRate: null };
  const aWith = { ...aBase, invest: keepInv.concat(monthly) };
  const withVals = { ...after.cls }; for (const e of rated) withVals[e.cls] = Math.max(0, (withVals[e.cls] || 0) - e.amount);
  const startBase = { values: { ...now.cls }, liab: b.liab, month: b.month }, startWith = { values: withVals, liab: b.liab, month: b.month };
  const base = P.simulate(startBase, aBase, oc, months), withR = P.simulate(startWith, aWith, oc, months);
  const hz = [...new Set([3, 6, 12, 24, months].filter((m) => m <= months))].sort((x, y) => x - y);
  const at = (rows, m) => rows[m - 1];

  root.append(section('How it grows', h('div', null,
    h('div', { class: 'filters' },
      h('label', null, 'Look ahead ', h('select', { 'aria-label': 'Years ahead', onchange: (e) => { wi.years = +e.target.value; save(); rerender(); } }, [1, 2, 3, 5, 7, 10, 15, 20].map((n) => h('option', { value: n, selected: n === wi.years }, `${n} year${n > 1 ? 's' : ''}`)))),
      h('label', { class: 'check-inline' }, h('input', { type: 'checkbox', checked: wi.keep, onchange: (e) => { wi.keep = e.target.checked; save(); rerender(); } }), plan ? ` Keep investing as in the ${plan.year} plan` : ' Keep investing as in my recent history')),
    outlookToggle(uni, (id) => { wi.outlook = id; save(); rerender(); }, { label: 'Market outlook' }),
    (() => {
      const step = Math.max(1, Math.ceil(months / 48)); const idx = []; for (let m = step; m <= months; m += step) idx.push(m); if (idx[idx.length - 1] !== months) idx.push(months);
      return lineChart({ labels: [monthLabel(b.month), ...idx.map((m) => monthLabel(at(withR, m).month))], fmt: money, yMin: Math.floor((Math.min(b.net, ...idx.map((m) => at(base, m).nw), ...idx.map((m) => at(withR, m).nw)) * 0.97) / 1e6) * 1e6, series: [{ name: 'Without this', values: [b.net, ...idx.map((m) => at(base, m).nw)], dashed: true, color: 1 }, { name: 'With this', values: [after.total - b.liab, ...idx.map((m) => at(withR, m).nw)], color: 0 }] });
    })(),
    table([
      { label: 'After', host: true, get: (m) => (m < 12 ? `${m} months` : m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''}` : `${m} months`) },
      { label: 'Without', cls: 'r', get: (m) => money(at(base, m).nw) },
      { label: 'With this', cls: 'r', get: (m) => money(at(withR, m).nw) },
      { label: 'Difference', cls: 'r', render: (m) => { const d = at(withR, m).nw - at(base, m).nw; return h('span', { class: tone(d) }, signed(d)); } },
      { label: 'Interest / month', mob: 'hide', cls: 'r', get: (m) => money(at(withR, m).interest) },
    ], hz),
    h('p', { class: 'note' }, 'Both columns use the same salary, spending and outlook; only your what-ifs differ. Paying from bank balances moves money, so the difference is just what it earns. New money from outside also adds to the total.'))));

  // risk mix over time
  const mix = [{ m: 0, st: after }].concat(hz.map((m) => ({ m, st: { total: at(withR, m).assets, cls: at(withR, m).values, items: [] } })));
  const evs = mix.map((x) => ({ m: x.m, ev: R.evaluate(cfg, x.st) }));
  const cols = cfg.buckets.filter((bk) => evs.some((x) => x.ev.buckets.find((y) => y.key === bk.id).value > 1));
  root.append(section('How the mix drifts', h('div', null,
    table([
      { label: 'When', host: true, get: (x) => (x.m === 0 ? 'Right after' : x.m < 12 ? `${x.m} months` : `${x.m / 12} year${x.m > 12 ? 's' : ''}`) },
      ...cols.map((bk) => ({ label: bk.name + (bk.max != null ? ` (max ${pcs(bk.max, 0)})` : ''), cls: 'r', render: (x) => { const y = x.ev.buckets.find((z) => z.key === bk.id); return h('span', { class: y.over ? 'neg' : '' }, pcs(y.pct)); } })),
      { label: 'Over', mob: 'under', mlabel: '', get: (x) => (x.ev.breaches.length ? x.ev.breaches.map((y) => y.name).join(', ') : '–') },
    ], evs),
    firstBreach(cfg, withR, evAfter, b),
    h('p', { class: 'note' }, 'Shares and funds that grow faster than the rest take a bigger share over time, so a mix that is fine today can cross a limit later. Single-holding limits are checked for today only.'))));
}

/** Plain-language note on when a limit is first crossed during the run. */
function firstBreach(cfg, rows, evAfter, b) {
  const seen = new Map();
  for (const r of rows) { const ev = R.evaluate(cfg, { total: r.assets, cls: r.values, items: [] }); for (const x of ev.breaches) if (!seen.has(x.key) && !evAfter.breaches.some((y) => y.key === x.key)) seen.set(x.key, { name: x.name, month: r.month, pct: x.pct, max: x.max }); }
  return seen.size ? h('ul', { class: 'findings' }, [...seen.values()].map((x) => h('li', null, h('b', null, x.name), ` crosses its ${pcs(x.max)} limit in `, h('b', null, monthLabel(x.month, true)), ` and reaches ${pcs(x.pct)} if nothing is rebalanced.`))) : null;
}

function summary(cfg, ev, ev2, b) {
  const e = ev2 || ev;
  const bs = ev.buckets.filter((x) => x.value > 0).map((x) => ({ label: x.name, value: x.value }));
  const bs2 = e.buckets.filter((x) => x.value > 0).map((x) => ({ label: x.name, value: x.value }));
  const was = (c) => ev.classes.find((x) => x.key === c.key);
  const S_ = (it, f) => it.reduce((a, c) => a + f(c), 0);
  const inS = (it, f) => S_(it.filter((c) => c.inScope), f);
  const table2 = groupedTable({
    rows: e.classes.filter((c) => c.value > 1 || was(c).value > 1), groupOf: (c) => groupOfClass(c.key),
    cols: [
      { label: 'Kind' },
      ev2 ? { label: 'Amount today', hide: true, cls: 'r', parent: (it) => money(S_(it, (c) => was(c).value)), child: (c) => money(was(c).value) } : null,
      ev2 ? { label: 'Amount after', hide: true, cls: 'r', parent: (it) => money(S_(it, (c) => c.value)), child: (c) => money(c.value) } : null,
      { label: 'Today', cls: 'r', parent: (it) => pcs(inS(it, (c) => was(c).pct)), child: (c) => pcs(was(c).pct) },
      ev2 ? { label: 'After', cls: 'r', parent: (it) => h('span', { class: it.some((c) => c.over) ? 'neg' : it.some((c) => c.near) ? 'warn' : '' }, pcs(inS(it, (c) => c.pct))), child: (c) => h('span', { class: c.over ? 'neg' : c.near ? 'warn' : '' }, pcs(c.pct)) } : null,
      { label: 'Limit', cls: 'r', parent: () => '', child: (c) => (c.max != null ? pcs(c.max) : '–') },
      { label: 'Room left', hide: true, cls: 'r', parent: () => '', child: (c) => (c.room == null ? '–' : money(c.room)) },
      { label: '', parent: (it) => (it.some((c) => c.over) ? h('span', { class: 'tag bad' }, 'over') : it.some((c) => c.near) ? h('span', { class: 'tag warn' }, 'close') : ''), child: statusTag },
    ].filter(Boolean),
  });
  return h('div', null,
    ev2 ? h('div', { class: 'grid2' }, h('div', null, h('p', { class: 'mini-title' }, 'Today'), donut(bs, { fmt: money, center: compact(ev.total), sub: 'assets', size: 170 })), h('div', null, h('p', { class: 'mini-title' }, 'After'), donut(bs2, { fmt: money, center: compact(e.total), sub: 'assets', size: 170 }))) : h('div', null, donut(bs, { fmt: money, center: compact(ev.total), sub: 'assets', size: 190 }), legend(bs, { fmt: money })),
    ev2 ? legend(bs2, { fmt: money }) : null,
    table2);
}
