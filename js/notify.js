// Phone reminders: works out which reminders the Android app should schedule. No phone code here, so it can be tested anywhere.
//
// Why reminders are planned ahead: the app has no server, so nothing can wake the phone with news. Instead, every time the app opens
// or its data changes, it looks at the dates it already knows (loan EMIs, bond interest, money due to you, maturities) and asks Android
// to show a note at 9 am on those days. Opening the app again replaces the whole plan, so a payment marked paid stops reminding.
import * as C from './calc.js';

export const DEFAULTS = { on: false, hour: 9, amounts: true, emi: true, bonds: true, receipts: true, maturities: true };
export const MAX_PENDING = 60;      // Android keeps every reminder as an alarm: stay far below its limits
export const AHEAD_DAYS = 45;       // how far ahead to plan
const OVERDUE_NUDGES = 3;           // an overdue payment reminds for this many mornings, then stops until the app is opened again

const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const DAY = 864e5;
const isoMs = (d) => Date.parse(d + 'T00:00:00Z');
const addDays = (d, n) => new Date(isoMs(d) + n * DAY).toISOString().slice(0, 10);
const short = (d) => { const [, m, dd] = d.split('-'); return Number(dd) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]; };

/** Android needs a whole number for each reminder. The same words always give the same number, so a rebuilt plan replaces the old one cleanly. */
export function idFor(text) {
  let x = 2166136261;
  for (let i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0) % 2147483000 + 1;
}

const ROUTE = { 'Loan EMI': '#/fixed/loans', 'Bond interest': '#/fixed/bonds', 'Money to receive': '#/fixed/lending', Bond: '#/fixed/bonds', 'Fixed deposit': '#/fixed/fds', Lending: '#/fixed/lending' };
const kindGroup = (k) => (k === 'Loan EMI' ? 'emi' : k === 'Bond interest' ? 'bonds' : k === 'Money to receive' ? 'receipts' : 'maturities');

/** The app's own wording for a payment says "(overdue)" or "(due today)" depending on the day it was worked out. Reminders need the plain name. */
const nameOf = (t) => t.replace(/( EMI)? \((overdue|due today)\)$/, '').replace(/ (EMI due|to pay you)$/, '');
const titleOf = (u) => (u.kind === 'Loan EMI' ? nameOf(u.title) + ' EMI due' : u.kind === 'Money to receive' ? nameOf(u.title) + ' to pay you' : u.title);

/** The dated things worth a reminder. Each carries `days` (0 = today, negative = overdue). */
function dated(data, all, o) {
  const items = [];
  for (const u of C.upcoming(data, all, AHEAD_DAYS)) if (u.kind !== 'Bond interest') items.push({ date: u.date, days: u.days, title: titleOf(u), name: nameOf(u.title), amount: u.amount, kind: u.kind });
  const bn = C.bondNotify(data);
  if (bn.on) {
    const tds = (data.settings && data.settings.tdsRate) ?? 0.1;
    for (const d of C.bondsDueSoon(all, all.asOf, AHEAD_DAYS)) items.push({ date: d.date, days: d.days, title: d.b.name + ' interest due', name: d.b.name, amount: C.bondDueAmount(d.b, d.date.slice(0, 7), tds), kind: 'Bond interest', lead: bn.days });
  }
  return items.filter((x) => o[kindGroup(x.kind)] !== false);
}

/** One note for a list of payments. `when` finishes the title ("today", "tomorrow", "on 12 Nov"). */
function make(date, hour, slot, list, o, when, title) {
  const n = list.length;
  const total = list.reduce((a, x) => a + (x.amount || 0), 0);
  const kinds = new Set(list.map((x) => x.kind));
  const href = kinds.size === 1 ? ROUTE[[...kinds][0]] || '#/home' : '#/home';
  const head = title || (n === 1 ? `${list[0].title} ${when}` : `${n} payments due ${when}`);
  const one = list[0];
  const body = n === 1
    ? (o.amounts && one.amount > 0 ? inr(one.amount) : 'Tap to open Family Wealth')
    : list.slice(0, 4).map((x) => x.title + (o.amounts && x.amount > 0 ? ' · ' + inr(x.amount) : '')).join('\n') + (n > 4 ? `\nand ${n - 4} more` : '') + (o.amounts && total > 0 ? `\nTotal ${inr(total)}` : '');
  return { id: idFor(`${date}|${hour}|${slot}`), slot, date, hour, title: head, body, href };
}

/**
 * The reminders to schedule, soonest first.
 * data, all: the app's data and its computed figures. opts: the phone's own settings (DEFAULTS above, kept on the phone, never in the data file).
 * now: a Date (the phone's clock). Returns [{ id, at: Date, title, body, href, slot }].
 */
export function buildReminders(data, all, opts = {}, now = new Date()) {
  const o = { ...DEFAULTS, ...opts };
  if (!o.on) return [];
  const today = all.asOf;
  const hour = Math.min(22, Math.max(5, Math.round(Number(o.hour)) || 9));
  const out = [];
  const items = dated(data, all, o);

  // 1. On the day: everything falling due that day, in one note
  const byDay = new Map();
  for (const x of items) if (x.days >= 0) (byDay.get(x.date) || byDay.set(x.date, []).get(x.date)).push(x);
  for (const [date, list] of byDay) out.push(make(date, hour, 'due', list, o, 'today'));

  // 2. Before the day: loan EMIs one day ahead, bond interest as many days ahead as set on Fixed income (the money has to be in the bank)
  const lead = new Map();
  for (const x of items) {
    if (x.days < 0 || (x.kind !== 'Loan EMI' && x.kind !== 'Bond interest')) continue;
    const before = x.kind === 'Bond interest' ? Math.max(0, x.lead || 0) : 1;
    if (!before) continue;
    const when = addDays(x.date, -before);
    if (when < today) continue;
    const k = when + '|' + x.date;
    (lead.get(k) || lead.set(k, { when, dueDate: x.date, before, list: [] }).get(k)).list.push(x);
  }
  for (const { when, dueDate, before, list } of lead.values()) out.push(make(when, hour, 'before-' + dueDate, list, o, before === 1 ? 'tomorrow' : 'on ' + short(dueDate)));

  // 3. Overdue loan EMIs and money not yet received: a few mornings in a row
  const late = items.filter((x) => x.days < 0 && (x.kind === 'Loan EMI' || x.kind === 'Money to receive'));
  if (late.length) {
    const title = late.length > 1 ? `${late.length} payments are overdue` : late[0].kind === 'Loan EMI' ? `${late[0].name} EMI is overdue` : `${late[0].name}: payment is overdue`;
    for (let i = 0; i < OVERDUE_NUDGES; i++) out.push(make(addDays(today, i), hour, 'overdue', late, o, '', title));
  }

  // Turn dates into the phone's clock time, drop anything already past, keep the soonest
  const nowMs = now.getTime();
  return out
    .map((r) => { const [y, m, d] = r.date.split('-').map(Number); return { ...r, at: new Date(y, m - 1, d, r.hour, 0, 0) }; })
    .filter((r) => r.at.getTime() > nowMs + 60000)
    .sort((a, b) => a.at - b.at || a.id - b.id)
    .slice(0, MAX_PENDING)
    .map(({ id, at, title, body, href, slot }) => ({ id, at, title, body, href, slot }));
}
