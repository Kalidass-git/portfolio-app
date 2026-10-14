// Sector and market-cap bucket for shares and ETFs, and a category for mutual funds.
// Built-in table for common NSE names (approximate, based on the AMFI large/mid/small lists). Anything can be changed per holding.
const L = 'Large', M = 'Mid', S = 'Small';
const T = {
  HDFCBANK: ['Banking', L], ICICIBANK: ['Banking', L], SBIN: ['Banking', L], AXISBANK: ['Banking', L], KOTAKBANK: ['Banking', L], INDUSINDBK: ['Banking', L], BANKBARODA: ['Banking', L], PNB: ['Banking', L], CANBK: ['Banking', L], UNIONBANK: ['Banking', L],
  FEDERALBNK: ['Banking', M], IDFCFIRSTB: ['Banking', M], YESBANK: ['Banking', M], AUBANK: ['Banking', M], BANDHANBNK: ['Banking', M], IDBI: ['Banking', M], KTKBANK: ['Banking', S], SOUTHBANK: ['Banking', S], TMB: ['Banking', S], SURYODAY: ['Banking', S], CSBBANK: ['Banking', S], DCBBANK: ['Banking', S], RBLBANK: ['Banking', M], UJJIVANSFB: ['Banking', S], EQUITASBNK: ['Banking', S],
  BAJFINANCE: ['Financial services', L], BAJAJFINSV: ['Financial services', L], MUTHOOTFIN: ['Financial services', L], CHOLAFIN: ['Financial services', L], SHRIRAMFIN: ['Financial services', L], JIOFIN: ['Financial services', L], HDFCAMC: ['Financial services', M], ABCAPITAL: ['Financial services', M], MANAPPURAM: ['Financial services', M], LICHSGFIN: ['Financial services', M], POWERFIN: ['Financial services', M], PFC: ['Financial services', L], RECLTD: ['Financial services', L], FIVESTAR: ['Financial services', S], CREDITACC: ['Financial services', S], IIFL: ['Financial services', M],
  ICICIPRULI: ['Insurance', M], SBILIFE: ['Insurance', L], HDFCLIFE: ['Insurance', L], LICI: ['Insurance', L], ICICIGI: ['Insurance', L],
  INFY: ['IT', L], TCS: ['IT', L], HCLTECH: ['IT', L], WIPRO: ['IT', L], TECHM: ['IT', L], LTIM: ['IT', L], PERSISTENT: ['IT', M], COFORGE: ['IT', M], MPHASIS: ['IT', M],
  SUNPHARMA: ['Pharma & healthcare', L], DRREDDY: ['Pharma & healthcare', L], CIPLA: ['Pharma & healthcare', L], ZYDUSLIFE: ['Pharma & healthcare', L], DIVISLAB: ['Pharma & healthcare', L], LUPIN: ['Pharma & healthcare', L], AUROPHARMA: ['Pharma & healthcare', M], NATCOPHARM: ['Pharma & healthcare', M], APOLLOHOSP: ['Pharma & healthcare', L], TORNTPHARM: ['Pharma & healthcare', L],
  MARUTI: ['Auto', L], TMPV: ['Auto', L], TMCV: ['Auto', L], TATAMOTORS: ['Auto', L], TATAMTRDVR: ['Auto', L], HEROMOTOCO: ['Auto', L], 'M&M': ['Auto', L], BAJAJ_AUTO: ['Auto', L], 'BAJAJ-AUTO': ['Auto', L], EICHERMOT: ['Auto', L], TVSMOTOR: ['Auto', L], ASHOKLEY: ['Auto', L],
  'ARE&M': ['Auto components', M], BOSCHLTD: ['Auto components', L], MOTHERSON: ['Auto components', L], EXIDEIND: ['Auto components', M],
  ITC: ['FMCG', L], HINDUNILVR: ['FMCG', L], NESTLEIND: ['FMCG', L], BRITANNIA: ['FMCG', L], DABUR: ['FMCG', L], TATACONSUM: ['FMCG', L], JYOTHYLAB: ['FMCG', S], COLPAL: ['FMCG', L], MARICO: ['FMCG', L],
  ITCHOTELS: ['Hospitality', M], MHRIL: ['Hospitality', S], INDHOTEL: ['Hospitality', L], LEMONTREE: ['Hospitality', S],
  TATASTEEL: ['Metals & mining', L], JSWSTEEL: ['Metals & mining', L], HINDALCO: ['Metals & mining', L], VEDL: ['Metals & mining', L], COALINDIA: ['Metals & mining', L], NMDC: ['Metals & mining', L], SAIL: ['Metals & mining', M],
  TATACHEM: ['Chemicals', M], SHARDACROP: ['Chemicals', S], PIDILITIND: ['Chemicals', L], UPL: ['Chemicals', M], SRF: ['Chemicals', M],
  RELIANCE: ['Oil, gas & energy', L], ONGC: ['Oil, gas & energy', L], BPCL: ['Oil, gas & energy', L], IOC: ['Oil, gas & energy', L], PETRONET: ['Oil, gas & energy', M], GAIL: ['Oil, gas & energy', L], NTPC: ['Power & utilities', L], POWERGRID: ['Power & utilities', L], TATAPOWER: ['Power & utilities', L], ADANIGREEN: ['Power & utilities', L],
  KALYANKJIL: ['Consumer discretionary', M], TITAN: ['Consumer discretionary', L], LALITHAA: ['Consumer discretionary', S], TRENT: ['Consumer discretionary', L], DMART: ['Consumer discretionary', L], ZOMATO: ['Consumer discretionary', L], ETERNAL: ['Consumer discretionary', L],
  FINCABLES: ['Capital goods', S], LT: ['Capital goods', L], SIEMENS: ['Capital goods', L], ABB: ['Capital goods', L], HAL: ['Capital goods', L], BEL: ['Capital goods', L], POLYCAB: ['Capital goods', M],
  BHARTIARTL: ['Telecom', L], IDEA: ['Telecom', M], ULTRACEMCO: ['Cement & construction', L], AMBUJACEM: ['Cement & construction', L], SHREECEM: ['Cement & construction', L], DLF: ['Real estate', L], GODREJPROP: ['Real estate', M],
  ASIANPAINT: ['Consumer discretionary', L], ADANIENT: ['Diversified', L], ADANIPORTS: ['Logistics & ports', L],
  // ETFs: sector is what the ETF holds
  NIFTYBEES: ['Diversified (index)', L], JUNIORBEES: ['Diversified (index)', L], BANKBEES: ['Banking', L], ITBEES: ['IT', L], PHARMABEES: ['Pharma & healthcare', L], SETFGOLD: ['Gold', 'Gold'], GOLDBEES: ['Gold', 'Gold'], GOLDIETF: ['Gold', 'Gold'], MON100: ['Global (US tech)', L], MAFANG: ['Global (US tech)', L],
};
export const UNKNOWN_SECTOR = 'Unclassified', UNKNOWN_CAP = 'Unclassified';
export const SECTORS = [...new Set(Object.values(T).map((x) => x[0]))].sort();
export const CAPS = ['Large', 'Mid', 'Small', 'Gold', 'Unclassified'];

/** Sector and cap for one holding. An edit stored on the holding (sector, cap) wins over the built-in table. */
export function classify(stock) {
  const hit = T[(stock.symbol || '').toUpperCase()];
  return { sector: stock.sector || (hit ? hit[0] : UNKNOWN_SECTOR), cap: stock.cap || (hit ? hit[1] : UNKNOWN_CAP), guessed: !stock.sector && !hit };
}

/** What kind of fund this is, from its name. cap is the bucket used in the market-cap chart. */
export function fundCategory(name) {
  const n = (name || '').toLowerCase();
  const rule = (re, category, cap) => (re.test(n) ? { category, cap } : null);
  return rule(/small ?cap/, 'Small cap', 'Small') || rule(/large.{0,6}mid/, 'Large & mid cap', 'Large & mid') || rule(/mid ?cap/, 'Mid cap', 'Mid')
    || rule(/gold/, 'Gold', 'Gold') || rule(/liquid|overnight|money market|ultra short|low duration|gilt|bond|debt|corporate bond|banking & psu/, 'Debt', 'Debt')
    || rule(/arbitrage|hybrid|balanced|multi asset|equity savings|dynamic asset/, 'Hybrid', 'Hybrid')
    || rule(/flexi|multi ?cap|focus|elss|tax saver|value|contra|dividend yield/, 'Flexi / multi cap', 'Flexi / multi')
    || rule(/nifty 50|sensex|large ?cap|blue ?chip|nifty next 50/, 'Large cap / index', 'Large')
    || rule(/index|nifty/, 'Index', 'Large') || { category: 'Other', cap: 'Other' };
}
