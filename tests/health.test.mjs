// Share health check rules.
import { assess, moves, overview, trendFrom, sma, RULES } from '../js/health.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const base = { name: 'X', symbol: 'X', value: 100000, invested: 80000, ret: 0.25, xirr: 0.2, heldDays: 800, share: 0.1, trend: null, info: null };
let a = assess(base);
ok(a.verdict === 'well' && a.action === 'hold', 'strong yearly return, mid size: well + hold: ' + a.verdict + a.action);
a = assess({ ...base, share: 0.03 }); ok(a.action === 'add', 'doing well and small: add');
a = assess({ ...base, share: 0.03, info: { pe: 60 } }); ok(a.action === 'hold', 'expensive P/E blocks add');
a = assess({ ...base, share: 0.2 }); ok(a.action === 'trim', 'over 15%: trim');
a = assess({ ...base, xirr: -0.08, ret: -0.2, heldDays: 900, share: 0.05 }); ok(a.verdict === 'review' && a.action === 'review', 'long loss: review ' + a.verdict + a.action);
a = assess({ ...base, xirr: 0.02, ret: 0.03, trend: { px: 80, ma50: 90, ma200: 100, fromHi: -0.35 } }); ok(a.verdict === 'review' || a.verdict === 'watch', 'weak return + downtrend is flagged: ' + a.verdict);
a = assess({ ...base, heldDays: 120, xirr: 0.9, ret: 0.3 }); ok(a.verdict === 'track' && /too early/.test(a.reasons[0]), 'young holding is not judged on yearly return');
a = assess({ ...base, heldDays: 100, ret: -0.3, xirr: -0.6 }); ok(a.verdict === 'watch', 'deep early loss: watch');
a = assess({ ...base, info: { roe: 18, earnGrowth: -0.3 } }); ok(a.reasons.some((r) => /Profit is falling/.test(r)) && a.reasons.some((r) => /return on equity/.test(r)), 'key figures are read (roe as a percent)');
ok(sma([1, 2, 3, 4], 2) === 3.5 && sma([1], 2) === null, 'sma');
const rows = Array.from({ length: 260 }, (_, i) => ({ c: 100 + i, h: 101 + i, l: 99 + i }));
const t = trendFrom(rows); ok(t.px === 359 && t.ma200 > t.ma50 === false && t.fromHi < 0 && t.hi52 === 360, 'trendFrom');
const m = moves({ holdings: [{ name: 'Dip', price: 150, heldDays: 500, ret: 0.4, xirr: 0.3, lots: [{ date: '2025-01-01', qty: 10, cost: 2000 }, { date: '2025-06-01', qty: 10, cost: 1500 }] },
  { name: 'Down', price: 50, heldDays: 800, ret: -0.4, xirr: -0.2, lots: [{ date: '2024-01-01', qty: 10, cost: 1000 }, { date: '2024-06-01', qty: 10, cost: 800 }] }],
  sold: [{ name: 'Early', proceeds: 10000, nowValue: 15000, realized: 2000 }, { name: 'Timely', proceeds: 10000, nowValue: 7000, realized: 1000 }, { name: 'NoPx', proceeds: 1, nowValue: null, realized: 0 }] });
ok(m.good.some((x) => x.title === 'Dip') && m.good.some((x) => x.title === 'Timely') && m.bad.some((x) => x.title === 'Early') && m.bad.some((x) => x.title === 'Down'), 'moves: ' + JSON.stringify(m));
ok(overview([{ name: 'A', ret: -0.2, value: 70, sector: 'Banking' }, { name: 'B', ret: 0.1, value: 30, sector: 'IT' }]).length === 2, 'overview');
console.log(bad ? bad + ' failed' : 'health ok'); process.exit(bad ? 1 : 0);
