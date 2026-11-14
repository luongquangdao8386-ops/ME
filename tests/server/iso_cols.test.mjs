// d4.37: cột còn thiếu để bản in thay biểu ISO — BM-CĐ-02-01 (Danh mục máy móc, thiết bị & hạ tầng: năm đưa vào sử dụng,
// công suất kW, thiết bị nghiêm ngặt) và BM-CĐ-06-05 (Danh mục & kế hoạch kiểm định thiết bị nghiêm ngặt: số đăng ký thiết bị,
// đơn vị kiểm định). Trường mới ở hồ sơ thiết bị (schema 1.5.7, "đợt" 7): sửa tay, nhập/xuất Excel, Lý lịch thiết bị.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshServer, ownerClient, uuid, OWNER_PIN, OWNER_CODE, OWNER_TEMP_PIN } from '../helpers.mjs';
import { loadServer } from '../gas-mock.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const vi = (s) => String(s).split('\n')[0];

function setup() {
  const env = freshServer({ now: '2026-11-14T10:00:00+07:00' });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  return { env, c };
}
function preview(cl, template, rows) {
  const batch = uuid();
  const r = cl.write('import.preview', { import_batch_id: batch, template_key: template, chunk_index: 0, chunk_count: 1, total_rows: rows.length, source_sha256: sha(JSON.stringify(rows)), rows });
  r.batch = batch;
  return r;
}
const row = (sheet, n, values) => ({ sheet, row_number: n, values });
const errs = (r) => (r.errors || []).map((e) => `${e.field}:${e.code}`);
/** Bảng chi tiết của PDF báo cáo: tiêu đề cột (phần Việt) và các dòng */
function pdfDetail(env) {
  const doc = [...env.drive._docs.values()].pop();
  const t = doc.body.children.filter((x) => x.kind === 'table').sort((a, b) => b.rows[0].cells.length - a.rows[0].cells.length)[0];
  return { head: Array.from(t.rows[0].cells, (c) => vi(c.getText())), rows: Array.from(t.rows).slice(1).map((r) => Array.from(r.cells, (c) => c.getText())) };
}

test('hồ sơ thiết bị: năm đưa vào sử dụng, thiết bị nghiêm ngặt, số đăng ký — tạo, sửa, kiểm dạng, xem', () => {
  const { env, c } = setup();
  const id = uuid();
  const bad = c.write('equipment.create', { equipment_id: uuid(), name_vi: 'X', in_service_year: 1850, strict_safety: 'abc', registration_no: 'A'.repeat(61) });
  assert.equal(bad.code, 'VALIDATION_ERROR');
  assert.deepEqual(errs(bad).sort(), ['in_service_year:INVALID_VALUE', 'registration_no:INVALID_VALUE', 'strict_safety:INVALID_VALUE']);
  ok(c.write('equipment.create', { equipment_id: id, name_vi: 'Nồi hơi 01', in_service_year: 2018, strict_safety: true, registration_no: ' NH-123/LĐTBXH ' }));
  let e = env.rows('Equipment').find((x) => x.equipment_id === id);
  assert.equal(e.in_service_year, 2018);
  assert.equal(e.strict_safety, true);
  assert.equal(e.registration_no, 'NH-123/LĐTBXH');
  // Thiết bị không nhập: nghiêm ngặt = Không
  const id2 = uuid();
  ok(c.write('equipment.create', { equipment_id: id2, name_vi: 'Quạt hút' }));
  assert.equal(env.rows('Equipment').find((x) => x.equipment_id === id2).strict_safety, false);
  // Sửa: bỏ đánh dấu, xóa năm
  ok(c.write('equipment.edit', { equipment_id: id, strict_safety: false, in_service_year: '' }, { expected_version: 1 }));
  e = env.rows('Equipment').find((x) => x.equipment_id === id);
  assert.equal(e.strict_safety, false);
  assert.equal(e.in_service_year === '' || e.in_service_year === null, true);
  const v = ok(c.call('equipment.view', { equipment_id: id })).data;
  assert.equal(v.item.registration_no, 'NH-123/LĐTBXH');
  assert.equal(v.item.strict_safety, false);
});

test('báo cáo Thiết bị (BM-CĐ-02-01): thứ tự cột theo biểu, năm sử dụng (chưa nhập → năm lắp đặt), công suất kW từ thông số (W, HP đổi ra kW), nghiêm ngặt Có/Không; PDF có cột', () => {
  const { env, c } = setup();
  const a = uuid(), b = uuid(), d = uuid();
  ok(c.write('equipment.create', { equipment_id: a, equipment_code: 'TB-A', name_vi: 'Nồi hơi', model: 'NH-2', manufacturer: 'Hãng A', in_service_year: 2015, install_date: '2014-12-20', strict_safety: true, registration_no: 'DK-01' }));
  ok(c.write('equipment.create', { equipment_id: b, equipment_code: 'TB-B', name_vi: 'Máy nén', install_date: '2020-05-01' }));
  ok(c.write('equipment.create', { equipment_id: d, equipment_code: 'TB-C', name_vi: 'Bơm' }));
  ok(c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: a, spec_key: 'electrical_power', value_num: 1500, unit: 'W' }));
  ok(c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: b, spec_key: 'electrical_power', value_num: 10, unit: 'HP' }));
  ok(c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: d, spec_key: 'electrical_power', value_num: 7.5, unit: 'kW' }));
  const r = ok(c.call('report.run', { code: 'RPT_EQUIPMENT', filters: {} })).data;
  const keys = r.columns.map((x) => x.key);
  assert.deepEqual(keys, ['equipment_code', 'name', 'category', 'model', 'manufacturer', 'serial', 'in_service_year', 'power_kw', 'location', 'owner',
    'criticality', 'strict_safety', 'status', 'parts_count', 'open_repairs']);
  const col = (k) => r.columns.find((x) => x.key === k);
  assert.deepEqual([col('in_service_year').label_vi, col('in_service_year').label_zh], ['Năm đưa vào sử dụng', '投入使用年份']);
  assert.deepEqual([col('power_kw').label_vi, col('power_kw').type], ['Công suất (kW)', 'num']);
  assert.equal(col('strict_safety').enumKey, 'yes_no');
  const by = Object.fromEntries(r.rows.map((x) => [x.equipment_code, x]));
  assert.equal(by['TB-A'].in_service_year, '2015');
  assert.equal(by['TB-B'].in_service_year, '2020', 'chưa nhập năm → năm của ngày lắp đặt');
  assert.equal(by['TB-C'].in_service_year, '');
  assert.equal(by['TB-A'].power_kw, 1.5);
  assert.equal(by['TB-B'].power_kw, 7.46, '10 HP = 7,457 kW → 7,46');
  assert.equal(by['TB-C'].power_kw, 7.5);
  assert.deepEqual(r.rows.map((x) => x.strict_safety), ['YES', 'NO', 'NO']);
  assert.ok(r.summary.some((s) => s.label_vi === 'Thiết bị nghiêm ngặt' && s.value === 1));
  // PDF (A4 ngang): cột theo thứ tự, năm không nhóm hàng nghìn, Có/Không song ngữ
  ok(c.call('report.export', { format: 'PDF', code: 'RPT_EQUIPMENT', filters: {} }));
  const p = pdfDetail(env);
  assert.deepEqual(p.head.slice(1, 13), ['Mã thiết bị', 'Tên thiết bị', 'Loại', 'Model', 'Hãng', 'Số serial', 'Năm đưa vào sử dụng', 'Công suất (kW)', 'Khu vực',
    'Người phụ trách', 'Mức quan trọng', 'Thiết bị nghiêm ngặt (Có/Không)']);
  const ra = p.rows.find((x) => x[1] === 'TB-A');
  assert.equal(ra[7], '2015');
  assert.equal(ra[8], '1.5');
  assert.equal(ra[12], 'Có\n是');
  assert.equal(p.rows.find((x) => x[1] === 'TB-B')[8], '7.46');
});

test('báo cáo Kiểm định (BM-CĐ-06-05): thứ tự cột theo biểu, số đăng ký từ hồ sơ thiết bị, đơn vị kiểm định của chứng nhận đang hiệu lực; PDF có cột', () => {
  const { env, c } = setup();
  const eq = uuid(), type = uuid(), req = uuid(), ven = uuid(), ins = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, equipment_code: 'TB-NH', name_vi: 'Nồi hơi', strict_safety: true, registration_no: 'DK-NH-07' }));
  ok(c.write('inspection.type.edit', { inspection_type_id: type, code: 'NOI_HOI', name_vi: 'Kiểm định nồi hơi', default_interval_months: 12 }));
  ok(c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type }));
  ok(c.write('vendor.edit', { vendor_id: ven, name: 'Trung tâm Kiểm định KTAT 2' }));
  ok(c.write('inspection.submit', { inspection_id: ins, requirement_id: req, vendor_id: ven, inspection_date: '2026-10-01', valid_from: '2026-10-01', valid_to: '2027-09-30', result: 'PASS', certificate_number: 'GCN-55' }));
  ok(c.write('inspection.approve', { inspection_id: ins, decision: 'APPROVE' }, { expected_version: 1, reauth_token: c.reauth() }));
  const r = ok(c.call('report.run', { code: 'RPT_INSPECTIONS', filters: {} })).data;
  assert.deepEqual(r.columns.map((x) => x.key), ['equipment_code', 'equipment_name', 'registration_no', 'location', 'type', 'inspection_date', 'current_due_date',
    'vendor', 'certificate_number', 'record_status', 'days_remaining', 'due_state', 'requirement_code', 'cost']);
  const x = r.rows[0];
  assert.equal(x.registration_no, 'DK-NH-07');
  assert.equal(x.vendor, 'Trung tâm Kiểm định KTAT 2');
  assert.equal(x.certificate_number, 'GCN-55');
  ok(c.call('report.export', { format: 'PDF', code: 'RPT_INSPECTIONS', filters: {} }));
  const p = pdfDetail(env);
  assert.deepEqual(p.head.slice(1, 11), ['Mã thiết bị', 'Thiết bị', 'Số đăng ký thiết bị', 'Khu vực', 'Loại kiểm định', 'Ngày kiểm định', 'Hiệu lực đến',
    'Đơn vị kiểm định', 'Số chứng nhận', 'Tình trạng hồ sơ']);
  assert.equal(p.rows[0][3], 'DK-NH-07');
  assert.equal(p.rows[0][8], 'Trung tâm Kiểm định KTAT 2');
  // Lý lịch thiết bị: thông tin chung có nghiêm ngặt + số đăng ký, bảng kiểm định có đơn vị kiểm định
  ok(c.call('export.pdf', { entity_type: 'EQUIPMENT', entity_id: eq }));
  const doc = [...env.drive._docs.values()].pop();
  const txt = JSON.stringify(doc.body.children.filter((t) => t.kind === 'table').map((t) => Array.from(t.rows, (rw) => Array.from(rw.cells, (cl) => cl.getText()))));
  assert.ok(txt.includes('Thiết bị nghiêm ngặt về an toàn') && txt.includes('Có · 是') && txt.includes('DK-NH-07'), txt.slice(0, 600));
  assert.ok(txt.includes('Đơn vị kiểm định') && txt.includes('Trung tâm Kiểm định KTAT 2'));
});

test('Excel thiết bị: mẫu có cột mới đúng chỗ; nhập "Có", năm, số đăng ký; xuất rồi nhập lại nguyên trạng = không đổi', () => {
  const { env, c } = setup();
  const t = ok(c.call('import.template', { template_key: 'equipment' })).data;
  const keys = t.sheets[0].cols.map((x) => x.key);
  assert.equal(keys.indexOf('in_service_year'), keys.indexOf('manufacture_year') + 1);
  assert.ok(keys.indexOf('strict_safety') > keys.indexOf('criticality') && keys.indexOf('registration_no') === keys.indexOf('strict_safety') + 1);
  assert.equal(t.sheets[0].cols.find((x) => x.key === 'registration_no').text, true, 'số đăng ký giữ dạng chữ');
  const r = preview(c, 'equipment', [
    row('equipment', 3, { equipment_code: 'TB-01', name_vi: 'Bình khí nén', in_service_year: 2019, strict_safety: 'Có', registration_no: '0012' }),
    row('equipment', 4, { equipment_code: 'TB-02', name_vi: 'Quạt', strict_safety: 'Không' }),
    row('equipment', 5, { equipment_code: 'TB-03', name_vi: 'Sai', strict_safety: 'có lẽ', in_service_year: 1700 })
  ]);
  assert.deepEqual(r.data.errors.filter((e) => e.row === 5).map((e) => `${e.field}:${e.code}`).sort(), ['in_service_year:INVALID_VALUE', 'strict_safety:INVALID_VALUE']);
  const r2 = preview(c, 'equipment', [
    row('equipment', 3, { equipment_code: 'TB-01', name_vi: 'Bình khí nén', in_service_year: 2019, strict_safety: 'Có', registration_no: '0012' }),
    row('equipment', 4, { equipment_code: 'TB-02', name_vi: 'Quạt', strict_safety: 'Không' })
  ]);
  assert.equal(r2.data.status, 'READY', JSON.stringify(r2.data.errors));
  assert.equal(c.call('import.commit', { import_batch_id: r2.batch }, { operation_id: uuid(), reauth_token: c.reauth() }).data.status, 'COMMITTED');
  const e1 = env.rows('Equipment').find((x) => x.equipment_code === 'TB-01');
  assert.deepEqual([e1.in_service_year, e1.strict_safety, e1.registration_no], [2019, true, '0012']);
  assert.equal(env.rows('Equipment').find((x) => x.equipment_code === 'TB-02').strict_safety, false);
  // Xuất → nhập lại nguyên trạng
  const sh = ok(c.call('export.xlsx', { template_key: 'equipment' })).data.sheets[0];
  const rows = sh.rows.map((rw, i) => { const v = Object.fromEntries(sh.keys.map((k, j) => [k, rw[j]])); delete v.i18n_machine_fields; return row('equipment', i + 3, v); });
  const r3 = preview(c, 'equipment', rows);
  assert.equal(r3.data.update_count + r3.data.add_count + r3.data.error_count, 0, JSON.stringify(r3.data));
  // Sửa trong file: đổi số đăng ký → 1 dòng cập nhật
  const v1 = rows.find((x) => x.values.equipment_code === 'TB-01');
  v1.values.registration_no = '0013';
  const r4 = preview(c, 'equipment', rows);
  assert.equal(r4.data.update_count, 1);
  assert.deepEqual(r4.data.changes[0].diff.registration_no, ['0012', '0013']);
});

test('nâng máy chủ 1.5.6 → 1.5.7: trước migrateSchema chạy như đợt 6 (bỏ qua trường mới, mẫu Excel chưa có cột); migrateSchema thêm 3 cột Equipment', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 6;
  g.SCHEMA_VERSION = '1.5.6';
  const full = g.SHEETS.Equipment.cols;
  g.SHEETS.Equipment.cols = full.replace(' in_service_year:INT strict_safety:BOOL registration_no:STRING', '');
  assert.notEqual(g.SHEETS.Equipment.cols, full);
  Object.keys(g.schemaCache_ || {}).forEach((k) => delete g.schemaCache_[k]);
  env.props.setProperty('ENV', 'THAT');
  g.setup();
  env.props.setProperty('SETUP_OWNER_CODE', OWNER_CODE);
  env.props.setProperty('SETUP_OWNER_NAME', 'Chủ hệ thống');
  env.props.setProperty('SETUP_OWNER_TEMP_PIN', OWNER_TEMP_PIN);
  g.adminSetupOwner();
  g.dbReset_();
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  const hdr = () => { const s = biz.getSheetByName('Equipment'); return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0]; };
  assert.ok(!hdr().includes('strict_safety'));
  // Dán Code.gs mới, chưa migrateSchema
  g.RELEASED_DOT = 7;
  g.SCHEMA_VERSION = '1.5.7';
  g.SHEETS.Equipment.cols = full;
  Object.keys(g.schemaCache_ || {}).forEach((k) => delete g.schemaCache_[k]);
  g.dbReset_();
  assert.equal(g.releasedDot_(), 6);
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const id = uuid();
  ok(c.write('equipment.create', { equipment_id: id, name_vi: 'Máy cũ', strict_safety: true, in_service_year: 2010, registration_no: 'X' }));
  const t = ok(c.call('import.template', { template_key: 'equipment' })).data;
  assert.ok(!t.sheets[0].cols.some((x) => ['in_service_year', 'strict_safety', 'registration_no'].includes(x.key)), 'mẫu Excel chưa có cột mới');
  const r = ok(c.call('report.run', { code: 'RPT_EQUIPMENT', filters: {} })).data;
  assert.equal(r.rows[0].strict_safety, '', 'chưa migrate: ô nghiêm ngặt để trống, không ghi Không');
  g.migrateSchema();
  g.dbReset_();
  assert.ok(['in_service_year', 'strict_safety', 'registration_no'].every((k) => hdr().includes(k)));
  assert.equal(g.releasedDot_(), 7);
  assert.equal(g.readState_().map.schema_version, '1.5.7');
  ok(c.write('equipment.edit', { equipment_id: id, strict_safety: true, registration_no: 'DK-9' }, { expected_version: 1 }));
  const e = env.rows('Equipment').find((x) => x.equipment_id === id);
  assert.deepEqual([e.strict_safety, e.registration_no], [true, 'DK-9']);
});
