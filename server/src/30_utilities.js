/* 30_utilities: Điện nước — 1.4 §5.5, §10.2–10.3; phụ lục 1.5 mục 3.12 (B1), 4.4.6, 4.5, 4.6, 6.9.2.
 * Đồng hồ → giai đoạn (thay/reset/đổi hệ số tạo giai đoạn mới, có số chốt và số mở) → chỉ số lũy kế ghi giờ đọc thực tế.
 * Chốt kỳ (B1): số chốt tại mốc B = lần đọc hợp lệ đầu tiên trong [B, B + W giờ); không nội suy, không chia đều;
 * lần đọc trước mốc không bao giờ dùng làm số chốt. Kết quả kỳ là dữ liệu tính, không lưu thành bảng.
 * Chỉ số giảm trong cùng giai đoạn mà không có sự kiện → NEEDS_REVIEW, không dùng để tính. */

var UTILITY_TYPES_ = ['ELECTRICITY', 'WATER'];
var UTILITY_UNIT_ = { ELECTRICITY: 'kWh', WATER: 'm³' };
var PERIOD_TYPES_ = ['DAY_1', 'DAY_5', 'DAY_10', 'MONTH', 'CUSTOM'];
var METER_EVENT_TYPES_ = ['REPLACE', 'RESET', 'MULTIPLIER_CHANGE'];
var TARIFF_PRICING_ = ['FLAT'];
var READING_KIND_ORDER_ = { SEGMENT_CLOSING: 0, SEGMENT_OPENING: 1, REGULAR: 2 };
var METER_VALUE_MAX_ = 1e12;
var MULTIPLIER_MAX_ = 100000;
var PERIOD_CHART_N_ = { DAY_1: 7, DAY_5: 6, DAY_10: 6, MONTH: 6, CUSTOM: 1 };

/* ---------------- Số, thời điểm ---------------- */

/** Số không âm, tối đa 3 chữ số lẻ (chỉ số đồng hồ giữ đúng số lẻ đã nhập, 5.4.1); null nếu sai */
function meterNum_(v, max) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return null;
  var n = Number(v);
  if (!isFinite(n) || n < 0 || n >= (max || METER_VALUE_MAX_)) return null;
  if (Math.abs(Math.round(n * 1000) - n * 1000) > 1e-6 * Math.max(1, Math.abs(n * 1000))) return null;
  return Math.round(n * 1000) / 1000;
}

function milli_(v) { return Math.round(Number(v) * 1000); }

/** (cuối − đầu) × hệ số, tính bằng số nguyên theo phần nghìn (5.4.1); trả số đã đổi lại đơn vị */
function segUse_(startV, endV, mult) {
  var d = milli_(endV) - milli_(startV), m = milli_(mult);
  var p = d * m;
  var outMilli = Math.abs(p) < 9e15 ? Math.round(p / 1000) : Number((BigInt(d) * BigInt(m) + BigInt(500)) / BigInt(1000));
  return outMilli / 1000;
}

/** Mốc 00:00 giờ Việt Nam của một ngày YYYY-MM-DD (ms) */
function boundaryMs_(iso) {
  return Date.parse(iso + 'T00:00:00+07:00');
}

function windowHours_() {
  var w = Number(setting_('meter_boundary_window_hours'));
  return w >= 1 && w <= 24 ? Math.floor(w) : 24;
}

function lastDayOfMonth_(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Kỳ chứa ngày d theo kiểu kỳ (3.12): [a, b] (ngày, gồm cả hai đầu) */
function periodOf_(type, d) {
  var y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  var ym = d.slice(0, 8);
  var last = lastDayOfMonth_(y, m);
  if (type === 'DAY_1') return [d, d];
  if (type === 'MONTH') return [ym + '01', ym + pad2_(last)];
  var step = type === 'DAY_5' ? 5 : 10;
  var start = Math.floor((day - 1) / step) * step + 1;
  // Kỳ cuối tháng gom phần còn lại (26–cuối; 21–cuối)
  var lastStart = Math.floor((last - 1) / step) * step + 1;
  if (type === 'DAY_5' && lastStart > 26) lastStart = 26;
  if (type === 'DAY_10' && lastStart > 21) lastStart = 21;
  if (start > lastStart) start = lastStart;
  var end = start === lastStart ? last : start + step - 1;
  return [ym + pad2_(start), ym + pad2_(end)];
}

/** Kỳ liền trước của kỳ [a, b] */
function prevPeriod_(type, a) {
  return periodOf_(type, addDaysIso_(a, -1));
}

/* ---------------- Đọc dữ liệu đồng hồ ---------------- */

function meterOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('meter_id', 'ID_INVALID')]);
  var m = findOne_('Meters', 'meter_id', id);
  if (!m || m.archived_at) throw apiError_('NOT_FOUND');
  return m;
}

/** Giai đoạn của đồng hồ, sắp theo thứ tự */
function meterSegments_(meterId, all) {
  return (all || findAll_('MeterSegments', 'meter_id', meterId)).filter(function (s) { return s.meter_id === meterId && !s.archived_at; })
    .sort(function (a, b) { return Number(a.seq_no) - Number(b.seq_no); });
}

/** Giai đoạn chứa thời điểm ms: [start_at, end_at) ; null nếu trước giai đoạn đầu */
function segmentAt_(segs, ms) {
  for (var i = segs.length - 1; i >= 0; i--) {
    var s = segs[i];
    var st = tms_(s.start_at);
    if (st === null || ms >= st) {
      var en = tms_(s.end_at);
      if (en !== null && ms >= en) return null;
      return s;
    }
  }
  return null;
}

/** Thứ tự chọn số chốt: lúc đọc → giai đoạn cũ trước → chốt trước mở → lúc ghi */
function readingCmp_(segSeq) {
  return function (a, b) {
    return (tms_(a.measured_at) - tms_(b.measured_at)) || ((segSeq[a.meter_segment_id] || 0) - (segSeq[b.meter_segment_id] || 0)) ||
      ((READING_KIND_ORDER_[a.reading_kind] || 2) - (READING_KIND_ORDER_[b.reading_kind] || 2)) || String(a.created_at).localeCompare(String(b.created_at));
  };
}

/**
 * Trạng thái VALID/NEEDS_REVIEW của các lần đọc thường trong một giai đoạn (bỏ VOID). Xét theo thứ tự ghi (lần ghi trước
 * được giữ): một lần đọc hợp lệ khi không nhỏ hơn lần hợp lệ liền trước và không lớn hơn lần hợp lệ liền sau (theo lúc đọc).
 * Số mở/chốt của giai đoạn luôn hợp lệ. Trả {reading_id: status}.
 */
function segmentStatuses_(rows) {
  var valid = [];
  var out = {};
  var put = function (r) {
    var t = tms_(r.measured_at);
    var i = 0;
    while (i < valid.length && tms_(valid[i].measured_at) <= t) i++;
    valid.splice(i, 0, r);
  };
  var live = rows.filter(function (r) { return r.status !== 'VOID'; });
  live.filter(function (r) { return r.reading_kind === 'SEGMENT_OPENING' || r.reading_kind === 'SEGMENT_CLOSING'; }).forEach(function (r) { out[r.reading_id] = 'VALID'; put(r); });
  live.filter(function (r) { return r.reading_kind !== 'SEGMENT_OPENING' && r.reading_kind !== 'SEGMENT_CLOSING'; })
    .sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)) || (tms_(a.measured_at) - tms_(b.measured_at)); })
    .forEach(function (r) {
      var t = tms_(r.measured_at), v = milli_(r.cumulative_value);
      var prev = null, next = null;
      valid.forEach(function (x) {
        var tx = tms_(x.measured_at);
        if (tx <= t) prev = x; else if (!next) next = x;
      });
      var ok = (!prev || v >= milli_(prev.cumulative_value)) && (!next || v <= milli_(next.cumulative_value));
      out[r.reading_id] = ok ? 'VALID' : 'NEEDS_REVIEW';
      if (ok) put(r);
    });
  return out;
}

/**
 * Tính lại trạng thái các lần đọc của những giai đoạn bị ảnh hưởng; đẩy dòng đổi trạng thái vào writes.
 * rowsBySeg: {segment_id: [readings sau khi đã áp thay đổi]}; skip: reading_id đã có trong writes (đã đặt trạng thái riêng)
 */
function recheckSegments_(ctx, rowsBySeg, writes, skip) {
  var changed = [];
  Object.keys(rowsBySeg).forEach(function (sid) {
    var st = segmentStatuses_(rowsBySeg[sid]);
    rowsBySeg[sid].forEach(function (r) {
      if (r.status === 'VOID' || !st[r.reading_id]) return;
      if (skip && skip[r.reading_id]) { skip[r.reading_id].status = st[r.reading_id]; return; }
      if (r.status === st[r.reading_id]) return;
      var r2 = clone_(r); delete r2.__row;
      r2.status = st[r.reading_id];
      cUpdate_(ctx, r2);
      writes.push({ sheet: 'MeterReadings', mode: 'update', row: r2 });
      changed.push(r2.reading_id);
    });
  });
  return changed;
}

/* ---------------- Đồng hồ (meter.edit) ---------------- */

var METER_CYCLE_DEFAULT_ = 'MONTH';

function checkMeterFields_(p, errs, cur) {
  if (p.utility_type !== undefined && UTILITY_TYPES_.indexOf(p.utility_type) < 0) errs.push(fieldError_('utility_type', p.utility_type ? 'INVALID_VALUE' : 'REQUIRED'));
  if (p.multiplier !== undefined && meterNum_(p.multiplier, MULTIPLIER_MAX_) === null) errs.push(fieldError_('multiplier', 'INVALID_VALUE'));
  if (p.multiplier !== undefined && Number(p.multiplier) === 0) errs.push(fieldError_('multiplier', 'INVALID_VALUE'));
  if (p.reading_cycle_type !== undefined && PERIOD_TYPES_.indexOf(p.reading_cycle_type) < 0) errs.push(fieldError_('reading_cycle_type', 'INVALID_VALUE'));
  var cyc = p.reading_cycle_type !== undefined ? p.reading_cycle_type : (cur ? cur.reading_cycle_type : METER_CYCLE_DEFAULT_);
  if (cyc === 'CUSTOM') {
    var v = p.reading_cycle_value !== undefined ? p.reading_cycle_value : (cur ? cur.reading_cycle_value : null);
    var a = p.reading_cycle_anchor_date !== undefined ? p.reading_cycle_anchor_date : (cur ? cur.reading_cycle_anchor_date : '');
    if (!(Number(v) >= 1 && Number(v) <= 31 && Math.floor(Number(v)) === Number(v))) errs.push(fieldError_('reading_cycle_value', 'INVALID_VALUE'));
    if (!isDateStr_(a)) errs.push(fieldError_('reading_cycle_anchor_date', a ? 'INVALID_DATE' : 'REQUIRED'));
  }
  ['location_id', 'parent_meter_id', 'assigned_user_id'].forEach(function (f) {
    if (p[f] !== undefined && p[f] !== '' && !isUuidV4_(p[f])) errs.push(fieldError_(f, 'ID_INVALID'));
  });
  if (p.serial !== undefined && String(p.serial).length > 80) errs.push(fieldError_('serial', 'INVALID_VALUE'));
  if (p.note !== undefined && String(p.note).length > 500) errs.push(fieldError_('note', 'INVALID_VALUE'));
  if (p.opening_value !== undefined && p.opening_value !== '' && p.opening_value !== null && meterNum_(p.opening_value) === null) errs.push(fieldError_('opening_value', 'INVALID_VALUE'));
  checkTimeField_(p, 'opening_at', errs);
}

/** Đồng hồ cha: cùng loại, không phải chính nó, không tạo vòng (A → B → A) */
function assertMeterParent_(meterId, parentId, type, errs) {
  if (!parentId) return;
  if (parentId === meterId) { errs.push(fieldError_('parent_meter_id', 'INVALID_VALUE')); return; }
  var all = {};
  readRows_('Meters').forEach(function (m) { all[m.meter_id] = m; });
  var p = all[parentId];
  if (!p || p.archived_at) { errs.push(fieldError_('parent_meter_id', 'NOT_FOUND')); return; }
  if (p.utility_type !== type) { errs.push(fieldError_('parent_meter_id', 'INVALID_VALUE')); return; }
  var seen = {}, cur = p;
  for (var i = 0; cur && i < 100; i++) {
    if (cur.meter_id === meterId) { errs.push(fieldError_('parent_meter_id', 'METER_LOOP')); return; }
    if (seen[cur.meter_id]) break;
    seen[cur.meter_id] = true;
    cur = all[cur.parent_meter_id];
  }
}

/**
 * meter.edit (C3/C4): thêm/sửa/ngừng đồng hồ.
 * {meter_id, meter_code?, name_vi/zh, utility_type (khi thêm), location_id?, parent_meter_id?, serial?, multiplier (hệ số ban đầu),
 *  reading_cycle_type, reading_cycle_value?, reading_cycle_anchor_date?, assigned_user_id?, position_vi/zh?, note?,
 *  opening_value?, opening_at? (khi thêm: số mở của giai đoạn đầu), active?, reason? (khi ngừng)}
 * Hệ số đổi bằng sự kiện (meter.event.create) khi giai đoạn hiện tại đã có chỉ số; loại điện/nước không đổi sau khi thêm.
 */
function meterEdit_(ctx) {
  var p = ctx.req.payload || {};
  var add = Number(ctx.req.expected_version || 0) === 0;
  var errs = [];
  if (!isUuidV4_(p.meter_id)) errs.push(fieldError_('meter_id', 'ID_INVALID'));
  var cur0 = add ? null : meterOrThrow_(p.meter_id);
  if (add) {
    requireOneLang_(errs, p, null, 'name');
    if (!p.utility_type) errs.push(fieldError_('utility_type', 'REQUIRED'));
  } else {
    if (p.name_vi !== undefined || p.name_zh !== undefined) requireOneLang_(errs, p, cur0, 'name');
    if (p.utility_type !== undefined && p.utility_type !== cur0.utility_type) errs.push(fieldError_('utility_type', 'INVALID_VALUE'));
  }
  checkMeterFields_(p, errs, cur0);
  if (p.active === false && !add && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  var trF = ['name', 'position'].filter(function (f) { return p[f + '_vi'] !== undefined || p[f + '_zh'] !== undefined; });
  var tr = trF.length ? applyTranslations_('Meters', trF, p, cur0) : null;
  return executeWrite_(ctx, {
    entity_type: 'METER', entity_id: p.meter_id,
    build: function (st) {
      var e2 = [];
      var su = {};
      var nowIso = isoVN_(now_());
      var writes = [];
      var row, before = null, qrKey = null;
      if (add) {
        if (findRowNums_('Meters', 'meter_id', p.meter_id).length) e2.push(fieldError_('meter_id', 'ID_EXISTS'));
      } else {
        row = meterOrThrow_(p.meter_id);
        assertVersion_(ctx, row, 'METER', 'Meters');
        before = clone_(row); delete before.__row;
        row = clone_(row); delete row.__row;
      }
      var type = add ? p.utility_type : row.utility_type;
      if (p.location_id && !findRowNums_('Locations', 'location_id', p.location_id).length) e2.push(fieldError_('location_id', 'NOT_FOUND'));
      if (p.assigned_user_id && !findRowNums_('Users', 'user_id', p.assigned_user_id).length) e2.push(fieldError_('assigned_user_id', 'NOT_FOUND'));
      if (p.parent_meter_id !== undefined) assertMeterParent_(p.meter_id, p.parent_meter_id, type, e2);
      if (e2.length) throw validationError_(e2);
      if (add) {
        var code = allocCode_(st, su, 'METER', p.meter_code, null);
        qrKey = allocQrKey_();
        var segId = uuid_();
        var mult = p.multiplier !== undefined && p.multiplier !== '' ? meterNum_(p.multiplier, MULTIPLIER_MAX_) : 1;
        var openAt = p.opening_at ? normTime_(p.opening_at) : nowIso;
        var hasOpen = p.opening_value !== undefined && p.opening_value !== '' && p.opening_value !== null;
        row = cNew_(ctx, {
          meter_id: p.meter_id, meter_code: code, name_vi: tr ? tr.values.name_vi : '', name_zh: tr ? tr.values.name_zh : '',
          utility_type: type, location_id: p.location_id || '', parent_meter_id: p.parent_meter_id || '', current_segment_id: segId,
          serial: trimStr_(p.serial), unit: UTILITY_UNIT_[type], multiplier: mult,
          reading_cycle_type: p.reading_cycle_type || METER_CYCLE_DEFAULT_,
          reading_cycle_value: p.reading_cycle_type === 'CUSTOM' ? Number(p.reading_cycle_value) : '',
          reading_cycle_anchor_date: p.reading_cycle_type === 'CUSTOM' ? p.reading_cycle_anchor_date : '',
          assigned_user_id: p.assigned_user_id || '', active: true,
          position_vi: tr && tr.values.position_vi !== undefined ? tr.values.position_vi : '', position_zh: tr && tr.values.position_zh !== undefined ? tr.values.position_zh : '',
          note: trimStr_(p.note), i18n_meta: tr ? tr.meta : {}
        });
        var seg = cNew_(ctx, {
          segment_id: segId, meter_id: p.meter_id, serial: row.serial, start_at: openAt, end_at: '', opening_value: hasOpen ? meterNum_(p.opening_value) : '',
          closing_value: '', multiplier: mult, event_id: '', status: 'ACTIVE', seq_no: 1
        });
        writes.push({ sheet: 'Meters', mode: 'insert', row: row });
        writes.push({ sheet: 'MeterSegments', mode: 'insert', row: seg });
        if (hasOpen) {
          writes.push({ sheet: 'MeterReadings', mode: 'insert', row: cNew_(ctx, {
            reading_id: uuid_(), meter_id: p.meter_id, meter_segment_id: segId, measured_at: openAt, cumulative_value: seg.opening_value,
            multiplier_at_reading: mult, reading_user_id: ctx.user.user_id, status: 'VALID', note_vi: '', note_zh: '',
            reading_kind: 'SEGMENT_OPENING', event_id: '', edit_reason: '', void_reason: ''
          }) });
        }
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'METER', p.meter_id, code, row.name_vi, row.name_zh) });
      } else {
        if (p.meter_code !== undefined && trimStr_(p.meter_code).toUpperCase() !== row.meter_code) row.meter_code = allocCode_(st, su, 'METER', p.meter_code, null);
        if (tr) {
          trF.forEach(function (f) { row[f + '_vi'] = tr.values[f + '_vi']; row[f + '_zh'] = tr.values[f + '_zh']; });
          row.i18n_meta = Object.assign({}, row.i18n_meta || {});
          trF.forEach(function (f) { if (tr.meta[f]) row.i18n_meta[f] = tr.meta[f]; else delete row.i18n_meta[f]; });
        }
        ['location_id', 'parent_meter_id', 'assigned_user_id'].forEach(function (f) { if (p[f] !== undefined) row[f] = p[f] || ''; });
        if (p.serial !== undefined) row.serial = trimStr_(p.serial);
        if (p.note !== undefined) row.note = trimStr_(p.note);
        if (p.reading_cycle_type !== undefined) row.reading_cycle_type = p.reading_cycle_type;
        if (row.reading_cycle_type === 'CUSTOM') {
          if (p.reading_cycle_value !== undefined) row.reading_cycle_value = Number(p.reading_cycle_value);
          if (p.reading_cycle_anchor_date !== undefined) row.reading_cycle_anchor_date = p.reading_cycle_anchor_date;
        } else { row.reading_cycle_value = ''; row.reading_cycle_anchor_date = ''; }
        var segs = meterSegments_(row.meter_id);
        var curSeg = segs[segs.length - 1];
        var segUpd = null;
        var segRow = function () { if (!segUpd) { segUpd = clone_(curSeg); delete segUpd.__row; } return segUpd; };
        if (p.multiplier !== undefined && Number(p.multiplier) !== Number(row.multiplier)) {
          // Hệ số ban đầu sửa được khi giai đoạn hiện tại chưa có chỉ số; có rồi thì phải ghi sự kiện đổi hệ số (3.12)
          var used = findAll_('MeterReadings', 'meter_id', row.meter_id).some(function (r) { return r.meter_segment_id === curSeg.segment_id && r.status !== 'VOID'; });
          if (used) throw validationError_([fieldError_('multiplier', 'MULTIPLIER_NEEDS_EVENT')]);
          row.multiplier = meterNum_(p.multiplier, MULTIPLIER_MAX_);
          segRow().multiplier = row.multiplier;
        }
        // Sửa serial (nhập nhầm) đổi theo giai đoạn hiện tại; thay đồng hồ thật thì ghi sự kiện thay
        if (p.serial !== undefined && curSeg && curSeg.serial !== row.serial) segRow().serial = row.serial;
        if (segUpd) { cUpdate_(ctx, segUpd); writes.push({ sheet: 'MeterSegments', mode: 'update', row: segUpd }); }
        if (p.active !== undefined) row.active = p.active !== false;
        cUpdate_(ctx, row);
        writes.unshift({ sheet: 'Meters', mode: 'update', row: row });
        var qr = findOne_('QrRegistry', 'entity_id', row.meter_id);
        if (qr && (qr.code !== row.meter_code || qr.label_vi !== row.name_vi || qr.label_zh !== row.name_zh || qr.active !== row.active)) {
          var q2 = clone_(qr); delete q2.__row;
          q2.code = row.meter_code; q2.label_vi = row.name_vi; q2.label_zh = row.name_zh; q2.active = row.active;
          writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
        }
        qrKey = qr ? qr.qr_key : null;
      }
      var after = clone_(row); delete after.__row;
      return {
        writes: writes, state: su,
        result: { entity_type: 'METER', entity_id: row.meter_id, display_code: row.meter_code, qr_key: qrKey, record_version: row.record_version, record: projectRow_(ctx, row, 'Meters') },
        record_version: row.record_version,
        audit: { entity_type: 'METER', entity_id: row.meter_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Chỉ số (reading.*) ---------------- */

function readingOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('reading_id', 'ID_INVALID')]);
  var r = findOne_('MeterReadings', 'reading_id', id);
  if (!r || r.archived_at) throw apiError_('NOT_FOUND');
  return r;
}

/** Hai lần đọc cùng đồng hồ, cùng giai đoạn, cùng lúc đọc (khóa chống trùng, 1.4 §10.3) */
function readingDuplicate_(rows, segId, ms, exceptId) {
  return rows.some(function (r) { return r.reading_id !== exceptId && r.status !== 'VOID' && r.meter_segment_id === segId && tms_(r.measured_at) === ms; });
}

/**
 * reading.create (ĐN, C3, C4; offline được): {reading_id, meter_id, cumulative_value, measured_at, note_vi/zh?}.
 * Ảnh đồng hồ gửi sau bằng doc.upload (METER_READING, PHOTO_METER). Lần đọc đầu tiên của đồng hồ chưa có số mở là
 * mốc gốc (SEGMENT_OPENING). Chỉ số giảm trong giai đoạn → NEEDS_REVIEW (lưu, không dùng để tính).
 */
function readingCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.reading_id)) errs.push(fieldError_('reading_id', 'ID_INVALID'));
  if (!isUuidV4_(p.meter_id)) errs.push(fieldError_('meter_id', 'REQUIRED'));
  var val = meterNum_(p.cumulative_value);
  if (val === null) errs.push(fieldError_('cumulative_value', p.cumulative_value === '' || p.cumulative_value === undefined || p.cumulative_value === null ? 'REQUIRED' : 'INVALID_VALUE'));
  if (!p.measured_at) errs.push(fieldError_('measured_at', 'REQUIRED')); else checkTimeField_(p, 'measured_at', errs);
  ['note_vi', 'note_zh'].forEach(function (f) { if (p[f] !== undefined && String(p[f]).length > 200) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = (trimStr_(p.note_vi) || trimStr_(p.note_zh)) ? applyTranslations_('MeterReadings', ['note'], p, null) : null;
  return executeWrite_(ctx, {
    entity_type: 'METER_READING', entity_id: p.reading_id,
    build: function () {
      if (findRowNums_('MeterReadings', 'reading_id', p.reading_id).length) throw validationError_([fieldError_('reading_id', 'ID_EXISTS')]);
      var m = meterOrThrow_(p.meter_id);
      if (m.active === false) throw validationError_([fieldError_('meter_id', 'METER_INACTIVE')]);
      var at = normTime_(p.measured_at), ms = tms_(at);
      var segs = meterSegments_(m.meter_id);
      var all = findAll_('MeterReadings', 'meter_id', m.meter_id);
      var writes = [];
      var seg = segmentAt_(segs, ms);
      var first = segs[0];
      var kind = 'REGULAR';
      // Đồng hồ thêm không kèm số mở: lần đọc đầu tiên là mốc gốc của giai đoạn đầu (có thể sớm hơn lúc thêm đồng hồ)
      var firstEmpty = first && segs.length === 1 && (first.opening_value === null || first.opening_value === '') &&
        !all.some(function (r) { return r.status !== 'VOID'; });
      if (firstEmpty) {
        seg = first;
        kind = 'SEGMENT_OPENING';
        var f2 = clone_(first); delete f2.__row;
        f2.opening_value = val;
        if (ms < tms_(first.start_at)) f2.start_at = at;
        cUpdate_(ctx, f2);
        writes.push({ sheet: 'MeterSegments', mode: 'update', row: f2 });
      }
      if (!seg) throw validationError_([fieldError_('measured_at', 'READING_BEFORE_START')]);
      if (readingDuplicate_(all, seg.segment_id, ms, null)) throw validationError_([fieldError_('measured_at', 'READING_DUPLICATE')]);
      var row = cNew_(ctx, {
        reading_id: p.reading_id, meter_id: m.meter_id, meter_segment_id: seg.segment_id, measured_at: at, cumulative_value: val,
        multiplier_at_reading: seg.multiplier, reading_user_id: ctx.user.user_id, status: 'VALID',
        note_vi: tr ? tr.values.note_vi : '', note_zh: tr ? tr.values.note_zh : '', i18n_meta: tr ? tr.meta : {},
        reading_kind: kind, event_id: '', edit_reason: '', void_reason: ''
      });
      var bySeg = {};
      bySeg[seg.segment_id] = all.filter(function (r) { return r.meter_segment_id === seg.segment_id; }).concat([row]);
      var skip = {}; skip[row.reading_id] = row;
      recheckSegments_(ctx, bySeg, writes, skip);
      writes.unshift({ sheet: 'MeterReadings', mode: 'insert', row: row });
      // Lần hợp lệ liền trước cùng giai đoạn: để app hiện tiêu thụ từ lần đọc trước
      var prev = null;
      all.forEach(function (r) {
        if (r.meter_segment_id !== seg.segment_id || r.status !== 'VALID' || tms_(r.measured_at) >= ms) return;
        if (!prev || tms_(r.measured_at) > tms_(prev.measured_at)) prev = r;
      });
      return {
        writes: writes,
        result: {
          entity_type: 'METER_READING', entity_id: row.reading_id, record_version: 1, status: row.status, record: projectRow_(ctx, row, 'MeterReadings'),
          previous: prev ? { reading_id: prev.reading_id, cumulative_value: prev.cumulative_value, measured_at: prev.measured_at } : null,
          consumption: prev && row.status === 'VALID' ? segUse_(prev.cumulative_value, row.cumulative_value, seg.multiplier) : null
        },
        record_version: 1,
        audit: { entity_type: 'METER', entity_id: m.meter_id, before_json: null, after_json: { reading_id: row.reading_id, cumulative_value: val, measured_at: at, status: row.status, reading_kind: kind } }
      };
    }
  });
}

/**
 * reading.editOwn (ĐN: chỉ số của mình trong reading_self_edit_hours; C3/C4) và reading.editOthers (C3/C4):
 * {reading_id, cumulative_value?, measured_at?, note_vi/zh?, status?: VOID | VALID, reason}. Bắt nhập lý do; AuditLogs trước–sau.
 * Số mở/chốt của giai đoạn (do sự kiện hoặc lúc thêm đồng hồ) chỉ sửa giá trị (C3/C4), không hủy, không đổi lúc đọc.
 */
function readingEdit_(ctx, own) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (p.cumulative_value !== undefined && meterNum_(p.cumulative_value) === null) errs.push(fieldError_('cumulative_value', 'INVALID_VALUE'));
  checkTimeField_(p, 'measured_at', errs);
  if (p.status !== undefined && ['VOID', 'VALID'].indexOf(p.status) < 0) errs.push(fieldError_('status', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var r0 = readingOrThrow_(p.reading_id);
  var tr = (p.note_vi !== undefined || p.note_zh !== undefined) ? applyTranslations_('MeterReadings', ['note'], p, r0) : null;
  return executeWrite_(ctx, {
    entity_type: 'METER_READING', entity_id: p.reading_id,
    build: function () {
      var r = readingOrThrow_(p.reading_id);
      var lvl = Number(ctx.user.role_level);
      if (own) {
        if (r.reading_user_id !== ctx.user.user_id) throw apiError_('FORBIDDEN');
        if (lvl < 3) {
          var hrs = Number(setting_('reading_self_edit_hours') || 24);
          if (now_().getTime() - tms_(r.created_at) > hrs * 3600000) throw validationError_([fieldError_('reading_id', 'EDIT_WINDOW_PASSED')]);
          // Người đọc sửa được mốc gốc do chính mình ghi (lần đọc đầu), không sửa số chốt/mở do sự kiện sinh ra
          if (r.reading_kind !== 'REGULAR' && r.event_id) throw apiError_('FORBIDDEN');
        }
      }
      assertVersion_(ctx, r, 'METER_READING', 'MeterReadings');
      var m = meterOrThrow_(r.meter_id);
      var segs = meterSegments_(m.meter_id);
      var all = findAll_('MeterReadings', 'meter_id', m.meter_id);
      var before = { cumulative_value: r.cumulative_value, measured_at: r.measured_at, status: r.status, note_vi: r.note_vi, note_zh: r.note_zh };
      var row = clone_(r); delete row.__row;
      var bound = r.reading_kind === 'SEGMENT_OPENING' || r.reading_kind === 'SEGMENT_CLOSING';
      if (bound && (p.measured_at !== undefined && normTime_(p.measured_at) !== r.measured_at || p.status === 'VOID')) throw validationError_([fieldError_('reading_id', 'SEGMENT_BOUND_FIXED')]);
      if (p.cumulative_value !== undefined) row.cumulative_value = meterNum_(p.cumulative_value);
      if (tr) { row.note_vi = tr.values.note_vi; row.note_zh = tr.values.note_zh; row.i18n_meta = Object.assign({}, row.i18n_meta || {}, tr.meta); }
      var oldSeg = r.meter_segment_id;
      if (p.measured_at !== undefined && !bound) {
        row.measured_at = normTime_(p.measured_at);
        var seg = segmentAt_(segs, tms_(row.measured_at));
        if (!seg) throw validationError_([fieldError_('measured_at', 'READING_BEFORE_START')]);
        row.meter_segment_id = seg.segment_id;
        row.multiplier_at_reading = seg.multiplier;
      }
      if (p.status === 'VOID') { row.status = 'VOID'; row.void_reason = trimStr_(p.reason).slice(0, 300); }
      else if (r.status === 'VOID' || p.status === 'VALID') { row.status = 'VALID'; row.void_reason = ''; }
      if (row.status !== 'VOID' && readingDuplicate_(all, row.meter_segment_id, tms_(row.measured_at), row.reading_id)) throw validationError_([fieldError_('measured_at', 'READING_DUPLICATE')]);
      row.edit_reason = trimStr_(p.reason).slice(0, 300);
      cUpdate_(ctx, row);
      var writes = [];
      // Sửa số mở/chốt: đổi theo giá trị của giai đoạn
      if (bound && p.cumulative_value !== undefined) {
        var sg = segs.filter(function (s) { return s.segment_id === r.meter_segment_id; })[0];
        if (sg) {
          var s2 = clone_(sg); delete s2.__row;
          if (r.reading_kind === 'SEGMENT_OPENING') s2.opening_value = row.cumulative_value; else s2.closing_value = row.cumulative_value;
          cUpdate_(ctx, s2);
          writes.push({ sheet: 'MeterSegments', mode: 'update', row: s2 });
        }
      }
      var replaced = all.map(function (x) { return x.reading_id === row.reading_id ? row : x; });
      var bySeg = {};
      [oldSeg, row.meter_segment_id].forEach(function (sid) { bySeg[sid] = replaced.filter(function (x) { return x.meter_segment_id === sid; }); });
      var skip = {}; skip[row.reading_id] = row;
      var flipped = recheckSegments_(ctx, bySeg, writes, skip);
      if (p.status === 'VALID' && row.status !== 'VALID') throw validationError_([fieldError_('cumulative_value', 'READING_DECREASED')]);
      // Sửa số mở/chốt làm lần đọc hợp lệ khác thành "cần kiểm tra" → từ chối (số mở/chốt phải bao các lần đọc của giai đoạn)
      if (bound && writes.some(function (w) { return w.sheet === 'MeterReadings' && flipped.indexOf(w.row.reading_id) >= 0 && w.row.status === 'NEEDS_REVIEW'; })) throw validationError_([fieldError_('cumulative_value', 'READING_DECREASED')]);
      writes.unshift({ sheet: 'MeterReadings', mode: 'update', row: row });
      return {
        writes: writes,
        result: { entity_type: 'METER_READING', entity_id: row.reading_id, record_version: row.record_version, status: row.status, record: projectRow_(ctx, row, 'MeterReadings') },
        record_version: row.record_version,
        audit: { entity_type: 'METER', entity_id: m.meter_id, before_json: before, after_json: { reading_id: row.reading_id, cumulative_value: row.cumulative_value, measured_at: row.measured_at, status: row.status }, reason: trimStr_(p.reason) }
      };
    }
  });
}

function readingEditOwn_(ctx) { return readingEdit_(ctx, true); }
function readingEditOthers_(ctx) { return readingEdit_(ctx, false); }

/* ---------------- Sự kiện đồng hồ (thay, reset, đổi hệ số) ---------------- */

/**
 * meter.event.create (KT, ĐN, C3, C4): {event_id, meter_id, event_type, event_at, closing_value, opening_value?, new_serial?,
 * new_multiplier?, note_vi/zh?}. Chờ duyệt; mỗi đồng hồ một sự kiện chờ duyệt. Lúc sự kiện phải sau đầu giai đoạn hiện tại.
 * Đổi hệ số: cùng đồng hồ → số mở = số chốt.
 */
function meterEventCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.event_id)) errs.push(fieldError_('event_id', 'ID_INVALID'));
  if (!isUuidV4_(p.meter_id)) errs.push(fieldError_('meter_id', 'REQUIRED'));
  if (METER_EVENT_TYPES_.indexOf(p.event_type) < 0) errs.push(fieldError_('event_type', p.event_type ? 'INVALID_VALUE' : 'REQUIRED'));
  if (!p.event_at) errs.push(fieldError_('event_at', 'REQUIRED')); else checkTimeField_(p, 'event_at', errs);
  var closing = meterNum_(p.closing_value);
  if (closing === null) errs.push(fieldError_('closing_value', p.closing_value === undefined || p.closing_value === '' ? 'REQUIRED' : 'INVALID_VALUE'));
  var opening = p.event_type === 'MULTIPLIER_CHANGE' ? closing : meterNum_(p.opening_value);
  if (opening === null && p.event_type !== 'MULTIPLIER_CHANGE') errs.push(fieldError_('opening_value', p.opening_value === undefined || p.opening_value === '' ? 'REQUIRED' : 'INVALID_VALUE'));
  if (p.new_multiplier !== undefined && p.new_multiplier !== '' && (meterNum_(p.new_multiplier, MULTIPLIER_MAX_) === null || Number(p.new_multiplier) === 0)) errs.push(fieldError_('new_multiplier', 'INVALID_VALUE'));
  if (p.event_type === 'MULTIPLIER_CHANGE' && (p.new_multiplier === undefined || p.new_multiplier === '')) errs.push(fieldError_('new_multiplier', 'REQUIRED'));
  if (p.new_serial !== undefined && String(p.new_serial).length > 80) errs.push(fieldError_('new_serial', 'INVALID_VALUE'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = (trimStr_(p.note_vi) || trimStr_(p.note_zh)) ? applyTranslations_('MeterEvents', ['note'], p, null) : null;
  return executeWrite_(ctx, {
    entity_type: 'METER_EVENT', entity_id: p.event_id,
    build: function () {
      if (findRowNums_('MeterEvents', 'event_id', p.event_id).length) throw validationError_([fieldError_('event_id', 'ID_EXISTS')]);
      var m = meterOrThrow_(p.meter_id);
      if (m.active === false) throw validationError_([fieldError_('meter_id', 'METER_INACTIVE')]);
      if (findAll_('MeterEvents', 'meter_id', m.meter_id).some(function (e) { return e.status === 'PENDING_APPROVAL' && !e.archived_at; })) throw validationError_([fieldError_('meter_id', 'EVENT_PENDING')]);
      var segs = meterSegments_(m.meter_id);
      var cur = segs[segs.length - 1];
      var at = normTime_(p.event_at), ms = tms_(at);
      if (!cur || ms <= tms_(cur.start_at)) throw validationError_([fieldError_('event_at', 'TIME_ORDER_INVALID')]);
      var newMult = p.new_multiplier !== undefined && p.new_multiplier !== '' ? meterNum_(p.new_multiplier, MULTIPLIER_MAX_) : Number(m.multiplier);
      if (p.event_type === 'MULTIPLIER_CHANGE' && newMult === Number(m.multiplier)) throw validationError_([fieldError_('new_multiplier', 'INVALID_VALUE')]);
      // Số chốt không nhỏ hơn lần đọc hợp lệ trước lúc sự kiện trong giai đoạn hiện tại
      var low = null;
      findAll_('MeterReadings', 'meter_id', m.meter_id).forEach(function (r) {
        if (r.meter_segment_id !== cur.segment_id || r.status !== 'VALID' || tms_(r.measured_at) > ms) return;
        if (low === null || Number(r.cumulative_value) > low) low = Number(r.cumulative_value);
      });
      if (low !== null && closing < low) throw validationError_([fieldError_('closing_value', 'EVENT_CLOSING_TOO_LOW')]);
      var row = cNew_(ctx, {
        event_id: p.event_id, meter_id: m.meter_id, event_type: p.event_type, event_at: at, old_serial: m.serial || '',
        new_serial: p.event_type === 'REPLACE' ? trimStr_(p.new_serial) : (m.serial || ''), closing_value: closing, opening_value: opening,
        old_segment_id: cur.segment_id, new_segment_id: '', approved_by: '', note: '', status: 'PENDING_APPROVAL', approved_at: '',
        new_multiplier: newMult, old_multiplier: Number(m.multiplier), note_vi: tr ? tr.values.note_vi : '', note_zh: tr ? tr.values.note_zh : '',
        i18n_meta: tr ? tr.meta : {}, reject_reason: ''
      });
      return {
        writes: [{ sheet: 'MeterEvents', mode: 'insert', row: row }],
        result: { entity_type: 'METER_EVENT', entity_id: row.event_id, record_version: 1, record: projectRow_(ctx, row, 'MeterEvents') },
        record_version: 1,
        audit: { entity_type: 'METER', entity_id: m.meter_id, before_json: null, after_json: { event_id: row.event_id, event_type: row.event_type, event_at: at, closing_value: closing, opening_value: opening, new_multiplier: newMult } }
      };
    }
  });
}

/**
 * meter.event.approve (C3/C4, PIN, không phải người lập): {event_id, decision: APPROVE | REJECT, reason (khi từ chối)}.
 * Duyệt: đóng giai đoạn cũ (số chốt), mở giai đoạn mới (số mở, hệ số, serial), ghi hai dòng chỉ số SEGMENT_CLOSING/OPENING
 * cùng lúc sự kiện; lần đọc thường sau lúc sự kiện chuyển sang giai đoạn mới và được xét lại trạng thái.
 */
function meterEventApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (!isUuidV4_(p.event_id)) errs.push(fieldError_('event_id', 'ID_INVALID'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'METER_EVENT', entity_id: p.event_id,
    build: function (st) {
      var ev = findOne_('MeterEvents', 'event_id', p.event_id);
      if (!ev || ev.archived_at) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'meter.event.approve', [ev.created_by]);
      assertVersion_(ctx, ev, 'METER_EVENT', 'MeterEvents');
      if (ev.status !== 'PENDING_APPROVAL') throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
      var nowIso = isoVN_(now_());
      var e2 = clone_(ev); delete e2.__row;
      var writes = [];
      if (p.decision === 'REJECT') {
        e2.status = 'REJECTED'; e2.reject_reason = trimStr_(p.reason).slice(0, 300);
        cUpdate_(ctx, e2);
        writes.push({ sheet: 'MeterEvents', mode: 'update', row: e2 });
      } else {
        var m = meterOrThrow_(ev.meter_id);
        var segs = meterSegments_(m.meter_id);
        var cur = segs[segs.length - 1];
        var ms = tms_(ev.event_at);
        if (!cur || cur.segment_id !== ev.old_segment_id || ms <= tms_(cur.start_at)) throw validationError_([fieldError_('event_at', 'TIME_ORDER_INVALID')]);
        var all = findAll_('MeterReadings', 'meter_id', m.meter_id);
        var low = null;
        all.forEach(function (r) { if (r.meter_segment_id === cur.segment_id && r.status === 'VALID' && tms_(r.measured_at) <= ms && (low === null || Number(r.cumulative_value) > low)) low = Number(r.cumulative_value); });
        if (low !== null && Number(ev.closing_value) < low) throw validationError_([fieldError_('closing_value', 'EVENT_CLOSING_TOO_LOW')]);
        var newSegId = uuid_();
        var oldSeg = clone_(cur); delete oldSeg.__row;
        oldSeg.end_at = ev.event_at; oldSeg.closing_value = ev.closing_value; oldSeg.status = 'CLOSED';
        cUpdate_(ctx, oldSeg);
        var newSeg = cNew_(ctx, {
          segment_id: newSegId, meter_id: m.meter_id, serial: ev.new_serial || m.serial || '', start_at: ev.event_at, end_at: '',
          opening_value: ev.opening_value, closing_value: '', multiplier: ev.new_multiplier, event_id: ev.event_id, status: 'ACTIVE',
          seq_no: Number(cur.seq_no) + 1
        });
        var mk = function (segId, kind, value, mult) {
          return cNew_(ctx, {
            reading_id: uuid_(), meter_id: m.meter_id, meter_segment_id: segId, measured_at: ev.event_at, cumulative_value: value,
            multiplier_at_reading: mult, reading_user_id: ev.created_by, status: 'VALID', note_vi: '', note_zh: '',
            reading_kind: kind, event_id: ev.event_id, edit_reason: '', void_reason: ''
          });
        };
        var closeR = mk(cur.segment_id, 'SEGMENT_CLOSING', ev.closing_value, Number(cur.multiplier));
        var openR = mk(newSegId, 'SEGMENT_OPENING', ev.opening_value, Number(ev.new_multiplier));
        // Lần đọc thường sau lúc sự kiện (đã ghi trước khi duyệt) thuộc giai đoạn mới
        var moved = [];
        var keep = [];
        all.forEach(function (r) {
          if (r.meter_segment_id === cur.segment_id && tms_(r.measured_at) >= ms && r.reading_kind === 'REGULAR') {
            var r2 = clone_(r); delete r2.__row;
            r2.meter_segment_id = newSegId; r2.multiplier_at_reading = Number(ev.new_multiplier);
            if (r2.status !== 'VOID' && tms_(r2.measured_at) === ms) { r2.status = 'VOID'; r2.void_reason = 'EVENT_SAME_TIME'; }
            moved.push(r2);
          } else keep.push(r);
        });
        var mm = clone_(m); delete mm.__row;
        mm.current_segment_id = newSegId; mm.serial = newSeg.serial; mm.multiplier = Number(ev.new_multiplier);
        cUpdate_(ctx, mm);
        e2.status = 'APPROVED'; e2.approved_by = ctx.user.user_id; e2.approved_at = nowIso; e2.new_segment_id = newSegId;
        cUpdate_(ctx, e2);
        writes.push({ sheet: 'MeterEvents', mode: 'update', row: e2 });
        writes.push({ sheet: 'MeterSegments', mode: 'update', row: oldSeg });
        writes.push({ sheet: 'MeterSegments', mode: 'insert', row: newSeg });
        writes.push({ sheet: 'Meters', mode: 'update', row: mm });
        writes.push({ sheet: 'MeterReadings', mode: 'insert', row: closeR });
        writes.push({ sheet: 'MeterReadings', mode: 'insert', row: openR });
        var bySeg = {};
        bySeg[cur.segment_id] = keep.filter(function (r) { return r.meter_segment_id === cur.segment_id; }).concat([closeR]);
        bySeg[newSegId] = moved.concat([openR]);
        var skip = {};
        moved.forEach(function (r) { skip[r.reading_id] = r; });
        skip[closeR.reading_id] = closeR; skip[openR.reading_id] = openR;
        recheckSegments_(ctx, bySeg, writes, skip);
        moved.forEach(function (r) { cUpdate_(ctx, r); writes.push({ sheet: 'MeterReadings', mode: 'update', row: r }); });
      }
      return {
        writes: writes,
        result: { entity_type: 'METER_EVENT', entity_id: e2.event_id, status: e2.status, record_version: e2.record_version, record: projectRow_(ctx, e2, 'MeterEvents') },
        record_version: e2.record_version,
        audit: {
          entity_type: 'METER', entity_id: ev.meter_id, before_json: { event_id: ev.event_id, status: ev.status },
          after_json: { event_id: ev.event_id, status: e2.status, new_segment_id: e2.new_segment_id || undefined },
          reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined
        }
      };
    }
  });
}

/* ---------------- Chốt kỳ (B1, 3.12) ---------------- */

/**
 * Dữ liệu một lần đọc toàn bộ: đồng hồ, giai đoạn, lần đọc hợp lệ theo đồng hồ (đã sắp). Dùng chung cho tổng hợp, báo cáo.
 */
function utilityData_() {
  var meters = readRows_('Meters').filter(function (m) { return !m.archived_at; });
  var segAll = readRows_('MeterSegments').filter(function (s) { return !s.archived_at; });
  var segsBy = {}, segSeq = {}, segById = {};
  segAll.forEach(function (s) { (segsBy[s.meter_id] = segsBy[s.meter_id] || []).push(s); segSeq[s.segment_id] = Number(s.seq_no); segById[s.segment_id] = s; });
  Object.keys(segsBy).forEach(function (k) { segsBy[k].sort(function (a, b) { return Number(a.seq_no) - Number(b.seq_no); }); });
  var readsBy = {};
  readRows_('MeterReadings').forEach(function (r) {
    if (r.archived_at || r.status !== 'VALID') return;
    (readsBy[r.meter_id] = readsBy[r.meter_id] || []).push(r);
  });
  var cmp = readingCmp_(segSeq);
  Object.keys(readsBy).forEach(function (k) { readsBy[k].sort(cmp); });
  return { meters: meters, segsBy: segsBy, segSeq: segSeq, segById: segById, readsBy: readsBy };
}

/** Lần đọc hợp lệ đầu tiên trong [from, to) */
function firstReadingIn_(list, from, to) {
  for (var i = 0; i < list.length; i++) {
    var t = tms_(list[i].measured_at);
    if (t >= to) return null;
    if (t >= from) return list[i];
  }
  return null;
}

/**
 * Kết quả một đồng hồ trong một kỳ [a, b] (3.12): {period_start, period_end, opening_*, closing_*, consumption, unit, status, missing_side}.
 * status: OK | MISSING_READING | BASELINE | NEEDS_REVIEW | OPEN_PERIOD (kỳ chưa tới hạn chốt) | NO_READING (chưa có số đo nào).
 */
function meterPeriod_(d, m, a, b, W, nowMs) {
  var list = d.readsBy[m.meter_id] || [];
  var bs = boundaryMs_(a), be = boundaryMs_(addDaysIso_(b, 1)), w = W * 3600000;
  var out = {
    meter_id: m.meter_id, period_start: a, period_end: b, opening_reading_id: null, opening_value: null, opening_at: null,
    closing_reading_id: null, closing_value: null, closing_at: null, consumption: null, unit: m.unit || UTILITY_UNIT_[m.utility_type],
    status: 'OK', missing_side: null, multiplier: null
  };
  if (!list.length || tms_(list[0].measured_at) >= be + w) { out.status = 'NO_READING'; return out; }
  var o = firstReadingIn_(list, bs, bs + w), c = firstReadingIn_(list, be, be + w);
  if (o) { out.opening_reading_id = o.reading_id; out.opening_value = o.cumulative_value; out.opening_at = o.measured_at; }
  if (c) { out.closing_reading_id = c.reading_id; out.closing_value = c.cumulative_value; out.closing_at = c.measured_at; }
  var started = tms_(list[0].measured_at) >= bs;
  if (!o && started) { out.status = 'BASELINE'; return out; }
  if (!c && nowMs < be + w) { out.status = o ? 'OPEN_PERIOD' : 'MISSING_READING'; out.missing_side = o ? null : 'OPENING'; return out; }
  if (!o || !c) { out.status = 'MISSING_READING'; out.missing_side = !o && !c ? 'BOTH' : (!o ? 'OPENING' : 'CLOSING'); return out; }
  // Tổng các giai đoạn từ giai đoạn của số mở tới giai đoạn của số đóng
  var segs = d.segsBy[m.meter_id] || [];
  var sa = d.segSeq[o.meter_segment_id], sb = d.segSeq[c.meter_segment_id];
  var total = 0, bad = false, mults = {};
  segs.forEach(function (s) {
    var q = Number(s.seq_no);
    if (q < sa || q > sb) return;
    var startV = q === sa ? o.cumulative_value : s.opening_value;
    var endV = q === sb ? c.cumulative_value : s.closing_value;
    if (startV === null || startV === '' || endV === null || endV === '' || s.multiplier === null || s.multiplier === '') { bad = true; return; }
    total += segUse_(startV, endV, s.multiplier);
    mults[s.multiplier] = true;
  });
  if (bad || sa === undefined || sb === undefined || sb < sa) { out.status = 'NEEDS_REVIEW'; return out; }
  out.consumption = Math.round(total * 1000) / 1000;
  var mk = Object.keys(mults);
  out.multiplier = mk.length === 1 ? Number(mk[0]) : null;
  return out;
}

/** Danh sách kỳ [a, b] theo kiểu kỳ, từ kỳ chứa ngày `at` lùi về n kỳ (cũ → mới) */
function periodsBack_(type, at, n) {
  var out = [];
  var cur = periodOf_(type, at);
  for (var i = 0; i < n; i++) { out.unshift(cur); cur = prevPeriod_(type, cur[0]); }
  return out;
}

/** Mã khu vực cha (để biểu giá theo khu vực áp cho khu vực con) */
function locationChain_(locs, id) {
  var out = [], seen = {};
  while (id && locs[id] && !seen[id]) { out.push(id); seen[id] = true; id = locs[id].parent_location_id; }
  return out;
}

/** Biểu giá đã duyệt áp cho cả khoảng [d1, d2]: khu vực của đồng hồ (hoặc khu vực cha), không có thì toàn nhà máy */
function tariffFor_(tariffs, locs, m, d1, d2) {
  var chain = locationChain_(locs, m.location_id).concat(['']);
  for (var i = 0; i < chain.length; i++) {
    var list = tariffs.filter(function (t) { return t.utility_type === m.utility_type && (t.location_id || '') === chain[i]; });
    if (!list.length) continue;
    var hit = list.filter(function (t) { return t.effective_from <= d1 && (!t.effective_to || t.effective_to >= d2); })[0];
    return hit || null; // có biểu giá ở cấp này nhưng không phủ trọn khoảng đọc → chưa đủ căn cứ
  }
  return null;
}

/** Tiền (5.4.5): VND không số lẻ; tiền khác 2 số lẻ. tax_rate là %. */
function tariffCost_(t, consumption) {
  var money = consumption * Number(t.unit_price) * (1 + (Number(t.tax_rate) || 0) / 100);
  return t.currency === 'VND' ? Math.round(money) : Math.round(money * 100) / 100;
}

/**
 * Tổng hợp theo kỳ (UT-01, WEB-UT-01, báo cáo Điện nước):
 * f = {period_type, date (ngày trong kỳ) | from, to (CUSTOM), location_id?, utility_type?, meter_ids?}
 * Trả {period_type, period_start, period_end, window_hours, rows[], totals{type: {consumption, unit, partial, missing, meters}},
 *      chart{line: [{period_start, period_end, totals}], by_location: [{location_id, type, consumption}]}, cost_*}
 */
function utilitySummary_(ctx, f, opts) {
  opts = opts || {};
  var type = PERIOD_TYPES_.indexOf(f.period_type) >= 0 ? f.period_type : 'MONTH';
  var a, b;
  if (type === 'CUSTOM') {
    a = isDateStr_(f.from) ? f.from : todayVN_(); b = isDateStr_(f.to) ? f.to : a;
    if (b < a) { var t0 = a; a = b; b = t0; }
    if (dayNum_(b) - dayNum_(a) > 400) throw validationError_([fieldError_('to', 'INVALID_VALUE')]);
  } else {
    var pr = periodOf_(type, isDateStr_(f.date) ? f.date : todayVN_());
    a = pr[0]; b = pr[1];
  }
  var W = windowHours_();
  var nowMs = now_().getTime();
  var d = opts.data || utilityData_();
  var locs = {};
  readRows_('Locations').forEach(function (l) { locs[l.location_id] = l; });
  var inLoc = function (m) {
    if (!f.location_id) return true;
    return locationChain_(locs, m.location_id).indexOf(f.location_id) >= 0;
  };
  var meters = d.meters.filter(function (m) {
    return (!f.utility_type || m.utility_type === f.utility_type) && inLoc(m) && (!f.meter_ids || f.meter_ids.indexOf(m.meter_id) >= 0) &&
      (m.active !== false || (d.readsBy[m.meter_id] || []).length);
  });
  var ids = {};
  meters.forEach(function (m) { ids[m.meter_id] = true; });
  // Không cộng đồng hồ tổng với đồng hồ nhánh: chỉ cộng đồng hồ không có cha trong tập đang xem (1.4 §5.5)
  var top = function (m) { return !m.parent_meter_id || !ids[m.parent_meter_id]; };
  var costOk = opts.cost !== undefined ? opts.cost : can_(ctx, 'tariff.view', { module: 'utilities' });
  var tariffs = costOk ? readRows_('UtilityTariffs').filter(function (t) { return t.status === 'APPROVED' && !t.archived_at; }) : [];
  var rows = meters.map(function (m) {
    var r = meterPeriod_(d, m, a, b, W, nowMs);
    r.meter_code = m.meter_code; r.name_vi = m.name_vi; r.name_zh = m.name_zh; r.utility_type = m.utility_type;
    r.location_id = m.location_id; r.parent_meter_id = m.parent_meter_id || ''; r.in_total = top(m); r.active = m.active !== false;
    if (r.multiplier === null) { var segs = d.segsBy[m.meter_id] || []; r.multiplier = segs.length ? Number(segs[segs.length - 1].multiplier) : Number(m.multiplier); }
    if (costOk && r.status === 'OK') {
      var t = tariffFor_(tariffs, locs, m, String(r.opening_at).slice(0, 10), String(r.closing_at).slice(0, 10));
      if (t) { r.cost = tariffCost_(t, r.consumption); r.currency = t.currency; r.tariff_id = t.tariff_id; }
      else r.cost_note = 'NO_TARIFF';
    }
    return r;
  });
  rows.sort(function (x, y) { return String(x.utility_type).localeCompare(String(y.utility_type)) || String(x.meter_code).localeCompare(String(y.meter_code)); });
  var totals = {};
  UTILITY_TYPES_.forEach(function (ut) {
    var list = rows.filter(function (r) { return r.utility_type === ut && r.in_total; });
    if (!list.length) return;
    var sum = 0, missing = 0, cost = {}, costMissing = 0;
    list.forEach(function (r) {
      if (r.status === 'OK') {
        sum += r.consumption;
        if (costOk) { if (r.cost !== undefined) cost[r.currency] = (cost[r.currency] || 0) + r.cost; else costMissing++; }
      } else if (r.status !== 'NO_READING' && r.status !== 'OPEN_PERIOD') missing++;
    });
    totals[ut] = { consumption: Math.round(sum * 1000) / 1000, unit: UTILITY_UNIT_[ut], meters: list.length, missing: missing,
      partial: missing > 0, open: list.filter(function (r) { return r.status === 'OPEN_PERIOD'; }).length };
    if (costOk) { totals[ut].cost = cost; totals[ut].cost_missing = costMissing; }
  });
  var out = { period_type: type, period_start: a, period_end: b, window_hours: W, rows: rows, totals: totals, cost_visible: !!costOk, today: todayVN_() };
  if (opts.chart !== false) {
    var line = [];
    if (type !== 'CUSTOM') {
      periodsBack_(type, a, PERIOD_CHART_N_[type]).forEach(function (pr2) {
        var tt = {};
        meters.forEach(function (m) {
          if (!top(m)) return;
          var r = pr2[0] === a ? rows.filter(function (x) { return x.meter_id === m.meter_id; })[0] : meterPeriod_(d, m, pr2[0], pr2[1], W, nowMs);
          var x = tt[m.utility_type] = tt[m.utility_type] || { consumption: 0, partial: false, open: false, ok: 0 };
          if (r.status === 'OK') { x.consumption += r.consumption; x.ok++; }
          else if (r.status === 'OPEN_PERIOD') x.open = true;
          else if (r.status !== 'NO_READING') x.partial = true;
        });
        Object.keys(tt).forEach(function (k) { tt[k].consumption = Math.round(tt[k].consumption * 1000) / 1000; });
        line.push({ period_start: pr2[0], period_end: pr2[1], totals: tt });
      });
    }
    var byLoc = {};
    rows.forEach(function (r) {
      if (!r.in_total || r.status !== 'OK') return;
      var k = (r.location_id || '') + '|' + r.utility_type;
      byLoc[k] = byLoc[k] || { location_id: r.location_id || '', utility_type: r.utility_type, consumption: 0 };
      byLoc[k].consumption += r.consumption;
    });
    out.chart = { line: line, by_location: Object.keys(byLoc).map(function (k) { byLoc[k].consumption = Math.round(byLoc[k].consumption * 1000) / 1000; return byLoc[k]; }) };
  }
  return out;
}

/* ---------------- Xem (utility.view) ---------------- */

/**
 * utility.view: {meter_id} hồ sơ đồng hồ (giai đoạn, sự kiện, chỉ số mới nhất trước, có phân trang);
 * {summary: {...}} tổng hợp theo kỳ; không tham số: danh sách đồng hồ kèm lần đọc hợp lệ gần nhất.
 */
function utilityView_(ctx) {
  var p = ctx.req.payload || {};
  if (p.summary) return utilitySummary_(ctx, p.summary || {});
  var qm = qrMap_();
  if (p.meter_id) {
    var m = meterOrThrow_(p.meter_id);
    var o = projectRow_(ctx, m, 'Meters'); o.qr_key = qm[m.meter_id] || null;
    var reads = findAll_('MeterReadings', 'meter_id', m.meter_id).filter(function (r) { return !r.archived_at; })
      .sort(function (x, y) { return String(y.measured_at).localeCompare(String(x.measured_at)) || String(y.created_at).localeCompare(String(x.created_at)); });
    var size = Math.min(500, Number(p.page_size) || 200);
    var start = Number(p.page_token || 0);
    return {
      item: o,
      segments: meterSegments_(m.meter_id).map(function (s) { return projectRow_(ctx, s, 'MeterSegments'); }),
      events: findAll_('MeterEvents', 'meter_id', m.meter_id).filter(function (e) { return !e.archived_at; }).map(function (e) { return projectRow_(ctx, e, 'MeterEvents'); }),
      readings: reads.slice(start, start + size).map(function (r) { return projectRow_(ctx, r, 'MeterReadings'); }),
      total: reads.length, next_page_token: start + size < reads.length ? String(start + size) : null
    };
  }
  var d = utilityData_();
  var items = d.meters.map(function (m) {
    var o2 = projectRow_(ctx, m, 'Meters'); o2.qr_key = qm[m.meter_id] || null;
    var list = d.readsBy[m.meter_id] || [];
    var last = list[list.length - 1];
    o2.last_reading = last ? { reading_id: last.reading_id, cumulative_value: last.cumulative_value, measured_at: last.measured_at } : null;
    return o2;
  });
  return { items: items, total: items.length };
}

/* ---------------- Biểu giá (tariff.*) ---------------- */

function tariffOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('tariff_id', 'ID_INVALID')]);
  var t = findOne_('UtilityTariffs', 'tariff_id', id);
  if (!t || t.archived_at) throw apiError_('NOT_FOUND');
  return t;
}

/**
 * tariff.edit (C3/C4, quyền giá): biểu giá nháp. {tariff_id, utility_type, location_id?, effective_from, effective_to?,
 * pricing_type: FLAT, unit_price, currency?, tax_rate? (%), name_vi/zh?, archive?: true}. Bản đã duyệt không sửa:
 * đổi giá thì thêm biểu giá mới có ngày hiệu lực mới (duyệt xong tự đóng biểu giá cũ đang mở).
 */
function tariffEdit_(ctx) {
  var p = ctx.req.payload || {};
  var add = Number(ctx.req.expected_version || 0) === 0;
  var errs = [];
  if (!isUuidV4_(p.tariff_id)) errs.push(fieldError_('tariff_id', 'ID_INVALID'));
  if (p.archive === true) {
    if (add) errs.push(fieldError_('archive', 'INVALID_VALUE'));
  } else {
    if (add || p.utility_type !== undefined) { if (UTILITY_TYPES_.indexOf(p.utility_type) < 0) errs.push(fieldError_('utility_type', p.utility_type ? 'INVALID_VALUE' : 'REQUIRED')); }
    if (add || p.effective_from !== undefined) { if (!isDateStr_(p.effective_from)) errs.push(fieldError_('effective_from', p.effective_from ? 'INVALID_DATE' : 'REQUIRED')); }
    if (p.effective_to !== undefined && p.effective_to !== '' && !isDateStr_(p.effective_to)) errs.push(fieldError_('effective_to', 'INVALID_DATE'));
    if (p.pricing_type !== undefined && TARIFF_PRICING_.indexOf(p.pricing_type) < 0) errs.push(fieldError_('pricing_type', 'INVALID_VALUE'));
    if (add || p.unit_price !== undefined) { var up = Number(p.unit_price); if (p.unit_price === '' || p.unit_price === null || p.unit_price === undefined || !(up >= 0 && up < 1e12)) errs.push(fieldError_('unit_price', p.unit_price === undefined || p.unit_price === '' ? 'REQUIRED' : 'INVALID_VALUE')); }
    if (p.tax_rate !== undefined && p.tax_rate !== '' && !(Number(p.tax_rate) >= 0 && Number(p.tax_rate) <= 100)) errs.push(fieldError_('tax_rate', 'INVALID_VALUE'));
    if (p.currency !== undefined && p.currency !== '' && !/^[A-Z]{3}$/.test(String(p.currency).toUpperCase())) errs.push(fieldError_('currency', 'INVALID_VALUE'));
    if (p.location_id && !isUuidV4_(p.location_id)) errs.push(fieldError_('location_id', 'ID_INVALID'));
  }
  if (errs.length) throw validationError_(errs);
  var cur0 = add ? null : tariffOrThrow_(p.tariff_id);
  var trF = (p.name_vi !== undefined || p.name_zh !== undefined) ? ['name'] : [];
  var tr = trF.length ? applyTranslations_('UtilityTariffs', trF, p, cur0) : null;
  return executeWrite_(ctx, {
    entity_type: 'TARIFF', entity_id: p.tariff_id,
    build: function () {
      var row, before = null;
      if (add) {
        if (findRowNums_('UtilityTariffs', 'tariff_id', p.tariff_id).length) throw validationError_([fieldError_('tariff_id', 'ID_EXISTS')]);
        row = cNew_(ctx, { tariff_id: p.tariff_id, status: 'DRAFT', pricing_type: 'FLAT', currency: setting_('default_currency') || 'VND', tax_rate: 0, detail_json: '', approved_by: '', approved_at: '', reject_reason: '', name_vi: '', name_zh: '', location_id: '', effective_to: '' });
      } else {
        var cur = tariffOrThrow_(p.tariff_id);
        assertVersion_(ctx, cur, 'TARIFF', 'UtilityTariffs');
        if (cur.status === 'APPROVED') throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
        before = clone_(cur); delete before.__row;
        row = clone_(cur); delete row.__row;
      }
      if (p.archive === true && !add) {
        row.archived_at = isoVN_(now_());
      } else {
        ['utility_type', 'effective_from', 'pricing_type'].forEach(function (f) { if (p[f] !== undefined) row[f] = p[f]; });
        if (p.effective_to !== undefined) row.effective_to = p.effective_to || '';
        if (p.location_id !== undefined) row.location_id = p.location_id || '';
        if (p.unit_price !== undefined) row.unit_price = Number(p.unit_price);
        if (p.tax_rate !== undefined) row.tax_rate = p.tax_rate === '' ? 0 : Number(p.tax_rate);
        if (p.currency !== undefined && p.currency !== '') row.currency = String(p.currency).toUpperCase();
        row.unit = UTILITY_UNIT_[row.utility_type];
        if (tr) { row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh; row.i18n_meta = Object.assign({}, row.i18n_meta || {}, tr.meta); }
        if (row.effective_to && row.effective_to < row.effective_from) throw validationError_([fieldError_('effective_to', 'INVALID_DATE')]);
        if (row.location_id && !findRowNums_('Locations', 'location_id', row.location_id).length) throw validationError_([fieldError_('location_id', 'NOT_FOUND')]);
        if (row.status === 'REJECTED') { row.status = 'DRAFT'; row.reject_reason = ''; }
      }
      if (!add) cUpdate_(ctx, row);
      var after = clone_(row); delete after.__row;
      return {
        writes: [{ sheet: 'UtilityTariffs', mode: add ? 'insert' : 'update', row: row }],
        result: { entity_type: 'TARIFF', entity_id: row.tariff_id, record_version: row.record_version, record: projectRow_(ctx, row, 'UtilityTariffs') },
        record_version: row.record_version,
        audit: { entity_type: 'TARIFF', entity_id: row.tariff_id, before_json: before, after_json: after }
      };
    }
  });
}

/**
 * tariff.approve (C3/C4, quyền giá, PIN; không phải người lập/người sửa cuối): {tariff_id, decision: APPROVE | REJECT, reason}.
 * Không chồng ngày với biểu giá đã duyệt cùng loại, cùng khu vực; biểu giá cũ đang mở (không có ngày hết) và bắt đầu
 * trước thì tự đóng vào ngày trước ngày hiệu lực mới.
 */
function tariffApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'TARIFF', entity_id: p.tariff_id,
    build: function () {
      var t = tariffOrThrow_(p.tariff_id);
      var basis = assertNotSelf_(ctx, 'tariff.approve', [t.created_by, t.updated_by]);
      assertVersion_(ctx, t, 'TARIFF', 'UtilityTariffs');
      if (t.status !== 'DRAFT') throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
      var row = clone_(t); delete row.__row;
      var writes = [];
      if (p.decision === 'REJECT') {
        row.status = 'REJECTED'; row.reject_reason = trimStr_(p.reason).slice(0, 300);
      } else {
        var others = readRows_('UtilityTariffs').filter(function (x) {
          return x.tariff_id !== t.tariff_id && !x.archived_at && x.status === 'APPROVED' && x.utility_type === t.utility_type && (x.location_id || '') === (t.location_id || '');
        });
        others.forEach(function (x) {
          var xTo = x.effective_to || '9999-12-31', tTo = t.effective_to || '9999-12-31';
          if (x.effective_from > tTo || xTo < t.effective_from) return; // không chồng
          if (!x.effective_to && x.effective_from < t.effective_from) {
            var x2 = clone_(x); delete x2.__row;
            x2.effective_to = addDaysIso_(t.effective_from, -1);
            cUpdate_(ctx, x2);
            writes.push({ sheet: 'UtilityTariffs', mode: 'update', row: x2 });
            return;
          }
          throw validationError_([fieldError_('effective_from', 'TARIFF_OVERLAP')]);
        });
        row.status = 'APPROVED'; row.approved_by = ctx.user.user_id; row.approved_at = isoVN_(now_());
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'UtilityTariffs', mode: 'update', row: row });
      return {
        writes: writes,
        result: { entity_type: 'TARIFF', entity_id: row.tariff_id, status: row.status, record_version: row.record_version, record: projectRow_(ctx, row, 'UtilityTariffs') },
        record_version: row.record_version,
        audit: { entity_type: 'TARIFF', entity_id: row.tariff_id, before_json: { status: t.status }, after_json: { status: row.status, closed: writes.length - 1 || undefined }, reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

/** tariff.view: danh sách biểu giá (mọi trạng thái) */
function tariffView_(ctx) {
  var items = readRows_('UtilityTariffs').filter(function (t) { return !t.archived_at; }).map(function (t) { return projectRow_(ctx, t, 'UtilityTariffs'); });
  items.sort(function (a, b) { return String(a.utility_type).localeCompare(String(b.utility_type)) || String(b.effective_from).localeCompare(String(a.effective_from)); });
  return { items: items };
}
