import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid } from '../helpers.mjs';

function mkEq(c, name = 'Máy ép') {
  const id = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: id, name_vi: name }).ok, true);
  return id;
}
function mkMat(c, extra = {}) {
  const id = uuid();
  const r = c.write('material.create', { material_id: id, name_vi: 'Vòng bi 6205', part_number: '6205-2RS', base_unit: 'cái', is_equipment_component: true, ...extra });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { id, r };
}

test('material.create: mã VT-0001, QR, dịch máy tên, không nhận cột tồn/giá kho; material.view báo chưa kết nối kho', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id, r } = mkMat(c, { specification_vi: 'Bi cầu 25×52×15' });
  assert.equal(r.data.display_code, 'VT-0001');
  assert.match(r.data.qr_key, /^[0-9A-HJKMNP-TV-Z]{20}$/);
  const row = env.rows('Materials')[0];
  assert.equal(row.name_zh, '[zh-CN] Vòng bi 6205');
  assert.equal(row.group_key, 'EQUIPMENT_PART');
  assert.equal(row.item_kind, 'COMPONENT');
  assert.equal(row.active, true);
  const bad = c.write('material.create', { material_id: uuid(), name_vi: 'X', base_unit: 'cái', reorder_level: 5 });
  assert.equal(bad.errors[0].code, 'WAREHOUSE_NOT_CONNECTED');
  const noUnit = c.write('material.create', { material_id: uuid(), name_vi: 'X' });
  assert.equal(noUnit.errors[0].field, 'base_unit');
  const v = c.call('material.view', { material_id: id });
  assert.equal(v.data.warehouse_connected, false);
  assert.ok(!('stock' in v.data.item));
  // Cài đặt: chưa kết nối kho
  assert.equal(c.call('sync.bootstrap', {}).data.settings.warehouse_connected, false);
});

test('quyền vật tư: KT, TK (chưa bật), C1 không tạo; C3 tạo; bật C cho (2, warehouse) thì TK tạo được', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const tk = userClient(env, 'U-TK', 2, '615273', 'THU_KHO');
  const c1 = userClient(env, 'U-C1', 1, '482915');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  for (const x of [kt, tk, c1]) assert.equal(x.write('material.create', { material_id: uuid(), name_vi: 'A', base_unit: 'cái' }).code, 'FORBIDDEN');
  assert.equal(c3.write('material.create', { material_id: uuid(), name_vi: 'A', base_unit: 'cái' }).ok, true);
  // Quản trị bật "nếu bật" cho Thủ kho
  env.g.dbReset_();
  env.g.withWriteLock_(() => {
    const rp = env.g.findOne_('RolePermissions', 'permission_id', 'RP-2-warehouse');
    env.g.writeCells_('RolePermissions', rp.__row, { can_create: true, can_edit: true });
    const st = env.g.readState_();
    env.g.stateWrite_(st, { perm_version: ['INT', 2] });
  });
  env.cache.clear && env.cache.clear();
  env.g.cache_().remove('sys:state');
  assert.equal(tk.write('material.create', { material_id: uuid(), name_vi: 'B', base_unit: 'cái' }).ok, true);
  assert.equal(kt.write('material.create', { material_id: uuid(), name_vi: 'C', base_unit: 'cái' }).code, 'FORBIDDEN');
});

test('part.link: gắn vật tư có sẵn, chuẩn đơn vị theo vật tư, một vật tư gắn 2 máy, trùng trên cùng máy bị chặn; KT gắn thì chưa xác nhận', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const a = mkEq(c, 'Máy A'), b = mkEq(c, 'Máy B');
  const { id: mat } = mkMat(c);
  const p1 = uuid();
  const r1 = c.write('part.link', { equipment_part_id: p1, equipment_id: a, material_id: mat, installed_qty: 2, position_vi: 'Đầu trục' });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  let parts = env.rows('EquipmentParts');
  assert.equal(parts[0].unit, 'cái');
  assert.ok(parts[0].approved_by, 'C4 gắn thì tự xác nhận');
  assert.equal(c.write('part.link', { equipment_part_id: uuid(), equipment_id: a, material_id: mat, installed_qty: 1 }).errors[0].code, 'CODE_DUPLICATE');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const p2 = uuid();
  const r2 = kt.write('part.link', { equipment_part_id: p2, equipment_id: b, material_id: mat, installed_qty: 1 });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  parts = env.rows('EquipmentParts');
  assert.equal(parts.find((x) => x.equipment_part_id === p2).approved_by, '');
  assert.equal(kt.write('part.link', { equipment_part_id: uuid(), equipment_id: b, material_id: uuid(), installed_qty: 1 }).errors[0].field, 'material_id');
  assert.equal(kt.write('part.link', { equipment_part_id: uuid(), equipment_id: a, material_id: mat, installed_qty: 0 }).errors[0].field, 'installed_qty');
  // KT không đặt thay thế được
  assert.equal(kt.write('part.link', { equipment_part_id: p2, alternate_part_id: mat, installed_qty: 1 }, { expected_version: 1 }).errors[0].field, 'alternate_part_id');
  // Vật tư không gắn máy được
  const { id: cons } = mkMat(c, { name_vi: 'Giẻ lau', is_equipment_component: false, base_unit: 'kg' });
  assert.equal(c.write('part.link', { equipment_part_id: uuid(), equipment_id: a, material_id: cons, installed_qty: 1 }).errors[0].code, 'NOT_COMPONENT');
  // Sự kiện LINKED, không có phiếu kho
  const evs = env.rows('EquipmentPartEvents');
  assert.equal(evs.filter((e) => e.event_type === 'LINKED').length, 2);
  assert.ok(evs.every((e) => !e.work_type && !e.work_id));
  // C1 không gắn
  const c1 = userClient(env, 'U-C1', 1, '482915');
  assert.equal(c1.write('part.link', { equipment_part_id: uuid(), equipment_id: b, material_id: mat, installed_qty: 1 }).code, 'FORBIDDEN');
});

test('part.approve: C3 xác nhận liên kết của KT (PIN), người gắn không tự xác nhận; part.unlink: KT chỉ gỡ của mình chưa xác nhận; gỡ không xóa vật tư', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const a = mkEq(c, 'Máy A'), b = mkEq(c, 'Máy B');
  const { id: mat } = mkMat(c);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const pa = uuid(), pb = uuid();
  assert.equal(kt.write('part.link', { equipment_part_id: pa, equipment_id: a, material_id: mat, installed_qty: 1 }).ok, true);
  assert.equal(c.write('part.link', { equipment_part_id: pb, equipment_id: b, material_id: mat, installed_qty: 1 }).ok, true);
  // KT không gỡ liên kết của người khác
  assert.equal(kt.write('part.unlink', { equipment_part_id: pb, reason: 'x' }, { expected_version: 1 }).code, 'FORBIDDEN');
  // Xác nhận cần PIN
  const c3 = userClient(env, 'U-C3', 3, '694127');
  assert.equal(c3.write('part.approve', { equipment_part_id: pa }, { expected_version: 1 }).code, 'REAUTH_REQUIRED');
  const rt = c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const ap = c3.write('part.approve', { equipment_part_id: pa, alternate_part_id: mat }, { expected_version: 1, reauth_token: rt });
  assert.equal(ap.ok, true, JSON.stringify(ap));
  const row = env.rows('EquipmentParts').find((x) => x.equipment_part_id === pa);
  assert.ok(row.approved_by);
  assert.equal(row.alternate_part_id, mat);
  // Đã xác nhận → KT không gỡ được nữa
  assert.equal(kt.write('part.unlink', { equipment_part_id: pa, reason: 'x' }, { expected_version: 2 }).code, 'FORBIDDEN');
  // Người gắn (KT) không bao giờ có cờ duyệt; C4 tự gắn thì liên kết đã xác nhận sẵn
  const kt2 = uuid();
  assert.equal(kt.write('part.link', { equipment_part_id: kt2, equipment_id: b, material_id: (mkMat(c, { name_vi: 'Phớt' }).id), installed_qty: 1 }).ok, true);
  assert.equal(kt.write('part.unlink', { equipment_part_id: kt2 }, { expected_version: 1 }).errors[0].field, 'reason');
  assert.equal(kt.write('part.unlink', { equipment_part_id: kt2, reason: 'Gắn nhầm' }, { expected_version: 1 }).ok, true);
  // C4 gỡ ở máy B: vật tư vẫn trong danh mục, máy A vẫn còn
  assert.equal(c.write('part.unlink', { equipment_part_id: pb, reason: 'Tháo bỏ' }, { expected_version: 1 }).ok, true);
  assert.equal(env.rows('Materials').filter((m) => m.material_id === mat).length, 1);
  const live = env.rows('EquipmentParts').filter((x) => !x.removed_at);
  assert.equal(live.length, 1);
  assert.equal(live[0].equipment_part_id, pa);
  assert.equal(env.rows('EquipmentPartEvents').filter((e) => e.event_type === 'UNLINKED').length, 2);
});

test('part.link: KT sửa liên kết thì vẫn chờ xác nhận; C3 xác nhận được', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const a = mkEq(c);
  const { id: mat } = mkMat(c);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const p = uuid();
  assert.equal(kt.write('part.link', { equipment_part_id: p, equipment_id: a, material_id: mat, installed_qty: 1 }).ok, true);
  // KT sửa → vẫn chưa xác nhận; C3 sửa → tự xác nhận (là người sửa danh mục)
  assert.equal(kt.write('part.link', { equipment_part_id: p, installed_qty: 3 }, { expected_version: 1 }).ok, true);
  assert.equal(env.rows('EquipmentParts')[0].approved_by, '');
  const rt = c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  assert.equal(c3.write('part.approve', { equipment_part_id: p }, { expected_version: 2, reauth_token: rt }).ok, true);
});

test('material.archive: Ngừng dùng giữ dòng và quan hệ; QR báo ngừng; máy đang gắn vẫn còn liên kết', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const a = mkEq(c);
  const { id: mat } = mkMat(c);
  assert.equal(c.write('part.link', { equipment_part_id: uuid(), equipment_id: a, material_id: mat, installed_qty: 1 }).ok, true);
  assert.equal(c.write('material.archive', { material_id: mat }, { expected_version: 1 }).errors[0].field, 'reason');
  assert.equal(c.write('material.archive', { material_id: mat, reason: 'Ngừng sản xuất' }, { expected_version: 1 }).ok, true);
  assert.equal(env.rows('Materials')[0].active, false);
  assert.equal(c.call('qr.resolve', { code: 'VT-0001' }).data.qr_state, 'INACTIVE');
  assert.equal(env.rows('EquipmentParts').filter((x) => !x.removed_at).length, 1);
  assert.equal(c.call('material.view', {}).data.total, 0);
  assert.equal(c.call('material.view', { include_inactive: true }).data.total, 1);
  // Không gắn thêm vật tư ngừng dùng
  assert.equal(c.write('part.link', { equipment_part_id: uuid(), equipment_id: mkEq(c, 'Máy C'), material_id: mat, installed_qty: 1 }).errors[0].field, 'material_id');
  // Dùng lại bằng material.edit active=true
  assert.equal(c.write('material.edit', { material_id: mat, active: true }, { expected_version: 2 }).ok, true);
  assert.equal(c.call('qr.resolve', { code: 'VT-0001' }).data.qr_state, 'OK');
});
