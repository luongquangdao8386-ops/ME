// Rà soát d4.42: tải dữ liệu ban đầu trước dừng sau 50 trang mà vẫn lưu → dữ liệu lớn (vài năm phiếu bảo trì) thiếu ngầm trên máy.
// Giờ đọc tới hết trang: 5 100 thiết bị, 100 dòng/trang (> 50 trang) → máy có đủ 5 100.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, uuid, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

test('iPhone: đăng nhập với 5 100 thiết bị, 100 dòng mỗi trang (> 50 trang) → máy có đủ 5 100 thiết bị, danh sách đếm đúng', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const g = env.g;
  const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  assert.equal(c.call('settings.edit', { changes: { sync_page_size: 100 }, reason: 'thử' }, { operation_id: uuid(), reauth_token: rt }).ok, true);
  assert.equal(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy mẫu' }).ok, true);
  g.dbReset_();
  const base = { ...g.readRows_('Equipment')[0] };
  delete base.__row;
  const more = Array.from({ length: 5099 }, (_, i) => ({ ...base, equipment_id: uuid(), equipment_code: 'TB-' + String(i + 1).padStart(5, '0'), name_vi: 'Máy số ' + (i + 1) }));
  g.withWriteLock_(() => { g.insertRows_('Equipment', more); g.resetBumpTable_('Equipment'); });
  g.TBL_MAX_CHUNKS_ = 1000; // bảng vẫn đệm được → giữ 100 dòng/trang (bảng quá lớn để đệm thì trang 2 000 dòng)
  const app = await openApp({ env, viewport: { width: 390, height: 844 }, mobile: true });
  const { page } = app;
  let calls = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && /sync\.bootstrap/.test(r.postData() || '')) calls++; });
  try {
    await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 120000 });
    const n = await page.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('me_data');
      r.onsuccess = () => { const t = r.result.transaction('records').objectStore('records').get('EQUIPMENT'); t.onsuccess = () => resolve((t.result || []).length); };
    }));
    assert.ok(calls > 50, 'hơn 50 trang: ' + calls);
    assert.equal(n, 5100);
    await page.evaluate(() => { location.hash = '#/equipment'; });
    await page.waitForSelector('.cards .rec-card');
    assert.match(await page.textContent('.view-page:last-child'), /5[.,\s]?100/);
    assert.deepEqual(app.consoleErrors, []);
  } finally {
    await app.close();
  }
});
