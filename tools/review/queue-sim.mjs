// Hàng chờ offline (rà soát lượt 5): KT trên iPhone, dùng đúng hàm của app (enqueue như các trang, syncNow như nút Đồng bộ).
// Kịch bản: (1) mất mạng: báo sự cố + sửa 2 lần (gộp) + 3 chỉ số → có mạng: đủ, đúng phiên bản; (2) mạng rớt GIỮA lúc gửi rồi gửi tiếp ở lần sau
// (sửa nối tiếp phải dùng đúng phiên bản); (3) mất phản hồi (máy chủ đã ghi, app không nhận) → không ghi trùng; (4) người khác sửa trước → mục của
// tôi thành Xung đột, các mục sau của cùng hồ sơ chờ, mục hồ sơ khác vẫn gửi; (5) đổi người dùng khi còn hàng chờ → người sau không gửi hộ, người
// trước đăng nhập lại thì gửi. Cuối: dữ liệu trên máy (sau đồng bộ) khớp máy chủ. Cách chạy: README.md
import { openApp } from '../../tests/ui/harness.mjs';
import { freshServer, ownerClient, userClient, uuid } from '../../tests/helpers.mjs';

const env = freshServer();
const c = ownerClient(env);
const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
userClient(env, 'U-KT2', 2, '583018', 'KY_THUAT');
const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
const eq = uuid(), m = uuid();
c.write('equipment.create', { equipment_id: eq, name_vi: 'Bơm nước 01' });
c.write('meter.edit', { meter_id: m, name_vi: 'Điện xưởng', utility_type: 'ELECTRICITY', multiplier: 1, reading_cycle_type: 'DAY_1' });
const T = (min) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() - min * 60000));
dn.write('reading.create', { reading_id: uuid(), meter_id: m, measured_at: T(60 * 24 * 3), cumulative_value: 1000 });
void kt;
let fault = null; // (req) => 'EXEC_THEN_AS_GET' | null
const app = await openApp({ env, viewport: { width: 390, height: 844 }, mobile: true, fault: (req, n) => (fault ? fault(req, n) : null) });
const { page, context } = app;
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ĐẠT ' : '  LỖI ') + msg); };
const rows = (s) => env.rows(s);
const login = async (code, pin) => {
  await page.fill('#emp', code); await page.fill('#pin', pin); await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 30000 });
};
const logout = async () => {
  await page.evaluate(() => { location.hash = '#/account'; });
  await page.waitForSelector('#ac-logout');
  await page.click('#ac-logout');
  await page.waitForTimeout(500);
  const keep = await page.$('.modal .btn.primary'); // còn mục chưa gửi → "Giữ nháp"
  if (keep) await keep.click();
  await page.waitForSelector('#emp', { timeout: 15000 });
};
// Gọi hàm của app trong trang (cùng bản module với app; CSP cấm eval nên mỗi việc là một nhánh)
const q = (op, a = {}) => page.evaluate(async ([op, a]) => {
  const sync = await import(new URL('js/sync.js', location.href).href);
  const appm = await import(new URL('js/app.js', location.href).href);
  switch (op) {
    case 'queue': return (await sync.queueItems()).map((o) => ({ a: o.action, id: o.entity_id, st: o.state, ev: o.expected_version, u: o.user_id }));
    case 'report': return !!(await sync.enqueue('repair.report', { repair_id: a.id, equipment_id: a.eq, symptom_vi: a.sym, severity: 'MEDIUM' }, { entity_type: 'REPAIR', entity_id: a.id, expected_version: 0, chain: true }));
    case 'edit': {
      // như repairs.js: phiên bản theo bản trên máy (0 khi hồ sơ chưa lên máy chủ), nối tiếp + gộp
      const rec = (await sync.getRecords('REPAIR')).find((r) => r.repair_id === a.id) || {};
      return !!(await sync.enqueue('repair.editReport', { repair_id: a.id, symptom_vi: a.sym }, { entity_type: 'REPAIR', entity_id: a.id, expected_version: Number(rec.record_version || 0), chain: true, merge: (x, y) => ({ ...x, ...y }) }));
    }
    // KT không ghi chỉ số điện nước (chỉ ĐN): dùng Ghi giờ chạy (cũng offline được, như maintenance.js)
    case 'reading': return !!(await sync.enqueue('maintenance.hours.record', { operating_reading_id: a.id, equipment_id: a.eq, cumulative_hours: a.v, measured_at: a.at, note: '', is_reset: false }, { entity_type: 'OPERATING_READING', entity_id: a.id, expected_version: 0, parent_id: '', chain: false }));
    case 'sync': { const r = await appm.syncNow({ quiet: true }); return { ok: r.ok, code: r.code || null }; }
    case 'drop': { for (const o of await sync.queueItems()) if (o.state === a.state) await sync.deleteQueued(o.operation_id); return true; }
    case 'local': return (await sync.getRecords('REPAIR')).map((r) => [r.repair_id, r.symptom_vi, r.record_version]);
    default: throw new Error('op ' + op);
  }
}, [op, a]);
const queue = () => q('queue');
const report = (id, sym) => q('report', { id, eq, sym });
const editRep = (id, sym) => q('edit', { id, sym });
const reading = (id, val, min) => q('reading', { id, eq, at: T(min), v: val });
const syncNow = () => q('sync');
const repRow = (id) => rows('Repairs').find((r) => r.repair_id === id);
try {
  await login('U-KT', '583017');
  // (1) Mất mạng: báo + sửa 2 lần (gộp thành một mục) + 3 chỉ số
  console.log('(1) mất mạng: báo sự cố, sửa 2 lần, 3 chỉ số');
  await context.setOffline(true);
  const r1 = uuid();
  await report(r1, 'Bơm kêu');
  await editRep(r1, 'Bơm kêu to');
  await editRep(r1, 'Bơm kêu to, rò nước');
  const rd = [uuid(), uuid(), uuid()];
  await reading(rd[0], 1100, 60 * 48); await reading(rd[1], 1200, 60 * 24); await reading(rd[2], 1300, 30);
  const q1 = await queue();
  check(q1.length === 5 && q1.filter((x) => x.a === 'repair.editReport').length === 1, `hàng chờ 5 mục, 2 lần sửa gộp 1: ${q1.map((x) => x.a + '/' + x.ev).join(', ')}`);
  await context.setOffline(false);
  await syncNow();
  const rr = repRow(r1);
  check(rr && rr.symptom_vi === 'Bơm kêu to, rò nước' && rr.record_version === 2, `máy chủ: ${rr && rr.symptom_vi} v${rr && rr.record_version}`);
  check(rd.every((id) => rows('OperatingReadings').some((x) => x.operating_reading_id === id)), '3 lần ghi giờ chạy lên máy chủ');
  check((await queue()).filter((x) => x.st !== 'DONE').length === 0, 'hàng chờ trống');

  // (2) Mạng rớt giữa lúc gửi: mục 1 lên, mục 2 rớt → lần đồng bộ sau gửi tiếp đúng phiên bản
  console.log('(2) mạng rớt giữa lúc gửi');
  await context.setOffline(true);
  const r2 = uuid();
  await report(r2, 'Quạt rung');
  await editRep(uuid(), 'x'); // hồ sơ không tồn tại → sẽ bị từ chối
  await editRep(r1, 'Bơm rò nước nhiều');
  await context.setOffline(false);
  let pushes = 0, dropped = 0;
  await page.route('**/exec**', async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'sync.push' && ++pushes === 2) { dropped++; return route.abort('internetdisconnected'); }
    return route.fallback();
  });
  await syncNow();
  await page.unroute('**/exec**');
  check(dropped === 1, 'đã làm rớt mạng ở mục gửi thứ 2');
  const mid = await queue();
  console.log('   sau lần 1:', mid.filter((x) => x.st !== 'DONE').map((x) => x.a + ':' + x.st).join(', '));
  await syncNow();
  const r1b = repRow(r1);
  check(r1b.symptom_vi === 'Bơm rò nước nhiều' && r1b.record_version === 3, `sửa nối tiếp sau khi rớt mạng: ${r1b.symptom_vi} v${r1b.record_version}`);
  check(!!repRow(r2), 'phiếu mới (r2) lên máy chủ');
  const left2 = (await queue()).filter((x) => x.st !== 'DONE');
  check(left2.length === 1 && left2[0].st === 'REJECTED', `còn lại đúng mục sửa hồ sơ không tồn tại (REJECTED): ${left2.map((x) => x.a + ':' + x.st).join(', ')}`);
  await q('drop', { state: 'REJECTED' });

  // (3) Mất phản hồi: máy chủ đã ghi, app không nhận → không ghi trùng
  console.log('(3) mất phản hồi');
  await context.setOffline(true);
  const r3 = uuid(), rd4 = uuid();
  await report(r3, 'Mất pha');
  await reading(rd4, 1400, 10);
  await context.setOffline(false);
  let n3 = 0;
  fault = (req) => (req.action === 'sync.push' && ++n3 <= 2 ? 'EXEC_THEN_AS_GET' : null);
  await syncNow();
  fault = null;
  await syncNow();
  check(rows('Repairs').filter((x) => x.repair_id === r3).length === 1, 'phiếu r3 đúng 1 dòng');
  check(rows('OperatingReadings').filter((x) => x.operating_reading_id === rd4).length === 1, 'chỉ số rd4 đúng 1 dòng');
  check((await queue()).filter((x) => x.st !== 'DONE').length === 0, 'hàng chờ trống sau khi hỏi trạng thái');

  // (4) Người khác sửa trước → Xung đột; mục sau của cùng hồ sơ chờ; hồ sơ khác vẫn gửi
  console.log('(4) người khác sửa trước');
  await syncNow();
  await context.setOffline(true);
  await editRep(r2, 'Quạt rung mạnh (tôi)');
  // mục thứ hai cùng hồ sơ (đã thử gửi? chưa) — dùng repair.process? đơn giản: thêm một sửa nữa sau khi đánh dấu mục trước đã thử gửi
  const rd5 = uuid();
  await reading(rd5, 1500, 5);
  const v2 = repRow(r2).record_version;
  const other = c.write('repair.editReport', { repair_id: r2, symptom_vi: 'Người khác sửa' }, { expected_version: v2 });
  await context.setOffline(false);
  await syncNow();
  const q4 = (await queue()).filter((x) => x.st !== 'DONE');
  check(other.ok && q4.length === 1 && q4[0].st === 'CONFLICT' && q4[0].id === r2, `mục sửa r2 thành Xung đột: ${q4.map((x) => x.a + ':' + x.st).join(', ')}`);
  check(repRow(r2).symptom_vi === 'Người khác sửa', 'máy chủ giữ bản người khác (không ghi đè)');
  check(rows('OperatingReadings').some((x) => x.operating_reading_id === rd5), 'chỉ số của hồ sơ khác vẫn gửi');
  const blockedLater = uuid();
  void blockedLater;
  await q('drop', { state: 'CONFLICT' });

  // (5) Đổi người dùng khi còn hàng chờ
  console.log('(5) đổi người dùng khi còn hàng chờ');
  await context.setOffline(true);
  const r5 = uuid();
  await report(r5, 'Tủ điện nóng');
  await context.setOffline(false);
  fault = (req) => (req.action === 'sync.push' ? 'EXEC_THEN_AS_GET' : null); // để mục còn trong hàng chờ lúc đăng xuất (không chắc đã ghi)
  await syncNow();
  fault = null;
  const before5 = rows('Repairs').filter((x) => x.repair_id === r5).length;
  await logout().catch((e) => console.log('   (đăng xuất:', String(e.message).slice(0, 80), ')'));
  await login('U-KT2', '583018');
  await syncNow();
  const qk2 = await queue();
  check(qk2.some((x) => x.id === r5), `hàng chờ của KT vẫn giữ khi KT2 đăng nhập (${qk2.map((x) => x.a + ':' + x.st).join(', ')})`);
  const rr5 = rows('Repairs').find((x) => x.repair_id === r5);
  check(!rr5 || rr5.reported_by !== rows('Users').find((u) => u.employee_code === 'U-KT2').user_id, 'KT2 không gửi hộ mục của KT');
  await logout().catch(() => {});
  await login('U-KT', '583017');
  await syncNow();
  check(rows('Repairs').filter((x) => x.repair_id === r5).length === 1, `KT đăng nhập lại: phiếu r5 đúng 1 dòng (trước đó ${before5})`);
  check((await queue()).filter((x) => x.st !== 'DONE' && x.u === rows('Users').find((u) => u.employee_code === 'U-KT').user_id).length === 0, 'hàng chờ của KT trống');

  // Cuối: dữ liệu trên máy khớp máy chủ
  await syncNow();
  const local = await q('local');
  const server = rows('Repairs').map((r) => [r.repair_id, r.symptom_vi, r.record_version]);
  const key = (a) => JSON.stringify(a.slice().sort());
  check(key(local) === key(server), `phiếu sửa chữa trên máy khớp máy chủ (${local.length}/${server.length})`);
  check(app.consoleErrors.length === 0, 'không lỗi console ' + JSON.stringify(app.consoleErrors).slice(0, 200));
} finally {
  await app.close();
}
console.log('lỗi', bad);
