// Khung app Đợt 1, Thiết bị, Kho vật tư, Tài khoản — chạy với máy chủ giả lập (390×844 và 1440×900)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };

function seeded() {
  const env = freshServer();
  ownerClient(env); // đổi PIN tạm → OWNER_PIN
  env.g.pocSeedSampleData();
  return env;
}
async function login(page) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const [name, vp] of [['iphone', IPHONE], ['web', WEB]]) {
  test(`trang chủ ${name}: lưới 9 ô (5 ô mờ "Sắp có"), nav/menu, logo chỉ ở trang chủ, không M&E ở header nghiệp vụ (NT1-01, 02, 04)`, async () => {
    const app = await openApp({ env: seeded(), ...vp });
    try {
      const { page } = app;
      await login(page);
      assert.equal(await page.locator('.grid9 > .tile').count(), 9);
      const dims = page.locator('.grid9 > .tile.dim[aria-disabled="true"]');
      assert.equal(await dims.count(), 5);
      for (let i = 0; i < 5; i++) assert.ok((await dims.nth(i).textContent()).includes('Sắp có · 即将推出'));
      const grid = await page.textContent('.grid9');
      assert.ok(grid.includes('Kho vật tư · 物料库') && grid.includes('Tra cứu lộ điện · 电路查询'), 'C1');
      assert.ok(!/Kho linh kiện|备件库|mạch điện/.test(await page.textContent('body')));
      // Chạm ô mờ: không chuyển màn, báo "Chức năng sẽ có ở đợt sau"
      await dims.first().click({ force: true }); // aria-disabled không chặn chạm thật
      assert.equal(await page.evaluate(() => location.hash), '#/');
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('该功能将在后续版本推出'));
      assert.equal(await page.locator('img.brand-logo').count(), 1);
      if (name === 'iphone') {
        assert.equal(await page.locator('.bnav > *').count(), 5);
        assert.equal(await page.getAttribute('.bnav-item[data-nav="work"]', 'aria-disabled'), 'true');
        assert.ok((await page.textContent('.bnav')).includes('Nhắc hạn'));
      } else {
        assert.equal(await page.locator('.side-nav .side-item').count(), 13);
        assert.ok((await page.textContent('.side-title')).includes('Danh mục · 功能菜单'));
        assert.ok((await page.textContent('.home-today')).includes('Công việc hôm nay · 今日工作'));
      }
      assert.ok(await noOverflow(page));
      await page.screenshot({ path: path.join(SHOTS, `home-${name}.png`) });
      // Màn nghiệp vụ: không logo, header không có chữ M&E (C2)
      await go(page, '#/equipment');
      await page.waitForFunction(() => document.querySelector('#hdr-title').textContent.includes('Thiết bị'));
      assert.equal(await page.locator('img.brand-logo').count(), 0);
      assert.ok(!(await page.textContent('.hdr')).includes('M&E'));
      for (const h of ['#/alerts', '#/account', '#/account/drafts', '#/materials', '#/alerts/month']) {
        await go(page, h);
        await page.waitForTimeout(400);
        assert.ok(await noOverflow(page), h);
        assert.equal(await page.locator('img.brand-logo').count(), 0, h);
      }
      assert.deepEqual(await page.evaluate(() => window.__meCsp), [], 'không vi phạm CSP');
      assert.deepEqual(app.consoleErrors, []);
    } finally { await app.close(); }
  });
}

test('thiết bị web: thêm (ngày dd/mm/yyyy), thông số "12 350 kg/h", xung đột → sửa tiếp trên bản máy chủ, ngừng sử dụng có lý do', async () => {
  const env = seeded();
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/equipment/new');
    await page.waitForSelector('#f-name_vi');
    await page.fill('#f-name_vi', 'Máy sấy khí');
    await page.fill('#f-install_date', '6/10/2026');
    await page.fill('#f-manufacture_year', '2019');
    await page.click('#fm-save');
    await page.waitForSelector('#eq-pane .code.big', { timeout: 15000 });
    const row = env.rows('Equipment').find((e) => e.name_vi === 'Máy sấy khí');
    assert.ok(row, 'đã lưu máy chủ');
    assert.equal(row.install_date, '2026-10-06');
    assert.equal(row.manufacture_year, 2019);
    assert.equal(row.equipment_code, 'TB-0006');
    assert.match(row.name_zh, /Máy sấy khí/, 'dịch máy bên còn lại');
    // Thông số
    await page.click('#sp-add');
    await page.selectOption('#f-spec_key', 'throughput');
    await page.fill('#f-value_num', '12350');
    await page.click('[data-x="save"]');
    await page.waitForFunction(() => document.querySelector('.specs') && document.querySelector('.specs').textContent.includes('12 350 kg/h'));
    // Xung đột: máy khác sửa trước
    await go(page, `#/equipment/${row.equipment_id}/edit`);
    await page.waitForSelector('#f-model');
    const other = ownerClient2(env);
    assert.equal(other.write('equipment.edit', { equipment_id: row.equipment_id, model: 'MÁY-KHÁC' }, { expected_version: 1 }).ok, true);
    await page.fill('#f-model', 'CỦA-TÔI');
    await page.click('#fm-save');
    await page.waitForSelector('.tbl.conflict', { timeout: 15000 });
    const cf = await page.textContent('.modal');
    assert.ok(cf.includes('Bản của tôi · 我的版本') && cf.includes('Bản máy chủ · 服务器版本') && cf.includes('MÁY-KHÁC') && cf.includes('CỦA-TÔI'));
    assert.ok(!/ghi đè|覆盖/i.test(await page.textContent('.modal-actions')), 'không có nút ghi đè');
    assert.equal(await page.locator('.modal-actions .btn').count(), 3);
    await page.screenshot({ path: path.join(SHOTS, 'conflict-web.png') });
    await page.click('.modal-actions .btn.primary');
    await page.waitForSelector('.banner.warn');
    assert.equal(await page.inputValue('#f-model'), 'MÁY-KHÁC');
    assert.ok((await page.textContent('[data-field="model"] .hint')).includes('CỦA-TÔI'));
    // Ngừng sử dụng
    await go(page, `#/equipment/${row.equipment_id}`);
    await page.waitForSelector('#eq-arch');
    await page.click('#eq-arch');
    await page.fill('#ar-reason', 'Thanh lý thử');
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => location.hash === '#/equipment', null, { timeout: 15000 });
    const after = env.rows('Equipment').find((e) => e.equipment_id === row.equipment_id);
    assert.equal(after.status, 'RETIRED');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

function ownerClient2(env) {
  // Phiên thứ hai của owner (máy khác) đăng nhập bằng PIN đã đổi
  const c = { token: null, deviceId: uuid() };
  const r = env.post({ api_contract_version: '1.0', action: 'auth.login', payload: { employee_code: OWNER_CODE, pin: OWNER_PIN, device_label: 'may-khac' }, device_id: c.deviceId, app_version: '1.0.0' });
  c.token = r.data.token;
  c.write = (action, payload, extra = {}) => { env.g.dbReset_(); return env.post({ api_contract_version: '1.0', action, payload, device_id: c.deviceId, app_version: '1.0.0', dataset_epoch: env.props.getProperty('DATASET_EPOCH'), token: c.token, operation_id: uuid(), ...extra }); };
  return c;
}

test('iPhone: thêm linh kiện mới từ tab Linh kiện → gắn ngay vào máy; không có Tồn kho, có "Chưa kết nối kho" (C3, NT1-90, 91)', async () => {
  const env = seeded();
  const eq = env.rows('Equipment')[0];
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page } = app;
    await login(page);
    await go(page, `#/equipment/${eq.equipment_id}?tab=parts`);
    await page.waitForSelector('#pt-new');
    const tab = await page.textContent('#eq-tab');
    assert.ok(tab.includes('Chưa kết nối kho · 尚未连接仓库'));
    assert.ok(!tab.includes('Tồn kho') && !tab.includes('库存:'));
    await page.click('#pt-new');
    await page.waitForSelector('#f-name_vi');
    await page.fill('#f-name_vi', 'Vòng bi 6205');
    await page.fill('#f-part_number', '6205-2RS');
    await page.fill('#f-base_unit', 'cái');
    await page.click('#fm-save');
    await page.waitForSelector('#f-installed_qty', { timeout: 15000 });
    await page.fill('#f-installed_qty', '2');
    await page.fill('#f-position_vi', 'Đầu trục');
    await page.click('[data-x="save"]');
    await page.waitForSelector('.part', { timeout: 15000 });
    const part = await page.textContent('.parts');
    assert.ok(part.includes('VT-0001') && part.includes('2 cái') && part.includes('Đã xác nhận'));
    assert.equal(env.rows('EquipmentParts').length, 1);
    assert.equal(env.rows('Materials')[0].is_equipment_component, true);
    await page.screenshot({ path: path.join(SHOTS, 'parts-iphone.png'), fullPage: true });
    // Hồ sơ vật tư: dùng cho thiết bị, khối Tồn kho chỉ có dòng chưa kết nối
    await page.click('.part a.code');
    await page.waitForSelector('#mt-pane .code.big');
    const mat = await page.textContent('#mt-pane');
    assert.ok(mat.includes(eq.equipment_code) && mat.includes('Chưa kết nối kho'));
    assert.ok(!/\b0\s*cái/.test(mat), 'không hiện số tồn 0 giả');
    assert.ok(await noOverflow(page));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('Tài khoản: phiên đăng nhập có "Máy này"; đăng xuất khi còn nháp hỏi 4 lựa chọn, giữ nháp (2.5)', async () => {
  const env = seeded();
  const app = await openApp({ env, ...IPHONE });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/account');
    await page.waitForFunction(() => (document.querySelector('#ac-sessions') || {}).textContent?.includes('Máy này'), null, { timeout: 15000 });
    const acc = await page.textContent('.view');
    assert.ok(acc.includes('NV-001') && acc.includes('Quản trị · 管理员') && acc.includes('1.0'));
    // Tạo một nháp chờ gửi trên máy
    await page.evaluate(async () => { const s = await import('./js/sync.js'); await s.enqueue('inspection.submit', { inspection_id: crypto.randomUUID() }, { entity_type: 'INSPECTION' }); });
    await go(page, '#/account/drafts');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Nộp chứng nhận kiểm định'));
    await go(page, '#/account');
    await page.waitForSelector('#ac-logout');
    await page.click('#ac-logout');
    await page.waitForSelector('.modal');
    const dlg = await page.textContent('.modal');
    for (const s of ['Đồng bộ ngay · 立即同步', 'Xuất dự phòng · 导出备份', 'Giữ nháp trên máy · 保留本机草稿', 'Xóa nháp · 删除草稿']) assert.ok(dlg.includes(s), s);
    await page.screenshot({ path: path.join(SHOTS, 'logout-drafts-iphone.png') });
    await page.click('.modal-actions .btn.primary'); // Giữ nháp trên máy
    await page.waitForSelector('.login-card');
    const left = await page.evaluate(async () => { const s = await import('./js/sync.js'); return (await s.queueItems()).length; });
    assert.equal(left, 1, 'nháp còn nguyên');
  } finally { await app.close(); }
});

test('Nhắc hạn: lọc trạng thái kèm số lượng, sắp xếp quá hạn trước; thẻ hạn ở trang chủ', async () => {
  const env = seeded();
  const g = env.g;
  const today = g.dateVN_(new env.clock.Date());
  const plus = (n) => g.dateVN_(new env.clock.Date(Date.parse(today + 'T00:00:00+07:00') + n * 86400000));
  g.dbReset_();
  g.withWriteLock_(() => {
    const reqs = g.readRows_('InspectionRequirements');
    g.writeCells_('InspectionRequirements', reqs[0].__row, { current_due_date: plus(5), sync_revision: 99 });
    g.writeCells_('InspectionRequirements', reqs[1].__row, { current_due_date: plus(-3), sync_revision: 99 });
  });
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page);
    assert.ok((await page.textContent('.home-deadlines')).includes('Quá hạn 3 ngày · 已逾期 3 天'));
    await go(page, '#/alerts');
    await page.waitForSelector('.chips .chip');
    const chips = await page.textContent('.filters');
    assert.ok(chips.includes('Quá hạn · 已逾期 1') && chips.includes('Sắp tới hạn · 即将到期 1') && chips.includes('Chưa đủ hồ sơ · 资料不全 1'));
    const rows = await page.$$eval('.tbl tbody tr', (trs) => trs.map((t) => t.textContent));
    assert.ok(rows[0].includes('Quá hạn 3 ngày'), 'quá hạn đứng đầu');
    assert.ok(rows[1].includes('Còn 5 ngày'));
    assert.ok(rows[2].includes('Chưa đủ hồ sơ'));
    await page.screenshot({ path: path.join(SHOTS, 'alerts-web.png') });
  } finally { await app.close(); }
});
