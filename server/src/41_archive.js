/* 41_archive: Lưu trữ theo năm (d4.27, người dùng yêu cầu 04/11/2026 "làm lưu trữ theo năm").
 *
 * Mục đích: bảng phát sinh hằng ngày không phình mãi → app không chậm dần. Chỉ CHUYỂN (chép sang tệp lưu trữ rồi mới xóa khỏi bảng chính)
 * dữ liệu cũ hơn ngày 01/01 của năm sau năm chọn; GIỮ NGUYÊN danh mục, thiết bị, đồng hồ, tủ/lộ, tem QR, kế hoạch, hợp đồng, kiểm định,
 * phiếu bảo trì/sửa chữa (lý lịch máy). Không đổi dataset_epoch, không đụng phiên đăng nhập.
 *
 * Chuyển:
 *  - MeterReadings: chỉ số có measured_at < mốc; GIỮ lần đọc hợp lệ mới nhất trước mốc của từng đồng hồ và từng giai đoạn (mốc tính tiếp,
 *    kiểm số nhỏ hơn số trước) và chỉ số "Cần xem lại" chưa xử lý.
 *  - Documents: dòng ảnh chỉ số (entity_type METER_READING) của chỉ số đã chuyển (tệp ảnh vẫn ở Drive, tệp lưu trữ giữ mã tệp).
 *  - AuditLogs (occurred_at < mốc), Operations đã xong (received_at < mốc, không PREPARED), ImportRows của lô đã xong (COMMITTED/FAILED)
 *    nhập trước mốc.
 * Tệp lưu trữ: một Google Sheets mỗi năm "<tiền tố>LuuTru_<năm>" trong thư mục Backups/LuuTru (riêng tư): sheet Thông tin, Tổng kết
 * (tiêu thụ từng tháng mỗi đồng hồ), Cân bằng (tổng – nhánh từng tháng), rồi mỗi bảng đã chuyển một sheet (tiêu đề = tên cột).
 *
 * Chạy theo bước (client gọi archive.step tới khi xong; lease ScriptProperties chống chạy chồng): BACKUP (sao lưu phải VERIFIED) →
 * SUMMARY → READINGS → PHOTOS → AUDIT → OPERATIONS → IMPORT_ROWS → DONE. Mỗi bước chép trước, xóa sau (trong khóa ghi); chạy lại sau sự cố
 * không chép trùng (bỏ dòng đã có theo mã). Xóa bằng deleteRows từng khối liền nhau từ dưới lên (người đọc cùng lúc không thấy bảng trống).
 * Chỉ chọn được năm đã kết thúc từ 01/02 năm sau (báo cáo tháng 12 và mục Chờ bạn xử lý của tháng 12 đã qua). Sau khi lưu trữ, báo cáo
 * Điện nước các tháng của năm đó trong app không còn số (xem trong tệp lưu trữ; báo cáo đã "Lưu" vẫn xem được).
 */

var ARCHIVE_PHASES_ = ['BACKUP', 'SUMMARY', 'READINGS', 'PHOTOS', 'AUDIT', 'OPERATIONS', 'IMPORT_ROWS', 'DONE'];
var ARCHIVE_TABLE_OF_ = { READINGS: 'MeterReadings', PHOTOS: 'Documents', AUDIT: 'AuditLogs', OPERATIONS: 'Operations', IMPORT_ROWS: 'ImportRows' };
var ARCHIVE_CHUNK_ = 20000;
var ARCHIVE_LEASE_PROP_ = 'ARCHIVE_LEASE';
var ARCHIVE_LEASE_MS_ = 6 * 60000;
var ARCHIVE_FIRST_YEAR_ = 2026;

/** Giá trị ô thô → chuỗi (ngày giờ là Date thì đổi sang ISO giờ VN) */
function arcStr_(v) { return v instanceof Date ? isoVN_(v) : (v === null || v === undefined ? '' : String(v)); }

/** Bảng thô: {sheet, head: [tên cột], rows: [[...]] (không tiêu đề), col(name) → chỉ số cột} */
function arcRead_(name) {
  var sheet = sh_(name);
  var last = sheet.getLastRow();
  var width = Math.max(sheet.getLastColumn(), 1);
  var all = last >= 1 ? sheet.getRange(1, 1, last, width).getValues() : [[]];
  var head = all[0].map(function (h) { return String(h || ''); });
  return { sheet: sheet, head: head, rows: all.slice(1), col: function (c) { return head.indexOf(c); } };
}

/** Năm có thể lưu trữ: đã kết thúc và từ 01/02 năm sau */
function arcAllowedFrom_(year) { return (year + 1) + '-02-01'; }
function arcCutoff_(year) { return (year + 1) + '-01-01'; }

function arcRegistry_() {
  var v = stateGet_(readState_(), 'archive_years', '');
  try { var o = typeof v === 'string' ? JSON.parse(v || '{}') : v; return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function arcRun_() {
  var v = stateGet_(readState_(), 'archive_run', '');
  try { var o = typeof v === 'string' ? JSON.parse(v || 'null') : v; return o && o.run_id ? o : null; } catch (e) { return null; }
}
function arcSaveRun_(run) {
  withWriteLock_(function () { stateWrite_(readState_(), { archive_run: ['STRING', JSON.stringify(run)] }, run.by || SYSTEM_USER); });
  cache_().remove('sys:state');
}

/**
 * Chọn dòng cần chuyển của từng bảng (không ghi gì). readingsGone: tập reading_id đã chuyển/sẽ chuyển (cho PHOTOS).
 * Trả {move: [chỉ số dòng trong t.rows], keep: số dòng giữ lại trước mốc}
 */
function arcSelect_(phase, t, cutoff, ctx) {
  var move = [], keepOld = 0;
  if (phase === 'READINGS') {
    var cM = t.col('meter_id'), cS = t.col('meter_segment_id'), cT = t.col('measured_at'), cSt = t.col('status'), cId = t.col('reading_id');
    var latest = {};
    t.rows.forEach(function (r, i) {
      var at = arcStr_(r[cT]);
      if (!(at < cutoff) || String(r[cSt]) !== 'VALID') return;
      [String(r[cM]), String(r[cM]) + '|' + String(r[cS])].forEach(function (k) { if (!latest[k] || at >= latest[k].at) latest[k] = { at: at, i: i }; });
    });
    var keepIdx = {};
    Object.keys(latest).forEach(function (k) { keepIdx[latest[k].i] = true; });
    t.rows.forEach(function (r, i) {
      if (!(arcStr_(r[cT]) < cutoff) || !arcStr_(r[cId])) return;
      if (keepIdx[i] || String(r[cSt]) === 'NEEDS_REVIEW') { keepOld++; return; }
      move.push(i);
    });
  } else if (phase === 'PHOTOS') {
    var cE = t.col('entity_type'), cEid = t.col('entity_id');
    t.rows.forEach(function (r, i) {
      if (String(r[cE]) !== 'METER_READING') return;
      if (ctx.readingsGone[String(r[cEid])]) move.push(i);
    });
  } else if (phase === 'AUDIT') {
    var cA = t.col('occurred_at');
    t.rows.forEach(function (r, i) { if (arcStr_(r[cA]) && arcStr_(r[cA]) < cutoff) move.push(i); });
  } else if (phase === 'OPERATIONS') {
    var cR = t.col('received_at'), cSo = t.col('state');
    t.rows.forEach(function (r, i) {
      var at = arcStr_(r[cR]);
      if (!at || !(at < cutoff)) return;
      if (String(r[cSo]) === 'PREPARED') { keepOld++; return; }
      move.push(i);
    });
  } else if (phase === 'IMPORT_ROWS') {
    var cB = t.col('import_batch_id');
    t.rows.forEach(function (r, i) { if (ctx.batchesDone[String(r[cB])]) move.push(i); });
  }
  return { move: move, keep: keepOld };
}

/** Bối cảnh chọn dòng: chỉ số đã/sẽ chuyển (ảnh theo chỉ số), lô nhập đã xong trước mốc */
function arcContext_(cutoff, plannedReadings) {
  var gone = {};
  if (plannedReadings) plannedReadings.forEach(function (id) { gone[id] = true; });
  else {
    // Sau bước READINGS: ảnh của chỉ số không còn trong bảng chính
    var t = arcRead_('MeterReadings'), cId = t.col('reading_id'), have = {};
    t.rows.forEach(function (r) { have[arcStr_(r[cId])] = true; });
    readRows_('Documents').forEach(function (d) { if (d.entity_type === 'METER_READING' && !have[d.entity_id]) gone[d.entity_id] = true; });
  }
  var done = {};
  readRows_('ImportBatches').forEach(function (b) {
    if ((b.status === 'COMMITTED' || b.status === 'FAILED') && arcStr_(b.imported_at) && arcStr_(b.imported_at) < cutoff) done[b.import_batch_id] = true;
  });
  return { readingsGone: gone, batchesDone: done };
}

/** Số dòng sẽ chuyển của một năm (xem trước): {MeterReadings, Documents, AuditLogs, Operations, ImportRows, readings_kept} */
function arcPlanCounts_(year) {
  var cutoff = arcCutoff_(year);
  var tr = arcRead_('MeterReadings');
  var sr = arcSelect_('READINGS', tr, cutoff, null);
  var cId = tr.col('reading_id');
  var ctx = arcContext_(cutoff, sr.move.map(function (i) { return arcStr_(tr.rows[i][cId]); }));
  var out = { MeterReadings: sr.move.length, readings_kept: sr.keep };
  ['PHOTOS', 'AUDIT', 'OPERATIONS', 'IMPORT_ROWS'].forEach(function (ph) {
    out[ARCHIVE_TABLE_OF_[ph]] = arcSelect_(ph, arcRead_(ARCHIVE_TABLE_OF_[ph]), cutoff, ctx).move.length;
  });
  return out;
}

/** Thư mục Backups/LuuTru (tạo khi chưa có) */
function arcFolder_() {
  var root = backupRoot_();
  var it = root.getFolders();
  while (it.hasNext()) { var f = it.next(); if (f.getName() === 'LuuTru') return f; }
  return root.createFolder('LuuTru');
}

/** Sheet trong tệp lưu trữ (tạo + tiêu đề khi chưa có) */
function arcSheet_(ss, name, head) {
  var s = ss.getSheetByName(name);
  if (!s) {
    var first = ss.getSheets()[0];
    if (ss.getSheets().length === 1 && first.getLastRow() === 0 && /^(Sheet1|Trang tính1)$/.test(first.getName())) { first.setName(name); s = first; }
    else s = ss.insertSheet(name);
  }
  if (head && s.getLastRow() === 0) arcWrite_(s, [head]);
  return s;
}

/** Ghi thêm dòng vào cuối sheet (mở rộng hàng/cột khi cần) */
function arcWrite_(s, rows) {
  if (!rows.length) return;
  var w = 0;
  rows.forEach(function (r) { if (r.length > w) w = r.length; });
  rows = rows.map(function (r) { while (r.length < w) r = r.concat(['']); return r; });
  var start = s.getLastRow() + 1;
  var needR = start + rows.length - 1 - s.getMaxRows();
  if (needR > 0) s.insertRowsAfter(s.getMaxRows(), needR);
  var needC = w - s.getMaxColumns();
  if (needC > 0) s.insertColumnsAfter(s.getMaxColumns(), needC);
  s.getRange(start, 1, rows.length, w).setValues(rows);
}

/** Xóa các dòng (chỉ số trong t.rows, tức hàng sheet = i + 2) theo khối liền nhau từ dưới lên; xóa hết thì xóa nội dung (Sheets cấm xóa mọi hàng) */
function arcDelete_(t, idx) {
  if (!idx.length) return;
  var sheet = t.sheet;
  if (idx.length === t.rows.length) {
    sheet.getRange(2, 1, t.rows.length, Math.max(t.head.length, 1)).clearContent();
    return;
  }
  var rowsNo = idx.map(function (i) { return i + 2; }).sort(function (a, b) { return b - a; });
  var k = 0;
  while (k < rowsNo.length) {
    var end = rowsNo[k], start = end;
    while (k + 1 < rowsNo.length && rowsNo[k + 1] === start - 1) { k++; start--; }
    sheet.deleteRows(start, end - start + 1);
    k++;
  }
}

/** Một lượt chuyển một bảng (≤ ARCHIVE_CHUNK_ dòng): chép sang tệp lưu trữ (bỏ dòng đã có), xóa khỏi bảng chính, tăng phiên bản bảng. Trả số dòng đã chuyển và còn không */
function arcMoveTable_(run, phase, ss) {
  var name = ARCHIVE_TABLE_OF_[phase];
  return withWriteLock_(function () {
    dbReset_();
    var t = arcRead_(name);
    var ctx = phase === 'PHOTOS' || phase === 'IMPORT_ROWS' ? arcContext_(run.cutoff, null) : null;
    var sel = arcSelect_(phase, t, run.cutoff, ctx).move;
    if (!sel.length) return { moved: 0, more: false };
    var part = sel.slice(0, ARCHIVE_CHUNK_);
    var target = arcSheet_(ss, name, t.head);
    // Chạy lại sau sự cố (đã chép mà chưa xóa): không chép trùng theo mã (cột đầu = khóa bảng)
    var have = {};
    if (target.getLastRow() > 1) target.getRange(2, 1, target.getLastRow() - 1, 1).getValues().forEach(function (r) { have[arcStr_(r[0])] = true; });
    var rows = part.filter(function (i) { return !have[arcStr_(t.rows[i][0])]; }).map(function (i) { return t.rows[i].map(function (v) { return v instanceof Date ? isoVN_(v) : v; }); });
    arcWrite_(target, rows);
    SpreadsheetApp.flush();
    arcDelete_(t, part);
    resetBumpTable_(name);
    dbReset_();
    return { moved: part.length, more: sel.length > part.length };
  });
}

/** Sheet Tổng kết (tiêu thụ từng tháng mỗi đồng hồ) + Cân bằng (tổng – nhánh từng tháng) của năm, tính trước khi chuyển chỉ số */
function arcSummary_(run, ss) {
  var year = run.year, W = windowHours_(), nowMs = now_().getTime();
  var d = utilityData_();
  var meters = d.meters.slice().sort(function (a, b) { return UTILITY_TYPES_.indexOf(a.utility_type) - UTILITY_TYPES_.indexOf(b.utility_type) || String(a.meter_code).localeCompare(String(b.meter_code)); });
  var byId = {};
  meters.forEach(function (m) { byId[m.meter_id] = m; });
  var months = [];
  for (var mo = 1; mo <= 12; mo++) {
    var a = year + '-' + (mo < 10 ? '0' : '') + mo + '-01';
    months.push([a, addDaysIso_((mo === 12 ? (year + 1) + '-01' : year + '-' + (mo + 1 < 10 ? '0' : '') + (mo + 1)) + '-01', -1)]);
  }
  var lb = function (k) { var x = LABELS[k] || [k, k]; return x[0] + ' · ' + x[1]; };
  var mh = months.map(function (p, i) { return 'T' + (i + 1); });
  var s1 = arcSheet_(ss, 'Tổng kết · 总结', null);
  if (s1.getLastRow() === 0) {
    var rows = [[lb('ut.meter_code'), lb('ut.meters'), lb('col.type'), lb('ut.parent_meter'), 'Đơn vị · 单位'].concat(mh).concat(['Cả năm · 全年'])];
    meters.forEach(function (m) {
      var r = [m.meter_code, [m.name_vi, m.name_zh].filter(Boolean).join(' · '), lb('utility_type.' + m.utility_type), m.parent_meter_id && byId[m.parent_meter_id] ? byId[m.parent_meter_id].meter_code : '', m.unit || UTILITY_UNIT_[m.utility_type]];
      var any = false;
      months.forEach(function (p) { var x = meterPeriod_(d, m, p[0], p[1], W, nowMs); if (x.status !== 'NO_READING') any = true; r.push(x.status === 'OK' ? x.consumption : (x.status === 'NO_READING' ? '' : '—')); });
      var y = meterPeriod_(d, m, year + '-01-01', year + '-12-31', W, nowMs);
      r.push(y.status === 'OK' ? y.consumption : (y.status === 'NO_READING' ? '' : '—'));
      if (any || y.status !== 'NO_READING') rows.push(r);
    });
    rows.push([]);
    rows.push(['— = thiếu số đo đầu/cuối kỳ (không nội suy) · 缺期初/期末读数（不插值）']);
    arcWrite_(s1, rows);
  }
  var s2 = arcSheet_(ss, 'Cân bằng · 平衡', null);
  if (s2.getLastRow() === 0) {
    var cfg = lossTolCfg_();
    var per = months.map(function (p) { return meterBalance_(d, meters, p[0], p[1], W, nowMs, cfg); });
    var yr = meterBalance_(d, meters, year + '-01-01', year + '-12-31', W, nowMs, cfg);
    var rows2 = [[lb('bal.col.main'), lb('ut.meters'), lb('col.type'), 'Số nhánh · 分表数', lb('bal.col.tol')].concat(mh).concat(['Cả năm · 全年'])];
    var cell = function (r) { return !r ? '' : (r.pct === null || r.pct === undefined ? lab_('balance_status.' + r.status) : r.pct + ' %' + (r.status === 'OK' ? '' : ' (' + lab_('balance_status.' + r.status).split(' · ')[0] + ')')); };
    yr.forEach(function (b) {
      rows2.push([new Array(b.level * 2 + 1).join(' ') + b.meter_code, [b.name_vi, b.name_zh].filter(Boolean).join(' · '), lb('utility_type.' + b.utility_type), b.children_n, b.tol + ' %']
        .concat(per.map(function (list) { return cell(list.filter(function (x) { return x.meter_id === b.meter_id; })[0]); })).concat([cell(b)]));
    });
    if (!yr.length) rows2.push([lab_('bal.tol_none')]);
    arcWrite_(s2, rows2);
  }
}

/** Chạy tiếp lượt lưu trữ đang dở trong ngân sách thời gian */
function arcAdvance_(budgetMs) {
  var run = arcRun_();
  if (!run || run.phase === 'DONE' || run.phase === 'FAILED') return run;
  var now = Date.now();
  var lease = Number(prop_(ARCHIVE_LEASE_PROP_) || 0);
  if (lease > now) return run; // đang chạy ở lượt khác
  setProp_(ARCHIVE_LEASE_PROP_, String(now + ARCHIVE_LEASE_MS_));
  var t0 = Date.now();
  try {
    while (run.phase !== 'DONE' && run.phase !== 'FAILED' && Date.now() - t0 < budgetMs) {
      if (run.phase === 'BACKUP') {
        var mf = backupDataRun_();
        if (mf.status !== 'VERIFIED') { run.phase = 'FAILED'; run.error = 'BACKUP_' + mf.status; run.backup_ref = mf.folder; break; }
        run.backup_ref = mf.folder;
        if (!run.file_id) { // lượt trước lỗi giữa chừng: dùng tiếp tệp đã có
          var ss = SpreadsheetApp.create(NAME_PREFIX + 'LuuTru_' + run.year);
          DriveApp.getFileById(ss.getId()).moveTo(arcFolder_());
          run.file_id = ss.getId();
        }
        run.phase = 'SUMMARY';
      } else if (run.phase === 'SUMMARY') {
        arcSummary_(run, SpreadsheetApp.openById(run.file_id));
        run.phase = 'READINGS';
      } else if (run.phase === 'DONE') {
        break;
      } else {
        var r = arcMoveTable_(run, run.phase, SpreadsheetApp.openById(run.file_id));
        run.moved[ARCHIVE_TABLE_OF_[run.phase]] = (run.moved[ARCHIVE_TABLE_OF_[run.phase]] || 0) + r.moved;
        if (!r.more) run.phase = ARCHIVE_PHASES_[ARCHIVE_PHASES_.indexOf(run.phase) + 1];
        if (run.phase === 'DONE') arcFinish_(run);
      }
      arcSaveRun_(run);
    }
  } catch (e) {
    run.phase = 'FAILED';
    run.error = String(e && e.message || e).slice(0, 300);
  } finally {
    arcSaveRun_(run);
    delProp_(ARCHIVE_LEASE_PROP_);
  }
  return run;
}

/** Xong: sheet Thông tin, ghi danh sách năm đã lưu trữ, nhật ký */
function arcFinish_(run) {
  run.finished_at = isoVN_(now_());
  var ss = SpreadsheetApp.openById(run.file_id);
  var s = arcSheet_(ss, 'Thông tin · 信息', null);
  if (s.getLastRow() === 0) {
    var rows = [['Lưu trữ theo năm · 按年归档', String(run.year)], ['Dữ liệu trước ngày · 截止日期之前', run.cutoff], ['Bắt đầu · 开始', run.started_at],
      ['Xong · 完成', run.finished_at], ['Người chạy · 执行人', run.by_name || ''], ['Bản sao lưu trước khi chuyển · 归档前备份', run.backup_ref || ''], ['Máy chủ · 服务器', SERVER_VERSION]];
    Object.keys(run.moved).forEach(function (k) { rows.push(['Đã chuyển · 已转移: ' + k, run.moved[k]]); });
    arcWrite_(s, rows);
  }
  withWriteLock_(function () {
    var st = readState_();
    var reg = arcRegistry_();
    reg[String(run.year)] = { year: run.year, file_id: run.file_id, at: run.finished_at, by: run.by, by_name: run.by_name || '', moved: run.moved, backup_ref: run.backup_ref || '' };
    stateWrite_(st, { archive_years: ['STRING', JSON.stringify(reg)] }, run.by);
    writeAudit_({ user_id: run.by, device_id: '', action: 'archive.done', entity_type: 'ARCHIVE', entity_id: String(run.year), before_json: null, after_json: { moved: run.moved, file_id: run.file_id },
      operation_id: '', reason: '', auth_basis: 'ROLE_LEVEL' });
  });
  cache_().remove('sys:state');
}

function arcUrl_(id) { return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : ''; }

function arcRunView_(run) {
  if (!run) return null;
  return { run_id: run.run_id, year: run.year, phase: run.phase, phases: ARCHIVE_PHASES_, moved: run.moved, error: run.error || '', started_at: run.started_at,
    finished_at: run.finished_at || '', by_name: run.by_name || '', file_url: arcUrl_(run.file_id), backup_ref: run.backup_ref || '' };
}

/** archive.view (C4): năm có thể lưu trữ (số dòng sẽ chuyển), các năm đã lưu trữ (link tệp), lượt đang chạy */
function archiveView_(ctx) {
  var reg = arcRegistry_();
  var today = todayVN_();
  var cur = Number(today.slice(0, 4));
  var years = [];
  for (var y = ARCHIVE_FIRST_YEAR_; y <= cur - 1; y++) {
    if (reg[String(y)]) continue;
    var allowedFrom = arcAllowedFrom_(y);
    years.push({ year: y, allowed: today >= allowedFrom, allowed_from: allowedFrom, counts: arcPlanCounts_(y) });
  }
  var archives = Object.keys(reg).sort().reverse().map(function (k) { var x = reg[k]; return { year: x.year, at: x.at, by_name: x.by_name, moved: x.moved, file_url: arcUrl_(x.file_id), backup_ref: x.backup_ref }; });
  return { today: today, next_year: cur, next_allowed_from: arcAllowedFrom_(cur), years: years, archives: archives, run: arcRunView_(arcRun_()) };
}

/** archive.start {year} (C4, PIN): kiểm năm, tạo lượt chạy (bước đầu: sao lưu); app gọi archive.step tới khi xong */
function archiveStart_(ctx) {
  var p = ctx.req.payload || {};
  var year = Number(p.year);
  var today = todayVN_();
  if (!Number.isInteger(year)) throw validationError_([fieldError_('year', 'INVALID_VALUE')]);
  if (year < ARCHIVE_FIRST_YEAR_ || year >= Number(today.slice(0, 4))) throw validationError_([fieldError_('year', 'INVALID_VALUE')]);
  if (today < arcAllowedFrom_(year)) throw validationError_([fieldError_('year', 'ARCHIVE_TOO_EARLY')]);
  if (arcRegistry_()[String(year)]) throw validationError_([fieldError_('year', 'ARCHIVE_DONE')]);
  var cur = arcRun_();
  if (cur && cur.phase !== 'DONE' && cur.phase !== 'FAILED') throw apiError_('SERVER_BUSY');
  var run = { run_id: uuid_(), year: year, cutoff: arcCutoff_(year), phase: 'BACKUP', started_at: isoVN_(now_()), by: ctx.user.user_id,
    by_name: (userDirectory_()[ctx.user.user_id] || {}).display_name || '', moved: {}, file_id: '' };
  // Lượt trước lỗi ở giữa chừng (đã có tệp lưu trữ cùng năm): dùng tiếp tệp đó, không chép trùng
  if (cur && cur.phase === 'FAILED' && cur.year === year && cur.file_id) { run.file_id = cur.file_id; run.moved = cur.moved || {}; }
  arcSaveRun_(run);
  withWriteLock_(function () {
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'archive.start', entity_type: 'ARCHIVE', entity_id: String(year), before_json: null,
      after_json: { cutoff: run.cutoff }, operation_id: ctx.req.operation_id || '', reason: '', auth_basis: 'ROLE_LEVEL' });
  });
  return { run: arcRunView_(run) };
}

/** archive.step (C4): chạy tiếp ~20 giây (bước sao lưu có thể lâu hơn); trả trạng thái */
function archiveStep_(ctx) {
  if (!arcRun_()) throw apiError_('NOT_FOUND');
  var busy = Number(prop_(ARCHIVE_LEASE_PROP_) || 0) > Date.now(); // lượt khác đang chạy (vd sao lưu lâu, app mất phản hồi rồi hỏi lại)
  return { run: arcRunView_(busy ? arcRun_() : arcAdvance_(20000)), busy: busy };
}
