// Rà soát d4.42 (dữ liệu lớn): một ô Google Sheets chứa tối đa 50 000 ký tự.
//  - Kết quả ghi lớn (checklist 70 bước, lưu kết quả 70 bước) trước làm lỗi máy chủ SAU KHI đã ghi → giờ lưu bản gọn vào Operations.result_json
//  - Chữ dài hơn 20 000 ký tự ở bất kỳ trường nào → lỗi dữ liệu TEXT_TOO_LONG đúng tên trường (kể cả qua hàng chờ), không ghi gì
//  - Dòng Excel quá dài → báo theo số dòng
//  - Đệm bảng không cắt đôi emoji; bảng quá lớn để đệm thì sync.bootstrap gửi trang lớn hơn (đỡ đọc lại cả bảng mỗi trang)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const nowIso = (env, minutes = 0) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + minutes * 60000));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function bigChecklist(env, c, n) {
  const tpl = uuid();
  const txt = (i) => ('Bước ' + i + ': kiểm tra độ rung ổ bi, nhiệt độ vỏ, tiếng ồn bất thường, rò rỉ dầu ').repeat(2).slice(0, 90);
  const items = Array.from({ length: n }, (_, i) => ({ label_vi: txt(i + 1), result_type: 'PASS_FAIL', required: true, safety_note_vi: 'Ngắt điện, treo biển trước khi mở nắp' }));
  const op = uuid();
  const r = c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng lớn', items }, { operation_id: op });
  return { tpl, r, op, items };
}

test('checklist 70 bước: lưu được (trước: lỗi máy chủ sau khi đã ghi); Operations COMMITTED, result_json gọn; hỏi trạng thái thao tác → COMMITTED', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const { tpl, r, op, items } = bigChecklist(env, c, 70);
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.ok(JSON.stringify(r.data).length > 50000, 'phản hồi lần đầu vẫn đủ danh sách bước');
  assert.equal(env.rows('ChecklistTemplates').filter((x) => x.template_id === tpl).length, 70);
  const o = env.rows('Operations').find((x) => x.operation_id === op);
  assert.equal(o.state, 'COMMITTED');
  assert.equal(o.result_json.too_large, true);
  assert.equal(o.result_json.template_id, tpl);
  assert.equal(o.result_json.revision, 1);
  // Mất phản hồi: app hỏi trạng thái thao tác (form.js writeOnline) → COMMITTED kèm kết quả gọn
  const st = c.call('sync.getOperationStatus', { operation_id: op });
  assert.equal(st.ok, true);
  assert.equal(st.data.state, 'COMMITTED');
  assert.equal(st.data.result.revision, 1);
  assert.equal(st.data.result.template_id, tpl);
  void items;
  assert.ok(!env.logs.some((l) => /INTERNAL_ERROR/.test(l)));
});

test('phiếu bảo trì 70 bước: lưu kết quả cả 70 bước một lần → OK, phiếu đủ kết quả', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }).ok, true);
  const { tpl } = bigChecklist(env, c, 70);
  assert.equal(c.write('maintenance.plan.edit', { plan_id: uuid(), equipment_id: eq, title_vi: 'BD', interval_type: 'MONTH', interval_value: 1, anchor_date: env.g.todayVN_(), checklist_template_id: tpl, assignee_user_id: ktId }).ok, true);
  const w = env.rows('WorkOrders')[0];
  const ver = () => env.rows('WorkOrders').find((x) => x.work_order_id === w.work_order_id).record_version;
  assert.equal(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -60) }, { expected_version: ver() }).ok, true);
  const res = env.rows('WorkOrderResults').filter((x) => x.work_order_id === w.work_order_id).map((x) => ({ result_id: x.result_id, result_status: 'PASS', note_vi: 'Bình thường, đã vệ sinh, siết lại bu lông chân đế' }));
  const r = kt.write('maintenance.execute', { work_order_id: w.work_order_id, results: res }, { expected_version: ver() });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(r.data.results.length, 70);
  assert.equal(env.rows('WorkOrderResults').filter((x) => x.work_order_id === w.work_order_id && x.result_status === 'PASS').length, 70);
});

test('chữ > 20 000 ký tự: TEXT_TOO_LONG đúng trường, không ghi; qua hàng chờ (sync.push) báo tên trường của biểu mẫu; nội dung tệp/ảnh biểu đồ không bị chặn', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const long = 'ă'.repeat(20001);
  const id = uuid();
  let r = c.write('equipment.create', { equipment_id: id, name_vi: 'Máy', note_vi: long });
  assert.equal(r.code, 'VALIDATION_ERROR');
  assert.deepEqual(r.errors.map((e) => e.field + ':' + e.code), ['note_vi:TEXT_TOO_LONG']);
  assert.match(r.errors[0].message_vi, /quá dài/);
  assert.equal(env.rows('Equipment').length, 0, 'không ghi gì');
  assert.equal(c.write('equipment.create', { equipment_id: id, name_vi: 'Máy', note_vi: 'ă'.repeat(20000) }).ok, true, 'đúng 20 000 ký tự vẫn được');
  // Danh sách lồng: đường dẫn kiểu items[1].label_vi
  r = c.write('maintenance.checklist.edit', { template_id: uuid(), template_name_vi: 'X', items: [{ label_vi: 'a' }, { label_vi: long }] });
  assert.deepEqual(r.errors.map((e) => e.field + ':' + e.code), ['items[1].label_vi:TEXT_TOO_LONG']);
  // Hàng chờ offline
  const rep = uuid();
  r = c.call('sync.push', { op: { action: 'repair.report', operation_id: uuid(), expected_version: 0, payload: { repair_id: rep, equipment_id: id, symptom_vi: long } } });
  assert.equal(r.code, 'VALIDATION_ERROR');
  assert.deepEqual(r.errors.map((e) => e.field + ':' + e.code), ['symptom_vi:TEXT_TOO_LONG']);
  // Nội dung tệp (base64) / ảnh biểu đồ không bị chặn
  const f = env.g.longTextFields_;
  assert.deepEqual(f({ content_b64: 'x y'.repeat(10000), charts: { ELECTRICITY: 'iVBOR' + 'A'.repeat(30000) }, raw: 'QUJD'.repeat(6000), note: 'ă'.repeat(20001) }, '', 0, []), ['note']);
  assert.ok(!env.logs.some((l) => /INTERNAL_ERROR/.test(l)));
});

test('nhập Excel: dòng quá dài (> 45 000 ký tự cả dòng) → TEXT_TOO_LONG kèm số dòng, không lỗi máy chủ', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const rows = [{ sheet: 'equipment', row_number: 3, values: { name_vi: 'Máy A' } }, { sheet: 'equipment', row_number: 4, values: { name_vi: 'Máy B', note: 'ă'.repeat(16000), spec: 'ê'.repeat(16000), extra: 'ô'.repeat(16000) } }];
  const r = c.write('import.preview', { import_batch_id: uuid(), template_key: 'equipment', chunk_index: 0, chunk_count: 1, total_rows: 2, source_sha256: sha('x'), rows });
  assert.equal(r.code, 'VALIDATION_ERROR', JSON.stringify(r).slice(0, 300));
  assert.deepEqual(r.errors.map((e) => `${e.row}:${e.field}:${e.code}`), ['4:rows:TEXT_TOO_LONG']);
  assert.equal(env.rows('ImportBatches').length, 0);
  assert.ok(!env.logs.some((l) => /INTERNAL_ERROR/.test(l)));
});

test('đệm bảng: khúc đệm không kết thúc giữa cặp surrogate (emoji), đọc lại từ đệm giống hệt Sheets', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const g = env.g;
  for (let i = 0; i < 6; i++) assert.equal(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy 👍🔧 số ' + i + ' ' + '😀'.repeat(i * 7 + 3) }).ok, true);
  g.TBL_CHUNK_ = 37; // khúc nhỏ để chắc chắn có ranh giới rơi vào giữa emoji
  g.TBL_MAX_CHUNKS_ = 1000;
  try {
    env.cache._map.clear();
    g.dbReset_();
    const st = g.readState_();
    const a = JSON.stringify(g.tableCache_(['Equipment'], st).rows('Equipment'));
    const key = g.tblKey_('Equipment', st);
    const n = Number(env.cache.get(key));
    assert.ok(n > 10, 'đã đệm nhiều khúc');
    for (let i = 0; i < n; i++) assert.ok(!/[\uD800-\uDBFF]$/.test(env.cache.get(key + ':' + i)), 'khúc ' + i + ' không kết thúc bằng nửa đầu cặp surrogate');
    const b = JSON.stringify(g.tableCache_(['Equipment'], st).rows('Equipment'));
    assert.equal(b, a);
  } finally { g.TBL_CHUNK_ = 30000; g.TBL_MAX_CHUNKS_ = 40; }
});

test('bảng quá lớn để đệm: sync.bootstrap gửi tới 2 000 dòng mỗi trang cho bảng đó (bảng nhỏ vẫn theo sync_page_size), đủ bản ghi', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const g = env.g;
  const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  assert.equal(c.call('settings.edit', { changes: { sync_page_size: 100 }, reason: 'thử' }, { operation_id: uuid(), reauth_token: rt }).ok, true);
  assert.equal(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy mẫu' }).ok, true);
  g.dbReset_();
  const base = { ...g.readRows_('Equipment')[0] };
  delete base.__row;
  const more = Array.from({ length: 349 }, (_, i) => ({ ...base, equipment_id: uuid(), equipment_code: 'TB-' + String(i + 1).padStart(4, '0') }));
  g.withWriteLock_(() => { g.insertRows_('Equipment', more); g.resetBumpTable_('Equipment'); });
  const pages = () => {
    let tok = null, cur = null, n = 0, eq = 0;
    do {
      g.dbReset_();
      const r = c.call('sync.bootstrap', tok ? { page_token: tok, sync_cursor: cur } : {});
      assert.equal(r.ok, true);
      n++; eq += (r.data.records.EQUIPMENT || []).length;
      tok = r.data.next_page_token; cur = r.data.sync_cursor;
    } while (tok && n < 50);
    return { n, eq };
  };
  const small = pages();
  assert.equal(small.eq, 350);
  assert.ok(small.n >= 4, 'bảng đệm được: 100 dòng/trang → ' + small.n + ' trang');
  g.TBL_MAX_CHUNKS_ = 0; // giả như bảng vượt ~1,2 triệu ký tự
  env.cache._map.clear();
  try {
    const big = pages();
    assert.equal(big.eq, 350);
    assert.ok(big.n < small.n, `bảng không đệm: ít trang hơn (${big.n} < ${small.n})`);
  } finally { g.TBL_MAX_CHUNKS_ = 40; }
});

test('Lưu trữ theo năm xóa dòng cũ giữa hai trang sync.bootstrap: trang sau tìm lại đúng dòng theo khóa — không sót dòng nào còn lại', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const g = env.g;
  const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  assert.equal(c.call('settings.edit', { changes: { sync_page_size: 100 }, reason: 'thử' }, { operation_id: uuid(), reauth_token: rt }).ok, true);
  assert.equal(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy mẫu' }).ok, true);
  g.dbReset_();
  const base = { ...g.readRows_('Equipment')[0] };
  delete base.__row;
  g.withWriteLock_(() => { g.insertRows_('Equipment', Array.from({ length: 299 }, (_, i) => ({ ...base, equipment_id: uuid(), equipment_code: 'TB-' + String(i + 1).padStart(4, '0') }))); g.resetBumpTable_('Equipment'); });
  const run = (between) => {
    let tok = null, cur = null, n = 0;
    const seen = [];
    do {
      g.dbReset_();
      const r = c.call('sync.bootstrap', tok ? { page_token: tok, sync_cursor: cur } : {});
      assert.equal(r.ok, true);
      (r.data.records.EQUIPMENT || []).forEach((e) => seen.push(e.equipment_id));
      tok = r.data.next_page_token; cur = r.data.sync_cursor; n++;
      if (n === 1 && between) between();
    } while (tok && n < 50);
    return seen;
  };
  // Xóa 40 dòng đầu sau trang 1 (như Lưu trữ theo năm chuyển dòng cũ sang tệp lưu trữ)
  const seen = run(() => {
    g.withWriteLock_(() => { const sh = g.sh_('Equipment'); sh.deleteRows(2, 40); g.resetBumpTable_('Equipment'); });
  });
  g.dbReset_();
  const left = g.readRows_('Equipment').map((e) => e.equipment_id);
  assert.equal(left.length, 260);
  const missing = left.filter((id) => !seen.includes(id));
  assert.equal(missing.length, 0, 'không sót dòng nào còn lại: thiếu ' + missing.length + ' / thấy ' + seen.length);
  // Dòng mốc của trang sau bị xóa → đọc lại bảng từ đầu (app bỏ trùng), vẫn đủ
  let anchor = null;
  const seen2 = run(() => {
    const r = c.call('sync.bootstrap', {});
    anchor = r.data.next_page_token.split(':')[2];
    g.withWriteLock_(() => { const sh = g.sh_('Equipment'); const rn = g.findRowNums_('Equipment', 'equipment_id', anchor)[0]; sh.deleteRows(rn, 1); g.resetBumpTable_('Equipment'); });
  });
  g.dbReset_();
  const left2 = g.readRows_('Equipment').map((e) => e.equipment_id);
  assert.ok(anchor && !left2.includes(anchor));
  assert.equal(left2.filter((id) => !seen2.includes(id)).length, 0);
});
