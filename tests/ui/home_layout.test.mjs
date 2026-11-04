// d4.28: 3 mẫu bố cục trang chủ (xem thử trên THỬ) — Mẫu 1 thanh chức năng · Mẫu 2 hai cột cân đối · Mẫu 3 bảng Việc cần làm;
// đủ 9 ô, có việc trong tuần/thời hạn, không tràn ngang (iPhone 390, web 1440), nút chọn bố cục chỉ ở THỬ và đổi được ngay
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const vnDate = (n = 0) => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);

/** Mẫu + 1 kiểm định quá hạn, 1 sắp tới hạn, phiếu BT hôm nay */
function seeded() {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  env.g.dbReset_();
  const reqs = env.rows('InspectionRequirements');
  env.g.withWriteLock_(() => {
    env.g.writeCells_('InspectionRequirements', reqs[0].__row, { current_due_date: vnDate(5), sync_revision: 99 });
    env.g.writeCells_('InspectionRequirements', reqs[1].__row, { current_due_date: vnDate(-3), sync_revision: 99 });
  });
  ok(c.write('maintenance.wo.create', { work_order_id: uuid(), equipment_id: env.rows('Equipment')[0].equipment_id, title_vi: 'Vệ sinh lọc gió', due_date: vnDate(0) }));
  return env;
}
const noOverflow = (page) => page.evaluate(() => {
  const w = window.innerWidth;
  if (document.documentElement.scrollWidth > w + 1) return 'doc';
  const bad = [...document.querySelectorAll('.view *')].find((el) => {
    if (el.closest('.table-wrap, .hl-pick')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
  return bad ? bad.className || bad.tagName : '';
});

for (const [name, vp] of [['iphone', IPHONE], ['web', WEB]]) {
  test(`trang chủ ${name}: 3 mẫu bố cục — đủ 9 ô, việc tuần/thời hạn, không tràn; nút chọn bố cục (THỬ) đổi ngay`, async () => {
    const app = await openApp({ env: seeded(), ...vp });
    try {
      const { page } = app;
      await page.fill('#emp', OWNER_CODE);
      await page.fill('#pin', OWNER_PIN);
      await page.click('#login-btn');
      await page.waitForSelector('.grid9', { timeout: 15000 });
      assert.equal(await page.locator('.hl-pick-b').count(), 4, 'THỬ: có nút chọn bố cục');
      assert.equal(await page.getAttribute('.hl-pick-b.on', 'data-lay'), '0', 'mặc định bố cục hiện tại');
      for (const v of ['1', '2', '3']) {
        await page.click(`.hl-pick-b[data-lay="${v}"]`);
        await page.waitForFunction((x) => document.querySelector('.home').dataset.layout === x, v);
        assert.equal(await page.locator('.grid9 > .tile').count(), 9, v);
        assert.equal(await page.locator('.grid9 > a.tile[href="#/maintenance"]').count(), 1, v);
        const txt = await page.textContent('.home');
        assert.ok(txt.includes('Quá hạn · 已逾期'), v);
        assert.ok(txt.includes('KD-') && txt.includes('BT-'), `${v}: có mã kiểm định + phiếu BT`);
        assert.ok(!txt.includes('hl.'), `${v}: không lộ khóa nhãn`);
        if (v === '3') assert.ok(txt.includes('Việc cần làm · 待办事项'));
        else assert.ok(txt.includes('Lịch tuần này · 本周日程') && txt.includes('Thời hạn quan trọng · 重要期限'));
        assert.equal(await noOverflow(page), '', `${v}: không tràn ngang`);
        if (name === 'web') {
          // hai cột cao bằng nhau (Mẫu 1: Lịch tuần | Thời hạn; Mẫu 2, 3: cột trái | cột phải)
          const hs = await page.evaluate((x) => {
            const pair = x === '1' ? ['.hl-week', '.hl-dl'] : x === '2' ? ['.hl-main', '.hl-mods'] : ['.hl-main', '.hl-panel'];
            return pair.map((s) => Math.round(document.querySelector(s).getBoundingClientRect().bottom));
          }, v);
          assert.ok(Math.abs(hs[0] - hs[1]) <= 2, `${v}: đáy hai cột lệch ${hs}`);
        }
        await page.screenshot({ path: path.join(SHOTS, `home-layout${v}-${name}.png`), fullPage: true });
      }
      await page.click('.hl-pick-b[data-lay="0"]');
      await page.waitForFunction(() => !document.querySelector('.home').dataset.layout);
      assert.equal(await page.locator('.home-week').count(), 1, 'quay về bố cục hiện tại');
      assert.deepEqual(await page.evaluate(() => window.__meCsp), [], 'không vi phạm CSP');
      assert.deepEqual(app.consoleErrors, []);
    } finally { await app.close(); }
  });
}

test('THẬT: không có nút chọn bố cục', async () => {
  const app = await openApp({ env: (() => { const e = freshServer({ envName: 'THAT' }); ownerClient(e); return e; })(), ...WEB });
  try {
    const { page } = app;
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    assert.equal(await page.locator('.hl-pick').count(), 0);
    assert.equal(await page.locator('.home-week').count(), 1);
  } finally { await app.close(); }
});
