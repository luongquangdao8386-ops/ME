// Quét QR bằng camera (jsQR, không có BarcodeDetector như iPhone): mã nhỏ ở giữa khung hình,
// giống tem chụp trên màn hình máy tính — cần lượt quét vùng giữa ở độ phân giải gốc
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import qrcode from '../../vendor/qrcode-generator-2.0.4.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

/** Video giả cho camera Chromium: nền xám nhạt, mã QR `text` ở giữa, mỗi ô `mod` px */
function y4mWithQr(file, text, { w = 1280, h = 720, mod = 3, frames = 10 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), size = (n + 8) * mod;
  const Y = Buffer.alloc(w * h, 200);
  const x0 = (w - size) >> 1, y0 = (h - size) >> 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.floor(y / mod) - 4, c = Math.floor(x / mod) - 4;
    Y[(y0 + y) * w + x0 + x] = r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c) ? 20 : 235;
  }
  const UV = Buffer.alloc((w / 2) * (h / 2) * 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < frames; i++) parts.push(Buffer.from('FRAME\n'), Y, UV);
  fs.writeFileSync(file, Buffer.concat(parts));
}

test('iPhone: camera quét mã QR nhỏ (ô 3 px trên khung 1280×720) → mở đúng hồ sơ thiết bị', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const r = c.write('equipment.create', { equipment_id: uuid(), name_vi: 'Bơm nước MẪU' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const code = r.data.display_code, key = r.data.qr_key;
  assert.ok(code && key);
  const video = path.join(SHOTS, 'fake-camera-qr.y4m');
  y4mWithQr(video, 'https://luongquangdao8386-ops.github.io/ME/#/r/' + r.data.qr_key);
  const app = await openApp({
    env, permissions: ['camera'],
    launchArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + video]
  });
  try {
    const { page } = app;
    await page.fill('#emp', OWNER_CODE);
    await page.fill('#pin', OWNER_PIN);
    await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    await page.click('#bnav-scan');
    await page.waitForSelector('.scanner');
    await page.waitForFunction((x) => (document.querySelector('.code.big') || {}).textContent === x, code, { timeout: 20000 });
    assert.equal(await page.locator('.scanner').count(), 0, 'màn quét đã đóng');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); fs.rmSync(video, { force: true }); }
});
