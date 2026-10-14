// Đợt 2 trên giao diện (tiếp): biểu mẫu mẫu checklist + kế hoạch (web C4), vật tư trên phiếu MAT-03 và Thay linh kiện (iPhone KT)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const viewText = (page) => page.evaluate(() => (document.querySelector('.view') || {}).textContent || '');

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

test('web C4: tạo mẫu checklist 2 bước (có số đo) → tạo kế hoạch tháng giao KT, hạn hôm nay → sinh phiếu BT ngay; ngừng kế hoạch có lý do', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Quạt hút 02' }).ok, true);
  userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/maintenance/checklists/new');
    await page.waitForSelector('#f-template_name_vi');
    await page.fill('#f-template_name_vi', 'Kiểm tra quạt hút');
    await page.fill('.cl-step [data-k="label_vi"]', 'Vệ sinh cánh quạt');
    await page.click('#cl-add');
    const row2 = page.locator('.cl-step').nth(1);
    await row2.locator('[data-k="label_vi"]').fill('Dòng điện động cơ');
    await row2.locator('[data-k="result_type"]').selectOption('NUMBER');
    await row2.locator('[data-k="unit"]').fill('A');
    await row2.locator('[data-k="min_value"]').fill('2');
    await row2.locator('[data-k="max_value"]').fill('4,5');
    assert.ok(await noOverflow(page));
    await page.click('#fm-save');
    await page.waitForFunction(() => location.hash === '#/maintenance/checklists', null, { timeout: 15000 });
    const items = env.rows('ChecklistTemplates');
    assert.equal(items.length, 2);
    assert.equal(items.find((x) => x.step_no === 2).max_value, 4.5);
    assert.equal(items.find((x) => x.step_no === 2).unit, 'A');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Kiểm tra quạt hút'));
    // Kế hoạch: tháng, ngày mốc hôm nay, checklist vừa tạo, người làm mặc định KT
    await go(page, '#/maintenance/plans/new');
    await page.waitForSelector('#f-interval_type');
    await page.selectOption('#f-equipment_id', eq);
    await page.fill('#f-title_vi', 'Bảo dưỡng quạt hằng tháng');
    await page.fill('#f-interval_value', '1');
    const today = env.g.todayVN_();
    await page.fill('#f-anchor_date', `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`);
    await page.selectOption('#f-checklist_template_id', items[0].template_id);
    await page.selectOption('#f-assignee_user_id', ktId);
    await page.click('#fm-save');
    await page.waitForFunction(() => /#\/maintenance\/plans\/[0-9a-f-]{36}$/.test(location.hash), null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Đã sinh phiếu'));
    const plan = env.rows('MaintenancePlans')[0];
    assert.equal(plan.plan_code, 'KH-0001');
    assert.equal(plan.assignee_user_id, ktId);
    const wo = env.rows('WorkOrders')[0];
    assert.equal(wo.plan_id, plan.plan_id);
    assert.equal(wo.status, 'ASSIGNED');
    assert.equal(env.rows('WorkOrderResults').filter((r) => r.work_order_id === wo.work_order_id).length, 2);
    await page.waitForFunction((code) => document.querySelector('.view').textContent.includes(code), wo.work_order_code);
    await page.screenshot({ path: path.join(SHOTS, 'plan-web.png'), fullPage: true });
    // Ngừng kế hoạch: bắt lý do
    await page.click('#pl-stop');
    await page.waitForSelector('.modal #pr');
    await page.fill('.modal #pr', 'Quạt thay mới, chờ lịch hãng');
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã ngừng · 已停用'), null, { timeout: 15000 });
    assert.equal(env.rows('MaintenancePlans')[0].active, false);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone KT: trên phiếu đang làm — đề nghị vật tư (lưu nháp → gửi duyệt), ghi thực dùng, Thay linh kiện (không trừ tồn); C4 duyệt → app hiện Đã duyệt', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid(), bearing = uuid(), grease = uuid(), link = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Bơm nước 01' }).ok, true);
  assert.equal(c.write('material.create', { material_id: bearing, name_vi: 'Vòng bi 6205', base_unit: 'cái', is_equipment_component: true }).ok, true);
  assert.equal(c.write('material.create', { material_id: grease, name_vi: 'Mỡ bôi trơn', base_unit: 'kg', is_equipment_component: false }).ok, true);
  assert.equal(c.write('part.link', { equipment_part_id: link, equipment_id: eq, material_id: bearing, installed_qty: 2 }).ok, true);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const wo = uuid();
  assert.equal(c.write('maintenance.wo.create', { work_order_id: wo, equipment_id: eq, title_vi: 'Bảo dưỡng bơm', assignee_user_id: ktId }).ok, true);
  const start = env.g.isoVN_(new env.clock.Date(env.clock.Date.now() - 30 * 60000));
  assert.equal(kt.write('maintenance.execute', { work_order_id: wo, start_at: start }, { expected_version: 1 }).ok, true);
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page } = app;
    await login(page, 'U-KT', '583016');
    await go(page, `#/maintenance/wo/${wo}`);
    await page.waitForSelector('#wm-req-new');
    // Đề nghị vật tư: linh kiện của máy lên đầu danh sách
    await page.click('#wm-req-new');
    await page.waitForSelector('.modal .ml-sel');
    assert.ok((await page.textContent('.modal .ml-sel optgroup')).includes('Vòng bi 6205'));
    await page.selectOption('.modal .ml-sel', bearing);
    await page.waitForFunction(() => document.querySelector('.modal .ml-unit').textContent === 'cái');
    await page.fill('.modal [data-k="requested_qty"]', '2');
    assert.ok(await noOverflow(page));
    await page.click('.modal [data-x="save"]');
    await page.waitForFunction(() => /DN-\d{4}-001/.test(document.querySelector('#wm-card').textContent), null, { timeout: 15000 });
    const req = env.rows('MaterialRequests')[0];
    assert.equal(req.status, 'DRAFT');
    await page.click(`[data-req-submit="${req.request_id}"]`);
    await page.waitForFunction(() => document.querySelector('#wm-card').textContent.includes('Chờ duyệt'), null, { timeout: 15000 });
    assert.equal(env.rows('MaterialRequests')[0].status, 'PENDING_APPROVAL');
    // Ghi thực dùng: 0,5 kg mỡ
    await page.click('#wm-use-new');
    await page.waitForSelector('.modal .ml-sel');
    await page.selectOption('.modal .ml-sel', grease);
    await page.fill('.modal [data-k="actual_used_qty"]', '0,5');
    await page.click('.modal [data-x="save"]');
    await page.waitForFunction(() => document.querySelector('#wm-card').textContent.includes('Chờ xác nhận'), null, { timeout: 15000 });
    const u = env.rows('MaterialUsageLines')[0];
    assert.equal(u.actual_used_qty, 0.5);
    assert.equal(u.unit, 'kg');
    assert.equal(u.status, 'PENDING_CONFIRMATION');
    // Thay linh kiện cùng mã trên phiếu
    await page.click('#wo-replace');
    await page.waitForSelector('.modal #pr-part');
    assert.ok((await page.textContent('.modal')).includes('không trừ tồn'));
    await page.fill('.modal #pr-qty', '1');
    await page.click('.modal [data-x="save"]');
    await page.waitForFunction(() => !document.querySelector('.modal'), null, { timeout: 15000 });
    const ev = env.rows('EquipmentPartEvents').filter((e) => e.event_type === 'REPLACED');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].work_id, wo);
    assert.equal(ev[0].work_type, 'WORK_ORDER');
    assert.equal(ev[0].equipment_part_id, link);
    await page.screenshot({ path: path.join(SHOTS, 'wo-materials-iphone.png'), fullPage: true });
    // C4 duyệt đề nghị (máy khác) → app hiện Đã duyệt, kèm "Chưa kết nối kho"
    const r1 = env.rows('MaterialRequests')[0];
    const a = c.write('matreq.approve', { request_id: r1.request_id, decision: 'APPROVE' }, { expected_version: r1.record_version, reauth_token: c.reauth() });
    assert.equal(a.ok, true, JSON.stringify(a));
    await page.reload();
    await page.waitForFunction(() => ((document.querySelector('#wm-card') || {}).textContent || '').includes('Đã duyệt'), null, { timeout: 15000 });
    assert.ok((await viewText(page)).includes('Chưa kết nối kho'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
