import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

/** Thiết bị + loại + yêu cầu kiểm định; HĐ nộp, C3 duyệt; hôm nay giả lập TEST_TODAY */
function setup(today = '2026-10-01') {
  const env = freshServer();
  env.props.setProperty('TEST_TODAY', today);
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Bình khí nén' }).ok, true);
  const type = uuid();
  assert.equal(c.write('inspection.type.edit', { inspection_type_id: type, code: 'AP_LUC', name_vi: 'Kiểm định bình chịu áp lực', default_interval_months: 12 }).ok, true);
  const req = uuid();
  assert.equal(c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type }).ok, true);
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  return { env, c, hd, c3, eq, type, req };
}
const setToday = (env, d) => env.props.setProperty('TEST_TODAY', d);

/** Nộp + duyệt một lần kiểm định PASS với hiệu lực đến validTo */
function certify(s, validTo, date = '2026-09-01') {
  const id = uuid();
  const r = s.hd.write('inspection.submit', { inspection_id: id, requirement_id: s.req, inspection_date: date, valid_from: date, valid_to: validTo, result: 'PASS', certificate_number: 'CN-' + validTo });
  assert.equal(r.ok, true, JSON.stringify(r));
  const a = s.c3.write('inspection.approve', { inspection_id: id, decision: 'APPROVE' }, { expected_version: 1, reauth_token: s.c3.reauth() });
  assert.equal(a.ok, true, JSON.stringify(a));
  return id;
}
function enableGmail(s) {
  const r = s.c.call('notify.settings.edit', { gmail_enabled: true }, { operation_id: uuid(), reauth_token: s.c.reauth() });
  assert.equal(r.ok, true, JSON.stringify(r));
}
function addRecipient(s, email, extra = {}) {
  const id = uuid();
  const r = s.c.write('notify.recipient.edit', { recipient_id: id, email, confirm: true, ...extra }, { reauth_token: s.c.reauth() });
  assert.equal(r.ok, true, JSON.stringify(r));
  return id;
}
const run = (env) => { env.g.sendExpiryDigest(); env.g.dbReset_(); };
const openAlerts = (env) => env.rows('Alerts').filter((a) => a.alert_state !== 'RESOLVED');

test('NT1-50 mốc A7: D40/D30/D14/D7/D3/D1/D0, quá hạn mỗi 7 ngày; ngoài 40 ngày không nhắc', () => {
  const { env } = setup();
  const st = (dr) => env.g.stageFor_(dr);
  assert.equal(st(41), null);
  assert.deepEqual([40, 31, 30, 15, 14, 8, 7, 4, 3, 2, 1, 0, -1, -6, -7, -13, -14, -30].map(st),
    ['D40', 'D40', 'D30', 'D30', 'D14', 'D14', 'D7', 'D7', 'D3', 'D3', 'D1', 'D0', 'D0', 'D0', 'OD1', 'OD1', 'OD2', 'OD4']);
});

test('NT1-51 duyệt kiểm định → tạo cảnh báo ngay (không đợi trigger); hạn > 40 ngày → chưa có; đồng bộ ALERT; alert.view', () => {
  const s = setup();
  certify(s, '2026-12-31');
  assert.equal(openAlerts(s.env).length, 0, '91 ngày: chưa nhắc');
  certify(s, '2026-11-05', '2026-09-02');
  const a = openAlerts(s.env);
  assert.equal(a.length, 1);
  assert.equal(a[0].stage, 'D40');
  assert.equal(a[0].days_remaining, 35);
  assert.equal(a[0].reference_date_kind, 'VALID_TO');
  const b = s.hd.call('sync.bootstrap', {});
  assert.equal(b.data.records.ALERT.length, 1);
  assert.equal(b.data.server_today, '2026-10-01');
  const v = s.hd.call('alert.view', {});
  assert.equal(v.ok, true);
  assert.equal(v.data.items.length, 1);
  assert.equal(v.data.today, '2026-10-01');
});

test('NT1-52 Gmail tắt: chỉ tính lại Alerts, không gửi; người nhận chưa xác nhận không nhận; xác nhận rồi mới gửi; đổi email phải xác nhận lại', () => {
  const s = setup();
  certify(s, '2026-11-05');
  const rid = uuid();
  assert.equal(s.c.write('notify.recipient.edit', { recipient_id: rid, email: 'Kythuat@Example.test' }, { reauth_token: s.c.reauth() }).ok, true);
  run(s.env);
  assert.equal(s.env.mail.sent.length, 0, 'gmail_enabled = FALSE');
  enableGmail(s);
  run(s.env);
  assert.equal(s.env.mail.sent.length, 0, 'chưa xác nhận người nhận');
  assert.equal(s.c.write('notify.recipient.edit', { recipient_id: rid, confirm: true }, { expected_version: 1, reauth_token: s.c.reauth() }).ok, true);
  run(s.env);
  assert.equal(s.env.mail.sent.length, 1);
  const m = s.env.mail.sent[0];
  assert.equal(m.to, 'kythuat@example.test');
  assert.equal(m.subject, '[M&E] Nhắc hạn kiểm định và hợp đồng · 检验与合同到期提醒 — 01/10/2026');
  assert.match(m.body, /KD-0001/);
  assert.match(m.body, /05\/11\/2026/);
  assert.ok(!/\d{6}/.test(m.body.replace(/\d{2}\/\d{2}\/\d{4}/g, '')), 'không có PIN/mã trong thư');
  const log = s.env.rows('NotificationLogs');
  assert.equal(log.length, 1);
  assert.equal(log[0].status, 'SENT');
  assert.equal(log[0].stage, 'D40');
  // Đổi email → mất xác nhận
  assert.equal(s.c.write('notify.recipient.edit', { recipient_id: rid, email: 'khac@example.test' }, { expected_version: 2, reauth_token: s.c.reauth() }).ok, true);
  assert.equal(s.env.rows('NotificationRecipients')[0].confirmed_at, '');
});

test('NT1-53 không gửi trùng trong cùng mốc; sang mốc mới gửi tiếp; hồ sơ vào cửa sổ muộn chỉ gửi mốc hiện tại', () => {
  const s = setup();
  enableGmail(s);
  addRecipient(s, 'a@example.test');
  certify(s, '2026-11-05');
  run(s.env); run(s.env);
  assert.equal(s.env.mail.sent.length, 1, 'chạy hai lần cùng ngày: một thư');
  setToday(s.env, '2026-10-03'); // còn 33 ngày: vẫn D40
  run(s.env);
  assert.equal(s.env.mail.sent.length, 1);
  setToday(s.env, '2026-10-06'); // còn 30 ngày: D30
  run(s.env);
  assert.equal(s.env.mail.sent.length, 2);
  // Hồ sơ mới, hạn còn 10 ngày → gửi D14 ngay, không gửi bù D40/D30
  const s2 = setup('2026-10-01');
  enableGmail(s2);
  addRecipient(s2, 'b@example.test');
  certify(s2, '2026-10-11');
  run(s2.env);
  const logs = s2.env.rows('NotificationLogs');
  assert.deepEqual(logs.map((n) => n.stage), ['D14']);
  // Quá hạn: D0 rồi OD1 sau 7 ngày
  setToday(s2.env, '2026-10-11'); run(s2.env);
  setToday(s2.env, '2026-10-15'); run(s2.env);
  setToday(s2.env, '2026-10-18'); run(s2.env);
  assert.deepEqual(s2.env.rows('NotificationLogs').map((n) => n.stage), ['D14', 'D0', 'OD1']);
  assert.match(s2.env.mail.sent.at(-1).body, /Quá hạn 7 ngày · 已逾期7天/);
});

test('NT1-54 hợp đồng: ngày tham chiếu = hạn báo gia hạn sớm hơn; kết thúc hợp đồng → cảnh báo RESOLVED, dòng chờ → SKIPPED', () => {
  const s = setup('2026-11-10');
  const id = uuid();
  const r = s.hd.write('contract.create', { contract_id: id, title_vi: 'Bảo trì điều hòa', start_date: '2026-01-01', end_date: '2026-12-31', renewal_notice_date: '2026-11-30' });
  assert.equal(r.ok, true, JSON.stringify(r));
  let a = openAlerts(s.env);
  assert.equal(a.length, 1);
  assert.equal(a[0].entity_type, 'CONTRACT');
  assert.equal(a[0].reference_date_kind, 'RENEWAL_NOTICE');
  assert.equal(a[0].due_date, '2026-11-30');
  assert.equal(a[0].stage, 'D30');
  // Xếp hàng nhưng hết hạn mức → QUEUED
  enableGmail(s);
  addRecipient(s, 'hd@example.test', { entity_scope: 'CONTRACT' });
  s.env.mail.quota = 0;
  run(s.env);
  assert.equal(s.env.rows('NotificationLogs')[0].status, 'QUEUED');
  assert.equal(s.env.mail.sent.length, 0);
  const cv = s.env.rows('Contracts')[0].record_version;
  const cl = s.c.write('contract.close', { contract_id: id, lifecycle_status: 'NOT_RENEWED', closed_reason_vi: 'Không gia hạn' }, { expected_version: cv, reauth_token: s.c.reauth() });
  assert.equal(cl.ok, true, JSON.stringify(cl));
  a = s.env.rows('Alerts');
  assert.equal(a[0].alert_state, 'RESOLVED');
  const n = s.env.rows('NotificationLogs')[0];
  assert.equal(n.status, 'SKIPPED');
  assert.equal(n.error_code, 'RESOLVED');
  // Đồng bộ: cảnh báo đã đóng → TOMBSTONE
  const ch = s.hd.call('sync.changes', { cursor: 0 });
  assert.ok(ch.data.changes.some((x) => x.entity_type === 'ALERT' && x.op === 'TOMBSTONE'));
  assert.equal(ch.data.server_today, '2026-11-10');
});

test('NT1-55 phạm vi người nhận: chỉ hợp đồng không nhận kiểm định; người nhận gắn tài khoản đã khóa không nhận', () => {
  const s = setup();
  enableGmail(s);
  addRecipient(s, 'hd@example.test', { entity_scope: 'CONTRACT' });
  const c1 = userClient(s.env, 'U-C1', 1, '482915');
  const uid = s.env.rows('Users').find((u) => u.employee_code === 'U-C1').user_id;
  addRecipient(s, 'c1@example.test', { user_id: uid });
  certify(s, '2026-11-05');
  run(s.env);
  assert.deepEqual(s.env.mail.sent.map((m) => m.to), ['c1@example.test']);
  assert.ok(c1);
  // Khóa tài khoản gắn kèm → mốc sau không gửi cho địa chỉ đó
  s.env.g.dbReset_();
  const u = s.env.g.readRows_('Users').find((x) => x.user_id === uid);
  s.env.g.withWriteLock_(() => s.env.g.writeCells_('Users', u.__row, { active: false }));
  setToday(s.env, '2026-10-06');
  run(s.env);
  assert.equal(s.env.mail.sent.length, 1);
});

test('NT1-56 gửi an toàn: lỗi gửi → FAILED rồi thử lại; SENDING quá 1 giờ → UNKNOWN, không tự gửi lại; notify.resend chỉ UNKNOWN (C4, PIN)', () => {
  const s = setup();
  enableGmail(s);
  addRecipient(s, 'a@example.test');
  certify(s, '2026-11-05');
  const orig = s.env.g.MailApp.sendEmail;
  s.env.g.MailApp.sendEmail = () => { throw new Error('Mail service busy'); };
  run(s.env);
  let n = s.env.rows('NotificationLogs')[0];
  assert.equal(n.status, 'FAILED');
  assert.equal(n.attempt_count, 1);
  s.env.g.MailApp.sendEmail = orig;
  run(s.env);
  n = s.env.rows('NotificationLogs')[0];
  assert.equal(n.status, 'SENT');
  assert.equal(n.attempt_count, 2);
  // Giả lập lần gửi bị ngắt giữa chừng
  setToday(s.env, '2026-10-06');
  s.env.mail.quota = s.env.mail.sent.length; // không gửi được lúc này, chỉ xếp hàng
  run(s.env);
  s.env.mail.quota = 100;
  s.env.g.dbReset_();
  const q = s.env.g.readRows_('NotificationLogs').find((x) => x.stage === 'D30');
  assert.equal(q.status, 'QUEUED');
  s.env.g.withWriteLock_(() => s.env.g.writeCells_('NotificationLogs', q.__row, { status: 'SENDING', attempt_at: '2026-10-06T05:00:00+07:00', attempt_count: 1 }));
  s.env.clock.advance(3 * 3600000);
  const before = s.env.mail.sent.length;
  run(s.env);
  const u = s.env.rows('NotificationLogs').find((x) => x.stage === 'D30');
  assert.equal(u.status, 'UNKNOWN');
  assert.equal(s.env.mail.sent.length, before, 'UNKNOWN không tự gửi lại');
  // C3 không được gửi lại; C4 cần PIN; dòng SENT không gửi lại được
  const c3r = s.c3.write('notify.resend', { notification_id: u.notification_id }, { reauth_token: s.c3.reauth() });
  assert.equal(c3r.code, 'FORBIDDEN');
  assert.equal(s.c.write('notify.resend', { notification_id: u.notification_id }).code, 'REAUTH_REQUIRED');
  const sent = s.env.rows('NotificationLogs').find((x) => x.status === 'SENT');
  assert.equal(s.c.write('notify.resend', { notification_id: sent.notification_id }, { reauth_token: s.c.reauth() }).errors[0].code, 'INVALID_VALUE');
  const ok = s.c.write('notify.resend', { notification_id: u.notification_id }, { reauth_token: s.c.reauth() });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(s.env.mail.sent.length, before + 1);
  assert.equal(s.env.rows('NotificationLogs').find((x) => x.notification_id === u.notification_id).status, 'SENT');
  assert.equal(s.env.rows('AuditLogs').filter((x) => x.action === 'notify.resend').length, 1);
});

test('NT1-57 tiếp nhận cảnh báo: HĐ được, C1 không; vẫn gửi theo mốc sau tiếp nhận; hạn mới (duyệt lần sau) → cảnh báo cũ RESOLVED', () => {
  const s = setup();
  enableGmail(s);
  addRecipient(s, 'a@example.test');
  certify(s, '2026-11-05');
  const al = openAlerts(s.env)[0];
  const c1 = userClient(s.env, 'U-C1', 1, '482915');
  assert.equal(c1.write('alert.acknowledge', { alert_id: al.alert_id }).code, 'FORBIDDEN');
  const k = s.hd.write('alert.acknowledge', { alert_id: al.alert_id });
  assert.equal(k.ok, true, JSON.stringify(k));
  assert.equal(s.env.rows('Alerts')[0].alert_state, 'ACKNOWLEDGED');
  run(s.env);
  assert.equal(s.env.mail.sent.length, 1, 'đã tiếp nhận vẫn gửi');
  assert.equal(s.env.rows('Alerts')[0].alert_state, 'ACKNOWLEDGED', 'tính lại không xóa trạng thái tiếp nhận');
  certify(s, '2027-11-04', '2026-10-01');
  assert.equal(openAlerts(s.env).length, 0);
  assert.equal(s.env.rows('Alerts')[0].alert_state, 'RESOLVED');
});

test('NT1-58 quyền Gmail: C3 xem nhật ký với email che; C3 không sửa người nhận/cài đặt; mốc A7 không sửa được; đổi giờ gửi cài lại trigger', () => {
  const s = setup();
  addRecipient(s, 'kythuat@example.test');
  const v = s.c3.call('notify.log.view', {});
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.data.recipients[0].email, 'k***@example.test');
  assert.equal(s.c3.write('notify.recipient.edit', { recipient_id: uuid(), email: 'x@example.test' }, { reauth_token: s.c3.reauth() }).code, 'FORBIDDEN');
  assert.equal(s.c3.call('notify.settings.edit', { gmail_enabled: true }, { operation_id: uuid(), reauth_token: s.c3.reauth() }).code, 'FORBIDDEN');
  const hd = s.hd.call('notify.log.view', {});
  assert.equal(hd.code, 'FORBIDDEN');
  const bad = s.c.call('notify.settings.edit', { email_stages: '40,20' }, { operation_id: uuid(), reauth_token: s.c.reauth() });
  assert.equal(bad.errors[0].field, 'email_stages');
  const h = s.c.call('notify.settings.edit', { email_hour: 8, test_send: true }, { operation_id: uuid(), reauth_token: s.c.reauth() });
  assert.equal(h.ok, true, JSON.stringify(h));
  assert.equal(h.data.email_hour, 8);
  assert.equal(h.data.test.sent, 1);
  const trig = s.env.g.ScriptApp.getProjectTriggers().find((t) => t.spec.fn === 'sendExpiryDigest');
  assert.equal(trig.spec.atHour, 8);
  // location_scope chưa hỗ trợ
  assert.equal(s.c.write('notify.recipient.edit', { recipient_id: uuid(), email: 'y@example.test', location_scope: 'X' }, { reauth_token: s.c.reauth() }).errors[0].code, 'SCOPE_NOT_SUPPORTED');
});
