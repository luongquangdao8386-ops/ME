// Đợt 3 trên giao diện: Điện nước (UT-01..03, WEB-UT-01), Lộ điện (CI-01..03, WEB-CI-01, B2), Báo cáo (RE-01..03, WEB-RE-01)
// — 390×844 và 1440×900; nhập chỉ số khi mất mạng; quét tem đồng hồ mở màn nhập chỉ số; báo cáo không logo
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import zlib from 'node:zlib';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid, fakePdfB64 } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
function png(w = 32, h = 24, rgb = [200, 60, 40]) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
/** Không phần tử nào thò ra ngoài bề ngang màn hình (trừ nội dung trong khung cuộn ngang .table-wrap/.chips) */
const noOverflow = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;
  const w = window.innerWidth;
  return ![...document.querySelectorAll('.view *')].some((el) => {
    if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
});
const queue = (page) => page.evaluate(async () => (await (await import('./js/sync.js')).queueItems()).map((o) => ({ a: o.action, id: o.entity_id, parent: o.parent_id, state: o.state })));
const viewText = (page) => page.textContent('.view');

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

async function waitQueueEmpty(page) {
  for (let i = 0; i < 80 && (await queue(page)).length > 0; i++) await page.waitForTimeout(400);
  assert.deepEqual(await queue(page), []);
}

/** Ngày giờ Việt Nam theo đồng hồ thật lùi n ngày: 'YYYY-MM-DD' */
const dayVN = (n = 0) => new Date(Date.now() + 7 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const T = (d, hm) => `${d}T${hm}:00+07:00`;
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Đầu kỳ 5 ngày chứa ngày d (1, 6, 11, 16, 21, 26) */
const p5 = (d) => { const day = Number(d.slice(8, 10)); const s = Math.min(26, Math.floor((day - 1) / 5) * 5 + 1); return d.slice(0, 8) + String(s).padStart(2, '0'); };

/**
 * Máy chủ: khu vực Xưởng A; đồng hồ điện (2 kỳ 5 ngày trước: 12 350 → 12 480 = 130 kWh) và nước (610 → 625); biểu giá điện đã duyệt;
 * nguồn lưới → MBA → tủ tổng → tủ DB1 (nối thiết bị "Tủ DB1", có phiếu sửa) → lộ máy nén; ĐN, KT
 */
function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  const loc = uuid();
  ok(c.write('location.edit', { location_id: loc, name_vi: 'Xưởng A', name_zh: 'A车间', type: 'WORKSHOP' }));
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  // Kỳ 5 ngày đã đóng gần nhất: đầu kỳ hiện tại lùi 2 kỳ (kỳ trước còn có thể đang trong cửa sổ chốt)
  const cur = p5(dayVN());
  const a = p5(shift(cur, -6));
  const b = p5(shift(a, 5));
  const elec = uuid(), water = uuid();
  ok(c.write('meter.edit', { meter_id: elec, name_vi: 'Điện xưởng A', name_zh: 'A厂房电表', utility_type: 'ELECTRICITY', location_id: loc, multiplier: 1, reading_cycle_type: 'DAY_5' }));
  ok(c.write('meter.edit', { meter_id: water, name_vi: 'Nước xưởng A', name_zh: 'A厂房水表', utility_type: 'WATER', location_id: loc, multiplier: 1, reading_cycle_type: 'DAY_5' }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: elec, measured_at: T(a, '07:45'), cumulative_value: 12350 }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: elec, measured_at: T(b, '08:00'), cumulative_value: 12480 }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: water, measured_at: T(a, '07:50'), cumulative_value: 610 }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: water, measured_at: T(b, '08:05'), cumulative_value: 625 }));
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const tf = uuid();
  ok(c3.write('tariff.edit', { tariff_id: tf, utility_type: 'ELECTRICITY', effective_from: '2026-01-01', unit_price: 2000, tax_rate: 8, name_vi: 'Giá điện 2026' }));
  ok(c.write('tariff.approve', { tariff_id: tf, decision: 'APPROVE' }, { expected_version: env.rows('UtilityTariffs')[0].record_version, reauth_token: c.reauth() }));
  // Lộ điện
  const eqDb = uuid(), eqM = uuid();
  ok(c.write('equipment.create', { equipment_id: eqDb, name_vi: 'Tủ DB1', location_id: loc }));
  ok(c.write('equipment.create', { equipment_id: eqM, name_vi: 'Máy nén khí 37 kW', location_id: loc }));
  ok(kt.write('repair.report', { repair_id: uuid(), equipment_id: eqDb, symptom_vi: 'Aptomat tổng nhảy', severity: 'HIGH' }));
  const panel = (name, type, extra = {}) => { const id = uuid(); ok(c.write('circuit.edit', { entity: 'PANEL', panel_id: id, name_vi: name, panel_type: type, ...extra })); return id; };
  const circuit = (pid, name, extra = {}) => { const id = uuid(); ok(c.write('circuit.edit', { entity: 'CIRCUIT', circuit_id: id, panel_id: pid, name_vi: name, ...extra })); return id; };
  const load = (cid, extra) => ok(c.write('circuit.edit', { entity: 'LOAD', load_link_id: uuid(), circuit_id: cid, ...extra }));
  const G = panel('Điểm nhận lưới 22 kV', 'SOURCE_GRID');
  const MBA = panel('MBA 1000 kVA', 'SOURCE_TRANSFORMER');
  const MSB = panel('Tủ tổng MSB', 'MAIN_SWITCHBOARD', { location_id: loc });
  const DB = panel('Tủ DB1', 'DISTRIBUTION_BOARD', { equipment_id: eqDb });
  const c1 = circuit(G, 'Lộ lưới → MBA'); load(c1, { downstream_panel_id: MBA });
  const c2 = circuit(MBA, 'Lộ MBA → MSB'); load(c2, { downstream_panel_id: MSB });
  const c3c = circuit(MSB, 'Lộ MSB → DB1', { voltage: 400, phases: 3, breaker_rating_a: 250, cable_section_mm2: '4x95' }); load(c3c, { downstream_panel_id: DB });
  const c5 = circuit(DB, 'Lộ máy nén khí', { voltage: 380, phases: 3, breaker_model: 'NSX100', breaker_rating_a: 63, cable_type: 'CVV', cable_section_mm2: '4x16', cable_length_m: 35 });
  load(c5, { equipment_id: eqM, rated_load_kw: 37 });
  return { env, c, loc, elec, water, a, b, eqDb, eqM, DB, MSB, c5, dn, kt };
}

test('iPhone C4: trang chủ có Điện nước/Lộ điện/Báo cáo; UT-01 kỳ 5 ngày 130 kWh + biểu đồ; UT-02 đồng hồ; UT-03 nhập chỉ số khi mất mạng → có mạng gửi đúng 1 chỉ số; báo cáo điện nước không logo', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...IPHONE });
  const { page, context, env } = app;
  try {
    await login(page);
    for (const k of ['utilities', 'circuits', 'reports']) assert.equal(await page.locator(`.grid9 a.tile[href="#/${k}"]`).count(), 1, k + ' đã mở (không còn Sắp có)');
    assert.ok((await page.textContent('.grid9')).includes('lộ'), 'ô Lộ điện có số lộ');
    await page.screenshot({ path: path.join(SHOTS, 'd3-home-iphone.png'), fullPage: true });
    // UT-01: lùi về kỳ đã chốt
    await go(page, '#/utilities');
    await page.waitForSelector('.ut-filters');
    const elecKpi = () => page.textContent('.kpi.tone-elec .kpi-value').catch(() => '');
    for (let i = 0; i < 4 && !(await elecKpi()).includes('130'); i++) { await page.click('#ut-prev'); await page.waitForTimeout(600); }
    await page.waitForFunction(() => document.querySelector('.kpi.tone-elec .kpi-value') && document.querySelector('.kpi.tone-elec .kpi-value').textContent.includes('130'));
    assert.ok((await page.textContent('.kpis')).includes('kWh'));
    assert.ok((await page.textContent('.kpis')).includes('15'), 'nước 15 m³');
    assert.equal(await page.locator('.vz').count(), 2, 'biểu đồ điện và nước tách riêng');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-ut01-iphone.png'), fullPage: true });
    // UT-02
    await go(page, '#/utilities/meters');
    await page.waitForSelector('.meter-card');
    assert.equal(await page.locator('.meter-card').count(), 2);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-ut02-iphone.png'), fullPage: true });
    // Hồ sơ đồng hồ điện
    await go(page, `#/utilities/meters/${s.elec}`);
    await page.waitForSelector('.ut-head');
    assert.ok((await viewText(page)).includes('12 480') || (await viewText(page)).includes('12 480'));
    await page.screenshot({ path: path.join(SHOTS, 'd3-meter-iphone.png'), fullPage: true });
    // UT-03: mất mạng → lưu trên máy
    await go(page, `#/utilities/read/${s.elec}`);
    await page.waitForSelector('#f-val');
    await context.setOffline(true);
    await page.fill('#f-val', '12610');
    await page.waitForFunction(() => document.querySelector('#ut-use').textContent.includes('130'));
    await page.screenshot({ path: path.join(SHOTS, 'd3-ut03-iphone.png'), fullPage: true });
    await page.click('#ut-send');
    await page.waitForSelector('[data-tab="readings"]', { timeout: 15000 });
    const q = await queue(page);
    assert.deepEqual(q.map((x) => x.a), ['reading.create']);
    assert.ok((await viewText(page)).includes('Đã lưu trên máy'));
    await context.setOffline(false);
    await waitQueueEmpty(page);
    const reads = env.rows('MeterReadings').filter((r) => r.meter_id === s.elec);
    assert.equal(reads.length, 3);
    assert.equal(reads.filter((r) => r.cumulative_value === 12610).length, 1);
    // Báo cáo điện nước kỳ đã chốt: không logo, có số báo cáo khi lưu
    await go(page, `#/reports/run/RPT_UTILITIES?period_type=DAY_5&date=${s.a}`);
    await page.waitForSelector('.paper');
    assert.ok((await page.textContent('.paper')).includes('130'));
    assert.equal(await page.locator('.view .brand, .view img[src*="logo"], .paper svg.brand-logo').count(), 0, 'không logo trên báo cáo');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-re02-iphone.png'), fullPage: true });
    await page.click('#rp-save');
    await page.waitForSelector('.rp-run-head .code.big', { timeout: 15000 });
    assert.match(await page.textContent('.rp-run-head .code.big'), /^BC-\d{4}-001$/);
    assert.equal(env.rows('ReportRuns').length, 1);
    await go(page, '#/reports');
    await page.waitForSelector('.rp-list');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-re01-iphone.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone C4: Lộ điện — danh sách theo tủ, hồ sơ lộ (thông số, phụ tải), đường cấp từ máy nén tới lưới; B2: mở tủ thấy hồ sơ thiết bị và phiếu sửa; hồ sơ thiết bị có lối Lộ điện', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/circuits');
    await page.waitForSelector('.ci-group');
    assert.equal(await page.locator('.ci-group').count(), 4);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-ci01-iphone.png'), fullPage: true });
    await go(page, `#/circuits/c/${s.c5}`);
    await page.waitForSelector('.ci-detail');
    const t = await viewText(page);
    assert.ok(t.includes('Lộ máy nén khí') && t.includes('Máy nén khí 37 kW'));
    assert.ok(t.includes('Điểm nhận lưới'), 'nguồn của lộ');
    assert.ok(t.includes('63') && t.includes('4×16'));
    assert.ok(t.includes('Tra cứu không xác nhận đã cô lập điện'));
    await page.screenshot({ path: path.join(SHOTS, 'd3-ci02-iphone.png'), fullPage: true });
    await page.click('[data-tab="loads"]');
    await page.waitForFunction(() => document.querySelector('#ci-tab').textContent.includes('37'));
    // CI-03 đường cấp từ thiết bị phụ tải
    await go(page, `#/circuits/trace?equipment=${s.eqM}`);
    await page.waitForSelector('.ci-chain');
    assert.equal(await page.locator('.ci-path').count(), 1);
    assert.ok((await page.textContent('.ci-path')).includes('Tới nguồn'));
    assert.equal(await page.locator('.ci-path .ci-node').count(), 9);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-ci03-iphone.png'), fullPage: true });
    // B2: tủ DB1 nối thiết bị "Tủ DB1" → hồ sơ thiết bị, phiếu sửa của thiết bị
    await go(page, `#/circuits/p/${s.DB}`);
    await page.waitForSelector('.ci-detail');
    const pt = await viewText(page);
    assert.ok(pt.includes('Aptomat tổng nhảy'), 'thấy phiếu sửa của thiết bị nối tủ');
    assert.equal(await page.locator(`a[href="#/equipment/${s.eqDb}"]`).count() > 0, true);
    await page.screenshot({ path: path.join(SHOTS, 'd3-panel-iphone.png'), fullPage: true });
    await go(page, `#/equipment/${s.eqDb}`);
    await page.waitForSelector('.eq-head');
    assert.equal(await page.locator(`.eq-head a[href="#/circuits/p/${s.DB}"]`).count(), 1, 'hồ sơ thiết bị có lối sang Lộ điện');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone C4: Tra cứu lộ điện — vào lại từ trang chủ thì ô tìm và bộ lọc trống; ‹ quay lại từ hồ sơ lộ thì giữ; nút Lộ điện / Tủ điện như web', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await page.click('.grid9 a.tile[href="#/circuits"]');
    await page.waitForSelector('.ci-group');
    // Lọc theo tủ + gõ tìm → mở lộ → ‹ quay lại: giữ nguyên
    await page.selectOption('#ci-panel', s.DB);
    await page.waitForFunction(() => document.querySelectorAll('.ci-group').length === 1);
    await page.focus('#ci-q');
    await page.keyboard.type('máy nén', { delay: 50 });
    await page.waitForTimeout(500);
    await page.click(`a.ci-row[href="#/circuits/c/${s.c5}"]`);
    await page.waitForSelector('.ci-detail');
    await page.click('#hdr-back');
    await page.waitForSelector('#ci-q');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#ci-q').value, document.querySelector('#ci-panel').value]), ['máy nén', s.DB]);
    // Về trang chủ (nút dưới) rồi bấm lại ô Tra cứu lộ điện: ô tìm và bộ lọc trống, đủ 4 tủ
    await page.click('.bnav-item[data-path="/"]');
    await page.waitForSelector('.grid9');
    await page.click('.grid9 a.tile[href="#/circuits"]');
    await page.waitForSelector('.ci-group');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#ci-q').value, document.querySelector('#ci-panel').value]), ['', '']);
    assert.equal(await page.locator('.ci-group').count(), 4);
    // Nút Tủ điện: danh sách 4 tủ (loại tủ, số lộ), chạm mở hồ sơ tủ
    assert.equal(await page.locator('.ci-mode .seg').count(), 2);
    await page.click('.ci-mode .seg[data-mode="panels"]');
    await page.waitForSelector('.ci-panels');
    assert.equal(await page.locator('.ci-panels a.ci-row').count(), 4);
    const pt = await page.textContent('.ci-panels');
    assert.ok(pt.includes('Tủ tổng MSB') && pt.includes('Tổng 1 lộ'), pt);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-ci01-panels-iphone.png'), fullPage: true });
    await page.click(`.ci-panels a.ci-row[href="#/circuits/p/${s.DB}"]`);
    await page.waitForSelector('.ci-detail');
    assert.ok((await viewText(page)).includes('Lộ máy nén khí'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: KT vừa tải bản vẽ lộ lên (máy này chưa đồng bộ) → tab Tài liệu vẫn hiện bản Chờ duyệt và nút Duyệt → PIN → Phiên bản đã duyệt', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    const did = uuid();
    const up = s.kt.write('circuit.drawing.upload', { document_id: did, entity_type: 'CIRCUIT', entity_id: s.c5, mime_type: 'application/pdf', content_b64: fakePdfB64(), title_vi: 'Sơ đồ lộ máy nén' });
    assert.equal(up.ok, true, JSON.stringify(up).slice(0, 200));
    await go(page, `#/circuits/c/${s.c5}`);
    await page.waitForSelector('#ci-pane [data-tab="documents"]');
    await page.click('#ci-pane [data-tab="documents"]');
    await page.waitForSelector(`[data-dr-ok="${did}"]`, { timeout: 15000 });
    assert.ok((await page.textContent('#ci-tab')).includes('Sơ đồ lộ máy nén'));
    await page.click(`[data-dr-ok="${did}"]`);
    await page.waitForSelector('.modal .pin-input', { timeout: 15000 });
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => document.querySelector('#ci-tab').textContent.includes('Phiên bản đã duyệt'), null, { timeout: 15000 });
    assert.equal(s.env.rows('Documents').find((d) => d.document_id === did).approval_status, 'APPROVED');
    assert.equal(await page.locator(`[data-dr-ok="${did}"]`).count(), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone ĐN: quét tem đồng hồ mở thẳng màn nhập chỉ số; KT quét cùng tem thì sang hồ sơ đồng hồ (không ghi chỉ số)', async () => {
  const s = setup();
  const qr = s.env.rows('QrRegistry').find((q) => q.entity_id === s.water).qr_key;
  for (const [code, pin, sel] of [['U-DN', '583016', '#f-val'], ['U-KT', '583017', '.ut-head']]) {
    const app = await openApp({ env: s.env, ...IPHONE });
    try {
      await login(app.page, code, pin);
      await go(app.page, `#/r/${qr}`);
      await app.page.waitForSelector(sel, { timeout: 15000 });
      if (code === 'U-KT') assert.equal(await app.page.locator('#f-val').count(), 0);
      assert.deepEqual(app.consoleErrors, []);
    } finally { await app.close(); }
  }
});

test('web C4: WEB-UT-01 bảng đồng hồ + hai biểu đồ; WEB-CI-01 bảng lộ + vùng hồ sơ; WEB-RE-01 mẫu + xem trước như trang in + báo cáo đã lưu', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...WEB });
  const { page, env } = app;
  try {
    await login(page);
    await go(page, '#/utilities');
    await page.waitForSelector('.ut-filters');
    const elecKpi = () => page.textContent('.kpi.tone-elec .kpi-value').catch(() => '');
    for (let i = 0; i < 4 && !(await elecKpi()).includes('130'); i++) { await page.click('#ut-prev'); await page.waitForTimeout(600); }
    await page.waitForSelector('.ut-table');
    assert.equal(await page.locator('.ut-table tbody tr').count(), 2);
    assert.ok((await page.textContent('.ut-table')).includes('280'), 'C4 thấy chi phí theo biểu giá');
    assert.equal(await page.locator('.ut-charts.two .vz').count(), 2);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-web-ut01.png'), fullPage: true });
    await go(page, '#/circuits');
    await page.waitForSelector('.ci-table');
    await page.click(`tr[data-href="/circuits/c/${s.c5}"]`);
    await page.waitForSelector('#ci-pane .ci-detail');
    assert.ok((await page.textContent('#ci-pane')).includes('Lộ máy nén khí'));
    assert.equal(await page.locator('#ci-pane .ci-qr svg').count(), 1);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-web-ci01.png'), fullPage: true });
    await go(page, '#/reports');
    await page.waitForSelector('.rp-web');
    await page.click('[data-view="RPT_CIRCUITS"]');
    await page.waitForSelector('#rp-paper .paper', { timeout: 15000 });
    assert.ok((await page.textContent('#rp-paper')).includes('Lộ máy nén khí'));
    assert.ok((await page.textContent('#rp-paper')).includes('Người duyệt'));
    assert.equal(await page.locator('.rp-web img, .rp-web .brand').count(), 0, 'xem trước không logo');
    await page.click('#rp-save');
    await page.waitForSelector('.rp-run-head .code.big', { timeout: 15000 });
    assert.equal(env.rows('ReportRuns').length, 1);
    await go(page, '#/reports');
    await page.waitForSelector('.rp-web');
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd3-web-re01.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone: Điện nước mở nhanh — vào lại hiện ngay số đã lưu trên máy, hỏi lại máy chủ ở nền rồi vẽ lại khi số đổi; ‹ dùng kỳ lấy sẵn', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...IPHONE });
  const { page, calls } = app;
  const sumCalls = () => calls.filter((x) => x === 'utility.view').length;
  const elecKpi = () => page.textContent('.kpi.tone-elec .kpi-value').catch(() => '');
  try {
    await login(page);
    await go(page, '#/utilities');
    await page.waitForSelector('.ut-filters');
    await page.click('[data-period="DAY_5"]');
    await page.waitForSelector('.kpi.tone-elec');
    for (let i = 0; i < 4 && !(await elecKpi()).includes('130'); i++) { await page.click('#ut-prev'); await page.waitForTimeout(700); }
    assert.ok((await elecKpi()).includes('130'));
    // Máy khác ghi số chốt sớm hơn trong cửa sổ (07:00 = 12 470) → tiêu thụ kỳ đó thành 120
    assert.equal(s.dn.write('reading.create', { reading_id: uuid(), meter_id: s.elec, measured_at: T(s.b, '07:00'), cumulative_value: 12470 }).ok, true);
    await go(page, '#/');
    await page.waitForSelector('.grid9');
    // Ghi lại mọi giá trị ô Điện xuất hiện khi vào lại màn
    await page.evaluate(() => {
      window.__kpi = [];
      new MutationObserver(() => { const el = document.querySelector('.kpi.tone-elec .kpi-value'); const t = el ? el.textContent : ''; if (t && window.__kpi[window.__kpi.length - 1] !== t) window.__kpi.push(t); })
        .observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    const before = sumCalls();
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => (window.__kpi || []).some((t) => t.includes('120')), null, { timeout: 15000 });
    const seen = await page.evaluate(() => window.__kpi);
    assert.ok(seen[0].includes('130'), 'hiện ngay số đã lưu: ' + JSON.stringify(seen));
    assert.ok(sumCalls() > before, 'có hỏi lại máy chủ ở nền');
    // Kỳ trước đã lấy sẵn: bấm ‹ là có số ngay (không vòng chờ)
    await page.click('#ut-prev');
    await page.waitForSelector('.ut-filters');
    assert.equal(await page.locator('.ut-loading').count(), 0, 'kỳ trước hiện ngay');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone ĐN: nhập chỉ số kèm ảnh khi mất mạng → có mạng: chỉ số và đúng 1 ảnh lên máy chủ (ảnh xem bằng link); trang đồng hồ hiện ảnh ở máy này và máy tính của quản trị', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...IPHONE });
  const { page, context, env } = app;
  try {
    await login(page, 'U-DN', '583016');
    await go(page, `#/utilities/read/${s.elec}`);
    await page.waitForSelector('#f-val');
    await context.setOffline(true);
    await page.fill('#f-val', '12610');
    await page.setInputFiles('#ut-photo', [{ name: 'dong-ho.png', mimeType: 'image/png', buffer: png() }]);
    await page.waitForSelector('#ut-photos figure');
    await page.click('#ut-send');
    await page.waitForSelector('[data-tab="readings"]', { timeout: 15000 });
    const q = await queue(page);
    assert.deepEqual(q.map((x) => x.a), ['reading.create', 'doc.upload']);
    assert.equal(q[1].parent, q[0].id, 'ảnh gửi sau chỉ số');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitQueueEmpty(page);
    const rd = env.rows('MeterReadings').find((r) => r.cumulative_value === 12610);
    assert.ok(rd, 'chỉ số đã lên máy chủ');
    const docs = env.rows('Documents').filter((d) => d.entity_type === 'METER_READING' && d.entity_id === rd.reading_id);
    assert.equal(docs.length, 1, 'đúng 1 ảnh');
    assert.equal(docs[0].kind, 'PHOTO_METER');
    assert.equal(docs[0].access_scope, 'LINK_VIEW');
    // Máy này: trang đồng hồ hiện ảnh
    await go(page, '#/');
    await go(page, `#/utilities/meters/${s.elec}`);
    await page.waitForSelector('.ut-reads .photos img', { timeout: 15000 });
  } finally { await app.close(); }
  // Máy tính quản trị đăng nhập sau: thấy ảnh ở dòng chỉ số
  const web = await openApp({ env: s.env, ...WEB });
  try {
    await login(web.page);
    await go(web.page, `#/utilities/meters/${s.elec}`);
    await web.page.waitForSelector('.ut-reads .photos img', { timeout: 15000 });
    assert.deepEqual(web.consoleErrors, []);
  } finally { await web.close(); }
});

test('web C4: Tra cứu lộ điện chưa có lộ nào → hiện bảng Tủ điện với tủ đã lưu; bảng Lộ điện trống có lời chỉ dẫn', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = uuid();
  assert.equal(c.write('circuit.edit', { entity: 'PANEL', panel_id: id, name_vi: 'Điểm nhận lưới 22 kV', panel_type: 'SOURCE_GRID' }).ok, true);
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/circuits');
    await page.waitForSelector('.ci-mode');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('TU-0001'));
    assert.ok((await page.textContent('.ci-mode .seg.on')).includes('Tủ điện'), 'bảng Tủ điện');
    await page.click('.ci-mode [data-mode="circuits"]');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Chưa có lộ điện'));
    // Mở tủ từ bảng Tủ điện → vùng hồ sơ có nút Thêm lộ
    await page.click('.ci-mode [data-mode="panels"]');
    await page.click('tr[data-href^="/circuits/p/"]');
    await page.waitForSelector('#ci-pane a[href^="#/circuits/c/new?panel="]');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: máy tính chưa đồng bộ vẫn thấy ảnh chỉ số mới ở trang đồng hồ; quay lại tab sau hơn 1 phút thì tự lấy thay đổi', async () => {
  const s = setup();
  const app = await openApp({ env: s.env, ...WEB });
  const { page, calls } = app;
  try {
    await login(page);
    // ĐN ghi chỉ số kèm ảnh trên máy khác
    const rid = uuid();
    assert.equal(s.dn.write('reading.create', { reading_id: rid, meter_id: s.elec, measured_at: new Date(Date.now() - 60000).toISOString(), cumulative_value: 12650 }).ok, true);
    const up = s.dn.write('doc.upload', { document_id: uuid(), entity_type: 'METER_READING', entity_id: rid, kind: 'PHOTO_METER', mime_type: 'image/png', content_b64: png().toString('base64'), title_vi: 'Ảnh đồng hồ' });
    assert.equal(up.ok, true, JSON.stringify(up).slice(0, 200));
    // Chưa đồng bộ: trang đồng hồ hỏi máy chủ, có cả ảnh
    await go(page, `#/utilities/meters/${s.elec}`);
    await page.waitForSelector('.ut-reads .photos img', { timeout: 15000 });
    // Quay lại tab: lần đồng bộ cuối cũ hơn 1 phút → tự gọi sync.changes, dữ liệu trên máy có ảnh
    await page.evaluate(async () => { const m = await import('./js/sync.js'); await m.setMeta('last_sync', '2026-01-01T00:00:00+07:00'); });
    const n0 = calls.length;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    for (let i = 0; i < 60 && !calls.slice(n0).includes('sync.changes'); i++) await page.waitForTimeout(250);
    await page.waitForFunction(async (r) => {
      const m = await import('./js/sync.js');
      return (await m.getRecords('DOCUMENT')).some((d) => d.entity_id === r);
    }, rid, { timeout: 15000 });
    assert.ok(calls.slice(n0).includes('sync.changes'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
