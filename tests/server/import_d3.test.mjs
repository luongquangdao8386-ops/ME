// Mẫu Excel Đợt 3 (phụ lục 6.9.2): đồng hồ + chỉ số, biểu giá (lô nhạy cảm), tủ/lộ/phụ tải/bản vẽ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function preview(cl, template, rows, { batch = uuid() } = {}) {
  const r = cl.write('import.preview', { import_batch_id: batch, template_key: template, chunk_index: 0, chunk_count: 1, total_rows: rows.length, source_sha256: sha(JSON.stringify(rows) + Math.random()), rows });
  r.batch = batch;
  return r;
}
const row = (sheet, n, values) => ({ sheet, row_number: n, values });
const errsAt = (r, sheet, n) => r.data.errors.filter((e) => e.row === n && e.sheet === sheet).map((e) => `${e.field}:${e.code}`);
const exportRows = (ex) => ex.data.sheets.flatMap((s) => s.rows.map((r, i) => row(s.name, i + 3, Object.fromEntries(s.keys.map((k, j) => [k, r[j]]).filter(([k]) => k !== 'i18n_machine_fields')))));
const T = (s) => s + ':00+07:00';

function setup() {
  const env = freshServer({ now: T('2026-10-20T10:00') });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  const uid = (code) => env.rows('Users').find((u) => u.employee_code === code).user_id;
  return { env, c, c3, dn, kt, uid };
}
const commit = (cl, batch) => cl.call('import.commit', { import_batch_id: batch }, { operation_id: uuid(), reauth_token: cl.reauth ? cl.reauth() : undefined });

test('mẫu đồng hồ: ĐN tải mẫu được, cấp 1 không; mẫu có hai sheet và danh mục mã đồng hồ', () => {
  const { env, c, dn } = setup();
  assert.equal(c.write('meter.edit', { meter_id: uuid(), name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY' }).ok, true);
  const t = dn.call('import.template', { template_key: 'meters' });
  assert.equal(t.ok, true, JSON.stringify(t));
  assert.deepEqual(t.data.sheets.map((s) => s.name), ['meters', 'meter_readings']);
  assert.deepEqual(t.data.lists.meters, [['DH-0001', 'Điện xưởng A']]);
  const c1 = userClient(env, 'U-C1', 1, '702913');
  assert.equal(c1.call('import.template', { template_key: 'meters' }).code, 'FORBIDDEN');
});

test('đồng hồ mới + chỉ số trong cùng file (khóa dòng): ghi theo giờ đọc dù file đảo thứ tự; lần đầu là mốc gốc; kỳ 1–5 = 130 kWh; lỗi theo dòng', () => {
  const { env, c, c3 } = setup();
  const bad = preview(c3, 'meters', [
    row('meters', 3, { row_key: 'A', name_vi: 'Điện xưởng A', utility_type: 'electricity', multiplier: 1, reading_cycle_type: 'DAY_5' }),
    row('meters', 4, { name_vi: 'Nước', utility_type: 'WATER', opening_at: '01/10/2026 07:00' }),
    row('meter_readings', 3, { meter_key: 'a', measured_at: '06/10/2026 08:00', cumulative_value: 12480 }),
    row('meter_readings', 4, { meter_key: 'A', measured_at: '06/10/2026 08:00', cumulative_value: 12481 }),
    row('meter_readings', 5, { meter_key: 'DH-9999', measured_at: '02/10/2026 08:00', cumulative_value: 1 }),
    row('meter_readings', 6, { meter_key: 'A', measured_at: '01/12/2026 08:00', cumulative_value: 13000 }),
    row('meter_readings', 7, { reading_id: uuid(), meter_key: 'A', measured_at: '03/10/2026 08:00', cumulative_value: 12400 })
  ]);
  assert.equal(bad.ok, true, JSON.stringify(bad));
  assert.equal(bad.data.status, 'NEEDS_FIX');
  assert.deepEqual(errsAt(bad, 'meters', 4), ['opening_value:REQUIRED']);
  assert.deepEqual(errsAt(bad, 'meter_readings', 4), ['measured_at:READING_DUPLICATE']);
  assert.deepEqual(errsAt(bad, 'meter_readings', 5), ['meter_key:NOT_FOUND']);
  assert.deepEqual(errsAt(bad, 'meter_readings', 6), ['measured_at:TIME_ORDER_INVALID']);
  assert.deepEqual(errsAt(bad, 'meter_readings', 7), ['reading_id:INVALID_VALUE']);
  const r = preview(c3, 'meters', [
    row('meters', 3, { row_key: 'A', name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_5' }),
    row('meter_readings', 3, { meter_key: 'A', measured_at: '06/10/2026 08:00', cumulative_value: 12480 }),
    row('meter_readings', 4, { meter_key: 'A', measured_at: '01/10/2026 07:45', cumulative_value: 12350 })
  ]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(r.data.add_count, 3);
  const cm = commit(c3, r.batch);
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const m = env.rows('Meters')[0];
  assert.equal(m.meter_code, 'DH-0001');
  const reads = env.rows('MeterReadings').filter((x) => x.meter_id === m.meter_id).sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  assert.deepEqual(reads.map((x) => [x.cumulative_value, x.reading_kind, x.status]), [[12350, 'SEGMENT_OPENING', 'VALID'], [12480, 'REGULAR', 'VALID']]);
  const s = c3.call('utility.view', { summary: { period_type: 'DAY_5', date: '2026-10-01' } }).data;
  assert.equal(s.rows[0].consumption, 130);
  assert.equal(s.rows[0].status, 'OK');
});

test('ĐN nhập chỉ số cho đồng hồ có sẵn: không tự ghi lô (gửi duyệt), C3 ghi; người đọc là ĐN; xuất mẫu rồi nhập lại nguyên trạng thì bỏ qua', () => {
  const { env, c, c3, dn, uid } = setup();
  const mid = uuid();
  assert.equal(c.write('meter.edit', { meter_id: mid, name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY', opening_value: 12350, opening_at: T('2026-10-01T07:45') }).ok, true);
  const r = preview(dn, 'meters', [row('meter_readings', 3, { meter_key: 'DH-0001', measured_at: '06/10/2026 08:00', cumulative_value: 12480 })]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(dn.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid() }).code, 'FORBIDDEN');
  assert.equal(dn.write('import.submit', { import_batch_id: r.batch }).ok, true);
  const cm = commit(c3, r.batch);
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const rd = env.rows('MeterReadings').find((x) => x.cumulative_value === 12480);
  assert.equal(rd.reading_user_id, uid('U-DN'));
  // Xuất → nhập lại: đồng hồ không đổi → SKIPPED; sheet chỉ số xuất trống
  const ex = c3.call('export.xlsx', { template_key: 'meters' });
  assert.equal(ex.ok, true, JSON.stringify(ex));
  assert.equal(ex.data.sheets.find((s) => s.name === 'meter_readings').rows.length, 0);
  const again = preview(c3, 'meters', exportRows(ex));
  assert.equal(again.data.status, 'READY', JSON.stringify(again.data.errors));
  assert.equal(again.data.add_count + again.data.update_count, 0);
  // Sửa tên qua Excel; chỉ số mở khi sửa → lỗi
  const rows = exportRows(ex);
  rows[0].values.name_vi = 'Điện xưởng A (tổng)';
  const upd = preview(c3, 'meters', rows);
  assert.equal(upd.data.update_count, 1);
  assert.equal(commit(c3, upd.batch).data.status, 'COMMITTED');
  assert.equal(env.rows('Meters')[0].name_vi, 'Điện xưởng A (tổng)');
  rows[0].values.opening_value = 5;
  assert.ok(errsAt(preview(c3, 'meters', rows), 'meters', 3).includes('opening_value:INVALID_VALUE'));
});

test('biểu giá (lô nhạy cảm): chỉ người lập biểu giá tải mẫu; C3 nhập, không tự ghi; owner ghi = duyệt; bản đã duyệt không sửa qua Excel', () => {
  const { env, c, c3, dn, uid } = setup();
  assert.equal(dn.call('import.template', { template_key: 'utility_tariffs' }).code, 'FORBIDDEN');
  const r = preview(c3, 'utility_tariffs', [
    row('utility_tariffs', 3, { utility_type: 'ELECTRICITY', name_vi: 'Giá điện 2026', effective_from: '01/01/2026', unit_price: 2000, tax_rate: 8 }),
    row('utility_tariffs', 4, { utility_type: 'WATER', effective_from: '01/01/2026', effective_to: '01/12/2025', unit_price: 12000, currency: 'vnd' })
  ]);
  assert.deepEqual(errsAt(r, 'utility_tariffs', 4), ['effective_to:INVALID_DATE']);
  const ok = preview(c3, 'utility_tariffs', [row('utility_tariffs', 3, { utility_type: 'ELECTRICITY', name_vi: 'Giá điện 2026', effective_from: '01/01/2026', unit_price: 2000, tax_rate: 8 })]);
  assert.equal(ok.data.status, 'READY');
  assert.equal(ok.data.sensitive, true);
  assert.equal(commit(c3, ok.batch).code, 'FORBIDDEN', 'người nhập không tự ghi lô nhạy cảm');
  assert.equal(c3.write('import.submit', { import_batch_id: ok.batch }).ok, true);
  const cm = commit(c, ok.batch);
  assert.equal(cm.ok, true, JSON.stringify(cm));
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const tf = env.rows('UtilityTariffs')[0];
  assert.equal(tf.status, 'APPROVED');
  assert.equal(tf.created_by, uid('U-C3'));
  assert.equal(tf.approved_by, env.rows('Users').find((u) => u.is_system_owner).user_id);
  assert.equal(tf.unit_price, 2000);
  const ex = c3.call('export.xlsx', { template_key: 'utility_tariffs' });
  assert.equal(ex.ok, true);
  const rows = exportRows(ex);
  assert.equal(rows[0].values.status, 'APPROVED');
  const same = preview(c3, 'utility_tariffs', rows);
  assert.equal(same.data.status, 'READY', JSON.stringify(same.data.errors));
  assert.equal(same.data.update_count, 0);
  rows[0].values.unit_price = 2100;
  assert.deepEqual(errsAt(preview(c3, 'utility_tariffs', rows), 'utility_tariffs', 3), ['tariff_id:STATUS_INVALID']);
});

test('lộ điện: KT nhập tủ (nối thiết bị), lộ, phụ tải, bản vẽ (khóa dòng) → gửi duyệt → C3 ghi; truy đường cấp OK; bản vẽ chờ duyệt do KT tải; lỗi theo dòng', () => {
  const { env, c, c3, kt, uid } = setup();
  const eqDb = uuid(), eqM = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eqDb, name_vi: 'Tủ DB1' }).ok, true);
  assert.equal(c.write('equipment.create', { equipment_id: eqM, name_vi: 'Máy nén khí' }).ok, true);
  const bad = preview(kt, 'circuits', [
    row('panels', 3, { row_key: 'MSB', name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' }),
    row('circuits', 3, { row_key: 'L1', panel_key: 'MSB', name_vi: 'Lộ 1', phases: 4 }),
    row('circuit_loads', 3, { circuit_key: 'L1', equipment_code: 'TB-0002', downstream_panel_key: 'MSB' }),
    row('circuit_loads', 4, { circuit_key: 'L1' }),
    row('circuit_drawings', 3, { panel_key: 'MSB', title_vi: 'Sơ đồ', external_url: 'http://x.test/a.pdf' })
  ]);
  assert.equal(bad.data.status, 'NEEDS_FIX');
  assert.deepEqual(errsAt(bad, 'circuits', 3), ['phases:INVALID_VALUE']);
  assert.deepEqual(errsAt(bad, 'circuit_loads', 3), ['equipment_code:LOAD_TARGET_ONE']);
  assert.deepEqual(errsAt(bad, 'circuit_loads', 4), ['equipment_code:LOAD_TARGET_ONE']);
  assert.deepEqual(errsAt(bad, 'circuit_drawings', 3), ['external_url:URL_INVALID']);
  const r = preview(kt, 'circuits', [
    row('panels', 3, { row_key: 'GRID', name_vi: 'Điểm nhận lưới', panel_type: 'SOURCE_GRID' }),
    row('panels', 4, { row_key: 'MSB', panel_code: 'TU-MSB', name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' }),
    row('panels', 5, { row_key: 'DB1', name_vi: 'Tủ DB1', panel_type: 'DISTRIBUTION_BOARD', equipment_code: 'tb-0001' }),
    row('circuits', 3, { row_key: 'L0', panel_key: 'GRID', name_vi: 'Lộ lưới → MSB' }),
    row('circuits', 4, { row_key: 'L1', panel_key: 'TU-MSB', name_vi: 'Lộ MSB → DB1', breaker_rating_a: 250, cable_section_mm2: '4x95' }),
    row('circuits', 5, { row_key: 'L2', panel_key: 'DB1', name_vi: 'Lộ máy nén', upstream_circuit_key: '', phases: 3 }),
    row('circuit_loads', 3, { circuit_key: 'L0', downstream_panel_key: 'MSB' }),
    row('circuit_loads', 4, { circuit_key: 'L1', downstream_panel_key: 'DB1' }),
    row('circuit_loads', 5, { circuit_key: 'L2', equipment_code: 'TB-0002', rated_load_kw: 37 }),
    row('circuit_drawings', 3, { panel_key: 'MSB', title_vi: 'Sơ đồ một sợi', external_url: 'https://drive.example/msb.pdf', document_date: '01/09/2026' })
  ]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(r.data.add_count, 10);
  assert.equal(kt.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid() }).code, 'FORBIDDEN');
  assert.equal(kt.write('import.submit', { import_batch_id: r.batch }).ok, true);
  const cm = commit(c3, r.batch);
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const db1 = env.rows('Panels').find((p) => p.name_vi === 'Tủ DB1');
  assert.equal(db1.equipment_id, eqDb);
  assert.equal(env.rows('Circuits').find((x) => x.name_vi === 'Lộ MSB → DB1').cable_section_mm2, '4×95');
  const tr = c3.call('circuit.view', { trace: { equipment_id: eqM, supply_role: 'ALL' } }).data.paths;
  assert.equal(tr.length, 1);
  assert.equal(tr[0].status, 'OK');
  assert.equal(tr[0].nodes[tr[0].nodes.length - 1].name_vi, 'Điểm nhận lưới');
  const d = env.rows('Documents').find((x) => x.kind === 'DRAWING');
  assert.equal(d.approval_status, 'DRAFT');
  assert.equal(d.created_by, uid('U-KT'));
  assert.equal(d.entity_type, 'PANEL');
  // Vòng tạo bằng Excel: lộ của DB1 cấp ngược lên MSB → dòng lỗi khi ghi, phần còn lại không đổi
  const loop = preview(c3, 'circuits', [row('circuit_loads', 3, { circuit_key: env.rows('Circuits').find((x) => x.name_vi === 'Lộ máy nén').circuit_code, downstream_panel_key: 'TU-MSB' })]);
  assert.equal(loop.data.status, 'READY');
  const lc = commit(c3, loop.batch);
  assert.equal(lc.data.status, 'PARTIAL');
  assert.ok(lc.data.errors.some((e) => e.code === 'CIRCUIT_LOOP'));
  // Xuất → nhập lại nguyên trạng: bỏ qua; sheet bản vẽ xuất trống
  const ex = c3.call('export.xlsx', { template_key: 'circuits' });
  assert.equal(ex.ok, true);
  assert.equal(ex.data.sheets.find((s) => s.name === 'circuit_drawings').rows.length, 0);
  const again = preview(c3, 'circuits', exportRows(ex));
  assert.equal(again.data.status, 'READY', JSON.stringify(again.data.errors));
  assert.equal(again.data.add_count + again.data.update_count, 0);
});
