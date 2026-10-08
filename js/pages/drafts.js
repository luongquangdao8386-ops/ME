// CM-04 Nháp chờ đồng bộ (5.2) và Xử lý xung đột (5.2, 1.4 §14.3)
import { bi, biText, esc, fmtDateTime, fmtNumber, badge, session, L } from '../core.js';
import { ICON, toast, dialog, h, $ } from '../ui.js';
import { queueItems, exportBackup, deleteQueued, requeue } from '../sync.js';
import { app, syncNow } from '../app.js';
import { navigate } from '../router.js';
import { shareFileNow } from '../media.js';
import { daysBetween, today } from '../data.js';

const TABS = ['queued', 'failed', 'conflict', 'rejected', 'old'];
const TAB_LABEL = { queued: 'sync.queued', failed: 'sync.failed', conflict: 'sync.conflict', rejected: 'draft.rejected', old: 'draft.old_epoch' };
let curTab = 'queued';

function tabOf(o) {
  if (o.dataset_epoch !== session.epoch) return 'old';
  if (o.state === 'CONFLICT') return 'conflict';
  if (o.state === 'REJECTED') return 'rejected';
  if (o.last_code && !['UNKNOWN_RESULT', 'NETWORK_ERROR'].includes(o.last_code) && o.state === 'QUEUED') return 'failed';
  return 'queued';
}

function actionLabel(a) { return L['action.' + a] ? bi('action.' + a) : esc(a); }

function photoCount(o) {
  const p = o.payload || {};
  return (p.mime_type && /^image\//.test(p.mime_type) ? 1 : 0) + (Array.isArray(p.photos) ? p.photos.length : 0);
}

export async function renderDrafts(view, { shell }) {
  shell.setScreen({ title: 'draft.title', back: '/account' });
  const uid = session.user && session.user.user_id;
  const all = await queueItems();
  const mine = all.filter((o) => o.user_id === uid);
  const other = all.length - mine.length;
  const by = {};
  TABS.forEach((t) => { by[t] = []; });
  mine.forEach((o) => by[tabOf(o)].push(o));
  const online = navigator.onLine && !app.offline;
  const list = by[curTab];
  view.innerHTML = `<div class="chips tabs">${TABS.map((t) => `<button type="button" class="chip${t === curTab ? ' on' : ''}" data-tab="${t}">${bi(TAB_LABEL[t])} <span class="count">${by[t].length}</span></button>`).join('')}</div>
    ${other ? `<p class="muted small">${bi('draft.other_user', { N: other })}</p>` : ''}
    <div class="row"><button type="button" class="btn small primary" id="dr-sync" ${online ? '' : 'disabled'}>${ICON.sync}<span>${bi('btn.sync_now')}</span></button>
      <button type="button" class="btn small" id="dr-backup">${ICON.download}<span>${bi('btn.export_backup')}</span></button></div>
    ${online ? '' : `<p class="muted small">${bi('sync.need_network')}</p>`}
    <div class="cards">${list.map((o) => {
      const size = JSON.stringify(o.payload || {}).length;
      const n = photoCount(o);
      const left = curTab === 'old' ? Math.max(0, 30 - (daysBetween((o.rejected_at || o.local_created_at || '').slice(0, 10), today()) || 0)) : null;
      return `<div class="card rec-card" data-op="${esc(o.operation_id)}">
        <div class="rec-top"><strong>${actionLabel(o.action)}</strong>${badge('op_state.' + (o.state === 'SENDING' ? 'SENDING' : o.state))}</div>
        <div class="muted small">${o.result && o.result.display_code ? esc(o.result.display_code) : bi('tag.pending_code')} · ${bi('draft.created')}: ${esc(fmtDateTime(o.local_created_at))}</div>
        <div class="muted small">${n ? bi('draft.photos', { N: n }) + ' · ' : ''}${bi('draft.size')}: ${fmtNumber(Math.ceil(size / 1024))} KB${o.last_code ? ` · ${bi('draft.error_code')}: <code>${esc(o.last_code)}</code>` : ''}</div>
        ${(o.errors || []).map((e) => `<div class="err small">${esc(e.field || '')} ${esc(e.message_vi || e.code)} · ${esc(e.message_zh || '')}</div>`).join('')}
        ${left !== null ? `<div class="muted small">${bi('draft.auto_delete', { N: left })}</div>` : ''}
        <div class="row">
          ${curTab === 'failed' ? `<button type="button" class="btn tiny" data-retry="${esc(o.operation_id)}">${bi('btn.retry')}</button>` : ''}
          ${curTab === 'conflict' ? `<a class="btn tiny primary" href="#/account/conflict/${esc(o.operation_id)}">${bi('conflict.title')}</a>` : ''}
          ${curTab !== 'old' ? `<button type="button" class="btn tiny danger" data-del="${esc(o.operation_id)}">${ICON.trash}<span>${bi('btn.delete_draft')}</span></button>` : ''}
        </div></div>`;
    }).join('') || `<div class="card empty-state"><p class="muted">${bi('draft.empty')}</p></div>`}</div>`;
  const again = () => renderDrafts(view, { shell });
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { curTab = b.dataset.tab; again(); }));
  view.querySelector('#dr-sync').addEventListener('click', async (e) => { e.currentTarget.disabled = true; await syncNow(); again(); });
  view.querySelector('#dr-backup').addEventListener('click', async () => { const blob = await exportBackup(); shareFileNow(new File([blob], `me-du-phong-${Date.now()}.json`, { type: 'application/json' })); });
  view.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', async () => { await requeue(b.dataset.retry); await syncNow({ quiet: true }); again(); }));
  view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const ok1 = await dialog({ title: bi('btn.delete_draft'), body: `<p>${bi('draft.delete_confirm')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.delete_draft'), kind: 'danger', value: true }] });
    if (!ok1) return;
    const ok2 = await dialog({ title: bi('btn.delete_draft'), body: `<p><strong>${bi('draft.delete_confirm')}</strong></p>`, actions: [{ label: bi('btn.cancel'), kind: 'primary', value: false }, { label: bi('btn.delete_draft'), kind: 'danger', value: true }] });
    if (!ok2) return;
    await deleteQueued(b.dataset.del);
    again();
  }));
}

/* ---------------- Xử lý xung đột ---------------- */

/**
 * Hai cột "Bản của tôi" / "Bản máy chủ"; tô trường khác nhau. Không có nút ghi đè.
 * fields: [{key, label}] ; trả 'server' | 'edit' | null
 */
export async function conflictDialog({ mine, server, fields }) {
  const keys = (fields && fields.length ? fields : Object.keys(mine || {}).map((k) => ({ key: k, label: esc(k) })));
  const fmt = (v) => (v === null || v === undefined || v === '' ? `<span class="muted">${bi('field.not_set')}</span>` : esc(typeof v === 'object' ? JSON.stringify(v) : v));
  const shown = keys.filter((f) => mine && Object.prototype.hasOwnProperty.call(mine, f.key));
  const body = `<p class="muted small">${bi('conflict.help')}</p>
    ${server && server.updated_by_name || server && server.updated_at ? `<p class="small">${bi('conflict.by')}: <strong>${esc(server.updated_by_name || server.updated_by || '')}</strong> · ${bi('conflict.at')}: ${esc(fmtDateTime(server.updated_at))}</p>` : ''}
    <div class="table-wrap"><table class="tbl conflict"><thead><tr><th></th><th>${bi('conflict.mine')}</th><th>${bi('conflict.server')}</th></tr></thead>
    <tbody>${shown.map((f) => {
      const a = mine[f.key], b = server ? server[f.key] : undefined;
      const diff = String(a === undefined || a === null ? '' : a) !== String(b === undefined || b === null ? '' : b);
      return `<tr class="${diff ? 'diff' : ''}"><th>${f.label}</th><td>${fmt(a)}</td><td>${fmt(b)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  return dialog({
    title: bi('conflict.title'), body,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.use_server'), value: 'server' }, { label: bi('btn.edit_on_server'), kind: 'primary', value: 'edit' }]
  });
}

/** Mở từ ngăn Xung đột của CM-04 */
export async function renderConflict(view, { shell, params }) {
  shell.setScreen({ title: 'conflict.title', back: '/account/drafts' });
  const op = (await queueItems()).find((o) => o.operation_id === params.op);
  if (!op || op.state !== 'CONFLICT') { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const server = (op.conflict && op.conflict.server) || {};
  view.innerHTML = `<div class="card"><p><strong>${actionLabel(op.action)}</strong> · ${esc(fmtDateTime(op.local_created_at))}</p><div id="cf-box"></div>
    <div class="row"><button type="button" class="btn small" id="cf-backup">${bi('btn.export_backup')}</button>
    <button type="button" class="btn small" id="cf-server">${bi('btn.use_server')}</button>
    <button type="button" class="btn small primary" id="cf-edit">${bi('btn.edit_on_server')}</button></div></div>`;
  const mine = op.payload || {};
  const rows = Object.keys(mine).filter((k) => !/_id$|_b64$/.test(k)).map((k) => {
    const a = mine[k], b = server[k];
    const diff = String(a ?? '') !== String(b ?? '');
    return `<tr class="${diff ? 'diff' : ''}"><th>${esc(k)}</th><td>${esc(typeof a === 'object' ? JSON.stringify(a) : a ?? '')}</td><td>${esc(typeof b === 'object' ? JSON.stringify(b) : b ?? '')}</td></tr>`;
  }).join('');
  $('#cf-box', view).innerHTML = `<p class="muted small">${bi('conflict.help')}</p><div class="table-wrap"><table class="tbl conflict"><thead><tr><th></th><th>${bi('conflict.mine')}</th><th>${bi('conflict.server')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('#cf-backup', view).addEventListener('click', async () => { const blob = await exportBackup(); shareFileNow(new File([blob], `me-du-phong-${Date.now()}.json`, { type: 'application/json' })); });
  $('#cf-server', view).addEventListener('click', async () => {
    const ok = await dialog({ title: bi('btn.use_server'), body: `<p>${bi('conflict.use_server_confirm')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.use_server'), kind: 'primary', value: true }] });
    if (!ok) return;
    await deleteQueued(op.operation_id);
    navigate('/account/drafts', { replace: true });
  });
  $('#cf-edit', view).addEventListener('click', () => {
    // Đợt 1 hàng chờ chỉ có thao tác tạo mới; sửa trên bản máy chủ = mở hồ sơ để nhập lại như thao tác mới
    toast(bi('conflict.help'));
  });
}

export { h, biText };
