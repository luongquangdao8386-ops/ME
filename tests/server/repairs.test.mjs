// Sửa chữa Đợt 2: báo sự cố (cả offline), phân công, xử lý, 6 mốc (C9), gửi/nghiệm thu, hủy, mở lại (4.4.4, 4.6, 6.9.1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN, fakeJpegB64 } from '../helpers.mjs';

const nowIso = (env, minutes = 0) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + minutes * 60000));
const uidOf = (env, code) => env.rows('Users').find((u) => u.employee_code === code).user_id;

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Băng tải 02' }).ok, true);
  assert.equal(c.write('lookup.edit', { value_id: uuid(), group_key: 'CAUSE', code: 'MON', name_vi: 'Mòn' }).ok, true);
  const bs = userClient(env, 'U-BS', 2, '583011', 'BAO_SU_CO');
  const bs2 = userClient(env, 'U-BS2', 2, '583012', 'BAO_SU_CO');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const kt2 = userClient(env, 'U-KT2', 2, '583017', 'KY_THUAT');
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  return { env, c, eq, bs, bs2, kt, kt2, hd, c3 };
}

function report(cl, eq, extra = {}) {
  const id = uuid();
  const r = cl.write('repair.report', { repair_id: id, equipment_id: eq, symptom_vi: 'Băng tải kêu to, rung', severity: 'HIGH', machine_stopped: true, ...extra });
  return { id, r };
}

test('báo sự cố: bắt chọn mức độ, một thứ tiếng (dịch máy), mã SC, QR; cấp 1 không báo; báo offline giữ giờ trên máy, gửi lại không trùng', () => {
  const { env, eq, bs, c } = setup();
  const c1 = userClient(env, 'U-C1', 1, '702913');
  assert.equal(c1.write('repair.report', { repair_id: uuid(), equipment_id: eq, symptom_vi: 'x', severity: 'LOW' }).code, 'FORBIDDEN');
  let bad = bs.write('repair.report', { repair_id: uuid(), equipment_id: eq, symptom_vi: 'x' });
  assert.equal(bad.errors[0].field, 'severity');
  bad = bs.write('repair.report', { repair_id: uuid(), equipment_id: eq, severity: 'LOW' });
  assert.equal(bad.errors[0].code, 'REQUIRED_ONE_LANGUAGE');
  const { id, r } = report(bs, eq);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.data.display_code, /^SC-\d{4}-001$/);
  assert.ok(r.data.qr_key);
  const row = env.rows('Repairs')[0];
  assert.equal(row.status, 'REPORTED');
  assert.equal(row.priority, 'NORMAL');
  assert.equal(row.stopped_at, row.reported_at, 'dừng máy lúc báo');
  assert.ok(row.symptom_zh, 'dịch máy');
  assert.equal(row.i18n_meta.symptom.state, 'MACHINE');
  void id;
  // Offline: giờ báo = giờ trên máy lúc tạo nháp
  const rid = uuid(), op = uuid();
  const created = nowIso(env, -90);
  const push = bs.call('sync.push', { op: { action: 'repair.report', operation_id: op, expected_version: 0, local_created_at: created, payload: { repair_id: rid, equipment_id: eq, symptom_vi: 'Rò dầu', severity: 'LOW' } } });
  assert.equal(push.ok, true, JSON.stringify(push));
  assert.equal(env.rows('Repairs').find((x) => x.repair_id === rid).reported_at, created);
  const again = bs.call('sync.push', { op: { action: 'repair.report', operation_id: op, expected_version: 0, local_created_at: created, payload: { repair_id: rid, equipment_id: eq, symptom_vi: 'Rò dầu', severity: 'LOW' } } });
  assert.equal(again.code, 'DUPLICATE_OPERATION');
  assert.equal(again.data.display_code, push.data.display_code, 'giữ mã máy chủ cấp lần đầu');
  assert.equal(env.rows('Repairs').length, 2);
  void c;
});

test('ảnh sự cố: người báo (BS, HĐ) gửi ảnh hiện trường khi còn Mới báo; người khác không; KT được giao gửi ảnh vào phiếu', () => {
  const { env, eq, bs, bs2, hd, kt, c3 } = setup();
  const { id } = report(bs, eq);
  const up = (cl, entity, kind = 'PHOTO_SITE') => cl.write('doc.upload', { document_id: uuid(), entity_type: 'REPAIR', entity_id: entity, kind, mime_type: 'image/jpeg', content_b64: fakeJpegB64(), title_vi: 'Ảnh' });
  assert.equal(up(bs, id).ok, true);
  assert.equal(up(bs2, id).code, 'FORBIDDEN');
  const h = report(hd, eq);
  assert.equal(h.r.ok, true);
  assert.equal(up(hd, h.id).ok, true, 'HĐ báo sự cố gửi được ảnh phiếu mình báo');
  assert.equal(up(hd, id).code, 'FORBIDDEN');
  assert.equal(up(kt, id).code, 'FORBIDDEN', 'KT chưa được giao');
  assert.equal(c3.write('repair.assign', { repair_id: id, assignee_user_id: uidOf(env, 'U-KT') }, { expected_version: 1 }).ok, true);
  assert.equal(up(kt, id).ok, true);
  assert.equal(up(kt, id, 'CONTRACT').code, 'FORBIDDEN', 'KT không gửi tài liệu có giá vào phiếu');
  assert.equal(up(bs, id).code, 'FORBIDDEN', 'đã phân công: người báo không thêm ảnh');
});

test('sửa phiếu báo: chỉ của mình khi còn Mới báo; hủy: cấp 2 chỉ phiếu mình báo chưa phân công', () => {
  const { env, eq, bs, bs2, c3 } = setup();
  const { id } = report(bs, eq);
  assert.equal(bs2.write('repair.editReport', { repair_id: id, severity: 'LOW' }, { expected_version: 1 }).code, 'FORBIDDEN');
  const e = bs.write('repair.editReport', { repair_id: id, severity: 'MEDIUM', symptom_vi: 'Băng tải rung mạnh' }, { expected_version: 1 });
  assert.equal(e.ok, true, JSON.stringify(e));
  assert.equal(env.rows('Repairs')[0].severity, 'MEDIUM');
  assert.equal(bs2.write('repair.cancel', { repair_id: id, reason: 'x' }, { expected_version: 2 }).code, 'FORBIDDEN');
  const other = report(bs, eq);
  assert.equal(bs.write('repair.cancel', { repair_id: other.id }, { expected_version: 1 }).errors[0].field, 'reason');
  assert.equal(bs.write('repair.cancel', { repair_id: other.id, reason: 'Báo nhầm' }, { expected_version: 1 }).ok, true);
  assert.equal(env.rows('QrRegistry').find((q) => q.entity_id === other.id).active, false);
  assert.equal(c3.write('repair.assign', { repair_id: id, assignee_user_id: uidOf(env, 'U-KT') }, { expected_version: 2 }).ok, true);
  assert.equal(bs.write('repair.editReport', { repair_id: id, severity: 'LOW' }, { expected_version: 3 }).errors[0].code, 'STATUS_INVALID');
  assert.equal(bs.write('repair.cancel', { repair_id: id, reason: 'x' }, { expected_version: 3 }).code, 'FORBIDDEN');
});

test('xử lý và gửi nghiệm thu: phân công ghi mốc; KT được giao xử lý, việc con giao KT khác; đủ mốc kết thúc + chạy thử; việc con phải xong', () => {
  const { env, eq, bs, kt, kt2, c3 } = setup();
  const { id } = report(bs, eq);
  env.clock.advance(3 * 3600000); // xử lý sau lúc báo (dừng máy lúc báo)
  assert.equal(kt.write('repair.assign', { repair_id: id, assignee_user_id: uidOf(env, 'U-KT') }, { expected_version: 1 }).code, 'FORBIDDEN');
  const a = c3.write('repair.assign', { repair_id: id, assignee_user_id: uidOf(env, 'U-KT'), priority: 'URGENT' }, { expected_version: 1 });
  assert.equal(a.ok, true, JSON.stringify(a));
  let row = env.rows('Repairs')[0];
  assert.equal(row.status, 'ASSIGNED');
  assert.ok(row.assigned_at);
  assert.equal(row.priority, 'URGENT');
  assert.equal(kt2.write('repair.process', { repair_id: id, diagnosis_vi: 'x' }, { expected_version: 2 }).code, 'FORBIDDEN');
  assert.equal(kt.write('repair.process', { repair_id: id, root_cause_code: 'KHONG_CO' }, { expected_version: 2 }).errors[0].field, 'root_cause_code');
  assert.equal(kt.write('repair.process', { repair_id: id, labor_cost: 100 }, { expected_version: 2 }).errors[0].field, 'labor_cost', 'chi phí qua work.cost.edit');
  const task = uuid();
  let p = kt.write('repair.process', {
    repair_id: id, repair_start_at: nowIso(env, -100), diagnosis_vi: 'Vòng bi mòn', root_cause_code: 'MON', action_vi: 'Thay vòng bi 6205',
    tasks: [{ repair_task_id: task, task_vi: 'Tháo puly', assignee_user_id: uidOf(env, 'U-KT2') }]
  }, { expected_version: 2 });
  assert.equal(p.ok, true, JSON.stringify(p));
  row = env.rows('Repairs')[0];
  assert.equal(row.status, 'IN_PROGRESS');
  assert.equal(row.repair_start_at, nowIso(env, -100).slice(0, 16) + row.repair_start_at.slice(16));
  assert.ok(row.diagnosis_zh, 'chẩn đoán dịch máy');
  // KT2 làm việc con → được xử lý
  p = kt2.write('repair.process', { repair_id: id, tasks: [{ repair_task_id: task, status: 'DONE', result_vi: 'Đã tháo' }] }, { expected_version: 3 });
  assert.equal(p.ok, true, JSON.stringify(p));
  const t2 = uuid();
  assert.equal(kt.write('repair.process', { repair_id: id, tasks: [{ repair_task_id: t2, task_vi: 'Lắp lại' }] }, { expected_version: 4 }).ok, true);
  let s = kt.write('repair.submit', { repair_id: id }, { expected_version: 5 });
  const codes = s.errors.map((e) => [e.field, e.code]);
  assert.deepEqual(codes.map((x) => x[0]).sort(), ['downtime_note', 'repair_end_at', `tasks[${t2}]`, 'test_run_result'].sort(), JSON.stringify(codes));
  assert.equal(kt.write('repair.process', { repair_id: id, repair_end_at: nowIso(env, -10), restored_at: nowIso(env, -5), test_run_result: 'PASS', test_run_note_vi: 'Chạy êm 30 phút', tasks: [{ repair_task_id: t2, remove: true }] }, { expected_version: 5 }).ok, true);
  assert.equal(env.rows('RepairTasks').find((x) => x.repair_task_id === t2).archived_at !== '', true);
  s = kt.write('repair.submit', { repair_id: id }, { expected_version: 6 });
  assert.equal(s.ok, true, JSON.stringify(s));
  row = env.rows('Repairs')[0];
  assert.equal(row.status, 'PENDING_ACCEPTANCE');
  assert.equal(row.submitted_by, uidOf(env, 'U-KT'));
  // C9: đủ 6 mốc theo thứ tự, chưa có mốc nghiệm thu
  for (const f of ['reported_at', 'assigned_at', 'repair_start_at', 'repair_end_at', 'restored_at']) assert.ok(row[f], f);
  assert.equal(row.approved_at, '');
});

function readyForAcceptance(ctx, reporter) {
  const { env, eq, kt, c3 } = ctx;
  const { id } = report(reporter || ctx.bs, eq);
  env.clock.advance(3 * 3600000);
  assert.equal(c3.write('repair.assign', { repair_id: id, assignee_user_id: uidOf(env, 'U-KT') }, { expected_version: 1 }).ok, true);
  assert.equal(kt.write('repair.process', { repair_id: id, repair_start_at: nowIso(env, -60), repair_end_at: nowIso(env, -10), restored_at: nowIso(env, -9), test_run_result: 'PASS' }, { expected_version: 2 }).ok, true);
  assert.equal(kt.write('repair.submit', { repair_id: id }, { expected_version: 3 }).ok, true);
  return id;
}

test('nghiệm thu: người báo (kể cả cấp 3), người phụ trách không nghiệm thu; cần PIN; đạt → Hoàn thành; không đạt → trả lại kèm lý do', () => {
  const ctx = setup();
  const { env, c, c3, kt } = ctx;
  const id = readyForAcceptance(ctx, c3);
  assert.equal(kt.write('repair.accept', { repair_id: id, decision: 'PASS' }, { expected_version: 4 }).code, 'FORBIDDEN');
  assert.equal(c3.write('repair.accept', { repair_id: id, decision: 'PASS' }, { expected_version: 4, reauth_token: c3.reauth() }).code, 'FORBIDDEN', 'C3 báo sự cố không tự nghiệm thu');
  assert.equal(c.write('repair.accept', { repair_id: id, decision: 'FAIL' }, { expected_version: 4, reauth_token: c.reauth() }).errors[0].field, 'reason');
  let a = c.write('repair.accept', { repair_id: id, decision: 'FAIL', reason: 'Còn rung' }, { expected_version: 4, reauth_token: c.reauth() });
  assert.equal(a.ok, true, JSON.stringify(a));
  let row = env.rows('Repairs').find((x) => x.repair_id === id);
  assert.equal(row.status, 'IN_PROGRESS');
  assert.equal(row.acceptance_result, 'FAIL');
  assert.equal(row.returned_reason, 'Còn rung');
  assert.equal(kt.write('repair.submit', { repair_id: id }, { expected_version: 5 }).ok, true);
  a = c.write('repair.accept', { repair_id: id, decision: 'PASS' }, { expected_version: 6, reauth_token: c.reauth() });
  assert.equal(a.ok, true);
  row = env.rows('Repairs').find((x) => x.repair_id === id);
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.acceptance_result, 'PASS');
  assert.ok(row.approved_at);
});

test('mở lại phiếu Hoàn thành/Đã hủy (C3, PIN, lý do): trạng thái theo mốc đã có; QR dùng lại', () => {
  const ctx = setup();
  const { env, c, c3, bs, eq } = ctx;
  const id = readyForAcceptance(ctx);
  assert.equal(c3.write('repair.accept', { repair_id: id, decision: 'PASS' }, { expected_version: 4, reauth_token: c3.reauth() }).ok, true);
  assert.equal(c3.write('repair.reopen', { repair_id: id, reason: 'Tái diễn' }, { expected_version: 5 }).code, 'REAUTH_REQUIRED');
  assert.equal(c3.write('repair.reopen', { repair_id: id }, { expected_version: 5, reauth_token: c3.reauth() }).errors[0].field, 'reason');
  assert.equal(c3.write('repair.reopen', { repair_id: id, reason: 'Tái diễn sau 1 ngày' }, { expected_version: 5, reauth_token: c3.reauth() }).ok, true);
  const row = env.rows('Repairs').find((x) => x.repair_id === id);
  assert.equal(row.status, 'IN_PROGRESS');
  assert.equal(row.approved_by, '');
  assert.equal(row.reopen_reason, 'Tái diễn sau 1 ngày');
  const other = report(bs, eq);
  assert.equal(c3.write('repair.cancel', { repair_id: other.id, reason: 'Trùng' }, { expected_version: 1 }).ok, true);
  assert.equal(c.write('repair.reopen', { repair_id: other.id, reason: 'Không trùng' }, { expected_version: 2, reauth_token: c.reauth() }).ok, true);
  assert.equal(env.rows('Repairs').find((x) => x.repair_id === other.id).status, 'REPORTED');
  assert.equal(env.rows('QrRegistry').find((q) => q.entity_id === other.id).active, true);
  // QR mở được với người có quyền xem sửa chữa
  const qr = env.rows('QrRegistry').find((q) => q.entity_id === other.id);
  const res = bs.call('qr.resolve', { qr_key: qr.qr_key });
  assert.equal(res.data.qr_state, 'OK');
  assert.equal(res.data.entity_type, 'REPAIR');
});
