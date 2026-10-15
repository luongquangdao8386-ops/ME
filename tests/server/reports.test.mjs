// Báo cáo Đợt 3: 8 mẫu tích hợp, đúng số liệu nguồn, theo quyền xem và quyền giá, lưu bản chụp (BC-yymm-001, QR),
// xuất Excel/PDF không logo, mẫu do quản trị lập, In/xuất PDF hồ sơ (4.4.10, 4.4.11, 4.5, 5.3.9, 6.9.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const T = (s) => s + ':00+07:00';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

function setup(now = '2026-10-20T10:00') {
  const env = freshServer({ now: T(now) });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  return { env, c, c3, dn, kt };
}

/** Đồng hồ điện 12 350 → 12 480 (130 kWh, kỳ 01–05/10), biểu giá 2 000 đ/kWh + thuế 8 % → 280 800 đ */
function utilityData(env, c, c3, dn) {
  const m = uuid();
  ok(c.write('meter.edit', { meter_id: m, name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_5' }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-01T07:45'), cumulative_value: 12350 }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-06T08:00'), cumulative_value: 12480 }));
  const t = uuid();
  ok(c3.write('tariff.edit', { tariff_id: t, utility_type: 'ELECTRICITY', effective_from: '2026-01-01', unit_price: 2000, tax_rate: 8, name_vi: 'Giá điện 2026' }));
  const tv = env.rows('UtilityTariffs').find((x) => x.tariff_id === t).record_version;
  ok(c.write('tariff.approve', { tariff_id: t, decision: 'APPROVE' }, { expected_version: tv, reauth_token: c.reauth() }));
  return m;
}
const UF = { period_type: 'DAY_5', date: '2026-10-03' };

test('8 mẫu tích hợp đồng bộ xuống app theo quyền xem; ĐN thấy mẫu Điện nước; tập dữ liệu không lộ cột giá cho người không có quyền giá', () => {
  const { c, dn } = setup();
  const defs = (cl) => (cl.call('sync.bootstrap', {}).data.records.REPORT_DEFINITION || []).map((d) => d.code).sort();
  assert.equal(defs(c).length, 8);
  assert.ok(defs(dn).includes('RPT_UTILITIES'));
  const info = ok(dn.call('report.view', { datasets: true })).data.datasets;
  assert.ok(info.UTILITIES.columns.some((x) => x.key === 'consumption'));
  assert.ok(!info.UTILITIES.columns.some((x) => x.key === 'cost'), 'ĐN không có quyền giá điện nước');
  assert.ok(ok(c.call('report.view', { datasets: true })).data.datasets.UTILITIES.columns.some((x) => x.key === 'cost'));
});

test('báo cáo Điện nước khớp nguồn (130 kWh, 280 800 đ) với C3; ĐN cùng số nhưng không có cột/tổng chi phí; có chú thích quy tắc chốt kỳ và W', () => {
  const { env, c, c3, dn } = setup();
  const m = utilityData(env, c, c3, dn);
  const r = ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: UF })).data;
  assert.equal(r.title_vi, 'Điện nước');
  const row = r.rows.find((x) => x.meter_code === 'DH-0001');
  assert.equal(row.consumption, 130);
  assert.equal(row.cost, 280800);
  assert.equal(row.currency, 'VND');
  assert.equal(row.status, 'OK');
  assert.equal(r.period.period_start, '2026-10-01');
  assert.equal(r.filters.window_hours, 24);
  assert.ok(r.summary.some((s) => s.enum === 'ELECTRICITY' && s.value === 130 && !s.money));
  assert.ok(r.summary.some((s) => s.money && s.value === 280800));
  assert.equal(r.has_cost, true);
  // Cùng số liệu như màn Điện nước
  const live = ok(c3.call('utility.view', { summary: UF })).data.rows.find((x) => x.meter_id === m);
  assert.equal(live.consumption, row.consumption);
  const d = ok(dn.call('report.run', { code: 'RPT_UTILITIES', filters: UF })).data;
  assert.equal(d.rows[0].consumption, 130);
  assert.ok(!('cost' in d.rows[0]) && !d.columns.some((x) => x.key === 'cost'));
  assert.ok(!d.summary.some((s) => s.money));
  assert.equal(d.cost_hidden, true);
  assert.ok(d.notes.includes('rpt.note.utility_rule'));
  assert.equal(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'X' } }).errors[0].field, 'filters.period_type');
});

test('báo cáo Thiết bị và Sự cố khớp nguồn: số thiết bị, sự cố đang mở theo máy, thời gian dừng máy; lọc khu vực gồm khu vực con', () => {
  const { c, kt } = setup();
  const a = uuid(), a1 = uuid();
  ok(c.write('location.edit', { location_id: a, name_vi: 'Xưởng A', type: 'WORKSHOP' }));
  ok(c.write('location.edit', { location_id: a1, name_vi: 'Khu A1', parent_location_id: a }));
  const e1 = uuid(), e2 = uuid(), e3 = uuid();
  ok(c.write('equipment.create', { equipment_id: e1, name_vi: 'Máy nén khí', location_id: a }));
  ok(c.write('equipment.create', { equipment_id: e2, name_vi: 'Bơm nước', location_id: a1 }));
  ok(c.write('equipment.create', { equipment_id: e3, name_vi: 'Quạt', }));
  ok(kt.write('repair.report', { repair_id: uuid(), equipment_id: e2, symptom_vi: 'Rò nước', severity: 'HIGH' }));
  const all = ok(c.call('report.run', { code: 'RPT_EQUIPMENT', filters: {} })).data;
  assert.equal(all.total_rows, 3);
  assert.equal(all.summary[0].value, 3);
  const inA = ok(c.call('report.run', { code: 'RPT_EQUIPMENT', filters: { location_id: a } })).data;
  assert.deepEqual(inA.rows.map((x) => x.name_vi).sort(), ['Bơm nước', 'Máy nén khí']);
  assert.equal(inA.rows.find((x) => x.name_vi === 'Bơm nước').open_repairs, 1);
  const rp = ok(c.call('report.run', { code: 'RPT_REPAIRS', filters: { from: '2026-10-01', to: '2026-10-31' } })).data;
  assert.equal(rp.total_rows, 1);
  assert.equal(rp.rows[0].status, 'REPORTED');
});

test('lưu báo cáo: mã BC-2610-001, QR, bản chụp không đổi khi nguồn đổi; có chi phí → COST_VIEW: ĐN không thấy, không mở QR; không chi phí → ĐN thấy', () => {
  const { env, c, c3, dn } = setup();
  const m = utilityData(env, c, c3, dn);
  assert.equal(dn.write('report.save', { report_run_id: uuid(), code: 'RPT_UTILITIES', filters: UF }).code, 'FORBIDDEN', 'cấp 2 không có cờ xuất ở Báo cáo');
  const id = uuid();
  const s = ok(c3.write('report.save', { report_run_id: id, code: 'RPT_UTILITIES', filters: UF }));
  assert.equal(s.data.display_code, 'BC-2610-001');
  assert.ok(s.data.qr_key);
  const run = env.rows('ReportRuns').find((x) => x.report_run_id === id);
  assert.equal(run.access_scope, 'COST_VIEW');
  assert.equal(run.row_count, 1);
  assert.equal(run.filters_json.window_hours, 24, 'lưu W lúc tạo');
  const doc = env.rows('Documents').find((x) => x.document_id === run.file_document_id);
  assert.equal(doc.kind, 'REPORT_FILE');
  assert.equal(doc.access_scope, 'COST_VIEW');
  // Nguồn đổi: số 07:00 ngày 6 thành số chốt mới (120 kWh) — bản chụp giữ 130
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-06T07:00'), cumulative_value: 12470 }));
  assert.equal(ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: UF })).data.rows[0].consumption, 120);
  const v = ok(c3.call('report.view', { report_run_id: id })).data;
  assert.equal(v.snapshot.rows[0].consumption, 130);
  assert.equal(v.run.report_run_code, 'BC-2610-001');
  // ĐN: không thấy bản có chi phí (danh sách, mở trực tiếp, QR, đồng bộ)
  assert.equal(dn.call('report.view', { report_run_id: id }).code, 'FORBIDDEN');
  assert.ok(!ok(dn.call('report.view', {})).data.items.some((x) => x.report_run_id === id));
  assert.equal(ok(dn.call('qr.resolve', { qr_key: s.data.qr_key })).data.qr_state, 'UNAVAILABLE');
  assert.equal(ok(c3.call('qr.resolve', { qr_key: s.data.qr_key })).data.entity_type, 'REPORT_RUN');
  assert.ok(!(dn.call('sync.bootstrap', {}).data.records.REPORT_RUN || []).some((x) => x.report_run_id === id));
  // Bản không có chi phí (Lộ điện) → ĐN thấy
  const id2 = uuid();
  const s2 = ok(c3.write('report.save', { report_run_id: id2, code: 'RPT_CIRCUITS', filters: {} }));
  assert.equal(s2.data.display_code, 'BC-2610-002');
  assert.equal(env.rows('ReportRuns').find((x) => x.report_run_id === id2).access_scope, 'MODULE_VIEW');
  assert.ok(ok(dn.call('report.view', {})).data.items.some((x) => x.report_run_id === id2));
  // Gửi lại cùng operation_id: không tạo bản thứ hai
  const op = uuid();
  const id3 = uuid();
  ok(c3.write('report.save', { report_run_id: id3, code: 'RPT_CIRCUITS', filters: {} }, { operation_id: op }));
  const again = c3.write('report.save', { report_run_id: id3, code: 'RPT_CIRCUITS', filters: {} }, { operation_id: op });
  assert.equal(again.ok, true);
  assert.equal(env.rows('ReportRuns').filter((x) => x.report_run_id === id3).length, 1);
});

test('xuất: Excel trả dữ liệu để dựng tệp; PDF dựng ở máy chủ, có số báo cáo, Người lập/Người duyệt, không logo/ảnh/cụm M&E; ghi nhật ký; ĐN không xuất', () => {
  const { env, c, c3, dn } = setup();
  utilityData(env, c, c3, dn);
  const id = uuid();
  ok(c3.write('report.save', { report_run_id: id, code: 'RPT_UTILITIES', filters: UF }));
  const x = ok(c3.call('report.export', { format: 'XLSX', report_run_id: id })).data;
  assert.equal(x.report.rows[0].consumption, 130);
  assert.equal(x.report.report_run_code, 'BC-2610-001');
  const p = ok(c3.call('report.export', { format: 'PDF', report_run_id: id })).data;
  assert.equal(p.mime_type, 'application/pdf');
  assert.equal(p.file_name, 'BC-2610-001_2026-10-20.pdf');
  const text = Buffer.from(p.content_b64, 'base64').toString('utf8');
  assert.ok(text.startsWith('%PDF'));
  for (const s of ['Điện nước / 水电', 'BC-2610-001', 'Người lập', 'Người duyệt', '12\u202F480', '280\u202F800\u00A0VND', '01/10/2026']) assert.ok(text.includes(s), s);
  assert.ok(!text.includes('[IMAGE]') && !text.includes('M&E') && !/logo/i.test(text), 'không logo, không cụm nhận diện app');
  // Tệp Docs tạm đã bỏ vào thùng rác
  assert.ok([...env.drive._docs.keys()].every((k) => env.drive._files.get(k)?.trashed !== false));
  assert.equal(dn.call('report.export', { format: 'XLSX', code: 'RPT_UTILITIES', filters: UF }).code, 'FORBIDDEN');
  assert.ok(env.rows('AuditLogs').filter((a) => a.action === 'report.export').length >= 2);
  assert.equal(c3.call('report.export', { format: 'DOCX', report_run_id: id }).errors[0].field, 'format');
});

test('mẫu do quản trị lập (C4): chọn tập dữ liệu, cột, cấp xem; C3 không sửa mẫu; mẫu tích hợp không đổi tên/tập dữ liệu; mẫu ngừng thì không chạy', () => {
  const { env, c, c3, dn } = setup();
  utilityData(env, c, c3, dn);
  const id = uuid();
  assert.equal(c3.write('report.definition.edit', { report_definition_id: id, code: 'RPT_DIEN', title_vi: 'Điện theo kỳ', dataset: 'UTILITIES' }).code, 'FORBIDDEN');
  assert.equal(c.write('report.definition.edit', { report_definition_id: uuid(), code: 'x', title_vi: 'Sai', dataset: 'UTILITIES' }).errors[0].field, 'code');
  assert.equal(c.write('report.definition.edit', { report_definition_id: uuid(), code: 'RPT_X', title_vi: 'Sai', dataset: 'NOPE' }).errors[0].field, 'dataset');
  ok(c.write('report.definition.edit', { report_definition_id: id, code: 'rpt_dien', title_vi: 'Điện theo kỳ', dataset: 'UTILITIES' }));
  const ver = () => env.rows('ReportDefinitions').find((x) => x.report_definition_id === id).record_version;
  assert.equal(c.write('report.definition.edit', { report_definition_id: id, visible_columns: ['meter_code', 'nope'] }, { expected_version: ver() }).errors[0].field, 'visible_columns');
  ok(c.write('report.definition.edit', { report_definition_id: id, visible_columns: ['meter_code', 'consumption', 'cost'], allowed_roles: '3,4', chart_type: 'BAR' }, { expected_version: ver() }));
  const r = ok(c3.call('report.run', { report_definition_id: id, filters: UF })).data;
  assert.deepEqual(r.columns.map((x) => x.key), ['meter_code', 'consumption', 'cost']);
  assert.equal(r.definition.code, 'RPT_DIEN');
  assert.equal(r.definition.chart_type, 'BAR');
  assert.equal(dn.call('report.run', { report_definition_id: id, filters: UF }).code, 'FORBIDDEN', 'cấp 2 ngoài cấp xem của mẫu');
  // Mẫu tích hợp
  const b = env.rows('ReportDefinitions').find((x) => x.code === 'RPT_UTILITIES');
  assert.equal(c.write('report.definition.edit', { report_definition_id: b.report_definition_id, title_vi: 'Đổi tên' }, { expected_version: b.record_version }).errors[0].code, 'BUILTIN_FIXED');
  ok(c.write('report.definition.edit', { report_definition_id: b.report_definition_id, active: false }, { expected_version: b.record_version }));
  assert.equal(c3.call('report.run', { code: 'RPT_UTILITIES', filters: UF }).code, 'FORBIDDEN');
  assert.ok(!(c3.call('sync.bootstrap', {}).data.records.REPORT_DEFINITION || []).some((x) => x.code === 'RPT_UTILITIES'));
});

test('In/xuất PDF hồ sơ (export.pdf): thiết bị, phiếu sửa; không logo; chi phí theo quyền giá; cấp 2 không có cờ xuất → FORBIDDEN', () => {
  const { env, c, c3, kt } = setup();
  const e = uuid();
  ok(c.write('equipment.create', { equipment_id: e, name_vi: 'Máy nén khí', model: 'GA-37' }));
  const p = ok(c3.call('export.pdf', { entity_type: 'EQUIPMENT', entity_id: e })).data;
  const text = Buffer.from(p.content_b64, 'base64').toString('utf8');
  assert.ok(text.startsWith('%PDF') && text.includes('Hồ sơ thiết bị / 设备档案') && text.includes('GA-37'));
  assert.ok(!text.includes('[IMAGE]') && !text.includes('M&E'));
  assert.equal(p.file_name, 'TB-0001.pdf');
  const rid = uuid();
  ok(kt.write('repair.report', { repair_id: rid, equipment_id: e, symptom_vi: 'Nóng máy', severity: 'MEDIUM' }));
  const rp = ok(c3.call('export.pdf', { entity_type: 'REPAIR', entity_id: rid })).data;
  assert.ok(Buffer.from(rp.content_b64, 'base64').toString('utf8').includes('Nóng máy'));
  assert.equal(kt.call('export.pdf', { entity_type: 'EQUIPMENT', entity_id: e }).code, 'FORBIDDEN');
  assert.equal(c3.call('export.pdf', { entity_type: 'METER', entity_id: e }).errors[0].field, 'entity_type');
  assert.ok(env.rows('AuditLogs').some((a) => a.action === 'export.pdf'));
});
