// Kiểm định: nộp offline kèm ảnh (NT1-32, 33), duyệt có hỏi lại PIN (NT1-17, 92)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import zlib from 'node:zlib';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

/** PNG đơn sắc w×h hợp lệ (để trình duyệt giải mã và thu nhỏ) */
function png(w = 32, h = 24, rgb = [200, 60, 40]) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

test('iPhone: nộp chứng nhận khi offline kèm 2 ảnh chứng nhận + 1 ảnh thiết bị; đồng bộ xong đúng 1 lần, ID giữ nguyên, chế độ chia sẻ đúng (NT1-32)', async () => {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  const req = env.rows('InspectionRequirements')[0];
  const app = await openApp({ env });
  try {
    const { page, context } = app;
    await login(page);
    await page.evaluate((h) => { location.hash = h; }, `#/inspections/${req.requirement_id}/submit`);
    await page.waitForSelector('#f-valid_from');
    await context.setOffline(true);
    await page.fill('#f-valid_from', '2026-10-01');
    await page.fill('#f-valid_to', '2027-09-30');
    await page.fill('#f-certificate_number', 'CN-OFF-1');
    await page.setInputFiles('input[data-att="cert"]', [{ name: 'cn1.png', mimeType: 'image/png', buffer: png() }, { name: 'cn2.png', mimeType: 'image/png', buffer: png(40, 30, [10, 120, 200]) }]);
    await page.setInputFiles('input[data-att="photo"]', [{ name: 'may.png', mimeType: 'image/png', buffer: png(48, 36, [20, 160, 60]) }]);
    await page.click('#fm-save');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã lưu trên máy'), null, { timeout: 15000 });
    assert.equal(env.rows('Inspections').length, 0);
    const q = await page.evaluate(async () => (await (await import('./js/sync.js')).queueItems()).map((o) => ({ a: o.action, id: o.payload.inspection_id || o.payload.entity_id })));
    assert.equal(q.length, 4);
    const inspId = q[0].id;
    assert.ok(q.slice(1).every((x) => x.a === 'doc.upload' && x.id === inspId));
    await page.screenshot({ path: path.join(SHOTS, 'inspection-offline-iphone.png'), fullPage: true });
    await context.setOffline(false);
    await page.evaluate(() => { location.hash = '#/account/drafts'; });
    await page.waitForSelector('#dr-sync:not([disabled])');
    await page.click('#dr-sync');
    const qlen = () => page.evaluate(async () => (await (await import('./js/sync.js')).queueItems()).length);
    for (let i = 0; i < 60 && (await qlen()) > 0; i++) await page.waitForTimeout(500);
    assert.equal(await qlen(), 0);
    const ins = env.rows('Inspections');
    assert.equal(ins[0].inspection_id, inspId, 'ID do điện thoại tạo giữ nguyên');
    assert.equal(ins[0].status, 'PENDING_APPROVAL');
    assert.match(ins[0].inspection_code, /^LKD-\d{4}-\d{3}$/);
    const docs = env.rows('Documents').filter((d) => d.entity_id === inspId);
    assert.equal(docs.length, 3);
    assert.equal(docs.filter((d) => d.kind === 'CERTIFICATE' && d.access_scope === 'MODULE_VIEW' && env.drive._files.get(d.drive_file_id).access === 'PRIVATE').length, 2);
    const ph = docs.find((d) => d.kind === 'PHOTO_EQUIPMENT');
    assert.equal(ph.drive_sharing_state, 'LINK_SHARED');
    assert.equal(env.drive._files.get(ph.drive_file_id).access, 'ANYONE_WITH_LINK');
    // Gửi lại lần nữa không tạo trùng
    await page.click('#dr-sync');
    await page.waitForTimeout(800);
    assert.equal(env.rows('Inspections').length, 1);
    assert.equal(env.rows('Documents').filter((d) => d.entity_id === inspId).length, 3);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web: C4 duyệt chứng nhận do HĐ nộp, hỏi lại PIN; hạn hiện hành cập nhật', async () => {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  const req = env.rows('InspectionRequirements')[0];
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const id = uuid();
  assert.equal(hd.write('inspection.submit', { inspection_id: id, requirement_id: req.requirement_id, inspection_date: '2026-10-01', valid_from: '2026-10-01', valid_to: '2027-09-30', result: 'PASS', certificate_number: 'CN-9' }).ok, true);
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await login(page);
    await page.evaluate((h) => { location.hash = h; }, `#/inspections/${req.requirement_id}`);
    await page.waitForSelector(`[data-appr="${id}"]`);
    assert.ok((await page.textContent('.view')).includes('Chờ duyệt · 待审核'));
    await page.click(`[data-appr="${id}"]`);
    await page.waitForSelector('.modal');
    assert.ok((await page.textContent('.modal')).includes('lần Không đạt giữ hạn cũ'));
    await page.click('.modal-actions .btn.primary');
    // Hỏi lại PIN (action loại PIN)
    await page.waitForSelector('.modal .pin-input', { timeout: 15000 });
    assert.ok((await page.textContent('.modal')).includes('Nhập lại PIN để tiếp tục · 请重新输入PIN以继续'));
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã duyệt · 已批准'), null, { timeout: 15000 });
    const r = env.rows('InspectionRequirements').find((x) => x.requirement_id === req.requirement_id);
    assert.equal(r.current_due_date, '2027-09-30');
    assert.equal(r.current_inspection_id, id);
    assert.ok((await page.textContent('.view')).includes('30/09/2027'));
    await page.screenshot({ path: path.join(SHOTS, 'inspection-approved-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
