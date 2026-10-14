/* 26_maintenance: Bảo trì — 1.4 §5.2, §10.2–10.4; phụ lục 1.5 mục 4.4.3, 4.6, 4.7, 5.1 (C7, C8), 5.1.1, 6.9.1.
 * Kế hoạch lặp lại tách khỏi phiếu thực hiện. Phiếu chụp bản checklist lúc tạo (WorkOrderResults), sửa mẫu sau không đổi lịch sử.
 * Luồng: Nháp → Đã giao việc → Đang làm → Chờ nghiệm thu → Hoàn thành; hủy có lý do. Gửi nghiệm thu không tự hoàn thành;
 * người lập, người làm, người gửi không tự nghiệm thu. Mục không đạt tạo đề nghị sửa chữa (Repairs REPORTED).
 * Lịch cố định theo mốc bắt đầu (anchor_date): hạn tiếp theo = lần kế tiếp của chuỗi mốc sau hạn phiếu vừa xong/hủy.
 * Theo giờ chạy: phiếu sinh khi số giờ đọc mới nhất ≥ operating_hours_target; xong thì target = giờ lúc làm + chu kỳ. */

var PRIORITIES_ = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
var PLAN_INTERVAL_TYPES_ = ['DAY', 'MONTH', 'OPERATING_HOURS'];
var RESULT_TYPES_ = ['PASS_FAIL', 'NUMBER', 'TEXT'];
var CHECK_RESULTS_ = ['PENDING', 'PASS', 'FAIL', 'NA'];
var WO_OPEN_ = { DRAFT: 1, ASSIGNED: 1, IN_PROGRESS: 1, PENDING_ACCEPTANCE: 1 };
var SEVERITIES_ = ['HIGH', 'MEDIUM', 'LOW'];

/* ---------------- Thời điểm ---------------- */

var ISO_TIME_RE_ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Thời điểm hợp lệ (ISO có múi giờ), không quá giờ máy chủ + 5 phút (lệch đồng hồ) */
function timeOk_(s) {
  if (!ISO_TIME_RE_.test(String(s || ''))) return false;
  var t = parseTime_(s);
  return !!t && t.getTime() <= now_().getTime() + 5 * 60000;
}

function normTime_(s) {
  return s ? isoVN_(parseTime_(s)) : '';
}

/** Kiểm một trường thời điểm trong payload: '' = xóa; giá trị phải hợp lệ */
function checkTimeField_(p, f, errs) {
  if (p[f] === undefined || p[f] === null || p[f] === '') return;
  if (!timeOk_(p[f])) errs.push(fieldError_(f, ISO_TIME_RE_.test(String(p[f])) ? 'TIME_ORDER_INVALID' : 'INVALID_VALUE'));
}

function tms_(s) { var t = parseTime_(s); return t ? t.getTime() : null; }

/* ---------------- Lịch kế hoạch ---------------- */

function daysInMonth_(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Cộng n tháng; ngày vượt cuối tháng thì lấy ngày cuối tháng (31/01 + 1 tháng = 28/02) */
function addMonthsIso_(iso, n, anchorDay) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  var y = +m[1], mo = +m[2] - 1 + n;
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  var d = Math.min(anchorDay || +m[3], daysInMonth_(y, mo + 1));
  return y + '-' + pad2_(mo + 1) + '-' + pad2_(d);
}

function addDaysIso_(iso, n) {
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lần thứ k của chuỗi mốc (k ≥ 0) */
function occurrence_(plan, k) {
  var a = String(plan.anchor_date);
  var n = Number(plan.interval_value);
  if (plan.interval_type === 'MONTH') return addMonthsIso_(a, k * n, +a.slice(8, 10));
  return addDaysIso_(a, k * n);
}

/** Lần đầu của chuỗi mốc thỏa cmp(date): 'ge' ≥ d, 'gt' > d */
function occurrenceFrom_(plan, d, strict) {
  var a = String(plan.anchor_date);
  if (!isDateStr_(a) || !(Number(plan.interval_value) > 0)) return '';
  if (strict ? a > d : a >= d) return a;
  var n = Number(plan.interval_value);
  var k;
  if (plan.interval_type === 'MONTH') {
    var months = (Number(d.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(d.slice(5, 7)) - Number(a.slice(5, 7)));
    k = Math.max(0, Math.floor(months / n) - 1);
  } else {
    k = Math.max(0, Math.floor((dayNum_(d) - dayNum_(a)) / n) - 1);
  }
  for (var guard = 0; guard < 1000; guard++, k++) {
    var o = occurrence_(plan, k);
    if (strict ? o > d : o >= d) return o;
  }
  return '';
}

/* ---------------- Người làm, checklist ---------------- */

/** Người nhận việc được: đang hoạt động, cấp 3/4, hoặc cấp 2 có vai trò Kỹ thuật viên */
function workerOk_(userId) {
  if (!isUuidV4_(userId)) return false;
  var u = findOne_('Users', 'user_id', userId);
  if (!u || !u.active) return false;
  var lvl = Number(u.role_level);
  if (lvl >= 3) return true;
  if (lvl === 2) return userScopes_(u).some(function (s) { return s.subrole === 'KY_THUAT'; });
  return false;
}

/** Bản mới nhất của một mẫu checklist: {revision, items[]} (items sắp theo step_no) */
function latestChecklist_(templateId, allRows) {
  var rows = (allRows || findAll_('ChecklistTemplates', 'template_id', templateId)).filter(function (r) {
    return r.template_id === templateId && !r.archived_at;
  });
  var rev = 0;
  rows.forEach(function (r) { if (Number(r.revision) > rev) rev = Number(r.revision); });
  var items = rows.filter(function (r) { return Number(r.revision) === rev; });
  items.sort(function (a, b) { return Number(a.step_no) - Number(b.step_no); });
  return { revision: rev, items: items, active: items.length ? items[0].active !== false : false };
}

/** Chụp checklist vào phiếu: dòng WorkOrderResults PENDING (nhãn, đơn vị, giới hạn lúc làm) */
function snapshotResults_(ctxUser, woId, templateId) {
  if (!templateId) return { revision: '', rows: [] };
  var cl = latestChecklist_(templateId);
  var nowIso = isoVN_(now_());
  var rows = cl.items.map(function (it) {
    return {
      result_id: uuid_(), work_order_id: woId, template_item_id: it.template_item_id, template_revision: cl.revision,
      step_no: it.step_no, label_vi: it.label_vi, label_zh: it.label_zh, result_status: 'PENDING', measured_value: '',
      unit: it.unit || '', note_vi: '', note_zh: '', result_type: it.result_type, required: it.required !== false,
      min_value: it.min_value === null ? '' : it.min_value, max_value: it.max_value === null ? '' : it.max_value,
      safety_note_vi: it.safety_note_vi || '', safety_note_zh: it.safety_note_zh || '',
      i18n_meta: it.i18n_meta ? { label: it.i18n_meta.label, safety_note: it.i18n_meta.safety_note } : {},
      dataset_epoch: sysProps_().dataset_epoch, record_version: 1, created_at: nowIso, created_by: ctxUser,
      updated_at: nowIso, updated_by: ctxUser, archived_at: ''
    };
  });
  return { revision: cl.revision, rows: rows };
}

/**
 * Dòng phiếu mới (chưa ghi). opts: {id, equipment_id, title_vi, title_zh, title_meta, due_date, priority, assignee, plan,
 * template_id, source, created_by}. Trả {wo, results, qr, su}.
 */
function newWorkOrder_(st, su, opts) {
  var code = allocCode_(st, su, 'WORK_ORDER', null, opts.due_date);
  var snap = snapshotResults_(opts.created_by, opts.id, opts.template_id);
  var nowIso = isoVN_(now_());
  var wo = {
    work_order_id: opts.id, work_order_code: code, plan_id: opts.plan ? opts.plan.plan_id : '', equipment_id: opts.equipment_id,
    due_date: opts.due_date, assignee_user_id: opts.assignee || '', status: opts.assignee ? 'ASSIGNED' : 'DRAFT',
    start_at: '', end_at: '', downtime_start_at: '', downtime_end_at: '', labor_minutes: '', labor_cost: '', other_cost: '',
    result_vi: '', result_zh: '', approved_by: '', approved_at: '', next_due_date: '', submitted_by: '', submitted_at: '',
    overall_result: '', priority: opts.priority || 'NORMAL', cost_currency: '', title_vi: opts.title_vi || '', title_zh: opts.title_zh || '',
    checklist_template_id: opts.template_id || '', checklist_revision: snap.revision, downtime_note: '', operating_hours: '',
    assigned_at: opts.assignee ? nowIso : '', returned_reason: '', returned_at: '', cancel_reason: '', cancelled_at: '',
    source: opts.source || 'MANUAL', repair_id: '', i18n_meta: opts.title_meta ? { title: opts.title_meta } : {},
    dataset_epoch: sysProps_().dataset_epoch, record_version: 1, created_at: nowIso, created_by: opts.created_by,
    updated_at: nowIso, updated_by: opts.created_by, archived_at: ''
  };
  var qrKey = allocQrKey_();
  var eq = findOne_('Equipment', 'equipment_id', opts.equipment_id);
  var qr = qrRow_(qrKey, 'WORK_ORDER', opts.id, code, wo.title_vi || wo.title_zh, wo.title_zh || wo.title_vi);
  return { wo: wo, results: snap.rows, qr: qr, qr_key: qrKey, equipment: eq };
}

/** Phiếu đang mở của kế hoạch (nhiều nhất một) */
function openWorkOrderOfPlan_(planId, rows) {
  return (rows || findAll_('WorkOrders', 'plan_id', planId)).filter(function (w) {
    return w.plan_id === planId && WO_OPEN_[w.status] && !w.archived_at;
  })[0] || null;
}

/** Lượt đọc giờ chạy mới nhất (theo lúc đọc, cùng lúc thì lượt ghi sau) */
function latestHours_(equipmentId) {
  var list = findAll_('OperatingReadings', 'equipment_id', equipmentId).filter(function (r) { return !r.archived_at; });
  list.sort(function (a, b) {
    return String(b.measured_at).localeCompare(String(a.measured_at)) || String(b.created_at).localeCompare(String(a.created_at)) ||
      Number(b.cumulative_hours) - Number(a.cumulative_hours);
  });
  return list[0] || null;
}

/** Giờ lũy kế lớn nhất được phép tại at: nhỏ nhất trong các lượt đọc sau đó (tới lần đặt lại kế tiếp); null nếu không có */
function hoursCeil_(equipmentId, at, excludeWoId) {
  var list = findAll_('OperatingReadings', 'equipment_id', equipmentId).filter(function (r) {
    return !r.archived_at && String(r.measured_at) > at && (!excludeWoId || r.work_order_id !== excludeWoId);
  });
  var nextReset = '';
  list.forEach(function (r) { if (r.is_reset && (!nextReset || String(r.measured_at) < nextReset)) nextReset = String(r.measured_at); });
  var min = null;
  list.forEach(function (r) {
    if (nextReset && String(r.measured_at) >= nextReset) return;
    var v = Number(r.cumulative_hours);
    if (min === null || v < min) min = v;
  });
  return min;
}

/**
 * Giờ lũy kế nhỏ nhất được phép ghi tại thời điểm at: lớn nhất trong các lượt đọc tới lúc đó, tính từ lần đặt lại
 * đồng hồ giờ gần nhất (is_reset). excludeWoId: bỏ lượt đọc của chính phiếu đang sửa. null khi chưa có lượt nào.
 */
function hoursFloor_(equipmentId, at, excludeWoId) {
  var list = findAll_('OperatingReadings', 'equipment_id', equipmentId).filter(function (r) {
    return !r.archived_at && String(r.measured_at) <= at && (!excludeWoId || r.work_order_id !== excludeWoId);
  });
  var resetAt = '';
  list.forEach(function (r) { if (r.is_reset && String(r.measured_at) > resetAt) resetAt = String(r.measured_at); });
  var max = null;
  list.forEach(function (r) {
    if (resetAt && String(r.measured_at) < resetAt) return;
    var v = Number(r.cumulative_hours);
    if (max === null || v > max) max = v;
  });
  return max;
}

/**
 * Kế hoạch tới hạn → thêm phiếu vào writes (dưới khóa). Lịch: hạn − hôm nay ≤ wo_generate_days_ahead.
 * Giờ chạy: giờ đọc mới nhất ≥ target. Không sinh khi kế hoạch ngừng, thiết bị lưu trữ hoặc đang có phiếu mở.
 * Trả phiếu mới hoặc null.
 */
function maybeGenerateForPlan_(st, su, plan, writes) {
  if (!plan || plan.active === false || plan.archived_at) return null;
  if (openWorkOrderOfPlan_(plan.plan_id)) return null;
  var eq = findOne_('Equipment', 'equipment_id', plan.equipment_id);
  if (!eq || eq.archived_at) return null;
  var today = todayVN_();
  var due = '';
  if (plan.interval_type === 'OPERATING_HOURS') {
    var h = latestHours_(plan.equipment_id);
    var target = Number(plan.operating_hours_target);
    if (!h || !(target > 0) || Number(h.cumulative_hours) < target) return null;
    due = today;
  } else {
    due = plan.next_due_date;
    if (!isDateStr_(due)) return null;
    var ahead = Number(setting_('wo_generate_days_ahead'));
    if (!(ahead >= 0)) ahead = 7;
    if (daysRemaining_(due, today) > ahead) return null;
  }
  var gen = newWorkOrder_(st, su, {
    id: uuid_(), equipment_id: plan.equipment_id, title_vi: plan.title_vi, title_zh: plan.title_zh,
    title_meta: plan.i18n_meta && plan.i18n_meta.title, due_date: due, priority: plan.priority || 'NORMAL',
    assignee: plan.assignee_user_id && workerOk_(plan.assignee_user_id) ? plan.assignee_user_id : '', plan: plan,
    template_id: plan.checklist_template_id, source: 'PLAN', created_by: SYSTEM_USER
  });
  writes.push({ sheet: 'WorkOrders', mode: 'insert', row: gen.wo });
  gen.results.forEach(function (r) { writes.push({ sheet: 'WorkOrderResults', mode: 'insert', row: r }); });
  writes.push({ sheet: 'QrRegistry', mode: 'insert', row: gen.qr });
  return gen.wo;
}

/**
 * Trigger: sinh phiếu cho mọi kế hoạch tới hạn (SYSTEM). Ghi dưới khóa, tăng sync_revision, AuditLogs.
 * Gọi từ runBackgroundJobs (3 giờ/lần) và sendExpiryDigest (hằng ngày). Trả số phiếu đã sinh.
 */
function generateDueWorkOrders_() {
  if (releasedDot_() < 2) return 0;
  return withWriteLock_(function () {
    var st = readState_();
    var su = {}, writes = [];
    var made = [];
    readRows_('MaintenancePlans').forEach(function (plan) {
      var wo = maybeGenerateForPlan_(st, su, plan, writes);
      if (!wo) return;
      made.push(wo);
      if (plan.interval_type === 'OPERATING_HOURS') {
        var pl = clone_(plan); delete pl.__row; pl.next_due_date = wo.due_date;
        cUpdate_({ user: { user_id: SYSTEM_USER } }, pl);
        writes.push({ sheet: 'MaintenancePlans', mode: 'update', row: pl });
      }
    });
    if (!writes.length) return 0;
    var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
    var touched = {};
    writes.forEach(function (w) {
      if (sheetSchema_(w.sheet).cols.indexOf('sync_revision') >= 0) w.row.sync_revision = rev;
      touched[w.sheet] = true;
    });
    su.sync_revision = ['INT', rev];
    Object.keys(touched).forEach(function (s) { su['table_rev.' + s] = ['INT', rev]; });
    applyWrites_(writes, false);
    stateWrite_(st, su, SYSTEM_USER);
    made.forEach(function (wo) {
      writeAudit_({ user_id: SYSTEM_USER, action: 'maintenance.wo.create', entity_type: 'WORK_ORDER', entity_id: wo.work_order_id, before_json: null, after_json: { work_order_code: wo.work_order_code, plan_id: wo.plan_id, due_date: wo.due_date, source: 'PLAN' }, auth_basis: 'SYSTEM' });
    });
    return made.length;
  });
}

/* ---------------- Mẫu checklist ---------------- */

/**
 * maintenance.checklist.edit: tạo mẫu (expected_version 0) hoặc phiên bản mới (expected_version = revision hiện tại).
 * {template_id, template_name_vi/zh, items: [{step_no?, label_vi/zh, result_type, unit, min_value, max_value, required,
 *  safety_note_vi/zh}], active?: false (ngừng mẫu, cần lý do)}. Phiên bản cũ giữ nguyên để phiếu cũ đọc lại đúng.
 */
function maintenanceChecklistEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.template_id)) throw validationError_([fieldError_('template_id', 'ID_INVALID')]);
  var cur = latestChecklist_(p.template_id);
  var ev = Number(ctx.req.expected_version || 0);
  if (p.active === false) return checklistDeactivate_(ctx, p, cur);
  var errs = [];
  var items = Array.isArray(p.items) ? p.items : [];
  if (!items.length || items.length > 100) errs.push(fieldError_('items', items.length ? 'INVALID_VALUE' : 'REQUIRED'));
  var name0 = cur.items[0] || null;
  requireOneLang_(errs, p, name0 ? { template_name_vi: name0.template_name_vi, template_name_zh: name0.template_name_zh } : null, 'template_name');
  var units = allowedUnits_('', readRows_('LookupValues'));
  items.forEach(function (it, i) {
    var f = 'items[' + i + ']';
    if (!it || typeof it !== 'object') { errs.push(fieldError_(f, 'INVALID_VALUE')); return; }
    if (!trimStr_(it.label_vi) && !trimStr_(it.label_zh)) errs.push(fieldError_(f + '.label', 'REQUIRED_ONE_LANGUAGE'));
    if (RESULT_TYPES_.indexOf(it.result_type || 'PASS_FAIL') < 0) errs.push(fieldError_(f + '.result_type', 'INVALID_VALUE'));
    var hasMin = it.min_value !== undefined && it.min_value !== null && it.min_value !== '';
    var hasMax = it.max_value !== undefined && it.max_value !== null && it.max_value !== '';
    if (hasMin && !isFinite(Number(it.min_value))) errs.push(fieldError_(f + '.min_value', 'INVALID_VALUE'));
    if (hasMax && !isFinite(Number(it.max_value))) errs.push(fieldError_(f + '.max_value', 'INVALID_VALUE'));
    if (hasMin && hasMax && Number(it.min_value) > Number(it.max_value)) errs.push(fieldError_(f + '.max_value', 'INVALID_VALUE'));
    if (it.result_type === 'NUMBER') {
      var u = normUnit_(it.unit);
      if (!u) errs.push(fieldError_(f + '.unit', 'REQUIRED'));
      else if (units.indexOf(u) < 0) errs.push(fieldError_(f + '.unit', 'UNIT_NOT_ALLOWED'));
    }
    if (it.required !== undefined && typeof it.required !== 'boolean') errs.push(fieldError_(f + '.required', 'INVALID_VALUE'));
  });
  if (ev !== cur.revision) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) {
    if (ev !== cur.revision && cur.revision) throw apiError_('VERSION_CONFLICT', { entity_type: 'CHECKLIST', server_version: cur.revision });
    throw validationError_(errs);
  }
  // Dịch ngoài khóa ghi (2.3): tên mẫu, nhãn từng bước (dịch máy), yêu cầu an toàn (không dịch tự động)
  var trName = applyTranslations_('ChecklistTemplates', ['template_name'], p, name0);
  var trItems = items.map(function (it) {
    return applyTranslations_('ChecklistTemplates', ['label', 'safety_note'], it, null);
  });
  return executeWrite_(ctx, {
    entity_type: 'CHECKLIST', entity_id: p.template_id,
    build: function () {
      var now = latestChecklist_(p.template_id);
      if (now.revision !== cur.revision) throw apiError_('VERSION_CONFLICT', { entity_type: 'CHECKLIST', server_version: now.revision });
      var rev = now.revision + 1;
      var rows = items.map(function (it, i) {
        var tr = trItems[i];
        var row = {
          template_item_id: uuid_(), template_id: p.template_id, revision: rev, step_no: i + 1,
          label_vi: tr.values.label_vi, label_zh: tr.values.label_zh, result_type: it.result_type || 'PASS_FAIL',
          unit: it.result_type === 'NUMBER' ? normUnit_(it.unit) : (trimStr_(it.unit) ? normUnit_(it.unit) : ''),
          min_value: it.min_value === undefined || it.min_value === null || it.min_value === '' ? '' : Number(it.min_value),
          max_value: it.max_value === undefined || it.max_value === null || it.max_value === '' ? '' : Number(it.max_value),
          required: it.required !== false, safety_note_vi: tr.values.safety_note_vi, safety_note_zh: tr.values.safety_note_zh,
          template_name_vi: trName.values.template_name_vi, template_name_zh: trName.values.template_name_zh, active: true,
          i18n_meta: Object.assign({}, tr.meta, trName.meta)
        };
        return cNew_(ctx, row);
      });
      return {
        writes: rows.map(function (r) { return { sheet: 'ChecklistTemplates', mode: 'insert', row: r }; }),
        result: { entity_type: 'CHECKLIST', entity_id: p.template_id, template_id: p.template_id, revision: rev, record_version: rev,
          items: rows.map(function (r) { return projectRow_(ctx, r, 'ChecklistTemplates'); }) },
        record_version: rev,
        audit: { entity_type: 'CHECKLIST', entity_id: p.template_id, before_json: now.revision ? { revision: now.revision } : null, after_json: { revision: rev, items: rows.length } }
      };
    }
  });
}

/** Ngừng một mẫu: mọi dòng của mẫu active = false; không ngừng khi kế hoạch đang dùng còn hoạt động */
function checklistDeactivate_(ctx, p, cur) {
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  if (!cur.revision) throw apiError_('NOT_FOUND');
  return executeWrite_(ctx, {
    entity_type: 'CHECKLIST', entity_id: p.template_id,
    build: function () {
      var now = latestChecklist_(p.template_id);
      if (Number(ctx.req.expected_version) !== now.revision) throw apiError_('VERSION_CONFLICT', { entity_type: 'CHECKLIST', server_version: now.revision });
      var inUse = readRows_('MaintenancePlans').some(function (pl) { return pl.checklist_template_id === p.template_id && pl.active !== false && !pl.archived_at; });
      if (inUse) throw validationError_([fieldError_('template_id', 'IN_USE')]);
      var writes = [];
      findAll_('ChecklistTemplates', 'template_id', p.template_id).forEach(function (r) {
        if (r.active === false) return;
        var r2 = clone_(r); delete r2.__row; r2.active = false; cUpdate_(ctx, r2);
        writes.push({ sheet: 'ChecklistTemplates', mode: 'update', row: r2 });
      });
      return {
        writes: writes,
        result: { entity_type: 'CHECKLIST', entity_id: p.template_id, template_id: p.template_id, revision: now.revision, record_version: now.revision, active: false },
        record_version: now.revision,
        audit: { entity_type: 'CHECKLIST', entity_id: p.template_id, before_json: { active: true }, after_json: { active: false }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Kế hoạch ---------------- */

/**
 * maintenance.plan.edit: tạo/sửa/ngừng kế hoạch lặp lại và người làm mặc định.
 * {plan_id, equipment_id, title_vi/zh, interval_type (DAY|MONTH|OPERATING_HOURS), interval_value, anchor_date,
 *  operating_hours_target, checklist_template_id, assignee_user_id, priority, estimated_minutes, safety_note_vi/zh, active, reason}
 * Ghi xong: tới hạn thì sinh phiếu luôn (cùng thao tác).
 */
function maintenancePlanEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.plan_id)) throw validationError_([fieldError_('plan_id', 'ID_INVALID')]);
  var cur0 = findOne_('MaintenancePlans', 'plan_id', p.plan_id);
  var errs = [];
  ['next_due_date', 'last_work_order_id', 'last_done_date', 'last_done_hours', 'plan_code'].forEach(function (f) {
    if (p[f] !== undefined) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  var v = function (f) { return p[f] !== undefined ? p[f] : (cur0 ? cur0[f] : undefined); };
  requireOneLang_(errs, p, cur0, 'title');
  var eqId = v('equipment_id');
  if (!isUuidV4_(eqId)) errs.push(fieldError_('equipment_id', 'REQUIRED'));
  if (cur0 && p.equipment_id !== undefined && p.equipment_id !== cur0.equipment_id) errs.push(fieldError_('equipment_id', 'INVALID_VALUE'));
  var itype = v('interval_type');
  if (PLAN_INTERVAL_TYPES_.indexOf(itype) < 0) errs.push(fieldError_('interval_type', itype ? 'INVALID_VALUE' : 'REQUIRED'));
  var ival = Number(v('interval_value'));
  var maxV = itype === 'MONTH' ? 120 : (itype === 'DAY' ? 3650 : 100000);
  if (!(ival >= 1 && ival <= maxV && Math.floor(ival) === ival)) errs.push(fieldError_('interval_value', v('interval_value') === undefined || v('interval_value') === '' ? 'REQUIRED' : 'INVALID_VALUE'));
  var anchor = v('anchor_date');
  if (itype !== 'OPERATING_HOURS' && !isDateStr_(anchor)) errs.push(fieldError_('anchor_date', anchor ? 'INVALID_DATE' : 'REQUIRED'));
  if (itype === 'OPERATING_HOURS' && anchor && !isDateStr_(anchor)) errs.push(fieldError_('anchor_date', 'INVALID_DATE'));
  var tgt = v('operating_hours_target');
  if (tgt !== undefined && tgt !== null && tgt !== '' && !(Number(tgt) >= 0 && Number(tgt) < 1e7)) errs.push(fieldError_('operating_hours_target', 'INVALID_VALUE'));
  if (p.priority !== undefined && PRIORITIES_.indexOf(p.priority) < 0) errs.push(fieldError_('priority', 'INVALID_VALUE'));
  if (p.estimated_minutes !== undefined && p.estimated_minutes !== '' && p.estimated_minutes !== null) {
    var em = Number(p.estimated_minutes);
    if (!(em >= 0 && em <= 100000 && Math.floor(em) === em)) errs.push(fieldError_('estimated_minutes', 'INVALID_VALUE'));
  }
  if (p.checklist_template_id !== undefined && p.checklist_template_id !== '' && !isUuidV4_(p.checklist_template_id)) errs.push(fieldError_('checklist_template_id', 'ID_INVALID'));
  if (p.assignee_user_id !== undefined && p.assignee_user_id !== '' && !isUuidV4_(p.assignee_user_id)) errs.push(fieldError_('assignee_user_id', 'ID_INVALID'));
  if (p.active !== undefined && typeof p.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
  if (p.active === false && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('MaintenancePlans', ['title', 'safety_note'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'MAINTENANCE_PLAN', entity_id: p.plan_id,
    build: function (st) {
      var cur = findOne_('MaintenancePlans', 'plan_id', p.plan_id);
      if (cur) assertVersion_(ctx, cur, 'MAINTENANCE_PLAN', 'MaintenancePlans');
      var e2 = [];
      var eq = findOne_('Equipment', 'equipment_id', eqId);
      if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND'));
      var tplId = v('checklist_template_id');
      if (tplId) {
        var cl = latestChecklist_(tplId);
        if (!cl.revision || (!cl.active && (!cur || cur.checklist_template_id !== tplId))) e2.push(fieldError_('checklist_template_id', 'NOT_FOUND'));
      }
      var asg = v('assignee_user_id');
      if (asg && !workerOk_(asg)) e2.push(fieldError_('assignee_user_id', 'NOT_FOUND'));
      var target = tgt === undefined || tgt === null || tgt === '' ? null : Number(tgt);
      if (itype === 'OPERATING_HOURS' && target === null) {
        var last = latestHours_(eqId);
        if (last) target = Number(last.cumulative_hours) + ival;
        else e2.push(fieldError_('operating_hours_target', 'REQUIRED'));
      }
      if (e2.length) throw validationError_(e2);
      var su = {};
      var writes = [];
      var row, before = null, qrKey = null;
      if (cur) { before = clone_(cur); delete before.__row; row = clone_(cur); }
      else {
        row = { plan_id: p.plan_id, plan_code: allocCode_(st, su, 'MAINTENANCE_PLAN', null, null), active: true, last_work_order_id: '', last_done_date: '', last_done_hours: '' };
        qrKey = allocQrKey_();
      }
      var scheduleChanged = !cur || cur.interval_type !== itype || Number(cur.interval_value) !== ival || String(cur.anchor_date || '') !== String(anchor || '') || (cur.active === false && p.active === true);
      row.equipment_id = eqId;
      row.title_vi = tr.values.title_vi; row.title_zh = tr.values.title_zh;
      row.safety_note_vi = tr.values.safety_note_vi; row.safety_note_zh = tr.values.safety_note_zh; row.i18n_meta = tr.meta;
      row.interval_type = itype; row.interval_value = ival; row.anchor_date = anchor || '';
      row.operating_hours_target = itype === 'OPERATING_HOURS' ? target : '';
      row.checklist_template_id = tplId || '';
      row.assignee_user_id = asg || '';
      row.priority = v('priority') || 'NORMAL';
      if (p.estimated_minutes !== undefined) row.estimated_minutes = p.estimated_minutes === '' || p.estimated_minutes === null ? '' : Number(p.estimated_minutes);
      if (p.active !== undefined) row.active = p.active;
      var openWo = cur ? openWorkOrderOfPlan_(p.plan_id) : null;
      if (itype === 'OPERATING_HOURS') row.next_due_date = openWo ? openWo.due_date : '';
      else if (openWo) row.next_due_date = openWo.due_date;
      else if (scheduleChanged || !isDateStr_(row.next_due_date)) row.next_due_date = occurrenceFrom_(row, todayVN_(), false);
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      writes.push({ sheet: 'MaintenancePlans', mode: cur ? 'update' : 'insert', row: row });
      var label = function (lang) { return lang === 'vi' ? (row.title_vi || row.title_zh) : (row.title_zh || row.title_vi); };
      if (qrKey) writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'MAINTENANCE_PLAN', p.plan_id, row.plan_code, label('vi'), label('zh')) });
      else {
        var qr = findOne_('QrRegistry', 'entity_id', p.plan_id);
        if (qr && (qr.active !== (row.active !== false) || qr.label_vi !== label('vi') || qr.label_zh !== label('zh'))) {
          var q2 = clone_(qr); delete q2.__row; q2.active = row.active !== false; q2.label_vi = label('vi'); q2.label_zh = label('zh');
          writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
        }
      }
      var gen = maybeGenerateForPlan_(st, su, row, writes);
      if (gen && itype === 'OPERATING_HOURS') row.next_due_date = gen.due_date; // dòng kế hoạch nằm trong writes (cùng đối tượng)
      return {
        writes: writes, state: su,
        result: {
          entity_type: 'MAINTENANCE_PLAN', entity_id: p.plan_id, display_code: row.plan_code, qr_key: qrKey, record_version: row.record_version,
          record: projectRow_(ctx, row, 'MaintenancePlans'), generated_work_order: gen ? { work_order_id: gen.work_order_id, work_order_code: gen.work_order_code, due_date: gen.due_date } : null
        },
        record_version: row.record_version,
        audit: { entity_type: 'MAINTENANCE_PLAN', entity_id: p.plan_id, before_json: before, after_json: row, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Giờ chạy ---------------- */

/**
 * maintenance.hours.record (bổ sung Đợt 2: nguồn đọc giờ chạy cho kế hoạch theo giờ, 1.4 §5.2, §10.3 "Giờ chạy"):
 * {operating_reading_id, equipment_id, cumulative_hours, measured_at?, note?, is_reset?, work_order_id?}
 * Giờ lũy kế không giảm, trừ lần đọc đánh dấu đồng hồ giờ được thay/đặt lại (bắt ghi chú). Đạt mốc thì sinh phiếu.
 */
function maintenanceHoursRecord_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.operating_reading_id)) errs.push(fieldError_('operating_reading_id', 'ID_INVALID'));
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'REQUIRED'));
  var hrs = p.cumulative_hours === '' || p.cumulative_hours === null || p.cumulative_hours === undefined ? null : Number(p.cumulative_hours);
  if (hrs === null || !(hrs >= 0 && hrs < 1e7)) errs.push(fieldError_('cumulative_hours', hrs === null ? 'REQUIRED' : 'INVALID_VALUE'));
  checkTimeField_(p, 'measured_at', errs);
  if (p.is_reset !== undefined && typeof p.is_reset !== 'boolean') errs.push(fieldError_('is_reset', 'INVALID_VALUE'));
  if (p.is_reset === true && !trimStr_(p.note)) errs.push(fieldError_('note', 'REQUIRED'));
  if (p.note !== undefined && String(p.note).length > 300) errs.push(fieldError_('note', 'INVALID_VALUE'));
  if (p.work_order_id && !isUuidV4_(p.work_order_id)) errs.push(fieldError_('work_order_id', 'ID_INVALID'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'OPERATING_READING', entity_id: p.operating_reading_id,
    build: function (st) {
      if (findRowNums_('OperatingReadings', 'operating_reading_id', p.operating_reading_id).length) throw validationError_([fieldError_('operating_reading_id', 'ID_EXISTS')]);
      var eq = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!eq || eq.archived_at) throw validationError_([fieldError_('equipment_id', 'NOT_FOUND')]);
      var at = p.measured_at ? normTime_(p.measured_at) : isoVN_(now_());
      var floor = hoursFloor_(p.equipment_id, at, null), ceil = p.is_reset === true ? null : hoursCeil_(p.equipment_id, at, null);
      if ((floor !== null && p.is_reset !== true && hrs < floor) || (ceil !== null && hrs > ceil)) throw validationError_([fieldError_('cumulative_hours', 'HOURS_DECREASED')]);
      var row = cNew_(ctx, {
        operating_reading_id: p.operating_reading_id, equipment_id: p.equipment_id, measured_at: at, cumulative_hours: hrs,
        reading_user_id: ctx.user.user_id, note: trimStr_(p.note), work_order_id: p.work_order_id || '', is_reset: p.is_reset === true
      });
      var writes = [{ sheet: 'OperatingReadings', mode: 'insert', row: row }];
      var su = {};
      // Ghi lượt đọc trước khi xét mốc: maybeGenerateForPlan_ đọc giờ mới nhất từ sheet → dùng plan tạm có target so trực tiếp
      var gens = [];
      readRows_('MaintenancePlans').forEach(function (plan) {
        if (plan.equipment_id !== p.equipment_id || plan.interval_type !== 'OPERATING_HOURS' || plan.active === false || plan.archived_at) return;
        if (!(Number(plan.operating_hours_target) > 0) || hrs < Number(plan.operating_hours_target) || openWorkOrderOfPlan_(plan.plan_id)) return;
        var gen = newWorkOrder_(st, su, {
          id: uuid_(), equipment_id: plan.equipment_id, title_vi: plan.title_vi, title_zh: plan.title_zh,
          title_meta: plan.i18n_meta && plan.i18n_meta.title, due_date: todayVN_(), priority: plan.priority || 'NORMAL',
          assignee: plan.assignee_user_id && workerOk_(plan.assignee_user_id) ? plan.assignee_user_id : '', plan: plan,
          template_id: plan.checklist_template_id, source: 'PLAN', created_by: SYSTEM_USER
        });
        writes.push({ sheet: 'WorkOrders', mode: 'insert', row: gen.wo });
        gen.results.forEach(function (r) { writes.push({ sheet: 'WorkOrderResults', mode: 'insert', row: r }); });
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: gen.qr });
        var pl = clone_(plan); delete pl.__row; pl.next_due_date = gen.wo.due_date; cUpdate_(ctx, pl);
        writes.push({ sheet: 'MaintenancePlans', mode: 'update', row: pl });
        gens.push({ work_order_id: gen.wo.work_order_id, work_order_code: gen.wo.work_order_code });
      });
      return {
        writes: writes, state: su,
        result: { entity_type: 'OPERATING_READING', entity_id: row.operating_reading_id, record_version: 1, record: projectRow_(ctx, row, 'OperatingReadings'), generated_work_orders: gens },
        record_version: 1,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: null, after_json: { cumulative_hours: hrs, measured_at: at, is_reset: row.is_reset } }
      };
    }
  });
}

/* ---------------- Phiếu: tạo, giao, làm ---------------- */

/** Phiếu theo ID; ném NOT_FOUND */
function woOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('work_order_id', 'ID_INVALID')]);
  var w = findOne_('WorkOrders', 'work_order_id', id);
  if (!w || w.archived_at) throw apiError_('NOT_FOUND');
  return w;
}

/** Điều kiện "được giao" của cấp 2 (bước 6 của 4.2) */
function assertAssignee_(ctx, w) {
  if (ctx.auth && ctx.auth.conds.length && w.assignee_user_id !== ctx.user.user_id) throw apiError_('FORBIDDEN');
}

function assertStatus_(w, allowed, field) {
  if (allowed.indexOf(w.status) < 0) throw validationError_([fieldError_(field || 'status', 'STATUS_INVALID')]);
}

/**
 * maintenance.wo.create: phiếu ngoài kế hoạch (DRAFT). KT tạo được (kể cả offline); C3/C4 giao luôn được (assignee → ASSIGNED).
 * {work_order_id, equipment_id, title_vi/zh, due_date?, checklist_template_id?, priority? (C3/C4), assignee_user_id? (C3/C4)}
 */
function maintenanceWoCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.work_order_id)) errs.push(fieldError_('work_order_id', 'ID_INVALID'));
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'REQUIRED'));
  requireOneLang_(errs, p, null, 'title');
  if (p.due_date !== undefined && p.due_date !== '' && !isDateStr_(p.due_date)) errs.push(fieldError_('due_date', 'INVALID_DATE'));
  if (p.checklist_template_id && !isUuidV4_(p.checklist_template_id)) errs.push(fieldError_('checklist_template_id', 'ID_INVALID'));
  var lead = can_(ctx, 'maintenance.assign', null);
  if (p.priority !== undefined && p.priority !== '' && (PRIORITIES_.indexOf(p.priority) < 0 || (!lead && p.priority !== 'NORMAL'))) errs.push(fieldError_('priority', 'INVALID_VALUE'));
  if (p.assignee_user_id && (!lead || !isUuidV4_(p.assignee_user_id))) errs.push(fieldError_('assignee_user_id', 'INVALID_VALUE'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('WorkOrders', ['title'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'WORK_ORDER', entity_id: p.work_order_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('WorkOrders', 'work_order_id', p.work_order_id).length) e2.push(fieldError_('work_order_id', 'ID_EXISTS'));
      var eq = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND'));
      if (p.checklist_template_id) { var cl = latestChecklist_(p.checklist_template_id); if (!cl.revision || !cl.active) e2.push(fieldError_('checklist_template_id', 'NOT_FOUND')); }
      if (p.assignee_user_id && !workerOk_(p.assignee_user_id)) e2.push(fieldError_('assignee_user_id', 'NOT_FOUND'));
      if (e2.length) throw validationError_(e2);
      var su = {};
      var gen = newWorkOrder_(st, su, {
        id: p.work_order_id, equipment_id: p.equipment_id, title_vi: tr.values.title_vi, title_zh: tr.values.title_zh,
        title_meta: tr.meta.title, due_date: p.due_date || todayVN_(), priority: p.priority || 'NORMAL',
        assignee: p.assignee_user_id || '', template_id: p.checklist_template_id || '', source: 'MANUAL', created_by: ctx.user.user_id
      });
      var writes = [{ sheet: 'WorkOrders', mode: 'insert', row: gen.wo }];
      gen.results.forEach(function (r) { writes.push({ sheet: 'WorkOrderResults', mode: 'insert', row: r }); });
      writes.push({ sheet: 'QrRegistry', mode: 'insert', row: gen.qr });
      return {
        writes: writes, state: su,
        result: { entity_type: 'WORK_ORDER', entity_id: p.work_order_id, display_code: gen.wo.work_order_code, qr_key: gen.qr_key, record_version: 1, record: projectRow_(ctx, gen.wo, 'WorkOrders') },
        record_version: 1,
        audit: { entity_type: 'WORK_ORDER', entity_id: p.work_order_id, before_json: null, after_json: { work_order_code: gen.wo.work_order_code, status: gen.wo.status, equipment_id: p.equipment_id, due_date: gen.wo.due_date } }
      };
    }
  });
}

/**
 * maintenance.assign (C3/C4): giao việc hoặc đổi người làm; đổi ưu tiên, hạn.
 * {work_order_id, assignee_user_id, priority?, due_date?}. DRAFT → ASSIGNED; đang làm thì giữ trạng thái.
 */
function maintenanceAssign_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.assignee_user_id)) errs.push(fieldError_('assignee_user_id', 'REQUIRED'));
  if (p.priority !== undefined && PRIORITIES_.indexOf(p.priority) < 0) errs.push(fieldError_('priority', 'INVALID_VALUE'));
  if (p.due_date !== undefined && !isDateStr_(p.due_date)) errs.push(fieldError_('due_date', 'INVALID_DATE'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'WORK_ORDER', entity_id: p.work_order_id,
    build: function () {
      var w = woOrThrow_(p.work_order_id);
      assertVersion_(ctx, w, 'WORK_ORDER', 'WorkOrders');
      assertStatus_(w, ['DRAFT', 'ASSIGNED', 'IN_PROGRESS']);
      if (!workerOk_(p.assignee_user_id)) throw validationError_([fieldError_('assignee_user_id', 'NOT_FOUND')]);
      var row = clone_(w); delete row.__row;
      var before = { assignee_user_id: w.assignee_user_id, status: w.status, priority: w.priority, due_date: w.due_date };
      row.assignee_user_id = p.assignee_user_id;
      if (w.status === 'DRAFT') { row.status = 'ASSIGNED'; row.assigned_at = isoVN_(now_()); }
      else if (w.assignee_user_id !== p.assignee_user_id) row.assigned_at = isoVN_(now_());
      if (p.priority !== undefined) row.priority = p.priority;
      var writes = [];
      if (p.due_date !== undefined && p.due_date !== w.due_date) {
        row.due_date = p.due_date;
        var plan = w.plan_id ? findOne_('MaintenancePlans', 'plan_id', w.plan_id) : null;
        if (plan && plan.interval_type !== 'OPERATING_HOURS') {
          var pl = clone_(plan); delete pl.__row; pl.next_due_date = p.due_date; cUpdate_(ctx, pl);
          writes.push({ sheet: 'MaintenancePlans', mode: 'update', row: pl });
        }
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'WorkOrders', mode: 'update', row: row });
      return {
        writes: writes,
        result: { entity_type: 'WORK_ORDER', entity_id: row.work_order_id, display_code: row.work_order_code, record_version: row.record_version, record: projectRow_(ctx, row, 'WorkOrders') },
        record_version: row.record_version,
        audit: { entity_type: 'WORK_ORDER', entity_id: row.work_order_id, before_json: before, after_json: { assignee_user_id: row.assignee_user_id, status: row.status, priority: row.priority, due_date: row.due_date } }
      };
    }
  });
}

var WO_EXEC_TIME_FIELDS_ = ['start_at', 'end_at', 'downtime_start_at', 'downtime_end_at'];

/**
 * maintenance.execute: bắt đầu phiếu (ASSIGNED → IN_PROGRESS) và ghi kết quả từng bước, số đo, thời điểm, dừng máy,
 * giờ công, giờ chạy, kết quả chung, nhận xét. Chỉ trường có trong payload được ghi (cập nhật từng phần).
 * {work_order_id, start_at?, end_at?, downtime_start_at?, downtime_end_at?, downtime_note?, labor_minutes?, operating_hours?,
 *  overall_result?, result_vi/zh?, results: [{result_id, result_status?, measured_value?, note_vi?, note_zh?}]}
 */
function maintenanceExecute_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.work_order_id)) errs.push(fieldError_('work_order_id', 'ID_INVALID'));
  WO_EXEC_TIME_FIELDS_.forEach(function (f) { checkTimeField_(p, f, errs); });
  if (p.labor_minutes !== undefined && p.labor_minutes !== '' && p.labor_minutes !== null) {
    var lm = Number(p.labor_minutes);
    if (!(lm >= 0 && lm <= 100000 && Math.floor(lm) === lm)) errs.push(fieldError_('labor_minutes', 'INVALID_VALUE'));
  }
  if (p.operating_hours !== undefined && p.operating_hours !== '' && p.operating_hours !== null && !(Number(p.operating_hours) >= 0 && Number(p.operating_hours) < 1e7)) errs.push(fieldError_('operating_hours', 'INVALID_VALUE'));
  if (p.overall_result !== undefined && p.overall_result !== '' && ['PASS', 'FAIL'].indexOf(p.overall_result) < 0) errs.push(fieldError_('overall_result', 'INVALID_VALUE'));
  if (p.downtime_note !== undefined && String(p.downtime_note).length > 500) errs.push(fieldError_('downtime_note', 'INVALID_VALUE'));
  var results = Array.isArray(p.results) ? p.results : [];
  if (p.results !== undefined && !Array.isArray(p.results)) errs.push(fieldError_('results', 'INVALID_VALUE'));
  if (results.length > 200) errs.push(fieldError_('results', 'INVALID_VALUE'));
  results.forEach(function (r) {
    var f = 'results[' + (r && r.result_id) + ']';
    if (!r || !isUuidV4_(r.result_id)) { errs.push(fieldError_('results', 'ID_INVALID')); return; }
    if (r.result_status !== undefined && CHECK_RESULTS_.indexOf(r.result_status) < 0) errs.push(fieldError_(f, 'INVALID_VALUE'));
    if (r.measured_value !== undefined && r.measured_value !== null && r.measured_value !== '' && !isFinite(Number(r.measured_value))) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  if (errs.length) throw validationError_(errs);
  var w0 = woOrThrow_(p.work_order_id);
  assertAssignee_(ctx, w0);
  // Dịch ngoài khóa: ghi chú từng bước, nhận xét chung
  var curResults = {};
  findAll_('WorkOrderResults', 'work_order_id', w0.work_order_id).forEach(function (r) { curResults[r.result_id] = r; });
  var trRes = {};
  results.forEach(function (r) {
    if (r.note_vi === undefined && r.note_zh === undefined) return;
    trRes[r.result_id] = applyTranslations_('WorkOrderResults', ['note'], r, curResults[r.result_id] || null);
  });
  var trWo = (p.result_vi !== undefined || p.result_zh !== undefined) ? applyTranslations_('WorkOrders', ['result'], p, w0) : null;
  return executeWrite_(ctx, {
    entity_type: 'WORK_ORDER', entity_id: p.work_order_id,
    build: function () {
      var w = woOrThrow_(p.work_order_id);
      assertAssignee_(ctx, w);
      assertVersion_(ctx, w, 'WORK_ORDER', 'WorkOrders');
      assertStatus_(w, ['ASSIGNED', 'IN_PROGRESS']);
      var row = clone_(w); delete row.__row;
      var nowIso = isoVN_(now_());
      if (w.status === 'ASSIGNED') { row.status = 'IN_PROGRESS'; if (!p.start_at && !row.start_at) row.start_at = nowIso; }
      WO_EXEC_TIME_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = p[f] ? normTime_(p[f]) : ''; });
      if (p.downtime_note !== undefined) row.downtime_note = trimStr_(p.downtime_note);
      if (p.labor_minutes !== undefined) row.labor_minutes = p.labor_minutes === '' || p.labor_minutes === null ? '' : Number(p.labor_minutes);
      if (p.overall_result !== undefined) row.overall_result = p.overall_result || '';
      if (trWo) { row.result_vi = trWo.values.result_vi; row.result_zh = trWo.values.result_zh; row.i18n_meta = Object.assign({}, row.i18n_meta || {}, trWo.meta); }
      var writes = [];
      var e2 = [];
      results.forEach(function (r) {
        var cur = findOne_('WorkOrderResults', 'result_id', r.result_id);
        if (!cur || cur.work_order_id !== w.work_order_id || cur.archived_at) { e2.push(fieldError_('results[' + r.result_id + ']', 'NOT_FOUND')); return; }
        // NA chỉ cho mục không bắt buộc (5.1.1 mục 3; mục 9 #24)
        if (r.result_status === 'NA' && cur.required !== false) { e2.push(fieldError_('results[' + r.result_id + ']', 'INVALID_VALUE')); return; }
        var r2 = clone_(cur); delete r2.__row;
        var changed = false;
        if (r.result_status !== undefined && r.result_status !== cur.result_status) { r2.result_status = r.result_status; changed = true; }
        if (r.measured_value !== undefined) {
          var mv = r.measured_value === '' || r.measured_value === null ? '' : Number(r.measured_value);
          if (String(mv) !== String(cur.measured_value === null ? '' : cur.measured_value)) { r2.measured_value = mv; changed = true; }
        }
        var tr = trRes[r.result_id];
        if (tr && (tr.values.note_vi !== cur.note_vi || tr.values.note_zh !== cur.note_zh || JSON.stringify(tr.meta.note || null) !== JSON.stringify((cur.i18n_meta || {}).note || null))) {
          r2.note_vi = tr.values.note_vi; r2.note_zh = tr.values.note_zh;
          r2.i18n_meta = Object.assign({}, cur.i18n_meta || {}); if (tr.meta.note) r2.i18n_meta.note = tr.meta.note; else delete r2.i18n_meta.note;
          changed = true;
        }
        if (!changed) return;
        cUpdate_(ctx, r2);
        writes.push({ sheet: 'WorkOrderResults', mode: 'update', row: r2 });
      });
      if (p.operating_hours !== undefined && p.operating_hours !== '' && p.operating_hours !== null) {
        // Giờ chạy lúc làm: một lượt đọc cho mỗi phiếu (sửa lại thì sửa đúng lượt đó), không nhỏ hơn lượt đọc khác trước đó
        var hrs = Number(p.operating_hours);
        var mine = findAll_('OperatingReadings', 'equipment_id', w.equipment_id).filter(function (r) { return !r.archived_at && r.work_order_id === w.work_order_id; })[0] || null;
        var at = row.end_at || nowIso;
        var floor = hoursFloor_(w.equipment_id, at, w.work_order_id), ceil = hoursCeil_(w.equipment_id, at, w.work_order_id);
        if ((floor !== null && hrs < floor) || (ceil !== null && hrs > ceil)) e2.push(fieldError_('operating_hours', 'HOURS_DECREASED'));
        else {
          row.operating_hours = hrs;
          if (mine) {
            if (Number(mine.cumulative_hours) !== hrs || mine.measured_at !== at) {
              var m2 = clone_(mine); delete m2.__row; m2.cumulative_hours = hrs; m2.measured_at = at; cUpdate_(ctx, m2);
              writes.push({ sheet: 'OperatingReadings', mode: 'update', row: m2 });
            }
          } else {
            writes.push({ sheet: 'OperatingReadings', mode: 'insert', row: cNew_(ctx, {
              operating_reading_id: uuid_(), equipment_id: w.equipment_id, measured_at: at, cumulative_hours: hrs,
              reading_user_id: ctx.user.user_id, note: w.work_order_code, work_order_id: w.work_order_id, is_reset: false
            }) });
          }
        }
      }
      if (e2.length) throw validationError_(e2);
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'WorkOrders', mode: 'update', row: row });
      return {
        writes: writes,
        result: {
          entity_type: 'WORK_ORDER', entity_id: row.work_order_id, display_code: row.work_order_code, record_version: row.record_version,
          record: projectRow_(ctx, row, 'WorkOrders'),
          results: writes.filter(function (x) { return x.sheet === 'WorkOrderResults'; }).map(function (x) { return projectRow_(ctx, x.row, 'WorkOrderResults'); })
        },
        record_version: row.record_version,
        audit: { entity_type: 'WORK_ORDER', entity_id: row.work_order_id, before_json: { status: w.status }, after_json: { status: row.status, results_changed: writes.length - 1 } }
      };
    }
  });
}

/* ---------------- Gửi nghiệm thu (C8, 5.1.1) ---------------- */

/**
 * Điều kiện 5.1.1 trên máy chủ. Trả mảng lỗi (rỗng = đạt). expect: {results, documents, usage_lines} ID client đã tạo
 * cho phiếu (dữ liệu con phải có trên máy chủ, không thì UNSYNCED_CHILD_DATA).
 */
function woSubmitErrors_(w, results, expect) {
  var errs = [];
  expect = expect || {};
  var missing = false;
  (Array.isArray(expect.results) ? expect.results : []).forEach(function (id) { if (!results.some(function (r) { return r.result_id === id; })) missing = true; });
  (Array.isArray(expect.documents) ? expect.documents : []).forEach(function (id) {
    var d = isUuidV4_(id) ? findOne_('Documents', 'document_id', id) : null;
    if (!d || d.entity_id !== w.work_order_id) missing = true;
  });
  var usage = findAll_('MaterialUsageLines', 'work_id', w.work_order_id).filter(function (u) { return u.work_type === 'WORK_ORDER' && !u.archived_at; });
  (Array.isArray(expect.usage_lines) ? expect.usage_lines : []).forEach(function (id) { if (!usage.some(function (u) { return u.usage_line_id === id; })) missing = true; });
  if (missing) errs.push(fieldError_('expect', 'UNSYNCED_CHILD_DATA'));
  var anyFail = false;
  results.forEach(function (r) {
    var f = 'results[' + r.result_id + ']';
    var st = r.result_status || 'PENDING';
    if (st === 'FAIL') anyFail = true;
    if (r.required !== false && st !== 'PASS' && st !== 'FAIL') { errs.push(fieldError_(f, 'REQUIRED_ITEM_MISSING')); return; }
    var hasNote = !!(trimStr_(r.note_vi) || trimStr_(r.note_zh));
    if (r.result_type === 'NUMBER' && r.required !== false) {
      if (r.measured_value === '' || r.measured_value === null || !isFinite(Number(r.measured_value))) { errs.push(fieldError_(f, 'REQUIRED_ITEM_MISSING')); return; }
    }
    if (r.result_type === 'NUMBER' && r.measured_value !== '' && r.measured_value !== null && st === 'PASS') {
      var v = Number(r.measured_value);
      var lo = r.min_value === '' || r.min_value === null ? null : Number(r.min_value);
      var hi = r.max_value === '' || r.max_value === null ? null : Number(r.max_value);
      if (((lo !== null && v < lo) || (hi !== null && v > hi)) && !hasNote) errs.push(fieldError_(f, 'OUT_OF_RANGE_NOTE_REQUIRED'));
    }
    if (st === 'FAIL' && !hasNote) errs.push(fieldError_(f, 'FAIL_NOTE_REQUIRED'));
  });
  if (!w.overall_result) errs.push(fieldError_('overall_result', 'REQUIRED'));
  else if (anyFail && w.overall_result !== 'FAIL') errs.push(fieldError_('overall_result', 'OVERALL_RESULT_MISMATCH'));
  var s = tms_(w.start_at), e = tms_(w.end_at), nowMs = now_().getTime() + 5 * 60000;
  if (s === null) errs.push(fieldError_('start_at', 'REQUIRED'));
  if (e === null) errs.push(fieldError_('end_at', 'REQUIRED'));
  if (s !== null && e !== null && (s > e || e > nowMs)) errs.push(fieldError_('end_at', 'TIME_ORDER_INVALID'));
  var ds = tms_(w.downtime_start_at), de = tms_(w.downtime_end_at);
  if (ds !== null && de === null && !trimStr_(w.downtime_note)) errs.push(fieldError_('downtime_note', 'REQUIRED'));
  if (ds !== null && de !== null && ds > de) errs.push(fieldError_('downtime_end_at', 'TIME_ORDER_INVALID'));
  if (de !== null && ds === null) errs.push(fieldError_('downtime_start_at', 'REQUIRED'));
  usage.forEach(function (u) {
    var f = 'usage_lines[' + u.usage_line_id + ']';
    if (!(Number(u.actual_used_qty || 0) >= 0) || !(Number(u.scrap_qty || 0) >= 0)) errs.push(fieldError_(f, 'INVALID_VALUE'));
    var m = findOne_('Materials', 'material_id', u.material_id);
    if (m && m.base_unit && u.unit && m.base_unit !== u.unit) errs.push(fieldError_(f, 'UNIT_MISMATCH'));
  });
  return { errors: errs, anyFail: anyFail };
}

/**
 * maintenance.submit {work_order_id, expect?, repair_severity?}: IN_PROGRESS → PENDING_ACCEPTANCE khi đủ 5.1.1.
 * Có mục FAIL mà phiếu chưa có đề nghị sửa chữa đang mở: tạo Repairs REPORTED (người báo = người gửi), bắt chọn mức độ.
 * Hàng chờ offline được: máy chủ kiểm lại lúc đồng bộ; sai → VALIDATION_ERROR, phiếu giữ IN_PROGRESS.
 */
function maintenanceSubmit_(ctx) {
  var p = ctx.req.payload || {};
  if (p.repair_severity !== undefined && p.repair_severity !== '' && SEVERITIES_.indexOf(p.repair_severity) < 0) throw validationError_([fieldError_('repair_severity', 'INVALID_VALUE')]);
  var w0 = woOrThrow_(p.work_order_id);
  assertAssignee_(ctx, w0);
  return executeWrite_(ctx, {
    entity_type: 'WORK_ORDER', entity_id: p.work_order_id,
    build: function (st) {
      var w = woOrThrow_(p.work_order_id);
      assertAssignee_(ctx, w);
      assertVersion_(ctx, w, 'WORK_ORDER', 'WorkOrders');
      assertStatus_(w, ['IN_PROGRESS']);
      var results = findAll_('WorkOrderResults', 'work_order_id', w.work_order_id).filter(function (r) { return !r.archived_at; });
      results.sort(function (a, b) { return Number(a.step_no) - Number(b.step_no); });
      var chk = woSubmitErrors_(w, results, p.expect);
      var su = {};
      var writes = [];
      var row = clone_(w); delete row.__row;
      var repair = null;
      if (chk.anyFail) {
        var openRep = w.repair_id ? findOne_('Repairs', 'repair_id', w.repair_id) : null;
        if (!openRep || openRep.status === 'CANCELLED') {
          if (!p.repair_severity) chk.errors.push(fieldError_('repair_severity', 'REQUIRED'));
          else repair = repairFromWorkOrder_(ctx, st, su, w, results, p.repair_severity);
        }
      }
      if (chk.errors.length) throw validationError_(chk.errors);
      var nowIso = isoVN_(now_());
      row.status = 'PENDING_ACCEPTANCE';
      row.submitted_by = ctx.user.user_id; row.submitted_at = nowIso;
      if (repair) {
        row.repair_id = repair.repair.repair_id;
        writes.push({ sheet: 'Repairs', mode: 'insert', row: repair.repair });
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: repair.qr });
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'WorkOrders', mode: 'update', row: row });
      return {
        writes: writes, state: su,
        result: {
          entity_type: 'WORK_ORDER', entity_id: row.work_order_id, display_code: row.work_order_code, record_version: row.record_version,
          record: projectRow_(ctx, row, 'WorkOrders'),
          repair: repair ? { repair_id: repair.repair.repair_id, repair_code: repair.repair.repair_code, qr_key: repair.qr.qr_key } : null
        },
        record_version: row.record_version,
        audit: { entity_type: 'WORK_ORDER', entity_id: row.work_order_id, before_json: { status: 'IN_PROGRESS' }, after_json: { status: row.status, overall_result: row.overall_result, repair_id: row.repair_id || undefined } }
      };
    }
  });
}

/** Đề nghị sửa chữa từ các mục không đạt của phiếu bảo trì (6.9.1) */
function repairFromWorkOrder_(ctx, st, su, w, results, severity) {
  var fails = results.filter(function (r) { return r.result_status === 'FAIL'; });
  var line = function (r, lang) {
    var lab = lang === 'vi' ? (r.label_vi || r.label_zh) : (r.label_zh || r.label_vi);
    var note = lang === 'vi' ? (r.note_vi || r.note_zh) : (r.note_zh || r.note_vi);
    return r.step_no + '. ' + lab + (note ? ' — ' + note : '');
  };
  var head = LABELS['mt.fail_repair_head'] || ['Mục không đạt khi bảo trì', '保养不合格项目'];
  var vi = head[0] + ' ' + w.work_order_code + ':\n' + fails.map(function (r) { return line(r, 'vi'); }).join('\n');
  var zh = head[1] + ' ' + w.work_order_code + '：\n' + fails.map(function (r) { return line(r, 'zh'); }).join('\n');
  var nowIso = isoVN_(now_());
  var id = uuid_();
  var code = allocCode_(st, su, 'REPAIR', null, dateVN_(now_()));
  var rep = cNew_(ctx, {
    repair_id: id, repair_code: code, equipment_id: w.equipment_id, reported_by: ctx.user.user_id, reported_at: nowIso,
    symptom_vi: vi.slice(0, 2000), symptom_zh: zh.slice(0, 2000), severity: severity, priority: 'NORMAL', status: 'REPORTED',
    assignee_user_id: '', stopped_at: '', repair_start_at: '', repair_end_at: '', restored_at: '', root_cause_code: '',
    action_vi: '', action_zh: '', labor_cost: '', outside_cost: '', acceptance_result: '', approved_by: '', approved_at: '',
    submitted_by: '', submitted_at: '', assigned_at: '', cost_currency: '', diagnosis_vi: '', diagnosis_zh: '', vendor_id: '',
    outside_service_vi: '', outside_service_zh: '', test_run_result: '', test_run_note_vi: '', test_run_note_zh: '', downtime_note: '',
    source_work_order_id: w.work_order_id, returned_reason: '', returned_at: '', cancel_reason: '', cancelled_at: '',
    reopen_reason: '', reopened_at: '', i18n_meta: { symptom: { src: 'vi', state: 'HUMAN', at: nowIso } }
  });
  var qrKey = allocQrKey_();
  return { repair: rep, qr: qrRow_(qrKey, 'REPAIR', id, code, '', '') };
}

/* ---------------- Nghiệm thu, hủy ---------------- */

/** Hạn tiếp theo của kế hoạch sau một phiếu xong/hủy (lịch cố định theo chuỗi mốc) */
function planAfterWorkOrder_(ctx, plan, w, done) {
  var pl = clone_(plan); delete pl.__row;
  if (done) {
    pl.last_work_order_id = w.work_order_id;
    pl.last_done_date = w.end_at ? String(w.end_at).slice(0, 10) : todayVN_();
  }
  if (plan.interval_type === 'OPERATING_HOURS') {
    if (done) {
      var hrs = w.operating_hours !== '' && w.operating_hours !== null && w.operating_hours !== undefined ? Number(w.operating_hours) : null;
      if (hrs === null) { var last = latestHours_(plan.equipment_id); hrs = last ? Number(last.cumulative_hours) : null; }
      pl.last_done_hours = hrs === null ? '' : hrs;
      pl.operating_hours_target = (hrs === null ? Number(plan.operating_hours_target || 0) : hrs) + Number(plan.interval_value);
    } else {
      pl.operating_hours_target = Number(plan.operating_hours_target || 0) + Number(plan.interval_value);
    }
    pl.next_due_date = '';
  } else {
    pl.next_due_date = occurrenceFrom_(plan, String(w.due_date), true);
  }
  cUpdate_(ctx, pl);
  return pl;
}

/**
 * maintenance.accept (C3/C4, PIN): {work_order_id, decision: ACCEPT | RETURN, reason, confirm_usage?}
 * Không tự nghiệm thu (4.6): người lập (trừ SYSTEM), người làm, người gửi, người ghi kết quả.
 * ACCEPT → COMPLETED, cập nhật kế hoạch (hạn tiếp theo) và sinh phiếu kế tiếp nếu tới hạn. RETURN → IN_PROGRESS kèm lý do.
 * confirm_usage: xác nhận luôn lượng dùng chờ xác nhận của phiếu (usage.confirm), trừ dòng do chính người nghiệm thu ghi.
 */
function maintenanceAccept_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (['ACCEPT', 'RETURN'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'RETURN' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'WORK_ORDER', entity_id: p.work_order_id,
    build: function (st) {
      var w = woOrThrow_(p.work_order_id);
      var results = findAll_('WorkOrderResults', 'work_order_id', w.work_order_id);
      var people = [w.assignee_user_id, w.submitted_by];
      if (w.created_by !== SYSTEM_USER) people.push(w.created_by);
      results.forEach(function (r) { if (r.updated_by && r.updated_by !== r.created_by) people.push(r.updated_by); });
      var basis = assertNotSelf_(ctx, 'maintenance.accept', people.filter(String));
      assertVersion_(ctx, w, 'WORK_ORDER', 'WorkOrders');
      assertStatus_(w, ['PENDING_ACCEPTANCE']);
      var row = clone_(w); delete row.__row;
      var nowIso = isoVN_(now_());
      var writes = [];
      var su = {};
      var gen = null, usageDone = [], usageSkipped = [];
      if (p.decision === 'RETURN') {
        row.status = 'IN_PROGRESS';
        row.returned_reason = trimStr_(p.reason).slice(0, 500); row.returned_at = nowIso;
      } else {
        row.status = 'COMPLETED';
        row.approved_by = ctx.user.user_id; row.approved_at = nowIso;
        var plan = w.plan_id ? findOne_('MaintenancePlans', 'plan_id', w.plan_id) : null;
        if (plan) {
          var pl = planAfterWorkOrder_(ctx, plan, row, true);
          row.next_due_date = pl.next_due_date || '';
          writes.push({ sheet: 'MaintenancePlans', mode: 'update', row: pl });
          // Phiếu hiện tại đã COMPLETED trong writes: sinh phiếu kế tiếp nếu đã tới hạn (đọc sheet thấy phiếu cũ còn mở → bỏ qua kiểm mở)
          if (pl.active !== false && pl.interval_type !== 'OPERATING_HOURS' && isDateStr_(pl.next_due_date)) {
            var ahead = Number(setting_('wo_generate_days_ahead')); if (!(ahead >= 0)) ahead = 7;
            if (daysRemaining_(pl.next_due_date, todayVN_()) <= ahead) {
              gen = newWorkOrder_(st, su, {
                id: uuid_(), equipment_id: pl.equipment_id, title_vi: pl.title_vi, title_zh: pl.title_zh, title_meta: pl.i18n_meta && pl.i18n_meta.title,
                due_date: pl.next_due_date, priority: pl.priority || 'NORMAL', assignee: pl.assignee_user_id && workerOk_(pl.assignee_user_id) ? pl.assignee_user_id : '',
                plan: pl, template_id: pl.checklist_template_id, source: 'PLAN', created_by: SYSTEM_USER
              });
            }
          }
        }
        if (p.confirm_usage) {
          findAll_('MaterialUsageLines', 'work_id', w.work_order_id).forEach(function (u) {
            if (u.work_type !== 'WORK_ORDER' || u.archived_at || u.status !== 'PENDING_CONFIRMATION') return;
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
      writes.unshift({ sheet: 'WorkOrders', mode: 'update', row: row });
      if (gen) {
        writes.push({ sheet: 'WorkOrders', mode: 'insert', row: gen.wo });
        gen.results.forEach(function (r) { writes.push({ sheet: 'WorkOrderResults', mode: 'insert', row: r }); });
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: gen.qr });
      }
      return {
        writes: writes, state: su,
        result: {
          entity_type: 'WORK_ORDER', entity_id: row.work_order_id, display_code: row.work_order_code, status: row.status,
          record_version: row.record_version, record: projectRow_(ctx, row, 'WorkOrders'),
          usage_confirmed: usageDone, usage_skipped: usageSkipped,
          generated_work_order: gen ? { work_order_id: gen.wo.work_order_id, work_order_code: gen.wo.work_order_code, due_date: gen.wo.due_date } : null
        },
        record_version: row.record_version,
        audit: {
          entity_type: 'WORK_ORDER', entity_id: row.work_order_id, before_json: { status: w.status }, after_json: { status: row.status, next_due_date: row.next_due_date || undefined, usage_confirmed: usageDone.length || undefined },
          reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined
        }
      };
    }
  });
}

/**
 * maintenance.cancel {work_order_id, reason}: → CANCELLED. KT chỉ hủy phiếu mình tạo còn Nháp; C3/C4 hủy phiếu chưa xong.
 * Phiếu của kế hoạch bị hủy: bỏ qua lần đó, kế hoạch sang hạn kế tiếp.
 */
function maintenanceCancel_(ctx) {
  var p = ctx.req.payload || {};
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  return executeWrite_(ctx, {
    entity_type: 'WORK_ORDER', entity_id: p.work_order_id,
    build: function () {
      var w = woOrThrow_(p.work_order_id);
      if (ctx.auth && ctx.auth.conds.length && (w.created_by !== ctx.user.user_id || w.status !== 'DRAFT')) throw apiError_('FORBIDDEN');
      assertVersion_(ctx, w, 'WORK_ORDER', 'WorkOrders');
      assertStatus_(w, ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE']);
      var row = clone_(w); delete row.__row;
      var nowIso = isoVN_(now_());
      row.status = 'CANCELLED'; row.cancel_reason = trimStr_(p.reason).slice(0, 500); row.cancelled_at = nowIso;
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'WorkOrders', mode: 'update', row: row }];
      var plan = w.plan_id ? findOne_('MaintenancePlans', 'plan_id', w.plan_id) : null;
      if (plan) writes.push({ sheet: 'MaintenancePlans', mode: 'update', row: planAfterWorkOrder_(ctx, plan, row, false) });
      var qr = findOne_('QrRegistry', 'entity_id', w.work_order_id);
      if (qr && qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = false; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes,
        result: { entity_type: 'WORK_ORDER', entity_id: row.work_order_id, display_code: row.work_order_code, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'WorkOrders') },
        record_version: row.record_version,
        audit: { entity_type: 'WORK_ORDER', entity_id: row.work_order_id, before_json: { status: w.status }, after_json: { status: 'CANCELLED' }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Xem ---------------- */

/**
 * maintenance.view: {work_order_id} chi tiết phiếu (kết quả, vật tư, giờ chạy), {plan_id} kế hoạch kèm phiếu,
 * hoặc danh sách {filters: {status, equipment_id, q}}. App chủ yếu đọc dữ liệu đã đồng bộ; hàm này cho web và kiểm tra.
 */
function maintenanceView_(ctx) {
  var p = ctx.req.payload || {};
  var qm = qrMap_();
  var proj = function (r, s) { var o = projectRow_(ctx, r, s); if (qm[o[sheetSchema_(s).key]]) o.qr_key = qm[o[sheetSchema_(s).key]]; return o; };
  if (p.work_order_id) {
    var w = woOrThrow_(p.work_order_id);
    return {
      item: proj(w, 'WorkOrders'),
      results: findAll_('WorkOrderResults', 'work_order_id', w.work_order_id).filter(function (r) { return !r.archived_at; })
        .sort(function (a, b) { return Number(a.step_no) - Number(b.step_no); }).map(function (r) { return projectRow_(ctx, r, 'WorkOrderResults'); }),
      usage: findAll_('MaterialUsageLines', 'work_id', w.work_order_id).filter(function (u) { return u.work_type === 'WORK_ORDER' && !u.archived_at; }).map(function (u) { return projectRow_(ctx, u, 'MaterialUsageLines'); }),
      requests: findAll_('MaterialRequests', 'work_id', w.work_order_id).filter(function (r) { return r.work_type === 'WORK_ORDER' && !r.archived_at; }).map(function (r) { return projectRow_(ctx, r, 'MaterialRequests'); })
    };
  }
  if (p.plan_id) {
    var pl = findOne_('MaintenancePlans', 'plan_id', p.plan_id);
    if (!pl) throw apiError_('NOT_FOUND');
    return {
      item: proj(pl, 'MaintenancePlans'),
      work_orders: findAll_('WorkOrders', 'plan_id', pl.plan_id).map(function (r) { return proj(r, 'WorkOrders'); }),
      checklist: pl.checklist_template_id ? latestChecklist_(pl.checklist_template_id).items.map(function (r) { return projectRow_(ctx, r, 'ChecklistTemplates'); }) : []
    };
  }
  var f = p.filters || {};
  var q = trimStr_(f.q).toLowerCase();
  var rows = readRows_('WorkOrders').filter(function (r) {
    if (r.archived_at) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.equipment_id && r.equipment_id !== f.equipment_id) return false;
    if (q && [r.work_order_code, r.title_vi, r.title_zh].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(a.due_date).localeCompare(String(b.due_date)); });
  var size = Math.min(200, Number(p.page_size) || setting_('list_page_size'));
  var start = Number(p.page_token || 0);
  return {
    items: rows.slice(start, start + size).map(function (r) { return proj(r, 'WorkOrders'); }),
    total: rows.length, next_page_token: start + size < rows.length ? String(start + size) : null,
    plans: readRows_('MaintenancePlans').filter(function (r) { return !r.archived_at; }).map(function (r) { return proj(r, 'MaintenancePlans'); })
  };
}
