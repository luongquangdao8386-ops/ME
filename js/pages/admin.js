// Quản trị (5.2): Người dùng và PIN tạm, Phân quyền, Sao lưu, Nhật ký thao tác, Trạng thái hệ thống — cần mạng
import { api, bi, biText, esc, badge, fmtDateTime, fmtNumber, session, uuid, resMsg, APP_BASE_URL } from '../core.js';
import { $, $$, h, ICON, dialog, toast } from '../ui.js';
import { isWide } from '../shell.js';
import { roleLevel, isOwner, mapOf, CODE } from '../data.js';
import { textInput, selectInput, dateInput, wireForm, readField, showErrors, writeWithPin, busy } from '../form.js';
import { callWithPin } from './account.js';
import { handleWriteError } from './equipment.js';

const SUBROLES = ['KY_THUAT', 'DOC_DIEN_NUOC', 'HD_KD', 'THU_KHO', 'BAO_SU_CO'];
const MODULES = ['equipment', 'maintenance', 'repairs', 'warehouse', 'utilities', 'reports', 'circuits', 'contracts', 'inspections', 'catalog', 'users', 'notifications', 'audit', 'backup', 'system'];
const FLAGS = ['V', 'C', 'E', 'A', 'I', 'X', '$', 'R'];
const SUBROLE_MODULES = { KY_THUAT: ['equipment', 'warehouse', 'maintenance', 'repairs', 'circuits'], DOC_DIEN_NUOC: ['utilities'], HD_KD: ['contracts', 'inspections'], THU_KHO: ['warehouse'], BAO_SU_CO: ['repairs'] };

const moduleLabel = (m) => bi((['catalog', 'users', 'notifications', 'audit', 'backup', 'system'].includes(m) ? 'perm_module.' : 'module.') + m);
const errBox = (r) => `<div class="card">${esc(resMsg(r))}</div>`;
const spinner = '<div class="spinner" role="status"></div>';

/** Offline: màn quản trị chỉ hiện "Cần kết nối mạng" */
function offline(view) {
  if (navigator.onLine) return false;
  view.innerHTML = `<div class="card empty-state">${ICON.sync}<p class="muted">${bi('sync.need_network')}</p></div>`;
  return true;
}

async function confirmBox(titleKey, textKey, okKey = 'btn.confirm', kind = 'primary') {
  return dialog({ title: bi(titleKey), body: `<p>${bi(textKey)}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi(okKey), kind, value: true }] });
}

/** Hỏi một ô chữ (lý do…). Trả chuỗi hoặc null */
async function askText(titleKey, labelKey, { required = true } = {}) {
  const v = await dialog({
    title: bi(titleKey),
    body: `<label class="lbl">${bi(labelKey)}</label><input class="inp" id="ask-text" maxlength="300" autocomplete="off">`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.confirm'), kind: 'primary', read: (w) => $('#ask-text', w).value.trim() }]
  });
  if (v === null) return null;
  if (required && !v) { toast(bi('field.reason_required'), 'err'); return null; }
  return v;
}

/* ====================== Người dùng và PIN tạm ====================== */

function userStatus(u) {
  if (!u.active) return badge('user_status.DISABLED');
  const parts = [];
  if (u.pin_locked) parts.push(badge('adm.user.pin_locked'));
  parts.push(badge(u.must_change_pin ? 'user_status.MUST_CHANGE_PIN' : 'user_status.ACTIVE'));
  return parts.join(' ');
}
const levelText = (u) => bi('level.' + u.role_level) + (u.is_system_owner ? ` <span class="badge t-navy">${bi('level.owner')}</span>` : '');
const subText = (u) => (u.subroles || []).map((s) => bi('subrole.' + s)).join(', ');

/** PIN tạm: hiện một lần (3.6) */
async function showTempPin(code, pin, expires) {
  const hours = session.settings && session.settings.temp_pin_hours ? session.settings.temp_pin_hours : 72;
  await dialog({
    title: `${bi('adm.user.temp_pin_title')} · ${esc(code)}`,
    body: `<p class="temp-pin" aria-label="PIN">${esc(pin)}</p>
      <p class="banner warn">${bi('adm.user.temp_pin_once', { H: hours })}</p>
      ${expires ? `<p class="muted small">${bi('adm.user.temp_pin_until')}: ${esc(fmtDateTime(expires))}</p>` : ''}`,
    actions: [{ label: bi('btn.close'), kind: 'primary', value: true }]
  });
}

function roleFields(rec) {
  const lv = String(rec.role_level || 1);
  return `${selectInput('role_level', 'account.level', [1, 2, 3, 4].map((n) => [String(n), bi('level.' + n)]), lv, { empty: '' })}
    <div class="fld" data-field="subroles" id="sub-wrap"${lv === '2' ? '' : ' hidden'}><label>${bi('account.subroles')}</label>
      ${SUBROLES.map((s) => `<label class="check"><input type="checkbox" data-sub="${s}"${(rec.subroles || []).includes(s) ? ' checked' : ''}><span>${bi('subrole.' + s)}</span></label>`).join('')}
      <div class="ferr" role="alert"></div></div>`;
}
function wireRole(wrap) {
  $('#f-role_level', wrap).addEventListener('change', (e) => { $('#sub-wrap', wrap).hidden = e.target.value !== '2'; });
}
function readRole(wrap) {
  const lvl = Number(readField(wrap, 'role_level'));
  return { role_level: lvl, subroles: lvl === 2 ? $$('[data-sub]', wrap).filter((i) => i.checked).map((i) => i.dataset.sub) : [] };
}

/** Thêm người dùng (C4, PIN) */
async function addUserDialog() {
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('adm.user.add')}</h2>
    ${textInput('employee_code', 'adm.user.code', '', { required: true, maxlength: 40, upper: true })}
    ${textInput('display_name', 'account.display_name', '', { required: true, maxlength: 80 })}
    ${textInput('email', 'adm.user.email', '', { maxlength: 120, inputmode: 'email' })}
    ${roleFields({ role_level: 1 })}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  wireRole(wrap);
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const p = { user_id: uuid(), employee_code: readField(wrap, 'employee_code'), display_name: readField(wrap, 'display_name'), email: readField(wrap, 'email'), ...readRole(wrap) };
      const errs = [];
      if (!p.employee_code) errs.push({ field: 'employee_code', key: 'field.required' });
      if (!p.display_name) errs.push({ field: 'display_name', key: 'field.required' });
      if (errs.length) { showErrors(wrap, errs); return; }
      busy(ev.currentTarget, true);
      const res = await writeWithPin('user.create', p);
      busy(ev.currentTarget, false);
      if (res.ok) {
        wrap.remove();
        if (res.data && res.data.temp_pin) await showTempPin(res.data.employee_code, res.data.temp_pin, res.data.temp_pin_expires_at);
        resolve(true); return;
      }
      if (res.code === 'VALIDATION_ERROR') { showErrors(wrap, res.errors); return; }
      wrap.remove();
      if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
      resolve(false);
    });
  });
}

/** Đổi cấp/vai trò (C4, PIN) */
async function setRoleDialog(u) {
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('btn.set_role')} · ${esc(u.employee_code)}</h2>
    ${textInput('display_name', 'account.display_name', u.display_name, { required: true, maxlength: 80 })}
    ${textInput('email', 'adm.user.email', u.email || '', { maxlength: 120, inputmode: 'email' })}
    ${roleFields(u)}
    <p class="muted small">${bi('adm.user.role_note')}</p>
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  wireRole(wrap);
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const p = { user_id: u.user_id, display_name: readField(wrap, 'display_name'), email: readField(wrap, 'email'), ...readRole(wrap) };
      busy(ev.currentTarget, true);
      const res = await writeWithPin('user.setRole', p, { expected_version: u.record_version });
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { showErrors(wrap, res.errors); return; }
      wrap.remove();
      if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
      resolve(false);
    });
  });
}

async function userAction(u, kind) {
  let payload = { user_id: u.user_id };
  if (kind === 'lock') {
    const reason = await askText('btn.lock', 'field.reason');
    if (!reason) return false;
    payload.reason = reason;
  } else if (kind === 'reset' && !await confirmBox('btn.reset_pin', 'adm.user.confirm_reset')) return false;
  else if (kind === 'revoke' && !await confirmBox('btn.revoke_sessions', 'adm.user.confirm_revoke')) return false;
  const action = { lock: 'user.lock', unlock: 'user.unlock', reset: 'user.resetPin', revoke: 'user.revokeSessions' }[kind];
  const res = await writeWithPin(action, payload, { expected_version: u.record_version });
  if (res.ok) {
    if (res.data && res.data.temp_pin) await showTempPin(u.employee_code, res.data.temp_pin, res.data.temp_pin_expires_at);
    else toast(bi('form.saved'), 'ok');
    return true;
  }
  if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  return false;
}

export async function renderUsers(view, { shell }) {
  shell.setScreen({ title: 'admin.users', back: '/account' });
  if (offline(view)) return;
  view.innerHTML = spinner;
  const r = await api('user.view', {}, { retry: true });
  if (!r.ok) { view.innerHTML = errBox(r); return; }
  const c4 = roleLevel() >= 4;
  const me = r.data.me;
  const items = r.data.items;
  const repaint = () => renderUsers(view, { shell });
  const canAct = (u) => c4 && u.user_id !== me && (!u.is_system_owner || isOwner());
  const note = (u) => (u.user_id === me ? `<span class="muted small">${bi('adm.user.self_note')}</span>` : (u.is_system_owner && !isOwner() ? `<span class="muted small">${bi('adm.user.owner_note')}</span>` : ''));
  const actions = (u) => (canAct(u) ? `<div class="row">
      <button type="button" class="btn small" data-act="role" data-id="${esc(u.user_id)}">${ICON.edit}${bi('btn.set_role')}</button>
      <button type="button" class="btn small" data-act="reset" data-id="${esc(u.user_id)}">${bi('btn.reset_pin')}</button>
      ${u.active && !u.pin_locked ? `<button type="button" class="btn small" data-act="lock" data-id="${esc(u.user_id)}">${bi('btn.lock')}</button>` : `<button type="button" class="btn small" data-act="unlock" data-id="${esc(u.user_id)}">${bi('btn.unlock')}</button>`}
      ${u.active ? `<button type="button" class="btn small" data-act="revoke" data-id="${esc(u.user_id)}">${bi('btn.revoke_sessions')}</button>` : ''}</div>` : note(u));
  const body = isWide()
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('adm.user.code')}</th><th>${bi('account.display_name')}</th><th>${bi('account.level')}</th><th>${bi('account.subroles')}</th><th>${bi('col.status')}</th>${c4 ? `<th>${bi('adm.user.last_login')}</th><th>${bi('adm.user.sessions')}</th>` : ''}<th>${bi('col.actions')}</th></tr></thead>
      <tbody>${items.map((u) => `<tr><td class="code">${esc(u.employee_code)}</td><td>${esc(u.display_name)}${u.email ? `<div class="muted small">${esc(u.email)}</div>` : ''}</td><td>${levelText(u)}</td><td>${subText(u)}</td><td>${userStatus(u)}</td>
        ${c4 ? `<td>${esc(fmtDateTime(u.last_login_at) || '—')}</td><td>${u.active_sessions || 0}</td>` : ''}<td>${actions(u)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="cards">${items.map((u) => `<div class="card rec-card"><div class="rec-top"><span class="code">${esc(u.employee_code)}</span><span>${levelText(u)}</span></div>
        <div class="rec-name">${esc(u.display_name)}</div>${u.subroles.length ? `<div class="muted small">${subText(u)}</div>` : ''}
        <div class="rec-badges">${userStatus(u)}</div>
        ${c4 ? `<div class="muted small">${bi('adm.user.last_login')}: ${esc(fmtDateTime(u.last_login_at) || '—')} · ${bi('adm.user.sessions')}: ${u.active_sessions || 0}</div>` : ''}
        <div class="rec-actions">${actions(u)}</div></div>`).join('')}</div>`;
  view.innerHTML = `<div class="toolbar"><div class="row"><span class="muted">${bi('adm.user.total', { N: items.length })}</span>
    ${c4 ? `<button type="button" class="btn small primary" id="u-add">${ICON.plus}${bi('adm.user.add')}</button>` : ''}</div></div>${body}`;
  if (c4) $('#u-add', view).addEventListener('click', async () => { if (await addUserDialog()) repaint(); });
  $$('[data-act]', view).forEach((b) => b.addEventListener('click', async () => {
    const u = items.find((x) => x.user_id === b.dataset.id);
    if (!u) return;
    const done = b.dataset.act === 'role' ? await setRoleDialog(u) : await userAction(u, b.dataset.act);
    if (done) repaint();
  }));
}

/* ====================== Phân quyền ====================== */

export async function renderPermissions(view, { shell }) {
  shell.setScreen({ title: 'admin.permissions', back: '/account' });
  if (offline(view)) return;
  view.innerHTML = spinner;
  const r = await callWithPin('permission.view', {});
  if (!r.ok) { view.innerHTML = errBox(r); return; }
  const rows = r.data.rows;
  const cell = (lvl, m) => rows.find((x) => x.role_level === lvl && x.module === m);
  const want = new Map(rows.map((x) => [x.role_level + '|' + x.module, x.flags]));
  const changed = () => rows.filter((x) => want.get(x.role_level + '|' + x.module) !== x.flags);
  const chip = (x, f) => {
    const on = want.get(x.role_level + '|' + x.module).includes(f);
    const locked = x.locked.includes(f);
    const allowed = x.ceiling.includes(f) && !locked;
    if (!on && !allowed) return '';
    return `<button type="button" class="pf${on ? ' on' : ''}${allowed ? '' : ' lock'}" data-cell="${x.role_level}|${x.module}" data-f="${esc(f)}" aria-pressed="${on}" title="${esc(biText(locked ? 'adm.perm.locked' : allowed ? 'perm_flag.' + f : 'adm.perm.ceiling'))}">${esc(f)}</button>`;
  };
  view.innerHTML = `<p class="banner warn">${bi('adm.perm.review_note')}</p>
    <p class="muted small">${bi('adm.perm.legend')}</p>
    <div class="table-wrap"><table class="tbl perm"><thead><tr><th>${bi('adm.perm.module')}</th>${[1, 2, 3, 4].map((l) => `<th>C${l} · ${bi('level.' + l)}</th>`).join('')}</tr></thead>
      <tbody>${MODULES.map((m) => `<tr><th scope="row">${moduleLabel(m)}</th>${[1, 2, 3, 4].map((l) => { const x = cell(l, m); return `<td>${x ? FLAGS.map((f) => chip(x, f)).join('') : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="row"><span class="muted" id="p-unsaved"></span><button type="button" class="btn primary" id="p-save" disabled>${bi('btn.save')}</button></div>
    <section class="card"><h2>${bi('adm.perm.subrole_map')}</h2>${SUBROLES.map((s) => `<div class="kv"><span>${bi('subrole.' + s)}</span><strong>${SUBROLE_MODULES[s].map(moduleLabel).join(', ')}</strong></div>`).join('')}</section>`;
  const upd = () => {
    const n = changed().length;
    $('#p-unsaved', view).innerHTML = n ? bi('adm.perm.unsaved', { N: n }) : '';
    $('#p-save', view).disabled = !n;
  };
  $$('.pf', view).forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('lock')) { toast(b.title, ''); return; }
    const k = b.dataset.cell, f = b.dataset.f;
    let cur = want.get(k);
    cur = cur.includes(f) ? cur.replace(f, '') : FLAGS.filter((x) => cur.includes(x) || x === f).join('');
    want.set(k, cur);
    b.classList.toggle('on', cur.includes(f));
    b.setAttribute('aria-pressed', String(cur.includes(f)));
    upd();
  }));
  $('#p-save', view).addEventListener('click', async (ev) => {
    const reason = await askText('btn.save', 'field.reason');
    if (!reason) return;
    const changes = changed().map((x) => ({ role_level: x.role_level, module: x.module, flags: want.get(x.role_level + '|' + x.module) }));
    busy(ev.currentTarget, true);
    const res = await writeWithPin('permission.edit', { changes, reason });
    busy(ev.currentTarget, false);
    if (res.ok) { toast(bi('adm.perm.saved'), 'ok'); renderPermissions(view, { shell }); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  });
}

/* ====================== Sao lưu ====================== */

const WEEKDAY = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 };
const bkErr = (e) => (e === 'NO_MANIFEST' ? bi('adm.backup.no_manifest') : esc(e));

export async function renderBackup(view, { shell }) {
  shell.setScreen({ title: 'admin.backup', back: '/account' });
  if (offline(view)) return;
  if (!view.querySelector('.bk')) view.innerHTML = spinner;
  const r = await api('backup.view', {}, { retry: true });
  if (!r.ok) { view.innerHTML = errBox(r); return; }
  const d = r.data;
  const restored = d.last_restore_at ? `<p class="banner info">${bi('adm.backup.restored', { T: fmtDateTime(d.last_restore_at), R: d.restored_from_ref })}</p>` : '';
  const list = d.items.length ? (isWide()
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('adm.backup.time')}</th><th>${bi('col.status')}</th><th>${bi('adm.backup.rows')}</th><th>${bi('adm.backup.docs')}</th><th></th></tr></thead>
      <tbody>${d.items.map((b) => `<tr><td>${esc(fmtDateTime(b.created_at) || b.ref)}</td><td>${badge('backup_status.' + b.status)}</td><td>${esc(fmtNumber(b.rows))}</td><td>${esc(fmtNumber(b.documents))}</td>
        <td class="muted small">${b.retry ? bi('adm.backup.retry') : ''}${b.error ? ' ' + bkErr(b.error) : ''}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="cards">${d.items.map((b) => `<div class="card rec-card"><div class="rec-top"><span>${esc(fmtDateTime(b.created_at) || b.ref)}</span>${badge('backup_status.' + b.status)}</div>
        <div class="muted small">${bi('adm.backup.rows')}: ${esc(fmtNumber(b.rows))} · ${bi('adm.backup.docs')}: ${esc(fmtNumber(b.documents))}${b.retry ? ' · ' + bi('adm.backup.retry') : ''}${b.error ? ' · ' + bkErr(b.error) : ''}</div></div>`).join('')}</div>`)
    : `<p class="muted">${bi('adm.backup.none')}</p>`;
  view.innerHTML = `<div class="bk">${restored}
    <section class="card"><h2>${bi('adm.backup.last')}</h2>
      <p>${d.last_backup_at ? `${esc(fmtDateTime(d.last_backup_at))} ${badge('backup_status.' + (d.last_backup_status || 'FAILED'))}` : bi('adm.backup.none')}</p>
      <p class="muted small">${bi('adm.backup.note', { D: biText('weekday.' + (WEEKDAY[d.backup_weekday] || 7)), H: String(d.backup_hour).padStart(2, '0'), N: d.keep_count })}</p>
      ${d.queued || d.running ? `<p class="banner info" id="bk-queued">${bi(d.queued ? 'adm.backup.queued' : 'adm.backup.running')}</p>` : `<button type="button" class="btn primary" id="bk-run">${bi('btn.backup_now')}</button>`}
    </section>${list}</div>`;
  const run = $('#bk-run', view);
  if (run) run.addEventListener('click', async (ev) => {
    busy(ev.currentTarget, true);
    const res = await writeWithPin('backup.run', {});
    busy(ev.currentTarget, false);
    if (res.ok) renderBackup(view, { shell }); else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  });
  // Hỏi lại mỗi 5 giây tới khi xong (3.15); dừng khi rời màn
  if (d.queued || d.running) setTimeout(() => { if (view.isConnected && $('#bk-queued', view)) renderBackup(view, { shell }); }, 5000);
}

/* ====================== Nhật ký thao tác ====================== */

const auditFilt = { tab: 'ops', module: '', from: '', to: '' };

function jsonLines(o) {
  if (!o || typeof o !== 'object') return '';
  return Object.keys(o).map((k) => `<div><span class="muted">${esc(k)}:</span> ${esc(typeof o[k] === 'object' ? JSON.stringify(o[k]) : String(o[k]))}</div>`).join('');
}

async function codeLookup() {
  const out = new Map();
  for (const t of ['EQUIPMENT', 'MATERIAL', 'CONTRACT', 'INSPECTION_REQUIREMENT', 'INSPECTION', 'LOCATION', 'VENDOR']) {
    for (const [id, rec] of await mapOf(t)) out.set(id, rec[CODE[t]]);
  }
  return out;
}

export async function renderAudit(view, { shell }) {
  shell.setScreen({ title: 'admin.audit', back: '/account' });
  if (offline(view)) return;
  const c4 = roleLevel() >= 4;
  if (!c4) auditFilt.tab = 'ops';
  const tabs = `<div class="tabs-bar" role="tablist">${['ops', ...(c4 ? ['auth'] : [])].map((t) => `<button type="button" role="tab" class="tab${auditFilt.tab === t ? ' on' : ''}" data-tab="${t}" aria-selected="${auditFilt.tab === t}">${bi('adm.audit.tab_' + t)}</button>`).join('')}</div>`;
  view.innerHTML = tabs + spinner;
  const wireTabs = () => $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => { auditFilt.tab = b.dataset.tab; renderAudit(view, { shell }); }));
  if (auditFilt.tab === 'auth') {
    const r = await callWithPin('audit.auth', {});
    if (!r.ok) { view.innerHTML = tabs + errBox(r); wireTabs(); return; }
    const d = r.data;
    view.innerHTML = `${tabs}<section class="card tab-body"><h2>${bi('adm.audit.sessions')}</h2>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('adm.audit.user')}</th><th>${bi('account.this_device')}</th><th>${bi('account.issued')}</th><th>${bi('account.last_seen')}</th><th>${bi('account.expires')}</th></tr></thead>
      <tbody>${d.sessions.map((s) => `<tr><td>${esc(s.user)}</td><td>${esc(s.device_label || '—')}</td><td>${esc(fmtDateTime(s.issued_at))}</td><td>${esc(fmtDateTime(s.last_seen_at))}</td><td>${esc(fmtDateTime(s.expires_at))}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card"><h2>${bi('adm.audit.attempts')}</h2>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('adm.audit.time')}</th><th>${bi('adm.audit.action')}</th><th>${bi('col.status')}</th><th>${bi('adm.audit.user')}</th></tr></thead>
      <tbody>${d.attempts.map((a) => `<tr><td>${esc(fmtDateTime(a.occurred_at, true))}</td><td>${bi('auth_kind.' + a.attempt_kind)}</td><td>${badge('auth_outcome.' + a.outcome)}</td><td>${esc(a.user || '—')}</td></tr>`).join('')}</tbody></table></div></section>`;
    wireTabs();
    return;
  }
  const payload = {};
  if (auditFilt.module) payload.module = auditFilt.module;
  if (auditFilt.from) payload.from = auditFilt.from;
  if (auditFilt.to) payload.to = auditFilt.to;
  const r = await api('audit.view', payload, { retry: true });
  if (!r.ok) { view.innerHTML = tabs + errBox(r); wireTabs(); return; }
  const codes = await codeLookup();
  const mods = MODULES.filter((m) => c4 || !['users', 'system'].includes(m));
  const ent = (a) => esc(codes.get(a.entity_id) || (a.entity_id ? a.entity_type : ''));
  const items = r.data.items;
  view.innerHTML = `${tabs}<div class="filters tab-body"><div class="row">
      <select class="sel" id="a-mod"><option value="">${bi('adm.audit.module_all')}</option>${mods.map((m) => `<option value="${m}"${auditFilt.module === m ? ' selected' : ''}>${moduleLabel(m)}</option>`).join('')}</select>
      </div><div class="form-grid">${dateInput('a_from', 'adm.audit.from', auditFilt.from)}${dateInput('a_to', 'adm.audit.to', auditFilt.to)}</div>
      <div class="row"><button type="button" class="btn small" id="a-apply">${ICON.search}${bi('btn.filter')}</button></div></div>
    <div class="cards audit">${items.map((a) => `<details class="card rec-card"><summary><div class="rec-top"><span>${esc(fmtDateTime(a.occurred_at, true))}</span><span class="code">${ent(a)}</span></div>
        <div class="rec-name"><span class="muted small">${moduleLabel(a.module)}</span> <code>${esc(a.action)}</code></div>
        <div class="muted small">${bi('adm.audit.user')}: ${esc(a.user_name)}${a.reason ? ` · ${bi('field.reason')}: ${esc(a.reason)}` : ''}</div></summary>
        <div class="kv-grid small"><div><strong>${bi('adm.audit.before')}</strong>${jsonLines(a.before_json) || '—'}</div><div><strong>${bi('adm.audit.after')}</strong>${jsonLines(a.after_json) || '—'}</div></div></details>`).join('') || `<p class="muted">${bi('home.none')}</p>`}</div>
    ${r.data.more ? `<p class="muted small">${bi('adm.audit.more')}</p>` : ''}`;
  wireTabs();
  const re = () => renderAudit(view, { shell });
  $('#a-mod', view).addEventListener('change', (e) => { auditFilt.module = e.target.value; re(); });
  wireForm(view);
  $('#a-apply', view).addEventListener('click', () => {
    const f = readField(view, 'a_from'), t = readField(view, 'a_to');
    if (f === null || t === null) { toast(bi('field.invalid_date'), 'err'); return; }
    auditFilt.from = f || ''; auditFilt.to = t || ''; re();
  });
}

/* ====================== Trạng thái hệ thống ====================== */

function settingValue(s) {
  if (s.type === 'BOOL') return s.value ? '✓' : '✗';
  if (s.type === 'JSON') return esc(JSON.stringify(s.value));
  if (s.type === 'INT' || s.type === 'NUMBER') return esc(fmtNumber(s.value));
  return esc(String(s.value ?? ''));
}

async function editSetting(s) {
  let input;
  if (s.type === 'BOOL') input = `<label class="check"><input type="checkbox" id="f-v"${s.value ? ' checked' : ''}><span>${esc(s.key)}</span></label>`;
  else if (s.options) input = `<select class="inp sel" id="f-v">${s.options.map((o) => `<option${o === s.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (s.type === 'JSON') input = `<textarea class="inp" id="f-v" rows="3">${esc(JSON.stringify(s.value))}</textarea>`;
  else input = `<input class="inp" id="f-v" value="${esc(String(s.value ?? ''))}" ${s.type === 'INT' || s.type === 'NUMBER' ? 'inputmode="decimal"' : ''} autocomplete="off">`;
  const v = await dialog({
    title: bi('adm.status.edit_setting'),
    body: `<p><strong>${esc(s.description_vi)} · ${esc(s.description_zh)}</strong></p><p class="muted small"><code>${esc(s.key)}</code>${s.bounds ? ` · ${esc(s.bounds[0])}–${esc(s.bounds[1])}` : ''} · ${bi('adm.status.default')}: ${esc(JSON.stringify(s.default_value))}</p>
      ${input}<label class="lbl">${bi('field.reason')}</label><input class="inp" id="f-r" maxlength="300">`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (w) => {
      const el = $('#f-v', w);
      let val = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (s.type === 'INT' || s.type === 'NUMBER') val = Number(String(val).replace(/[\s  ]/g, '').replace(',', '.'));
      if (s.type === 'JSON') { try { val = JSON.parse(val); } catch (e) { val = '__bad__'; } }
      return { val, reason: $('#f-r', w).value.trim() };
    } }]
  });
  if (!v) return false;
  const res = await writeWithPin('settings.edit', { changes: { [s.key]: v.val }, reason: v.reason });
  if (res.ok) { toast(bi('form.saved'), 'ok'); return true; }
  if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  return false;
}

export async function renderStatus(view, { shell }) {
  shell.setScreen({ title: 'admin.status', back: '/account' });
  if (offline(view)) return;
  view.innerHTML = spinner;
  const r = await api('system.status', {}, { retry: true });
  if (!r.ok) { view.innerHTML = errBox(r); return; }
  const d = r.data;
  const checks = d.checks.map((c) => {
    let ok = c.status === 'OK', note = c.note ? esc(c.note) : '';
    if (c.key === 'app_base_url' && c.value && c.value !== APP_BASE_URL) { ok = false; note = bi('adm.status.base_mismatch', { U: APP_BASE_URL }); }
    let val = c.value;
    if (c.key === 'spreadsheet_cells' || c.key === 'mail_quota') val = fmtNumber(Number(c.value));
    if (/paused_until$/.test(c.key)) val = c.value ? fmtDateTime(c.value) : '—';
    return `<tr><td>${bi('health.' + c.key)}</td><td>${badge(ok ? 'adm.status.ok' : 'adm.status.warn')}</td><td>${esc(String(val === '' ? '—' : val))}${note ? `<div class="muted small">${note}</div>` : ''}</td></tr>`;
  }).join('');
  view.innerHTML = `<section class="card"><p class="muted small">${bi('adm.status.checked_at', { T: fmtDateTime(d.checked_at) })} · ${bi('adm.status.maint_note')}</p>
      <div class="table-wrap"><table class="tbl"><tbody>${checks}</tbody></table></div></section>
    <section class="card"><h2>${bi('adm.status.settings')}</h2>
      <div class="table-wrap"><table class="tbl settings"><tbody>${d.settings.map((s) => `<tr><td>${esc(s.description_vi)} · ${esc(s.description_zh)}<div class="muted small"><code>${esc(s.key)}</code></div></td>
        <td>${settingValue(s)}</td><td>${s.readonly ? badge('adm.status.readonly') : `<button type="button" class="btn small" data-set="${esc(s.key)}">${ICON.edit}${bi('btn.edit')}</button>`}</td></tr>`).join('')}</tbody></table></div></section>`;
  $$('[data-set]', view).forEach((b) => b.addEventListener('click', async () => {
    const s = d.settings.find((x) => x.key === b.dataset.set);
    if (s && await editSetting(s)) renderStatus(view, { shell });
  }));
}

