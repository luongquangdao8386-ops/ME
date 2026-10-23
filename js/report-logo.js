// Logo công ty trên báo cáo (d4.11): máy chủ giữ tệp riêng tư, app lấy một lần cho mỗi phiên bản (rev) rồi giữ trên máy
// (meta report_logo) cho bản xem trước và Excel. PDF do máy chủ dựng nên không cần tệp này. Không phải logo app 57.
import { api, session } from './core.js';
import { getMeta, setMeta } from './sync.js';

let mem = null;

const withUrl = (v) => ({ ...v, url: `data:${v.mime};base64,${v.b64}` });

/** Logo {rev, mime, b64, url} theo phiên bản máy chủ báo (rev của phản hồi báo cáo, không có thì lấy cài đặt lúc mở app); '' → không logo */
export async function reportLogo(rev) {
  const want = String(rev !== undefined && rev !== null ? rev : ((session.settings || {}).report_logo_rev || ''));
  if (!want) return null;
  if (mem && mem.rev === want) return mem;
  const saved = await getMeta('report_logo');
  if (saved && saved.rev === want && saved.b64) return (mem = withUrl(saved));
  const r = await api('report.logo.get', {}, { retry: true });
  if (!r.ok || !r.data.rev) return null;
  return rememberReportLogo({ rev: r.data.rev, mime: r.data.mime_type, b64: r.data.content_b64 });
}

/** Giữ logo vừa tải lên/lấy về (cả cài đặt của phiên) — trả bản có url */
export async function rememberReportLogo(v) {
  if (session.settings) session.settings.report_logo_rev = v ? v.rev : '';
  if (!v) { mem = null; await setMeta('report_logo', null).catch(() => {}); return null; }
  await setMeta('report_logo', v).catch(() => {});
  return (mem = withUrl(v));
}

/** Byte của logo (Excel) */
export function logoBytes(logo) {
  const s = atob(logo.b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Kích thước ảnh (px) theo chiều cao mong muốn, giữ tỷ lệ */
export function logoSize(logo, h) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok({ w: Math.max(1, Math.round(h * img.naturalWidth / img.naturalHeight)), h });
    img.onerror = () => ok({ w: Math.round(h * 1.3), h });
    img.src = logo.url;
  });
}
