/* 29_import_d2: Mẫu Excel Đợt 2 — phụ lục 1.5 mục 6.9.1 ("Excel: mẫu kế hoạch, checklist, sự cố lịch sử"), 1.4 §11.2.
 * maintenance_plans: sheet checklists (nhiều dòng = một mẫu, ghi thành một phiên bản mới) + sheet maintenance_plans
 *   (tham chiếu checklist bằng ID, khóa trong file hoặc tên mẫu). Xuất → sửa → nhập lại; mẫu không đổi thì bỏ qua (không tạo phiên bản).
 * repairs_history: phiếu sự cố đã xử lý xong trước khi dùng app; đủ hoặc thiếu mốc (C9: không tự điền mốc thiếu).
 *   Lô nhạy cảm: người nhập ≠ người commit; commit là duyệt (approved_by = người commit). */

IMPORT_TEMPLATES_.maintenance_plans = { module: 'maintenance', sheets: [
  { name: 'checklists', table: 'ChecklistTemplates', entity: 'CHECKLIST', id: 'template_key', group: 'checklist', cols: [
    ic_('template_key', 'text', 'ID mẫu checklist (mẫu có sẵn) hoặc khóa tự đặt (mẫu mới)', '检查表模板ID（已有）或自定键（新模板）', { req: 1, max: 60, keep: 1 }),
    ic_('revision', 'ver', 'Phiên bản mẫu (khi sửa mẫu có sẵn)', '模板版本（修改已有模板时）'),
    ic_('template_name_vi', 'text', 'Tên mẫu (Việt)', '模板名称（越）', { max: 200 }), ic_('template_name_zh', 'text', 'Tên mẫu (Trung)', '模板名称（中）', { max: 200 }),
    ic_('step_no', 'int', 'Bước số', '步骤号', { req: 1 }),
    ic_('label_vi', 'text', 'Nội dung bước (Việt)', '步骤内容（越）', { max: 200 }), ic_('label_zh', 'text', 'Nội dung bước (Trung)', '步骤内容（中）', { max: 200 }),
    ic_('result_type', 'enum', 'Kiểu kết quả', '结果类型', { options: RESULT_TYPES_ }),
    ic_('unit', 'text', 'Đơn vị (số đo)', '单位（测量值）', { max: 20, keep: 1 }),
    ic_('min_value', 'num', 'Nhỏ nhất', '最小值'), ic_('max_value', 'num', 'Lớn nhất', '最大值'), ic_('required', 'bool', 'Bắt buộc', '必填'),
    ic_('safety_note_vi', 'text', 'Lưu ý an toàn (Việt)', '安全注意事项（越）', { max: 300 }), ic_('safety_note_zh', 'text', 'Lưu ý an toàn (Trung)', '安全注意事项（中）', { max: 300 })] },
  { name: 'maintenance_plans', table: 'MaintenancePlans', entity: 'MAINTENANCE_PLAN', id: 'plan_id', code: 'plan_code', cols: [
    ic_('plan_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('plan_code', 'code', 'Mã kế hoạch (máy chủ cấp)', '计划编号（系统分配）', { readonly: 1 }),
    ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { req: 'add', ref: 'Equipment', to: 'equipment_id', fixed: 1 }),
    ic_('title_vi', 'text', 'Nội dung công việc (Việt)', '工作内容（越）', { pair: 'title', max: 200 }), ic_('title_zh', 'text', 'Nội dung công việc (Trung)', '工作内容（中）', { pair: 'title', max: 200 }),
    ic_('interval_type', 'enum', 'Kiểu chu kỳ', '周期类型', { req: 'add', options: PLAN_INTERVAL_TYPES_ }),
    ic_('interval_value', 'int', 'Chu kỳ (số ngày/tháng/giờ)', '周期数（天/月/小时）', { req: 'add' }),
    ic_('anchor_date', 'date', 'Ngày mốc', '基准日'), ic_('operating_hours_target', 'num', 'Mốc giờ chạy làm tiếp', '下次保养运行小时'),
    ic_('checklist_key', 'ref', 'Mẫu checklist (ID, khóa trong file hoặc tên mẫu)', '检查表（ID、文件内键或模板名称）', { ref: 'ChecklistTemplates', to: 'checklist_template_id', fileSheet: 'checklists' }),
    ic_('assignee_code', 'ref', 'Mã NV làm mặc định', '默认执行人员工编号', { ref: 'Users', to: 'assignee_user_id' }),
    ic_('priority', 'enum', 'Ưu tiên', '优先级', { options: PRIORITIES_ }), ic_('estimated_minutes', 'int', 'Thời gian dự kiến (phút)', '预计用时（分钟）'),
    ic_('safety_note_vi', 'text', 'Lưu ý an toàn (Việt)', '安全注意事项（越）', { pair: 'safety_note', opt: 1, max: 500 }),
    ic_('safety_note_zh', 'text', 'Lưu ý an toàn (Trung)', '安全注意事项（中）', { pair: 'safety_note', opt: 1, max: 500 }),
    ic_('active', 'bool', 'Đang chạy', '启用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] };

IMPORT_TEMPLATES_.repairs_history = { module: 'repairs', sensitive: true, sheets: [
  { name: 'repairs_history', table: 'Repairs', entity: 'REPAIR', id: 'repair_id', code: 'repair_code', addOnly: true, cols: [
    ic_('repair_id', 'id', 'ID (để trống)', 'ID（留空）'), ic_('repair_code', 'code', 'Mã phiếu (máy chủ cấp)', '单号（系统分配）', { readonly: 1 }),
    ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { req: 1, ref: 'Equipment', to: 'equipment_id' }),
    ic_('reported_at', 'time', 'Báo lúc (dd/mm/yyyy hh:mm)', '报告时间（dd/mm/yyyy hh:mm）', { req: 1 }),
    ic_('reporter_code', 'ref', 'Mã NV báo (trống = người nhập)', '报告人员工编号（空=导入人）', { ref: 'Users', to: 'reported_by' }),
    ic_('symptom_vi', 'text', 'Hiện tượng (Việt)', '故障现象（越）', { pair: 'symptom', max: 1000 }), ic_('symptom_zh', 'text', 'Hiện tượng (Trung)', '故障现象（中）', { pair: 'symptom', max: 1000 }),
    ic_('severity', 'enum', 'Mức độ', '严重程度', { req: 1, options: SEVERITIES_ }),
    ic_('assignee_code', 'ref', 'Mã NV phụ trách', '负责人员工编号', { ref: 'Users', to: 'assignee_user_id' }),
    ic_('assigned_at', 'time', 'Phân công lúc', '分配时间'), ic_('repair_start_at', 'time', 'Bắt đầu sửa', '开始维修'), ic_('repair_end_at', 'time', 'Kết thúc sửa', '结束维修'),
    ic_('stopped_at', 'time', 'Dừng máy lúc', '停机时间'), ic_('restored_at', 'time', 'Hoạt động lại', '恢复运行'), ic_('downtime_note', 'text', 'Ghi chú dừng máy', '停机说明', { max: 500 }),
    ic_('root_cause_code', 'text', 'Mã nguyên nhân', '原因编码', { max: 40, keep: 1, lookupCode: 'CAUSE' }),
    ic_('action_vi', 'text', 'Công việc đã làm (Việt)', '处理措施（越）', { pair: 'action', opt: 1, max: 1000 }), ic_('action_zh', 'text', 'Công việc đã làm (Trung)', '处理措施（中）', { pair: 'action', opt: 1, max: 1000 }),
    ic_('test_run_result', 'enum', 'Chạy thử', '试运行', { options: ['PASS', 'FAIL'] }),
    ic_('approved_at', 'time', 'Nghiệm thu lúc', '验收时间')] }] };

REF_CODE_COL_.MaintenancePlans = 'plan_code';
REF_CODE_COL_.Repairs = 'repair_code';

var HIST_TIMES_ = ['reported_at', 'assigned_at', 'repair_start_at', 'repair_end_at', 'stopped_at', 'restored_at', 'approved_at'];

/** "2026-10-14T08:30:00+07:00" → "14/10/2026 08:30" (giờ Việt Nam; nhập lại đọc được) */
function timeTextVN_(iso) {
  var t = parseTime_(iso);
  if (!t) return '';
  var s = isoVN_(t);
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) + ' ' + s.slice(11, 16);
}

/** Danh mục mã thêm trong mẫu: mẫu checklist (ID · tên) */
function importTemplateListsD2_(t, addList) {
  if (t.module !== 'maintenance') return;
  var all = readRows_('ChecklistTemplates');
  var ids = {};
  all.forEach(function (r) { if (!r.archived_at) ids[r.template_id] = true; });
  addList('checklists', Object.keys(ids).map(function (id) {
    var cl = latestChecklist_(id, all);
    var h = cl.items[0] || {};
    return cl.active ? [id, h.template_name_vi || h.template_name_zh || ''] : null;
  }).filter(Boolean));
}

/** Tham chiếu checklist có sẵn: ID mẫu hoặc đúng tên (Việt/Trung) của mẫu đang dùng; tên trùng nhiều mẫu → CODE_DUPLICATE */
function checklistRef_(code) {
  var all = readRowsCached_('ChecklistTemplates');
  var key = String(code).trim();
  if (isUuidV4_(key.toLowerCase())) {
    var cl = latestChecklist_(key.toLowerCase(), all);
    return cl.revision && cl.active ? { id: key.toLowerCase() } : { err: 'NOT_FOUND' };
  }
  var want = key.toLowerCase(), hit = {};
  all.forEach(function (r) {
    if (r.archived_at) return;
    if (String(r.template_name_vi || '').trim().toLowerCase() === want || String(r.template_name_zh || '').trim().toLowerCase() === want) hit[r.template_id] = true;
  });
  var ids = Object.keys(hit).filter(function (id) { var cl = latestChecklist_(id, all); return cl.active && cl.items.some(function (it) { return [it.template_name_vi, it.template_name_zh].some(function (n) { return String(n || '').trim().toLowerCase() === want; }); }); });
  if (!ids.length) return { err: 'NOT_FOUND' };
  if (ids.length > 1) return { err: 'CODE_DUPLICATE' };
  return { id: ids[0] };
}

var CL_FIELDS_ = ['label_vi', 'label_zh', 'unit', 'safety_note_vi', 'safety_note_zh'];
function clReq_(v) { return v === '' || v === undefined || v === null ? true : v === true; }

/** Các dòng của một mẫu trong file giống hệt phiên bản hiện tại (tên, thứ tự bước, nội dung) */
function sameChecklist_(cur, name, g) {
  var head = cur.items[0] || {};
  if (String(head.template_name_vi || '') !== String(name.vi || '') || String(head.template_name_zh || '') !== String(name.zh || '')) return false;
  if (cur.items.length !== g.length) return false;
  var rows = g.slice().sort(function (a, b) { return Number(a.vals.step_no) - Number(b.vals.step_no); });
  return rows.every(function (x, i) {
    var it = cur.items[i], v = x.vals;
    if ((v.result_type || 'PASS_FAIL') !== (it.result_type || 'PASS_FAIL')) return false;
    if (clReq_(v.required) !== (it.required !== false)) return false;
    if (!importSame_(it.min_value, v.min_value) || !importSame_(it.max_value, v.max_value)) return false;
    return CL_FIELDS_.every(function (f) { return importSame_(it[f], v[f]); });
  });
}

/**
 * Sheet checklists: gom dòng theo template_key → một mẫu. ID mẫu có sẵn = phiên bản mới (revision phải khớp), khóa khác = mẫu mới.
 * Lỗi một dòng làm cả mẫu không ghi. Đăng ký khóa và tên mẫu mới để sheet kế hoạch tham chiếu.
 */
function importGroupCheck_(ctx, t, parsed, fileKeys) {
  var rows = parsed.filter(function (x) { return x.sh && x.sh.group === 'checklist'; });
  if (!rows.length) return;
  var all = readRowsCached_('ChecklistTemplates');
  var units = allowedUnits_('', readRowsCached_('LookupValues'));
  var groups = {}, order = [];
  rows.forEach(function (x) {
    var key = String(x.vals.template_key || '').trim();
    if (!key) { x.errs.push(['template_key', 'REQUIRED']); x.action = 'ADD'; x.entityId = uuid_(); return; }
    var k = isUuidV4_(key.toLowerCase()) ? key.toLowerCase() : key;
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(x);
  });
  var nameSeen = {};
  order.forEach(function (k) {
    var g = groups[k];
    var isId = isUuidV4_(k);
    var cur = isId ? latestChecklist_(k, all) : { revision: 0, items: [] };
    var upd = cur.revision > 0;
    var id = upd ? k : (isId ? k : uuid_());
    fileKeys['checklists|' + k] = id;
    var gErrs = [];
    if (isId && !upd) gErrs.push(['template_key', 'NOT_FOUND']);
    var rev = null, revBad = false;
    g.forEach(function (x) { var v = x.vals.revision; if (v === undefined || v === '') return; if (rev === null) rev = Number(v); else if (Number(v) !== rev) revBad = true; });
    if (upd && rev === null) gErrs.push(['revision', 'REQUIRED']);
    else if (upd && (revBad || rev !== cur.revision)) gErrs.push(['revision', 'VERSION_CONFLICT']);
    var head = cur.items[0] || {};
    var name = { vi: '', zh: '' };
    g.forEach(function (x) {
      if (!name.vi && x.vals.template_name_vi) name.vi = x.vals.template_name_vi;
      if (!name.zh && x.vals.template_name_zh) name.zh = x.vals.template_name_zh;
    });
    if (upd && !name.vi && !name.zh) name = { vi: head.template_name_vi || '', zh: head.template_name_zh || '' };
    if (!name.vi && !name.zh) gErrs.push(['template_name', 'REQUIRED_ONE_LANGUAGE']);
    if (g.length > 100) gErrs.push(['step_no', 'INVALID_VALUE']);
    var steps = {};
    g.forEach(function (x) {
      var v = x.vals;
      var sn = v.step_no;
      if (sn === undefined || sn === '') x.errs.push(['step_no', 'REQUIRED']);
      else if (!(sn >= 1 && sn <= 999)) x.errs.push(['step_no', 'INVALID_VALUE']);
      else if (steps[sn]) x.errs.push(['step_no', 'CODE_DUPLICATE']);
      else steps[sn] = true;
      if (!v.label_vi && !v.label_zh) x.errs.push(['label', 'REQUIRED_ONE_LANGUAGE']);
      if ((v.result_type || 'PASS_FAIL') === 'NUMBER') {
        var u = normUnit_(v.unit);
        if (!u) x.errs.push(['unit', 'REQUIRED']); else if (units.indexOf(u) < 0) x.errs.push(['unit', 'UNIT_NOT_ALLOWED']);
      }
      if (v.min_value !== undefined && v.min_value !== '' && v.max_value !== undefined && v.max_value !== '' && Number(v.min_value) > Number(v.max_value)) x.errs.push(['max_value', 'INVALID_VALUE']);
      if ((v.label_vi && !v.label_zh) || (!v.label_vi && v.label_zh)) x.mtN = (x.mtN || 0) + 1;
    });
    g[0].errs = g[0].errs.concat(gErrs);
    if (g.some(function (x) { return x.errs.length; })) g.forEach(function (x) { if (!x.errs.length) x.errs.push(['template_key', 'GROUP_INVALID']); });
    var same = upd && !g.some(function (x) { return x.errs.length; }) && sameChecklist_(cur, name, g);
    g.forEach(function (x) { x.action = upd ? 'UPDATE' : 'ADD'; x.entityId = id; x.groupRev = upd ? cur.revision : 0; x.groupSame = same; });
    // Tên mẫu mới: kế hoạch cùng file tham chiếu bằng tên (tên trùng giữa các mẫu mới → không dùng được tên)
    if (!upd) [name.vi, name.zh].forEach(function (n) {
      if (!n) return;
      var nk = 'checklists|' + n;
      if (nameSeen[nk] && fileKeys[nk] !== id) { fileKeys[nk] = null; return; }
      nameSeen[nk] = true;
      if (fileKeys[nk] === undefined) fileKeys[nk] = id;
    });
  });
}

/** Kiểm thêm theo bảng (Đợt 2): kế hoạch (chu kỳ, ngày mốc, giờ chạy), lịch sử sự cố (thứ tự mốc, không ở tương lai) */
function importRowCheckD2_(x) {
  if (!x.sh) return;
  if (x.sh.table === 'MaintenancePlans') {
    var cur = x.cur || {};
    var v = function (f) { return x.vals[f] !== undefined ? x.vals[f] : cur[f]; };
    var it = v('interval_type'), iv = v('interval_value');
    if (it && iv !== undefined && iv !== '') {
      var maxV = it === 'MONTH' ? 120 : (it === 'DAY' ? 3650 : 100000);
      if (!(Number(iv) >= 1 && Number(iv) <= maxV)) x.errs.push(['interval_value', 'INVALID_VALUE']);
    }
    if (it && it !== 'OPERATING_HOURS' && !v('anchor_date')) x.errs.push(['anchor_date', 'REQUIRED']);
    if (it === 'OPERATING_HOURS' && x.action === 'ADD' && (v('operating_hours_target') === undefined || v('operating_hours_target') === '')) {
      var eqId = x.refs.equipment_id;
      if (eqId && !latestHours_(eqId)) x.errs.push(['operating_hours_target', 'REQUIRED']);
    }
    var em = x.vals.estimated_minutes;
    if (em !== undefined && em !== '' && !(Number(em) >= 0 && Number(em) <= 100000)) x.errs.push(['estimated_minutes', 'INVALID_VALUE']);
    var tg = x.vals.operating_hours_target;
    if (tg !== undefined && tg !== '' && !(Number(tg) >= 0)) x.errs.push(['operating_hours_target', 'INVALID_VALUE']);
  }
  if (x.sh.table === 'Repairs') {
    var nowMs = now_().getTime() + 5 * 60000;
    var ms = function (f) { var s = x.vals[f]; var t0 = s ? parseTime_(s) : null; return t0 ? t0.getTime() : null; };
    HIST_TIMES_.forEach(function (f) { var m = ms(f); if (m !== null && m > nowMs) x.errs.push([f, 'TIME_ORDER_INVALID']); });
    var chain = ['reported_at', 'assigned_at', 'repair_start_at', 'repair_end_at', 'approved_at'];
    var last = null;
    chain.forEach(function (f) { var m = ms(f); if (m === null) return; if (last !== null && m < last) x.errs.push([f, 'TIME_ORDER_INVALID']); last = m; });
    if (ms('stopped_at') !== null && ms('restored_at') !== null && ms('restored_at') < ms('stopped_at')) x.errs.push(['restored_at', 'TIME_ORDER_INVALID']);
    if (ms('repair_end_at') !== null && ms('repair_start_at') === null) x.errs.push(['repair_start_at', 'REQUIRED']);
  }
}

/** Ghi một mẫu checklist (mọi dòng của mẫu) thành một phiên bản: maintenance.checklist.edit */
function commitChecklistGroup_(r, group, run) {
  var rows = [r].concat(group || []);
  var byRow = rows.slice().sort(function (a, b) { return a.row_number - b.row_number; });
  var name = { vi: '', zh: '' };
  byRow.forEach(function (x) {
    var v = x.normalized_payload_json.v || {};
    if (!name.vi && v.template_name_vi) name.vi = v.template_name_vi;
    if (!name.zh && v.template_name_zh) name.zh = v.template_name_zh;
  });
  var steps = rows.slice().sort(function (a, b) { return Number((a.normalized_payload_json.v || {}).step_no) - Number((b.normalized_payload_json.v || {}).step_no); });
  var p = {
    template_id: r.entity_id,
    items: steps.map(function (x) {
      var v = x.normalized_payload_json.v || {};
      var it = { label_vi: v.label_vi || '', label_zh: v.label_zh || '', result_type: v.result_type || 'PASS_FAIL', unit: v.unit || '', required: clReq_(v.required), safety_note_vi: v.safety_note_vi || '', safety_note_zh: v.safety_note_zh || '' };
      if (v.min_value !== undefined && v.min_value !== '') it.min_value = v.min_value;
      if (v.max_value !== undefined && v.max_value !== '') it.max_value = v.max_value;
      return it;
    })
  };
  if (name.vi) p.template_name_vi = name.vi;
  if (name.zh) p.template_name_zh = name.zh;
  return run('maintenance.checklist.edit', p, r.import_row_id, Number(r.expected_version || 0));
}

/** Xuất checklist: phiên bản mới nhất của mỗi mẫu đang dùng, theo tên rồi bước */
function checklistExportRows_(data) {
  var ids = {};
  data.forEach(function (r) { ids[r.template_id] = true; });
  var out = [];
  Object.keys(ids).forEach(function (id) {
    var cl = latestChecklist_(id, data);
    if (cl.active) out = out.concat(cl.items);
  });
  out.sort(function (a, b) {
    return String(a.template_name_vi || a.template_name_zh).localeCompare(String(b.template_name_vi || b.template_name_zh)) || String(a.template_id).localeCompare(String(b.template_id)) || Number(a.step_no) - Number(b.step_no);
  });
  return out;
}

/**
 * repair.history.import (chỉ trong lô Excel "Sự cố (lịch sử)"): phiếu đã xử lý xong, trạng thái Hoàn thành.
 * Mốc có trong file thì ghi, thiếu thì để trống (C9); mã SC theo ngày báo; QR; người commit là người duyệt.
 */
function repairHistoryImport_(ctx) {
  if (!ctx.importBatch) throw apiError_('FORBIDDEN');
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.repair_id)) errs.push(fieldError_('repair_id', 'ID_INVALID'));
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'REQUIRED'));
  requireOneLang_(errs, p, null, 'symptom');
  if (SEVERITIES_.indexOf(p.severity) < 0) errs.push(fieldError_('severity', p.severity ? 'INVALID_VALUE' : 'REQUIRED'));
  if (!p.reported_at) errs.push(fieldError_('reported_at', 'REQUIRED'));
  HIST_TIMES_.forEach(function (f) { checkTimeField_(p, f, errs); });
  if (p.root_cause_code && !causeOk_(trimStr_(p.root_cause_code))) errs.push(fieldError_('root_cause_code', 'NOT_FOUND'));
  if (p.test_run_result && ['PASS', 'FAIL'].indexOf(p.test_run_result) < 0) errs.push(fieldError_('test_run_result', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var trF = ['symptom'].concat(p.action_vi || p.action_zh ? ['action'] : []);
  var tr = applyTranslations_('Repairs', trF, p, null);
  return executeWrite_(ctx, {
    entity_type: 'REPAIR', entity_id: p.repair_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Repairs', 'repair_id', p.repair_id).length) e2.push(fieldError_('repair_id', 'ID_EXISTS'));
      var eq = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND'));
      ['reported_by', 'assignee_user_id'].forEach(function (f) { if (p[f] && !findRowNums_('Users', 'user_id', p[f]).length) e2.push(fieldError_(f, 'NOT_FOUND')); });
      if (e2.length) throw validationError_(e2);
      var su = {};
      var at = normTime_(p.reported_at);
      var code = allocCode_(st, su, 'REPAIR', null, at.slice(0, 10));
      var qrKey = allocQrKey_();
      var t = function (f) { return p[f] ? normTime_(p[f]) : ''; };
      var row = cNew_(ctx, {
        repair_id: p.repair_id, repair_code: code, equipment_id: p.equipment_id, reported_by: p.reported_by || ctx.user.user_id, reported_at: at,
        symptom_vi: tr.values.symptom_vi, symptom_zh: tr.values.symptom_zh, severity: p.severity, priority: 'NORMAL', status: 'COMPLETED',
        assignee_user_id: p.assignee_user_id || '', stopped_at: t('stopped_at'), repair_start_at: t('repair_start_at'), repair_end_at: t('repair_end_at'),
        restored_at: t('restored_at'), root_cause_code: trimStr_(p.root_cause_code || ''),
        action_vi: tr.values.action_vi || '', action_zh: tr.values.action_zh || '', labor_cost: '', outside_cost: '',
        acceptance_result: p.approved_at ? 'PASS' : '', approved_by: ctx.user.user_id, approved_at: t('approved_at'),
        submitted_by: '', submitted_at: '', assigned_at: t('assigned_at'), cost_currency: '', diagnosis_vi: '', diagnosis_zh: '', vendor_id: '',
        outside_service_vi: '', outside_service_zh: '', test_run_result: p.test_run_result || '', test_run_note_vi: '', test_run_note_zh: '',
        downtime_note: trimStr_(p.downtime_note || '').slice(0, 500), source_work_order_id: '', returned_reason: '', returned_at: '', cancel_reason: '', cancelled_at: '',
        reopen_reason: '', reopened_at: '', i18n_meta: tr.meta
      });
      return {
        writes: [
          { sheet: 'Repairs', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'REPAIR', p.repair_id, code, '', '') }
        ],
        state: su,
        result: { entity_type: 'REPAIR', entity_id: p.repair_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Repairs') },
        record_version: 1,
        audit: { entity_type: 'REPAIR', entity_id: p.repair_id, before_json: null, after_json: { repair_code: code, equipment_id: p.equipment_id, history: true, reported_at: at }, auth_basis: 'IMPORT' }
      };
    }
  });
}
