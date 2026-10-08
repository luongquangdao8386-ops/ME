// Nhắc hạn: tiếp nhận cảnh báo (alert.acknowledge), quản trị Gmail (người nhận, xác nhận, giờ gửi, gửi lại) — 4.4.15, 6.5.3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openApp, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, userClient, OWNER_CODE, OWNER_PIN, uuid } from '../helpers.mjs';

async function login(page, code = OWNER_CODE, pin = OWNER_PIN) {
  await page.fill('#emp', code);
  await page.fill('#pin', pin);
  await page.click('#login-btn');
  await page.waitForSelector('.grid9', { timeout: 15000 });
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
/** Ngày theo giờ Việt Nam, cộng n ngày */
function vnDate(n = 0) {
  const d = new Date(Date.now() + 7 * 3600000 + n * 86400000);
  return d.toISOString().slice(0, 10);
}

test('iPhone HĐ: Nhắc hạn có nút Tiếp nhận; bấm → Đã tiếp nhận, máy chủ ghi ACKNOWLEDGED, hạn không đổi', async () => {
  const env = freshServer();
  ownerClient(env);
  const hd = userClient(env, 'U-HD', 2, '583019', 'HD_KD');
  const id = uuid();
  const end = vnDate(20);
  assert.equal(hd.write('contract.create', { contract_id: id, title_vi: 'Bảo trì thang máy', start_date: vnDate(-300), end_date: end }).ok, true);
  assert.equal(env.rows('Alerts').length, 1);
  const app = await openApp({ env });
  try {
    const { page } = app;
    await login(page, 'U-HD', '583019');
    await go(page, '#/alerts');
    await page.waitForSelector('[data-ack]', { timeout: 15000 });
    await page.click('[data-ack]');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đã tiếp nhận · 已受理'), null, { timeout: 15000 });
    assert.equal(await page.locator('[data-ack]').count(), 0);
    const a = env.rows('Alerts')[0];
    assert.equal(a.alert_state, 'ACKNOWLEDGED');
    assert.equal(env.rows('Contracts')[0].end_date, end);
    await page.screenshot({ path: path.join(SHOTS, 'alerts-ack-iphone.png') });
    // Bấm thẻ vẫn mở hồ sơ
    await page.click('.rec-card');
    await page.waitForSelector('.code.big');
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('web C4: Gmail — thêm người nhận chưa xác nhận, xác nhận có PIN, bật gửi, đổi giờ; nhật ký UNKNOWN có nút Gửi lại', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  // Dòng nhật ký UNKNOWN có sẵn (máy chủ dừng khi đang gửi)
  const rid = uuid();
  assert.equal(c.write('notify.recipient.edit', { recipient_id: rid, email: 'baotri@example.test', confirm: true }, { reauth_token: reauth() }).ok, true);
  const nid = uuid();
  env.g.dbReset_();
  env.g.withWriteLock_(() => env.g.insertRows_('NotificationLogs', [{ notification_id: nid, dedupe_key: 'x', run_date: vnDate(0), recipient_id: rid, entity_type: 'CONTRACT', entity_id: uuid(), due_revision: 'x', due_date: vnDate(5), stage: 'D7', status: 'UNKNOWN', attempt_at: '', sent_at: '', error_code: '', attempt_count: 1 }]));
  const app = await openApp({ env, viewport: { width: 1440, height: 900 }, mobile: false });
  try {
    const { page } = app;
    await login(page);
    await go(page, '#/account');
    await page.click('a[href="#/admin/gmail"]');
    await page.waitForSelector('#g-add', { timeout: 15000 });
    assert.ok((await page.textContent('.view')).includes('Đang tắt · 已关闭'));
    // Thêm người nhận, không xác nhận
    await page.click('#g-add');
    await page.fill('.modal #f-email', 'KyThuat@Example.test');
    await page.selectOption('.modal #f-entity_scope', 'INSPECTION');
    await page.uncheck('.modal #f-confirm');
    await page.click('.modal [data-x="save"]');
    await page.waitForSelector('.modal .pin-input');
    await page.fill('.modal .pin-input', OWNER_PIN);
    await page.locator('.modal-actions .btn.primary').last().click();
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('kythuat@example.test'), null, { timeout: 15000 });
    const r = env.rows('NotificationRecipients').find((x) => x.email === 'kythuat@example.test');
    assert.equal(r.entity_scope, 'INSPECTION');
    assert.equal(r.confirmed_at, '');
    assert.ok((await page.textContent('.view')).includes('Chưa xác nhận — chưa gửi'));
    // Bật gửi (PIN còn hiệu lực trong phiên hỏi lại)
    await page.click('#g-toggle');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('Đang bật · 已启用'), null, { timeout: 15000 });
    env.g.dbReset_();
    assert.equal(env.g.setting_('gmail_enabled'), true);
    await page.selectOption('#g-hour', '8');
    await page.waitForFunction(() => document.querySelector('#g-hour') && document.querySelector('#g-hour').value === '8' && !document.querySelector('.spinner'), null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('08:00'), null, { timeout: 15000 });
    // Gửi lại dòng UNKNOWN
    await page.click(`[data-resend="${nid}"]`);
    await page.click('.modal-actions .btn.primary');
    await page.waitForFunction(() => !document.querySelector('[data-resend]'), null, { timeout: 15000 });
    assert.equal(env.rows('NotificationLogs').find((x) => x.notification_id === nid).status, 'SENT');
    assert.equal(env.mail.sent.length, 1);
    await page.screenshot({ path: path.join(SHOTS, 'gmail-web.png'), fullPage: true });
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});

test('iPhone C3: Gmail chỉ xem, email che, không có nút sửa', async () => {
  const env = freshServer();
  const c = ownerClient(env);
  const reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  assert.equal(c.write('notify.recipient.edit', { recipient_id: uuid(), email: 'baotri@example.test', confirm: true }, { reauth_token: reauth() }).ok, true);
  userClient(env, 'U-C3', 3, '694127');
  const app = await openApp({ env });
  try {
    const { page } = app;
    await login(page, 'U-C3', '694127');
    await go(page, '#/admin/gmail');
    await page.waitForFunction(() => document.querySelector('.view').textContent.includes('b***@example.test'), null, { timeout: 15000 });
    assert.equal(await page.locator('#g-add, [data-edit], #g-toggle').count(), 0);
    assert.ok(!(await page.textContent('.view')).includes('baotri@'));
    assert.deepEqual(app.consoleErrors, []);
  } finally { await app.close(); }
});
