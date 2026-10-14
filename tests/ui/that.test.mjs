// Chuẩn bị THẬT (6.7): THẬT ở /ME/, THỬ ở /ME-thu/ trên cùng origin github.io — một iPhone cài cả hai app.
// Bộ nhớ tách theo trang, Service Worker không xóa cache của trang kia, trang đổi máy chủ thì xóa dữ liệu máy chủ cũ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStatic, SHOTS } from './harness.mjs';
import { freshServer, ownerClient, OWNER_CODE, OWNER_PIN } from '../helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXEC_THAT = 'https://script.google.com/macros/s/TESTONLY_that_deployment_00000000/exec';
const EXEC_THU = 'https://script.google.com/macros/s/TESTONLY_thu_deployment_000000000/exec';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Chạy config.js thật với một đường dẫn trang → ME_CONFIG */
function configFor(pathname) {
  const ctx = { location: { pathname }, window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), ctx);
  return ctx.window.ME_CONFIG;
}

test('config.js: chọn máy chủ theo thư mục trang; đúng 4 khóa; trang lạ để trống (nhập link tạm)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const me = configFor('/ME/');
  const thu = configFor('/ME-thu/index.html');
  const other = configFor('/khac/');
  for (const c of [me, thu, other]) {
    assert.deepEqual(Object.keys(c), ['APP_BASE_URL', 'EXEC_URL', 'API_CONTRACT_VERSION', 'BUILD_VERSION']);
    assert.equal(c.BUILD_VERSION, pkg.version);
  }
  assert.equal(me.APP_BASE_URL, 'https://luongquangdao8386-ops.github.io/ME/');
  assert.equal(thu.APP_BASE_URL, 'https://luongquangdao8386-ops.github.io/ME-thu/');
  assert.match(me.EXEC_URL, /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/);
  assert.match(thu.EXEC_URL, /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/);
  assert.deepEqual([other.APP_BASE_URL, other.EXEC_URL], ['', '']);
  assert.notEqual(me.EXEC_URL, thu.EXEC_URL, 'THẬT và THỬ là hai máy chủ khác nhau');
});

/** Một iPhone, hai trang; meExec() cho biết trang /ME/ đang trỏ máy chủ nào (đổi được giữa chừng) */
async function openPhone({ envs, meExec = () => EXEC_THAT, sw = true }) {
  const { srv, base } = await startStatic({
    config: (site, src) => src.replace(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g, site === 'ME' ? meExec() : EXEC_THU)
  });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA,
    serviceWorkers: sw ? 'allow' : 'block'
  });
  for (const [exec, env] of Object.entries(envs)) {
    await context.route(exec + '**', async (route) => {
      const req = route.request();
      env.g.dbReset_();
      const body = req.method() === 'GET' ? env.get(Object.fromEntries(new URL(req.url()).searchParams)) : env.post(JSON.parse(req.postData() || '{}'));
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }).catch(() => {});
    });
  }
  // Giả mất mạng lúc mở app (navigator.onLine = false) mà trang vẫn tải được khi không có Service Worker
  await context.addInitScript(() => {
    if (sessionStorage.getItem('test.offline') === '1') Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false });
  });
  const errors = [];
  const page = async (url) => {
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    return p;
  };
  return {
    base, thuBase: base.replace(/\/ME\/$/, '/ME-thu/'), context, page, errors,
    async close() { await browser.close(); srv.close(); }
  };
}

async function reloadOffline(p, on) {
  await p.evaluate((v) => { if (v) sessionStorage.setItem('test.offline', '1'); else sessionStorage.removeItem('test.offline'); }, on);
  await p.reload();
}

async function login(p) {
  await p.waitForSelector('#emp', { timeout: 15000 });
  await p.fill('#emp', OWNER_CODE);
  await p.fill('#pin', OWNER_PIN);
  await p.click('#login-btn');
  await p.waitForSelector('.grid9', { timeout: 15000 });
}

const storage = (p) => p.evaluate(async () => ({
  idb: (await indexedDB.databases()).map((d) => d.name).sort(),
  caches: (await caches.keys()).sort(),
  ls: Object.keys(localStorage).sort(),
  scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).sort(),
  title: document.title,
  appleTitle: document.querySelector('meta[name="apple-mobile-web-app-title"]').content
}));

test('một iPhone cài cả THẬT (/ME/) và THỬ (/ME-thu/): bộ nhớ, cache, phiên tách riêng; THỬ có nhãn THỬ; THẬT không có ô link máy chủ, không có Bàn thử PoC', async () => {
  const that = freshServer({ envName: 'THAT' });
  const thu = freshServer();
  ownerClient(that); ownerClient(thu);
  const n0 = [that.rows('Sessions').length, thu.rows('Sessions').length];
  const ph = await openPhone({ envs: { [EXEC_THAT]: that, [EXEC_THU]: thu } });
  try {
    const a = await ph.page(ph.base);
    await a.waitForSelector('.login-card');
    assert.equal(await a.locator('#exec-url').count(), 0, 'THẬT: không cho đổi link máy chủ ở màn đăng nhập');
    await login(a);
    assert.equal(await a.locator('.tag.env').count(), 0, 'THẬT không có nhãn THỬ');

    const b = await ph.page(ph.thuBase);
    await b.waitForSelector('.login-card');
    assert.ok(!(await a.isClosed()));
    await login(b);
    assert.match(await b.textContent('.tag.env'), /THỬ/);
    await b.evaluate(async () => { await navigator.serviceWorker.ready; });
    await a.evaluate(async () => { await navigator.serviceWorker.ready; });
    await b.waitForFunction(async () => (await caches.keys()).length >= 2, null, { timeout: 15000 });

    // Mở lại cả hai: mỗi trang vẫn đăng nhập đúng máy chủ của mình (không bên nào xóa của bên kia)
    await a.reload();
    await a.waitForSelector('.grid9', { timeout: 15000 });
    await b.reload();
    await b.waitForSelector('.grid9', { timeout: 15000 });
    assert.equal(await a.locator('.tag.env').count(), 0);
    assert.match(await b.textContent('.tag.env'), /THỬ/);

    const sa = await storage(a);
    const sb = await storage(b);
    assert.deepEqual(sa.scopes, ['/ME-thu/', '/ME/']);
    assert.ok(sa.idb.includes('me_auth') && sa.idb.includes('me_data'), sa.idb.join());
    assert.ok(sa.idb.includes('me_thu_auth') && sa.idb.includes('me_thu_data'), sa.idb.join());
    assert.equal(sa.caches.filter((k) => k.startsWith('me-shell-')).length, 1, sa.caches.join());
    assert.equal(sa.caches.filter((k) => k.startsWith('me_thu-shell-')).length, 1, sa.caches.join());
    assert.ok(sa.ls.includes('me.server') && sa.ls.includes('me_thu.server'), sa.ls.join());
    assert.equal(sa.appleTitle, 'M&E');
    assert.equal(sb.appleTitle, 'M&E THỬ', 'tên gợi ý khi thêm vào Màn hình chính');
    // Mỗi máy chủ thêm đúng một phiên (không gửi nhầm token sang máy chủ kia)
    assert.deepEqual([that.rows('Sessions').length, thu.rows('Sessions').length], [n0[0] + 1, n0[1] + 1]);

    // THẬT: Bàn thử PoC và trang tem thử không mở được (về Trang chủ); THỬ vẫn có
    await a.evaluate(() => { location.hash = '#/account'; });
    await a.waitForSelector('.view-page', { timeout: 10000 });
    await a.waitForTimeout(300);
    assert.equal(await a.locator('a[href="#/poc"]').count(), 0);
    for (const h of ['#/poc', '#/labels']) {
      await a.evaluate((x) => { location.hash = x; }, h);
      await a.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 10000 });
    }
    await b.evaluate(() => { location.hash = '#/poc'; });
    await b.waitForSelector('[data-poc="P-01"]', { timeout: 15000 });
    await a.screenshot({ path: path.join(SHOTS, 'that-home-iphone.png') });
    assert.deepEqual(ph.errors, []);
  } finally { await ph.close(); }
});

test('trang /ME/ đổi máy chủ THỬ → THẬT: xóa phiên, PIN ngoại tuyến, dữ liệu của máy chủ cũ; báo đăng nhập lại; mất mạng không mở khóa vào dữ liệu cũ', async () => {
  const that = freshServer({ envName: 'THAT' });
  const thu = freshServer();
  ownerClient(that); ownerClient(thu);
  const n0 = that.rows('Sessions').length;
  let meExec = EXEC_THU;
  const ph = await openPhone({ envs: { [EXEC_THAT]: that, [EXEC_THU]: thu }, meExec: () => meExec, sw: false });
  try {
    const p = await ph.page(ph.base);
    await login(p);
    assert.match(await p.textContent('.tag.env'), /THỬ/);
    assert.equal(await p.evaluate(() => localStorage.getItem('me.server')), EXEC_THU);

    meExec = EXEC_THAT; // bản app mới: /ME/ trỏ máy chủ THẬT
    await p.reload();
    await p.waitForSelector('.login-card', { timeout: 15000 });
    assert.match(await p.textContent('.login-card'), /chuyển sang máy chủ khác/);
    assert.equal(await p.locator('.login-card .tag.env').count(), 0);
    const left = await p.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('me_auth');
      r.onsuccess = () => {
        const t = r.result.transaction('kv').objectStore('kv').getAllKeys();
        t.onsuccess = () => resolve(t.result);
      };
    }));
    assert.deepEqual(left, [], 'không còn phiên/verifier của máy chủ cũ');
    assert.equal(await p.title(), 'M&E');
    assert.equal(await p.getAttribute('meta[name="apple-mobile-web-app-title"]', 'content'), 'M&E');

    // Mất mạng lúc này: không có PIN ngoại tuyến của máy chủ cũ để mở dữ liệu cũ
    await reloadOffline(p, true);
    await p.waitForSelector('.login-card', { timeout: 15000 });
    assert.equal(await p.locator('#upin').count(), 0);
    await reloadOffline(p, false);
    await login(p);
    assert.equal(await p.locator('.tag.env').count(), 0);
    assert.equal(await p.evaluate(() => localStorage.getItem('me.server')), EXEC_THAT);
    assert.equal(that.rows('Sessions').length, n0 + 1);
    assert.deepEqual(ph.errors, []);
  } finally { await ph.close(); }
});

test('máy từ bản trước (chưa ghi dấu gắn máy chủ) khi /ME/ sang THẬT: mất mạng không mở khóa vào dữ liệu THỬ; có mạng thì đăng nhập lại, dữ liệu THỬ bị xóa; cùng máy chủ thì tự gắn', async () => {
  const that = freshServer({ envName: 'THAT' });
  const thu = freshServer();
  ownerClient(that); ownerClient(thu);
  let meExec = EXEC_THU;
  const ph = await openPhone({ envs: { [EXEC_THAT]: that, [EXEC_THU]: thu }, meExec: () => meExec, sw: false });
  try {
    const p = await ph.page(ph.base);
    await login(p);
    // Đối chứng: đã gắn, cùng máy chủ, mất mạng → mở khóa bằng PIN được
    await reloadOffline(p, true);
    await p.waitForSelector('#upin', { timeout: 15000 });
    await reloadOffline(p, false);
    await p.waitForSelector('.grid9', { timeout: 15000 });
    // Bản d1.20 không có dấu gắn: mở lại khi còn cùng máy chủ → máy chủ nhận phiên → tự gắn
    await p.evaluate(() => localStorage.removeItem('me.server'));
    await p.reload();
    await p.waitForSelector('.grid9', { timeout: 15000 });
    assert.equal(await p.evaluate(() => localStorage.getItem('me.server')), EXEC_THU);

    await p.evaluate(() => localStorage.removeItem('me.server'));
    meExec = EXEC_THAT;
    await reloadOffline(p, true);
    await p.waitForSelector('.login-card', { timeout: 15000 });
    assert.equal(await p.locator('#upin').count(), 0, 'không mở khóa ngoại tuyến khi chưa biết dữ liệu thuộc máy chủ nào');
    await reloadOffline(p, false);
    await p.waitForSelector('.login-card', { timeout: 15000 }); // phiên THỬ bị máy chủ THẬT từ chối
    await login(p);
    assert.equal(await p.locator('.tag.env').count(), 0);
    const recs = await p.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('me_data');
      r.onsuccess = () => { const t = r.result.transaction('records').objectStore('records').get('EQUIPMENT'); t.onsuccess = () => resolve((t.result || []).length); };
    }));
    assert.equal(recs, 0, 'không còn thiết bị của THỬ');
    assert.equal(await p.evaluate(() => localStorage.getItem('me.server')), EXEC_THAT);
    assert.deepEqual(ph.errors, []);
  } finally { await ph.close(); }
});
