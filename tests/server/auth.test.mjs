import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, makeClient, ownerClient, userClient, addUser, OWNER_CODE, OWNER_TEMP_PIN, OWNER_PIN, uuid } from '../helpers.mjs';

const MIN = 60 * 1000;

test('system.health qua GET và getPublicState không cần phiên', () => {
  const env = freshServer();
  const h = env.get({ action: 'system.health' });
  assert.equal(h.ok, true);
  assert.equal(h.app_id, 'ME');
  assert.equal(h.api_contract_version, '1.0');
  assert.equal(env.get({ action: 'x' }).code, 'NOT_FOUND');
  const c = makeClient(env);
  const s = c.call('system.getPublicState');
  assert.equal(s.ok, true);
  assert.equal(s.data.ready, true);
  assert.equal(s.dataset_epoch, c.epoch());
  assert.match(s.server_time, /\+07:00$/);
});

test('body không phải JSON → VALIDATION_ERROR; action lạ → FORBIDDEN; Đợt 2 → FEATURE_NOT_ENABLED', () => {
  const env = freshServer();
  assert.equal(env.post('not json').code, 'VALIDATION_ERROR');
  const c = ownerClient(env);
  assert.equal(c.call('nope.action').code, 'FORBIDDEN');
  assert.equal(c.call('maintenance.view').code, 'FEATURE_NOT_ENABLED');
  assert.equal(c.call('inspection.schedule').code, 'FEATURE_NOT_ENABLED');
  assert.equal(c.call('system.reset.preview').code, 'FEATURE_NOT_ENABLED');
  const old = c.call('sync.bootstrap', {}, { api_contract_version: '0.9' });
  assert.equal(old.code, 'CLIENT_UPDATE_REQUIRED');
  assert.equal(c.call('sync.bootstrap', {}, { app_version: '0.9.0' }).code, 'CLIENT_UPDATE_REQUIRED');
});

test('PIN tạm → MUST_CHANGE_PIN; phiên CHANGE_PIN chỉ gọi pin.change/auth.logout', () => {
  const env = freshServer();
  const c = makeClient(env);
  const r = c.login(OWNER_CODE, OWNER_TEMP_PIN);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'MUST_CHANGE_PIN');
  assert.equal(r.data.session_kind, 'CHANGE_PIN');
  assert.ok(r.data.token.startsWith('v1.'));
  assert.equal(c.call('sync.bootstrap').code, 'MUST_CHANGE_PIN');
  for (const weak of ['000000', '999999', '012345', '123456', '987654', '543210', '000001', OWNER_TEMP_PIN]) {
    const w = c.call('pin.change', { current_pin: OWNER_TEMP_PIN, new_pin: weak });
    assert.equal(w.code, 'VALIDATION_ERROR', weak);
    assert.equal(w.errors[0].code, 'PIN_WEAK', weak);
  }
  const bad = c.call('pin.change', { current_pin: '111222', new_pin: '604817' });
  assert.equal(bad.code, 'AUTH_FAILED');
  const ok = c.call('pin.change', { current_pin: OWNER_TEMP_PIN, new_pin: OWNER_PIN });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.session_kind, 'FULL');
  // phiên CHANGE_PIN cũ hết hiệu lực
  const old = c.call('pin.change', { current_pin: OWNER_PIN, new_pin: '715926' });
  assert.equal(old.code, 'AUTH_REQUIRED');
  assert.equal(old.data.reason, 'AUTH_VERSION');
  c.token = ok.data.token;
  assert.equal(c.call('sync.bootstrap').ok, true);
  // PIN tạm không còn dùng được
  assert.equal(makeClient(env).login(OWNER_CODE, OWNER_TEMP_PIN).code, 'AUTH_FAILED');
  const u = env.rows('Users')[0];
  assert.equal(u.must_change_pin, false);
  assert.equal(u.temp_pin_expires_at, '');
});

test('PIN tạm quá 72 giờ → TEMP_PIN_EXPIRED, không tính lần sai', () => {
  const env = freshServer();
  env.clock.advance(73 * 60 * MIN);
  const r = makeClient(env).login(OWNER_CODE, OWNER_TEMP_PIN);
  assert.equal(r.code, 'TEMP_PIN_EXPIRED');
  assert.equal(env.rows('Users')[0].failed_attempts || 0, 0);
});

test('sai mã và sai PIN cùng một lời báo; sai 5 lần trong 15 phút → khóa 15 phút', () => {
  const env = freshServer();
  addUser(env, 'NV-100', 3, '482916');
  const c = makeClient(env);
  const unknown = c.login('KHONG-CO', '482916');
  const wrong = c.login('NV-100', '111333');
  assert.equal(unknown.code, 'AUTH_FAILED');
  assert.equal(wrong.code, 'AUTH_FAILED');
  assert.equal(unknown.message_vi, wrong.message_vi);
  assert.equal(unknown.message_vi, 'Mã nhân viên hoặc PIN không đúng');
  assert.equal(unknown.message_zh, '工号或PIN错误');
  for (let i = 0; i < 3; i++) assert.equal(c.login('NV-100', '111333').code, 'AUTH_FAILED');
  const fifth = c.login('NV-100', '111333');
  assert.equal(fifth.code, 'PIN_LOCKED');
  assert.equal(fifth.data.retry_after_seconds, 900);
  assert.match(fifth.message_vi, /15 phút/);
  // đúng PIN trong lúc khóa vẫn bị chặn
  assert.equal(c.login('NV-100', '482916').code, 'PIN_LOCKED');
  env.clock.advance(16 * MIN);
  assert.equal(c.login('NV-100', '482916').ok, true);
  const u = env.rows('Users').find((x) => x.employee_code === 'NV-100');
  assert.equal(u.failed_attempts, 0);
  assert.ok(u.last_login_at);
});

test('cửa sổ đếm sai 15 phút: sai rải rác không khóa', () => {
  const env = freshServer();
  addUser(env, 'NV-101', 3, '482916');
  const c = makeClient(env);
  for (let i = 0; i < 4; i++) c.login('NV-101', '111333');
  env.clock.advance(16 * MIN);
  for (let i = 0; i < 4; i++) assert.equal(c.login('NV-101', '111333').code, 'AUTH_FAILED');
  assert.equal(c.login('NV-101', '482916').ok, true);
});

test('mã không tồn tại cũng bị khóa sau 5 lần (CacheService), phản hồi giống mã thật', () => {
  const env = freshServer();
  const c = makeClient(env);
  for (let i = 0; i < 4; i++) assert.equal(c.login('MA-LA', '135790').code, 'AUTH_FAILED');
  assert.equal(c.login('MA-LA', '135790').code, 'PIN_LOCKED');
  assert.equal(c.login('MA-LA', '135790').code, 'PIN_LOCKED');
});

test('30 lần sai toàn hệ thống trong 10 phút → LOGIN_PAUSED cho mọi mã', () => {
  const env = freshServer();
  addUser(env, 'NV-200', 3, '482916');
  const c = makeClient(env);
  for (let i = 0; i < 30; i++) c.login('DO-' + i, '135790');
  const r = c.login('NV-200', '482916');
  assert.equal(r.code, 'LOGIN_PAUSED');
  assert.ok(r.data.retry_after_seconds > 0);
  env.g.adminClearLoginPause();
  assert.equal(c.login('NV-200', '482916').ok, true);
  const kinds = env.rows('AuthAttempts').map((a) => a.outcome);
  assert.ok(kinds.includes('PAUSED'));
  assert.ok(env.rows('AuthAttempts').every((a) => !JSON.stringify(a).includes('135790')), 'không ghi PIN');
});

test('token: sửa chữ ký → INVALID; hết hạn → SESSION_EXPIRED; đăng xuất → REVOKED; epoch khác → DATASET_RESET', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const good = c.token;
  c.token = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
  const bad = c.call('sync.bootstrap');
  assert.equal(bad.code, 'AUTH_REQUIRED');
  assert.equal(bad.data.reason, 'INVALID');
  c.token = good;
  assert.equal(c.call('sync.bootstrap', {}, { dataset_epoch: uuid() }).code, 'DATASET_RESET');
  assert.equal(c.call('auth.logout').ok, true);
  const rv = c.call('sync.bootstrap');
  assert.equal(rv.code, 'AUTH_REQUIRED');
  assert.equal(rv.data.reason, 'REVOKED');
  assert.match(rv.message_vi, /thu hồi/);
  const c2 = makeClient(env);
  c2.login(OWNER_CODE, OWNER_PIN);
  env.clock.advance(31 * 24 * 60 * MIN);
  assert.equal(c2.call('sync.bootstrap').code, 'SESSION_EXPIRED');
});

test('thu hồi vẫn có hiệu lực khi cache bị xóa (Sheets là nguồn đúng)', () => {
  const env = freshServer();
  const c = ownerClient(env);
  assert.equal(c.call('auth.logout').ok, true);
  env.cache._map.clear();
  assert.equal(c.call('sync.bootstrap').data.reason, 'REVOKED');
});

test('tối đa 10 phiên FULL mỗi người; phiên cũ nhất bị thu hồi LIMIT', () => {
  const env = freshServer();
  const first = ownerClient(env);
  const clients = [];
  for (let i = 0; i < 10; i++) {
    env.clock.advance(1000);
    const c = makeClient(env);
    assert.equal(c.login(OWNER_CODE, OWNER_PIN).ok, true);
    clients.push(c);
  }
  assert.equal(first.call('sync.bootstrap').data.reason, 'REVOKED');
  assert.equal(clients[9].call('sync.bootstrap').ok, true);
  assert.ok(env.rows('Sessions').some((s) => s.revoke_reason === 'LIMIT'));
});

test('action loại PIN cần reauth_token; reauth sai PIN tính vào bộ đếm', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const r = c.call('auth.logoutAll');
  assert.equal(r.code, 'REAUTH_REQUIRED');
  assert.equal(c.call('auth.reauth', { pin: '111333' }).code, 'AUTH_FAILED');
  const ra = c.call('auth.reauth', { pin: OWNER_PIN });
  assert.equal(ra.ok, true);
  assert.ok(ra.data.reauth_token.startsWith('r1.'));
  // token giả mạo
  assert.equal(c.call('auth.logoutAll', {}, { reauth_token: ra.data.reauth_token + 'x' }).code, 'REAUTH_REQUIRED');
  // hết hạn sau 5 phút
  env.clock.advance(6 * MIN);
  assert.equal(c.call('auth.logoutAll', {}, { reauth_token: ra.data.reauth_token }).code, 'REAUTH_REQUIRED');
  const ra2 = c.call('auth.reauth', { pin: OWNER_PIN });
  const out = c.call('auth.logoutAll', {}, { reauth_token: ra2.data.reauth_token });
  assert.equal(out.ok, true);
  const after = c.call('sync.bootstrap');
  assert.equal(after.data.reason, 'AUTH_VERSION');
});

test('reauth_token của phiên khác không dùng được', () => {
  const env = freshServer();
  const a = ownerClient(env);
  const b = makeClient(env);
  b.login(OWNER_CODE, OWNER_PIN);
  const ra = a.call('auth.reauth', { pin: OWNER_PIN });
  assert.equal(b.call('auth.logoutAll', {}, { reauth_token: ra.data.reauth_token }).code, 'REAUTH_REQUIRED');
});

test('tài khoản bị khóa (active=false) chỉ báo ACCOUNT_DISABLED khi PIN đúng; phiên đang có bị thu hồi', () => {
  const env = freshServer();
  const c = userClient(env, 'NV-300', 3, '482916');
  const g = env.g;
  g.dbReset_();
  const u = g.findOne_('Users', 'employee_code', 'NV-300');
  g.withWriteLock_(() => g.writeCells_('Users', u.__row, { active: false }));
  g.adminFlushAuthCache();
  assert.equal(c.call('sync.bootstrap').data.reason, 'REVOKED');
  const d = makeClient(env);
  assert.equal(d.login('NV-300', '111333').code, 'AUTH_FAILED');
  assert.equal(d.login('NV-300', '482916').code, 'ACCOUNT_DISABLED');
});

test('bảo trì: chỉ system.health, getPublicState, auth.logout chạy', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.adminMaintenanceOn();
  assert.equal(c.call('sync.bootstrap').code, 'SYSTEM_MAINTENANCE');
  assert.equal(c.call('system.getPublicState').data.maintenance_mode, true);
  assert.equal(makeClient(env).login(OWNER_CODE, OWNER_PIN).code, 'SYSTEM_MAINTENANCE');
  assert.equal(c.call('auth.logout').ok, true);
  env.g.adminMaintenanceOff();
  assert.equal(makeClient(env).login(OWNER_CODE, OWNER_PIN).ok, true);
});

test('Sessions lưu token_hash, không lưu token; AuthAttempts không có PIN', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const sessions = JSON.stringify(env.rows('Sessions'));
  assert.ok(!sessions.includes(c.token));
  const all = JSON.stringify(env.rows('AuthAttempts')) + JSON.stringify(env.rows('AuditLogs')) + JSON.stringify(env.rows('Operations'));
  for (const pin of [OWNER_PIN, OWNER_TEMP_PIN]) assert.ok(!all.includes(pin));
});

test('P-01 chẩn đoán: doPost ghi probe_seq; doGet không action trả via=GET và được ghi lại', () => {
  const env = freshServer();
  const c = makeClient(env);
  for (const seq of [0, 1, 2]) c.call('system.getPublicState', { probe_run: 'run1', probe_seq: seq });
  const g = env.get({});
  assert.equal(g.code, 'NOT_FOUND');
  assert.equal(g.via, 'GET');
  const r = c.call('system.getPublicState', { probe_run: 'run1', probe_read: true });
  assert.deepEqual([...r.data.probe.seen], [0, 1, 2]);
  assert.equal(r.data.probe.gets_without_action.length, 1);
  env.props.setProperty('ENV', 'THAT');
  env.cache._map.clear();
  assert.equal(c.call('system.getPublicState', { probe_run: 'run1', probe_read: true }).data.probe, undefined);
});

test('reauth: PIN sai tăng bộ đếm, PIN đúng xóa bộ đếm; đổi PIN xong thì PIN cũ không reauth được', () => {
  const env = freshServer();
  const c = ownerClient(env);
  assert.equal(c.call('auth.reauth', { pin: '111333' }).code, 'AUTH_FAILED');
  assert.equal(c.call('auth.reauth', { pin: '111334' }).code, 'AUTH_FAILED');
  assert.equal(env.rows('Users')[0].failed_attempts, 2);
  assert.equal(c.call('auth.reauth', { pin: OWNER_PIN }).ok, true);
  assert.equal(env.rows('Users')[0].failed_attempts, 0);
  // PIN mới yếu → VALIDATION_ERROR, PIN không đổi
  const weak = c.call('pin.change', { current_pin: OWNER_PIN, new_pin: '123456' });
  assert.equal(weak.errors[0].code, 'PIN_WEAK');
  const ch = c.call('pin.change', { current_pin: OWNER_PIN, new_pin: '715926' });
  assert.equal(ch.ok, true, JSON.stringify(ch));
  c.token = ch.data.token;
  assert.equal(c.call('auth.reauth', { pin: OWNER_PIN }).code, 'AUTH_FAILED');
  assert.equal(c.call('auth.reauth', { pin: '715926' }).ok, true);
});
