import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, fakeJpegB64 } from '../helpers.mjs';

function createEq(c, extra = {}) {
  const id = uuid();
  const r = c.write('equipment.create', { equipment_id: id, name_vi: 'Máy nén khí', ...extra });
  assert.equal(r.ok, true, JSON.stringify(r));
  return id;
}

test('equipment.archive: bắt lý do, RETIRED + archived_at, QR ngừng; unarchive bắt chọn tình trạng; sync trả TOMBSTONE', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = createEq(c);
  const boot = c.call('sync.bootstrap', {});
  const cursor = Number(boot.data.sync_cursor);
  const noReason = c.write('equipment.archive', { equipment_id: id }, { expected_version: 1 });
  assert.equal(noReason.code, 'VALIDATION_ERROR');
  assert.equal(noReason.errors[0].field, 'reason');
  const a = c.write('equipment.archive', { equipment_id: id, reason: 'Thanh lý' }, { expected_version: 1 });
  assert.equal(a.ok, true, JSON.stringify(a));
  const row = env.rows('Equipment')[0];
  assert.equal(row.status, 'RETIRED');
  assert.ok(row.archived_at);
  assert.equal(env.rows('QrRegistry')[0].active, false);
  const audit = env.rows('AuditLogs').find((x) => x.action === 'equipment.archive');
  assert.equal(audit.reason, 'Thanh lý');
  const ch = c.call('sync.changes', { cursor });
  const t = ch.data.changes.find((x) => x.entity_id === id);
  assert.equal(t.op, 'TOMBSTONE');
  // QR của hồ sơ lưu trữ → INACTIVE (chỉ người có quyền xem)
  const qr = c.call('qr.resolve', { code: row.equipment_code });
  assert.equal(qr.data.qr_state, 'INACTIVE');
  // Danh sách mặc định ẩn; include_archived thì có
  assert.equal(c.call('equipment.view', {}).data.total, 0);
  assert.equal(c.call('equipment.view', { include_archived: true }).data.total, 1);
  const u1 = c.write('equipment.unarchive', { equipment_id: id, reason: 'Dùng lại', status: 'RETIRED' }, { expected_version: 2 });
  assert.equal(u1.code, 'VALIDATION_ERROR');
  const u2 = c.write('equipment.unarchive', { equipment_id: id, reason: 'Dùng lại', status: 'STANDBY' }, { expected_version: 2 });
  assert.equal(u2.ok, true, JSON.stringify(u2));
  assert.equal(env.rows('Equipment')[0].status, 'STANDBY');
  assert.equal(env.rows('Equipment')[0].archived_at, '');
  assert.equal(env.rows('QrRegistry')[0].active, true);
});

test('equipment.archive đưa ảnh LINK_VIEW của thiết bị về riêng tư (REVOKED)', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = createEq(c);
  const docId = uuid();
  const up = c.write('doc.upload', { document_id: docId, entity_type: 'EQUIPMENT', entity_id: id, kind: 'PHOTO_EQUIPMENT', mime_type: 'image/jpeg', content_b64: fakeJpegB64(), title_vi: 'Ảnh' });
  assert.equal(up.ok, true, JSON.stringify(up));
  assert.equal(env.rows('Documents')[0].drive_sharing_state, 'LINK_SHARED');
  const a = c.write('equipment.archive', { equipment_id: id, reason: 'Thanh lý' }, { expected_version: 1 });
  assert.equal(a.ok, true);
  const d = env.rows('Documents')[0];
  assert.equal(d.drive_sharing_state, 'REVOKED');
  assert.equal(env.drive._files.get(d.drive_file_id).access, 'PRIVATE');
});

test('equipment.spec.edit: khóa chuẩn lấy nhãn 5.5, chuẩn hóa đơn vị, chặn đơn vị lạ, trùng khóa, sửa và bỏ dòng', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = createEq(c);
  const s1 = uuid();
  const r1 = c.write('equipment.spec.edit', { spec_id: s1, equipment_id: id, spec_key: 'throughput', value_num: 500, unit: 'KG/H' });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  let row = env.rows('EquipmentSpecs')[0];
  assert.equal(row.label_vi, 'Năng suất');
  assert.equal(row.label_zh, '产能');
  assert.equal(row.unit, 'kg/h');
  assert.equal(row.value_num, 500);
  const r2 = c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: id, spec_key: 'electrical_power', value_num: 37, unit: 'kwh' });
  assert.equal(r2.code, 'VALIDATION_ERROR');
  assert.equal(r2.errors[0].code, 'UNIT_NOT_ALLOWED');
  const r3 = c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: id, spec_key: 'throughput', value_num: 1, unit: 't/h' });
  assert.equal(r3.errors[0].code, 'CODE_DUPLICATE');
  const r4 = c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: id, spec_key: 'cong_suat_la', value_num: 1 });
  assert.equal(r4.errors[0].field, 'spec_key');
  const r5 = c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: id, spec_key: 'dimensions', value_text: '1200 x 800 * 1500', unit: 'mm' });
  assert.equal(r5.ok, true);
  assert.equal(env.rows('EquipmentSpecs')[1].value_text, '1200×800×1500');
  const r6 = c.write('equipment.spec.edit', { spec_id: s1, spec_key: 'throughput', value_num: 650, unit: 'kg/h' }, { expected_version: 1 });
  assert.equal(r6.ok, true, JSON.stringify(r6));
  assert.equal(r6.record_version, 2);
  const r7 = c.write('equipment.spec.edit', { spec_id: s1, spec_key: 'throughput', value_num: 700, unit: 'kg/h' }, { expected_version: 1 });
  assert.equal(r7.code, 'VERSION_CONFLICT');
  const r8 = c.write('equipment.spec.edit', { spec_id: s1, remove: true }, { expected_version: 2 });
  assert.equal(r8.ok, true);
  row = env.rows('EquipmentSpecs')[0];
  assert.ok(row.archived_at);
  // Sau khi bỏ, thêm lại cùng khóa được
  const r9 = c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: id, spec_key: 'throughput', value_num: 1, unit: 't/h' });
  assert.equal(r9.ok, true);
  const v = c.call('equipment.view', { equipment_id: id });
  assert.equal(v.data.specs.length, 2);
});

test('quyền thiết bị: C1 và KT không lưu trữ/sửa thông số; C3 được', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = createEq(c);
  const c1 = userClient(env, 'U-C1', 1, '482915');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  for (const x of [c1, kt]) {
    assert.equal(x.write('equipment.archive', { equipment_id: id, reason: 'x' }, { expected_version: 1 }).code, 'FORBIDDEN');
    assert.equal(x.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: id, spec_key: 'speed', value_num: 1450 }).code, 'FORBIDDEN');
  }
  assert.equal(c3.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: id, spec_key: 'speed', value_num: 1450 }).ok, true);
});

test('session.listOwn / revokeOwn; user.pickList theo quyền; bản ghi có owner_name', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const list = c.call('session.listOwn', {});
  assert.equal(list.ok, true, JSON.stringify(list));
  assert.ok(list.data.items.some((s) => s.current));
  assert.ok(!('token_hash' in list.data.items[0]));
  const c1 = userClient(env, 'U-C1', 1, '482915');
  assert.equal(c1.call('user.pickList', {}).code, 'FORBIDDEN');
  const pick = c.call('user.pickList', {});
  assert.equal(pick.ok, true);
  const me = pick.data.items.find((u) => u.employee_code === 'NV-001');
  assert.ok(me && me.display_name && !('pin_hash' in me));
  // owner_name
  const id = uuid();
  c.write('equipment.create', { equipment_id: id, name_vi: 'Bơm', owner_user_id: me.user_id });
  const v = c.call('equipment.view', { equipment_id: id });
  assert.equal(v.data.item.owner_name, me.display_name);
  // Thu hồi phiên khác của mình
  const other = c1.call('session.listOwn', {}).data.items[0];
  assert.equal(c.call('session.revokeOwn', { session_id: other.session_id }).code, 'NOT_FOUND');
  const c1b = userClient(env, 'U-C1B', 1, '715249');
  const sid = c1b.call('session.listOwn', {}).data.items[0].session_id;
  assert.equal(c1b.call('session.revokeOwn', { session_id: sid }).ok, true);
  assert.equal(c1b.call('account.view', {}).code, 'AUTH_REQUIRED');
});

test('doc.upload liên kết ngoài (https) và doc.archive: gỡ khỏi hồ sơ, ảnh về riêng tư, KT chỉ gỡ tài liệu của mình', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = createEq(c);
  const bad = c.write('doc.upload', { document_id: uuid(), entity_type: 'EQUIPMENT', entity_id: id, kind: 'MANUAL', external_url: 'http://x.test/a.pdf', title_vi: 'HDSD' });
  assert.equal(bad.errors[0].code, 'URL_INVALID');
  const lid = uuid();
  const ok = c.write('doc.upload', { document_id: lid, entity_type: 'EQUIPMENT', entity_id: id, kind: 'MANUAL', external_url: 'https://example.test/manual.pdf', title_vi: 'Hướng dẫn' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const d = env.rows('Documents')[0];
  assert.equal(d.storage_kind, 'LINK');
  assert.equal(d.access_scope, 'MODULE_VIEW');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  assert.equal(kt.write('doc.archive', { document_id: lid }, { expected_version: 1 }).code, 'FORBIDDEN');
  const pid = uuid();
  const up = kt.write('doc.upload', { document_id: pid, entity_type: 'EQUIPMENT', entity_id: id, kind: 'PHOTO_EQUIPMENT', mime_type: 'image/jpeg', content_b64: fakeJpegB64(), title_vi: 'Ảnh' });
  assert.equal(up.ok, true, JSON.stringify(up));
  const ar = kt.write('doc.archive', { document_id: pid }, { expected_version: 1 });
  assert.equal(ar.ok, true, JSON.stringify(ar));
  const pd = env.rows('Documents').find((x) => x.document_id === pid);
  assert.equal(pd.active, false);
  assert.equal(pd.drive_sharing_state, 'REVOKED');
  assert.equal(env.drive._files.get(pd.drive_file_id).trashed, false);
  assert.equal(c.write('doc.archive', { document_id: lid }, { expected_version: 1 }).ok, true);
  assert.equal(c.call('doc.view', { entity_type: 'EQUIPMENT', entity_id: id }).data.items.length, 0);
});

test('qr.print: trả dữ liệu tem (mã, tên, mã khu vực, qr_key), ghi nhật ký; C1 không in; hồ sơ lưu trữ không in', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const a = createEq(c), b = createEq(c, { name_vi: 'Bơm' });
  const r = c.call('qr.print', { entity_type: 'EQUIPMENT', ids: [a, b] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.items.length, 2);
  assert.match(r.data.items[0].qr_key, /^[0-9A-HJKMNP-TV-Z]{20}$/);
  assert.ok(!JSON.stringify(r.data).includes('value'));
  assert.equal(env.rows('AuditLogs').filter((x) => x.action === 'qr.print').length, 1);
  const c1 = userClient(env, 'U-C1', 1, '482915');
  assert.equal(c1.call('qr.print', { entity_type: 'EQUIPMENT', ids: [a] }).code, 'FORBIDDEN');
  c.write('equipment.archive', { equipment_id: b, reason: 'x' }, { expected_version: 1 });
  assert.equal(c.call('qr.print', { entity_type: 'EQUIPMENT', ids: [a, b] }).data.items.length, 1);
  assert.equal(c.call('qr.print', { entity_type: 'DOCUMENT', ids: [a] }).code, 'VALIDATION_ERROR');
});
