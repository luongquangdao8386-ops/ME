// d4.26: cân bằng đồng hồ tổng – nhánh trên app: "Chờ bạn xử lý" báo thất thoát vượt ngưỡng tháng vừa kết thúc (bấm → báo cáo lọc đúng
// đồng hồ tổng), bản xem trước có ô Thất thoát, bảng Cân bằng, phân bổ theo nhánh, cân bằng theo ngày; ô lọc Đồng hồ; trang Ngưỡng thất thoát
// (Quản trị sửa ngưỡng chung có PIN → mục Chờ bạn xử lý tự hết); trang đồng hồ tổng có dòng ngưỡng; iPhone không tràn ngang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';
import { dayVN } from './sim_month.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Tháng trước đầy đủ: MSB1 (+10 000/ngày) → A (+4 000), B (+3 000), C (+2 600) = 9 600 → thất thoát 4 % > 3 % */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const t = dayVN();
  const month = shift(t.slice(0, 8) + '01', -1).slice(0, 8) + '01';
  const id = {};
  const ms = [['MSB1', null, 10000], ['A', 'MSB1', 4000], ['B', 'MSB1', 3000], ['C', 'MSB1', 2600]].map(([code, parent, step]) => {
    id[code] = uuid();
    ok(c.write('meter.edit', { meter_id: id[code], meter_code: code, name_vi: code === 'MSB1' ? 'Điện tổng' : 'Xưởng ' + code, utility_type: 'ELECTRICITY', multiplier: 1,
      reading_cycle_type: 'DAY_1', parent_meter_id: parent ? id[parent] : undefined }));
    return { code, step, v: 50000 };
  });
  for (let d = month; d < t; d = shift(d, 1)) {
    ms.forEach((m, i) => { ok(dn.write('reading.create', { reading_id: uuid(), meter_id: id[m.code], measured_at: `${d}T08:0${i}:00+07:00`, cumulative_value: m.v })); m.v += m.step; });
  }
  return { env, month, id };
}

async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);

test('web: Chờ bạn xử lý báo thất thoát vượt ngưỡng → báo cáo lọc đồng hồ tổng (ô Thất thoát, Cân bằng, phân bổ, theo ngày); sửa ngưỡng chung có PIN → mục báo hết', async () => {
  const { env, month, id } = setup();
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  try {
    await login(page);
    // Mục báo lấy nền từ máy chủ rồi vẽ lại trang chủ
    await page.waitForFunction(() => (document.querySelector('.pending-me') || {}).textContent?.includes('Thất thoát vượt ngưỡng'), null, { timeout: 15000 });
    const item = page.locator('.pending-me a', { hasText: 'MSB1' });
    assert.ok((await item.textContent()).includes('4\u00A0%'), await item.textContent());
    await item.click();
    await page.waitForSelector('.view .paper-a4[data-type="ELECTRICITY"] .bal-tbl', { timeout: 15000 });
    assert.equal(await page.locator('#f-meter_id').inputValue(), id.MSB1, 'ô lọc Đồng hồ đã chọn MSB1');
    const opts = await page.locator('#f-meter_id option').allTextContents();
    assert.ok(opts[0].startsWith('Tất cả đồng hồ'));
    assert.ok(opts.some((x) => x.startsWith('↳ A')), 'đồng hồ nhánh có dấu ↳');
    const el = page.locator('.paper-a4[data-type="ELECTRICITY"]');
    assert.ok((await el.locator('.paper-meta-l').textContent()).includes('MSB1 · Điện tổng'));
    const tile = el.locator('.paper-tile.tone-red');
    assert.ok((await tile.textContent()).includes('Thất thoát'), 'ô Thất thoát đỏ');
    assert.equal(await el.locator('.bal-tbl tbody tr.bal-over').count(), 1);
    assert.ok((await el.locator('.bal-tbl tbody tr').textContent()).includes('Vượt ngưỡng'));
    const share = await el.locator('.bal-share .vz-lbl').allTextContents();
    assert.deepEqual(share.map((x) => x.split(' · ')[0]), ['A', 'B', 'C', 'Thất thoát']);
    assert.equal(await el.locator('.bal-dd').count(), 2, 'cân bằng theo ngày hai nửa');
    assert.ok((await el.locator('.bal-dd tbody tr').first().textContent()).includes('400 (4\u00A0%)'));
    assert.equal(await el.locator('.bal-dd tr.bal-bad').count() > 20, true, 'ngày vượt ngưỡng chữ đỏ');
    assert.ok(!(await el.textContent()).includes('Chỉ số đầu ngày'), 'lọc đồng hồ tổng: bảng cân bằng theo ngày thay bảng chỉ số');
    await page.screenshot({ path: path.join(SHOTS, 'meter-balance-web.png'), fullPage: true });
    // Đổi ô lọc sang nhánh A → chỉ số của A, không còn Cân bằng (A không có nhánh)
    await page.selectOption('#f-meter_id', id.A);
    await page.click('#rr-apply');
    await page.waitForFunction(() => document.querySelector('.paper-meta-l')?.textContent.includes('A · Xưởng A'), null, { timeout: 15000 });
    await page.waitForSelector('.paper-a4 .dd-tbl');
    assert.equal(await page.locator('.paper-a4 .bal-tbl').count(), 0);
    // Trang đồng hồ tổng: dòng ngưỡng
    await go(page, `#/utilities/meters/${id.MSB1}`);
    await page.waitForSelector('.bal-line');
    assert.ok((await page.textContent('.bal-line')).includes('Cân bằng với 3 đồng hồ nhánh: ngưỡng 3'));
    // Tài khoản → Quản trị → Ngưỡng thất thoát điện nước; sửa ngưỡng chung Điện = 5 (PIN)
    await go(page, '#/account');
    await page.waitForSelector('a[href="#/utilities/loss"]');
    await page.click('a[href="#/utilities/loss"]');
    await page.waitForSelector('[data-tol-type="ELECTRICITY"]');
    assert.ok((await page.textContent('.bal-tol-tbl')).includes('MSB1'));
    await page.click('[data-tol-type="ELECTRICITY"]');
    await page.fill('#tol-v', '5');
    await page.click('.modal-actions .btn.primary');
    await page.waitForSelector('.modal .pin-input', { timeout: 15000 });
    await page.keyboard.type(OWNER_PIN);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-tol-type="ELECTRICITY"]')?.closest('tr').textContent.includes('5\u00A0%'), null, { timeout: 15000 });
    assert.equal(JSON.parse(env.rows('Settings').find((r) => r.setting_key === 'meter_loss_tolerance').value).ELECTRICITY, 5);
    // Về trang chủ: mục báo hết (4 % < 5 %)
    await go(page, '#/');
    await page.waitForSelector('.grid9');
    await page.waitForTimeout(2500);
    assert.ok(!((await page.locator('.pending-me').count()) && (await page.textContent('.pending-me')).includes('Thất thoát')), 'hết mục báo');
    assert.deepEqual(app.consoleErrors, []);
    void month;
  } finally { await app.close(); }
});

test('iPhone: báo cáo lọc đồng hồ tổng không tràn ngang; ô Thất thoát và bảng Cân bằng hiện', async () => {
  const { env, month, id } = setup();
  const app = await openApp({ env });
  const { page } = app;
  try {
    await login(page);
    await go(page, `#/reports/run/RPT_UTILITIES?period_type=MONTH&date=${month}&meter_id=${id.MSB1}`);
    await page.waitForSelector('.paper-a4 .bal-tbl', { timeout: 15000 });
    assert.equal(await page.locator('.paper-tile.tone-red').count(), 1);
    const over = await page.evaluate(() => {
      const w = window.innerWidth;
      return [...document.querySelectorAll('.view *')].filter((el) => !el.closest('.table-wrap, .chips, .tabs-bar, .modal')).some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1; });
    });
    assert.equal(over, false, 'không tràn ngang');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
