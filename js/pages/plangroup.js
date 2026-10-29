// Bảo trì → Kế hoạch cho cả loại (d4.18, Bước 2 kế hoạch năm): chọn loại thiết bị → tick máy → một form (tên việc, chu kỳ, ngày bắt đầu,
// rải lịch cách N ngày, checklist, người làm…) → mỗi máy một kế hoạch, chung nhóm. Trang nhóm: danh sách máy, sửa cả nhóm (chỉ ô đã đổi,
// cho các máy đang chọn), ngừng/chạy lại cả nhóm, thêm máy cùng loại chưa có trong nhóm. Mỗi máy vẫn sửa riêng ở trang kế hoạch của máy.
import { bi, biText, esc, fmtDate, fmtNumber, badge, biName, nameText, uuid } from '../core.js';
import { ICON, toast, dialog, $, $$ } from '../ui.js';
import { recs, can, today, addDays } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit } from '../app.js';
import { selectInput, dateInput, numberInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, assistedFields, busy } from '../form.js';
import { handleWriteError } from './equipment.js';
import { checklistMap } from './maintenance.js';
import { workerPick, eqText, PRIORITIES } from '../work.js';

const INTERVALS = ['DAY', 'MONTH', 'OPERATING_HOURS'];
const NONE = '__none';

/** Loại thiết bị (LookupValues EQUIPMENT_CATEGORY) đang dùng, xếp theo tên */
async function categories() {
  return (await recs('LOOKUP')).filter((l) => l.group_key === 'EQUIPMENT_CATEGORY' && !l.archived_at && l.active !== false)
    .sort((a, b) => nameText(a).localeCompare(nameText(b), 'vi'));
}

/** Máy của loại (NONE = chưa phân loại), chưa xóa, xếp theo mã */
async function machinesOf(catKey) {
  const cats = new Set((await categories()).map((c) => c.value_id));
  return (await recs('EQUIPMENT')).filter((e) => !e.archived_at && (catKey === NONE ? !cats.has(e.category_id) : e.category_id === catKey))
    .sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
}

/** Giờ chạy mới nhất theo máy */
async function latestHoursMap() {
  const m = new Map();
  for (const r of await recs('OPERATING_READING')) {
    if (r.archived_at) continue;
    const cur = m.get(r.equipment_id);
    if (!cur || String(r.measured_at) > String(cur.measured_at)) m.set(r.equipment_id, r);
  }
  return m;
}

/** Số kế hoạch đang chạy theo máy */
async function activePlanCount() {
  const m = new Map();
  for (const p of await recs('MAINTENANCE_PLAN')) if (!p.archived_at && p.active !== false) m.set(p.equipment_id, (m.get(p.equipment_id) || 0) + 1);
  return m;
}

/** Máy chưa có kế hoạch bảo trì đang chạy, theo loại ('' = chưa phân loại) — dùng ở tab Kế hoạch năm */
export async function machinesWithoutPlan() {
  const cats = new Set((await categories()).map((c) => c.value_id));
  const plans = await activePlanCount();
  const out = new Map();
  for (const e of await recs('EQUIPMENT')) {
    if (e.archived_at || e.status === 'RETIRED' || plans.get(e.equipment_id)) continue;
    const k = cats.has(e.category_id) ? e.category_id : '';
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

/** Chữ lỗi theo dòng máy chủ trả (errors[].row = thứ tự máy đã chọn) */
function rowErrors(errs, picked) {
  return (errs || []).map((e) => {
    const msg = e.message_vi ? `${e.message_vi} · ${e.message_zh || ''}` : e.code;
    const eq = e.row !== null && e.row !== undefined ? picked[e.row] : null;
    return eq ? `${eq.equipment_code}: ${msg}` : msg;
  });
}

/** Ô máy: tick, mã · tên, ngày mốc dự kiến (rải lịch), ghi chú; theo giờ chạy mà chưa ghi giờ → ô nhập mốc */
function machineRows(list, { checkedAll = true, hoursMap, planCount, inGroup = new Set() }) {
  if (!list.length) return `<p class="muted">${bi('pg.no_machines')}</p>`;
  return `<ul class="pg-list">${list.map((e) => {
    const off = e.status === 'RETIRED' || inGroup.has(e.equipment_id);
    const notes = [];
    if (e.status === 'RETIRED' || e.status === 'STOPPED') notes.push(bi('equipment_status.' + e.status));
    const n = planCount.get(e.equipment_id) || 0;
    if (n) notes.push(bi('pg.has_plans', { N: n }));
    const h = hoursMap.get(e.equipment_id);
    return `<li class="pg-item" data-row="${esc(e.equipment_id)}">
      <label class="check"><input type="checkbox" data-eq="${esc(e.equipment_id)}"${checkedAll && !off ? ' checked' : ''}${inGroup.has(e.equipment_id) ? ' disabled' : ''}><span><span class="code">${esc(e.equipment_code)}</span> ${esc(nameText(e))}</span></label>
      <span class="pg-when small" data-when></span>
      ${notes.length ? `<span class="muted small">${notes.join(' · ')}</span>` : ''}
      <span class="pg-hrs" hidden>${h ? `<span class="muted small">${fmtNumber(h.cumulative_hours)} h</span>` : `<input class="inp num pg-target" data-target="${esc(e.equipment_id)}" inputmode="numeric" placeholder="${esc(biText('pg.target_ph'))}" aria-label="${esc(biText('pg.target_ph'))} ${esc(e.equipment_code)}"><span class="muted small">${bi('pg.no_reading')}</span>`}</span>
    </li>`;
  }).join('')}</ul>`;
}

/** Máy đang chọn theo thứ tự trên màn; mốc = ngày bắt đầu + thứ tự × khoảng cách */
function picked(root, list) {
  const on = new Set($$('input[data-eq]:checked', root).filter((i) => !i.disabled).map((i) => i.dataset.eq));
  return list.filter((e) => on.has(e.equipment_id));
}

function refreshWhen(root, list, start, spread, hours) {
  const pk = picked(root, list);
  $$('[data-row]', root).forEach((li) => {
    const i = pk.findIndex((e) => e.equipment_id === li.dataset.row);
    const w = $('[data-when]', li);
    w.textContent = i >= 0 && !hours && start ? fmtDate(addDays(start, i * (spread || 0))) : '';
    $('.pg-hrs', li).hidden = !hours || i < 0;
  });
  return pk;
}

/** Ô mốc giờ chạy nhập trên dòng máy (máy chưa ghi giờ chạy) */
function targetsOf(root, pk, hoursMap) {
  const out = new Map();
  let missing = false;
  for (const e of pk) {
    if (hoursMap.get(e.equipment_id)) continue;
    const inp = $(`[data-target="${CSS.escape(e.equipment_id)}"]`, root);
    const v = inp ? Number(String(inp.value).replace(/[\s.,]/g, '')) : NaN;
    if (!inp || !inp.value.trim() || !(v >= 0)) missing = true; else out.set(e.equipment_id, v);
  }
  return { targets: out, missing };
}

/* ======================= Tạo kế hoạch cho cả loại ======================= */

export async function renderPlanGroupForm(view, ctx) {
  const { shell, query } = ctx;
  shell.setScreen({ title: 'pg.new', back: '/maintenance' });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  if (!(await can('maintenance.plan.group'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const cats = await categories();
  let cat = (query && query.get('cat')) || (cats[0] ? cats[0].value_id : NONE);
  if (cat !== NONE && !cats.some((c) => c.value_id === cat)) cat = NONE;
  const cls = [...(await checklistMap()).values()].filter((c) => c.active);
  const users = await workerPick();
  const hoursMap = await latestHoursMap();
  const planCount = await activePlanCount();
  const rec = { interval_type: 'MONTH', interval_value: 1, priority: 'NORMAL' };
  view.innerHTML = `<form class="card form-card pg-form" novalidate>
    <div class="form-grid">
      ${selectInput('category', 'pg.category', [...cats.map((c) => [c.value_id, biName(c)]), [NONE, bi('yr.uncategorized')]], cat, { empty: null, required: true })}
    </div>
    <section class="pg-machines" data-field="plans"><div class="pg-head"><h3>${bi('pg.machines')}</h3><span class="muted small" id="pg-count"></span>
      <span class="row pg-sel"><button type="button" class="btn tiny" id="pg-all"><span>${bi('pg.select_all')}</span></button><button type="button" class="btn tiny" id="pg-none"><span>${bi('pg.select_none')}</span></button></span></div>
      <div id="pg-list"></div><div class="ferr"></div></section>
    <div class="form-grid">
      ${bilingualInputs('title', rec, { labelKey: 'mt.title', suggest: 'maintenance' })}
      ${selectInput('interval_type', 'mt.interval_type', INTERVALS.map((x) => [x, bi('mt.interval_type.' + x)]), rec.interval_type, { empty: null, required: true })}
      ${numberInput('interval_value', 'mt.interval_value', rec.interval_value, { integer: true, required: true })}
      <div id="pg-cal">${dateInput('start_date', 'pg.start_date', today(), { required: true })}
        ${numberInput('spread_days', 'pg.spread_days', 0, { integer: true, hint: bi('pg.spread_hint') })}</div>
      <p id="pg-hrs-hint" class="muted small" hidden>${bi('pg.hours_hint')}</p>
      ${selectInput('checklist_template_id', 'mt.checklist', cls.map((c) => [c.template_id, `${esc(nameText(c.head, 'template_name'))} · ${esc(biText('mt.revision'))} ${c.revision}`]), '')}
      ${selectInput('assignee_user_id', 'mt.default_assignee', users.map((u) => [u.user_id, esc(`${u.employee_code} · ${u.display_name}`)]), '', { hint: bi('mt.default_assignee_hint') })}
      ${selectInput('priority', 'wk.col.priority', PRIORITIES.map((x) => [x, bi('priority.' + x)]), 'NORMAL', { empty: null })}
      ${numberInput('estimated_minutes', 'mt.estimated', '', { integer: true, hint: 'min' })}
      ${bilingualInputs('safety_note', rec, { labelKey: 'mt.safety', required: false, area: true, maxlength: 500, suggest: 'maintenance' })}
    </div>
    <p class="muted small">${bi('pg.form_help')}</p>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel"><span>${bi('btn.cancel')}</span></button><button type="submit" class="btn primary" id="fm-save"></button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  let list = [];
  const hours = () => $('#f-interval_type', form).value === 'OPERATING_HOURS';
  const update = () => {
    const h = hours();
    $('#pg-cal', form).hidden = h;
    $('#pg-hrs-hint', form).hidden = !h;
    const spread = readField(form, 'spread_days');
    const pk = refreshWhen(form, list, readField(form, 'start_date'), Number.isFinite(spread) ? spread : 0, h);
    $('#pg-count', form).innerHTML = bi('pg.selected_n', { N: pk.length, T: list.length });
    $('#fm-save', form).innerHTML = `<span>${bi('pg.create_n', { N: pk.length })}</span>`;
    $('#fm-save', form).disabled = !pk.length;
  };
  const loadList = async () => {
    list = await machinesOf($('#f-category', form).value);
    $('#pg-list', form).innerHTML = machineRows(list, { hoursMap, planCount });
    $$('input[data-eq]', form).forEach((i) => i.addEventListener('change', update));
    update();
  };
  $('#f-category', form).addEventListener('change', loadList);
  $('#f-interval_type', form).addEventListener('change', update);
  for (const id of ['start_date', 'spread_days']) { const el = $('#f-' + id, form); el.addEventListener('change', update); el.addEventListener('blur', update); }
  $('#pg-all', form).addEventListener('click', () => { $$('input[data-eq]', form).forEach((i) => { if (!i.disabled) i.checked = true; }); update(); });
  $('#pg-none', form).addEventListener('click', () => { $$('input[data-eq]', form).forEach((i) => { i.checked = false; }); update(); });
  $('#fm-cancel', form).addEventListener('click', () => back('/maintenance'));
  await loadList();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const it = readField(form, 'interval_type');
    const pk = picked(form, list);
    const errs = [];
    if (!pk.length) errs.push({ field: 'plans', key: 'pg.need_machine' });
    const p = {
      plan_group_id: uuid(), title_vi: readField(form, 'title_vi'), title_zh: readField(form, 'title_zh'), interval_type: it, interval_value: readField(form, 'interval_value'),
      checklist_template_id: readField(form, 'checklist_template_id') || '', assignee_user_id: readField(form, 'assignee_user_id') || '', priority: readField(form, 'priority'),
      estimated_minutes: readField(form, 'estimated_minutes'), safety_note_vi: readField(form, 'safety_note_vi'), safety_note_zh: readField(form, 'safety_note_zh')
    };
    if (!p.title_vi && !p.title_zh) errs.push({ field: 'title', key: 'field.required' });
    if (!(p.interval_value > 0)) errs.push({ field: 'interval_value', key: 'field.invalid' });
    if (Number.isNaN(p.estimated_minutes)) errs.push({ field: 'estimated_minutes', key: 'field.invalid' });
    let start = '', spread = 0, tg = { targets: new Map(), missing: false };
    if (it === 'OPERATING_HOURS') {
      tg = targetsOf(form, pk, hoursMap);
      if (tg.missing) errs.push({ field: 'plans', key: 'pg.need_target' });
    } else {
      start = readField(form, 'start_date');
      if (!start) errs.push({ field: 'start_date', key: start === null ? 'field.invalid_date' : 'field.required' });
      spread = readField(form, 'spread_days');
      if (Number.isNaN(spread) || spread < 0 || spread > 365) errs.push({ field: 'spread_days', key: 'field.invalid' });
    }
    const as = assistedFields(form);
    if (!as.ok) errs.push(...as.errors);
    if (errs.length) { showErrors(form, errs); return; }
    if (as.bases.length) p.i18n_assisted = as.bases;
    if (p.estimated_minutes === null) p.estimated_minutes = '';
    p.plans = pk.map((e, i) => {
      const x = { plan_id: uuid(), equipment_id: e.equipment_id };
      if (it !== 'OPERATING_HOURS') x.anchor_date = addDays(start, i * (spread || 0));
      else if (tg.targets.has(e.equipment_id)) x.operating_hours_target = tg.targets.get(e.equipment_id);
      return x;
    });
    const btn = $('#fm-save', form);
    busy(btn, true);
    const res = await writeOnline('maintenance.plan.group', p, { expected_version: 0 });
    busy(btn, false);
    if (!res.ok) {
      if (res.code === 'VALIDATION_ERROR') {
        const general = (res.errors || []).filter((e) => e.row === null || e.row === undefined);
        showErrors(form, general);
        const rows = rowErrors((res.errors || []).filter((e) => e.row !== null && e.row !== undefined), pk);
        if (rows.length) $('.form-err', form).textContent = rows.join(' · ');
        return;
      }
      await handleWriteError(res);
      return;
    }
    await afterCommit();
    const gens = (res.data && res.data.generated_work_orders) || [];
    toast(bi('pg.created', { N: pk.length }) + (gens.length ? ' · ' + bi('pg.wo_generated', { N: gens.length }) : ''), 'ok');
    navigate(`/maintenance/plans/group/${p.plan_group_id}`, { replace: true });
  });
}

/* ======================= Trang nhóm ======================= */

const st = { gid: null, editing: false };

function cycleHtml(p) {
  if (p.interval_type === 'OPERATING_HOURS') return `${fmtNumber(p.interval_value)} ${bi('interval.OPERATING_HOURS')}`;
  return `${bi('mt.every')} ${fmtNumber(p.interval_value)} ${bi('interval.' + p.interval_type)}`;
}

export async function renderPlanGroup(view, ctx) {
  const { shell, params } = ctx;
  if (st.gid !== params.gid) { st.gid = params.gid; st.editing = false; }
  shell.setScreen({ title: 'pg.title', back: '/maintenance' });
  const members = (await recs('MAINTENANCE_PLAN')).filter((p) => p.plan_group_id === params.gid && !p.archived_at);
  if (!members.length) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'err.not_found' : 'sync.need_network')}</div>`; return; }
  const eqMap = new Map((await recs('EQUIPMENT')).map((e) => [e.equipment_id, e]));
  members.sort((a, b) => String((eqMap.get(a.equipment_id) || {}).equipment_code).localeCompare(String((eqMap.get(b.equipment_id) || {}).equipment_code)));
  const first = members[0];
  const canEdit = await can('maintenance.plan.group_edit');
  const canAdd = await can('maintenance.plan.group');
  const online = navigator.onLine;
  const cls = await checklistMap();
  const cl = first.checklist_template_id ? cls.get(first.checklist_template_id) : null;
  const active = members.filter((p) => p.active !== false);
  // Máy cùng loại (theo loại của các máy trong nhóm) chưa có trong nhóm
  const inGroup = new Set(members.map((p) => p.equipment_id));
  const groupCats = new Set(members.map((p) => (eqMap.get(p.equipment_id) || {}).category_id).filter(Boolean));
  const others = [...eqMap.values()].filter((e) => !e.archived_at && e.status !== 'RETIRED' && !inGroup.has(e.equipment_id) && groupCats.has(e.category_id))
    .sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const hoursMap = await latestHoursMap();
  const planCount = await activePlanCount();
  const kv = (k, v) => (v ? `<div class="kv"><span>${bi(k)}</span><strong>${v}</strong></div>` : '');
  const assignee = first.assignee_name || (first.assignee_user_id ? '' : biText('field.not_set'));
  view.innerHTML = `<section class="card">
    <div class="rec-top"><span class="tag">${bi('pg.title')}</span>${badge('plan_active.' + (active.length ? 'TRUE' : 'FALSE'))}</div>
    <h2 class="eq-name">${biName(first, 'title')}</h2>
    <div class="kv-grid">
      ${kv('mt.interval', cycleHtml(first))}
      ${kv('pg.members', `${fmtNumber(members.length)}${active.length !== members.length ? ` · ${bi('pg.active_n', { N: active.length })}` : ''}`)}
      ${kv('mt.checklist', cl ? `${biName(cl.head, 'template_name')} · ${bi('mt.revision')} ${cl.revision}` : esc(biText('field.not_set')))}
      ${kv('mt.default_assignee', esc(assignee))}
      ${kv('wk.col.priority', badge('priority.' + (first.priority || 'NORMAL')))}
    </div>
    <div class="row">
      ${canEdit ? `<button type="button" class="btn small primary" id="pg-edit" ${online ? '' : 'disabled'}>${ICON.edit}<span>${bi('pg.edit_group')}</span></button>` : ''}
      ${canEdit && active.length ? `<button type="button" class="btn small" id="pg-stop" ${online ? '' : 'disabled'}><span>${bi('pg.stop_all')}</span></button>` : ''}
      ${canEdit && active.length !== members.length ? `<button type="button" class="btn small" id="pg-resume" ${online ? '' : 'disabled'}><span>${bi('pg.resume_all')}</span></button>` : ''}
    </div>
    ${!online && (canEdit || canAdd) ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
  </section>
  ${st.editing && canEdit ? await editFormHtml(first, cls) : ''}
  <section class="card"><div class="card-head"><h3>${bi('pg.members')}</h3>${canEdit ? `<span class="muted small" id="pg-mcount"></span>` : ''}</div>
    <ul class="pg-list">${members.map((p) => {
      const e = eqMap.get(p.equipment_id);
      const when = p.interval_type === 'OPERATING_HOURS' ? `${bi('mt.hours_target')}: ${fmtNumber(p.operating_hours_target)} h` : `${bi('mt.next_due')}: ${esc(fmtDate(p.next_due_date) || biText('field.not_set'))}`;
      return `<li class="pg-item">${canEdit ? `<label class="check pg-pick"><input type="checkbox" data-pl="${esc(p.plan_id)}" checked aria-label="${esc(e ? eqText(e) : p.plan_code)}"></label>` : ''}
        <a href="#/maintenance/plans/${esc(p.plan_id)}"><span class="code">${esc(p.plan_code)}</span> ${esc(e ? eqText(e) : '')}</a>
        <span class="muted small">${when}</span>${p.active === false ? badge('plan_active.FALSE') : ''}</li>`;
    }).join('')}</ul></section>
  ${canAdd && others.length ? `<section class="card pg-add"><h3>${bi('pg.add_title')} (${others.length})</h3>
    ${first.interval_type !== 'OPERATING_HOURS' ? `<div class="form-grid">${dateInput('add_start', 'pg.start_date', today())}${numberInput('add_spread', 'pg.spread_days', 0, { integer: true, hint: bi('pg.spread_hint') })}</div>` : `<p class="muted small">${bi('pg.hours_hint')}</p>`}
    ${machineRows(others, { checkedAll: false, hoursMap, planCount })}
    <p class="add-err err" role="alert"></p>
    <div class="row"><button type="button" class="btn small primary" id="pg-add" disabled>${bi('pg.add_btn', { N: 0 })}</button></div></section>` : ''}`;
  const repaint = () => renderPlanGroup(view, ctx);
  const chosen = () => members.filter((p) => { const i = $(`input[data-pl="${CSS.escape(p.plan_id)}"]`, view); return i && i.checked; });
  const countSel = () => { const n = chosen().length; const el = $('#pg-mcount', view); if (el) el.innerHTML = bi('pg.selected_n', { N: n, T: members.length }); const ap = $('#pg-apply', view); if (ap) { ap.innerHTML = `<span>${bi('pg.apply_n', { N: n })}</span>`; ap.disabled = !n; } };
  $$('input[data-pl]', view).forEach((i) => i.addEventListener('change', countSel));
  const versions = (list) => Object.fromEntries(list.map((p) => [p.plan_id, p.record_version]));
  const send = async (changes, reason, list) => {
    const res = await writeOnline('maintenance.plan.group_edit', { plan_group_id: params.gid, plan_ids: list.map((p) => p.plan_id), versions: versions(list), changes, reason }, { expected_version: 0 });
    if (!res.ok) return res;
    await afterCommit();
    const gens = (res.data && res.data.generated_work_orders) || [];
    toast(bi('pg.updated', { N: list.length }) + (gens.length ? ' · ' + bi('pg.wo_generated', { N: gens.length }) : ''), 'ok');
    return res;
  };
  const on = (id, fn) => { const el = $('#' + id, view); if (el) el.addEventListener('click', fn); };
  on('pg-edit', () => { st.editing = !st.editing; repaint(); });
  on('pg-stop', async () => {
    const list = chosen().filter((p) => p.active !== false);
    if (!list.length) { toast(bi('pg.need_machine'), 'err'); return; }
    const reason = await dialog({ title: bi('pg.stop_all'), body: `<label for="pr">${bi('field.reason')} <span class="req">*</span></label><input id="pr" type="text" maxlength="300">`, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('pg.stop_all'), kind: 'primary danger', read: (w) => $('#pr', w).value.trim() }] });
    if (reason === null) return;
    if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    const r = await send({ active: false }, reason, list);
    if (r.ok) repaint(); else await handleWriteError(r);
  });
  on('pg-resume', async () => {
    const list = chosen().filter((p) => p.active === false);
    if (!list.length) { toast(bi('pg.need_machine'), 'err'); return; }
    const r = await send({ active: true }, '', list);
    if (r.ok) repaint(); else await handleWriteError(r);
  });
  const form = $('form.pg-edit', view);
  if (form) {
    wireForm(form);
    $('#pg-cancel', form).addEventListener('click', () => { st.editing = false; repaint(); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const list = chosen();
      if (!list.length) { showErrors(form, [{ field: 'x', key: 'pg.need_machine' }]); return; }
      const ch = {};
      const errs = [];
      const tv = readField(form, 'title_vi'), tz = readField(form, 'title_zh');
      if (!tv && !tz) errs.push({ field: 'title', key: 'field.required' });
      if (tv !== (first.title_vi || '') || tz !== (first.title_zh || '')) { ch.title_vi = tv; ch.title_zh = tz; }
      const iv = readField(form, 'interval_value');
      if (!(iv > 0)) errs.push({ field: 'interval_value', key: 'field.invalid' }); else if (iv !== Number(first.interval_value)) ch.interval_value = iv;
      for (const k of ['checklist_template_id', 'assignee_user_id', 'priority']) { const v = readField(form, k) || ''; if (v !== (first[k] || (k === 'priority' ? 'NORMAL' : ''))) ch[k] = v; }
      const em = readField(form, 'estimated_minutes');
      if (Number.isNaN(em)) errs.push({ field: 'estimated_minutes', key: 'field.invalid' });
      else if ((em === null ? '' : em) !== (first.estimated_minutes === null || first.estimated_minutes === undefined ? '' : Number(first.estimated_minutes))) ch.estimated_minutes = em === null ? '' : em;
      const sv = readField(form, 'safety_note_vi'), sz = readField(form, 'safety_note_zh');
      if (sv !== (first.safety_note_vi || '') || sz !== (first.safety_note_zh || '')) { ch.safety_note_vi = sv; ch.safety_note_zh = sz; }
      if (errs.length) { showErrors(form, errs); return; }
      if (!Object.keys(ch).length) { showErrors(form, [{ field: 'x', key: 'pg.no_change' }]); return; }
      const btn = $('#pg-apply', view);
      busy(btn, true);
      const r = await send(ch, '', list);
      busy(btn, false);
      if (!r.ok) { if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; } await handleWriteError(r); return; }
      st.editing = false;
      repaint();
    });
  }
  countSel();
  // Thêm máy cùng loại vào nhóm (dùng thiết lập hiện tại của nhóm)
  const addBox = $('.pg-add', view);
  if (addBox) {
    wireForm(addBox);
    const hrs = first.interval_type === 'OPERATING_HOURS';
    const upd = () => {
      const spread = readField(addBox, 'add_spread');
      const pk = refreshWhen(addBox, others, hrs ? '' : readField(addBox, 'add_start'), Number.isFinite(spread) ? spread : 0, hrs);
      const b = $('#pg-add', addBox);
      b.innerHTML = `<span>${bi('pg.add_btn', { N: pk.length })}</span>`;
      b.disabled = !pk.length || !online;
    };
    $$('input[data-eq]', addBox).forEach((i) => i.addEventListener('change', upd));
    for (const id of ['add_start', 'add_spread']) { const el = $('#f-' + id, addBox); if (el) { el.addEventListener('change', upd); el.addEventListener('blur', upd); } }
    upd();
    $('#pg-add', addBox).addEventListener('click', async (ev) => {
      const pk = picked(addBox, others);
      const err = $('.add-err', addBox);
      err.textContent = '';
      let start = '', spread = 0, tg = { targets: new Map(), missing: false };
      if (hrs) { tg = targetsOf(addBox, pk, hoursMap); if (tg.missing) { err.innerHTML = bi('pg.need_target'); return; } } else {
        start = readField(addBox, 'add_start'); spread = readField(addBox, 'add_spread') || 0;
        if (!start || Number.isNaN(spread) || spread < 0) { err.innerHTML = bi('field.invalid'); return; }
      }
      const p = {
        plan_group_id: params.gid, title_vi: first.title_vi, title_zh: first.title_zh, interval_type: first.interval_type, interval_value: first.interval_value,
        checklist_template_id: first.checklist_template_id || '', assignee_user_id: first.assignee_user_id || '', priority: first.priority || 'NORMAL',
        estimated_minutes: first.estimated_minutes === null || first.estimated_minutes === undefined ? '' : first.estimated_minutes,
        safety_note_vi: first.safety_note_vi || '', safety_note_zh: first.safety_note_zh || '',
        plans: pk.map((e, i) => {
          const x = { plan_id: uuid(), equipment_id: e.equipment_id };
          if (!hrs) x.anchor_date = addDays(start, i * spread); else if (tg.targets.has(e.equipment_id)) x.operating_hours_target = tg.targets.get(e.equipment_id);
          return x;
        })
      };
      const b = ev.currentTarget;
      busy(b, true);
      const res = await writeOnline('maintenance.plan.group', p, { expected_version: 0 });
      busy(b, false);
      if (!res.ok) {
        if (res.code === 'VALIDATION_ERROR') { err.textContent = rowErrors(res.errors, pk).join(' · '); return; }
        await handleWriteError(res);
        return;
      }
      await afterCommit();
      toast(bi('pg.added', { N: pk.length }), 'ok');
      repaint();
    });
  }
}

/** Form sửa cả nhóm: điền sẵn theo kế hoạch đầu tiên; chỉ ô đã đổi được gửi */
async function editFormHtml(first, cls) {
  const users = await workerPick();
  const list = [...cls.values()].filter((c) => c.active || c.template_id === first.checklist_template_id);
  const typeLabel = biText('mt.interval_type.' + first.interval_type);
  return `<form class="card form-card pg-edit" novalidate><h3>${bi('pg.edit_group')}</h3>
    <p class="muted small">${bi('pg.edit_hint')}</p>
    <div class="form-grid">
      ${bilingualInputs('title', first, { labelKey: 'mt.title', suggest: 'maintenance' })}
      ${numberInput('interval_value', 'mt.interval_value', first.interval_value, { integer: true, required: true, hint: esc(typeLabel) })}
      ${selectInput('checklist_template_id', 'mt.checklist', list.map((c) => [c.template_id, `${esc(nameText(c.head, 'template_name'))} · ${esc(biText('mt.revision'))} ${c.revision}`]), first.checklist_template_id)}
      ${selectInput('assignee_user_id', 'mt.default_assignee', users.map((u) => [u.user_id, esc(`${u.employee_code} · ${u.display_name}`)]), first.assignee_user_id)}
      ${selectInput('priority', 'wk.col.priority', PRIORITIES.map((x) => [x, bi('priority.' + x)]), first.priority || 'NORMAL', { empty: null })}
      ${numberInput('estimated_minutes', 'mt.estimated', first.estimated_minutes, { integer: true, hint: 'min' })}
      ${bilingualInputs('safety_note', first, { labelKey: 'mt.safety', required: false, area: true, maxlength: 500, suggest: 'maintenance' })}
    </div>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="pg-cancel"><span>${bi('btn.cancel')}</span></button><button type="submit" class="btn primary" id="pg-apply"></button></div>
  </form>`;
}

/** Dòng "Thuộc nhóm N máy · Mở nhóm" trên trang kế hoạch của một máy */
export async function groupLineHtml(p) {
  if (!p.plan_group_id) return '';
  const n = (await recs('MAINTENANCE_PLAN')).filter((x) => x.plan_group_id === p.plan_group_id && !x.archived_at).length;
  return `<p class="pg-line">${bi('pg.group_of', { N: n })} · <a href="#/maintenance/plans/group/${esc(p.plan_group_id)}">${bi('pg.open_group')}</a></p>`;
}

