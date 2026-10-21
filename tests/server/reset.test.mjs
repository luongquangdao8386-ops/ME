// Đợt 4 — Xóa sạch dữ liệu vận hành (1.4 §21, phụ lục 1.5 mục 6.9.3): quyền owner, xem trước/xác nhận (PIN, nonce, plan_hash,
// "XÓA TOÀN BỘ"), chạy theo lô có điểm dừng, sao lưu trước khi xóa, file về riêng tư, tem cũ hết hiệu lực, nháp epoch cũ bị từ chối
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, makeClient, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid, fakeJpegB64 } from '../helpers.mjs';

const CONFIRM = 'XÓA TOÀN BỘ';

/** Dữ liệu mẫu + một ảnh xem bằng link + người nhận Gmail + lô nhập dở */
function seed() {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const eq = env.rows('Equipment')[0];
  const up = c.write('doc.upload', { document_id: uuid(), entity_type: 'EQUIPMENT', entity_id: eq.equipment_id, kind: 'PHOTO_EQUIPMENT', mime_type: 'image/jpeg', content_b64: fakeJpegB64(), thumb_b64: fakeJpegB64(500), title_vi: 'Ảnh máy' });
  assert.equal(up.ok, true, JSON.stringify(up).slice(0, 300));
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  const c4 = userClient(env, 'U-C4', 4, '694129');
  return { env, c, kt, c4, eq };
}

function preview(c) {
  const r = c.call('system.reset.preview');
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  return r.data;
}

function request(c, pv, extra = {}) {
  return c.write('system.reset.request', { reset_run_id: pv.reset_run_id, nonce: pv.nonce, plan_hash: pv.plan_hash, pin: OWNER_PIN, confirm_text: CONFIRM, file_mode: 'KEEP', ...extra });
}

/** Hỏi tiến độ bằng phiên phục hồi tới khi xong/lỗi */
function drive(env, rec, id, max = 60) {
  let st;
  for (let i = 0; i < max; i++) {
    st = rec.call('system.reset.status', { reset_run_id: id });
    assert.equal(st.ok, true, JSON.stringify(st).slice(0, 300));
    if (['COMPLETED', 'FAILED_NEEDS_RECOVERY', 'CANCELLED'].includes(st.data.run.status)) break;
  }
  return st.data.run;
}

function recoveryClient(env, token) {
  const r = makeClient(env);
  r.token = token;
  return r;
}

test('Xóa sạch: chỉ owner (cấp 4 thường, cấp 3 bị chặn ở API); xem trước do máy chủ đếm theo nhóm, giữ tài khoản/quyền', () => {
  const { env, c, kt, c4 } = seed();
  assert.equal(c4.call('system.reset.preview').code, 'FORBIDDEN');
  assert.equal(c4.call('system.reset.status').code, 'FORBIDDEN');
  assert.equal(kt.call('system.reset.preview').code, 'FORBIDDEN');
  const pv = preview(c);
  assert.match(pv.nonce, /^[0-9a-f-]{40,}$/);
  assert.equal(pv.confirm_text, CONFIRM);
  assert.ok(pv.plan.groups.catalog > 0 && pv.plan.groups.qr > 0 && pv.plan.groups.documents === 1);
  assert.equal(pv.plan.files.app, 2, 'ảnh + ảnh nhỏ');
  assert.equal(pv.plan.files.shared, 2);
  assert.deepEqual(pv.file_modes.map((m) => [m.mode, m.available]), [['KEEP', true], ['TRASH', true], ['DELETE', false]]);
  // Người khác không dùng được bản xem trước của owner
  assert.equal(c4.write('system.reset.request', { reset_run_id: pv.reset_run_id, nonce: pv.nonce, plan_hash: pv.plan_hash, pin: '694129', confirm_text: CONFIRM, file_mode: 'KEEP' }).code, 'FORBIDDEN');
  assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'false');
});

test('Xác nhận: gõ sai chữ, PIN sai, chế độ xóa vĩnh viễn chưa bật, dữ liệu đổi sau xem trước, hết hạn 10 phút, dùng lại nonce → không xóa gì', () => {
  const { env, c, kt } = seed();
  let pv = preview(c);
  let r = request(c, pv, { confirm_text: 'XOA TOAN BO' });
  assert.equal(r.code, 'VALIDATION_ERROR');
  assert.ok(r.errors.some((e) => e.code === 'CONFIRM_TEXT'));
  // kiểu bỏ dấu cũ "XOÁ" (bàn phím iPhone) và chữ thường được nhận; không dấu thì không
  assert.equal(env.g.resetConfirmOk_('XOÁ TOÀN BỘ'), true);
  assert.equal(env.g.resetConfirmOk_(' xóa  toàn bộ '), true);
  assert.equal(env.g.resetConfirmOk_('XOA TOAN BO'), false);
  assert.equal(request(c, pv, { pin: '111111' }).code, 'AUTH_FAILED');
  r = request(c, pv, { file_mode: 'DELETE' });
  assert.ok(r.errors.some((e) => e.code === 'FILE_MODE_UNAVAILABLE'));
  // Có người ghi thêm sau khi xem trước → kế hoạch đổi
  assert.equal(kt.write('repair.report', { repair_id: uuid(), equipment_id: env.rows('Equipment')[0].equipment_id, symptom_vi: 'Kêu to', severity: 'LOW' }).ok, true);
  r = request(c, pv);
  assert.ok(r.errors.some((e) => e.code === 'RESET_PLAN_CHANGED'), JSON.stringify(r.errors));
  // Hết hạn
  pv = preview(c);
  env.clock.advance(11 * 60000);
  r = request(c, pv);
  assert.ok(r.errors.some((e) => e.code === 'RESET_PLAN_EXPIRED'));
  // Chữ có khoảng trắng đầu/cuối vẫn khớp (chuẩn hóa NFC + bỏ khoảng trắng)
  pv = preview(c);
  r = request(c, pv, { confirm_text: '  ' + CONFIRM.normalize('NFD') + ' ' });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  // Dùng lại nonce
  const again = request(c, pv);
  assert.equal(again.ok, false);
  assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'true');
});

test('Xóa sạch trọn đợt (giữ file): bảo trì → sao lưu kiểm chứng → epoch mới → file về riêng tư → bảng rỗng → kiểm tra → hoàn tất; giữ tài khoản/quyền/cấu hình; tem cũ hết hiệu lực; nháp epoch cũ bị từ chối', () => {
  const { env, c, kt, eq } = seed();
  const g = env.g;
  const oldEpoch = env.props.getProperty('DATASET_EPOCH');
  const qrKey = env.rows('QrRegistry').find((q) => q.entity_id === eq.equipment_id).qr_key;
  const doc = env.rows('Documents')[0];
  const before = { users: env.rows('Users').length, perms: env.rows('RolePermissions').length, settings: env.rows('Settings').length, glossary: env.rows('Glossary').length };
  const seqBefore = g.readState_().map['code_seq.TB'];
  const pv = preview(c);
  const rq = request(c, pv);
  assert.equal(rq.ok, true, JSON.stringify(rq).slice(0, 400));
  assert.equal(rq.data.status, 'LOCKED');
  assert.equal(rq.data.recovery.session_kind, 'RECOVERY');
  assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'true');
  assert.ok(env.g.ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'resetContinue'), 'trigger tiếp tục');
  // Trong lúc bảo trì: người khác không ghi, không đăng nhập được
  assert.equal(kt.call('sync.bootstrap').code, 'SYSTEM_MAINTENANCE');
  assert.equal(makeClient(env).login('U-KT', '583017').code, 'SYSTEM_MAINTENANCE');
  const rec = recoveryClient(env, rq.data.recovery.token);
  assert.equal(rec.call('sync.bootstrap').code, 'SYSTEM_MAINTENANCE', 'phiên phục hồi không dùng cho nghiệp vụ');
  const run = drive(env, rec, pv.reset_run_id);
  assert.equal(run.status, 'COMPLETED', JSON.stringify(run).slice(0, 500));
  assert.equal(run.step, 'DONE');
  assert.ok(run.receipt.groups.catalog > 0);
  assert.equal(run.receipt.files.total, 2);
  assert.equal(run.receipt.files.kept, 2);
  assert.ok(run.backup_ref);
  // Sao lưu có kiểm chứng trước khi xóa
  const st = g.readState_().map;
  assert.equal(st.last_backup_status, 'VERIFIED');
  assert.equal(st.last_backup_ref, run.backup_ref);
  // Epoch mới, bảo trì tắt, trigger gỡ, ResetFiles bỏ chi tiết
  const newEpoch = env.props.getProperty('DATASET_EPOCH');
  assert.notEqual(newEpoch, oldEpoch);
  assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'false');
  assert.ok(!env.g.ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'resetContinue'));
  assert.equal(env.rows('ResetFiles').length, 0);
  assert.ok(st.last_reset_at);
  // Dữ liệu vận hành rỗng; mẫu báo cáo tích hợp nạp lại; giữ tài khoản/quyền/cấu hình/từ điển
  for (const t of ['Equipment', 'Materials', 'Locations', 'Vendors', 'LookupValues', 'Contracts', 'InspectionRequirements', 'Repairs', 'WorkOrders', 'Meters', 'Panels', 'QrRegistry', 'Documents', 'Alerts', 'NotificationLogs', 'ImportBatches', 'Operations', 'ReportRuns']) {
    assert.equal(env.rows(t).length, 0, t);
  }
  assert.equal(env.rows('ReportDefinitions').length, 8);
  assert.equal(env.rows('Users').length, before.users);
  assert.equal(env.rows('RolePermissions').length, before.perms);
  assert.equal(env.rows('Settings').length, before.settings);
  assert.equal(env.rows('Glossary').length, before.glossary);
  const audit = env.rows('AuditLogs');
  assert.ok(audit.some((a) => a.action === 'system.reset.complete'), 'biên nhận');
  assert.ok(audit.some((a) => a.action === 'system.reset.request'));
  assert.ok(!audit.some((a) => a.action === 'equipment.create' || a.action === 'doc.upload'), 'nhật ký nghiệp vụ cũ đã xóa');
  // File thật vẫn nằm trong Drive nhưng đã riêng tư (link cũ hết hiệu lực)
  const f = env.drive._files.get(doc.drive_file_id);
  assert.equal(f.access, 'PRIVATE');
  assert.equal(f.trashed, false);
  assert.equal(env.drive._files.get(doc.thumb_drive_file_id).access, 'PRIVATE');
  // Phiên cũ: DATASET_RESET (app xóa dữ liệu cũ, nháp thành "Nháp thế hệ dữ liệu cũ")
  assert.equal(kt.call('sync.changes', { cursor: 0 }).code, 'DATASET_RESET');
  assert.equal(c.call('sync.changes', { cursor: 0 }).code, 'DATASET_RESET');
  // Hàng chờ offline của epoch cũ bị từ chối
  const kt2 = makeClient(env);
  assert.equal(kt2.login('U-KT', '583017').ok, true);
  const old = kt2.call('sync.push', { op: { action: 'repair.report', payload: { repair_id: uuid(), equipment_id: eq.equipment_id, symptom_vi: 'x', severity: 'LOW' } } }, { operation_id: uuid(), dataset_epoch: oldEpoch });
  assert.equal(old.code, 'DATASET_RESET');
  // Tem cũ báo hết hiệu lực, không mở hồ sơ mới trùng mã
  const ow = makeClient(env);
  assert.equal(ow.login(OWNER_CODE, OWNER_PIN).data.session_kind, 'FULL');
  const q = ow.call('qr.resolve', { qr_key: qrKey });
  assert.equal(q.data.qr_state, 'EXPIRED');
  const neu = ow.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy mới sau reset' });
  assert.equal(neu.ok, true);
  const code = env.rows('Equipment')[0].equipment_code;
  assert.ok(Number(code.split('-')[1]) > Number(seqBefore || 0), 'bộ đếm mã không lùi: ' + code + ' > ' + seqBefore);
  assert.equal(ow.call('qr.resolve', { code: eq.equipment_code }).data.qr_state === 'OK' && env.rows('Equipment')[0].equipment_code === eq.equipment_code, false, 'mã cũ không trỏ vào hồ sơ mới');
  // Không gửi Gmail hạn cũ
  env.mail.sent.length = 0;
  g.sendExpiryDigest();
  assert.equal(env.mail.sent.length, 0);
  // Xem trước lần sau được (không còn đợt dở)
  assert.equal(ow.call('system.reset.preview').ok, true);
});

test('Sao lưu lỗi → dừng trước khi xóa (FAILED_NEEDS_RECOVERY, giữ bảo trì); owner hủy bằng PIN → dữ liệu và epoch như cũ', () => {
  const { env, c } = seed();
  const epoch = env.props.getProperty('DATASET_EPOCH');
  const n = env.rows('Equipment').length;
  const pv = preview(c);
  const rq = request(c, pv);
  const rec = recoveryClient(env, rq.data.recovery.token);
  const bk = env.props.getProperty('DRIVE_BACKUP_FOLDER_ID');
  env.props.deleteProperty('DRIVE_BACKUP_FOLDER_ID');
  const run = drive(env, rec, pv.reset_run_id);
  assert.equal(run.status, 'FAILED_NEEDS_RECOVERY');
  assert.equal(run.error_code, 'BACKUP_FAILED');
  assert.equal(run.step, 'BACKUP');
  assert.equal(run.can_cancel, true);
  assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'true', 'giữ bảo trì');
  assert.equal(env.rows('Equipment').length, n);
  assert.equal(env.props.getProperty('DATASET_EPOCH'), epoch);
  env.props.setProperty('DRIVE_BACKUP_FOLDER_ID', bk);
  assert.equal(rec.write('system.reset.resume', { reset_run_id: pv.reset_run_id, mode: 'CANCEL', pin: '000000' }).code, 'AUTH_FAILED');
  const cx = rec.write('system.reset.resume', { reset_run_id: pv.reset_run_id, mode: 'CANCEL', pin: OWNER_PIN });
  assert.equal(cx.ok, true, JSON.stringify(cx).slice(0, 300));
  assert.equal(cx.data.run.status, 'CANCELLED');
  assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'false');
  assert.equal(env.rows('Equipment').length, n);
  assert.equal(c.call('sync.changes', { cursor: 0 }).ok, true, 'phiên cũ vẫn dùng được (chưa đổi epoch)');
});

test('Ngắt giữa lúc xóa bảng → giữ bảo trì, cùng reset_run_id và epoch; không hủy được nữa; owner đăng nhập lại (phiên phục hồi) → Tiếp tục + PIN → hoàn tất', () => {
  const { env, c } = seed();
  const g = env.g;
  const pv = preview(c);
  const rq = request(c, pv);
  const rec = recoveryClient(env, rq.data.recovery.token);
  // Lỗi đúng một lần ở bảng QrRegistry (giả lập hết giờ/lỗi Sheets giữa lô)
  const orig = g.resetClearTable_;
  let thrown = false;
  g.resetClearTable_ = (name) => { if (name === 'QrRegistry' && !thrown) { thrown = true; throw new Error('Exceeded maximum execution time'); } return orig(name); };
  let run = drive(env, rec, pv.reset_run_id);
  assert.equal(run.status, 'FAILED_NEEDS_RECOVERY');
  assert.equal(run.phase, 'TABLES');
  assert.equal(run.step, 'DELETE');
  assert.equal(run.can_cancel, false);
  const epochMid = env.props.getProperty('DATASET_EPOCH');
  assert.equal(env.rows('Equipment').length, 0, 'đã xóa một phần');
  assert.ok(env.rows('QrRegistry').length > 0);
  assert.equal(env.props.getProperty('MAINTENANCE_MODE'), 'true', 'không tự mở lại app khi dữ liệu dở dang');
  assert.equal(rec.write('system.reset.resume', { reset_run_id: pv.reset_run_id, mode: 'CANCEL', pin: OWNER_PIN }).errors[0].code, 'NOT_RESUMABLE');
  // Owner mở máy khác, đăng nhập khi đang bảo trì → phiên phục hồi + mã đợt dở
  const ow = makeClient(env);
  const lr = ow.login(OWNER_CODE, OWNER_PIN);
  assert.equal(lr.data.session_kind, 'RECOVERY');
  assert.equal(lr.data.reset_run_id, pv.reset_run_id);
  const rs = ow.write('system.reset.resume', { reset_run_id: pv.reset_run_id, mode: 'CONTINUE', pin: OWNER_PIN });
  assert.equal(rs.ok, true, JSON.stringify(rs).slice(0, 300));
  run = drive(env, ow, pv.reset_run_id);
  assert.equal(run.status, 'COMPLETED', JSON.stringify(run).slice(0, 400));
  assert.equal(env.props.getProperty('DATASET_EPOCH'), epochMid, 'tiếp tục không đổi epoch lần nữa');
  assert.equal(env.rows('QrRegistry').length, 0);
  assert.equal(env.rows('ResetRuns').filter((r) => r.status !== 'PREVIEWED').length, 1, 'không tạo thêm đợt');
});

test('Trigger mỗi phút đẩy đợt khi app đã đóng; chỉ một nơi đẩy một lúc (lease)', () => {
  const { env, c } = seed();
  const g = env.g;
  const pv = preview(c);
  assert.equal(request(c, pv).ok, true);
  // Nơi khác đang giữ lease → trigger không chạy chồng
  env.props.setProperty('RESET_LEASE', JSON.stringify({ run: pv.reset_run_id, until: env.clock.Date.now() + 60000 }));
  g.resetContinue();
  assert.equal(env.rows('ResetRuns').find((r) => r.reset_run_id === pv.reset_run_id).status, 'LOCKED');
  env.props.deleteProperty('RESET_LEASE');
  for (let i = 0; i < 5; i++) g.resetContinue();
  assert.equal(env.rows('ResetRuns').find((r) => r.reset_run_id === pv.reset_run_id).status, 'COMPLETED');
  assert.ok(!g.ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'resetContinue'));
});

test('Chế độ thùng rác: file app quản lý vào thùng rác (sau khi về riêng tư); xóa vĩnh viễn khi bật Drive API; lỗi một file được nêu, không báo đã xóa', () => {
  const { env, c } = seed();
  const doc = env.rows('Documents')[0];
  let pv = preview(c);
  let rq = request(c, pv, { file_mode: 'TRASH' });
  let run = drive(env, recoveryClient(env, rq.data.recovery.token), pv.reset_run_id);
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.receipt.files.trashed, 2);
  assert.equal(env.drive._files.get(doc.drive_file_id).trashed, true);
  assert.equal(env.drive._files.get(doc.drive_file_id).access, 'PRIVATE');

  // Xóa vĩnh viễn: dịch vụ nâng cao Drive (giả lập); một file xóa lỗi
  const env2 = seed();
  const removed = [];
  env2.env.g.Drive = { Files: { remove: (id) => { if (removed.length === 1) throw new Error('403'); removed.push(id); env2.env.drive._files.delete(id); } } };
  const d2 = env2.env.rows('Documents')[0];
  pv = preview(env2.c);
  assert.equal(pv.file_modes.find((m) => m.mode === 'DELETE').available, true);
  rq = request(env2.c, pv, { file_mode: 'DELETE' });
  run = drive(env2.env, recoveryClient(env2.env, rq.data.recovery.token), pv.reset_run_id);
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.receipt.files.deleted, 1);
  assert.equal(run.receipt.files.failed, 1, 'file không xử lý được được nêu');
  assert.equal(env2.env.drive._files.has(d2.drive_file_id), false);
});
