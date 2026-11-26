// Hai người sửa cùng hồ sơ (rà soát lượt 5): với mỗi biểu mẫu sửa — mở biểu mẫu trên app, người khác lưu trước (đổi ô *_zh qua API), tôi đổi ô
// *_vi rồi bấm Lưu → phải hiện hộp "Xử lý xung đột"; bấm "Sửa tiếp trên bản máy chủ" → biểu mẫu mở lại theo bản mới, ô tôi sửa còn nguyên;
// bấm Lưu → thành công, máy chủ có cả hai thay đổi. Thêm một lượt "Dùng bản máy chủ" và một nút thao tác (không phải biểu mẫu). Cách chạy: README.md
import { openApp } from '../../tests/ui/harness.mjs';
import { makeClient, uuid, OWNER_CODE, OWNER_PIN } from '../../tests/helpers.mjs';
import { seed } from './crawl.mjs';

const { env, ids } = seed();
const c = makeClient(env);
c.login(OWNER_CODE, OWNER_PIN);
const tf2 = uuid();
const tr = c.write('tariff.edit', { tariff_id: tf2, utility_type: 'WATER', effective_from: '2027-01-01', unit_price: 15000, tax_rate: 5, name_vi: 'Giá nước 2027' });
if (!tr.ok) console.log('tariff seed', tr.code, JSON.stringify(tr.errors || []));
const CASES = [
  ['Thiết bị', `/equipment/${ids.equipment}/edit`, 'equipment.edit', 'Equipment', 'equipment_id', ids.equipment, 'name'],
  ['Vật tư', `/materials/${ids.material}/edit`, 'material.edit', 'Materials', 'material_id', ids.material, 'name'],
  ['Đồng hồ', `/utilities/meters/${ids.meter}/edit`, 'meter.edit', 'Meters', 'meter_id', ids.meter, 'name'],
  ['Biểu giá (nháp)', `/utilities/tariffs/${tf2}`, 'tariff.edit', 'UtilityTariffs', 'tariff_id', tf2, 'name'],
  ['Tủ điện', `/circuits/p/${ids.panel}/edit`, 'circuit.edit', 'Panels', 'panel_id', ids.panel, 'name', { entity: 'PANEL' }],
  ['Lộ điện', `/circuits/c/${ids.circuit}/edit`, 'circuit.edit', 'Circuits', 'circuit_id', ids.circuit, 'name', { entity: 'CIRCUIT' }],
  ['Hợp đồng', `/contracts/${ids.contract}/edit`, 'contract.edit', 'Contracts', 'contract_id', ids.contract, 'title'],
  ['Kế hoạch bảo trì', `/maintenance/plans/${ids.plan}/edit`, 'maintenance.plan.edit', 'MaintenancePlans', 'plan_id', ids.plan, 'title'],
];
// Biểu mẫu không có ô *_vi: [tên, route, action, sheet, khóa, id, ô trên app (selector), giá trị tôi, payload người khác, kiểm máy chủ]
const OTHER = [
  ['Yêu cầu kiểm định', `/inspections/${ids.inspection}/edit`, 'inspection.requirement.edit', 'InspectionRequirements', 'requirement_id', ids.inspection,
    '#f-obligation_status', 'VOLUNTARY', { owner_user_id: env.rows('Users').find((u) => u.employee_code === 'U-C3').user_id }, (r) => r.obligation_status === 'VOLUNTARY' && !!r.owner_user_id],
  ['Phiếu báo sự cố', `/repairs/${ids.repair}/edit`, 'repair.editReport', 'Repairs', 'repair_id', ids.repair,
    '#f-symptom', 'Tôi sửa triệu chứng', { severity: 'LOW' }, (r) => /Tôi sửa triệu chứng/.test(r.symptom_vi + r.symptom_zh) && r.severity === 'LOW']
];
const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
const { page } = app;
let bad = 0;
const row = (sheet, key, id) => { env.g.dbReset_(); return env.g.readRows_(sheet).find((x) => x[key] === id); };
const go = async (h) => { await page.evaluate((x) => { location.hash = '#/__x' + Math.random(); location.hash = x; }, h); };
try {
  await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 30000 });
  for (const [title, route, action, sheet, key, id, f, extra] of CASES) {
    const res = [];
    try {
      await go('#' + route);
      await page.waitForSelector(`.view-page:last-child form [name="${f}_vi"]`, { timeout: 10000 });
      const before = row(sheet, key, id);
      const o = c.write(action, { [key]: id, ...(extra || {}), [f + '_zh']: '他人修改' + title.length }, { expected_version: before.record_version });
      if (!o.ok) { res.push('người khác lưu lỗi ' + o.code + ' ' + JSON.stringify(o.errors || []).slice(0, 160)); throw new Error('skip'); }
      const mine = 'Tôi sửa ' + title;
      await page.fill(`.view-page:last-child form [name="${f}_vi"]`, mine);
      const save = page.locator('.view-page:last-child form button[type="submit"], .view-page:last-child #fm-save').first();
      await save.click();
      try { await page.waitForSelector('.modal .tbl.conflict', { timeout: 8000 }); } catch (e) { res.push('KHÔNG có hộp xung đột · ' + (await page.textContent('#toast')).replace(/\s+/g, ' ').slice(0, 100)); throw new Error('skip'); }
      await page.locator('.modal .btn.primary').click();
      await page.waitForFunction((x) => { const el = document.querySelector(`.view-page:last-child form [name="${x[0]}_vi"]`); return el && el.value === x[1]; }, [f, mine], { timeout: 8000 }).catch(() => res.push('ô tôi sửa KHÔNG còn'));
      await page.waitForTimeout(300);
      await page.locator('.view-page:last-child form button[type="submit"], .view-page:last-child #fm-save').first().click();
      await page.waitForTimeout(1500);
      if (await page.$('.modal')) res.push('vẫn còn hộp: ' + (await page.textContent('.modal')).replace(/\s+/g, ' ').slice(0, 120));
      const after = row(sheet, key, id);
      if (after[f + '_vi'] !== mine) res.push(`máy chủ ${f}_vi="${after[f + '_vi']}"`);
      if (after[f + '_zh'] !== '他人修改' + title.length) res.push(`(${f}_zh của người kia thành "${after[f + '_zh']}")`);
    } catch (e) { if (e.message !== 'skip') res.push('LỖI ' + String(e.message).slice(0, 160)); }
    const fail = res.some((x) => !x.startsWith('('));
    if (fail) bad++;
    console.log((fail ? 'LỖI ' : 'ĐẠT ') + title.padEnd(20), res.join(' · '));
    for (let k = 0; k < 3 && await page.$('.modal'); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  }
  for (const [title, route, action, sheet, key, id, sel, mine, other, check] of OTHER) {
    const res = [];
    try {
      await go('#' + route);
      await page.waitForSelector('.view-page:last-child ' + sel, { timeout: 10000 });
      const before = row(sheet, key, id);
      const o = c.write(action, { [key]: id, ...other }, { expected_version: before.record_version });
      if (!o.ok) { res.push('người khác lưu lỗi ' + o.code + ' ' + JSON.stringify(o.errors || []).slice(0, 160)); throw new Error('skip'); }
      const el = page.locator('.view-page:last-child ' + sel);
      if (await el.evaluate((x) => x.tagName) === 'SELECT') await el.selectOption(mine); else await el.fill(mine);
      await page.locator('.view-page:last-child form button[type="submit"], .view-page:last-child #fm-save').first().click();
      try { await page.waitForSelector('.modal .tbl.conflict', { timeout: 8000 }); } catch (e) { res.push('KHÔNG có hộp xung đột · ' + (await page.textContent('#toast')).replace(/\s+/g, ' ').slice(0, 100)); throw new Error('skip'); }
      await page.locator('.modal .btn.primary').click();
      await page.waitForTimeout(1500);
      if (await page.inputValue('.view-page:last-child ' + sel) !== mine) res.push('ô tôi sửa KHÔNG còn');
      await page.locator('.view-page:last-child form button[type="submit"], .view-page:last-child #fm-save').first().click();
      await page.waitForTimeout(1500);
      if (await page.$('.modal')) res.push('vẫn còn hộp: ' + (await page.textContent('.modal')).replace(/\s+/g, ' ').slice(0, 120));
      if (!check(row(sheet, key, id))) res.push('máy chủ thiếu thay đổi: ' + JSON.stringify(row(sheet, key, id)).slice(0, 200));
    } catch (e) { if (e.message !== 'skip') res.push('LỖI ' + String(e.message).slice(0, 160)); }
    if (res.length) bad++;
    console.log((res.length ? 'LỖI ' : 'ĐẠT ') + title.padEnd(20), res.join(' · '));
    for (let k = 0; k < 3 && await page.$('.modal'); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  }
  // Dùng bản máy chủ: bỏ phần tôi sửa, biểu mẫu mở lại theo bản mới
  {
    await go(`#/utilities/meters/${ids.meter}/edit`);
    await page.waitForSelector('.view-page:last-child form [name="name_vi"]');
    const b = row('Meters', 'meter_id', ids.meter);
    c.write('meter.edit', { meter_id: ids.meter, name_vi: 'Bản người khác' }, { expected_version: b.record_version });
    await page.fill('.view-page:last-child form [name="name_vi"]', 'Bản của tôi');
    await page.click('.view-page:last-child #fm-save');
    await page.waitForSelector('.modal .tbl.conflict', { timeout: 8000 });
    await page.locator('.modal .btn', { hasText: 'Dùng bản máy chủ' }).click();
    await page.waitForTimeout(1200);
    const v = await page.inputValue('.view-page:last-child form [name="name_vi"]').catch(() => '(không có ô)');
    const ok = v === 'Bản người khác' && row('Meters', 'meter_id', ids.meter).name_vi === 'Bản người khác';
    if (!ok) bad++;
    console.log((ok ? 'ĐẠT ' : 'LỖI ') + 'Dùng bản máy chủ'.padEnd(20), 'ô =', v);
  }
  // Nút thao tác: phiếu bảo trì chờ nghiệm thu — người khác vừa đổi phiếu, tôi bấm Nghiệm thu
  {
    await go(`#/maintenance/wo/${ids.wo}`);
    await page.waitForTimeout(1200);
    const w = row('WorkOrders', 'work_order_id', ids.wo);
    const rt = c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
    const o = c.write('maintenance.accept', { work_order_id: ids.wo, decision: 'RETURN', reason: 'Người khác trả lại' }, { expected_version: w.record_version, reauth_token: rt });
    const btn = page.locator('.view-page:last-child button', { hasText: /Nghiệm thu đạt/ }).first();
    if (await btn.count()) {
      await btn.click();
      for (let k = 0; k < 4; k++) {
        await page.waitForTimeout(400);
        if (await page.$('.modal .pin-input')) { await page.fill('.modal .pin-input', OWNER_PIN); await page.locator('.modal:has(.pin-input) .btn.primary').click(); continue; }
        const p = await page.$('.modal .btn.primary'); if (p) await p.click(); else break;
      }
      await page.waitForTimeout(1500);
      const t = (await page.textContent('#toast')).replace(/\s+/g, ' ');
      console.log('Nút thao tác (người khác sửa trước, ' + o.code + '):', t.slice(0, 140), '· phiếu', row('WorkOrders', 'work_order_id', ids.wo).status);
    } else console.log('(không thấy nút Nghiệm thu)', o.code);
  }
  console.log('lỗi', bad, '| lỗi console', JSON.stringify(app.consoleErrors).slice(0, 300));
} finally {
  await app.close();
}
