// Đợt 3 trên giao diện: Điện nước (UT-01..03, WEB-UT-01), Lộ điện (CI-01..03, WEB-CI-01, B2), Báo cáo (RE-01..03, WEB-RE-01)
// — 390×844 và 1440×900; nhập chỉ số khi mất mạng; quét tem đồng hồ mở màn nhập chỉ số; báo cáo không logo
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
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
