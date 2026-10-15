// Nút "Báo cáo" trên danh sách các module (Đợt 3, 4.4.10): mở mẫu báo cáo tích hợp của module với bộ lọc đang xem.
// Máy chủ chưa chạy Đợt 3 → nút mờ "Sắp có" như trước; không có quyền chạy báo cáo → không hiện.
import { bi } from './core.js';
import { ICON } from './ui.js';
import { can } from './data.js';
import { RELEASED_DOT } from './shell.js';

export async function reportLink(code, filters = {}) {
  if (RELEASED_DOT < 3) return `<button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${ICON.reports}<span>${bi('btn.report')}</span><span class="soon">${bi('tag.coming_soon')}</span></button>`;
  if (!(await can('report.run'))) return '';
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return `<a class="btn small" href="#/reports/run/${encodeURIComponent(code)}${q ? '?' + q : ''}">${ICON.reports}<span>${bi('btn.report')}</span></a>`;
}

/** Nút In/xuất PDF hồ sơ, phiếu (export.pdf, 4.4.11; Đợt 3): máy chủ dựng PDF không logo theo quyền xem và quyền giá */
export async function recordPdfBtn(type, id) {
  if (RELEASED_DOT < 3 || !(await can('export.pdf'))) return '';
  return `<button type="button" class="btn small" data-pdf="${type}" data-pdf-id="${id}" ${navigator.onLine ? '' : 'disabled'}>${ICON.print}<span>${bi('btn.export_pdf')}</span></button>
    <button type="button" class="btn small primary" data-pdf-open="${id}" hidden>${bi('btn.open_save')}</button>`;
}

/** iPhone: bước 2 "Mở / Lưu" gọi chia sẻ trong lần chạm (2.6); máy tính tải thẳng */
export function wireRecordPdf(root) {
  const got = {};
  root.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', async () => {
    const [{ api, esc, resMsg, b64ToBytes }, { shareFileNow, isTouchMobile }, { toast }] = await Promise.all([import('./core.js'), import('./media.js'), import('./ui.js')]);
    b.disabled = true; b.classList.add('busy');
    const r = await api('export.pdf', { entity_type: b.dataset.pdf, entity_id: b.dataset.pdfId }, { retry: true });
    b.disabled = false; b.classList.remove('busy');
    if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
    const file = new File([b64ToBytes(r.data.content_b64)], r.data.file_name, { type: 'application/pdf' });
    const open = root.querySelector(`[data-pdf-open="${CSS.escape(b.dataset.pdfId)}"]`);
    if (open && isTouchMobile()) { got[b.dataset.pdfId] = file; open.hidden = false; open.focus(); return; }
    shareFileNow(file);
  }));
  root.querySelectorAll('[data-pdf-open]').forEach((b) => b.addEventListener('click', async () => {
    const { shareFileNow } = await import('./media.js');
    if (got[b.dataset.pdfOpen]) shareFileNow(got[b.dataset.pdfOpen]);
  }));
}
