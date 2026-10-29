// d4.20: hộp thoại — Enter trong ô nhập = nút chính (ô PIN: OK luôn), nhiều ô thì Enter sang ô kế tiếp, textarea giữ Enter xuống dòng,
// đang gõ bộ gõ (IME) không xác nhận, Esc = Hủy; hỏi lại PIN khi duyệt: gõ PIN + Enter là xong
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

/** Mở hộp thoại bằng ui.js của chính app; kết quả lưu ở window.__dlg */
const open = (page, kind) => page.evaluate(async (k) => {
  const ui = await import('./js/ui.js');
  window.__dlg = 'pending';
  const p = k === 'pin' ? ui.askPin('auth.reauth')
    : ui.dialog({
      title: 'T', body: k === 'two' ? '<input id="a" type="text"><input id="b" type="text">' : '<textarea id="r" rows="3"></textarea>',
      actions: [{ label: 'Hủy', value: null }, { label: 'OK', kind: 'primary', read: (w) => (k === 'two' ? w.querySelector('#a').value + '|' + w.querySelector('#b').value : w.querySelector('#r').value) }]
    });
  p.then((v) => { window.__dlg = v; });
}, kind);
const result = (page) => page.waitForFunction(() => window.__dlg !== 'pending').then(() => page.evaluate(() => window.__dlg));

test('hộp thoại: ô PIN gõ 6 số + Enter = OK; Esc = Hủy; hai ô: Enter sang ô sau rồi mới OK; textarea Enter xuống dòng; IME không xác nhận', async () => {
  const env = freshServer();
  ownerClient(env);
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await login(page);
    // PIN: Enter = OK
    await open(page, 'pin');
    await page.waitForSelector('.modal .pin-input');
    await page.keyboard.type('123456');
    await page.keyboard.press('Enter');
    assert.equal(await result(page), '123456');
    assert.equal(await page.locator('.modal').count(), 0);
    // Esc = Hủy
    await open(page, 'pin');
    await page.waitForSelector('.modal .pin-input');
    await page.keyboard.type('12');
    await page.keyboard.press('Escape');
    assert.equal(await result(page), null);
    // Hai ô: Enter ở ô đầu sang ô sau, Enter ở ô cuối mới xác nhận
    await open(page, 'two');
    await page.waitForSelector('.modal #a');
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'b');
    assert.equal(await page.evaluate(() => window.__dlg), 'pending');
    await page.keyboard.type('y');
    await page.keyboard.press('Enter');
    assert.equal(await result(page), 'x|y');
    // Textarea: Enter xuống dòng, không đóng hộp
    await open(page, 'area');
    await page.waitForSelector('.modal #r');
    await page.focus('.modal #r');
    await page.keyboard.type('dòng 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('dòng 2');
    assert.equal(await page.evaluate(() => window.__dlg), 'pending');
    await page.click('.modal-actions .btn.primary');
    assert.equal(await result(page), 'dòng 1\ndòng 2');
    // Đang gõ bộ gõ (IME, vd tiếng Trung): Enter chọn chữ, không xác nhận
    await open(page, 'pin');
    await page.waitForSelector('.modal .pin-input');
    await page.evaluate(() => document.querySelector('.modal .pin-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    assert.equal(await page.evaluate(() => window.__dlg), 'pending');
    await page.keyboard.press('Escape');
    assert.equal(await result(page), null);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('duyệt có hỏi lại PIN: gõ PIN rồi Enter là duyệt xong (không phải bấm OK)', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  ok(c.write('equipment.create', { equipment_id: eq, name_vi: 'Bình khí nén' }));
  const type = uuid(), req = uuid();
  ok(c.write('inspection.type.edit', { inspection_type_id: type, code: 'AP_LUC', name_vi: 'Kiểm định bình chịu áp lực', default_interval_months: 12 }));
  ok(c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type }));
  const { userClient } = await import('../helpers.mjs');
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const id = uuid();
  ok(hd.write('inspection.submit', { inspection_id: id, requirement_id: req, inspection_date: '2026-10-01', valid_from: '2026-10-01', valid_to: '2027-09-30', result: 'PASS', certificate_number: 'CN-1' }));
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await login(page);
    await page.evaluate((h) => { location.hash = h; }, `#/inspections/${req}`);
    await page.waitForSelector(`[data-appr="${id}"]`);
    await page.click(`[data-appr="${id}"]`);
    await page.waitForSelector('.modal');
    await page.click('.modal-actions .btn.primary');
    await page.waitForSelector('.modal .pin-input', { timeout: 15000 });
    await page.keyboard.type(OWNER_PIN);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã duyệt · 已批准'), null, { timeout: 15000 });
    assert.equal(env.rows('Inspections')[0].status, 'APPROVED');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
