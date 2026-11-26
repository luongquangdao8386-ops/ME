// Rà soát d4.40: lưu mẫu checklist mà không đổi gì → không sinh phiên bản mới giống hệt (trước đây mỗi lần bấm Lưu thêm một phiên bản)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, uuid } from '../helpers.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

test('checklist: lưu lại y nguyên → giữ phiên bản, không ghi; đổi một bước / mã biểu / giới hạn → phiên bản mới', () => {
  const env = freshServer();
  const c = ownerClient(env);
  const id = uuid();
  const items = [{ label_vi: 'Kiểm tra dầu', label_zh: '检查油', result_type: 'PASS_FAIL' },
    { label_vi: 'Áp suất', label_zh: '压力', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8, safety_note_vi: 'Tắt máy trước' }];
  const v1 = ok(c.write('maintenance.checklist.edit', { template_id: id, template_name_vi: 'Bảo dưỡng máy nén', template_name_zh: '空压机保养', form_code: 'BM-CĐ-03-03a', items })).data;
  assert.equal(v1.revision, 1);
  const rows = () => env.rows('ChecklistTemplates').filter((r) => r.template_id === id);
  const n = rows().length;
  const nAudit = env.rows('AuditLogs').length;
  // Gửi lại đúng như app gửi khi mở form rồi bấm Lưu (số dạng chuỗi rỗng / số, bản Trung đã có)
  const cur = rows().sort((a, b) => a.step_no - b.step_no);
  const same = cur.map((r) => ({ label_vi: r.label_vi, label_zh: r.label_zh, result_type: r.result_type, unit: r.unit, min_value: r.min_value === '' ? undefined : r.min_value, max_value: r.max_value === '' ? undefined : r.max_value, required: r.required, safety_note_vi: r.safety_note_vi, safety_note_zh: r.safety_note_zh }));
  const r2 = ok(c.write('maintenance.checklist.edit', { template_id: id, template_name_vi: 'Bảo dưỡng máy nén', template_name_zh: '空压机保养', form_code: 'BM-CĐ-03-03a', items: same }, { expected_version: 1 }));
  assert.equal(r2.data.revision, 1);
  assert.equal(r2.data.unchanged, true);
  assert.equal(rows().length, n, 'không thêm dòng');
  assert.equal(env.rows('AuditLogs').length, nAudit, 'không thêm nhật ký');
  // Đổi giới hạn trên → phiên bản 2
  const changed = same.map((x, i) => (i === 1 ? { ...x, max_value: 9 } : x));
  assert.equal(ok(c.write('maintenance.checklist.edit', { template_id: id, template_name_vi: 'Bảo dưỡng máy nén', template_name_zh: '空压机保养', form_code: 'BM-CĐ-03-03a', items: changed }, { expected_version: 1 })).data.revision, 2);
  // Đổi mã biểu → phiên bản 3; phiên bản cũ (expected 2 → đúng)
  assert.equal(ok(c.write('maintenance.checklist.edit', { template_id: id, template_name_vi: 'Bảo dưỡng máy nén', template_name_zh: '空压机保养', form_code: 'BM-CĐ-03-03b', items: changed }, { expected_version: 2 })).data.revision, 3);
  // Gửi y nguyên nhưng phiên bản cũ → vẫn báo xung đột (không bỏ qua kiểm phiên bản)
  assert.equal(c.write('maintenance.checklist.edit', { template_id: id, template_name_vi: 'Bảo dưỡng máy nén', template_name_zh: '空压机保养', form_code: 'BM-CĐ-03-03b', items: changed }, { expected_version: 1 }).code, 'VERSION_CONFLICT');
});
