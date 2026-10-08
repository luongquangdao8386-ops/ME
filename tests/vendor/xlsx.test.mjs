// SheetJS CE 0.20.3 (vendor/) — tệp gốc nguyên vẹn, đọc/ghi Excel giữ đúng chữ Việt · 中文
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { XLSX_FILE, SAMPLE_ROWS, SAMPLE_SHEET } from './xlsx-sample.mjs';

// SHA-256 của tệp phát hành cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js (ghi ở vendor/README.md)
const XLSX_SHA256 = 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41';

// Trình duyệt giải mã nhãn 'latin1' theo windows-1252 của WHATWG (0x80 → €, 0x91 → ‘…), Node 22 trả nguyên mã C1.
// Thư viện đổi ngược các ký tự này khi đọc tệp .xlsx; giả lập như trình duyệt để test bắt được lỗi ở bảng đổi ngược.
const CP1252_80_9F = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8DŽ\x8F\x90‘’“”•–—˜™š›œ\x9DžŸ';
class BrowserTextDecoder extends TextDecoder {
  decode(input, options) {
    const s = super.decode(input, options);
    return this.encoding === 'windows-1252' ? s.replace(/[\x80-\x9f]/g, (c) => CP1252_80_9F[c.charCodeAt(0) - 0x80]) : s;
  }
}

/** Nạp như CommonJS: thư viện tự gắn API vào `exports` */
function loadXLSX() {
  const exports = {};
  vm.runInThisContext('(function (exports, TextDecoder) {' + fs.readFileSync(XLSX_FILE, 'utf8') + '\n})', { filename: XLSX_FILE })(exports, BrowserTextDecoder);
  return exports;
}

test('SheetJS 0.20.3: đúng tệp phát hành gốc (SHA-256) và nạp được', () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(XLSX_FILE)).digest('hex'), XLSX_SHA256);
  const X = loadXLSX();
  assert.equal(X.version, '0.20.3');
  assert.equal(typeof X.read, 'function');
  assert.equal(typeof X.write, 'function');
});

test('ghi rồi đọc lại giữ nguyên chữ Việt, chữ Hán, ký tự đặc biệt và tên trang tính', () => {
  const X = loadXLSX();
  for (const opt of [{ bookType: 'xlsx' }, { bookType: 'xlsx', bookSST: true }, { bookType: 'xlsb' }, { bookType: 'biff8' }, { bookType: 'ods' }]) {
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(SAMPLE_ROWS), SAMPLE_SHEET);
    const back = X.read(X.write(wb, { type: 'array', compression: true, ...opt }), { type: 'array' });
    assert.equal(back.SheetNames[0], SAMPLE_SHEET, JSON.stringify(opt));
    assert.deepEqual(X.utils.sheet_to_json(back.Sheets[SAMPLE_SHEET], { header: 1 }), SAMPLE_ROWS, JSON.stringify(opt));
  }
});

test('định dạng số: ký hiệu € và giờ kiểu Trung 上午/下午', () => {
  const X = loadXLSX();
  assert.equal(X.SSF.format('#,##0.00 €', 1234.5), '1,234.50 €');
  assert.equal(X.SSF.format('上午/下午hh:mm', 0.75), '下午06:00');
  assert.equal(X.SSF.get_table()[56], '"上午/下午 "hh"時"mm"分"ss"秒 "');
});

test('CSV từ Excel tiếng Việt (Windows-1258): tự giải mã, chuẩn hóa NFC rồi đọc dạng chuỗi', () => {
  const X = loadXLSX();
  // "Mã,Tên\nTB-0001,Máy bơm số 1\n" như Excel lưu: ã = a + dấu ngã rời (DE), ố = ô (F4) + dấu sắc rời (EC).
  // Không dựa vào tùy chọn codepage: với type 'array' thư viện bỏ qua nó và đọc thành Latin-1.
  const bytes = new Uint8Array([0x4D, 0x61, 0xDE, 0x2C, 0x54, 0xEA, 0x6E, 0x0A, 0x54, 0x42, 0x2D, 0x30, 0x30, 0x30, 0x31, 0x2C,
    0x4D, 0xE1, 0x79, 0x20, 0x62, 0xF5, 0x6D, 0x20, 0x73, 0xF4, 0xEC, 0x20, 0x31, 0x0A]);
  const text = new TextDecoder('windows-1258').decode(bytes).normalize('NFC');
  const wb = X.read(text, { type: 'string' });
  assert.deepEqual(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }), [['Mã', 'Tên'], ['TB-0001', 'Máy bơm số 1']]);
});
