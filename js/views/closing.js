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
const nextId = (d) => Math.max(0, ...d.ledger.map((e) => e.id || 0)) + 1;
/** Adds the credit entry to the ledger and returns its id (or null). Call inside mutate(). */
export function creditBank(d, { acct, date, amount, desc }) {
  if (!acct || !(amount > 0)) return null;
  const cat = CAT.add(d, { name: REDEMPTION, kind: 'transfer' });
  const id = nextId(d);
  d.ledger.push({ id, acct, date, desc, debit: 0, credit: amount, category: cat });
  return id;
}
export function removeCredit(d, ledgerId) { if (ledgerId) d.ledger = d.ledger.filter((e) => e.id !== ledgerId); }
/** Takes out every bank entry a close created (the principal one and, when there was interest, the interest one). */
export function removeCredits(d, closed) { if (closed) for (const id of [closed.ledgerId, closed.interestLedgerId]) removeCredit(d, id); }

// What each kind of holding calls its interest income. An income category you already have that matches is used; otherwise "Income <word>" is made.
const INCOME_WORDS = { Bond: /bond/i, FD: /\b(fd|fixed|deposit)/i, Lending: /lend/i, Chit: /chit/i, RD: /\brd\b|recurring/i };
/** The income category name for interest from a holding: Bond, FD, Lending, Chit, RD, or any other word (e.g. a saving type). */
export function incomeCategory(d, word) {
  const rx = INCOME_WORDS[word] || new RegExp('\\b' + String(word).replace(/[^a-z0-9]/gi, '') + '\\b', 'i');
  const hit = CAT.categoryList(d).find((c) => c.kind === 'income' && /^\s*income\b/i.test(c.name) && rx.test(c.name));
  return hit ? hit.name : CAT.add(d, { name: 'Income ' + word, kind: 'income' });
}
/**
 * Splits what came back: up to `principal` is a transfer (Investment redemption) and anything above it is interest income under the holding's own
 * income category. Returns { ledgerId, interestLedgerId }. With no bank account, no entries. With nothing above the principal, one entry as before.
 */
export function creditClose(d, { acct, date, amount, desc, principal = 0, word }) {
  if (!acct || !(amount > 0)) return { ledgerId: null, interestLedgerId: null };
  const interest = principal > 0 && word ? Math.round((amount - principal) * 100) / 100 : 0;
  if (!(interest > 0)) return { ledgerId: creditBank(d, { acct, date, amount, desc }), interestLedgerId: null };
  const ledgerId = creditBank(d, { acct, date, amount: principal, desc: desc + ' · principal' });
  const id = nextId(d);
  d.ledger.push({ id, acct, date, desc: desc + ' · interest', debit: 0, credit: interest, category: incomeCategory(d, word) });
  return { ledgerId, interestLedgerId: id };
}

/**
 * title, name: shown to the user. amount: suggested money received. extra: more form fields.
 * apply(d, v, ledgerId, interestLedgerId) runs inside mutate() and must set `closed` on the item (store both ids so Reopen can remove both entries).
 * principal, word: what was paid in, and the kind of holding (Bond, FD, Lending, Chit, RD...). When more comes back than was paid in, the bank gets two entries:
 * the principal as a transfer and the rest as interest income.
 */
export function closeForm({ title, amount, hint, extra = [], extraValue = {}, apply, desc, dateLabel = 'Closed on', amountLabel = 'Amount received (₹)', principal = 0, word = '' }) {
  formDialog({
    title, saveLabel: 'Close it', value: { date: C.todayISO(), amount: Math.round(amount || 0), acct: S.data.accounts[0] ? S.data.accounts[0].id : '', note: '', ...extraValue },
    fields: [
      { key: 'date', label: dateLabel, type: 'date', required: true },
      { key: 'amount', label: amountLabel, type: 'number', required: true, hint: hint || 'Suggested from your records. Change it to what you actually got.' },
      ...extra,
      { key: 'acct', label: 'Add the money to', type: 'select', options: bankOptions(), hint: principal > 0 && word ? `If you got back more than the ${money(principal)} you paid in, the bank gets two entries: ${money(principal)} as a transfer (Investment redemption) and the rest as interest income (Income ${word}).` : undefined },
      { key: 'note', label: 'Note (optional)', type: 'text' },
    ],
    onSave: (v) => {
      mutate((d) => {
        const { ledgerId, interestLedgerId } = creditClose(d, { acct: v.acct, date: v.date, amount: v.amount, desc, principal, word });
        apply(d, v, ledgerId, interestLedgerId);
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
