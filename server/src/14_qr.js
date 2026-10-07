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
