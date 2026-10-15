// Wealth projector: set a year-end target, plan the months, check in each month end, look years ahead, and see what markets could do.
import { h, segTabs, subTab } from '../ui.js';
import * as year from './proj-year.js';
import * as ahead from './proj-ahead.js';
import * as market from './proj-market.js';

const TABS = [['year', 'This year'], ['ahead', 'Years ahead'], ['market', 'Market outlook']];

export function render() {
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Wealth projector views'), h('a', { class: 'crosslink', href: '#/plan', title: 'Plan page (from your Excel)' }, 'Plan page')));
  if (tab === 'year') year.render(root);
  else if (tab === 'ahead') ahead.render(root);
  else market.render(root);
  return root;
}
