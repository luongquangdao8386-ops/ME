// Tốc độ đăng nhập/đồng bộ: đăng nhập kèm trang dữ liệu đầu (một lượt gọi), đệm bảng theo table_rev (bảng không đổi
// không đọc lại Google Sheets) — luôn trả đúng dữ liệu mới nhất sau mỗi lần ghi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, makeClient, userClient, OWNER_CODE, OWNER_PIN, OWNER_TEMP_PIN, uuid } from '../helpers.mjs';

/** Đếm lần gọi Google Sheets (giả lập) trong fn */
function sheetCalls(env, fn) {
  const sheet = env.ssApp.openById(env.props.getProperty('BUSINESS_SPREADSHEET_ID')).getSheets()[0];
  const protos = [Object.getPrototypeOf(sheet), Object.getPrototypeOf(sheet.getRange(1, 1))];
  const names = [['getLastRow', 'getLastColumn', 'getDataRange'], ['getValues']];
  let n = 0, inner = 0;
  const saved = [];
  protos.forEach((P, i) => names[i].forEach((m) => {
    const f = P[m]; saved.push([P, m, f]);
    P[m] = function (...a) { if (!inner) n++; inner++; try { return f.apply(this, a); } finally { inner--; } };
  }));
  try { fn(); } finally { saved.forEach(([P, m, f]) => { P[m] = f; }); }
  return n;
}
const norm = (recs) => JSON.stringify(Object.keys(recs).sort().map((k) => [k, recs[k].map((r) => JSON.stringify(r)).sort()]));

test('đăng nhập kèm trang dữ liệu đầu (with_bootstrap): một lượt gọi đủ dữ liệu như sync.bootstrap; không cờ thì như cũ; PIN tạm thì không kèm', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const d = makeClient(env);
  const r = d.call('auth.login', { employee_code: OWNER_CODE, pin: OWNER_PIN, device_label: 't', login_id: uuid(), with_bootstrap: true });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  const b = r.data.bootstrap;
  assert.ok(b && b.records && b.records.EQUIPMENT.length > 0, 'có dữ liệu');
  assert.ok(b.permissions && b.settings && b.sync_cursor, 'có quyền, cấu hình, cursor');
  d.token = r.data.token;
  const ref = d.call('sync.bootstrap', {}).data;
  assert.equal(norm(b.records), norm(ref.records), 'giống hệt sync.bootstrap');
  // Không cờ: không kèm (app cũ)
  const e = makeClient(env);
  const r2 = e.call('auth.login', { employee_code: OWNER_CODE, pin: OWNER_PIN, device_label: 't', login_id: uuid() });
  assert.equal(r2.ok, true);
  assert.equal(r2.data.bootstrap, undefined);
  // Người mới đăng nhập bằng PIN tạm: MUST_CHANGE_PIN, không kèm dữ liệu
  const env2 = freshServer();
  const f = makeClient(env2);
  const r3 = f.call('auth.login', { employee_code: OWNER_CODE, pin: OWNER_TEMP_PIN, device_label: 't', login_id: uuid(), with_bootstrap: true });
  assert.equal(r3.code, 'MUST_CHANGE_PIN');
  assert.equal((r3.data || {}).bootstrap, undefined);
});

test('đệm bảng theo table_rev: tải lại khi không đổi gần như không gọi Sheets; ghi mới (máy này, máy khác) → bootstrap/changes trả đúng bản mới, giống hệt khi không đệm', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const k = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  const first = sheetCalls(env, () => c.call('sync.bootstrap', {}));
  const again = sheetCalls(env, () => c.call('sync.bootstrap', {}));
  assert.ok(again < first / 5, `lần sau ${again} lần gọi, lần đầu ${first}`);
  // Ghi một thiết bị → bootstrap thấy ngay
  const id = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: id, name_vi: 'Máy mới sau đệm' }).ok, true);
  let b = c.call('sync.bootstrap', {}).data;
  assert.ok(b.records.EQUIPMENT.some((x) => x.equipment_id === id), 'bootstrap có máy mới');
  // Máy khác báo sự cố → changes của máy này có phiếu, bootstrap cũng có
  const cur = Number(b.sync_cursor);
  const rid = uuid();
  assert.equal(k.write('repair.report', { repair_id: rid, equipment_id: id, symptom_vi: 'Kêu to', severity: 'LOW' }).ok, true);
  const ch = c.call('sync.changes', { cursor: cur }).data.changes;
  assert.ok(ch.some((x) => x.entity_type === 'REPAIR' && x.entity_id === rid));
  b = c.call('sync.bootstrap', {}).data;
  assert.ok(b.records.REPAIR.some((x) => x.repair_id === rid));
  // So với khi không có đệm (xóa sạch đệm): giống hệt
  env.cache._map.clear();
  const ref = c.call('sync.bootstrap', {}).data;
  assert.equal(norm(b.records), norm(ref.records));
  // Người khác quyền: cùng đệm bảng thô nhưng lọc theo quyền riêng (KT không thấy biểu giá/cột giá)
  const kb = k.call('sync.bootstrap', {}).data;
  assert.equal(kb.records.TARIFF, undefined);
});

test('ghi kèm changes_since: phản hồi ghi có luôn thay đổi từ cursor của app (như sync.changes), kể cả việc của người khác; không cờ thì như cũ', () => {
  const env = freshServer();
  const c = ownerClient(env);
  env.g.pocSeedSampleData();
  const k = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  const cur = Number(c.call('sync.bootstrap', {}).data.sync_cursor);
  // Người khác báo sự cố trước khi mình lưu
  const eq = env.rows('Equipment')[0].equipment_id;
  const rid = uuid();
  assert.equal(k.write('repair.report', { repair_id: rid, equipment_id: eq, symptom_vi: 'Rò khí', severity: 'LOW' }).ok, true);
  const id = uuid();
  const w = c.write('equipment.create', { equipment_id: id, name_vi: 'Máy gộp thay đổi' }, { changes_since: cur });
  assert.equal(w.ok, true);
  assert.ok(w.changes && Array.isArray(w.changes.changes), 'có thay đổi kèm theo');
  const ids = w.changes.changes.map((x) => x.entity_type + ':' + x.entity_id);
  assert.ok(ids.includes('EQUIPMENT:' + id), 'có bản ghi vừa lưu');
  assert.ok(ids.includes('REPAIR:' + rid), 'có cả việc của người khác');
  // Giống sync.changes gọi riêng từ cùng cursor
  const ref = c.call('sync.changes', { cursor: cur }).data;
  assert.equal(w.changes.next_cursor, ref.next_cursor);
  assert.deepEqual(w.changes.changes.map((x) => x.entity_id).sort(), ref.changes.map((x) => x.entity_id).sort());
  // Không cờ: không kèm
  const w2 = c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy không kèm' });
  assert.equal(w2.ok, true);
  assert.equal(w2.changes, undefined);
});
