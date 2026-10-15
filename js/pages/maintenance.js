// Bảo trì (Đợt 2): MT-01 Kế hoạch / Phiếu thực hiện / Lịch; MT-02 chi tiết phiếu; MT-03 checklist, số đo, ảnh trước/sau, vật tư,
// gửi nghiệm thu (C7, C8, 5.1.1); kế hoạch lặp lại (ngày/tháng/giờ chạy), mẫu checklist có phiên bản; WEB-MT-01 (1.4 §5.2, phụ lục 4.4.3)
import { bi, biText, esc, fmtDate, fmtDateTime, fmtNumber, badge, biName, nameText, uuid, isoNowVN, L } from '../core.js';
import { ICON, toast, dialog, h, $, $$ } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, byId, mapOf, can, today, addDays, weekStart, weekday, daysBetween } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit, syncNow } from '../app.js';
import {
  selectInput, dateInput, numberInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, writeWithPin, assistedFields,
  oneLang, busy, evBtn, loadFormDraft, saveFormDraft, clearFormDraft, parseNumberInput
} from '../form.js';
import { handleWriteError } from './equipment.js';
import { excelLink } from '../excel-link.js';
import { docsTabHtml, wireDocsTab } from './docs.js';
import { workMatHtml, wireWorkMat, workMatData, localUsageIds } from './workmat.js';
import { replaceDialog } from './partreplace.js';
import {
  myQueue, overlayWorkOrder, localCreations, woSubmitIssues, outOfRange, statusBadge, prioBadges, eqText, uid, level, PRIORITIES, SEVERITIES,
  queueWork, mergeExecPayload, workerPick, WO_OPEN, nextStepHtml, wireNextStep, issueListHtml, wireIssueList, woSelfPeople, pendingForMe
} from '../work.js';

const INTERVALS = ['DAY', 'MONTH', 'OPERATING_HOURS'];
const RESULT_TYPES = ['PASS_FAIL', 'NUMBER', 'TEXT'];
const st = { tab: 'wo', woFilter: 'OPEN', planFilter: 'ACTIVE', q: '', week: 0 };

/* ---------------- Dữ liệu ---------------- */

/** Mẫu checklist: bản mới nhất theo template_id */
export async function checklistMap() {
  const m = new Map();
  for (const it of await recs('CHECKLIST_ITEM')) {
    const cur = m.get(it.template_id);
    const rev = Number(it.revision);
    if (!cur || rev > cur.revision) m.set(it.template_id, { template_id: it.template_id, revision: rev, head: it, items: [it] });
    else if (rev === cur.revision) cur.items.push(it);
  }
  for (const c of m.values()) { c.items.sort((a, b) => Number(a.step_no) - Number(b.step_no)); c.active = c.head.active !== false; }
  return m;
}

const tplName = (c) => (c ? biName(c.head, 'template_name') : '');

function intervalText(p) {
  if (!p.interval_type) return '';
  if (p.interval_type === 'OPERATING_HOURS') return `${fmtNumber(p.interval_value)} ${bi('interval.OPERATING_HOURS')}`;
  return `${bi('mt.every')} ${fmtNumber(p.interval_value)} ${bi('interval.' + p.interval_type)}`;
}

/** Giờ chạy mới nhất của thiết bị */
/** Số đọc giờ chạy mới hơn trước: theo thời điểm đọc, lúc ghi; cùng lúc thì lần đặt lại đồng hồ, rồi số lớn hơn (giờ chạy chỉ tăng) */
const newestReading = (a, b) => String(b.measured_at).localeCompare(String(a.measured_at)) || String(b.created_at || '').localeCompare(String(a.created_at || ''))
  || (b.is_reset === true) - (a.is_reset === true) || Number(b.cumulative_hours) - Number(a.cumulative_hours);

async function latestHours(eqId) {
  const list = (await recs('OPERATING_READING')).filter((r) => r.equipment_id === eqId && !r.archived_at).sort(newestReading);
  return list[0] || null;
}

/** "2026-10-14T08:30:00+07:00" ↔ giá trị ô datetime-local (giờ Việt Nam) */
const toLocalInput = (iso) => (iso ? String(iso).slice(0, 16) : '');
const fromLocalInput = (v) => (v ? `${v}:00+07:00` : '');

/* ======================= MT-01 / WEB-MT-01 ======================= */

export async function renderMaintenance(view, ctx) {
  const { shell } = ctx;
  const wide = isWide();
  const can_ = {
    plan: await can('maintenance.plan.edit'), cl: await can('maintenance.checklist.edit'), wo: await can('maintenance.wo.create'),
    hours: await can('maintenance.hours.record')
  };
  shell.setScreen({
    title: 'module.maintenance', back: '/',
    actions: !wide ? [
      ...(can_.wo ? [{ icon: 'plus', label: biText('mt.wo_new'), onClick: () => navigate('/maintenance/wo/new') }] : []),
      ...(can_.plan ? [{ icon: 'calendar', label: biText('mt.plan_new'), onClick: () => navigate('/maintenance/plans/new'), disabled: !navigator.onLine }] : [])
    ] : []
  });
  const excelBtn = await excelLink('maintenance_plans');
  const tabs = ['wo', 'plans', 'calendar'];
  const tabLabel = { wo: 'tab.work_orders', plans: 'tab.plans', calendar: 'tab.calendar' };
  let body = '';
  if (st.tab === 'wo') body = await woTab(wide);
  else if (st.tab === 'plans') body = await plansTab(wide, can_);
  else body = await calendarTab();
  view.innerHTML = `<div class="chips tabs">${tabs.map((t) => `<button type="button" class="chip${st.tab === t ? ' on' : ''}" data-tab="${t}">${bi(tabLabel[t])}</button>`).join('')}</div>
    <div class="toolbar">
      ${st.tab !== 'calendar' ? `<div class="search"><span>${ICON.search}</span><input id="mt-q" type="search" value="${esc(st.q)}" placeholder="${esc(biText('wk.search_placeholder'))}" autocomplete="off"></div>` : ''}
      <div class="row tools">
        ${wide && can_.wo ? `<a class="btn small primary" href="#/maintenance/wo/new">${ICON.plus}<span>${bi('mt.wo_new')}</span></a>` : ''}
        ${wide && can_.plan ? `<a class="btn small" href="#/maintenance/plans/new">${ICON.calendar}<span>${bi('mt.plan_new')}</span></a>` : ''}
        ${can_.cl ? `<a class="btn small" href="#/maintenance/checklists">${ICON.inspections}<span>${bi('mt.checklists')}</span></a>` : ''}
        ${can_.hours ? `<button type="button" class="btn small" id="mt-hours">${ICON.sync}<span>${bi('mt.hours_record')}</span></button>` : ''}
        ${excelBtn}
        <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${ICON.reports}<span>${bi('btn.report')}</span><span class="soon">${bi('tag.coming_soon')}</span></button>
      </div>
    </div>${body}`;
  const again = () => renderMaintenance(view, ctx);
  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; again(); }));
  $$('[data-wof]', view).forEach((b) => b.addEventListener('click', () => { st.woFilter = b.dataset.wof; again(); }));
  $$('[data-plf]', view).forEach((b) => b.addEventListener('click', () => { st.planFilter = b.dataset.plf; again(); }));
  $$('[data-week]', view).forEach((b) => b.addEventListener('click', () => { st.week += Number(b.dataset.week); if (b.dataset.week === '0') st.week = 0; again(); }));
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href)));
  const q = $('#mt-q', view);
  let tm = null;
  if (q) q.addEventListener('input', (e) => { st.q = e.target.value; clearTimeout(tm); tm = setTimeout(async () => { const pos = e.target.selectionStart; await again(); const el = $('#mt-q', view); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ } } }, 250); });
  const hb = $('#mt-hours', view);
  if (hb) hb.addEventListener('click', async () => { if (await hoursDialog(null)) again(); });
}

/** " · còn N h" / " · đã tới mốc" của kế hoạch theo giờ chạy (danh sách và trang kế hoạch dùng chung) */
function hoursLeftText(p, h0) {
  if (!h0 || p.operating_hours_target === '' || p.operating_hours_target === null || p.operating_hours_target === undefined) return '';
  const left = Number(p.operating_hours_target) - Number(h0.cumulative_hours);
  return ` · ${left > 0 ? bi('mt.hours_left', { N: fmtNumber(left) }) : bi('mt.hours_reached')}`;
}

const WO_FILTERS = { OPEN: ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'], PENDING_ACCEPTANCE: ['PENDING_ACCEPTANCE'], COMPLETED: ['COMPLETED'], CANCELLED: ['CANCELLED'], ALL: null };

async function woTab(wide) {
  const ops = await myQueue();
  const eqs = await mapOf('EQUIPMENT');
  const locs = await mapOf('LOCATION');
  const all = [...(await recs('WORK_ORDER')).map((w) => overlayWorkOrder(w, [], ops).wo), ...localCreations(ops).wos];
  const ql = st.q.trim().toLowerCase();
  const base = all.filter((w) => {
    const e = eqs.get(w.equipment_id);
    return !ql || [w.work_order_code, w.title_vi, w.title_zh, e && e.equipment_code, e && e.name_vi, e && e.name_zh].join(' ').toLowerCase().includes(ql);
  });
  const count = (k) => base.filter((w) => !WO_FILTERS[k] || WO_FILTERS[k].includes(w.status)).length;
  const t = today();
  const list = base.filter((w) => !WO_FILTERS[st.woFilter] || WO_FILTERS[st.woFilter].includes(w.status))
    .sort((a, b) => (st.woFilter === 'COMPLETED' || st.woFilter === 'CANCELLED' ? String(b.due_date).localeCompare(String(a.due_date)) : String(a.due_date).localeCompare(String(b.due_date))) || String(a.work_order_code).localeCompare(String(b.work_order_code)));
  const waitMe = st.woFilter === 'PENDING_ACCEPTANCE' ? 0 : (await pendingForMe()).filter((x) => x.kind === 'WO').length;
  const chips = `${waitMe ? `<p class="banner warn pending-banner">${bi('wk.pending_banner', { N: waitMe })} <button type="button" class="link small" data-wof="PENDING_ACCEPTANCE">${bi('btn.view')}</button></p>` : ''}<div class="chips">${Object.keys(WO_FILTERS).map((k) => `<button type="button" class="chip${st.woFilter === k ? ' on' : ''}" data-wof="${k}">${bi('mt.filter.' + k)} <span class="count">${count(k)}</span></button>`).join('')}</div>
    <p class="muted small">${bi('field.total', { N: list.length })}</p>`;
  if (!list.length) return chips + `<div class="card empty-state">${ICON.maintenance}<p class="muted">${bi('field.no_records')}</p></div>`;
  const overdue = (w) => WO_OPEN.has(w.status) && w.status !== 'PENDING_ACCEPTANCE' && daysBetween(t, w.due_date) < 0;
  if (wide) {
    return chips + `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.code')}</th><th>${bi('module.equipment')}</th><th>${bi('mt.title')}</th>
      <th>${bi('mt.source')}</th><th>${bi('mt.due_date')}</th><th>${bi('wk.col.assignee')}</th><th>${bi('wk.col.priority')}</th><th>${bi('col.status')}</th><th>QR</th></tr></thead>
      <tbody>${list.map((w) => { const e = eqs.get(w.equipment_id); const l = e ? locs.get(e.location_id) : null; return `<tr class="click" data-href="/maintenance/wo/${esc(w.work_order_id)}">
        <td class="code">${w.work_order_code ? esc(w.work_order_code) : bi('tag.pending_code')}</td><td>${esc(eqText(e))}${l ? `<div class="muted small">${esc(l.location_code)}</div>` : ''}</td>
        <td>${biName(w, 'title')}</td><td>${bi('mt.source_' + (w.source || 'MANUAL'))}</td>
        <td class="num">${esc(fmtDate(w.due_date))} ${overdue(w) ? badge('wk.group.OVERDUE') : ''}</td><td>${esc(w.assignee_name || '')}</td>
        <td>${badge('priority.' + (w.priority || 'NORMAL'))}</td><td>${statusBadge('WO', w.status)} ${w._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</td>
        <td>${w.qr_key ? ICON.qr : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  return chips + `<div class="cards">${list.map((w) => { const e = eqs.get(w.equipment_id); return `<a class="card rec-card" href="#/maintenance/wo/${esc(w.work_order_id)}">
    <div class="rec-top"><span class="code">${w.work_order_code ? esc(w.work_order_code) : bi('tag.pending_code')}</span>${statusBadge('WO', w.status)}</div>
    <div class="rec-name">${biName(w, 'title')}</div>
    <div class="muted small">${esc(eqText(e))}</div>
    <div class="dates"><span>${bi('mt.due_date')}: <strong>${esc(fmtDate(w.due_date))}</strong></span>${w.assignee_name ? `<span>${bi('wk.col.assignee')}: <strong>${esc(w.assignee_name)}</strong></span>` : ''}</div>
    <div class="rec-badges">${overdue(w) ? badge('wk.group.OVERDUE') : ''} ${prioBadges(w, 'WO')} ${w._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</div></a>`; }).join('')}</div>`;
}

async function plansTab(wide, can_) {
  const eqs = await mapOf('EQUIPMENT');
  const cls = await checklistMap();
  const readings = await recs('OPERATING_READING');
  const latest = (id) => readings.filter((r) => r.equipment_id === id && !r.archived_at).sort(newestReading)[0];
  const ql = st.q.trim().toLowerCase();
  const all = (await recs('MAINTENANCE_PLAN')).filter((p) => {
    const e = eqs.get(p.equipment_id);
    return !ql || [p.plan_code, p.title_vi, p.title_zh, e && e.equipment_code, e && e.name_vi].join(' ').toLowerCase().includes(ql);
  });
  const list = all.filter((p) => st.planFilter === 'ALL' || (st.planFilter === 'ACTIVE' ? p.active !== false : p.active === false))
    .sort((a, b) => String(a.next_due_date || '9999').localeCompare(String(b.next_due_date || '9999')) || String(a.plan_code).localeCompare(String(b.plan_code)));
  const chips = `<div class="chips">${['ACTIVE', 'INACTIVE', 'ALL'].map((k) => `<button type="button" class="chip${st.planFilter === k ? ' on' : ''}" data-plf="${k}">${bi('mt.plan_filter.' + k)}</button>`).join('')}</div>
    <p class="muted small">${bi('field.total', { N: list.length })}</p>`;
  if (!list.length) return chips + `<div class="card empty-state">${ICON.calendar}<p class="muted">${bi(all.length ? 'field.no_records' : 'mt.no_plans')}</p>${can_.plan ? `<a class="btn small primary" href="#/maintenance/plans/new">${bi('mt.plan_new')}</a>` : ''}</div>`;
  const nextText = (p) => {
    if (p.interval_type === 'OPERATING_HOURS') {
      const h0 = latest(p.equipment_id);
      return `${bi('mt.hours_target')}: <strong>${fmtNumber(p.operating_hours_target)} h</strong>${hoursLeftText(p, h0)}`;
    }
    return `${bi('mt.next_due')}: <strong>${esc(fmtDate(p.next_due_date) || biText('field.not_set'))}</strong>`;
  };
  if (wide) {
    return chips + `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.code')}</th><th>${bi('module.equipment')}</th><th>${bi('mt.title')}</th><th>${bi('mt.interval')}</th>
      <th>${bi('mt.next_due')}</th><th>${bi('mt.checklist')}</th><th>${bi('mt.default_assignee')}</th><th>${bi('wk.col.priority')}</th><th>${bi('col.status')}</th></tr></thead>
      <tbody>${list.map((p) => `<tr class="click" data-href="/maintenance/plans/${esc(p.plan_id)}"><td class="code">${esc(p.plan_code)}</td><td>${esc(eqText(eqs.get(p.equipment_id)))}</td>
        <td>${biName(p, 'title')}</td><td>${intervalText(p)}</td><td>${nextText(p)}</td><td>${p.checklist_template_id ? tplName(cls.get(p.checklist_template_id)) : ''}</td>
        <td>${esc(p.assignee_name || '')}</td><td>${badge('priority.' + (p.priority || 'NORMAL'))}</td><td>${badge('plan_active.' + (p.active === false ? 'FALSE' : 'TRUE'))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  return chips + `<div class="cards">${list.map((p) => `<a class="card rec-card" href="#/maintenance/plans/${esc(p.plan_id)}">
    <div class="rec-top"><span class="code">${esc(p.plan_code)}</span>${badge('plan_active.' + (p.active === false ? 'FALSE' : 'TRUE'))}</div>
    <div class="rec-name">${biName(p, 'title')}</div>
    <div class="muted small">${esc(eqText(eqs.get(p.equipment_id)))} · ${intervalText(p)}</div>
    <div class="dates"><span>${nextText(p)}</span>${p.assignee_name ? `<span>${bi('mt.default_assignee')}: <strong>${esc(p.assignee_name)}</strong></span>` : ''}</div></a>`).join('')}</div>`;
}

async function calendarTab() {
  const t = today();
  const from = addDays(weekStart(t), st.week * 7), to = addDays(from, 6);
  const eqs = await mapOf('EQUIPMENT');
  const ops = await myQueue();
  const wos = [...(await recs('WORK_ORDER')).map((w) => overlayWorkOrder(w, [], ops).wo), ...localCreations(ops).wos].filter((w) => w.status !== 'CANCELLED' && w.due_date >= from && w.due_date <= to);
  // Hạn kế hoạch chưa có phiếu trong tuần (dự kiến)
  const planned = (await recs('MAINTENANCE_PLAN')).filter((p) => p.active !== false && p.next_due_date && p.next_due_date >= from && p.next_due_date <= to && !wos.some((w) => w.plan_id === p.plan_id && w.due_date === p.next_due_date));
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return `<section class="card home-week"><div class="card-head"><h2>${bi('tab.calendar')}</h2><span class="muted">${esc(fmtDate(from))} – ${esc(fmtDate(to))}</span>
      <span class="row"><button type="button" class="btn tiny" data-week="-1" aria-label="${esc(biText('mt.prev_week'))}">‹</button><button type="button" class="btn tiny" data-week="0">${bi('mt.this_week')}</button><button type="button" class="btn tiny" data-week="1" aria-label="${esc(biText('mt.next_week'))}">›</button></span></div>
    <div class="week">${days.map((d) => {
      const list = wos.filter((w) => w.due_date === d);
      const pl = planned.filter((p) => p.next_due_date === d);
      return `<div class="day${d === t ? ' today' : ''}"><div class="day-head"><span>${bi('weekday.' + weekday(d))}</span><span class="day-num">${esc(d.slice(8, 10))}/${esc(d.slice(5, 7))}</span></div>
        <div class="day-items">${list.map((w) => `<a class="day-item k-wo s-${esc(String(w.status).toLowerCase())}" href="#/maintenance/wo/${esc(w.work_order_id)}"><span class="kind k-wo">${bi('wk.kind.WO')}</span><span class="code">${esc(w.work_order_code || '…')}</span><span class="muted small">${esc((eqs.get(w.equipment_id) || {}).equipment_code || '')}</span></a>`).join('')}
          ${pl.map((p) => `<a class="day-item k-plan" href="#/maintenance/plans/${esc(p.plan_id)}"><span class="kind k-plan">${bi('tab.plans')}</span><span class="code">${esc(p.plan_code)}</span></a>`).join('')}</div></div>`;
    }).join('')}</div></section>`;
}

/* ======================= Ghi giờ chạy ======================= */

/** Ghi giờ chạy lũy kế (maintenance.hours.record; offline được). eqId cố định hoặc chọn thiết bị */
export async function hoursDialog(eqId) {
  const eqs = (await recs('EQUIPMENT')).filter((e) => !e.archived_at).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const last = eqId ? await latestHours(eqId) : null;
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('mt.hours_record')}</h2>
    ${eqId ? '' : `<label for="hr-eq">${bi('module.equipment')}</label><select id="hr-eq" class="inp sel"><option value="">${bi('field.choose')}</option>${eqs.map((e) => `<option value="${esc(e.equipment_id)}">${esc(eqText(e))}</option>`).join('')}</select>`}
    <p class="muted small" id="hr-last">${last ? bi('mt.hours_last', { N: fmtNumber(last.cumulative_hours), D: fmtDateTime(last.measured_at) }) : ''}</p>
    <label for="hr-val">${bi('mt.cumulative_hours')}</label><input id="hr-val" class="inp num" inputmode="decimal">
    <label for="hr-at">${bi('mt.measured_at')}</label><input id="hr-at" class="inp" type="datetime-local" value="${esc(toLocalInput(isoNowVN()))}">
    <label class="check"><input type="checkbox" id="hr-reset"><span>${bi('mt.hours_reset')}</span></label>
    <label for="hr-note">${bi('field.note')}</label><input id="hr-note" class="inp" type="text" maxlength="300">
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  const sel = $('#hr-eq', wrap);
  if (sel) sel.addEventListener('change', async () => { const l = await latestHours(sel.value); $('#hr-last', wrap).innerHTML = l ? bi('mt.hours_last', { N: fmtNumber(l.cumulative_hours), D: fmtDateTime(l.measured_at) }) : ''; });
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const err = $('.form-err', wrap);
      const eq = eqId || (sel && sel.value);
      const v = parseNumberInput($('#hr-val', wrap).value);
      const reset = $('#hr-reset', wrap).checked;
      const note = $('#hr-note', wrap).value.trim();
      if (!eq) { err.textContent = biText('field.required'); return; }
      if (v.error || v.value === null) { err.textContent = biText('field.invalid'); return; }
      if (reset && !note) { err.textContent = biText('field.reason_required'); return; }
      const p = { operating_reading_id: uuid(), equipment_id: eq, cumulative_hours: v.value, measured_at: fromLocalInput($('#hr-at', wrap).value) || isoNowVN(), note, is_reset: reset };
      if (!navigator.onLine) {
        await queueWork('maintenance.hours.record', p, { entity_type: 'OPERATING_READING', entity_id: p.operating_reading_id, expected_version: 0, chain: false });
        wrap.remove(); toast(bi('sync.local_saved'), 'ok'); resolve(true); return;
      }
      busy(evBtn(ev), true);
      const res = await writeOnline('maintenance.hours.record', p);
      busy(evBtn(ev), false);
      if (res.ok) {
        wrap.remove(); await afterCommit();
        const g = (res.data && res.data.generated_work_orders) || [];
        toast(g.length ? bi('mt.wo_generated', { C: g.map((x) => x.work_order_code).join(', ') }) : bi('form.saved'), 'ok');
        resolve(true); return;
      }
      if (res.code === 'VALIDATION_ERROR') { err.textContent = (res.errors || []).map((e) => `${e.message_vi} · ${e.message_zh}`).join(' — '); return; }
      wrap.remove(); await handleWriteError(res); resolve(false);
    });
  });
}

/* ======================= Kế hoạch ======================= */

export async function renderPlan(view, ctx) {
  const { shell, params } = ctx;
  const p = await byId('MAINTENANCE_PLAN', params.id);
  const canEdit = await can('maintenance.plan.edit');
  shell.setScreen({
    title: 'mt.plan', back: '/maintenance',
    actions: p ? [
      ...(p.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/MAINTENANCE_PLAN/${p.plan_id}`) }] : []),
      ...(canEdit ? [{ icon: 'edit', label: biText('btn.edit'), onClick: () => navigate(`/maintenance/plans/${p.plan_id}/edit`), disabled: !navigator.onLine }] : [])
    ] : []
  });
  if (!p) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  st.tab = 'plans';
  const e = await byId('EQUIPMENT', p.equipment_id);
  const cls = await checklistMap();
  const cl = p.checklist_template_id ? cls.get(p.checklist_template_id) : null;
  const wos = (await recs('WORK_ORDER')).filter((w) => w.plan_id === p.plan_id).sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)));
  const last = p.interval_type === 'OPERATING_HOURS' ? await latestHours(p.equipment_id) : null;
  const online = navigator.onLine;
  const kv = (k, v) => (v ? `<div class="kv"><span>${bi(k)}</span><strong>${v}</strong></div>` : '');
  view.innerHTML = `<section class="card">
    <div class="rec-top"><span class="code big">${esc(p.plan_code)}</span>${badge('plan_active.' + (p.active === false ? 'FALSE' : 'TRUE'))}</div>
    <h2 class="eq-name">${biName(p, 'title')}</h2>
    <div class="kv-grid">
      ${kv('module.equipment', e ? `<a href="#/equipment/${esc(e.equipment_id)}">${esc(eqText(e))}</a>` : '')}
      ${kv('mt.interval', intervalText(p))}
      ${p.interval_type !== 'OPERATING_HOURS' ? kv('mt.anchor_date', esc(fmtDate(p.anchor_date))) : ''}
      ${p.interval_type !== 'OPERATING_HOURS' ? kv('mt.next_due', esc(fmtDate(p.next_due_date) || biText('field.not_set'))) : ''}
      ${p.interval_type === 'OPERATING_HOURS' ? kv('mt.hours_target', `${fmtNumber(p.operating_hours_target)} h${hoursLeftText(p, last)}`) : ''}
      ${p.interval_type === 'OPERATING_HOURS' ? kv('mt.hours_latest', last ? `${fmtNumber(last.cumulative_hours)} h · ${esc(fmtDateTime(last.measured_at))}` : esc(biText('field.not_set'))) : ''}
      ${kv('mt.checklist', cl ? `${tplName(cl)} · ${bi('mt.revision')} ${cl.revision}` : esc(biText('field.not_set')))}
      ${kv('mt.default_assignee', esc(p.assignee_name || biText('field.not_set')))}
      ${kv('wk.col.priority', badge('priority.' + (p.priority || 'NORMAL')))}
      ${p.estimated_minutes ? kv('mt.estimated', `${fmtNumber(p.estimated_minutes)} min`) : ''}
      ${p.last_done_date ? kv('mt.last_done', esc(fmtDate(p.last_done_date)) + (p.last_done_hours !== '' && p.last_done_hours !== null && p.last_done_hours !== undefined ? ` · ${fmtNumber(p.last_done_hours)} h` : '')) : ''}
    </div>
    ${p.safety_note_vi || p.safety_note_zh ? `<p class="banner warn">${bi('mt.safety')}: ${biName(p, 'safety_note')}</p>` : ''}
    <div class="row">
      ${p.interval_type === 'OPERATING_HOURS' && (await can('maintenance.hours.record')) ? `<button type="button" class="btn small" id="pl-hours">${ICON.sync}<span>${bi('mt.hours_record')}</span></button>` : ''}
      ${canEdit && p.active !== false ? `<button type="button" class="btn small" id="pl-stop" ${online ? '' : 'disabled'}>${bi('mt.plan_stop')}</button>` : ''}
      ${canEdit && p.active === false ? `<button type="button" class="btn small" id="pl-resume" ${online ? '' : 'disabled'}>${bi('mt.plan_resume')}</button>` : ''}
    </div>
    ${!online && canEdit ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
  </section>
  ${cl ? `<section class="card"><h3>${bi('mt.checklist')} · ${tplName(cl)}</h3><ol class="list steps">${cl.items.map((it) => `<li>${biName(it, 'label')} <span class="muted small">${bi('result_type.' + it.result_type)}${it.result_type === 'NUMBER' ? ` · ${rangeText(it)}` : ''}${it.required === false ? ' · ' + biText('mt.optional') : ''}</span></li>`).join('')}</ol></section>` : ''}
  <section class="card"><h3>${bi('tab.work_orders')}</h3>${wos.length ? `<ul class="list">${wos.map((w) => `<li><a class="code" href="#/maintenance/wo/${esc(w.work_order_id)}">${esc(w.work_order_code)}</a> · ${esc(fmtDate(w.due_date))} ${statusBadge('WO', w.status)} ${w.overall_result ? badge('overall_result.' + w.overall_result) : ''}</li>`).join('')}</ul>` : `<p class="muted">${bi('field.not_set')}</p>`}</section>`;
  const repaint = () => renderPlan(view, ctx);
  const on = (id, fn) => { const el = $('#' + id, view); if (el) el.addEventListener('click', fn); };
  on('pl-hours', async () => { if (await hoursDialog(p.equipment_id)) repaint(); });
  const toggle = async (active) => {
    let reason = '';
    if (!active) {
      reason = await dialog({ title: bi('mt.plan_stop'), body: `<label for="pr">${bi('field.reason')} <span class="req">*</span></label><input id="pr" type="text" maxlength="300">`, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('mt.plan_stop'), kind: 'primary danger', read: (w) => $('#pr', w).value.trim() }] });
      if (reason === null) return;
      if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    }
    const res = await writeOnline('maintenance.plan.edit', { plan_id: p.plan_id, active, reason }, { expected_version: p.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(res);
  };
  on('pl-stop', () => toggle(false));
  on('pl-resume', () => toggle(true));
}

function rangeText(it) {
  const lo = it.min_value, hi = it.max_value;
  const has = (v) => v !== '' && v !== null && v !== undefined;
  const u = it.unit ? ' ' + esc(it.unit) : '';
  if (has(lo) && has(hi)) return `${fmtNumber(lo)} – ${fmtNumber(hi)}${u}`;
  if (has(lo)) return `≥ ${fmtNumber(lo)}${u}`;
  if (has(hi)) return `≤ ${fmtNumber(hi)}${u}`;
  return esc(it.unit || '');
}

export async function renderPlanForm(view, ctx) {
  const { shell, params } = ctx;
  const isNew = !params.id;
  shell.setScreen({ title: isNew ? 'mt.plan_new' : 'mt.plan_edit', back: isNew ? '/maintenance' : `/maintenance/plans/${params.id}` });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  if (!(await can('maintenance.plan.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const rec = isNew ? { interval_type: 'MONTH', interval_value: 1, anchor_date: today(), priority: 'NORMAL' } : await byId('MAINTENANCE_PLAN', params.id);
  if (!rec) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const eqs = (await recs('EQUIPMENT')).filter((e) => !e.archived_at).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const cls = [...(await checklistMap()).values()].filter((c) => c.active || c.template_id === rec.checklist_template_id);
  const users = await workerPick();
  view.innerHTML = `<form class="card form-card" novalidate>
    <div class="form-grid">
      ${isNew ? selectInput('equipment_id', 'module.equipment', eqs.map((e) => [e.equipment_id, esc(eqText(e))]), rec.equipment_id, { required: true }) : `<div class="fld"><label>${bi('module.equipment')}</label><div>${esc(eqText(eqs.find((e) => e.equipment_id === rec.equipment_id)))}</div></div>`}
      ${bilingualInputs('title', rec, { labelKey: 'mt.title', suggest: 'maintenance' })}
      ${selectInput('interval_type', 'mt.interval_type', INTERVALS.map((x) => [x, bi('mt.interval_type.' + x)]), rec.interval_type, { empty: null, required: true })}
      ${numberInput('interval_value', 'mt.interval_value', rec.interval_value, { integer: true, required: true })}
      <div id="pf-cal">${dateInput('anchor_date', 'mt.anchor_date', rec.anchor_date, { required: true, hint: bi('mt.anchor_hint') })}</div>
      <div id="pf-hrs">${numberInput('operating_hours_target', 'mt.hours_target', rec.operating_hours_target, { hint: bi('mt.hours_target_hint') })}</div>
      ${selectInput('checklist_template_id', 'mt.checklist', cls.map((c) => [c.template_id, `${esc(nameText(c.head, 'template_name'))} · ${esc(biText('mt.revision'))} ${c.revision}`]), rec.checklist_template_id)}
      ${selectInput('assignee_user_id', 'mt.default_assignee', users.map((u) => [u.user_id, esc(`${u.employee_code} · ${u.display_name}`)]), rec.assignee_user_id, { hint: bi('mt.default_assignee_hint') })}
      ${selectInput('priority', 'wk.col.priority', PRIORITIES.map((x) => [x, bi('priority.' + x)]), rec.priority || 'NORMAL', { empty: null })}
      ${numberInput('estimated_minutes', 'mt.estimated', rec.estimated_minutes, { integer: true, hint: 'min' })}
      ${bilingualInputs('safety_note', rec, { labelKey: 'mt.safety', required: false, area: true, maxlength: 500, suggest: 'maintenance' })}
    </div>
    <p class="muted small">${bi('mt.plan_help')}</p>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  const sync = () => { const hrs = $('#f-interval_type', form).value === 'OPERATING_HOURS'; $('#pf-cal', form).hidden = hrs; $('#pf-hrs', form).hidden = !hrs; };
  $('#f-interval_type', form).addEventListener('change', sync);
  sync();
  $('#fm-cancel', form).addEventListener('click', () => back(isNew ? '/maintenance' : `/maintenance/plans/${params.id}`));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const it = readField(form, 'interval_type');
    const p = {
      plan_id: isNew ? uuid() : rec.plan_id, title_vi: readField(form, 'title_vi'), title_zh: readField(form, 'title_zh'),
      interval_type: it, interval_value: readField(form, 'interval_value'), checklist_template_id: readField(form, 'checklist_template_id') || '',
      assignee_user_id: readField(form, 'assignee_user_id') || '', priority: readField(form, 'priority'), estimated_minutes: readField(form, 'estimated_minutes'),
      safety_note_vi: readField(form, 'safety_note_vi'), safety_note_zh: readField(form, 'safety_note_zh')
    };
    if (isNew) p.equipment_id = readField(form, 'equipment_id');
    const errs = [];
    if (isNew && !p.equipment_id) errs.push({ field: 'equipment_id', key: 'field.required' });
    if (!p.title_vi && !p.title_zh) errs.push({ field: 'title', key: 'field.required' });
    if (!(p.interval_value > 0)) errs.push({ field: 'interval_value', key: 'field.invalid' });
    if (Number.isNaN(p.estimated_minutes)) errs.push({ field: 'estimated_minutes', key: 'field.invalid' });
    if (it === 'OPERATING_HOURS') {
      const t = readField(form, 'operating_hours_target');
      if (Number.isNaN(t)) errs.push({ field: 'operating_hours_target', key: 'field.invalid' }); else if (t !== null) p.operating_hours_target = t;
    } else {
      const a = readField(form, 'anchor_date');
      if (!a) errs.push({ field: 'anchor_date', key: a === null ? 'field.invalid_date' : 'field.required' }); else p.anchor_date = a;
    }
    const as = assistedFields(form);
    if (!as.ok) errs.push(...as.errors);
    if (errs.length) { showErrors(form, errs); return; }
    if (as.bases.length) p.i18n_assisted = as.bases;
    if (p.estimated_minutes === null) p.estimated_minutes = '';
    const btn = $('#fm-save', form);
    busy(btn, true);
    const res = await writeOnline('maintenance.plan.edit', p, { expected_version: isNew ? 0 : rec.record_version });
    busy(btn, false);
    if (!res.ok) { if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; } await handleWriteError(res); return; }
    await afterCommit();
    const g = res.data && res.data.generated_work_order;
    toast(g ? bi('mt.wo_generated', { C: g.work_order_code }) : bi('form.saved'), 'ok');
    navigate(`/maintenance/plans/${p.plan_id}`, { replace: true });
  });
}

/* ======================= Mẫu checklist ======================= */

export async function renderChecklists(view, ctx) {
  const { shell } = ctx;
  const canEdit = await can('maintenance.checklist.edit');
  shell.setScreen({ title: 'mt.checklists', back: '/maintenance', actions: canEdit && !isWide() ? [{ icon: 'plus', label: biText('mt.checklist_new'), onClick: () => navigate('/maintenance/checklists/new'), disabled: !navigator.onLine }] : [] });
  const list = [...(await checklistMap()).values()].sort((a, b) => nameText(a.head, 'template_name').localeCompare(nameText(b.head, 'template_name')));
  const plans = await recs('MAINTENANCE_PLAN');
  view.innerHTML = `<div class="toolbar"><div class="row tools">${canEdit && isWide() ? `<a class="btn small primary" href="#/maintenance/checklists/new">${ICON.plus}<span>${bi('mt.checklist_new')}</span></a>` : ''}</div>
    <p class="muted small">${bi('mt.checklist_help')}</p></div>
    ${list.length ? `<div class="cards">${list.map((c) => `<a class="card rec-card" href="#/maintenance/checklists/${esc(c.template_id)}">
      <div class="rec-top"><strong>${tplName(c)}</strong>${badge('plan_active.' + (c.active ? 'TRUE' : 'FALSE'))}</div>
      <div class="muted small">${bi('mt.revision')} ${c.revision} · ${bi('mt.steps_n', { N: c.items.length })} · ${bi('mt.used_by_plans', { N: plans.filter((p) => p.checklist_template_id === c.template_id && p.active !== false).length })}</div></a>`).join('')}</div>`
      : `<div class="card empty-state"><p class="muted">${bi('mt.no_checklists')}</p></div>`}`;
}

function stepRow(it, i) {
  return `<div class="cl-step" data-i="${i}">
    <div class="cl-head"><strong>${bi('mt.step')} <span class="cl-no">${i + 1}</span></strong>
      <span class="row"><button type="button" class="icon-btn" data-up aria-label="${esc(biText('mt.move_up'))}">↑</button><button type="button" class="icon-btn" data-del aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button></span></div>
    <div class="cl-grid">
      <label>${bi('i18n.lang_vi')}<input class="inp" data-k="label_vi" maxlength="200" value="${esc(it.label_vi || '')}"></label>
      <label>${bi('i18n.lang_zh')}<input class="inp" data-k="label_zh" maxlength="200" value="${esc(it.label_zh || '')}"></label>
      <label>${bi('mt.result_type')}<select class="inp sel" data-k="result_type">${RESULT_TYPES.map((x) => `<option value="${x}"${(it.result_type || 'PASS_FAIL') === x ? ' selected' : ''}>${bi('result_type.' + x)}</option>`).join('')}</select></label>
      <label class="cl-num">${bi('field.unit')}<input class="inp" data-k="unit" maxlength="20" value="${esc(it.unit || '')}"></label>
      <label class="cl-num">${bi('mt.min')}<input class="inp num" data-k="min_value" inputmode="decimal" value="${esc(it.min_value ?? '')}"></label>
      <label class="cl-num">${bi('mt.max')}<input class="inp num" data-k="max_value" inputmode="decimal" value="${esc(it.max_value ?? '')}"></label>
      <label class="check"><input type="checkbox" data-k="required" ${it.required === false ? '' : 'checked'}><span>${bi('excel.required')}</span></label>
      <label>${bi('mt.safety')} (${bi('i18n.lang_vi')})<input class="inp" data-k="safety_note_vi" maxlength="300" value="${esc(it.safety_note_vi || '')}"></label>
      <label>${bi('mt.safety')} (${bi('i18n.lang_zh')})<input class="inp" data-k="safety_note_zh" maxlength="300" value="${esc(it.safety_note_zh || '')}"></label>
    </div><div class="ferr small"></div></div>`;
}

export async function renderChecklistForm(view, ctx) {
  const { shell, params } = ctx;
  const isNew = !params.id;
  shell.setScreen({ title: isNew ? 'mt.checklist_new' : 'mt.checklist_edit', back: '/maintenance/checklists' });
  const cl = isNew ? null : (await checklistMap()).get(params.id);
  const canEdit = await can('maintenance.checklist.edit');
  if (!isNew && !cl) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  if (!canEdit || !navigator.onLine) {
    if (!cl) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'err.forbidden' : 'sync.need_network')}</div>`; return; }
    view.innerHTML = `<section class="card"><h2>${tplName(cl)}</h2><p class="muted small">${bi('mt.revision')} ${cl.revision}</p><ol class="list steps">${cl.items.map((it) => `<li>${biName(it, 'label')} <span class="muted small">${bi('result_type.' + it.result_type)}${it.result_type === 'NUMBER' ? ` · ${rangeText(it)}` : ''}</span>${it.safety_note_vi || it.safety_note_zh ? `<div class="small t-amber-text">${biName(it, 'safety_note')}</div>` : ''}</li>`).join('')}</ol>${!navigator.onLine ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}</section>`;
    return;
  }
  const items = cl ? cl.items : [{ result_type: 'PASS_FAIL', required: true }];
  view.innerHTML = `<form class="card form-card" novalidate>
    ${bilingualInputs('template_name', cl ? cl.head : null, { labelKey: 'mt.checklist_name' })}
    ${cl ? `<p class="muted small">${bi('mt.revision_note', { N: cl.revision + 1 })}</p>` : ''}
    <div id="cl-steps">${items.map(stepRow).join('')}</div>
    <div class="row"><button type="button" class="btn small" id="cl-add">${ICON.plus}<span>${bi('mt.step_add')}</span></button></div>
    <p class="muted small">${bi('mt.safety_no_mt')}</p>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions">
      ${cl && cl.active ? `<button type="button" class="btn danger" id="cl-stop">${bi('mt.checklist_stop')}</button>` : ''}
      <button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  const box = $('#cl-steps', form);
  const renumber = () => $$('.cl-step', box).forEach((row, i) => { $('.cl-no', row).textContent = String(i + 1); });
  const wireRow = (row) => {
    $('[data-del]', row).addEventListener('click', () => { if ($$('.cl-step', box).length > 1) { row.remove(); renumber(); } });
    $('[data-up]', row).addEventListener('click', () => { const prev = row.previousElementSibling; if (prev) { box.insertBefore(row, prev); renumber(); } });
  };
  $$('.cl-step', box).forEach(wireRow);
  $('#cl-add', form).addEventListener('click', () => { const row = h(stepRow({ result_type: 'PASS_FAIL', required: true }, $$('.cl-step', box).length)); box.appendChild(row); wireRow(row); });
  $('#fm-cancel', form).addEventListener('click', () => back('/maintenance/checklists'));
  const stop = $('#cl-stop', form);
  if (stop) stop.addEventListener('click', async () => {
    const reason = await dialog({ title: bi('mt.checklist_stop'), body: `<label for="cr">${bi('field.reason')} <span class="req">*</span></label><input id="cr" type="text" maxlength="300">`, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('mt.checklist_stop'), kind: 'primary danger', read: (w) => $('#cr', w).value.trim() }] });
    if (reason === null) return;
    if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    const res = await writeOnline('maintenance.checklist.edit', { template_id: cl.template_id, active: false, reason }, { expected_version: cl.revision });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); navigate('/maintenance/checklists', { replace: true }); } else await handleWriteError(res);
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const out = [];
    let bad = false;
    $$('.cl-step', box).forEach((row) => {
      const it = {};
      $$('[data-k]', row).forEach((i) => { it[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
      const err = $('.ferr', row);
      err.textContent = '';
      for (const k of ['min_value', 'max_value']) {
        if (it[k] === '') { delete it[k]; continue; }
        const n = parseNumberInput(it[k], { negative: true });
        if (n.error) { err.textContent = biText('field.invalid'); bad = true; } else it[k] = n.value;
      }
      if (!it.label_vi && !it.label_zh) { err.textContent = biText('field.one_lang'); bad = true; }
      if (it.result_type === 'NUMBER' && !it.unit) { err.textContent = biText('mt.unit_required'); bad = true; }
      out.push(it);
    });
    const name = { template_name_vi: readField(form, 'template_name_vi'), template_name_zh: readField(form, 'template_name_zh') };
    if (!name.template_name_vi && !name.template_name_zh) { showErrors(form, [{ field: 'template_name', key: 'field.required' }]); return; }
    if (bad) return;
    const p = { template_id: cl ? cl.template_id : uuid(), ...name, items: out };
    const btn = $('#fm-save', form);
    busy(btn, true);
    const res = await writeOnline('maintenance.checklist.edit', p, { expected_version: cl ? cl.revision : 0 });
    busy(btn, false);
    if (!res.ok) {
      if (res.code === 'VALIDATION_ERROR') { $('.form-err', form).textContent = (res.errors || []).map((e) => `${e.field || ''} ${e.message_vi} · ${e.message_zh}`).join(' — '); return; }
      await handleWriteError(res); return;
    }
    await afterCommit();
    toast(bi('form.saved'), 'ok');
    navigate('/maintenance/checklists', { replace: true });
  });
}

/* ======================= Phiếu ngoài kế hoạch ======================= */

export async function renderWoForm(view, ctx) {
  const { shell, query } = ctx;
  shell.setScreen({ title: 'mt.wo_new', back: '/maintenance' });
  if (!(await can('maintenance.wo.create'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const lead = await can('maintenance.assign');
  const eqs = (await recs('EQUIPMENT')).filter((e) => !e.archived_at).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const cls = [...(await checklistMap()).values()].filter((c) => c.active);
  const users = lead && navigator.onLine ? await workerPick() : [];
  const draftKey = 'wo-new';
  const draft = (await loadFormDraft(draftKey)) || {};
  const preEq = (query && query.get('equipment')) || draft.equipment_id || '';
  view.innerHTML = `<form class="card form-card" novalidate>
    <div class="form-grid">
      ${selectInput('equipment_id', 'module.equipment', eqs.map((e) => [e.equipment_id, esc(eqText(e))]), preEq, { required: true })}
      ${bilingualInputs('title', draft, { labelKey: 'mt.title' })}
      ${dateInput('due_date', 'mt.due_date', draft.due_date || today(), { required: true })}
      ${selectInput('checklist_template_id', 'mt.checklist', cls.map((c) => [c.template_id, `${esc(nameText(c.head, 'template_name'))} · ${esc(biText('mt.revision'))} ${c.revision}`]), draft.checklist_template_id || '')}
      ${lead ? selectInput('priority', 'wk.col.priority', PRIORITIES.map((x) => [x, bi('priority.' + x)]), draft.priority || 'NORMAL', { empty: null }) : ''}
      ${lead && users.length ? selectInput('assignee_user_id', 'wk.col.assignee', users.map((u) => [u.user_id, esc(`${u.employee_code} · ${u.display_name}`)]), draft.assignee_user_id || '') : ''}
    </div>
    <p class="muted small">${bi(lead ? 'mt.wo_new_help_lead' : 'mt.wo_new_help')}</p>
    ${!navigator.onLine ? `<p class="banner info">${bi('mt.offline_create')}</p>` : ''}
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  const collect = () => ({
    equipment_id: readField(form, 'equipment_id'), title_vi: readField(form, 'title_vi'), title_zh: readField(form, 'title_zh'), due_date: readField(form, 'due_date'),
    checklist_template_id: readField(form, 'checklist_template_id') || '', ...(lead ? { priority: readField(form, 'priority') } : {}),
    ...(lead && $('#f-assignee_user_id', form) ? { assignee_user_id: readField(form, 'assignee_user_id') || '' } : {})
  });
  form.addEventListener('input', () => saveFormDraft(draftKey, collect()));
  $('#fm-cancel', form).addEventListener('click', () => back('/maintenance'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = collect();
    const errs = [];
    if (!v.equipment_id) errs.push({ field: 'equipment_id', key: 'field.required' });
    if (!v.title_vi && !v.title_zh) errs.push({ field: 'title', key: 'field.required' });
    if (!v.due_date) errs.push({ field: 'due_date', key: v.due_date === null ? 'field.invalid_date' : 'field.required' });
    if (errs.length) { showErrors(form, errs); return; }
    const p = { work_order_id: uuid() };
    Object.entries(v).forEach(([k, x]) => { if (x !== '' && x !== null && x !== undefined) p[k] = x; });
    const btn = $('#fm-save', form);
    if (!navigator.onLine) {
      delete p.assignee_user_id; // giao việc cần mạng
      await queueWork('maintenance.wo.create', p, { entity_type: 'WORK_ORDER', entity_id: p.work_order_id, expected_version: 0, chain: true });
      await clearFormDraft(draftKey);
      toast(bi('sync.local_saved'), 'ok');
      navigate(`/maintenance/wo/${p.work_order_id}`, { replace: true });
      return;
    }
    busy(btn, true);
    const res = await writeOnline('maintenance.wo.create', p);
    busy(btn, false);
    if (!res.ok) { if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; } await handleWriteError(res); return; }
    await clearFormDraft(draftKey);
    await afterCommit();
    toast(bi('form.saved'), 'ok');
    navigate(`/maintenance/wo/${p.work_order_id}`, { replace: true });
  });
}

/* ======================= MT-02 / MT-03 Phiếu thực hiện ======================= */

export async function renderWorkOrder(view, ctx) {
  const seq = (view._renderSeq = (view._renderSeq || 0) + 1);
  const { shell, params } = ctx;
  const ops = await myQueue();
  const server = await byId('WORK_ORDER', params.id);
  const localNew = server ? null : localCreations(ops).wos.find((w) => w.work_order_id === params.id);
  const base = server || localNew;
  shell.setScreen({
    title: 'mt.wo', back: '/maintenance',
    actions: server && server.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/WORK_ORDER/${server.work_order_id}`) }] : []
  });
  if (!base) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  st.tab = 'wo';
  const results0 = (await recs('WO_RESULT')).filter((r) => r.work_order_id === base.work_order_id).sort((a, b) => Number(a.step_no) - Number(b.step_no));
  const ov = overlayWorkOrder(base, results0, ops);
  // Thay đổi chưa lưu trên form (C2: rời màn tự lưu nháp form trên máy)
  const draftKey = 'wo-exec:' + base.work_order_id;
  const draft = (await loadFormDraft(draftKey)) || { fields: {}, results: {} };
  const w = { ...ov.wo, ...draft.fields };
  const results = ov.results.map((r) => ({ ...r, ...(draft.results[r.result_id] || {}) }));
  const dirty = Object.keys(draft.fields).length > 0 || Object.keys(draft.results).length > 0;
  const e = await byId('EQUIPMENT', w.equipment_id);
  const plan = w.plan_id ? await byId('MAINTENANCE_PLAN', w.plan_id) : null;
  const u = uid();
  const lvl = level();
  const lead = lvl >= 3;
  const p = {
    execute: await can('maintenance.execute'), submit: await can('maintenance.submit'), accept: await can('maintenance.accept'),
    assign: await can('maintenance.assign'), cancel: await can('maintenance.cancel'), replace: await can('part.replace')
  };
  const mineAssigned = w.assignee_user_id === u;
  const canExec = p.execute && (lead || mineAssigned) && !localNew;
  const executing = ['ASSIGNED', 'IN_PROGRESS'].includes(w.status) && canExec;
  const started = w.status === 'IN_PROGRESS';
  const online = navigator.onLine;
  const usageData = await workMatData('WO', w);
  const chk = woSubmitIssues(w, results, usageData.usage);
  const notSelf = !woSelfPeople(w, results0).includes(u);
  const showAccept = w.status === 'PENDING_ACCEPTANCE' && !w._local_submit && p.accept && notSelf;
  // Bước tiếp theo: ai bấm gì; phiếu Nháp/Đã giao việc thì checklist và khung Thực hiện còn khóa tới khi bấm Bắt đầu làm
  const who = w.assignee_name || biText('field.not_set');
  const doer = mineAssigned || !w.assignee_user_id;
  const next = localNew ? null
    : w.status === 'DRAFT' ? (p.assign ? { key: 'mt.next.assign', target: 'wo-assign', at: 'top' } : { key: 'mt.next.wait_assign', wait: true })
      : w.status === 'ASSIGNED' ? (executing && doer ? { key: 'mt.next.start', target: 'wo-start', at: 'top' } : { key: 'mt.next.wait_start', vars: { NAME: who }, wait: true })
        : w.status === 'IN_PROGRESS' ? (executing && doer ? { key: 'mt.next.do', target: 'wo-submit', at: 'exec' } : { key: 'mt.next.wait_submit', vars: { NAME: who }, wait: true })
          : w.status === 'PENDING_ACCEPTANCE' ? (w._local_submit ? { key: 'mt.next.wait_sync', wait: true } : showAccept ? { key: 'mt.next.accept', target: 'wo-accept', at: 'exec' } : { key: p.accept ? 'mt.self_no_accept' : 'mt.wait_accept', wait: true })
            : null;
  const execLocked = ['DRAFT', 'ASSIGNED'].includes(w.status);
  const lockNote = execLocked ? `<p class="muted small">${bi('mt.exec_locked')}</p>` : '';
  const queuedDocs = ops.filter((o) => o.action === 'doc.upload' && o.parent_id === w.work_order_id && o.state !== 'REJECTED').length;
  const isHours = plan && plan.interval_type === 'OPERATING_HOURS';
  const kv = (k, v) => (v ? `<div class="kv"><span>${bi(k)}</span><strong>${v}</strong></div>` : '');
  const resultCard = (r) => {
    const stv = r.result_status || 'PENDING';
    const dis = !(executing && started) ? 'disabled' : '';
    const mv = r.measured_value === '' || r.measured_value === null || r.measured_value === undefined ? '' : r.measured_value;
    const out = r.result_type === 'NUMBER' && mv !== '' && outOfRange(r, Number(mv));
    const btn = (v) => `<button type="button" class="seg${stv === v ? ' on s-' + v.toLowerCase() : ''}" data-res="${esc(r.result_id)}" data-v="${v}" ${dis}>${bi('check_result.' + v)}</button>`;
    return `<div class="cl-item${stv === 'FAIL' ? ' fail' : ''}" data-field="results[${esc(r.result_id)}]" id="res-${esc(r.result_id)}">
      <div class="cl-title"><span class="cl-no">${esc(r.step_no)}</span><span>${biName(r, 'label')}${r.required === false ? ` <span class="muted small">(${bi('mt.optional')})</span>` : ''}</span>${r._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</div>
      ${r.safety_note_vi || r.safety_note_zh ? `<div class="cl-safety">${bi('mt.safety')}: ${biName(r, 'safety_note')}</div>` : ''}
      ${r.result_type === 'NUMBER' ? `<label class="cl-lbl" for="mv-${esc(r.result_id)}">${bi('mt.measured_value')} <span class="req">*</span> <span class="muted">(${bi('mt.allowed_range')}: ${rangeText(r)})</span></label>
        <div class="cl-num-row"><input class="inp num" id="mv-${esc(r.result_id)}" data-mv="${esc(r.result_id)}" inputmode="decimal" enterkeyhint="done" placeholder="${esc(biText('mt.measured_value'))}" value="${esc(mv === '' ? '' : String(mv))}" ${dis}><span class="unit">${esc(r.unit || '')}</span><span class="mv-out"${out ? '' : ' hidden'}>${badge('mt.out_of_range')}</span></div>` : ''}
      <div class="segs">${btn('PASS')}${btn('FAIL')}${r.required === false ? btn('NA') : ''}</div>
      <label class="cl-lbl" for="nt-${esc(r.result_id)}">${bi(r.result_type === 'TEXT' ? 'mt.record_text' : 'field.note')}</label>
      <input class="inp cl-note" id="nt-${esc(r.result_id)}" data-note="${esc(r.result_id)}" type="text" maxlength="500" placeholder="${esc(biText(r.result_type === 'TEXT' ? 'mt.record_text' : 'mt.note_hint'))}" value="${esc(r.note_vi || r.note_zh || '')}" ${dis}>
      ${(r.note_vi && r.note_zh && r.i18n_meta && r.i18n_meta.note && r.i18n_meta.note.state === 'MACHINE') ? `<div class="muted small">${esc(r.i18n_meta.note.src === 'vi' ? r.note_zh : r.note_vi)} <span class="tag mt">${bi('tag.machine_translated')}</span></div>` : ''}
      <div class="ferr small"></div></div>`;
  };
  // Ảnh trước/sau: người được giao (hoặc C3/C4) khi phiếu còn mở. Dựng sẵn trước khi thay nội dung màn để lúc vẽ lại
  // (đổi ô, lưu) trang không ngắn lại giữa chừng → giữ nguyên chỗ đang xem
  const docsHtml = localNew ? `<p class="muted small">${bi('mt.local_new_note')}</p>` : await docsTabHtml('WORK_ORDER', w, {
    canUpload: (await can('doc.upload')) && (lead || mineAssigned) && WO_OPEN.has(w.status),
    photoButtons: ['mt.photo_before', 'mt.photo_after'].map(photoButton)
  });
  // Đổi ô liên tiếp → nhiều lần vẽ chạy cùng lúc: chỉ lần bắt đầu sau cùng (nháp mới nhất) được ghi lên màn, lần cũ xong
  // muộn không ghi đè (không thì màn hiện nội dung cũ và lần đổi ô sau lưu nháp cũ, mất chữ vừa gõ)
  if (seq !== view._renderSeq) return;
  view.innerHTML = `<section class="card">
    ${ov.rejected.length ? `<p class="banner warn">${bi('mt.has_rejected')} <a href="#/account/drafts">${bi('draft.title')}</a></p>` : ''}
    ${ov.blocked ? `<p class="banner warn">${bi('mt.blocked')}</p>` : ''}
    ${w.returned_reason && w.status === 'IN_PROGRESS' ? `<p class="banner warn">${bi('mt.returned')}: ${esc(w.returned_reason)}</p>` : ''}
    <div class="rec-top"><span class="code big">${w.work_order_code ? esc(w.work_order_code) : bi('tag.pending_code')}</span><span>${statusBadge('WO', w.status)} ${prioBadges(w, 'WO')} ${ov.local || localNew ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</span></div>
    <h2 class="eq-name">${biName(w, 'title')}</h2>
    <div class="kv-grid">
      ${kv('module.equipment', e ? `<a href="#/equipment/${esc(e.equipment_id)}">${esc(eqText(e))}</a>` : '')}
      ${kv('mt.plan', plan ? `<a href="#/maintenance/plans/${esc(plan.plan_id)}">${esc(plan.plan_code)}</a>` : esc(biText('mt.source_MANUAL')))}
      ${kv('mt.due_date', esc(fmtDate(w.due_date)))}
      ${kv('wk.col.assignee', esc(w.assignee_name || biText('field.not_set')))}
      ${kv('mt.checklist', w.checklist_revision ? `${bi('mt.revision')} ${esc(w.checklist_revision)}` : '')}
      ${w.overall_result ? kv('mt.overall_result', badge('overall_result.' + w.overall_result)) : ''}
      ${w.approved_at ? kv('mt.accepted', `${esc(w.approved_by_name || '')} · ${esc(fmtDateTime(w.approved_at))}`) : ''}
      ${w.next_due_date ? kv('mt.next_due', esc(fmtDate(w.next_due_date))) : ''}
      ${w.repair_id ? kv('mt.repair_created', `<a href="#/repairs/${esc(w.repair_id)}">${bi('module.repairs')}</a>`) : ''}
      ${w.cancel_reason ? kv('mt.cancel_reason', esc(w.cancel_reason)) : ''}
    </div>
    <div class="row">
      ${executing && w.status === 'ASSIGNED' && !started ? `<button type="button" class="btn primary" id="wo-start">${ICON.check}<span>${bi('mt.start')}</span></button>` : ''}
      ${p.assign && ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(w.status) && !localNew ? `<button type="button" class="btn small" id="wo-assign" ${online ? '' : 'disabled'}>${bi('mt.assign')}</button>` : ''}
      ${p.replace && executing && started && e ? `<button type="button" class="btn small" id="wo-replace">${bi('part.replace')}</button>` : ''}
      ${p.cancel && !localNew && ((lead && WO_OPEN.has(w.status)) || (!lead && w.status === 'DRAFT' && w.created_by === u)) ? `<button type="button" class="btn small" id="wo-cancel" ${online ? '' : 'disabled'}>${bi('mt.cancel')}</button>` : ''}
    </div>
    ${!online && p.assign ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
    ${localNew ? `<p class="muted small">${bi('mt.local_new_note')}</p>` : ''}
    ${nextStepHtml(next, 'top')}
  </section>
  ${results.length ? `<section class="card" id="wo-checklist"><h3>${bi('mt.checklist')}</h3>${lockNote}${results.map(resultCard).join('')}</section>` : ''}
  <section class="card exec-card" id="wo-exec">
    <h3>${bi('mt.execution')}</h3>
    ${lockNote}
    <div class="form-grid">
      <div class="fld" data-field="start_at"><label for="f-start_at">${bi('mt.start_at')}</label><input class="inp" type="datetime-local" id="f-start_at" value="${esc(toLocalInput(w.start_at))}" ${executing && started ? '' : 'disabled'}><div class="ferr"></div></div>
      <div class="fld" data-field="end_at"><label for="f-end_at">${bi('mt.end_at')}</label><div class="row"><input class="inp" type="datetime-local" id="f-end_at" value="${esc(toLocalInput(w.end_at))}" ${executing && started ? '' : 'disabled'}>${executing && started ? `<button type="button" class="btn tiny" id="wo-end-now">${bi('mt.now')}</button>` : ''}</div><div class="ferr"></div></div>
      <div class="fld" data-field="downtime_start_at"><label for="f-downtime_start_at">${bi('mt.downtime_start')}</label><input class="inp" type="datetime-local" id="f-downtime_start_at" value="${esc(toLocalInput(w.downtime_start_at))}" ${executing && started ? '' : 'disabled'}><div class="ferr"></div></div>
      <div class="fld" data-field="downtime_end_at"><label for="f-downtime_end_at">${bi('mt.downtime_end')}</label><input class="inp" type="datetime-local" id="f-downtime_end_at" value="${esc(toLocalInput(w.downtime_end_at))}" ${executing && started ? '' : 'disabled'}><div class="ferr"></div></div>
      <div class="fld" data-field="downtime_note"><label for="f-downtime_note">${bi('mt.downtime_note')}</label><input class="inp" type="text" id="f-downtime_note" maxlength="500" value="${esc(w.downtime_note || '')}" ${executing && started ? '' : 'disabled'}><div class="ferr"></div></div>
      <div class="fld" data-field="labor_minutes"><label for="f-labor_minutes">${bi('mt.labor_minutes')}</label><input class="inp num" inputmode="numeric" id="f-labor_minutes" value="${esc(w.labor_minutes ?? '')}" ${executing && started ? '' : 'disabled'}><div class="ferr"></div></div>
      ${isHours || (w.operating_hours !== '' && w.operating_hours !== null && w.operating_hours !== undefined) ? `<div class="fld" data-field="operating_hours"><label for="f-operating_hours">${bi('mt.hours_at_work')}</label><input class="inp num" inputmode="decimal" id="f-operating_hours" value="${esc(w.operating_hours ?? '')}" ${executing && started ? '' : 'disabled'}><div class="ferr"></div></div>` : ''}
    </div>
    <fieldset class="bi-pair" data-field="overall_result"><legend>${bi('mt.overall_result')}</legend>
      <div class="segs">${['PASS', 'FAIL'].map((v) => `<button type="button" class="seg${w.overall_result === v ? ' on s-' + v.toLowerCase() : ''}" data-overall="${v}" ${executing && started && !(v === 'PASS' && chk.anyFail) ? '' : 'disabled'}>${bi('overall_result.' + v)}</button>`).join('')}</div>
      ${chk.anyFail ? `<p class="muted small">${bi('mt.fail_forces_overall')}</p>` : ''}<div class="ferr"></div></fieldset>
    <div class="fld" data-field="result"><label for="f-result">${bi('mt.result_note')}</label><input class="inp" type="text" id="f-result" maxlength="1000" value="${esc(w.result_vi || w.result_zh || '')}" ${executing && started ? '' : 'disabled'}></div>
    ${executing && started ? `<div class="row form-actions">
      <button type="button" class="btn" id="wo-save" ${dirty ? '' : 'disabled'}>${bi('btn.save')}</button>
      <button type="button" class="btn primary" id="wo-submit" ${chk.issues.length || ov.blocked || ov.rejected.length ? 'disabled' : ''}>${bi('btn.submit_acceptance')}</button>
    </div>${issueListHtml(chk.issues, 'wo-left')}
    ${dirty ? `<p class="muted small">${bi('mt.unsaved')}</p>` : ''}` : ''}
    ${showAccept ? `<div class="row form-actions"><button type="button" class="btn primary" id="wo-accept" ${online ? '' : 'disabled'}>${ICON.check}<span>${bi('btn.accept_pass')}</span></button><button type="button" class="btn" id="wo-return" ${online ? '' : 'disabled'}>${bi('btn.accept_fail')}</button></div>` : ''}
    ${!(executing && started) && !showAccept ? nextStepHtml(next, 'exec') : ''}
  </section>
  <section class="card tab-body"><h3>${bi('mt.photos')}</h3>${queuedDocs ? `<p class="muted small">${bi('mt.photos_queued', { N: queuedDocs })}</p>` : ''}<div id="wo-docs">${docsHtml}</div></section>
  ${localNew ? '' : await workMatHtml('WO', w)}
  <section class="card"><h3>${bi('mt.timeline')}</h3><ul class="list timeline">
    ${[['mt.tl.created', w.created_at], ['mt.tl.assigned', w.assigned_at], ['mt.start_at', w.start_at], ['mt.end_at', w.end_at], ['mt.tl.submitted', w.submitted_at], ['mt.tl.accepted', w.approved_at]]
      .map(([k, t]) => `<li class="${t ? 'done' : 'todo'}"><span class="dot"></span><span>${bi(k)}</span><strong>${t ? esc(fmtDateTime(t)) : `<span class="muted">${bi('field.not_set')}</span>`}</strong></li>`).join('')}</ul></section>`;
  const repaint = () => renderWorkOrder(view, ctx);
  if (!localNew) wireDocsTab($('#wo-docs', view), 'WORK_ORDER', w, repaint);
  if (!localNew) wireWorkMat(view, 'WO', w, repaint);
  const on = (id, fn) => { const el = $('#' + id, view); if (el) el.addEventListener('click', fn); };
  // ----- Nháp form -----
  const saveDraft = async () => { await saveFormDraft(draftKey, draft); };
  const setField = async (k, v) => { draft.fields[k] = v; await saveDraft(); };
  const setRes = async (id, k, v) => { (draft.results[id] = draft.results[id] || {})[k] = v; await saveDraft(); };
  // Sửa một ô rồi chạm sang ô nhập khác: chưa vẽ lại cả màn (vẽ lại làm mất ô đang gõ, iPhone tắt bàn phím) — chỉ bật nút
  // Lưu; vẽ lại khi rời hẳn các ô nhập (chạm nút, chạm ra ngoài). Bấm nút (Bây giờ, Đạt…) thì vẽ lại ngay như cũ.
  const afterEdit = (src = null) => {
    if (!view.isConnected) return;
    const a = document.activeElement;
    if (!a || a === src || a === document.body || !view.contains(a) || !a.matches('input, textarea, select')) { repaint(); return; }
    const sv = $('#wo-save', view); if (sv) sv.disabled = false;
    if (a.dataset.leave) return;
    a.dataset.leave = '1';
    a.addEventListener('blur', () => { delete a.dataset.leave; setTimeout(() => afterEdit(), 0); }, { once: true });
  };
  $$('[data-res]', view).forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.res, v = b.dataset.v;
    const r = results.find((x) => x.result_id === id);
    await setRes(id, 'result_status', r.result_status === v && v !== 'PENDING' ? 'PENDING' : v);
    // Có mục Không đạt → Kết quả chung chỉ được Không đạt (C7)
    if (v === 'FAIL') await setField('overall_result', 'FAIL');
    repaint();
  }));
  // Đang gõ số đo (iPhone: bàn phím số không có nút Xong, ô chỉ "change" khi chạm ra ngoài): báo ngay ngoài giới hạn,
  // tự chọn Không đạt và Kết quả chung Không đạt, lưu nháp — không vẽ lại để bàn phím không đóng
  $$('[data-mv]', view).forEach((i) => i.addEventListener('input', async () => {
    const id = i.dataset.mv;
    const r = results.find((x) => x.result_id === id);
    const n = parseNumberInput(i.value);
    if (n.error || n.value === null) return;
    const fail = outOfRange(r, n.value);
    const card = $(`#res-${CSS.escape(id)}`, view);
    card.classList.toggle('fail', fail);
    const mo = $('.mv-out', card); if (mo) mo.hidden = !fail;
    const want = fail ? 'FAIL' : (r.result_status === 'FAIL' && !outOfRange(r, Number(r.measured_value)) ? 'FAIL' : 'PASS');
    $$('[data-res]', card).forEach((b) => { const on = b.dataset.v === want; b.className = 'seg' + (on ? ' on s-' + b.dataset.v.toLowerCase() : ''); });
    await setRes(id, 'measured_value', n.value);
    await setRes(id, 'result_status', want);
    if (fail) {
      await setField('overall_result', 'FAIL');
      $$('[data-overall]', view).forEach((b) => { const on = b.dataset.overall === 'FAIL'; b.className = 'seg' + (on ? ' on s-fail' : ''); if (b.dataset.overall === 'PASS') b.disabled = true; });
    }
  }));
  $$('[data-mv]', view).forEach((i) => i.addEventListener('change', async () => {
    const id = i.dataset.mv;
    const r = results.find((x) => x.result_id === id);
    const n = parseNumberInput(i.value);
    const err = $(`#res-${CSS.escape(id)} .ferr`, view);
    if (n.error) { err.textContent = biText('field.invalid'); return; }
    await setRes(id, 'measured_value', n.value === null ? '' : n.value);
    // Ngoài giới hạn: tự đề xuất Không đạt; người làm đổi lại Đạt được nhưng phải ghi chú (5.1.1 mục 4)
    if (n.value !== null) await setRes(id, 'result_status', outOfRange(r, n.value) ? 'FAIL' : (r.result_status === 'FAIL' && !outOfRange(r, Number(r.measured_value)) ? r.result_status : 'PASS'));
    if (n.value !== null && outOfRange(r, n.value)) await setField('overall_result', 'FAIL');
    afterEdit(i);
  }));
  $$('[data-note]', view).forEach((i) => i.addEventListener('change', async () => {
    const id = i.dataset.note;
    const t = i.value.trim();
    const lang = oneLang('note', t);
    await setRes(id, 'note_vi', lang.note_vi || ''); await setRes(id, 'note_zh', lang.note_zh || '');
    afterEdit(i);
  }));
  const fieldMap = { 'f-start_at': 'start_at', 'f-end_at': 'end_at', 'f-downtime_start_at': 'downtime_start_at', 'f-downtime_end_at': 'downtime_end_at' };
  for (const [id, k] of Object.entries(fieldMap)) { const el = $('#' + id, view); if (el) el.addEventListener('change', async () => { await setField(k, fromLocalInput(el.value)); afterEdit(el); }); }
  const dn = $('#f-downtime_note', view); if (dn) dn.addEventListener('change', async () => { await setField('downtime_note', dn.value.trim()); afterEdit(dn); });
  const lm = $('#f-labor_minutes', view); if (lm) lm.addEventListener('change', async () => { const n = parseNumberInput(lm.value, { integer: true }); if (!n.error) { await setField('labor_minutes', n.value === null ? '' : n.value); afterEdit(lm); } });
  const oh = $('#f-operating_hours', view); if (oh) oh.addEventListener('change', async () => { const n = parseNumberInput(oh.value); if (!n.error) { await setField('operating_hours', n.value === null ? '' : n.value); afterEdit(oh); } });
  const rn = $('#f-result', view); if (rn) rn.addEventListener('change', async () => { const l = oneLang('result', rn.value); await setField('result_vi', l.result_vi || ''); await setField('result_zh', l.result_zh || ''); afterEdit(rn); });
  $$('[data-overall]', view).forEach((b) => b.addEventListener('click', async () => { await setField('overall_result', b.dataset.overall); repaint(); }));
  on('wo-end-now', async () => { await setField('end_at', isoNowVN()); repaint(); });
  // Nút "Bây giờ" trong danh sách mục còn thiếu
  $$('[data-now]', view).forEach((b) => b.addEventListener('click', async () => { await setField(b.dataset.now, isoNowVN()); repaint(); }));
  on('wo-left', () => {
    const first = chk.issues[0];
    const el = first && (view.querySelector(`[data-field="${CSS.escape(first.field)}"]`) || $('#wo-exec', view));
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    toast(chk.issues.slice(0, 4).map((x) => bi(x.key, x.vars)).join(' · '), 'err');
  });
  wireIssueList(view);
  // ----- Ghi -----
  const pendingForWo = () => ops.some((o) => (o.entity_id === w.work_order_id || o.parent_id === w.work_order_id) && o.state !== 'REJECTED' && o.state !== 'CONFLICT');
  /** Gửi maintenance.execute: trực tuyến khi không còn mục chờ của phiếu, không thì vào hàng chờ (gửi tuần tự) */
  const sendExec = async (payload) => {
    if (!online || pendingForWo()) {
      await queueWork('maintenance.execute', payload, { entity_type: 'WORK_ORDER', entity_id: w.work_order_id, expected_version: Number(base.record_version || 0), chain: true, merge: mergeExecPayload });
      return { ok: true, queued: true };
    }
    return writeOnline('maintenance.execute', payload, { expected_version: base.record_version });
  };
  const execPayload = () => {
    const pl = { work_order_id: w.work_order_id, ...draft.fields };
    const rs = Object.entries(draft.results).map(([id, v]) => ({ result_id: id, ...v }));
    if (rs.length) pl.results = rs;
    return pl;
  };
  const afterWrite = async (res, okMsg) => {
    if (res.queued) { await clearFormDraft(draftKey); toast(bi('sync.local_saved'), 'ok'); if (online) syncNow({ quiet: true }).then(repaint); repaint(); return true; }
    if (res.ok) { await clearFormDraft(draftKey); await afterCommit(); toast(bi(okMsg || 'form.saved'), 'ok'); repaint(); return true; }
    if (res.code === 'VALIDATION_ERROR') { showErrors(view, (res.errors || []).map((x) => ({ ...x, field: x.field }))); toast((res.errors || []).slice(0, 3).map((x) => `${x.message_vi} · ${x.message_zh}`).join(' — '), 'err'); return false; }
    await handleWriteError(res); return false;
  };
  on('wo-start', async (ev) => {
    busy(evBtn(ev), true);
    const res = await sendExec({ work_order_id: w.work_order_id, start_at: isoNowVN(), ...draft.fields });
    busy(evBtn(ev), false);
    await afterWrite(res);
  });
  on('wo-save', async (ev) => { busy(evBtn(ev), true); const res = await sendExec(execPayload()); busy(evBtn(ev), false); await afterWrite(res); });
  on('wo-submit', async (ev) => {
    let severity = '';
    if (chk.anyFail && !w.repair_id) {
      severity = await dialog({
        title: bi('btn.submit_acceptance'),
        body: `<p>${bi('mt.fail_creates_repair')}</p><label for="sv">${bi('rp.severity')} <span class="req">*</span></label><select id="sv" class="inp sel"><option value="">${bi('field.choose')}</option>${SEVERITIES.map((s) => `<option value="${s}">${bi('severity.' + s)}</option>`).join('')}</select>`,
        actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.submit_acceptance'), kind: 'primary', read: (wr) => $('#sv', wr).value }]
      });
      if (severity === null) return;
      if (!severity) { toast(bi('rp.severity_required'), 'err'); return; }
    }
    const btn = ev.currentTarget;
    busy(btn, true);
    // Lưu thay đổi còn trên form trước, rồi gửi nghiệm thu (gửi tuần tự, 5.1.1 mục 2); ghi trực tuyến xong thì gửi theo
    // phiên bản mới (không thì xung đột phiên bản)
    let ver = base.record_version;
    if (dirty) {
      const r1 = await sendExec(execPayload());
      if (!r1.ok && !r1.queued) { busy(btn, false); await afterWrite(r1); return; }
      await clearFormDraft(draftKey);
      if (!r1.queued && r1.record_version) ver = r1.record_version;
    }
    const expect = {
      documents: ops.filter((o) => o.action === 'doc.upload' && o.parent_id === w.work_order_id && o.state !== 'REJECTED').map((o) => o.payload.document_id),
      usage_lines: localUsageIds(usageData)
    };
    const payload = { work_order_id: w.work_order_id, expect, ...(severity ? { repair_severity: severity } : {}) };
    let res;
    const fresh = await myQueue();
    if (!navigator.onLine || fresh.some((o) => (o.entity_id === w.work_order_id || o.parent_id === w.work_order_id) && o.state !== 'REJECTED' && o.state !== 'CONFLICT')) {
      await queueWork('maintenance.submit', payload, { entity_type: 'WORK_ORDER', entity_id: w.work_order_id, expected_version: Number(base.record_version || 0), chain: true });
      res = { queued: true };
    } else {
      res = await writeOnline('maintenance.submit', payload, { expected_version: ver });
    }
    busy(btn, false);
    if (res.ok && res.data && res.data.repair) toast(bi('mt.repair_created_toast', { C: res.data.repair.repair_code }), 'ok');
    await afterWrite(res);
  });
  on('wo-replace', async () => { if (await replaceDialog('WO', w)) repaint(); });
  on('wo-assign', async () => { if (await assignDialog(w)) repaint(); });
  on('wo-cancel', async () => {
    const reason = await dialog({ title: bi('mt.cancel'), body: `<label for="cn">${bi('field.reason')} <span class="req">*</span></label><input id="cn" type="text" maxlength="300">`, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('mt.cancel'), kind: 'primary danger', read: (wr) => $('#cn', wr).value.trim() }] });
    if (reason === null) return;
    if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    const res = await writeOnline('maintenance.cancel', { work_order_id: w.work_order_id, reason }, { expected_version: base.record_version });
    if (res.ok) { await clearFormDraft(draftKey); await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(res);
  });
  const acceptFlow = async (decision) => {
    const pendingUsage = usageData.usage.filter((x) => x.status === 'PENDING_CONFIRMATION' && !x._local);
    const canConfirm = await can('usage.confirm');
    const r = await dialog({
      title: bi(decision === 'ACCEPT' ? 'btn.accept_pass' : 'btn.accept_fail'),
      body: decision === 'RETURN'
        ? `<label for="ar">${bi('mt.return_reason')} <span class="req">*</span></label><input id="ar" type="text" maxlength="300">`
        : `<p>${bi('mt.accept_confirm')}</p>${pendingUsage.length && canConfirm ? `<label class="check"><input type="checkbox" id="ac-usage" checked><span>${bi('mt.accept_with_usage', { N: pendingUsage.length })}</span></label>` : ''}`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi(decision === 'ACCEPT' ? 'btn.accept_pass' : 'btn.accept_fail'), kind: decision === 'ACCEPT' ? 'primary' : 'danger', read: (wr) => ({ reason: $('#ar', wr) ? $('#ar', wr).value.trim() : '', usage: !!($('#ac-usage', wr) && $('#ac-usage', wr).checked) }) }]
    });
    if (!r) return;
    if (decision === 'RETURN' && !r.reason) { toast(bi('field.reason_required'), 'err'); return; }
    const res = await writeWithPin('maintenance.accept', { work_order_id: w.work_order_id, decision, reason: r.reason, confirm_usage: r.usage }, { expected_version: base.record_version });
    if (res.ok) {
      await afterCommit();
      const g = res.data && res.data.generated_work_order;
      toast(g ? bi('mt.wo_generated', { C: g.work_order_code }) : bi('form.saved'), 'ok');
      repaint();
    } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  };
  on('wo-accept', () => acceptFlow('ACCEPT'));
  on('wo-return', () => acceptFlow('RETURN'));
  wireNextStep(view);
}

/** Nút chụp ảnh có tên lấy từ từ điển (đủ hai thứ tiếng, không cần dịch máy) */
export function photoButton(key) {
  const pair = L[key] || [biText(key), ''];
  return { key, title_vi: pair[0], title_zh: pair[1] };
}

/** Giao việc / đổi người làm, ưu tiên, hạn (C3/C4, cần mạng) */
async function assignDialog(w) {
  const users = await workerPick();
  const r = await dialog({
    title: bi('mt.assign'),
    body: `<label for="as-u">${bi('wk.col.assignee')} <span class="req">*</span></label><select id="as-u" class="inp sel"><option value="">${bi('field.choose')}</option>${users.map((u) => `<option value="${esc(u.user_id)}"${u.user_id === w.assignee_user_id ? ' selected' : ''}>${esc(u.employee_code + ' · ' + u.display_name)}</option>`).join('')}</select>
      <label for="as-p">${bi('wk.col.priority')}</label><select id="as-p" class="inp sel">${PRIORITIES.map((x) => `<option value="${x}"${(w.priority || 'NORMAL') === x ? ' selected' : ''}>${bi('priority.' + x)}</option>`).join('')}</select>
      <label for="as-d">${bi('mt.due_date')}</label><input id="as-d" class="inp" type="date" value="${esc(w.due_date || '')}">
      <p class="muted small">${bi('mt.assign_help')}</p>`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (wr) => ({ u: $('#as-u', wr).value, p: $('#as-p', wr).value, d: $('#as-d', wr).value }) }]
  });
  if (!r) return false;
  if (!r.u) { toast(bi('field.required'), 'err'); return false; }
  const payload = { work_order_id: w.work_order_id, assignee_user_id: r.u, priority: r.p };
  if (r.d && r.d !== w.due_date) payload.due_date = r.d;
  const res = await writeOnline('maintenance.assign', payload, { expected_version: w.record_version });
  if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); return true; }
  await handleWriteError(res);
  return false;
}

