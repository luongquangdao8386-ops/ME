/* 27_repairs: Sửa chữa — 1.4 §5.3, §10.2–10.4; phụ lục 1.5 mục 4.4.4, 4.6, 5.1 (C4, C9), 6.9.1.
 * Luồng: Mới báo → Đã phân công → Đang xử lý → Chờ nghiệm thu → Hoàn thành; hủy/mở lại có quyền và lý do.
 * Sáu mốc riêng (C9): báo (reported_at) → phân công (assigned_at) → bắt đầu sửa (repair_start_at) → kết thúc sửa (repair_end_at)
 * → hoạt động lại (restored_at) → nghiệm thu (approved_at); "Dừng máy" (stopped_at) là nhãn phụ. Không tự điền mốc thiếu.
 * Mỗi phiếu một khoảng dừng máy (mục 9 #25). Người báo không nghiệm thu phiếu mình báo, kể cả cấp 3 (mục 9 #24). */

var REPAIR_OPEN_ = { REPORTED: 1, ASSIGNED: 1, IN_PROGRESS: 1, PENDING_ACCEPTANCE: 1 };
var TASK_STATUS_ = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
var REPAIR_TIME_FIELDS_ = ['stopped_at', 'repair_start_at', 'repair_end_at', 'restored_at'];

function repairOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('repair_id', 'ID_INVALID')]);
  var r = findOne_('Repairs', 'repair_id', id);
  if (!r || r.archived_at) throw apiError_('NOT_FOUND');
  return r;
}

/** Người được giao của phiếu sửa: người phụ trách hoặc người làm một việc con (4.3 "được giao") */
function repairAssignees_(r, tasks) {
  var out = [r.assignee_user_id];
  (tasks || findAll_('RepairTasks', 'repair_id', r.repair_id)).forEach(function (t) { if (!t.archived_at && t.assignee_user_id) out.push(t.assignee_user_id); });
  return out.filter(String);
}

function assertRepairAssignee_(ctx, r) {
  if (ctx.auth && ctx.auth.conds.length && repairAssignees_(r).indexOf(ctx.user.user_id) < 0) throw apiError_('FORBIDDEN');
}

/** Thời điểm báo: giờ trên máy lúc tạo (nháp offline) nếu hợp lệ và trong 30 ngày, không thì giờ máy chủ */
function reportedAt_(v) {
  if (v && timeOk_(v)) {
    var t = parseTime_(v).getTime();
    if (t >= now_().getTime() - 30 * 86400000) return isoVN_(new Date(t));
  }
  return isoVN_(now_());
}

function causeOk_(code) {
  if (!code) return true;
  return readRows_('LookupValues').some(function (l) { return l.group_key === 'CAUSE' && l.code === code && l.active !== false && !l.archived_at; });
}

/* ---------------- Báo sự cố (RP-03) ---------------- */

/**
 * repair.report: {repair_id, equipment_id, symptom_vi/zh, severity, machine_stopped?, stopped_at?, reported_at?}
 * Mức độ bắt chọn, không chọn sẵn (C4). Ưu tiên mặc định Thường. Mã SC-yymm theo lúc báo. Ảnh gửi bằng doc.upload sau.
 */
function repairReport_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.repair_id)) errs.push(fieldError_('repair_id', 'ID_INVALID'));
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'REQUIRED'));
  requireOneLang_(errs, p, null, 'symptom');
  if (SEVERITIES_.indexOf(p.severity) < 0) errs.push(fieldError_('severity', p.severity ? 'INVALID_VALUE' : 'REQUIRED'));
  checkTimeField_(p, 'stopped_at', errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Repairs', ['symptom'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Repairs', 'repair_id', p.repair_id).length) e2.push(fieldError_('repair_id', 'ID_EXISTS'));
      var eq = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND'));
      if (e2.length) throw validationError_(e2);
      var su = {};
      var at = reportedAt_(p.reported_at || ctx.req.client_time);
      var code = allocCode_(st, su, 'REPAIR', null, at.slice(0, 10));
      var qrKey = allocQrKey_();
      var stopped = p.stopped_at ? normTime_(p.stopped_at) : (p.machine_stopped === true ? at : '');
      var row = cNew_(ctx, {
        repair_id: p.repair_id, repair_code: code, equipment_id: p.equipment_id, reported_by: ctx.user.user_id, reported_at: at,
        symptom_vi: tr.values.symptom_vi, symptom_zh: tr.values.symptom_zh, severity: p.severity, priority: 'NORMAL', status: 'REPORTED',
        assignee_user_id: '', stopped_at: stopped, repair_start_at: '', repair_end_at: '', restored_at: '', root_cause_code: '',
        action_vi: '', action_zh: '', labor_cost: '', outside_cost: '', acceptance_result: '', approved_by: '', approved_at: '',
        submitted_by: '', submitted_at: '', assigned_at: '', cost_currency: '', diagnosis_vi: '', diagnosis_zh: '', vendor_id: '',
        outside_service_vi: '', outside_service_zh: '', test_run_result: '', test_run_note_vi: '', test_run_note_zh: '', downtime_note: '',
        source_work_order_id: '', returned_reason: '', returned_at: '', cancel_reason: '', cancelled_at: '', reopen_reason: '', reopened_at: '',
        i18n_meta: tr.meta
      });
      return {
        writes: [
          { sheet: 'Repairs', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'REPAIR', p.repair_id, code, '', '') }
        ],
        state: su,
        result: { entity_type: 'REPAIR', entity_id: p.repair_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Repairs') },
        record_version: 1,
        audit: { entity_type: 'REPAIR', entity_id: p.repair_id, before_json: null, after_json: { repair_code: code, equipment_id: p.equipment_id, severity: p.severity, stopped_at: stopped } }
      };
    }
  });
}

/**
 * repair.editReport: sửa phiếu báo khi còn Mới báo. Cấp 2 chỉ phiếu mình báo; C3/C4 mọi phiếu.
 * {repair_id, symptom_vi/zh?, severity?, stopped_at?, equipment_id?}
 */
function repairEditReport_(ctx) {
  var p = ctx.req.payload || {};
  var r0 = repairOrThrow_(p.repair_id);
  var errs = [];
  if (p.severity !== undefined && SEVERITIES_.indexOf(p.severity) < 0) errs.push(fieldError_('severity', 'INVALID_VALUE'));
  if (p.symptom_vi !== undefined || p.symptom_zh !== undefined) requireOneLang_(errs, p, r0, 'symptom');
  checkTimeField_(p, 'stopped_at', errs);
  if (p.equipment_id !== undefined && !isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
  if (errs.length) throw validationError_(errs);
  var tr = (p.symptom_vi !== undefined || p.symptom_zh !== undefined) ? applyTranslations_('Repairs', ['symptom'], p, r0) : null;
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function () {
      var r = repairOrThrow_(p.repair_id);
      if (ctx.auth && ctx.auth.conds.length && r.reported_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
      assertVersion_(ctx, r, 'REPAIR', 'Repairs');
      assertStatus_(r, ['REPORTED']);
      if (p.equipment_id !== undefined) {
        var eq = findOne_('Equipment', 'equipment_id', p.equipment_id);
        if (!eq || eq.archived_at) throw validationError_([fieldError_('equipment_id', 'NOT_FOUND')]);
      }
      var row = clone_(r); delete row.__row;
      var before = { symptom_vi: r.symptom_vi, severity: r.severity, stopped_at: r.stopped_at, equipment_id: r.equipment_id };
      if (tr) { row.symptom_vi = tr.values.symptom_vi; row.symptom_zh = tr.values.symptom_zh; row.i18n_meta = Object.assign({}, row.i18n_meta || {}, tr.meta); }
      if (p.severity !== undefined) row.severity = p.severity;
      if (p.stopped_at !== undefined) row.stopped_at = p.stopped_at ? normTime_(p.stopped_at) : '';
      if (p.equipment_id !== undefined) row.equipment_id = p.equipment_id;
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Repairs', mode: 'update', row: row }],
        result: { entity_type: 'REPAIR', entity_id: row.repair_id, display_code: row.repair_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Repairs') },
        record_version: row.record_version,
        audit: { entity_type: 'REPAIR', entity_id: row.repair_id, before_json: before, after_json: { symptom_vi: row.symptom_vi, severity: row.severity, stopped_at: row.stopped_at, equipment_id: row.equipment_id } }
      };
    }
  });
}

/* ---------------- Phân công ---------------- */

/** repair.assign (C3/C4): {repair_id, assignee_user_id, priority?}. Mới báo → Đã phân công (ghi assigned_at, C9) */
function repairAssign_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.assignee_user_id)) errs.push(fieldError_('assignee_user_id', 'REQUIRED'));
  if (p.priority !== undefined && PRIORITIES_.indexOf(p.priority) < 0) errs.push(fieldError_('priority', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function () {
      var r = repairOrThrow_(p.repair_id);
      assertVersion_(ctx, r, 'REPAIR', 'Repairs');
      assertStatus_(r, ['REPORTED', 'ASSIGNED', 'IN_PROGRESS']);
      if (!workerOk_(p.assignee_user_id)) throw validationError_([fieldError_('assignee_user_id', 'NOT_FOUND')]);
      var row = clone_(r); delete row.__row;
      var before = { status: r.status, assignee_user_id: r.assignee_user_id, priority: r.priority };
      row.assignee_user_id = p.assignee_user_id;
      if (r.status === 'REPORTED') { row.status = 'ASSIGNED'; row.assigned_at = isoVN_(now_()); }
      else if (!row.assigned_at) row.assigned_at = isoVN_(now_());
      if (p.priority !== undefined) row.priority = p.priority;
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Repairs', mode: 'update', row: row }],
        result: { entity_type: 'REPAIR', entity_id: row.repair_id, display_code: row.repair_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Repairs') },
        record_version: row.record_version,
        audit: { entity_type: 'REPAIR', entity_id: row.repair_id, before_json: before, after_json: { status: row.status, assignee_user_id: row.assignee_user_id, priority: row.priority } }
      };
    }
  });
}

/* ---------------- Xử lý (RP-02) ---------------- */

/**
 * repair.process: bắt đầu/kết thúc sửa, chẩn đoán, nguyên nhân, công việc sửa, việc con (RepairTasks), dịch vụ ngoài,
 * chạy thử, hoạt động lại. Đã phân công → Đang xử lý ở lần đầu. Chi phí nhập bằng work.cost.edit.
 * {repair_id, stopped_at?, repair_start_at?, repair_end_at?, restored_at?, downtime_note?, diagnosis_vi/zh?, root_cause_code?,
 *  action_vi/zh?, vendor_id?, outside_service_vi/zh?, test_run_result?, test_run_note_vi/zh?,
 *  tasks?: [{repair_task_id, assignee_user_id?, task_vi/zh?, result_vi/zh?, start_at?, end_at?, status?, remove?}]}
 */
function repairProcess_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.repair_id)) errs.push(fieldError_('repair_id', 'ID_INVALID'));
  REPAIR_TIME_FIELDS_.forEach(function (f) { checkTimeField_(p, f, errs); });
  if (p.test_run_result !== undefined && p.test_run_result !== '' && ['PASS', 'FAIL'].indexOf(p.test_run_result) < 0) errs.push(fieldError_('test_run_result', 'INVALID_VALUE'));
  if (p.vendor_id !== undefined && p.vendor_id !== '' && !isUuidV4_(p.vendor_id)) errs.push(fieldError_('vendor_id', 'ID_INVALID'));
  if (p.downtime_note !== undefined && String(p.downtime_note).length > 500) errs.push(fieldError_('downtime_note', 'INVALID_VALUE'));
  ['labor_cost', 'outside_cost', 'cost_currency'].forEach(function (f) { if (p[f] !== undefined) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  var tasks = Array.isArray(p.tasks) ? p.tasks : [];
  if (p.tasks !== undefined && !Array.isArray(p.tasks)) errs.push(fieldError_('tasks', 'INVALID_VALUE'));
  if (tasks.length > 50) errs.push(fieldError_('tasks', 'INVALID_VALUE'));
  tasks.forEach(function (t) {
    var f = 'tasks[' + (t && t.repair_task_id) + ']';
    if (!t || !isUuidV4_(t.repair_task_id)) { errs.push(fieldError_('tasks', 'ID_INVALID')); return; }
    if (t.status !== undefined && TASK_STATUS_.indexOf(t.status) < 0) errs.push(fieldError_(f, 'INVALID_VALUE'));
    if (t.assignee_user_id !== undefined && t.assignee_user_id !== '' && !isUuidV4_(t.assignee_user_id)) errs.push(fieldError_(f, 'INVALID_VALUE'));
    ['start_at', 'end_at'].forEach(function (k) { if (t[k] !== undefined && t[k] !== '' && !timeOk_(t[k])) errs.push(fieldError_(f, 'TIME_ORDER_INVALID')); });
  });
  if (errs.length) throw validationError_(errs);
  var r0 = repairOrThrow_(p.repair_id);
  assertRepairAssignee_(ctx, r0);
  var trFields = ['diagnosis', 'action', 'outside_service', 'test_run_note'].filter(function (f) { return p[f + '_vi'] !== undefined || p[f + '_zh'] !== undefined; });
  var tr = trFields.length ? applyTranslations_('Repairs', trFields, p, r0) : null;
  var curTasks = {};
  findAll_('RepairTasks', 'repair_id', r0.repair_id).forEach(function (t) { curTasks[t.repair_task_id] = t; });
  var trTasks = {};
  tasks.forEach(function (t) {
    var fs = ['task', 'result'].filter(function (f) { return t[f + '_vi'] !== undefined || t[f + '_zh'] !== undefined; });
    if (fs.length) trTasks[t.repair_task_id] = applyTranslations_('RepairTasks', fs, t, curTasks[t.repair_task_id] || null);
  });
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function () {
      var r = repairOrThrow_(p.repair_id);
      assertRepairAssignee_(ctx, r);
      assertVersion_(ctx, r, 'REPAIR', 'Repairs');
      assertStatus_(r, ['ASSIGNED', 'IN_PROGRESS']);
      var e2 = [];
      if (p.root_cause_code !== undefined && !causeOk_(trimStr_(p.root_cause_code))) e2.push(fieldError_('root_cause_code', 'NOT_FOUND'));
      if (p.vendor_id && !findRowNums_('Vendors', 'vendor_id', p.vendor_id).length) e2.push(fieldError_('vendor_id', 'NOT_FOUND'));
      var row = clone_(r); delete row.__row;
      var nowIso = isoVN_(now_());
      if (r.status === 'ASSIGNED') { row.status = 'IN_PROGRESS'; if (!p.repair_start_at && !row.repair_start_at) row.repair_start_at = nowIso; }
      REPAIR_TIME_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = p[f] ? normTime_(p[f]) : ''; });
      if (p.downtime_note !== undefined) row.downtime_note = trimStr_(p.downtime_note);
      if (p.root_cause_code !== undefined) row.root_cause_code = trimStr_(p.root_cause_code);
      if (p.vendor_id !== undefined) row.vendor_id = p.vendor_id || '';
      if (p.test_run_result !== undefined) row.test_run_result = p.test_run_result || '';
      if (tr) {
        trFields.forEach(function (f) { row[f + '_vi'] = tr.values[f + '_vi']; row[f + '_zh'] = tr.values[f + '_zh']; });
        row.i18n_meta = Object.assign({}, row.i18n_meta || {});
        trFields.forEach(function (f) { if (tr.meta[f]) row.i18n_meta[f] = tr.meta[f]; else delete row.i18n_meta[f]; });
      }
      var writes = [];
      var order = Object.keys(curTasks).length;
      tasks.forEach(function (t) {
        var f = 'tasks[' + t.repair_task_id + ']';
        var cur = findOne_('RepairTasks', 'repair_task_id', t.repair_task_id);
        if (cur && (cur.repair_id !== r.repair_id || cur.archived_at)) { e2.push(fieldError_(f, 'NOT_FOUND')); return; }
        if (t.assignee_user_id && !workerOk_(t.assignee_user_id)) { e2.push(fieldError_(f, 'NOT_FOUND')); return; }
        var ttr = trTasks[t.repair_task_id];
        if (t.remove === true) {
          if (!cur) return;
          var rm = clone_(cur); delete rm.__row; rm.archived_at = nowIso; cUpdate_(ctx, rm);
          writes.push({ sheet: 'RepairTasks', mode: 'update', row: rm });
          return;
        }
        if (!cur && !(ttr && (ttr.values.task_vi || ttr.values.task_zh))) { e2.push(fieldError_(f, 'REQUIRED_ONE_LANGUAGE')); return; }
        var t2 = cur ? clone_(cur) : { repair_task_id: t.repair_task_id, repair_id: r.repair_id, assignee_user_id: '', start_at: '', end_at: '', task_vi: '', task_zh: '', result_vi: '', result_zh: '', status: 'PENDING', sort_order: ++order };
        delete t2.__row;
        if (t.assignee_user_id !== undefined) t2.assignee_user_id = t.assignee_user_id || '';
        ['start_at', 'end_at'].forEach(function (k) { if (t[k] !== undefined) t2[k] = t[k] ? normTime_(t[k]) : ''; });
        if (t.status !== undefined) t2.status = t.status;
        if (ttr) {
          Object.keys(ttr.values).forEach(function (k) { t2[k] = ttr.values[k]; });
          t2.i18n_meta = Object.assign({}, t2.i18n_meta || {}, ttr.meta);
        }
        if (t2.start_at && t2.end_at && tms_(t2.start_at) > tms_(t2.end_at)) { e2.push(fieldError_(f, 'TIME_ORDER_INVALID')); return; }
        if (cur) cUpdate_(ctx, t2); else cNew_(ctx, t2);
        writes.push({ sheet: 'RepairTasks', mode: cur ? 'update' : 'insert', row: t2 });
      });
      if (e2.length) throw validationError_(e2);
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Repairs', mode: 'update', row: row });
      return {
        writes: writes,
        result: {
          entity_type: 'REPAIR', entity_id: row.repair_id, display_code: row.repair_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Repairs'),
          tasks: writes.filter(function (x) { return x.sheet === 'RepairTasks'; }).map(function (x) { return projectRow_(ctx, x.row, 'RepairTasks'); })
        },
        record_version: row.record_version,
        audit: { entity_type: 'REPAIR', entity_id: row.repair_id, before_json: { status: r.status }, after_json: { status: row.status, tasks_changed: writes.length - 1 } }
      };
    }
  });
}

/* ---------------- Gửi nghiệm thu, nghiệm thu ---------------- */

/** Điều kiện gửi nghiệm thu phiếu sửa: có kết thúc sửa và kết quả chạy thử; thứ tự thời gian; việc con đã xong; dữ liệu con đã lên */
function repairSubmitErrors_(r, tasks, expect) {
  var errs = [];
  expect = expect || {};
  var missing = false;
  (Array.isArray(expect.documents) ? expect.documents : []).forEach(function (id) {
    var d = isUuidV4_(id) ? findOne_('Documents', 'document_id', id) : null;
    if (!d || d.entity_id !== r.repair_id) missing = true;
  });
  var usage = findAll_('MaterialUsageLines', 'work_id', r.repair_id).filter(function (u) { return u.work_type === 'REPAIR' && !u.archived_at; });
  (Array.isArray(expect.usage_lines) ? expect.usage_lines : []).forEach(function (id) { if (!usage.some(function (u) { return u.usage_line_id === id; })) missing = true; });
  (Array.isArray(expect.tasks) ? expect.tasks : []).forEach(function (id) { if (!tasks.some(function (t) { return t.repair_task_id === id; })) missing = true; });
  if (missing) errs.push(fieldError_('expect', 'UNSYNCED_CHILD_DATA'));
  if (!r.repair_end_at) errs.push(fieldError_('repair_end_at', 'REQUIRED'));
  if (!r.test_run_result) errs.push(fieldError_('test_run_result', 'REQUIRED'));
  var s = tms_(r.repair_start_at), e = tms_(r.repair_end_at), nowMs = now_().getTime() + 5 * 60000;
  if (s === null) errs.push(fieldError_('repair_start_at', 'REQUIRED'));
  if (s !== null && e !== null && (s > e || e > nowMs)) errs.push(fieldError_('repair_end_at', 'TIME_ORDER_INVALID'));
  var st = tms_(r.stopped_at), rs = tms_(r.restored_at);
  if (st !== null && rs !== null && st > rs) errs.push(fieldError_('restored_at', 'TIME_ORDER_INVALID'));
  if (st !== null && rs === null && !trimStr_(r.downtime_note)) errs.push(fieldError_('downtime_note', 'REQUIRED'));
  tasks.forEach(function (t) {
    if (t.status === 'PENDING' || t.status === 'IN_PROGRESS') errs.push(fieldError_('tasks[' + t.repair_task_id + ']', 'STATUS_INVALID'));
  });
  usage.forEach(function (u) {
    var m = findOne_('Materials', 'material_id', u.material_id);
    if (m && m.base_unit && u.unit && m.base_unit !== u.unit) errs.push(fieldError_('usage_lines[' + u.usage_line_id + ']', 'UNIT_MISMATCH'));
  });
  return errs;
}

/** repair.submit {repair_id, expect?}: Đang xử lý → Chờ nghiệm thu; hàng chờ offline được, máy chủ kiểm lại lúc đồng bộ */
function repairSubmit_(ctx) {
  var p = ctx.req.payload || {};
  var r0 = repairOrThrow_(p.repair_id);
  assertRepairAssignee_(ctx, r0);
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function () {
      var r = repairOrThrow_(p.repair_id);
      assertRepairAssignee_(ctx, r);
      assertVersion_(ctx, r, 'REPAIR', 'Repairs');
      assertStatus_(r, ['IN_PROGRESS']);
      var tasks = findAll_('RepairTasks', 'repair_id', r.repair_id).filter(function (t) { return !t.archived_at; });
      var errs = repairSubmitErrors_(r, tasks, p.expect);
      if (errs.length) throw validationError_(errs);
      var row = clone_(r); delete row.__row;
      row.status = 'PENDING_ACCEPTANCE';
      row.submitted_by = ctx.user.user_id; row.submitted_at = isoVN_(now_());
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Repairs', mode: 'update', row: row }],
        result: { entity_type: 'REPAIR', entity_id: row.repair_id, display_code: row.repair_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Repairs') },
        record_version: row.record_version,
        audit: { entity_type: 'REPAIR', entity_id: row.repair_id, before_json: { status: 'IN_PROGRESS' }, after_json: { status: row.status } }
      };
    }
  });
}

/**
 * repair.accept (C3/C4, PIN): {repair_id, decision: PASS | FAIL, reason (bắt buộc khi FAIL), confirm_usage?}
 * Không nghiệm thu: người báo, người phụ trách, người làm việc con, người gửi (4.6). PASS → Hoàn thành;
 * FAIL → trả lại Đang xử lý kèm lý do (acceptance_result = FAIL tới lần nghiệm thu sau).
 */
function repairAccept_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (['PASS', 'FAIL'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'FAIL' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function () {
      var r = repairOrThrow_(p.repair_id);
      var tasks = findAll_('RepairTasks', 'repair_id', r.repair_id).filter(function (t) { return !t.archived_at; });
      var people = [r.reported_by, r.submitted_by].concat(repairAssignees_(r, tasks)).filter(String);
      var basis = assertNotSelf_(ctx, 'repair.accept', people);
      assertVersion_(ctx, r, 'REPAIR', 'Repairs');
      assertStatus_(r, ['PENDING_ACCEPTANCE']);
      var row = clone_(r); delete row.__row;
      var nowIso = isoVN_(now_());
      var writes = [];
      var usageDone = [], usageSkipped = [];
      row.acceptance_result = p.decision;
      if (p.decision === 'FAIL') {
        row.status = 'IN_PROGRESS';
        row.returned_reason = trimStr_(p.reason).slice(0, 500); row.returned_at = nowIso;
      } else {
        row.status = 'COMPLETED';
        row.approved_by = ctx.user.user_id; row.approved_at = nowIso;
        if (p.confirm_usage) {
          findAll_('MaterialUsageLines', 'work_id', r.repair_id).forEach(function (u) {
            if (u.work_type !== 'REPAIR' || u.archived_at || u.status !== 'PENDING_CONFIRMATION') return;
            if (u.recorded_by === ctx.user.user_id) { usageSkipped.push(u.usage_line_id); return; }
            var u2 = clone_(u); delete u2.__row;
            u2.status = 'CONFIRMED'; u2.confirmed_by = ctx.user.user_id; u2.confirmed_at = nowIso;
            cUpdate_(ctx, u2);
            writes.push({ sheet: 'MaterialUsageLines', mode: 'update', row: u2 });
            usageDone.push(u.usage_line_id);
          });
        }
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Repairs', mode: 'update', row: row });
      return {
        writes: writes,
        result: { entity_type: 'REPAIR', entity_id: row.repair_id, display_code: row.repair_code, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'Repairs'), usage_confirmed: usageDone, usage_skipped: usageSkipped },
        record_version: row.record_version,
        audit: {
          entity_type: 'REPAIR', entity_id: row.repair_id, before_json: { status: r.status }, after_json: { status: row.status, acceptance_result: row.acceptance_result, usage_confirmed: usageDone.length || undefined },
          reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined
        }
      };
    }
  });
}

/* ---------------- Hủy, mở lại ---------------- */

function repairQrActive_(r, active, writes) {
  var qr = findOne_('QrRegistry', 'entity_id', r.repair_id);
  if (qr && qr.active !== active) { var q2 = clone_(qr); delete q2.__row; q2.active = active; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
}

/** repair.cancel {repair_id, reason}: cấp 2 chỉ hủy phiếu mình báo khi chưa phân công; C3/C4 hủy phiếu chưa xong */
function repairCancel_(ctx) {
  var p = ctx.req.payload || {};
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function () {
      var r = repairOrThrow_(p.repair_id);
      if (ctx.auth && ctx.auth.conds.length && (r.reported_by !== ctx.user.user_id || r.status !== 'REPORTED' || r.assignee_user_id)) throw apiError_('FORBIDDEN');
      assertVersion_(ctx, r, 'REPAIR', 'Repairs');
      assertStatus_(r, ['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE']);
      var row = clone_(r); delete row.__row;
      row.status = 'CANCELLED'; row.cancel_reason = trimStr_(p.reason).slice(0, 500); row.cancelled_at = isoVN_(now_());
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Repairs', mode: 'update', row: row }];
      repairQrActive_(r, false, writes);
      return {
        writes: writes,
        result: { entity_type: 'REPAIR', entity_id: row.repair_id, display_code: row.repair_code, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'Repairs') },
        record_version: row.record_version,
        audit: { entity_type: 'REPAIR', entity_id: row.repair_id, before_json: { status: r.status }, after_json: { status: 'CANCELLED' }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/**
 * repair.reopen (C3/C4, PIN): {repair_id, reason}. Hoàn thành/Đã hủy → Đang xử lý (đã bắt đầu sửa), Đã phân công (có người
 * phụ trách) hoặc Mới báo. Bỏ kết quả nghiệm thu cũ; mốc thời gian giữ nguyên (lịch sử ở nhật ký).
 */
function repairReopen_(ctx) {
  var p = ctx.req.payload || {};
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function () {
      var r = repairOrThrow_(p.repair_id);
      assertVersion_(ctx, r, 'REPAIR', 'Repairs');
      assertStatus_(r, ['COMPLETED', 'CANCELLED']);
      var row = clone_(r); delete row.__row;
      row.status = r.repair_start_at && r.assignee_user_id ? 'IN_PROGRESS' : (r.assignee_user_id ? 'ASSIGNED' : 'REPORTED');
      row.approved_by = ''; row.approved_at = ''; row.acceptance_result = '';
      row.reopen_reason = trimStr_(p.reason).slice(0, 500); row.reopened_at = isoVN_(now_());
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Repairs', mode: 'update', row: row }];
      repairQrActive_(r, true, writes);
      return {
        writes: writes,
        result: { entity_type: 'REPAIR', entity_id: row.repair_id, display_code: row.repair_code, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'Repairs') },
        record_version: row.record_version,
        audit: { entity_type: 'REPAIR', entity_id: row.repair_id, before_json: { status: r.status, approved_by: r.approved_by }, after_json: { status: row.status }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Xem ---------------- */

/** repair.view: {repair_id} chi tiết (việc con, vật tư, đề nghị) hoặc danh sách {filters: {status, severity, equipment_id, q}} */
function repairView_(ctx) {
  var p = ctx.req.payload || {};
  var qm = qrMap_();
  var proj = function (r) { var o = projectRow_(ctx, r, 'Repairs'); o.qr_key = qm[r.repair_id] || null; return o; };
  if (p.repair_id) {
    var r = repairOrThrow_(p.repair_id);
    return {
      item: proj(r),
      tasks: findAll_('RepairTasks', 'repair_id', r.repair_id).filter(function (t) { return !t.archived_at; }).map(function (t) { return projectRow_(ctx, t, 'RepairTasks'); }),
      usage: findAll_('MaterialUsageLines', 'work_id', r.repair_id).filter(function (u) { return u.work_type === 'REPAIR' && !u.archived_at; }).map(function (u) { return projectRow_(ctx, u, 'MaterialUsageLines'); }),
      requests: findAll_('MaterialRequests', 'work_id', r.repair_id).filter(function (x) { return x.work_type === 'REPAIR' && !x.archived_at; }).map(function (x) { return projectRow_(ctx, x, 'MaterialRequests'); })
    };
  }
  var f = p.filters || {};
  var q = trimStr_(f.q).toLowerCase();
  var rows = readRows_('Repairs').filter(function (r) {
    if (r.archived_at) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.severity && r.severity !== f.severity) return false;
    if (f.equipment_id && r.equipment_id !== f.equipment_id) return false;
    if (q && [r.repair_code, r.symptom_vi, r.symptom_zh].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.reported_at).localeCompare(String(a.reported_at)); });
  var size = Math.min(200, Number(p.page_size) || setting_('list_page_size'));
  var start = Number(p.page_token || 0);
  return { items: rows.slice(start, start + size).map(proj), total: rows.length, next_page_token: start + size < rows.length ? String(start + size) : null };
}
