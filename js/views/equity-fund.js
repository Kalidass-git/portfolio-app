// Mutual funds: the fund page (buy and redeem history, XIRR) and the forms to add, edit and link a fund.
import { historyCard } from './histcard.js';
import { fundFundamentals } from './watch.js';
import { fundNavs } from '../history.js';
import { S, mutate, nextId } from '../store.js';
import * as C from '../calc.js';
import * as prices from '../prices.js';
import { h, money, dec, pct, dateStr, section, table, stat, btn, canEdit, route, gainText, posNeg, formDialog, dialog, toast, num, confirmDialog } from '../ui.js';
import { fundKey, BUY_TYPES } from '../trades.js';

const hasTxns = (d, m) => (d.mfTxns || []).some((t) => fundKey(t.scheme) === fundKey(m.name));
const hasHistory = (d, m) => hasTxns(d, m) || !!m.opening;

export async function linkFund(m) {
  const body = h('div', null, h('p', null, 'Looking for “' + m.name + '”…'));
  const dlg = dialog('Link to live NAV', body, [{ label: 'Close', onclick: (c) => c() }]);
  try {
    const list = await prices.guessScheme(m.name);
    body.replaceChildren(h('p', { class: 'note' }, 'Pick the scheme that matches your fund (direct plan, growth option).'),
      list.length ? h('ul', { class: 'pick' }, list.map((s) => h('li', null, h('button', { class: 'wide', onclick: () => { mutate((d) => { d.mutualFunds.find((x) => x.id === m.id).schemeCode = String(s.schemeCode); }); dlg.close(); toast('Linked. Refresh prices to fetch the NAV.'); } }, s.schemeName, h('small', null, ' code ' + s.schemeCode))))) : h('p', { class: 'empty' }, 'No match found. Enter the scheme code by hand when editing the fund.'));
  } catch (e) { body.replaceChildren(h('p', { class: 'form-error' }, 'Could not search funds: ' + e.message)); }
}

/** Add a new fund (opening values) or edit one. Amount invested and units come from the history once a fund has one. */
export function fundForm(m) {
  const isNew = !m;
  const { data } = S;
  const locked = !isNew && hasHistory(data, m);
  const n = isNew ? 0 : (data.mfTxns || []).filter((t) => fundKey(t.scheme) === fundKey(m.name)).length;
  formDialog({
    title: isNew ? 'Add mutual fund' : 'Edit ' + m.name, value: m || {},
    fields: [
      { key: 'name', label: 'Scheme name', required: true, readonly: n > 0, hint: n > 0 ? 'The name ties the fund to its transactions, so it is fixed.' : null },
      { key: 'folio', label: 'Folio number' },
      { key: 'schemeCode', label: 'Scheme code (for live NAV)', hint: 'Leave empty and use “Link to live NAV” on the fund page to find it.' },
      { key: 'invested', label: 'Amount invested (₹)', type: 'number', required: true, readonly: locked, hint: locked ? 'Worked out from the buy history. Record a buy or a redemption to change it.' : isNew ? 'What you hold today. Record later buys from the fund page.' : null },
      { key: 'units', label: 'Units held', type: 'number', required: true, readonly: locked, hint: locked ? 'Worked out from the buy history.' : null },
      { key: 'nav', label: 'Last NAV (₹)', type: 'number', required: true },
    ],
    deleteMessage: n ? `Delete this fund and its ${n} transaction${n === 1 ? '' : 's'}? XIRR and sales history for it are lost.` : 'Delete this fund?',
    onSave: (v) => mutate((d) => {
      if (isNew) { d.mutualFunds.push({ id: nextId('m', d.mutualFunds), ...v }); return; }
      const t = d.mutualFunds.find((x) => x.id === m.id);
      if (v.nav !== t.nav) delete t.prevNav;
      if (locked) { delete v.invested; delete v.units; }
      if (n > 0) delete v.name;
      Object.assign(t, v);
    }),
    onDelete: isNew ? null : () => mutate((d) => { const k = fundKey(m.name); d.mfTxns = (d.mfTxns || []).filter((t) => fundKey(t.scheme) !== k); d.mutualFunds = d.mutualFunds.filter((x) => x.id !== m.id); }),
  });
}

const TYPES = [{ value: 'Purchase', label: 'Buy (lump sum)' }, { value: 'SIP', label: 'Buy (SIP instalment)' }, { value: 'Redeem', label: 'Sell / redeem' }];
/** Record a buy or sell, or edit one. Units are worked out from amount and NAV when left empty. */
export function fundTxnForm(fund, txn, preset = {}) {
  const isNew = !txn;
  const { data } = S;
  const typeOf = (t) => (BUY_TYPES.test(t.type) ? (/sip/i.test(t.type) ? 'SIP' : 'Purchase') : 'Redeem');
  const base = txn ? { type: typeOf(txn), date: txn.date, amount: txn.amount, nav: txn.nav || (txn.units ? txn.amount / txn.units : ''), units: txn.units } : { type: preset.type || 'Purchase', date: C.todayISO(), nav: fund.liveNav || fund.nav || '' };
  formDialog({
    title: isNew ? (base.type === 'Redeem' ? 'Sell ' : 'Record a buy in ') + fund.name : 'Edit transaction', value: base, saveLabel: isNew ? 'Add' : 'Save',
    deleteMessage: 'Delete this transaction? The units, amount invested and XIRR are recalculated without it.',
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: TYPES },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'amount', label: 'Amount (₹)', type: 'number', required: true, half: true },
      { key: 'nav', label: 'NAV that day (₹)', type: 'number', half: true, hint: 'From your statement. Units = amount ÷ NAV when you leave units empty.' },
      { key: 'units', label: 'Units (optional)', type: 'number', hint: 'Type the units from the statement if you have them; it is more exact.' },
    ],
    onSave: (v) => {
      if (!(v.amount > 0)) { toast('Enter an amount above zero.', 'bad'); return false; }
      const units = v.units > 0 ? v.units : v.nav > 0 ? Math.round((v.amount / v.nav) * 1000) / 1000 : 0;
      if (!(units > 0)) { toast('Enter the NAV or the units.', 'bad'); return false; }
      mutate((d) => {
        const f = d.mutualFunds.find((x) => x.id === fund.id);
        d.mfTxns = d.mfTxns || [];
        // a fund typed in by hand: what it already holds stays as its opening balance, and the history starts now
        if (isNew && f && !f.opening && !d.mfTxns.some((t) => fundKey(t.scheme) === fundKey(f.name)) && f.units > 0) f.opening = { units: f.units, invested: f.invested };
        const rec = { scheme: fund.name, type: v.type, units, nav: v.nav > 0 ? v.nav : Math.round((v.amount / units) * 10000) / 10000, amount: v.amount, date: v.date, src: txn ? txn.src || 'manual' : 'manual' };
        if (isNew) d.mfTxns.push({ id: Math.max(0, ...d.mfTxns.map((t) => Number(t.id) || 0)) + 1, ...rec });
        else Object.assign(d.mfTxns.find((t) => t.id === txn.id), rec);
      });
      toast(isNew ? 'Added' : 'Saved');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.mfTxns = d.mfTxns.filter((t) => t.id !== txn.id); }),
  });
}

export function render(root) {
  const { data, all } = S;
  const id = route().query.get('id');
  const m = all.mf.items.find((x) => x.id === id);
  root.append(h('div', { class: 'pagebar' }, h('a', { class: 'back', href: '#/equity/holdings?v=funds' }, '← Funds')));
  if (!m) { root.append(h('div', { class: 'card' }, h('p', { class: 'empty' }, 'This fund is not in your list any more.'))); return; }
  const raw = data.mutualFunds.find((x) => x.id === id) || m;
  const k = fundKey(m.name);
  const txns = (data.mfTxns || []).filter((t) => fundKey(t.scheme) === k).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id || 0) - (a.id || 0)));
  const book = all.mf.book && all.mf.book.holdings.find((x) => x.key === k);
  const realized = book ? book.realized : 0;
  root.append(h('div', { class: 'card' }, h('h2', { style: { margin: 0 } }, m.name),
    h('p', { class: 'note', style: { margin: '4px 0 0' } }, [m.folio ? 'Folio ' + m.folio : null, m.schemeCode ? 'Scheme code ' + m.schemeCode : 'Not linked to live NAV'].filter(Boolean).join(' · ')),
    canEdit() ? h('div', { class: 'btn-row', style: { marginTop: 10 } }, btn('Record a buy', () => fundTxnForm(m, null, { type: 'Purchase' }), 'primary'), btn('Sell', () => fundTxnForm(m, null, { type: 'Redeem' })),
      !m.schemeCode ? btn('Link to live NAV', () => linkFund(m), '', { keep: true }) : null, btn('Edit fund', () => fundForm(raw))) : null));
  root.append(h('div', { class: 'stats' },
    stat('Value now', money(m.current), `${dec(m.units, 3)} units × ${dec(m.liveNav, 4)}`),
    stat('Invested', money(m.invested), `average ${dec(m.units ? m.invested / m.units : 0, 2)} a unit`),
    stat('Gain', gainText(m.pl), pct(m.ret, 1)),
    stat('XIRR', m.xirr == null ? '–' : h('span', { class: posNeg(m.xirr) }, pct(m.xirr, 1)), m.xirr == null ? (raw.opening ? 'part of this fund has no purchase dates' : txns.length ? 'needs a purchase over a month old' : 'record purchases with dates to see it') : 'yearly return including timing'),
    realized ? stat('Already earned', money(realized), 'profit booked on units sold') : null));
  if (m.schemeCode) root.append(historyCard({ title: 'NAV history', load: () => fundNavs(m.schemeCode), avg: m.units ? m.invested / m.units : null, firstBuy: txns.length ? txns[txns.length - 1].date : null, unit: 'NAV' }));
  else root.append(h('div', { class: 'card' }, h('p', { class: 'note' }, 'Link this fund to its live NAV to see its price history.')));
  if (m.schemeCode) root.append(fundFundamentals(m, m.schemeCode));
  const body = h('div', null);
  if (raw.opening) body.append(h('p', { class: 'note' }, `Before this history began you already held ${dec(raw.opening.units, 3)} units costing ${money(raw.opening.invested)}. They are included above and have no purchase date.`));
  if (!txns.length) body.append(h('p', { class: 'empty' }, 'No buy history for this fund yet.'), h('p', { class: 'note' }, canEdit() ? 'Press “Record a buy” each time you invest (SIP or lump sum). What you hold today stays as the starting point, and units, amount invested and XIRR then follow your history.' : ''));
  else body.append(table([
    { label: 'Date', host: true, get: (t) => dateStr(t.date) },
    { label: 'Type', render: (t) => h('span', { class: BUY_TYPES.test(t.type) ? '' : 'neg' }, BUY_TYPES.test(t.type) ? (/sip/i.test(t.type) ? 'SIP' : 'Buy') : 'Sell') },
    { label: 'Units', mob: 'under', mlabel: '', cls: 'r', get: (t) => dec(t.units, 3) },
    { label: 'NAV', mob: 'under', mlabel: 'at ', cls: 'r', get: (t) => dec(t.nav || (t.units ? t.amount / t.units : 0), 4) },
    { label: 'Amount', cls: 'r', get: (t) => money(t.amount) },
  ], txns, { onRow: canEdit() ? (t) => fundTxnForm(m, data.mfTxns.find((x) => x.id === t.id)) : null }));
  root.append(section(`Buy history${txns.length ? ` (${txns.length})` : ''}`, body, canEdit() ? [btn('Record a buy', () => fundTxnForm(m, null, { type: 'Purchase' }), 'primary')] : null));
}
