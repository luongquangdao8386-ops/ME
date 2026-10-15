/* 33_import_d3: Mẫu Excel Đợt 3 — phụ lục 1.5 mục 6.9.2 ("Excel: mẫu meters, meter_readings, panels, circuits, circuit_loads,
 * metadata bản vẽ"), 1.4 §11.2.
 * meters: sheet meters (thêm/sửa đồng hồ; khóa dòng để sheet chỉ số tham chiếu đồng hồ mới) + meter_readings (chỉ thêm, ghi theo
 *   thứ tự giờ đọc; người nhập là người đọc khi có quyền ghi chỉ số). Xuất ra sheet chỉ số trống (sổ chỉ số xem ở Báo cáo).
 * utility_tariffs: lô nhạy cảm (giá) — người nhập lập nháp, người commit (khác người nhập) duyệt; bản đã duyệt không sửa qua Excel.
 * circuits: panels, circuits, circuit_loads, circuit_drawings (liên kết https; chờ duyệt như bản vẽ tải lên trong app). */

IMPORT_TEMPLATES_.meters = { module: 'utilities', dot: 3, sheets: [
  { name: 'meters', table: 'Meters', entity: 'METER', id: 'meter_id', code: 'meter_code', cols: [
    ic_('meter_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('row_key', 'key', 'Khóa dòng (để sheet chỉ số tham chiếu đồng hồ mới)', '行键（供读数表引用新计量表）'),
    ic_('meter_code', 'code', 'Mã đồng hồ (trống = tự cấp)', '表号（空=自动）'),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('utility_type', 'enum', 'Loại (ELECTRICITY = điện, WATER = nước)', '类型（ELECTRICITY=电，WATER=水）', { req: 'add', options: UTILITY_TYPES_, fixed: 1 }),
    ic_('location_code', 'ref', 'Mã khu vực', '区域编号', { ref: 'Locations', to: 'location_id' }),
    ic_('parent_meter_code', 'ref', 'Mã đồng hồ tổng', '总表表号', { ref: 'Meters', to: 'parent_meter_id', self: 1, upper: 1 }),
    ic_('serial', 'text', 'Số serial', '序列号', { max: 120, keep: 1 }),
    ic_('multiplier', 'num', 'Hệ số (trống = 1)', '倍率（空=1）'),
    ic_('reading_cycle_type', 'enum', 'Chu kỳ ghi chỉ số', '抄表周期', { options: ['DAY_1', 'DAY_5', 'DAY_10', 'MONTH'] }),
    ic_('assignee_code', 'ref', 'Mã NV ghi chỉ số', '抄表人员工编号', { ref: 'Users', to: 'assigned_user_id' }),
    ic_('position_vi', 'text', 'Vị trí lắp (Việt)', '安装位置（越）', { pair: 'position', opt: 1, max: 200 }),
    ic_('position_zh', 'text', 'Vị trí lắp (Trung)', '安装位置（中）', { pair: 'position', opt: 1, max: 200 }),
    ic_('opening_value', 'num', 'Chỉ số mở (khi thêm; trống = lần đọc đầu là mốc gốc)', '初始读数（新增时；空=首次读数为基准）'),
    ic_('opening_at', 'time', 'Lúc đọc chỉ số mở (dd/mm/yyyy hh:mm)', '初始读数时间（dd/mm/yyyy hh:mm）'),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
  { name: 'meter_readings', table: 'MeterReadings', entity: 'METER_READING', id: 'reading_id', addOnly: true, exportEmpty: true, orderBy: 'measured_at', cols: [
    ic_('reading_id', 'id', 'ID (để trống)', 'ID（留空）'),
    ic_('meter_key', 'ref', 'Mã đồng hồ hoặc khóa dòng', '表号或行键', { req: 1, ref: 'Meters', to: 'meter_id', fileSheet: 'meters', upper: 1 }),
    ic_('measured_at', 'time', 'Đọc lúc (dd/mm/yyyy hh:mm)', '读取时间（dd/mm/yyyy hh:mm）', { req: 1 }),
    ic_('cumulative_value', 'num', 'Chỉ số lũy kế', '累计读数', { req: 1 }),
    ic_('note_vi', 'text', 'Ghi chú (Việt)', '备注（越）', { pair: 'note', opt: 1, max: 500 }), ic_('note_zh', 'text', 'Ghi chú (Trung)', '备注（中）', { pair: 'note', opt: 1, max: 500 })] }] };

IMPORT_TEMPLATES_.utility_tariffs = { module: 'utilities', dot: 3, sensitive: true, requires: 'tariff.edit', exportRequires: 'tariff.view', sheets: [
  { name: 'utility_tariffs', table: 'UtilityTariffs', entity: 'TARIFF', id: 'tariff_id', cols: [
    ic_('tariff_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('utility_type', 'enum', 'Loại (ELECTRICITY = điện, WATER = nước)', '类型（ELECTRICITY=电，WATER=水）', { req: 'add', options: UTILITY_TYPES_, fixed: 1 }),
    ic_('location_code', 'ref', 'Mã khu vực (trống = toàn nhà máy)', '区域编号（空=全厂）', { ref: 'Locations', to: 'location_id' }),
    ic_('name_vi', 'text', 'Tên biểu giá (Việt)', '价目名称（越）', { pair: 'name', opt: 1, max: 200 }), ic_('name_zh', 'text', 'Tên biểu giá (Trung)', '价目名称（中）', { pair: 'name', opt: 1, max: 200 }),
    ic_('effective_from', 'date', 'Hiệu lực từ ngày', '生效日期', { req: 'add' }),
    ic_('effective_to', 'date', 'Hiệu lực đến ngày (trống = đang áp dụng)', '失效日期（空=持续有效）'),
    ic_('unit_price', 'num', 'Đơn giá (mỗi kWh hoặc m³)', '单价（每 kWh 或 m³）', { req: 'add', cost: 1 }),
    ic_('currency', 'text', 'Tiền tệ (trống = VND)', '币种（空=VND）', { cost: 1, max: 3, upper: 1 }),
    ic_('tax_rate', 'num', 'Thuế (%)', '税率（%）', { cost: 1 }),
    ic_('status', 'text', 'Trạng thái (máy chủ ghi)', '状态（系统填写）', { readonly: 1 }),
    ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] };

IMPORT_TEMPLATES_.circuits = { module: 'circuits', dot: 3, sheets: [
  { name: 'panels', table: 'Panels', entity: 'PANEL', id: 'panel_id', code: 'panel_code', cols: [
    ic_('panel_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('row_key', 'key', 'Khóa dòng (để sheet lộ, phụ tải tham chiếu tủ mới)', '行键（供回路、负载表引用新配电柜）'),
    ic_('panel_code', 'code', 'Mã tủ (trống = tự cấp)', '配电柜编号（空=自动）'),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('panel_type', 'enum', 'Loại tủ', '配电柜类型', { req: 'add', options: PANEL_TYPES_ }),
    ic_('equipment_code', 'ref', 'Mã thiết bị của tủ (hồ sơ dùng chung)', '配电柜对应设备编号（共用档案）', { ref: 'Equipment', to: 'equipment_id', upper: 1 }),
    ic_('location_code', 'ref', 'Mã khu vực (có thiết bị thì theo thiết bị)', '区域编号（有设备时以设备为准）', { ref: 'Locations', to: 'location_id' }),
    ic_('supply_voltage', 'num', 'Điện áp (V)', '电压（V）'), ic_('rated_current', 'num', 'Dòng định mức (A)', '额定电流（A）'),
    ic_('status', 'enum', 'Trạng thái', '状态', { options: CIRCUIT_STATUS_ }),
    ic_('note_vi', 'text', 'Ghi chú (Việt)', '备注（越）', { pair: 'note', opt: 1, max: 500 }), ic_('note_zh', 'text', 'Ghi chú (Trung)', '备注（中）', { pair: 'note', opt: 1, max: 500 }),
    ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
  { name: 'circuits', table: 'Circuits', entity: 'CIRCUIT', id: 'circuit_id', code: 'circuit_code', cols: [
    ic_('circuit_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('row_key', 'key', 'Khóa dòng (để lộ con, phụ tải tham chiếu lộ mới)', '行键（供下级回路、负载引用新回路）'),
    ic_('circuit_code', 'code', 'Mã lộ (trống = tự cấp)', '回路编号（空=自动）'),
    ic_('panel_key', 'ref', 'Tủ cha (mã tủ hoặc khóa dòng)', '所属配电柜（编号或行键）', { req: 'add', ref: 'Panels', to: 'panel_id', fileSheet: 'panels', upper: 1 }),
    ic_('upstream_circuit_key', 'ref', 'Lộ cấp trên (mã hoặc khóa dòng)', '上级回路（编号或行键）', { ref: 'Circuits', to: 'upstream_circuit_id', self: 1, upper: 1 }),
    ic_('supply_role', 'enum', 'Vai trò nguồn (PRIMARY = chính, BACKUP = dự phòng)', '供电角色（PRIMARY=主，BACKUP=备用）', { options: SUPPLY_ROLES_ }),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('phases', 'int', 'Số pha', '相数'), ic_('voltage', 'num', 'Điện áp (V)', '电压（V）'),
    ic_('breaker_model', 'text', 'Thiết bị bảo vệ', '保护装置型号', { max: 120, keep: 1 }), ic_('breaker_rating_a', 'num', 'Dòng bảo vệ (A)', '保护电流（A）'),
    ic_('protection_setting', 'text', 'Chỉnh định bảo vệ', '保护整定值', { max: 120, keep: 1 }),
    ic_('cable_type', 'text', 'Loại cáp', '电缆型号', { max: 120, keep: 1 }), ic_('cable_section_mm2', 'text', 'Tiết diện cáp (mm²)', '电缆截面（mm²）', { max: 120, keep: 1 }),
    ic_('cable_length_m', 'num', 'Chiều dài cáp (m)', '电缆长度（m）'),
    ic_('route_vi', 'text', 'Đường đi (Việt)', '走向（越）', { pair: 'route', opt: 1, max: 500 }), ic_('route_zh', 'text', 'Đường đi (Trung)', '走向（中）', { pair: 'route', opt: 1, max: 500 }),
    ic_('status', 'enum', 'Trạng thái', '状态', { options: CIRCUIT_STATUS_ }),
    ic_('note_vi', 'text', 'Ghi chú (Việt)', '备注（越）', { pair: 'note', opt: 1, max: 500 }), ic_('note_zh', 'text', 'Ghi chú (Trung)', '备注（中）', { pair: 'note', opt: 1, max: 500 }),
    ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
  { name: 'circuit_loads', table: 'CircuitLoads', entity: 'CIRCUIT_LOAD', id: 'load_link_id', cols: [
    ic_('load_link_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('circuit_key', 'ref', 'Lộ (mã hoặc khóa dòng)', '回路（编号或行键）', { req: 1, ref: 'Circuits', to: 'circuit_id', fileSheet: 'circuits', fixed: 1, upper: 1 }),
    ic_('equipment_code', 'ref', 'Thiết bị nhận điện (mã)', '受电设备（编号）', { ref: 'Equipment', to: 'equipment_id', upper: 1 }),
    ic_('downstream_panel_key', 'ref', 'Hoặc tủ nhận nguồn (mã tủ hoặc khóa dòng)', '或受电配电柜（编号或行键）', { ref: 'Panels', to: 'downstream_panel_id', fileSheet: 'panels', upper: 1 }),
    ic_('supply_role', 'enum', 'Vai trò nguồn (PRIMARY = chính, BACKUP = dự phòng)', '供电角色（PRIMARY=主，BACKUP=备用）', { options: SUPPLY_ROLES_ }),
    ic_('rated_load_kw', 'num', 'Công suất điện (kW)', '电功率（kW）'),
    ic_('note_vi', 'text', 'Ghi chú (Việt)', '备注（越）', { pair: 'note', opt: 1, max: 500 }), ic_('note_zh', 'text', 'Ghi chú (Trung)', '备注（中）', { pair: 'note', opt: 1, max: 500 }),
    ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
  { name: 'circuit_drawings', table: 'Documents', entity: 'DOCUMENT', id: 'document_id', addOnly: true, exportEmpty: true, cols: [
    ic_('document_id', 'id', 'ID (để trống)', 'ID（留空）'),
    ic_('panel_key', 'ref', 'Bản vẽ của tủ (mã tủ hoặc khóa dòng)', '配电柜图纸（编号或行键）', { ref: 'Panels', to: 'panel_id', fileSheet: 'panels', upper: 1 }),
    ic_('circuit_key', 'ref', 'Hoặc của lộ (mã lộ hoặc khóa dòng)', '或回路图纸（编号或行键）', { ref: 'Circuits', to: 'circuit_id', fileSheet: 'circuits', upper: 1 }),
    ic_('title_vi', 'text', 'Tên bản vẽ (Việt)', '图纸名称（越）', { pair: 'title', max: 200 }), ic_('title_zh', 'text', 'Tên bản vẽ (Trung)', '图纸名称（中）', { pair: 'title', max: 200 }),
    ic_('external_url', 'text', 'Liên kết bản vẽ (https://…)', '图纸链接（https://…）', { req: 1, max: 2000, keep: 1 }),
    ic_('document_date', 'date', 'Ngày bản vẽ', '图纸日期')] }] };

REF_CODE_COL_.Meters = 'meter_code';
REF_CODE_COL_.Panels = 'panel_code';
REF_CODE_COL_.Circuits = 'circuit_code';

/** Danh mục mã thêm trong mẫu: đồng hồ, tủ, lộ (mã · tên) */
function importTemplateListsD3_(t, addList) {
  var pick = function (sheet, code) {
    return readRows_(sheet).filter(function (r) { return !r.archived_at && r.active !== false; }).map(function (r) { return [r[code], r.name_vi || r.name_zh]; })
      .sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
  };
  if (t.module === 'utilities') addList('meters', pick('Meters', 'meter_code'));
  if (t.module === 'circuits') { addList('panels', pick('Panels', 'panel_code')); addList('circuits', pick('Circuits', 'circuit_code')); }
}

/** Mẫu Đợt 3 cần quyền riêng ngoài cờ Nhập của module (biểu giá: quyền lập biểu giá) */
function assertImportTemplateUse_(ctx, t, forExport) {
  var a = forExport ? (t.exportRequires || t.requires) : t.requires;
  if (a && !can_(ctx, a, { module: t.module })) throw apiError_('FORBIDDEN');
}

function numOk_(v, min, max) { return v === undefined || v === '' || (Number(v) >= min && Number(v) <= max); }

/** Kiểm thêm theo dòng (lượt 2, đã có tham chiếu). st: trạng thái dùng chung của cả lô (chỉ số trùng trong file) */
function importRowCheckD3_(x, st) {
  if (!x.sh) return;
  var v = x.vals, cur = x.cur || {};
  var val = function (f) { return v[f] !== undefined ? v[f] : cur[f]; };
  var nowMs = now_().getTime() + 5 * 60000;
  var future = function (f) { var t0 = v[f] ? parseTime_(v[f]) : null; return !!t0 && t0.getTime() > nowMs; };
  switch (x.sh.table) {
    case 'Meters':
      if (x.action === 'UPDATE') {
        ['opening_value', 'opening_at'].forEach(function (f) { if (v[f] !== undefined && v[f] !== '') x.errs.push([f, 'INVALID_VALUE']); });
      } else {
        if (v.opening_at && (v.opening_value === undefined || v.opening_value === '')) x.errs.push(['opening_value', 'REQUIRED']);
        if (!numOk_(v.opening_value, 0, 1e12)) x.errs.push(['opening_value', 'INVALID_VALUE']);
        if (future('opening_at')) x.errs.push(['opening_at', 'TIME_ORDER_INVALID']);
      }
      if (v.multiplier !== undefined && v.multiplier !== '' && !(Number(v.multiplier) > 0 && Number(v.multiplier) <= 1e6)) x.errs.push(['multiplier', 'INVALID_VALUE']);
      break;
    case 'MeterReadings': {
      if (!numOk_(v.cumulative_value, 0, 1e12)) x.errs.push(['cumulative_value', 'INVALID_VALUE']);
      if (future('measured_at')) x.errs.push(['measured_at', 'TIME_ORDER_INVALID']);
      var mid = x.refs.meter_id;
      var t1 = v.measured_at ? parseTime_(v.measured_at) : null;
      if (!mid || !t1) break;
      var m = readRowsCached_('Meters').filter(function (r) { return r.meter_id === mid; })[0];
      if (m && (m.active === false || m.archived_at)) x.errs.push(['meter_key', 'METER_INACTIVE']);
      var k = mid + '|' + t1.getTime();
      st.readings = st.readings || {};
      var dup = st.readings[k] || readRowsCached_('MeterReadings').some(function (r) {
        if (r.meter_id !== mid || r.status === 'VOID') return false;
        var t2 = parseTime_(r.measured_at);
        return !!t2 && t2.getTime() === t1.getTime();
      });
      if (dup) x.errs.push(['measured_at', 'READING_DUPLICATE']);
      st.readings[k] = true;
      break;
    }
    case 'UtilityTariffs': {
      var a = val('effective_from'), b = val('effective_to');
      if (a && b && b < a) x.errs.push(['effective_to', 'INVALID_DATE']);
      if (!numOk_(v.unit_price, 0, 1e12)) x.errs.push(['unit_price', 'INVALID_VALUE']);
      if (!numOk_(v.tax_rate, 0, 100)) x.errs.push(['tax_rate', 'INVALID_VALUE']);
      if (v.currency && !/^[A-Z]{3}$/.test(String(v.currency))) x.errs.push(['currency', 'INVALID_VALUE']);
      // Biểu giá đã duyệt/ngừng không sửa qua Excel (đổi giá = thêm biểu giá mới); dòng xuất ra nhập lại nguyên trạng thì bỏ qua
      if (x.action === 'UPDATE' && cur.status !== 'DRAFT' && cur.status !== 'REJECTED' &&
        !importRowUnchanged_(x.sh, { action: 'UPDATE', entity_id: x.entityId, normalized_payload_json: { v: v, r: x.refs } }, cur)) x.errs.push(['tariff_id', 'STATUS_INVALID']);
      break;
    }
    case 'Panels':
      ['supply_voltage', 'rated_current'].forEach(function (f) { if (!numOk_(v[f], 0, 1e9)) x.errs.push([f, 'INVALID_VALUE']); });
      break;
    case 'Circuits':
      if (v.phases !== undefined && v.phases !== '' && [1, 2, 3].indexOf(Number(v.phases)) < 0) x.errs.push(['phases', 'INVALID_VALUE']);
      ['voltage', 'breaker_rating_a', 'cable_length_m'].forEach(function (f) { if (!numOk_(v[f], 0, 1e9)) x.errs.push([f, 'INVALID_VALUE']); });
      break;
    case 'CircuitLoads': {
      if (!numOk_(v.rated_load_kw, 0, 1e9)) x.errs.push(['rated_load_kw', 'INVALID_VALUE']);
      var eq = x.refs.equipment_id !== undefined ? x.refs.equipment_id : cur.equipment_id;
      var dp = x.refs.downstream_panel_id !== undefined ? x.refs.downstream_panel_id : cur.downstream_panel_id;
      if (!!eq === !!dp && !x.errs.some(function (e) { return e[0] === 'equipment_code' || e[0] === 'downstream_panel_key'; })) x.errs.push(['equipment_code', 'LOAD_TARGET_ONE']);
      break;
    }
    case 'Documents':
      if (!!x.refs.panel_id === !!x.refs.circuit_id && !x.errs.some(function (e) { return e[0] === 'panel_key' || e[0] === 'circuit_key'; })) x.errs.push(['panel_key', 'DRAWING_TARGET_ONE']);
      if (v.external_url && !/^https:\/\/[^\s<>"]{3,2000}$/.test(String(v.external_url))) x.errs.push(['external_url', 'URL_INVALID']);
      break;
  }
}

/** Người chạy thao tác của dòng: người nhập nếu có quyền đó (người đọc chỉ số, người tải bản vẽ), không thì người commit */
function importActor_(ctx, importer, action, module) {
  if (!importer || importer.user_id === ctx.user.user_id) return null;
  var sub = { user: importer, req: { payload: {} } };
  try { return can_(sub, action, { module: module }) ? importer : null; } catch (e) { return null; }
}

/** Ghi một dòng của mẫu Đợt 3; undefined = không phải bảng Đợt 3 */
function commitImportRowD3_(ctx, b, sh, r, importer, run, p, ev, add) {
  switch (sh.table) {
    case 'Meters':
      if (p.active === false) p.reason = 'Excel ' + b.import_batch_id.slice(0, 8);
      if (!add) { delete p.opening_value; delete p.opening_at; delete p.utility_type; }
      return run('meter.edit', p, r.import_row_id, ev);
    case 'MeterReadings':
      return run('reading.create', p, r.import_row_id, 0, importActor_(ctx, importer, 'reading.create', 'utilities'));
    case 'UtilityTariffs': {
      // Người nhập lập/sửa nháp; người commit duyệt (commit lô nhạy cảm là duyệt)
      delete p.status;
      run('tariff.edit', p, r.import_row_id, ev, importer);
      var tf = findOne_('UtilityTariffs', 'tariff_id', r.entity_id);
      if (tf && tf.status === 'DRAFT') run('tariff.approve', { tariff_id: r.entity_id, decision: 'APPROVE' }, uuidFrom_(r.import_row_id + ':approve'), tf.record_version);
      return true;
    }
    case 'Panels': p.entity = 'PANEL'; return run('circuit.edit', p, r.import_row_id, ev);
    case 'Circuits': p.entity = 'CIRCUIT'; return run('circuit.edit', p, r.import_row_id, ev);
    case 'CircuitLoads': p.entity = 'LOAD'; if (!add) delete p.circuit_id; return run('circuit.edit', p, r.import_row_id, ev);
    case 'Documents': {
      var q = {
        document_id: r.entity_id, entity_type: p.panel_id ? 'PANEL' : 'CIRCUIT', entity_id: p.panel_id || p.circuit_id,
        external_url: p.external_url, title_vi: p.title_vi, title_zh: p.title_zh, document_date: p.document_date
      };
      return run('circuit.drawing.upload', q, r.import_row_id, 0, importActor_(ctx, importer, 'circuit.drawing.upload', 'circuits'));
    }
  }
  return undefined;
}
