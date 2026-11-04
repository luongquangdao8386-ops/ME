// d4.30: trang chủ bố cục Mẫu 3 (người dùng chọn 04/11/2026) — trái 9 ô chức năng to, phải bảng Việc cần làm
// (ô số Quá hạn / Sắp tới hạn / Việc tuần này, dải 7 ngày có chấm, danh sách việc); không tràn (iPhone 390, web 1440),
// web hai cột cao bằng nhau; khi chưa có việc: một dòng "Không có việc quá hạn…" + "Tuần này chưa có việc nào"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const vnDate = (n = 0) => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);

/** Mẫu + 1 kiểm định quá hạn, 1 sắp tới hạn, phiếu BT hôm nay; empty = chỉ dữ liệu mẫu (không có hạn) */
function seeded(empty = false) {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  if (empty) return env;
  env.g.dbReset_();
  const reqs = env.rows('InspectionRequirements');
  env.g.withWriteLock_(() => {
    env.g.writeCells_('InspectionRequirements', reqs[0].__row, { current_due_date: vnDate(5), sync_revision: 99 });
    env.g.writeCells_('InspectionRequirements', reqs[1].__row, { current_due_date: vnDate(-3), sync_revision: 99 });
  });
  ok(c.write('maintenance.wo.create', { work_order_id: uuid(), equipment_id: env.rows('Equipment')[0].equipment_id, title_vi: 'Vệ sinh lọc gió', due_date: vnDate(0) }));
  return env;
}
async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const noOverflow = (page) => page.evaluate(() => {
  const w = window.innerWidth;
  if (document.documentElement.scrollWidth > w + 1) return 'doc';
  const bad = [...document.querySelectorAll('.view *')].find((el) => {
    if (el.closest('.table-wrap')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
  return bad ? bad.className || bad.tagName : '';
});

for (const [name, vp] of [['iphone', IPHONE], ['web', WEB]]) {
  test(`trang chủ ${name}: Mẫu 3 — 9 ô, bảng Việc cần làm (ô số, 7 ngày, việc quá hạn + hôm nay), không tràn, không còn nút chọn bố cục`, async () => {
    const app = await openApp({ env: seeded(), ...vp });
    try {
      const { page } = app;
      await login(page);
      assert.equal(await page.locator('.hl-pick').count(), 0, 'đã bỏ dải nút chọn bố cục');
      assert.equal(await page.locator('.hl-mods .grid9 > .tile').count(), 9);
      assert.equal(await page.locator('.hl-strip .hl-pill').count(), 7);
      assert.equal(await page.locator('.hl-pill.today').count(), 1);
      const panel = await page.textContent('.hl-panel');
      assert.ok(panel.includes('Việc cần làm · 待办事项'));
      assert.ok(panel.includes('Quá 3 ngày · 逾期 3 天'), 'mục quá hạn có nhãn số ngày');
      assert.ok(panel.includes('Hôm nay · 今天') && panel.includes('Vệ sinh lọc gió'), 'phiếu BT hôm nay trong danh sách tuần');
      assert.ok(!panel.includes('hl.'), 'không lộ khóa nhãn');
      assert.deepEqual(await page.$$eval('.hl-stat .n', (ns) => ns.map((n) => n.textContent)).then((a) => a.slice(0, 2)), ['1', '1']);
      assert.equal(await noOverflow(page), '', 'không tràn ngang');
      if (name === 'web') {
        const b = await page.evaluate(() => ['.hl-main', '.hl-panel'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().bottom)));
        assert.ok(Math.abs(b[0] - b[1]) <= 2, `đáy hai cột lệch ${b}`);
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.home .tile')).flexDirection), 'row', 'web: ô chức năng nằm ngang');
        assert.ok((await page.textContent('.home-today')).includes('Công việc hôm nay · 今日工作'));
      } else {
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.home .tile')).flexDirection), 'column');
      }
      // bấm một dòng việc → mở đúng hồ sơ
      await page.click('.hl-sec.over .hl-row');
      await page.waitForFunction(() => location.hash.startsWith('#/inspections/'));
      await page.screenshot({ path: path.join(SHOTS, `home-v3-${name}.png`), fullPage: true });
      assert.deepEqual(await page.evaluate(() => window.__meCsp), [], 'không vi phạm CSP');
      assert.deepEqual(app.consoleErrors, []);
    } finally { await app.close(); }
  });
}

test('trang chủ web khi chưa có việc: một dòng "không có việc", tuần trống gọn, hai cột vẫn cao bằng nhau', async () => {
  const app = await openApp({ env: seeded(true), ...WEB });
  try {
    const { page } = app;
    await login(page);
    const panel = await page.textContent('.hl-panel');
    assert.ok(panel.includes('Không có việc quá hạn hay sắp tới hạn · 没有逾期或即将到期的事项'));
    assert.ok(panel.includes('Tuần này chưa có việc nào · 本周暂无事项'));
    assert.deepEqual(await page.$$eval('.hl-stat.zero', (x) => x.length), 3, 'ba ô số đều 0 (màu xám)');
    const b = await page.evaluate(() => ['.hl-main', '.hl-panel'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().bottom)));
    assert.ok(Math.abs(b[0] - b[1]) <= 2, `đáy hai cột lệch ${b}`);
    assert.equal(await noOverflow(page), '');
    await page.screenshot({ path: path.join(SHOTS, 'home-v3-empty-web.png'), fullPage: true });
  } finally { await app.close(); }
});
