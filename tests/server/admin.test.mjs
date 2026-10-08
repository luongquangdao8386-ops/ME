import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, makeClient, uuid, OWNER_PIN } from '../helpers.mjs';

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  c.pin = (action, payload, extra = {}) => c.write(action, payload, { reauth_token: c.reauth(), ...extra });
  return { env, c };
}
const userRow = (env, code) => env.rows('Users').find((u) => u.employee_code === code);

test('user.create: PIN tạm 6 số trả một lần; không nằm trong Operations/AuditLogs; gửi lại cùng operation_id không trả PIN; đăng nhập bằng PIN tạm → MUST_CHANGE_PIN', () => {
  const { env, c } = setup();
  const uid = uuid(), op = uuid();
  const payload = { user_id: uid, employee_code: 'nv-102', display_name: 'Nguyễn Văn B', role_level: 2, subroles: ['KY_THUAT'] };
  const rt = c.reauth();
  const r = c.call('user.create', payload, { operation_id: op, expected_version: 0, reauth_token: rt });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.data.temp_pin, /^\d{6}$/);
  const pin = r.data.temp_pin;
  const again = c.call('user.create', payload, { operation_id: op, expected_version: 0, reauth_token: rt });
  assert.equal(again.code, 'DUPLICATE_OPERATION');
  assert.equal(again.data.temp_pin, undefined, 'gửi lại không trả PIN');
  const opsJson = JSON.stringify(env.rows('Operations'));
  assert.ok(!opsJson.includes(pin) && !opsJson.includes('pin_hash'), 'Operations không có PIN/hash');
  assert.ok(!JSON.stringify(env.rows('AuditLogs')).includes(pin));
  const u = userRow(env, 'NV-102');
  assert.equal(u.must_change_pin, true);
  assert.equal(env.rows('UserScopes').filter((s) => s.user_id === uid && s.active).map((s) => s.subrole).join(), 'KY_THUAT');
  const nc = makeClient(env);
  assert.equal(nc.login('NV-102', pin).code, 'MUST_CHANGE_PIN');
  // Lỗi: trùng mã, cấp 2 thiếu subrole, cấp 3 có subrole
  assert.equal(c.pin('user.create', { ...payload, user_id: uuid() }).errors[0].code, 'CODE_DUPLICATE');
  assert.equal(c.pin('user.create', { user_id: uuid(), employee_code: 'NV-103', display_name: 'X', role_level: 2, subroles: [] }).errors[0].field, 'subroles');
  assert.equal(c.pin('user.create', { user_id: uuid(), employee_code: 'NV-104', display_name: 'X', role_level: 3, subroles: ['HD_KD'] }).errors[0].field, 'subroles');
  // C3 không tạo được; C4 không có PIN → REAUTH_REQUIRED
  const c3 = userClient(env, 'U-C3', 3, '694127');
  assert.equal(c3.write('user.create', { ...payload, user_id: uuid(), employee_code: 'NV-109' }).code, 'FORBIDDEN');
  assert.equal(c.write('user.create', { ...payload, user_id: uuid(), employee_code: 'NV-110' }).code, 'REAUTH_REQUIRED');
});

test('user.view: C3 không thấy email/lịch sử đăng nhập; không ai nhận pin_hash/salt; C2 FORBIDDEN', () => {
  const { env, c } = setup();
  assert.equal(c.pin('user.create', { user_id: uuid(), employee_code: 'NV-201', display_name: 'B', email: 'b@example.test', role_level: 1 }).ok, true);
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const v3 = c3.call('user.view', {});
  assert.equal(v3.ok, true, JSON.stringify(v3));
  const s3 = JSON.stringify(v3.data);
  assert.ok(!s3.includes('b@example.test') && !s3.includes('pin_hash') && !s3.includes('salt') && !s3.includes('last_login_at'));
  const v4 = c.call('user.view', {});
  assert.equal(v4.data.items.find((u) => u.employee_code === 'NV-201').email, 'b@example.test');
  assert.ok(!JSON.stringify(v4.data).includes('pin_hash'));
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  assert.equal(kt.call('user.view', {}).code, 'FORBIDDEN');
});

test('user.setRole/lock/unlock/resetPin/revokeSessions: tăng auth_version (trừ unlock), phiên cũ hết hiệu lực; không tự thao tác; không động owner', () => {
  const { env, c } = setup();
  const b = userClient(env, 'U-B', 2, '583016', 'KY_THUAT');
  const bid = userRow(env, 'U-B').user_id;
  assert.equal(b.call('account.view', {}).ok, true);
  // Đổi cấp
  const r = c.pin('user.setRole', { user_id: bid, role_level: 2, subroles: ['HD_KD', 'THU_KHO'] }, { expected_version: 1 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(b.call('account.view', {}).code, 'AUTH_REQUIRED', 'phiên cũ hết hiệu lực');
  assert.deepEqual(env.rows('UserScopes').filter((s) => s.user_id === bid && s.active).map((s) => s.subrole).sort(), ['HD_KD', 'THU_KHO']);
  const b2 = makeClient(env); assert.equal(b2.login('U-B', '583016').ok, true);
  assert.deepEqual(b2.call('account.view', {}).data.subroles.sort(), ['HD_KD', 'THU_KHO']);
  // VERSION_CONFLICT không lộ hash
  const vc = c.pin('user.setRole', { user_id: bid, role_level: 1, subroles: [] }, { expected_version: 1 });
  assert.equal(vc.code, 'VERSION_CONFLICT');
  assert.ok(!JSON.stringify(vc).includes('pin_hash'));
  // Không tự thao tác; không động owner
  const ownerId = userRow(env, 'NV-001').user_id;
  assert.equal(c.pin('user.lock', { user_id: ownerId, reason: 'x' }, { expected_version: userRow(env, 'NV-001').record_version }).errors[0].code, 'SELF_ACTION');
  const adminId = uuid();
  const cr = c.pin('user.create', { user_id: adminId, employee_code: 'U-AD', display_name: 'Quản trị 2', role_level: 4 });
  const ad = makeClient(env);
  ad.login('U-AD', cr.data.temp_pin);
  const adTok = ad.call('pin.change', { current_pin: cr.data.temp_pin, new_pin: '715382' });
  ad.token = adTok.data.token;
  const adRt = ad.call('auth.reauth', { pin: '715382' }).data.reauth_token;
  assert.equal(ad.write('user.lock', { user_id: ownerId, reason: 'x' }, { expected_version: userRow(env, 'NV-001').record_version, reauth_token: adRt }).code, 'FORBIDDEN');
  // Khóa: cần lý do, phiên bị thu hồi, không đăng nhập được
  let ver = userRow(env, 'U-B').record_version;
  assert.equal(c.pin('user.lock', { user_id: bid }, { expected_version: ver }).errors[0].field, 'reason');
  assert.equal(c.pin('user.lock', { user_id: bid, reason: 'Nghỉ việc' }, { expected_version: ver }).ok, true);
  assert.equal(b2.call('account.view', {}).code, 'AUTH_REQUIRED');
  assert.notEqual(makeClient(env).login('U-B', '583016').ok, true);
  // Mở khóa: không tăng auth_version, xóa khóa do sai PIN
  const avBefore = userRow(env, 'U-B').auth_version;
  ver = userRow(env, 'U-B').record_version;
  assert.equal(c.pin('user.unlock', { user_id: bid }, { expected_version: ver }).ok, true);
  assert.equal(userRow(env, 'U-B').auth_version, avBefore);
  const x = makeClient(env);
  for (let i = 0; i < 5; i++) x.login('U-B', '111222');
  assert.equal(x.login('U-B', '583016').code, 'PIN_LOCKED');
  ver = userRow(env, 'U-B').record_version;
  assert.equal(c.pin('user.unlock', { user_id: bid }, { expected_version: ver }).ok, true);
  const b3 = makeClient(env);
  assert.equal(b3.login('U-B', '583016').ok, true);
  // Cấp lại PIN: PIN cũ hết dùng, PIN tạm → MUST_CHANGE_PIN
  ver = userRow(env, 'U-B').record_version;
  const rp = c.pin('user.resetPin', { user_id: bid }, { expected_version: ver });
  assert.equal(rp.ok, true, JSON.stringify(rp));
  assert.match(rp.data.temp_pin, /^\d{6}$/);
  assert.equal(b3.call('account.view', {}).code, 'AUTH_REQUIRED');
  assert.notEqual(makeClient(env).login('U-B', '583016').ok, true);
  assert.equal(makeClient(env).login('U-B', rp.data.temp_pin).code, 'MUST_CHANGE_PIN');
  assert.ok(!JSON.stringify(env.rows('AuditLogs')).includes(rp.data.temp_pin));
  // Thu hồi phiên
  const b4 = userClient(env, 'U-D', 1, '482915');
  const did = userRow(env, 'U-D').user_id;
  assert.equal(c.pin('user.revokeSessions', { user_id: did }, { expected_version: 1 }).ok, true);
  assert.equal(b4.call('account.view', {}).code, 'AUTH_REQUIRED');
});

test('danh mục: khu vực (C4, mã KV-001, chống vòng cha–con), nhà cung cấp (HĐ), LookupValues SPEC_KEY dùng được ở thông số; C3 không sửa khu vực', () => {
  const { env, c } = setup();
  const a = uuid(), b = uuid();
  const ra = c.write('location.edit', { location_id: a, name_vi: 'Xưởng A', type: 'WORKSHOP' });
  assert.equal(ra.ok, true, JSON.stringify(ra));
  assert.equal(ra.data.display_code, 'KV-001');
  assert.equal(c.write('location.edit', { location_id: b, location_code: 'kv-kho', name_vi: 'Kho', parent_location_id: a }).data.display_code, 'KV-KHO');
  assert.equal(c.write('location.edit', { location_id: a, parent_location_id: b }, { expected_version: 1 }).errors[0].field, 'parent_location_id');
  assert.equal(c.write('location.edit', { location_id: a, location_code: 'KV-999' }, { expected_version: 1 }).errors[0].field, 'location_code');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  assert.equal(c3.write('location.edit', { location_id: uuid(), name_vi: 'X' }).code, 'FORBIDDEN');
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const v = hd.write('vendor.edit', { vendor_id: uuid(), name: 'Công ty Kiểm định ABC', services_vi: 'Kiểm định thiết bị nâng', email: 'KD@abc.test' });
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.data.display_code, 'NCC-0001');
  assert.equal(env.rows('Vendors')[0].email, 'kd@abc.test');
  assert.equal(env.rows('Vendors')[0].i18n_meta.services.state, 'MACHINE');
  // LookupValues
  assert.equal(c3.write('lookup.edit', { value_id: uuid(), group_key: 'SPEC_KEY', code: 'Toc Do', name_vi: 'Tốc độ' }).errors[0].code, 'CODE_INVALID');
  assert.equal(c3.write('lookup.edit', { value_id: uuid(), group_key: 'SPEC_KEY', code: 'voltage', name_vi: 'Điện áp' }).errors[0].code, 'CODE_DUPLICATE');
  const lk = c3.write('lookup.edit', { value_id: uuid(), group_key: 'SPEC_KEY', code: 'belt_speed', name_vi: 'Tốc độ băng tải', name_zh: '输送带速度' });
  assert.equal(lk.ok, true, JSON.stringify(lk));
  assert.equal(c3.write('lookup.edit', { value_id: uuid(), group_key: 'SPEC_KEY', code: 'belt_speed', name_vi: 'X' }).errors[0].code, 'CODE_DUPLICATE');
  assert.equal(hd.write('lookup.edit', { value_id: uuid(), group_key: 'UNIT', code: 'm/s', name_vi: 'mét/giây' }).code, 'FORBIDDEN');
  assert.equal(c3.write('lookup.edit', { value_id: uuid(), group_key: 'UNIT', code: 'm/s', name_vi: 'mét/giây', name_zh: '米/秒' }).ok, true);
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Băng tải' }).ok, true);
  const sp = c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: eq, spec_key: 'belt_speed', value_num: 1.5, unit: 'm/s' });
  assert.equal(sp.ok, true, JSON.stringify(sp));
  // Đồng bộ thấy khu vực mới
  const boot = hd.call('sync.bootstrap', {});
  assert.ok(boot.data.records.LOCATION.some((l) => l.location_code === 'KV-KHO'));
});

test('Glossary: chưa duyệt không dùng; đã duyệt → cả chuỗi lấy từ điển (GLOSSARY, không nhãn dịch máy); chứa thuật ngữ → giữ bằng token khi dịch', () => {
  const { env, c } = setup();
  const g = uuid();
  const r = c.write('glossary.edit', { glossary_id: g, term_vi: 'Máy nén khí', term_zh: '空压机', note: 'Thiết bị khí nén' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const e1 = uuid();
  c.write('equipment.create', { equipment_id: e1, name_vi: 'Máy nén khí' });
  let row = env.rows('Equipment').find((x) => x.equipment_id === e1);
  assert.equal(row.i18n_meta.name.state, 'MACHINE', 'chưa duyệt: dịch máy thường');
  assert.equal(c.write('glossary.edit', { glossary_id: g, approve: true }, { expected_version: 1 }).ok, true);
  const e2 = uuid();
  c.write('equipment.create', { equipment_id: e2, name_vi: '  máy  NÉN khí ' });
  row = env.rows('Equipment').find((x) => x.equipment_id === e2);
  assert.equal(row.name_zh, '空压机');
  assert.equal(row.i18n_meta.name.state, 'GLOSSARY');
  const e3 = uuid();
  c.write('equipment.create', { equipment_id: e3, name_vi: 'Máy nén khí số 2 TB-0007 công suất 15 kW' });
  row = env.rows('Equipment').find((x) => x.equipment_id === e3);
  assert.match(row.name_zh, /空压机/);
  assert.match(row.name_zh, /TB-0007/);
  assert.match(row.name_zh, /15 kW/);
  assert.ok(!row.name_zh.includes('⟦'));
  // Trùng thuật ngữ đang dùng
  assert.equal(c.write('glossary.edit', { glossary_id: uuid(), term_vi: 'MÁY NÉN KHÍ', term_zh: '压缩机' }).errors[0].code, 'CODE_DUPLICATE');
  // Sửa thuật ngữ → bỏ duyệt
  assert.equal(c.write('glossary.edit', { glossary_id: g, term_zh: '空气压缩机' }, { expected_version: 2 }).ok, true);
  assert.equal(env.rows('Glossary')[0].approved_by, '');
});

test('i18n.retranslate: trường PENDING (dịch lỗi) → dịch lại khi có quyền sửa, không tăng record_version; i18n.suggest không lưu', () => {
  const { env, c } = setup();
  env.props.setProperty('TEST_MT_FAIL', 'true');
  const e = uuid();
  c.write('equipment.create', { equipment_id: e, name_vi: 'Quạt hút' });
  let row = env.rows('Equipment')[0];
  assert.equal(row.i18n_meta.name.state, 'PENDING');
  env.props.setProperty('TEST_MT_FAIL', 'false');
  const kt1 = userClient(env, 'U-C1', 1, '482915');
  assert.equal(kt1.call('i18n.retranslate', { entity_type: 'EQUIPMENT', entity_id: e }, { operation_id: uuid() }).code, 'FORBIDDEN');
  const r = c.call('i18n.retranslate', { entity_type: 'EQUIPMENT', entity_id: e }, { operation_id: uuid() });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.translated, ['name']);
  row = env.rows('Equipment')[0];
  assert.equal(row.i18n_meta.name.state, 'MACHINE');
  assert.equal(row.record_version, 1);
  const s = c.call('i18n.suggest', { module: 'inspections', text: 'Biên bản kiểm định', from: 'vi' });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.match(s.data.text, /Biên bản kiểm định/);
  assert.equal(kt1.call('i18n.suggest', { module: 'inspections', text: 'x', from: 'vi' }).code, 'FORBIDDEN');
});

test('nhật ký: audit.own của mình; audit.view C3 không thấy users/system; audit.auth cần PIN, không có mã băm/token', () => {
  const { env, c } = setup();
  c.pin('user.create', { user_id: uuid(), employee_code: 'NV-301', display_name: 'C', role_level: 1 });
  c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Bơm nước' });
  const own = c.call('audit.own', {});
  assert.ok(own.data.items.some((a) => a.action === 'equipment.create'));
  assert.ok(own.data.operations.length >= 2);
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const v3 = c3.call('audit.view', {});
  assert.equal(v3.ok, true, JSON.stringify(v3));
  assert.ok(v3.data.items.some((a) => a.action === 'equipment.create'));
  assert.ok(!v3.data.items.some((a) => a.action.startsWith('user.')));
  const v4 = c.call('audit.view', { module: 'users' });
  assert.ok(v4.data.items.some((a) => a.action === 'user.create'));
  assert.equal(c.call('audit.auth', {}).code, 'REAUTH_REQUIRED');
  const au = c.call('audit.auth', {}, { reauth_token: c.reauth() });
  assert.equal(au.ok, true, JSON.stringify(au));
  assert.ok(au.data.attempts.length > 0 && au.data.sessions.length > 0);
  const s = JSON.stringify(au.data);
  assert.ok(!s.includes('token_hash') && !s.includes('employee_code_hash'));
  assert.equal(c3.call('audit.auth', {}, { reauth_token: 'x' }).code, 'FORBIDDEN');
});

test('settings.edit: C4 + PIN; khóa chỉ đọc (mốc A7, lead_days, kho) bị từ chối; kiểm khoảng; đổi giờ sao lưu cài lại trigger; ngoại lệ tự duyệt chỉ nhận action duyệt', () => {
  const { env, c } = setup();
  env.g.installTriggers();
  const call = (changes) => c.call('settings.edit', { changes, reason: 'thử' }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(call({ email_stages: '40,20' }).errors[0].field, 'email_stages');
  assert.equal(call({ lead_days: 30 }).errors[0].field, 'lead_days');
  assert.equal(call({ warehouse_connected: true }).errors[0].field, 'warehouse_connected');
  assert.equal(call({ offline_pbkdf2_iterations: 1000 }).errors[0].field, 'offline_pbkdf2_iterations');
  assert.equal(call({ self_approval_exceptions: [{ action_code: 'equipment.create' }] }).errors[0].field, 'self_approval_exceptions');
  const ok = call({ reauth_window_minutes: 10, backup_hour: 3, self_approval_exceptions: [{ action_code: 'part.approve' }] });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  env.g.dbReset_();
  assert.equal(env.g.setting_('reauth_window_minutes'), 10);
  assert.deepEqual(env.g.setting_('self_approval_exceptions'), [{ action_code: 'part.approve' }]);
  const t = env.g.ScriptApp.getProjectTriggers().find((x) => x.spec.fn === 'backupData' && x.spec.weekDay);
  assert.equal(t.spec.atHour, 3);
  const c3 = userClient(env, 'U-C3', 3, '694127');
  assert.equal(c3.call('settings.edit', { changes: { session_days: 10 } }, { operation_id: uuid(), reauth_token: 'x' }).code, 'FORBIDDEN');
  assert.ok(env.rows('AuditLogs').some((a) => a.action === 'settings.edit'));
});

test('permission.view/edit: C4 + PIN + lý do; trần chặn; ô khóa chặn; sửa hợp lệ → perm_version + 1, có hiệu lực ngay', () => {
  const { env, c } = setup();
  const pv = c.call('permission.view', {}, { reauth_token: c.reauth() });
  assert.equal(pv.ok, true, JSON.stringify(pv));
  assert.equal(pv.data.rows.length, 60);
  const edit = (changes, reason = 'Cho thủ kho sửa danh mục vật tư') => c.call('permission.edit', { changes, reason }, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(edit([{ role_level: 2, module: 'warehouse', flags: 'VIA' }]).errors[0].code, 'PERM_CEILING', 'cấp 2 không bao giờ có A');
  assert.equal(edit([{ role_level: 4, module: 'users', flags: 'V' }]).errors[0].code, 'PERM_LOCKED');
  assert.equal(edit([{ role_level: 2, module: 'warehouse', flags: 'VCEI' }], '').errors[0].field, 'reason');
  const tk = userClient(env, 'U-TK', 2, '583011', 'THU_KHO');
  assert.equal(tk.write('material.create', { material_id: uuid(), name_vi: 'Bu lông M10', base_unit: 'cái' }).code, 'FORBIDDEN');
  const r = edit([{ role_level: 2, module: 'warehouse', flags: 'VCEI' }]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.perm_version, 2);
  const m = tk.write('material.create', { material_id: uuid(), name_vi: 'Bu lông M10', base_unit: 'cái' });
  assert.equal(m.ok, true, JSON.stringify(m));
  assert.ok(env.rows('AuditLogs').some((a) => a.action === 'permission.edit' && a.reason));
});

test('sao lưu: backup.run tạo trigger chạy một lần (QUEUED); backupData chép 2 file + manifest VERIFIED; backup.view; giữ 8 bản VERIFIED', () => {
  const { env, c } = setup();
  env.g.installTriggers();
  c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy phát điện' });
  const run = c.call('backup.run', {}, { operation_id: uuid(), reauth_token: c.reauth() });
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(run.data.status, 'QUEUED');
  assert.equal(c.call('backup.run', {}, { operation_id: uuid(), reauth_token: c.reauth() }).data.already, true);
  const once = env.g.ScriptApp.getProjectTriggers().filter((t) => t.spec.fn === 'backupData' && t.spec.after);
  assert.equal(once.length, 1);
  const m = env.g.backupData();
  assert.equal(m.status, 'VERIFIED', JSON.stringify(m));
  assert.equal(m.counts.Equipment, 1);
  assert.equal(env.g.ScriptApp.getProjectTriggers().filter((t) => t.spec.fn === 'backupData' && t.spec.after).length, 0, 'trigger một lần đã xóa');
  const v = c.call('backup.view', {});
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.data.items[0].status, 'VERIFIED');
  assert.equal(v.data.last_backup_status, 'VERIFIED');
  assert.equal(v.data.queued, false);
  // Có ghi trong lúc chép → INCONSISTENT, hẹn chạy lại 15 phút một lần
  env.drive._afterCopy = () => { env.drive._afterCopy = null; c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy hàn' }); };
  env.clock.advance(60000);
  const m2 = env.g.backupData();
  assert.equal(m2.status, 'INCONSISTENT');
  const retry = env.g.ScriptApp.getProjectTriggers().filter((t) => t.spec.fn === 'backupData' && t.spec.after);
  assert.equal(retry.length, 1);
  assert.equal(retry[0].spec.after, 15 * 60000);
  env.clock.advance(60000);
  assert.equal(env.g.backupData().status, 'VERIFIED');
  // Giữ 8 bản VERIFIED
  for (let i = 0; i < 9; i++) { env.clock.advance(60000); env.g.backupData(); }
  const list = c.call('backup.view', {}).data.items;
  assert.equal(list.filter((x) => x.status === 'VERIFIED').length, 8);
  assert.equal(c.call('backup.view', {}).data.items.some((x) => x.status === 'INCONSISTENT'), false, 'thư mục cũ hơn bản giữ cuối cùng đã vào thùng rác');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  assert.equal(c3.call('backup.view', {}).code, 'FORBIDDEN');
});

test('sao lưu đang chạy (thư mục chưa có manifest) hiện RUNNING, không cho Sao lưu ngay chồng; quá 30 phút không manifest → FAILED NO_MANIFEST; lỗi giữa chừng vẫn ghi manifest kèm lý do', () => {
  const { env, c } = setup();
  let mid = null;
  env.drive._afterCopy = () => {
    env.drive._afterCopy = null;
    mid = { view: c.call('backup.view', {}).data, run: c.call('backup.run', {}, { operation_id: uuid(), reauth_token: c.reauth() }).data };
  };
  assert.equal(env.g.backupData().status, 'VERIFIED');
  assert.equal(mid.view.items[0].status, 'RUNNING');
  assert.equal(mid.view.items[0].error, '');
  assert.equal(mid.view.running, true);
  assert.equal(mid.run.already, true);
  assert.equal(env.g.ScriptApp.getProjectTriggers().filter((t) => t.spec.fn === 'backupData' && t.spec.after).length, 0);
  // Thư mục bỏ dở (trigger bị dừng) → sau 30 phút là FAILED
  env.clock.advance(60000);
  env.g.DriveApp.getFolderById(env.props.getProperty('DRIVE_BACKUP_FOLDER_ID')).createFolder(env.g.backupStamp_(env.g.now_()));
  let v = c.call('backup.view', {}).data;
  assert.equal(v.items[0].status, 'RUNNING');
  env.clock.advance(31 * 60000);
  v = c.call('backup.view', {}).data;
  assert.equal(v.running, false);
  assert.equal(v.items[0].status, 'FAILED');
  assert.equal(v.items[0].error, 'NO_MANIFEST');
  // Lỗi ở bước đọc trạng thái (trước đây nằm ngoài try) → vẫn có manifest FAILED + lý do
  env.clock.advance(60000);
  const orig = env.g.readState_;
  let once = true;
  env.g.readState_ = (...a) => { if (once) { once = false; throw new Error('boom'); } return orig(...a); };
  try { assert.equal(env.g.backupData().status, 'FAILED'); } finally { env.g.readState_ = orig; }
  v = c.call('backup.view', {}).data;
  assert.equal(v.items[0].status, 'FAILED');
  assert.match(v.items[0].error, /boom/);
});

test('khôi phục thủ công (6.5.4): cần bảo trì; đổi file Nghiệp vụ + epoch mới, thu hồi phiên; hồ sơ sau bản sao mất, QR cũ mở được, QR mới NOT_IN_RESTORED; bộ đếm mã không lùi; NotificationLogs giữ; chạy lại không sai', () => {
  const { env, c } = setup();
  const e1 = uuid();
  const r1 = c.write('equipment.create', { equipment_id: e1, name_vi: 'Máy nén 1' });
  const qr1 = r1.data.qr_key;
  const m = env.g.backupData();
  assert.equal(m.status, 'VERIFIED');
  const e2 = uuid();
  const r2 = c.write('equipment.create', { equipment_id: e2, name_vi: 'Máy nén 2' });
  const qr2 = r2.data.qr_key;
  // Một dòng nhật ký Gmail sau thời điểm sao lưu
  env.g.dbReset_();
  env.g.withWriteLock_(() => env.g.insertRows_('NotificationLogs', [{ notification_id: uuid(), dedupe_key: 'k', run_date: '2026-10-08', recipient_id: uuid(), entity_type: 'CONTRACT', entity_id: uuid(), due_revision: 'x', due_date: '2026-10-20', stage: 'D14', status: 'SENT', attempt_count: 1 }]));
  const oldBiz = env.props.getProperty('BUSINESS_SPREADSHEET_ID');
  const oldEpoch = env.props.getProperty('DATASET_EPOCH');
  // Người quản trị tạo bản sao file Nghiệp vụ của bản đã chọn
  const copy = env.g.DriveApp.getFileById(m.files.business).makeCopy('ME_NghiepVu_khoiphuc', null);
  env.props.setProperty('RESTORE_SOURCE_ID', copy.getId());
  assert.throws(() => env.g.adminFinalizeManualRestore(), /bảo trì/);
  env.g.adminMaintenanceOn();
  env.g.adminFinalizeManualRestore();
  assert.equal(env.props.getProperty('BUSINESS_SPREADSHEET_ID'), copy.getId());
  assert.equal(env.props.getProperty('PREVIOUS_BUSINESS_SPREADSHEET_ID'), oldBiz);
  assert.notEqual(env.props.getProperty('DATASET_EPOCH'), oldEpoch);
  assert.equal(env.props.getProperty('RESTORE_SOURCE_ID'), null);
  const eqs = env.rows('Equipment');
  assert.deepEqual(eqs.map((x) => x.equipment_id), [e1]);
  assert.equal(env.rows('NotificationLogs').length, 1, 'nhật ký gửi của bản đang chạy được giữ');
  assert.ok(env.rows('AuditLogs').some((a) => a.action === 'system.manualRestore'));
  assert.ok(env.rows('Sessions').every((s) => s.revoked_at), 'mọi phiên bị thu hồi');
  // Chạy lại không sai
  env.props.setProperty('RESTORE_SOURCE_ID', copy.getId());
  env.g.adminFinalizeManualRestore();
  env.g.adminMaintenanceOff();
  // Đăng nhập lại; QR cũ mở được, QR mới báo không có trong bản khôi phục
  const c2 = makeClient(env);
  assert.equal(c2.login('NV-001', OWNER_PIN).ok, true);
  assert.equal(c2.call('qr.resolve', { qr_key: qr1 }).data.qr_state, 'OK');
  assert.equal(c2.call('qr.resolve', { qr_key: qr2 }).data.qr_state, 'NOT_IN_RESTORED');
  // Mã mới không trùng mã của hồ sơ đã mất (TB-0002)
  const r3 = c2.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy nén 3' });
  assert.equal(r3.data.display_code, 'TB-0003');
});

test('diễn tập Phần E đủ bước: B1 → thêm hồ sơ → bảo trì + B2 → khôi phục về B1 → quay lại bằng PREVIOUS_BUSINESS_SPREADSHEET_ID (khớp B2) → hồ sơ và QR trở lại', () => {
  const { env, c } = setup();
  c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy MẪU' });
  const b1 = env.g.backupData();
  assert.equal(b1.status, 'VERIFIED');
  const e2 = uuid();
  const qr2 = c.write('equipment.create', { equipment_id: e2, name_vi: 'THỬ KHÔI PHỤC' }).data.qr_key;
  env.g.adminMaintenanceOn();
  env.clock.advance(60000);
  assert.equal(env.g.backupData().status, 'VERIFIED', 'B2 chạy được khi bảo trì');
  const oldBiz = env.props.getProperty('BUSINESS_SPREADSHEET_ID');
  const copy = env.g.DriveApp.getFileById(b1.files.business).makeCopy('ME_NghiepVu_khoiphuc', null);
  env.props.setProperty('RESTORE_SOURCE_ID', copy.getId());
  env.g.adminFinalizeManualRestore();
  env.g.adminMaintenanceOff();
  let u = makeClient(env);
  assert.equal(u.login('NV-001', OWNER_PIN).ok, true);
  assert.equal(u.call('qr.resolve', { qr_key: qr2 }).data.qr_state, 'NOT_IN_RESTORED');
  // Quay lại
  env.clock.advance(60000);
  env.g.adminMaintenanceOn();
  env.props.setProperty('RESTORE_SOURCE_ID', env.props.getProperty('PREVIOUS_BUSINESS_SPREADSHEET_ID'));
  env.g.adminFinalizeManualRestore();
  env.g.adminMaintenanceOff();
  assert.equal(env.props.getProperty('BUSINESS_SPREADSHEET_ID'), oldBiz);
  assert.equal(env.props.getProperty('PREVIOUS_BUSINESS_SPREADSHEET_ID'), copy.getId());
  assert.ok(env.rows('Equipment').some((x) => x.equipment_id === e2));
  u = makeClient(env);
  assert.equal(u.login('NV-001', OWNER_PIN).ok, true);
  const q = u.call('qr.resolve', { qr_key: qr2 }).data;
  assert.equal(q.qr_state, 'OK');
  assert.equal(q.entity_id, e2);
  assert.match(u.call('backup.view', {}).data.restored_from_ref, /_\d{4}$/);
});

test('system.status (C4): healthCheck báo trigger thiếu, sao lưu, quota, app_base_url; C3 FORBIDDEN', () => {
  const { env, c } = setup();
  let s = c.call('system.status', {});
  assert.equal(s.ok, true, JSON.stringify(s));
  const row = (k) => s.data.checks.find((x) => x.key === k);
  assert.equal(row('triggers').status, 'WARN');
  assert.equal(row('last_backup').status, 'WARN');
  assert.equal(row('app_base_url').status, 'WARN');
  assert.ok(s.data.settings.some((x) => x.key === 'email_stages' && x.readonly));
  env.g.installTriggers();
  env.g.backupData();
  s = c.call('system.status', {});
  assert.equal(row('triggers').status, 'OK');
  assert.equal(row('last_backup').status, 'OK');
  assert.ok(Number(row('trigger_minutes_24h').value) >= 0);
  const c3 = userClient(env, 'U-C3', 3, '694127');
  assert.equal(c3.call('system.status', {}).code, 'FORBIDDEN');
});
