// d4.36: Ảnh nền màn đăng nhập / trang chủ (Quản trị → Ảnh nền đăng nhập, trang chủ; chép cách làm app ISO 1.0.0-d3.3) — đúng các bước gửi
// người dùng: Tài khoản → Quản trị → Ảnh nền đăng nhập, trang chủ → Màn đăng nhập: Chọn ảnh → xem trước → Dùng ảnh này → PIN → Trang chủ:
// Chọn ảnh → … → trang chủ đổi ảnh ngay → Đăng xuất: màn đăng nhập ảnh mới → mở lại trang (lần mở mới): ảnh mới ngay từ đầu, không chớp
// ảnh mặc định → máy thứ hai: lần đầu ảnh mặc định, đăng nhập xong nhận ảnh mới → Dùng ảnh mặc định → máy thứ hai về ảnh mặc định ở lần
// đồng bộ sau. Trưởng bộ phận không có mục Ảnh nền. Bộ nhớ theo trang: /ME/ dùng me.bg / me-bg, trang THỬ /ME-thu/ không nhận ảnh của /ME/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, addUser } from '../helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
// Hai ảnh JPEG thật (để app giải mã, thu nhỏ như trên iPhone): đổi vai cho nhau
const PHOTO_A = { name: 'cong-ty.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(ROOT, 'assets/bg/home.jpg')) };
const PHOTO_B = { name: 'xuong.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(ROOT, 'assets/bg/factory.jpg')) };

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
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const bgOf = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundImage : ''; }, sel);
const modalPrimary = (page) => page.locator('.modal').last().locator('.modal-actions .btn.primary').click();
const noOverflow = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;
  const w = window.innerWidth;
  return ![...document.querySelectorAll('.view *')].some((el) => {
    if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
});
async function logout(page) {
  await go(page, '#/account');
  await page.waitForSelector('#ac-logout');
  await page.click('#ac-logout');
  await page.waitForSelector('#emp', { timeout: 15000 });
}
async function pickPhoto(page, slot, file) {
  await page.setInputFiles(`.bg-file[data-slot="${slot}"]`, file);
  await page.waitForSelector('.modal .bg-prev');
  assert.match(await page.textContent('.modal'), /Ảnh sau khi thu nhỏ: \d+×\d+ px/);
  await modalPrimary(page);
}

function server() {
  const env = freshServer();
  ownerClient(env);
  addUser(env, 'QT', 4, '583922');
  addUser(env, 'TBP', 3, '583923');
  env.g.dbReset_();
  return env;
}

test('iPhone: Quản trị thay ảnh nền màn đăng nhập + trang chủ → đổi ngay, mở lại trang vẫn ảnh mới (không chớp ảnh mặc định); máy thứ hai nhận sau khi đăng nhập; Dùng ảnh mặc định; trang THỬ không lẫn', async () => {
  const env = server();
  const app = await openApp({ env, ...IPHONE });
  let app2 = null;
  try {
    const { page } = app;
    // Lần đầu: ảnh mặc định
    await page.waitForSelector('.login-hero');
    assert.match(await bgOf(page, '.login-hero'), /assets\/bg\/factory\.jpg/);
    await login(page, 'QT', '583922');
    assert.match(await bgOf(page, '.home-hero'), /assets\/bg\/home\.jpg/);
    // 1. Tài khoản → Quản trị → Ảnh nền đăng nhập, trang chủ
    await go(page, '#/account');
    await page.waitForSelector('a[href="#/admin/backgrounds"]');
    assert.match(await page.textContent('a[href="#/admin/backgrounds"]'), /Ảnh nền đăng nhập, trang chủ/);
    await page.click('a[href="#/admin/backgrounds"]');
    await page.waitForSelector('.bg-card[data-slot="LOGIN"]');
    assert.equal(await page.locator('.bg-card .badge:has-text("Ảnh mặc định")').count(), 2);
    assert.match(await page.textContent('.view-page:last-child'), /登录页、首页背景图片/, 'song ngữ');
    assert.ok(await noOverflow(page));
    // 2. Màn đăng nhập: Chọn ảnh → xem trước → Dùng ảnh này → PIN
    await pickPhoto(page, 'LOGIN', PHOTO_A);
    await answerPin(page, '583922');
    await page.waitForSelector('.bg-card[data-slot="LOGIN"] .badge:has-text("Ảnh riêng")');
    // 3. Trang chủ: Chọn ảnh (PIN còn hạn 5 phút: không hỏi lại)
    await pickPhoto(page, 'HOME', PHOTO_B);
    await page.waitForSelector('.bg-card[data-slot="HOME"] .badge:has-text("Ảnh riêng")');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd436-bg-admin-iphone.png'), fullPage: true });
    env.g.dbReset_();
    assert.ok(env.g.setting_('bg_login_rev') && env.g.setting_('bg_home_rev'));
    // Bộ nhớ của app này: localStorage me.bg + Cache Storage me-bg (không phải iso_bg / tiền tố khác)
    const store = await page.evaluate(async () => ({ flag: JSON.parse(localStorage.getItem('me.bg') || 'null'), caches: await caches.keys(),
      other: Object.keys(localStorage).filter((k) => /bg/.test(k) && k !== 'me.bg') }));
    assert.equal(store.flag.login.on, true);
    assert.equal(store.flag.home.on, true);
    assert.ok(store.caches.includes('me-bg'), JSON.stringify(store.caches));
    assert.deepEqual(store.other, []);
    // Trang chủ đổi ngay
    await go(page, '#/');
    await page.waitForSelector('.home-hero');
    assert.match(await bgOf(page, '.home-hero'), /^url\("blob:/);
    // 4. Đăng xuất → màn đăng nhập ảnh mới
    await logout(page);
    assert.match(await bgOf(page, '.login-hero'), /^url\("blob:/);
    // 5. Mở lại trang (như mở lại app): lớp bg-login có trước khi vẽ, ảnh mặc định không được tải
    const loaded = [];
    page.on('request', (rq) => { if (/assets\/bg\//.test(rq.url())) loaded.push(rq.url()); });
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('bg-login')), true);
    await page.waitForSelector('.login-hero');
    await page.waitForFunction(() => /blob:/.test(getComputedStyle(document.querySelector('.login-hero')).backgroundImage));
    assert.deepEqual(loaded.filter((u) => /factory\.jpg/.test(u)), [], 'không tải ảnh mặc định màn đăng nhập');
    await page.screenshot({ path: path.join(SHOTS, 'd436-bg-login-iphone.png') });
    // Trang THỬ (/ME-thu/) cùng máy, cùng origin: bộ nhớ riêng → vẫn ảnh mặc định
    const thu = await app.context.newPage();
    await thu.goto(app.base.replace('/ME/', '/ME-thu/'));
    await thu.waitForSelector('.login-hero');
    assert.equal(await thu.evaluate(() => document.documentElement.classList.contains('bg-login')), false);
    assert.match(await bgOf(thu, '.login-hero'), /assets\/bg\/factory\.jpg/);
    await thu.close();

    // 6. Máy thứ hai (chưa đăng nhập lần nào): ảnh mặc định; đăng nhập xong nhận ảnh mới
    app2 = await openApp({ env, ...IPHONE });
    const p2 = app2.page;
    await p2.waitForSelector('.login-hero');
    assert.match(await bgOf(p2, '.login-hero'), /factory\.jpg/);
    await login(p2, 'TBP', '583923');
    await p2.waitForFunction(() => /blob:/.test(getComputedStyle(document.querySelector('.home-hero')).backgroundImage));
    // Trưởng bộ phận không có mục Ảnh nền; mở thẳng địa chỉ → báo không có quyền / máy chủ cũ, không lỗi
    await go(p2, '#/account');
    await p2.waitForSelector('#ac-logout');
    assert.equal(await p2.locator('a[href="#/admin/backgrounds"]').count(), 0);
    await logout(p2);
    assert.match(await bgOf(p2, '.login-hero'), /^url\("blob:/);

    // 7. Quản trị: Màn đăng nhập → Dùng ảnh mặc định
    await login(page, 'QT', '583922');
    await go(page, '#/admin/backgrounds');
    await page.waitForSelector('[data-reset="LOGIN"]');
    await page.click('[data-reset="LOGIN"]');
    await modalPrimary(page);
    await answerPin(page, '583922');
    await page.waitForSelector('.bg-card[data-slot="LOGIN"] .badge:has-text("Ảnh mặc định")');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('bg-login')), false);
    // Máy thứ hai: lần đồng bộ sau về ảnh mặc định ở màn đăng nhập, trang chủ vẫn ảnh riêng
    await login(p2, 'TBP', '583923');
    await p2.waitForFunction(() => !document.documentElement.classList.contains('bg-login'));
    assert.match(await bgOf(p2, '.home-hero'), /^url\("blob:/);
    await logout(p2);
    assert.match(await bgOf(p2, '.login-hero'), /factory\.jpg/);
    assert.deepEqual(app.consoleErrors, []);
    assert.deepEqual(app2.consoleErrors, []);
  } finally {
    await app.close();
    if (app2) await app2.close();
  }
});

test('web 1440: trang Ảnh nền không tràn; ảnh riêng trang chủ hiện trên trang chủ web; Trạng thái hệ thống có dòng Ảnh nền', async () => {
  const env = server();
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page, 'QT', '583922');
    await go(page, '#/admin/backgrounds');
    await page.waitForSelector('.bg-card[data-slot="HOME"]');
    await pickPhoto(page, 'HOME', PHOTO_A);
    await answerPin(page, '583922');
    await page.waitForSelector('.bg-card[data-slot="HOME"] .badge:has-text("Ảnh riêng")');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd436-bg-admin-web.png'), fullPage: true });
    await go(page, '#/');
    await page.waitForSelector('.home-hero');
    assert.match(await bgOf(page, '.home-hero'), /^url\("blob:/);
    await page.screenshot({ path: path.join(SHOTS, 'd436-bg-home-web.png') });
    await go(page, '#/admin/status');
    await page.waitForFunction(() => /Ảnh nền đăng nhập, trang chủ/.test(document.body.textContent) && /Trang chủ: ảnh riêng/.test(document.body.textContent), null, { timeout: 15000 });
    assert.deepEqual(app.consoleErrors, []);
  } finally {
    await app.close();
  }
});
