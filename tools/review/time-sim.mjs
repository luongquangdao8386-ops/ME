// Giả lập 16 tháng chạy thật (01/12/2026 → 31/03/2028, qua tháng 2 năm nhuận 2028): mỗi ngày chạy tác vụ nền như trigger (2 lần — không được
// sinh trùng), kỹ thuật làm xong + trưởng bộ phận nghiệm thu phiếu đúng ngày hạn. So hạn các phiếu sinh ra của từng kế hoạch với lịch cố định
// theo ngày mốc (31 → ngày cuối tháng ngắn, 29/02 năm nhuận). Cách chạy: tools/review/README.md
import { freshServer, ownerClient, userClient, uuid, OWNER_CODE, OWNER_PIN } from '../../tests/helpers.mjs';

const ok = (r, what) => { if (!r.ok) throw new Error((what || '') + ' ' + JSON.stringify(r).slice(0, 300)); return r; };
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const last = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addMonths = (anchor, k) => {
  const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7)) - 1 + k, d = Number(anchor.slice(8, 10));
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last(yy, mm))).padStart(2, '0')}`;
};
const START = '2026-12-01', END = '2028-03-31';
const env = freshServer({ now: START + 'T02:00:00+07:00' });
const setDay = (d, hm = '02:00') => { env.clock.offset = 0; env.clock.offset = Date.parse(`${d}T${hm}:00+07:00`) - Date.now(); };
const c = ownerClient(env);
const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
const c3 = userClient(env, 'U-C3', 3, '694127');
const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
const relogin = () => { c.login(OWNER_CODE, OWNER_PIN); kt.login('U-KT', '583017'); c3.login('U-C3', '694127'); };
const PLANS = [
  ['Cuối tháng (31)', 'MONTH', 1, '2027-01-31'],
  ['Quý (30/11)', 'MONTH', 3, '2026-11-30'],
  ['Năm, 29/02', 'MONTH', 12, '2028-02-29'],
  ['Tuần', 'DAY', 7, '2026-12-03'],
  ['Tháng (29)', 'MONTH', 1, '2027-01-29'],
  ['6 tháng (31/08)', 'MONTH', 6, '2027-08-31']
];
const plans = PLANS.map(([title, type, val, anchor]) => {
  const eq = uuid(), id = uuid();
  ok(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy ' + title }), 'eq');
  ok(c.write('maintenance.plan.edit', { plan_id: id, equipment_id: eq, title_vi: title, interval_type: type, interval_value: val, anchor_date: anchor, assignee_user_id: ktId }), 'plan ' + title);
  return { id, title, type, val, anchor };
});
const T = (d, hm) => env.g.isoVN_(new Date(Date.parse(`${d}T${hm}:00+07:00`)));
const woRows = () => env.rows('WorkOrders');
let errors = 0, done = 0;
for (let d = START; d <= END; d = add(d, 1)) {
  setDay(d);
  if (d.endsWith('-01') || d.endsWith('-15')) relogin();
  env.g.dbReset_(); env.g.runBackgroundJobs();
  env.g.dbReset_(); env.g.runBackgroundJobs(); // trigger chạy hai lần
  env.g.dbReset_(); env.g.sendExpiryDigest();
  // Làm xong phiếu tới hạn hôm nay
  setDay(d, '09:00');
  for (const w of woRows().filter((x) => x.due_date === d && x.status === 'ASSIGNED')) {
    const ver = () => woRows().find((x) => x.work_order_id === w.work_order_id).record_version;
    const res = env.rows('WorkOrderResults').filter((r) => r.work_order_id === w.work_order_id).map((r) => ({ result_id: r.result_id, result_status: 'PASS' }));
    try {
      ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, start_at: T(d, '08:00') }, { expected_version: ver() }), 'start');
      ok(kt.write('maintenance.execute', { work_order_id: w.work_order_id, end_at: T(d, '08:45'), overall_result: 'PASS', results: res }, { expected_version: ver() }), 'end');
      ok(kt.write('maintenance.submit', { work_order_id: w.work_order_id }, { expected_version: ver() }), 'submit');
      const rt = c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
      ok(c3.write('maintenance.accept', { work_order_id: w.work_order_id, decision: 'ACCEPT' }, { expected_version: ver(), reauth_token: rt }), 'accept');
      done++;
    } catch (e) { errors++; if (errors < 5) console.log('LỖI LÀM PHIẾU', d, String(e.message).slice(0, 300)); }
  }
}
// So với lịch cố định
let bad = 0;
const wos = woRows();
for (const p of plans) {
  const got = wos.filter((w) => w.plan_id === p.id).map((w) => w.due_date).sort();
  const dup = got.filter((x, i) => got.indexOf(x) !== i);
  const exp = [];
  for (let k = 0; k < 400; k++) {
    const dd = p.type === 'DAY' ? add(p.anchor, k * p.val) : addMonths(p.anchor, k * p.val);
    if (dd > add(END, 7)) break; // phiếu sinh trước hạn 7 ngày (wo_generate_days_ahead)
    if (dd < START) continue;     // ngày mốc đã qua lúc lập kế hoạch: hạn đầu là kỳ đầu tiên từ hôm đó (gợi ý mt.anchor_hint)
    exp.push(dd);
  }
  const same = JSON.stringify(got) === JSON.stringify(exp);
  if (!same || dup.length) bad++;
  console.log((same && !dup.length ? 'ĐẠT ' : 'LỖI ') + p.title.padEnd(18), `phiếu ${got.length}/${exp.length}`, dup.length ? 'TRÙNG ' + dup : '',
    same ? '' : `\n   có: ${got.join(' ')}\n   cần: ${exp.join(' ')}`);
}
const open = wos.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status));
console.log('phiếu đã làm', done, '· lỗi làm phiếu', errors, '· còn mở', open.length, open.map((w) => w.due_date + ' ' + w.status).join(', '), '· kế hoạch lỗi', bad);
