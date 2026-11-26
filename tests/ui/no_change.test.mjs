// Rà soát d4.40: mở biểu mẫu sửa rồi bấm Lưu mà không đổi gì → không gửi máy chủ (không chờ, không tăng phiên bản, không nhật ký rỗng),
// báo "Không có thay đổi nào để lưu" và quay về hồ sơ. Mẫu checklist: máy chủ giữ phiên bản. Sửa thật một ô thì vẫn lưu như cũ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, uuid, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const ids = { eq: uuid(), mat: uuid(), co: uuid(), meter: uuid(), panel: uuid(), cl: uuid(), loc: uuid() };
  ok(c.write('location.edit', { location_id: ids.loc, name_vi: 'Xưởng A', type: 'WORKSHOP' }));
  ok(c.write('equipment.create', { equipment_id: ids.eq, name_vi: 'Máy nén', manufacture_year: 2019, location_id: ids.loc }));
  ok(c.write('material.create', { material_id: ids.mat, name_vi: 'Lọc', base_unit: 'cái' }));
  ok(c.write('contract.create', { contract_id: ids.co, title_vi: 'HĐ bảo trì', start_date: '2026-01-01', end_date: '2027-01-01' }));
  ok(c.write('meter.edit', { meter_id: ids.meter, name_vi: 'Điện', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  ok(c.write('circuit.edit', { entity: 'PANEL', panel_id: ids.panel, name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD', supply_voltage: 400 }));
  ok(c.write('maintenance.checklist.edit', { template_id: ids.cl, template_name_vi: 'Bảo dưỡng', items: [{ label_vi: 'Dầu', result_type: 'PASS_FAIL' }, { label_vi: 'Áp suất', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8 }] }));
  return { env, ids };
}

test('web + iPhone: Lưu không đổi gì ở 6 biểu mẫu sửa → không gửi, báo Không có thay đổi, quay về hồ sơ; checklist giữ phiên bản; sửa một ô vẫn lưu', async () => {
  const { env, ids } = setup();
  const forms = [
    [`/equipment/${ids.eq}/edit`, `#/equipment/${ids.eq}`, 'Equipment', 'equipment_id', ids.eq],
    [`/materials/${ids.mat}/edit`, `#/materials/${ids.mat}`, 'Materials', 'material_id', ids.mat],
    [`/contracts/${ids.co}/edit`, `#/contracts/${ids.co}`, 'Contracts', 'contract_id', ids.co],
    [`/utilities/meters/${ids.meter}/edit`, `#/utilities/meters/${ids.meter}`, 'Meters', 'meter_id', ids.meter],
    [`/circuits/p/${ids.panel}/edit`, `#/circuits/p/${ids.panel}`, 'Panels', 'panel_id', ids.panel]
  ];
  for (const dev of [{ viewport: { width: 1440, height: 900 }, mobile: false }, { viewport: { width: 390, height: 844 }, mobile: true }]) {
    const app = await openApp({ env, ...dev });
    const { page } = app;
    try {
      await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
      await page.waitForSelector('.grid9', { timeout: 20000 });
      for (const [route, back, sheet, key, id] of forms) {
        await page.evaluate((h) => { location.hash = h; }, '#' + route);
        await page.waitForSelector('#fm-save', { timeout: 15000 });
        const v0 = env.rows(sheet).find((x) => x[key] === id).record_version;
        const calls0 = app.calls.length;
        await page.click('#fm-save');
        await page.waitForFunction((h) => location.hash === h, back, { timeout: 10000 });
        await page.waitForFunction(() => /Không có thay đổi nào để lưu/.test(document.querySelector('#toast').textContent));
        assert.deepEqual(app.calls.slice(calls0).filter((a) => /edit|create/.test(a)), [], route + ': không gửi máy chủ');
        assert.equal(env.rows(sheet).find((x) => x[key] === id).record_version, v0, route + ': không tăng phiên bản');
      }
      // Mẫu checklist: máy chủ thấy y nguyên → giữ phiên bản 1
      await page.evaluate((h) => { location.hash = h; }, `#/maintenance/checklists/${ids.cl}`);
      await page.waitForSelector('#fm-save', { timeout: 15000 });
      await page.click('#fm-save');
      await page.waitForFunction(() => location.hash === '#/maintenance/checklists', null, { timeout: 15000 });
      assert.deepEqual([...new Set(env.rows('ChecklistTemplates').filter((r) => r.template_id === ids.cl).map((r) => r.revision))], [1]);
      assert.deepEqual(app.consoleErrors, []);
    } finally {
      await app.close();
    }
  }
  // Sửa thật một ô thì vẫn lưu (web): đổi Hãng của thiết bị
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 20000 });
    await page.evaluate((h) => { location.hash = h; }, `#/equipment/${ids.eq}/edit`);
    await page.waitForSelector('#f-manufacturer');
    const v0 = env.rows('Equipment').find((x) => x.equipment_id === ids.eq).record_version;
    await page.fill('#f-manufacturer', 'Atlas Copco');
    await page.click('#fm-save');
    await page.waitForFunction((h) => location.hash === h, `#/equipment/${ids.eq}`, { timeout: 15000 });
    const e = env.rows('Equipment').find((x) => x.equipment_id === ids.eq);
    assert.equal(e.manufacturer, 'Atlas Copco');
    assert.equal(e.record_version, v0 + 1);
    // Danh mục chung → Khu vực: Sửa → Lưu không đổi gì → không gửi, đóng hộp, báo Không có thay đổi
    await page.evaluate(() => { location.hash = '#/admin/catalog?tab=locations'; });
    await page.waitForSelector(`[data-edit="${ids.loc}"]`, { timeout: 15000 });
    const lv = env.rows('Locations').find((x) => x.location_id === ids.loc).record_version;
    const calls0 = app.calls.length;
    await page.click(`[data-edit="${ids.loc}"]`);
    await page.waitForSelector('.modal [data-x="save"]');
    await page.click('.modal [data-x="save"]');
    await page.waitForSelector('.modal', { state: 'detached' });
    await page.waitForFunction(() => /Không có thay đổi nào để lưu/.test(document.querySelector('#toast').textContent));
    assert.deepEqual(app.calls.slice(calls0).filter((a) => a === 'location.edit'), []);
    assert.equal(env.rows('Locations').find((x) => x.location_id === ids.loc).record_version, lv);
    assert.deepEqual(app.consoleErrors, []);
  } finally {
    await app.close();
  }
});
