// Hợp đồng: tạo kèm thiết bị (web), hai mốc hạn hiển thị riêng (C10), dự thảo gia hạn → duyệt có PIN (NT1-93), C1 không thấy giá (NT1-21)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);

test('web: tạo hợp đồng kèm thiết bị và ngày dịch vụ; hồ sơ hiện riêng Ngày hết hạn và Hạn báo gia hạn (đánh dấu mốc đang nhắc)', async () => {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  const eq = env.rows('Equipment')[0];
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/contracts/new');
    await page.waitForSelector('#f-title_vi');
    await page.fill('#f-title_vi', 'Bảo trì máy nén khí');
    await page.fill('#f-contract_number', 'HĐ-01/2026');
    await page.fill('#f-start_date', '01/01/2026');
    await page.fill('#f-end_date', '31/12/2026');
    await page.fill('#f-renewal_notice_date', '30/11/2026');
    await page.fill('#f-value', '120000000');
    await page.selectOption('#ce-add', eq.equipment_id);
    await page.fill('.ce-row [data-k="service"]', 'Bảo dưỡng định kỳ');
    await page.dispatchEvent('.ce-row [data-k="service"]', 'change');
    await page.fill('.ce-row [data-k="interval_value"]', '3');
    await page.dispatchEvent('.ce-row [data-k="interval_value"]', 'change');
    await page.fill('.ce-row [data-k="next_service_date"]', '2026-11-15');
    await page.dispatchEvent('.ce-row [data-k="next_service_date"]', 'change');
    await page.click('#fm-save');
    await page.waitForSelector('.code.big', { timeout: 15000 });
    const c = env.rows('Contracts')[0];
    assert.equal(c.contract_code, 'HD-0001');
    assert.equal(c.value, 120000000);
    assert.equal(c.renewal_notice_date, '2026-11-30');
    assert.equal(env.rows('ContractEquipment')[0].interval_value, 3);
    assert.equal(env.rows('ContractServices')[0].due_date, '2026-11-15');
    const txt = await page.textContent('.view');
    assert.ok(txt.includes('Ngày hết hạn · 到期日') && txt.includes('31/12/2026'));
    assert.ok(txt.includes('Hạn báo gia hạn · 续约通知期限') && txt.includes('30/11/2026'));
    assert.ok(txt.includes('đang nhắc · 本次提醒'), txt.slice(0, 600));
    assert.ok(txt.includes('120 000 000 VND'));
    await page.screenshot({ path: path.join(SHOTS, 'contract-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone C1: thấy hợp đồng nhưng không thấy giá trị; không có nút sửa/gia hạn', async () => {
  const env = freshServer();
  const owner = ownerClient(env);
  env.g.pocSeedSampleData();
  const id = uuid();
  assert.equal(owner.write('contract.create', { contract_id: id, title_vi: 'Bảo trì điều hòa', end_date: '2026-12-31', value: 99000000 }).ok, true);
  userClient(env, 'U-C1', 1, '482915');
  const app = await openApp({ env });
  try {
    const { page } = app;
    await login(page, 'U-C1', '482915');
    await go(page, `#/contracts/${id}`);
    await page.waitForSelector('.code.big');
    const txt = await page.textContent('.view');
    assert.ok(!txt.includes('99') && txt.includes('Không có quyền xem giá · 无权查看价格'));
    assert.equal(await page.locator('#co-renew, #co-terms, #co-close').count(), 0);
    const stored = await page.evaluate(async () => JSON.stringify(await (await import('./js/sync.js')).getRecords('CONTRACT')));
    assert.ok(!stored.includes('99000000'), 'IndexedDB không chứa giá (NT1-21)');
  } finally { await app.close(); }
});

test('gia hạn: HĐ tạo dự thảo và gửi duyệt (giữ hạn cũ); C4 duyệt có PIN → phiên mới hiện hành', async () => {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const id = uuid();
  assert.equal(hd.write('contract.create', { contract_id: id, title_vi: 'Bảo trì lò hơi', start_date: '2026-01-01', end_date: '2026-12-31', value: 50000000 }).ok, true);
  const d = uuid();
  assert.equal(hd.write('contract.renewal.create', { contract_id: d, previous_contract_id: id, start_date: '2027-01-01', end_date: '2027-12-31' }).ok, true);
  assert.equal(hd.write('contract.renewal.submit', { contract_id: d }, { expected_version: 1 }).ok, true);
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await login(page);
    await go(page, `#/contracts/${id}`);
    await page.waitForSelector('.code.big');
    assert.ok((await page.textContent('.view')).includes('Dự thảo gia hạn'));
    await go(page, `#/contracts/${d}`);
    await page.waitForSelector('#co-appr');
    assert.ok((await page.textContent('.view')).includes('Dự thảo không đổi hạn hiện hành'));
    await page.click('#co-appr');
    await page.waitForSelector('.modal .pin-input');
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.click('.modal-actions .btn.primary');
    // Chờ máy chủ ghi xong (màn dự thảo có sẵn chữ "Đang hiệu lực" của phiên cũ nên không dựa vào chữ)
    await page.waitForSelector('#co-appr', { state: 'detached', timeout: 15000 });
    for (let i = 0; i < 50 && env.rows('Contracts').find((x) => x.contract_id === d).lifecycle_status !== 'ACTIVE'; i++) await page.waitForTimeout(200);
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đang hiệu lực · 生效中'), null, { timeout: 15000 });
    const rows = env.rows('Contracts');
    assert.equal(rows.find((x) => x.contract_id === id).lifecycle_status, 'SUPERSEDED');
    assert.equal(rows.find((x) => x.contract_id === d).lifecycle_status, 'ACTIVE');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
