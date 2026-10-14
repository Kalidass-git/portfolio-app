// Corporate actions on popular Indian stocks that change a holding without a trade.
// They are offered (and can be edited or removed) when you import a Groww history, because the broker's order list
// does not contain them. Dates are the ex-date / record date. Cost fractions come from the companies' advisories
// and are rounded, so check them against your contract notes if you need tax-exact figures.
export const KNOWN_ACTIONS = [
  { type: 'split', symbol: 'TATASTEEL', date: '2022-07-28', ratio: 10, note: 'Tata Steel split 1:10' },
  { type: 'split', symbol: 'DRREDDY', date: '2024-10-28', ratio: 5, note: 'Dr. Reddy’s split 1:5' },
  { type: 'bonus', symbol: 'WIPRO', date: '2024-12-03', num: 1, den: 1, note: 'Wipro bonus 1:1' },
  { type: 'merger', symbol: 'IDFC', date: '2024-12-30', to: 'IDFCFIRSTB', ratio: 1.55, note: 'IDFC Ltd merged into IDFC First Bank, 155 shares for every 100' },
  { type: 'demerger', symbol: 'ITC', date: '2025-01-06', to: 'ITCHOTELS', toName: 'ITC Hotels', ratio: 0.1, costFraction: 0.1351, note: 'ITC Hotels demerger, 1 share for every 10 ITC' },
  { type: 'demerger', symbol: 'TMPV', date: '2025-10-14', to: 'TMCV', toName: 'Tata Motors Commercial Vehicles', ratio: 1, costFraction: 0.31152, note: 'Tata Motors demerger, 1 TMCV for every TMPV' },
];
export function suggestedActions(trades, existing = []) {
  const have = new Set(existing.map((a) => `${a.type}|${(a.symbol || '').toUpperCase()}|${a.date}`));
  return KNOWN_ACTIONS.filter((k) => !have.has(`${k.type}|${k.symbol}|${k.date}`) && trades.some((t) => (t.symbol || '').toUpperCase() === k.symbol && t.date < k.date));
}
