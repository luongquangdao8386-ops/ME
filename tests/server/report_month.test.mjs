// d4.22: báo cáo tháng Điện nước có các ngày (số liệu theo ngày đúng quy tắc chốt kỳ B1), PDF mỗi loại (Điện, Nước) một trang A4:
// dải đầu gọn, ô tóm tắt (tiêu thụ, trung bình ngày, ngày cao nhất, ngày đủ số), ảnh biểu đồ app gửi kèm, bảng theo ngày hai nửa, chi tiết đồng hồ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN, pdfHeadOf } from '../helpers.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lastDoc = (env) => [...env.drive._docs.values()].pop();
const tablesOf = (d) => d.body.children.filter((x) => x.kind === 'table');

function pngB64(w = 900, h = 250) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc((w * 3 + 1) * h))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

/**
 * Hôm nay 04/11/2026 10:00. Điện MSB1 + đồng hồ nhánh MSB1-A (cha MSB1); nước NT. Đọc mỗi ngày 08:05 từ 01/10 tới 04/11;
 * MSB1 thiếu lần đọc ngày 12/10 → ngày 11/10 và 12/10 không có số. Điện tăng 6 000 kWh/ngày (CN 2 000), nước 30 m³.
 */
function setup() {
  const env = freshServer({ now: '2026-11-04T10:00:00+07:00' });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  const elec = uuid(), sub = uuid(), water = uuid();
  ok(c.write('meter.edit', { meter_id: elec, meter_code: 'MSB1', name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  ok(c.write('meter.edit', { meter_id: sub, meter_code: 'MSB1-A', name_vi: 'Điện xưởng A', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1', parent_meter_id: elec }));
  ok(c.write('meter.edit', { meter_id: water, meter_code: 'NT', name_vi: 'Nước tổng', utility_type: 'WATER', multiplier: 1, reading_cycle_type: 'DAY_1' }));
  let e = 100000, a = 5000, w = 1000;
  for (let d = '2026-10-01'; d <= '2026-11-04'; d = shift(d, 1)) {
    const sun = new Date(d + 'T00:00:00Z').getUTCDay() === 0;
    if (d !== '2026-10-12') ok(dn.write('reading.create', { reading_id: uuid(), meter_id: elec, measured_at: `${d}T08:05:00+07:00`, cumulative_value: e }));
    ok(dn.write('reading.create', { reading_id: uuid(), meter_id: sub, measured_at: `${d}T08:06:00+07:00`, cumulative_value: a }));
    ok(dn.write('reading.create', { reading_id: uuid(), meter_id: water, measured_at: `${d}T08:10:00+07:00`, cumulative_value: w }));
    e += sun ? 2000 : 6000; a += 1000; w += 30;
  }
  return { env, c, c3, dn };
}

test('báo cáo tháng: số liệu từng ngày theo B1 (số đầu ngày hôm sau − số đầu ngày), ngày thiếu số không có số, đồng hồ nhánh không cộng vào tổng; tháng hiện tại: hôm nay chưa chốt, ngày sau để trống', () => {
  const { c3 } = setup();
  const r = ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'MONTH', date: '2026-10-15' } })).data;
  const d = r.daily;
  assert.ok(d, 'kỳ tháng có bảng theo ngày');
  assert.equal(d.days.length, 31);
  assert.equal(d.days[0], '2026-10-01');
  const msb = d.meters.find((m) => m.meter_code === 'MSB1');
  assert.equal(msb.v[0], 6000);
  assert.equal(msb.o[0], 100000, 'chỉ số đầu ngày');
  assert.equal(msb.t[0], '08:05', 'giờ đọc số đầu ngày');
  assert.equal(msb.v[3], 2000, '04/10 là Chủ nhật');
  assert.equal(msb.v[10], null, '11/10: thiếu số đầu ngày hôm sau (12/10)');
  assert.equal(msb.s[10], 'MISSING_READING');
  assert.equal(msb.v[11], null, '12/10: thiếu số đầu ngày');
  assert.equal(msb.v[30], 6000, '31/10 dùng số đầu ngày 01/11');
  const sub = d.meters.find((m) => m.meter_code === 'MSB1-A');
  assert.equal(sub.in_total, false, 'đồng hồ nhánh');
  const te = d.totals.ELECTRICITY;
  assert.equal(te.v[0], 6000, 'tổng chỉ cộng đồng hồ không có cha trong tập');
  assert.equal(te.st[0], 'ok');
  assert.equal(te.v[10], null);
  assert.equal(te.st[10], 'none');
  assert.equal(d.totals.WATER.v[5], 30);
  // Tổng cả tháng (dòng đồng hồ) vẫn tính từ hai mốc kỳ 01/10 và 01/11 — không cộng các ngày
  assert.equal(r.rows.find((x) => x.meter_code === 'MSB1').consumption, 100000 + 27 * 6000 + 4 * 2000 - 100000);
  // Tháng hiện tại: 01–03/11 có số, 04/11 (hôm nay) kỳ chưa kết thúc, từ 05/11 để trống
  const n = ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'MONTH', date: '2026-11-04' } })).data.daily;
  assert.equal(n.days.length, 30);
  assert.equal(n.totals.ELECTRICITY.v[2], 6000);
  assert.equal(n.totals.ELECTRICITY.st[3], 'open');
  assert.equal(n.totals.ELECTRICITY.st[4], 'future');
  assert.equal(n.meters.find((m) => m.meter_code === 'NT').s[10], 'FUTURE');
  // Khoảng tùy chọn ≤ 62 ngày có các ngày; 1 ngày hoặc > 62 ngày thì không
  assert.equal(ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'CUSTOM', from: '2026-10-01', to: '2026-10-31' } })).data.daily.days.length, 31);
  assert.equal(ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'DAY_1', date: '2026-10-05' } })).data.daily, null);
  assert.equal(ok(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'CUSTOM', from: '2026-08-01', to: '2026-10-31' } })).data.daily, null);
});

test('bản chụp báo cáo đã lưu giữ bảng theo ngày; mẫu ẩn cột Loại vẫn giữ loại của dòng để chia trang', () => {
  const { env, c, c3 } = setup();
  const def = env.rows('ReportDefinitions').find((x) => x.code === 'RPT_UTILITIES');
  ok(c.write('report.definition.edit', { report_definition_id: def.report_definition_id, visible_columns: ['meter_code', 'consumption', 'status'] }, { expected_version: def.record_version }));
  const id = uuid();
  ok(c3.write('report.save', { report_run_id: id, code: 'RPT_UTILITIES', filters: { period_type: 'MONTH', date: '2026-10-01' } }));
  const s = ok(c3.call('report.view', { report_run_id: id })).data.snapshot;
  assert.equal(s.daily.days.length, 31);
  assert.deepEqual([...new Set(s.rows.map((r) => r.utility_type))].sort(), ['ELECTRICITY', 'WATER']);
});

test('PDF báo cáo tháng Điện nước: mỗi loại một trang (dải đầu ghi loại), ô tóm tắt theo ngày, ảnh biểu đồ app gửi kèm vừa bề ngang, bảng theo ngày hai nửa (ngày cao nhất đậm), chi tiết đồng hồ, khối ký mỗi trang; ảnh hỏng bị bỏ qua', () => {
  const { env, c, c3 } = setup();
  ok(c.write('report.logo.set', { content_b64: pngB64(400, 120), mime_type: 'image/png' }, { reauth_token: c.reauth() }));
  const filters = { period_type: 'MONTH', date: '2026-10-01' };
  const p = ok(c3.call('report.export', { format: 'PDF', code: 'RPT_UTILITIES', filters, charts: { ELECTRICITY: pngB64(), WATER: pngB64() } }));
  assert.ok(Buffer.from(p.data.content_b64, 'base64').toString('utf8').startsWith('%PDF'));
  const d = lastDoc(env);
  assert.equal(d.page.w, 595, 'A4 dọc');
  const kids = d.body.children;
  const pb = kids.findIndex((x) => x.kind === 'pagebreak');
  assert.ok(pb > 0, 'ngắt trang giữa Điện và Nước');
  assert.equal(kids.filter((x) => x.kind === 'pagebreak').length, 1);
  const sections = [kids.slice(0, pb), kids.slice(pb + 1)];
  sections.forEach((sec, i) => {
    const tables = sec.filter((x) => x.kind === 'table');
    const band = tables[0];
    assert.equal(band.rows[0].cells.length, 3, 'logo | tiêu đề | mã');
    const logo = band.rows[0].cells[0].children[0].images[0];
    assert.ok(logo.h <= 40 && logo.h >= 30 && logo.w * 0.75 <= band.colWidths[0] - 12, 'logo đầu mỗi trang, vừa ô (logo rộng thu nhỏ theo ô)');
    assert.deepEqual(band.rows[0].cells[1].children.map((x) => x.text), ['Điện nước', '水电', i ? 'Nước · 水' : 'Điện · 电']);
    // Ô tóm tắt: tiêu thụ kỳ, trung bình ngày, ngày cao nhất, ngày đủ số liệu
    const tiles = tables.find((t) => t.st.BORDER_COLOR === '#FFFFFF');
    const labels = Array.from(tiles.rows[0].cells, (x) => x.children[0].text.split(' · ')[0]);
    assert.deepEqual(labels.slice(0, 4), ['Tiêu thụ trong kỳ', 'Trung bình mỗi ngày', 'Ngày cao nhất', 'Ngày đủ số liệu']);
    // Ảnh biểu đồ: đoạn có ảnh rộng bằng bề ngang trang (px ≈ pt / 0,75)
    const img = sec.filter((x) => x.kind === 'p').flatMap((x) => x.images)[0];
    assert.ok(img, 'có ảnh biểu đồ');
    assert.equal(img.w, Math.floor((595 - 64) / 0.75) - 4);
    assert.equal(img.h, Math.round(img.w * 250 / 900));
    // Bảng theo ngày hai nửa cạnh nhau (16 dòng + tiêu đề): Nước một đồng hồ → Ngày | Chỉ số đầu ngày | Tiêu thụ;
    // Điện hai đồng hồ → Ngày | MSB1 | MSB1-A | Tổng
    // d4.25: kẻ khung mọi ô (không còn cột trống giữa hai nửa — Docs kẻ viền cả bảng), cột Ngày nền nhạt, giờ đọc chữ nhạt
    const nCols = i ? 6 : 8, half = nCols / 2;
    const dd = tables.find((t) => t.rows[0].cells.length === nCols && t.rows[0].cells[0].getText().startsWith('Ngày'));
    assert.ok(dd, 'bảng theo ngày hai nửa');
    assert.equal(dd.rows.length, 17);
    assert.ok(dd.st.BORDER_WIDTH >= 1 && dd.st.BORDER_COLOR === '#AFBCCC', 'kẻ khung từng ô');
    assert.ok(dd.rows[0].cells[half].getText().startsWith('Ngày'), 'nửa phải bắt đầu ngay bằng cột Ngày');
    assert.ok(dd.rows[1].cells[0].getText().startsWith('01/10 T5 周四'));
    assert.ok(dd.rows[1].cells[half].getText().startsWith('17/10'));
    assert.equal(dd.rows[16].cells[half].getText(), '', 'nửa phải ít hơn một ngày');
    [1, 2, 16].forEach((r) => [0, half].forEach((x) => assert.equal(dd.rows[r].cells[x].st.BACKGROUND_COLOR, '#F1F5F9', 'cột Ngày nền nhạt')));
    assert.equal(dd.rows[2].cells[1].st.BACKGROUND_COLOR, '#F7F9FC', 'hàng chẵn nền xen kẽ');
    assert.equal(dd.rows[1].cells[1].st.BACKGROUND_COLOR, undefined);
    assert.ok(dd.rows.slice(1).every((r) => r.cells.every((x) => x.st.PADDING_TOP === 1.5)), 'hàng cao hơn (đệm 1,5 pt)');
    if (i) {
      const c1 = dd.rows[1].cells[1], p1 = c1.children[0];
      assert.equal(c1.getText(), '1\u202F000  08:10', 'chỉ số đầu ngày kèm giờ đọc');
      assert.deepEqual(p1.runs.map((x) => [x.start, x.end, x.FOREGROUND_COLOR || x.FONT_SIZE]), [[7, 11, '#5B6875'], [7, 11, 7]], 'giờ đọc chữ nhạt, nhỏ hơn');
      assert.equal(p1.getText().slice(7), '08:10');
    }
    // Chi tiết đồng hồ: cột #, có mã đồng hồ
    const mt = tables.find((t) => t.rows[0].cells[0].getText() === '#');
    assert.ok(mt.rows.some((r) => r.cells[1].getText() === (i ? 'NT' : 'MSB1')));
    const sign = tables[tables.length - 1];
    assert.ok(sign.rows[0].cells[0].getText().startsWith('Người lập'), 'khối ký mỗi trang');
  });
  // Trang Điện: hai đồng hồ (MSB1 + nhánh) → bảng theo ngày từng đồng hồ + Tổng; 11/10 và 12/10 ghi —; ngày cao nhất đậm
  const el = sections[0].filter((x) => x.kind === 'table');
  const dd2 = el.find((t) => t.rows[0].cells[0].getText().startsWith('Ngày') && t.rows[0].cells.length === 8);
  assert.ok(dd2, 'Ngày | MSB1 | MSB1-A ↳ | Tổng, hai nửa');
  assert.equal(dd2.rows[0].cells[2].getText(), 'MSB1-A ↳', 'đồng hồ nhánh có dấu ↳');
  assert.equal(dd2.rows[11].cells[3].getText(), '—', '11/10 tổng không có số');
  assert.equal(dd2.rows[1].cells[3].getText(), '6\u202F000');
  assert.equal(dd2.rows[1].cells[3].st.BOLD, true, 'ngày cao nhất (đầu tiên đạt 6 000) in đậm');
  // Ảnh không phải PNG: bỏ qua, PDF vẫn dựng (không ảnh biểu đồ, có bảng theo ngày)
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_UTILITIES', filters: { ...filters, utility_type: 'WATER' }, charts: { WATER: Buffer.from('%PDF-1.4 nope').toString('base64') } }));
  const d2 = lastDoc(env);
  assert.equal(d2.body.children.filter((x) => x.kind === 'pagebreak').length, 0, 'lọc một loại: một trang');
  assert.deepEqual(pdfHeadOf(d2).title, ['Điện nước', '水电', 'Nước · 水']);
  assert.equal(d2.body.children.filter((x) => x.kind === 'p').flatMap((x) => x.images).length, 0);
  assert.ok(tablesOf(d2).some((t) => t.rows[0].cells[0].getText().startsWith('Ngày')));
});
