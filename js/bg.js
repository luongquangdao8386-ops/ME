// Ảnh nền màn đăng nhập (cả màn chờ lúc mở app) và trang chủ do Quản trị thay (máy chủ 43_bg.js, màn Quản trị → Ảnh nền; chép cách làm
// của app ISO bản 1.0.0-d3.3). Máy giữ ảnh riêng trong Cache Storage `<NS>-bg` (sw.js chỉ dọn `<NS>-shell-*`, không xóa cache này) và dấu
// "có ảnh riêng" ở localStorage `<NS>.bg` — js/early.js đọc dấu này trước khi vẽ để gắn lớp bg-login / bg-home (không chớp ảnh mặc định).
// NS theo trang (/ME/ → me, /ME-thu/ → me_thu), không đụng bộ nhớ của app ISO. Cài đặt bg_login_rev / bg_home_rev đổi (bootstrap, hoặc
// bg_revs trong sync.changes) → tải ảnh mới một lần (syncBg sau mỗi lần đồng bộ). Máy chưa đăng nhập lần nào chỉ có ảnh mặc định.
import { NS, ls, api, session, b64ToBytes } from './core.js';

export const BG_SLOTS = ['LOGIN', 'HOME'];
/** Ảnh mặc định của từng ô */
export const BG_DEFAULT = { LOGIN: 'assets/bg/factory.jpg', HOME: 'assets/bg/home.jpg' };
const CACHE = NS + '-bg';
const CLS = { LOGIN: 'bg-login', HOME: 'bg-home' };
const CSS_VAR = { LOGIN: '--bg-login', HOME: '--bg-home' };
const urls = {};
/** rev đang áp dụng trong lần mở app này ('' = ảnh mặc định; chưa có khóa = chưa biết, hỏi máy chủ ở lần đồng bộ) */
const cur = {};

const keyOf = (slot) => slot.toLowerCase();
const reqOf = (slot) => new Request('bg-' + keyOf(slot) + '.img');
function readFlag() { try { return JSON.parse(ls.get('bg') || '{}') || {}; } catch (e) { return {}; } }
function writeFlag(f) { if (Object.keys(f).length) ls.set('bg', JSON.stringify(f)); else ls.del('bg'); }
async function openCache() { return self.caches ? caches.open(CACHE) : null; }

/** Gắn / bỏ ảnh riêng của một ô lên trang (biến CSS + lớp trên <html>) */
function show(slot, blob) {
  const root = document.documentElement;
  if (urls[slot]) { URL.revokeObjectURL(urls[slot]); delete urls[slot]; }
  if (blob) {
    urls[slot] = URL.createObjectURL(blob);
    root.style.setProperty(CSS_VAR[slot], `url("${urls[slot]}")`);
    root.classList.add(CLS[slot]);
  } else {
    root.style.removeProperty(CSS_VAR[slot]);
    root.classList.remove(CLS[slot]);
  }
}

async function cachedBlob(slot) {
  try {
    const c = await openCache();
    const r = c && await c.match(reqOf(slot));
    return r ? await r.blob() : null;
  } catch (e) { return null; }
}

/** Mở app: gắn ảnh riêng đã giữ trên máy (máy đã xóa dữ liệu trang → bỏ dấu, về ảnh mặc định) */
export async function applyBg() {
  const f = readFlag();
  let changed = false;
  for (const slot of BG_SLOTS) {
    const k = keyOf(slot);
    if (!f[k]) { show(slot, null); continue; }
    if (!f[k].on) { show(slot, null); cur[slot] = String(f[k].rev || ''); continue; }
    const blob = await cachedBlob(slot);
    if (blob) { show(slot, blob); cur[slot] = String(f[k].rev || ''); } else { delete f[k]; changed = true; show(slot, null); }
  }
  if (changed) writeFlag(f);
}

/** Giữ ảnh của một ô trên máy rồi gắn lên trang; b64 rỗng = dùng ảnh mặc định (rev giữ lại để không hỏi máy chủ nữa) */
export async function rememberBg(slot, rev, mime, b64) {
  const f = readFlag();
  const k = keyOf(slot);
  // Cài đặt của phiên theo ảnh vừa nhận (lần đồng bộ sau không tải lại cùng ảnh)
  if (session.settings) session.settings['bg_' + k + '_rev'] = String(rev || '');
  if (b64) {
    const blob = new Blob([b64ToBytes(b64)], { type: mime || 'image/jpeg' });
    let kept = false;
    try {
      const c = await openCache();
      if (c) { await c.put(reqOf(slot), new Response(blob, { headers: { 'content-type': blob.type } })); kept = true; }
    } catch (e) { /* hết chỗ / không có Cache Storage: chỉ hiện trong lần mở này */ }
    // Không giữ được trên máy: không ghi dấu (lần mở sau hỏi lại máy chủ), chỉ hiện trong lần mở này
    if (kept) f[k] = { rev: String(rev || ''), on: true }; else delete f[k];
    writeFlag(f);
    show(slot, blob);
    cur[slot] = String(rev || '');
    return;
  }
  try { const c = await openCache(); if (c) await c.delete(reqOf(slot)); } catch (e) { /* bỏ qua */ }
  if (rev) f[k] = { rev: String(rev), on: false }; else delete f[k];
  writeFlag(f);
  show(slot, null);
  cur[slot] = String(rev || '');
}

/** Trang đổi máy chủ (link /exec khác): bỏ ảnh riêng của máy chủ cũ, về ảnh mặc định tới khi máy chủ mới báo */
export async function forgetBg() {
  ls.del('bg');
  try { if (self.caches) await caches.delete(CACHE); } catch (e) { /* bỏ qua */ }
  for (const slot of BG_SLOTS) { show(slot, null); delete cur[slot]; }
}

/** Ảnh đang hiện của ô (URL blob của ảnh riêng, hoặc ảnh mặc định) */
export function bgUrl(slot) { return urls[slot] || BG_DEFAULT[slot]; }
/** Ô đang dùng ảnh riêng */
export function bgCustom(slot) { return !!urls[slot]; }

let running = null;
/** Sau mỗi lần đồng bộ: cài đặt bg_<ô>_rev khác bản đang giữ → tải ảnh riêng mới / bỏ ảnh riêng */
export function syncBg() {
  if (!running) running = doSync().catch(() => {}).finally(() => { running = null; });
  return running;
}
async function doSync() {
  const st = session.settings || {};
  if (!session.token) return;
  for (const slot of BG_SLOTS) {
    const name = 'bg_' + keyOf(slot) + '_rev';
    // Máy chủ cũ (chưa có Ảnh nền) không gửi khóa này: giữ nguyên ảnh đang có
    if (!Object.prototype.hasOwnProperty.call(st, name)) continue;
    const want = String(st[name] || '');
    const now = cur[slot] === undefined ? null : cur[slot];
    if (!want) {
      // Quản trị chọn lại ảnh mặc định: bỏ ảnh riêng đang giữ (chưa từng có thì thôi)
      if (now === '' || (now === null && !readFlag()[keyOf(slot)])) continue;
      await rememberBg(slot, '', '', null);
      continue;
    }
    if (want === now) continue;
    if (!navigator.onLine) continue;
    const r = await api('bg.get', { slot }, { retry: true });
    if (!r.ok) continue;
    if (r.data.rev) await rememberBg(slot, r.data.rev, r.data.mime_type, r.data.content_b64);
    else await rememberBg(slot, want, '', null); // tệp trên Drive đã mất: ảnh mặc định, không hỏi lại
  }
}
