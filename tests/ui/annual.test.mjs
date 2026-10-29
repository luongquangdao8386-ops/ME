// d4.18: tab Kế hoạch năm → chốt (nháp) → gửi duyệt → người lập không tự duyệt → Quản trị duyệt bằng PIN → mã KHN-năm-01,
// KPI "so với bản đã duyệt", PDF, Excel có sheet Thực hiện; "Chờ bạn xử lý" ở trang chủ của người duyệt; iPhone không tràn
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

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
async function login(page, code, pin) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const T = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const Y = Number(T.slice(0, 4));
const C3_PIN = '694127';

function loadXLSX() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.resolve('vendor/xlsx-0.20.3.full.min.js'), 'utf8'), ctx);
  return ctx.XLSX;
}

/** Loại Máy nén khí 2 máy, kế hoạch tháng ngày 15 lập từ đầu năm, phiếu tháng 1 xong đúng hạn; người lập C3 */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  userClient(env, 'U-C3', 3, C3_PIN);
  const cat = uuid();
  ok(c.write('lookup.edit', { value_id: cat, group_key: 'EQUIPMENT_CATEGORY', code: 'AIR_COMP', name_vi: 'Máy nén khí', name_zh: '空压机' }));
  const eqs = [uuid(), uuid()];
  eqs.forEach((e, i) => ok(c.write('equipment.create', { equipment_id: e, name_vi: `Máy nén khí 0${i + 1}`, category_id: cat })));
  const plan = uuid(), wo = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eqs[0], title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: `${Y}-01-15` }));
  ok(c.write('maintenance.wo.create', { work_order_id: wo, equipment_id: eqs[0], title_vi: 'Bảo dưỡng tháng 1', due_date: `${Y}-01-15` }));
  env.g.dbReset_();
  const p = env.rows('MaintenancePlans')[0];
  env.g.writeCells_('MaintenancePlans', p.__row, { created_at: `${Y}-01-01T08:00:00+07:00`, sync_revision: 99 });
  const w = env.rows('WorkOrders').find((r) => r.work_order_id === wo);
  env.g.writeCells_('WorkOrders', w.__row, { plan_id: plan, status: 'COMPLETED', end_at: `${Y}-01-14T16:00:00+07:00`, sync_revision: 99 });
  env.g.dbReset_();
  return { env, c, cat, eqs };
}

async function openYear(page) {
  await go(page, '#/maintenance');
  await page.waitForSelector('[data-tab="year"]');
  await page.click('[data-tab="year"]');
  await page.waitForSelector('#ap-box');
}

test('web: người lập chốt + gửi duyệt (không tự duyệt), Quản trị thấy "Chờ bạn xử lý", duyệt bằng PIN → KHN-năm-01, KPI so với bản duyệt, PDF, Excel sheet Thực hiện', async () => {
  const { env } = setup();
  const a = await openApp({ env, ...WEB });
  try {
    const { page } = a;
    await login(page, 'U-C3', C3_PIN);
    await openYear(page);
    assert.ok((await page.textContent('#ap-box')).includes('Chưa chốt'));
    // Máy 02 chưa có kế hoạch → gợi ý lập kế hoạch cho loại
    assert.ok((await page.textContent('.yr-missing')).includes('Máy nén khí'));
    await page.click('#ap-new');
    await page.waitForSelector('#ap-submit', { timeout: 15000 });
    let rec = env.rows('AnnualPlans')[0];
    assert.equal(rec.status, 'DRAFT');
    assert.equal(rec.year, Y);
    assert.equal(rec.planned_count, 12, 'kế hoạch tháng: 12 lần trong năm');
    assert.ok((await page.textContent('#ap-box')).includes('Nháp'));
    await page.click('#ap-submit');
    await page.waitForFunction(() => document.querySelector('#ap-box').textContent.includes('Chờ duyệt'), null, { timeout: 15000 });
    assert.equal(env.rows('AnnualPlans')[0].status, 'SUBMITTED');
    assert.equal(await page.locator('#ap-approve').count(), 0, 'người lập không có nút Duyệt');
    assert.ok((await page.textContent('#ap-box')).includes('không tự duyệt'));
    // PDF bản chờ duyệt (máy tính tải thẳng)
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('[data-ap-pdf]')]);
    assert.equal(dl.suggestedFilename(), `KHN-${Y}-01-submitted.pdf`);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd418-web-annual-submitted.png'), fullPage: true });
    assert.deepEqual(a.consoleErrors, []);
  } finally { await a.close(); }

  const b = await openApp({ env, ...WEB });
  try {
    const { page } = b;
    await login(page, OWNER_CODE, OWNER_PIN);
    // Trang chủ: Chờ bạn xử lý → bấm tới tab năm
    await page.waitForSelector('.pending-me', { timeout: 15000 });
    assert.ok((await page.textContent('.pending-me')).includes('Kế hoạch năm chờ duyệt'));
    await page.click('.pending-me a');
    await page.waitForSelector('#ap-approve', { timeout: 15000 });
    await page.click('#ap-approve');
    await page.waitForSelector('.modal .pin-input', { timeout: 15000 });
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction((y) => document.querySelector('#ap-box').textContent.includes(`KHN-${y}-01`), Y, { timeout: 15000 });
    const rec = env.rows('AnnualPlans')[0];
    assert.equal(rec.status, 'APPROVED');
    assert.equal(rec.annual_plan_code, `KHN-${Y}-01`);
    // Bản chụp tải về máy → KPI theo bản duyệt
    await page.waitForSelector('.ap-kpis', { timeout: 15000 });
    const kpi = await page.textContent('.ap-kpis');
    assert.ok(kpi.includes('Kế hoạch (bản duyệt)') && kpi.includes('12'), kpi);
    assert.ok((await page.textContent('.yr-head')).includes(`So với bản đã duyệt KHN-${Y}-01`));
    assert.ok(await page.locator('#ap-new').isVisible(), 'lập lần điều chỉnh');
    assert.ok((await page.textContent('#ap-new')).includes('Lập lần điều chỉnh 02'));
    await page.screenshot({ path: path.join(SHOTS, 'd418-web-annual-approved.png'), fullPage: true });
    // Excel: sheet Thực hiện theo bản duyệt
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#yr-xlsx')]);
    const file = path.join(SHOTS, 'd418-annual.xlsx');
    await dl.saveAs(file);
    const X = loadXLSX();
    const wb = X.read(fs.readFileSync(file), { type: 'buffer' });
    assert.deepEqual(Array.from(wb.SheetNames), [`KH ${Y}`, `TH ${Y}`]);
    const aoa = X.utils.sheet_to_json(wb.Sheets[`TH ${Y}`], { header: 1, defval: '' });
    assert.ok(String(aoa[1][0]).includes(`So với bản đã duyệt KHN-${Y}-01`));
    const yearRow = aoa.find((r) => String(r[0]).startsWith('Cả năm'));
    assert.equal(yearRow[1], 12);
    assert.ok(aoa.some((r) => String(r[0]).startsWith('Quý 1')));
    assert.deepEqual(b.consoleErrors, []);
  } finally { await b.close(); }
});

test('iPhone: khung kế hoạch năm (nháp, trả lại có lý do) không tràn; người lập thấy lý do trả lại và "Chờ bạn xử lý"', async () => {
  const { env, c } = setup();
  // C3 lập + gửi, Quản trị trả lại (qua API)
  const c3 = userClient(env, 'U-C3B', 3, '583104');
  const id = uuid();
  const snap = { year: Y, groups: [{ key: '', name_vi: '', name_zh: '', rows: [{ kind: 'PLAN', ref_id: env.rows('MaintenancePlans')[0].plan_id, equipment_id: env.rows('MaintenancePlans')[0].equipment_id, equipment_code: 'TB-0001', title_vi: 'Bảo dưỡng tháng', dates: [`${Y}-01-15`] }] }] };
  const s = ok(c3.write('annual_plan.save', { annual_plan_id: id, year: Y, snapshot: snap }));
  ok(c3.write('annual_plan.submit', { annual_plan_id: id }, { expected_version: s.data.record_version }));
  const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  ok(c.write('annual_plan.approve', { annual_plan_id: id, decision: 'RETURN', reason: 'Thiếu máy nén 02' }, { expected_version: s.data.record_version + 1, reauth_token: rt }));
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page, 'U-C3B', '583104');
    await page.waitForSelector('.pending-me', { timeout: 15000 });
    assert.ok((await page.textContent('.pending-me')).includes('Kế hoạch năm bị trả lại'));
    await openYear(page);
    const box = await page.textContent('#ap-box');
    assert.ok(box.includes('Bị trả lại') && box.includes('Thiếu máy nén 02'), box);
    assert.ok(await page.locator('#ap-resave').isVisible());
    assert.ok(await page.locator('#ap-submit').isVisible());
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd418-iphone-annual-returned.png'), fullPage: true });
    // Cập nhật theo lịch hiện tại → về Nháp
    await page.click('#ap-resave');
    await page.waitForFunction(() => document.querySelector('#ap-box').textContent.includes('Nháp'), null, { timeout: 15000 });
    assert.equal(env.rows('AnnualPlans')[0].status, 'DRAFT');
    assert.equal(env.rows('AnnualPlans')[0].planned_count, 12);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
