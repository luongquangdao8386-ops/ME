// Kiểm định: IN-01 danh sách yêu cầu, IN-02 hồ sơ yêu cầu, IN-03 nộp chứng nhận, WEB-IN-01; loại kiểm định (4.4.9, 3.17, C10)
import { bi, biText, esc, api, fmtDate, fmtDateTime, fmtNumber, badge, biName, nameText, session, uuid, blobToB64, L } from '../core.js';
import { ICON, toast, dialog, h, $, $$ } from '../ui.js';
import { excelLink } from '../excel-link.js';
import { isWide } from '../shell.js';
import { recs, byId, mapOf, can, canSync, boot, roleLevel, dueInfo, requirementRecordStatus, costModules, today } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit, syncNow } from '../app.js';
import { enqueue, queueItems } from '../sync.js';
import { processPhoto, uploadDoc } from '../media.js';
import {
  textInput, selectInput, dateInput, numberInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, writeWithPin,
  loadFormDraft, saveFormDraft, clearFormDraft, busy, unconfirmedAmbiguous, fieldWrap
} from '../form.js';
import { docsTabHtml, wireDocsTab } from './docs.js';
import { handleWriteError } from './equipment.js';

const RESULTS = ['PASS', 'FAIL', 'CONDITIONAL_PASS'];
const STATES = ['ALL', 'OVERDUE', 'DUE_TODAY', 'DUE_SOON', 'MISSING', 'NOT_DUE'];

async function reqRows() {
  const insp = await recs('INSPECTION');
  const t = today();
  return (await recs('INSPECTION_REQUIREMENT')).filter((r) => r.active !== false).map((r) => ({
    r, due: dueInfo(r.current_due_date, t), rs: requirementRecordStatus(r, insp),
    pending: insp.filter((i) => i.requirement_id === r.requirement_id && i.status === 'PENDING_APPROVAL').length
  }));
}

async function targetText(r) {
  const e = r.equipment_id ? await byId('EQUIPMENT', r.equipment_id) : null;
  const l = await byId('LOCATION', r.location_id || (e && e.location_id));
  return { e, l, text: [e && `${e.equipment_code} · ${nameText(e)}`, l && `${l.location_code}`].filter(Boolean).join(' — ') };
}

function statusBadges(x) {
  const rs = x.rs !== 'VALID' && x.rs !== 'INCOMPLETE' ? badge('record_status.' + x.rs) : (x.rs === 'VALID' ? badge('record_status.VALID') : '');
  return `${badge(x.due.key, x.due.vars)} ${rs}${x.pending ? ' ' + `<span class="badge t-amber">${bi('in.pending')} ${x.pending}</span>` : ''}`;
}

/* ======================= IN-01 / WEB-IN-01 ======================= */

const filt = { q: '', state: 'ALL', type: '', location: '', month: '' };
const selected = new Set();

export async function renderInspectionList(view, ctx) {
  const { shell } = ctx;
  const wide = isWide();
  const canReq = await can('inspection.requirement.edit');
  const canType = await can('inspection.type.edit');
  const canPrint = await can('qr.print');
  const excelBtn = await excelLink('inspection_requirements');
  shell.setScreen({
    title: 'module.inspections', back: '/',
    actions: !wide && canReq ? [{ icon: 'plus', label: biText('in.new_requirement'), onClick: () => navigate('/inspections/new'), disabled: !navigator.onLine }] : []
  });
  const all = await reqRows();
  const types = await mapOf('INSPECTION_TYPE');
  const locs = await mapOf('LOCATION');
  const eqs = await mapOf('EQUIPMENT');
  const locOf = (r) => r.location_id || (eqs.get(r.equipment_id) || {}).location_id || '';
  const q = filt.q.toLowerCase();
  const base = all.filter((x) => (!filt.type || x.r.inspection_type_id === filt.type) && (!filt.location || locOf(x.r) === filt.location) &&
    (!filt.month || String(x.r.current_due_date || '').startsWith(filt.month)) &&
    (!q || [x.r.requirement_code, nameText(types.get(x.r.inspection_type_id)), (eqs.get(x.r.equipment_id) || {}).equipment_code, nameText(eqs.get(x.r.equipment_id))].join(' ').toLowerCase().includes(q)));
  const rank = { OVERDUE: 0, DUE_TODAY: 1, DUE_SOON: 2, MISSING: 3, NOT_DUE: 4 };
  const rows = base.filter((x) => filt.state === 'ALL' || x.due.state === filt.state)
    .sort((a, b) => rank[a.due.state] - rank[b.due.state] || (a.due.days ?? 0) - (b.due.days ?? 0) || String(a.r.requirement_code).localeCompare(String(b.r.requirement_code)));
  const count = (st) => base.filter((x) => st === 'ALL' || x.due.state === st).length;
  const usedLocs = [...new Set(all.map((x) => locOf(x.r)).filter(Boolean))];
  const toolbar = `<div class="toolbar">
    <div class="search"><span>${ICON.search}</span><input id="in-q" type="search" value="${esc(filt.q)}" placeholder="${esc(biText('field.search_placeholder'))}" autocomplete="off"></div>
    <div class="chips">${STATES.map((st) => `<button type="button" class="chip${filt.state === st ? ' on' : ''}" data-state="${st}">${bi('due_filter.' + st)} <span class="count">${count(st)}</span></button>`).join('')}</div>
    <div class="row">
      <select id="in-type" class="sel"><option value="">${bi('field.inspection_type')}</option>${[...types.values()].filter((t) => t.active !== false).map((t) => `<option value="${esc(t.inspection_type_id)}"${filt.type === t.inspection_type_id ? ' selected' : ''}>${esc(t.code)} · ${esc(nameText(t))}</option>`).join('')}</select>
      <select id="in-loc" class="sel"><option value="">${bi('field.location')}</option>${usedLocs.map((id) => `<option value="${esc(id)}"${filt.location === id ? ' selected' : ''}>${esc((locs.get(id) || {}).location_code || '')} ${esc(nameText(locs.get(id)))}</option>`).join('')}</select>
      ${wide ? `<label class="inline">${bi('in.month')} <input type="month" id="in-month" class="sel" value="${esc(filt.month)}"></label>` : ''}
    </div>
    <div class="row tools">
      ${canReq && wide ? `<a class="btn small primary" href="#/inspections/new">${ICON.plus}<span>${bi('in.new_requirement')}</span></a>` : ''}
      ${canType ? `<a class="btn small" href="#/inspections/types">${bi('in.types')}</a>` : ''}
      ${!wide ? `<a class="btn small" href="#/alerts/month">${ICON.calendar}<span>${bi('btn.month_calendar')}</span></a>` : ''}
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${bi('btn.schedule')}<span class="soon">${bi('tag.coming_soon')}</span></button>
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${ICON.reports}<span>${bi('btn.report')}</span><span class="soon">${bi('tag.coming_soon')}</span></button>
      ${canPrint && wide ? `<button type="button" class="btn small" id="in-print" ${selected.size ? '' : 'disabled'}>${ICON.print}<span>${bi('btn.print_qr')}</span> <span class="count">${selected.size ? '(' + selected.size + ')' : ''}</span></button>` : ''}
      ${excelBtn}
    </div>
    <p class="muted small">${bi('field.total', { N: rows.length })}</p></div>`;
  const rowsHtml = await Promise.all(rows.map(async (x) => ({ x, t: types.get(x.r.inspection_type_id), tg: await targetText(x.r) })));
  let body;
  if (wide) {
    body = `<div class="table-wrap"><table class="tbl"><thead><tr>
      ${canPrint ? `<th class="chk"><input type="checkbox" id="in-all" aria-label="${esc(biText('btn.print_qr'))}"></th>` : ''}
      <th>${bi('col.code')}</th><th>${bi('module.equipment')}/${bi('field.location')}</th><th>${bi('field.inspection_type')}</th><th>${bi('field.valid_to')}</th><th>${bi('col.status')}</th><th>${bi('col.owner')}</th><th>QR</th></tr></thead>
      <tbody>${rowsHtml.map(({ x, t, tg }) => `<tr class="click" data-id="${esc(x.r.requirement_id)}">
        ${canPrint ? `<td class="chk"><input type="checkbox" data-chk="${esc(x.r.requirement_id)}" ${selected.has(x.r.requirement_id) ? 'checked' : ''} ${x.r.qr_key ? '' : 'disabled'}></td>` : ''}
        <td class="code">${esc(x.r.requirement_code)}</td><td>${esc(tg.text)}</td><td>${t ? biName(t) : ''}</td>
        <td class="num">${esc(fmtDate(x.r.current_due_date))}</td><td>${statusBadges(x)}</td><td>${esc(x.r.owner_name || '')}</td>
        <td>${x.r.qr_key ? `<a class="icon-btn" href="#/qr/INSPECTION_REQUIREMENT/${esc(x.r.requirement_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    body = `<div class="cards">${rowsHtml.map(({ x, t, tg }) => `<a class="card rec-card" href="#/inspections/${esc(x.r.requirement_id)}">
      <div class="rec-top"><span class="code">${esc(x.r.requirement_code)}</span><span class="muted small">${bi('field.valid_to')}: <strong>${esc(fmtDate(x.r.current_due_date) || '—')}</strong></span></div>
      <div class="rec-name">${t ? biName(t) : ''}</div><div class="muted small">${esc(tg.text)}</div>
      <div class="rec-badges">${statusBadges(x)}</div>
      ${x.r.qr_key ? `<span class="qr-mini" aria-hidden="true">${ICON.qr}</span>` : ''}</a>`).join('')}</div>`;
  }
  view.innerHTML = toolbar + (rows.length ? body : `<div class="card empty-state">${ICON.inspections}<p class="muted">${bi(all.length ? 'field.no_records' : 'in.no_requirements')}</p></div>`);
  const again = () => renderInspectionList(view, ctx);
  let tm = null;
  $('#in-q', view).addEventListener('input', (e) => { filt.q = e.target.value; clearTimeout(tm); tm = setTimeout(async () => { const pos = e.target.selectionStart; await again(); const el = $('#in-q', view); el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ } }, 250); });
  $$('[data-state]', view).forEach((b) => b.addEventListener('click', () => { filt.state = b.dataset.state; again(); }));
  $('#in-type', view).addEventListener('change', (e) => { filt.type = e.target.value; again(); });
  $('#in-loc', view).addEventListener('change', (e) => { filt.location = e.target.value; again(); });
  if ($('#in-month', view)) $('#in-month', view).addEventListener('change', (e) => { filt.month = e.target.value; again(); });
  if (wide) {
    $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('input, a')) return; navigate('/inspections/' + tr.dataset.id); }));
    const pb = $('#in-print', view);
    const upd = () => { if (pb) { pb.disabled = !selected.size; pb.querySelector('.count').textContent = selected.size ? `(${selected.size})` : ''; } };
    $$('[data-chk]', view).forEach((c) => c.addEventListener('change', () => { if (c.checked) selected.add(c.dataset.chk); else selected.delete(c.dataset.chk); upd(); }));
    const allc = $('#in-all', view);
    if (allc) allc.addEventListener('change', () => { rows.filter((x) => x.r.qr_key).forEach((x) => (allc.checked ? selected.add(x.r.requirement_id) : selected.delete(x.r.requirement_id))); $$('[data-chk]', view).forEach((c) => { c.checked = selected.has(c.dataset.chk); }); upd(); });
    if (pb) pb.addEventListener('click', () => navigate(`/print?type=INSPECTION_REQUIREMENT&ids=${[...selected].join(',')}`));
  }
}

/* ======================= IN-02 Hồ sơ yêu cầu ======================= */

function certBlock(i, vendors) {
  if (!i) return `<p class="muted">${bi('in.no_current')}</p>`;
  const v = vendors.get(i.vendor_id);
  const kv = (k, val) => (val ? `<div class="kv"><span>${bi(k)}</span><strong>${val}</strong></div>` : '');
  return `<div class="kv-grid">
    ${kv('field.certificate_number', esc(i.certificate_number || ''))}
    ${kv('field.inspection_date', esc(fmtDate(i.inspection_date)))}
    ${kv('field.valid_from', esc(fmtDate(i.valid_from)))}
    ${kv('field.valid_to', esc(fmtDate(i.valid_to)))}
    ${kv('in.next_due', esc(fmtDate(i.next_due_date)))}
    ${kv('field.result', badge('inspection_result.' + i.result))}
    ${kv('in.restriction', i.restriction_vi || i.restriction_zh ? biName(i, 'restriction') : '')}
    ${kv('field.vendor', v ? esc(v.vendor_code + ' · ' + v.name) : '')}
    ${i.cost !== undefined && i.cost !== '' && i.cost !== null ? kv('in.cost', `${fmtNumber(i.cost)} ${esc(i.currency || 'VND')}`) : ''}
  </div>`;
}

export async function renderRequirement(view, ctx) {
  const { shell, params } = ctx;
  const r = await byId('INSPECTION_REQUIREMENT', params.id);
  const canReq = await can('inspection.requirement.edit');
  const canSubmit = await can('inspection.submit');
  const canRevoke = await can('inspection.revoke');
  const canApprove = await can('inspection.approve');
  shell.setScreen({
    title: 'in.requirement', back: '/inspections',
    actions: r ? [
      ...(r.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/INSPECTION_REQUIREMENT/${r.requirement_id}`) }] : []),
      ...(canReq ? [{ icon: 'edit', label: biText('btn.edit'), onClick: () => navigate(`/inspections/${r.requirement_id}/edit`), disabled: !navigator.onLine }] : [])
    ] : []
  });
  if (!r) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const online = navigator.onLine;
  const insp = (await recs('INSPECTION')).filter((i) => i.requirement_id === r.requirement_id).sort((a, b) => String(b.inspection_date).localeCompare(String(a.inspection_date)));
  const cur = insp.find((i) => i.inspection_id === r.current_inspection_id) || null;
  const t = await byId('INSPECTION_TYPE', r.inspection_type_id);
  const tg = await targetText(r);
  const vendors = await mapOf('VENDOR');
  const due = dueInfo(r.current_due_date);
  const rs = requirementRecordStatus(r, await recs('INSPECTION'));
  const uid = session.user && session.user.user_id;
  const local = (await queueItems()).filter((o) => o.action === 'inspection.submit' && o.payload && o.payload.requirement_id === r.requirement_id && o.user_id === uid);
  view.innerHTML = `<section class="card">
    <div class="rec-top"><span class="code big">${esc(r.requirement_code)}</span>${badge('operational.' + (r.operational_status || 'ACTIVE'))}</div>
    <h2 class="eq-name">${t ? biName(t) : ''}</h2>
    <div class="kv-grid">
      <div class="kv"><span>${bi('in.target')}</span><strong>${tg.e ? `<a href="#/equipment/${esc(tg.e.equipment_id)}">${esc(tg.e.equipment_code)}</a> ${biName(tg.e)}` : (tg.l ? esc(tg.l.location_code) + ' ' + biName(tg.l) : '')}</strong></div>
      ${r.owner_name ? `<div class="kv"><span>${bi('field.owner')}</span><strong>${esc(r.owner_name)}</strong></div>` : ''}
      <div class="kv"><span>${bi('in.obligation')}</span><strong>${bi('obligation.' + (r.obligation_status || 'REQUIRED'))}</strong></div>
      <div class="kv"><span>${bi('field.valid_to')}</span><strong>${esc(fmtDate(r.current_due_date) || biText('field.not_set'))}</strong></div>
    </div>
    <div class="rec-badges">${badge(due.key, due.vars)} ${badge('record_status.' + rs)}</div>
    <div class="row">
      ${canSubmit ? `<a class="btn small primary" href="#/inspections/${esc(r.requirement_id)}/submit">${ICON.upload}<span>${bi('in.submit')}</span></a>` : ''}
      ${canRevoke && cur && cur.status === 'APPROVED' ? `<button type="button" class="btn small" data-rv="REVOKE" ${online ? '' : 'disabled'}>${bi('in.revoke')}</button>` : ''}
      ${canRevoke ? `<button type="button" class="btn small" data-rv="${r.operational_status === 'SUSPENDED' ? 'RESUME' : 'SUSPEND'}" ${online ? '' : 'disabled'}>${bi(r.operational_status === 'SUSPENDED' ? 'in.resume' : 'in.suspend')}</button>` : ''}
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${bi('btn.schedule')}<span class="soon">${bi('tag.coming_soon')}</span></button>
    </div>
    ${!online && canRevoke ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
  </section>
  <section class="card"><h3>${bi('in.current')}</h3>${certBlock(cur, vendors)}
    ${cur ? `<div class="row"><a class="btn small" href="#/inspections/record/${esc(cur.inspection_id)}">${bi('btn.view')}</a></div>` : ''}</section>
  <section class="card"><h3>${bi('tab.history')}</h3>
    <ul class="list">
      ${local.map((o) => `<li><strong>${bi('tag.pending_code')}</strong> · ${esc(fmtDate(o.payload.inspection_date))} · ${badge('inspection_result.' + o.payload.result)} ${badge('op_state.' + (o.state === 'SENDING' ? 'SENDING' : o.state))} <span class="badge t-amber">${bi('sync.local_saved')}</span></li>`).join('')}
      ${insp.map((i) => `<li class="hist-row">
        <div><a href="#/inspections/record/${esc(i.inspection_id)}" class="code">${esc(i.inspection_code)}</a> · ${esc(fmtDate(i.inspection_date))} · ${badge('inspection_result.' + i.result)} ${badge('cert_status.' + i.status)}
          ${i.valid_to ? `<span class="muted small"> · ${bi('field.valid_to')}: ${esc(fmtDate(i.valid_to))}</span>` : ''}</div>
        ${i.status === 'PENDING_APPROVAL' && canApprove && i.submitted_by !== uid && i.created_by !== uid ? `<div class="row"><button type="button" class="btn tiny primary" data-appr="${esc(i.inspection_id)}" ${online ? '' : 'disabled'}>${ICON.check}<span>${bi('btn.approve')}</span></button>
          <button type="button" class="btn tiny" data-rej="${esc(i.inspection_id)}" ${online ? '' : 'disabled'}>${bi('btn.reject')}</button></div>` : ''}
      </li>`).join('') || (local.length ? '' : `<li class="muted">${bi('history.empty')}</li>`)}
    </ul></section>`;
  const repaint = () => renderRequirement(view, ctx);
  $$('[data-appr]', view).forEach((b) => b.addEventListener('click', async () => { if (await approveFlow(b.dataset.appr, 'APPROVE')) repaint(); }));
  $$('[data-rej]', view).forEach((b) => b.addEventListener('click', async () => { if (await approveFlow(b.dataset.rej, 'REJECT')) repaint(); }));
  $$('[data-rv]', view).forEach((b) => b.addEventListener('click', async () => {
    const op = b.dataset.rv;
    const v = await dialog({
      title: bi(op === 'REVOKE' ? 'in.revoke' : op === 'SUSPEND' ? 'in.suspend' : 'in.resume'),
      body: `${op === 'REVOKE' ? `<p class="muted small">${bi('in.revoke_help')}</p>` : ''}<label for="rv-reason">${bi('field.reason')} <span class="req">*</span></label><input id="rv-reason" type="text" maxlength="300">`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.ok'), kind: op === 'REVOKE' ? 'primary danger' : 'primary', read: (w) => $('#rv-reason', w).value.trim() }]
    });
    if (v === null) return;
    if (!v) { toast(bi('field.reason_required'), 'err'); return; }
    const res = await writeWithPin('inspection.revoke', { requirement_id: r.requirement_id, op, reason: v }, { expected_version: r.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  }));
}

/** Duyệt / từ chối một lần kiểm định (PIN, không tự duyệt) */
async function approveFlow(inspectionId, decision) {
  const i = (await recs('INSPECTION')).find((x) => x.inspection_id === inspectionId);
  if (!i) return false;
  const v = await dialog({
    title: bi(decision === 'APPROVE' ? 'btn.approve' : 'btn.reject'),
    body: `<p><strong>${esc(i.inspection_code)}</strong> · ${badge('inspection_result.' + i.result)} · ${bi('field.valid_to')}: ${esc(fmtDate(i.valid_to) || '—')}</p>
      ${decision === 'APPROVE' ? `<p class="muted small">${bi('in.approve_help')}</p>` : `<label for="ap-reason">${bi('in.reject_reason')} <span class="req">*</span></label><input id="ap-reason" type="text" maxlength="300">`}`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi(decision === 'APPROVE' ? 'btn.approve' : 'btn.reject'), kind: decision === 'APPROVE' ? 'primary' : 'primary danger', read: (w) => ({ reason: w.querySelector('#ap-reason') ? w.querySelector('#ap-reason').value.trim() : '' }) }]
  });
  if (!v) return false;
  if (decision === 'REJECT' && !v.reason) { toast(bi('field.reason_required'), 'err'); return false; }
  const res = await writeWithPin('inspection.approve', { inspection_id: inspectionId, decision, reason: v.reason }, { expected_version: i.record_version });
  if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); return true; }
  if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  return false;
}

/* ======================= Lần kiểm định ======================= */

export async function renderInspectionRecord(view, ctx) {
  const { shell, params } = ctx;
  const i = (await recs('INSPECTION')).find((x) => x.inspection_id === params.id);
  shell.setScreen({
    title: 'in.record', back: i ? `/inspections/${i.requirement_id}` : '/inspections',
    actions: i && i.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/INSPECTION/${i.inspection_id}`) }] : []
  });
  if (!i) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const vendors = await mapOf('VENDOR');
  const r = await byId('INSPECTION_REQUIREMENT', i.requirement_id);
  const uid = session.user && session.user.user_id;
  const canApprove = (await can('inspection.approve')) && i.status === 'PENDING_APPROVAL' && i.submitted_by !== uid && i.created_by !== uid;
  view.innerHTML = `<section class="card">
    <div class="rec-top"><span class="code big">${esc(i.inspection_code)}</span>${badge('cert_status.' + i.status)}</div>
    ${r ? `<p><a href="#/inspections/${esc(r.requirement_id)}">${esc(r.requirement_code)}</a></p>` : ''}
    ${certBlock(i, vendors)}
    ${i.submitted_by_name ? `<p class="muted small">${bi('btn.submit_review')}: ${esc(i.submitted_by_name)} · ${esc(fmtDateTime(i.submitted_at))}</p>` : ''}
    ${i.approved_by_name ? `<p class="muted small">${bi('btn.approve')}: ${esc(i.approved_by_name)} · ${esc(fmtDateTime(i.approved_at))}</p>` : ''}
    ${canApprove ? `<div class="row"><button type="button" class="btn small primary" id="ir-appr">${ICON.check}<span>${bi('btn.approve')}</span></button><button type="button" class="btn small" id="ir-rej">${bi('btn.reject')}</button></div>` : ''}
  </section>
  <section class="card tab-body"><h3>${bi('in.attachments')}</h3><div id="ir-docs"></div></section>`;
  const box = $('#ir-docs', view);
  box.innerHTML = await docsTabHtml('INSPECTION', i);
  wireDocsTab(box, 'INSPECTION', i, () => renderInspectionRecord(view, ctx));
  if (canApprove) {
    $('#ir-appr', view).addEventListener('click', async () => { if (await approveFlow(i.inspection_id, 'APPROVE')) renderInspectionRecord(view, ctx); });
    $('#ir-rej', view).addEventListener('click', async () => { if (await approveFlow(i.inspection_id, 'REJECT')) renderInspectionRecord(view, ctx); });
  }
}

/* ======================= IN-03 Nộp chứng nhận (offline được) ======================= */

export async function renderSubmitForm(view, ctx) {
  const { shell, params } = ctx;
  shell.setScreen({ title: 'in.submit', back: `/inspections/${params.id}` });
  const r = await byId('INSPECTION_REQUIREMENT', params.id);
  if (!r) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  if (!(await can('inspection.submit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const t = await byId('INSPECTION_TYPE', r.inspection_type_id);
  const vendors = (await recs('VENDOR')).filter((v) => v.active !== false);
  const showCost = (await costModules()).includes('inspections');
  const draftKey = `insp-submit:${r.requirement_id}`;
  const draft = (await loadFormDraft(draftKey)) || {};
  const files = { cert: [], photo: [] };
  view.innerHTML = `<form class="card form-card" novalidate>
    <p><strong>${esc(r.requirement_code)}</strong> · ${t ? biName(t) : ''}</p>
    <div class="form-grid">
      ${dateInput('inspection_date', 'field.inspection_date', draft.inspection_date || today(), { required: true })}
      ${selectInput('result', 'field.result', RESULTS.map((x) => [x, bi('inspection_result.' + x)]), draft.result || 'PASS', { empty: null, required: true })}
      ${dateInput('valid_from', 'field.valid_from', draft.valid_from || '', { hint: '' })}
      ${dateInput('valid_to', 'field.valid_to', draft.valid_to || '')}
      ${dateInput('next_due_date', 'in.next_due', draft.next_due_date || '')}
      ${textInput('certificate_number', 'field.certificate_number', draft.certificate_number || '', { maxlength: 80 })}
      ${selectInput('vendor_id', 'field.vendor', vendors.map((v) => [v.vendor_id, `${esc(v.vendor_code)} · ${esc(v.name)}`]), draft.vendor_id || '')}
      ${showCost ? numberInput('cost', 'in.cost', draft.cost || '', { hint: 'VND' }) : ''}
      ${bilingualInputs('restriction', draft, { required: false, labelKey: 'in.restriction', area: true, maxlength: 500 })}
    </div>
    <p class="muted small">${bi('in.no_mt')}</p>
    <fieldset class="bi-pair"><legend>${bi('in.attachments')}</legend>
      <div class="row"><label class="btn small file">${ICON.camera}<span>${bi('in.cert_photos')}</span><input type="file" accept="image/*,application/pdf" multiple data-att="cert" hidden></label>
        <label class="btn small file">${ICON.camera}<span>${bi('in.equipment_photo')}</span><input type="file" accept="image/*" data-att="photo" hidden></label></div>
      <ul class="list" id="att-list"></ul>
      <p class="muted small">${bi('doc.photo_warning')}</p>
    </fieldset>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.submit_review')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  // Hiện/ẩn yêu cầu ngày theo kết quả (C10)
  const sync = () => { const res = $('#f-result', form).value; ['valid_from', 'valid_to'].forEach((f) => { const lab = $(`[data-field="${f}"] label`, form); if (lab) lab.innerHTML = bi('field.' + f) + (res !== 'FAIL' ? ' <span class="req">*</span>' : ''); }); };
  $('#f-result', form).addEventListener('change', sync);
  sync();
  const list = $('#att-list', form);
  const paintAtt = () => { list.innerHTML = files.cert.map((f) => `<li>${bi('doc_kind.CERTIFICATE')}: ${esc(f.name)}</li>`).concat(files.photo.map((f) => `<li>${bi('doc_kind.PHOTO_EQUIPMENT')}: ${esc(f.name)}</li>`)).join(''); };
  $$('[data-att]', form).forEach((inp) => inp.addEventListener('change', () => { files[inp.dataset.att].push(...inp.files); inp.value = ''; paintAtt(); }));
  const collect = () => ({
    inspection_date: readField(form, 'inspection_date'), result: readField(form, 'result'), valid_from: readField(form, 'valid_from'),
    valid_to: readField(form, 'valid_to'), next_due_date: readField(form, 'next_due_date'), certificate_number: readField(form, 'certificate_number'),
    vendor_id: readField(form, 'vendor_id'), restriction_vi: readField(form, 'restriction_vi'), restriction_zh: readField(form, 'restriction_zh'),
    ...(showCost ? { cost: readField(form, 'cost') } : {})
  });
  form.addEventListener('input', () => saveFormDraft(draftKey, collect()));
  $('#fm-cancel', form).addEventListener('click', () => back(`/inspections/${r.requirement_id}`));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = collect();
    const errs = [];
    ['inspection_date', 'valid_from', 'valid_to', 'next_due_date'].forEach((f) => { if (v[f] === null) errs.push({ field: f, key: 'field.invalid_date' }); });
    if (!v.inspection_date) errs.push({ field: 'inspection_date', key: 'field.required' });
    if (v.result !== 'FAIL') { if (!v.valid_from) errs.push({ field: 'valid_from', key: 'field.required' }); if (!v.valid_to) errs.push({ field: 'valid_to', key: 'field.required' }); }
    if (v.valid_from && v.valid_to && v.valid_from > v.valid_to) errs.push({ field: 'valid_to', key: 'field.invalid_date' });
    if (v.result === 'CONDITIONAL_PASS' && !v.restriction_vi && !v.restriction_zh) errs.push({ field: 'restriction', key: 'field.required' });
    if (Number.isNaN(v.cost)) errs.push({ field: 'cost', key: 'field.invalid' });
    if (errs.length) { showErrors(form, errs); return; }
    const payload = { inspection_id: uuid(), requirement_id: r.requirement_id };
    Object.entries(v).forEach(([k, x]) => { if (x !== '' && x !== null && x !== undefined) payload[k] = x; });
    // Ảnh/tệp: chuẩn bị trước (thu nhỏ ảnh), gửi sau thao tác nộp
    const docs = [];
    for (const f of files.cert) {
      if (/^image\//.test(f.type)) { const ph = await processPhoto(f); docs.push({ kind: 'CERTIFICATE', blob: ph.main, mime: 'image/jpeg', name: f.name }); }
      else docs.push({ kind: 'CERTIFICATE', blob: f, mime: f.type, name: f.name });
    }
    for (const f of files.photo) { const ph = await processPhoto(f); docs.push({ kind: 'PHOTO_EQUIPMENT', blob: ph.main, thumb: ph.thumb, mime: 'image/jpeg', name: f.name }); }
    const btn = $('#fm-save', form);
    busy(btn, true);
    if (!navigator.onLine) {
      // Đợt 1 offline: inspection.submit + doc.upload vào hàng chờ, gửi tuần tự khi có mạng (4.7, NT1-32)
      await enqueue('inspection.submit', payload, { entity_type: 'INSPECTION', entity_id: payload.inspection_id });
      for (const d of docs) {
        const p2 = { document_id: uuid(), entity_type: 'INSPECTION', entity_id: payload.inspection_id, kind: d.kind, mime_type: d.mime, content_b64: await blobToB64(d.blob), title_vi: d.name.replace(/\.[^.]+$/, ''), title_zh: '' };
        if (d.thumb) p2.thumb_b64 = await blobToB64(d.thumb);
        await enqueue('doc.upload', p2, { entity_type: 'DOCUMENT', entity_id: p2.document_id });
      }
      busy(btn, false);
      await clearFormDraft(draftKey);
      toast(bi('sync.local_saved'), 'ok');
      navigate(`/inspections/${r.requirement_id}`, { replace: true });
      return;
    }
    const res = await writeOnline('inspection.submit', payload);
    if (!res.ok) {
      busy(btn, false);
      if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; }
      await handleWriteError(res);
      return;
    }
    for (const d of docs) {
      const up = await uploadDoc({ entity_type: 'INSPECTION', entity_id: payload.inspection_id, kind: d.kind, blob: d.blob, mime: d.mime, thumb: d.thumb, title_vi: d.name.replace(/\.[^.]+$/, ''), title_zh: '' });
      if (!up.ok) toast(`${esc(d.name)}: ${esc(up.message || up.code)}`, 'err');
    }
    busy(btn, false);
    await clearFormDraft(draftKey);
    await afterCommit();
    toast(bi('form.saved'), 'ok');
    navigate(`/inspections/${r.requirement_id}`, { replace: true });
  });
}

/* ======================= Thêm/sửa yêu cầu ======================= */

export async function renderRequirementForm(view, ctx) {
  const { shell, params } = ctx;
  const isNew = !params.id;
  shell.setScreen({ title: isNew ? 'in.new_requirement' : 'in.edit_requirement', back: isNew ? '/inspections' : `/inspections/${params.id}` });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  if (!(await can('inspection.requirement.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const rec = isNew ? { obligation_status: 'REQUIRED' } : await byId('INSPECTION_REQUIREMENT', params.id);
  if (!rec) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const eqs = (await recs('EQUIPMENT')).slice().sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const locs = (await recs('LOCATION')).filter((l) => l.active !== false);
  const types = (await recs('INSPECTION_TYPE')).filter((t) => t.active !== false);
  let users = [];
  if (await can('user.pickList')) { const u = await api('user.pickList', {}, { retry: true }); if (u.ok) users = u.data.items; }
  const byLoc = !rec.equipment_id && !!rec.location_id;
  view.innerHTML = `<form class="card form-card" novalidate>
    <div class="fld"><label>${bi('in.target')}</label><div class="row">
      <label class="check inline"><input type="radio" name="tg" value="eq" ${byLoc ? '' : 'checked'}><span>${bi('in.by_equipment')}</span></label>
      <label class="check inline"><input type="radio" name="tg" value="loc" ${byLoc ? 'checked' : ''}><span>${bi('in.by_location')}</span></label></div></div>
    <div class="form-grid">
      <div id="tg-eq">${selectInput('equipment_id', 'module.equipment', eqs.map((e) => [e.equipment_id, `${esc(e.equipment_code)} · ${esc(nameText(e))}`]), rec.equipment_id)}</div>
      <div id="tg-loc">${selectInput('location_id', 'field.location', locs.map((l) => [l.location_id, `${esc(l.location_code)} · ${esc(nameText(l))}`]), rec.location_id)}</div>
      ${selectInput('inspection_type_id', 'field.inspection_type', types.map((t) => [t.inspection_type_id, `${esc(t.code)} · ${esc(nameText(t))}`]), rec.inspection_type_id, { required: true })}
      ${selectInput('owner_user_id', 'field.owner', users.map((u) => [u.user_id, esc(`${u.employee_code} · ${u.display_name}`)]), rec.owner_user_id)}
      ${selectInput('obligation_status', 'in.obligation', [['REQUIRED', bi('obligation.REQUIRED')], ['VOLUNTARY', bi('obligation.VOLUNTARY')]], rec.obligation_status, { empty: null })}
    </div>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  const tgSync = () => { const loc = $('input[name=tg]:checked', form).value === 'loc'; $('#tg-eq', form).hidden = loc; };
  $$('input[name=tg]', form).forEach((x) => x.addEventListener('change', tgSync));
  tgSync();
  $('#fm-cancel', form).addEventListener('click', () => back(isNew ? '/inspections' : `/inspections/${params.id}`));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const loc = $('input[name=tg]:checked', form).value === 'loc';
    const payload = { requirement_id: isNew ? uuid() : rec.requirement_id, inspection_type_id: readField(form, 'inspection_type_id'), owner_user_id: readField(form, 'owner_user_id'), obligation_status: readField(form, 'obligation_status') };
    payload.equipment_id = loc ? '' : readField(form, 'equipment_id');
    payload.location_id = readField(form, 'location_id');
    const errs = [];
    if (!payload.inspection_type_id) errs.push({ field: 'inspection_type_id', key: 'field.required' });
    if (!payload.equipment_id && !payload.location_id) errs.push({ field: loc ? 'location_id' : 'equipment_id', key: 'field.required' });
    if (errs.length) { showErrors(form, errs); return; }
    const btn = $('#fm-save', form);
    busy(btn, true);
    const res = await writeOnline('inspection.requirement.edit', payload, { expected_version: isNew ? 0 : rec.record_version });
    busy(btn, false);
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); navigate(`/inspections/${payload.requirement_id}`, { replace: true }); return; }
    if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; }
    await handleWriteError(res);
  });
}

/* ======================= Loại kiểm định ======================= */

export async function renderTypes(view, ctx) {
  const { shell } = ctx;
  shell.setScreen({ title: 'in.types', back: '/inspections' });
  const canEdit = await can('inspection.type.edit');
  const types = (await recs('INSPECTION_TYPE')).slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const online = navigator.onLine;
  view.innerHTML = `${canEdit ? `<div class="row"><button type="button" class="btn small primary" id="ty-add" ${online ? '' : 'disabled'}>${ICON.plus}<span>${bi('in.type_new')}</span></button></div>` : ''}
    <div class="cards">${types.map((t) => `<div class="card rec-card">
      <div class="rec-top"><span class="code">${esc(t.code)}</span>${t.active === false ? badge('material_active.FALSE') : ''}</div>
      <div class="rec-name">${biName(t)}</div>
      ${t.reference_basis ? `<div class="muted small">${bi('in.reference_basis')}: ${esc(t.reference_basis)}</div>` : ''}
      ${t.default_interval_months ? `<div class="muted small">${bi('in.interval')}: ${fmtNumber(t.default_interval_months)}</div>` : ''}
      ${t.required_docs_vi || t.required_docs_zh ? `<div class="muted small">${bi('in.required_docs')}: ${biName(t, 'required_docs')}</div>` : ''}
      ${canEdit ? `<div class="row"><button type="button" class="btn tiny" data-ty="${esc(t.inspection_type_id)}" ${online ? '' : 'disabled'}>${ICON.edit}<span>${bi('btn.edit')}</span></button></div>` : ''}
    </div>`).join('') || `<p class="muted">${bi('draft.empty')}</p>`}</div>`;
  const edit = async (t) => {
    const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
      <h2>${bi(t ? 'btn.edit' : 'in.type_new')}</h2>
      ${textInput('code', 'col.code', t ? t.code : '', { maxlength: 32, upper: true, required: true })}
      ${bilingualInputs('name', t)}
      <p class="muted small">${bi('in.no_mt')}</p>
      ${textInput('reference_basis', 'in.reference_basis', t ? t.reference_basis : '', { maxlength: 300 })}
      ${numberInput('default_interval_months', 'in.interval', t ? t.default_interval_months : '', { integer: true })}
      ${bilingualInputs('required_docs', t, { required: false, labelKey: 'in.required_docs', area: true, maxlength: 500 })}
      ${t ? `<label class="check"><input type="checkbox" id="f-active" ${t.active !== false ? 'checked' : ''}><span>${bi('material_active.TRUE')}</span></label>` : ''}
      <p class="form-err err"></p>
      <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div>
    </div></div>`);
    document.body.appendChild(wrap);
    wireForm(wrap);
    $('[data-x="cancel"]', wrap).addEventListener('click', () => wrap.remove());
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const payload = {
        inspection_type_id: t ? t.inspection_type_id : uuid(), code: readField(wrap, 'code'), name_vi: readField(wrap, 'name_vi'), name_zh: readField(wrap, 'name_zh'),
        reference_basis: readField(wrap, 'reference_basis'), default_interval_months: readField(wrap, 'default_interval_months'),
        required_docs_vi: readField(wrap, 'required_docs_vi'), required_docs_zh: readField(wrap, 'required_docs_zh')
      };
      if (t) payload.active = $('#f-active', wrap).checked;
      if (payload.default_interval_months === null) payload.default_interval_months = '';
      const errs = [];
      if (!payload.code) errs.push({ field: 'code', key: 'field.required' });
      if (!payload.name_vi && !payload.name_zh) errs.push({ field: 'name', key: 'field.one_lang' });
      if (Number.isNaN(payload.default_interval_months)) errs.push({ field: 'default_interval_months', key: 'field.invalid' });
      if (errs.length) { showErrors(wrap, errs); return; }
      busy(ev.currentTarget, true);
      const res = await writeOnline('inspection.type.edit', payload, { expected_version: t ? t.record_version : 0 });
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); renderTypes(view, ctx); return; }
      if (res.code === 'VALIDATION_ERROR') { showErrors(wrap, res.errors); return; }
      wrap.remove();
      await handleWriteError(res);
    });
  };
  const add = $('#ty-add', view);
  if (add) add.addEventListener('click', () => edit(null));
  $$('[data-ty]', view).forEach((b) => b.addEventListener('click', () => edit(types.find((x) => x.inspection_type_id === b.dataset.ty))));
}

export { syncNow, canSync, boot, roleLevel, L, fieldWrap, unconfirmedAmbiguous };
