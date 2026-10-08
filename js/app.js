// Điều khiển app sau đăng nhập: khung, định tuyến, đồng bộ nền, quét QR (phụ lục 1.5 mục 6.3)
import { bi, esc, session, resMsg } from './core.js';
import { getMeta, pullChanges, queueItems, flushQueue } from './sync.js';
import { mountShell, isWide, MODULES } from './shell.js';
import { route, match, currentPath, queryParams, navigate, back, startRouter, refresh } from './router.js';
import { invalidate, boot as bootData } from './data.js';
import { toast, dialog } from './ui.js';
import { openScanner, parseScan, resolveScan, qrStateText } from './scan.js';

export const app = {
  shell: null,
  offline: false,
  /** do main.js gán: đăng xuất, đăng nhập lại, xử lý lỗi phiên */
  onLogout: null,
  onRelogin: null,
  onSessionError: null
};

/** Đường dẫn hồ sơ theo loại (QR, liên kết trong app) */
export function entityPath(type, id) {
  return {
    EQUIPMENT: '/equipment/', MATERIAL: '/materials/', INSPECTION_REQUIREMENT: '/inspections/', INSPECTION: '/inspections/record/',
    CONTRACT: '/contracts/'
  }[type] + encodeURIComponent(id);
}

let lastWide = null;
let renderSeq = 0;

async function renderRoute() {
  const seq = ++renderSeq;
  const path = currentPath();
  const m = match(path);
  const shell = app.shell;
  if (!m) { navigate('/', { replace: true }); return; }
  shell.setActive(m.route.opts.nav || '');
  shell.setBackHandler((target) => back(target || '/'));
  const view = shell.view;
  view.className = 'view';
  // Không để nội dung màn trước (vd cụm logo trang chủ) còn hiện trong lúc màn mới đang tải
  if (!view.querySelector('.pane') || !path.startsWith(view.dataset.path || '\u0000')) view.innerHTML = '<div class="loading"><div class="spinner small" aria-hidden="true"></div></div>';
  view.dataset.path = path.split('/').slice(0, 2).join('/');
  try {
    await m.route.handler(view, { params: m.params, query: queryParams(), shell, app, seq, isCurrent: () => seq === renderSeq });
  } catch (e) {
    if (seq !== renderSeq) return;
    view.innerHTML = `<div class="card"><p class="banner warn">${bi('err.client')}: ${esc(e && e.message)}</p></div>`;
    console.error(e);
  }
}

/** Cập nhật dải đồng bộ (header web, dải ngoại tuyến) */
export async function updateSyncStatus() {
  if (!app.shell) return;
  const q = await queueItems().catch(() => []);
  const mine = q.filter((o) => o.user_id === (session.user && session.user.user_id) && o.dataset_epoch === session.epoch);
  const problems = mine.filter((o) => o.state === 'CONFLICT' || o.state === 'REJECTED').length;
  app.shell.setSync({ offline: app.offline || !navigator.onLine, lastSync: await getMeta('last_sync'), queued: mine.length - problems, problems });
}

/**
 * Đồng bộ ngay: gửi hàng chờ rồi lấy thay đổi. Trả {ok, code}
 */
export async function syncNow({ quiet = false } = {}) {
  if (!navigator.onLine) { if (!quiet) toast(bi('sync.need_network'), 'err'); return { ok: false, code: 'NETWORK_ERROR' }; }
  const f = await flushQueue();
  if (f.stopped_code && app.onSessionError && await app.onSessionError({ code: f.stopped_code, data: f.response && f.response.data })) return { ok: false, code: f.stopped_code };
  const r = await pullChanges();
  invalidate();
  app.offline = false;
  await updateSyncStatus();
  if (!r.ok) {
    if (app.onSessionError && await app.onSessionError(r)) return r;
    if (!quiet) toast(esc(resMsg(r)), 'err');
    return r;
  }
  if (!quiet) toast(bi('sync.done'), 'ok');
  return { ok: true };
}

/** Sau một thao tác ghi COMMITTED: lấy thay đổi (1.4 §14.3: gọi sync.changes sau mỗi COMMITTED) */
export async function afterCommit() {
  const r = await pullChanges();
  invalidate();
  await updateSyncStatus();
  return r;
}

/** Quét QR từ nav/menu: mở đúng hồ sơ hoặc báo theo khóa qr.* (5.3.8) */
export function scanAndOpen() {
  openScanner({
    onResult: async (raw, info) => {
      const p = parseScan(raw, info.manual);
      const r = await resolveScan(p);
      await openResolved(r);
    }
  });
}

export async function openResolved(r) {
  if (r.qr_state === 'OK' && r.entity_type && r.entity_id) { navigate(entityPath(r.entity_type, r.entity_id)); return; }
  if (r.qr_state === 'UNAVAILABLE' && r.offline) { toast(bi('sync.need_network'), 'err'); return; }
  const key = r.qr_state === 'INACTIVE' && r.entity_type ? null : qrStateText(r.qr_state);
  if (!key && r.entity_type) { navigate(entityPath(r.entity_type, r.entity_id)); toast(bi('qr.inactive')); return; }
  await dialog({
    title: bi('nav.scan'),
    body: `<p>${bi(key || 'qr_unavailable')}</p>${r.qr_state === 'FOREIGN' && r.raw ? `<p class="raw">${esc(r.raw.slice(0, 300))}</p>` : ''}`,
    actions: [{ label: bi('btn.close'), kind: 'primary', value: true }]
  });
}

function registerRoutes() {
  const lazy = (mod, fn) => async (view, ctx) => { const m = await import(mod); return m[fn](view, ctx); };
  route('/', lazy('./pages/home.js', 'renderHome'), { nav: 'home' });
  route('/work', lazy('./pages/misc.js', 'renderComingSoon'), { nav: 'work' });
  route('/alerts', lazy('./pages/alerts.js', 'renderAlerts'), { nav: 'alerts' });
  route('/alerts/month', lazy('./pages/alerts.js', 'renderMonth'), { nav: 'alerts' });
  route('/account', lazy('./pages/account.js', 'renderAccount'), { nav: 'account' });
  route('/account/drafts', lazy('./pages/drafts.js', 'renderDrafts'), { nav: 'account' });
  route('/account/conflict/:op', lazy('./pages/drafts.js', 'renderConflict'), { nav: 'account' });
  route('/poc', lazy('./pages/misc.js', 'renderPocPage'), { nav: 'account' });
  route('/equipment', lazy('./pages/equipment.js', 'renderEquipmentList'), { nav: 'equipment' });
  route('/equipment/new', lazy('./pages/equipment.js', 'renderEquipmentForm'), { nav: 'equipment' });
  route('/equipment/:id', lazy('./pages/equipment.js', 'renderEquipment'), { nav: 'equipment' });
  route('/equipment/:id/edit', lazy('./pages/equipment.js', 'renderEquipmentForm'), { nav: 'equipment' });
  route('/materials', lazy('./pages/materials.js', 'renderMaterialList'), { nav: 'warehouse' });
  route('/materials/new', lazy('./pages/materials.js', 'renderMaterialForm'), { nav: 'warehouse' });
  route('/materials/:id', lazy('./pages/materials.js', 'renderMaterial'), { nav: 'warehouse' });
  route('/materials/:id/edit', lazy('./pages/materials.js', 'renderMaterialForm'), { nav: 'warehouse' });
  route('/inspections', lazy('./pages/misc.js', 'renderInspectionsInterim'), { nav: 'inspections' });
  route('/inspections/:id', lazy('./pages/misc.js', 'renderInspectionsInterim'), { nav: 'inspections' });
  route('/inspections/record/:id', lazy('./pages/misc.js', 'renderInspectionsInterim'), { nav: 'inspections' });
  route('/contracts', lazy('./pages/misc.js', 'renderContractsInterim'), { nav: 'contracts' });
  route('/contracts/:id', lazy('./pages/misc.js', 'renderContractsInterim'), { nav: 'contracts' });
  route('/admin/:page', lazy('./pages/misc.js', 'renderAdminInterim'), { nav: 'account' });
  route('/qr/:type/:id', lazy('./pages/misc.js', 'renderQrView'), { nav: '' });
  route('/print', lazy('./pages/misc.js', 'renderPrintLabels'), { nav: '' });
  route('/labels', async (view, ctx) => { ctx.shell.setScreen({ title: 'screen.labels', back: '/poc' }); const m = await import('./poc.js'); return m.renderLabels(view); }, { nav: 'account' });
  for (const m of MODULES) if (m.dot > 1) route(m.path, lazy('./pages/misc.js', 'renderComingSoon'), { nav: m.key });
  route('/r/:key', async (view, ctx) => {
    const r = await resolveScan({ kind: 'qr', key: ctx.params.key });
    if (r.qr_state === 'OK') { navigate(entityPath(r.entity_type, r.entity_id), { replace: true }); return; }
    navigate('/', { replace: true });
    await openResolved(r);
  }, { nav: '' });
}

let routesReady = false;

/** Vào app (sau đăng nhập hoặc mở khóa ngoại tuyến) */
export async function enterApp(root, { offline = false } = {}) {
  app.offline = offline;
  invalidate();
  const b = await bootData();
  if (!routesReady) { registerRoutes(); routesReady = true; }
  app.shell = mountShell(root, { env: b.env, onScan: scanAndOpen });
  app.shell.setSessionWarn(session.expires_at, () => app.onRelogin && app.onRelogin());
  await updateSyncStatus();
  lastWide = isWide();
  startRouter(renderRoute);
  await renderRoute();
}

// Đổi giữa bố cục iPhone và web khi xoay/kéo cửa sổ: vẽ lại màn hiện tại
window.addEventListener('resize', () => {
  if (!app.shell) return;
  const w = isWide();
  if (w !== lastWide) { lastWide = w; refresh(); }
});
window.addEventListener('online', () => { app.offline = false; updateSyncStatus(); });
window.addEventListener('offline', () => { updateSyncStatus(); });
