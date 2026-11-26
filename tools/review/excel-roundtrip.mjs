// Xuất Excel → đưa nguyên lại vào Nhập (xem trước) cho MỌI mẫu, dữ liệu khó (dấu tiếng Việt tách rời NFD, chữ Trung, mã có số 0 đầu,
// ngày 29/02, số lẻ, ô trống): kỳ vọng mỗi mẫu 0 lỗi, 0 thêm, 0 sửa (toàn "Không đổi"). Cách chạy: tools/review/README.md
import crypto from 'node:crypto';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../../tests/helpers.mjs';

const ok = (r) => { if (!r.ok) throw new Error(JSON.stringify(r).slice(0, 400)); return r; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const row = (sheet, n, values) => ({ sheet, row_number: n, values });
const T = (d, hm = '08:00') => `${d}T${hm}:00+07:00`;
const nfd = (s) => s.normalize('NFD');

/** Dữ liệu khó cho mọi mẫu Excel (dùng chung với excel-ui.mjs) */
export function seedExcel() {
  const env = freshServer({ now: '2026-11-26T12:00:00+07:00' });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  // Danh mục
  const loc = uuid(), loc2 = uuid(), ven = uuid();
  ok(c.write('location.edit', { location_id: loc, location_code: 'KV-01', name_vi: nfd('Xưởng in ốp-xét'), name_zh: '胶印车间', type: 'WORKSHOP' }));
  ok(c.write('location.edit', { location_id: loc2, location_code: 'KV-02', name_vi: 'Kho “thành phẩm”', type: 'BUILDING', parent_location_id: loc }));
  ok(c.write('vendor.edit', { vendor_id: ven, vendor_code: 'NCC-007', name: 'Công ty Kiểm định 01', phone: '0901 234 567' }));
  const cat = uuid();
  ok(c.write('lookup.edit', { value_id: cat, group_key: 'EQUIPMENT_CATEGORY', code: 'MAY_NEN', name_vi: 'Máy nén', name_zh: '空压机' }));
  ok(c.write('glossary.edit', { glossary_id: uuid(), term_vi: 'Bạc đạn', term_zh: '轴承' }));
  // Thiết bị, thông số, vật tư, linh kiện
  const eq = uuid(), eq2 = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, equipment_code: 'TB-0007', name_vi: nfd('Máy nén khí số 1'), name_zh: '1号空压机', category_id: cat, location_id: loc, vendor_id: ven,
    manufacturer: 'Atlas Copco', model: '007-GA', serial: '000123', manufacture_year: 2016, in_service_year: 2018, install_date: '2024-02-29', warranty_end: '2028-02-29',
    status: 'RUNNING', criticality: 'HIGH', strict_safety: true, registration_no: '0012/LĐ' }));
  ok(c.write('equipment.create', { equipment_id: eq2, name_vi: 'Bơm nước', location_id: loc2 }));
  ok(c.write('equipment.spec.edit', { spec_id: uuid(), equipment_id: eq, spec_key: 'electrical_power', value_num: 37.5, unit: 'kW' }));
  const mat = uuid();
  ok(c.write('material.create', { material_id: mat, material_code: 'VT-0010', name_vi: 'Lọc dầu', name_zh: '油滤', base_unit: 'cái', is_equipment_component: true, part_number: '0001-445', specification_vi: 'Ø 80 × 120' }));
  ok(kt.write('part.link', { equipment_part_id: uuid(), equipment_id: eq, material_id: mat, installed_qty: 2.5, position_vi: 'Đầu nén' }));
  // Kiểm định
  const it = uuid();
  ok(c.write('inspection.type.edit', { inspection_type_id: it, code: 'BINH_AP', name_vi: 'Bình áp lực', default_interval_months: 36 }));
  const req = uuid();
  ok(c.write('inspection.requirement.edit', { requirement_id: req, inspection_type_id: it, equipment_id: eq, obligation_status: 'REQUIRED' }));
  // Hợp đồng
  const co = uuid();
  ok(c.write('contract.create', { contract_id: co, title_vi: 'Bảo trì máy nén 2026', start_date: '2026-01-01', end_date: '2026-12-31', renewal_notice_date: '2026-11-30', vendor_id: ven,
    equipment: [{ contract_equipment_id: uuid(), equipment_id: eq, service_vi: 'Bảo dưỡng định kỳ', interval_type: 'MONTH', interval_value: 3, next_service_date: '2026-12-15' }] }));
  // Bảo trì: checklist + kế hoạch
  const tpl = uuid();
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén', form_code: 'BM-CĐ-03-03a',
    items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL' }, { label_vi: 'Áp suất', result_type: 'NUMBER', unit: 'bar', min_value: 6.5, max_value: 8 }] }));
  ok(c.write('maintenance.plan.edit', { plan_id: uuid(), equipment_id: eq, title_vi: 'BD tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: '2024-02-29', checklist_template_id: tpl, assignee_user_id: ktId, estimated_minutes: 90 }));
  ok(c.write('maintenance.plan.edit', { plan_id: uuid(), equipment_id: eq2, title_vi: 'Theo giờ chạy', interval_type: 'OPERATING_HOURS', interval_value: 500, operating_hours_target: 1500, assignee_user_id: ktId }));
  // Điện nước
  const m1 = uuid(), m2 = uuid();
  ok(c.write('meter.edit', { meter_id: m1, meter_code: 'DH-0001', name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', location_id: loc, multiplier: 40, reading_cycle_type: 'DAY_1', serial: '00987' }));
  ok(c.write('meter.edit', { meter_id: m2, name_vi: 'Điện nhánh', utility_type: 'ELECTRICITY', location_id: loc2, multiplier: 1, reading_cycle_type: 'MONTH', parent_meter_id: m1 }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: m1, measured_at: T('2026-11-20'), cumulative_value: 12345.678 }));
  ok(c.write('tariff.edit', { tariff_id: uuid(), utility_type: 'ELECTRICITY', effective_from: '2026-01-01', unit_price: 1987.5, tax_rate: 8, name_vi: 'Giá điện 2026' }));
  // Lộ điện
  const P = uuid(), Q = uuid(), C1 = uuid();
  ok(c.write('circuit.edit', { entity: 'PANEL', panel_id: P, panel_code: 'TU-0001', name_vi: 'Tủ tổng MSB', panel_type: 'MAIN_SWITCHBOARD', location_id: loc, supply_voltage: 400 }));
  ok(c.write('circuit.edit', { entity: 'PANEL', panel_id: Q, name_vi: 'Tủ DB1', panel_type: 'DISTRIBUTION_BOARD', equipment_id: eq2 }));
  ok(c.write('circuit.edit', { entity: 'CIRCUIT', circuit_id: C1, circuit_code: 'LO-0001', panel_id: P, name_vi: 'Lộ DB1', voltage: 400, phases: 3, breaker_rating_a: 63, cable_section_mm2: '4x16', cable_length_m: 35.5 }));
  ok(c.write('circuit.edit', { entity: 'LOAD', load_link_id: uuid(), circuit_id: C1, downstream_panel_id: Q }));
  ok(c.write('circuit.edit', { entity: 'LOAD', load_link_id: uuid(), circuit_id: C1, equipment_id: eq, rated_load_kw: 37 }));
  env.g.dbReset_();
  return { env, c };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { env, c } = seedExcel();
  const keys = Object.keys(env.g.IMPORT_TEMPLATES_);
  let bad = 0;
  for (const key of keys) {
    const ex = c.call('export.xlsx', { template_key: key });
    if (!ex.ok) { console.log(key.padEnd(24), 'XUẤT', ex.code, (ex.errors || []).map((e) => e.field + ':' + e.code).join(',')); continue; }
    const rows = ex.data.sheets.flatMap((s) => s.rows.map((r, i) => row(s.name, i + 3, Object.fromEntries(s.keys.map((k, j) => [k, r[j]]).filter(([k]) => k !== 'i18n_machine_fields')))));
    if (!rows.length) { console.log(key.padEnd(24), 'không có dòng'); continue; }
    const batch = uuid();
    const size = 150, n = Math.ceil(rows.length / size);
    let r;
    for (let i = 0; i < n; i++) {
      r = c.write('import.preview', { import_batch_id: batch, template_key: key, chunk_index: i, chunk_count: n, total_rows: rows.length, source_sha256: sha(key + JSON.stringify(rows)), rows: rows.slice(i * size, (i + 1) * size) });
      if (!r.ok) break;
    }
    if (!r.ok) { bad++; console.log(key.padEnd(24), 'XEM TRƯỚC', r.code, JSON.stringify(r.errors || r.data).slice(0, 300)); continue; }
    const d = r.data;
    const unchanged = d.total_rows - d.add_count - d.update_count - d.error_count;
    const okk = !d.error_count && !d.add_count && !d.update_count;
    if (!okk) bad++;
    console.log(key.padEnd(24), okk ? 'ĐẠT ' : 'LỖI ', `dòng ${d.total_rows} · không đổi ${unchanged} · thêm ${d.add_count} · sửa ${d.update_count} · lỗi ${d.error_count}`,
      okk ? '' : JSON.stringify({ errors: (d.errors || []).slice(0, 4), changes: (d.changes || []).slice(0, 3).map((x) => ({ sheet: x.sheet, row: x.row, diff: x.diff })) }).slice(0, 700));
    c.write('import.cancel', { import_batch_id: batch });
  }
  console.log('mẫu', keys.length, 'lỗi', bad);
}
