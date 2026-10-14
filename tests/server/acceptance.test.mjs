// Nghiệm thu 6.8 (phụ lục 1.5): các mục chưa có test riêng ở file khác
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, makeClient, addUser, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

test('NT1-10 PIN 6 số: 049271 đăng nhập được; 12345, 1234567, 01234a bị từ chối khi gọi API; 012345 → PIN_WEAK khi đổi PIN; mã NV 00123 giữ số 0', () => {
  const env = freshServer();
  const c = ownerClient(env);
  addUser(env, 'NV-049', 2, '049271', 'KY_THUAT');
  assert.equal(makeClient(env).login('NV-049', '049271').ok, true);
  for (const bad of ['12345', '1234567', '01234a']) {
    const r = makeClient(env).login('NV-049', bad);
    assert.equal(r.ok, false, bad);
    assert.equal(r.code, 'VALIDATION_ERROR', bad);
    assert.equal(r.errors[0].code, 'PIN_FORMAT', bad);
  }
  const u = makeClient(env);
  assert.equal(u.login('NV-049', '049271').ok, true);
  const w = u.call('pin.change', { current_pin: '049271', new_pin: '012345' }, { operation_id: uuid() });
  assert.equal(w.ok, false);
  assert.equal(w.errors[0].code, 'PIN_WEAK');
  // Mã nhân viên 00123 giữ số 0
  const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const cr = c.write('user.create', { user_id: uuid(), employee_code: '00123', display_name: 'Số 0 đầu', role_level: 1, subroles: [] }, { reauth_token: rt });
  assert.equal(cr.ok, true, JSON.stringify(cr));
  assert.equal(env.rows('Users').find((x) => x.display_name === 'Số 0 đầu').employee_code, '00123');
  const z = makeClient(env).login('00123', cr.data.temp_pin);
  assert.equal(z.code, 'MUST_CHANGE_PIN');
});

test('NT1-12 lưu PIN: không có PIN thô trong Users; hai người cùng PIN có pin_hash khác nhau; pin_hash_version HMAC256-v1', () => {
  const env = freshServer();
  ownerClient(env);
  addUser(env, 'NV-A', 2, '583019', 'KY_THUAT');
  addUser(env, 'NV-B', 2, '583019', 'KY_THUAT');
  const users = env.rows('Users');
  const a = users.find((x) => x.employee_code === 'NV-A'), b = users.find((x) => x.employee_code === 'NV-B');
  assert.notEqual(a.pin_hash, b.pin_hash);
  assert.notEqual(a.salt, b.salt);
  assert.equal(a.pin_hash_version, 'HMAC256-v1');
  for (const u of users) assert.ok(!Object.values(u).some((v) => String(v) === '583019' || String(v) === OWNER_PIN), 'không có PIN thô');
});

test('NT1-14 phiên: mặc định 30 ngày; THỬ đặt TEST_SESSION_SECONDS thì phiên theo số giây đó và hết hạn → SESSION_EXPIRED', () => {
  const env = freshServer();
  ownerClient(env);
  addUser(env, 'NV-S', 2, '583019', 'KY_THUAT');
  const span = (c) => { const s = env.rows('Sessions').filter((x) => x.user_id === env.rows('Users').find((u) => u.employee_code === 'NV-S').user_id).pop(); return (Date.parse(s.expires_at) - Date.parse(s.issued_at)) / 1000; };
  const c1 = makeClient(env);
  assert.equal(c1.login('NV-S', '583019').ok, true);
  assert.equal(Math.round(span(c1)), 30 * 86400);
  env.props.setProperty('TEST_SESSION_SECONDS', '120');
  const c2 = makeClient(env);
  assert.equal(c2.login('NV-S', '583019').ok, true);
  assert.equal(Math.round(span(c2)), 120);
  assert.equal(c2.call('sync.bootstrap', {}).ok, true);
  env.clock.advance(121000);
  assert.equal(c2.call('sync.bootstrap', {}).code, 'SESSION_EXPIRED');
});

test('NT1-42 QR ngoài quyền: người không có quyền xem module nhận cùng câu UNAVAILABLE như mã không tồn tại, không lộ tên', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const r = c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy bí mật MẪU' });
  const key = r.data.qr_key;
  const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const pe = c.write('permission.edit', { changes: [{ role_level: 1, module: 'equipment', flags: 'X' }], reason: 'thử NT1-42' }, { reauth_token: rt });
  assert.equal(pe.ok, true, JSON.stringify(pe));
  const c1 = userClient(env, 'U-C1', 1, '482915');
  const hidden = c1.call('qr.resolve', { qr_key: key });
  const none = c1.call('qr.resolve', { qr_key: '0000000000000000000Z' });
  assert.equal(hidden.data.qr_state, 'UNAVAILABLE');
  assert.deepEqual(hidden.data, none.data, 'cùng một câu trả lời');
  assert.ok(!JSON.stringify(hidden).includes('bí mật'));
  // Người có quyền vẫn mở được
  assert.equal(c.call('qr.resolve', { qr_key: key }).data.qr_state, 'OK');
});

test('NT1-50 ranh giới ngày Việt Nam: lúc 23:30 và 00:30 giờ VN, "hôm nay" và số ngày còn lại tính theo ngày lịch VN', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const atVN = (iso) => { env.clock.offset = Date.parse(iso) - Date.now(); env.g.dbReset_(); };
  atVN('2026-10-14T23:30:00+07:00');
  assert.equal(env.g.todayVN_(), '2026-10-14');
  const id = uuid();
  assert.equal(c.write('contract.create', { contract_id: id, title_vi: 'Bảo trì MẪU', start_date: '2026-01-01', end_date: '2026-10-15' }).ok, true);
  const dr = () => { env.g.dbReset_(); env.g.refreshAlerts_(); env.g.dbReset_(); return env.rows('Alerts').find((a) => a.entity_id === id); };
  let a = dr();
  assert.equal(a.days_remaining, 1);
  assert.equal(a.stage, 'D1');
  atVN('2026-10-15T00:30:00+07:00');
  assert.equal(env.g.todayVN_(), '2026-10-15');
  a = dr();
  assert.equal(a.days_remaining, 0);
  assert.equal(a.stage, 'D0');
  atVN('2026-10-16T00:30:00+07:00');
  a = dr();
  assert.equal(a.days_remaining, -1, 'quá hạn 1 ngày');
});
