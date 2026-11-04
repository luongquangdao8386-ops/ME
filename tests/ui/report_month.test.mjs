// d4.22: báo cáo tháng Điện nước có các ngày; Từ ngày/Đến ngày ở danh sách mẫu được dùng (trước đây bị bỏ qua → "không ra dữ liệu");
// chọn tháng ‹ ›; mỗi loại một trang A4 (dải đầu gọn); biểu đồ SVG theo ngày (đường trung bình, ngày cao nhất); PDF gửi kèm ảnh biểu đồ;
// Excel có sheet Theo ngày; lịch tuần trang chủ không còn mục "Chỉ số" điện nước.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { openApp, SHOTS } from './harness.mjs';
import { OWNER_CODE, OWNER_PIN } from '../helpers.mjs';
import { monthSetup, dayVN } from './sim_month.mjs';

const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const lastOf = (iso) => { const d = new Date(iso.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const noOverflow = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;
  const w = window.innerWidth;
  return ![...document.querySelectorAll('.view *')].some((el) => {
    if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
});
async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

test('web: Từ ngày 01 → cuối tháng trước ở danh sách mẫu → báo cáo tháng trước có các ngày; mỗi loại một trang; chọn tháng ‹ ›; PDF gửi ảnh biểu đồ; Excel sheet Theo ngày; lịch tuần không có Chỉ số', async () => {
  const { env, month } = monthSetup({ logo: true });
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await login(page);
    // Lịch tuần trang chủ: đồng hồ đọc mỗi ngày nhưng không còn mục "Chỉ số" (người dùng yêu cầu)
    await page.waitForSelector('.home-week .day');
    assert.equal(await page.locator('.week .day-item.k-reading').count(), 0, 'không mục Chỉ số trong lịch tuần');
    assert.ok(!(await page.textContent('.home-week')).includes('Chỉ số'));
    await go(page, '#/alerts/month');
    await page.waitForSelector('.cal-grid, .cal-day, [data-day]', { timeout: 15000 });
    assert.equal(await page.locator('.ck-reading').count(), 0, 'lịch tháng cũng không có mốc đọc chỉ số');

    // Danh sách mẫu: đặt Từ ngày / Đến ngày = trọn tháng trước, chọn Điện nước → xem trước đúng tháng trước (không phải tháng này)
    await go(page, '#/reports');
    await page.waitForSelector('.rp-web');
    await page.fill('#f-rf-from', dmy(month));
    await page.press('#f-rf-from', 'Tab');
    await page.fill('#f-rf-to', dmy(lastOf(month)));
    await page.press('#f-rf-to', 'Tab');
    await page.waitForTimeout(300);
    await page.click('[data-view="RPT_UTILITIES"]');
    await page.waitForSelector('#rp-paper .paper-a4', { timeout: 15000 });
    assert.equal(await page.locator('#rp-paper .paper-a4').count(), 2, 'Điện và Nước mỗi loại một trang');
    const meta = await page.textContent('#rp-paper .paper-meta-l');
    assert.ok(meta.includes(`${dmy(month)} – ${dmy(lastOf(month))}`), meta);
    // Mở trang báo cáo: kỳ "1 tháng", ‹ Tháng M/Y ›
    await page.click('#rf-create');
    await page.waitForSelector('.view .paper-a4 .dd-tbl', { timeout: 15000 });
    const M = String(Number(month.slice(5, 7))), Y = month.slice(0, 4);
    assert.ok((await page.textContent('.rp-month-l')).includes(`Tháng ${M}/${Y}`));
    assert.equal(await page.locator('[data-pt="MONTH"].on').count(), 1);
    assert.equal(await page.locator('[data-mnav="1"]').isDisabled(), false, 'tháng trước: còn đi tới tháng này');
    // Trang Điện: dải đầu (logo | tiêu đề + Điện | thời gian lập), ô tóm tắt, biểu đồ SVG theo ngày, bảng theo ngày hai nửa
    const el = page.locator('.paper-a4[data-type="ELECTRICITY"]');
    assert.equal(await el.locator('.ph .paper-logo').count(), 1);
    assert.ok((await el.locator('.ph-sub').textContent()).includes('Điện'));
    const tiles = await el.locator('.pt-label').allTextContents();
    assert.deepEqual(tiles.slice(0, 4).map((x) => x.split(' · ')[0]), ['Tiêu thụ trong kỳ', 'Trung bình mỗi ngày', 'Ngày cao nhất', 'Ngày đủ số liệu']);
    const days = Number(lastOf(month).slice(8));
    assert.equal(await el.locator('.dd-tbl').count(), 2, 'bảng theo ngày chia hai nửa');
    assert.equal(await el.locator('.dd-tbl tbody tr').count(), days);
    assert.equal(await el.locator('.dd-tbl tr.peak').count(), 1, 'ngày cao nhất in đậm');
    assert.ok((await el.locator('.dd-tbl').first().textContent()).includes('—'), 'ngày 11, 12 thiếu số đo ghi —');
    // d4.25: kẻ khung từng ô, cột Ngày nền nhạt (dễ dò hàng, không lẫn sang ngày khác)
    const cellBox = await el.locator('.dd-tbl tbody tr:nth-child(3)').first().evaluate((tr) => {
      const [d, v] = [tr.cells[0], tr.cells[1]].map((c) => getComputedStyle(c));
      return { top: v.borderTopWidth, bottom: v.borderBottomWidth, left: v.borderLeftWidth, color: v.borderBottomColor, dayBg: d.backgroundColor };
    });
    assert.deepEqual(cellBox, { top: '1px', bottom: '1px', left: '1px', color: 'rgb(175, 188, 204)', dayBg: 'rgb(241, 245, 249)' });
    const svg =await el.locator('.vz-svg svg').evaluate((s) => ({ w: s.getBoundingClientRect().width, bars: s.querySelectorAll('path').length, avg: s.querySelectorAll('line[stroke-dasharray]').length }));
    assert.ok(svg.w > 500, 'biểu đồ vẽ theo bề rộng khung: ' + svg.w);
    assert.equal(svg.bars, days - 2, 'mỗi ngày đủ số một cột (thiếu 2 ngày)');
    assert.equal(svg.avg, 1, 'đường trung bình ngày');
    // Rê chuột trên biểu đồ → chú giải ngày
    const box = await el.locator('.vz-svg').boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForSelector('.paper-a4[data-type="ELECTRICITY"] .vz-tip:not([hidden])');
    assert.match(await el.locator('.vz-tip span').textContent(), /\d\d\/\d\d\/\d{4}/);
    await page.screenshot({ path: path.join(SHOTS, 'd422-web-report-month.png'), fullPage: true });

    // PDF: app gửi kèm ảnh PNG biểu đồ của từng loại; máy chủ chèn vào trang tương ứng
    const req = page.waitForRequest((r) => r.method() === 'POST' && (r.postData() || '').includes('"report.export"') && (r.postData() || '').includes('"PDF"'));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('.rp-run-head [data-x="pdf"]')]);
    const body = JSON.parse((await req).postData());
    assert.deepEqual(Object.keys(body.payload.charts).sort(), ['ELECTRICITY', 'WATER']);
    assert.ok(body.payload.charts.ELECTRICITY.startsWith('iVBORw0KGgo'), 'PNG');
    assert.ok(dl.suggestedFilename().endsWith('.pdf'));
    const doc = [...env.drive._docs.values()].pop();
    assert.equal(doc.body.children.filter((x) => x.kind === 'pagebreak').length, 1);
    assert.equal(doc.body.children.filter((x) => x.kind === 'p').flatMap((x) => x.images).length, 2, 'hai ảnh biểu đồ');

    // Excel: có sheet Theo ngày (mỗi dòng một ngày)
    const [xl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('.rp-run-head [data-x="xlsx"]')]);
    const file = path.join(SHOTS, 'd422-month.xlsx');
    await xl.saveAs(file);
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.resolve('vendor/xlsx-0.20.3.full.min.js'), 'utf8'), ctx);
    const wb = ctx.XLSX.read(fs.readFileSync(file), { type: 'buffer' });
    assert.ok(Array.from(wb.SheetNames).includes('Theo ngày · 按日'), JSON.stringify(wb.SheetNames));
    const aoa = ctx.XLSX.utils.sheet_to_json(wb.Sheets['Theo ngày · 按日'], { header: 1, defval: '' });
    assert.equal(aoa.length, days + 2, 'khóa + nhãn + mỗi ngày một dòng');
    assert.deepEqual(Array.from(aoa[0]).slice(0, 4), ['date', 'weekday', 'MSB1.open', 'MSB1.use']);

    // ‹ tháng trước nữa: không có số đo → không trang loại nào có số, báo cáo vẫn hiện
    await page.click('[data-mnav="-1"]');
    await page.waitForFunction((t) => (document.querySelector('.rp-month-l') || {}).textContent?.includes(t), `Tháng ${Number(month.slice(5, 7)) === 1 ? 12 : Number(month.slice(5, 7)) - 1}/`, { timeout: 15000 });
    // › về tháng hiện tại: các ngày sau hôm nay để trống
    await page.click('[data-mnav="1"]');
    await page.waitForSelector('.paper-a4 .dd-tbl', { timeout: 15000 });
    await page.click('[data-mnav="1"]');
    await page.waitForFunction((t) => (document.querySelector('.rp-month-l') || {}).textContent?.includes(t), `Tháng ${Number(dayVN().slice(5, 7))}/`, { timeout: 15000 });
    await page.waitForSelector('.paper-a4 .dd-tbl', { timeout: 15000 });
    assert.equal(await page.locator('[data-mnav="1"]').isDisabled(), true, 'không đi quá tháng hiện tại');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: báo cáo tháng không tràn ngang; biểu đồ vừa màn, chạm cột hiện chú giải; bảng theo ngày một cột', async () => {
  const { env, month } = monthSetup({ logo: true });
  const app = await openApp({ env, viewport: { width: 390, height: 844 }, mobile: true });
  const { page } = app;
  try {
    await login(page);
    await go(page, `#/reports/run/RPT_UTILITIES?period_type=MONTH&date=${month}`);
    await page.waitForSelector('.paper-a4 .vz-svg svg', { timeout: 20000 });
    await page.waitForTimeout(300);
    assert.ok(await noOverflow(page));
    const w = await page.locator('.paper-a4[data-type="WATER"] .vz-svg svg').evaluate((s) => s.getBoundingClientRect().width);
    assert.ok(w > 250 && w <= 390, 'biểu đồ vừa màn: ' + w);
    const grid = await page.locator('.paper-a4[data-type="WATER"] .dd-split').evaluate((d) => getComputedStyle(d).gridTemplateColumns.split(' ').length);
    assert.equal(grid, 1, 'iPhone: hai nửa xếp dọc');
    const box = await page.locator('.paper-a4[data-type="WATER"] .vz-svg').boundingBox();
    await page.locator('.paper-a4[data-type="WATER"] .vz-svg').scrollIntoViewIfNeeded();
    const b2 = await page.locator('.paper-a4[data-type="WATER"] .vz-svg').boundingBox();
    await page.touchscreen.tap(b2.x + b2.width * 0.6, b2.y + b2.height * 0.6);
    await page.waitForSelector('.paper-a4[data-type="WATER"] .vz-tip:not([hidden])');
    assert.ok(box.width > 0);
    await page.screenshot({ path: path.join(SHOTS, 'd422-iphone-report-month.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
