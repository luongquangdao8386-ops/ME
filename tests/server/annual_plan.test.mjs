// d4.18 ("đợt" 5): kế hoạch cho cả nhóm máy cùng loại (maintenance.plan.group / group_edit) và kế hoạch năm lập – gửi – duyệt
// (annual_plan.*): quyền, không tự duyệt, PIN, lần ban hành, bản chụp riêng tư, PDF có khối ký; schema cũ → FEATURE_NOT_ENABLED
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const cat = uuid();
  ok(c.write('lookup.edit', { value_id: cat, group_key: 'EQUIPMENT_CATEGORY', code: 'AIR_COMP', name_vi: 'Máy nén khí', name_zh: '空压机' }));
  const eqs = [uuid(), uuid(), uuid(), uuid()];
  eqs.forEach((e, i) => ok(c.write('equipment.create', { equipment_id: e, name_vi: `Máy nén khí 0${i + 1}`, category_id: cat })));
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const tpl = uuid();
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén', items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL', required: true }] }));
  return { env, c, c3, kt, ktId, cat, eqs, tpl, today: env.g.todayVN_() };
}

/** Nhóm 3 máy, rải lịch cách 2 ngày từ hôm nay + 20 (chưa tới hạn sinh phiếu) */
function makeGroup(ctx, n = 3, start = 20, extra = {}) {
  const { c, eqs, tpl, ktId, today } = ctx;
  const gid = uuid();
  const plans = eqs.slice(0, n).map((e, i) => ({ plan_id: uuid(), equipment_id: e, anchor_date: addDays(today, start + 2 * i) }));
  const r = c.write('maintenance.plan.group', { plan_group_id: gid, plans, title_vi: 'Bảo dưỡng 3 tháng', interval_type: 'MONTH', interval_value: 3,
    checklist_template_id: tpl, assignee_user_id: ktId, priority: 'HIGH', estimated_minutes: 60, ...extra });
  return { gid, plans, r };
}

test('tạo kế hoạch cho cả nhóm: mỗi máy một kế hoạch (mã, QR, ngày mốc rải lịch), chung plan_group_id; kế hoạch tới hạn sinh phiếu ngay; KT không được', () => {
  const ctx = setup();
  const { env, kt, eqs, today } = ctx;
  const { gid, plans, r } = makeGroup(ctx);
  ok(r);
  assert.deepEqual(Array.from(r.data.plans, (x) => x.plan_code), ['KH-0001', 'KH-0002', 'KH-0003']);
  assert.equal(r.data.generated_work_orders.length, 0, 'mốc sau 20 ngày: chưa sinh phiếu');
  const rows = env.rows('MaintenancePlans');
  assert.equal(rows.length, 3);
  assert.ok(rows.every((p) => p.plan_group_id === gid && p.interval_value === 3 && p.priority === 'HIGH' && p.estimated_minutes === 60 && p.active === true));
  assert.deepEqual(rows.map((p) => p.anchor_date), plans.map((p) => p.anchor_date));
  assert.deepEqual(rows.map((p) => p.next_due_date), plans.map((p) => p.anchor_date));
  assert.ok(rows.every((p) => p.title_zh), 'tên việc dịch máy một lần cho cả nhóm');
  assert.equal(env.rows('QrRegistry').filter((q) => q.entity_type === 'MAINTENANCE_PLAN').length, 3);
  const audit = env.rows('AuditLogs').filter((a) => a.action === 'maintenance.plan.group');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].after_json.count, 3);
  // Máy thứ tư thêm vào nhóm, mốc hôm nay + 2 → tới hạn trong 7 ngày → sinh phiếu luôn
  const add = ok(ctx.c.write('maintenance.plan.group', { plan_group_id: gid, plans: [{ plan_id: uuid(), equipment_id: eqs[3], anchor_date: addDays(today, 2) }],
    title_vi: 'Bảo dưỡng 3 tháng', interval_type: 'MONTH', interval_value: 3 }));
  assert.equal(add.data.generated_work_orders.length, 1);
  assert.equal(env.rows('WorkOrders').length, 1);
  // Máy đã có trong nhóm; máy trùng trong một lượt; thiếu ngày mốc; KT không có quyền
  const again = ctx.c.write('maintenance.plan.group', { plan_group_id: gid, plans: [{ plan_id: uuid(), equipment_id: eqs[0], anchor_date: today }], title_vi: 'X', interval_type: 'MONTH', interval_value: 1 });
  assert.equal(again.errors[0].code, 'ALREADY_IN_GROUP');
  assert.equal(again.errors[0].row, 0);
  const dup = ctx.c.write('maintenance.plan.group', { plan_group_id: uuid(), plans: [{ plan_id: uuid(), equipment_id: eqs[0], anchor_date: today }, { plan_id: uuid(), equipment_id: eqs[0], anchor_date: today }], title_vi: 'X', interval_type: 'MONTH', interval_value: 1 });
  assert.equal(dup.errors[0].code, 'EQUIPMENT_DUPLICATE');
  assert.equal(dup.errors[0].row, 1);
  const noAnchor = ctx.c.write('maintenance.plan.group', { plan_group_id: uuid(), plans: [{ plan_id: uuid(), equipment_id: eqs[1] }], title_vi: 'X', interval_type: 'DAY', interval_value: 7 });
  assert.equal(noAnchor.errors[0].field, 'anchor_date');
  const tooMany = ctx.c.write('maintenance.plan.group', { plan_group_id: uuid(), plans: Array.from({ length: 101 }, () => ({ plan_id: uuid(), equipment_id: eqs[1], anchor_date: today })), title_vi: 'X', interval_type: 'DAY', interval_value: 7 });
  assert.equal(tooMany.errors[0].code, 'GROUP_TOO_LARGE');
  assert.equal(kt.write('maintenance.plan.group', { plan_group_id: uuid(), plans: [{ plan_id: uuid(), equipment_id: eqs[1], anchor_date: today }], title_vi: 'X', interval_type: 'DAY', interval_value: 7 }).code, 'FORBIDDEN');
});

test('kế hoạch nhóm theo giờ chạy: mốc mặc định = giờ mới nhất + chu kỳ; máy chưa có số đọc phải nhập mốc', () => {
  const ctx = setup();
  const { env, c, eqs } = ctx;
  ok(c.write('maintenance.hours.record', { operating_reading_id: uuid(), equipment_id: eqs[0], cumulative_hours: 1200 }));
  const miss = c.write('maintenance.plan.group', { plan_group_id: uuid(), plans: [{ plan_id: uuid(), equipment_id: eqs[0] }, { plan_id: uuid(), equipment_id: eqs[1] }], title_vi: 'Thay dầu', interval_type: 'OPERATING_HOURS', interval_value: 500 });
  assert.equal(miss.errors[0].field, 'operating_hours_target');
  assert.equal(miss.errors[0].row, 1);
  ok(c.write('maintenance.plan.group', { plan_group_id: uuid(), plans: [{ plan_id: uuid(), equipment_id: eqs[0] }, { plan_id: uuid(), equipment_id: eqs[1], operating_hours_target: 800 }], title_vi: 'Thay dầu', interval_type: 'OPERATING_HOURS', interval_value: 500 }));
  assert.deepEqual(env.rows('MaintenancePlans').map((p) => p.operating_hours_target), [1700, 800]);
});

test('sửa cả nhóm: đổi chu kỳ, người làm, tên việc cho các máy được chọn; sai phiên bản → VERSION_CONFLICT; ngừng cả nhóm cần lý do, QR tắt; chạy lại', () => {
  const ctx = setup();
  const { env, c, c3, kt, today } = ctx;
  const { gid, plans } = makeGroup(ctx);
  const ids = plans.map((p) => p.plan_id);
  const ver = () => Object.fromEntries(env.rows('MaintenancePlans').map((p) => [p.plan_id, p.record_version]));
  // Chỉ 2 máy đầu
  const r = ok(c3.write('maintenance.plan.group_edit', { plan_group_id: gid, plan_ids: ids.slice(0, 2), versions: ver(), changes: { interval_value: 6, assignee_user_id: '', title_vi: 'Bảo dưỡng 6 tháng' } }));
  assert.equal(r.data.plans.length, 2);
  const rows = env.rows('MaintenancePlans');
  assert.deepEqual(rows.map((p) => p.interval_value), [6, 6, 3]);
  assert.deepEqual(rows.map((p) => p.assignee_user_id === ''), [true, true, false]);
  assert.equal(rows[0].title_vi, 'Bảo dưỡng 6 tháng');
  assert.equal(rows[2].title_vi, 'Bảo dưỡng 3 tháng', 'máy không chọn giữ nguyên');
  assert.equal(rows[0].anchor_date, plans[0].anchor_date, 'giữ ngày mốc của từng máy');
  assert.equal(env.rows('QrRegistry').find((q) => q.entity_id === ids[0]).label_vi, 'Bảo dưỡng 6 tháng');
  // Phiên bản cũ
  const stale = c3.write('maintenance.plan.group_edit', { plan_group_id: gid, plan_ids: ids, versions: Object.fromEntries(ids.map((id) => [id, 1])), changes: { priority: 'LOW' } });
  assert.equal(stale.code, 'VERSION_CONFLICT');
  // Kế hoạch không thuộc nhóm; trường lạ; KT
  assert.equal(c3.write('maintenance.plan.group_edit', { plan_group_id: uuid(), plan_ids: ids, versions: ver(), changes: { priority: 'LOW' } }).errors[0].field, 'plan_ids');
  assert.equal(c3.write('maintenance.plan.group_edit', { plan_group_id: gid, plan_ids: ids, versions: ver(), changes: { anchor_date: today } }).errors[0].field, 'anchor_date');
  assert.equal(kt.write('maintenance.plan.group_edit', { plan_group_id: gid, plan_ids: ids, versions: ver(), changes: { priority: 'LOW' } }).code, 'FORBIDDEN');
  // Ngừng cả nhóm
  assert.equal(c3.write('maintenance.plan.group_edit', { plan_group_id: gid, plan_ids: ids, versions: ver(), changes: { active: false } }).errors[0].field, 'reason');
  ok(c3.write('maintenance.plan.group_edit', { plan_group_id: gid, plan_ids: ids, versions: ver(), changes: { active: false }, reason: 'Thay nhà thầu' }));
  assert.ok(env.rows('MaintenancePlans').every((p) => p.active === false));
  assert.ok(env.rows('QrRegistry').filter((q) => ids.includes(q.entity_id)).every((q) => q.active === false));
  ok(c3.write('maintenance.plan.group_edit', { plan_group_id: gid, plan_ids: ids, versions: ver(), changes: { active: true } }));
  assert.ok(env.rows('MaintenancePlans').every((p) => p.active === true && p.next_due_date >= today));
  const audit = env.rows('AuditLogs').filter((a) => a.action === 'maintenance.plan.group_edit');
  assert.equal(audit.length, 3);
  assert.equal(audit[1].reason, 'Thay nhà thầu');
});

/** Bản chụp gọn: 1 loại, 2 dòng (kế hoạch tháng + kiểm định) */
function snapshot(ctx, year, extra = {}) {
  const { eqs, cat } = ctx;
  return {
    year,
    groups: [{ key: cat, name_vi: 'Máy nén khí', name_zh: '空压机', rows: [
      { kind: 'PLAN', ref_id: uuid(), equipment_id: eqs[0], equipment_code: 'TB-0001', equipment_vi: 'Máy nén khí 01', title_vi: 'Bảo dưỡng 3 tháng', code: 'KH-0001', cycle: 'Mỗi 3 tháng · 每3月',
        dates: [`${year}-01-05`, `${year}-04-05`, `${year}-07-05`, `${year}-10-05`, `${year - 1}-12-31`, 'x'], est: [] },
      { kind: 'HOURS', ref_id: uuid(), equipment_id: eqs[1], equipment_code: 'TB-0002', equipment_vi: 'Máy nén khí 02', title_vi: 'Thay dầu', code: 'KH-0002', cycle: '500 giờ chạy',
        dates: [], est: [`${year}-03-02`, `${year}-06-10`] },
      { kind: 'INSPECTION', ref_id: uuid(), equipment_id: eqs[1], equipment_code: 'TB-0002', equipment_vi: 'Máy nén khí 02', title_vi: 'Kiểm định bình', code: 'KD-0001', cycle: '',
        dates: [`${year}-05-20`, `${year}-05-20`] }
    ] }],
    ...extra
  };
}

test('kế hoạch năm: lưu nháp (bản chụp riêng tư, làm sạch ngày), mỗi năm một bản đang mở, gửi duyệt, không tự duyệt, PIN, duyệt → KHN-2027-01', () => {
  const ctx = setup();
  const { env, c, c3, kt } = ctx;
  const id = uuid();
  const s1 = ok(c3.write('annual_plan.save', { annual_plan_id: id, year: 2027, snapshot: snapshot(ctx, 2027) }));
  let rec = env.rows('AnnualPlans')[0];
  assert.equal(rec.status, 'DRAFT');
  assert.equal(rec.revision, 1);
  assert.equal(rec.annual_plan_code, '', 'mã cấp khi duyệt');
  assert.equal(rec.planned_count, 5, 'bỏ ngày ngoài năm, ngày sai, ngày trùng; ước tính không tính');
  assert.equal(rec.row_count, 3);
  assert.equal(rec.summary_json[0].machines, 2);
  assert.deepEqual(Array.from(rec.summary_json[0].months), [1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0]);
  const doc = env.rows('Documents').find((d) => d.document_id === rec.file_document_id);
  assert.equal(doc.kind, 'REPORT_FILE');
  assert.equal(doc.entity_type, 'ANNUAL_PLAN');
  // Không đồng bộ tệp bản chụp như tài liệu; hồ sơ kế hoạch năm thì có
  const ch = kt.call('sync.changes', { cursor: 0 }).data.changes;
  assert.ok(ch.some((x) => x.entity_type === 'ANNUAL_PLAN' && x.entity_id === id));
  assert.ok(!ch.some((x) => x.entity_type === 'DOCUMENT' && x.entity_id === doc.document_id && x.op === 'UPSERT'), 'tệp bản chụp không về máy như tài liệu');
  // Xem bản chụp
  const v = ok(kt.call('annual_plan.view', { annual_plan_id: id })).data;
  assert.equal(v.snapshot.groups[0].rows[0].dates.length, 4);
  assert.deepEqual(Array.from(v.snapshot.groups[0].rows[2].dates), ['2027-05-20']);
  // Lưu lại (thay bản chụp), tệp cũ vào thùng rác
  const oldFile = doc.drive_file_id;
  ok(c3.write('annual_plan.save', { annual_plan_id: id, year: 2027, snapshot: snapshot(ctx, 2027) }, { expected_version: s1.data.record_version }));
  assert.equal(env.drive._files.get(oldFile).trashed, true);
  // Năm đã có bản đang mở; sai khuôn; rỗng; KT không lập được
  assert.equal(c3.write('annual_plan.save', { annual_plan_id: uuid(), year: 2027, snapshot: snapshot(ctx, 2027) }).errors[0].code, 'ANNUAL_PLAN_OPEN');
  assert.equal(c3.write('annual_plan.save', { annual_plan_id: uuid(), year: 2028, snapshot: snapshot(ctx, 2027) }).errors[0].code, 'SNAPSHOT_INVALID');
  assert.equal(c3.write('annual_plan.save', { annual_plan_id: uuid(), year: 2028, snapshot: { year: 2028, groups: [] } }).errors[0].code, 'SNAPSHOT_EMPTY');
  assert.equal(kt.write('annual_plan.save', { annual_plan_id: uuid(), year: 2029, snapshot: snapshot(ctx, 2029) }).code, 'FORBIDDEN');
  // Gửi duyệt
  rec = env.rows('AnnualPlans')[0];
  ok(c3.write('annual_plan.submit', { annual_plan_id: id }, { expected_version: rec.record_version }));
  rec = env.rows('AnnualPlans')[0];
  assert.equal(rec.status, 'SUBMITTED');
  // Người lập/gửi không tự duyệt; thiếu PIN; trả lại phải có lý do
  assert.equal(c3.write('annual_plan.approve', { annual_plan_id: id, decision: 'APPROVE' }, { expected_version: rec.record_version, reauth_token: c3.reauth() }).code, 'FORBIDDEN');
  assert.equal(c.write('annual_plan.approve', { annual_plan_id: id, decision: 'APPROVE' }, { expected_version: rec.record_version }).code, 'REAUTH_REQUIRED');
  assert.equal(c.write('annual_plan.approve', { annual_plan_id: id, decision: 'RETURN' }, { expected_version: rec.record_version, reauth_token: c.reauth() }).errors[0].field, 'reason');
  // Trả lại → sửa → gửi lại → duyệt
  ok(c.write('annual_plan.approve', { annual_plan_id: id, decision: 'RETURN', reason: 'Thiếu máy nén 04' }, { expected_version: rec.record_version, reauth_token: c.reauth() }));
  rec = env.rows('AnnualPlans')[0];
  assert.equal(rec.status, 'RETURNED');
  assert.equal(rec.return_reason, 'Thiếu máy nén 04');
  ok(c3.write('annual_plan.save', { annual_plan_id: id, year: 2027, snapshot: snapshot(ctx, 2027) }, { expected_version: rec.record_version }));
  rec = env.rows('AnnualPlans')[0];
  assert.equal(rec.status, 'DRAFT');
  ok(c3.write('annual_plan.submit', { annual_plan_id: id }, { expected_version: rec.record_version }));
  rec = env.rows('AnnualPlans')[0];
  const ap = ok(c.write('annual_plan.approve', { annual_plan_id: id, decision: 'APPROVE' }, { expected_version: rec.record_version, reauth_token: c.reauth() }));
  assert.equal(ap.data.display_code, 'KHN-2027-01');
  rec = env.rows('AnnualPlans')[0];
  assert.equal(rec.status, 'APPROVED');
  assert.equal(rec.approved_by, env.rows('Users').find((u) => u.is_system_owner).user_id);
  // Bản đã duyệt không lưu đè, không hủy
  assert.equal(c3.write('annual_plan.save', { annual_plan_id: id, year: 2027, snapshot: snapshot(ctx, 2027) }, { expected_version: rec.record_version }).errors[0].code, 'STATUS_INVALID');
  assert.equal(c3.write('annual_plan.cancel', { annual_plan_id: id, reason: 'x' }, { expected_version: rec.record_version }).errors[0].code, 'STATUS_INVALID');
});

test('lần ban hành 02: phải có lý do điều chỉnh; duyệt xong lần 01 thành "đã được thay"; hủy bản nháp', () => {
  const ctx = setup();
  const { env, c, c3 } = ctx;
  const approveNew = (year) => {
    const id = uuid();
    const s = ok(c3.write('annual_plan.save', { annual_plan_id: id, year, snapshot: snapshot(ctx, year) }));
    return { id, ver: s.data.record_version };
  };
  const a = approveNew(2027);
  ok(c3.write('annual_plan.submit', { annual_plan_id: a.id }, { expected_version: a.ver }));
  ok(c.write('annual_plan.approve', { annual_plan_id: a.id, decision: 'APPROVE' }, { expected_version: a.ver + 1, reauth_token: c.reauth() }));
  const b = approveNew(2027);
  assert.equal(env.rows('AnnualPlans').find((r) => r.annual_plan_id === b.id).revision, 2);
  assert.equal(c3.write('annual_plan.submit', { annual_plan_id: b.id }, { expected_version: b.ver }).errors[0].field, 'change_reason');
  ok(c3.write('annual_plan.submit', { annual_plan_id: b.id, change_reason_vi: 'Thêm máy nén 04 mua tháng 3' }, { expected_version: b.ver }));
  const ap = ok(c.write('annual_plan.approve', { annual_plan_id: b.id, decision: 'APPROVE' }, { expected_version: b.ver + 1, reauth_token: c.reauth() }));
  assert.equal(ap.data.display_code, 'KHN-2027-02');
  const rows = env.rows('AnnualPlans');
  assert.equal(rows.find((r) => r.annual_plan_id === a.id).status, 'SUPERSEDED');
  assert.equal(rows.find((r) => r.annual_plan_id === b.id).change_reason_zh !== '', true, 'lý do điều chỉnh dịch máy');
  // Hủy bản nháp năm khác, rồi lập lại được
  const d = approveNew(2028);
  assert.equal(c3.write('annual_plan.cancel', { annual_plan_id: d.id }, { expected_version: d.ver }).errors[0].field, 'reason');
  ok(c3.write('annual_plan.cancel', { annual_plan_id: d.id, reason: 'Lập lại' }, { expected_version: d.ver }));
  ok(c3.write('annual_plan.save', { annual_plan_id: uuid(), year: 2028, snapshot: snapshot(ctx, 2028) }));
});

test('PDF kế hoạch năm: A4 ngang, tiêu đề hai thứ tiếng, dòng "chưa duyệt" ở bản nháp, mã biểu mẫu, tổng hợp theo loại, ô tháng ghi ngày, khối ký có tên + ngày', () => {
  const ctx = setup();
  const { env, c, c3, kt } = ctx;
  const setForm = ok(c.call('settings.edit', { changes: { annual_plan_form_code: 'BM-BT-01' }, reason: 'thử' }, { operation_id: uuid(), reauth_token: c.reauth() }));
  assert.ok(setForm);
  const id = uuid();
  const s = ok(c3.write('annual_plan.save', { annual_plan_id: id, year: 2027, snapshot: snapshot(ctx, 2027) }));
  const docOf = () => [...env.drive._docs.values()].pop();
  const p1 = ok(c3.call('annual_plan.pdf', { annual_plan_id: id }));
  assert.ok(Buffer.from(p1.data.content_b64, 'base64').toString('utf8').startsWith('%PDF'));
  assert.equal(p1.data.file_name, 'KHN-2027-01-draft.pdf');
  let d = docOf();
  assert.equal(d.page.w, 842);
  const [t0, t1, t2] = d.body.children;
  assert.equal(t0.text, 'Kế hoạch bảo trì năm 2027');
  assert.equal(t1.text, '2027年度维护计划');
  assert.ok(t2.text.startsWith('BẢN CHƯA DUYỆT'), t2.text);
  const tables = d.body.children.filter((x) => x.kind === 'table');
  const meta = tables[0];
  assert.ok(meta.rows[0].cells[1].getText().includes('BM-BT-01'), 'mã biểu mẫu');
  const sum = tables.find((t) => t.rows[0].cells[0].getText().startsWith('Loại thiết bị'));
  const last = sum.rows[sum.rows.length - 1];
  assert.ok(last.cells[0].getText().startsWith('Tổng cộng'));
  assert.equal(last.cells[sum.rows[0].cells.length - 1].getText(), '5 + ≈2');
  const det = tables.find((t) => t.rows[0].cells[0].getText().startsWith('Mã'));
  assert.equal(det.rows[1].cells[4].getText(), '05', 'T1 ngày 05');
  assert.equal(det.rows[2].cells[6].getText(), '≈02', 'T3 ước tính');
  const sign = tables[tables.length - 1];
  assert.equal(sign.rows[3].cells[0].getText(), 'U-C3', 'tên người lập');
  assert.equal(sign.rows[3].cells[1].getText(), '', 'chưa duyệt: trống');
  assert.ok(d.footer.children[0].text.includes('Nháp'));
  // Duyệt → tên người duyệt + mã trên chân trang, không còn dòng "chưa duyệt"
  ok(c3.write('annual_plan.submit', { annual_plan_id: id }, { expected_version: s.data.record_version }));
  ok(c.write('annual_plan.approve', { annual_plan_id: id, decision: 'APPROVE' }, { expected_version: s.data.record_version + 1, reauth_token: c.reauth() }));
  const p2 = ok(c3.call('annual_plan.pdf', { annual_plan_id: id }));
  assert.equal(p2.data.file_name, 'KHN-2027-01.pdf');
  d = docOf();
  assert.ok(!d.body.children[2].text || !d.body.children[2].text.startsWith('BẢN CHƯA DUYỆT'));
  const sign2 = d.body.children.filter((x) => x.kind === 'table').pop();
  assert.equal(sign2.rows[3].cells[1].getText(), 'Chủ hệ thống');
  assert.ok(sign2.rows[4].cells[1].getText().startsWith('Ngày'));
  assert.ok(d.footer.children[0].text.includes('KHN-2027-01'));
  assert.ok([...env.drive._docs.keys()].every((k) => env.drive._files.get(k)?.trashed === true), 'tệp Docs tạm vào thùng rác');
  // KT không có quyền xuất (IFON tắt mặc định)
  assert.equal(kt.call('annual_plan.pdf', { annual_plan_id: id }).code, 'FORBIDDEN');
  assert.equal(env.rows('AuditLogs').filter((a) => a.action === 'annual_plan.pdf').length, 2);
});

test('dữ liệu chưa migrateSchema (1.5.4): lệnh kế hoạch nhóm/năm trả FEATURE_NOT_ENABLED, đồng bộ không gửi kế hoạch năm', () => {
  const ctx = setup();
  const { env, c, eqs, today } = ctx;
  env.g.withWriteLock_(() => { const st = env.g.readState_(); env.g.stateWrite_(st, { schema_version: ['STRING', '1.5.4'] }, 'TEST'); });
  env.g.cache_().remove('sys:state');
  assert.equal(c.write('maintenance.plan.group', { plan_group_id: uuid(), plans: [{ plan_id: uuid(), equipment_id: eqs[0], anchor_date: today }], title_vi: 'X', interval_type: 'MONTH', interval_value: 1 }).code, 'FEATURE_NOT_ENABLED');
  assert.equal(c.write('annual_plan.save', { annual_plan_id: uuid(), year: 2027, snapshot: snapshot(ctx, 2027) }).code, 'FEATURE_NOT_ENABLED');
  const s = c.call('sync.changes', { cursor: 0 }).data;
  assert.equal(s.released_dot, 4);
  assert.ok(!s.changes.some((x) => x.entity_type === 'ANNUAL_PLAN'));
  // Kế hoạch từng máy vẫn chạy như cũ
  ok(c.write('maintenance.plan.edit', { plan_id: uuid(), equipment_id: eqs[0], title_vi: 'Bảo dưỡng', interval_type: 'MONTH', interval_value: 1, anchor_date: addDays(today, 30) }));
});
