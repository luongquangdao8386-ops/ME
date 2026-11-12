// d4.36: ảnh nền màn đăng nhập / trang chủ (43_bg.js, chép cách làm app ISO 1.0.0-d3.3): Quản trị (cấp 4, PIN) tải ảnh lên hoặc dùng lại
// ảnh mặc định; mọi người đã đăng nhập lấy ảnh (bg.get); cài đặt bg_<ô>_rev gửi xuống app (bootstrap + bg_revs trong sync.changes), ID
// tệp không gửi; tệp cũ vào thùng rác; nhật ký; Trạng thái hệ thống; không sửa tay ở Cấu hình; không cần migrateSchema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, fakeJpegB64, fakePdfB64, OWNER_PIN } from '../helpers.mjs';

const NOW = '2026-11-12T08:00:00+07:00';
const fields = (r) => (r.errors || []).map((e) => e.field + ':' + e.code).sort();
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const setting = (env, k) => (env.rows('Settings').find((s) => s.setting_key === k) || {}).value;

function setup() {
  const env = freshServer({ now: NOW });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const qt = userClient(env, 'U-QT', 4, '730185');
  qt.reauth = () => qt.call('auth.reauth', { pin: '730185' }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const c1 = userClient(env, 'U-C1', 1, '583921');
  return { env, c, qt, c3, c1 };
}

test('ảnh nền: Quản trị + PIN; kiểm tệp; lưu / lấy / thay / dùng lại ảnh mặc định; cài đặt gửi xuống app; nhật ký; Trạng thái hệ thống', () => {
  const { env, c, qt, c3, c1 } = setup();
  const jpg = fakeJpegB64(5000);
  // Chưa có ảnh riêng: cấp 1 lấy được (ảnh mặc định)
  assert.deepEqual(ok(c1.call('bg.get', { slot: 'LOGIN' })).data, { slot: 'LOGIN', rev: '' });
  assert.deepEqual(fields(c1.call('bg.get', { slot: 'XX' })), ['slot:INVALID_VALUE']);
  assert.deepEqual(fields(c1.call('bg.get', {})), ['slot:REQUIRED']);
  assert.equal(ok(c1.call('sync.changes', { cursor: '0', limit: 10 })).data.bg_revs.LOGIN, '', 'sync.changes báo mã ảnh nền');
  // Chưa đăng nhập: không lấy được
  assert.equal(env.post({ api_contract_version: '1.0', action: 'bg.get', payload: { slot: 'LOGIN' }, device_id: 'x', app_version: '1.0.0-d4.36' }).ok, false);
  // Trưởng bộ phận không thay được; Quản trị chưa nhập PIN → hỏi PIN
  assert.equal(c3.write('bg.set', { slot: 'LOGIN', content_b64: jpg, mime_type: 'image/jpeg' }, { reauth_token: c3.reauth() }).code, 'FORBIDDEN');
  assert.equal(qt.write('bg.set', { slot: 'LOGIN', content_b64: jpg, mime_type: 'image/jpeg' }).code, 'REAUTH_REQUIRED');
  // Kiểm tệp: loại, nội dung không đúng loại, quá 2 MB, ô sai
  assert.deepEqual(fields(qt.write('bg.set', { slot: 'LOGIN', content_b64: jpg, mime_type: 'image/gif' }, { reauth_token: qt.reauth() })), ['mime_type:FILE_TYPE']);
  assert.deepEqual(fields(qt.write('bg.set', { slot: 'LOGIN', content_b64: fakePdfB64(), mime_type: 'image/jpeg' }, { reauth_token: qt.reauth() })), ['mime_type:FILE_TYPE']);
  assert.deepEqual(fields(qt.write('bg.set', { slot: 'LOGIN', content_b64: fakeJpegB64(2 * 1048576 + 10), mime_type: 'image/jpeg' }, { reauth_token: qt.reauth() })), ['content_b64:FILE_TOO_LARGE']);
  assert.deepEqual(fields(qt.write('bg.set', { slot: 'HOMEPAGE', content_b64: jpg, mime_type: 'image/jpeg' }, { reauth_token: qt.reauth() })), ['slot:INVALID_VALUE']);
  // Lưu ảnh màn đăng nhập (Quản trị cấp 4 không phải owner)
  const rev1 = ok(qt.write('bg.set', { slot: 'LOGIN', content_b64: jpg, mime_type: 'image/jpeg' }, { reauth_token: qt.reauth() })).data.rev;
  assert.match(rev1, /^[A-Za-z0-9_-]{16}$/);
  const id1 = setting(env, 'bg_login_file_id');
  assert.ok(id1);
  const f1 = env.drive._files.get(id1);
  assert.ok(f1 && !f1.trashed);
  assert.equal(f1.name, 'bg_login.jpg');
  assert.equal(f1.access, 'PRIVATE', 'ảnh riêng tư, không chia sẻ link');
  // Cấp 1 lấy được ảnh; cài đặt gửi xuống app có rev, không có ID tệp; sync.changes báo rev mới
  const g1 = ok(c1.call('bg.get', { slot: 'LOGIN' })).data;
  assert.equal(g1.rev, rev1);
  assert.equal(g1.mime_type, 'image/jpeg');
  assert.equal(g1.content_b64, jpg);
  const st = ok(c1.call('sync.bootstrap', {})).data.settings;
  assert.equal(st.bg_login_rev, rev1);
  assert.ok(!('bg_login_file_id' in st), 'ID tệp Drive không gửi xuống app');
  assert.deepEqual(ok(c1.call('sync.changes', { cursor: '0', limit: 10 })).data.bg_revs, { LOGIN: rev1, HOME: '' });
  // Cùng ảnh: không tạo tệp mới
  const n = env.drive._files.size;
  assert.equal(ok(qt.write('bg.set', { slot: 'LOGIN', content_b64: jpg, mime_type: 'image/jpeg' }, { reauth_token: qt.reauth() })).data.rev, rev1);
  assert.equal(env.drive._files.size, n);
  assert.equal(setting(env, 'bg_login_file_id'), id1);
  // Thay ảnh khác: tệp cũ vào thùng rác
  const rev2 = ok(c.write('bg.set', { slot: 'LOGIN', content_b64: fakeJpegB64(7000), mime_type: 'image/jpeg' }, { reauth_token: c.reauth() })).data.rev;
  assert.notEqual(rev2, rev1);
  assert.equal(env.drive._files.get(id1).trashed, true);
  // Ảnh trang chủ riêng (PNG được); Trạng thái hệ thống
  const png = Buffer.alloc(3000, 9);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(png, 0);
  ok(c.write('bg.set', { slot: 'HOME', content_b64: png.toString('base64'), mime_type: 'image/png' }, { reauth_token: c.reauth() }));
  let h = ok(c.call('system.status', {})).data.checks.find((x) => x.key === 'bg');
  assert.equal(h.value, 'Đăng nhập: ảnh riêng · Trang chủ: ảnh riêng');
  // Dùng lại ảnh mặc định
  const id2 = setting(env, 'bg_login_file_id');
  assert.deepEqual(ok(c.write('bg.set', { slot: 'LOGIN', remove: true }, { reauth_token: c.reauth() })).data, { slot: 'LOGIN', rev: '' });
  assert.equal(env.drive._files.get(id2).trashed, true);
  assert.deepEqual(ok(c1.call('bg.get', { slot: 'LOGIN' })).data, { slot: 'LOGIN', rev: '' });
  assert.equal(ok(c1.call('sync.bootstrap', {})).data.settings.bg_login_rev, '');
  assert.equal(ok(c1.call('sync.changes', { cursor: '0', limit: 10 })).data.bg_revs.LOGIN, '');
  h = ok(c.call('system.status', {})).data.checks.find((x) => x.key === 'bg');
  assert.equal(h.value, 'Đăng nhập: ảnh mặc định · Trang chủ: ảnh riêng');
  // Bỏ lần nữa: không ghi gì
  ok(c.write('bg.set', { slot: 'LOGIN', remove: true }, { reauth_token: c.reauth() }));
  // Tệp trên Drive bị xóa tay: bg.get trả ảnh mặc định, không lỗi
  env.drive._files.get(setting(env, 'bg_home_file_id')).trashed = true;
  assert.deepEqual(ok(c1.call('bg.get', { slot: 'HOME' })).data, { slot: 'HOME', rev: '' });
  // Nhật ký: 4 lần đổi (lưu, thay, trang chủ, bỏ); Cấu hình không sửa tay
  const logs = env.rows('AuditLogs').filter((l) => l.action === 'bg.set');
  assert.equal(logs.length, 4);
  assert.deepEqual(fields(c.write('settings.edit', { changes: { bg_home_rev: 'abc' } }, { reauth_token: c.reauth() })), ['bg_home_rev:INVALID_VALUE']);
  // Quyền: bg.set có trong danh sách quyền của Quản trị, không có ở cấp 3; bg.get có ở mọi cấp
  const actsOf = (cl) => ok(cl.call('sync.bootstrap', {})).data.permissions.actions;
  const has = (acts, a) => (Array.isArray(acts) ? acts.includes(a) : !!acts[a]);
  assert.equal(has(actsOf(qt), 'bg.set'), true);
  assert.equal(has(actsOf(c3), 'bg.set'), false);
  assert.equal(has(actsOf(c1), 'bg.get'), true);
});

test('máy chủ cũ (Settings chưa có dòng bg_*): dán Code.gs mới, chưa chạy migrateSchema vẫn thay ảnh được; migrateSchema thêm dòng, không ghi đè ảnh đã đặt', () => {
  const { env, c, c1 } = setup();
  const g = env.g;
  g.dbReset_();
  const rows = g.readRows_('Settings').filter((r) => /^bg_/.test(r.setting_key)).map((r) => r.__row).sort((a, b) => b - a);
  assert.equal(rows.length, 4);
  rows.forEach((n) => g.sh_('Settings').deleteRow(n));
  g.cache_().remove('cfg:settings');
  g.dbReset_();
  assert.equal(env.rows('Settings').filter((r) => /^bg_/.test(r.setting_key)).length, 0);
  // Chưa có dòng: cài đặt lấy mặc định '' (ảnh mặc định)
  assert.equal(ok(c1.call('sync.bootstrap', {})).data.settings.bg_login_rev, '');
  assert.deepEqual(ok(c1.call('sync.changes', { cursor: '0', limit: 10 })).data.bg_revs, { LOGIN: '', HOME: '' });
  const r = ok(c.write('bg.set', { slot: 'HOME', content_b64: fakeJpegB64(4000), mime_type: 'image/jpeg' }, { reauth_token: c.reauth() }));
  assert.equal(ok(c1.call('sync.bootstrap', {})).data.settings.bg_home_rev, r.data.rev);
  env.logs.length = 0;
  g.migrateSchema();
  assert.ok(env.logs.some((l) => /migrateSchema xong\. Thêm: không có\./.test(l)), env.logs.join('\n'));
  assert.equal(env.rows('Settings').filter((x) => /^bg_/.test(x.setting_key)).length, 4);
  assert.equal(setting(env, 'bg_home_rev'), r.data.rev, 'migrateSchema không ghi đè ảnh đã đặt');
});
