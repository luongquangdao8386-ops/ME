// d4.28: lẫn bản ngay sau phát hành — dict.js cũ thiếu nhãn mới (người dùng thấy "arc.title · arc.title" ở Quản trị) → app tự tải lại
// bản mới đúng một lần mỗi phiên trình duyệt (cờ sessionStorage theo khóa), không lặp khi tệp vẫn cũ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

test('dict.js cũ thiếu nhãn → tự tải lại một lần, không lặp', async () => {
  const env = freshServer();
  ownerClient(env);
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await page.route(/\/js\/dict\.js/, async (route) => {
      const r = await route.fetch();
      const body = (await r.text()).replace(/"arc\.title":\[[^\]]*\],\n/, '');
      await route.fulfill({ response: r, body });
    });
    let loads = 0;
    page.on('load', () => { loads++; });
    await page.reload();
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    const before = loads;
    await page.evaluate(() => { location.hash = '#/account'; });
    await page.waitForTimeout(4000);
    assert.equal(loads, before + 1, 'tải lại đúng một lần');
    const flag = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.endsWith('.label_reload')).map((k) => sessionStorage.getItem(k)));
    assert.deepEqual(flag, ['arc.title']);
    await page.waitForSelector('a[href="#/admin/archive"]', { timeout: 15000 });
    await page.waitForTimeout(2000);
    assert.equal(loads, before + 1, 'tệp vẫn cũ: không tải lại lần nữa');
    assert.ok(app.consoleErrors.some((x) => x.includes('Thiếu nhãn arc.title')));
  } finally { await app.close(); }
});
