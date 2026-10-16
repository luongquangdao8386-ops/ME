// Tra cứu lộ điện (Đợt 3): CI-01 danh sách tủ và lộ / WEB-CI-01 bảng + vùng hồ sơ, CI-02 hồ sơ lộ (Thông số · Phụ tải · Tài liệu · Lịch sử),
// hồ sơ tủ (nối hồ sơ thiết bị — B2: thấy phiếu sửa, bảo trì của thiết bị), CI-03 đường cấp điện (truy trên máy, dùng được khi mất mạng),
// bản vẽ có phiên bản và duyệt, xác minh dữ liệu (PIN). Tra cứu không xác nhận đã cô lập điện (1.4 §5.7, phụ lục 3.13, 4.4.7).
import { bi, biText, esc, api, fmtDate, fmtDateTime, fmtNumber, badge, biName, nameText, uuid, resMsg, session } from '../core.js';
import { ICON, toast, toTop, dialog, $, $$, setViewHtml, wireSearch, freshFilters } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, byId, mapOf, can, invalidate } from '../data.js';
import { upsertLocal } from '../sync.js';
import { navigate, back } from '../router.js';
import { afterCommit } from '../app.js';
import {
  textInput, selectInput, numberInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, writeWithPin, busy, evBtn, unconfirmedAmbiguous, oneLang
} from '../form.js';
import { uploadDoc, downloadDoc, shareFileNow, isTouchMobile } from '../media.js';
import { handleWriteError } from './equipment.js';
import { excelLink } from '../excel-link.js';
import { reportLink } from '../report-link.js';
import { REPAIR_OPEN, WO_OPEN, statusBadge } from '../work.js';

export const PANEL_TYPES = ['SOURCE_GRID', 'SOURCE_TRANSFORMER', 'SOURCE_GENERATOR', 'MAIN_SWITCHBOARD', 'DISTRIBUTION_BOARD', 'CONTROL_PANEL'];
const SOURCE_TYPES = new Set(['SOURCE_GRID', 'SOURCE_TRANSFORMER', 'SOURCE_GENERATOR', 'MAIN_SWITCHBOARD']);
const NO_FEED = new Set(['SOURCE_GRID', 'SOURCE_GENERATOR']);
const STATUSES = ['IN_USE', 'STANDBY', 'OUT_OF_SERVICE'];
const ROLES = ['PRIMARY', 'BACKUP'];
const DEPTH_MAX = 50;
const PAGE = 20;
const FL = { q: '', loc: '', panel: '', mode: 'circuits', modeChosen: false, page: 0 };
const FL0 = { ...FL };
const open = new Set();
/** Tab đang xem của từng lộ: đổi tab vẽ lại tại chỗ (không đổi địa chỉ → không nhảy lên đầu trang) */
const tabOf = new Map();
const tabQ = new Map();

/* ======================= Đồ thị cấp điện (khớp 31_circuits của máy chủ) ======================= */

const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

export async function circuitGraph() {
  const g = { panels: new Map(), circuits: new Map(), loads: [], loadsByEq: new Map(), loadsByPanel: new Map(), loadsByCircuit: new Map(), panelByEq: new Map(), childCircuits: new Map(), circuitsByPanel: new Map() };
  (await recs('PANEL')).forEach((p) => { if (!p.archived_at) { g.panels.set(p.panel_id, p); if (p.equipment_id) g.panelByEq.set(p.equipment_id, p); } });
  (await recs('CIRCUIT')).forEach((c) => { if (!c.archived_at) { g.circuits.set(c.circuit_id, c); push(g.circuitsByPanel, c.panel_id, c); if (c.upstream_circuit_id) push(g.childCircuits, c.upstream_circuit_id, c); } });
  (await recs('CIRCUIT_LOAD')).forEach((l) => {
    if (l.archived_at) return;
    g.loads.push(l);
    if (l.equipment_id) push(g.loadsByEq, l.equipment_id, l);
    if (l.downstream_panel_id) push(g.loadsByPanel, l.downstream_panel_id, l);
    push(g.loadsByCircuit, l.circuit_id, l);
  });
  for (const list of g.circuitsByPanel.values()) list.sort((a, b) => String(a.circuit_code).localeCompare(String(b.circuit_code)));
  return g;
}

/** Cạnh đi lên (3.13): thiết bị → tủ của nó, không thì → lộ cấp; tủ → lộ cấp vào; lộ → lộ cấp trên, không thì → tủ cha */
function upEdges(g, key) {
  const t = key[0], id = key.slice(2);
  if (t === 'E') {
    const p = g.panelByEq.get(id);
    if (p) return [{ to: 'P:' + p.panel_id, role: null }];
    return (g.loadsByEq.get(id) || []).map((l) => ({ to: 'C:' + l.circuit_id, role: l.supply_role || 'PRIMARY' }));
  }
  if (t === 'P') return (g.loadsByPanel.get(id) || []).map((l) => ({ to: 'C:' + l.circuit_id, role: l.supply_role || 'PRIMARY' }));
  const c = g.circuits.get(id);
  if (!c) return [];
  if (c.upstream_circuit_id) return [{ to: 'C:' + c.upstream_circuit_id, role: c.supply_role || 'PRIMARY' }];
  return c.panel_id ? [{ to: 'P:' + c.panel_id, role: null }] : [];
}

/**
 * Truy đường cấp: DFS mang tập nút trên đường; gặp lại → CYCLE_DETECTED; quá 50 nút → DEPTH_LIMIT; gốc là tủ nhóm Nguồn → OK,
 * không thì ROOT_NOT_SOURCE; không dừng ở nguồn đầu tiên. role PRIMARY: chỉ cạnh chính; BACKUP: đường có cạnh dự phòng.
 */
export function tracePaths(g, start, role = 'ALL') {
  const paths = [];
  let n = 0;
  const emit = (path, roles, status) => {
    const hasB = roles.includes('BACKUP');
    if ((role === 'PRIMARY' && hasB) || (role === 'BACKUP' && !hasB)) return;
    paths.push({ keys: path.slice(), roles: roles.slice(), status });
  };
  const dfs = (key, path, roles) => {
    if (++n > 20000 || paths.length >= 200) return;
    if (path.length > DEPTH_MAX) { emit(path, roles, 'DEPTH_LIMIT'); return; }
    const all = upEdges(g, key);
    if (!all.length) {
      const p = key[0] === 'P' ? g.panels.get(key.slice(2)) : null;
      emit(path, roles, p && SOURCE_TYPES.has(p.panel_type) ? 'OK' : 'ROOT_NOT_SOURCE');
      return;
    }
    for (const e of all) {
      if (role === 'PRIMARY' && e.role === 'BACKUP') continue;
      if (path.includes(e.to)) { emit([...path, e.to], [...roles, e.role], 'CYCLE_DETECTED'); continue; }
      dfs(e.to, [...path, e.to], [...roles, e.role]);
    }
  };
  dfs(start, [start], []);
  return paths;
}

/* ======================= Dùng chung ======================= */

const panelIcon = (p) => (p && SOURCE_TYPES.has(p.panel_type) && p.panel_type !== 'MAIN_SWITCHBOARD' ? ICON.source : ICON.panel);
const verifiedBadge = (r) => (r.verified_by ? badge('ci.verified') : badge('ci.unverified'));
const numU = (v, u) => (v === null || v === undefined || v === '' ? '' : `${fmtNumber(v)}\u00A0${esc(u)}`);

function breakerText(c) {
  return [c.breaker_rating_a !== null && c.breaker_rating_a !== undefined && c.breaker_rating_a !== '' ? `${fmtNumber(c.breaker_rating_a)}\u00A0A` : '', esc(c.breaker_model || '')].filter(Boolean).join(' · ');
}
function cableText(c) {
  return [c.cable_section_mm2 ? `${esc(c.cable_section_mm2)}\u00A0mm²` : '', esc(c.cable_type || '')].filter(Boolean).join(' · ');
}

/** Phụ tải của một lộ: [{kind: 'EQ'|'PANEL', rec, load}] */
function loadsOf(g, c, eqs) {
  return (g.loadsByCircuit.get(c.circuit_id) || []).map((l) => (l.equipment_id
    ? { kind: 'EQ', rec: eqs.get(l.equipment_id), load: l }
    : { kind: 'PANEL', rec: g.panels.get(l.downstream_panel_id), load: l }));
}
function loadName(x) {
  if (!x.rec) return '—';
  return x.kind === 'EQ' ? `${esc(x.rec.equipment_code)} · ${biName(x.rec)}` : `${esc(x.rec.panel_code)} · ${biName(x.rec)}`;
}

/** Khu vực và các khu vực con (lọc theo khu vực gồm cả khu vực con) */
async function locChildren(id) {
  if (!id) return null;
  const locs = [...(await mapOf('LOCATION')).values()];
  const out = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const l of locs) if (l.parent_location_id && out.has(l.parent_location_id) && !out.has(l.location_id)) { out.add(l.location_id); grew = true; } }
  return out;
}

async function locOptions() {
  return [...(await mapOf('LOCATION')).values()].filter((l) => l.active !== false).sort((a, b) => String(a.location_code).localeCompare(String(b.location_code)))
    .map((l) => [l.location_id, `${esc(l.location_code)} · ${esc(nameText(l))}`]);
}

async function perms() {
  return {
    edit: await can('circuit.edit'), verify: await can('circuit.verify'), upload: await can('circuit.drawing.upload'),
    approve: await can('circuit.drawing.approve'), print: await can('qr.print'), eq: await can('equipment.view')
  };
}

/* ======================= CI-01 / WEB-CI-01 ======================= */

export async function renderCircuitList(view, ctx) {
  const { shell, params } = ctx;
  freshFilters(ctx, FL, FL0, ['mode', 'modeChosen']);
  const wide = isWide();
  const sel = params.cid ? 'C:' + params.cid : (params.pid ? 'P:' + params.pid : '');
  const p = await perms();
  shell.setScreen({ title: 'module.circuits', back: '/', actions: [] });
  const g = await circuitGraph();
  // Web: chưa có lộ nào mà đã có tủ → mở bảng Tủ điện (không để bảng lộ trống như chưa lưu gì); đang xem một tủ/lộ → bảng tương ứng
  if (wide && params.pid) FL.mode = 'panels';
  else if (wide && params.cid) FL.mode = 'circuits';
  else if (wide && !FL.modeChosen && !g.circuits.size && g.panels.size) FL.mode = 'panels';
  const eqs = await mapOf('EQUIPMENT');
  const locs = await mapOf('LOCATION');
  const inLoc = await locChildren(FL.loc);
  const ql = FL.q.trim().toLowerCase();
  const panelHit = (pn) => (!inLoc || inLoc.has(pn.location_id)) && (!FL.panel || pn.panel_id === FL.panel);
  const textOfC = (c) => [c.circuit_code, c.name_vi, c.name_zh, ...loadsOf(g, c, eqs).map((x) => x.rec ? [x.rec.equipment_code || x.rec.panel_code, x.rec.name_vi, x.rec.name_zh].join(' ') : '')].join(' ').toLowerCase();
  const textOfP = (pn) => { const e = eqs.get(pn.equipment_id); return [pn.panel_code, pn.name_vi, pn.name_zh, e && e.equipment_code, e && e.name_vi].join(' ').toLowerCase(); };
  const panels = [...g.panels.values()].filter(panelHit).sort((a, b) => String(a.panel_code).localeCompare(String(b.panel_code)));
  const circuits = [...g.circuits.values()].filter((c) => { const pn = g.panels.get(c.panel_id); return pn && panelHit(pn) && (!ql || textOfC(c).includes(ql) || textOfP(pn).includes(ql)); })
    .sort((a, b) => String((g.panels.get(a.panel_id) || {}).panel_code).localeCompare(String((g.panels.get(b.panel_id) || {}).panel_code)) || String(a.circuit_code).localeCompare(String(b.circuit_code)));
  const panelOpts = [...g.panels.values()].sort((a, b) => String(a.panel_code).localeCompare(String(b.panel_code))).map((pn) => [pn.panel_id, `${esc(pn.panel_code)} · ${esc(nameText(pn))}`]);
  const locOpts = await locOptions();
  const selBox = (id, label, opts, cur) => `<label class="inline ci-sel"><span class="muted small">${bi(label)}</span><select id="${id}" class="sel"><option value="">${bi('due_filter.ALL')}</option>${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const excel = await excelLink('circuits');
  const rpt = await reportLink('RPT_CIRCUITS', { location_id: FL.loc, panel_id: FL.panel });
  const toolbar = `<div class="toolbar ci-toolbar">
    <div class="search"><span>${ICON.search}</span><input id="ci-q" type="search" value="${esc(FL.q)}" placeholder="${esc(biText('ci.search_ph'))}" autocomplete="off"></div>
    <div class="row">${selBox('ci-loc', 'field.location', locOpts, FL.loc)}${selBox('ci-panel', 'ci.panel', panelOpts, FL.panel)}</div>
    ${g.panels.size || wide ? `<div class="segs ci-mode"><button type="button" class="seg${FL.mode === 'circuits' ? ' on' : ''}" data-mode="circuits">${bi('ci.circuit')}</button><button type="button" class="seg${FL.mode === 'panels' ? ' on' : ''}" data-mode="panels">${bi('ci.panel')}</button></div>` : ''}
    <div class="row tools">${excel}${rpt}
      ${p.edit ? `<a class="btn small" href="#/circuits/p/new">${ICON.panel}<span>${bi('ci.add_panel')}</span></a>` : ''}
      ${p.edit && wide ? `<a class="btn small primary" href="#/circuits/c/new${FL.panel ? '?panel=' + esc(FL.panel) : ''}">${ICON.plus}<span>${bi('ci.add_circuit')}</span></a>` : ''}</div></div>`;
  let body;
  if (!g.panels.size) body = `<div class="card empty-state">${ICON.circuits}<p class="muted">${bi('ci.no_data')}</p></div>`;
  else if (wide && FL.mode === 'panels') {
    const list = panels.filter((pn) => !ql || textOfP(pn).includes(ql));
    body = `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('ci.panel_code')}</th><th>${bi('col.name')}</th><th>${bi('ci.panel_type')}</th><th>${bi('field.location')}</th>
      <th>${bi('ci.equipment_of_panel')}</th><th class="num">${bi('ci.circuit')}</th><th>${bi('ci.verify')}</th><th>QR</th></tr></thead>
      <tbody>${list.map((pn) => { const e = eqs.get(pn.equipment_id); const l = locs.get(pn.location_id); return `<tr class="click${sel === 'P:' + pn.panel_id ? ' sel' : ''}" data-href="/circuits/p/${esc(pn.panel_id)}">
        <td class="code">${esc(pn.panel_code)}</td><td>${biName(pn)}</td><td>${bi('panel_type.' + pn.panel_type)}</td><td>${esc(l ? l.location_code : '')}</td>
        <td>${e ? esc(e.equipment_code) : ''}</td><td class="num">${(g.circuitsByPanel.get(pn.panel_id) || []).length}</td><td>${verifiedBadge(pn)}</td>
        <td>${pn.qr_key ? `<a class="icon-btn" href="#/qr/PANEL/${esc(pn.panel_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  } else if (wide) {
    const shown = circuits.slice(FL.page * PAGE, FL.page * PAGE + PAGE);
    body = `<div class="table-wrap"><table class="tbl ci-table"><thead><tr><th>${bi('ci.circuit_code')}</th><th>${bi('ci.parent_panel')}</th><th>${bi('ci.loads')}</th>
      <th class="num">${bi('ci.voltage')}</th><th>${bi('ci.protection_col')}</th><th>${bi('ci.cable_col')}</th><th>${bi('col.status')}</th><th>QR</th></tr></thead>
      <tbody>${shown.length ? '' : `<tr><td colspan="8" class="muted">${bi(g.circuits.size ? 'field.no_records' : 'ci.no_circuits_hint')}</td></tr>`}${shown.map((c) => { const pn = g.panels.get(c.panel_id) || {}; return `<tr class="click${sel === 'C:' + c.circuit_id ? ' sel' : ''}" data-href="/circuits/c/${esc(c.circuit_id)}">
        <td class="code">${esc(c.circuit_code)}<div class="small">${biName(c)}</div></td><td class="code">${esc(pn.panel_code || '')}</td>
        <td>${loadsOf(g, c, eqs).map((x) => `<div>${x.rec ? biName(x.rec) : '—'}${x.load.supply_role === 'BACKUP' ? ` ${badge('ci.backup_tag')}` : ''}</div>`).join('') || '<span class="muted">—</span>'}</td>
        <td class="num">${c.voltage ? fmtNumber(c.voltage) + '\u00A0V' : ''}</td><td>${breakerText(c)}</td><td>${cableText(c)}</td><td>${badge('circuit_status.' + (c.status || 'IN_USE'))}</td>
        <td>${c.qr_key ? `<a class="icon-btn" href="#/qr/CIRCUIT/${esc(c.circuit_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="row pager"><span class="muted small">${bi('ut.showing', { A: circuits.length ? FL.page * PAGE + 1 : 0, B: Math.min(circuits.length, (FL.page + 1) * PAGE), N: circuits.length })}</span>
        ${circuits.length > PAGE ? `<button type="button" class="btn small" id="ci-pp" ${FL.page ? '' : 'disabled'}>‹</button><span class="muted small">${FL.page + 1} / ${Math.ceil(circuits.length / PAGE)}</span><button type="button" class="btn small" id="ci-np" ${(FL.page + 1) * PAGE < circuits.length ? '' : 'disabled'}>›</button>` : ''}</div>`;
  } else if (FL.mode === 'panels') {
    // iPhone: danh sách tủ (như bảng Tủ điện của web) — loại tủ, khu vực, số lộ, xác minh; chạm mở hồ sơ tủ
    const list = panels.filter((pn) => !ql || textOfP(pn).includes(ql));
    body = `<div class="card-head ci-head"><h2>${bi('ci.panel_list')}</h2><span class="muted small">${bi('ci.total_panels', { N: list.length })}</span></div>
      ${list.length ? `<div class="card ci-group ci-panels"><ul class="ci-rows">${list.map((pn) => { const l = locs.get(pn.location_id); const e = eqs.get(pn.equipment_id); return `<li><a class="ci-row" href="#/circuits/p/${esc(pn.panel_id)}"><span class="ci-ico">${panelIcon(pn)}</span>
          <span class="ci-text"><span class="code">${esc(pn.panel_code)}</span><span class="small">${biName(pn)}</span>
          <span class="muted small">${bi('panel_type.' + pn.panel_type)}${l ? ' · ' + esc(l.location_code) : ''}${e ? ' · ' + esc(e.equipment_code) : ''} · ${bi('ci.total_circuits', { N: (g.circuitsByPanel.get(pn.panel_id) || []).length })}</span>
          <span class="ci-badge">${verifiedBadge(pn)}</span></span></a>
        ${pn.qr_key ? `<a class="icon-btn" href="#/qr/PANEL/${esc(pn.panel_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</li>`; }).join('')}</ul></div>` : `<p class="muted">${bi('field.no_records')}</p>`}`;
  } else {
    const groups = panels.map((pn) => ({ pn, list: circuits.filter((c) => c.panel_id === pn.panel_id) })).filter((x) => !ql || x.list.length || textOfP(x.pn).includes(ql));
    body = `<div class="card-head ci-head"><h2>${bi('ci.list_title')}</h2><span class="muted small">${bi('ci.total_circuits', { N: circuits.length })}</span></div>
      <div class="cards">${groups.map(({ pn, list }) => `<details class="card ci-group"${open.has(pn.panel_id) || ql || FL.panel || groups.length === 1 ? ' open' : ''} data-pid="${esc(pn.panel_id)}">
        <summary><span class="ci-ico">${panelIcon(pn)}</span><span class="ci-text"><span class="code">${esc(pn.panel_code)}</span><span class="small">${biName(pn)}</span><span class="muted small">${bi('panel_type.' + pn.panel_type)} · ${bi('ci.total_circuits', { N: list.length })}</span></span>
          <a class="icon-btn" href="#/circuits/p/${esc(pn.panel_id)}" aria-label="${esc(biText('ci.panel_detail'))}">${ICON.chevron}</a></summary>
        <ul class="ci-rows">${list.map((c) => `<li><a class="ci-row" href="#/circuits/c/${esc(c.circuit_id)}"><span class="ci-ico">${ICON.circuits}</span>
            <span class="ci-text"><span class="code">${esc(c.circuit_code)}</span><span class="small">${biName(c)}</span>
            <span class="muted small">${loadsOf(g, c, eqs).map((x) => (x.rec ? esc(x.rec.equipment_code || x.rec.panel_code) : '')).filter(Boolean).join(', ')}</span></span>
            ${badge('circuit_status.' + (c.status || 'IN_USE'))}</a>
          ${c.qr_key ? `<a class="icon-btn" href="#/qr/CIRCUIT/${esc(c.circuit_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</li>`).join('') || `<li class="muted small">${bi('ci.no_loads')}</li>`}</ul>
      </details>`).join('') || `<p class="muted">${bi('field.no_records')}</p>`}</div>
      ${p.edit ? `<a class="btn primary block ci-add" href="#/circuits/c/new${FL.panel ? '?panel=' + esc(FL.panel) : ''}">${ICON.plus}<span>${bi('ci.add_circuit')}</span></a>` : ''}`;
  }
  setViewHtml(view, toolbar + body + (wide && sel ? '<div id="ci-pane" class="pane"></div>' : ''));
  const again = () => renderCircuitList(view, ctx);
  wireSearch(view, '#ci-q', (v) => { FL.q = v; FL.page = 0; }, again);
  $('#ci-loc', view).addEventListener('change', (e) => { FL.loc = e.target.value; FL.page = 0; again(); });
  $('#ci-panel', view).addEventListener('change', (e) => { FL.panel = e.target.value; FL.page = 0; again(); });
  $$('[data-mode]', view).forEach((b) => b.addEventListener('click', () => {
    FL.mode = b.dataset.mode; FL.modeChosen = true;
    // Đang mở hồ sơ tủ/lộ (vùng bên phải) mà đổi bảng: về danh sách để bảng mới không bị địa chỉ cũ đổi lại
    if (params.pid || params.cid) navigate('/circuits'); else again();
  }));
  $$('details.ci-group', view).forEach((d) => d.addEventListener('toggle', () => { if (d.open) open.add(d.dataset.pid); else open.delete(d.dataset.pid); }));
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) navigate(tr.dataset.href, { replace: !!sel }); }));
  const pp = $('#ci-pp', view), np = $('#ci-np', view);
  if (pp) pp.addEventListener('click', () => { FL.page = Math.max(0, FL.page - 1); again().then(toTop); });
  if (np) np.addEventListener('click', () => { FL.page++; again().then(toTop); });
  if (wide && sel) {
    const pane = $('#ci-pane', view);
    if (sel[0] === 'C') await circuitPane(pane, sel.slice(2), ctx); else await panelPane(pane, sel.slice(2), ctx);
    const row = $('tr.sel', view);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
}

/* ======================= CI-02 Hồ sơ lộ ======================= */

export async function renderCircuit(view, ctx) {
  if (isWide()) return renderCircuitList(view, { ...ctx, params: { cid: ctx.params.id } });
  const c = await byId('CIRCUIT', ctx.params.id);
  ctx.shell.setScreen({
    title: 'ci.circuit_detail', back: '/circuits',
    actions: c && c.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/CIRCUIT/${c.circuit_id}`) }] : []
  });
  view.innerHTML = '<div id="ci-pane" class="pane mobile"></div>';
  await circuitPane($('#ci-pane', view), ctx.params.id, ctx);
}

async function circuitPane(pane, id, ctx) {
  const g = await circuitGraph();
  const c = g.circuits.get(id);
  if (!c) { pane.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const p = await perms();
  const wide = isWide();
  const eqs = await mapOf('EQUIPMENT');
  const pn = g.panels.get(c.panel_id) || {};
  const loc = pn.location_id ? await byId('LOCATION', pn.location_id) : null;
  const up = c.upstream_circuit_id ? g.circuits.get(c.upstream_circuit_id) : null;
  const loads = loadsOf(g, c, eqs);
  const tabs = wide ? ['specs', 'loads', 'documents', 'history'] : ['specs', 'loads', 'documents'];
  // ?tab=documents (từ "Chờ bạn xử lý"): mở tab đó một lần cho mỗi địa chỉ, sau đó theo tab người dùng chọn
  const qt = ctx.query.get('tab');
  if (qt && tabQ.get(id) !== qt) { tabQ.set(id, qt); tabOf.set(id, qt); }
  const want = tabOf.get(id);
  const tab = tabs.includes(want) ? want : 'specs';
  const uidMe = session.user && session.user.user_id;
  // Nguồn (gốc đường chính) và nguồn dự phòng: lấy từ truy đường cấp trên máy
  const paths = tracePaths(g, 'C:' + c.circuit_id, 'ALL');
  const rootOf = (path) => { const k = path.keys[path.keys.length - 1]; return k[0] === 'P' ? g.panels.get(k.slice(2)) : null; };
  const primary = paths.find((x) => !x.roles.includes('BACKUP'));
  const backupRoots = [...new Set(paths.filter((x) => x.roles.includes('BACKUP')).map((x) => rootOf(x)).filter(Boolean))];
  const kv = (k, v) => `<div class="kv"><span>${bi(k)}</span><strong>${v || '—'}</strong></div>`;
  const { qrSvg } = await import('../labels.js');
  const { APP_BASE_URL } = await import('../core.js');
  pane.innerHTML = `<section class="card ci-detail">
    <div class="ci-detail-head"><span class="ci-ico big">${ICON.circuits}</span>
      <div class="grow"><div class="rec-top"><span class="code big">${esc(c.circuit_code)}</span>${verifiedBadge(c)}</div><h2 class="eq-name">${biName(c)}</h2>
        <div class="muted small">${bi('ci.parent_panel')}: ${esc(pn.panel_code || '')} ${biName(pn)}</div></div>
      ${wide && c.qr_key ? `<a class="ci-qr" href="#/qr/CIRCUIT/${esc(c.circuit_id)}" aria-label="${esc(biText('btn.view_qr'))}">${qrSvg(APP_BASE_URL + '#/r/' + c.qr_key)}<span class="muted small">QR</span></a>` : ''}</div>
    <div class="kv-grid">
      ${kv('ci.node.source', primary && rootOf(primary) ? `${esc(rootOf(primary).panel_code)} · ${biName(rootOf(primary))}` : (paths[0] ? badge('trace_status.' + paths[0].status) : ''))}
      ${kv('ci.source_panel', pn.panel_id ? `<a href="#/circuits/p/${esc(pn.panel_id)}">${esc(pn.panel_code)}</a> · ${biName(pn)}` : '')}
      ${kv('ci.load_equipment', loads.map((x) => (x.kind === 'EQ' && x.rec ? `<a href="#/equipment/${esc(x.rec.equipment_id)}">${esc(x.rec.equipment_code)}</a> · ${biName(x.rec)}` : (x.rec ? `<a href="#/circuits/p/${esc(x.rec.panel_id)}">${esc(x.rec.panel_code)}</a> · ${biName(x.rec)}` : ''))).filter(Boolean).join('<br>'))}
      ${kv('supply_role.BACKUP', backupRoots.map((r) => `${esc(r.panel_code)} · ${biName(r)}`).join('<br>'))}
      ${kv('field.location', loc ? esc(loc.location_code + ' · ' + nameText(loc)) : '')}
      ${kv('col.status', badge('circuit_status.' + (c.status || 'IN_USE')))}
      ${up ? kv('ci.upstream', `<a href="#/circuits/c/${esc(up.circuit_id)}">${esc(up.circuit_code)}</a> · ${biName(up)} · ${bi('supply_role.' + (c.supply_role || 'PRIMARY'))}`) : ''}
      ${kv('ci.verify', c.verified_at ? `${esc(fmtDate(c.verified_at))}${c.verified_by_name ? ' · ' + esc(c.verified_by_name) : ''}` : bi('ci.unverified'))}
    </div>
    <div class="row">
      <a class="btn small primary" href="#/circuits/trace?circuit=${esc(c.circuit_id)}">${ICON.circuits}<span>${bi('ci.view_trace')}</span></a>
      ${p.edit ? `<a class="btn small" href="#/circuits/c/${esc(c.circuit_id)}/edit" ${navigator.onLine ? '' : 'aria-disabled="true"'}>${ICON.edit}<span>${bi('ci.edit_circuit')}</span></a>` : ''}
      ${p.verify && !c.verified_by ? (c.updated_by === uidMe ? `<span class="muted small">${bi('ci.verify_self')}</span>` : `<button type="button" class="btn small" id="ci-verify" ${navigator.onLine ? '' : 'disabled'}>${ICON.check}<span>${bi('ci.verify')}</span></button>`) : ''}
    </div>
    <p class="muted small ci-safe"><span>${bi('ci.not_isolation')}</span></p>
  </section>
  <div class="tabs-bar" role="tablist">${tabs.map((t) => `<button type="button" role="tab" class="tab${t === tab ? ' on' : ''}" data-tab="${t}" aria-selected="${t === tab}">${bi({ specs: 'tab.specs', loads: 'ci.loads', documents: 'tab.documents', history: 'tab.history' }[t])}</button>`).join('')}</div>
  <section class="card tab-body" id="ci-tab"></section>`;
  const tb = $('#ci-tab', pane);
  const repaint = () => circuitPane(pane, id, ctx);
  $$('[data-tab]', pane).forEach((b) => b.addEventListener('click', () => { tabOf.set(id, b.dataset.tab); repaint(); }));
  const vb = $('#ci-verify', pane);
  if (vb) vb.addEventListener('click', async () => { if (await verifyFlow('CIRCUIT', c, vb)) repaint(); });
  if (tab === 'specs') {
    tb.innerHTML = `<div class="kv-grid">${kv('ci.voltage', numU(c.voltage, 'V'))}${kv('ci.phases', c.phases ? bi('ci.phase_n', { N: c.phases }) : '')}
      ${kv('ci.breaker', breakerText(c))}${kv('ci.protection', esc(c.protection_setting || ''))}${kv('ci.cable', cableText(c))}${kv('ci.length', numU(c.cable_length_m, 'm'))}
      ${kv('ci.route', biName(c, 'route'))}${kv('field.note', biName(c, 'note'))}</div>`;
  } else if (tab === 'loads') {
    tb.innerHTML = `${loads.length ? `<ul class="list">${loads.map((x) => `<li><div><strong>${bi(x.kind === 'EQ' ? 'ci.load_eq' : 'ci.load_panel')}</strong>: ${loadName(x)}
      ${x.load.supply_role === 'BACKUP' ? badge('ci.backup_tag') : ''}</div>
      <div class="muted small">${[x.load.rated_load_kw !== '' && x.load.rated_load_kw !== null && x.load.rated_load_kw !== undefined ? `${bi('ci.rated_kw')}: ${fmtNumber(x.load.rated_load_kw)}\u00A0kW` : '', x.load.note_vi || x.load.note_zh ? biName(x.load, 'note') : ''].filter(Boolean).join(' · ')}</div>
      ${p.edit ? `<div class="row"><button type="button" class="btn tiny" data-ld-edit="${esc(x.load.load_link_id)}" ${navigator.onLine ? '' : 'disabled'}>${ICON.edit}<span>${bi('btn.edit')}</span></button><button type="button" class="btn tiny" data-ld-rm="${esc(x.load.load_link_id)}" ${navigator.onLine ? '' : 'disabled'}>${bi('ci.remove_load')}</button></div>` : ''}</li>`).join('')}</ul>`
      : `<p class="muted">${bi('ci.no_loads')}</p>`}
      ${p.edit ? `<div class="row"><button type="button" class="btn small" id="ld-add" ${navigator.onLine ? '' : 'disabled'}>${ICON.plus}<span>${bi('ci.add_load')}</span></button></div>` : ''}`;
    const ad = $('#ld-add', tb);
    if (ad) ad.addEventListener('click', async () => { if (await loadDialog(g, c, null)) repaint(); });
    $$('[data-ld-edit]', tb).forEach((b) => b.addEventListener('click', async () => { const l = g.loads.find((x) => x.load_link_id === b.dataset.ldEdit); if (await loadDialog(g, c, l)) repaint(); }));
    $$('[data-ld-rm]', tb).forEach((b) => b.addEventListener('click', async () => {
      const l = g.loads.find((x) => x.load_link_id === b.dataset.ldRm);
      const ok = await dialog({ title: bi('ci.remove_load'), body: `<p>${loadName(loads.find((x) => x.load === l))}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('ci.remove_load'), kind: 'danger', value: true }] });
      if (!ok) return;
      const r = await writeOnline('circuit.edit', { entity: 'LOAD', load_link_id: l.load_link_id, remove: true }, { expected_version: l.record_version });
      if (r.ok) { await afterCommit(); repaint(); } else await handleWriteError(r);
    }));
  } else if (tab === 'documents') {
    await showDrawings(tb, 'CIRCUIT', c.circuit_id, p, repaint);
  } else {
    tb.innerHTML = `<div class="kv-grid">${kv('field.created_at', `${esc(fmtDateTime(c.created_at))}${c.created_by_name ? ' · ' + esc(c.created_by_name) : ''}`)}
      ${kv('field.updated_at', `${esc(fmtDateTime(c.updated_at))}${c.updated_by_name ? ' · ' + esc(c.updated_by_name) : ''}`)}
      ${kv('ci.verify', c.verified_at ? `${esc(fmtDateTime(c.verified_at))}${c.verified_by_name ? ' · ' + esc(c.verified_by_name) : ''}` : bi('ci.unverified'))}</div>
      <p class="muted small">${bi('ci.verify_help')}</p>`;
  }
}

/** Xác minh tủ/lộ (C3/C4, PIN, không phải người sửa cuối) */
async function verifyFlow(kind, rec, btn) {
  const ok = await dialog({ title: bi('ci.verify'), body: `<p>${bi('ci.verify_help')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('ci.verify'), kind: 'primary', value: true }] });
  if (!ok) return false;
  busy(btn, true);
  const r = await writeWithPin('circuit.verify', { entity: kind, id: kind === 'PANEL' ? rec.panel_id : rec.circuit_id }, { expected_version: rec.record_version });
  busy(btn, false);
  if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); return true; }
  await handleWriteError(r);
  return false;
}

/** Thêm/sửa phụ tải: thiết bị hoặc tủ nhận nguồn (đúng một), vai trò nguồn, công suất điện */
async function loadDialog(g, c, l) {
  const eqs = (await recs('EQUIPMENT')).filter((e) => !e.archived_at).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const panels = [...g.panels.values()].filter((pn) => pn.panel_id !== c.panel_id && !NO_FEED.has(pn.panel_type)).sort((a, b) => String(a.panel_code).localeCompare(String(b.panel_code)));
  const kind0 = l && l.downstream_panel_id ? 'PANEL' : 'EQ';
  const body = `<div class="segs" id="ld-kind">${['EQ', 'PANEL'].map((k) => `<button type="button" class="seg${k === kind0 ? ' on' : ''}" data-k="${k}">${bi(k === 'EQ' ? 'ci.load_eq' : 'ci.load_panel')}</button>`).join('')}</div>
    <div id="ld-eq"${kind0 === 'EQ' ? '' : ' hidden'}><label for="ld-e">${bi('ci.load_eq')}</label><select id="ld-e" class="inp sel"><option value="">${bi('field.choose')}</option>${eqs.map((e) => `<option value="${esc(e.equipment_id)}"${l && l.equipment_id === e.equipment_id ? ' selected' : ''}${g.panelByEq.has(e.equipment_id) ? ' disabled' : ''}>${esc(e.equipment_code + ' · ' + nameText(e))}</option>`).join('')}</select>
      <p class="muted small">${bi('ci.load_eq_hint')}</p></div>
    <div id="ld-pn"${kind0 === 'PANEL' ? '' : ' hidden'}><label for="ld-p">${bi('ci.load_panel')}</label><select id="ld-p" class="inp sel"><option value="">${bi('field.choose')}</option>${panels.map((pn) => `<option value="${esc(pn.panel_id)}"${l && l.downstream_panel_id === pn.panel_id ? ' selected' : ''}>${esc(pn.panel_code + ' · ' + nameText(pn))}</option>`).join('')}</select></div>
    <label for="ld-r">${bi('ci.supply_role')}</label><select id="ld-r" class="inp sel">${ROLES.map((r) => `<option value="${r}"${(l ? l.supply_role : 'PRIMARY') === r ? ' selected' : ''}>${bi('supply_role.' + r)}</option>`).join('')}</select>
    <label for="ld-kw">${bi('ci.rated_kw')}</label><input id="ld-kw" class="inp num" type="text" inputmode="decimal" value="${l && l.rated_load_kw !== '' && l.rated_load_kw !== null && l.rated_load_kw !== undefined ? esc(fmtNumber(l.rated_load_kw)) : ''}">
    <label for="ld-n">${bi('field.note')}</label><input id="ld-n" class="inp" type="text" maxlength="300" value="${esc(l ? (l.note_vi || l.note_zh || '') : '')}">
    <p class="ferr err" id="ld-err" role="alert"></p>`;
  const wrapPromise = dialog({ title: bi(l ? 'ci.edit_load' : 'ci.add_load'), body, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (w) => ({
    kind: $('#ld-kind .seg.on', w).dataset.k, eq: $('#ld-e', w).value, pn: $('#ld-p', w).value, role: $('#ld-r', w).value, kw: $('#ld-kw', w).value, note: $('#ld-n', w).value.trim() }) }] });
  // Đổi loại phụ tải trong hộp thoại
  setTimeout(() => {
    const w = document.querySelector('.modal');
    if (!w) return;
    $$('#ld-kind .seg', w).forEach((b) => b.addEventListener('click', () => {
      $$('#ld-kind .seg', w).forEach((x) => x.classList.toggle('on', x === b));
      $('#ld-eq', w).hidden = b.dataset.k !== 'EQ';
      $('#ld-pn', w).hidden = b.dataset.k !== 'PANEL';
    }));
  }, 0);
  const v = await wrapPromise;
  if (!v) return false;
  const { parseNumberInput } = await import('../form.js');
  const kw = parseNumberInput(v.kw);
  if (kw.error) { toast(bi('field.invalid'), 'err'); return false; }
  const target = v.kind === 'EQ' ? v.eq : v.pn;
  if (!target) { toast(bi('field.required'), 'err'); return false; }
  const p = { entity: 'LOAD', load_link_id: l ? l.load_link_id : uuid(), circuit_id: c.circuit_id, supply_role: v.role, rated_load_kw: kw.value === null ? '' : kw.value,
    equipment_id: v.kind === 'EQ' ? target : '', downstream_panel_id: v.kind === 'PANEL' ? target : '', ...(v.note ? oneLang('note', v.note) : (l ? { note_vi: '', note_zh: '' } : {})) };
  const r = await writeOnline('circuit.edit', p, { expected_version: l ? l.record_version : 0 });
  if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); return true; }
  await handleWriteError(r);
  return false;
}

/* ======================= Hồ sơ tủ (B2) ======================= */

export async function renderPanel(view, ctx) {
  if (isWide()) return renderCircuitList(view, { ...ctx, params: { pid: ctx.params.id } });
  const pn = await byId('PANEL', ctx.params.id);
  ctx.shell.setScreen({
    title: 'ci.panel_detail', back: '/circuits',
    actions: pn && pn.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/PANEL/${pn.panel_id}`) }] : []
  });
  view.innerHTML = '<div id="ci-pane" class="pane mobile"></div>';
  await panelPane($('#ci-pane', view), ctx.params.id, ctx);
}

async function panelPane(pane, id, ctx) {
  const g = await circuitGraph();
  const pn = g.panels.get(id);
  if (!pn) { pane.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const p = await perms();
  const eq = pn.equipment_id ? await byId('EQUIPMENT', pn.equipment_id) : null;
  const loc = pn.location_id ? await byId('LOCATION', pn.location_id) : null;
  const out = g.circuitsByPanel.get(pn.panel_id) || [];
  const feeds = (g.loadsByPanel.get(pn.panel_id) || []).map((l) => ({ l, c: g.circuits.get(l.circuit_id) })).filter((x) => x.c);
  const uidMe = session.user && session.user.user_id;
  const kv = (k, v) => `<div class="kv"><span>${bi(k)}</span><strong>${v || '—'}</strong></div>`;
  // B2: phiếu sửa chữa, bảo trì của thiết bị nối tủ (ghi trên hồ sơ thiết bị, không thêm cột panel_id)
  let work = '';
  if (eq) {
    const reps = (await recs('REPAIR')).filter((r) => r.equipment_id === eq.equipment_id).sort((a, b) => String(b.reported_at || '').localeCompare(String(a.reported_at || '')));
    const wos = (await recs('WORK_ORDER')).filter((w) => w.equipment_id === eq.equipment_id && WO_OPEN.has(w.status)).sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    const items = [...reps.filter((r) => REPAIR_OPEN.has(r.status)), ...reps.filter((r) => !REPAIR_OPEN.has(r.status)).slice(0, 3)];
    work = `<section class="card"><div class="card-head"><h2>${bi('ci.work_of_panel')}</h2><a class="btn tiny" href="#/equipment/${esc(eq.equipment_id)}">${ICON.equipment}<span>${bi('ci.equipment_link')}</span></a></div>
      ${items.length || wos.length ? `<ul class="list">${items.map((r) => `<li><a href="#/repairs/${esc(r.repair_id)}"><span class="code">${esc(r.repair_code || biText('tag.pending_code'))}</span></a> ${biName(r, 'symptom')} ${statusBadge('REPAIR', r.status)}
          <span class="muted small">${esc(fmtDateTime(r.reported_at))}</span></li>`).join('')}
        ${wos.map((w) => `<li><a href="#/maintenance/wo/${esc(w.work_order_id)}"><span class="code">${esc(w.work_order_code || biText('tag.pending_code'))}</span></a> ${biName(w, 'title')} ${statusBadge('WO', w.status)} <span class="muted small">${esc(fmtDate(w.due_date))}</span></li>`).join('')}</ul>`
        : `<p class="muted">${bi('field.no_records')}</p>`}</section>`;
  }
  pane.innerHTML = `<section class="card ci-detail">
    <div class="ci-detail-head"><span class="ci-ico big">${panelIcon(pn)}</span>
      <div class="grow"><div class="rec-top"><span class="code big">${esc(pn.panel_code)}</span>${verifiedBadge(pn)}</div><h2 class="eq-name">${biName(pn)}</h2>
        <div class="muted small">${bi('panel_type.' + pn.panel_type)}</div></div></div>
    <div class="kv-grid">
      ${kv('ci.equipment_of_panel', eq ? `<a href="#/equipment/${esc(eq.equipment_id)}">${esc(eq.equipment_code)}</a> · ${biName(eq)}` : '')}
      ${kv('field.location', loc ? esc(loc.location_code + ' · ' + nameText(loc)) : '')}
      ${kv('ci.supply_voltage', numU(pn.supply_voltage, 'V'))}${kv('ci.rated_current', numU(pn.rated_current, 'A'))}
      ${kv('col.status', badge('circuit_status.' + (pn.status || 'IN_USE')))}
      ${kv('ci.verify', pn.last_verified_at ? `${esc(fmtDate(pn.last_verified_at))}${pn.verified_by_name ? ' · ' + esc(pn.verified_by_name) : ''}` : bi('ci.unverified'))}
      ${pn.note_vi || pn.note_zh ? kv('field.note', biName(pn, 'note')) : ''}
    </div>
    ${eq ? `<p class="muted small">${bi('ci.panel_eq_hint')}</p>` : ''}
    <div class="row">
      <a class="btn small primary" href="#/circuits/trace?panel=${esc(pn.panel_id)}">${ICON.circuits}<span>${bi('ci.view_trace')}</span></a>
      ${eq ? `<a class="btn small" href="#/equipment/${esc(eq.equipment_id)}">${ICON.equipment}<span>${bi('ci.equipment_link')}</span></a>` : ''}
      ${p.edit ? `<a class="btn small" href="#/circuits/p/${esc(pn.panel_id)}/edit" ${navigator.onLine ? '' : 'aria-disabled="true"'}>${ICON.edit}<span>${bi('ci.edit_panel')}</span></a>
        <a class="btn small" href="#/circuits/c/new?panel=${esc(pn.panel_id)}">${ICON.plus}<span>${bi('ci.add_circuit')}</span></a>` : ''}
      ${p.verify && !pn.verified_by ? (pn.updated_by === uidMe ? `<span class="muted small">${bi('ci.verify_self')}</span>` : `<button type="button" class="btn small" id="pn-verify" ${navigator.onLine ? '' : 'disabled'}>${ICON.check}<span>${bi('ci.verify')}</span></button>`) : ''}
      ${pn.qr_key && isWide() ? `<a class="btn small" href="#/qr/PANEL/${esc(pn.panel_id)}">${ICON.qr}<span>${bi('btn.view_qr')}</span></a>` : ''}
    </div>
    <p class="muted small ci-safe"><span>${bi('ci.not_isolation')}</span></p></section>
  ${work}
  <section class="card"><div class="card-head"><h2>${bi('ci.feeders')}</h2></div>
    ${feeds.length ? `<ul class="list">${feeds.map(({ l, c }) => `<li><a href="#/circuits/c/${esc(c.circuit_id)}"><span class="code">${esc(c.circuit_code)}</span></a> ${biName(c)} · ${esc((g.panels.get(c.panel_id) || {}).panel_code || '')}
      ${l.supply_role === 'BACKUP' ? badge('ci.backup_tag') : ''}</li>`).join('')}</ul>` : `<p class="muted">${bi(SOURCE_TYPES.has(pn.panel_type) ? 'ci.is_source' : 'trace_status.ROOT_NOT_SOURCE')}</p>`}</section>
  <section class="card"><div class="card-head"><h2>${bi('ci.outgoing')}</h2><span class="count">${out.length}</span></div>
    ${out.length ? `<ul class="list">${out.map((c) => `<li><a href="#/circuits/c/${esc(c.circuit_id)}"><span class="code">${esc(c.circuit_code)}</span></a> ${biName(c)} ${badge('circuit_status.' + (c.status || 'IN_USE'))}</li>`).join('')}</ul>` : `<p class="muted">${bi('field.no_records')}</p>`}</section>
  <section class="card"><div class="card-head"><h2>${bi('ci.drawings')}</h2></div><div id="pn-dr"></div></section>`;
  const repaint = () => panelPane(pane, id, ctx);
  const vb = $('#pn-verify', pane);
  if (vb) vb.addEventListener('click', async () => { if (await verifyFlow('PANEL', pn, vb)) repaint(); });
  const dr = $('#pn-dr', pane);
  await showDrawings(dr, 'PANEL', pn.panel_id, p, repaint);
}

/* ======================= Bản vẽ (phiên bản, duyệt) ======================= */

/**
 * Bản vẽ của tủ/lộ: vẽ ngay từ dữ liệu trên máy, rồi (có mạng) hỏi máy chủ `doc.view` — bản người khác vừa tải lên/duyệt mà máy này
 * chưa đồng bộ vẫn hiện để duyệt. Có bản mới hơn thì lưu vào máy và vẽ lại khung bản vẽ.
 */
async function showDrawings(root, type, id, p, repaint) {
  const paint = async () => { root.innerHTML = await drawingsHtml(type, id, p); wireDrawings(root, type, id, repaint); };
  await paint();
  if (!navigator.onLine) return;
  const r = await api('doc.view', { entity_type: type, entity_id: id }).catch(() => null);
  if (!r || !r.ok || !root.isConnected) return;
  const local = await recs('DOCUMENT');
  let changed = false;
  for (const d of (r.data && r.data.items) || []) {
    if (d.kind !== 'DRAWING') continue;
    const cur = local.find((x) => x.document_id === d.document_id);
    if (cur && Number(cur.record_version || 0) >= Number(d.record_version || 0)) continue;
    await upsertLocal('DOCUMENT', d);
    changed = true;
  }
  if (!changed) return;
  invalidate();
  if (root.isConnected) await paint();
}

async function drawingsHtml(type, id, p) {
  const list = (await recs('DOCUMENT')).filter((d) => d.entity_type === type && d.entity_id === id && d.kind === 'DRAWING' && d.active !== false)
    .sort((a, b) => Number(b.file_version || 0) - Number(a.file_version || 0));
  const uidMe = session.user && session.user.user_id;
  const online = navigator.onLine;
  return `${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('field.document_title')}</th><th>${bi('ci.version')}</th><th>${bi('col.status')}</th><th>${bi('field.date')}</th><th></th></tr></thead>
    <tbody>${list.map((d) => { const st = d.approval_status || 'APPROVED'; return `<tr><td>${ICON[d.storage_kind === 'LINK' ? 'link' : 'file']} ${biName(d, 'title')}${d.created_by_name ? `<div class="muted small">${esc(d.created_by_name)}</div>` : ''}</td>
      <td>v${esc(d.file_version || 1)}</td><td>${badge('drawing_status.' + st)}</td><td class="num">${esc(fmtDate(d.document_date || String(d.created_at || '').slice(0, 10)))}</td>
      <td><div class="row">${d.storage_kind === 'LINK' ? `<a class="btn tiny" href="${esc(d.external_url)}" target="_blank" rel="noopener noreferrer">${bi('ci.open_drawing')}</a>`
        : `<button type="button" class="btn tiny" data-dr-dl="${esc(d.document_id)}" ${online ? '' : 'disabled'}>${ICON.download}<span>${bi('ci.open_drawing')}</span></button><button type="button" class="btn tiny primary" data-dr-open="${esc(d.document_id)}" hidden>${bi('btn.open_save')}</button>`}
        ${p.approve && st === 'DRAFT' ? (d.created_by === uidMe ? `<span class="muted small">${bi('ci.drawing_self')}</span>` : `<button type="button" class="btn tiny primary" data-dr-ok="${esc(d.document_id)}" ${online ? '' : 'disabled'}>${bi('btn.approve')}</button><button type="button" class="btn tiny" data-dr-no="${esc(d.document_id)}" ${online ? '' : 'disabled'}>${bi('btn.reject')}</button>`) : ''}</div></td></tr>`; }).join('')}</tbody></table></div>`
    : `<p class="muted">${bi('doc.none')}</p>`}
    ${p.upload ? `<div class="row upload-row"><label class="btn small file${online ? '' : ' disabled'}">${ICON.upload}<span>${bi('ci.drawing_upload')}</span><input type="file" accept="application/pdf,image/jpeg,image/png" data-dr-up="1" hidden ${online ? '' : 'disabled'}></label>
      <button type="button" class="btn small" data-dr-link="1" ${online ? '' : 'disabled'}>${ICON.link}<span>${bi('ci.drawing_link')}</span></button></div>
      <p class="muted small">${bi('ci.drawing_note')}</p>` : ''}
    <div class="up-status muted small" aria-live="polite"></div>`;
}

const titleOf = (t) => (/[㐀-鿿]/.test(t) ? { title_vi: '', title_zh: t } : { title_vi: t, title_zh: '' });

function wireDrawings(root, type, id, repaint) {
  const files = {};
  const up = $('[data-dr-up]', root);
  if (up) up.addEventListener('change', async () => {
    const f = up.files[0];
    up.value = '';
    if (!f) return;
    const title = await dialog({ title: bi('ci.drawing_upload'), body: `<label for="dr-t">${bi('field.document_title')}</label><input id="dr-t" class="inp" type="text" maxlength="200" value="${esc(f.name.replace(/\.[^.]+$/, ''))}"><p class="muted small">${bi('field.one_lang')}</p>`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.upload'), kind: 'primary', read: (w) => $('#dr-t', w).value.trim() }] });
    if (!title) return;
    const st = $('.up-status', root);
    st.innerHTML = bi('doc.uploading');
    const mime = f.type === 'image/jpg' ? 'image/jpeg' : f.type;
    const r = await uploadDoc({ action: 'circuit.drawing.upload', entity_type: type, entity_id: id, kind: 'DRAWING', blob: f, mime, ...titleOf(title) });
    st.innerHTML = '';
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else toast(r.message ? esc(r.message) : esc(resMsg(r)), 'err');
  });
  const lk = $('[data-dr-link]', root);
  if (lk) lk.addEventListener('click', async () => {
    const v = await dialog({ title: bi('ci.drawing_link'), body: `<label for="dr-t">${bi('field.document_title')}</label><input id="dr-t" class="inp" type="text" maxlength="200">
      <label for="dr-u">${bi('field.external_url')}</label><input id="dr-u" class="inp" type="url" inputmode="url" placeholder="https://…">`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (w) => ({ t: $('#dr-t', w).value.trim(), u: $('#dr-u', w).value.trim() }) }] });
    if (!v) return;
    if (!v.t || !/^https:\/\//.test(v.u)) { toast(bi(!v.t ? 'field.one_lang' : 'field.invalid'), 'err'); return; }
    const r = await writeOnline('circuit.drawing.upload', { document_id: uuid(), entity_type: type, entity_id: id, kind: 'DRAWING', external_url: v.u, ...titleOf(v.t) });
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(r);
  });
  $$('[data-dr-dl]', root).forEach((b) => b.addEventListener('click', async () => {
    busy(b, true);
    const d = await downloadDoc(b.dataset.drDl);
    busy(b, false);
    if (!d.ok) { toast(esc(resMsg(d.res)), 'err'); return; }
    files[b.dataset.drDl] = d.file;
    const o = $(`[data-dr-open="${CSS.escape(b.dataset.drDl)}"]`, root);
    if (o && isTouchMobile()) { o.hidden = false; o.focus(); } else shareFileNow(d.file);
  }));
  $$('[data-dr-open]', root).forEach((b) => b.addEventListener('click', () => { const f = files[b.dataset.drOpen]; if (f) shareFileNow(f); }));
  $$('[data-dr-ok],[data-dr-no]', root).forEach((b) => b.addEventListener('click', async () => {
    const ok = !!b.dataset.drOk;
    const docId = b.dataset.drOk || b.dataset.drNo;
    const d = (await recs('DOCUMENT')).find((x) => x.document_id === docId);
    let reason = '';
    if (!ok) {
      reason = await dialog({ title: bi('btn.reject'), body: `<label for="dr-r">${bi('field.reason')}</label><textarea id="dr-r" class="inp" rows="3" maxlength="300"></textarea>`,
        actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.reject'), kind: 'danger', read: (w) => $('#dr-r', w).value.trim() }] });
      if (reason === null) return;
      if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    }
    busy(b, true);
    const r = await writeWithPin('circuit.drawing.approve', { document_id: docId, decision: ok ? 'APPROVE' : 'REJECT', reason }, { expected_version: d ? d.record_version : 0 });
    busy(b, false);
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(r);
  }));
}

/* ======================= CI-03 Đường cấp điện ======================= */

export async function renderTrace(view, ctx) {
  const { shell, query } = ctx;
  const g = await circuitGraph();
  const eqId = query.get('equipment'), pnId = query.get('panel'), cId = query.get('circuit');
  const role = ['PRIMARY', 'BACKUP', 'ALL'].includes(query.get('role')) ? query.get('role') : 'ALL';
  const start = eqId ? 'E:' + eqId : (pnId ? 'P:' + pnId : (cId ? 'C:' + cId : ''));
  const backTo = cId ? `/circuits/c/${cId}` : (pnId ? `/circuits/p/${pnId}` : (eqId ? `/equipment/${eqId}` : '/circuits'));
  shell.setScreen({ title: 'ci.trace', back: backTo });
  const eqs = await mapOf('EQUIPMENT');
  const node = (k) => {
    const t = k[0], id = k.slice(2);
    if (t === 'E') { const e = eqs.get(id); return { kind: 'load', icon: ICON.load, label: 'ci.node.load', code: e ? e.equipment_code : '', name: e ? biName(e) : '', href: `/equipment/${id}` }; }
    if (t === 'P') { const p = g.panels.get(id) || {}; const src = SOURCE_TYPES.has(p.panel_type) && p.panel_type !== 'MAIN_SWITCHBOARD'; return { kind: src ? 'source' : 'panel', icon: panelIcon(p), label: src ? 'ci.node.source' : 'ci.node.panel', code: p.panel_code || '', name: biName(p), sub: p.panel_type ? bi('panel_type.' + p.panel_type) : '', href: `/circuits/p/${id}` }; }
    const c = g.circuits.get(id) || {};
    return { kind: 'circuit', icon: ICON.circuits, label: 'ci.node.circuit', code: c.circuit_code || '', name: biName(c), href: `/circuits/c/${id}` };
  };
  const startNode = start ? node(start) : null;
  if (!start || !startNode.code) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const paths = tracePaths(g, start, role);
  const chip = (r) => `<a class="chip${r === role ? ' on' : ''}" href="#/circuits/trace?${new URLSearchParams({ ...Object.fromEntries(query), role: r })}">${bi(r === 'ALL' ? 'due_filter.ALL' : 'supply_role.' + r)}</a>`;
  // Tài liệu liên quan: bản vẽ đã duyệt (và bản chờ duyệt mình thấy) của các tủ/lộ trên đường
  const keys = new Set(paths.flatMap((x) => x.keys));
  const docs = (await recs('DOCUMENT')).filter((d) => d.kind === 'DRAWING' && d.active !== false && d.approval_status !== 'SUPERSEDED' && d.approval_status !== 'REJECTED' &&
    ((d.entity_type === 'PANEL' && keys.has('P:' + d.entity_id)) || (d.entity_type === 'CIRCUIT' && keys.has('C:' + d.entity_id))));
  view.innerHTML = `<section class="card"><div class="card-head"><h2>${bi('ci.trace')} ${esc(startNode.code)}</h2></div>
      <div class="muted small">${startNode.name}</div><div class="chips">${['ALL', 'PRIMARY', 'BACKUP'].map(chip).join('')}</div></section>
    ${paths.length ? paths.map((x, i) => {
      const seq = x.keys.slice().reverse();
      const roles = x.roles.slice().reverse();
      return `<section class="card ci-path"><div class="card-head"><h3>${paths.length > 1 ? bi('ci.path_n', { N: i + 1 }) : bi('ci.trace')}</h3>${badge('trace_status.' + x.status)}${x.roles.includes('BACKUP') ? ' ' + badge('ci.backup_tag') : ''}</div>
        <ol class="ci-chain">${seq.map((k, j) => { const n = node(k); return `<li class="ci-node k-${n.kind}"><a href="#${esc(n.href)}"><span class="ci-ico">${n.icon}</span>
            <span class="ci-nlabel">${bi(n.label)}</span><span class="ci-text"><span class="code">${esc(n.code)}</span><span class="small">${n.name}</span>${n.sub ? `<span class="muted small">${n.sub}</span>` : ''}</span></a></li>
            ${j < seq.length - 1 ? `<li class="ci-arrow" aria-hidden="true">↓${roles[j] === 'BACKUP' ? ` <span class="badge t-amber">${bi('ci.backup_tag')}</span>` : ''}</li>` : ''}`; }).join('')}</ol></section>`;
    }).join('') : `<div class="card"><p class="muted">${bi('ci.no_paths')}</p></div>`}
    <section class="card"><div class="card-head"><h2>${bi('ci.related_docs')}</h2></div>
      ${docs.length ? `<ul class="list docs">${docs.map((d) => `<li><div class="doc-line">${ICON[d.storage_kind === 'LINK' ? 'link' : 'file']}<div class="doc-main"><strong>${biName(d, 'title')}</strong>
        <div class="muted small">${bi('ci.version_n', { N: d.file_version || 1 })} · ${esc(fmtDate(d.document_date || String(d.updated_at || '').slice(0, 10)))}</div></div>${badge('drawing_status.' + (d.approval_status || 'APPROVED'))}</div>
        <div class="row">${d.storage_kind === 'LINK' ? `<a class="btn tiny" href="${esc(d.external_url)}" target="_blank" rel="noopener noreferrer">${ICON.eye}<span>${bi('ci.open_drawing')}</span></a>`
          : `<button type="button" class="btn tiny" data-dr-dl="${esc(d.document_id)}" ${navigator.onLine ? '' : 'disabled'}>${ICON.eye}<span>${bi('ci.open_drawing')}</span></button><button type="button" class="btn tiny primary" data-dr-open="${esc(d.document_id)}" hidden>${bi('btn.open_save')}</button>`}</div></li>`).join('')}</ul>`
        : `<p class="muted">${bi('doc.none')}</p>`}
      <div class="row">${await reportLink('RPT_CIRCUITS', pnId ? { panel_id: pnId } : {})}</div></section>
    <p class="muted small ci-safe"><span>${bi('ci.not_isolation')}</span></p>`;
  wireDrawings(view, '', '', () => renderTrace(view, ctx));
}

/* ======================= Thêm/sửa tủ, lộ ======================= */

export async function renderPanelForm(view, ctx) {
  const { shell, params } = ctx;
  const id = params.id || '';
  shell.setScreen({ title: id ? 'ci.edit_panel' : 'ci.add_panel', back: id ? `/circuits/p/${id}` : '/circuits' });
  if (!(await can('circuit.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  const g = await circuitGraph();
  const pn = id ? g.panels.get(id) : null;
  if (id && !pn) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const eqs = (await recs('EQUIPMENT')).filter((e) => !e.archived_at).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  const locOpts = await locOptions();
  view.innerHTML = `<form class="card form-card" novalidate><div class="form-grid">
    ${bilingualInputs('name', pn, { required: true })}
    ${textInput('panel_code', 'ci.panel_code', pn ? pn.panel_code : '', { maxlength: 32, upper: true, hint: pn ? '' : bi('ut.code_hint') })}
    ${selectInput('panel_type', 'ci.panel_type', PANEL_TYPES.map((t) => [t, bi('panel_type.' + t)]), pn ? pn.panel_type : 'DISTRIBUTION_BOARD', { required: true, empty: '' })}
    ${selectInput('equipment_id', 'ci.equipment_of_panel', eqs.map((e) => [e.equipment_id, `${esc(e.equipment_code)} · ${esc(nameText(e))}`]), pn ? pn.equipment_id : '', { hint: bi('ci.panel_eq_hint'), empty: 'ci.equipment_none' })}
    ${selectInput('location_id', 'field.location', locOpts, pn ? pn.location_id : '', { hint: bi('ci.location_hint') })}
    ${numberInput('supply_voltage', 'ci.supply_voltage', pn ? pn.supply_voltage : '')}
    ${numberInput('rated_current', 'ci.rated_current', pn ? pn.rated_current : '')}
    ${selectInput('status', 'col.status', STATUSES.map((s) => [s, bi('circuit_status.' + s)]), pn ? pn.status : 'IN_USE', { empty: '' })}
    ${bilingualInputs('note', pn, { required: false, labelKey: 'field.note', area: true, maxlength: 500 })}
  </div><p class="form-err err" role="alert"></p>
  <div class="row form-actions">${pn ? `<button type="button" class="btn" id="pn-arch">${ICON.archive}<span>${bi('btn.archive')}</span></button>` : ''}<button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div></form>`;
  const form = $('form', view);
  wireForm(form);
  const syncLoc = () => { const has = !!$('#f-equipment_id', form).value; $('#f-location_id', form).disabled = has; };
  $('#f-equipment_id', form).addEventListener('change', syncLoc);
  syncLoc();
  $('#fm-cancel', form).addEventListener('click', () => back(id ? `/circuits/p/${id}` : '/circuits'));
  const arch = $('#pn-arch', form);
  if (arch) arch.addEventListener('click', async () => {
    const ok = await dialog({ title: bi('btn.archive'), body: `<p>${biName(pn)}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.archive'), kind: 'danger', value: true }] });
    if (!ok) return;
    const r = await writeOnline('circuit.edit', { entity: 'PANEL', panel_id: pn.panel_id, archive: true }, { expected_version: pn.record_version });
    if (r.ok) { await afterCommit(); navigate('/circuits', { replace: true }); return; }
    await handleWriteError(r);
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const amb = unconfirmedAmbiguous(form);
    if (amb) { amb.focus(); return; }
    const val = (k) => readField(form, k);
    const p = { entity: 'PANEL', panel_id: id || uuid(), name_vi: val('name_vi'), name_zh: val('name_zh'), panel_type: val('panel_type'), equipment_id: val('equipment_id'),
      supply_voltage: val('supply_voltage'), rated_current: val('rated_current'), status: val('status'), note_vi: val('note_vi'), note_zh: val('note_zh') };
    if (!p.equipment_id) p.location_id = val('location_id');
    const code = val('panel_code');
    if (code && (!pn || code !== pn.panel_code)) p.panel_code = code;
    const bad = ['supply_voltage', 'rated_current'].filter((k) => Number.isNaN(p[k]));
    if (bad.length) { showErrors(form, bad.map((f) => ({ field: f, key: 'field.invalid' }))); return; }
    ['supply_voltage', 'rated_current'].forEach((k) => { if (p[k] === null) p[k] = ''; });
    const btn = $('#fm-save', form);
    busy(btn, true);
    const r = await writeOnline('circuit.edit', p, { expected_version: pn ? pn.record_version : 0 });
    busy(btn, false);
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); navigate(`/circuits/p/${p.panel_id}`, { replace: true }); return; }
    if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; }
    await handleWriteError(r);
  });
}

export async function renderCircuitForm(view, ctx) {
  const { shell, params, query } = ctx;
  const id = params.id || '';
  shell.setScreen({ title: id ? 'ci.edit_circuit' : 'ci.add_circuit', back: id ? `/circuits/c/${id}` : '/circuits' });
  if (!(await can('circuit.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  const g = await circuitGraph();
  const c = id ? g.circuits.get(id) : null;
  if (id && !c) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const panels = [...g.panels.values()].sort((a, b) => String(a.panel_code).localeCompare(String(b.panel_code)));
  const panel0 = c ? c.panel_id : (query.get('panel') || '');
  const upOpts = [...g.circuits.values()].filter((x) => x.circuit_id !== id).sort((a, b) => String(a.circuit_code).localeCompare(String(b.circuit_code)))
    .map((x) => [x.circuit_id, `${esc(x.circuit_code)} · ${esc(nameText(x))} (${esc((g.panels.get(x.panel_id) || {}).panel_code || '')})`]);
  view.innerHTML = `<form class="card form-card" novalidate><div class="form-grid">
    ${bilingualInputs('name', c, { required: true })}
    ${textInput('circuit_code', 'ci.circuit_code', c ? c.circuit_code : '', { maxlength: 32, upper: true, hint: c ? '' : bi('ut.code_hint') })}
    ${selectInput('panel_id', 'ci.parent_panel', panels.map((pn) => [pn.panel_id, `${esc(pn.panel_code)} · ${esc(nameText(pn))}`]), panel0, { required: true })}
    ${selectInput('upstream_circuit_id', 'ci.upstream', upOpts, c ? c.upstream_circuit_id : '', { empty: 'ci.upstream_none' })}
    ${selectInput('supply_role', 'ci.supply_role', ROLES.map((r) => [r, bi('supply_role.' + r)]), c ? c.supply_role : 'PRIMARY', { empty: '' })}
    ${selectInput('phases', 'ci.phases', [1, 2, 3].map((n) => [n, bi('ci.phase_n', { N: n })]), c ? c.phases : 3, { empty: 'field.choose' })}
    ${numberInput('voltage', 'ci.voltage', c ? c.voltage : '')}
    ${textInput('breaker_model', 'ci.breaker_model', c ? c.breaker_model : '', { maxlength: 120 })}
    ${numberInput('breaker_rating_a', 'ci.breaker_rating', c ? c.breaker_rating_a : '')}
    ${textInput('protection_setting', 'ci.protection', c ? c.protection_setting : '', { maxlength: 120 })}
    ${textInput('cable_type', 'ci.cable_type', c ? c.cable_type : '', { maxlength: 120 })}
    ${textInput('cable_section_mm2', 'ci.cable_section', c ? c.cable_section_mm2 : '', { maxlength: 60 })}
    ${numberInput('cable_length_m', 'ci.length', c ? c.cable_length_m : '')}
    ${selectInput('status', 'col.status', STATUSES.map((s) => [s, bi('circuit_status.' + s)]), c ? c.status : 'IN_USE', { empty: '' })}
    ${bilingualInputs('route', c, { required: false, labelKey: 'ci.route', area: true, maxlength: 500 })}
    ${bilingualInputs('note', c, { required: false, labelKey: 'field.note', area: true, maxlength: 500 })}
  </div><p class="form-err err" role="alert"></p>
  <div class="row form-actions">${c ? `<button type="button" class="btn" id="ci-arch">${ICON.archive}<span>${bi('btn.archive')}</span></button>` : ''}<button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div></form>`;
  const form = $('form', view);
  wireForm(form);
  const syncRole = () => { $('[data-field="supply_role"]', form).hidden = !$('#f-upstream_circuit_id', form).value; };
  $('#f-upstream_circuit_id', form).addEventListener('change', syncRole);
  syncRole();
  $('#fm-cancel', form).addEventListener('click', () => back(id ? `/circuits/c/${id}` : '/circuits'));
  const arch = $('#ci-arch', form);
  if (arch) arch.addEventListener('click', async () => {
    const ok = await dialog({ title: bi('btn.archive'), body: `<p>${biName(c)}</p><p class="muted small">${bi('ci.archive_loads')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.archive'), kind: 'danger', value: true }] });
    if (!ok) return;
    const r = await writeOnline('circuit.edit', { entity: 'CIRCUIT', circuit_id: c.circuit_id, archive: true }, { expected_version: c.record_version });
    if (r.ok) { await afterCommit(); navigate('/circuits', { replace: true }); return; }
    await handleWriteError(r);
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const amb = unconfirmedAmbiguous(form);
    if (amb) { amb.focus(); return; }
    const val = (k) => readField(form, k);
    const p = { entity: 'CIRCUIT', circuit_id: id || uuid(), name_vi: val('name_vi'), name_zh: val('name_zh'), panel_id: val('panel_id'), upstream_circuit_id: val('upstream_circuit_id'),
      supply_role: val('upstream_circuit_id') ? val('supply_role') : 'PRIMARY', phases: val('phases'), voltage: val('voltage'), breaker_model: val('breaker_model'),
      breaker_rating_a: val('breaker_rating_a'), protection_setting: val('protection_setting'), cable_type: val('cable_type'), cable_section_mm2: val('cable_section_mm2'),
      cable_length_m: val('cable_length_m'), status: val('status'), route_vi: val('route_vi'), route_zh: val('route_zh'), note_vi: val('note_vi'), note_zh: val('note_zh') };
    const code = val('circuit_code');
    if (code && (!c || code !== c.circuit_code)) p.circuit_code = code;
    const errs = [];
    if (!p.panel_id) errs.push({ field: 'panel_id', key: 'field.required' });
    ['voltage', 'breaker_rating_a', 'cable_length_m'].forEach((k) => { if (Number.isNaN(p[k])) errs.push({ field: k, key: 'field.invalid' }); else if (p[k] === null) p[k] = ''; });
    if (errs.length) { showErrors(form, errs); return; }
    const btn = $('#fm-save', form);
    busy(btn, true);
    const r = await writeOnline('circuit.edit', p, { expected_version: c ? c.record_version : 0 });
    busy(btn, false);
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); navigate(`/circuits/c/${p.circuit_id}`, { replace: true }); return; }
    if (r.code === 'VALIDATION_ERROR') {
      if ((r.errors || []).some((e) => e.code === 'CIRCUIT_LOOP')) toast(bi('ci.loop_hint'), 'err');
      showErrors(form, r.errors);
      return;
    }
    await handleWriteError(r);
  });
}

/** Lối từ hồ sơ thiết bị (B2): tủ của thiết bị, hoặc đường cấp của thiết bị là phụ tải */
export async function equipmentCircuitLinks(eqId) {
  const g = await circuitGraph();
  const pn = g.panelByEq.get(eqId);
  const isLoad = (g.loadsByEq.get(eqId) || []).length > 0;
  if (!pn && !isLoad) return '';
  return `${pn ? `<a class="btn small" href="#/circuits/p/${esc(pn.panel_id)}">${ICON.circuits}<span>${bi('ci.circuits_link')} · ${esc(pn.panel_code)}</span></a>` : ''}
    <a class="btn small" href="#/circuits/trace?equipment=${esc(eqId)}">${ICON.circuits}<span>${bi('ci.view_trace')}</span></a>`;
}

export { evBtn, api };
