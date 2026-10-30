// d4.21: PDF đủ nội dung các biểu mẫu ISO của người dùng — phiếu bảo trì (BM-CĐ-03-03), phiếu sửa chữa (04-01 + 04-02),
// lý lịch thiết bị (02-02), lịch bảo trì tháng (03-02), sổ hợp đồng thuê ngoài + nhật ký dịch vụ (05-06), mã biểu mẫu theo loại PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const T = (s) => s + ':00+07:00';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const nowIso = (env, minutes = 0) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + minutes * 60000));
const uidOf = (env, code) => env.rows('Users').find((u) => u.employee_code === code).user_id;
const lastDoc = (env) => [...env.drive._docs.values()].pop();
const tablesOf = (d) => d.body.children.filter((x) => x.kind === 'table');
const vi = (s) => String(s).split(' · ')[0];
/** Bảng nhãn – giá trị → {nhãn Việt: giá trị} */
const kvOf = (d) => {
  const t = tablesOf(d).find((x) => x.rows[0].cells.length === 2 && x.rows[0].cells[0].st.BACKGROUND_COLOR === '#F1F5F9');
  return Object.fromEntries(Array.from(t.rows, (r) => [vi(r.cells[0].getText()), r.cells[1].getText()]));
};
const tableAfter = (d, heading) => {
  const ch = d.body.children;
  const i = ch.findIndex((x) => x.kind === 'p' && String(x.text).startsWith(heading));
  assert.ok(i >= 0, 'có mục ' + heading);
  return ch.slice(i + 1).find((x) => x.kind === 'table');
};
const head = (t) => Array.from(t.rows[0].cells, (c) => vi(c.getText()));
const row = (t, i) => Array.from(t.rows[i].cells, (c) => c.getText());

function setup() {
  const env = freshServer({ now: T('2026-10-20T10:00') });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const eq = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01', model: 'GA-37', manufacturer: 'Atlas Copco', serial: 'AII-123',
    manufacture_year: 2019, install_date: '2020-01-15', criticality: 'HIGH' }));
  ok(c.write('lookup.edit', { value_id: uuid(), group_key: 'CAUSE', code: 'MON', name_vi: 'Mòn' }));
  const grease = uuid(), bearing = uuid(), link = uuid();
  ok(c.write('material.create', { material_id: grease, name_vi: 'Mỡ bôi trơn', base_unit: 'kg', is_equipment_component: false }));
  ok(c.write('material.create', { material_id: bearing, name_vi: 'Vòng bi 6205', base_unit: 'cái', is_equipment_component: true }));
  ok(c.write('part.link', { equipment_part_id: link, equipment_id: eq, material_id: bearing, installed_qty: 2, position_vi: 'Đầu trục' }));
  const tpl = uuid();
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén', items: [
    { label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL', required: true },
    { label_vi: 'Áp suất xả', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8, required: true }] }));
  return { env, c, c3, kt, hd, eq, grease, bearing, link, tpl, ktId: uidOf(env, 'U-KT') };
}

/** Kế hoạch tháng mốc hôm nay → phiếu sinh ngay; KT làm (dừng máy, giờ công, giờ chạy, vật tư, thay vòng bi, đề nghị vật tư), C3 nghiệm thu */
function doneWo(ctx) {
  const { env, c, c3, kt, eq, grease, bearing, link, tpl, ktId } = ctx;
  const plan = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eq, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1,
    anchor_date: env.g.todayVN_(), checklist_template_id: tpl, assignee_user_id: ktId, safety_note_vi: 'Khóa – treo thẻ trước khi mở nắp' }));
  const w = env.rows('WorkOrders').find((x) => x.plan_id === plan);
  const [r1, r2] = env.rows('WorkOrderResults').filter((r) => r.work_order_id === w.work_order_id).sort((a, b) => a.step_no - b.step_no);
  ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -120) }, { expected_version: 1 }));
  ok(kt.write('matreq.create', { request_id: uuid(), work_type: 'WORK_ORDER', work_id: w.work_order_id, needed_at: env.g.todayVN_(),
    lines: [{ request_line_id: uuid(), material_id: grease, requested_qty: 0.5 }] }));
  ok(kt.write('usage.record', { work_type: 'WORK_ORDER', work_id: w.work_order_id, lines: [
    { usage_line_id: uuid(), material_id: grease, actual_used_qty: 0.4, scrap_qty: 0.1, note_vi: 'Rơi vãi' }] }));
  ok(kt.write('part.replace', { event_id: uuid(), work_type: 'WORK_ORDER', work_id: w.work_order_id, quantity: 1, event_type: 'REPLACED', equipment_part_id: link, note_vi: 'Vòng bi kêu' }));
  const cur = () => env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id).record_version;
  ok(kt.write('maintenance.execute', {
    work_order_id: w.work_order_id, end_at: nowIso(env, -5), overall_result: 'PASS', downtime_start_at: nowIso(env, -110), downtime_end_at: nowIso(env, -20),
    labor_minutes: 90, operating_hours: 12350,
    results: [{ result_id: r1.result_id, result_status: 'PASS' }, { result_id: r2.result_id, result_status: 'PASS', measured_value: 7 }]
  }, { expected_version: cur() }));
  ok(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: cur() }));
  ok(c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: cur(), reauth_token: c3.reauth() }));
  return { plan, wo: env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id) };
}

/** Sự cố có dừng máy: KT báo, C3 phân công KT, KT xử lý (nguyên nhân, việc con, vật tư, chạy thử), owner nghiệm thu */
function doneRepair(ctx) {
  const { env, c, c3, kt, eq, grease, ktId } = ctx;
  const id = uuid();
  ok(kt.write('repair.report', { repair_id: id, equipment_id: eq, symptom_vi: 'Máy nén nóng, báo lỗi nhiệt', severity: 'HIGH', machine_stopped: true }));
  env.clock.advance(30 * 60000);
  ok(c3.write('repair.assign', { repair_id: id, assignee_user_id: ktId }, { expected_version: 1 }));
  env.clock.advance(3 * 3600000);
  const task = uuid();
  ok(kt.write('repair.process', { repair_id: id, repair_start_at: nowIso(env, -150), diagnosis_vi: 'Quạt giải nhiệt kẹt', root_cause_code: 'MON',
    action_vi: 'Vệ sinh, thay mỡ ổ quạt', tasks: [{ repair_task_id: task, task_vi: 'Tháo quạt', assignee_user_id: ktId }] }, { expected_version: 2 }));
  ok(kt.write('usage.record', { work_type: 'REPAIR', work_id: id, lines: [{ usage_line_id: uuid(), material_id: grease, actual_used_qty: 0.2 }] }));
  const ver = () => env.rows('Repairs').find((x) => x.repair_id === id).record_version;
  ok(kt.write('repair.process', { repair_id: id, tasks: [{ repair_task_id: task, status: 'DONE', result_vi: 'Đã tháo' }], repair_end_at: nowIso(env, -30), restored_at: nowIso(env, -25),
    test_run_result: 'PASS', test_run_note_vi: 'Chạy 30 phút, nhiệt ổn' }, { expected_version: ver() }));
  ok(kt.write('repair.submit', { repair_id: id }, { expected_version: ver() }));
  ok(c.write('repair.accept', { repair_id: id, decision: 'PASS' }, { expected_version: ver(), reauth_token: c.reauth() }));
  return env.rows('Repairs').find((x) => x.repair_id === id);
}

test('mã biểu mẫu theo loại PDF: C4 + PIN; loại sai/mã quá dài bị từ chối; gửi xuống app; in ở khối thông tin và chân trang báo cáo', () => {
  const { env, c, c3 } = setup();
  const edit = (codes) => c.write('settings.edit', { changes: { pdf_form_codes: codes }, reason: 'ISO' }, { reauth_token: c.reauth() });
  assert.equal(c3.write('settings.edit', { changes: { pdf_form_codes: { WORK_ORDER: 'X' } } }, { reauth_token: c3.reauth() }).code, 'FORBIDDEN');
  assert.equal(edit({ work_order: 'X' }).code, 'VALIDATION_ERROR', 'loại phải chữ hoa');
  assert.equal(edit({ WORK_ORDER: 'X'.repeat(41) }).code, 'VALIDATION_ERROR', 'mã ≤ 40 ký tự');
  assert.equal(edit(['BM']).code, 'VALIDATION_ERROR');
  const r = ok(edit({ WORK_ORDER: ' BM-CĐ-03-03 ', REPAIR: 'BM-CĐ-04-02', RPT_REPAIRS: 'BM-CĐ-04-03', EQUIPMENT: '' }));
  assert.deepEqual(r.data.settings.find((s) => s.key === 'pdf_form_codes').value, { WORK_ORDER: 'BM-CĐ-03-03', REPAIR: 'BM-CĐ-04-02', RPT_REPAIRS: 'BM-CĐ-04-03' }, 'cắt khoảng trắng, bỏ mã trống');
  assert.equal(c3.call('sync.bootstrap', {}).data.settings.pdf_form_codes.RPT_REPAIRS, 'BM-CĐ-04-03', 'app nhận để in trên bản xem trước và Excel');
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_REPAIRS', filters: {} }));
  const d = lastDoc(env);
  assert.ok(tablesOf(d)[0].rows[0].cells[1].getText().includes('Mã biểu mẫu · 表单编号: BM-CĐ-04-03'));
  assert.ok(d.footer.children[0].text.includes('BM-CĐ-04-03'));
  // Mẫu chưa đặt mã: không in dòng mã biểu mẫu
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_EQUIPMENT', filters: {} }));
  assert.ok(!tablesOf(lastDoc(env))[0].rows[0].cells[1].getText().includes('Mã biểu mẫu'));
});

test('PDF phiếu bảo trì (thay BM-CĐ-03-03): kế hoạch, an toàn, dừng máy, giờ chạy, giờ công, gửi/nghiệm thu; checklist có giới hạn; vật tư dùng; thay linh kiện; ký 3 ô', () => {
  const ctx = setup();
  const { env, c, c3 } = ctx;
  ok(c.write('settings.edit', { changes: { pdf_form_codes: { WORK_ORDER: 'BM-CĐ-03-03' } } }, { reauth_token: c.reauth() }));
  const { wo } = doneWo(ctx);
  ok(c3.call('export.pdf', { entity_type: 'WORK_ORDER', entity_id: wo.work_order_id }));
  const d = lastDoc(env);
  assert.equal(d.page.w, 595, 'A4 dọc');
  const kv = kvOf(d);
  assert.match(kv['Kế hoạch bảo trì'], /^KH-0001 · Bảo dưỡng tháng/);
  assert.equal(kv['Mức quan trọng'], 'Quan trọng cao · 关键');
  assert.equal(kv['Lưu ý an toàn'], 'Khóa – treo thẻ trước khi mở nắp');
  assert.ok(kv['Dừng máy (từ → đến)'].endsWith('(1.5 h)'), kv['Dừng máy (từ → đến)']);
  assert.equal(kv['Giờ chạy lúc làm (h)'], '12\u202F350', 'phân cách nghìn U+202F (5.4)');
  assert.equal(kv['Thời gian công (phút)'], '90 phút · 90分钟  (1.5 h)');
  assert.ok(kv['Gửi nghiệm thu'].startsWith('U-KT · '));
  assert.ok(kv['Nghiệm thu'].startsWith('U-C3 · '));
  const cl = tableAfter(d, 'Checklist');
  assert.deepEqual(head(cl), ['#', 'Tên', 'Giới hạn', 'Số đo', 'Trạng thái', 'Ghi chú']);
  assert.deepEqual(row(cl, 2).slice(1, 4).map((x) => x.split(' / ')[0]), ['Áp suất xả', '6–8 bar', '7 bar'], 'tên bước hai thứ tiếng, giới hạn, số đo');
  const mat = tableAfter(d, 'Vật tư – phụ tùng sử dụng');
  assert.deepEqual(row(mat, 1).slice(2, 6), ['Mỡ bôi trơn', '0.4', '0.1', 'kg']);
  const parts = tableAfter(d, 'Thay, lắp, tháo linh kiện');
  assert.ok(row(parts, 1)[1].startsWith('Thay') && row(parts, 1)[2].includes('Vòng bi 6205') && row(parts, 1)[5].startsWith('Vòng bi kêu'));
  const sign = tablesOf(d).pop();
  assert.deepEqual(head(sign), ['Người thực hiện', 'Người nghiệm thu', 'Sản xuất xác nhận']);
  assert.deepEqual(row(sign, 3), ['U-KT', 'U-C3', '']);
  assert.ok(row(sign, 4)[0].startsWith('Ngày'));
  assert.ok(tablesOf(d)[0].rows[0].cells[1].getText().includes('BM-CĐ-03-03'), 'mã biểu mẫu');
  assert.ok(d.footer.children[0].text.includes('BM-CĐ-03-03'));
});

test('PDF phiếu sửa chữa (thay BM-CĐ-04-01 + 04-02): người báo, dừng máy, người phụ trách, thời lượng, nguyên nhân gốc, chạy thử, nghiệm thu; việc con, vật tư', () => {
  const ctx = setup();
  const { env, c3 } = ctx;
  const rp = doneRepair(ctx);
  ok(c3.call('export.pdf', { entity_type: 'REPAIR', entity_id: rp.repair_id }));
  const d = lastDoc(env);
  const kv = kvOf(d);
  assert.equal(kv['Người báo'], 'U-KT');
  assert.ok(kv['Dừng máy'] && /\d\d\/\d\d\/2026/.test(kv['Dừng máy']), 'giờ máy dừng');
  assert.equal(kv['Người phụ trách'], 'U-KT');
  assert.ok(kv['Nguyên nhân gốc'].startsWith('MON · Mòn'), kv['Nguyên nhân gốc']);
  assert.ok(kv['Chạy thử'].startsWith('Đạt · 合格 — Chạy 30 phút, nhiệt ổn'), kv['Chạy thử']);
  assert.match(kv['Thời gian dừng máy'], /^\d+(\.\d)? h$/);
  assert.match(kv['Từ báo đến bắt đầu sửa'], /phút/);
  assert.equal(kv['Thời gian sửa'], '2 h');
  assert.ok(kv['Nghiệm thu'].startsWith('Nghiệm thu đạt'));
  const tasks = tableAfter(d, 'Việc con');
  assert.deepEqual(row(tasks, 1).slice(1, 3).map((x) => x.split(' / ')[0]), ['Tháo quạt', 'U-KT']);
  assert.equal(vi(row(tasks, 1)[6]), 'Xong');
  const mat = tableAfter(d, 'Vật tư – phụ tùng sử dụng');
  assert.equal(row(mat, 1)[2], 'Mỡ bôi trơn');
  assert.deepEqual(head(tablesOf(d).pop()), ['Người sửa chữa', 'Người nghiệm thu', 'Sản xuất xác nhận']);
});

test('PDF lý lịch thiết bị (thay BM-CĐ-02-02): A4 ngang, thông tin chung, ô tóm tắt, kiểm định, linh kiện gắn máy, lịch sử bảo trì/sửa chữa/kiểm định/dịch vụ theo ngày', () => {
  const ctx = setup();
  const { env, c, c3, hd, eq } = ctx;
  ok(c.write('settings.edit', { changes: { pdf_form_codes: { EQUIPMENT: 'BM-CĐ-02-02' } } }, { reauth_token: c.reauth() }));
  // Kiểm định đã duyệt
  const type = uuid(), req = uuid(), insp = uuid();
  ok(c.write('inspection.type.edit', { inspection_type_id: type, code: 'AP_LUC', name_vi: 'Kiểm định bình chịu áp lực', default_interval_months: 12 }));
  ok(c.write('inspection.requirement.edit', { requirement_id: req, equipment_id: eq, inspection_type_id: type }));
  ok(hd.write('inspection.submit', { inspection_id: insp, requirement_id: req, inspection_date: '2026-10-01', valid_from: '2026-10-01', valid_to: '2027-09-30', result: 'PASS', certificate_number: 'CN-1' }));
  ok(c3.write('inspection.approve', { inspection_id: insp, decision: 'APPROVE' }, { expected_version: 1, reauth_token: c3.reauth() }));
  // Dịch vụ nhà thầu đã làm
  const con = uuid(), ce = uuid(), sv = uuid();
  ok(hd.write('contract.create', { contract_id: con, title_vi: 'Bảo trì máy nén', start_date: '2026-01-01', end_date: '2026-12-31',
    equipment: [{ contract_equipment_id: ce, equipment_id: eq, service_vi: 'Thay lọc, dầu', interval_type: 'MONTH', interval_value: 3, next_service_date: '2026-12-15' }],
    services: [{ service_id: sv, contract_equipment_id: ce, due_date: '2026-09-15' }] }));
  ok(hd.write('contract.service.record', { service_id: sv, performed_at: '2026-09-16', result_vi: 'Đã thay lọc gió' }, { expected_version: 1 }));
  doneWo(ctx);
  doneRepair(ctx);
  ok(c3.call('export.pdf', { entity_type: 'EQUIPMENT', entity_id: eq }));
  const d = lastDoc(env);
  assert.equal(d.page.w, 842, 'A4 ngang như biểu lý lịch');
  assert.equal(d.body.children[0].text, 'Lý lịch thiết bị');
  const kv = kvOf(d);
  assert.equal(kv['Hãng sản xuất'], 'Atlas Copco');
  assert.equal(kv['Năm sản xuất'], '2019');
  assert.equal(kv['Ngày lắp đặt'], '15/01/2020');
  assert.equal(kv['Mức quan trọng'], 'Quan trọng cao · 关键');
  const tiles = tablesOf(d).find((t) => t.st.BORDER_COLOR === '#FFFFFF');
  assert.deepEqual(Array.from(tiles.rows[0].cells, (x) => vi(x.children[0].text) + '=' + x.children[1].text),
    ['Số lần bảo trì=1', 'Bảo trì gần nhất=20/10/2026', 'Số lần sửa chữa=1', 'Tổng giờ dừng máy do sửa chữa=' + tiles.rows[0].cells[3].children[1].text]);
  const ins = tableAfter(d, 'Kiểm định – hiệu chuẩn');
  assert.deepEqual(row(ins, 1).slice(1, 5), ['12', 'CN-1', '01/10/2026', '30/09/2027']);
  const parts = tableAfter(d, 'Linh kiện gắn máy');
  assert.equal(row(parts, 1)[2], 'Vòng bi 6205');
  const hist = tableAfter(d, 'B. Lịch sử');
  assert.deepEqual(head(hist), ['#', 'Ngày', 'Loại', 'Số phiếu', 'Nội dung công việc', 'Phụ tùng thay', 'Dừng máy (h)', 'Giờ chạy (h)', 'Người thực hiện', 'Người xác nhận', 'Kết quả']);
  const kinds = Array.from(hist.rows.slice(1), (r) => vi(r.cells[2].getText()));
  assert.deepEqual(kinds, ['Dịch vụ nhà thầu', 'Kiểm định', 'Bảo trì định kỳ', 'Sửa chữa'], 'xếp theo ngày, cũ → mới');
  const pm = row(hist, 3);
  assert.ok(pm[3].startsWith('BT-'));
  assert.ok(pm[5].includes('Mỡ bôi trơn × 0.4 kg') && pm[5].includes('Thay: '), pm[5]);
  assert.deepEqual([pm[6], pm[7], pm[8], pm[9]], ['1.5', '12\u202F350', 'U-KT', 'U-C3']);
  assert.equal(row(hist, 2)[3], 'CN-1');
  assert.ok(row(hist, 1)[4].includes('Thay lọc, dầu') && row(hist, 1)[4].includes('Đã thay lọc gió'));
  assert.ok(row(hist, 4)[4].includes('→ Vệ sinh, thay mỡ ổ quạt'));
  assert.ok(tablesOf(d)[0].rows[0].cells[1].getText().includes('BM-CĐ-02-02'));
  // KT không có quyền xuất PDF (cờ X)
  assert.equal(ctx.kt.call('export.pdf', { entity_type: 'EQUIPMENT', entity_id: eq }).code, 'FORBIDDEN');
});

test('lịch bảo trì tháng (thay BM-CĐ-03-02): phiếu đã sinh → phụ tùng đề nghị, giờ dừng máy, số phiếu + ✓ ngày xong; phiếu đổi hạn → "→ ngày mới"; ô SX xác nhận; mã biểu mẫu riêng', () => {
  const ctx = setup();
  const { env, c, c3, eq, tpl, ktId } = ctx;
  ok(c.write('settings.edit', { changes: { pdf_form_codes: { ANNUAL_MONTH: 'BM-CĐ-03-02' }, annual_plan_form_code: 'BM-CĐ-03-01' } }, { reauth_token: c.reauth() }));
  const { plan, wo } = doneWo(ctx);
  // Kế hoạch thứ hai: phiếu sinh trước hạn 3 ngày, trưởng bộ phận dời sang 28/10
  const plan2 = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan2, equipment_id: eq, title_vi: 'Vệ sinh lọc', interval_type: 'MONTH', interval_value: 3, anchor_date: '2026-10-23', checklist_template_id: tpl, assignee_user_id: ktId }));
  const w2 = env.rows('WorkOrders').find((x) => x.plan_id === plan2);
  ok(c3.write('maintenance.assign', { work_order_id: w2.work_order_id, assignee_user_id: ktId, due_date: '2026-10-28' }, { expected_version: w2.record_version }));
  const rowOf = (ref, title, dates) => ({ kind: 'PLAN', ref_id: ref, equipment_id: eq, equipment_code: 'TB-0001', equipment_vi: 'Máy nén khí 01', title_vi: title, code: 'KH', cycle: '', dates, est: [] });
  const id = uuid();
  ok(c3.write('annual_plan.save', { annual_plan_id: id, year: 2026, snapshot: { year: 2026, groups: [{ key: 'x', name_vi: 'Máy nén khí', rows: [
    rowOf(plan, 'Bảo dưỡng tháng', ['2026-10-20']), rowOf(plan2, 'Vệ sinh lọc', ['2026-10-23']), rowOf(uuid(), 'Kế hoạch chưa có phiếu', ['2026-10-30'])] }] } }));
  ok(c3.call('annual_plan.pdf', { annual_plan_id: id, part: 'MONTH', month: 10 }));
  let d = lastDoc(env);
  const t = tablesOf(d).find((x) => vi(x.rows[0].cells[0].getText()) === 'Ngày');
  assert.equal(t.rows[0].cells.length, 11);
  const r1 = row(t, 1), r2 = row(t, 2), r3 = row(t, 3);
  assert.equal(r1[6], 'Mỡ bôi trơn × 0.5 kg', 'phụ tùng từ đề nghị vật tư của phiếu');
  assert.match(r1[7], /^\d\d:\d\d–\d\d:\d\d$/, 'giờ dừng máy từ phiếu');
  assert.equal(r1[8], wo.work_order_code + '\n✓ 20/10');
  assert.equal(r1[9], '☐', 'SX xác nhận ký tay');
  assert.equal(r1[10], '');
  assert.equal(r2[8], w2.work_order_code + '\n☐');
  assert.equal(r2[10], '→ 28/10', 'phiếu đã dời hạn');
  assert.deepEqual([r3[6], r3[7], r3[8], r3[10]], ['', '', '☐', ''], 'chưa có phiếu: để ghi tay');
  assert.ok(tablesOf(d)[0].rows[0].cells[1].getText().includes('BM-CĐ-03-02'), 'in một tháng dùng mã lịch tháng');
  // In cả năm: mã kế hoạch năm
  ok(c3.call('annual_plan.pdf', { annual_plan_id: id, part: 'OVERVIEW' }));
  d = lastDoc(env);
  assert.ok(tablesOf(d)[0].rows[0].cells[1].getText().includes('BM-CĐ-03-01'));
});

test('sổ hợp đồng thuê ngoài: thêm người phụ trách, dịch vụ gần nhất, hạn dịch vụ kế tiếp, dịch vụ chưa nghiệm thu; mẫu mới "Nhật ký dịch vụ nhà thầu" lọc theo ngày, trạng thái; chi phí theo quyền giá', () => {
  const ctx = setup();
  const { env, c, c3, hd, eq } = ctx;
  const con = uuid(), ce = uuid(), s1 = uuid(), s2 = uuid();
  ok(hd.write('contract.create', { contract_id: con, title_vi: 'Bảo trì máy nén', contract_number: 'HĐ-2026/MNK', start_date: '2026-01-01', end_date: '2026-12-31', value: 120000000,
    owner_user_id: uidOf(env, 'U-HD'),
    equipment: [{ contract_equipment_id: ce, equipment_id: eq, service_vi: 'Thay lọc, dầu', interval_type: 'MONTH', interval_value: 3, next_service_date: '2026-12-15' }],
    services: [{ service_id: s1, contract_equipment_id: ce, due_date: '2026-09-15' }, { service_id: s2, contract_equipment_id: ce, due_date: '2026-10-10' }] }));
  ok(hd.write('contract.service.record', { service_id: s1, performed_at: '2026-09-16', result_vi: 'Rung ổ đỡ tăng, đề nghị thay vòng bi' }, { expected_version: 1 }));
  const rc = ok(c3.call('report.run', { code: 'RPT_CONTRACTS', filters: {} })).data;
  const r = rc.rows[0];
  assert.deepEqual([r.owner, r.last_service_at, r.next_service_date, r.services_open], ['U-HD', '2026-09-16', '2026-12-15', 1]);
  const rs = ok(c3.call('report.run', { code: 'RPT_CONTRACT_SERVICES', filters: { from: '2026-09-01', to: '2026-10-31' } })).data;
  assert.equal(rs.title_vi, 'Nhật ký dịch vụ nhà thầu');
  assert.equal(rs.rows.length, 2);
  assert.deepEqual([rs.rows[0].service_date, rs.rows[0].contract_code, rs.rows[0].equipment_code, rs.rows[0].service_vi, rs.rows[0].result_vi, rs.rows[0].status],
    ['2026-09-16', 'HD-0001', 'TB-0001', 'Thay lọc, dầu', 'Rung ổ đỡ tăng, đề nghị thay vòng bi', 'DONE']);
  assert.equal(rs.rows[1].status, 'PLANNED');
  assert.ok(rs.summary.some((s) => s.label_vi === 'Quá hạn chưa làm' && s.value === 1), 'dịch vụ 10/10 chưa làm');
  assert.equal(ok(c3.call('report.run', { code: 'RPT_CONTRACT_SERVICES', filters: { status: 'DONE' } })).data.rows.length, 1);
  assert.equal(ok(c.call('report.run', { code: 'RPT_CONTRACT_SERVICES', filters: {} })).data.columns.some((x) => x.key === 'cost'), true, 'owner có quyền giá');
  // Người hợp đồng (HĐ) nhận mẫu mới qua đồng bộ
  const defs = (cl) => (cl.call('sync.bootstrap', {}).data.records.REPORT_DEFINITION || []).map((x) => x.code);
  assert.ok(defs(hd).includes('RPT_CONTRACT_SERVICES'));
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_CONTRACT_SERVICES', filters: {} }));
  assert.equal(lastDoc(env).body.children[0].text, 'Nhật ký dịch vụ nhà thầu');
});

test('máy chủ cũ (chưa có mẫu nhật ký dịch vụ): trigger nền 3 giờ tự thêm mẫu, không cần chạy lại migrateSchema; chạy lại không trùng', () => {
  const { env } = setup();
  const sheet = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID')).getSheetByName('ReportDefinitions');
  const rows = env.rows('ReportDefinitions');
  const i = rows.findIndex((x) => x.code === 'RPT_CONTRACT_SERVICES');
  assert.ok(i >= 0);
  sheet.deleteRow(i + 2);
  env.g.dbReset_();
  assert.equal(env.rows('ReportDefinitions').length, 8);
  const rev0 = env.g.readState_().map['table_rev.ReportDefinitions'];
  env.g.runBackgroundJobs();
  env.g.dbReset_();
  assert.equal(env.rows('ReportDefinitions').length, 9);
  assert.ok(env.g.readState_().map['table_rev.ReportDefinitions'] > rev0, 'app nhận mẫu mới qua sync.changes');
  env.g.runBackgroundJobs();
  env.g.dbReset_();
  assert.equal(env.rows('ReportDefinitions').length, 9);
});
