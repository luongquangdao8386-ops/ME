// Rà soát d4.42: báo cáo 2 102 dòng — màn hiện 500 dòng đầu kèm ghi chú; tệp Excel 2 000 dòng đầu và GHI RÕ đã cắt (trước không ghi);
// PDF báo "Quá 500 dòng"; báo cáo 0 dòng hiện tổng 0, không tràn ngang, không lỗi console
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, uuid, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';
import { XLSX_FILE } from '../vendor/xlsx-sample.mjs';

const XLSX = {};
vm.runInThisContext('(function (exports) {' + fs.readFileSync(XLSX_FILE, 'utf8') + '\n})', { filename: XLSX_FILE })(XLSX);

test('web: báo cáo Thiết bị 2 102 dòng — màn 500 dòng + ghi chú; Excel 2 000 dòng có ghi chú cắt; PDF quá 500 dòng báo rõ; báo cáo trống', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  assert.equal(c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Máy mẫu' }).ok, true);
  const g = env.g;
  g.dbReset_();
  const base = { ...g.readRows_('Equipment')[0] };
  delete base.__row;
  g.withWriteLock_(() => { g.insertRows_('Equipment', Array.from({ length: 2101 }, (_, i) => ({ ...base, equipment_id: uuid(), equipment_code: 'TB-' + String(i + 1).padStart(5, '0'), name_vi: 'Máy số ' + (i + 1) }))); g.resetBumpTable_('Equipment'); });
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  const { page } = app;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpt-'));
  try {
    await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 60000 });
    await page.evaluate(() => { location.hash = '#/reports/run/RPT_EQUIPMENT'; });
    await page.waitForSelector('.paper', { timeout: 30000 });
    assert.equal(await page.locator('.paper tbody tr').count(), 500);
    assert.match((await page.textContent('.view-page:last-child')).replace(/\s+/g, ' '), /2.102 dòng; bản này chỉ gồm 2 000 dòng đầu/);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-x="xlsx"]')]);
    const f = path.join(dir, 'r.xlsx');
    await dl.saveAs(f);
    const wb = XLSX.read(fs.readFileSync(f));
    const text = (n) => XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[n]], { header: 1 }).flat().join(' ');
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1 }).length, 2002, '2 dòng tiêu đề + 2 000 dòng');
    assert.match(text(0), /chỉ gồm 2 000 dòng đầu/, 'Tóm tắt ghi rõ đã cắt');
    assert.match(text(2), /chỉ gồm 2 000 dòng đầu/, 'Điều kiện lọc ghi rõ đã cắt');
    await page.click('[data-x="pdf"]');
    await page.waitForFunction(() => /Quá 500 dòng/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
    await page.evaluate(() => { location.hash = '#/reports/run/RPT_REPAIRS?from=2027-06-01&to=2027-06-30'; });
    await page.waitForFunction(() => /Tổng sự cố/.test((document.querySelector('.paper') || {}).textContent || ''), null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
