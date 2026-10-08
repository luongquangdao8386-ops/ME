// Nhập/xuất Excel (CM-03, 1.4 §11, phụ lục 6.5.1): tải mẫu, chọn tệp → xem trước theo khúc → lỗi theo dòng → gửi duyệt / nhập dữ liệu; xuất theo quyền
import { api, bi, biText, esc, badge, fmtDateTime, fmtNumber, uuid, resMsg, session, BUILD_VERSION } from '../core.js';
import { $, $$, ICON, toast, dialog } from '../ui.js';
import { can, roleLevel } from '../data.js';
import { writeOnline, writeWithPin, busy } from '../form.js';
import { afterCommit } from '../app.js';
import { loadXlsx, readImportFile, buildSheet, aoaSheet, workbookFile } from '../xlsx.js';
import { shareFileNow } from '../media.js';
import { handleWriteError } from './equipment.js';

const MODULE_OF = {
  glossary: 'catalog', locations: 'catalog', lookups: 'catalog', vendors: 'catalog', materials: 'warehouse', equipment: 'equipment', equipment_parts: 'equipment',
  inspection_types: 'inspections', inspection_requirements: 'inspections', inspections: 'inspections', contracts: 'contracts'
};
const DUE_FILTER = { inspection_requirements: true, contracts: true };
/** Các mẫu cùng nhóm (chip chuyển nhanh) và màn quay lại */
const GROUPS = [['equipment', 'equipment_parts'], ['materials', 'equipment_parts'], ['inspection_requirements', 'inspections', 'inspection_types'], ['contracts'], ['glossary', 'locations', 'lookups', 'vendors'], ['alerts']];
const BACK = {
  equipment: '/equipment', equipment_parts: '/equipment', materials: '/materials', inspection_requirements: '/inspections', inspections: '/inspections', inspection_types: '/inspections',
  contracts: '/contracts', glossary: '/admin/catalog', locations: '/admin/catalog', lookups: '/admin/catalog', vendors: '/admin/catalog', alerts: '/alerts'
};
const CHUNK = 150;
const state = { batch: null, summary: null, progress: '' };

const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const needNet = () => `<p class="muted">${bi('sync.need_network')}</p>`;

/** Tệp xuất: sheet dữ liệu (dòng 1 khóa, dòng 2 nhãn, từ dòng 3) + Điều kiện lọc + _meta (nhập lại được) */
async function exportFile(key, due) {
  const r = await api('export.xlsx', key === 'alerts' ? { list: 'alerts' } : { template_key: key, due }, { retry: true, timeoutMs: (session.settings.client_long_timeout_seconds || 55) * 1000 });
  if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
  const X = await loadXlsx();
  const d = r.data;
  const wb = X.utils.book_new();
  d.sheets.forEach((s) => X.utils.book_append_sheet(wb, buildSheet(X, s.keys, s.labels, s.types, s.rows), s.name));
  X.utils.book_append_sheet(wb, aoaSheet(X, [
    [biText('excel.filters'), ''],
    ...d.filters.map(([k, v]) => [k, v]),
    [biText('excel.generated_at'), fmtDateTime(d.generated_at)],
    [biText('excel.generated_by'), d.generated_by],
    [biText('excel.scope'), d.scope],
    ['env', d.env], ['app', BUILD_VERSION]
  ]), biText('excel.filters').slice(0, 31));
  X.utils.book_append_sheet(wb, aoaSheet(X, [['template_key', key], ['version', d.template_version], ['dataset_epoch', d.dataset_epoch]]), '_meta');
  const file = workbookFile(X, wb, `ME_${key}_${stamp()}.xlsx`);
  toast(bi('excel.exported'), 'ok');
  return shareFileNow(file);
}

/** Mẫu .xlsx: sheet theo mẫu + Hướng dẫn + Danh mục mã + _meta */
async function templateFile(key) {
  const r = await api('import.template', { template_key: key }, { retry: true });
  if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
  const X = await loadXlsx();
  const d = r.data;
  const wb = X.utils.book_new();
  d.sheets.forEach((s) => {
    const types = s.cols.map((c) => (c.text ? 'code' : c.type === 'date' ? 'date' : c.type === 'int' || c.type === 'num' ? 'num' : 'text'));
    X.utils.book_append_sheet(wb, buildSheet(X, s.cols.map((c) => c.key), s.cols.map((c) => [c.label_vi, c.label_zh]), types, [], { textRows: 300 }), s.name);
  });
  const guide = [[biText('excel.guide.title')], ...[1, 2, 3, 4, 5, 6].map((i) => [biText('excel.guide.' + i)]), []];
  d.sheets.forEach((s) => {
    guide.push([s.name]);
    guide.push(['key', biText('excel.field'), biText('excel.required'), biText('excel.options')]);
    s.cols.forEach((c) => guide.push([c.key, `${c.label_vi} · ${c.label_zh}`, c.required ? '✓' : c.required_add ? '✓ (ADD)' : '', (c.options || []).join(', ')]));
    guide.push([]);
  });
  X.utils.book_append_sheet(wb, aoaSheet(X, guide), biText('excel.guide.title').slice(0, 31));
  const lists = [];
  Object.entries(d.lists || {}).forEach(([name, items]) => { lists.push([name]); items.forEach((x) => lists.push(x)); lists.push([]); });
  X.utils.book_append_sheet(wb, aoaSheet(X, lists.length ? lists : [['—']]), biText('excel.lists').slice(0, 31));
  X.utils.book_append_sheet(wb, aoaSheet(X, [['template_key', key], ['version', d.version], ['dataset_epoch', d.dataset_epoch]]), '_meta');
  return shareFileNow(workbookFile(X, wb, `ME_mau_${key}_v${d.version}.xlsx`));
}

/** Danh sách lỗi .xlsx (số dòng, cột, lỗi song ngữ) */
async function errorsFile(key, errors) {
  const X = await loadXlsx();
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, aoaSheet(X, [[biText('excel.sheet'), biText('excel.row'), biText('excel.field'), 'code', biText('excel.errors')],
    ...errors.map((e) => [e.sheet, e.row, e.field || '', e.code, `${e.message_vi} · ${e.message_zh}`])]), 'errors');
  return shareFileNow(workbookFile(X, wb, `ME_loi_${key}_${stamp()}.xlsx`));
}

/** Đọc tệp, gửi xem trước theo khúc */
async function previewFile(view, key, sheets, file, repaint) {
  state.progress = bi('excel.reading'); repaint();
  let parsed;
  try { parsed = await readImportFile(file, sheets); } catch (e) { state.progress = ''; toast(bi('excel.bad_file', { S: '' }), 'err'); repaint(); return; }
  if (parsed.missing.length === sheets.length) { state.progress = ''; toast(bi('excel.bad_file', { S: parsed.missing.join(', ') }), 'err'); repaint(); return; }
  if (!parsed.rows.length) { state.progress = ''; toast(bi('excel.no_rows'), 'err'); repaint(); return; }
  const batch = uuid();
  const n = Math.ceil(parsed.rows.length / CHUNK);
  let r;
  for (let i = 0; i < n; i++) {
    state.progress = bi('excel.sending', { N: Math.min((i + 1) * CHUNK, parsed.rows.length), T: parsed.rows.length }); repaint();
    r = await writeOnline('import.preview', {
      import_batch_id: batch, template_key: key, chunk_index: i, chunk_count: n, total_rows: parsed.rows.length, source_sha256: parsed.sha,
      meta: parsed.meta.template_key ? parsed.meta : undefined, rows: parsed.rows.slice(i * CHUNK, (i + 1) * CHUNK)
    });
    if (!r.ok) break;
  }
  state.progress = '';
  if (!r.ok) { if (r.code === 'VALIDATION_ERROR') toast(esc((r.errors || []).map((e) => `${e.message_vi} · ${e.message_zh}`).join('; ')), 'err'); else await handleWriteError(r); repaint(); return; }
  state.batch = batch;
  state.summary = r.data;
  repaint();
}

/** Ghi lô theo khúc: khúc đầu hỏi PIN, khúc sau không hỏi (trong 30 phút) */
async function commitBatch(repaint) {
  const id = state.batch;
  let r = await writeWithPin('import.commit', { import_batch_id: id });
  while (r.ok && r.data && r.data.status === 'PARTIAL' && r.data.remaining > 0) {
    state.summary = { ...state.summary, ...r.data };
    state.progress = bi('excel.committing', { N: r.data.committed, T: r.data.total_rows }); repaint();
    r = await writeOnline('import.commit', { import_batch_id: id });
    if (r.code === 'REAUTH_REQUIRED') r = await writeWithPin('import.commit', { import_batch_id: id });
  }
  state.progress = '';
  if (r.ok) { state.summary = { ...state.summary, ...r.data }; await afterCommit(); toast(bi('excel.committed', { N: r.data.committed }), 'ok'); } else if (r.code !== 'REAUTH_REQUIRED') await handleWriteError(r);
  repaint();
}

function summaryHtml(key, s) {
  const st = badge('import_status.' + s.status);
  const counts = `<div class="kv-grid"><div class="kv"><span>${bi('excel.add')}</span><strong>${fmtNumber(s.add_count || 0)}</strong></div>
    <div class="kv"><span>${bi('excel.update')}</span><strong>${fmtNumber(s.update_count || 0)}</strong></div>
    <div class="kv"><span>${bi('excel.errors')}</span><strong>${fmtNumber(s.error_count || 0)}</strong></div>
    ${s.committed !== undefined ? `<div class="kv"><span>${bi('import_status.COMMITTED')}</span><strong>${fmtNumber(s.committed)}</strong></div>` : ''}</div>`;
  const notes = [
    s.mt_fields ? `<p class="muted small">${bi('excel.mt_fields', { N: s.mt_fields })}</p>` : '',
    s.sensitive ? `<p class="banner warn">${bi('excel.sensitive')}</p>` : '',
    s.status === 'NEEDS_FIX' ? `<p class="banner err">${bi('excel.blocked')}</p>` : '',
    s.status === 'PENDING_APPROVAL' && s.mine ? `<p class="banner info">${bi('excel.wait_approval')}</p>` : '',
    s.failed ? `<p class="banner err">${bi('excel.failed_rows', { N: s.failed })}</p>` : ''
  ].join('');
  const errs = (s.errors || []).length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('excel.sheet')}</th><th>${bi('excel.row')}</th><th>${bi('excel.field')}</th><th>${bi('excel.errors')}</th></tr></thead>
    <tbody>${s.errors.map((e) => `<tr><td>${esc(e.sheet)}</td><td>${esc(e.row)}</td><td><code>${esc(e.field || '')}</code></td><td>${esc(e.message_vi)} · ${esc(e.message_zh)}</td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button type="button" class="btn small" id="x-errors">${ICON.download}${bi('excel.btn_errors')}</button></div>` : '';
  const changes = (s.changes || []).length ? `<details class="card"><summary><strong>${bi('excel.changes')}</strong> (${s.changes.length})</summary>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('excel.row')}</th><th>${bi('col.code')}</th><th>${bi('excel.field')}</th><th>${bi('adm.audit.before')}</th><th>${bi('adm.audit.after')}</th></tr></thead>
    <tbody>${s.changes.flatMap((c) => Object.entries(c.diff).map(([f, [a, b]]) => `<tr><td>${esc(c.row_number)}</td><td class="code">${esc(c.code)}</td><td><code>${esc(f)}</code></td><td>${esc(String(a))}</td><td>${esc(String(b))}</td></tr>`)).join('')}</tbody></table></div></details>` : '';
  const canCommit = s.can_commit && (s.status === 'PENDING_APPROVAL' || s.status === 'PARTIAL' || (s.status === 'READY' && s.mine)) && !(s.sensitive && s.mine);
  const actions = `<div class="row">
    ${canCommit ? `<button type="button" class="btn primary" id="x-commit">${bi('excel.btn_commit')}</button>` : ''}
    ${s.status === 'READY' && s.mine ? `<button type="button" class="btn${canCommit ? '' : ' primary'}" id="x-submit">${bi('excel.btn_submit')}</button>` : ''}
    ${['NEEDS_FIX', 'READY', 'PENDING_APPROVAL'].includes(s.status) && (s.mine || roleLevel() >= 3) ? `<button type="button" class="btn" id="x-cancel">${bi('excel.btn_cancel')}</button>` : ''}</div>`;
  return `<section class="card"><div class="card-head"><h2>${bi('excel.summary')}</h2>${st}</div>
    <p class="muted small">${[bi('excel.tpl.' + key), esc(s.imported_by_name || ''), esc(fmtDateTime(s.imported_at))].filter(Boolean).join(' · ')}</p>${counts}${notes}${errs}${actions}</section>${changes}`;
}

export async function renderExcel(view, { shell, params }) {
  const key = params.key;
  shell.setScreen({ title: 'excel.title', back: BACK[key] || '/' });
  const module = MODULE_OF[key];
  if (!module && key !== 'alerts') { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const canExport = await can('export.xlsx');
  const canImport = module ? await can('import.template') : false;
  let sheets = [];
  const repaint = () => renderExcel(view, { shell, params });
  if (state.key !== key) { state.key = key; state.batch = null; state.summary = null; state.progress = ''; state.list = null; }
  if (module === 'equipment' && key === 'equipment') sheets = ['equipment', 'equipment_specs'];
  else if (key === 'contracts') sheets = ['contracts', 'contract_equipment'];
  else sheets = [key];
  if (canImport && navigator.onLine && !state.list) {
    const l = await api('import.errors', {}, { retry: true });
    state.list = l.ok ? l.data.items.filter((b) => b.template_key === key) : [];
  }
  const exportCard = canExport ? `<section class="card"><h2>${bi('btn.export_excel')}</h2>
    ${DUE_FILTER[key] ? `<div class="row"><label class="inline">${bi('excel.due')} <select class="sel" id="x-due">${['ALL', 'DUE40', 'OVERDUE'].map((d) => `<option value="${d}">${bi('excel.due.' + d)}</option>`).join('')}</select></label></div>` : ''}
    <div class="row"><button type="button" class="btn" id="x-export"${navigator.onLine ? '' : ' disabled'}>${ICON.excel}${bi('btn.export_excel')}</button></div>${navigator.onLine ? '' : needNet()}</section>` : '';
  const importCard = canImport ? `<section class="card"><h2>${bi('btn.import_excel')}</h2>
    <ul class="muted small">${[1, 2, 3, 5].map((i) => `<li>${bi('excel.guide.' + i)}</li>`).join('')}</ul>
    <div class="row"><button type="button" class="btn" id="x-template"${navigator.onLine ? '' : ' disabled'}>${ICON.download}${bi('excel.download_template')}</button>
      <label class="btn primary file-btn${navigator.onLine ? '' : ' disabled'}">${ICON.upload}${bi('excel.choose_file')}<input type="file" id="x-file" accept=".xlsx,.xls,.csv" hidden${navigator.onLine ? '' : ' disabled'}></label></div>
    ${state.progress ? `<p class="banner info" role="status">${state.progress}</p>` : ''}${navigator.onLine ? '' : needNet()}</section>` : '';
  const list = canImport && state.list && state.list.length ? `<section class="card"><h2>${bi('excel.batches')}</h2>
    <ul class="list">${state.list.map((b) => `<li><button type="button" class="link" data-batch="${esc(b.import_batch_id)}">${[esc(fmtDateTime(b.imported_at)), esc(b.imported_by_name || ''), fmtNumber(b.total_rows) + ' ' + bi('excel.row')].filter(Boolean).join(' · ')}</button> ${badge('import_status.' + b.status)}</li>`).join('')}</ul></section>` : '';
  const group = GROUPS.find((g) => g.includes(key)) || [key];
  const chips = group.length > 1 ? `<div class="chips">${group.map((k) => `<a class="chip${k === key ? ' on' : ''}" href="#/excel/${k}">${bi('excel.tpl.' + k)}</a>`).join('')}</div>` : `<p><strong>${bi('excel.tpl.' + key)}</strong></p>`;
  view.innerHTML = `${chips}${exportCard}${importCard}${state.summary ? summaryHtml(key, state.summary) : ''}${list}`;
  const ex = $('#x-export', view);
  if (ex) ex.addEventListener('click', async (ev) => { busy(ev.currentTarget, true); try { await exportFile(key, ($('#x-due', view) || {}).value || 'ALL'); } finally { busy(ev.currentTarget, false); } });
  const tp = $('#x-template', view);
  if (tp) tp.addEventListener('click', async (ev) => { busy(ev.currentTarget, true); try { await templateFile(key); } finally { busy(ev.currentTarget, false); } });
  const fi = $('#x-file', view);
  if (fi) fi.addEventListener('change', () => { const f = fi.files && fi.files[0]; if (f) previewFile(view, key, sheets, f, repaint); });
  const er = $('#x-errors', view);
  if (er) er.addEventListener('click', () => errorsFile(key, state.summary.errors || []));
  const cm = $('#x-commit', view);
  if (cm) cm.addEventListener('click', async (ev) => { busy(ev.currentTarget, true); await commitBatch(repaint); });
  const sb = $('#x-submit', view);
  if (sb) sb.addEventListener('click', async (ev) => {
    busy(ev.currentTarget, true);
    const r = await writeOnline('import.submit', { import_batch_id: state.batch });
    if (r.ok) { state.summary = { ...state.summary, ...r.data }; state.list = null; repaint(); } else { busy(ev.currentTarget, false); await handleWriteError(r); }
  });
  const cc = $('#x-cancel', view);
  if (cc) cc.addEventListener('click', async () => {
    const ok = await dialog({ title: bi('excel.btn_cancel'), body: '', actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('excel.btn_cancel'), kind: 'primary', value: true }] });
    if (!ok) return;
    const r = await writeOnline('import.cancel', { import_batch_id: state.batch });
    if (r.ok) { state.summary = null; state.batch = null; state.list = null; repaint(); } else await handleWriteError(r);
  });
  $$('[data-batch]', view).forEach((b) => b.addEventListener('click', async () => {
    const r = await api('import.errors', { import_batch_id: b.dataset.batch }, { retry: true });
    if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
    state.batch = b.dataset.batch; state.summary = r.data; repaint();
  }));
}
