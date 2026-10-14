// Vật tư trên phiếu Đợt 2: đề nghị, lượng dùng, chi phí tham khảo, thay linh kiện (4.4.2, 4.4.5, 4.5, 4.6, MAT-03)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const nowIso = (env, minutes = 0) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + minutes * 60000));
const uidOf = (env, code) => env.rows('Users').find((u) => u.employee_code === code).user_id;

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Bơm nước 01' }).ok, true);
  const bearing = uuid(), bearing2 = uuid(), grease = uuid();
  assert.equal(c.write('material.create', { material_id: bearing, name_vi: 'Vòng bi 6205', base_unit: 'cái', is_equipment_component: true }).ok, true);
  assert.equal(c.write('material.create', { material_id: bearing2, name_vi: 'Vòng bi 6205-2RS', base_unit: 'cái', is_equipment_component: true }).ok, true);
  assert.equal(c.write('material.create', { material_id: grease, name_vi: 'Mỡ bôi trơn', base_unit: 'kg', is_equipment_component: false }).ok, true);
  const link = uuid();
  assert.equal(c.write('part.link', { equipment_part_id: link, equipment_id: eq, material_id: bearing, installed_qty: 2, position_vi: 'Đầu trục' }).ok, true);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const kt2 = userClient(env, 'U-KT2', 2, '583017', 'KY_THUAT');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  // Phiếu bảo trì ngoài kế hoạch giao cho KT
  const wo = uuid();
  assert.equal(c3.write('maintenance.wo.create', { work_order_id: wo, equipment_id: eq, title_vi: 'Bảo dưỡng bơm', assignee_user_id: uidOf(env, 'U-KT') }).ok, true);
  assert.equal(kt.write('maintenance.execute', { work_order_id: wo, start_at: nowIso(env, -30) }, { expected_version: 1 }).ok, true);
  return { env, c, c3, kt, kt2, eq, bearing, bearing2, grease, link, wo };
}

const reqLines = (env, rid) => env.rows('MaterialRequestLines').filter((l) => l.request_id === rid && !l.archived_at);

test('đề nghị vật tư: người được giao tạo nháp (mã DN, đơn vị cơ sở), gửi duyệt; người khác không; người đề nghị không tự duyệt; duyệt sửa SL; không gửi kho', () => {
  const { env, c, c3, kt, kt2, wo, bearing, grease } = setup();
  const rid = uuid(), l1 = uuid(), l2 = uuid();
  const mk = (cl, id = rid, lines = [{ request_line_id: l1, material_id: bearing, requested_qty: 2 }, { request_line_id: l2, material_id: grease, requested_qty: 0.5, note_vi: 'Loại chịu nhiệt' }]) =>
    cl.write('matreq.create', { request_id: id, work_type: 'WORK_ORDER', work_id: wo, needed_at: env.g.todayVN_(), lines });
  assert.equal(mk(kt2).code, 'FORBIDDEN', 'KT không được giao phiếu');
  assert.equal(mk(kt, uuid(), [{ request_line_id: uuid(), material_id: bearing, requested_qty: 0 }]).errors[0].code, 'QTY_REQUIRED');
  assert.equal(kt.write('matreq.create', { request_id: uuid(), work_type: 'WORK_ORDER', work_id: wo, warehouse_id: uuid(), lines: [] }).errors[0].code, 'WAREHOUSE_NOT_CONNECTED');
  const r = mk(kt);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.data.display_code, /^DN-\d{4}-001$/);
  const req = env.rows('MaterialRequests')[0];
  assert.equal(req.status, 'DRAFT');
  assert.equal(req.warehouse_id, '');
  assert.deepEqual(reqLines(env, rid).map((l) => [l.unit, l.requested_qty]), [['cái', 2], ['kg', 0.5]]);
  assert.ok(reqLines(env, rid)[1].note_zh, 'ghi chú dịch máy');
  // Sửa nháp: bỏ một dòng
  assert.equal(kt.write('matreq.create', { request_id: rid, lines: [{ request_line_id: l2, remove: true }] }, { expected_version: 1 }).ok, true);
  assert.equal(reqLines(env, rid).length, 1);
  assert.equal(kt2.write('matreq.submit', { request_id: rid }, { expected_version: 2 }).code, 'FORBIDDEN');
  assert.equal(kt.write('matreq.submit', { request_id: rid }, { expected_version: 2 }).ok, true);
  assert.equal(env.rows('MaterialRequests')[0].status, 'PENDING_APPROVAL');
  assert.equal(kt.write('matreq.approve', { request_id: rid, decision: 'APPROVE' }, { expected_version: 3 }).code, 'FORBIDDEN');
  assert.equal(c3.write('matreq.approve', { request_id: rid, decision: 'APPROVE' }, { expected_version: 3 }).code, 'REAUTH_REQUIRED');
  const a = c3.write('matreq.approve', { request_id: rid, decision: 'APPROVE', lines: [{ request_line_id: l1, approved_qty: 1 }] }, { expected_version: 3, reauth_token: c3.reauth() });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(env.rows('MaterialRequests')[0].status, 'APPROVED');
  assert.equal(reqLines(env, rid)[0].approved_qty, 1);
  assert.equal(reqLines(env, rid)[0].status, 'APPROVED');
  // C4 tự đề nghị rồi tự duyệt → FORBIDDEN; từ chối cần lý do
  const own = uuid();
  assert.equal(c.write('matreq.create', { request_id: own, work_type: 'WORK_ORDER', work_id: wo, lines: [{ request_line_id: uuid(), material_id: grease, requested_qty: 1 }] }).ok, true);
  assert.equal(c.write('matreq.submit', { request_id: own }, { expected_version: 1 }).ok, true);
  assert.equal(c.write('matreq.approve', { request_id: own, decision: 'APPROVE' }, { expected_version: 2, reauth_token: c.reauth() }).code, 'FORBIDDEN');
  assert.equal(c3.write('matreq.approve', { request_id: own, decision: 'REJECT' }, { expected_version: 2, reauth_token: c3.reauth() }).errors[0].field, 'reason');
  assert.equal(c3.write('matreq.approve', { request_id: own, decision: 'REJECT', reason: 'Đã có sẵn' }, { expected_version: 2, reauth_token: c3.reauth() }).ok, true);
  // Hủy đề nghị
  const r3 = uuid();
  assert.equal(mk(kt, r3, [{ request_line_id: uuid(), material_id: grease, requested_qty: 1 }]).ok, true);
  assert.equal(kt.write('matreq.cancel', { request_id: r3, reason: 'Không cần' }, { expected_version: 1 }).ok, true);
  assert.equal(env.rows('MaterialRequests').find((x) => x.request_id === r3).status, 'CANCELLED');
});

test('lượng dùng: ghi (chờ xác nhận, đơn vị cơ sở, hai lượng riêng), không nhập giá, offline qua sync.push; người ghi không tự xác nhận; nghiệm thu xác nhận luôn', () => {
  const { env, c, c3, kt, kt2, wo, bearing, grease } = setup();
  const u1 = uuid(), u2 = uuid();
  assert.equal(kt2.write('usage.record', { work_type: 'WORK_ORDER', work_id: wo, lines: [{ usage_line_id: u1, material_id: grease, actual_used_qty: 1 }] }).code, 'FORBIDDEN');
  assert.equal(kt.write('usage.record', { work_type: 'WORK_ORDER', work_id: wo, lines: [{ usage_line_id: u1, material_id: grease, actual_used_qty: 0, scrap_qty: 0 }] }).errors[0].code, 'QTY_REQUIRED');
  assert.equal(kt.write('usage.record', { work_type: 'WORK_ORDER', work_id: wo, lines: [{ usage_line_id: u1, material_id: grease, actual_used_qty: 1, manual_unit_cost: 50000 }] }).errors[0].code, 'COST_FIELD_FORBIDDEN');
  const push = kt.call('sync.push', { op: { action: 'usage.record', operation_id: uuid(), expected_version: 0, payload: { work_type: 'WORK_ORDER', work_id: wo, lines: [{ usage_line_id: u1, material_id: grease, actual_used_qty: 0.4, scrap_qty: 0.1, note_vi: 'Rơi vãi' }, { usage_line_id: u2, material_id: bearing, actual_used_qty: 2 }] } } });
  assert.equal(push.ok, true, JSON.stringify(push));
  let rows = env.rows('MaterialUsageLines');
  assert.equal(rows.length, 2);
  const g1 = rows.find((x) => x.usage_line_id === u1);
  assert.equal(g1.status, 'PENDING_CONFIRMATION');
  assert.equal(g1.unit, 'kg');
  assert.equal(g1.actual_used_qty, 0.4);
  assert.equal(g1.scrap_qty, 0.1);
  assert.equal(g1.recorded_by, uidOf(env, 'U-KT'));
  // Không trừ tồn: không có bảng kho, vật tư không có cột tồn
  assert.equal(env.g.SHEETS.StockLines, undefined);
  // Xác nhận: KT không; C3 xác nhận một dòng; C4 xác nhận tất cả còn lại khi nghiệm thu
  assert.equal(kt.write('usage.confirm', { work_type: 'WORK_ORDER', work_id: wo, usage_line_ids: [u1] }).code, 'FORBIDDEN');
  assert.equal(c3.write('usage.confirm', { work_type: 'WORK_ORDER', work_id: wo, usage_line_ids: [u1] }, { reauth_token: c3.reauth() }).ok, true);
  assert.equal(kt.write('usage.record', { work_type: 'WORK_ORDER', work_id: wo, lines: [{ usage_line_id: u1, actual_used_qty: 0.5 }] }).errors[0].code, 'STATUS_INVALID', 'đã xác nhận thì không sửa');
  // C3 tự ghi một dòng rồi xác nhận "tất cả": bỏ qua dòng của mình
  const u3 = uuid();
  assert.equal(c3.write('usage.record', { work_type: 'WORK_ORDER', work_id: wo, lines: [{ usage_line_id: u3, material_id: grease, actual_used_qty: 0.2 }] }).ok, true);
  const all = c3.write('usage.confirm', { work_type: 'WORK_ORDER', work_id: wo, all: true }, { reauth_token: c3.reauth() });
  assert.deepEqual(all.data.confirmed, [u2]);
  assert.deepEqual(all.data.skipped, [u3]);
  assert.equal(c3.write('usage.confirm', { work_type: 'WORK_ORDER', work_id: wo, usage_line_ids: [u3] }, { reauth_token: c3.reauth() }).code, 'FORBIDDEN');
  // Nghiệm thu kèm xác nhận lượng dùng
  assert.equal(kt.write('maintenance.execute', { work_order_id: wo, end_at: nowIso(env, -1), overall_result: 'PASS' }, { expected_version: 2 }).ok, true);
  assert.equal(kt.write('maintenance.submit', { work_order_id: wo, expect: { usage_lines: [u1, u2, u3] } }, { expected_version: 3 }).ok, true);
  const acc = c.write('maintenance.accept', { work_order_id: wo, decision: 'ACCEPT', confirm_usage: true }, { expected_version: 4, reauth_token: c.reauth() });
  assert.equal(acc.ok, true, JSON.stringify(acc));
  assert.deepEqual(acc.data.usage_confirmed, [u3]);
  rows = env.rows('MaterialUsageLines');
  assert.ok(rows.every((x) => x.status === 'CONFIRMED'));
  assert.equal(rows.find((x) => x.usage_line_id === u3).confirmed_by, uidOf(env, 'NV-001'));
});

test('chi phí tham khảo: chỉ C3/C4 có quyền giá; nguồn MANUAL_REFERENCE; người không có quyền giá không nhận cột giá khi đồng bộ', () => {
  const { env, c3, kt, wo, grease } = setup();
  const u1 = uuid();
  assert.equal(kt.write('usage.record', { work_type: 'WORK_ORDER', work_id: wo, lines: [{ usage_line_id: u1, material_id: grease, actual_used_qty: 1 }] }).ok, true);
  assert.equal(kt.write('work.cost.edit', { work_type: 'WORK_ORDER', work_id: wo, labor_cost: 100000 }, { expected_version: 2 }).code, 'FORBIDDEN');
  const r = c3.write('work.cost.edit', { work_type: 'WORK_ORDER', work_id: wo, labor_cost: 250000, other_cost: 30000, usage_costs: [{ usage_line_id: u1, manual_unit_cost: 85000 }] }, { expected_version: 2 });
  assert.equal(r.ok, true, JSON.stringify(r));
  const w = env.rows('WorkOrders').find((x) => x.work_order_id === wo);
  assert.equal(w.labor_cost, 250000);
  assert.equal(w.cost_currency, 'VND');
  const u = env.rows('MaterialUsageLines')[0];
  assert.equal(u.cost_source, 'MANUAL_REFERENCE');
  assert.equal(u.currency, 'VND');
  assert.equal(c3.write('work.cost.edit', { work_type: 'WORK_ORDER', work_id: wo, outside_cost: 1 }, { expected_version: 3 }).errors[0].field, 'outside_cost');
  // KT đồng bộ: không có khóa giá
  const b = kt.call('sync.bootstrap', {});
  const kw = b.data.records.WORK_ORDER.find((x) => x.work_order_id === wo);
  assert.equal('labor_cost' in kw, false);
  assert.equal(kw.meta.cost_hidden, true);
  const ku = b.data.records.MATERIAL_USAGE.find((x) => x.usage_line_id === u1);
  assert.equal('manual_unit_cost' in ku, false);
  assert.equal(ku.actual_used_qty, 1);
  const b3 = c3.call('sync.bootstrap', {});
  assert.equal(b3.data.records.MATERIAL_USAGE.find((x) => x.usage_line_id === u1).manual_unit_cost, 85000);
  // Cấp 1 thấy đề nghị/lượng dùng (xem bảo trì), không thấy giá
  const c1 = userClient(env, 'U-C1', 1, '702913');
  const b1 = c1.call('sync.bootstrap', {});
  assert.equal(b1.data.records.MATERIAL_USAGE.length, 1);
  assert.equal('manual_unit_cost' in b1.data.records.MATERIAL_USAGE[0], false);
});

test('thay linh kiện theo phiếu: cùng loại chỉ ghi sự kiện; đổi loại kết thúc liên kết cũ, liên kết mới chờ xác nhận (KT); tháo, lắp; không trừ tồn', () => {
  const { env, c3, kt, kt2, wo, link, bearing, bearing2, grease } = setup();
  const rep = (cl, extra) => cl.write('part.replace', { event_id: uuid(), work_type: 'WORK_ORDER', work_id: wo, quantity: 1, ...extra });
  assert.equal(rep(kt2, { event_type: 'REPLACED', equipment_part_id: link }).code, 'FORBIDDEN', 'KT không được giao phiếu');
  let r = rep(kt, { event_type: 'REPLACED', equipment_part_id: link, note_vi: 'Vòng bi kêu' });
  assert.equal(r.ok, true, JSON.stringify(r));
  let ev = env.rows('EquipmentPartEvents').filter((e) => e.event_type === 'REPLACED');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].work_type, 'WORK_ORDER');
  assert.equal(ev[0].work_id, wo);
  assert.equal(ev[0].material_id, bearing);
  assert.equal(ev[0].old_material_id, '');
  assert.equal(env.rows('EquipmentParts').filter((p) => !p.removed_at).length, 1, 'cùng loại: liên kết giữ nguyên');
  // Đổi sang loại khác
  const nl = uuid();
  r = rep(kt, { event_type: 'REPLACED', equipment_part_id: link, material_id: bearing2, new_equipment_part_id: nl });
  assert.equal(r.ok, true, JSON.stringify(r));
  const parts = env.rows('EquipmentParts');
  assert.ok(parts.find((p) => p.equipment_part_id === link).removed_at);
  const np = parts.find((p) => p.equipment_part_id === nl);
  assert.equal(np.material_id, bearing2);
  assert.equal(np.installed_qty, 2);
  assert.equal(np.position_vi, 'Đầu trục');
  assert.equal(np.approved_by, '', 'KT lắp: chờ C3/C4 xác nhận');
  ev = env.rows('EquipmentPartEvents').filter((e) => e.event_type === 'REPLACED');
  assert.equal(ev[1].old_material_id, bearing);
  // Không gắn máy được → NOT_COMPONENT; lắp mới; tháo
  assert.equal(rep(kt, { event_type: 'INSTALLED', material_id: grease }).errors[0].code, 'NOT_COMPONENT');
  assert.equal(rep(kt, { event_type: 'INSTALLED', material_id: bearing2 }).errors[0].code, 'CODE_DUPLICATE');
  assert.equal(rep(c3, { event_type: 'REMOVED', equipment_part_id: nl, note_vi: 'Tháo để sửa trục' }).ok, true);
  assert.ok(env.rows('EquipmentParts').find((p) => p.equipment_part_id === nl).removed_at);
  const inst = rep(c3, { event_type: 'INSTALLED', material_id: bearing, position_vi: 'Đầu trục' });
  assert.equal(inst.ok, true, JSON.stringify(inst));
  const ip = env.rows('EquipmentParts').find((p) => p.equipment_part_id === inst.data.equipment_part_id);
  assert.equal(ip.approved_by, uidOf(env, 'U-C3'), 'C3 lắp: tự xác nhận');
  // Phiếu đã xong: không ghi thay nữa
  assert.equal(c3.write('maintenance.cancel', { work_order_id: wo, reason: 'x' }, { expected_version: 2 }).ok, true);
  assert.equal(rep(c3, { event_type: 'REMOVED', equipment_part_id: inst.data.equipment_part_id }).errors[0].code, 'STATUS_INVALID');
});

test('đề nghị/lượng dùng cho phiếu sửa chữa: module repairs; người làm việc con được ghi; phiếu đã hủy thì không ghi', () => {
  const { env, c3, kt, kt2, eq, grease } = setup();
  const bs = userClient(env, 'U-BS', 2, '583011', 'BAO_SU_CO');
  const rid = uuid();
  assert.equal(bs.write('repair.report', { repair_id: rid, equipment_id: eq, symptom_vi: 'Bơm không lên nước', severity: 'HIGH' }).ok, true);
  assert.equal(c3.write('repair.assign', { repair_id: rid, assignee_user_id: uidOf(env, 'U-KT') }, { expected_version: 1 }).ok, true);
  const task = uuid();
  assert.equal(kt.write('repair.process', { repair_id: rid, tasks: [{ repair_task_id: task, task_vi: 'Thay gioăng', assignee_user_id: uidOf(env, 'U-KT2') }] }, { expected_version: 2 }).ok, true);
  assert.equal(bs.write('usage.record', { work_type: 'REPAIR', work_id: rid, lines: [{ usage_line_id: uuid(), material_id: grease, actual_used_qty: 1 }] }).code, 'FORBIDDEN');
  assert.equal(kt2.write('usage.record', { work_type: 'REPAIR', work_id: rid, lines: [{ usage_line_id: uuid(), material_id: grease, actual_used_qty: 0.3 }] }).ok, true, 'người làm việc con tính là được giao');
  const mr = uuid();
  assert.equal(kt2.write('matreq.create', { request_id: mr, work_type: 'REPAIR', work_id: rid, lines: [{ request_line_id: uuid(), material_id: grease, requested_qty: 1 }] }).ok, true);
  assert.equal(env.rows('MaterialRequests')[0].work_type, 'REPAIR');
  assert.equal(c3.write('repair.cancel', { repair_id: rid, reason: 'Thay bơm mới' }, { expected_version: 3 }).ok, true);
  assert.equal(kt.write('usage.record', { work_type: 'REPAIR', work_id: rid, lines: [{ usage_line_id: uuid(), material_id: grease, actual_used_qty: 1 }] }).errors[0].code, 'STATUS_INVALID');
  // Nhật ký theo module của phiếu
  const audits = c3.call('audit.view', { filters: { module: 'repairs' } });
  assert.equal(audits.ok, true, JSON.stringify(audits));
  void eq;
});
