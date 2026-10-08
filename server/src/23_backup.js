/* 23_backup: sao lưu có kiểm chứng, Sao lưu ngay, khôi phục thủ công — phụ lục 1.5 mục 6.5.4, 3.14, 4.4.16.
 * Bản sao ở thư mục Backups riêng tư: <yyyy-mm-dd_HHmm>/ gồm 2 spreadsheet + manifest.json.
 * ScriptProperties không nằm trong bản sao. Không chép ảnh/tài liệu (Đợt 1–3). */

/** Sheet ghi không qua sync_revision (đăng nhập, phiên): không dùng để kiểm chứng số dòng */
var BACKUP_VOLATILE_ = { AuthAttempts: 1, Sessions: 1, AuditLogs: 1, Operations: 1 };

function backupRoot_() {
  var id = prop_('DRIVE_BACKUP_FOLDER_ID');
  if (!id) throw new Error('Chưa có DRIVE_BACKUP_FOLDER_ID');
  return DriveApp.getFolderById(id);
}

/** Số dòng dữ liệu (trừ tiêu đề) từng sheet đã biết của một spreadsheet */
function countRows_(ss, out) {
  ss.getSheets().forEach(function (sh) {
    if (SHEETS[sh.getName()]) out[sh.getName()] = Math.max(0, sh.getLastRow() - 1);
  });
  return out;
}

function backupStamp_(d) {
  var iso = isoVN_(d);
  return iso.slice(0, 10) + '_' + iso.slice(11, 13) + iso.slice(14, 16);
}

/** Đọc manifest.json của một thư mục sao lưu, null nếu không có/hỏng */
function readManifest_(folder) {
  var it = folder.getFilesByName('manifest.json');
  if (!it.hasNext()) return null;
  try { return JSON.parse(it.next().getBlob().getDataAsString()); } catch (e) { return null; }
}

/** Danh sách thư mục sao lưu, mới nhất trước: [{folder, name, manifest}] */
function listBackups_() {
  var out = [];
  var it = backupRoot_().getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (!/^\d{4}-\d{2}-\d{2}_\d{4}/.test(f.getName())) continue;
    out.push({ folder: f, name: f.getName(), manifest: readManifest_(f) });
  }
  out.sort(function (a, b) { return a.name < b.name ? 1 : a.name > b.name ? -1 : 0; });
  return out;
}

/** Trigger chạy một lần của backupData (Sao lưu ngay, chạy lại sau INCONSISTENT) */
function oneShotIds_() {
  try { return JSON.parse(prop_('BACKUP_ONESHOT_IDS') || '[]'); } catch (e) { return []; }
}
function scheduleBackupOnce_(afterMs) {
  var t = ScriptApp.newTrigger('backupData').timeBased().after(afterMs).create();
  var ids = oneShotIds_();
  ids.push(t.getUniqueId());
  setProp_('BACKUP_ONESHOT_IDS', JSON.stringify(ids));
  return t.getUniqueId();
}
function clearOneShotTriggers_() {
  var ids = oneShotIds_();
  if (!ids.length) return;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupData' && ids.indexOf(t.getUniqueId()) >= 0) ScriptApp.deleteTrigger(t);
  });
  setProp_('BACKUP_ONESHOT_IDS', '[]');
}

/**
 * Trigger hằng tuần và "Sao lưu ngay" (6.5.4). Chạy được cả khi bảo trì (thủ tục khôi phục bước 2).
 * VERIFIED: số dòng bản sao khớp và sync_revision không đổi; INCONSISTENT: có ghi trong lúc chép (chạy lại một lần sau 15 phút);
 * FAILED: lỗi hoặc số dòng lệch khi không có ghi.
 */
function backupData() {
  var t0 = Date.now();
  try { return backupDataRun_(); } finally { recordTriggerRun_('backupData', t0); }
}

function backupDataRun_() {
  clearOneShotTriggers_();
  var isRetry = prop_('BACKUP_RETRY_PENDING') === 'true';
  if (isRetry) delProp_('BACKUP_RETRY_PENDING');
  dbReset_();
  var started = now_();
  var stamp = backupStamp_(started);
  var root = backupRoot_();
  var folder = root.createFolder(stamp);
  // Mọi bước sau khi có thư mục đều trong try: lỗi gì cũng ghi được manifest FAILED kèm lý do
  var manifest = {
    app_id: APP_ID, created_at: isoVN_(started), folder: stamp, server_version: SERVER_VERSION, retry: isRetry,
    status: 'FAILED', consistent: false, counts: {}, copied_counts: {}, files: {}
  };
  try {
    var st0 = readState_();
    var rev0 = Number(stateGet_(st0, 'sync_revision', 0));
    var bizId = prop_('BUSINESS_SPREADSHEET_ID'), secId = prop_('SECURITY_SPREADSHEET_ID');
    manifest.env = envName_();
    manifest.schema_version = stateGet_(st0, 'schema_version', SCHEMA_VERSION);
    manifest.dataset_epoch = sysProps_().dataset_epoch;
    manifest.sync_revision = rev0;
    countRows_(SpreadsheetApp.openById(bizId), manifest.counts);
    countRows_(SpreadsheetApp.openById(secId), manifest.counts);
    manifest.documents = manifest.counts.Documents || 0;
    var bizCopy = DriveApp.getFileById(bizId).makeCopy(NAME_PREFIX + 'NghiepVu_' + stamp, folder);
    var secCopy = DriveApp.getFileById(secId).makeCopy(NAME_PREFIX + 'BaoMat_' + stamp, folder);
    manifest.files = { business: bizCopy.getId(), security: secCopy.getId() };
    countRows_(SpreadsheetApp.openById(bizCopy.getId()), manifest.copied_counts);
    countRows_(SpreadsheetApp.openById(secCopy.getId()), manifest.copied_counts);
    dbReset_();
    var rev1 = Number(stateGet_(readState_(), 'sync_revision', 0));
    manifest.sync_revision_end = rev1;
    var mismatch = Object.keys(manifest.counts).filter(function (k) {
      return !BACKUP_VOLATILE_[k] && manifest.counts[k] !== manifest.copied_counts[k];
    });
    manifest.mismatch = mismatch;
    if (rev1 !== rev0) manifest.status = 'INCONSISTENT';
    else manifest.status = mismatch.length ? 'FAILED' : 'VERIFIED';
    manifest.consistent = manifest.status === 'VERIFIED';
  } catch (e) {
    manifest.status = 'FAILED';
    manifest.error = String(e && e.message || e).slice(0, 200);
  }
  manifest.finished_at = isoVN_(now_());
  folder.createFile(Utilities.newBlob(JSON.stringify(manifest, null, 2), 'application/json', 'manifest.json'));
  withWriteLock_(function () {
    var st = readState_();
    stateWrite_(st, {
      last_backup_at: ['DATETIME', manifest.created_at], last_backup_ref: ['STRING', stamp], last_backup_status: ['ENUM', manifest.status]
    }, SYSTEM_USER);
  });
  cache_().remove('sys:state');
  if (manifest.status === 'INCONSISTENT' && !isRetry) {
    setProp_('BACKUP_RETRY_PENDING', 'true');
    scheduleBackupOnce_(15 * 60000);
  }
  var trashed = pruneBackups_();
  log_('backupData: ' + stamp + ' → ' + manifest.status + (trashed ? '; đã chuyển ' + trashed + ' bản cũ vào thùng rác' : '') + '.');
  return manifest;
}

/** Giữ backup_keep_count bản VERIFIED mới nhất; thư mục cũ hơn bản giữ cuối cùng vào thùng rác (chỉ trong Backups) */
function pruneBackups_() {
  var keep = Number(setting_('backup_keep_count') || 8);
  var list = listBackups_();
  var verified = list.filter(function (b) { return b.manifest && b.manifest.status === 'VERIFIED'; });
  if (verified.length <= keep) return 0;
  var cut = verified[keep - 1].name;
  var n = 0;
  list.forEach(function (b) {
    if (b.name >= cut) return;
    var it = b.folder.getFiles();
    while (it.hasNext()) it.next().setTrashed(true);
    b.folder.setTrashed(true);
    n++;
  });
  return n;
}

/* ---------------- Action ---------------- */

/** backup.view: danh sách bản, trạng thái kiểm chứng, lần gần nhất, đang chờ chạy (C4) */
/** Bản sao lưu mất bao lâu tối đa (thời hạn trigger 6 phút + dư) trước khi coi thư mục không manifest là thất bại */
var BACKUP_RUNNING_MS_ = 30 * 60000;

/** Thư mục chưa có manifest.json: đang chạy nếu tạo chưa quá 30 phút, quá thì thất bại (trigger bị dừng giữa chừng) */
function backupRunningRef_(b, nowMs) {
  if (b.manifest) return false;
  var n = b.name;
  var t = Date.parse(n.slice(0, 10) + 'T' + n.slice(11, 13) + ':' + n.slice(13, 15) + ':00+07:00');
  return !isNaN(t) && nowMs - t < BACKUP_RUNNING_MS_;
}

function backupView_(ctx) {
  var st = readState_();
  var nowMs = now_().getTime();
  var running = false;
  var items = listBackups_().slice(0, 30).map(function (b) {
    var m = b.manifest || {};
    var total = 0;
    Object.keys(m.counts || {}).forEach(function (k) { if (!BACKUP_VOLATILE_[k]) total += m.counts[k]; });
    var isRunning = backupRunningRef_(b, nowMs);
    if (isRunning) running = true;
    return {
      ref: b.name, created_at: m.created_at || '', finished_at: m.finished_at || '', status: isRunning ? 'RUNNING' : (m.status || 'FAILED'), consistent: !!m.consistent,
      schema_version: m.schema_version || '', rows: total, documents: m.documents || 0, retry: !!m.retry,
      error: m.error || (b.manifest || isRunning ? '' : 'NO_MANIFEST'), mismatch: m.mismatch || []
    };
  });
  return {
    items: items, queued: oneShotIds_().length > 0, running: running,
    last_backup_at: stateGet_(st, 'last_backup_at', ''), last_backup_ref: stateGet_(st, 'last_backup_ref', ''), last_backup_status: stateGet_(st, 'last_backup_status', ''),
    last_restore_at: stateGet_(st, 'last_restore_at', ''), restored_from_ref: stateGet_(st, 'restored_from_ref', ''),
    backup_weekday: setting_('backup_weekday'), backup_hour: setting_('backup_hour'), keep_count: setting_('backup_keep_count')
  };
}

/** backup.run: tạo trigger chạy một lần cho backupData, trả QUEUED (C4, PIN) */
function backupRun_(ctx) {
  if (oneShotIds_().length) return { status: 'QUEUED', already: true };
  var nowMs = now_().getTime();
  if (listBackups_().some(function (b) { return backupRunningRef_(b, nowMs); })) return { status: 'QUEUED', already: true };
  withWriteLock_(function () {
    scheduleBackupOnce_(1000);
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'backup.run', entity_type: 'BACKUP', entity_id: '',
      before_json: null, after_json: { status: 'QUEUED' }, operation_id: ctx.req.operation_id || '', auth_basis: 'ROLE_LEVEL' });
  });
  return { status: 'QUEUED', already: false };
}

/* ---------------- Khôi phục thủ công (6.5.4 bước 6) ---------------- */

/** Thao tác dở (PREPARED) của bản khôi phục: áp lại theo intent; không có intent thì đánh dấu cần xử lý */
function recoverOperations_() {
  var n = 0;
  readRows_('Operations').forEach(function (op) {
    if (op.state !== 'PREPARED') return;
    var intent = op.intent_json;
    if (intent && intent.writes) {
      applyWrites_(intent.writes, true);
      writeCells_('Operations', op.__row, { state: 'COMMITTED', result_code: 'OK', committed_at: isoVN_(now_()), result_json: JSON.stringify(intent.result || null) });
    } else {
      writeCells_('Operations', op.__row, { state: 'FAILED', result_code: 'RECOVERY_REQUIRED' });
    }
    n++;
  });
  return n;
}

/** Số lớn nhất của mã hiển thị theo tiền tố trong dữ liệu (để bộ đếm không cấp trùng) */
function maxCodeSeqs_() {
  var out = {};
  Object.keys(CODE_PATTERNS).forEach(function (t) {
    var et = ENTITY_TYPES[t], pat = CODE_PATTERNS[t];
    if (!et || !et.code) return;
    var re = pat.yymm ? new RegExp('^' + pat.prefix + '-(\\d{4})-(\\d+)$') : new RegExp('^' + pat.prefix + '-(\\d+)$');
    readRows_(et.sheet).forEach(function (r) {
      var m = re.exec(String(r[et.code] || ''));
      if (!m) return;
      var key = 'code_seq.' + pat.prefix + (pat.yymm ? '.' + m[1] : '');
      var v = Number(pat.yymm ? m[2] : m[1]);
      if (!(out[key] >= v)) out[key] = v;
    });
  });
  return out;
}

/**
 * Bước cuối của khôi phục thủ công. Chạy từ trình soạn (tài khoản M&E), khi đang bảo trì,
 * sau khi đặt RESTORE_SOURCE_ID = ID bản sao file Nghiệp vụ. Chạy lại nhiều lần không sai; lỗi thì dừng.
 */
function adminFinalizeManualRestore() {
  var srcId = prop_('RESTORE_SOURCE_ID');
  if (!srcId) throw new Error('Chưa đặt RESTORE_SOURCE_ID (ID bản sao file Nghiệp vụ cần khôi phục).');
  if (prop_('MAINTENANCE_MODE') !== 'true') throw new Error('Phải bật bảo trì trước: chạy adminMaintenanceOn.');
  var curId = prop_('BUSINESS_SPREADSHEET_ID');
  var switched = curId === srcId;
  var prevId = switched ? prop_('PREVIOUS_BUSINESS_SPREADSHEET_ID') : curId;
  if (!prevId) throw new Error('Không xác định được file Nghiệp vụ đang chạy trước khôi phục.');
  var src = SpreadsheetApp.openById(srcId);
  // 1. Kiểm schema: đủ sheet Nghiệp vụ của đợt hiện hành và cột khóa
  var missing = [];
  sheetsForDot_(RELEASED_DOT).forEach(function (name) {
    var s = sheetSchema_(name);
    if (s.book !== 'B') return;
    var sh = src.getSheetByName(name);
    if (!sh) { missing.push(name); return; }
    var hdr = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    if (hdr.indexOf(s.key) < 0) missing.push(name + '.' + s.key);
  });
  if (missing.length) throw new Error('File nguồn thiếu sheet/cột: ' + missing.join(', ') + '. Dừng — hỏi người code.');
  // 2. Đối chiếu số dòng với manifest (bỏ NotificationLogs và sheet ghi không qua sync_revision)
  var srcCounts = countRows_(src, {});
  var srcState = {};
  src.getSheetByName('SystemState').getDataRange().getValues().slice(1).forEach(function (r) { srcState[r[0]] = r[1]; });
  var match = null;
  var backups = listBackups_();
  // Chạy lại sau khi đã đổi file: dùng đúng bản đã ghi ở lần trước
  if (switched && srcState.restored_from_ref) match = backups.filter(function (b) { return b.name === srcState.restored_from_ref && b.manifest; })[0] || null;
  backups.forEach(function (b) {
    if (match || !b.manifest || b.manifest.status !== 'VERIFIED') return;
    var m = b.manifest;
    if (String(m.schema_version) !== String(srcState.schema_version || m.schema_version)) return;
    var ok = Object.keys(srcCounts).every(function (k) {
      if (k === 'NotificationLogs' || BACKUP_VOLATILE_[k] || k === 'SystemState') return true;
      return m.counts[k] === srcCounts[k];
    });
    if (ok) match = b;
  });
  if (!match) throw new Error('Không tìm thấy bản sao lưu VERIFIED khớp số dòng với file nguồn. Dừng — hỏi người code.');
  var schemaNow = SCHEMA_VERSION;
  if (String(match.manifest.schema_version) !== String(schemaNow)) throw new Error('schema_version của bản sao (' + match.manifest.schema_version + ') khác bản đang chạy (' + schemaNow + ').');
  // 3. Đọc trạng thái và NotificationLogs của bản đang chạy trước khôi phục
  var prev = SpreadsheetApp.openById(prevId);
  var prevState = {};
  prev.getSheetByName('SystemState').getDataRange().getValues().slice(1).forEach(function (r) { prevState[r[0]] = r; });
  var prevLogsSheet = prev.getSheetByName('NotificationLogs');
  var prevLogs = prevLogsSheet.getDataRange().getValues();
  // 4. Đổi file Nghiệp vụ, epoch mới
  if (!switched) {
    setProp_('PREVIOUS_BUSINESS_SPREADSHEET_ID', curId);
    setProp_('BUSINESS_SPREADSHEET_ID', srcId);
  }
  setProp_('DATASET_EPOCH', uuid_());
  cache_().remove('sys:props');
  cache_().remove('sys:state');
  dbReset_();
  var actor = 'ADMIN_RESTORE';
  withWriteLock_(function () {
    // 5. Thu hồi mọi phiên
    var t = now_().getTime();
    readRows_('Sessions').forEach(function (s) { if (isSessionActive_(s, t)) revokeSessionRow_(s, 'DATASET_RESET'); });
    // 6. NotificationLogs: chép từ bản đang chạy; QUEUED → SKIPPED, SENDING → UNKNOWN
    var dst = sh_('NotificationLogs');
    var hdr = prevLogs[0].map(String);
    if (dst.getLastRow() > 1) dst.deleteRows(2, dst.getLastRow() - 1);
    var rows = prevLogs.slice(1).filter(function (r) { return r.some(function (v) { return v !== ''; }); }).map(function (r) {
      var o = {};
      hdr.forEach(function (h, i) { o[h] = r[i] instanceof Date ? isoVN_(r[i]) : r[i]; });
      if (o.status === 'QUEUED') { o.status = 'SKIPPED'; o.error_code = 'CANCELLED_BY_RESTORE'; }
      else if (o.status === 'SENDING') o.status = 'UNKNOWN';
      return o;
    });
    DB_.sheets = {}; DB_.headers = {};
    if (rows.length) insertRows_('NotificationLogs', rows);
    // 7. SystemState: bộ đếm mã, perm_version, giữ khóa vận hành của bản đang chạy, ghi dấu khôi phục
    var st = readState_();
    var su = {};
    var seqs = maxCodeSeqs_();
    Object.keys(prevState).forEach(function (k) {
      if (k.indexOf('code_seq.') === 0) seqs[k] = Math.max(Number(seqs[k] || 0), Number(prevState[k][1] || 0));
    });
    Object.keys(st.map).forEach(function (k) {
      if (k.indexOf('code_seq.') === 0) seqs[k] = Math.max(Number(seqs[k] || 0), Number(st.map[k] || 0));
    });
    Object.keys(seqs).forEach(function (k) { su[k] = ['INT', seqs[k]]; });
    var pv = Math.max(Number(stateGet_(st, 'perm_version', 1)), Number(prevState.perm_version ? prevState.perm_version[1] : 1));
    su.perm_version = ['INT', pv + 1];
    var sr = Math.max(Number(stateGet_(st, 'sync_revision', 0)), Number(prevState.sync_revision ? prevState.sync_revision[1] : 0));
    su.sync_revision = ['INT', sr + 1];
    ['last_backup_at', 'last_backup_ref', 'last_backup_status', 'login_paused_until', 'mt_paused_until'].forEach(function (k) {
      if (prevState[k]) su[k] = [prevState[k][2] || 'STRING', prevState[k][1] instanceof Date ? isoVN_(prevState[k][1]) : prevState[k][1]];
    });
    su.dataset_epoch = ['STRING', prop_('DATASET_EPOCH')];
    su.last_restore_at = ['DATETIME', isoVN_(now_())];
    su.restored_from_ref = ['STRING', match.name];
    su.restored_backup_at = ['DATETIME', match.manifest.created_at || ''];
    su.restored_by = ['STRING', actor];
    stateWrite_(st, su, actor);
    // 8. Lô nhập dở → FAILED; thao tác PREPARED → áp lại
    readRows_('ImportBatches').forEach(function (b) {
      if (b.status !== 'COMMITTED' && b.status !== 'FAILED') writeCells_('ImportBatches', b.__row, { status: 'FAILED', updated_at: isoVN_(now_()) });
    });
    recoverOperations_();
    // 9. Người nhận gắn tài khoản không còn → ngừng
    var users = {};
    readRows_('Users').forEach(function (u) { users[u.user_id] = true; });
    readRows_('NotificationRecipients').forEach(function (r) {
      if (r.user_id && !users[r.user_id] && r.active !== false) writeCells_('NotificationRecipients', r.__row, { active: false });
    });
  });
  // 10. Tính lại Alerts; kiểm QrRegistry; đếm tài liệu hỏng
  dbReset_();
  refreshAlerts_();
  var qrBad = 0;
  readRows_('QrRegistry').forEach(function (q) {
    var et = ENTITY_TYPES[q.entity_type];
    if (et && !findRowNums_(et.sheet, et.key, q.entity_id).length) qrBad++;
  });
  var docBad = 0;
  readRows_('Documents').forEach(function (d) {
    if (!d.active || !d.drive_file_id) return;
    try { DriveApp.getFileById(d.drive_file_id); } catch (e) { docBad++; }
  });
  withWriteLock_(function () {
    writeAudit_({ user_id: 'ADMIN_RESTORE', action: 'system.manualRestore', entity_type: 'SYSTEM', entity_id: match.name,
      before_json: { business_spreadsheet: prevId }, after_json: { business_spreadsheet: srcId, backup: match.name, qr_missing: qrBad, documents_missing: docBad },
      operation_id: '', auth_basis: 'SYSTEM' });
  });
  delProp_('RESTORE_SOURCE_ID');
  cache_().remove('sys:state');
  clearSysCaches_();
  log_('Khôi phục xong từ bản ' + match.name + '. QR trỏ hồ sơ không còn: ' + qrBad + '; tài liệu không mở được: ' + docBad +
    '. Kiểm tra theo bước 7 rồi chạy adminMaintenanceOff. Bảo trì vẫn đang BẬT.');
}
