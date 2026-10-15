// Điện nước (Đợt 3): UT-01 tổng hợp kỳ (iPhone) / WEB-UT-01; UT-02 đồng hồ (danh sách, hồ sơ); UT-03 nhập chỉ số (cả offline,
// ảnh đồng hồ); sự kiện thay/reset/đổi hệ số (chờ duyệt); sửa/hủy chỉ số; biểu giá (quyền giá). 1.4 §5.5, phụ lục 3.12, 4.4.6, 6.9.2.
// Tổng hợp kỳ tính ở máy chủ (cần mạng); không mạng: xem bản đã tải gần nhất, vẫn nhập chỉ số được (gửi khi có mạng).
import { bi, biText, esc, api, fmtDate, fmtDateTime, fmtNumber, badge, biName, nameText, uuid, isoNowVN, resMsg, session, blobToB64, b64ToBytes, L } from '../core.js';
import { ICON, toast, toTop, dialog, $, $$ } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, byId, mapOf, can, today, addDays, daysBetween } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit } from '../app.js';
import { getMeta, setMeta, enqueue } from '../sync.js';
import {
  textInput, selectInput, numberInput, dateInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, writeWithPin, oneLang, busy, evBtn,
  loadFormDraft, saveFormDraft, clearFormDraft, unconfirmedAmbiguous, parseNumberInput, fieldWrap
} from '../form.js';
import { processPhoto, uploadDoc } from '../media.js';
import { photoSrc } from './docs.js';
import { handleWriteError } from './equipment.js';
import { excelLink } from '../excel-link.js';
import { reportLink } from '../report-link.js';
import { myQueue, workerPick } from '../work.js';
import { columnChartHtml, wireCharts } from '../chart.js';
import {
  UTILITY_TYPES, UNIT, TONE, PERIOD_TYPES, READ_CYCLES, periodOf, prevPeriod, nextPeriod, periodsBack, readingDue, lastValidBefore, useOf,
  windowHours, nextBoundary, nowMs
} from '../meters.js';

const PAGE = 20;
const MAX_PHOTOS = 3;
const F = { period: 'DAY_5', date: '', from: '', to: '', loc: '', cycle: '', page: 0 };
const ML = { q: '', type: '', loc: '' };
/** Tab đang xem của từng đồng hồ (đổi tab vẽ lại tại chỗ, không nhảy lên đầu trang); hồ sơ đầy đủ tải gần nhất (30 giây) */
const meterTab = new Map();
let fullCache = { id: '', at: 0, data: null };
const icoOf = (t) => ICON[t === 'WATER' ? 'drop' : 'bolt'];
const toLocalInput = (iso) => (iso ? String(iso).slice(0, 16) : '');
const fromLocalInput = (v) => (v ? `${v}:00+07:00` : '');
const qty = (v, unit) => (v === null || v === undefined || v === '' ? '—' : `${fmtNumber(v)}\u00A0${esc(unit || '')}`);
const shortDT = (iso) => { const s = fmtDateTime(iso); return s ? s.slice(0, 5) + s.slice(10) : ''; };

/* ======================= Dữ liệu trên máy ======================= */

/** Đồng hồ, chỉ số (máy chủ + chờ gửi của tôi), giai đoạn, sự kiện */
async function localData() {
  const ops = await myQueue();
  const meters = (await recs('METER')).filter((m) => !m.archived_at)
    .sort((a, b) => String(a.utility_type).localeCompare(String(b.utility_type)) || String(a.meter_code).localeCompare(String(b.meter_code)));
  const byMeter = new Map();
  const add = (r) => { if (!byMeter.has(r.meter_id)) byMeter.set(r.meter_id, []); byMeter.get(r.meter_id).push(r); };
  (await recs('METER_READING')).forEach((r) => { if (!r.archived_at) add(r); });
  ops.filter((o) => o.action === 'reading.create' && o.state !== 'REJECTED' && o.state !== 'CONFLICT')
    .forEach((o) => add({ ...o.payload, status: 'VALID', reading_kind: 'REGULAR', _local: true, reading_user_id: o.user_id }));
  for (const list of byMeter.values()) list.sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)));
  const segsBy = new Map();
  (await recs('METER_SEGMENT')).forEach((s) => { if (!segsBy.has(s.meter_id)) segsBy.set(s.meter_id, []); segsBy.get(s.meter_id).push(s); });
  for (const list of segsBy.values()) list.sort((a, b) => Number(a.seq_no) - Number(b.seq_no));
  const events = await recs('METER_EVENT');
  return { ops, meters, byMeter, segsBy, events };
}

/** Hệ số đang dùng: giai đoạn hiện tại, không có thì hệ số ban đầu của đồng hồ */
function curMultiplier(m, segs) {
  const s = segs && segs.length ? segs[segs.length - 1] : null;
  return s && s.multiplier !== '' && s.multiplier !== null && s.multiplier !== undefined ? Number(s.multiplier) : Number(m.multiplier || 1);
}

async function locOptions() {
  const locs = await mapOf('LOCATION');
  return [...locs.values()].filter((l) => l.active !== false).sort((a, b) => String(a.location_code).localeCompare(String(b.location_code)))
    .map((l) => [l.location_id, `${esc(l.location_code)} · ${esc(nameText(l))}`]);
}

function dueBadge(d) {
  if (!d) return '';
  if (d.state === 'DONE') return badge('ut.read_done');
  if (d.state === 'MISSED') return badge('ut.read_missed');
  return badge('ut.due_read');
}

/** Nhắc mốc đọc: còn trong cửa sổ → "Đọc trong khoảng A – B"; quá cửa sổ → mốc kế tiếp (không hiện khoảng giờ đã qua).
 *  withState = false khi trạng thái đã có nhãn riêng ngay trên (trang đồng hồ) */
function dueHint(d, m, withState = true) {
  if (!d || d.state === 'DONE') return '';
  if (d.first) return bi('ut.baseline_note');
  if (d.state === 'MISSED' && m) return `${withState ? bi('ut.read_missed') + ' · ' : ''}${bi('ut.next_boundary')}: ${esc(fmtDate(nextBoundary(m, today())))}`;
  return bi('ut.due_until', { A: fmtDateTime(new Date(d.from).toISOString()), B: fmtDateTime(new Date(d.to).toISOString()) });
}

/* ======================= Tổng hợp kỳ (máy chủ) ======================= */

function summaryFilter() {
  const f = { period_type: F.period };
  if (F.period === 'CUSTOM') { f.from = F.from || today(); f.to = F.to || f.from; } else f.date = F.date || today();
  if (F.loc) f.location_id = F.loc;
  return f;
}

/** Có mạng: hỏi máy chủ, lưu bản gần nhất; không mạng: bản đã lưu (cùng bộ lọc hoặc bản cuối) */
async function loadSummary(f) {
  const key = JSON.stringify(f);
  if (navigator.onLine) {
    const r = await api('utility.view', { summary: f }, { retry: true });
    if (r.ok) { await setMeta('ut:summary', { key, at: isoNowVN(), data: r.data }).catch(() => {}); return { data: r.data, at: null }; }
    if (r.code !== 'NETWORK_ERROR') return { error: r };
  }
  const c = await getMeta('ut:summary');
  return c ? { data: c.data, at: c.at, offline: true, other: c.key !== key } : { offline: true, data: null };
}

/** Nhãn kỳ ngắn (trục) và đầy đủ (chú giải, bảng) */
function periodLabel(type, a, b) {
  if (type === 'MONTH') return { label: a.slice(5, 7) + '/' + a.slice(0, 4), title: fmtDate(a) + ' – ' + fmtDate(b) };
  if (type === 'DAY_1') return { label: a.slice(8, 10) + '/' + a.slice(5, 7), title: fmtDate(a) };
  return { label: a.slice(8, 10) + '/' + a.slice(5, 7), title: fmtDate(a) + ' – ' + fmtDate(b) };
}

/** Điểm biểu đồ của một loại từ chart.line của máy chủ */
export function chartPoints(line, type, periodType) {
  return (line || []).map((p) => {
    const t = (p.totals || {})[type];
    const lab = periodLabel(periodType, p.period_start, p.period_end);
    if (!t) return { ...lab, value: null, state: 'none' };
    // Chưa đồng hồ nào đủ số trong kỳ: không vẽ cột (không để cột sát đáy bị đọc nhầm là 0), chú giải/bảng ghi lý do
    const state = t.open ? 'open' : (t.partial ? 'partial' : (t.ok === 0 ? 'none' : 'ok'));
    return { ...lab, value: state === 'none' || t.ok === 0 ? null : t.consumption, state };
  });
}
export const chartStateKey = (p) => ({ partial: 'ut.partial', open: 'utility_status.OPEN_PERIOD', none: 'utility_status.NO_READING' }[p.state] || '');

/** Ô số tổng của một loại (stat tile: nhãn · giá trị · thiếu dữ liệu · chi phí · kỳ trước); chưa đồng hồ nào đủ số → "—", không báo 0 */
function kpiHtml(type, t, prevT, costVisible, okN) {
  const cost = costVisible && t.cost ? Object.entries(t.cost).map(([cur, v]) => `${fmtNumber(v, cur === 'VND' ? 0 : 2)}\u00A0${esc(cur)}`).join(' · ') : '';
  return `<div class="kpi tone-${TONE[type]}"><span class="kpi-ico">${icoOf(type)}</span><div class="kpi-main">
    <div class="kpi-label">${bi(type === 'WATER' ? 'ut.water_total' : 'ut.elec_total')}</div>
    <div class="kpi-value">${okN ? fmtNumber(t.consumption) : '—'}<small>\u00A0${esc(t.unit || UNIT[type])}</small></div>
    ${t.partial ? `<div>${badge('ut.partial')}</div>` : ''}
    ${t.open ? `<div class="muted small">${bi('ut.open_n', { N: t.open })}</div>` : ''}
    ${cost ? `<div class="muted small">${bi('ut.cost')}: <strong>${cost}</strong>${t.cost_missing ? ` · ${bi('ut.cost_missing')}` : ''}</div>` : ''}
    ${prevT && !prevT.partial && !prevT.open && prevT.ok ? `<div class="muted small">${bi('ut.prev_total', { V: fmtNumber(prevT.consumption) + '\u00A0' + (t.unit || UNIT[type]) })}</div>` : ''}
  </div></div>`;
}

/* ======================= UT-01 / WEB-UT-01 ======================= */

export async function renderUtilities(view, ctx) {
  const { shell } = ctx;
  const wide = isWide();
  const canRead = await can('reading.create');
  const canTariff = await can('tariff.view');
  const canPrint = await can('qr.print');
  if (!F.date) F.date = today();
  shell.setScreen({
    title: 'module.utilities', back: '/',
    actions: !wide && canRead ? [{ icon: 'plus', label: biText('ut.read'), onClick: () => navigate('/utilities/meters?read=1') }] : []
  });
  const f = summaryFilter();
  const [a, b] = F.period === 'CUSTOM' ? [f.from, f.to] : periodOf(F.period, f.date);
  const res = await loadSummary(f);
  const ld = await localData();
  const mById = new Map(ld.meters.map((m) => [m.meter_id, m]));
  const locOpts = await locOptions();
  const excel = await excelLink('meters');
  const rpt = await reportLink('RPT_UTILITIES', F.period === 'CUSTOM' ? { period_type: 'CUSTOM', from: f.from, to: f.to } : { period_type: F.period, date: f.date });
  const seg = (k, cur, pref) => `<button type="button" class="seg${cur === k ? ' on' : ''}" data-${pref}="${k}" aria-pressed="${cur === k}">${bi('period.' + k)}</button>`;
  const filters = `<section class="card ut-filters">
    <div class="ut-frow">${fieldWrap('ut-loc', 'field.location', `<select class="inp sel" id="f-ut-loc"><option value="">${bi('due_filter.ALL')}</option>${locOpts.map(([v, t]) => `<option value="${esc(v)}"${v === F.loc ? ' selected' : ''}>${t}</option>`).join('')}</select>`)}</div>
    ${wide ? `<div class="ut-frow"><div class="ut-flabel">${bi('ut.cycle_input')}</div><div class="segs">${READ_CYCLES.filter((c) => c !== 'CUSTOM').concat(['CUSTOM']).map((k) => seg(k, F.cycle, 'cycle')).join('')}</div></div>` : ''}
    <div class="ut-frow"><div class="ut-flabel">${bi(wide ? 'ut.period_view' : 'rpt.period')}</div><div class="segs">${PERIOD_TYPES.map((k) => seg(k, F.period, 'period')).join('')}</div></div>
    <div class="ut-frow ut-range">
      ${F.period === 'CUSTOM'
        ? `${dateInput('ut-from', 'ut.from', f.from)}${dateInput('ut-to', 'ut.to', f.to)}<button type="button" class="btn small" id="ut-apply">${bi('btn.view')}</button>`
        : `<button type="button" class="icon-btn" id="ut-prev" aria-label="${esc(biText('ut.prev_period'))}">${ICON.back}</button>
           <span class="ut-range-text">${ICON.calendar}<strong>${esc(fmtDate(a))} – ${esc(fmtDate(b))}</strong></span>
           <button type="button" class="icon-btn flip" id="ut-next" aria-label="${esc(biText('ut.next_period'))}">${ICON.back}</button>`}
    </div></section>`;
  const tools = `<div class="row tools">
    ${wide && canRead ? `<a class="btn small primary" href="#/utilities/meters?read=1">${ICON.plus}<span>${bi('ut.read')}</span></a>` : ''}
    <a class="btn small" href="#/utilities/meters">${ICON.utilities}<span>${bi('ut.meters')}</span></a>
    ${canTariff ? `<a class="btn small" href="#/utilities/tariffs">${bi('ut.tariffs')}</a>` : ''}
    ${excel}${rpt}</div>`;
  let body = '';
  if (res.error) body = `<div class="card"><p class="banner warn">${esc(resMsg(res.error))}</p></div>`;
  else if (!res.data) body = `<div class="card"><p class="banner info">${bi('ut.summary_offline', { T: '—' })}</p></div>`;
  else {
    const d = res.data;
    const types = UTILITY_TYPES.filter((t) => d.totals[t]);
    const prevLine = (d.chart && d.chart.line) || [];
    const prevOf = (t) => (prevLine.length > 1 ? (prevLine[prevLine.length - 2].totals || {})[t] : null);
    const missing = d.rows.filter((r) => r.in_total && r.status !== 'OK' && r.status !== 'OPEN_PERIOD' && r.status !== 'NO_READING');
    const missingN = d.rows.filter((r) => r.status === 'MISSING_READING' || r.status === 'NEEDS_REVIEW').length;
    const banner = res.offline ? `<p class="banner info">${bi('ut.summary_offline_period', { T: fmtDateTime(res.at), A: fmtDate(d.period_start), B: fmtDate(d.period_end) })}</p>` : '';
    const okOf = (t) => d.rows.filter((r) => r.utility_type === t && r.in_total && r.status === 'OK').length;
    const kpis = `<div class="kpis">${types.map((t) => kpiHtml(t, d.totals[t], prevOf(t), d.cost_visible, okOf(t))).join('')}
      ${missingN ? `<a class="kpi warn" href="#/utilities/meters"><span class="kpi-ico">!</span><div class="kpi-main"><div class="kpi-label">${bi('ut.missing_n', { N: missingN })}</div><div class="muted small">${bi('ut.window_note', { W: d.window_hours })}</div></div></a>` : ''}
      ${!types.length ? `<div class="card empty-state">${ICON.utilities}<p class="muted">${bi('ut.no_meters')}</p></div>` : ''}</div>`;
    const rows = d.rows.filter((r) => !F.cycle || (mById.get(r.meter_id) || {}).reading_cycle_type === F.cycle);
    let table = '';
    if (wide && rows.length) {
      const shown = rows.slice(F.page * PAGE, F.page * PAGE + PAGE);
      const cost = d.cost_visible;
      table = `<div class="table-wrap"><table class="tbl ut-table"><thead><tr><th>${bi('ut.col.code')}</th><th>${bi('ut.col.meter')}</th><th>${bi('ut.col.interval')}</th>
        <th class="num">${bi('ut.col.prev')}</th><th class="num">${bi('ut.col.new')}</th><th class="num">${bi('ut.col.mult')}</th><th class="num">${bi('ut.col.use')}</th>${cost ? `<th class="num">${bi('ut.cost')}</th>` : ''}<th>${bi('col.status')}</th></tr></thead>
        <tbody>${shown.map((r) => `<tr class="click${r.in_total ? '' : ' sub'}" data-href="/utilities/meters/${esc(r.meter_id)}">
          <td class="code">${esc(r.meter_code)}</td><td>${biName(r)}${r.parent_meter_id ? `<div class="muted small">${bi('ut.parent_meter')}: ${esc((mById.get(r.parent_meter_id) || {}).meter_code || '')}</div>` : ''}</td>
          <td class="num">${r.opening_at || r.closing_at ? `${esc(shortDT(r.opening_at) || '—')} – ${esc(shortDT(r.closing_at) || '—')}` : '—'}</td>
          <td class="num">${r.opening_value === null ? '—' : fmtNumber(r.opening_value)}</td><td class="num">${r.closing_value === null ? '—' : fmtNumber(r.closing_value)}</td>
          <td class="num">${r.multiplier === null || r.multiplier === undefined ? '—' : fmtNumber(r.multiplier)}</td><td class="num"><strong>${qty(r.consumption, r.unit)}</strong></td>
          ${cost ? `<td class="num">${r.cost !== undefined ? `${fmtNumber(r.cost, r.currency === 'VND' ? 0 : 2)}\u00A0${esc(r.currency || '')}` : (r.status === 'OK' ? `<span class="muted small">${bi('ut.cost_missing')}</span>` : '')}</td>` : ''}
          <td>${badge('utility_status.' + r.status)}${r.missing_side ? `<div class="muted small">${bi('missing_side.' + r.missing_side)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="row pager"><span class="muted small">${bi('ut.showing', { A: rows.length ? F.page * PAGE + 1 : 0, B: Math.min(rows.length, (F.page + 1) * PAGE), N: rows.length })}</span>
          ${rows.length > PAGE ? `<button type="button" class="btn small" id="ut-pp" ${F.page ? '' : 'disabled'}>‹</button><span class="muted small">${F.page + 1} / ${Math.ceil(rows.length / PAGE)}</span><button type="button" class="btn small" id="ut-np" ${(F.page + 1) * PAGE < rows.length ? '' : 'disabled'}>›</button>` : ''}</div>`;
    } else if (!wide && missing.length) {
      table = `<section class="card"><div class="card-head"><h2>${bi('ut.missing_list')}</h2><span class="count">${missing.length}</span></div>
        <ul class="list">${missing.slice(0, 8).map((r) => `<li><a href="#/utilities/meters/${esc(r.meter_id)}"><span class="code">${esc(r.meter_code)}</span> ${biName(r)}</a> ${badge('utility_status.' + r.status)}${r.missing_side ? ` <span class="muted small">${bi('missing_side.' + r.missing_side)}</span>` : ''}</li>`).join('')}</ul></section>`;
    }
    const charts = types.length && d.period_type !== 'CUSTOM' ? `<div class="ut-charts${wide ? ' two' : ''}">${types.map((t) => `<section class="card">
        <div class="card-head"><h2>${bi(t === 'WATER' ? 'ut.chart_water' : 'ut.chart_elec')}</h2>
          ${wide ? `<a class="btn tiny" href="#/utilities/meters?type=${t}">${ICON.utilities}<span>${bi('ut.meters')}</span></a>${canPrint ? `<a class="btn tiny" href="#/utilities/meters?type=${t}&print=1">${ICON.qr}<span>${bi('btn.print_qr')}</span></a>` : ''}` : ''}</div>
        ${columnChartHtml({ unit: d.totals[t].unit || UNIT[t], tone: TONE[t], points: chartPoints(d.chart.line, t, d.period_type), stateKey: chartStateKey, note: bi('ut.chart_note'), tableHead: [biText('rpt.period'), d.totals[t].unit || UNIT[t]] })}
      </section>`).join('')}</div>` : '';
    body = banner + kpis + table + charts;
  }
  view.innerHTML = `<div class="ut-page">${filters}${tools}${body}</div>`;
  wireForm(view);
  wireCharts(view);
  const again = () => renderUtilities(view, ctx);
  $('#f-ut-loc', view).addEventListener('change', (e) => { F.loc = e.target.value; F.page = 0; again(); });
  $$('[data-period]', view).forEach((x) => x.addEventListener('click', () => { F.period = x.dataset.period; F.page = 0; if (F.period === 'CUSTOM' && !F.from) { F.from = a; F.to = b; } again(); }));
  $$('[data-cycle]', view).forEach((x) => x.addEventListener('click', () => { F.cycle = F.cycle === x.dataset.cycle ? '' : x.dataset.cycle; F.page = 0; again(); }));
  const pv = $('#ut-prev', view), nx = $('#ut-next', view), ap = $('#ut-apply', view);
  if (pv) pv.addEventListener('click', () => { F.date = prevPeriod(F.period, a)[0]; again(); });
  if (nx) nx.addEventListener('click', () => { F.date = nextPeriod(F.period, b)[0]; again(); });
  if (ap) ap.addEventListener('click', () => {
    const x = readField(view, 'ut-from'), y = readField(view, 'ut-to');
    if (!x || !y) { toast(bi('field.invalid'), 'err'); return; }
    F.from = x <= y ? x : y; F.to = x <= y ? y : x; again();
  });
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href)));
  const pp = $('#ut-pp', view), np = $('#ut-np', view);
  if (pp) pp.addEventListener('click', () => { F.page = Math.max(0, F.page - 1); again().then(toTop); });
  if (np) np.addEventListener('click', () => { F.page++; again().then(toTop); });
}

/* ======================= UT-02 Đồng hồ ======================= */

export async function renderMeterList(view, ctx) {
  const { shell, query } = ctx;
  const wide = isWide();
  const pickRead = query.get('read') === '1';
  if (query.get('type') && ML.type !== query.get('type')) ML.type = query.get('type');
  const canAdd = await can('meter.edit');
  const canRead = await can('reading.create');
  const canPrint = await can('qr.print');
  shell.setScreen({
    title: pickRead ? 'ut.read' : 'ut.meters', back: '/utilities',
    actions: !wide && canAdd && !pickRead ? [{ icon: 'plus', label: biText('ut.meter_new'), onClick: () => navigate('/utilities/meters/new'), disabled: !navigator.onLine }] : []
  });
  const ld = await localData();
  const locs = await mapOf('LOCATION');
  const locOpts = await locOptions();
  const t0 = today(), n0 = nowMs();
  const ql = ML.q.trim().toLowerCase();
  const list = ld.meters.filter((m) => (!ML.type || m.utility_type === ML.type) && (!ML.loc || m.location_id === ML.loc) &&
    (!ql || [m.meter_code, m.name_vi, m.name_zh, m.serial].join(' ').toLowerCase().includes(ql)));
  const info = (m) => {
    const reads = ld.byMeter.get(m.meter_id) || [];
    const last = lastValidBefore(reads);
    return { last, due: m.active === false ? null : readingDue(m, reads, t0, n0), loc: locs.get(m.location_id) };
  };
  if (query.get('print') === '1' && canPrint) {
    const ids = list.filter((m) => m.qr_key && m.active !== false).map((m) => m.meter_id);
    if (ids.length) { navigate(`/print?type=METER&ids=${ids.join(',')}`, { replace: true }); return; }
  }
  const chip = (k, label) => `<button type="button" class="seg${ML.type === k ? ' on' : ''}" data-type="${k}">${label}</button>`;
  const toolbar = `<div class="toolbar">
    ${pickRead ? `<p class="banner info">${bi('ut.pick_meter')}</p>` : ''}
    <div class="search"><span>${ICON.search}</span><input id="ml-q" type="search" value="${esc(ML.q)}" placeholder="${esc(biText('ut.search_ph'))}" autocomplete="off"></div>
    <div class="row"><select id="ml-loc" class="sel" aria-label="${esc(biText('field.location'))}"><option value="">${bi('field.location')}: ${bi('due_filter.ALL')}</option>${locOpts.map(([v, t]) => `<option value="${esc(v)}"${v === ML.loc ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="segs ut-types">${chip('', bi('due_filter.ALL'))}${UTILITY_TYPES.map((t) => chip(t, bi('utility_type.' + t))).join('')}</div>
    <div class="row tools">
      ${wide && canAdd ? `<a class="btn small primary" href="#/utilities/meters/new">${ICON.plus}<span>${bi('ut.meter_new')}</span></a>` : ''}
      ${canPrint && wide ? `<a class="btn small" href="#/utilities/meters?print=1${ML.type ? '&type=' + ML.type : ''}">${ICON.print}<span>${bi('btn.print_qr')}</span></a>` : ''}
      ${await excelLink('meters')}
    </div>
    <p class="muted small">${bi('field.total', { N: list.length })}</p></div>`;
  let body;
  if (!list.length) body = `<div class="card empty-state">${ICON.utilities}<p class="muted">${bi('ut.no_meters')}</p></div>`;
  else if (wide && !pickRead) {
    body = `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('ut.col.code')}</th><th>${bi('ut.col.meter')}</th><th>${bi('col.type')}</th><th>${bi('field.location')}</th>
      <th class="num">${bi('ut.multiplier')}</th><th>${bi('ut.cycle_read')}</th><th class="num">${bi('ut.last_reading')}</th><th>${bi('col.status')}</th><th>QR</th></tr></thead>
      <tbody>${list.map((m) => { const x = info(m); return `<tr class="click" data-href="/utilities/meters/${esc(m.meter_id)}">
        <td class="code">${esc(m.meter_code)}</td><td>${biName(m)}</td><td>${bi('meter_kind.' + m.utility_type)}</td><td>${esc(x.loc ? x.loc.location_code : '')}</td>
        <td class="num">${fmtNumber(curMultiplier(m, ld.segsBy.get(m.meter_id)))}</td><td>${bi('period.' + (m.reading_cycle_type || 'MONTH'))}</td>
        <td class="num">${x.last ? `${fmtNumber(x.last.cumulative_value)}<div class="muted small">${esc(fmtDateTime(x.last.measured_at))}</div>` : '—'}</td>
        <td>${m.active === false ? badge('ut.inactive') : dueBadge(x.due)}</td>
        <td>${m.qr_key ? `<a class="icon-btn" href="#/qr/METER/${esc(m.meter_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  } else {
    body = `<div class="cards">${list.map((m) => {
      const x = info(m);
      const href = pickRead && canRead && m.active !== false ? `#/utilities/read/${esc(m.meter_id)}` : `#/utilities/meters/${esc(m.meter_id)}`;
      const readBtn = canRead && m.active !== false && !pickRead ? `<a class="btn tiny primary" href="#/utilities/read/${esc(m.meter_id)}">${ICON.plus}<span>${bi('ut.read')}</span></a>` : '';
      return `<div class="card rec-card meter-card${x.due && x.due.state === 'MISSED' ? ' alert' : ''}">
        <div class="mc-row"><a class="mc-main" href="${href}"><span class="ut-ico tone-${TONE[m.utility_type]}">${icoOf(m.utility_type)}</span>
          <span class="mc-text"><span class="code">${esc(m.meter_code)}</span>
            <span class="rec-name">${biName(m)}</span>
            <span class="muted small">${bi('meter_kind.' + m.utility_type)}${x.loc ? ' · ' + esc(x.loc.location_code + ' ' + nameText(x.loc)) : ''}</span>
            <span class="muted small">${bi('ut.last_reading')}: ${x.last ? `<strong>${fmtNumber(x.last.cumulative_value)}</strong> · ${esc(fmtDateTime(x.last.measured_at))}` : bi('utility_status.NO_READING')}</span></span></a>
        ${m.qr_key ? `<a class="icon-btn" href="#/qr/METER/${esc(m.meter_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</div>
        <div class="mc-foot">${m.active === false ? badge('ut.inactive') : dueBadge(x.due)}${readBtn}</div></div>`;
    }).join('')}</div>`;
  }
  view.innerHTML = toolbar + body;
  const again = () => renderMeterList(view, ctx);
  $$('[data-type]', view).forEach((x) => x.addEventListener('click', () => {
    ML.type = x.dataset.type;
    if (!query.get('type')) { again(); return; }
    const u = new URLSearchParams(query); u.delete('type');
    navigate('/utilities/meters' + (u.toString() ? '?' + u : ''), { replace: true });
  }));
  $('#ml-loc', view).addEventListener('change', (e) => { ML.loc = e.target.value; again(); });
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) navigate(tr.dataset.href); }));
  let tm = null;
  $('#ml-q', view).addEventListener('input', (e) => { ML.q = e.target.value; clearTimeout(tm); tm = setTimeout(async () => { const pos = e.target.selectionStart; await again(); const el = $('#ml-q', view); el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ } }, 250); });
}

/* ======================= Hồ sơ đồng hồ ======================= */

/** Tải hồ sơ đầy đủ khi có mạng (lịch sử chỉ số dài hơn 45 ngày trên máy); lỗi mạng → dữ liệu trên máy */
async function meterFull(id, fresh = false) {
  if (!navigator.onLine) return null;
  if (!fresh && fullCache.id === id && Date.now() - fullCache.at < 30000) return fullCache.data;
  const r = await api('utility.view', { meter_id: id, page_size: 200 }, { retry: true });
  fullCache = { id, at: Date.now(), data: r.ok ? r.data : null };
  return fullCache.data;
}

export async function renderMeter(view, ctx) {
  const { shell, params, query } = ctx;
  const ld = await localData();
  let m = ld.meters.find((x) => x.meter_id === params.id) || null;
  const full = await meterFull(params.id, !!ctx.fresh);
  if (!m && full) m = full.item;
  shell.setScreen({
    title: 'ut.meter', back: '/utilities/meters',
    actions: m && m.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/METER/${m.meter_id}`) }] : []
  });
  if (!m) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const p = { read: await can('reading.create'), edit: await can('meter.edit'), event: await can('meter.event.create'), approve: await can('meter.event.approve'),
    own: await can('reading.editOwn'), others: await can('reading.editOthers') };
  const segs = full ? full.segments.slice().sort((x, y) => Number(x.seq_no) - Number(y.seq_no)) : (ld.segsBy.get(m.meter_id) || []);
  const events = (full ? full.events : ld.events.filter((e) => e.meter_id === m.meter_id)).slice().sort((x, y) => String(y.event_at).localeCompare(String(x.event_at)));
  const localReads = (ld.byMeter.get(m.meter_id) || []).filter((r) => r._local);
  const reads = (full ? full.readings.concat(localReads.filter((r) => !full.readings.some((x) => x.reading_id === r.reading_id))) : (ld.byMeter.get(m.meter_id) || []))
    .slice().sort((x, y) => String(y.measured_at).localeCompare(String(x.measured_at)));
  const asc = reads.slice().reverse();
  const loc = m.location_id ? await byId('LOCATION', m.location_id) : null;
  const parent = m.parent_meter_id ? ld.meters.find((x) => x.meter_id === m.parent_meter_id) : null;
  const mult = curMultiplier(m, segs);
  const due = m.active === false ? null : readingDue(m, asc);
  const last = lastValidBefore(asc);
  const prev = last ? lastValidBefore(asc.filter((r) => r !== last && r.meter_segment_id === last.meter_segment_id), Date.parse(last.measured_at)) : null;
  const use = last && prev ? useOf(prev.cumulative_value, last.cumulative_value, last.multiplier_at_reading || mult) : null;
  const pending = events.find((e) => e.status === 'PENDING_APPROVAL');
  const uidMe = session.user && session.user.user_id;
  const docs = (await recs('DOCUMENT')).filter((d) => d.entity_type === 'METER_READING' && d.active !== false);
  const photosOf = (rid) => docs.filter((d) => d.entity_id === rid);
  const want = meterTab.get(params.id) || query.get('tab');
  const tab = ['readings', 'segments', 'events'].includes(want) ? want : 'readings';
  const kv = (k, v) => (v ? `<div class="kv"><span>${bi(k)}</span><strong>${v}</strong></div>` : '');
  const editHours = Number(session.settings.reading_self_edit_hours) || 24;
  const canEditRead = (r) => {
    if (r._local || !navigator.onLine) return false;
    if (p.others) return true;
    return p.own && r.reading_user_id === uidMe && r.reading_kind === 'REGULAR' && Date.now() - Date.parse(r.created_at || r.measured_at) < editHours * 3600000;
  };
  view.innerHTML = `<section class="card ut-head">
      ${m.active === false ? `<p class="banner warn">${bi('ut.inactive')}</p>` : ''}
      <div class="mc-main"><span class="ut-ico big tone-${TONE[m.utility_type]}">${icoOf(m.utility_type)}</span>
        <div><div class="rec-top"><span class="code big">${esc(m.meter_code)}</span>${m.active === false ? '' : dueBadge(due)}</div>
          <h2 class="eq-name">${biName(m)}</h2><div class="muted">${bi('meter_kind.' + m.utility_type)}${loc ? ' · ' + esc(loc.location_code + ' ' + nameText(loc)) : ''}</div></div></div>
      ${due && due.state !== 'DONE' ? `<p class="muted small">${dueHint(due, m, false)}</p>` : ''}
      <div class="row">
        ${p.read && m.active !== false ? `<a class="btn primary" href="#/utilities/read/${esc(m.meter_id)}">${ICON.plus}<span>${bi('ut.read')}</span></a>` : ''}
        ${p.edit ? `<a class="btn small" href="#/utilities/meters/${esc(m.meter_id)}/edit" ${navigator.onLine ? '' : 'aria-disabled="true"'}>${ICON.edit}<span>${bi('btn.edit')}</span></a>` : ''}
        ${p.event && m.active !== false && !pending ? `<a class="btn small" href="#/utilities/meters/${esc(m.meter_id)}/event">${bi('ut.event_btn')}</a>` : ''}
      </div>
      ${pending ? `<div class="banner warn ut-pending"><strong>${bi('ut.event_pending')}</strong>: ${bi('meter_event.' + pending.event_type)} · ${esc(fmtDateTime(pending.event_at))}
        · ${bi('ut.closing_value')}: ${fmtNumber(pending.closing_value)}${pending.event_type !== 'MULTIPLIER_CHANGE' ? ` · ${bi('ut.opening_value')}: ${fmtNumber(pending.opening_value)}` : ` · ${bi('ut.new_multiplier')}: ${fmtNumber(pending.new_multiplier)}`}
        ${pending.created_by_name ? ` · ${esc(pending.created_by_name)}` : ''}
        ${p.approve ? (pending.created_by === uidMe ? `<div class="muted small">${bi('ut.event_self')}</div>` : `<div class="row"><button type="button" class="btn small primary" data-ev-ok="${esc(pending.event_id)}" ${navigator.onLine ? '' : 'disabled'}>${bi('btn.approve')}</button><button type="button" class="btn small" data-ev-no="${esc(pending.event_id)}" ${navigator.onLine ? '' : 'disabled'}>${bi('btn.reject')}</button></div>`) : ''}</div>` : ''}
    </section>
    <section class="card"><div class="card-head"><h2>${bi('ut.reading_use')}</h2></div><div class="kv-grid">
      ${kv('ut.prev_reading', prev ? `${fmtNumber(prev.cumulative_value)} <span class="muted small">${esc(fmtDateTime(prev.measured_at))}</span>` : '—')}
      ${kv('ut.new_reading', last ? `${fmtNumber(last.cumulative_value)} <span class="muted small">${esc(fmtDateTime(last.measured_at))}</span>${last._local ? ` <span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}` : bi('utility_status.NO_READING'))}
      ${kv('ut.multiplier', fmtNumber(mult))}
      ${kv('ut.use_period', use !== null ? `<strong>${qty(use, m.unit || UNIT[m.utility_type])}</strong>` : (last && !prev ? bi('ut.baseline_note') : '—'))}
    </div></section>
    <details class="card more"${isWide() ? ' open' : ''}><summary>${bi('ut.meter')}</summary><div class="kv-grid">
      ${kv('ut.meter_code', esc(m.meter_code))}${kv('col.type', bi('meter_kind.' + m.utility_type))}${kv('field.location', loc ? esc(loc.location_code + ' · ' + nameText(loc)) : '')}
      ${kv('field.serial', esc(m.serial || ''))}${kv('ut.cycle_read', bi('period.' + (m.reading_cycle_type || 'MONTH')) + (m.reading_cycle_type === 'CUSTOM' ? ` (${esc(m.reading_cycle_value)} · ${esc(fmtDate(m.reading_cycle_anchor_date))})` : ''))}
      ${kv('ut.assigned', esc(m.assigned_name || ''))}${kv('ut.parent_meter', parent ? esc(parent.meter_code + ' · ' + nameText(parent)) : '')}${kv('ut.position', biName(m, 'position'))}
      ${kv('ut.next_boundary', esc(fmtDate(nextBoundary(m, today()))))}
    </div></details>
    <div class="tabs-bar" role="tablist">${[['readings', 'ut.readings'], ['segments', 'ut.segments'], ['events', 'ut.events']].map(([k, l]) => `<button type="button" role="tab" class="tab${k === tab ? ' on' : ''}" data-tab="${k}" aria-selected="${k === tab}">${bi(l)}</button>`).join('')}</div>
    <section class="card tab-body">${tab === 'readings' ? readingsHtml(reads, photosOf, canEditRead, m, editHours, !!full)
      : tab === 'segments' ? segmentsHtml(segs, m) : eventsHtml(events)}</section>`;
  const again = () => renderMeter(view, { ...ctx, fresh: true });
  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => { meterTab.set(m.meter_id, b.dataset.tab); renderMeter(view, ctx); }));
  $$('[data-ev-ok],[data-ev-no]', view).forEach((b) => b.addEventListener('click', async () => {
    const ok = !!b.dataset.evOk;
    const ev = events.find((e) => e.event_id === (b.dataset.evOk || b.dataset.evNo));
    let reason = '';
    if (!ok) {
      reason = await dialog({ title: bi('btn.reject'), body: `<label for="ev-r">${bi('field.reason')}</label><textarea id="ev-r" class="inp" rows="3" maxlength="300"></textarea>`,
        actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.reject'), kind: 'danger', read: (w) => $('#ev-r', w).value.trim() }] });
      if (reason === null) return;
      if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    }
    busy(b, true);
    const r = await writeWithPin('meter.event.approve', { event_id: ev.event_id, decision: ok ? 'APPROVE' : 'REJECT', reason }, { expected_version: ev.record_version });
    busy(b, false);
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); again(); } else await handleWriteError(r);
  }));
  $$('[data-rd-edit],[data-rd-void],[data-rd-ok]', view).forEach((b) => b.addEventListener('click', async () => {
    const rid = b.dataset.rdEdit || b.dataset.rdVoid || b.dataset.rdOk;
    const rd = reads.find((x) => x.reading_id === rid);
    if (!rd) return;
    if (await readingEditDialog(rd, b.dataset.rdVoid ? 'VOID' : (b.dataset.rdOk ? 'VALID' : 'EDIT'), p, uidMe)) again();
  }));
}

function readingsHtml(reads, photosOf, canEditRead, m, editHours, full) {
  if (!reads.length) return `<p class="muted">${bi('utility_status.NO_READING')}</p>`;
  return `<ul class="list ut-reads">${reads.map((r) => {
    const ph = r._local ? [] : photosOf(r.reading_id);
    const ed = canEditRead(r);
    return `<li class="${r.status === 'VOID' ? 'void' : ''}">
      <div class="ut-read-top"><strong class="num">${fmtNumber(r.cumulative_value)}</strong><span class="muted small">${esc(fmtDateTime(r.measured_at))}</span>
        ${r._local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : badge('reading_status.' + r.status)}
        ${r.reading_kind && r.reading_kind !== 'REGULAR' ? `<span class="badge t-navy">${bi('reading_kind.' + r.reading_kind)}</span>` : ''}</div>
      <div class="muted small">${[r.reading_user_name ? esc(r.reading_user_name) : '', r.note_vi || r.note_zh ? biName(r, 'note') : '', r.void_reason ? `${bi('ut.reason_edit')}: ${esc(r.void_reason)}` : (r.edit_reason ? `${bi('ut.reason_edit')}: ${esc(r.edit_reason)}` : '')].filter(Boolean).join(' · ')}</div>
      ${ph.length ? `<div class="photos small">${ph.map((d) => d.drive_sharing_state === 'LINK_SHARED' && d.drive_file_id ? `<a href="${esc(photoSrc(d, 1600))}" target="_blank" rel="noopener noreferrer"><img src="${esc(photoSrc(d, 200))}" alt="${esc(biText('ut.photo'))}" loading="lazy" referrerpolicy="no-referrer"></a>` : '').join('')}</div>` : ''}
      ${ed ? `<div class="row"><button type="button" class="btn tiny" data-rd-edit="${esc(r.reading_id)}">${ICON.edit}<span>${bi('ut.edit_reading')}</span></button>
        ${(r.reading_kind === 'REGULAR' || !r.reading_kind) && r.status !== 'VOID' ? `<button type="button" class="btn tiny" data-rd-void="${esc(r.reading_id)}">${bi('ut.void_reading')}</button>` : ''}
        ${r.status === 'NEEDS_REVIEW' || r.status === 'VOID' ? `<button type="button" class="btn tiny" data-rd-ok="${esc(r.reading_id)}">${bi('ut.recheck')}</button>` : ''}</div>` : ''}
    </li>`;
  }).join('')}</ul>
  <p class="muted small">${bi('ut.edit_window', { N: editHours })}${full ? '' : ' · ' + bi('ut.local_history')}</p>`;
}

function segmentsHtml(segs, m) {
  if (!segs.length) return `<p class="muted">${bi('field.not_set')}</p>`;
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>${bi('field.serial')}</th><th>${bi('ut.from')}</th><th>${bi('ut.to')}</th>
    <th class="num">${bi('ut.opening_value')}</th><th class="num">${bi('ut.closing_value')}</th><th class="num">${bi('ut.multiplier')}</th><th>${bi('col.status')}</th></tr></thead>
    <tbody>${segs.map((s) => `<tr><td>${esc(s.seq_no)}</td><td>${esc(s.serial || '')}</td><td>${esc(fmtDateTime(s.start_at))}</td><td>${esc(fmtDateTime(s.end_at))}</td>
      <td class="num">${s.opening_value === '' || s.opening_value === null ? '—' : fmtNumber(s.opening_value)}</td><td class="num">${s.closing_value === '' || s.closing_value === null ? '—' : fmtNumber(s.closing_value)}</td>
      <td class="num">${fmtNumber(s.multiplier)}</td><td>${badge('segment_status.' + (s.status || 'ACTIVE'))}</td></tr>`).join('')}</tbody></table></div>`;
}

function eventsHtml(events) {
  if (!events.length) return `<p class="muted">${bi('field.not_set')}</p>`;
  return `<ul class="list">${events.map((e) => `<li><div><strong>${bi('meter_event.' + e.event_type)}</strong> · ${esc(fmtDateTime(e.event_at))} ${badge('event_status.' + e.status)}</div>
    <div class="muted small">${bi('ut.closing_value')}: ${fmtNumber(e.closing_value)}${e.event_type !== 'MULTIPLIER_CHANGE' ? ` · ${bi('ut.opening_value')}: ${fmtNumber(e.opening_value)}` : ''}
      · ${bi('ut.multiplier')}: ${fmtNumber(e.old_multiplier)} → ${fmtNumber(e.new_multiplier)}${e.event_type === 'REPLACE' ? ` · ${bi('field.serial')}: ${esc(e.old_serial || '—')} → ${esc(e.new_serial || '—')}` : ''}
      ${e.created_by_name ? ' · ' + esc(e.created_by_name) : ''}${e.approved_by_name ? ' · ' + bi('btn.approve') + ': ' + esc(e.approved_by_name) : ''}${e.reject_reason ? ' · ' + esc(e.reject_reason) : ''}</div>
    ${e.note_vi || e.note_zh ? `<div class="small">${biName(e, 'note')}</div>` : ''}</li>`).join('')}</ul>`;
}

/** Sửa/hủy/kiểm tra lại một chỉ số: lý do bắt buộc; ĐN sửa chỉ số của mình trong N giờ (reading.editOwn) */
async function readingEditDialog(rd, mode, p, uidMe) {
  const action = p.others ? 'reading.editOthers' : 'reading.editOwn';
  const bound = rd.reading_kind && rd.reading_kind !== 'REGULAR';
  const body = `${mode === 'EDIT' ? `<label for="re-v">${bi('ut.new_reading')}</label><input id="re-v" class="inp num" type="text" inputmode="decimal" value="${esc(fmtNumber(rd.cumulative_value))}">
      ${bound ? '' : `<label for="re-t">${bi('ut.measured_at')}</label><input id="re-t" class="inp" type="datetime-local" value="${esc(toLocalInput(rd.measured_at))}">`}` : ''}
    <label for="re-r">${bi('ut.reason_edit')} <span class="req">*</span></label><textarea id="re-r" class="inp" rows="3" maxlength="300"></textarea>`;
  const title = mode === 'VOID' ? 'ut.void_reading' : (mode === 'VALID' ? 'ut.recheck' : 'ut.edit_reading');
  const v = await dialog({ title: bi(title), body, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: mode === 'VOID' ? 'danger' : 'primary', read: (w) => ({
    value: $('#re-v', w) ? $('#re-v', w).value : null, time: $('#re-t', w) ? $('#re-t', w).value : null, reason: $('#re-r', w).value.trim() }) }] });
  if (!v) return false;
  if (!v.reason) { toast(bi('field.reason_required'), 'err'); return false; }
  const payload = { reading_id: rd.reading_id, reason: v.reason };
  if (mode === 'VOID') payload.status = 'VOID';
  if (mode === 'VALID') payload.status = 'VALID';
  if (mode === 'EDIT') {
    const n = parseNumberInput(v.value);
    if (n.error || n.value === null) { toast(bi('field.invalid'), 'err'); return false; }
    if (Number(n.value) !== Number(rd.cumulative_value)) payload.cumulative_value = n.value;
    if (v.time && fromLocalInput(v.time).slice(0, 16) !== String(rd.measured_at).slice(0, 16)) payload.measured_at = fromLocalInput(v.time);
    if (payload.cumulative_value === undefined && payload.measured_at === undefined) return false;
  }
  const r = await writeOnline(action, payload, { expected_version: rd.record_version });
  if (r.ok) { await afterCommit(); toast(bi(r.data && r.data.status === 'NEEDS_REVIEW' ? 'ut.need_review_saved' : 'form.saved'), 'ok'); return true; }
  await handleWriteError(r);
  return false;
}

/* ======================= UT-03 Nhập chỉ số ======================= */

export async function renderReadingForm(view, ctx) {
  const { shell, params } = ctx;
  if (!(await can('reading.create'))) { navigate(`/utilities/meters/${params.id}`, { replace: true }); return; }
  shell.setScreen({ title: 'ut.read', back: `/utilities/meters/${params.id}` });
  const ld = await localData();
  const m = ld.meters.find((x) => x.meter_id === params.id);
  if (!m) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  if (m.active === false) { view.innerHTML = `<div class="card"><p class="banner warn">${bi('ut.inactive')}</p></div>`; return; }
  const loc = m.location_id ? await byId('LOCATION', m.location_id) : null;
  const segs = ld.segsBy.get(m.meter_id) || [];
  const mult = curMultiplier(m, segs);
  const reads = ld.byMeter.get(m.meter_id) || [];
  const due = readingDue(m, reads);
  const draftKey = 'ut-read:' + m.meter_id;
  const draft = (await loadFormDraft(draftKey)) || {};
  const v = { at: draft.at || toLocalInput(isoNowVN()), value: draft.value || '', note: draft.note || '', photos: draft.photos || [] };
  const unit = m.unit || UNIT[m.utility_type];
  view.innerHTML = `<form class="ut-read" novalidate>
    <section class="card ut-head"><div class="mc-main"><span class="ut-ico big tone-${TONE[m.utility_type]}">${icoOf(m.utility_type)}</span>
      <div><div class="code big">${esc(m.meter_code)}</div><div>${bi('meter_kind.' + m.utility_type)}</div><div class="muted">${loc ? esc(loc.location_code + ' · ' + nameText(loc)) : ''}</div></div>
      ${m.qr_key ? `<a class="icon-btn" href="#/qr/METER/${esc(m.meter_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</div></section>
    <section class="card form-card">
      <div class="fld"><div class="ut-flabel">${bi('ut.cycle_read')}</div><div class="segs ro">${READ_CYCLES.map((k) => `<span class="seg${(m.reading_cycle_type || 'MONTH') === k ? ' on' : ''}">${bi('period.' + k)}</span>`).join('')}</div>
        <div class="hint">${due.state === 'DONE' ? bi('ut.read_done') : dueHint(due, m)}</div></div>
      <div class="fld" data-field="measured_at"><label for="f-at">${bi('ut.measured_at')} <span class="req">*</span></label>
        <input class="inp" type="datetime-local" id="f-at" value="${esc(v.at)}"><div class="ferr" role="alert"></div></div>
      <div class="kv ut-prev"><span>${bi('ut.prev_reading')}</span><strong id="ut-prev-v">—</strong></div>
      <div class="fld" data-field="cumulative_value"><label for="f-val">${bi('ut.new_reading')} <span class="req">*</span></label>
        <input class="inp num big" id="f-val" type="text" inputmode="decimal" autocomplete="off" value="${esc(v.value)}" placeholder="0"><div class="amb" hidden></div><div class="ferr" role="alert"></div></div>
      <div class="kv"><span>${bi('ut.multiplier')}</span><strong>${fmtNumber(mult)}</strong></div>
      <div class="kv"><span>${bi('ut.use_period')}</span><strong id="ut-use">—</strong></div>
      <p class="banner warn" id="ut-dec" hidden>${bi('ut.decreased_warn')}</p>
      <section class="rp-photos"><h3>${bi('ut.photo')}</h3><div class="photos" id="ut-photos"></div>
        <label class="btn small file">${ICON.camera}<span>${bi('ut.take_photo')}</span><input type="file" accept="image/*" capture="environment" id="ut-photo" hidden></label></section>
      <div class="fld" data-field="note"><label for="f-note">${bi('field.note')}</label>
        <textarea class="inp" id="f-note" rows="2" maxlength="200" placeholder="${esc(biText('ut.note_ph'))}">${esc(v.note)}</textarea><div class="hint right"><span id="ut-cnt">${v.note.length}</span>/200</div></div>
      ${!navigator.onLine ? `<p class="banner info">${bi('ut.offline_reading')}</p>` : ''}
      <p class="form-err err" role="alert"></p>
      <div class="row form-actions"><button type="button" class="btn" id="ut-draft">${bi('btn.save_draft')}</button><button type="submit" class="btn primary" id="ut-send">${bi('ut.send')}</button></div>
    </section></form>`;
  const form = $('form', view);
  const saveDraft = () => saveFormDraft(draftKey, v);
  const paint = () => {
    const t = Date.parse(fromLocalInput(v.at)) || Date.now();
    const prev = lastValidBefore(reads, t);
    $('#ut-prev-v', form).innerHTML = prev ? `${fmtNumber(prev.cumulative_value)} <span class="muted small">${esc(fmtDateTime(prev.measured_at))}</span>` : bi('ut.baseline_note');
    const n = parseNumberInput(v.value);
    const dec = $('#ut-dec', form), useEl = $('#ut-use', form);
    if (!prev || n.error || n.value === null) { useEl.textContent = '—'; dec.hidden = true; return; }
    const u = useOf(prev.cumulative_value, n.value, mult);
    dec.hidden = u >= 0;
    useEl.innerHTML = u >= 0 ? qty(u, unit) : '—';
  };
  const paintPhotos = () => {
    const box = $('#ut-photos', form);
    box.innerHTML = v.photos.map((ph, i) => `<figure class="photo"><img src="data:image/jpeg;base64,${ph.thumb_b64 || ph.main_b64}" alt="${esc(biText('ut.photo'))} ${i + 1}">
      <figcaption><button type="button" class="btn tiny" data-rm="${i}" aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button></figcaption></figure>`).join('');
    $$('[data-rm]', box).forEach((b) => b.addEventListener('click', () => { v.photos.splice(Number(b.dataset.rm), 1); saveDraft(); paintPhotos(); }));
    $('#ut-photo', form).closest('label').hidden = v.photos.length >= MAX_PHOTOS;
  };
  paint(); paintPhotos();
  $('#f-at', form).addEventListener('change', (e) => { v.at = e.target.value; saveDraft(); paint(); });
  // iPhone bàn phím số không có nút Xong: tính tiêu thụ ngay khi gõ (input), không chờ blur
  $('#f-val', form).addEventListener('input', (e) => { v.value = e.target.value; paint(); });
  $('#f-val', form).addEventListener('change', () => saveDraft());
  $('#f-note', form).addEventListener('input', (e) => { v.note = e.target.value; $('#ut-cnt', form).textContent = v.note.length; });
  $('#f-note', form).addEventListener('change', () => saveDraft());
  $('#ut-photo', form).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || v.photos.length >= MAX_PHOTOS) return;
    const ph = await processPhoto(f);
    v.photos.push({ main_b64: await blobToB64(ph.main), thumb_b64: ph.thumb ? await blobToB64(ph.thumb) : '' });
    await saveDraft();
    paintPhotos();
  });
  $('#ut-draft', form).addEventListener('click', async () => { await saveDraft(); toast(bi('ut.draft_saved'), 'ok'); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errs = [];
    const n = parseNumberInput(v.value);
    const at = fromLocalInput(v.at);
    if (n.error || n.value === null) errs.push({ field: 'cumulative_value', key: n.error ? 'field.invalid' : 'field.required' });
    if (!at || Number.isNaN(Date.parse(at))) errs.push({ field: 'measured_at', key: 'field.required' });
    else if (Date.parse(at) > Date.now() + 5 * 60000) errs.push({ field: 'measured_at', key: 'mt.issue.time_order' });
    if (!errs.length && reads.some((r) => r.status !== 'VOID' && String(r.measured_at).slice(0, 16) === at.slice(0, 16))) errs.push({ field: 'measured_at', key: 'ut.duplicate_time' });
    if (errs.length) { showErrors(form, errs); return; }
    const p = { reading_id: uuid(), meter_id: m.meter_id, measured_at: at, cumulative_value: n.value, ...oneLang('note', v.note) };
    const title = photoTitle(m, at);
    const photos = v.photos.slice();
    const queuePhotos = async (list) => {
      for (const ph of list) {
        const d = { document_id: uuid(), entity_type: 'METER_READING', entity_id: p.reading_id, kind: 'PHOTO_METER', mime_type: 'image/jpeg', content_b64: ph.main_b64, ...title };
        if (ph.thumb_b64) d.thumb_b64 = ph.thumb_b64;
        await enqueue('doc.upload', d, { entity_type: 'DOCUMENT', entity_id: d.document_id, expected_version: 0, parent_id: p.reading_id });
      }
    };
    if (!navigator.onLine) {
      await enqueue('reading.create', p, { entity_type: 'METER_READING', entity_id: p.reading_id, expected_version: 0 });
      await queuePhotos(photos);
      await clearFormDraft(draftKey);
      toast(bi('ut.saved_offline'), 'ok');
      navigate(`/utilities/meters/${m.meter_id}`, { replace: true });
      return;
    }
    const btn = $('#ut-send', form);
    busy(btn, true);
    const res = await writeOnline('reading.create', p);
    if (!res.ok) {
      busy(btn, false);
      // Mất mạng giữa chừng: xếp hàng gửi sau (cùng reading_id, máy chủ không ghi trùng)
      if (res.code === 'NETWORK_ERROR' || res.code === 'UNKNOWN_RESULT') {
        await enqueue('reading.create', p, { entity_type: 'METER_READING', entity_id: p.reading_id, expected_version: 0 });
        await queuePhotos(photos);
        await clearFormDraft(draftKey);
        toast(bi('ut.saved_offline'), 'ok');
        navigate(`/utilities/meters/${m.meter_id}`, { replace: true });
        return;
      }
      if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; }
      await handleWriteError(res);
      return;
    }
    await clearFormDraft(draftKey);
    const left = [];
    for (const ph of photos) {
      const blob = new Blob([b64ToBytes(ph.main_b64)], { type: 'image/jpeg' });
      const thumb = ph.thumb_b64 ? new Blob([b64ToBytes(ph.thumb_b64)], { type: 'image/jpeg' }) : null;
      const r = await uploadDoc({ entity_type: 'METER_READING', entity_id: p.reading_id, kind: 'PHOTO_METER', blob, mime: 'image/jpeg', thumb, ...title });
      if (!r.ok && ['NETWORK_ERROR', 'SERVER_BUSY', 'UNKNOWN_RESULT'].includes(r.code)) left.push(ph);
    }
    if (left.length) await queuePhotos(left);
    busy(btn, false);
    await afterCommit();
    fullCache = { id: '', at: 0, data: null };
    const d = res.data || {};
    toast(d.status === 'NEEDS_REVIEW' ? bi('ut.need_review_saved') : (d.consumption !== null && d.consumption !== undefined ? bi('ut.saved_use', { V: fmtNumber(d.consumption) + '\u00A0' + unit }) : bi('ut.saved')), d.status === 'NEEDS_REVIEW' ? 'err' : 'ok');
    navigate(`/utilities/meters/${m.meter_id}`, { replace: true });
  });
}

/** Tên ảnh đồng hồ đủ hai thứ tiếng (từ điển): "Ảnh chụp đồng hồ DH-0001 06/10/2026 08:00" */
function photoTitle(m, at) {
  const [vi, zh] = L['ut.photo'] || ['Ảnh chụp đồng hồ', '表计照片'];
  const tail = ` ${m.meter_code} ${fmtDateTime(at)}`;
  return { title_vi: vi + tail, title_zh: zh + tail };
}

/* ======================= Thêm/sửa đồng hồ ======================= */

export async function renderMeterForm(view, ctx) {
  const { shell, params } = ctx;
  const id = params.id || '';
  shell.setScreen({ title: id ? 'ut.meter_edit' : 'ut.meter_new', back: id ? `/utilities/meters/${id}` : '/utilities/meters' });
  if (!(await can('meter.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  const ld = await localData();
  const m = id ? ld.meters.find((x) => x.meter_id === id) : null;
  if (id && !m) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const segs = m ? (ld.segsBy.get(m.meter_id) || []) : [];
  const curSeg = segs[segs.length - 1];
  const hasReads = m ? (ld.byMeter.get(m.meter_id) || []).some((r) => r.status !== 'VOID' && (!curSeg || r.meter_segment_id === curSeg.segment_id)) : false;
  const locOpts = await locOptions();
  const people = (await can('user.pickList')) ? await workerPick() : [];
  const type0 = m ? m.utility_type : 'ELECTRICITY';
  const parents = ld.meters.filter((x) => x.meter_id !== id && x.active !== false);
  view.innerHTML = `<form class="card form-card" novalidate><div class="form-grid">
    ${bilingualInputs('name', m, { required: true })}
    <fieldset class="bi-pair" data-field="utility_type"><legend>${bi('col.type')} <span class="req">*</span></legend>
      <div class="segs">${UTILITY_TYPES.map((t) => `<button type="button" class="seg${type0 === t ? ' on' : ''}" data-ut="${t}" ${m ? 'disabled' : ''}>${bi('meter_kind.' + t)}</button>`).join('')}</div>
      ${m ? `<div class="hint">${bi('ut.type_fixed')}</div>` : ''}<div class="ferr" role="alert"></div></fieldset>
    ${textInput('meter_code', 'ut.meter_code', m ? m.meter_code : '', { maxlength: 32, upper: true, hint: m ? '' : bi('ut.code_hint') })}
    ${selectInput('location_id', 'field.location', locOpts, m ? m.location_id : '')}
    ${selectInput('parent_meter_id', 'ut.parent_meter', parents.map((x) => [x.meter_id, `${esc(x.meter_code)} · ${esc(nameText(x))}`]), m ? m.parent_meter_id : '', { hint: bi('ut.parent_hint'), empty: 'field.choose' })}
    ${textInput('serial', 'field.serial', m ? m.serial : '', { maxlength: 80 })}
    ${numberInput('multiplier', 'ut.multiplier', m ? curMultiplier(m, segs) : 1, { hint: hasReads ? bi('ut.multiplier_event_hint') : '' })}
    ${selectInput('reading_cycle_type', 'ut.cycle_read', READ_CYCLES.map((k) => [k, bi('period.' + k)]), m ? m.reading_cycle_type : 'MONTH', { empty: '' })}
    <div id="ut-custom" ${m && m.reading_cycle_type === 'CUSTOM' ? '' : 'hidden'}>${numberInput('reading_cycle_value', 'ut.cycle_value', m ? m.reading_cycle_value : '', { integer: true })}${dateInput('reading_cycle_anchor_date', 'ut.anchor', m ? m.reading_cycle_anchor_date : today())}</div>
    ${people.length ? selectInput('assigned_user_id', 'ut.assigned', people.map((u) => [u.user_id, esc(u.employee_code + ' · ' + u.display_name)]), m ? m.assigned_user_id : '') : ''}
    ${bilingualInputs('position', m, { required: false, labelKey: 'ut.position' })}
    ${m ? '' : `<fieldset class="bi-pair"><legend>${bi('ut.opening_create')}</legend>${numberInput('opening_value', 'ut.opening_value', '', { hint: bi('ut.opening_hint') })}
      <div class="fld" data-field="opening_at"><label for="f-opening_at">${bi('ut.opening_at')}</label><input class="inp" type="datetime-local" id="f-opening_at" value="${esc(toLocalInput(isoNowVN()))}"><div class="ferr"></div></div></fieldset>`}
    ${m ? `<label class="check"><input type="checkbox" id="f-active" ${m.active !== false ? 'checked' : ''}><span>${bi('ut.active')}</span></label>` : ''}
  </div><p class="form-err err" role="alert"></p>
  <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div></form>`;
  const form = $('form', view);
  wireForm(form);
  let type = type0;
  if (hasReads) { const mi = $('#f-multiplier', form); if (mi) mi.disabled = true; }
  $$('[data-ut]', form).forEach((b) => b.addEventListener('click', () => { type = b.dataset.ut; $$('[data-ut]', form).forEach((x) => x.classList.toggle('on', x.dataset.ut === type)); }));
  $('#f-reading_cycle_type', form).addEventListener('change', (e) => { $('#ut-custom', form).hidden = e.target.value !== 'CUSTOM'; });
  $('#fm-cancel', form).addEventListener('click', () => back(id ? `/utilities/meters/${id}` : '/utilities/meters'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const amb = unconfirmedAmbiguous(form);
    if (amb) { amb.focus(); return; }
    const val = (k) => readField(form, k);
    const p = { meter_id: id || uuid(), name_vi: val('name_vi'), name_zh: val('name_zh'), position_vi: val('position_vi'), position_zh: val('position_zh'),
      location_id: val('location_id'), parent_meter_id: val('parent_meter_id'), serial: val('serial'), reading_cycle_type: val('reading_cycle_type') };
    const code = val('meter_code');
    if (!m && code) p.meter_code = code;
    if (m && code && code !== m.meter_code) p.meter_code = code;
    if (!m) p.utility_type = type;
    const mu = val('multiplier');
    if (Number.isNaN(mu)) { showErrors(form, [{ field: 'multiplier', key: 'field.invalid' }]); return; }
    if (!hasReads && mu !== null) p.multiplier = mu;
    if (p.reading_cycle_type === 'CUSTOM') { p.reading_cycle_value = val('reading_cycle_value'); p.reading_cycle_anchor_date = val('reading_cycle_anchor_date'); }
    if ($('#f-assigned_user_id', form)) p.assigned_user_id = val('assigned_user_id');
    if (!m) {
      const ov = val('opening_value');
      if (Number.isNaN(ov)) { showErrors(form, [{ field: 'opening_value', key: 'field.invalid' }]); return; }
      if (ov !== null) { p.opening_value = ov; p.opening_at = fromLocalInput($('#f-opening_at', form).value) || isoNowVN(); }
    }
    if (m) {
      const act = $('#f-active', form).checked;
      if (act !== (m.active !== false)) {
        p.active = act;
        if (!act) {
          const reason = await dialog({ title: bi('ut.stop_meter'), body: `<label for="sm-r">${bi('field.reason')}</label><textarea id="sm-r" class="inp" rows="3" maxlength="300"></textarea>`,
            actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('ut.stop_meter'), kind: 'danger', read: (w) => $('#sm-r', w).value.trim() }] });
          if (reason === null) return;
          if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
          p.reason = reason;
        }
      }
    }
    const btn = $('#fm-save', form);
    busy(btn, true);
    const r = await writeOnline('meter.edit', p, { expected_version: m ? m.record_version : 0 });
    busy(btn, false);
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); navigate(`/utilities/meters/${p.meter_id}`, { replace: true }); return; }
    if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; }
    await handleWriteError(r);
  });
}

/* ======================= Sự kiện đồng hồ ======================= */

export async function renderEventForm(view, ctx) {
  const { shell, params } = ctx;
  shell.setScreen({ title: 'ut.event_new', back: `/utilities/meters/${params.id}` });
  if (!(await can('meter.event.create'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  const ld = await localData();
  const m = ld.meters.find((x) => x.meter_id === params.id);
  if (!m) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const segs = ld.segsBy.get(m.meter_id) || [];
  const mult = curMultiplier(m, segs);
  const last = lastValidBefore(ld.byMeter.get(m.meter_id) || []);
  let type = 'REPLACE';
  view.innerHTML = `<form class="card form-card" novalidate>
    <p class="muted"><span class="code">${esc(m.meter_code)}</span> · ${biName(m)} · ${bi('ut.multiplier')}: ${fmtNumber(mult)}${last ? ` · ${bi('ut.last_reading')}: ${fmtNumber(last.cumulative_value)} (${esc(fmtDateTime(last.measured_at))})` : ''}</p>
    <fieldset class="bi-pair" data-field="event_type"><legend>${bi('ut.event_type')} <span class="req">*</span></legend>
      <div class="segs">${['REPLACE', 'RESET', 'MULTIPLIER_CHANGE'].map((t) => `<button type="button" class="seg${t === type ? ' on' : ''}" data-et="${t}">${bi('meter_event.' + t)}</button>`).join('')}</div><div class="ferr"></div></fieldset>
    <div class="form-grid">
      <div class="fld" data-field="event_at"><label for="f-event_at">${bi('ut.event_at')} <span class="req">*</span></label><input class="inp" type="datetime-local" id="f-event_at" value="${esc(toLocalInput(isoNowVN()))}"><div class="ferr"></div></div>
      <div id="ev-close">${numberInput('closing_value', 'ut.closing_value', '', { required: true })}</div>
      <div id="ev-open">${numberInput('opening_value', 'ut.opening_value', '', { required: true })}</div>
      <div id="ev-serial">${textInput('new_serial', 'ut.new_serial', '', { maxlength: 80 })}</div>
      <div id="ev-mult">${numberInput('new_multiplier', 'ut.new_multiplier', '', {})}</div>
      ${bilingualInputs('note', null, { required: false, labelKey: 'field.note', area: true, maxlength: 500 })}
    </div>
    <p class="muted small">${bi('ut.event_help')}</p>
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div></form>`;
  const form = $('form', view);
  wireForm(form);
  const show = () => {
    $$('[data-et]', form).forEach((x) => x.classList.toggle('on', x.dataset.et === type));
    $('#ev-open', form).hidden = type === 'MULTIPLIER_CHANGE';
    $('#ev-serial', form).hidden = type !== 'REPLACE';
    $('#ev-mult', form).hidden = type === 'RESET';
    $('#ev-close label', form).innerHTML = `${bi(type === 'MULTIPLIER_CHANGE' ? 'ut.closing_value_mult' : 'ut.closing_value')} <span class="req">*</span>`;
    if (type === 'RESET' && !$('#f-opening_value', form).value) $('#f-opening_value', form).value = '0';
  };
  show();
  $$('[data-et]', form).forEach((b) => b.addEventListener('click', () => { type = b.dataset.et; show(); }));
  $('#fm-cancel', form).addEventListener('click', () => back(`/utilities/meters/${m.meter_id}`));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const amb = unconfirmedAmbiguous(form);
    if (amb) { amb.focus(); return; }
    const val = (k) => readField(form, k);
    const p = { event_id: uuid(), meter_id: m.meter_id, event_type: type, event_at: fromLocalInput($('#f-event_at', form).value), closing_value: val('closing_value'),
      note_vi: val('note_vi'), note_zh: val('note_zh') };
    if (type !== 'MULTIPLIER_CHANGE') p.opening_value = val('opening_value');
    if (type === 'REPLACE') p.new_serial = val('new_serial');
    if (type !== 'RESET' && val('new_multiplier') !== null) p.new_multiplier = val('new_multiplier');
    const bad = ['closing_value', 'opening_value', 'new_multiplier'].filter((k) => Number.isNaN(p[k]));
    if (bad.length) { showErrors(form, bad.map((f) => ({ field: f, key: 'field.invalid' }))); return; }
    const btn = $('#fm-save', form);
    busy(btn, true);
    const r = await writeOnline('meter.event.create', p);
    busy(btn, false);
    if (r.ok) { await afterCommit(); fullCache = { id: '', at: 0, data: null }; meterTab.set(m.meter_id, 'events'); toast(bi('ut.event_saved'), 'ok'); navigate(`/utilities/meters/${m.meter_id}`, { replace: true }); return; }
    if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; }
    await handleWriteError(r);
  });
}

/* ======================= Biểu giá ======================= */

export async function renderTariffs(view, ctx) {
  const { shell } = ctx;
  shell.setScreen({ title: 'ut.tariffs', back: '/utilities' });
  if (!(await can('tariff.view'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  const canEdit = await can('tariff.edit');
  const canApprove = await can('tariff.approve');
  const list = (await recs('TARIFF')).filter((t) => !t.archived_at)
    .sort((a, b) => String(a.utility_type).localeCompare(String(b.utility_type)) || String(b.effective_from).localeCompare(String(a.effective_from)));
  const locs = await mapOf('LOCATION');
  const uidMe = session.user && session.user.user_id;
  view.innerHTML = `<div class="toolbar"><p class="muted small">${bi('tariff.help')}</p>
    <div class="row tools">${canEdit ? `<a class="btn small primary" href="#/utilities/tariffs/new">${ICON.plus}<span>${bi('ut.tariff_new')}</span></a>` : ''}${await excelLink('utility_tariffs')}</div></div>
    ${list.length ? `<div class="cards">${list.map((t) => {
      const l = locs.get(t.location_id);
      const mine = t.created_by === uidMe || t.updated_by === uidMe;
      return `<div class="card rec-card"><div class="rec-top"><span>${bi('utility_type.' + t.utility_type)} · ${l ? esc(l.location_code) : bi('tariff.all_plant')}</span>${badge('tariff_status.' + t.status)}</div>
        ${t.name_vi || t.name_zh ? `<div class="rec-name">${biName(t)}</div>` : ''}
        <div class="dates"><span>${bi('tariff.from')}: <strong>${esc(fmtDate(t.effective_from))}</strong></span><span>${bi('tariff.to')}: <strong>${t.effective_to ? esc(fmtDate(t.effective_to)) : '—'}</strong></span></div>
        <div>${bi('tariff.price')}: <strong>${fmtNumber(t.unit_price, t.currency === 'VND' ? 0 : 2)}\u00A0${esc(t.currency || '')}</strong> / ${esc(t.unit || UNIT[t.utility_type])} · ${bi('tariff.tax')}: ${fmtNumber(t.tax_rate || 0)}%</div>
        ${t.reject_reason ? `<div class="muted small">${bi('btn.reject')}: ${esc(t.reject_reason)}</div>` : ''}
        <div class="row">
          ${canEdit && t.status !== 'APPROVED' ? `<a class="btn tiny" href="#/utilities/tariffs/${esc(t.tariff_id)}">${ICON.edit}<span>${bi('btn.edit')}</span></a>` : ''}
          ${canApprove && t.status === 'DRAFT' ? (mine ? `<span class="muted small">${bi('tariff.self')}</span>` : `<button type="button" class="btn tiny primary" data-tf-ok="${esc(t.tariff_id)}">${bi('btn.approve')}</button><button type="button" class="btn tiny" data-tf-no="${esc(t.tariff_id)}">${bi('btn.reject')}</button>`) : ''}
        </div></div>`;
    }).join('')}</div>` : `<div class="card empty-state"><p class="muted">${bi('tariff.none')}</p></div>`}`;
  $$('[data-tf-ok],[data-tf-no]', view).forEach((b) => b.addEventListener('click', async () => {
    const ok = !!b.dataset.tfOk;
    const t = list.find((x) => x.tariff_id === (b.dataset.tfOk || b.dataset.tfNo));
    let reason = '';
    if (!ok) {
      reason = await dialog({ title: bi('btn.reject'), body: `<label for="tf-r">${bi('field.reason')}</label><textarea id="tf-r" class="inp" rows="3" maxlength="300"></textarea>`,
        actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.reject'), kind: 'danger', read: (w) => $('#tf-r', w).value.trim() }] });
      if (reason === null) return;
      if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    }
    busy(b, true);
    const r = await writeWithPin('tariff.approve', { tariff_id: t.tariff_id, decision: ok ? 'APPROVE' : 'REJECT', reason }, { expected_version: t.record_version });
    busy(b, false);
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); renderTariffs(view, ctx); } else await handleWriteError(r);
  }));
}

export async function renderTariffForm(view, ctx) {
  const { shell, params } = ctx;
  const id = params.id || '';
  shell.setScreen({ title: id ? 'ut.tariff_edit' : 'ut.tariff_new', back: '/utilities/tariffs' });
  if (!(await can('tariff.edit'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  const t = id ? (await recs('TARIFF')).find((x) => x.tariff_id === id) : null;
  if (id && !t) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const locOpts = await locOptions();
  view.innerHTML = `<form class="card form-card" novalidate><div class="form-grid">
    ${selectInput('utility_type', 'tariff.utility', UTILITY_TYPES.map((u) => [u, bi('utility_type.' + u)]), t ? t.utility_type : 'ELECTRICITY', { required: true, empty: '' })}
    ${selectInput('location_id', 'tariff.location', [['', bi('tariff.all_plant')]].concat(locOpts), t ? t.location_id : '', { empty: '' })}
    ${bilingualInputs('name', t, { required: false, labelKey: 'tariff.name' })}
    ${dateInput('effective_from', 'tariff.from', t ? t.effective_from : today(), { required: true })}
    ${dateInput('effective_to', 'tariff.to', t ? t.effective_to : '')}
    ${numberInput('unit_price', 'tariff.price', t ? t.unit_price : '', { required: true })}
    ${textInput('currency', 'tariff.currency', t ? t.currency : (session.settings.default_currency || 'VND'), { maxlength: 3, upper: true })}
    ${numberInput('tax_rate', 'tariff.tax', t ? t.tax_rate : 0)}
  </div><p class="muted small">${bi('tariff.help')}</p><p class="form-err err" role="alert"></p>
  <div class="row form-actions">${t ? `<button type="button" class="btn" id="tf-arch">${ICON.archive}<span>${bi('btn.archive')}</span></button>` : ''}<button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi('btn.save')}</button></div></form>`;
  const form = $('form', view);
  wireForm(form);
  $('#fm-cancel', form).addEventListener('click', () => back('/utilities/tariffs'));
  const arch = $('#tf-arch', form);
  if (arch) arch.addEventListener('click', async () => {
    const ok = await dialog({ title: bi('btn.archive'), body: '', actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.archive'), kind: 'danger', value: true }] });
    if (!ok) return;
    const r = await writeOnline('tariff.edit', { tariff_id: t.tariff_id, archive: true }, { expected_version: t.record_version });
    if (r.ok) { await afterCommit(); navigate('/utilities/tariffs', { replace: true }); } else await handleWriteError(r);
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const val = (k) => readField(form, k);
    const p = { tariff_id: id || uuid(), utility_type: val('utility_type'), location_id: val('location_id'), name_vi: val('name_vi'), name_zh: val('name_zh'),
      effective_from: val('effective_from'), effective_to: val('effective_to'), unit_price: val('unit_price'), currency: val('currency'), tax_rate: val('tax_rate'), pricing_type: 'FLAT' };
    const errs = [];
    if (p.effective_from === null || !p.effective_from) errs.push({ field: 'effective_from', key: p.effective_from === null ? 'field.invalid' : 'field.required' });
    if (p.effective_to === null) errs.push({ field: 'effective_to', key: 'field.invalid' });
    ['unit_price', 'tax_rate'].forEach((k) => { if (Number.isNaN(p[k])) errs.push({ field: k, key: 'field.invalid' }); });
    if (errs.length) { showErrors(form, errs); return; }
    if (p.tax_rate === null) p.tax_rate = 0;
    if (!p.name_vi && !p.name_zh) { delete p.name_vi; delete p.name_zh; }
    const btn = $('#fm-save', form);
    busy(btn, true);
    const r = await writeOnline('tariff.edit', p, { expected_version: t ? t.record_version : 0 });
    busy(btn, false);
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); navigate('/utilities/tariffs', { replace: true }); return; }
    if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; }
    await handleWriteError(r);
  });
}

export { daysBetween, addDays };
