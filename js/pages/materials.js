// Kho vật tư: MAT-01 danh mục, MAT-02 hồ sơ, WEB-MAT-01; tab Linh kiện của thiết bị (EQ-03). Không chốt tồn (C3, 1.4 §5.4)
import { bi, biText, esc, api, fmtDate, fmtNumber, badge, biName, nameText, resMsg, session, uuid, L } from '../core.js';
import { ICON, toast, dialog, h, $, $$ } from '../ui.js';
import { excelLink } from '../excel-link.js';
import { isWide, comingSoon } from '../shell.js';
import { recs, byId, mapOf, can, canSync, boot, invalidate, roleLevel } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit } from '../app.js';
import {
  textInput, selectInput, numberInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, writeWithPin, oneLang,
  loadFormDraft, saveFormDraft, clearFormDraft, busy, unconfirmedAmbiguous, fieldWrap, parseNumberInput
} from '../form.js';
import { conflictDialog } from './drafts.js';
import { docsTabHtml, wireDocsTab } from './docs.js';
import { fmtQty, handleWriteError } from './equipment.js';

const GROUPS = ['EQUIPMENT_PART', 'ELECTRICAL', 'WATER', 'CONSUMABLE', 'TOOL', 'PPE'];
const KINDS = ['COMPONENT', 'CONSUMABLE', 'REUSABLE_TOOL'];
const BASE_UNITS = ['cái', 'bộ', 'm', 'mm', 'm²', 'm³', 'kg', 't', 'L', 'cuộn', 'hộp'];

const notConnected = () => (session.settings.warehouse_connected ? '' : `<p class="nc-line">${bi('tag.warehouse_not_connected')}</p>`);

/* ======================= Danh mục (MAT-01 / WEB-MAT-01) ======================= */

const filt = { q: '', group: '', kind: '', comp: false, inactive: false, tab: 'catalog' };
const selected = new Set();
let inactiveCache = null;

async function listRows() {
  let rows = (await recs('MATERIAL')).slice();
  if (!filt.inactive) rows = rows.filter((m) => m.active !== false);
  const q = filt.q.toLowerCase();
  return rows.filter((m) => (!filt.group || m.group_key === filt.group) && (!filt.kind || m.item_kind === filt.kind) && (!filt.comp || m.is_equipment_component) &&
    (!q || [m.material_code, m.name_vi, m.name_zh, m.part_number, m.model].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => String(a.material_code).localeCompare(String(b.material_code)));
}

export async function renderMaterialList(view, ctx) {
  const { shell, params, query } = ctx;
  const wide = isWide();
  const selId = params.id || '';
  const canCreate = await can('material.create');
  const canPrint = await can('qr.print');
  const excelBtn = await excelLink('materials');
  shell.setScreen({
    title: 'module.warehouse', back: '/',
    actions: canCreate && !wide ? [{ icon: 'plus', label: biText('btn.add'), onClick: () => navigate('/materials/new'), disabled: !navigator.onLine }] : []
  });
  const tabs = ['catalog', ...(wide ? ['parts_by_equipment'] : []), 'requests', 'usage'];
  if (!tabs.includes(filt.tab)) filt.tab = 'catalog';
  const tabBar = `<div class="tabs-bar" role="tablist">${tabs.map((t) => (t === 'requests' || t === 'usage')
    ? `<button type="button" class="tab dim" data-soon="1" aria-disabled="true">${bi('tab.' + t)}<span class="soon">${bi('tag.coming_soon')}</span></button>`
    : `<button type="button" class="tab${filt.tab === t ? ' on' : ''}" data-mtab="${t}">${bi('tab.' + t)}</button>`).join('')}</div>`;
  if (filt.tab === 'parts_by_equipment') {
    view.innerHTML = notConnected() + tabBar + await partsByEquipmentHtml();
    wireTabs(view, ctx);
    return;
  }
  const rows = await listRows();
  const chip = (key, val, label) => `<button type="button" class="chip${filt[key] === val ? ' on' : ''}" data-f="${key}" data-v="${esc(val)}">${label}</button>`;
  const toolbar = `<div class="toolbar">
    <div class="search"><span>${ICON.search}</span><input id="mt-q" type="search" value="${esc(filt.q)}" placeholder="${esc(biText('mat.search_placeholder'))}" autocomplete="off"></div>
    <div class="chips">${chip('group', '', bi('due_filter.ALL'))}${GROUPS.map((g) => chip('group', g, bi('material_group.' + g))).join('')}</div>
    <div class="row">
      <select id="mt-kind" class="sel"><option value="">${bi('field.item_kind')}</option>${KINDS.map((k) => `<option value="${k}"${filt.kind === k ? ' selected' : ''}>${bi('item_kind.' + k)}</option>`).join('')}</select>
      <label class="check inline"><input type="checkbox" id="mt-comp" ${filt.comp ? 'checked' : ''}><span>${bi('equipment_component.TRUE')}</span></label>
      <label class="check inline"><input type="checkbox" id="mt-inact" ${filt.inactive ? 'checked' : ''}><span>${bi('mat.include_inactive')}</span></label>
    </div>
    <div class="row tools">
      ${canCreate && wide ? `<a class="btn small primary" href="#/materials/new">${ICON.plus}<span>${bi('btn.add')}</span></a>` : ''}
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${ICON.reports}<span>${bi('btn.report')}</span><span class="soon">${bi('tag.coming_soon')}</span></button>
      ${canPrint && wide ? `<button type="button" class="btn small" id="mt-print" ${selected.size ? '' : 'disabled'}>${ICON.print}<span>${bi('btn.print_qr')}</span> <span class="count">${selected.size ? '(' + selected.size + ')' : ''}</span></button>` : ''}
      ${excelBtn}
    </div>
    <p class="muted small">${bi('field.total', { N: rows.length })}</p></div>`;
  const comp = (m) => badge('equipment_component.' + (m.is_equipment_component ? 'TRUE' : 'FALSE'));
  let body;
  if (wide) {
    body = `<div class="table-wrap"><table class="tbl"><thead><tr>
      ${canPrint ? `<th class="chk"><input type="checkbox" id="mt-all" aria-label="${esc(biText('btn.print_qr'))}"></th>` : ''}
      <th>${bi('col.code')}</th><th>${bi('col.name')}</th><th>${bi('field.group')}</th><th>${bi('field.part_number')}</th><th>${bi('field.specification')}</th><th>${bi('field.base_unit')}</th><th>${bi('field.is_component')}</th><th>QR</th></tr></thead>
      <tbody>${rows.map((m) => `<tr class="click${m.material_id === selId ? ' sel' : ''}" data-id="${esc(m.material_id)}">
        ${canPrint ? `<td class="chk"><input type="checkbox" data-chk="${esc(m.material_id)}" ${selected.has(m.material_id) ? 'checked' : ''} ${m.qr_key ? '' : 'disabled'}></td>` : ''}
        <td class="code">${esc(m.material_code)}</td><td>${biName(m)}${m.active === false ? ' ' + badge('material_active.FALSE') : ''}</td><td>${bi('material_group.' + m.group_key)}</td>
        <td>${esc(m.part_number || '')}${m.model ? '<br><span class="muted small">' + esc(m.model) + '</span>' : ''}</td><td>${biName(m, 'specification')}</td><td>${esc(m.base_unit || '')}</td><td>${comp(m)}</td>
        <td>${m.qr_key ? `<a class="icon-btn" href="#/qr/MATERIAL/${esc(m.material_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${rows.length ? '' : `<p class="muted">${bi('field.no_records')}</p>`}
      <div id="mt-pane" class="pane"></div>`;
  } else {
    body = `<div class="cards">${rows.map((m) => `<a class="card rec-card" href="#/materials/${esc(m.material_id)}">
      <div class="rec-top"><span class="code">${esc(m.material_code)}</span>${comp(m)}</div>
      <div class="rec-name">${biName(m)}</div>
      <div class="muted small">${esc([m.part_number, m.model].filter(Boolean).join(' · '))}</div>
      <div class="muted small">${bi('material_group.' + m.group_key)} · ${bi('field.base_unit')}: ${esc(m.base_unit || '')}${m.active === false ? ' · ' + bi('material_active.FALSE') : ''}</div>
      ${m.qr_key ? `<span class="qr-mini" aria-hidden="true">${ICON.qr}</span>` : ''}</a>`).join('') || `<p class="muted">${bi('field.no_records')}</p>`}</div>`;
  }
  view.innerHTML = notConnected() + tabBar + toolbar + body;
  wireTabs(view, ctx);
  const again = () => renderMaterialList(view, ctx);
  let t = null;
  $('#mt-q', view).addEventListener('input', (e) => { filt.q = e.target.value; clearTimeout(t); t = setTimeout(async () => { const pos = e.target.selectionStart; await again(); const q = $('#mt-q', view); q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ } }, 250); });
  $$('[data-f]', view).forEach((b) => b.addEventListener('click', () => { filt[b.dataset.f] = b.dataset.v; again(); }));
  $('#mt-kind', view).addEventListener('change', (e) => { filt.kind = e.target.value; again(); });
  $('#mt-comp', view).addEventListener('change', (e) => { filt.comp = e.target.checked; again(); });
  $('#mt-inact', view).addEventListener('change', (e) => { filt.inactive = e.target.checked; again(); });
  if (wide) {
    $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('input, a')) return; navigate('/materials/' + tr.dataset.id, { replace: !!selId }); }));
    const pb = $('#mt-print', view);
    const upd = () => { if (pb) { pb.disabled = !selected.size; pb.querySelector('.count').textContent = selected.size ? `(${selected.size})` : ''; } };
    $$('[data-chk]', view).forEach((c) => c.addEventListener('change', () => { if (c.checked) selected.add(c.dataset.chk); else selected.delete(c.dataset.chk); upd(); }));
    const all = $('#mt-all', view);
    if (all) all.addEventListener('change', () => { rows.filter((m) => m.qr_key).forEach((m) => (all.checked ? selected.add(m.material_id) : selected.delete(m.material_id))); $$('[data-chk]', view).forEach((c) => { c.checked = selected.has(c.dataset.chk); }); upd(); });
    if (pb) pb.addEventListener('click', () => navigate(`/print?type=MATERIAL&ids=${[...selected].join(',')}`));
    if (selId) await renderMaterialPane($('#mt-pane', view), selId, ctx);
  }
}

function wireTabs(view, ctx) {
  $$('[data-mtab]', view).forEach((b) => b.addEventListener('click', () => { filt.tab = b.dataset.mtab; renderMaterialList(view, ctx); }));
}

/** Tab "Vật tư theo máy" (web): mọi liên kết đang hiệu lực */
async function partsByEquipmentHtml() {
  const parts = (await recs('EQUIPMENT_PART')).filter((p) => !p.removed_at);
  const eqs = await mapOf('EQUIPMENT');
  const mats = await mapOf('MATERIAL');
  const rows = parts.map((p) => ({ p, e: eqs.get(p.equipment_id), m: mats.get(p.material_id) })).filter((x) => x.e && x.m)
    .sort((a, b) => String(a.e.equipment_code).localeCompare(String(b.e.equipment_code)) || String(a.m.material_code).localeCompare(String(b.m.material_code)));
  return `<p class="muted small">${bi('field.total', { N: rows.length })}</p><div class="table-wrap"><table class="tbl"><thead><tr>
    <th>${bi('field.equipment_code')}</th><th>${bi('module.equipment')}</th><th>${bi('field.material_code')}</th><th>${bi('field.material')}</th><th class="num">${bi('field.installed_qty')}</th><th>${bi('field.position')}</th><th>${bi('col.status')}</th></tr></thead>
    <tbody>${rows.map(({ p, e, m }) => `<tr><td class="code"><a href="#/equipment/${esc(e.equipment_id)}?tab=parts">${esc(e.equipment_code)}</a></td><td>${biName(e)}</td>
      <td class="code"><a href="#/materials/${esc(m.material_id)}">${esc(m.material_code)}</a></td><td>${biName(m)}</td><td class="num">${fmtQty(p.installed_qty, p.unit)}</td>
      <td>${biName(p, 'position')}</td><td>${badge(p.approved_by ? 'part.confirmed' : 'part.unconfirmed')}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ======================= Hồ sơ vật tư (MAT-02) ======================= */

export async function renderMaterial(view, ctx) {
  if (isWide()) return renderMaterialList(view, ctx);
  const { shell, params } = ctx;
  const m = await findMaterial(params.id);
  const canEdit = await can('material.edit');
  shell.setScreen({
    title: 'screen.material', back: '/materials',
    actions: [
      ...(m && m.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/MATERIAL/${m.material_id}`) }] : []),
      ...(m && canEdit ? [{ icon: 'edit', label: biText('btn.edit'), onClick: () => navigate(`/materials/${m.material_id}/edit`), disabled: !navigator.onLine }] : [])
    ]
  });
  view.innerHTML = '<div id="mt-pane" class="pane mobile"></div>';
  await renderMaterialPane($('#mt-pane', view), params.id, ctx);
}

async function findMaterial(id) {
  let m = await byId('MATERIAL', id);
  if (!m && navigator.onLine) {
    const r = await api('material.view', { material_id: id }, { retry: true });
    if (r.ok) m = r.data.item;
  }
  return m;
}

async function renderMaterialPane(pane, id, ctx) {
  const m = await findMaterial(id);
  if (!m) { pane.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const wide = isWide();
  const online = navigator.onLine;
  const canEdit = await can('material.edit');
  const canArch = await can('material.archive');
  const vendor = m.vendor_id ? await byId('VENDOR', m.vendor_id) : null;
  const parts = (await recs('EQUIPMENT_PART')).filter((p) => p.material_id === m.material_id && !p.removed_at);
  const eqs = await mapOf('EQUIPMENT');
  const kv = (k, v) => (v ? `<div class="kv"><span>${bi(k)}</span><strong>${v}</strong></div>` : '');
  pane.innerHTML = `<section class="card">
    <div class="rec-top"><span class="code big">${esc(m.material_code || biText('tag.pending_code'))}</span>${badge('material_active.' + (m.active === false ? 'FALSE' : 'TRUE'))}</div>
    <h2 class="eq-name">${biName(m)}</h2>
    <div class="kv-grid">
      ${kv('field.group', bi('material_group.' + m.group_key))}
      ${kv('field.item_kind', bi('item_kind.' + m.item_kind))}
      ${kv('field.is_component', badge('equipment_component.' + (m.is_equipment_component ? 'TRUE' : 'FALSE')))}
      ${kv('field.part_number', esc(m.part_number || ''))}
      ${kv('field.manufacturer', esc(m.manufacturer || ''))}
      ${kv('field.model', esc(m.model || ''))}
      ${kv('field.specification', biName(m, 'specification'))}
      ${kv('field.base_unit', esc(m.base_unit || ''))}
      ${kv('field.vendor', vendor ? esc(vendor.vendor_code + ' · ' + vendor.name) : '')}
      ${kv('field.lead_time_days', m.lead_time_days !== null && m.lead_time_days !== '' && m.lead_time_days !== undefined ? fmtNumber(m.lead_time_days) : '')}
    </div>
    <div class="row">
      ${wide && m.qr_key ? `<a class="btn small" href="#/qr/MATERIAL/${esc(m.material_id)}">${ICON.qr}<span>${bi('btn.view_qr')}</span></a>` : ''}
      ${wide && canEdit ? `<a class="btn small" href="#/materials/${esc(m.material_id)}/edit">${ICON.edit}<span>${bi('btn.edit')}</span></a>` : ''}
      ${canArch && m.active !== false ? `<button type="button" class="btn small" id="mt-arch" ${online ? '' : 'disabled'}>${ICON.archive}<span>${bi('btn.archive')}</span></button>` : ''}
      ${canEdit && m.active === false ? `<button type="button" class="btn small" id="mt-react" ${online ? '' : 'disabled'}>${bi('mat.reactivate')}</button>` : ''}
    </div>
    ${!online && (canEdit || canArch) ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
  </section>
  <section class="card"><h3>${bi('field.used_on')}</h3>
    ${parts.length ? `<ul class="list">${parts.map((p) => { const e = eqs.get(p.equipment_id); return e ? `<li><a href="#/equipment/${esc(e.equipment_id)}?tab=parts"><span class="code">${esc(e.equipment_code)}</span> ${biName(e)}</a> · ${fmtQty(p.installed_qty, p.unit)}${p.position_vi || p.position_zh ? ' · ' + biName(p, 'position') : ''}</li>` : ''; }).join('')}</ul>` : `<p class="muted">${bi('mat.not_used')}</p>`}
  </section>
  <section class="card"><h3>${bi('field.stock')}</h3><p class="nc-line">${bi('tag.warehouse_not_connected')}</p></section>
  <section class="card"><h3>${bi('field.usage_history')}</h3><p class="muted">${bi('tag.coming_soon')}</p></section>
  <section class="card tab-body" id="mt-docs"><h3>${bi('tab.documents')}</h3><div></div></section>`;
  const docBox = $('#mt-docs > div', pane);
  docBox.innerHTML = await docsTabHtml('MATERIAL', m);
  const repaint = () => renderMaterialPane(pane, id, ctx);
  wireDocsTab(docBox, 'MATERIAL', m, repaint);
  const ar = $('#mt-arch', pane);
  if (ar) ar.addEventListener('click', async () => {
    const v = await dialog({
      title: bi('mat.archive_title'),
      body: `<p class="muted small">${bi('mat.archive_help')}</p><label for="ma-reason">${bi('field.reason')} <span class="req">*</span></label><input id="ma-reason" type="text" maxlength="300">`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.archive'), kind: 'primary danger', read: (w) => $('#ma-reason', w).value.trim() }]
    });
    if (v === null) return;
    if (!v) { toast(bi('field.reason_required'), 'err'); return; }
    const r = await writeOnline('material.archive', { material_id: m.material_id, reason: v }, { expected_version: m.record_version });
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(r);
  });
  const re = $('#mt-react', pane);
  if (re) re.addEventListener('click', async () => {
    const r = await writeOnline('material.edit', { material_id: m.material_id, active: true }, { expected_version: m.record_version });
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(r);
  });
}

/* ======================= Biểu mẫu vật tư ======================= */

const MAT_FIELDS = ['material_code', 'group_key', 'item_kind', 'part_number', 'manufacturer', 'model', 'base_unit', 'vendor_id', 'lead_time_days'];

export async function renderMaterialForm(view, ctx) {
  const { shell, params, query } = ctx;
  const isNew = !params.id;
  const linkEq = query.get('link') || '';
  shell.setScreen({ title: isNew ? 'screen.material_new' : 'screen.material_edit', back: linkEq ? `/equipment/${linkEq}?tab=parts` : (isNew ? '/materials' : `/materials/${params.id}`) });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  if (!(await can(isNew ? 'material.create' : 'material.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const rec = isNew ? { is_equipment_component: !!linkEq, group_key: linkEq ? 'EQUIPMENT_PART' : '', item_kind: linkEq ? 'COMPONENT' : '' } : await findMaterial(params.id);
  if (!rec) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const draftKey = isNew ? 'material:new' : `material:${params.id}`;
  const draft = await loadFormDraft(draftKey);
  const mine = ctx.mine || null;
  const vals = { ...rec, ...(draft || {}) };
  const vendors = (await recs('VENDOR')).filter((v) => v.active !== false);
  const units = [...new Set(BASE_UNITS.concat((await recs('LOOKUP')).filter((l) => l.group_key === 'UNIT' && l.active !== false).map((l) => l.code)))];
  const mineHint = (f) => (mine && Object.prototype.hasOwnProperty.call(mine, f) && String(mine[f] ?? '') !== String(rec[f] ?? '') ? `${bi('form.my_value')}: <strong>${esc(mine[f])}</strong>` : '');
  view.innerHTML = `${notConnected()}<form class="card form-card" novalidate>
    ${draft ? `<p class="banner info">${bi('form.draft_restored')} <button type="button" class="btn tiny" id="fd-discard">${bi('form.discard_draft')}</button></p>` : ''}
    ${mine ? `<p class="banner warn">${bi('form.server_loaded')}</p>` : ''}
    <div class="form-grid">
      ${textInput('material_code', 'field.material_code', vals.material_code, { maxlength: 32, upper: true, hint: isNew ? bi('field.code_auto') : mineHint('material_code') })}
      ${bilingualInputs('name', vals)}
      ${selectInput('group_key', 'field.group', GROUPS.map((g) => [g, bi('material_group.' + g)]), vals.group_key, { hint: mineHint('group_key') })}
      ${selectInput('item_kind', 'field.item_kind', KINDS.map((k) => [k, bi('item_kind.' + k)]), vals.item_kind, { hint: mineHint('item_kind') })}
      ${fieldWrap('is_equipment_component', 'field.is_component', `<label class="check"><input type="checkbox" id="f-is_equipment_component" ${vals.is_equipment_component ? 'checked' : ''}><span>${bi('equipment_component.TRUE')}</span></label>`)}
      ${textInput('part_number', 'field.part_number', vals.part_number, { maxlength: 120, hint: mineHint('part_number') })}
      ${textInput('manufacturer', 'field.manufacturer', vals.manufacturer, { maxlength: 120 })}
      ${textInput('model', 'field.model', vals.model, { maxlength: 120 })}
      ${bilingualInputs('specification', vals, { required: false, labelKey: 'field.specification', area: true, maxlength: 500 })}
      ${fieldWrap('base_unit', 'field.base_unit', `<input class="inp" id="f-base_unit" type="text" list="dl-units" maxlength="20" value="${esc(vals.base_unit || '')}" autocomplete="off"><datalist id="dl-units">${units.map((u) => `<option value="${esc(u)}">`).join('')}</datalist>`, { required: true, hint: mineHint('base_unit') })}
      ${selectInput('vendor_id', 'field.vendor', vendors.map((v) => [v.vendor_id, `${esc(v.vendor_code)} · ${esc(v.name)}`]), vals.vendor_id)}
      ${numberInput('lead_time_days', 'field.lead_time_days', vals.lead_time_days, { integer: true })}
    </div>
    <p class="muted small">${bi('mat.tab_hint')}</p>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  const collect = () => {
    const out = { name_vi: readField(form, 'name_vi'), name_zh: readField(form, 'name_zh'), specification_vi: readField(form, 'specification_vi'), specification_zh: readField(form, 'specification_zh') };
    MAT_FIELDS.forEach((f) => { out[f] = readField(form, f); });
    out.is_equipment_component = $('#f-is_equipment_component', form).checked;
    return out;
  };
  form.addEventListener('input', () => saveFormDraft(draftKey, collect()));
  form.addEventListener('change', () => saveFormDraft(draftKey, collect()));
  const dd = $('#fd-discard', form);
  if (dd) dd.addEventListener('click', async () => { await clearFormDraft(draftKey); renderMaterialForm(view, ctx); });
  $('#fm-cancel', form).addEventListener('click', () => back(linkEq ? `/equipment/${linkEq}?tab=parts` : (isNew ? '/materials' : `/materials/${params.id}`)));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = collect();
    const errs = [];
    if (!v.name_vi && !v.name_zh) errs.push({ field: 'name', key: 'field.one_lang' });
    if (!v.base_unit) errs.push({ field: 'base_unit', key: 'field.required' });
    if (Number.isNaN(v.lead_time_days)) errs.push({ field: 'lead_time_days', key: 'field.invalid' });
    if (errs.length) { showErrors(form, errs); return; }
    const payload = {};
    if (isNew) {
      payload.material_id = uuid();
      Object.entries(v).forEach(([k, x]) => { if (x !== '' && x !== null && x !== undefined) payload[k] = x; });
      payload.is_equipment_component = v.is_equipment_component;
    } else {
      payload.material_id = rec.material_id;
      Object.entries(v).forEach(([k, x]) => {
        const cur = rec[k] === null || rec[k] === undefined ? '' : rec[k];
        const nx = x === null || x === undefined ? '' : x;
        if (String(cur) !== String(nx)) payload[k] = nx;
      });
      if (payload.material_code === rec.material_code) delete payload.material_code;
    }
    const btn = $('#fm-save', form);
    busy(btn, true);
    const r = await writeOnline(isNew ? 'material.create' : 'material.edit', payload, { expected_version: isNew ? 0 : rec.record_version });
    busy(btn, false);
    if (r.ok) {
      await clearFormDraft(draftKey);
      await afterCommit();
      toast(bi('form.saved'), 'ok');
      if (linkEq) {
        // Thêm linh kiện mới từ tab Linh kiện: gắn ngay vào máy (1.4 §5.1)
        const eq = await byId('EQUIPMENT', linkEq);
        if (eq) await linkDialog(eq, null, payload.material_id);
        navigate(`/equipment/${linkEq}?tab=parts`, { replace: true });
      } else navigate(`/materials/${payload.material_id}`, { replace: true });
      return;
    }
    if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; }
    if (r.code === 'VERSION_CONFLICT') {
      const fields = Object.keys(payload).filter((k) => k !== 'material_id').map((k) => ({ key: k, label: L['field.' + k.replace(/_id$/, '')] ? bi('field.' + k.replace(/_id$/, '')) : esc(k) }));
      const choice = await conflictDialog({ mine: payload, server: r.data && r.data.server, fields });
      if (choice === 'server') { await clearFormDraft(draftKey); await afterCommit(); navigate(`/materials/${rec.material_id}`, { replace: true }); }
      if (choice === 'edit') { await clearFormDraft(draftKey); await afterCommit(); renderMaterialForm(view, { ...ctx, mine: payload }); }
      return;
    }
    await handleWriteError(r);
  });
}

/* ======================= Tab Linh kiện của thiết bị (EQ-03) ======================= */

export async function partsTabHtml(eq) {
  const parts = (await recs('EQUIPMENT_PART')).filter((p) => p.equipment_id === eq.equipment_id && !p.removed_at);
  const mats = await mapOf('MATERIAL');
  const b = await boot();
  const online = navigator.onLine;
  const uid = session.user && session.user.user_id;
  const lvl = roleLevel();
  const canLink = canSync(b, 'part.link') && !eq.archived_at;
  const canNew = canSync(b, 'material.create') && !eq.archived_at;
  const canApprove = canSync(b, 'part.approve');
  const canUnlink = canSync(b, 'part.unlink');
  const unlinkOk = (p) => canUnlink && (lvl >= 3 || (p.created_by === uid && !p.approved_by));
  // C3: không cột/ô Tồn kho, không số 0 giả; một dòng xám "Chưa kết nối kho"
  return `${notConnected()}
    ${parts.length ? `<div class="parts">${parts.map((p) => {
      const m = mats.get(p.material_id) || {};
      const alt = p.alternate_part_id ? mats.get(p.alternate_part_id) : null;
      return `<div class="part" data-part="${esc(p.equipment_part_id)}">
        <div class="rec-top"><a class="code" href="#/materials/${esc(m.material_id || '')}">${esc(m.material_code || '')}</a>${badge(p.approved_by ? 'part.confirmed' : 'part.unconfirmed')}</div>
        <div class="rec-name">${biName(m)}</div>
        <div class="kv-grid small">
          ${m.part_number ? `<div class="kv"><span>${bi('field.part_number')}</span><strong>${esc(m.part_number)}</strong></div>` : ''}
          ${m.specification_vi || m.specification_zh ? `<div class="kv"><span>${bi('field.specification')}</span><strong>${biName(m, 'specification')}</strong></div>` : ''}
          <div class="kv"><span>${bi('field.installed_qty')}</span><strong>${fmtQty(p.installed_qty, p.unit)}</strong></div>
          ${p.function_vi || p.function_zh ? `<div class="kv"><span>${bi('field.function')}</span><strong>${biName(p, 'function')}</strong></div>` : ''}
          ${p.position_vi || p.position_zh ? `<div class="kv"><span>${bi('field.position')}</span><strong>${biName(p, 'position')}</strong></div>` : ''}
          ${alt ? `<div class="kv"><span>${bi('field.alternate')}</span><strong>${esc(alt.material_code)} ${esc(nameText(alt))}</strong></div>` : ''}
          ${p.compatibility_note ? `<div class="kv"><span>${bi('field.compatibility_note')}</span><strong>${esc(p.compatibility_note)}</strong></div>` : ''}
        </div>
        <div class="row">
          ${canLink ? `<button type="button" class="btn tiny" data-pedit="${esc(p.equipment_part_id)}" ${online ? '' : 'disabled'}>${ICON.edit}<span>${bi('btn.edit')}</span></button>` : ''}
          ${unlinkOk(p) ? `<button type="button" class="btn tiny" data-punlink="${esc(p.equipment_part_id)}" ${online ? '' : 'disabled'}>${bi('btn.unlink')}</button>` : ''}
          ${canApprove && !p.approved_by && p.created_by !== uid && p.updated_by !== uid ? `<button type="button" class="btn tiny primary" data-pappr="${esc(p.equipment_part_id)}" ${online ? '' : 'disabled'}>${ICON.check}<span>${bi('btn.approve')}</span></button>` : ''}
        </div></div>`;
    }).join('')}</div>` : `<p class="muted">${bi('mat.no_parts')}</p>`}
    <div class="row">
      ${canLink ? `<button type="button" class="btn small" id="pt-link" ${online ? '' : 'disabled'}>${ICON.link}<span>${bi('btn.link_part')}</span></button>` : ''}
      ${canNew ? `<button type="button" class="btn small" id="pt-new" ${online ? '' : 'disabled'}>${ICON.plus}<span>${bi('btn.new_part')}</span></button>` : ''}
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${bi('btn.replace_part')}<span class="soon">${bi('tag.coming_soon')}</span></button>
    </div>
    ${(canLink || canNew) && !online ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
    <p class="muted small">${bi('mat.tab_hint')}</p>`;
}

export function wirePartsTab(tb, eq, repaint) {
  const l = $('#pt-link', tb);
  if (l) l.addEventListener('click', async () => { if (await linkDialog(eq, null)) repaint(); });
  const n = $('#pt-new', tb);
  if (n) n.addEventListener('click', () => navigate(`/materials/new?link=${eq.equipment_id}`));
  $$('[data-pedit]', tb).forEach((b) => b.addEventListener('click', async () => {
    const p = (await recs('EQUIPMENT_PART')).find((x) => x.equipment_part_id === b.dataset.pedit);
    if (p && await linkDialog(eq, p)) repaint();
  }));
  $$('[data-punlink]', tb).forEach((b) => b.addEventListener('click', async () => {
    const p = (await recs('EQUIPMENT_PART')).find((x) => x.equipment_part_id === b.dataset.punlink);
    if (!p) return;
    const v = await dialog({
      title: bi('mat.unlink_title'),
      body: `<p class="muted small">${bi('mat.unlink_help')}</p><label for="pu-reason">${bi('field.reason')} <span class="req">*</span></label><input id="pu-reason" type="text" maxlength="300">`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.unlink'), kind: 'primary danger', read: (w) => $('#pu-reason', w).value.trim() }]
    });
    if (v === null) return;
    if (!v) { toast(bi('field.reason_required'), 'err'); return; }
    const r = await writeOnline('part.unlink', { equipment_part_id: p.equipment_part_id, reason: v }, { expected_version: p.record_version });
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(r);
  }));
  $$('[data-pappr]', tb).forEach((b) => b.addEventListener('click', async () => {
    const p = (await recs('EQUIPMENT_PART')).find((x) => x.equipment_part_id === b.dataset.pappr);
    if (!p) return;
    const mats = (await recs('MATERIAL')).filter((m) => m.active !== false && m.is_equipment_component && m.material_id !== p.material_id);
    const v = await dialog({
      title: bi('mat.approve_title'),
      body: `<label for="pa-alt">${bi('field.alternate')}</label><select id="pa-alt" class="inp sel"><option value="">${bi('field.none')}</option>${mats.map((m) => `<option value="${esc(m.material_id)}">${esc(m.material_code)} · ${esc(nameText(m))}</option>`).join('')}</select>`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.approve'), kind: 'primary', read: (w) => ({ alt: $('#pa-alt', w).value }) }]
    });
    if (!v) return;
    const payload = { equipment_part_id: p.equipment_part_id };
    if (v.alt) payload.alternate_part_id = v.alt;
    const r = await writeWithPin('part.approve', payload, { expected_version: p.record_version });
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else if (r.code !== 'REAUTH_REQUIRED') await handleWriteError(r);
  }));
}

/** Gắn vật tư có sẵn / sửa liên kết; preselect: material_id vừa tạo. Trả true khi đã lưu */
export async function linkDialog(eq, part, preselect = '') {
  const used = new Set((await recs('EQUIPMENT_PART')).filter((p) => p.equipment_id === eq.equipment_id && !p.removed_at).map((p) => p.material_id));
  const mats = (await recs('MATERIAL')).filter((m) => m.active !== false && m.is_equipment_component && (!used.has(m.material_id) || (part && part.material_id === m.material_id)))
    .sort((a, b) => String(a.material_code).localeCompare(String(b.material_code)));
  const cur = part ? mats.find((m) => m.material_id === part.material_id) || await byId('MATERIAL', part.material_id) : null;
  const lvl = roleLevel();
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi(part ? 'btn.edit_unlink' : 'btn.link_part')}</h2>
    <p class="muted small">${esc(eq.equipment_code)} · ${biName(eq)}</p>
    ${part ? `<p><strong>${esc(cur ? cur.material_code + ' · ' + nameText(cur) : '')}</strong></p>` : `
      <div class="fld" data-field="material_id"><label for="pl-q">${bi('mat.pick')}</label>
        <input id="pl-q" class="inp" type="search" placeholder="${esc(biText('mat.search_placeholder'))}" autocomplete="off">
        <select id="f-material_id" class="inp sel" size="6">${mats.map((m) => `<option value="${esc(m.material_id)}"${m.material_id === preselect ? ' selected' : ''}>${esc(m.material_code)} · ${esc(nameText(m))}${m.part_number ? ' · ' + esc(m.part_number) : ''}</option>`).join('')}</select><div class="ferr"></div></div>`}
    ${numberInput('installed_qty', 'field.installed_qty', part ? part.installed_qty : 1, { required: true })}
    <div class="muted small" id="pl-unit"></div>
    ${bilingualInputs('function', part, { required: false, labelKey: 'field.function', maxlength: 200 })}
    ${bilingualInputs('position', part, { required: false, labelKey: 'field.position', maxlength: 200 })}
    ${textInput('compatibility_note', 'field.compatibility_note', part ? part.compatibility_note : '', { maxlength: 300 })}
    ${lvl < 3 ? '' : ''}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div>
  </div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  const sel = $('#f-material_id', wrap);
  const unitLine = $('#pl-unit', wrap);
  const showUnit = () => { const m = part ? cur : mats.find((x) => x.material_id === (sel && sel.value)); unitLine.innerHTML = m ? `${bi('field.unit')}: <strong>${esc(m.base_unit || '')}</strong>` : ''; };
  if (sel) {
    sel.addEventListener('change', showUnit);
    const q = $('#pl-q', wrap);
    q.addEventListener('input', () => {
      const t = q.value.toLowerCase();
      [...sel.options].forEach((o) => { o.hidden = t && !o.textContent.toLowerCase().includes(t); });
    });
  }
  showUnit();
  return new Promise((resolve) => {
    const close = (v) => { wrap.remove(); resolve(v); };
    $('[data-x="cancel"]', wrap).addEventListener('click', () => close(false));
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const errs = [];
      const matId = part ? part.material_id : (sel && sel.value);
      if (!matId) errs.push({ field: 'material_id', key: 'field.required' });
      const qty = readField(wrap, 'installed_qty');
      if (qty === null || Number.isNaN(qty) || !(qty > 0)) errs.push({ field: 'installed_qty', key: qty === null ? 'field.required' : 'field.invalid' });
      if (unconfirmedAmbiguous(wrap)) errs.push({ field: 'installed_qty', key: 'field.number_ambiguous', vars: { A: $('#f-installed_qty', wrap).value } });
      if (errs.length) { showErrors(wrap, errs); return; }
      const payload = {
        equipment_part_id: part ? part.equipment_part_id : uuid(), installed_qty: qty,
        function_vi: readField(wrap, 'function_vi'), function_zh: readField(wrap, 'function_zh'),
        position_vi: readField(wrap, 'position_vi'), position_zh: readField(wrap, 'position_zh'),
        compatibility_note: readField(wrap, 'compatibility_note')
      };
      if (!part) { payload.equipment_id = eq.equipment_id; payload.material_id = matId; }
      const btn = ev.currentTarget;
      busy(btn, true);
      const r = await writeOnline('part.link', payload, { expected_version: part ? part.record_version : 0 });
      busy(btn, false);
      if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); close(true); return; }
      if (r.code === 'VALIDATION_ERROR') { showErrors(wrap, r.errors); return; }
      close(false);
      await handleWriteError(r);
    });
  });
}

export { comingSoon, invalidate, oneLang, parseNumberInput, fmtDate };
