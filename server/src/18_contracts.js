/* 18_contracts: Hợp đồng thuê ngoài — 1.4 §5.8; phụ lục 1.5 mục 2.7, 3.17, 4.4.8, 4.5, 4.6.
 * Mỗi phiên hợp đồng là một dòng Contracts (revision, previous_contract_id). Phiên đầu có hiệu lực ngay;
 * sau đó hạn/giá trị chỉ đổi qua dự thảo gia hạn được duyệt hoặc contract.editTerms (PIN, lý do).
 * Ngày hết hạn, hạn báo gia hạn và ngày dịch vụ là ba mốc riêng. */

var CONTRACT_TERMS_ = ['start_date', 'end_date', 'renewal_notice_date', 'value', 'currency'];
var CONTRACT_INFO_ = ['contract_number', 'vendor_id', 'owner_user_id'];
var INTERVAL_TYPES_ = ['DAY', 'WEEK', 'MONTH', 'YEAR'];

/** Ngày tham chiếu nhắc hạn (2.7): min(hạn báo gia hạn, ngày hết hạn) */
function contractRef_(c) {
  var end = c.end_date || '', rn = c.renewal_notice_date || '';
  if (rn && end && rn < end) return { date: rn, kind: 'RENEWAL_NOTICE' };
  return { date: end || rn || '', kind: 'END_DATE' };
}
function contractDueRevision_(c) {
  var r = contractRef_(c);
  return r.date ? r.kind + ':' + r.date + ':' + c.contract_id : '';
}

/** Kiểm ngày và giá trị của một phiên (3.17 c, 1.4 §10.3) */
function validateTerms_(t, errs) {
  ['start_date', 'end_date', 'renewal_notice_date'].forEach(function (f) {
    if (t[f] && !isDateStr_(t[f])) errs.push(fieldError_(f, 'INVALID_DATE'));
  });
  if (t.start_date && t.end_date && t.start_date > t.end_date) errs.push(fieldError_('end_date', 'INVALID_DATE'));
  if (t.renewal_notice_date && t.end_date && t.renewal_notice_date > t.end_date) errs.push(fieldError_('renewal_notice_date', 'RENEWAL_NOTICE_AFTER_END'));
  if (t.value !== undefined && t.value !== null && t.value !== '' && !(Number(t.value) >= 0)) errs.push(fieldError_('value', 'INVALID_VALUE'));
  if (t.currency !== undefined && t.currency !== '' && !/^[A-Z]{3}$/.test(String(t.currency))) errs.push(fieldError_('currency', 'INVALID_VALUE'));
}

function contractRefs_(p, errs) {
  if (p.vendor_id && (!isUuidV4_(p.vendor_id) || !findRowNums_('Vendors', 'vendor_id', p.vendor_id).length)) errs.push(fieldError_('vendor_id', 'NOT_FOUND'));
  if (p.owner_user_id && (!isUuidV4_(p.owner_user_id) || !findRowNums_('Users', 'user_id', p.owner_user_id).length)) errs.push(fieldError_('owner_user_id', 'NOT_FOUND'));
}

/** Kế hoạch ghi danh sách thiết bị trong phạm vi: [{contract_equipment_id, equipment_id, service_vi/zh, interval_type, interval_value, next_service_date, price, remove}] */
function planContractEquipment_(ctx, contractId, list, writes, errs) {
  if (!Array.isArray(list)) return;
  var existing = findAll_('ContractEquipment', 'contract_id', contractId);
  var seenEq = {};
  existing.forEach(function (x) { if (!x.archived_at) seenEq[x.equipment_id] = x.contract_equipment_id; });
  list.forEach(function (it, i) {
    var f = 'equipment[' + i + ']';
    if (!it || !isUuidV4_(it.contract_equipment_id)) { errs.push(fieldError_(f, 'ID_INVALID')); return; }
    var cur = existing.filter(function (x) { return x.contract_equipment_id === it.contract_equipment_id; })[0];
    if (it.remove) {
      if (cur && !cur.archived_at) {
        var rm = clone_(cur); delete rm.__row; rm.archived_at = isoVN_(now_()); cUpdate_(ctx, rm);
        writes.push({ sheet: 'ContractEquipment', mode: 'update', row: rm });
        delete seenEq[cur.equipment_id];
      }
      return;
    }
    var eqId = cur ? cur.equipment_id : it.equipment_id;
    var eq = isUuidV4_(eqId) ? findOne_('Equipment', 'equipment_id', eqId) : null;
    if (!eq || eq.archived_at) { errs.push(fieldError_(f, 'NOT_FOUND')); return; }
    if (!cur && seenEq[eqId]) { errs.push(fieldError_(f, 'CODE_DUPLICATE')); return; }
    if (it.interval_type && INTERVAL_TYPES_.indexOf(it.interval_type) < 0) errs.push(fieldError_(f + '.interval_type', 'INVALID_VALUE'));
    if (it.interval_value !== undefined && it.interval_value !== '' && it.interval_value !== null && !(Number(it.interval_value) > 0)) errs.push(fieldError_(f + '.interval_value', 'INVALID_VALUE'));
    if (it.next_service_date && !isDateStr_(it.next_service_date)) errs.push(fieldError_(f + '.next_service_date', 'INVALID_DATE'));
    if (it.price !== undefined && it.price !== '' && it.price !== null && !(Number(it.price) >= 0)) errs.push(fieldError_(f + '.price', 'INVALID_VALUE'));
    var tr = applyTranslations_('ContractEquipment', ['service'], it, cur);
    var row = cur ? clone_(cur) : { contract_equipment_id: it.contract_equipment_id, contract_id: contractId, equipment_id: eqId };
    delete row.__row;
    row.service_vi = tr.values.service_vi; row.service_zh = tr.values.service_zh; row.i18n_meta = tr.meta;
    if (it.interval_type !== undefined) row.interval_type = it.interval_type || '';
    if (it.interval_value !== undefined) row.interval_value = it.interval_value === '' || it.interval_value === null ? '' : Number(it.interval_value);
    if (it.next_service_date !== undefined) row.next_service_date = it.next_service_date || '';
    if (it.price !== undefined) { row.price = it.price === '' || it.price === null ? '' : Number(it.price); row.currency = row.price === '' ? '' : (it.currency || setting_('default_currency')); }
    if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
    seenEq[eqId] = row.contract_equipment_id;
    writes.push({ sheet: 'ContractEquipment', mode: cur ? 'update' : 'insert', row: row });
  });
}

/** Lịch dịch vụ dự kiến: [{service_id, contract_equipment_id, due_date, remove}] — chỉ dòng chưa làm */
function planContractServices_(ctx, contractId, list, writes, errs) {
  if (!Array.isArray(list)) return;
  list.forEach(function (it, i) {
    var f = 'services[' + i + ']';
    if (!it || !isUuidV4_(it.service_id)) { errs.push(fieldError_(f, 'ID_INVALID')); return; }
    var cur = findOne_('ContractServices', 'service_id', it.service_id);
    if (cur && cur.contract_id !== contractId) { errs.push(fieldError_(f, 'INVALID_VALUE')); return; }
    if (cur && cur.performed_at) { errs.push(fieldError_(f, 'INVALID_VALUE')); return; }
    if (it.remove) {
      if (cur && !cur.archived_at) { var rm = clone_(cur); delete rm.__row; rm.archived_at = isoVN_(now_()); cUpdate_(ctx, rm); writes.push({ sheet: 'ContractServices', mode: 'update', row: rm }); }
      return;
    }
    if (!isDateStr_(it.due_date)) { errs.push(fieldError_(f + '.due_date', 'INVALID_DATE')); return; }
    if (it.contract_equipment_id && !findRowNums_('ContractEquipment', 'contract_equipment_id', it.contract_equipment_id).length &&
      !writes.some(function (w) { return w.sheet === 'ContractEquipment' && w.row.contract_equipment_id === it.contract_equipment_id; })) {
      errs.push(fieldError_(f + '.contract_equipment_id', 'NOT_FOUND')); return;
    }
    var row = cur ? clone_(cur) : { service_id: it.service_id, contract_id: contractId, performed_at: '', result_vi: '', result_zh: '', vendor_contact: '', cost: '', currency: '', status: 'PLANNED', accepted_by: '', accepted_at: '', i18n_meta: {} };
    delete row.__row;
    row.contract_equipment_id = it.contract_equipment_id || '';
    row.due_date = it.due_date;
    if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
    writes.push({ sheet: 'ContractServices', mode: cur ? 'update' : 'insert', row: row });
  });
}

function contractResult_(ctx, row, extra) {
  var o = { entity_type: 'CONTRACT', entity_id: row.contract_id, display_code: row.contract_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Contracts') };
  Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
  return o;
}

/* ---------------- Tạo phiên đầu ---------------- */

function contractCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  requireOneLang_(errs, p, null, 'title');
  if (!p.end_date) errs.push(fieldError_('end_date', 'REQUIRED'));
  validateTerms_(p, errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  (p.equipment || []).forEach(function (it) { assertNoCostFields_(ctx, 'ContractEquipment', 'contracts', it || {}); });
  var tr = applyTranslations_('Contracts', ['title', 'scope'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Contracts', 'contract_id', p.contract_id).length) e2.push(fieldError_('contract_id', 'ID_EXISTS'));
      contractRefs_(p, e2);
      var writes = [];
      planContractEquipment_(ctx, p.contract_id, p.equipment, writes, e2);
      planContractServices_(ctx, p.contract_id, p.services, writes, e2);
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'CONTRACT', null, null);
      var qrKey = allocQrKey_();
      var nowIso = isoVN_(now_());
      var row = {
        contract_id: p.contract_id, contract_code: code, contract_number: trimStr_(p.contract_number).slice(0, 80),
        title_vi: tr.values.title_vi, title_zh: tr.values.title_zh, scope_vi: tr.values.scope_vi, scope_zh: tr.values.scope_zh, i18n_meta: tr.meta,
        vendor_id: p.vendor_id || '', owner_user_id: p.owner_user_id || '', start_date: p.start_date || '', end_date: p.end_date,
        renewal_notice_date: p.renewal_notice_date || '', value: p.value === undefined || p.value === '' || p.value === null ? '' : Number(p.value),
        currency: p.value !== undefined && p.value !== '' && p.value !== null ? (p.currency || setting_('default_currency')) : '',
        // Phiên đầu có hiệu lực ngay để nhắc hạn chạy được (4.4.8 ⁵)
        status: 'APPROVED', revision: 1, previous_contract_id: '', submitted_by: ctx.user.user_id, submitted_at: nowIso,
        approved_by: ctx.user.user_id, approved_at: nowIso, lifecycle_status: 'ACTIVE', closed_at: '', closed_reason_vi: '', closed_reason_zh: ''
      };
      row.due_revision = contractDueRevision_(row);
      cNew_(ctx, row);
      writes.unshift({ sheet: 'Contracts', mode: 'insert', row: row });
      writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'CONTRACT', p.contract_id, code, row.title_vi, row.title_zh) });
      return {
        writes: writes, state: su,
        result: contractResult_(ctx, row, { qr_key: qrKey }),
        record_version: 1,
        audit: { entity_type: 'CONTRACT', entity_id: p.contract_id, before_json: null, after_json: row }
      };
    }
  });
}

/* ---------------- Sửa thông tin ngoài hạn/giá trị ---------------- */

/** contract.edit: tên, số HĐ, nhà cung cấp, người phụ trách, phạm vi, thiết bị, lịch dịch vụ. Dự thảo sửa được cả hạn/giá trị */
function contractEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.contract_id)) throw validationError_([fieldError_('contract_id', 'ID_INVALID')]);
  var cur0 = findOne_('Contracts', 'contract_id', p.contract_id);
  if (!cur0) throw apiError_('NOT_FOUND');
  var isDraft = cur0.status === 'DRAFT' || cur0.status === 'REJECTED';
  var errs = [];
  if (!isDraft) CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  if (cur0.status === 'PENDING_APPROVAL') errs.push(fieldError_('contract_id', 'INVALID_VALUE'));
  if (cur0.lifecycle_status === 'SUPERSEDED' || cur0.lifecycle_status === 'ENDED' || cur0.lifecycle_status === 'NOT_RENEWED' || cur0.archived_at) errs.push(fieldError_('contract_id', 'INVALID_VALUE'));
  requireOneLang_(errs, p, cur0, 'title');
  var merged = {};
  CONTRACT_TERMS_.forEach(function (f) { merged[f] = p[f] !== undefined ? p[f] : cur0[f]; });
  if (isDraft) validateTerms_(merged, errs);
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  (p.equipment || []).forEach(function (it) { assertNoCostFields_(ctx, 'ContractEquipment', 'contracts', it || {}); });
  var tr = applyTranslations_('Contracts', ['title', 'scope'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      var e2 = [];
      contractRefs_(p, e2);
      var writes = [];
      planContractEquipment_(ctx, p.contract_id, p.equipment, writes, e2);
      planContractServices_(ctx, p.contract_id, p.services, writes, e2);
      if (e2.length) throw validationError_(e2);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur); delete row.__row;
      row.title_vi = tr.values.title_vi; row.title_zh = tr.values.title_zh; row.scope_vi = tr.values.scope_vi; row.scope_zh = tr.values.scope_zh; row.i18n_meta = tr.meta;
      CONTRACT_INFO_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'contract_number' ? trimStr_(p[f]).slice(0, 80) : (p[f] || ''); });
      if (isDraft) {
        CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'value' ? (p[f] === '' || p[f] === null ? '' : Number(p[f])) : (p[f] || ''); });
        if (row.value !== '' && !row.currency) row.currency = setting_('default_currency');
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Contracts', mode: 'update', row: row });
      var qr = findOne_('QrRegistry', 'entity_id', p.contract_id);
      if (qr && (qr.label_vi !== row.title_vi || qr.label_zh !== row.title_zh)) {
        var q2 = clone_(qr); delete q2.__row; q2.label_vi = row.title_vi; q2.label_zh = row.title_zh;
        writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
      }
      return {
        writes: writes,
        result: contractResult_(ctx, row),
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: p.contract_id, before_json: before, after_json: row }
      };
    }
  });
}

/* ---------------- Sửa hạn/giá trị phiên hiện hành (PIN) ---------------- */

function contractEditTerms_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (!trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (!CONTRACT_TERMS_.some(function (f) { return p[f] !== undefined; })) errs.push(fieldError_('end_date', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  if (!canViewCost_(ctx, 'contracts')) assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'contract.editTerms', [cur.created_by]);
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.lifecycle_status !== 'ACTIVE' || cur.archived_at) throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var merged = {};
      CONTRACT_TERMS_.forEach(function (f) { merged[f] = p[f] !== undefined ? p[f] : cur[f]; });
      if (!merged.end_date) throw validationError_([fieldError_('end_date', 'REQUIRED')]);
      var e2 = []; validateTerms_(merged, e2);
      if (e2.length) throw validationError_(e2);
      var before = {}; CONTRACT_TERMS_.forEach(function (f) { before[f] = cur[f]; });
      var row = clone_(cur); delete row.__row;
      CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'value' ? (p[f] === '' || p[f] === null ? '' : Number(p[f])) : (p[f] || ''); });
      if (row.value !== '' && !row.currency) row.currency = setting_('default_currency');
      row.due_revision = contractDueRevision_(row);
      cUpdate_(ctx, row);
      var after = {}; CONTRACT_TERMS_.forEach(function (f) { after[f] = row[f]; });
      return {
        writes: [{ sheet: 'Contracts', mode: 'update', row: row }],
        result: contractResult_(ctx, row),
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: before, after_json: after, reason: trimStr_(p.reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

/* ---------------- Lưu trữ, đóng ---------------- */

function contractArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.contract_id)) throw validationError_([fieldError_('contract_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var res = executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.archived_at) throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      row.archived_at = isoVN_(now_());
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Contracts', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.contract_id);
      if (qr && qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = false; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: p.contract_id, before_json: { archived_at: '' }, after_json: { archived_at: row.archived_at }, reason: trimStr_(p.reason) }
      };
    }
  });
  if (res.ok && res.code === 'OK') revokeEntityPhotos_(ctx, 'CONTRACT', p.contract_id);
  return res;
}

/** contract.close {contract_id, lifecycle_status: ENDED | NOT_RENEWED, closed_reason_vi/zh}: dừng nhắc hạn (3.17 b) */
function contractClose_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (['ENDED', 'NOT_RENEWED'].indexOf(p.lifecycle_status) < 0) errs.push(fieldError_('lifecycle_status', 'REQUIRED'));
  requireOneLang_(errs, p, null, 'closed_reason');
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Contracts', ['closed_reason'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.lifecycle_status !== 'ACTIVE') throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      row.lifecycle_status = p.lifecycle_status;
      row.closed_at = isoVN_(now_());
      row.closed_reason_vi = tr.values.closed_reason_vi; row.closed_reason_zh = tr.values.closed_reason_zh;
      var meta = clone_(row.i18n_meta || {}); meta.closed_reason = tr.meta.closed_reason; row.i18n_meta = meta;
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Contracts', mode: 'update', row: row }];
      // Dự thảo đang mở của hợp đồng này không còn ý nghĩa
      readRows_('Contracts').forEach(function (d) {
        if (d.previous_contract_id === cur.contract_id && (d.status === 'DRAFT' || d.status === 'PENDING_APPROVAL') && !d.archived_at) {
          var d2 = clone_(d); delete d2.__row; d2.status = 'REJECTED'; cUpdate_(ctx, d2); writes.push({ sheet: 'Contracts', mode: 'update', row: d2 });
        }
      });
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { lifecycle_status: 'ACTIVE' }, after_json: { lifecycle_status: row.lifecycle_status }, reason: row.closed_reason_vi || row.closed_reason_zh }
      };
    }
  });
}

/* ---------------- Gia hạn (CO-03) ---------------- */

/** contract.renewal.create {contract_id (dự thảo mới), previous_contract_id, …điều khoản}: chép phiên hiện hành, thiết bị trong phạm vi */
function contractRenewalCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (!isUuidV4_(p.previous_contract_id)) errs.push(fieldError_('previous_contract_id', 'REQUIRED'));
  validateTerms_(p, errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var prev = findOne_('Contracts', 'contract_id', p.previous_contract_id);
      if (!prev || prev.lifecycle_status !== 'ACTIVE' || prev.archived_at) throw validationError_([fieldError_('previous_contract_id', 'NOT_FOUND')]);
      if (findRowNums_('Contracts', 'contract_id', p.contract_id).length) throw validationError_([fieldError_('contract_id', 'ID_EXISTS')]);
      var open = readRows_('Contracts').filter(function (d) { return d.previous_contract_id === prev.contract_id && (d.status === 'DRAFT' || d.status === 'PENDING_APPROVAL') && !d.archived_at; });
      if (open.length) throw validationError_([fieldError_('previous_contract_id', 'CODE_DUPLICATE')]);
      var row = clone_(prev); delete row.__row;
      row.contract_id = p.contract_id;
      row.revision = Number(prev.revision || 1) + 1;
      row.previous_contract_id = prev.contract_id;
      row.status = 'DRAFT'; row.lifecycle_status = ''; row.submitted_by = ''; row.submitted_at = ''; row.approved_by = ''; row.approved_at = '';
      row.closed_at = ''; row.closed_reason_vi = ''; row.closed_reason_zh = ''; row.due_revision = '';
      CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'value' ? (p[f] === '' || p[f] === null ? '' : Number(p[f])) : (p[f] || ''); });
      if (!canViewCost_(ctx, 'contracts')) { row.value = prev.value; row.currency = prev.currency; }
      var merged = {}; CONTRACT_TERMS_.forEach(function (f) { merged[f] = row[f]; });
      var e2 = []; validateTerms_(merged, e2);
      if (e2.length) throw validationError_(e2);
      cNew_(ctx, row);
      var writes = [{ sheet: 'Contracts', mode: 'insert', row: row }];
      findAll_('ContractEquipment', 'contract_id', prev.contract_id).filter(function (x) { return !x.archived_at; }).forEach(function (x) {
        var c2 = clone_(x); delete c2.__row; c2.contract_equipment_id = uuid_(); c2.contract_id = row.contract_id; cNew_(ctx, c2);
        writes.push({ sheet: 'ContractEquipment', mode: 'insert', row: c2 });
      });
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: 1,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: null, after_json: { previous_contract_id: prev.contract_id, revision: row.revision, end_date: row.end_date } }
      };
    }
  });
}

function contractRenewalSubmit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.contract_id)) throw validationError_([fieldError_('contract_id', 'ID_INVALID')]);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.status !== 'DRAFT' && cur.status !== 'REJECTED') throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      if (!cur.end_date) throw validationError_([fieldError_('end_date', 'REQUIRED')]);
      var row = clone_(cur); delete row.__row;
      row.status = 'PENDING_APPROVAL'; row.submitted_by = ctx.user.user_id; row.submitted_at = isoVN_(now_());
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Contracts', mode: 'update', row: row }], result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { status: cur.status }, after_json: { status: 'PENDING_APPROVAL' } }
      };
    }
  });
}

/**
 * contract.renewal.approve {contract_id, decision, reason}: phiên mới thành hiện hành (ACTIVE, due_revision mới),
 * phiên cũ SUPERSEDED; tem QR giữ nguyên qr_key, trỏ sang phiên mới (A8). Người duyệt phải có quyền giá của contracts.
 */
function contractRenewalApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  if (!canViewCost_(ctx, 'contracts')) throw apiError_('FORBIDDEN');
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'contract.renewal.approve', [cur.created_by, cur.submitted_by]);
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.status !== 'PENDING_APPROVAL') throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      var writes = [];
      if (p.decision === 'REJECT') {
        row.status = 'REJECTED';
      } else {
        var prev = findOne_('Contracts', 'contract_id', cur.previous_contract_id);
        if (!prev || prev.lifecycle_status !== 'ACTIVE') throw validationError_([fieldError_('previous_contract_id', 'INVALID_VALUE')]);
        var nowIso = isoVN_(now_());
        row.status = 'APPROVED'; row.lifecycle_status = 'ACTIVE'; row.approved_by = ctx.user.user_id; row.approved_at = nowIso;
        row.due_revision = contractDueRevision_(row);
        var pv = clone_(prev); delete pv.__row;
        pv.lifecycle_status = 'SUPERSEDED'; cUpdate_(ctx, pv);
        writes.push({ sheet: 'Contracts', mode: 'update', row: pv });
        var qr = findOne_('QrRegistry', 'entity_id', prev.contract_id);
        if (qr) { var q2 = clone_(qr); delete q2.__row; q2.entity_id = row.contract_id; q2.label_vi = row.title_vi; q2.label_zh = row.title_zh; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Contracts', mode: 'update', row: row });
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { status: 'PENDING_APPROVAL' }, after_json: { status: row.status, end_date: row.end_date, due_revision: row.due_revision }, reason: trimStr_(p.reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

/* ---------------- Dịch vụ hợp đồng ---------------- */

/**
 * contract.service.record (offline được): ghi lần dịch vụ — tạo mới (expected_version 0) hoặc ghi kết quả vào dòng dự kiến.
 * {service_id, contract_id, contract_equipment_id, due_date, performed_at, result_vi/zh, vendor_contact, cost}
 * Kết quả dịch vụ không dịch tự động (2.3).
 */
function contractServiceRecord_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.service_id)) errs.push(fieldError_('service_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.service_id) ? findOne_('ContractServices', 'service_id', p.service_id) : null;
  if (!cur0 && !isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'REQUIRED'));
  if (!p.performed_at || !(isDateStr_(p.performed_at) || parseTime_(p.performed_at))) errs.push(fieldError_('performed_at', 'INVALID_DATE'));
  if (p.due_date && !isDateStr_(p.due_date)) errs.push(fieldError_('due_date', 'INVALID_DATE'));
  requireOneLang_(errs, p, cur0, 'result');
  if (p.cost !== undefined && p.cost !== null && p.cost !== '' && !(Number(p.cost) >= 0)) errs.push(fieldError_('cost', 'INVALID_VALUE'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'ContractServices', 'contracts', p);
  var tr = applyTranslations_('ContractServices', ['result'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT_SERVICE', entity_id: p.service_id,
    build: function () {
      var cur = findOne_('ContractServices', 'service_id', p.service_id);
      var contractId = cur ? cur.contract_id : p.contract_id;
      var c = findOne_('Contracts', 'contract_id', contractId);
      if (!c || c.archived_at || c.lifecycle_status !== 'ACTIVE') throw validationError_([fieldError_('contract_id', 'NOT_FOUND')]);
      if (cur) {
        assertVersion_(ctx, cur, 'CONTRACT_SERVICE', 'ContractServices');
        if (cur.status === 'ACCEPTED') throw validationError_([fieldError_('service_id', 'INVALID_VALUE')]);
      }
      if (p.contract_equipment_id) {
        var ce = findOne_('ContractEquipment', 'contract_equipment_id', p.contract_equipment_id);
        if (!ce || ce.contract_id !== contractId) throw validationError_([fieldError_('contract_equipment_id', 'NOT_FOUND')]);
      }
      var row = cur ? clone_(cur) : { service_id: p.service_id, contract_id: contractId, due_date: p.due_date || '', accepted_by: '', accepted_at: '' };
      delete row.__row;
      var before = cur ? { performed_at: cur.performed_at, status: cur.status } : null;
      if (p.contract_equipment_id !== undefined) row.contract_equipment_id = p.contract_equipment_id || '';
      if (!cur && !row.contract_equipment_id) row.contract_equipment_id = '';
      row.performed_at = String(p.performed_at);
      row.result_vi = tr.values.result_vi; row.result_zh = tr.values.result_zh; row.i18n_meta = tr.meta;
      if (p.vendor_contact !== undefined) row.vendor_contact = trimStr_(p.vendor_contact).slice(0, 120);
      if (p.cost !== undefined) { row.cost = p.cost === '' || p.cost === null ? '' : Number(p.cost); row.currency = row.cost === '' ? '' : (p.currency || setting_('default_currency')); }
      row.status = 'DONE';
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      var writes = [{ sheet: 'ContractServices', mode: cur ? 'update' : 'insert', row: row }];
      return {
        writes: writes,
        result: { entity_type: 'CONTRACT_SERVICE', entity_id: row.service_id, record_version: row.record_version, record: projectRow_(ctx, row, 'ContractServices') },
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: contractId, before_json: before, after_json: { service_id: row.service_id, performed_at: row.performed_at, status: 'DONE' } }
      };
    }
  });
}

/** contract.service.accept {service_id}: nghiệm thu dịch vụ (PIN, không phải người tạo/ghi kết quả) */
function contractServiceAccept_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.service_id)) throw validationError_([fieldError_('service_id', 'ID_INVALID')]);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT_SERVICE', entity_id: p.service_id,
    build: function () {
      var cur = findOne_('ContractServices', 'service_id', p.service_id);
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'contract.service.accept', [cur.created_by, cur.updated_by]);
      assertVersion_(ctx, cur, 'CONTRACT_SERVICE', 'ContractServices');
      if (cur.status !== 'DONE') throw validationError_([fieldError_('service_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      row.status = 'ACCEPTED'; row.accepted_by = ctx.user.user_id; row.accepted_at = isoVN_(now_());
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'ContractServices', mode: 'update', row: row }],
        result: { entity_type: 'CONTRACT_SERVICE', entity_id: row.service_id, record_version: row.record_version, record: projectRow_(ctx, row, 'ContractServices') },
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { status: 'DONE' }, after_json: { status: 'ACCEPTED' }, auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

function contractView_(ctx) {
  var p = ctx.req.payload || {};
  var rows = readRows_('Contracts').filter(function (c) { return p.include_archived || !c.archived_at; });
  if (p.contract_id) rows = rows.filter(function (c) { return c.contract_id === p.contract_id; });
  var ids = {}; rows.forEach(function (c) { ids[c.contract_id] = true; });
  return {
    contracts: rows.map(function (c) { return projectRow_(ctx, c, 'Contracts'); }),
    equipment: readRows_('ContractEquipment').filter(function (x) { return ids[x.contract_id] && !x.archived_at; }).map(function (x) { return projectRow_(ctx, x, 'ContractEquipment'); }),
    services: readRows_('ContractServices').filter(function (x) { return ids[x.contract_id] && !x.archived_at; }).map(function (x) { return projectRow_(ctx, x, 'ContractServices'); })
  };
}
