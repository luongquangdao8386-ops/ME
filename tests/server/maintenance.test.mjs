// Bảo trì Đợt 2: kế hoạch, checklist có revision, phiếu, điều kiện gửi nghiệm thu (5.1.1), nghiệm thu, giờ chạy (6.9.1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nowIso = (env, minutes = 0) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + minutes * 60000));
const codeOf = (r) => r.data && r.data.display_code;

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }).ok, true);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const tpl = uuid();
  const t = c.write('maintenance.checklist.edit', {
    template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén',
    items: [
      { label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL', required: true },
      { label_vi: 'Áp suất xả', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8, required: true },
      { label_vi: 'Ghi chú tiếng ồn', result_type: 'TEXT', required: false, safety_note_vi: 'Ngắt điện trước khi mở nắp' }
    ]
  });
  assert.equal(t.ok, true, JSON.stringify(t));
  const today = env.g.todayVN_();
  return { env, c, kt, ktId, c3, eq, tpl, today };
}

function makePlan(ctx, extra = {}) {
  const { c, eq, tpl, ktId, today } = ctx;
  const plan = uuid();
  const r = c.write('maintenance.plan.edit', {
    plan_id: plan, equipment_id: eq, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1,
    anchor_date: addDays(today, 3), checklist_template_id: tpl, assignee_user_id: ktId, priority: 'HIGH', ...extra
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { plan, r };
}

const woOf = (env, planId) => env.rows('WorkOrders').filter((w) => w.plan_id === planId);
const resultsOf = (env, woId) => env.rows('WorkOrderResults').filter((r) => r.work_order_id === woId).sort((a, b) => a.step_no - b.step_no);

test('Đợt 2 đã bật; checklist revision 1, nhãn dịch máy, yêu cầu an toàn không dịch tự động; kế hoạch KH-0001 tới hạn sinh phiếu BT ngay (SYSTEM, đã giao việc)', () => {
  const ctx = setup();
  const { env, today } = ctx;
  const items = env.rows('ChecklistTemplates');
  assert.equal(items.length, 3);
  assert.equal(items[0].revision, 1);
  assert.equal(items[1].unit, 'bar');
  assert.equal(items[2].safety_note_zh, '', 'yêu cầu an toàn: không dịch tự động (2.3)');
  assert.equal(items[2].i18n_meta.safety_note.state, 'MANUAL_REQUIRED');
  const { plan, r } = makePlan(ctx);
  assert.equal(codeOf(r), 'KH-0001');
  assert.ok(r.data.qr_key);
  const pl = env.rows('MaintenancePlans')[0];
  assert.equal(pl.next_due_date, addDays(today, 3));
  const wos = woOf(env, plan);
  assert.equal(wos.length, 1, 'trong 7 ngày → sinh phiếu luôn');
  const w = wos[0];
  assert.match(w.work_order_code, /^BT-\d{4}-001$/);
  assert.equal(w.status, 'ASSIGNED');
  assert.equal(w.created_by, 'SYSTEM');
  assert.equal(w.priority, 'HIGH');
  assert.equal(w.due_date, addDays(today, 3));
  assert.equal(w.checklist_revision, 1);
  const res = resultsOf(env, w.work_order_id);
  assert.equal(res.length, 3);
  assert.deepEqual(res.map((x) => x.result_status), ['PENDING', 'PENDING', 'PENDING']);
  assert.equal(res[2].safety_note_vi, 'Ngắt điện trước khi mở nắp');
  assert.equal(r.data.generated_work_order.work_order_id, w.work_order_id);
  assert.ok(env.rows('QrRegistry').some((q) => q.entity_type === 'WORK_ORDER' && q.entity_id === w.work_order_id));
  assert.ok(env.rows('QrRegistry').some((q) => q.entity_type === 'MAINTENANCE_PLAN' && q.entity_id === plan));
  // Kế hoạch xa hơn 7 ngày: chưa sinh phiếu
  const far = makePlan(ctx, { anchor_date: addDays(today, 20), title_vi: 'Xa' });
  assert.equal(woOf(env, far.plan).length, 0);
});

test('quyền: KT không sửa kế hoạch/checklist, không giao việc; KT chỉ làm phiếu được giao; cấp 1 chỉ xem', () => {
  const ctx = setup();
  const { env, kt, eq, tpl } = ctx;
  assert.equal(kt.write('maintenance.plan.edit', { plan_id: uuid(), equipment_id: eq, title_vi: 'X', interval_type: 'DAY', interval_value: 7, anchor_date: ctx.today }).code, 'FORBIDDEN');
  assert.equal(kt.write('maintenance.checklist.edit', { template_id: uuid(), template_name_vi: 'X', items: [{ label_vi: 'a' }] }).code, 'FORBIDDEN');
  const { plan } = makePlan(ctx, { assignee_user_id: '' });
  const w = woOf(env, plan)[0];
  assert.equal(w.status, 'DRAFT', 'không có người làm mặc định → Nháp');
  assert.equal(kt.write('maintenance.assign', { work_order_id: w.work_order_id, assignee_user_id: ctx.ktId }, { expected_version: 1 }).code, 'FORBIDDEN');
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env) }, { expected_version: 1 }).code, 'FORBIDDEN', 'chưa được giao');
  const c1 = userClient(env, 'U-C1', 1, '702913');
  assert.equal(c1.call('maintenance.view', {}).ok, true);
  assert.equal(c1.write('maintenance.wo.create', { work_order_id: uuid(), equipment_id: eq, title_vi: 'x' }).code, 'FORBIDDEN');
  // Bootstrap: KT thấy action Đợt 2 theo quyền
  const b = kt.call('sync.bootstrap', {});
  for (const a of ['maintenance.view', 'maintenance.execute', 'maintenance.submit', 'maintenance.wo.create', 'maintenance.hours.record', 'repair.report']) assert.ok(b.data.permissions.actions.includes(a), a);
  assert.ok(!b.data.permissions.actions.includes('maintenance.accept'));
  assert.ok(b.data.records.WORK_ORDER.some((x) => x.work_order_id === w.work_order_id));
  assert.equal(b.data.records.CHECKLIST_ITEM.length, 3);
  void tpl;
});

test('làm phiếu và điều kiện Gửi nghiệm thu (C8, 5.1.1): thiếu mục, ngoài giới hạn cần ghi chú, không đạt cần ghi chú, kết quả chung, thời gian', () => {
  const ctx = setup();
  const { env, kt } = ctx;
  const { plan } = makePlan(ctx);
  const w = woOf(env, plan)[0];
  const [r1, r2, r3] = resultsOf(env, w.work_order_id);
  const start = nowIso(env, -60);
  let x = kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: start }, { expected_version: 1 });
  assert.equal(x.ok, true, JSON.stringify(x));
  assert.equal(x.data.record.status, 'IN_PROGRESS');
  // NA không cho mục bắt buộc
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, results: [{ result_id: r1.result_id, result_status: 'NA' }] }, { expected_version: 2 }).errors[0].code, 'INVALID_VALUE');
  // Gửi khi còn thiếu
  let s = kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 2 });
  assert.equal(s.code, 'VALIDATION_ERROR');
  const codes = s.errors.map((e) => e.code);
  assert.ok(codes.includes('REQUIRED_ITEM_MISSING'));
  assert.ok(codes.includes('REQUIRED'), 'kết quả chung, giờ kết thúc');
  assert.equal(s.errors.find((e) => e.code === 'REQUIRED_ITEM_MISSING').field, `results[${r1.result_id}]`);
  // Số đo ngoài [6, 8] mà chọn Đạt, không ghi chú; mục FAIL không ghi chú; kết quả chung PASS
  x = kt.write('maintenance.execute', {
    work_order_id: w.work_order_id, end_at: nowIso(env, -5), overall_result: 'PASS',
    results: [{ result_id: r1.result_id, result_status: 'FAIL' }, { result_id: r2.result_id, result_status: 'PASS', measured_value: 9.5 }]
  }, { expected_version: 2 });
  assert.equal(x.ok, true, JSON.stringify(x));
  s = kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 3 });
  const c2 = s.errors.map((e) => e.code).sort();
  assert.deepEqual(c2, ['FAIL_NOTE_REQUIRED', 'OUT_OF_RANGE_NOTE_REQUIRED', 'OVERALL_RESULT_MISMATCH', 'REQUIRED'].sort(), JSON.stringify(s.errors));
  assert.equal(env.rows('WorkOrders')[0].status, 'IN_PROGRESS', 'sai thì phiếu giữ Đang làm');
  // Thời gian: kết thúc trước bắt đầu
  x = kt.write('maintenance.execute', { work_order_id: w.work_order_id, end_at: nowIso(env, -120) }, { expected_version: 3 });
  assert.equal(x.ok, true);
  s = kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 4 });
  assert.ok(s.errors.some((e) => e.code === 'TIME_ORDER_INVALID'));
  // Dừng máy chưa chạy lại → ghi chú
  x = kt.write('maintenance.execute', {
    work_order_id: w.work_order_id, end_at: nowIso(env, -2), overall_result: 'PASS', downtime_start_at: nowIso(env, -50),
    results: [{ result_id: r1.result_id, result_status: 'PASS' }, { result_id: r2.result_id, result_status: 'PASS', measured_value: 9.5, note_vi: 'Đã chỉnh van, chấp nhận' }, { result_id: r3.result_id, result_status: 'PASS', note_vi: 'Êm' }]
  }, { expected_version: 4 });
  assert.equal(x.ok, true, JSON.stringify(x));
  s = kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 5 });
  assert.deepEqual(s.errors.map((e) => [e.field, e.code]), [['downtime_note', 'REQUIRED']]);
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, downtime_end_at: nowIso(env, -10) }, { expected_version: 5 }).ok, true);
  // Dữ liệu con chưa lên máy chủ
  s = kt.write('maintenance.submit', { work_order_id: w.work_order_id, expect: { documents: [uuid()] } }, { expected_version: 6 });
  assert.equal(s.errors[0].code, 'UNSYNCED_CHILD_DATA');
  s = kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 6 });
  assert.equal(s.ok, true, JSON.stringify(s));
  const w2 = env.rows('WorkOrders')[0];
  assert.equal(w2.status, 'PENDING_ACCEPTANCE', 'gửi nghiệm thu không tự hoàn thành');
  assert.equal(w2.submitted_by, env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id);
  assert.equal(resultsOf(env, w.work_order_id)[1].note_zh !== '', true, 'ghi chú dịch máy');
});

function doneWorkOrder(ctx, opts = {}) {
  const { env, kt } = ctx;
  const { plan } = makePlan(ctx, opts.plan || {});
  const w = woOf(env, plan)[0];
  const [r1, r2] = resultsOf(env, w.work_order_id);
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -60) }, { expected_version: 1 }).ok, true);
  const res = kt.write('maintenance.execute', {
    work_order_id: w.work_order_id, end_at: nowIso(env, -1), overall_result: opts.fail ? 'FAIL' : 'PASS', ...(opts.exec || {}),
    results: [{ result_id: r1.result_id, result_status: opts.fail ? 'FAIL' : 'PASS', note_vi: opts.fail ? 'Dầu đen, rò rỉ' : undefined }, { result_id: r2.result_id, result_status: 'PASS', measured_value: 7 }]
  }, { expected_version: 2 });
  assert.equal(res.ok, true, JSON.stringify(res));
  return { plan, w };
}

test('nghiệm thu: cần PIN, KT không nghiệm thu, người làm không tự nghiệm thu; đạt → Hoàn thành, kế hoạch sang hạn tháng sau; trả lại kèm lý do', () => {
  const ctx = setup();
  const { env, c, c3, kt, today } = ctx;
  const { plan, w } = doneWorkOrder(ctx);
  assert.equal(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 3 }).ok, true);
  assert.equal(kt.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: 4 }).code, 'FORBIDDEN');
  assert.equal(c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: 4 }).code, 'REAUTH_REQUIRED');
  // Trả lại
  let a = c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'RETURN' }, { expected_version: 4, reauth_token: c3.reauth() });
  assert.equal(a.errors[0].field, 'reason');
  a = c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'RETURN', reason: 'Thiếu ảnh sau' }, { expected_version: 4, reauth_token: c3.reauth() });
  assert.equal(a.ok, true, JSON.stringify(a));
  let row = env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id);
  assert.equal(row.status, 'IN_PROGRESS');
  assert.equal(row.returned_reason, 'Thiếu ảnh sau');
  assert.equal(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 5 }).ok, true);
  // C4 owner tạo kế hoạch nhưng phiếu do SYSTEM lập → nghiệm thu được
  a = c.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: 6, reauth_token: c.reauth() });
  assert.equal(a.ok, true, JSON.stringify(a));
  row = env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id);
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.approved_by, env.rows('Users').find((u) => u.employee_code === 'NV-001').user_id);
  const pl = env.rows('MaintenancePlans').find((x) => x.plan_id === plan);
  const anchor = addDays(today, 3);
  const [y, m, d] = anchor.split('-').map(Number);
  const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const dim = new Date(Date.UTC(Number(nm.slice(0, 4)), Number(nm.slice(5, 7)), 0)).getUTCDate();
  assert.equal(pl.next_due_date, `${nm}-${String(Math.min(d, dim)).padStart(2, '0')}`);
  assert.equal(row.next_due_date, pl.next_due_date);
  assert.equal(pl.last_work_order_id, w.work_order_id);
  // Người làm (C3 tự làm) không tự nghiệm thu
  const ctx2 = setup();
  const p2 = makePlan(ctx2, { assignee_user_id: ctx2.env.rows('Users').find((u) => u.employee_code === 'U-C3').user_id });
  const w3 = woOf(ctx2.env, p2.plan)[0];
  const [q1, q2] = resultsOf(ctx2.env, w3.work_order_id);
  assert.equal(ctx2.c3.write('maintenance.execute', { work_order_id: w3.work_order_id, start_at: nowIso(ctx2.env, -30), end_at: nowIso(ctx2.env, -1), overall_result: 'PASS', results: [{ result_id: q1.result_id, result_status: 'PASS' }, { result_id: q2.result_id, result_status: 'PASS', measured_value: 7 }] }, { expected_version: 1 }).ok, true);
  assert.equal(ctx2.c3.write('maintenance.submit', { work_order_id: w3.work_order_id }, { expected_version: 2 }).ok, true);
  assert.equal(ctx2.c3.write('maintenance.accept', { work_order_id: w3.work_order_id, decision: 'ACCEPT' }, { expected_version: 3, reauth_token: ctx2.c3.reauth() }).code, 'FORBIDDEN');
  assert.equal(ctx2.c.write('maintenance.accept', { work_order_id: w3.work_order_id, decision: 'ACCEPT' }, { expected_version: 3, reauth_token: ctx2.c.reauth() }).ok, true);
});

test('mục không đạt tạo đề nghị sửa chữa (bắt chọn mức độ); gửi lại không tạo trùng', () => {
  const ctx = setup();
  const { env, kt, c3 } = ctx;
  const { w } = doneWorkOrder(ctx, { fail: true });
  let s = kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 3 });
  assert.deepEqual(s.errors.map((e) => [e.field, e.code]), [['repair_severity', 'REQUIRED']]);
  s = kt.write('maintenance.submit', { work_order_id: w.work_order_id, repair_severity: 'MEDIUM' }, { expected_version: 3 });
  assert.equal(s.ok, true, JSON.stringify(s));
  const reps = env.rows('Repairs');
  assert.equal(reps.length, 1);
  assert.match(reps[0].repair_code, /^SC-\d{4}-001$/);
  assert.equal(reps[0].status, 'REPORTED');
  assert.equal(reps[0].severity, 'MEDIUM');
  assert.equal(reps[0].source_work_order_id, w.work_order_id);
  assert.match(reps[0].symptom_vi, /Kiểm tra dầu — Dầu đen, rò rỉ/);
  assert.equal(env.rows('WorkOrders')[0].repair_id, reps[0].repair_id);
  // Trả lại rồi gửi lại: không tạo thêm
  assert.equal(c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'RETURN', reason: 'Bổ sung' }, { expected_version: 4, reauth_token: c3.reauth() }).ok, true);
  assert.equal(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 5 }).ok, true);
  assert.equal(env.rows('Repairs').length, 1);
});

test('checklist phiên bản mới không đổi phiếu cũ (giữ revision); phiếu ngoài kế hoạch: KT tạo Nháp (offline qua sync.push), C3 giao, KT chỉ hủy Nháp của mình', () => {
  const ctx = setup();
  const { env, c, kt, c3, eq, tpl } = ctx;
  const { plan } = makePlan(ctx);
  const w = woOf(env, plan)[0];
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén', items: [{ label_vi: 'Kiểm tra dầu (mới)' }] }, { expected_version: 0 }).code, 'VERSION_CONFLICT');
  const r2 = c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén', items: [{ label_vi: 'Kiểm tra dầu (mới)' }] }, { expected_version: 1 });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(r2.data.revision, 2);
  assert.equal(resultsOf(env, w.work_order_id)[0].label_vi, 'Kiểm tra dầu', 'phiếu cũ giữ bản lúc tạo');
  assert.equal(env.rows('ChecklistTemplates').length, 4, 'bản cũ vẫn còn');
  // Ngừng mẫu đang dùng → IN_USE
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, active: false, reason: 'cũ' }, { expected_version: 2 }).errors[0].code, 'IN_USE');
  // KT tạo phiếu ngoài kế hoạch qua hàng chờ offline
  const woId = uuid();
  const op = uuid();
  const push = kt.call('sync.push', { op: { action: 'maintenance.wo.create', operation_id: op, expected_version: 0, payload: { work_order_id: woId, equipment_id: eq, title_vi: 'Thay dây curoa', checklist_template_id: tpl } } });
  assert.equal(push.ok, true, JSON.stringify(push));
  assert.equal(push.state, 'COMMITTED');
  const nw = env.rows('WorkOrders').find((x) => x.work_order_id === woId);
  assert.equal(nw.status, 'DRAFT');
  assert.equal(nw.source, 'MANUAL');
  assert.equal(nw.checklist_revision, 2);
  // Gửi lại cùng operation_id: không tạo trùng
  const again = kt.call('sync.push', { op: { action: 'maintenance.wo.create', operation_id: op, expected_version: 0, payload: { work_order_id: woId, equipment_id: eq, title_vi: 'Thay dây curoa', checklist_template_id: tpl } } });
  assert.equal(again.code, 'DUPLICATE_OPERATION');
  assert.equal(again.data.display_code, nw.work_order_code);
  // KT không đặt ưu tiên khác Thường, không giao việc
  assert.equal(kt.write('maintenance.wo.create', { work_order_id: uuid(), equipment_id: eq, title_vi: 'x', priority: 'URGENT' }).errors[0].field, 'priority');
  // Hủy: KT hủy được Nháp của mình; C3 giao rồi KT không hủy được nữa
  const own2 = uuid();
  assert.equal(kt.write('maintenance.wo.create', { work_order_id: own2, equipment_id: eq, title_vi: 'Lau bụi' }).ok, true);
  assert.equal(kt.write('maintenance.cancel', { work_order_id: own2 }, { expected_version: 1 }).errors[0].field, 'reason');
  assert.equal(kt.write('maintenance.cancel', { work_order_id: own2, reason: 'trùng' }, { expected_version: 1 }).ok, true);
  assert.equal(c3.write('maintenance.assign', { work_order_id: woId, assignee_user_id: ctx.ktId, priority: 'URGENT' }, { expected_version: 1 }).ok, true);
  const asg = env.rows('WorkOrders').find((x) => x.work_order_id === woId);
  assert.equal(asg.status, 'ASSIGNED');
  assert.equal(asg.priority, 'URGENT');
  assert.ok(asg.assigned_at);
  assert.equal(kt.write('maintenance.cancel', { work_order_id: woId, reason: 'x' }, { expected_version: 2 }).code, 'FORBIDDEN');
  // Phiếu do C3 tự lập: C3 không nghiệm thu
  const mine = uuid();
  assert.equal(c3.write('maintenance.wo.create', { work_order_id: mine, equipment_id: eq, title_vi: 'C3 tự lập', assignee_user_id: ctx.ktId }).ok, true);
  const rr = resultsOf(env, mine);
  assert.equal(rr.length, 0);
  assert.equal(kt.write('maintenance.execute', { work_order_id: mine, start_at: nowIso(env, -20), end_at: nowIso(env, -1), overall_result: 'PASS' }, { expected_version: 1 }).ok, true);
  assert.equal(kt.write('maintenance.submit', { work_order_id: mine }, { expected_version: 2 }).ok, true);
  assert.equal(c3.write('maintenance.accept', { work_order_id: mine, decision: 'ACCEPT' }, { expected_version: 3, reauth_token: c3.reauth() }).code, 'FORBIDDEN');
});

test('hủy phiếu của kế hoạch: bỏ lần đó, kế hoạch sang hạn kế tiếp; trigger sinh phiếu khi tới hạn', () => {
  const ctx = setup();
  const { env, c3, today } = ctx;
  const { plan } = makePlan(ctx, { interval_type: 'DAY', interval_value: 10, anchor_date: addDays(today, 2) });
  const w = woOf(env, plan)[0];
  assert.equal(c3.write('maintenance.cancel', { work_order_id: w.work_order_id, reason: 'Máy dừng sản xuất' }, { expected_version: 1 }).ok, true);
  let pl = env.rows('MaintenancePlans').find((x) => x.plan_id === plan);
  assert.equal(pl.next_due_date, addDays(today, 12));
  assert.equal(woOf(env, plan).filter((x) => x.status !== 'CANCELLED').length, 0, '12 ngày > 7: chưa sinh');
  // Giả hôm nay là ngày + 6 → trigger sinh
  env.props.setProperty('TEST_TODAY', addDays(today, 6));
  env.g.dbReset_();
  assert.equal(env.g.generateDueWorkOrders_(), 1);
  env.g.dbReset_();
  assert.equal(env.g.generateDueWorkOrders_(), 0, 'đã có phiếu mở thì không sinh thêm');
  const open = woOf(env, plan).filter((x) => x.status !== 'CANCELLED');
  assert.equal(open.length, 1);
  assert.equal(open[0].due_date, addDays(today, 12));
  assert.ok(env.rows('AuditLogs').some((a) => a.action === 'maintenance.wo.create' && a.user_id === 'SYSTEM'));
  pl = env.rows('MaintenancePlans').find((x) => x.plan_id === plan);
  assert.equal(pl.next_due_date, addDays(today, 12));
});

test('theo giờ chạy: chưa tới mốc không sinh; đạt mốc sinh phiếu; giờ không giảm; nghiệm thu → mốc = giờ lúc làm + chu kỳ', () => {
  const ctx = setup();
  const { env, c, kt, eq, tpl, ktId } = ctx;
  const read = (cl, hrs, extra = {}) => cl.write('maintenance.hours.record', { operating_reading_id: uuid(), equipment_id: eq, cumulative_hours: hrs, ...extra });
  assert.equal(read(kt, 1000).ok, true);
  const plan = uuid();
  const r = c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eq, title_vi: 'Thay dầu 500 giờ', interval_type: 'OPERATING_HOURS', interval_value: 500, checklist_template_id: tpl, assignee_user_id: ktId });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.rows('MaintenancePlans')[0].operating_hours_target, 1500, 'mặc định: giờ mới nhất + chu kỳ');
  assert.equal(woOf(env, plan).length, 0);
  assert.equal(read(kt, 1200).ok, true);
  assert.equal(read(kt, 1100).errors[0].code, 'HOURS_DECREASED');
  assert.equal(read(kt, 50, { is_reset: true }).errors[0].field, 'note');
  assert.equal(woOf(env, plan).length, 0);
  const g = read(kt, 1510);
  assert.equal(g.ok, true);
  assert.equal(g.data.generated_work_orders.length, 1);
  const w = woOf(env, plan)[0];
  assert.equal(w.status, 'ASSIGNED');
  assert.equal(w.due_date, env.g.todayVN_());
  const [r1, r2] = resultsOf(env, w.work_order_id);
  env.clock.advance(60000);
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -30), end_at: nowIso(env), operating_hours: 1505, overall_result: 'PASS', results: [{ result_id: r1.result_id, result_status: 'PASS' }, { result_id: r2.result_id, result_status: 'PASS', measured_value: 7 }] }, { expected_version: 1 }).errors[0].code, 'HOURS_DECREASED', 'nhỏ hơn 1510 đã đọc trước');
  // Làm xong trước lượt đọc 1510 thì giờ lúc làm không được lớn hơn 1510
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -30), end_at: nowIso(env, -5), operating_hours: 1520 }, { expected_version: 1 }).errors[0].code, 'HOURS_DECREASED');
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -30), end_at: nowIso(env), operating_hours: 1512, overall_result: 'PASS', results: [{ result_id: r1.result_id, result_status: 'PASS' }, { result_id: r2.result_id, result_status: 'PASS', measured_value: 7 }] }, { expected_version: 1 }).ok, true);
  // Sửa lại giờ lúc làm: sửa đúng lượt đọc của phiếu, không thêm lượt mới
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, operating_hours: 1513 }, { expected_version: 2 }).ok, true);
  assert.equal(env.rows('OperatingReadings').filter((x) => x.work_order_id === w.work_order_id).length, 1);
  assert.equal(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: 3 }).ok, true);
  assert.equal(c.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: 4, reauth_token: c.reauth() }).ok, true);
  const pl = env.rows('MaintenancePlans')[0];
  assert.equal(pl.operating_hours_target, 2013);
  assert.equal(pl.last_done_hours, 1513);
  assert.equal(pl.next_due_date, '');
});

test('giao việc chỉ cho người làm được (KT/C3/C4 đang hoạt động); đổi hạn phiếu kế hoạch cập nhật hạn kế hoạch; xung đột phiên bản', () => {
  const ctx = setup();
  const { env, c3, eq, today } = ctx;
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const hdId = env.rows('Users').find((u) => u.employee_code === 'U-HD').user_id;
  void hd;
  const { plan } = makePlan(ctx, { assignee_user_id: '' });
  const w = woOf(env, plan)[0];
  assert.equal(c3.write('maintenance.assign', { work_order_id: w.work_order_id, assignee_user_id: hdId }, { expected_version: 1 }).errors[0].code, 'NOT_FOUND');
  assert.equal(ctx.c.write('maintenance.plan.edit', { plan_id: uuid(), equipment_id: eq, title_vi: 'x', interval_type: 'DAY', interval_value: 7, anchor_date: today, assignee_user_id: hdId }).errors[0].field, 'assignee_user_id');
  const a = c3.write('maintenance.assign', { work_order_id: w.work_order_id, assignee_user_id: ctx.ktId, due_date: addDays(today, 5) }, { expected_version: 1 });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(env.rows('MaintenancePlans').find((x) => x.plan_id === plan).next_due_date, addDays(today, 5));
  const stale = c3.write('maintenance.assign', { work_order_id: w.work_order_id, assignee_user_id: ctx.ktId }, { expected_version: 1 });
  assert.equal(stale.code, 'VERSION_CONFLICT');
  assert.equal(stale.data.server.work_order_id, w.work_order_id);
});
