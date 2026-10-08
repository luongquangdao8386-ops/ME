import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid } from '../helpers.mjs';

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Bình khí nén' }).ok, true);
  const type = uuid();
  const t = c.write('inspection.type.edit', { inspection_type_id: type, code: 'ap_luc', name_vi: 'Kiểm định bình chịu áp lực', default_interval_months: 12, required_docs_vi: 'Biên bản' });
  assert.equal(t.ok, true, JSON.stringify(t));
  const req = uuid();
  const r = c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type });
  assert.equal(r.ok, true, JSON.stringify(r));
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  return { env, c, hd, c3, eq, type, req, reqCode: r.data.display_code };
}
const submit = (cl, req, extra = {}) => {
  const id = uuid();
  const r = cl.write('inspection.submit', { inspection_id: id, requirement_id: req, inspection_date: '2026-10-01', valid_from: '2026-10-01', valid_to: '2027-09-30', result: 'PASS', certificate_number: 'CN-1', ...extra });
  return { id, r };
};
const approve = (cl, id, decision = 'APPROVE', ver = 1, extra = {}) => cl.write('inspection.approve', { inspection_id: id, decision, ...extra }, { expected_version: ver, reauth_token: cl.reauth() });

test('loại kiểm định: mã chữ hoa, không trùng; tên không dịch tự động (MANUAL_REQUIRED); yêu cầu: mã KD-0001, QR, không trùng loại trên cùng thiết bị', () => {
  const { env, c, eq, type, reqCode } = setup();
  const t = env.rows('InspectionTypes')[0];
  assert.equal(t.code, 'AP_LUC');
  assert.equal(t.name_zh, '');
  assert.equal(t.i18n_meta.name.state, 'MANUAL_REQUIRED');
  assert.equal(c.write('inspection.type.edit', { inspection_type_id: uuid(), code: 'AP_LUC', name_vi: 'X' }).errors[0].code, 'CODE_DUPLICATE');
  assert.equal(reqCode, 'KD-0001');
  assert.equal(env.rows('QrRegistry').filter((q) => q.entity_type === 'INSPECTION_REQUIREMENT').length, 1);
  assert.equal(c.write('inspection.requirement.edit', { requirement_id: uuid(), equipment_id: eq, inspection_type_id: type }).errors[0].code, 'CODE_DUPLICATE');
  // Không sửa hạn hiện hành bằng requirement.edit
  const req = env.rows('InspectionRequirements')[0];
  assert.equal(c.write('inspection.requirement.edit', { requirement_id: req.requirement_id, current_due_date: '2030-01-01' }, { expected_version: 1 }).errors[0].field, 'current_due_date');
  // Ngừng yêu cầu cần lý do
  assert.equal(c.write('inspection.requirement.edit', { requirement_id: req.requirement_id, active: false }, { expected_version: 1 }).errors[0].field, 'reason');
});

test('quyền: HĐ tạo yêu cầu, nộp; HĐ không duyệt; người nộp không tự duyệt (cả cấp 4); C3 duyệt cần PIN', () => {
  const { env, c, hd, c3, eq, type, req } = setup();
  assert.equal(hd.write('inspection.type.edit', { inspection_type_id: uuid(), code: 'X1', name_vi: 'X' }).code, 'FORBIDDEN');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  assert.equal(kt.write('inspection.requirement.edit', { requirement_id: uuid(), equipment_id: eq, inspection_type_id: type }).code, 'FORBIDDEN');
  const { id, r } = submit(hd, req);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.data.display_code, /^LKD-2610-\d{3}$/);
  assert.equal(hd.write('inspection.approve', { inspection_id: id, decision: 'APPROVE' }, { expected_version: 1 }).code, 'FORBIDDEN', 'không hỏi PIN người không có quyền');
  // C4 nộp rồi tự duyệt → FORBIDDEN
  const own = submit(c, req, { inspection_date: '2026-09-01' });
  const rt = c.call('auth.reauth', { pin: '604817' }).data.reauth_token;
  assert.equal(c.write('inspection.approve', { inspection_id: own.id, decision: 'APPROVE' }, { expected_version: 1, reauth_token: rt }).code, 'FORBIDDEN');
  assert.equal(c3.write('inspection.approve', { inspection_id: id, decision: 'APPROVE' }, { expected_version: 1 }).code, 'REAUTH_REQUIRED');
  assert.equal(approve(c3, id).ok, true);
  const audit = env.rows('AuditLogs').filter((a) => a.action === 'inspection.approve');
  assert.equal(audit.length, 1);
});

test('chờ duyệt giữ hạn cũ; duyệt PASS → hạn mới, due_revision, lần cũ SUPERSEDED; FAIL giữ hạn, record_status FAILED (NT1-92)', () => {
  const { env, hd, c3, req } = setup();
  const a = submit(hd, req, { valid_to: '2027-09-30', next_due_date: '2027-08-31' });
  let row = env.rows('InspectionRequirements')[0];
  assert.equal(row.current_due_date, '', 'chờ duyệt không đổi hạn');
  assert.equal(approve(c3, a.id).ok, true);
  row = env.rows('InspectionRequirements')[0];
  assert.equal(row.current_inspection_id, a.id);
  assert.equal(row.current_due_date, '2027-08-31', 'ngày sớm hơn giữa hiệu lực đến và hạn tiếp theo');
  assert.equal(row.due_revision, `VALID_TO:2027-08-31:${a.id}`);
  // Lần mới PASS
  const b = submit(hd, req, { inspection_date: '2027-08-20', valid_from: '2027-08-20', valid_to: '2028-08-19' });
  assert.equal(env.rows('InspectionRequirements')[0].current_due_date, '2027-08-31');
  assert.equal(approve(c3, b.id).ok, true);
  const ins = env.rows('Inspections');
  assert.equal(ins.find((x) => x.inspection_id === a.id).status, 'SUPERSEDED');
  assert.equal(ins.find((x) => x.inspection_id === b.id).supersedes_inspection_id, a.id);
  assert.equal(env.rows('InspectionRequirements')[0].current_due_date, '2028-08-19');
  // Lần FAIL: duyệt xong giữ hạn, record_status FAILED
  const f = submit(hd, req, { inspection_date: '2028-01-10', valid_from: '', valid_to: '', result: 'FAIL' });
  assert.equal(f.r.ok, true, JSON.stringify(f.r));
  assert.equal(approve(c3, f.id).ok, true);
  assert.equal(env.rows('InspectionRequirements')[0].current_due_date, '2028-08-19');
  const v = c3.call('inspection.view', {});
  assert.equal(v.data.requirements[0].record_status, 'FAILED');
});

test('từ chối cần lý do; thu hồi giữ hạn → REVOKED; tạm ngưng/bỏ tạm ngưng; C3 PIN', () => {
  const { env, hd, c3, req } = setup();
  const a = submit(hd, req);
  assert.equal(c3.write('inspection.approve', { inspection_id: a.id, decision: 'REJECT' }, { expected_version: 1, reauth_token: c3.reauth() }).errors[0].field, 'reason');
  assert.equal(approve(c3, a.id, 'REJECT', 1, { reason: 'Thiếu chữ ký' }).ok, true);
  assert.equal(env.rows('Inspections')[0].status, 'REJECTED');
  assert.equal(env.rows('InspectionRequirements')[0].current_due_date, '');
  const b = submit(hd, req, { inspection_date: '2026-10-02' });
  assert.equal(approve(c3, b.id).ok, true);
  const due = env.rows('InspectionRequirements')[0].current_due_date;
  const rv = env.rows('InspectionRequirements')[0].record_version;
  const rk = c3.write('inspection.revoke', { requirement_id: req, op: 'REVOKE', reason: 'Cơ quan thu hồi' }, { expected_version: rv, reauth_token: c3.reauth() });
  assert.equal(rk.ok, true, JSON.stringify(rk));
  assert.equal(env.rows('Inspections').find((x) => x.inspection_id === b.id).status, 'REVOKED');
  assert.equal(env.rows('InspectionRequirements')[0].current_due_date, due);
  assert.equal(c3.call('inspection.view', {}).data.requirements[0].record_status, 'REVOKED');
  const s = c3.write('inspection.revoke', { requirement_id: req, op: 'SUSPEND', reason: 'Dừng máy dài hạn' }, { expected_version: rv + 1, reauth_token: c3.reauth() });
  assert.equal(s.ok, true);
  assert.equal(c3.call('inspection.view', {}).data.requirements[0].record_status, 'SUSPENDED');
  assert.equal(hd.write('inspection.revoke', { requirement_id: req, op: 'RESUME', reason: 'x' }, { expected_version: rv + 2 }).code, 'FORBIDDEN');
  assert.equal(c3.write('inspection.revoke', { requirement_id: req, op: 'RESUME', reason: 'Chạy lại' }, { expected_version: rv + 2, reauth_token: c3.reauth() }).ok, true);
});

test('IN-03 (C10): PASS/CONDITIONAL_PASS bắt buộc Hiệu lực từ và đến; FAIL không bắt buộc; hiệu lực từ ≤ đến', () => {
  const { hd, req } = setup();
  const r1 = hd.write('inspection.submit', { inspection_id: uuid(), requirement_id: req, inspection_date: '2026-10-01', valid_to: '2027-10-01', result: 'PASS' });
  assert.equal(r1.errors[0].field, 'valid_from');
  const r2 = hd.write('inspection.submit', { inspection_id: uuid(), requirement_id: req, inspection_date: '2026-10-01', result: 'FAIL' });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  const r3 = hd.write('inspection.submit', { inspection_id: uuid(), requirement_id: req, inspection_date: '2026-10-01', valid_from: '2027-10-02', valid_to: '2027-10-01', result: 'PASS' });
  assert.equal(r3.errors[0].field, 'valid_to');
});
