// Rà soát d4.43: hai người sửa cùng hồ sơ. Trước: ngoài Thiết bị / Vật tư, biểu mẫu sửa gặp VERSION_CONFLICT chỉ báo "Xung đột, cần xử lý",
// bấm Lưu lại vẫn xung đột (mắc kẹt); Thiết bị / Vật tư "Sửa tiếp" bắt gõ lại. Nay mọi biểu mẫu: hộp Bản của tôi / Bản máy chủ →
// "Sửa tiếp trên bản máy chủ" mở lại theo bản mới và điền lại đúng các ô tôi đã sửa (giữ thay đổi của người kia ở ô khác);
// "Dùng bản máy chủ" bỏ phần tôi sửa. Nút thao tác gặp xung đột → tải bản mới, mở lại màn, báo rõ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, userClient, uuid, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

const go = (page, h) => page.evaluate((x) => { location.hash = '#/__x' + Math.random(); location.hash = x; }, h);
const row = (env, s, k, id) => env.rows(s).find((x) => x[k] === id);

test('web: Đồng hồ, Thiết bị, Phiếu báo sự cố — người khác lưu trước → hộp xung đột → Sửa tiếp giữ ô tôi sửa + ô người kia; Dùng bản máy chủ', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const other = userClient(env, 'U-C3', 3, '694127');
  const m = uuid(), eq = uuid(), rp = uuid();
  assert.equal(c.write('meter.edit', { meter_id: m, name_vi: 'Điện xưởng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }).ok, true);
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén 01' }).ok, true);
  assert.equal(c.write('repair.report', { repair_id: rp, equipment_id: eq, symptom_vi: 'Kêu to', severity: 'MEDIUM' }).ok, true);
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 20000 });
    // Đồng hồ: tôi đổi tên, người khác đổi vị trí
    await go(page, `#/utilities/meters/${m}/edit`);
    await page.waitForSelector('#f-name_vi');
    assert.equal(c.write('meter.edit', { meter_id: m, position_vi: 'Tủ MSB' }, { expected_version: row(env, 'Meters', 'meter_id', m).record_version }).ok, true);
    await page.fill('#f-name_vi', 'Điện xưởng A');
    await page.click('#fm-save');
    await page.waitForSelector('.modal .tbl.conflict');
    assert.match(await page.textContent('.modal'), /Điện xưởng A/);
    await page.locator('.modal .btn.primary').click(); // Sửa tiếp trên bản máy chủ
    // biểu mẫu mở lại theo bản máy chủ (vị trí của người kia) rồi điền lại ô tôi sửa
    await page.waitForFunction(() => /giữ các ô bạn đã sửa/.test(document.querySelector('#toast').textContent));
    assert.equal(await page.inputValue('#f-position_vi'), 'Tủ MSB');
    assert.equal(await page.inputValue('#f-name_vi'), 'Điện xưởng A');
    await page.click('#fm-save');
    await page.waitForFunction((id) => location.hash === '#/utilities/meters/' + id, m);
    const mr = row(env, 'Meters', 'meter_id', m);
    assert.equal(mr.name_vi, 'Điện xưởng A');
    assert.equal(mr.position_vi, 'Tủ MSB');
    // Thiết bị (trước có hộp riêng, Sửa tiếp bắt gõ lại): nay điền lại
    await go(page, `#/equipment/${eq}/edit`);
    await page.waitForSelector('#f-name_vi');
    assert.equal(other.write('equipment.edit', { equipment_id: eq, model: 'GA37' }, { expected_version: row(env, 'Equipment', 'equipment_id', eq).record_version }).ok, true, 'Trưởng bộ phận sửa trước');
    await page.fill('#f-name_vi', 'Máy nén khí 01');
    await page.click('#fm-save');
    await page.waitForSelector('.modal .tbl.conflict');
    await page.locator('.modal .btn.primary').click();
    await page.waitForFunction(() => document.querySelector('#f-model') && document.querySelector('#f-model').value === 'GA37' && document.querySelector('#f-name_vi').value === 'Máy nén khí 01');
    await page.click('#fm-save');
    await page.waitForFunction((id) => location.hash === '#/equipment/' + id, eq);
    assert.equal(row(env, 'Equipment', 'equipment_id', eq).name_vi, 'Máy nén khí 01');
    assert.equal(row(env, 'Equipment', 'equipment_id', eq).model, 'GA37');
    // Phiếu báo sự cố: ô Triệu chứng không có name (id f-symptom) vẫn điền lại; Dùng bản máy chủ thì bỏ phần tôi sửa
    await go(page, `#/repairs/${rp}/edit`);
    await page.waitForSelector('#f-symptom');
    assert.equal(c.write('repair.editReport', { repair_id: rp, symptom_vi: 'Người khác sửa' }, { expected_version: row(env, 'Repairs', 'repair_id', rp).record_version }).ok, true);
    await page.fill('#f-symptom', 'Tôi sửa');
    await page.click('#fm-save');
    await page.waitForSelector('.modal .tbl.conflict');
    await page.locator('.modal .btn', { hasText: 'Dùng bản máy chủ' }).click();
    await page.waitForFunction(() => document.querySelector('#f-symptom') && document.querySelector('#f-symptom').value === 'Người khác sửa');
    assert.equal(row(env, 'Repairs', 'repair_id', rp).symptom_vi, 'Người khác sửa');
    assert.deepEqual(app.consoleErrors, []);
  } finally {
    await app.close();
  }
});
