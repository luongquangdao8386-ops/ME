import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { SAMPLE_ROWS, SAMPLE_SHEET } from '../vendor/xlsx-sample.mjs';

for (const [name, viewport, mobile] of [['iphone', { width: 390, height: 844 }, true], ['web', { width: 1440, height: 900 }, false]]) {
  test(`SheetJS ${name}: nạp dưới CSP của app, ghi .xlsx rồi đọc lại từ File giữ đúng chữ Việt · 中文`, async () => {
    const app = await openApp({ viewport, mobile });
    try {
      const { page } = app;
      await page.waitForSelector('.login-card');
      const r = await page.evaluate(async ({ rows, sheet }) => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + e.blockedURI));
        await new Promise((ok, fail) => {
          const s = document.createElement('script');
          s.src = 'vendor/xlsx-0.20.3.full.min.js';
          s.onload = ok;
          s.onerror = () => fail(new Error('không nạp được thư viện'));
          document.head.appendChild(s);
        });
        const X = window.XLSX;
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), sheet);
        // Như người dùng chọn tệp: Blob → File → arrayBuffer → đọc
        const file = new File([X.write(wb, { type: 'array', bookType: 'xlsx', compression: true })], 'thiet-bi.xlsx');
        const back = X.read(await file.arrayBuffer(), { type: 'array' });
        return { version: X.version, sheet: back.SheetNames[0], rows: X.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1 }), violations };
      }, { rows: SAMPLE_ROWS, sheet: SAMPLE_SHEET });
      assert.equal(r.version, '0.20.3');
      assert.equal(r.sheet, SAMPLE_SHEET);
      assert.deepEqual(r.rows, SAMPLE_ROWS);
      assert.deepEqual(r.violations, []);
      assert.deepEqual(app.consoleErrors.filter((e) => !/favicon|ERR_FAILED/.test(e)), []);
    } finally {
      await app.close();
    }
  });
}
