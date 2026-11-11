// d4.35: cửa đọc feed.isoEvidence cho app ISO (hợp đồng HUONG_DAN Phần K repo ISO), mã kết nối FEED_KEY_ISO, bảng ánh xạ
// iso_form_map, mã biểu ISO của mẫu checklist (schema 1.5.6), sổ dừng máy BM-CĐ-04-03 thêm cột Ca và Phản hồi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from '../gas-mock.mjs';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN, pdfHeadOf } from '../helpers.mjs';

const T = (s) => s + ':00+07:00';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const uidOf = (env, code) => env.rows('Users').find((u) => u.employee_code === code).user_id;
const nowIso = (env, minutes = 0) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + minutes * 60000));

function feed(env, key, payload = {}, extra = {}) {
  env.g.dbReset_();
  return env.post({ api_contract_version: '1.0', action: 'feed.isoEvidence', payload: { key, client: 'ISO', ...payload }, device_id: uuid(), app_version: '1.0.0-d2.1', ...extra });
}
/** {mã: {ngày: số}} */
const byCode = (items) => {
  const m = {};
  items.forEach((x) => { (m[x.form_code] = m[x.form_code] || {})[x.date] = x.count; });
  return m;
};

function setup() {
  const env = freshServer({ now: T('2026-10-20T10:00') });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const eq = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }));
  env.g.adminCreateFeedKeyIso();
  return { env, c, c3, kt, eq, ktId: uidOf(env, 'U-KT'), key: env.props.getProperty('FEED_KEY_ISO') };
}

/** Mẫu checklist (có / không mã biểu) → kế hoạch mốc hôm nay → KT làm → C3 nghiệm thu */
function checklist(ctx, extra = {}) {
  const tpl = uuid();
  ok(ctx.c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng ' + tpl.slice(0, 4), items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL' }], ...extra }));
  return tpl;
}
function doneWo(ctx, tpl) {
  const { env, c, c3, kt, eq, ktId } = ctx;
  const plan = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eq, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1,
    anchor_date: env.g.todayVN_(), checklist_template_id: tpl || '', assignee_user_id: ktId }));
  const w = env.rows('WorkOrders').find((x) => x.plan_id === plan);
  const cur = () => env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id).record_version;
  const res = env.rows('WorkOrderResults').filter((r) => r.work_order_id === w.work_order_id).map((r) => ({ result_id: r.result_id, result_status: 'PASS' }));
  ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -60) }, { expected_version: 1 }));
  ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, end_at: nowIso(env, -5), overall_result: 'PASS', results: res }, { expected_version: cur() }));
  ok(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: cur() }));
  ok(c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: cur(), reauth_token: c3.reauth() }));
  return env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id);
}
/** Sự cố có dừng máy: báo → phân công → bắt đầu sửa sau 45 phút → xong → owner nghiệm thu */
function doneRepair(ctx, { stoppedAt } = {}) {
  const { env, c, c3, kt, eq, ktId } = ctx;
  const id = uuid();
  ok(kt.write('repair.report', { repair_id: id, equipment_id: eq, symptom_vi: 'Máy nén nóng', severity: 'HIGH', machine_stopped: true, ...(stoppedAt ? { stopped_at: stoppedAt } : {}) }));
  const rep = env.rows('Repairs').find((x) => x.repair_id === id);
  ok(c3.write('repair.assign', { repair_id: id, assignee_user_id: ktId }, { expected_version: 1 }));
  const start = env.g.isoVN_(new Date(Date.parse(rep.reported_at) + 45 * 60000));
  env.clock.advance(2 * 3600000);
  ok(kt.write('repair.process', { repair_id: id, repair_start_at: start, action_vi: 'Vệ sinh quạt', repair_end_at: nowIso(env, -10), restored_at: nowIso(env, -5), test_run_result: 'PASS' }, { expected_version: 2 }));
  const ver = () => env.rows('Repairs').find((x) => x.repair_id === id).record_version;
  ok(kt.write('repair.submit', { repair_id: id }, { expected_version: ver() }));
  ok(c.write('repair.accept', { repair_id: id, decision: 'PASS' }, { expected_version: ver(), reauth_token: c.reauth() }));
  return env.rows('Repairs').find((x) => x.repair_id === id);
}

test('feed.isoEvidence: mã kết nối riêng FEED_KEY_ISO (adminCreateFeedKeyIso in ra nhật ký, chạy lại giữ mã); thiếu / sai mã / mã Checksheet → FORBIDDEN', () => {
  const env = freshServer();
  ownerClient(env);
  assert.equal(feed(env, 'x'.repeat(43)).code, 'FORBIDDEN', 'chưa tạo mã');
  env.g.adminCreateFeedKey();
  env.g.adminCreateFeedKeyIso();
  const key = env.props.getProperty('FEED_KEY_ISO');
  assert.ok(key && key.length >= 40);
  assert.notEqual(key, env.props.getProperty('FEED_KEY_CS'), 'khác mã của Checksheet');
  assert.match(env.logs.join('\n'), new RegExp('Mã kết nối cho app ISO: ' + key.replace(/[-]/g, '\\-')));
  env.g.adminCreateFeedKeyIso();
  assert.equal(env.props.getProperty('FEED_KEY_ISO'), key, 'chạy lại không đổi mã');
  assert.equal(feed(env, '').code, 'FORBIDDEN');
  assert.equal(feed(env, key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A')).code, 'FORBIDDEN');
  assert.equal(feed(env, env.props.getProperty('FEED_KEY_CS')).code, 'FORBIDDEN', 'mã Checksheet không mở được cửa ISO');
  const r = ok(feed(env, key));
  assert.deepEqual(Object.keys(r.data).sort(), ['app_id', 'items', 'server_time']);
  assert.equal(r.data.app_id, 'ME');
  assert.ok(Array.isArray(r.data.items));
  // device_id phải là UUID v4; không theo phiên bản app M&E tối thiểu
  env.g.dbReset_();
  assert.equal(env.post({ api_contract_version: '1.0', action: 'feed.isoEvidence', payload: { key }, device_id: 'abc', app_version: '1.0.0-d2.1' }).code, 'VALIDATION_ERROR');
  env.g.withWriteLock_(() => env.g.writeSetting_('min_client_version', '9.0.0', 'TEST'));
  env.g.cache_().remove('cfg:settings');
  assert.equal(feed(env, key).ok, true);
  env.g.dbReset_();
  const h = env.g.healthRows_();
  assert.equal(h.find((x) => x.key === 'iso_feed').value, 'ON');
  assert.equal(h.find((x) => x.key === 'checksheet_feed').value, 'ON');
  // Bảo trì → SYSTEM_MAINTENANCE (app ISO báo "app kia đang bảo trì")
  env.props.setProperty('MAINTENANCE_MODE', 'true');
  env.g.cache_().remove('sys:props');
  assert.equal(feed(env, key).code, 'SYSTEM_MAINTENANCE');
});

test('feed.isoEvidence: ngày có hồ sơ theo bảng ánh xạ mặc định — thiết bị, phiếu BT theo mã checklist (không mã → 03-03), sự cố 04-01/02/03, kiểm định, hiệu chuẩn, dịch vụ HĐ, vật tư, chỉ số, báo cáo đã lưu; không trả gì khác', () => {
  const ctx = setup();
  const { env, c, c3, eq, key } = ctx;
  const today = env.g.todayVN_();
  assert.equal(today, '2026-10-20');
  const tplA = checklist(ctx, { form_code: ' BM-CĐ-03-03a ' });
  assert.equal(env.rows('ChecklistTemplates').find((r) => r.template_id === tplA).form_code, 'BM-CĐ-03-03a', 'cắt khoảng trắng');
  const tplN = checklist(ctx);
  const tplK = checklist(ctx, { form_code: 'BM-CĐ-07-08' });
  doneWo(ctx, tplA);
  doneWo(ctx, tplN);
  doneWo(ctx, tplK);
  doneWo(ctx, '');
  const rep = doneRepair(ctx);
  // Sự cố hủy không tính
  const cancelled = uuid();
  ok(ctx.kt.write('repair.report', { repair_id: cancelled, equipment_id: eq, symptom_vi: 'Báo nhầm', severity: 'LOW' }));
  ok(ctx.kt.write('repair.cancel', { repair_id: cancelled, reason: 'Báo nhầm' }, { expected_version: 1 }));
  // Kiểm định: loại thường và loại Hiệu chuẩn (06-05 tính cả hai, 06-01 chỉ hiệu chuẩn)
  const types = {};
  for (const [code, name] of [['AP_LUC', 'Kiểm định bình chịu áp lực'], ['HC', 'Hiệu chuẩn đồng hồ áp suất']]) {
    const t = uuid(); types[code] = t;
    ok(c.write('inspection.type.edit', { inspection_type_id: t, code, name_vi: name, default_interval_months: 12, required_docs_vi: 'Biên bản' }));
    const rq = uuid();
    ok(c.write('inspection.requirement.edit', { requirement_id: rq, equipment_id: eq, inspection_type_id: t }));
    const id = uuid();
    ok(c.write('inspection.submit', { inspection_id: id, requirement_id: rq, inspection_date: code === 'HC' ? '2026-10-05' : '2026-10-01', valid_from: '2026-10-01', valid_to: '2027-09-30', result: 'PASS', certificate_number: 'CN-' + code }));
    ok(c3.write('inspection.approve', { inspection_id: id, decision: 'APPROVE' }, { expected_version: 1, reauth_token: c3.reauth() }));
  }
  // Vật tư
  ok(c.write('material.create', { material_id: uuid(), name_vi: 'Mỡ bôi trơn', base_unit: 'kg' }));
  // Chỉ số điện nước
  const m = uuid();
  ok(c.write('meter.edit', { meter_id: m, name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_5', opening_value: 100, opening_at: T('2026-10-01T07:00') }));
  ok(c.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-06T07:30'), cumulative_value: 250 }));
  // Báo cáo đã lưu: sự cố (14-01 tính), thiết bị (không tính)
  ok(c3.write('report.save', { report_run_id: uuid(), code: 'RPT_REPAIRS', filters: {} }));
  ok(c3.write('report.save', { report_run_id: uuid(), code: 'RPT_EQUIPMENT', filters: {} }));
  // Dịch vụ hợp đồng (ghi thẳng bảng: luồng hợp đồng đã có test riêng); dòng PLANNED và dòng quá 400 ngày không tính
  const g = env.g;
  g.dbReset_();
  const base = { contract_id: uuid(), contract_equipment_id: uuid(), dataset_epoch: env.props.getProperty('DATASET_EPOCH'), record_version: 1, created_at: T('2026-10-10T09:00'), updated_at: T('2026-10-10T09:00') };
  g.withWriteLock_(() => g.insertRows_('ContractServices', [
    { ...base, service_id: uuid(), due_date: '2026-10-10', performed_at: '2026-10-09', status: 'DONE' },
    { ...base, service_id: uuid(), due_date: '2026-10-12', performed_at: '', status: 'PLANNED' },
    { ...base, service_id: uuid(), due_date: '2025-01-01', performed_at: '2025-01-02', status: 'ACCEPTED' }]));
  g.withWriteLock_(() => { const st = g.readState_(); g.stateWrite_(st, { 'table_rev.ContractServices': ['INT', Number(g.stateGet_(st, 'sync_revision', 0)) + 1] }, 'TEST'); });

  const r = ok(feed(env, ctx.key));
  const items = r.data.items;
  assert.ok(items.every((x) => Object.keys(x).sort().join() === 'count,date,form_code'), 'chỉ mã biểu, ngày, số lượt');
  assert.ok(items.every((x) => x.count >= 1 && x.date >= '2025-09-15' && x.date <= today));
  const m2 = byCode(items);
  assert.ok(m2['BM-CĐ-02-01'][today] >= 1 && m2['BM-CĐ-02-02'][today] >= 1);
  assert.equal(m2['BM-CĐ-03-03a'][today], 1, 'phiếu BT của checklist có mã → mã checklist');
  assert.equal(m2['BM-CĐ-07-08'][today], 1, 'checklist mang mã 07-08');
  assert.equal(m2['BM-CĐ-03-03'][today], 2, 'checklist không mã + phiếu không checklist → 03-03');
  assert.ok(m2['BM-CĐ-03-01'][today] >= 4 && m2['BM-CĐ-03-02'][today] >= 4, '4 kế hoạch tạo hôm nay');
  const repDay = rep.reported_at.slice(0, 10), doneDay = rep.approved_at.slice(0, 10);
  assert.equal(m2['BM-CĐ-04-01'][repDay], 1, 'sự cố hủy không tính');
  assert.equal(m2['BM-CĐ-04-02'][doneDay], 1);
  assert.equal(m2['BM-CĐ-04-03'][doneDay], 1);
  assert.deepEqual(m2['BM-CĐ-06-05'], { '2026-10-01': 1, '2026-10-05': 1 });
  assert.deepEqual(m2['BM-CĐ-06-01'], { '2026-10-05': 1 }, 'chỉ loại Hiệu chuẩn');
  assert.deepEqual(m2['BM-CĐ-05-06'], { '2026-10-09': 1 }, 'dịch vụ đã làm; quá 400 ngày, chưa làm không tính');
  assert.equal(m2['BM-CĐ-05-01'][today], 1);
  assert.ok(m2['BM-CĐ-08-01']['2026-10-06'] >= 1 && m2['BM-CĐ-08-01']['2026-10-01'] >= 1, 'chỉ số ban đầu + lần đọc');
  assert.deepEqual(m2['BM-CĐ-14-01'], { [today]: 1 }, 'chỉ báo cáo bảo trì / sửa chữa đã lưu');
  assert.ok(!m2['BM-CĐ-09-09'], 'chưa có loại dụng cụ an toàn');
  // since: ngày trong khoảng → chỉ từ ngày đó; dạng sai / quá cũ → hôm nay − 400 (không báo lỗi)
  const s1 = ok(feed(env, ctx.key, { since: '2026-10-06' })).data.items;
  assert.ok(s1.every((x) => x.date >= '2026-10-06'));
  assert.ok(!byCode(s1)['BM-CĐ-06-05']);
  assert.equal(ok(feed(env, ctx.key, { since: '06/10/2026' })).data.items.length, items.length);
  assert.equal(ok(feed(env, ctx.key, { since: '2020-01-01' })).data.items.length, items.length);
  // Sắp theo mã rồi ngày, mỗi cặp một dòng
  const keys = items.map((x) => x.form_code + '|' + x.date);
  assert.equal(new Set(keys).size, keys.length);
});

test('iso_form_map: C4 + PIN; nguồn sai → VALIDATION_ERROR; chuẩn hóa; xem trước (C4) với bản nháp; feed theo bảng đã lưu; checklist không mã khi bỏ dòng WO_ACCEPTED thì không tính', () => {
  const ctx = setup();
  const { env, c, c3 } = ctx;
  doneWo(ctx, checklist(ctx));
  const edit = (map) => c.write('settings.edit', { changes: { iso_form_map: map }, reason: 'ISO' }, { reauth_token: c.reauth() });
  assert.equal(c3.write('settings.edit', { changes: { iso_form_map: {} } }, { reauth_token: c3.reauth() }).code, 'FORBIDDEN');
  assert.equal(edit({ 'BM-1': 'KHONG_CO' }).code, 'VALIDATION_ERROR');
  assert.equal(edit({ 'BM-1': 'EQUIPMENT_EDIT:x' }).code, 'VALIDATION_ERROR', 'nguồn không có tham số');
  assert.equal(edit({ 'BM-1': 'METER_READING:GAS' }).code, 'VALIDATION_ERROR');
  assert.equal(edit({ ['B'.repeat(41)]: 'WO_ACCEPTED' }).code, 'VALIDATION_ERROR');
  assert.equal(edit(['WO_ACCEPTED']).code, 'VALIDATION_ERROR');
  const r = ok(edit({ ' BM-BT-01 ': 'wo_accepted', 'BM-DN-01': 'meter_reading: water , electricity', 'BM-X': '' }));
  assert.deepEqual(r.data.settings.find((s) => s.key === 'iso_form_map').value, { 'BM-BT-01': 'WO_ACCEPTED', 'BM-DN-01': 'METER_READING:WATER,ELECTRICITY' });
  const items = byCode(ok(feed(env, ctx.key)).data.items);
  assert.deepEqual(Object.keys(items), ['BM-BT-01'], 'chỉ mã trong bảng đã lưu');
  // Xem trước: C3 không được; C4 xem bảng đang lưu và bản nháp
  assert.equal(c3.call('iso.feed.preview', {}).code, 'FORBIDDEN');
  const p0 = ok(c.call('iso.feed.preview', {})).data;
  assert.equal(p0.key_set, true);
  assert.equal(p0.default_map['BM-CĐ-04-03'], 'REPAIR_COMPLETED');
  assert.ok(p0.sources.find((s) => s.key === 'INSPECTION').arg === 'types');
  assert.deepEqual(p0.stats.map((s) => [s.form_code, s.days, s.count]), [['BM-BT-01', 1, 1]]);
  const p1 = ok(c.call('iso.feed.preview', { map: { 'BM-TB': 'EQUIPMENT_EDIT' } })).data;
  assert.deepEqual(p1.stats.map((s) => s.form_code), ['BM-TB'], 'phiếu BT không tính khi bảng nháp không có dòng WO_ACCEPTED');
  assert.equal(c.call('iso.feed.preview', { map: { 'BM-TB': 'SAI' } }).code, 'VALIDATION_ERROR');
  // Bảng trống → chỉ mã của checklist
  ok(edit({}));
  assert.deepEqual(ok(feed(env, ctx.key)).data.items, []);
});

test('mã biểu ISO của checklist: sửa = phiên bản mới, không gửi thì giữ mã; mã sai → VALIDATION_ERROR; PDF phiếu BT in mã của checklist; schema cũ (chưa migrateSchema 1.5.6) bỏ qua mã', () => {
  const ctx = setup();
  const { env, c, c3 } = ctx;
  const tpl = checklist(ctx, { form_code: 'BM-CĐ-03-03b' });
  const items = [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL' }, { label_vi: 'Vệ sinh lọc', result_type: 'PASS_FAIL' }];
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, items }, { expected_version: 1 }));
  const rev2 = env.rows('ChecklistTemplates').filter((r) => r.template_id === tpl && r.revision === 2);
  assert.ok(rev2.length === 2 && rev2.every((r) => r.form_code === 'BM-CĐ-03-03b'), 'không gửi mã → giữ mã cũ');
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, items, form_code: 'X'.repeat(41) }, { expected_version: 2 }).code, 'VALIDATION_ERROR');
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, items, form_code: 12 }, { expected_version: 2 }).code, 'VALIDATION_ERROR');
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, items, form_code: '' }, { expected_version: 2 }));
  assert.ok(env.rows('ChecklistTemplates').filter((r) => r.revision === 3).every((r) => r.form_code === ''), 'xóa mã');
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, items, form_code: 'BM-CĐ-03-03c' }, { expected_version: 3 }));
  const wo = doneWo(ctx, tpl);
  assert.deepEqual(Object.keys(byCode(ok(feed(env, ctx.key)).data.items)).filter((k) => k.startsWith('BM-CĐ-03-03')), ['BM-CĐ-03-03c'], 'mã của bản mới nhất');
  // PDF phiếu BT: mã của checklist thay mã chung WORK_ORDER
  ok(c.write('settings.edit', { changes: { pdf_form_codes: { WORK_ORDER: 'BM-CĐ-03-03' } } }, { reauth_token: c.reauth() }));
  ok(c3.call('export.pdf', { entity_type: 'WORK_ORDER', entity_id: wo.work_order_id }));
  assert.ok(pdfHeadOf([...env.drive._docs.values()].pop()).codes.includes('BM-CĐ-03-03c'));
  // Excel mẫu kế hoạch: sheet checklists có cột form_code; xuất ra có mã
  const tmpl = ok(c.call('import.template', { template_key: 'maintenance_plans' })).data;
  const sh = (tmpl.sheets || []).find((s) => s.name === 'checklists');
  assert.ok(sh.cols.some((x) => x.key === 'form_code'), JSON.stringify(sh.cols.map((x) => x.key)));
  // Schema cũ: releasedDot_ = 5 → mã gửi lên bị bỏ qua (cột chưa có), feed tính phiếu BT cho 03-03
  const g = env.g;
  g.dbReset_();
  g.withWriteLock_(() => g.stateWrite_(g.readState_(), { schema_version: ['STRING', '1.5.5'] }, 'TEST'));
  g.cache_().remove('sys:state');
  g.dbReset_();
  assert.equal(g.releasedDot_(), 5);
  const tpl2 = uuid();
  ok(c.write('maintenance.checklist.edit', { template_id: tpl2, template_name_vi: 'Mẫu cũ', items, form_code: 'BM-CĐ-03-03d' }));
  assert.ok(env.rows('ChecklistTemplates').filter((r) => r.template_id === tpl2).every((r) => !r.form_code));
  const m = byCode(ok(feed(env, ctx.key)).data.items);
  assert.ok(m['BM-CĐ-03-03'] && !m['BM-CĐ-03-03c'], 'schema cũ: không đọc mã checklist');
});

test('sổ dừng máy BM-CĐ-04-03 (RPT_REPAIRS): cột Ca theo giờ máy dừng và Phản hồi (phút) từ lúc báo tới lúc bắt đầu sửa; shift_starts sửa được, kiểm dạng', () => {
  const ctx = setup();
  const { env, c, c3 } = ctx;
  const r1 = doneRepair(ctx); // báo 10:00 → ca 1 (06:00–14:00), bắt đầu sửa sau 45 phút
  const r2 = doneRepair(ctx, { stoppedAt: T('2026-10-20T03:30') }); // máy dừng 03:30 → ca 3 (22:00–06:00, ca đêm hôm trước)
  const run = () => ok(c3.call('report.run', { code: 'RPT_REPAIRS', filters: {} })).data;
  let d = run();
  const keys = d.columns.map((x) => x.key);
  assert.ok(keys.indexOf('shift') === keys.indexOf('reported_at') + 1, 'Ca ngay sau Báo lúc');
  assert.ok(keys.indexOf('response_minutes') === keys.indexOf('repair_start_at') + 1, 'Phản hồi ngay sau Bắt đầu sửa');
  const col = d.columns.find((x) => x.key === 'shift');
  assert.deepEqual([col.label_vi, col.label_zh], ['Ca', '班次']);
  assert.deepEqual([d.columns.find((x) => x.key === 'response_minutes').label_vi, d.columns.find((x) => x.key === 'response_minutes').label_zh], ['Phản hồi (phút)', '响应时间（分钟）']);
  const row = (rep) => d.rows.find((x) => x.repair_code === rep.repair_code);
  assert.equal(row(r1).shift, '1');
  assert.equal(row(r1).response_minutes, 45);
  assert.equal(row(r2).shift, '3');
  // Hai ca 12 giờ: 07:00 / 19:00 → 10:00 ca 1, 03:30 ca 2
  const set = (v) => c.write('settings.edit', { changes: { shift_starts: v }, reason: 'ca' }, { reauth_token: c.reauth() });
  assert.equal(set('14:00,06:00').code, 'VALIDATION_ERROR', 'phải tăng dần');
  assert.equal(set('25:00').code, 'VALIDATION_ERROR');
  assert.equal(set('').code, 'VALIDATION_ERROR');
  const r = ok(set(' 7:00 , 19:00'));
  assert.equal(r.data.settings.find((s) => s.key === 'shift_starts').value, '07:00,19:00');
  d = run();
  assert.equal(row(r1).shift, '1');
  assert.equal(row(r2).shift, '2');
  // Excel / PDF dùng cùng cột: PDF có tiêu đề cột Ca
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_REPAIRS', filters: {} }));
  const doc = [...env.drive._docs.values()].pop();
  const txt = JSON.stringify(doc.body.children.filter((x) => x.kind === 'table').map((t) => Array.from(t.rows[0].cells, (cl) => cl.getText())));
  assert.ok(txt.includes('Ca') && txt.includes('Phản hồi (phút)'), txt.slice(0, 400));
});

test('nâng máy chủ 1.5.5 → 1.5.6: migrateSchema thêm cột ChecklistTemplates.form_code và 2 khóa Settings; trước khi migrate chạy như đợt 5', () => {
  const env = loadServer();
  const g = env.g;
  g.RELEASED_DOT = 5;
  g.SCHEMA_VERSION = '1.5.5';
  g.SHEETS.ChecklistTemplates.cols = g.SHEETS.ChecklistTemplates.cols.replace(' form_code', '');
  g.schemaCache_ && Object.keys(g.schemaCache_).forEach((k) => delete g.schemaCache_[k]);
  env.props.setProperty('ENV', 'THAT');
  g.setup();
  const biz = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID'));
  const hdr = () => { const s = biz.getSheetByName('ChecklistTemplates'); return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0]; };
  assert.ok(!hdr().includes('form_code'));
  g.RELEASED_DOT = 6;
  g.SCHEMA_VERSION = '1.5.6';
  g.SHEETS.ChecklistTemplates.cols += ' form_code';
  Object.keys(g.schemaCache_ || {}).forEach((k) => delete g.schemaCache_[k]);
  g.dbReset_();
  assert.equal(g.releasedDot_(), 5, 'dán Code.gs mới, chưa migrateSchema');
  g.migrateSchema();
  g.dbReset_();
  assert.ok(hdr().includes('form_code'));
  assert.equal(g.releasedDot_(), 6);
  const keys = env.rows('Settings').map((x) => x.setting_key);
  assert.ok(keys.includes('iso_form_map') && keys.includes('shift_starts'));
  assert.equal(g.readState_().map.schema_version, '1.5.6');
});
