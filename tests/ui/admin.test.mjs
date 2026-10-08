// Quản trị (5.2): Người dùng và PIN tạm, Phân quyền, Danh mục chung, Sao lưu, Nhật ký, Trạng thái hệ thống
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
const viewText = (page) => page.textContent('.view');
async function pin(page) {
  await page.waitForSelector('.modal .pin-input');
  await page.fill('.modal .pin-input', OWNER_PIN);
  await page.locator('.modal-actions .btn.primary').last().click();
}
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };

test('web C4: thêm người dùng cấp 2 + vai trò → PIN tạm hiện một lần; cấp lại PIN; khóa có lý do', async () => {
  const env = freshServer();
  ownerClient(env);
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/account');
    await page.click('a[href="#/admin/users"]');
    await page.waitForSelector('#u-add', { timeout: 15000 });
    await page.click('#u-add');
    await page.fill('.modal #f-employee_code', 'nv-501');
    await page.fill('.modal #f-display_name', 'Trần Thị C');
    await page.selectOption('.modal #f-role_level', '2');
    await page.check('.modal [data-sub="HD_KD"]');
    await page.click('.modal [data-x="save"]');
    await pin(page);
    await page.waitForSelector('.modal .temp-pin', { timeout: 15000 });
    const shown = (await page.textContent('.modal .temp-pin')).trim();
    assert.match(shown, /^\d{6}$/);
    assert.ok((await page.textContent('.modal')).includes('chỉ hiện một lần'));
    await page.screenshot({ path: path.join(SHOTS, 'admin-temp-pin-web.png') });
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('NV-501'), null, { timeout: 15000 });
    const u = env.rows('Users').find((x) => x.employee_code === 'NV-501');
    assert.equal(u.role_level, 2);
    assert.equal(u.must_change_pin, true);
    assert.ok((await viewText(page)).includes('Phải đổi PIN'));
    // Cấp lại PIN tạm
    await page.click(`[data-act="reset"][data-id="${u.user_id}"]`);
    await page.locator('.modal-actions .btn.primary').last().click();
    await page.waitForSelector('.modal .temp-pin', { timeout: 15000 });
    const pin2 = (await page.textContent('.modal .temp-pin')).trim();
    assert.notEqual(pin2, shown);
    await page.click('.modal-actions .btn.primary');
    // Khóa: cần lý do
    await page.waitForSelector(`[data-act="lock"][data-id="${u.user_id}"]`);
    await page.click(`[data-act="lock"][data-id="${u.user_id}"]`);
    await page.fill('#ask-text', 'Nghỉ phép dài');
    await page.locator('.modal-actions .btn.primary').last().click();
    await page.waitForSelector(`[data-act="unlock"][data-id="${u.user_id}"]`, { timeout: 15000 });
    assert.equal(env.rows('Users').find((x) => x.employee_code === 'NV-501').active, false);
    await page.screenshot({ path: path.join(SHOTS, 'admin-users-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone C3: Người dùng chỉ xem (không nút sửa, không email); Nhật ký có thao tác nghiệp vụ, không có tab Đăng nhập', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  assert.equal(c.write('user.create', { user_id: uuid(), employee_code: 'NV-601', display_name: 'D', email: 'd@example.test', role_level: 1 }, { reauth_token: rt }).ok, true);
  assert.equal(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Quạt làm mát' }).ok, true);
  userClient(env, 'U-C3', 3, '694127');
  const app = await openApp({ env });
  try {
    const { page } = app;
    await login(page, 'U-C3', '694127');
    await go(page, '#/admin/users');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('NV-601'), null, { timeout: 15000 });
    assert.equal(await page.locator('#u-add, [data-act]').count(), 0);
    assert.ok(!(await viewText(page)).includes('d@example.test'));
    await go(page, '#/admin/audit');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('equipment.create'), null, { timeout: 15000 });
    const t = await viewText(page);
    assert.ok(!t.includes('user.create'));
    assert.equal(await page.locator('[data-tab="auth"]').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'admin-audit-iphone.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: Phân quyền hỏi PIN; ô khóa không đổi được; bật C/E kho vật tư cho cấp 2 + lý do → lưu, perm_version tăng', async () => {
  const env = freshServer();
  ownerClient(env);
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/admin/permissions');
    await pin(page);
    await page.waitForSelector('.tbl.perm', { timeout: 15000 });
    assert.ok((await viewText(page)).includes('Duyệt bảng quyền này trước khi nhập dữ liệu thật'));
    // Ô khóa (C4 users V): bấm không đổi
    await page.click('[data-cell="4|users"][data-f="V"]');
    assert.equal(await page.getAttribute('[data-cell="4|users"][data-f="V"]', 'aria-pressed'), 'true');
    assert.ok(await page.isDisabled('#p-save'));
    await page.click('[data-cell="2|warehouse"][data-f="C"]');
    await page.click('[data-cell="2|warehouse"][data-f="E"]');
    assert.ok((await page.textContent('#p-unsaved')).includes('Đã đổi 1 ô'));
    await page.click('#p-save');
    await page.fill('#ask-text', 'Cho thủ kho sửa danh mục');
    await page.locator('.modal-actions .btn.primary').last().click();
    await page.waitForFunction(() => !document.querySelector('#p-unsaved') || document.querySelector('#p-unsaved').textContent === '', null, { timeout: 15000 });
    const r = env.rows('RolePermissions').find((x) => x.permission_id === 'RP-2-warehouse');
    assert.equal(r.can_create, true);
    assert.equal(r.can_edit, true);
    assert.equal(env.rows('SystemState').find((x) => x.state_key === 'perm_version').value, '2');
    await page.screenshot({ path: path.join(SHOTS, 'admin-permissions-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web: Danh mục chung — C4 thêm khu vực (mã tự cấp) và thuật ngữ đã duyệt; HĐ chỉ sửa được nhà cung cấp', async () => {
  const env = freshServer();
  ownerClient(env);
  userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/admin/catalog');
    await page.waitForSelector('#cat-add', { timeout: 15000 });
    await page.click('#cat-add');
    await page.fill('.modal #f-name_vi', 'Xưởng cơ khí');
    await page.selectOption('.modal #f-type', 'WORKSHOP');
    await page.click('.modal [data-x="save"]');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('KV-001'), null, { timeout: 15000 });
    assert.equal(env.rows('Locations')[0].type, 'WORKSHOP');
    await page.click('[data-tab="glossary"]');
    await page.waitForSelector('#cat-add');
    await page.click('#cat-add');
    await page.fill('.modal #f-term_vi', 'Bình chịu áp lực');
    await page.fill('.modal #f-term_zh', '压力容器');
    await page.check('.modal #f-approve');
    await page.click('.modal [data-x="save"]');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('压力容器'), null, { timeout: 15000 });
    assert.ok((await viewText(page)).includes('Đã duyệt · 已审核'));
    assert.ok(env.rows('Glossary')[0].approved_by);
    await page.screenshot({ path: path.join(SHOTS, 'admin-catalog-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
  const app2 = await openApp({ env });
  try {
    const { page } = app2;
    await login(page, 'U-HD', '583019');
    await go(page, '#/account');
    await page.click('a[href="#/admin/catalog"]');
    await page.waitForSelector('[data-tab="locations"]', { timeout: 15000 });
    assert.equal(await page.locator('#cat-add, [data-edit]').count(), 0, 'HĐ không sửa khu vực');
    await page.click('[data-tab="vendors"]');
    await page.waitForSelector('#cat-add');
    await page.click('#cat-add');
    await page.fill('.modal #f-name', 'Công ty Bảo trì Thang máy');
    await page.fill('.modal #f-services_vi', 'Bảo trì thang máy');
    await page.click('.modal [data-x="save"]');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('NCC-0001'), null, { timeout: 15000 });
    assert.deepEqual(app2.consoleErrors, []);
  } finally { await app2.close(); }
});

test('web C4: Sao lưu ngay → QUEUED, màn tự hỏi lại tới khi có bản VERIFIED; Trạng thái hệ thống + sửa cấu hình có PIN', async () => {
  const env = freshServer();
  ownerClient(env);
  env.g.installTriggers();
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/admin/backup');
    await page.waitForSelector('#bk-run', { timeout: 15000 });
    await page.click('#bk-run');
    await pin(page);
    await page.waitForSelector('#bk-queued', { timeout: 15000 });
    // Trigger chạy một lần
    env.g.backupData();
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã kiểm chứng · 已校验'), null, { timeout: 20000 });
    assert.equal(await page.locator('#bk-queued').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'admin-backup-web.png'), fullPage: true });
    await go(page, '#/admin/status');
    await page.waitForSelector('.tbl.settings', { timeout: 15000 });
    const t = await viewText(page);
    assert.ok(t.includes('Trigger đã cài') && t.includes('Sao lưu gần nhất') && t.includes('Hạn mức Gmail còn lại'));
    assert.ok(t.includes('Chỉ đọc'), 'mốc A7 chỉ đọc');
    await page.click('[data-set="reauth_window_minutes"]');
    await page.fill('.modal #f-v', '10');
    await page.fill('.modal #f-r', 'Duyệt nhiều phiếu liền');
    await page.locator('.modal-actions .btn.primary').last().click();
    // PIN vừa nhập ở bước sao lưu còn hiệu lực (reauth_window_minutes) → không hỏi lại
    await page.waitForFunction(() => document.querySelector('.view') && [...document.querySelectorAll('.tbl.settings tr')].some((tr) => tr.textContent.includes('reauth_window_minutes') && tr.textContent.includes('10')), null, { timeout: 15000 });
    env.g.dbReset_();
    assert.equal(env.g.setting_('reauth_window_minutes'), 10);
    await page.screenshot({ path: path.join(SHOTS, 'admin-status-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
