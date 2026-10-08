// Excel trên trình duyệt (phụ lục 1.5 mục 3.15 Nhập Excel, 5.4.6): SheetJS CE 0.20.3 nạp theo nhu cầu (không cache vỏ app)
let loading = null;

/** Nạp vendor/xlsx-0.20.3.full.min.js một lần (CSP script-src 'self') */
export function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!loading) {
    loading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx-0.20.3.full.min.js';
      s.onload = () => ok(window.XLSX);
      s.onerror = () => { loading = null; fail(new Error('xlsx')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** SHA-256 hex của nội dung tệp (source_sha256) */
export async function sha256Hex(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
/** 'YYYY-MM-DD' → số ngày Excel (ô ngày thật, giờ Việt Nam) */
function isoToSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - EXCEL_EPOCH) / 86400000 : null;
}
/** Date của ô ngày (SheetJS cellDates, giờ máy) → 'YYYY-MM-DD' */
function dateToIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Một ô theo kiểu (5.4.6): số #,##0 / #,##0.0##, ngày dd/mm/yyyy, mã @ giữ số 0, chữ luôn là chuỗi (không thành công thức) */
export function cell(type, v) {
  if (v === null || v === undefined || v === '') return type === 'code' ? { t: 's', v: '', z: '@' } : null;
  if (type === 'num' && typeof v === 'number' && isFinite(v)) return { t: 'n', v, z: Number.isInteger(v) ? '#,##0' : '#,##0.0##' };
  if (type === 'date') { const n = isoToSerial(v); if (n !== null) return { t: 'n', v: n, z: 'dd\\/mm\\/yyyy' }; }
  if (type === 'bool') return { t: 'b', v: v === true };
  return { t: 's', v: String(v), z: type === 'code' ? '@' : undefined };
}

/** Sheet từ dòng khóa, dòng nhãn, dữ liệu */
export function buildSheet(X, keys, labels, types, rows, { textRows = 0 } = {}) {
  const ws = {};
  const put = (r, c, o) => { if (o) { if (o.z === undefined) delete o.z; ws[X.utils.encode_cell({ r, c })] = o; } };
  keys.forEach((k, c) => {
    put(0, c, { t: 's', v: k });
    put(1, c, { t: 's', v: labels[c] ? `${labels[c][0]} · ${labels[c][1]}` : '' });
  });
  rows.forEach((row, i) => row.forEach((v, c) => put(i + 2, c, cell(types[c], v))));
  // Mẫu trống: ô mã/chữ định dạng @ sẵn để Excel không bỏ số 0 đầu
  for (let r = rows.length + 2; r < textRows + 2; r++) types.forEach((t, c) => { if (t === 'code') put(r, c, { t: 's', v: '', z: '@' }); });
  const lastRow = Math.max(1, rows.length + 1, textRows + 1);
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: Math.max(0, keys.length - 1) } });
  ws['!cols'] = keys.map((k, c) => ({ wch: Math.min(40, Math.max(12, String(labels[c] ? labels[c][0] : k).length + 4)) }));
  return ws;
}

/** Sheet dạng bảng đơn giản (hướng dẫn, danh mục, điều kiện lọc) */
export function aoaSheet(X, aoa) {
  return X.utils.aoa_to_sheet(aoa.map((r) => r.map((v) => (v === null || v === undefined ? '' : v))));
}

/** Ghi workbook thành File .xlsx */
export function workbookFile(X, wb, name) {
  const bytes = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Giải mã CSV: UTF-8 (fatal) rồi Windows-1258; chuẩn hóa NFC (Excel tiếng Việt lưu dấu rời) */
function decodeCsv(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1258').decode(buf); }
  return text.replace(/^﻿/, '').normalize('NFC');
}

/**
 * Đọc tệp nhập theo mẫu: {sha, meta, rows: [{sheet, row_number, values, formulas}], missing: [sheet]}
 * Chỉ lấy giá trị; ô có công thức ghi vào formulas để máy chủ báo lỗi theo dòng.
 */
export async function readImportFile(file, sheetNames) {
  const X = await loadXlsx();
  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const csv = /\.csv$/i.test(file.name);
  const wb = csv ? X.read(decodeCsv(buf), { type: 'string', raw: true }) : X.read(buf, { type: 'array', cellDates: true, cellFormula: true, cellNF: false });
  const meta = {};
  const ms = wb.Sheets._meta;
  if (ms) X.utils.sheet_to_json(ms, { header: 1 }).forEach((r) => { if (r[0]) meta[String(r[0])] = String(r[1] ?? ''); });
  const rows = [];
  const missing = [];
  sheetNames.forEach((name, si) => {
    const ws = wb.Sheets[name] || (csv && si === 0 ? wb.Sheets[wb.SheetNames[0]] : null);
    if (!ws || !ws['!ref']) { missing.push(name); return; }
    const range = X.utils.decode_range(ws['!ref']);
    const keys = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const h = ws[X.utils.encode_cell({ r: 0, c })];
      keys[c] = h && h.v !== undefined ? String(h.v).trim() : '';
    }
    for (let r = 2; r <= range.e.r; r++) {
      const values = {};
      const formulas = [];
      let any = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const k = keys[c];
        if (!k || k === 'i18n_machine_fields') continue;
        const x = ws[X.utils.encode_cell({ r, c })];
        let v = '';
        if (x) {
          if (x.f) formulas.push(k);
          if (x.t === 'd' && x.v instanceof Date) v = dateToIso(x.v);
          else if (x.t === 'n' || x.t === 'b') v = x.v;
          else if (x.t === 's' || x.t === 'str') v = String(x.v).normalize('NFC');
          else if (x.v !== undefined) v = String(x.v);
        }
        if (v !== '' || x && x.f) any = true;
        values[k] = v;
      }
      if (any) rows.push({ sheet: name, row_number: r + 1, values, formulas });
    }
  });
  return { sha, meta, rows, missing };
}

