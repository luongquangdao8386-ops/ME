// Quyền trên giao diện (rà soát lượt 5): mỗi vai trò mở mọi màn (dữ liệu mẫu của crawl.mjs), bấm LẦN LƯỢT từng nút đang hiện trong màn —
// có hộp thoại thì bấm nút chính (nhập PIN khi được hỏi), rồi mở lại màn cho nút kế tiếp. Ghi mọi phản hồi máy chủ FORBIDDEN (nút hiện mà vai
// trò không được làm), INTERNAL_ERROR, lỗi console. Mỗi vai trò dùng dữ liệu mới (bấm làm đổi dữ liệu). Cách chạy: README.md
//   node tools/review/clickall.mjs $S/click.json   (WHO=U-KT:583017 DEV=web|iphone ROUTES=/repairs,/maintenance để thu hẹp)
import fs from 'node:fs';
import { openApp } from '../../tests/ui/harness.mjs';
import { OWNER_CODE, OWNER_PIN } from '../../tests/helpers.mjs';
import { seed, routes } from './crawl.mjs';

const OUT = process.argv[2] || '/tmp/click.json';
// Biểu mẫu Thêm/Sửa (chỉ có nút Lưu, đã rà bằng forms-offline.mjs) và màn nặng/phá dữ liệu bỏ qua
const SKIP_ROUTES = /^\/admin\/(system-data\/reset|archive|backup)|^\/print$|^\/circuits\/trace$|\/new$|\/edit$|\/new\?|^\/excel\//;
const SKIP_BTN = /ac-logout|Đăng xuất|Xóa sạch|Tải lại|Hủy|Quay lại|Đóng/;
const findings = [];

async function run(who, pin, device) {
  const { env, ids } = seed();
  let ctx = '(đăng nhập)';
  const orig = env.post.bind(env);
  env.post = (req) => {
    const r = orig(req);
    if (r && ['FORBIDDEN', 'INTERNAL_ERROR', 'FEATURE_NOT_ENABLED'].includes(r.code)) findings.push({ who, device, ctx, action: req.action, inner: req.payload && req.payload.op ? req.payload.op.action : undefined, code: r.code });
    return r;
  };
  const dev = device === 'web' ? { viewport: { width: 1440, height: 900 }, mobile: false } : { viewport: { width: 390, height: 844 }, mobile: true };
  const app = await openApp({ env, ...dev });
  const { page } = app;
  let clicks = 0, lastErr = 0;
  const settle = async () => {
    try { await page.waitForFunction(() => { const v = document.querySelector('.view-page:last-child'); return v && !v.querySelector('.spinner'); }, null, { timeout: 3000 }); } catch (e) { /* */ }
    await page.waitForTimeout(150);
  };
  // Mở màn: phản hồi lỗi lúc tải màn ghi "(mở màn)" — màn Quản trị mở thẳng bằng đường dẫn với vai trò thấp báo FORBIDDEN là đúng
  const go = async (r) => { ctx = r + ' (mở màn)'; await page.evaluate((h) => { location.hash = '#/__x' + Math.random(); location.hash = h; }, '#' + r); await settle(); };
  const handleModals = async () => {
    for (let k = 0; k < 4; k++) {
      await page.waitForTimeout(300);
      const pinIn = await page.$('.modal .pin-input');
      if (pinIn) { await pinIn.fill(pin); await page.locator('.modal:has(.pin-input) .btn.primary').first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500); continue; }
      const prim = await page.$('.modal .btn.primary:not([disabled]), .modal .btn.danger:not([disabled])');
      if (!prim) break;
      await prim.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    for (let k = 0; k < 3 && await page.$('.modal'); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  };
  try {
    await page.fill('#emp', who); await page.fill('#pin', pin); await page.click('#login-btn');
    await page.waitForSelector('.grid9', { timeout: 30000 });
    const only = process.env.ROUTES ? process.env.ROUTES.split(',') : null;
    for (const r of routes(ids).filter((x) => !SKIP_ROUTES.test(x) && (!only || only.some((o) => x.startsWith(o))))) {
      await go(r);
      await handleModals(); // màn tự hỏi PIN (Phân quyền…)
      const n = await page.evaluate(() => [...document.querySelectorAll('.view-page:last-child button.btn, .view-page:last-child button.icon-btn')].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest('.chips, .tabs-bar, .seg, .filters')).length);
      if (process.env.PROGRESS) console.error(who, r, n);
      for (let i = 0; i < Math.min(n, 30); i++) {
        if (i) { await go(r); await handleModals(); }
        const label = await page.evaluate((k) => {
          const b = [...document.querySelectorAll('.view-page:last-child button.btn, .view-page:last-child button.icon-btn')].filter((x) => !x.disabled && x.offsetParent !== null && !x.closest('.chips, .tabs-bar, .seg, .filters'))[k];
          if (!b) return null;
          b.setAttribute('data-click-me', '1');
          return (b.id ? '#' + b.id + ' ' : '') + (b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50);
        }, i);
        if (!label || SKIP_BTN.test(label)) continue;
        ctx = `${r} [${label}]`;
        clicks++;
        const t1 = Date.now();
        await page.click('[data-click-me="1"]', { timeout: 1500 }).catch(() => {});
        const t2 = Date.now();
        await handleModals();
        if (process.env.DEBUG) console.log('  ', ctx.slice(0, 90), t2 - t1, Date.now() - t2);
        const errs = app.consoleErrors.slice(lastErr);
        lastErr = app.consoleErrors.length;
        errs.forEach((e) => findings.push({ who, device, ctx, code: 'CONSOLE', msg: e.slice(0, 200) }));
      }
    }
  } catch (e) {
    findings.push({ who, device, ctx, code: 'CRASH', msg: String(e).slice(0, 300) });
  } finally {
    await app.close();
  }
  return clicks;
}

const who = (process.env.WHO || `${OWNER_CODE}:${OWNER_PIN},U-C3:694127,U-KT:583017,U-DN:583016,U-C1:583019,U-HD:583020`).split(',');
for (const w of who) {
  const [code, pin] = w.split(':');
  for (const d of (process.env.DEV || 'web').split(',')) {
    const t0 = Date.now();
    const n = await run(code, pin, d);
    console.log(code, d, n, 'nút', Math.round((Date.now() - t0) / 1000) + 's', 'phát hiện', findings.length);
  }
}
fs.writeFileSync(OUT, JSON.stringify(findings, null, 1));
const by = {};
findings.forEach((f) => { const k = f.code + ' ' + (f.inner || f.action || ''); by[k] = (by[k] || 0) + 1; });
console.log(JSON.stringify(by, null, 1));
