// Ô tìm kiếm của các danh sách: gõ từng ký tự (mỗi lần danh sách vẽ lại) mà ô vẫn là đúng phần tử cũ, còn focus, chỉ một bộ nghe sự kiện
// — iPhone: ô bị thay bằng phần tử mới (dù focus lại ngay) thì bàn phím bật về chữ sau mỗi số vừa gõ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);

test('iPhone C4: gõ "TU-0" vào ô tìm kiếm của 9 danh sách — ô giữ nguyên phần tử và focus sau mỗi lần vẽ lại; Thiết bị lọc đúng theo mã', async () => {
  const env = freshServer();
  ownerClient(env);
  env.g.pocSeedSampleData();
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    // Đếm số bộ nghe 'input' gắn vào từng phần tử
    await page.evaluate(() => {
      const orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (t, ...r) { if (t === 'input') this.__n = (this.__n || 0) + 1; return orig.call(this, t, ...r); };
    });
    const lists = [['#/equipment', '#eq-q'], ['#/repairs', '#rp-q'], ['#/work', '#wk-q'], ['#/maintenance', '#mt-q'], ['#/materials', '#mt-q'],
      ['#/contracts', '#co-q'], ['#/inspections', '#in-q'], ['#/circuits', '#ci-q'], ['#/utilities/meters', '#ml-q']];
    for (const [hash, sel] of lists) {
      await go(page, hash);
      await page.waitForSelector(sel);
      await page.waitForTimeout(300);
      await page.focus(sel);
      await page.evaluate((s) => { document.querySelector(s).__mark = 1; }, sel);
      await page.keyboard.type('TU-0', { delay: 400 });
      await page.waitForTimeout(600);
      const st = await page.evaluate((s) => { const el = document.querySelector(s); return { same: el.__mark === 1, focus: document.activeElement === el, value: el.value, n: el.__n || 0 }; }, sel);
      assert.deepEqual(st, { same: true, focus: true, value: 'TU-0', n: 1 }, hash);
    }
    // Lọc thật sự chạy: Thiết bị gõ đúng mã máy thứ hai thì chỉ còn máy đó
    const eqs = env.rows('Equipment').map((e) => e.equipment_code).sort();
    await go(page, '#/equipment');
    await page.waitForSelector('#eq-q');
    await page.fill('#eq-q', '');
    await page.focus('#eq-q');
    await page.keyboard.type(eqs[1], { delay: 300 });
    await page.waitForTimeout(600);
    const txt = await page.textContent('.view');
    assert.ok(txt.includes(eqs[1]) && !txt.includes(eqs[0]), txt.slice(0, 300));
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'eq-q');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
