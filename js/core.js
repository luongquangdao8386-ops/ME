// Lõi phía app: cấu hình, UUID, định dạng, nhãn song ngữ, IndexedDB, gọi máy chủ.
// Mọi tên lưu trữ có tiền tố me (phụ lục 1.5 mục 2.1): IndexedDB me_*, Cache me-*, localStorage me.*

import { DICT } from './dict.js';

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
  return /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(String(u || '').trim());
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
  let s = Math.abs(v).toFixed(maxFrac);
  if (s.includes('.')) s = s.replace(/\.?0+$/, ''); // bỏ số 0 cuối phần lẻ, không đụng phần nguyên
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
// Nguồn duy nhất: i18n/labels.json → js/dict.js (npm run build). Không viết cứng chữ trong màn hình.
export const L = DICT;

function pairOf(keyOrPair) {
  if (Array.isArray(keyOrPair)) return keyOrPair;
  return L[keyOrPair] || [keyOrPair, keyOrPair];
}
function fill(s, vars) {
  if (!vars) return s;
  for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
/** Màu của nhãn trạng thái (green · amber · red · navy · grey) */
export function toneOf(key) {
  const p = L[key];
  return (p && p[2]) || 'grey';
}
/** Nhãn trạng thái kèm màu, luôn có chữ (1.4 §3.3) */
export function badge(key, vars, extraClass = '') {
  return `<span class="badge t-${toneOf(key)}${extraClass ? ' ' + extraClass : ''}">${bi(key, vars)}</span>`;
}
/** Tên song ngữ của một bản ghi (name_vi/name_zh) kèm nhãn dịch máy / chưa có bản dịch (2.3) */
export function biName(rec, f = 'name') {
  if (!rec) return '';
  const vi = rec[f + '_vi'] || '', zh = rec[f + '_zh'] || '';
  const meta = rec.i18n_meta && rec.i18n_meta[f];
  const mt = meta && meta.state === 'MACHINE';
  const missing = meta && (meta.state === 'PENDING' || meta.state === 'MANUAL_REQUIRED');
  const tagMt = ` <span class="tag mt">${bi('tag.machine_translated')}</span>`;
  const none = `<span class="tag none">${bi('tag.no_translation')}</span>`;
  const viH = vi ? `<span class="vi">${esc(vi)}</span>${mt && meta.src === 'zh' ? tagMt : ''}` : (missing || zh ? none : '');
  const zhH = zh ? `<span class="zh">${esc(zh)}</span>${mt && meta.src === 'vi' ? tagMt : ''}` : (missing || vi ? none : '');
  if (!viH && !zhH) return '';
  return `${viH}<span class="sep"> · </span>${zhH}`;
}
/** Tên một dòng: chữ thuần "Việt · 中文" */
export function nameText(rec, f = 'name') {
  if (!rec) return '';
  const vi = rec[f + '_vi'] || '', zh = rec[f + '_zh'] || '';
  return vi && zh ? `${vi} · ${zh}` : (vi || zh);
}

/** HTML song ngữ "Việt · 中文" (đã thoát ký tự) */
export function bi(keyOrPair, vars) {
  const pair = pairOf(keyOrPair);
  const vi = fill(pair[0], vars), zh = fill(pair[1], vars);
  if (!zh) return `<span class="vi">${esc(vi)}</span>`;
  if (!vi) return `<span class="zh">${esc(zh)}</span>`;
  return `<span class="vi">${esc(vi)}</span><span class="sep"> · </span><span class="zh">${esc(zh)}</span>`;
}
export function biText(keyOrPair, vars) {
  const pair = pairOf(keyOrPair);
  const vi = fill(pair[0], vars), zh = fill(pair[1], vars);
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
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DBS[name].v);
    req.onupgradeneeded = () => {
      const db = req.result;
      DBS[name].stores.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
    };
    req.onsuccess = () => {
      const db = req.result;
      // iOS có thể cắt kết nối IndexedDB khi app nằm nền lâu: bỏ kết nối cũ để lần sau mở lại
      db.onclose = () => { delete dbCache[name]; };
      db.onversionchange = () => { db.close(); delete dbCache[name]; };
      resolve(db);
    };
    req.onerror = () => { delete dbCache[name]; reject(req.error); };
    req.onblocked = () => { delete dbCache[name]; reject(new Error('IndexedDB blocked')); };
  });
  dbCache[name] = p;
  return p;
}
/** Chạy thao tác IndexedDB; kết nối hỏng (InvalidStateError/UnknownError) thì mở lại và thử một lần nữa */
async function withDb(name, fn) {
  try {
    return await fn(await openDb(name));
  } catch (e) {
    if (e && (e.name === 'InvalidStateError' || e.name === 'UnknownError' || /connection|closing/i.test(e.message || ''))) {
      delete dbCache[name];
      return fn(await openDb(name));
    }
    throw e;
  }
}
function tx(dbName, store, mode, fn) {
  return withDb(dbName, (db) => new Promise((resolve, reject) => {
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
  get: (db, store, key) => withDb(db, (d) => wrap(d.transaction(store).objectStore(store).get(key))),
  put: (db, store, key, val) => tx(db, store, 'readwrite', (s) => { s.put(val, key); }),
  del: (db, store, key) => tx(db, store, 'readwrite', (s) => { s.delete(key); }),
  clear: (db, store) => tx(db, store, 'readwrite', (s) => { s.clear(); }),
  all: (db, store) => withDb(db, (d) => new Promise((res, rej) => {
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

/** Dạng URL cuối sau chuyển hướng (máy chủ + đường dẫn, ẩn mã triển khai) để chẩn đoán */
function urlShape(u) {
  try { const x = new URL(u); return x.hostname + x.pathname.replace(/\/s\/[^/]+\//, '/s/…/'); } catch (e) { return ''; }
}

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
      return { ok: false, code: write ? 'UNKNOWN_RESULT' : 'NETWORK_ERROR', transport: 'NON_JSON', http: res.status, final_url: urlShape(res.url), client_ms: ms, operation_id: req.operation_id || null };
    }
    // POST bị chuyển thành GET trên đường đi: máy chủ chạy doGet (via:'GET') thay vì doPost → coi như mất phản hồi
    if (json.via === 'GET' || (json.code === 'NOT_FOUND' && json.message_vi === undefined)) {
      return { ok: false, code: write ? 'UNKNOWN_RESULT' : 'NETWORK_ERROR', transport: 'REDIRECTED_AS_GET', final_url: urlShape(res.url), client_ms: ms, operation_id: req.operation_id || null };
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
  const safariVer = /Version\/(\d+(?:\.\d+)*)/.exec(ua);
  const manualIos = ls.get('ios_manual');
  return {
    safari_version: safariVer ? safariVer[1] : null,
    ios_manual: manualIos || null,
    platform: ios ? ios[1] : (/Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'khác'),
    ios_version: ios ? (manualIos || `${ios[2]}.${ios[3]}${ios[4] ? '.' + ios[4] : ''}${ios[2] === '18' && ios[3] === '6' ? ' (UA)' : ''}`) : null,
    browser, standalone, screen: `${screen.width}×${screen.height}@${window.devicePixelRatio}`,
    user_agent: ua
  };
}
