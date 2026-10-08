/* 11_inspection: Kiểm định — 1.4 §5.9; phụ lục 1.5 mục 3.17, 4.4.9, 4.6, C10.
 * Hạn hiện hành chỉ đổi khi một lần PASS/CONDITIONAL_PASS được duyệt; lần FAIL được duyệt giữ hạn cũ;
 * thu hồi giữ hạn; lịch hẹn không đổi hạn (inspection.schedule chờ chốt). */

var INSPECTION_RESULT_ = ['PASS', 'FAIL', 'CONDITIONAL_PASS'];

/* ---------------- Loại kiểm định ---------------- */

/**
 * inspection.type.edit: tạo (expected_version 0) hoặc sửa loại kiểm định.
 * {inspection_type_id, code, name_vi/zh, reference_basis, default_interval_months, required_docs_vi/zh, active}
 * Tên và hồ sơ cần có là nội dung pháp lý: không dịch tự động (2.3).
 */
function inspectionTypeEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.inspection_type_id)) throw validationError_([fieldError_('inspection_type_id', 'ID_INVALID')]);
  var cur0 = findOne_('InspectionTypes', 'inspection_type_id', p.inspection_type_id);
  var errs = [];
  requireOneLang_(errs, p, cur0, 'name');
  var code = p.code !== undefined ? trimStr_(p.code).toUpperCase() : (cur0 ? cur0.code : '');
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,31}$/.test(code)) errs.push(fieldError_('code', code ? 'CODE_INVALID' : 'REQUIRED'));
  if (p.default_interval_months !== undefined && p.default_interval_months !== '' && p.default_interval_months !== null) {
    var m = Number(p.default_interval_months);
    if (!(m > 0 && m <= 240 && Math.floor(m) === m)) errs.push(fieldError_('default_interval_months', 'INVALID_VALUE'));
  }
  if (p.reference_basis !== undefined && String(p.reference_basis).length > 300) errs.push(fieldError_('reference_basis', 'INVALID_VALUE'));
  if (p.active !== undefined && typeof p.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('InspectionTypes', ['name', 'required_docs'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION_TYPE', entity_id: p.inspection_type_id,
    build: function () {
      var cur = findOne_('InspectionTypes', 'inspection_type_id', p.inspection_type_id);
      if (cur) assertVersion_(ctx, cur, 'INSPECTION_TYPE', 'InspectionTypes');
      var dup = findAll_('InspectionTypes', 'code', code).filter(function (t) { return t.inspection_type_id !== p.inspection_type_id; });
      if (dup.length) throw validationError_([fieldError_('code', 'CODE_DUPLICATE')]);
      var row = cur ? clone_(cur) : { inspection_type_id: p.inspection_type_id, active: true };
      var before = cur ? clone_(cur) : null; if (before) delete before.__row;
      row.code = code;
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh;
      row.required_docs_vi = tr.values.required_docs_vi; row.required_docs_zh = tr.values.required_docs_zh; row.i18n_meta = tr.meta;
      if (p.reference_basis !== undefined) row.reference_basis = trimStr_(p.reference_basis);
      if (p.default_interval_months !== undefined) row.default_interval_months = p.default_interval_months === '' || p.default_interval_months === null ? '' : Number(p.default_interval_months);
      if (p.active !== undefined) row.active = p.active;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'InspectionTypes', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'INSPECTION_TYPE', entity_id: p.inspection_type_id, record_version: row.record_version, record: projectRow_(ctx, row, 'InspectionTypes') },
        record_version: row.record_version,
        audit: { entity_type: 'INSPECTION_TYPE', entity_id: p.inspection_type_id, before_json: before, after_json: row }
      };
    }
  });
}

/* ---------------- Yêu cầu kiểm định ---------------- */

/**
 * inspection.requirement.edit: tạo/sửa/ngừng yêu cầu theo thiết bị hoặc khu vực.
 * {requirement_id, equipment_id | location_id, inspection_type_id, owner_user_id, obligation_status, active}
 * Hạn hiện hành (current_due_date) không sửa ở đây — chỉ đổi khi duyệt chứng nhận (3.17).
 */
function inspectionRequirementEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.requirement_id)) throw validationError_([fieldError_('requirement_id', 'ID_INVALID')]);
  var cur0 = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
  var errs = [];
  ['current_due_date', 'current_inspection_id', 'due_revision', 'operational_status'].forEach(function (f) {
    if (p[f] !== undefined) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  var eqId = p.equipment_id !== undefined ? p.equipment_id : (cur0 ? cur0.equipment_id : '');
  var locId = p.location_id !== undefined ? p.location_id : (cur0 ? cur0.location_id : '');
  if (!eqId && !locId) errs.push(fieldError_('equipment_id', 'REQUIRED'));
  var typeId = p.inspection_type_id !== undefined ? p.inspection_type_id : (cur0 ? cur0.inspection_type_id : '');
  if (!isUuidV4_(typeId)) errs.push(fieldError_('inspection_type_id', 'REQUIRED'));
  if (p.obligation_status !== undefined && ['REQUIRED', 'VOLUNTARY'].indexOf(p.obligation_status) < 0) errs.push(fieldError_('obligation_status', 'INVALID_VALUE'));
  if (p.active !== undefined && typeof p.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
  if (p.active === false && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id,
    build: function (st) {
      var cur = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
      if (cur) assertVersion_(ctx, cur, 'INSPECTION_REQUIREMENT', 'InspectionRequirements');
      var e2 = [];
      if (eqId) { var eq = findOne_('Equipment', 'equipment_id', eqId); if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND')); }
      if (locId && !findRowNums_('Locations', 'location_id', locId).length) e2.push(fieldError_('location_id', 'NOT_FOUND'));
      var ty = findOne_('InspectionTypes', 'inspection_type_id', typeId);
      if (!ty || ty.active === false) e2.push(fieldError_('inspection_type_id', 'NOT_FOUND'));
      if (p.owner_user_id && !findRowNums_('Users', 'user_id', p.owner_user_id).length) e2.push(fieldError_('owner_user_id', 'NOT_FOUND'));
      // Một thiết bị/khu vực không có hai yêu cầu đang hiệu lực cùng loại
      var same = readRows_('InspectionRequirements').filter(function (r) {
        return r.requirement_id !== p.requirement_id && r.active !== false && !r.archived_at && r.inspection_type_id === typeId &&
          (eqId ? r.equipment_id === eqId : (!r.equipment_id && r.location_id === locId));
      });
      if (same.length) e2.push(fieldError_('inspection_type_id', 'CODE_DUPLICATE'));
      if (e2.length) throw validationError_(e2);
      var su = {};
      var writes = [];
      var row, before = null, qrKey = null;
      if (cur) {
        before = clone_(cur); delete before.__row;
        row = clone_(cur);
      } else {
        row = {
          requirement_id: p.requirement_id, requirement_code: allocCode_(st, su, 'INSPECTION_REQUIREMENT', null, null),
          current_inspection_id: '', current_due_date: '', operational_status: 'ACTIVE', obligation_status: 'REQUIRED', active: true, due_revision: ''
        };
        qrKey = allocQrKey_();
      }
      row.equipment_id = eqId || ''; row.location_id = eqId ? (p.location_id !== undefined ? p.location_id || '' : row.location_id || '') : locId;
      row.inspection_type_id = typeId;
      if (p.owner_user_id !== undefined) row.owner_user_id = p.owner_user_id || '';
      if (p.obligation_status !== undefined) row.obligation_status = p.obligation_status;
      if (p.active !== undefined) row.active = p.active;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      writes.push({ sheet: 'InspectionRequirements', mode: cur ? 'update' : 'insert', row: row });
      var labelVi = ty.name_vi || ty.name_zh, labelZh = ty.name_zh || ty.name_vi;
      if (qrKey) {
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'INSPECTION_REQUIREMENT', p.requirement_id, row.requirement_code, labelVi, labelZh) });
      } else {
        var qr = findOne_('QrRegistry', 'entity_id', p.requirement_id);
        if (qr && (qr.active !== (row.active !== false) || qr.label_vi !== labelVi || qr.label_zh !== labelZh)) {
          var q2 = clone_(qr); delete q2.__row; q2.active = row.active !== false; q2.label_vi = labelVi; q2.label_zh = labelZh;
          writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
        }
      }
      return {
        writes: writes, state: su,
        result: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id, display_code: row.requirement_code, qr_key: qrKey, record_version: row.record_version, record: projectRow_(ctx, row, 'InspectionRequirements') },
        record_version: row.record_version,
        audit: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id, before_json: before, after_json: row, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Nộp chứng nhận (IN-03) ---------------- */

function inspectionSubmit_(ctx) {
  var p = ctx.req.payload;
  var errs = [];
  if (!isUuidV4_(p.inspection_id)) errs.push(fieldError_('inspection_id', 'ID_INVALID'));
  if (!isUuidV4_(p.requirement_id)) errs.push(fieldError_('requirement_id', 'REQUIRED'));
  if (!isDateStr_(p.inspection_date)) errs.push(fieldError_('inspection_date', 'INVALID_DATE'));
  if (INSPECTION_RESULT_.indexOf(p.result) < 0) errs.push(fieldError_('result', 'INVALID_VALUE'));
  ['valid_from', 'valid_to', 'next_due_date'].forEach(function (f) {
    if (p[f] && !isDateStr_(p[f])) errs.push(fieldError_(f, 'INVALID_DATE'));
  });
  // C10: PASS/CONDITIONAL_PASS bắt buộc có cả "Hiệu lực từ" và "Hiệu lực đến"; FAIL không bắt buộc
  if (p.result !== 'FAIL' && !p.valid_from) errs.push(fieldError_('valid_from', 'REQUIRED'));
  if (p.result !== 'FAIL' && !p.valid_to) errs.push(fieldError_('valid_to', 'REQUIRED'));
  if (p.valid_from && p.valid_to && p.valid_from > p.valid_to) errs.push(fieldError_('valid_to', 'INVALID_DATE'));
  if (p.result === 'CONDITIONAL_PASS' && !trimStr_(p.restriction_vi) && !trimStr_(p.restriction_zh)) {
    errs.push(fieldError_('restriction', 'RESTRICTION_REQUIRED'));
  }
  if (p.cost !== undefined && p.cost !== null && p.cost !== '' && !(Number(p.cost) >= 0)) errs.push(fieldError_('cost', 'INVALID_VALUE'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Inspections', 'inspections', p);
  // Kết luận kiểm định không dịch tự động (2.3): ghi MANUAL_REQUIRED khi thiếu một bên
  var tr = applyTranslations_('Inspections', ['restriction'], p, null);

  return executeWrite_(ctx, {
    entity_type: 'INSPECTION', entity_id: p.inspection_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Inspections', 'inspection_id', p.inspection_id).length) e2.push(fieldError_('inspection_id', 'ID_EXISTS'));
      var req0 = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
      if (!req0 || !req0.active || req0.archived_at) e2.push(fieldError_('requirement_id', 'NOT_FOUND'));
      if (p.vendor_id && !findRowNums_('Vendors', 'vendor_id', p.vendor_id).length) e2.push(fieldError_('vendor_id', 'NOT_FOUND'));
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'INSPECTION', null, p.inspection_date);
      var qrKey = allocQrKey_();
      var nowIso = isoVN_(now_());
      var row = {
        inspection_id: p.inspection_id, inspection_code: code, requirement_id: p.requirement_id, vendor_id: p.vendor_id || '',
        inspection_date: p.inspection_date, certificate_number: trimStr_(p.certificate_number).slice(0, 80),
        valid_from: p.valid_from || '', valid_to: p.valid_to || '', next_due_date: p.next_due_date || '', result: p.result,
        restriction_vi: tr.values.restriction_vi, restriction_zh: tr.values.restriction_zh, i18n_meta: tr.meta,
        cost: p.cost === undefined || p.cost === '' || p.cost === null ? '' : Number(p.cost), currency: p.cost ? (p.currency || setting_('default_currency')) : '',
        status: 'PENDING_APPROVAL', approved_by: '', approved_at: '', supersedes_inspection_id: '',
        submitted_by: ctx.user.user_id, submitted_at: nowIso
      };
      cNew_(ctx, row);
      return {
        writes: [
          { sheet: 'Inspections', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'INSPECTION', p.inspection_id, code, '', '') }
        ],
        state: su,
        result: { entity_type: 'INSPECTION', entity_id: p.inspection_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Inspections') },
        record_version: 1,
        audit: { entity_type: 'INSPECTION', entity_id: p.inspection_id, before_json: null, after_json: row }
      };
    }
  });
}

/** Hạn hiện hành từ một lần đạt: ngày sớm hơn giữa "Hiệu lực đến" và "hạn tiếp theo" (nếu có) */
function dueFromInspection_(i) {
  var a = i.valid_to || '', b = i.next_due_date || '';
  if (a && b) return a < b ? a : b;
  return a || b;
}

/* ---------------- Duyệt (IN-02) ---------------- */

/**
 * inspection.approve {inspection_id, decision: APPROVE | REJECT, reason}
 * Không tự duyệt: người tạo, người nộp (4.6). PASS/CONDITIONAL_PASS → cập nhật current_inspection_id,
 * current_due_date, due_revision mới, lần hiện hành cũ SUPERSEDED. FAIL → APPROVED, giữ hạn hiện hành (3.17).
 */
function inspectionApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.inspection_id)) errs.push(fieldError_('inspection_id', 'ID_INVALID'));
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION', entity_id: p.inspection_id,
    build: function () {
      var cur = findOne_('Inspections', 'inspection_id', p.inspection_id);
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'inspection.approve', [cur.created_by, cur.submitted_by]);
      assertVersion_(ctx, cur, 'INSPECTION', 'Inspections');
      if (cur.status !== 'PENDING_APPROVAL') throw validationError_([fieldError_('inspection_id', 'INVALID_VALUE')]);
      var nowIso = isoVN_(now_());
      var row = clone_(cur);
      var writes = [];
      var reqAfter = null;
      if (p.decision === 'REJECT') {
        row.status = 'REJECTED';
      } else {
        row.status = 'APPROVED';
        row.approved_by = ctx.user.user_id;
        row.approved_at = nowIso;
        if (row.result !== 'FAIL') {
          var req = findOne_('InspectionRequirements', 'requirement_id', row.requirement_id);
          if (!req) throw apiError_('NOT_FOUND');
          var prevId = req.current_inspection_id;
          // Chỉ thay hồ sơ hiện hành khi lần này mới hơn (không để lần cũ duyệt muộn đè lần mới)
          var prev = prevId ? findOne_('Inspections', 'inspection_id', prevId) : null;
          if (!prev || String(prev.inspection_date) <= String(row.inspection_date)) {
            if (prev && prev.status === 'APPROVED') {
              var pv = clone_(prev); delete pv.__row;
              pv.status = 'SUPERSEDED'; cUpdate_(ctx, pv);
              writes.push({ sheet: 'Inspections', mode: 'update', row: pv });
              row.supersedes_inspection_id = prev.inspection_id;
            }
            var r2 = clone_(req); delete r2.__row;
            var due = dueFromInspection_(row);
            r2.current_inspection_id = row.inspection_id;
            r2.current_due_date = due;
            r2.due_revision = due ? 'VALID_TO:' + due + ':' + row.inspection_id : '';
            cUpdate_(ctx, r2);
            writes.push({ sheet: 'InspectionRequirements', mode: 'update', row: r2 });
            reqAfter = r2;
          } else {
            row.status = 'SUPERSEDED';
          }
        }
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Inspections', mode: 'update', row: row });
      return {
        writes: writes,
        result: {
          entity_type: 'INSPECTION', entity_id: row.inspection_id, status: row.status, record_version: row.record_version,
          record: projectRow_(ctx, row, 'Inspections'), requirement: reqAfter ? projectRow_(ctx, reqAfter, 'InspectionRequirements') : null
        },
        record_version: row.record_version,
        audit: {
          entity_type: 'INSPECTION', entity_id: row.inspection_id, before_json: { status: cur.status },
          after_json: { status: row.status, current_due_date: reqAfter ? reqAfter.current_due_date : undefined },
          reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined
        }
      };
    }
  });
}

/* ---------------- Thu hồi, tạm ngưng (3.17) ---------------- */

/**
 * inspection.revoke {requirement_id, op: REVOKE | SUSPEND | RESUME, reason}
 * REVOKE: lần hiện hành → REVOKED, giữ current_due_date. SUSPEND/RESUME: operational_status.
 */
function inspectionRevoke_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.requirement_id)) errs.push(fieldError_('requirement_id', 'ID_INVALID'));
  if (['REVOKE', 'SUSPEND', 'RESUME'].indexOf(p.op) < 0) errs.push(fieldError_('op', 'REQUIRED'));
  if (!trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id,
    build: function () {
      var req = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
      if (!req) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, req, 'INSPECTION_REQUIREMENT', 'InspectionRequirements');
      var r2 = clone_(req); delete r2.__row;
      var writes = [];
      var after = {};
      if (p.op === 'REVOKE') {
        var ins = req.current_inspection_id ? findOne_('Inspections', 'inspection_id', req.current_inspection_id) : null;
        if (!ins || ins.status !== 'APPROVED') throw validationError_([fieldError_('requirement_id', 'INVALID_VALUE')]);
        var i2 = clone_(ins); delete i2.__row;
        i2.status = 'REVOKED'; cUpdate_(ctx, i2);
        writes.push({ sheet: 'Inspections', mode: 'update', row: i2 });
        after = { inspection_id: i2.inspection_id, status: 'REVOKED' };
      } else {
        var want = p.op === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
        if ((req.operational_status || 'ACTIVE') === want) throw validationError_([fieldError_('op', 'INVALID_VALUE')]);
        r2.operational_status = want;
        after = { operational_status: want };
      }
      // Ghi lại yêu cầu (tăng record_version) để máy khác thấy thay đổi và nhãn trạng thái tính lại
      cUpdate_(ctx, r2);
      writes.push({ sheet: 'InspectionRequirements', mode: 'update', row: r2 });
      return {
        writes: writes,
        result: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: r2.requirement_id, record_version: r2.record_version, record: projectRow_(ctx, r2, 'InspectionRequirements') },
        record_version: r2.record_version,
        audit: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: r2.requirement_id, before_json: { operational_status: req.operational_status }, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Xem ---------------- */

/** record_status (3.17) từ lần APPROVED/REVOKED có inspection_date mới nhất; SUSPENDED theo operational_status */
function requirementRecordStatus_(req, inspections) {
  if (req.operational_status === 'SUSPENDED') return 'SUSPENDED';
  var list = inspections.filter(function (i) { return i.requirement_id === req.requirement_id && (i.status === 'APPROVED' || i.status === 'REVOKED'); });
  list.sort(function (a, b) { return String(b.inspection_date).localeCompare(String(a.inspection_date)); });
  var last = list[0];
  if (!last) return 'INCOMPLETE';
  if (last.status === 'REVOKED') return 'REVOKED';
  if (last.result === 'FAIL') return 'FAILED';
  return 'VALID';
}

function inspectionView_(ctx) {
  var p = ctx.req.payload || {};
  var insp = readRows_('Inspections');
  var reqs = readRows_('InspectionRequirements').filter(function (r) { return p.include_inactive || r.active !== false; });
  if (p.requirement_id) reqs = reqs.filter(function (r) { return r.requirement_id === p.requirement_id; });
  return {
    types: readRows_('InspectionTypes').map(function (r) { return projectRow_(ctx, r, 'InspectionTypes'); }),
    requirements: reqs.map(function (r) {
      var o = projectRow_(ctx, r, 'InspectionRequirements');
      o.record_status = requirementRecordStatus_(r, insp);
      return o;
    }),
    inspections: insp.filter(function (i) { return !p.requirement_id || i.requirement_id === p.requirement_id; })
      .map(function (r) { return projectRow_(ctx, r, 'Inspections'); })
  };
}
