/* 32_reports: Báo cáo — 1.4 §5.6, §3.7.2; phụ lục 1.5 mục 4.4.10, 4.4.11 (export.pdf), 4.5, 5.3.9, 6.9.2.
 * Mẫu tích hợp (8 mẫu, 5.3.9) và mẫu do quản trị lập (chọn tập dữ liệu và cột hiển thị; không ghi đè số tính).
 * Báo cáo xem trực tiếp tính lại mỗi lần; báo cáo đã lưu là bản chụp (ReportRuns + tệp JSON riêng tư trên Drive),
 * mã BC-yymm-001, có QR. Số liệu theo quyền xem và quyền giá của module nguồn; bản có chi phí mang COST_VIEW.
 * Màn, Excel, PDF không có logo hay cụm nhận diện app (1.4 §3.5). PDF dựng bằng Google Docs (font Việt + Trung, 5.4.7). */

var REPORT_ROW_MAX_ = 2000;
var REPORT_PDF_ROW_MAX_ = 500;
var REPORT_CHART_TYPES_ = ['AUTO', 'NONE', 'BAR', 'LINE'];
var REPORT_SNAPSHOT_MAX_ = 9 * 1024 * 1024;

/** Một cột báo cáo: [khóa, kiểu, Việt, 中文, tùy chọn] — kiểu: code text bi num date time enum money */
function rc_(key, type, vi, zh, o) { var c = o || {}; c.key = key; c.type = type; c.vi = vi; c.zh = zh; return c; }

var RPT_BUILTIN_ = [
  ['RPT_EQUIPMENT', 'EQUIPMENT', 'equipment'], ['RPT_MAINTENANCE', 'MAINTENANCE', 'maintenance'], ['RPT_REPAIRS', 'REPAIRS', 'repairs'],
  ['RPT_MATERIALS', 'MATERIALS', 'warehouse'], ['RPT_UTILITIES', 'UTILITIES', 'utilities'], ['RPT_CIRCUITS', 'CIRCUITS', 'circuits'],
  ['RPT_CONTRACTS', 'CONTRACTS', 'contracts'], ['RPT_INSPECTIONS', 'INSPECTIONS', 'inspections']
];

/* ---------------- Tra cứu dùng chung ---------------- */

function rptLook_() {
  var L = { eqs: {}, locs: {}, lookups: {}, mats: {}, vendors: {}, users: userDirectory_() };
  readRows_('Equipment').forEach(function (e) { L.eqs[e.equipment_id] = e; });
  readRows_('Locations').forEach(function (l) { L.locs[l.location_id] = l; });
  readRows_('LookupValues').forEach(function (x) { L.lookups[x.value_id] = x; });
  return L;
}

function rptName_(rec, f) { f = f || 'name'; return rec ? (rec[f + '_vi'] || rec[f + '_zh'] || '') : ''; }
function rptEq_(L, id) { var e = L.eqs[id]; return e ? e.equipment_code : ''; }
function rptEqName_(L, id) { var e = L.eqs[id]; return e ? rptName_(e) : ''; }
function rptLoc_(L, id) { var l = L.locs[id]; return l ? l.location_code + ' · ' + rptName_(l) : ''; }
function rptUser_(L, id) { var u = L.users[id]; return u ? u.display_name : ''; }
/** Hồ sơ thuộc khu vực lọc (gồm khu vực con) */
function rptInLoc_(L, locId, filterLoc) { return !filterLoc || locationChain_(L.locs, locId).indexOf(filterLoc) >= 0; }
function rptInRange_(d, f) { var s = String(d || '').slice(0, 10); return (!f.from || s >= f.from) && (!f.to || s <= f.to); }
function rptHours_(a, b) {
  var x = tms_(a), y = tms_(b);
  return x === null || y === null || y < x ? null : Math.round((y - x) / 360000) / 10;
}
function rptDue_(due, today) {
  var dr = daysRemaining_(due, today);
  var lead = Number(setting_('lead_days') || 40);
  if (dr === null) return { days: null, state: 'MISSING' };
  return { days: dr, state: dr > lead ? 'NOT_DUE' : (dr > 0 ? 'DUE_SOON' : (dr === 0 ? 'DUE_TODAY' : 'OVERDUE')) };
}
function countBy_(rows, key) {
  var m = {};
  rows.forEach(function (r) { var k = r[key] || ''; if (k) m[k] = (m[k] || 0) + 1; });
  return m;
}
function sumItem_(labelVi, labelZh, value, o) { var s = o || {}; s.label_vi = labelVi; s.label_zh = labelZh; s.value = value; return s; }

/* ---------------- Tập dữ liệu (8 mẫu tích hợp) ---------------- */

var REPORT_DATASETS_ = {
  EQUIPMENT: {
    module: 'equipment', view: 'equipment.view', chart: 'BAR', filters: ['location_id', 'status'],
    columns: [
      rc_('equipment_code', 'code', 'Mã thiết bị', '设备编号'), rc_('name', 'bi', 'Tên thiết bị', '设备名称'),
      rc_('location', 'text', 'Khu vực', '区域'), rc_('category', 'text', 'Loại', '类别'), rc_('manufacturer', 'text', 'Hãng', '品牌'),
      rc_('model', 'code', 'Model', '型号'), rc_('serial', 'code', 'Số serial', '序列号'),
      rc_('status', 'enum', 'Tình trạng', '状态', { enumKey: 'equipment_status' }), rc_('criticality', 'enum', 'Mức quan trọng', '重要程度', { enumKey: 'criticality' }),
      rc_('owner', 'text', 'Người phụ trách', '负责人'), rc_('parts_count', 'num', 'Linh kiện gắn máy', '关联配件数'),
      rc_('open_repairs', 'num', 'Sự cố đang mở', '未结故障')
    ],
    build: function (ctx, f, L) {
      var parts = {}, reps = {};
      readRows_('EquipmentParts').forEach(function (x) { if (!x.archived_at && !x.removed_at) parts[x.equipment_id] = (parts[x.equipment_id] || 0) + 1; });
      if (releasedDot_() >= 2) readRows_('Repairs').forEach(function (r) { if (!r.archived_at && REPAIR_OPEN_[r.status]) reps[r.equipment_id] = (reps[r.equipment_id] || 0) + 1; });
      var rows = readRows_('Equipment').filter(function (e) {
        return !e.archived_at && rptInLoc_(L, e.location_id, f.location_id) && (!f.status || e.status === f.status);
      }).map(function (e) {
        var cat = L.lookups[e.category_id];
        return {
          equipment_code: e.equipment_code, name_vi: e.name_vi, name_zh: e.name_zh, location: rptLoc_(L, e.location_id),
          category: cat ? rptName_(cat) : '', manufacturer: e.manufacturer || '', model: e.model || '', serial: e.serial || '',
          status: e.status, criticality: e.criticality || '', owner: rptUser_(L, e.owner_user_id), parts_count: parts[e.equipment_id] || 0,
          open_repairs: reps[e.equipment_id] || 0
        };
      }).sort(function (a, b) { return String(a.equipment_code).localeCompare(String(b.equipment_code)); });
      var by = countBy_(rows, 'status');
      return {
        rows: rows,
        summary: [sumItem_('Tổng thiết bị', '设备总数', rows.length)].concat(Object.keys(by).map(function (k) { return sumItem_('', '', by[k], { enumKey: 'equipment_status', enum: k }); })),
        chart: { type: 'BAR', series: Object.keys(by).map(function (k) { return { enumKey: 'equipment_status', key: k, value: by[k] }; }) }
      };
    }
  },
  MAINTENANCE: {
    module: 'maintenance', view: 'maintenance.view', chart: 'BAR', filters: ['from', 'to', 'location_id', 'status'], dot: 2,
    columns: [
      rc_('work_order_code', 'code', 'Mã phiếu', '工单号'), rc_('equipment_code', 'code', 'Mã thiết bị', '设备编号'), rc_('equipment_name', 'text', 'Thiết bị', '设备'),
      rc_('title', 'bi', 'Nội dung', '内容'), rc_('due_date', 'date', 'Hạn', '期限'), rc_('status', 'enum', 'Trạng thái', '状态', { enumKey: 'wo_status' }),
      rc_('overall_result', 'enum', 'Kết quả', '结果', { enumKey: 'overall_result' }), rc_('assignee', 'text', 'Người làm', '执行人'),
      rc_('end_at', 'time', 'Kết thúc', '完成时间'), rc_('on_time', 'enum', 'Đúng hạn', '按期', { enumKey: 'on_time' }),
      rc_('labor_minutes', 'num', 'Giờ công (phút)', '工时（分钟）'),
      rc_('labor_cost', 'money', 'Chi phí nhân công (tham khảo)', '人工费（参考）', { cost: true, cur: 'currency' }),
      rc_('other_cost', 'money', 'Chi phí khác (tham khảo)', '其他费用（参考）', { cost: true, cur: 'currency' })
    ],
    build: function (ctx, f, L, cost) {
      var today = todayVN_();
      var rows = readRows_('WorkOrders').filter(function (w) {
        var e = L.eqs[w.equipment_id] || {};
        return !w.archived_at && rptInRange_(w.due_date, f) && rptInLoc_(L, e.location_id, f.location_id) && (!f.status || w.status === f.status);
      }).map(function (w) {
        var done = w.status === 'COMPLETED';
        var o = {
          work_order_code: w.work_order_code, equipment_code: rptEq_(L, w.equipment_id), equipment_name: rptEqName_(L, w.equipment_id),
          title_vi: w.title_vi, title_zh: w.title_zh, due_date: w.due_date, status: w.status, overall_result: w.overall_result || '',
          assignee: rptUser_(L, w.assignee_user_id), end_at: w.end_at || '',
          on_time: done && w.end_at && w.due_date ? (String(isoVN_(parseTime_(w.end_at))).slice(0, 10) <= w.due_date ? 'YES' : 'NO') : '',
          labor_minutes: w.labor_minutes === null ? '' : w.labor_minutes
        };
        if (cost) { o.labor_cost = w.labor_cost === null ? '' : w.labor_cost; o.other_cost = w.other_cost === null ? '' : w.other_cost; o.currency = w.cost_currency || ''; }
        return o;
      }).sort(function (a, b) { return String(a.due_date).localeCompare(String(b.due_date)) || String(a.work_order_code).localeCompare(String(b.work_order_code)); });
      var completed = rows.filter(function (r) { return r.status === 'COMPLETED'; });
      var onTime = completed.filter(function (r) { return r.on_time === 'YES'; }).length;
      var overdue = rows.filter(function (r) { return r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && r.due_date && r.due_date < today; }).length;
      var by = countBy_(rows, 'status');
      return {
        rows: rows,
        summary: [
          sumItem_('Tổng phiếu', '工单总数', rows.length), sumItem_('Hoàn thành', '已完成', completed.length),
          sumItem_('Đúng hạn', '按期完成', completed.length ? Math.round(onTime / completed.length * 1000) / 10 : null, { unit: '%' }),
          sumItem_('Quá hạn chưa xong', '逾期未完成', overdue, { tone: overdue ? 'red' : '' }),
          sumItem_('Không đạt', '不合格', rows.filter(function (r) { return r.overall_result === 'FAIL'; }).length)
        ],
        chart: { type: 'BAR', series: Object.keys(by).map(function (k) { return { enumKey: 'wo_status', key: k, value: by[k] }; }) },
        notes: cost ? ['rpt.note.manual_cost'] : []
      };
    }
  },
  REPAIRS: {
    module: 'repairs', view: 'repair.view', chart: 'BAR', filters: ['from', 'to', 'location_id', 'status', 'severity'], dot: 2,
    columns: [
      rc_('repair_code', 'code', 'Mã phiếu', '单号'), rc_('equipment_code', 'code', 'Mã thiết bị', '设备编号'), rc_('equipment_name', 'text', 'Thiết bị', '设备'),
      rc_('symptom', 'bi', 'Hiện tượng', '故障现象'), rc_('severity', 'enum', 'Mức độ', '严重程度', { enumKey: 'severity' }),
      rc_('reported_at', 'time', 'Báo lúc', '报修时间'), rc_('status', 'enum', 'Trạng thái', '状态', { enumKey: 'repair_status' }),
      rc_('root_cause', 'text', 'Nguyên nhân gốc', '根本原因'), rc_('repair_start_at', 'time', 'Bắt đầu sửa', '开始维修'),
      rc_('repair_end_at', 'time', 'Kết thúc sửa', '维修结束'), rc_('restored_at', 'time', 'Hoạt động lại', '恢复运行'),
      rc_('repair_hours', 'num', 'Thời gian sửa (h)', '维修时长（h）'), rc_('downtime_hours', 'num', 'Dừng máy (h)', '停机时长（h）'),
      rc_('assignee', 'text', 'Người phụ trách', '负责人'),
      rc_('labor_cost', 'money', 'Chi phí nhân công (tham khảo)', '人工费（参考）', { cost: true, cur: 'currency' }),
      rc_('outside_cost', 'money', 'Dịch vụ ngoài (tham khảo)', '外部服务费（参考）', { cost: true, cur: 'currency' })
    ],
    build: function (ctx, f, L, cost) {
      var causes = {};
      Object.keys(L.lookups).forEach(function (k) { var x = L.lookups[k]; if (x.group_key === 'CAUSE') causes[x.code] = rptName_(x); });
      var rows = readRows_('Repairs').filter(function (r) {
        var e = L.eqs[r.equipment_id] || {};
        return !r.archived_at && rptInRange_(r.reported_at, f) && rptInLoc_(L, e.location_id, f.location_id) &&
          (!f.status || r.status === f.status) && (!f.severity || r.severity === f.severity);
      }).map(function (r) {
        var o = {
          repair_code: r.repair_code, equipment_code: rptEq_(L, r.equipment_id), equipment_name: rptEqName_(L, r.equipment_id),
          symptom_vi: r.symptom_vi, symptom_zh: r.symptom_zh, severity: r.severity, reported_at: r.reported_at, status: r.status,
          root_cause: r.root_cause_code ? (r.root_cause_code + (causes[r.root_cause_code] ? ' · ' + causes[r.root_cause_code] : '')) : '',
          repair_start_at: r.repair_start_at || '', repair_end_at: r.repair_end_at || '', restored_at: r.restored_at || '',
          repair_hours: rptHours_(r.repair_start_at, r.repair_end_at), downtime_hours: rptHours_(r.stopped_at, r.restored_at),
          assignee: rptUser_(L, r.assignee_user_id), machine_down: !!(r.stopped_at && !r.restored_at && REPAIR_OPEN_[r.status])
        };
        if (cost) { o.labor_cost = r.labor_cost === null ? '' : r.labor_cost; o.outside_cost = r.outside_cost === null ? '' : r.outside_cost; o.currency = r.cost_currency || ''; }
        return o;
      }).sort(function (a, b) { return String(b.reported_at).localeCompare(String(a.reported_at)); });
      var down = 0;
      rows.forEach(function (r) { if (r.downtime_hours !== null) down += r.downtime_hours; });
      var by = countBy_(rows, 'severity');
      return {
        rows: rows,
        summary: [
          sumItem_('Tổng sự cố', '故障总数', rows.length),
          sumItem_('Hoàn thành', '已完成', rows.filter(function (r) { return r.status === 'COMPLETED'; }).length),
          sumItem_('Máy đang dừng', '停机中', rows.filter(function (r) { return r.machine_down; }).length),
          sumItem_('Tổng dừng máy (đủ hai mốc)', '停机总时长（两个时点齐全）', Math.round(down * 10) / 10, { unit: 'h' })
        ].concat(Object.keys(by).map(function (k) { return sumItem_('', '', by[k], { enumKey: 'severity', enum: k }); })),
        chart: { type: 'BAR', series: ['HIGH', 'MEDIUM', 'LOW'].filter(function (k) { return by[k]; }).map(function (k) { return { enumKey: 'severity', key: k, value: by[k] }; }) },
        notes: cost ? ['rpt.note.manual_cost'] : []
      };
    }
  },
  MATERIALS: {
    module: 'warehouse', view: 'material.view', chart: 'NONE', filters: ['from', 'to', 'location_id'], dot: 2,
    columns: [
      rc_('material_code', 'code', 'Mã vật tư', '物料编号'), rc_('material', 'bi', 'Vật tư', '物料'), rc_('work_code', 'code', 'Phiếu', '工单'),
      rc_('equipment_code', 'code', 'Mã thiết bị', '设备编号'), rc_('actual_used_qty', 'num', 'Thực dùng', '实际用量'),
      rc_('scrap_qty', 'num', 'Hỏng/hao hụt', '损耗'), rc_('unit', 'code', 'Đơn vị', '单位'),
      rc_('status', 'enum', 'Trạng thái', '状态', { enumKey: 'usage_status' }), rc_('recorded_at', 'time', 'Ghi lúc', '记录时间'),
      rc_('recorded_by', 'text', 'Người ghi', '记录人'),
      rc_('manual_unit_cost', 'money', 'Đơn giá (tham khảo)', '单价（参考）', { cost: true, cur: 'currency' }),
      rc_('cost_total', 'money', 'Thành tiền (tham khảo)', '金额（参考）', { cost: true, cur: 'currency' })
    ],
    build: function (ctx, f, L, cost) {
      var mats = {};
      readRows_('Materials').forEach(function (m) { mats[m.material_id] = m; });
      var works = {};
      readRows_('WorkOrders').forEach(function (w) { works[w.work_order_id] = w.work_order_code; });
      readRows_('Repairs').forEach(function (r) { works[r.repair_id] = r.repair_code; });
      // Đề nghị/lượng dùng theo module của phiếu (4.4.5): chỉ dòng của phiếu người xem được xem
      var okW = can_(ctx, 'maintenance.view', { module: 'maintenance' }), okR = can_(ctx, 'repair.view', { module: 'repairs' });
      var costW = cost && canViewCost_(ctx, 'maintenance'), costR = cost && canViewCost_(ctx, 'repairs');
      var rows = readRows_('MaterialUsageLines').filter(function (u) {
        if (u.archived_at || !rptInRange_(u.recorded_at || u.created_at, f)) return false;
        if (u.work_type === 'WORK_ORDER' ? !okW : !okR) return false;
        var e = L.eqs[u.equipment_id] || {};
        return rptInLoc_(L, e.location_id, f.location_id);
      }).map(function (u) {
        var m = mats[u.material_id] || {};
        var o = {
          material_code: m.material_code || '', material_vi: m.name_vi || '', material_zh: m.name_zh || '', work_code: works[u.work_id] || '',
          equipment_code: rptEq_(L, u.equipment_id), actual_used_qty: u.actual_used_qty, scrap_qty: u.scrap_qty === null ? '' : u.scrap_qty,
          unit: u.unit || m.base_unit || '', status: u.status, recorded_at: u.recorded_at || u.created_at, recorded_by: rptUser_(L, u.recorded_by)
        };
        if (u.work_type === 'WORK_ORDER' ? costW : costR) {
          o.manual_unit_cost = u.manual_unit_cost === null ? '' : u.manual_unit_cost; o.currency = u.currency || '';
          o.cost_total = u.manual_unit_cost === null || u.manual_unit_cost === '' ? '' : Math.round(Number(u.manual_unit_cost) * Number(u.actual_used_qty || 0) * 100) / 100;
        }
        return o;
      }).sort(function (a, b) { return String(a.material_code).localeCompare(String(b.material_code)) || String(b.recorded_at).localeCompare(String(a.recorded_at)); });
      var matsN = {};
      rows.forEach(function (r) { matsN[r.material_code] = true; });
      return {
        rows: rows,
        summary: [sumItem_('Số dòng', '行数', rows.length), sumItem_('Số vật tư', '物料种类', Object.keys(matsN).length)],
        chart: null,
        notes: ['rpt.note.warehouse'].concat(cost ? ['rpt.note.manual_cost'] : [])
      };
    }
  },
  UTILITIES: {
    module: 'utilities', view: 'utility.view', chart: 'LINE', filters: ['period_type', 'date', 'from', 'to', 'location_id', 'utility_type'], dot: 3,
    columns: [
      rc_('meter_code', 'code', 'Mã đồng hồ', '表号'), rc_('name', 'bi', 'Đồng hồ', '计量表'),
      rc_('utility_type', 'enum', 'Loại', '类型', { enumKey: 'utility_type' }), rc_('location', 'text', 'Khu vực', '区域'),
      rc_('opening_value', 'num', 'Chỉ số trước', '前次读数'), rc_('opening_at', 'time', 'Đọc lúc', '读取时间'),
      rc_('closing_value', 'num', 'Chỉ số mới', '本次读数'), rc_('closing_at', 'time', 'Đọc lúc', '读取时间'),
      rc_('multiplier', 'num', 'Hệ số', '倍率'), rc_('consumption', 'num', 'Tiêu thụ', '用量'), rc_('unit', 'code', 'Đơn vị', '单位'),
      rc_('status', 'enum', 'Trạng thái', '状态', { enumKey: 'utility_status' }),
      rc_('cost', 'money', 'Chi phí', '费用', { cost: true, cur: 'currency' })
    ],
    build: function (ctx, f, L, cost) {
      var s = utilitySummary_(ctx, f, { cost: cost && can_(ctx, 'tariff.view', { module: 'utilities' }) });
      var rows = s.rows.filter(function (r) { return r.status !== 'NO_READING'; }).map(function (r) {
        var o = {
          meter_code: r.meter_code, name_vi: r.name_vi, name_zh: r.name_zh, utility_type: r.utility_type, location: rptLoc_(L, r.location_id),
          opening_value: r.opening_value === null ? '' : r.opening_value, opening_at: r.opening_at || '', closing_value: r.closing_value === null ? '' : r.closing_value,
          closing_at: r.closing_at || '', multiplier: r.multiplier, consumption: r.consumption === null ? '' : r.consumption, unit: r.unit,
          status: r.status, missing_side: r.missing_side || '', in_total: r.in_total
        };
        if (s.cost_visible) { o.cost = r.cost === undefined ? '' : r.cost; o.currency = r.currency || ''; }
        return o;
      });
      var summary = [];
      Object.keys(s.totals).forEach(function (ut) {
        var t = s.totals[ut];
        // Chưa đồng hồ nào đủ số trong kỳ: không ghi 0 (số giả), ghi lý do — kỳ chưa kết thúc hoặc chưa đủ số liệu
        var none = !t.ok;
        summary.push(sumItem_('', '', none ? null : t.consumption, { enumKey: 'utility_type', enum: ut, unit: t.unit, partial: !none && t.partial, missing: t.missing,
          na_key: none ? (t.open ? 'utility_status.OPEN_PERIOD' : 'ut.no_valid') : undefined }));
        if (s.cost_visible) Object.keys(t.cost || {}).forEach(function (cur) { summary.push(sumItem_('Chi phí', '费用', t.cost[cur], { enumKey: 'utility_type', enum: ut, currency: cur, money: true })); });
      });
      return {
        rows: rows, summary: summary,
        chart: { type: 'LINE', line: s.chart.line, by_location: s.chart.by_location.map(function (x) { return { location: rptLoc_(L, x.location_id), utility_type: x.utility_type, consumption: x.consumption }; }) },
        notes: ['rpt.note.utility_rule'].concat(Object.keys(s.totals).some(function (k) { return s.totals[k].partial; }) ? ['ut.partial'] : []),
        period: { period_type: s.period_type, period_start: s.period_start, period_end: s.period_end, window_hours: s.window_hours },
        cost_visible: s.cost_visible
      };
    }
  },
  CIRCUITS: {
    module: 'circuits', view: 'circuit.view', chart: 'NONE', filters: ['location_id', 'panel_id'], dot: 3,
    columns: [
      rc_('circuit_code', 'code', 'Mã lộ', '回路编号'), rc_('name', 'bi', 'Tên lộ', '回路名称'), rc_('panel_code', 'code', 'Tủ cha', '所属配电柜'),
      rc_('upstream_code', 'code', 'Lộ cấp trên', '上级回路'), rc_('supply_role', 'enum', 'Vai trò nguồn', '供电角色', { enumKey: 'supply_role' }),
      rc_('loads', 'text', 'Phụ tải', '负载'), rc_('voltage', 'num', 'Điện áp (V)', '电压（V）'), rc_('phases', 'num', 'Số pha', '相数'),
      rc_('breaker', 'text', 'Bảo vệ', '保护'), rc_('cable', 'text', 'Cáp', '电缆'), rc_('cable_length_m', 'num', 'Chiều dài (m)', '长度（m）'),
      rc_('status', 'enum', 'Trạng thái', '状态', { enumKey: 'circuit_status' }), rc_('verified_at', 'time', 'Xác minh', '核实')
    ],
    build: function (ctx, f, L) {
      var g = circuitGraph_();
      var rows = Object.keys(g.circuits).map(function (k) { return g.circuits[k]; }).filter(function (c) {
        var p = g.panels[c.panel_id] || {};
        return (!f.panel_id || c.panel_id === f.panel_id) && rptInLoc_(L, p.location_id, f.location_id);
      }).map(function (c) {
        var p = g.panels[c.panel_id] || {};
        var up = c.upstream_circuit_id ? g.circuits[c.upstream_circuit_id] : null;
        var loads = (g.loadsByCircuit[c.circuit_id] || []).map(function (l) {
          if (l.equipment_id) return rptEq_(L, l.equipment_id) + (l.supply_role === 'BACKUP' ? ' (DP)' : '');
          var dp = g.panels[l.downstream_panel_id];
          return (dp ? dp.panel_code : '') + (l.supply_role === 'BACKUP' ? ' (DP)' : '');
        }).filter(String);
        var cable = [c.cable_type, c.cable_section_mm2 ? c.cable_section_mm2 + ' mm²' : ''].filter(String).join(' ');
        return {
          circuit_code: c.circuit_code, name_vi: c.name_vi, name_zh: c.name_zh, panel_code: p.panel_code || '', upstream_code: up ? up.circuit_code : '',
          supply_role: c.upstream_circuit_id ? (c.supply_role || 'PRIMARY') : '', loads: loads.join(', '), voltage: c.voltage === null ? '' : c.voltage,
          phases: c.phases === null ? '' : c.phases, breaker: [c.breaker_model, c.breaker_rating_a !== null && c.breaker_rating_a !== '' ? c.breaker_rating_a + ' A' : ''].filter(String).join(' '),
          cable: cable, cable_length_m: c.cable_length_m === null ? '' : c.cable_length_m, status: c.status, verified_at: c.verified_at || ''
        };
      }).sort(function (a, b) { return String(a.panel_code).localeCompare(String(b.panel_code)) || String(a.circuit_code).localeCompare(String(b.circuit_code)); });
      return {
        rows: rows,
        summary: [
          sumItem_('Số tủ', '配电柜数', Object.keys(g.panels).filter(function (k) { return rptInLoc_(L, g.panels[k].location_id, f.location_id); }).length),
          sumItem_('Số lộ', '回路数', rows.length), sumItem_('Đã xác minh', '已核实', rows.filter(function (r) { return r.verified_at; }).length)
        ],
        chart: null,
        notes: ['ci.not_isolation']
      };
    }
  },
  CONTRACTS: {
    module: 'contracts', view: 'contract.view', chart: 'BAR', filters: ['due'],
    columns: [
      rc_('contract_code', 'code', 'Mã hợp đồng', '合同编号'), rc_('revision', 'num', 'Phiên', '版次'), rc_('title', 'bi', 'Tên hợp đồng', '合同名称'),
      rc_('vendor', 'text', 'Nhà cung cấp', '供应商'), rc_('start_date', 'date', 'Bắt đầu', '开始日期'), rc_('end_date', 'date', 'Hết hạn', '到期日'),
      rc_('renewal_notice_date', 'date', 'Hạn báo gia hạn', '续约通知期限'), rc_('days_remaining', 'num', 'Còn (ngày)', '剩余天数'),
      rc_('due_state', 'enum', 'Trạng thái hạn', '期限状态', { enumKey: 'due_filter' }), rc_('equipment_count', 'num', 'Số thiết bị', '设备数'),
      rc_('value', 'money', 'Giá trị', '金额', { cost: true, cur: 'currency' })
    ],
    build: function (ctx, f, L, cost) {
      var today = todayVN_();
      var vendors = {};
      readRows_('Vendors').forEach(function (v) { vendors[v.vendor_id] = v.vendor_code + ' · ' + v.name; });
      var ce = {};
      readRows_('ContractEquipment').forEach(function (x) { if (!x.archived_at) ce[x.contract_id] = (ce[x.contract_id] || 0) + 1; });
      var lead = Number(setting_('lead_days') || 40);
      var rows = readRows_('Contracts').filter(function (c) { return !c.archived_at && c.lifecycle_status === 'ACTIVE'; }).map(function (c) {
        var ref = contractRef_(c);
        var d = rptDue_(ref.date, today);
        var o = {
          contract_code: c.contract_code, revision: c.revision, title_vi: c.title_vi, title_zh: c.title_zh, vendor: vendors[c.vendor_id] || '',
          start_date: c.start_date || '', end_date: c.end_date || '', renewal_notice_date: c.renewal_notice_date || '',
          days_remaining: d.days === null ? '' : d.days, due_state: d.state, equipment_count: ce[c.contract_id] || 0
        };
        if (cost) { o.value = c.value === null ? '' : c.value; o.currency = c.currency || ''; }
        return o;
      }).filter(function (r) {
        if (f.due === 'DUE40') return r.days_remaining !== '' && r.days_remaining <= lead;
        if (f.due === 'OVERDUE') return r.days_remaining !== '' && r.days_remaining < 0;
        return true;
      }).sort(function (a, b) { return (a.days_remaining === '' ? 1e9 : a.days_remaining) - (b.days_remaining === '' ? 1e9 : b.days_remaining); });
      var by = countBy_(rows, 'due_state');
      return {
        rows: rows,
        summary: [sumItem_('Hợp đồng còn hiệu lực', '有效合同', rows.length)].concat(Object.keys(by).map(function (k) { return sumItem_('', '', by[k], { enumKey: 'due_filter', enum: k }); })),
        chart: { type: 'BAR', series: ['OVERDUE', 'DUE_TODAY', 'DUE_SOON', 'NOT_DUE', 'MISSING'].filter(function (k) { return by[k]; }).map(function (k) { return { enumKey: 'due_filter', key: k, value: by[k] }; }) }
      };
    }
  },
  INSPECTIONS: {
    module: 'inspections', view: 'inspection.view', chart: 'BAR', filters: ['location_id', 'due'],
    columns: [
      rc_('requirement_code', 'code', 'Mã yêu cầu', '要求编号'), rc_('type', 'bi', 'Loại kiểm định', '检验类型'),
      rc_('equipment_code', 'code', 'Mã thiết bị', '设备编号'), rc_('equipment_name', 'text', 'Thiết bị', '设备'), rc_('location', 'text', 'Khu vực', '区域'),
      rc_('current_due_date', 'date', 'Hiệu lực đến', '有效期至'), rc_('days_remaining', 'num', 'Còn (ngày)', '剩余天数'),
      rc_('due_state', 'enum', 'Trạng thái hạn', '期限状态', { enumKey: 'due_filter' }), rc_('record_status', 'enum', 'Tình trạng hồ sơ', '记录状态', { enumKey: 'record_status' }),
      rc_('certificate_number', 'code', 'Số chứng nhận', '证书编号'), rc_('inspection_date', 'date', 'Ngày kiểm định', '检验日期'),
      rc_('cost', 'money', 'Chi phí lần gần nhất', '最近一次费用', { cost: true, cur: 'currency' })
    ],
    build: function (ctx, f, L, cost) {
      var today = todayVN_();
      var insp = readRows_('Inspections');
      var types = {};
      readRows_('InspectionTypes').forEach(function (t) { types[t.inspection_type_id] = t; });
      var lead = Number(setting_('lead_days') || 40);
      var rows = readRows_('InspectionRequirements').filter(function (r) {
        var e = L.eqs[r.equipment_id] || {};
        return !r.archived_at && r.active !== false && rptInLoc_(L, r.location_id || e.location_id, f.location_id);
      }).map(function (r) {
        var t = types[r.inspection_type_id] || {};
        var cur = insp.filter(function (i) { return i.inspection_id === r.current_inspection_id; })[0] || {};
        var d = rptDue_(r.current_due_date, today);
        var o = {
          requirement_code: r.requirement_code, type_vi: t.name_vi || '', type_zh: t.name_zh || '', equipment_code: rptEq_(L, r.equipment_id),
          equipment_name: rptEqName_(L, r.equipment_id), location: rptLoc_(L, r.location_id || (L.eqs[r.equipment_id] || {}).location_id),
          current_due_date: r.current_due_date || '', days_remaining: d.days === null ? '' : d.days, due_state: d.state,
          record_status: requirementRecordStatus_(r, insp), certificate_number: cur.certificate_number || '', inspection_date: cur.inspection_date || ''
        };
        if (cost) { o.cost = cur.cost === null || cur.cost === undefined ? '' : cur.cost; o.currency = cur.currency || ''; }
        return o;
      }).filter(function (r) {
        if (f.due === 'DUE40') return r.days_remaining !== '' && r.days_remaining <= lead;
        if (f.due === 'OVERDUE') return r.days_remaining !== '' && r.days_remaining < 0;
        return true;
      }).sort(function (a, b) { return (a.days_remaining === '' ? 1e9 : a.days_remaining) - (b.days_remaining === '' ? 1e9 : b.days_remaining); });
      var by = countBy_(rows, 'due_state');
      return {
        rows: rows,
        summary: [
          sumItem_('Tổng yêu cầu', '要求总数', rows.length),
          sumItem_('Không đạt/thu hồi', '不合格/已撤销', rows.filter(function (r) { return r.record_status === 'FAILED' || r.record_status === 'REVOKED'; }).length)
        ].concat(Object.keys(by).map(function (k) { return sumItem_('', '', by[k], { enumKey: 'due_filter', enum: k }); })),
        chart: { type: 'BAR', series: ['OVERDUE', 'DUE_TODAY', 'DUE_SOON', 'NOT_DUE', 'MISSING'].filter(function (k) { return by[k]; }).map(function (k) { return { enumKey: 'due_filter', key: k, value: by[k] }; }) }
      };
    }
  }
};

/* ---------------- Mẫu báo cáo ---------------- */

/** 8 mẫu tích hợp (5.3.9), nạp khi setup/migrateSchema; chỉ thêm mẫu còn thiếu */
function seedReportDefinitions_() {
  if (RELEASED_DOT < 3) return 0;
  var have = {};
  readRows_('ReportDefinitions').forEach(function (r) { have[r.code] = true; });
  var nowIso = isoVN_(now_());
  var add = RPT_BUILTIN_.filter(function (b) { return !have[b[0]]; }).map(function (b) {
    var t = LABELS['rpt.' + b[0]] || [b[0], b[0]];
    return {
      report_definition_id: uuidFrom_('builtin-report:' + b[0]), code: b[0], title_vi: t[0], title_zh: t[1], dataset: b[1],
      filter_schema: REPORT_DATASETS_[b[1]].filters, visible_columns: null, chart_type: 'AUTO', allowed_roles: '1,2,3,4', active: true,
      builtin: true, group_key: b[2], file_name: '', dataset_epoch: prop_('DATASET_EPOCH') || '', record_version: 1, sync_revision: 0,
      created_at: nowIso, created_by: SYSTEM_USER, updated_at: nowIso, updated_by: SYSTEM_USER, archived_at: '',
      i18n_meta: { title: { src: 'vi', state: 'HUMAN', at: nowIso } }
    };
  });
  if (add.length) insertRows_('ReportDefinitions', add);
  return add.length;
}

function reportDefOrThrow_(p) {
  var d = null;
  if (p.report_definition_id) d = isUuidV4_(p.report_definition_id) ? findOne_('ReportDefinitions', 'report_definition_id', p.report_definition_id) : null;
  else if (p.code) d = findOne_('ReportDefinitions', 'code', trimStr_(p.code).toUpperCase());
  if (!d || d.archived_at) throw apiError_('NOT_FOUND');
  return d;
}

function reportRoles_(d) {
  return String(d.allowed_roles || '1,2,3,4').split(/[,\s]+/).filter(String).map(Number);
}

/** Mẫu được xem: đang dùng (quản trị thấy cả mẫu ngừng), đúng cấp, xem được dữ liệu nguồn, đợt nguồn đã chạy */
function reportDefVisible_(ctx, d) {
  var ds = REPORT_DATASETS_[d.dataset];
  if (!ds || (ds.dot && ds.dot > releasedDot_())) return false;
  var lvl = Number(ctx.user.role_level);
  var editor = can_(ctx, 'report.definition.edit', { module: 'reports' });
  if (!editor && (d.active === false || reportRoles_(d).indexOf(lvl) < 0)) return false;
  return can_(ctx, ds.view, { module: ds.module });
}

/** Báo cáo đã lưu được xem: xem được mẫu và nguồn; bản có chi phí cần quyền giá của module nguồn (4.5) */
function reportRunVisible_(ctx, run, cache) {
  cache = cache || {};
  var ds = REPORT_DATASETS_[run.dataset];
  if (!ds) return false;
  var k = 'rpt:' + run.report_definition_id;
  if (!(k in cache)) {
    var d = findOne_('ReportDefinitions', 'report_definition_id', run.report_definition_id);
    cache[k] = !!d && reportDefVisible_(ctx, d);
  }
  if (!cache[k]) return false;
  if (run.access_scope === 'COST_VIEW' && !canViewCost_(ctx, ds.module)) return false;
  return true;
}

function assertReportFileRead_(ctx, d) {
  var run = findOne_('ReportRuns', 'report_run_id', d.entity_id);
  if (!run || !reportRunVisible_(ctx, run, {})) throw apiError_('FORBIDDEN');
}

/* ---------------- Tạo báo cáo ---------------- */

/** Bộ lọc chuẩn hóa theo tập dữ liệu (chỉ khóa cho phép); kiểm ngày */
function reportFilters_(ds, f) {
  f = f || {};
  var out = {}, errs = [];
  ds.filters.forEach(function (k) {
    var v = f[k];
    if (v === undefined || v === null || v === '') return;
    if (k === 'from' || k === 'to' || k === 'date') { if (!isDateStr_(v)) errs.push(fieldError_('filters.' + k, 'INVALID_DATE')); else out[k] = v; return; }
    if (k === 'location_id' || k === 'panel_id') { if (!isUuidV4_(v)) errs.push(fieldError_('filters.' + k, 'ID_INVALID')); else out[k] = v; return; }
    if (k === 'period_type') { if (PERIOD_TYPES_.indexOf(v) < 0) errs.push(fieldError_('filters.' + k, 'INVALID_VALUE')); else out[k] = v; return; }
    if (k === 'utility_type') { if (UTILITY_TYPES_.indexOf(v) < 0) errs.push(fieldError_('filters.' + k, 'INVALID_VALUE')); else out[k] = v; return; }
    if (k === 'due') { if (['ALL', 'DUE40', 'OVERDUE'].indexOf(v) < 0) errs.push(fieldError_('filters.' + k, 'INVALID_VALUE')); else out[k] = v; return; }
    out[k] = String(v).slice(0, 40);
  });
  if (out.from && out.to && out.from > out.to) errs.push(fieldError_('filters.to', 'INVALID_DATE'));
  if (out.from && out.to && dayNum_(out.to) - dayNum_(out.from) > 400) errs.push(fieldError_('filters.to', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  return out;
}

/**
 * Chạy một mẫu (không ghi gì): kiểm quyền mẫu và nguồn, lọc cột theo mẫu và quyền giá.
 * Trả {definition, title_vi/zh, columns, rows, truncated, total_rows, summary, chart, notes, filters, generated_at, source_revision, cost_visible, has_cost}
 */
function reportCompute_(ctx, def, filters) {
  var ds = REPORT_DATASETS_[def.dataset];
  if (!ds || !reportDefVisible_(ctx, def)) throw apiError_('FORBIDDEN');
  if (def.active === false) throw validationError_([fieldError_('report_definition_id', 'INVALID_VALUE')]);
  var f = reportFilters_(ds, filters);
  var cost = canViewCost_(ctx, ds.module);
  var L = rptLook_();
  var res = ds.build(ctx, f, L, cost);
  if (ds.module === 'utilities') cost = !!res.cost_visible;
  var vis = Array.isArray(def.visible_columns) && def.visible_columns.length ? def.visible_columns : null;
  var cols = (vis ? vis.map(function (k) { return ds.columns.filter(function (c) { return c.key === k; })[0]; }).filter(Boolean) : ds.columns)
    .filter(function (c) { return !c.cost || cost; });
  var keys = {};
  cols.forEach(function (c) {
    keys[c.key] = true;
    if (c.type === 'bi') { keys[c.key + '_vi'] = true; keys[c.key + '_zh'] = true; }
    if (c.cur) keys[c.cur] = true;
  });
  var rows = res.rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (keys[k]) o[k] = r[k]; }); return o; });
  var chartType = def.chart_type && def.chart_type !== 'AUTO' ? def.chart_type : ds.chart;
  var st = readState_();
  if (ds.module === 'utilities' && res.period) f.window_hours = res.period.window_hours;
  return {
    definition: { report_definition_id: def.report_definition_id, code: def.code, dataset: def.dataset, builtin: !!def.builtin, chart_type: chartType },
    title_vi: def.title_vi, title_zh: def.title_zh,
    columns: cols.map(function (c) { return { key: c.key, type: c.type, label_vi: c.vi, label_zh: c.zh, enumKey: c.enumKey || null, cur: c.cur || null, cost: !!c.cost }; }),
    rows: rows.slice(0, REPORT_ROW_MAX_), total_rows: rows.length, truncated: rows.length > REPORT_ROW_MAX_,
    summary: (res.summary || []).filter(function (s) { return !s.money || cost; }),
    chart: chartType === 'NONE' ? null : (res.chart || null),
    notes: res.notes || [], period: res.period || null, filters: f,
    generated_at: isoVN_(now_()), generated_by_name: (userDirectory_()[ctx.user.user_id] || {}).display_name || '',
    source_revision: Number(stateGet_(st, 'sync_revision', 0)),
    cost_visible: !!cost, cost_hidden: !cost && ds.columns.some(function (c) { return c.cost; }),
    has_cost: cols.some(function (c) { return c.cost; }) || (res.summary || []).some(function (s) { return s.money && cost; }),
    module: ds.module
  };
}

/** report.run {report_definition_id | code, filters}: báo cáo trực tiếp theo bộ lọc (cần mạng, không lưu) */
function reportRun_(ctx) {
  var p = ctx.req.payload || {};
  return reportCompute_(ctx, reportDefOrThrow_(p), p.filters || {});
}

/**
 * report.save {report_run_id, report_definition_id | code, filters}: chạy lại ở máy chủ rồi lưu bản chụp: tệp JSON riêng tư
 * (Documents REPORT_FILE, MODULE_VIEW hoặc COST_VIEW), dòng ReportRuns (BC-yymm-001), QR. Lưu giá trị W (điện nước).
 */
function reportSave_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.report_run_id)) throw validationError_([fieldError_('report_run_id', 'ID_INVALID')]);
  if (Number(ctx.req.expected_version || 0) !== 0) throw validationError_([fieldError_('expected_version', 'INVALID_VALUE')]);
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  if (findRowNums_('ReportRuns', 'report_run_id', p.report_run_id).length) throw validationError_([fieldError_('report_run_id', 'ID_EXISTS')]);
  var def = reportDefOrThrow_(p);
  var snap = reportCompute_(ctx, def, p.filters || {});
  var scope = snap.has_cost ? 'COST_VIEW' : 'MODULE_VIEW';
  var docId = uuid_();
  snap.report_run_id = p.report_run_id;
  var json = JSON.stringify(snap);
  if (json.length > REPORT_SNAPSHOT_MAX_) throw validationError_([fieldError_('filters', 'REPORT_TOO_LARGE')]);
  // Drive: ngoài khóa ghi (3.15)
  var folder = appFolder_();
  var file = folder.createFile(Utilities.newBlob(json, 'application/json', docId + '.json'));
  var res;
  try {
    res = executeWrite_(ctx, {
      entity_type: 'REPORT_RUN', entity_id: p.report_run_id,
      build: function (st) {
        if (findRowNums_('ReportRuns', 'report_run_id', p.report_run_id).length) throw validationError_([fieldError_('report_run_id', 'ID_EXISTS')]);
        var su = {};
        var code = allocCode_(st, su, 'REPORT_RUN', null, snap.generated_at.slice(0, 10));
        var qrKey = allocQrKey_();
        var doc = cNew_(ctx, {
          document_id: docId, entity_type: 'REPORT_RUN', entity_id: p.report_run_id, title_vi: code + ' ' + (def.title_vi || ''), title_zh: code + ' ' + (def.title_zh || ''),
          kind: 'REPORT_FILE', drive_file_id: file.getId(), external_url: '', mime_type: 'application/json', file_version: 1, access_scope: scope,
          document_date: snap.generated_at.slice(0, 10), active: true, managed_folder_id: folder.getId(), storage_kind: 'DRIVE', owned_by_app: true,
          drive_sharing_state: 'NOT_SHARED', sharing_updated_at: '', sharing_error_code: '', size_bytes: json.length, thumb_drive_file_id: '', i18n_meta: {}
        });
        var run = cNew_(ctx, {
          report_run_id: p.report_run_id, report_definition_id: def.report_definition_id, generated_at: snap.generated_at, generated_by: ctx.user.user_id,
          filters_json: snap.filters, source_revision: snap.source_revision, snapshot_at: snap.generated_at, status: 'SAVED', file_document_id: docId,
          access_scope: scope, report_run_code: code, title_vi: def.title_vi, title_zh: def.title_zh, row_count: snap.total_rows, pdf_document_id: '',
          dataset: def.dataset
        });
        return {
          writes: [
            { sheet: 'Documents', mode: 'insert', row: doc },
            { sheet: 'ReportRuns', mode: 'insert', row: run },
            { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'REPORT_RUN', p.report_run_id, code, def.title_vi, def.title_zh) }
          ],
          state: su,
          result: { entity_type: 'REPORT_RUN', entity_id: p.report_run_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, run, 'ReportRuns') },
          record_version: 1,
          audit: { entity_type: 'REPORT_RUN', entity_id: p.report_run_id, before_json: null, after_json: { code: code, dataset: def.dataset, filters: snap.filters, rows: snap.total_rows, access_scope: scope } }
        };
      }
    });
  } catch (e) {
    trashQuietly_(file);
    throw e;
  }
  if (res.code === 'DUPLICATE_OPERATION') trashQuietly_(file);
  return res;
}

function reportRunOrThrow_(ctx, id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_('report_run_id', 'ID_INVALID')]);
  var run = findOne_('ReportRuns', 'report_run_id', id);
  if (!run || run.archived_at) throw apiError_('NOT_FOUND');
  if (!reportRunVisible_(ctx, run, {})) throw apiError_('FORBIDDEN');
  return run;
}

/** Bản chụp đã lưu (đọc tệp JSON riêng tư) */
function reportSnapshot_(run) {
  var d = findOne_('Documents', 'document_id', run.file_document_id);
  if (!d || !d.drive_file_id) throw apiError_('NOT_FOUND');
  var txt = DriveApp.getFileById(d.drive_file_id).getBlob().getDataAsString('UTF-8');
  return JSON.parse(txt);
}

/** report.view {report_run_id}: bản chụp đã lưu; không tham số: danh sách báo cáo đã lưu được xem */
function reportView_(ctx) {
  var p = ctx.req.payload || {};
  var qm = qrMap_();
  if (p.report_run_id) {
    var run = reportRunOrThrow_(ctx, p.report_run_id);
    var o = projectRow_(ctx, run, 'ReportRuns'); o.qr_key = qm[run.report_run_id] || null;
    return { run: o, snapshot: reportSnapshot_(run) };
  }
  var cache = {};
  var items = readRows_('ReportRuns').filter(function (r) { return !r.archived_at && reportRunVisible_(ctx, r, cache); })
    .map(function (r) { var o2 = projectRow_(ctx, r, 'ReportRuns'); o2.qr_key = qm[r.report_run_id] || null; return o2; })
    .sort(function (a, b) { return String(b.generated_at).localeCompare(String(a.generated_at)); });
  return { items: items.slice(0, 500), total: items.length };
}

/**
 * report.export {format: XLSX | PDF, report_run_id} hoặc {format, report_definition_id | code, filters}: XLSX trả dữ liệu
 * để trình duyệt dựng tệp (SheetJS, 5.4.6: Tóm tắt, Chi tiết, Điều kiện lọc); PDF dựng ở máy chủ, trả base64. Ghi AuditLogs.
 */
function reportExport_(ctx) {
  var p = ctx.req.payload || {};
  if (['XLSX', 'PDF'].indexOf(p.format) < 0) throw validationError_([fieldError_('format', 'INVALID_VALUE')]);
  var data, run = null;
  if (p.report_run_id) { run = reportRunOrThrow_(ctx, p.report_run_id); data = reportSnapshot_(run); data.report_run_code = run.report_run_code; }
  else data = reportCompute_(ctx, reportDefOrThrow_(p), p.filters || {});
  var out = { format: p.format, report: data };
  if (p.format === 'PDF') {
    if (data.rows.length > REPORT_PDF_ROW_MAX_) throw validationError_([fieldError_('format', 'PDF_TOO_MANY_ROWS')]);
    var pdf = reportPdf_(data);
    out = { format: 'PDF', file_name: pdfFileName_(data), mime_type: 'application/pdf', content_b64: b64_(pdf), size_bytes: pdf.length };
  }
  withWriteLock_(function () {
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'report.export', entity_type: 'REPORT_RUN', entity_id: run ? run.report_run_id : '',
      before_json: null, after_json: { format: p.format, dataset: data.definition.dataset, rows: data.total_rows, report_run_code: run ? run.report_run_code : '' }, auth_basis: authBasis_(ctx) });
  });
  return out;
}

/* ---------------- Mẫu do quản trị lập (RE-03) ---------------- */

var REPORT_CODE_RE_ = /^[A-Z][A-Z0-9_]{2,39}$/;

/**
 * report.definition.edit (C4): {report_definition_id, code (mẫu mới), title_vi/zh, dataset, visible_columns: [khóa],
 * chart_type, allowed_roles: "1,2,3,4", active, file_name?}. Mẫu tích hợp chỉ đổi cột hiển thị, cấp xem, biểu đồ, đang dùng.
 */
function reportDefinitionEdit_(ctx) {
  var p = ctx.req.payload || {};
  var add = Number(ctx.req.expected_version || 0) === 0;
  var errs = [];
  if (!isUuidV4_(p.report_definition_id)) errs.push(fieldError_('report_definition_id', 'ID_INVALID'));
  var cur0 = add ? null : findOne_('ReportDefinitions', 'report_definition_id', p.report_definition_id);
  if (!add && (!cur0 || cur0.archived_at)) throw apiError_('NOT_FOUND');
  var dsKey = add ? p.dataset : (cur0.builtin ? cur0.dataset : (p.dataset !== undefined ? p.dataset : cur0.dataset));
  var ds = REPORT_DATASETS_[dsKey];
  if (!ds) errs.push(fieldError_('dataset', dsKey ? 'INVALID_VALUE' : 'REQUIRED'));
  if (add) {
    if (!REPORT_CODE_RE_.test(trimStr_(p.code).toUpperCase())) errs.push(fieldError_('code', p.code ? 'CODE_INVALID' : 'REQUIRED'));
    requireOneLang_(errs, p, null, 'title');
  } else if (cur0.builtin && (p.code !== undefined || p.dataset !== undefined && p.dataset !== cur0.dataset || p.title_vi !== undefined || p.title_zh !== undefined)) {
    errs.push(fieldError_('report_definition_id', 'BUILTIN_FIXED'));
  }
  if (p.visible_columns !== undefined && p.visible_columns !== null) {
    if (!Array.isArray(p.visible_columns) || !p.visible_columns.length || p.visible_columns.length > 40) errs.push(fieldError_('visible_columns', 'INVALID_VALUE'));
    else if (ds) p.visible_columns.forEach(function (k) { if (!ds.columns.some(function (c) { return c.key === k; })) errs.push(fieldError_('visible_columns', 'INVALID_VALUE')); });
  }
  if (p.chart_type !== undefined && REPORT_CHART_TYPES_.indexOf(p.chart_type) < 0) errs.push(fieldError_('chart_type', 'INVALID_VALUE'));
  if (p.allowed_roles !== undefined && !/^[1-4](,[1-4]){0,3}$/.test(String(p.allowed_roles).replace(/\s+/g, ''))) errs.push(fieldError_('allowed_roles', 'INVALID_VALUE'));
  if (p.file_name !== undefined && String(p.file_name).length > 120) errs.push(fieldError_('file_name', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = (p.title_vi !== undefined || p.title_zh !== undefined) ? applyTranslations_('ReportDefinitions', ['title'], p, cur0) : null;
  return executeWrite_(ctx, {
    entity_type: 'REPORT_DEFINITION', entity_id: p.report_definition_id,
    build: function () {
      var row, before = null;
      if (add) {
        if (findRowNums_('ReportDefinitions', 'report_definition_id', p.report_definition_id).length) throw validationError_([fieldError_('report_definition_id', 'ID_EXISTS')]);
        var code = trimStr_(p.code).toUpperCase();
        if (findRowNums_('ReportDefinitions', 'code', code).length) throw validationError_([fieldError_('code', 'CODE_DUPLICATE')]);
        row = cNew_(ctx, { report_definition_id: p.report_definition_id, code: code, dataset: dsKey, filter_schema: ds.filters, visible_columns: null,
          chart_type: 'AUTO', allowed_roles: '1,2,3,4', active: true, builtin: false, group_key: ds.module, file_name: '', title_vi: '', title_zh: '' });
      } else {
        var cur = findOne_('ReportDefinitions', 'report_definition_id', p.report_definition_id);
        assertVersion_(ctx, cur, 'REPORT_DEFINITION', 'ReportDefinitions');
        before = clone_(cur); delete before.__row;
        row = clone_(cur); delete row.__row;
        if (!row.builtin && p.dataset !== undefined && p.dataset !== row.dataset) { row.dataset = p.dataset; row.filter_schema = ds.filters; row.group_key = ds.module; }
      }
      if (tr) { row.title_vi = tr.values.title_vi; row.title_zh = tr.values.title_zh; row.i18n_meta = Object.assign({}, row.i18n_meta || {}, tr.meta); }
      if (p.visible_columns !== undefined) row.visible_columns = p.visible_columns && p.visible_columns.length ? p.visible_columns : null;
      if (p.chart_type !== undefined) row.chart_type = p.chart_type;
      if (p.allowed_roles !== undefined) row.allowed_roles = String(p.allowed_roles).replace(/\s+/g, '');
      if (p.active !== undefined) row.active = p.active !== false;
      if (p.file_name !== undefined) row.file_name = trimStr_(p.file_name);
      if (!add) cUpdate_(ctx, row);
      var after = clone_(row); delete after.__row;
      return {
        writes: [{ sheet: 'ReportDefinitions', mode: add ? 'insert' : 'update', row: row }],
        result: { entity_type: 'REPORT_DEFINITION', entity_id: row.report_definition_id, display_code: row.code, record_version: row.record_version, record: projectRow_(ctx, row, 'ReportDefinitions') },
        record_version: row.record_version,
        audit: { entity_type: 'REPORT_DEFINITION', entity_id: row.report_definition_id, before_json: before, after_json: after }
      };
    }
  });
}

/** Cột của các tập dữ liệu (RE-03: chọn cột hiển thị); cột giá chỉ hiện với người có quyền giá của nguồn */
function reportDatasetsInfo_(ctx) {
  var out = {};
  Object.keys(REPORT_DATASETS_).forEach(function (k) {
    var ds = REPORT_DATASETS_[k];
    if (ds.dot && ds.dot > releasedDot_()) return;
    var cost = canViewCost_(ctx, ds.module);
    out[k] = { module: ds.module, filters: ds.filters, chart: ds.chart, columns: ds.columns.filter(function (c) { return !c.cost || cost; }).map(function (c) { return { key: c.key, type: c.type, label_vi: c.vi, label_zh: c.zh, cost: !!c.cost }; }) };
  });
  return out;
}

/* ---------------- PDF (Google Docs → PDF, không logo) ---------------- */

function fmtNumSrv_(n, maxFrac) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '';
  var v = Number(n), neg = v < 0;
  var s = Math.abs(v).toFixed(maxFrac === undefined ? 3 : maxFrac);
  if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
  var parts = s.split('.');
  var i = parts[0].length >= 4 ? parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : parts[0];
  return (neg ? '-' : '') + i + (parts[1] ? '.' + parts[1] : '');
}

function fmtTimeSrv_(iso) {
  var t = parseTime_(iso);
  if (!t) return '';
  var s = isoVN_(t);
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) + ' ' + s.slice(11, 16);
}

function fmtMoneySrv_(v, cur) {
  if (v === '' || v === null || v === undefined) return '';
  return fmtNumSrv_(v, cur === 'VND' ? 0 : 2) + (cur ? ' ' + cur : '');
}

/** Ô báo cáo → chữ (5.4: số U+202F, ngày dd/mm/yyyy, nhãn hai thứ tiếng) */
function reportCellText_(c, r) {
  var v = r[c.key];
  switch (c.type) {
    case 'bi': return [r[c.key + '_vi'], r[c.key + '_zh']].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join('\n');
    case 'num': return fmtNumSrv_(v);
    case 'date': return fmtDateVN_(v);
    case 'time': return fmtTimeSrv_(v);
    case 'enum': return v ? lab_(c.enumKey + '.' + v).replace(' · ', '\n') : '';
    case 'money': return fmtMoneySrv_(v, r[c.cur]);
    default: return v === null || v === undefined ? '' : String(v);
  }
}

function pdfFileName_(data) {
  return (data.report_run_code || data.definition.code) + '_' + String(data.generated_at).slice(0, 10) + '.pdf';
}

/** Dòng mô tả bộ lọc (Kỳ, Khu vực…) cho đầu báo cáo */
function reportFilterLines_(data) {
  var f = data.filters || {};
  var lines = [];
  if (data.period) lines.push(lab_('rpt.period') + ': ' + fmtDateVN_(data.period.period_start) + ' – ' + fmtDateVN_(data.period.period_end) + ' (' + lab_('period.' + data.period.period_type) + ')');
  else if (f.from || f.to) lines.push(lab_('rpt.period') + ': ' + (f.from ? fmtDateVN_(f.from) : '…') + ' – ' + (f.to ? fmtDateVN_(f.to) : '…'));
  if (f.location_id) { var l = findOne_('Locations', 'location_id', f.location_id); if (l) lines.push(lab_('field.location') + ': ' + l.location_code + ' · ' + (l.name_vi || l.name_zh)); }
  if (f.status) lines.push(lab_('col.status') + ': ' + f.status);
  if (f.utility_type) lines.push(lab_('utility_type.' + f.utility_type));
  if (f.window_hours) lines.push(lab_('ut.window_note', { W: f.window_hours }));
  return lines;
}

/**
 * Dựng PDF bằng Google Docs (tạm, rồi bỏ vào thùng rác): tiêu đề song ngữ, kỳ/khu vực, số báo cáo, tóm tắt, bảng, chú thích,
 * Người lập / Người duyệt. Không logo, ô vàng hay cụm M&E (1.4 §3.5).
 */
function reportPdf_(data) {
  var doc = DocumentApp.create('ME_TMP_' + uuid_());
  var id = doc.getId();
  try {
    var body = doc.getBody();
    var wide = data.columns.length > 7;
    if (wide) { body.setPageWidth(842); body.setPageHeight(595); }
    body.setMarginTop(36).setMarginBottom(36).setMarginLeft(36).setMarginRight(36);
    var title = body.appendParagraph(data.title_vi + ' / ' + data.title_zh);
    title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    var meta = [];
    reportFilterLines_(data).forEach(function (x) { meta.push(x); });
    meta.push(lab_('rpt.generated_at') + ': ' + fmtTimeSrv_(data.generated_at) + (data.report_run_code ? '   ·   ' + lab_('rpt.number') + ': ' + data.report_run_code : ''));
    meta.push(lab_('rpt.prepared_by') + ': ' + (data.generated_by_name || ''));
    meta.forEach(function (m) { body.appendParagraph(m).setFontSize(9); });
    if ((data.summary || []).length) {
      var sumRows = data.summary.map(function (s) {
        var label = s.enumKey ? lab_(s.enumKey + '.' + s.enum) + (s.label_vi ? ' — ' + s.label_vi + ' · ' + s.label_zh : '') : s.label_vi + ' · ' + s.label_zh;
        var val = s.money ? fmtMoneySrv_(s.value, s.currency) : (s.value === null ? lab_(s.na_key || 'field.not_set') : fmtNumSrv_(s.value) + (s.unit ? (s.unit === '%' ? '%' : ' ' + s.unit) : ''));
        if (s.partial) val += ' (' + lab_('ut.partial') + ')';
        return [label, val];
      });
      body.appendParagraph(lab_('rpt.summary')).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      var st = body.appendTable(sumRows);
      st.setFontSize(9);
    }
    body.appendParagraph(lab_('rpt.detail')).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    var head = data.columns.map(function (c) { return c.label_vi + '\n' + c.label_zh; });
    var cells = [head].concat(data.rows.map(function (r) { return data.columns.map(function (c) { return reportCellText_(c, r); }); }));
    if (cells.length === 1) cells.push(data.columns.map(function (c, i) { return i ? '' : lab_('field.no_records'); }));
    var t = body.appendTable(cells);
    t.setFontSize(8);
    var hr = t.getRow(0);
    for (var i = 0; i < hr.getNumCells(); i++) hr.getCell(i).setBold(true).setBackgroundColor('#EEF1F5');
    if (data.cost_hidden) body.appendParagraph(lab_('cost.hidden')).setFontSize(8).setItalic(true);
    (data.notes || []).forEach(function (n) { body.appendParagraph(lab_(n)).setFontSize(8).setItalic(true); });
    if (data.truncated) body.appendParagraph(lab_('rpt.truncated', { N: data.total_rows })).setFontSize(8).setItalic(true);
    body.appendParagraph('');
    var sign = body.appendTable([[lab_('rpt.prepared_by'), lab_('rpt.approved_by')], ['\n\n\n', '\n\n\n']]);
    sign.setBorderWidth(0);
    doc.saveAndClose();
    return DriveApp.getFileById(id).getAs('application/pdf').getBytes();
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* bỏ qua */ }
  }
}

/**
 * export.pdf {entity_type: EQUIPMENT | WORK_ORDER | REPAIR, entity_id}: In/xuất PDF hồ sơ, phiếu (4.4.11; Đợt 3).
 * Theo quyền xem và quyền giá của module hồ sơ; không logo.
 */
function exportPdf_(ctx) {
  var p = ctx.req.payload || {};
  var et = ENTITY_TYPES[p.entity_type];
  if (!et || ['EQUIPMENT', 'WORK_ORDER', 'REPAIR'].indexOf(p.entity_type) < 0) throw validationError_([fieldError_('entity_type', 'INVALID_VALUE')]);
  authorize_(ctx, 'export.pdf', { module: et.module });
  if (!can_(ctx, VIEW_ACTION_BY_MODULE_[et.module], { module: et.module })) throw apiError_('FORBIDDEN');
  var rec = isUuidV4_(p.entity_id) ? findOne_(et.sheet, et.key, p.entity_id) : null;
  if (!rec || rec.archived_at) throw apiError_('NOT_FOUND');
  var L = rptLook_();
  var cost = canViewCost_(ctx, et.module);
  var kv = [], tables = [], title;
  var bi2 = function (o, f) { return [o[f + '_vi'], o[f + '_zh']].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' / '); };
  var add = function (key, val) { if (val !== '' && val !== null && val !== undefined) kv.push([lab_(key), String(val)]); };
  if (p.entity_type === 'EQUIPMENT') {
    title = ['Hồ sơ thiết bị', '设备档案'];
    add('field.equipment_code', rec.equipment_code); add('field.name', bi2(rec, 'name')); add('field.location', rptLoc_(L, rec.location_id));
    add('field.model', rec.model); add('field.serial', rec.serial); add('field.status', lab_('equipment_status.' + rec.status));
    var specs = findAll_('EquipmentSpecs', 'equipment_id', rec.equipment_id).filter(function (s) { return !s.archived_at; })
      .map(function (s) { return [bi2(s, 'label'), s.value_num !== null && s.value_num !== '' ? fmtNumSrv_(s.value_num) : (s.value_text || ''), s.unit || '']; });
    if (specs.length) tables.push({ title: lab_('tab.specs'), head: [lab_('field.name'), lab_('field.spec_value'), lab_('field.unit')], rows: specs });
  } else if (p.entity_type === 'WORK_ORDER') {
    title = ['Phiếu bảo trì', '保养工单'];
    add('col.code', rec.work_order_code); add('module.equipment', rptEq_(L, rec.equipment_id) + ' · ' + rptEqName_(L, rec.equipment_id));
    add('mt.title', bi2(rec, 'title')); add('mt.due_date', fmtDateVN_(rec.due_date)); add('col.status', lab_('wo_status.' + rec.status));
    add('wk.col.assignee', rptUser_(L, rec.assignee_user_id)); add('mt.start_at', fmtTimeSrv_(rec.start_at)); add('mt.end_at', fmtTimeSrv_(rec.end_at));
    if (rec.overall_result) add('mt.overall_result', lab_('overall_result.' + rec.overall_result));
    if (cost && (rec.labor_cost !== null || rec.other_cost !== null)) { add('cost.labor', fmtMoneySrv_(rec.labor_cost, rec.cost_currency)); add('cost.other', fmtMoneySrv_(rec.other_cost, rec.cost_currency)); }
    var res = findAll_('WorkOrderResults', 'work_order_id', rec.work_order_id).filter(function (r) { return !r.archived_at; })
      .sort(function (a, b) { return Number(a.step_no) - Number(b.step_no); })
      .map(function (r) { return [String(r.step_no), bi2(r, 'label'), r.measured_value !== null && r.measured_value !== '' ? fmtNumSrv_(r.measured_value) + (r.unit ? ' ' + r.unit : '') : '', lab_('check_result.' + (r.result_status || 'PENDING')), bi2(r, 'note')]; });
    if (res.length) tables.push({ title: lab_('mt.checklist'), head: ['#', lab_('field.name'), lab_('mt.measured_value'), lab_('col.status'), lab_('field.note')], rows: res });
  } else {
    title = ['Phiếu sửa chữa', '维修单'];
    add('col.code', rec.repair_code); add('module.equipment', rptEq_(L, rec.equipment_id) + ' · ' + rptEqName_(L, rec.equipment_id));
    add('rp.symptom', bi2(rec, 'symptom')); add('rp.severity', lab_('severity.' + rec.severity)); add('col.status', lab_('repair_status.' + rec.status));
    [['rp.ms.reported_at', 'reported_at'], ['rp.ms.assigned_at', 'assigned_at'], ['rp.ms.repair_start_at', 'repair_start_at'], ['rp.ms.repair_end_at', 'repair_end_at'], ['rp.ms.restored_at', 'restored_at'], ['rp.ms.approved_at', 'approved_at']]
      .forEach(function (x) { add(x[0], fmtTimeSrv_(rec[x[1]])); });
    add('rp.diagnosis', bi2(rec, 'diagnosis')); add('rp.action', bi2(rec, 'action'));
    if (cost && (rec.labor_cost !== null || rec.outside_cost !== null)) { add('cost.labor', fmtMoneySrv_(rec.labor_cost, rec.cost_currency)); add('cost.outside', fmtMoneySrv_(rec.outside_cost, rec.cost_currency)); }
  }
  var doc = DocumentApp.create('ME_TMP_' + uuid_());
  var id = doc.getId();
  var bytes;
  try {
    var body = doc.getBody();
    body.setMarginTop(36).setMarginBottom(36).setMarginLeft(36).setMarginRight(36);
    body.appendParagraph(title[0] + ' / ' + title[1]).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(lab_('rpt.generated_at') + ': ' + fmtTimeSrv_(isoVN_(now_()))).setFontSize(9);
    var t1 = body.appendTable(kv.length ? kv : [[lab_('field.no_records'), '']]);
    t1.setFontSize(9);
    tables.forEach(function (t) {
      body.appendParagraph(t.title).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      var tt = body.appendTable([t.head].concat(t.rows));
      tt.setFontSize(8);
    });
    if (!cost && p.entity_type !== 'EQUIPMENT') body.appendParagraph(lab_('cost.hidden')).setFontSize(8).setItalic(true);
    body.appendParagraph('');
    body.appendTable([[lab_('rpt.prepared_by'), lab_('rpt.approved_by')], ['\n\n\n', '\n\n\n']]).setBorderWidth(0);
    doc.saveAndClose();
    bytes = DriveApp.getFileById(id).getAs('application/pdf').getBytes();
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* bỏ qua */ }
  }
  withWriteLock_(function () {
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'export.pdf', entity_type: p.entity_type, entity_id: p.entity_id, before_json: null, after_json: { bytes: bytes.length }, auth_basis: authBasis_(ctx) });
  });
  return { file_name: (rec[et.code] || p.entity_type) + '.pdf', mime_type: 'application/pdf', content_b64: b64_(bytes), size_bytes: bytes.length };
}
