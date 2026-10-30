// d4.21: Quản trị → Mã biểu mẫu trên PDF (C4, PIN): mỗi loại PDF một mã ISO; bản xem trước báo cáo in mã; mẫu mới
// "Nhật ký dịch vụ nhà thầu" có trong danh sách báo cáo; Trạng thái hệ thống dẫn sang trang này; C3 không có mục; 1440×900 và 390×844
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
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
async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  ok(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy nén khí 01', model: 'GA-37' }));
  userClient(env, 'U-C3', 3, '694127');
  return { env, c };
}

test('web C4: nhập mã biểu mẫu cho phiếu bảo trì, kế hoạch năm, báo cáo thiết bị → PIN → lưu; xem trước báo cáo in mã; mẫu Nhật ký dịch vụ nhà thầu trong danh sách', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/account');
    await page.waitForSelector('a[href="#/admin/form-codes"]');
    // Trạng thái hệ thống: dòng mã biểu mẫu dẫn sang trang riêng
    await go(page, '#/admin/status');
    await page.waitForSelector('.tbl.settings a[href="#/admin/form-codes"]', { timeout: 15000 });
    await go(page, '#/admin/form-codes');
    await page.waitForSelector('[data-fc="WORK_ORDER"]');
    assert.equal(await page.locator('#fc-old').count(), 0, 'máy chủ mới: không báo cần cập nhật');
    for (const k of ['__annual', 'ANNUAL_MONTH', 'WORK_ORDER', 'REPAIR', 'EQUIPMENT', 'RPT_EQUIPMENT', 'RPT_CONTRACT_SERVICES']) {
      assert.equal(await page.locator(`[data-fc="${k}"]`).count(), 1, k);
    }
    assert.ok((await page.textContent('.fc-table')).includes('Nhật ký dịch vụ nhà thầu'));
    await page.fill('[data-fc="WORK_ORDER"]', 'BM-CĐ-03-03');
    await page.fill('[data-fc="__annual"]', 'BM-CĐ-03-01');
    await page.fill('[data-fc="RPT_EQUIPMENT"]', '  BM-CĐ-02-01 ');
    await page.fill('#fc-reason', 'Theo bộ biểu ISO');
    await page.click('#fc-save');
    await page.waitForSelector('.modal .pin-input');
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-fc="RPT_EQUIPMENT"]')?.value === 'BM-CĐ-02-01', null, { timeout: 15000 });
    const val = (k) => env.rows('Settings').find((s) => s.setting_key === k).value;
    assert.deepEqual(JSON.parse(val('pdf_form_codes')), { WORK_ORDER: 'BM-CĐ-03-03', RPT_EQUIPMENT: 'BM-CĐ-02-01' });
    assert.equal(val('annual_plan_form_code'), 'BM-CĐ-03-01');
    assert.ok(env.rows('AuditLogs').some((a) => a.action === 'settings.edit' && a.reason === 'Theo bộ biểu ISO'));
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd421-web-form-codes.png'), fullPage: true });
    // Xem trước báo cáo: mã biểu mẫu ở khối thông tin bên phải (app đã nhận cài đặt mới, không cần tải lại)
    await go(page, '#/reports');
    await page.waitForSelector('.rp-web');
    assert.equal(await page.locator('[data-view="RPT_CONTRACT_SERVICES"]').count(), 1, 'mẫu báo cáo mới');
    await page.click('[data-view="RPT_EQUIPMENT"]');
    await page.waitForSelector('#rp-paper .paper', { timeout: 15000 });
    assert.ok((await page.textContent('#rp-paper .paper-meta-r')).includes('BM-CĐ-02-01'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone C4: trang mã biểu mẫu không tràn ngang; C3 không có mục', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...IPHONE });
  try {
    await login(app.page);
    await go(app.page, '#/admin/form-codes');
    await app.page.waitForSelector('[data-fc="REPAIR"]');
    assert.ok(await noOverflow(app.page));
    await app.page.screenshot({ path: path.join(SHOTS, 'd421-iphone-form-codes.png'), fullPage: true });
  } finally { await app.close(); }
  const app2 = await openApp({ env, ...IPHONE });
  try {
    await login(app2.page, 'U-C3', '694127');
    await go(app2.page, '#/account');
    await app2.page.waitForSelector('#ac-logout');
    assert.equal(await app2.page.locator('a[href="#/admin/form-codes"]').count(), 0);
  } finally { await app2.close(); }
});
