// Thu nhỏ ảnh: máy Chromium (Android, máy tính) giải mã thẳng về ≤1600 px, xoay theo EXIF đúng; iPhone giữ cách cũ, kết quả như nhau
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };

/** Trong trang: ảnh 4000×2000 (nửa trái đỏ, nửa phải xanh) + EXIF Orientation=6 → hiện dọc 2000×4000, đỏ ở trên; chạy processPhoto */
async function runPhoto(page) {
  return page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 2000;
    const x = c.getContext('2d'); x.fillStyle = '#f00'; x.fillRect(0, 0, 2000, 2000); x.fillStyle = '#00f'; x.fillRect(2000, 0, 2000, 2000);
    const jpg = new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9))).arrayBuffer());
    // APP1 Exif: TIFF II, IFD0 một mục 0x0112 (Orientation) SHORT = 6
    const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0, 0, 0, 0x06, 0x00, 0, 0, 0, 0, 0, 0];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
    const file = new File([new Uint8Array([0xff, 0xd8, ...app1]), jpg.slice(2)], 'cam.jpg', { type: 'image/jpeg' });
    const { processPhoto } = await import('./js/media.js');
    const r = await processPhoto(file);
    const color = async (blob, w, h) => {
      const bmp = await createImageBitmap(blob); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
      const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
      const px = (a, b) => { const d = g.getImageData(a, b, 1, 1).data; return d[0] > 200 && d[2] < 60 ? 'red' : d[2] > 200 && d[0] < 60 ? 'blue' : 'other'; };
      return { w: bmp.width, h: bmp.height, top: px(Math.floor(bmp.width / 2), 3), bottom: px(Math.floor(bmp.width / 2), bmp.height - 3) };
    };
    return { how: r.how, src: [r.src_w, r.src_h], out: [r.out_w, r.out_h], main: await color(r.main), thumb: await color(r.thumb) };
  });
}

async function check(dev, how) {
  const env = freshServer();
  ownerClient(env);
  const app = await openApp({ env, ...dev });
  const { page } = app;
  try {
    await page.fill('#emp', OWNER_CODE); await page.fill('#pin', OWNER_PIN); await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 15000 });
    const r = await runPhoto(page);
    assert.equal(r.how, how);
    assert.deepEqual(r.src, [2000, 4000], 'kích thước gốc đã xoay theo EXIF');
    assert.deepEqual(r.out, [800, 1600]);
    assert.deepEqual(r.main, { w: 800, h: 1600, top: 'red', bottom: 'blue' }, 'ảnh dọc, đỏ ở trên — không méo, không xoay sai');
    assert.deepEqual(r.thumb, { w: 200, h: 400, top: 'red', bottom: 'blue' });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
}

test('Chromium (Android, máy tính): ảnh lớn có xoay EXIF → giải mã thu nhỏ thẳng về 1600 px, dọc đúng chiều, bản nhỏ 400 px', () => check(WEB, 'createImageBitmap-resize'));
test('iPhone (Safari): giữ cách giải mã cũ, kết quả giống hệt', () => check(IPHONE, 'createImageBitmap'));
