import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from '../gas-mock.mjs';
import { freshServer, makeClient, OWNER_CODE, OWNER_TEMP_PIN, OWNER_PIN } from '../helpers.mjs';

test('setup tạo 53 sheet Đợt 1–4, Settings, SystemState, 60 dòng RolePermissions, 8 mẫu báo cáo tích hợp', () => {
  const env = freshServer();
  const g = env.g;
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  const sec = env.ssApp.openById(env.props.getProperty('SECURITY_SPREADSHEET_ID'));
  assert.equal(biz.getSheets().length, 48);
  for (const n of ['ResetRuns', 'ResetFiles']) assert.ok(biz.getSheetByName(n), n);
  assert.equal(sec.getSheets().length, 5);
  for (const n of ['Meters', 'MeterSegments', 'MeterReadings', 'MeterEvents', 'UtilityTariffs', 'Panels', 'Circuits', 'CircuitLoads', 'ReportDefinitions', 'ReportRuns']) assert.ok(biz.getSheetByName(n), n);
  const defs = env.rows('ReportDefinitions');
  assert.deepEqual(defs.map((d) => d.code).sort(), ['RPT_CIRCUITS', 'RPT_CONTRACTS', 'RPT_EQUIPMENT', 'RPT_INSPECTIONS', 'RPT_MAINTENANCE', 'RPT_MATERIALS', 'RPT_REPAIRS', 'RPT_UTILITIES']);
  assert.ok(defs.every((d) => d.builtin === true && d.active === true && d.title_vi && d.title_zh));
  assert.equal(defs.find((d) => d.code === 'RPT_CIRCUITS').title_vi, 'Lộ điện và phụ tải', 'C1: không dùng chữ "mạch điện"');
  assert.deepEqual(sec.getSheets().map((s) => s.getName()).sort(), ['AuthAttempts', 'RolePermissions', 'Sessions', 'UserScopes', 'Users']);
  assert.ok(biz.getSheetByName('Glossary'));
  assert.equal(biz.getSheetByName('Sheet1'), null);
  assert.equal(g.SETTINGS_DEFAULTS.length, 51);
  const settings = env.rows('Settings');
  assert.equal(settings.length, 51, 'khóa của Đợt 1–3');
  assert.ok(settings.every((s) => s.description_vi && s.description_zh));
  assert.equal(env.rows('RolePermissions').length, 60);
  const st = g.readState_().map;
  assert.equal(st.schema_version, '1.5.4');
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
  assert.equal(env.rows('Settings').length, 51);
  assert.equal(env.rows('ReportDefinitions').length, 8, 'mẫu tích hợp không nạp trùng');
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

test('nâng THẬT từ Đợt 1 lên Đợt 2: migrateSchema thêm 10 sheet, cột old_material_id, khóa wo_generate_days_ahead; giữ dữ liệu cũ (6.9.1)', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 1;
  env.props.setProperty('ENV', 'THAT');
  g.setup();
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  assert.equal(biz.getSheets().length, 26);
  assert.equal(biz.getSheetByName('WorkOrders'), null);
  // Một dòng dữ liệu Đợt 1 để kiểm không mất
  g.dbReset_();
  g.withWriteLock_(() => g.insertRows_('Locations', [{ location_id: g.uuid_(), location_code: 'KV-001', name_vi: 'Xưởng A', active: true, record_version: 1 }]));
  const epoch = env.props.getProperty('DATASET_EPOCH');
  g.RELEASED_DOT = 2;
  g.SCHEMA_VERSION = '1.5.2'; // mã Đợt 2
  g.migrateSchema();
  g.migrateSchema();
  assert.equal(biz.getSheets().length, 36);
  for (const n of ['MaintenancePlans', 'ChecklistTemplates', 'WorkOrders', 'WorkOrderResults', 'Repairs', 'RepairTasks', 'MaterialRequests', 'MaterialRequestLines', 'MaterialUsageLines', 'OperatingReadings']) assert.ok(biz.getSheetByName(n), n);
  const eps = biz.getSheetByName('EquipmentPartEvents');
  const hdr = eps.getRange(1, 1, 1, eps.getLastColumn()).getValues()[0];
  assert.ok(hdr.includes('old_material_id'));
  assert.equal(env.rows('Locations').length, 1);
  assert.equal(env.props.getProperty('DATASET_EPOCH'), epoch, 'nâng đợt không đổi epoch (nháp, tem giữ nguyên)');
  assert.ok(env.rows('Settings').some((x) => x.setting_key === 'wo_generate_days_ahead'));
  assert.equal(g.readState_().map.schema_version, '1.5.2');
});

test('dán Code.gs Đợt 2 mà chưa chạy migrateSchema: app vẫn chạy Đợt 1, action Đợt 2 trả FEATURE_NOT_ENABLED; chạy xong thì bật', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 1;
  env.props.setProperty('ENV', 'THU');
  g.setup();
  env.props.setProperty('SETUP_OWNER_CODE', OWNER_CODE);
  env.props.setProperty('SETUP_OWNER_NAME', 'Chủ');
  env.props.setProperty('SETUP_OWNER_TEMP_PIN', OWNER_TEMP_PIN);
  g.adminSetupOwner();
  // Đợt 1 đang chạy với schema 1.5.0
  g.dbReset_();
  g.withWriteLock_(() => { const st = g.readState_(); g.stateWrite_(st, { schema_version: ['STRING', '1.5.0'] }, 'TEST'); });
  env.cache.clear && env.cache.clear();
  g.RELEASED_DOT = 2;
  g.clearSysCaches_();
  const c = makeClient(env);
  c.login(OWNER_CODE, OWNER_TEMP_PIN);
  c.token = c.call('pin.change', { current_pin: OWNER_TEMP_PIN, new_pin: OWNER_PIN }).data.token;
  const b = c.call('sync.bootstrap', {});
  assert.equal(b.ok, true, JSON.stringify(b).slice(0, 300));
  assert.equal(b.data.records.WORK_ORDER, undefined);
  assert.ok(!b.data.permissions.actions.includes('maintenance.view'));
  assert.equal(c.call('maintenance.view', {}).code, 'FEATURE_NOT_ENABLED');
  assert.equal(c.call('sync.changes', { cursor: 0 }).data.released_dot, 1);
  g.migrateSchema();
  // App đang mở: sync.changes báo đợt mới → app tải lại quyền và dữ liệu (cùng phiên bản máy chủ)
  assert.equal(c.call('sync.changes', { cursor: 0 }).data.released_dot, 2);
  const b2 = c.call('sync.bootstrap', {});
  assert.ok(b2.data.permissions.actions.includes('maintenance.view'));
  assert.equal(c.call('maintenance.view', {}).code, 'OK');
});

test('nâng THẬT từ Đợt 2 lên Đợt 3: migrateSchema thêm 10 sheet, cột duyệt bản vẽ ở Documents, 2 khóa Settings, 8 mẫu báo cáo; giữ dữ liệu cũ (6.9.2)', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 2;
  g.SCHEMA_VERSION = '1.5.2';
  env.props.setProperty('ENV', 'THAT');
  g.setup();
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  assert.equal(biz.getSheets().length, 36);
  assert.equal(biz.getSheetByName('Meters'), null);
  // Documents của THẬT tạo từ Đợt 1 chưa có 3 cột duyệt bản vẽ: giả lập bằng cách bỏ tên 3 cột cuối
  const docs0 = biz.getSheetByName('Documents');
  const h0 = docs0.getRange(1, 1, 1, docs0.getLastColumn()).getValues()[0];
  for (const c of ['approval_status', 'approved_by', 'approved_at']) docs0.getRange(1, h0.indexOf(c) + 1).setValue('');
  g.dbReset_();
  g.withWriteLock_(() => g.insertRows_('Locations', [{ location_id: g.uuid_(), location_code: 'KV-001', name_vi: 'Xưởng A', active: true, record_version: 1 }]));
  const epoch = env.props.getProperty('DATASET_EPOCH');
  g.RELEASED_DOT = 3;
  g.SCHEMA_VERSION = '1.5.3';
  g.migrateSchema();
  g.migrateSchema();
  assert.equal(biz.getSheets().length, 46);
  for (const n of ['Meters', 'MeterSegments', 'MeterReadings', 'MeterEvents', 'UtilityTariffs', 'Panels', 'Circuits', 'CircuitLoads', 'ReportDefinitions', 'ReportRuns']) assert.ok(biz.getSheetByName(n), n);
  const docs = biz.getSheetByName('Documents');
  const hdr = docs.getRange(1, 1, 1, docs.getLastColumn()).getValues()[0];
  for (const c of ['approval_status', 'approved_by', 'approved_at']) assert.ok(hdr.includes(c), c);
  assert.equal(env.rows('Locations').length, 1);
  assert.equal(env.props.getProperty('DATASET_EPOCH'), epoch, 'nâng đợt không đổi epoch (nháp, tem giữ nguyên)');
  const keys = env.rows('Settings').map((x) => x.setting_key);
  assert.ok(keys.includes('meter_boundary_window_hours') && keys.includes('reading_self_edit_hours'));
  assert.equal(env.rows('ReportDefinitions').length, 8);
  assert.equal(g.readState_().map.schema_version, '1.5.3');
});

test('nâng THẬT thẳng từ Đợt 1 lên Đợt 3 (chưa phát hành Đợt 2): một lần migrateSchema thêm đủ 20 sheet, cột, khóa Settings, mẫu báo cáo', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 1;
  g.SCHEMA_VERSION = '1.5.1';
  env.props.setProperty('ENV', 'THAT');
  g.setup();
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  assert.equal(biz.getSheets().length, 26);
  g.dbReset_();
  g.withWriteLock_(() => g.insertRows_('Locations', [{ location_id: g.uuid_(), location_code: 'KV-001', name_vi: 'Xưởng A', active: true, record_version: 1 }]));
  const epoch = env.props.getProperty('DATASET_EPOCH');
  g.RELEASED_DOT = 3;
  g.SCHEMA_VERSION = '1.5.3';
  g.migrateSchema();
  assert.equal(biz.getSheets().length, 46);
  for (const n of ['MaintenancePlans', 'WorkOrders', 'Repairs', 'OperatingReadings', 'Meters', 'MeterReadings', 'Panels', 'Circuits', 'ReportDefinitions', 'ReportRuns']) assert.ok(biz.getSheetByName(n), n);
  const keys = env.rows('Settings').map((x) => x.setting_key);
  for (const k of ['wo_generate_days_ahead', 'meter_boundary_window_hours', 'reading_self_edit_hours']) assert.ok(keys.includes(k), k);
  assert.equal(env.rows('ReportDefinitions').length, 8);
  assert.equal(env.rows('Locations').length, 1);
  assert.equal(env.props.getProperty('DATASET_EPOCH'), epoch);
  assert.equal(g.readState_().map.schema_version, '1.5.3');
  assert.equal(g.releasedDot_(), 3);
});

test('dán Code.gs Đợt 3 mà chưa chạy migrateSchema: app chạy như Đợt 2 (bảo trì được, điện nước FEATURE_NOT_ENABLED); chạy xong thì bật Đợt 3', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 2;
  g.SCHEMA_VERSION = '1.5.2';
  env.props.setProperty('ENV', 'THU');
  g.setup();
  env.props.setProperty('SETUP_OWNER_CODE', OWNER_CODE);
  env.props.setProperty('SETUP_OWNER_NAME', 'Chủ');
  env.props.setProperty('SETUP_OWNER_TEMP_PIN', OWNER_TEMP_PIN);
  g.adminSetupOwner();
  g.RELEASED_DOT = 3;
  g.SCHEMA_VERSION = '1.5.3';
  g.clearSysCaches_();
  const c = makeClient(env);
  c.login(OWNER_CODE, OWNER_TEMP_PIN);
  c.token = c.call('pin.change', { current_pin: OWNER_TEMP_PIN, new_pin: OWNER_PIN }).data.token;
  const b = c.call('sync.bootstrap', {});
  assert.equal(b.ok, true, JSON.stringify(b).slice(0, 300));
  assert.equal(b.data.released_dot, 2);
  assert.equal(b.data.records.METER, undefined);
  assert.ok(b.data.permissions.actions.includes('maintenance.view'));
  assert.ok(!b.data.permissions.actions.includes('utility.view'));
  assert.equal(c.call('maintenance.view', {}).code, 'OK');
  assert.equal(c.call('utility.view', {}).code, 'FEATURE_NOT_ENABLED');
  assert.equal(c.call('report.run', { code: 'RPT_EQUIPMENT' }).code, 'FEATURE_NOT_ENABLED');
  g.migrateSchema();
  assert.equal(c.call('sync.changes', { cursor: 0 }).data.released_dot, 3);
  const b2 = c.call('sync.bootstrap', {});
  assert.ok(b2.data.permissions.actions.includes('utility.view'));
  assert.equal(b2.data.records.REPORT_DEFINITION.length, 8);
  assert.equal(c.call('utility.view', {}).code, 'OK');
});

test('dán Code.gs Đợt 4 mà chưa chạy migrateSchema: app chạy như Đợt 3 (Xóa sạch FEATURE_NOT_ENABLED, không lộ sheet chưa có); chạy xong thì owner thấy Xóa sạch', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 3;
  g.SCHEMA_VERSION = '1.5.3';
  env.props.setProperty('ENV', 'THU');
  g.setup();
  env.props.setProperty('SETUP_OWNER_CODE', OWNER_CODE);
  env.props.setProperty('SETUP_OWNER_NAME', 'Chủ');
  env.props.setProperty('SETUP_OWNER_TEMP_PIN', OWNER_TEMP_PIN);
  g.adminSetupOwner();
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  assert.equal(biz.getSheetByName('ResetRuns'), null);
  g.RELEASED_DOT = 4;
  g.SCHEMA_VERSION = '1.5.4';
  g.clearSysCaches_();
  const c = makeClient(env);
  c.login(OWNER_CODE, OWNER_TEMP_PIN);
  c.token = c.call('pin.change', { current_pin: OWNER_TEMP_PIN, new_pin: OWNER_PIN }).data.token;
  const b = c.call('sync.bootstrap', {});
  assert.equal(b.data.released_dot, 3);
  assert.ok(!b.data.permissions.actions.includes('system.reset.preview'));
  assert.equal(c.call('system.reset.status', {}).code, 'FEATURE_NOT_ENABLED');
  assert.equal(c.call('utility.view', {}).code, 'OK', 'Đợt 3 vẫn chạy');
  const health = g.healthCheck();
  assert.ok(health, 'healthCheck chạy được khi chưa có ResetRuns');
  g.migrateSchema();
  assert.ok(biz.getSheetByName('ResetRuns') && biz.getSheetByName('ResetFiles'));
  assert.equal(c.call('sync.changes', { cursor: 0 }).data.released_dot, 4);
  assert.ok(c.call('sync.bootstrap', {}).data.permissions.actions.includes('system.reset.preview'));
  assert.equal(c.call('system.reset.status', { overview: true }).ok, true);
});
