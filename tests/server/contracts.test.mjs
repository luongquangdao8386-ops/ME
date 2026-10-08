import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Điều hòa trung tâm' }).ok, true);
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  return { env, c, hd, c3, eq };
}
function create(cl, eq, extra = {}) {
  const id = uuid(), ce = uuid(), sv = uuid();
  const r = cl.write('contract.create', {
    contract_id: id, title_vi: 'Bảo trì điều hòa', contract_number: 'HĐ-2026/01', start_date: '2026-01-01', end_date: '2026-12-31',
    renewal_notice_date: '2026-11-30', value: 120000000, scope_vi: 'Bảo dưỡng 3 tháng/lần',
    equipment: [{ contract_equipment_id: ce, equipment_id: eq, service_vi: 'Vệ sinh dàn lạnh', interval_type: 'MONTH', interval_value: 3, next_service_date: '2026-11-15' }],
    services: [{ service_id: sv, contract_equipment_id: ce, due_date: '2026-11-15' }], ...extra
  });
  return { id, ce, sv, r };
}

test('contract.create (HĐ): mã HD-0001, QR, phiên đầu hiệu lực ngay, due_revision theo hạn báo gia hạn sớm hơn; phạm vi không dịch tự động', () => {
  const { env, hd, eq } = setup();
  const { id, r } = create(hd, eq);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.display_code, 'HD-0001');
  assert.match(r.data.qr_key, /^[0-9A-HJKMNP-TV-Z]{20}$/);
  const row = env.rows('Contracts')[0];
  assert.equal(row.status, 'APPROVED');
  assert.equal(row.lifecycle_status, 'ACTIVE');
  assert.equal(row.due_revision, `RENEWAL_NOTICE:2026-11-30:${id}`);
  assert.equal(row.currency, 'VND');
  assert.equal(row.i18n_meta.scope.state, 'MANUAL_REQUIRED');
  assert.match(row.title_zh, /Bảo trì điều hòa/);
  assert.equal(env.rows('ContractEquipment').length, 1);
  assert.equal(env.rows('ContractServices')[0].status, 'PLANNED');
  // Hạn báo gia hạn sau ngày hết hạn → lỗi
  const bad = hd.write('contract.create', { contract_id: uuid(), title_vi: 'X', end_date: '2026-12-31', renewal_notice_date: '2027-01-05' });
  assert.equal(bad.errors[0].code, 'RENEWAL_NOTICE_AFTER_END');
  // Trùng ngày → tính theo ngày hết hạn
  const same = create(hd, eq, { renewal_notice_date: '2026-12-31', equipment: [], services: [] });
  assert.equal(env.rows('Contracts').find((x) => x.contract_id === same.id).due_revision, `END_DATE:2026-12-31:${same.id}`);
});

test('quyền giá: C1 và KT không thấy value/price/cost; người không có quyền giá gửi giá → COST_FIELD_FORBIDDEN; KT ghi dịch vụ', () => {
  const { env, hd, eq } = setup();
  const { id, sv } = create(hd, eq);
  const c1 = userClient(env, 'U-C1', 1, '482915');
  const kt = userClient(env, 'U-KT', 2, '583016', 'KY_THUAT');
  const v = c1.call('contract.view', {});
  assert.equal(v.ok, true);
  assert.equal(v.data.contracts[0].value, undefined);
  assert.equal(v.data.contracts[0].meta.cost_hidden, true);
  const b = kt.call('sync.bootstrap', {});
  assert.ok(!JSON.stringify(b.data.records.CONTRACT).includes('120000000'));
  assert.equal(kt.write('contract.create', { contract_id: uuid(), title_vi: 'X', end_date: '2027-01-01' }).code, 'FORBIDDEN');
  const rec = kt.write('contract.service.record', { service_id: sv, performed_at: '2026-11-16', result_vi: 'Đã vệ sinh', cost: 500000 }, { expected_version: 1 });
  assert.equal(rec.errors[0].code, 'COST_FIELD_FORBIDDEN');
  const ok = kt.write('contract.service.record', { service_id: sv, performed_at: '2026-11-16', result_vi: 'Đã vệ sinh' }, { expected_version: 1 });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const s = env.rows('ContractServices')[0];
  assert.equal(s.status, 'DONE');
  assert.equal(s.result_zh, '', 'kết quả dịch vụ không dịch tự động');
  void id;
});

test('contract.edit không đổi hạn/giá trị phiên hiện hành; editTerms cần PIN, lý do, không phải người tạo; due_revision mới', () => {
  const { env, c, hd, c3, eq } = setup();
  const { id } = create(hd, eq);
  assert.equal(hd.write('contract.edit', { contract_id: id, end_date: '2027-06-30' }, { expected_version: 1 }).errors[0].field, 'end_date');
  assert.equal(hd.write('contract.edit', { contract_id: id, title_vi: 'Bảo trì điều hòa (sửa)' }, { expected_version: 1 }).ok, true);
  assert.equal(c3.write('contract.editTerms', { contract_id: id, end_date: '2027-06-30', reason: 'Nhập sai' }, { expected_version: 2 }).code, 'REAUTH_REQUIRED');
  const r = c3.write('contract.editTerms', { contract_id: id, end_date: '2027-06-30', renewal_notice_date: '2027-05-31', reason: 'Nhập sai' }, { expected_version: 2, reauth_token: c3.reauth() });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.rows('Contracts')[0].due_revision, `RENEWAL_NOTICE:2027-05-31:${id}`);
  // Người tạo phiên không tự sửa hạn
  const own = create(c, eq, { equipment: [], services: [] });
  assert.equal(c.write('contract.editTerms', { contract_id: own.id, end_date: '2027-01-31', reason: 'x' }, { expected_version: 1, reauth_token: c.reauth() }).code, 'FORBIDDEN');
});

test('gia hạn: dự thảo giữ hạn hiện hành; người nộp không tự duyệt; duyệt → phiên mới ACTIVE (revision 2), phiên cũ SUPERSEDED, QR giữ nguyên (NT1-93)', () => {
  const { env, c, hd, c3, eq } = setup();
  const { id } = create(hd, eq);
  const qrBefore = env.rows('QrRegistry').find((q) => q.entity_id === id).qr_key;
  const d = uuid();
  const r1 = hd.write('contract.renewal.create', { contract_id: d, previous_contract_id: id, start_date: '2027-01-01', end_date: '2027-12-31', renewal_notice_date: '2027-11-30', value: 130000000 });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(hd.write('contract.renewal.create', { contract_id: uuid(), previous_contract_id: id, end_date: '2028-01-01' }).errors[0].code, 'CODE_DUPLICATE');
  const draft = env.rows('Contracts').find((x) => x.contract_id === d);
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.revision, 2);
  assert.equal(draft.contract_code, 'HD-0001');
  assert.equal(env.rows('ContractEquipment').filter((x) => x.contract_id === d).length, 1, 'thiết bị chép sang dự thảo');
  assert.equal(env.rows('Contracts').find((x) => x.contract_id === id).end_date, '2026-12-31', 'dự thảo không đổi hạn hiện hành');
  assert.equal(hd.write('contract.renewal.submit', { contract_id: d }, { expected_version: 1 }).ok, true);
  // HĐ không có cờ A; C4 không phải người tạo/nộp thì duyệt được; người nộp (HĐ) bị chặn bởi cờ
  assert.equal(hd.write('contract.renewal.approve', { contract_id: d, decision: 'APPROVE' }, { expected_version: 2 }).code, 'FORBIDDEN');
  const ap = c3.write('contract.renewal.approve', { contract_id: d, decision: 'APPROVE' }, { expected_version: 2, reauth_token: c3.reauth() });
  assert.equal(ap.ok, true, JSON.stringify(ap));
  const rows = env.rows('Contracts');
  assert.equal(rows.find((x) => x.contract_id === id).lifecycle_status, 'SUPERSEDED');
  const nw = rows.find((x) => x.contract_id === d);
  assert.equal(nw.lifecycle_status, 'ACTIVE');
  assert.equal(nw.due_revision, `RENEWAL_NOTICE:2027-11-30:${d}`);
  const qr = env.rows('QrRegistry').find((q) => q.qr_key === qrBefore);
  assert.equal(qr.entity_id, d, 'tem cũ mở phiên mới');
  assert.equal(c.call('qr.resolve', { qr_key: qrBefore }).data.entity_id, d);
  // C4 tự tạo dự thảo rồi tự duyệt → FORBIDDEN
  const d2 = uuid();
  assert.equal(c.write('contract.renewal.create', { contract_id: d2, previous_contract_id: d, end_date: '2028-12-31' }).ok, true);
  assert.equal(c.write('contract.renewal.submit', { contract_id: d2 }, { expected_version: 1 }).ok, true);
  assert.equal(c.write('contract.renewal.approve', { contract_id: d2, decision: 'APPROVE' }, { expected_version: 2, reauth_token: c.reauth() }).code, 'FORBIDDEN');
  assert.equal(c3.write('contract.renewal.approve', { contract_id: d2, decision: 'REJECT' }, { expected_version: 2, reauth_token: c3.reauth() }).errors[0].field, 'reason');
});

test('contract.close: PIN, bắt lý do, ENDED/NOT_RENEWED, dự thảo đang mở bị từ chối; nghiệm thu dịch vụ không tự duyệt', () => {
  const { env, hd, c3, eq } = setup();
  const { id, sv } = create(hd, eq);
  assert.equal(hd.write('contract.service.record', { service_id: sv, performed_at: '2026-11-16', result_vi: 'Xong' }, { expected_version: 1 }).ok, true);
  const s1 = env.rows('ContractServices')[0];
  // HĐ không nghiệm thu (không có cờ A); C3 nghiệm thu được
  assert.equal(hd.write('contract.service.accept', { service_id: sv }, { expected_version: s1.record_version }).code, 'FORBIDDEN');
  assert.equal(c3.write('contract.service.accept', { service_id: sv }, { expected_version: s1.record_version, reauth_token: c3.reauth() }).ok, true);
  assert.equal(env.rows('ContractServices')[0].status, 'ACCEPTED');
  const d = uuid();
  assert.equal(hd.write('contract.renewal.create', { contract_id: d, previous_contract_id: id, end_date: '2027-12-31' }).ok, true);
  assert.equal(c3.write('contract.close', { contract_id: id, lifecycle_status: 'NOT_RENEWED' }, { expected_version: 1, reauth_token: c3.reauth() }).errors[0].field, 'closed_reason');
  const cl = c3.write('contract.close', { contract_id: id, lifecycle_status: 'NOT_RENEWED', closed_reason_vi: 'Không gia hạn do đổi nhà cung cấp' }, { expected_version: 1, reauth_token: c3.reauth() });
  assert.equal(cl.ok, true, JSON.stringify(cl));
  const rows = env.rows('Contracts');
  const main = rows.find((x) => x.contract_id === id);
  assert.equal(main.lifecycle_status, 'NOT_RENEWED');
  assert.ok(main.closed_at);
  assert.equal(main.closed_reason_zh, '');
  assert.equal(rows.find((x) => x.contract_id === d).status, 'REJECTED');
  // Đóng rồi không ghi dịch vụ được nữa
  assert.equal(hd.write('contract.service.record', { service_id: uuid(), contract_id: id, performed_at: '2026-12-01', result_vi: 'x' }).errors[0].field, 'contract_id');
});
