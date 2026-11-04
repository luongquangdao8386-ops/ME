/* 40_meter_balance: cân bằng đồng hồ tổng – nhánh, theo dõi thất thoát (d4.26, người dùng yêu cầu 04/11/2026)
 *
 * Mỗi đồng hồ có nhánh trực tiếp (Meters.parent_meter_id trỏ tới nó): Thất thoát = Tổng − cộng các nhánh trực tiếp; % = Thất thoát ÷ Tổng.
 * Nhánh nhiều cấp: mỗi cấp so với nhánh trực tiếp của nó (một dòng mỗi đồng hồ có nhánh, thụt theo cấp).
 * Kết luận: |%| ≤ ngưỡng → OK; % > ngưỡng → OVER (vượt ngưỡng); % < −ngưỡng → UNDER (nhánh lớn hơn tổng); đồng hồ tổng hoặc một nhánh
 * không đủ số trong kỳ → MISSING (không tính, không đoán); kỳ chưa kết thúc → OPEN. Kết luận dựa trên số cả kỳ; số từng ngày chỉ tham khảo
 * (tổng và nhánh thường đọc lệch giờ nhau).
 * Ngưỡng: Settings `meter_loss_tolerance` = {ELECTRICITY: %, WATER: %, meters: {meter_id: %}} — ngưỡng chung theo loại (C4) và ngưỡng riêng
 * của từng đồng hồ tổng (C3/C4), sửa bằng `meter.tolerance.set` (PIN). Không thêm cột/sheet → không cần migrateSchema.
 * Báo trong "Chờ bạn xử lý": `utility.view {balance_alerts: true}` = tháng vừa kết thúc, đồng hồ OVER/UNDER (tự hết khi sang tháng sau).
 */

var LOSS_TOL_DEFAULT_ = { ELECTRICITY: 3, WATER: 5 };
var LOSS_TOL_MAX_ = 50;

/** Ngưỡng đang dùng: {ELECTRICITY, WATER, meters: {id: %}} (thiếu/sai → mặc định) */
function lossTolCfg_() {
  var v = setting_('meter_loss_tolerance');
  var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  var ok = function (x) { var n = Number(x); return x !== null && x !== '' && x !== undefined && isFinite(n) && n >= 0 && n <= LOSS_TOL_MAX_ ? n : null; };
  var meters = {};
  if (o.meters && typeof o.meters === 'object') Object.keys(o.meters).forEach(function (k) { var n = ok(o.meters[k]); if (n !== null) meters[k] = n; });
  var out = { meters: meters };
  UTILITY_TYPES_.forEach(function (t) { var n = ok(o[t]); out[t] = n === null ? LOSS_TOL_DEFAULT_[t] : n; });
  return out;
}

function lossTolOf_(cfg, m) {
  if (Object.prototype.hasOwnProperty.call(cfg.meters, m.meter_id)) return { pct: cfg.meters[m.meter_id], custom: true };
  return { pct: cfg[m.utility_type], custom: false };
}

/** Nhánh trực tiếp của mỗi đồng hồ (bỏ đồng hồ đã lưu trữ; đồng hồ ngừng dùng mà chưa từng có số cũng bỏ) */
function meterKids_(d) {
  var kids = {};
  d.meters.forEach(function (m) {
    if (!m.parent_meter_id || m.parent_meter_id === m.meter_id) return;
    if (m.active === false && !(d.readsBy[m.meter_id] || []).length) return;
    (kids[m.parent_meter_id] = kids[m.parent_meter_id] || []).push(m);
  });
  Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return String(a.meter_code).localeCompare(String(b.meter_code)); }); });
  return kids;
}

var r3_ = function (x) { return Math.round(x * 1000) / 1000; };

/** Kết luận từ số tổng P, cộng nhánh S và ngưỡng tol: {loss, pct, status} */
function balanceVerdict_(P, S, tol) {
  var loss = r3_(P - S);
  if (!(P > 0)) return { loss: loss, pct: null, status: S > 0 ? 'UNDER' : 'OK' };
  var pct = Math.round(loss / P * 10000) / 100;
  return { loss: loss, pct: pct, status: pct > tol ? 'OVER' : (pct < -tol ? 'UNDER' : 'OK') };
}

/**
 * Cân bằng kỳ [a, b] cho các đồng hồ có nhánh trong `scope` (mảng đồng hồ đang xem). Trả mảng dòng theo thứ tự cây:
 * {meter_id, meter_code, name_vi, name_zh, utility_type, unit, level, consumption, children_n, children_sum, loss, pct, tol, tol_custom,
 *  status: OK|OVER|UNDER|MISSING|OPEN, missing: [mã đồng hồ thiếu số], children: [{meter_id, meter_code, name_vi, name_zh, consumption, status}]}
 */
function meterBalance_(d, scope, a, b, W, nowMs, cfg) {
  cfg = cfg || lossTolCfg_();
  var kids = meterKids_(d);
  var byId = {};
  d.meters.forEach(function (m) { byId[m.meter_id] = m; });
  var memo = {};
  var per = function (m) { return memo[m.meter_id] || (memo[m.meter_id] = meterPeriod_(d, m, a, b, W, nowMs)); };
  var level = function (m) {
    var n = 0, x = m, seen = {};
    while (x && x.parent_meter_id && byId[x.parent_meter_id] && !seen[x.meter_id] && n < 10) { seen[x.meter_id] = true; x = byId[x.parent_meter_id]; n++; }
    return n;
  };
  var rows = {};
  scope.forEach(function (m) {
    if (!kids[m.meter_id] || rows[m.meter_id]) return;
    var p = per(m);
    var ch = kids[m.meter_id].map(function (c) { var r = per(c); return { m: c, r: r }; });
    var tol = lossTolOf_(cfg, m);
    var row = {
      meter_id: m.meter_id, meter_code: m.meter_code, name_vi: m.name_vi || '', name_zh: m.name_zh || '', utility_type: m.utility_type,
      unit: m.unit || UTILITY_UNIT_[m.utility_type], level: level(m), consumption: p.status === 'OK' ? p.consumption : null,
      children_n: ch.length, children_sum: null, loss: null, pct: null, tol: tol.pct, tol_custom: tol.custom, status: 'OK', missing: [],
      children: ch.map(function (x) {
        return { meter_id: x.m.meter_id, meter_code: x.m.meter_code, name_vi: x.m.name_vi || '', name_zh: x.m.name_zh || '',
          consumption: x.r.status === 'OK' ? x.r.consumption : null, status: x.r.status };
      })
    };
    var all = [{ m: m, r: p }].concat(ch);
    if (all.some(function (x) { return x.r.status === 'OPEN_PERIOD'; })) row.status = 'OPEN';
    else {
      row.missing = all.filter(function (x) { return x.r.status !== 'OK'; }).map(function (x) { return x.m.meter_code; });
      if (row.missing.length) row.status = 'MISSING';
      else {
        var S = 0;
        ch.forEach(function (x) { S += x.r.consumption; });
        row.children_sum = r3_(S);
        var v = balanceVerdict_(p.consumption, S, tol.pct);
        row.loss = v.loss; row.pct = v.pct; row.status = v.status;
      }
    }
    rows[m.meter_id] = row;
  });
  // Thứ tự cây: gốc (không có cha là dòng khác) theo loại rồi mã, mỗi gốc kéo theo các dòng con của nó
  var out = [], done = {};
  var walk = function (id) {
    if (done[id] || !rows[id]) return;
    done[id] = true; out.push(rows[id]);
    (kids[id] || []).forEach(function (c) { walk(c.meter_id); });
  };
  Object.keys(rows).map(function (k) { return rows[k]; })
    .filter(function (r) { var m = byId[r.meter_id]; return !m.parent_meter_id || !rows[m.parent_meter_id]; })
    .sort(function (x, y) { return UTILITY_TYPES_.indexOf(x.utility_type) - UTILITY_TYPES_.indexOf(y.utility_type) || String(x.meter_code).localeCompare(String(y.meter_code)); })
    .forEach(function (r) { walk(r.meter_id); });
  Object.keys(rows).forEach(function (k) { if (!done[k]) { done[k] = true; out.push(rows[k]); } }); // vòng cha–con do sửa sheet tay
  return out;
}

/**
 * Cân bằng từng ngày của một đồng hồ tổng (báo cáo lọc một đồng hồ có nhánh): mỗi ngày = kỳ [d, d] theo B1 như bảng theo ngày.
 * Trả {meter_id, days, v: [tổng], c: [cộng nhánh], loss: [], pct: [], st: ['ok'|'over'|'under'|'none'|'open'|'future']} — chỉ tham khảo.
 */
function meterBalanceDaily_(d, m, a, b, W, nowMs, cfg) {
  cfg = cfg || lossTolCfg_();
  var ch = meterKids_(d)[m.meter_id] || [];
  if (!ch.length) return null;
  var tol = lossTolOf_(cfg, m).pct;
  var today = todayVN_();
  var out = { meter_id: m.meter_id, days: [], v: [], c: [], loss: [], pct: [], st: [] };
  for (var day = a; day <= b && out.days.length < UT_DAILY_MAX_DAYS_; day = addDaysIso_(day, 1)) {
    out.days.push(day);
    if (day > today) { out.v.push(null); out.c.push(null); out.loss.push(null); out.pct.push(null); out.st.push('future'); continue; }
    var rs = [m].concat(ch).map(function (x) { return meterPeriod_(d, x, day, day, W, nowMs); });
    var P = rs[0].status === 'OK' ? rs[0].consumption : null;
    out.v.push(P);
    if (rs.some(function (r) { return r.status === 'OPEN_PERIOD'; })) { out.c.push(null); out.loss.push(null); out.pct.push(null); out.st.push('open'); continue; }
    if (rs.some(function (r) { return r.status !== 'OK'; })) { out.c.push(null); out.loss.push(null); out.pct.push(null); out.st.push('none'); continue; }
    var S = 0;
    for (var i = 1; i < rs.length; i++) S += rs[i].consumption;
    var v = balanceVerdict_(P, S, tol);
    out.c.push(r3_(S)); out.loss.push(v.loss); out.pct.push(v.pct); out.st.push(v.status === 'OK' ? 'ok' : v.status.toLowerCase());
  }
  return out;
}

/** Tháng vừa kết thúc (theo ngày VN): ['yyyy-mm-01', 'yyyy-mm-cuối'] */
function prevMonthRange_() {
  var t = todayVN_();
  var first = t.slice(0, 8) + '01';
  var last = addDaysIso_(first, -1);
  return [last.slice(0, 8) + '01', last];
}

/**
 * utility.view {balance_alerts: true}: đồng hồ tổng vượt ngưỡng / nhánh lớn hơn tổng trong tháng vừa kết thúc ("Chờ bạn xử lý" của C3/C4).
 * Đệm 10 phút theo table_rev các bảng nguồn + ngưỡng + tháng. Trả {month: 'yyyy-mm', items: [...dòng cân bằng gọn]}.
 */
function meterBalanceAlerts_(ctx) {
  var pr = prevMonthRange_();
  var cfg = lossTolCfg_();
  var key = null;
  try {
    var sm = readState_().map;
    var revs = ['Meters', 'MeterSegments', 'MeterReadings', 'MeterEvents'].map(function (n) { return sm['table_rev.' + n] || 0; }).join('.');
    key = 'ut:bal:' + b64url_(sha256_(pr[0] + '|' + revs + '|' + JSON.stringify(cfg) + '|W' + windowHours_() + '|' + (sm.last_reset_at || '') + '|' +
      Math.floor(now_().getTime() / 600000) + '|' + SERVER_VERSION)).slice(0, 40);
    var hit = cache_().get(key);
    if (hit) return JSON.parse(hit);
  } catch (e) { key = null; }
  var d = utilityData_();
  var scope = d.meters.filter(function (m) { return m.active !== false || (d.readsBy[m.meter_id] || []).length; });
  var rows = meterBalance_(d, scope, pr[0], pr[1], windowHours_(), now_().getTime(), cfg);
  var out = {
    month: pr[0].slice(0, 7), period_start: pr[0], period_end: pr[1],
    items: rows.filter(function (r) { return r.status === 'OVER' || r.status === 'UNDER'; }).map(function (r) {
      return { meter_id: r.meter_id, meter_code: r.meter_code, name_vi: r.name_vi, name_zh: r.name_zh, utility_type: r.utility_type, unit: r.unit,
        consumption: r.consumption, children_sum: r.children_sum, loss: r.loss, pct: r.pct, tol: r.tol, status: r.status };
    })
  };
  if (key) { try { cache_().put(key, JSON.stringify(out), 600); } catch (e2) { /* bỏ qua đệm */ } }
  return out;
}

/**
 * meter.tolerance.set (PIN): {utility_type, pct} ngưỡng chung của loại — chỉ Quản trị (cấp 4);
 * {meter_id, pct | null} ngưỡng riêng của một đồng hồ tổng — Trưởng bộ phận, Quản trị (null/'' = dùng ngưỡng chung). % từ 0 tới 50, làm tròn 0,1.
 */
function meterToleranceSet_(ctx) {
  var p = ctx.req.payload || {};
  var cfg = lossTolCfg_();
  var next = { ELECTRICITY: cfg.ELECTRICITY, WATER: cfg.WATER, meters: JSON.parse(JSON.stringify(cfg.meters)) };
  var clear = p.pct === null || p.pct === '' || p.pct === undefined;
  var n = clear ? null : Number(p.pct);
  if (!clear && (!isFinite(n) || n < 0 || n > LOSS_TOL_MAX_)) throw validationError_([fieldError_('pct', 'INVALID_VALUE')]);
  if (n !== null) n = Math.round(n * 10) / 10;
  var target;
  if (p.utility_type !== undefined) {
    if (UTILITY_TYPES_.indexOf(p.utility_type) < 0) throw validationError_([fieldError_('utility_type', 'INVALID_VALUE')]);
    if (Number(ctx.user.role_level) < 4) throw apiError_('FORBIDDEN');
    if (n === null) throw validationError_([fieldError_('pct', 'REQUIRED')]);
    next[p.utility_type] = n;
    target = p.utility_type;
  } else {
    var m = meterOrThrow_(p.meter_id);
    if (!meterKids_(utilityData_())[m.meter_id]) throw validationError_([fieldError_('meter_id', 'INVALID_VALUE')]);
    if (n === null) delete next.meters[m.meter_id]; else next.meters[m.meter_id] = n;
    target = m.meter_code;
  }
  withWriteLock_(function () {
    writeSetting_('meter_loss_tolerance', next, ctx.user.user_id);
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'meter.tolerance.set', entity_type: 'SETTINGS', entity_id: 'meter_loss_tolerance:' + target,
      before_json: cfg, after_json: next, operation_id: ctx.req.operation_id || '', reason: trimStr_(p.reason).slice(0, 300), auth_basis: 'ROLE_LEVEL' });
  });
  return { meter_loss_tolerance: lossTolCfg_() };
}
