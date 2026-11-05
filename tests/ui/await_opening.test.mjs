// d4.33: xem Điện nước kỳ 1 ngày = hôm nay, đồng hồ hôm nay chưa đọc → "Kỳ chưa kết thúc · chưa đọc số đầu kỳ · hạn …" (không báo Thiếu số đo);
// bấm dòng → trang đồng hồ có khung "Kỳ đang xem": số đầu kỳ chưa đọc (cần đọc từ 00:00 hôm nay đến trước 00:00 ngày mai), lần đọc gần nhất trước kỳ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';
import { dayVN } from './sim_month.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const y = dayVN(1);
  const id = { MSB1: uuid(), NT: uuid() };
  ok(c.write('meter.edit', { meter_id: id.MSB1, meter_code: 'MSB1', name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'MONTH' }));
  ok(c.write('meter.edit', { meter_id: id.NT, meter_code: 'NT', name_vi: 'Nước tổng', utility_type: 'WATER', multiplier: 1, reading_cycle_type: 'MONTH' }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: id.MSB1, measured_at: `${y}T08:00:00+07:00`, cumulative_value: 1993818 }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: id.NT, measured_at: `${y}T08:00:00+07:00`, cumulative_value: 12000 }));
  return { env, id };
}

for (const [name, viewport, mobile] of [['web', { width: 1440, height: 900 }, false], ['iphone', { width: 390, height: 844 }, true]]) {
  test(`${name}: kỳ 1 ngày hôm nay chưa đọc → Kỳ chưa kết thúc, chưa đọc số đầu kỳ; trang đồng hồ giải thích kỳ đang xem`, async () => {
    const { env, id } = setup();
    const app = await openApp({ env, viewport, mobile });
    const { page } = app;
    try {
      await page.fill('#emp', OWNER_CODE);
      await page.fill('#pin', OWNER_PIN);
      await page.click('#login-btn');
      await page.waitForSelector('.grid9', { timeout: 15000 });
      await page.evaluate(() => { location.hash = '#/utilities'; });
      await page.waitForSelector('[data-period="DAY_1"]', { timeout: 15000 });
      await page.click('[data-period="DAY_1"]');
      if (name === 'web') {
        const row = page.locator(`tr[data-href^="/utilities/meters/${id.MSB1}"]`);
        await row.waitFor({ timeout: 15000 });
        const txt = await row.textContent();
        assert.ok(txt.includes('Kỳ chưa kết thúc'), txt);
        assert.ok(txt.includes('chưa đọc số đầu kỳ'), txt);
        assert.ok(!txt.includes('Thiếu số đo'), txt);
        assert.equal(await page.locator('.kpi.warn').count(), 0, 'không có ô "N đồng hồ thiếu số đo"');
        await page.screenshot({ path: path.join(SHOTS, 'await-opening-table.png') });
        await row.click();
      } else {
        await page.waitForFunction(() => !document.querySelector('.ut-loading'), null, { timeout: 15000 });
        assert.ok(!(await page.textContent('.view')).includes('Thiếu số đo'), 'iPhone không liệt kê MSB1 trong Đồng hồ thiếu số đo');
        await page.evaluate((x) => { location.hash = `#/utilities/meters/${x}?pa=${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}&pb=${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}`; }, id.MSB1);
      }
      await page.waitForSelector('#ut-pv', { timeout: 15000 });
      const pv = await page.textContent('#ut-pv');
      assert.ok(pv.includes('Kỳ đang xem'), pv);
      assert.ok(pv.includes('Chưa đọc — cần một lần đọc từ'), pv);
      assert.ok(pv.includes('Kỳ chưa kết thúc — sẽ lấy lần đọc đầu tiên'), pv);
      assert.ok(pv.includes('Lần đọc gần nhất trước kỳ') && pv.includes('1\u202F993\u202F818'), pv);
      assert.ok(pv.includes('· 期初读数') || pv.includes('期初读数'), 'song ngữ');
      const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(over, false, 'không tràn ngang');
      await page.screenshot({ path: path.join(SHOTS, `await-opening-meter-${name}.png`) });
      assert.deepEqual(app.consoleErrors, []);
    } finally { await app.close(); }
  });
}
