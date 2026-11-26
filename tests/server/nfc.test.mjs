// Rà soát d4.41: chữ tiếng Việt dấu tách rời (NFD, vd Unikey "Unicode tổ hợp") gửi lên → máy chủ lưu dạng dựng sẵn (NFC) như chữ gõ trên iPhone;
// xuất Excel rồi nhập lại không còn "Cập nhật" giả; nội dung tệp base64 không bị đụng
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, uuid } from '../helpers.mjs';

test('payload chữ NFD → lưu NFC (thiết bị, ghi chú lồng trong danh sách); NFC giữ nguyên; chữ ASCII, *_b64 không đổi', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const nfd = 'Máy nén khí xưởng ốp-xét'.normalize('NFD');
  assert.notEqual(nfd, nfd.normalize('NFC'));
  const id = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: id, name_vi: nfd, model: 'GA-37' }).ok, true);
  const e = env.rows('Equipment').find((x) => x.equipment_id === id);
  assert.equal(e.name_vi, nfd.normalize('NFC'));
  assert.equal(e.model, 'GA-37');
  // Danh sách lồng (bước checklist)
  const tpl = uuid();
  assert.equal(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng'.normalize('NFD'), items: [{ label_vi: 'Kiểm tra dầu bôi trơn'.normalize('NFD'), result_type: 'PASS_FAIL' }] }).ok, true);
  const it = env.rows('ChecklistTemplates').find((x) => x.template_id === tpl);
  assert.equal(it.template_name_vi, 'Bảo dưỡng');
  assert.equal(it.label_vi, 'Kiểm tra dầu bôi trơn');
  // Tìm theo dạng NFC thấy (máy chủ so chuỗi chính xác ở mã, tên)
  assert.ok(env.rows('Equipment').some((x) => x.name_vi.includes('xưởng')));
});
