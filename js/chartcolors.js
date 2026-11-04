// "Colours" panel for the charts: change the colour of each line, or put them all back to the defaults.
import { h } from './ui.js';
import { LINE_COLORS, DEFAULT_COLORS, setLineColor, resetLineColors } from './mchart.js';

const PRESETS = ['#2962ff', '#ff9800', '#9c27b0', '#e91e63', '#089981', '#f23645', '#00b8d4', '#b08900', '#787b86', '#212121'];

/** @param {[string,string][]} items  [key, label] pairs  @param {() => void} changed redraw the chart */
export function colourPanel(items, changed) {
  const row = ([k, label]) => {
    const input = h('input', { type: 'color', class: 'cc-in', value: LINE_COLORS[k], 'aria-label': label + ' colour', onchange: (e) => { setLineColor(k, e.target.value); changed(); } });
    return h('div', { class: 'cc-row' }, h('span', { class: 'cc-lab' }, h('i', { style: { background: LINE_COLORS[k] } }), label),
      h('div', { class: 'cc-sw' }, PRESETS.map((c) => h('button', { type: 'button', class: 'tm-sw' + (LINE_COLORS[k].toLowerCase() === c ? ' on' : ''), style: { background: c }, 'aria-label': `${label} ${c}`, onclick: () => { setLineColor(k, c); changed(); } })), input));
  };
  const custom = items.some(([k]) => LINE_COLORS[k] !== DEFAULT_COLORS[k]);
  return h('div', { class: 'cc-panel' }, items.map(row),
    h('div', { class: 'cc-foot' }, h('small', { class: 'muted' }, 'Kept on this device. Trendline colours are chosen per line when you draw or tap it.'),
      h('button', { type: 'button', class: 'btn small', disabled: custom ? null : 'disabled', onclick: () => { resetLineColors(); changed(); } }, 'Reset to default')));
}
