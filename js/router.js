// Định tuyến theo hash (#/...). Quay lại theo lịch sử trong app; mở thẳng từ QR/link thì về danh sách module (C2).
const routes = [];
let onRoute = null;
let depth = 0;
let lastHash = null, lastAt = 0;

/** Gọi màn hiện tại; popstate và hashchange cùng bắn khi lùi lịch sử → chỉ vẽ một lần */
function fire(force) {
  if (!onRoute) return;
  const h = location.hash || '#/';
  const t = Date.now();
  if (!force && h === lastHash && t - lastAt < 300) return;
  lastHash = h; lastAt = t;
  onRoute();
}

/** route('/equipment/:id', handler, {parent: '/equipment'}) */
export function route(pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-z_]+)/g, (m, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  routes.push({ pattern, re, keys, handler, opts });
}

export function currentPath() {
  const h = location.hash || '#/';
  const p = h.startsWith('#') ? h.slice(1) : h;
  return p.split('?')[0] || '/';
}

export function queryParams() {
  const h = location.hash || '';
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}

export function match(path) {
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

/** Đi tới màn khác trong app */
export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (location.hash === target) { fire(true); return; }
  if (replace) {
    history.replaceState({ meDepth: depth }, '', target);
  } else {
    depth++;
    history.pushState({ meDepth: depth }, '', target);
  }
  fire(true);
}

/** Quay lại: có màn trước trong app thì lùi lịch sử, không thì về màn cha */
export function back(fallback = '/') {
  const st = history.state;
  if (st && st.meDepth > 0) { history.back(); return; }
  navigate(fallback, { replace: true });
}

let started = false;
export function startRouter(fn) {
  onRoute = fn;
  if (!history.state || history.state.meDepth === undefined) history.replaceState({ meDepth: 0 }, '', location.hash || '#/');
  depth = history.state.meDepth || 0;
  if (started) return;
  started = true;
  window.addEventListener('popstate', (e) => {
    depth = (e.state && e.state.meDepth) || 0;
    fire(false);
  });
  // Gõ tay địa chỉ hoặc liên kết ngoài app: hashchange không kèm popstate ở mọi trình duyệt
  window.addEventListener('hashchange', () => {
    if (!history.state || history.state.meDepth === undefined) history.replaceState({ meDepth: depth }, '', location.hash);
    fire(false);
  });
  // Liên kết trong app (<a href="#/...">) đi qua navigate để giữ độ sâu lịch sử
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a || !onRoute || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(a.getAttribute('href').slice(1));
  });
}

export function stopRouter() { onRoute = null; }

/** Vẽ lại màn hiện tại (sau đồng bộ, đổi bố cục) */
export function refresh() { fire(true); }
