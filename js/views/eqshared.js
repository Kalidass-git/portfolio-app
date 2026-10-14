// Forms and helpers shared by the Shares & funds screens: buy, sell, edit trade, corporate actions, classification, opening trades.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as CAT from '../categories.js';
import { h, money, dec, formDialog, confirmDialog, toast, num } from '../ui.js';
import { classify, SECTORS, CAPS } from '../classify.js';
import { symKey } from '../trades.js';

export const knownSymbols = (d = S.data) => [...new Set([...(d.trades || []).map((t) => symKey(t.symbol)), ...d.stocks.map((s) => symKey(s.symbol))])].sort();
export const tradeMode = () => !!(S.data.trades && S.data.trades.length);
const nameOf = (sym, d = S.data) => { const s = d.stocks.find((x) => symKey(x.symbol) === sym); if (s) return s.name; const t = (d.trades || []).slice().reverse().find((x) => symKey(x.symbol) === sym); return t ? t.name : sym; };

/** Latest known price for a symbol, held or not. */
export function priceOfSymbol(sym, all = S.all, d = S.data) {
  const it = all.stocks.items.find((x) => symKey(x.symbol) === sym);
  if (it && it.livePrice > 0) return it.livePrice;
  const pb = d.priceBook && d.priceBook[sym];
  return pb && pb.price > 0 ? pb.price : null;
}

function symbolList() {
  let dl = document.getElementById('sym-list');
  if (!dl) { dl = h('datalist', { id: 'sym-list' }); document.body.append(dl); }
  dl.replaceChildren(...knownSymbols().map((s) => h('option', { value: s }, nameOf(s))));
  return 'sym-list';
}

/** When holdings were typed in by hand there are no trades yet. This turns each holding into an opening buy so selling and XIRR can start. */
export function openingTrades(d) {
  const today = C.todayISO();
  return d.stocks.map((s, i) => ({ id: i + 1, symbol: symKey(s.symbol), name: s.name, isin: '', type: 'BUY', qty: s.qty, amount: Math.round(s.qty * s.avgPrice * 100) / 100, date: s.buyDate || today, time: '', orderId: '', src: 'opening' }));
}
export async function ensureTrades() {
  if (tradeMode()) return true;
  const ok = await confirmDialog('Selling and buying are recorded as trades. Your holdings were entered by hand, so there is no trade history yet. Start tracking from your current holdings? Each holding becomes one opening purchase at its average price. For real XIRR and tax-correct costs, import your Groww history instead (Shares & funds → Import).', 'Start from current holdings');
  if (!ok) return false;
  mutate((d) => {
    d.trades = openingTrades(d);
  });
  return true;
}

export async function tradeForm(trade, preset = {}) {
  if (!trade && !(await ensureTrades())) return;
  const { data } = S;
  const isNew = !trade;
  const base = trade ? { ...trade } : { type: 'BUY', date: C.todayISO(), ...preset };
  formDialog({
    title: isNew ? (base.type === 'SELL' ? 'Record a sale' : 'Record a purchase') : 'Edit trade', value: base, saveLabel: isNew ? 'Add' : 'Save',
    deleteMessage: 'Delete this trade? Holdings and XIRR are recalculated without it.',
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: [{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }] },
      { key: 'symbol', label: 'Symbol', type: 'text', required: true, list: symbolList(), hint: 'NSE symbol, for example INFY.', onInput: (el, inputs) => { const n = nameOf(symKey(el.value)); if (n && n !== symKey(el.value) && !inputs.name.value) inputs.name.value = n; } },
      { key: 'name', label: 'Name (optional)', type: 'text' },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'qty', label: 'Quantity', type: 'number', required: true, half: true },
      { key: 'amount', label: 'Total value (₹)', type: 'number', required: true, half: true, hint: 'Price × quantity. Add charges here if you want them counted.' },
    ],
    onSave: (v) => {
      if (!(v.qty > 0) || !(v.amount >= 0)) { toast('Quantity must be above zero.', 'bad'); return false; }
      mutate((d) => {
        const rec = { symbol: symKey(v.symbol), name: v.name || nameOf(symKey(v.symbol), d), isin: trade ? trade.isin || '' : '', type: v.type, qty: v.qty, amount: v.amount, date: v.date, time: trade ? trade.time || '' : '', orderId: trade ? trade.orderId || '' : '', src: trade ? trade.src || 'manual' : 'manual' };
        if (isNew) d.trades.push({ id: Math.max(0, ...d.trades.map((t) => Number(t.id) || 0)) + 1, ...rec }); else Object.assign(d.trades.find((t) => t.id === trade.id), rec);
      });
      toast(isNew ? 'Trade added' : 'Trade updated');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.trades = d.trades.filter((t) => t.id !== trade.id); }),
  });
}

/** Sell some or all of a holding. Optionally credits the proceeds to a bank account. */
export async function sellForm(stock) {
  if (!(await ensureTrades())) return;
  const { data, all } = S;
  const sym = symKey(stock.symbol);
  const held = all.stocks.items.find((x) => symKey(x.symbol) === sym) || stock;
  const px = held.livePrice || stock.price || 0;
  const accts = [{ value: '', label: 'Do not add to a bank account' }, ...data.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.holder}` }))];
  const preview = h('small', null, '');
  const calc = (inputs) => { const q = Number(inputs.qty.value) || 0, p = Number(inputs.price.value) || 0, c = Number(inputs.charges.value) || 0; preview.textContent = q && p ? `You receive ${money(q * p - c)}` + (held.avgPrice ? ` · average cost ${money(q * held.avgPrice)} · ${q * p - c - q * held.avgPrice >= 0 ? 'gain' : 'loss'} ${money(Math.abs(q * p - c - q * held.avgPrice))}` : '') : ''; };
  formDialog({
    title: 'Sell ' + stock.name, saveLabel: 'Record sale', value: { date: C.todayISO(), qty: held.qty, price: px ? Math.round(px * 100) / 100 : '', charges: '', acct: '' },
    fields: [
      { key: 'date', label: 'Sale date', type: 'date', required: true },
      { key: 'qty', label: `Quantity (you hold ${num(held.qty)})`, type: 'number', required: true, half: true, onInput: (el, i) => calc(i) },
      { key: 'price', label: 'Sale price per share (₹)', type: 'number', required: true, half: true, onInput: (el, i) => calc(i), hint: 'Prefilled with the latest price.' },
      { key: 'charges', label: 'Brokerage and taxes (₹, optional)', type: 'number', onInput: (el, i) => calc(i) },
      { key: 'acct', label: 'Add the money to', type: 'select', options: accts, hint: 'Leave empty if you record the bank entry yourself, so it is not counted twice.' },
      { key: 'preview', label: ' ', type: 'text', readonly: true },
    ],
    onSave: (v) => {
      if (!(v.qty > 0) || v.qty > held.qty + 1e-9) { toast(`Enter a quantity between 1 and ${held.qty}.`, 'bad'); return false; }
      if (!(v.price > 0)) { toast('Enter the sale price.', 'bad'); return false; }
      const proceeds = Math.round((v.qty * v.price - (v.charges || 0)) * 100) / 100;
      mutate((d) => {
        d.trades.push({ id: Math.max(0, ...d.trades.map((t) => Number(t.id) || 0)) + 1, symbol: sym, name: stock.name, isin: '', type: 'SELL', qty: v.qty, amount: proceeds, date: v.date, time: '', orderId: '', src: 'manual' });
        if (v.acct) {
          const cat = CAT.add(d, { name: 'Investment sale', kind: 'transfer' });
          d.ledger.push({ id: Math.max(0, ...d.ledger.map((e) => e.id || 0)) + 1, acct: v.acct, date: v.date, desc: `Sold ${stock.name}`, debit: 0, credit: proceeds, category: cat });
        }
      });
      toast('Sale recorded. See it under Shares & funds → Sold.');
    },
  });
  // the preview line is display only
  setTimeout(() => { const el = document.querySelector('dialog.sheet input[name=preview]'); if (el) { el.closest('label').replaceChildren(preview); calc({ qty: document.querySelector('dialog.sheet input[name=qty]'), price: document.querySelector('dialog.sheet input[name=price]'), charges: document.querySelector('dialog.sheet input[name=charges]') }); } }, 0);
}

export const ACTION_LABEL = { split: 'Stock split', bonus: 'Bonus shares', merger: 'Merger / new symbol', demerger: 'Demerger', dividend: 'Dividend' };
export function describeAction(a) {
  if (a.type === 'split') return `1 share became ${a.ratio}`;
  if (a.type === 'bonus') return `${a.num} free for every ${a.den} held`;
  if (a.type === 'merger') return `swapped into ${a.to} at ${a.ratio} per share`;
  if (a.type === 'demerger') return `${a.ratio} ${a.to} per share, ${Math.round(a.costFraction * 1000) / 10}% of cost moved`;
  return money(a.amount) + ' received';
}
export async function actionForm(action, preset = {}) {
  if (!action && !(await ensureTrades())) return;
  const isNew = !action;
  const base = action ? { ...action } : { type: 'dividend', date: C.todayISO(), num: 1, den: 1, ...preset };
  if (base.costFraction != null) base.costPct = Math.round(base.costFraction * 10000) / 100;
  formDialog({
    title: isNew ? 'Add split, bonus, dividend…' : 'Edit ' + ACTION_LABEL[action.type].toLowerCase(), value: base, saveLabel: isNew ? 'Add' : 'Save',
    deleteMessage: 'Delete this entry? Holdings and XIRR are recalculated without it.',
    fields: [
      { key: 'type', label: 'What happened', type: 'select', options: Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })) },
      { key: 'symbol', label: 'Share (symbol)', type: 'text', required: true, list: symbolList() },
      { key: 'date', label: 'Date (ex-date or record date)', type: 'date', required: true },
      { key: 'ratio', label: 'New shares for each old share', type: 'number', showIf: (v) => ['split', 'merger', 'demerger'].includes(v.type), required: true, hint: 'Split 1:10 → 10. Bonus is separate. Merger: shares of the new company per old share. Demerger: new-company shares per share held (1 for every 10 → 0.1).' },
      { key: 'num', label: 'Bonus: free shares', type: 'number', half: true, showIf: (v) => v.type === 'bonus', required: true },
      { key: 'den', label: 'for every shares held', type: 'number', half: true, showIf: (v) => v.type === 'bonus', required: true, hint: 'Bonus 1:1 → 1 and 1. Bonus 2:3 → 2 and 3.' },
      { key: 'to', label: 'New share (symbol)', type: 'text', showIf: (v) => v.type === 'merger' || v.type === 'demerger', required: true },
      { key: 'toName', label: 'New share name (optional)', type: 'text', showIf: (v) => v.type === 'demerger' },
      { key: 'costPct', label: 'Share of the cost that moves to the new share (%)', type: 'number', showIf: (v) => v.type === 'demerger', required: true, hint: 'From the company’s cost-allocation notice. The old share keeps the rest.' },
      { key: 'amount', label: 'Dividend received (₹ total)', type: 'number', showIf: (v) => v.type === 'dividend', required: true },
    ],
    onSave: (v) => {
      const rec = { type: v.type, symbol: symKey(v.symbol), date: v.date };
      if (v.type === 'split') rec.ratio = v.ratio;
      if (v.type === 'bonus') { rec.num = v.num; rec.den = v.den; }
      if (v.type === 'merger') { rec.to = symKey(v.to); rec.ratio = v.ratio; }
      if (v.type === 'demerger') { rec.to = symKey(v.to); rec.toName = v.toName || ''; rec.ratio = v.ratio; rec.costFraction = (v.costPct || 0) / 100; }
      if (v.type === 'dividend') rec.amount = v.amount;
      mutate((d) => {
        d.corporateActions = d.corporateActions || [];
        if (isNew) d.corporateActions.push({ id: 'a' + (Math.max(0, ...d.corporateActions.map((a) => Number(String(a.id).replace(/\D/g, '')) || 0)) + 1), ...rec });
        else { const t = d.corporateActions.find((a) => a.id === action.id); for (const k of ['ratio', 'num', 'den', 'to', 'toName', 'costFraction', 'amount']) delete t[k]; Object.assign(t, rec); }
      });
      toast('Saved');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.corporateActions = d.corporateActions.filter((a) => a.id !== action.id); }),
  });
}

export function classifyForm(stock) {
  const c = classify(stock);
  formDialog({
    title: 'Sector and size of ' + stock.name, value: { sector: c.sector, cap: c.cap }, saveLabel: 'Save',
    fields: [
      { key: 'sector', label: 'Sector', type: 'select', options: [...new Set([...SECTORS, 'Unclassified', c.sector])].sort() },
      { key: 'cap', label: 'Market-cap size', type: 'select', options: CAPS },
    ],
    onSave: (v) => mutate((d) => { const t = d.stocks.find((x) => x.id === stock.id); t.sector = v.sector; t.cap = v.cap; }),
  });
}
