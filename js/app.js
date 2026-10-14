// Điều khiển app sau đăng nhập: khung, định tuyến, đồng bộ nền, quét QR (phụ lục 1.5 mục 6.3)
import { bi, esc, session, resMsg } from './core.js';
import { getMeta, pullChanges, queueItems, flushQueue } from './sync.js';
import { mountShell, isWide, MODULES, setReleasedDot, RELEASED_DOT } from './shell.js';
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
    CONTRACT: '/contracts/', MAINTENANCE_PLAN: '/maintenance/plans/', WORK_ORDER: '/maintenance/wo/', REPAIR: '/repairs/'
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
  const main = shell.view;
  main.className = 'view';
  // Mỗi địa chỉ một khung nội dung riêng: màn trước tải chậm (vd Người dùng) xong muộn chỉ vẽ vào khung cũ đã gỡ,
  // không đè lên màn mới (vd Danh mục chung). Cùng địa chỉ (vẽ lại) thì dùng lại khung.
  const hash = location.hash || '#/';
  let view = main.firstElementChild;
  const redraw = !!view && view.classList.contains('view-page') && view.dataset.hash === hash;
  if (!redraw) {
    const fresh = document.createElement('div');
    fresh.className = 'view-page';
    fresh.dataset.hash = hash;
    if (view && view.classList.contains('view-page')) fresh.append(...view.childNodes);
    main.replaceChildren(fresh);
    view = fresh;
  }
  // Không để nội dung màn trước (vd cụm logo trang chủ) còn hiện trong lúc màn mới đang tải. Vẽ lại cùng màn (đồng bộ xong,
  // xoay máy) thì giữ nội dung cũ tới khi có nội dung mới: không nháy, không mất chỗ đang xem
  if (!redraw && (!view.querySelector('.pane') || !path.startsWith(main.dataset.path || '\u0000'))) view.innerHTML = '<div class="loading"><div class="spinner small" aria-hidden="true"></div></div>';
  main.dataset.path = path.split('/').slice(0, 2).join('/');
  // Màn đã bị thay không được đổi tiêu đề/nút trên header nữa
  const pageShell = Object.assign(Object.create(shell), { setScreen: (o) => { if (seq === renderSeq) shell.setScreen(o); } });
  try {
    await m.route.handler(view, { params: m.params, query: queryParams(), shell: pageShell, app, seq, isCurrent: () => seq === renderSeq });
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
  // Số việc chờ tôi nghiệm thu/duyệt trên nút Công việc (C3/C4, Đợt 2)
  if (RELEASED_DOT >= 2) {
    const { pendingForMe } = await import('./work.js');
    if (app.shell) app.shell.setBadge('work', (await pendingForMe().catch(() => [])).length);
  }
}

let syncing = null;

async function runSync() {
  const f = await flushQueue();
  if (f.stopped_code && app.onSessionError && await app.onSessionError({ code: f.stopped_code, data: f.response && f.response.data })) return { ok: false, code: f.stopped_code, handled: true, committed: f.committed };
  const r = await pullChanges();
  invalidate();
  await noteReleasedDot();
  app.offline = false;
  await updateSyncStatus();
  if (!r.ok) {
    if (app.onSessionError && await app.onSessionError(r)) return { ...r, handled: true, committed: f.committed };
    return { ...r, committed: f.committed };
  }
  return { ok: true, committed: f.committed };
}

/**
 * Đồng bộ ngay: gửi hàng chờ rồi lấy thay đổi. Trả {ok, code, committed}.
 * Hai lần gọi trùng nhau (nút bấm + tự gửi khi có mạng lại) dùng chung một lượt, không gửi hai lần.
 */
export async function syncNow({ quiet = false } = {}) {
  if (!navigator.onLine) { if (!quiet) toast(bi('sync.need_network'), 'err'); return { ok: false, code: 'NETWORK_ERROR' }; }
  const r = await (syncing || (syncing = runSync().finally(() => { syncing = null; })));
  if (!r.ok) { if (!quiet && !r.handled) toast(esc(resMsg(r)), 'err'); return r; }
  // Có mục vừa lên máy chủ: luôn báo "Đã lưu máy chủ" (NT1-33), kể cả khi tự gửi ở nền
  if (r.committed) toast(bi('sync.committed_n', { N: r.committed }), 'ok');
  else if (!quiet) toast(bi('sync.done'), 'ok');
  return r;
}

/** Máy chủ bật đợt mới khi app đang mở (đồng bộ vừa tải lại): màn của đợt mới mở được ngay; menu cập nhật khi mở lại app */
async function noteReleasedDot() {
  const before = RELEASED_DOT;
  if (setReleasedDot(await bootData()) > before && app.shell) toast(bi('sync.new_features'), 'ok');
}

/** Sau một thao tác ghi COMMITTED: lấy thay đổi (1.4 §14.3: gọi sync.changes sau mỗi COMMITTED) */
export async function afterCommit() {
  const r = await pullChanges();
  invalidate();
  await noteReleasedDot();
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
  // Bàn thử PoC và tem thử chỉ có ở máy chủ THỬ (6.7: gỡ ở THẬT); máy chủ THẬT cũng trả FEATURE_NOT_ENABLED cho poc.*
  // Màn của đợt máy chủ chưa chạy (vd vừa cập nhật app mà máy chủ chưa dán Code.gs mới): giữ màn "Sắp có"
  const soonOr = (dot, fn) => async (view, ctx) => {
    if (RELEASED_DOT < dot) { const m = await import('./pages/misc.js'); return m.renderComingSoon(view, ctx); }
    return fn(view, ctx);
  };
  const testOnly = (fn) => async (view, ctx) => {
    if ((await bootData()).env !== 'THU') { navigate('/', { replace: true }); return; }
    return fn(view, ctx);
  };
  route('/', lazy('./pages/home.js', 'renderHome'), { nav: 'home' });
  route('/work', soonOr(2, lazy('./pages/work.js', 'renderWork')), { nav: 'work' });
  // Đợt 2: Bảo trì (MT-01..03, WEB-MT-01), Sửa chữa (RP-01..03, WEB-RP-01)
  route('/maintenance', soonOr(2, lazy('./pages/maintenance.js', 'renderMaintenance')), { nav: 'maintenance' });
  route('/maintenance/plans/new', soonOr(2, lazy('./pages/maintenance.js', 'renderPlanForm')), { nav: 'maintenance' });
  route('/maintenance/plans/:id', soonOr(2, lazy('./pages/maintenance.js', 'renderPlan')), { nav: 'maintenance' });
  route('/maintenance/plans/:id/edit', soonOr(2, lazy('./pages/maintenance.js', 'renderPlanForm')), { nav: 'maintenance' });
  route('/maintenance/checklists', soonOr(2, lazy('./pages/maintenance.js', 'renderChecklists')), { nav: 'maintenance' });
  route('/maintenance/checklists/new', soonOr(2, lazy('./pages/maintenance.js', 'renderChecklistForm')), { nav: 'maintenance' });
  route('/maintenance/checklists/:id', soonOr(2, lazy('./pages/maintenance.js', 'renderChecklistForm')), { nav: 'maintenance' });
  route('/maintenance/wo/new', soonOr(2, lazy('./pages/maintenance.js', 'renderWoForm')), { nav: 'maintenance' });
  route('/maintenance/wo/:id', soonOr(2, lazy('./pages/maintenance.js', 'renderWorkOrder')), { nav: 'maintenance' });
  route('/repairs', soonOr(2, lazy('./pages/repairs.js', 'renderRepairList')), { nav: 'repairs' });
  route('/repairs/new', soonOr(2, lazy('./pages/repairs.js', 'renderReportForm')), { nav: 'repairs' });
  route('/repairs/:id', soonOr(2, lazy('./pages/repairs.js', 'renderRepair')), { nav: 'repairs' });
  route('/repairs/:id/edit', soonOr(2, lazy('./pages/repairs.js', 'renderReportForm')), { nav: 'repairs' });
  route('/alerts', lazy('./pages/alerts.js', 'renderAlerts'), { nav: 'alerts' });
  route('/alerts/month', lazy('./pages/alerts.js', 'renderMonth'), { nav: 'alerts' });
  route('/account', lazy('./pages/account.js', 'renderAccount'), { nav: 'account' });
  route('/account/drafts', lazy('./pages/drafts.js', 'renderDrafts'), { nav: 'account' });
  route('/account/conflict/:op', lazy('./pages/drafts.js', 'renderConflict'), { nav: 'account' });
  route('/poc', testOnly(lazy('./pages/misc.js', 'renderPocPage')), { nav: 'account' });
  route('/equipment', lazy('./pages/equipment.js', 'renderEquipmentList'), { nav: 'equipment' });
  route('/equipment/new', lazy('./pages/equipment.js', 'renderEquipmentForm'), { nav: 'equipment' });
  route('/equipment/:id', lazy('./pages/equipment.js', 'renderEquipment'), { nav: 'equipment' });
  route('/equipment/:id/edit', lazy('./pages/equipment.js', 'renderEquipmentForm'), { nav: 'equipment' });
  route('/materials', lazy('./pages/materials.js', 'renderMaterialList'), { nav: 'warehouse' });
  route('/materials/new', lazy('./pages/materials.js', 'renderMaterialForm'), { nav: 'warehouse' });
  route('/materials/:id', lazy('./pages/materials.js', 'renderMaterial'), { nav: 'warehouse' });
  route('/materials/:id/edit', lazy('./pages/materials.js', 'renderMaterialForm'), { nav: 'warehouse' });
  route('/inspections', lazy('./pages/inspections.js', 'renderInspectionList'), { nav: 'inspections' });
  route('/inspections/types', lazy('./pages/inspections.js', 'renderTypes'), { nav: 'inspections' });
  route('/inspections/new', lazy('./pages/inspections.js', 'renderRequirementForm'), { nav: 'inspections' });
  route('/inspections/record/:id', lazy('./pages/inspections.js', 'renderInspectionRecord'), { nav: 'inspections' });
  route('/inspections/:id', lazy('./pages/inspections.js', 'renderRequirement'), { nav: 'inspections' });
  route('/inspections/:id/edit', lazy('./pages/inspections.js', 'renderRequirementForm'), { nav: 'inspections' });
  route('/inspections/:id/submit', lazy('./pages/inspections.js', 'renderSubmitForm'), { nav: 'inspections' });
  route('/contracts', lazy('./pages/contracts.js', 'renderContractList'), { nav: 'contracts' });
  route('/contracts/new', lazy('./pages/contracts.js', 'renderContractForm'), { nav: 'contracts' });
  route('/contracts/:id', lazy('./pages/contracts.js', 'renderContract'), { nav: 'contracts' });
  route('/contracts/:id/edit', lazy('./pages/contracts.js', 'renderContractForm'), { nav: 'contracts' });
  route('/contracts/:id/renew', lazy('./pages/contracts.js', 'renderContractForm'), { nav: 'contracts' });
  route('/admin/gmail', lazy('./pages/gmail.js', 'renderGmail'), { nav: 'account' });
  route('/admin/users', lazy('./pages/admin.js', 'renderUsers'), { nav: 'account' });
  route('/admin/permissions', lazy('./pages/admin.js', 'renderPermissions'), { nav: 'account' });
  route('/admin/backup', lazy('./pages/admin.js', 'renderBackup'), { nav: 'account' });
  route('/admin/audit', lazy('./pages/admin.js', 'renderAudit'), { nav: 'account' });
  route('/admin/status', lazy('./pages/admin.js', 'renderStatus'), { nav: 'account' });
  route('/admin/catalog', lazy('./pages/catalog.js', 'renderCatalog'), { nav: 'account' });
  route('/admin/:page', lazy('./pages/misc.js', 'renderAdminInterim'), { nav: 'account' });
  route('/qr/:type/:id', lazy('./pages/misc.js', 'renderQrView'), { nav: '' });
  route('/print', lazy('./pages/misc.js', 'renderPrintLabels'), { nav: '' });
  route('/excel/:key', lazy('./pages/excel.js', 'renderExcel'), { nav: '' });
  route('/labels', testOnly(async (view, ctx) => { ctx.shell.setScreen({ title: 'screen.labels', back: '/poc' }); const m = await import('./poc.js'); return m.renderLabels(view); }), { nav: 'account' });
  for (const m of MODULES) if (m.dot > 2) route(m.path, lazy('./pages/misc.js', 'renderComingSoon'), { nav: m.key });
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
  setReleasedDot(b);
  if (!routesReady) { registerRoutes(); routesReady = true; }
  app.shell = mountShell(root, { env: b.env, onScan: scanAndOpen });
  app.shell.setSessionWarn(session.expires_at, () => app.onRelogin && app.onRelogin());
  await updateSyncStatus();
  lastWide = isWide();
  startRouter(renderRoute);
  await renderRoute();
  // Vào app khi có mạng (mở app, đăng nhập lại, đổi người dùng): gửi nháp của người này ở nền (4.7)
  if (!offline) sendMineInBackground();
}

async function hasMineQueued() {
  const uid = session.user && session.user.user_id;
  return !!uid && (await queueItems().catch(() => [])).some((o) => o.user_id === uid && o.dataset_epoch === session.epoch && o.state !== 'REJECTED' && o.state !== 'CONFLICT');
}

async function sendMineInBackground() {
  if (!navigator.onLine || !app.shell || !(await hasMineQueued())) return;
  refreshAfterSend(await syncNow({ quiet: true }));
}

// Đổi giữa bố cục iPhone và web khi xoay/kéo cửa sổ: vẽ lại màn hiện tại
window.addEventListener('resize', () => {
  if (!app.shell) return;
  const w = isWide();
  if (w !== lastWide) { lastWide = w; refresh(); }
});
// Trang Nháp/Tài khoản vẽ lại theo trạng thái mạng (nút Đồng bộ ngay bật/tắt, mục vừa gửi)
function refreshIfAccount() { if (app.shell && currentPath().startsWith('/account')) refresh(); }

// Màn xem (danh sách, chi tiết phiếu) có nhãn "Đã lưu trên máy": tự gửi nháp xong thì vẽ lại theo bản máy chủ.
// Không vẽ lại màn nhập (…/new, …/edit, Excel), khi đang mở hộp thoại hoặc đang gõ trong ô nhập (mất chữ chưa lưu).
const VIEW_PAGE = /^\/(work|maintenance|repairs|materials|maintenance\/(wo|plans)\/[^/]+|repairs\/[^/]+|equipment\/[^/]+|contracts\/[^/]+|inspections\/[^/]+)?$/;
function refreshAfterSend(r) {
  if (!app.shell) return;
  const path = currentPath();
  if (path.startsWith('/account')) { refresh(); return; }
  if (!r || !r.committed || !VIEW_PAGE.test(path) || /\/new$/.test(path) || document.querySelector('.modal')) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('.view')) return;
  refresh();
}

window.addEventListener('online', async () => {
  app.offline = false;
  await updateSyncStatus();
  // Có mạng lại: tự gửi nháp của người đang đăng nhập (4.7)
  const r = app.shell && await hasMineQueued() ? await syncNow({ quiet: true }) : null;
  refreshAfterSend(r);
});
window.addEventListener('offline', () => { updateSyncStatus(); refreshIfAccount(); });
