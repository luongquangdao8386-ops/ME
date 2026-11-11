// d4.35: Quản trị → Kết nối app ISO (bảng mã biểu ISO → nguồn ngày có hồ sơ, xem trước, lưu có PIN); ô Mã biểu mẫu ISO ở mẫu checklist;
// Trạng thái hệ thống dẫn sang trang; C3 không có mục; 1440×900 và 390×844
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

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
async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const setting = (env, k) => JSON.parse(env.rows('Settings').find((s) => s.setting_key === k).value);

/** Owner + C3 + KT; một phiếu bảo trì đã nghiệm thu dùng checklist mang mã BM-CĐ-03-03a */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const eq = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }));
  const tpl = uuid();
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén', form_code: 'BM-CĐ-03-03a', items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL' }] }));
  const plan = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eq, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: env.g.todayVN_(), checklist_template_id: tpl, assignee_user_id: ktId }));
  const w = env.rows('WorkOrders').find((x) => x.plan_id === plan);
  const ver = () => env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id).record_version;
  const res = env.rows('WorkOrderResults').filter((r) => r.work_order_id === w.work_order_id).map((r) => ({ result_id: r.result_id, result_status: 'PASS' }));
  const at = (m) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + m * 60000));
  ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: at(-60) }, { expected_version: 1 }));
  ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, end_at: at(-5), overall_result: 'PASS', results: res }, { expected_version: ver() }));
  ok(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: ver() }));
  const rt = c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  ok(c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: ver(), reauth_token: rt }));
  return { env, c, tpl };
}

test('web C4: Kết nối app ISO — chưa có mã kết nối báo cách tạo; bảng mặc định 15 dòng; mã checklist có số ngày; đổi nguồn + thêm dòng → Xem trước → Lưu (PIN)', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/account');
    await page.waitForSelector('a[href="#/admin/iso-map"]');
    await go(page, '#/admin/status');
    await page.waitForSelector('.tbl.settings a[href="#/admin/iso-map"]', { timeout: 15000 });
    assert.ok((await page.textContent('.tbl:not(.settings)')).includes('Kết nối app ISO'), 'dòng iso_feed có nhãn');
    await go(page, '#/admin/iso-map');
    await page.waitForSelector('.iso-map tbody tr', { timeout: 15000 });
    assert.ok((await page.getAttribute('#iso-key', 'class')).includes('warn'));
    assert.ok((await page.textContent('#iso-key')).includes('adminCreateFeedKeyIso'));
    assert.equal(await page.locator('.iso-map tbody tr').count(), 15);
    const row = (code) => page.locator('.iso-map tbody tr', { has: page.locator(`input[value="${code}"]`) });
    assert.equal(await row('BM-CĐ-04-03').locator('select[data-f="src"]').inputValue(), 'REPAIR_COMPLETED');
    assert.equal(await row('BM-CĐ-06-01').locator('input[data-f="arg"]').inputValue(), 'Hiệu chuẩn,校准');
    assert.ok((await row('BM-CĐ-02-01').locator('.iso-stat').textContent()).includes('1 ngày'), 'thiết bị tạo hôm nay');
    assert.ok((await row('BM-CĐ-03-03').locator('.iso-stat').textContent()).includes('Chưa có hồ sơ'), 'phiếu BT tính cho mã checklist');
    assert.ok((await page.textContent('#iso-cl')).includes('BM-CĐ-03-03a'));
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd435-web-iso-map.png'), fullPage: true });
    // Sổ dừng máy lấy theo ngày máy dừng; thêm dòng mã mới
    await row('BM-CĐ-04-03').locator('select[data-f="src"]').selectOption('REPAIR_DOWNTIME');
    await page.click('#iso-add');
    const inputs = page.locator('[data-f="code"]');
    await inputs.last().fill('BM-CĐ-14-02');
    await page.locator('select[data-f="src"]').last().selectOption('REPORT_SAVED');
    await page.locator('input[data-f="arg"]').last().fill('RPT_EQUIPMENT');
    await page.click('#iso-preview');
    await page.waitForSelector('#iso-draft', { timeout: 15000 });
    assert.equal(await inputs.last().inputValue(), 'BM-CĐ-14-02', 'giữ dòng đang sửa sau khi xem trước');
    // Mã trùng → báo lỗi, không lưu
    await inputs.last().fill('BM-CĐ-04-03');
    await page.click('#iso-save');
    assert.ok((await page.textContent('#iso-err')).includes('BM-CĐ-04-03'));
    await inputs.last().fill('BM-CĐ-14-02');
    await page.fill('#iso-reason', 'Nối app ISO');
    await page.click('#iso-save');
    await page.waitForSelector('.modal .pin-input');
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#iso-draft') && document.querySelectorAll('.iso-map tbody tr').length === 16, null, { timeout: 15000 });
    const m = setting(env, 'iso_form_map');
    assert.equal(m['BM-CĐ-04-03'], 'REPAIR_DOWNTIME');
    assert.equal(m['BM-CĐ-14-02'], 'REPORT_SAVED:RPT_EQUIPMENT');
    assert.equal(Object.keys(m).length, 16);
    // Có mã kết nối → báo xanh
    env.g.adminCreateFeedKeyIso();
    await page.reload();
    await page.waitForSelector('#iso-key', { timeout: 15000 });
    assert.ok((await page.getAttribute('#iso-key', 'class')).includes('ok'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone C4: ô Mã biểu mẫu ISO ở mẫu checklist (giữ mã khi sửa, đổi mã → phiên bản mới); trang Kết nối app ISO không tràn ngang; C3 không có mục', async () => {
  const { env, tpl } = setup();
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/maintenance/checklists');
    await page.waitForSelector('.cl-fc');
    assert.equal((await page.textContent('.cl-fc')).trim(), 'BM-CĐ-03-03a');
    await go(page, `#/maintenance/checklists/${tpl}`);
    await page.waitForSelector('#cl-form-code');
    assert.equal(await page.inputValue('#cl-form-code'), 'BM-CĐ-03-03a');
    await page.fill('#cl-form-code', ' BM-CĐ-03-03b ');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd435-iphone-checklist-code.png'), fullPage: true });
    await page.click('#fm-save');
    await page.waitForFunction(() => location.hash === '#/maintenance/checklists', null, { timeout: 15000 });
    const rev2 = env.rows('ChecklistTemplates').filter((r) => r.template_id === tpl && r.revision === 2);
    assert.ok(rev2.length && rev2.every((r) => r.form_code === 'BM-CĐ-03-03b'));
    // Mẫu mới
    await go(page, '#/maintenance/checklists/new');
    await page.waitForSelector('#cl-form-code');
    await page.fill('[name="template_name_vi"], #f-template_name_vi', 'Bảo dưỡng chiller');
    await page.fill('.cl-step [data-k="label_vi"]', 'Kiểm tra áp suất');
    await page.fill('#cl-form-code', 'BM-CĐ-03-03c');
    await page.click('#fm-save');
    await page.waitForFunction(() => location.hash === '#/maintenance/checklists', null, { timeout: 15000 });
    assert.ok(env.rows('ChecklistTemplates').some((r) => r.template_name_vi === 'Bảo dưỡng chiller' && r.form_code === 'BM-CĐ-03-03c'));
    await go(page, '#/admin/iso-map');
    await page.waitForSelector('.iso-map tbody tr', { timeout: 15000 });
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd435-iphone-iso-map.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
  // C3: không có mục Kết nối app ISO
  const app2 = await openApp({ env, ...IPHONE });
  try {
    await login(app2.page, 'U-C3', '694127');
    await go(app2.page, '#/account');
    await app2.page.waitForSelector('.card h2');
    await app2.page.waitForTimeout(300);
    assert.equal(await app2.page.locator('a[href="#/admin/iso-map"]').count(), 0);
  } finally { await app2.close(); }
});
