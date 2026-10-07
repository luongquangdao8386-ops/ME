// Lõi phía app: cấu hình, UUID, định dạng, nhãn song ngữ, IndexedDB, gọi máy chủ.
// Mọi tên lưu trữ có tiền tố me (phụ lục 1.5 mục 2.1): IndexedDB me_*, Cache me-*, localStorage me.*

const CFG = window.ME_CONFIG || {};
export const APP_BASE_URL = CFG.APP_BASE_URL || (location.origin + location.pathname.replace(/[^/]*$/, ''));
export const BUILD_VERSION = CFG.BUILD_VERSION || '0.0.0';
export const API_CONTRACT_VERSION = CFG.API_CONTRACT_VERSION || '1.0';

/* ---------------- localStorage an toàn (khóa me.*) ---------------- */
export const ls = {
  get(k) { try { return localStorage.getItem('me.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('me.' + k, v); } catch (e) { /* bỏ qua */ } },
  del(k) { try { localStorage.removeItem('me.' + k); } catch (e) { /* bỏ qua */ } }
};
export const ss = {
  get(k) { try { return sessionStorage.getItem('me.' + k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem('me.' + k, v); } catch (e) { /* bỏ qua */ } },
  del(k) { try { sessionStorage.removeItem('me.' + k); } catch (e) { /* bỏ qua */ } }
};

/** Link /exec: config.js trước; khi thử PoC cho phép nhập tạm (me.exec_url) */
export function execUrl() {
  return CFG.EXEC_URL || ls.get('exec_url') || '';
}
export function isValidExecUrl(u) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(String(u || '').trim());
}

/* ---------------- UUID (3.3) ---------------- */
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function deviceId() {
  let id = ls.get('device_id');
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) { id = uuid(); ls.set('device_id', id); }
  return id;
}

/* ---------------- Định dạng (5.4) ---------------- */
export const THOUSANDS_SEP = ' ';
export function fmtNumber(n, maxFrac = 3) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '';
  const v = Number(n);
  const neg = v < 0;
  const s = Math.abs(v).toFixed(maxFrac).replace(/\.?0+$/, '');
  const [i, f] = s.split('.');
  const grouped = i.length >= 4 ? i.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEP) : i;
  return (neg ? '-' : '') + grouped + (f ? '.' + f : '');
}
const VN_OFFSET = 7 * 3600 * 1000;
function vnParts(d) {
  const t = new Date((d instanceof Date ? d.getTime() : Date.parse(d)) + VN_OFFSET);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mi: t.getUTCMinutes(), ss: t.getUTCSeconds() };
}
const p2 = (n) => String(n).padStart(2, '0');
export function fmtDate(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; }
  const p = vnParts(v); return `${p2(p.d)}/${p2(p.m)}/${p.y}`;
}
export function fmtDateTime(v, sec = false) {
  if (!v) return '';
  const p = vnParts(v);
  return `${p2(p.d)}/${p2(p.m)}/${p.y} ${p2(p.hh)}:${p2(p.mi)}` + (sec ? ':' + p2(p.ss) : '');
}
export function isoNowVN() {
  const p = vnParts(new Date());
  return `${p.y}-${p2(p.m)}-${p2(p.d)}T${p2(p.hh)}:${p2(p.mi)}:${p2(p.ss)}+07:00`;
}
export function todayVN() {
  const p = vnParts(new Date());
  return `${p.y}-${p2(p.m)}-${p2(p.d)}`;
}

/* ---------------- Nhãn song ngữ (5.3) ---------------- */
export const L = {
  app_sub: ['', '机电管理'],
  login: ['Đăng nhập', '登录'],
  employee_code: ['Mã nhân viên', '员工编号'],
  pin6: ['PIN 6 số', '六位数字密码'],
  forgot_pin: ['Quên PIN', '忘记PIN'],
  forgot_pin_help: ['Liên hệ quản trị để đặt lại PIN', '请联系管理员重置密码'],
  same_account: ['Dùng cùng tài khoản với iPhone', '与iPhone使用同一账户'],
  shared_device: ['Máy dùng chung', '公用设备'],
  switch_user: ['Đăng nhập người khác', '切换用户'],
  show_pin: ['Hiện PIN', '显示PIN'],
  change_pin: ['Đổi PIN', '修改PIN'],
  temp_pin: ['Bạn đang dùng PIN tạm, hãy đặt PIN mới', '您正在使用临时PIN，请设置新PIN'],
  current_pin: ['PIN hiện tại', '当前PIN'],
  new_pin: ['PIN mới', '新PIN'],
  new_pin_again: ['Nhập lại PIN mới', '再次输入新PIN'],
  pin_mismatch: ['Hai lần nhập PIN mới không khớp', '两次输入的新PIN不一致'],
  no_reuse_pin: ['Không dùng lại PIN của app khác', '请勿重复使用其他应用的PIN'],
  pin_weak: ['PIN quá dễ đoán, hãy chọn PIN khác', 'PIN过于简单，请换一个'],
  pin_format: ['PIN phải gồm đúng 6 chữ số', 'PIN必须为6位数字'],
  offline_unlock: ['Mở khóa ngoại tuyến', '离线解锁'],
  open_with_pin: ['Mở bằng PIN', '用PIN打开'],
  attempts_left: ['Còn N lần thử', '还可尝试 N 次'],
  locked: ['Tạm khóa do nhập sai PIN nhiều lần, thử lại sau N phút', '因多次输错PIN已暂时锁定，请 N 分钟后重试'],
  revoked: ['Phiên đã bị thu hồi hoặc quyền đã thay đổi', '会话已撤销或权限已变更'],
  session_warn: ['Phiên sắp hết hạn', '会话即将到期'],
  relogin: ['Đăng nhập lại', '重新登录'],
  logout: ['Đăng xuất', '退出登录'],
  offline: ['Ngoại tuyến', '离线'],
  local_saved: ['Đã lưu trên máy', '已保存在本机'],
  queued: ['Chờ gửi', '待同步'],
  sending: ['Đang gửi', '同步中'],
  committed: ['Đã lưu máy chủ', '已同步'],
  conflict: ['Xung đột, cần xử lý', '冲突，需处理'],
  failed: ['Lỗi gửi', '同步失败'],
  last_sync: ['Lần đồng bộ cuối', '上次同步'],
  sync_now: ['Đồng bộ ngay', '立即同步'],
  need_network: ['Cần kết nối mạng', '需要网络连接'],
  safari_tab: ['Đang chạy trong Safari: nháp có thể bị xóa sau 7 ngày không mở', '在Safari中运行：7天未打开草稿可能被清除'],
  dataset_reset: ['Dữ liệu đã được đặt lại, cần tải lại', '数据已重置，需重新加载'],
  maintenance: ['Hệ thống đang bảo trì', '系统维护中'],
  network_error: ['Không kết nối được máy chủ', '无法连接服务器'],
  unknown_result: ['Chưa rõ kết quả, đang hỏi lại máy chủ', '结果未知，正在向服务器确认'],
  server_url: ['Địa chỉ máy chủ (/exec)', '服务器地址 (/exec)'],
  server_url_missing: ['Chưa có địa chỉ máy chủ', '尚未设置服务器地址'],
  server_url_bad: ['Link phải có dạng https://script.google.com/macros/s/…/exec', '链接格式应为 https://script.google.com/macros/s/…/exec'],
  save: ['Lưu', '保存'],
  cancel: ['Hủy', '取消'],
  back: ['Quay lại', '返回'],
  download: ['Tải về', '下载'],
  open_save: ['Mở / Lưu', '打开/保存'],
  set_private: ['Đặt riêng tư', '设为私有'],
  export_backup: ['Xuất dự phòng', '导出备份'],
  pending_code: ['Chờ cấp mã', '待分配编号'],
  machine_translated: ['dịch máy', '机器翻译'],
  no_translation: ['Chưa có bản dịch', '暂无译文'],
  sample_data: ['Dữ liệu mẫu', '示例数据'],
  scan: ['Quét QR', '扫码'],
  scan_hint: ['Dùng nút Quét trong app, không dùng app Camera', '请使用应用内扫码，不要用相机应用'],
  open_in_app: ['Mở app M&E và dùng nút Quét', '请打开M&E应用并使用扫码按钮'],
  continue_here: ['Tiếp tục trong Safari', '在Safari中继续'],
  manual_code: ['Nhập mã', '输入编号'],
  qr_foreign: ['Mã này không thuộc M&E', '此码不属于M&E'],
  qr_unavailable: ['Không tìm thấy hoặc không có quyền xem', '未找到或无权查看'],
  qr_inactive: ['Hồ sơ đã ngừng sử dụng', '记录已停用'],
  qr_expired: ['Tem đã hết hiệu lực', '标签已失效'],
  qr_not_in_restored: ['Không có mã này trong dữ liệu hiện tại', '当前数据中无此码'],
  doc_too_large: ['Tệp quá lớn để mở trong app', '文件过大，无法在应用内打开'],
  photo_warning: ['Không chụp hợp đồng/chứng nhận vào mục ảnh', '请勿将合同或证书作为照片上传'],
  coming_soon: ['Sắp có', '即将推出'],
  env_test: ['THỬ', '测试'],
  poc_title: ['Kiểm thử PoC', 'PoC测试'],
  equipment: ['Thiết bị', '设备'],
  inspections: ['Kiểm định', '检验']
};

/** HTML song ngữ "Việt · 中文" (đã thoát ký tự) */
export function bi(keyOrPair, vars) {
  const pair = Array.isArray(keyOrPair) ? keyOrPair : (L[keyOrPair] || [keyOrPair, keyOrPair]);
  let [vi, zh] = pair;
  if (vars) for (const k of Object.keys(vars)) { vi = vi.replace(k, vars[k]); zh = zh.replace(k, vars[k]); }
  if (!zh) return `<span class="vi">${esc(vi)}</span>`;
  if (!vi) return `<span class="zh">${esc(zh)}</span>`;
  return `<span class="vi">${esc(vi)}</span><span class="sep"> · </span><span class="zh">${esc(zh)}</span>`;
}
export function biText(keyOrPair, vars) {
  const pair = Array.isArray(keyOrPair) ? keyOrPair : (L[keyOrPair] || [keyOrPair, keyOrPair]);
  let [vi, zh] = pair;
  if (vars) for (const k of Object.keys(vars)) { vi = vi.replace(k, vars[k]); zh = zh.replace(k, vars[k]); }
  return zh ? `${vi} · ${zh}` : vi;
}
export function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** Lời báo của phản hồi máy chủ */
export function resMsg(r) {
  if (!r) return '';
  if (r.message_vi) return `${r.message_vi} · ${r.message_zh || ''}`;
  if (r.code === 'UNKNOWN_RESULT') return biText('unknown_result');
  if (r.code === 'NETWORK_ERROR') return biText('network_error');
  return r.code || '';
}

/* ---------------- IndexedDB (me_*) ---------------- */
const DBS = {
  me_auth: { v: 1, stores: ['kv'] },
  me_data: { v: 1, stores: ['records', 'meta', 'queue', 'done'] },
  me_files: { v: 1, stores: ['files'] },
  me_poc: { v: 1, stores: ['results', 'meta'] }
};
const dbCache = {};
function openDb(name) {
  if (dbCache[name]) return dbCache[name];
  dbCache[name] = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DBS[name].v);
    req.onupgradeneeded = () => {
      const db = req.result;
      DBS[name].stores.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbCache[name];
}
function tx(dbName, store, mode, fn) {
  return openDb(dbName).then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
export const idb = {
  get: (db, store, key) => openDb(db).then((d) => wrap(d.transaction(store).objectStore(store).get(key))),
  put: (db, store, key, val) => tx(db, store, 'readwrite', (s) => { s.put(val, key); }),
  del: (db, store, key) => tx(db, store, 'readwrite', (s) => { s.delete(key); }),
  clear: (db, store) => tx(db, store, 'readwrite', (s) => { s.clear(); }),
  all: (db, store) => openDb(db).then((d) => new Promise((res, rej) => {
    const out = [];
    const req = d.transaction(store).objectStore(store).openCursor();
    req.onsuccess = () => { const c = req.result; if (c) { out.push({ key: c.key, value: c.value }); c.continue(); } else res(out); };
    req.onerror = () => rej(req.error);
  }))
};

/* ---------------- Gọi máy chủ (3.15) ---------------- */
export const session = { token: null, epoch: null, user: null, settings: {}, reauth: null, kind: null };

const LONG_ACTIONS = /^(import\.|doc\.upload|doc\.download|doc\.thumbs|sync\.bootstrap|report\.|export\.|poc\.)/;
let running = 0;
const waiters = [];
async function slot() {
  if (running < 4) { running++; return; }
  await new Promise((r) => waiters.push(r));
  running++;
}
function release() { running--; const w = waiters.shift(); if (w) w(); }

/** Gửi request thô (đã có phong bì). Trả JSON máy chủ hoặc {ok:false, code: NETWORK_ERROR|UNKNOWN_RESULT}. */
export async function rawPost(req, { timeoutMs, write = false, bypassLimit = false } = {}) {
  const url = execUrl();
  if (!url) return { ok: false, code: 'NETWORK_ERROR', transport: 'NO_URL' };
  if (!bypassLimit) await slot();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 30000);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(req), redirect: 'follow', signal: ctl.signal, cache: 'no-store' });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ }
    const ms = Math.round(performance.now() - t0);
    if (!res.ok || !json || typeof json !== 'object') {
      return { ok: false, code: write ? 'UNKNOWN_RESULT' : 'NETWORK_ERROR', transport: 'NON_JSON', http: res.status, client_ms: ms, operation_id: req.operation_id || null };
    }
    json.client_ms = ms;
    return json;
  } catch (e) {
    return { ok: false, code: write ? 'UNKNOWN_RESULT' : 'NETWORK_ERROR', transport: e && e.name === 'AbortError' ? 'TIMEOUT' : (e && e.name) || 'ERROR', client_ms: Math.round(performance.now() - t0), operation_id: req.operation_id || null };
  } finally {
    clearTimeout(timer);
    if (!bypassLimit) release();
  }
}

/** Tạo phong bì request (3.15) */
export function envelope(action, payload = {}, opts = {}) {
  const req = {
    api_contract_version: API_CONTRACT_VERSION, action, payload, device_id: deviceId(), app_version: BUILD_VERSION,
    client_time: isoNowVN()
  };
  const tok = opts.token !== undefined ? opts.token : session.token;
  if (tok) req.token = tok;
  const ep = opts.epoch !== undefined ? opts.epoch : session.epoch;
  if (ep) req.dataset_epoch = ep;
  if (opts.write) {
    req.operation_id = opts.operation_id || uuid();
    req.expected_version = opts.expected_version === undefined ? 0 : opts.expected_version;
  }
  if (opts.reauth_token || session.reauth) req.reauth_token = opts.reauth_token || session.reauth;
  return req;
}

const listeners = new Set();
export function onApiEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Gọi action. opts: {write, operation_id, expected_version, retry (đọc: thử lại sau 2, 5, 10 giây), timeoutMs}
 */
export async function api(action, payload = {}, opts = {}) {
  const req = envelope(action, payload, opts);
  const timeoutMs = opts.timeoutMs || (LONG_ACTIONS.test(action) ? (session.settings.client_long_timeout_seconds || 55) * 1000 : (session.settings.client_timeout_seconds || 30) * 1000);
  let r = await rawPost(req, { timeoutMs, write: !!opts.write, bypassLimit: !!opts.bypassLimit });
  if (!opts.write && opts.retry && r.code === 'NETWORK_ERROR') {
    for (const wait of [2000, 5000, 10000]) {
      await new Promise((res) => setTimeout(res, wait));
      r = await rawPost(req, { timeoutMs, write: false });
      if (r.code !== 'NETWORK_ERROR') break;
    }
  }
  if (r.dataset_epoch && !session.epoch) session.epoch = r.dataset_epoch;
  r.request = { action, operation_id: req.operation_id || null };
  listeners.forEach((fn) => { try { fn(r); } catch (e) { /* bỏ qua */ } });
  return r;
}

/** Base64 ↔ byte */
export function bytesToB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export async function blobToB64(blob) {
  return bytesToB64(new Uint8Array(await blob.arrayBuffer()));
}
export function b64url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Thông tin máy (P-19, báo cáo PoC) */
export function deviceInfo() {
  const ua = navigator.userAgent;
  const ios = /(iPhone|iPad|iPod).*OS (\d+)_(\d+)(?:_(\d+))?/.exec(ua);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  let browser = 'khác';
  if (/CriOS/.test(ua)) browser = 'Chrome iOS';
  else if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return {
    platform: ios ? ios[1] : (/Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'khác'),
    ios_version: ios ? `${ios[2]}.${ios[3]}${ios[4] ? '.' + ios[4] : ''}` : null,
    browser, standalone, screen: `${screen.width}×${screen.height}@${window.devicePixelRatio}`,
    user_agent: ua
  };
}
