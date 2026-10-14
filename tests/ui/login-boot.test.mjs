// Đăng nhập một lần bấm, màn chờ mở app, ảnh trang chủ (bản d1.17)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };

function seeded() {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  return env;
}
const ownerSessions = (env) => {
  const uid = env.rows('Users').find((u) => u.employee_code === OWNER_CODE).user_id;
  return env.rows('Sessions').filter((s) => s.user_id === uid && s.session_kind === 'FULL').length;
};
const count = (calls, a) => calls.filter((x) => x === a).length;

test('đăng nhập: mất phản hồi lần đầu → app tự gửi lại, một lần bấm là vào, máy chủ chỉ tạo một phiên', async () => {
  const env = seeded();
  const app = await openApp({ env, ...IPHONE, fault: (req, n) => (req.action === 'auth.login' && n === 1 ? 'EXEC_THEN_AS_GET' : null) });
  try {
    const { page, calls } = app;
    const before = ownerSessions(env);
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 20000 });
    assert.equal(count(calls, 'auth.login'), 2, 'gửi lại một lần');
    assert.equal(ownerSessions(env) - before, 1, 'gửi lại cùng login_id không tạo thêm phiên');
  } finally { await app.close(); }
});

test('đăng nhập: nút giữ trạng thái đang chạy tới khi vào app (tải dữ liệu), bấm thêm không gửi thêm', async () => {
  const delays = { 'sync.bootstrap': 1500 };
  const app = await openApp({ env: seeded(), ...IPHONE, delays });
  try {
    const { page, calls } = app;
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForFunction(() => (document.querySelector('#login-status') || {}).textContent?.includes('Đang tải dữ liệu'), null, { timeout: 10000 });
    assert.equal(await page.isDisabled('#login-btn'), true);
    await page.screenshot({ path: path.join(SHOTS, 'login-loading-iphone.png') });
    await page.click('#login-btn', { force: true }).catch(() => {});
    await page.dispatchEvent('form.login-card', 'submit').catch(() => {});
    await page.waitForSelector('.grid9', { timeout: 20000 });
    assert.equal(count(calls, 'auth.login'), 1);
  } finally { await app.close(); }
});

test('đăng nhập: máy chủ không trả lời thì giữ PIN để chỉ cần bấm lại', async () => {
  const app = await openApp({ env: seeded(), ...IPHONE, fault: (req) => (req.action === 'auth.login' ? 'AS_GET' : null) });
  try {
    const { page } = app;
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForFunction(() => document.querySelector('#login-err').textContent.length > 0, null, { timeout: 20000 });
    assert.equal(await page.inputValue('#pin'), OWNER_PIN);
    assert.equal(await page.isDisabled('#login-btn'), false);
  } finally { await app.close(); }
});

for (const [name, vp] of [['iphone', IPHONE], ['web', WEB]]) {
  test(`màn chờ mở app ${name}: ảnh, lời chào, 3 bước, nút Mở bằng PIN; một lượt hỏi máy chủ thay vì hai; không logo`, async () => {
    const delays = {};
    const app = await openApp({ env: seeded(), ...vp, delays });
    try {
      const { page, calls } = app;
      await page.fill('#emp', OWNER_CODE);
      await page.fill('#pin', OWNER_PIN);
      await page.click('#login-btn');
      await page.waitForSelector('.grid9', { timeout: 15000 });
      delays['sync.changes'] = 2500;
      const n0 = count(calls, 'sync.changes');
      await page.reload();
      await page.waitForSelector('.boot-card', { timeout: 10000 });
      const txt = await page.textContent('.boot-card');
      assert.ok(txt.includes('Xin chào · 你好'), txt);
      assert.ok(txt.includes(OWNER_CODE), txt);
      for (const s of ['Kết nối máy chủ · 连接服务器', 'Cập nhật dữ liệu · 更新数据', 'Mở trang chủ · 打开首页', 'Mở bằng PIN · 用PIN打开']) assert.ok(txt.includes(s), s);
      assert.equal(await page.locator('.boot-steps li.active').count(), 1);
      assert.equal(await page.locator('img.brand-logo').count(), 0, 'không logo ở màn chờ');
      assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector('.boot-photo')).backgroundImage.includes('factory.jpg')));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOTS, `boot-${name}.png`) });
      await page.waitForSelector('.grid9', { timeout: 20000 });
      assert.equal(count(calls, 'sync.changes') - n0, 1, 'hỏi phiên và lấy thay đổi trong cùng một lượt');
    } finally { await app.close(); }
  });
}

test('màn chờ: bấm Mở bằng PIN → nhập đủ 6 số là tự mở, không cần bấm nút', async () => {
  const delays = {};
  const app = await openApp({ env: seeded(), ...IPHONE, delays });
  try {
    const { page } = app;
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    delays['sync.changes'] = 8000;
    await page.reload();
    await page.click('#open-pin', { timeout: 10000 });
    await page.waitForSelector('#upin');
    await page.screenshot({ path: path.join(SHOTS, 'unlock-iphone.png') });
    await page.type('#upin', OWNER_PIN);
    await page.waitForSelector('.grid9', { timeout: 10000 });
  } finally { await app.close(); }
});

for (const [name, vp] of [['iphone', IPHONE], ['web', WEB]]) {
  test(`trang chủ ${name}: ảnh nền hiện rộng hơn, thẻ chỉ chồng mép ảnh`, async () => {
    const app = await openApp({ env: seeded(), ...vp });
    try {
      const { page } = app;
      await page.fill('#emp', OWNER_CODE);
      await page.fill('#pin', OWNER_PIN);
      await page.click('#login-btn');
      await page.waitForSelector('.grid9', { timeout: 15000 });
      const m = await page.evaluate(() => {
        const h = document.querySelector('.home-hero').getBoundingClientRect();
        const b = document.querySelector('.home-body').getBoundingClientRect();
        return { w: h.width, h: h.height, overlap: h.bottom - b.top };
      });
      // Ảnh 1536×864: phần ảnh hiện ra ≥ 55% chiều cao ảnh trên iPhone, ≥ 35% trên web (trước đây ~29%)
      const shown = (m.h - m.overlap) / (m.w * 864 / 1536);
      assert.ok(shown >= (name === 'iphone' ? 0.95 : 0.35), JSON.stringify({ ...m, shown }));
      assert.ok(m.overlap <= 24, JSON.stringify(m));
      await page.screenshot({ path: path.join(SHOTS, `home-hero-${name}.png`) });
    } finally { await app.close(); }
  });
}
