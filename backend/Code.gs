/**
 * Family Wealth backend. Runs inside YOUR Google account (Apps Script), keeps one JSON file in YOUR Google Drive.
 * Nothing else stores your data. Setup steps are in docs/SETUP.md.
 *
 * Two keys protect it (stored in Script Properties, never in the app code):
 *   OWNER_KEY  can read and write.   FAMILY_KEY  can only read and ask for share prices.
 */
var FOLDER_NAME = 'Family Wealth Data';
var FILE_NAME = 'portfolio-data.json';
var KEEP_BACKUPS = 30;

/** Run this once from the editor. It creates the Drive folder and file, and makes the two keys. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('OWNER_KEY')) props.setProperty('OWNER_KEY', randomKey_());
  if (!props.getProperty('FAMILY_KEY')) props.setProperty('FAMILY_KEY', randomKey_());
  getFile_();
  Logger.log('Drive folder: "' + FOLDER_NAME + '" (in My Drive)');
  Logger.log('OWNER_KEY  (keep private): ' + props.getProperty('OWNER_KEY'));
  Logger.log('FAMILY_KEY (view only, share with family): ' + props.getProperty('FAMILY_KEY'));
  Logger.log('Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), then copy the /exec URL.');
}
/** Run this to print the keys again, or call setKeys('owner-key', 'family-key') to choose your own. */
function showKeys() {
  var p = PropertiesService.getScriptProperties();
  Logger.log('OWNER_KEY: ' + p.getProperty('OWNER_KEY'));
  Logger.log('FAMILY_KEY: ' + p.getProperty('FAMILY_KEY'));
}
function setKeys(owner, family) {
  if (!owner || !family || owner === family || owner.length < 16 || family.length < 16) throw new Error('Use two different keys, at least 16 characters each.');
  var p = PropertiesService.getScriptProperties();
  p.setProperty('OWNER_KEY', owner); p.setProperty('FAMILY_KEY', family);
}

function randomKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function same_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function roleOf_(key) {
  var p = PropertiesService.getScriptProperties();
  if (same_(key, p.getProperty('OWNER_KEY'))) return 'owner';
  if (same_(key, p.getProperty('FAMILY_KEY'))) return 'viewer';
  return null;
}
function getFolder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
function getFile_() {
  var folder = getFolder_();
  var it = folder.getFilesByName(FILE_NAME);
  if (it.hasNext()) return it.next();
  return folder.createFile(FILE_NAME, JSON.stringify({ version: 0, updatedAt: null, data: null }), MimeType.PLAIN_TEXT);
}
function readStore_() {
  try { return JSON.parse(getFile_().getBlob().getDataAsString()); } catch (e) { return { version: 0, updatedAt: null, data: null }; }
}
function backup_(file) {
  var folder = getFolder_();
  var name = 'backup-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd') + '.json';
  var subs = folder.getFoldersByName('backups');
  var bf = subs.hasNext() ? subs.next() : folder.createFolder('backups');
  var existing = bf.getFilesByName(name);
  if (!existing.hasNext()) bf.createFile(name, file.getBlob().getDataAsString(), MimeType.PLAIN_TEXT);
  var files = [], all = bf.getFiles();
  while (all.hasNext()) files.push(all.next());
  files.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });
  for (var i = KEEP_BACKUPS; i < files.length; i++) files[i].setTrashed(true);
}

function doGet(e) {
  return json_({ ok: true, app: 'family-wealth-backend', message: 'The backend is running. Open the Family Wealth app and connect with your key.' });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'Bad request.' }); }
  var role = roleOf_(String(req.key || ''));
  if (!role) return json_({ error: 'The access key is not correct.' });
  try {
    switch (req.action) {
      case 'auth': return json_({ ok: true, role: role });
      case 'read': {
        var s = readStore_();
        return json_({ ok: true, role: role, version: s.version, updatedAt: s.updatedAt, data: s.data, empty: !s.data });
      }
      case 'write': {
        if (role !== 'owner') return json_({ error: 'This key is view only.' });
        var lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try {
          var file = getFile_();
          var cur = JSON.parse(file.getBlob().getDataAsString() || '{}');
          if (req.baseVersion != null && cur.version !== req.baseVersion) {
            return json_({ conflict: true, version: cur.version, updatedAt: cur.updatedAt });
          }
          if (cur.data) backup_(file);
          var next = { version: (cur.version || 0) + 1, updatedAt: new Date().toISOString(), data: req.data };
          file.setContent(JSON.stringify(next));
          return json_({ ok: true, version: next.version, updatedAt: next.updatedAt });
        } finally { lock.releaseLock(); }
      }
      case 'mf': return json_(mf_(req.path));
      case 'mfnav': return json_(mfnav_(req.codes || []));
      case 'quotes': return json_(quotes_(req.symbols || []));
      case 'dividends': return json_(dividends_(req.symbols || []));
      case 'history': return json_(history_(req.symbol, req.yahoo));
      case 'fundamentals': return json_(fundamentals_(req.symbols || []));
      case 'details': return json_(details_(req.symbol, req.yahoo));
      default: return json_({ error: 'Unknown action.' });
    }
  } catch (err) {
    return json_({ error: 'Backend error: ' + err.message });
  }
}

/** Reads one mfapi.in address, trying up to 3 times (mfapi is sometimes slow or answers with an error for a moment). Returns the parsed JSON or throws. */
function mfFetch_(path) {
  var last = 'no answer';
  for (var i = 0; i < 3; i++) {
    try {
      var r = UrlFetchApp.fetch('https://api.mfapi.in/mf' + path, { muteHttpExceptions: true });
      if (r.getResponseCode() === 200) return JSON.parse(r.getContentText());
      last = 'mfapi answered ' + r.getResponseCode();
    } catch (e) { last = e.message; }
    Utilities.sleep(400 * (i + 1));
  }
  throw new Error(last);
}

/** Mutual fund NAVs from mfapi.in, read here so the browser's CORS rules do not matter. path: '/152156', '/152156/latest', '/search?q=hdfc' */
function mf_(path) {
  path = String(path || '');
  if (!/^\/(\d{3,8}(\/latest)?|search\?q=[A-Za-z0-9%+._ -]{1,80})$/.test(path)) return { error: 'Bad fund request.' };
  try { return { ok: true, body: mfFetch_(path) }; } catch (e) { return { error: e.message }; }
}

/** Latest two NAVs for many funds in one go (the app sends the scheme codes it holds). Funds that fail are listed in `errors` and the app tries them again itself. */
function mfnav_(codes) {
  var list = [];
  codes.slice(0, 80).forEach(function (c) { c = String(c); if (/^\d{3,8}$/.test(c) && list.indexOf(c) < 0) list.push(c); });
  var navs = {}, errors = {};
  var reqs = list.map(function (c) { return { url: 'https://api.mfapi.in/mf/' + c, muteHttpExceptions: true }; });
  var res = [];
  try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { res = []; }
  var retry = [];
  list.forEach(function (c, i) {
    var r = res[i], ok = false;
    try { if (r && r.getResponseCode() === 200) { var j = JSON.parse(r.getContentText()); if (j && j.data && j.data.length) { navs[c] = { rows: j.data.slice(0, 2), name: j.meta && j.meta.scheme_name }; ok = true; } } } catch (e) { /* retried below */ }
    if (!ok) retry.push(c);
  });
  retry.forEach(function (c) {
    try { var j = mfFetch_('/' + c); if (j && j.data && j.data.length) navs[c] = { rows: j.data.slice(0, 2), name: j.meta && j.meta.scheme_name }; else errors[c] = 'No NAV listed'; }
    catch (e) { errors[c] = e.message; }
  });
  return { ok: true, navs: navs, errors: errors };
}

/** Share prices from Yahoo Finance (NSE first, then BSE). symbols: [{symbol:'INFY', yahoo:'' }] */
function quotes_(list) {
  var out = {}, errors = {};
  var reqs = [], meta = [];
  list.slice(0, 120).forEach(function (s) {
    var tickers = s.yahoo ? [s.yahoo] : [s.symbol + '.NS', s.symbol + '.BO'];
    meta.push({ symbol: s.symbol, tickers: tickers });
    reqs.push(url_(tickers[0]));
  });
  var res = UrlFetchApp.fetchAll(reqs);
  var retry = [];
  res.forEach(function (r, i) {
    var q = parse_(r);
    if (q) out[meta[i].symbol] = q; else if (meta[i].tickers.length > 1) retry.push(i); else errors[meta[i].symbol] = 'no price';
  });
  if (retry.length) {
    var r2 = UrlFetchApp.fetchAll(retry.map(function (i) { return url_(meta[i].tickers[1]); }));
    r2.forEach(function (r, k) {
      var i = retry[k], q = parse_(r);
      if (q) out[meta[i].symbol] = q; else errors[meta[i].symbol] = 'no price found on NSE or BSE';
    });
  }
  return { ok: true, quotes: out, errors: errors };
}
function url_(ticker) {
  return { url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?range=1d&interval=1d', muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } };
}
function parse_(r) {
  try {
    if (r.getResponseCode() !== 200) return null;
    var m = JSON.parse(r.getContentText()).chart.result[0].meta;
    if (!m || !(m.regularMarketPrice > 0)) return null;
    return { price: m.regularMarketPrice, prevClose: m.chartPreviousClose || null, high52: m.fiftyTwoWeekHigh || null, low52: m.fiftyTwoWeekLow || null };
  } catch (e) { return null; }
}

/** Daily closing prices (up to 10 years) for one share, from Yahoo Finance (NSE first, then BSE). Returns { ok, series: [[date, close], ...] }. */
function history_(symbol, yahoo) {
  if (!symbol && !yahoo) return { error: 'No symbol given.' };
  var tickers = yahoo ? [yahoo] : [symbol + '.NS', symbol + '.BO'];
  for (var i = 0; i < tickers.length; i++) {
    try {
      var r = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(tickers[i]) + '?range=10y&interval=1d', { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.getResponseCode() !== 200) continue;
      var res = JSON.parse(r.getContentText()).chart.result[0];
      var ts = res.timestamp || [], cl = (res.indicators.quote[0] || {}).close || [], out = [];
      for (var k = 0; k < ts.length; k++) if (cl[k] > 0) out.push([new Date(ts[k] * 1000).toISOString().slice(0, 10), Math.round(cl[k] * 100) / 100]);
      if (out.length > 1) return { ok: true, series: out };
    } catch (e) { /* try the next exchange */ }
  }
  return { error: 'No price history found for ' + (symbol || yahoo) + '.' };
}

// ---- Fundamentals (P/E, 52-week range, averages) from Yahoo Finance ----
var UA_ = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
/** Yahoo asks for a cookie and a "crumb" before it shares ratios. Kept for a few hours so most calls reuse it. */
function yahooSession_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) { var c = cache.get('yh_session'); if (c) return JSON.parse(c); }
  var r = UrlFetchApp.fetch('https://fc.yahoo.com', { muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': UA_ } });
  var raw = r.getAllHeaders()['Set-Cookie'] || [];
  if (typeof raw === 'string') raw = [raw];
  var cookie = raw.map(function (x) { return String(x).split(';')[0]; }).join('; ');
  var cr = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { muteHttpExceptions: true, headers: { 'User-Agent': UA_, 'Cookie': cookie } });
  var crumb = cr.getContentText();
  if (cr.getResponseCode() !== 200 || !crumb || crumb.length > 40) throw new Error('Yahoo did not open a session (try again in a few minutes)');
  var o = { cookie: cookie, crumb: crumb };
  cache.put('yh_session', JSON.stringify(o), 4 * 3600);
  return o;
}
function yahooGet_(path, query) {
  for (var attempt = 0; attempt < 2; attempt++) {
    var ss = yahooSession_(attempt > 0);
    var r = UrlFetchApp.fetch('https://query1.finance.yahoo.com' + path + '?' + query + '&crumb=' + encodeURIComponent(ss.crumb), { muteHttpExceptions: true, headers: { 'User-Agent': UA_, 'Cookie': ss.cookie } });
    var code = r.getResponseCode();
    if (code === 401 || code === 403) continue;
    if (code !== 200) throw new Error('Yahoo answered ' + code);
    return JSON.parse(r.getContentText());
  }
  throw new Error('Yahoo refused the session');
}
function num_(x) { return x != null && isFinite(x) ? Number(x) : null; }
function slimQuote_(q) {
  var dy = num_(q.trailingAnnualDividendYield); dy = dy != null ? dy * 100 : num_(q.dividendYield);
  return { name: q.longName || q.shortName || null, price: num_(q.regularMarketPrice), prevClose: num_(q.regularMarketPreviousClose), dayPct: q.regularMarketChangePercent != null ? q.regularMarketChangePercent / 100 : null,
    pe: num_(q.trailingPE), fpe: num_(q.forwardPE), pb: num_(q.priceToBook), eps: num_(q.epsTrailingTwelveMonths), mcap: num_(q.marketCap), dy: dy,
    hi52: num_(q.fiftyTwoWeekHigh), lo52: num_(q.fiftyTwoWeekLow), dma50: num_(q.fiftyDayAverage), dma200: num_(q.twoHundredDayAverage), volume: num_(q.regularMarketVolume) };
}
/** Ratios and 52-week range for many shares at once. symbols: [{symbol, yahoo}] -> { ok, data: { SYMBOL: {...} }, errors } */
function fundamentals_(list) {
  var out = {}, errors = {}, items = list.slice(0, 150);
  function run(tickerOf, only) {
    var map = {}, tickers = [];
    only.forEach(function (i) { var t = tickerOf(items[i]); map[t] = i; tickers.push(t); });
    for (var k = 0; k < tickers.length; k += 40) {
      var chunk = tickers.slice(k, k + 40);
      var j = yahooGet_('/v7/finance/quote', 'symbols=' + encodeURIComponent(chunk.join(',')));
      var res = (j.quoteResponse && j.quoteResponse.result) || [];
      res.forEach(function (q) { var i = map[q.symbol]; if (i != null && q.regularMarketPrice > 0) out[items[i].symbol] = slimQuote_(q); });
    }
  }
  try {
    run(function (s) { return s.yahoo || s.symbol + '.NS'; }, items.map(function (_, i) { return i; }));
    var miss = []; items.forEach(function (s, i) { if (!out[s.symbol] && !s.yahoo) miss.push(i); });
    if (miss.length) run(function (s) { return s.symbol + '.BO'; }, miss);
  } catch (e) { return { error: 'Backend error: ' + e.message }; }
  items.forEach(function (s) { if (!out[s.symbol]) errors[s.symbol] = 'not found'; });
  return { ok: true, data: out, errors: errors };
}
/** Deeper numbers for one share: return on equity, debt, margins, growth, sector. */
function details_(symbol, yahoo) {
  if (!symbol && !yahoo) return { error: 'No symbol given.' };
  var tickers = yahoo ? [yahoo] : [symbol + '.NS', symbol + '.BO'];
  for (var i = 0; i < tickers.length; i++) {
    try {
      var j = yahooGet_('/v10/finance/quoteSummary/' + encodeURIComponent(tickers[i]), 'modules=financialData,defaultKeyStatistics,assetProfile,summaryDetail');
      var r = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
      if (!r) continue;
      var fd = r.financialData || {}, ks = r.defaultKeyStatistics || {}, ap = r.assetProfile || {}, sd = r.summaryDetail || {};
      function v(o) { return o && o.raw != null ? num_(o.raw) : null; }
      return { ok: true, details: { roe: v(fd.returnOnEquity), roa: v(fd.returnOnAssets), de: v(fd.debtToEquity), margin: v(fd.profitMargins), opMargin: v(fd.operatingMargins), revGrowth: v(fd.revenueGrowth), earnGrowth: v(fd.earningsGrowth),
        currentRatio: v(fd.currentRatio), beta: v(ks.beta) != null ? v(ks.beta) : v(sd.beta), bookValue: v(ks.bookValue), payout: v(sd.payoutRatio), sector: ap.sector || null, industry: ap.industry || null, target: v(fd.targetMeanPrice), recommendation: fd.recommendationKey || null } };
    } catch (e) { if (i === tickers.length - 1) return { error: 'Backend error: ' + e.message }; }
  }
  return { error: 'No details found for ' + (symbol || yahoo) + '.' };
}

/** Dividends per share paid by each company, from Yahoo Finance (NSE first, then BSE). symbols: [{symbol:'INFY', yahoo:''}] */
function dividends_(list) {
  var out = {}, errors = {};
  var items = list.slice(0, 80);
  function dUrl(t) { return { url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(t) + '?range=max&interval=1mo&events=div', muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }; }
  function pick(r) {
    try {
      if (r.getResponseCode() !== 200) return null;
      var res = JSON.parse(r.getContentText()).chart.result[0];
      var ev = (res.events && res.events.dividends) || {};
      return Object.keys(ev).map(function (k) { return { date: new Date(ev[k].date * 1000).toISOString().slice(0, 10), amount: ev[k].amount }; });
    } catch (e) { return null; }
  }
  var first = UrlFetchApp.fetchAll(items.map(function (s) { return dUrl(s.yahoo || s.symbol + '.NS'); }));
  var retry = [];
  first.forEach(function (r, i) { var d = pick(r); if (d) out[items[i].symbol] = d; else if (!items[i].yahoo) retry.push(i); else errors[items[i].symbol] = 'not found'; });
  if (retry.length) {
    var second = UrlFetchApp.fetchAll(retry.map(function (i) { return dUrl(items[i].symbol + '.BO'); }));
    second.forEach(function (r, k) { var i = retry[k], d = pick(r); if (d) out[items[i].symbol] = d; else errors[items[i].symbol] = 'not found on NSE or BSE'; });
  }
  return { ok: true, dividends: out, errors: errors };
}
