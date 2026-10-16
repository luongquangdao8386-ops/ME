// Giao diện dùng chung và các màn đăng nhập (CM-01/WEB-CM-01), đổi PIN, mở khóa ngoại tuyến
import { bi, biText, esc, L, execUrl, EXEC_FIXED, isValidExecUrl, ls, resMsg, session, fmtDateTime, deviceInfo, NS } from './core.js';
import { login, changePin, offlineUnlock, getVerifier, pinWeakReason, isSharedDevice, isIosSafariTab } from './auth.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Tạo phần tử từ HTML */
// Chạm vào bất kỳ chỗ nào của khung ô nhập (biểu tượng, lề) cũng đưa con trỏ vào ô.
// focus() chạy ngay trong sự kiện chạm nên iPhone (cả app ở Màn hình chính) mở bàn phím.
document.addEventListener('click', (e) => {
  const field = e.target.closest && e.target.closest('.field');
  if (!field || e.target.closest('button, input, a')) return;
  const inp = field.querySelector('input');
  if (inp && !inp.disabled) inp.focus();
});

/**
 * Ghi nội dung màn danh sách mà giữ nguyên ô đang gõ (cùng một phần tử, không mất focus).
 * iPhone: ô nhập bị thay bằng phần tử mới (dù focus lại ngay) thì bàn phím bật về chữ sau mỗi số vừa gõ.
 * Ô đang gõ và các khung chứa nó giữ nguyên; chỉ thay phần xung quanh. Khuôn khác (ô không còn, độ sâu khác) → ghi lại như thường.
 */
export function setViewHtml(root, html) {
  const live = document.activeElement;
  const keep = live && live.tagName === 'INPUT' && live.id && root.contains(live) ? live : null;
  if (!keep) { root.innerHTML = html; return; }
  const t = document.createElement('template');
  t.innerHTML = html;
  const fresh = t.content.getElementById(keep.id);
  const chain = (n, top) => { const a = []; for (let x = n; x !== top; x = x.parentNode) { if (!x || x.nodeType !== 1) return null; a.push(x); } return a; };
  const oldC = chain(keep, root);
  const newC = fresh && chain(fresh, t.content);
  if (!oldC || !newC || oldC.length !== newC.length || oldC.some((n, i) => n.tagName !== newC[i].tagName)) { root.innerHTML = html; return; }
  oldC.forEach((o, i) => {
    const n = newC[i], op = o.parentNode;
    while (o.previousSibling) op.removeChild(o.previousSibling);
    while (o.nextSibling) op.removeChild(o.nextSibling);
    while (n.previousSibling) op.insertBefore(n.previousSibling, op.firstChild);
    while (n.nextSibling) op.appendChild(n.nextSibling);
    if (i === 0) return; // ô đang gõ: không đụng giá trị/thuộc tính
    [...o.attributes].forEach((a) => { if (!n.hasAttribute(a.name)) o.removeAttribute(a.name); });
    [...n.attributes].forEach((a) => { if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value); });
  });
}

/**
 * Ô tìm kiếm của danh sách: gõ xong 250 ms thì vẽ lại bằng `again` (màn dùng setViewHtml nên ô giữ nguyên → chỉ gắn sự kiện một lần;
 * mỗi lần vẽ chỉ cập nhật `onText`/`again` mới nhất). Ô bị thay (khuôn khác) mà lúc gõ đang focus → focus lại ô mới, giữ chỗ con trỏ.
 */
export function wireSearch(root, sel, onText, again) {
  const el = root.querySelector(sel);
  if (!el) return;
  el._search = { onText, again };
  if (el._searchWired) return;
  el._searchWired = true;
  let tm = null;
  el.addEventListener('input', () => {
    el._search.onText(el.value);
    clearTimeout(tm);
    tm = setTimeout(async () => {
      const pos = el.selectionStart;
      const had = document.activeElement === el;
      await el._search.again();
      const cur = root.querySelector(sel);
      if (had && cur && cur !== el) { cur.focus(); try { cur.setSelectionRange(pos, pos); } catch (e) { /* bỏ qua */ } }
    }, 250);
  });
}

/**
 * Danh sách vừa được mở từ chỗ khác (trang chủ, menu — ctx.entered): đưa ô tìm, bộ lọc, trang về như lúc đầu (`init`), giữ các khóa
 * trong `keep` (tab, kiểu bảng). Quay lại bằng ‹ hoặc vẽ lại thì giữ nguyên. Chỉ chạy một lần cho mỗi lần mở (vẽ lại khi gõ dùng cùng ctx).
 */
export function freshFilters(ctx, state, init, keep = []) {
  if (!ctx || !ctx.entered) return;
  ctx.entered = false;
  Object.keys(init).forEach((k) => { if (!keep.includes(k)) state[k] = init[k]; });
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const ICON = {
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.1 3.7M6.6 6.6C3.8 8.3 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M4 12h16"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  wifiOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.6M19 13a10 10 0 0 0-3.2-2.1M2 9.5a15 15 0 0 1 4.5-2.8M22 9.5A15 15 0 0 0 12 5.5"/><circle cx="12" cy="20" r="1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
  work: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  equipment: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="9" width="18" height="10" rx="2"/><circle cx="8" cy="14" r="2.5"/><path d="M13 12.5h5M13 15.5h5M7 9V6h6v3"/></svg>',
  maintenance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.2a4.5 4.5 0 0 0-5.6 5.9L3.5 16v4.5H8l5.9-5.9a4.5 4.5 0 0 0 5.9-5.6l-2.7 2.7-2.6-.4-.4-2.6z"/></svg>',
  repairs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
  warehouse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>',
  utilities: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3L4 13h5l-1 8 6-11H9z"/><path d="M17 8c2 2.5 3 4 3 5.5a3 3 0 0 1-6 0c0-1.5 1-3 3-5.5z"/></svg>',
  reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 16v-3M12 16V9M16 16v-5"/></svg>',
  circuits: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6h4v12H8M12 12h4"/></svg>',
  contracts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  inspections: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 13l2.5 2.5 4.5-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v4h16v-4"/></svg>',
  excel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8l6 8M15 8l-6 8"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  sync: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/></svg>',
  // Đợt 3: điện, nước, tủ điện, nguồn, phụ tải
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 13h6l-1 9 8-12h-6z"/></svg>',
  drop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.5 6-11z"/></svg>',
  panel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M12 15v3"/></svg>',
  source: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 3v4M15 3v4M12.5 10l-2 3h3l-2 3"/></svg>',
  load: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2M12 12l3-3"/></svg>'
};

/* ---------------- Thông báo ngắn, hộp thoại ---------------- */
let toastTimer = null;
/**
 * Tải lại bản mới khi app chạy lẫn tệp cũ và mới (vd ngay sau khi phát hành, CDN còn trả tệp cũ): xóa cache vỏ app của
 * trang này (không đụng trang kia), gỡ Service Worker, làm mới bộ nhớ đệm trình duyệt của các tệp đã tải rồi mở lại.
 * Nháp chưa gửi (IndexedDB) và phiên đăng nhập giữ nguyên.
 */
export async function reloadFresh() {
  try { const keys = await caches.keys(); await Promise.all(keys.filter((k) => k.startsWith(NS + '-shell-')).map((k) => caches.delete(k))); } catch (e) { /* bỏ qua */ }
  try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.unregister(); } catch (e) { /* bỏ qua */ }
  try {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    const urls = [...new Set(performance.getEntriesByType('resource').map((x) => x.name.split('#')[0]).filter((u) => u.startsWith(base) && /\.(m?js|css|json|webmanifest)(\?|$)/.test(u)))];
    await Promise.all(urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
  } catch (e) { /* bỏ qua */ }
  location.reload();
}

/** Nút "Tải lại bản mới" dưới thông báo lỗi trên máy */
export function reloadFreshHtml() {
  return `<p class="muted small">${bi('err.reload_hint')}</p><button type="button" class="btn primary" data-reload-fresh>${bi('err.reload_new')}</button>`;
}
export function wireReloadFresh(root) {
  root.querySelectorAll('[data-reload-fresh]').forEach((b) => b.addEventListener('click', () => { b.disabled = true; reloadFresh(); }));
}

/** Lên đầu trang (vẽ lại cùng màn không tự cuộn, vd sang trang danh sách kế tiếp) */
export function toTop() {
  window.scrollTo(0, 0);
  const v = document.getElementById('view');
  if (v) v.scrollTop = 0;
}

export function toast(html, kind = '') {
  const el = $('#toast');
  el.className = 'show ' + kind;
  el.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 4500);
}

export function dialog({ title, body = '', actions = [] }) {
  return new Promise((resolve) => {
    const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card">
      <h2>${title}</h2><div class="modal-body">${body}</div><div class="modal-actions"></div></div></div>`);
    const act = $('.modal-actions', wrap);
    actions.forEach((a) => {
      const b = h(`<button type="button" class="btn ${a.kind || ''}">${a.label}</button>`);
      b.addEventListener('click', () => { const v = a.value !== undefined ? a.value : (a.read ? a.read(wrap) : true); wrap.remove(); resolve(v); });
      act.appendChild(b);
    });
    document.body.appendChild(wrap);
    const first = $('input', wrap) || $('.btn', wrap);
    if (first) first.focus();
  });
}

/** Hỏi PIN 6 số (hỏi lại PIN, thử khóa) */
export async function askPin(titleKey = 'current_pin', note = '') {
  const v = await dialog({
    title: bi(titleKey),
    body: `${note ? `<p class="muted">${note}</p>` : ''}<input class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" aria-label="PIN">`,
    actions: [{ label: bi('cancel'), value: null }, { label: 'OK', kind: 'primary', read: (w) => $('input', w).value }]
  });
  return v;
}

export function pinField(id, labelHtml, autocomplete = 'current-password') {
  return `<label for="${id}">${labelHtml}</label>
  <div class="field"><span class="field-icon">${ICON.lock}</span>
    <input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="${autocomplete}" required>
    <button type="button" class="field-btn eye" aria-label="${esc(biText('show_pin'))}" data-for="${id}">${ICON.eye}</button></div>`;
}

function wireEyes(root) {
  $$('.eye', root).forEach((b) => b.addEventListener('click', () => {
    const inp = $('#' + b.dataset.for, root);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.innerHTML = show ? ICON.eyeOff : ICON.eye;
  }));
}

/** Cụm logo 57 + M&E/机电管理 — chỉ dùng ở đăng nhập và trang chủ (1.4 §3.5) */
export function brandHtml() {
  return `<div class="brand"><img class="brand-logo" src="assets/brand/logo57-tile.svg" alt="" width="48" height="48">
    <div class="brand-text"><div class="brand-name">M&amp;E</div><div class="brand-sub">机电管理</div></div></div>`;
}

/** Ô nhập link /exec tạm: chỉ khi config.js để trống (máy thử của người code); THỬ/THẬT có link cố định, không cho đổi */
function serverUrlBlock() {
  if (EXEC_FIXED) return '';
  const cur = execUrl();
  return `<details class="server-url" ${cur ? '' : 'open'}>
    <summary>${bi('server_url')}${cur ? '' : ` <span class="tag warn">${bi('server_url_missing')}</span>`}</summary>
    <input id="exec-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cur)}">
    <button type="button" class="btn small" id="save-url">${bi('save')}</button>
    <p class="err" id="url-err" hidden>${bi('server_url_bad')}</p>
  </details>`;
}

/* ---------------- Màn chờ mở app (không logo, 1.4 §3.5) ---------------- */
const BOOT_STEPS = ['auth.step_connect', 'auth.step_data', 'auth.step_open'];

/**
 * Ảnh nhà máy + lời chào + 3 bước (kết nối máy chủ → cập nhật dữ liệu → mở trang chủ), thanh tiến độ, số giây chờ.
 * pin: hiện nút Mở bằng PIN (máy có verifier). Trả {step(n), page(n), slow(), hidePin()}
 */
export function renderBoot(root, { name = '', code = '', pin = false, onPin } = {}) {
  const el = h(`<div class="boot-screen">
    <div class="boot-photo" aria-hidden="true"></div>
    <div class="boot-card" role="status">
      ${name ? `<p class="boot-hello">${bi('auth.hello')}</p><p class="boot-name"><strong>${esc(name)}</strong>${code ? `<span class="boot-code"> · ${esc(code)}</span>` : ''}</p>` : ''}
      <ol class="boot-steps">${BOOT_STEPS.map((k, i) => `<li data-step="${i + 1}"><span class="st-ico" aria-hidden="true">${ICON.check}</span><span class="st-text">${bi(k)}</span></li>`).join('')}</ol>
      <div class="boot-bar" aria-hidden="true"><span></span></div>
      <p class="boot-meta"><span class="boot-hint" hidden>${bi('auth.server_slow')}</span><span class="boot-secs"></span></p>
      ${pin ? `<div class="boot-pin-box"><button type="button" class="btn block boot-pin" id="open-pin">${ICON.lock}<span>${bi('auth.open_with_pin')}</span></button>
        <p class="boot-pin-note">${bi('auth.pin_skip_wait')}</p></div>` : ''}
    </div></div>`);
  root.replaceChildren(el);
  const pinBtn = $('#open-pin', el);
  if (pinBtn) pinBtn.addEventListener('click', () => onPin && onPin());
  const bar = $('.boot-bar span', el), secs = $('.boot-secs', el);
  const t0 = performance.now();
  let cur = 0, floor = 0, shown = 0, stepAt = t0;
  // Tiến độ ước lượng: mỗi bước tiến dần về mốc của bước đó, không đầy 100% trước khi xong
  const CAP = [0, 55, 90, 100];
  const tick = () => {
    if (!el.isConnected) { clearInterval(timer); return; }
    const t = (performance.now() - stepAt) / 1000;
    shown = Math.min(100, floor + (CAP[cur] - floor) * (1 - Math.exp(-t / 4)));
    bar.style.width = shown.toFixed(1) + '%';
    const n = Math.floor((performance.now() - t0) / 1000);
    secs.innerHTML = n >= 2 ? bi('auth.seconds', { N: n }) : '';
  };
  const timer = setInterval(tick, 250);
  const ctl = {
    step(n) {
      if (n <= cur) return;
      floor = shown;
      cur = n; stepAt = performance.now();
      $$('.boot-steps li', el).forEach((li) => {
        const k = Number(li.dataset.step);
        li.className = k < n ? 'done' : k === n ? 'active' : '';
      });
      if (n >= 2) ctl.hidePin();
      tick();
    },
    /** Tải dữ liệu nhiều phần (bootstrap): hiện "phần N" ở bước 2 */
    page(n) {
      const li = $('.boot-steps li[data-step="2"] .st-text', el);
      if (li && n > 1) li.innerHTML = bi('auth.loading_page', { N: n });
    },
    slow() { $('.boot-hint', el).hidden = false; },
    hidePin() { const b = $('.boot-pin-box', el); if (b) b.hidden = true; }
  };
  ctl.step(1);
  return ctl;
}

/* ---------------- Màn đăng nhập ---------------- */
export function renderLogin(root, { onLoggedIn, onMustChange, reason } = {}) {
  const wide = window.matchMedia('(min-width: 900px)').matches;
  const el = h(`<div class="login-screen">
    <div class="login-hero">${brandHtml()}</div>
    <form class="login-card" novalidate>
      <h1>${bi('login')}${ls.get('env') === 'THU' ? ` <span class="tag env">${bi('env_test')}</span>` : ''}</h1>
      ${reason ? `<p class="banner warn">${reason}</p>` : ''}
      ${isIosSafariTab() ? `<p class="banner info">${bi('safari_tab')}</p>` : ''}
      <label for="emp">${bi('employee_code')}</label>
      <div class="field"><span class="field-icon">${ICON.user}</span>
        <input id="emp" type="text" autocomplete="username" autocapitalize="characters" spellcheck="false" maxlength="40" required></div>
      ${pinField('pin', bi('pin6'))}
      <label class="check"><input type="checkbox" id="shared" ${isSharedDevice() ? 'checked' : ''}><span>${bi('shared_device')}</span></label>
      <button type="submit" class="btn primary block" id="login-btn">${bi('login')}</button>
      <p class="login-status" id="login-status" aria-live="polite" hidden></p>
      <button type="button" class="link" id="forgot">${bi('forgot_pin')}</button>
      <p class="muted center" id="forgot-help" hidden>${bi('forgot_pin_help')}</p>
      <p class="err" id="login-err" role="alert"></p>
      ${wide ? `<p class="muted center foot">${bi('same_account')}</p>` : ''}
      ${serverUrlBlock()}
    </form></div>`);
  root.replaceChildren(el);
  wireEyes(el);
  const last = ls.get('last_employee_code');
  if (last) $('#emp', el).value = last;
  $('#forgot', el).addEventListener('click', () => { $('#forgot-help', el).hidden = false; });
  if ($('#save-url', el)) {
    $('#save-url', el).addEventListener('click', () => {
      const u = $('#exec-url', el).value.trim();
      if (!isValidExecUrl(u)) { $('#url-err', el).hidden = false; return; }
      ls.set('exec_url', u);
      $('#url-err', el).hidden = true;
      toast(bi('save') + ' ✓', 'ok');
      renderLogin(root, { onLoggedIn, onMustChange });
    });
    // Enter trong ô link /exec = Lưu (không gửi form đăng nhập)
    $('#exec-url', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#save-url', el).click(); } });
  }
  const pinInp = $('#pin', el);
  pinInp.addEventListener('input', () => { pinInp.value = pinInp.value.replace(/\D/g, '').slice(0, 6); });
  // Một lần bấm là đủ: nút giữ trạng thái đang chạy (và bỏ qua bấm thêm) cho tới khi vào hẳn app
  let inFlight = false;
  const statusEl = $('#login-status', el);
  const status = (key, vars) => { statusEl.hidden = !key; statusEl.innerHTML = key ? `<span class="spinner tiny" aria-hidden="true"></span><span>${bi(key, vars)}</span>` : ''; };
  $('form', el).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (inFlight) return;
    const err = $('#login-err', el);
    err.textContent = '';
    const code = $('#emp', el).value.trim().toUpperCase();
    const pin = pinInp.value;
    // Đã dán link /exec mà quên bấm Lưu: lưu luôn
    const typed = $('#exec-url', el) ? $('#exec-url', el).value.trim() : '';
    if (typed && typed !== execUrl() && isValidExecUrl(typed)) ls.set('exec_url', typed);
    if (!execUrl()) { err.innerHTML = bi('server_url_missing'); return; }
    if (!code) { $('#emp', el).focus(); return; }
    if (!/^\d{6}$/.test(pin)) { err.innerHTML = bi('pin_format'); return; }
    const btn = $('#login-btn', el);
    const busy = (on) => { inFlight = on; btn.disabled = on; btn.classList.toggle('busy', on); if (!on) status(null); };
    busy(true);
    status('auth.checking_pin');
    let r;
    try {
      r = await login(code, pin, $('#shared', el).checked, { onStatus: (k) => status('auth.' + k) });
    } catch (e) {
      r = { ok: false, code: 'CLIENT_ERROR', message_vi: 'Lỗi trên máy: ' + (e && e.message), message_zh: '本机错误' };
    }
    try {
      if (r.ok) {
        ls.set('last_employee_code', code);
        status('auth.loading_data');
        if (onLoggedIn) await onLoggedIn(r, { status });
        return;
      }
      if (r.code === 'MUST_CHANGE_PIN') { ls.set('last_employee_code', code); onMustChange && onMustChange(pin); return; }
    } finally {
      // Màn đăng nhập vẫn còn (vào app lỗi): cho bấm lại
      if (el.isConnected) busy(false);
    }
    busy(false);
    // Mất mạng / máy chủ không trả lời: giữ PIN để chỉ cần bấm lại; sai PIN thì xóa
    if (r.code !== 'NETWORK_ERROR' && r.code !== 'SERVER_BUSY') pinInp.value = '';
    err.textContent = resMsg(r);
  });
}

/* ---------------- Màn đổi PIN (B5) ---------------- */
export function renderChangePin(root, { tempPin, onDone, onCancel, onSessionError, forced = true } = {}) {
  const el = h(`<div class="page narrow">
    <header class="bar"><button type="button" class="icon-btn" id="cp-back" aria-label="${esc(biText('back'))}">${ICON.back}</button>
      <h1>${bi('change_pin')}</h1></header>
    <form class="card form" novalidate>
      ${forced ? `<p class="banner info">${bi('temp_pin')}</p>` : ''}
      ${tempPin ? '' : pinField('cur', bi('current_pin'))}
      ${pinField('new1', bi('new_pin'), 'new-password')}
      ${pinField('new2', bi('new_pin_again'), 'new-password')}
      <p class="muted">${bi('no_reuse_pin')}</p>
      <button type="submit" class="btn primary block" id="cp-btn">${bi('save')}</button>
      <p class="err" id="cp-err" role="alert"></p>
    </form></div>`);
  root.replaceChildren(el);
  wireEyes(el);
  $$('input', el).forEach((i) => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); }));
  $('#cp-back', el).addEventListener('click', () => onCancel && onCancel());
  $('form', el).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('#cp-err', el);
    const cur = tempPin || $('#cur', el).value;
    const n1 = $('#new1', el).value, n2 = $('#new2', el).value;
    if (n1 !== n2) { err.innerHTML = bi('pin_mismatch'); return; }
    const weak = pinWeakReason(n1, session.user && session.user.employee_code, cur);
    if (weak) { err.innerHTML = bi(weak); return; }
    const btn = $('#cp-btn', el);
    btn.disabled = true;
    let r;
    try { r = await changePin(cur, n1); } catch (e) { r = { ok: false, code: 'CLIENT_ERROR', message_vi: 'Lỗi trên máy: ' + (e && e.message), message_zh: '本机错误' }; }
    finally { btn.disabled = false; }
    if (r.ok) { onDone && onDone(r); return; }
    // Phiên đổi PIN không còn dùng được (đã cấp PIN tạm mới hơn, hết hạn, khôi phục dữ liệu): về màn Đăng nhập
    if (onSessionError && ['AUTH_REQUIRED', 'SESSION_EXPIRED', 'DATASET_RESET'].includes(r.code)) { onSessionError(r); return; }
    err.textContent = resMsg(r);
    if (r.errors && r.errors[0]) err.textContent += ` (${r.errors[0].message_vi} · ${r.errors[0].message_zh})`;
  });
}

/* ---------------- Màn mở khóa ngoại tuyến (2.5) ---------------- */
export async function renderUnlock(root, { onUnlocked, onLogin } = {}) {
  const v = await getVerifier();
  const el = h(`<div class="page narrow">
    <header class="bar"><h1>${bi('offline_unlock')}</h1><span class="tag offline">${ICON.wifiOff}<span>${bi('offline')}</span></span></header>
    <form class="card form" novalidate>
      ${v ? `<p class="who"><strong>${esc(v.display_name)}</strong> · ${esc(v.employee_code)}</p>` : `<p class="banner warn">${bi('need_network')}</p>`}
      ${v ? pinField('upin', bi('pin6')) : ''}
      ${v ? `<button type="submit" class="btn primary block" id="u-btn">${bi('open_with_pin')}</button>` : ''}
      <p class="err" id="u-err" role="alert"></p>
      <button type="button" class="link" id="u-login">${bi('login')}</button>
    </form></div>`);
  root.replaceChildren(el);
  wireEyes(el);
  $('#u-login', el).addEventListener('click', () => onLogin && onLogin());
  if (!v) return;
  const inp = $('#upin', el);
  const form = $('form', el);
  let inFlight = false;
  // Nhập đủ 6 số là tự mở (như màn khóa iPhone), không phải bấm nút
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '').slice(0, 6);
    if (inp.value.length === 6 && !inFlight) { if (form.requestSubmit) form.requestSubmit(); else $('#u-btn', el).click(); }
  });
  inp.focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (inFlight) return;
    const err = $('#u-err', el);
    if (!/^\d{6}$/.test(inp.value)) { err.innerHTML = bi('pin_format'); inp.focus(); return; }
    const btn = $('#u-btn', el);
    inFlight = true; btn.disabled = true; btn.classList.add('busy');
    const t0 = performance.now();
    let r;
    try { r = await offlineUnlock(inp.value); } catch (e) { r = { ok: false, error: e && e.message }; }
    finally { inFlight = false; btn.disabled = false; btn.classList.remove('busy'); }
    inp.value = '';
    if (r.error) { err.textContent = 'Lỗi trên máy · 本机错误: ' + r.error; return; }
    if (r.ok) { onUnlocked && onUnlocked({ expired: r.expired, ms: Math.round(performance.now() - t0) }); return; }
    if (r.wiped) { err.innerHTML = bi('need_network'); setTimeout(() => onLogin && onLogin(), 1500); return; }
    if (r.locked_minutes) { err.innerHTML = bi('locked', { N: r.locked_minutes }); return; }
    err.innerHTML = bi('attempts_left', { N: r.attempts_left });
  });
}

/* ---------------- Khung trang sau đăng nhập (không logo, 1.4 §3.5) ---------------- */
export function shell(root, { titleKey, env, onLogout, onScan, offline, lastSync }) {
  const d = deviceInfo();
  const el = h(`<div class="page">
    <header class="bar main">
      <h1>${bi(titleKey)}</h1>
      ${env === 'THU' ? `<span class="tag env">${bi('env_test')}</span>` : ''}
      <span class="spacer"></span>
      <button type="button" class="scan-btn" id="sh-scan">${ICON.scan}<span>${bi('scan')}</span></button>
      <button type="button" class="btn small ghost" id="sh-logout">${bi('logout')}</button>
    </header>
    <div class="strip offline" id="sh-offline" ${offline ? '' : 'hidden'}>${ICON.wifiOff}<span>${bi('offline')} — ${bi('last_sync')}: <span id="sh-last">${esc(fmtDateTime(lastSync) || '—')}</span></span></div>
    ${d.platform.match(/iPhone|iPad|iPod/) && !d.standalone ? `<div class="strip warn"><span>${bi('safari_tab')}</span></div>` : ''}
    <div class="userline">${esc(session.user ? session.user.display_name + ' · ' + session.user.employee_code : '')}</div>
    <main id="sh-main"></main>
  </div>`);
  root.replaceChildren(el);
  $('#sh-logout', el).addEventListener('click', () => onLogout && onLogout());
  $('#sh-scan', el).addEventListener('click', () => onScan && onScan());
  return $('#sh-main', el);
}

export function setOfflineStrip(offline, lastSync) {
  const s = $('#sh-offline');
  if (!s) return;
  s.hidden = !offline;
  const l = $('#sh-last');
  if (l && lastSync) l.textContent = fmtDateTime(lastSync);
}

export { L };
