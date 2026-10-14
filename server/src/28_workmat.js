/* 28_workmat: vật tư trên phiếu và thay linh kiện — 1.4 §5.1, §5.4, §10.3.1; phụ lục 1.5 mục 4.4.2 (part.replace), 4.4.5, 4.5, 4.6.
 * Đề nghị (MaterialRequests + Lines) và lượng dùng (MaterialUsageLines) gắn với phiếu bảo trì (WORK_ORDER) hoặc sửa chữa (REPAIR);
 * module quyền theo work_type. Chưa kết nối kho: không gửi kho, không trừ tồn, không giá kho; chi phí nhập tay ghi nguồn
 * MANUAL_REFERENCE ("Tham khảo"). Đơn vị luôn là base_unit của vật tư; actual_used_qty và scrap_qty là hai lượng riêng. */

var WORK_FINAL_ = { COMPLETED: 1, CANCELLED: 1 };

/** Phiếu theo work_type/work_id: {wt, work, assignees[]}; ném lỗi khi không có */
function workOrThrow_(workType, workId) {
  var wt = WORK_TYPES[workType];
  if (!wt) throw validationError_([fieldError_('work_type', 'INVALID_VALUE')]);
  if (!isUuidV4_(workId)) throw validationError_([fieldError_('work_id', 'ID_INVALID')]);
  var w = findOne_(wt.sheet, wt.key, workId);
  if (!w || w.archived_at) throw validationError_([fieldError_('work_id', 'NOT_FOUND')]);
  var assignees = workType === 'REPAIR' ? repairAssignees_(w) : [w.assignee_user_id].filter(String);
  return { wt: wt, work: w, assignees: assignees, code: w[wt.code] };
}

/** Quyền theo module của phiếu (bước 4–5) + điều kiện "được giao"/"của mình" (bước 6) */
function authWork_(ctx, action, wk, ownerId) {
  var auth = authorize_(ctx, action, { module: wk.wt.module });
  ctx.auth = auth;
  if (!auth.conds.length) return auth;
  var ok = auth.conds.some(function (c) {
    if (c.indexOf('ASG') === 0) return wk.assignees.indexOf(ctx.user.user_id) >= 0;
    if (c.indexOf('OWN') === 0) return ownerId === ctx.user.user_id;
    return false;
  });
  if (!ok) throw apiError_('FORBIDDEN');
  return auth;
}

function qtyNum_(v) {
  if (v === undefined || v === null || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : NaN;
}

/* ---------------- Đề nghị vật tư (MAT-03) ---------------- */

/**
 * matreq.create: tạo hoặc sửa nháp đề nghị gắn với phiếu (người được giao, C3/C4).
 * {request_id, work_type, work_id, needed_at?, note_vi/zh?, lines: [{request_line_id, material_id, requested_qty, note_vi/zh?, remove?}]}
 */
function matreqCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.request_id)) errs.push(fieldError_('request_id', 'ID_INVALID'));
  if (p.needed_at !== undefined && p.needed_at !== '' && !isDateStr_(p.needed_at)) errs.push(fieldError_('needed_at', 'INVALID_DATE'));
  var lines = Array.isArray(p.lines) ? p.lines : [];
  if (p.lines !== undefined && !Array.isArray(p.lines)) errs.push(fieldError_('lines', 'INVALID_VALUE'));
  if (lines.length > 50) errs.push(fieldError_('lines', 'INVALID_VALUE'));
  lines.forEach(function (l) {
    var f = 'lines[' + (l && l.request_line_id) + ']';
    if (!l || !isUuidV4_(l.request_line_id)) { errs.push(fieldError_('lines', 'ID_INVALID')); return; }
    if (l.remove === true) return;
    if (l.material_id !== undefined && !isUuidV4_(l.material_id)) errs.push(fieldError_(f, 'ID_INVALID'));
    var q = qtyNum_(l.requested_qty);
    if (l.requested_qty !== undefined && !(q > 0 && q < 1e9)) errs.push(fieldError_(f, 'QTY_REQUIRED'));
    if (['approved_qty', 'issued_qty_snapshot', 'returned_qty_snapshot'].some(function (k) { return l[k] !== undefined; })) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  if (p.warehouse_id) errs.push(fieldError_('warehouse_id', 'WAREHOUSE_NOT_CONNECTED'));
  if (errs.length) throw validationError_(errs);
  var cur0 = findOne_('MaterialRequests', 'request_id', p.request_id);
  var wk0 = workOrThrow_(cur0 ? cur0.work_type : p.work_type, cur0 ? cur0.work_id : p.work_id);
  authWork_(ctx, 'matreq.create', wk0, cur0 ? cur0.requested_by : ctx.user.user_id);
  var trReq = (p.note_vi !== undefined || p.note_zh !== undefined) ? applyTranslations_('MaterialRequests', ['note'], p, cur0) : null;
  var curLines = {};
  if (cur0) findAll_('MaterialRequestLines', 'request_id', cur0.request_id).forEach(function (l) { curLines[l.request_line_id] = l; });
  var trLines = {};
  lines.forEach(function (l) { if (l.note_vi !== undefined || l.note_zh !== undefined) trLines[l.request_line_id] = applyTranslations_('MaterialRequestLines', ['note'], l, curLines[l.request_line_id] || null); });
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL_REQUEST', entity_id: p.request_id,
    build: function (st) {
      var cur = findOne_('MaterialRequests', 'request_id', p.request_id);
      var wk = workOrThrow_(cur ? cur.work_type : p.work_type, cur ? cur.work_id : p.work_id);
      authWork_(ctx, 'matreq.create', wk, cur ? cur.requested_by : ctx.user.user_id);
      if (WORK_FINAL_[wk.work.status]) throw validationError_([fieldError_('work_id', 'STATUS_INVALID')]);
      var nowIso = isoVN_(now_());
      var su = {};
      var row, before = null;
      if (cur) {
        assertVersion_(ctx, cur, 'MATERIAL_REQUEST', 'MaterialRequests');
        if (cur.status !== 'DRAFT') throw validationError_([fieldError_('request_id', 'STATUS_INVALID')]);
        if (ctx.auth.conds.length && cur.requested_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
        before = { needed_at: cur.needed_at, note_vi: cur.note_vi };
        row = clone_(cur); delete row.__row;
      } else {
        if (Number(ctx.req.expected_version || 0) !== 0) throw validationError_([fieldError_('expected_version', 'INVALID_VALUE')]);
        var at = reportedAt_(ctx.req.client_time);
        row = {
          request_id: p.request_id, request_code: allocCode_(st, su, 'MATERIAL_REQUEST', null, at.slice(0, 10)), work_type: wk.wt.entity, work_id: wk.work[wk.wt.key],
          equipment_id: wk.work.equipment_id || '', location_id: '', warehouse_id: '', requested_by: ctx.user.user_id, requested_at: at,
          needed_at: '', status: 'DRAFT', approved_by: '', approved_at: '', sent_to_warehouse_at: '', note_vi: '', note_zh: '',
          submitted_at: '', reject_reason: '', cancel_reason: ''
        };
        var eq = wk.work.equipment_id ? findOne_('Equipment', 'equipment_id', wk.work.equipment_id) : null;
        row.location_id = eq ? eq.location_id || '' : '';
      }
      if (p.needed_at !== undefined) row.needed_at = p.needed_at || '';
      if (trReq) { row.note_vi = trReq.values.note_vi; row.note_zh = trReq.values.note_zh; row.i18n_meta = Object.assign({}, row.i18n_meta || {}, trReq.meta); }
      var writes = [];
      var e2 = [];
      var order = Object.keys(curLines).length;
      var active = 0;
      findAll_('MaterialRequestLines', 'request_id', p.request_id).forEach(function (l) { if (!l.archived_at) active++; });
      lines.forEach(function (l) {
        var f = 'lines[' + l.request_line_id + ']';
        var cl = findOne_('MaterialRequestLines', 'request_line_id', l.request_line_id);
        if (cl && (cl.request_id !== p.request_id || cl.archived_at)) { e2.push(fieldError_(f, 'NOT_FOUND')); return; }
        if (l.remove === true) {
          if (!cl) return;
          var rm = clone_(cl); delete rm.__row; rm.archived_at = nowIso; cUpdate_(ctx, rm);
          writes.push({ sheet: 'MaterialRequestLines', mode: 'update', row: rm });
          active--;
          return;
        }
        var matId = l.material_id !== undefined ? l.material_id : (cl ? cl.material_id : '');
        var mat = matId ? findOne_('Materials', 'material_id', matId) : null;
        if (!mat || (!cl && mat.active === false)) { e2.push(fieldError_(f, 'NOT_FOUND')); return; }
        var q = l.requested_qty !== undefined ? Number(l.requested_qty) : (cl ? Number(cl.requested_qty) : null);
        if (!(q > 0)) { e2.push(fieldError_(f, 'QTY_REQUIRED')); return; }
        var l2 = cl ? clone_(cl) : { request_line_id: l.request_line_id, request_id: p.request_id, approved_qty: '', issued_qty_snapshot: '', returned_qty_snapshot: '', inventory_sync_at: '', status: 'DRAFT', note_vi: '', note_zh: '', sort_order: ++order };
        delete l2.__row;
        l2.material_id = matId; l2.requested_qty = q; l2.unit = mat.base_unit || '';
        l2.work_type = row.work_type; l2.work_id = row.work_id;
        var tl = trLines[l.request_line_id];
        if (tl) { l2.note_vi = tl.values.note_vi; l2.note_zh = tl.values.note_zh; l2.i18n_meta = Object.assign({}, l2.i18n_meta || {}, tl.meta); }
        if (cl) cUpdate_(ctx, l2); else { cNew_(ctx, l2); active++; }
        writes.push({ sheet: 'MaterialRequestLines', mode: cl ? 'update' : 'insert', row: l2 });
      });
      if (e2.length) throw validationError_(e2);
      if (!cur && active < 1) throw validationError_([fieldError_('lines', 'REQUIRED')]);
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      writes.unshift({ sheet: 'MaterialRequests', mode: cur ? 'update' : 'insert', row: row });
      return {
        writes: writes, state: su,
        result: { entity_type: 'MATERIAL_REQUEST', entity_id: row.request_id, display_code: row.request_code, record_version: row.record_version, record: projectRow_(ctx, row, 'MaterialRequests') },
        record_version: row.record_version,
        audit: { entity_type: wk.wt.entity, entity_id: row.work_id, before_json: before, after_json: { request_id: row.request_id, request_code: row.request_code, lines: active } }
      };
    }
  });
}

function matreqOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('request_id', 'ID_INVALID')]);
  var r = findOne_('MaterialRequests', 'request_id', id);
  if (!r || r.archived_at) throw apiError_('NOT_FOUND');
  return r;
}

function requestLines_(requestId) {
  return findAll_('MaterialRequestLines', 'request_id', requestId).filter(function (l) { return !l.archived_at; });
}

/** Đổi trạng thái đề nghị kèm các dòng; extra(line) sửa thêm từng dòng */
function setRequestStatus_(ctx, req, status, writes, extra) {
  requestLines_(req.request_id).forEach(function (l) {
    var l2 = clone_(l); delete l2.__row; l2.status = status;
    if (extra) extra(l2);
    cUpdate_(ctx, l2);
    writes.push({ sheet: 'MaterialRequestLines', mode: 'update', row: l2 });
  });
}

/** matreq.submit {request_id}: Nháp → Chờ duyệt (người đề nghị, C3/C4) */
function matreqSubmit_(ctx) {
  var p = ctx.req.payload || {};
  var r0 = matreqOrThrow_(p.request_id);
  authWork_(ctx, 'matreq.submit', workOrThrow_(r0.work_type, r0.work_id), r0.requested_by);
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL_REQUEST', entity_id: p.request_id,
    build: function () {
      var r = matreqOrThrow_(p.request_id);
      var wk = workOrThrow_(r.work_type, r.work_id);
      authWork_(ctx, 'matreq.submit', wk, r.requested_by);
      assertVersion_(ctx, r, 'MATERIAL_REQUEST', 'MaterialRequests');
      if (r.status !== 'DRAFT') throw validationError_([fieldError_('request_id', 'STATUS_INVALID')]);
      if (!requestLines_(r.request_id).length) throw validationError_([fieldError_('lines', 'REQUIRED')]);
      if (WORK_FINAL_[wk.work.status]) throw validationError_([fieldError_('work_id', 'STATUS_INVALID')]);
      var row = clone_(r); delete row.__row;
      row.status = 'PENDING_APPROVAL'; row.submitted_at = isoVN_(now_());
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'MaterialRequests', mode: 'update', row: row }];
      setRequestStatus_(ctx, r, 'PENDING_APPROVAL', writes);
      return {
        writes: writes,
        result: { entity_type: 'MATERIAL_REQUEST', entity_id: row.request_id, display_code: row.request_code, record_version: row.record_version, record: projectRow_(ctx, row, 'MaterialRequests') },
        record_version: row.record_version,
        audit: { entity_type: wk.wt.entity, entity_id: r.work_id, before_json: { request_id: r.request_id, status: 'DRAFT' }, after_json: { status: row.status } }
      };
    }
  });
}

/**
 * matreq.approve (C3/C4, PIN): {request_id, decision: APPROVE | REJECT, reason (REJECT), lines?: [{request_line_id, approved_qty}]}
 * Không duyệt đề nghị do mình lập (4.6). Chưa kết nối kho: Đã duyệt là trạng thái cuối trong M&E (không gửi kho).
 */
function matreqApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  var qmap = {};
  (Array.isArray(p.lines) ? p.lines : []).forEach(function (l) {
    var q = qtyNum_(l && l.approved_qty);
    if (!l || !isUuidV4_(l.request_line_id) || q === null || !(q >= 0)) errs.push(fieldError_('lines', 'INVALID_VALUE'));
    else qmap[l.request_line_id] = q;
  });
  if (errs.length) throw validationError_(errs);
  var r0 = matreqOrThrow_(p.request_id);
  authWork_(ctx, 'matreq.approve', workOrThrow_(r0.work_type, r0.work_id), null);
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL_REQUEST', entity_id: p.request_id,
    build: function () {
      var r = matreqOrThrow_(p.request_id);
      var wk = workOrThrow_(r.work_type, r.work_id);
      authWork_(ctx, 'matreq.approve', wk, null);
      var basis = assertNotSelf_(ctx, 'matreq.approve', [r.requested_by, r.created_by].filter(String));
      assertVersion_(ctx, r, 'MATERIAL_REQUEST', 'MaterialRequests');
      if (r.status !== 'PENDING_APPROVAL') throw validationError_([fieldError_('request_id', 'STATUS_INVALID')]);
      var lines = requestLines_(r.request_id);
      Object.keys(qmap).forEach(function (id) { if (!lines.some(function (l) { return l.request_line_id === id; })) throw validationError_([fieldError_('lines[' + id + ']', 'NOT_FOUND')]); });
      var row = clone_(r); delete row.__row;
      var nowIso = isoVN_(now_());
      var writes = [];
      if (p.decision === 'REJECT') {
        row.status = 'REJECTED'; row.reject_reason = trimStr_(p.reason).slice(0, 500);
        setRequestStatus_(ctx, r, 'REJECTED', writes);
      } else {
        row.status = 'APPROVED'; row.approved_by = ctx.user.user_id; row.approved_at = nowIso;
        setRequestStatus_(ctx, r, 'APPROVED', writes, function (l2) {
          l2.approved_qty = qmap[l2.request_line_id] !== undefined ? qmap[l2.request_line_id] : Number(l2.requested_qty);
        });
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'MaterialRequests', mode: 'update', row: row });
      return {
        writes: writes,
        result: { entity_type: 'MATERIAL_REQUEST', entity_id: row.request_id, display_code: row.request_code, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'MaterialRequests') },
        record_version: row.record_version,
        audit: {
          entity_type: wk.wt.entity, entity_id: r.work_id, before_json: { request_id: r.request_id, status: r.status }, after_json: { status: row.status, approved_qty: qmap },
          reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined
        }
      };
    }
  });
}

/** matreq.cancel {request_id, reason}: người đề nghị hoặc C3/C4 hủy đề nghị chưa xong */
function matreqCancel_(ctx) {
  var p = ctx.req.payload || {};
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var r0 = matreqOrThrow_(p.request_id);
  authWork_(ctx, 'matreq.cancel', workOrThrow_(r0.work_type, r0.work_id), r0.requested_by);
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL_REQUEST', entity_id: p.request_id,
    build: function () {
      var r = matreqOrThrow_(p.request_id);
      var wk = workOrThrow_(r.work_type, r.work_id);
      authWork_(ctx, 'matreq.cancel', wk, r.requested_by);
      assertVersion_(ctx, r, 'MATERIAL_REQUEST', 'MaterialRequests');
      if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].indexOf(r.status) < 0) throw validationError_([fieldError_('request_id', 'STATUS_INVALID')]);
      var row = clone_(r); delete row.__row;
      row.status = 'CANCELLED'; row.cancel_reason = trimStr_(p.reason).slice(0, 500);
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'MaterialRequests', mode: 'update', row: row }];
      setRequestStatus_(ctx, r, 'CANCELLED', writes);
      return {
        writes: writes,
        result: { entity_type: 'MATERIAL_REQUEST', entity_id: row.request_id, display_code: row.request_code, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'MaterialRequests') },
        record_version: row.record_version,
        audit: { entity_type: wk.wt.entity, entity_id: r.work_id, before_json: { request_id: r.request_id, status: r.status }, after_json: { status: 'CANCELLED' }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Lượng dùng ---------------- */

/**
 * usage.record: ghi/sửa/bỏ dòng lượng thực dùng và hao hỏng của phiếu (→ Chờ xác nhận). Không trừ tồn.
 * {work_type, work_id, lines: [{usage_line_id, material_id, actual_used_qty, scrap_qty, request_line_id?, note_vi/zh?, expected_version?, remove?}]}
 * Dòng đã xác nhận không sửa được. Cấp 2 (được giao) chỉ sửa dòng mình ghi, khi phiếu Đã giao việc/Đang làm.
 */
function usageRecord_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  var lines = Array.isArray(p.lines) ? p.lines : [];
  if (!lines.length || lines.length > 50) errs.push(fieldError_('lines', lines.length ? 'INVALID_VALUE' : 'REQUIRED'));
  lines.forEach(function (l) {
    var f = 'lines[' + (l && l.usage_line_id) + ']';
    if (!l || !isUuidV4_(l.usage_line_id)) { errs.push(fieldError_('lines', 'ID_INVALID')); return; }
    if (l.remove === true) return;
    if (l.material_id !== undefined && !isUuidV4_(l.material_id)) errs.push(fieldError_(f, 'ID_INVALID'));
    ['actual_used_qty', 'scrap_qty'].forEach(function (k) {
      var q = qtyNum_(l[k]);
      if (q !== null && !(q >= 0 && q < 1e9)) errs.push(fieldError_(f, 'INVALID_VALUE'));
    });
    if (l.request_line_id && !isUuidV4_(l.request_line_id)) errs.push(fieldError_(f, 'ID_INVALID'));
    if (COST_FIELDS.MaterialUsageLines.some(function (k) { return l[k] !== undefined; }) || l.unit_cost !== undefined) errs.push(fieldError_(f, 'COST_FIELD_FORBIDDEN'));
  });
  if (errs.length) throw validationError_(errs);
  var wk0 = workOrThrow_(p.work_type, p.work_id);
  authWork_(ctx, 'usage.record', wk0, null);
  var cur0 = {};
  findAll_('MaterialUsageLines', 'work_id', p.work_id).forEach(function (u) { cur0[u.usage_line_id] = u; });
  var trs = {};
  lines.forEach(function (l) { if (l.note_vi !== undefined || l.note_zh !== undefined) trs[l.usage_line_id] = applyTranslations_('MaterialUsageLines', ['note'], l, cur0[l.usage_line_id] || null); });
  return executeWrite_(ctx, {
    entity_type: wk0.wt.entity, entity_id: p.work_id,
    build: function () {
      var wk = workOrThrow_(p.work_type, p.work_id);
      authWork_(ctx, 'usage.record', wk, null);
      var lvl2 = ctx.auth.conds.length > 0;
      var okStatus = lvl2 ? ['ASSIGNED', 'IN_PROGRESS'] : ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE'];
      if (okStatus.indexOf(wk.work.status) < 0) throw validationError_([fieldError_('work_id', 'STATUS_INVALID')]);
      var nowIso = isoVN_(now_());
      var writes = [], e2 = [];
      lines.forEach(function (l) {
        var f = 'lines[' + l.usage_line_id + ']';
        var cu = findOne_('MaterialUsageLines', 'usage_line_id', l.usage_line_id);
        if (cu && (cu.work_id !== p.work_id || cu.work_type !== wk.wt.entity || cu.archived_at)) { e2.push(fieldError_(f, 'NOT_FOUND')); return; }
        if (cu) {
          if (cu.status === 'CONFIRMED') { e2.push(fieldError_(f, 'STATUS_INVALID')); return; }
          if (lvl2 && cu.recorded_by !== ctx.user.user_id) { e2.push(fieldError_(f, 'INVALID_VALUE')); return; }
          if (l.expected_version !== undefined && Number(l.expected_version) !== Number(cu.record_version)) {
            throw apiError_('VERSION_CONFLICT', { entity_type: 'MATERIAL_USAGE', server: projectRow_(ctx, cu, 'MaterialUsageLines'), server_version: cu.record_version });
          }
        }
        if (l.remove === true) {
          if (!cu) return;
          var rm = clone_(cu); delete rm.__row; rm.archived_at = nowIso; cUpdate_(ctx, rm);
          writes.push({ sheet: 'MaterialUsageLines', mode: 'update', row: rm });
          return;
        }
        var matId = l.material_id !== undefined ? l.material_id : (cu ? cu.material_id : '');
        var mat = matId ? findOne_('Materials', 'material_id', matId) : null;
        if (!mat || (!cu && mat.active === false)) { e2.push(fieldError_(f, 'NOT_FOUND')); return; }
        var used = l.actual_used_qty !== undefined ? qtyNum_(l.actual_used_qty) : (cu ? Number(cu.actual_used_qty || 0) : null);
        var scrap = l.scrap_qty !== undefined ? qtyNum_(l.scrap_qty) : (cu ? Number(cu.scrap_qty || 0) : null);
        if (!((used || 0) > 0 || (scrap || 0) > 0)) { e2.push(fieldError_(f, 'QTY_REQUIRED')); return; }
        if (l.request_line_id) {
          var rl = findOne_('MaterialRequestLines', 'request_line_id', l.request_line_id);
          if (!rl || rl.work_id !== p.work_id || rl.material_id !== matId) { e2.push(fieldError_(f, 'NOT_FOUND')); return; }
        }
        var u2 = cu ? clone_(cu) : {
          usage_line_id: l.usage_line_id, work_type: wk.wt.entity, work_id: p.work_id, equipment_id: wk.work.equipment_id || '',
          request_line_id: '', manual_unit_cost: '', currency: '', cost_source: '', net_issue_qty_snapshot: '', inventory_cost_snapshot: '',
          inventory_sync_at: '', recorded_by: ctx.user.user_id, recorded_at: reportedAt_(ctx.req.client_time), confirmed_by: '', confirmed_at: '',
          note_vi: '', note_zh: ''
        };
        delete u2.__row;
        u2.material_id = matId; u2.unit = mat.base_unit || '';
        u2.actual_used_qty = used === null ? 0 : used; u2.scrap_qty = scrap === null ? 0 : scrap;
        if (l.request_line_id !== undefined) u2.request_line_id = l.request_line_id || '';
        u2.status = 'PENDING_CONFIRMATION';
        var tr = trs[l.usage_line_id];
        if (tr) { u2.note_vi = tr.values.note_vi; u2.note_zh = tr.values.note_zh; u2.i18n_meta = Object.assign({}, u2.i18n_meta || {}, tr.meta); }
        if (cu) cUpdate_(ctx, u2); else cNew_(ctx, u2);
        writes.push({ sheet: 'MaterialUsageLines', mode: cu ? 'update' : 'insert', row: u2 });
      });
      if (e2.length) throw validationError_(e2);
      return {
        writes: writes,
        result: {
          entity_type: wk.wt.entity, entity_id: p.work_id, record_version: null,
          lines: writes.map(function (x) { return projectRow_(ctx, x.row, 'MaterialUsageLines'); })
        },
        audit: { entity_type: wk.wt.entity, entity_id: p.work_id, before_json: null, after_json: { usage_lines: writes.map(function (x) { return { id: x.row.usage_line_id, used: x.row.actual_used_qty, scrap: x.row.scrap_qty, removed: !!x.row.archived_at }; }) } }
      };
    }
  });
}

/**
 * usage.confirm (C3/C4, PIN): {work_type, work_id, usage_line_ids?: [...] | all: true}. Không xác nhận dòng mình ghi (4.6).
 * Làm được cùng lúc với nghiệm thu phiếu (confirm_usage của maintenance.accept / repair.accept).
 */
function usageConfirm_(ctx) {
  var p = ctx.req.payload || {};
  var ids = Array.isArray(p.usage_line_ids) ? p.usage_line_ids : null;
  if (!ids && p.all !== true) throw validationError_([fieldError_('usage_line_ids', 'REQUIRED')]);
  if (ids && (!ids.length || ids.length > 200 || ids.some(function (x) { return !isUuidV4_(x); }))) throw validationError_([fieldError_('usage_line_ids', 'INVALID_VALUE')]);
  var wk0 = workOrThrow_(p.work_type, p.work_id);
  authWork_(ctx, 'usage.confirm', wk0, null);
  return executeWrite_(ctx, {
    entity_type: wk0.wt.entity, entity_id: p.work_id,
    build: function () {
      var wk = workOrThrow_(p.work_type, p.work_id);
      authWork_(ctx, 'usage.confirm', wk, null);
      if (wk.work.status === 'CANCELLED') throw validationError_([fieldError_('work_id', 'STATUS_INVALID')]);
      var all = findAll_('MaterialUsageLines', 'work_id', p.work_id).filter(function (u) { return u.work_type === wk.wt.entity && !u.archived_at; });
      var pick = ids ? ids.map(function (id) {
        var u = all.filter(function (x) { return x.usage_line_id === id; })[0];
        if (!u) throw validationError_([fieldError_('usage_line_ids', 'NOT_FOUND')]);
        return u;
      }) : all.filter(function (u) { return u.status === 'PENDING_CONFIRMATION'; });
      var basis = 'ROLE_LEVEL';
      var nowIso = isoVN_(now_());
      var writes = [], skipped = [];
      pick.forEach(function (u) {
        if (u.status !== 'PENDING_CONFIRMATION') { if (ids) throw validationError_([fieldError_('usage_lines[' + u.usage_line_id + ']', 'STATUS_INVALID')]); return; }
        if (u.recorded_by === ctx.user.user_id) {
          if (ids) basis = assertNotSelf_(ctx, 'usage.confirm', [u.recorded_by]);
          else { skipped.push(u.usage_line_id); return; }
        }
        var u2 = clone_(u); delete u2.__row;
        u2.status = 'CONFIRMED'; u2.confirmed_by = ctx.user.user_id; u2.confirmed_at = nowIso;
        cUpdate_(ctx, u2);
        writes.push({ sheet: 'MaterialUsageLines', mode: 'update', row: u2 });
      });
      return {
        writes: writes,
        result: { entity_type: wk.wt.entity, entity_id: p.work_id, record_version: null, confirmed: writes.map(function (x) { return x.row.usage_line_id; }), skipped: skipped,
          lines: writes.map(function (x) { return projectRow_(ctx, x.row, 'MaterialUsageLines'); }) },
        audit: { entity_type: wk.wt.entity, entity_id: p.work_id, before_json: null, after_json: { usage_confirmed: writes.length, skipped: skipped.length || undefined }, auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined, reason: trimStr_(p.self_approval_reason) }
      };
    }
  });
}

/* ---------------- Chi phí tham khảo ---------------- */

/**
 * work.cost.edit (C3/C4 có quyền giá): {work_type, work_id, labor_cost?, other_cost? (bảo trì), outside_cost? (sửa chữa),
 * cost_currency?, usage_costs?: [{usage_line_id, manual_unit_cost, currency?}]}. Nguồn chi phí vật tư: MANUAL_REFERENCE.
 */
function workCostEdit_(ctx) {
  var p = ctx.req.payload || {};
  var wk0 = workOrThrow_(p.work_type, p.work_id);
  authWork_(ctx, 'work.cost.edit', wk0, null);
  var errs = [];
  var money = function (k) {
    if (p[k] === undefined) return;
    var v = qtyNum_(p[k]);
    if (v !== null && !(v >= 0 && v < 1e13)) errs.push(fieldError_(k, 'INVALID_VALUE'));
  };
  ['labor_cost', 'other_cost', 'outside_cost'].forEach(money);
  if (p.work_type === 'WORK_ORDER' && p.outside_cost !== undefined) errs.push(fieldError_('outside_cost', 'INVALID_VALUE'));
  if (p.work_type === 'REPAIR' && p.other_cost !== undefined) errs.push(fieldError_('other_cost', 'INVALID_VALUE'));
  if (p.cost_currency !== undefined && p.cost_currency !== '' && !/^[A-Z]{3}$/.test(String(p.cost_currency))) errs.push(fieldError_('cost_currency', 'INVALID_VALUE'));
  var uc = Array.isArray(p.usage_costs) ? p.usage_costs : [];
  uc.forEach(function (x) {
    var v = qtyNum_(x && x.manual_unit_cost);
    if (!x || !isUuidV4_(x.usage_line_id) || (v !== null && !(v >= 0 && v < 1e13))) errs.push(fieldError_('usage_costs', 'INVALID_VALUE'));
    if (x && x.currency !== undefined && x.currency !== '' && !/^[A-Z]{3}$/.test(String(x.currency))) errs.push(fieldError_('usage_costs', 'INVALID_VALUE'));
  });
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: wk0.wt.entity, entity_id: p.work_id,
    build: function () {
      var wk = workOrThrow_(p.work_type, p.work_id);
      authWork_(ctx, 'work.cost.edit', wk, null);
      var writes = [];
      var nowCur = setting_('default_currency') || 'VND';
      var row = clone_(wk.work); delete row.__row;
      var before = { labor_cost: wk.work.labor_cost, other_cost: wk.work.other_cost, outside_cost: wk.work.outside_cost, cost_currency: wk.work.cost_currency };
      var touched = ['labor_cost', 'other_cost', 'outside_cost', 'cost_currency'].some(function (k) { return p[k] !== undefined; });
      if (touched) {
        assertVersion_(ctx, wk.work, wk.wt.entity, wk.wt.sheet);
        ['labor_cost', 'other_cost', 'outside_cost'].forEach(function (k) {
          if (p[k] === undefined || (k === 'other_cost' && p.work_type !== 'WORK_ORDER') || (k === 'outside_cost' && p.work_type !== 'REPAIR')) return;
          row[k] = p[k] === '' || p[k] === null ? '' : Number(p[k]);
        });
        if (p.cost_currency !== undefined) row.cost_currency = p.cost_currency || '';
        if (!row.cost_currency && ['labor_cost', 'other_cost', 'outside_cost'].some(function (k) { return row[k] !== '' && row[k] !== null && row[k] !== undefined; })) row.cost_currency = nowCur;
        cUpdate_(ctx, row);
        writes.push({ sheet: wk.wt.sheet, mode: 'update', row: row });
      }
      uc.forEach(function (x) {
        var u = findOne_('MaterialUsageLines', 'usage_line_id', x.usage_line_id);
        if (!u || u.work_id !== p.work_id || u.archived_at) throw validationError_([fieldError_('usage_costs', 'NOT_FOUND')]);
        var u2 = clone_(u); delete u2.__row;
        var v = qtyNum_(x.manual_unit_cost);
        u2.manual_unit_cost = v === null ? '' : v;
        u2.currency = v === null ? '' : (x.currency || u.currency || nowCur);
        u2.cost_source = v === null ? '' : 'MANUAL_REFERENCE';
        cUpdate_(ctx, u2);
        writes.push({ sheet: 'MaterialUsageLines', mode: 'update', row: u2 });
      });
      if (!writes.length) throw validationError_([fieldError_('labor_cost', 'REQUIRED')]);
      return {
        writes: writes,
        result: {
          entity_type: wk.wt.entity, entity_id: p.work_id, record_version: touched ? row.record_version : wk.work.record_version,
          record: projectRow_(ctx, touched ? row : wk.work, wk.wt.sheet),
          lines: writes.filter(function (x) { return x.sheet === 'MaterialUsageLines'; }).map(function (x) { return projectRow_(ctx, x.row, 'MaterialUsageLines'); })
        },
        record_version: touched ? row.record_version : undefined,
        audit: { entity_type: wk.wt.entity, entity_id: p.work_id, before_json: before, after_json: { labor_cost: row.labor_cost, other_cost: row.other_cost, outside_cost: row.outside_cost, cost_currency: row.cost_currency, usage_costs: uc.length || undefined } }
      };
    }
  });
}

/* ---------------- Thay linh kiện (part.replace) ---------------- */

var PART_EVENT_TYPES_ = ['REPLACED', 'REMOVED', 'INSTALLED'];

/**
 * part.replace: ghi tháo/lắp/thay linh kiện theo phiếu bảo trì/sửa chữa (EquipmentPartEvents); không trừ tồn.
 * {event_id, work_type, work_id, event_type: REPLACED | REMOVED | INSTALLED, equipment_part_id? (liên kết đang lắp),
 *  material_id? (vật tư mới; REPLACED để trống = cùng loại), new_equipment_part_id? (liên kết mới khi đổi loại/lắp mới),
 *  quantity, occurred_at?, usage_line_id?, note_vi/zh?, position_vi/zh?}
 * Đổi sang vật tư khác hoặc lắp mới: liên kết cũ kết thúc (removed_at), liên kết mới do cấp 2 lắp chờ xác nhận (part.approve).
 */
function partReplace_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.event_id)) errs.push(fieldError_('event_id', 'ID_INVALID'));
  if (PART_EVENT_TYPES_.indexOf(p.event_type) < 0) errs.push(fieldError_('event_type', 'REQUIRED'));
  if (p.event_type !== 'INSTALLED' && !isUuidV4_(p.equipment_part_id)) errs.push(fieldError_('equipment_part_id', 'REQUIRED'));
  if (p.event_type === 'INSTALLED' && !isUuidV4_(p.material_id)) errs.push(fieldError_('material_id', 'REQUIRED'));
  if (p.material_id && !isUuidV4_(p.material_id)) errs.push(fieldError_('material_id', 'ID_INVALID'));
  if (p.new_equipment_part_id && !isUuidV4_(p.new_equipment_part_id)) errs.push(fieldError_('new_equipment_part_id', 'ID_INVALID'));
  var qty = qtyNum_(p.quantity);
  if (!(qty > 0 && qty < 1e9)) errs.push(fieldError_('quantity', 'QTY_REQUIRED'));
  checkTimeField_(p, 'occurred_at', errs);
  if (p.usage_line_id && !isUuidV4_(p.usage_line_id)) errs.push(fieldError_('usage_line_id', 'ID_INVALID'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var wk0 = workOrThrow_(p.work_type, p.work_id);
  if (ctx.auth && ctx.auth.conds.length && wk0.assignees.indexOf(ctx.user.user_id) < 0) throw apiError_('FORBIDDEN');
  var tr = applyTranslations_('EquipmentPartEvents', ['note', 'position'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_PART_EVENT', entity_id: p.event_id,
    build: function () {
      var wk = workOrThrow_(p.work_type, p.work_id);
      var lvl2 = ctx.auth && ctx.auth.conds.length > 0;
      if (lvl2 && wk.assignees.indexOf(ctx.user.user_id) < 0) throw apiError_('FORBIDDEN');
      var okStatus = lvl2 ? ['ASSIGNED', 'IN_PROGRESS'] : ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE'];
      if (okStatus.indexOf(wk.work.status) < 0) throw validationError_([fieldError_('work_id', 'STATUS_INVALID')]);
      if (findRowNums_('EquipmentPartEvents', 'event_id', p.event_id).length) throw validationError_([fieldError_('event_id', 'ID_EXISTS')]);
      var eqId = wk.work.equipment_id;
      var nowIso = isoVN_(now_());
      var at = p.occurred_at ? normTime_(p.occurred_at) : nowIso;
      var writes = [];
      var old = null;
      if (p.event_type !== 'INSTALLED') {
        old = findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id);
        if (!old || old.removed_at || old.archived_at || old.equipment_id !== eqId) throw validationError_([fieldError_('equipment_part_id', 'NOT_FOUND')]);
      }
      var newMatId = p.event_type === 'REMOVED' ? (old ? old.material_id : '') : (p.material_id || (old ? old.material_id : ''));
      var newMat = newMatId ? findOne_('Materials', 'material_id', newMatId) : null;
      if (!newMat) throw validationError_([fieldError_('material_id', 'NOT_FOUND')]);
      if (p.usage_line_id) {
        var ul = findOne_('MaterialUsageLines', 'usage_line_id', p.usage_line_id);
        if (!ul || ul.work_id !== p.work_id) throw validationError_([fieldError_('usage_line_id', 'NOT_FOUND')]);
      }
      var linkAfter = old ? old.equipment_part_id : '';
      var endOld = function () {
        var o2 = clone_(old); delete o2.__row; o2.removed_at = at; o2.archived_at = nowIso; cUpdate_(ctx, o2);
        writes.push({ sheet: 'EquipmentParts', mode: 'update', row: o2 });
      };
      var addNew = function () {
        if (newMat.active === false) throw validationError_([fieldError_('material_id', 'NOT_FOUND')]);
        if (!newMat.is_equipment_component) throw validationError_([fieldError_('material_id', 'NOT_COMPONENT')]);
        var dup = findAll_('EquipmentParts', 'equipment_id', eqId).filter(function (x) { return x.material_id === newMat.material_id && !x.removed_at && !x.archived_at && (!old || x.equipment_part_id !== old.equipment_part_id); });
        if (dup.length) throw validationError_([fieldError_('material_id', 'CODE_DUPLICATE')]);
        var nid = p.new_equipment_part_id || uuid_();
        if (findRowNums_('EquipmentParts', 'equipment_part_id', nid).length) throw validationError_([fieldError_('new_equipment_part_id', 'ID_EXISTS')]);
        var link = cNew_(ctx, {
          equipment_part_id: nid, equipment_id: eqId, material_id: newMat.material_id,
          installed_qty: old ? old.installed_qty : qty, unit: newMat.base_unit || '',
          function_vi: old ? old.function_vi : '', function_zh: old ? old.function_zh : '', alternate_part_id: '', compatibility_note: '',
          approved_by: Number(ctx.user.role_level) >= 3 ? ctx.user.user_id : '',
          position_vi: old ? old.position_vi : tr.values.position_vi, position_zh: old ? old.position_zh : tr.values.position_zh,
          effective_from: at.slice(0, 10), removed_at: '', i18n_meta: old && old.i18n_meta ? old.i18n_meta : (tr.meta.position ? { position: tr.meta.position } : {})
        });
        writes.push({ sheet: 'EquipmentParts', mode: 'insert', row: link });
        linkAfter = nid;
      };
      if (p.event_type === 'REMOVED') endOld();
      else if (p.event_type === 'INSTALLED') addNew();
      else if (newMat.material_id !== old.material_id) { endOld(); addNew(); }
      var ev = {
        event_id: p.event_id, equipment_id: eqId, equipment_part_id: linkAfter, material_id: newMat.material_id,
        old_material_id: p.event_type === 'REPLACED' && old && old.material_id !== newMat.material_id ? old.material_id : '',
        event_type: p.event_type, quantity: qty, unit: newMat.base_unit || '',
        position_vi: tr.values.position_vi || (old ? old.position_vi : ''), position_zh: tr.values.position_zh || (old ? old.position_zh : ''),
        occurred_at: at, work_type: wk.wt.entity, work_id: p.work_id, usage_line_id: p.usage_line_id || '', actor_user_id: ctx.user.user_id,
        note_vi: tr.values.note_vi, note_zh: tr.values.note_zh, dataset_epoch: sysProps_().dataset_epoch, created_at: nowIso, created_by: ctx.user.user_id,
        i18n_meta: tr.meta
      };
      writes.push({ sheet: 'EquipmentPartEvents', mode: 'insert', row: ev });
      return {
        writes: writes,
        result: { entity_type: 'EQUIPMENT_PART_EVENT', entity_id: p.event_id, record_version: 1, record: projectRow_(ctx, ev, 'EquipmentPartEvents'), equipment_part_id: linkAfter },
        record_version: 1,
        audit: { entity_type: wk.wt.entity, entity_id: p.work_id, before_json: old ? { equipment_part_id: old.equipment_part_id, material_id: old.material_id } : null, after_json: { event_type: p.event_type, material_id: newMat.material_id, equipment_part_id: linkAfter, quantity: qty } }
      };
    }
  });
}
