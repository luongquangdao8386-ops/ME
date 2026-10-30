/* 39_record_pdf: PDF hồ sơ/phiếu đủ nội dung các biểu mẫu ISO của người dùng (bản 1.0.0-d4.21, người dùng yêu cầu 30/10/2026).
 * - Lý lịch thiết bị (thay BM-CĐ-02-02): phần A thông tin chung, thông số, kiểm định, linh kiện gắn máy; phần B lịch sử can thiệp
 *   (bảo trì và sửa chữa đã hoàn thành, kiểm định đã duyệt, dịch vụ nhà thầu đã làm, thay/lắp/tháo linh kiện ngoài phiếu).
 * - Phiếu bảo trì (thay BM-CĐ-03-03): thêm kế hoạch, lưu ý an toàn, dừng máy, giờ chạy, giờ công, giới hạn từng bước checklist,
 *   vật tư dùng, thay linh kiện, gửi/nghiệm thu, khối ký Người thực hiện · Người nghiệm thu · Sản xuất xác nhận.
 * - Phiếu sửa chữa (thay BM-CĐ-04-01 + 04-02): thêm người báo, dừng máy, người phụ trách, nguyên nhân gốc, chạy thử, thời lượng
 *   (dừng máy, từ báo đến bắt đầu sửa, sửa), việc con, vật tư, thay linh kiện, nghiệm thu.
 * Mã biểu mẫu in theo Settings pdf_form_codes (pdfFormCode_). Chi phí chỉ khi có quyền giá của module như trước. */

var REC_PDF_HISTORY_MAX_ = 400;
var REC_PART_EVENTS_ = { REPLACED: 1, REMOVED: 1, INSTALLED: 1 };

function recBi_(o, f) { return o ? [o[f + '_vi'], o[f + '_zh']].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' / ') : ''; }
function recName_(dir, id) { return id && dir[id] ? dir[id].display_name : ''; }
function recHasNum_(v) { return v !== '' && v !== null && v !== undefined && isFinite(Number(v)); }
function recNum_(v) { return recHasNum_(v) ? fmtNumSrv_(Number(v)) : ''; }
function recMinutes_(a, b) { var x = tms_(a), y = tms_(b); return x === null || y === null || y < x ? null : Math.round((y - x) / 60000); }
function recWho_(dir, id, at) { return [recName_(dir, id), fmtTimeSrv_(at)].filter(Boolean).join(' · '); }
function recMatText_(m) { return m ? [m.material_code, rptName_(m)].filter(Boolean).join(' · ') : ''; }

/** Giới hạn của một bước checklist: "6–8 bar", "≥ 6 bar", "≤ 8 bar" */
function recRange_(it) {
  var u = it.unit ? ' ' + it.unit : '';
  if (recHasNum_(it.min_value) && recHasNum_(it.max_value)) return fmtNumSrv_(Number(it.min_value)) + '–' + fmtNumSrv_(Number(it.max_value)) + u;
  if (recHasNum_(it.min_value)) return '≥ ' + fmtNumSrv_(Number(it.min_value)) + u;
  if (recHasNum_(it.max_value)) return '≤ ' + fmtNumSrv_(Number(it.max_value)) + u;
  return '';
}

function recMats_() {
  var m = {};
  readRows_('Materials').forEach(function (x) { m[x.material_id] = x; });
  return m;
}

/** Vật tư thực dùng của một phiếu (không tính dòng đã bỏ) */
function recUsageLines_(workType, workId) {
  return findAll_('MaterialUsageLines', 'work_id', workId).filter(function (u) { return u.work_type === workType && !u.archived_at; })
    .sort(function (a, b) { return String(a.recorded_at || a.created_at || '').localeCompare(String(b.recorded_at || b.created_at || '')); });
}

/** Sự kiện thay/lắp/tháo linh kiện (không tính gắn/sửa liên kết danh mục) */
function recPartEvents_(rows) {
  return rows.filter(function (e) { return REC_PART_EVENTS_[e.event_type]; })
    .sort(function (a, b) { return String(a.occurred_at || '').localeCompare(String(b.occurred_at || '')); });
}

function recUsageTable_(mats, lines) {
  return {
    title: lab_('rec.materials'), numbered: true, empty: lab_('rec.no_materials'),
    head: [lab_('field.material_code'), lab_('field.material'), lab_('rec.col.used'), lab_('rec.col.scrap'), lab_('field.unit'), lab_('col.status'), lab_('field.note')],
    types: ['code', 'text', 'num', 'num', 'code', 'text', 'text'],
    rows: lines.map(function (u) {
      var m = mats[u.material_id] || {};
      return [m.material_code || '', rptName_(m), recNum_(u.actual_used_qty), Number(u.scrap_qty) ? recNum_(u.scrap_qty) : '', u.unit || m.base_unit || '',
        u.status ? lab_('usage_status.' + u.status) : '', recBi_(u, 'note')];
    })
  };
}

function recPartTable_(mats, evs) {
  return {
    title: lab_('rec.parts_changed'), numbered: false,
    head: [lab_('rec.col.time'), lab_('field.event'), lab_('rec.col.part'), lab_('rec.col.qty'), lab_('field.position'), lab_('field.note')],
    types: ['time', 'text', 'text', 'text', 'text', 'text'],
    rows: evs.map(function (e) {
      var m = mats[e.material_id], o = e.old_material_id ? mats[e.old_material_id] : null;
      return [fmtTimeSrv_(e.occurred_at), lab_('part_event.' + e.event_type), (o ? recMatText_(o) + ' → ' : '') + recMatText_(m),
        [recNum_(e.quantity), e.unit].filter(Boolean).join(' '), recBi_(e, 'position'), recBi_(e, 'note')];
    })
  };
}

/** Chữ ngắn "phụ tùng thay" cho bảng lịch sử: vật tư thực dùng + sự kiện thay/lắp/tháo */
function recPartsShort_(mats, usage, evs) {
  var a = usage.map(function (u) {
    var m = mats[u.material_id] || {};
    return [m.material_code, rptName_(m)].filter(Boolean).join(' ') + ' × ' + recNum_(u.actual_used_qty) + (u.unit ? ' ' + u.unit : '');
  });
  var b = evs.map(function (e) {
    var m = mats[e.material_id] || {};
    return (LABELS['part_event.' + e.event_type] || [e.event_type])[0] + ': ' + ([m.material_code, rptName_(m)].filter(Boolean).join(' ')) +
      (recHasNum_(e.quantity) ? ' × ' + recNum_(e.quantity) : '');
  });
  return a.concat(b).join('\n');
}

/* ---------------- Phiếu bảo trì ---------------- */

function recWorkOrderPdf_(rec, L, cost) {
  var dir = L.users, mats = recMats_();
  var kv = [];
  var add = function (key, val) { if (val !== '' && val !== null && val !== undefined) kv.push([lab_(key), String(val)]); };
  var eq = L.eqs[rec.equipment_id] || {};
  var plan = rec.plan_id ? findOne_('MaintenancePlans', 'plan_id', rec.plan_id) : null;
  add('col.code', rec.work_order_code);
  add('module.equipment', rptEq_(L, rec.equipment_id) + ' · ' + rptEqName_(L, rec.equipment_id));
  add('field.location', rptLoc_(L, eq.location_id));
  if (eq.criticality) add('field.criticality', lab_('criticality.' + eq.criticality));
  if (plan) add('mt.plan', [plan.plan_code, recBi_(plan, 'title')].filter(Boolean).join(' · '));
  add('mt.title', recBi_(rec, 'title'));
  add('mt.due_date', fmtDateVN_(rec.due_date));
  add('col.status', lab_('wo_status.' + rec.status));
  add('wk.col.assignee', recName_(dir, rec.assignee_user_id));
  if (plan) add('mt.safety', recBi_(plan, 'safety_note'));
  add('mt.start_at', fmtTimeSrv_(rec.start_at));
  add('mt.end_at', fmtTimeSrv_(rec.end_at));
  if (rec.downtime_start_at || rec.downtime_end_at) {
    var dh = rptHours_(rec.downtime_start_at, rec.downtime_end_at);
    add('rec.downtime', (fmtTimeSrv_(rec.downtime_start_at) || '…') + ' → ' + (fmtTimeSrv_(rec.downtime_end_at) || '…') + (dh !== null ? '  (' + fmtNumSrv_(dh) + ' h)' : ''));
  }
  add('mt.downtime_note', rec.downtime_note);
  if (recHasNum_(rec.operating_hours)) add('mt.hours_at_work', recNum_(rec.operating_hours));
  if (recHasNum_(rec.labor_minutes)) add('mt.labor_minutes', lab_('ap.minutes', { N: recNum_(rec.labor_minutes) }) + '  (' + fmtNumSrv_(Math.round(Number(rec.labor_minutes) / 6) / 10) + ' h)');
  if (rec.overall_result) add('mt.overall_result', lab_('overall_result.' + rec.overall_result));
  add('mt.result_note', recBi_(rec, 'result'));
  if (rec.submitted_at) add('mt.tl.submitted', recWho_(dir, rec.submitted_by, rec.submitted_at));
  if (rec.approved_at) add('mt.tl.accepted', recWho_(dir, rec.approved_by, rec.approved_at));
  if (rec.repair_id) { var rp = findOne_('Repairs', 'repair_id', rec.repair_id); if (rp) add('mt.repair_created', rp.repair_code); }
  if (cost && (rec.labor_cost !== null || rec.other_cost !== null)) { add('cost.labor', fmtMoneySrv_(rec.labor_cost, rec.cost_currency)); add('cost.other', fmtMoneySrv_(rec.other_cost, rec.cost_currency)); }

  var resRows = findAll_('WorkOrderResults', 'work_order_id', rec.work_order_id).filter(function (r) { return !r.archived_at; })
    .sort(function (a, b) { return Number(a.step_no) - Number(b.step_no); });
  var tables = [];
  // Kết quả Đạt / Không đạt tô màu chữ (kèm chữ, không chỉ dựa vào màu); cột Giới hạn = tiêu chuẩn của bước
  if (resRows.length) tables.push({ title: lab_('mt.checklist'), numbered: false,
    head: ['#', lab_('field.name'), lab_('rec.col.limit'), lab_('mt.measured_value'), lab_('col.status'), lab_('field.note')],
    types: ['num', 'text', 'text', 'num', 'text', 'text'],
    rows: resRows.map(function (r) {
      return [String(r.step_no), recBi_(r, 'label'), recRange_(r), recHasNum_(r.measured_value) ? recNum_(r.measured_value) + (r.unit ? ' ' + r.unit : '') : '',
        lab_('check_result.' + (r.result_status || 'PENDING')), recBi_(r, 'note')];
    }),
    cellColor: function (i, c) { var st = resRows[i].result_status; return c === 4 ? (st === 'PASS' ? PDF_C_.good : (st === 'FAIL' ? PDF_C_.bad : null)) : null; } });
  tables.push(recUsageTable_(mats, recUsageLines_('WORK_ORDER', rec.work_order_id)));
  var evs = recPartEvents_(findAll_('EquipmentPartEvents', 'work_id', rec.work_order_id).filter(function (e) { return e.work_type === 'WORK_ORDER'; }));
  if (evs.length) tables.push(recPartTable_(mats, evs));
  return {
    title: ['Phiếu bảo trì', '保养工单'], code: rec.work_order_code, kv: kv, tables: tables, costNote: !cost, formCode: pdfFormCode_('WORK_ORDER'),
    sign: [
      { label: lab_('rec.sign.worker'), name: recName_(dir, rec.assignee_user_id), date: fmtDateVN_(rec.end_at) },
      { label: lab_('rec.sign.acceptor'), name: recName_(dir, rec.approved_by), date: fmtDateVN_(rec.approved_at) },
      { label: lab_('rec.sign.production'), name: '', date: '' }
    ]
  };
}

/* ---------------- Phiếu sửa chữa ---------------- */

function recRepairPdf_(rec, L, cost) {
  var dir = L.users, mats = recMats_();
  var kv = [];
  var add = function (key, val) { if (val !== '' && val !== null && val !== undefined) kv.push([lab_(key), String(val)]); };
  var eq = L.eqs[rec.equipment_id] || {};
  add('col.code', rec.repair_code);
  add('module.equipment', rptEq_(L, rec.equipment_id) + ' · ' + rptEqName_(L, rec.equipment_id));
  add('field.location', rptLoc_(L, eq.location_id));
  if (eq.criticality) add('field.criticality', lab_('criticality.' + eq.criticality));
  if (rec.source_work_order_id) { var wo = findOne_('WorkOrders', 'work_order_id', rec.source_work_order_id); if (wo) add('rp.from_wo', wo.work_order_code); }
  add('rp.reported_by', recName_(dir, rec.reported_by));
  add('rp.symptom', recBi_(rec, 'symptom'));
  add('rp.severity', lab_('severity.' + rec.severity));
  add('col.status', lab_('repair_status.' + rec.status));
  add('rp.ms.stopped_at', rec.stopped_at ? fmtTimeSrv_(rec.stopped_at) : lab_('rp.ms.not_stopped'));
  add('mt.downtime_note', rec.downtime_note);
  add('field.owner', recName_(dir, rec.assignee_user_id));
  [['rp.ms.reported_at', 'reported_at'], ['rp.ms.assigned_at', 'assigned_at'], ['rp.ms.repair_start_at', 'repair_start_at'], ['rp.ms.repair_end_at', 'repair_end_at'], ['rp.ms.restored_at', 'restored_at'], ['rp.ms.approved_at', 'approved_at']]
    .forEach(function (x) { add(x[0], fmtTimeSrv_(rec[x[1]])); });
  var down = rptHours_(rec.stopped_at, rec.restored_at), resp = recMinutes_(rec.reported_at, rec.repair_start_at), fix = rptHours_(rec.repair_start_at, rec.repair_end_at);
  if (down !== null) add('rec.dur.downtime', fmtNumSrv_(down) + ' h');
  if (resp !== null) add('rec.dur.response', lab_('ap.minutes', { N: fmtNumSrv_(resp) }));
  if (fix !== null) add('rec.dur.repair', fmtNumSrv_(fix) + ' h');
  add('rp.diagnosis', recBi_(rec, 'diagnosis'));
  if (rec.root_cause_code) {
    var cause = readRows_('LookupValues').filter(function (x) { return x.group_key === 'CAUSE' && x.code === rec.root_cause_code; })[0];
    add('rp.root_cause', rec.root_cause_code + (cause ? ' · ' + recBi_(cause, 'name') : ''));
  }
  add('rp.action', recBi_(rec, 'action'));
  if (rec.vendor_id) { var v = findOne_('Vendors', 'vendor_id', rec.vendor_id); if (v) add('rp.vendor', [v.vendor_code, v.name].filter(Boolean).join(' · ')); }
  add('rp.outside_service', recBi_(rec, 'outside_service'));
  if (rec.test_run_result) add('rp.test_run', lab_('check_result.' + rec.test_run_result) + (recBi_(rec, 'test_run_note') ? ' — ' + recBi_(rec, 'test_run_note') : ''));
  if (rec.approved_at) add('mt.tl.accepted', (rec.acceptance_result ? lab_('acceptance_result.' + rec.acceptance_result) + ' · ' : '') + recWho_(dir, rec.approved_by, rec.approved_at));
  if (cost && (rec.labor_cost !== null || rec.outside_cost !== null)) { add('cost.labor', fmtMoneySrv_(rec.labor_cost, rec.cost_currency)); add('cost.outside', fmtMoneySrv_(rec.outside_cost, rec.cost_currency)); }

  var tables = [];
  var tasks = findAll_('RepairTasks', 'repair_id', rec.repair_id).filter(function (t) { return !t.archived_at; })
    .sort(function (a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.created_at).localeCompare(String(b.created_at)); });
  if (tasks.length) tables.push({ title: lab_('rp.tasks'), numbered: true,
    head: [lab_('rp.task'), lab_('wk.col.assignee'), lab_('mt.start_at'), lab_('mt.end_at'), lab_('rp.task_result'), lab_('col.status')],
    types: ['text', 'text', 'time', 'time', 'text', 'text'],
    rows: tasks.map(function (t) {
      return [recBi_(t, 'task'), recName_(dir, t.assignee_user_id), fmtTimeSrv_(t.start_at), fmtTimeSrv_(t.end_at), recBi_(t, 'result'), t.status ? lab_('task_status.' + t.status) : ''];
    }) });
  tables.push(recUsageTable_(mats, recUsageLines_('REPAIR', rec.repair_id)));
  var evs = recPartEvents_(findAll_('EquipmentPartEvents', 'work_id', rec.repair_id).filter(function (e) { return e.work_type === 'REPAIR'; }));
  if (evs.length) tables.push(recPartTable_(mats, evs));
  return {
    title: ['Phiếu sửa chữa', '维修单'], code: rec.repair_code, kv: kv, tables: tables, costNote: !cost, formCode: pdfFormCode_('REPAIR'),
    sign: [
      { label: lab_('rec.sign.repairer'), name: recName_(dir, rec.assignee_user_id), date: fmtDateVN_(rec.repair_end_at) },
      { label: lab_('rec.sign.acceptor'), name: recName_(dir, rec.approved_by), date: fmtDateVN_(rec.approved_at) },
      { label: lab_('rec.sign.production'), name: '', date: '' }
    ]
  };
}

/* ---------------- Lý lịch thiết bị ---------------- */

function recEquipmentPdf_(rec, L, ctx) {
  var dir = L.users, mats = recMats_();
  var kv = [];
  var add = function (key, val) { if (val !== '' && val !== null && val !== undefined) kv.push([lab_(key), String(val)]); };
  var id = rec.equipment_id;
  var cat = L.lookups[rec.category_id];
  add('field.equipment_code', rec.equipment_code);
  add('field.name', recBi_(rec, 'name'));
  add('field.category', cat ? recBi_(cat, 'name') : '');
  add('field.location', rptLoc_(L, rec.location_id));
  add('field.manufacturer', rec.manufacturer);
  add('field.model', rec.model);
  add('field.serial', rec.serial);
  add('field.manufacture_year', rec.manufacture_year);
  add('field.install_date', fmtDateVN_(rec.install_date));
  add('field.warranty_end', fmtDateVN_(rec.warranty_end));
  if (rec.vendor_id) { var v = findOne_('Vendors', 'vendor_id', rec.vendor_id); if (v) add('field.vendor', [v.vendor_code, v.name].filter(Boolean).join(' · ')); }
  add('field.status', lab_('equipment_status.' + rec.status));
  if (rec.criticality) add('field.criticality', lab_('criticality.' + rec.criticality));
  add('field.owner', recName_(dir, rec.owner_user_id));

  var tables = [];
  var specs = findAll_('EquipmentSpecs', 'equipment_id', id).filter(function (s) { return !s.archived_at; })
    .sort(function (a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); })
    .map(function (s) { return [recBi_(s, 'label') || s.spec_key, recHasNum_(s.value_num) ? recNum_(s.value_num) : (s.value_text || ''), s.unit || '']; });
  if (specs.length) tables.push({ title: lab_('tab.specs'), head: [lab_('field.name'), lab_('field.spec_value'), lab_('field.unit')], rows: specs, types: ['text', 'text', 'code'] });

  // Kiểm định – hiệu chuẩn (theo yêu cầu kiểm định của máy): chứng nhận đang hiệu lực, ngày kiểm định, hạn tiếp theo
  var insp = readRows_('Inspections');
  var types = {};
  readRows_('InspectionTypes').forEach(function (t) { types[t.inspection_type_id] = t; });
  var reqs = findAll_('InspectionRequirements', 'equipment_id', id).filter(function (r) { return !r.archived_at && r.active !== false; });
  var today = todayVN_();
  if (reqs.length) tables.push({ title: lab_('rec.inspections'), numbered: false,
    head: [lab_('field.inspection_type'), lab_('rec.col.interval'), lab_('field.certificate_number'), lab_('field.inspection_date'), lab_('field.valid_to'), lab_('rec.col.days_left')],
    types: ['text', 'num', 'code', 'date', 'date', 'num'],
    rows: reqs.map(function (r) {
      var t = types[r.inspection_type_id] || {};
      var cur = insp.filter(function (i) { return i.inspection_id === r.current_inspection_id; })[0] || {};
      var dr = daysRemaining_(r.current_due_date, today);
      return [recBi_(t, 'name'), recNum_(t.default_interval_months), cur.certificate_number || '', fmtDateVN_(cur.inspection_date), fmtDateVN_(r.current_due_date), dr === null ? '' : fmtNumSrv_(dr)];
    }) });

  var parts = findAll_('EquipmentParts', 'equipment_id', id).filter(function (x) { return !x.archived_at && !x.removed_at; });
  if (parts.length) tables.push({ title: lab_('rec.parts_installed'), numbered: true,
    head: [lab_('field.material_code'), lab_('field.material'), lab_('field.installed_qty'), lab_('field.unit'), lab_('field.position'), lab_('field.effective_from')],
    types: ['code', 'text', 'num', 'code', 'text', 'date'],
    rows: parts.map(function (x) { var m = mats[x.material_id] || {}; return [m.material_code || '', rptName_(m), recNum_(x.installed_qty), x.unit || m.base_unit || '', recBi_(x, 'position'), fmtDateVN_(x.effective_from)]; }) });

  // Phần B: lịch sử can thiệp, xếp theo ngày (cũ → mới)
  var hist = [];
  var usageBy = {}, evBy = {}, freeEv = [];
  findAll_('MaterialUsageLines', 'equipment_id', id).forEach(function (u) { if (!u.archived_at) (usageBy[u.work_id] = usageBy[u.work_id] || []).push(u); });
  recPartEvents_(findAll_('EquipmentPartEvents', 'equipment_id', id)).forEach(function (e) {
    if (e.work_id) (evBy[e.work_id] = evBy[e.work_id] || []).push(e); else freeEv.push(e);
  });
  var woN = 0, rpN = 0, downSum = 0, lastPm = '';
  var showWo = releasedDot_() >= 2 && can_(ctx, 'maintenance.view', { module: 'maintenance' });
  var showRp = releasedDot_() >= 2 && can_(ctx, 'repair.view', { module: 'repairs' });
  if (showWo) findAll_('WorkOrders', 'equipment_id', id).forEach(function (w) {
    if (w.archived_at || w.status !== 'COMPLETED') return;
    var at = w.end_at || w.approved_at || w.due_date;
    woN++;
    if (String(at).slice(0, 10) > lastPm) lastPm = String(at).slice(0, 10);
    var dh = rptHours_(w.downtime_start_at, w.downtime_end_at);
    hist.push({ at: at, row: [fmtDateVN_(at), lab_(w.plan_id ? 'rec.kind.pm' : 'rec.kind.wo'), w.work_order_code, recBi_(w, 'title') + (recBi_(w, 'result') ? '\n' + recBi_(w, 'result') : ''),
      recPartsShort_(mats, usageBy[w.work_order_id] || [], evBy[w.work_order_id] || []), dh === null ? '' : fmtNumSrv_(dh), recNum_(w.operating_hours),
      recName_(dir, w.assignee_user_id), recName_(dir, w.approved_by), w.overall_result ? lab_('overall_result.' + w.overall_result) : ''] });
  });
  if (showRp) findAll_('Repairs', 'equipment_id', id).forEach(function (r) {
    if (r.archived_at || r.status !== 'COMPLETED') return;
    var at = r.restored_at || r.repair_end_at || r.approved_at || r.reported_at;
    var dh = rptHours_(r.stopped_at, r.restored_at);
    rpN++;
    if (dh !== null) downSum += dh;
    hist.push({ at: at, row: [fmtDateVN_(at), lab_('rec.kind.repair'), r.repair_code, recBi_(r, 'symptom') + (recBi_(r, 'action') ? '\n→ ' + recBi_(r, 'action') : ''),
      recPartsShort_(mats, usageBy[r.repair_id] || [], evBy[r.repair_id] || []), dh === null ? '' : fmtNumSrv_(dh), '',
      recName_(dir, r.assignee_user_id), recName_(dir, r.approved_by), r.acceptance_result ? lab_('acceptance_result.' + r.acceptance_result) : (r.test_run_result ? lab_('check_result.' + r.test_run_result) : '')] });
  });
  var reqIds = {};
  reqs.forEach(function (r) { reqIds[r.requirement_id] = r; });
  findAll_('InspectionRequirements', 'equipment_id', id).forEach(function (r) { reqIds[r.requirement_id] = r; });
  var vendors = {};
  readRows_('Vendors').forEach(function (v) { vendors[v.vendor_id] = v.name || v.vendor_code; });
  insp.forEach(function (i) {
    var r = reqIds[i.requirement_id];
    if (!r || i.archived_at || ['APPROVED', 'SUPERSEDED', 'REVOKED'].indexOf(i.status) < 0 || !i.inspection_date) return;
    var t = types[r.inspection_type_id] || {};
    hist.push({ at: i.inspection_date, row: [fmtDateVN_(i.inspection_date), lab_('rec.kind.inspection'), i.certificate_number || i.inspection_code,
      recBi_(t, 'name') + (i.valid_to || i.next_due_date ? '\n' + lab_('field.valid_to') + ': ' + fmtDateVN_(i.valid_to || i.next_due_date) : ''), '', '', '',
      vendors[i.vendor_id] || '', recName_(dir, i.approved_by), i.result ? lab_('inspection_result.' + i.result) : ''] });
  });
  var ces = {};
  findAll_('ContractEquipment', 'equipment_id', id).forEach(function (x) { ces[x.contract_equipment_id] = x; });
  if (Object.keys(ces).length) {
    var cons = {};
    readRows_('Contracts').forEach(function (c) { cons[c.contract_id] = c; });
    readRows_('ContractServices').forEach(function (s) {
      var ce = ces[s.contract_equipment_id];
      if (!ce || s.archived_at || !s.performed_at) return;
      var c = cons[s.contract_id] || {};
      hist.push({ at: s.performed_at, row: [fmtDateVN_(s.performed_at), lab_('rec.kind.service'), c.contract_code || '',
        recBi_(ce, 'service') + (recBi_(s, 'result') ? '\n' + recBi_(s, 'result') : ''), '', '', '', vendors[c.vendor_id] || '', recName_(dir, s.accepted_by),
        s.status ? lab_('service_status.' + s.status) : ''] });
    });
  }
  freeEv.forEach(function (e) {
    hist.push({ at: e.occurred_at, row: [fmtDateVN_(e.occurred_at), lab_('rec.kind.part'), '', recPartsShort_(mats, [], [e]) + (recBi_(e, 'note') ? '\n' + recBi_(e, 'note') : ''),
      '', '', '', recName_(dir, e.actor_user_id), '', ''] });
  });
  hist.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  var total = hist.length;
  if (total > REC_PDF_HISTORY_MAX_) hist = hist.slice(total - REC_PDF_HISTORY_MAX_);
  tables.push({ title: lab_('rec.history'), numbered: true, fontSize: 7, empty: lab_('rec.no_history'),
    head: [lab_('field.date'), lab_('rec.col.kind'), lab_('rec.col.ref'), lab_('rec.col.work'), lab_('rec.col.parts'), lab_('rec.col.down_h'), lab_('rec.col.run_h'),
      lab_('rec.col.doer'), lab_('rec.col.confirmer'), lab_('field.result')],
    types: ['date', 'text', 'code', 'text', 'text', 'num', 'num', 'text', 'text', 'text'],
    rows: hist.map(function (h) { return h.row; }),
    note: total > REC_PDF_HISTORY_MAX_ ? lab_('rec.history_truncated', { N: REC_PDF_HISTORY_MAX_, T: total }) : '' });

  var tiles = [];
  if (showWo) tiles.push({ label: lab_('rec.tile.pm'), value: fmtNumSrv_(woN) }, { label: lab_('rec.tile.last_pm'), value: lastPm ? fmtDateVN_(lastPm) : '—' });
  if (showRp) tiles.push({ label: lab_('rec.tile.repairs'), value: fmtNumSrv_(rpN) }, { label: lab_('rec.tile.downtime'), value: fmtNumSrv_(Math.round(downSum * 10) / 10) + ' h' });
  return {
    title: ['Lý lịch thiết bị', '设备履历'], code: rec.equipment_code, kv: kv, kvTitle: lab_('rec.part_a'), tables: tables, tiles: tiles, wide: true,
    formCode: pdfFormCode_('EQUIPMENT'), notes: [lab_('rec.history_note')]
  };
}
