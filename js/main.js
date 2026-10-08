// Khởi động app M&E: Service Worker, phiên, mở offline (2.5), đăng nhập, vào khung app
import { api, session, ls, ss, bi, biText, esc, execUrl, resMsg, isoNowVN } from './core.js';
import { loadSession, logout, handleRevoked, flushPendingLogout, isIosSafariTab, getVerifier, isSharedDevice, clearUserData } from './auth.js';
import { bootstrap, pullChanges, getMeta, queueItems, exportBackup, deleteQueued } from './sync.js';
import { shareFileNow } from './media.js';
import { renderLogin, renderChangePin, renderUnlock, toast, dialog, $ } from './ui.js';
import { app, enterApp, syncNow } from './app.js';
import { stopRouter } from './router.js';
import { invalidate } from './data.js';

const root = document.getElementById('app');

// Ghi lại vi phạm CSP (NT1-08, P-15)
window.__meCsp = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__meCsp.push({ directive: e.violatedDirective, blocked: e.blockedURI, at: isoNowVN() });
});

if ('serviceWorker' in navigator) {
  // Bản mới của app được kích hoạt → tải lại một lần để không chạy lẫn mã cũ và mới (nháp ở IndexedDB giữ nguyên)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* tab riêng tư có thể chặn */ });
}

/** Lưu mẫu đo thời gian mở app (P-17): giữ 5 lần gần nhất */
function noteColdStart(ms, timedOut) {
  let list = [];
  try { list = JSON.parse(ls.get('cold_starts') || '[]'); } catch (e) { list = []; }
  list.push({ ms, timed_out: !!timedOut, at: isoNowVN() });
  ls.set('cold_starts', JSON.stringify(list.slice(-5)));
}

/** Đích đến tạm khi mở link QR mà chưa đăng nhập (1.4 §4.2) */
function rememberTarget() {
  const h = location.hash || '';
  if (h.startsWith('#/r/') || /^#\/(equipment|materials|inspections|contracts)\//.test(h)) ss.set('pending_route', h);
}
function takeTarget() {
  const h = ss.get('pending_route');
  ss.del('pending_route');
  return h;
}

/** Phiên đã hết hạn mà đang offline: chỉ cho xem nháp và xuất dự phòng (2.5 mục 3) */
async function renderDraftsOnly() {
  const q = await queueItems();
  root.innerHTML = `<div class="page narrow">
    <header class="bar"><h1>${bi('draft.title')}</h1></header>
    <div class="card"><p class="banner warn">${bi('auth.expired_offline')}</p>
    <ul class="list">${q.map((o) => `<li>${esc(o.action)} · ${esc(o.local_created_at || '')}</li>`).join('') || `<li class="muted">${bi('draft.empty')}</li>`}</ul>
    <div class="row"><button type="button" class="btn small primary" id="dr-backup">${bi('btn.export_backup')}</button>
    <button type="button" class="btn small" id="dr-login">${bi('login')}</button></div></div></div>`;
  $('#dr-backup', root).addEventListener('click', async () => {
    const b = await exportBackup();
    shareFileNow(new File([b], `me-du-phong-${Date.now()}.json`, { type: 'application/json' }));
  });
  $('#dr-login', root).addEventListener('click', () => showLogin());
}

async function goApp(offline = false) {
  const target = takeTarget();
  if (target) history.replaceState(null, '', target);
  await enterApp(root, { offline });
}

/**
 * Đăng xuất (2.5): còn nháp chưa gửi → hộp thoại 4 lựa chọn
 * (Đồng bộ ngay / Xuất dự phòng / Giữ nháp trên máy / Xóa nháp, hỏi lại lần hai)
 */
async function doLogout() {
  const uid = session.user && session.user.user_id;
  const mine = (await queueItems()).filter((o) => o.user_id === uid);
  if (mine.length) {
    for (;;) {
      const online = navigator.onLine;
      const choice = await dialog({
        title: bi('btn.logout'),
        body: `<p>${bi('auth.logout_has_drafts', { N: mine.length })}</p>`,
        actions: [
          { label: bi('btn.cancel'), value: null },
          ...(online ? [{ label: bi('btn.sync_now'), value: 'sync' }] : []),
          { label: bi('btn.export_backup'), value: 'backup' },
          { label: bi('btn.delete_drafts'), kind: 'danger', value: 'delete' },
          { label: bi('btn.keep_drafts'), kind: 'primary', value: 'keep' }
        ]
      });
      if (!choice) return;
      if (choice === 'sync') { await syncNow(); const left = (await queueItems()).filter((o) => o.user_id === uid); if (!left.length) break; mine.splice(0, mine.length, ...left); continue; }
      if (choice === 'backup') { const b = await exportBackup(); shareFileNow(new File([b], `me-du-phong-${Date.now()}.json`, { type: 'application/json' })); continue; }
      if (choice === 'delete') {
        const sure = await dialog({ title: bi('btn.delete_drafts'), body: `<p><strong>${bi('draft.delete_all_confirm', { N: mine.length })}</strong></p>`, actions: [{ label: bi('btn.cancel'), kind: 'primary', value: false }, { label: bi('btn.delete_drafts'), kind: 'danger', value: true }] });
        if (!sure) continue;
        for (const o of mine) await deleteQueued(o.operation_id);
      }
      break;
    }
  }
  await logout();
  leaveApp();
  showLogin();
}

function leaveApp() {
  stopRouter();
  app.shell = null;
  invalidate();
  history.replaceState(null, '', '#/');
}

function showLogin(reason) {
  leaveApp();
  renderLogin(root, {
    reason,
    onLoggedIn: async () => {
      const b = await bootstrap();
      if (!b.ok) toast(esc(resMsg(b)), 'err');
      goApp(false);
    },
    onMustChange: (tempPin) => {
      renderChangePin(root, {
        tempPin, forced: true,
        onDone: async () => { toast(bi('sync.committed'), 'ok'); await bootstrap(); goApp(false); },
        onCancel: async () => { await logout(); showLogin(); }
      });
    }
  });
}

/** Xử lý lỗi phiên/epoch chung (2.5, 2.8). Trả true nếu đã chuyển màn */
async function handleSessionError(r) {
  if (!r) return false;
  if (r.code === 'AUTH_REQUIRED' && r.data && (r.data.reason === 'REVOKED' || r.data.reason === 'AUTH_VERSION')) {
    await handleRevoked();
    showLogin(bi('auth.revoked'));
    return true;
  }
  if (r.code === 'AUTH_REQUIRED' || r.code === 'SESSION_EXPIRED') { showLogin(bi('btn.relogin')); return true; }
  if (r.code === 'DATASET_RESET') { await handleRevoked(); showLogin(bi('sync.dataset_reset')); return true; }
  if (r.code === 'MUST_CHANGE_PIN') {
    renderChangePin(root, { forced: true, onDone: async () => { await bootstrap(); goApp(false); }, onCancel: async () => { await logout(); showLogin(); } });
    return true;
  }
  return false;
}

app.onLogout = doLogout;
app.onSessionError = handleSessionError;
app.onRevoked = async () => { await handleRevoked(); showLogin(bi('auth.revoked')); };
app.onRelogin = async () => { await logout(); showLogin(bi('btn.relogin')); };
app.onChangePin = () => {
  leaveApp();
  renderChangePin(root, {
    forced: false,
    onDone: async () => { toast(bi('auth.others_relogin'), 'ok'); await pullChanges(); goApp(false); },
    onCancel: () => { history.replaceState(null, '', '#/account'); goApp(false); }
  });
};

// Lỗi phiên từ bất kỳ request nào khi đang ở trong app
let handlingAuth = false;
import('./core.js').then(({ onApiEvent }) => onApiEvent(async (r) => {
  if (!app.shell || handlingAuth) return;
  if (['AUTH_REQUIRED', 'SESSION_EXPIRED', 'DATASET_RESET', 'MUST_CHANGE_PIN'].includes(r.code) && r.request && r.request.action !== 'auth.login') {
    handlingAuth = true;
    try { await handleSessionError(r); } finally { handlingAuth = false; }
  }
}));

async function start() {
  const hash = location.hash || '';
  if (hash.startsWith('#/labels')) { await loadSession(); const { renderLabels } = await import('./poc.js'); return renderLabels(root); }
  await loadSession();
  const boot = await getMeta('bootstrap');
  if (boot) { session.settings = boot.settings || {}; if (!session.user) session.user = boot.user; }
  // Máy dùng chung mà không còn phiên: xóa cache nghiệp vụ của người trước (2.5)
  if (isSharedDevice() && !session.token) await clearUserData();
  rememberTarget();
  if (!execUrl() || !session.token) return showLogin();
  if (session.kind === 'CHANGE_PIN') return showLogin();

  // Mở app: có mạng thì hỏi máy chủ (tối đa offline_probe_seconds); không thì mở khóa ngoại tuyến (2.5)
  const probeSec = Number(session.settings.offline_probe_seconds || 12);
  const tryOffline = async () => {
    const v = await getVerifier();
    if (!v) return showLogin(bi('sync.need_network'));
    renderUnlock(root, {
      onUnlocked: async ({ expired, ms }) => {
        ls.set('p04_offline_open', isoNowVN());
        ls.set('offline_unlock_ms', String(ms));
        if (expired) return renderDraftsOnly();
        goApp(true);
      },
      onLogin: () => showLogin()
    });
  };
  if (!navigator.onLine) return tryOffline();

  const wait = document.createElement('div');
  wait.className = 'boot';
  wait.innerHTML = `<div class="spinner" aria-hidden="true"></div><button type="button" class="btn small" id="open-pin">${bi('auth.open_with_pin')}</button>`;
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
    // Còn mạng mà máy chủ chậm, hoặc không có verifier (tab Safari, máy dùng chung): chờ tiếp tới 30 giây
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = biText('auth.server_slow');
    wait.appendChild(hint);
    r = await api('sync.changes', { cursor: cursor0, limit: 1 }, { timeoutMs: 30000, retry: true });
    if (decided) return;
  }
  decided = true;
  if (r.code === 'NETWORK_ERROR') return tryOffline();
  if (await handleSessionError(r)) return;
  if (r.code === 'SYSTEM_MAINTENANCE') { toast(bi('sys.maintenance'), 'err'); return tryOffline(); }
  flushPendingLogout();
  const cur = await getMeta('cursor');
  if (cur === null || cur === undefined) await bootstrap(); else await pullChanges();
  await goApp(false);
  // Có mạng: gửi hàng chờ còn lại ở nền
  if ((await queueItems()).length) syncNow({ quiet: true });
}

window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#/labels') && !app.shell) import('./poc.js').then((m) => m.renderLabels(root));
});

start().catch((e) => {
  root.innerHTML = `<div class="page narrow"><p class="banner warn">${esc(e && e.message)}</p></div>`;
});
