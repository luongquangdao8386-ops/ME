// d4.34: Quản trị (cấp 4) tự xác minh tủ điện mình vừa nhập (trước đây chỉ hiện "người sửa cuối không tự xác minh").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

test('web: Quản trị mở tủ PP1 mình vừa nhập → có nút Xác minh, nhập PIN → đã xác minh', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const pid = uuid();
  const r = c.write('circuit.edit', { entity: 'PANEL', panel_id: pid, panel_code: 'PP1', name_vi: 'tủ phân phối', panel_type: 'DISTRIBUTION_BOARD' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    await page.evaluate((id) => { location.hash = `#/circuits/p/${id}`; }, pid);
    await page.waitForSelector('#pn-verify', { timeout: 15000 });
    assert.ok(!(await page.textContent('.view')).includes('không tự xác minh'), 'không còn dòng chặn tự xác minh');
    await page.click('#pn-verify');
    await page.click('.modal-actions .btn.primary');
    await page.waitForSelector('.modal input[inputmode="numeric"], .modal input[type="password"]', { timeout: 10000 });
    await page.fill('.modal input[inputmode="numeric"], .modal input[type="password"]', OWNER_PIN);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#pn-verify'), null, { timeout: 15000 });
    assert.ok(env.rows('Panels').find((x) => x.panel_id === pid).verified_by, 'đã ghi người xác minh');
    await page.screenshot({ path: path.join(SHOTS, 'admin-self-verify.png') });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
