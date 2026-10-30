/* 38_annual_plan: Kế hoạch bảo trì năm — chốt, gửi duyệt, duyệt (d4.18, Bước 3 — người dùng yêu cầu 29/10/2026).
 * Mỗi năm nhiều lần ban hành (01, 02…): nháp (DRAFT) → gửi duyệt (SUBMITTED) → đã duyệt (APPROVED, mã KHN-<năm>-<lần>); duyệt lần
 * mới thì lần cũ thành SUPERSEDED; trả lại (RETURNED, có lý do) để sửa và gửi lại; hủy bản chưa duyệt (CANCELLED). Mỗi năm chỉ một
 * bản đang mở. Lần ban hành ≥ 2 phải có lý do điều chỉnh. Không tự duyệt: người tạo, người lập (lưu bản chụp), người gửi (4.6).
 * Bản chụp = lịch dự kiến app tính lúc chốt (cùng quy tắc tab Kế hoạch năm): nhóm theo loại → dòng (máy × kế hoạch/kiểm định/dịch vụ
 * HĐ) → ngày dự kiến + ngày ước tính theo giờ chạy; lưu tệp JSON riêng tư (Documents kind REPORT_FILE, quyền xem module Bảo trì).
 * % thực hiện so với bản đã duyệt tính trên máy (app tải bản chụp bằng annual_plan.view). PDF A4 ngang có logo công ty, mã biểu mẫu
 * (Settings annual_plan_form_code), bảng tổng hợp theo loại, chi tiết theo máy, khối Người lập / Người duyệt. */

var ANNUAL_ROW_MAX_ = 3000;
var ANNUAL_DATES_MAX_ = 400;
var ANNUAL_PDF_ROW_MAX_ = 500;
var ANNUAL_KINDS_ = { PLAN: 1, HOURS: 1, INSPECTION: 1, SERVICE: 1 };
var ANNUAL_OPEN_ = { DRAFT: 1, SUBMITTED: 1, RETURNED: 1 };

function annualPad2_(n) { return (Number(n) < 10 ? '0' : '') + Number(n); }
function annualStr_(v, max) { return String(v === null || v === undefined ? '' : v).slice(0, max || 200); }

/**
 * Làm sạch bản chụp app gửi: chỉ giữ trường đã biết, ngày đúng dạng và thuộc năm, bỏ trùng; sai khuôn → SNAPSHOT_INVALID.
 * Trả {snap, summary, planned, rows}.
 */
function annualSnapshotClean_(raw, year) {
  var bad = function () { throw validationError_([fieldError_('snapshot', 'SNAPSHOT_INVALID')]); };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups) || Number(raw.year) !== year) bad();
  var y = String(year);
  var dates = function (list) {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list) || list.length > ANNUAL_DATES_MAX_) bad();
    var seen = {};
    return list.filter(function (d) {
      var s = String(d);
      if (!isDateStr_(s) || s.slice(0, 4) !== y || seen[s]) return false;
      seen[s] = true;
      return true;
    }).sort();
  };
  var nRows = 0, planned = 0;
  var summary = [];
  var groups = raw.groups.map(function (g) {
    if (!g || typeof g !== 'object' || !Array.isArray(g.rows)) bad();
    var months = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], est = 0, gPlanned = 0, machines = {};
    var rows = g.rows.map(function (r) {
      if (!r || typeof r !== 'object' || !ANNUAL_KINDS_[r.kind] || !isUuidV4_(r.equipment_id)) bad();
      if (++nRows > ANNUAL_ROW_MAX_) bad();
      var ds = dates(r.dates), es = dates(r.est);
      ds.forEach(function (d) { months[Number(d.slice(5, 7)) - 1]++; });
      gPlanned += ds.length; est += es.length;
      machines[r.equipment_id] = true;
      var out0 = {
        kind: r.kind, ref_id: isUuidV4_(r.ref_id) ? r.ref_id : '', equipment_id: r.equipment_id,
        equipment_code: annualStr_(r.equipment_code, 40), equipment_vi: annualStr_(r.equipment_vi), equipment_zh: annualStr_(r.equipment_zh),
        title_vi: annualStr_(r.title_vi), title_zh: annualStr_(r.title_zh), code: annualStr_(r.code, 40), cycle: annualStr_(r.cycle, 120),
        dates: ds, est: es
      };
      // d4.19: nội dung cho phần "việc từng tháng" của PDF (bước checklist, lưu ý an toàn, người làm, thời gian) — có thì giữ, gọn lại
      if (Array.isArray(r.steps)) {
        out0.steps = r.steps.slice(0, 40).map(function (t) { return annualStr_(t, 160); });
        out0.safety = annualStr_(r.safety, 500);
        out0.assignee = annualStr_(r.assignee, 80);
        out0.minutes = Number(r.minutes) >= 0 && r.minutes !== '' && r.minutes !== null ? Number(r.minutes) : null;
      }
      return out0;
    });
    planned += gPlanned;
    var out = { key: isUuidV4_(g.key) ? g.key : '', name_vi: annualStr_(g.name_vi), name_zh: annualStr_(g.name_zh), machines: Object.keys(machines).length, rows: rows };
    summary.push({ key: out.key, name_vi: out.name_vi, name_zh: out.name_zh, machines: out.machines, rows: rows.length, planned: gPlanned, est: est, months: months });
    return out;
  });
  return { snap: { year: year, groups: groups }, summary: summary, planned: planned, rows: nRows };
}

function annualPlanOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('annual_plan_id', 'ID_INVALID')]);
  var rec = findOne_('AnnualPlans', 'annual_plan_id', id);
  if (!rec || rec.archived_at) throw apiError_('NOT_FOUND');
  return rec;
}

/** Bản chụp đã lưu của một lần ban hành (tệp JSON riêng tư) */
function annualSnapshot_(rec) {
  var d = rec.file_document_id ? findOne_('Documents', 'document_id', rec.file_document_id) : null;
  if (!d || !d.drive_file_id) throw apiError_('NOT_FOUND');
  return JSON.parse(DriveApp.getFileById(d.drive_file_id).getBlob().getDataAsString('UTF-8'));
}

/** Lần ban hành kế tiếp của năm = số lần đã duyệt (kể cả đã bị thay) + 1 */
function annualNextRevision_(rows, year) {
  return rows.filter(function (r) { return Number(r.year) === year && !r.archived_at && (r.status === 'APPROVED' || r.status === 'SUPERSEDED'); }).length + 1;
}

/**
 * annual_plan.save {annual_plan_id, year, snapshot, change_reason_vi/zh?}: tạo bản nháp (id mới) hoặc thay bản chụp của bản nháp /
 * bản bị trả lại (expected_version = record_version). Bản bị trả lại lưu lại thành nháp.
 */
function annualPlanSave_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.annual_plan_id)) throw validationError_([fieldError_('annual_plan_id', 'ID_INVALID')]);
  var year = Number(p.year);
  if (!(year >= 2000 && year <= 2100 && Math.floor(year) === year)) throw validationError_([fieldError_('year', 'INVALID_VALUE')]);
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  var cur0 = findOne_('AnnualPlans', 'annual_plan_id', p.annual_plan_id);
  if (cur0 && Number(cur0.year) !== year) throw validationError_([fieldError_('year', 'INVALID_VALUE')]);
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) throw validationError_([fieldError_('expected_version', 'INVALID_VALUE')]);
  var clean = annualSnapshotClean_(p.snapshot, year);
  if (!clean.rows) throw validationError_([fieldError_('snapshot', 'SNAPSHOT_EMPTY')]);
  var hasReason = p.change_reason_vi !== undefined || p.change_reason_zh !== undefined;
  var tr = hasReason ? applyTranslations_('AnnualPlans', ['change_reason'], p, cur0) : null;
  var json = JSON.stringify(clean.snap);
  if (json.length > REPORT_SNAPSHOT_MAX_) throw validationError_([fieldError_('snapshot', 'REPORT_TOO_LARGE')]);
  // Drive: ngoài khóa ghi (3.15); tệp cũ của bản nháp bỏ vào thùng rác sau khi ghi xong
  var folder = appFolder_();
  var file = folder.createFile(Utilities.newBlob(json, 'application/json', 'KHN_' + year + '_' + uuid_() + '.json'));
  var oldFileId = null;
  var res;
  try {
    res = executeWrite_(ctx, {
      entity_type: 'ANNUAL_PLAN', entity_id: p.annual_plan_id,
      build: function () {
        var all = readRows_('AnnualPlans');
        var cur = all.filter(function (r) { return r.annual_plan_id === p.annual_plan_id; })[0] || null;
        if (cur) {
          assertVersion_(ctx, cur, 'ANNUAL_PLAN', 'AnnualPlans');
          if (cur.status !== 'DRAFT' && cur.status !== 'RETURNED') throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
        } else if (all.some(function (r) { return Number(r.year) === year && !r.archived_at && ANNUAL_OPEN_[r.status]; })) {
          throw validationError_([fieldError_('year', 'ANNUAL_PLAN_OPEN')]);
        }
        var nowIso = isoVN_(now_());
        var writes = [];
        var row, before = null, doc;
        if (cur) {
          before = { status: cur.status, planned_count: cur.planned_count, row_count: cur.row_count };
          row = clone_(cur); delete row.__row;
          doc = row.file_document_id ? findOne_('Documents', 'document_id', row.file_document_id) : null;
        } else {
          row = { annual_plan_id: p.annual_plan_id, annual_plan_code: '', year: year, revision: annualNextRevision_(all, year), status: 'DRAFT',
            submitted_by: '', submitted_at: '', approved_by: '', approved_at: '', returned_by: '', returned_at: '', return_reason: '',
            cancel_reason: '', cancelled_at: '', change_reason_vi: '', change_reason_zh: '', i18n_meta: {} };
        }
        if (doc) {
          oldFileId = doc.drive_file_id;
          var d2 = clone_(doc); delete d2.__row;
          d2.drive_file_id = file.getId(); d2.size_bytes = json.length; d2.file_version = Number(d2.file_version || 1) + 1; d2.document_date = nowIso.slice(0, 10);
          cUpdate_(ctx, d2);
          writes.push({ sheet: 'Documents', mode: 'update', row: d2 });
        } else {
          var docId = uuid_();
          writes.push({ sheet: 'Documents', mode: 'insert', row: cNew_(ctx, {
            document_id: docId, entity_type: 'ANNUAL_PLAN', entity_id: p.annual_plan_id, title_vi: 'Kế hoạch bảo trì năm ' + year, title_zh: year + '年度维护计划',
            kind: 'REPORT_FILE', drive_file_id: file.getId(), external_url: '', mime_type: 'application/json', file_version: 1, access_scope: 'MODULE_VIEW',
            document_date: nowIso.slice(0, 10), active: true, managed_folder_id: folder.getId(), storage_kind: 'DRIVE', owned_by_app: true,
            drive_sharing_state: 'NOT_SHARED', sharing_updated_at: '', sharing_error_code: '', size_bytes: json.length, thumb_drive_file_id: '', i18n_meta: {}
          }) });
          row.file_document_id = docId;
        }
        row.status = 'DRAFT';
        row.prepared_by = ctx.user.user_id; row.prepared_at = nowIso;
        row.planned_count = clean.planned; row.row_count = clean.rows; row.summary_json = clean.summary;
        if (tr) { row.change_reason_vi = tr.values.change_reason_vi; row.change_reason_zh = tr.values.change_reason_zh; row.i18n_meta = tr.meta; }
        if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
        writes.push({ sheet: 'AnnualPlans', mode: cur ? 'update' : 'insert', row: row });
        return {
          writes: writes,
          result: { entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, record_version: row.record_version, record: projectRow_(ctx, row, 'AnnualPlans') },
          record_version: row.record_version,
          audit: { entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, before_json: before,
            after_json: { year: year, revision: row.revision, status: row.status, planned_count: row.planned_count, row_count: row.row_count } }
        };
      }
    });
  } catch (e) {
    trashQuietly_(file);
    throw e;
  }
  if (res.code === 'DUPLICATE_OPERATION') trashQuietly_(file);
  else if (oldFileId) { try { trashQuietly_(DriveApp.getFileById(oldFileId)); } catch (e2) { /* bỏ qua */ } }
  return res;
}

/** annual_plan.submit {annual_plan_id, change_reason_vi/zh?}: nháp / bị trả lại → chờ duyệt; lần ≥ 2 phải có lý do điều chỉnh */
function annualPlanSubmit_(ctx) {
  var p = ctx.req.payload || {};
  var cur0 = annualPlanOrThrow_(p.annual_plan_id);
  var hasReason = p.change_reason_vi !== undefined || p.change_reason_zh !== undefined;
  var tr = hasReason ? applyTranslations_('AnnualPlans', ['change_reason'], p, cur0) : null;
  return executeWrite_(ctx, {
    entity_type: 'ANNUAL_PLAN', entity_id: p.annual_plan_id,
    build: function () {
      var cur = annualPlanOrThrow_(p.annual_plan_id);
      assertVersion_(ctx, cur, 'ANNUAL_PLAN', 'AnnualPlans');
      if (cur.status !== 'DRAFT' && cur.status !== 'RETURNED') throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
      var row = clone_(cur); delete row.__row;
      if (tr) { row.change_reason_vi = tr.values.change_reason_vi; row.change_reason_zh = tr.values.change_reason_zh; row.i18n_meta = tr.meta; }
      if (Number(row.revision) > 1 && !trimStr_(row.change_reason_vi) && !trimStr_(row.change_reason_zh)) throw validationError_([fieldError_('change_reason', 'REQUIRED')]);
      row.status = 'SUBMITTED';
      row.submitted_by = ctx.user.user_id; row.submitted_at = isoVN_(now_());
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'AnnualPlans', mode: 'update', row: row }],
        result: { entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'AnnualPlans') },
        record_version: row.record_version,
        audit: { entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, before_json: { status: cur.status }, after_json: { status: row.status, year: row.year, revision: row.revision } }
      };
    }
  });
}

/**
 * annual_plan.approve {annual_plan_id, decision: APPROVE | RETURN, reason}: C3/C4 + PIN, không tự duyệt (người tạo, người lập,
 * người gửi). Duyệt: cấp mã KHN-<năm>-<lần>, lần đã duyệt trước của năm → SUPERSEDED. Trả lại: bắt lý do.
 */
function annualPlanApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.annual_plan_id)) errs.push(fieldError_('annual_plan_id', 'ID_INVALID'));
  if (['APPROVE', 'RETURN'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'RETURN' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'ANNUAL_PLAN', entity_id: p.annual_plan_id,
    build: function () {
      var all = readRows_('AnnualPlans');
      var cur = all.filter(function (r) { return r.annual_plan_id === p.annual_plan_id && !r.archived_at; })[0];
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'annual_plan.approve', [cur.created_by, cur.prepared_by, cur.submitted_by]);
      assertVersion_(ctx, cur, 'ANNUAL_PLAN', 'AnnualPlans');
      if (cur.status !== 'SUBMITTED') throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
      var nowIso = isoVN_(now_());
      var row = clone_(cur); delete row.__row;
      var writes = [];
      if (p.decision === 'RETURN') {
        row.status = 'RETURNED';
        row.return_reason = annualStr_(trimStr_(p.reason), 500);
        row.returned_by = ctx.user.user_id; row.returned_at = nowIso;
      } else {
        row.revision = annualNextRevision_(all, Number(cur.year));
        row.annual_plan_code = 'KHN-' + cur.year + '-' + annualPad2_(row.revision);
        row.status = 'APPROVED';
        row.approved_by = ctx.user.user_id; row.approved_at = nowIso;
        all.forEach(function (r) {
          if (r.annual_plan_id === cur.annual_plan_id || r.archived_at || Number(r.year) !== Number(cur.year) || r.status !== 'APPROVED') return;
          var old = clone_(r); delete old.__row;
          old.status = 'SUPERSEDED';
          cUpdate_(ctx, old);
          writes.push({ sheet: 'AnnualPlans', mode: 'update', row: old });
        });
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'AnnualPlans', mode: 'update', row: row });
      return {
        writes: writes,
        result: { entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, status: row.status, display_code: row.annual_plan_code, record_version: row.record_version, record: projectRow_(ctx, row, 'AnnualPlans') },
        record_version: row.record_version,
        audit: {
          entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, before_json: { status: cur.status },
          after_json: { status: row.status, code: row.annual_plan_code, year: row.year, revision: row.revision },
          reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined
        }
      };
    }
  });
}

/** annual_plan.cancel {annual_plan_id, reason}: hủy bản chưa duyệt (nháp, chờ duyệt, bị trả lại) */
function annualPlanCancel_(ctx) {
  var p = ctx.req.payload || {};
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  return executeWrite_(ctx, {
    entity_type: 'ANNUAL_PLAN', entity_id: p.annual_plan_id,
    build: function () {
      var cur = annualPlanOrThrow_(p.annual_plan_id);
      assertVersion_(ctx, cur, 'ANNUAL_PLAN', 'AnnualPlans');
      if (!ANNUAL_OPEN_[cur.status]) throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
      var row = clone_(cur); delete row.__row;
      row.status = 'CANCELLED';
      row.cancel_reason = annualStr_(trimStr_(p.reason), 500); row.cancelled_at = isoVN_(now_());
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'AnnualPlans', mode: 'update', row: row }],
        result: { entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'AnnualPlans') },
        record_version: row.record_version,
        audit: { entity_type: 'ANNUAL_PLAN', entity_id: row.annual_plan_id, before_json: { status: cur.status }, after_json: { status: row.status }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/** annual_plan.view {annual_plan_id}: hồ sơ + bản chụp lịch dự kiến + mã biểu mẫu */
function annualPlanView_(ctx) {
  var p = ctx.req.payload || {};
  var rec = annualPlanOrThrow_(p.annual_plan_id);
  return { plan: projectRow_(ctx, rec, 'AnnualPlans'), snapshot: annualSnapshot_(rec), form_code: String(setting_('annual_plan_form_code') || ''), logo_rev: reportLogoRev_() };
}

/* ---------------- PDF ---------------- */

/** Số lần cả năm: "4", "4 + ≈2", chỉ ước tính → "≈3" */
function annualCount_(n, e) { return n || !e ? String(n) + (e ? ' + ≈' + e : '') : '≈' + e; }

/** Ký hiệu theo loại việc (luôn kèm chú giải): bảo trì ●, kiểm định ◆, dịch vụ nhà thầu ■, ước tính theo giờ chạy ◌ */
var ANNUAL_SYM_ = { PLAN: '●', HOURS: '●', INSPECTION: '◆', SERVICE: '■', EST: '◌' };
var ANNUAL_SYM_COLOR_ = { PLAN: '#17324F', HOURS: '#17324F', INSPECTION: '#3A6EA5', SERVICE: '#4F7D6B', EST: '#5B6875' };

/** Ô tháng của bảng tổng quan: "●05", "●05 ●20", nhiều hơn 2 lần → "●×4"; ước tính "◌14" */
function annualDotCell_(r, m) {
  var mm = annualPad2_(m + 1);
  var a = r.dates.filter(function (d) { return d.slice(5, 7) === mm; }).map(function (d) { return d.slice(8, 10); });
  var b = r.est.filter(function (d) { return d.slice(5, 7) === mm; }).map(function (d) { return d.slice(8, 10); });
  var sym = ANNUAL_SYM_[r.kind] || '●';
  var part = function (list, sy) { return list.length > 2 ? sy + '×' + list.length : list.map(function (d) { return sy + d; }).join(' '); };
  return [part(a, sym), part(b, ANNUAL_SYM_.EST)].filter(Boolean).join(' ');
}

function annualBi_(vi, zh) { return [vi, zh].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' · '); }

/**
 * Nội dung từng dòng cho phần "việc từng tháng": bước checklist (kèm giới hạn đo), lưu ý an toàn, người làm, thời gian dự kiến.
 * Bản chụp mới (d4.19) đã có sẵn; bản chụp cũ → tra kế hoạch / yêu cầu kiểm định / dịch vụ hiện tại trên máy chủ.
 */
function annualDetailer_() {
  var cache = null;
  var load = function () {
    if (cache) return cache;
    cache = { plans: {}, reqs: {}, types: {}, ces: {}, checklist: readRows_('ChecklistTemplates'), dir: userDirectory_() };
    readRows_('MaintenancePlans').forEach(function (x) { cache.plans[x.plan_id] = x; });
    readRows_('InspectionRequirements').forEach(function (x) { cache.reqs[x.requirement_id] = x; });
    readRows_('InspectionTypes').forEach(function (x) { cache.types[x.inspection_type_id] = x; });
    readRows_('ContractEquipment').forEach(function (x) { cache.ces[x.contract_equipment_id] = x; });
    return cache;
  };
  var rangeText = function (it) {
    var has = function (v) { return v !== '' && v !== null && v !== undefined; };
    var u = it.unit ? ' ' + it.unit : '';
    if (has(it.min_value) && has(it.max_value)) return ' (' + it.min_value + '–' + it.max_value + u + ')';
    if (has(it.min_value)) return ' (≥ ' + it.min_value + u + ')';
    if (has(it.max_value)) return ' (≤ ' + it.max_value + u + ')';
    return u ? ' (' + it.unit + ')' : '';
  };
  return function (r) {
    if (r.steps !== undefined) return { steps: r.steps || [], safety: r.safety || '', assignee: r.assignee || '', minutes: r.minutes };
    var c = load();
    if (r.kind === 'PLAN' || r.kind === 'HOURS') {
      var pl = c.plans[r.ref_id];
      if (!pl) return { steps: [], safety: '', assignee: '', minutes: null };
      var cl = pl.checklist_template_id ? latestChecklist_(pl.checklist_template_id, c.checklist) : { items: [] };
      return {
        steps: cl.items.map(function (it) { return annualBi_(it.label_vi, it.label_zh) + rangeText(it); }),
        safety: annualBi_(pl.safety_note_vi, pl.safety_note_zh), assignee: pl.assignee_user_id && c.dir[pl.assignee_user_id] ? c.dir[pl.assignee_user_id].display_name : '',
        minutes: pl.estimated_minutes
      };
    }
    if (r.kind === 'INSPECTION') {
      var rq = c.reqs[r.ref_id], ty = rq ? c.types[rq.inspection_type_id] : null;
      var docs = ty ? annualBi_(ty.required_docs_vi, ty.required_docs_zh) : '';
      return { steps: docs ? [docs] : [], safety: '', assignee: '', minutes: null };
    }
    var ce = c.ces[r.ref_id];
    return { steps: ce && (ce.service_vi || ce.service_zh) ? [annualBi_(ce.service_vi, ce.service_zh)] : [], safety: '', assignee: '', minutes: null };
  };
}

/**
 * Phiếu bảo trì thật của từng lần trong lịch tháng (d4.21): ghép theo kế hoạch + ngày hạn, không có thì phiếu cùng tháng chưa ghép
 * (phiếu đã đổi hạn → "Dời sang"). Trả hàm (entry) → {wo, parts (vật tư đề nghị), down (giờ dừng máy), moved}; lần chưa có phiếu → ô trống/☐.
 */
function annualActualer_() {
  var cache = null, used = {};
  var load = function () {
    if (cache) return cache;
    cache = { byPlan: {}, lines: {}, mats: {} };
    readRows_('WorkOrders').forEach(function (w) { if (!w.archived_at && w.plan_id) (cache.byPlan[w.plan_id] = cache.byPlan[w.plan_id] || []).push(w); });
    if (releasedDot_() >= 2) {
      readRows_('MaterialRequestLines').forEach(function (l) {
        if (l.archived_at || l.work_type !== 'WORK_ORDER' || l.status === 'CANCELLED' || l.status === 'REJECTED') return;
        (cache.lines[l.work_id] = cache.lines[l.work_id] || []).push(l);
      });
      readRows_('Materials').forEach(function (m) { cache.mats[m.material_id] = m; });
    }
    return cache;
  };
  var hm = function (iso) { var t = parseTime_(iso); return t ? isoVN_(t).slice(11, 16) : ''; };
  var dm = function (d) { return String(d).slice(8, 10) + '/' + String(d).slice(5, 7); };
  return function (x) {
    var out = { wo: '☐', parts: '', down: '', moved: '' };
    var r = x.row;
    if (r.kind !== 'PLAN' && r.kind !== 'HOURS') return out;
    var list = load().byPlan[r.ref_id] || [];
    var w = list.filter(function (o) { return !used[o.work_order_id] && o.due_date === x.date; })[0];
    if (!w) w = list.filter(function (o) { return !used[o.work_order_id] && String(o.due_date).slice(0, 7) === x.date.slice(0, 7); })[0];
    if (!w) return out;
    used[w.work_order_id] = true;
    var done = w.status === 'COMPLETED';
    out.wo = w.work_order_code + '\n' + (done ? '✓ ' + dm(String(w.end_at || w.approved_at || w.due_date).slice(0, 10)) : (w.status === 'CANCELLED' ? lab_('wo_status.CANCELLED') : '☐'));
    out.parts = (cache.lines[w.work_order_id] || []).map(function (l) {
      var m = cache.mats[l.material_id] || {};
      var q = l.approved_qty !== '' && l.approved_qty !== null && l.approved_qty !== undefined ? l.approved_qty : l.requested_qty;
      return rptName_(m) + ' × ' + fmtNumSrv_(Number(q)) + (l.unit ? ' ' + l.unit : '');
    }).join('\n');
    if (w.downtime_start_at || w.downtime_end_at) out.down = (hm(w.downtime_start_at) || '…') + '–' + (hm(w.downtime_end_at) || '…');
    if (!x.est && w.due_date && w.due_date !== x.date) out.moved = '→ ' + dm(w.due_date);
    if (w.status === 'CANCELLED' && w.cancel_reason) out.moved = [out.moved, w.cancel_reason].filter(Boolean).join('\n');
    return out;
  };
}

/** Các lần trong tháng m (0–11) của cả năm: [{date, est, row}] xếp theo ngày, mã máy */
function annualMonthEntries_(snap, m) {
  var mm = annualPad2_(m + 1), out = [];
  (snap.groups || []).forEach(function (g) {
    g.rows.forEach(function (r) {
      r.dates.forEach(function (d) { if (d.slice(5, 7) === mm) out.push({ date: d, est: false, row: r }); });
      r.est.forEach(function (d) { if (d.slice(5, 7) === mm) out.push({ date: d, est: true, row: r }); });
    });
  });
  return out.sort(function (a, b) { return a.date.localeCompare(b.date) || String(a.row.equipment_code).localeCompare(String(b.row.equipment_code)); });
}

/** Khối ký hai cột: Người lập, Người duyệt — tên và ngày từ app, chừa chỗ ký tay */
function annualSign_(pd, prep, appr) {
  pdfPara_(pd.body.appendParagraph(''), { before: 14 });
  var hint = lab_('rpt.sign_hint');
  var t = pdfPlain_(pd.body.appendTable([
    [lab_('rpt.prepared_by'), lab_('rpt.approved_by')],
    [hint, hint],
    ['\n\n\n', '\n\n\n'],
    [prep.name || '', appr.name || ''],
    [prep.date ? lab_('ap.date') + ': ' + prep.date : '', appr.date ? lab_('ap.date') + ': ' + appr.date : '']
  ]));
  var half = Math.floor(pd.width / 2);
  t.setColumnWidth(0, half).setColumnWidth(1, pd.width - half);
  pdfText_(t, 9, PDF_C_.ink);
  pdfText_(t.getRow(0), 9, PDF_C_.navy, true);
  pdfText_(t.getRow(1), 7, PDF_C_.muted, false, true);
  pdfText_(t.getRow(3), 9, PDF_C_.ink, true);
  pdfText_(t.getRow(4), 8, PDF_C_.muted, false);
  for (var r = 0; r < 5; r++) for (var c = 0; c < 2; c++) { pdfCellPad_(t.getRow(r).getCell(c), 1, 4); pdfCellAlign_(t.getRow(r).getCell(c), 'CENTER'); }
  return t;
}

var ANNUAL_PARTS_ = { ALL: 1, OVERVIEW: 1, MONTH: 1 };
var ANNUAL_PDF_ENTRY_MAX_ = 1500;
var ANNUAL_STEPS_PDF_ = 8;

/**
 * Dựng PDF một lần ban hành: phần 1 Tổng quan năm (mỗi dòng một máy × một việc, ô tháng là chấm + ngày, dòng loại đếm số việc,
 * khối ký), phần 2 Việc từng tháng (mỗi tháng một trang: ngày, máy, việc, nội dung chính từ checklist + lưu ý an toàn, người làm,
 * thời gian, ô Đã làm / Ký). opts = {part: ALL | OVERVIEW | MONTH, month: 1–12}.
 */
function annualPdf_(rec, snap, opts) {
  opts = opts || {};
  var part = opts.part || 'ALL';
  var dir = userDirectory_();
  var nameOf = function (id) { return id && dir[id] ? dir[id].display_name : ''; };
  var year = Number(rec.year);
  var tp = LABELS['yr.title'] || ['Kế hoạch bảo trì năm {Y}', '{Y}年度维护计划'];
  var titleVi = tp[0].split('{Y}').join(year), titleZh = tp[1].split('{Y}').join(year);
  var gen = fmtTimeSrv_(isoVN_(now_()));
  var approved = rec.status === 'APPROVED' || rec.status === 'SUPERSEDED';
  // In một tháng = lịch bảo trì tháng (mã biểu mẫu riêng, d4.21); cả năm / tổng quan = mã kế hoạch năm
  var formCode = part === 'MONTH' ? pdfFormCode_('ANNUAL_MONTH') : String(setting_('annual_plan_form_code') || '');
  var footer = [titleVi, approved ? lab_('ap.number') + ': ' + rec.annual_plan_code : lab_('ap.status.' + rec.status), formCode, lab_('rpt.generated_at') + ': ' + gen]
    .filter(Boolean).join('   ·   ');
  var groups = snap.groups || [];
  var gname = function (g) { return annualBi_(g.name_vi, g.name_zh) || lab_('yr.uncategorized'); };
  var monthHead = [];
  for (var m = 0; m < 12; m++) monthHead.push('T' + (m + 1) + '\n' + (m + 1) + '月');
  var pd = pdfStart_({ wide: true, footer: footer });
  try {
    if (part === 'MONTH') {
      var mt = LABELS['ap.month_doc_title'] || ['Việc bảo trì tháng {M}/{Y}', '{Y}年{M}月保养工作'];
      pdfTitle_(pd, mt[0].split('{M}').join(opts.month).split('{Y}').join(year), mt[1].split('{M}').join(opts.month).split('{Y}').join(year));
    } else {
      pdfTitle_(pd, titleVi, titleZh);
    }
    if (!approved) pdfPara_(pd.body.appendParagraph(lab_('ap.not_approved')), { align: 'CENTER', after: 6, text: true, size: 10, color: PDF_C_.bad, bold: true });
    var left = [[lab_('ap.year'), String(year)], [lab_('ap.revision'), annualPad2_(rec.revision)]];
    var reason = annualBi_(rec.change_reason_vi, rec.change_reason_zh);
    if (reason) left.push([lab_('ap.change_reason'), reason]);
    var right = [];
    if (formCode) right.push([lab_('ap.form_code'), formCode]);
    right.push([lab_('ap.number'), approved ? rec.annual_plan_code : '—']);
    right.push([lab_('col.status'), lab_('ap.status.' + rec.status)]);
    right.push([lab_('rpt.generated_at'), gen]);
    pdfMeta_(pd, left, right);

    /* ---- Phần 1: Tổng quan năm ---- */
    if (part !== 'MONTH') {
      pdfHeading_(pd, lab_('ap.overview'), 10);
      var rows = [], kinds = [], catRows = [];
      var tot = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], totAll = 0, totEst = 0;
      groups.forEach(function (g) {
        var months = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], n = 0, e = 0;
        g.rows.forEach(function (r) { r.dates.forEach(function (d) { months[Number(d.slice(5, 7)) - 1]++; n++; }); e += r.est.length; });
        months.forEach(function (v, i) { tot[i] += v; });
        totAll += n; totEst += e;
        catRows.push(rows.length);
        rows.push([gname(g) + '  ·  ' + lab_('yr.machines', { N: g.machines }), ''].concat(months.map(function (v) { return v ? String(v) : ''; })).concat([annualCount_(n, e)]));
        kinds.push(null);
        var lastEq = null;
        g.rows.forEach(function (r) {
          var eq = r.equipment_id === lastEq ? '' : [r.equipment_code, annualBi_(r.equipment_vi, r.equipment_zh)].filter(Boolean).join('\n');
          lastEq = r.equipment_id;
          var work = annualBi_(r.title_vi, r.title_zh);
          if (r.kind === 'INSPECTION') work = lab_('home.item_inspection') + ': ' + work;
          if (r.kind === 'SERVICE') work = lab_('home.item_service') + ': ' + work;
          var cells = [];
          for (var mi = 0; mi < 12; mi++) cells.push(annualDotCell_(r, mi));
          rows.push([eq, work + '\n' + [r.code, r.cycle].filter(Boolean).join(' · ')].concat(cells).concat([annualCount_(r.dates.length, r.est.length)]));
          kinds.push(r);
        });
      });
      rows.push([lab_('ap.total'), ''].concat(tot.map(function (v) { return v ? String(v) : ''; })).concat([annualCount_(totAll, totEst)]));
      kinds.push(null);
      var ov = pdfTable_(pd, [lab_('yr.col.equipment'), lab_('ap.col.work_cycle')].concat(monthHead).concat([lab_('yr.col.year_sum')]), rows,
        ['text', 'text'].concat(monthHead.map(function () { return 'date'; })).concat(['num']), {
          fontSize: 7,
          cellColor: function (i, c) {
            var r = kinds[i];
            if (!r || c < 2 || c > 13) return null;
            var txt = rows[i][c];
            if (!txt) return null;
            return txt.indexOf(ANNUAL_SYM_[r.kind]) >= 0 ? ANNUAL_SYM_COLOR_[r.kind] : ANNUAL_SYM_COLOR_.EST;
          }
        });
      // Dòng loại thiết bị và dòng Tổng cộng: nền xám nhạt, chữ đậm
      catRows.concat([rows.length - 1]).forEach(function (i) {
        var row = ov.getRow(i + 1);
        for (var c = 0; c < row.getNumCells(); c++) row.getCell(c).setBackgroundColor(PDF_C_.tile);
        pdfText_(row, 7, PDF_C_.navy, true);
      });
      pdfNote_(pd, lab_('ap.pdf_legend'));
      annualSign_(pd, { name: nameOf(rec.prepared_by), date: fmtDateVN_(rec.prepared_at) },
        approved ? { name: nameOf(rec.approved_by), date: fmtDateVN_(rec.approved_at) } : { name: '', date: '' });
    }

    /* ---- Phần 2: Việc từng tháng ---- */
    if (part !== 'OVERVIEW') {
      var detail = annualDetailer_();
      var actual = annualActualer_();
      var months2 = part === 'MONTH' ? [opts.month - 1] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      var first = part === 'MONTH';
      months2.forEach(function (mi) {
        var list = annualMonthEntries_(snap, mi);
        if (!list.length && part !== 'MONTH') return;
        if (!first) pd.body.appendPageBreak();
        first = false;
        var mtl = LABELS['ap.month_title'] || ['Tháng {M}/{Y}', '{Y}年{M}月'];
        pdfHeading_(pd, mtl[0].split('{M}').join(mi + 1).split('{Y}').join(year) + ' · ' + mtl[1].split('{M}').join(mi + 1).split('{Y}').join(year) +
          '  —  ' + lab_('ap.month_count', { N: list.length }), part === 'MONTH' ? 10 : 0);
        if (!list.length) { pdfNote_(pd, lab_('ap.no_work_month')); return; }
        var prevContent = null;
        var mrows = list.map(function (x) {
          var r = x.row, d = detail(r);
          var work = annualBi_(r.title_vi, r.title_zh);
          if (r.kind === 'INSPECTION') work = lab_('home.item_inspection') + ': ' + work;
          if (r.kind === 'SERVICE') work = lab_('home.item_service') + ': ' + work;
          var steps = (d.steps || []).slice(0, ANNUAL_STEPS_PDF_).map(function (t, i) { return (i + 1) + '. ' + t; });
          if ((d.steps || []).length > ANNUAL_STEPS_PDF_) steps.push(lab_('ap.more_steps', { N: d.steps.length - ANNUAL_STEPS_PDF_ }));
          if (d.safety) steps.push('⚠ ' + d.safety);
          var mins = d.minutes !== null && d.minutes !== undefined && d.minutes !== '' ? lab_('ap.minutes', { N: d.minutes }) : '';
          // Cùng nội dung với dòng ngay trên (cùng kế hoạch nhóm cho nhiều máy) → "Như dòng trên", đỡ lặp dài
          var content = steps.join('\n');
          var shown = content && content === prevContent ? '〃 ' + lab_('ap.same_above') : content;
          prevContent = content;
          // d4.21 (lịch bảo trì tháng): phiếu bảo trì đã sinh → phụ tùng đề nghị, giờ dừng máy, số phiếu + ngày xong, ngày dời
          var a = actual(x);
          return [(x.est ? '≈' : '') + x.date.slice(8, 10) + '/' + x.date.slice(5, 7), [r.equipment_code, annualBi_(r.equipment_vi, r.equipment_zh)].filter(Boolean).join('\n'),
            work + (r.code ? '\n' + r.code : '') + (x.est ? '\n' + lab_('yr.est') : ''), shown, d.assignee || '', mins, a.parts, a.down, a.wo, '☐', a.moved];
        });
        pdfTable_(pd, [lab_('ap.date'), lab_('yr.col.equipment'), lab_('yr.col.work'), lab_('ap.col.content'), lab_('ap.col.who'), lab_('ap.col.time'),
          lab_('ap.col.parts'), lab_('ap.col.downtime'), lab_('ap.col.wo_sign'), lab_('ap.col.prod_confirm'), lab_('ap.col.moved')],
          mrows, ['date', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'text'],
          { fontSize: 7, caps: [8, 16, 20, 42, 12, 10, 20, 11, 13, 8, 14] });
      });
      pdfNote_(pd, lab_('ap.month_note'));
      pdfNote_(pd, lab_('ap.month_note_wo'));
    }
  } catch (e) {
    try { DriveApp.getFileById(pd.doc.getId()).setTrashed(true); } catch (e2) { /* bỏ qua */ }
    throw e;
  }
  return pdfFinish_(pd);
}

/**
 * annual_plan.pdf {annual_plan_id, part: ALL | OVERVIEW | MONTH, month}: PDF A4 ngang. Tổng quan ≤ 500 dòng; cả năm ≤ 1 500 lần
 * (nhiều hơn → in từng tháng hoặc dùng Excel).
 */
function annualPlanPdf_(ctx) {
  var p = ctx.req.payload || {};
  var part = p.part || 'ALL';
  if (!ANNUAL_PARTS_[part]) throw validationError_([fieldError_('part', 'INVALID_VALUE')]);
  var month = Number(p.month);
  if (part === 'MONTH' && !(month >= 1 && month <= 12 && Math.floor(month) === month)) throw validationError_([fieldError_('month', 'INVALID_VALUE')]);
  var rec = annualPlanOrThrow_(p.annual_plan_id);
  if (part !== 'MONTH' && Number(rec.row_count) > ANNUAL_PDF_ROW_MAX_) throw validationError_([fieldError_('annual_plan_id', 'PDF_TOO_MANY_ROWS')]);
  var snap = annualSnapshot_(rec);
  if (part === 'ALL') {
    var n = 0;
    (snap.groups || []).forEach(function (g) { g.rows.forEach(function (r) { n += r.dates.length + r.est.length; }); });
    if (n > ANNUAL_PDF_ENTRY_MAX_) throw validationError_([fieldError_('part', 'ANNUAL_PDF_TOO_LARGE')]);
  }
  var bytes = annualPdf_(rec, snap, { part: part, month: month });
  withWriteLock_(function () {
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'annual_plan.pdf', entity_type: 'ANNUAL_PLAN', entity_id: rec.annual_plan_id,
      before_json: null, after_json: { bytes: bytes.length, code: rec.annual_plan_code, status: rec.status, part: part, month: part === 'MONTH' ? month : '' }, auth_basis: authBasis_(ctx) });
  });
  var name = rec.annual_plan_code || ('KHN-' + rec.year + '-' + annualPad2_(rec.revision) + '-' + String(rec.status).toLowerCase());
  if (part === 'OVERVIEW') name += '_tong-quan';
  if (part === 'MONTH') name += '_T' + annualPad2_(month);
  return { file_name: name + '.pdf', mime_type: 'application/pdf', content_b64: b64_(bytes), size_bytes: bytes.length };
}
