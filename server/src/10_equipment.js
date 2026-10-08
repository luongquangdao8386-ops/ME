/* 10_equipment: Thiết bị (phần PoC: tạo, sửa, xem) và danh mục chung (xem) */

var EQUIPMENT_STATUS_ = ['RUNNING', 'STOPPED', 'UNDER_REPAIR', 'UNDER_MAINTENANCE', 'STANDBY', 'RETIRED'];
var CRITICALITY_ = ['HIGH', 'MEDIUM', 'LOW'];
var EQUIPMENT_FIELDS_ = ['category_id', 'location_id', 'vendor_id', 'manufacturer', 'model', 'serial',
  'manufacture_year', 'install_date', 'warranty_end', 'status', 'criticality', 'owner_user_id'];

/** Kiểm trường thiết bị (ngoài tên); đẩy lỗi vào errs */
function validateEquipmentFields_(p, errs) {
  if (p.status !== undefined && EQUIPMENT_STATUS_.indexOf(p.status) < 0) errs.push(fieldError_('status', 'INVALID_VALUE'));
  if (p.criticality !== undefined && p.criticality !== '' && CRITICALITY_.indexOf(p.criticality) < 0) errs.push(fieldError_('criticality', 'INVALID_VALUE'));
  ['install_date', 'warranty_end'].forEach(function (f) {
    if (p[f] !== undefined && p[f] !== '' && !isDateStr_(p[f])) errs.push(fieldError_(f, 'INVALID_DATE'));
  });
  if (p.manufacture_year !== undefined && p.manufacture_year !== '' && p.manufacture_year !== null) {
    var y = Number(p.manufacture_year);
    if (!(y >= 1900 && y <= 2100 && Math.floor(y) === y)) errs.push(fieldError_('manufacture_year', 'INVALID_VALUE'));
  }
  ['manufacturer', 'model', 'serial'].forEach(function (f) {
    if (p[f] !== undefined && String(p[f]).length > 120) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  ['name_vi', 'name_zh'].forEach(function (f) {
    if (p[f] !== undefined && String(p[f]).length > 200) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
}

/** Khóa ngoại phải tồn tại (dưới khóa ghi) */
function assertRefs_(p, errs) {
  var refs = { location_id: 'Locations', vendor_id: 'Vendors', category_id: 'LookupValues', owner_user_id: 'Users' };
  Object.keys(refs).forEach(function (f) {
    if (p[f]) {
      if (!isUuidV4_(p[f]) || !findRowNums_(refs[f], sheetSchema_(refs[f]).key, p[f]).length) errs.push(fieldError_(f, 'NOT_FOUND'));
    }
  });
}

function equipmentCreate_(ctx) {
  var p = ctx.req.payload;
  var errs = [];
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
  requireOneLang_(errs, p, null, 'name');
  validateEquipmentFields_(p, errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Equipment', ['name'], p, null);

  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Equipment', 'equipment_id', p.equipment_id).length) e2.push(fieldError_('equipment_id', 'ID_EXISTS'));
      assertRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'EQUIPMENT', p.equipment_code, null);
      var qrKey = allocQrKey_();
      var row = { equipment_id: p.equipment_id, equipment_code: code, name_vi: tr.values.name_vi, name_zh: tr.values.name_zh, i18n_meta: tr.meta };
      EQUIPMENT_FIELDS_.forEach(function (f) { row[f] = p[f] !== undefined ? p[f] : ''; });
      if (!row.status) row.status = 'RUNNING';
      if (row.manufacture_year !== '' && row.manufacture_year !== null) row.manufacture_year = Number(row.manufacture_year);
      cNew_(ctx, row);
      return {
        writes: [
          { sheet: 'Equipment', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'EQUIPMENT', p.equipment_id, code, row.name_vi, row.name_zh) }
        ],
        state: su,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Equipment') },
        record_version: 1,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: null, after_json: row }
      };
    }
  });
}

function equipmentEdit_(ctx) {
  var p = ctx.req.payload;
  if (!isUuidV4_(p.equipment_id)) throw validationError_([fieldError_('equipment_id', 'ID_INVALID')]);
  var cur0 = findOne_('Equipment', 'equipment_id', p.equipment_id);
  if (!cur0) throw apiError_('NOT_FOUND');
  var errs = [];
  requireOneLang_(errs, p, cur0, 'name');
  validateEquipmentFields_(p, errs);
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Equipment', ['name'], p, cur0);

  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function (st) {
      var cur = findOne_('Equipment', 'equipment_id', p.equipment_id);
      assertVersion_(ctx, cur, 'EQUIPMENT', 'Equipment');
      var e2 = [];
      assertRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur);
      var su = {};
      if (p.equipment_code !== undefined && trimStr_(p.equipment_code).toUpperCase() !== cur.equipment_code) {
        row.equipment_code = allocCode_(st, su, 'EQUIPMENT', p.equipment_code, null);
      }
      // Bản dịch tính ngoài khóa từ cur0; cur khác cur0 thì assertVersion_ ở trên đã báo xung đột
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh; row.i18n_meta = tr.meta;
      EQUIPMENT_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = p[f]; });
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Equipment', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.equipment_id);
      if (qr && (qr.code !== row.equipment_code || qr.label_vi !== row.name_vi || qr.label_zh !== row.name_zh)) {
        var q2 = clone_(qr); delete q2.__row;
        q2.code = row.equipment_code; q2.label_vi = row.name_vi; q2.label_zh = row.name_zh;
        writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
      }
      var after = clone_(row); delete after.__row;
      return {
        writes: writes, state: su,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: row.equipment_code, qr_key: qr ? qr.qr_key : null, record_version: row.record_version, record: projectRow_(ctx, row, 'Equipment') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/** Bản đồ entity_id → qr_key */
function qrMap_() {
  var m = {};
  readRows_('QrRegistry').forEach(function (q) { m[q.entity_id] = q.qr_key; });
  return m;
}

/**
 * equipment.view: một hồ sơ {equipment_id} (kèm thông số) hoặc danh sách
 * {filters: {q, status, location_id, category_id}, include_archived, page_size, page_token}
 */
function equipmentView_(ctx) {
  var p = ctx.req.payload || {};
  var qm = qrMap_();
  if (p.equipment_id) {
    var r = findOne_('Equipment', 'equipment_id', p.equipment_id);
    if (!r) throw apiError_('NOT_FOUND');
    var o = projectRow_(ctx, r, 'Equipment');
    o.qr_key = qm[r.equipment_id] || null;
    var specs = findAll_('EquipmentSpecs', 'equipment_id', r.equipment_id).filter(function (s) { return !s.archived_at; })
      .map(function (s) { return projectRow_(ctx, s, 'EquipmentSpecs'); });
    return { item: o, specs: specs };
  }
  var f = p.filters || {};
  var q = trimStr_(f.q).toLowerCase();
  var rows = readRows_('Equipment').filter(function (r) {
    if (r.archived_at && !p.include_archived) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.location_id && r.location_id !== f.location_id) return false;
    if (f.category_id && r.category_id !== f.category_id) return false;
    if (q) {
      var hay = [r.equipment_code, r.name_vi, r.name_zh, r.model, r.serial, r.manufacturer].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  rows.sort(function (a, b) { return String(a.equipment_code).localeCompare(String(b.equipment_code)); });
  var size = Math.min(200, Number(p.page_size) || setting_('list_page_size'));
  var start = Number(p.page_token || 0);
  var items = rows.slice(start, start + size).map(function (r) {
    var o = projectRow_(ctx, r, 'Equipment'); o.qr_key = qm[r.equipment_id] || null; return o;
  });
  return { items: items, total: rows.length, next_page_token: start + size < rows.length ? String(start + size) : null };
}

function catalogView_(ctx) {
  return {
    locations: readRows_('Locations').map(function (r) { return projectRow_(ctx, r, 'Locations'); }),
    vendors: readRows_('Vendors').map(function (r) { return projectRow_(ctx, r, 'Vendors'); }),
    lookups: readRows_('LookupValues').map(function (r) { return projectRow_(ctx, r, 'LookupValues'); })
  };
}

/* ---------------- Lưu trữ / dùng lại (4.4.1) ---------------- */

/** Ảnh LINK_VIEW của hồ sơ bị lưu trữ → riêng tư (2.6). Gọi ngoài khóa ghi; lỗi thì FAILED kèm mã */
function revokeEntityPhotos_(ctx, entityType, entityId) {
  var docs = findAll_('Documents', 'entity_id', entityId).filter(function (d) {
    return d.entity_type === entityType && d.access_scope === 'LINK_VIEW' && d.drive_sharing_state === 'LINK_SHARED';
  });
  docs.forEach(function (d) {
    var ok = true, err = '';
    try {
      ok = makePrivate_(d.drive_file_id);
      if (d.thumb_drive_file_id) ok = makePrivate_(d.thumb_drive_file_id) && ok;
    } catch (e) { ok = false; err = String(e && e.message || e).slice(0, 80); }
    withWriteLock_(function () {
      var cur = findOne_('Documents', 'document_id', d.document_id);
      if (!cur) return;
      var st = readState_();
      var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
      writeCells_('Documents', cur.__row, {
        drive_sharing_state: ok ? 'REVOKED' : 'FAILED', sharing_updated_at: isoVN_(now_()),
        sharing_error_code: ok ? '' : (err || 'NOT_PRIVATE'), sync_revision: rev
      });
      stateWrite_(st, { sync_revision: ['INT', rev], 'table_rev.Documents': ['INT', rev] }, ctx.user.user_id);
    });
  });
}

function equipmentArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.equipment_id)) throw validationError_([fieldError_('equipment_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var res = executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function () {
      var cur = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'EQUIPMENT', 'Equipment');
      if (cur.archived_at) throw validationError_([fieldError_('equipment_id', 'INVALID_VALUE')]);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur);
      row.status = 'RETIRED';
      row.archived_at = isoVN_(now_());
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Equipment', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.equipment_id);
      if (qr && qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = false; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: row.equipment_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Equipment') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: { status: before.status, archived_at: '' }, after_json: { status: 'RETIRED', archived_at: row.archived_at }, reason: trimStr_(p.reason) }
      };
    }
  });
  if (res.ok && res.code === 'OK') revokeEntityPhotos_(ctx, 'EQUIPMENT', p.equipment_id);
  return res;
}

function equipmentUnarchive_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
  if (!trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (EQUIPMENT_STATUS_.indexOf(p.status) < 0 || p.status === 'RETIRED') errs.push(fieldError_('status', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function () {
      var cur = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'EQUIPMENT', 'Equipment');
      if (!cur.archived_at) throw validationError_([fieldError_('equipment_id', 'INVALID_VALUE')]);
      var row = clone_(cur);
      row.status = p.status;
      row.archived_at = '';
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Equipment', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.equipment_id);
      if (qr && !qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = true; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: row.equipment_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Equipment') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: { status: 'RETIRED', archived_at: cur.archived_at }, after_json: { status: p.status, archived_at: '' }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Thông số thiết bị (5.5) ---------------- */

/** Khóa chuẩn: [đơn vị mặc định, đơn vị cho phép, cột giá trị (num|text), thứ tự] */
var SPEC_STD_ = {
  voltage: ['V', ['V', 'kV'], 'num', 10],
  rated_current: ['A', ['A'], 'num', 20],
  electrical_power: ['kW', ['kW', 'W', 'HP'], 'num', 30],
  frequency: ['Hz', ['Hz'], 'num', 40],
  working_pressure: ['bar', ['bar', 'MPa', 'kPa'], 'num', 50],
  flow_rate: ['m³/h', ['m³/h', 'L/min', 'L/s'], 'num', 60],
  speed: ['rpm', ['rpm'], 'num', 70],
  dimensions: ['mm', ['mm', 'm'], 'text', 80],
  weight: ['kg', ['kg', 't'], 'num', 90],
  throughput: ['kg/h', ['kg/h', 't/h', 'm³/h'], 'num', 100],
  rated_capacity_kva: ['kVA', ['kVA'], 'num', 110]
};

/** Ký hiệu đơn vị chuẩn (5.4.4); bí danh chuẩn hóa không phân biệt hoa thường */
var UNITS_ = ['kWh', 'm³', 'kW', 'kVA', 'W', 'HP', 'V', 'kV', 'A', 'Hz', 'bar', 'MPa', 'kPa', 'm³/h', 'L/min', 'L/s', 'rpm',
  'kg/h', 't/h', 'mm²', 'mm', 'm', 'kg', 't', '°C', 'h', 'min', '%', 'cái', 'bộ', 'm²', 'L', 'cuộn', 'hộp'];
var UNIT_ALIAS_ = { 'm3': 'm³', 'mm2': 'mm²', 'm3/h': 'm³/h', 'm2': 'm²', 'r/min': 'rpm', 'v/ph': 'rpm', 'l': 'L', 'oc': '°C', 'độ c': '°C' };

function normUnit_(u) {
  var s = trimStr_(u);
  if (!s) return '';
  if (UNITS_.indexOf(s) >= 0) return s;
  var low = s.toLowerCase();
  if (UNIT_ALIAS_[low]) return UNIT_ALIAS_[low];
  for (var i = 0; i < UNITS_.length; i++) if (UNITS_[i].toLowerCase() === low) return UNITS_[i];
  return s;
}

/** Đơn vị hợp lệ cho một khóa: chuẩn theo bảng 5.5; khóa riêng: danh sách đơn vị + LookupValues UNIT */
function allowedUnits_(key, lookups) {
  if (SPEC_STD_[key]) return SPEC_STD_[key][1];
  var extra = lookups.filter(function (l) { return l.group_key === 'UNIT' && l.active !== false && !l.archived_at; }).map(function (l) { return l.code; });
  return UNITS_.concat(extra);
}

function specLabel_(key, lookups) {
  if (SPEC_STD_[key]) { var p = LABELS['spec.' + key]; return { vi: p[0], zh: p[1], sort: SPEC_STD_[key][3] }; }
  var l = lookups.filter(function (x) { return x.group_key === 'SPEC_KEY' && x.code === key && x.active !== false && !x.archived_at; })[0];
  return l ? { vi: l.name_vi || l.name_zh, zh: l.name_zh || l.name_vi, sort: 500 } : null;
}

/**
 * equipment.spec.edit: một dòng thông số mỗi request.
 * {spec_id, equipment_id, spec_key, value_num, value_text, unit, sort_order} — expected_version 0 khi thêm;
 * {spec_id, remove: true, reason?} — bỏ dòng (lưu trữ mềm).
 */
function equipmentSpecEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.spec_id)) errs.push(fieldError_('spec_id', 'ID_INVALID'));
  if (errs.length) throw validationError_(errs);
  var cur0 = findOne_('EquipmentSpecs', 'spec_id', p.spec_id);
  if (p.remove) {
    if (!cur0) throw apiError_('NOT_FOUND');
    return executeWrite_(ctx, {
      entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id,
      build: function () {
        var cur = findOne_('EquipmentSpecs', 'spec_id', p.spec_id);
        assertVersion_(ctx, cur, 'EQUIPMENT_SPEC', 'EquipmentSpecs');
        var row = clone_(cur);
        row.archived_at = isoVN_(now_());
        cUpdate_(ctx, row);
        return {
          writes: [{ sheet: 'EquipmentSpecs', mode: 'update', row: row }],
          result: { entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id, record_version: row.record_version, removed: true },
          record_version: row.record_version,
          audit: { entity_type: 'EQUIPMENT', entity_id: cur.equipment_id, before_json: { spec_key: cur.spec_key, value_num: cur.value_num, value_text: cur.value_text, unit: cur.unit }, after_json: null, reason: trimStr_(p.reason) }
        };
      }
    });
  }
  var lookups = readRows_('LookupValues');
  var key = trimStr_(p.spec_key);
  var lab = /^[a-z][a-z0-9_]{0,40}$/.test(key) ? specLabel_(key, lookups) : null;
  if (!lab) errs.push(fieldError_('spec_key', 'INVALID_VALUE'));
  if (!cur0 && !isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
  if (cur0 && p.equipment_id && p.equipment_id !== cur0.equipment_id) errs.push(fieldError_('equipment_id', 'INVALID_VALUE'));
  var num = p.value_num === '' || p.value_num === null || p.value_num === undefined ? null : Number(p.value_num);
  if (num !== null && !isFinite(num)) errs.push(fieldError_('value_num', 'INVALID_VALUE'));
  var text = trimStr_(p.value_text).slice(0, 200);
  if (key === 'dimensions' && text) text = text.replace(/\s*[xX*×]\s*/g, '×').replace(/\s+/g, '');
  if (num === null && !text) errs.push(fieldError_('value_num', 'REQUIRED'));
  var unit = normUnit_(p.unit);
  if (lab && !unit && SPEC_STD_[key]) unit = SPEC_STD_[key][0];
  if (lab && unit && allowedUnits_(key, lookups).indexOf(unit) < 0) errs.push(fieldError_('unit', 'UNIT_NOT_ALLOWED'));
  var sort = p.sort_order === undefined || p.sort_order === '' || p.sort_order === null ? (lab ? lab.sort : 500) : Number(p.sort_order);
  if (!(sort >= 0 && sort <= 100000)) errs.push(fieldError_('sort_order', 'INVALID_VALUE'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var eqId = cur0 ? cur0.equipment_id : p.equipment_id;
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id,
    build: function () {
      var eq = findOne_('Equipment', 'equipment_id', eqId);
      if (!eq || eq.archived_at) throw validationError_([fieldError_('equipment_id', 'NOT_FOUND')]);
      var cur = findOne_('EquipmentSpecs', 'spec_id', p.spec_id);
      if (cur) assertVersion_(ctx, cur, 'EQUIPMENT_SPEC', 'EquipmentSpecs');
      // Mỗi cặp (thiết bị, khóa) một dòng còn hiệu lực
      var dup = findAll_('EquipmentSpecs', 'equipment_id', eqId).filter(function (s) {
        return !s.archived_at && s.spec_key === key && s.spec_id !== p.spec_id;
      });
      if (dup.length) throw validationError_([fieldError_('spec_key', 'CODE_DUPLICATE')]);
      var row = cur ? clone_(cur) : { spec_id: p.spec_id, equipment_id: eqId };
      var before = cur ? { spec_key: cur.spec_key, value_num: cur.value_num, value_text: cur.value_text, unit: cur.unit } : null;
      row.spec_key = key; row.label_vi = lab.vi; row.label_zh = lab.zh;
      row.value_num = num === null ? '' : num; row.value_text = text; row.unit = unit; row.sort_order = sort;
      row.i18n_meta = { label: { src: 'vi', state: 'HUMAN', at: isoVN_(now_()) } };
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'EquipmentSpecs', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id, record_version: row.record_version, record: projectRow_(ctx, row, 'EquipmentSpecs') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: eqId, before_json: before, after_json: { spec_key: key, value_num: row.value_num, value_text: text, unit: unit } }
      };
    }
  });
}
