// Wealth projector: set a year-end target, plan the months, check in each month end, look years ahead, and see what markets could do.
import { h, segTabs, subTab } from '../ui.js';
import * as year from './proj-year.js';
import * as ahead from './proj-ahead.js';
import * as market from './proj-market.js';

const TABS = [['year', 'This year'], ['ahead', 'Years ahead'], ['market', 'Market outlook']];

/** Two pages share the phone's "Outlook" tab. This switch sits on top of both. */
export function outlookSwitch(cur) {
  return h('nav', { class: 'outlook-switch', 'aria-label': 'Outlook pages' },
    h('a', { href: '#/projector', class: cur === 'projector' ? 'on' : '', 'aria-current': cur === 'projector' ? 'page' : null }, 'Wealth projector'),
    h('a', { href: '#/risk', class: cur === 'risk' ? 'on' : '', 'aria-current': cur === 'risk' ? 'page' : null }, 'Risk & what-if'));
}

export function render() {
  const root = h('div', { class: 'page' });
  const sub = location.hash.split('?')[0].split('/')[2];
  if (sub === 'risk' || sub === 'whatif') { location.replace('#/risk/' + (sub === 'risk' ? 'limits' : 'whatif')); return root; }
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(outlookSwitch('projector'), h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Wealth projector views'), h('a', { class: 'crosslink', href: '#/plan', title: 'Plan page (from your Excel)' }, 'Plan page')));
  if (tab === 'year') year.render(root);
  else if (tab === 'ahead') ahead.render(root);
  else market.render(root);
  return root;
}
