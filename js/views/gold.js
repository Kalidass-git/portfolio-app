import { premiumFrom } from '../goldlive.js';
import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import { h, money, dec, dateStr, gainText, section, table, btn, formDialog, canEdit, toast, stat, num, segTabs, subTab, pct, posNeg, dialog, confirmDialog } from '../ui.js';
import { reopen } from './closing.js';
import { goldChitMonths, GOLD_CHIT_MONTHS } from '../monthinvest.js';

const rerender = () => window.dispatchEvent(new Event('rerender'));

/** Rates you have set, oldest first. Older files only have the current rate. */
export function rateHistory(data) {
  const h0 = data.gold.rateHistory;
  if (h0 && h0.length) return h0;
  return data.settings.goldRate ? [{ date: data.settings.goldRateDate || C.todayISO(), rate: data.settings.goldRate }] : [];
}
export function setRate(rate, date = C.todayISO(), manual = true) {
  mutate((d) => {
    const hist = rateHistory(d).map((x) => ({ ...x }));
    const hit = hist.find((x) => x.date === date);
    if (hit) hit.rate = rate; else hist.push({ date, rate });
    hist.sort((a, b) => (a.date < b.date ? -1 : 1));
    d.gold.rateHistory = hist.slice(-400);
    const latest = hist[hist.length - 1];
    d.settings.goldRate = latest.rate; d.settings.goldRateDate = latest.date;
    if (manual !== false && d.settings.goldLive) { const p = premiumFrom(latest.rate, d.settings.goldLive); if (p) d.settings.goldPremium = p; }
  });
}
const daysOld = (date) => Math.max(0, Math.round((C.toMs(S.all.asOf) - C.toMs(date)) / C.DAY));
export const ageText = (date) => { const n = daysOld(date); return n === 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; };

function rateCard() {
  const { data, all } = S;
  const hist = rateHistory(data);
  const last = hist[hist.length - 1], prev = hist[hist.length - 2];
  const old = daysOld(last.date);
  const input = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: String(all.gold.rate), 'aria-label': 'Gold rate per gram', style: { width: '9em', fontSize: '1.1rem', fontWeight: 650 } });
  const save = () => {
    const v = Number(input.value);
    if (!(v > 0)) return toast('Enter the price of 1 gram of gold.', 'bad');
    setRate(v); toast('Gold rate updated. All gold values now use ₹' + dec(v, 0) + ' per gram.');
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  const change = prev ? last.rate - prev.rate : 0;
  const worth = all.gold.value;
  return section('Gold rate',
    h('div', { class: 'kv', style: { width: '100%' } },
      h('p', { style: { margin: 0 } }, h('span', { class: 'hero-num', style: { fontSize: 'clamp(1.8rem, 8vw, 2.6rem)' } }, money(last.rate)), ' per gram'),
      h('p', { class: old > 7 ? 'warn' : 'muted', style: { margin: 0 } }, `Set ${ageText(last.date)} (${dateStr(last.date)})` + (old > 7 ? '. This rate is getting old, so your gold value may be off.' : '')
        + (prev ? ` · ${change >= 0 ? 'up' : 'down'} ${money(Math.abs(change))} (${pct(Math.abs(change) / prev.rate, 1)}) since ${dateStr(prev.date)}` : '')),
      canEdit() ? h('div', { class: 'row', style: { alignItems: 'center' } }, h('span', null, '₹'), input, btn('Update rate', save, 'primary')) : null,
      h('p', { class: 'note', style: { margin: 0 } }, data.settings.goldLive ? `Live world gold read ${ageText((data.settings.goldLive.at || '').slice(0, 10) || C.todayISO())}. ${data.settings.goldAuto === false ? 'Automatic rate is off.' : 'The rate above follows it each time you refresh prices.'}` : 'Press Refresh prices on Shares & funds to read the live gold price.'),
      canEdit() ? btn(data.settings.goldAuto === false ? 'Turn automatic rate on' : 'Turn automatic rate off', () => mutate((d) => { d.settings.goldAuto = d.settings.goldAuto === false; })) : null,
      canEdit() ? h('p', { class: 'note', style: { margin: 0 } }, 'Type today’s price of 1 gram and press Update. Everything (Home, reports, gold value) uses it straight away. Use the same type of gold (22K or 24K) each time. ', h('a', { href: 'https://www.goodreturns.in/gold-rates/', target: '_blank', rel: 'noopener noreferrer' }, 'See today’s rates'), '.') : h('p', { class: 'note', style: { margin: 0 } }, 'Only the owner can change the rate.'),
      hist.length > 1 ? h('details', null, h('summary', null, `Rate history (${hist.length})`), table([
        { label: 'Date', get: (r) => dateStr(r.date) }, { label: 'Per gram', cls: 'r', get: (r) => money(r.rate) },
        { label: 'Change', cls: 'r', render: (r) => (r.chg == null ? '' : h('span', { class: posNeg(r.chg) }, (r.chg > 0 ? '+' : r.chg < 0 ? '−' : '') + money(Math.abs(r.chg)))) },
      ], hist.map((r, i) => ({ ...r, chg: i ? r.rate - hist[i - 1].rate : null })).reverse().slice(0, 12))) : null));
}
function purchaseForm(p) {
  const isNew = !p;
  formDialog({
    title: isNew ? 'Add gold purchase' : 'Edit purchase', value: p || { date: C.todayISO() },
    fields: [{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'desc', label: 'What', required: true }, { key: 'grams', label: 'Weight (grams)', type: 'number', required: true }, { key: 'amount', label: 'Amount paid (₹)', type: 'number', required: true }],
    onSave: (v) => mutate((d) => { if (isNew) d.gold.purchases.push({ id: nextId('g', d.gold.purchases), ...v }); else Object.assign(d.gold.purchases.find((x) => x.id === p.id), v); d.gold.purchases.sort((a, b) => (a.date < b.date ? -1 : 1)); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.purchases = d.gold.purchases.filter((x) => x.id !== p.id); }),
  });
}
function schemeEntryForm(scheme, idx) {
  const isNew = idx == null;
  const e = isNew ? { date: C.todayISO(), amount: 75000 } : scheme.entries[idx];
  formDialog({
    title: (isNew ? 'Add instalment to ' : 'Edit instalment in ') + scheme.name, value: e,
    fields: [{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'amount', label: 'Amount paid (₹)', type: 'number', required: true }, { key: 'rate', label: 'Gold rate that day (₹/gram)', type: 'number', required: true, hint: 'Grams are worked out as amount ÷ rate.' }],
    onSave: (v) => mutate((d) => {
      const s = d.gold.schemes.find((x) => x.id === scheme.id);
      const rec = { date: v.date, amount: v.amount, rate: v.rate, grams: Math.round((v.amount / v.rate) * 1000) / 1000 };
      if (isNew) s.entries.push(rec); else s.entries[idx] = rec;
      s.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
    }),
    onDelete: isNew ? null : () => mutate((d) => d.gold.schemes.find((x) => x.id === scheme.id).entries.splice(idx, 1)),
  });
}
// ----- gold chits: jeweller savings schemes. Closing one adds a gold purchase. -----
function chitForm(c) {
  const isNew = !c;
  formDialog({
    title: isNew ? 'Add gold chit' : 'Edit ' + c.name, value: c || { startDate: C.todayISO() },
    fields: [
      { key: 'name', label: 'Name', required: true, hint: 'For example GRT Gold savings 5' }, { key: 'shop', label: 'Jeweller' },
      { key: 'monthly', label: 'Monthly instalment (₹, optional)', type: 'number' },
      { key: 'startDate', label: 'Started on', type: 'date', half: true }, { key: 'maturityDate', label: 'Ends on', type: 'date', half: true, hint: 'Home stops counting the chit as pending after this month.' },
      { key: 'desc', label: 'Notes / who to contact', type: 'textarea' },
    ],
    onSave: (v) => mutate((d) => { d.gold.chits = d.gold.chits || []; if (isNew) d.gold.chits.push({ id: nextId('gc', d.gold.chits), entries: [], ...v }); else Object.assign(d.gold.chits.find((x) => x.id === c.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.chits = d.gold.chits.filter((x) => x.id !== c.id); }),
    deleteMessage: 'Delete this chit and its payments? Use “Close it” instead when it is over, so the history is kept.',
    extraActions: isNew || c.closed ? [] : [{ label: 'Close it', onclick: () => closeChit(c) }],
  });
}
function chitEntryForm(c, idx) {
  const isNew = idx == null;
  const e = isNew ? { date: C.todayISO(), amount: c.monthly || '' } : c.entries[idx];
  formDialog({
    title: (isNew ? 'Add payment to ' : 'Edit payment in ') + c.name, value: e,
    fields: [{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'amount', label: 'Amount paid (₹)', type: 'number', required: true },
      { key: 'rate', label: 'Gold rate that day (₹ per gram, optional)', type: 'number', hint: 'Lets the app work out the grams this payment bought, to compare “by value” with “by gold” when the chit ends.' }],
    onSave: (v) => mutate((d) => { const t = d.gold.chits.find((x) => x.id === c.id); const rec = { date: v.date, amount: v.amount }; if (v.rate > 0) rec.rate = v.rate; if (isNew) t.entries.push(rec); else t.entries[idx] = rec; t.entries.sort((a, b) => (a.date < b.date ? -1 : 1)); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.chits.find((x) => x.id === c.id).entries.splice(idx, 1); }),
  });
}
/** Closing a gold chit: take the money's worth, or the grams saved up, whichever is better at today's rate. */
function chitOptions(c, rate) {
  const paid = c.entries.reduce((a, e) => a + e.amount, 0);
  const withRate = c.entries.filter((e) => e.rate > 0);
  const grams = withRate.reduce((a, e) => a + e.amount / e.rate, 0);
  const rated = withRate.reduce((a, e) => a + e.amount, 0);
  const complete = c.entries.length > 0 && withRate.length === c.entries.length;
  const byValueGrams = rate > 0 ? paid / rate : 0;
  const goldValue = grams * rate;
  const known = grams > 0;
  const best = !known ? 'value' : goldValue > paid ? 'gold' : 'value';
  return { paid, grams, rated, complete, byValueGrams, goldValue, known, best, edge: known ? Math.abs(goldValue - paid) : 0 };
}
/** A monthly gold-savings scheme (entries carry grams or a rate) shaped like a chit so the same card and close form work. */
function schemeAsChit(x) {
  return { id: x.id, name: x.name, entries: x.entries.map((e) => ({ date: e.date, amount: e.amount, rate: e.rate > 0 ? e.rate : e.grams > 0 ? e.amount / e.grams : 0 })) };
}
function chitBestCard(c, actualRate, scheme) {
  const card = h('div', { class: 'card' });
  const head = h('h3'), hint = h('span', { class: 'note', style: { margin: 0 } }), reset = btn('Use actual rate', () => { input.value = ''; draw(); });
  const body = h('div');
  // the box is made once and kept, so typing is never interrupted by a redraw
  const input = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: String(Math.round(actualRate)), 'aria-label': 'Try a gold rate per gram', style: { width: '8em' }, oninput: () => draw() });
  const draw = () => {
    const m = Number(input.value), mocked = input.value !== '' && m > 0, rate = mocked ? m : actualRate;
    const o = chitOptions(c, rate);
    const profit = (n) => h('span', { class: n > 0.5 ? 'pos' : n < -0.5 ? 'neg' : '' }, `Profit over what you paid: ${n > 0.5 ? '+' : n < -0.5 ? '−' : ''}${money(Math.abs(n))}`);
    const mk = (title, big, sub, win, pr) => h('div', { class: 'stat', style: win ? { borderColor: 'var(--accent, #1b7f3b)', borderWidth: '2px', borderStyle: 'solid' } : null },
      h('span', { class: 'stat-label' }, title + (win ? (mocked ? ' · better at this rate' : ' · better today') : '')), h('strong', { class: 'stat-value' }, big), h('span', { class: 'sub' }, sub), h('span', { class: 'sub' }, pr));
    head.textContent = (mocked ? 'Best option at ' + money(rate) + ' / g · ' : 'Best option today · ') + c.name;
    hint.textContent = mocked ? '' : `blank = actual ${money(actualRate)} / g`;
    reset.style.display = mocked ? '' : 'none';
    body.replaceChildren(...[
      mocked ? h('p', { class: 'note', style: { marginTop: 0 } }, `What-if only. Today's actual rate is ${money(actualRate)} / g.`) : null,
      h('div', { class: 'stats' },
        mk('Take it by value', dec(o.byValueGrams, 2) + ' g', `${money(o.paid)} paid in, buys this much at ${money(rate)} / g`, o.best === 'value', profit(0)),
        o.known ? mk('Take it by gold saved', dec(o.grams, 2) + ' g', `worth ${money(o.goldValue)} at ${money(rate)} / g${o.complete ? '' : ' (only payments with a rate are counted)'}`, o.best === 'gold', profit(o.goldValue - o.paid))
          : mk('Take it by gold saved', '–', 'add the gold rate on the payments to compare')),
      h('p', { class: 'note' }, o.known
        ? (o.best === 'gold'
          ? `Choose gold basis: ${dec(o.grams - o.byValueGrams, 2)} g more, which is ${money(o.edge)} more than the value basis and a profit of ${money(o.goldValue - o.paid)} over the ${money(o.paid)} you paid.`
          : `Choose value basis: ${dec(o.byValueGrams - o.grams, 2)} g more, which is ${money(o.edge)} more than the gold basis. Gold basis would be ${money(o.paid - o.goldValue)} below what you paid.`)
        : 'Value basis gives you the money paid in as gold at the rate above.'),
      canEdit() ? h('div', { class: 'actions' }, btn('Close this chit', () => closeChit(c, scheme))) : null].filter(Boolean));
  };
  card.append(head, h('div', { class: 'price-bar inline', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } },
    h('span', { class: 'note', style: { margin: 0 } }, 'Try a gold rate (₹ / g):'), input, reset, hint), body);
  draw();
  return card;
}
function closeChit(c, scheme) {
  const rate = S.all.gold.rate;
  const o = chitOptions(c, rate), paid = o.paid;
  const bestGrams = o.best === 'gold' ? o.grams : o.byValueGrams;
  formDialog({
    title: 'Close ' + c.name, saveLabel: 'Close and add the gold', value: { date: C.todayISO(), grams: bestGrams ? Math.round(bestGrams * 1000) / 1000 : '', extra: '', note: '' },
    fields: [
      { key: 'date', label: 'Closed on', type: 'date', required: true },
      { key: 'grams', label: 'Gold bought (grams)', type: 'number', required: true, hint: `Today at ${money(rate)} / g: by value ${dec(o.byValueGrams, 2)} g${o.known ? `, by gold saved ${dec(o.grams, 2)} g, so “${o.best === 'gold' ? 'gold' : 'value'}” is better` : ''}. Change it to what you actually received.` },
      { key: 'extra', label: 'Extra amount paid while closing (₹, optional)', type: 'number', hint: `Making charges, tax or top-up. It is added to the ${money(paid)} you paid into the chit.` },
      { key: 'note', label: 'Note (optional)', type: 'text' },
    ],
    onSave: (v) => {
      if (!(v.grams > 0)) { toast('Enter the grams of gold you bought.', 'bad'); return false; }
      const amt = paid + (v.extra > 0 ? v.extra : 0);
      mutate((d) => {
        const t = scheme ? d.gold.schemes.find((x) => x.id === c.id) : d.gold.chits.find((x) => x.id === c.id);
        const pid = nextId('g', d.gold.purchases);
        d.gold.purchases.push({ id: pid, date: v.date, desc: `Gold from chit: ${c.name}`, grams: v.grams, amount: amt });
        d.gold.purchases.sort((a, b) => (a.date < b.date ? -1 : 1));
        t.closed = { date: v.date, grams: v.grams, amount: amt, extra: v.extra > 0 ? v.extra : 0, purchaseId: pid, note: v.note || '' };
        if (scheme) t.active = false;
      });
      toast('Closed. The gold is now in your gold purchases.');
    },
  });
}
function openChit(row) {
  const c = S.data.gold.chits.find((x) => x.id === row.id);
  const list = h('div');
  list.append(table([{ label: 'Date', get: (e) => dateStr(e.date) }, { label: 'Paid', cls: 'r', get: (e) => money(e.amount), total: (rs) => money(rs.reduce((a, e) => a + e.amount, 0)) }],
    c.entries.map((e, i) => ({ ...e, _i: i })).reverse(), { footer: { label: 'Total' }, onRow: canEdit() && !c.closed ? (e) => chitEntryForm(c, e._i) : null, empty: 'No payments yet.' }));
  const acts = [];
  if (canEdit()) {
    if (c.closed) acts.push({ label: 'Reopen', onclick: (cl) => { cl(); reopen(c.name, (d) => { const t = d.gold.chits.find((x) => x.id === c.id); d.gold.purchases = d.gold.purchases.filter((p) => p.id !== t.closed.purchaseId); delete t.closed; }); } });
    else acts.push({ label: 'Edit chit', onclick: (cl) => { cl(); chitForm(c); } }, { label: 'Close it', onclick: (cl) => { cl(); closeChit(c); } }, { label: 'Add payment', class: 'primary', onclick: (cl) => { cl(); chitEntryForm(c); } });
  }
  acts.push({ label: 'Close window', onclick: (cl) => cl() });
  dialog(c.name, h('div', null, c.closed ? null : chitBestCard(c, S.all.gold.rate), h('p', { class: 'note' }, `${c.shop || 'Gold chit'}${c.monthly ? ' · ' + money(c.monthly) + ' a month' : ''}${c.closed ? ` · closed ${dateStr(c.closed.date)}, ${dec(c.closed.grams, 2)} g received` : ''}`), c.desc ? h('p', null, c.desc) : null, list), acts);
}
/** How long a gold chit runs. Home stops counting a chit as pending once this many months have passed since its first payment. */
function chitLengthCard(data) {
  const cur = goldChitMonths(data);
  const input = h('input', { type: 'number', min: '1', max: '60', step: '1', inputmode: 'numeric', value: String(cur), 'aria-label': 'Gold chit length in months', style: { width: '5em' } });
  const save = () => {
    const v = Math.round(Number(input.value));
    if (!(v >= 1 && v <= 60)) return toast('Enter the number of months a gold chit runs, for example ' + GOLD_CHIT_MONTHS + '.', 'bad');
    mutate((d) => { d.settings.goldChitMonths = v; });
    toast('Gold chits now run ' + v + ' months.');
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  return section('Gold chit length', h('div', null,
    h('p', { style: { margin: '0 0 6px' } }, `Gold chits run for ${cur} months${data.settings.goldChitMonths ? '' : ' (the usual length)'}.`),
    canEdit() ? h('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } }, input, h('span', null, 'months'), btn('Save', save)) : null,
    h('p', { class: 'note', style: { margin: '6px 0 0' } }, 'On Home, a gold chit that has no payment this month is shown as pending, until this many months have passed since its first payment. Any payment this month counts, whatever the amount.')));
}
function chitsTab(root) {
  const { all, data } = S;
  const g = all.gold.chits;
  // Monthly gold savings that track grams (GRT Savings Account - 5 and its earlier accounts) belong here too.
  const schemes = data.gold.schemes || [];
  const runSch = schemes.filter((x) => x.active), oldSch = schemes.filter((x) => !x.active);
  const schRow = (x) => { const paid = x.entries.reduce((a, e) => a + e.amount, 0); return { name: x.name, shop: 'GRT', startDate: x.entries[0] && x.entries[0].date, months: x.entries.length, paid, grams: x.entries.reduce((a, e) => a + (e.grams || (e.rate ? e.amount / e.rate : 0)), 0), last: x.entries.length ? x.entries[x.entries.length - 1].date : '', scheme: x }; };
  const running = g.active.map((c) => ({ name: c.name, shop: c.shop, startDate: c.startDate || (c.entries[0] && c.entries[0].date), months: c.months, paid: c.paid, ends: c.maturityDate, chit: c })).concat(runSch.map((x) => ({ ...schRow(x), ends: '' })));
  const runPaid = running.reduce((a, r) => a + r.paid, 0);
  root.append(h('div', { class: 'stats' },
    stat('Invested in gold chits', money(runPaid), `${running.length} running chit${running.length === 1 ? '' : 's'}`),
    stat('Closed chits', String(g.closed.length + oldSch.length), g.closed.length + oldSch.length ? `${dec(g.closed.reduce((a, c) => a + c.closed.grams, 0), 1)} g received through chits closed here` : 'none yet')));
  root.append(chitLengthCard(data));
  for (const r of running) if (r.chit && r.paid > 0) root.append(chitBestCard(r.chit, all.gold.rate));
  for (const x of runSch) if (x.entries.length) root.append(chitBestCard(schemeAsChit(x), all.gold.rate, true));
  root.append(section('Running chits', h('div', null, table([
    { label: 'Chit', host: true, get: (c) => c.name }, { label: 'Jeweller', mob: 'under', get: (c) => c.shop || '' },
    { label: 'Started', mob: 'under', mlabel: 'started ', get: (c) => dateStr(c.startDate) },
    { label: 'Payments', mob: 'under', mlabel: 'payments ', cls: 'r', get: (c) => String(c.months) },
    { label: 'Paid so far', cls: 'r', get: (c) => money(c.paid), total: () => money(runPaid) },
    { label: 'Gold so far', cls: 'r', get: (c) => (c.grams ? dec(c.grams, 2) + ' g' : '–') },
    { label: 'Ends', mob: 'under', mlabel: 'ends ', get: (c) => (c.ends ? dateStr(c.ends) : '') },
  ], running, { footer: { label: 'Total' }, mobile: {
    key: 'goldchits', head: 'Chit', midHead: 'Ends',
    first: (c) => ({ title: c.name, sub: [c.shop, c.startDate ? 'started ' + dateStr(c.startDate) : ''].filter(Boolean).join(' · ') }),
    mid: (c) => (c.ends ? dateStr(c.ends) : null),
    views: [
      { label: 'Paid · Gold', main: (c) => money(c.paid), sub: (c) => (c.grams ? dec(c.grams, 2) + ' g' : null), total: () => ({ main: money(runPaid) }) },
      { label: 'Payments · Ends', main: (c) => String(c.months) + (c.months === 1 ? ' payment' : ' payments'), sub: (c) => (c.ends ? 'ends ' + dateStr(c.ends) : null) },
    ] }, onRow: (c) => (c.chit ? openChit(c.chit) : document.getElementById('scheme-' + c.scheme.id)?.scrollIntoView({ behavior: 'smooth' })), empty: 'No running gold chits.' }),
    h('p', { class: 'note' }, 'Money paid into a running chit counts as gold at cost. When the chit ends, press “Close it”, enter the grams you received, and the gold is added to your purchases. Monthly gold savings that already record grams (like GRT Savings Account - 5) show their gold so far and are valued at today’s rate.')),
    canEdit() ? [btn('Add gold chit', () => chitForm())] : null));
  for (const x of runSch) {
    const ents = x.entries.map((e, i) => ({ ...e, grams: e.grams || (e.rate ? e.amount / e.rate : 0), _i: i })).reverse();
    const paid = ents.reduce((a, e) => a + e.amount, 0), grams = ents.reduce((a, e) => a + e.grams, 0);
    const sec = section(x.name + ' · instalments', h('div', null, table([
      { label: 'Date', host: true, get: (e) => dateStr(e.date) }, { label: 'Paid', cls: 'r', get: (e) => money(e.amount), total: () => money(paid) },
      { label: 'Rate / g', mob: 'under', mlabel: 'rate ', cls: 'r', get: (e) => money(e.rate) }, { label: 'Grams', cls: 'r', get: (e) => dec(e.grams, 3), total: () => dec(grams, 3) },
      { label: 'Value now', mob: 'under', mlabel: 'now ', cls: 'r', get: (e) => money(e.grams * all.gold.rate), total: () => money(grams * all.gold.rate) },
    ], ents, { footer: { label: 'Total' }, onRow: canEdit() ? (e) => schemeEntryForm(x, e._i) : null })),
      canEdit() ? [btn('Add instalment', () => schemeEntryForm(x)), btn('Close this scheme', () => closeChit(schemeAsChit(x), true))] : null);
    sec.id = 'scheme-' + x.id; root.append(sec);
  }
  const closedRows = g.closed.map((c) => ({ name: c.name, startDate: c.startDate || (c.entries[0] && c.entries[0].date), closedOn: c.closed.date, paid: c.paid, grams: c.closed.grams, chit: c }))
    .concat(oldSch.map((x) => { const r = schRow(x); return { name: x.name, startDate: r.startDate, closedOn: r.last, paid: r.paid, grams: null, converted: true }; }));
  closedRows.sort((a, b) => (a.closedOn < b.closedOn ? 1 : -1));
  root.append(section(`Closed chits (${closedRows.length})`, h('div', null, table([
    { label: 'Chit', host: true, get: (c) => c.name }, { label: 'Started', mob: 'under', mlabel: 'started ', get: (c) => dateStr(c.startDate) }, { label: 'Closed', mob: 'under', mlabel: 'closed ', get: (c) => dateStr(c.closedOn) },
    { label: 'Paid', cls: 'r', get: (c) => money(c.paid) }, { label: 'Gold received', mob: 'under', mlabel: 'gold ', cls: 'r', get: (c) => (c.grams == null ? 'in purchases' : dec(c.grams, 2) + ' g') },
    { label: 'Value now', cls: 'r', get: (c) => (c.grams == null ? '–' : money(c.grams * all.gold.rate)) },
    { label: 'Gain', mob: 'under', mlabel: 'gain ', cls: 'r', render: (c) => (c.grams == null ? '–' : gainText(c.grams * all.gold.rate - c.paid)) },
  ], closedRows, { onRow: (c) => c.chit && openChit(c.chit), empty: 'Nothing closed yet.' }),
    oldSch.length ? h('p', { class: 'note' }, 'Earlier GRT accounts were turned into the gold purchases on the Gold tab, so their gold is counted there and not twice.') : null)));
}
function jewelForm(j) {
  const isNew = !j;
  formDialog({
    title: isNew ? 'Add jewellery' : 'Edit ' + j.name, value: j || {},
    fields: [{ key: 'name', label: 'Item', required: true }, { key: 'grams', label: 'Weight (grams)', type: 'number', required: true }],
    onSave: (v) => mutate((d) => { if (isNew) d.gold.jewellery.push({ id: nextId('j', d.gold.jewellery), ...v }); else Object.assign(d.gold.jewellery.find((x) => x.id === j.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.jewellery = d.gold.jewellery.filter((x) => x.id !== j.id); }),
  });
}
function otherForm(o) {
  const isNew = !o;
  formDialog({
    title: isNew ? 'Add other holding' : 'Edit ' + o.name, value: o || {},
    fields: [{ key: 'name', label: 'Name', required: true, hint: 'Deposits and other money that is not in any other section.' }, { key: 'amount', label: 'Amount (₹)', type: 'number', required: true }],
    onSave: (v) => mutate((d) => { if (isNew) d.gold.others.push({ id: nextId('o', d.gold.others), ...v }); else Object.assign(d.gold.others.find((x) => x.id === o.id), v); }),
    onDelete: isNew ? null : () => mutate((d) => { d.gold.others = d.gold.others.filter((x) => x.id !== o.id); }),
  });
}

export function render() {
  const { all, data } = S;
  const g = all.gold;
  const root = h('div', { class: 'page' });
  const TABS = [['gold', 'Gold'], ['chits', 'Gold chits'], ['jewellery', 'Jewellery'], ['others', 'Other holdings']];
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Gold views')));
  if (tab === 'chits') chitsTab(root);
  if (tab === 'gold') {
  root.append(h('div', { class: 'stats' },
    (() => { const row = C.returns(data, all).find((r) => r.name === 'Gold'); const gain = g.value - g.invested;
      return stat('Gold value', money(g.value), h('span', null, h('span', { class: gain >= 0 ? 'pos' : 'neg' }, (gain >= 0 ? '+' : '−') + money(Math.abs(gain))), ` gain · XIRR ${row && row.xirr != null ? pct(row.xirr, 1) : '–'} · paid ${money(g.invested)}`)); })(),
    (() => { const jg = g.jewellery.grams, tg = g.grams + jg, tv = g.value + g.jewellery.value;
      return stat('Total gold incl. jewellery', money(tv), `${dec(tg, 2)} g · ${dec(tg / 8, 1)} sovereigns (8 g) · jewellery ${dec(jg, 2)} g`); })(),
    (() => { const d = g.day, sg = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n)), sp = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pct(Math.abs(n), 2);
      return d ? stat('Gold today', h('span', { class: posNeg(d.total) }, sg(d.total)), h('span', { class: posNeg(d.total) }, `${sp(d.pct)} · ${sg(d.perGram)} a gram`))
        : stat('Gold today', '–', 'turns on with the automatic rate or after a price refresh'); })(),
    h('a', { class: 'stat', href: '#/gold/chits', style: { textDecoration: 'none', color: 'inherit' } }, h('span', { class: 'stat-label' }, 'Invested in gold chits'), h('strong', { class: 'stat-value' }, money(g.chits.invested + (g.scheme.invested || 0))), h('span', { class: 'stat-sub' }, `${g.chits.active.length + (g.scheme.name ? 1 : 0)} running · tap to see`))));
  root.append(rateCard());

  root.append(section('Gold purchases',
    table([
      { label: 'Date', mob: 'under', get: (p) => dateStr(p.date) }, { label: 'What', host: true, get: (p) => p.desc },
      { label: 'Grams', cls: 'r', get: (p) => dec(p.grams, 2), total: () => dec(g.main.grams, 2) },
      { label: 'Paid · rate / g', cls: 'r', render: (p) => h('div', null, h('div', { class: 'b' }, money(p.amount)), h('div', { class: 'sub2' }, p.grams ? money(p.amount / p.grams) + ' / g' : '–')), total: () => money(g.main.invested) },
      { label: 'Value now', cls: 'r', get: (p) => money(p.grams * g.rate), total: () => money(g.main.value) },
      { label: 'Gain', mob: 'under', mlabel: 'gain ', cls: 'r', render: (p) => gainText(p.grams * g.rate - p.amount), total: () => money(g.main.gain) },
    ], data.gold.purchases.slice().reverse().map((p) => p), { footer: { label: 'Total' }, onRow: canEdit() ? (p) => purchaseForm(data.gold.purchases.find((x) => x.id === p.id)) : null }),
    canEdit() ? [btn('Add purchase', () => purchaseForm())] : null));

  }
  if (tab === 'jewellery') root.append(section('Jewellery list',
    h('div', null, table([
      { label: 'Item', get: (j) => j.name }, { label: 'Grams', cls: 'r', get: (j) => dec(j.grams, 1), total: () => dec(g.jewellery.grams, 1) },
      { label: 'Value now', cls: 'r', get: (j) => money(j.grams * g.rate), total: () => money(g.jewellery.value) },
    ], data.gold.jewellery, { footer: { label: 'Total' }, onRow: canEdit() ? (j) => jewelForm(data.gold.jewellery.find((x) => x.id === j.id)) : null }),
      h('p', { class: 'note' }, 'This list is for reference. As in your workbook, it is not added to net worth.')),
    canEdit() ? [btn('Add item', () => jewelForm())] : null));

  if (tab === 'others') root.append(section('Other holdings (deposits)',
    table([{ label: 'Name', get: (o) => o.name }, { label: 'Amount', cls: 'r', get: (o) => money(o.amount), total: () => money(g.othersTotal) }],
      data.gold.others, { footer: { label: 'Total' }, onRow: canEdit() ? (o) => otherForm(data.gold.others.find((x) => x.id === o.id)) : null }),
    canEdit() ? [btn('Add', () => otherForm())] : null));
  return root;
}
