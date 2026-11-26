// Tệp Excel thật qua trình duyệt: với mọi mẫu, app xuất .xlsx (SheetJS) → nạp lại đúng tệp đó vào ô Nhập → bảng xem trước phải toàn
// "Không đổi" (Thêm 0, Cập nhật 0, Lỗi 0). Bắt lỗi chuyển kiểu ô (ngày, số, mã có số 0 đầu, chữ Trung, dấu tách rời). Cách chạy: README.md
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from '../../tests/ui/harness.mjs';
import { OWNER_CODE, OWNER_PIN } from '../../tests/helpers.mjs';
import { seedExcel } from './excel-roundtrip.mjs';

const OUT = process.argv[2] || '/tmp/excel-ui';
fs.mkdirSync(OUT, { recursive: true });
const { env } = seedExcel();
const keys = Object.keys(env.g.IMPORT_TEMPLATES_).filter((k) => !['inspections', 'repairs_history'].includes(k));
const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
const { page } = app;
let bad = 0;
try {
  await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 20000 });
  for (const key of keys) {
    await page.evaluate((h) => { location.hash = '#/__x'; location.hash = h; }, '#/excel/' + key);
    try { await page.waitForSelector('#x-export', { timeout: 15000 }); } catch (e) { console.log(key.padEnd(24), 'KHÔNG CÓ NÚT XUẤT'); bad++; continue; }
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#x-export')]);
    const file = path.join(OUT, key + '.xlsx');
    await dl.saveAs(file);
    await page.setInputFiles('#x-file', { name: key + '.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(file) });
    // chờ bảng xem trước (có ô Thêm / Cập nhật / Lỗi)
    try {
      await page.waitForFunction(() => /Lỗi · 错误/.test(document.querySelector('.view-page:last-child').textContent) && /Cập nhật/.test(document.querySelector('.view-page:last-child').textContent), null, { timeout: 30000 });
    } catch (e) { console.log(key.padEnd(24), 'KHÔNG THẤY BẢNG XEM TRƯỚC', (await page.textContent('.view-page:last-child')).replace(/\s+/g, ' ').slice(0, 300)); bad++; continue; }
    await page.waitForTimeout(300);
    const kv = await page.evaluate(() => [...document.querySelectorAll('.view-page:last-child .kv-grid .kv')].map((k) => [k.querySelector('span').textContent.split(' · ')[0].trim(), k.querySelector('strong').textContent.trim()]));
    const m = Object.fromEntries(kv);
    const num = (k) => Number(String(Object.entries(m).find(([x]) => x.startsWith(k))?.[1] || '0').replace(/\D/g, '') || 0);
    const okk = num('Thêm') === 0 && num('Cập nhật') === 0 && num('Lỗi') === 0;
    if (!okk) bad++;
    const detail = okk ? '' : (await page.textContent('.view-page:last-child')).replace(/\s+/g, ' ').slice(0, 900);
    console.log(key.padEnd(24), okk ? 'ĐẠT ' : 'LỖI ', JSON.stringify(m), detail);
    // hủy lô
    const cancel = await page.$('#x-cancel');
    if (cancel) { await cancel.click(); await page.waitForTimeout(300); const mb = await page.$('.modal .btn.primary, .modal .btn.danger'); if (mb) { await mb.click(); await page.waitForTimeout(500); } }
  }
  console.log('mẫu', keys.length, 'lỗi', bad, '| lỗi console', JSON.stringify(app.consoleErrors).slice(0, 500));
} finally {
  await app.close();
}
