// Risk limits and what-if checks. Pure functions, no DOM.
//
// Every limit is a share of something. What it is measured against is the "basis":
//   total    everything you own, bank balances included
//   invest   investments only: everything except bank balances
//   market   market-linked money only: shares, ETFs and mutual funds
//   group    its own group (for one share: all your shares; for one fund: all your funds ...)
//
// data.risk (all optional, merged over the defaults below):
//   basis:     'total' | 'invest'                       what kind and risk-group limits are measured against
//   nearAt:    0.9                                      a limit that is this much used is shown amber (over is red)
//   buckets:   [{ id, name, max, maxAmt }]              risk groups; max = share allowed, maxAmt = rupees allowed (either, both or neither)
//   classes:   { [class]: { bucket, max, maxAmt, of } } risk group and caps of each kind of holding; of = own basis or null to follow `basis`
//   rules:     { stocks|etfs|funds|bonds|lending: { max, maxAmt, of } }   one cap for every single holding of that kind
//   overrides: [{ id, scope, name, max, maxAmt, of }]   a different cap for one named holding (KTKBANK, Navi ...)
import * as P from './projector.js';

export const BUCKETS = [
  { id: 'safe', name: 'Safe', max: null }, { id: 'low', name: 'Low risk', max: null }, { id: 'medium', name: 'Medium risk', max: null },
  { id: 'high', name: 'High risk', max: null }, { id: 'vhigh', name: 'Very high risk', max: null },
];
export const BASES = [
  { value: 'invest', label: 'Investments only (leave out bank balances)' },
  { value: 'market', label: 'Market-linked only (shares, ETFs, funds)' },
  { value: 'group', label: 'Its own group (all shares, all funds ...)' },
];
export const ofText = (of) => ({ total: 'of everything', invest: 'of investments', market: 'of market-linked', group: 'of its group' }[of] || 'of everything');
const MARKET3 = ['shares', 'etfs', 'funds'];
const CLASS_DEFAULT = {
  cash: ['safe', null], pf: ['safe', null], lic: ['safe', null], other: ['safe', null], fds: ['low', null], gold: ['low', null],
  chits: ['medium', null], bonds: ['medium', null], etfs: ['medium', null], funds: ['medium', null], shares: ['high', null], lending: ['high', 0.15],
};
export const SCOPES = [
  { key: 'stocks', label: 'Each share', cls: 'shares', unit: 'share', of: 'group' },
  { key: 'etfs', label: 'Each ETF', cls: 'etfs', unit: 'ETF', of: 'group' },
  { key: 'funds', label: 'Each mutual fund', cls: 'funds', unit: 'fund', of: 'group' },
  { key: 'bonds', label: 'Each bond issuer', cls: 'bonds', unit: 'issuer', of: 'invest' },
  { key: 'lending', label: 'Each person lent to', cls: 'lending', unit: 'borrower', of: 'invest' },
  { key: 'fds', label: 'Each FD bank / issuer', cls: 'fds', unit: 'issuer', of: 'invest' },
  { key: 'chits', label: 'Each chit organiser', cls: 'chits', unit: 'chit group', of: 'invest' },
  { key: 'lic', label: 'Each insurance / RD', cls: 'lic', unit: 'policy', of: 'invest' },
];
// which rules a what-if purchase into a kind of holding can fall under (first = where a new name goes)
const SCOPES_OF = { shares: ['stocks'], etfs: ['etfs'], funds: ['funds'], bonds: ['bonds'], lending: ['lending'], fds: ['fds', 'lending'], chits: ['chits'], lic: ['lic'] };
const RULE_DEFAULT = { stocks: { max: 0.12 } };

/** The settings with defaults filled in. */
export function riskCfg(data) {
  const r = (data && data.risk) || {};
  const basis = 'invest'; // always investments only: bank balances are never part of a limit (an old 'total' choice is read as 'invest')
  const inv = (o) => (o === 'total' ? 'invest' : o);
  const nearAt = r.nearAt > 0 && r.nearAt < 1 ? r.nearAt : 0.9;
  const buckets = (r.buckets && r.buckets.length ? r.buckets : BUCKETS).map((b) => ({ maxAmt: null, ...b }));
  const classes = {};
  for (const c of P.CLASSES) { const d = CLASS_DEFAULT[c.key] || ['medium', null]; const o = (r.classes && r.classes[c.key]) || {}; classes[c.key] = { bucket: o.bucket || d[0], max: o.max !== undefined ? o.max : d[1], maxAmt: o.maxAmt ?? null, of: inv(o.of) || null }; }
  const rules = {};
  for (const s of SCOPES) { const o = (r.rules && r.rules[s.key]) || {}; const d = RULE_DEFAULT[s.key] || {}; rules[s.key] = { max: o.max !== undefined ? o.max : d.max ?? null, maxAmt: o.maxAmt !== undefined ? o.maxAmt : d.maxAmt ?? null, of: inv(o.of) || s.of }; }
  const overrides = r.overrides ? r.overrides.map((x) => ({ ...x })) : [{ id: 'ov1', scope: 'bonds', name: 'Navi', max: null, maxAmt: 1000000 }];
  return { basis, nearAt, buckets, classes, rules, overrides };
}

const norm = (s) => String(s || '').trim().toLowerCase();
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const scopesOf = (cls) => SCOPES_OF[cls] || [];
/** The holding a name refers to, among the rules a kind of holding can fall under. */
const findItem = (items, cls, name) => (name ? items.find((x) => !x.anon && scopesOf(cls).includes(x.scope) && x.keys.some((k) => norm(k) === norm(name))) : null);

/** What a share is measured against, in rupees. grp = value of the holding's own group. */
export function baseValue(of, st, grp) {
  if (of === 'invest') return st.total - (st.cls.cash || 0);
  if (of === 'market') return sum(MARKET3, (k) => st.cls[k]);
  if (of === 'group') return grp;
  return st.total;
}
/** 1 if putting x into `cls` also grows that base by x, else 0 (paying from cash leaves "everything" unchanged). */
function growth(of, funding, cls) {
  if (of === 'group') return 1;
  if (of === 'invest') return cls === 'cash' ? 0 : 1;
  if (of === 'market') return MARKET3.includes(cls) ? 1 : 0;
  return funding === 'new' ? 1 : 0;
}

/**
 * Every holding the limits can be checked against.
 * { id, scope, cls, name, keys:[...names it answers to], value }.
 */
export function holdings(data, all) {
  const out = [];
  const eq = all.stocks.items;
  for (const x of eq.filter((x) => !x.assetClass || x.assetClass === 'equity')) out.push({ id: 'st:' + x.id, scope: 'stocks', cls: 'shares', name: x.name, keys: [x.symbol, x.name], value: x.current || 0, price: x.livePrice || x.price || 0 });
  for (const x of eq.filter((x) => x.assetClass === 'etf')) out.push({ id: 'st:' + x.id, scope: 'etfs', cls: 'etfs', name: x.name, keys: [x.symbol, x.name], value: x.current || 0, price: x.livePrice || x.price || 0 });
  for (const x of all.mf.items) out.push({ id: 'mf:' + x.id, scope: 'funds', cls: 'funds', name: x.name, keys: [x.name, x.schemeCode], value: x.current || 0, price: x.liveNav || x.nav || 0 });
  const by = new Map();
  for (const b of all.bonds) { const k = (b.company || b.name || '').trim() || b.name; const o = by.get(norm(k)) || { id: 'bd:' + norm(k), scope: 'bonds', cls: 'bonds', name: k, keys: [k], value: 0, count: 0 }; o.value += b.principal || 0; o.count++; by.set(norm(k), o); }
  out.push(...by.values());
  const lb = new Map();
  for (const l of all.lending) { const k = String(l.borrower || '').trim() || String(l.name || '').replace(/^\s*(to|from)\s+/i, '').trim(); const o = lb.get(norm(k)) || { id: 'ln:' + norm(k), scope: 'lending', cls: l.interestType === 'Payout' ? 'lending' : 'fds', name: k, keys: [k], value: 0, count: 0 }; o.value += l.principal || 0; o.count++; lb.set(norm(k), o); }
  out.push(...lb.values());
  const group = (rows, scope, cls, key, val) => { const m = new Map(); for (const x of rows) { const k = key(x) || x.name; const o = m.get(norm(k)) || { id: scope + ':' + norm(k), scope, cls, name: k, keys: [k], value: 0, count: 0 }; o.value += val(x) || 0; o.count++; m.set(norm(k), o); } out.push(...m.values()); };
  // an FD is by its bank (TNPFC_1 and TNPFC_2 are one issuer); a chit by its organiser (5L_Ravi and 10L_Ravi are one)
  group(all.fds, 'fds', 'fds', (x) => String(x.issuer || '').trim() || String(x.name || '').replace(/[\s_-]*\d+$/, '').replace(/\s+FD$/i, '').trim(), (x) => x.principal);
  group(all.savings.filter((x) => x.type === 'Chit'), 'chits', 'chits', (x) => String(x.organiser || '').trim() || String(x.name || '').replace(/^\s*\d+(\.\d+)?\s*L?\s*[_-]\s*/i, '').replace(/[\s_-]*\d+(\.\d+)?\s*L$/i, '').trim(), (x) => x.principal);
  group(all.savings.filter((x) => !['Chit', 'EPF', 'PPF'].includes(x.type)), 'lic', 'lic', (x) => String(x.organiser || '').trim() || x.name, (x) => x.principal);
  return out;
}

/** The ruling that applies to one holding: its own override, else the rule for its kind. */
export function ruleFor(cfg, hld) {
  const ov = cfg.overrides.find((o) => o.scope === hld.scope && hld.keys.some((k) => norm(k) === norm(o.name)));
  const base = cfg.rules[hld.scope] || {};
  return { max: ov && ov.max != null ? ov.max : ov && ov.maxAmt != null && ov.max == null ? null : base.max, maxAmt: ov ? ov.maxAmt ?? null : base.maxAmt ?? null, of: (ov && ov.of) || base.of || 'group', override: !!ov };
}

/** Room left under one cap. cap: share, amtCap: rupees, value now, base in rupees, f: how much of the money added also grows the base (0 or 1). */
export function room({ cap, amtCap, value, base, f = 1 }) {
  let x = Infinity;
  if (cap != null && cap * f < 1) x = (cap * base - value) / (1 - cap * f);
  if (amtCap != null) x = Math.min(x, amtCap - value);
  return x;
}

/** A state to check: { total, cls:{class:₹}, items:[holding] } from what you hold now. */
export function stateNow(data, all) {
  const b = P.baseline(data, all);
  return { total: b.assets, cls: { ...b.values }, items: holdings(data, all).map((x) => ({ ...x })) };
}

/** Mark a row: how much of its limit is used, over (red) or near (amber). */
function mark(r, cfg, pct, value, max, maxAmt) {
  const used = Math.max(max != null && max > 0 ? pct / max : 0, maxAmt != null && maxAmt > 0 ? value / maxAmt : 0);
  r.used = used; r.maxAmt = maxAmt ?? null;
  r.over = (max != null || maxAmt != null) && ((max != null && pct > max + 1e-9) || (maxAmt != null && value > maxAmt + 1));
  r.near = !r.over && (max != null || maxAmt != null) && used >= cfg.nearAt;
  return r;
}
/** Check a state against the settings. Returns class rows, bucket rows, item rows, every breach and everything near a limit. */
export function evaluate(cfg, st) {
  const T = st.total || 0;
  const classes = P.CLASSES.map((c) => {
    const v = st.cls[c.key] || 0, k = cfg.classes[c.key], of = k.of || cfg.basis;
    const inScope = !(of === 'invest' && c.key === 'cash');
    const B = baseValue(of, st, 0), pct = inScope && B ? v / B : 0;
    const r = mark({ kind: 'class', key: c.key, name: c.label, bucket: k.bucket, value: v, of, inScope, pct, max: k.max }, cfg, pct, inScope ? v : 0, k.max, k.maxAmt);
    r.excess = r.over ? Math.max(k.max != null ? v - k.max * B : 0, k.maxAmt != null ? v - k.maxAmt : 0) : 0;
    r.room = inScope && (k.max != null || k.maxAmt != null) ? Math.max(0, room({ cap: k.max, amtCap: k.maxAmt, value: v, base: B, f: growth(of, 'cash', c.key) })) : null;
    return r;
  });
  const buckets = cfg.buckets.map((b) => {
    const of = cfg.basis, B = baseValue(of, st, 0);
    const v = sum(classes.filter((c) => c.bucket === b.id && !(of === 'invest' && c.key === 'cash')), (c) => c.value);
    const pct = B ? v / B : 0;
    const r = mark({ kind: 'bucket', key: b.id, name: b.name, value: v, of, pct, max: b.max }, cfg, pct, v, b.max, b.maxAmt);
    r.excess = r.over ? Math.max(b.max != null ? v - b.max * B : 0, b.maxAmt != null ? v - b.maxAmt : 0) : 0;
    r.room = b.max != null || b.maxAmt != null ? Math.max(0, room({ cap: b.max, amtCap: b.maxAmt, value: v, base: B, f: of === 'total' ? 0 : 1 })) : null;
    return r;
  });
  const items = [];
  for (const s of SCOPES) {
    const grp = st.items.filter((x) => x.scope === s.key), G = sum(grp, (x) => x.value);
    for (const x of grp) {
      if (x.anon) continue;
      const rl = ruleFor(cfg, x); if (rl.max == null && rl.maxAmt == null) continue;
      const base = baseValue(rl.of, st, G), pct = base ? x.value / base : 0;
      const r = mark({ kind: 'item', key: x.id, scope: s.key, name: x.name, value: x.value, pct, base: rl.of, max: rl.max, override: rl.override }, cfg, pct, x.value, rl.max, rl.maxAmt);
      r.excess = Math.max(rl.max != null && pct > rl.max ? x.value - rl.max * base : 0, rl.maxAmt != null && x.value > rl.maxAmt ? x.value - rl.maxAmt : 0);
      r.room = Math.max(0, room({ cap: rl.max, amtCap: rl.maxAmt, value: x.value, base, f: growth(rl.of, 'cash', x.cls) }));
      items.push(r);
    }
  }
  const rows = [...classes, ...buckets, ...items];
  return { classes, buckets, items, breaches: rows.filter((r) => r.over), near: rows.filter((r) => r.near), total: T };
}

/**
 * Apply what-if purchases (and sales) to a state without touching your records.
 * entry: { cls, name?, amount (negative = sell), funding: 'new' | 'cash' } or { spend }.  Returns a new state.
 */
export function applyEntries(st, entries) {
  const s = { total: st.total, cls: { ...st.cls }, items: st.items.map((x) => ({ ...x })) };
  let n = 0;
  for (const e of entries) {
    if (e.spend > 0) { s.cls.cash = (s.cls.cash || 0) - e.spend; s.total -= e.spend; continue; }   // money that leaves: tax, a trip, a down payment
    let amt = Number(e.amount) || 0; if (!amt || !e.cls) continue;
    if (amt < 0) amt = Math.max(amt, -(s.cls[e.cls] || 0));    // cannot sell more than is held
    s.cls[e.cls] = (s.cls[e.cls] || 0) + amt;
    const scopes = scopesOf(e.cls);
    if (e.funding === 'cash' || amt < 0) s.cls.cash = (s.cls.cash || 0) - amt; else s.total += amt;
    if (scopes.length) {
      let it = findItem(s.items, e.cls, e.name);
      if (!it && e.name) { it = { id: 'new:' + norm(e.name), scope: scopes[0], cls: e.cls, name: e.name, keys: [e.name], value: 0, isNew: true }; s.items.push(it); }
      if (!it) { it = { id: 'anon:' + (n++), scope: scopes[0], cls: e.cls, name: '(unnamed)', keys: [], value: 0, anon: true }; s.items.push(it); }   // counts toward its group, not checked alone
      it.value = Math.max(0, it.value + amt);
    }
  }
  return s;
}

/** How much more can go into one purchase before a limit is hit (state taken without that entry). */
export function headroom(cfg, st, e) {
  const cls = e.cls, funding = e.funding || 'new';
  const lim = [];
  const ck = cfg.classes[cls];
  if (ck && (ck.max != null || ck.maxAmt != null)) { const of = ck.of || cfg.basis; lim.push({ why: `${P.classOf(cls).label} limit ${[ck.max != null ? Math.round(ck.max * 1000) / 10 + '% ' + ofText(of) : null, ck.maxAmt != null ? rs(ck.maxAmt) : null].filter(Boolean).join(' or ')}`, x: room({ cap: ck.max, amtCap: ck.maxAmt, value: st.cls[cls] || 0, base: baseValue(of, st, 0), f: growth(of, funding, cls) }) }); }
  const bk = ck && cfg.buckets.find((b) => b.id === ck.bucket);
  if (bk && (bk.max != null || bk.maxAmt != null)) { const of = cfg.basis; const v = sum(P.CLASSES.filter((c) => cfg.classes[c.key].bucket === bk.id && !(of === 'invest' && c.key === 'cash')), (c) => st.cls[c.key]); lim.push({ why: `${bk.name} limit ${[bk.max != null ? Math.round(bk.max * 1000) / 10 + '% ' + ofText(of) : null, bk.maxAmt != null ? rs(bk.maxAmt) : null].filter(Boolean).join(' or ')}`, x: room({ cap: bk.max, amtCap: bk.maxAmt, value: v, base: baseValue(of, st, 0), f: growth(of, funding, cls) }) }); }
  if (scopesOf(cls).length && e.name) {
    const it = findItem(st.items, cls, e.name) || { scope: scopesOf(cls)[0], keys: [e.name], value: 0 };
    const G = sum(st.items.filter((x) => x.scope === it.scope), (x) => x.value);
    const rl = ruleFor(cfg, it);
    const base = baseValue(rl.of, st, G), f = growth(rl.of, funding, cls);
    if (rl.max != null) lim.push({ why: `${e.name}: at most ${Math.round(rl.max * 1000) / 10}% ${ofText(rl.of)}`, x: room({ cap: rl.max, value: it.value, base, f }) });
    if (rl.maxAmt != null) lim.push({ why: `${e.name}: at most ${rs(rl.maxAmt)}`, x: rl.maxAmt - it.value });
  }
  if (!lim.length) return { room: null, why: 'No limit set for this' };
  const m = lim.reduce((a, b) => (b.x < a.x ? b : a));
  return { room: Math.max(0, m.x), why: m.why, over: m.x < 0 ? -m.x : 0 };
}
const rs = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

/** The share of its base that one named holding would be in a state, with its limit: for the "exposure after" columns. */
export function exposureOf(cfg, st, name, cls) {
  if (!scopesOf(cls).length || !name) return null;
  const it = findItem(st.items, cls, name);
  const scope = it ? it.scope : scopesOf(cls)[0];
  const G = sum(st.items.filter((x) => x.scope === scope), (x) => x.value);
  const rl = ruleFor(cfg, it || { scope, keys: [name] });
  const base = baseValue(rl.of, st, G);
  return { value: it ? it.value : 0, pct: base && it ? it.value / base : 0, max: rl.max, maxAmt: rl.maxAmt, of: rl.of };
}
