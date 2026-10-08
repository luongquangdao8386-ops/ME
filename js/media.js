// Ảnh và tài liệu: thu nhỏ ảnh, tải lên, tải xuống riêng tư, chia sẻ (phụ lục 1.5 mục 2.6, 3.10)
import { api, session, blobToB64, b64ToBytes, uuid } from './core.js';

function canvasToBlob(c, type, q) {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q));
}

async function decodeImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height, how: 'createImageBitmap', close: () => bmp.close && bmp.close() };
  } catch (e) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, how: 'img', close: () => URL.revokeObjectURL(url) };
  }
}

function drawScaled(src, w, h, edge) {
  const s = Math.min(1, edge / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Vẽ thẳng vào canvas đích (≤1600 px, JPEG 0,8) và bản nhỏ 400 px; không tạo canvas cỡ gốc; bỏ EXIF/GPS */
export async function processPhoto(file) {
  const st = session.settings || {};
  const maxEdge = st.photo_max_edge_px || 1600, thumbEdge = st.photo_thumb_edge_px || 400, q = st.photo_jpeg_quality || 0.8;
  const t0 = performance.now();
  const d = await decodeImage(file);
  const big = drawScaled(d.src, d.w, d.h, maxEdge);
  const small = drawScaled(d.src, d.w, d.h, thumbEdge);
  d.close();
  const main = await canvasToBlob(big, 'image/jpeg', q);
  const thumb = await canvasToBlob(small, 'image/jpeg', 0.75);
  const out = { main, thumb, src_w: d.w, src_h: d.h, out_w: big.width, out_h: big.height, how: d.how, in_bytes: file.size, in_type: file.type, ms: Math.round(performance.now() - t0) };
  big.width = big.height = small.width = small.height = 0;
  return out;
}

/** doc.upload (thao tác ghi, có operation_id) */
export async function uploadDoc({ entity_type, entity_id, kind, blob, mime, thumb, title_vi, title_zh, document_id }) {
  const payload = {
    document_id: document_id || uuid(), entity_type, entity_id, kind, mime_type: mime || blob.type,
    content_b64: await blobToB64(blob), title_vi: title_vi || '', title_zh: title_zh || ''
  };
  if (thumb) payload.thumb_b64 = await blobToB64(thumb);
  const t0 = performance.now();
  const r = await api('doc.upload', payload, { write: true, expected_version: 0 });
  r.upload_ms = Math.round(performance.now() - t0);
  r.document_id = payload.document_id;
  return r;
}

/** Bước 1: tải file riêng tư về bộ nhớ app. Trả {ok, file, url, ms, bytes} */
export async function downloadDoc(documentId) {
  const t0 = performance.now();
  let r = await api('doc.download', { document_id: documentId });
  let retried = null;
  // Lỗi đường truyền không phải hết giờ (vd. POST bị đổi thành GET): đọc lại một lần
  if (r.code === 'NETWORK_ERROR' && r.transport !== 'TIMEOUT') {
    retried = r.transport || r.code;
    await new Promise((res) => setTimeout(res, 2000));
    r = await api('doc.download', { document_id: documentId });
  }
  if (!r.ok) return { ok: false, res: r, retried, ms: Math.round(performance.now() - t0) };
  const bytes = b64ToBytes(r.data.content_b64);
  const file = new File([bytes], r.data.file_name, { type: r.data.mime_type });
  return { ok: true, file, url: URL.createObjectURL(file), ms: Math.round(performance.now() - t0), bytes: bytes.length, server_ms: r.server_ms, retried };
}

/** Máy cảm ứng (iPhone/iPad/Android) mới dùng bảng Chia sẻ; máy tính tải thẳng bằng <a download> (2.6) */
export function isTouchMobile() {
  return /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Bước 2 trên iPhone: gọi share ngay trong trình xử lý chạm, không await trước đó */
export function shareFileNow(file) {
  if (isTouchMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: file.name });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return Promise.resolve();
}

/** Tạo một PDF tối giản (chữ ASCII) để thử tải lên/tải xuống */
export function makeTestPdf(lines, padBytes = 0) {
  const text = lines.map((l, i) => `BT /F1 14 Tf 50 ${780 - i * 22} Td (${String(l).replace(/[()\\]/g, '')}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const head = new TextEncoder().encode(out);
  if (!padBytes) return new Blob([head], { type: 'application/pdf' });
  // phần đệm ngẫu nhiên sau %%EOF để đạt cỡ tệp mong muốn (trình đọc PDF bỏ qua)
  const pad = new Uint8Array(Math.max(0, padBytes - head.length));
  for (let i = 0; i < pad.length; i += 65536) crypto.getRandomValues(pad.subarray(i, Math.min(pad.length, i + 65536)));
  return new Blob([head, pad], { type: 'application/pdf' });
}

/** URL ảnh LINK_VIEW (P-06 chốt dạng nào dùng được) */
export function photoUrls(driveFileId, w = 400) {
  return {
    thumbnail: `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w${w}`,
    lh3: `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveFileId)}=w${w}`
  };
}

/** Thử hiện ảnh bằng <img>; trả {ok, ms} */
export function probeImg(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const img = new Image();
    const t0 = performance.now();
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve({ ok: img.naturalWidth > 0, ms: Math.round(performance.now() - t0), w: img.naturalWidth }); };
    img.onerror = () => { clearTimeout(timer); resolve({ ok: false, reason: 'error', ms: Math.round(performance.now() - t0) }); };
    img.referrerPolicy = 'no-referrer';
    img.src = url.includes('?') ? url + '&t=' + Date.now() : url;
  });
}

/** Thử fetch mode:'cors' (để biết có cache được bản không opaque) */
export async function probeCors(url) {
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
    const b = await r.blob();
    return { ok: r.ok, status: r.status, type: r.type, bytes: b.size };
  } catch (e) {
    return { ok: false, error: e.name || 'ERROR' };
  }
}
