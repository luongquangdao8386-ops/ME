// Sửa chữa (Đợt 2): RP-01 danh sách, RP-03 báo sự cố (cả offline, ảnh hiện trường), RP-02 chi tiết: 6 mốc (C9), phân công,
// xử lý, việc con, chạy thử, gửi nghiệm thu, nghiệm thu không tự duyệt, hủy, mở lại; vật tư MAT-03; WEB-RP-01 (1.4 §5.3, phụ lục 4.4.4)
import { bi, biText, esc, fmtDateTime, fmtNumber, badge, biName, nameText, uuid, isoNowVN, blobToB64, b64ToBytes, L } from '../core.js';
import { ICON, toast, toTop, dialog, h, $, $$ } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, byId, mapOf, can } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit, syncNow } from '../app.js';
import { selectInput, wireForm, showErrors, writeOnline, writeWithPin, oneLang, busy, loadFormDraft, saveFormDraft, clearFormDraft } from '../form.js';
import { processPhoto, uploadDoc } from '../media.js';
import { handleWriteError } from './equipment.js';
import { excelLink } from '../excel-link.js';
import { docsTabHtml, wireDocsTab } from './docs.js';
import { workMatHtml, wireWorkMat, workMatData, localUsageIds } from './workmat.js';
import { replaceDialog } from './partreplace.js';
import {
  myQueue, overlayRepair, localCreations, repairSubmitIssues, statusBadge, prioBadges, eqText, uid, level, PRIORITIES, SEVERITIES,
  queueWork, mergeExecPayload, workerPick, pickCached, REPAIR_OPEN, nextStepHtml, wireNextStep, issueListHtml, wireIssueList
} from '../work.js';

const st = { filter: 'OPEN', sev: '', q: '', page: 0 };
const PAGE = 50;
const FILTERS = { OPEN: ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'], PENDING_ACCEPTANCE: ['PENDING_ACCEPTANCE'], COMPLETED: ['COMPLETED'], CANCELLED: ['CANCELLED'], ALL: null };
const MAX_PHOTOS = 5;

/** "2026-10-14T08:30:00+07:00" ↔ giá trị ô datetime-local (giờ Việt Nam) */
const toLocalInput = (iso) => (iso ? String(iso).slice(0, 16) : '');
const fromLocalInput = (v) => (v ? `${v}:00+07:00` : '');

/** Thời gian dừng máy (giờ) khi có cả dừng và hoạt động lại */
function downtimeText(r) {
  const a = Date.parse(r.stopped_at || ''), b = Date.parse(r.restored_at || '');
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return '';
  return `${fmtNumber((b - a) / 3600000, 1)} h`;
}

/** Phiếu sửa: bản máy chủ hoặc phiếu báo trên máy chưa gửi, đã áp các mục chờ gửi của tôi */
async function repairsAll(ops) {
  const local = localCreations(ops).reps;
  return [...(await recs('REPAIR')), ...local].map((r) => overlayRepair(r, [], ops).repair);
}

/* ======================= RP-01 / WEB-RP-01 ======================= */

export async function renderRepairList(view, ctx) {
  const { shell } = ctx;
  const wide = isWide();
  const canReport = await can('repair.report');
  const excelBtn = await excelLink('repairs_history');
  shell.setScreen({
    title: 'module.repairs', back: '/',
    actions: !wide && canReport ? [{ icon: 'plus', label: biText('rp.new'), onClick: () => navigate('/repairs/new') }] : []
  });
  const ops = await myQueue();
  const eqs = await mapOf('EQUIPMENT');
  const locs = await mapOf('LOCATION');
  const ql = st.q.trim().toLowerCase();
  const base = (await repairsAll(ops)).filter((r) => {
    if (st.sev && r.severity !== st.sev) return false;
    const e = eqs.get(r.equipment_id);
    return !ql || [r.repair_code, r.symptom_vi, r.symptom_zh, e && e.equipment_code, e && e.name_vi, e && e.name_zh].join(' ').toLowerCase().includes(ql);
  });
  const count = (k) => base.filter((r) => !FILTERS[k] || FILTERS[k].includes(r.status)).length;
  const sevRank = (r) => SEVERITIES.indexOf(r.severity);
  const list = base.filter((r) => !FILTERS[st.filter] || FILTERS[st.filter].includes(r.status))
    .sort((a, b) => (st.filter === 'OPEN' ? sevRank(a) - sevRank(b) : 0) || String(b.reported_at || '').localeCompare(String(a.reported_at || '')));
  const toolbar = `<div class="toolbar">
    <div class="search"><span>${ICON.search}</span><input id="rp-q" type="search" value="${esc(st.q)}" placeholder="${esc(biText('wk.search_placeholder'))}" autocomplete="off"></div>
    <div class="chips">${Object.keys(FILTERS).map((k) => `<button type="button" class="chip${st.filter === k ? ' on' : ''}" data-f="${k}">${bi('rp.filter.' + k)} <span class="count">${count(k)}</span></button>`).join('')}</div>
    <div class="chips">${['', ...SEVERITIES].map((s) => `<button type="button" class="chip${st.sev === s ? ' on' : ''}" data-sev="${s}">${s ? bi('severity.' + s) : bi('rp.sev_all')}</button>`).join('')}</div>
    <div class="row tools">
      ${wide && canReport ? `<a class="btn small primary" href="#/repairs/new">${ICON.plus}<span>${bi('rp.new')}</span></a>` : ''}
      ${excelBtn}
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${ICON.reports}<span>${bi('btn.report')}</span><span class="soon">${bi('tag.coming_soon')}</span></button>
    </div>
    <p class="muted small">${bi('field.total', { N: list.length })}</p></div>`;
  let body;
  if (!list.length) {
    body = `<div class="card empty-state">${ICON.repairs}<p class="muted">${bi('field.no_records')}</p>${canReport ? `<a class="btn small primary" href="#/repairs/new">${bi('rp.new')}</a>` : ''}</div>`;
  } else if (wide) {
    const shown = list.slice(st.page * PAGE, st.page * PAGE + PAGE);
    body = `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.code')}</th><th>${bi('module.equipment')}</th><th>${bi('rp.symptom')}</th><th>${bi('rp.severity')}</th>
      <th>${bi('rp.reported_at')}</th><th>${bi('rp.reported_by')}</th><th>${bi('wk.col.assignee')}</th><th>${bi('rp.downtime')}</th><th>${bi('col.status')}</th></tr></thead>
      <tbody>${shown.map((r) => { const e = eqs.get(r.equipment_id); const l = e ? locs.get(e.location_id) : null; return `<tr class="click" data-href="/repairs/${esc(r.repair_id)}">
        <td class="code">${r.repair_code ? esc(r.repair_code) : bi('tag.pending_code')}</td><td>${esc(eqText(e))}${l ? `<div class="muted small">${esc(l.location_code)}</div>` : ''}</td>
        <td>${biName(r, 'symptom')}</td><td>${r.severity ? badge('severity.' + r.severity) : ''} ${r.priority && r.priority !== 'NORMAL' ? badge('priority.' + r.priority) : ''}</td>
        <td class="num">${esc(fmtDateTime(r.reported_at))}</td><td>${esc(r.reported_by_name || '')}</td><td>${esc(r.assignee_name || '')}</td>
        <td>${r.stopped_at && !r.restored_at ? badge('rp.machine_down') : esc(downtimeText(r))}</td>
        <td>${statusBadge('REPAIR', r.status)} ${r._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      ${list.length > PAGE ? `<div class="row pager"><button type="button" class="btn small" id="rp-prev" ${st.page ? '' : 'disabled'}>‹</button><span class="muted small">${st.page + 1} / ${Math.ceil(list.length / PAGE)}</span><button type="button" class="btn small" id="rp-next" ${(st.page + 1) * PAGE < list.length ? '' : 'disabled'}>›</button></div>` : ''}`;
  } else {
    body = `<div class="cards">${list.map((r) => { const e = eqs.get(r.equipment_id); return `<a class="card rec-card" href="#/repairs/${esc(r.repair_id)}">
      <div class="rec-top"><span class="code">${r.repair_code ? esc(r.repair_code) : bi('tag.pending_code')}</span>${statusBadge('REPAIR', r.status)}</div>
      <div class="rec-name">${biName(r, 'symptom')}</div>
      <div class="muted small">${esc(eqText(e))}</div>
      <div class="dates"><span>${bi('rp.reported_at')}: <strong>${esc(fmtDateTime(r.reported_at))}</strong></span>${r.assignee_name ? `<span>${bi('wk.col.assignee')}: <strong>${esc(r.assignee_name)}</strong></span>` : ''}</div>
      <div class="rec-badges">${prioBadges(r, 'REPAIR')} ${r.stopped_at && !r.restored_at && REPAIR_OPEN.has(r.status) ? badge('rp.machine_down') : ''} ${r._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</div></a>`; }).join('')}</div>`;
  }
  view.innerHTML = toolbar + body;
  const again = () => renderRepairList(view, ctx);
  $$('[data-f]', view).forEach((b) => b.addEventListener('click', () => { st.filter = b.dataset.f; st.page = 0; again(); }));
  $$('[data-sev]', view).forEach((b) => b.addEventListener('click', () => { st.sev = b.dataset.sev; st.page = 0; again(); }));
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href)));
  const prev = $('#rp-prev', view), next = $('#rp-next', view);
  if (prev) prev.addEventListener('click', () => { st.page = Math.max(0, st.page - 1); again().then(toTop); });
  if (next) next.addEventListener('click', () => { st.page++; again().then(toTop); });
  let tm = null;
  $('#rp-q', view).addEventListener('input', (e) => { st.q = e.target.value; st.page = 0; clearTimeout(tm); tm = setTimeout(async () => { const pos = e.target.selectionStart; await again(); const el = $('#rp-q', view); el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ } }, 250); });
}

/* ======================= RP-03 Báo sự cố ======================= */

/**
 * Báo sự cố: thiết bị, hiện tượng (một thứ tiếng), mức độ bắt chọn không chọn sẵn (C4), dừng máy, ảnh hiện trường.
 * Không mạng: phiếu + ảnh vào hàng chờ (ảnh gửi sau phiếu). /repairs/:id/edit: sửa phiếu còn Mới báo (repair.editReport).
 */
export async function renderReportForm(view, ctx) {
  const { shell, params, query } = ctx;
  const editId = params.id || '';
  shell.setScreen({ title: editId ? 'rp.edit' : 'rp.new', back: editId ? `/repairs/${editId}` : '/repairs' });
  if (!(await can(editId ? 'repair.editReport' : 'repair.report'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const ops = await myQueue();
  let rec = null;
  if (editId) {
    const server = await byId('REPAIR', editId);
    const loc = server ? null : localCreations(ops).reps.find((r) => r.repair_id === editId);
    rec = server || loc ? overlayRepair(server || loc, [], ops).repair : null;
    if (!rec) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
    if (rec.status !== 'REPORTED' || (level() < 3 && rec.reported_by !== uid())) { view.innerHTML = `<div class="card">${bi('rp.edit_closed')}</div>`; return; }
  }
  const eqs = (await recs('EQUIPMENT')).filter((e) => !e.archived_at).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const draftKey = editId ? 'rp-edit:' + editId : 'rp-new';
  const draft = (await loadFormDraft(draftKey)) || {};
  const v0 = {
    equipment_id: draft.equipment_id ?? (rec ? rec.equipment_id : ((query && query.get('equipment')) || '')),
    symptom: draft.symptom ?? (rec ? (rec.symptom_vi || rec.symptom_zh || '') : ''),
    severity: draft.severity ?? (rec ? rec.severity : ''),
    stopped: draft.stopped ?? !!(rec && rec.stopped_at),
    stopped_at: draft.stopped_at ?? (rec ? toLocalInput(rec.stopped_at) : ''),
    photos: editId ? [] : (draft.photos || [])
  };
  const preEq = v0.equipment_id && eqs.find((e) => e.equipment_id === v0.equipment_id);
  view.innerHTML = `<form class="card form-card" novalidate>
    <div class="form-grid">
      ${selectInput('equipment_id', 'module.equipment', eqs.map((e) => [e.equipment_id, esc(eqText(e))]), v0.equipment_id, { required: true })}
      <div class="fld" data-field="symptom"><label for="f-symptom">${bi('rp.symptom')} <span class="req">*</span></label>
        <textarea class="inp" id="f-symptom" rows="3" maxlength="1000" placeholder="${esc(biText('rp.symptom_hint'))}">${esc(v0.symptom)}</textarea>
        <div class="hint">${bi('field.one_lang')}</div><div class="ferr" role="alert"></div></div>
      <fieldset class="bi-pair" data-field="severity"><legend>${bi('rp.severity')} <span class="req">*</span></legend>
        <div class="segs">${SEVERITIES.map((s) => `<button type="button" class="seg${v0.severity === s ? ' on s-sev-' + s.toLowerCase() : ''}" data-sev="${s}" aria-pressed="${v0.severity === s}">${bi('severity.' + s)}</button>`).join('')}</div>
        <div class="hint">${bi('rp.severity_hint')}</div><div class="ferr" role="alert"></div></fieldset>
      <div class="fld" data-field="stopped_at">
        <label class="check"><input type="checkbox" id="f-stopped" ${v0.stopped ? 'checked' : ''}><span>${bi('rp.machine_stopped')}</span></label>
        <div id="rp-stop-at" ${v0.stopped ? '' : 'hidden'}><label for="f-stopped_at">${bi('rp.stopped_at')}</label><input class="inp" type="datetime-local" id="f-stopped_at" value="${esc(v0.stopped_at || toLocalInput(isoNowVN()))}"></div>
        <div class="ferr" role="alert"></div></div>
    </div>
    ${preEq && !editId ? `<p class="muted small">${bi('rp.for_equipment', { C: esc(preEq.equipment_code) })}</p>` : ''}
    ${editId ? '' : `<section class="rp-photos"><h3>${bi('rp.photos')}</h3><div class="photos" id="rp-photo-list"></div>
      <label class="btn small file">${ICON.camera}<span>${bi('rp.add_photo')}</span><input type="file" accept="image/*" id="rp-photo" hidden></label>
      <p class="muted small">${bi('rp.photo_help', { N: MAX_PHOTOS })}</p></section>`}
    ${!navigator.onLine ? `<p class="banner info">${bi('rp.offline_report')}</p>` : ''}
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi(editId ? 'btn.save' : 'rp.send')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  const v = { ...v0, photos: v0.photos.slice() };
  const saveDraft = () => saveFormDraft(draftKey, v);
  const paintPhotos = () => {
    const box = $('#rp-photo-list', form);
    if (!box) return;
    box.innerHTML = v.photos.map((p, i) => `<figure class="photo"><img src="data:image/jpeg;base64,${p.thumb_b64 || p.main_b64}" alt="${esc(biText('rp.photos'))} ${i + 1}">
      <figcaption><button type="button" class="btn tiny" data-rm="${i}" aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button></figcaption></figure>`).join('');
    $$('[data-rm]', box).forEach((b) => b.addEventListener('click', () => { v.photos.splice(Number(b.dataset.rm), 1); saveDraft(); paintPhotos(); }));
    const add = $('#rp-photo', form);
    if (add) add.closest('label').hidden = v.photos.length >= MAX_PHOTOS;
  };
  paintPhotos();
  $('#f-equipment_id', form).addEventListener('change', (e) => { v.equipment_id = e.target.value; saveDraft(); });
  $('#f-symptom', form).addEventListener('input', (e) => { v.symptom = e.target.value; saveDraft(); });
  $$('[data-sev]', form).forEach((b) => b.addEventListener('click', () => {
    v.severity = b.dataset.sev;
    $$('[data-sev]', form).forEach((x) => { const on = x.dataset.sev === v.severity; x.className = 'seg' + (on ? ' on s-sev-' + x.dataset.sev.toLowerCase() : ''); x.setAttribute('aria-pressed', String(on)); });
    const fs = $('[data-field="severity"]', form);
    fs.classList.remove('bad');
    $(':scope > .ferr', fs).textContent = '';
    saveDraft();
  }));
  $('#f-stopped', form).addEventListener('change', (e) => { v.stopped = e.target.checked; $('#rp-stop-at', form).hidden = !v.stopped; if (v.stopped && !v.stopped_at) v.stopped_at = $('#f-stopped_at', form).value; saveDraft(); });
  $('#f-stopped_at', form).addEventListener('change', (e) => { v.stopped_at = e.target.value; saveDraft(); });
  const pin = $('#rp-photo', form);
  if (pin) pin.addEventListener('change', async () => {
    const f = pin.files[0];
    pin.value = '';
    if (!f || v.photos.length >= MAX_PHOTOS) return;
    const ph = await processPhoto(f);
    v.photos.push({ main_b64: await blobToB64(ph.main), thumb_b64: ph.thumb ? await blobToB64(ph.thumb) : '' });
    await saveDraft();
    paintPhotos();
  });
  $('#fm-cancel', form).addEventListener('click', async () => { await clearFormDraft(draftKey); back(editId ? `/repairs/${editId}` : '/repairs'); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errs = [];
    if (!v.equipment_id) errs.push({ field: 'equipment_id', key: 'field.required' });
    if (!String(v.symptom || '').trim()) errs.push({ field: 'symptom', key: 'field.required' });
    if (!v.severity) errs.push({ field: 'severity', key: 'rp.severity_required' });
    const stopIso = v.stopped ? fromLocalInput(v.stopped_at || $('#f-stopped_at', form).value) : '';
    if (v.stopped && stopIso && Date.parse(stopIso) > Date.now() + 5 * 60000) errs.push({ field: 'stopped_at', key: 'mt.issue.time_order' });
    if (errs.length) { showErrors(form, errs); return; }
    const btn = $('#fm-save', form);
    const sym = oneLang('symptom', v.symptom);
    if (editId) {
      const p = { repair_id: editId, ...sym, severity: v.severity, stopped_at: stopIso };
      if (v.equipment_id !== rec.equipment_id) p.equipment_id = v.equipment_id;
      const local = rec._local || ops.some((o) => (o.entity_id === editId || o.parent_id === editId) && o.state !== 'REJECTED' && o.state !== 'CONFLICT');
      let res;
      if (!navigator.onLine || local) {
        await queueWork('repair.editReport', p, { entity_type: 'REPAIR', entity_id: editId, expected_version: Number(rec.record_version || 0), chain: true, merge: (a, b) => ({ ...a, ...b }) });
        res = { queued: true };
      } else {
        busy(btn, true);
        res = await writeOnline('repair.editReport', p, { expected_version: rec.record_version });
        busy(btn, false);
      }
      if (res.queued || res.ok) {
        await clearFormDraft(draftKey);
        if (res.ok) await afterCommit();
        toast(bi(res.queued ? 'sync.local_saved' : 'form.saved'), 'ok');
        navigate(`/repairs/${editId}`, { replace: true });
        return;
      }
      if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; }
      await handleWriteError(res); return;
    }
    const p = { repair_id: uuid(), equipment_id: v.equipment_id, ...sym, severity: v.severity, reported_at: isoNowVN() };
    if (v.stopped) { p.machine_stopped = true; if (stopIso) p.stopped_at = stopIso; }
    const photos = v.photos.slice();
    if (!navigator.onLine) {
      await queueWork('repair.report', p, { entity_type: 'REPAIR', entity_id: p.repair_id, expected_version: 0, chain: true });
      for (const [i, ph] of photos.entries()) {
        const d = { document_id: uuid(), entity_type: 'REPAIR', entity_id: p.repair_id, kind: 'PHOTO_SITE', mime_type: 'image/jpeg', content_b64: ph.main_b64, ...photoLabel(i) };
        if (ph.thumb_b64) d.thumb_b64 = ph.thumb_b64;
        await queueWork('doc.upload', d, { entity_type: 'DOCUMENT', entity_id: d.document_id, expected_version: 0, parent_id: p.repair_id, chain: false });
      }
      await clearFormDraft(draftKey);
      toast(bi('rp.saved_offline'), 'ok');
      navigate(`/repairs/${p.repair_id}`, { replace: true });
      return;
    }
    busy(btn, true);
    const res = await writeOnline('repair.report', p);
    if (!res.ok) { busy(btn, false); if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; } await handleWriteError(res); return; }
    await clearFormDraft(draftKey);
    // Ảnh gửi sau khi có phiếu; lỗi mạng giữa chừng → ảnh còn lại vào hàng chờ, không mất
    let failed = 0;
    for (const [i, ph] of photos.entries()) {
      const blob = new Blob([b64ToBytes(ph.main_b64)], { type: 'image/jpeg' });
      const thumb = ph.thumb_b64 ? new Blob([b64ToBytes(ph.thumb_b64)], { type: 'image/jpeg' }) : null;
      const r = await uploadDoc({ entity_type: 'REPAIR', entity_id: p.repair_id, kind: 'PHOTO_SITE', blob, mime: 'image/jpeg', thumb, ...photoLabel(i) });
      if (!r.ok) {
        failed++;
        if (['NETWORK_ERROR', 'SERVER_BUSY', 'UNKNOWN_RESULT'].includes(r.code)) {
          const d = { document_id: uuid(), entity_type: 'REPAIR', entity_id: p.repair_id, kind: 'PHOTO_SITE', mime_type: 'image/jpeg', content_b64: ph.main_b64, ...photoLabel(i) };
          if (ph.thumb_b64) d.thumb_b64 = ph.thumb_b64;
          await queueWork('doc.upload', d, { entity_type: 'DOCUMENT', entity_id: d.document_id, expected_version: 0, parent_id: p.repair_id, chain: false });
        }
      }
    }
    busy(btn, false);
    await afterCommit();
    toast(failed ? bi('rp.photos_failed', { N: failed }) : bi('rp.sent', { C: (res.data && res.data.display_code) || '' }), failed ? 'err' : 'ok');
    navigate(`/repairs/${p.repair_id}`, { replace: true });
  });
}

/** Tên ảnh hiện trường đủ hai thứ tiếng (từ điển, không cần dịch máy); i: số thứ tự (từ 0) hoặc bỏ trống */
function photoLabel(i) {
  const [vi, zh] = L['rp.photo_site'] || [biText('rp.photo_site'), ''];
  const n = i === undefined ? '' : ` ${i + 1}`;
  return { title_vi: vi + n, title_zh: zh ? zh + n : '' };
}

/* ======================= RP-02 Chi tiết phiếu sửa ======================= */

export async function renderRepair(view, ctx) {
  const seq = (view._renderSeq = (view._renderSeq || 0) + 1);
  const { shell, params } = ctx;
  const ops = await myQueue();
  const server = await byId('REPAIR', params.id);
  const localNew = server ? null : localCreations(ops).reps.find((r) => r.repair_id === params.id);
  const base = server || localNew;
  shell.setScreen({
    title: 'rp.title', back: '/repairs',
    actions: server && server.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/REPAIR/${server.repair_id}`) }] : []
  });
  if (!base) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const tasks0 = (await recs('REPAIR_TASK')).filter((t) => t.repair_id === base.repair_id && !t.archived_at)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const ov = overlayRepair(base, tasks0, ops);
  // Thay đổi chưa lưu trên form (C2)
  const draftKey = 'rp-exec:' + base.repair_id;
  const draft = (await loadFormDraft(draftKey)) || { fields: {}, tasks: {} };
  const r = { ...ov.repair, ...draft.fields };
  const tasks = ov.tasks.map((t) => ({ ...t, ...(draft.tasks[t.repair_task_id] || {}) })).filter((t) => !t.remove);
  for (const [id, t] of Object.entries(draft.tasks)) if (t._new && !tasks.some((x) => x.repair_task_id === id)) tasks.push({ repair_task_id: id, status: 'PENDING', ...t });
  const dirty = Object.keys(draft.fields).length > 0 || Object.keys(draft.tasks).length > 0;
  const e = await byId('EQUIPMENT', r.equipment_id);
  const loc = e && e.location_id ? await byId('LOCATION', e.location_id) : null;
  const cause = r.root_cause_code ? (await recs('LOOKUP')).find((l) => l.group_key === 'CAUSE' && l.code === r.root_cause_code) : null;
  const vendor = r.vendor_id ? await byId('VENDOR', r.vendor_id) : null;
  const u = uid();
  const lead = level() >= 3;
  const p = {
    process: await can('repair.process'), submit: await can('repair.submit'), accept: await can('repair.accept'), assign: await can('repair.assign'),
    cancel: await can('repair.cancel'), reopen: await can('repair.reopen'), edit: await can('repair.editReport'), replace: await can('part.replace'),
    upload: await can('doc.upload'), report: await can('repair.report'), pick: await can('user.pickList'), lookup: await can('lookup.edit')
  };
  const assignees = [r.assignee_user_id, ...tasks0.map((t) => t.assignee_user_id)].filter(Boolean);
  const mineAssigned = assignees.includes(u);
  const canProc = p.process && (lead || mineAssigned) && !localNew;
  const processing = r.status === 'IN_PROGRESS' && canProc;
  const online = navigator.onLine;
  const usageData = localNew ? { usage: [] } : await workMatData('REPAIR', r);
  const issues = repairSubmitIssues(r, tasks);
  const notSelf = ![r.reported_by, r.submitted_by, ...assignees].includes(u);
  const showAccept = r.status === 'PENDING_ACCEPTANCE' && !r._local_submit && p.accept && notSelf;
  const queuedDocs = ops.filter((o) => o.action === 'doc.upload' && o.parent_id === r.repair_id && o.state !== 'REJECTED');
  const canEditReport = p.edit && r.status === 'REPORTED' && (lead || r.reported_by === u);
  const canCancel = p.cancel && !localNew && ((lead && REPAIR_OPEN.has(r.status)) || (!lead && r.reported_by === u && r.status === 'REPORTED' && !r.assignee_user_id));
  // Bước tiếp theo: ai bấm gì; phiếu Mới báo/Đã phân công thì khung Xử lý còn khóa tới khi bấm Bắt đầu sửa
  const who = r.assignee_name || biText('field.not_set');
  const doer = mineAssigned || !r.assignee_user_id;
  const next = localNew ? null
    : r.status === 'REPORTED' ? (p.assign ? { key: 'rp.next.assign', target: 'rp-assign', at: 'top' } : { key: 'rp.next.wait_assign', wait: true })
      : r.status === 'ASSIGNED' ? (canProc && doer ? { key: 'rp.next.start', target: 'rp-start', at: 'top' } : { key: 'rp.next.wait_start', vars: { NAME: who }, wait: true })
        : r.status === 'IN_PROGRESS' ? (processing && doer ? { key: 'rp.next.do', target: 'rp-submit', at: 'exec' } : { key: 'rp.next.wait_submit', vars: { NAME: who }, wait: true })
          : r.status === 'PENDING_ACCEPTANCE' ? (r._local_submit ? { key: 'mt.next.wait_sync', wait: true } : showAccept ? { key: 'mt.next.accept', target: 'rp-accept', at: 'exec' } : { key: p.accept ? 'rp.self_no_accept' : 'mt.wait_accept', wait: true })
            : null;
  const execLocked = ['REPORTED', 'ASSIGNED'].includes(r.status);
  const kv = (k, v) => (v ? `<div class="kv"><span>${bi(k)}</span><strong>${v}</strong></div>` : '');
  const dis = processing ? '' : 'disabled';
  const dt = (id, k, val, now = false) => `<div class="fld" data-field="${k}"><label for="f-${id}">${bi('rp.ms.' + k)}</label><div class="row"><input class="inp" type="datetime-local" id="f-${id}" data-time="${k}" value="${esc(toLocalInput(val))}" ${dis}>${now && processing ? `<button type="button" class="btn tiny" data-now="${k}">${bi('mt.now')}</button>` : ''}</div><div class="ferr"></div></div>`;
  const txt = (k, labelKey, area = false) => {
    const val = r[k + '_vi'] || r[k + '_zh'] || '';
    const other = r[k + '_vi'] && r[k + '_zh'] && r.i18n_meta && r.i18n_meta[k] && r.i18n_meta[k].state === 'MACHINE' ? (r.i18n_meta[k].src === 'vi' ? r[k + '_zh'] : r[k + '_vi']) : '';
    return `<div class="fld" data-field="${k}"><label for="f-${k}">${bi(labelKey)}</label>${area ? `<textarea class="inp" id="f-${k}" data-text="${k}" rows="2" maxlength="1000" ${dis}>${esc(val)}</textarea>` : `<input class="inp" type="text" id="f-${k}" data-text="${k}" maxlength="500" value="${esc(val)}" ${dis}>`}
      ${other ? `<div class="muted small">${esc(other)} <span class="tag mt">${bi('tag.machine_translated')}</span></div>` : ''}<div class="ferr"></div></div>`;
  };
  const causes = (await recs('LOOKUP')).filter((l) => l.group_key === 'CAUSE' && (l.active !== false || l.code === r.root_cause_code)).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const vendors = (await recs('VENDOR')).filter((x) => !x.archived_at && (x.active !== false || x.vendor_id === r.vendor_id)).sort((a, b) => String(a.vendor_code).localeCompare(String(b.vendor_code)));
  // Danh sách người (việc con): không chờ mạng mỗi lần vẽ lại; lấy khi mở hộp thoại, có sẵn thì dùng để hiện tên
  const users = processing && online && p.pick ? (pickCached() || []) : [];
  const pickUsers = async () => (processing && navigator.onLine && p.pick ? workerPick().catch(() => []) : []);
  const taskRow = (t) => {
    const who = t.assignee_name || (users.find((x) => x.user_id === t.assignee_user_id) || {}).display_name || (t.assignee_user_id === u ? biText('rp.me') : '');
    const editable = processing && (lead || t.assignee_user_id === u || !t.assignee_user_id || t._new);
    const d = editable ? '' : 'disabled';
    return `<li class="rp-task" data-field="tasks[${esc(t.repair_task_id)}]" data-task="${esc(t.repair_task_id)}">
      <div class="rec-top"><strong>${esc(t.task_vi || t.task_zh || '')}</strong><span>${badge('task_status.' + (t.status || 'PENDING'))} ${t._local || t._new ? `<span class="badge t-amber">${bi(t._new ? 'mt.unsaved_short' : 'sync.local_saved')}</span>` : ''}</span></div>
      <div class="muted small">${bi('wk.col.assignee')}: ${esc(who || biText('field.not_set'))}${t.start_at ? ` · ${esc(fmtDateTime(t.start_at))}` : ''}${t.end_at ? ` → ${esc(fmtDateTime(t.end_at))}` : ''}</div>
      ${t.result_vi || t.result_zh ? `<div class="small">${bi('rp.task_result')}: ${esc(t.result_vi || t.result_zh)}</div>` : ''}
      ${editable ? `<div class="row">${['IN_PROGRESS', 'DONE', 'CANCELLED'].filter((s) => s !== t.status).map((s) => `<button type="button" class="btn tiny" data-tstat="${s}" ${d}>${bi('task_status.' + s)}</button>`).join('')}
        <button type="button" class="btn tiny" data-tedit="1" ${d}>${ICON.edit}<span>${bi('btn.edit')}</span></button></div>` : ''}
      <div class="ferr small"></div></li>`;
  };
  const timeline = [['reported_at', r.reported_at], ['assigned_at', r.assigned_at], ['repair_start_at', r.repair_start_at], ['repair_end_at', r.repair_end_at], ['restored_at', r.restored_at], ['approved_at', r.approved_at]];
  // Ảnh/tài liệu: người được giao (hoặc C3/C4) khi phiếu còn mở; người báo thêm ảnh hiện trường khi còn Mới báo.
  // Dựng sẵn trước khi thay nội dung màn để lúc vẽ lại (chọn nguyên nhân, Bây giờ…) trang không ngắn lại → giữ chỗ đang xem
  const docWork = p.upload && REPAIR_OPEN.has(r.status) && (lead || mineAssigned);
  const docReporter = p.report && r.status === 'REPORTED' && r.reported_by === u;
  const docsHtml = localNew ? `<p class="muted small">${bi('rp.local_new_note')}</p>` : await docsTabHtml('REPAIR', r, {
    canUpload: docWork || docReporter, photoOnly: !docWork && docReporter,
    photoButtons: [{ key: 'rp.add_photo', ...photoLabel() }]
  });
  // Đổi ô liên tiếp → nhiều lần vẽ chạy cùng lúc: chỉ lần bắt đầu sau cùng (nháp mới nhất) được ghi lên màn, lần cũ xong
  // muộn không ghi đè (không thì màn hiện nội dung cũ và lần đổi ô sau lưu nháp cũ, mất chữ vừa gõ)
  if (seq !== view._renderSeq) return;
  view.innerHTML = `<section class="card">
    ${ov.rejected.length ? `<p class="banner warn">${bi('mt.has_rejected')} <a href="#/account/drafts">${bi('draft.title')}</a></p>` : ''}
    ${ov.blocked ? `<p class="banner warn">${bi('mt.blocked')}</p>` : ''}
    ${r.returned_reason && r.status === 'IN_PROGRESS' && r.acceptance_result === 'FAIL' ? `<p class="banner warn">${bi('mt.returned')}: ${esc(r.returned_reason)}</p>` : ''}
    ${r.reopen_reason && REPAIR_OPEN.has(r.status) ? `<p class="banner info">${bi('rp.reopened')}: ${esc(r.reopen_reason)}</p>` : ''}
    <div class="rec-top"><span class="code big">${r.repair_code ? esc(r.repair_code) : bi('tag.pending_code')}</span><span>${statusBadge('REPAIR', r.status)} ${prioBadges(r, 'REPAIR')} ${r.stopped_at && !r.restored_at && REPAIR_OPEN.has(r.status) ? badge('rp.machine_down') : ''} ${ov.local || localNew ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</span></div>
    <h2 class="eq-name">${biName(r, 'symptom')}</h2>
    <div class="kv-grid">
      ${kv('module.equipment', e ? `<a href="#/equipment/${esc(e.equipment_id)}">${esc(eqText(e))}</a>` : '')}
      ${kv('field.location', loc ? esc(`${loc.location_code} · ${nameText(loc)}`) : '')}
      ${kv('rp.reported_by', esc(r.reported_by_name || (r.reported_by === u ? biText('rp.me') : '')))}
      ${kv('wk.col.assignee', esc(r.assignee_name || biText('field.not_set')))}
      ${kv('rp.stopped_at', r.stopped_at ? esc(fmtDateTime(r.stopped_at)) : '')}
      ${kv('rp.downtime', esc(downtimeText(r)))}
      ${kv('rp.root_cause', cause ? `${esc(cause.code)} · ${biName(cause)}` : '')}
      ${kv('rp.vendor', vendor ? esc(`${vendor.vendor_code} · ${nameText(vendor)}`) : '')}
      ${kv('rp.test_run', r.test_run_result ? badge('check_result.' + r.test_run_result) : '')}
      ${r.source_work_order_id ? kv('rp.from_wo', `<a href="#/maintenance/wo/${esc(r.source_work_order_id)}">${bi('mt.wo')}</a>`) : ''}
      ${r.approved_at ? kv('mt.accepted', `${esc(r.approved_by_name || '')} · ${esc(fmtDateTime(r.approved_at))}`) : ''}
      ${r.cancel_reason ? kv('mt.cancel_reason', esc(r.cancel_reason)) : ''}
    </div>
    <div class="row">
      ${canProc && r.status === 'ASSIGNED' ? `<button type="button" class="btn primary" id="rp-start">${ICON.check}<span>${bi('rp.start')}</span></button>` : ''}
      ${p.assign && ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status) && !localNew ? `<button type="button" class="btn small${r.status === 'REPORTED' ? ' primary' : ''}" id="rp-assign" ${online ? '' : 'disabled'}>${bi('rp.assign')}</button>` : ''}
      ${canEditReport ? `<a class="btn small" href="#/repairs/${esc(r.repair_id)}/edit">${ICON.edit}<span>${bi('rp.edit')}</span></a>` : ''}
      ${p.replace && processing && e ? `<button type="button" class="btn small" id="rp-replace">${bi('part.replace')}</button>` : ''}
      ${canCancel ? `<button type="button" class="btn small" id="rp-cancel" ${online ? '' : 'disabled'}>${bi('rp.cancel')}</button>` : ''}
      ${p.reopen && ['COMPLETED', 'CANCELLED'].includes(r.status) && !localNew ? `<button type="button" class="btn small" id="rp-reopen" ${online ? '' : 'disabled'}>${bi('rp.reopen')}</button>` : ''}
    </div>
    ${!online && (p.assign || canCancel) ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
    ${localNew ? `<p class="muted small">${bi('rp.local_new_note')}</p>` : ''}
    ${nextStepHtml(next, 'top')}
  </section>
  <section class="card"><h3>${bi('rp.milestones')}</h3><ul class="list timeline">
    ${timeline.map(([k, t]) => `<li class="${t ? 'done' : 'todo'}"><span class="dot"></span><span>${bi('rp.ms.' + k)}</span><strong>${t ? esc(fmtDateTime(t)) : `<span class="muted">${bi('field.not_set')}</span>`}</strong></li>`).join('')}
    </ul>${r.stopped_at ? `<p class="muted small">${bi('rp.stopped_at')}: ${esc(fmtDateTime(r.stopped_at))}${r.restored_at ? '' : ` · ${bi('rp.machine_down')}`}</p>` : ''}</section>
  ${!localNew && (['IN_PROGRESS', 'PENDING_ACCEPTANCE', 'COMPLETED'].includes(r.status) || canProc) ? `<section class="card exec-card" id="rp-exec">
    <h3>${bi('rp.processing')}</h3>
    ${execLocked ? `<p class="muted small">${bi('rp.exec_locked')}</p>` : ''}
    <div class="form-grid">
      ${dt('rs', 'repair_start_at', r.repair_start_at)}
      ${dt('re', 'repair_end_at', r.repair_end_at, true)}
      ${dt('sa', 'stopped_at', r.stopped_at)}
      ${dt('ra', 'restored_at', r.restored_at, true)}
      <div class="fld" data-field="downtime_note"><label for="f-downtime_note">${bi('mt.downtime_note')}</label><input class="inp" type="text" id="f-downtime_note" maxlength="500" value="${esc(r.downtime_note || '')}" ${dis}><div class="ferr"></div></div>
      ${txt('diagnosis', 'rp.diagnosis', true)}
      <div class="fld" data-field="root_cause_code"><label for="f-root_cause_code">${bi('rp.root_cause')}</label><select class="inp sel" id="f-root_cause_code" ${dis}><option value="">${bi('field.choose')}</option>${causes.map((c) => `<option value="${esc(c.code)}"${c.code === r.root_cause_code ? ' selected' : ''}>${esc(c.code)} · ${esc(nameText(c))}</option>`).join('')}</select>${!causes.length ? `<div class="hint">${p.lookup ? `<a href="#/admin/catalog?tab=lookups&amp;group=CAUSE">${bi('rp.no_causes')}</a>` : bi('rp.no_causes')}</div>` : ''}<div class="ferr"></div></div>
      ${txt('action', 'rp.action', true)}
      <div class="fld" data-field="vendor_id"><label for="f-vendor_id">${bi('rp.vendor')}</label><select class="inp sel" id="f-vendor_id" ${dis}><option value="">${bi('field.choose')}</option>${vendors.map((x) => `<option value="${esc(x.vendor_id)}"${x.vendor_id === r.vendor_id ? ' selected' : ''}>${esc(x.vendor_code)} · ${esc(nameText(x))}</option>`).join('')}</select><div class="ferr"></div></div>
      ${txt('outside_service', 'rp.outside_service')}
    </div>
    <fieldset class="bi-pair" data-field="test_run_result"><legend>${bi('rp.test_run')}</legend>
      <div class="segs">${['PASS', 'FAIL'].map((x) => `<button type="button" class="seg${r.test_run_result === x ? ' on s-' + x.toLowerCase() : ''}" data-test="${x}" ${dis}>${bi('check_result.' + x)}</button>`).join('')}</div><div class="ferr"></div></fieldset>
    ${txt('test_run_note', 'rp.test_run_note')}
    <h4>${bi('rp.tasks')}</h4>
    <ul class="list rp-tasks">${tasks.length ? tasks.map(taskRow).join('') : `<li class="muted">${bi('field.not_set')}</li>`}</ul>
    ${processing ? `<div class="row"><button type="button" class="btn small" id="rp-task-add">${ICON.plus}<span>${bi('rp.task_add')}</span></button></div>` : ''}
    ${processing ? `<div class="row form-actions">
      <button type="button" class="btn" id="rp-save" ${dirty ? '' : 'disabled'}>${bi('btn.save')}</button>
      <button type="button" class="btn primary" id="rp-submit" ${issues.length || ov.blocked || ov.rejected.length ? 'disabled' : ''}>${bi('btn.submit_acceptance')}</button>
    </div>${issueListHtml(issues, 'rp-left')}${dirty ? `<p class="muted small">${bi('mt.unsaved')}</p>` : ''}` : ''}
    ${showAccept ? `<div class="row form-actions"><button type="button" class="btn primary" id="rp-accept" ${online ? '' : 'disabled'}>${ICON.check}<span>${bi('btn.accept_pass')}</span></button><button type="button" class="btn" id="rp-return" ${online ? '' : 'disabled'}>${bi('btn.accept_fail')}</button></div>` : ''}
    ${!processing && !showAccept ? nextStepHtml(next, 'exec') : ''}
  </section>` : ''}
  <section class="card tab-body"><h3>${bi('rp.photos')}</h3>${queuedDocs.length ? `<p class="muted small">${bi('mt.photos_queued', { N: queuedDocs.length })}</p>${queuedPhotoThumbs(queuedDocs)}` : ''}<div id="rp-docs">${docsHtml}</div></section>
  ${localNew ? '' : await workMatHtml('REPAIR', r)}`;
  const repaint = () => renderRepair(view, ctx);
  if (!localNew) wireDocsTab($('#rp-docs', view), 'REPAIR', r, repaint);
  if (!localNew) wireWorkMat(view, 'REPAIR', r, repaint);
  const on = (id, fn) => { const el = $('#' + id, view); if (el) el.addEventListener('click', fn); };
  // ----- Nháp form -----
  const saveDraft = () => saveFormDraft(draftKey, draft);
  const setField = async (k, v) => { draft.fields[k] = v; await saveDraft(); };
  // Sửa một ô rồi chạm sang ô nhập khác: chưa vẽ lại cả màn (vẽ lại làm mất ô đang gõ, iPhone tắt bàn phím) — chỉ bật nút
  // Lưu; vẽ lại khi rời hẳn các ô nhập (chạm nút, chạm ra ngoài). Bấm nút (Bây giờ, Đạt…) thì vẽ lại ngay như cũ.
  const afterEdit = (src = null) => {
    if (!view.isConnected) return;
    const a = document.activeElement;
    if (!a || a === src || a === document.body || !view.contains(a) || !a.matches('input, textarea, select')) { repaint(); return; }
    const sv = $('#rp-save', view); if (sv) sv.disabled = false;
    if (a.dataset.leave) return;
    a.dataset.leave = '1';
    a.addEventListener('blur', () => { delete a.dataset.leave; setTimeout(() => afterEdit(), 0); }, { once: true });
  };
  $$('[data-time]', view).forEach((el) => el.addEventListener('change', async () => { await setField(el.dataset.time, fromLocalInput(el.value)); afterEdit(el); }));
  $$('[data-now]', view).forEach((b) => b.addEventListener('click', async () => { await setField(b.dataset.now, isoNowVN()); repaint(); }));
  $$('[data-text]', view).forEach((el) => el.addEventListener('change', async () => {
    const k = el.dataset.text;
    const l = oneLang(k, el.value);
    draft.fields[k + '_vi'] = l[k + '_vi'] || ''; draft.fields[k + '_zh'] = l[k + '_zh'] || '';
    await saveDraft(); afterEdit(el);
  }));
  const dn = $('#f-downtime_note', view); if (dn) dn.addEventListener('change', async () => { await setField('downtime_note', dn.value.trim()); afterEdit(dn); });
  const rc = $('#f-root_cause_code', view); if (rc) rc.addEventListener('change', async () => { await setField('root_cause_code', rc.value); afterEdit(rc); });
  const vd = $('#f-vendor_id', view); if (vd) vd.addEventListener('change', async () => { await setField('vendor_id', vd.value); afterEdit(vd); });
  $$('[data-test]', view).forEach((b) => b.addEventListener('click', async () => { await setField('test_run_result', r.test_run_result === b.dataset.test ? '' : b.dataset.test); repaint(); }));
  // Việc con
  const setTask = async (id, patch) => { draft.tasks[id] = { ...(draft.tasks[id] || {}), ...patch }; await saveDraft(); };
  const taskStatus = async (id, s) => {
    const t = tasks.find((x) => x.repair_task_id === id);
    if (!t) return;
    const patch = { status: s };
    if (s === 'IN_PROGRESS' && !t.start_at) patch.start_at = isoNowVN();
    if (s === 'DONE' && !t.end_at) { patch.end_at = isoNowVN(); if (!t.start_at) patch.start_at = patch.end_at; }
    await setTask(id, patch); repaint();
  };
  // Nút "Xong" trong danh sách mục còn thiếu
  $$('[data-task-done]', view).forEach((b) => b.addEventListener('click', () => taskStatus(b.dataset.taskDone, 'DONE')));
  $$('[data-task]', view).forEach((li) => {
    const id = li.dataset.task;
    const t = tasks.find((x) => x.repair_task_id === id);
    $$('[data-tstat]', li).forEach((b) => b.addEventListener('click', () => taskStatus(id, b.dataset.tstat)));
    const ed = $('[data-tedit]', li);
    if (ed) ed.addEventListener('click', async () => {
      const res = await taskDialog(t, await pickUsers());
      if (!res) return;
      if (res._drop) { delete draft.tasks[id]; await saveDraft(); } else await setTask(id, res);
      repaint();
    });
  });
  on('rp-task-add', async () => {
    const res = await taskDialog(null, await pickUsers());
    if (!res) return;
    await setTask(uuid(), { ...res, _new: true, status: 'PENDING' });
    repaint();
  });
  on('rp-left', () => {
    const first = issues[0];
    const el = first && (view.querySelector(`[data-field="${CSS.escape(first.field)}"]`) || $('#rp-exec', view));
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    toast(issues.slice(0, 4).map((x) => bi(x.key, x.vars)).join(' · '), 'err');
  });
  wireIssueList(view);
  // ----- Ghi -----
  const pendingFor = (list) => list.some((o) => (o.entity_id === r.repair_id || o.parent_id === r.repair_id) && o.state !== 'REJECTED' && o.state !== 'CONFLICT');
  const sendProcess = async (payload) => {
    if (!online || pendingFor(ops)) {
      await queueWork('repair.process', payload, { entity_type: 'REPAIR', entity_id: r.repair_id, expected_version: Number(base.record_version || 0), chain: true, merge: mergeExecPayload });
      return { ok: true, queued: true };
    }
    return writeOnline('repair.process', payload, { expected_version: base.record_version });
  };
  const processPayload = () => {
    const pl = { repair_id: r.repair_id, ...draft.fields };
    const ts = Object.entries(draft.tasks).map(([id, t]) => {
      const o = { repair_task_id: id };
      for (const k of ['assignee_user_id', 'task_vi', 'task_zh', 'result_vi', 'result_zh', 'start_at', 'end_at', 'status', 'remove']) if (t[k] !== undefined) o[k] = t[k];
      return o;
    });
    if (ts.length) pl.tasks = ts;
    return pl;
  };
  const afterWrite = async (res) => {
    if (res.queued) { await clearFormDraft(draftKey); toast(bi('sync.local_saved'), 'ok'); if (online) syncNow({ quiet: true }).then(repaint); repaint(); return true; }
    if (res.ok) { await clearFormDraft(draftKey); await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); return true; }
    if (res.code === 'VALIDATION_ERROR') { showErrors(view, res.errors || []); toast((res.errors || []).slice(0, 3).map((x) => `${x.message_vi} · ${x.message_zh}`).join(' — '), 'err'); return false; }
    await handleWriteError(res); return false;
  };
  on('rp-start', async (ev) => {
    busy(ev.currentTarget, true);
    const res = await sendProcess({ repair_id: r.repair_id, repair_start_at: isoNowVN() });
    busy(ev.currentTarget, false);
    await afterWrite(res);
  });
  on('rp-save', async (ev) => { busy(ev.currentTarget, true); const res = await sendProcess(processPayload()); busy(ev.currentTarget, false); await afterWrite(res); });
  on('rp-submit', async (ev) => {
    const btn = ev.currentTarget;
    busy(btn, true);
    // Lưu thay đổi còn trên form trước; ghi trực tuyến xong thì gửi nghiệm thu theo phiên bản mới (không thì xung đột phiên bản)
    let ver = base.record_version;
    if (dirty) {
      const r1 = await sendProcess(processPayload());
      if (!r1.ok) { busy(btn, false); await afterWrite(r1); return; }
      await clearFormDraft(draftKey);
      if (!r1.queued && r1.record_version) ver = r1.record_version;
    }
    const fresh = await myQueue();
    const expect = {
      documents: fresh.filter((o) => o.action === 'doc.upload' && o.parent_id === r.repair_id && o.state !== 'REJECTED').map((o) => o.payload.document_id),
      usage_lines: localUsageIds(usageData)
    };
    const payload = { repair_id: r.repair_id, expect };
    let res;
    if (!navigator.onLine || pendingFor(fresh)) {
      await queueWork('repair.submit', payload, { entity_type: 'REPAIR', entity_id: r.repair_id, expected_version: Number(base.record_version || 0), chain: true });
      res = { queued: true };
    } else res = await writeOnline('repair.submit', payload, { expected_version: ver });
    busy(btn, false);
    await afterWrite(res);
  });
  on('rp-replace', async () => { if (await replaceDialog('REPAIR', r)) repaint(); });
  on('rp-assign', async () => { if (await assignDialog(r)) repaint(); });
  on('rp-cancel', async () => {
    const reason = await askReason('rp.cancel');
    if (!reason) return;
    const res = await writeOnline('repair.cancel', { repair_id: r.repair_id, reason }, { expected_version: base.record_version });
    if (res.ok) { await clearFormDraft(draftKey); await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(res);
  });
  on('rp-reopen', async () => {
    const reason = await askReason('rp.reopen');
    if (!reason) return;
    const res = await writeWithPin('repair.reopen', { repair_id: r.repair_id, reason }, { expected_version: base.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  });
  const acceptFlow = async (decision) => {
    const pendingUsage = usageData.usage.filter((x) => x.status === 'PENDING_CONFIRMATION' && !x._local);
    const canConfirm = await can('usage.confirm');
    const ans = await dialog({
      title: bi(decision === 'PASS' ? 'btn.accept_pass' : 'btn.accept_fail'),
      body: decision === 'FAIL'
        ? `<label for="ar">${bi('mt.return_reason')} <span class="req">*</span></label><input id="ar" type="text" maxlength="300">`
        : `<p>${bi('rp.accept_confirm')}</p>${pendingUsage.length && canConfirm ? `<label class="check"><input type="checkbox" id="ac-usage" checked><span>${bi('mt.accept_with_usage', { N: pendingUsage.length })}</span></label>` : ''}`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi(decision === 'PASS' ? 'btn.accept_pass' : 'btn.accept_fail'), kind: decision === 'PASS' ? 'primary' : 'danger', read: (wr) => ({ reason: $('#ar', wr) ? $('#ar', wr).value.trim() : '', usage: !!($('#ac-usage', wr) && $('#ac-usage', wr).checked) }) }]
    });
    if (!ans) return;
    if (decision === 'FAIL' && !ans.reason) { toast(bi('field.reason_required'), 'err'); return; }
    const res = await writeWithPin('repair.accept', { repair_id: r.repair_id, decision, reason: ans.reason, confirm_usage: ans.usage }, { expected_version: base.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  };
  on('rp-accept', () => acceptFlow('PASS'));
  on('rp-return', () => acceptFlow('FAIL'));
  wireNextStep(view);
}

/** Ảnh hiện trường còn chờ gửi (ảnh nhỏ từ hàng chờ trên máy) */
function queuedPhotoThumbs(ops) {
  const ims = ops.filter((o) => o.payload && /^image\//.test(o.payload.mime_type || '')).slice(0, 6);
  if (!ims.length) return '';
  return `<div class="photos">${ims.map((o) => `<figure class="photo"><img src="data:image/jpeg;base64,${o.payload.thumb_b64 || o.payload.content_b64}" alt="${esc(nameText(o.payload, 'title'))}"><figcaption>${biName(o.payload, 'title')} · <span class="badge t-amber">${bi('sync.local_saved')}</span></figcaption></figure>`).join('')}</div>`;
}

async function askReason(titleKey) {
  const reason = await dialog({
    title: bi(titleKey),
    body: `<label for="rp-reason">${bi('field.reason')} <span class="req">*</span></label><input id="rp-reason" type="text" maxlength="300">`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi(titleKey), kind: 'primary', read: (w) => $('#rp-reason', w).value.trim() }]
  });
  if (reason === '') toast(bi('field.reason_required'), 'err');
  return reason || null;
}

/** Thêm/sửa việc con: nội dung (một thứ tiếng), người làm, kết quả */
async function taskDialog(t, users) {
  const me = uid();
  const opts = users.length ? users : [{ user_id: me, employee_code: '', display_name: biText('rp.me') }];
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi(t ? 'rp.task_edit' : 'rp.task_add')}</h2>
    <label for="tk-task">${bi('rp.task')} <span class="req">*</span></label><input id="tk-task" class="inp" type="text" maxlength="300" value="${esc(t ? (t.task_vi || t.task_zh || '') : '')}">
    <label for="tk-who">${bi('wk.col.assignee')}</label><select id="tk-who" class="inp sel"><option value="">${bi('field.choose')}</option>${opts.map((x) => `<option value="${esc(x.user_id)}"${(t ? t.assignee_user_id : me) === x.user_id ? ' selected' : ''}>${esc([x.employee_code, x.display_name].filter(Boolean).join(' · '))}</option>`).join('')}</select>
    <label for="tk-res">${bi('rp.task_result')}</label><input id="tk-res" class="inp" type="text" maxlength="500" value="${esc(t ? (t.result_vi || t.result_zh || '') : '')}">
    ${t ? `<button type="button" class="btn small danger" data-x="remove">${ICON.trash}<span>${bi('btn.remove')}</span></button>` : ''}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.ok')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(null); });
    const rm = $('[data-x="remove"]', wrap);
    if (rm) rm.addEventListener('click', () => { wrap.remove(); resolve(t._new ? { _drop: true } : { remove: true, status: 'CANCELLED' }); });
    $('[data-x="save"]', wrap).addEventListener('click', () => {
      const task = $('#tk-task', wrap).value.trim();
      if (!task) { $('.form-err', wrap).textContent = biText('field.required'); return; }
      const out = { ...oneLang('task', task), assignee_user_id: $('#tk-who', wrap).value };
      const res = $('#tk-res', wrap).value.trim();
      Object.assign(out, res ? oneLang('result', res) : { result_vi: '', result_zh: '' });
      const who = opts.find((x) => x.user_id === out.assignee_user_id);
      if (who) out.assignee_name = who.display_name;
      wrap.remove(); resolve(out);
    });
  });
}

/** Phân công người phụ trách, ưu tiên (C3/C4, cần mạng) */
async function assignDialog(r) {
  const users = await workerPick();
  const ans = await dialog({
    title: bi('rp.assign'),
    body: `<label for="as-u">${bi('wk.col.assignee')} <span class="req">*</span></label><select id="as-u" class="inp sel"><option value="">${bi('field.choose')}</option>${users.map((x) => `<option value="${esc(x.user_id)}"${x.user_id === r.assignee_user_id ? ' selected' : ''}>${esc(x.employee_code + ' · ' + x.display_name)}</option>`).join('')}</select>
      <label for="as-p">${bi('wk.col.priority')}</label><select id="as-p" class="inp sel">${PRIORITIES.map((x) => `<option value="${x}"${(r.priority || 'NORMAL') === x ? ' selected' : ''}>${bi('priority.' + x)}</option>`).join('')}</select>
      <p class="muted small">${bi('rp.assign_help')}</p>`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (wr) => ({ u: $('#as-u', wr).value, p: $('#as-p', wr).value }) }]
  });
  if (!ans) return false;
  if (!ans.u) { toast(bi('field.required'), 'err'); return false; }
  const res = await writeOnline('repair.assign', { repair_id: r.repair_id, assignee_user_id: ans.u, priority: ans.p }, { expected_version: r.record_version });
  if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); return true; }
  await handleWriteError(res);
  return false;
}

