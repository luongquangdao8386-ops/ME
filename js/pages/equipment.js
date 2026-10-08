// Thiết bị: EQ-01 danh sách, EQ-02..04 hồ sơ 4 tab, WEB-EQ-01 bảng + vùng hồ sơ; biểu mẫu thêm/sửa (4.4.1, 5.5, 6.3)
import { bi, biText, esc, api, fmtDate, fmtDateTime, fmtNumber, badge, biName, nameText, resMsg, session, uuid, L } from '../core.js';
import { ICON, toast, dialog, h, $, $$ } from '../ui.js';
import { isWide, comingSoon } from '../shell.js';
import { recs, byId, mapOf, can, invalidate, today } from '../data.js';
import { navigate, back } from '../router.js';
import { app, afterCommit } from '../app.js';
import {
  textInput, selectInput, dateInput, numberInput, bilingualInputs, wireForm, readField, showErrors, writeOnline,
  loadFormDraft, saveFormDraft, clearFormDraft, busy, unconfirmedAmbiguous, fieldWrap, parseNumberInput
} from '../form.js';
import { conflictDialog } from './drafts.js';
import { docsTabHtml, wireDocsTab } from './docs.js';
import { partsTabHtml, wirePartsTab } from './materials.js';

const STATUSES = ['RUNNING', 'STOPPED', 'UNDER_REPAIR', 'UNDER_MAINTENANCE', 'STANDBY', 'RETIRED'];
const CRIT = ['HIGH', 'MEDIUM', 'LOW'];
const TABS = ['specs', 'parts', 'documents', 'history'];

/** Khóa thông số chuẩn 5.5: [đơn vị mặc định, đơn vị cho phép, kiểu giá trị] — khớp SPEC_STD_ của máy chủ */
export const SPEC_STD = {
  voltage: ['V', ['V', 'kV'], 'num'], rated_current: ['A', ['A'], 'num'], electrical_power: ['kW', ['kW', 'W', 'HP'], 'num'],
  frequency: ['Hz', ['Hz'], 'num'], working_pressure: ['bar', ['bar', 'MPa', 'kPa'], 'num'], flow_rate: ['m³/h', ['m³/h', 'L/min', 'L/s'], 'num'],
  speed: ['rpm', ['rpm'], 'num'], dimensions: ['mm', ['mm', 'm'], 'text'], weight: ['kg', ['kg', 't'], 'num'],
  throughput: ['kg/h', ['kg/h', 't/h', 'm³/h'], 'num'], rated_capacity_kva: ['kVA', ['kVA'], 'num']
};
const UNITS = ['kWh', 'm³', 'kW', 'kVA', 'W', 'HP', 'V', 'kV', 'A', 'Hz', 'bar', 'MPa', 'kPa', 'm³/h', 'L/min', 'L/s', 'rpm', 'kg/h', 't/h', 'mm²', 'mm', 'm', 'kg', 't', '°C', 'h', 'min', '%'];

/** Giá trị + đơn vị (U+00A0 giữa số và đơn vị, 5.4.4) */
export function fmtQty(v, unit) {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? fmtNumber(v) : esc(v);
  return unit ? `${n} ${esc(unit)}` : n;
}

/** "1200×800×1500" → "1 200 × 800 × 1 500 mm"; "380/220" giữ nguyên (5.4.1, 5.4.4) */
export function fmtSpecText(t, unit) {
  const parts = String(t).split('×').map((x) => (/^\d+(\.\d+)?$/.test(x.trim()) ? fmtNumber(Number(x)) : esc(x.trim())));
  const v = parts.join('\u00A0×\u00A0');
  return unit ? `${v}\u00A0${esc(unit)}` : v;
}

const lookupOpts = async (group) => (await recs('LOOKUP')).filter((l) => l.group_key === group && l.active !== false)
  .map((l) => [l.value_id, esc(nameText(l))]);

async function locLabel(id) {
  const l = await byId('LOCATION', id);
  return l ? `${esc(l.location_code)} · ${biName(l)}` : '';
}

/* ======================= Danh sách (EQ-01 / WEB-EQ-01) ======================= */

const filt = { q: '', status: '', location: '', category: '', retired: false };
let selected = new Set();
let retiredCache = null;

async function listRows() {
  let rows = (await recs('EQUIPMENT')).slice();
  if (filt.retired && navigator.onLine) {
    if (!retiredCache) {
      const r = await api('equipment.view', { include_archived: true, page_size: 200 }, { retry: true });
      retiredCache = r.ok ? r.data.items.filter((x) => x.archived_at) : [];
    }
    rows = rows.concat(retiredCache.filter((x) => !rows.some((y) => y.equipment_id === x.equipment_id)));
  }
  const q = filt.q.toLowerCase();
  return rows.filter((e) => (!filt.status || e.status === filt.status) && (!filt.location || e.location_id === filt.location) &&
      (!filt.category || e.category_id === filt.category) &&
      (!q || [e.equipment_code, e.name_vi, e.name_zh, e.model, e.serial, e.manufacturer].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
}

export async function renderEquipmentList(view, ctx) {
  const { shell, params, query } = ctx;
  const wide = isWide();
  const selId = params.id || query.get('sel') || '';
  const canCreate = await can('equipment.create');
  const canPrint = await can('qr.print');
  shell.setScreen({
    title: 'screen.equipment_list', back: params.id && !wide ? '/equipment' : '/',
    actions: canCreate && !wide ? [{ icon: 'plus', label: biText('btn.add'), onClick: () => navigate('/equipment/new'), disabled: !navigator.onLine }] : []
  });
  const rows = await listRows();
  const locs = await mapOf('LOCATION');
  const locOpts = [...locs.values()].filter((l) => l.active !== false).sort((a, b) => String(a.location_code).localeCompare(String(b.location_code)))
    .map((l) => [l.location_id, `${esc(l.location_code)} ${esc(nameText(l))}`]);
  const catOpts = await lookupOpts('EQUIPMENT_CATEGORY');
  const sel = (id, opts, cur, emptyKey) => `<select id="${id}" class="sel" aria-label="${esc(biText(emptyKey))}"><option value="">${bi(emptyKey)}</option>${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const toolbar = `<div class="toolbar">
    <div class="search"><span>${ICON.search}</span><input id="eq-q" type="search" value="${esc(filt.q)}" placeholder="${esc(biText('field.search_placeholder'))}" autocomplete="off"></div>
    <div class="row">
      ${sel('eq-status', STATUSES.filter((s) => s !== 'RETIRED').map((s) => [s, bi('equipment_status.' + s)]), filt.status, 'field.status')}
      ${sel('eq-loc', locOpts, filt.location, 'field.location')}
      ${catOpts.length ? sel('eq-cat', catOpts, filt.category, 'field.category') : ''}
      <label class="check inline"><input type="checkbox" id="eq-retired" ${filt.retired ? 'checked' : ''} ${navigator.onLine ? '' : 'disabled'}><span>${bi('field.include_retired')}</span></label>
    </div>
    <div class="row tools">
      ${canCreate && wide ? `<a class="btn small primary" href="#/equipment/new">${ICON.plus}<span>${bi('btn.add')}</span></a>` : ''}
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${ICON.reports}<span>${bi('btn.report')}</span><span class="soon">${bi('tag.coming_soon')}</span></button>
      ${canPrint && wide ? `<button type="button" class="btn small" id="eq-print" ${selected.size ? '' : 'disabled'}>${ICON.print}<span>${bi('btn.print_qr')}</span> <span class="count">${selected.size ? '(' + selected.size + ')' : ''}</span></button>` : ''}
    </div>
    <p class="muted small">${bi('field.total', { N: rows.length })}${!navigator.onLine && filt.retired ? ' · ' + bi('sync.need_network') : ''}</p>
  </div>`;
  let body;
  if (wide) {
    body = `<div class="table-wrap eq-table"><table class="tbl"><thead><tr>
      ${canPrint ? `<th class="chk"><input type="checkbox" id="eq-all" aria-label="${esc(biText('btn.print_qr'))}"></th>` : ''}
      <th>${bi('col.code')}</th><th>${bi('col.name')}</th><th>${bi('field.location')}</th><th>${bi('field.model')}</th><th>${bi('field.serial')}</th><th>${bi('field.owner')}</th><th>${bi('field.status')}</th></tr></thead>
      <tbody>${rows.map((e) => `<tr class="click${e.equipment_id === selId ? ' sel' : ''}" data-id="${esc(e.equipment_id)}">
        ${canPrint ? `<td class="chk"><input type="checkbox" data-chk="${esc(e.equipment_id)}" ${selected.has(e.equipment_id) ? 'checked' : ''} ${e.qr_key ? '' : 'disabled'}></td>` : ''}
        <td class="code">${esc(e.equipment_code)}</td><td>${biName(e)}</td>
        <td>${esc((locs.get(e.location_id) || {}).location_code || '')}</td><td>${esc(e.model || '')}</td><td>${esc(e.serial || '')}</td>
        <td>${esc(e.owner_name || '')}</td><td>${badge('equipment_status.' + e.status)}${e.archived_at ? ' ' + badge('tag.archived') : ''}</td></tr>`).join('')}</tbody></table></div>
      ${rows.length ? '' : `<p class="muted">${bi('field.no_records')}</p>`}
      <div id="eq-pane" class="pane">${selId ? '' : ''}</div>`;
  } else {
    body = `<div class="cards">${rows.map((e) => `<a class="card rec-card eq-card" href="#/equipment/${esc(e.equipment_id)}">
      <div class="rec-top"><span class="code">${esc(e.equipment_code)}</span>${badge('equipment_status.' + e.status)}</div>
      <div class="rec-name">${biName(e)}</div>
      <div class="muted small">${esc([(locs.get(e.location_id) || {}).location_code, nameText(locs.get(e.location_id))].filter(Boolean).join(' · '))}</div>
      <div class="muted small">${esc([e.model, e.serial].filter(Boolean).join(' · '))}</div>
      ${e.qr_key ? `<span class="qr-mini" aria-hidden="true">${ICON.qr}</span>` : ''}</a>`).join('') || `<p class="muted">${bi('field.no_records')}</p>`}</div>`;
  }
  view.innerHTML = toolbar + body;
  // Bộ lọc
  const again = () => renderEquipmentList(view, ctx);
  let t = null;
  $('#eq-q', view).addEventListener('input', (e) => { filt.q = e.target.value; clearTimeout(t); t = setTimeout(async () => { const pos = e.target.selectionStart; await again(); const q = $('#eq-q', view); q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ } }, 250); });
  $('#eq-status', view).addEventListener('change', (e) => { filt.status = e.target.value; again(); });
  $('#eq-loc', view).addEventListener('change', (e) => { filt.location = e.target.value; again(); });
  if ($('#eq-cat', view)) $('#eq-cat', view).addEventListener('change', (e) => { filt.category = e.target.value; again(); });
  $('#eq-retired', view).addEventListener('change', (e) => { filt.retired = e.target.checked; retiredCache = null; again(); });
  if (wide) {
    $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('input')) return;
      navigate('/equipment/' + tr.dataset.id, { replace: !!selId });
    }));
    $$('[data-chk]', view).forEach((c) => c.addEventListener('change', () => { if (c.checked) selected.add(c.dataset.chk); else selected.delete(c.dataset.chk); updPrint(); }));
    const all = $('#eq-all', view);
    if (all) all.addEventListener('change', () => { rows.filter((e) => e.qr_key).forEach((e) => (all.checked ? selected.add(e.equipment_id) : selected.delete(e.equipment_id))); $$('[data-chk]', view).forEach((c) => { c.checked = selected.has(c.dataset.chk); }); updPrint(); });
    const pb = $('#eq-print', view);
    function updPrint() { if (pb) { pb.disabled = !selected.size; pb.querySelector('.count').textContent = selected.size ? `(${selected.size})` : ''; } }
    if (pb) pb.addEventListener('click', () => navigate(`/print?type=EQUIPMENT&ids=${[...selected].join(',')}`));
    if (selId) {
      const pane = $('#eq-pane', view);
      await renderPane(pane, selId, query.get('tab') || 'specs', ctx);
      const row = $(`tr[data-id="${CSS.escape(selId)}"]`, view);
      if (row && ctx.query.get('scroll') !== '0') row.scrollIntoView({ block: 'nearest' });
    }
  }
}

/* ======================= Hồ sơ (EQ-02..04) ======================= */

export async function renderEquipment(view, ctx) {
  if (isWide()) return renderEquipmentList(view, ctx);
  const { shell, params, query } = ctx;
  const eq = await findEquipment(params.id);
  const canEdit = await can('equipment.edit');
  shell.setScreen({
    title: 'screen.equipment', back: '/equipment',
    actions: [
      ...(eq && eq.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/EQUIPMENT/${eq.equipment_id}`) }] : []),
      ...(eq && canEdit && !eq.archived_at ? [{ icon: 'edit', label: biText('btn.edit'), onClick: () => navigate(`/equipment/${eq.equipment_id}/edit`), disabled: !navigator.onLine }] : [])
    ]
  });
  view.innerHTML = '<div id="eq-pane" class="pane mobile"></div>';
  await renderPane($('#eq-pane', view), params.id, query.get('tab') || 'specs', ctx);
}

async function findEquipment(id) {
  let eq = await byId('EQUIPMENT', id);
  if (!eq && navigator.onLine) {
    // Hồ sơ đã lưu trữ (không có trong dữ liệu tải về) — đọc trực tiếp khi có mạng
    const r = await api('equipment.view', { equipment_id: id }, { retry: true });
    if (r.ok) eq = r.data.item;
  }
  return eq;
}

/** Vùng hồ sơ: tóm tắt + 4 tab. Dùng cho trang hồ sơ iPhone và vùng dưới bảng trên web */
async function renderPane(pane, id, tab, ctx) {
  const eq = await findEquipment(id);
  if (!eq) { pane.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  if (!TABS.includes(tab)) tab = 'specs';
  const wide = isWide();
  const canEdit = await can('equipment.edit');
  const canArchive = await can('equipment.archive');
  const online = navigator.onLine;
  const cat = eq.category_id ? await byId('LOOKUP', eq.category_id) : null;
  const vendor = eq.vendor_id ? await byId('VENDOR', eq.vendor_id) : null;
  const kv = (k, v) => (v ? `<div class="kv"><span>${bi(k)}</span><strong>${v}</strong></div>` : '');
  pane.innerHTML = `<section class="card eq-head">
    ${eq.archived_at ? `<p class="banner warn">${bi('eq.archived_banner')} · ${esc(fmtDateTime(eq.archived_at))}</p>` : ''}
    <div class="rec-top"><span class="code big">${esc(eq.equipment_code || biText('tag.pending_code'))}</span>${badge('equipment_status.' + eq.status)}</div>
    <h2 class="eq-name">${biName(eq)}</h2>
    <div class="kv-grid">
      ${kv('field.location', await locLabel(eq.location_id))}
      ${kv('field.model', esc(eq.model || ''))}
      ${kv('field.serial', esc(eq.serial || ''))}
    </div>
    <details class="more"${wide ? ' open' : ''}><summary>${bi('eq.summary')}</summary><div class="kv-grid">
      ${kv('field.category', cat ? biName(cat) : '')}
      ${kv('field.manufacturer', esc(eq.manufacturer || ''))}
      ${kv('field.manufacture_year', esc(eq.manufacture_year || ''))}
      ${kv('field.install_date', esc(fmtDate(eq.install_date)))}
      ${kv('field.warranty_end', esc(fmtDate(eq.warranty_end)))}
      ${kv('field.criticality', eq.criticality ? bi('criticality.' + eq.criticality) : '')}
      ${kv('field.owner', esc(eq.owner_name || ''))}
      ${kv('field.vendor', vendor ? esc(vendor.vendor_code + ' · ' + vendor.name) : '')}
    </div></details>
    ${wide ? `<div class="row">
      ${eq.qr_key ? `<a class="btn small" href="#/qr/EQUIPMENT/${esc(eq.equipment_id)}">${ICON.qr}<span>${bi('btn.view_qr')}</span></a>` : ''}
      ${canEdit && !eq.archived_at ? `<a class="btn small" href="#/equipment/${esc(eq.equipment_id)}/edit" ${online ? '' : 'aria-disabled="true"'}>${ICON.edit}<span>${bi('btn.edit')}</span></a>` : ''}
      ${canArchive ? `<button type="button" class="btn small" id="eq-arch" ${online ? '' : 'disabled'}>${ICON.archive}<span>${bi(eq.archived_at ? 'btn.unarchive' : 'btn.archive')}</span></button>` : ''}
    </div>` : (canArchive ? `<div class="row"><button type="button" class="btn small" id="eq-arch" ${online ? '' : 'disabled'}>${ICON.archive}<span>${bi(eq.archived_at ? 'btn.unarchive' : 'btn.archive')}</span></button></div>` : '')}
    ${!online && (canEdit || canArchive) ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
  </section>
  <div class="tabs-bar" role="tablist">${TABS.map((t) => `<button type="button" role="tab" class="tab${t === tab ? ' on' : ''}" data-tab="${t}" aria-selected="${t === tab}">${bi('tab.' + t)}</button>`).join('')}</div>
  <section class="card tab-body" id="eq-tab"></section>`;
  const tb = $('#eq-tab', pane);
  const repaint = () => renderPane(pane, id, tab, ctx);
  $$('[data-tab]', pane).forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tab;
    const base = wide ? `/equipment/${id}?tab=${t}&scroll=0` : `/equipment/${id}?tab=${t}`;
    navigate(base, { replace: true });
  }));
  const arch = $('#eq-arch', pane);
  if (arch) arch.addEventListener('click', async () => { if (await archiveFlow(eq)) { invalidate(); retiredCache = null; if (eq.archived_at) repaint(); else navigate('/equipment', { replace: true }); } });
  if (tab === 'specs') { tb.innerHTML = await specsTabHtml(eq); wireSpecs(tb, eq, repaint); }
  if (tab === 'parts') { tb.innerHTML = await partsTabHtml(eq); wirePartsTab(tb, eq, repaint); }
  if (tab === 'documents') { tb.innerHTML = await docsTabHtml('EQUIPMENT', eq); wireDocsTab(tb, 'EQUIPMENT', eq, repaint); }
  if (tab === 'history') tb.innerHTML = await historyTabHtml(eq);
}

/* ---------- Tab Thông số (EQ-02) ---------- */

async function specsTabHtml(eq) {
  const specs = (await recs('EQUIPMENT_SPEC')).filter((s) => s.equipment_id === eq.equipment_id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.spec_key).localeCompare(String(b.spec_key)));
  const canEdit = (await can('equipment.spec.edit')) && !eq.archived_at;
  const online = navigator.onLine;
  return `${specs.length ? `<dl class="specs">${specs.map((s) => `<div class="spec-row" data-spec="${esc(s.spec_id)}">
      <dt>${bi([s.label_vi, s.label_zh])}</dt>
      <dd>${s.value_text ? fmtSpecText(s.value_text, s.unit) : fmtQty(s.value_num, s.unit)}</dd>
      ${canEdit ? `<div class="spec-act"><button type="button" class="icon-btn" data-edit="${esc(s.spec_id)}" ${online ? '' : 'disabled'} aria-label="${esc(biText('btn.edit'))}">${ICON.edit}</button>
        <button type="button" class="icon-btn" data-del="${esc(s.spec_id)}" ${online ? '' : 'disabled'} aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button></div>` : ''}
    </div>`).join('')}</dl>` : `<p class="muted">${bi('eq.no_specs')}</p>`}
    ${canEdit ? `<div class="row"><button type="button" class="btn small" id="sp-add" ${online ? '' : 'disabled'}>${ICON.plus}<span>${bi('eq.add_spec')}</span></button></div>
      ${online ? '' : `<p class="muted small">${bi('sync.need_network')}</p>`}` : ''}`;
}

function wireSpecs(tb, eq, repaint) {
  const add = $('#sp-add', tb);
  if (add) add.addEventListener('click', async () => { if (await specDialog(eq, null)) repaint(); });
  $$('[data-edit]', tb).forEach((b) => b.addEventListener('click', async () => {
    const s = (await recs('EQUIPMENT_SPEC')).find((x) => x.spec_id === b.dataset.edit);
    if (s && await specDialog(eq, s)) repaint();
  }));
  $$('[data-del]', tb).forEach((b) => b.addEventListener('click', async () => {
    const s = (await recs('EQUIPMENT_SPEC')).find((x) => x.spec_id === b.dataset.del);
    if (!s) return;
    const ok = await dialog({ title: bi('btn.remove'), body: `<p>${bi('eq.remove_spec_confirm')}</p><p><strong>${bi([s.label_vi, s.label_zh])}</strong></p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.remove'), kind: 'danger', value: true }] });
    if (!ok) return;
    const r = await writeOnline('equipment.spec.edit', { spec_id: s.spec_id, remove: true }, { expected_version: s.record_version });
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(r);
  }));
}

/** Hộp thoại thêm/sửa một dòng thông số; trả true khi đã lưu */
async function specDialog(eq, spec) {
  const custom = (await recs('LOOKUP')).filter((l) => l.group_key === 'SPEC_KEY' && l.active !== false);
  const unitLookups = (await recs('LOOKUP')).filter((l) => l.group_key === 'UNIT' && l.active !== false).map((l) => l.code);
  const keys = Object.keys(SPEC_STD).map((k) => [k, bi('spec.' + k)]).concat(custom.map((l) => [l.code, esc(nameText(l))]));
  const used = new Set((await recs('EQUIPMENT_SPEC')).filter((s) => s.equipment_id === eq.equipment_id && (!spec || s.spec_id !== spec.spec_id)).map((s) => s.spec_key));
  const unitsFor = (k) => (SPEC_STD[k] ? SPEC_STD[k][1] : UNITS.concat(unitLookups));
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi(spec ? 'btn.edit' : 'eq.add_spec')}</h2>
    <div class="fld" data-field="spec_key"><label for="f-spec_key">${bi('field.spec_key')}</label>
      <select class="inp sel" id="f-spec_key" ${spec ? 'disabled' : ''}><option value="">${bi('field.choose')}</option>${keys.filter(([k]) => !used.has(k) || (spec && spec.spec_key === k)).map(([k, t]) => `<option value="${esc(k)}"${spec && spec.spec_key === k ? ' selected' : ''}>${t}</option>`).join('')}</select><div class="ferr"></div></div>
    <div id="sp-val"></div>
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div>
  </div></div>`);
  document.body.appendChild(wrap);
  const keySel = $('#f-spec_key', wrap);
  const paintVal = () => {
    const k = keySel.value;
    const isText = SPEC_STD[k] && SPEC_STD[k][2] === 'text';
    const units = unitsFor(k);
    const curUnit = spec ? spec.unit : (SPEC_STD[k] ? SPEC_STD[k][0] : '');
    $('#sp-val', wrap).innerHTML = (isText
      ? fieldWrap('value_text', 'field.spec_value', `<input class="inp" id="f-value_text" type="text" maxlength="200" value="${esc(spec ? spec.value_text : '')}" placeholder="1200×800×1500">`)
      : numberInput('value_num', 'field.spec_value', spec ? spec.value_num : '') +
        (k === 'voltage' ? fieldWrap('value_text', 'field.spec_text', `<input class="inp" id="f-value_text" type="text" maxlength="60" value="${esc(spec ? spec.value_text : '')}" placeholder="380/220">`) : '')) +
      fieldWrap('unit', 'field.unit', `<select class="inp sel" id="f-unit">${(SPEC_STD[k] ? [] : [['', '—']]).concat(units.map((u) => [u, u])).map(([v, t]) => `<option value="${esc(v)}"${v === curUnit ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`);
    wireForm(wrap);
  };
  keySel.addEventListener('change', paintVal);
  paintVal();
  return new Promise((resolve) => {
    const close = (v) => { wrap.remove(); resolve(v); };
    $('[data-x="cancel"]', wrap).addEventListener('click', () => close(false));
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const k = keySel.value;
      const errs = [];
      if (!k) errs.push({ field: 'spec_key', key: 'field.required' });
      const num = readField(wrap, 'value_num');
      const text = readField(wrap, 'value_text');
      if (Number.isNaN(num)) errs.push({ field: 'value_num', key: 'field.invalid' });
      if ((num === null || num === undefined) && !text) errs.push({ field: 'value_num', key: 'field.required' });
      const amb = unconfirmedAmbiguous(wrap);
      if (amb) errs.push({ field: 'value_num', key: 'field.number_ambiguous', vars: { A: amb.value } });
      if (errs.length) { showErrors(wrap, errs); return; }
      const btn = ev.currentTarget;
      busy(btn, true);
      const payload = { spec_id: spec ? spec.spec_id : uuid(), spec_key: k, value_num: num === undefined ? null : num, value_text: text || '', unit: $('#f-unit', wrap).value };
      if (!spec) payload.equipment_id = eq.equipment_id;
      const r = await writeOnline('equipment.spec.edit', payload, { expected_version: spec ? spec.record_version : 0 });
      busy(btn, false);
      if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); close(true); return; }
      if (r.code === 'VALIDATION_ERROR') { showErrors(wrap, r.errors); return; }
      close(false);
      await handleWriteError(r);
    });
  });
}

/* ---------- Tab Lịch sử ---------- */

async function historyTabHtml(eq) {
  const items = [];
  if (eq.created_at) items.push({ at: eq.created_at, html: `${bi('history.created')}${eq.created_by_name ? ' · ' + esc(eq.created_by_name) : ''}` });
  const mats = await mapOf('MATERIAL');
  for (const ev of (await recs('EQUIPMENT_PART_EVENT')).filter((x) => x.equipment_id === eq.equipment_id)) {
    const m = mats.get(ev.material_id);
    items.push({ at: ev.occurred_at || ev.created_at, html: `<span class="kind">${bi('history.part_events')}</span> ${L['part_event.' + ev.event_type] ? bi('part_event.' + ev.event_type) : esc(ev.event_type)} · ${m ? `<a href="#/materials/${esc(m.material_id)}">${esc(m.material_code)}</a> ${esc(nameText(m))}` : ''}${ev.quantity ? ' · ' + fmtQty(ev.quantity, ev.unit) : ''}${ev.created_by_name ? ' · ' + esc(ev.created_by_name) : ''}` });
  }
  const ces = (await recs('CONTRACT_EQUIPMENT')).filter((x) => x.equipment_id === eq.equipment_id);
  const contracts = await mapOf('CONTRACT');
  for (const ce of ces) {
    const c = contracts.get(ce.contract_id);
    if (c) items.push({ at: c.start_date || ce.created_at, html: `<span class="kind">${bi('history.contracts')}</span> <a href="#/contracts/${esc(c.contract_id)}">${esc(c.contract_code)}</a> ${biName(c, 'title')} · ${esc(fmtDate(c.start_date))} – ${esc(fmtDate(c.end_date))}` });
  }
  const reqs = (await recs('INSPECTION_REQUIREMENT')).filter((r) => r.equipment_id === eq.equipment_id);
  const insp = await recs('INSPECTION');
  const types = await mapOf('INSPECTION_TYPE');
  for (const r of reqs) {
    for (const i of insp.filter((x) => x.requirement_id === r.requirement_id)) {
      const t = types.get(r.inspection_type_id);
      items.push({ at: i.inspection_date, html: `<span class="kind">${bi('history.inspections')}</span> <a href="#/inspections/record/${esc(i.inspection_id)}">${esc(i.inspection_code || '')}</a> ${t ? esc(nameText(t)) : ''} · ${badge('inspection_result.' + i.result)} ${badge('cert_status.' + i.status)}` });
    }
  }
  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return items.length ? `<ul class="timeline">${items.map((x) => `<li><span class="when">${esc(x.at && x.at.length > 10 ? fmtDateTime(x.at) : fmtDate(x.at))}</span><span class="what">${x.html}</span></li>`).join('')}</ul>`
    : `<p class="muted">${bi('history.empty')}</p>`;
}

/* ---------- Lưu trữ / dùng lại ---------- */

async function archiveFlow(eq) {
  const unarch = !!eq.archived_at;
  const v = await dialog({
    title: bi(unarch ? 'eq.unarchive_title' : 'eq.archive_title'),
    body: `<p class="muted small">${unarch ? '' : bi('eq.archive_help')}</p>
      ${unarch ? `<label for="ar-status">${bi('field.new_status')}</label><select id="ar-status" class="inp sel">${STATUSES.filter((s) => s !== 'RETIRED').map((s) => `<option value="${s}">${bi('equipment_status.' + s)}</option>`).join('')}</select>` : ''}
      <label for="ar-reason">${bi('field.reason')} <span class="req">*</span></label><input id="ar-reason" type="text" maxlength="300">`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi(unarch ? 'btn.unarchive' : 'btn.archive'), kind: unarch ? 'primary' : 'primary danger', read: (w) => ({ reason: $('#ar-reason', w).value.trim(), status: unarch ? $('#ar-status', w).value : '' }) }]
  });
  if (!v) return false;
  if (!v.reason) { toast(bi('field.reason_required'), 'err'); return false; }
  const r = await writeOnline(unarch ? 'equipment.unarchive' : 'equipment.archive', unarch ? { equipment_id: eq.equipment_id, reason: v.reason, status: v.status } : { equipment_id: eq.equipment_id, reason: v.reason }, { expected_version: eq.record_version });
  if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); return true; }
  await handleWriteError(r);
  return false;
}

/** Lỗi ghi chung: phiên/epoch đã do app xử lý; còn lại báo song ngữ */
export async function handleWriteError(r) {
  if (['AUTH_REQUIRED', 'SESSION_EXPIRED', 'DATASET_RESET', 'MUST_CHANGE_PIN'].includes(r.code)) return;
  if (r.code === 'NETWORK_ERROR' || r.code === 'UNKNOWN_RESULT') { toast(bi('err.unknown_result'), 'err'); return; }
  const extra = (r.errors || []).map((e) => `${e.message_vi || e.code} · ${e.message_zh || ''}`).join('; ');
  toast(`${esc(resMsg(r))}${extra ? ' — ' + esc(extra) : ''}`, 'err');
}

/* ======================= Biểu mẫu thêm/sửa ======================= */

const EQ_FIELDS = ['equipment_code', 'category_id', 'location_id', 'vendor_id', 'manufacturer', 'model', 'serial', 'manufacture_year', 'install_date', 'warranty_end', 'status', 'criticality', 'owner_user_id'];

export async function renderEquipmentForm(view, ctx) {
  const { shell, params } = ctx;
  const isNew = !params.id;
  shell.setScreen({ title: isNew ? 'screen.equipment_new' : 'screen.equipment_edit', back: isNew ? '/equipment' : `/equipment/${params.id}` });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  if (!(await can(isNew ? 'equipment.create' : 'equipment.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  let rec = isNew ? { status: 'RUNNING' } : await findEquipment(params.id);
  if (!rec) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const draftKey = isNew ? 'equipment:new' : `equipment:${params.id}`;
  const draft = await loadFormDraft(draftKey);
  const mine = ctx.mine || null; // giá trị của tôi khi sửa tiếp trên bản máy chủ
  const vals = { ...rec, ...(draft || {}) };
  const locs = (await recs('LOCATION')).filter((l) => l.active !== false).sort((a, b) => String(a.location_code).localeCompare(String(b.location_code)));
  const vendors = (await recs('VENDOR')).filter((v) => v.active !== false);
  const cats = await lookupOpts('EQUIPMENT_CATEGORY');
  let users = [];
  if (await can('user.pickList')) {
    const r = await api('user.pickList', {}, { retry: true });
    if (r.ok) users = r.data.items;
  }
  if (rec.owner_user_id && !users.some((u) => u.user_id === rec.owner_user_id)) users.push({ user_id: rec.owner_user_id, employee_code: '', display_name: rec.owner_name || rec.owner_user_id });
  const mineHint = (f) => (mine && Object.prototype.hasOwnProperty.call(mine, f) && String(mine[f] ?? '') !== String(rec[f] ?? '') ? `${bi('form.my_value')}: <strong>${esc(mine[f])}</strong>` : '');
  view.innerHTML = `<form class="card form-card" novalidate>
    ${draft ? `<p class="banner info">${bi('form.draft_restored')} <button type="button" class="btn tiny" id="fd-discard">${bi('form.discard_draft')}</button></p>` : ''}
    ${mine ? `<p class="banner warn">${bi('form.server_loaded')}</p>` : ''}
    <div class="form-grid">
      ${textInput('equipment_code', 'field.equipment_code', vals.equipment_code, { maxlength: 32, upper: true, hint: isNew ? bi('field.code_auto') : mineHint('equipment_code') })}
      ${bilingualInputs('name', vals)}
      ${selectInput('category_id', 'field.category', cats, vals.category_id, { hint: mineHint('category_id') })}
      ${selectInput('location_id', 'field.location', locs.map((l) => [l.location_id, `${esc(l.location_code)} · ${esc(nameText(l))}`]), vals.location_id, { hint: mineHint('location_id') })}
      ${selectInput('vendor_id', 'field.vendor', vendors.map((v) => [v.vendor_id, `${esc(v.vendor_code)} · ${esc(v.name)}`]), vals.vendor_id, { hint: mineHint('vendor_id') })}
      ${textInput('manufacturer', 'field.manufacturer', vals.manufacturer, { maxlength: 120, hint: mineHint('manufacturer') })}
      ${textInput('model', 'field.model', vals.model, { maxlength: 120, hint: mineHint('model') })}
      ${textInput('serial', 'field.serial', vals.serial, { maxlength: 120, hint: mineHint('serial') })}
      ${numberInput('manufacture_year', 'field.manufacture_year', vals.manufacture_year ? String(vals.manufacture_year) : '', { integer: true, hint: mineHint('manufacture_year') })}
      ${dateInput('install_date', 'field.install_date', vals.install_date, { hint: mineHint('install_date') })}
      ${dateInput('warranty_end', 'field.warranty_end', vals.warranty_end, { hint: mineHint('warranty_end') })}
      ${selectInput('status', 'field.status', STATUSES.filter((s) => s !== 'RETIRED').map((s) => [s, bi('equipment_status.' + s)]), vals.status, { empty: null, hint: mineHint('status') })}
      ${selectInput('criticality', 'field.criticality', CRIT.map((c) => [c, bi('criticality.' + c)]), vals.criticality, { hint: mineHint('criticality') })}
      ${selectInput('owner_user_id', 'field.owner', users.map((u) => [u.user_id, esc(`${u.employee_code ? u.employee_code + ' · ' : ''}${u.display_name}`)]), vals.owner_user_id, { hint: mineHint('owner_user_id') })}
    </div>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div>
  </form>`;
  const form = $('form', view);
  // manufacture_year hiện không nhóm hàng nghìn (năm không nhóm, 5.4.1)
  const yr = $('#f-manufacture_year', form);
  if (yr) yr.value = vals.manufacture_year ? String(vals.manufacture_year) : '';
  wireForm(form);
  if (yr) yr.addEventListener('blur', () => { yr.value = yr.value.replace(/\s/g, ''); });
  const collect = () => {
    const out = { name_vi: readField(form, 'name_vi'), name_zh: readField(form, 'name_zh') };
    EQ_FIELDS.forEach((f) => { out[f] = readField(form, f); });
    return out;
  };
  form.addEventListener('input', () => { saveFormDraft(draftKey, collect()); });
  form.addEventListener('change', () => { saveFormDraft(draftKey, collect()); });
  const dd = $('#fd-discard', form);
  if (dd) dd.addEventListener('click', async () => { await clearFormDraft(draftKey); renderEquipmentForm(view, ctx); });
  $('#fm-cancel', form).addEventListener('click', () => back(isNew ? '/equipment' : `/equipment/${params.id}`));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = collect();
    const errs = [];
    if (!v.name_vi && !v.name_zh) errs.push({ field: 'name', key: 'field.one_lang' });
    if (v.install_date === null) errs.push({ field: 'install_date', key: 'field.invalid_date' });
    if (v.warranty_end === null) errs.push({ field: 'warranty_end', key: 'field.invalid_date' });
    if (Number.isNaN(v.manufacture_year) || (v.manufacture_year !== null && (v.manufacture_year < 1900 || v.manufacture_year > 2100))) errs.push({ field: 'manufacture_year', key: 'field.year_invalid' });
    if (errs.length) { showErrors(form, errs); return; }
    const payload = {};
    if (isNew) {
      payload.equipment_id = uuid();
      Object.entries(v).forEach(([k, x]) => { if (x !== '' && x !== null && x !== undefined) payload[k] = x; });
    } else {
      payload.equipment_id = rec.equipment_id;
      Object.entries(v).forEach(([k, x]) => {
        const cur = rec[k] === null || rec[k] === undefined ? '' : rec[k];
        const nx = x === null || x === undefined ? '' : x;
        if (String(cur) !== String(nx)) payload[k] = nx === '' && k === 'manufacture_year' ? '' : nx;
      });
      if (payload.equipment_code === rec.equipment_code) delete payload.equipment_code;
    }
    const btn = $('#fm-save', form);
    busy(btn, true);
    const r = await writeOnline(isNew ? 'equipment.create' : 'equipment.edit', payload, { expected_version: isNew ? 0 : rec.record_version });
    busy(btn, false);
    if (r.ok) {
      await clearFormDraft(draftKey);
      await afterCommit();
      toast(bi('form.saved'), 'ok');
      navigate(`/equipment/${payload.equipment_id}`, { replace: true });
      return;
    }
    if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; }
    if (r.code === 'VERSION_CONFLICT') {
      const fields = Object.keys(payload).filter((k) => k !== 'equipment_id').map((k) => ({ key: k, label: L['field.' + k.replace(/_id$/, '')] ? bi('field.' + k.replace(/_id$/, '')) : esc(k) }));
      const choice = await conflictDialog({ mine: payload, server: r.data && r.data.server, fields });
      if (choice === 'server') { await clearFormDraft(draftKey); await afterCommit(); navigate(`/equipment/${rec.equipment_id}`, { replace: true }); }
      if (choice === 'edit') { await clearFormDraft(draftKey); await afterCommit(); renderEquipmentForm(view, { ...ctx, mine: payload }); }
      return;
    }
    await handleWriteError(r);
  });
}

export { comingSoon, today, session, parseNumberInput };
