// MAT-03 Vật tư trên phiếu (5.2): đề nghị + thực dùng của phiếu bảo trì/sửa chữa; tab Đề nghị/Lượng dùng của Kho vật tư (WEB-MAT-01)
// Chưa kết nối kho: không gửi kho/xuất kho, không trừ tồn; chi phí nhập tay ghi "Tham khảo" (1.4 §5.4, phụ lục 4.4.5, 4.5)
import { bi, biText, esc, fmtDate, fmtDateTime, fmtNumber, badge, nameText, uuid } from '../core.js';
import { ICON, toast, dialog, h, $, $$ } from '../ui.js';
import { recs, mapOf, can, costModules } from '../data.js';
import { afterCommit } from '../app.js';
import { enqueue } from '../sync.js';
import { writeOnline, writeWithPin, busy, oneLang, parseNumberInput, wireForm, readField, showErrors, dateInput, textInput } from '../form.js';
import { handleWriteError } from './equipment.js';
import { myQueue, uid, level, qtyText, WO_OPEN, REPAIR_OPEN } from '../work.js';
import { isWide } from '../shell.js';
import { navigate } from '../router.js';

const WT = { WO: 'WORK_ORDER', REPAIR: 'REPAIR' };
const KEY = { WO: 'work_order_id', REPAIR: 'repair_id' };
const MOD = { WO: 'maintenance', REPAIR: 'repairs' };
const money = (v, cur) => (v === '' || v === null || v === undefined ? '' : `${fmtNumber(v, cur && cur !== 'VND' ? 2 : 0)} ${esc(cur || 'VND')}`);

/** Gộp hai lần lưu đề nghị chưa gửi (dòng theo request_line_id) */
function mergeReq(a, b) {
  const out = { ...a, ...b };
  const m = new Map((a.lines || []).map((x) => [x.request_line_id, x]));
  for (const x of b.lines || []) m.set(x.request_line_id, { ...(m.get(x.request_line_id) || {}), ...x });
  out.lines = [...m.values()];
  return out;
}
function mergeUsage(a, b) {
  const m = new Map((a.lines || []).map((x) => [x.usage_line_id, x]));
  for (const x of b.lines || []) m.set(x.usage_line_id, { ...(m.get(x.usage_line_id) || {}), ...x });
  return { ...a, lines: [...m.values()] };
}

/** Đề nghị, dòng đề nghị, lượng dùng của phiếu — đã áp nháp trên máy của tôi */
export async function workMatData(kind, work) {
  const wt = WT[kind], wid = work[KEY[kind]];
  const ops = await myQueue();
  const reqs = (await recs('MATERIAL_REQUEST')).filter((r) => r.work_type === wt && r.work_id === wid).map((r) => ({ ...r }));
  const lines = (await recs('MATERIAL_REQUEST_LINE')).filter((l) => reqs.some((r) => r.request_id === l.request_id)).map((l) => ({ ...l }));
  const usage = (await recs('MATERIAL_USAGE')).filter((u) => u.work_type === wt && u.work_id === wid).map((u) => ({ ...u }));
  for (const o of ops) {
    if (o.state === 'REJECTED' || o.state === 'CONFLICT') continue;
    const p = o.payload || {};
    if (o.action === 'matreq.create' && (p.work_id === wid || reqs.some((r) => r.request_id === p.request_id))) {
      let r = reqs.find((x) => x.request_id === p.request_id);
      if (!r) { r = { request_id: p.request_id, request_code: '', work_type: wt, work_id: wid, status: 'DRAFT', requested_by: uid(), requested_at: o.local_created_at, record_version: 0 }; reqs.push(r); }
      if (p.needed_at !== undefined) r.needed_at = p.needed_at;
      if (p.note_vi !== undefined || p.note_zh !== undefined) { r.note_vi = p.note_vi || ''; r.note_zh = p.note_zh || ''; }
      r._local = true;
      for (const l of p.lines || []) {
        const cur = lines.find((x) => x.request_line_id === l.request_line_id);
        if (l.remove) { if (cur) cur._removed = true; continue; }
        if (cur) Object.assign(cur, l, { _local: true }); else lines.push({ ...l, request_id: p.request_id, status: 'DRAFT', _local: true });
      }
    }
    if (o.action === 'matreq.submit') { const r = reqs.find((x) => x.request_id === p.request_id); if (r) { r.status = 'PENDING_APPROVAL'; r._local = true; } }
    if (o.action === 'usage.record' && p.work_id === wid) {
      for (const l of p.lines || []) {
        const cur = usage.find((x) => x.usage_line_id === l.usage_line_id);
        if (l.remove) { if (cur) cur._removed = true; continue; }
        if (cur) Object.assign(cur, l, { status: 'PENDING_CONFIRMATION', _local: true });
        else usage.push({ ...l, work_type: wt, work_id: wid, status: 'PENDING_CONFIRMATION', recorded_by: uid(), recorded_at: o.local_created_at, _local: true });
      }
    }
  }
  return { reqs, lines: lines.filter((l) => !l._removed && !l.archived_at), usage: usage.filter((u) => !u._removed && !u.archived_at) };
}

/** ID dòng lượng dùng tạo trên máy còn chờ gửi (điều kiện 5.1.1 mục 2: gửi kèm để máy chủ kiểm UNSYNCED_CHILD_DATA) */
export function localUsageIds(data) { return data.usage.filter((u) => u._local).map((u) => u.usage_line_id); }

function workOpen(kind, work) { return (kind === 'WO' ? WO_OPEN : REPAIR_OPEN).has(work.status); }

/** Người được giao của phiếu (phiếu sửa: cả người làm việc con) */
export async function isWorkAssignee(kind, work) {
  if (work.assignee_user_id === uid()) return true;
  if (kind === 'REPAIR') return (await recs('REPAIR_TASK')).some((t) => t.repair_id === work.repair_id && t.assignee_user_id === uid() && !t.archived_at);
  return false;
}

export async function workMatHtml(kind, work) {
  const data = await workMatData(kind, work);
  const mats = await mapOf('MATERIAL');
  const showCost = (await costModules()).includes(MOD[kind]);
  const lead = level() >= 3;
  const asg = await isWorkAssignee(kind, work);
  const open = workOpen(kind, work);
  const online = navigator.onLine;
  const canReq = open && (await can('matreq.create')) && (lead || asg);
  const canUse = (await can('usage.record')) && (lead ? ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE'] : ['ASSIGNED', 'IN_PROGRESS']).includes(work.status) && (lead || asg);
  const canConfirm = await can('usage.confirm');
  const canApprove = await can('matreq.approve');
  const canCost = (await can('work.cost.edit')) && showCost;
  const matName = (id) => { const m = mats.get(id); return m ? `<span class="code">${esc(m.material_code)}</span> ${esc(nameText(m))}` : esc(id || ''); };
  const pendingConfirm = data.usage.filter((u) => u.status === 'PENDING_CONFIRMATION' && !u._local && u.recorded_by !== uid());
  const reqHtml = data.reqs.length ? data.reqs.sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at))).map((r) => {
    const ls = data.lines.filter((l) => l.request_id === r.request_id);
    const mine = r.requested_by === uid();
    return `<li class="mreq" data-req="${esc(r.request_id)}"><div class="rec-top"><span class="code">${r.request_code ? esc(r.request_code) : bi('tag.pending_code')}</span>
        <span>${badge('mreq_status.' + r.status)} ${r.status === 'APPROVED' ? `<span class="badge t-grey">${bi('tag.warehouse_not_connected')}</span>` : ''} ${r._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</span></div>
      <div class="muted small">${esc(r.requested_by_name || '')} · ${esc(fmtDateTime(r.requested_at))}${r.needed_at ? ` · ${bi('mat.needed_at')}: ${esc(fmtDate(r.needed_at))}` : ''}</div>
      ${r.note_vi || r.note_zh ? `<div class="small">${esc(r.note_vi || r.note_zh)}</div>` : ''}
      <table class="tbl mini"><thead><tr><th>${bi('mat.material')}</th><th class="num">${bi('mat.req_qty')}</th><th class="num">${bi('mat.appr_qty')}</th></tr></thead>
        <tbody>${ls.map((l) => `<tr><td>${matName(l.material_id)}</td><td class="num">${qtyText(l.requested_qty, l.unit || (mats.get(l.material_id) || {}).base_unit)}</td><td class="num">${l.approved_qty === '' || l.approved_qty === null || l.approved_qty === undefined ? '' : qtyText(l.approved_qty, l.unit)}</td></tr>`).join('')}</tbody></table>
      ${r.reject_reason ? `<div class="small err">${bi('mat.reject_reason')}: ${esc(r.reject_reason)}</div>` : ''}
      <div class="row">
        ${r.status === 'DRAFT' && canReq && (mine || lead) ? `<button type="button" class="btn tiny" data-req-edit="${esc(r.request_id)}">${ICON.edit}<span>${bi('btn.edit')}</span></button>` : ''}
        ${r.status === 'DRAFT' && (mine || lead) && !r._local_submit ? `<button type="button" class="btn tiny primary" data-req-submit="${esc(r.request_id)}">${bi('btn.submit_review')}</button>` : ''}
        ${r.status === 'PENDING_APPROVAL' && !r._local && canApprove && !mine && r.created_by !== uid() ? `<button type="button" class="btn tiny primary" data-req-appr="${esc(r.request_id)}" ${online ? '' : 'disabled'}>${ICON.check}<span>${bi('btn.approve')}</span></button>` : ''}
        ${['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(r.status) && !r._local && (mine || lead) ? `<button type="button" class="btn tiny" data-req-cancel="${esc(r.request_id)}" ${online ? '' : 'disabled'}>${bi('btn.cancel_request')}</button>` : ''}
      </div></li>`;
  }).join('') : `<li class="muted">${bi('field.not_set')}</li>`;
  const unitOf = (u) => u.unit || (mats.get(u.material_id) || {}).base_unit;
  const costOf = (u) => (u.manual_unit_cost !== '' && u.manual_unit_cost !== null && u.manual_unit_cost !== undefined ? `${money(u.manual_unit_cost, u.currency)} <span class="badge t-grey">${bi('cost_source.MANUAL_REFERENCE')}</span>` : '');
  const useEdit = (u) => (canUse && u.status !== 'CONFIRMED' && (lead || u.recorded_by === uid()) ? `<button type="button" class="btn tiny" data-use-edit="${esc(u.usage_line_id)}" aria-label="${esc(biText('btn.edit'))}">${ICON.edit}</button>` : '');
  const useState = (u) => `${badge('usage_status.' + (u.status || 'PENDING_CONFIRMATION'))} ${u._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}`;
  // iPhone: mỗi dòng một khối (bảng 5 cột quá chật); web: bảng
  const useHtml = !data.usage.length ? `<p class="muted">${bi('field.not_set')}</p>` : isWide()
    ? `<div class="table-wrap"><table class="tbl mini"><thead><tr><th>${bi('mat.material')}</th><th class="num">${bi('mat.used_qty')}</th><th class="num">${bi('mat.scrap_qty')}</th>
      ${showCost ? `<th class="num">${bi('mat.unit_cost')}</th>` : ''}<th>${bi('col.status')}</th><th></th></tr></thead>
      <tbody>${data.usage.map((u) => `<tr data-use="${esc(u.usage_line_id)}"><td>${matName(u.material_id)}${u.note_vi || u.note_zh ? `<div class="muted small">${esc(u.note_vi || u.note_zh)}</div>` : ''}</td>
        <td class="num">${qtyText(u.actual_used_qty || 0, unitOf(u))}</td><td class="num">${qtyText(u.scrap_qty || 0, unitOf(u))}</td>
        ${showCost ? `<td class="num">${costOf(u)}</td>` : ''}<td>${useState(u)}</td><td>${useEdit(u)}</td></tr>`).join('')}</tbody></table></div>`
    : `<ul class="list ml-list">${data.usage.map((u) => `<li data-use="${esc(u.usage_line_id)}">
        <div class="rec-top"><span>${matName(u.material_id)}</span>${useEdit(u)}</div>
        <div class="small">${bi('mat.used_qty')}: <strong>${qtyText(u.actual_used_qty || 0, unitOf(u))}</strong> · ${bi('mat.scrap_qty')}: <strong>${qtyText(u.scrap_qty || 0, unitOf(u))}</strong></div>
        ${showCost && costOf(u) ? `<div class="small">${bi('mat.unit_cost')}: ${costOf(u)}</div>` : ''}
        ${u.note_vi || u.note_zh ? `<div class="muted small">${esc(u.note_vi || u.note_zh)}</div>` : ''}
        <div class="rec-badges">${useState(u)}</div></li>`).join('')}</ul>`;
  return `<section class="card" id="wm-card"><h3>${bi('mat.on_work')}</h3>
    <p class="muted small">${bi('tag.warehouse_not_connected')} — ${bi('mat.no_stock_note')}</p>
    <h4>${bi('tab.requests')}</h4><ul class="list">${reqHtml}</ul>
    ${canReq ? `<div class="row"><button type="button" class="btn small" id="wm-req-new">${ICON.plus}<span>${bi('mat.req_new')}</span></button></div>` : ''}
    <h4>${bi('mat.actual_use')}</h4>${useHtml}
    <div class="row">
      ${canUse ? `<button type="button" class="btn small" id="wm-use-new">${ICON.plus}<span>${bi('mat.use_record')}</span></button>` : ''}
      ${canConfirm && pendingConfirm.length && level() >= 3 ? `<button type="button" class="btn small primary" id="wm-confirm" ${online ? '' : 'disabled'}>${ICON.check}<span>${bi('mat.confirm_all')} (${pendingConfirm.length})</span></button>` : ''}
      ${canCost ? `<button type="button" class="btn small" id="wm-cost" ${online ? '' : 'disabled'}>${bi('mat.cost_ref')}</button>` : ''}
    </div>
    ${!online && (canConfirm || canCost) ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
  </section>`;
}

export function wireWorkMat(root, kind, work, repaint) {
  const card = $('#wm-card', root);
  if (!card) return;
  const wid = work[KEY[kind]];
  const wt = WT[kind];
  const on = (sel, fn) => { const el = $(sel, card); if (el) el.addEventListener('click', fn); };
  on('#wm-req-new', async () => { if (await requestDialog(kind, work, null)) repaint(); });
  $$('[data-req-edit]', card).forEach((b) => b.addEventListener('click', async () => {
    const data = await workMatData(kind, work);
    const r = data.reqs.find((x) => x.request_id === b.dataset.reqEdit);
    if (await requestDialog(kind, work, r, data.lines.filter((l) => l.request_id === r.request_id))) repaint();
  }));
  $$('[data-req-submit]', card).forEach((b) => b.addEventListener('click', async () => {
    const data = await workMatData(kind, work);
    const r = data.reqs.find((x) => x.request_id === b.dataset.reqSubmit);
    const p = { request_id: r.request_id };
    if (!navigator.onLine || r._local) {
      await enqueue('matreq.submit', p, { entity_type: 'MATERIAL_REQUEST', entity_id: r.request_id, expected_version: Number(r.record_version || 0), parent_id: wid, chain: true });
      toast(bi('sync.local_saved'), 'ok'); repaint(); return;
    }
    busy(b, true);
    const res = await writeOnline('matreq.submit', p, { expected_version: r.record_version });
    busy(b, false);
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(res);
  }));
  $$('[data-req-appr]', card).forEach((b) => b.addEventListener('click', async () => {
    const data = await workMatData(kind, work);
    const r = data.reqs.find((x) => x.request_id === b.dataset.reqAppr);
    if (await approveDialog(r, data.lines.filter((l) => l.request_id === r.request_id))) repaint();
  }));
  $$('[data-req-cancel]', card).forEach((b) => b.addEventListener('click', async () => {
    const data = await workMatData(kind, work);
    const r = data.reqs.find((x) => x.request_id === b.dataset.reqCancel);
    const reason = await askReason('btn.cancel_request');
    if (!reason) return;
    const res = await writeOnline('matreq.cancel', { request_id: r.request_id, reason }, { expected_version: r.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(res);
  }));
  on('#wm-use-new', async () => { if (await usageDialog(kind, work, null)) repaint(); });
  $$('[data-use-edit]', card).forEach((b) => b.addEventListener('click', async () => {
    const data = await workMatData(kind, work);
    if (await usageDialog(kind, work, data.usage.find((u) => u.usage_line_id === b.dataset.useEdit))) repaint();
  }));
  on('#wm-confirm', async () => {
    const res = await writeWithPin('usage.confirm', { work_type: wt, work_id: wid, all: true });
    if (res.ok) {
      await afterCommit();
      toast(bi('mat.confirmed_n', { N: (res.data && res.data.confirmed || []).length }) + ((res.data && res.data.skipped || []).length ? ' · ' + bi('mat.skipped_own', { N: res.data.skipped.length }) : ''), 'ok');
      repaint();
    } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  });
  on('#wm-cost', async () => { if (await costDialog(kind, work)) repaint(); });
}

/* ---------------- Hộp thoại ---------------- */

async function askReason(titleKey) {
  const reason = await dialog({
    title: bi(titleKey),
    body: `<label for="wm-reason">${bi('field.reason')} <span class="req">*</span></label><input id="wm-reason" type="text" maxlength="300">`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (w) => $('#wm-reason', w).value.trim() }]
  });
  if (reason === '') toast(bi('field.reason_required'), 'err');
  return reason || null;
}

/** Chọn vật tư: linh kiện đã gắn máy lên trước (5.2 MAT-03), lọc theo chữ; đơn vị cố định là base_unit */
async function materialOptions(equipmentId) {
  const mats = (await recs('MATERIAL')).filter((m) => m.active !== false);
  const parts = new Set((await recs('EQUIPMENT_PART')).filter((p) => p.equipment_id === equipmentId && !p.removed_at).map((p) => p.material_id));
  const lab = (m) => `${m.material_code} · ${nameText(m)}${m.part_number ? ' · ' + m.part_number : ''} (${m.base_unit || ''})`;
  const sorted = mats.slice().sort((a, b) => String(a.material_code).localeCompare(String(b.material_code)));
  return { parts: sorted.filter((m) => parts.has(m.material_id)).map((m) => [m.material_id, lab(m), m]), others: sorted.filter((m) => !parts.has(m.material_id)).map((m) => [m.material_id, lab(m), m]) };
}

function matSelectHtml(opts, value, q = '') {
  const ql = q.trim().toLowerCase();
  const f = (list) => list.filter(([, t]) => !ql || t.toLowerCase().includes(ql));
  const o = (list) => list.map(([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<option value="">${esc(biText('field.choose'))}</option>
    ${f(opts.parts).length ? `<optgroup label="${esc(biText('mat.machine_parts'))}">${o(f(opts.parts))}</optgroup>` : ''}
    ${f(opts.others).length ? `<optgroup label="${esc(biText('mat.other_materials'))}">${o(f(opts.others))}</optgroup>` : ''}`;
}

/** Dòng nhập vật tư + số lượng (đề nghị hoặc thực dùng) */
function lineRow(opts, l, mode) {
  const id = mode === 'req' ? l.request_line_id : l.usage_line_id;
  return `<div class="ml-row" data-line="${esc(id)}">
    <div class="ml-mat"><input class="inp ml-q" type="search" placeholder="${esc(biText('field.search_placeholder'))}" aria-label="${esc(biText('field.search_placeholder'))}">
      <select class="inp sel ml-sel" aria-label="${esc(biText('mat.material'))}">${matSelectHtml(opts, l.material_id)}</select></div>
    ${mode === 'req'
      ? `<label class="ml-qty">${bi('mat.req_qty')}<input class="inp num" data-k="requested_qty" inputmode="decimal" value="${esc(l.requested_qty ?? '')}"></label>`
      : `<label class="ml-qty">${bi('mat.used_qty')}<input class="inp num" data-k="actual_used_qty" inputmode="decimal" value="${esc(l.actual_used_qty ?? '')}"></label>
         <label class="ml-qty">${bi('mat.scrap_qty')}<input class="inp num" data-k="scrap_qty" inputmode="decimal" value="${esc(l.scrap_qty ?? '')}"></label>`}
    <span class="ml-unit muted small"></span>
    <input class="inp ml-note" type="text" maxlength="300" placeholder="${esc(biText('field.note'))}" value="${esc(l.note_vi || l.note_zh || '')}">
    <button type="button" class="icon-btn ml-del" aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button>
    <div class="ferr small"></div></div>`;
}

function wireLines(wrap, opts, mode) {
  const units = new Map([...opts.parts, ...opts.others].map(([v, , m]) => [v, m.base_unit || '']));
  const sync = (row) => { const v = $('.ml-sel', row).value; $('.ml-unit', row).textContent = units.get(v) || ''; };
  const wireRow = (row) => {
    $('.ml-q', row).addEventListener('input', (e) => { const cur = $('.ml-sel', row).value; $('.ml-sel', row).innerHTML = matSelectHtml(opts, cur, e.target.value); });
    $('.ml-sel', row).addEventListener('change', () => sync(row));
    $('.ml-del', row).addEventListener('click', () => { row.dataset.removed = '1'; row.hidden = true; });
    sync(row);
  };
  $$('.ml-row', wrap).forEach(wireRow);
  const add = $('[data-x="add"]', wrap);
  if (add) add.addEventListener('click', () => {
    const l = mode === 'req' ? { request_line_id: uuid() } : { usage_line_id: uuid() };
    const row = h(lineRow(opts, l, mode));
    row.dataset.new = '1';
    $('.ml-lines', wrap).appendChild(row);
    wireRow(row);
  });
}

/** Đọc các dòng; trả {lines, errors} */
function readLines(wrap, mode) {
  const lines = [], errs = [];
  $$('.ml-row', wrap).forEach((row) => {
    const id = row.dataset.line;
    const err = $('.ferr', row);
    err.textContent = '';
    if (row.dataset.removed) { if (!row.dataset.new) lines.push(mode === 'req' ? { request_line_id: id, remove: true } : { usage_line_id: id, remove: true }); return; }
    const mat = $('.ml-sel', row).value;
    const vals = {};
    let bad = !mat;
    $$('input[data-k]', row).forEach((i) => {
      const r = parseNumberInput(i.value);
      if (r.error) bad = true; else vals[i.dataset.k] = r.value;
    });
    if (mode === 'req' && !(vals.requested_qty > 0)) bad = true;
    if (mode === 'use' && !((vals.actual_used_qty || 0) > 0 || (vals.scrap_qty || 0) > 0)) bad = true;
    if (bad) { err.textContent = biText('mat.line_invalid'); errs.push(id); return; }
    const note = $('.ml-note', row).value.trim();
    const l = mode === 'req' ? { request_line_id: id, material_id: mat, requested_qty: vals.requested_qty } : { usage_line_id: id, material_id: mat, actual_used_qty: vals.actual_used_qty || 0, scrap_qty: vals.scrap_qty || 0 };
    Object.assign(l, note ? oneLang('note', note) : (row.dataset.new ? {} : { note_vi: '', note_zh: '' }));
    lines.push(l);
  });
  return { lines, errs };
}

/** Đề nghị vật tư: tạo/sửa nháp (offline được) */
async function requestDialog(kind, work, req, reqLines = []) {
  const opts = await materialOptions(work.equipment_id);
  const lines = req ? reqLines : [{ request_line_id: uuid() }];
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card wide-card">
    <h2>${bi(req ? 'mat.req_edit' : 'mat.req_new')}</h2>
    <p class="muted small">${bi('mat.req_help')}</p>
    <div class="ml-lines">${lines.map((l) => lineRow(opts, l, 'req')).join('')}</div>
    <div class="row"><button type="button" class="btn small" data-x="add">${ICON.plus}<span>${bi('mat.add_line')}</span></button></div>
    ${dateInput('needed_at', 'mat.needed_at', req ? req.needed_at : '')}
    ${textInput('note', 'field.note', req ? (req.note_vi || req.note_zh || '') : '', { maxlength: 300 })}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save_draft')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  wireLines(wrap, opts, 'req');
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const { lines: ls, errs } = readLines(wrap, 'req');
      if (errs.length) return;
      if (!ls.some((l) => !l.remove) && !req) { $('.form-err', wrap).textContent = biText('mat.line_required'); return; }
      const needed = readField(wrap, 'needed_at');
      if (needed === null) { showErrors(wrap, [{ field: 'needed_at', key: 'field.invalid_date' }]); return; }
      const note = readField(wrap, 'note');
      const p = { request_id: req ? req.request_id : uuid(), lines: ls, needed_at: needed || '' };
      if (!req) { p.work_type = WT[kind]; p.work_id = work[KEY[kind]]; }
      Object.assign(p, note ? oneLang('note', note) : (req ? { note_vi: '', note_zh: '' } : {}));
      const ev0 = req ? Number(req.record_version || 0) : 0;
      if (!navigator.onLine || (req && req._local)) {
        await enqueue('matreq.create', p, { entity_type: 'MATERIAL_REQUEST', entity_id: p.request_id, expected_version: ev0, parent_id: work[KEY[kind]], chain: true, merge: mergeReq });
        wrap.remove(); toast(bi('sync.local_saved'), 'ok'); resolve(true); return;
      }
      busy(ev.currentTarget, true);
      const res = await writeOnline('matreq.create', p, { expected_version: ev0 });
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { $('.form-err', wrap).textContent = (res.errors || []).map((e) => `${e.message_vi} · ${e.message_zh}`).join(' — '); return; }
      wrap.remove(); await handleWriteError(res); resolve(false);
    });
  });
}

/** Duyệt/từ chối đề nghị; sửa SL duyệt từng dòng (C3/C4, PIN) */
async function approveDialog(req, reqLines) {
  const mats = await mapOf('MATERIAL');
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('btn.approve')} · ${esc(req.request_code)}</h2>
    <table class="tbl mini"><thead><tr><th>${bi('mat.material')}</th><th class="num">${bi('mat.req_qty')}</th><th class="num">${bi('mat.appr_qty')}</th></tr></thead>
      <tbody>${reqLines.map((l) => { const m = mats.get(l.material_id) || {}; return `<tr><td><span class="code">${esc(m.material_code || '')}</span> ${esc(nameText(m))}</td><td class="num">${qtyText(l.requested_qty, l.unit)}</td>
        <td class="num"><input class="inp num tiny-input" data-aq="${esc(l.request_line_id)}" inputmode="decimal" value="${esc(l.requested_qty)}"></td></tr>`; }).join('')}</tbody></table>
    <label for="ap-reason">${bi('mat.reject_reason')}</label><input id="ap-reason" type="text" maxlength="300">
    <p class="muted small">${bi('tag.warehouse_not_connected')} — ${bi('mat.approve_note')}</p>
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn danger" data-x="reject">${bi('btn.reject')}</button><button type="button" class="btn primary" data-x="approve">${bi('btn.approve')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  return new Promise((resolve) => {
    const done = async (res) => {
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'REAUTH_REQUIRED') return;
      wrap.remove(); await handleWriteError(res); resolve(false);
    };
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="reject"]', wrap).addEventListener('click', async () => {
      const reason = $('#ap-reason', wrap).value.trim();
      if (!reason) { $('.form-err', wrap).textContent = biText('field.reason_required'); return; }
      done(await writeWithPin('matreq.approve', { request_id: req.request_id, decision: 'REJECT', reason }, { expected_version: req.record_version }));
    });
    $('[data-x="approve"]', wrap).addEventListener('click', async () => {
      const lines = [];
      for (const i of $$('[data-aq]', wrap)) {
        const r = parseNumberInput(i.value);
        if (r.error || r.value === null) { $('.form-err', wrap).textContent = biText('mat.line_invalid'); return; }
        lines.push({ request_line_id: i.dataset.aq, approved_qty: r.value });
      }
      done(await writeWithPin('matreq.approve', { request_id: req.request_id, decision: 'APPROVE', lines }, { expected_version: req.record_version }));
    });
  });
}

/** Ghi thực dùng: một hoặc nhiều dòng (offline được); dòng đã có thì sửa */
async function usageDialog(kind, work, line) {
  const opts = await materialOptions(work.equipment_id);
  const lines = line ? [line] : [{ usage_line_id: uuid() }];
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card wide-card">
    <h2>${bi('mat.use_record')}</h2>
    <p class="muted small">${bi('mat.use_help')}</p>
    <div class="ml-lines">${lines.map((l) => lineRow(opts, l, 'use')).join('')}</div>
    ${line ? '' : `<div class="row"><button type="button" class="btn small" data-x="add">${ICON.plus}<span>${bi('mat.add_line')}</span></button></div>`}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireLines(wrap, opts, 'use');
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const { lines: ls, errs } = readLines(wrap, 'use');
      if (errs.length) return;
      if (!ls.length) { wrap.remove(); resolve(false); return; }
      if (line && !line._local && line.record_version) ls.forEach((l) => { if (l.usage_line_id === line.usage_line_id) l.expected_version = line.record_version; });
      const wid = work[KEY[kind]];
      const p = { work_type: WT[kind], work_id: wid, lines: ls };
      if (!navigator.onLine || (line && line._local)) {
        await enqueue('usage.record', p, { entity_type: 'MATERIAL_USAGE', entity_id: 'usage:' + wid, parent_id: wid, merge: mergeUsage });
        wrap.remove(); toast(bi('sync.local_saved'), 'ok'); resolve(true); return;
      }
      busy(ev.currentTarget, true);
      const res = await writeOnline('usage.record', p);
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { $('.form-err', wrap).textContent = (res.errors || []).map((e) => `${e.message_vi} · ${e.message_zh}`).join(' — '); return; }
      wrap.remove(); await handleWriteError(res); resolve(false);
    });
  });
}

/** Chi phí tham khảo (C3/C4 có quyền giá): công, chi phí khác/dịch vụ ngoài, đơn giá từng dòng vật tư — nguồn MANUAL_REFERENCE */
async function costDialog(kind, work) {
  const data = await workMatData(kind, work);
  const mats = await mapOf('MATERIAL');
  const usage = data.usage.filter((u) => !u._local);
  const cur = work.cost_currency || 'VND';
  const fmt = (v) => (v === '' || v === null || v === undefined ? '' : fmtNumber(v, 2));
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('mat.cost_ref')}</h2>
    <p class="muted small">${bi('mat.cost_help')}</p>
    <label>${bi('mat.labor_cost')}<input class="inp num" data-c="labor_cost" inputmode="decimal" value="${esc(fmt(work.labor_cost))}"></label>
    ${kind === 'WO' ? `<label>${bi('mat.other_cost')}<input class="inp num" data-c="other_cost" inputmode="decimal" value="${esc(fmt(work.other_cost))}"></label>`
      : `<label>${bi('mat.outside_cost')}<input class="inp num" data-c="outside_cost" inputmode="decimal" value="${esc(fmt(work.outside_cost))}"></label>`}
    <label>${bi('mat.currency')}<input class="inp" data-c="cost_currency" maxlength="3" value="${esc(cur)}" autocapitalize="characters"></label>
    ${usage.length ? `<h4>${bi('mat.unit_cost')}</h4><table class="tbl mini"><tbody>${usage.map((u) => { const m = mats.get(u.material_id) || {}; return `<tr><td><span class="code">${esc(m.material_code || '')}</span> ${esc(nameText(m))}</td>
      <td class="num"><input class="inp num tiny-input" data-uc="${esc(u.usage_line_id)}" inputmode="decimal" value="${esc(fmt(u.manual_unit_cost))}"></td></tr>`; }).join('')}</tbody></table>` : ''}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const p = { work_type: WT[kind], work_id: work[KEY[kind]] };
      for (const i of $$('[data-c]', wrap)) {
        const k = i.dataset.c;
        if (k === 'cost_currency') { const c = i.value.trim().toUpperCase(); if (c !== (work.cost_currency || '')) p.cost_currency = c; continue; }
        const r = parseNumberInput(i.value);
        if (r.error) { $('.form-err', wrap).textContent = biText('field.invalid'); return; }
        const old = work[k] === '' || work[k] === null || work[k] === undefined ? null : Number(work[k]);
        if (r.value !== old) p[k] = r.value === null ? '' : r.value;
      }
      const uc = [];
      for (const i of $$('[data-uc]', wrap)) {
        const r = parseNumberInput(i.value);
        if (r.error) { $('.form-err', wrap).textContent = biText('field.invalid'); return; }
        const u = usage.find((x) => x.usage_line_id === i.dataset.uc);
        const old = u.manual_unit_cost === '' || u.manual_unit_cost === null || u.manual_unit_cost === undefined ? null : Number(u.manual_unit_cost);
        if (r.value !== old) uc.push({ usage_line_id: u.usage_line_id, manual_unit_cost: r.value, currency: p.cost_currency || cur });
      }
      if (uc.length) p.usage_costs = uc;
      if (Object.keys(p).length <= 2) { wrap.remove(); resolve(false); return; }
      busy(ev.currentTarget, true);
      const res = await writeOnline('work.cost.edit', p, { expected_version: work.record_version });
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { $('.form-err', wrap).textContent = (res.errors || []).map((e) => `${e.message_vi} · ${e.message_zh}`).join(' — '); return; }
      wrap.remove(); await handleWriteError(res); resolve(false);
    });
  });
}

/* ---------------- Tab Đề nghị / Lượng dùng ở Kho vật tư (MAT-01, WEB-MAT-01) ---------------- */

async function workIndex() {
  const wos = await mapOf('WORK_ORDER');
  const reps = await mapOf('REPAIR');
  const eqs = await mapOf('EQUIPMENT');
  return (wt, id) => {
    const w = wt === 'WORK_ORDER' ? wos.get(id) : reps.get(id);
    const e = w ? eqs.get(w.equipment_id) : null;
    return { code: w ? (w.work_order_code || w.repair_code) : '', href: wt === 'WORK_ORDER' ? '/maintenance/wo/' + id : '/repairs/' + id, eq: e ? e.equipment_code : '' };
  };
}

export async function requestsTabHtml(q = '') {
  const idx = await workIndex();
  const lines = await recs('MATERIAL_REQUEST_LINE');
  const mats = await mapOf('MATERIAL');
  const ql = q.trim().toLowerCase();
  const list = (await recs('MATERIAL_REQUEST')).filter((r) => !r.archived_at).map((r) => ({ r, w: idx(r.work_type, r.work_id), ls: lines.filter((l) => l.request_id === r.request_id && !l.archived_at) }))
    .filter((x) => !ql || [x.r.request_code, x.w.code, x.w.eq, ...x.ls.map((l) => (mats.get(l.material_id) || {}).material_code)].join(' ').toLowerCase().includes(ql))
    .sort((a, b) => String(b.r.requested_at).localeCompare(String(a.r.requested_at)));
  if (!list.length) return `<div class="card empty-state"><p class="muted">${bi('field.no_records')}</p></div>`;
  if (isWide()) {
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.code')}</th><th>${bi('mat.work')}</th><th>${bi('module.equipment')}</th><th>${bi('mat.material')}</th>
      <th>${bi('mat.requested_by')}</th><th>${bi('mat.needed_at')}</th><th>${bi('col.status')}</th></tr></thead><tbody>
      ${list.map((x) => `<tr class="click" data-href="${esc(x.w.href)}"><td class="code">${esc(x.r.request_code)}</td><td class="code">${esc(x.w.code)}</td><td>${esc(x.w.eq)}</td>
        <td>${x.ls.map((l) => `${esc((mats.get(l.material_id) || {}).material_code || '')} × ${qtyText(l.approved_qty !== '' && l.approved_qty !== null && l.approved_qty !== undefined ? l.approved_qty : l.requested_qty, l.unit)}`).join('<br>')}</td>
        <td>${esc(x.r.requested_by_name || '')}</td><td class="num">${esc(fmtDate(x.r.needed_at))}</td><td>${badge('mreq_status.' + x.r.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  return `<div class="cards">${list.map((x) => `<a class="card rec-card" href="#${esc(x.w.href)}"><div class="rec-top"><span class="code">${esc(x.r.request_code)}</span>${badge('mreq_status.' + x.r.status)}</div>
    <div class="muted small">${esc([x.w.code, x.w.eq, x.r.requested_by_name].filter(Boolean).join(' · '))}</div>
    <div class="small">${x.ls.map((l) => `${esc((mats.get(l.material_id) || {}).material_code || '')} × ${qtyText(l.requested_qty, l.unit)}`).join(' · ')}</div></a>`).join('')}</div>`;
}

export async function usageTabHtml(q = '', materialId = '') {
  const idx = await workIndex();
  const mats = await mapOf('MATERIAL');
  const showCost = (await costModules()).length > 0;
  const ql = q.trim().toLowerCase();
  const list = (await recs('MATERIAL_USAGE')).filter((u) => !u.archived_at && (!materialId || u.material_id === materialId)).map((u) => ({ u, w: idx(u.work_type, u.work_id), m: mats.get(u.material_id) || {} }))
    .filter((x) => !ql || [x.w.code, x.w.eq, x.m.material_code, x.m.name_vi, x.m.name_zh].join(' ').toLowerCase().includes(ql))
    .sort((a, b) => String(b.u.recorded_at).localeCompare(String(a.u.recorded_at)));
  if (!list.length) return `<div class="card empty-state"><p class="muted">${bi('field.no_records')}</p></div>`;
  if (isWide() || materialId) {
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('mat.work')}</th><th>${bi('module.equipment')}</th>${materialId ? '' : `<th>${bi('mat.material')}</th>`}
      <th class="num">${bi('mat.used_qty')}</th><th class="num">${bi('mat.scrap_qty')}</th>${showCost ? `<th class="num">${bi('mat.unit_cost')}</th>` : ''}<th>${bi('mat.recorded_at')}</th><th>${bi('col.status')}</th></tr></thead><tbody>
      ${list.map((x) => `<tr class="click" data-href="${esc(x.w.href)}"><td class="code">${esc(x.w.code)}</td><td>${esc(x.w.eq)}</td>${materialId ? '' : `<td><span class="code">${esc(x.m.material_code || '')}</span> ${esc(nameText(x.m))}</td>`}
        <td class="num">${qtyText(x.u.actual_used_qty || 0, x.u.unit)}</td><td class="num">${qtyText(x.u.scrap_qty || 0, x.u.unit)}</td>
        ${showCost ? `<td class="num">${x.u.manual_unit_cost !== undefined && x.u.manual_unit_cost !== '' && x.u.manual_unit_cost !== null ? money(x.u.manual_unit_cost, x.u.currency) : ''}</td>` : ''}
        <td class="num">${esc(fmtDate(String(x.u.recorded_at || '').slice(0, 10)))}</td><td>${badge('usage_status.' + x.u.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  return `<div class="cards">${list.map((x) => `<a class="card rec-card" href="#${esc(x.w.href)}"><div class="rec-top"><span class="code">${esc(x.m.material_code || '')}</span>${badge('usage_status.' + x.u.status)}</div>
    <div class="rec-name">${esc(nameText(x.m))}</div>
    <div class="muted small">${esc([x.w.code, x.w.eq, fmtDate(String(x.u.recorded_at || '').slice(0, 10))].filter(Boolean).join(' · '))}</div>
    <div class="small">${bi('mat.used_qty')}: <strong>${qtyText(x.u.actual_used_qty || 0, x.u.unit)}</strong> · ${bi('mat.scrap_qty')}: <strong>${qtyText(x.u.scrap_qty || 0, x.u.unit)}</strong></div></a>`).join('')}</div>`;
}

export function wireRowLinks(root) {
  $$('tr[data-href]', root).forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href)));
}

