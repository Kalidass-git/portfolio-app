// Shares & funds → Import: Groww files, trade history, corporate actions and dividends.
import { S, mutate, setData, allowShrink } from '../store.js';
import * as C from '../calc.js';
import { h, money, dec, num, dateStr, section, table, btn, dialog, confirmDialog, toast, stat, canEdit } from '../ui.js';
import { readTable } from '../xlsx.js';
import { parseGrowwStocks, parseGrowwMF, mergeList, stockKey, mfKey } from '../importers.js';
import { suggestedActions } from '../knownActions.js';
import { materialize, materializeFunds, symKey, buildEquity, fundKey } from '../trades.js';
import { tradeForm, actionForm, ACTION_LABEL, describeAction, ensureTrades, openingTrades } from './eqshared.js';

const BACKUP = 'pt.importBackup';
const rerender = () => window.dispatchEvent(new Event('rerender'));
let mode = 'replace', tradeFilter = '', tradeLimit = 30;

const readBackup = () => { try { return JSON.parse(localStorage.getItem(BACKUP)); } catch { return null; } };
function saveBackup(d) {
  try { localStorage.setItem(BACKUP, JSON.stringify({ at: new Date().toISOString(), stocks: d.stocks, trades: d.trades || [], corporateActions: d.corporateActions || [], mutualFunds: d.mutualFunds, mfTxns: d.mfTxns || [] })); } catch { /* storage full: import still works, undo is not offered */ }
}
function undoImport() {
  const b = readBackup(); if (!b) return;
  allowShrink(); mutate((d) => { d.stocks = b.stocks; d.trades = b.trades; d.corporateActions = b.corporateActions; d.mutualFunds = b.mutualFunds; d.mfTxns = b.mfTxns; });
  localStorage.removeItem(BACKUP);
  toast('Import undone');
}

async function pick(accept) {
  return new Promise((res) => { const i = h('input', { type: 'file', accept }); i.onchange = () => res(i.files[0] || null); i.click(); });
}

/** What changes if the new trades are applied: holdings that appear, disappear or change quantity/cost. Uses a copy, nothing is saved. */
function dryRun(apply) {
  const copy = JSON.parse(JSON.stringify(S.data));
  apply(copy);
  const before = new Map(S.data.stocks.map((s) => [symKey(s.symbol), s]));
  materialize(copy);
  const after = new Map(copy.stocks.map((s) => [symKey(s.symbol), s]));
  const rows = [];
  for (const [k, a] of after) { const b = before.get(k); const cost = a.qty * a.avgPrice; if (!b) rows.push({ k, name: a.name, kind: 'new', qty: a.qty, cost }); else if (Math.abs(b.qty - a.qty) > 1e-6 || Math.abs(b.qty * b.avgPrice - cost) > 5) rows.push({ k, name: a.name, kind: 'changed', qty: a.qty, oldQty: b.qty, cost, oldCost: b.qty * b.avgPrice }); }
  for (const [k, b] of before) if (!after.has(k)) rows.push({ k, name: b.name, kind: 'removed', oldQty: b.qty, oldCost: b.qty * b.avgPrice });
  return { rows, warnings: buildEquity(copy).warnings, count: copy.stocks.length };
}

async function importStocks() {
  const f = await pick('.xlsx,.csv'); if (!f) return;
  let parsed;
  try { parsed = parseGrowwStocks(await readTable(f)); } catch (e) { toast(e.message, 'bad'); return; }
  const { data } = S;
  const full = mode === 'replace';
  const opening = !full && !(data.trades || []).length && data.stocks.length;   // holdings typed by hand become opening positions
  const existing = data.trades && data.trades.length ? data.trades : (opening ? openingTrades(data) : []);
  const manual = existing.filter((t) => t.src !== 'groww').length;
  const merged = mergeList(existing, parsed.trades, stockKey, { mode: full ? 'replace' : 'add' });
  const suggestions = suggestedActions(parsed.trades, data.corporateActions || []);
  const ticks = suggestions.map((s) => h('input', { type: 'checkbox', checked: true, 'aria-label': s.note }));
  const over = h('input', { type: 'checkbox' });
  const diffBox = h('div');
  const showDiff = () => {
    const chosen = suggestions.filter((_, i) => ticks[i].checked);
    const dr = dryRun((d) => {
      const m = mergeList(d.trades && d.trades.length ? d.trades : (opening ? openingTrades(d) : []), parsed.trades, stockKey, { mode: full ? 'replace' : 'add', overwrite: over.checked });
      d.trades = m.list; d.corporateActions = (d.corporateActions || []).concat(chosen.map((s, i) => ({ ...s, id: 'sx' + i })));
    });
    diffBox.replaceChildren(...[
      dr.warnings.length ? h('div', { class: 'warn-box' }, h('b', null, 'Check these'), h('ul', null, dr.warnings.slice(0, 6).map((w) => h('li', null, w)))) : null,
      dr.rows.length ? h('div', null, h('p', { class: 'mini-title' }, 'Holdings that will change'), table([
        { label: 'Share', host: true, get: (r) => r.name }, { label: 'Change', mob: 'under', get: (r) => (r.kind === 'new' ? 'added' : r.kind === 'removed' ? 'removed' : 'changed') },
        { label: 'Qty', cls: 'r', get: (r) => (r.kind === 'changed' ? `${num(r.oldQty)} → ${num(r.qty)}` : r.kind === 'removed' ? `${num(r.oldQty)} → 0` : num(r.qty)) },
        { label: 'Cost', cls: 'r', get: (r) => (r.kind === 'changed' ? `${money(r.oldCost)} → ${money(r.cost)}` : money(r.kind === 'removed' ? r.oldCost : r.cost)) },
      ], dr.rows, {})) : h('p', { class: 'note' }, `All ${dr.count} holdings match what you have now.`)].filter(Boolean));
  };
  const body = h('div', { class: 'form' },
    h('p', null, h('b', null, `${parsed.trades.length} executed orders`), ` from ${dateStr(parsed.from)} to ${dateStr(parsed.to)}.`),
    full ? h('div', { class: 'warn-box' }, h('b', null, 'This replaces everything. '), `All ${existing.length} trades you have now${manual ? ` (${manual} entered by hand)` : ''} are removed and your holdings are rebuilt from this file. A copy is kept so you can undo.`)
      : h('div', { class: 'note-box' }, `${merged.added} new, ${merged.duplicates.length} already in your list${merged.duplicates.length ? ' (skipped)' : ''}.`, opening ? ` Your ${data.stocks.length} current holdings, entered by hand, are kept as opening positions. XIRR needs the full history, so import it once for real XIRR.` : ''),
    !full && merged.duplicates.length ? h('label', { class: 'check-row' }, over, h('span', null, 'Overwrite the matching entries with the ones in this file (use when you corrected something and uploaded again)')) : null,
    suggestions.length ? h('div', null, h('p', { class: 'mini-title' }, 'Splits, bonus and demergers found for your shares'),
      h('p', { class: 'note' }, 'Groww’s order list does not include these, but they change your holdings. Untick any that do not apply.'),
      suggestions.map((s, i) => h('label', { class: 'check-row' }, ticks[i], h('span', null, `${dateStr(s.date)} · ${s.note}`)))) : null,
    parsed.skipped.length ? h('details', { class: 'more' }, h('summary', null, `${parsed.skipped.length} rows skipped`), h('ul', null, parsed.skipped.slice(0, 40).map((s) => h('li', null, `Row ${s.row} (${s.label}): ${s.reason}.`)))) : null,
    diffBox);
  body.addEventListener('change', showDiff); showDiff();
  dialog(full ? 'Replace all stock trades?' : 'Add new trades', body, [
    { label: 'Cancel', onclick: (c) => c() },
    { label: full ? 'Replace everything' : 'Add trades', class: full ? 'danger' : 'primary', onclick: (c) => {
      saveBackup(S.data);
      const chosen = suggestions.filter((_, i) => ticks[i].checked);
      allowShrink(); mutate((d) => {
        const m = mergeList(d.trades && d.trades.length ? d.trades : (opening ? openingTrades(d) : []), parsed.trades, stockKey, { mode: full ? 'replace' : 'add', overwrite: over.checked });
        d.trades = m.list;
        d.corporateActions = d.corporateActions || [];
        let n = Math.max(0, ...d.corporateActions.map((a) => Number(String(a.id).replace(/\D/g, '')) || 0));
        for (const s of chosen) { const { note, ...rest } = s; d.corporateActions.push({ id: 'a' + ++n, ...rest }); }
      });
      c(); toast(`${parsed.trades.length} orders imported`); rerender();
    } },
  ]);
}

async function importFunds() {
  const f = await pick('.xlsx,.csv'); if (!f) return;
  let parsed;
  try { parsed = parseGrowwMF(await readTable(f)); } catch (e) { toast(e.message, 'bad'); return; }
  const { data } = S;
  const existing = data.mfTxns || [];
  const full = mode === 'replace';
  const merged = mergeList(existing, parsed.txns, mfKey, { mode: full ? 'replace' : 'add' });
  const over = h('input', { type: 'checkbox' });
  const known = new Set((data.mutualFunds || []).map((m) => m.name.toLowerCase()));
  const schemes = [...new Set(parsed.txns.map((t) => t.scheme))];
  const body = h('div', { class: 'form' },
    h('p', null, h('b', null, `${parsed.txns.length} transactions`), ` in ${schemes.length} fund${schemes.length === 1 ? '' : 's'}, ${dateStr(parsed.from)} to ${dateStr(parsed.to)}.`),
    full ? h('div', { class: 'warn-box' }, h('b', null, 'This replaces everything. '), `Your ${data.mutualFunds.length} funds are rebuilt from this file only. Funds that are not in the file will be removed${(() => { const gone = data.mutualFunds.filter((m) => !schemes.some((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '') === m.name.toLowerCase().replace(/[^a-z0-9]/g, ''))); return gone.length ? ': ' + gone.map((m) => m.name).join(', ') : ''; })()}. A copy is kept so you can undo.`)
      : h('div', { class: 'note-box' }, `${merged.added} new, ${merged.duplicates.length} already in your list${merged.duplicates.length ? ' (skipped)' : ''}.`),
    !full && merged.duplicates.length ? h('label', { class: 'check-row' }, over, h('span', null, 'Overwrite the matching entries with the ones in this file')) : null,
    h('p', { class: 'mini-title' }, 'Funds in this file'), h('ul', null, schemes.map((s) => h('li', null, s, known.has(s.toLowerCase()) ? '' : ' (new)')))
    , parsed.skipped.length ? h('details', { class: 'more' }, h('summary', null, `${parsed.skipped.length} rows skipped`), h('ul', null, parsed.skipped.slice(0, 40).map((s) => h('li', null, `Row ${s.row} (${s.label}): ${s.reason}.`)))) : null);
  dialog(full ? 'Replace all fund transactions?' : 'Add new fund transactions', body, [
    { label: 'Cancel', onclick: (c) => c() },
    { label: full ? 'Replace everything' : 'Add transactions', class: full ? 'danger' : 'primary', onclick: (c) => {
      saveBackup(S.data);
      allowShrink(); mutate((d) => {
        const m = mergeList(d.mfTxns || [], parsed.txns, mfKey, { mode: full ? 'replace' : 'add', overwrite: over.checked }); d.mfTxns = m.list;
        const inFile = new Set(parsed.txns.map((t) => fundKey(t.scheme)));
        if (full) d.mutualFunds = d.mutualFunds.filter((x) => inFile.has(fundKey(x.name)));
        else for (const f of d.mutualFunds) if (inFile.has(fundKey(f.name)) && !f.opening && !(existing || []).some((t) => fundKey(t.scheme) === fundKey(f.name))) f.opening = { units: f.units, invested: f.invested };   // what you already held stays
      });
      c(); toast(`${parsed.txns.length} transactions imported. Link new funds to a scheme code to fetch NAVs.`); rerender();
    } },
  ]);
}

export function render(root) {
  const { data, all } = S;
  const trades = data.trades || [], actions = data.corporateActions || [], eq = all.stocks.eq;
  const bk = readBackup();
  root.append(section('Import from Groww', h('div', null,
    h('p', { class: 'note', style: { marginTop: 0 } }, 'Download the order history from Groww (Stocks → Reports → Order history) and the mutual fund transactions statement, then pick the file here. The file is read on this device and never uploaded anywhere.'),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Import mode' }, [['replace', 'Full history (replaces all)'], ['add', 'Only new purchases (adds)']].map(([k, l]) => h('a', { href: 'javascript:void 0', role: 'radio', 'aria-checked': String(mode === k), class: mode === k ? 'on' : '', onclick: (e) => { e.preventDefault(); mode = k; rerender(); } }, l))),
    h('p', { class: 'note' }, mode === 'replace' ? 'Use this for the complete history. Everything now in the list is replaced, after a warning that shows what will change. You can undo it.' : 'Use this after a few new buys. Entries already in the list are recognised and skipped. If you fixed something and upload again, tick “overwrite” in the next step.'),
    h('div', { class: 'btn-row' }, btn('Choose Groww stocks file', importStocks, 'primary'), btn('Choose Groww mutual fund file', importFunds)),
    bk ? h('p', { class: 'note' }, `Last import: ${new Date(bk.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. `, btn('Undo it', async () => { if (await confirmDialog('Restore everything as it was before the last import?', 'Undo import')) undoImport(); }, 'small')) : null)));

  root.append(h('div', { class: 'stats' },
    stat('Stock trades', num(trades.length), trades.length ? `${dateStr(trades.map((t) => t.date).sort()[0])} to ${dateStr(trades.map((t) => t.date).sort().pop())}` : 'none yet'),
    stat('Fund transactions', num((data.mfTxns || []).length), (data.mfTxns || []).length ? 'XIRR available' : 'none yet'),
    stat('Splits, bonus, dividends', num(actions.length), eq ? `${num(eq.dividends.length)} dividends · ${money(eq.dividends.reduce((a, x) => a + x.amount, 0))}` : '')));

  if (eq && eq.warnings.length) root.append(h('div', { class: 'warn-box' }, h('b', null, 'These need your attention'), h('ul', null, eq.warnings.slice(0, 8).map((w) => h('li', null, w))), h('p', { class: 'note' }, 'Usually a split, bonus or merger is missing. Add it below and the numbers fix themselves.')));

  root.append(section('Splits, bonus, demergers and dividends', h('div', null,
    table([
      { label: 'Date', mob: 'under', get: (a) => dateStr(a.date) }, { label: 'Share', host: true, get: (a) => a.symbol }, { label: 'What', mob: 'under', get: (a) => ACTION_LABEL[a.type] },
      { label: 'Details', get: (a) => describeAction(a) },
    ], actions.slice().sort((a, b) => (a.date < b.date ? 1 : -1)), { onRow: canEdit() ? (a) => actionForm(actions.find((x) => x.id === a.id)) : null, empty: 'None yet. Add a dividend you received, or a split or bonus that changed your quantity.' })),
    canEdit() ? [btn('Add', () => actionForm())] : null));

  const q = tradeFilter.toLowerCase();
  const list = trades.filter((t) => !q || (t.symbol + ' ' + t.name).toLowerCase().includes(q)).sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  root.append(section(`Stock trades (${trades.length})`, h('div', null,
    h('div', { class: 'filters' }, h('input', { type: 'search', placeholder: 'Search a share', value: tradeFilter, 'aria-label': 'Search trades', oninput: (e) => { tradeFilter = e.target.value; tradeLimit = 30; clearTimeout(window.__tf); window.__tf = setTimeout(() => { rerender(); const i = document.querySelector('input[aria-label="Search trades"]'); i && (i.focus(), i.setSelectionRange(tradeFilter.length, tradeFilter.length)); }, 250); } })),
    table([
      { label: 'Date', mob: 'under', get: (t) => dateStr(t.date) }, { label: 'Share', host: true, get: (t) => t.name || t.symbol },
      { label: 'Type', render: (t) => h('span', { class: t.type === 'SELL' ? 'neg' : '' }, t.type === 'SELL' ? 'Sell' : 'Buy') },
      { label: 'Qty', mob: 'under', mlabel: 'qty ', cls: 'r', get: (t) => num(t.qty) }, { label: 'Price', mob: 'under', mlabel: 'at ', cls: 'r', get: (t) => dec(t.amount / t.qty) }, { label: 'Value', cls: 'r', get: (t) => money(t.amount) },
    ], list.slice(0, tradeLimit), { onRow: canEdit() ? (t) => tradeForm(trades.find((x) => x.id === t.id)) : null, empty: 'No trades yet. Import your Groww history above.' }),
    list.length > tradeLimit ? btn(`Show more (${list.length - tradeLimit} left)`, () => { tradeLimit += 60; rerender(); }, 'wide') : null),
    canEdit() ? [btn('Record a buy or sell', () => tradeForm(), 'primary')] : null));
}
