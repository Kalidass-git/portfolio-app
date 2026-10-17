// Savings & chits: chits, provident funds, insurance and recurring deposits each have a tab. The code is shared with the old Cash tab.
import { h, segTabs, subTab } from '../ui.js';
import { S } from '../store.js';
import { savingsTab, closedTab } from './cash.js';

const KNOWN = ['Chit', 'EPF', 'PPF', 'LIC', 'RD'];
export function render() {
  const root = h('div', { class: 'page' });
  const hasOther = S.all.savings.some((s) => !KNOWN.includes(s.type));
  const TABS = [['chits', 'Chits'], ['pf', 'Provident fund'], ['insurance', 'Insurance'], ['rd', 'RDs'], ...(hasOther ? [['other', 'Other']] : []), ['closed', 'Closed']];
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Savings views')));
  const title = { chits: 'Chits', pf: 'Provident fund', insurance: 'Insurance', rd: 'Recurring deposits', other: 'Other savings' }[tab];
  root.append(tab === 'closed' ? closedTab() : savingsTab(title));
  return root;
}
