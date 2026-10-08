/* 24_system: nhật ký thao tác, cấu hình, bảng quyền, trạng thái hệ thống — phụ lục 1.5 mục 4.4.16, 4.8, 3.14, 5.2 (Trạng thái hệ thống).
 * system.status (C4) là bổ sung kỹ thuật: màn Trạng thái hệ thống chỉ đọc kết quả healthCheck và danh sách Settings. */

/* ---------------- Nhật ký thao tác ---------------- */

/** Module của một dòng AuditLogs theo action (để lọc quyền xem) */
function auditModule_(a) {
  var act = String(a.action || '');
  var pre = act.split('.')[0];
  var map = {
    equipment: 'equipment', part: 'equipment', material: 'warehouse', contract: 'contracts', inspection: 'inspections',
    notify: 'notifications', location: 'catalog', vendor: 'catalog', lookup: 'catalog', glossary: 'catalog',
    user: 'users', auth: 'users', session: 'users', pin: 'users', settings: 'system', permission: 'system', system: 'system', backup: 'system'
  };
  if (map[pre]) return map[pre];
  if (pre === 'alert') return a.entity_type === 'CONTRACT' ? 'contracts' : 'inspections';
  if (pre === 'doc' || pre === 'qr' || pre === 'i18n' || pre === 'import' || pre === 'export') {
    var et = ENTITY_TYPES[a.entity_type];
    if (et && et.module) return et.module;
    var sh = SHEETS[a.entity_type];
    if (sh) {
      var e2 = Object.keys(ENTITY_TYPES).filter(function (k) { return ENTITY_TYPES[k].sheet === a.entity_type; })[0];
      return e2 ? ENTITY_TYPES[e2].module : 'catalog';
    }
    return 'catalog';
  }
  return 'system';
}

/** Bỏ trường giá khỏi before/after khi người xem không có quyền giá của module */
function stripCost_(o) {
  if (!o || typeof o !== 'object') return o;
  var out = Array.isArray(o) ? [] : {};
  Object.keys(o).forEach(function (k) {
    if (['value', 'price', 'cost', 'currency', 'unit_price', 'amount'].indexOf(k) >= 0) return;
    out[k] = typeof o[k] === 'object' ? stripCost_(o[k]) : o[k];
  });
  return out;
}

function projectAudit_(ctx, a, costMods, dir) {
  var mod = auditModule_(a);
  var o = {
    audit_id: a.audit_id, occurred_at: a.occurred_at, user_id: a.user_id, action: a.action, entity_type: a.entity_type, entity_id: a.entity_id,
    before_json: a.before_json || null, after_json: a.after_json || null, reason: a.reason || '', operation_id: a.operation_id || '',
    auth_basis: a.auth_basis || '', module: mod
  };
  if (!costMods[mod]) { o.before_json = stripCost_(o.before_json); o.after_json = stripCost_(o.after_json); }
  var u = dir[a.user_id];
  o.user_name = u ? u.employee_code + ' · ' + u.display_name : a.user_id;
  return o;
}

/** audit.own: nhật ký thao tác và trạng thái đồng bộ (Operations) của chính mình */
function auditOwn_(ctx) {
  var uid = ctx.user.user_id;
  var costMods = {};
  BUSINESS_MODULES_.forEach(function (m) { costMods[m] = canViewCost_(ctx, m); });
  var dir = userDirectory_();
  var logs = findAll_('AuditLogs', 'user_id', uid).sort(function (a, b) { return String(b.occurred_at).localeCompare(String(a.occurred_at)); })
    .slice(0, 200).map(function (a) { return projectAudit_(ctx, a, costMods, dir); });
  var ops = findAll_('Operations', 'user_id', uid).sort(function (a, b) { return String(b.received_at).localeCompare(String(a.received_at)); })
    .slice(0, 100).map(function (o) {
      return { operation_id: o.operation_id, action: o.action, entity_type: o.entity_type, entity_id: o.entity_id, state: o.state, result_code: o.result_code, received_at: o.received_at, committed_at: o.committed_at };
    });
  return { items: logs, operations: ops };
}

/**
 * audit.view {module?, entity_id?, user_id?, action?, from?, to?, limit?}: C3, C4.
 * C3 không xem module users/system và nhật ký xác thực; giá ẩn khi thiếu quyền giá.
 */
function auditView_(ctx) {
  var p = ctx.req.payload || {};
  var lvl = Number(ctx.user.role_level);
  var costMods = {};
  BUSINESS_MODULES_.forEach(function (m) { costMods[m] = canViewCost_(ctx, m); });
  var dir = userDirectory_();
  var limit = Math.min(500, Number(p.limit) || 200);
  var from = p.from && isDateStr_(p.from) ? p.from : '', to = p.to && isDateStr_(p.to) ? p.to : '';
  var items = [];
  var rows = readRows_('AuditLogs');
  for (var i = rows.length - 1; i >= 0 && items.length < limit; i--) {
    var a = rows[i];
    var mod = auditModule_(a);
    if (lvl < 4 && (mod === 'users' || mod === 'system')) continue;
    if (p.module && mod !== p.module) continue;
    if (p.entity_id && a.entity_id !== p.entity_id) continue;
    if (p.user_id && a.user_id !== p.user_id) continue;
    if (p.action && String(a.action).indexOf(p.action) !== 0) continue;
    var day = String(a.occurred_at).slice(0, 10);
    if (from && day < from) continue;
    if (to && day > to) continue;
    items.push(projectAudit_(ctx, a, costMods, dir));
  }
  items.sort(function (x, y) { return String(y.occurred_at).localeCompare(String(x.occurred_at)); });
  return { items: items, more: items.length >= limit };
}

/** audit.auth (C4, PIN): nhật ký đăng nhập, phiên đang hiệu lực; không có token_hash, mã băm nhân viên */
function auditAuth_(ctx) {
  var dir = userDirectory_();
  var name = function (id) { var u = dir[id]; return u ? u.employee_code + ' · ' + u.display_name : ''; };
  var att = readRows_('AuthAttempts');
  var attempts = att.slice(Math.max(0, att.length - 300)).reverse().map(function (r) {
    return { occurred_at: r.occurred_at, outcome: r.outcome, attempt_kind: r.attempt_kind, user: r.user_id ? name(r.user_id) : '', device: String(r.device_id || '').slice(0, 8) };
  });
  var t = now_().getTime();
  var sessions = readRows_('Sessions').filter(function (s) { return isSessionActive_(s, t); }).map(function (s) {
    return { session_id: s.session_id, user: name(s.user_id), session_kind: s.session_kind, device_label: s.device_label, issued_at: s.issued_at, last_seen_at: s.last_seen_at, expires_at: s.expires_at };
  }).sort(function (a, b) { return String(b.last_seen_at).localeCompare(String(a.last_seen_at)); });
  return { attempts: attempts, sessions: sessions, login_paused_until: sysStateCached_().login_paused_until || '' };
}

/* ---------------- Cấu hình ---------------- */

/** Khóa không sửa trong app: mốc A7 cố định, kho làm sau, khóa của đợt sau */
var SETTINGS_READONLY_ = { email_stages: 1, overdue_repeat_days: 1, lead_days: 1, warehouse_connected: 1 };
var SETTINGS_BOUNDS_ = {
  session_days: [1, 90], session_warn_days: [0, 30], change_pin_session_minutes: [5, 60], reauth_window_minutes: [1, 30], temp_pin_hours: [1, 168],
  max_sessions_per_user: [1, 50], login_fail_limit: [3, 20], login_fail_window_minutes: [1, 120], login_lock_minutes: [1, 1440],
  login_global_fail_limit: [5, 1000], login_global_window_minutes: [1, 120], login_global_pause_minutes: [1, 1440], auth_attempts_retention_days: [7, 3650],
  offline_unlock_attempts: [3, 20], offline_lock_minutes: [1, 1440], offline_max_lockouts: [1, 10], offline_pbkdf2_iterations: [150000, 2000000],
  offline_probe_seconds: [3, 30], mt_chunk_chars: [200, 5000], mt_max_fields_per_request: [1, 100], mt_sync_budget_seconds: [1, 20], mt_daily_budget: [0, 100000],
  email_hour: [0, 23], email_max_attempts: [1, 10], client_timeout_seconds: [10, 60], client_long_timeout_seconds: [20, 300], list_page_size: [10, 200],
  sync_page_size: [100, 2000], doc_max_bytes: [1048576, 52428800], doc_mobile_upload_max_bytes: [1048576, 52428800], offline_files_max_mb: [10, 2000],
  photo_max_edge_px: [640, 4096], photo_jpeg_quality: [0.5, 0.95], photo_thumb_edge_px: [120, 1024], backup_hour: [0, 23], backup_keep_count: [2, 52],
  meter_boundary_window_hours: [1, 24], reading_self_edit_hours: [1, 168]
};
var SETTINGS_ENUMS_ = {
  backup_weekday: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
  qr_label_size: ['SMALL_70X37', 'LARGE_105X74']
};

function settingsList_() {
  var s = settings_();
  return SETTINGS_DEFAULTS.filter(function (d) { return d[4] <= RELEASED_DOT; }).map(function (d) {
    return {
      key: d[0], type: d[1], value: s[d[0]], default_value: d[2], client: !!d[3], description_vi: d[5], description_zh: d[6],
      readonly: !!SETTINGS_READONLY_[d[0]], bounds: SETTINGS_BOUNDS_[d[0]] || null, options: SETTINGS_ENUMS_[d[0]] || null
    };
  });
}

/** Chuẩn hóa và kiểm một giá trị Settings; ném VALIDATION_ERROR */
function parseSettingInput_(def, v) {
  var key = def[0], type = def[1];
  var bad = function () { return validationError_([fieldError_(key, 'INVALID_VALUE')]); };
  if (type === 'INT' || type === 'NUMBER') {
    var n = Number(v);
    if (v === '' || v === null || !isFinite(n) || (type === 'INT' && Math.floor(n) !== n)) throw bad();
    var b = SETTINGS_BOUNDS_[key];
    if (b && (n < b[0] || n > b[1])) throw bad();
    return n;
  }
  if (type === 'BOOL') { if (typeof v !== 'boolean') throw bad(); return v; }
  if (type === 'ENUM') { if ((SETTINGS_ENUMS_[key] || []).indexOf(v) < 0) throw bad(); return v; }
  if (type === 'JSON') {
    var arr = typeof v === 'string' ? JSON.parse(v) : v;
    if (!Array.isArray(arr)) throw bad();
    if (key === 'self_approval_exceptions') {
      arr.forEach(function (e) {
        var def2 = e && ACTION_REGISTRY[e.action_code];
        if (!def2 || def2.flags.indexOf('A') < 0) throw bad();
      });
    }
    return arr;
  }
  var s = trimStr_(v);
  if (key === 'app_base_url' && s && !/^https:\/\/[^\s]+\/$/.test(s)) throw bad();
  if (key === 'min_client_version' && !/^\d+\.\d+\.\d+$/.test(s)) throw bad();
  if (key === 'default_currency' && !/^[A-Z]{3}$/.test(s)) throw bad();
  if (s.length > 500) throw bad();
  return s;
}

/** settings.edit {changes: {key: value}, reason} — C4, PIN. Khóa chỉ đọc không sửa được */
function settingsEdit_(ctx) {
  var p = ctx.req.payload || {};
  var changes = p.changes && typeof p.changes === 'object' ? p.changes : null;
  if (!changes || !Object.keys(changes).length) throw validationError_([fieldError_('changes', 'REQUIRED')]);
  var parsed = {};
  var errs = [];
  Object.keys(changes).forEach(function (k) {
    var def = SETTINGS_DEFAULTS.filter(function (d) { return d[0] === k; })[0];
    if (!def || def[4] > RELEASED_DOT || SETTINGS_READONLY_[k]) { errs.push(fieldError_(k, 'INVALID_VALUE')); return; }
    try { parsed[k] = parseSettingInput_(def, changes[k]); } catch (e) { errs.push(fieldError_(k, 'INVALID_VALUE')); }
  });
  if (parsed.client_long_timeout_seconds !== undefined || parsed.client_timeout_seconds !== undefined) {
    var shortT = parsed.client_timeout_seconds !== undefined ? parsed.client_timeout_seconds : setting_('client_timeout_seconds');
    var longT = parsed.client_long_timeout_seconds !== undefined ? parsed.client_long_timeout_seconds : setting_('client_long_timeout_seconds');
    if (longT < shortT) errs.push(fieldError_('client_long_timeout_seconds', 'INVALID_VALUE'));
  }
  if (errs.length) throw validationError_(errs);
  var before = {};
  Object.keys(parsed).forEach(function (k) { before[k] = setting_(k); });
  withWriteLock_(function () {
    Object.keys(parsed).forEach(function (k) { writeSetting_(k, parsed[k], ctx.user.user_id); });
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'settings.edit', entity_type: 'SETTINGS', entity_id: Object.keys(parsed).join(','),
      before_json: before, after_json: parsed, operation_id: ctx.req.operation_id || '', reason: trimStr_(p.reason).slice(0, 300), auth_basis: 'ROLE_LEVEL' });
  });
  cache_().remove('cfg:settings');
  DB_.settings = null;
  if (['email_hour', 'backup_weekday', 'backup_hour'].some(function (k) { return parsed[k] !== undefined && parsed[k] !== before[k]; })) {
    try { installTriggers(); } catch (e) { console.warn('installTriggers ' + (e && e.message)); }
  }
  return { settings: settingsList_() };
}

/* ---------------- Bảng quyền (4.8) ---------------- */

/** Ô khóa: không sửa được trong app */
function permLocked_(level, module) {
  if (level === 4 && module === 'users') return 'VCEA';
  if (level === 4 && module === 'system') return 'VER';
  if (level === 4 && module === 'audit') return 'V';
  if (level === 4 && module === 'backup') return 'VE';
  return 'R';
}

function permissionMatrix_() {
  var rows = readRows_('RolePermissions');
  var out = [];
  [1, 2, 3, 4].forEach(function (lvl) {
    PERM_MODULES.forEach(function (m) {
      var r = rows.filter(function (x) { return Number(x.role_level) === lvl && x.module === m; })[0];
      var flags = '';
      if (r) Object.keys(FLAG_COL_).forEach(function (k) { if (r[FLAG_COL_[k]]) flags += k; });
      var ceil = roleCeiling_(lvl, m);
      out.push({ role_level: lvl, module: m, flags: flags, ceiling: ceil, locked: permLocked_(lvl, m), missing: !r,
        over_ceiling: flags.split('').filter(function (f) { return ceil.indexOf(f) < 0; }).join('') });
    });
  });
  return out;
}

/** permission.view (C4, PIN): ma trận 60 ô, trần, ô khóa */
function permissionView_(ctx) {
  return { rows: permissionMatrix_(), perm_version: sysStateCached_().perm_version || 1, flags: Object.keys(FLAG_COL_) };
}

/**
 * permission.edit {changes: [{role_level, module, flags}], reason} — C4, PIN, bắt nhập lý do.
 * Kiểm trần, không đổi ô khóa; ghi trước–sau; perm_version + 1 (có hiệu lực ở request kế tiếp).
 */
function permissionEdit_(ctx) {
  var p = ctx.req.payload || {};
  var reason = trimStr_(p.reason);
  var errs = [];
  if (!reason) errs.push(fieldError_('reason', 'REQUIRED'));
  var changes = Array.isArray(p.changes) ? p.changes : [];
  if (!changes.length) errs.push(fieldError_('changes', 'REQUIRED'));
  changes.forEach(function (c, i) {
    var lvl = Number(c.role_level);
    var f = String(c.flags || '');
    if (!(lvl >= 1 && lvl <= 4) || PERM_MODULES.indexOf(c.module) < 0 || !/^[VCEAIX$R]*$/.test(f)) { errs.push(fieldError_('changes', 'INVALID_VALUE', i)); return; }
    var ceil = roleCeiling_(lvl, c.module);
    if (f.split('').some(function (x) { return ceil.indexOf(x) < 0; })) errs.push(fieldError_('changes', 'PERM_CEILING', i));
  });
  if (errs.length) throw validationError_(errs);
  var before = [], after = [];
  withWriteLock_(function () {
    var rows = readRows_('RolePermissions');
    changes.forEach(function (c, i) {
      var lvl = Number(c.role_level);
      var r = rows.filter(function (x) { return Number(x.role_level) === lvl && x.module === c.module; })[0];
      if (!r) throw validationError_([fieldError_('changes', 'NOT_FOUND', i)]);
      var cur = '';
      Object.keys(FLAG_COL_).forEach(function (k) { if (r[FLAG_COL_[k]]) cur += k; });
      var want = String(c.flags || '');
      var locked = permLocked_(lvl, c.module);
      // Ô khóa giữ nguyên giá trị đang có
      var diffLocked = locked.split('').some(function (k) { return (cur.indexOf(k) >= 0) !== (want.indexOf(k) >= 0); });
      if (diffLocked) throw validationError_([fieldError_('changes', 'PERM_LOCKED', i)]);
      if (cur === want) return;
      var upd = { updated_at: isoVN_(now_()), updated_by: ctx.user.user_id };
      Object.keys(FLAG_COL_).forEach(function (k) { upd[FLAG_COL_[k]] = want.indexOf(k) >= 0; });
      writeCells_('RolePermissions', r.__row, upd);
      before.push({ role_level: lvl, module: c.module, flags: cur });
      after.push({ role_level: lvl, module: c.module, flags: want });
    });
    if (!after.length) return;
    var st = readState_();
    var pv = Number(stateGet_(st, 'perm_version', 1)) + 1;
    stateWrite_(st, { perm_version: ['INT', pv] }, ctx.user.user_id);
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'permission.edit', entity_type: 'PERMISSIONS', entity_id: 'RolePermissions',
      before_json: before, after_json: after, operation_id: ctx.req.operation_id || '', reason: reason.slice(0, 300), auth_basis: 'ROLE_LEVEL' });
  });
  SpreadsheetApp.flush();
  cache_().remove('sys:state');
  DB_.rolePerms = null;
  return { changed: after.length, rows: permissionMatrix_(), perm_version: sysStateCached_().perm_version };
}

/* ---------------- Trạng thái hệ thống (healthCheck) ---------------- */

/** Ghi thời gian chạy trigger (24 giờ gần nhất) để healthCheck báo tổng phút */
function recordTriggerRun_(fn, startMs) {
  try {
    var now = Date.now();
    var list = JSON.parse(prop_('TRIGGER_RUNS') || '[]').filter(function (r) { return now - r.s < 86400000; });
    list.push({ f: fn, s: startMs, ms: now - startMs });
    setProp_('TRIGGER_RUNS', JSON.stringify(list.slice(-60)));
  } catch (e) { /* không chặn trigger */ }
}

/** Kết quả kiểm tra: [{key, ok: 'OK'|'WARN', value, note}] */
function healthRows_() {
  var rows = [];
  var add = function (key, ok, value, note) { rows.push({ key: key, status: ok ? 'OK' : 'WARN', value: value === undefined ? '' : value, note: note || '' }); };
  dbReset_();
  var st = readState_();
  var props = sysProps_();
  add('schema_version', String(stateGet_(st, 'schema_version', '')) === SCHEMA_VERSION, stateGet_(st, 'schema_version', ''), SCHEMA_VERSION);
  add('server_version', true, SERVER_VERSION);
  add('dataset_epoch', !!props.dataset_epoch, String(props.dataset_epoch || '').slice(0, 8));
  add('env', true, envName_());
  add('maintenance', !props.maintenance_mode, props.maintenance_mode ? 'ON' : 'OFF');
  var trig = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var missing = TRIGGER_FUNCS_.filter(function (f) { return trig.indexOf(f) < 0; });
  add('triggers', !missing.length, trig.join(', '), missing.length ? 'Thiếu: ' + missing.join(', ') + ' — chạy installTriggers' : '');
  var runs = [];
  try { runs = JSON.parse(prop_('TRIGGER_RUNS') || '[]'); } catch (e) { runs = []; }
  var minutes = Math.round(runs.filter(function (r) { return Date.now() - r.s < 86400000; }).reduce(function (s, r) { return s + r.ms; }, 0) / 600) / 100;
  add('trigger_minutes_24h', minutes < 90, minutes);
  var lb = stateGet_(st, 'last_backup_at', ''), lbs = stateGet_(st, 'last_backup_status', '');
  var lbt = parseTime_(lb);
  add('last_backup', lbs === 'VERIFIED' && lbt && now_().getTime() - lbt.getTime() < 8 * 86400000, (lb ? lb.slice(0, 16).replace('T', ' ') : '') + (lbs ? ' · ' + lbs : ''), stateGet_(st, 'last_backup_ref', ''));
  var mtp = parseTime_(stateGet_(st, 'mt_paused_until', ''));
  add('mt_paused_until', !(mtp && mtp.getTime() > now_().getTime()), stateGet_(st, 'mt_paused_until', ''));
  var lpu = parseTime_(stateGet_(st, 'login_paused_until', ''));
  add('login_paused_until', !(lpu && lpu.getTime() > now_().getTime()), stateGet_(st, 'login_paused_until', ''));
  var quota = MailApp.getRemainingDailyQuota();
  add('mail_quota', quota > 10, quota);
  var lastSent = '';
  readRows_('NotificationLogs').forEach(function (n) { if (n.status === 'SENT' && String(n.sent_at) > lastSent) lastSent = String(n.sent_at); });
  add('last_mail_sent', true, lastSent ? lastSent.slice(0, 16).replace('T', ' ') : '', setting_('gmail_enabled') ? 'Gmail ON' : 'Gmail OFF');
  var base = String(setting_('app_base_url') || '');
  add('app_base_url', !!base, base, base ? '' : 'Chưa điền app_base_url (link trong email)');
  var over = permissionMatrix_().filter(function (r) { return r.over_ceiling || r.missing; });
  add('permissions_ceiling', !over.length, over.length, over.map(function (r) { return r.role_level + '|' + r.module; }).join(', '));
  var docBad = 0, checked = 0;
  readRows_('Documents').forEach(function (d) {
    if (!d.active || !d.drive_file_id || checked >= 300) return;
    checked++;
    try { DriveApp.getFileById(d.drive_file_id); } catch (e) { docBad++; }
  });
  add('documents_broken', !docBad, docBad, checked >= 300 ? 'Đã kiểm 300 tệp đầu' : '');
  var cells = 0;
  [prop_('BUSINESS_SPREADSHEET_ID'), prop_('SECURITY_SPREADSHEET_ID')].forEach(function (id) {
    if (!id) return;
    SpreadsheetApp.openById(id).getSheets().forEach(function (s) { cells += s.getMaxRows() * s.getMaxColumns(); });
  });
  add('spreadsheet_cells', cells < 5000000, cells);
  return rows;
}

/** Chạy từ trình soạn: in kết quả kiểm tra */
function healthCheck() {
  var rows = healthRows_();
  rows.forEach(function (r) { log_((r.status === 'OK' ? 'ĐẠT     ' : 'CẢNH BÁO') + '  ' + r.key + ': ' + r.value + (r.note ? ' (' + r.note + ')' : '')); });
  return rows;
}

/** system.status (C4): kết quả healthCheck + Settings để màn Trạng thái hệ thống hiển thị */
function systemStatus_(ctx) {
  return { checks: healthRows_(), settings: settingsList_(), checked_at: isoVN_(now_()) };
}
