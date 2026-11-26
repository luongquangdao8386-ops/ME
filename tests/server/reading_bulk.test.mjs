// d4.39: dời ngày / hủy nhiều chỉ số một lượt (reading.bulk). Tình huống thật 26/11/2026: số chốt ngày X chép từ sổ giấy được nhập với
// ngày X (app hiểu là số đầu ngày X) → biểu đồ theo ngày lệch một ngày (ngày nghỉ điện 24/11 hiện 5 256 kWh). Dời cả 8 số +1 ngày, 08:00 →
// ngày 24/11 còn 1 000 kWh, Chủ nhật 22/11 1 000 kWh. Quyền C3/C4 + PIN; chặn trùng ngày, đảo thứ tự, tương lai, số đã hủy, số mở/chốt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const T = (s) => s + ':00+07:00';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const codes = (r) => (r.errors || []).map((e) => e.code).sort();

// Số trên ảnh người dùng gửi (ngày trên giấy = ngày chốt), nhập lúc ~10:0x
const PAPER = [['2026-11-18', 2286680], ['2026-11-19', 2292415], ['2026-11-20', 2297767], ['2026-11-21', 2302195],
  ['2026-11-22', 2303195], ['2026-11-23', 2309397], ['2026-11-24', 2310397], ['2026-11-25', 2315653]];

function setup() {
  const env = freshServer({ now: T('2026-11-26T12:00') });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const meter = uuid();
  ok(c.write('meter.edit', { meter_id: meter, name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  const ids = PAPER.map(([d, v], i) => {
    const id = uuid();
    ok(dn.write('reading.create', { reading_id: id, meter_id: meter, measured_at: T(`${d}T10:${String(5 + i).padStart(2, '0')}`), cumulative_value: v }));
    return id;
  });
  return { env, c, c3, dn, meter, ids };
}

const day = (c, meter, d) => {
  const r = ok(c.call('utility.view', { summary: { period_type: 'DAY_1', date: d } })).data;
  const row = r.rows.find((x) => x.meter_id === meter);
  return row ? row.consumption : undefined;
};
const readings = (env, meter) => env.rows('MeterReadings').filter((r) => r.meter_id === meter).sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)));

test('dời 8 số chép từ sổ giấy +1 ngày, 08:00 (C3 + PIN): một lượt ghi, một dòng nhật ký; ngày nghỉ điện 24/11 còn 1 000 kWh; máy khác nhận qua đồng bộ', () => {
  const { env, c, c3, dn, meter, ids } = setup();
  // Trước khi sửa: cột 24/11 = số 25 − số 24 = 5 256 (đúng như ảnh người dùng), cột 23/11 = 1 000
  assert.equal(day(c, meter, '2026-11-24'), 5256);
  assert.equal(day(c, meter, '2026-11-23'), 1000);
  const cursor = ok(c.call('sync.changes', { cursor: '0', limit: 500 })).data.next_cursor;
  // Quyền: Đọc điện nước không dùng được; Trưởng bộ phận phải nhập PIN
  const pay = { meter_id: meter, reading_ids: ids, op: 'SHIFT', days: 1, time: '08:00', reason: 'Chép sổ giấy lệch ngày' };
  assert.equal(dn.write('reading.bulk', pay).code, 'FORBIDDEN');
  assert.equal(c3.write('reading.bulk', pay).code, 'REAUTH_REQUIRED');
  const nAudit = env.rows('AuditLogs').length;
  const r = ok(c3.write('reading.bulk', pay, { reauth_token: c3.reauth() }));
  assert.equal(r.data.count, 8);
  const after = readings(env, meter);
  assert.deepEqual(after.map((x) => x.measured_at), PAPER.map(([d]) => `2026-11-${String(Number(d.slice(8)) + 1).padStart(2, '0')}T08:00:00+07:00`));
  assert.ok(after.every((x) => x.status === 'VALID' && x.edit_reason === 'Chép sổ giấy lệch ngày' && x.record_version === 2));
  assert.equal(after[0].reading_kind, 'SEGMENT_OPENING', 'mốc gốc (lần đọc đầu) dời được');
  // Một dòng nhật ký cho cả lượt
  const logs = env.rows('AuditLogs').slice(nAudit).filter((a) => a.action === 'reading.bulk');
  assert.equal(logs.length, 1);
  // Số theo ngày đúng thực tế: Chủ nhật 22/11 và ngày nghỉ điện 24/11 thấp, ngày đi làm cao
  assert.equal(day(c, meter, '2026-11-22'), 1000);
  assert.equal(day(c, meter, '2026-11-23'), 6202);
  assert.equal(day(c, meter, '2026-11-24'), 1000);
  assert.equal(day(c, meter, '2026-11-25'), 5256);
  // Máy khác nhận đủ 8 chỉ số đã dời ở lần đồng bộ sau
  const ch = ok(c.call('sync.changes', { cursor, limit: 500 })).data.changes.filter((x) => x.entity_type === 'METER_READING');
  assert.equal(ch.length, 8);
  assert.ok(ch.every((x) => /T08:00:00\+07:00$/.test(x.data.measured_at)));
  // Gửi lại đúng thao tác (mất phản hồi, cùng operation_id) không ghi lần hai
  const op = uuid();
  const again = { meter_id: meter, reading_ids: [ids[7]], op: 'VOID', reason: 'Số thử' };
  ok(c.write('reading.bulk', again, { operation_id: op, reauth_token: c.reauth() }));
  assert.equal(c.write('reading.bulk', again, { operation_id: op, reauth_token: c.reauth() }).code, 'DUPLICATE_OPERATION');
  assert.equal(readings(env, meter)[7].record_version, 3);
});

test('dời ngày bị chặn: trùng ngày với số khác, đảo thứ tự, tương lai, số đã hủy, phiên bản cũ, dữ liệu sai; không ghi gì khi có lỗi', () => {
  const { env, c, dn, meter, ids } = setup();
  const w = (p, extra = {}) => c.write('reading.bulk', { meter_id: meter, reason: 'thử', op: 'SHIFT', days: 1, ...p }, { reauth_token: c.reauth(), ...extra });
  const before = JSON.stringify(readings(env, meter));
  // Chỉ dời số 20/11 sang 21/11 mà không chọn số 21/11 → trùng ngày (dời cả hai thì được)
  const r = w({ reading_ids: [ids[2]] });
  assert.deepEqual(codes(r), ['READING_SAME_DAY']);
  assert.equal(r.errors[0].row, 0);
  // Số 25/11 10:12 dời +2 khi đang 12:00 ngày 26 → tương lai
  assert.deepEqual(codes(w({ reading_ids: [ids[7]], days: 2 })), ['READING_FUTURE']);
  // Dữ liệu sai
  assert.deepEqual(codes(w({ reading_ids: [] })), ['REQUIRED']);
  assert.deepEqual(codes(w({ reading_ids: [ids[0], ids[0]] })), ['INVALID_VALUE']);
  assert.deepEqual(codes(w({ reading_ids: [ids[0]], days: 0 })), ['INVALID_VALUE']);
  assert.deepEqual(codes(w({ reading_ids: [ids[0]], days: 8 })), ['INVALID_VALUE']);
  assert.deepEqual(codes(w({ reading_ids: [ids[0]], time: '25:00' })), ['INVALID_VALUE']);
  assert.deepEqual(codes(w({ reading_ids: [ids[0]], reason: '' })), ['REQUIRED']);
  assert.deepEqual(codes(w({ reading_ids: [uuid()] })), ['NOT_FOUND']);
  // Mốc gốc 18/11 dời +2 ngày → sau số 19/11 cùng giai đoạn (và trùng ngày 20/11) → chặn
  assert.ok(codes(w({ reading_ids: [ids[0]], days: 2 })).length > 0);
  // Phiên bản cũ (máy khác vừa sửa)
  assert.equal(w({ reading_ids: [ids[7]], versions: { [ids[7]]: 5 } }).code, 'VERSION_CONFLICT');
  assert.equal(JSON.stringify(readings(env, meter)), before, 'có lỗi thì không ghi gì');
  // Hủy hai số thử; hủy lần nữa → đã hủy; mốc gốc không hủy được; số đã hủy không dời được
  ok(c.write('reading.bulk', { meter_id: meter, reading_ids: [ids[6], ids[7]], op: 'VOID', reason: 'Số thử' }, { reauth_token: c.reauth() }));
  assert.deepEqual(readings(env, meter).slice(6).map((x) => [x.status, x.void_reason]), [['VOID', 'Số thử'], ['VOID', 'Số thử']]);
  assert.deepEqual(codes(c.write('reading.bulk', { meter_id: meter, reading_ids: [ids[7]], op: 'VOID', reason: 'x' }, { reauth_token: c.reauth() })), ['READING_VOID']);
  assert.deepEqual(codes(c.write('reading.bulk', { meter_id: meter, reading_ids: [ids[0]], op: 'VOID', reason: 'x' }, { reauth_token: c.reauth() })), ['SEGMENT_BOUND_FIXED']);
  assert.deepEqual(codes(w({ reading_ids: [ids[7]] })), ['READING_VOID']);
  // Mốc gốc dời sớm hơn lúc bắt đầu giai đoạn đầu → giai đoạn bắt đầu theo mốc gốc
  ok(w({ reading_ids: [ids[0]], days: -3, time: '08:00' }));
  assert.equal(env.rows('MeterSegments').find((s) => s.meter_id === meter).start_at, '2026-11-15T08:00:00+07:00');
  // Đảo thứ tự: đồng hồ có ngày trống — 10/11 = 100, 12/11 = 200, 14/11 = 300; dời số 14/11 lùi 3 ngày sang 11/11 (ngày trống)
  // → 300 đứng trước 200 → số hợp lệ thành "cần kiểm tra" → chặn
  const m2 = uuid();
  ok(c.write('meter.edit', { meter_id: m2, name_vi: 'Nước', utility_type: 'WATER', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  const r2 = [['2026-11-10', 100], ['2026-11-12', 200], ['2026-11-14', 300]].map(([d, v]) => { const id = uuid(); ok(dn.write('reading.create', { reading_id: id, meter_id: m2, measured_at: T(`${d}T08:00`), cumulative_value: v })); return id; });
  assert.deepEqual(codes(c.write('reading.bulk', { meter_id: m2, reading_ids: [r2[2]], op: 'SHIFT', days: -3, reason: 'thử' }, { reauth_token: c.reauth() })), ['READING_ORDER']);
  assert.ok(readings(env, m2).every((x) => x.status === 'VALID'));
});

test('đồng hồ đã thay (hai giai đoạn): số chốt/mở do sự kiện không dời, không hủy; dời làm số cũ rơi sang giai đoạn mới và đảo thứ tự → chặn; dời/hủy trong một giai đoạn được; tiêu thụ qua mốc thay vẫn đúng', () => {
  const env = freshServer({ now: T('2026-11-26T12:00') });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const meter = uuid();
  ok(c.write('meter.edit', { meter_id: meter, name_vi: 'Điện xưởng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  const rd = (d, v) => { const id = uuid(); ok(dn.write('reading.create', { reading_id: id, meter_id: meter, measured_at: T(`${d}T08:00`), cumulative_value: v })); return id; };
  const a1 = rd('2026-11-10', 100), a2 = rd('2026-11-11', 200), a3 = rd('2026-11-12', 300);
  // Thay đồng hồ 12/11 12:00: số chốt 350, đồng hồ mới bắt đầu 0
  const ev = uuid();
  ok(dn.write('meter.event.create', { event_id: ev, meter_id: meter, event_type: 'REPLACE', event_at: T('2026-11-12T12:00'), closing_value: 350, opening_value: 0, new_serial: 'SN-2' }));
  const evRow = () => env.rows('MeterEvents').find((x) => x.event_id === ev);
  ok(c.write('meter.event.approve', { event_id: ev, decision: 'APPROVE' }, { expected_version: evRow().record_version, reauth_token: c.reauth() }));
  const b1 = rd('2026-11-13', 50), b2 = rd('2026-11-14', 120);
  const bound = env.rows('MeterReadings').filter((r) => r.meter_id === meter && r.event_id);
  assert.equal(bound.length, 2, 'số chốt + số mở do sự kiện');
  const w = (p) => c.write('reading.bulk', { meter_id: meter, reason: 'thử', ...p }, { reauth_token: c.reauth() });
  // Số chốt/mở do sự kiện: không dời, không hủy
  assert.deepEqual(codes(w({ op: 'SHIFT', days: 1, reading_ids: [bound[0].reading_id] })), ['SEGMENT_BOUND_FIXED']);
  assert.deepEqual(codes(w({ op: 'VOID', reading_ids: [bound[1].reading_id] })), ['SEGMENT_BOUND_FIXED']);
  // Dời cả 5 số thường +1 ngày: số 300 (12/11, đồng hồ cũ) sang 13/11 08:00 — sau lúc thay → thuộc đồng hồ mới, đứng trước số 50 → đảo thứ tự
  const before = JSON.stringify(env.rows('MeterReadings'));
  const r = w({ op: 'SHIFT', days: 1, reading_ids: [a1, a2, a3, b1, b2] });
  assert.ok(codes(r).includes('READING_ORDER'), JSON.stringify(r.errors));
  assert.equal(JSON.stringify(env.rows('MeterReadings')), before, 'không ghi gì');
  // Dời trong cùng giai đoạn: hai số đồng hồ mới +1 ngày được; tiêu thụ 13→14/11 theo đồng hồ mới
  ok(w({ op: 'SHIFT', days: 1, reading_ids: [b1, b2] }));
  const rows = env.rows('MeterReadings').filter((x) => x.meter_id === meter);
  const segNew = env.rows('MeterSegments').filter((s) => s.meter_id === meter).sort((x, y) => Number(x.seq_no) - Number(y.seq_no))[1];
  assert.ok([b1, b2].every((id) => rows.find((x) => x.reading_id === id).meter_segment_id === segNew.segment_id));
  const sum = (d) => ok(c.call('utility.view', { summary: { period_type: 'DAY_1', date: d } })).data.rows.find((x) => x.meter_id === meter);
  assert.equal(sum('2026-11-14').consumption, 70, '15/11 (120) − 14/11 (50)');
  // Ngày 12/11: 300 (08:00) → chốt 350 → mở 0 → 50 (14/11 08:00 là số đầu ngày 14, ngày 13 chưa có số) → ngày 12 thiếu số cuối
  assert.equal(sum('2026-11-12').status, 'MISSING_READING');
  // Hủy số 11/11 (đồng hồ cũ) → số 12/11 vẫn hợp lệ, số 10/11 vẫn là mốc gốc
  ok(w({ op: 'VOID', reading_ids: [a2] }));
  const r2 = env.rows('MeterReadings').filter((x) => x.meter_id === meter);
  assert.equal(r2.find((x) => x.reading_id === a2).status, 'VOID');
  assert.ok([a1, a3].every((id) => r2.find((x) => x.reading_id === id).status === 'VALID'));
});
