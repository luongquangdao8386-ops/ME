/* 11_inspection: Kiểm định (phần PoC: nộp kết quả, xem) — 1.4 §5.9, phụ lục 1.5 mục 3.17, 4.4.9 */

var INSPECTION_RESULT_ = ['PASS', 'FAIL', 'CONDITIONAL_PASS'];

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
        cost: p.cost === undefined || p.cost === '' ? '' : Number(p.cost), currency: p.cost ? (p.currency || setting_('default_currency')) : '',
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

function inspectionView_(ctx) {
  return {
    types: readRows_('InspectionTypes').map(function (r) { return projectRow_(ctx, r, 'InspectionTypes'); }),
    requirements: readRows_('InspectionRequirements').map(function (r) { return projectRow_(ctx, r, 'InspectionRequirements'); }),
    inspections: readRows_('Inspections').map(function (r) { return projectRow_(ctx, r, 'Inspections'); })
  };
}
