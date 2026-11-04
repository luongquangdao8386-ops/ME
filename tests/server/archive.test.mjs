// d4.27: lưu trữ theo năm — chuyển chỉ số, ảnh chỉ số, nhật ký, thao tác, dòng nhập Excel cũ sang tệp lưu trữ (Backups/LuuTru);
// giữ lần đọc mới nhất mỗi đồng hồ làm mốc tính tiếp; sao lưu trước; chạy theo bước; chỉ Quản trị, PIN; chỉ năm đã kết thúc từ 01/02 năm sau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Hôm nay 05/02/2027. MSB1 → A (nhánh) đọc mỗi ngày 01/11/2026 – 04/02/2027; dữ liệu cũ chèn thẳng: ảnh chỉ số, nhật ký, thao tác, lô nhập 2026 */
function setup() {
  const env = freshServer({ now: '2027-02-05T22:00:00+07:00' });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const id = { MSB1: uuid(), A: uuid() };
  ok(c.write('meter.edit', { meter_id: id.MSB1, meter_code: 'MSB1', name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  ok(c.write('meter.edit', { meter_id: id.A, meter_code: 'A', name_vi: 'Xưởng A', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1', parent_meter_id: id.MSB1 }));
  let e = 1000, a = 500;
  const readIds = {};
  for (let d = '2026-11-01'; d <= '2027-02-04'; d = shift(d, 1)) {
    const r1 = uuid();
    readIds[d] = r1;
    ok(dn.write('reading.create', { reading_id: r1, meter_id: id.MSB1, measured_at: `${d}T08:00:00+07:00`, cumulative_value: e }));
    ok(dn.write('reading.create', { reading_id: uuid(), meter_id: id.A, measured_at: `${d}T08:01:00+07:00`, cumulative_value: a }));
    e += 100; a += 60;
  }
  const g = env.g;
  const doc = (rid) => ({ document_id: uuid(), entity_type: 'METER_READING', entity_id: rid, kind: 'PHOTO_METER', drive_file_id: 'f_x', title_vi: 'Ảnh', active: true, created_at: '2026-11-10T08:00:00+07:00' });
  g.insertRows_('Documents', [doc(readIds['2026-11-10']), doc(readIds['2027-01-10'])]);
  g.insertRows_('AuditLogs', [1, 2, 3].map((i) => ({ audit_id: uuid(), occurred_at: `2026-06-0${i}T09:00:00+07:00`, user_id: 'x', action: 'equipment.edit' })));
  g.insertRows_('Operations', [
    { operation_id: uuid(), received_at: '2026-05-01T09:00:00+07:00', state: 'COMMITTED', action: 'equipment.edit' },
    { operation_id: uuid(), received_at: '2026-05-02T09:00:00+07:00', state: 'PREPARED', action: 'equipment.edit' }
  ]);
  const b1 = uuid(), b2 = uuid();
  g.insertRows_('ImportBatches', [
    { import_batch_id: b1, module: 'equipment', imported_at: '2026-04-01T09:00:00+07:00', status: 'COMMITTED' },
    { import_batch_id: b2, module: 'equipment', imported_at: '2026-04-02T09:00:00+07:00', status: 'PENDING_APPROVAL' }
  ]);
  g.insertRows_('ImportRows', [
    { import_row_id: uuid(), import_batch_id: b1, row_number: 2 }, { import_row_id: uuid(), import_batch_id: b1, row_number: 3 },
    { import_row_id: uuid(), import_batch_id: b2, row_number: 2 }
  ]);
  g.dbReset_();
  return { env, c, c3, id, readIds };
}

const runAll = (c) => {
  let r;
  for (let i = 0; i < 30; i++) {
    r = ok(c.call('archive.step', {})).data.run;
    if (r.phase === 'DONE' || r.phase === 'FAILED') return r;
  }
  return r;
};

test('xem trước: năm 2026 chọn được từ 01/02/2027, đếm dòng sẽ chuyển; chỉ Quản trị; bắt đầu cần PIN; năm chưa tới hạn bị chặn', () => {
  const { env, c, c3 } = setup();
  const v = ok(c.call('archive.view', {})).data;
  assert.equal(v.years.length, 1);
  const y = v.years[0];
  assert.equal(y.year, 2026);
  assert.equal(y.allowed, true);
  // 61 ngày × 2 đồng hồ = 122 chỉ số năm 2026; giữ lần đọc mới nhất mỗi đồng hồ (31/12) → chuyển 120
  assert.equal(y.counts.MeterReadings, 120);
  assert.equal(y.counts.readings_kept, 2);
  assert.equal(y.counts.Documents, 1, 'ảnh của chỉ số 10/11/2026');
  assert.equal(y.counts.Operations, 1, 'thao tác PREPARED giữ lại');
  assert.equal(y.counts.ImportRows, 2, 'chỉ lô đã xong');
  assert.ok(y.counts.AuditLogs >= 3);
  assert.equal(c3.call('archive.view', {}).code, 'FORBIDDEN');
  assert.equal(c.write('archive.start', { year: 2026 }).code, 'REAUTH_REQUIRED');
  assert.equal(c.write('archive.start', { year: 2027 }, { reauth_token: c.reauth() }).code, 'VALIDATION_ERROR', 'năm chưa kết thúc');
  env.clock.offset = Date.parse('2027-01-20T10:00:00+07:00') - Date.now(); env.g.dbReset_();
  const r = c.write('archive.start', { year: 2026 }, { reauth_token: c.reauth() });
  assert.equal(r.code, 'VALIDATION_ERROR');
  assert.equal(r.errors[0].code, 'ARCHIVE_TOO_EARLY');
});

test('chạy: sao lưu trước, chép sang tệp lưu trữ (Tổng kết, Cân bằng, từng bảng) rồi xóa khỏi bảng chính; giữ mốc tính tiếp; báo cáo tháng 1/2027 vẫn đủ số; không chạy lại cùng năm', () => {
  const { env, c, c3, id } = setup();
  const before = env.rows('MeterReadings').length;
  ok(c.write('archive.start', { year: 2026 }, { reauth_token: c.reauth() }));
  const run = runAll(c);
  assert.equal(run.phase, 'DONE', JSON.stringify(run));
  assert.deepEqual(run.moved, { MeterReadings: 120, Documents: 1, AuditLogs: run.moved.AuditLogs, Operations: 1, ImportRows: 2 });
  assert.ok(run.backup_ref, 'đã sao lưu trước');
  assert.equal(env.g.readState_().map.last_backup_status, 'VERIFIED');
  // Bảng chính
  const reads = env.rows('MeterReadings');
  assert.equal(reads.length, before - 120);
  assert.deepEqual(reads.filter((r) => String(r.measured_at) < '2027').map((r) => String(r.measured_at).slice(0, 10)).sort(), ['2026-12-31', '2026-12-31'], 'giữ lần đọc cuối năm mỗi đồng hồ');
  assert.equal(env.rows('Documents').filter((d) => d.entity_type === 'METER_READING').length, 1, 'ảnh chỉ số 2027 giữ lại');
  assert.equal(env.rows('Operations').filter((o) => String(o.received_at) < '2027').length, 1, 'PREPARED giữ lại');
  assert.equal(env.rows('ImportRows').length, 1);
  assert.equal(env.rows('AuditLogs').filter((x) => String(x.occurred_at) < '2027').length, 0);
  // Tệp lưu trữ
  const book = env.g.SpreadsheetApp.openById(run.file_url.split('/d/')[1].split('/')[0]);
  const names = book.getSheets().map((s) => s.getName());
  for (const n of ['Tổng kết · 总结', 'Cân bằng · 平衡', 'MeterReadings', 'Documents', 'AuditLogs', 'Operations', 'ImportRows', 'Thông tin · 信息']) assert.ok(names.includes(n), n + ' trong ' + names.join(','));
  assert.equal(book.getSheetByName('MeterReadings').getLastRow(), 121, 'tiêu đề + 120 dòng');
  const sum = book.getSheetByName('Tổng kết · 总结').getDataRange().getValues();
  const msb = sum.find((r) => r[0] === 'MSB1');
  assert.equal(msb[5 + 10], 3000, 'tháng 11/2026: 30 ngày × 100');
  assert.equal(msb[5 + 11], 3100, 'tháng 12/2026');
  const bal = book.getSheetByName('Cân bằng · 平衡').getDataRange().getValues();
  assert.equal(bal[1][0], 'MSB1');
  assert.equal(bal[1][5 + 10], '40 % (Vượt ngưỡng)', 'A dùng 60 % của tổng');
  const files = [...env.drive._files.values()].filter((f) => f.id === book.getId());
  const folder = env.drive._folders.get(files[0].parent);
  assert.equal(folder.name, 'LuuTru');
  // Báo cáo tháng 1/2027 vẫn đủ số (mốc đầu kỳ 01/01/2027 còn), danh sách năm đã lưu trữ
  const rep = ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'MONTH', date: '2027-01-01', meter_id: id.MSB1 } })).data;
  assert.equal(rep.rows[0].status, 'OK');
  assert.equal(rep.rows[0].consumption, 3100);
  const v = ok(c.call('archive.view', {})).data;
  assert.equal(v.years.length, 0);
  assert.equal(v.archives[0].year, 2026);
  assert.ok(v.archives[0].file_url.startsWith('https://docs.google.com/spreadsheets/d/'));
  const again = c.write('archive.start', { year: 2026 }, { reauth_token: c.reauth() });
  assert.equal(again.errors[0].code, 'ARCHIVE_DONE');
  assert.ok(env.rows('AuditLogs').some((x) => x.action === 'archive.done'));
});
