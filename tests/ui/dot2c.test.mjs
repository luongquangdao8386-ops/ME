// Đợt 2 trên giao diện (tiếp): dòng "Bước tiếp" trên phiếu sửa/bảo trì (ai bấm gì), khung Xử lý khóa tới khi Bắt đầu sửa,
// link thẳng danh mục Nguyên nhân; KT sửa trên iPhone (Bắt đầu sửa → ghi xử lý mất mạng → Lưu → Gửi nghiệm thu) → C3 nghiệm thu đủ 6 mốc
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const queue = (page) => page.evaluate(async () => (await (await import('./js/sync.js')).queueItems()).map((o) => o.action));
const steps = (page) => page.$$eval('.next-step', (els) => els.map((e) => e.textContent));

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

async function waitQueueEmpty(page) {
  for (let i = 0; i < 80 && (await queue(page)).length > 0; i++) await page.waitForTimeout(400);
  assert.deepEqual(await queue(page), []);
}

/** Máy chủ có thiết bị, KT báo sự cố máy đang dừng (Mới báo) */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }).ok, true);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const rid = uuid();
  assert.equal(kt.write('repair.report', { repair_id: rid, equipment_id: eq, symptom_vi: 'Áp suất xả cao', severity: 'MEDIUM', machine_stopped: true }).ok, true);
  return { env, c, kt, ktId, eq, rid };
}

test('iPhone C4: phiếu sửa Mới báo có dòng "Bước tiếp: bấm Phân công", khung Xử lý ghi rõ còn khóa, "Tới nút" cuộn về nút; link danh mục Nguyên nhân mở đúng nhóm; phân công xong chuyển "Đang chờ … bấm Bắt đầu sửa"', async () => {
  const { env, ktId, rid } = setup();
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page } = app;
    await login(page);
    await go(page, `#/repairs/${rid}`);
    await page.waitForSelector('#rp-assign');
    let s = await steps(page);
    assert.equal(s.length, 2, 'đầu phiếu + cuối khung Xử lý');
    assert.ok(s[0].includes('Bước tiếp: bấm Phân công để chọn người sửa') && s[0].includes('下一步'));
    assert.ok(!s[0].includes('Tới nút'), 'nút Phân công ngay trên, không cần link');
    assert.ok((await page.textContent('#rp-exec')).includes('Các ô bên dưới mở khi bấm Bắt đầu sửa'));
    assert.equal(await page.locator('#rp-submit, #rp-save').count(), 0);
    assert.ok(await page.$eval('#f-diagnosis', (el) => el.disabled));
    // Cuối khung Xử lý (chỗ người dùng tìm nút gửi): dòng bước tiếp + "Tới nút" cuộn lên nút Phân công
    await page.click('#rp-exec .next-step [data-jump="rp-assign"]');
    await page.waitForFunction(() => document.querySelector('#rp-assign').classList.contains('flash'));
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'repair-next-step-iphone.png'), fullPage: true });
    // Chưa có danh mục Nguyên nhân: C4 bấm dòng gợi ý → Danh mục chung, tab Danh mục tra cứu, nhóm Nguyên nhân
    await page.click('[data-field="root_cause_code"] .hint a');
    await page.waitForSelector('[data-group="CAUSE"].on', { timeout: 15000 });
    assert.ok(await page.$eval('[data-tab="lookups"]', (b) => b.classList.contains('on')));
    assert.equal(await page.evaluate(() => location.hash), '#/admin/catalog');
    await page.click('[data-group="UNIT"]');
    await page.waitForSelector('[data-group="UNIT"].on');
    await page.goBack();
    await page.waitForSelector('#rp-assign', { timeout: 15000 });
    // Phân công cho KT → C4 thấy chờ KT bấm Bắt đầu sửa
    await page.click('#rp-assign');
    await page.waitForSelector('.modal #as-u');
    await page.selectOption('.modal #as-u', ktId);
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã phân công'), null, { timeout: 15000 });
    s = await steps(page);
    assert.ok(s[0].includes('Đang chờ') && s[0].includes('bấm Bắt đầu sửa'), s[0]);
    assert.equal(await page.$eval('.next-step', (el) => el.classList.contains('wait')), true);
    assert.equal(env.rows('Repairs')[0].status, 'ASSIGNED');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone KT: phiếu sửa được giao → Bắt đầu sửa → mất mạng ghi chẩn đoán, nguyên nhân, công việc, việc con Xong, Kết thúc sửa/Hoạt động lại "Bây giờ", chạy thử Đạt → Lưu → Gửi nghiệm thu → có mạng gửi đủ; C3 nghiệm thu PIN → 6 mốc', async () => {
  const { env, c, ktId, rid } = setup();
  assert.equal(c.write('lookup.edit', { value_id: uuid(), group_key: 'CAUSE', code: 'CO-01', name_vi: 'Van an toàn kẹt' }).ok, true);
  const r0 = env.rows('Repairs')[0];
  assert.equal(c.write('repair.assign', { repair_id: rid, assignee_user_id: ktId }, { expected_version: r0.record_version }).ok, true);
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page, context } = app;
    await login(page, 'U-KT', '583016');
    // Công việc → Của tôi: có phiếu SC
    await page.click('.bnav-item[data-nav="work"]');
    await page.waitForSelector('.group-title');
    await page.click(`a.rec-card[href="#/repairs/${rid}"]`);
    await page.waitForSelector('#rp-start');
    let s = await steps(page);
    assert.ok(s[0].includes('Bước tiếp: bấm Bắt đầu sửa để mở khung Xử lý'), s[0]);
    assert.ok(await page.$eval('#f-diagnosis', (el) => el.disabled));
    await page.click('#rp-start');
    await page.waitForSelector('#rp-submit', { timeout: 15000 });
    assert.equal(env.rows('Repairs')[0].status, 'IN_PROGRESS');
    // Đang sửa: bước tiếp chỉ xuống nút Gửi nghiệm thu
    s = await steps(page);
    assert.equal(s.length, 1);
    assert.ok(s[0].includes('Bước tiếp: ghi khung Xử lý') && s[0].includes('Tới nút'));
    assert.ok(!(await page.textContent('#rp-exec')).includes('Các ô bên dưới mở khi'));
    await page.click('.next-step [data-jump="rp-submit"]');
    await page.waitForFunction(() => document.querySelector('#rp-submit').classList.contains('flash'));
    // Mất mạng: ghi xử lý
    await context.setOffline(true);
    await page.fill('#f-diagnosis', 'Van an toàn kẹt, áp xả lên 9 bar');
    await page.dispatchEvent('#f-diagnosis', 'change');
    await page.waitForSelector('#rp-save:not([disabled])');
    await page.selectOption('#f-root_cause_code', 'CO-01');
    await page.waitForFunction(() => document.querySelector('#f-root_cause_code').value === 'CO-01');
    await page.fill('#f-action', 'Vệ sinh, chỉnh lại van an toàn');
    await page.dispatchEvent('#f-action', 'change');
    await page.waitForFunction(() => document.querySelector('#f-action').value.includes('chỉnh lại'));
    await page.click('#rp-task-add');
    await page.waitForSelector('.modal #tk-task');
    await page.fill('.modal #tk-task', 'Tháo van, vệ sinh');
    await page.click('.modal [data-x="save"]');
    await page.waitForSelector('.rp-task [data-tstat="DONE"]');
    await page.click('.rp-task [data-tstat="DONE"]');
    await page.waitForFunction(() => document.querySelector('.rp-task').textContent.includes('Xong'));
    await page.click('[data-now="repair_end_at"]');
    await page.waitForFunction(() => document.querySelector('#f-re').value !== '');
    await page.click('[data-test="PASS"]');
    await page.waitForSelector('[data-test="PASS"].on');
    await page.click('[data-now="restored_at"]');
    await page.waitForFunction(() => document.querySelector('#f-ra').value !== '');
    await page.waitForSelector('#rp-submit:not([disabled])');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'repair-process-iphone.png'), fullPage: true });
    await page.click('#rp-save');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Đã lưu trên máy'), null, { timeout: 15000 });
    await page.waitForSelector('#rp-submit:not([disabled])');
    await page.click('#rp-submit');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Chờ nghiệm thu'), null, { timeout: 15000 });
    s = await steps(page);
    assert.ok(s[0].includes('Đã lưu trên máy, tự gửi nghiệm thu khi có mạng'), s[0]);
    assert.deepEqual(await queue(page), ['repair.process', 'repair.submit']);
    assert.equal(env.rows('Repairs')[0].status, 'IN_PROGRESS');
    // Có mạng lại: gửi tuần tự
    await context.setOffline(false);
    await waitQueueEmpty(page);
    const r1 = env.rows('Repairs')[0];
    assert.equal(r1.status, 'PENDING_ACCEPTANCE');
    assert.equal(r1.root_cause_code, 'CO-01');
    assert.equal(r1.test_run_result, 'PASS');
    assert.ok(r1.diagnosis_vi.includes('Van an toàn kẹt'));
    assert.ok(r1.repair_end_at && r1.restored_at);
    const tasks = env.rows('RepairTasks').filter((t) => t.repair_id === rid);
    assert.deepEqual(tasks.map((t) => t.status), ['DONE']);
    // KT không tự nghiệm thu
    await page.waitForFunction(() => [...document.querySelectorAll('.next-step')].some((e) => e.textContent.includes('Đang chờ trưởng ca/quản lý nghiệm thu')), null, { timeout: 15000 });
    assert.equal(await page.locator('#rp-accept').count(), 0);
    // C3 nghiệm thu (máy khác) → Hoàn thành, đủ 6 mốc
    const c3 = userClient(env, 'U-C3', 3, '730194');
    const acc = c3.write('repair.accept', { repair_id: rid, decision: 'PASS' }, { expected_version: r1.record_version, reauth_token: c3.call('auth.reauth', { pin: '730194' }).data.reauth_token });
    assert.equal(acc.ok, true, JSON.stringify(acc));
    const r2 = env.rows('Repairs')[0];
    assert.equal(r2.status, 'COMPLETED');
    for (const k of ['reported_at', 'assigned_at', 'repair_start_at', 'repair_end_at', 'restored_at', 'approved_at']) assert.ok(r2[k], k);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.view') && document.querySelector('.view').textContent.includes('Hoàn thành · 已完成'), null, { timeout: 15000 });
    assert.equal(await page.locator('.next-step').count(), 0, 'phiếu xong không còn bước tiếp');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
