// Alert on a trendline: tell me when a day, week or month candle closes above or below the line. Set from the line's popup on the chart,
// shown with the other price alerts (Shares & funds > Watch, a share's own page, the Home action centre).
import { S, mutate, nextId } from '../store.js';
import { formDialog, toast } from '../ui.js';
import * as W from '../watch.js';
import { todayISO } from '../calc.js';

/** alert: an existing trendline alert to change, or null to make one for the line `lineId` of `symbol`. */
export function lineAlertForm({ symbol, name = '', yahoo = '', lineId = '', alert = null }) {
  const sym = String(alert ? alert.ref : symbol).toUpperCase().trim(), isNew = !alert;
  formDialog({
    title: isNew ? 'Alert on this trendline' : 'Change trendline alert', sub: name || sym,
    fields: [
      { key: 'dir', label: 'Tell me when a candle closes', type: 'select', options: [{ value: 'above', label: 'Above the line' }, { value: 'below', label: 'Below the line' }] },
      { key: 'tf', label: 'Candle size', type: 'select', options: [{ value: 'D', label: 'Day' }, { value: 'W', label: 'Week' }, { value: 'M', label: 'Month' }],
        hint: 'A candle counts once it has finished: a day after the market closes, a week after Friday, a month after its last day. The line carries on past its end points.' },
      ...(isNew ? [] : [{ key: 'on', label: 'Alert is on', type: 'checkbox' }]),
    ],
    value: alert ? { dir: alert.dir || 'above', tf: alert.tf || 'D', on: alert.on !== false } : { dir: 'above', tf: 'W' },
    saveLabel: isNew ? 'Set alert' : 'Save',
    onSave: (v) => {
      const dup = (S.data.alerts || []).some((x) => x.rule === 'trendline' && x.lineId === (alert ? alert.lineId : lineId) && x.dir === v.dir && x.tf === v.tf && (!alert || x.id !== alert.id));
      if (dup) { toast('That alert is already set on this line.'); return false; }
      mutate((d) => {
        d.alerts = d.alerts || [];
        if (isNew) d.alerts.push({ id: nextId('al', d.alerts), kind: 'stock', ref: sym, name: name || sym, rule: 'trendline', lineId, dir: v.dir, tf: v.tf, on: true, created: todayISO(), ...(yahoo ? { yahoo } : {}) });
        else { const t = d.alerts.find((x) => x.id === alert.id); if (t) Object.assign(t, { dir: v.dir, tf: v.tf, on: v.on !== false, created: todayISO() }); }
      });
      W.refreshLineAlerts(S.data).then(() => window.dispatchEvent(new Event('rerender'))).catch(() => {});
      toast(isNew ? 'Alert set. It is checked when the app opens and when you press Refresh.' : 'Alert saved.');
    },
    onDelete: isNew ? null : () => mutate((d) => { d.alerts = (d.alerts || []).filter((x) => x.id !== alert.id); }), deleteMessage: 'Remove this trendline alert?',
  });
}
