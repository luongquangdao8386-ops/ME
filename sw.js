// Service Worker của M&E — phạm vi /ME/; chỉ quản lý cache tên me-shell-* (phụ lục 1.5 mục 2.1)
const VERSION = '1.0.0-poc.3';
const BUILD_HASH = '15ca5466dbd1'; // tools/build.mjs ghi mã băm nội dung các tệp vỏ app
const SHELL = 'me-shell-' + VERSION + '-' + BUILD_HASH;
const FILES = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/core.js', 'js/auth.js', 'js/sync.js', 'js/ui.js', 'js/poc.js', 'js/scan.js', 'js/media.js', 'js/labels.js', 'js/qr-worker.js',
  'vendor/jsQR-1.4.0.js', 'vendor/qrcode-generator-2.0.4.mjs',
  'assets/brand/logo57-tile.svg', 'assets/bg/factory.jpg', 'assets/icons/apple-touch-icon.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('me-shell-') && k !== SHELL).map((k) => caches.delete(k))))
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
