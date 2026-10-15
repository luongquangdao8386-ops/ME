// Lộ điện Đợt 3: nguồn → tủ → lộ → phụ tải; tủ nối hồ sơ Thiết bị (B2); kiểm khi lưu; truy đường cấp; xác minh; bản vẽ (3.13, 4.4.7, 6.9.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN, fakePdfB64 } from '../helpers.mjs';

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const dn = userClient(env, 'U-DN', 2, '583017', 'DOC_DIEN_NUOC');
  return { env, c, c3, kt, dn };
}

function eq(c, name, extra = {}) {
  const id = uuid();
  const r = c.write('equipment.create', { equipment_id: id, name_vi: name, ...extra });
  assert.equal(r.ok, true, JSON.stringify(r));
  return id;
}
const panel = (c, extra = {}) => { const id = uuid(); return { id, r: c.write('circuit.edit', { entity: 'PANEL', panel_id: id, name_vi: 'Tủ', panel_type: 'DISTRIBUTION_BOARD', ...extra }) }; };
const circuit = (c, panelId, extra = {}) => { const id = uuid(); return { id, r: c.write('circuit.edit', { entity: 'CIRCUIT', circuit_id: id, panel_id: panelId, name_vi: 'Lộ', ...extra }) }; };
const load = (c, circuitId, extra = {}) => { const id = uuid(); return { id, r: c.write('circuit.edit', { entity: 'LOAD', load_link_id: id, circuit_id: circuitId, ...extra }) }; };
const ok = (x) => { assert.equal(x.r.ok, true, JSON.stringify(x.r)); return x.id; };
const code = (x) => (x.r.errors || [])[0]?.code || x.r.code;
const trace = (c, t) => { const r = c.call('circuit.view', { trace: t }); assert.equal(r.ok, true, JSON.stringify(r)); return r.data.paths; };
const codes = (path) => path.nodes.map((n) => n.code).join(' > ');

/** Lưới → MBA → MSB → DB (nối thiết bị) → máy nén; máy phát → DB dự phòng */
function plant(c) {
  const eqDb = eq(c, 'Tủ phân phối DB1');
  const eqM = eq(c, 'Máy nén khí 37 kW');
  const G = ok(panel(c, { name_vi: 'Điểm nhận lưới 22 kV', panel_type: 'SOURCE_GRID' }));
  const T = ok(panel(c, { name_vi: 'MBA 1000 kVA', panel_type: 'SOURCE_TRANSFORMER' }));
  const MSB = ok(panel(c, { name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' }));
  const DB = ok(panel(c, { name_vi: 'Tủ DB1', equipment_id: eqDb }));
  const GEN = ok(panel(c, { name_vi: 'Máy phát 500 kVA', panel_type: 'SOURCE_GENERATOR' }));
  const c1 = ok(circuit(c, G, { name_vi: 'Lộ lưới → MBA' }));
  ok(load(c, c1, { downstream_panel_id: T }));
  const c2 = ok(circuit(c, T, { name_vi: 'Lộ MBA → MSB' }));
  ok(load(c, c2, { downstream_panel_id: MSB }));
  const c3 = ok(circuit(c, MSB, { name_vi: 'Lộ MSB → DB1' }));
  ok(load(c, c3, { downstream_panel_id: DB }));
  const c4 = ok(circuit(c, GEN, { name_vi: 'Lộ máy phát → DB1' }));
  ok(load(c, c4, { downstream_panel_id: DB, supply_role: 'BACKUP' }));
  const c5 = ok(circuit(c, DB, { name_vi: 'Lộ máy nén', breaker_rating_a: 100, cable_section_mm2: '4 x 35' }));
  ok(load(c, c5, { equipment_id: eqM, rated_load_kw: 37 }));
  return { eqDb, eqM, G, T, MSB, DB, GEN, c1, c2, c3, c4, c5 };
}

test('tủ TU-0001 và lộ LO-0001 có QR; tiết diện chuẩn hóa "4×35"; KT không sửa lộ điện, C1 xem được; tủ thiếu loại → REQUIRED', () => {
  const { env, c, kt } = setup();
  const p = panel(c, { name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' });
  assert.equal(p.r.ok, true, JSON.stringify(p.r));
  assert.equal(p.r.data.display_code, 'TU-0001');
  assert.ok(p.r.data.qr_key);
  const l = circuit(c, p.id, { cable_section_mm2: '4 x 35', phases: 3, voltage: 400 });
  assert.equal(l.r.data.display_code, 'LO-0001');
  assert.equal(l.r.data.record.cable_section_mm2, '4×35');
  assert.equal(l.r.data.record.status, 'IN_USE');
  assert.equal(env.rows('QrRegistry').filter((q) => q.entity_type === 'CIRCUIT').length, 1);
  assert.equal(code(panel(kt)), 'FORBIDDEN');
  assert.equal(code(panel(c, { panel_type: '' })), 'REQUIRED');
  const c1 = userClient(env, 'U-C1', 1, '702913');
  const v = c1.call('circuit.view', {});
  assert.equal(v.ok, true);
  assert.equal(v.data.panels.length, 1);
  assert.equal(v.data.circuits[0].qr_key, l.r.data.qr_key);
});

test('B2: tủ nối hồ sơ thiết bị — khu vực theo thiết bị (cả khi thiết bị đổi khu vực), một thiết bị một tủ, mở tủ thấy sửa chữa của thiết bị', () => {
  const { env, c, kt } = setup();
  const a = uuid(), b = uuid();
  assert.equal(c.write('location.edit', { location_id: a, name_vi: 'Xưởng A', type: 'WORKSHOP' }).ok, true);
  assert.equal(c.write('location.edit', { location_id: b, name_vi: 'Xưởng B', type: 'WORKSHOP' }).ok, true);
  const e = eq(c, 'Tủ điện xưởng A', { location_id: a });
  const p = panel(c, { name_vi: 'Tủ DB-A', equipment_id: e, location_id: b });
  assert.equal(p.r.ok, true, JSON.stringify(p.r));
  assert.equal(p.r.data.record.location_id, a, 'khu vực của tủ lấy theo thiết bị');
  assert.equal(code(panel(c, { name_vi: 'Tủ khác', equipment_id: e })), 'PANEL_EQUIPMENT_TAKEN');
  // Thiết bị đổi khu vực → tủ đổi theo
  const ev = env.rows('Equipment').find((x) => x.equipment_id === e).record_version;
  assert.equal(c.write('equipment.edit', { equipment_id: e, location_id: b }, { expected_version: ev }).ok, true);
  assert.equal(env.rows('Panels').find((x) => x.panel_id === p.id).location_id, b);
  // Sự cố ghi trên hồ sơ thiết bị; hồ sơ tủ mở ra thấy sự cố đó (không có cột panel_id ở Repairs)
  const rid = uuid();
  assert.equal(kt.write('repair.report', { repair_id: rid, equipment_id: e, symptom_vi: 'Aptomat nhảy', severity: 'HIGH' }).ok, true);
  const pv = c.call('circuit.view', {}).data.panels.find((x) => x.panel_id === p.id);
  const reps = c.call('repair.view', { filters: { equipment_id: pv.equipment_id } });
  assert.equal(reps.data.items.length, 1);
  assert.equal(reps.data.items[0].repair_id, rid);
  // Thiết bị nối tủ không làm phụ tải trực tiếp; nối tủ với thiết bị đang là phụ tải → từ chối
  const src = ok(panel(c, { name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' }));
  const lc = ok(circuit(c, src));
  assert.equal(code(load(c, lc, { equipment_id: e })), 'PANEL_EQUIPMENT_AS_LOAD');
  const m = eq(c, 'Quạt hút');
  ok(load(c, lc, { equipment_id: m }));
  assert.equal(code(panel(c, { name_vi: 'Tủ quạt', equipment_id: m })), 'PANEL_EQUIPMENT_AS_LOAD');
});

test('kiểm khi lưu: chọn đúng một đích; trùng phụ tải; lưới/máy phát không nhận nguồn từ lộ; vòng lộ ↔ lộ và tủ ↔ lộ → CIRCUIT_LOOP', () => {
  const { c } = setup();
  const x = plant(c);
  assert.equal(code(load(c, x.c5, {})), 'LOAD_TARGET_ONE');
  assert.equal(code(load(c, x.c5, { equipment_id: x.eqM })), 'LOAD_DUPLICATE');
  assert.equal(code(load(c, x.c3, { downstream_panel_id: x.G })), 'PANEL_SOURCE_FED');
  // Đổi MBA (đang được lộ cấp vào) thành máy phát → từ chối
  const tv = c.call('circuit.view', {}).data.panels.find((p) => p.panel_id === x.T).record_version;
  const r = c.write('circuit.edit', { entity: 'PANEL', panel_id: x.T, panel_type: 'SOURCE_GENERATOR' }, { expected_version: tv });
  assert.equal(r.errors[0].code, 'PANEL_SOURCE_FED');
  // Lộ của DB1 cấp ngược lên MSB → vòng
  assert.equal(code(load(c, x.c5, { downstream_panel_id: x.MSB })), 'CIRCUIT_LOOP');
  // Lộ con: c6 dưới c5; đặt c5 dưới c6 → vòng
  const c6 = ok(circuit(c, x.DB, { upstream_circuit_id: x.c5, supply_role: 'PRIMARY' }));
  const v5 = c.call('circuit.view', {}).data.circuits.find((k) => k.circuit_id === x.c5).record_version;
  const r2 = c.write('circuit.edit', { entity: 'CIRCUIT', circuit_id: x.c5, upstream_circuit_id: c6 }, { expected_version: v5 });
  assert.equal(r2.errors[0].code, 'CIRCUIT_LOOP');
  // Lộ của DB1 nhưng tủ đặt là chính tủ nó cấp (DB1 → ... → DB1)
  const p2 = ok(panel(c, { name_vi: 'Tủ con' }));
  const c7 = ok(circuit(c, x.DB));
  ok(load(c, c7, { downstream_panel_id: p2 }));
  const v7 = c.call('circuit.view', {}).data.circuits.find((k) => k.circuit_id === c7).record_version;
  assert.equal(c.write('circuit.edit', { entity: 'CIRCUIT', circuit_id: c7, panel_id: p2 }, { expected_version: v7 }).errors[0].code, 'CIRCUIT_LOOP');
  // Tủ còn lộ thì không lưu trữ được
  const dv = c.call('circuit.view', {}).data.panels.find((p) => p.panel_id === x.DB).record_version;
  assert.equal(c.write('circuit.edit', { entity: 'PANEL', panel_id: x.DB, archive: true }, { expected_version: dv }).errors[0].code, 'IN_USE');
});

test('truy đường cấp: từ máy nén lên tới lưới (không dừng ở MBA/MSB) và đường dự phòng qua máy phát; lọc PRIMARY/BACKUP; từ thiết bị nối tủ bắt đầu ở tủ', () => {
  const { c } = setup();
  const x = plant(c);
  const all = trace(c, { equipment_id: x.eqM, supply_role: 'ALL' });
  assert.equal(all.length, 2);
  const main = all.find((p) => p.nodes[p.nodes.length - 1].id === x.G);
  assert.ok(main, 'đường chính tới điểm nhận lưới');
  assert.equal(main.status, 'OK');
  assert.deepEqual(main.nodes.map((n) => n.type), ['EQUIPMENT', 'CIRCUIT', 'PANEL', 'CIRCUIT', 'PANEL', 'CIRCUIT', 'PANEL', 'CIRCUIT', 'PANEL']);
  assert.equal(codes(main).split(' > ').length, 9);
  const backup = all.find((p) => p.nodes[p.nodes.length - 1].id === x.GEN);
  assert.equal(backup.status, 'OK');
  assert.ok(backup.roles.includes('BACKUP'));
  const pri = trace(c, { equipment_id: x.eqM, supply_role: 'PRIMARY' });
  assert.equal(pri.length, 1);
  assert.equal(pri[0].nodes[pri[0].nodes.length - 1].id, x.G);
  const bk = trace(c, { equipment_id: x.eqM, supply_role: 'BACKUP' });
  assert.equal(bk.length, 1, 'đường dự phòng hiện đủ từ máy nén, không chỉ cạnh dự phòng');
  assert.equal(bk[0].nodes[0].id, x.eqM);
  assert.equal(bk[0].nodes[bk[0].nodes.length - 1].id, x.GEN);
  // Thiết bị của tủ DB1 → bắt đầu ở tủ DB1
  const fromEq = trace(c, { equipment_id: x.eqDb, supply_role: 'PRIMARY' });
  assert.equal(fromEq[0].nodes[1].id, x.DB);
  // Lộ đầu vào một tủ thường không có nguồn → ROOT_NOT_SOURCE
  const lone = ok(panel(c, { name_vi: 'Tủ chưa nối' }));
  const lc = ok(circuit(c, lone));
  const r = trace(c, { circuit_id: lc, supply_role: 'ALL' });
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'ROOT_NOT_SOURCE');
  assert.equal(c.call('circuit.view', { trace: { panel_id: uuid() } }).code, 'NOT_FOUND');
});

test('dữ liệu cũ có vòng (ghi tay vào sheet) → CYCLE_DETECTED, không treo', () => {
  const { env, c } = setup();
  const p = ok(panel(c, { name_vi: 'Tủ', panel_type: 'MAIN_SWITCHBOARD' }));
  const a = ok(circuit(c, p, { name_vi: 'A' }));
  const b = ok(circuit(c, p, { name_vi: 'B', upstream_circuit_id: a }));
  const g = env.g;
  g.dbReset_();
  g.withWriteLock_(() => { const r = g.readRows_('Circuits').find((x) => x.circuit_id === a); g.writeCells_('Circuits', r.__row, { upstream_circuit_id: b }); });
  const paths = trace(c, { circuit_id: b, supply_role: 'ALL' });
  assert.equal(paths.length, 1);
  assert.equal(paths[0].status, 'CYCLE_DETECTED');
});

test('xác minh (PIN, không phải người sửa cuối): C3 sửa → owner xác minh; C3 tự xác minh → FORBIDDEN; sửa dữ liệu kỹ thuật hoặc phụ tải thì mất xác minh', () => {
  const { env, c, c3 } = setup();
  const p = ok(panel(c3, { name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' }));
  const l = ok(circuit(c3, p, { breaker_rating_a: 250 }));
  const ver = (id) => env.rows('Circuits').find((x) => x.circuit_id === id).record_version;
  assert.equal(c3.write('circuit.verify', { entity: 'CIRCUIT', id: l }, { expected_version: ver(l), reauth_token: c3.reauth() }).code, 'FORBIDDEN');
  const noPin = c.write('circuit.verify', { entity: 'CIRCUIT', id: l }, { expected_version: ver(l) });
  assert.equal(noPin.code, 'REAUTH_REQUIRED');
  const v = c.write('circuit.verify', { entity: 'CIRCUIT', id: l }, { expected_version: ver(l), reauth_token: c.reauth() });
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.ok(v.data.record.verified_at);
  const row = env.rows('Circuits').find((x) => x.circuit_id === l);
  assert.equal(row.updated_by, env.rows('Users').find((u) => u.employee_code === 'U-C3').user_id, 'xác minh không đổi người sửa cuối');
  // Thêm phụ tải → lộ mất xác minh
  const m = eq(c, 'Bơm nước');
  ok(load(c3, l, { equipment_id: m }));
  assert.equal(env.rows('Circuits').find((x) => x.circuit_id === l).verified_by, '');
  // Xác minh lại rồi sửa aptomat → mất xác minh
  assert.equal(c.write('circuit.verify', { entity: 'CIRCUIT', id: l }, { expected_version: ver(l), reauth_token: c.reauth() }).ok, true);
  assert.equal(c3.write('circuit.edit', { entity: 'CIRCUIT', circuit_id: l, breaker_rating_a: 200 }, { expected_version: ver(l) }).ok, true);
  assert.equal(env.rows('Circuits').find((x) => x.circuit_id === l).verified_at, '');
});

test('bản vẽ: KT tải lên (chờ duyệt, phiên bản 1, 2…); chỉ người tải và người duyệt thấy bản nháp; duyệt bản mới thay bản cũ; từ chối cần lý do; doc.upload DRAWING vào tủ bị chặn', () => {
  const { env, c, c3, kt, dn } = setup();
  const p = ok(panel(c, { name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' }));
  const up = (cl, title) => {
    const id = uuid();
    const r = cl.write('circuit.drawing.upload', { document_id: id, entity_type: 'PANEL', entity_id: p, mime_type: 'application/pdf', content_b64: fakePdfB64(), title_vi: title });
    assert.equal(r.ok, true, JSON.stringify(r));
    return id;
  };
  assert.equal(c.write('doc.upload', { document_id: uuid(), entity_type: 'PANEL', entity_id: p, kind: 'DRAWING', mime_type: 'application/pdf', content_b64: fakePdfB64(), title_vi: 'x' }).errors[0].field, 'kind');
  assert.equal(dn.write('circuit.drawing.upload', { document_id: uuid(), entity_type: 'PANEL', entity_id: p, mime_type: 'application/pdf', content_b64: fakePdfB64(), title_vi: 'x' }).code, 'FORBIDDEN');
  const d1 = up(kt, 'Sơ đồ một sợi');
  const row = (id) => env.rows('Documents').find((d) => d.document_id === id);
  assert.equal(row(d1).approval_status, 'DRAFT');
  assert.equal(row(d1).file_version, 1);
  const seen = (cl) => cl.call('doc.view', { entity_type: 'PANEL', entity_id: p }).data.items.map((d) => d.document_id);
  assert.deepEqual(seen(kt), [d1]);
  assert.deepEqual(seen(c3), [d1]);
  assert.deepEqual(seen(dn), [], 'bản nháp chưa duyệt không hiện cho người chỉ xem');
  // Người tải lên không tự duyệt
  assert.equal(kt.write('circuit.drawing.approve', { document_id: d1, decision: 'APPROVE' }, { expected_version: row(d1).record_version }).code, 'FORBIDDEN');
  assert.equal(c3.write('circuit.drawing.approve', { document_id: d1, decision: 'REJECT' }, { expected_version: row(d1).record_version, reauth_token: c3.reauth() }).errors[0].field, 'reason');
  const a1 = c3.write('circuit.drawing.approve', { document_id: d1, decision: 'APPROVE' }, { expected_version: row(d1).record_version, reauth_token: c3.reauth() });
  assert.equal(a1.ok, true, JSON.stringify(a1));
  assert.equal(row(d1).approval_status, 'APPROVED');
  assert.deepEqual(seen(dn), [d1]);
  const d2 = up(kt, 'Sơ đồ một sợi (sửa)');
  assert.equal(row(d2).file_version, 2);
  assert.equal(c3.write('circuit.drawing.approve', { document_id: d2, decision: 'APPROVE' }, { expected_version: row(d2).record_version, reauth_token: c3.reauth() }).ok, true);
  assert.equal(row(d1).approval_status, 'SUPERSEDED');
  assert.equal(row(d2).approval_status, 'APPROVED');
  const d3 = up(kt, 'Bản lỗi');
  const rj = c3.write('circuit.drawing.approve', { document_id: d3, decision: 'REJECT', reason: 'Sai tủ' }, { expected_version: row(d3).record_version, reauth_token: c3.reauth() });
  assert.equal(rj.ok, true);
  assert.equal(row(d3).approval_status, 'REJECTED');
  assert.ok(!seen(dn).includes(d3));
  // Đồng bộ: ĐN không nhận bản nháp/bị từ chối
  const b = dn.call('sync.bootstrap', {});
  const docs = (b.data.records.DOCUMENT || []).map((d) => d.document_id);
  assert.ok(docs.includes(d2) && !docs.includes(d3));
});
