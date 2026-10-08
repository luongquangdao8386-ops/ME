// Quản trị Gmail (4.4.15, 6.5.3): cài đặt gửi, người nhận (C4 sửa, C3 xem email che), nhật ký gửi, gửi lại dòng UNKNOWN
import { api, bi, esc, badge, fmtDate, fmtDateTime, session, uuid } from '../core.js';
import { $, $$, h, ICON, dialog } from '../ui.js';
import { isWide } from '../shell.js';
import { mapOf } from '../data.js';
import { textInput, selectInput, fieldWrap, wireForm, readField, showErrors, writeWithPin, busy, toast } from '../form.js';
import { handleWriteError } from './equipment.js';

const SCOPES = ['ALL', 'INSPECTION', 'CONTRACT'];
const STATUS = ['', 'QUEUED', 'SENT', 'FAILED', 'UNKNOWN', 'SKIPPED'];
let logFilter = '';

export async function renderGmail(view, { shell }) {
  shell.setScreen({ title: 'admin.gmail', back: '/account' });
  if (!navigator.onLine) { view.innerHTML = `<div class="card empty-state">${ICON.bell}<p class="muted">${bi('sync.need_network')}</p></div>`; return; }
  view.innerHTML = '<div class="spinner" role="status"></div>';
  const r = await api('notify.log.view', logFilter ? { status: logFilter } : {}, { retry: true });
  if (!r.ok) { view.innerHTML = `<div class="card">${esc(r.message_vi ? `${r.message_vi} · ${r.message_zh}` : r.code)}</div>`; return; }
  const d = r.data;
  const c4 = Number(session.user && session.user.role_level) >= 4;
  let users = [];
  if (c4) { const u = await api('user.pickList', {}, { retry: true }); if (u.ok) users = u.data.items; }
  const userName = new Map(users.map((u) => [u.user_id, `${u.employee_code} · ${u.display_name}`]));
  const reqs = await mapOf('INSPECTION_REQUIREMENT');
  const cons = await mapOf('CONTRACT');
  const codeOf = (n) => (n.entity_type === 'CONTRACT' ? (cons.get(n.entity_id) || {}).contract_code : (reqs.get(n.entity_id) || {}).requirement_code) || '—';
  const repaint = () => renderGmail(view, { shell });

  const settings = `<section class="card"><h2>${bi('gmail.settings')}</h2>
    <div class="kv-grid">
      <div><span class="muted small">${bi('gmail.enabled')}</span><div>${badge(d.gmail_enabled ? 'gmail.enabled_on' : 'gmail.enabled_off')}</div></div>
      <div><span class="muted small">${bi('gmail.hour')}</span><div><strong>${String(d.email_hour).padStart(2, '0')}:00</strong></div></div>
    </div>
    <p class="muted small">${bi('gmail.stages')}</p>
    <p class="muted small">${bi('gmail.quota', { N: d.quota })}</p>
    ${c4 ? `<div class="row">
      <button type="button" class="btn small${d.gmail_enabled ? '' : ' primary'}" id="g-toggle">${bi(d.gmail_enabled ? 'gmail.turn_off' : 'gmail.turn_on')}</button>
      <label class="inline">${bi('gmail.hour')} <select class="sel" id="g-hour">${Array.from({ length: 24 }, (_, i) => `<option value="${i}"${i === Number(d.email_hour) ? ' selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}</select></label>
      <button type="button" class="btn small" id="g-test">${ICON.check}${bi('gmail.test_send')}</button></div>` : `<p class="muted small">${bi('gmail.c3_masked')}</p>`}
  </section>`;

  const rcptRow = (x) => {
    const st = [x.confirmed_at ? badge('gmail.confirmed') : badge('gmail.unconfirmed'), x.active === false ? badge('gmail.inactive') : ''].join(' ');
    return { x, st, scope: bi('gmail.scope.' + (x.entity_scope || 'ALL')), user: x.user_id ? esc(userName.get(x.user_id) || '') : '' };
  };
  const rc = d.recipients.map(rcptRow);
  const recipients = `<section class="card"><div class="card-head"><h2>${bi('gmail.recipients')}</h2>
      ${c4 ? `<button type="button" class="btn small primary" id="g-add">${ICON.plus}${bi('gmail.add_recipient')}</button>` : ''}</div>
    ${rc.length ? (isWide()
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('gmail.email')}</th><th>${bi('gmail.scope')}</th><th>${bi('gmail.user')}</th><th>${bi('col.status')}</th>${c4 ? '<th></th>' : ''}</tr></thead>
        <tbody>${rc.map(({ x, st, scope, user }) => `<tr><td>${esc(x.email)}</td><td>${scope}</td><td>${user}</td><td>${st}</td>${c4 ? `<td><button type="button" class="btn small" data-edit="${esc(x.recipient_id)}">${ICON.edit}${bi('btn.edit')}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
    : `<div class="cards">${rc.map(({ x, st, scope, user }) => `<div class="card rec-card"><div class="rec-name">${esc(x.email)}</div>
        <div class="muted small">${scope}${user ? ' · ' + user : ''}</div><div class="rec-badges">${st}</div>
        ${c4 ? `<div class="rec-actions"><button type="button" class="btn small" data-edit="${esc(x.recipient_id)}">${ICON.edit}${bi('btn.edit')}</button></div>` : ''}</div>`).join('')}</div>`)
    : `<p class="muted">${bi('home.none')}</p>`}
  </section>`;

  const chips = STATUS.map((s) => `<button type="button" class="chip${logFilter === s ? ' on' : ''}" data-st="${s}">${s ? bi('email_status.' + s) : bi('due_filter.ALL')}</button>`).join('');
  const resendBtn = (n) => (c4 && n.status === 'UNKNOWN' ? `<button type="button" class="btn small" data-resend="${esc(n.notification_id)}">${bi('btn.resend')}</button>` : '');
  const when = (n) => fmtDateTime(n.sent_at || n.attempt_at || n.queued_at) || fmtDate(n.run_date);
  const logs = `<section class="card"><h2>${bi('gmail.log')}</h2><div class="chips">${chips}</div>
    ${d.items.length ? (isWide()
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('field.date')}</th><th>${bi('gmail.recipient')}</th><th>${bi('col.code')}</th><th>${bi('col.due')}</th><th>${bi('gmail.stage')}</th><th>${bi('col.status')}</th><th>${bi('gmail.error')}</th><th></th></tr></thead>
        <tbody>${d.items.map((n) => `<tr><td>${esc(when(n))}</td><td>${esc(n.recipient)}</td><td class="code">${esc(codeOf(n))}</td><td>${esc(fmtDate(n.due_date))}</td><td>${esc(n.stage)}</td>
          <td>${badge('email_status.' + n.status)}</td><td class="muted small">${esc(n.error_code || '')}</td><td>${resendBtn(n)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="cards">${d.items.map((n) => `<div class="card rec-card"><div class="rec-top"><span class="code">${esc(codeOf(n))}</span><span>${badge('email_status.' + n.status)}</span></div>
        <div class="muted small">${esc(n.recipient)} · ${esc(when(n))}</div>
        <div class="muted small">${bi('col.due')}: ${esc(fmtDate(n.due_date))} · ${bi('gmail.stage')}: ${esc(n.stage)}${n.error_code ? ' · ' + esc(n.error_code) : ''}</div>
        ${resendBtn(n) ? `<div class="rec-actions">${resendBtn(n)}</div>` : ''}</div>`).join('')}</div>`)
    : `<p class="muted">${bi('gmail.log_empty')}</p>`}
  </section>`;

  view.innerHTML = settings + recipients + logs;

  $$('[data-st]', view).forEach((b) => b.addEventListener('click', () => { logFilter = b.dataset.st; repaint(); }));
  if (!c4) return;
  const saveSettings = async (btn, payload) => {
    busy(btn, true);
    const res = await writeWithPin('notify.settings.edit', payload);
    busy(btn, false);
    if (res.ok) {
      if (res.data && res.data.test) toast(bi('gmail.test_sent', { N: res.data.test.sent }), 'ok'); else toast(bi('form.saved'), 'ok');
      repaint();
    } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  };
  $('#g-toggle', view).addEventListener('click', (ev) => saveSettings(ev.currentTarget, { gmail_enabled: !d.gmail_enabled }));
  $('#g-hour', view).addEventListener('change', (ev) => saveSettings(ev.currentTarget, { email_hour: Number(ev.target.value) }));
  $('#g-test', view).addEventListener('click', (ev) => saveSettings(ev.currentTarget, { test_send: true }));
  $('#g-add', view).addEventListener('click', async () => { if (await recipientDialog(null, users)) repaint(); });
  $$('[data-edit]', view).forEach((b) => b.addEventListener('click', async () => {
    const x = d.recipients.find((y) => y.recipient_id === b.dataset.edit);
    if (x && await recipientDialog(x, users)) repaint();
  }));
  $$('[data-resend]', view).forEach((b) => b.addEventListener('click', async () => {
    const ok = await dialog({ title: bi('btn.resend'), body: `<p>${bi('gmail.resend_confirm')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.resend'), kind: 'primary', value: true }] });
    if (!ok) return;
    busy(b, true);
    const res = await writeWithPin('notify.resend', { notification_id: b.dataset.resend });
    busy(b, false);
    if (res.ok) { toast(bi('email_status.SENT'), 'ok'); repaint(); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  }));
}

/** Thêm/sửa người nhận (C4, PIN). Xác nhận địa chỉ là bước riêng; đổi email thì mất xác nhận */
async function recipientDialog(x, users) {
  const rec = x || { entity_scope: 'ALL', active: true };
  const check = (id, key, on, hint = '') => fieldWrap(id, key, `<label class="check"><input type="checkbox" id="f-${id}"${on ? ' checked' : ''}><span>${bi(key)}</span></label>`, { hint });
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi(x ? 'btn.edit' : 'gmail.add_recipient')}</h2>
    ${textInput('email', 'gmail.email', rec.email || '', { required: true, maxlength: 120, inputmode: 'email' })}
    ${selectInput('entity_scope', 'gmail.scope', SCOPES.map((s) => [s, bi('gmail.scope.' + s)]), rec.entity_scope || 'ALL', { empty: '' })}
    ${selectInput('user_id', 'gmail.user', users.map((u) => [u.user_id, `${esc(u.employee_code)} · ${esc(u.display_name)}`]), rec.user_id || '', { hint: bi('gmail.user_hint') })}
    ${check('confirm', 'gmail.confirm', !!rec.confirmed_at, bi('gmail.confirm_hint'))}
    ${check('active', 'gmail.active', rec.active !== false)}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  // Đổi địa chỉ → bỏ dấu xác nhận, người dùng phải xác nhận lại
  if (x) $('#f-email', wrap).addEventListener('input', (ev) => { if (ev.target.value.trim().toLowerCase() !== x.email) $('#f-confirm', wrap).checked = false; });
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const email = readField(wrap, 'email');
      if (!email) { showErrors(wrap, [{ field: 'email', key: 'field.required' }]); return; }
      const p = { recipient_id: x ? x.recipient_id : uuid(), entity_scope: readField(wrap, 'entity_scope') || 'ALL', user_id: readField(wrap, 'user_id') || '', active: readField(wrap, 'active') };
      if (!x || email.toLowerCase() !== x.email) p.email = email;
      // Chỉ gửi cờ xác nhận khi đổi (không ghi đè người/thời điểm xác nhận cũ)
      const conf = readField(wrap, 'confirm');
      if (!x || p.email || conf !== !!x.confirmed_at) p.confirm = conf;
      busy(ev.currentTarget, true);
      const res = await writeWithPin('notify.recipient.edit', p, { expected_version: x ? x.record_version : 0 });
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { showErrors(wrap, res.errors); return; }
      wrap.remove();
      if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
      resolve(false);
    });
  });
}
