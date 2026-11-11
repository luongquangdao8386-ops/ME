/* 42_iso_feed: cửa chỉ-đọc "ngày có hồ sơ" cho app ISO (1.0.0-d4.35; hợp đồng ở HUONG_DAN_TRIEN_KHAI.md Phần K của repo ISO).
 * App ISO hỏi mỗi giờ "mã biểu nào có hồ sơ vào ngày nào" để ô ✓ của biểu in từ M&E tự sáng, không ai phải nộp lại.
 * Không cần phiên; khóa bằng mã kết nối FEED_KEY_ISO (riêng, khác FEED_KEY_CS của Checksheet), tạo bằng adminCreateFeedKeyIso.
 * Chỉ trả {app_id, items: [{form_code, date, count}], server_time} — không tên thiết bị, giá, người, ảnh.
 *
 * Mã biểu lấy từ:
 *  - Bảng ánh xạ Settings `iso_form_map` = {mã biểu: "NGUỒN" | "NGUỒN:tham số,tham số"} (sửa ở Tài khoản → Quản trị → Kết nối app ISO);
 *  - Mã biểu của mẫu checklist (ChecklistTemplates.form_code, schema 1.5.6): phiếu bảo trì nghiệm thu mang mã của checklist;
 *    checklist không có mã thì tính cho các mã gắn nguồn WO_ACCEPTED (mặc định BM-CĐ-03-03).
 * Hồ sơ đã hủy / lưu trữ không tính. Đọc bằng bộ đệm bảng (tableCache_) như feed.equipment. */

var ISO_FEED_DAYS_ = 400;
var ISO_FEED_MAX_ITEMS_ = 60000;
var ISO_MAP_MAX_ = 120;

/** Nguồn ngày có hồ sơ: đợt có bảng nguồn, kiểu tham số (types = loại kiểm định; utility = loại đồng hồ; reports = mã mẫu báo cáo) */
var ISO_SOURCES_ = {
  EQUIPMENT_EDIT: { dot: 1 },
  PLAN_EDIT: { dot: 2 },
  ANNUAL_PLAN: { dot: 5 },
  WO_ACCEPTED: { dot: 2 },
  REPAIR_REPORTED: { dot: 2 },
  REPAIR_COMPLETED: { dot: 2 },
  REPAIR_DOWNTIME: { dot: 2 },
  CONTRACT_SERVICE: { dot: 1 },
  INSPECTION: { dot: 1, arg: 'types' },
  MATERIAL_EDIT: { dot: 1 },
  METER_READING: { dot: 3, arg: 'utility' },
  REPORT_SAVED: { dot: 3, arg: 'reports' }
};
var ISO_SOURCE_LIST_ = Object.keys(ISO_SOURCES_);

/* ---------------- Bảng ánh xạ ---------------- */

/** "NGUỒN:a,b" → {src, args}; sai → null */
function isoMapEntry_(v) {
  var s = trimStr_(v === null || v === undefined ? '' : String(v));
  if (!s) return null;
  var i = s.indexOf(':');
  var src = (i < 0 ? s : s.slice(0, i)).trim().toUpperCase();
  if (!ISO_SOURCES_[src]) return null;
  var args = i < 0 ? [] : s.slice(i + 1).split(',').map(function (a) { return trimStr_(a); }).filter(Boolean);
  if (args.length > 10 || args.some(function (a) { return a.length > 60; })) return null;
  if (args.length && !ISO_SOURCES_[src].arg) return null;
  if (ISO_SOURCES_[src].arg === 'utility' && args.some(function (a) { return UTILITY_KINDS_ISO_.indexOf(a.toUpperCase()) < 0; })) return null;
  if (ISO_SOURCES_[src].arg === 'utility' || ISO_SOURCES_[src].arg === 'reports') args = args.map(function (a) { return a.toUpperCase(); });
  return { src: src, args: args };
}
var UTILITY_KINDS_ISO_ = ['ELECTRICITY', 'WATER'];

function isoMapValue_(e) { return e.src + (e.args.length ? ':' + e.args.join(',') : ''); }

/**
 * Settings iso_form_map: {mã biểu: nguồn}. Mã ≤ 40 ký tự, không xuống dòng; nguồn trống → bỏ dòng; ≤ 120 dòng.
 * Trả bản đã chuẩn hóa ("NGUỒN:tham số"); sai → bad().
 */
function parseIsoFormMap_(v, bad) {
  var o = v;
  if (typeof o === 'string') { try { o = JSON.parse(o || '{}'); } catch (e) { throw bad(); } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw bad();
  var keys = Object.keys(o);
  if (keys.length > ISO_MAP_MAX_) throw bad();
  var out = {};
  keys.forEach(function (k) {
    var code = trimStr_(k).replace(/\s+/g, ' ');
    if (!code || code.length > 40 || /[\r\n]/.test(code)) throw bad();
    var raw = o[k];
    if (raw === null || raw === undefined || trimStr_(String(raw)) === '') return;
    var e = isoMapEntry_(raw);
    if (!e) throw bad();
    out[code] = isoMapValue_(e);
  });
  return out;
}

/** Bảng ánh xạ đang dùng: [{code, src, args}] (dòng sai trong Settings bị bỏ qua) */
function isoMapList_(map) {
  var m = map || setting_('iso_form_map');
  if (!m || typeof m !== 'object' || Array.isArray(m)) m = ISO_FORM_MAP_DEFAULT_;
  var out = [];
  Object.keys(m).forEach(function (code) {
    var e = isoMapEntry_(m[code]);
    if (e) out.push({ code: trimStr_(code), src: e.src, args: e.args });
  });
  return out;
}

/* ---------------- Ngày có hồ sơ ---------------- */

/** Ngày (giờ Việt Nam) của một giá trị ngày hoặc thời điểm; '' nếu không đọc được */
function isoDay_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return dateVN_(v);
  var s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isDateStr_(s) ? s : '';
  var t = parseTime_(s);
  return t ? dateVN_(t) : '';
}

/** Chữ so khớp tên loại kiểm định: bỏ dấu tiếng Việt, đ → d, chữ thường, gộp khoảng trắng */
function isoFold_(s) {
  var t = String(s || '');
  try { t = t.normalize('NFD'); } catch (e) { /* bỏ qua */ }
  return t.replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Ngày bắt đầu đọc: since hợp lệ và không cũ hơn hôm nay − 400 ngày (giờ Việt Nam), không thì hôm nay − 400 */
function isoSince_(since, today) {
  var min = addDaysIso_(today, -ISO_FEED_DAYS_);
  var s = trimStr_(since);
  return isDateStr_(s) && s >= min ? s : min;
}

/**
 * Tính ngày có hồ sơ cho mọi mã biểu: {items: [{form_code, date, count}] (theo mã rồi ngày), stats: {mã: {...}}, truncated}.
 * opts: {since, today, map (bảng ánh xạ dạng object, mặc định Settings)}.
 */
function isoEvidence_(opts) {
  var today = opts.today || todayVN_();
  var since = isoSince_(opts.since, today);
  var list = isoMapList_(opts.map);
  var dot = releasedDot_();
  var bySrc = {};
  list.forEach(function (e) { if (ISO_SOURCES_[e.src].dot <= dot) (bySrc[e.src] = bySrc[e.src] || []).push(e); });
  var withCodes = dot >= 6; // cột ChecklistTemplates.form_code có từ schema 1.5.6
  var need = {};
  var want = function (names) { names.forEach(function (n) { need[n] = true; }); };
  if (bySrc.EQUIPMENT_EDIT) want(['Equipment', 'EquipmentSpecs']);
  if (bySrc.PLAN_EDIT) want(['MaintenancePlans']);
  if (bySrc.ANNUAL_PLAN) want(['AnnualPlans']);
  if (dot >= 2 && (bySrc.WO_ACCEPTED || withCodes)) want(['WorkOrders', 'ChecklistTemplates']);
  if (bySrc.REPAIR_REPORTED || bySrc.REPAIR_COMPLETED || bySrc.REPAIR_DOWNTIME) want(['Repairs']);
  if (bySrc.CONTRACT_SERVICE) want(['ContractServices']);
  if (bySrc.INSPECTION) want(['Inspections', 'InspectionRequirements', 'InspectionTypes']);
  if (bySrc.MATERIAL_EDIT) want(['Materials']);
  if (bySrc.METER_READING) want(['MeterReadings', 'Meters']);
  if (bySrc.REPORT_SAVED) want(['ReportRuns', 'ReportDefinitions']);
  var tc = tableCache_(Object.keys(need), readState_());
  var counts = {}, src = {};
  var add = function (code, day, n, from) {
    if (!code || !day || day < since || day > today) return;
    var k = code + '\u0001' + day;
    counts[k] = (counts[k] || 0) + (n || 1);
    if (!src[code]) src[code] = from;
  };
  var addAll = function (entries, day, keep) {
    (entries || []).forEach(function (e) { if (!keep || keep(e)) add(e.code, day, 1, e.src); });
  };
  // Hồ sơ: ngày tạo và ngày sửa gần nhất (một lần mỗi ngày mỗi hồ sơ)
  var recDays = function (r, extra) {
    var ds = {};
    [r.created_at, r.updated_at].concat(extra || []).forEach(function (x) { var d = isoDay_(x); if (d) ds[d] = true; });
    return Object.keys(ds);
  };

  if (bySrc.EQUIPMENT_EDIT) {
    var specUpd = {};
    tc.rows('EquipmentSpecs').forEach(function (s) {
      if (String(s.updated_at || '') > String(specUpd[s.equipment_id] || '')) specUpd[s.equipment_id] = s.updated_at;
    });
    tc.rows('Equipment').forEach(function (e) {
      if (e.archived_at) return;
      recDays(e, specUpd[e.equipment_id] ? [specUpd[e.equipment_id]] : []).forEach(function (d) { addAll(bySrc.EQUIPMENT_EDIT, d); });
    });
  }
  if (bySrc.PLAN_EDIT) {
    tc.rows('MaintenancePlans').forEach(function (p) {
      if (p.archived_at) return;
      recDays(p).forEach(function (d) { addAll(bySrc.PLAN_EDIT, d); });
    });
  }
  if (bySrc.ANNUAL_PLAN) {
    tc.rows('AnnualPlans').forEach(function (a) {
      if (a.archived_at || (a.status !== 'APPROVED' && a.status !== 'SUPERSEDED')) return;
      addAll(bySrc.ANNUAL_PLAN, isoDay_(a.approved_at));
    });
  }
  if (need.WorkOrders) {
    // Mã biểu của mẫu checklist: theo phiên bản mới nhất (gắn mã sau vẫn tính cho phiếu cũ)
    var clCode = {}, clRev = {};
    if (withCodes) tc.rows('ChecklistTemplates').forEach(function (r) {
      if (r.archived_at) return;
      var rev = Number(r.revision) || 0;
      if (clRev[r.template_id] === undefined || rev > clRev[r.template_id]) { clRev[r.template_id] = rev; clCode[r.template_id] = trimStr_(r.form_code); }
    });
    tc.rows('WorkOrders').forEach(function (w) {
      if (w.archived_at || w.status !== 'COMPLETED') return;
      var d = isoDay_(w.approved_at) || isoDay_(w.end_at);
      var code = w.checklist_template_id ? clCode[w.checklist_template_id] : '';
      if (code) add(code, d, 1, 'CHECKLIST');
      else addAll(bySrc.WO_ACCEPTED, d);
    });
  }
  if (need.Repairs) {
    tc.rows('Repairs').forEach(function (r) {
      if (r.archived_at || r.status === 'CANCELLED') return;
      addAll(bySrc.REPAIR_REPORTED, isoDay_(r.reported_at));
      if (r.stopped_at) addAll(bySrc.REPAIR_DOWNTIME, isoDay_(r.stopped_at));
      if (r.status === 'COMPLETED') addAll(bySrc.REPAIR_COMPLETED, isoDay_(r.approved_at) || isoDay_(r.repair_end_at) || isoDay_(r.restored_at) || isoDay_(r.reported_at));
    });
  }
  if (bySrc.CONTRACT_SERVICE) {
    tc.rows('ContractServices').forEach(function (s) {
      if (s.archived_at || (s.status !== 'DONE' && s.status !== 'ACCEPTED')) return;
      addAll(bySrc.CONTRACT_SERVICE, isoDay_(s.performed_at));
    });
  }
  if (bySrc.INSPECTION) {
    var types = {}, reqType = {};
    tc.rows('InspectionTypes').forEach(function (t) { types[t.inspection_type_id] = t; });
    tc.rows('InspectionRequirements').forEach(function (q) { reqType[q.requirement_id] = q.inspection_type_id; });
    var typeOk = function (e, t) {
      if (!e.args.length) return true;
      if (!t) return false;
      var code = String(t.code || '').toUpperCase(), nv = isoFold_(t.name_vi), nz = isoFold_(t.name_zh);
      return e.args.some(function (a) { var f = isoFold_(a); return String(a).toUpperCase() === code || (f && (nv.indexOf(f) >= 0 || nz.indexOf(f) >= 0)); });
    };
    tc.rows('Inspections').forEach(function (i) {
      if (i.archived_at || (i.status !== 'APPROVED' && i.status !== 'SUPERSEDED')) return;
      var t = types[reqType[i.requirement_id]];
      addAll(bySrc.INSPECTION, isoDay_(i.inspection_date), function (e) { return typeOk(e, t); });
    });
  }
  if (bySrc.MATERIAL_EDIT) {
    tc.rows('Materials').forEach(function (m) {
      if (m.archived_at) return;
      recDays(m).forEach(function (d) { addAll(bySrc.MATERIAL_EDIT, d); });
    });
  }
  if (bySrc.METER_READING) {
    var mtype = {};
    tc.rows('Meters').forEach(function (m) { mtype[m.meter_id] = m.utility_type; });
    tc.rows('MeterReadings').forEach(function (r) {
      if (r.archived_at || r.status === 'VOID') return;
      var ut = mtype[r.meter_id];
      addAll(bySrc.METER_READING, isoDay_(r.measured_at), function (e) { return !e.args.length || e.args.indexOf(String(ut || '')) >= 0; });
    });
  }
  if (bySrc.REPORT_SAVED) {
    var defCode = {};
    tc.rows('ReportDefinitions').forEach(function (d) { defCode[d.report_definition_id] = String(d.code || '').toUpperCase(); });
    tc.rows('ReportRuns').forEach(function (r) {
      if (r.archived_at || (r.status && r.status !== 'SAVED')) return;
      var code = defCode[r.report_definition_id] || '';
      addAll(bySrc.REPORT_SAVED, isoDay_(r.generated_at || r.created_at), function (e) { return !e.args.length || e.args.indexOf(code) >= 0; });
    });
  }

  var items = Object.keys(counts).map(function (k) {
    var p = k.split('\u0001');
    return { form_code: p[0], date: p[1], count: counts[k] };
  });
  var truncated = false;
  if (items.length > ISO_FEED_MAX_ITEMS_) {
    // Quá giới hạn hợp đồng: bỏ ngày cũ nhất
    items.sort(function (a, b) { return b.date.localeCompare(a.date); });
    items = items.slice(0, ISO_FEED_MAX_ITEMS_);
    truncated = true;
  }
  items.sort(function (a, b) { return a.form_code.localeCompare(b.form_code) || a.date.localeCompare(b.date); });
  var stats = {};
  items.forEach(function (x) {
    var s = stats[x.form_code] || (stats[x.form_code] = { form_code: x.form_code, from: src[x.form_code] || '', days: 0, count: 0, first_date: x.date, last_date: x.date });
    s.days++; s.count += x.count;
    if (x.date < s.first_date) s.first_date = x.date;
    if (x.date > s.last_date) s.last_date = x.date;
  });
  return { since: since, today: today, items: items, stats: stats, truncated: truncated, list: list, checklist_codes: withCodes };
}

/* ---------------- Cửa đọc cho app ISO ---------------- */

/** feed.isoEvidence {key, since?, client?} — public; sai mã → FORBIDDEN */
function feedIsoEvidence_(req) {
  var p = req.payload || {};
  var want = prop_('FEED_KEY_ISO') || '';
  if (want.length < FEED_MIN_KEY_ || !ctEqualStr_(String(p.key || ''), want)) throw apiError_('FORBIDDEN');
  var r = isoEvidence_({ since: p.since });
  return { app_id: APP_ID, items: r.items, server_time: isoVN_(now_()) };
}

/**
 * Chạy từ trình soạn: tạo mã kết nối cho app ISO (một lần) và in ra nhật ký để chép sang
 * app ISO → Tài khoản → Quản trị → Kết nối M&E / Checksheet. Đã có mã thì in lại mã cũ (không đổi, app ISO vẫn chạy).
 * Muốn đổi mã (lộ mã): xóa FEED_KEY_ISO trong Thuộc tính tập lệnh rồi chạy lại, nhập mã mới bên app ISO.
 */
function adminCreateFeedKeyIso() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('FEED_KEY_ISO');
  if (!k) {
    k = b64url_(randomSecret32_());
    props.setProperty('FEED_KEY_ISO', k);
    log_('Đã tạo. Mã kết nối cho app ISO: ' + k);
  } else {
    log_('Mã kết nối cho app ISO: ' + k + ' (đang dùng, không đổi)');
  }
  log_('Chép mã này và link /exec của máy chủ M&E này sang app ISO → Tài khoản → Quản trị → Kết nối M&E / Checksheet → thẻ App M&E.');
}

/* ---------------- Trang Quản trị → Kết nối app ISO ---------------- */

/**
 * iso.feed.preview {map?} (C4): đã có mã kết nối chưa, bảng ánh xạ (đang lưu hoặc bản nháp gửi lên), mặc định,
 * và số ngày có hồ sơ 400 ngày gần nhất của từng mã — như app ISO sẽ nhận. Không ghi gì.
 */
function isoFeedPreview_(ctx) {
  var p = ctx.req.payload || {};
  var map = null;
  if (p.map !== undefined && p.map !== null) {
    map = parseIsoFormMap_(p.map, function () { return validationError_([fieldError_('map', 'INVALID_VALUE')]); });
  }
  var saved = setting_('iso_form_map');
  var r = isoEvidence_({ map: map || saved });
  var dot = releasedDot_();
  return {
    key_set: !!prop_('FEED_KEY_ISO'),
    map: map || saved || {},
    default_map: ISO_FORM_MAP_DEFAULT_,
    sources: ISO_SOURCE_LIST_.map(function (k) { return { key: k, arg: ISO_SOURCES_[k].arg || '', enabled: ISO_SOURCES_[k].dot <= dot }; }),
    stats: Object.keys(r.stats).map(function (k) { return r.stats[k]; }),
    since: r.since, today: r.today, truncated: r.truncated, checklist_codes: r.checklist_codes,
    total_items: r.items.length
  };
}
