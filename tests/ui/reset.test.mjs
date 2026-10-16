// Đợt 4 trên giao diện: SYS-RESET-01 Dữ liệu hệ thống, SYS-RESET-02 Xem trước và xác nhận, SYS-RESET-03 Tiến độ (trang riêng)
// — iPhone 390×844 và web 1440×900; chỉ owner thấy mục; sau Xóa sạch đăng nhập lại thì dữ liệu trống; đăng nhập khi đang bảo trì → tiến độ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, makeClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
}

function seeded() {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  userClient(env, 'U-C4', 4, '694129');
  return env;
}

for (const [name, dev] of [['iPhone', IPHONE], ['web', WEB]]) {
  test(`${name} owner: Tài khoản → Dữ liệu hệ thống → Xem trước (PIN + XÓA TOÀN BỘ) → Tiến độ → Hoàn tất → Đăng nhập lại, dữ liệu trống`, async () => {
    const env = seeded();
    const n0 = env.rows('Equipment').length;
    assert.ok(n0 > 0);
    const app = await openApp({ env, ...dev });
    const { page } = app;
    try {
      await login(page);
      await page.waitForSelector('.grid9', { timeout: 15000 });
      await go(page, '#/account');
      await page.waitForSelector('a[href="#/admin/system-data"]');
      await page.click('a[href="#/admin/system-data"]');
      await page.waitForSelector('#rs-start');
      const t1 = await page.textContent('.view');
      assert.ok(t1.includes('Thế hệ dữ liệu hiện tại') && t1.includes('Tem QR') && t1.includes('Lần sao lưu gần nhất'), t1.slice(0, 300));
      assert.equal(await page.locator('.view img[src*="logo"]').count(), 0, 'không logo');
      assert.ok(await noOverflow(page));
      await page.screenshot({ path: path.join(SHOTS, `d4-reset01-${name}.png`), fullPage: true });
      await page.click('#rs-start');
      await page.waitForSelector('#rs-go');
      const t2 = await page.textContent('.view');
      assert.ok(t2.includes('Tất cả tem QR hiện có sẽ hết hiệu lực') && t2.includes('Được giữ') && t2.includes('Giữ file, bỏ khỏi app'));
      assert.equal(await page.isDisabled('input[name="file_mode"][value="DELETE"]'), true, 'xóa vĩnh viễn chưa bật Drive API');
      assert.equal(await page.isDisabled('#rs-go'), true);
      await page.fill('#rs-pin', OWNER_PIN);
      await page.fill('#rs-text', 'XOA TOAN BO');
      assert.equal(await page.isDisabled('#rs-go'), true, 'gõ thiếu dấu không được');
      await page.fill('#rs-text', 'XÓA TOÀN BỘ');
      assert.equal(await page.isDisabled('#rs-go'), false);
      assert.ok(await noOverflow(page));
      await page.screenshot({ path: path.join(SHOTS, `d4-reset02-${name}.png`), fullPage: true });
      await page.click('#rs-go');
      await page.waitForSelector('.rs-progress', { timeout: 15000 });
      await page.waitForSelector('.rs-done', { timeout: 30000 });
      const t3 = await page.textContent('.rs-progress');
      assert.ok(t3.includes('Hoàn tất') && t3.includes('In tem QR mới') && t3.includes('Mọi người phải đăng nhập lại'), t3.slice(0, 400));
      assert.equal(await page.locator('.rs-steps li.done').count(), 5);
      assert.ok(await noOverflow(page));
      await page.screenshot({ path: path.join(SHOTS, `d4-reset03-${name}.png`), fullPage: true });
      assert.equal(env.rows('Equipment').length, 0);
      assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'false');
      await page.click('#rs-relogin');
      await page.waitForSelector('#login-btn');
      await login(page);
      await page.waitForSelector('.grid9', { timeout: 15000 });
      const recs = await page.evaluate(async () => (await (await import('./js/sync.js')).getRecords('EQUIPMENT')).length);
      assert.equal(recs, 0, 'máy không còn dữ liệu cũ');
      assert.deepEqual(app.consoleErrors, []);
    } finally { await app.close(); }
  });
}

test('web: cấp 4 không phải owner không thấy mục Dữ liệu hệ thống; mở thẳng địa chỉ thì báo không có quyền', async () => {
  const env = seeded();
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page, 'U-C4', '694129');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    await go(page, '#/account');
    await page.waitForSelector('a[href="#/admin/users"]');
    assert.equal(await page.locator('a[href="#/admin/system-data"]').count(), 0);
    await go(page, '#/admin/system-data');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Không có quyền'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: đang Xóa sạch dở (lỗi sao lưu) — mở lại app: owner đăng nhập → trang tiến độ, nhập PIN → Hủy đợt; người khác thấy "Hệ thống đang bảo trì"', async () => {
  const env = seeded();
  const c = makeClient(env);
  c.login(OWNER_CODE, OWNER_PIN);
  const pv = c.call('system.reset.preview').data;
  const rq = c.write('system.reset.request', { reset_run_id: pv.reset_run_id, nonce: pv.nonce, plan_hash: pv.plan_hash, pin: OWNER_PIN, confirm_text: 'XÓA TOÀN BỘ', file_mode: 'KEEP' });
  assert.equal(rq.ok, true);
  const bk = env.props.getProperty('DRIVE_BACKUP_FOLDER_ID');
  env.props.deleteProperty('DRIVE_BACKUP_FOLDER_ID');
  const rec = makeClient(env);
  rec.token = rq.data.recovery.token;
  rec.call('system.reset.status', { reset_run_id: pv.reset_run_id });
  env.props.setProperty('DRIVE_BACKUP_FOLDER_ID', bk);
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page, 'U-C4', '694129');
    await page.waitForFunction(() => (document.querySelector('#login-err') || {}).textContent?.includes('bảo trì'), null, { timeout: 15000 });
    await login(page);
    await page.waitForSelector('.rs-failed', { timeout: 15000 });
    const t = await page.textContent('.rs-progress');
    assert.ok(t.includes('BACKUP_FAILED') && t.includes('Hướng dẫn khôi phục thủ công'), t.slice(0, 400));
    await page.screenshot({ path: path.join(SHOTS, 'd4-reset03-failed-iphone.png'), fullPage: true });
    await page.fill('#rs-pin', OWNER_PIN);
    await page.click('#rs-cancel');
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.rs-progress').textContent.includes('Đã hủy'), null, { timeout: 15000 });
    assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'false');
    assert.ok(env.rows('Equipment').length > 0, 'chưa xóa gì');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
