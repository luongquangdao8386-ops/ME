import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  return { env, c };
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Gửi xem trước theo khúc 150 dòng; trả phản hồi khúc cuối */
function preview(cl, template, rows, { batch = uuid(), source = sha(JSON.stringify(rows)), meta } = {}) {
  const size = 150;
  const n = Math.max(1, Math.ceil(rows.length / size));
  let r;
  for (let i = 0; i < n; i++) {
    r = cl.write('import.preview', { import_batch_id: batch, template_key: template, chunk_index: i, chunk_count: n, total_rows: rows.length, source_sha256: source, meta, rows: rows.slice(i * size, (i + 1) * size) });
    if (!r.ok) return r;
  }
  r.batch = batch;
  return r;
}
const row = (sheet, n, values, formulas) => ({ sheet, row_number: n, values, formulas });
const errsAt = (r, n) => r.data.errors.filter((e) => e.row === n).map((e) => `${e.field}:${e.code}`);

test('import.template: cột + danh mục mã; KT không tải mẫu hợp đồng; người không có quyền giá không có cột giá', () => {
  const { env, c } = setup();
  const t = c.call('import.template', { template_key: 'contracts' });
  assert.equal(t.ok, true, JSON.stringify(t));
  assert.ok(t.data.sheets[0].cols.some((x) => x.key === 'value'));
  assert.equal(t.data.sheets[1].name, 'contract_equipment');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  assert.equal(kt.call('import.template', { template_key: 'contracts' }).code, 'FORBIDDEN');
  const e = kt.call('import.template', { template_key: 'equipment' });
  assert.equal(e.ok, true);
  assert.ok(e.data.sheets[1].cols.some((x) => x.key === 'equipment_key'));
  assert.ok(e.data.lists.spec_keys.some((x) => x[0] === 'electrical_power'));
});

test('NT1-81 chặn lỗi: ngày 31/02, mã trùng, công thức, khu vực chưa có (nhập thiết bị trước khu vực); mã 00123 giữ số 0; lỗi đúng dòng, song ngữ → NEEDS_FIX', () => {
  const { c } = setup();
  const r = preview(c, 'equipment', [
    row('equipment', 3, { equipment_code: '00123', name_vi: 'Máy nén khí', install_date: '31/02/2026' }),
    row('equipment', 4, { equipment_code: '00123', name_vi: 'Máy nén 2' }),
    row('equipment', 5, { equipment_code: 'TB-X', name_vi: 'Bơm', location_code: 'KV-CHUA-CO' }),
    row('equipment', 6, { equipment_code: 'TB-Y', name_vi: 'Quạt', manufacture_year: 2020 }, ['manufacture_year'])
  ]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'NEEDS_FIX');
  assert.equal(r.data.error_count, 4);
  assert.deepEqual(errsAt(r, 3), ['install_date:INVALID_DATE']);
  assert.deepEqual(errsAt(r, 4), ['equipment_code:CODE_DUPLICATE']);
  assert.deepEqual(errsAt(r, 5), ['location_code:NOT_FOUND']);
  assert.deepEqual(errsAt(r, 6), ['manufacture_year:FORMULA']);
  const e3 = r.data.errors.find((e) => e.row === 3);
  assert.equal(e3.message_vi, 'Ngày không hợp lệ');
  assert.equal(e3.message_zh, '日期无效');
  // Gửi lô lỗi để duyệt / ghi → bị chặn
  assert.equal(c.write('import.submit', { import_batch_id: r.batch }).errors[0].code, 'INVALID_VALUE');
});

test('nhập khu vực rồi thiết bị kèm thông số (khóa dòng), commit của C4 → mã giữ số 0, thông số gắn thiết bị mới, tên PENDING chờ dịch nền; NT1-82 đổi file → SOURCE_CHANGED', () => {
  const { env, c } = setup();
  const loc = preview(c, 'locations', [
    row('locations', 3, { location_code: 'KV-A', name_vi: 'Xưởng A', type: 'workshop' }),
    row('locations', 4, { location_code: 'KV-A1', name_vi: 'Khu A1', parent_location_code: 'KV-A' })
  ]);
  assert.equal(loc.data.status, 'READY', JSON.stringify(loc.data.errors));
  assert.equal(loc.data.add_count, 2);
  assert.equal(loc.data.mt_fields, 2);
  const cm = c.call('import.commit', { import_batch_id: loc.batch }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(cm.ok, true, JSON.stringify(cm));
  assert.equal(cm.data.status, 'COMMITTED');
  const locs = env.rows('Locations');
  const a = locs.find((x) => x.location_code === 'KV-A'), a1 = locs.find((x) => x.location_code === 'KV-A1');
  assert.equal(a1.parent_location_id, a.location_id);
  assert.equal(a.i18n_meta.name.state, 'PENDING', 'commit Excel không dịch');
  // Thiết bị + thông số
  const rows = [
    row('equipment', 3, { row_key: 'M1', equipment_code: '00123', name_vi: 'Máy nén khí trục vít', location_code: 'KV-A', status: 'running' }),
    row('equipment', 4, { row_key: 'M2', name_vi: 'Máy sấy khí' }),
    row('equipment_specs', 3, { equipment_key: 'M1', spec_key: 'electrical_power', value_num: 37, unit: 'kW' }),
    row('equipment_specs', 4, { equipment_key: 'm2', spec_key: 'throughput', value_num: '1,5', unit: 'm³/h' })
  ];
  const eq = preview(c, 'equipment', rows);
  assert.equal(eq.data.status, 'READY', JSON.stringify(eq.data.errors));
  // Gửi lại khúc với tệp khác → SOURCE_CHANGED
  const ch = c.write('import.preview', { import_batch_id: eq.batch, template_key: 'equipment', chunk_index: 0, chunk_count: 1, total_rows: 4, source_sha256: sha('khac'), rows });
  assert.equal(ch.errors[0].code, 'SOURCE_CHANGED');
  const cm2 = c.call('import.commit', { import_batch_id: eq.batch }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(cm2.data.status, 'COMMITTED', JSON.stringify(cm2.data.errors));
  const eqs = env.rows('Equipment');
  const m1 = eqs.find((x) => x.equipment_code === '00123');
  assert.ok(m1, 'giữ số 0 đầu');
  assert.equal(m1.status, 'RUNNING');
  assert.equal(m1.location_id, a.location_id);
  const m2 = eqs.find((x) => x.name_vi === 'Máy sấy khí');
  assert.equal(m2.equipment_code, 'TB-0001');
  const specs = env.rows('EquipmentSpecs');
  assert.equal(specs.find((s) => s.spec_key === 'electrical_power').equipment_id, m1.equipment_id);
  assert.equal(specs.find((s) => s.spec_key === 'throughput').value_num, 1.5);
  assert.equal(env.rows('QrRegistry').filter((q) => q.entity_type === 'EQUIPMENT').length, 2);
  assert.ok(env.rows('AuditLogs').some((x) => x.action === 'import.commit'));
  // runBackgroundJobs dịch bù
  env.g.runBackgroundJobs();
  assert.equal(env.rows('Locations').find((x) => x.location_code === 'KV-A').i18n_meta.name.state, 'MACHINE');
});

test('xuất rồi nhập lại (UPDATE theo ID + record_version): sửa tên; bản dịch máy giữ nguyên thì vẫn MACHINE; phiên bản cũ → VERSION_CONFLICT', () => {
  const { env, c } = setup();
  const id = uuid();
  c.write('equipment.create', { equipment_id: id, name_vi: 'Bơm nước thải', model: 'P-100' });
  const ex = c.call('export.xlsx', { template_key: 'equipment' });
  assert.equal(ex.ok, true, JSON.stringify(ex));
  const sh = ex.data.sheets[0];
  assert.ok(sh.keys.includes('i18n_machine_fields'));
  const vals = Object.fromEntries(sh.keys.map((k, i) => [k, sh.rows[0][i]]));
  assert.equal(vals.equipment_id, id);
  assert.equal(vals.i18n_machine_fields, 'name');
  delete vals.i18n_machine_fields;
  const upd = { ...vals, model: 'P-200' };
  const r = preview(c, 'equipment', [row('equipment', 3, upd)]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(r.data.update_count, 1);
  assert.deepEqual(r.data.changes[0].diff.model, ['P-100', 'P-200']);
  assert.equal(c.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: c.reauth() }).data.status, 'COMMITTED');
  const e = env.rows('Equipment')[0];
  assert.equal(e.model, 'P-200');
  assert.equal(e.i18n_meta.name.state, 'MACHINE', 'xuất rồi nhập lại không mất nhãn dịch máy');
  assert.equal(e.record_version, 2);
  // File cũ (record_version 1) → xung đột
  const old = preview(c, 'equipment', [row('equipment', 3, { ...vals, model: 'P-300' })]);
  assert.deepEqual(errsAt(old, 3), ['record_version:VERSION_CONFLICT']);
});

test('lô nhạy cảm (kiểm định): HĐ nhập + gửi duyệt; HĐ không commit; C4 nhập thì không tự commit; C3 commit (PIN) = duyệt → APPROVED, hạn hiện hành, nhắc hạn', () => {
  const { env, c } = setup();
  const eq = uuid(), type = uuid(), req = uuid();
  c.write('equipment.create', { equipment_id: eq, name_vi: 'Bình áp lực' });
  c.write('inspection.type.edit', { inspection_type_id: type, code: 'AP_LUC', name_vi: 'Bình chịu áp lực' });
  const rq = c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type });
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const today = env.g.todayVN_();
  const soon = env.g.isoFromDayNum_ ? null : null;
  void soon;
  const validTo = new Date(Date.parse(today + 'T00:00:00Z') + 20 * 86400000).toISOString().slice(0, 10);
  const r = preview(hd, 'inspections', [row('inspections', 3, { requirement_code: rq.data.display_code, inspection_date: today, valid_from: today, valid_to: validTo, result: 'PASS', certificate_number: 'CN-77' })]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(r.data.sensitive, true);
  assert.equal(hd.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: 'x' }).code, 'FORBIDDEN');
  assert.equal(hd.write('import.submit', { import_batch_id: r.batch }).data.status, 'PENDING_APPROVAL');
  // Danh sách lô chờ duyệt của C3
  assert.ok(c3.call('import.errors', {}).data.items.some((b) => b.import_batch_id === r.batch && b.status === 'PENDING_APPROVAL'));
  assert.equal(c3.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid() }).code, 'REAUTH_REQUIRED');
  const cm = c3.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: c3.reauth() });
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const ins = env.rows('Inspections')[0];
  assert.equal(ins.status, 'APPROVED');
  assert.equal(ins.approved_by, env.rows('Users').find((u) => u.employee_code === 'U-C3').user_id);
  assert.equal(ins.submitted_by, env.rows('Users').find((u) => u.employee_code === 'U-HD').user_id);
  assert.equal(env.rows('InspectionRequirements')[0].current_due_date, validTo);
  assert.equal(env.rows('Alerts').filter((a) => a.alert_state === 'OPEN').length, 1);
  // C4 tự nhập lô nhạy cảm → không tự commit
  const r2 = preview(c, 'inspections', [row('inspections', 3, { requirement_code: rq.data.display_code, inspection_date: today, result: 'FAIL' })]);
  assert.equal(r2.data.status, 'READY', JSON.stringify(r2.data.errors));
  const rtc = c.call('auth.reauth', { pin: OWNER_PIN });
  assert.equal(rtc.ok, true, JSON.stringify(rtc));
  assert.equal(c.call('import.commit', { import_batch_id: r2.batch }, { operation_id: uuid(), reauth_token: rtc.data.reauth_token }).code, 'FORBIDDEN');
});

test('NT1-83 ghi dở: 250 dòng → khúc 100 → PARTIAL; tiếp tục trong 30 phút không hỏi PIN; quá 30 phút phải hỏi lại', () => {
  const { env, c } = setup();
  const rows = Array.from({ length: 250 }, (_, i) => row('glossary', i + 3, { term_vi: 'Thuật ngữ ' + i, term_zh: '术语' + i }));
  const r = preview(c, 'glossary', rows);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors.slice(0, 3)));
  const c1 = c.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(c1.data.status, 'PARTIAL');
  assert.equal(c1.data.committed, 100);
  assert.equal(c1.data.continue_token, r.batch);
  const c2 = c.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid() });
  assert.equal(c2.ok, true, JSON.stringify(c2));
  assert.equal(c2.data.committed, 200);
  env.clock.advance(31 * 60000);
  assert.equal(c.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid() }).code, 'REAUTH_REQUIRED');
  const c3 = c.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(c3.data.status, 'COMMITTED');
  assert.equal(env.rows('Glossary').length, 250);
  // Lô đã xong: hủy không được
  assert.equal(c.write('import.cancel', { import_batch_id: r.batch }).errors[0].code, 'INVALID_VALUE');
});

test('hợp đồng: thêm mới kèm thiết bị (khóa dòng) và giá trị → lô nhạy cảm; HĐ nhập, C4 commit; hủy lô của mình', () => {
  const { env, c } = setup();
  c.write('equipment.create', { equipment_id: uuid(), equipment_code: 'TB-DH1', name_vi: 'Điều hòa 1' });
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const r = preview(hd, 'contracts', [
    row('contracts', 3, { row_key: 'H1', title_vi: 'Bảo trì điều hòa', start_date: '01/01/2026', end_date: '31/12/2026', renewal_notice_date: '30/11/2026', value: 120000000 }),
    row('contract_equipment', 3, { contract_key: 'H1', equipment_code: 'TB-DH1', service_vi: 'Vệ sinh', interval_type: 'MONTH', interval_value: 3 })
  ]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(r.data.sensitive, true);
  hd.write('import.submit', { import_batch_id: r.batch });
  const cm = c.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const ct = env.rows('Contracts')[0];
  assert.equal(ct.contract_code, 'HD-0001');
  assert.equal(ct.value, 120000000);
  assert.equal(ct.renewal_notice_date, '2026-11-30');
  assert.equal(env.rows('ContractEquipment')[0].contract_id, ct.contract_id);
  // Hủy lô
  const r2 = preview(hd, 'contracts', [row('contracts', 3, { title_vi: 'X', end_date: '2027-01-01' })]);
  assert.equal(hd.write('import.cancel', { import_batch_id: r2.batch }).data.status, 'FAILED');
});

test('NT1-84 export.xlsx: C3 có cột giá; C1 được bật X nhưng không có $ → không cột giá; có điều kiện lọc; ghi AuditLogs; lọc hạn 40 ngày', () => {
  const { env, c } = setup();
  const today = env.g.todayVN_();
  const plus = (n) => new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  c.write('contract.create', { contract_id: uuid(), title_vi: '=HYPERLINK("x")', end_date: plus(20), value: 5000000 });
  c.write('contract.create', { contract_id: uuid(), title_vi: 'Xa', end_date: plus(200) });
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const x3 = c3.call('export.xlsx', { template_key: 'contracts' });
  assert.equal(x3.ok, true, JSON.stringify(x3));
  assert.ok(x3.data.sheets[0].keys.includes('value'));
  assert.equal(x3.data.sheets[0].rows.length, 2);
  assert.equal(c3.call('export.xlsx', { template_key: 'contracts', due: 'DUE40' }).data.sheets[0].rows.length, 1);
  const c1 = userClient(env, 'U-C1', 1, '482915');
  assert.equal(c1.call('export.xlsx', { template_key: 'contracts' }).code, 'FORBIDDEN');
  const pe = c.call('permission.edit', { changes: [{ role_level: 1, module: 'contracts', flags: 'VX' }], reason: 'Cho xem xuất' }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(pe.ok, true, JSON.stringify(pe));
  const x1 = c1.call('export.xlsx', { template_key: 'contracts' });
  assert.equal(x1.ok, true, JSON.stringify(x1));
  assert.ok(!x1.data.sheets[0].keys.includes('value') && !x1.data.sheets[1].keys.includes('price'));
  assert.ok(!JSON.stringify(x1.data).includes('5000000'));
  assert.deepEqual(x1.data.filters[0], ['template_key', 'contracts']);
  assert.ok(env.rows('AuditLogs').some((a) => a.action === 'export.xlsx'));
  const al = c3.call('export.xlsx', { list: 'alerts' });
  assert.equal(al.data.sheets[0].rows.length, 1);
});
