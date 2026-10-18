import fs from 'node:fs';
// store.js needs a browser; test the pure rules by loading the module with a tiny stub
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }); globalThis.window = { addEventListener() {}, dispatchEvent() {} }; globalThis.location = { hash: '' };
const { sanity, shrinkReport, S, setData } = await import('../js/store.js');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
ok(sanity(d).length === 0, 'real data passes sanity: ' + sanity(d));
ok(sanity({}).length > 0 && sanity(null).length > 0, 'junk fails');
const broken = JSON.parse(JSON.stringify(d)); broken.ledger = null; ok(sanity(broken).length > 0, 'null ledger fails');
const dup = JSON.parse(JSON.stringify(d)); dup.ledger.push({ ...dup.ledger[0] }); ok(sanity(dup).some((x) => /share an id/.test(x)), 'duplicate ids flagged');
setData(JSON.parse(JSON.stringify(d)), { dirty: false }); // saves a base copy
const small = JSON.parse(JSON.stringify(d)); small.ledger = small.ledger.slice(0, 50);
ok(shrinkReport(small).some((x) => x.what === 'ledger'), 'big deletion flagged');
const tiny = JSON.parse(JSON.stringify(d)); tiny.ledger.pop(); ok(shrinkReport(tiny).length === 0, 'one deletion is fine');
console.log('safety ok');
