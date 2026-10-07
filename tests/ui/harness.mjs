// Chạy app tĩnh dưới /ME/ (giống GitHub Pages) + chặn request tới /exec bằng máy chủ giả lập
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { freshServer } from '../helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXEC = 'https://script.google.com/macros/s/TESTONLY_fake_deployment_id_000/exec';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export function startStatic() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (!u.pathname.startsWith('/ME/')) { res.writeHead(404); res.end(); return; }
      let p = decodeURIComponent(u.pathname.slice(4)) || 'index.html';
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/ME/` }));
  });
}

/** Mở trình duyệt; mọi POST tới EXEC đi vào máy chủ giả lập `env` */
export async function openApp({ env = freshServer(), viewport = { width: 390, height: 844 }, mobile = true, delays = {}, sw = false } = {}) {
  const { srv, base } = await startStatic();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile,
    userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : undefined,
    serviceWorkers: sw ? 'allow' : 'block'
  });
  const calls = [];
  await context.route(EXEC + '**', async (route) => {
    const req = route.request();
    let body;
    if (req.method() === 'GET') {
      const u = new URL(req.url());
      body = JSON.stringify(env.get(Object.fromEntries(u.searchParams)));
    } else {
      const parsed = JSON.parse(req.postData() || '{}');
      calls.push(parsed.action);
      env.g.dbReset_();
      body = JSON.stringify(env.post(parsed));
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
