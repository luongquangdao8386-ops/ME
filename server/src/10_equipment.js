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
      assertVersion_(ctx, cur, 'EQUIPMENT');
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

function equipmentView_(ctx) {
  var p = ctx.req.payload;
  var qm = qrMap_();
  if (p.equipment_id) {
    var r = findOne_('Equipment', 'equipment_id', p.equipment_id);
    if (!r) throw apiError_('NOT_FOUND');
    var o = projectRow_(ctx, r, 'Equipment');
    o.qr_key = qm[r.equipment_id] || null;
    return { item: o };
  }
  var rows = readRows_('Equipment').filter(function (r) { return p.include_archived || !r.archived_at; });
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
