// d4.26: cân bằng đồng hồ tổng – nhánh (thất thoát), ngưỡng chung/riêng (meter.tolerance.set), lọc một đồng hồ trong báo cáo,
// báo vượt ngưỡng của tháng vừa kết thúc (utility.view {balance_alerts}).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../helpers.mjs';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lastDoc = (env) => [...env.drive._docs.values()].pop();

/**
 * Hôm nay 04/11/2026. Điện: MSB1 (tổng, +10 000/ngày) → nhánh A (+4 000), B (+3 000), C (+2 800) → cộng 9 800, thất thoát 2 %;
 * nhánh A có nhánh con A1 (+3 900, thất thoát của A 2,5 %). Nước: NT (+100) → NT-1 (+104): nhánh lớn hơn tổng 4 %.
 * opts.missC: nhánh C không đọc ngày 15/10.
 */
function setup(opts = {}) {
  const env = freshServer({ now: '2026-11-04T10:00:00+07:00' });
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const id = {};
  const add = (code, type, parent, step) => {
    id[code] = uuid();
    ok(c.write('meter.edit', { meter_id: id[code], meter_code: code, name_vi: 'ĐH ' + code, utility_type: type, multiplier: 1, reading_cycle_type: 'DAY_1', parent_meter_id: parent ? id[parent] : undefined }));
    return { code, step, v: 1000 };
  };
  const ms = [add('MSB1', 'ELECTRICITY', null, 10000), add('A', 'ELECTRICITY', 'MSB1', 4000), add('B', 'ELECTRICITY', 'MSB1', 3000),
    add('C', 'ELECTRICITY', 'MSB1', 2800), add('A1', 'ELECTRICITY', 'A', 3900), add('NT', 'WATER', null, 100), add('NT-1', 'WATER', 'NT', 104)];
  for (let d = '2026-10-01'; d <= '2026-11-04'; d = shift(d, 1)) {
    ms.forEach((m, i) => {
      if (!(opts.missC && m.code === 'C' && d === '2026-10-15')) {
        ok(dn.write('reading.create', { reading_id: uuid(), meter_id: id[m.code], measured_at: `${d}T08:${String(5 + i).padStart(2, '0')}:00+07:00`, cumulative_value: m.v }));
      }
      m.v += m.step;
    });
  }
  return { env, c, c3, dn, id };
}

const run = (cl, filters) => ok(cl.call('report.run', { code: 'RPT_UTILITIES', filters: { period_type: 'MONTH', date: '2026-10-01', ...filters } })).data;

test('cân bằng tháng: tổng − cộng nhánh trực tiếp, %, ngưỡng mặc định (điện 3 %, nước 5 %), nhánh nhiều cấp theo thứ tự cây', () => {
  const { c3 } = setup();
  const b = run(c3, {}).balance;
  assert.deepEqual(b.map((r) => [r.meter_code, r.level]), [['MSB1', 0], ['A', 1], ['NT', 0]]);
  const msb = b[0];
  assert.equal(msb.consumption, 310000);
  assert.equal(msb.children_n, 3);
  assert.equal(msb.children_sum, 303800);
  assert.equal(msb.loss, 6200);
  assert.equal(msb.pct, 2);
  assert.equal(msb.tol, 3);
  assert.equal(msb.tol_custom, false);
  assert.equal(msb.status, 'OK');
  assert.deepEqual(msb.children.map((x) => [x.meter_code, x.consumption]), [['A', 124000], ['B', 93000], ['C', 86800]]);
  assert.equal(b[1].pct, 2.5, 'A so với A1 (cấp 2)');
  assert.equal(b[2].pct, -4, 'nhánh nước lớn hơn tổng 4 %');
  assert.equal(b[2].tol, 5);
  assert.equal(b[2].status, 'OK', '−4 % vẫn trong ngưỡng nước 5 %');
  // Lọc loại Nước: chỉ dòng NT
  assert.deepEqual(run(c3, { utility_type: 'WATER' }).balance.map((r) => r.meter_code), ['NT']);
});

test('ngưỡng: chung theo loại chỉ Quản trị (PIN); riêng từng đồng hồ tổng C3/C4; xóa ngưỡng riêng → về ngưỡng chung; giá trị sai bị chặn', () => {
  const { c, c3, id } = setup();
  assert.equal(c3.write('meter.tolerance.set', { utility_type: 'ELECTRICITY', pct: 1 }, { reauth_token: c3.reauth() }).code, 'FORBIDDEN', 'C3 không sửa ngưỡng chung');
  assert.equal(c.write('meter.tolerance.set', { utility_type: 'ELECTRICITY', pct: 1.5 }).code, 'REAUTH_REQUIRED', 'cần PIN');
  assert.equal(c.write('meter.tolerance.set', { utility_type: 'ELECTRICITY', pct: 80 }, { reauth_token: c.reauth() }).code, 'VALIDATION_ERROR');
  const r = ok(c.write('meter.tolerance.set', { utility_type: 'ELECTRICITY', pct: 1.54 }, { reauth_token: c.reauth() }));
  assert.equal(r.data.meter_loss_tolerance.ELECTRICITY, 1.5, 'làm tròn 0,1');
  let b = run(c3, {}).balance;
  assert.equal(b[0].status, 'OVER', 'MSB1 2 % > 1,5 %');
  assert.equal(b[1].status, 'OVER', 'A 2,5 % > 1,5 %');
  // Ngưỡng riêng cho MSB1 (C3)
  ok(c3.write('meter.tolerance.set', { meter_id: id.MSB1, pct: 2.5, reason: 'đồng hồ cũ' }, { reauth_token: c3.reauth() }));
  b = run(c3, {}).balance;
  assert.deepEqual([b[0].tol, b[0].tol_custom, b[0].status], [2.5, true, 'OK']);
  assert.equal(b[1].status, 'OVER', 'A vẫn theo ngưỡng chung 1,5 %');
  // Đồng hồ không có nhánh thì không đặt ngưỡng riêng
  assert.equal(c3.write('meter.tolerance.set', { meter_id: id.B, pct: 2 }, { reauth_token: c3.reauth() }).code, 'VALIDATION_ERROR');
  ok(c3.write('meter.tolerance.set', { meter_id: id.MSB1, pct: null }, { reauth_token: c3.reauth() }));
  b = run(c3, {}).balance;
  assert.deepEqual([b[0].tol, b[0].tol_custom, b[0].status], [1.5, false, 'OVER']);
  // Ngưỡng gửi xuống app (Settings client) và ghi nhật ký
  const boot = ok(c3.call('sync.bootstrap', {})).data;
  assert.equal(boot.settings.meter_loss_tolerance.ELECTRICITY, 1.5);
});

test('một nhánh thiếu số trong kỳ → Thiếu số liệu (không tính, không đoán); tháng chưa kết thúc → Kỳ chưa kết thúc', () => {
  const { c3 } = setup({ missC: true });
  const b = run(c3, {}).balance;
  assert.equal(b[0].status, 'OK', 'cả tháng vẫn đủ: thiếu một lần đọc giữa tháng không ảnh hưởng số đầu/cuối kỳ');
  const one = run(c3, { period_type: 'CUSTOM', from: '2026-10-14', to: '2026-10-14', date: undefined }).balance;
  assert.deepEqual([one[0].status, one[0].missing, one[0].loss], ['MISSING', ['C'], null]);
  const cur = run(c3, { date: '2026-11-02' }).balance;
  assert.equal(cur[0].status, 'OPEN');
});

test('lọc một đồng hồ: đồng hồ tổng có cân bằng từng ngày (tham khảo); đồng hồ nhánh chỉ còn số của nó', () => {
  const { c3, id } = setup({ missC: true });
  const d = run(c3, { meter_id: id.MSB1 });
  assert.deepEqual(d.rows.map((r) => r.meter_code), ['MSB1']);
  assert.equal(d.meter.meter_code, 'MSB1');
  assert.deepEqual(d.balance.map((r) => r.meter_code), ['MSB1']);
  const bd = d.balance_daily;
  assert.equal(bd.days.length, 31);
  assert.deepEqual([bd.v[0], bd.c[0], bd.loss[0], bd.pct[0], bd.st[0]], [10000, 9800, 200, 2, 'ok']);
  assert.equal(bd.st[13], 'none', '14/10: C thiếu số đầu ngày 15/10');
  assert.equal(bd.st[14], 'none');
  assert.equal(d.daily.meters.length, 1);
  const sub = run(c3, { meter_id: id.B });
  assert.deepEqual(sub.rows.map((r) => r.meter_code), ['B']);
  assert.equal(sub.balance.length, 0);
  assert.equal(sub.balance_daily, null);
  assert.equal(sub.daily.totals.ELECTRICITY.v[0], 3000, 'tổng = chính đồng hồ nhánh');
  // ID sai → lỗi
  assert.equal(c3.call('report.run', { code: 'RPT_UTILITIES', filters: { meter_id: 'x' } }).code, 'VALIDATION_ERROR');
});

test('báo vượt ngưỡng tháng vừa kết thúc (utility.view {balance_alerts})', () => {
  const { c, c3 } = setup();
  let a = ok(c3.call('utility.view', { balance_alerts: true })).data;
  assert.equal(a.month, '2026-10');
  assert.equal(a.items.length, 0, 'trong ngưỡng');
  ok(c.write('meter.tolerance.set', { utility_type: 'WATER', pct: 3 }, { reauth_token: c.reauth() }));
  a = ok(c3.call('utility.view', { balance_alerts: true })).data;
  assert.deepEqual(a.items.map((x) => [x.meter_code, x.status, x.pct, x.tol]), [['NT', 'UNDER', -4, 3]]);
});

test('PDF: báo cáo cả loại có bảng Cân bằng (thụt theo cấp, kết luận màu); lọc một đồng hồ tổng có ô Thất thoát, phân bổ theo nhánh, cân bằng theo ngày', () => {
  const { env, c, c3, id } = setup();
  ok(c.write('meter.tolerance.set', { utility_type: 'ELECTRICITY', pct: 1.5 }, { reauth_token: c.reauth() }));
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_UTILITIES', filters: { period_type: 'MONTH', date: '2026-10-01', utility_type: 'ELECTRICITY' } }));
  let doc = lastDoc(env);
  let tables = doc.body.children.filter((x) => x.kind === 'table');
  const bt = tables.find((t) => t.rows[0].cells[0].getText().startsWith('Đồng hồ tổng'));
  assert.ok(bt, 'bảng Cân bằng');
  assert.equal(bt.rows.length, 3, 'MSB1 + A');
  assert.ok(bt.rows[1].cells[0].getText().startsWith('MSB1 · ĐH MSB1'));
  assert.ok(bt.rows[2].cells[0].getText().includes('↳ A'), 'cấp 2 thụt vào');
  assert.equal(bt.rows[1].cells[3].getText(), '6\u202F200 (2 %)');
  assert.ok(bt.rows[1].cells[5].getText().startsWith('Vượt ngưỡng'));
  assert.equal(bt.rows[1].cells[5].st.FOREGROUND_COLOR, '#B42318', 'kết luận chữ đỏ');
  assert.ok(doc.body.children.some((x) => x.kind === 'p' && x.text.includes('Thất thoát = Tổng')), 'chú thích cách tính');
  // Lọc MSB1
  ok(c3.call('report.export', { format: 'PDF', code: 'RPT_UTILITIES', filters: { period_type: 'MONTH', date: '2026-10-01', meter_id: id.MSB1 } }));
  doc = lastDoc(env);
  tables = doc.body.children.filter((x) => x.kind === 'table');
  const meta = tables[1].getText();
  assert.ok(meta.includes('Đồng hồ · 计量表: MSB1 · ĐH MSB1'), meta);
  const tiles = tables.find((t) => t.st.BORDER_COLOR === '#FFFFFF');
  const tileTexts = Array.from(tiles.rows.flatMap((r) => r.cells), (x) => x.getText());
  assert.ok(tileTexts.some((x) => x.startsWith('Thất thoát') && x.includes('6\u202F200 kWh · 2 %')), tileTexts.join(' | '));
  const paras = doc.body.children.filter((x) => x.kind === 'p').map((x) => x.text);
  assert.ok(paras.some((x) => x.startsWith('Phân bổ theo nhánh')), 'phân bổ theo nhánh');
  const bars = tables.find((t) => t.rows.some((r) => r.cells[0].getText().startsWith('Thất thoát')) && t.rows[0].cells.length === 3);
  assert.deepEqual(Array.from(bars.rows, (r) => r.cells[0].getText().split(' · ')[0]), ['A', 'B', 'C', 'Thất thoát']);
  const dd = tables.find((t) => t.rows[0].cells.length === 8 && t.rows[0].cells[3].getText().startsWith('Chênh lệch'));
  assert.ok(dd, 'cân bằng theo ngày');
  assert.equal(dd.rows[0].cells.length, 8, 'hai nửa × 4 cột');
  assert.equal(dd.rows[1].cells[3].getText(), '200 (2 %)');
  assert.equal(dd.rows[1].cells[3].st.FOREGROUND_COLOR, '#B42318', 'ngày vượt ngưỡng chữ đỏ');
  assert.ok(!tables.some((t) => t.rows[0].cells[1] && t.rows[0].cells[1].getText().startsWith('Chỉ số đầu ngày')), 'không còn bảng chỉ số theo ngày');
});
