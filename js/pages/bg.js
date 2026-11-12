// Quản trị → Ảnh nền (người dùng yêu cầu 12/11/2026, chép cách làm app ISO bản 1.0.0-d3.3): thay ảnh nền màn đăng nhập (cả màn chờ lúc
// mở app) và trang chủ, hoặc dùng lại ảnh mặc định. Ảnh thu nhỏ trên máy (như ảnh hồ sơ, cạnh dài ≤ photo_max_edge_px, JPEG) rồi gửi
// bg.set (cấp 4, PIN); máy chủ giữ riêng tư trên Drive (43_bg.js). Mọi máy nhận ảnh mới ở lần đồng bộ kế tiếp (js/bg.js); màn đăng nhập
// của một máy chỉ đổi khi máy đó đã đăng nhập ít nhất một lần.
import { api, bi, esc, resMsg, blobToB64 } from '../core.js';
import { ICON, dialog, toast, brandHtml } from '../ui.js';
import { can } from '../data.js';
import { writeWithPin, busy } from '../form.js';
import { processPhoto } from '../media.js';
import { handleWriteError } from './equipment.js';
import { BG_SLOTS, BG_DEFAULT, rememberBg, bgUrl, bgCustom } from '../bg.js';

/** Khung xem trước giống phần ảnh trên iPhone: đăng nhập (ảnh cao, lấy giữa hơi lên trên), trang chủ (ảnh ngang) */
const preview = (slot, url) => `<div class="bg-prev ${slot.toLowerCase()}" style="background-image:url('${esc(url)}')">${brandHtml()}</div>`;

export async function renderBackgrounds(view, { shell }) {
  shell.setScreen({ title: 'admin.bg', back: '/account' });
  if (!(await can('bg.set'))) { view.innerHTML = `<div class="card empty-state" id="bg-old"><p class="muted">${bi('bg.server_old')}</p></div>`; return; }
  if (!navigator.onLine) { view.innerHTML = `<div class="card empty-state">${ICON.sync}<p class="muted">${bi('sync.need_network')}</p></div>`; return; }
  view.innerHTML = '<div class="spinner" role="status"></div>';
  // Lấy ảnh đang dùng của từng ô từ máy chủ (máy này có thể chưa đồng bộ ảnh mới)
  const cur = {};
  for (const slot of BG_SLOTS) {
    const r = await api('bg.get', { slot }, { retry: true });
    if (!r.ok) { view.innerHTML = `<div class="card">${esc(resMsg(r))}</div>`; return; }
    if (r.data.rev) { cur[slot] = true; await rememberBg(slot, r.data.rev, r.data.mime_type, r.data.content_b64); } else { cur[slot] = false; await rememberBg(slot, '', '', null); }
  }
  view.innerHTML = `<section class="card"><h2>${bi('admin.bg')}</h2><p class="muted small">${bi('bg.intro')}</p></section>
    ${BG_SLOTS.map((slot) => `<section class="card bg-card" data-slot="${slot}"><div class="card-head"><h3>${bi('bg.slot.' + slot)}</h3>
        ${cur[slot] ? `<span class="badge t-green">${bi('bg.custom')}</span>` : `<span class="badge t-grey">${bi('bg.default')}</span>`}</div>
      <p class="muted small">${bi('bg.where.' + slot)}</p>
      ${preview(slot, cur[slot] && bgCustom(slot) ? bgUrl(slot) : BG_DEFAULT[slot])}
      <div class="row"><label class="btn file${cur[slot] ? '' : ' primary'}">${ICON.upload}<span>${bi(cur[slot] ? 'bg.replace' : 'bg.upload')}</span><input type="file" class="bg-file" data-slot="${slot}" accept="image/*" hidden></label>
        ${cur[slot] ? `<button type="button" class="btn" data-reset="${slot}">${ICON.refresh}<span>${bi('bg.reset')}</span></button>` : ''}</div>
    </section>`).join('')}
    <p class="muted small">${bi('bg.hint')}</p>`;
  const again = () => renderBackgrounds(view, { shell });
  view.querySelectorAll('.bg-file').forEach((inp) => inp.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    const slot = inp.dataset.slot;
    e.target.value = '';
    if (!f) return;
    const lab = inp.closest('label');
    busy(lab, true);
    let out;
    try { out = await processPhoto(f); } catch (err) { busy(lab, false); toast(bi('bg.bad_image'), 'err'); return; }
    busy(lab, false);
    const url = URL.createObjectURL(out.main);
    try {
      const yes = await dialog({
        title: bi('bg.slot.' + slot),
        body: `<p class="muted small">${bi('bg.preview_note')}</p>${preview(slot, url)}<p class="muted small">${bi('bg.size', { W: out.out_w, H: out.out_h, K: Math.round(out.main.size / 1024) })}</p>`,
        actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('bg.use'), kind: 'primary', value: true }]
      });
      if (!yes) return;
      const b64 = await blobToB64(out.main);
      const res = await writeWithPin('bg.set', { slot, content_b64: b64, mime_type: 'image/jpeg' });
      if (!res.ok) { if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res); return; }
      await rememberBg(slot, res.data.rev, 'image/jpeg', b64);
      toast(bi('bg.saved'), 'ok');
      again();
    } finally { URL.revokeObjectURL(url); }
  }));
  view.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    const slot = b.dataset.reset;
    const yes = await dialog({ title: bi('bg.reset'), body: `<p>${bi('bg.reset_confirm.' + slot)}</p>${preview(slot, BG_DEFAULT[slot])}`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('bg.reset'), kind: 'primary', value: true }] });
    if (!yes) return;
    const res = await writeWithPin('bg.set', { slot, remove: true });
    if (!res.ok) { if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res); return; }
    await rememberBg(slot, '', '', null);
    toast(bi('bg.reset_ok'), 'ok');
    again();
  }));
}
