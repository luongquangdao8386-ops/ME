// d4.14: thanh 5 nút dưới (iPhone) to hơn — chữ Việt 13 px / Trung 12 px, biểu tượng 28 px, vạch navy trên nút đang mở;
// 390 px và 320 px (iPhone SE): nhãn không tràn, mỗi thứ tiếng một dòng; cuối trang không bị thanh nút che
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

/** Số đo của thanh nút: cỡ chữ, cỡ biểu tượng, nhãn tràn/xuống dòng, vạch nút đang mở */
const measure = (page) => page.evaluate(() => {
  const items = [...document.querySelectorAll('.bnav .bnav-item')];
  return items.map((it) => {
    const vi = it.querySelector('.bnav-label .vi'), zh = it.querySelector('.bnav-label .zh');
    const svg = it.querySelector('svg');
    const lineH = (el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.15;
    const r = it.getBoundingClientRect();
    return {
      vi: vi.textContent, viPx: parseFloat(getComputedStyle(vi).fontSize), zhPx: parseFloat(getComputedStyle(zh).fontSize),
      icon: svg.getBoundingClientRect().width,
      // một dòng mỗi thứ tiếng, không thò ra ngoài ô nút
      oneLine: vi.getBoundingClientRect().height <= lineH(vi) + 1 && zh.getBoundingClientRect().height <= lineH(zh) + 1,
      inside: vi.getBoundingClientRect().left >= r.left - 1 && vi.getBoundingClientRect().right <= r.right + 1 && zh.getBoundingClientRect().right <= r.right + 1,
      active: it.classList.contains('active'), bar: getComputedStyle(it, '::before').content !== 'none' && getComputedStyle(it, '::before').height
    };
  });
});

for (const [name, width, minVi] of [['iPhone 390', 390, 13], ['iPhone SE 320', 320, 12]]) {
  test(`thanh nút dưới ${name}: chữ ≥ ${minVi} px, biểu tượng ≥ 26 px, nhãn một dòng không tràn, vạch nút đang mở; cuối trang không bị che`, async () => {
    const env = freshServer();
    ownerClient(env);
    const app = await openApp({ env, viewport: { width, height: 760 }, mobile: true });
    const { page } = app;
    try {
      await login(page);
      const m = await measure(page);
      assert.equal(m.length, 5);
      for (const x of m) {
        assert.ok(x.viPx >= minVi, `${x.vi}: ${x.viPx} px`);
        assert.ok(x.zhPx >= minVi - 1, `${x.vi} (zh): ${x.zhPx} px`);
        assert.ok(x.icon >= 26, `${x.vi}: biểu tượng ${x.icon} px`);
        assert.ok(x.oneLine, `${x.vi}: nhãn xuống dòng`);
        assert.ok(x.inside, `${x.vi}: nhãn tràn khỏi nút`);
      }
      const home = m.find((x) => x.active);
      assert.ok(home && home.vi === 'Trang chủ' && home.bar === '3px', 'nút đang mở có vạch navy 3 px');
      // Cuộn hết trang chủ: ô cuối của lưới 9 mục nằm trên thanh nút
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      const gap = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.grid9 > *')];
        const last = cells[cells.length - 1].getBoundingClientRect();
        return document.querySelector('.bnav').getBoundingClientRect().top - last.bottom;
      });
      assert.ok(gap >= 0, `ô cuối bị thanh nút che ${-gap} px`);
      await page.screenshot({ path: path.join(SHOTS, `d414-bnav-${width}.png`) });
      assert.deepEqual(app.consoleErrors, []);
    } finally { await app.close(); }
  });
}
