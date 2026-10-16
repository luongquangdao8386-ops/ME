// Tốc độ: đăng nhập = một lượt gọi máy chủ (kèm dữ liệu đầu); lưu = một lượt gọi (thay đổi kèm phản hồi ghi, không gọi thêm sync.changes)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, userClient, uuid } from '../helpers.mjs';

const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };

test('web C4: đăng nhập một lượt gọi (không gọi sync.bootstrap riêng); lưu thiết bị một lượt gọi, trên máy có ngay máy mới và cả phiếu người khác vừa báo', async () => {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  const app = await openApp({ env, ...WEB });
  const { page, calls } = app;
  try {
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    assert.deepEqual(calls, ['auth.login'], 'chỉ một lượt: ' + calls.join(','));
    // Người khác báo sự cố trong lúc mình đang mở app
    const eq = env.rows('Equipment')[0].equipment_id;
    const rid = uuid();
    assert.equal(kt.write('repair.report', { repair_id: rid, equipment_id: eq, symptom_vi: 'Rò khí nén', severity: 'LOW' }).ok, true);
    await page.evaluate(() => { location.hash = '#/equipment/new'; });
    await page.waitForSelector('#f-name_vi');
    await page.fill('#f-name_vi', 'Máy sấy khí lưu nhanh');
    const n0 = calls.length;
    await page.click('#fm-save');
    await page.waitForSelector('#eq-pane .code.big', { timeout: 15000 });
    await page.waitForTimeout(500);
    const after = calls.slice(n0);
    assert.ok(after.includes('equipment.create'), after.join(','));
    assert.ok(!after.includes('sync.changes'), 'không gọi thêm sync.changes sau khi lưu: ' + after.join(','));
    // Dữ liệu trên máy đã có cả máy mới và phiếu người khác (thay đổi kèm phản hồi ghi)
    const local = await page.evaluate(async (r) => {
      const m = await import('./js/sync.js');
      const eqs = await m.getRecords('EQUIPMENT');
      const rps = await m.getRecords('REPAIR');
      return { eq: eqs.some((e) => e.name_vi === 'Máy sấy khí lưu nhanh'), rp: rps.some((x) => x.repair_id === r) };
    }, rid);
    assert.deepEqual(local, { eq: true, rp: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
