// Minimal .xlsx / .csv reader for the broker files. No library: an .xlsx is a zip of XML files.
// readTable(file) -> array of rows, each row an array of cell values (strings or numbers), from the first sheet.

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This does not look like an Excel file.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    files[name] = { method, csize, off };
    p += 46 + nlen + elen + clen;
  }
  const read = async (name) => {
    const f = files[name]; if (!f) return null;
    const lh = f.off, nl = v.getUint16(lh + 26, true), el = v.getUint16(lh + 28, true);
    const data = u8.subarray(lh + 30 + nl + el, lh + 30 + nl + el + f.csize);
    const raw = f.method === 0 ? data : await inflate(data);
    return dec.decode(raw);
  };
  return { files, read };
}
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

async function readXlsx(buf) {
  const zip = await unzip(buf);
  const parse = (txt) => new DOMParser().parseFromString(txt, 'application/xml');
  const shared = [];
  const ss = await zip.read('xl/sharedStrings.xml');
  if (ss) for (const si of parse(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (!zip.files[sheetPath]) sheetPath = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetPath) throw new Error('No sheet found in this file.');
  const doc = parse(await zip.read(sheetPath));
  const rows = [];
  for (const r of doc.getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0];
      let val = null;
      if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else if (vEl) { const raw = vEl.textContent; val = t === 's' ? shared[Number(raw)] : t === 'str' || t === 'e' ? raw : t === 'b' ? raw === '1' : Number(raw); }
      row[colIndex(c.getAttribute('r') || 'A1')] = val;
    }
    rows[Number(r.getAttribute('r')) - 1] = row;
  }
  return Array.from(rows, (r) => (r ? Array.from(r, (x) => (x === undefined ? null : x)) : []));
}

function readCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((x) => (x === '' ? null : x)));
}

export async function readTable(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x50 && head[1] === 0x4b) return readXlsx(buf);
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files are not supported. Open it in Excel and save as .xlsx, or download the .xlsx from Groww.');
  return readCsv(new TextDecoder().decode(buf));
}
