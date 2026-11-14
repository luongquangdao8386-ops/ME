// d4.37: hồ sơ thiết bị có Năm đưa vào sử dụng, Thiết bị nghiêm ngặt (ô tick), Số đăng ký; báo cáo Thiết bị (BM-CĐ-02-01) và
// Kiểm định (BM-CĐ-06-05) có cột mới theo thứ tự biểu; ô Đơn vị kiểm định ở form chứng nhận. 1440×900 và 390×844.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;
  const w = window.innerWidth;
  return ![...document.querySelectorAll('.view *')].some((el) => {
    if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
});
async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const heads = (page) => page.evaluate(() => [...document.querySelectorAll('#rp-paper .paper-tbl thead th')].map((t) => t.textContent.split('·')[0].trim()));

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, equipment_code: 'TB-NH', name_vi: 'Nồi hơi 01', install_date: '2016-03-01' }));
  ok(c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: eq, spec_key: 'electrical_power', value_num: 15, unit: 'kW' }));
  const ven = uuid();
  ok(c.write('vendor.edit', { vendor_id: ven, name: 'Trung tâm Kiểm định KTAT 2' }));
  return { env, c, eq, ven };
}

test('web: sửa thiết bị (năm đưa vào sử dụng, tick nghiêm ngặt, số đăng ký) → hồ sơ hiện; báo cáo Thiết bị và Kiểm định có cột mới đúng thứ tự', async () => {
  const { env, c, eq, ven } = setup();
  const type = uuid(), req = uuid(), ins = uuid();
  ok(c.write('inspection.type.edit', { inspection_type_id: type, code: 'NOI_HOI', name_vi: 'Kiểm định nồi hơi', default_interval_months: 12 }));
  ok(c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type }));
  ok(c.write('inspection.submit', { inspection_id: ins, requirement_id: req, vendor_id: ven, inspection_date: '2026-10-01', valid_from: '2026-10-01', valid_to: '2027-09-30', result: 'PASS', certificate_number: 'GCN-55' }));
  ok(c.write('inspection.approve', { inspection_id: ins, decision: 'APPROVE' }, { expected_version: 1, reauth_token: c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token }));
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await go(page, `#/equipment/${eq}/edit`);
    await page.waitForSelector('#f-strict_safety');
    assert.equal(await page.locator('#f-in_service_year').count(), 1);
    assert.equal(await page.locator('#f-registration_no').count(), 1);
    assert.ok((await page.textContent('#eq-power-note')).includes('Công suất điện'), 'ghi chú: công suất lấy từ thông số');
    await page.fill('#f-in_service_year', '2017');
    await page.check('#f-strict_safety');
    await page.fill('#f-registration_no', 'DK-NH-07');
    await page.screenshot({ path: path.join(SHOTS, 'd437-web-eq-form.png'), fullPage: true });
    await page.click('#fm-save');
    await page.waitForFunction(() => /#\/equipment\/[^/]+$/.test(location.hash.split('?')[0]), null, { timeout: 15000 });
    const e = env.rows('Equipment').find((x) => x.equipment_id === eq);
    assert.deepEqual([e.in_service_year, e.strict_safety, e.registration_no], [2017, true, 'DK-NH-07']);
    await page.waitForFunction(() => (document.querySelector('.eq-head')?.textContent || '').includes('DK-NH-07'), null, { timeout: 15000 });
    const head = await page.textContent('.eq-head');
    assert.ok(head.includes('Năm đưa vào sử dụng') && head.includes('2017') && head.includes('Thiết bị nghiêm ngặt về an toàn'), head);
    // Báo cáo Thiết bị (02-01)
    await go(page, '#/reports');
    await page.waitForSelector('.rp-web');
    await page.click('[data-view="RPT_EQUIPMENT"]');
    await page.waitForSelector('#rp-paper .paper-tbl', { timeout: 15000 });
    const h1 = await heads(page);
    assert.deepEqual(h1.slice(1, 13), ['Mã thiết bị', 'Tên thiết bị', 'Loại', 'Model', 'Hãng', 'Số serial', 'Năm đưa vào sử dụng', 'Công suất (kW)', 'Khu vực',
      'Người phụ trách', 'Mức quan trọng', 'Thiết bị nghiêm ngặt (Có/Không)']);
    const cells = await page.evaluate(() => [...document.querySelectorAll('#rp-paper .paper-tbl tbody tr:first-child td')].map((t) => t.textContent.trim()));
    assert.equal(cells[7], '2017', 'năm không nhóm hàng nghìn');
    assert.equal(cells[8], '15');
    assert.ok(cells[12].startsWith('Có'), cells[12]);
    await page.screenshot({ path: path.join(SHOTS, 'd437-web-rpt-equipment.png'), fullPage: true });
    // Excel báo cáo: sheet Chi tiết có cột mới cùng thứ tự
    const [xl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#rp-acts [data-x="xlsx"]')]);
    const file = path.join(SHOTS, 'd437-rpt-equipment.xlsx');
    await xl.saveAs(file);
    const X = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.resolve('vendor/xlsx-0.20.3.full.min.js'), 'utf8'), X);
    const wb = X.XLSX.read(fs.readFileSync(file), { type: 'buffer' });
    const det = Array.from(wb.SheetNames).find((n) => n.startsWith('Chi tiết'));
    const aoa = Array.from(X.XLSX.utils.sheet_to_json(wb.Sheets[det], { header: 1, defval: '' }), (r) => Array.from(r));
    const ki = aoa.findIndex((r) => r.includes('in_service_year'));
    assert.ok(ki >= 0, JSON.stringify(aoa.slice(0, 4)));
    const ks = aoa[ki];
    assert.deepEqual(['in_service_year', 'power_kw', 'location', 'owner', 'criticality', 'strict_safety'].map((k) => ks.indexOf(k) - ks.indexOf('in_service_year')), [0, 1, 2, 3, 4, 5]);
    const dr = aoa.find((r) => r.includes('TB-NH'));
    assert.equal(String(dr[ks.indexOf('in_service_year')]), '2017');
    assert.equal(Number(dr[ks.indexOf('power_kw')]), 15);
    assert.ok(String(dr[ks.indexOf('strict_safety')]).startsWith('Có'));
    // Báo cáo Kiểm định (06-05)
    await page.click('[data-view="RPT_INSPECTIONS"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#rp-paper .paper-tbl thead th')].some((t) => t.textContent.includes('Đơn vị kiểm định')), null, { timeout: 15000 });
    const h2 = await heads(page);
    assert.deepEqual(h2.slice(1, 11), ['Mã thiết bị', 'Thiết bị', 'Số đăng ký thiết bị', 'Khu vực', 'Loại kiểm định', 'Ngày kiểm định', 'Hiệu lực đến',
      'Đơn vị kiểm định', 'Số chứng nhận', 'Tình trạng hồ sơ']);
    const txt = await page.textContent('#rp-paper .paper-tbl tbody');
    assert.ok(txt.includes('DK-NH-07') && txt.includes('Trung tâm Kiểm định KTAT 2'), txt);
    await page.screenshot({ path: path.join(SHOTS, 'd437-web-rpt-inspections.png'), fullPage: true });
    // Form nộp chứng nhận: ô "Đơn vị kiểm định"
    await go(page, `#/inspections/${req}/submit`);
    await page.waitForSelector('#f-vendor_id', { timeout: 15000 });
    assert.ok((await page.textContent('[data-field="vendor_id"]')).includes('Đơn vị kiểm định'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: thêm thiết bị mới có tick nghiêm ngặt; form không tràn ngang; hồ sơ hiện Có', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/equipment/new');
    await page.waitForSelector('#f-strict_safety');
    await page.fill('#f-name_vi', 'Bình khí nén 02');
    await page.fill('#f-in_service_year', '2021');
    await page.check('#f-strict_safety');
    await page.fill('#f-registration_no', '0012/KN');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd437-iphone-eq-form.png'), fullPage: true });
    await page.click('#fm-save');
    await page.waitForFunction(() => /#\/equipment\/[^/]+$/.test(location.hash.split('?')[0]) && !location.hash.includes('/new'), null, { timeout: 15000 });
    const e = env.rows('Equipment').find((x) => x.name_vi === 'Bình khí nén 02');
    assert.deepEqual([e.in_service_year, e.strict_safety, e.registration_no], [2021, true, '0012/KN']);
    await page.waitForSelector('.eq-head');
    await page.click('.eq-head details.more summary');
    const head = await page.textContent('.eq-head');
    assert.ok(head.includes('0012/KN') && /Thiết bị nghiêm ngặt về an toàn\s*·?\s*安全严格要求设备\s*Có/.test(head.replace(/\s+/g, ' ')), head);
    assert.ok(await noOverflow(page));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
