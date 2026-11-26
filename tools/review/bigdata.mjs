// Dữ liệu lớn (rà soát lượt 4): nhân bản dòng thật thành 1 000 thiết bị, 5 000 phiếu bảo trì × 10 kết quả checklist, 30 đồng hồ × ~670 ngày
// chỉ số (20 000), rồi đo: sync.bootstrap (số trang, cỡ trang, có trả đủ không), sync.changes sau một lần ghi, các màn xem tính ở máy chủ,
// đệm bảng (tableCache_) — bảng nào vượt ~1,2 triệu ký tự thì không đệm. Cách chạy: tools/review/README.md
// Tham số môi trường: EQ=1000 WO=5000 RES=10 METERS=30 DAYS=670 PAGE=500 (sync_page_size)
import { freshServer, ownerClient, uuid } from '../../tests/helpers.mjs';

const N = (k, d) => Number(process.env[k] || d);
const EQ = N('EQ', 1000), WO = N('WO', 5000), RES = N('RES', 10), METERS = N('METERS', 30), DAYS = N('DAYS', 670);
const ok = (r, what) => { if (!r.ok) throw new Error((what || '') + ' ' + JSON.stringify(r).slice(0, 400)); return r; };
const env = freshServer({ now: '2026-11-26T09:00:00+07:00' });
const g = env.g;
const c = ownerClient(env);
const t0 = Date.now();

// 1. Một bản ghi thật mỗi loại qua API
const eq0 = uuid(), tpl = uuid(), plan = uuid(), m0 = uuid();
ok(c.write('equipment.create', { equipment_id: eq0, name_vi: 'Máy nén khí trục vít 75 kW', model: 'GA75', serial_no: 'SN-0001' }), 'eq');
ok(c.write('maintenance.checklist.edit', {
  template_id: tpl, template_name_vi: 'Bảo dưỡng tháng máy nén',
  items: Array.from({ length: RES }, (_, i) => ({ label_vi: 'Bước ' + (i + 1) + ': kiểm tra rò rỉ, độ rung, nhiệt độ', result_type: 'PASS_FAIL', required: true }))
}), 'checklist');
ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eq0, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: g.todayVN_(), checklist_template_id: tpl }), 'plan');
ok(c.write('meter.edit', { meter_id: m0, name_vi: 'Điện xưởng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }), 'meter');
const isoAt = (daysAgo) => g.isoVN_(new Date(Date.parse('2026-11-26T08:00:00+07:00') - daysAgo * 86400000));
ok(c.write('reading.create', { reading_id: uuid(), meter_id: m0, measured_at: isoAt(DAYS + 1), cumulative_value: 1000 }), 'reading');

// 2. Nhân bản thẳng vào sheet (một khối ghi), rồi tăng phiên bản bảng như một lần ghi
g.dbReset_();
const one = (sheet, pred) => { const r = g.readRows_(sheet).find(pred || (() => true)); const o = { ...r }; delete o.__row; return o; };
const eqRow = one('Equipment'), woRow = one('WorkOrders'), resRows = g.readRows_('WorkOrderResults').map((r) => { const o = { ...r }; delete o.__row; return o; });
const mRow = one('Meters'), segRow = one('MeterSegments'), rdRow = one('MeterReadings');
const pad = (n, w = 5) => String(n).padStart(w, '0');
const eqs = [], wos = [], res = [], meters = [], segs = [], rds = [];
for (let i = 1; i < EQ; i++) eqs.push({ ...eqRow, equipment_id: uuid(), equipment_code: 'TB-' + pad(i), name_vi: eqRow.name_vi + ' số ' + i, serial_no: 'SN-' + pad(i) });
const eqIds = [eq0].concat(eqs.map((e) => e.equipment_id));
for (let i = 1; i < WO; i++) {
  const id = uuid();
  const due = g.addDaysIso_(g.todayVN_(), -Math.floor(i / 5));
  wos.push({ ...woRow, work_order_id: id, work_order_code: 'BT-' + pad(i, 6), equipment_id: eqIds[i % eqIds.length], due_date: due, status: i % 7 ? 'COMPLETED' : 'ASSIGNED' });
  resRows.forEach((r) => res.push({ ...r, result_id: uuid(), work_order_id: id, result_status: 'PASS' }));
}
for (let i = 1; i < METERS; i++) {
  const mid = uuid(), sid = uuid();
  meters.push({ ...mRow, meter_id: mid, meter_code: 'DH-' + pad(i, 3), name_vi: 'Đồng hồ ' + i, current_segment_id: sid });
  segs.push({ ...segRow, segment_id: sid, meter_id: mid });
}
const allM = [[mRow.meter_id, segRow.segment_id]].concat(meters.map((m, i) => [m.meter_id, segs[i].segment_id]));
allM.forEach(([mid, sid]) => { for (let d = DAYS; d >= 0; d--) rds.push({ ...rdRow, reading_id: uuid(), meter_id: mid, meter_segment_id: sid, measured_at: isoAt(d), cumulative_value: 1000 + (DAYS - d) * 120, reading_kind: 'NORMAL', event_id: '' }); });
g.withWriteLock_(() => {
  const rev = Number(g.stateGet_(g.readState_(), 'sync_revision', 0));
  [['Equipment', eqs], ['WorkOrders', wos], ['WorkOrderResults', res], ['Meters', meters], ['MeterSegments', segs], ['MeterReadings', rds]].forEach(([s, list]) => {
    list.forEach((r) => { r.sync_revision = rev; });
    for (let k = 0; k < list.length; k += 20000) g.insertRows_(s, list.slice(k, k + 20000));
    g.resetBumpTable_(s);
  });
});
g.dbReset_();
const count = (s) => env.rows(s).length;
console.log('dữ liệu:', ['Equipment', 'WorkOrders', 'WorkOrderResults', 'Meters', 'MeterReadings'].map((s) => s + ' ' + count(s)).join(' · '), `(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const jsLen = (s) => JSON.stringify(env.rows(s)).length;
['Equipment', 'WorkOrders', 'WorkOrderResults', 'MeterReadings'].forEach((s) => {
  const n = jsLen(s);
  console.log(`  ${s.padEnd(18)} JSON ${(n / 1e6).toFixed(2)} triệu ký tự → ${n <= g.TBL_CHUNK_ * g.TBL_MAX_CHUNKS_ ? 'có đệm' : 'KHÔNG đệm (đọc Sheets mỗi lần)'}`);
});

// 3. sync.bootstrap đủ trang
if (process.env.PAGE) {
  const rt = c.call('auth.reauth', { pin: '604817' }).data.reauth_token;
  ok(c.call('settings.edit', { changes: { sync_page_size: Number(process.env.PAGE) }, reason: 'thử' }, { operation_id: uuid(), reauth_token: rt }), 'page size');
}
let tok = null, cur = null, pages = 0, maxLen = 0, recs = {}, t1 = Date.now();
do {
  const r = ok(c.call('sync.bootstrap', tok ? { page_token: tok, sync_cursor: cur } : {}), 'bootstrap');
  pages++;
  maxLen = Math.max(maxLen, JSON.stringify(r).length);
  cur = r.data.sync_cursor; tok = r.data.next_page_token;
  for (const [t, l] of Object.entries(r.data.records)) recs[t] = (recs[t] || 0) + l.length;
} while (tok && pages < 2000);
const total = Object.values(recs).reduce((a, b) => a + b, 0);
const recentFrom = g.isoVN_(new Date(env.clock.Date.now() - 45 * 86400000)); // như máy chủ: 45 ngày tính tới giờ hiện tại
const expReadings = rds.concat([rdRow]).filter((r) => r.measured_at >= recentFrom).length;
console.log(`sync.bootstrap: ${pages} trang · ${total} bản ghi · trang lớn nhất ${(maxLen / 1e6).toFixed(2)} triệu ký tự · ${((Date.now() - t1) / 1000).toFixed(1)} s`);
console.log('  ', Object.entries(recs).map(([t, n]) => t + ' ' + n).join(' · '));
const exp = { EQUIPMENT: EQ, WORK_ORDER: WO, WO_RESULT: WO * RES };
let bad = 0;
for (const [t, n] of Object.entries(exp)) if (recs[t] !== n) { bad++; console.log('  THIẾU', t, recs[t], '≠', n); }
if (!(recs.METER_READING >= expReadings)) { bad++; console.log('  THIẾU chỉ số', recs.METER_READING, '<', expReadings); }
console.log(`  app trước d4.42 (dừng sau 50 trang) ${pages > 50 ? 'THIẾU dữ liệu' : 'đủ'}; app hiện tại đọc tới 1 000 trang`);

// 4. Một lần ghi rồi sync.changes
ok(c.write('equipment.edit', { equipment_id: eq0, name_vi: 'Máy nén khí trục vít 75 kW (đã sửa)' }, { expected_version: 1 }), 'edit');
const ch = ok(c.call('sync.changes', { cursor: cur, limit: 500 }), 'changes');
console.log(`sync.changes sau 1 lần sửa: ${ch.data.changes.length} thay đổi · ${JSON.stringify(ch).length} ký tự`);
if (ch.data.changes.length !== 1) { bad++; console.log('  SAI số thay đổi'); }

// 5. Các màn tính ở máy chủ
for (const [a, p] of [['utility.view', {}], ['maintenance.view', {}], ['maintenance.view', { work_order_id: wos[0].work_order_id }], ['equipment.view', { equipment_id: eq0 }]]) {
  const t2 = Date.now();
  const r = c.call(a, p);
  if (r.code === 'NOT_FOUND' || r.code === 'UNKNOWN_ACTION' || r.code === 'VALIDATION_ERROR') continue;
  if (!r.ok) { bad++; console.log('  LỖI', a, r.code); continue; }
  console.log(`${a}: ${JSON.stringify(r).length} ký tự · ${((Date.now() - t2) / 1000).toFixed(1)} s`);
}
const internal = env.logs.filter((l) => /INTERNAL_ERROR/.test(l));
console.log('lỗi máy chủ', internal.length, internal.slice(0, 2).join('\n').slice(0, 600), '· sai', bad);
