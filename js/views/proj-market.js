// Wealth projector → Market outlook: what shares, funds and gold could do to the year end under each outlook.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as P from '../projector.js';
import { h, money, compact, pct, dateStr, monthLabel, section, stat, table, btn, formDialog, canEdit, toast } from '../ui.js';
import { lineChart } from '../charts.js';
import { rerender, outlooks, ensure, signed, pc, tone, outlookToggle, outlookSelects, setAllOutlook } from './proj-shared.js';
import { currentPlan, createPlanFor } from './proj-year.js';

/** The outlook scale itself: names and yearly returns. */
function scaleForm() {
  const oc = outlooks();
  formDialog({
    title: 'Market outlook scale', saveLabel: 'Save', value: Object.fromEntries(oc.flatMap((o) => [[o.id + '_n', o.name], [o.id + '_r', Math.round(o.rate * 10000) / 100]])),
    fields: oc.flatMap((o) => [{ key: o.id + '_n', label: `Name (${o.hint || o.id})`, required: true, half: true }, { key: o.id + '_r', label: 'Yearly return (%)', type: 'number', required: true, half: true }]),
    onSave: (v) => mutate((d) => { ensure(d).outlooks = oc.map((o) => ({ ...o, name: v[o.id + '_n'], rate: (Number(v[o.id + '_r']) || 0) / 100 })); }),
    extraActions: [{ label: 'Back to defaults', onclick: () => mutate((d) => { delete ensure(d).outlooks; }) }],
  });
}

export function render(root) {
  const { data, all } = S;
  const { plan, year } = currentPlan();
  if (!plan) {
    root.append(section('Market outlook', h('div', null, h('p', null, `Make a plan for ${year} first (This year tab). The market view then shows what each outlook would do to your year-end target.`),
      canEdit() ? btn(`Create plan ${year}`, () => createPlanFor(year), 'primary', { keep: true }) : null)));
    return;
  }
  const oc = outlooks();
  const b = P.baseline(data, all);
  const live = b.month > plan.baseline.month && b.month <= `${plan.year}-12`;
  const start = live ? { values: b.values, liab: b.liab, month: b.month } : { values: plan.baseline.classes, liab: plan.baseline.loans, month: plan.baseline.month };
  const months = P.monthsTo(start.month, plan.year);
  const sc = P.scenarios(start, plan.a, oc, months);
  const cur = P.simulate(start, plan.a, oc, months);
  const curEnd = cur[cur.length - 1] || { nw: start.values && b.net, values: start.values, market: 0 };
  const marketNow = P.MARKET.reduce((a, k) => a + (start.values[k] || 0), 0);
  const fresh = (plan.a.invest || []).filter((l) => P.isMarket(l.cls)).reduce((a, l) => a + (l.monthly || 0) * months, 0);
  const be = P.breakEvenMarket(start, plan.a, oc, months, plan.target);
  const nearest = (r) => { const sorted = oc.slice().sort((x, y) => x.rate - y.rate); const lo = sorted.filter((o) => o.rate <= r).pop(), hi = sorted.find((o) => o.rate > r); return !lo ? `below ${sorted[0].name}` : !hi ? (r <= lo.rate + 0.002 ? lo.name : `above ${lo.name}`) : `between ${lo.name} and ${hi.name}`; };

  root.append(h('p', { class: 'note' }, `Showing plan ${plan.year}: target ${money(plan.target)} in ${monthLabel(plan.year + '-12')}. Change the plan year on the This year tab.`));
  root.append(h('div', { class: 'stats' },
    stat('Market-linked today', money(marketNow), 'shares, ETFs, funds and gold'),
    stat('Fresh market money planned', money(fresh), `over the ${months} months left`),
    stat('At year end (current outlook)', money(curEnd.market), h('span', { class: tone(curEnd.market - marketNow - fresh) }, `${signed(curEnd.market - marketNow - fresh)} from returns`)),
    be == null ? stat('Needed from markets', 'Out of reach', 'even 80% a year would not reach the target') : stat('Needed from markets', pc(be, 1) + ' a year', nearest(be) + ' on the outlook scale')));

  root.append(section('Pick the outlook', h('div', null,
    outlookToggle(plan.a.outlook, (id) => setAllOutlook(plan.id, id), { disabled: !canEdit() }),
    h('details', { class: 'more' }, h('summary', null, 'Set each market class separately'), outlookSelects(plan.a.outlook, (k, id) => canEdit() && mutate((d) => { ensure(d).years[plan.id].a.outlook[k] = id; }))))));

  // ---------- every outlook against the target ----------
  const curId = (() => { const ids = P.MARKET.map((k) => plan.a.outlook[k]); return ids.every((x) => x === ids[0]) ? ids[0] : null; })();
  root.append(section('What each outlook means for December', h('div', null,
    table([
      { label: 'Outlook', host: true, render: (x) => h('span', null, h('b', null, x.outlook.name), h('small', { class: 'sub' }, ` ${pc(x.outlook.rate, 0)} a year`), x.outlook.id === curId ? h('small', { class: 'tag good' }, 'chosen') : null) },
      { label: 'Market-linked', mob: 'under', mlabel: 'market ', cls: 'r', get: (x) => money(x.end ? x.end.market : 0) },
      { label: 'Net worth', cls: 'r', get: (x) => money(x.end ? x.end.nw : b.net) },
      { label: 'Against target', cls: 'r', render: (x) => { const g = (x.end ? x.end.nw : b.net) - plan.target; return h('span', { class: tone(g) }, signed(g)); } },
      { label: 'Target', mob: 'hide', render: (x) => ((x.end ? x.end.nw : b.net) >= plan.target ? h('span', { class: 'tag good' }, 'reached') : h('span', { class: 'tag' }, 'missed')) },
    ], sc, { onRow: canEdit() ? (x) => setAllOutlook(plan.id, x.outlook.id) : null }),
    h('p', { class: 'note' }, 'Same salary, spending and investments in every row; only the return on market-linked money changes. Tap a row to choose that outlook.'))));

  // ---------- chart ----------
  const labels = [monthLabel(start.month), ...cur.map((r) => monthLabel(r.month))];
  const series = sc.map((x, i) => ({ name: `${x.outlook.name} (${pc(x.outlook.rate, 0)})`, values: [b.net && (live ? b.net : plan.baseline.net), ...x.rows.map((r) => r.nw)], color: i }));
  series.push({ name: 'Target', values: labels.map(() => plan.target), dashed: true, color: 7 });
  const all2 = series.flatMap((x) => x.values).filter((v) => v != null);
  root.append(section('Net worth under each outlook', lineChart({ labels, fmt: money, yMin: Math.floor((Math.min(...all2) * 0.97) / 1e6) * 1e6, series })));

  // ---------- by class ----------
  const clsRows = P.MARKET.map((k) => ({ k, label: P.classOf(k).label, now: start.values[k] || 0, fresh: (plan.a.invest || []).filter((l) => l.cls === k).reduce((a, l) => a + (l.monthly || 0) * months, 0), cur: curEnd.values ? curEnd.values[k] || 0 : 0, by: sc.map((x) => (x.end ? x.end.values[k] || 0 : 0)) }));
  root.append(section('Market-linked money by class', h('div', null,
    table([
      { label: 'Class', host: true, get: (x) => x.label },
      { label: 'Today', mob: 'under', mlabel: 'now ', cls: 'r', get: (x) => money(x.now), total: (r) => money(r.reduce((a, x) => a + x.now, 0)) },
      { label: 'Fresh money', mob: 'under', mlabel: 'fresh ', cls: 'r', get: (x) => money(x.fresh), total: (r) => money(r.reduce((a, x) => a + x.fresh, 0)) },
      { label: 'Chosen outlook', cls: 'r', get: (x) => money(x.cur), total: (r) => money(r.reduce((a, x) => a + x.cur, 0)) },
      ...oc.map((o, i) => ({ label: `${o.name} ${pc(o.rate, 0)}`, mob: 'hide', cls: 'r', get: (x) => money(x.by[i]), total: (r) => money(r.reduce((a, x) => a + x.by[i], 0)) })),
    ], clsRows, { footer: { label: 'Total' }, empty: 'No market-linked holdings.' }),
    h('p', { class: 'note' }, 'Value at the end of the year in each case, counting what you hold now and the fresh money planned. “All columns” on a phone shows every outlook.'))));

  // ---------- track record ----------
  const rets = C.returns(data, all);
  const rec = [['Stocks & ETFs', 'Shares and ETFs'], ['Mutual funds', 'Mutual funds'], ['Gold', 'Gold']].map(([n, l]) => { const r = rets.find((x) => x.name === n); return r && r.xirr != null ? { label: l, xirr: r.xirr } : null; }).filter(Boolean);
  if (rec.length) root.append(section('Your own track record', h('div', null,
    table([{ label: 'Asset', host: true, get: (x) => x.label }, { label: 'Yearly return so far (XIRR)', cls: 'r', render: (x) => h('span', { class: tone(x.xirr) }, pc(x.xirr, 1)) }, { label: 'Closest outlook', mob: 'under', get: (x) => oc.slice().sort((a, b) => Math.abs(a.rate - x.xirr) - Math.abs(b.rate - x.xirr))[0].name }], rec),
    h('p', { class: 'note' }, 'What your holdings actually returned since you bought them. Use it as a reality check when choosing an outlook: a few years of strong returns rarely repeat.'))));
  if (canEdit()) root.append(h('div', { class: 'btn-row' }, btn('Edit outlook scale', scaleForm, '', { keep: true })));
}
