/* 14_qr: tra QR (phụ lục 1.5 mục 2.8, 3.4) */

var VIEW_ACTION_BY_MODULE_ = {
  equipment: 'equipment.view', warehouse: 'material.view', contracts: 'contract.view', inspections: 'inspection.view'
};

/**
 * qr.resolve {qr_key} hoặc {code}. Client đã lọc chuỗi lạ (qr.foreign).
 * data.qr_state: OK | INACTIVE | UNAVAILABLE | EXPIRED | NOT_IN_RESTORED
 */
function qrResolve_(ctx) {
  var p = ctx.req.payload || {};
  var row = null;
  if (p.qr_key) {
    var k = normalizeQrKey_(p.qr_key);
    if (k) row = findOne_('QrRegistry', 'qr_key', k);
  } else if (p.code) {
    var code = trimStr_(p.code).toUpperCase();
    var cands = findAll_('QrRegistry', 'code', code);
    row = cands.filter(function (r) { return can_(ctx, VIEW_ACTION_BY_MODULE_[ENTITY_TYPES[r.entity_type].module], { module: ENTITY_TYPES[r.entity_type].module }); })[0] || null;
  } else {
    throw validationError_([fieldError_('qr_key', 'REQUIRED')]);
  }
  if (!row) {
    var s = sysStateCached_();
    var reset = parseTime_(s.last_reset_at), restore = parseTime_(s.last_restore_at);
    if (restore && (!reset || restore.getTime() > reset.getTime())) return { qr_state: 'NOT_IN_RESTORED', restored_backup_at: s.restored_backup_at };
    if (reset) return { qr_state: 'EXPIRED', last_reset_at: s.last_reset_at };
    return { qr_state: 'UNAVAILABLE' };
  }
  var et = ENTITY_TYPES[row.entity_type];
  var viewAction = et ? VIEW_ACTION_BY_MODULE_[et.module] : null;
  if (!viewAction || !can_(ctx, 'qr.resolve', { module: et.module }) || !can_(ctx, viewAction, { module: et.module })) {
    return { qr_state: 'UNAVAILABLE' };
  }
  return {
    qr_state: row.active ? 'OK' : 'INACTIVE', entity_type: row.entity_type, entity_id: row.entity_id,
    code: row.code, qr_key: row.qr_key
  };
}

/**
 * qr.print {entity_type, ids}: dữ liệu tem (mã, tên, khu vực, qr_key) cho hồ sơ người in được xem; ghi AuditLogs số tem.
 * Tem không có logo, không giá, không PIN/token (6.5.2). Cần mạng (4.4.11).
 */
var PRINTABLE_ = { EQUIPMENT: 1, MATERIAL: 1, INSPECTION_REQUIREMENT: 1, CONTRACT: 1 };
function qrPrint_(ctx) {
  var p = ctx.req.payload || {};
  var et = ENTITY_TYPES[p.entity_type];
  if (!et || !PRINTABLE_[p.entity_type]) throw validationError_([fieldError_('entity_type', 'INVALID_VALUE')]);
  if (!Array.isArray(p.ids) || !p.ids.length || p.ids.length > 240) throw validationError_([fieldError_('ids', 'INVALID_VALUE')]);
  authorize_(ctx, 'qr.print', { module: et.module });
  if (!can_(ctx, VIEW_ACTION_BY_MODULE_[et.module], { module: et.module })) throw apiError_('FORBIDDEN');
  var want = {};
  p.ids.forEach(function (id) { if (isUuidV4_(id)) want[id] = true; });
  var items = [];
  readRows_('QrRegistry').forEach(function (q) {
    if (q.entity_type !== p.entity_type || !want[q.entity_id] || !q.active) return;
    items.push({ entity_type: q.entity_type, entity_id: q.entity_id, code: q.code, qr_key: q.qr_key, name_vi: q.label_vi, name_zh: q.label_zh });
  });
  if (p.entity_type === 'EQUIPMENT' && items.length) {
    var locs = {};
    readRows_('Locations').forEach(function (l) { locs[l.location_id] = l.location_code; });
    var eqLoc = {};
    readRows_('Equipment').forEach(function (e) { eqLoc[e.equipment_id] = locs[e.location_id] || ''; });
    items.forEach(function (it) { it.location_code = eqLoc[it.entity_id] || ''; });
  }
  withWriteLock_(function () {
    writeAudit_({
      user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'qr.print', entity_type: p.entity_type, entity_id: items.length === 1 ? items[0].entity_id : '',
      before_json: null, after_json: { count: items.length, codes: items.slice(0, 50).map(function (x) { return x.code; }) }, operation_id: '', auth_basis: authBasis_(ctx)
    });
  });
  return { items: items, env: envName_() };
}
