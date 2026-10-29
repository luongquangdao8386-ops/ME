// d4.16: Bảo trì → tab Kế hoạch năm — web bảng 12 tháng theo Loại thiết bị (dòng loại mở/thu, ký hiệu kèm chữ rê chuột, ô có phiếu
// bấm mở phiếu, tháng hiện tại tô, năm sau chưa tới hạn thì % trống chứ không 0 %), Excel có dòng từng máy; iPhone thẻ theo loại
// có dải 12 ô, bấm mở từng máy; không tràn ngang; d4.17 đủ 4 tab trong màn hình (không phải vuốt ngang)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
const Y = Number(T.slice(0, 4));
const CUR = Number(T.slice(5, 7)) - 1;

function loadXLSX() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.resolve('vendor/xlsx-0.20.3.full.min.js'), 'utf8'), ctx);
  return ctx.XLSX;
}

/** Hai loại (Chiller, Máy nén khí) + một máy chưa có kế hoạch; kế hoạch tháng ngày 15 lập từ đầu năm, phiếu tháng 1 xong đúng hạn;
 *  chiller có hạn kiểm định 20/12 */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const catCh = uuid(), catAc = uuid();
  ok(c.write('lookup.edit', { value_id: catCh, group_key: 'EQUIPMENT_CATEGORY', code: 'CHILLER', name_vi: 'Chiller', name_zh: '冷水机组' }));
  ok(c.write('lookup.edit', { value_id: catAc, group_key: 'EQUIPMENT_CATEGORY', code: 'AIR_COMP', name_vi: 'Máy nén khí', name_zh: '空压机' }));
  const ac = uuid(), ch = uuid(), other = uuid();
  ok(c.write('equipment.create', { equipment_id: ac, name_vi: 'Máy nén khí 01', category_id: catAc }));
  ok(c.write('equipment.create', { equipment_id: ch, name_vi: 'Chiller 01', category_id: catCh }));
  ok(c.write('equipment.create', { equipment_id: other, name_vi: 'Bơm chưa có kế hoạch', category_id: catAc }));
  const plan = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: ac, title_vi: 'Bảo dưỡng tháng', title_zh: '月度保养', interval_type: 'MONTH', interval_value: 1, anchor_date: `${Y}-01-15` }));
  const wo = uuid();
  ok(c.write('maintenance.wo.create', { work_order_id: wo, equipment_id: ac, title_vi: 'Bảo dưỡng tháng 1', due_date: `${Y}-01-15` }));
  const type = uuid(), req = uuid();
  ok(c.write('inspection.type.edit', { inspection_type_id: type, code: 'AP_LUC', name_vi: 'Kiểm định bình chịu áp lực', default_interval_months: 12 }));
  ok(c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: ch, inspection_type_id: type }));
  env.g.dbReset_();
  const p = env.rows('MaintenancePlans').find((r) => r.plan_id === plan);
  env.g.writeCells_('MaintenancePlans', p.__row, { created_at: `${Y}-01-01T08:00:00+07:00`, sync_revision: 99 });
  const w = env.rows('WorkOrders').find((r) => r.work_order_id === wo);
  env.g.writeCells_('WorkOrders', w.__row, { plan_id: plan, status: 'COMPLETED', end_at: `${Y}-01-14T16:00:00+07:00`, sync_revision: 99 });
  const r = env.rows('InspectionRequirements').find((x) => x.requirement_id === req);
  env.g.writeCells_('InspectionRequirements', r.__row, { current_due_date: `${Y}-12-20`, sync_revision: 99 });
  env.g.dbReset_();
  return { env, wo };
}

async function openYear(page) {
  await go(page, '#/maintenance');
  await page.waitForSelector('[data-tab="year"]');
  // d4.17: đủ 4 tab nằm trong màn hình (không phải vuốt ngang mới thấy Kế hoạch năm)
  const tabs = await page.$$eval('.chips.tabs .chip', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; }));
  assert.equal(tabs.length, 4);
  const w = await page.evaluate(() => window.innerWidth);
  for (const t of tabs) assert.ok(t.l >= 0 && t.r <= w, `tab khuất: ${t.l}–${t.r} / ${w}`);
  await page.click('[data-tab="year"]');
  await page.waitForSelector('.yr-head');
}

test('web: Kế hoạch năm — bảng 12 tháng theo loại, ô phiếu bấm mở phiếu, thu/mở loại, năm sau % trống (không 0 %), Excel; không tràn', async () => {
  const { env, wo } = setup();
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await openYear(page);
    await page.waitForSelector('.yr-table');
    const h2 = await page.textContent('.yr-head h2');
    assert.ok(h2.includes(`Kế hoạch bảo trì năm ${Y}`) && h2.includes(`${Y}年度维护计划`), h2);
    assert.equal(await page.locator('#mt-q').count(), 0, 'tab năm không có ô tìm');
    // Nhóm theo loại, tên Việt + Trung, xếp theo tên; máy chưa có kế hoạch không có dòng
    const groups = await page.$$eval('tr.yg .yg-btn > span', (els) => els.map((e) => e.textContent));
    assert.equal(groups.length, 2);
    assert.ok(groups[0].includes('Chiller') && groups[0].includes('冷水机组') && groups[1].includes('Máy nén khí') && groups[1].includes('空压机'), groups.join(' | '));
    assert.equal(await page.locator('tr.yr-row').count(), 2, 'web mặc định mở hết');
    assert.equal(await page.locator('tr.yr-row', { hasText: 'Bơm chưa có kế hoạch' }).count(), 0);
    // Tháng 1: phiếu xong đúng hạn → ● xanh, bấm mở phiếu; chữ rê chuột ghi ngày + trạng thái Việt · Trung
    const t1 = page.locator('tr.yr-row.yk-plan td.ym').nth(0);
    assert.equal(await t1.locator('.ys-done').count(), 1);
    const link = t1.locator('a.yc');
    assert.equal(await link.getAttribute('href'), `#/maintenance/wo/${wo}`);
    const tip = await link.getAttribute('title');
    assert.ok(tip.includes(`15/01/${Y}`) && tip.includes('Xong đúng hạn') && tip.includes('按期完成'), tip);
    // Tháng đã qua không có phiếu → ✕ đỏ; tháng sau tháng này → ○ dự kiến
    if (T > `${Y}-02-15`) assert.equal(await page.locator('tr.yr-row.yk-plan td.ym').nth(1).locator('.ys-missed').count(), 1);
    if (CUR < 11) assert.equal(await page.locator('tr.yr-row.yk-plan td.ym').nth(11).locator('.ys-planned').count(), 1);
    // Kiểm định chiller tháng 12
    assert.equal(await page.locator('tr.yr-row.yk-inspection td.ym').nth(11).locator('.ys').count(), 1);
    // Tháng hiện tại tô
    assert.equal(await page.locator('thead th.ym').nth(CUR).getAttribute('class'), 'ym cur');
    // KPI có % hoàn thành (đã có lần tới hạn)
    const kpi = await page.textContent('.yr-kpis');
    assert.ok(kpi.includes('Dự kiến cả năm') && kpi.includes('全年计划') && /\d+%/.test(kpi), kpi);
    // Bảng vừa khung ở 1440 px (không phải cuộn ngang), không tràn trang
    assert.ok(await page.$eval('.yr-wrap', (el) => el.scrollWidth <= el.clientWidth + 1), 'bảng 12 tháng phải vừa màn 1440 px');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd416-web-year.png'), fullPage: true });

    // Thu loại Chiller → mất một dòng; Mở hết → lại đủ
    await page.click('tr.yg[data-cat] >> nth=0');
    await page.waitForFunction(() => document.querySelectorAll('tr.yr-row').length === 1);
    assert.equal(await page.locator('tr.yg >> nth=0').locator('.yg-btn').getAttribute('aria-expanded'), 'false');
    await page.click('#yr-toggle');
    await page.waitForFunction(() => document.querySelectorAll('tr.yr-row').length === 2);

    // Excel: tên tệp theo năm, dòng loại + dòng máy, ô tháng 1 ghi ●15
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#yr-xlsx')]);
    assert.equal(dl.suggestedFilename(), `KeHoachBaoTri_${Y}.xlsx`);
    const file = path.join(SHOTS, 'd416-year.xlsx');
    await dl.saveAs(file);
    const X = loadXLSX();
    const wb = X.read(fs.readFileSync(file), { type: 'buffer' });
    assert.deepEqual(Array.from(wb.SheetNames), [`KH ${Y}`, `TH ${Y}`], 'd4.18: thêm sheet Thực hiện');
    const aoa = X.utils.sheet_to_json(wb.Sheets[`KH ${Y}`], { header: 1, defval: '' });
    const head = aoa.findIndex((r) => String(r[0]).startsWith('Loại thiết bị'));
    assert.ok(head >= 0);
    const t1Col = aoa[head].findIndex((x) => String(x).startsWith('T1 '));
    const acRow = aoa.find((r) => String(r[2]).includes('Máy nén khí 01') && String(r[3]).includes('Bảo dưỡng tháng'));
    assert.ok(acRow, 'có dòng máy nén khí');
    assert.equal(acRow[t1Col], '●15');
    assert.ok(aoa.some((r) => String(r[0]).includes('Chiller') && String(r[0]).includes('冷水机组')));
    assert.ok(aoa.some((r) => String(r[0]).startsWith('% hoàn thành')));

    // Bấm ô tháng 1 → mở phiếu
    await page.click('tr.yr-row.yk-plan td.ym >> nth=0 >> a.yc');
    await page.waitForFunction((id) => location.hash === `#/maintenance/wo/${id}`, wo);
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Bảo dưỡng tháng 1') && !document.querySelector('.yr-table'));
    // ‹ quay lại: vẫn ở tab năm; sang năm sau → mọi lần còn dự kiến, % hoàn thành trống "—"
    await page.goBack();
    await page.waitForSelector('.yr-table');
    await page.click('#yr-next');
    await page.waitForFunction((y) => document.querySelector('.yr-head h2').textContent.includes(String(y)), Y + 1);
    const kpi2 = await page.$$eval('.yr-kpi', (els) => els.map((e) => e.textContent));
    const done = kpi2.find((t) => t.startsWith('Hoàn thành'));
    assert.ok(done.endsWith('—'), `năm sau chưa tới hạn: ${done}`);
    assert.equal(await page.locator('tr.yr-row.yk-plan .ys-planned').count(), 12);
    await page.click('#yr-prev');
    await page.waitForFunction((y) => document.querySelector('.yr-head h2').textContent.includes(String(y)), Y);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: Kế hoạch năm — thẻ theo loại có dải 12 ô, bấm mở từng máy, ô không bị cắt chữ; Xuất Excel hiện nút Mở / Lưu; không tràn ngang', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await openYear(page);
    await page.waitForSelector('.yg-card');
    assert.equal(await page.locator('.yg-card').count(), 2);
    assert.equal(await page.locator('.yrow').count(), 0, 'iPhone mặc định thu gọn');
    assert.equal(await page.locator('.yg-card >> nth=1').locator('.ysc').count(), 12);
    await page.click('.yg-card >> nth=1 >> .yg-head');
    await page.waitForSelector('.yg-card.open .yrow');
    const row = page.locator('.yg-card.open .yrow').first();
    assert.ok((await row.textContent()).includes('Máy nén khí 01'));
    assert.equal(await row.locator('.ysc').nth(0).locator('.ys-done').count(), 1);
    // Ô tháng không cắt nội dung; mỗi ô đủ rộng để chạm (≥ 22 px)
    const clipped = await page.$$eval('.ysc', (cells) => cells.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.width < 22 || [...c.children].some((k) => { const b = k.getBoundingClientRect(); return b.right > r.right + 1 || b.left < r.left - 1; });
    }).length);
    assert.equal(clipped, 0);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd416-iphone-year.png'), fullPage: true });
    // Xuất Excel: bước 2 bấm "Mở / Lưu" (chia sẻ trong lần chạm)
    await page.click('#yr-xlsx');
    await page.waitForSelector('#yr-file:not([hidden])', { timeout: 20000 });
    assert.ok((await page.textContent('#yr-file')).includes('Mở / Lưu'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
