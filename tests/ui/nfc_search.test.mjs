// Rà soát d4.41: tên đã lưu dạng dấu tách rời (NFD — dữ liệu cũ, gõ bằng Unikey "Unicode tổ hợp") vẫn tìm thấy khi gõ trên iPhone (NFC),
// và gõ dạng NFD cũng tìm thấy tên NFC; biểu mẫu gửi NFC
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, uuid, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

test('iPhone: Thiết bị — tìm "xưởng" (NFC) thấy tên lưu NFD; tìm dạng NFD thấy tên NFC', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const a = uuid(), b = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: a, name_vi: 'Máy nén xưởng A' }).ok, true);
  assert.equal(c.write('equipment.create', { equipment_id: b, name_vi: 'Bơm nước ngầm' }).ok, true);
  // Dữ liệu cũ: ghi thẳng dạng NFD vào sheet (như lưu trước bản d4.41)
  env.g.dbReset_();
  env.g.withWriteLock_(() => { const r = env.g.readRows_('Equipment').find((x) => x.equipment_id === a); env.g.writeCells_('Equipment', r.__row, { name_vi: 'Máy nén xưởng A'.normalize('NFD') }); });
  const app = await openApp({ env, viewport: { width: 390, height: 844 }, mobile: true });
  const { page } = app;
  try {
    await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 20000 });
    await page.evaluate(() => { location.hash = '#/equipment'; });
    await page.waitForSelector('#eq-q');
    const count = () => page.evaluate(() => document.querySelectorAll('.view-page:last-child .rec-card').length);
    await page.fill('#eq-q', 'xưởng');
    await page.waitForFunction(() => document.querySelectorAll('.view-page:last-child .rec-card').length === 1, null, { timeout: 5000 });
    assert.match(await page.textContent('.view-page:last-child .rec-card'), /Máy nén/);
    await page.fill('#eq-q', 'nước'.normalize('NFD'));
    await page.waitForFunction(() => document.querySelectorAll('.view-page:last-child .rec-card').length === 1 && /Bơm/.test(document.querySelector('.view-page:last-child .rec-card').textContent), null, { timeout: 5000 });
    assert.equal(await count(), 1);
    assert.deepEqual(app.consoleErrors, []);
  } finally {
    await app.close();
  }
});
