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
      case 'quotes': return json_(quotes_(req.symbols || []));
      case 'dividends': return json_(dividends_(req.symbols || []));
      case 'history': return json_(history_(req.symbol, req.yahoo));
      default: return json_({ error: 'Unknown action.' });
    }
  } catch (err) {
    return json_({ error: 'Backend error: ' + err.message });
  }
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
