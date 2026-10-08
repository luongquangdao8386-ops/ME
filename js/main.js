// Khởi động app M&E (PoC): Service Worker, phiên, mở offline, định tuyến
import { api, session, ls, bi, biText, esc, execUrl, resMsg, isoNowVN } from './core.js';
import { loadSession, logout, handleRevoked, flushPendingLogout, isIosSafariTab, getVerifier, isSharedDevice, clearUserData } from './auth.js';
import { bootstrap, pullChanges, getMeta, queueItems, exportBackup } from './sync.js';
import { shareFileNow } from './media.js';
import { renderLogin, renderChangePin, renderUnlock, shell, toast, dialog, setOfflineStrip, $ } from './ui.js';
import { renderPoc, renderLabels } from './poc.js';
import { openScanner, parseScan, resolveScan, qrStateText } from './scan.js';

const root = document.getElementById('app');

// Ghi lại vi phạm CSP cho P-15
window.__meCsp = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__meCsp.push({ directive: e.violatedDirective, blocked: e.blockedURI, at: isoNowVN() });
});

if ('serviceWorker' in navigator) {
  // Bản mới của app được kích hoạt → tải lại một lần để không chạy lẫn mã cũ và mới
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* tab riêng tư có thể chặn */ });
}

/** Lưu mẫu đo thời gian mở app (P-17): giữ 5 lần gần nhất, có đánh dấu hết thời gian chờ */
function noteColdStart(ms, timedOut) {
  let list = [];
  try { list = JSON.parse(ls.get('cold_starts') || '[]'); } catch (e) { list = []; }
  list.push({ ms, timed_out: !!timedOut, at: isoNowVN() });
  ls.set('cold_starts', JSON.stringify(list.slice(-5)));
}

/** Phiên đã hết hạn mà đang offline: chỉ cho xem nháp và xuất dự phòng (2.5 mục 3) */
async function renderDraftsOnly() {
  const q = await queueItems();
  root.innerHTML = `<div class="page narrow">
    <header class="bar"><h1>${bi(['Nháp chờ đồng bộ', '待同步草稿'])}</h1></header>
    <div class="card"><p class="banner warn">${bi(['Phiên đã hết hạn: chỉ xem nháp và xuất dự phòng', '会话已过期：只能查看草稿和导出备份'])}</p>
    <ul class="list">${q.map((o) => `<li>${esc(o.action)} · ${esc(o.local_created_at || '')}</li>`).join('') || '<li class="muted">—</li>'}</ul>
    <div class="row"><button type="button" class="btn small primary" id="dr-backup">${bi('export_backup')}</button>
    <button type="button" class="btn small" id="dr-login">${bi('login')}</button></div></div></div>`;
  $('#dr-backup', root).addEventListener('click', async () => {
    const b = await exportBackup();
    shareFileNow(new File([b], `me-du-phong-${Date.now()}.json`, { type: 'application/json' }));
  });
  $('#dr-login', root).addEventListener('click', () => showLogin());
}

let offlineMode = false;

async function loadBootMeta() {
  const boot = await getMeta('bootstrap');
  if (boot) { session.settings = boot.settings || {}; if (!session.user) session.user = boot.user; }
  return boot;
}

async function goHome() {
  const boot = await loadBootMeta();
  const last = await getMeta('last_sync');
  const main = shell(root, {
    titleKey: 'poc_title', env: boot ? boot.env : null, offline: offlineMode, lastSync: last,
    onLogout: doLogout, onScan: scanFromHeader
  });
  await renderPoc(main, { isOwner: !!(session.user && Number(session.user.role_level) === 4), offline: offlineMode });
}

async function doLogout() {
  const q = await queueItems();
  if (q.length) {
    const ok = await dialog({
      title: bi('logout'),
      body: `<p>${bi(['Còn {N} mục chờ gửi trên máy. Nháp được giữ lại cho lần đăng nhập sau.', '本机仍有 {N} 条待同步数据，草稿会保留到下次登录。'], { N: q.length })}</p>`,
      actions: [{ label: bi('cancel'), value: false }, { label: bi('logout'), kind: 'primary', value: true }]
    });
    if (!ok) return;
  }
  await logout();
  offlineMode = false;
  showLogin();
}

function showLogin(reason) {
  renderLogin(root, {
    reason,
    onLoggedIn: async () => {
      offlineMode = false;
      const b = await bootstrap();
      if (!b.ok) toast(esc(resMsg(b)), 'err');
      goHome();
    },
    onMustChange: (tempPin) => {
      renderChangePin(root, {
        tempPin, forced: true,
        onDone: async () => { toast(bi('committed'), 'ok'); await bootstrap(); goHome(); },
        onCancel: async () => { await logout(); showLogin(); }
      });
    }
  });
}

function scanFromHeader() {
  openScanner({
    onResult: async (raw, info) => {
      const p = parseScan(raw, info.manual);
      const r = await resolveScan(p);
      if (r.qr_state === 'OK') toast(`✓ ${esc(r.code)} · ${esc(r.entity_type)}${r.offline ? ' · ' + bi('offline') : ''}`, 'ok');
      else toast(`${bi(qrStateText(r.qr_state))}${r.raw ? ' — ' + esc(r.raw.slice(0, 60)) : ''}`, 'err');
    }
  });
}

/** Xử lý lỗi phiên/epoch chung (2.5, 2.8) */
async function handleSessionError(r) {
  if (r.code === 'AUTH_REQUIRED' && r.data && (r.data.reason === 'REVOKED' || r.data.reason === 'AUTH_VERSION')) {
    await handleRevoked();
    showLogin(bi('revoked'));
    return true;
  }
  if (r.code === 'AUTH_REQUIRED' || r.code === 'SESSION_EXPIRED') { showLogin(bi('relogin')); return true; }
  if (r.code === 'DATASET_RESET') { await handleRevoked(); showLogin(bi('dataset_reset')); return true; }
  if (r.code === 'MUST_CHANGE_PIN') {
    renderChangePin(root, { forced: true, onDone: async () => { await bootstrap(); goHome(); }, onCancel: async () => { await logout(); showLogin(); } });
    return true;
  }
  return false;
}

/** Tuyến #/r/<qr_key>: trong tab Safari iOS nhắc mở app trên Màn hình chính (3.4) */
async function qrRoute(key) {
  if (isIosSafariTab()) {
    const go = await dialog({
      title: bi('scan'),
      body: `<p>${bi('open_in_app')}</p>`,
      actions: [{ label: bi('continue_here'), kind: 'primary', value: true }]
    });
    if (!go) return;
  }
  const r = await resolveScan({ kind: 'qr', key });
  toast(r.qr_state === 'OK' ? `✓ ${esc(r.code)}` : bi(qrStateText(r.qr_state)), r.qr_state === 'OK' ? 'ok' : 'err');
  history.replaceState(null, '', '#/');
}

async function start() {
  const hash = location.hash || '';
  if (hash.startsWith('#/labels')) { await loadSession(); return renderLabels(root); }
  await loadSession();
  await loadBootMeta();
  // Máy dùng chung mà không còn phiên: xóa cache nghiệp vụ của người trước (2.5)
  if (isSharedDevice() && !session.token) await clearUserData();
  if (!execUrl() || !session.token) return showLogin();
  if (session.kind === 'CHANGE_PIN') return showLogin();

  // Mở app: có mạng thì hỏi máy chủ (tối đa offline_probe_seconds); không thì mở khóa ngoại tuyến (2.5)
  const probeSec = Number(session.settings.offline_probe_seconds || 8);
  const tryOffline = async () => {
    offlineMode = true;
    const v = await getVerifier();
    if (!v) return showLogin(bi('need_network'));
    renderUnlock(root, {
      onUnlocked: async ({ expired, ms }) => {
        ls.set('p04_offline_open', isoNowVN());
        ls.set('offline_unlock_ms', String(ms));
        if (expired) return renderDraftsOnly();
        goHome();
      },
      onLogin: () => showLogin()
    });
  };
  if (!navigator.onLine) return tryOffline();

  const wait = document.createElement('div');
  wait.className = 'boot';
  wait.innerHTML = `<div class="spinner" aria-hidden="true"></div><button type="button" class="btn small" id="open-pin">${bi('open_with_pin')}</button>`;
  root.replaceChildren(wait);
  let decided = false;
  $('#open-pin', wait).addEventListener('click', () => { if (!decided) { decided = true; tryOffline(); } });
  const t0 = performance.now();
  const cursor0 = Number((await getMeta('cursor')) || 0);
  let r = await api('sync.changes', { cursor: cursor0, limit: 1 }, { timeoutMs: probeSec * 1000 });
  if (decided) return;
  const timedOut = r.code === 'NETWORK_ERROR' && r.transport === 'TIMEOUT';
  noteColdStart(Math.round(performance.now() - t0), timedOut);
  if (r.code === 'NETWORK_ERROR' && navigator.onLine && (timedOut || !(await getVerifier()))) {
    // Còn mạng mà máy chủ chậm (PoC: mở app 4–8 giây trở lên), hoặc không có verifier (tab Safari, máy dùng chung):
    // chờ thêm thay vì chuyển sang mở khóa ngoại tuyến; nút "Mở bằng PIN" vẫn bấm được
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = biText(['Máy chủ đang phản hồi chậm…', '服务器响应较慢…']);
    wait.appendChild(hint);
    r = await api('sync.changes', { cursor: cursor0, limit: 1 }, { timeoutMs: 30000, retry: true });
    if (decided) return;
  }
  decided = true;
  if (r.code === 'NETWORK_ERROR') return tryOffline();
  if (await handleSessionError(r)) return;
  if (r.code === 'SYSTEM_MAINTENANCE') { toast(bi('maintenance'), 'err'); return tryOffline(); }
  flushPendingLogout();
  const cur = await getMeta('cursor');
  if (cur === null || cur === undefined) await bootstrap(); else await pullChanges();
  goHome();
  if (hash.startsWith('#/r/')) qrRoute(hash.slice(4));
}

window.addEventListener('online', () => { setOfflineStrip(false); });
window.addEventListener('offline', async () => { setOfflineStrip(true, await getMeta('last_sync')); });
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#/labels')) renderLabels(root);
  else if (location.hash === '#/' && document.querySelector('.labels-screen')) start();
  else if (location.hash.startsWith('#/r/') && session.token) qrRoute(location.hash.slice(4));
});

start().catch((e) => {
  root.innerHTML = `<div class="page narrow"><p class="banner warn">${esc(e && e.message)}</p></div>`;
});
