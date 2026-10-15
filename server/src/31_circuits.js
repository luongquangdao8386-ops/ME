/* 31_circuits: Tra cứu lộ điện — 1.4 §5.7, §10.2–10.3; phụ lục 1.5 mục 3.13 (B2), 4.4.7, 4.6, 6.9.2.
 * Nguồn → tủ → lộ → phụ tải. Nguồn (điểm nhận lưới, MBA, máy phát, tủ tổng) là một loại tủ; tủ nối hồ sơ Thiết bị (B2):
 * bảo trì, sửa chữa, kiểm định, tài liệu ghi trên hồ sơ thiết bị đó. Mọi thay đổi quan hệ được truy ngược dưới khóa ghi;
 * gặp lại chính nó → CIRCUIT_LOOP. Sửa dữ liệu kỹ thuật thì mất xác minh. App tra cứu không xác nhận lộ đã cô lập/an toàn. */

var PANEL_TYPES_ = ['SOURCE_GRID', 'SOURCE_TRANSFORMER', 'SOURCE_GENERATOR', 'MAIN_SWITCHBOARD', 'DISTRIBUTION_BOARD', 'CONTROL_PANEL'];
var SOURCE_PANEL_TYPES_ = { SOURCE_GRID: 1, SOURCE_TRANSFORMER: 1, SOURCE_GENERATOR: 1, MAIN_SWITCHBOARD: 1 };
var NO_FEED_PANEL_TYPES_ = { SOURCE_GRID: 1, SOURCE_GENERATOR: 1 };
var CIRCUIT_STATUS_ = ['IN_USE', 'STANDBY', 'OUT_OF_SERVICE'];
var SUPPLY_ROLES_ = ['PRIMARY', 'BACKUP'];
var TRACE_DEPTH_MAX_ = 50;

/* ---------------- Đồ thị cấp điện ---------------- */

/**
 * Đồ thị từ ba bảng (đọc mỗi bảng một lần), áp thay đổi chưa ghi: over = {panels: {id: row|null}, circuits: {...}, loads: {...}}
 * (null = đã gỡ). Nút: 'E:<equipment_id>', 'P:<panel_id>', 'C:<circuit_id>'.
 */
function circuitGraph_(over) {
  over = over || {};
  var g = { panels: {}, circuits: {}, loads: {}, loadsByEq: {}, loadsByPanel: {}, loadsByCircuit: {}, panelByEq: {}, childCircuits: {} };
  var take = function (sheet, key, bucket, o) {
    readRows_(sheet).forEach(function (r) { if (!r.archived_at) bucket[r[key]] = r; });
    Object.keys(o || {}).forEach(function (id) { if (o[id]) bucket[id] = o[id]; else delete bucket[id]; });
  };
  take('Panels', 'panel_id', g.panels, over.panels);
  take('Circuits', 'circuit_id', g.circuits, over.circuits);
  take('CircuitLoads', 'load_link_id', g.loads, over.loads);
  Object.keys(g.panels).forEach(function (id) { var p = g.panels[id]; if (p.equipment_id) g.panelByEq[p.equipment_id] = p; });
  Object.keys(g.loads).forEach(function (id) {
    var l = g.loads[id];
    if (l.equipment_id) (g.loadsByEq[l.equipment_id] = g.loadsByEq[l.equipment_id] || []).push(l);
    if (l.downstream_panel_id) (g.loadsByPanel[l.downstream_panel_id] = g.loadsByPanel[l.downstream_panel_id] || []).push(l);
    (g.loadsByCircuit[l.circuit_id] = g.loadsByCircuit[l.circuit_id] || []).push(l);
  });
  Object.keys(g.circuits).forEach(function (id) { var c = g.circuits[id]; if (c.upstream_circuit_id) (g.childCircuits[c.upstream_circuit_id] = g.childCircuits[c.upstream_circuit_id] || []).push(c); });
  return g;
}

/** Cạnh đi lên của một nút (3.13): [{to, role, load_link_id}] */
function upEdges_(g, key) {
  var t = key.charAt(0), id = key.slice(2);
  if (t === 'E') {
    var pn = g.panelByEq[id];
    if (pn) return [{ to: 'P:' + pn.panel_id, role: null, link: 'PANEL_EQUIPMENT' }];
    return (g.loadsByEq[id] || []).map(function (l) { return { to: 'C:' + l.circuit_id, role: l.supply_role || 'PRIMARY', load_link_id: l.load_link_id }; });
  }
  if (t === 'P') return (g.loadsByPanel[id] || []).map(function (l) { return { to: 'C:' + l.circuit_id, role: l.supply_role || 'PRIMARY', load_link_id: l.load_link_id }; });
  var c = g.circuits[id];
  if (!c) return [];
  if (c.upstream_circuit_id) return [{ to: 'C:' + c.upstream_circuit_id, role: c.supply_role || 'PRIMARY' }];
  return c.panel_id ? [{ to: 'P:' + c.panel_id, role: null }] : [];
}

/** Đi ngược từ `from` có gặp `target` không (kiểm vòng khi lưu) */
function reaches_(g, from, target) {
  var seen = {}, stack = [from], n = 0;
  while (stack.length && n++ < 5000) {
    var k = stack.pop();
    if (k === target) return true;
    if (seen[k]) continue;
    seen[k] = true;
    upEdges_(g, k).forEach(function (e) { stack.push(e.to); });
  }
  return false;
}

/** Thông tin hiển thị của một nút */
function traceNode_(g, key, eqs) {
  var t = key.charAt(0), id = key.slice(2);
  if (t === 'P') { var p = g.panels[id] || {}; return { type: 'PANEL', id: id, code: p.panel_code || '', name_vi: p.name_vi || '', name_zh: p.name_zh || '', panel_type: p.panel_type || '', equipment_id: p.equipment_id || '' }; }
  if (t === 'C') { var c = g.circuits[id] || {}; return { type: 'CIRCUIT', id: id, code: c.circuit_code || '', name_vi: c.name_vi || '', name_zh: c.name_zh || '', status: c.status || '' }; }
  var e = (eqs || {})[id] || {};
  return { type: 'EQUIPMENT', id: id, code: e.equipment_code || '', name_vi: e.name_vi || '', name_zh: e.name_zh || '' };
}

/**
 * Truy đường cấp (3.13): DFS từ nút đầu, mang tập nút trên đường đang đi (không dùng "đã thăm" toàn cục để liệt kê đủ đường
 * chính và dự phòng). Gặp lại nút trên đường → CYCLE_DETECTED; quá 50 nút → DEPTH_LIMIT; tới gốc: tủ nhóm Nguồn → OK,
 * không thì ROOT_NOT_SOURCE. Không dừng ở nguồn đầu tiên. Lọc role: PRIMARY = đường chỉ qua cạnh nguồn chính;
 * BACKUP = đường có ít nhất một cạnh dự phòng (phần còn lại của đường vẫn hiện); ALL = mọi đường.
 * Trả [{nodes: [đầu … gốc], roles: [vai trò cạnh i → i+1], status}]
 */
function tracePaths_(g, startKey, role, eqs) {
  var paths = [];
  var guard = { n: 0 };
  function emit(path, roles, status) {
    var hasBackup = roles.indexOf('BACKUP') >= 0;
    if ((role === 'PRIMARY' && hasBackup) || (role === 'BACKUP' && !hasBackup)) return;
    paths.push({ nodes: path.map(function (k) { return traceNode_(g, k, eqs); }), roles: roles.slice(), status: status });
  }
  function dfs(key, path, roles) {
    if (++guard.n > 20000 || paths.length >= 200) return;
    if (path.length > TRACE_DEPTH_MAX_) { emit(path, roles, 'DEPTH_LIMIT'); return; }
    var all = upEdges_(g, key);
    if (!all.length) {
      var p = key.charAt(0) === 'P' ? g.panels[key.slice(2)] : null;
      emit(path, roles, p && SOURCE_PANEL_TYPES_[p.panel_type] ? 'OK' : 'ROOT_NOT_SOURCE');
      return;
    }
    all.forEach(function (e) {
      if (role === 'PRIMARY' && e.role === 'BACKUP') return;
      if (path.indexOf(e.to) >= 0) { emit(path.concat([e.to]), roles.concat([e.role]), 'CYCLE_DETECTED'); return; }
      dfs(e.to, path.concat([e.to]), roles.concat([e.role]));
    });
  }
  dfs(startKey, [startKey], []);
  return paths;
}

/* ---------------- Kiểm khi lưu ---------------- */

function panelOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('panel_id', 'ID_INVALID')]);
  var p = findOne_('Panels', 'panel_id', id);
  if (!p || p.archived_at) throw apiError_('NOT_FOUND');
  return p;
}

function circuitOrThrow_(id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('circuit_id', 'ID_INVALID')]);
  var c = findOne_('Circuits', 'circuit_id', id);
  if (!c || c.archived_at) throw apiError_('NOT_FOUND');
  return c;
}

function numOrBlank_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  return isFinite(n) && n >= 0 && n < 1e9 ? n : null;
}

/** "4x6", "4 * 6", "4×6" → "4×6" (5.4.4) */
function normSection_(v) {
  return trimStr_(v).replace(/\s*[xX*×]\s*/g, '×').replace(/\s+/g, ' ');
}

var PANEL_NUM_FIELDS_ = ['supply_voltage', 'rated_current'];
var CIRCUIT_NUM_FIELDS_ = ['voltage', 'breaker_rating_a', 'cable_length_m'];
var CIRCUIT_TEXT_FIELDS_ = ['breaker_model', 'protection_setting', 'cable_type'];

function clearVerify_(row, kind) {
  row.verified_by = '';
  if (kind === 'PANEL') row.last_verified_at = ''; else row.verified_at = '';
}

/** Tủ đổi khu vực theo thiết bị đã nối (B2): gọi khi lưu thiết bị (dưới khóa) */
function panelLocationWrites_(ctx, equipmentId, locationId, writes) {
  if (releasedDot_() < 3) return;
  readRows_('Panels').forEach(function (p) {
    if (p.archived_at || p.equipment_id !== equipmentId || (p.location_id || '') === (locationId || '')) return;
    var p2 = clone_(p); delete p2.__row;
    p2.location_id = locationId || '';
    cUpdate_(ctx, p2);
    writes.push({ sheet: 'Panels', mode: 'update', row: p2 });
  });
}

/**
 * circuit.edit (C3/C4; KT đề nghị bằng lô Excel nháp): {entity: PANEL | CIRCUIT | LOAD, ...}.
 * PANEL: {panel_id, panel_code?, name_vi/zh, panel_type, location_id?, equipment_id?, supply_voltage?, rated_current?, status?, note_vi/zh?, archive?}
 * CIRCUIT: {circuit_id, circuit_code?, panel_id, upstream_circuit_id?, supply_role?, name_vi/zh, phases?, voltage?, breaker_model?,
 *   breaker_rating_a?, protection_setting?, cable_type?, cable_section_mm2?, cable_length_m?, route_vi/zh?, status?, note_vi/zh?, archive?}
 * LOAD: {load_link_id, circuit_id, equipment_id | downstream_panel_id, supply_role?, rated_load_kw?, note_vi/zh?, remove?}
 */
function circuitEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (p.entity === 'PANEL') return panelSave_(ctx, p);
  if (p.entity === 'CIRCUIT') return circuitSave_(ctx, p);
  if (p.entity === 'LOAD') return loadSave_(ctx, p);
  throw validationError_([fieldError_('entity', 'INVALID_VALUE')]);
}

function panelSave_(ctx, p) {
  var add = Number(ctx.req.expected_version || 0) === 0;
  var errs = [];
  if (!isUuidV4_(p.panel_id)) errs.push(fieldError_('panel_id', 'ID_INVALID'));
  var cur0 = add ? null : panelOrThrow_(p.panel_id);
  if (!p.archive) {
    if (add || p.name_vi !== undefined || p.name_zh !== undefined) requireOneLang_(errs, p, cur0, 'name');
    if (add || p.panel_type !== undefined) { if (PANEL_TYPES_.indexOf(p.panel_type) < 0) errs.push(fieldError_('panel_type', p.panel_type ? 'INVALID_VALUE' : 'REQUIRED')); }
    if (p.status !== undefined && p.status !== '' && CIRCUIT_STATUS_.indexOf(p.status) < 0) errs.push(fieldError_('status', 'INVALID_VALUE'));
    PANEL_NUM_FIELDS_.forEach(function (f) { if (p[f] !== undefined && numOrBlank_(p[f]) === null) errs.push(fieldError_(f, 'INVALID_VALUE')); });
    ['location_id', 'equipment_id'].forEach(function (f) { if (p[f] !== undefined && p[f] !== '' && !isUuidV4_(p[f])) errs.push(fieldError_(f, 'ID_INVALID')); });
  } else if (add) errs.push(fieldError_('archive', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var trF = ['name', 'note'].filter(function (f) { return p[f + '_vi'] !== undefined || p[f + '_zh'] !== undefined; });
  var tr = trF.length ? applyTranslations_('Panels', trF, p, cur0) : null;
  return executeWrite_(ctx, {
    entity_type: 'PANEL', entity_id: p.panel_id,
    build: function (st) {
      var su = {}, writes = [], row, before = null, qrKey = null;
      if (add) {
        if (findRowNums_('Panels', 'panel_id', p.panel_id).length) throw validationError_([fieldError_('panel_id', 'ID_EXISTS')]);
        row = cNew_(ctx, { panel_id: p.panel_id, status: 'IN_USE', location_id: '', equipment_id: '', supply_voltage: '', rated_current: '', last_verified_at: '', verified_by: '', name_vi: '', name_zh: '', note_vi: '', note_zh: '' });
        row.panel_code = allocCode_(st, su, 'PANEL', p.panel_code, null);
      } else {
        var cur = panelOrThrow_(p.panel_id);
        assertVersion_(ctx, cur, 'PANEL', 'Panels');
        before = clone_(cur); delete before.__row;
        row = clone_(cur); delete row.__row;
        if (p.panel_code !== undefined && trimStr_(p.panel_code).toUpperCase() !== row.panel_code) row.panel_code = allocCode_(st, su, 'PANEL', p.panel_code, null);
      }
      var g;
      if (p.archive) {
        g = circuitGraph_();
        var used = Object.keys(g.circuits).some(function (id) { return g.circuits[id].panel_id === row.panel_id; }) || (g.loadsByPanel[row.panel_id] || []).length;
        if (used) throw validationError_([fieldError_('panel_id', 'IN_USE')]);
        row.archived_at = isoVN_(now_());
      } else {
        if (tr) {
          trF.forEach(function (f) { row[f + '_vi'] = tr.values[f + '_vi']; row[f + '_zh'] = tr.values[f + '_zh']; });
          row.i18n_meta = Object.assign({}, row.i18n_meta || {});
          trF.forEach(function (f) { if (tr.meta[f]) row.i18n_meta[f] = tr.meta[f]; else delete row.i18n_meta[f]; });
        }
        if (p.panel_type !== undefined) row.panel_type = p.panel_type;
        if (p.status !== undefined && p.status !== '') row.status = p.status;
        PANEL_NUM_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = numOrBlank_(p[f]); });
        if (p.location_id !== undefined) row.location_id = p.location_id || '';
        if (p.equipment_id !== undefined) row.equipment_id = p.equipment_id || '';
        var e2 = [];
        if (row.location_id && !findRowNums_('Locations', 'location_id', row.location_id).length) e2.push(fieldError_('location_id', 'NOT_FOUND'));
        if (row.equipment_id) {
          var eq = findOne_('Equipment', 'equipment_id', row.equipment_id);
          if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND'));
          else {
            // B2: một thiết bị chỉ nối một tủ; khu vực của tủ theo thiết bị
            g = g || circuitGraph_();
            var other = g.panelByEq[row.equipment_id];
            if (other && other.panel_id !== row.panel_id) e2.push(fieldError_('equipment_id', 'PANEL_EQUIPMENT_TAKEN'));
            if ((g.loadsByEq[row.equipment_id] || []).length) e2.push(fieldError_('equipment_id', 'PANEL_EQUIPMENT_AS_LOAD'));
            row.location_id = eq.location_id || '';
          }
        }
        // Lưới, máy phát không được làm tủ nhận nguồn từ lộ (3.13 kiểm 4)
        if (NO_FEED_PANEL_TYPES_[row.panel_type]) {
          g = g || circuitGraph_();
          if ((g.loadsByPanel[row.panel_id] || []).length) e2.push(fieldError_('panel_type', 'PANEL_SOURCE_FED'));
        }
        if (e2.length) throw validationError_(e2);
        clearVerify_(row, 'PANEL');
      }
      if (add) {
        qrKey = allocQrKey_();
        writes.push({ sheet: 'Panels', mode: 'insert', row: row });
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'PANEL', row.panel_id, row.panel_code, row.name_vi, row.name_zh) });
      } else {
        cUpdate_(ctx, row);
        writes.push({ sheet: 'Panels', mode: 'update', row: row });
        var qr = findOne_('QrRegistry', 'entity_id', row.panel_id);
        var act = !row.archived_at;
        if (qr && (qr.code !== row.panel_code || qr.label_vi !== row.name_vi || qr.label_zh !== row.name_zh || qr.active !== act)) {
          var q2 = clone_(qr); delete q2.__row;
          q2.code = row.panel_code; q2.label_vi = row.name_vi; q2.label_zh = row.name_zh; q2.active = act;
          writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
        }
        qrKey = qr ? qr.qr_key : null;
      }
      var after = clone_(row); delete after.__row;
      return {
        writes: writes, state: su,
        result: { entity_type: 'PANEL', entity_id: row.panel_id, display_code: row.panel_code, qr_key: qrKey, record_version: row.record_version, record: projectRow_(ctx, row, 'Panels') },
        record_version: row.record_version,
        audit: { entity_type: 'PANEL', entity_id: row.panel_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

function circuitSave_(ctx, p) {
  var add = Number(ctx.req.expected_version || 0) === 0;
  var errs = [];
  if (!isUuidV4_(p.circuit_id)) errs.push(fieldError_('circuit_id', 'ID_INVALID'));
  var cur0 = add ? null : circuitOrThrow_(p.circuit_id);
  if (!p.archive) {
    if (add || p.name_vi !== undefined || p.name_zh !== undefined) requireOneLang_(errs, p, cur0, 'name');
    if (add || p.panel_id !== undefined) { if (!isUuidV4_(p.panel_id)) errs.push(fieldError_('panel_id', p.panel_id ? 'ID_INVALID' : 'REQUIRED')); }
    if (p.upstream_circuit_id !== undefined && p.upstream_circuit_id !== '' && !isUuidV4_(p.upstream_circuit_id)) errs.push(fieldError_('upstream_circuit_id', 'ID_INVALID'));
    if (p.supply_role !== undefined && p.supply_role !== '' && SUPPLY_ROLES_.indexOf(p.supply_role) < 0) errs.push(fieldError_('supply_role', 'INVALID_VALUE'));
    if (p.status !== undefined && p.status !== '' && CIRCUIT_STATUS_.indexOf(p.status) < 0) errs.push(fieldError_('status', 'INVALID_VALUE'));
    if (p.phases !== undefined && p.phases !== '' && [1, 2, 3].indexOf(Number(p.phases)) < 0) errs.push(fieldError_('phases', 'INVALID_VALUE'));
    CIRCUIT_NUM_FIELDS_.forEach(function (f) { if (p[f] !== undefined && numOrBlank_(p[f]) === null) errs.push(fieldError_(f, 'INVALID_VALUE')); });
    CIRCUIT_TEXT_FIELDS_.concat(['cable_section_mm2']).forEach(function (f) { if (p[f] !== undefined && String(p[f]).length > 120) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  } else if (add) errs.push(fieldError_('archive', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var trF = ['name', 'route', 'note'].filter(function (f) { return p[f + '_vi'] !== undefined || p[f + '_zh'] !== undefined; });
  var tr = trF.length ? applyTranslations_('Circuits', trF, p, cur0) : null;
  return executeWrite_(ctx, {
    entity_type: 'CIRCUIT', entity_id: p.circuit_id,
    build: function (st) {
      var su = {}, writes = [], row, before = null, qrKey = null;
      if (add) {
        if (findRowNums_('Circuits', 'circuit_id', p.circuit_id).length) throw validationError_([fieldError_('circuit_id', 'ID_EXISTS')]);
        row = cNew_(ctx, { circuit_id: p.circuit_id, upstream_circuit_id: '', supply_role: 'PRIMARY', status: 'IN_USE', phases: '', voltage: '', breaker_model: '', breaker_rating_a: '',
          protection_setting: '', cable_type: '', cable_section_mm2: '', cable_length_m: '', route_vi: '', route_zh: '', verified_by: '', verified_at: '', name_vi: '', name_zh: '', note_vi: '', note_zh: '' });
        row.circuit_code = allocCode_(st, su, 'CIRCUIT', p.circuit_code, null);
      } else {
        var cur = circuitOrThrow_(p.circuit_id);
        assertVersion_(ctx, cur, 'CIRCUIT', 'Circuits');
        before = clone_(cur); delete before.__row;
        row = clone_(cur); delete row.__row;
        if (p.circuit_code !== undefined && trimStr_(p.circuit_code).toUpperCase() !== row.circuit_code) row.circuit_code = allocCode_(st, su, 'CIRCUIT', p.circuit_code, null);
      }
      if (p.archive) {
        var g0 = circuitGraph_();
        if ((g0.childCircuits[row.circuit_id] || []).length) throw validationError_([fieldError_('circuit_id', 'IN_USE')]);
        row.archived_at = isoVN_(now_());
        // Gỡ luôn phụ tải của lộ
        (g0.loadsByCircuit[row.circuit_id] || []).forEach(function (l) {
          var l2 = clone_(l); delete l2.__row; l2.archived_at = row.archived_at; cUpdate_(ctx, l2);
          writes.push({ sheet: 'CircuitLoads', mode: 'update', row: l2 });
        });
      } else {
        if (tr) {
          trF.forEach(function (f) { row[f + '_vi'] = tr.values[f + '_vi']; row[f + '_zh'] = tr.values[f + '_zh']; });
          row.i18n_meta = Object.assign({}, row.i18n_meta || {});
          trF.forEach(function (f) { if (tr.meta[f]) row.i18n_meta[f] = tr.meta[f]; else delete row.i18n_meta[f]; });
        }
        if (p.panel_id !== undefined) row.panel_id = p.panel_id;
        if (p.upstream_circuit_id !== undefined) row.upstream_circuit_id = p.upstream_circuit_id || '';
        if (p.supply_role !== undefined) row.supply_role = p.supply_role || 'PRIMARY';
        if (p.status !== undefined && p.status !== '') row.status = p.status;
        if (p.phases !== undefined) row.phases = p.phases === '' ? '' : Number(p.phases);
        CIRCUIT_NUM_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = numOrBlank_(p[f]); });
        CIRCUIT_TEXT_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = trimStr_(p[f]); });
        if (p.cable_section_mm2 !== undefined) row.cable_section_mm2 = normSection_(p.cable_section_mm2);
        var e2 = [];
        var pn = findOne_('Panels', 'panel_id', row.panel_id);
        if (!pn || pn.archived_at) e2.push(fieldError_('panel_id', 'NOT_FOUND'));
        if (row.upstream_circuit_id) {
          var up = findOne_('Circuits', 'circuit_id', row.upstream_circuit_id);
          if (!up || up.archived_at || row.upstream_circuit_id === row.circuit_id) e2.push(fieldError_('upstream_circuit_id', 'NOT_FOUND'));
        }
        if (e2.length) throw validationError_(e2);
        var over = { circuits: {} };
        over.circuits[row.circuit_id] = row;
        var g = circuitGraph_(over);
        var above = row.upstream_circuit_id ? 'C:' + row.upstream_circuit_id : 'P:' + row.panel_id;
        if (reaches_(g, above, 'C:' + row.circuit_id)) throw validationError_([fieldError_(row.upstream_circuit_id ? 'upstream_circuit_id' : 'panel_id', 'CIRCUIT_LOOP')]);
        clearVerify_(row, 'CIRCUIT');
      }
      if (add) {
        qrKey = allocQrKey_();
        writes.unshift({ sheet: 'Circuits', mode: 'insert', row: row });
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'CIRCUIT', row.circuit_id, row.circuit_code, row.name_vi, row.name_zh) });
      } else {
        cUpdate_(ctx, row);
        writes.unshift({ sheet: 'Circuits', mode: 'update', row: row });
        var qr = findOne_('QrRegistry', 'entity_id', row.circuit_id);
        var act = !row.archived_at;
        if (qr && (qr.code !== row.circuit_code || qr.label_vi !== row.name_vi || qr.label_zh !== row.name_zh || qr.active !== act)) {
          var q2 = clone_(qr); delete q2.__row;
          q2.code = row.circuit_code; q2.label_vi = row.name_vi; q2.label_zh = row.name_zh; q2.active = act;
          writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
        }
        qrKey = qr ? qr.qr_key : null;
      }
      var after = clone_(row); delete after.__row;
      return {
        writes: writes, state: su,
        result: { entity_type: 'CIRCUIT', entity_id: row.circuit_id, display_code: row.circuit_code, qr_key: qrKey, record_version: row.record_version, record: projectRow_(ctx, row, 'Circuits') },
        record_version: row.record_version,
        audit: { entity_type: 'CIRCUIT', entity_id: row.circuit_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

function loadSave_(ctx, p) {
  var errs = [];
  if (!isUuidV4_(p.load_link_id)) errs.push(fieldError_('load_link_id', 'ID_INVALID'));
  var add = Number(ctx.req.expected_version || 0) === 0;
  if (!p.remove) {
    if (add && !isUuidV4_(p.circuit_id)) errs.push(fieldError_('circuit_id', 'REQUIRED'));
    if (p.supply_role !== undefined && p.supply_role !== '' && SUPPLY_ROLES_.indexOf(p.supply_role) < 0) errs.push(fieldError_('supply_role', 'INVALID_VALUE'));
    if (p.rated_load_kw !== undefined && numOrBlank_(p.rated_load_kw) === null) errs.push(fieldError_('rated_load_kw', 'INVALID_VALUE'));
    ['equipment_id', 'downstream_panel_id'].forEach(function (f) { if (p[f] !== undefined && p[f] !== '' && !isUuidV4_(p[f])) errs.push(fieldError_(f, 'ID_INVALID')); });
  } else if (add) errs.push(fieldError_('remove', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var cur0 = add ? null : findOne_('CircuitLoads', 'load_link_id', p.load_link_id);
  if (!add && (!cur0 || cur0.archived_at)) throw apiError_('NOT_FOUND');
  var trF = (p.note_vi !== undefined || p.note_zh !== undefined) ? ['note'] : [];
  var tr = trF.length ? applyTranslations_('CircuitLoads', trF, p, cur0) : null;
  return executeWrite_(ctx, {
    entity_type: 'CIRCUIT_LOAD', entity_id: p.load_link_id,
    build: function () {
      var row, before = null, writes = [];
      if (add) {
        if (findRowNums_('CircuitLoads', 'load_link_id', p.load_link_id).length) throw validationError_([fieldError_('load_link_id', 'ID_EXISTS')]);
        row = cNew_(ctx, { load_link_id: p.load_link_id, circuit_id: p.circuit_id, equipment_id: '', downstream_panel_id: '', supply_role: 'PRIMARY', rated_load_kw: '', note_vi: '', note_zh: '' });
      } else {
        var cur = findOne_('CircuitLoads', 'load_link_id', p.load_link_id);
        if (!cur || cur.archived_at) throw apiError_('NOT_FOUND');
        assertVersion_(ctx, cur, 'CIRCUIT_LOAD', 'CircuitLoads');
        before = clone_(cur); delete before.__row;
        row = clone_(cur); delete row.__row;
      }
      var circ = findOne_('Circuits', 'circuit_id', row.circuit_id);
      if (!circ || circ.archived_at) throw validationError_([fieldError_('circuit_id', 'NOT_FOUND')]);
      if (p.remove) {
        row.archived_at = isoVN_(now_());
      } else {
        if (p.equipment_id !== undefined) row.equipment_id = p.equipment_id || '';
        if (p.downstream_panel_id !== undefined) row.downstream_panel_id = p.downstream_panel_id || '';
        if (p.supply_role !== undefined) row.supply_role = p.supply_role || 'PRIMARY';
        if (p.rated_load_kw !== undefined) row.rated_load_kw = numOrBlank_(p.rated_load_kw);
        if (tr) { row.note_vi = tr.values.note_vi; row.note_zh = tr.values.note_zh; row.i18n_meta = Object.assign({}, row.i18n_meta || {}, tr.meta); }
        // Chọn đúng một: thiết bị hoặc tủ nhận nguồn (1.4 §10.3)
        if (!!row.equipment_id === !!row.downstream_panel_id) throw validationError_([fieldError_('equipment_id', 'LOAD_TARGET_ONE')]);
        var over = { loads: {} };
        over.loads[row.load_link_id] = row;
        var g = circuitGraph_(over);
        var dup = (g.loadsByCircuit[row.circuit_id] || []).some(function (l) {
          return l.load_link_id !== row.load_link_id && (l.equipment_id || '') === (row.equipment_id || '') && (l.downstream_panel_id || '') === (row.downstream_panel_id || '');
        });
        if (dup) throw validationError_([fieldError_(row.equipment_id ? 'equipment_id' : 'downstream_panel_id', 'LOAD_DUPLICATE')]);
        if (row.equipment_id) {
          var eq = findOne_('Equipment', 'equipment_id', row.equipment_id);
          if (!eq || eq.archived_at) throw validationError_([fieldError_('equipment_id', 'NOT_FOUND')]);
          // Thiết bị đã nối với tủ không làm phụ tải trực tiếp: trỏ tủ đó (3.13 kiểm 3)
          if (g.panelByEq[row.equipment_id]) throw validationError_([fieldError_('equipment_id', 'PANEL_EQUIPMENT_AS_LOAD')]);
        } else {
          var dp = g.panels[row.downstream_panel_id];
          if (!dp) throw validationError_([fieldError_('downstream_panel_id', 'NOT_FOUND')]);
          if (NO_FEED_PANEL_TYPES_[dp.panel_type]) throw validationError_([fieldError_('downstream_panel_id', 'PANEL_SOURCE_FED')]);
          if (reaches_(g, 'C:' + row.circuit_id, 'P:' + row.downstream_panel_id)) throw validationError_([fieldError_('downstream_panel_id', 'CIRCUIT_LOOP')]);
        }
      }
      // Phụ tải là dữ liệu kỹ thuật của lộ: đổi thì lộ mất xác minh
      if (circ.verified_by || circ.verified_at) {
        var c2 = clone_(circ); delete c2.__row; clearVerify_(c2, 'CIRCUIT'); cUpdate_(ctx, c2);
        writes.push({ sheet: 'Circuits', mode: 'update', row: c2 });
      }
      if (!add) cUpdate_(ctx, row);
      writes.unshift({ sheet: 'CircuitLoads', mode: add ? 'insert' : 'update', row: row });
      var after = clone_(row); delete after.__row;
      return {
        writes: writes,
        result: { entity_type: 'CIRCUIT_LOAD', entity_id: row.load_link_id, record_version: row.record_version, record: projectRow_(ctx, row, 'CircuitLoads') },
        record_version: row.record_version,
        audit: { entity_type: 'CIRCUIT', entity_id: row.circuit_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/**
 * circuit.verify (C3/C4, PIN; không phải người sửa cuối): {entity: PANEL | CIRCUIT, id}. Ghi người và lúc xác minh dữ liệu
 * kỹ thuật (xác minh hồ sơ, không phải xác nhận an toàn/cô lập điện).
 */
function circuitVerify_(ctx) {
  var p = ctx.req.payload || {};
  var kind = p.entity;
  if (kind !== 'PANEL' && kind !== 'CIRCUIT') throw validationError_([fieldError_('entity', 'INVALID_VALUE')]);
  var sheet = kind === 'PANEL' ? 'Panels' : 'Circuits', key = kind === 'PANEL' ? 'panel_id' : 'circuit_id';
  return executeWrite_(ctx, {
    entity_type: kind, entity_id: p.id,
    build: function () {
      var cur = kind === 'PANEL' ? panelOrThrow_(p.id) : circuitOrThrow_(p.id);
      var basis = assertNotSelf_(ctx, 'circuit.verify', [cur.updated_by]);
      assertVersion_(ctx, cur, kind, sheet);
      var row = clone_(cur); delete row.__row;
      var nowIso = isoVN_(now_());
      row.verified_by = ctx.user.user_id;
      if (kind === 'PANEL') row.last_verified_at = nowIso; else row.verified_at = nowIso;
      // Xác minh không tính là "sửa": giữ updated_by của lần sửa dữ liệu kỹ thuật
      row.record_version = (row.record_version || 0) + 1;
      row.updated_at = nowIso;
      return {
        writes: [{ sheet: sheet, mode: 'update', row: row }],
        result: { entity_type: kind, entity_id: row[key], record_version: row.record_version, record: projectRow_(ctx, row, sheet) },
        record_version: row.record_version,
        audit: { entity_type: kind, entity_id: row[key], before_json: { verified_by: cur.verified_by }, after_json: { verified_by: row.verified_by }, auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined, reason: trimStr_(p.self_approval_reason) }
      };
    }
  });
}

/* ---------------- Bản vẽ (phiên bản, duyệt) ---------------- */

/** Bản vẽ lộ điện chưa duyệt chỉ người tải lên và người duyệt thấy (circuit.view là "bản vẽ đã duyệt") */
function drawingVisible_(ctx, d) {
  if (d.kind !== 'DRAWING' || (d.entity_type !== 'PANEL' && d.entity_type !== 'CIRCUIT')) return true;
  if (!d.approval_status || d.approval_status === 'APPROVED' || d.approval_status === 'SUPERSEDED') return true;
  return d.created_by === ctx.user.user_id || can_(ctx, 'circuit.drawing.approve', { module: 'circuits' });
}

/**
 * circuit.drawing.upload (KT, C3, C4): tệp (PDF/ảnh) hoặc liên kết https cho tủ/lộ, kind DRAWING, chờ duyệt (DRAFT);
 * phiên bản = lớn nhất của bản vẽ cùng hồ sơ + 1. Cùng tham số với doc.upload.
 */
function circuitDrawingUpload_(ctx) {
  var p = ctx.req.payload || {};
  if (p.entity_type !== 'PANEL' && p.entity_type !== 'CIRCUIT') throw validationError_([fieldError_('entity_type', 'INVALID_VALUE')]);
  p.kind = 'DRAWING';
  var ver = 1;
  if (isUuidV4_(p.entity_id)) findAll_('Documents', 'entity_id', p.entity_id).forEach(function (d) {
    if (d.kind === 'DRAWING' && d.entity_type === p.entity_type && Number(d.file_version) >= ver) ver = Number(d.file_version) + 1;
  });
  var opts = { action: 'circuit.drawing.upload', extra: { approval_status: 'DRAFT', approved_by: '', approved_at: '', file_version: ver } };
  return p.external_url !== undefined && p.content_b64 === undefined ? docAddLink_(ctx, opts) : docUpload_(ctx, opts);
}

/**
 * circuit.drawing.approve (C3/C4, PIN; không phải người tải lên): {document_id, decision: APPROVE | REJECT, reason}.
 * Duyệt: bản vẽ đã duyệt trước của cùng tủ/lộ chuyển SUPERSEDED.
 */
function circuitDrawingApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.document_id)) errs.push(fieldError_('document_id', 'ID_INVALID'));
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'DOCUMENT', entity_id: p.document_id,
    build: function () {
      var d = findOne_('Documents', 'document_id', p.document_id);
      if (!d || !d.active || d.archived_at || d.kind !== 'DRAWING' || (d.entity_type !== 'PANEL' && d.entity_type !== 'CIRCUIT')) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'circuit.drawing.approve', [d.created_by]);
      assertVersion_(ctx, d, 'DOCUMENT', 'Documents');
      if (d.approval_status !== 'DRAFT') throw validationError_([fieldError_('status', 'STATUS_INVALID')]);
      var nowIso = isoVN_(now_());
      var row = clone_(d); delete row.__row;
      var writes = [];
      if (p.decision === 'REJECT') {
        row.approval_status = 'REJECTED';
      } else {
        row.approval_status = 'APPROVED'; row.approved_by = ctx.user.user_id; row.approved_at = nowIso;
        findAll_('Documents', 'entity_id', d.entity_id).forEach(function (o) {
          if (o.document_id === d.document_id || o.kind !== 'DRAWING' || o.entity_type !== d.entity_type || o.approval_status !== 'APPROVED' || !o.active) return;
          var o2 = clone_(o); delete o2.__row; o2.approval_status = 'SUPERSEDED'; cUpdate_(ctx, o2);
          writes.push({ sheet: 'Documents', mode: 'update', row: o2 });
        });
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Documents', mode: 'update', row: row });
      return {
        writes: writes,
        result: { entity_type: 'DOCUMENT', entity_id: row.document_id, approval_status: row.approval_status, record_version: row.record_version, record: projectDoc_(ctx, row) },
        record_version: row.record_version,
        audit: { entity_type: d.entity_type, entity_id: d.entity_id, before_json: { document_id: d.document_id, approval_status: d.approval_status }, after_json: { approval_status: row.approval_status, superseded: writes.length - 1 || undefined }, reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

/* ---------------- Xem, truy đường cấp ---------------- */

/**
 * circuit.view: {trace: {equipment_id | panel_id | circuit_id, supply_role: PRIMARY | BACKUP | ALL}} → đường cấp;
 * không tham số: danh sách tủ, lộ, phụ tải.
 */
function circuitView_(ctx) {
  var p = ctx.req.payload || {};
  var g = circuitGraph_();
  if (p.trace) {
    var t = p.trace;
    var role = ['PRIMARY', 'BACKUP', 'ALL'].indexOf(t.supply_role) >= 0 ? t.supply_role : 'ALL';
    var start = t.equipment_id ? 'E:' + t.equipment_id : (t.panel_id ? 'P:' + t.panel_id : (t.circuit_id ? 'C:' + t.circuit_id : ''));
    if (!start || !isUuidV4_(start.slice(2))) throw validationError_([fieldError_('trace', 'INVALID_VALUE')]);
    var eqs = {};
    readRows_('Equipment').forEach(function (e) { eqs[e.equipment_id] = e; });
    if (start.charAt(0) === 'E' && !eqs[start.slice(2)]) throw apiError_('NOT_FOUND');
    if (start.charAt(0) === 'P' && !g.panels[start.slice(2)]) throw apiError_('NOT_FOUND');
    if (start.charAt(0) === 'C' && !g.circuits[start.slice(2)]) throw apiError_('NOT_FOUND');
    return { start: start, supply_role: role, paths: tracePaths_(g, start, role, eqs) };
  }
  var qm = qrMap_();
  var proj = function (sheet, key) { return function (r) { var o = projectRow_(ctx, r, sheet); if (sheet !== 'CircuitLoads') o.qr_key = qm[r[key]] || null; return o; }; };
  return {
    panels: Object.keys(g.panels).map(function (k) { return g.panels[k]; }).map(proj('Panels', 'panel_id')),
    circuits: Object.keys(g.circuits).map(function (k) { return g.circuits[k]; }).map(proj('Circuits', 'circuit_id')),
    loads: Object.keys(g.loads).map(function (k) { return g.loads[k]; }).map(proj('CircuitLoads', 'load_link_id'))
  };
}
