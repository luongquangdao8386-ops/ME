// NT1-72 Tài liệu offline (phụ lục 1.5 mục 2.6): chỉ tài liệu đã bấm "Tải để xem ngoại tuyến" mới mở được khi offline;
// tài liệu bị gỡ / mất quyền thì bản lưu bị xóa ở lần đồng bộ sau; máy dùng chung không có nút lưu
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN, uuid, fakePdfB64 } from '../helpers.mjs';

const WEB = { viewport: { width: 1440, height: 900 }, mobile: false };
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const offCount = (page) => page.evaluate(async () => (await (await import('./js/offline-files.js')).offlineFiles()).length);

async function login(page, shared = false) {
  await page.fill('#emp', OWNER_CODE);
  await page.fill('#pin', OWNER_PIN);
  if (shared) await page.check('#shared');
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}

function setup() {
  const env = freshServer();
  const c = ownerClient(env);
  const eq = uuid();
  assert.equal(c.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén MẪU' }).ok, true);
  const d1 = uuid(), d2 = uuid();
  for (const [id, t] of [[d1, 'Sổ tay vận hành'], [d2, 'Bản vẽ điện']]) {
    const r = c.write('doc.upload', { document_id: id, entity_type: 'EQUIPMENT', entity_id: eq, kind: 'MANUAL', mime_type: 'application/pdf', content_b64: fakePdfB64(4000), title_vi: t });
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  return { env, c, eq, d1, d2 };
}

test('web: Tải để xem ngoại tuyến → mất mạng vẫn Mở được (chỉ tài liệu đã lưu); gỡ tài liệu → bản lưu bị xóa sau đồng bộ', async () => {
  const { env, c, eq, d1, d2 } = setup();
  const app = await openApp({ env, ...WEB });
  try {
    const { page, context } = app;
    await login(page);
    await go(page, `#/equipment/${eq}?tab=documents`);
    await page.waitForSelector(`[data-offsave="${d1}"]`, { timeout: 15000 });
    await page.click(`[data-offsave="${d1}"]`);
    await page.waitForSelector(`[data-offopen="${d1}"]`, { timeout: 15000 });
    assert.match(await page.textContent(`li[data-doc="${d1}"]`), /Đã lưu để xem ngoại tuyến/);
    assert.equal(await offCount(page), 1);
    // Mất mạng: tài liệu đã lưu mở được, tài liệu chưa lưu thì nút tải bị khóa
    await context.setOffline(true);
    await go(page, '#/');
    await page.waitForSelector('.grid9');
    await go(page, `#/equipment/${eq}?tab=documents`);
    await page.waitForSelector(`[data-offopen="${d1}"]`, { timeout: 15000 });
    assert.equal(await page.locator(`[data-offsave="${d2}"][disabled]`).count(), 1, 'chưa lưu → không tải được khi offline');
    await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click(`[data-offopen="${d1}"]`)]);
    assert.match(dl.suggestedFilename(), /\.pdf$/);
    await context.setOffline(false);
    // Gỡ tài liệu trên máy chủ → lần đồng bộ sau xóa bản lưu
    const doc = env.rows('Documents').find((x) => x.document_id === d1);
    assert.equal(c.write('doc.archive', { document_id: d1 }, { expected_version: doc.record_version }).ok, true);
    await page.evaluate(async () => (await import('./js/app.js')).syncNow({ quiet: true }));
    assert.equal(await offCount(page), 0, 'tài liệu đã gỡ → bản lưu bị xóa');
    // Test không bật Service Worker nên tài nguyên tải lại lúc offline báo lỗi mạng của trình duyệt — bỏ qua loại này
    assert.deepEqual(app.consoleErrors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)), []);
  } finally { await app.close(); }
});

test('web: máy dùng chung không có nút Tải để xem ngoại tuyến', async () => {
  const { env, eq, d1 } = setup();
  const app = await openApp({ env, ...WEB });
  try {
    const { page } = app;
    await login(page, true);
    await go(page, `#/equipment/${eq}?tab=documents`);
    await page.waitForSelector(`li[data-doc="${d1}"] [data-dl]`, { timeout: 15000 });
    assert.equal(await page.locator('[data-offsave]').count(), 0);
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
