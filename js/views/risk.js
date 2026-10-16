// Risk & what-if: set limits for every kind of holding, then try an investment before making it.
import { h, segTabs, subTab } from '../ui.js';
import { outlookSwitch } from './projector.js';
import * as riskTab from './proj-risk.js';
import * as whatif from './proj-whatif.js';

const TABS = [['limits', 'Risk limits'], ['whatif', 'What-if']];

export function render() {
  const root = h('div', { class: 'page' });
  const tab = subTab(TABS.map((t) => t[0]));
  root.append(outlookSwitch('risk'), h('div', { class: 'pagebar' }, segTabs(TABS, tab, 'Risk and what-if views')));
  if (tab === 'limits') riskTab.render(root); else whatif.render(root);
  return root;
}
