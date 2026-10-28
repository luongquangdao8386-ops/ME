// d4.13: Lịch tháng (HOME-02) gom mọi việc theo ngày (kiểm định, hợp đồng, phiếu/kế hoạch bảo trì), lọc theo loại, chọn ngày,
// web ô ngày có việc kèm mã, iPhone chấm màu; Danh mục chung → tab Thuật ngữ đổi ngay (không chờ máy chủ), lấy sẵn, giữ trên máy
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
async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
/** Ngày Việt Nam hôm nay ± n */
const vnDate = (n = 0) => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
const T = vnDate();
const YM = T.slice(0, 7);
const LAST = (() => { const [y, m] = YM.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); })();
/** Ngày thứ n của tháng hiện tại (không quá ngày cuối tháng) */
const day = (n) => `${YM}-${String(Math.min(n, LAST)).padStart(2, '0')}`;
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Kiểm định hạn ngày 12, hợp đồng hết hạn ngày 20, phiếu BT hôm nay + hôm qua (nếu còn trong tháng), kế hoạch BT ngày cuối tháng */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }));
  const type = uuid(), req = uuid();
  ok(c.write('inspection.type.edit', { inspection_type_id: type, code: 'AP_LUC', name_vi: 'Kiểm định bình chịu áp lực', default_interval_months: 12 }));
  ok(c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type }));
  env.g.dbReset_();
  const r = env.rows('InspectionRequirements')[0];
  env.g.writeCells_('InspectionRequirements', r.__row, { current_due_date: day(12), sync_revision: 99 });
  ok(c.write('contract.create', { contract_id: uuid(), title_vi: 'Bảo trì thang máy', start_date: vnDate(-300), end_date: day(20) }));
  ok(c.write('maintenance.wo.create', { work_order_id: uuid(), equipment_id: eq, title_vi: 'Vệ sinh lọc gió', due_date: T }));
  const yesterday = vnDate(-1);
  if (yesterday.slice(0, 7) === YM) ok(c.write('maintenance.wo.create', { work_order_id: uuid(), equipment_id: eq, title_vi: 'Kiểm tra dầu', due_date: yesterday }));
  ok(c.write('maintenance.plan.edit', { plan_id: uuid(), equipment_id: eq, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: day(31) }));
  ok(c.write('glossary.edit', { glossary_id: uuid(), term_vi: 'Máy nén khí', term_zh: '空压机' }));
  return { env, c, hasOverdue: yesterday.slice(0, 7) === YM };
}

test('web: Lịch tháng — bộ lọc theo loại có số đếm, ô ngày có việc kèm mã, hôm nay chọn sẵn, bấm ngày/Cả tháng, tháng sau rồi Hôm nay; không tràn', async () => {
  const { env, hasOverdue } = setup();
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/alerts/month');
    await page.waitForSelector('.cal-grid');
    const chips = await page.textContent('.cal-chips');
    assert.ok(chips.includes('Kiểm định') && chips.includes('Hợp đồng') && chips.includes('Bảo trì'), chips);
    // Ô ngày 12: việc kiểm định kèm mã KD-0001
    assert.ok((await page.textContent(`[data-day="${day(12)}"] .cal-pills`)).includes('KD-0001'));
    assert.equal(await page.locator(`[data-day="${day(12)}"] .cal-ev.ck-inspection`).count(), 1);
    // Hôm nay: ô tròn navy, chọn sẵn → danh sách việc của hôm nay
    assert.equal(await page.locator(`[data-day="${T}"].today.sel`).count(), 1);
    assert.ok((await page.textContent('.cal-agenda')).includes(`Việc ngày ${dmy(T)}`));
    assert.ok((await page.textContent('.cal-agenda')).includes('Vệ sinh lọc gió'));
    if (hasOverdue) {
      assert.equal(await page.locator('.cal-ev.ck-wo.over').count(), 1, 'phiếu hôm qua chưa xong: quá hạn tô đỏ');
      assert.ok((await page.textContent('.cal-sum')).includes('quá hạn'));
    }
    // Cả tháng: nhóm theo ngày, có kiểm định với tên loại + thiết bị
    await page.click('#cal-all');
    await page.waitForFunction(() => document.querySelector('.cal-agenda h2').textContent.includes('Việc trong tháng'));
    const agenda = await page.textContent('.cal-agenda');
    assert.ok(agenda.includes('Việc trong tháng'));
    assert.ok(agenda.includes('Kiểm định bình chịu áp lực') && agenda.includes('Máy nén khí 01'));
    assert.ok(agenda.includes('Bảo trì thang máy'));
    await page.screenshot({ path: path.join(SHOTS, 'd413-web-month.png'), fullPage: true });
    // Lọc chỉ Kiểm định
    await page.click('.cal-chip.ck-inspection');
    await page.waitForSelector('.cal-chip.ck-inspection.on');
    assert.equal(await page.locator('.cal-ev').count(), await page.locator('.cal-ev.ck-inspection').count());
    await page.click('.cal-chips [data-kind=""]');
    // Bấm ngày 12 → danh sách ngày 12
    await page.click(`[data-day="${day(12)}"]`);
    await page.waitForSelector(`[data-day="${day(12)}"].sel`);
    await page.waitForFunction((d) => document.querySelector('.cal-agenda h2').textContent.includes(d), dmy(day(12)));
    assert.ok((await page.textContent('.cal-agenda')).includes('KD-0001'));
    assert.ok(await noOverflow(page));
    // Tháng sau → Hôm nay
    const t0 = await page.textContent('.cal-title');
    await page.click('#m-next');
    await page.waitForFunction((x) => document.querySelector('.cal-title').textContent !== x, t0);
    await page.click('#m-today');
    await page.waitForSelector(`[data-day="${T}"].today.sel`);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: Lịch tháng — ô ngày có chấm màu (không chữ), bấm ngày xem việc; không tràn ngang', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/alerts/month');
    await page.waitForSelector('.cal-grid');
    assert.ok(await page.locator(`[data-day="${day(12)}"] .cal-dot.ck-inspection`).isVisible());
    assert.equal(await page.locator(`[data-day="${day(12)}"] .cal-pills`).isVisible(), false);
    await page.click(`[data-day="${day(12)}"]`);
    await page.waitForSelector(`[data-day="${day(12)}"].sel`);
    assert.ok((await page.textContent('.cal-agenda')).includes('Kiểm định bình chịu áp lực'));
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd413-iphone-month.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('Danh mục chung → Thuật ngữ: bấm tab đổi ngay dù máy chủ chậm 2,5 giây (lấy sẵn khi mở trang); lần sau hiện ngay từ máy, không hỏi lại trong 1 phút', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...WEB, delays: { 'catalog.view': 2500 } });
  const { page, calls } = app;
  const n = () => calls.filter((a) => a === 'catalog.view').length;
  try {
    await login(page);
    await go(page, '#/admin/catalog');
    await page.waitForSelector('[data-tab="glossary"]');
    const t0 = Date.now();
    await page.click('[data-tab="glossary"]');
    await page.waitForSelector('.tab.on[data-tab="glossary"]', { timeout: 1500 });
    assert.ok(Date.now() - t0 < 1200, `đổi tab sau ${Date.now() - t0} ms`);
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('空压机'), null, { timeout: 8000 });
    assert.equal(n(), 1, 'một lượt hỏi máy chủ (lấy sẵn), bấm tab không gọi thêm');
    // Sang tab khác rồi quay lại: hiện ngay từ máy
    await page.click('[data-tab="locations"]');
    await page.waitForSelector('.tab.on[data-tab="locations"]');
    const t1 = Date.now();
    await page.click('[data-tab="glossary"]');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('空压机'), null, { timeout: 1500 });
    assert.ok(Date.now() - t1 < 1000);
    assert.equal(n(), 1);
    // Mở lại app: danh sách giữ trên máy, hiện ngay rồi mới hỏi máy chủ ở nền
    await page.reload(); // địa chỉ vẫn là #/admin/catalog, phiên còn → mở thẳng Danh mục chung
    await page.waitForSelector('[data-tab="glossary"]', { timeout: 15000 });
    await page.click('[data-tab="glossary"]');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('空压机'), null, { timeout: 1500 });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
