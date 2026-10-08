// Màn phụ: phần đợt sau (Sắp có), bàn thử PoC cho owner, Kiểm định/Hợp đồng tạm thời, xem QR, in tem (6.5.2)
import { bi, biText, esc, fmtDate, badge, biName, nameText, session, ls, L } from '../core.js';
import { ICON, toast } from '../ui.js';
import { MODULES } from '../shell.js';
import { recs, byId, mapOf, can, isOwner, roleLevel, dueInfo, requirementRecordStatus, boot } from '../data.js';
import { currentPath, navigate } from '../router.js';
import { app } from '../app.js';

export async function renderComingSoon(view, { shell }) {
  const path = currentPath();
  const m = MODULES.find((x) => x.path === path);
  shell.setScreen({ title: m ? 'module.' + m.key : 'nav.work', back: '/' });
  view.innerHTML = `<div class="card empty-state">${m ? ICON[m.icon] : ICON.work}<p>${bi('tag.coming_soon')}</p><p class="muted">${bi('tag.coming_soon_hint')}</p></div>`;
}

/** Bàn thử PoC (Bước 0) — trang ẩn, chỉ owner mở từ Tài khoản */
export async function renderPocPage(view, { shell }) {
  shell.setScreen({ title: 'account.poc', back: '/account' });
  if (!isOwner()) { view.innerHTML = `<div class="card"><p>${bi('err.forbidden')}</p></div>`; return; }
  const { renderPoc } = await import('../poc.js');
  await renderPoc(view, { isOwner: roleLevel() === 4, offline: app.offline || !navigator.onLine });
}

/* ---------------- Kiểm định, Hợp đồng: bản xem tạm (màn đầy đủ làm ở phần sau của Đợt 1) ---------------- */

const interimNote = () => `<p class="banner info">${bi('misc.interim')}</p>`;

export async function renderInspectionsInterim(view, { shell, params }) {
  const reqs = await recs('INSPECTION_REQUIREMENT');
  const insp = await recs('INSPECTION');
  const types = await mapOf('INSPECTION_TYPE');
  const eqs = await mapOf('EQUIPMENT');
  if (params.id && currentPath().startsWith('/inspections/record/')) {
    const i = insp.find((x) => x.inspection_id === params.id);
    shell.setScreen({ title: 'module.inspections', back: '/inspections' });
    view.innerHTML = interimNote() + (i ? `<div class="card"><h2>${esc(i.inspection_code || biText('tag.pending_code'))}</h2>
      <div class="kv"><span>${bi('field.inspection_date')}</span><strong>${esc(fmtDate(i.inspection_date))}</strong></div>
      <div class="kv"><span>${bi('field.result')}</span>${badge('inspection_result.' + i.result)}</div>
      <div class="kv"><span>${bi('col.status')}</span>${badge('cert_status.' + i.status)}</div>
      <div class="kv"><span>${bi('field.valid_to')}</span><strong>${esc(fmtDate(i.valid_to))}</strong></div></div>` : `<div class="card">${bi('err.not_found')}</div>`);
    return;
  }
  if (params.id) {
    const r = reqs.find((x) => x.requirement_id === params.id);
    shell.setScreen({ title: 'module.inspections', back: '/inspections' });
    if (!r) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
    const t = types.get(r.inspection_type_id), e = eqs.get(r.equipment_id);
    const due = dueInfo(r.current_due_date);
    const rs = requirementRecordStatus(r, insp);
    view.innerHTML = interimNote() + `<div class="card"><h2>${esc(r.requirement_code)}</h2>
      <div class="kv"><span>${bi('field.inspection_type')}</span><strong>${t ? biName(t) : ''}</strong></div>
      <div class="kv"><span>${bi('module.equipment')}</span><strong>${e ? `<a href="#/equipment/${esc(e.equipment_id)}">${esc(e.equipment_code)}</a> ${biName(e)}` : ''}</strong></div>
      <div class="kv"><span>${bi('field.valid_to')}</span><strong>${esc(fmtDate(r.current_due_date) || biText('field.not_set'))}</strong></div>
      <div class="kv"><span>${bi('col.status')}</span><span>${badge(due.key, due.vars)} ${badge('record_status.' + rs)}</span></div>
      ${r.qr_key ? `<div class="row"><a class="btn small" href="#/qr/INSPECTION_REQUIREMENT/${esc(r.requirement_id)}">${ICON.qr}<span>${bi('btn.view_qr')}</span></a></div>` : ''}</div>
      <div class="card"><h3>${bi('tab.history')}</h3><ul class="list">${insp.filter((i) => i.requirement_id === r.requirement_id).map((i) =>
        `<li><a href="#/inspections/record/${esc(i.inspection_id)}">${esc(i.inspection_code)}</a> · ${esc(fmtDate(i.inspection_date))} · ${badge('inspection_result.' + i.result)} ${badge('cert_status.' + i.status)}</li>`).join('') || `<li class="muted">${bi('history.empty')}</li>`}</ul></div>`;
    return;
  }
  shell.setScreen({ title: 'module.inspections', back: '/' });
  view.innerHTML = interimNote() + `<div class="cards">${reqs.map((r) => {
    const t = types.get(r.inspection_type_id), e = eqs.get(r.equipment_id);
    const due = dueInfo(r.current_due_date);
    return `<a class="card rec-card" href="#/inspections/${esc(r.requirement_id)}"><div class="rec-top"><span class="code">${esc(r.requirement_code)}</span>${badge(due.key, due.vars)}</div>
      <div class="rec-name">${t ? biName(t) : ''}</div><div class="muted">${e ? esc(e.equipment_code + ' · ' + nameText(e)) : ''}</div></a>`;
  }).join('') || `<p class="muted">${bi('draft.empty')}</p>`}</div>`;
}

export async function renderAdminInterim(view, { shell, params }) {
  shell.setScreen({ title: 'admin.' + params.page, back: '/account' });
  view.innerHTML = interimNote();
}

export async function renderContractsInterim(view, { shell }) {
  shell.setScreen({ title: 'module.contracts', back: '/' });
  const list = await recs('CONTRACT');
  view.innerHTML = interimNote() + `<div class="cards">${list.map((c) => `<div class="card rec-card"><span class="code">${esc(c.contract_code)}</span><div>${biName(c, 'title')}</div></div>`).join('') || `<p class="muted">${bi('draft.empty')}</p>`}</div>`;
}

/* ---------------- QR: xem trong hồ sơ, in tem (6.5.2) ---------------- */

const QR_TYPES = {
  EQUIPMENT: { type: 'EQUIPMENT', code: 'equipment_code', back: '/equipment/' },
  MATERIAL: { type: 'MATERIAL', code: 'material_code', back: '/materials/' },
  INSPECTION_REQUIREMENT: { type: 'INSPECTION_REQUIREMENT', code: 'requirement_code', back: '/inspections/' },
  CONTRACT: { type: 'CONTRACT', code: 'contract_code', back: '/contracts/' },
  INSPECTION: { type: 'INSPECTION', code: 'inspection_code', back: '/inspections/record/' }
};

/** Mục in tem: tên lấy theo loại hồ sơ; yêu cầu kiểm định dùng tên loại kiểm định + thiết bị */
export async function labelItem(type, rec) {
  const cfg = QR_TYPES[type];
  let nv = rec.name_vi || rec.title_vi || '', nz = rec.name_zh || rec.title_zh || '';
  let locId = rec.location_id;
  if (type === 'INSPECTION_REQUIREMENT') {
    const t = await byId('INSPECTION_TYPE', rec.inspection_type_id);
    const e = await byId('EQUIPMENT', rec.equipment_id);
    nv = [t && t.name_vi, e && e.equipment_code].filter(Boolean).join(' — ');
    nz = [t && t.name_zh, e && e.equipment_code].filter(Boolean).join(' — ');
    if (!locId && e) locId = e.location_id;
  }
  const loc = type === 'EQUIPMENT' && locId ? await byId('LOCATION', locId) : null;
  return { entity_type: type, code: rec[cfg.code], qr_key: rec.qr_key, name_vi: nv, name_zh: nz, location_code: loc ? loc.location_code : '' };
}

export async function renderQrView(view, { shell, params }) {
  const cfg = QR_TYPES[params.type];
  shell.setScreen({ title: 'screen.qr', back: cfg ? cfg.back + params.id : '/' });
  const rec = cfg ? await byId(cfg.type, params.id) : null;
  if (!rec || !rec.qr_key) { view.innerHTML = `<div class="card">${bi('qr.unavailable')}</div>`; return; }
  const { qrSvg } = await import('../labels.js');
  const { APP_BASE_URL } = await import('../core.js');
  const it = await labelItem(cfg.type, rec);
  const canPrint = await can('qr.print');
  view.innerHTML = `<div class="card qr-view">
    <div class="qr-big">${qrSvg(APP_BASE_URL + '#/r/' + rec.qr_key)}</div>
    <div class="qr-code">${esc(it.code || biText('tag.pending_code'))}</div>
    <div class="muted">${bi('qr.entity.' + cfg.type)}</div>
    <div>${esc(it.name_vi)}</div><div>${esc(it.name_zh)}</div>
    <div class="muted small">${bi('field.qr_key')}: <code>${esc(rec.qr_key)}</code></div>
    <p class="muted small">${bi('qr.scan_hint')}</p>
    ${canPrint ? `<a class="btn" href="#/print?type=${esc(cfg.type)}&ids=${esc(params.id)}">${ICON.print}<span>${bi('btn.print_qr')}</span></a>` : ''}
  </div>`;
}

/** In tem: ?type=EQUIPMENT&ids=a,b,c — chọn cỡ, lệch lề; THỬ có cảnh báo không in tem thật */
export async function renderPrintLabels(view, { shell, query }) {
  const type = query.get('type');
  const ids = (query.get('ids') || '').split(',').filter(Boolean);
  const cfg = QR_TYPES[type];
  shell.setScreen({ title: 'screen.labels', back: cfg && ids.length === 1 ? cfg.back + ids[0] : (cfg ? cfg.back.replace(/\/$/, '').replace('/record', '') : '/') });
  if (!(await can('qr.print'))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  if (!cfg) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const items = [];
  for (const id of ids) { const r = await byId(cfg.type, id); if (r && r.qr_key) items.push(await labelItem(cfg.type, r)); }
  const b = await boot();
  const { labelSheetHtml } = await import('../labels.js');
  const size = ls.get('label_size') || (session.settings.qr_label_size === 'LARGE_105X74' ? 'LARGE' : 'SMALL');
  view.classList.add('print-view');
  view.innerHTML = `<div class="no-print card print-tools">
      ${b.env === 'THU' ? `<p class="banner warn">${bi('qr.test_env_warning')}</p>` : ''}
      <div class="row">
        <label class="check"><input type="radio" name="lbsize" value="SMALL" ${size === 'SMALL' ? 'checked' : ''}><span>${bi('qr.label_small')}</span></label>
        <label class="check"><input type="radio" name="lbsize" value="LARGE" ${size === 'LARGE' ? 'checked' : ''}><span>${bi('qr.label_large')}</span></label>
      </div>
      <div class="row"><label class="inline">${bi('qr.offset')} <input type="number" id="lb-off" value="${esc(ls.get('label_offset') || '0')}" step="0.5" class="tiny-input"></label>
        <button type="button" class="btn primary" id="lb-print">${ICON.print}<span>${bi('btn.print_qr')}</span></button></div>
      <p class="muted small">${bi('qr.print_hint')} · ${bi('field.total', { N: items.length })}</p>
    </div>
    <div id="lb-sheets" class="labels-screen"></div>`;
  const paint = () => {
    const s = view.querySelector('input[name=lbsize]:checked').value;
    ls.set('label_size', s);
    view.querySelector('#lb-sheets').innerHTML = labelSheetHtml(items, s);
  };
  const off = () => { const v = Number(view.querySelector('#lb-off').value) || 0; ls.set('label_offset', String(v)); document.documentElement.style.setProperty('--label-offset', v + 'mm'); };
  view.querySelectorAll('input[name=lbsize]').forEach((r) => r.addEventListener('change', paint));
  view.querySelector('#lb-off').addEventListener('change', off);
  view.querySelector('#lb-print').addEventListener('click', () => {
    if (window.navigator.standalone === true) { toast(bi('qr.print_standalone')); return; }
    window.print();
  });
  off(); paint();
}

export { navigate, L };
