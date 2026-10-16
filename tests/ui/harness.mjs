// Chạy app tĩnh dưới /ME/ (giống GitHub Pages) + chặn request tới /exec bằng máy chủ giả lập
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { freshServer } from '../helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export const EXEC = 'https://script.google.com/macros/s/TESTONLY_fake_deployment_id_000/exec';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

/** config(site, src): nội dung config.js cho trang site ('ME' | 'ME-thu'); mặc định mọi link /exec → EXEC giả */
export function startStatic({ config = null } = {}) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      // /ME/ (THẬT) và /ME-thu/ (THỬ) phục vụ cùng một mã như hai trang GitHub Pages
      const site = /^\/(ME|ME-thu)\//.exec(u.pathname);
      if (!site) { res.writeHead(404); res.end(); return; }
      let p = decodeURIComponent(u.pathname.slice(site[0].length)) || 'index.html';
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      // config.js trỏ tới /exec thật: trong test thay bằng link giả để mọi request đi vào máy chủ giả lập
      if (p === 'config.js') {
        const src = fs.readFileSync(f, 'utf8');
        res.end(config ? config(site[1], src) : src.replace(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g, EXEC));
        return;
      }
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/ME/` }));
  });
}

/** Mở trình duyệt; mọi POST tới EXEC đi vào máy chủ giả lập `env` */
/**
 * fault(req, n): trả 'AS_GET' để giả lập POST bị chuyển thành GET trên đường đi (máy chủ chạy doGet, không chạy doPost);
 * 'EXEC_THEN_AS_GET': máy chủ đã chạy doPost nhưng phản hồi mất ở chặng chuyển hướng;
 * n là số thứ tự request của action đó (bắt đầu từ 1).
 */
export async function openApp({ env = freshServer(), viewport = { width: 390, height: 844 }, mobile = true, delays = {}, sw = false, fault = null, launchArgs = [], permissions = [] } = {}) {
  const { srv, base } = await startStatic();
  const browser = await chromium.launch({ args: launchArgs });
  const context = await browser.newContext({
    viewport, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile,
    userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : undefined,
    serviceWorkers: sw ? 'allow' : 'block', permissions
  });
  const calls = [];
  // Ảnh link-view (lh3) không ra mạng ngoài trong test: trả ảnh PNG 1×1
  await context.route('https://lh3.googleusercontent.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_1X1, 'base64') }));
  await context.route(EXEC + '**', async (route) => {
    const req = route.request();
    let body;
    if (req.method() === 'GET') {
      const u = new URL(req.url());
      body = JSON.stringify(env.get(Object.fromEntries(u.searchParams)));
    } else {
      const parsed = JSON.parse(req.postData() || '{}');
      calls.push(parsed.action);
      const n = calls.filter((a) => a === parsed.action).length;
      env.g.dbReset_();
      const f = fault ? fault(parsed, n) : null;
      if (f === 'AS_GET') body = JSON.stringify(env.get({}));
      else if (f === 'EXEC_THEN_AS_GET') { env.post(parsed); body = JSON.stringify(env.get({})); } // máy chủ đã chạy, phản hồi mất
      else body = JSON.stringify(env.post(parsed));
      if (delays[parsed.action]) await new Promise((r) => setTimeout(r, delays[parsed.action]));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body }).catch(() => {});
  });
  await context.addInitScript((exec) => { try { localStorage.setItem('me.exec_url', exec); } catch (e) { /* bỏ qua */ } }, EXEC);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(base);
  return {
    env, page, context, browser, base, calls, consoleErrors,
    async close() { await browser.close(); srv.close(); }
  };
}

export const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
