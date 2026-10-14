// Chuẩn bị THẬT (phụ lục 1.5 mục 6.7): ENV bắt buộc trước setup, THẬT không có PoC/giả lập, owner quên PIN, khóa tạm còn sót
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from '../gas-mock.mjs';
import { freshServer, ownerClient, makeClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

test('setup từ chối chạy khi chưa đặt ENV (hoặc sai), không tạo gì', () => {
  for (const v of [null, 'that', 'PROD']) {
    const env = loadServer();
    if (v) env.props.setProperty('ENV', v);
    assert.throws(() => env.g.setup(), /ENV/);
    assert.equal(env.props.getProperty('BUSINESS_SPREADSHEET_ID'), null);
    assert.equal(env.drive._folders.size, 0);
  }
});

test('setup ở THẬT: thư mục/bảng tính không hậu tố _THU, epoch riêng; Bàn thử PoC và giả lập TEST_* không chạy', () => {
  const env = freshServer({ envName: 'THAT' });
  const g = env.g;
  const names = [...env.drive._folders.values()].map((f) => f.name).sort();
  assert.deepEqual(names, ['ME_Backups', 'ME_Data', 'ME_HeThong']);
  const files = [...env.drive._files.values()].map((f) => f.name);
  assert.ok(files.includes('ME_NghiepVu') && files.includes('ME_BaoMat'), files.join(','));
  const thu = freshServer();
  assert.notEqual(env.props.getProperty('DATASET_EPOCH'), thu.props.getProperty('DATASET_EPOCH'));

  const c = ownerClient(env);
  const b = c.call('sync.bootstrap');
  assert.equal(b.data.env, 'THAT');
  assert.ok(!b.data.permissions.actions.some((a) => a.startsWith('poc.')), 'không có quyền poc.* ở THẬT');
  for (const a of ['poc.echo', 'poc.stats', 'poc.makeTestFiles']) assert.equal(c.call(a).code, 'FEATURE_NOT_ENABLED', a);
  assert.throws(() => g.pocSeedSampleData(), /THỬ/);
  assert.throws(() => g.pocMailTest(), /THỬ/);
  assert.throws(() => g.pocTranslateTest(), /THỬ/);
  env.props.setProperty('POC_RESET_CODE', OWNER_CODE);
  env.props.setProperty('POC_RESET_TEMP_PIN', '739154');
  assert.throws(() => g.pocResetPin(), /THỬ/);

  // TEST_TODAY bị bỏ qua ở THẬT, có hiệu lực ở THỬ
  env.props.setProperty('TEST_TODAY', '2030-01-01');
  thu.props.setProperty('TEST_TODAY', '2030-01-01');
  assert.notEqual(g.todayVN_(), '2030-01-01');
  assert.equal(thu.g.todayVN_(), '2030-01-01');
  assert.equal(makeClient(env).call('system.getPublicState').data.env, 'THAT');
});

test('adminResetOwnerPin: owner quên PIN được cấp PIN tạm từ trình soạn, phiên cũ bị thu hồi, khóa tự xóa, không ghi PIN vào log', () => {
  const env = freshServer({ envName: 'THAT' });
  const c = ownerClient(env);
  assert.ok(c.call('sync.bootstrap').ok);

  // PIN tạm yếu: báo lỗi, khóa vẫn bị xóa, PIN cũ vẫn dùng được
  env.props.setProperty('OWNER_RESET_TEMP_PIN', '111111');
  assert.throws(() => env.g.adminResetOwnerPin(), /dễ đoán/);
  assert.equal(env.props.getProperty('OWNER_RESET_TEMP_PIN'), null);
  assert.ok(c.call('sync.bootstrap').ok);

  env.props.setProperty('OWNER_RESET_TEMP_PIN', '739154');
  env.g.adminResetOwnerPin();
  assert.equal(env.props.getProperty('OWNER_RESET_TEMP_PIN'), null);
  assert.equal(c.call('sync.bootstrap').data.reason, 'AUTH_VERSION');
  assert.equal(makeClient(env).login(OWNER_CODE, OWNER_PIN).code, 'AUTH_FAILED');
  const c2 = makeClient(env);
  assert.equal(c2.login(OWNER_CODE, '739154').code, 'MUST_CHANGE_PIN');
  assert.ok(c2.call('pin.change', { current_pin: '739154', new_pin: '582046' }).ok);
  assert.ok(!env.logs.join('\n').includes('739154'), 'không ghi PIN vào log');
  const audit = env.rows('AuditLogs').filter((a) => a.action === 'user.resetPin');
  assert.equal(audit.length, 1);

  // Chưa setup / chưa có owner / thiếu khóa
  const blank = loadServer();
  blank.props.setProperty('OWNER_RESET_TEMP_PIN', '739154');
  assert.throws(() => blank.g.adminResetOwnerPin(), /setup/);
  assert.throws(() => env.g.adminResetOwnerPin(), /OWNER_RESET_TEMP_PIN/);
});

test('healthCheck báo khóa tạm còn sót: PIN tạm mọi môi trường, TEST_* chỉ ở THẬT; không in giá trị', () => {
  const that = freshServer({ envName: 'THAT' });
  const row = (env) => env.g.healthCheck().find((r) => r.key === 'temp_props');
  assert.equal(row(that).status, 'OK');
  that.props.setProperty('TEST_TODAY', '2030-01-01');
  that.props.setProperty('SETUP_OWNER_TEMP_PIN', '640218');
  const r = row(that);
  assert.equal(r.status, 'WARN');
  assert.equal(r.value, 'SETUP_OWNER_TEMP_PIN, TEST_TODAY');
  assert.ok(!that.logs.join('\n').includes('640218'));

  const thu = freshServer();
  thu.props.setProperty('TEST_TODAY', '2030-01-01');
  assert.equal(row(thu).status, 'OK', 'THỬ được dùng TEST_TODAY');
  thu.props.setProperty('POC_RESET_TEMP_PIN', '739154');
  assert.equal(row(thu).value, 'POC_RESET_TEMP_PIN');
  // màn Trạng thái hệ thống (system.status) có cùng dòng
  const c = ownerClient(that);
  const st = c.call('system.status', {}, { operation_id: uuid() });
  assert.ok(st.ok, JSON.stringify(st).slice(0, 300));
  assert.equal(st.data.checks.find((x) => x.key === 'temp_props').status, 'WARN');
});
