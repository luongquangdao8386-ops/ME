// Quét QR bằng camera hoặc nhập mã (CM-02; phụ lục 1.5 mục 2.8, 3.4, P-05)
import { APP_BASE_URL, api, bi, biText, esc } from './core.js';
import { getRecords } from './sync.js';
import { h, $, ICON } from './ui.js';

const CROCK_RE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
export function normalizeKey(s) {
  const t = String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CROCK_RE.test(t) ? t : null;
}

/**
 * Phân loại chuỗi quét/nhập. Camera: chỉ nhận chuỗi bắt đầu đúng bằng APP_BASE_URL + "#/r/".
 * Nhập tay: thêm qr_key hoặc mã hiển thị.
 */
export function parseScan(raw, manual = false) {
  const s = String(raw || '').trim();
  const prefix = APP_BASE_URL + '#/r/';
  if (s.startsWith(prefix)) {
    const key = normalizeKey(s.slice(prefix.length).split(/[?#/]/)[0]);
    return key ? { kind: 'qr', key } : { kind: 'foreign', raw: s };
  }
  if (!manual || /^[a-z]+:\/\//i.test(s)) return { kind: 'foreign', raw: s };
  const key = normalizeKey(s);
  if (key) return { kind: 'qr', key };
  if (/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,31}$/.test(s)) return { kind: 'code', code: s.toUpperCase() };
  return { kind: 'foreign', raw: s };
}

/** Tra hồ sơ: có mạng → qr.resolve; mất mạng → dữ liệu đã tải */
export async function resolveScan(p) {
  if (p.kind === 'foreign') return { qr_state: 'FOREIGN', raw: p.raw };
  if (navigator.onLine) {
    const r = await api('qr.resolve', p.kind === 'qr' ? { qr_key: p.key } : { code: p.code });
    if (r.ok) return r.data;
    if (r.code !== 'NETWORK_ERROR') return { qr_state: 'UNAVAILABLE', error: r.code };
  }
  for (const type of ['EQUIPMENT', 'INSPECTION_REQUIREMENT', 'INSPECTION']) {
    const list = await getRecords(type);
    const codeField = { EQUIPMENT: 'equipment_code', INSPECTION_REQUIREMENT: 'requirement_code', INSPECTION: 'inspection_code' }[type];
    const keyField = { EQUIPMENT: 'equipment_id', INSPECTION_REQUIREMENT: 'requirement_id', INSPECTION: 'inspection_id' }[type];
    const hit = list.find((x) => (p.kind === 'qr' ? x.qr_key === p.key : x[codeField] === p.code));
    if (hit) return { qr_state: 'OK', entity_type: type, entity_id: hit[keyField], code: hit[codeField], offline: true };
  }
  return { qr_state: 'UNAVAILABLE', offline: !navigator.onLine };
}

export function qrStateText(st) {
  return {
    FOREIGN: 'qr_foreign', UNAVAILABLE: 'qr_unavailable', INACTIVE: 'qr_inactive', EXPIRED: 'qr_expired', NOT_IN_RESTORED: 'qr_not_in_restored'
  }[st];
}

/**
 * Mở màn quét. onResult(raw, info) với info = {method, ms_to_decode, manual}.
 * Trả hàm đóng.
 */
export function openScanner({ onResult, onClose }) {
  const el = h(`<div class="scanner" role="dialog" aria-modal="true">
    <div class="scanner-top"><button type="button" class="icon-btn light" id="sc-close" aria-label="${esc(biText('back'))}">${ICON.back}</button>
      <h2>${bi('scan')}</h2></div>
    <div class="scanner-view"><video id="sc-video" playsinline muted autoplay></video><div class="scanner-frame" aria-hidden="true"></div></div>
    <p class="scanner-status" id="sc-status">${bi('scan_hint')}</p>
    <form class="scanner-manual" id="sc-form"><input id="sc-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="TB-0001 · URL · qr_key" aria-label="${esc(biText('manual_code'))}">
      <button type="submit" class="btn primary small">${bi('manual_code')}</button></form>
  </div>`);
  document.body.appendChild(el);
  const video = $('#sc-video', el);
  const status = $('#sc-status', el);
  let stream = null, stopped = false, worker = null, timer = null, busy = false;
  const t0 = performance.now();
  let method = null;

  function stop() {
    stopped = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (worker) worker.terminate();
    el.remove();
  }
  function done(raw, manual) {
    const info = { method: manual ? 'manual' : method, ms_to_decode: Math.round(performance.now() - t0), manual };
    stop();
    onResult && onResult(raw, info);
  }
  $('#sc-close', el).addEventListener('click', () => { stop(); onClose && onClose(); });
  $('#sc-form', el).addEventListener('submit', (e) => { e.preventDefault(); const v = $('#sc-input', el).value.trim(); if (v) done(v, true); });

  (async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.innerHTML = 'Không có camera · 无摄像头 — ' + bi('manual_code');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      status.innerHTML = `Không mở được camera (${esc(e.name)}) · 无法打开摄像头 — ${bi('manual_code')}`;
      return;
    }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    await video.play().catch(() => {});
    let detector = null;
    if ('BarcodeDetector' in window) {
      try {
        const fmts = await window.BarcodeDetector.getSupportedFormats();
        if (fmts.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) { detector = null; }
    }
    method = detector ? 'BarcodeDetector' : 'jsQR';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!detector) {
      worker = new Worker('js/qr-worker.js');
      worker.onmessage = (ev) => { busy = false; if (ev.data && !stopped) done(ev.data, false); };
    }
    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= 2 && !busy) {
        if (detector) {
          try {
            const codes = await detector.detect(video);
            if (codes.length && codes[0].rawValue) { done(codes[0].rawValue, false); return; }
          } catch (e) { /* bỏ qua khung lỗi */ }
        } else {
          const vw = video.videoWidth, vh = video.videoHeight;
          const s = Math.min(1, 640 / Math.max(vw, vh));
          canvas.width = Math.round(vw * s); canvas.height = Math.round(vh * s);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          busy = true;
          worker.postMessage({ data: img.data.buffer, width: img.width, height: img.height }, [img.data.buffer]);
        }
      }
      timer = setTimeout(tick, 150);
    };
    tick();
  })();
  return stop;
}
