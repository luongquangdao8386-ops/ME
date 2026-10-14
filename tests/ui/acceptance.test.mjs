// Nghiệm thu 6.8 (phụ lục 1.5): NT1-14 dải phiên sắp hết hạn, NT1-37 tên lưu trữ có tiền tố (cùng origin với Cơ Điện)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

test('NT1-14 iPhone: phiên còn dưới 3 ngày → dải "Phiên sắp hết hạn" kèm nút Đăng nhập lại; phiên 30 ngày thì không có dải', async () => {
  const env = freshServer();
  ownerClient(env);
  env.props.setProperty('TEST_SESSION_SECONDS', String(2 * 86400));
  const app = await openApp({ env });
  try {
    const { page } = app;
    await login(page);
    await page.waitForSelector('#st-session:not([hidden])', { timeout: 10000 });
    assert.match(await page.textContent('#st-session'), /Phiên sắp hết hạn/);
    assert.equal(await page.locator('#st-relogin').count(), 1);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
  env.props.deleteProperty('TEST_SESSION_SECONDS');
  const app2 = await openApp({ env });
  try {
    const { page } = app2;
    await login(page);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#st-session:not([hidden])').count(), 0);
  } finally { await app2.close(); }
});

test('NT1-37 web: mọi tên lưu trữ có tiền tố — IndexedDB me_*, Cache Storage me-*, localStorage/sessionStorage me.*; Service Worker scope /ME/', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy MẪU' });
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false, sw: true });
  try {
    const { page } = app;
    await login(page);
    await page.evaluate(() => { location.hash = '#/equipment'; });
    await page.waitForSelector('.view .tbl, .view .cards', { timeout: 15000 });
    await page.waitForFunction(async () => (await caches.keys()).length > 0, null, { timeout: 15000 });
    const s = await page.evaluate(async () => ({
      ls: Object.keys(localStorage), ss: Object.keys(sessionStorage),
      idb: (await indexedDB.databases()).map((d) => d.name), caches: await caches.keys(),
      scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname)
    }));
    assert.ok(s.idb.length > 0 && s.caches.length > 0, JSON.stringify(s));
    assert.deepEqual(s.ls.filter((k) => !k.startsWith('me.')), [], 'localStorage');
    assert.deepEqual(s.ss.filter((k) => !k.startsWith('me.')), [], 'sessionStorage');
    assert.deepEqual(s.idb.filter((k) => !k.startsWith('me_')), [], 'IndexedDB');
    assert.deepEqual(s.caches.filter((k) => !k.startsWith('me-')), [], 'Cache Storage');
    assert.deepEqual(s.scopes, ['/ME/']);
  } finally { await app.close(); }
});
