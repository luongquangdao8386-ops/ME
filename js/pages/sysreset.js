// Đợt 4 — Xóa sạch dữ liệu vận hành (1.4 §21.4, phụ lục 1.5 mục 5.2 SYS-RESET-01..03, 6.9.3). Chỉ owner, cần mạng, không logo.
// 01 Dữ liệu hệ thống (trong khung app) → 02 Xem trước và xác nhận (PIN + "XÓA TOÀN BỘ" + chế độ file, 10 phút)
// → 03 Tiến độ: trang riêng ngoài khung app (đang bảo trì, phiên phục hồi), hỏi lại mỗi 5 giây; lỗi → Tiếp tục / Hủy; xong → Đăng nhập lại.
import { api, bi, biText, esc, badge, fmtDateTime, fmtNumber, resMsg } from '../core.js';
import { $, $$, ICON, dialog, toast } from '../ui.js';
import { isOwner } from '../data.js';
import { busy, evBtn } from '../form.js';
import { navigate } from '../router.js';
import { app } from '../app.js';

const GROUPS = ['catalog', 'work', 'utilities', 'contracts', 'reports', 'alerts', 'qr', 'documents'];
const MODES = ['KEEP', 'TRASH', 'DELETE'];
const STEPS = ['PREPARE', 'BACKUP', 'DELETE', 'VERIFY', 'DONE'];
const CONFIRM = 'XÓA TOÀN BỘ';
const GUIDE_URL = 'https://github.com/luongquangdao8386-ops/ME/blob/main/HUONG_DAN_TRIEN_KHAI.md';
const ACTIVE = new Set(['LOCKED', 'BACKING_UP', 'RESETTING', 'VERIFYING']);

const spinner = '<div class="spinner" role="status"></div>';
const need = (view) => {
  if (!navigator.onLine) { view.innerHTML = `<div class="card empty-state">${ICON.sync}<p class="muted">${bi('sync.need_network')}</p></div>`; return true; }
  if (!isOwner()) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return true; }
  return false;
};
const confirmOk = (s) => String(s || '').normalize('NFC').trim() === CONFIRM.normalize('NFC');
const groupRows = (counts) => `<ul class="list rs-groups">${GROUPS.map((g) => `<li class="kv"><span>${bi('reset.group.' + g)}</span><strong>${bi('reset.records', { N: fmtNumber(Number(counts[g] || 0)) })}</strong></li>`).join('')}</ul>`;
const filesLine = (f) => `<p class="muted small">${bi('reset.files_line', { N: fmtNumber(Number(f.app || 0)), S: fmtNumber(Number(f.shared || 0)), E: fmtNumber(Number(f.external || 0)) })}</p>`;
const guideLink = () => `<p class="muted small">${bi('reset.restore_note')} · <a href="${GUIDE_URL}" target="_blank" rel="noopener noreferrer">${bi('reset.restore_link')}</a></p>`;

/* ====================== SYS-RESET-01 Dữ liệu hệ thống ====================== */

export async function renderSystemData(view, { shell }) {
  shell.setScreen({ title: 'admin.system_data', back: '/account' });
  if (need(view)) return;
  view.innerHTML = spinner;
  const r = await api('system.reset.status', { overview: true, advance: false }, { retry: true });
  if (!r.ok) { view.innerHTML = `<div class="card">${esc(resMsg(r))}</div>`; return; }
  const o = r.data.overview || {};
  const run = r.data.run;
  const open = run && (ACTIVE.has(run.status) || run.status === 'FAILED_NEEDS_RECOVERY');
  view.innerHTML = `<div class="rs-page">
    ${open ? `<section class="card"><p class="banner warn">${bi('reset.open_run')} ${badge('reset_status.' + run.status)}</p>
      <button type="button" class="btn primary" id="rs-progress">${bi('reset.view_progress')}</button></section>` : ''}
    <section class="card"><h2>${bi('reset.epoch')}</h2>
      <p><span class="code big">${esc(o.epoch_short || '')}</span></p>
      <p class="muted small">${bi('reset.epoch_since')}: ${o.epoch_since ? esc(fmtDateTime(o.epoch_since)) : bi('reset.epoch_since_setup')}</p></section>
    <section class="card"><h2>${bi('reset.data_title')}</h2>${groupRows(o.groups || {})}${filesLine(o.files || {})}</section>
    <section class="card"><h2>${bi('reset.last_backup')}</h2>
      <p>${o.last_backup_at ? `${esc(fmtDateTime(o.last_backup_at))} ${badge('backup_status.' + (o.last_backup_status || 'FAILED'))}` : bi('adm.backup.none')}</p>
      ${o.last_backup_ref ? `<p class="muted small">${esc(o.last_backup_ref)}</p>` : ''}
      <a class="btn" href="#/admin/backup">${bi('btn.backup_now')}</a></section>
    <section class="card"><h2>${bi('reset.last_reset')}</h2>
      <p>${o.last_reset ? `${esc(fmtDateTime(o.last_reset.completed_at))}${o.last_reset.backup_ref ? ` · <span class="muted small">${bi('reset.backup_ref', { R: esc(o.last_reset.backup_ref) })}</span>` : ''}` : bi('reset.never')}</p></section>
    <section class="card rs-danger">
      <p class="muted small">${bi('reset.qr_warning')}</p>
      <button type="button" class="btn danger" id="rs-start" ${open ? 'disabled' : ''}>${ICON.trash || ''}<span>${bi('reset.btn_reset')}</span></button>
      ${guideLink()}</section></div>`;
  const st = $('#rs-start', view);
  if (st) st.addEventListener('click', () => navigate('/admin/system-data/reset'));
  const pg = $('#rs-progress', view);
  if (pg) pg.addEventListener('click', () => app.onResetProgress && app.onResetProgress(run.reset_run_id));
}

/* ====================== SYS-RESET-02 Xem trước và xác nhận ====================== */

export async function renderResetConfirm(view, { shell }) {
  shell.setScreen({ title: 'reset.preview_title', back: '/admin/system-data' });
  if (need(view)) return;
  view.innerHTML = spinner;
  const r = await api('system.reset.preview', {});
  if (!r.ok) { view.innerHTML = `<div class="card">${esc(resMsg(r))}</div>`; return; }
  const d = r.data;
  if (d.open_run) {
    view.innerHTML = `<section class="card"><p class="banner warn">${bi('reset.open_run')} ${badge('reset_status.' + d.open_run.status)}</p>
      <button type="button" class="btn primary" id="rs-progress">${bi('reset.view_progress')}</button></section>`;
    $('#rs-progress', view).addEventListener('click', () => app.onResetProgress && app.onResetProgress(d.open_run.reset_run_id));
    return;
  }
  const deadline = Date.now() + Number(d.expires_in_seconds || 600) * 1000;
  view.innerHTML = `<form class="rs-page rs-confirm" novalidate autocomplete="off">
    <p class="banner warn rs-qr">${ICON.qr}<span>${bi('reset.qr_warning')}</span></p>
    <section class="card"><h2>${bi('reset.will_delete')}</h2>${groupRows(d.plan.groups || {})}${filesLine(d.plan.files || {})}
      <p class="muted small">${bi('reset.scope_me')}</p></section>
    <section class="card"><h2>${bi('reset.kept_title')}</h2><p>${bi('reset.kept_list')}</p><p class="muted small">${bi('reset.backup_first')}</p></section>
    <section class="card"><h2>${bi('reset.files_title')}</h2>
      ${MODES.map((m) => { const fm = (d.file_modes || []).find((x) => x.mode === m) || { available: m !== 'DELETE' }; return `<label class="check rs-mode${fm.available ? '' : ' disabled'}">
        <input type="radio" name="file_mode" value="${m}" ${m === 'KEEP' ? 'checked' : ''} ${fm.available ? '' : 'disabled'}>
        <span><strong>${bi('reset.mode.' + m)}</strong><br><span class="muted small">${bi(fm.available ? 'reset.mode_hint.' + m : 'reset.mode_off')}</span></span></label>`; }).join('')}</section>
    <section class="card">
      <p class="muted small" id="rs-count"></p>
      <label for="rs-pin">${bi('reset.pin_label')}</label>
      <input id="rs-pin" class="inp" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" pattern="[0-9]*">
      <label for="rs-text">${bi('reset.type_label')}</label>
      <input id="rs-text" class="inp" type="text" autocapitalize="characters" spellcheck="false" placeholder="${esc(CONFIRM)}">
      <p class="err" id="rs-err" role="alert"></p>
      <div class="row form-actions"><a class="btn" href="#/admin/system-data">${bi('btn.cancel')}</a>
        <button type="submit" class="btn danger-solid" id="rs-go" disabled>${bi('reset.btn_confirm')}</button></div>
    </section></form>`;
  const form = $('form', view);
  const pin = $('#rs-pin', form), txt = $('#rs-text', form), go = $('#rs-go', form), err = $('#rs-err', form), cnt = $('#rs-count', form);
  let expired = false;
  const valid = () => !expired && /^\d{6}$/.test(pin.value) && confirmOk(txt.value);
  const upd = () => { go.disabled = !valid(); };
  pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); upd(); });
  txt.addEventListener('input', upd);
  const again = () => { cnt.innerHTML = `${bi('reset.expired')} <button type="button" class="btn small" id="rs-again">${bi('reset.preview_again')}</button>`; $('#rs-again', cnt).addEventListener('click', () => renderResetConfirm(view, { shell })); };
  const tick = () => {
    if (!form.isConnected) { clearInterval(timer); return; }
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    if (!left) { expired = true; clearInterval(timer); upd(); again(); return; }
    cnt.innerHTML = bi('reset.countdown', { T: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` });
  };
  const timer = setInterval(tick, 1000);
  tick();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!valid()) return;
    err.textContent = '';
    const mode = ($('input[name="file_mode"]:checked', form) || {}).value || 'KEEP';
    busy(go, true);
    const res = await api('system.reset.request', { reset_run_id: d.reset_run_id, nonce: d.nonce, plan_hash: d.plan_hash, pin: pin.value, confirm_text: txt.value, file_mode: mode }, { write: true, timeoutMs: 45000 });
    busy(go, false);
    if (res.ok) { clearInterval(timer); if (app.onResetStarted) await app.onResetStarted(res.data); return; }
    pin.value = '';
    upd();
    const codes = (res.errors || []).map((e) => e.code);
    if (codes.includes('RESET_PLAN_CHANGED') || codes.includes('RESET_PLAN_EXPIRED')) { expired = true; upd(); err.textContent = resMsg(res); again(); return; }
    err.textContent = resMsg(res);
  });
}

/* ====================== SYS-RESET-03 Tiến độ (trang riêng) ====================== */

/**
 * root: vùng gốc của app (ngoài khung). runId: đợt cần xem. onRelogin(): về đăng nhập; onImport(): đăng nhập rồi mở nhập Excel;
 * onRecovery(rec): máy chủ cấp phiên phục hồi mới (sau Tiếp tục).
 */
export function renderResetProgress(root, { runId, onRelogin, onImport, onRecovery }) {
  root.innerHTML = `<div class="page rs-progress"><header class="bar"><h1>${bi('admin.system_data')} · ${bi('reset.progress_title')}</h1></header>
    <div class="rs-body">${spinner}</div></div>`;
  const body = $('.rs-body', root);
  let timer = null;
  let current = runId;
  const stepState = (run, s) => {
    const i = STEPS.indexOf(s), cur = STEPS.indexOf(run.step);
    if (run.status === 'COMPLETED') return 'done';
    if (i < cur) return 'done';
    if (i === cur) return run.status === 'FAILED_NEEDS_RECOVERY' ? 'failed' : 'active';
    return '';
  };
  const show = (run, note) => {
    if (!root.isConnected) return;
    if (!run) { body.innerHTML = `<section class="card"><p>${bi('reset.no_run')}</p><button type="button" class="btn primary" id="rs-relogin">${bi('btn.relogin')}</button></section>`; $('#rs-relogin', body).addEventListener('click', () => onRelogin()); return; }
    const pr = run.progress;
    const groups = pr ? `<ul class="list rs-groups">${GROUPS.map((g) => { const x = pr.groups[g] || { total: 0, done: 0 }; return `<li class="kv"><span>${bi('reset.group.' + g)}</span><strong>${fmtNumber(x.done)}/${fmtNumber(x.total)}</strong></li>`; }).join('')}</ul>
      <p class="muted small">${bi('reset.files_progress', { A: fmtNumber(pr.files.done || 0), B: fmtNumber(pr.files.total || 0), C: fmtNumber(pr.files.failed || 0) })}</p>` : '';
    let tail = '';
    if (run.status === 'FAILED_NEEDS_RECOVERY') {
      tail = `<section class="card rs-failed"><p class="banner err">${bi('reset.failed', { S: biText('reset.step.' + run.step), C: esc(run.error_code) })}</p>
        ${run.error_detail ? `<p class="muted small">${esc(run.error_detail)}</p>` : ''}
        <p class="muted small">${bi('reset.failed_keep')}</p>
        <label for="rs-pin">${bi('reset.pin_label')}</label>
        <input id="rs-pin" class="inp" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6">
        <p class="err" id="rs-err" role="alert"></p>
        <div class="row"><button type="button" class="btn primary" id="rs-continue" disabled>${bi('reset.btn_continue')}</button>
          ${run.can_cancel ? `<button type="button" class="btn" id="rs-cancel" disabled>${bi('reset.btn_cancel_run')}</button>` : ''}</div>
        ${guideLink()}</section>`;
    } else if (run.status === 'COMPLETED') {
      const f = (run.receipt && run.receipt.files) || {};
      tail = `<section class="card rs-done"><p class="banner ok">${bi('reset.done_at', { T: esc(fmtDateTime(run.completed_at)) })}</p>
        <ul class="list rs-groups">${GROUPS.map((g) => `<li class="kv"><span>${bi('reset.group.' + g)}</span><strong>${bi('reset.records', { N: fmtNumber(Number((run.receipt.groups || {})[g] || 0)) })}</strong></li>`).join('')}</ul>
        <p class="muted small">${bi('reset.files_receipt', { K: f.kept || 0, T: f.trashed || 0, D: f.deleted || 0, M: f.missing || 0, F: f.failed || 0 })}</p>
        <p>${bi('reset.backup_ref', { R: esc(run.backup_ref) })}</p>
        <p class="banner warn">${ICON.qr}<span>${bi('reset.print_new_qr')}</span></p>
        <p class="muted">${bi('reset.relogin_note')}</p>
        <p class="muted small">${bi('reset.import_order')}</p>
        <div class="row"><button type="button" class="btn primary" id="rs-relogin">${bi('btn.relogin')}</button>
          <button type="button" class="btn" id="rs-import">${bi('reset.btn_import')}</button></div></section>`;
    } else if (run.status === 'CANCELLED') {
      tail = `<section class="card"><p>${badge('reset_status.CANCELLED')}</p><button type="button" class="btn primary" id="rs-relogin">${bi('btn.relogin')}</button></section>`;
    } else {
      tail = `<p class="muted small rs-running"><span class="spinner tiny" aria-hidden="true"></span> ${bi('reset.running_note')}</p>`;
    }
    body.innerHTML = `<section class="card"><div class="rec-top"><span>${bi('reset.status_line')}</span>${badge('reset_status.' + run.status)}</div>
        <p class="muted small">${bi('reset.requested', { T: esc(fmtDateTime(run.requested_at)), U: esc(run.requested_by_name || '') })} · ${bi('reset.mode.' + (run.file_mode || 'KEEP'))}</p>
        <ol class="rs-steps">${STEPS.map((s) => `<li class="${stepState(run, s)}"><span class="st-ico" aria-hidden="true">${ICON.check}</span><span>${bi('reset.step.' + s)}</span></li>`).join('')}</ol>
        ${groups}${note ? `<p class="muted small">${note}</p>` : ''}</section>${tail}`;
    const rl = $('#rs-relogin', body);
    if (rl) rl.addEventListener('click', () => onRelogin());
    const im = $('#rs-import', body);
    if (im) im.addEventListener('click', () => onImport());
    const pin = $('#rs-pin', body);
    if (pin) {
      const btns = $$('#rs-continue, #rs-cancel', body);
      pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); btns.forEach((b) => { b.disabled = pin.value.length !== 6; }); });
      const act = (mode) => async (ev) => {
        if (mode === 'CANCEL') {
          const ok = await dialog({ title: bi('reset.btn_cancel_run'), body: `<p>${bi('reset.cancel_confirm')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.confirm'), kind: 'primary', value: true }] });
          if (!ok) return;
        }
        const b = evBtn(ev);
        busy(b, true);
        const res = await api('system.reset.resume', { reset_run_id: current, mode, pin: pin.value }, { write: true, timeoutMs: 45000 });
        busy(b, false);
        if (!res.ok) { pin.value = ''; $('#rs-err', body).textContent = resMsg(res); return; }
        if (res.data.recovery && onRecovery) await onRecovery(res.data.recovery);
        show(res.data.run);
        if (res.data.run && ACTIVE.has(res.data.run.status)) schedule(500);
      };
      const c = $('#rs-continue', body);
      if (c) c.addEventListener('click', act('CONTINUE'));
      const x = $('#rs-cancel', body);
      if (x) x.addEventListener('click', act('CANCEL'));
    }
  };
  const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(poll, ms); };
  async function poll() {
    if (!root.isConnected) return;
    if (!navigator.onLine) { schedule(5000); return; }
    const r = await api('system.reset.status', current ? { reset_run_id: current } : {}, { timeoutMs: 45000 });
    if (!root.isConnected) return;
    if (!r.ok) {
      if (['AUTH_REQUIRED', 'SESSION_EXPIRED', 'DATASET_RESET'].includes(r.code)) {
        body.innerHTML = `<section class="card"><p class="banner warn">${bi('reset.recovery_expired')}</p><button type="button" class="btn primary" id="rs-relogin">${bi('btn.relogin')}</button></section>`;
        $('#rs-relogin', body).addEventListener('click', () => onRelogin());
        return;
      }
      toast(esc(resMsg(r)), 'err');
      schedule(5000);
      return;
    }
    const run = r.data.run || null;
    if (run) current = run.reset_run_id;
    // Đang nhập PIN để Tiếp tục: không vẽ lại (mất chữ đang gõ)
    const typing = document.activeElement && document.activeElement.id === 'rs-pin';
    if (!typing) show(run);
    if (run && ACTIVE.has(run.status)) schedule(5000);
  }
  poll();
}
