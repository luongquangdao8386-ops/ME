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

test('iPhone KT: phiếu đang sửa — chọn Nguyên nhân gốc, bấm "Bây giờ", chạy thử Đạt: trang vẽ lại nhưng giữ nguyên chỗ đang xem (không nhảy về đầu trang); phiếu bảo trì bấm Đạt/Không đạt cũng vậy', async () => {
  const { env, c, kt, ktId, eq, rid } = setup();
  assert.equal(c.write('lookup.edit', { value_id: uuid(), group_key: 'CAUSE', code: 'CO-01', name_vi: 'Van an toàn kẹt' }).ok, true);
  let r0 = env.rows('Repairs')[0];
  assert.equal(c.write('repair.assign', { repair_id: rid, assignee_user_id: ktId }, { expected_version: r0.record_version }).ok, true);
  r0 = env.rows('Repairs')[0];
  assert.equal(kt.write('repair.process', { repair_id: rid, repair_start_at: env.g.isoVN_(new env.clock.Date()) }, { expected_version: r0.record_version }).ok, true);
  // Phiếu bảo trì dài (8 bước) đang làm, giao KT
  const tpl = uuid();
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Kiểm tra máy nén', items: Array.from({ length: 8 }, (_, i) => ({ label_vi: `Bước kiểm tra ${i + 1}`, result_type: 'PASS_FAIL', required: true })) }).ok, true);
  const wo = uuid();
  assert.equal(c.write('maintenance.wo.create', { work_order_id: wo, equipment_id: eq, title_vi: 'Bảo dưỡng máy nén', assignee_user_id: ktId, checklist_template_id: tpl }).ok, true);
  assert.equal(kt.write('maintenance.execute', { work_order_id: wo, start_at: env.g.isoVN_(new env.clock.Date()) }, { expected_version: 1 }).ok, true);
  const app = await openApp({ env, ...IPHONE });
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const { page } = app;
  try {
    await login(page, 'U-KT', '583016');
    await go(page, `#/repairs/${rid}`);
    await page.waitForSelector('#rp-submit');
    // Cuộn tới ô Nguyên nhân gốc (giữa màn), chọn → vẽ lại (nút Lưu bật) mà vị trí cuộn không đổi
    await page.$eval('#f-root_cause_code', (el) => el.scrollIntoView({ block: 'center' }));
    const y0 = await scrollY();
    assert.ok(y0 > 300, `đã cuộn xuống (${y0})`);
    await page.selectOption('#f-root_cause_code', 'CO-01');
    await page.waitForSelector('#rp-save:not([disabled])');
    await page.waitForFunction(() => document.querySelector('#f-root_cause_code').value === 'CO-01');
    assert.ok(Math.abs((await scrollY()) - y0) <= 2, `giữ chỗ đang xem sau khi chọn nguyên nhân: ${y0} → ${await scrollY()}`);
    // Bây giờ (Kết thúc sửa)
    await page.$eval('[data-now="repair_end_at"]', (el) => el.scrollIntoView({ block: 'center' }));
    const y1 = await scrollY();
    await page.click('[data-now="repair_end_at"]');
    await page.waitForFunction(() => document.querySelector('#f-re').value !== '');
    assert.ok(Math.abs((await scrollY()) - y1) <= 2, `giữ chỗ sau Bây giờ: ${y1} → ${await scrollY()}`);
    // Chạy thử Đạt
    await page.$eval('[data-test="PASS"]', (el) => el.scrollIntoView({ block: 'center' }));
    const y2 = await scrollY();
    await page.click('[data-test="PASS"]');
    await page.waitForSelector('[data-test="PASS"].on');
    assert.ok(Math.abs((await scrollY()) - y2) <= 2, `giữ chỗ sau Chạy thử Đạt: ${y2} → ${await scrollY()}`);
    // Sang màn khác vẫn lên đầu trang
    await go(page, `#/maintenance/wo/${wo}`);
    await page.waitForSelector('#wo-submit');
    assert.equal(await scrollY(), 0, 'màn mới mở ở đầu trang');
    // Phiếu bảo trì: bấm Đạt ở bước cuối (cuối trang) → giữ chỗ
    const last = env.rows('WorkOrderResults').filter((x) => x.work_order_id === wo).sort((a, b) => b.step_no - a.step_no)[0];
    await page.$eval(`[data-res="${last.result_id}"][data-v="PASS"]`, (el) => el.scrollIntoView({ block: 'center' }));
    const y3 = await scrollY();
    assert.ok(y3 > 300, `đã cuộn xuống (${y3})`);
    await page.click(`[data-res="${last.result_id}"][data-v="PASS"]`);
    await page.waitForSelector(`[data-res="${last.result_id}"][data-v="PASS"].on`);
    await page.waitForSelector('#wo-save:not([disabled])');
    assert.ok(Math.abs((await scrollY()) - y3) <= 2, `giữ chỗ trên phiếu bảo trì: ${y3} → ${await scrollY()}`);
    // Bấm lại nút Công việc (màn khác) → đầu trang
    await page.click('.bnav-item[data-nav="work"]');
    await page.waitForSelector('.group-title');
    assert.equal(await scrollY(), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone KT: dưới nút Gửi nghiệm thu hiện từng mục còn thiếu (giờ kết thúc sửa, việc con có tên); bấm Xong, Bây giờ ngay trong danh sách → Gửi nghiệm thu sáng, gửi được', async () => {
  const { env, c, kt, ktId, rid } = setup();
  let r0 = env.rows('Repairs')[0];
  assert.equal(c.write('repair.assign', { repair_id: rid, assignee_user_id: ktId }, { expected_version: r0.record_version }).ok, true);
  r0 = env.rows('Repairs')[0];
  const task = uuid();
  const p1 = kt.write('repair.process', {
    repair_id: rid, repair_start_at: env.g.isoVN_(new env.clock.Date()), restored_at: env.g.isoVN_(new env.clock.Date()), test_run_result: 'PASS',
    tasks: [{ repair_task_id: task, task_vi: 'Bơm mỡ', result_vi: 'Tốt', assignee_user_id: ktId }]
  }, { expected_version: r0.record_version });
  assert.equal(p1.ok, true, JSON.stringify(p1));
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page } = app;
    await login(page, 'U-KT', '583016');
    await go(page, `#/repairs/${rid}`);
    await page.waitForSelector('#rp-submit');
    assert.ok(await page.$eval('#rp-submit', (b) => b.disabled));
    const box = await page.textContent('#rp-exec .issue-box');
    assert.ok(box.includes('Còn 2 mục chưa xong'), box);
    assert.ok(box.includes('Chưa có giờ kết thúc sửa'), box);
    assert.ok(box.includes('Việc con “Bơm mỡ” chưa xong: bấm Xong hoặc Bỏ'), box);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'repair-issues-iphone.png'), fullPage: true });
    // Bấm chữ của mục → tới ô Kết thúc sửa (nháy sáng)
    await page.click('.issue-box [data-goto="repair_end_at"]');
    await page.waitForFunction(() => document.querySelector('[data-field="repair_end_at"]').classList.contains('flash'));
    // Xong việc con ngay trong danh sách
    await page.click(`.issue-box [data-task-done="${task}"]`);
    await page.waitForFunction(() => /Còn 1 mục/.test((document.querySelector('#rp-left') || {}).textContent || ''));
    assert.ok((await page.textContent('.rp-task')).includes('Xong'));
    // Bây giờ cho Kết thúc sửa ngay trong danh sách → hết mục thiếu, nút Gửi nghiệm thu sáng
    await page.click('.issue-box [data-now="repair_end_at"]');
    await page.waitForSelector('#rp-submit:not([disabled])');
    assert.equal(await page.locator('.issue-box').count(), 0);
    assert.notEqual(await page.inputValue('#f-re'), '');
    await page.click('#rp-submit');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Chờ nghiệm thu'), null, { timeout: 15000 });
    for (let i = 0; i < 40 && env.rows('Repairs')[0].status !== 'PENDING_ACCEPTANCE'; i++) await page.waitForTimeout(250);
    const r1 = env.rows('Repairs')[0];
    assert.equal(r1.status, 'PENDING_ACCEPTANCE');
    assert.deepEqual(env.rows('RepairTasks').filter((t) => t.repair_id === rid).map((t) => t.status), ['DONE']);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone KT phiếu bảo trì (có mạng): danh sách mục còn thiếu dưới nút; ghi checklist + Bây giờ rồi bấm thẳng Gửi nghiệm thu (chưa bấm Lưu) → lưu rồi gửi theo phiên bản mới, không xung đột', async () => {
  const { env, c, kt, ktId, eq } = setup();
  const tpl = uuid();
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Kiểm tra nhanh', items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL', required: true }, { label_vi: 'Kiểm tra dây đai', result_type: 'PASS_FAIL', required: true }] }).ok, true);
  const wo = uuid();
  assert.equal(c.write('maintenance.wo.create', { work_order_id: wo, equipment_id: eq, title_vi: 'Bảo dưỡng nhanh', assignee_user_id: ktId, checklist_template_id: tpl }).ok, true);
  assert.equal(kt.write('maintenance.execute', { work_order_id: wo, start_at: env.g.isoVN_(new env.clock.Date()) }, { expected_version: 1 }).ok, true);
  const res = env.rows('WorkOrderResults').filter((x) => x.work_order_id === wo).sort((a, b) => a.step_no - b.step_no);
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page } = app;
    await login(page, 'U-KT', '583016');
    await go(page, `#/maintenance/wo/${wo}`);
    await page.waitForSelector('#wo-submit');
    const box = await page.textContent('#wo-exec .issue-box');
    assert.ok(box.includes('Còn 4 mục chưa xong') && box.includes('Bước 1: chưa có kết quả') && box.includes('Bước 2: chưa có kết quả') && box.includes('Chưa có giờ kết thúc'), box);
    await page.click('.issue-box [data-goto^="results["]');
    await page.waitForFunction((id) => document.querySelector(`#res-${id}`).classList.contains('flash'), res[0].result_id);
    for (const r of res) {
      await page.click(`[data-res="${r.result_id}"][data-v="PASS"]`);
      await page.waitForSelector(`[data-res="${r.result_id}"][data-v="PASS"].on`);
    }
    await page.click('[data-overall="PASS"]');
    await page.waitForSelector('[data-overall="PASS"].on');
    await page.click('.issue-box [data-now="end_at"]');
    await page.waitForSelector('#wo-submit:not([disabled])');
    assert.ok((await page.textContent('.view')).includes('Có thay đổi chưa lưu'));
    await page.click('#wo-submit');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Chờ nghiệm thu'), null, { timeout: 15000 });
    for (let i = 0; i < 40 && env.rows('WorkOrders').find((w) => w.work_order_id === wo).status !== 'PENDING_ACCEPTANCE'; i++) await page.waitForTimeout(250);
    const w1 = env.rows('WorkOrders').find((w) => w.work_order_id === wo);
    assert.equal(w1.status, 'PENDING_ACCEPTANCE');
    assert.equal(w1.overall_result, 'PASS');
    assert.ok(w1.end_at);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone KT: đổi nhiều ô liên tiếp thật nhanh trên phiếu sửa (nguyên nhân, công việc, chạy thử, Bây giờ) → màn cuối cùng có đủ, Lưu lên máy chủ đủ, không mất chữ vừa gõ', async () => {
  const { env, c, kt, ktId, rid } = setup();
  assert.equal(c.write('lookup.edit', { value_id: uuid(), group_key: 'CAUSE', code: 'CO-01', name_vi: 'Van an toàn kẹt' }).ok, true);
  let r0 = env.rows('Repairs')[0];
  assert.equal(c.write('repair.assign', { repair_id: rid, assignee_user_id: ktId }, { expected_version: r0.record_version }).ok, true);
  r0 = env.rows('Repairs')[0];
  assert.equal(kt.write('repair.process', { repair_id: rid, repair_start_at: env.g.isoVN_(new env.clock.Date()) }, { expected_version: r0.record_version }).ok, true);
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page } = app;
    await login(page, 'U-KT', '583016');
    await go(page, `#/repairs/${rid}`);
    await page.waitForSelector('#rp-submit');
    // Không chờ màn vẽ lại giữa các lần đổi (như người dùng bấm nhanh)
    await page.evaluate(() => {
      const fire = (el, ev) => el.dispatchEvent(new Event(ev, { bubbles: true }));
      const sel = document.querySelector('#f-root_cause_code'); sel.value = 'CO-01'; fire(sel, 'change');
      const act = document.querySelector('#f-action'); act.value = 'Thay gioăng van an toàn'; fire(act, 'change');
      const dg = document.querySelector('#f-diagnosis'); dg.value = 'Gioăng mòn'; fire(dg, 'change');
      document.querySelector('[data-test="PASS"]').click();
      document.querySelector('[data-now="repair_end_at"]').click();
    });
    await page.waitForFunction(() => document.querySelector('[data-test="PASS"].on') && document.querySelector('#f-re').value !== ''
      && document.querySelector('#f-action').value === 'Thay gioăng van an toàn' && document.querySelector('#f-diagnosis').value === 'Gioăng mòn'
      && document.querySelector('#f-root_cause_code').value === 'CO-01', null, { timeout: 15000 });
    await page.waitForTimeout(800);
    // Vẫn đủ sau khi mọi lần vẽ đã xong
    assert.equal(await page.inputValue('#f-action'), 'Thay gioăng van an toàn');
    assert.equal(await page.inputValue('#f-diagnosis'), 'Gioăng mòn');
    assert.equal(await page.inputValue('#f-root_cause_code'), 'CO-01');
    await page.click('#rp-save');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Đã lưu'), null, { timeout: 15000 });
    for (let i = 0; i < 40 && !env.rows('Repairs')[0].action_vi; i++) await page.waitForTimeout(250);
    const r1 = env.rows('Repairs')[0];
    assert.equal(r1.root_cause_code, 'CO-01');
    assert.equal(r1.action_vi, 'Thay gioăng van an toàn');
    assert.equal(r1.diagnosis_vi, 'Gioăng mòn');
    assert.equal(r1.test_run_result, 'PASS');
    assert.ok(r1.repair_end_at);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone KT: gõ ô này rồi chạm sang ô khác (phiếu sửa và phiếu bảo trì) → vẫn ở ô mới (bàn phím không tắt), chữ không mất; rời ô thì vẽ lại, Lưu lên máy chủ đủ', async () => {
  const { env, c, kt, ktId, eq, rid } = setup();
  let r0 = env.rows('Repairs')[0];
  assert.equal(c.write('repair.assign', { repair_id: rid, assignee_user_id: ktId }, { expected_version: r0.record_version }).ok, true);
  r0 = env.rows('Repairs')[0];
  assert.equal(kt.write('repair.process', { repair_id: rid, repair_start_at: env.g.isoVN_(new env.clock.Date()) }, { expected_version: r0.record_version }).ok, true);
  const tpl = uuid();
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Kiểm tra nhanh', items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL', required: true }, { label_vi: 'Kiểm tra dây đai', result_type: 'PASS_FAIL', required: true }] }).ok, true);
  const wo = uuid();
  assert.equal(c.write('maintenance.wo.create', { work_order_id: wo, equipment_id: eq, title_vi: 'Bảo dưỡng nhanh', assignee_user_id: ktId, checklist_template_id: tpl }).ok, true);
  assert.equal(kt.write('maintenance.execute', { work_order_id: wo, start_at: env.g.isoVN_(new env.clock.Date()) }, { expected_version: 1 }).ok, true);
  const res = env.rows('WorkOrderResults').filter((x) => x.work_order_id === wo).sort((a, b) => a.step_no - b.step_no);
  const app = await openApp({ env, ...IPHONE });
  const active = () => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
  const { page } = app;
  try {
    await login(page, 'U-KT', '583016');
    await go(page, `#/repairs/${rid}`);
    await page.waitForSelector('#rp-submit');
    await page.click('#f-diagnosis');
    await page.keyboard.type('Gioăng mòn');
    await page.click('#f-action');
    await page.keyboard.type('Thay gioăng');
    await page.waitForTimeout(1200);
    assert.equal(await active(), 'f-action', 'vẫn đang ở ô Công việc đã làm');
    assert.equal(await page.inputValue('#f-action'), 'Thay gioăng');
    assert.ok(!(await page.$eval('#rp-save', (b) => b.disabled)), 'nút Lưu đã bật');
    await page.click('#f-test_run_note');
    await page.keyboard.type('Chạy êm');
    await page.waitForTimeout(800);
    assert.equal(await active(), 'f-test_run_note');
    // Chạm ra ngoài (tiêu đề khung) → rời ô nhập → vẽ lại từ nháp, đủ cả 3 ô
    await page.click('#rp-exec h3');
    await page.waitForFunction(() => document.querySelector('#rp-dirty, .view') && document.querySelector('#f-test_run_note').value === 'Chạy êm' && !document.activeElement.matches('input, textarea, select'));
    await page.waitForTimeout(600);
    assert.equal(await page.inputValue('#f-diagnosis'), 'Gioăng mòn');
    assert.equal(await page.inputValue('#f-action'), 'Thay gioăng');
    assert.equal(await page.inputValue('#f-test_run_note'), 'Chạy êm');
    assert.ok((await page.textContent('.view')).includes('Có thay đổi chưa lưu'));
    await page.click('#rp-save');
    for (let i = 0; i < 40 && !env.rows('Repairs')[0].test_run_note_vi; i++) await page.waitForTimeout(250);
    const r1 = env.rows('Repairs')[0];
    assert.equal(r1.diagnosis_vi, 'Gioăng mòn');
    assert.equal(r1.action_vi, 'Thay gioăng');
    assert.equal(r1.test_run_note_vi, 'Chạy êm');
    // Phiếu bảo trì: ghi chú bước 1 → chạm ghi chú bước 2
    await go(page, `#/maintenance/wo/${wo}`);
    await page.waitForSelector('#wo-submit');
    await page.click(`[data-note="${res[0].result_id}"]`);
    await page.keyboard.type('Dầu đủ');
    await page.click(`[data-note="${res[1].result_id}"]`);
    await page.keyboard.type('Dây đai căng');
    await page.waitForTimeout(1200);
    assert.equal(await active(), `nt-${res[1].result_id}`);
    assert.equal(await page.inputValue(`[data-note="${res[1].result_id}"]`), 'Dây đai căng');
    await page.click('#wo-exec h3');
    await page.waitForTimeout(800);
    assert.equal(await page.inputValue(`[data-note="${res[0].result_id}"]`), 'Dầu đủ');
    assert.equal(await page.inputValue(`[data-note="${res[1].result_id}"]`), 'Dây đai căng');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web: phiếu sửa máy không dừng đã Hoàn thành → mốc Hoạt động lại ghi "Không dừng máy" (không phải "Chưa có"); phiếu có dừng máy thì vẫn "Chưa có" tới khi ghi giờ', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }).ok, true);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const c3 = userClient(env, 'U-C3', 3, '730194');
  const run = (rid, stopped) => {
    assert.equal(kt.write('repair.report', { repair_id: rid, equipment_id: eq, symptom_vi: 'Áp cao', severity: 'MEDIUM', machine_stopped: stopped }).ok, true);
    let r = env.rows('Repairs').find((x) => x.repair_id === rid);
    assert.equal(c.write('repair.assign', { repair_id: rid, assignee_user_id: ktId }, { expected_version: r.record_version }).ok, true);
    r = env.rows('Repairs').find((x) => x.repair_id === rid);
    const t0 = env.g.isoVN_(new env.clock.Date());
    const p = kt.write('repair.process', { repair_id: rid, repair_start_at: t0, repair_end_at: t0, test_run_result: 'PASS', ...(stopped ? { downtime_note: 'Chờ phụ tùng' } : {}) }, { expected_version: r.record_version });
    assert.equal(p.ok, true, JSON.stringify(p));
    const s = kt.write('repair.submit', { repair_id: rid }, { expected_version: p.record_version });
    assert.equal(s.ok, true, JSON.stringify(s));
    const a = c3.write('repair.accept', { repair_id: rid, decision: 'PASS' }, { expected_version: s.record_version, reauth_token: c3.call('auth.reauth', { pin: '730194' }).data.reauth_token });
    assert.equal(a.ok, true, JSON.stringify(a));
  };
  const noStop = uuid(), stop = uuid();
  run(noStop, false);
  run(stop, true);
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await login(page);
    await go(page, `#/repairs/${noStop}`);
    await page.waitForFunction(() => ((document.querySelector('.view') || {}).textContent || '').includes('Hoàn thành · 已完成'), null, { timeout: 15000 });
    assert.deepEqual(await page.$$eval('.timeline li', (els) => els.map((e) => e.className)), ['done', 'done', 'done', 'done', 'na', 'done']);
    assert.ok((await page.textContent('.timeline li.na')).includes('Không dừng máy · 未停机'));
    await go(page, `#/repairs/${stop}`);
    const code2 = env.rows('Repairs').find((x) => x.repair_id === stop).repair_code;
    await page.waitForFunction((cd) => ((document.querySelector('.code.big') || {}).textContent || '') === cd, code2, { timeout: 15000 });
    assert.deepEqual(await page.$$eval('.timeline li', (els) => els.map((e) => e.className)), ['done', 'done', 'done', 'done', 'todo', 'done']);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
