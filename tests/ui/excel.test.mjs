// Nhập/xuất Excel (CM-03): xuất → sửa → nhập lại (UPDATE); lỗi theo dòng khóa nút Nhập; lô nhạy cảm HĐ gửi duyệt → C4 ghi có PIN
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { XLSX_FILE } from '../vendor/xlsx-sample.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

function loadXLSX() {
  const exports = {};
  vm.runInThisContext('(function (exports) {' + fs.readFileSync(XLSX_FILE, 'utf8') + '\n})', { filename: XLSX_FILE })(exports);
  return exports;
}
const X = loadXLSX();

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
async function pin(page) {
  await page.waitForSelector('.modal .pin-input');
  await page.fill('.modal .pin-input', OWNER_PIN);
  await page.locator('.modal-actions .btn.primary').last().click();
}
/** Tệp nhập dựng bằng SheetJS: {sheet: [keys, labels, ...rows]} */
function xlsxBuffer(sheets) {
  const wb = X.utils.book_new();
  Object.entries(sheets).forEach(([name, aoa]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), name));
  return Buffer.from(X.write(wb, { type: 'array', bookType: 'xlsx' }));
}
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };

test('web C4: xuất thiết bị (mã giữ số 0 dạng chữ, ngày là ô ngày dd/mm/yyyy, chuỗi "=" không thành công thức) → sửa model → nhập lại → cập nhật', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: id, equipment_code: '00123', name_vi: '=HYPERLINK("http://x")', model: 'P-100', install_date: '2025-03-15' }).ok, true);
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/equipment');
    await page.click('a[href="#/excel/equipment"]');
    await page.waitForSelector('#x-export', { timeout: 15000 });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#x-export')]);
    assert.match(dl.suggestedFilename(), /^ME_equipment_\d{8}\.xlsx$/);
    const file = path.join(SHOTS, 'export-equipment.xlsx');
    await dl.saveAs(file);
    const wb = X.read(fs.readFileSync(file), { type: 'buffer', cellNF: true });
    assert.deepEqual(wb.SheetNames.slice(0, 2), ['equipment', 'equipment_specs']);
    assert.ok(wb.SheetNames.includes('_meta'));
    const ws = wb.Sheets.equipment;
    const keys = X.utils.sheet_to_json(ws, { header: 1 })[0];
    const col = (k) => X.utils.encode_col(keys.indexOf(k));
    assert.equal(ws[col('equipment_code') + '3'].t, 's');
    assert.equal(ws[col('equipment_code') + '3'].v, '00123');
    assert.equal(ws[col('install_date') + '3'].t, 'n');
    assert.equal(ws[col('install_date') + '3'].z, 'dd\\/mm\\/yyyy');
    assert.equal(ws[col('name_vi') + '3'].t, 's');
    assert.equal(ws[col('name_vi') + '3'].f, undefined, 'không thành công thức');
    assert.ok(keys.includes('i18n_machine_fields'));
    // Sửa model rồi nhập lại
    ws[col('model') + '3'] = { t: 's', v: 'P-200' };
    const buf = Buffer.from(X.write(wb, { type: 'array', bookType: 'xlsx' }));
    await page.setInputFiles('#x-file', { name: 'thiet-bi.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf });
    await page.waitForSelector('#x-commit', { timeout: 20000 });
    const t = await page.textContent('.view');
    assert.ok(t.includes('Sẵn sàng nhập'), t.slice(0, 500));
    assert.ok(t.includes('P-100') && t.includes('P-200'), 'trước – sau');
    await page.click('#x-commit');
    await pin(page);
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã nhập · 已导入'), null, { timeout: 20000 });
    const e = env.rows('Equipment')[0];
    assert.equal(e.model, 'P-200');
    assert.equal(e.equipment_code, '00123');
    assert.equal(e.install_date, '2025-03-15');
    await page.screenshot({ path: path.join(SHOTS, 'excel-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: tệp lỗi (công thức, mã trùng) → bảng lỗi theo dòng, không có nút Nhập dữ liệu; hủy lô', async () => {
  const env = freshServer();
  ownerClient(env);
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/excel/locations');
    await page.waitForSelector('#x-file', { state: 'attached', timeout: 15000 });
    const wb = X.utils.book_new();
    const ws = X.utils.aoa_to_sheet([['location_id', 'location_code', 'name_vi', 'type'], ['ID', 'Mã', 'Tên', 'Loại'], ['', 'KV-A', 'Xưởng A', 'WORKSHOP'], ['', 'KV-A', 'Xưởng A trùng', ''], ['', 'KV-B', '', '']]);
    ws.C5 = { t: 'n', v: 3, f: '1+2' };
    X.utils.book_append_sheet(wb, ws, 'locations');
    await page.setInputFiles('#x-file', { name: 'khu-vuc.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(X.write(wb, { type: 'array', bookType: 'xlsx' })) });
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Cần sửa lỗi'), null, { timeout: 20000 });
    const t = await page.textContent('.view');
    assert.ok(t.includes('Mã đã được dùng') && t.includes('Ô có công thức'));
    assert.equal(await page.locator('#x-commit, #x-submit').count(), 0);
    const rows = await page.$$eval('.tbl tbody tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    assert.ok(rows.some((r) => r[1] === '4' && r[2] === 'location_code'));
    assert.ok(rows.some((r) => r[1] === '5' && r[2] === 'name_vi'));
    await page.click('#x-cancel');
    await page.locator('.modal-actions .btn.primary').last().click();
    await page.waitForFunction(() => !document.querySelector('#x-cancel'), null, { timeout: 15000 });
    assert.equal(env.rows('ImportBatches')[0].status, 'FAILED');
    assert.equal(env.rows('Locations').length, 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone HĐ: lô hợp đồng (nhạy cảm) → gửi duyệt; web C4 mở lô chờ duyệt → Nhập dữ liệu có PIN → hợp đồng HD-0001 kèm thiết bị', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  assert.equal(c.write('equipment.create', { equipment_id: uuid(), equipment_code: 'TB-DH1', name_vi: 'Điều hòa 1' }).ok, true);
  userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const buf = xlsxBuffer({
    contracts: [['contract_id', 'row_key', 'title_vi', 'end_date', 'renewal_notice_date', 'value'], ['', '', '', '', '', ''], ['', 'H1', 'Bảo trì điều hòa', '31/12/2026', '30/11/2026', 120000000]],
    contract_equipment: [['contract_equipment_id', 'contract_key', 'equipment_code', 'service_vi'], ['', '', '', ''], ['', 'H1', 'TB-DH1', 'Vệ sinh dàn lạnh']]
  });
  const app = await openApp({ env });
  try {
    const { page } = app;
    await login(page, 'U-HD', '583019');
    await go(page, '#/contracts');
    await page.click('a[href="#/excel/contracts"]');
    await page.waitForSelector('#x-file', { state: 'attached', timeout: 15000 });
    await page.setInputFiles('#x-file', { name: 'hop-dong.xlsx', mimeType: 'application/octet-stream', buffer: buf });
    await page.waitForSelector('#x-submit', { timeout: 20000 });
    const t = await page.textContent('.view');
    assert.ok(t.includes('Lô nhạy cảm'));
    assert.equal(await page.locator('#x-commit').count(), 0);
    await page.click('#x-submit');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Chờ duyệt · 待审核'), null, { timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS, 'excel-iphone.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
  const app2 = await openApp({ env, ...WEB });
  try {
    const { page } = app2;
    await login(page);
    await go(page, '#/excel/contracts');
    await page.waitForSelector('[data-batch]', { timeout: 15000 });
    await page.click('[data-batch]');
    await page.waitForSelector('#x-commit');
    await page.click('#x-commit');
    await pin(page);
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã nhập · 已导入'), null, { timeout: 20000 });
    const ct = env.rows('Contracts')[0];
    assert.equal(ct.contract_code, 'HD-0001');
    assert.equal(ct.value, 120000000);
    assert.equal(env.rows('ContractEquipment').length, 1);
    assert.deepEqual(app2.consoleErrors, []);
  } finally { await app2.close(); }
});
