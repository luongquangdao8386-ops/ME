// d4.11: logo công ty trên báo cáo (report.logo.set / report.logo.get, tệp riêng tư, Settings) và PDF có định dạng
// (đầu trang logo, chân trang số báo cáo, tiêu đề hai dòng, tóm tắt dạng ô, biểu đồ thanh, bảng có cột #, khối ký).
// Giả lập DocumentApp chặt: chỉ phương thức có thật, cỡ chữ số nguyên, màu #RRGGBB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN, fakePdfB64 } from '../helpers.mjs';

const T = (s) => s + ':00+07:00';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const nowIso = (env, minutes = 0) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + minutes * 60000));

/** PNG giả: chữ ký + khối IHDR (rộng × cao) + phần đệm cho đủ cỡ */
function fakePngB64(w = 800, h = 605, size = 3000) {
  const b = Buffer.alloc(Math.max(size, 40));
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  for (let i = 30; i < b.length; i++) b[i] = (i * 31) & 0xFF;
  return b.toString('base64');
}

function setup(now = '2026-10-20T10:00') {
  const env = freshServer({ now: T(now) });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  return { env, c, c3, kt };
}

const lastDoc = (env) => [...env.drive._docs.values()].pop();
const setting = (env, k) => (env.rows('Settings').find((s) => s.setting_key === k) || {}).value;
const pdfText = (r) => Buffer.from(r.data.content_b64, 'base64').toString('utf8');

test('logo báo cáo: chỉ C4 + PIN; tệp riêng tư trong thư mục dữ liệu; cùng nội dung không tạo tệp mới; đổi logo → tệp cũ vào thùng rác; gỡ logo; ai xem báo cáo cũng lấy được', () => {
  const { env, c, c3, kt } = setup();
  const png = fakePngB64();
  assert.equal(c3.write('report.logo.set', { content_b64: png, mime_type: 'image/png' }).code, 'FORBIDDEN', 'C3 không đổi logo');
  assert.equal(c.write('report.logo.set', { content_b64: png, mime_type: 'image/png' }).code, 'REAUTH_REQUIRED', 'cần nhập lại PIN');
  assert.equal(c.write('report.logo.set', { content_b64: fakePdfB64(), mime_type: 'image/png' }, { reauth_token: c.reauth() }).errors[0].code, 'FILE_TYPE', 'nội dung không phải PNG');
  assert.equal(c.write('report.logo.set', { content_b64: png, mime_type: 'image/gif' }, { reauth_token: c.reauth() }).errors[0].field, 'mime_type');
  assert.equal(c.write('report.logo.set', { content_b64: fakePngB64(800, 600, 1048577), mime_type: 'image/png' }, { reauth_token: c.reauth() }).errors[0].code, 'FILE_TOO_LARGE');
  assert.equal(kt.call('report.logo.get', {}).data.rev, '', 'chưa có logo');

  const r1 = ok(c.write('report.logo.set', { content_b64: png, mime_type: 'image/png' }, { reauth_token: c.reauth() })).data;
  assert.match(r1.rev, /^[A-Za-z0-9_-]{16}$/);
  const id1 = setting(env, 'report_logo_file_id');
  const f1 = env.drive._files.get(id1);
  assert.equal(f1.access, 'PRIVATE', 'tệp logo riêng tư');
  assert.equal(f1.parent, env.props.getProperty('DRIVE_ROOT_FOLDER_ID'), 'nằm trong thư mục dữ liệu app');
  assert.equal(setting(env, 'report_logo_rev'), r1.rev);
  // Cùng nội dung: không tạo tệp mới
  const n = env.drive._files.size;
  assert.equal(ok(c.write('report.logo.set', { content_b64: png, mime_type: 'image/png' }, { reauth_token: c.reauth() })).data.rev, r1.rev);
  assert.equal(env.drive._files.size, n);
  // Người xem báo cáo lấy được logo; app biết bản mới qua cài đặt (bootstrap)
  const g = ok(kt.call('report.logo.get', {})).data;
  assert.equal(g.rev, r1.rev);
  assert.equal(g.mime_type, 'image/png');
  assert.equal(g.content_b64, png);
  assert.equal(kt.call('sync.bootstrap', {}).data.settings.report_logo_rev, r1.rev);
  assert.equal(kt.call('sync.bootstrap', {}).data.settings.report_logo_file_id, undefined, 'ID tệp Drive không gửi xuống app');
  // Đổi logo: tệp cũ vào thùng rác
  const r2 = ok(c.write('report.logo.set', { content_b64: fakePngB64(600, 600), mime_type: 'image/png' }, { reauth_token: c.reauth() })).data;
  assert.notEqual(r2.rev, r1.rev);
  assert.equal(env.drive._files.get(id1).trashed, true);
  // Cài đặt chỉ đọc ở màn Trạng thái hệ thống (sửa bằng report.logo.set)
  assert.equal(c.write('settings.edit', { changes: { report_logo_rev: 'x' } }, { reauth_token: c.reauth() }).code, 'VALIDATION_ERROR');
  // Gỡ
  const id2 = setting(env, 'report_logo_file_id');
  assert.equal(ok(c.write('report.logo.set', { remove: true }, { reauth_token: c.reauth() })).data.rev, '');
  assert.equal(env.drive._files.get(id2).trashed, true);
  assert.equal(kt.call('report.logo.get', {}).data.rev, '');
  const logs = env.rows('AuditLogs').filter((a) => a.action === 'report.logo.set');
  assert.equal(logs.length, 3, 'ghi nhật ký mỗi lần đổi (lần trùng nội dung không ghi)');
});

test('PDF báo cáo: có logo → đầu trang mỗi trang là ảnh logo cao 56 px, lề trên chừa chỗ; chân trang số báo cáo; tiêu đề hai dòng; bảng chi tiết cột #, vừa khổ giấy, tiêu đề đậm nền nhạt; số căn phải; khối ký', () => {
  const { env, c, c3 } = setup();
  ok(c.write('report.logo.set', { content_b64: fakePngB64(800, 605), mime_type: 'image/png' }, { reauth_token: c.reauth() }));
  for (const [name, model] of [['Máy nén khí 01', 'GA-37'], ['Máy nén khí 02', 'GA-45'], ['Bơm nước', 'CR-10']]) {
    ok(c.write('equipment.create', { equipment_id: uuid(), name_vi: name, model }));
  }
  const id = uuid();
  ok(c3.write('report.save', { report_run_id: id, code: 'RPT_EQUIPMENT', filters: {} }));
  const p = ok(c3.call('report.export', { format: 'PDF', report_run_id: id }));
  const text = pdfText(p);
  assert.ok(text.startsWith('%PDF'));
  assert.ok(!text.includes('M&E'), 'không cụm nhận diện app');
  const d = lastDoc(env);
  // Đầu trang: một ảnh, cao 56 px, rộng theo tỷ lệ
  const img = d.header.children[0].images[0];
  assert.ok(img, 'có logo ở đầu trang');
  assert.equal(img.h, 56);
  assert.equal(img.w, Math.round(56 * 800 / 605));
  assert.equal(d.body.st.MARGIN_TOP, 84);
  // Chân trang
  assert.ok(d.footer.children[0].text.includes('BC-2610-001'));
  // Tiêu đề hai dòng, căn giữa, chữ to
  const [t0, t1] = d.body.children;
  assert.equal(t0.text, 'Hồ sơ và linh kiện thiết bị');
  assert.equal(t0.st.FONT_SIZE, 16);
  assert.equal(t0.st.HORIZONTAL_ALIGNMENT, 'CENTER');
  assert.equal(t1.text, '设备档案与配件');
  // Bảng chi tiết: bảng cuối có cột # (trước khối ký)
  const tables = d.body.children.filter((x) => x.kind === 'table');
  const detail = tables.find((t) => t.rows[0].cells[0].getText() === '#');
  assert.ok(detail, 'bảng chi tiết có cột #');
  assert.equal(detail.rows.length, 4, 'tiêu đề + 3 thiết bị');
  assert.deepEqual(Array.from(detail.rows.slice(1), (r) => r.cells[0].getText()), ['1', '2', '3']); // mảng tạo trong máy chủ giả lập → Array.from cho cùng realm
  const width = d.page.w - 80;
  const sum = detail.colWidths.reduce((a, b) => a + b, 0);
  assert.ok(detail.colWidths.every((w) => w >= 24), 'mọi cột đã đặt độ rộng');
  assert.ok(sum <= width && sum > width - 20, `vừa khổ: ${sum} / ${width}`);
  assert.equal(d.page.w, 842, '12 cột → khổ ngang');
  assert.equal(detail.rows[0].st.BOLD, true);
  assert.equal(detail.rows[0].cells[1].st.BACKGROUND_COLOR, '#E6ECF3');
  const numCol = detail.rows[0].cells.findIndex((x) => x.getText().startsWith('Linh kiện gắn máy'));
  assert.ok(numCol > 0);
  assert.equal(detail.rows[1].cells[numCol].children[0].st.HORIZONTAL_ALIGNMENT, 'RIGHT', 'số căn phải');
  assert.equal(detail.rows[2].cells[1].st.BACKGROUND_COLOR, '#F7F9FC', 'hàng xen kẽ');
  // Tóm tắt dạng ô: nhãn + số đậm
  const tiles = tables.find((t) => t.st.BORDER_COLOR === '#FFFFFF');
  assert.ok(tiles, 'có ô tóm tắt');
  assert.equal(tiles.rows[0].cells[0].children[1].text, '3');
  assert.equal(tiles.rows[0].cells[0].children[1].st.BOLD, true);
  // Biểu đồ thanh theo tình trạng: ký tự khối, số ghi bằng chữ màu thường
  const bars = tables.find((t) => t.rows[0].cells.length === 3 && /█/.test(t.rows[0].cells[1].getText()));
  assert.ok(bars, 'có biểu đồ thanh');
  assert.equal(bars.rows[0].cells[2].getText(), '3');
  // Khối ký: Người lập (tên người tạo) · Người duyệt
  const sign = tables[tables.length - 1];
  assert.ok(sign.rows[0].cells[0].getText().startsWith('Người lập'));
  assert.ok(sign.rows[0].cells[1].getText().startsWith('Người duyệt'));
  // Tệp Docs tạm đã bỏ vào thùng rác
  assert.ok([...env.drive._docs.keys()].every((k) => env.drive._files.get(k)?.trashed === true));
});

test('PDF không có logo: không đầu trang, lề trên thường; báo cáo trực tiếp (chưa lưu) vẫn có chân trang; 0 dòng ghi "Không có hồ sơ phù hợp"', () => {
  const { env, c3 } = setup();
  const p = ok(c3.call('report.export', { format: 'PDF', code: 'RPT_EQUIPMENT', filters: {} }));
  assert.ok(!pdfText(p).includes('[IMAGE]'));
  const d = lastDoc(env);
  assert.equal(d.header, null);
  assert.equal(d.body.st.MARGIN_TOP, 40);
  assert.ok(d.footer.children[0].text.includes('Hồ sơ và linh kiện thiết bị'));
  const detail = d.body.children.filter((x) => x.kind === 'table').find((t) => t.rows[0].cells[0].getText() === '#');
  assert.equal(detail.rows.length, 2);
  assert.equal(detail.rows[1].cells[1].getText(), 'Không có hồ sơ phù hợp · 没有符合条件的记录');
});

test('PDF phiếu bảo trì: bảng thông tin nhãn – giá trị, checklist tô màu Đạt (xanh) / Không đạt (đỏ) kèm chữ; logo ở đầu trang; nhãn hai thứ tiếng', () => {
  const { env, c, c3 } = setup();
  ok(c.write('report.logo.set', { content_b64: fakePngB64(), mime_type: 'image/png' }, { reauth_token: c.reauth() }));
  const eq = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01' }));
  const kt = userClient(env, 'U-KT2', 2, '583016', 'KY_THUAT');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT2').user_id;
  const tpl = uuid();
  ok(c.write('maintenance.checklist.edit', {
    template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén',
    items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL', required: true }, { label_vi: 'Áp suất xả', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8, required: true }]
  }));
  const plan = uuid();
  ok(c.write('maintenance.plan.edit', {
    plan_id: plan, equipment_id: eq, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1,
    anchor_date: env.g.todayVN_(), checklist_template_id: tpl, assignee_user_id: ktId, priority: 'HIGH'
  }));
  const w = env.rows('WorkOrders').find((x) => x.plan_id === plan);
  const [r1, r2] = env.rows('WorkOrderResults').filter((r) => r.work_order_id === w.work_order_id).sort((a, b) => a.step_no - b.step_no);
  ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: nowIso(env, -60) }, { expected_version: 1 }));
  ok(kt.write('maintenance.execute', {
    work_order_id: w.work_order_id, end_at: nowIso(env, -1), overall_result: 'FAIL',
    results: [{ result_id: r1.result_id, result_status: 'FAIL', note_vi: 'Dầu đen' }, { result_id: r2.result_id, result_status: 'PASS', measured_value: 7 }]
  }, { expected_version: 2 }));
  const p = ok(c3.call('export.pdf', { entity_type: 'WORK_ORDER', entity_id: w.work_order_id }));
  const text = pdfText(p);
  assert.ok(text.includes('Phiếu bảo trì') && text.includes('保养工单') && text.includes('[IMAGE]'));
  const d = lastDoc(env);
  const tables = d.body.children.filter((x) => x.kind === 'table');
  const kv = tables.find((t) => t.rows[0].cells.length === 2 && t.rows[0].cells[0].st.BACKGROUND_COLOR === '#F1F5F9');
  assert.ok(kv, 'bảng nhãn – giá trị');
  const cl = tables.find((t) => t.rows[0].cells[0].getText() === '#' && t.rows[0].cells.length === 5);
  assert.ok(cl, 'bảng checklist');
  const status = (i) => cl.rows[i].cells[3];
  assert.equal(status(1).getText(), 'Không đạt · 不合格');
  assert.equal(status(1).st.FOREGROUND_COLOR, '#B42318');
  assert.equal(status(2).getText(), 'Đạt · 合格');
  assert.equal(status(2).st.FOREGROUND_COLOR, '#1E7B4A');
  assert.equal(cl.rows[2].cells[2].children[0].st.HORIZONTAL_ALIGNMENT, 'RIGHT', 'số đo căn phải');
});

test('PDF Điện nước: biểu đồ điện theo kỳ bằng thanh màu cam; kỳ chưa có số ghi chữ, không vẽ thanh 0', () => {
  const { env, c, c3 } = setup();
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const m = uuid();
  ok(c.write('meter.edit', { meter_id: m, name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_5' }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-01T07:45'), cumulative_value: 12350 }));
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T('2026-10-06T08:00'), cumulative_value: 12480 }));
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_UTILITIES', filters: { period_type: 'DAY_5', date: '2026-10-03' } }));
  const d = lastDoc(env);
  const bars = d.body.children.filter((x) => x.kind === 'table').find((t) => t.rows.some((r) => r.cells.length === 3 && /█/.test(r.cells[1].getText())));
  assert.ok(bars, 'có biểu đồ điện');
  const full = bars.rows.find((r) => /█/.test(r.cells[1].getText()));
  assert.equal(full.cells[1].st.FOREGROUND_COLOR, '#EB6834');
  assert.ok(full.cells[2].getText().startsWith('130'), 'số ghi bằng chữ');
  const none = bars.rows.filter((r) => !r.cells[1].getText());
  assert.ok(none.length >= 1, 'kỳ không có số: không vẽ thanh');
  assert.ok(none.every((r) => /Chưa|chưa|Kỳ/.test(r.cells[2].getText())), 'ghi lý do thay vì 0');
});

test('report.run / report.view / report.export (XLSX) trả logo_rev hiện tại để app biết khi nào lấy logo mới', () => {
  const { c, c3 } = setup();
  assert.equal(ok(c3.call('report.run', { code: 'RPT_EQUIPMENT', filters: {} })).data.logo_rev, '');
  const rev = ok(c.write('report.logo.set', { content_b64: fakePngB64(), mime_type: 'image/png' }, { reauth_token: c.reauth() })).data.rev;
  assert.equal(ok(c3.call('report.run', { code: 'RPT_EQUIPMENT', filters: {} })).data.logo_rev, rev);
  const id = uuid();
  ok(c3.write('report.save', { report_run_id: id, code: 'RPT_EQUIPMENT', filters: {} }));
  assert.equal(ok(c3.call('report.view', { report_run_id: id })).data.logo_rev, rev);
  assert.equal(ok(c3.call('report.export', { format: 'XLSX', report_run_id: id })).data.logo_rev, rev);
});
