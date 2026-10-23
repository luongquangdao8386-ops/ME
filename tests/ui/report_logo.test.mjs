// d4.11: logo công ty trên báo cáo — Quản trị → Logo trên báo cáo (C4, PIN), bản xem trước báo cáo theo bố cục PDF
// (logo, tiêu đề hai dòng, ô tóm tắt, cột #, khối ký), Excel báo cáo có ảnh ở trang Tóm tắt; 390×844 và 1440×900
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };

/** PNG thật (RGB một màu) để trình duyệt giải mã được */
function png(w, h, rgb = [0, 84, 167]) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(x < w / 3 ? rgb : [255, 210, 77], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const noOverflow = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;
  const w = window.innerWidth;
  return ![...document.querySelectorAll('.view *')].some((el) => {
    if (el.closest('.table-wrap, .chips, .tabs-bar, .modal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1;
  });
});
async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
async function pin(page, p = OWNER_PIN) {
  await page.waitForSelector('.modal .pin-input');
  await page.fill('.modal .pin-input', p);
  await page.locator('.modal-actions .btn.primary').last().click();
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  for (const [name, model] of [['Máy nén khí 01', 'GA-37'], ['Bơm nước 02', 'CR-10']]) ok(c.write('equipment.create', { equipment_id: uuid(), name_vi: name, model }));
  userClient(env, 'U-C3', 3, '694127');
  return { env, c };
}

function loadXlsxNode() {
  const ctx = {}; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve('vendor/xlsx-0.20.3.full.min.js'), 'utf8'), ctx);
  return ctx.XLSX;
}

test('web C4: Quản trị → Logo trên báo cáo: chưa có → tải ảnh lớn (thu nhỏ còn ≤ 800 px) → xem mẫu đầu trang → PIN → lưu; bản xem trước báo cáo có logo; Excel có ảnh ở trang Tóm tắt; gỡ logo', async () => {
  const { env } = setup();
  const app = await openApp({ env, ...WEB });
  const { page } = app;
  const dir = path.join(SHOTS, 'tmp-logo');
  fs.mkdirSync(dir, { recursive: true });
  const big = path.join(dir, 'logo-big.png');
  fs.writeFileSync(big, png(1600, 1200));
  try {
    await login(page);
    await go(page, '#/account');
    await page.waitForSelector('a[href="#/admin/report-logo"]');
    await go(page, '#/admin/report-logo');
    await page.waitForSelector('#lg-none');
    assert.ok((await page.textContent('.view')).includes('Chưa có logo'));
    await page.setInputFiles('#lg-file', big);
    await page.waitForSelector('.modal .logo-page img.paper-logo');
    await page.screenshot({ path: path.join(SHOTS, 'd411-web-logo-dialog.png') });
    await page.locator('.modal-actions .btn.primary').last().click();
    await pin(page);
    await page.waitForSelector('#lg-cur', { timeout: 15000 });
    // Máy chủ nhận ảnh đã thu nhỏ: cạnh dài 800 px
    const id = env.rows('Settings').find((s) => s.setting_key === 'report_logo_file_id').value;
    const f = env.drive._files.get(id);
    assert.equal(f.mime, 'image/png');
    assert.equal(f.bytes.readUInt32BE(16), 800);
    assert.equal(f.bytes.readUInt32BE(20), 600);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd411-web-logo-admin.png'), fullPage: true });

    // Bản xem trước báo cáo: logo, tiêu đề hai dòng, ô tóm tắt, cột #, khối ký có tên người lập
    await go(page, '#/reports');
    await page.waitForSelector('.rp-web');
    await page.click('[data-view="RPT_EQUIPMENT"]');
    await page.waitForSelector('#rp-paper .paper .paper-logo', { timeout: 15000 });
    const h = await page.locator('#rp-paper .paper-logo').evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(Math.abs(h - 56) < 1, 'logo cao 56 px như đầu trang PDF');
    assert.equal(await page.textContent('#rp-paper .paper-title .vi'), 'Hồ sơ và linh kiện thiết bị');
    assert.equal(await page.textContent('#rp-paper .paper-title .zh'), '设备档案与配件');
    assert.ok(await page.locator('#rp-paper .paper-tile').count() >= 1);
    assert.equal(await page.textContent('#rp-paper .paper-tbl thead th:first-child'), '#');
    assert.ok((await page.textContent('#rp-paper .paper-sign')).includes('Ký, ghi rõ họ tên'));
    await page.waitForTimeout(800);
    await page.waitForSelector('#rp-paper .paper .paper-logo', { timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS, 'd411-web-report-preview.png'), fullPage: true });

    // Excel: ảnh neo trang Tóm tắt (sheet 1)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rp-acts [data-x="xlsx"]')]);
    const file = path.join(dir, 'rpt.xlsx');
    await dl.saveAs(file);
    const X = loadXlsxNode();
    const zip = X.CFB.read(new Uint8Array(fs.readFileSync(file)), { type: 'array' });
    const txt = (p) => Buffer.from(X.CFB.find(zip, '/' + p).content).toString('utf8');
    assert.ok(X.CFB.find(zip, '/xl/media/me_logo.png'), 'có tệp ảnh');
    assert.ok(txt('xl/worksheets/sheet1.xml').includes('<drawing r:id="rIdMeLogo1"/>'));
    assert.ok(txt('xl/worksheets/_rels/sheet1.xml.rels').includes('../drawings/drawing_me1.xml'));
    assert.ok(txt('[Content_Types].xml').includes('/xl/drawings/drawing_me1.xml'));
    const wb = X.read(fs.readFileSync(file), { type: 'buffer' });
    const sum = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: true });
    assert.ok(String(sum[4][0]).startsWith('Hồ sơ và linh kiện thiết bị'), 'chừa 4 dòng cho logo, tiêu đề ở dòng 5');

    // Gỡ logo → xem trước không còn ảnh
    await go(page, '#/admin/report-logo');
    await page.waitForSelector('#lg-remove');
    await page.click('#lg-remove');
    await page.locator('.modal-actions .btn.danger').last().click();
    await page.waitForSelector('#lg-none', { timeout: 15000 });
    assert.equal(env.rows('Settings').find((s) => s.setting_key === 'report_logo_rev').value, '');
    await go(page, '#/reports');
    await page.waitForSelector('.rp-web');
    await page.click('[data-view="RPT_EQUIPMENT"]');
    await page.waitForSelector('#rp-paper .paper', { timeout: 15000 });
    assert.equal(await page.locator('#rp-paper img').count(), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('iPhone: báo cáo có logo công ty (máy khác đã tải lên) — xem trước hiện logo, không tràn ngang; C3 không có mục Logo trên báo cáo', async () => {
  const { env, c } = setup();
  ok(c.write('report.logo.set', { content_b64: png(400, 300).toString('base64'), mime_type: 'image/png' }, { reauth_token: c.reauth() }));
  const app = await openApp({ env, ...IPHONE });
  const { page } = app;
  try {
    await login(page);
    await go(page, '#/reports/run/RPT_EQUIPMENT');
    await page.waitForSelector('.paper .paper-logo', { timeout: 15000 });
    assert.ok(await page.locator('.paper .paper-tile').count() >= 1);
    assert.ok(await noOverflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'd411-iphone-report-preview.png'), fullPage: true });
    // Logo lấy một lần rồi giữ trên máy: mở lại báo cáo không gọi report.logo.get nữa
    const n = app.calls.filter((a) => a === 'report.logo.get').length;
    assert.equal(n, 1);
    await go(page, '#/reports');
    await page.waitForTimeout(300);
    await go(page, '#/reports/run/RPT_EQUIPMENT');
    await page.waitForSelector('.paper .paper-logo', { timeout: 15000 });
    assert.equal(app.calls.filter((a) => a === 'report.logo.get').length, 1);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
  const app2 = await openApp({ env, ...IPHONE });
  try {
    await login(app2.page, 'U-C3', '694127');
    await go(app2.page, '#/account');
    await app2.page.waitForSelector('#ac-logout');
    assert.equal(await app2.page.locator('a[href="#/admin/report-logo"]').count(), 0);
  } finally { await app2.close(); }
});
