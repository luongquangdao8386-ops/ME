import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, OWNER_CODE, OWNER_TEMP_PIN, OWNER_PIN, APP_VERSION } from '../helpers.mjs';

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function loginOwnerFirstTime(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_TEMP_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('#new1');
  await page.fill('#new1', OWNER_PIN);
  await page.fill('#new2', OWNER_PIN);
  await page.click('#cp-btn');
  await page.waitForSelector('[data-poc="P-01"]', { timeout: 15000 });
}

for (const [name, viewport, mobile] of [['iphone', { width: 390, height: 844 }, true], ['web', { width: 1440, height: 900 }, false]]) {
  test(`đăng nhập ${name}: song ngữ, logo 57 chỉ ở màn đăng nhập, không tràn ngang`, async () => {
    const app = await openApp({ viewport, mobile });
    try {
      const { page } = app;
      await page.waitForSelector('.login-card');
      const text = await page.textContent('.login-card');
      for (const s of ['Đăng nhập', '登录', 'Mã nhân viên', '员工编号', 'PIN 6 số', '六位数字密码', 'Quên PIN', '忘记PIN', 'Máy dùng chung', '公用设备']) assert.ok(text.includes(s), s);
      assert.equal(await page.locator('img.brand-logo').count(), 1);
      assert.equal(await page.textContent('.brand-name'), 'M&E');
      assert.equal(await page.textContent('.brand-sub'), '机电管理');
      assert.ok(await noHorizontalOverflow(page));
      await page.screenshot({ path: path.join(SHOTS, `login-${name}.png`) });
      // Đăng nhập lần đầu bằng PIN tạm → đổi PIN → bàn thử PoC
      await page.click('#forgot');
      assert.ok((await page.textContent('#forgot-help')).includes('请联系管理员重置密码'));
      await page.fill('#emp', OWNER_CODE);
      await page.fill('#pin', '111333');
      await page.click('#login-btn');
      await page.waitForFunction(() => document.querySelector('#login-err').textContent.length > 0);
      assert.equal(await page.textContent('#login-err'), 'Mã nhân viên hoặc PIN không đúng · 工号或PIN错误');
      await page.fill('#pin', OWNER_TEMP_PIN);
      await page.click('#login-btn');
      await page.waitForSelector('#new1');
      assert.ok((await page.textContent('.page')).includes('Bạn đang dùng PIN tạm'));
      assert.equal(await page.locator('img.brand-logo').count(), 0, 'màn đổi PIN không có logo');
      await page.screenshot({ path: path.join(SHOTS, `change-pin-${name}.png`) });
      await page.fill('#new1', '123456');
      await page.fill('#new2', '123456');
      await page.click('#cp-btn');
      assert.ok((await page.textContent('#cp-err')).includes('PIN quá dễ đoán'));
      await page.fill('#new1', OWNER_PIN);
      await page.fill('#new2', OWNER_PIN);
      await page.click('#cp-btn');
      await page.waitForSelector('[data-poc="P-01"]', { timeout: 15000 });
      assert.equal(await page.locator('img.brand-logo').count(), 0, 'trang nghiệp vụ không có logo');
      const header = await page.textContent('.bar.main');
      assert.ok(header.includes('Kiểm thử PoC') && header.includes('PoC测试') && header.includes('THỬ'));
      assert.ok(await noHorizontalOverflow(page));
      await page.screenshot({ path: path.join(SHOTS, `poc-${name}.png`), fullPage: true });
      assert.deepEqual(await page.evaluate(() => window.__meCsp), [], 'không vi phạm CSP');
      assert.deepEqual(app.consoleErrors.filter((e) => !/favicon|ERR_FAILED/.test(e)), []);
    } finally { await app.close(); }
  });
}

test('P-01, P-02 (test vector), P-03 chạy đạt trên máy chủ giả lập', async () => {
  const app = await openApp({ delays: { 'equipment.create': 0 } });
  try {
    const { page } = app;
    await loginOwnerFirstTime(page);
    await page.click('[data-poc="P-01"] summary');
    await page.click('#p01');
    await page.waitForSelector('[data-poc="P-01"] .badge.pass', { timeout: 30000 });
    await page.click('[data-poc="P-02"] summary');
    await page.click('#p02v');
    await page.waitForFunction(() => document.querySelector('[data-poc="P-02"] .poc-out').textContent.includes('WebCrypto'));
    const out = await page.textContent('[data-poc="P-02"] .poc-out');
    assert.ok(!out.includes('✗'), out);
    await page.click('#p02l');
    await page.waitForFunction(() => (document.querySelector('[data-poc="P-02"] .poc-out').textContent.match(/MAU-KHOA/g) || []).length >= 6, null, { timeout: 30000 });
    const out2 = await page.textContent('[data-poc="P-02"] .poc-out');
    assert.ok(out2.includes('lần 5: PIN_LOCKED'), out2);
  } finally { await app.close(); }
});

test('P-03: ghi có xác nhận, DUPLICATE, REUSED, CONFLICT, UNKNOWN_RESULT → getOperationStatus', async () => {
  const env = freshServer();
  const app = await openApp({ env, delays: { 'equipment.create': 600 } });
  try {
    const { page } = app;
    await loginOwnerFirstTime(page);
    await page.click('[data-poc="P-03"] summary');
    await page.click('#p03');
    await page.waitForSelector('[data-poc="P-03"] .badge.pass, [data-poc="P-03"] .badge.fail', { timeout: 60000 });
    const out = await page.textContent('[data-poc="P-03"] .poc-out');
    assert.ok(await page.locator('[data-poc="P-03"] .badge.pass').count(), out);
    // bản máy chủ hỏi trực tiếp, kết quả ghi kèm bản app/máy chủ
    assert.equal(await page.textContent('#srv-ver'), APP_VERSION);
    assert.ok((await page.textContent('[data-poc="P-03"] .poc-summary')).includes(`app ${APP_VERSION} / máy chủ ${APP_VERSION}`));
    const lost = env.rows('Equipment').filter((e) => e.name_vi === 'P03 mất phản hồi');
    assert.equal(lost.length, 1, 'mất phản hồi nhưng chỉ ghi một lần');
  } finally { await app.close(); }
});

test('P-03 khi POST bị chuyển thành GET (như lỗi NOT_FOUND ở P-01): app gửi lại cùng operation_id, vẫn đạt, không ghi trùng', async () => {
  const env = freshServer();
  // lần 1 tạo và lần 1 sửa đi lạc thành GET (máy chủ không chạy doPost)
  const app = await openApp({ env, delays: { 'equipment.create': 600 }, fault: (req, n) => ((req.action === 'equipment.create' || req.action === 'equipment.edit') && n === 1 ? 'AS_GET' : null) });
  try {
    const { page } = app;
    await loginOwnerFirstTime(page);
    await page.click('[data-poc="P-03"] summary');
    await page.click('#p03');
    await page.waitForSelector('[data-poc="P-03"] .badge.pass, [data-poc="P-03"] .badge.fail, [data-poc="P-03"] .badge.info', { timeout: 90000 });
    const out = await page.textContent('[data-poc="P-03"] .poc-out');
    assert.ok(await page.locator('[data-poc="P-03"] .badge.pass').count(), out);
    assert.ok(out.includes('UNKNOWN_RESULT · REDIRECTED_AS_GET → gửi lại cùng operation_id'), out);
    assert.equal(env.rows('Equipment').filter((e) => e.name_vi.startsWith('P03 thử ghi')).length, 1, 'không ghi trùng');
    assert.equal(env.rows('Equipment').filter((e) => e.name_vi === 'P03 mất phản hồi').length, 1);
  } finally { await app.close(); }
});

test('mở app khi máy chủ chậm hơn offline_probe_seconds mà vẫn có mạng: chờ tiếp, không chuyển sang mở khóa ngoại tuyến', async () => {
  const delays = {};
  const app = await openApp({ viewport: { width: 1440, height: 900 }, mobile: false, delays });
  try {
    const { page } = app;
    await loginOwnerFirstTime(page);
    delays['sync.changes'] = 9000; // lâu hơn 8 giây mặc định
    await page.reload();
    await page.waitForSelector('.boot', { timeout: 10000 });
    await page.waitForFunction(() => (document.querySelector('.boot') || {}).textContent?.includes('phản hồi chậm'), null, { timeout: 15000 });
    await page.waitForSelector('[data-poc="P-01"]', { timeout: 45000 });
    assert.equal(await page.locator('#upin').count(), 0, 'không hiện màn mở khóa ngoại tuyến');
    const cold = await page.evaluate(() => JSON.parse(localStorage.getItem('me.cold_starts') || '[]'));
    assert.ok(cold.length && cold[cold.length - 1].timed_out, JSON.stringify(cold));
  } finally { await app.close(); }
});

test('P-04: nháp kiểm định tạo khi offline được gửi đúng một lần khi có mạng lại', async () => {
  const env = freshServer();
  env.g.pocSeedSampleData();
  const app = await openApp({ env });
  try {
    const { page, context } = app;
    await loginOwnerFirstTime(page);
    await page.click('[data-poc="P-04"] summary');
    await context.setOffline(true);
    await page.click('#p04d');
    await page.waitForFunction(() => document.querySelector('#p04-queue').textContent.includes('Chờ'));
    assert.equal(env.rows('Inspections').length, 0);
    await context.setOffline(false);
    await page.click('#p04s');
    await page.waitForFunction(() => document.querySelector('#p04-queue').textContent.includes('LKD-'), null, { timeout: 20000 });
    await page.click('#p04s');
    await page.waitForTimeout(500);
    assert.equal(env.rows('Inspections').length, 1);
    await page.screenshot({ path: path.join(SHOTS, 'p04-iphone.png'), fullPage: false });
  } finally { await app.close(); }
});

test('mở lại khi mất mạng → màn Mở khóa ngoại tuyến bằng PIN (P-04)', async () => {
  const env = freshServer();
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false, sw: true });
  try {
    const { page, context } = app;
    await loginOwnerFirstTime(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.waitForSelector('[data-poc="P-01"]', { timeout: 15000 });
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Service Worker điều khiển trang');
    assert.ok(await page.evaluate(async () => (await caches.keys()).every((k) => k.startsWith('me-'))));
    await context.setOffline(true);
    await page.reload().catch(() => {});
    await page.waitForSelector('#upin', { timeout: 15000 });
    const t = await page.textContent('.page');
    assert.ok(t.includes('Mở khóa ngoại tuyến') && t.includes('离线解锁'));
    await page.screenshot({ path: path.join(SHOTS, 'unlock-web.png') });
    await page.fill('#upin', '000111');
    await page.click('#u-btn');
    await page.waitForFunction(() => document.querySelector('#u-err').textContent.includes('Còn 4 lần thử'));
    await page.fill('#upin', OWNER_PIN);
    await page.click('#u-btn');
    await page.waitForSelector('[data-poc="P-04"][open]', { timeout: 15000 });
    assert.ok(await page.isVisible('#sh-offline'));
  } finally { await app.close(); }
});

test('trang tem thử: 2 cỡ, có QR, mã, tên song ngữ; không logo, không chữ M&E trên tem', async () => {
  const env = freshServer();
  env.g.pocSeedSampleData();
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page, base } = app;
    await loginOwnerFirstTime(page);
    await page.goto(base + '#/labels');
    await page.waitForSelector('.label-page.small');
    assert.equal(await page.locator('.label-page.small .label').count(), 24);
    assert.equal(await page.locator('.label-page.large .label').count(), 2);
    const labelText = await page.textContent('#lb-sheets');
    assert.ok(labelText.includes('TB-0001') && labelText.includes('Thiết bị · 设备') && labelText.includes('螺杆空压机'));
    assert.ok(!labelText.includes('M&E'));
    assert.equal(await page.locator('#lb-sheets img').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'labels-web.png') });
  } finally { await app.close(); }
});

test('quét: nhập tay mã TB-0001 tìm thấy; chuỗi lạ báo "Mã này không thuộc M&E"', async () => {
  const env = freshServer();
  env.g.pocSeedSampleData();
  const app = await openApp({ env });
  try {
    const { page } = app;
    await loginOwnerFirstTime(page);
    await page.click('#sh-scan');
    await page.waitForSelector('.scanner');
    await page.screenshot({ path: path.join(SHOTS, 'scan-iphone.png') });
    await page.fill('#sc-input', 'tb-0001');
    await page.click('#sc-form button');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('TB-0001'));
    await page.click('#sh-scan');
    await page.fill('#sc-input', 'https://luongquangdao8386-ops.github.io/Codien/#/x/123');
    await page.click('#sc-form button');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('不属于M&E'));
  } finally { await app.close(); }
});

test('P-06 ảnh: thu nhỏ 1 600 px + ảnh nhỏ, tải lên LINK_VIEW, đặt riêng tư; P-07 tải tài liệu riêng tư; P-13; P-19', async () => {
  const env = freshServer();
  env.g.pocSeedSampleData();
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await loginOwnerFirstTime(page);
    await page.click('[data-poc="P-06"] summary');
    await page.setInputFiles('#p06pick', path.resolve('assets/bg/factory.jpg'));
    await page.waitForFunction(() => document.querySelector('[data-poc="P-06"] .poc-out').textContent.includes('CORS'), null, { timeout: 30000 });
    const out = await page.textContent('[data-poc="P-06"] .poc-out');
    assert.ok(out.includes('1536×864 → 1536×864') || out.includes('→ 1536×864'), out);
    assert.ok(out.includes('doc.upload: OK'), out);
    const d = env.rows('Documents').find((x) => x.kind === 'PHOTO_EQUIPMENT');
    assert.equal(d.drive_sharing_state, 'LINK_SHARED');
    assert.ok(d.thumb_drive_file_id);
    const bytes = env.drive._files.get(d.drive_file_id).bytes;
    assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
    assert.ok(bytes.length < 400 * 1024);
    await page.click('#p06p');
    await page.waitForFunction(() => document.querySelector('[data-poc="P-06"] .poc-out').textContent.includes('REVOKED'));
    assert.equal(env.drive._files.get(d.drive_file_id).access, 'PRIVATE');
    // P-07
    await page.click('[data-poc="P-07"] summary');
    await page.click('#p07t');
    await page.waitForFunction(() => document.querySelector('[data-poc="P-07"] .poc-out').textContent.includes('doc.upload CERTIFICATE: OK'));
    await page.click('#p07d');
    await page.waitForFunction(() => document.querySelector('[data-poc="P-07"] .poc-out').textContent.includes('doc.download: ✓'));
    assert.equal(await page.isEnabled('#p07-open'), true);
    // P-13, P-19
    await page.click('[data-poc="P-13"] summary');
    await page.click('#p13');
    await page.waitForSelector('[data-poc="P-13"] .badge.pass, [data-poc="P-13"] .badge.fail', { timeout: 60000 });
    await page.click('[data-poc="P-19"] summary');
    await page.click('#p19');
    await page.waitForSelector('[data-poc="P-19"] .badge.pass', { timeout: 10000 });
    // báo cáo
    await page.click('#rep-copy');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'poc-web-after.png'), fullPage: true });
  } finally { await app.close(); }
});
