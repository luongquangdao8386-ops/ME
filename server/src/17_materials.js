/* 17_materials: Kho vật tư (danh mục) và linh kiện theo máy — 1.4 §5.1, §5.4; phụ lục 1.5 mục 4.4.2, 6.4.
 * M&E không chốt tồn: không có cột tồn, giá kho; gắn linh kiện không tạo phiếu xuất. */

var MATERIAL_GROUPS_ = ['EQUIPMENT_PART', 'ELECTRICAL', 'WATER', 'CONSUMABLE', 'TOOL', 'PPE'];
var ITEM_KINDS_ = ['COMPONENT', 'CONSUMABLE', 'REUSABLE_TOOL'];
var MATERIAL_FIELDS_ = ['part_number', 'manufacturer', 'model', 'base_unit', 'vendor_id', 'lead_time_days', 'group_key', 'item_kind', 'is_equipment_component'];

function validateMaterialFields_(p, errs, isNew) {
  if (p.group_key !== undefined && p.group_key !== '' && MATERIAL_GROUPS_.indexOf(p.group_key) < 0) errs.push(fieldError_('group_key', 'INVALID_VALUE'));
  if (p.item_kind !== undefined && p.item_kind !== '' && ITEM_KINDS_.indexOf(p.item_kind) < 0) errs.push(fieldError_('item_kind', 'INVALID_VALUE'));
  if (isNew && !trimStr_(p.base_unit)) errs.push(fieldError_('base_unit', 'REQUIRED'));
  if (p.base_unit !== undefined && String(p.base_unit).length > 20) errs.push(fieldError_('base_unit', 'INVALID_VALUE'));
  if (p.lead_time_days !== undefined && p.lead_time_days !== '' && p.lead_time_days !== null) {
    var d = Number(p.lead_time_days);
    if (!(d >= 0 && d <= 3650 && Math.floor(d) === d)) errs.push(fieldError_('lead_time_days', 'INVALID_VALUE'));
  }
  ['part_number', 'manufacturer', 'model'].forEach(function (f) {
    if (p[f] !== undefined && String(p[f]).length > 120) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  // Kho làm sau (1.4 §22): cột tồn tối thiểu, lô, serial không nhận ở Đợt 1
  ['reorder_level', 'lot_tracking', 'serial_tracking', 'stock', 'unit_cost', 'price'].forEach(function (f) {
    if (p[f] !== undefined && p[f] !== '' && p[f] !== null) errs.push(fieldError_(f, 'WAREHOUSE_NOT_CONNECTED'));
  });
}

function materialRefs_(p, errs) {
  if (p.vendor_id && (!isUuidV4_(p.vendor_id) || !findRowNums_('Vendors', 'vendor_id', p.vendor_id).length)) errs.push(fieldError_('vendor_id', 'NOT_FOUND'));
}

/** Điều kiện "nếu bật" của Thủ kho: authorize_ đã kiểm cờ (2, warehouse) C/E */
function materialCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.material_id)) errs.push(fieldError_('material_id', 'ID_INVALID'));
  requireOneLang_(errs, p, null, 'name');
  validateMaterialFields_(p, errs, true);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Materials', ['name', 'specification'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL', entity_id: p.material_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Materials', 'material_id', p.material_id).length) e2.push(fieldError_('material_id', 'ID_EXISTS'));
      materialRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'MATERIAL', p.material_code, null);
      var qrKey = allocQrKey_();
      var row = {
        material_id: p.material_id, material_code: code, name_vi: tr.values.name_vi, name_zh: tr.values.name_zh,
        specification_vi: tr.values.specification_vi, specification_zh: tr.values.specification_zh, i18n_meta: tr.meta,
        reorder_level: '', lot_tracking: false, serial_tracking: false, active: true
      };
      MATERIAL_FIELDS_.forEach(function (f) { row[f] = p[f] !== undefined ? p[f] : ''; });
      row.base_unit = normUnit_(row.base_unit);
      row.is_equipment_component = p.is_equipment_component === true || p.is_equipment_component === 'true';
      if (!row.group_key) row.group_key = row.is_equipment_component ? 'EQUIPMENT_PART' : 'CONSUMABLE';
      if (!row.item_kind) row.item_kind = row.is_equipment_component ? 'COMPONENT' : 'CONSUMABLE';
      if (row.lead_time_days !== '' && row.lead_time_days !== null) row.lead_time_days = Number(row.lead_time_days);
      cNew_(ctx, row);
      return {
        writes: [
          { sheet: 'Materials', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'MATERIAL', p.material_id, code, row.name_vi, row.name_zh) }
        ],
        state: su,
        result: { entity_type: 'MATERIAL', entity_id: p.material_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Materials') },
        record_version: 1,
        audit: { entity_type: 'MATERIAL', entity_id: p.material_id, before_json: null, after_json: row }
      };
    }
  });
}

function materialEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.material_id)) throw validationError_([fieldError_('material_id', 'ID_INVALID')]);
  var cur0 = findOne_('Materials', 'material_id', p.material_id);
  if (!cur0) throw apiError_('NOT_FOUND');
  var errs = [];
  requireOneLang_(errs, p, cur0, 'name');
  validateMaterialFields_(p, errs, false);
  if (p.base_unit !== undefined && !trimStr_(p.base_unit)) errs.push(fieldError_('base_unit', 'REQUIRED'));
  if (p.active !== undefined && typeof p.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Materials', ['name', 'specification'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL', entity_id: p.material_id,
    build: function (st) {
      var cur = findOne_('Materials', 'material_id', p.material_id);
      assertVersion_(ctx, cur, 'MATERIAL', 'Materials');
      var e2 = [];
      materialRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur);
      var su = {};
      if (p.material_code !== undefined && trimStr_(p.material_code).toUpperCase() !== cur.material_code) {
        row.material_code = allocCode_(st, su, 'MATERIAL', p.material_code, null);
      }
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh;
      row.specification_vi = tr.values.specification_vi; row.specification_zh = tr.values.specification_zh; row.i18n_meta = tr.meta;
      MATERIAL_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = p[f]; });
      if (p.base_unit !== undefined) row.base_unit = normUnit_(p.base_unit);
      if (p.is_equipment_component !== undefined) row.is_equipment_component = p.is_equipment_component === true || p.is_equipment_component === 'true';
      if (p.active !== undefined) row.active = p.active;
      if (row.lead_time_days !== '' && row.lead_time_days !== null) row.lead_time_days = Number(row.lead_time_days);
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Materials', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.material_id);
      if (qr && (qr.code !== row.material_code || qr.label_vi !== row.name_vi || qr.label_zh !== row.name_zh || qr.active !== !!row.active)) {
        var q2 = clone_(qr); delete q2.__row;
        q2.code = row.material_code; q2.label_vi = row.name_vi; q2.label_zh = row.name_zh; q2.active = !!row.active;
        writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
      }
      var after = clone_(row); delete after.__row;
      return {
        writes: writes, state: su,
        result: { entity_type: 'MATERIAL', entity_id: p.material_id, display_code: row.material_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Materials') },
        record_version: row.record_version,
        audit: { entity_type: 'MATERIAL', entity_id: p.material_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/**
 * material.archive: Ngừng dùng (active = false). Giữ dòng và quan hệ lịch sử; máy đang gắn vẫn hiện tên.
 * Không xóa khỏi danh mục khi máy khác còn liên kết (4.4.2).
 */
function materialArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.material_id)) throw validationError_([fieldError_('material_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var res = executeWrite_(ctx, {
    entity_type: 'MATERIAL', entity_id: p.material_id,
    build: function () {
      var cur = findOne_('Materials', 'material_id', p.material_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'MATERIAL', 'Materials');
      if (!cur.active) throw validationError_([fieldError_('material_id', 'INVALID_VALUE')]);
      var row = clone_(cur);
      row.active = false;
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Materials', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.material_id);
      if (qr && qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = false; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes,
        result: { entity_type: 'MATERIAL', entity_id: p.material_id, display_code: row.material_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Materials') },
        record_version: row.record_version,
        audit: { entity_type: 'MATERIAL', entity_id: p.material_id, before_json: { active: true }, after_json: { active: false }, reason: trimStr_(p.reason) }
      };
    }
  });
  if (res.ok && res.code === 'OK') revokeEntityPhotos_(ctx, 'MATERIAL', p.material_id);
  return res;
}

function materialView_(ctx) {
  var p = ctx.req.payload || {};
  var qm = qrMap_();
  if (p.material_id) {
    var r = findOne_('Materials', 'material_id', p.material_id);
    if (!r) throw apiError_('NOT_FOUND');
    var o = projectRow_(ctx, r, 'Materials');
    o.qr_key = qm[r.material_id] || null;
    var parts = findAll_('EquipmentParts', 'material_id', r.material_id).filter(function (x) { return !x.removed_at && !x.archived_at; })
      .map(function (x) { return projectRow_(ctx, x, 'EquipmentParts'); });
    return { item: o, used_on: parts, warehouse_connected: !!setting_('warehouse_connected') };
  }
  var f = p.filters || {};
  var q = trimStr_(f.q).toLowerCase();
  var rows = readRows_('Materials').filter(function (r) {
    if (!r.active && !p.include_inactive) return false;
    if (f.group_key && r.group_key !== f.group_key) return false;
    if (f.item_kind && r.item_kind !== f.item_kind) return false;
    if (f.is_equipment_component !== undefined && f.is_equipment_component !== '' && !!r.is_equipment_component !== !!f.is_equipment_component) return false;
    if (q && [r.material_code, r.name_vi, r.name_zh, r.part_number, r.model].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(a.material_code).localeCompare(String(b.material_code)); });
  var size = Math.min(200, Number(p.page_size) || setting_('list_page_size'));
  var start = Number(p.page_token || 0);
  return {
    items: rows.slice(start, start + size).map(function (r) { var o = projectRow_(ctx, r, 'Materials'); o.qr_key = qm[r.material_id] || null; return o; }),
    total: rows.length, next_page_token: start + size < rows.length ? String(start + size) : null,
    warehouse_connected: !!setting_('warehouse_connected')
  };
}

/* ---------------- Linh kiện theo máy (EquipmentParts) ---------------- */

function partEvent_(ctx, part, type, extra) {
  var nowIso = isoVN_(now_());
  var ev = {
    event_id: uuid_(), equipment_id: part.equipment_id, equipment_part_id: part.equipment_part_id, material_id: part.material_id,
    event_type: type, quantity: part.installed_qty, unit: part.unit, position_vi: part.position_vi || '', position_zh: part.position_zh || '',
    occurred_at: nowIso, work_type: '', work_id: '', usage_line_id: '', actor_user_id: ctx.user.user_id,
    note_vi: '', note_zh: '', dataset_epoch: sysProps_().dataset_epoch, created_at: nowIso, created_by: ctx.user.user_id,
    i18n_meta: {}
  };
  if (extra && extra.note) { ev.note_vi = extra.note; ev.i18n_meta = { note: { src: 'vi', state: 'MANUAL_REQUIRED', at: nowIso } }; }
  return ev;
}

/**
 * part.link: gắn vật tư có sẵn vào máy hoặc sửa liên kết (lượng lắp, vị trí, chức năng).
 * Cấp 2 (KT) gắn/sửa thì chưa xác nhận (approved_by trống); C3/C4 gắn thì tự ghi approved_by (4.4.2 ²).
 * Không tạo tồn hay phiếu xuất.
 */
function partLink_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.equipment_part_id)) errs.push(fieldError_('equipment_part_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.equipment_part_id) ? findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id) : null;
  if (!cur0) {
    if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
    if (!isUuidV4_(p.material_id)) errs.push(fieldError_('material_id', 'REQUIRED'));
    if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  }
  var qty = p.installed_qty === undefined ? (cur0 ? cur0.installed_qty : null) : (p.installed_qty === '' || p.installed_qty === null ? null : Number(p.installed_qty));
  if (qty === null || !(qty > 0) || !isFinite(qty)) errs.push(fieldError_('installed_qty', qty === null ? 'REQUIRED' : 'INVALID_VALUE'));
  if (p.effective_from && !isDateStr_(p.effective_from)) errs.push(fieldError_('effective_from', 'INVALID_DATE'));
  var lvl = Number(ctx.user.role_level);
  if (p.alternate_part_id !== undefined && p.alternate_part_id !== '' && lvl < 3) errs.push(fieldError_('alternate_part_id', 'INVALID_VALUE'));
  if (p.alternate_part_id && !isUuidV4_(p.alternate_part_id)) errs.push(fieldError_('alternate_part_id', 'ID_INVALID'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('EquipmentParts', ['function', 'position'], p, cur0);
  var entityId = cur0 ? cur0.equipment_part_id : p.equipment_part_id;
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_PART', entity_id: entityId,
    build: function () {
      var cur = findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id);
      if (cur) {
        assertVersion_(ctx, cur, 'EQUIPMENT_PART', 'EquipmentParts');
        if (cur.removed_at || cur.archived_at) throw validationError_([fieldError_('equipment_part_id', 'INVALID_VALUE')]);
      }
      var eqId = cur ? cur.equipment_id : p.equipment_id;
      var matId = cur ? cur.material_id : p.material_id;
      var eq = findOne_('Equipment', 'equipment_id', eqId);
      if (!eq || eq.archived_at) throw validationError_([fieldError_('equipment_id', 'NOT_FOUND')]);
      var mat = findOne_('Materials', 'material_id', matId);
      if (!mat || (!cur && !mat.active)) throw validationError_([fieldError_('material_id', 'NOT_FOUND')]);
      if (!cur && !mat.is_equipment_component) throw validationError_([fieldError_('material_id', 'NOT_COMPONENT')]);
      if (!cur) {
        var dup = findAll_('EquipmentParts', 'equipment_id', eqId).filter(function (x) { return x.material_id === matId && !x.removed_at && !x.archived_at; });
        if (dup.length) throw validationError_([fieldError_('material_id', 'CODE_DUPLICATE')]);
      }
      if (p.alternate_part_id && !findRowNums_('Materials', 'material_id', p.alternate_part_id).length) throw validationError_([fieldError_('alternate_part_id', 'NOT_FOUND')]);
      var nowIso = isoVN_(now_());
      var row = cur ? clone_(cur) : { equipment_part_id: p.equipment_part_id, equipment_id: eqId, material_id: matId, removed_at: '' };
      var before = cur ? { installed_qty: cur.installed_qty, function_vi: cur.function_vi, position_vi: cur.position_vi, approved_by: cur.approved_by } : null;
      row.installed_qty = qty;
      row.unit = mat.base_unit;
      row.function_vi = tr.values.function_vi; row.function_zh = tr.values.function_zh;
      row.position_vi = tr.values.position_vi; row.position_zh = tr.values.position_zh; row.i18n_meta = tr.meta;
      if (p.compatibility_note !== undefined) row.compatibility_note = trimStr_(p.compatibility_note).slice(0, 300);
      if (p.alternate_part_id !== undefined) row.alternate_part_id = p.alternate_part_id || '';
      if (p.effective_from !== undefined) row.effective_from = p.effective_from || '';
      if (!row.effective_from) row.effective_from = dateVN_(now_());
      // C3/C4 gắn hoặc sửa: tự xác nhận; cấp 2 gắn/sửa: chờ C3/C4 xác nhận
      row.approved_by = lvl >= 3 ? ctx.user.user_id : '';
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      var ev = partEvent_(ctx, row, cur ? 'EDITED' : 'LINKED');
      return {
        writes: [{ sheet: 'EquipmentParts', mode: cur ? 'update' : 'insert', row: row }, { sheet: 'EquipmentPartEvents', mode: 'insert', row: ev }],
        result: { entity_type: 'EQUIPMENT_PART', entity_id: row.equipment_part_id, record_version: row.record_version, record: projectRow_(ctx, row, 'EquipmentParts') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: eqId, before_json: before, after_json: { material_id: matId, installed_qty: qty, approved_by: row.approved_by } }
      };
    }
  });
}

/** part.unlink: kết thúc liên kết (removed_at); KT chỉ gỡ liên kết mình tạo chưa xác nhận; bắt lý do */
function partUnlink_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.equipment_part_id)) throw validationError_([fieldError_('equipment_part_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_PART', entity_id: p.equipment_part_id,
    build: function () {
      var cur = findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id);
      if (!cur) throw apiError_('NOT_FOUND');
      if (ctx.auth && ctx.auth.conds.length && (cur.created_by !== ctx.user.user_id || cur.approved_by)) throw apiError_('FORBIDDEN');
      assertVersion_(ctx, cur, 'EQUIPMENT_PART', 'EquipmentParts');
      if (cur.removed_at || cur.archived_at) throw validationError_([fieldError_('equipment_part_id', 'INVALID_VALUE')]);
      var row = clone_(cur);
      var nowIso = isoVN_(now_());
      row.removed_at = nowIso;
      row.archived_at = nowIso;
      cUpdate_(ctx, row);
      var ev = partEvent_(ctx, row, 'UNLINKED', { note: trimStr_(p.reason).slice(0, 300) });
      return {
        writes: [{ sheet: 'EquipmentParts', mode: 'update', row: row }, { sheet: 'EquipmentPartEvents', mode: 'insert', row: ev }],
        result: { entity_type: 'EQUIPMENT_PART', entity_id: row.equipment_part_id, record_version: row.record_version, removed: true },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: row.equipment_id, before_json: { material_id: row.material_id }, after_json: { removed_at: nowIso }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/** part.approve: C3/C4 xác nhận liên kết do người khác gắn (không tự duyệt, 4.6); đặt alternate_part_id */
function partApprove_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.equipment_part_id)) throw validationError_([fieldError_('equipment_part_id', 'ID_INVALID')]);
  if (p.alternate_part_id && !isUuidV4_(p.alternate_part_id)) throw validationError_([fieldError_('alternate_part_id', 'ID_INVALID')]);
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_PART', entity_id: p.equipment_part_id,
    build: function () {
      var cur = findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id);
      if (!cur || cur.removed_at || cur.archived_at) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'part.approve', [cur.created_by, cur.updated_by]);
      assertVersion_(ctx, cur, 'EQUIPMENT_PART', 'EquipmentParts');
      if (cur.approved_by) throw validationError_([fieldError_('equipment_part_id', 'INVALID_VALUE')]);
      if (p.alternate_part_id && !findRowNums_('Materials', 'material_id', p.alternate_part_id).length) throw validationError_([fieldError_('alternate_part_id', 'NOT_FOUND')]);
      var row = clone_(cur);
      row.approved_by = ctx.user.user_id;
      if (p.alternate_part_id !== undefined) row.alternate_part_id = p.alternate_part_id || '';
      cUpdate_(ctx, row);
      var ev = partEvent_(ctx, row, 'APPROVED');
      return {
        writes: [{ sheet: 'EquipmentParts', mode: 'update', row: row }, { sheet: 'EquipmentPartEvents', mode: 'insert', row: ev }],
        result: { entity_type: 'EQUIPMENT_PART', entity_id: row.equipment_part_id, record_version: row.record_version, record: projectRow_(ctx, row, 'EquipmentParts') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: row.equipment_id, before_json: { approved_by: '' }, after_json: { approved_by: row.approved_by, alternate_part_id: row.alternate_part_id }, auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined, reason: trimStr_(p.self_approval_reason) }
      };
    }
  });
}
