// Service Worker của M&E — phạm vi thư mục của trang (/ME/ THẬT, /ME-thu/ THỬ); chỉ quản lý cache của chính trang này
// (me-shell-* ở /ME/, me_thu-shell-* ở /ME-thu/ — cùng quy tắc storageNs trong js/core.js), không xóa cache của trang kia.
const VERSION = '1.0.0-d4.15';
const BUILD_HASH = '8a118651ad36'; // tools/build.mjs ghi mã băm nội dung các tệp vỏ app
const NS = (() => {
  const m = /^\/([^/]+)\//.exec(self.location.pathname);
  const seg = m ? m[1].toLowerCase().replace(/[^a-z0-9]+/g, '_') : '';
  return seg.startsWith('me') ? seg : 'me';
})();
const PREFIX = NS + '-shell-';
const SHELL = PREFIX + VERSION + '-' + BUILD_HASH;
const FILES = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/core.js', 'js/dict.js', 'js/auth.js', 'js/sync.js', 'js/ui.js', 'js/poc.js', 'js/scan.js', 'js/media.js', 'js/offline-files.js', 'js/labels.js', 'js/qr-worker.js',
  'js/router.js', 'js/data.js', 'js/shell.js', 'js/app.js', 'js/form.js',
  'js/pages/home.js', 'js/pages/alerts.js', 'js/pages/account.js', 'js/pages/drafts.js', 'js/pages/misc.js', 'js/pages/equipment.js', 'js/pages/materials.js', 'js/pages/docs.js', 'js/pages/inspections.js', 'js/pages/contracts.js', 'js/pages/gmail.js', 'js/pages/admin.js', 'js/pages/catalog.js', 'js/pages/excel.js', 'js/xlsx.js', 'js/excel-link.js',
  'js/work.js', 'js/pages/work.js', 'js/pages/maintenance.js', 'js/pages/repairs.js', 'js/pages/workmat.js', 'js/pages/partreplace.js',
  'js/meters.js', 'js/chart.js', 'js/report-link.js', 'js/report-logo.js', 'js/pages/utilities.js', 'js/pages/circuits.js', 'js/pages/reports.js',
  'js/pages/sysreset.js',
  'vendor/jsQR-1.4.0.js', 'vendor/qrcode-generator-2.0.4.mjs',
  'assets/brand/logo57-tile.svg', 'assets/bg/factory.jpg', 'assets/bg/home.jpg', 'assets/icons/apple-touch-icon.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'
];

// Tải vỏ app từ máy chủ gốc theo mã bản (?v=BUILD_HASH, lưu dưới tên tệp thường): ngay sau khi phát hành, CDN của
// GitHub Pages có thể còn trả tệp cũ vài phút → không có ?v thì cache bản mới lẫn tệp cũ (vd app.js mới + work.js cũ).
// Một tệp lỗi → cài đặt thất bại, giữ bản đang chạy, trình duyệt thử lại lần mở sau.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(FILES.map(async (f) => {
      const r = await fetch(new Request(f + (f.includes('?') ? '&' : '?') + 'v=' + BUILD_HASH, { cache: 'reload' }));
      if (!r.ok) throw new Error('precache ' + f + ' ' + r.status);
      await c.put(new Request(f), r);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // không chặn script.google.com, Drive
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: SHELL }).then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: SHELL, ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
