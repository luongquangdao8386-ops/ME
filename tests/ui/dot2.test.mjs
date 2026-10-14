// Đợt 2 trên giao diện: Công việc, phiếu bảo trì offline (C7, C8, 5.1.1), mục Không đạt → phiếu sửa, báo sự cố offline
// kèm ảnh không tạo trùng, phân công + nghiệm thu có PIN, 6 mốc (C9), không tự nghiệm thu (390×844 và 1440×900)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import zlib from 'node:zlib';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const queue = (page) => page.evaluate(async () => (await (await import('./js/sync.js')).queueItems()).map((o) => ({ a: o.action, id: o.entity_id, parent: o.parent_id, state: o.state })));

/** PNG đơn sắc hợp lệ (để trình duyệt giải mã và thu nhỏ) */
function png(w = 32, h = 24, rgb = [200, 60, 40]) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

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

/** Máy chủ có thiết bị, mẫu checklist 3 bước, kế hoạch tháng giao cho KT → phiếu BT hạn hôm nay (đã giao việc) */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }).ok, true);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const tpl = uuid();
  assert.equal(c.write('maintenance.checklist.edit', {
    template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén',
    items: [
      { label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL', required: true },
      { label_vi: 'Áp suất xả', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8, required: true },
      { label_vi: 'Ghi chú tiếng ồn', result_type: 'TEXT', required: false, safety_note_vi: 'Ngắt điện trước khi mở nắp' }
    ]
  }).ok, true);
  const today = env.g.todayVN_();
  const plan = uuid();
  assert.equal(c.write('maintenance.plan.edit', {
    plan_id: plan, equipment_id: eq, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1,
    anchor_date: today, checklist_template_id: tpl, assignee_user_id: ktId, priority: 'HIGH'
  }).ok, true);
  const wo = env.rows('WorkOrders').find((w) => w.plan_id === plan);
  assert.equal(wo.status, 'ASSIGNED');
  return { env, c, kt, ktId, eq, tpl, plan, wo, today };
}

test('iPhone KT: Công việc → phiếu bảo trì; mất mạng vẫn ghi checklist, "Còn N mục chưa xong" cuộn tới mục thiếu (C8), mục Không đạt bắt Kết quả chung Không đạt (C7); có mạng lại gửi tuần tự, tạo đúng 1 phiếu sửa', async () => {
  const ctx = setup();
  const { env, wo } = ctx;
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page, context } = app;
    await login(page, 'U-KT', '583016');
    // Lưới: Bảo trì, Sửa chữa đã mở; ô Bảo trì hiện số phiếu đang mở
    assert.ok((await page.textContent('.grid9 a.tile[href="#/maintenance"]')).includes('1 đang mở'));
    await page.click('.bnav-item[data-nav="work"]');
    await page.waitForSelector('.group-title');
    const wk = await page.textContent('.view');
    assert.ok(wk.includes('Hôm nay · 今天') && wk.includes(wo.work_order_code) && wk.includes('Máy nén khí 01'));
    assert.ok(await page.$eval('[data-scope="MINE"]', (b) => b.classList.contains('on')), 'cấp 2 mặc định Của tôi');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'work-iphone.png'), fullPage: true });
    await page.click(`a.rec-card[href="#/maintenance/wo/${wo.work_order_id}"]`);
    await page.waitForSelector('#wo-start');
    // Chưa bắt đầu: không ghi kết quả được
    assert.ok(await page.$eval('[data-v="PASS"]', (b) => b.disabled));
    await page.click('#wo-start');
    await page.waitForSelector('#wo-submit', { timeout: 15000 });
    assert.equal(env.rows('WorkOrders').find((w) => w.work_order_id === wo.work_order_id).status, 'IN_PROGRESS');
    const res = env.rows('WorkOrderResults').filter((r) => r.work_order_id === wo.work_order_id).sort((a, b) => a.step_no - b.step_no);
    // Mất mạng: ghi kết quả vẫn được (lưu nháp form trên máy)
    await context.setOffline(true);
    await page.click(`[data-res="${res[0].result_id}"][data-v="PASS"]`);
    await page.waitForSelector(`[data-res="${res[0].result_id}"][data-v="PASS"].on`);
    // Số đo ngoài giới hạn → tự Không đạt, Kết quả chung Không đạt (C7); nút Đạt chung bị khóa
    await page.fill(`[data-mv="${res[1].result_id}"]`, '9,5');
    // Chưa rời ô (iPhone không có nút Xong): vẫn báo ngay Không đạt, ngoài giới hạn, ô vẫn đang nhập
    await page.waitForSelector(`[data-res="${res[1].result_id}"][data-v="FAIL"].on`);
    assert.ok(await page.$eval(`#res-${res[1].result_id} .mv-out`, (el) => !el.hidden));
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.mv), res[1].result_id);
    await page.dispatchEvent(`[data-mv="${res[1].result_id}"]`, 'change');
    await page.waitForSelector(`[data-res="${res[1].result_id}"][data-v="FAIL"].on`);
    assert.ok((await page.textContent(`#res-${res[1].result_id}`)).includes('Ngoài giới hạn'));
    assert.ok(await page.$eval('[data-overall="FAIL"]', (b) => b.classList.contains('on')));
    assert.ok(await page.$eval('[data-overall="PASS"]', (b) => b.disabled));
    // Còn mục chưa xong: nút Gửi nghiệm thu khóa, "Còn N mục chưa xong" cuộn tới mục đầu tiên (C8)
    assert.ok(await page.$eval('#wo-submit', (b) => b.disabled));
    const left = await page.textContent('#wo-left');
    assert.match(left, /Còn 2 mục chưa xong/);
    await page.click('#wo-left');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Không đạt, cần ghi chú'));
    assert.ok(await page.$eval(`#res-${res[1].result_id}`, (el) => el.classList.contains('flash')), 'đánh dấu mục thiếu đầu tiên');
    assert.ok((await page.textContent('#toast')).includes('Chưa có giờ kết thúc'));
    await page.fill(`[data-note="${res[1].result_id}"]`, 'Áp suất cao, van an toàn xả');
    await page.dispatchEvent(`[data-note="${res[1].result_id}"]`, 'change');
    await page.waitForFunction(() => /Còn 1 mục/.test((document.querySelector('#wo-left') || {}).textContent || ''));
    await page.click('#wo-end-now');
    await page.waitForSelector('#wo-submit:not([disabled])');
    assert.equal(await page.locator('#wo-left').count(), 0);
    assert.ok((await page.textContent('.view')).includes('Có thay đổi chưa lưu'));
    await page.screenshot({ path: path.join(SHOTS, 'wo-offline-iphone.png'), fullPage: true });
    // Gửi nghiệm thu khi mất mạng: hỏi mức độ cho phiếu sửa, lưu hàng chờ (lưu kết quả trước, gửi sau)
    await page.click('#wo-submit');
    await page.waitForSelector('.modal #sv');
    await page.selectOption('.modal #sv', 'MEDIUM');
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Chờ nghiệm thu'), null, { timeout: 15000 });
    const q = await queue(page);
    assert.deepEqual(q.map((x) => x.a), ['maintenance.execute', 'maintenance.submit']);
    assert.equal(env.rows('Repairs').length, 0);
    // Có mạng lại: tự gửi tuần tự
    await context.setOffline(false);
    await waitQueueEmpty(page);
    const w2 = env.rows('WorkOrders').find((w) => w.work_order_id === wo.work_order_id);
    assert.equal(w2.status, 'PENDING_ACCEPTANCE');
    assert.equal(w2.overall_result, 'FAIL');
    const r2 = env.rows('WorkOrderResults').filter((r) => r.work_order_id === wo.work_order_id).sort((a, b) => a.step_no - b.step_no);
    assert.deepEqual(r2.map((r) => r.result_status), ['PASS', 'FAIL', 'PENDING']);
    assert.equal(r2[1].measured_value, 9.5);
    const reps = env.rows('Repairs');
    assert.equal(reps.length, 1, 'mục Không đạt tạo đúng 1 phiếu sửa');
    assert.equal(reps[0].source_work_order_id, wo.work_order_id);
    assert.equal(reps[0].severity, 'MEDIUM');
    assert.equal(reps[0].status, 'REPORTED');
    // KT không tự nghiệm thu: không có nút nghiệm thu
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đang chờ trưởng ca/quản lý nghiệm thu'), null, { timeout: 15000 });
    assert.equal(await page.locator('#wo-accept').count(), 0);
    // Đồng bộ lại không tạo trùng
    await go(page, '#/account/drafts');
    await page.waitForSelector('#dr-sync:not([disabled])');
    await page.click('#dr-sync');
    await page.waitForTimeout(800);
    assert.equal(env.rows('Repairs').length, 1);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone Báo sự cố (BS): mức độ bắt chọn, không chọn sẵn; mất mạng lưu phiếu + ảnh; có mạng gửi đúng 1 phiếu, 1 ảnh (không trùng khi đồng bộ lại)', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Bơm nước thải' }).ok, true);
  userClient(env, 'U-BS', 2, '583027', 'BAO_SU_CO');
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page, context } = app;
    await login(page, 'U-BS', '583027');
    await go(page, `#/repairs/new?equipment=${eq}`);
    await page.waitForSelector('#f-symptom');
    assert.equal(await page.inputValue('#f-equipment_id'), eq, 'chọn sẵn thiết bị từ QR/hồ sơ');
    assert.equal(await page.locator('[data-sev].on').count(), 0, 'mức độ không chọn sẵn (C4)');
    await context.setOffline(true);
    await page.fill('#f-symptom', 'Bơm kêu to, rò nước ở phớt');
    await page.click('#fm-save');
    await page.waitForFunction(() => document.querySelector('[data-field="severity"] .ferr').textContent.includes('Chọn mức độ'));
    await page.click('[data-sev="HIGH"]');
    await page.check('#f-stopped');
    await page.setInputFiles('#rp-photo', [{ name: 'phot.png', mimeType: 'image/png', buffer: png() }]);
    await page.waitForSelector('#rp-photo-list figure');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'repair-report-offline-iphone.png'), fullPage: true });
    await page.click('#fm-save');
    await page.waitForFunction(() => /#\/repairs\/[0-9a-f-]{36}$/.test(location.hash), null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Chờ cấp mã'));
    const q = await queue(page);
    assert.deepEqual(q.map((x) => x.a), ['repair.report', 'doc.upload']);
    const repId = q[0].id;
    assert.equal(q[1].parent, repId, 'ảnh gửi sau phiếu');
    assert.equal(env.rows('Repairs').length, 0);
    // Danh sách Sửa chữa hiện phiếu trên máy
    await go(page, '#/repairs');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Bơm kêu to'));
    await context.setOffline(false);
    await waitQueueEmpty(page);
    const reps = env.rows('Repairs');
    assert.equal(reps.length, 1);
    assert.equal(reps[0].repair_id, repId, 'ID do điện thoại tạo giữ nguyên');
    assert.equal(reps[0].severity, 'HIGH');
    assert.ok(reps[0].stopped_at, 'có giờ dừng máy');
    assert.match(reps[0].repair_code, /^SC-\d{4}-\d{3}$/);
    const docs = env.rows('Documents').filter((d) => d.entity_id === repId);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].kind, 'PHOTO_SITE');
    await go(page, '#/account/drafts');
    await page.waitForSelector('#dr-sync:not([disabled])');
    await page.click('#dr-sync');
    await page.waitForTimeout(800);
    assert.equal(env.rows('Repairs').length, 1);
    assert.equal(env.rows('Documents').filter((d) => d.entity_id === repId).length, 1);
    // Người báo không có nút xử lý/nghiệm thu
    await go(page, `#/repairs/${repId}`);
    await page.waitForFunction(() => /^SC-/.test((document.querySelector('.code.big') || {}).textContent || ''), null, { timeout: 15000 });
    assert.equal(await page.locator('#rp-start, #rp-assign, #rp-accept').count(), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: Sửa chữa — phân công cho KT, KT xử lý xong, C4 nghiệm thu có PIN → đủ 6 mốc (C9); phiếu C4 tự báo thì không có nút nghiệm thu', async () => {
  const ctx = setup();
  const { env, c, kt, ktId, eq } = ctx;
  // Phiếu do KT báo
  const rid = uuid();
  assert.equal(kt.write('repair.report', { repair_id: rid, equipment_id: eq, symptom_vi: 'Máy nén rung mạnh', severity: 'HIGH', machine_stopped: true }).ok, true);
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/repairs');
    await page.waitForSelector(`tr[data-href="/repairs/${rid}"]`);
    assert.ok((await page.textContent('.view')).includes('Đang dừng máy'));
    await page.click(`tr[data-href="/repairs/${rid}"]`);
    await page.waitForSelector('#rp-assign');
    // 6 mốc: chưa có mốc nào ngoài Báo sự cố
    const ms = await page.$$eval('.timeline li', (els) => els.map((e) => e.className));
    assert.deepEqual(ms, ['done', 'todo', 'todo', 'todo', 'todo', 'todo']);
    await page.click('#rp-assign');
    await page.waitForSelector('.modal #as-u');
    await page.selectOption('.modal #as-u', ktId);
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã phân công'), null, { timeout: 15000 });
    // KT xử lý trên máy khác
    const r1 = env.rows('Repairs').find((r) => r.repair_id === rid);
    const now = env.g.isoVN_(new env.clock.Date());
    env.clock.advance(60 * 60000);
    const end = env.g.isoVN_(new env.clock.Date());
    let p = kt.write('repair.process', { repair_id: rid, repair_start_at: now, repair_end_at: end, restored_at: end, test_run_result: 'PASS', action_vi: 'Siết lại chân đế' }, { expected_version: r1.record_version });
    assert.equal(p.ok, true, JSON.stringify(p));
    p = kt.write('repair.submit', { repair_id: rid }, { expected_version: p.record_version });
    assert.equal(p.ok, true, JSON.stringify(p));
    await page.reload();
    await page.waitForSelector('#rp-accept', { timeout: 15000 });
    await page.click('#rp-accept');
    await page.waitForSelector('.modal');
    await page.click('.modal-actions .btn.primary');
    await page.waitForSelector('.modal .pin-input', { timeout: 15000 });
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Hoàn thành · 已完成'), null, { timeout: 15000 });
    assert.equal(env.rows('Repairs').find((r) => r.repair_id === rid).status, 'COMPLETED');
    const ms2 = await page.$$eval('.timeline li', (els) => els.map((e) => e.className));
    assert.deepEqual(ms2, ['done', 'done', 'done', 'done', 'done', 'done'], 'đủ 6 mốc');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'repair-done-web.png'), fullPage: true });
    // C4 tự báo → không tự nghiệm thu (4.6)
    const own = uuid();
    assert.equal(c.write('repair.report', { repair_id: own, equipment_id: eq, symptom_vi: 'Đèn báo lỗi', severity: 'LOW' }).ok, true);
    let o = env.rows('Repairs').find((r) => r.repair_id === own);
    assert.equal(c.write('repair.assign', { repair_id: own, assignee_user_id: ktId }, { expected_version: o.record_version }).ok, true);
    o = env.rows('Repairs').find((r) => r.repair_id === own);
    const t0 = env.g.isoVN_(new env.clock.Date());
    env.clock.advance(10 * 60000);
    const t1 = env.g.isoVN_(new env.clock.Date());
    p = kt.write('repair.process', { repair_id: own, repair_start_at: t0, repair_end_at: t1, test_run_result: 'PASS' }, { expected_version: o.record_version });
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(kt.write('repair.submit', { repair_id: own }, { expected_version: p.record_version }).ok, true);
    await go(page, `#/repairs/${own}`);
    await page.reload();
    await page.waitForFunction(() => ((document.querySelector('.view') || {}).textContent || '').includes('không tự nghiệm thu'), null, { timeout: 15000 });
    assert.equal(await page.locator('#rp-accept').count(), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: Bảo trì — bảng phiếu, kế hoạch, lịch tuần, mẫu checklist; Công việc (bảng); Kho vật tư có tab Đề nghị/Lượng dùng', async () => {
  const ctx = setup();
  const { env, wo, plan } = ctx;
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    assert.ok((await page.textContent('.home-today')).includes(wo.work_order_code), 'Công việc hôm nay có phiếu bảo trì');
    assert.ok(!(await page.textContent('.home-today')).includes('Sắp có'));
    await go(page, '#/maintenance');
    await page.waitForSelector(`tr[data-href="/maintenance/wo/${wo.work_order_id}"]`);
    await page.click('[data-tab="plans"]');
    await page.waitForSelector(`tr[data-href="/maintenance/plans/${plan}"]`);
    assert.ok((await page.textContent('.view')).includes('KH-0001'));
    await page.click('[data-tab="calendar"]');
    await page.waitForSelector('.week .day-item.k-wo');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'maintenance-calendar-web.png'), fullPage: true });
    await go(page, `#/maintenance/plans/${plan}`);
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Bảo dưỡng máy nén'));
    await go(page, '#/maintenance/checklists');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Phiên bản · 版本 1'));
    await go(page, '#/work');
    await page.waitForSelector(`tr[data-href="/maintenance/wo/${wo.work_order_id}"]`);
    assert.ok(await page.$eval('[data-scope="ALL"]', (b) => b.classList.contains('on')), 'cấp 4 mặc định Trong phạm vi');
    await go(page, '#/materials');
    await page.waitForSelector('[data-mtab="requests"]');
    await page.click('[data-mtab="usage"]');
    await page.waitForSelector('#mt-wq');
    assert.equal(await page.locator('.tab.dim').count(), 0, 'Đề nghị/Lượng dùng đã mở');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
