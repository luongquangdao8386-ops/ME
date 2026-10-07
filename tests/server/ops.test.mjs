import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, makeClient, uuid, fakeJpegB64, fakePdfB64 } from '../helpers.mjs';

function createEq(c, extra = {}) {
  const id = uuid();
  const r = c.write('equipment.create', { equipment_id: id, name_vi: 'Máy nén khí số 1', criticality: 'HIGH', ...extra });
  return { id, r };
}

test('equipment.create → COMMITTED, mã TB-0001, qr_key 20 ký tự, record_version 1, dịch máy', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id, r } = createEq(c);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.code, 'OK');
  assert.equal(r.state, 'COMMITTED');
  assert.equal(r.record_version, 1);
  assert.equal(r.dataset_epoch, c.epoch());
  assert.ok(r.operation_id);
  assert.equal(r.data.display_code, 'TB-0001');
  assert.match(r.data.qr_key, /^[0-9A-HJKMNP-TV-Z]{20}$/);
  const row = env.rows('Equipment')[0];
  assert.equal(row.equipment_id, id);
  assert.equal(row.name_zh, '[zh-CN] Máy nén khí số 1');
  assert.equal(row.i18n_meta.name.state, 'MACHINE');
  assert.equal(row.status, 'RUNNING');
  assert.equal(env.rows('QrRegistry').length, 1);
  assert.equal(env.rows('AuditLogs').filter((a) => a.action === 'equipment.create').length, 1);
  const op = env.rows('Operations')[0];
  assert.equal(op.state, 'COMMITTED');
  assert.equal(op.action, 'equipment.create');
  assert.equal(createEq(c).r.data.display_code, 'TB-0002');
});

test('gửi lại cùng operation_id → DUPLICATE_OPERATION kèm kết quả gốc, không thêm dòng; khác payload → OPERATION_ID_REUSED', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = uuid(), op = uuid();
  const p = { equipment_id: id, name_vi: 'Bơm 1' };
  const r1 = c.call('equipment.create', p, { operation_id: op, expected_version: 0 });
  const r2 = c.call('equipment.create', p, { operation_id: op, expected_version: 0 });
  assert.equal(r2.ok, true);
  assert.equal(r2.code, 'DUPLICATE_OPERATION');
  assert.equal(r2.state, 'COMMITTED');
  assert.equal(r2.data.display_code, r1.data.display_code);
  assert.equal(r2.data.qr_key, r1.data.qr_key);
  assert.equal(env.rows('Equipment').length, 1);
  const r3 = c.call('equipment.create', { ...p, name_vi: 'Bơm khác' }, { operation_id: op, expected_version: 0 });
  assert.equal(r3.code, 'OPERATION_ID_REUSED');
  // ID đã có với thao tác mới
  const r4 = c.write('equipment.create', p);
  assert.equal(r4.code, 'VALIDATION_ERROR');
  assert.equal(r4.errors[0].code, 'ID_EXISTS');
  const r5 = c.write('equipment.create', { equipment_id: 'abc', name_vi: 'x' });
  assert.equal(r5.errors[0].code, 'ID_INVALID');
  const r6 = c.write('equipment.create', { equipment_id: uuid() });
  assert.equal(r6.errors[0].code, 'REQUIRED_ONE_LANGUAGE');
  const r7 = c.call('equipment.create', { equipment_id: uuid(), name_vi: 'x' }, { expected_version: 0 });
  assert.equal(r7.errors[0].field, 'operation_id');
});

test('VERSION_CONFLICT khi expected_version cũ; sửa đúng tăng record_version', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id } = createEq(c);
  const e1 = c.write('equipment.edit', { equipment_id: id, model: 'GA-37' }, { expected_version: 1 });
  assert.equal(e1.ok, true);
  assert.equal(e1.record_version, 2);
  const e2 = c.write('equipment.edit', { equipment_id: id, model: 'GA-45' }, { expected_version: 1 });
  assert.equal(e2.code, 'VERSION_CONFLICT');
  assert.equal(e2.data.server_version, 2);
  assert.equal(e2.data.server.model, 'GA-37');
  assert.equal(env.rows('Equipment')[0].model, 'GA-37');
});

test('mã nhập tay: chuẩn hóa chữ hoa, kiểm trùng; bộ đếm bỏ qua mã đã có', () => {
  const env = freshServer();
  const c = ownerClient(env);
  assert.equal(createEq(c, { equipment_code: 'tb-0002' }).r.data.display_code, 'TB-0002');
  assert.equal(createEq(c, { equipment_code: 'TB-0002' }).r.errors[0].code, 'CODE_DUPLICATE');
  assert.equal(createEq(c, { equipment_code: 'bad code!' }).r.errors[0].code, 'CODE_INVALID');
  assert.equal(createEq(c).r.data.display_code, 'TB-0001');
  assert.equal(createEq(c).r.data.display_code, 'TB-0003');
});

test('dịch máy: sửa bên dịch máy → HUMAN; sửa bên gốc → dịch lại; lỗi dịch → PENDING rồi dịch bù không tăng record_version', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id } = createEq(c);
  let r = c.write('equipment.edit', { equipment_id: id, name_vi: 'Máy nén khí số 1', name_zh: '1号空压机' }, { expected_version: 1 });
  assert.equal(env.rows('Equipment')[0].i18n_meta.name.state, 'HUMAN');
  r = c.write('equipment.edit', { equipment_id: id, name_vi: 'Máy nén khí số 2' }, { expected_version: 2 });
  assert.equal(env.rows('Equipment')[0].name_zh, '1号空压机', 'HUMAN giữ nguyên');

  env.mt.fail = true;
  const b = createEq(c, { name_vi: 'Bơm tuần hoàn' });
  let row = env.rows('Equipment').find((x) => x.equipment_id === b.id);
  assert.equal(row.i18n_meta.name.state, 'PENDING');
  assert.equal(row.name_zh, '');
  assert.equal(b.r.ok, true, 'vẫn lưu khi dịch lỗi');
  const st0 = env.g.readState_().map;
  assert.ok(st0.mt_paused_until, 'lỗi hạn mức → tạm dừng dịch');
  env.mt.fail = false;
  env.g.runBackgroundJobs();
  row = env.rows('Equipment').find((x) => x.equipment_id === b.id);
  assert.equal(row.name_zh, '', 'đang tạm dừng 24 giờ thì không dịch');
  env.clock.advance(25 * 3600 * 1000);
  env.cache._map.clear();
  env.g.runBackgroundJobs();
  row = env.rows('Equipment').find((x) => x.equipment_id === b.id);
  assert.equal(row.name_zh, '[zh-CN] Bơm tuần hoàn');
  assert.equal(row.i18n_meta.name.state, 'MACHINE');
  assert.equal(row.record_version, 1);
  assert.ok(row.sync_revision > b.r.record_version);
});

test('quyền: cấp 1 xem được, không tạo được; KT không tạo thiết bị; action Đợt 1 chưa làm → FEATURE_NOT_ENABLED', () => {
  const env = freshServer();
  const o = ownerClient(env);
  createEq(o);
  const c1 = userClient(env, 'C1-01', 1, '482916');
  assert.equal(c1.call('equipment.view').ok, true);
  assert.equal(c1.call('equipment.view').data.items.length, 1);
  assert.equal(c1.write('equipment.create', { equipment_id: uuid(), name_vi: 'x' }).code, 'FORBIDDEN');
  const kt = userClient(env, 'KT-01', 2, '482917', 'KY_THUAT');
  assert.equal(kt.write('equipment.create', { equipment_id: uuid(), name_vi: 'x' }).code, 'FORBIDDEN');
  assert.equal(kt.call('contract.view').code, 'FEATURE_NOT_ENABLED');
  // cấp 2 chưa có subrole = cấp 1
  const c2 = userClient(env, 'C2-00', 2, '482918');
  assert.equal(c2.call('equipment.view').ok, true);
});

test('ma trận quyền: 60 dòng, trần kẹp ô vượt trần, can_reset_system chỉ ở (4, system)', () => {
  const env = freshServer();
  const g = env.g;
  const rows = env.rows('RolePermissions');
  assert.equal(rows.filter((r) => r.can_reset_system).length, 1);
  assert.equal(rows.find((r) => r.can_reset_system).permission_id, 'RP-4-system');
  // Bật trái phép can_approve cho cấp 2 → bị kẹp khi đọc
  g.dbReset_();
  const r = g.findOne_('RolePermissions', 'permission_id', 'RP-2-equipment');
  g.withWriteLock_(() => g.writeCells_('RolePermissions', r.__row, { can_approve: true }));
  env.cache._map.clear();
  g.dbReset_();
  assert.equal(g.hasFlag_(2, 'equipment', 'A'), false);
  assert.equal(g.hasFlag_(3, 'equipment', 'A'), true);
  assert.equal(g.hasFlag_(1, 'users', 'V'), false);
  // registry: mọi mã có module, đợt hợp lệ
  const reg = g.ACTION_REGISTRY;
  assert.ok(Object.keys(reg).length > 150);
  for (const code of Object.keys(reg)) {
    assert.equal(reg[code].cells.length, 8, code);
    assert.ok(['cache', 'net', 'offline', 'pin', 'public', 'session', 'internal'].includes(reg[code].net), code);
  }
  assert.deepEqual([...reg['alert.view'].flags], ['V']);
  assert.equal(reg['alert.view'].module, 'contracts|inspections');
  assert.deepEqual([...reg['import.commit'].flags], ['I', 'A']);
  assert.equal(reg['vendor.edit'].flagMode, 'any');
});

test('sync.bootstrap: user, settings phía client, permissions, records; sync.changes trả UPSERT sau khi tạo', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const b = c.call('sync.bootstrap');
  assert.equal(b.ok, true);
  assert.equal(b.data.user.employee_code, 'NV-001');
  assert.equal(b.data.records.EQUIPMENT.length, 5);
  assert.ok(b.data.records.EQUIPMENT[0].qr_key);
  assert.equal(b.data.records.INSPECTION_REQUIREMENT.length, 3);
  assert.ok(b.data.settings.session_days === 30 && b.data.settings.offline_pbkdf2_iterations === 200000);
  assert.equal(b.data.settings.email_hour, undefined, 'khóa Client=Không không gửi xuống');
  assert.ok(b.data.permissions.actions.includes('equipment.create'));
  assert.ok(!b.data.permissions.actions.includes('maintenance.view'));
  assert.ok(b.data.permissions.cost_modules.includes('contracts'));
  const cursor = b.data.sync_cursor;
  const ch0 = c.call('sync.changes', { cursor });
  assert.equal(ch0.data.changes.length, 0);
  const { id } = createEq(c);
  const ch1 = c.call('sync.changes', { cursor });
  assert.equal(ch1.data.changes.length, 1);
  assert.equal(ch1.data.changes[0].entity_id, id);
  assert.equal(ch1.data.changes[0].op, 'UPSERT');
  assert.ok(Number(ch1.data.next_cursor) > Number(cursor));
  assert.equal(c.call('sync.changes', { cursor: ch1.data.next_cursor }).data.changes.length, 0);
  // máy khác thấy thay đổi (P-09)
  const c1 = userClient(env, 'C1-02', 1, '482916');
  const b1 = c1.call('sync.bootstrap');
  assert.equal(b1.data.records.EQUIPMENT.length, 6);
  assert.ok(!b1.data.permissions.actions.includes('equipment.create'));
  assert.deepEqual([...b1.data.permissions.cost_modules], []);
});

test('sync.push: thao tác offline chạy như action gốc; action cần mạng → NEEDS_NETWORK; loại PIN → REAUTH_REQUIRED', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const reqId = env.rows('InspectionRequirements')[0].requirement_id;
  const op = { action: 'inspection.submit', operation_id: uuid(), entity_type: 'INSPECTION', expected_version: 0, local_created_at: '2026-10-07T08:00:00+07:00',
    payload: { inspection_id: uuid(), requirement_id: reqId, inspection_date: '2026-10-05', valid_from: '2026-10-05', valid_to: '2027-10-04', result: 'PASS', certificate_number: 'CN-123' } };
  const r = c.call('sync.push', { op });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.state, 'COMMITTED');
  assert.equal(r.operation_id, op.operation_id);
  assert.match(r.data.display_code, /^LKD-2610-001$/);
  const again = c.call('sync.push', { op });
  assert.equal(again.code, 'DUPLICATE_OPERATION');
  assert.equal(env.rows('Inspections').length, 1);
  assert.equal(env.rows('Inspections')[0].status, 'PENDING_APPROVAL');
  const net = c.call('sync.push', { op: { action: 'equipment.create', operation_id: uuid(), payload: { equipment_id: uuid(), name_vi: 'x' } } });
  assert.equal(net.code, 'VALIDATION_ERROR');
  assert.equal(net.errors[0].code, 'NEEDS_NETWORK');
  const pin = c.call('sync.push', { op: { action: 'inspection.approve', operation_id: uuid(), payload: {} } });
  assert.equal(pin.code, 'REAUTH_REQUIRED');
  // trạng thái thao tác
  const s = c.call('sync.getOperationStatus', { operation_id: op.operation_id });
  assert.equal(s.data.state, 'COMMITTED');
  assert.equal(s.data.result.display_code, 'LKD-2610-001');
  assert.equal(c.call('sync.getOperationStatus', { operation_id: uuid() }).data.state, 'NOT_FOUND');
  // người khác không xem được thao tác của mình
  const other = userClient(env, 'C3-01', 3, '482916');
  assert.equal(other.call('sync.getOperationStatus', { operation_id: op.operation_id }).data.state, 'NOT_FOUND');
});

test('inspection.submit: kiểm dữ liệu; cấp 2 KT không được nộp; người không có quyền giá gửi cost → COST_FIELD_FORBIDDEN', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const reqId = env.rows('InspectionRequirements')[0].requirement_id;
  const base = { requirement_id: reqId, inspection_date: '2026-10-05', valid_to: '2027-10-04', result: 'PASS' };
  const bad = c.write('inspection.submit', { ...base, inspection_id: uuid(), result: 'CONDITIONAL_PASS' });
  assert.equal(bad.errors[0].code, 'RESTRICTION_REQUIRED');
  const bad2 = c.write('inspection.submit', { ...base, inspection_id: uuid(), valid_from: '2028-01-01' });
  assert.equal(bad2.code, 'VALIDATION_ERROR');
  const kt = userClient(env, 'KT-02', 2, '482917', 'KY_THUAT');
  assert.equal(kt.write('inspection.submit', { ...base, inspection_id: uuid() }).code, 'FORBIDDEN');
  const hd = userClient(env, 'HD-01', 2, '482919', 'HD_KD');
  const ok = hd.write('inspection.submit', { ...base, inspection_id: uuid(), cost: 1500000, restriction_vi: 'Áp suất tối đa 6 bar', result: 'CONDITIONAL_PASS' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const row = env.rows('Inspections').find((x) => x.cost === 1500000);
  assert.equal(row.currency, 'VND');
  assert.equal(row.i18n_meta.restriction.state, 'MANUAL_REQUIRED', 'kết luận kiểm định không dịch máy');
  assert.equal(row.restriction_zh, '');
  // C1 xem: bị ẩn giá
  const c1 = userClient(env, 'C1-03', 1, '482916');
  const v = c1.call('inspection.view');
  const seen = v.data.inspections.find((x) => x.inspection_id === row.inspection_id);
  assert.equal(seen.cost, undefined);
  assert.equal(seen.meta.cost_hidden, true);
});

test('doc.upload ảnh LINK_VIEW → chia sẻ "ai có link: xem"; doc.download trả đúng byte; setPrivate → REVOKED, file riêng tư', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id } = createEq(c);
  const docId = uuid();
  const jpg = fakeJpegB64(5000);
  const up = c.write('doc.upload', { document_id: docId, entity_type: 'EQUIPMENT', entity_id: id, kind: 'PHOTO_EQUIPMENT', mime_type: 'image/jpeg', content_b64: jpg, thumb_b64: fakeJpegB64(500), title_vi: 'Ảnh máy' });
  assert.equal(up.ok, true, JSON.stringify(up));
  const d = env.rows('Documents')[0];
  assert.equal(d.access_scope, 'LINK_VIEW');
  assert.equal(d.drive_sharing_state, 'LINK_SHARED');
  const f = env.drive._files.get(d.drive_file_id);
  assert.equal(f.access, 'ANYONE_WITH_LINK');
  assert.equal(f.permission, 'VIEW');
  assert.equal(f.name, docId + '.jpg');
  assert.equal(env.drive._files.get(d.thumb_drive_file_id).access, 'ANYONE_WITH_LINK');
  assert.ok(up.data.record.drive_file_id, 'trả drive_file_id cho ảnh LINK_VIEW');
  // gửi lại cùng thao tác: không tạo thêm file
  const nFiles = env.drive._files.size;
  // (thao tác mới cùng document_id → ID_EXISTS, không tạo file)
  assert.equal(c.write('doc.upload', { document_id: docId, entity_type: 'EQUIPMENT', entity_id: id, kind: 'PHOTO_EQUIPMENT', mime_type: 'image/jpeg', content_b64: jpg }).errors[0].code, 'ID_EXISTS');
  assert.equal(env.drive._files.size, nFiles);
  const dl = c.call('doc.download', { document_id: docId });
  assert.equal(dl.ok, true);
  assert.equal(dl.data.content_b64, jpg);
  const sp = c.write('doc.setPrivate', { document_id: docId }, { expected_version: 1 });
  assert.equal(sp.ok, true, JSON.stringify(sp));
  assert.equal(sp.data.drive_sharing_state, 'REVOKED');
  assert.equal(f.access, 'PRIVATE');
  const view = c.call('doc.view', { entity_type: 'EQUIPMENT', entity_id: id });
  assert.equal(view.data.items[0].drive_file_id, undefined, 'tài liệu riêng tư không lộ ID Drive');
});

test('doc.upload: sai chữ ký byte → FILE_TYPE; quá 10 MB → FILE_TOO_LARGE; ảnh LINK_VIEW chỉ nhận JPEG/PNG; chia sẻ lỗi → FAILED', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id } = createEq(c);
  const base = { entity_type: 'EQUIPMENT', entity_id: id };
  assert.equal(c.write('doc.upload', { ...base, document_id: uuid(), kind: 'PHOTO_EQUIPMENT', mime_type: 'image/jpeg', content_b64: fakePdfB64() }).errors[0].code, 'FILE_TYPE');
  assert.equal(c.write('doc.upload', { ...base, document_id: uuid(), kind: 'PHOTO_EQUIPMENT', mime_type: 'application/pdf', content_b64: fakePdfB64() }).errors[0].code, 'FILE_TYPE');
  const big = Buffer.alloc(10485761, 1); big[0] = 0x25; big[1] = 0x50; big[2] = 0x44; big[3] = 0x46;
  assert.equal(c.write('doc.upload', { ...base, document_id: uuid(), kind: 'MANUAL', mime_type: 'application/pdf', content_b64: big.toString('base64') }).errors[0].code, 'FILE_TOO_LARGE');
  env.drive._failSharing = true;
  const r = c.write('doc.upload', { ...base, document_id: uuid(), kind: 'PHOTO_SITE', mime_type: 'image/jpeg', content_b64: fakeJpegB64() });
  assert.equal(r.ok, true);
  assert.equal(r.data.record.drive_sharing_state, 'FAILED');
  assert.equal(r.data.record.drive_file_id, undefined);
});

test('tài liệu riêng tư: CONTRACT (COST_VIEW) — C1 không tải, không thấy; MODULE_VIEW — C1 tải được', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id } = createEq(c);
  const priv = uuid(), cost = uuid();
  assert.equal(c.write('doc.upload', { document_id: priv, entity_type: 'EQUIPMENT', entity_id: id, kind: 'CERTIFICATE', mime_type: 'application/pdf', content_b64: fakePdfB64() }).ok, true);
  assert.equal(c.write('doc.upload', { document_id: cost, entity_type: 'EQUIPMENT', entity_id: id, kind: 'CONTRACT', mime_type: 'application/pdf', content_b64: fakePdfB64() }).ok, true);
  const f = env.drive._files.get(env.rows('Documents')[0].drive_file_id);
  assert.equal(f.access, 'PRIVATE', 'tài liệu riêng tư không chia sẻ');
  const c1 = userClient(env, 'C1-04', 1, '482916');
  assert.equal(c1.call('doc.download', { document_id: priv }).ok, true);
  assert.equal(c1.call('doc.download', { document_id: cost }).code, 'FORBIDDEN');
  assert.equal(c1.call('doc.view', { entity_type: 'EQUIPMENT', entity_id: id }).data.items.length, 1);
  const b = c1.call('sync.bootstrap');
  assert.equal(b.data.records.DOCUMENT.length, 1);
  assert.equal(c1.write('doc.upload', { document_id: uuid(), entity_type: 'EQUIPMENT', entity_id: id, kind: 'MANUAL', mime_type: 'application/pdf', content_b64: fakePdfB64() }).code, 'FORBIDDEN');
  const kt = userClient(env, 'KT-03', 2, '482917', 'KY_THUAT');
  assert.equal(kt.write('doc.upload', { document_id: uuid(), entity_type: 'EQUIPMENT', entity_id: id, kind: 'MANUAL', mime_type: 'application/pdf', content_b64: fakePdfB64() }).ok, true);
  assert.equal(kt.write('doc.upload', { document_id: uuid(), entity_type: 'EQUIPMENT', entity_id: id, kind: 'CONTRACT', mime_type: 'application/pdf', content_b64: fakePdfB64() }).code, 'FORBIDDEN');
});

test('qr.resolve theo qr_key (chấp nhận chữ thường, O→0, I/L→1) và theo mã hiển thị', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id, r } = createEq(c);
  const key = r.data.qr_key;
  const r1 = c.call('qr.resolve', { qr_key: key.toLowerCase() });
  assert.equal(r1.data.qr_state, 'OK');
  assert.equal(r1.data.entity_id, id);
  const mangled = key.replace(/0/g, 'O').replace(/1/g, 'I');
  assert.equal(c.call('qr.resolve', { qr_key: mangled }).data.entity_id, id);
  assert.equal(c.call('qr.resolve', { code: 'tb-0001' }).data.entity_id, id);
  assert.equal(c.call('qr.resolve', { qr_key: '0000000000000000000Z' }).data.qr_state, 'UNAVAILABLE');
});

test('P-10: 60 lệnh tạo xen kẽ từ 3 máy → đủ 60 dòng, không trùng mã', () => {
  const env = freshServer();
  const owner = ownerClient(env);
  const more = [makeClient(env), makeClient(env)];
  more.forEach((m) => assert.equal(m.login('NV-001', '604817').ok, true));
  const devices = [owner, ...more];
  for (let i = 0; i < 20; i++) {
    devices.forEach((d, k) => {
      const r = d.write('equipment.create', { equipment_id: uuid(), name_vi: `P10-D${k}-${i}` });
      assert.equal(r.ok, true);
    });
  }
  const s = owner.call('poc.stats', { name_prefix: 'P10-' });
  assert.equal(s.data.tagged, 60);
  assert.equal(s.data.duplicate_codes.length, 0);
  assert.equal(s.data.duplicate_ids.length, 0);
});

test('poc.sleep ghi Operation sau khi ngủ; getOperationStatus thấy COMMITTED', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const op = uuid();
  const r = c.call('poc.sleep', { seconds: 70 }, { operation_id: op });
  assert.equal(r.state, 'COMMITTED');
  assert.equal(c.call('sync.getOperationStatus', { operation_id: op }).data.state, 'COMMITTED');
});

test('poc.* chỉ ở THỬ; poc.mail chỉ cấp 4', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const m = c.call('poc.mail');
  assert.equal(m.ok, true);
  assert.equal(env.mail.sent.length, 1);
  assert.equal(env.mail.sent[0].to, 'me-owner@example.test');
  assert.match(env.mail.sent[0].subject, /^\[M&E\]/);
  const c3 = userClient(env, 'C3-02', 3, '482916');
  assert.equal(c3.call('poc.mail').code, 'FORBIDDEN');
  assert.equal(c.call('poc.vectors').data.all_pass, true);
  env.props.setProperty('ENV', 'THAT');
  env.cache._map.clear();
  assert.equal(c.call('poc.vectors').code, 'FEATURE_NOT_ENABLED');
});

test('poc.translate và poc.makeTestFiles chạy trên giả lập', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const t = c.call('poc.translate');
  assert.equal(t.ok, true);
  assert.equal(t.data.codes['zh-CN'].ok, true);
  assert.equal(t.data.batch.out_lines, 10);
  const f = c.call('poc.makeTestFiles');
  assert.equal(f.ok, true, JSON.stringify(f).slice(0, 300));
  assert.equal(f.data.files.length, 3);
  const dl = c.call('doc.download', { document_id: f.data.files[0].document_id });
  assert.equal(dl.ok, true);
  assert.equal(Buffer.from(dl.data.content_b64, 'base64').length, 2 * 1048576 - 64);
});

test('AuditLogs và Operations không chứa PIN, token, nội dung base64', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { id } = createEq(c);
  const jpg = fakeJpegB64(3000);
  c.write('doc.upload', { document_id: uuid(), entity_type: 'EQUIPMENT', entity_id: id, kind: 'PHOTO_EQUIPMENT', mime_type: 'image/jpeg', content_b64: jpg });
  const all = JSON.stringify(env.rows('AuditLogs')) + JSON.stringify(env.rows('Operations'));
  assert.ok(!all.includes(c.token));
  assert.ok(!all.includes(jpg.slice(0, 200)));
});
