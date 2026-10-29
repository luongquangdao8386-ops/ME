/* 37_plan_group: kế hoạch bảo trì cho cả nhóm máy cùng loại (d4.18, Bước 2 kế hoạch năm — người dùng yêu cầu 29/10/2026).
 * Mỗi máy vẫn một kế hoạch riêng (phiếu, QR, lịch sử, giờ chạy theo máy); các kế hoạch tạo cùng một lượt mang chung plan_group_id
 * để sửa cả nhóm. maintenance.plan.group tạo kế hoạch cho nhiều máy (≤ 100) trong một thao tác, dùng cả khi thêm máy mới vào nhóm có
 * sẵn; ngày mốc từng máy do app tính (rải lịch cách N ngày). maintenance.plan.group_edit đổi tên việc, số chu kỳ (giữ kiểu chu kỳ),
 * checklist, người làm, ưu tiên, thời gian dự kiến, lưu ý an toàn, ngừng/chạy lại cho các kế hoạch được chọn trong nhóm. Kết quả trả
 * gọn (mã + phiên bản): bản ghi đầy đủ về app qua đồng bộ (ô Operations.result_json tối đa 50 000 ký tự). */

var PLAN_GROUP_MAX_ = 100;

/** Trường dùng chung của nhóm (giống maintenance.plan.edit): lỗi đẩy vào errs */
function planGroupCommonErrors_(p, errs, itype) {
  var ival = Number(p.interval_value);
  var maxV = itype === 'MONTH' ? 120 : (itype === 'DAY' ? 3650 : 100000);
  if (p.interval_value !== undefined && !(ival >= 1 && ival <= maxV && Math.floor(ival) === ival)) {
    errs.push(fieldError_('interval_value', p.interval_value === '' || p.interval_value === null ? 'REQUIRED' : 'INVALID_VALUE'));
  }
  if (p.priority !== undefined && PRIORITIES_.indexOf(p.priority) < 0) errs.push(fieldError_('priority', 'INVALID_VALUE'));
  if (p.estimated_minutes !== undefined && p.estimated_minutes !== '' && p.estimated_minutes !== null) {
    var em = Number(p.estimated_minutes);
    if (!(em >= 0 && em <= 100000 && Math.floor(em) === em)) errs.push(fieldError_('estimated_minutes', 'INVALID_VALUE'));
  }
  if (p.checklist_template_id !== undefined && p.checklist_template_id !== '' && !isUuidV4_(p.checklist_template_id)) errs.push(fieldError_('checklist_template_id', 'ID_INVALID'));
  if (p.assignee_user_id !== undefined && p.assignee_user_id !== '' && !isUuidV4_(p.assignee_user_id)) errs.push(fieldError_('assignee_user_id', 'ID_INVALID'));
}

/** Kế hoạch mới có thể tới hạn ngay (đỡ đọc phiếu/thiết bị cho từng máy khi tạo cả nhóm) */
function planMayBeDue_(row, latest) {
  if (row.interval_type === 'OPERATING_HOURS') return !!latest && Number(row.operating_hours_target) > 0 && Number(latest.cumulative_hours) >= Number(row.operating_hours_target);
  if (!isDateStr_(row.next_due_date)) return false;
  var ahead = Number(setting_('wo_generate_days_ahead'));
  if (!(ahead >= 0)) ahead = 7;
  return daysRemaining_(row.next_due_date, todayVN_()) <= ahead;
}

/**
 * maintenance.plan.group {plan_group_id, plans: [{plan_id, equipment_id, anchor_date, operating_hours_target?}], title_vi/zh,
 * interval_type, interval_value, checklist_template_id, assignee_user_id, priority, estimated_minutes, safety_note_vi/zh}
 * Tạo mỗi máy một kế hoạch; plan_group_id có sẵn = thêm máy vào nhóm (máy đã có kế hoạch trong nhóm → ALREADY_IN_GROUP).
 * Theo giờ chạy: mốc mặc định = giờ mới nhất + chu kỳ (không có số đọc thì phải nhập mốc cho máy đó). Tới hạn thì sinh phiếu luôn.
 */
function maintenancePlanGroup_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.plan_group_id)) errs.push(fieldError_('plan_group_id', 'ID_INVALID'));
  var items = Array.isArray(p.plans) ? p.plans : [];
  if (!items.length) errs.push(fieldError_('plans', 'REQUIRED'));
  else if (items.length > PLAN_GROUP_MAX_) errs.push(fieldError_('plans', 'GROUP_TOO_LARGE'));
  requireOneLang_(errs, p, null, 'title');
  var itype = p.interval_type;
  if (PLAN_INTERVAL_TYPES_.indexOf(itype) < 0) errs.push(fieldError_('interval_type', itype ? 'INVALID_VALUE' : 'REQUIRED'));
  if (p.interval_value === undefined) errs.push(fieldError_('interval_value', 'REQUIRED'));
  planGroupCommonErrors_(p, errs, itype);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  var seenEq = {}, seenPlan = {};
  items.slice(0, PLAN_GROUP_MAX_).forEach(function (it, i) {
    it = it || {};
    if (!isUuidV4_(it.plan_id) || seenPlan[it.plan_id]) errs.push(fieldError_('plan_id', 'ID_INVALID', i));
    if (!isUuidV4_(it.equipment_id)) errs.push(fieldError_('equipment_id', 'REQUIRED', i));
    else if (seenEq[it.equipment_id]) errs.push(fieldError_('equipment_id', 'EQUIPMENT_DUPLICATE', i));
    seenPlan[it.plan_id] = true; seenEq[it.equipment_id] = true;
    if (itype !== 'OPERATING_HOURS' && !isDateStr_(it.anchor_date)) errs.push(fieldError_('anchor_date', it.anchor_date ? 'INVALID_DATE' : 'REQUIRED', i));
    var t = it.operating_hours_target;
    if (t !== undefined && t !== null && t !== '' && !(Number(t) >= 0 && Number(t) < 1e7)) errs.push(fieldError_('operating_hours_target', 'INVALID_VALUE', i));
  });
  if (errs.length) throw validationError_(errs);
  var ival = Number(p.interval_value);
  var tr = applyTranslations_('MaintenancePlans', ['title', 'safety_note'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'MAINTENANCE_PLAN', entity_id: p.plan_group_id,
    build: function (st) {
      var e2 = [];
      var eqs = {};
      readRows_('Equipment').forEach(function (e) { eqs[e.equipment_id] = e; });
      var existsId = {}, inGroup = {};
      readRows_('MaintenancePlans').forEach(function (x) {
        existsId[x.plan_id] = true;
        if (x.plan_group_id === p.plan_group_id && !x.archived_at) inGroup[x.equipment_id] = true;
      });
      var tplId = p.checklist_template_id || '';
      if (tplId) {
        var cl = latestChecklist_(tplId);
        if (!cl.revision || !cl.active) e2.push(fieldError_('checklist_template_id', 'NOT_FOUND'));
      }
      var asg = p.assignee_user_id || '';
      if (asg && !workerOk_(asg)) e2.push(fieldError_('assignee_user_id', 'NOT_FOUND'));
      var latest = {};
      items.forEach(function (it, i) {
        var eq = eqs[it.equipment_id];
        if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND', i));
        if (existsId[it.plan_id]) e2.push(fieldError_('plan_id', 'ID_EXISTS', i));
        if (inGroup[it.equipment_id]) e2.push(fieldError_('equipment_id', 'ALREADY_IN_GROUP', i));
        if (itype === 'OPERATING_HOURS') {
          latest[it.equipment_id] = latestHours_(it.equipment_id);
          var t = it.operating_hours_target;
          if ((t === undefined || t === null || t === '') && !latest[it.equipment_id]) e2.push(fieldError_('operating_hours_target', 'REQUIRED', i));
        }
      });
      if (e2.length) throw validationError_(e2);
      var su = {}, writes = [], out = [], gens = [];
      var labelVi = tr.values.title_vi || tr.values.title_zh, labelZh = tr.values.title_zh || tr.values.title_vi;
      var em = p.estimated_minutes === undefined || p.estimated_minutes === '' || p.estimated_minutes === null ? '' : Number(p.estimated_minutes);
      items.forEach(function (it) {
        var target = '';
        if (itype === 'OPERATING_HOURS') {
          var t = it.operating_hours_target;
          target = t !== undefined && t !== null && t !== '' ? Number(t) : Number(latest[it.equipment_id].cumulative_hours) + ival;
        }
        var row = {
          plan_id: it.plan_id, plan_code: allocCode_(st, su, 'MAINTENANCE_PLAN', null, null), plan_group_id: p.plan_group_id,
          equipment_id: it.equipment_id, title_vi: tr.values.title_vi, title_zh: tr.values.title_zh,
          safety_note_vi: tr.values.safety_note_vi, safety_note_zh: tr.values.safety_note_zh, i18n_meta: tr.meta,
          interval_type: itype, interval_value: ival, anchor_date: isDateStr_(it.anchor_date) ? it.anchor_date : '',
          operating_hours_target: target, checklist_template_id: tplId, assignee_user_id: asg, priority: p.priority || 'NORMAL',
          estimated_minutes: em, active: true, last_work_order_id: '', last_done_date: '', last_done_hours: ''
        };
        row.next_due_date = itype === 'OPERATING_HOURS' ? '' : occurrenceFrom_(row, todayVN_(), false);
        cNew_(ctx, row);
        writes.push({ sheet: 'MaintenancePlans', mode: 'insert', row: row });
        var qrKey = allocQrKey_();
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'MAINTENANCE_PLAN', row.plan_id, row.plan_code, labelVi, labelZh) });
        var gen = planMayBeDue_(row, latest[it.equipment_id]) ? maybeGenerateForPlan_(st, su, row, writes) : null;
        if (gen) {
          if (itype === 'OPERATING_HOURS') row.next_due_date = gen.due_date;
          gens.push({ plan_id: row.plan_id, work_order_id: gen.work_order_id, work_order_code: gen.work_order_code, due_date: gen.due_date });
        }
        out.push({ plan_id: row.plan_id, plan_code: row.plan_code, equipment_id: row.equipment_id, record_version: 1 });
      });
      return {
        writes: writes, state: su,
        result: { entity_type: 'MAINTENANCE_PLAN', plan_group_id: p.plan_group_id, plans: out, generated_work_orders: gens },
        record_version: 1,
        audit: {
          entity_type: 'MAINTENANCE_PLAN', entity_id: p.plan_group_id, before_json: null,
          after_json: { plan_group_id: p.plan_group_id, count: out.length, plan_codes: out.map(function (x) { return x.plan_code; }),
            title_vi: tr.values.title_vi, title_zh: tr.values.title_zh, interval_type: itype, interval_value: ival }
        }
      };
    }
  });
}

var PLAN_GROUP_EDIT_FIELDS_ = ['title_vi', 'title_zh', 'interval_value', 'checklist_template_id', 'assignee_user_id', 'priority',
  'estimated_minutes', 'safety_note_vi', 'safety_note_zh', 'active'];

/**
 * maintenance.plan.group_edit {plan_group_id, plan_ids: [...], versions: {plan_id: record_version}, changes: {title_vi/zh,
 * interval_value, checklist_template_id, assignee_user_id, priority, estimated_minutes, safety_note_vi/zh, active}, reason}
 * Áp cùng thay đổi cho các kế hoạch được chọn trong nhóm (giữ ngày mốc, kiểu chu kỳ của từng máy). Ngừng phải có lý do.
 * Mỗi kế hoạch phải đúng phiên bản app đang thấy (khác → VERSION_CONFLICT kèm kế hoạch đó).
 */
function maintenancePlanGroupEdit_(ctx) {
  var p = ctx.req.payload || {};
  var ch = p.changes && typeof p.changes === 'object' && !Array.isArray(p.changes) ? p.changes : null;
  var errs = [];
  if (!isUuidV4_(p.plan_group_id)) errs.push(fieldError_('plan_group_id', 'ID_INVALID'));
  var ids = Array.isArray(p.plan_ids) ? p.plan_ids : [];
  if (!ids.length) errs.push(fieldError_('plan_ids', 'REQUIRED'));
  else if (ids.length > PLAN_GROUP_MAX_) errs.push(fieldError_('plan_ids', 'GROUP_TOO_LARGE'));
  ids.forEach(function (id, i) { if (!isUuidV4_(id)) errs.push(fieldError_('plan_ids', 'ID_INVALID', i)); });
  var vers = p.versions && typeof p.versions === 'object' ? p.versions : {};
  if (!ch || !Object.keys(ch).length) errs.push(fieldError_('changes', 'REQUIRED'));
  else {
    Object.keys(ch).forEach(function (k) { if (PLAN_GROUP_EDIT_FIELDS_.indexOf(k) < 0) errs.push(fieldError_(k, 'INVALID_VALUE')); });
    if ((ch.title_vi !== undefined || ch.title_zh !== undefined) && !trimStr_(ch.title_vi) && !trimStr_(ch.title_zh)) errs.push(fieldError_('title', 'REQUIRED_ONE_LANGUAGE'));
    if (ch.interval_value !== undefined && !(Number(ch.interval_value) >= 1 && Math.floor(Number(ch.interval_value)) === Number(ch.interval_value))) errs.push(fieldError_('interval_value', 'INVALID_VALUE'));
    planGroupCommonErrors_({ priority: ch.priority, estimated_minutes: ch.estimated_minutes, checklist_template_id: ch.checklist_template_id, assignee_user_id: ch.assignee_user_id }, errs, null);
    if (ch.active !== undefined && typeof ch.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
    if (ch.active === false && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  }
  if (errs.length) throw validationError_(errs);
  var wantIds = {};
  ids.forEach(function (id) { wantIds[id] = true; });
  var titleCh = ch.title_vi !== undefined || ch.title_zh !== undefined;
  var safetyCh = ch.safety_note_vi !== undefined || ch.safety_note_zh !== undefined;
  // Dịch ngoài khóa ghi: lấy kế hoạch đầu tiên làm bản hiện tại (tên việc của nhóm giống nhau)
  var first = titleCh || safetyCh ? findOne_('MaintenancePlans', 'plan_id', ids[0]) : null;
  var trFields = [];
  if (titleCh) trFields.push('title');
  if (safetyCh) trFields.push('safety_note');
  var tr = trFields.length ? applyTranslations_('MaintenancePlans', trFields, ch, first) : null;
  return executeWrite_(ctx, {
    entity_type: 'MAINTENANCE_PLAN', entity_id: p.plan_group_id,
    build: function (st) {
      var rows = readRows_('MaintenancePlans').filter(function (r) { return wantIds[r.plan_id]; });
      if (rows.length !== ids.length) throw apiError_('NOT_FOUND');
      var e2 = [];
      rows.forEach(function (r) {
        if (r.plan_group_id !== p.plan_group_id || r.archived_at) e2.push(fieldError_('plan_ids', 'INVALID_VALUE', ids.indexOf(r.plan_id)));
      });
      if (e2.length) throw validationError_(e2);
      rows.forEach(function (r) {
        if (Number(vers[r.plan_id]) !== Number(r.record_version || 0)) {
          throw apiError_('VERSION_CONFLICT', { entity_type: 'MAINTENANCE_PLAN', server: projectRow_(ctx, r, 'MaintenancePlans'), server_version: r.record_version });
        }
        if (ch.interval_value !== undefined) {
          var maxV = r.interval_type === 'MONTH' ? 120 : (r.interval_type === 'DAY' ? 3650 : 100000);
          if (Number(ch.interval_value) > maxV) e2.push(fieldError_('interval_value', 'INVALID_VALUE'));
        }
      });
      if (ch.checklist_template_id) {
        var cl = latestChecklist_(ch.checklist_template_id);
        if (!cl.revision || !cl.active) e2.push(fieldError_('checklist_template_id', 'NOT_FOUND'));
      }
      if (ch.assignee_user_id && !workerOk_(ch.assignee_user_id)) e2.push(fieldError_('assignee_user_id', 'NOT_FOUND'));
      if (e2.length) {
        var seen = {};
        throw validationError_(e2.filter(function (e) { var k = e.field + ':' + e.code; if (seen[k]) return false; seen[k] = true; return true; }));
      }
      var su = {}, writes = [], out = [], gens = [];
      rows.forEach(function (cur) {
        var row = clone_(cur); delete row.__row;
        var resumed = cur.active === false && ch.active === true;
        var scheduleChanged = (ch.interval_value !== undefined && Number(ch.interval_value) !== Number(cur.interval_value)) || resumed;
        if (tr) {
          trFields.forEach(function (f) { row[f + '_vi'] = tr.values[f + '_vi']; row[f + '_zh'] = tr.values[f + '_zh']; });
          var meta = clone_(row.i18n_meta || {});
          trFields.forEach(function (f) { if (tr.meta && tr.meta[f]) meta[f] = tr.meta[f]; });
          row.i18n_meta = meta;
        }
        if (ch.interval_value !== undefined) row.interval_value = Number(ch.interval_value);
        if (ch.checklist_template_id !== undefined) row.checklist_template_id = ch.checklist_template_id || '';
        if (ch.assignee_user_id !== undefined) row.assignee_user_id = ch.assignee_user_id || '';
        if (ch.priority !== undefined) row.priority = ch.priority;
        if (ch.estimated_minutes !== undefined) row.estimated_minutes = ch.estimated_minutes === '' || ch.estimated_minutes === null ? '' : Number(ch.estimated_minutes);
        if (ch.active !== undefined) row.active = ch.active;
        if (scheduleChanged) {
          var openWo = openWorkOrderOfPlan_(row.plan_id);
          if (row.interval_type === 'OPERATING_HOURS') row.next_due_date = openWo ? openWo.due_date : '';
          else row.next_due_date = openWo ? openWo.due_date : occurrenceFrom_(row, todayVN_(), false);
        }
        cUpdate_(ctx, row);
        writes.push({ sheet: 'MaintenancePlans', mode: 'update', row: row });
        if (titleCh || ch.active !== undefined) {
          var qr = findOne_('QrRegistry', 'entity_id', row.plan_id);
          var lv = row.title_vi || row.title_zh, lz = row.title_zh || row.title_vi;
          if (qr && (qr.active !== (row.active !== false) || qr.label_vi !== lv || qr.label_zh !== lz)) {
            var q2 = clone_(qr); delete q2.__row; q2.active = row.active !== false; q2.label_vi = lv; q2.label_zh = lz;
            writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
          }
        }
        if (scheduleChanged) {
          var gen = maybeGenerateForPlan_(st, su, row, writes);
          if (gen) {
            if (row.interval_type === 'OPERATING_HOURS') row.next_due_date = gen.due_date;
            gens.push({ plan_id: row.plan_id, work_order_id: gen.work_order_id, work_order_code: gen.work_order_code, due_date: gen.due_date });
          }
        }
        out.push({ plan_id: row.plan_id, plan_code: row.plan_code, record_version: row.record_version });
      });
      var after = {};
      Object.keys(ch).forEach(function (k) { after[k] = ch[k]; });
      return {
        writes: writes, state: su,
        result: { entity_type: 'MAINTENANCE_PLAN', plan_group_id: p.plan_group_id, plans: out, generated_work_orders: gens },
        record_version: out.length ? out[0].record_version : 0,
        audit: {
          entity_type: 'MAINTENANCE_PLAN', entity_id: p.plan_group_id, before_json: null,
          after_json: { plan_group_id: p.plan_group_id, plan_codes: out.map(function (x) { return x.plan_code; }), changes: after }, reason: trimStr_(p.reason)
        }
      };
    }
  });
}
