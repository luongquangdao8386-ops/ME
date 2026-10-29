/* 34_reset: Xóa sạch dữ liệu vận hành (Đợt 4) — 1.4 §21, phụ lục 1.5 mục 6.9.3, 2.6, 2.8, 3.8, 3.14, 4.4.16.
 *
 * system.reset.preview → owner xem số bản ghi/file máy chủ đếm, nhận nonce + plan_hash (10 phút).
 * system.reset.request → PIN nhập ngay trong request + nonce + plan_hash + gõ đúng "XÓA TOÀN BỘ" + chế độ file:
 *   bật bảo trì, ResetRuns LOCKED, cấp phiên phục hồi (RECOVERY, 30 phút) cho owner, cài trigger resetContinue.
 * Chạy theo lô có điểm dừng (phase/cursor lưu trong ResetRuns): BACKUP → EPOCH → FILES_BUILD → FILES → TABLES → SCOPES → VERIFY.
 *   Owner đang xem tiến độ (system.reset.status) và trigger mỗi phút cùng đẩy, mỗi lúc một nơi (lease trong ScriptProperties).
 *   Lỗi → FAILED_NEEDS_RECOVERY, giữ bảo trì; system.reset.resume (PIN) tiếp tục đúng reset_run_id, hoặc hủy khi chưa xóa gì.
 * Không chép ảnh/tài liệu vào bản sao lưu (6.5.4): chế độ "Xóa vĩnh viễn" không hoàn tác được, màn xác nhận nói rõ. */

var RESET_CONFIRM_TEXT_ = 'XÓA TOÀN BỘ';
var RESET_PREVIEW_MINUTES_ = 10;
var RESET_FILE_MODES_ = ['KEEP', 'TRASH', 'DELETE'];
var RESET_ACTIVE_ = { LOCKED: 1, BACKING_UP: 1, RESETTING: 1, VERIFYING: 1 };
/** Một lần system.reset.status đẩy tối đa ~20 giây (app hỏi lại sau 5 giây); trigger chạy tới ~4 phút */
var RESET_STEP_BUDGET_MS_ = 20000;
var RESET_TRIGGER_BUDGET_MS_ = 240000;
var RESET_LEASE_PROP_ = 'RESET_LEASE';

/**
 * Nhóm và bảng bị xóa (1.4 §21.2). Thứ tự trong nhóm: bảng con trước. Documents (metadata) xóa sau cùng, sau khi đã xử lý file.
 * Giữ lại: Settings, SystemState, Glossary (từ điển thuật ngữ), NotificationRecipients (người nhận Gmail; phạm vi cũ tắt),
 * Users/RolePermissions/UserScopes (phạm vi khu vực tắt), Sessions (thu hồi), AuthAttempts, ResetRuns/ResetFiles.
 */
var RESET_GROUPS_ = [
  { key: 'catalog', tables: ['EquipmentParts', 'EquipmentSpecs', 'Equipment', 'Materials', 'InspectionTypes', 'Vendors', 'LookupValues', 'Locations'] },
  { key: 'work', tables: ['AnnualPlans', 'WorkOrderResults', 'WorkOrders', 'MaintenancePlans', 'ChecklistTemplates', 'RepairTasks', 'Repairs',
    'MaterialRequestLines', 'MaterialRequests', 'MaterialUsageLines', 'OperatingReadings', 'EquipmentPartEvents'] },
  { key: 'utilities', tables: ['MeterReadings', 'MeterEvents', 'MeterSegments', 'Meters', 'UtilityTariffs', 'CircuitLoads', 'Circuits', 'Panels'] },
  { key: 'contracts', tables: ['ContractServices', 'ContractEquipment', 'Contracts', 'Inspections', 'InspectionRequirements'] },
  { key: 'reports', tables: ['ReportRuns', 'ReportDefinitions', 'ImportRows', 'ImportBatches', 'Operations', 'AuditLogs'] },
  { key: 'alerts', tables: ['Alerts', 'NotificationLogs'] },
  { key: 'qr', tables: ['QrRegistry'] },
  { key: 'documents', tables: ['Documents'] }
];

/** Nhật ký giữ lại: tài khoản, quyền, cấu hình, sao lưu, hệ thống (không phải nhật ký nghiệp vụ) */
var RESET_AUDIT_KEEP_RE_ = /^(auth|pin|session|user|permission|settings|notify\.settings|notify\.recipient|backup|system|audit)\./;

function resetAuditKept_(a) { return RESET_AUDIT_KEEP_RE_.test(String(a.action || '')); }

/** Bảng của nhóm đã có trong dữ liệu (đợt ≤ đợt đang chạy: dán Code.gs mới mà chưa migrateSchema thì bỏ bảng chưa tạo) */
function resetTables_(g) {
  var dot = releasedDot_();
  return g.tables.filter(function (t) { return !SHEETS[t] || SHEETS[t].dot <= dot; });
}

function resetTableOrder_() {
  var out = [];
  RESET_GROUPS_.forEach(function (g) { resetTables_(g).forEach(function (t) { out.push({ table: t, group: g.key }); }); });
  return out;
}

/** Số dòng sẽ xóa của một bảng */
function resetTableCount_(name) {
  if (name === 'AuditLogs') return readRows_('AuditLogs').filter(function (a) { return !resetAuditKept_(a); }).length;
  if (name === 'ReportDefinitions') return readRows_('ReportDefinitions').filter(function (d) { return !d.builtin; }).length;
  return Math.max(0, sh_(name).getLastRow() - 1);
}

/** Danh sách file app quản lý lập từ metadata (Documents): file chính và ảnh nhỏ. Thư mục dữ liệu chung không đụng tới. */
function resetFileEntries_() {
  var out = [], external = 0;
  readRows_('Documents').forEach(function (d) {
    if (!d.owned_by_app || !d.drive_file_id) { external++; return; }
    var shared = d.drive_sharing_state === 'LINK_SHARED';
    out.push({ drive_file_id: String(d.drive_file_id), source_document_id: d.document_id, file_kind: 'MAIN', shared: shared });
    if (d.thumb_drive_file_id) out.push({ drive_file_id: String(d.thumb_drive_file_id), source_document_id: d.document_id, file_kind: 'THUMB', shared: shared });
  });
  return { list: out, external: external };
}

/** Kế hoạch (máy chủ đếm, không dựa số client tự khai): {epoch, groups:{key:n}, files:{app, shared, external}} */
function resetPlan_() {
  var groups = {};
  RESET_GROUPS_.forEach(function (g) {
    var n = 0;
    resetTables_(g).forEach(function (t) { n += resetTableCount_(t); });
    groups[g.key] = n;
  });
  var fe = resetFileEntries_();
  return {
    epoch: sysProps_().dataset_epoch, groups: groups,
    files: { app: fe.list.length, shared: fe.list.filter(function (f) { return f.shared; }).length, external: fe.external }
  };
}

function resetPlanHash_(plan) { return b64url_(sha256_(JSON.stringify(plan))); }

/** Xóa vĩnh viễn cần dịch vụ nâng cao Drive API (Dịch vụ → Drive API); DriveApp chỉ đưa vào thùng rác (1.4 §21.3) */
function resetDeleteAvailable_() {
  try { return typeof Drive !== 'undefined' && !!Drive && !!Drive.Files && typeof Drive.Files.remove === 'function'; } catch (e) { return false; }
}

function resetRunRow_(id) { return id ? findOne_('ResetRuns', 'reset_run_id', id) : null; }

/** Đợt đang chạy hoặc đang chờ xử lý lỗi (chỉ một đợt một lúc) */
function resetOpenRun_() {
  var rows = readRows_('ResetRuns').filter(function (r) { return RESET_ACTIVE_[r.status] || r.status === 'FAILED_NEEDS_RECOVERY'; });
  rows.sort(function (a, b) { return String(a.requested_at) < String(b.requested_at) ? 1 : -1; });
  return rows[0] || null;
}

function resetStatusForPhase_(phase) {
  if (phase === 'BACKUP') return 'BACKING_UP';
  if (phase === 'VERIFY') return 'VERIFYING';
  return 'RESETTING';
}

function resetJson_(v, def) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v) { try { return JSON.parse(v); } catch (e) { return def; } }
  return def;
}

function resetSave_(run, fields) {
  fields.updated_at = isoVN_(now_());
  Object.keys(fields).forEach(function (k) {
    if (fields[k] && typeof fields[k] === 'object') fields[k] = JSON.stringify(fields[k]);
  });
  withWriteLock_(function () { writeCells_('ResetRuns', run.__row, fields); });
  Object.keys(fields).forEach(function (k) { run[k] = fields[k]; });
}

/** Lỗi có mã để ghi error_code */
function resetError_(code, detail) {
  var e = new Error(code + (detail ? ': ' + detail : ''));
  e.resetCode = code;
  e.resetDetail = detail || '';
  return e;
}

/* ---------------- Lease: mỗi lúc chỉ một nơi đẩy đợt (trigger hoặc request tiến độ) ---------------- */

function acquireResetLease_(runId, ms) {
  return withWriteLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var cur = null;
    try { cur = JSON.parse(props.getProperty(RESET_LEASE_PROP_) || 'null'); } catch (e) { cur = null; }
    var t = now_().getTime();
    if (cur && cur.until > t) return false;
    props.setProperty(RESET_LEASE_PROP_, JSON.stringify({ run: runId, until: t + ms }));
    return true;
  });
}

function releaseResetLease_() {
  try { PropertiesService.getScriptProperties().deleteProperty(RESET_LEASE_PROP_); } catch (e) { /* hết hạn tự nhả */ }
}

function resetLeaseBusy_() {
  var cur = null;
  try { cur = JSON.parse(PropertiesService.getScriptProperties().getProperty(RESET_LEASE_PROP_) || 'null'); } catch (e) { cur = null; }
  return !!cur && cur.until > now_().getTime();
}

/* ---------------- Trigger tiếp tục ---------------- */

function installResetTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'resetContinue'; });
  if (!has) ScriptApp.newTrigger('resetContinue').timeBased().everyMinutes(1).create();
}

function removeResetTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'resetContinue') ScriptApp.deleteTrigger(t); });
}

/** Trigger mỗi phút trong lúc có đợt Xóa sạch đang chạy (tự gỡ khi xong hoặc lỗi) */
function resetContinue() {
  var t0 = Date.now();
  try {
    dbReset_();
    var run = resetOpenRun_();
    if (!run || !RESET_ACTIVE_[run.status]) { removeResetTrigger_(); return; }
    advanceReset_(run.reset_run_id, RESET_TRIGGER_BUDGET_MS_);
  } finally { recordTriggerRun_('resetContinue', t0); }
}

/* ---------------- Chạy đợt theo lô ---------------- */

/** Đẩy đợt tối đa budgetMs. Trả false nếu nơi khác đang đẩy. */
function advanceReset_(runId, budgetMs) {
  var t0 = now_().getTime();
  if (!acquireResetLease_(runId, budgetMs + 120000)) return false;
  try {
    for (var i = 0; i < 500; i++) {
      var run = resetRunRow_(runId);
      if (!run || !RESET_ACTIVE_[run.status]) break;
      if (now_().getTime() - t0 > budgetMs) break;
      try {
        resetStep_(run, t0, budgetMs);
      } catch (e) {
        resetFail_(run, e);
        break;
      }
    }
  } finally { releaseResetLease_(); }
  return true;
}

function resetFail_(run, e) {
  var code = e && e.resetCode ? e.resetCode : (e && e.apiCode ? e.apiCode : 'STEP_ERROR');
  var detail = e && e.resetDetail ? e.resetDetail : String(e && e.message || e);
  try {
    resetSave_(run, { status: 'FAILED_NEEDS_RECOVERY', error_code: code, error_detail: detail.slice(0, 300) });
  } catch (e2) { console.error('resetFail_ ' + e2); }
  removeResetTrigger_();
  console.error('Xóa sạch lỗi ' + run.reset_run_id + ' ' + run.phase + ' ' + code + ' ' + detail);
}

function resetProgress_(run) {
  var pr = resetJson_(run.summary_counts_json, null);
  if (pr && pr.groups) return pr;
  var plan = resetJson_(run.plan_json, { groups: {}, files: {} });
  var groups = {};
  RESET_GROUPS_.forEach(function (g) { groups[g.key] = { total: Number(plan.groups[g.key] || 0), done: 0 }; });
  return { groups: groups, files: { total: Number((plan.files || {}).app || 0), done: 0, failed: 0 } };
}

/** Một bước của đợt; ghi phase/cursor sau mỗi lô */
function resetStep_(run, t0, budgetMs) {
  var cursor = resetJson_(run.cursor_json, {});
  var pr = resetProgress_(run);
  switch (run.phase) {
    case 'BACKUP': {
      if (run.status !== 'BACKING_UP') resetSave_(run, { status: 'BACKING_UP' });
      // Sao lưu có kiểm chứng trước khi xóa (21.5 bước 4): bảo trì đang bật nên không có ghi chen giữa
      var m;
      try {
        m = backupDataRun_();
        if (m.status === 'INCONSISTENT') m = backupDataRun_();
      } catch (eb) { throw resetError_('BACKUP_FAILED', String(eb && eb.message || eb)); }
      if (m.status !== 'VERIFIED') throw resetError_('BACKUP_FAILED', m.error || m.status);
      resetSave_(run, { backup_ref: m.folder, backup_verified_at: m.finished_at, phase: 'EPOCH', status: 'RESETTING' });
      return;
    }
    case 'EPOCH':
      resetEpochPhase_(run);
      resetSave_(run, { phase: 'FILES_BUILD' });
      return;
    case 'FILES_BUILD': {
      var have = findAll_('ResetFiles', 'reset_run_id', run.reset_run_id).length;
      if (!have) {
        var fe = resetFileEntries_();
        var nowIso = isoVN_(now_());
        var rows = fe.list.map(function (f) {
          return {
            reset_file_id: uuid_(), reset_run_id: run.reset_run_id, drive_file_id: f.drive_file_id, source_document_id: f.source_document_id,
            managed_folder_id: '', owned_by_app: true, file_mode: run.file_mode, status: 'PENDING', processed_at: '', error_code: '',
            file_kind: f.file_kind, privacy_status: f.shared ? 'SHARED' : 'NOT_SHARED'
          };
        });
        withWriteLock_(function () { if (rows.length) insertRows_('ResetFiles', rows); });
        pr.files = { total: rows.length, done: 0, failed: 0 };
        pr.external = fe.external;
        resetSave_(run, { summary_counts_json: pr, cursor_json: cursor, updated_at: nowIso });
      }
      resetSave_(run, { phase: 'FILES' });
      return;
    }
    case 'FILES': {
      var pending = findAll_('ResetFiles', 'reset_run_id', run.reset_run_id).filter(function (f) { return f.status === 'PENDING'; });
      if (!pending.length) { resetSave_(run, { phase: 'TABLES', cursor_json: { table_index: 0 } }); return; }
      for (var i = 0; i < pending.length; i++) {
        if (now_().getTime() - t0 > budgetMs) break;
        var f = pending[i];
        var res = resetProcessFile_(f, run.file_mode);
        withWriteLock_(function () {
          writeCells_('ResetFiles', f.__row, { status: res.status, privacy_status: res.privacy_status, error_code: res.error_code || '', processed_at: isoVN_(now_()) });
        });
        pr.files.done++;
        if (res.status === 'FAILED') pr.files.failed++;
        // Ghi tiến độ thưa (mỗi 10 file) để không tốn lượt ghi; dừng giữa chừng thì đếm lại từ ResetFiles
        if (pr.files.done % 10 === 0) resetSave_(run, { summary_counts_json: pr });
      }
      resetSave_(run, { summary_counts_json: resetFilesRecount_(run, pr) });
      return;
    }
    case 'TABLES': {
      var order = resetTableOrder_();
      var idx = Number(cursor.table_index || 0);
      if (idx >= order.length) { resetSave_(run, { phase: 'SCOPES' }); return; }
      var item = order[idx];
      var n = resetClearTable_(item.table);
      pr.groups[item.group] = pr.groups[item.group] || { total: 0, done: 0 };
      pr.groups[item.group].done += n;
      resetSave_(run, { cursor_json: { table_index: idx + 1 }, summary_counts_json: pr });
      return;
    }
    case 'SCOPES':
      resetScopesPhase_(run);
      resetSave_(run, { phase: 'VERIFY', status: 'VERIFYING' });
      return;
    case 'VERIFY': {
      var bad = resetVerify_(run);
      if (bad.length) throw resetError_('VERIFY_FAILED', bad.join('; '));
      resetFinish_(run, pr);
      return;
    }
    default:
      throw resetError_('BAD_PHASE', String(run.phase));
  }
}

/** Đếm lại tiến độ file từ ResetFiles (đúng cả khi lần trước bị ngắt giữa lô) */
function resetFilesRecount_(run, pr) {
  var list = findAll_('ResetFiles', 'reset_run_id', run.reset_run_id);
  pr.files = {
    total: list.length,
    done: list.filter(function (f) { return f.status !== 'PENDING'; }).length,
    failed: list.filter(function (f) { return f.status === 'FAILED'; }).length
  };
  return pr;
}

/**
 * Đổi thế hệ dữ liệu (21.5 bước 5): epoch mới (ghi vào đợt trước để chạy lại không đổi lần nữa), thu hồi mọi phiên
 * (phiên phục hồi của owner đợt này được gắn sang epoch mới), hủy thư chờ gửi và lô nhập dở của epoch cũ, ghi last_reset_at.
 */
function resetEpochPhase_(run) {
  withWriteLock_(function () {
    var r = readRowAt_('ResetRuns', run.__row);
    var after = r.after_epoch || uuid_();
    if (!r.after_epoch) { writeCells_('ResetRuns', run.__row, { after_epoch: after }); run.after_epoch = after; }
    if (prop_('DATASET_EPOCH') !== after) setProp_('DATASET_EPOCH', after);
    cache_().removeAll(['sys:props', 'sys:state']);
    var t = now_().getTime();
    readRows_('Sessions').forEach(function (s) {
      if (s.session_kind === 'RECOVERY' && s.user_id === r.requested_by && isSessionActive_(s, t)) {
        if (s.dataset_epoch !== after) { writeCells_('Sessions', s.__row, { dataset_epoch: after }); cache_().remove('ss:' + s.session_id); }
        return;
      }
      if (isSessionActive_(s, t)) revokeSessionRow_(s, 'DATASET_RESET');
    });
    readRows_('NotificationLogs').forEach(function (l) {
      if (l.status === 'QUEUED') writeCells_('NotificationLogs', l.__row, { status: 'SKIPPED', error_code: 'CANCELLED_BY_RESET' });
      else if (l.status === 'SENDING') writeCells_('NotificationLogs', l.__row, { status: 'UNKNOWN' });
    });
    readRows_('ImportBatches').forEach(function (b) {
      if (b.status !== 'COMMITTED' && b.status !== 'FAILED') writeCells_('ImportBatches', b.__row, { status: 'FAILED' });
    });
    var st = readState_();
    stateWrite_(st, { dataset_epoch: ['STRING', after], last_reset_at: ['DATETIME', isoVN_(now_())] }, r.requested_by);
  });
  cache_().removeAll(['sys:props', 'sys:state']);
}

/**
 * Một file (2.6, 1.4 §21.3): đưa về riêng tư trước (link cũ hết hiệu lực ở mọi chế độ), rồi giữ / thùng rác / xóa vĩnh viễn.
 * Không đổi chế độ ngầm: xóa vĩnh viễn lỗi thì báo lỗi, không tự đưa vào thùng rác.
 */
function resetProcessFile_(f, mode) {
  var file;
  try { file = DriveApp.getFileById(String(f.drive_file_id)); } catch (e) { return { status: 'MISSING', privacy_status: 'MISSING', error_code: '' }; }
  var out = { status: '', privacy_status: '', error_code: '' };
  try {
    if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
    out.privacy_status = file.getSharingAccess() === DriveApp.Access.PRIVATE ? 'PRIVATE' : 'FAILED';
  } catch (e) { out.privacy_status = 'FAILED'; }
  if (out.privacy_status === 'FAILED') out.error_code = 'SHARING_FAILED';
  if (mode === 'TRASH') {
    try { file.setTrashed(true); out.status = 'TRASHED'; } catch (e) { out.status = 'FAILED'; out.error_code = 'TRASH_FAILED'; }
    return out;
  }
  if (mode === 'DELETE') {
    try { Drive.Files.remove(String(f.drive_file_id)); out.status = 'DELETED'; } catch (e) { out.status = 'FAILED'; out.error_code = 'DELETE_FAILED'; }
    return out;
  }
  out.status = out.privacy_status === 'PRIVATE' ? 'KEPT' : 'FAILED';
  return out;
}

/** Xóa dữ liệu một bảng, giữ hàng tiêu đề/cột/định dạng (không xóa hàng để tránh lỗi "xóa hết hàng không cố định" của Sheets) */
function resetClearTable_(name) {
  return withWriteLock_(function () {
    var sheet = sh_(name);
    var last = sheet.getLastRow();
    if (last <= 1) { resetBumpTable_(name); return 0; }
    var keep = name === 'AuditLogs' ? readRows_('AuditLogs').filter(resetAuditKept_) : [];
    var width = Math.max(sheet.getLastColumn(), hdr_(name).cols.length, 1);
    sheet.getRange(2, 1, last - 1, width).clearContent();
    if (keep.length) insertRows_(name, keep.map(function (a) { var o = {}; Object.keys(a).forEach(function (k) { if (k !== '__row') o[k] = a[k]; }); return o; }));
    resetBumpTable_(name);
    return last - 1 - keep.length;
  });
}

/** Tăng phiên bản bảng: đệm bảng và sync.changes không trả bản cũ */
function resetBumpTable_(name) {
  var st = readState_();
  var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
  var su = { sync_revision: ['INT', rev] };
  su['table_rev.' + name] = ['INT', rev];
  stateWrite_(st, su, SYSTEM_USER);
}

/** Phạm vi trỏ tới khu vực/hồ sơ cũ bị tắt (21.2); nạp lại mẫu báo cáo tích hợp */
function resetScopesPhase_(run) {
  withWriteLock_(function () {
    readRows_('UserScopes').forEach(function (s) {
      if (s.active && (s.location_id || s.module)) writeCells_('UserScopes', s.__row, { active: false, updated_at: isoVN_(now_()), updated_by: SYSTEM_USER });
    });
    readRows_('NotificationRecipients').forEach(function (r) {
      if (r.active && (r.location_scope || r.entity_scope)) writeCells_('NotificationRecipients', r.__row, { active: false });
    });
    resetBumpTable_('NotificationRecipients');
    seedReportDefinitions_();
  });
  adminFlushScopeCache_();
}

function adminFlushScopeCache_() {
  var keys = [];
  readRows_('Users').forEach(function (u) { keys.push('us:' + u.user_id, 'scope:' + u.user_id + ':' + (u.auth_version || 0)); });
  for (var i = 0; i < keys.length; i += 500) cache_().removeAll(keys.slice(i, i + 500));
}

/** Kiểm tra sau khi xóa (21.5 bước 7). Trả danh sách lỗi (rỗng = đạt). */
function resetVerify_(run) {
  dbReset_();
  var bad = [];
  resetTableOrder_().forEach(function (it) {
    var n = resetTableCount_(it.table);
    if (it.table === 'ReportDefinitions') {
      var nb = readRows_('ReportDefinitions').filter(function (d) { return d.builtin; }).length;
      if (n || nb !== RPT_BUILTIN_.length) bad.push('ReportDefinitions');
      return;
    }
    if (n) bad.push(it.table + ' ' + n);
  });
  var files = findAll_('ResetFiles', 'reset_run_id', run.reset_run_id);
  var pend = files.filter(function (f) { return f.status === 'PENDING'; }).length;
  if (pend) bad.push('ResetFiles PENDING ' + pend);
  if (prop_('DATASET_EPOCH') !== run.after_epoch) bad.push('DATASET_EPOCH');
  var owner = findOne_('Users', 'user_id', run.requested_by);
  if (!owner || !owner.active || !owner.is_system_owner || !hasFlag_(4, 'system', 'R')) bad.push('OWNER');
  var missing = sheetsForDot_(releasedDot_()).filter(function (n2) { return !book_(sheetSchema_(n2).book).getSheetByName(n2); });
  if (missing.length) bad.push('SHEETS ' + missing.join(','));
  var t = now_().getTime();
  var live = readRows_('Sessions').filter(function (s) { return isSessionActive_(s, t) && s.dataset_epoch !== run.after_epoch; }).length;
  if (live) bad.push('Sessions ' + live);
  return bad;
}

/** Hoàn tất (21.5 bước 8): biên nhận số lượng, bỏ chi tiết file tạm, tắt bảo trì, gỡ trigger */
function resetFinish_(run, pr) {
  var files = findAll_('ResetFiles', 'reset_run_id', run.reset_run_id);
  var byStatus = {};
  files.forEach(function (f) { byStatus[f.status] = (byStatus[f.status] || 0) + 1; });
  var receipt = {
    groups: {}, files: { total: files.length, kept: byStatus.KEPT || 0, trashed: byStatus.TRASHED || 0, deleted: byStatus.DELETED || 0,
      missing: byStatus.MISSING || 0, failed: byStatus.FAILED || 0,
      private_failed: files.filter(function (f) { return f.privacy_status === 'FAILED'; }).length, external: pr.external || 0 },
    backup_ref: run.backup_ref, file_mode: run.file_mode
  };
  Object.keys(pr.groups || {}).forEach(function (k) { receipt.groups[k] = pr.groups[k].done; });
  withWriteLock_(function () {
    // ResetFiles chỉ là danh sách tạm: bỏ ID/tên file cũ của đợt, giữ số lượng trong biên nhận
    var sheet = sh_('ResetFiles');
    var keepRows = readRows_('ResetFiles').filter(function (f) { return f.reset_run_id !== run.reset_run_id; });
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 1)).clearContent();
    if (keepRows.length) insertRows_('ResetFiles', keepRows.map(function (a) { var o = {}; Object.keys(a).forEach(function (k) { if (k !== '__row') o[k] = a[k]; }); return o; }));
    var nowIso = isoVN_(now_());
    writeCells_('ResetRuns', run.__row, {
      status: 'COMPLETED', phase: 'DONE', completed_at: nowIso, summary_counts_json: JSON.stringify(receipt), error_code: '', error_detail: '', updated_at: nowIso
    });
    writeAudit_({ user_id: run.requested_by, action: 'system.reset.complete', entity_type: 'SYSTEM', entity_id: run.reset_run_id,
      before_json: { dataset_epoch: run.before_epoch }, after_json: { dataset_epoch: run.after_epoch, backup_ref: run.backup_ref, file_mode: run.file_mode, counts: receipt.groups, files: receipt.files },
      auth_basis: 'OWNER' });
    setMaintenance_(false);
  });
  removeResetTrigger_();
  clearSysCaches_();
}

/* ---------------- Hiển thị ---------------- */

var RESET_STEPS_ = ['PREPARE', 'BACKUP', 'DELETE', 'VERIFY', 'DONE'];

function resetStepOf_(run) {
  if (run.status === 'COMPLETED') return 'DONE';
  if (run.status === 'CANCELLED') return 'PREPARE';
  var ph = run.phase;
  if (ph === 'BACKUP') return run.status === 'LOCKED' ? 'PREPARE' : 'BACKUP';
  if (ph === 'VERIFY') return 'VERIFY';
  if (ph === 'DONE') return 'DONE';
  return 'DELETE';
}

function resetRunView_(run) {
  if (!run) return null;
  var plan = resetJson_(run.plan_json, { groups: {}, files: {} });
  var pr = run.status === 'COMPLETED' ? null : resetProgress_(run);
  var receipt = run.status === 'COMPLETED' ? resetJson_(run.summary_counts_json, {}) : null;
  return {
    reset_run_id: run.reset_run_id, status: run.status, phase: run.phase, step: resetStepOf_(run), steps: RESET_STEPS_,
    requested_at: run.requested_at, requested_by_name: (userDirectory_()[run.requested_by] || {}).display_name || '',
    file_mode: run.file_mode, backup_ref: run.backup_ref || '', backup_verified_at: run.backup_verified_at || '',
    error_code: run.error_code || '', error_detail: run.error_code ? String(run.error_detail || '') : '',
    completed_at: run.completed_at || '', plan: plan, progress: pr, receipt: receipt,
    can_cancel: run.status === 'FAILED_NEEDS_RECOVERY' && run.phase === 'BACKUP',
    running: RESET_ACTIVE_[run.status] ? resetLeaseBusy_() : false
  };
}

/** SYS-RESET-01: thế hệ dữ liệu hiện tại, số bản ghi theo nhóm, lần sao lưu gần nhất, lần xóa sạch gần nhất */
function resetOverview_() {
  var st = readState_();
  var plan = resetPlan_();
  var runs = readRows_('ResetRuns').filter(function (r) { return r.status === 'COMPLETED'; });
  runs.sort(function (a, b) { return String(a.completed_at) < String(b.completed_at) ? 1 : -1; });
  var last = runs[0];
  return {
    epoch_short: String(plan.epoch || '').slice(0, 8), epoch_since: stateGet_(st, 'last_reset_at', '') || stateGet_(st, 'last_restore_at', ''),
    groups: plan.groups, files: plan.files,
    last_backup_at: stateGet_(st, 'last_backup_at', ''), last_backup_ref: stateGet_(st, 'last_backup_ref', ''), last_backup_status: stateGet_(st, 'last_backup_status', ''),
    last_reset: last ? { completed_at: last.completed_at, backup_ref: last.backup_ref, receipt: resetJson_(last.summary_counts_json, {}) } : null,
    delete_available: resetDeleteAvailable_()
  };
}

/* ---------------- Action ---------------- */

function systemResetPreview_(ctx) {
  var open = resetOpenRun_();
  if (open) return { open_run: resetRunView_(open) };
  var plan = resetPlan_();
  var hash = resetPlanHash_(plan);
  var nonce = uuid_() + uuid_().replace(/-/g, '');
  var exp = new Date(now_().getTime() + RESET_PREVIEW_MINUTES_ * 60000);
  var id = uuid_();
  withWriteLock_(function () {
    insertRows_('ResetRuns', [{
      reset_run_id: id, requested_by: ctx.user.user_id, requested_at: isoVN_(now_()), before_epoch: plan.epoch, after_epoch: '', scope_key: 'ME',
      file_mode: '', plan_hash: hash, confirmation_nonce_hash: b64url_(sha256_(nonce)), confirmation_expires_at: isoVN_(exp), backup_ref: '',
      backup_verified_at: '', status: 'PREVIEWED', phase: 'PREVIEW', cursor_json: '', summary_counts_json: '', completed_at: '', error_code: '',
      run_kind: 'RESET', source_backup_ref: '', plan_json: JSON.stringify(plan), recovery_session_id: '', error_detail: '', updated_at: isoVN_(now_())
    }]);
  });
  return {
    reset_run_id: id, plan_hash: hash, nonce: nonce, expires_at: isoVN_(exp), expires_in_seconds: RESET_PREVIEW_MINUTES_ * 60, plan: plan,
    file_modes: RESET_FILE_MODES_.map(function (m) { return { mode: m, available: m !== 'DELETE' || resetDeleteAvailable_() }; }),
    warehouse_connected: !!setting_('warehouse_connected'), confirm_text: RESET_CONFIRM_TEXT_
  };
}

/** Như app: nhận cả kiểu bỏ dấu cũ "XOÁ" và chữ thường; không dấu thì không nhận */
function resetConfirmOk_(s) {
  var t = String(s === undefined || s === null ? '' : s);
  try { t = t.normalize('NFC'); } catch (e) { /* V8 có normalize */ }
  t = t.trim().replace(/\s+/g, ' ').toUpperCase().replace(/OÁ/g, 'ÓA');
  return t === RESET_CONFIRM_TEXT_.normalize('NFC');
}

function systemResetRequest_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (RESET_FILE_MODES_.indexOf(p.file_mode) < 0) errs.push(fieldError_('file_mode', 'INVALID_VALUE'));
  else if (p.file_mode === 'DELETE' && !resetDeleteAvailable_()) errs.push(fieldError_('file_mode', 'FILE_MODE_UNAVAILABLE'));
  if (!resetConfirmOk_(p.confirm_text)) errs.push(fieldError_('confirm_text', 'CONFIRM_TEXT'));
  if (errs.length) throw validationError_(errs);
  var run = isUuidV4_(p.reset_run_id) ? resetRunRow_(p.reset_run_id) : null;
  if (!run || run.status !== 'PREVIEWED' || run.requested_by !== ctx.user.user_id) throw validationError_([fieldError_('reset_run_id', 'RESET_PLAN_EXPIRED')]);
  if (resetOpenRun_()) throw validationError_([fieldError_('reset_run_id', 'RESET_ACTIVE')]);
  var exp = parseTime_(run.confirmation_expires_at);
  if (!run.confirmation_nonce_hash || !exp || exp.getTime() <= now_().getTime()) throw validationError_([fieldError_('reset_run_id', 'RESET_PLAN_EXPIRED')]);
  if (!ctEqualStr_(b64url_(sha256_(String(p.nonce || ''))), run.confirmation_nonce_hash)) throw validationError_([fieldError_('nonce', 'RESET_PLAN_EXPIRED')]);
  // Bản kế hoạch phải khớp cả lúc xem trước (plan_hash client gửi) lẫn dữ liệu hiện tại (máy chủ đếm lại)
  var planNow = resetPlan_();
  if (p.plan_hash !== run.plan_hash || resetPlanHash_(planNow) !== run.plan_hash) throw validationError_([fieldError_('plan_hash', 'RESET_PLAN_CHANGED')]);
  var rec = null;
  checkOwnPin_(ctx, p.pin, 'RESET', function (u, eh) {
    if (u.failed_attempts || u.failed_window_started_at) {
      writeCells_('Users', u.__row, { failed_attempts: 0, failed_window_started_at: '' });
      cache_().remove('us:' + u.user_id);
    }
    logAttempt_('RESET', 'SUCCESS', eh, u, ctx.req);
    var r = readRowAt_('ResetRuns', run.__row);
    if (r.status !== 'PREVIEWED' || r.confirmation_nonce_hash !== run.confirmation_nonce_hash) throw validationError_([fieldError_('nonce', 'RESET_PLAN_EXPIRED')]);
    // Khóa vận hành (21.5 bước 3): dưới khóa ghi — mọi ghi trước đó đã xong; ghi sau đó gặp bảo trì
    setMaintenance_(true);
    rec = createSession_(u, 'RECOVERY', ctx.req);
    var nowIso = isoVN_(now_());
    writeCells_('ResetRuns', run.__row, {
      status: 'LOCKED', phase: 'BACKUP', requested_at: nowIso, before_epoch: sysProps_().dataset_epoch, file_mode: p.file_mode,
      confirmation_nonce_hash: '', recovery_session_id: rec.session_id, cursor_json: '{}', updated_at: nowIso
    });
    writeAudit_({ user_id: u.user_id, device_id: ctx.req.device_id, action: 'system.reset.request', entity_type: 'SYSTEM', entity_id: run.reset_run_id,
      before_json: { dataset_epoch: run.before_epoch }, after_json: { file_mode: p.file_mode, plan: planNow.groups, files: planNow.files },
      operation_id: ctx.req.operation_id || '', auth_basis: 'OWNER' });
  });
  installResetTrigger_();
  dbReset_();
  var fresh = resetRunRow_(run.reset_run_id);
  return {
    reset_run_id: run.reset_run_id, status: fresh.status, run: resetRunView_(fresh),
    recovery: { token: rec.token, expires_at: rec.expires_at, session_kind: 'RECOVERY' }
  };
}

function systemResetStatus_(ctx) {
  var p = ctx.req.payload || {};
  var out = { maintenance_mode: PropertiesService.getScriptProperties().getProperty('MAINTENANCE_MODE') === 'true' };
  var run = isUuidV4_(p.reset_run_id) ? resetRunRow_(p.reset_run_id) : resetOpenRun_();
  if (run && run.status !== 'PREVIEWED') {
    if (RESET_ACTIVE_[run.status] && p.advance !== false) {
      advanceReset_(run.reset_run_id, RESET_STEP_BUDGET_MS_);
      dbReset_();
      run = resetRunRow_(run.reset_run_id);
      out.maintenance_mode = PropertiesService.getScriptProperties().getProperty('MAINTENANCE_MODE') === 'true';
    }
    out.run = resetRunView_(run);
  }
  if (p.overview && ctx.session.session_kind !== 'RECOVERY') out.overview = resetOverview_();
  return out;
}

function systemResetResume_(ctx) {
  var p = ctx.req.payload || {};
  var mode = p.mode === 'CANCEL' ? 'CANCEL' : 'CONTINUE';
  var run = isUuidV4_(p.reset_run_id) ? resetRunRow_(p.reset_run_id) : null;
  if (!run) throw apiError_('NOT_FOUND');
  var stuck = RESET_ACTIVE_[run.status] && !resetLeaseBusy_();
  if (!(run.status === 'FAILED_NEEDS_RECOVERY' || (mode === 'CONTINUE' && stuck))) throw validationError_([fieldError_('reset_run_id', 'NOT_RESUMABLE')]);
  // Hủy chỉ khi chưa đổi epoch/xóa gì (21.5: hủy trước bước xóa có thể quay lại dữ liệu cũ)
  if (mode === 'CANCEL' && run.phase !== 'BACKUP') throw validationError_([fieldError_('reset_run_id', 'NOT_RESUMABLE')]);
  var rec = null;
  checkOwnPin_(ctx, p.pin, 'RESET', function (u, eh) {
    if (u.failed_attempts || u.failed_window_started_at) {
      writeCells_('Users', u.__row, { failed_attempts: 0, failed_window_started_at: '' });
      cache_().remove('us:' + u.user_id);
    }
    logAttempt_('RESET', 'SUCCESS', eh, u, ctx.req);
    var nowIso = isoVN_(now_());
    if (mode === 'CANCEL') {
      writeCells_('ResetRuns', run.__row, { status: 'CANCELLED', phase: 'CANCELLED', updated_at: nowIso });
      readRows_('Sessions').forEach(function (s) { if (s.session_kind === 'RECOVERY' && s.user_id === run.requested_by && !s.revoked_at) revokeSessionRow_(s, 'RESET_CANCELLED'); });
      setMaintenance_(false);
    } else {
      writeCells_('ResetRuns', run.__row, { status: resetStatusForPhase_(run.phase), error_code: '', error_detail: '', updated_at: nowIso });
      if (ctx.session.session_kind !== 'RECOVERY') rec = createSession_(u, 'RECOVERY', ctx.req);
    }
    writeAudit_({ user_id: u.user_id, device_id: ctx.req.device_id, action: 'system.reset.' + (mode === 'CANCEL' ? 'cancel' : 'resume'), entity_type: 'SYSTEM',
      entity_id: run.reset_run_id, before_json: { status: run.status, phase: run.phase, error_code: run.error_code }, after_json: null,
      operation_id: ctx.req.operation_id || '', auth_basis: 'OWNER' });
  });
  if (mode === 'CONTINUE') installResetTrigger_(); else removeResetTrigger_();
  dbReset_();
  var out = { run: resetRunView_(resetRunRow_(run.reset_run_id)) };
  if (rec) out.recovery = { token: rec.token, expires_at: rec.expires_at, session_kind: 'RECOVERY' };
  return out;
}
