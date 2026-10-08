/* 22_catalog: Danh mục chung — phụ lục 1.5 mục 4.4.13, 3.9 (Glossary), 5.5 (SPEC_KEY, UNIT).
 * Mã khu vực/nhà cung cấp: nhập tay hoặc máy chủ cấp (KV-001, NCC-0001), không đổi sau khi tạo.
 * Ngừng dùng = active FALSE (hồ sơ cũ vẫn trỏ được, không chọn mới). */

var LOCATION_TYPES_ = ['AREA', 'BUILDING', 'WORKSHOP', 'ROOM', 'STATION', 'OTHER'];
var LOOKUP_GROUPS_ = ['EQUIPMENT_CATEGORY', 'UNIT', 'SPEC_KEY', 'CAUSE'];

/** Tạo hay sửa: tạo khi expected_version = 0 và chưa có dòng */
function catalogCurrent_(ctx, sheet, key, id) {
  var cur = findOne_(sheet, key, id);
  if (!cur && Number(ctx.req.expected_version || 0) !== 0) throw apiError_('NOT_FOUND');
  return cur;
}

function boolOr_(v, dflt) {
  return v === undefined || v === null ? dflt : v === true || v === 'true' || v === 1;
}

/** location.edit {location_id, location_code?, parent_location_id?, name_vi|name_zh, type, active} — C4 */
function locationEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.location_id)) errs.push(fieldError_('location_id', 'ID_INVALID'));
  if (p.type !== undefined && p.type !== '' && LOCATION_TYPES_.indexOf(p.type) < 0) errs.push(fieldError_('type', 'INVALID_VALUE'));
  if (p.parent_location_id && (!isUuidV4_(p.parent_location_id) || p.parent_location_id === p.location_id)) errs.push(fieldError_('parent_location_id', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var cur0 = findOne_('Locations', 'location_id', p.location_id);
  var e2 = [];
  requireOneLang_(e2, p, cur0, 'name');
  if (e2.length) throw validationError_(e2);
  var tr = applyTranslations_('Locations', ['name'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'LOCATION', entity_id: p.location_id,
    build: function (st) {
      var cur = catalogCurrent_(ctx, 'Locations', 'location_id', p.location_id);
      if (cur) assertVersion_(ctx, cur, 'LOCATION', 'Locations');
      var su = {};
      var row = cur ? clone_(cur) : { location_id: p.location_id, parent_location_id: '', type: 'AREA', active: true };
      delete row.__row;
      if (!cur) row.location_code = allocCode_(st, su, 'LOCATION', trimStr_(p.location_code) || null);
      else if (p.location_code !== undefined && trimStr_(p.location_code).toUpperCase() !== cur.location_code) throw validationError_([fieldError_('location_code', 'INVALID_VALUE')]);
      if (p.parent_location_id !== undefined) {
        var parent = p.parent_location_id || '';
        // Không tạo vòng cha–con
        for (var x = parent, guard = 0; x && guard < 50; guard++) {
          if (x === p.location_id) throw validationError_([fieldError_('parent_location_id', 'INVALID_VALUE')]);
          var px = findOne_('Locations', 'location_id', x);
          if (!px) throw validationError_([fieldError_('parent_location_id', 'NOT_FOUND')]);
          x = px.parent_location_id;
        }
        row.parent_location_id = parent;
      }
      if (p.type !== undefined && p.type !== '') row.type = p.type;
      row.active = boolOr_(p.active, row.active !== false);
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh; row.i18n_meta = tr.meta;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Locations', mode: cur ? 'update' : 'insert', row: row }], state: su,
        result: { entity_type: 'LOCATION', entity_id: row.location_id, display_code: row.location_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Locations') },
        record_version: row.record_version,
        audit: { entity_type: 'LOCATION', entity_id: row.location_id, before_json: cur ? { name_vi: cur.name_vi, active: cur.active, parent: cur.parent_location_id } : null, after_json: { location_code: row.location_code, name_vi: row.name_vi, active: row.active, parent: row.parent_location_id } }
      };
    }
  });
}

var VENDOR_PLAIN_ = ['name', 'contact_name', 'phone', 'email', 'address'];

/** vendor.edit {vendor_id, vendor_code?, name, contact_name, phone, email, address, services_vi|services_zh, active} — HĐ, C3, C4 */
function vendorEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.vendor_id)) errs.push(fieldError_('vendor_id', 'ID_INVALID'));
  if (p.email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(trimStr_(p.email))) errs.push(fieldError_('email', 'INVALID_VALUE'));
  VENDOR_PLAIN_.forEach(function (f) { if (p[f] !== undefined && trimStr_(p[f]).length > 200) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  var cur0 = isUuidV4_(p.vendor_id) ? findOne_('Vendors', 'vendor_id', p.vendor_id) : null;
  if (!cur0 && !trimStr_(p.name)) errs.push(fieldError_('name', 'REQUIRED'));
  if (cur0 && p.name !== undefined && !trimStr_(p.name)) errs.push(fieldError_('name', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Vendors', ['services'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'VENDOR', entity_id: p.vendor_id,
    build: function (st) {
      var cur = catalogCurrent_(ctx, 'Vendors', 'vendor_id', p.vendor_id);
      if (cur) assertVersion_(ctx, cur, 'VENDOR', 'Vendors');
      var su = {};
      var row = cur ? clone_(cur) : { vendor_id: p.vendor_id, contact_name: '', phone: '', email: '', address: '', active: true };
      delete row.__row;
      if (!cur) row.vendor_code = allocCode_(st, su, 'VENDOR', trimStr_(p.vendor_code) || null);
      else if (p.vendor_code !== undefined && trimStr_(p.vendor_code).toUpperCase() !== cur.vendor_code) throw validationError_([fieldError_('vendor_code', 'INVALID_VALUE')]);
      VENDOR_PLAIN_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'email' ? trimStr_(p[f]).toLowerCase() : trimStr_(p[f]); });
      row.active = boolOr_(p.active, row.active !== false);
      row.services_vi = tr.values.services_vi; row.services_zh = tr.values.services_zh; row.i18n_meta = tr.meta;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Vendors', mode: cur ? 'update' : 'insert', row: row }], state: su,
        result: { entity_type: 'VENDOR', entity_id: row.vendor_id, display_code: row.vendor_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Vendors') },
        record_version: row.record_version,
        audit: { entity_type: 'VENDOR', entity_id: row.vendor_id, before_json: cur ? { name: cur.name, active: cur.active } : null, after_json: { vendor_code: row.vendor_code, name: row.name, active: row.active } }
      };
    }
  });
}

/** Mã LookupValues: SPEC_KEY snake_case (5.5); nhóm khác chữ, số và ký hiệu đơn vị */
function lookupCodeOk_(group, code) {
  if (group === 'SPEC_KEY') return /^[a-z][a-z0-9_]{1,39}$/.test(code);
  return /^[A-Za-z0-9][A-Za-z0-9._\/³²°%-]{0,31}$/.test(code);
}

/** lookup.edit {value_id, group_key, code, name_vi|name_zh, parent_value_id?, active} — C3, C4 */
function lookupEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.value_id)) errs.push(fieldError_('value_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.value_id) ? findOne_('LookupValues', 'value_id', p.value_id) : null;
  var group = cur0 ? cur0.group_key : String(p.group_key || '');
  var code = cur0 ? cur0.code : trimStr_(p.code);
  if (!cur0) {
    if (LOOKUP_GROUPS_.indexOf(group) < 0) errs.push(fieldError_('group_key', 'INVALID_VALUE'));
    if (!code) errs.push(fieldError_('code', 'REQUIRED'));
    else if (!lookupCodeOk_(group, code)) errs.push(fieldError_('code', 'CODE_INVALID'));
    else if (group === 'SPEC_KEY' && SPEC_STD_[code]) errs.push(fieldError_('code', 'CODE_DUPLICATE'));
  } else {
    if (p.group_key !== undefined && p.group_key !== cur0.group_key) errs.push(fieldError_('group_key', 'INVALID_VALUE'));
    if (p.code !== undefined && trimStr_(p.code) !== cur0.code) errs.push(fieldError_('code', 'INVALID_VALUE'));
  }
  if (p.parent_value_id && !isUuidV4_(p.parent_value_id)) errs.push(fieldError_('parent_value_id', 'INVALID_VALUE'));
  requireOneLang_(errs, p, cur0, 'name');
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('LookupValues', ['name'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'LOOKUP', entity_id: p.value_id,
    build: function () {
      var cur = catalogCurrent_(ctx, 'LookupValues', 'value_id', p.value_id);
      if (cur) assertVersion_(ctx, cur, 'LOOKUP', 'LookupValues');
      if (!cur) {
        var dup = readRows_('LookupValues').some(function (l) { return l.group_key === group && String(l.code).toLowerCase() === code.toLowerCase(); });
        if (dup) throw validationError_([fieldError_('code', 'CODE_DUPLICATE')]);
      }
      if (p.parent_value_id && !findRowNums_('LookupValues', 'value_id', p.parent_value_id).length) throw validationError_([fieldError_('parent_value_id', 'NOT_FOUND')]);
      var row = cur ? clone_(cur) : { value_id: p.value_id, group_key: group, code: code, parent_value_id: '', active: true };
      delete row.__row;
      if (p.parent_value_id !== undefined) row.parent_value_id = p.parent_value_id || '';
      row.active = boolOr_(p.active, row.active !== false);
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh; row.i18n_meta = tr.meta;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'LookupValues', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'LOOKUP', entity_id: row.value_id, display_code: row.code, record_version: row.record_version, record: projectRow_(ctx, row, 'LookupValues') },
        record_version: row.record_version,
        audit: { entity_type: 'LOOKUP', entity_id: row.value_id, before_json: cur ? { name_vi: cur.name_vi, active: cur.active } : null, after_json: { group_key: row.group_key, code: row.code, name_vi: row.name_vi, active: row.active } }
      };
    }
  });
}

/**
 * glossary.edit {glossary_id, term_vi, term_zh, note, active, approve} — C3, C4.
 * Cả hai thuật ngữ bắt buộc, không trùng trong các dòng active (không phân biệt hoa thường).
 * Đổi thuật ngữ thì bỏ duyệt, trừ khi duyệt lại ngay (approve: true). Chỉ dòng đã duyệt được dùng khi dịch.
 */
function glossaryEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.glossary_id)) errs.push(fieldError_('glossary_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.glossary_id) ? findOne_('Glossary', 'glossary_id', p.glossary_id) : null;
  var vi = p.term_vi !== undefined ? trimStr_(p.term_vi).replace(/\s+/g, ' ') : (cur0 ? cur0.term_vi : '');
  var zh = p.term_zh !== undefined ? trimStr_(p.term_zh).replace(/\s+/g, ' ') : (cur0 ? cur0.term_zh : '');
  if (!vi) errs.push(fieldError_('term_vi', 'REQUIRED'));
  if (!zh) errs.push(fieldError_('term_zh', 'REQUIRED'));
  if (vi.length > 120) errs.push(fieldError_('term_vi', 'INVALID_VALUE'));
  if (zh.length > 120) errs.push(fieldError_('term_zh', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var res = executeWrite_(ctx, {
    entity_type: 'GLOSSARY', entity_id: p.glossary_id,
    build: function () {
      var cur = catalogCurrent_(ctx, 'Glossary', 'glossary_id', p.glossary_id);
      if (cur) assertVersion_(ctx, cur, 'GLOSSARY', 'Glossary');
      var row = cur ? clone_(cur) : { glossary_id: p.glossary_id, note: '', active: true, approved_by: '', approved_at: '' };
      delete row.__row;
      var changed = !cur || row.term_vi !== vi || row.term_zh !== zh;
      row.term_vi = vi; row.term_zh = zh;
      if (p.note !== undefined) row.note = trimStr_(p.note).slice(0, 300);
      row.active = boolOr_(p.active, row.active !== false);
      if (row.active) {
        var dup = readRows_('Glossary').filter(function (g) {
          return g.glossary_id !== row.glossary_id && g.active && !g.archived_at;
        });
        var e3 = [];
        if (dup.some(function (g) { return normTerm_(g.term_vi) === normTerm_(vi); })) e3.push(fieldError_('term_vi', 'CODE_DUPLICATE'));
        if (dup.some(function (g) { return normTerm_(g.term_zh) === normTerm_(zh); })) e3.push(fieldError_('term_zh', 'CODE_DUPLICATE'));
        if (e3.length) throw validationError_(e3);
      }
      if (changed) { row.approved_by = ''; row.approved_at = ''; }
      if (p.approve === true) { row.approved_by = ctx.user.user_id; row.approved_at = isoVN_(now_()); }
      if (p.approve === false) { row.approved_by = ''; row.approved_at = ''; }
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Glossary', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'GLOSSARY', entity_id: row.glossary_id, record_version: row.record_version, record: projectRow_(ctx, row, 'Glossary') },
        record_version: row.record_version,
        audit: { entity_type: 'GLOSSARY', entity_id: row.glossary_id, before_json: cur ? { term_vi: cur.term_vi, term_zh: cur.term_zh, approved: !!cur.approved_by, active: cur.active } : null, after_json: { term_vi: vi, term_zh: zh, approved: !!row.approved_by, active: row.active } }
      };
    }
  });
  cache_().remove('glossary:approved');
  DB_.glossary = null;
  return res;
}
