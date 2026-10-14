// Closing an investment (chit, bond, deposit, loan, gold chit): record when it ended and what came back,
// optionally credit the money to a bank account, and keep it in a closed list. Reopening undoes it.
import { S, mutate } from '../store.js';
import * as C from '../calc.js';
import * as CAT from '../categories.js';
import { h, money, formDialog, confirmDialog, toast } from '../ui.js';

export const REDEMPTION = 'Investment redemption';

export function bankOptions(data = S.data) {
  return [{ value: '', label: 'Do not add to a bank account' }, ...data.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.holder}` }))];
}
/** Adds the credit entry to the ledger and returns its id (or null). Call inside mutate(). */
export function creditBank(d, { acct, date, amount, desc }) {
  if (!acct || !(amount > 0)) return null;
  const cat = CAT.add(d, { name: REDEMPTION, kind: 'transfer' });
  const id = Math.max(0, ...d.ledger.map((e) => e.id || 0)) + 1;
  d.ledger.push({ id, acct, date, desc, debit: 0, credit: amount, category: cat });
  return id;
}
export function removeCredit(d, ledgerId) { if (ledgerId) d.ledger = d.ledger.filter((e) => e.id !== ledgerId); }

/**
 * title, name: shown to the user. amount: suggested money received. extra: more form fields.
 * apply(d, v, ledgerId) runs inside mutate() and must set `closed` on the item.
 */
export function closeForm({ title, amount, hint, extra = [], extraValue = {}, apply, desc }) {
  formDialog({
    title, saveLabel: 'Close it', value: { date: C.todayISO(), amount: Math.round(amount || 0), acct: S.data.accounts[0] ? S.data.accounts[0].id : '', note: '', ...extraValue },
    fields: [
      { key: 'date', label: 'Closed on', type: 'date', required: true },
      { key: 'amount', label: 'Amount received (₹)', type: 'number', required: true, hint: hint || 'Suggested from your records. Change it to what you actually got.' },
      ...extra,
      { key: 'acct', label: 'Add the money to', type: 'select', options: bankOptions() },
      { key: 'note', label: 'Note (optional)', type: 'text' },
    ],
    onSave: (v) => {
      mutate((d) => {
        const ledgerId = creditBank(d, { acct: v.acct, date: v.date, amount: v.amount, desc });
        apply(d, v, ledgerId);
      });
      toast('Closed. It is now in the Closed list.');
    },
  });
}
/** Reopen: remove the closed marker and the bank credit it created. */
export async function reopen(label, undo) {
  if (!(await confirmDialog(`Reopen ${label}? The money added to the bank for it is removed again.`, 'Reopen'))) return;
  mutate((d) => undo(d));
  toast('Reopened');
}
export const closedBox = (c) => h('span', null, `${c.date}`);
