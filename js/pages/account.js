// Tài khoản (nav 5, 5.2): hồ sơ, đồng bộ, bảo mật (đổi PIN, phiên, đăng xuất), hướng dẫn, thông tin, quản trị theo quyền
import { bi, biText, esc, fmtDateTime, badge, session, api, resMsg, BUILD_VERSION, API_CONTRACT_VERSION } from '../core.js';
import { ICON, toast, dialog, askPin } from '../ui.js';
import { getMeta, queueItems, exportBackup } from '../sync.js';
import { reauth } from '../auth.js';
import { boot, roleLevel, isOwner, can } from '../data.js';
import { app, syncNow, updateSyncStatus } from '../app.js';
import { navigate } from '../router.js';
import { shareFileNow } from '../media.js';

/**
 * Gọi action loại PIN (4.7): thiếu/het hạn reauth_token → hỏi PIN (auth.reauth) rồi gửi lại cùng operation_id
 */
export async function callWithPin(action, payload = {}, opts = {}) {
  if (!navigator.onLine) return { ok: false, code: 'NETWORK_ERROR' };
  let r = await api(action, payload, opts);
  for (let i = 0; i < 3 && r.code === 'REAUTH_REQUIRED'; i++) {
    const pin = await askPin('auth.reauth');
    if (!pin) return r;
    const a = await reauth(pin);
    if (!a.ok) { toast(esc(resMsg(a)), 'err'); if (a.code === 'PIN_LOCKED') return a; continue; }
    r = await api(action, payload, { ...opts, operation_id: r.request && r.request.operation_id ? r.request.operation_id : opts.operation_id });
  }
  return r;
}

/** Đếm nháp theo ngăn của CM-04 */
export async function draftCounts() {
  const uid = session.user && session.user.user_id;
  const q = await queueItems().catch(() => []);
  const mine = q.filter((o) => o.user_id === uid);
  const cur = mine.filter((o) => o.dataset_epoch === session.epoch);
  return {
    queued: cur.filter((o) => !['CONFLICT', 'REJECTED'].includes(o.state)).length,
    conflict: cur.filter((o) => o.state === 'CONFLICT').length,
    rejected: cur.filter((o) => o.state === 'REJECTED').length,
    old: mine.filter((o) => o.dataset_epoch !== session.epoch).length,
    other: q.filter((o) => o.user_id !== uid).length,
    all: mine.length
  };
}

function row(label, value) { return `<div class="kv"><span>${label}</span><strong>${value}</strong></div>`; }

async function sessionsHtml() {
  if (!navigator.onLine) return `<p class="muted">${bi('sync.need_network')}</p>`;
  const r = await api('session.listOwn', {}, { retry: true });
  if (!r.ok) return `<p class="muted">${esc(resMsg(r))}</p>`;
  return `<ul class="list sessions">${r.data.items.map((s) => `<li>
    <div><strong>${esc(s.device_label || '—')}</strong>${s.current ? ` <span class="badge t-navy">${bi('account.this_device')}</span>` : ''}</div>
    <div class="muted small">${bi('account.issued')}: ${esc(fmtDateTime(s.issued_at))} · ${bi('account.last_seen')}: ${esc(fmtDateTime(s.last_seen_at))} · ${bi('account.expires')}: ${esc(fmtDateTime(s.expires_at))}</div>
    ${s.current ? '' : `<button type="button" class="btn tiny" data-revoke="${esc(s.session_id)}">${bi('btn.revoke')}</button>`}</li>`).join('')}</ul>`;
}

export async function renderAccount(view, { shell }) {
  shell.setScreen({ title: 'nav.account' });
  const b = await boot();
  const u = session.user || {};
  const lvl = roleLevel();
  const subs = (b.subroles || []);
  const last = await getMeta('last_sync');
  const dc = await draftCounts();
  const online = navigator.onLine && !app.offline;
  const needNet = online ? '' : 'disabled';
  const admin = [];
  if (await can('user.view')) admin.push(['admin.users', '/admin/users']);
  if (await can('permission.view')) admin.push(['admin.permissions', '/admin/permissions']);
  if (await can('location.edit') || await can('vendor.edit') || await can('lookup.edit') || await can('glossary.edit')) admin.push(['admin.catalog', '/admin/catalog']);
  if (await can('notify.log.view')) admin.push(['admin.gmail', '/admin/gmail']);
  if (await can('backup.view')) admin.push(['admin.backup', '/admin/backup']);
  if (await can('audit.view')) admin.push(['admin.audit', '/admin/audit']);
  if (await can('system.status')) admin.push(['admin.status', '/admin/status']);
  view.innerHTML = `
  <section class="card"><h2>${bi('account.profile')}</h2>
    ${row(bi('account.display_name'), esc(u.display_name || ''))}
    ${row(bi('employee_code'), `<span class="code">${esc(u.employee_code || '')}</span>`)}
    ${row(bi('account.level'), `${lvl ? badge('level.' + lvl) : ''}${isOwner() ? ' ' + badge('level.owner') : ''}`)}
    ${lvl === 2 ? row(bi('account.subroles'), subs.length ? subs.map((s) => bi('subrole.' + s)).join('<br>') : bi('account.no_subrole')) : ''}
  </section>
  <section class="card"><h2>${bi('account.sync')}</h2>
    ${row(bi('col.status'), `<span class="pill ${online ? 't-green' : 't-red'}">${bi(online ? 'sync.online' : 'sync.offline')}</span>`)}
    ${row(bi('sync.last'), esc(fmtDateTime(last) || biText('sync.never')))}
    <a class="kv link-row" href="#/account/drafts"><span>${bi('draft.title')}</span><strong>${bi('sync.queued')} ${dc.queued} · ${bi('sync.conflict')} ${dc.conflict} · ${bi('draft.rejected')} ${dc.rejected}${dc.old ? ` · ${bi('draft.old_epoch')} ${dc.old}` : ''} ${ICON.chevron}</strong></a>
    ${dc.other ? `<p class="muted small">${bi('draft.other_user', { N: dc.other })}</p>` : ''}
    <div class="row"><button type="button" class="btn small primary" id="ac-sync" ${needNet}>${ICON.sync}<span>${bi('btn.sync_now')}</span></button>
      <button type="button" class="btn small" id="ac-backup">${ICON.download}<span>${bi('btn.export_backup')}</span></button></div>
    ${online ? '' : `<p class="muted small">${bi('sync.need_network')}</p>`}
  </section>
  <section class="card"><h2>${bi('account.security')}</h2>
    <div class="row"><button type="button" class="btn small" id="ac-pin" ${needNet}>${ICON.lock}<span>${bi('btn.change_pin')}</span></button></div>
    <h3>${bi('account.sessions')}</h3><div id="ac-sessions"><div class="spinner small" aria-hidden="true"></div></div>
    <div class="row"><button type="button" class="btn small" id="ac-logout">${bi('btn.logout')}</button>
      <button type="button" class="btn small danger" id="ac-logout-all" ${needNet}>${bi('btn.logout_all')}</button></div>
    ${online ? '' : `<p class="muted small">${bi('sync.need_network')}</p>`}
  </section>
  <section class="card"><h2>${bi('account.guide')}</h2>
    <p>${bi('account.add_home')}</p><p>${bi('qr.scan_hint')}</p>
  </section>
  ${admin.length || isOwner() ? `<section class="card"><h2>${bi('account.admin')}</h2>
    ${admin.map(([k, p]) => `<a class="kv link-row" href="#${p}"><span>${bi(k)}</span>${ICON.chevron}</a>`).join('')}
    ${isOwner() && b.env === 'THU' ? `<a class="kv link-row" href="#/poc"><span>${bi('account.poc')}</span>${ICON.chevron}</a>` : ''}
    ${online ? '' : `<p class="muted small">${bi('sync.need_network')}</p>`}
  </section>` : ''}
  <section class="card"><h2>${bi('account.info')}</h2>
    ${row(bi('account.app_version'), esc(BUILD_VERSION))}
    ${row(bi('account.api_version'), esc(API_CONTRACT_VERSION))}
    ${row(bi('account.server_version'), esc(b.server_version || '—'))}
  </section>`;
  const on = (id, fn) => { const el = view.querySelector('#' + id); if (el) el.addEventListener('click', async () => { el.disabled = true; try { await fn(); } finally { el.disabled = false; } }); };
  on('ac-sync', async () => { await syncNow(); renderAccount(view, { shell }); });
  on('ac-backup', async () => { const blob = await exportBackup(); shareFileNow(new File([blob], `me-du-phong-${Date.now()}.json`, { type: 'application/json' })); });
  on('ac-pin', async () => { if (app.onChangePin) app.onChangePin(); });
  on('ac-logout', async () => { if (app.onLogout) await app.onLogout(); });
  on('ac-logout-all', async () => {
    const ok = await dialog({ title: bi('btn.logout_all'), body: `<p>${bi('auth.logout_all_confirm')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.logout_all'), kind: 'primary danger', value: true }] });
    if (!ok) return;
    const r = await callWithPin('auth.logoutAll', {});
    if (r.ok) { if (app.onRevoked) await app.onRevoked(); return; }
    if (r.code !== 'REAUTH_REQUIRED') toast(esc(resMsg(r)), 'err');
  });
  const box = view.querySelector('#ac-sessions');
  const paintSessions = async () => {
    box.innerHTML = await sessionsHtml();
    box.querySelectorAll('[data-revoke]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await api('session.revokeOwn', { session_id: btn.dataset.revoke });
      if (r.ok) { toast(bi('btn.revoke') + ' ✓', 'ok'); paintSessions(); } else { btn.disabled = false; toast(esc(resMsg(r)), 'err'); }
    }));
  };
  paintSessions();
  updateSyncStatus();
}

export { navigate };
