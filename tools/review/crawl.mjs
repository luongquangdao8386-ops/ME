// Mở mọi màn theo 6 cấp × iPhone/web với dữ liệu mẫu đủ module. Cách chạy: tools/review/README.md
// Rà soát giao diện: dựng dữ liệu mẫu đủ module, mở mọi màn theo từng cấp, iPhone + web; ghi lỗi console, lỗi máy chủ, chữ lạ, tràn ngang.
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from '../../tests/ui/harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../../tests/helpers.mjs';
const ROOT = new URL('../../', import.meta.url).pathname;

const OUT = process.argv[2];
const SHOTS = process.argv[3];
fs.mkdirSync(SHOTS, { recursive: true });
const ok = (r) => { if (!r.ok) throw new Error(JSON.stringify(r).slice(0, 400)); return r; };
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
  userClient(env, 'U-C1', 1, '583019');
  userClient(env, 'U-HD', 2, '583020', 'HD_KD');
  const ktId = env.rows('Users').find((u) => u.employee_code === 'U-KT').user_id;
  // Điện nước
  const elec = uuid(), water = uuid(), sub = uuid();
  ok(c.write('meter.edit', { meter_id: elec, name_vi: 'Điện tổng', utility_type: 'ELECTRICITY', location_id: loc, multiplier: 1, reading_cycle_type: 'DAY_1' }));
  ok(c.write('meter.edit', { meter_id: sub, name_vi: 'Điện nhánh xưởng', utility_type: 'ELECTRICITY', location_id: loc, multiplier: 1, reading_cycle_type: 'DAY_1', parent_meter_id: elec }));
  ok(c.write('meter.edit', { meter_id: water, name_vi: 'Nước tổng', utility_type: 'WATER', location_id: loc, multiplier: 1, reading_cycle_type: 'MONTH' }));
  for (let i = 12; i >= 1; i--) {
    ok(dn.write('reading.create', { reading_id: uuid(), meter_id: elec, measured_at: T(dayVN(i), '07:30'), cumulative_value: 10000 + (12 - i) * 100 }));
    ok(dn.write('reading.create', { reading_id: uuid(), meter_id: sub, measured_at: T(dayVN(i), '07:40'), cumulative_value: 5000 + (12 - i) * 90 }));
  }
  ok(dn.write('reading.create', { reading_id: uuid(), meter_id: water, measured_at: T(dayVN(20), '08:00'), cumulative_value: 600 }));
  const tf = uuid();
  ok(c3.write('tariff.edit', { tariff_id: tf, utility_type: 'ELECTRICITY', effective_from: '2026-01-01', unit_price: 2000, tax_rate: 8, name_vi: 'Giá điện 2026' }));
  ok(c.write('tariff.approve', { tariff_id: tf, decision: 'APPROVE' }, { expected_version: env.rows('UtilityTariffs')[0].record_version, reauth_token: c.reauth() }));
  ok(c.write('meter.event.create', { event_id: uuid(), meter_id: water, event_type: 'REPLACE', event_at: T(dayVN(3), '09:00'), closing_value: 640, opening_value: 0, note_vi: 'Thay đồng hồ' }));
  // Lộ điện
  const eqs = env.rows('Equipment');
  const eqDb = uuid(), eqM = uuid();
  ok(c.write('equipment.create', { equipment_id: eqDb, name_vi: 'Tủ DB1', location_id: loc }));
  ok(c.write('equipment.create', { equipment_id: eqM, name_vi: 'Máy nén khí 37 kW', location_id: loc, in_service_year: 2019, strict_safety: true, registration_no: 'BN-01' }));
  const panel = (name, type, extra = {}) => { const id = uuid(); ok(c.write('circuit.edit', { entity: 'PANEL', panel_id: id, name_vi: name, panel_type: type, ...extra })); return id; };
  const circuit = (pid, name, extra = {}) => { const id = uuid(); ok(c.write('circuit.edit', { entity: 'CIRCUIT', circuit_id: id, panel_id: pid, name_vi: name, ...extra })); return id; };
  const load = (cid, extra) => ok(c.write('circuit.edit', { entity: 'LOAD', load_link_id: uuid(), circuit_id: cid, ...extra }));
  const G = panel('Điểm nhận lưới 22 kV', 'SOURCE_GRID');
  const MSB = panel('Tủ tổng MSB', 'MAIN_SWITCHBOARD', { location_id: loc });
  const DB = panel('Tủ DB1', 'DISTRIBUTION_BOARD', { equipment_id: eqDb });
  const c1 = circuit(G, 'Lộ lưới → MSB'); load(c1, { downstream_panel_id: MSB });
  const c2 = circuit(MSB, 'Lộ MSB → DB1', { voltage: 400, phases: 3, breaker_rating_a: 250 }); load(c2, { downstream_panel_id: DB });
  const c5 = circuit(DB, 'Lộ máy nén khí', { voltage: 380, phases: 3, breaker_rating_a: 63 }); load(c5, { equipment_id: eqM, rated_load_kw: 37 });
  // Bảo trì
  const tpl = uuid();
  ok(c.write('maintenance.checklist.edit', { template_id: tpl, template_name_vi: 'Bảo dưỡng máy nén', form_code: 'BM-CĐ-03-03a', items: [{ label_vi: 'Kiểm tra dầu', result_type: 'PASS_FAIL' }, { label_vi: 'Áp suất', result_type: 'NUMBER', unit: 'bar', min_value: 6, max_value: 8 }] }));
  const plan = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan, equipment_id: eqM, title_vi: 'Bảo dưỡng tháng', interval_type: 'MONTH', interval_value: 1, anchor_date: dayVN(0), checklist_template_id: tpl, assignee_user_id: ktId }));
  const plan2 = uuid();
  ok(c.write('maintenance.plan.edit', { plan_id: plan2, equipment_id: eqs[0].equipment_id, title_vi: 'Vệ sinh tuần', interval_type: 'DAY', interval_value: 7, anchor_date: dayVN(10), assignee_user_id: ktId }));
  env.g.dbReset_();
  const wo = env.rows('WorkOrders').find((x) => x.plan_id === plan);
  const ver = (id) => env.rows('WorkOrders').find((x) => x.work_order_id === id).record_version;
  const at = (m) => env.g.isoVN_(new env.clock.Date(env.clock.Date.now() + m * 60000));
  const res = env.rows('WorkOrderResults').filter((r) => r.work_order_id === wo.work_order_id);
  ok(kt.write('maintenance.execute', { work_order_id: wo.work_order_id, start_at: at(-60) }, { expected_version: ver(wo.work_order_id) }));
  ok(kt.write('maintenance.execute', { work_order_id: wo.work_order_id, end_at: at(-5), overall_result: 'FAIL', results: res.map((r, i) => (i === 0 ? { result_id: r.result_id, result_status: 'FAIL', note_vi: 'Dầu bẩn' } : { result_id: r.result_id, measured_value: 7, result_status: 'PASS' })) }, { expected_version: ver(wo.work_order_id) }));
  ok(kt.write('maintenance.submit', { work_order_id: wo.work_order_id, repair_severity: 'MEDIUM' }, { expected_version: ver(wo.work_order_id) }));
  // Sửa chữa
  const rp = uuid();
  ok(kt.write('repair.report', { repair_id: rp, equipment_id: eqDb, symptom_vi: 'Aptomat tổng nhảy', severity: 'HIGH', machine_stopped: true, stopped_at: at(-120) }));
  // Vật tư, hợp đồng, chứng nhận kiểm định
  const matId = uuid();
  ok(c.write('material.create', { material_id: matId, name_vi: 'Lọc dầu máy nén', base_unit: 'cái', part_linkable: true }));
  const coId = uuid();
  ok(c.write('contract.create', { contract_id: coId, title_vi: 'Bảo trì máy nén MẪU', start_date: '2026-01-01', end_date: dayVN(-20) }));
  const req0 = env.rows('InspectionRequirements')[0];
  const insId = uuid();
  ok(c.write('inspection.submit', { inspection_id: insId, requirement_id: req0.requirement_id, inspection_date: dayVN(30), valid_from: dayVN(30), valid_to: dayVN(-335), result: 'PASS', certificate_number: 'CN-01' }));
  ok(c3.write('inspection.approve', { inspection_id: insId, decision: 'APPROVE' }, { expected_version: 1, reauth_token: c3.reauth() }));
  env.g.dbReset_();
  const mat = env.rows('Materials')[0];
  // Báo cáo đã lưu
  const rrId = uuid();
  const rr = c.write('report.save', { report_run_id: rrId, code: 'RPT_EQUIPMENT', filters: {} });
  if (!rr.ok) console.log('report.save', JSON.stringify(rr).slice(0, 300));
  env.g.dbReset_();
  const ids = {
    equipment: eqM, material: mat && mat.material_id, inspection: (env.rows('InspectionRequirements')[0] || {}).requirement_id,
    record: (env.rows('Inspections')[0] || {}).inspection_id, contract: (env.rows('Contracts')[0] || {}).contract_id,
    plan, wo: wo.work_order_id, checklist: tpl, repair: rp, meter: elec, panel: DB, circuit: c5, tariff: tf,
    reportRun: rrId,
    reportDef: (env.rows('ReportDefinitions')[0] || {}).report_definition_id, qrKey: (env.rows('QrRegistry').find((q) => q.entity_id === eqM) || {}).qr_key
  };
  return { env, ids };
}

function routes(ids) {
  return ['/', '/work', '/maintenance', '/maintenance?tab=plans', '/maintenance?tab=cal', '/maintenance?tab=year', '/maintenance/plans/new', '/maintenance/plans/group',
    `/maintenance/plans/${ids.plan}`, `/maintenance/plans/${ids.plan}/edit`, '/maintenance/checklists', '/maintenance/checklists/new', `/maintenance/checklists/${ids.checklist}`,
    '/maintenance/wo/new', `/maintenance/wo/${ids.wo}`, '/repairs', '/repairs/new', `/repairs/${ids.repair}`, `/repairs/${ids.repair}/edit`,
    '/utilities', '/utilities/meters', '/utilities/meters/new', `/utilities/meters/${ids.meter}`, `/utilities/meters/${ids.meter}/edit`, `/utilities/meters/${ids.meter}/event`,
    `/utilities/read/${ids.meter}`, '/utilities/tariffs', '/utilities/loss', '/utilities/tariffs/new', `/utilities/tariffs/${ids.tariff}`,
    '/circuits', '/circuits/trace', '/circuits/p/new', `/circuits/p/${ids.panel}`, `/circuits/p/${ids.panel}/edit`, '/circuits/c/new', `/circuits/c/${ids.circuit}`, `/circuits/c/${ids.circuit}/edit`,
    '/reports', '/reports/run/RPT_UTILITIES', '/reports/run/RPT_EQUIPMENT', '/reports/run/RPT_REPAIRS', '/reports/run/RPT_MAINTENANCE', '/reports/run/RPT_INSPECTIONS', '/reports/run/RPT_CONTRACTS',
    '/reports/run/RPT_MATERIALS', '/reports/run/RPT_CIRCUITS', '/reports/run/RPT_CONTRACT_SERVICES', `/reports/saved/${ids.reportRun}`, '/reports/templates', `/reports/templates/${ids.reportDef}`,
    '/alerts', '/alerts/month', '/account', '/account/drafts',
    '/equipment', '/equipment/new', `/equipment/${ids.equipment}`, `/equipment/${ids.equipment}/edit`, '/materials', '/materials/new', `/materials/${ids.material}`, `/materials/${ids.material}/edit`,
    '/inspections', '/inspections/types', '/inspections/new', `/inspections/record/${ids.record}`, `/inspections/${ids.inspection}`, `/inspections/${ids.inspection}/edit`, `/inspections/${ids.inspection}/submit`,
    '/contracts', '/contracts/new', `/contracts/${ids.contract}`, `/contracts/${ids.contract}/edit`, `/contracts/${ids.contract}/renew`,
    '/admin/gmail', '/admin/users', '/admin/permissions', '/admin/backup', '/admin/audit', '/admin/status', '/admin/report-logo', '/admin/archive', '/admin/form-codes', '/admin/iso-map',
    '/admin/backgrounds', '/admin/catalog', '/admin/catalog?tab=glossary', '/admin/system-data', '/admin/system-data/reset', `/qr/EQUIPMENT/${ids.equipment}`, '/print', '/excel/equipment', '/excel/meters', '/excel/maintenance_plans',
    `/r/${ids.qrKey}`];
}

const LABEL_KEYS = new Set(Object.keys(JSON.parse(fs.readFileSync(ROOT + 'i18n/labels.json', 'utf8'))));
const findings = [];
const add = (o) => { findings.push(o); };

async function crawl(env, ids, who, pin, device) {
  // iphone 390, se = iPhone SE 320 px, tab = máy tính bảng chạm 1024 px, tabweb = máy tính nhỏ 1024 px (chuột), web 1440
  const DEVS = { web: [1440, 900, false], iphone: [390, 844, true], se: [320, 568, true], tab: [1024, 768, true], tabweb: [1024, 768, false] };
  const [vw, vh, mob] = DEVS[device] || DEVS.iphone;
  const dev = { viewport: { width: vw, height: vh }, mobile: mob };
  const app = await openApp({ env, ...dev });
  const { page } = app;
  try {
    await page.fill('#emp', who);
    await page.fill('#pin', pin);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 20000 });
    let lastErr = 0;
    for (const r of routes(ids)) {
      const tag = `${who}/${device} #${r}`;
      await page.evaluate((h) => { location.hash = '#/__x' + Math.random(); location.hash = h; }, '#' + r);
      // Màn cần PIN (Phân quyền, nhật ký đăng nhập…): nhập PIN như người dùng
      for (let k = 0; k < 6; k++) { if (await page.$('.modal .pin-input')) { await page.fill('.modal .pin-input', pin); await page.locator('.modal:has(.pin-input) .btn.primary').click(); break; } await page.waitForTimeout(150); }
      try {
        await page.waitForFunction(() => { const v = document.querySelector('.view-page:last-child'); return v && !v.querySelector('.spinner') && v.textContent.trim().length > 0; }, null, { timeout: 15000 });
      } catch (e) { add({ tag, kind: 'TIMEOUT', msg: 'spinner/empty after 15s' }); }
      await page.waitForTimeout(350);
      const info = await page.evaluate(() => {
        const v = document.querySelector('.view-page:last-child') || document.querySelector('.view');
        const text = v ? v.innerText : '';
        const w = window.innerWidth;
        const over = document.documentElement.scrollWidth > w + 1 || [...document.querySelectorAll('.view *')].some((el) => {
          if (el.closest('.table-wrap, .chips, .tabs-bar, .modal, .yr-wrap, .hl-strip')) return false;
          const rc = el.getBoundingClientRect(); return rc.width > 0 && rc.right > w + 1;
        });
        const overEl = over ? [...document.querySelectorAll('.view *')].filter((el) => { if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false; const rc = el.getBoundingClientRect(); return rc.width > 0 && rc.right > w + 1; }).slice(0, 2).map((el) => el.tagName + '.' + el.className + ':' + el.textContent.slice(0, 40)) : [];
        return { text, over, overEl, title: (document.querySelector('.hdr-title') || {}).textContent || '' };
      });
      const bad = info.text.match(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|Invalid Date|INTERNAL_ERROR/g);
      if (bad) add({ tag, kind: 'TEXT', msg: [...new Set(bad)].join(',') + ' :: ' + info.text.replace(/\s+/g, ' ').slice(Math.max(0, info.text.search(/undefined|NaN|\[object|null|Invalid Date|INTERNAL_ERROR/) - 80), info.text.search(/undefined|NaN|\[object|null|Invalid Date|INTERNAL_ERROR/) + 80) });
      const keys = (info.text.match(/\b[a-z][a-z0-9_]*\.[a-z][a-zA-Z0-9_]*(?:\.[A-Za-z0-9_]+)*\b/g) || []).filter((k) => !/\.(jpg|png|pdf|xlsx|gs|js|com|google|json|csv|vn)$/.test(k) && !/^(raw|script|docs|www|lh3)\./.test(k));
      const raw = keys.filter((k) => LABEL_KEYS.has(k) || /^(bg|hl|ut|rpt|mt|rp|yr|ap|fc|iso|arc|bal|ci|wo|adm|admin|health|sys|reset|auth|sync|account|draft|eq|mat|ins|co|tab|btn|field|col|err|qr|logo|cal|work|home|nav|module|level|subrole|status|perm_module)\./.test(k));
      if (raw.length) add({ tag, kind: 'RAW_KEY', msg: [...new Set(raw)].join(', ') });
      if (device !== 'web' && info.over) add({ tag, kind: 'OVERFLOW', msg: info.overEl.join(' | ') });
      if (/Lỗi máy chủ|Không tìm thấy|Dữ liệu chưa hợp lệ/.test(info.text)) add({ tag, kind: 'ERRBOX', msg: info.text.replace(/\s+/g, ' ').slice(0, 160) });
      const errs = app.consoleErrors.slice(lastErr);
      lastErr = app.consoleErrors.length;
      errs.forEach((e) => add({ tag, kind: 'CONSOLE', msg: e.slice(0, 300) }));
      const modal = await page.$('.modal');
      if (modal) { add({ tag, kind: 'MODAL', msg: (await modal.innerText()).slice(0, 160) }); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      if (process.env.SHOT) await page.screenshot({ path: path.join(SHOTS, `${who}-${device}-${r.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`), fullPage: true });
    }
  } catch (e) {
    add({ tag: `${who}/${device}`, kind: 'CRASH', msg: String(e).slice(0, 400) });
  } finally {
    await app.close();
  }
}

const { env, ids } = seed();
const internal = [];
const orig = env.post.bind(env);
env.post = (req) => { const r = orig(req); if (r && (r.code === 'INTERNAL_ERROR' || r.code === 'SYSTEM_NOT_READY')) internal.push({ action: req.action, msg: r.message || r.message_vi, data: JSON.stringify(r).slice(0, 300) }); return r; };
console.log('ids', JSON.stringify(ids));
const who = (process.env.WHO || `${OWNER_CODE}:${OWNER_PIN},U-C3:694127,U-KT:583017,U-DN:583016,U-C1:583019,U-HD:583020`).split(',');
for (const w of who) {
  const [code, pin] = w.split(':');
  for (const d of (process.env.DEV || 'iphone,web').split(',')) {
    const t0 = Date.now();
    await crawl(env, ids, code, pin, d);
    console.log(code, d, Math.round((Date.now() - t0) / 1000) + 's', findings.length);
  }
}
internal.forEach((x) => findings.push({ tag: 'server', kind: 'INTERNAL', msg: JSON.stringify(x) }));
fs.writeFileSync(OUT, JSON.stringify(findings, null, 1));
const by = {}; findings.forEach((f) => { by[f.kind] = (by[f.kind] || 0) + 1; });
console.log(JSON.stringify(by));
