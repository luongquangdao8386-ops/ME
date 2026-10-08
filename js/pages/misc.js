// Màn phụ: phần đợt sau (Sắp có), bàn thử PoC cho owner, Kiểm định/Hợp đồng tạm thời, xem QR, in tem (6.5.2)
import { bi, biText, esc, fmtDate, badge, biName, nameText, session, ls, L } from '../core.js';
import { ICON, toast } from '../ui.js';
import { MODULES } from '../shell.js';
import { recs, byId, can, isOwner, roleLevel, boot } from '../data.js';
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

export async function renderAdminInterim(view, { shell, params }) {
  shell.setScreen({ title: 'admin.' + params.page, back: '/account' });
  view.innerHTML = interimNote();
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
  // Tem in văn bản hiện có, không in nhãn; màn xem trước đánh dấu tem có tên dịch máy chưa sửa (2.3 quy tắc 6)
  const meta = rec.i18n_meta && (rec.i18n_meta.name || rec.i18n_meta.title);
  return { entity_type: type, code: rec[cfg.code], qr_key: rec.qr_key, name_vi: nv, name_zh: nz, location_code: loc ? loc.location_code : '', machine: !!(meta && meta.state === 'MACHINE') };
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
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  view.innerHTML = `<div class="card"><div class="spinner small"></div></div>`;
  // qr.print: máy chủ kiểm quyền, trả dữ liệu tem và ghi nhật ký in (4.4.11)
  const { api, resMsg } = await import('../core.js');
  const res = await api('qr.print', { entity_type: cfg.type, ids }, { retry: true });
  if (!res.ok) { view.innerHTML = `<div class="card">${esc(resMsg(res))}</div>`; return; }
  const items = [];
  for (const it of res.data.items) {
    const local = await byId(cfg.type, it.entity_id);
    items.push(local ? { ...(await labelItem(cfg.type, local)), qr_key: it.qr_key, code: it.code } : it);
  }
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
