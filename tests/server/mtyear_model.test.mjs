// d4.16: Kế hoạch năm (js/mtyear-model.js) — lịch dự kiến trùng occurrence_ của máy chủ (26_maintenance), ước tính giờ chạy chỉ khi đủ
// số liệu, ghép phiếu đúng lần, % chỉ tính lần đã tới hạn (không ghi 0 % giả), nhóm theo Loại thiết bị
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from '../gas-mock.mjs';
import { planDates, hoursRate, hoursDates, tally, pct, yearModel } from '../../js/mtyear-model.js';

test('planDates khớp occurrence_ của máy chủ: tháng (ngày 29/30/31, năm nhuận), ngày; mốc trước/trong/sau năm', () => {
  const env = loadServer();
  const server = (plan, from, to) => {
    const out = [];
    for (let k = 0; k < 5000; k++) {
      const o = env.g.occurrence_(plan, k);
      if (o > to) break;
      if (o >= from) out.push(o);
    }
    return out;
  };
  const cases = [];
  for (const anchor of ['2019-01-31', '2024-02-29', '2025-08-30', '2026-03-15', '2026-12-31', '2027-01-01'])
    for (const n of [1, 2, 3, 6, 12, 13]) cases.push({ interval_type: 'MONTH', interval_value: n, anchor_date: anchor });
  for (const anchor of ['2020-02-29', '2025-12-30', '2026-03-15'])
    for (const n of [1, 7, 30, 90, 365, 400]) cases.push({ interval_type: 'DAY', interval_value: n, anchor_date: anchor });
  for (const p of cases) {
    for (const y of [2026, 2027, 2028]) {
      assert.deepEqual(planDates(p, `${y}-01-01`, `${y}-12-31`), server(p, `${y}-01-01`, `${y}-12-31`), `${p.interval_type} ${p.interval_value} ${p.anchor_date} → ${y}`);
    }
  }
  // Cuối tháng giữ ngày mốc: 31/01 → 28/02 → 31/03
  assert.deepEqual(planDates({ interval_type: 'MONTH', interval_value: 1, anchor_date: '2026-01-31' }, '2027-01-01', '2027-04-30'),
    ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  // Thiếu mốc / chu kỳ 0 / theo giờ chạy: không đoán
  assert.deepEqual(planDates({ interval_type: 'MONTH', interval_value: 0, anchor_date: '2026-01-01' }, '2026-01-01', '2026-12-31'), []);
  assert.deepEqual(planDates({ interval_type: 'MONTH', interval_value: 1, anchor_date: '' }, '2026-01-01', '2026-12-31'), []);
  assert.deepEqual(planDates({ interval_type: 'OPERATING_HOURS', interval_value: 500, anchor_date: '2026-01-01' }, '2026-01-01', '2026-12-31'), []);
});

const rd = (day, h, extra = {}) => ({ equipment_id: 'E1', measured_at: `${day}T08:00:00+07:00`, cumulative_hours: h, ...extra });

test('hoursRate: cần ≥ 2 lần đọc cách ≥ 7 ngày, giờ tăng, sau lần đặt lại gần nhất, trong 90 ngày tới lần mới nhất', () => {
  assert.equal(hoursRate([]), null);
  assert.equal(hoursRate([rd('2026-10-01', 100)]), null);
  assert.equal(hoursRate([rd('2026-10-01', 100), rd('2026-10-05', 140)]), null, 'cách 4 ngày: chưa đủ');
  assert.equal(hoursRate([rd('2026-10-01', 100), rd('2026-10-11', 100)]), null, 'giờ không tăng');
  const r = hoursRate([rd('2026-10-11', 200), rd('2026-10-01', 100)]);
  assert.deepEqual(r, { perDay: 10, latestHours: 200, latestDate: '2026-10-11' });
  // Lần đọc cũ hơn 90 ngày bị bỏ; lần đọc đã xóa bị bỏ
  const r2 = hoursRate([rd('2026-01-01', 0), rd('2026-09-01', 1000), rd('2026-09-21', 1100), rd('2026-09-25', 9999, { archived_at: '2026-09-26T00:00:00+07:00' })]);
  assert.equal(r2.perDay, 5);
  // Đặt lại đồng hồ: chỉ tính từ lần đặt lại
  assert.equal(hoursRate([rd('2026-09-01', 5000), rd('2026-09-20', 5200), rd('2026-10-01', 0, { is_reset: true }), rd('2026-10-03', 20)]), null);
  assert.equal(hoursRate([rd('2026-09-01', 5000), rd('2026-10-01', 0, { is_reset: true }), rd('2026-10-11', 80)]).perDay, 8);
});

test('hoursDates: mốc kế tiếp theo tốc độ chạy, lặp theo chu kỳ; đã quá mốc thì từ hôm nay; có phiếu mở thì bỏ một lần; không có tốc độ thì không đoán', () => {
  const rate = { perDay: 10, latestHours: 900, latestDate: '2026-10-01' };
  const plan = { interval_type: 'OPERATING_HOURS', interval_value: 500, operating_hours_target: 1000 };
  // 100 h còn lại ÷ 10 h/ngày = 10 ngày → 11/10, rồi mỗi 50 ngày
  assert.deepEqual(hoursDates(plan, rate, '2026-01-01', '2026-12-31', '2026-10-05', false), ['2026-10-11', '2026-11-30']);
  assert.deepEqual(hoursDates(plan, { ...rate, latestHours: 1200 }, '2026-01-01', '2026-12-31', '2026-10-05', false), ['2026-10-05', '2026-11-24']);
  assert.deepEqual(hoursDates(plan, rate, '2026-01-01', '2026-12-31', '2026-10-05', true), ['2026-11-30']);
  assert.deepEqual(hoursDates(plan, null, '2026-01-01', '2026-12-31', '2026-10-05', false), []);
  // Năm sau: chỉ các lần rơi vào năm đó
  assert.deepEqual(hoursDates(plan, rate, '2027-01-01', '2027-03-31', '2026-10-05', false), ['2027-01-19', '2027-03-10']);
});

test('tally/pct: chỉ lần đã tới hạn vào %, làm sớm tính xong, ước tính và phiếu ngoài lịch không vào kế hoạch; chưa tới hạn → % trống', () => {
  const T = '2026-06-15';
  const t = tally([
    { date: '2026-01-10', st: 'done' }, { date: '2026-02-10', st: 'late' }, { date: '2026-03-10', st: 'missed' },
    { date: '2026-04-10', st: 'cancelled' }, { date: '2026-05-10', st: 'overdue' }, { date: '2026-07-10', st: 'done' },
    { date: '2026-08-10', st: 'planned' }, { date: '2026-09-10', st: 'planned', est: true }, { date: '2026-03-20', st: 'done', extra: true }
  ], T);
  assert.deepEqual(t, { planned: 7, est: 1, extra: 1, due: 6, done: 3, onTime: 2, missed: 3 });
  assert.equal(pct(t.done, t.due), 50);
  assert.equal(pct(0, 0), null);
  assert.deepEqual(tally([{ date: '2026-08-10', st: 'planned' }], T), { planned: 1, est: 0, extra: 0, due: 0, done: 0, onTime: 0, missed: 0 });
});

test('yearModel: ghép phiếu theo hạn rồi theo tháng, phiếu thừa là ngoài lịch, kế hoạch ngừng, kiểm định, dịch vụ HĐ, nhóm theo loại', () => {
  const lookups = [
    { value_id: 'C-CH', group_key: 'EQUIPMENT_CATEGORY', name_vi: 'Chiller', name_zh: '冷水机组' },
    { value_id: 'C-AC', group_key: 'EQUIPMENT_CATEGORY', name_vi: 'Máy nén khí', name_zh: '空压机' },
    { value_id: 'X', group_key: 'OTHER', name_vi: 'Khác' }
  ];
  const equipment = [
    { equipment_id: 'E1', equipment_code: 'TB-0002', name_vi: 'Máy nén khí 02', category_id: 'C-AC' },
    { equipment_id: 'E2', equipment_code: 'TB-0001', name_vi: 'Máy nén khí 01', category_id: 'C-AC' },
    { equipment_id: 'E3', equipment_code: 'TB-0003', name_vi: 'Chiller 01', category_id: 'C-CH' },
    { equipment_id: 'E4', equipment_code: 'TB-0004', name_vi: 'Bơm', category_id: '' },
    { equipment_id: 'E5', equipment_code: 'TB-0005', name_vi: 'Đã xóa', category_id: 'C-CH', archived_at: '2026-01-01T00:00:00+07:00' }
  ];
  const plans = [
    { plan_id: 'P1', plan_code: 'KH-0001', equipment_id: 'E1', interval_type: 'MONTH', interval_value: 1, anchor_date: '2025-11-10', active: true, created_at: '2025-11-01T09:00:00+07:00' },
    // Lập giữa năm: không tính các lần trước ngày lập
    { plan_id: 'P2', plan_code: 'KH-0002', equipment_id: 'E2', interval_type: 'MONTH', interval_value: 3, anchor_date: '2026-01-20', active: true, created_at: '2026-05-02T09:00:00+07:00' },
    // Ngừng ngày 15/03: chỉ còn các lần trước đó
    { plan_id: 'P3', plan_code: 'KH-0003', equipment_id: 'E3', interval_type: 'DAY', interval_value: 30, anchor_date: '2026-01-05', active: false, created_at: '2025-12-01T00:00:00+07:00', updated_at: '2026-03-15T10:00:00+07:00' },
    { plan_id: 'P4', plan_code: 'KH-0004', equipment_id: 'E5', interval_type: 'MONTH', interval_value: 1, anchor_date: '2026-01-01', active: true, created_at: '2025-12-01T00:00:00+07:00' },
    { plan_id: 'P5', plan_code: 'KH-0005', equipment_id: 'E4', interval_type: 'OPERATING_HOURS', interval_value: 500, operating_hours_target: 1000, active: true, created_at: '2025-12-01T00:00:00+07:00' }
  ];
  const workOrders = [
    { work_order_id: 'W1', plan_id: 'P1', due_date: '2026-01-10', status: 'COMPLETED', end_at: '2026-01-09T15:00:00+07:00' },
    { work_order_id: 'W2', plan_id: 'P1', due_date: '2026-02-10', status: 'COMPLETED', end_at: '2026-02-13T15:00:00+07:00' },
    { work_order_id: 'W3', plan_id: 'P1', due_date: '2026-03-12', status: 'CANCELLED' }, // dời hạn trong tháng: vẫn ghép tháng 3
    { work_order_id: 'W4', plan_id: 'P1', due_date: '2026-05-10', status: 'IN_PROGRESS' },
    { work_order_id: 'W5', plan_id: 'P1', due_date: '2026-03-25', status: 'COMPLETED', end_at: '2026-03-25T10:00:00+07:00' }, // thừa → ngoài lịch
    { work_order_id: 'W6', plan_id: 'P1', due_date: '2026-07-10', status: 'COMPLETED', end_at: '2026-06-01T10:00:00+07:00' }, // làm sớm
    { work_order_id: 'W7', plan_id: 'P5', due_date: '2026-04-01', status: 'COMPLETED', end_at: '2026-04-01T10:00:00+07:00' },
    { work_order_id: 'W8', due_date: '2026-04-01', status: 'COMPLETED' } // không theo kế hoạch: bỏ
  ];
  const readings = [rd('2026-06-01', 900, { equipment_id: 'E4' }), rd('2026-06-11', 1000, { equipment_id: 'E4' })];
  const requirements = [
    { requirement_id: 'R1', requirement_code: 'KD-0001', equipment_id: 'E3', inspection_type_id: 'T1', current_due_date: '2026-09-30', active: true },
    { requirement_id: 'R2', requirement_code: 'KD-0002', equipment_id: 'E2', inspection_type_id: 'T1', current_due_date: '2026-02-01', active: true },
    { requirement_id: 'R3', requirement_code: 'KD-0003', equipment_id: 'E2', inspection_type_id: 'T1', current_due_date: '2027-02-01', active: true }
  ];
  const inspections = [
    { inspection_id: 'I1', requirement_id: 'R3', inspection_date: '2026-01-28', status: 'APPROVED' },
    { inspection_id: 'I2', requirement_id: 'R3', inspection_date: '2026-01-20', status: 'SUBMITTED' }
  ];
  const contracts = [{ contract_id: 'K1', contract_code: 'HD-0001', lifecycle_status: 'ACTIVE' }, { contract_id: 'K2', contract_code: 'HD-0002', lifecycle_status: 'EXPIRED' }];
  const contractEquipment = [
    { contract_equipment_id: 'CE1', contract_id: 'K1', equipment_id: 'E3', next_service_date: '2026-10-15' },
    { contract_equipment_id: 'CE2', contract_id: 'K2', equipment_id: 'E3', next_service_date: '2026-11-15' }
  ];
  const services = [
    { service_id: 'S1', contract_id: 'K1', contract_equipment_id: 'CE1', due_date: '2026-04-15', performed_at: '2026-04-20T09:00:00+07:00' },
    { service_id: 'S2', contract_id: 'K1', contract_equipment_id: 'CE1', due_date: '2026-07-15' }
  ];
  const m = yearModel({ year: 2026, today: '2026-06-15', equipment, lookups, plans, workOrders, readings, requirements, inspections, inspectionTypes: [{ inspection_type_id: 'T1', name_vi: 'Áp lực' }], services, contractEquipment, contracts });

  // Nhóm: theo tên loại, chưa phân loại cuối
  assert.deepEqual(m.groups.map((g) => g.key), ['C-CH', 'C-AC', '']);
  const ac = m.groups[1];
  assert.equal(ac.machines, 2);
  assert.deepEqual(ac.rows.map((r) => `${r.eq.equipment_code}:${r.kind}`), ['TB-0001:PLAN', 'TB-0001:INSPECTION', 'TB-0001:INSPECTION', 'TB-0002:PLAN']);

  // P1 theo tháng: T1 đúng hạn, T2 trễ, T3 phiếu hủy (ghép theo tháng) + phiếu thừa ngoài lịch, T4 bỏ sót, T5 đang làm (quá hạn), T7 làm sớm
  const p1 = ac.rows[3];
  const flat = p1.months.flat().map((e) => `${e.date}:${e.st}${e.extra ? '+' : ''}`);
  assert.deepEqual(flat, ['2026-01-10:done', '2026-02-10:late', '2026-03-10:cancelled', '2026-03-25:done+', '2026-04-10:missed', '2026-05-10:overdue',
    '2026-06-10:missed', '2026-07-10:done', '2026-08-10:planned', '2026-09-10:planned', '2026-10-10:planned', '2026-11-10:planned', '2026-12-10:planned']);
  assert.deepEqual(p1.tally, { planned: 12, est: 0, extra: 1, due: 7, done: 3, onTime: 2, missed: 4 });

  // P2 lập 02/05: các lần từ 20/07, không có 20/01, 20/04
  assert.deepEqual(ac.rows[0].months.flat().map((e) => e.date), ['2026-07-20', '2026-10-20']);
  // R2 quá hạn chưa có chứng nhận → bỏ sót; R3 chứng nhận đã duyệt (bản nộp chưa duyệt bỏ qua), hạn mới ở năm sau
  assert.deepEqual(ac.rows[1].months.flat().map((e) => `${e.date}:${e.st}`), ['2026-02-01:missed']);
  assert.deepEqual(ac.rows[2].months.flat().map((e) => `${e.date}:${e.st}`), ['2026-01-28:done']);

  // Chiller: P3 ngừng 15/03 → 05/01, 04/02, 06/03; kiểm định 30/09; dịch vụ HĐ hiệu lực (xong trễ 20/04, 15/07 dự kiến, 15/10 kỳ tới); HĐ hết hạn bỏ
  const ch = m.groups[0];
  assert.deepEqual(ch.rows.map((r) => r.kind), ['PLAN', 'INSPECTION', 'SERVICE']);
  assert.deepEqual(ch.rows[0].months.flat().map((e) => `${e.date}:${e.st}`), ['2026-01-05:missed', '2026-02-04:missed', '2026-03-06:missed']);
  assert.deepEqual(ch.rows[2].months.flat().map((e) => `${e.date}:${e.st}`), ['2026-04-20:late', '2026-07-15:planned', '2026-10-15:planned']);
  assert.equal(ch.machines, 1, 'máy đã xóa không vào bảng');

  // Theo giờ chạy: phiếu thật + ước tính (10 h/ngày, đã tới mốc 1000 h → từ hôm nay, mỗi 50 ngày); ước tính không vào %
  const hrs = m.groups[2].rows[0];
  assert.equal(hrs.kind, 'HOURS');
  assert.deepEqual(hrs.months.flat().map((e) => `${e.date}:${e.st}${e.est ? '≈' : ''}`),
    ['2026-04-01:done', '2026-06-15:planned≈', '2026-08-04:planned≈', '2026-09-23:planned≈', '2026-11-12:planned≈']);
  assert.deepEqual(hrs.tally, { planned: 1, est: 4, extra: 0, due: 1, done: 1, onTime: 1, missed: 0 });

  // Tổng tháng/năm cộng đúng từ các dòng
  assert.equal(m.tally.planned, m.groups.reduce((n, g) => n + g.tally.planned, 0));
  assert.equal(m.monthTally.reduce((n, t) => n + t.due, 0), m.tally.due);
  // Năm không có gì: không nhóm
  assert.deepEqual(yearModel({ year: 2030, today: '2026-06-15', equipment, lookups, plans: [], workOrders: [] }).groups, []);
});
