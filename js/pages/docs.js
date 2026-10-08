// Tab Tài liệu (EQ-04, MAT-02): ảnh LINK_VIEW hiện bằng URL lh3, tài liệu riêng tư tải qua máy chủ (2.6, 3.10)
import { bi, biText, esc, fmtDate, fmtNumber, badge, biName, nameText, session, uuid, resMsg } from '../core.js';
import { ICON, toast, dialog, h, $, $$ } from '../ui.js';
import { recs, can, canSync, boot } from '../data.js';
import { afterCommit } from '../app.js';
import { enqueue } from '../sync.js';
import { processPhoto, uploadDoc, downloadDoc, shareFileNow, isTouchMobile } from '../media.js';
import { writeOnline, busy } from '../form.js';

const FILE_KINDS = ['MANUAL', 'DRAWING', 'CERTIFICATE', 'OTHER'];
const PHOTO_KIND = { EQUIPMENT: 'PHOTO_EQUIPMENT', MATERIAL: 'PHOTO_MATERIAL' };
const MODULE_OF = { EQUIPMENT: 'equipment', MATERIAL: 'warehouse' };

function keyOf(type) { return type === 'EQUIPMENT' ? 'equipment_id' : 'material_id'; }

/** URL ảnh nhỏ: lh3 đọc được bằng CORS (quyết định sau PoC) */
export function photoSrc(d, w = 400) {
  const id = d.thumb_drive_file_id && w <= 400 ? d.thumb_drive_file_id : d.drive_file_id;
  return id ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w}` : '';
}

export async function docsTabHtml(type, rec) {
  const id = rec[keyOf(type)];
  const docs = (await recs('DOCUMENT')).filter((d) => d.entity_type === type && d.entity_id === id && d.active !== false)
    .sort((a, b) => String(b.document_date || '').localeCompare(String(a.document_date || '')));
  const photos = docs.filter((d) => d.access_scope === 'LINK_VIEW');
  const files = docs.filter((d) => d.access_scope !== 'LINK_VIEW');
  const canUp = (await can('doc.upload')) && !rec.archived_at;
  const online = navigator.onLine;
  const uid = session.user && session.user.user_id;
  const b = await boot();
  const canPriv = canSync(b, 'doc.setPrivate');
  const canArch = canSync(b, 'doc.archive');
  const lvl = Number(session.user && session.user.role_level) || 0;
  const mineOk = (d) => lvl >= 3 || d.created_by === uid;
  return `
    ${photos.length ? `<div class="photos">${photos.map((d) => `<figure class="photo" data-doc="${esc(d.document_id)}">
      ${d.drive_sharing_state === 'LINK_SHARED' && d.drive_file_id ? `<a href="${esc(photoSrc(d, 1600))}" target="_blank" rel="noopener noreferrer"><img src="${esc(photoSrc(d))}" alt="${esc(nameText(d, 'title'))}" loading="lazy" referrerpolicy="no-referrer"></a>`
        : `<div class="photo-private">${ICON.lock}<span>${bi('doc_scope.MODULE_VIEW')}</span></div>`}
      <figcaption>${biName(d, 'title')} · ${esc(fmtDate(d.document_date))} ${d.drive_sharing_state !== 'LINK_SHARED' ? badge('sharing.' + d.drive_sharing_state) : ''}
        <span class="doc-act">
        ${d.drive_sharing_state !== 'LINK_SHARED' && d.drive_sharing_state !== 'NOT_SHARED' ? `<button type="button" class="btn tiny" data-dl="${esc(d.document_id)}" ${online ? '' : 'disabled'}>${bi('btn.download')}</button>` : ''}
        ${canPriv && mineOk(d) && d.drive_sharing_state === 'LINK_SHARED' ? `<button type="button" class="btn tiny" data-priv="${esc(d.document_id)}" ${online ? '' : 'disabled'}>${ICON.lock}<span>${bi('btn.set_private')}</span></button>` : ''}
        ${canArch && mineOk(d) ? `<button type="button" class="btn tiny" data-arch="${esc(d.document_id)}" ${online ? '' : 'disabled'} aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button>` : ''}
        </span></figcaption></figure>`).join('')}</div>` : ''}
    ${files.length ? `<ul class="list docs">${files.map((d) => `<li data-doc="${esc(d.document_id)}">
      <div class="doc-line">${ICON[d.storage_kind === 'LINK' ? 'link' : 'file']}<div class="doc-main"><strong>${biName(d, 'title')}</strong>
        <div class="muted small">${bi('doc_kind.' + d.kind)} · ${esc(fmtDate(d.document_date))}${d.size_bytes ? ' · ' + fmtNumber(Math.ceil(d.size_bytes / 1024)) + ' KB' : ''} · ${badge('doc_scope.' + d.access_scope)}</div></div></div>
      <div class="row doc-act">
        ${d.storage_kind === 'LINK' ? `<a class="btn tiny" href="${esc(d.external_url)}" target="_blank" rel="noopener noreferrer">${bi('doc.link_open')}</a>`
          : `<button type="button" class="btn tiny" data-dl="${esc(d.document_id)}" ${online ? '' : 'disabled'}>${ICON.download}<span>${bi('btn.download')}</span></button>
             <button type="button" class="btn tiny primary" data-open="${esc(d.document_id)}" hidden>${bi('btn.open_save')}</button>`}
        ${canArch && mineOk(d) ? `<button type="button" class="btn tiny" data-arch="${esc(d.document_id)}" ${online ? '' : 'disabled'} aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button>` : ''}
      </div></li>`).join('')}</ul>` : ''}
    ${!docs.length ? `<p class="muted">${bi('doc.none')}</p>` : ''}
    ${canUp ? `<div class="row upload-row">
      <label class="btn small file">${ICON.camera}<span>${bi('eq.upload_photo')}</span><input type="file" accept="image/*" data-up="photo" hidden></label>
      <label class="btn small file">${ICON.upload}<span>${bi('eq.upload_file')}</span><input type="file" accept="application/pdf,image/jpeg,image/png" data-up="file" hidden></label>
      <button type="button" class="btn small" data-link="1" ${online ? '' : 'disabled'}>${ICON.link}<span>${bi('btn.add_link')}</span></button></div>
      <p class="muted small">${bi('doc.photo_warning')}</p>` : ''}
    <div class="up-status muted small" aria-live="polite"></div>`;
}

/** Hỏi tên và loại tài liệu trước khi tải lên */
async function askMeta({ link = false, kindDefault = 'MANUAL' } = {}) {
  return dialog({
    title: bi(link ? 'btn.add_link' : 'btn.upload'),
    body: `<label for="dm-kind">${bi('field.document_kind')}</label><select id="dm-kind" class="inp sel">${FILE_KINDS.map((k) => `<option value="${k}"${k === kindDefault ? ' selected' : ''}>${bi('doc_kind.' + k)}</option>`).join('')}</select>
      <label for="dm-title">${bi('field.document_title')}</label><input id="dm-title" type="text" maxlength="200">
      <p class="muted small">${bi('field.one_lang')}</p>
      ${link ? `<label for="dm-url">${bi('field.external_url')}</label><input id="dm-url" type="url" inputmode="url" placeholder="https://…">` : ''}`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (w) => ({ kind: $('#dm-kind', w).value, title: $('#dm-title', w).value.trim(), url: link ? $('#dm-url', w).value.trim() : '' }) }]
  });
}

/** Tiêu đề nhập một thứ tiếng: có chữ Hán → title_zh, không thì title_vi */
function titlePayload(t) {
  return /[㐀-鿿]/.test(t) ? { title_vi: '', title_zh: t } : { title_vi: t, title_zh: '' };
}

export function wireDocsTab(tb, type, rec, repaint) {
  const id = rec[keyOf(type)];
  const status = $('.up-status', tb);
  const files = {};
  $$('[data-up]', tb).forEach((inp) => inp.addEventListener('change', async () => {
    const f = inp.files[0];
    inp.value = '';
    if (!f) return;
    let payload;
    if (inp.dataset.up === 'photo') {
      const ph = await processPhoto(f);
      payload = { entity_type: type, entity_id: id, kind: PHOTO_KIND[type], blob: ph.main, mime: 'image/jpeg', thumb: ph.thumb, ...titlePayload(f.name.replace(/\.[^.]+$/, '')) };
    } else {
      const meta = await askMeta();
      if (!meta) return;
      if (!meta.title) { toast(bi('field.one_lang'), 'err'); return; }
      const mime = f.type === 'image/jpg' ? 'image/jpeg' : f.type;
      payload = { entity_type: type, entity_id: id, kind: meta.kind, blob: f, mime, ...titlePayload(meta.title) };
    }
    if (!navigator.onLine) {
      // doc.upload được xếp hàng khi offline (4.7); gửi khi có mạng
      const { blobToB64 } = await import('../core.js');
      const p2 = { document_id: uuid(), entity_type: type, entity_id: id, kind: payload.kind, mime_type: payload.mime, content_b64: await blobToB64(payload.blob), title_vi: payload.title_vi, title_zh: payload.title_zh };
      if (payload.thumb) p2.thumb_b64 = await blobToB64(payload.thumb);
      await enqueue('doc.upload', p2, { entity_type: 'DOCUMENT', entity_id: p2.document_id });
      toast(bi('doc.queued_offline'), 'ok');
      return;
    }
    status.innerHTML = bi('doc.uploading');
    const r = await uploadDoc(payload);
    status.innerHTML = '';
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); return; }
    toast(r.message ? esc(r.message) : esc(resMsg(r) + ((r.errors || [])[0] ? ' — ' + (r.errors[0].message_vi || r.errors[0].code) : '')), 'err');
  }));
  const lk = $('[data-link]', tb);
  if (lk) lk.addEventListener('click', async () => {
    const meta = await askMeta({ link: true });
    if (!meta) return;
    if (!meta.title || !/^https:\/\//.test(meta.url)) { toast(bi(!meta.title ? 'field.one_lang' : 'field.invalid'), 'err'); return; }
    const r = await writeOnline('doc.upload', { document_id: uuid(), entity_type: type, entity_id: id, kind: meta.kind, external_url: meta.url, ...titlePayload(meta.title) });
    if (r.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else toast(esc(resMsg(r)), 'err');
  });
  $$('[data-dl]', tb).forEach((b) => b.addEventListener('click', async () => {
    busy(b, true);
    const d = await downloadDoc(b.dataset.dl);
    busy(b, false);
    if (!d.ok) { toast(d.res && d.res.errors && d.res.errors[0] && d.res.errors[0].code === 'FILE_TOO_LARGE' ? bi('doc.too_large') : esc(resMsg(d.res)), 'err'); return; }
    files[b.dataset.dl] = d.file;
    const open = $(`[data-open="${CSS.escape(b.dataset.dl)}"]`, tb);
    // iPhone: bước 2 "Mở / Lưu" gọi share ngay trong lần chạm (2.6); máy tính tải thẳng
    if (open && isTouchMobile()) { open.hidden = false; open.focus(); } else shareFileNow(d.file);
  }));
  $$('[data-open]', tb).forEach((b) => b.addEventListener('click', () => { const f = files[b.dataset.open]; if (f) shareFileNow(f); }));
  $$('[data-priv]', tb).forEach((b) => b.addEventListener('click', async () => {
    const ok = await dialog({ title: bi('btn.set_private'), body: `<p>${bi('doc.set_private_confirm')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.set_private'), kind: 'primary', value: true }] });
    if (!ok) return;
    const d = (await recs('DOCUMENT')).find((x) => x.document_id === b.dataset.priv);
    const r = await writeOnline('doc.setPrivate', { document_id: b.dataset.priv }, { expected_version: d ? d.record_version : 0 });
    if (r.ok) { await afterCommit(); repaint(); } else toast(esc(resMsg(r)), 'err');
  }));
  $$('[data-arch]', tb).forEach((b) => b.addEventListener('click', async () => {
    const ok = await dialog({ title: bi('btn.remove'), body: `<p>${bi('doc.archive_confirm')}</p>`, actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('btn.remove'), kind: 'danger', value: true }] });
    if (!ok) return;
    const d = (await recs('DOCUMENT')).find((x) => x.document_id === b.dataset.arch);
    const r = await writeOnline('doc.archive', { document_id: b.dataset.arch }, { expected_version: d ? d.record_version : 0 });
    if (r.ok) { await afterCommit(); repaint(); } else toast(esc(resMsg(r)), 'err');
  }));
}

export { h, MODULE_OF };
