// d4.39: Sửa nhiều chỉ số trên trang đồng hồ (reading.bulk) — đúng các bước gửi người dùng: Điện nước → đồng hồ → Sửa nhiều chỉ số →
// Chọn hết → Dời ngày… (+1 ngày, giờ 08:00, xem trước) → lý do → PIN → 8 số đã dời. Ca bị chặn (chỉ dời một số, trùng ngày) hiện lỗi theo
// từng chỉ số, không đổi gì. Máy tính: Quản trị hủy 2 số thử. Đọc điện nước không có nút. iPhone 390×844, web 1440×900.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, uuid, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;
  const w = window.innerWidth;
  return ![...document.querySelectorAll('.view *')].some((el) => {
    if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
});
async function login(page, code, pin) {
  await page.waitForSelector('#emp', { timeout: 15000 });
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 20000 });
}
async function answerPin(page, pin) {
  await page.waitForSelector('.modal .pin-input');
  await page.fill('.modal .pin-input', pin);
  await page.locator('.modal:has(.pin-input) .btn.primary').click();
}

// Số chép từ sổ giấy theo ngày chốt (ảnh người dùng 26/11/2026), nhập lúc ~10:0x
const PAPER = [['18', 2286680], ['19', 2292415], ['20', 2297767], ['21', 2302195], ['22', 2303195], ['23', 2309397], ['24', 2310397], ['25', 2315653]];
const dayVN = (n = 0) => new Date(Date.now() + 7 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Đồng hồ điện đọc hằng ngày; 8 số trong 8 ngày liền kết thúc 2 ngày trước (theo đồng hồ thật của máy chạy test) */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  userClient(env, 'U-C3', 3, '694127');
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const meter = uuid();
  ok(c.write('meter.edit', { meter_id: meter, name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  const last = dayVN(2);
  const days = PAPER.map((_, i) => shift(last, i - 7));
  const ids = PAPER.map(([, v], i) => {
    const id = uuid();
    ok(dn.write('reading.create', { reading_id: id, meter_id: meter, measured_at: `${days[i]}T10:${String(5 + i).padStart(2, '0')}:00+07:00`, cumulative_value: v }));
    return id;
  });
  return { env, meter, ids, days };
}
const rows = (env, meter) => env.rows('MeterReadings').filter((r) => r.meter_id === meter).sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)));
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

test('iPhone Trưởng bộ phận: Sửa nhiều chỉ số → chỉ dời một số (trùng ngày) bị chặn, báo theo chỉ số → Chọn hết → Dời +1 ngày 08:00 (xem trước) → PIN → 8 số đã dời', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...IPHONE });
  const { page } = app;
  try {
    await login(page, 'U-C3', '694127');
    await go(page, `#/utilities/meters/${s.meter}`);
    await page.waitForSelector('#rd-bulk');
    await page.click('#rd-bulk');
    await page.waitForSelector('[data-rd-pick]');
    assert.equal(await page.locator('[data-rd-pick]').count(), 8);
    assert.equal(await page.locator('[data-rd-edit]').count(), 0, 'đang chọn: ẩn nút từng dòng');
    assert.equal(await page.isDisabled('#rd-shift'), true);
    // Chỉ tick số thứ 3 (ngày days[2]) rồi dời +1 → trùng ngày với số kế tiếp → bị chặn, không đổi gì
    await page.check(`[data-rd-pick="${s.ids[2]}"]`);
    assert.equal(await page.textContent('#rd-n'), '1');
    await page.click('#rd-shift');
    await page.waitForSelector('.modal #bk-days');
    await page.fill('.modal #bk-r', 'thử');
    await page.locator('.modal .modal-actions .btn.primary').click();
    await answerPin(page, '694127');
    await page.waitForSelector('.modal .rd-errs');
    const err = await page.textContent('.modal .rd-errs');
    assert.match(err.replace(/\s/g, ''), /2297767/);
    assert.match(err, /trùng ngày với một chỉ số khác/);
    await page.locator('.modal .modal-actions .btn.primary').click();
    assert.deepEqual(rows(s.env, s.meter).map((r) => r.record_version), [1, 1, 1, 1, 1, 1, 1, 1], 'không đổi gì');
    // Chọn hết → Dời ngày… : xem trước đổi theo giờ đọc
    await page.click('#rd-all');
    assert.equal(await page.textContent('#rd-n'), '8');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd439-bulk-pick-iphone.png'), fullPage: true });
    await page.click('#rd-shift');
    await page.waitForSelector('.modal #bk-prev');
    assert.equal(await page.inputValue('.modal #bk-days'), '1');
    assert.match(await page.textContent('.modal #bk-prev'), new RegExp(`${dmy(s.days[1])} 10:05`), 'mặc định giữ giờ cũ');
    await page.fill('.modal #bk-time', '08:00');
    await page.waitForFunction((t) => document.querySelector('.modal #bk-prev').textContent.includes(t), `${dmy(s.days[1])} 08:00`);
    await page.screenshot({ path: path.join(SHOTS, 'd439-bulk-dialog-iphone.png') });
    await page.fill('.modal #bk-r', 'Chép sổ giấy lệch ngày');
    await page.locator('.modal .modal-actions .btn.primary').click();
    // PIN còn hạn 5 phút từ lần trên: không hỏi lại
    await page.waitForSelector('#rd-bulk', { timeout: 15000 });
    const after = rows(s.env, s.meter);
    assert.deepEqual(after.map((r) => r.measured_at), s.days.map((d) => `${shift(d, 1)}T08:00:00+07:00`));
    assert.ok(after.every((r) => r.status === 'VALID' && r.edit_reason === 'Chép sổ giấy lệch ngày'));
    // Danh sách trên trang hiện giờ mới
    await page.waitForFunction(() => /08:00/.test(document.querySelector('.ut-reads').textContent));
    assert.equal(await page.locator('[data-rd-pick]').count(), 0, 'xong thì thoát chế độ chọn');
    assert.deepEqual(app.consoleErrors, []);
  } finally {
    await app.close();
  }
});

test('web Quản trị: hủy 2 số thử một lượt (nút Quay lại / Hủy chỉ số); Đọc điện nước không có nút Sửa nhiều chỉ số', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...WEB });
  const { page } = app;
  let app2 = null;
  try {
    await login(page, OWNER_CODE, OWNER_PIN);
    await go(page, `#/utilities/meters/${s.meter}`);
    await page.waitForSelector('#rd-bulk');
    await page.click('#rd-bulk');
    await page.waitForSelector('[data-rd-pick]');
    await page.check(`[data-rd-pick="${s.ids[6]}"]`);
    await page.check(`[data-rd-pick="${s.ids[7]}"]`);
    await page.click('#rd-void');
    await page.waitForSelector('.modal #bk-r');
    const btns = await page.locator('.modal .modal-actions .btn').allTextContents();
    assert.match(btns[0], /Quay lại/);
    assert.match(btns[1], /Hủy chỉ số/);
    await page.fill('.modal #bk-r', 'Số thử');
    await page.locator('.modal .modal-actions .btn.danger').click();
    await answerPin(page, OWNER_PIN);
    await page.waitForSelector('#rd-bulk', { timeout: 15000 });
    const r = rows(s.env, s.meter);
    assert.deepEqual(r.map((x) => x.status), ['VALID', 'VALID', 'VALID', 'VALID', 'VALID', 'VALID', 'VOID', 'VOID']);
    await page.waitForFunction(() => document.querySelectorAll('.ut-reads li.void').length === 2);
    await page.screenshot({ path: path.join(SHOTS, 'd439-bulk-void-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
    // Đọc điện nước: không có nút
    app2 = await openApp({ env: s.env, ...IPHONE });
    await login(app2.page, 'U-DN', '583016');
    await go(app2.page, `#/utilities/meters/${s.meter}`);
    await app2.page.waitForSelector('.ut-reads');
    assert.equal(await app2.page.locator('#rd-bulk').count(), 0);
  } finally {
    await app.close();
    if (app2) await app2.close();
  }
});
