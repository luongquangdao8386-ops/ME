/* 15_admin: hàm chạy từ trình soạn Apps Script và trigger (phụ lục 1.5 mục 3.14)
 * Tên không có hậu tố "_" để hiện trong menu Chạy; không có tham số. */

function log_(msg) {
  Logger.log(msg);
}

/** Tạo một sheet với hàng tiêu đề, cố định hàng 1, định dạng ô theo kiểu (3.1) */
function createSheet_(book, name) {
  var s = sheetSchema_(name);
  var sheet = book.insertSheet(name);
  var cols = s.cols;
  if (sheet.getMaxColumns() < cols.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  formatColumns_(sheet, name, cols, 0);
  return sheet;
}

/** Đặt định dạng Văn bản (@) cho các cột ID/CODE/DATE/DATETIME/JSON/STRING/ENUM từ vị trí fromIdx; gom cột liền nhau */
function formatColumns_(sheet, name, headerCols, fromIdx) {
  var types = sheetSchema_(name).types;
  var rows = Math.max(1, sheet.getMaxRows() - 1);
  var i = fromIdx;
  while (i < headerCols.length) {
    if (!TEXT_FORMAT_TYPES_[types[headerCols[i]] || 'STRING']) { i++; continue; }
    var j = i;
    while (j + 1 < headerCols.length && TEXT_FORMAT_TYPES_[types[headerCols[j + 1]] || 'STRING']) j++;
    sheet.getRange(2, i + 1, rows, j - i + 1).setNumberFormat('@');
    i = j + 1;
  }
}

function settingRow_(d) {
  var v = d[1] === 'JSON' ? JSON.stringify(d[2]) : (d[1] === 'BOOL' ? (d[2] ? 'true' : 'false') : String(d[2]));
  return { setting_key: d[0], value: v, value_type: d[1], description_vi: d[5], description_zh: d[6], updated_at: isoVN_(now_()), updated_by: SYSTEM_USER, i18n_meta: { description: { src: 'vi', state: 'HUMAN', at: isoVN_(now_()) } } };
}

/** Dựng môi trường mới (THỬ hoặc THẬT). Đã có BUSINESS_SPREADSHEET_ID thì dừng. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('BUSINESS_SPREADSHEET_ID')) {
    log_('Đã cài đặt trước đó — không làm gì. Muốn thêm sheet/cột thì chạy migrateSchema.');
    return;
  }
  if (!props.getProperty('ENV')) props.setProperty('ENV', 'THU');
  var env = props.getProperty('ENV');
  if (env !== 'THU' && env !== 'THAT') throw new Error('ENV phải là THU hoặc THAT');
  adminSetupSecrets();
  var suffix = env === 'THU' ? '_THU' : '';
  var parent = DriveApp.createFolder(NAME_PREFIX + 'HeThong' + suffix);
  var dataFolder = parent.createFolder(NAME_PREFIX + 'Data' + suffix);
  var backupFolder = parent.createFolder(NAME_PREFIX + 'Backups' + suffix);
  var biz = SpreadsheetApp.create(NAME_PREFIX + 'NghiepVu' + suffix);
  var sec = SpreadsheetApp.create(NAME_PREFIX + 'BaoMat' + suffix);
  biz.setSpreadsheetTimeZone(TZ);
  sec.setSpreadsheetTimeZone(TZ);
  DriveApp.getFileById(biz.getId()).moveTo(parent);
  DriveApp.getFileById(sec.getId()).moveTo(parent);
  props.setProperties({
    BUSINESS_SPREADSHEET_ID: biz.getId(), SECURITY_SPREADSHEET_ID: sec.getId(),
    DRIVE_ROOT_FOLDER_ID: dataFolder.getId(), DRIVE_BACKUP_FOLDER_ID: backupFolder.getId(),
    DATASET_EPOCH: uuid_(), MAINTENANCE_MODE: 'false'
  });
  dbReset_();
  sheetsForDot_(RELEASED_DOT).forEach(function (name) {
    createSheet_(sheetSchema_(name).book === 'S' ? sec : biz, name);
  });
  [biz, sec].forEach(function (b) {
    b.getSheets().forEach(function (s) { if (!SHEETS[s.getName()]) b.deleteSheet(s); });
  });
  dbReset_();
  seedBaseRows_();
  clearSysCaches_();
  log_('Xong setup. ENV=' + env + '. Đã tạo ' + sheetsForDot_(RELEASED_DOT).length + ' sheet trong thư mục ' + parent.getName() +
    '. Bước tiếp theo: đặt SETUP_OWNER_CODE, SETUP_OWNER_NAME, SETUP_OWNER_TEMP_PIN rồi chạy adminSetupOwner.');
}

/** Nạp Settings, SystemState, RolePermissions còn thiếu (dùng chung cho setup và migrateSchema) */
function seedBaseRows_() {
  withWriteLock_(function () {
    var have = {};
    readRows_('Settings').forEach(function (r) { have[r.setting_key] = true; });
    var add = SETTINGS_DEFAULTS.filter(function (d) { return d[4] <= RELEASED_DOT && !have[d[0]]; }).map(settingRow_);
    if (add.length) insertRows_('Settings', add);

    var st = readState_();
    var su = {};
    SYSTEM_STATE_INITIAL.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(st.map, k[0])) su[k[0]] = [k[1], k[2]];
    });
    su.dataset_epoch = ['STRING', prop_('DATASET_EPOCH')];
    su.maintenance_mode = ['BOOL', prop_('MAINTENANCE_MODE') === 'true'];
    su.schema_version = ['STRING', SCHEMA_VERSION];
    stateWrite_(st, su, SYSTEM_USER);
    seedRolePermissions_();
  });
}

/** Nạp đủ 60 dòng RolePermissions; chỉ thêm dòng còn thiếu (4.8) */
function seedRolePermissions_() {
  var have = {};
  readRows_('RolePermissions').forEach(function (r) { have[r.permission_id] = true; });
  var nowIso = isoVN_(now_());
  var add = defaultRolePermissionRows_().filter(function (r) { return !have[r.permission_id]; });
  add.forEach(function (r) { r.updated_at = nowIso; r.updated_by = SYSTEM_USER; });
  if (add.length) insertRows_('RolePermissions', add);
  return add.length;
}

/** Thêm sheet/cột/Settings/RolePermissions còn thiếu của đợt; chạy nhiều lần vẫn cùng kết quả */
function migrateSchema() {
  if (!prop_('BUSINESS_SPREADSHEET_ID')) throw new Error('Chưa setup');
  dbReset_();
  var added = [];
  sheetsForDot_(RELEASED_DOT).forEach(function (name) {
    var s = sheetSchema_(name);
    var book = book_(s.book);
    var sheet = book.getSheetByName(name);
    if (!sheet) { createSheet_(book, name); added.push(name); return; }
    var n = sheet.getLastColumn();
    var header = n ? sheet.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
    var missing = s.cols.filter(function (c) { return header.indexOf(c) < 0; });
    if (missing.length) {
      if (sheet.getMaxColumns() < header.length + missing.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length + missing.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
      added.push(name + '(' + missing.join(',') + ')');
    }
    // Định dạng Văn bản cho mọi cột kiểu chuỗi, kể cả cột cũ vừa đổi kiểu (vd. due_revision)
    formatColumns_(sheet, name, header.concat(missing), 0);
  });
  dbReset_();
  seedBaseRows_();
  clearSysCaches_();
  log_('migrateSchema xong. Thêm: ' + (added.length ? added.join('; ') : 'không có') + '. schema_version=' + SCHEMA_VERSION);
}

function clearSysCaches_() {
  cache_().removeAll(['sys:props', 'sys:state', 'cfg:settings']);
}

/** Sinh PIN_PEPPER_V1, TOKEN_SECRET_V1 nếu chưa có; không ghi đè */
function adminSetupSecrets() {
  var props = PropertiesService.getScriptProperties();
  ['PIN_PEPPER_V1', 'TOKEN_SECRET_V1'].forEach(function (k) {
    if (props.getProperty(k)) { log_(k + ': đã có, giữ nguyên.'); return; }
    props.setProperty(k, b64_(randomSecret32_()));
    log_(k + ': đã tạo.');
  });
}

/** Tạo owner đầu tiên từ SETUP_OWNER_CODE, SETUP_OWNER_NAME, SETUP_OWNER_TEMP_PIN; xóa ba khóa ngay sau khi dùng */
function adminSetupOwner() {
  if (!prop_('BUSINESS_SPREADSHEET_ID')) throw new Error('Chưa setup — chạy setup trước.');
  var code = normEmpCode_(prop_('SETUP_OWNER_CODE'));
  var name = trimStr_(prop_('SETUP_OWNER_NAME'));
  var pin = trimStr_(prop_('SETUP_OWNER_TEMP_PIN'));
  if (!code || !name || !pin) throw new Error('Thiếu SETUP_OWNER_CODE / SETUP_OWNER_NAME / SETUP_OWNER_TEMP_PIN trong Thuộc tính tập lệnh.');
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(code)) throw new Error('Mã nhân viên chỉ gồm chữ, số, dấu . _ -');
  var weak = pinWeakReason_(pin, code, null);
  if (weak) throw new Error('PIN tạm không hợp lệ hoặc quá dễ đoán (' + weak + '). Chọn 6 số khác.');
  dbReset_();
  var created = withWriteLock_(function () {
    var users = readRows_('Users');
    if (users.some(function (u) { return u.is_system_owner && u.active && Number(u.role_level) === 4; })) {
      return 'EXISTS';
    }
    if (users.some(function (u) { return u.employee_code === code; })) throw new Error('Mã nhân viên đã tồn tại: ' + code);
    var rec = newPinRecord_(pin);
    var nowIso = isoVN_(now_());
    insertRows_('Users', [{
      user_id: uuid_(), employee_code: code, display_name: name, email: '', role_level: 4, active: true,
      pin_hash: rec.pin_hash, salt: rec.salt, pin_hash_version: rec.pin_hash_version, failed_attempts: 0, locked_until: '',
      created_at: nowIso, updated_at: nowIso, auth_version: 1, is_system_owner: true, must_change_pin: true,
      temp_pin_expires_at: isoVN_(new Date(now_().getTime() + setting_('temp_pin_hours') * 3600000)), pin_changed_at: '',
      failed_window_started_at: '', last_login_at: '', record_version: 1, created_by: SYSTEM_USER, updated_by: SYSTEM_USER
    }]);
    return 'CREATED';
  });
  ['SETUP_OWNER_CODE', 'SETUP_OWNER_NAME', 'SETUP_OWNER_TEMP_PIN'].forEach(delProp_);
  if (created === 'EXISTS') log_('Đã có owner đang hoạt động — không tạo thêm. Đã xóa 3 khóa SETUP_OWNER_*.');
  else log_('Đã tạo owner ' + code + ' (cấp 4). Đăng nhập bằng PIN tạm trong 72 giờ, app sẽ bắt đổi PIN. Đã xóa 3 khóa SETUP_OWNER_*.');
}

var TRIGGER_FUNCS_ = ['sendExpiryDigest', 'runBackgroundJobs', 'backupData'];

/** Xóa trigger trùng tên rồi tạo lại đúng 3 trigger định kỳ */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_FUNCS_.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendExpiryDigest').timeBased().everyDays(1).atHour(Number(setting_('email_hour'))).inTimezone(TZ).create();
  ScriptApp.newTrigger('runBackgroundJobs').timeBased().everyHours(3).create();
  var wd = ScriptApp.WeekDay[String(setting_('backup_weekday') || 'SUNDAY')] || ScriptApp.WeekDay.SUNDAY;
  ScriptApp.newTrigger('backupData').timeBased().onWeekDay(wd).atHour(Number(setting_('backup_hour'))).inTimezone(TZ).create();
  var names = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  log_('Đã cài trigger: ' + names.join(', '));
}

function setMaintenance_(on) {
  setProp_('MAINTENANCE_MODE', on ? 'true' : 'false');
  withWriteLock_(function () {
    var st = readState_();
    stateWrite_(st, { maintenance_mode: ['BOOL', !!on] }, SYSTEM_USER);
  });
  cache_().removeAll(['sys:props', 'sys:state']);
}

function adminMaintenanceOn() { setMaintenance_(true); log_('Đã BẬT bảo trì.'); }
function adminMaintenanceOff() { setMaintenance_(false); log_('Đã TẮT bảo trì.'); }

function adminClearLoginPause() {
  withWriteLock_(function () {
    var st = readState_();
    stateWrite_(st, { login_paused_until: ['DATETIME', ''] }, SYSTEM_USER);
  });
  cache_().remove('sys:state');
  log_('Đã gỡ tạm dừng đăng nhập.');
}

function adminFlushAuthCache() {
  var keys = [];
  readRows_('Sessions').forEach(function (s) { keys.push('ss:' + s.session_id); });
  readRows_('Users').forEach(function (u) {
    keys.push('us:' + u.user_id);
    for (var v = 0; v <= (u.auth_version || 0) + 1; v++) keys.push('scope:' + u.user_id + ':' + v);
  });
  for (var i = 0; i < keys.length; i += 500) cache_().removeAll(keys.slice(i, i + 500));
  log_('Đã xóa ' + keys.length + ' khóa cache phiên/người dùng.');
}

function adminFinalizeManualRestore() {
  throw new Error('Khôi phục thủ công (6.5.4) làm ở Đợt 1 sau PoC.');
}

/* ---------------- Trigger ---------------- */

/** Hằng ngày: (Đợt 1) tính Alerts và gửi email; dọn AuthAttempts > 90 ngày và Sessions cũ */
function sendExpiryDigest() {
  if (prop_('MAINTENANCE_MODE') === 'true') return;
  var keepDays = setting_('auth_attempts_retention_days');
  var cutoff = now_().getTime() - keepDays * 86400000;
  withWriteLock_(function () {
    var rows = readRows_('AuthAttempts');
    var n = 0;
    while (n < rows.length) {
      var t = parseTime_(rows[n].occurred_at);
      if (!t || t.getTime() >= cutoff) break;
      n++;
    }
    if (n > 0) sh_('AuthAttempts').deleteRows(2, n);
  });
  var sCut = now_().getTime() - 30 * 86400000;
  withWriteLock_(function () {
    var del = readRows_('Sessions').filter(function (s) {
      var end = parseTime_(s.revoked_at) || parseTime_(s.expires_at);
      return end && end.getTime() < sCut;
    }).map(function (s) { return s.__row; }).sort(function (a, b) { return b - a; });
    del.slice(0, 200).forEach(function (r) { sh_('Sessions').deleteRow(r); });
  });
  log_('sendExpiryDigest: đã dọn nhật ký đăng nhập và phiên cũ. Nhắc hạn Gmail bật ở Đợt 1 (sau PoC).');
}

var MT_SHEETS_ = { Equipment: ['name'], Documents: ['title'] };

/** Mỗi 3 giờ: dịch bù trường PENDING (2.3); không tăng record_version */
function runBackgroundJobs() {
  if (prop_('MAINTENANCE_MODE') === 'true') return;
  if (!mtEnabled_()) return;
  var t0 = Date.now();
  var done = 0;
  Object.keys(MT_SHEETS_).forEach(function (sheet) {
    if (Date.now() - t0 > 150000) return;
    readRows_(sheet).forEach(function (r) {
      if (Date.now() - t0 > 150000 || !r.i18n_meta) return;
      MT_SHEETS_[sheet].forEach(function (f) {
        var m = r.i18n_meta[f];
        if (!m || m.state !== 'PENDING') return;
        var srcText = trimStr_(r[f + '_' + m.src]);
        var out = mtTranslate_(srcText, m.src, m.src === 'vi' ? 'zh' : 'vi');
        if (!out) return;
        withWriteLock_(function () {
          var cur = readRowAt_(sheet, r.__row);
          var key = sheetSchema_(sheet).key;
          if (cur[key] !== r[key] || trimStr_(cur[f + '_' + m.src]) !== srcText) return;
          var meta = cur.i18n_meta || {};
          if (!meta[f] || meta[f].state !== 'PENDING') return;
          meta[f] = { src: m.src, state: 'MACHINE', at: isoVN_(now_()) };
          var st = readState_();
          var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
          var upd = { i18n_meta: meta, sync_revision: rev };
          upd[f + '_' + (m.src === 'vi' ? 'zh' : 'vi')] = out;
          writeCells_(sheet, r.__row, upd);
          var su = { sync_revision: ['INT', rev] };
          su['table_rev.' + sheet] = ['INT', rev];
          stateWrite_(st, su, SYSTEM_USER);
          writeAudit_({ user_id: SYSTEM_USER, action: 'i18n.machineTranslate', entity_type: sheet, entity_id: r[key], before_json: null, after_json: { field: f }, auth_basis: 'SYSTEM' });
          done++;
        });
      });
    });
  });
  log_('runBackgroundJobs: dịch bù ' + done + ' trường.');
}

/** Hằng tuần: sao lưu có kiểm chứng (6.5.4) — làm ở Đợt 1 sau PoC */
function backupData() {
  log_('backupData: sao lưu tự động sẽ có ở Đợt 1 (sau PoC).');
}
