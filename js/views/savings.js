// Savings & chits: EPF, PPF, LIC, RD and chits live here, as an investment of their own. The code is shared with the old Cash tab.
import { h, segTabs, subTab } from '../ui.js';
import { savingsTab, closedTab } from './cash.js';

const TABS = [['running', 'Savings & chits'], ['closed', 'Closed']];
export function render() {
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Savings views')));
  root.append(tab === 'closed' ? closedTab() : savingsTab());
  return root;
}
