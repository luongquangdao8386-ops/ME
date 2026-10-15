// Điện nước Đợt 3: đồng hồ, chỉ số lũy kế, chốt kỳ B1 (3.12), sự kiện thay/reset/đổi hệ số, biểu giá, quyền (4.4.6, 6.9.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN, fakeJpegB64 } from '../helpers.mjs';

/** Đặt đồng hồ giả của máy chủ về một thời điểm (giờ Việt Nam) */
function setNow(env, iso) { env.clock.offset = 0; env.clock.offset = Date.parse(iso) - Date.now(); }
const T = (s) => s + ':00+07:00'; // 'YYYY-MM-DDTHH:mm' → ISO +07:00

function setup(now = '2026-10-20T10:00') {
  const env = freshServer({ now: T(now) });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const dnId = env.rows('Users').find((u) => u.employee_code === 'U-DN').user_id;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  return { env, c, dn, dnId, c3 };
}

function addMeter(c, extra = {}) {
  const id = uuid();
  const r = c.write('meter.edit', { meter_id: id, name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_5', ...extra });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { id, r };
}

function read(c, meterId, at, value, extra = {}) {
  const id = uuid();
  const r = c.write('reading.create', { reading_id: id, meter_id: meterId, measured_at: T(at), cumulative_value: value, ...extra });
  return { id, r };
}

function summary(c, f) {
  const r = c.call('utility.view', { summary: f });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}

const rowOf = (s, meterId) => s.rows.find((x) => x.meter_id === meterId);

test('đồng hồ DH-0001, đơn vị kWh, QR; ví dụ B1: 01/10 07:45 = 12 350, 06/10 08:00 = 12 480, hệ số 1 → 130 kWh, khoảng đọc thực tế; số 08:00 ngày 6 vừa chốt kỳ 1–5 vừa mở kỳ 6–10', () => {
  const { c, dn } = setup();
  const { id, r } = addMeter(c);
  assert.equal(r.data.display_code, 'DH-0001');
  assert.ok(r.data.qr_key);
  assert.equal(r.data.record.unit, 'kWh');
  const a = read(dn, id, '2026-10-01T07:45', 12350);
  assert.equal(a.r.ok, true, JSON.stringify(a.r));
  const b = read(dn, id, '2026-10-06T08:00', 12480);
  assert.equal(b.r.ok, true);
  assert.equal(b.r.data.consumption, 130, 'tiêu thụ từ lần đọc trước');
  const s = summary(c, { period_type: 'DAY_5', date: '2026-10-03' });
  assert.equal(s.period_start, '2026-10-01');
  assert.equal(s.period_end, '2026-10-05');
  assert.equal(s.window_hours, 24);
  const x = rowOf(s, id);
  assert.equal(x.status, 'OK');
  assert.equal(x.consumption, 130);
  assert.equal(x.opening_value, 12350);
  assert.equal(x.closing_value, 12480);
  assert.equal(x.opening_at, T('2026-10-01T07:45'));
  assert.equal(x.closing_at, T('2026-10-06T08:00'));
  assert.equal(s.totals.ELECTRICITY.consumption, 130);
  assert.equal(s.totals.ELECTRICITY.unit, 'kWh');
  assert.equal(s.totals.ELECTRICITY.partial, false);
  // Kỳ 6–10 mở bằng chính lần đọc 08:00 ngày 6
  const s2 = summary(c, { period_type: 'DAY_5', date: '2026-10-07' });
  assert.equal(rowOf(s2, id).opening_reading_id, b.id);
  assert.equal(rowOf(s2, id).status, 'MISSING_READING');
  assert.equal(rowOf(s2, id).missing_side, 'CLOSING');
  assert.equal(rowOf(s2, id).consumption, null, 'thiếu số đo: để trống, không phải 0');
});

test('hệ số 40 (qua biến dòng) → 130 × 40 = 5 200 kWh', () => {
  const { c, dn } = setup();
  const { id } = addMeter(c, { multiplier: 40 });
  read(dn, id, '2026-10-01T07:45', 12350);
  read(dn, id, '2026-10-06T08:00', 12480);
  assert.equal(rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), id).consumption, 5200);
});

test('thay đồng hồ 03/10 10:00: cũ chốt 12 400, mới mở 0, 06/10 08:00 = 80 → 130 kWh; chỉ số 80 ghi trước khi duyệt sự kiện chuyển sang giai đoạn mới và hết "Cần kiểm tra"', () => {
  const { env, c, dn, c3 } = setup();
  const { id } = addMeter(c);
  read(dn, id, '2026-10-01T07:45', 12350);
  // Đồng hồ mới đã lắp nhưng sự kiện chưa ghi: 80 < 12 350 → lưu, cần kiểm tra, không dùng để tính
  const late = read(dn, id, '2026-10-06T08:00', 80);
  assert.equal(late.r.ok, true);
  assert.equal(late.r.data.status, 'NEEDS_REVIEW');
  assert.equal(rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), id).status, 'MISSING_READING');
  const ev = uuid();
  const e = dn.write('meter.event.create', { event_id: ev, meter_id: id, event_type: 'REPLACE', event_at: T('2026-10-03T10:00'), closing_value: 12400, opening_value: 0, new_serial: 'SN-NEW-01' });
  assert.equal(e.ok, true, JSON.stringify(e));
  // Một sự kiện chờ duyệt mỗi đồng hồ
  assert.equal(dn.write('meter.event.create', { event_id: uuid(), meter_id: id, event_type: 'RESET', event_at: T('2026-10-04T10:00'), closing_value: 50, opening_value: 0 }).errors[0].code, 'EVENT_PENDING');
  // Người lập không tự duyệt (4.6); ĐN không có quyền duyệt
  const evRow = () => env.rows('MeterEvents').find((x) => x.event_id === ev);
  assert.equal(dn.write('meter.event.approve', { event_id: ev, decision: 'APPROVE' }, { expected_version: 1 }).code, 'FORBIDDEN');
  const ap = c3.write('meter.event.approve', { event_id: ev, decision: 'APPROVE' }, { expected_version: evRow().record_version, reauth_token: c3.reauth() });
  assert.equal(ap.ok, true, JSON.stringify(ap));
  const segs = env.rows('MeterSegments').filter((s) => s.meter_id === id).sort((a, b) => a.seq_no - b.seq_no);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].status, 'CLOSED');
  assert.equal(segs[0].closing_value, 12400);
  assert.equal(segs[0].end_at, T('2026-10-03T10:00'));
  assert.equal(segs[1].opening_value, 0);
  assert.equal(segs[1].serial, 'SN-NEW-01');
  const reads = env.rows('MeterReadings').filter((x) => x.meter_id === id);
  assert.ok(reads.some((x) => x.reading_kind === 'SEGMENT_CLOSING' && x.cumulative_value === 12400 && x.measured_at === T('2026-10-03T10:00')));
  assert.ok(reads.some((x) => x.reading_kind === 'SEGMENT_OPENING' && x.cumulative_value === 0 && x.meter_segment_id === segs[1].segment_id));
  const moved = reads.find((x) => x.reading_id === late.id);
  assert.equal(moved.meter_segment_id, segs[1].segment_id);
  assert.equal(moved.status, 'VALID');
  assert.equal(env.rows('Meters').find((m) => m.meter_id === id).current_segment_id, segs[1].segment_id);
  const x = rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), id);
  assert.equal(x.status, 'OK');
  assert.equal(x.consumption, 130);
});

test('đọc muộn: lần kế tiếp 07/10 09:00 ngoài [06/10 00:00, 07/10 00:00) → Thiếu số đo (CLOSING); đọc sớm 05/10 23:30 không dùng cho mốc 06/10 → Thiếu số đo', () => {
  const { c, dn } = setup();
  const m1 = addMeter(c).id;
  read(dn, m1, '2026-10-01T07:45', 12350);
  read(dn, m1, '2026-10-07T09:00', 12500);
  const x1 = rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), m1);
  assert.equal(x1.status, 'MISSING_READING');
  assert.equal(x1.missing_side, 'CLOSING');
  assert.equal(x1.consumption, null);
  const m2 = addMeter(c, { name_vi: 'Điện xưởng B' }).id;
  read(dn, m2, '2026-10-01T07:45', 12350);
  read(dn, m2, '2026-10-05T23:30', 12470);
  const x2 = rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), m2);
  assert.equal(x2.status, 'MISSING_READING');
  assert.equal(x2.missing_side, 'CLOSING');
  assert.equal(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }).totals.ELECTRICITY.partial, true);
  assert.equal(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }).totals.ELECTRICITY.missing, 2);
});

test('B1 kỳ 1–5: chỉ số 08:00 ngày 6 chốt được; chỉ số đầu tiên lúc 00:30 ngày 7 (quá 24 giờ) → thiếu dữ liệu; W = 6 giờ thì 08:00 ngày 6 cũng thiếu', () => {
  const { env, c, dn } = setup();
  const m1 = addMeter(c).id;
  read(dn, m1, '2026-10-01T05:30', 100);
  read(dn, m1, '2026-10-06T08:00', 150);
  assert.equal(rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-02' }), m1).status, 'OK');
  const m2 = addMeter(c, { name_vi: 'Điện 2' }).id;
  read(dn, m2, '2026-10-01T06:00', 100);
  read(dn, m2, '2026-10-07T00:30', 160);
  const x2 = rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-02' }), m2);
  assert.equal(x2.status, 'MISSING_READING');
  assert.equal(x2.missing_side, 'CLOSING');
  assert.equal(x2.consumption, null, 'không chia đều, không lấy số 00:30 ngày 7');
  // Đổi W (Settings) → bản tổng hợp mới dùng W mới
  const g = env.g;
  g.dbReset_();
  g.withWriteLock_(() => { const r = g.readRows_('Settings').find((x) => x.setting_key === 'meter_boundary_window_hours'); g.writeCells_('Settings', r.__row, { value: '6' }); });
  env.cache.remove('cfg:settings');
  const s = summary(c, { period_type: 'DAY_5', date: '2026-10-02' });
  assert.equal(s.window_hours, 6);
  assert.equal(rowOf(s, m1).status, 'MISSING_READING');
  assert.equal(rowOf(s, m1).missing_side, 'CLOSING', 'số mở 05:30 vẫn trong 6 giờ, số 08:00 ngày 6 thì không');
});

test('lần đọc đầu tiên là mốc gốc: kỳ chứa lần đầu → BASELINE (không báo 0); đồng hồ chưa có số đo → NO_READING; kỳ đang chạy → OPEN_PERIOD', () => {
  const { c, dn } = setup('2026-10-08T10:00');
  const m = addMeter(c).id;
  const first = read(dn, m, '2026-10-03T08:00', 500);
  assert.equal(first.r.data.record.reading_kind, 'SEGMENT_OPENING', 'đồng hồ thêm không kèm số mở: lần đầu là mốc gốc');
  const x = rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), m);
  assert.equal(x.status, 'BASELINE');
  assert.equal(x.consumption, null);
  const none = addMeter(c, { name_vi: 'Chưa đọc' }).id;
  assert.equal(rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), none).status, 'NO_READING');
  read(dn, m, '2026-10-06T07:00', 520);
  // Kỳ 6–10 chưa tới mốc chốt (11/10 00:00 + 24 h)
  const open = rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-08' }), m);
  assert.equal(open.status, 'OPEN_PERIOD');
  assert.equal(summary(c, { period_type: 'DAY_5', date: '2026-10-08' }).totals.ELECTRICITY.partial, false, 'kỳ chưa kết thúc không tính là thiếu');
});

test('kỳ nối liền: tổng các kỳ 5 ngày của tháng bằng kỳ tháng khi đủ số; kỳ cuối tháng 26–31; 10 ngày 21–31; kỳ tùy chọn theo khoảng ngày', () => {
  const { c, dn } = setup('2026-11-05T10:00');
  const m = addMeter(c).id;
  const marks = [['2026-10-01T07:00', 1000], ['2026-10-06T07:00', 1050], ['2026-10-11T07:00', 1120], ['2026-10-16T07:30', 1200], ['2026-10-21T07:00', 1260], ['2026-10-26T07:00', 1300], ['2026-11-01T07:15', 1390]];
  marks.forEach(([at, v]) => assert.equal(read(dn, m, at, v).r.ok, true));
  let sum = 0;
  for (const d of ['2026-10-01', '2026-10-06', '2026-10-11', '2026-10-16', '2026-10-21', '2026-10-26']) {
    const x = rowOf(summary(c, { period_type: 'DAY_5', date: d }), m);
    assert.equal(x.status, 'OK', d);
    sum += x.consumption;
  }
  const last = summary(c, { period_type: 'DAY_5', date: '2026-10-30' });
  assert.equal(last.period_start, '2026-10-26');
  assert.equal(last.period_end, '2026-10-31');
  const month = rowOf(summary(c, { period_type: 'MONTH', date: '2026-10-15' }), m);
  assert.equal(month.consumption, 390);
  assert.equal(sum, 390);
  const d10 = summary(c, { period_type: 'DAY_10', date: '2026-10-25' });
  assert.equal(d10.period_start, '2026-10-21');
  assert.equal(d10.period_end, '2026-10-31');
  assert.equal(rowOf(d10, m).consumption, 130);
  const cu = summary(c, { period_type: 'CUSTOM', from: '2026-10-06', to: '2026-10-15' });
  assert.equal(rowOf(cu, m).consumption, 150);
  // Biểu đồ: 6 kỳ gần nhất (01–05 … 26–31)
  const ch = summary(c, { period_type: 'DAY_5', date: '2026-10-26' }).chart;
  assert.equal(ch.line.length, 6);
  assert.equal(ch.line[ch.line.length - 1].period_start, '2026-10-26');
  assert.equal(ch.line[0].period_start, '2026-10-01');
  assert.equal(ch.line[0].totals.ELECTRICITY.consumption, 50);
});

test('chỉ số giảm trong giai đoạn → NEEDS_REVIEW, không dùng để tính; người có quyền hủy kèm lý do thì kỳ tính lại; đặt lại VALID khi vẫn giảm → READING_DECREASED', () => {
  const { env, c, dn, c3 } = setup();
  const m = addMeter(c).id;
  read(dn, m, '2026-10-01T07:00', 1000);
  const bad = read(dn, m, '2026-10-03T07:00', 900);
  assert.equal(bad.r.data.status, 'NEEDS_REVIEW');
  read(dn, m, '2026-10-06T07:00', 1100);
  assert.equal(rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), m).consumption, 100);
  const cur = () => env.rows('MeterReadings').find((x) => x.reading_id === bad.id);
  assert.equal(c3.write('reading.editOthers', { reading_id: bad.id, status: 'VALID', reason: 'thử' }, { expected_version: cur().record_version }).errors[0].code, 'READING_DECREASED');
  const v = c3.write('reading.editOthers', { reading_id: bad.id, status: 'VOID', reason: 'Đọc nhầm đồng hồ' }, { expected_version: cur().record_version });
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(cur().status, 'VOID');
  assert.equal(cur().void_reason, 'Đọc nhầm đồng hồ');
  // Sửa giá trị đúng (950) thì hợp lệ trở lại
  const fix = c3.write('reading.editOthers', { reading_id: bad.id, cumulative_value: 1050, status: 'VALID', reason: 'Gõ thiếu số' }, { expected_version: cur().record_version });
  assert.equal(fix.ok, true, JSON.stringify(fix));
  assert.equal(cur().status, 'VALID');
  assert.equal(cur().edit_reason, 'Gõ thiếu số');
  const audit = env.rows('AuditLogs').filter((a) => a.action === 'reading.editOthers');
  assert.equal(audit.length, 2);
  assert.equal(audit[1].reason, 'Gõ thiếu số');
});

test('quyền (4.4.6): ĐN ghi chỉ số (kể cả offline qua sync.push, kèm ảnh), không thêm đồng hồ; C1 chỉ xem; KT ghi được sự kiện; ĐN sửa chỉ số của mình trong 24 giờ, quá hạn thì không; trùng lúc đọc bị chặn', () => {
  const { env, c, dn } = setup();
  const m = addMeter(c).id;
  assert.equal(dn.write('meter.edit', { meter_id: uuid(), name_vi: 'X', utility_type: 'WATER' }).code, 'FORBIDDEN');
  const c1 = userClient(env, 'U-C1', 1, '702468');
  assert.equal(c1.call('utility.view', {}).ok, true);
  assert.equal(c1.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-01T07:00'), cumulative_value: 1 }).code, 'FORBIDDEN');
  const kt = userClient(env, 'U-KT', 2, '815937', 'KY_THUAT');
  assert.equal(kt.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-01T07:00'), cumulative_value: 1 }).code, 'FORBIDDEN');
  // Offline: sync.push chở reading.create rồi doc.upload ảnh đồng hồ
  const rid = uuid();
  const push = dn.call('sync.push', { op: { action: 'reading.create', operation_id: uuid(), entity_type: 'METER_READING', entity_id: rid, expected_version: 0, payload: { reading_id: rid, meter_id: m, measured_at: T('2026-10-01T07:00'), cumulative_value: 1000 }, local_created_at: T('2026-10-01T07:01') } });
  assert.equal(push.ok, true, JSON.stringify(push));
  assert.equal(push.state, 'COMMITTED');
  const docId = uuid();
  const up = dn.call('sync.push', { op: { action: 'doc.upload', operation_id: uuid(), entity_type: 'DOCUMENT', entity_id: docId, expected_version: 0, payload: { document_id: docId, entity_type: 'METER_READING', entity_id: rid, kind: 'PHOTO_METER', mime_type: 'image/jpeg', content_b64: fakeJpegB64(), title_vi: 'Ảnh đồng hồ' }, local_created_at: T('2026-10-01T07:01') } });
  assert.equal(up.ok, true, JSON.stringify(up));
  assert.equal(env.rows('Documents').find((d) => d.document_id === docId).access_scope, 'LINK_VIEW');
  // ĐN không tải được tài liệu khác loại vào đồng hồ
  assert.equal(dn.write('doc.upload', { document_id: uuid(), entity_type: 'METER_READING', entity_id: rid, kind: 'MANUAL', mime_type: 'application/pdf', content_b64: Buffer.from('%PDF-1.4 x').toString('base64'), title_vi: 'x' }).code, 'FORBIDDEN');
  assert.equal(kt.write('meter.event.create', { event_id: uuid(), meter_id: m, event_type: 'RESET', event_at: T('2026-10-02T07:00'), closing_value: 1010, opening_value: 0 }).ok, true);
  // Trùng lúc đọc
  assert.equal(dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-01T07:00'), cumulative_value: 1000 }).errors[0].code, 'READING_DUPLICATE');
  // Sửa của mình trong 24 giờ
  const own = read(dn, m, '2026-10-01T09:00', 1005);
  const ver = () => env.rows('MeterReadings').find((x) => x.reading_id === own.id).record_version;
  assert.equal(dn.write('reading.editOwn', { reading_id: own.id, cumulative_value: 1006 }, { expected_version: ver() }).errors[0].code, 'REQUIRED', 'bắt lý do');
  assert.equal(dn.write('reading.editOwn', { reading_id: own.id, cumulative_value: 1006, reason: 'gõ nhầm' }, { expected_version: ver() }).ok, true);
  assert.equal(dn.write('reading.editOthers', { reading_id: own.id, cumulative_value: 1007, reason: 'x' }, { expected_version: ver() }).code, 'FORBIDDEN');
  env.clock.advance(25 * 3600000);
  assert.equal(dn.write('reading.editOwn', { reading_id: own.id, cumulative_value: 1008, reason: 'muộn' }, { expected_version: ver() }).errors[0].code, 'EDIT_WINDOW_PASSED');
  // Bootstrap của ĐN: có đồng hồ, chỉ số; không có biểu giá (không có quyền giá)
  const b = dn.call('sync.bootstrap', {});
  assert.ok(b.data.records.METER.length === 1 && b.data.records.METER[0].qr_key);
  assert.ok(b.data.records.METER_READING.length >= 2);
  assert.equal(b.data.records.TARIFF, undefined);
  assert.ok(b.data.permissions.actions.includes('reading.create'));
  assert.ok(!b.data.permissions.actions.includes('meter.edit'));
});

test('đồng hồ tổng/nhánh: tổng không cộng nhánh khi có đồng hồ tổng trong tập xem; lọc khu vực chỉ có nhánh thì cộng nhánh; đồng hồ tổng khác loại hoặc vòng bị chặn', () => {
  const { env, c, dn } = setup();
  const g = env.g;
  const locA = uuid(), locB = uuid();
  assert.equal(c.write('location.edit', { location_id: locA, name_vi: 'Xưởng A' }).ok, true);
  assert.equal(c.write('location.edit', { location_id: locB, name_vi: 'Xưởng B' }).ok, true);
  const main = addMeter(c, { name_vi: 'Tổng', location_id: locA }).id;
  const child = addMeter(c, { name_vi: 'Nhánh', parent_meter_id: main, location_id: locB }).id;
  for (const [mm, v1, v2] of [[main, 100, 300], [child, 10, 60]]) { read(dn, mm, '2026-10-01T07:00', v1); read(dn, mm, '2026-10-06T07:00', v2); }
  const all = summary(c, { period_type: 'DAY_5', date: '2026-10-01' });
  assert.equal(all.totals.ELECTRICITY.consumption, 200, 'chỉ đồng hồ tổng');
  assert.equal(rowOf(all, child).in_total, false);
  const onlyB = summary(c, { period_type: 'DAY_5', date: '2026-10-01', location_id: locB });
  assert.equal(onlyB.totals.ELECTRICITY.consumption, 50);
  const w = addMeter(c, { name_vi: 'Nước', utility_type: 'WATER' }).id;
  assert.equal(c.write('meter.edit', { meter_id: uuid(), name_vi: 'X', utility_type: 'WATER', parent_meter_id: main }).errors[0].code, 'INVALID_VALUE');
  const ver = env.rows('Meters').find((x) => x.meter_id === main).record_version;
  assert.equal(c.write('meter.edit', { meter_id: main, parent_meter_id: child }, { expected_version: ver }).errors[0].code, 'METER_LOOP');
  assert.equal(env.rows('Meters').find((x) => x.meter_id === w).unit, 'm³');
  g.dbReset_();
});

test('hệ số ban đầu sửa được khi chưa có chỉ số; có rồi → MULTIPLIER_NEEDS_EVENT; sự kiện đổi hệ số được duyệt thì kỳ tính theo từng giai đoạn', () => {
  const { env, c, dn, c3 } = setup();
  const m = addMeter(c).id;
  const ver = () => env.rows('Meters').find((x) => x.meter_id === m).record_version;
  assert.equal(c.write('meter.edit', { meter_id: m, multiplier: 2 }, { expected_version: ver() }).ok, true);
  read(dn, m, '2026-10-01T07:00', 100);
  assert.equal(c.write('meter.edit', { meter_id: m, multiplier: 5 }, { expected_version: ver() }).errors[0].code, 'MULTIPLIER_NEEDS_EVENT');
  const ev = uuid();
  assert.equal(c.write('meter.event.create', { event_id: ev, meter_id: m, event_type: 'MULTIPLIER_CHANGE', event_at: T('2026-10-03T12:00'), closing_value: 150, new_multiplier: 10 }).ok, true);
  const evRow = env.rows('MeterEvents').find((x) => x.event_id === ev);
  assert.equal(evRow.opening_value, 150, 'đổi hệ số: số mở = số chốt');
  // Người lập (owner) không tự duyệt; C3 duyệt
  assert.equal(c.write('meter.event.approve', { event_id: ev, decision: 'APPROVE' }, { expected_version: evRow.record_version, reauth_token: c.reauth() }).code, 'FORBIDDEN');
  assert.equal(c3.write('meter.event.approve', { event_id: ev, decision: 'APPROVE' }, { expected_version: evRow.record_version, reauth_token: c3.reauth() }).ok, true);
  read(dn, m, '2026-10-06T07:00', 160);
  // (150 − 100) × 2 + (160 − 150) × 10 = 200
  assert.equal(rowOf(summary(c, { period_type: 'DAY_5', date: '2026-10-01' }), m).consumption, 200);
  assert.equal(env.rows('Meters').find((x) => x.meter_id === m).multiplier, 10);
});

test('biểu giá (4.5): C3 lập nháp, người khác duyệt (PIN); chi phí = tiêu thụ × đơn giá × (1 + thuế); biểu giá mới tự đóng biểu giá cũ; trùng ngày → TARIFF_OVERLAP; ĐN không thấy giá', () => {
  const { env, c, dn, c3 } = setup();
  const m = addMeter(c).id;
  read(dn, m, '2026-10-01T07:00', 100);
  read(dn, m, '2026-10-06T07:00', 230);
  const t1 = uuid();
  assert.equal(dn.write('tariff.edit', { tariff_id: t1, utility_type: 'ELECTRICITY', effective_from: '2026-01-01', unit_price: 2000 }).code, 'FORBIDDEN');
  assert.equal(c3.write('tariff.edit', { tariff_id: t1, utility_type: 'ELECTRICITY', effective_from: '2026-01-01', unit_price: 2000, tax_rate: 8, name_vi: 'Giá điện 2026' }).ok, true);
  let s = summary(c, { period_type: 'DAY_5', date: '2026-10-01' });
  assert.equal(rowOf(s, m).cost, undefined, 'biểu giá chưa duyệt không tính');
  assert.equal(rowOf(s, m).cost_note, 'NO_TARIFF');
  const tv = () => env.rows('UtilityTariffs').find((x) => x.tariff_id === t1).record_version;
  assert.equal(c3.write('tariff.approve', { tariff_id: t1, decision: 'APPROVE' }, { expected_version: tv(), reauth_token: c3.reauth() }).code, 'FORBIDDEN', 'người lập không tự duyệt');
  assert.equal(c.write('tariff.approve', { tariff_id: t1, decision: 'APPROVE' }, { expected_version: tv(), reauth_token: c.reauth() }).ok, true);
  s = summary(c, { period_type: 'DAY_5', date: '2026-10-01' });
  assert.equal(rowOf(s, m).cost, 280800, '130 × 2 000 × 1,08');
  assert.equal(rowOf(s, m).currency, 'VND');
  assert.deepEqual(s.totals.ELECTRICITY.cost, { VND: 280800 });
  // ĐN: không có cột giá
  const sd = summary(dn, { period_type: 'DAY_5', date: '2026-10-01' });
  assert.equal(sd.cost_visible, false);
  assert.equal(rowOf(sd, m).cost, undefined);
  assert.equal(dn.call('tariff.view', {}).code, 'FORBIDDEN');
  // Biểu giá mới từ 01/11 → đóng biểu giá cũ 31/10
  const t2 = uuid();
  assert.equal(c3.write('tariff.edit', { tariff_id: t2, utility_type: 'ELECTRICITY', effective_from: '2026-11-01', unit_price: 2100 }).ok, true);
  const t2v = env.rows('UtilityTariffs').find((x) => x.tariff_id === t2).record_version;
  assert.equal(c.write('tariff.approve', { tariff_id: t2, decision: 'APPROVE' }, { expected_version: t2v, reauth_token: c.reauth() }).ok, true);
  assert.equal(env.rows('UtilityTariffs').find((x) => x.tariff_id === t1).effective_to, '2026-10-31');
  // Biểu giá chồng ngày với biểu giá đã duyệt có ngày hết
  const t3 = uuid();
  assert.equal(c3.write('tariff.edit', { tariff_id: t3, utility_type: 'ELECTRICITY', effective_from: '2026-06-01', effective_to: '2026-06-30', unit_price: 1 }).ok, true);
  const t3v = env.rows('UtilityTariffs').find((x) => x.tariff_id === t3).record_version;
  assert.equal(c.write('tariff.approve', { tariff_id: t3, decision: 'APPROVE' }, { expected_version: t3v, reauth_token: c.reauth() }).errors[0].code, 'TARIFF_OVERLAP');
  // Bản đã duyệt không sửa
  assert.equal(c3.write('tariff.edit', { tariff_id: t1, unit_price: 1 }, { expected_version: tv() }).errors[0].code, 'STATUS_INVALID');
  // Bootstrap: biểu giá chỉ người có quyền giá
  assert.ok(c.call('sync.bootstrap', {}).data.records.TARIFF.length === 3);
});

test('QR đồng hồ mở hồ sơ (qr.resolve), in tem (qr.print) có mã khu vực; đồng hồ ngừng dùng thì không ghi chỉ số, tem báo ngừng', () => {
  const { env, c, dn } = setup();
  const loc = uuid();
  c.write('location.edit', { location_id: loc, location_code: 'KV-A', name_vi: 'Xưởng A' });
  const { id, r } = addMeter(c, { location_id: loc });
  const q = dn.call('qr.resolve', { qr_key: r.data.qr_key });
  assert.equal(q.data.qr_state, 'OK');
  assert.equal(q.data.entity_type, 'METER');
  const p = c.call('qr.print', { entity_type: 'METER', ids: [id] });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.data.items[0].location_code, 'KV-A');
  const ver = env.rows('Meters').find((x) => x.meter_id === id).record_version;
  assert.equal(c.write('meter.edit', { meter_id: id, active: false }, { expected_version: ver }).errors[0].code, 'REQUIRED');
  assert.equal(c.write('meter.edit', { meter_id: id, active: false, reason: 'Tháo bỏ' }, { expected_version: ver }).ok, true);
  assert.equal(read(dn, id, '2026-10-01T07:00', 1).r.errors[0].code, 'METER_INACTIVE');
  assert.equal(dn.call('qr.resolve', { qr_key: r.data.qr_key }).data.qr_state, 'INACTIVE');
});

test('tổng hợp kỳ có lưu đệm máy chủ: gọi lại trả cùng số; ghi chỉ số / biểu giá mới thì tính lại ngay (không trả số cũ); người không có quyền giá không nhận bản có chi phí', () => {
  const { env, c, dn, c3 } = setup();
  const { id } = addMeter(c);
  read(dn, id, '2026-10-01T07:45', 12350);
  read(dn, id, '2026-10-06T08:00', 12480);
  const f = { period_type: 'DAY_5', date: '2026-10-03' };
  assert.equal(rowOf(summary(c, f), id).consumption, 130);
  assert.equal(rowOf(summary(c, f), id).consumption, 130);
  // Số chốt sớm hơn trong cửa sổ → 120 ngay lần gọi sau
  assert.equal(read(dn, id, '2026-10-06T07:00', 12470).r.ok, true);
  assert.equal(rowOf(summary(c, f), id).consumption, 120);
  // Biểu giá được duyệt → có chi phí ngay
  const t = uuid();
  assert.equal(c3.write('tariff.edit', { tariff_id: t, utility_type: 'ELECTRICITY', effective_from: '2026-01-01', unit_price: 2000, tax_rate: 0 }).ok, true);
  assert.equal(c.write('tariff.approve', { tariff_id: t, decision: 'APPROVE' }, { expected_version: env.rows('UtilityTariffs')[0].record_version, reauth_token: c.reauth() }).ok, true);
  assert.equal(rowOf(summary(c, f), id).cost, 240000);
  assert.ok(!('cost' in rowOf(summary(dn, f), id)), 'ĐN không nhận bản đệm có chi phí');
});
