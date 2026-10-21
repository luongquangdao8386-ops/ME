// Danh sách dài dựng từng đợt (iPhone 50, web 100) + nút "Hiện thêm": máy Android tầm trung dựng hàng nghìn phần tử mất cả giây
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);

async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

test('iPhone: 125 thiết bị → 50 thẻ + "Hiện thêm 50 (còn 75)"; bấm → 100; tìm kiếm về đợt đầu; mở lại từ trang chủ về 50', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  for (let i = 0; i < 120; i++) assert.equal(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy bơm số ' + i }).ok, true);
  const total = env.rows('Equipment').length;
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/equipment');
    await page.waitForSelector('.cards .rec-card');
    assert.equal(await page.locator('.cards > .rec-card').count(), 50);
    assert.equal((await page.textContent('[data-more]')).trim().startsWith(`Hiện thêm 50 (còn ${total - 50})`), true);
    await page.click('[data-more]');
    await page.waitForFunction(() => document.querySelectorAll('.cards > .rec-card').length === 100);
    assert.ok((await page.textContent('[data-more]')).includes(`còn ${total - 100}`));
    // Tìm kiếm: kết quả ít, không có nút; xóa ô tìm → lại 50 dòng đầu
    await page.fill('#eq-q', 'Máy bơm số 11');
    await page.waitForFunction(() => document.querySelectorAll('.cards > .rec-card').length < 50);
    assert.equal(await page.locator('[data-more]').count(), 0);
    await page.fill('#eq-q', '');
    await page.waitForFunction(() => document.querySelectorAll('.cards > .rec-card').length === 50);
    await page.click('[data-more]');
    await page.waitForFunction(() => document.querySelectorAll('.cards > .rec-card').length === 100);
    // Về trang chủ rồi mở lại Thiết bị (như bấm nút/ô trong app — navigate, không phải lùi lịch sử): về đợt đầu
    const nav = (x) => page.evaluate((p) => import('./js/router.js').then((r) => r.navigate(p)), x);
    await nav('/');
    await page.waitForSelector('.grid9');
    await nav('/equipment');
    await page.waitForFunction(() => document.querySelectorAll('.cards > .rec-card').length === 50);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web: 160 vật tư → bảng 100 dòng + "Hiện thêm 60 (còn 60)"; bấm → đủ 160, hết nút', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  for (let i = 0; i < 160; i++) assert.equal(c.write('material.create', { material_id: uuid(), name_vi: 'Vật tư ' + i, base_unit: 'cái' }).ok, true);
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/materials');
    await page.waitForSelector('tr[data-id]');
    assert.equal(await page.locator('tr[data-id]').count(), 100);
    assert.ok((await page.textContent('[data-more]')).includes('Hiện thêm 60 (còn 60)'));
    await page.click('[data-more]');
    await page.waitForFunction(() => document.querySelectorAll('tr[data-id]').length === 160);
    assert.equal(await page.locator('[data-more]').count(), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
