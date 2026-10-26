// Wealth outlook: pieces shared by its tabs (which plan is shown, the market-outlook what-if, the read-only plan settings, the "not committed" notice).
// Planning itself happens on the Planner tab (proj-plan.js). The other tabs only read the plan that has been made live.
import * as AL from '../allocation.js';
import { S } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import * as PL from '../planner.js';
import { h, money, pct, monthLabel, dateStr, section, btn } from '../ui.js';

export const rerender = () => window.dispatchEvent(new Event('rerender'));
export const outlooks = () => P.cfg(S.data).outlooks;
export const outlookRate = (id) => (outlooks().find((o) => o.id === id) || { rate: 0.09 }).rate;
export const ensure = (d) => { d.projector = d.projector || {}; const p = d.projector; p.years = p.years || {}; p.snapshots = p.snapshots || []; return p; };
export const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
export const pc = (r, d = 1) => (r == null || isNaN(r) ? '–' : (Math.round(r * 10 ** (d + 2)) / 10 ** d).toString().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '%');
export const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

/** Month keys from `from` to `to` inclusive. */
export const monthRange = (from, to) => { const out = []; for (let m = from; m <= to; m = C.addMonths(m + '-01', 1).slice(0, 7)) out.push(m); return out; };

// ---------- which plan is shown (the same on every tab) ----------
let selYear = null;
const selRev = {};   // year -> revision number being looked at (empty = the live one)
const thisYear = () => Number(String(S.all.asOf).slice(0, 4));
export const setSelYear = (y) => { selYear = String(y); };
/**
 * The plan for the chosen year. `plan` is the live copy (what the other tabs use), `working` the copy being edited, `stored` the saved record.
 * Plans can be made for this year and the next. A plan of the earlier version is not a choice: it is only offered for removal on the Planner tab.
 */
export function currentPlan() {
  const cfg = P.cfg(S.data), cy = thisYear();
  const mine = Object.values(cfg.years).filter(PL.isV2).map((p) => String(p.year));
  const choices = [...new Set([String(cy), String(cy + 1), ...mine])].sort();
  if (!selYear || !choices.includes(selYear)) selYear = mine.includes(String(cy)) ? String(cy) : mine[0] || String(cy);
  const raw = cfg.years[selYear], stored = PL.isV2(raw) ? raw : null;
  // versions on offer: the committed revisions (newest first) and the draft, when the plan has no live copy or has changes that are not live yet
  const revs = stored ? (stored.revisions || []).filter((r) => r.state).map((r) => r.rev).sort((a, b) => b - a) : [];
  const liveRev = stored && stored.live ? stored.live.rev : null;
  const hasDraft = !!stored && (!stored.live || PL.isDirty(stored));
  const pickd = selRev[selYear];
  const rev = pickd === 'draft' && hasDraft ? 'draft' : typeof pickd === 'number' && revs.includes(pickd) ? pickd : liveRev != null ? liveRev : hasDraft ? 'draft' : null;
  const plan = !stored || rev == null ? null : rev === 'draft' ? PL.effective(stored, 'working') : rev === liveRev ? PL.effective(stored, 'live') : PL.effective(stored, rev);
  return { stored, revs, liveRev, rev, hasDraft, draft: rev === 'draft', old: typeof rev === 'number' && rev !== liveRev, plan, working: stored ? PL.effective(stored, 'working') : null, year: selYear, choices, cfg, legacy: !!raw && !stored };
}
const choiceLabel = (y, cfg) => { const p = cfg.years[y]; return y + (PL.isV2(p) ? (p.live ? ` · live, revision ${p.live.rev}${PL.isDirty(p) ? ' (draft changes)' : ''}` : ' · draft') : ' · no plan yet'); };
/** The plan dropdown, and with `versions` the version dropdown (draft and every committed revision). */
export function planPicker({ onPick, versions = false } = {}) {
  const { choices, year, cfg, revs, liveRev, rev, old, draft, hasDraft, stored } = currentPlan();
  const box = h('div', { class: 'filters' }, h('label', null, 'Plan ', h('select', { 'aria-label': 'Plan', onchange: (e) => { setSelYear(e.target.value); if (onPick) onPick(); rerender(); } }, choices.map((y) => h('option', { value: y, selected: y === year }, choiceLabel(y, cfg))))));
  const opts = [...(hasDraft ? ['draft'] : []), ...revs];
  if (versions && stored && (opts.length > 1 || draft)) {
    const label = (n) => { if (n === 'draft') return liveRev == null ? 'Draft (not committed)' : 'Draft (changes not live yet)'; const r = stored.revisions.find((x) => x.rev === n); return `Revision ${n}${n === liveRev ? ' · live' : ''}${r ? ' · ' + dateStr(r.at.slice(0, 10)) : ''}`; };
    box.append(h('label', null, 'Version ', h('select', { 'aria-label': 'Plan version', onchange: (e) => { const v = e.target.value === 'draft' ? 'draft' : Number(e.target.value); if (v === liveRev) delete selRev[year]; else selRev[year] = v; rerender(); } }, opts.map((n) => h('option', { value: n, selected: n === rev }, label(n))))));
  }
  if (draft) box.append(h('p', { class: 'alert warn', style: { flexBasis: '100%', margin: 0 } }, h('b', null, liveRev == null ? 'You are looking at the draft, which is not live yet' : `You are looking at the draft, not the live revision ${liveRev}`), 'The numbers below use the draft’s settings from the Planner tab, with your real months. Nothing is changed.', liveRev != null ? h('span', null, ' ', h('a', { href: 'javascript:void 0', onclick: (e) => { e.preventDefault(); delete selRev[year]; rerender(); } }, 'Back to the live revision')) : null));
  else if (old) box.append(h('p', { class: 'alert warn', style: { flexBasis: '100%', margin: 0 } }, h('b', null, `You are looking at revision ${rev}, not the live revision ${liveRev}`), 'The numbers below use that revision’s settings, with your real months since. Nothing is changed. ', h('a', { href: 'javascript:void 0', onclick: (e) => { e.preventDefault(); delete selRev[year]; rerender(); } }, 'Back to the live revision')));
  return box;
}
/** Shown on a tab when the chosen year has no plan that is live. */
export function notLiveCard(ctx, what = 'this page') {
  const { year } = ctx;
  return section(`Plan ${year}`, h('div', { class: 'alert warn' }, h('b', null, `There is no plan for ${year} yet`),
    h('p', null, `${what[0].toUpperCase() + what.slice(1)} works from a plan. Create it on the Planner tab: a draft is enough to look at, and you can make it live later.`),
    btn('Open Planner', () => { location.hash = '#/projector/planner'; }, 'primary', { keep: true })));
}

// ---------- market outlook what-if: shown on This year and Market outlook, never saved ----------
const over = {};   // year -> { gold, shares, etfs, funds } outlook ids, for this visit only
const same = (a, b) => P.MARKET.every((k) => a[k] === b[k]);
export const outlookNow = (plan) => over[plan.year] || plan.a.outlook;
export const outlookOverride = (plan) => over[plan.year] || null;
export function setOutlookOverride(plan, next) { if (!next || same(next, plan.a.outlook)) delete over[plan.year]; else over[plan.year] = { ...next }; rerender(); }
export const pickAll = (plan, id) => setOutlookOverride(plan, Object.fromEntries(P.MARKET.map((k) => [k, id])));
export const pickClass = (plan, k, id) => setOutlookOverride(plan, { ...outlookNow(plan), [k]: id });

/**
 * One row of buttons to choose the market outlook for every market-linked class at once.
 * `current` is { gold, shares, etfs, funds } of outlook ids. onPick(id) sets all four.
 */
export function outlookToggle(current, onPick, { label = 'Market outlook', disabled = false } = {}) {
  const oc = outlooks();
  const ids = P.MARKET.map((k) => current[k] || 'steady');
  const common = ids.every((x) => x === ids[0]) ? ids[0] : 'mixed';
  const items = oc.map((o) => h('a', { href: 'javascript:void 0', class: o.id === common ? 'on' : '', 'aria-selected': String(o.id === common), title: o.hint || '', onclick: (e) => { e.preventDefault(); if (!disabled) onPick(o.id); } }, o.name, h('small', { class: 'seg-rate' }, ' ' + pc(o.rate, 0))));
  if (common === 'mixed') items.push(h('a', { href: 'javascript:void 0', class: 'on', 'aria-selected': 'true', onclick: (e) => e.preventDefault() }, 'Mixed'));
  return h('div', { class: 'outlook-bar' }, h('span', { class: 'ob-label' }, label), h('nav', { class: 'seg', 'aria-label': label }, items));
}

/** Per-class selects for market outlooks. */
export function outlookSelects(current, onPick) {
  const oc = outlooks();
  return h('div', { class: 'outlook-grid' }, P.MARKET.map((k) => h('label', { class: 'field' }, h('span', null, P.classOf(k).label),
    h('select', { onchange: (e) => onPick(k, e.target.value) }, oc.map((o) => h('option', { value: o.id, selected: o.id === (current[k] || 'steady') }, `${o.name} (${pc(o.rate, 0)} a year)`))))));
}
const outlookName = (id) => (outlooks().find((o) => o.id === id) || { name: id }).name;
/** The outlook buttons for a live plan, as a what-if. Nothing is saved; the plan keeps its own outlook. */
export function outlookWhatIf(plan) {
  const cur = outlookNow(plan), changed = !!outlookOverride(plan);
  const planName = (() => { const ids = P.MARKET.map((k) => plan.a.outlook[k]); return ids.every((x) => x === ids[0]) ? outlookName(ids[0]) : 'mixed'; })();
  return h('div', null,
    outlookToggle(cur, (id) => pickAll(plan, id)),
    h('p', { class: 'note' }, changed ? h('span', null, h('b', { class: 'warn' }, 'What-if: '), `the numbers below use this outlook instead of the plan’s (${planName}). It is not saved. `, h('a', { href: 'javascript:void 0', onclick: (e) => { e.preventDefault(); setOutlookOverride(plan, null); } }, 'Back to the plan’s outlook')) : `The plan uses ${planName}. Change it here to see how the year would go on another outlook. This is only for looking; it is not saved, and the plan is changed on the Planner tab.`),
    h('details', { class: 'more' }, h('summary', null, 'Set each market class separately, and what the outlook means'),
      outlookSelects(cur, (k, id) => pickClass(plan, k, id)),
      h('p', { class: 'note' }, 'The outlook is the yearly return assumed for shares, ETFs, funds and gold (and fresh money put into them). Fixed income uses its own interest rates.')));
}

// ---------- showing the numbers in a plan ----------
/** A value from a revision record or plan, formatted by its tag. */
export function fmtValue(v, f) {
  if (v == null) return '–';
  if (f === 'money') return money(v);
  if (f === 'pct') return pc(v, 1);
  if (f === 'ym') return v ? monthLabel(v, true) : '–';
  if (f === 'count') return String(v);
  return String(v);
}
export const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? dateStr(iso.slice(0, 10)) : `${dateStr(iso.slice(0, 10))}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`; };

/** The plan's settings, read only and folded shut: first item on This year and Years ahead. */
export function planSettingsCard(plan) {
  const a = plan.raw, g = a.growth || {}, oc = outlooks(), isDraft = plan.which === 'working';
  const row = (label, value, sub) => h('div', { class: 'pdl-row' }, h('span', { class: 'pdl-l' }, label), h('b', { class: 'pdl-v' }, value), sub ? h('small', { class: 'muted' }, sub) : null);
  const group = (title, ...rows) => h('div', { class: 'pdl-group' }, h('h4', null, title), ...rows);
  const ids = P.MARKET.map((k) => (a.outlook || {})[k] || 'steady'), common = ids.every((x) => x === ids[0]);
  const ones = (a.oneOffs || []).slice().sort((x, y) => (x.month < y.month ? -1 : 1));
  const inv = a.invest || [], tot = inv.reduce((s, l) => s + (l.monthly || 0), 0);
  const rates = Object.entries(a.rates || {}).filter(([k]) => !P.isMarket(k) && k !== 'cash').map(([k, v]) => `${P.labelOf(k)} ${pc(v, 1)}`).join(' · ');
  const summary = `${money(a.salary || 0)} salary, ${pc(g.salary || 0, 1)} hike · ${money(a.expenses || 0)} expenses · ${money(a.emi || 0)} EMI`;
  return section('Plan settings', h('details', { class: 'more assume-wrap' },
    h('summary', { style: { cursor: 'pointer' } }, h('b', null, isDraft ? `Plan ${plan.year} · draft` : `Plan ${plan.year} · revision ${plan.rev}`), ' ', h('small', { class: 'muted' }, `${isDraft ? 'not committed' : 'made ' + dateStr((plan.at || '').slice(0, 10))} · ${summary}`)),
    h('div', { class: 'pdl', style: { marginTop: '10px' } },
      group('Salary', row('Expected salary', money(a.salary || 0), 'a month, take-home'), row('Expected EPF', money(a.pfAdd || 0), 'a month'), row('Salary and EPF hike', pc(g.salary || 0, 1), `each ${PL.MONTH_NAMES[(Number(a.hikeMonth) || 4) - 1]}`), a.salaryMonth ? row('Figures are for', monthLabel(a.salaryMonth, true)) : null),
      group('Other income', row('Expected interest income', a.interestMonthly == null || a.interestMonthly === '' ? 'From my bonds and lending' : money(a.interestMonthly), a.interestMonthly == null || a.interestMonthly === '' ? 'worked out from the holdings' : 'a month'), row('Other income', money(a.otherIncome || 0), 'a month'), row('Net worth at the start', money(plan.initial.net), `end of ${monthLabel(plan.start.month, true)}; the plan runs from the month after`)),
      group('Expenses', row('Expected expenses', money(a.expenses || 0), 'a month'), row('Expenses rise', pc(g.expenses || 0, 1), 'each year'), row('Loan EMI', money(a.emi || 0), 'fixed')),
      group('One-time items', ...(ones.length ? ones.map((o) => row(o.name + (o.kind === 'income' ? ' (income)' : ''), (o.kind === 'income' ? '+' : '−') + money(o.amount), (o.month.length === 2 ? `every ${PL.MONTH_NAMES[Number(o.month) - 1]}` : monthLabel(o.month, true)) + (o.rise != null && o.rise !== '' ? `, rises ${pc(o.rise, 1)} a year` : ''))) : [h('small', { class: 'muted' }, 'None')])),
      group('Market outlook', row('Outlook', common ? outlookName(ids[0]) : P.MARKET.map((k, i) => `${P.classOf(k).label} ${outlookName(ids[i])}`).join(', ')), rates ? h('small', { class: 'muted' }, 'Fixed income: ' + rates) : null),
      group('New money', ...(inv.length ? AL.plannedShares(inv).rows.map((l) => row(l.name, tot > 0 ? (AL.priorityOf(l) != null ? 'P' + AL.priorityOf(l) + ' · ' : '') + (AL.modeOf(l) === 'amt' ? money(l.monthly || 0) + ' fixed' : pct(l.share, 0)) : '–', P.labelOf(l.cls))) : [h('small', { class: 'muted' }, 'None')]))),
    h('p', { class: 'note' }, h('a', { href: '#/projector/planner' }, 'Change these on the Planner tab'), ', then commit the plan to make the new figures live.')));
}
export { datalistId } from '../ui.js';

/** Best and worst case for the market classes: every outlook rate moved by this many points a year. */
export const CASE_SHIFT = 0.02;
export const shiftOutlooks = (oc, d) => oc.map((o) => ({ ...o, rate: o.rate + d }));
