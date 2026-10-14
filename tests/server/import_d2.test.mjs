// Mẫu Excel Đợt 2 (phụ lục 6.9.1): kế hoạch bảo trì + checklist (một mẫu nhiều dòng → một phiên bản), sự cố lịch sử (lô nhạy cảm, đủ/thiếu mốc)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function preview(cl, template, rows, { batch = uuid(), source = sha(JSON.stringify(rows) + Math.random()) } = {}) {
  const r = cl.write('import.preview', { import_batch_id: batch, template_key: template, chunk_index: 0, chunk_count: 1, total_rows: rows.length, source_sha256: source, rows });
  r.batch = batch;
  return r;
}
const row = (sheet, n, values) => ({ sheet, row_number: n, values });
const errsAt = (r, sheet, n) => r.data.errors.filter((e) => e.row === n && e.sheet === sheet).map((e) => `${e.field}:${e.code}`);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Tệp xuất → dòng nhập (bỏ cột trường dịch máy) */
const exportRows = (ex) => ex.data.sheets.flatMap((s) => s.rows.map((r, i) => row(s.name, i + 3, Object.fromEntries(s.keys.map((k, j) => [k, r[j]]).filter(([k]) => k !== 'i18n_machine_fields')))));

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  const e = c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' });
  userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  return { env, c, eq, eqCode: e.data.display_code, today: env.g.todayVN_() };
}

const CL_A = [
  { template_key: 'CL-A', template_name_vi: 'Bảo dưỡng máy nén', step_no: 1, label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL' },
  { template_key: 'CL-A', step_no: 2, label_vi: 'Áp suất xả', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8 },
  { template_key: 'CL-A', step_no: 3, label_vi: 'Ghi chú tiếng ồn', result_type: 'TEXT', required: false, safety_note_vi: 'Ngắt điện trước khi mở nắp' }
];

test('mẫu kế hoạch + checklist: lỗi theo dòng (thiếu đơn vị số đo làm hỏng cả mẫu, thiếu ngày mốc, checklist không có) → NEEDS_FIX', () => {
  const { c, eqCode } = setup();
  const r = preview(c, 'maintenance_plans', [
    row('checklists', 3, { template_key: 'CL-B', template_name_vi: 'Mẫu lỗi', step_no: 1, label_vi: 'Đo dòng', result_type: 'NUMBER' }),
    row('checklists', 4, { template_key: 'CL-B', step_no: 2, label_vi: 'Vệ sinh' }),
    row('checklists', 5, { template_key: 'CL-C', template_name_vi: 'Mẫu trùng bước', step_no: 1, label_vi: 'A' }),
    row('checklists', 6, { template_key: 'CL-C', step_no: 1, label_vi: 'B' }),
    row('maintenance_plans', 3, { equipment_code: eqCode, title_vi: 'Vệ sinh lọc', interval_type: 'DAY', interval_value: 30 }),
    row('maintenance_plans', 4, { equipment_code: eqCode, title_vi: 'Kiểm tra', interval_type: 'MONTH', interval_value: 1, anchor_date: '01/11/2026', checklist_key: 'KHÔNG CÓ' })
  ]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'NEEDS_FIX');
  assert.deepEqual(errsAt(r, 'checklists', 3), ['unit:REQUIRED']);
  assert.deepEqual(errsAt(r, 'checklists', 4), ['template_key:GROUP_INVALID']);
  assert.deepEqual(errsAt(r, 'checklists', 6), ['step_no:CODE_DUPLICATE']);
  assert.deepEqual(errsAt(r, 'maintenance_plans', 3), ['anchor_date:REQUIRED']);
  assert.deepEqual(errsAt(r, 'maintenance_plans', 4), ['checklist_key:NOT_FOUND']);
  const g = r.data.errors.find((e) => e.field === 'template_key');
  assert.ok(g.message_vi && g.message_zh, 'lỗi song ngữ');
});

test('mẫu kế hoạch + checklist: mẫu mới (3 dòng = 1 mẫu) + 2 kế hoạch tham chiếu bằng khóa và tên trong file → commit; xuất rồi nhập lại nguyên trạng bỏ qua; sửa một bước → phiên bản 2', () => {
  const { env, c, eqCode, today } = setup();
  const r = preview(c, 'maintenance_plans', [
    ...CL_A.map((v, i) => row('checklists', 3 + i, v)),
    row('maintenance_plans', 3, { equipment_code: eqCode, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: addDays(today, 20), checklist_key: 'CL-A', assignee_code: 'U-KT', priority: 'HIGH' }),
    row('maintenance_plans', 4, { equipment_code: eqCode, title_vi: 'Bảo dưỡng quý', interval_type: 'MONTH', interval_value: 3, anchor_date: addDays(today, 40), checklist_key: 'Bảo dưỡng máy nén' })
  ]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(r.data.add_count, 5);
  const cm = c.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const items = env.rows('ChecklistTemplates');
  assert.equal(items.length, 3);
  assert.ok(items.every((x) => x.revision === 1 && x.template_id === items[0].template_id));
  assert.deepEqual(items.map((x) => x.step_no).sort(), [1, 2, 3]);
  assert.equal(items.find((x) => x.step_no === 2).unit, 'bar');
  assert.equal(items.find((x) => x.step_no === 3).required, false);
  const plans = env.rows('MaintenancePlans');
  assert.equal(plans.length, 2);
  assert.ok(plans.every((p) => p.checklist_template_id === items[0].template_id), 'tham chiếu bằng khóa và tên trong file');
  assert.deepEqual(plans.map((p) => p.plan_code).sort(), ['KH-0001', 'KH-0002']);
  assert.equal(plans.find((p) => p.title_vi === 'Bảo dưỡng tháng').assignee_user_id, env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id);
  assert.equal(plans.find((p) => p.title_vi === 'Bảo dưỡng tháng').priority, 'HIGH');
  // Xuất → nhập lại nguyên trạng: không tạo phiên bản, không sửa kế hoạch
  const ex = c.call('export.xlsx', { template_key: 'maintenance_plans' });
  assert.equal(ex.ok, true, JSON.stringify(ex));
  assert.deepEqual(ex.data.sheets.map((s) => s.name), ['checklists', 'maintenance_plans']);
  const rows = exportRows(ex);
  assert.equal(rows.filter((x) => x.sheet === 'checklists').length, 3);
  assert.equal(rows.find((x) => x.sheet === 'checklists').values.template_key, items[0].template_id);
  const same = preview(c, 'maintenance_plans', rows);
  assert.equal(same.data.status, 'READY', JSON.stringify(same.data.errors));
  assert.equal(same.data.add_count + same.data.update_count, 0, 'không đổi → bỏ qua');
  // Sửa nội dung bước 1 → một phiên bản mới cho cả mẫu
  const edited = rows.map((x) => (x.sheet === 'checklists' && x.values.step_no === 1 ? { ...x, values: { ...x.values, label_vi: 'Kiểm tra mức dầu', label_zh: '' } } : x));
  const r2 = preview(c, 'maintenance_plans', edited);
  assert.equal(r2.data.status, 'READY', JSON.stringify(r2.data.errors));
  assert.equal(r2.data.update_count, 3);
  assert.equal(c.call('import.commit', { import_batch_id: r2.batch }, { operation_id: uuid(), reauth_token: c.reauth() }).data.status, 'COMMITTED');
  const v2 = env.rows('ChecklistTemplates').filter((x) => x.revision === 2);
  assert.equal(v2.length, 3);
  assert.equal(v2.find((x) => x.step_no === 1).label_vi, 'Kiểm tra mức dầu');
  assert.equal(env.rows('MaintenancePlans').every((p) => p.record_version === 1), true, 'kế hoạch không đổi');
  // File cũ (phiên bản 1) → xung đột
  const stale = preview(c, 'maintenance_plans', edited.filter((x) => x.sheet === 'checklists'));
  assert.deepEqual(errsAt(stale, 'checklists', 3), ['revision:VERSION_CONFLICT']);
});

test('sự cố lịch sử: KT nhập (mốc đủ và thiếu, nguyên nhân theo danh mục), lỗi thứ tự mốc; lô nhạy cảm → C3 commit = duyệt; mã SC theo ngày báo; mốc thiếu để trống (C9)', () => {
  const { env, c, eqCode } = setup();
  assert.equal(c.write('lookup.edit', { value_id: uuid(), group_key: 'CAUSE', code: 'MON', name_vi: 'Mòn hỏng' }).ok, true);
  const kt = userClient(env, 'U-KT2', 2, '583017', 'KY_THUAT');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const bad = preview(kt, 'repairs_history', [
    row('repairs_history', 3, { equipment_code: eqCode, reported_at: '12/05/2025 08:30', symptom_vi: 'Rò dầu', severity: 'HIGH', repair_start_at: '12/05/2025 10:00', repair_end_at: '12/05/2025 09:00' }),
    row('repairs_history', 4, { equipment_code: eqCode, reported_at: '13/05/2025', symptom_vi: 'Kêu to', severity: 'LOW', root_cause_code: 'KHONG-CO' }),
    row('repairs_history', 5, { equipment_code: eqCode, reported_at: '31/02/2025 08:00', symptom_vi: 'X', severity: 'LOW' })
  ]);
  assert.equal(bad.data.status, 'NEEDS_FIX');
  assert.deepEqual(errsAt(bad, 'repairs_history', 3), ['repair_end_at:TIME_ORDER_INVALID']);
  assert.deepEqual(errsAt(bad, 'repairs_history', 4), ['root_cause_code:NOT_FOUND']);
  assert.deepEqual(errsAt(bad, 'repairs_history', 5), ['reported_at:INVALID_DATE']);
  const r = preview(kt, 'repairs_history', [
    row('repairs_history', 3, {
      equipment_code: eqCode, reported_at: '12/05/2025 08:30', reporter_code: 'NV-001', symptom_vi: 'Rò dầu ở phớt', severity: 'HIGH', assignee_code: 'U-KT',
      assigned_at: '12/05/2025 09:00', repair_start_at: '12/05/2025 09:30', repair_end_at: '12/05/2025 11:00', stopped_at: '12/05/2025 08:30', restored_at: '12/05/2025 11:15',
      root_cause_code: 'mon', action_vi: 'Thay phớt', test_run_result: 'PASS', approved_at: '12/05/2025 14:00'
    }),
    row('repairs_history', 4, { equipment_code: eqCode, reported_at: '2025-06-02', symptom_vi: 'Kêu to bất thường', severity: 'LOW' })
  ]);
  assert.equal(r.data.status, 'READY', JSON.stringify(r.data.errors));
  assert.equal(r.data.sensitive, true);
  assert.equal(kt.write('import.submit', { import_batch_id: r.batch }).data.status, 'PENDING_APPROVAL');
  const cm = c3.call('import.commit', { import_batch_id: r.batch }, { operation_id: uuid(), reauth_token: c3.reauth() });
  assert.equal(cm.data.status, 'COMMITTED', JSON.stringify(cm.data.errors));
  const reps = env.rows('Repairs').sort((a, b) => String(a.reported_at).localeCompare(String(b.reported_at)));
  assert.equal(reps.length, 2);
  const [a, b] = reps;
  const uid = (code) => env.rows('Users').find((u) => u.employee_code === code).user_id;
  assert.equal(a.repair_code, 'SC-2505-001');
  assert.equal(b.repair_code, 'SC-2506-001');
  assert.ok(a.status === 'COMPLETED' && b.status === 'COMPLETED');
  assert.equal(a.reported_at, '2025-05-12T08:30:00+07:00');
  assert.equal(a.reported_by, uid('NV-001'));
  assert.equal(b.reported_by, uid('U-KT2'), 'không ghi người báo → người nhập');
  assert.equal(a.approved_by, uid('U-C3'));
  assert.equal(a.approved_at, '2025-05-12T14:00:00+07:00');
  assert.equal(a.root_cause_code, 'MON');
  assert.equal(a.assignee_user_id, uid('U-KT'));
  assert.equal(b.reported_at, '2025-06-02T00:00:00+07:00');
  for (const f of ['assigned_at', 'repair_start_at', 'repair_end_at', 'restored_at', 'approved_at']) assert.equal(b[f], '', `mốc thiếu ${f} để trống`);
  assert.equal(env.rows('QrRegistry').filter((q) => q.entity_type === 'REPAIR').length, 2);
  // Ngoài lô Excel không gọi được action nhập lịch sử
  assert.equal(c.write('repair.history.import', { repair_id: uuid(), equipment_id: uuid(), symptom_vi: 'x', severity: 'LOW', reported_at: '2025-01-01T00:00:00+07:00' }).code, 'FORBIDDEN');
  // Xuất danh sách phiếu: thời điểm dạng dd/mm/yyyy hh:mm
  const ex = c.call('export.xlsx', { template_key: 'repairs_history' });
  assert.equal(ex.ok, true, JSON.stringify(ex));
  const sh = ex.data.sheets[0];
  const first = Object.fromEntries(sh.keys.map((k, i) => [k, sh.rows.find((x) => x[1] === 'SC-2505-001')[i]]));
  assert.equal(first.reported_at, '12/05/2025 08:30');
  assert.equal(first.reporter_code, 'NV-001');
});
