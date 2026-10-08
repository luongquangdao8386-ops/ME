import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from '../gas-mock.mjs';
import { freshServer } from '../helpers.mjs';

test('setup tạo 31 sheet Đợt 1, Settings, SystemState, 60 dòng RolePermissions', () => {
  const env = freshServer();
  const g = env.g;
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  const sec = env.ssApp.openById(env.props.getProperty('SECURITY_SPREADSHEET_ID'));
  assert.equal(biz.getSheets().length, 26);
  assert.equal(sec.getSheets().length, 5);
  assert.deepEqual(sec.getSheets().map((s) => s.getName()).sort(), ['AuthAttempts', 'RolePermissions', 'Sessions', 'UserScopes', 'Users']);
  assert.ok(biz.getSheetByName('Glossary'));
  assert.equal(biz.getSheetByName('Sheet1'), null);
  assert.equal(g.SETTINGS_DEFAULTS.length, 50);
  const settings = env.rows('Settings');
  assert.equal(settings.length, 48, 'chỉ khóa của Đợt 1');
  assert.ok(settings.every((s) => s.description_vi && s.description_zh));
  assert.equal(env.rows('RolePermissions').length, 60);
  const st = g.readState_().map;
  assert.equal(st.schema_version, '1.5.0');
  assert.equal(st.perm_version, 1);
  assert.equal(st.dataset_epoch, env.props.getProperty('DATASET_EPOCH'));
  assert.match(env.props.getProperty('DATASET_EPOCH'), /^[0-9a-f-]{36}$/);
  assert.equal(env.props.getProperty('ENV'), 'THU');
  assert.ok(env.props.getProperty('PIN_PEPPER_V1'));
  assert.notEqual(env.props.getProperty('PIN_PEPPER_V1'), env.props.getProperty('TOKEN_SECRET_V1'));
  // owner
  const users = env.rows('Users');
  assert.equal(users.length, 1);
  assert.equal(users[0].role_level, 4);
  assert.equal(users[0].is_system_owner, true);
  assert.equal(users[0].must_change_pin, true);
  assert.equal(env.props.getProperty('SETUP_OWNER_TEMP_PIN'), null, 'khóa PIN tạm phải bị xóa');
  assert.ok(!env.logs.join('\n').includes('358024'), 'không ghi PIN vào log');
});

test('setup chạy lại không làm gì; migrateSchema chạy nhiều lần vẫn cùng kết quả', () => {
  const env = freshServer();
  const biz = env.props.getProperty('BUSINESS_SPREADSHEET_ID');
  env.g.setup();
  assert.equal(env.props.getProperty('BUSINESS_SPREADSHEET_ID'), biz);
  env.g.migrateSchema();
  env.g.migrateSchema();
  assert.equal(env.rows('RolePermissions').length, 60);
  assert.equal(env.rows('Settings').length, 48);
  const keys = env.rows('SystemState').map((r) => r.state_key);
  assert.equal(new Set(keys).size, keys.length, 'không trùng khóa SystemState');
});

test('migrateSchema thêm cột còn thiếu ở cuối, không mất dữ liệu', () => {
  const env = freshServer();
  const g = env.g;
  const sheet = env.ssApp.openById(env.props.getProperty('SECURITY_SPREADSHEET_ID')).getSheetByName('Users');
  // Giả lập sheet cũ thiếu cột cuối
  const hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastIdx = hdr.indexOf('updated_by');
  sheet.getRange(1, lastIdx + 1).setValue('');
  g.migrateSchema();
  const hdr2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.ok(hdr2.includes('updated_by'));
  assert.equal(env.rows('Users').length, 1);
});

test('ô ID/DATE/DATETIME là Văn bản: ngày không bị Sheets đổi thành Date', () => {
  const env = freshServer();
  const u = env.rows('Users')[0];
  assert.equal(typeof u.temp_pin_expires_at, 'string');
  assert.match(u.temp_pin_expires_at, /\+07:00$/);
});

test('test vector HMAC, base64url, SHA-256, Crockford khớp giá trị độc lập', () => {
  const env = loadServer();
  const r = env.g.pocComputeVectors_();
  assert.equal(r.all_pass, true, JSON.stringify(r, null, 1));
});

test('installTriggers cài đúng 3 trigger, chạy lại không nhân đôi', () => {
  const env = freshServer();
  env.g.installTriggers();
  env.g.installTriggers();
  const t = env.g.ScriptApp.getProjectTriggers().map((x) => x.getHandlerFunction()).sort();
  assert.deepEqual(t, ['backupData', 'runBackgroundJobs', 'sendExpiryDigest']);
});

test('pocSeedSampleData tạo dữ liệu mẫu một lần, ghi PIN mẫu vào log', () => {
  const env = freshServer();
  env.g.pocSeedSampleData();
  env.g.pocSeedSampleData();
  assert.equal(env.rows('Equipment').length, 5);
  assert.equal(env.rows('InspectionRequirements').length, 3);
  assert.equal(env.rows('QrRegistry').length, 8);
  const codes = env.rows('Equipment').map((e) => e.equipment_code);
  assert.deepEqual(codes, ['TB-0001', 'TB-0002', 'TB-0003', 'TB-0004', 'TB-0005']);
  assert.ok(env.logs.some((l) => /MAU-C1 \/ \d{6}/.test(l)));
});

test('pocSeedSampleData từ chối chạy ở THẬT', () => {
  const env = freshServer();
  env.props.setProperty('ENV', 'THAT');
  assert.throws(() => env.g.pocSeedSampleData(), /THỬ/);
});

test('pocResetPin cấp PIN tạm mới, thu hồi phiên cũ, mở khóa', async () => {
  const { ownerClient, makeClient, OWNER_CODE, OWNER_PIN } = await import('../helpers.mjs');
  const env = freshServer();
  const c = ownerClient(env);
  env.props.setProperty('POC_RESET_CODE', OWNER_CODE);
  env.props.setProperty('POC_RESET_TEMP_PIN', '739154');
  env.g.pocResetPin();
  assert.equal(env.props.getProperty('POC_RESET_TEMP_PIN'), null);
  assert.equal(c.call('sync.bootstrap').data.reason, 'AUTH_VERSION');
  assert.equal(makeClient(env).login(OWNER_CODE, OWNER_PIN).code, 'AUTH_FAILED');
  assert.equal(makeClient(env).login(OWNER_CODE, '739154').code, 'MUST_CHANGE_PIN');
});

test('due_revision là chuỗi (vd. VALID_TO:ngày:id), ô định dạng Văn bản', () => {
  const env = freshServer();
  const g = env.g;
  const dr = 'VALID_TO:2026-10-07:' + '0'.repeat(8) + '-0000-4000-8000-' + '0'.repeat(12);
  g.insertRows_('Alerts', [{ alert_id: g.uuid_(), entity_type: 'INSPECTION_REQUIREMENT', entity_id: g.uuid_(), due_revision: dr, due_date: '2026-10-07', days_remaining: 30, alert_state: 'OPEN' }]);
  assert.equal(env.rows('Alerts')[0].due_revision, dr);
  assert.equal(g.colType_('due_revision'), 'STRING');
});
