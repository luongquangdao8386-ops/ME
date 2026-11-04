// d4.27: Tài khoản → Quản trị → Lưu trữ theo năm: xem số dòng sẽ chuyển, bấm Lưu trữ năm 2026 (PIN), tiến độ tới khi xong,
// danh sách Đã lưu trữ có link tệp; iPhone không tràn ngang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function setup() {
  const env = freshServer({ now: '2027-02-05T22:00:00+07:00' });
  const c = ownerClient(env);
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const m = uuid();
  ok(c.write('meter.edit', { meter_id: m, meter_code: 'MSB1', name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  let v = 1000;
  for (let d = '2026-12-01'; d <= '2027-02-04'; d = shift(d, 1)) { ok(dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: `${d}T08:00:00+07:00`, cumulative_value: v })); v += 100; }
  return { env };
}

async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

test('web: Lưu trữ năm 2026 — xem số dòng, bấm lưu trữ (PIN), tiến độ tới khi xong, có link tệp lưu trữ', async () => {
  const { env } = setup();
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await login(page);
    await page.evaluate(() => { location.hash = '#/account'; });
    await page.waitForSelector('a[href="#/admin/archive"]');
    await page.click('a[href="#/admin/archive"]');
    await page.waitForSelector('[data-arc-year="2026"]', { timeout: 15000 });
    const card = await page.textContent('.arc-year');
    assert.ok(card.includes('Năm 2026'), card);
    assert.ok(card.includes('30'), '31 chỉ số tháng 12, giữ lần đọc 31/12 → chuyển 30: ' + card);
    await page.click('[data-arc-year="2026"]');
    await page.waitForSelector('.modal');
    await page.click('.modal-actions .btn.primary');
    await page.waitForSelector('.modal .pin-input', { timeout: 15000 });
    await page.keyboard.type(OWNER_PIN);
    await page.keyboard.press('Enter');
    await page.waitForSelector('a[href^="https://docs.google.com/spreadsheets/d/"]', { timeout: 30000 });
    assert.ok(app.calls.includes('archive.step'), 'app tự chạy các bước');
    assert.equal(JSON.parse(env.g.readState_().map.archive_run).phase, 'DONE');
    assert.equal(await page.locator('[data-arc-year]').count(), 0, 'không còn năm để lưu trữ');
    assert.ok((await page.textContent('.view')).includes('Năm 2027 lưu trữ được từ 01/02/2028'), 'năm sau lưu trữ được từ 01/02/2028');
    assert.equal(env.rows('MeterReadings').filter((r) => String(r.measured_at) < '2027').length, 1);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: trang Lưu trữ theo năm không tràn ngang', async () => {
  const { env } = setup();
  const app = await openApp({ env });
  const { page } = app;
  try {
    await login(page);
    await page.evaluate(() => { location.hash = '#/admin/archive'; });
    await page.waitForSelector('[data-arc-year="2026"]', { timeout: 15000 });
    const over = await page.evaluate(() => {
      const w = window.innerWidth;
      return [...document.querySelectorAll('.view *')].filter((el) => !el.closest('.table-wrap, .modal')).some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1; });
    });
    assert.equal(over, false);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
