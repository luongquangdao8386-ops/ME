// Báo cáo (Đợt 3): RE-01 danh sách mẫu (iPhone) / WEB-RE-01 mẫu + xem trước + báo cáo đã lưu; RE-02 báo cáo theo bộ lọc (tóm tắt,
// biểu đồ, chi tiết), xuất Excel (SheetJS trên máy) / PDF (máy chủ dựng), lưu bản chụp (mã BC, QR); RE-03 mẫu do quản trị lập.
// Màn, Excel, PDF không có logo hay cụm nhận diện app (1.4 §3.5). Số liệu theo quyền xem và quyền giá (4.5). Cần mạng.
import { bi, biText, esc, api, fmtDate, fmtDateTime, fmtNumber, badge, biName, nameText, uuid, resMsg, session, b64ToBytes, BUILD_VERSION, L } from '../core.js';
import { ICON, toast, dialog, $, $$ } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, byId, mapOf, can, today, addDays } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit } from '../app.js';
import { selectInput, textInput, bilingualInputs, dateInput, wireForm, readField, showErrors, writeOnline, busy, evBtn } from '../form.js';
import { shareFileNow, isTouchMobile } from '../media.js';
import { handleWriteError } from './equipment.js';
import { loadXlsx, buildSheet, aoaSheet, workbookFile } from '../xlsx.js';
import { columnChartHtml, barListHtml, wireCharts } from '../chart.js';
import { chartPoints, chartStateKey } from './utilities.js';
import { PERIOD_TYPES, UNIT, TONE, periodOf } from '../meters.js';

const ICON_OF = { equipment: 'equipment', maintenance: 'maintenance', repairs: 'repairs', warehouse: 'warehouse', utilities: 'utilities', circuits: 'circuits', contracts: 'contracts', inspections: 'inspections' };
const DS_MODULE = { EQUIPMENT: 'equipment', MAINTENANCE: 'maintenance', REPAIRS: 'repairs', MATERIALS: 'warehouse', UTILITIES: 'utilities', CIRCUITS: 'circuits', CONTRACTS: 'contracts', INSPECTIONS: 'inspections' };
const STATUS_OPTS = {
  EQUIPMENT: ['equipment_status', ['RUNNING', 'STOPPED', 'UNDER_REPAIR', 'UNDER_MAINTENANCE', 'STANDBY', 'RETIRED']],
  MAINTENANCE: ['wo_status', ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE', 'COMPLETED', 'CANCELLED']],
  REPAIRS: ['repair_status', ['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE', 'COMPLETED', 'CANCELLED']]
};
const ROLES = [1, 2, 3, 4];
const RF = { from: '', to: '', loc: '', group: '', active: '', sel: '' };
/** Kết quả chạy gần nhất (giữ khi vẽ lại cùng màn: chọn ô, xuất tệp) */
let last = { key: '', data: null };
const files = {};

const monthStart = () => today().slice(0, 8) + '01';
function defaultsFor(def, q) {
  const f = {};
  const schema = def.filter_schema || [];
  const g = (k) => (q && q.get(k)) || '';
  if (schema.includes('from')) { f.from = g('from') || RF.from || monthStart(); f.to = g('to') || RF.to || today(); }
  if (schema.includes('location_id') && (g('location_id') || RF.loc)) f.location_id = g('location_id') || RF.loc;
  if (schema.includes('period_type')) { f.period_type = g('period_type') || 'MONTH'; if (f.period_type !== 'CUSTOM') { f.date = g('date') || today(); delete f.from; delete f.to; } }
  ['status', 'severity', 'utility_type', 'panel_id', 'due'].forEach((k) => { if (schema.includes(k) && g(k)) f[k] = g(k); });
  return f;
}

/* ======================= Định dạng ô (5.4) ======================= */

function cellHtml(c, r) {
  const v = r[c.key];
  switch (c.type) {
    case 'bi': return biName(r, c.key);
    case 'num': return v === '' || v === null || v === undefined ? '' : fmtNumber(v);
    case 'date': return esc(fmtDate(v));
    case 'time': return esc(fmtDateTime(v));
    case 'enum': return v ? bi(c.enumKey + '.' + v) : '';
    case 'money': return v === '' || v === null || v === undefined ? '' : `${fmtNumber(v, r[c.cur] === 'VND' ? 0 : 2)}${r[c.cur] ? '\u00A0' + esc(r[c.cur]) : ''}`;
    case 'code': return `<span class="code">${esc(v || '')}</span>`;
    default: return esc(v === null || v === undefined ? '' : v);
  }
}
function cellText(c, r) {
  const v = r[c.key];
  switch (c.type) {
    case 'bi': return [r[c.key + '_vi'], r[c.key + '_zh']].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');
    case 'enum': return v ? biText(c.enumKey + '.' + v) : '';
    case 'time': return fmtDateTime(v);
    default: return v === null || v === undefined ? '' : v;
  }
}
const isNumCol = (c) => c.type === 'num' || c.type === 'money';

function summaryRows(d) {
  return (d.summary || []).map((s) => {
    const label = s.enumKey ? biText(s.enumKey + '.' + s.enum) + (s.label_vi ? ` — ${s.label_vi} · ${s.label_zh}` : '') : `${s.label_vi} · ${s.label_zh}`;
    const val = s.money ? `${fmtNumber(s.value, s.currency === 'VND' ? 0 : 2)}\u00A0${s.currency || ''}` : (s.value === null ? biText('field.not_set') : fmtNumber(s.value) + (s.unit ? (s.unit === '%' ? '%' : '\u00A0' + s.unit) : ''));
    return { label, val: val + (s.partial ? ` (${biText('ut.partial')})` : ''), raw: s };
  });
}

async function filterLines(d) {
  const f = d.filters || {};
  const out = [];
  if (d.period) out.push([biText('rpt.period'), `${fmtDate(d.period.period_start)} – ${fmtDate(d.period.period_end)} (${biText('period.' + d.period.period_type)})`]);
  else if (f.from || f.to) out.push([biText('rpt.period'), `${f.from ? fmtDate(f.from) : '…'} – ${f.to ? fmtDate(f.to) : '…'}`]);
  if (f.location_id) { const l = await byId('LOCATION', f.location_id); out.push([biText('rpt.area'), l ? `${l.location_code} · ${nameText(l)}` : f.location_id]); }
  if (f.panel_id) { const p = await byId('PANEL', f.panel_id); out.push([biText('ci.panel'), p ? p.panel_code : f.panel_id]); }
  if (f.status && STATUS_OPTS[d.definition.dataset]) out.push([biText('col.status'), biText(STATUS_OPTS[d.definition.dataset][0] + '.' + f.status)]);
  if (f.severity) out.push([biText('rp.severity'), biText('severity.' + f.severity)]);
  if (f.utility_type) out.push([biText('col.type'), biText('utility_type.' + f.utility_type)]);
  if (f.due) out.push([biText('excel.due'), biText('excel.due.' + f.due)]);
  if (f.window_hours) out.push([biText('ut.window_note', { W: f.window_hours }), '']);
  return out;
}

/** Biểu đồ của báo cáo: điện nước theo kỳ (mỗi loại một biểu đồ, không chung trục); đếm theo trạng thái (thanh ngang một màu) */
function chartHtml(d) {
  const ch = d.chart;
  if (!ch) return '';
  if (d.definition.dataset === 'UTILITIES' && ch.line) {
    const types = [...new Set(ch.line.flatMap((p) => Object.keys(p.totals || {})))];
    const pt = (d.period && d.period.period_type) || 'MONTH';
    return types.map((t) => columnChartHtml({ title: bi(t === 'WATER' ? 'ut.chart_water' : 'ut.chart_elec'), unit: UNIT[t], tone: TONE[t], points: chartPoints(ch.line, t, pt), stateKey: chartStateKey,
      tableHead: [biText('rpt.period'), UNIT[t]] })).join('');
  }
  if (ch.series) {
    const items = ch.series.map((s) => ({ label: biText(s.enumKey + '.' + s.key), value: s.value }));
    return barListHtml({ title: bi('rpt.chart'), items, empty: bi('rpt.no_rows') });
  }
  return '';
}

/** Bản xem trước như trang in (không logo): tiêu đề song ngữ, kỳ/khu vực, ngày lập, số báo cáo, tóm tắt, biểu đồ, chi tiết, chú thích, ký */
async function paperHtml(d, { code = '' } = {}) {
  const lines = await filterLines(d);
  const sum = summaryRows(d);
  const cols = d.columns || [];
  return `<article class="paper" aria-label="${esc(biText('rpt.preview_paper'))}">
    <h2 class="paper-title"><span>${esc(d.title_vi || '')}</span>${d.title_zh ? `<span class="zh"> / ${esc(d.title_zh)}</span>` : ''}</h2>
    <div class="paper-meta"><div>${lines.map(([k, v]) => `<div><span class="muted">${esc(k)}${v ? ':' : ''}</span> ${esc(v)}</div>`).join('')}</div>
      <div class="paper-meta-r"><div><span class="muted">${bi('rpt.generated_at')}:</span> ${esc(fmtDateTime(d.generated_at))}</div>
        ${code ? `<div><span class="muted">${bi('rpt.number')}:</span> <strong>${esc(code)}</strong></div>` : ''}
        <div><span class="muted">${bi('rpt.prepared_by')}:</span> ${esc(d.generated_by_name || '')}</div></div></div>
    ${sum.length ? `<h3>${bi('rpt.summary')}</h3><table class="tbl paper-sum"><tbody>${sum.map((s) => `<tr><td>${esc(s.label)}</td><td class="num"><strong>${esc(s.val)}</strong></td></tr>`).join('')}</tbody></table>` : ''}
    ${chartHtml(d)}
    <h3>${bi('rpt.detail')} <span class="muted small">${bi('rpt.rows_n', { N: fmtNumber(d.total_rows) })}</span></h3>
    ${d.rows.length ? `<div class="table-wrap"><table class="tbl paper-tbl"><thead><tr><th class="num">#</th>${cols.map((c) => `<th${isNumCol(c) ? ' class="num"' : ''}>${bi([c.label_vi, c.label_zh])}</th>`).join('')}</tr></thead>
      <tbody>${d.rows.slice(0, 500).map((r, i) => `<tr><td class="num muted">${i + 1}</td>${cols.map((c) => `<td${isNumCol(c) ? ' class="num"' : ''}>${cellHtml(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${bi('rpt.no_rows')}</p>`}
    ${d.rows.length > 500 ? `<p class="muted small">${bi('rpt.screen_first', { N: 500 })}</p>` : ''}
    ${d.truncated ? `<p class="muted small">${bi('rpt.truncated', { N: fmtNumber(d.total_rows) })}</p>` : ''}
    ${d.cost_hidden ? `<p class="muted small">${bi('cost.hidden')}</p>` : ''}
    ${(d.notes || []).map((n) => `<p class="muted small">${bi(n)}</p>`).join('')}
    <div class="paper-sign"><div>${bi('rpt.prepared_by')}<span class="sign-line"></span></div><div>${bi('rpt.approved_by')}<span class="sign-line"></span></div></div>
  </article>`;
}

/* ======================= Xuất Excel / PDF ======================= */

const stamp = (d) => String(d.generated_at || '').slice(0, 10);

/** Tệp Excel (5.4.6): Tóm tắt, Chi tiết (khóa + nhãn hai thứ tiếng; số #,##0, ngày thật, mã @), Điều kiện lọc. Không logo. */
async function excelFile(d, code, fileName) {
  const X = await loadXlsx();
  const wb = X.utils.book_new();
  const sum = summaryRows(d);
  X.utils.book_append_sheet(wb, aoaSheet(X, [[`${d.title_vi || ''} · ${d.title_zh || ''}`], [], [biText('rpt.summary'), ''], ...sum.map((s) => [s.label, s.val])]), biText('rpt.summary').slice(0, 31));
  const cols = d.columns || [];
  const keys = cols.map((c) => c.key);
  const labels = cols.map((c) => [c.label_vi, c.label_zh]);
  const types = cols.map((c) => (isNumCol(c) ? 'num' : c.type === 'date' ? 'date' : c.type === 'code' ? 'code' : 'text'));
  const money = cols.filter((c) => c.type === 'money');
  // Tiền: cả cột một loại tiền → mã tiền ở tiêu đề; nhiều loại → thêm cột tiền tệ (5.4.5)
  money.forEach((c) => {
    const curs = [...new Set(d.rows.map((r) => r[c.cur]).filter(Boolean))];
    const i = keys.indexOf(c.key);
    if (curs.length === 1) labels[i] = [`${c.label_vi} (${curs[0]})`, `${c.label_zh} (${curs[0]})`];
    else if (curs.length > 1 && !keys.includes(c.cur)) { keys.splice(i + 1, 0, c.cur); labels.splice(i + 1, 0, [biText('tariff.currency').split(' · ')[0], biText('tariff.currency').split(' · ')[1] || '']); types.splice(i + 1, 0, 'code'); }
  });
  const rows = d.rows.map((r) => keys.map((k) => { const c = cols.find((x) => x.key === k); return c ? cellText(c, r) : (r[k] || ''); }));
  X.utils.book_append_sheet(wb, buildSheet(X, keys, labels, types, rows), biText('rpt.detail').slice(0, 31));
  const lines = await filterLines(d);
  X.utils.book_append_sheet(wb, aoaSheet(X, [
    [biText('rpt.filters'), ''], ...lines,
    [biText('rpt.generated_at'), fmtDateTime(d.generated_at)], [biText('rpt.prepared_by'), d.generated_by_name || ''],
    ...(code ? [[biText('rpt.number'), code]] : []), [biText('rpt.rows_n', { N: d.total_rows }), ''],
    ...(d.cost_hidden ? [[biText('cost.hidden'), '']] : []), ...(d.notes || []).map((n) => [biText(n), '']), ['app', BUILD_VERSION]
  ]), biText('rpt.filters').slice(0, 31));
  const name = (fileName && fileName.replace(/\.xlsx$/i, '')) || `${code || d.definition.code}_${stamp(d)}`;
  return workbookFile(X, wb, name.replace(/[\\/:*?"<>|]+/g, '_') + '.xlsx');
}

/** Đưa tệp cho người dùng: máy tính tải thẳng; iPhone bước 2 "Mở / Lưu" gọi share trong lần chạm (2.6) */
function deliver(file, openBtn) {
  if (isTouchMobile() && openBtn) { files[openBtn.dataset.file] = file; openBtn.hidden = false; openBtn.focus(); toast(bi('rpt.export_done', { F: file.name }), 'ok'); return; }
  shareFileNow(file);
  toast(bi('rpt.export_done', { F: file.name }), 'ok');
}

function wireExports(root, getData, { runId = '', code = '', def = null } = {}) {
  const xl = $('[data-x="xlsx"]', root), pdf = $('[data-x="pdf"]', root);
  if (xl) xl.addEventListener('click', async (ev) => {
    busy(evBtn(ev), true);
    try {
      // Ghi nhật ký xuất ở máy chủ (report.export XLSX trả dữ liệu đã lọc theo quyền), dựng tệp trên máy
      const r = await api('report.export', runId ? { format: 'XLSX', report_run_id: runId } : { format: 'XLSX', code: def.code, filters: getData().filters }, { retry: true });
      if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
      deliver(await excelFile(r.data.report, code || r.data.report.report_run_code || '', def && def.file_name), $('[data-file="xlsx"]', root));
    } finally { busy(evBtn(ev), false); }
  });
  if (pdf) pdf.addEventListener('click', async (ev) => {
    busy(evBtn(ev), true);
    try {
      const r = await api('report.export', runId ? { format: 'PDF', report_run_id: runId } : { format: 'PDF', code: def.code, filters: getData().filters }, { retry: true, timeoutMs: (session.settings.client_long_timeout_seconds || 55) * 1000 });
      if (!r.ok) { toast(esc(resMsg(r) + ((r.errors || [])[0] ? ' — ' + (r.errors[0].message_vi || r.errors[0].code) : '')), 'err'); return; }
      deliver(new File([b64ToBytes(r.data.content_b64)], r.data.file_name, { type: 'application/pdf' }), $('[data-file="pdf"]', root));
    } finally { busy(evBtn(ev), false); }
  });
  $$('[data-file]', root).forEach((b) => b.addEventListener('click', () => { const f = files[b.dataset.file]; if (f) shareFileNow(f); }));
}

const exportBtns = (canX) => (canX ? `<button type="button" class="btn small" data-x="xlsx">${ICON.download}<span>${bi('btn.export_excel')}</span></button>
  <button type="button" class="btn small primary" data-file="xlsx" hidden>${bi('btn.open_save')}</button>
  <button type="button" class="btn small" data-x="pdf">${ICON.file}<span>PDF</span></button>
  <button type="button" class="btn small primary" data-file="pdf" hidden>${bi('btn.open_save')}</button>` : '');

/* ======================= Mẫu được xem ======================= */

async function definitions() {
  return (await recs('REPORT_DEFINITION')).filter((d) => !d.archived_at)
    .sort((a, b) => (a.builtin === b.builtin ? 0 : a.builtin ? -1 : 1) || Object.keys(DS_MODULE).indexOf(a.dataset) - Object.keys(DS_MODULE).indexOf(b.dataset) || String(a.code).localeCompare(String(b.code)));
}
async function defByCode(code) {
  return (await definitions()).find((d) => d.code === String(code || '').toUpperCase()) || null;
}

/* ======================= RE-01 / WEB-RE-01 ======================= */

export async function renderReports(view, ctx) {
  const { shell } = ctx;
  const wide = isWide();
  const canEditTpl = await can('report.definition.edit');
  shell.setScreen({ title: 'module.reports', back: '/', actions: [] });
  if (!RF.from) { RF.from = monthStart(); RF.to = today(); }
  const defs = (await definitions()).filter((d) => d.active !== false || canEditTpl);
  const runs = (await recs('REPORT_RUN')).filter((r) => !r.archived_at).sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)));
  const locOpts = [...(await mapOf('LOCATION')).values()].filter((l) => l.active !== false).sort((a, b) => String(a.location_code).localeCompare(String(b.location_code)))
    .map((l) => [l.location_id, `${esc(l.location_code)} · ${esc(nameText(l))}`]);
  const q = (code) => `#/reports/run/${encodeURIComponent(code)}?${new URLSearchParams({ from: RF.from, to: RF.to, ...(RF.loc ? { location_id: RF.loc } : {}) })}`;
  const filters = `<section class="card rp-filters"><div class="form-grid rf-grid">
      ${dateInput('rf-from', 'ut.from', RF.from)}${dateInput('rf-to', 'ut.to', RF.to)}
      ${selectInput('rf-loc', 'rpt.area', locOpts, RF.loc, { empty: 'due_filter.ALL' })}
      ${wide ? selectInput('rf-group', 'rpt.group', Object.keys(DS_MODULE).map((k) => [k, bi('rpt_dataset.' + k)]), RF.group, { empty: 'due_filter.ALL' }) : ''}
      ${wide && canEditTpl ? selectInput('rf-active', 'col.status', [['1', bi('rpt.active')], ['0', bi('rpt.inactive')]], RF.active, { empty: 'due_filter.ALL' }) : ''}
    </div>
    <div class="row tools">${canEditTpl ? `<a class="btn small" href="#/reports/templates">${ICON.upload}<span>${bi('rpt.import_template')}</span></a><a class="btn small" href="#/reports/templates">${ICON.download}<span>${bi('rpt.export_template')}</span></a>` : ''}
      ${wide ? `<button type="button" class="btn small primary" id="rf-create" ${RF.sel ? '' : 'disabled'}>${ICON.reports}<span>${bi('rpt.create')}</span></button>` : ''}</div></section>`;
  const shownDefs = defs.filter((d) => (!RF.group || d.dataset === RF.group) && (RF.active === '' || (RF.active === '1') === (d.active !== false)));
  const savedHtml = runs.length ? (wide ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('rpt.code_col')}</th><th>${bi('rpt.name_col')}</th><th>${bi('rpt.by')}</th><th></th></tr></thead>
      <tbody>${runs.slice(0, 30).map((r) => `<tr><td class="code">${esc(r.report_run_code)}</td><td>${biName(r, 'title')}${runPeriod(r) ? `<div class="muted small">${esc(runPeriod(r))}</div>` : ''}</td>
        <td>${esc(r.generated_by_name || '')}<div class="muted small">${esc(fmtDateTime(r.generated_at))}</div></td>
        <td><div class="row"><a class="btn tiny" href="#/reports/saved/${esc(r.report_run_id)}">${ICON.eye}<span>${bi('btn.view')}</span></a>${r.qr_key ? `<a class="icon-btn" href="#/qr/REPORT_RUN/${esc(r.report_run_id)}" aria-label="${esc(biText('btn.view_qr'))}">${ICON.qr}</a>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`
    : `<ul class="list">${runs.slice(0, 20).map((r) => `<li><a href="#/reports/saved/${esc(r.report_run_id)}"><span class="code">${esc(r.report_run_code)}</span> ${biName(r, 'title')}</a><div class="muted small">${esc(runPeriod(r))} · ${esc(r.generated_by_name || '')} · ${esc(fmtDateTime(r.generated_at))}</div></li>`).join('')}</ul>`)
    : `<p class="muted">${bi('rpt.no_saved')}</p>`;
  if (!wide) {
    view.innerHTML = `${filters}
      <div class="cards rp-list">${shownDefs.map((d) => `<a class="card rp-item${RF.sel === d.code ? ' on' : ''}${d.active === false ? ' dim' : ''}" href="${q(d.code)}" data-code="${esc(d.code)}">
        <span class="rp-ico">${ICON[ICON_OF[DS_MODULE[d.dataset]] || 'reports']}</span><span class="rp-text">${biName(d, 'title')}${d.builtin ? '' : `<span class="muted small">${bi('rpt.custom')}</span>`}</span>${ICON.chevron}</a>`).join('') || `<p class="muted">${bi('field.no_records')}</p>`}</div>
      <section class="card"><div class="card-head"><h2>${bi('rpt.saved')}</h2></div>${savedHtml}</section>
      <p class="muted small">${bi('rpt.note.warehouse')}</p>`;
  } else {
    const sel = shownDefs.find((d) => d.code === RF.sel) || null;
    view.innerHTML = `${filters}<div class="rp-web">
      <div class="rp-left"><section class="card"><div class="card-head"><h2>${bi('rpt.templates')}</h2></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('rpt.template')}</th><th>${bi('rpt.group')}</th><th>${bi('rpt.format')}</th><th>${bi('rpt.updated')}</th><th></th></tr></thead>
        <tbody>${shownDefs.map((d) => `<tr class="click${RF.sel === d.code ? ' sel' : ''}" data-code="${esc(d.code)}"><td>${biName(d, 'title')}${d.active === false ? ` ${badge('rpt.inactive')}` : ''}${d.builtin ? '' : `<div class="muted small">${bi('rpt.custom')}</div>`}</td>
          <td>${bi('rpt_dataset.' + d.dataset)}</td><td>Excel / PDF</td><td class="num">${esc(fmtDate(String(d.updated_at || '').slice(0, 10)))}</td>
          <td><button type="button" class="btn tiny${RF.sel === d.code ? ' primary' : ''}" data-view="${esc(d.code)}">${ICON.eye}<span>${bi('btn.view')}</span></button></td></tr>`).join('')}</tbody></table></div></section>
        <section class="card"><div class="card-head"><h2>${bi('rpt.saved')}</h2></div>${savedHtml}</section>
        <p class="banner info small">${bi('rpt.note.warehouse')}</p></div>
      <div class="rp-right"><section class="card rp-preview"><div class="card-head"><h2>${bi('rpt.preview')}</h2><div class="row" id="rp-acts"></div></div><div id="rp-paper">${sel ? '<div class="spinner small"></div>' : `<p class="muted">${bi('rpt.pick_template')}</p>`}</div></section></div>
    </div>`;
    if (sel) await previewInto(view, sel, defaultsFor(sel, null));
  }
  wireForm(view);
  const again = () => renderReports(view, ctx);
  const readDates = () => { const a = readField(view, 'rf-from'), b = readField(view, 'rf-to'); if (a) RF.from = a; if (b) RF.to = b; if (RF.from > RF.to) { const t = RF.from; RF.from = RF.to; RF.to = t; } };
  ['rf-from', 'rf-to'].forEach((k) => { const el = $('#f-' + k, view); if (el) el.addEventListener('change', () => { readDates(); if (wide) again(); }); });
  const lc = $('#f-rf-loc', view); if (lc) lc.addEventListener('change', (e) => { RF.loc = e.target.value; if (wide) again(); });
  const gp = $('#f-rf-group', view); if (gp) gp.addEventListener('change', (e) => { RF.group = e.target.value; again(); });
  const ac = $('#f-rf-active', view); if (ac) ac.addEventListener('change', (e) => { RF.active = e.target.value; again(); });
  $$('.rp-item', view).forEach((a) => a.addEventListener('click', () => { readDates(); RF.sel = a.dataset.code; a.href = q(a.dataset.code); }));
  $$('tr[data-code]', view).forEach((tr) => tr.addEventListener('click', () => { RF.sel = tr.dataset.code; again(); }));
  const cr = $('#rf-create', view);
  if (cr) cr.addEventListener('click', () => { readDates(); if (RF.sel) navigate(q(RF.sel).slice(1)); });
}

function runPeriod(r) {
  const f = r.filters_json || {};
  if (f.period_type && f.period_type !== 'CUSTOM' && f.date) { const p = periodOf(f.period_type, f.date); return `${fmtDate(p[0])} – ${fmtDate(p[1])}`; }
  return f.from || f.to ? `${f.from ? fmtDate(f.from) : '…'} – ${f.to ? fmtDate(f.to) : '…'}` : '';
}

/** Xem trước trong vùng phải (web): chạy mẫu với bộ lọc chung, nút Excel/PDF/Lưu */
async function previewInto(view, def, filters) {
  const box = $('#rp-paper', view), acts = $('#rp-acts', view);
  if (!navigator.onLine) { box.innerHTML = `<p class="muted">${bi('rpt.need_network')}</p>`; return; }
  const r = await api('report.run', { code: def.code, filters }, { retry: true });
  if (!r.ok) { box.innerHTML = `<p class="banner warn">${esc(resMsg(r))}</p>`; return; }
  last = { key: def.code + JSON.stringify(filters), data: r.data };
  box.innerHTML = await paperHtml(r.data);
  wireCharts(box);
  const canX = await can('report.export');
  const canSave = await can('report.save');
  acts.innerHTML = `${exportBtns(canX)}${canSave ? `<button type="button" class="btn small" id="rp-save">${ICON.qr}<span>${bi('rpt.save')}</span></button>` : ''}
    <a class="btn small" href="#/reports/run/${encodeURIComponent(def.code)}?${new URLSearchParams(filters)}">${bi('btn.open')}</a>`;
  wireExports(acts, () => last.data, { def });
  const sv = $('#rp-save', acts);
  if (sv) sv.addEventListener('click', (ev) => saveReport(ev, def, filters));
}

async function saveReport(ev, def, filters) {
  busy(evBtn(ev), true);
  const id = uuid();
  const r = await writeOnline('report.save', { report_run_id: id, code: def.code, filters });
  busy(evBtn(ev), false);
  if (!r.ok) { await handleWriteError(r); return; }
  await afterCommit();
  toast(bi('rpt.saved_toast', { C: (r.data && r.data.display_code) || '' }), 'ok');
  navigate('/reports/saved/' + id);
}

/* ======================= RE-02 Báo cáo theo bộ lọc ======================= */

export async function renderReportRun(view, ctx) {
  const { shell, params, query } = ctx;
  const def = await defByCode(params.code);
  shell.setScreen({ title: 'module.reports', back: '/reports' });
  if (!def) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  shell.setScreen({ title: [def.title_vi || def.code, def.title_zh || ''], back: '/reports' });
  const f = defaultsFor(def, query);
  const schema = def.filter_schema || [];
  const locOpts = [...(await mapOf('LOCATION')).values()].filter((l) => l.active !== false).sort((a, b) => String(a.location_code).localeCompare(String(b.location_code)))
    .map((l) => [l.location_id, `${esc(l.location_code)} · ${esc(nameText(l))}`]);
  const panelOpts = schema.includes('panel_id') ? (await recs('PANEL')).filter((p) => !p.archived_at).sort((a, b) => String(a.panel_code).localeCompare(String(b.panel_code))).map((p) => [p.panel_id, `${esc(p.panel_code)} · ${esc(nameText(p))}`]) : [];
  const st = STATUS_OPTS[def.dataset];
  const fields = `<section class="card rp-filters"><div class="form-grid rf-grid">
    ${schema.includes('period_type') ? `<div class="fld wide"><div class="ut-flabel">${bi('rpt.period')}</div><div class="segs">${PERIOD_TYPES.map((k) => `<button type="button" class="seg${f.period_type === k ? ' on' : ''}" data-pt="${k}">${bi('period.' + k)}</button>`).join('')}</div></div>
      ${f.period_type === 'CUSTOM' ? `${dateInput('from', 'ut.from', query.get('from') || monthStart())}${dateInput('to', 'ut.to', query.get('to') || today())}` : dateInput('date', 'field.date', f.date)}` : ''}
    ${schema.includes('from') && !schema.includes('period_type') ? `${dateInput('from', 'ut.from', f.from)}${dateInput('to', 'ut.to', f.to)}` : ''}
    ${schema.includes('location_id') ? selectInput('location_id', 'rpt.area', locOpts, f.location_id || '', { empty: 'due_filter.ALL' }) : ''}
    ${schema.includes('panel_id') ? selectInput('panel_id', 'ci.panel', panelOpts, f.panel_id || '', { empty: 'due_filter.ALL' }) : ''}
    ${schema.includes('utility_type') ? selectInput('utility_type', 'col.type', [['ELECTRICITY', bi('utility_type.ELECTRICITY')], ['WATER', bi('utility_type.WATER')]], f.utility_type || '', { empty: 'due_filter.ALL' }) : ''}
    ${schema.includes('status') && st ? selectInput('status', 'col.status', st[1].map((s) => [s, bi(st[0] + '.' + s)]), f.status || '', { empty: 'due_filter.ALL' }) : ''}
    ${schema.includes('severity') ? selectInput('severity', 'rp.severity', ['HIGH', 'MEDIUM', 'LOW'].map((s) => [s, bi('severity.' + s)]), f.severity || '', { empty: 'due_filter.ALL' }) : ''}
    ${schema.includes('due') ? selectInput('due', 'excel.due', ['ALL', 'DUE40', 'OVERDUE'].map((s) => [s, bi('excel.due.' + s)]), f.due || 'ALL', { empty: '' }) : ''}
  </div><div class="row"><button type="button" class="btn small primary" id="rr-apply">${bi('rpt.create')}</button></div></section>`;
  if (!navigator.onLine) { view.innerHTML = fields + `<div class="card"><p class="muted">${bi('rpt.need_network')}</p></div>`; wireForm(view); return; }
  const key = def.code + JSON.stringify(f);
  let data = last.key === key ? last.data : null;
  if (!data) {
    view.innerHTML = fields + '<div class="card"><div class="spinner small"></div></div>';
    const r = await api('report.run', { code: def.code, filters: f }, { retry: true });
    if (!r.ok) { view.innerHTML = fields + `<div class="card"><p class="banner warn">${esc(resMsg(r))}</p></div>`; wireRun(view, ctx, def, f); return; }
    data = r.data;
    last = { key, data };
  }
  const canX = await can('report.export');
  const canSave = await can('report.save');
  view.innerHTML = `${fields}
    <section class="card rp-run-head"><div class="row rp-actions">${exportBtns(canX)}
      ${canSave ? `<button type="button" class="btn small" id="rp-save">${ICON.qr}<span>${bi('rpt.save')}</span></button>` : ''}</div>
      <p class="muted small">${bi('rpt.live_note')}</p></section>
    <section class="card">${await paperHtml(data)}</section>`;
  wireCharts(view);
  wireExports(view, () => last.data, { def });
  const sv = $('#rp-save', view);
  if (sv) sv.addEventListener('click', (ev) => saveReport(ev, def, f));
  wireRun(view, ctx, def, f);
}

function wireRun(view, ctx, def, f) {
  wireForm(view);
  const go = (patch) => {
    const q = { ...f, ...patch };
    Object.keys(q).forEach((k) => { if (q[k] === '' || q[k] === null || q[k] === undefined) delete q[k]; });
    last = { key: '', data: null };
    navigate(`/reports/run/${encodeURIComponent(def.code)}?${new URLSearchParams(q)}`, { replace: true });
  };
  $$('[data-pt]', view).forEach((b) => b.addEventListener('click', () => {
    const pt = b.dataset.pt;
    go(pt === 'CUSTOM' ? { period_type: pt, date: '', from: monthStart(), to: today() } : { period_type: pt, from: '', to: '', date: f.date || today() });
  }));
  const ap = $('#rr-apply', view);
  if (ap) ap.addEventListener('click', () => {
    const patch = {};
    for (const k of ['from', 'to', 'date']) { const v = readField(view, k); if (v === null) { toast(bi('field.invalid'), 'err'); return; } if (v !== undefined) patch[k] = v; }
    for (const k of ['location_id', 'panel_id', 'utility_type', 'status', 'severity', 'due']) { const v = readField(view, k); if (v !== undefined) patch[k] = v; }
    if (patch.from && patch.to && patch.from > patch.to) { const t = patch.from; patch.from = patch.to; patch.to = t; }
    if (patch.from) RF.from = patch.from;
    if (patch.to) RF.to = patch.to;
    if (patch.location_id !== undefined) RF.loc = patch.location_id;
    go(patch);
  });
}

/* ======================= Báo cáo đã lưu (bản chụp) ======================= */

export async function renderSavedReport(view, ctx) {
  const { shell, params } = ctx;
  const run = await byId('REPORT_RUN', params.id);
  shell.setScreen({
    title: 'rpt.saved', back: '/reports',
    actions: run && run.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/REPORT_RUN/${run.report_run_id}`) }] : []
  });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('rpt.need_network')}</div>`; return; }
  const r = await api('report.view', { report_run_id: params.id }, { retry: true });
  if (!r.ok) { view.innerHTML = `<div class="card"><p class="banner warn">${esc(resMsg(r))}</p></div>`; return; }
  const { run: rr, snapshot } = r.data;
  const canX = await can('report.export');
  view.innerHTML = `<section class="card rp-run-head"><div class="rec-top"><span class="code big">${esc(rr.report_run_code)}</span>${badge('report_status.' + (rr.status || 'SAVED'))}</div>
      <p class="muted small">${bi('rpt.snapshot_note', { T: fmtDateTime(rr.snapshot_at || rr.generated_at) })}</p>
      <div class="row rp-actions">${exportBtns(canX)}${rr.qr_key ? `<a class="btn small" href="#/qr/REPORT_RUN/${esc(rr.report_run_id)}">${ICON.qr}<span>${bi('btn.view_qr')}</span></a>` : ''}</div></section>
    <section class="card">${await paperHtml(snapshot, { code: rr.report_run_code })}</section>`;
  wireCharts(view);
  wireExports(view, () => snapshot, { runId: rr.report_run_id, code: rr.report_run_code });
}

/* ======================= RE-03 Mẫu báo cáo (C4) ======================= */

let dsCache = null;
async function datasetsInfo() {
  if (dsCache) return dsCache;
  const r = await api('report.view', { datasets: true }, { retry: true });
  dsCache = r.ok ? r.data.datasets : null;
  setTimeout(() => { dsCache = null; }, 60000);
  return dsCache;
}

export async function renderTemplates(view, ctx) {
  const { shell } = ctx;
  shell.setScreen({ title: 'rpt.template', back: '/reports' });
  if (!(await can('report.definition.edit'))) { view.innerHTML = `<div class="card">${bi('rpt.only_editor')}</div>`; return; }
  const defs = await definitions();
  view.innerHTML = `<div class="toolbar"><div class="row tools"><a class="btn small primary" href="#/reports/templates/new">${ICON.plus}<span>${bi('rpt.new_template')}</span></a></div></div>
    <div class="cards">${defs.map((d) => `<a class="card rec-card" href="#/reports/templates/${esc(d.report_definition_id)}"><div class="rec-top"><span class="code">${esc(d.code)}</span>${d.active === false ? badge('rpt.inactive') : badge('rpt.active')}</div>
      <div class="rec-name">${biName(d, 'title')}</div><div class="muted small">${bi('rpt_dataset.' + d.dataset)} · ${bi(d.builtin ? 'rpt.builtin' : 'rpt.custom')} · ${bi('rpt.allowed_roles')}: ${esc(d.allowed_roles || '1,2,3,4')}</div></a>`).join('')}</div>`;
}

export async function renderTemplateForm(view, ctx) {
  const { shell, params } = ctx;
  const id = params.id && params.id !== 'new' ? params.id : '';
  shell.setScreen({ title: id ? 'rpt.template' : 'rpt.new_template', back: '/reports/templates' });
  if (!(await can('report.definition.edit'))) { view.innerHTML = `<div class="card">${bi('rpt.only_editor')}</div>`; return; }
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('rpt.need_network')}</div>`; return; }
  const ds = await datasetsInfo();
  if (!ds) { view.innerHTML = `<div class="card">${bi('err.client')}</div>`; return; }
  const d0 = id ? (await recs('REPORT_DEFINITION')).find((x) => x.report_definition_id === id) : null;
  if (id && !d0) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const st = {
    dataset: d0 ? d0.dataset : Object.keys(ds)[0], cols: null, chart: d0 ? d0.chart_type || 'AUTO' : 'AUTO',
    roles: String(d0 ? d0.allowed_roles || '1,2,3,4' : '1,2,3,4').split(',').map(Number), file: d0 ? d0.file_name || '' : '', active: d0 ? d0.active !== false : true,
    code: d0 ? d0.code : '', title_vi: d0 ? d0.title_vi : '', title_zh: d0 ? d0.title_zh : ''
  };
  const allCols = () => (ds[st.dataset] || { columns: [] }).columns;
  st.cols = d0 && Array.isArray(d0.visible_columns) && d0.visible_columns.length ? d0.visible_columns.slice() : allCols().map((c) => c.key);
  const builtin = !!(d0 && d0.builtin);
  const paint = () => {
    const cols = allCols();
    const order = st.cols.filter((k) => cols.some((c) => c.key === k)).concat(cols.map((c) => c.key).filter((k) => !st.cols.includes(k)));
    view.innerHTML = `<form class="card form-card" novalidate>
      ${builtin ? `<p class="banner info">${bi('rpt.builtin_fixed')}</p>` : ''}
      <div class="form-grid">
        ${textInput('code', 'rpt.code', st.code, { maxlength: 40, upper: true, hint: bi('rpt.code_hint') })}
        ${bilingualInputs('title', { title_vi: st.title_vi, title_zh: st.title_zh }, { labelKey: 'rpt.kind', required: true })}
        ${selectInput('dataset', 'rpt.source', Object.keys(ds).map((k) => [k, bi('rpt_dataset.' + k)]), st.dataset, { empty: '' })}
        ${selectInput('chart_type', 'rpt.chart', ['AUTO', 'NONE', 'BAR', 'LINE'].map((k) => [k, bi('chart_type.' + k)]), st.chart, { empty: '' })}
        ${textInput('file_name', 'rpt.file_name', st.file, { maxlength: 120, placeholder: 'ME_Report_Template.xlsx' })}
      </div>
      <fieldset class="bi-pair"><legend>${bi('rpt.columns')}</legend><ul class="rp-cols">${order.map((k, i) => { const c = cols.find((x) => x.key === k); return `<li>
        <label class="check"><input type="checkbox" data-col="${esc(k)}" ${st.cols.includes(k) ? 'checked' : ''}><span>${bi([c.label_vi, c.label_zh])}${c.cost ? ` <span class="badge t-amber">${bi('ut.cost')}</span>` : ''}</span></label>
        <span class="rp-move"><button type="button" class="icon-btn" data-up="${esc(k)}" ${i ? '' : 'disabled'} aria-label="${esc(biText('rpt.move_up'))}">↑</button><button type="button" class="icon-btn" data-down="${esc(k)}" ${i < order.length - 1 ? '' : 'disabled'} aria-label="${esc(biText('rpt.move_down'))}">↓</button></span></li>`; }).join('')}</ul></fieldset>
      <fieldset class="bi-pair"><legend>${bi('rpt.allowed_roles')}</legend><div class="row">${ROLES.map((n) => `<label class="check inline"><input type="checkbox" data-role="${n}" ${st.roles.includes(n) ? 'checked' : ''}><span>${bi('level.' + n)}</span></label>`).join('')}</div></fieldset>
      <label class="check"><input type="checkbox" id="f-active" ${st.active ? 'checked' : ''}><span>${bi('rpt.active')}</span></label>
      <p class="form-err err" role="alert"></p>
      <div class="row form-actions">
        <label class="btn file">${ICON.upload}<span>${bi('rpt.import_template')}</span><input type="file" accept=".xlsx" id="tp-file" hidden></label>
        <button type="button" class="btn" id="tp-export">${ICON.download}<span>${bi('rpt.export_template')}</span></button>
        <button type="button" class="btn primary" id="tp-save">${bi('rpt.save_template')}</button></div></form>`;
    const form = $('form', view);
    wireForm(form);
    if (d0) $('#f-code', form).disabled = true;
    if (builtin) { $('#f-dataset', form).disabled = true; ['title_vi', 'title_zh'].forEach((k) => { $('#f-' + k, form).disabled = true; }); }
    const grab = () => {
      st.code = readField(form, 'code') || st.code; st.title_vi = readField(form, 'title_vi'); st.title_zh = readField(form, 'title_zh');
      st.chart = readField(form, 'chart_type'); st.file = readField(form, 'file_name'); st.active = $('#f-active', form).checked;
      st.roles = ROLES.filter((n) => $(`[data-role="${n}"]`, form).checked);
      const on = $$('[data-col]', form).filter((x) => x.checked).map((x) => x.dataset.col);
      st.cols = order.filter((k) => on.includes(k));
    };
    $('#f-dataset', form).addEventListener('change', (e) => { grab(); st.dataset = e.target.value; st.cols = allCols().map((c) => c.key); paint(); });
    $$('[data-up],[data-down]', form).forEach((b) => b.addEventListener('click', () => {
      grab();
      const k = b.dataset.up || b.dataset.down;
      const i = order.indexOf(k), j = b.dataset.up ? i - 1 : i + 1;
      [order[i], order[j]] = [order[j], order[i]];
      const on = new Set(st.cols);
      st.cols = order.filter((x) => on.has(x));
      st.order = order;
      paint();
    }));
    $('#tp-export', form).addEventListener('click', async (ev) => {
      grab();
      busy(evBtn(ev), true);
      try {
        const X = await loadXlsx();
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, aoaSheet(X, [['key', 'value'], ['code', st.code], ['title_vi', st.title_vi || ''], ['title_zh', st.title_zh || ''], ['dataset', st.dataset],
          ['chart_type', st.chart], ['allowed_roles', st.roles.join(',')], ['file_name', st.file || ''], ['active', st.active ? 'TRUE' : 'FALSE']]), 'report_template');
        X.utils.book_append_sheet(wb, aoaSheet(X, [['column_key', biText('rpt.columns')], ...st.cols.map((k) => { const c = allCols().find((x) => x.key === k); return [k, c ? `${c.label_vi} · ${c.label_zh}` : '']; })]), 'columns');
        X.utils.book_append_sheet(wb, aoaSheet(X, [['template_key', 'report_template'], ['version', '1']]), '_meta');
        deliver(workbookFile(X, wb, `ME_report_template_${(st.code || 'NEW').replace(/[^A-Z0-9_]/gi, '')}.xlsx`), null);
      } finally { busy(evBtn(ev), false); }
    });
    $('#tp-file', form).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const X = await loadXlsx();
        const wb = X.read(await f.arrayBuffer(), { type: 'array' });
        const kv = {};
        (X.utils.sheet_to_json(wb.Sheets.report_template || {}, { header: 1 }) || []).forEach((r) => { if (r[0] && r[0] !== 'key') kv[String(r[0])] = String(r[1] ?? '').trim(); });
        const colKeys = (X.utils.sheet_to_json(wb.Sheets.columns || {}, { header: 1 }) || []).slice(1).map((r) => String(r[0] || '').trim()).filter(Boolean);
        if (!kv.dataset || !ds[kv.dataset]) { toast(bi('rpt.import_bad'), 'err'); return; }
        if (!builtin) { st.dataset = kv.dataset; if (!d0 && kv.code) st.code = kv.code.toUpperCase(); if (kv.title_vi || kv.title_zh) { st.title_vi = kv.title_vi || ''; st.title_zh = kv.title_zh || ''; } }
        if (kv.chart_type && ['AUTO', 'NONE', 'BAR', 'LINE'].includes(kv.chart_type)) st.chart = kv.chart_type;
        if (kv.allowed_roles) st.roles = kv.allowed_roles.split(/[,\s]+/).map(Number).filter((n) => ROLES.includes(n));
        if (kv.file_name !== undefined) st.file = kv.file_name;
        if (kv.active) st.active = !/^(false|0|no|không)$/i.test(kv.active);
        const valid = colKeys.filter((k) => allCols().some((c) => c.key === k));
        if (valid.length) st.cols = valid;
        paint();
        toast(bi('rpt.import_read'), 'ok');
      } catch (er) { toast(bi('rpt.import_bad'), 'err'); }
    });
    $('#tp-save', form).addEventListener('click', async (ev) => {
      grab();
      const errs = [];
      if (!st.cols.length) errs.push({ field: 'columns', key: 'field.required' });
      if (!st.roles.length) errs.push({ field: 'allowed_roles', key: 'field.required' });
      if (!d0 && !/^[A-Z][A-Z0-9_]{2,39}$/.test(st.code || '')) errs.push({ field: 'code', key: 'field.invalid' });
      if (!builtin && !st.title_vi && !st.title_zh) errs.push({ field: 'title', key: 'field.required' });
      if (errs.length) { showErrors(form, errs); return; }
      const all = allCols().map((c) => c.key);
      const p = { report_definition_id: d0 ? d0.report_definition_id : uuid(), chart_type: st.chart, allowed_roles: st.roles.join(','), file_name: st.file || '', active: st.active,
        visible_columns: st.cols.length === all.length && st.cols.every((k, i) => k === all[i]) ? null : st.cols };
      if (!d0) { p.code = st.code; p.dataset = st.dataset; }
      if (!builtin) { p.title_vi = st.title_vi; p.title_zh = st.title_zh; if (d0 && st.dataset !== d0.dataset) p.dataset = st.dataset; }
      busy(evBtn(ev), true);
      const r = await writeOnline('report.definition.edit', p, { expected_version: d0 ? d0.record_version : 0 });
      busy(evBtn(ev), false);
      if (r.ok) { await afterCommit(); toast(bi('rpt.template_saved'), 'ok'); navigate('/reports/templates', { replace: true }); return; }
      if (r.code === 'VALIDATION_ERROR') { showErrors(form, r.errors); return; }
      await handleWriteError(r);
    });
  };
  paint();
}

export { back, addDays, L };
