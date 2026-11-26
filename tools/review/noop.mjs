// Biểu mẫu sửa: Lưu không đổi gì có gửi máy chủ không. Cách chạy: tools/review/README.md
// Mở biểu mẫu sửa, bấm Lưu không đổi gì: có lần ghi nào lên máy chủ không?
import { openApp } from '../../tests/ui/harness.mjs';
import { freshServer, ownerClient, uuid, OWNER_CODE, OWNER_PIN } from '../../tests/helpers.mjs';
const env = freshServer();
const c = ownerClient(env);
const eq = uuid(), mat = uuid(), co = uuid(), meter = uuid(), panel = uuid();
c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén', manufacture_year: 2019 });
c.write('material.create', { material_id: mat, name_vi: 'Lọc', base_unit: 'cái' });
c.write('contract.create', { contract_id: co, title_vi: 'HĐ', start_date: '2026-01-01', end_date: '2027-01-01' });
c.write('meter.edit', { meter_id: meter, name_vi: 'Điện', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' });
c.write('circuit.edit', { entity: 'PANEL', panel_id: panel, name_vi: 'Tủ', panel_type: 'MAIN_SWITCHBOARD' });
const forms = [[`/equipment/${eq}/edit`, 'Equipment', 'equipment_id', eq], [`/materials/${mat}/edit`, 'Materials', 'material_id', mat], [`/contracts/${co}/edit`, 'Contracts', 'contract_id', co],
  [`/utilities/meters/${meter}/edit`, 'Meters', 'meter_id', meter], [`/circuits/p/${panel}/edit`, 'Panels', 'panel_id', panel]];
for (const dev of [{ viewport: { width: 390, height: 844 }, mobile: true }, { viewport: { width: 1440, height: 900 }, mobile: false }]) {
  const app = await openApp({ env, ...dev });
  const { page } = app;
  await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 20000 });
  for (const [r, sheet, key, id] of forms) {
    await page.evaluate((h) => { location.hash = h; }, '#' + r);
    await page.waitForSelector('#fm-save', { timeout: 15000 });
    await page.waitForTimeout(300);
    const v0 = env.rows(sheet).find((x) => x[key] === id).record_version;
    const calls0 = app.calls.length;
    await page.click('#fm-save');
    await page.waitForTimeout(1500);
    const v1 = env.rows(sheet).find((x) => x[key] === id).record_version;
    console.log(dev.mobile ? 'iphone' : 'web', r.split('/').slice(0, 2).join('/'), 'version', v0, '→', v1, 'writes', app.calls.slice(calls0).filter((a) => !/^sync\./.test(a)).join(','));
  }
  await app.close();
}
