// Báo cáo (rà soát lượt 4): mọi mẫu tích hợp × máy chủ trống (0 dòng) / dữ liệu mẫu (vài dòng) / dữ liệu lớn (> 2 000 dòng):
// report.run, report.save, report.view bản đã lưu, report.export XLSX + PDF (từ bộ lọc và từ bản đã lưu); lọc khu vực không có dữ liệu,
// khoảng ngày tương lai; mẫu đã ẩn cột. Đạt: không lỗi máy chủ, số dòng khớp, cắt dòng đúng (2 000 xem / 500 PDF). Cách chạy: README.md
import { freshServer, ownerClient, uuid, OWNER_PIN } from '../../tests/helpers.mjs';
import { seedExcel } from './excel-roundtrip.mjs';

let bad = 0;
const log = (...a) => console.log(...a);
const fail = (...a) => { bad++; console.log('  LỖI', ...a); };

function server() {
  const env = freshServer({ now: '2026-11-26T09:00:00+07:00' });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  return { env, c, g: env.g };
}
const codes = (g) => g.RPT_BUILTIN_.map((b) => b[0]);
const FILTERS = {
  RPT_UTILITIES: [{ period_type: 'MONTH', date: '2026-11-15' }, { period_type: 'DAY_1', date: '2026-11-20' }, { period_type: 'CUSTOM', from: '2026-10-01', to: '2026-11-25' }],
  RPT_MAINTENANCE: [{}, { from: '2026-01-01', to: '2026-12-31' }],
  RPT_REPAIRS: [{}, { from: '2026-01-01', to: '2026-12-31' }],
  RPT_MATERIALS: [{}],
  RPT_CONTRACT_SERVICES: [{}],
  RPT_CONTRACTS: [{}, { due: 'DUE40' }, { due: 'OVERDUE' }],
  RPT_INSPECTIONS: [{}, { due: 'DUE40' }, { due: 'OVERDUE' }]
};

function runAll(label, env, c, g, { expectEmpty = false, emptyLoc = null } = {}) {
  log(`== ${label}`);
  for (const code of codes(g)) {
    const variants = (FILTERS[code] || [{}]).slice();
    const ds = g.REPORT_DATASETS_[g.RPT_BUILTIN_.find((b) => b[0] === code)[1]];
    if (emptyLoc && ds.filters.includes('location_id')) variants.push({ ...(variants[0] || {}), location_id: emptyLoc });
    if (ds.filters.includes('from') && code !== 'RPT_UTILITIES') variants.push({ ...(variants[0] || {}), from: '2027-06-01', to: '2027-06-30' }); // tương lai
    for (const f of variants) {
      const r = c.call('report.run', { code, filters: f });
      if (!r.ok) {
        if (r.code === 'VALIDATION_ERROR') { log(`  ${code.padEnd(22)} ${JSON.stringify(f)} → lọc không hợp lệ: ${r.errors.map((e) => e.field + ':' + e.code).join(',')}`); continue; }
        fail(code, JSON.stringify(f), r.code); continue;
      }
      const d = r.data;
      const n = d.total_rows;
      if (d.rows.length !== Math.min(n, g.REPORT_ROW_MAX_) || d.truncated !== n > g.REPORT_ROW_MAX_) fail(code, 'cắt dòng sai', d.rows.length, n, d.truncated);
      if ((expectEmpty || (emptyLoc && f.location_id === emptyLoc) || f.from === '2027-06-01') && n) fail(code, 'phải 0 dòng', JSON.stringify(f), n);
      const x = c.call('report.export', { format: 'XLSX', code, filters: f });
      if (!x.ok) fail(code, 'XLSX', x.code);
      const p = c.call('report.export', { format: 'PDF', code, filters: f });
      const pdfOk = p.ok ? 'PDF ' + Math.round(p.data.size_bytes / 1024) + ' KB' : (p.errors && p.errors[0] ? p.errors[0].code : p.code);
      if (!p.ok && !(n > g.REPORT_PDF_ROW_MAX_ && p.errors && p.errors[0].code === 'PDF_TOO_MANY_ROWS')) fail(code, 'PDF', p.code, JSON.stringify(p.errors || []).slice(0, 200));
      log(`  ${code.padEnd(22)} ${JSON.stringify(f).padEnd(60)} ${String(n).padStart(5)} dòng · ${pdfOk}`);
    }
    // Lưu + xem lại + xuất từ bản đã lưu
    const id = uuid();
    const s = c.write('report.save', { report_run_id: id, code, filters: (FILTERS[code] || [{}])[0] });
    if (!s.ok) { fail(code, 'save', s.code, JSON.stringify(s.errors || []).slice(0, 200)); continue; }
    const v = c.call('report.view', { report_run_id: id });
    if (!v.ok) fail(code, 'view saved', v.code);
    const pe = c.call('report.export', { format: 'PDF', report_run_id: id });
    if (!pe.ok && !(pe.errors && pe.errors[0] && pe.errors[0].code === 'PDF_TOO_MANY_ROWS')) fail(code, 'PDF bản lưu', pe.code);
  }
  const ie = env.logs.filter((l) => /INTERNAL_ERROR/.test(l));
  if (ie.length) { fail('lỗi máy chủ', ie.length); log(ie.slice(0, 2).join('\n').slice(0, 800)); }
}

// 1. Máy chủ trống
{
  const { env, c, g } = server();
  runAll('Máy chủ trống (0 dòng)', env, c, g, { expectEmpty: true });
}
// 2. Mỗi mẫu có dữ liệu thật (seedExcel + sửa chữa, chỉ số, dịch vụ nhà thầu, vật tư dùng) + khu vực trống + mẫu ẩn cột
const T = (d, hm = '08:00') => d + 'T' + hm + ':00+07:00';
function rich() {
  const { env, c } = seedExcel();
  const g = env.g;
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  g.dbReset_();
  const eq = g.readRows_('Equipment')[0].equipment_id;
  const must = (r, w) => { if (!r.ok) fail('seed', w, r.code, JSON.stringify(r.errors || []).slice(0, 300)); return r; };
  must(c.write('repair.report', { repair_id: uuid(), equipment_id: eq, symptom_vi: 'Rò rỉ dầu', severity: 'HIGH', reported_at: T('2026-11-10') }), 'repair');
  const m1 = g.readRows_('Meters')[0].meter_id;
  must(c.write('reading.create', { reading_id: uuid(), meter_id: m1, measured_at: T('2026-11-24'), cumulative_value: 12400 }), 'rd1');
  must(c.write('reading.create', { reading_id: uuid(), meter_id: m1, measured_at: T('2026-11-25'), cumulative_value: 12800 }), 'rd2');
  const ce = g.readRows_('ContractEquipment')[0];
  if (ce) must(c.write('contract.service.record', { service_id: uuid(), contract_id: ce.contract_id, contract_equipment_id: ce.contract_equipment_id, performed_at: T('2026-11-12'), result_vi: 'Đã bảo dưỡng' }), 'service');
  const wo = g.readRows_('WorkOrders')[0];
  const mat = g.readRows_('Materials')[0];
  if (wo && mat) must(c.write('usage.record', { work_type: 'WORK_ORDER', work_id: wo.work_order_id, lines: [{ usage_line_id: uuid(), material_id: mat.material_id, actual_used_qty: 2 }] }), 'usage');
  g.dbReset_();
  return { env, c, g };
}
{
  const { env, c, g } = rich();
  const loc = uuid();
  const lr = c.write('location.edit', { location_id: loc, name_vi: 'Kho trống', type: 'BUILDING' });
  if (!lr.ok) fail('location', lr.code, JSON.stringify(lr.errors || []));
  runAll('Mỗi mẫu có dữ liệu (1–vài dòng)', env, c, g, { emptyLoc: lr.ok ? loc : null });
  // Mẫu tích hợp ẩn bớt cột
  g.dbReset_();
  const def = g.readRows_('ReportDefinitions').find((d) => d.code === 'RPT_EQUIPMENT');
  const er = c.write('report.definition.edit', { report_definition_id: def.report_definition_id, visible_columns: ['equipment_code', 'name'] }, { expected_version: def.record_version });
  if (!er.ok) fail('ẩn cột', er.code, JSON.stringify(er.errors || []).slice(0, 200));
  const r = c.call('report.run', { code: 'RPT_EQUIPMENT', filters: {} });
  if (er.ok && r.ok && r.data.columns.map((x) => x.key).join() !== 'equipment_code,name') fail('ẩn cột không áp', r.data.columns.map((x) => x.key).join());
  const p = c.call('report.export', { format: 'PDF', code: 'RPT_EQUIPMENT', filters: {} });
  if (!p.ok) fail('PDF mẫu ẩn cột', p.code);
}
// 3. Nhiều dòng: nhân bản bảng nguồn của mọi mẫu lên 600 dòng (> 500 dòng PDF), thiết bị 2 100 (> 2 000 dòng xem)
{
  const { env, c, g } = rich();
  const strip = (r) => { const o = { ...r }; delete o.__row; return o; };
  const pad = (n, w = 5) => String(n).padStart(w, '0');
  const clone = (sheet, n, fn) => {
    const base = g.readRows_(sheet).map(strip);
    if (!base.length) { log('  (không có dòng mẫu', sheet + ')'); return []; }
    const key = g.sheetSchema_(sheet).key;
    return Array.from({ length: n }, (_, i) => fn({ ...base[i % base.length], [key]: uuid() }, i));
  };
  g.dbReset_();
  const add = {
    Equipment: clone('Equipment', 2100, (r, i) => ({ ...r, equipment_code: 'TB-' + pad(i + 100), name_vi: 'Máy số ' + i })),
    WorkOrders: clone('WorkOrders', 600, (r, i) => ({ ...r, work_order_code: 'BT-' + pad(i + 100, 6) })),
    Repairs: clone('Repairs', 600, (r, i) => ({ ...r, repair_code: 'SC-' + pad(i + 100, 6) })),
    MaterialUsageLines: clone('MaterialUsageLines', 600, (r) => r),
    Circuits: clone('Circuits', 600, (r, i) => ({ ...r, circuit_code: 'LO-' + pad(i + 100) })),
    Contracts: clone('Contracts', 600, (r, i) => ({ ...r, contract_code: 'HD-' + pad(i + 100) })),
    ContractServices: clone('ContractServices', 600, (r) => r),
    InspectionRequirements: clone('InspectionRequirements', 600, (r, i) => ({ ...r, requirement_code: 'KD-' + pad(i + 100) }))
  };
  // Đồng hồ: 600 đồng hồ, mỗi cái một giai đoạn + 2 chỉ số trong tháng 11
  const m0 = strip(g.readRows_('Meters')[0]), s0 = strip(g.readRows_('MeterSegments').find((x) => x.meter_id === m0.meter_id)), r0 = strip(g.readRows_('MeterReadings').find((x) => x.meter_id === m0.meter_id));
  add.Meters = []; add.MeterSegments = []; add.MeterReadings = [];
  for (let i = 0; i < 600; i++) {
    const mid = uuid(), sid = uuid();
    add.Meters.push({ ...m0, meter_id: mid, meter_code: 'DH-' + pad(i + 100), current_segment_id: sid, parent_meter_id: '' });
    add.MeterSegments.push({ ...s0, segment_id: sid, meter_id: mid });
    add.MeterReadings.push({ ...r0, reading_id: uuid(), meter_id: mid, meter_segment_id: sid, measured_at: T('2026-11-01'), cumulative_value: 100, reading_kind: 'NORMAL', event_id: '' });
    add.MeterReadings.push({ ...r0, reading_id: uuid(), meter_id: mid, meter_segment_id: sid, measured_at: T('2026-11-25'), cumulative_value: 100 + i, reading_kind: 'NORMAL', event_id: '' });
  }
  g.withWriteLock_(() => { Object.entries(add).forEach(([s, l]) => { if (l.length) { g.insertRows_(s, l); g.resetBumpTable_(s); } }); });
  g.dbReset_();
  const t0 = Date.now();
  runAll('Nhiều dòng (600 mỗi nguồn, thiết bị 2 100)', env, c, g, {});
  log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const r = c.call('report.run', { code: 'RPT_EQUIPMENT', filters: {} });
  log('  RPT_EQUIPMENT:', r.data.total_rows, 'dòng, gửi', r.data.rows.length, '· cắt', r.data.truncated, '·', (JSON.stringify(r).length / 1e6).toFixed(2), 'triệu ký tự');
}
log('lỗi', bad);
