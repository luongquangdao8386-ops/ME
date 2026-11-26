// Gửi request ngẫu nhiên sai vào mọi action. Cách chạy: tools/review/README.md
// Bắn dữ liệu lỗi vào mọi action của máy chủ M&E: không được INTERNAL_ERROR (ngoại lệ chưa bắt) — ghi lại action, payload, stack.
import fs from 'node:fs';
import { freshServer, ownerClient, userClient, uuid, OWNER_PIN } from '../../tests/helpers.mjs';
const ROOT = new URL('../../', import.meta.url).pathname;

const OUT = process.argv[2];
const ROUNDS = Number(process.env.ROUNDS || 40);
const ok = (r) => { if (!r.ok) throw new Error(JSON.stringify(r).slice(0, 300)); return r; };
const dayVN = (n = 0) => new Date(Date.now() + 7 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const T = (d, hm) => `${d}T${hm}:00+07:00`;

function seed() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  env.g.pocSeedSampleData();
  env.g.dbReset_();
  const loc = env.rows('Locations')[0].location_id;
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const kt = userClient(env, 'U-KT', 2, '583017', 'KY_THUAT');
  const c3 = userClient(env, 'U-C3', 3, '694127');
  c3.reauth = () => c3.call('auth.reauth', { pin: '694127' }).data.reauth_token;
  const c1 = userClient(env, 'U-C1', 1, '583019');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  const elec = uuid();
  ok(c.write('meter.edit', { meter_id: elec, name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', location_id: loc, multiplier: 1, reading_cycle_type: 'DAY_1' }));
  for (let i = 6; i >= 1; i--) ok(dn.write('reading.create', { reading_id: uuid(), meter_id: elec, measured_at: T(dayVN(i), '07:30'), cumulative_value: 10000 + (6 - i) * 100 }));
  const eqM = uuid();
  ok(c.write('equipment.create', { equipment_id: eqM, name_vi: 'Máy nén', location_id: loc }));
  const panel = uuid();
  ok(c.write('circuit.edit', { entity: 'PANEL', panel_id: panel, name_vi: 'Tủ tổng', panel_type: 'MAIN_SWITCHBOARD' }));
  const tpl = uuid();
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'BD', items: [{ label_vi: 'Dầu', result_type: 'PASS_FAIL' }] }));
  const plan = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eqM, title_vi: 'BD tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: dayVN(0), checklist_template_id: tpl, assignee_user_id: ktId }));
  const rp = uuid();
  ok(kt.write('repair.report', { repair_id: rp, equipment_id: eqM, symptom_vi: 'Kêu to', severity: 'HIGH' }));
  const mat = uuid();
  ok(c.write('material.create', { material_id: mat, name_vi: 'Lọc dầu', base_unit: 'cái' }));
  const co = uuid();
  ok(c.write('contract.create', { contract_id: co, title_vi: 'HĐ', start_date: '2026-01-01', end_date: '2027-01-01' }));
  env.g.dbReset_();
  const ids = {};
  const pick = (sheet, key) => { const r = env.rows(sheet)[0]; return r ? r[key] : uuid(); };
  Object.assign(ids, {
    equipment_id: eqM, meter_id: elec, panel_id: panel, template_id: tpl, plan_id: plan, repair_id: rp, material_id: mat, contract_id: co,
    location_id: loc, user_id: ktId, work_order_id: pick('WorkOrders', 'work_order_id'), reading_id: pick('MeterReadings', 'reading_id'),
    requirement_id: pick('InspectionRequirements', 'requirement_id'), inspection_type_id: pick('InspectionTypes', 'inspection_type_id'),
    vendor_id: pick('Vendors', 'vendor_id'), lookup_id: pick('LookupValues', 'lookup_id'), document_id: uuid(), circuit_id: uuid()
  });
  return { env, c, c1, c3, ids };
}

const { env, c, c1, c3, ids } = seed();
const g = env.g;
const src = fs.readFileSync(ROOT + 'apps-script/Code.gs', 'utf8');
// action → tên hàm xử lý → các trường p.xxx trong thân hàm (và hàm _ được gọi trực tiếp một tầng)
function bodyOf(fn) {
  const i = src.indexOf('function ' + fn + '(');
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
const handlerSrc = src.slice(src.indexOf('var HANDLERS_ = {'), src.indexOf('};', src.indexOf('var HANDLERS_ = {')));
const fieldsOf = (action) => {
  const m = new RegExp("'" + action.replace(/\./g, '\\.') + "':\\s*function\\s*\\([^)]*\\)\\s*\\{\\s*return\\s+([A-Za-z0-9_]+)\\(").exec(handlerSrc);
  if (!m) return [];
  let body = bodyOf(m[1]);
  // một tầng hàm phụ nhận p / ctx
  for (const k of body.matchAll(/\b([a-zA-Z0-9]+_)\((?:ctx|p)\b/g)) body += bodyOf(k[1]);
  const f = new Set();
  for (const k of body.matchAll(/\bp\.([a-z_][a-z0-9_]*)/g)) f.add(k[1]);
  for (const k of body.matchAll(/payload\.([a-z_][a-z0-9_]*)/g)) f.add(k[1]);
  return [...f];
};
const LONG = 'Ă'.repeat(5000);
const weird = () => {
  const vals = [null, '', 'abc', -1, 0, 1e20, 3.7, [], {}, true, LONG, '<b>x</b>', uuid(), '2026-02-30', '2026-13-01', 'NaN', [null], [{}], { a: { b: 1 } }, ' ', '0', '25:00', '-0'];
  return vals[Math.floor(Math.random() * vals.length)];
};
const goodFor = (f) => {
  if (ids[f]) return Math.random() < 0.7 ? ids[f] : uuid();
  if (/_ids$/.test(f)) { const k = f.replace(/s$/, ''); return ids[k] ? [ids[k]] : [uuid()]; }
  if (/date|_from|_to$/.test(f)) return dayVN(Math.floor(Math.random() * 40) - 20);
  if (/_at$/.test(f)) return T(dayVN(Math.floor(Math.random() * 10)), '08:00');
  return undefined;
};
const results = [];
const table = g.ACTION_TABLE_.map((l) => l.split('|')).filter((r) => r[r.length - 2] !== 'POC' && r[r.length - 2] !== 'H' && r[r.length - 3] !== 'internal');
const who = [['C4', c], ['C3', c3], ['C1', c1]];
let n = 0;
const codes = {}, okBy = {};
for (const row of table) {
  const action = row[0], isW = row[row.length - 1] === 'W', net = row[row.length - 3];
  if (/^auth\.|^pin\.|^session\.|^system\.reset|^archive\.start|^backup\.run|^sync\.bootstrap/.test(action)) continue; // tránh đổi phiên / chạy lâu
  const fields = fieldsOf(action);
  const variants = [null, {}, [], 'x', 42];
  for (let i = 0; i < ROUNDS; i++) {
    const p = {};
    fields.forEach((f) => { const r = Math.random(); if (r < 0.25) return; p[f] = r < 0.6 && goodFor(f) !== undefined ? goodFor(f) : weird(); });
    variants.push(p);
  }
  for (const [lvl, cl] of who) {
    for (const payload of (lvl === 'C4' ? variants : variants.slice(0, 8))) {
      const extra = {};
      if (isW) { extra.operation_id = uuid(); extra.expected_version = [0, 1, 2, undefined, 'x', -1][Math.floor(Math.random() * 6)]; }
      if (net === 'pin' || /approve|accept/.test(action)) extra.reauth_token = cl.reauth ? cl.reauth() : undefined;
      const before = env.logs.length;
      let r;
      try { r = cl.call(action, payload, extra); } catch (e) { r = { ok: false, code: 'THROW', message: String(e && e.stack || e) }; }
      n++;
      codes[r.code] = (codes[r.code] || 0) + 1; if (r.ok) okBy[action] = (okBy[action] || 0) + 1;
      if (r.code === 'INTERNAL_ERROR' || r.code === 'THROW') {
        const log = env.logs.slice(before).find((l) => /INTERNAL_ERROR|ERR/.test(l)) || r.message || '';
        results.push({ action, lvl, payload: JSON.stringify(payload).slice(0, 400), extra: JSON.stringify(extra).slice(0, 120), err: String(log).slice(0, 700) });
      }
    }
  }
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
const by = {};
results.forEach((x) => { const k = x.action + ' :: ' + (x.err.split('\n')[0].replace(/INTERNAL_ERROR [0-9a-f-]+ /, '').slice(0, 160)); by[k] = (by[k] || 0) + 1; });
console.log('calls', n, 'internal', results.length);
console.log(JSON.stringify(codes));
console.log('actions with OK:', Object.keys(okBy).length, '/', table.length);
console.log('never OK:', table.map((r) => r[0]).filter((a) => !okBy[a]).join(' '));
Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(v, k));
