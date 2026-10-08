// Gợi ý dịch cho trường không dịch tự động (2.3) và Dịch lại hồ sơ chờ dịch (i18n.retranslate)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);

test('iPhone C4: loại kiểm định — Gợi ý dịch điền ô Trung, chưa tick "Đã kiểm tra bản dịch" thì không lưu; tick rồi lưu → HUMAN + assisted', async () => {
  const env = freshServer();
  ownerClient(env);
  const app = await openApp({ env });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/inspections/types');
    await page.waitForSelector('#ty-add', { timeout: 15000 });
    await page.click('#ty-add');
    await page.fill('.modal #f-code', 'NANG_HA');
    await page.fill('.modal #f-name_vi', 'Kiểm định thiết bị nâng');
    await page.click('.modal [data-base="name"] [data-sg]');
    await page.waitForFunction(() => document.querySelector('.modal #f-name_zh').value !== '', null, { timeout: 15000 });
    assert.match(await page.inputValue('.modal #f-name_zh'), /Kiểm định thiết bị nâng/);
    await page.click('.modal [data-x="save"]');
    await page.waitForFunction(() => document.querySelector('.modal').textContent.includes('Đã kiểm tra bản dịch'), null, { timeout: 5000 });
    assert.equal(env.rows('InspectionTypes').length, 0, 'chưa tick thì chưa lưu');
    await page.check('.modal [data-base="name"] [data-sg-ok]');
    await page.click('.modal [data-x="save"]');
    await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 });
    const t = env.rows('InspectionTypes')[0];
    assert.equal(t.i18n_meta.name.state, 'HUMAN');
    assert.equal(t.i18n_meta.name.assisted, true);
    await page.screenshot({ path: path.join(SHOTS, 'i18n-suggest-iphone.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: thiết bị có tên chờ dịch (dịch lỗi lúc lưu) → nút Dịch lại → có bản dịch máy, không đổi phiên bản bản ghi', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.props.setProperty('TEST_MT_FAIL', 'true');
  const id = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: id, name_vi: 'Quạt hút khói' }).ok, true);
  env.props.setProperty('TEST_MT_FAIL', 'false');
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await login(page);
    await go(page, `#/equipment/${id}`);
    await page.waitForSelector('[data-retr="EQUIPMENT"]', { timeout: 15000 });
    assert.ok((await page.textContent('.view')).includes('Chưa có bản dịch'));
    await page.click('[data-retr="EQUIPMENT"]');
    await page.waitForSelector('[data-retr]', { state: 'detached', timeout: 15000 });
    const e = env.rows('Equipment')[0];
    assert.equal(e.i18n_meta.name.state, 'MACHINE');
    assert.equal(e.record_version, 1);
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('dịch máy · 机器翻译'), null, { timeout: 15000 });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
