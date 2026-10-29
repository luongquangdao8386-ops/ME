// d4.18: Bảo trì → Kế hoạch cho cả loại (chọn loại, tick máy, rải lịch cách N ngày) → trang nhóm (sửa cả nhóm cho máy đang tick,
// thêm máy cùng loại chưa có trong nhóm); trang kế hoạch của một máy có dòng "Thuộc nhóm"; web 1440 và iPhone 390 không tràn
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;
  const w = window.innerWidth;
  return ![...document.querySelectorAll('.view *')].some((el) => {
    if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
});
async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const T = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const plusDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Loại Máy nén khí 3 máy (một máy ngừng sử dụng → không tick sẵn), loại Chiller 1 máy */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const ac = uuid(), ch = uuid();
  ok(c.write('lookup.edit', { value_id: ac, group_key: 'EQUIPMENT_CATEGORY', code: 'AIR_COMP', name_vi: 'Máy nén khí', name_zh: '空压机' }));
  ok(c.write('lookup.edit', { value_id: ch, group_key: 'EQUIPMENT_CATEGORY', code: 'CHILLER', name_vi: 'Chiller', name_zh: '冷水机组' }));
  const eqs = [uuid(), uuid(), uuid()];
  eqs.forEach((e, i) => ok(c.write('equipment.create', { equipment_id: e, name_vi: `Máy nén khí 0${i + 1}`, category_id: ac })));
  ok(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy nén khí cũ', category_id: ac, status: 'RETIRED' }));
  ok(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Chiller 01', category_id: ch }));
  return { env, c, ac, eqs };
}

test('web: Kế hoạch cho cả loại — chọn loại, máy ngừng sử dụng không tick sẵn, rải lịch cách 2 ngày; trang nhóm sửa chu kỳ cho 2 máy; thêm máy mới vào nhóm', async () => {
  const { env, c, ac } = setup();
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/maintenance');
    await page.waitForSelector('#mt-group');
    await page.click('#mt-group');
    await page.waitForSelector('.pg-form #pg-list .pg-item');
    await page.selectOption('#f-category', ac);
    await page.waitForFunction(() => document.querySelectorAll('#pg-list .pg-item').length === 4);
    assert.equal(await page.locator('#pg-list input[data-eq]:checked').count(), 3, 'máy ngừng sử dụng không tick sẵn');
    assert.ok((await page.textContent('#pg-list')).includes('Ngừng sử dụng'));
    await page.fill('#f-title_vi', 'Bảo dưỡng 3 tháng');
    await page.fill('#f-interval_value', '3');
    const start = plusDays(T, 20);
    await page.fill('#f-start_date', dmy(start));
    await page.fill('#f-spread_days', '2');
    await page.locator('#f-spread_days').blur();
    await page.waitForFunction((d) => document.querySelectorAll('[data-when]')[1].textContent === d, dmy(plusDays(start, 2)));
    const when = await page.$$eval('[data-when]', (els) => els.map((e) => e.textContent));
    assert.deepEqual(when.slice(0, 3), [dmy(start), dmy(plusDays(start, 2)), dmy(plusDays(start, 4))]);
    assert.ok((await page.textContent('#fm-save')).includes('Tạo 3 kế hoạch'));
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd418-web-group-form.png'), fullPage: true });
    await page.click('#fm-save');
    await page.waitForFunction(() => location.hash.startsWith('#/maintenance/plans/group/'), null, { timeout: 15000 });
    await page.waitForSelector('.pg-list .pg-item a');
    const plans = env.rows('MaintenancePlans');
    assert.equal(plans.length, 3);
    assert.deepEqual(plans.map((p) => p.anchor_date), [start, plusDays(start, 2), plusDays(start, 4)]);
    const gid = plans[0].plan_group_id;
    assert.ok(gid && plans.every((p) => p.plan_group_id === gid));
    assert.equal(await page.locator('.pg-list .pg-item').count(), 3);
    // Sửa cả nhóm: bỏ tick máy 3, đổi chu kỳ 6 tháng
    await page.click('#pg-edit');
    await page.waitForSelector('form.pg-edit');
    await page.locator('input[data-pl]').nth(2).uncheck();
    await page.waitForFunction(() => document.querySelector('#pg-apply').textContent.includes('2'));
    await page.fill('form.pg-edit #f-interval_value', '6');
    await page.click('#pg-apply');
    await page.waitForFunction(() => !document.querySelector('form.pg-edit'), null, { timeout: 15000 });
    assert.deepEqual(env.rows('MaintenancePlans').map((p) => p.interval_value), [6, 6, 3]);
    // Máy mới cùng loại → gợi ý thêm vào nhóm
    ok(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy nén khí 04', category_id: ac }));
    await page.reload();
    await page.waitForSelector('.pg-add', { timeout: 15000 });
    assert.ok((await page.textContent('.pg-add')).includes('Máy nén khí 04'));
    await page.locator('.pg-add input[data-eq]').first().check();
    await page.fill('#f-add_start', dmy(plusDays(T, 30)));
    await page.locator('#f-add_start').blur();
    await page.click('#pg-add');
    await page.waitForFunction(() => document.querySelectorAll('.pg-list .pg-item a').length === 4, null, { timeout: 15000 });
    assert.equal(await page.locator('.pg-add').count(), 0, 'hết máy chưa có trong nhóm (máy ngừng sử dụng không gợi ý)');
    assert.equal(env.rows('MaintenancePlans').filter((p) => p.plan_group_id === gid).length, 4);
    // Trang kế hoạch một máy: dòng "Thuộc nhóm" → mở nhóm
    await page.click('.pg-list .pg-item a >> nth=0');
    await page.waitForSelector('.pg-line');
    assert.ok((await page.textContent('.pg-line')).includes('Thuộc nhóm kế hoạch 4 máy'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: Kế hoạch cho cả loại và trang nhóm không tràn ngang; kế hoạch theo giờ chạy hỏi mốc cho máy chưa ghi giờ chạy', async () => {
  const { env, c, ac, eqs } = setup();
  ok(c.write('maintenance.hours.record', { operating_reading_id: uuid(), equipment_id: eqs[0], cumulative_hours: 1200 }));
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/maintenance/plans/group?cat=' + ac);
    await page.waitForSelector('.pg-form #pg-list .pg-item');
    await page.fill('#f-title_vi', 'Thay dầu');
    await page.selectOption('#f-interval_type', 'OPERATING_HOURS');
    await page.fill('#f-interval_value', '500');
    assert.equal(await page.locator('#pg-cal').isVisible(), false);
    assert.equal(await page.locator('.pg-target').count(), 3, 'máy 2, 3 và máy cũ chưa ghi giờ chạy');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd418-iphone-group-form.png'), fullPage: true });
    await page.click('#fm-save');
    await page.waitForFunction(() => document.querySelector('.pg-machines > .ferr').textContent.includes('Nhập mốc giờ chạy'));
    await page.fill(`[data-target="${eqs[1]}"]`, '900');
    await page.fill(`[data-target="${eqs[2]}"]`, '800');
    await page.click('#fm-save');
    await page.waitForFunction(() => location.hash.startsWith('#/maintenance/plans/group/'), null, { timeout: 15000 });
    await page.waitForSelector('.pg-list .pg-item a');
    assert.deepEqual(env.rows('MaintenancePlans').map((p) => p.operating_hours_target), [1700, 900, 800]);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd418-iphone-group.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
