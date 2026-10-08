// Bàn thử Bước 0 — PoC (phụ lục 1.5 mục 6.2). Mỗi mục ghi kết quả + số đo; xuất báo cáo để gửi lại.
import {
  api, rawPost, envelope, session, idb, ls, uuid, bi, biText, esc, resMsg, fmtNumber, fmtDateTime, fmtDate, isoNowVN, todayVN,
  deviceInfo, execUrl, BUILD_VERSION, APP_BASE_URL, b64url
} from './core.js';
import { bootstrap, pullChanges, getRecords, getMeta, setMeta, enqueue, queueItems, doneItems, flushQueue, upsertLocal, exportBackup } from './sync.js';
import { pbkdf2, getVerifier, isIosSafariTab } from './auth.js';
import { processPhoto, uploadDoc, downloadDoc, shareFileNow, makeTestPdf, photoUrls, probeImg, probeCors } from './media.js';
import { openScanner, parseScan, resolveScan, qrStateText } from './scan.js';
import { h, $, $$, toast, dialog, askPin } from './ui.js';

const ST = {
  pass: ['Đạt', '通过'], fail: ['Không đạt', '未通过'], manual: ['Cần xem tay', '需人工确认'], info: ['Đã ghi', '已记录'], none: ['Chưa chạy', '未运行']
};
const results = {};

async function loadResults() {
  for (const { key, value } of await idb.all('me_poc', 'results').catch(() => [])) results[key] = value;
}
/** Bản máy chủ hỏi trực tiếp lúc mở trang (bản lưu lúc bootstrap có thể cũ sau khi triển khai lại) */
let serverVersion = null;
async function refreshServerVersion(main) {
  const r = await rawPost(envelope('system.getPublicState', {}, { token: null, epoch: null }), { timeoutMs: 30000 });
  if (!r.ok || !r.data || !r.data.server_version) return;
  serverVersion = r.data.server_version;
  const boot = await getMeta('bootstrap');
  if (boot && boot.server_version !== serverVersion) { boot.server_version = serverVersion; await setMeta('bootstrap', boot); }
  const el = main.querySelector('#srv-ver');
  if (el) el.textContent = serverVersion;
}
async function rec(code, status, summary, metrics = {}) {
  const d = deviceInfo();
  results[code] = {
    code, status, summary, metrics, at: isoNowVN(), ver: `app ${BUILD_VERSION} / máy chủ ${serverVersion || '?'}`,
    device: `${d.platform}${d.ios_version ? ' iOS ' + d.ios_version : ''} · ${d.standalone ? 'Màn hình chính' : d.browser}`
  };
  await idb.put('me_poc', 'results', code, results[code]).catch(() => {});
  paintStatus(code);
}
function badge(status) {
  return `<span class="badge ${status}">${bi(ST[status] || ST.none)}</span>`;
}
function paintStatus(code) {
  const card = document.querySelector(`[data-poc="${code}"]`);
  if (!card) return;
  const r = results[code];
  $('.poc-badge', card).innerHTML = badge(r ? r.status : 'none');
  $('.poc-summary', card).textContent = r ? `${r.summary} — ${fmtDateTime(r.at)}${r.ver ? ' · ' + r.ver : ''}` : '';
}
function out(code, html) {
  const el = document.querySelector(`[data-poc="${code}"] .poc-out`);
  if (el) el.insertAdjacentHTML('beforeend', `<div class="line">${html}</div>`);
}
function clearOut(code) {
  const el = document.querySelector(`[data-poc="${code}"] .poc-out`);
  if (el) el.innerHTML = '';
}
const ms = (n) => `${fmtNumber(n)} ms`;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const code = (r) => `<code>${esc(r.code)}</code>`;
/** Lỗi đường truyền/bận: chưa biết kết quả, không phải lỗi nghiệp vụ */
const TRANSIENT = new Set(['UNKNOWN_RESULT', 'NETWORK_ERROR', 'SERVER_BUSY']);
const transient = (r) => !r || TRANSIENT.has(r.code);

/** Ghi có thử lại khi lỗi đường truyền hoặc SERVER_BUSY: giữ nguyên operation_id để máy chủ không ghi trùng (3.3) */
async function writeSure(action, payload, opts = {}, log, waits = [2000, 5000, 10000, 0]) {
  const operation_id = opts.operation_id || uuid();
  let r, retries = 0;
  for (const wait of waits) {
    r = await api(action, payload, { ...opts, write: true, operation_id });
    if (!transient(r) || !wait) break;
    retries++;
    if (log) log(`&nbsp;&nbsp;${code(r)}${r.transport ? ' · ' + esc(r.transport) : ''} → gửi lại cùng operation_id`);
    await sleep(wait + Math.floor(Math.random() * 1000)); // lệch nhau để các máy không gửi lại cùng lúc
  }
  r.retries = retries;
  return r;
}
/** Kết luận một mục kiểm: null = chưa kết luận được vì lỗi đường truyền */
const verdict = (cond, ...rs) => (rs.some(transient) ? null : !!cond);
const mark = (v) => (v ? '✓' : v === null ? '?' : '✗');

function card(codeId, title, goal, body) {
  return `<details class="poc-card card" data-poc="${codeId}">
    <summary><span class="poc-code">${codeId}</span><span class="poc-title">${title}</span><span class="poc-badge">${badge('none')}</span></summary>
    <p class="poc-goal">${goal}</p>
    <div class="poc-actions">${body}</div>
    <p class="poc-summary muted"></p>
    <div class="poc-out"></div>
  </details>`;
}
const btn = (id, label, kind = '') => `<button type="button" class="btn small ${kind}" id="${id}">${label}</button>`;

/* ================= Các mục thử ================= */

async function p01() {
  clearOut('P-01');
  const run = 'p01' + uuid().slice(0, 8);
  const times = [], serverMs = [];
  let ok = 0;
  const errs = {}, failed = [], details = [];
  const net = ($('#p01-net') || {}).value || '', relay = ($('#p01-relay') || {}).value || '';
  ls.set('p01_net', net); ls.set('p01_relay', relay);
  for (let i = 0; i < 20; i++) {
    const r = await rawPost(envelope('system.getPublicState', { probe_run: run, probe_seq: i }, { token: null, epoch: null }), { timeoutMs: 30000 });
    if (r.ok) { ok++; times.push(r.client_ms); if (typeof r.server_ms === 'number') serverMs.push(r.server_ms); }
    else {
      const k = r.code + (r.transport ? '/' + r.transport : ''); errs[k] = (errs[k] || 0) + 1; failed.push(i);
      details.push({ i: i + 1, t: r.transport || r.code, http: r.http || null, url: r.final_url || '', ms: r.client_ms || null });
    }
    out('P-01', `#${i + 1}: ${r.ok ? '✓' : '✗ ' + esc(r.code) + (r.transport ? ' ' + esc(r.transport) : '') + (r.http ? ' HTTP ' + esc(r.http) : '') + (r.final_url ? ' · ' + esc(r.final_url) : '')} ${r.client_ms ? ms(r.client_ms) : ''}${typeof r.server_ms === 'number' ? ' (máy chủ ' + ms(r.server_ms) + ')' : ''}`);
  }
  let getOk = false, getMs = null;
  try {
    const t0 = performance.now();
    const g = await fetch(execUrl() + '?action=system.health', { cache: 'no-store' });
    const j = await g.json();
    getOk = j.ok === true && j.app_id === 'ME';
    getMs = Math.round(performance.now() - t0);
  } catch (e) { getOk = false; }
  out('P-01', `GET system.health: ${getOk ? '✓' : '✗'} ${getMs ? ms(getMs) : ''}`);
  // Chẩn đoán: request lỗi có chạy doPost trên máy chủ không? (mất phản hồi hay bị đổi thành GET trước khi chạy)
  let diag = null;
  if (failed.length) {
    const d = await rawPost(envelope('system.getPublicState', { probe_run: run, probe_read: true }, { token: null, epoch: null }), { timeoutMs: 30000 });
    if (d.ok && d.data && d.data.probe) {
      const seen = d.data.probe.seen || [];
      diag = { failed, executed_on_server: failed.filter((i) => seen.includes(i)), gets_without_action: (d.data.probe.gets_without_action || []).length };
      out('P-01', `Chẩn đoán: ${failed.length} request lỗi; máy chủ đã chạy doPost cho ${diag.executed_on_server.length} request trong số đó (${esc(diag.executed_on_server.map((i) => '#' + (i + 1)).join(', ') || '—')}); số lần doGet không có action gần đây: ${diag.gets_without_action}`);
    }
  }
  // Giữ tóm tắt các lần chạy trước để so Wi-Fi / 4G, bật / tắt Private Relay
  const prevRuns = results['P-01'] && results['P-01'].metrics && results['P-01'].metrics.runs ? results['P-01'].metrics.runs : [];
  const runs = prevRuns.concat([{ at: isoNowVN(), net, relay, ok, median_ms: median(times), lost_after_exec: diag ? diag.executed_on_server.length : 0 }]).slice(-6);
  const m = { ok, total: 20, median_ms: median(times), max_ms: Math.max(...times, 0), server_median_ms: median(serverMs), get_health: getOk, errors: errs, diag, details, net, relay, runs };
  await rec('P-01', ok === 20 && getOk ? 'pass' : 'fail', `${net ? '[' + net + (relay ? ', relay ' + relay : '') + '] ' : ''}${ok}/20, trung vị ${ms(m.median_ms || 0)} (máy chủ ${ms(m.server_median_ms || 0)}), chậm nhất ${ms(m.max_ms)}${failed.length ? ', lỗi: ' + Object.entries(errs).map(([k, v]) => k + '×' + v).join(' ') : ''}${runs.length > 1 ? ' · các lần: ' + runs.map((x) => (x.net || '?') + (x.relay ? '/' + x.relay : '') + ' ' + x.ok + '/20').join(', ') : ''}`, m);
}

const VEC = {
  pepper_b64: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=', salt_b64: 'EBESExQVFhcYGRobHB0eHw==',
  pin: '049271', expect_pin_hash: 'BReBCRePhH+MbkyQq1hJPsdSpt4GE3jhRBc/qYy6+HU='
};
async function clientHmacVector() {
  const dec = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', dec(VEC.pepper_b64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const msg = new Uint8Array([...dec(VEC.salt_b64), ...new TextEncoder().encode(VEC.pin)]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  return btoa(String.fromCharCode(...sig));
}
async function p02vectors() {
  clearOut('P-02');
  const r = await api('poc.vectors');
  const client = await clientHmacVector();
  const clientOk = client === VEC.expect_pin_hash;
  if (!r.ok) { out('P-02', `poc.vectors: ${code(r)} ${esc(resMsg(r))}`); await rec('P-02', 'fail', 'Không gọi được poc.vectors', { code: r.code }); return; }
  Object.keys(r.data.pass).forEach((k) => out('P-02', `${r.data.pass[k] ? '✓' : '✗'} ${esc(k)}`));
  out('P-02', `${clientOk ? '✓' : '✗'} WebCrypto (app) = Apps Script (máy chủ)`);
  out('P-02', `${!/token|pin/i.test(location.href) ? '✓' : '✗'} PIN/token không có trong URL`);
  const prev = results['P-02'] ? results['P-02'].metrics : {};
  const m = { ...prev, vectors_server: r.data.all_pass, vectors_client: clientOk };
  await rec('P-02', p02status(m), p02summary(m), m);
}
function p02status(m) {
  if (m.vectors_server === false || m.vectors_client === false || m.weak === false || m.lockout === false) return 'fail';
  if (m.vectors_server && m.vectors_client && m.weak && m.lockout && m.login_ok) return 'pass';
  return 'info';
}
function p02summary(m) {
  return [`test vector ${m.vectors_server && m.vectors_client ? '✓' : m.vectors_server === undefined ? '—' : '✗'}`,
    `PIN yếu ${m.weak ? '✓' : m.weak === undefined ? '—' : '✗'}`, `khóa 5 lần ${m.lockout ? '✓' : m.lockout === undefined ? '—' : '✗'}`].join(', ');
}
async function p02weak() {
  const pin = await askPin('current_pin', 'Nhập PIN hiện tại để thử máy chủ chặn PIN yếu (PIN không đổi) · 输入当前PIN以测试弱PIN拦截（不会修改PIN）');
  if (!pin) return;
  const codes = [];
  for (const weak of ['012345', '000000']) {
    // PIN yếu không bao giờ được ghi nên gửi lại khi lỗi đường truyền là an toàn
    const r = await api('pin.change', { current_pin: pin, new_pin: weak }, { retry: true });
    const sub = r.errors && r.errors[0] ? r.errors[0].code : '';
    codes.push(sub || r.code);
    out('P-02', `pin.change → ${esc(weak)}: ${code(r)} ${esc(sub)}`);
    if (r.ok) { toast('PIN đã bị đổi! · PIN已被修改', 'err'); break; }
    if (r.code === 'AUTH_FAILED') { out('P-02', 'PIN hiện tại sai — chưa kết luận · 当前PIN错误，无法判断'); return; }
    if (transient(r)) { out('P-02', 'Lỗi đường truyền — chưa kết luận, bấm thử lại · 网络错误，请重试'); return; }
  }
  const prev = results['P-02'] ? results['P-02'].metrics : {};
  const m = { ...prev, weak: codes.every((c) => c === 'PIN_WEAK'), login_ok: true };
  await rec('P-02', p02status(m), p02summary(m), m);
}
async function p02lock() {
  // Lần sai thứ 5 phải trả PIN_LOCKED. Request lỗi đường truyền có thể đã chạy hoặc chưa,
  // nên chỉ đòi: số AUTH_FAILED trước lần khóa ≤ 4 và cộng cả request lỗi thì ≥ 4; sau đó vẫn PIN_LOCKED.
  const seq = [];
  let locked = 0;
  for (let i = 0; i < 9 && locked < 2; i++) {
    const wrong = String(100000 + Math.floor(Math.random() * 899999));
    const r = await rawPost(envelope('auth.login', { employee_code: 'MAU-KHOA', pin: wrong, device_label: 'PoC P-02' }, { token: null, epoch: null }), { timeoutMs: 30000 });
    const c = r.code === 'NETWORK_ERROR' && r.transport ? 'NETWORK_ERROR:' + r.transport : r.code;
    seq.push(c);
    out('P-02', `MAU-KHOA lần ${i + 1}: ${code(r)}${r.transport ? ' · ' + esc(r.transport) : ''}${r.data && r.data.retry_after_seconds ? ' · ' + r.data.retry_after_seconds + ' s' : ''}`);
    if (i === 0 && r.code === 'PIN_LOCKED') {
      out('P-02', 'MAU-KHOA đang bị khóa từ lần thử trước: chờ hết thời gian khóa (hoặc chạy pocResetPin) rồi thử lại · MAU-KHOA仍处于锁定状态');
      return;
    }
    if (r.code === 'PIN_LOCKED') locked++;
  }
  const first = seq.findIndex((c) => c === 'PIN_LOCKED');
  const before = first < 0 ? seq : seq.slice(0, first);
  const af = before.filter((c) => c === 'AUTH_FAILED').length;
  const unk = before.filter((c) => c.startsWith('NETWORK_ERROR')).length;
  const other = before.length - af - unk;
  let lockOk;
  if (other) lockOk = null; // vd. LOGIN_PAUSED
  else if (first < 0) lockOk = af >= 5 ? false : null;
  else if (af > 4 || af + unk < 4) lockOk = false;
  else lockOk = locked >= 2 ? true : null;
  if (lockOk && unk) out('P-02', `(có ${unk} request lỗi đường truyền trước khi khóa — máy chủ vẫn đếm đúng)`);
  if (lockOk === null) { out('P-02', 'Lỗi đường truyền nhiều — chưa kết luận · 网络错误过多，无法判断'); return; }
  const prev = results['P-02'] ? results['P-02'].metrics : {};
  const m = { ...prev, lockout: lockOk, lock_sequence: seq };
  await rec('P-02', p02status(m), p02summary(m), m);
}

async function p03() {
  clearOut('P-03');
  const log = (t) => out('P-03', t);
  const id = uuid();
  const payload = { equipment_id: id, name_vi: 'P03 thử ghi ' + fmtDateTime(new Date()) };
  const opId = uuid();
  const checks = {};
  const r1 = await writeSure('equipment.create', payload, { operation_id: opId, expected_version: 0 }, log);
  checks.committed = verdict(r1.ok && r1.state === 'COMMITTED' && r1.record_version === 1 && r1.dataset_epoch === session.epoch, r1);
  log(`1. Tạo: ${code(r1)} ${esc(r1.state || '')} v${r1.record_version} ${esc(r1.data ? r1.data.display_code : '')} ${r1.client_ms ? ms(r1.client_ms) : ''}`);
  const r2 = await writeSure('equipment.create', payload, { operation_id: opId, expected_version: 0 }, log);
  checks.duplicate = verdict(r2.code === 'DUPLICATE_OPERATION' && r2.data && r1.data && r2.data.display_code === r1.data.display_code, r1, r2);
  log(`2. Gửi lại cùng operation_id: ${code(r2)}`);
  const r3 = await writeSure('equipment.create', { ...payload, name_vi: payload.name_vi + ' (khác)' }, { operation_id: opId, expected_version: 0 }, log);
  checks.reused = verdict(r3.code === 'OPERATION_ID_REUSED', r3);
  log(`3. Cùng operation_id, khác nội dung: ${code(r3)}`);
  const r4 = await writeSure('equipment.edit', { equipment_id: id, model: 'P03-A' }, { expected_version: 1 }, log);
  const r5 = await writeSure('equipment.edit', { equipment_id: id, model: 'P03-B' }, { expected_version: 1 }, log);
  checks.conflict = verdict(r4.ok && r5.code === 'VERSION_CONFLICT', r1, r4, r5);
  log(`4. Sửa v1 → ${code(r4)} v${r4.record_version}; sửa lại với v1 → ${code(r5)}`);
  // 5. Mất phản hồi: cắt request sau 300 ms → UNKNOWN_RESULT → hỏi trạng thái → gửi lại cùng operation_id
  const id6 = uuid(), op6 = uuid();
  const p6 = { equipment_id: id6, name_vi: 'P03 mất phản hồi' };
  const r6 = await api('equipment.create', p6, { write: true, operation_id: op6, expected_version: 0, timeoutMs: 300 });
  log(`5. Cắt request sau 300 ms: ${code(r6)}`);
  let st = null;
  for (let i = 0; i < 8; i++) {
    await sleep(2500);
    st = await api('sync.getOperationStatus', { operation_id: op6 }, { retry: true });
    log(`&nbsp;&nbsp;getOperationStatus: ${esc(st.ok ? st.data.state : st.code)}`);
    if (st.ok && st.data.state === 'COMMITTED') break;
  }
  if (!(st && st.ok && st.data.state === 'COMMITTED')) {
    const r7 = await writeSure('equipment.create', p6, { operation_id: op6, expected_version: 0 }, log);
    log(`&nbsp;&nbsp;Gửi lại cùng operation_id: ${code(r7)}`);
  }
  const r8 = await api('sync.getOperationStatus', { operation_id: op6 }, { retry: true });
  checks.unknown = verdict(r6.code === 'UNKNOWN_RESULT' && r8.ok && r8.data.state === 'COMMITTED', r8);
  const vals = Object.values(checks);
  const status = vals.includes(false) ? 'fail' : vals.includes(null) ? 'info' : 'pass';
  const retries = [r1, r2, r3, r4, r5].reduce((n, r) => n + (r.retries || 0), 0);
  if (retries) log(`(đã gửi lại ${retries} lần do lỗi đường truyền/bận)`);
  await rec('P-03', status, Object.entries(checks).map(([k, v]) => `${k} ${mark(v)}`).join(', ') + (retries ? `, gửi lại ${retries}` : ''), { ...checks, create_ms: r1.client_ms, retries });
  pullChanges();
}

async function p04render() {
  const list = $('#p04-queue');
  if (!list) return;
  const q = await queueItems();
  const d = await doneItems();
  const stLabel = { QUEUED: 'queued', SENDING: 'sending', UNKNOWN: 'unknown_result', REJECTED: 'failed', CONFLICT: 'conflict', COMMITTED: 'committed' };
  list.innerHTML = [...q, ...d.slice(-5)].map((o) => `<li>${esc(o.action)} · ${esc(o.payload.certificate_number || o.operation_id.slice(0, 8))} · ${bi(stLabel[o.state] || 'queued')}${o.created_offline ? ' · tạo khi offline' : ''}${o.result && o.result.display_code ? ' · ' + esc(o.result.display_code) : ` · ${bi('pending_code')}`}</li>`).join('') || '<li class="muted">—</li>';
}
async function p04draft() {
  const reqs = await getRecords('INSPECTION_REQUIREMENT');
  if (!reqs.length) {
    toast('Chưa có yêu cầu kiểm định mẫu (chạy pocSeedSampleData) · 无示例检验要求', 'err');
    out('P-04', 'Máy này chưa có dữ liệu yêu cầu kiểm định: khi có mạng bấm Đồng bộ ngay ở đầu trang rồi làm lại · 本机尚无检验要求数据，请联网后先同步');
    return;
  }
  const today = todayVN();
  const next = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const op = await enqueue('inspection.submit', {
    inspection_id: uuid(), requirement_id: reqs[0].requirement_id, inspection_date: today, valid_from: today, valid_to: next,
    result: 'PASS', certificate_number: 'P04-' + Date.now().toString(36).toUpperCase()
  }, { entity_type: 'INSPECTION' });
  op.created_offline = !navigator.onLine;
  await idb.put('me_data', 'queue', op.operation_id, op);
  out('P-04', `${bi('local_saved')}: ${esc(op.payload.certificate_number)}${op.created_offline ? ' (offline)' : ''}`);
  await p04render();
  if (navigator.onLine) toast(bi('local_saved') + ' — ' + bi('sync_now') + '?');
}
async function p04flush() {
  if (!navigator.onLine) { toast(bi('need_network'), 'err'); return; }
  if (!(await queueItems()).length) out('P-04', 'Máy này không có nháp nào đang chờ gửi (nháp nằm trên máy đã tạo ra nó) · 本机没有待同步草稿');
  const r = await flushQueue(() => p04render());
  out('P-04', `${bi('sync_now')}: gửi ${r.sent}, đã lưu ${r.committed}${r.stopped_code ? ' · dừng: ' + esc(r.stopped_code) : ''}`);
  await p04render();
  const done = await doneItems();
  const offlineDone = done.filter((o) => o.created_offline && o.action === 'inspection.submit');
  let once = null;
  if (offlineDone.length) {
    const last = offlineDone[offlineDone.length - 1];
    const v = await api('inspection.view');
    if (v.ok) once = v.data.inspections.filter((x) => x.certificate_number === last.payload.certificate_number).length === 1;
  }
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  const m = { offline_drafts_committed: offlineDone.length, exactly_once: once, persisted, usage: est && est.usage, quota: est && est.quota, offline_open: ls.get('p04_offline_open') };
  const status = offlineDone.length && once && ls.get('p04_offline_open') ? 'pass' : (offlineDone.length ? 'info' : 'manual');
  await rec('P-04', status, `nháp offline đã gửi: ${offlineDone.length}, đúng 1 lần: ${once === null ? '—' : once ? '✓' : '✗'}, mở offline: ${ls.get('p04_offline_open') ? '✓' : '—'}, persist: ${persisted}`, m);
}

let lastScan = null;
async function p05scan() {
  openScanner({
    onResult: async (raw, info) => {
      const p = parseScan(raw, info.manual);
      const res = await resolveScan(p);
      lastScan = { raw, info, p, res };
      const stKey = qrStateText(res.qr_state);
      out('P-05', `${info.manual ? 'Nhập tay' : esc(info.method)} · ${ms(info.ms_to_decode)} · ${esc(raw.slice(0, 80))} → ${res.qr_state === 'OK' ? '✓ ' + esc(res.code) : bi(stKey)}`);
      const prev = results['P-05'] ? results['P-05'].metrics : {};
      const m = { ...prev, method: info.manual ? prev.method : info.method };
      if (!info.manual && res.qr_state === 'OK') {
        const sets = labelSets(await getRecords('EQUIPMENT'));
        const small = sets.small.map((e) => e.equipment_code), large = sets.large.map((e) => e.equipment_code);
        if (small.includes(res.code)) m.small_ok = true;
        if (large.includes(res.code)) m.large_ok = true;
        m.scans = (m.scans || 0) + 1;
      }
      if (info.manual) m.manual_ok = res.qr_state === 'OK';
      if (res.qr_state === 'FOREIGN') m.foreign_ok = true;
      const status = m.small_ok && m.large_ok ? 'pass' : 'info';
      await rec('P-05', status, `${m.method || '—'} · tem nhỏ ${m.small_ok ? '✓' : '—'} · tem lớn ${m.large_ok ? '✓' : '—'} · nhập tay ${m.manual_ok ? '✓' : '—'}`, m);
    }
  });
}

let lastPhoto = null;
async function p06file(file) {
  if (!file) return;
  clearOut('P-06');
  out('P-06', `Ảnh gốc: ${esc(file.type || '?')} · ${fmtNumber(Math.round(file.size / 1024))} KB`);
  let ph;
  try { ph = await processPhoto(file); } catch (e) { out('P-06', `✗ Không đọc được ảnh: ${esc(e.message)}`); await rec('P-06', 'fail', 'Không đọc được ảnh ' + (file.type || ''), { type: file.type }); return; }
  out('P-06', `${esc(ph.how)}: ${ph.src_w}×${ph.src_h} → ${ph.out_w}×${ph.out_h}, ${fmtNumber(Math.round(ph.main.size / 1024))} KB + ảnh nhỏ ${fmtNumber(Math.round(ph.thumb.size / 1024))} KB, ${ms(ph.ms)}`);
  const eq = (await getRecords('EQUIPMENT'))[0];
  if (!eq) { out('P-06', '✗ Chưa có thiết bị mẫu'); return; }
  const up = await uploadDoc({ entity_type: 'EQUIPMENT', entity_id: eq.equipment_id, kind: 'PHOTO_EQUIPMENT', blob: ph.main, mime: 'image/jpeg', thumb: ph.thumb, title_vi: 'Ảnh thử P-06', title_zh: 'P-06测试照片' });
  out('P-06', `doc.upload: ${code(up)}${up.transport ? ' · ' + esc(up.transport) : ''} ${ms(up.upload_ms)}${typeof up.server_ms === 'number' ? ' (máy chủ ' + ms(up.server_ms) + ')' : ''}${up.retries ? ' · gửi lại ' + up.retries : ''} · ${esc(up.data && up.data.record ? up.data.record.drive_sharing_state : '')}`);
  if (!up.ok) { await rec('P-06', 'fail', `Tải ảnh lên lỗi ${up.code}${up.transport ? '/' + up.transport : ''} sau ${up.retries || 0} lần gửi lại`, { upload_code: up.code, transport: up.transport || '', retries: up.retries || 0 }); return; }
  const rec0 = up.data.record;
  await upsertLocal('DOCUMENT', rec0);
  lastPhoto = rec0;
  const box = $('#p06-imgs');
  const urls = photoUrls(rec0.thumb_drive_file_id || rec0.drive_file_id, 400);
  box.innerHTML = `<figure><img alt="" referrerpolicy="no-referrer" src="${esc(urls.thumbnail)}"><figcaption>thumbnail</figcaption></figure>
    <figure><img alt="" referrerpolicy="no-referrer" src="${esc(urls.lh3)}"><figcaption>lh3</figcaption></figure>`;
  await sleep(1500);
  const t = await probeImg(urls.thumbnail), l = await probeImg(urls.lh3);
  const ct = await probeCors(urls.thumbnail), cl = await probeCors(urls.lh3);
  out('P-06', `&lt;img&gt; thumbnail ${t.ok ? '✓' : '✗'} · lh3 ${l.ok ? '✓' : '✗'} · CORS thumbnail ${ct.ok ? '✓' : '✗ ' + esc(ct.error || ct.status)} · CORS lh3 ${cl.ok ? '✓' : '✗ ' + esc(cl.error || cl.status)}`);
  const m = { src: `${ph.src_w}x${ph.src_h}`, in_type: ph.in_type, process_ms: ph.ms, upload_ms: up.upload_ms, upload_server_ms: up.server_ms, upload_retries: up.retries || 0, img_thumbnail: t.ok, img_lh3: l.ok, cors_thumbnail: ct.ok, cors_lh3: cl.ok };
  await rec('P-06', t.ok || l.ok ? 'info' : 'fail', `${m.src} ${ms(ph.ms)}; thumbnail ${t.ok ? '✓' : '✗'}, lh3 ${l.ok ? '✓' : '✗'}, CORS ${ct.ok || cl.ok ? '✓' : '✗'} — còn bước Đặt riêng tư`, m);
}
async function p06private() {
  if (!lastPhoto) { toast('Tải một ảnh trước · 请先上传照片', 'err'); return; }
  const fid = lastPhoto.thumb_drive_file_id || lastPhoto.drive_file_id;
  if (fid) ls.set('p06_old_urls', JSON.stringify(photoUrls(fid, 400)));
  const r = await writeSure('doc.setPrivate', { document_id: lastPhoto.document_id }, { expected_version: lastPhoto.record_version });
  out('P-06', `doc.setPrivate: ${code(r)} ${esc(r.data ? r.data.drive_sharing_state : '')}`);
  if (r.ok) { lastPhoto = r.data.record; await upsertLocal('DOCUMENT', r.data.record); }
  const prev = results['P-06'] ? results['P-06'].metrics : {};
  const m = { ...prev, set_private: r.ok && r.data.drive_sharing_state === 'REVOKED' };
  await rec('P-06', m.set_private && (prev.img_thumbnail || prev.img_lh3) ? 'manual' : 'fail', p06summary(m), m);
  if (m.set_private) { await sleep(3000); await p06check(); }
}
function p06summary(m) {
  const after = m.old_link_blocked === true ? '✓ link cũ bị chặn (không cookie)' : m.old_link_blocked === false ? '✗ link cũ vẫn mở (có thể do bộ nhớ đệm Google — thử lại sau 10 phút)' : 'link cũ: chưa kiểm';
  return `ảnh hiện ${m.img_thumbnail || m.img_lh3 ? '✓' : '✗'}, đặt riêng tư ${m.set_private ? '✓' : m.set_private === false ? '✗' : '—'}, ${after}`;
}
/** Mở lại link ảnh cũ không kèm cookie Google (như người chưa đăng nhập): phải bị chặn */
async function p06check() {
  let urls = null;
  try { urls = JSON.parse(ls.get('p06_old_urls') || 'null'); } catch (e) { urls = null; }
  if (!urls) { toast('Đặt riêng tư một ảnh trước · 请先设为私有', 'err'); return; }
  const prev = results['P-06'] ? results['P-06'].metrics : {};
  // Chỉ kết luận bằng loại link đã đọc được qua CORS lúc còn chia sẻ (thumbnail của Drive thường không cho CORS)
  const kinds = ['lh3', 'thumbnail'].filter((k) => prev['cors_' + k]);
  const probes = {};
  for (const k of kinds) probes[k] = await probeCors(urls[k]);
  const blocked = kinds.length ? kinds.every((k) => !probes[k].ok) : null;
  out('P-06', `Link cũ, không cookie: ${kinds.map((k) => `${k} ${probes[k].ok ? 'vẫn mở' : 'bị chặn ✓'}`).join(' · ') || 'không tự kiểm được (CORS)'}`);
  out('P-06', `Link cũ để thử ở cửa sổ ẩn danh: <code>${esc(urls.lh3)}</code>`);
  const m = { ...prev, old_link_blocked: blocked };
  const status = m.set_private && blocked ? 'pass' : (m.set_private ? 'manual' : 'fail');
  await rec('P-06', status, p06summary(m), m);
}

let p07file = null, p07doc = null;
async function p07upload(file, kind = 'CERTIFICATE') {
  const eq = (await getRecords('EQUIPMENT'))[0];
  if (!eq) { toast('Chưa có thiết bị mẫu', 'err'); return null; }
  const blob = file || makeTestPdf(['M&E PoC P-07', 'Certificate test file', new Date().toISOString()]);
  const mime = blob.type === 'application/pdf' || /\.pdf$/i.test(blob.name || '') ? 'application/pdf' : (blob.type || 'application/pdf');
  const up = await uploadDoc({ entity_type: 'EQUIPMENT', entity_id: eq.equipment_id, kind, blob, mime, title_vi: kind === 'CONTRACT' ? 'Hợp đồng thử P-07' : 'Chứng nhận thử P-07', title_zh: kind === 'CONTRACT' ? 'P-07测试合同' : 'P-07测试证书' });
  out('P-07', `doc.upload ${esc(kind)}: ${code(up)} ${ms(up.upload_ms)}`);
  if (up.ok) await upsertLocal('DOCUMENT', up.data.record);
  return up.ok ? up.data.record : null;
}
async function p07download(docId) {
  const id = docId || (p07doc && p07doc.document_id);
  if (!id) { toast('Tải lên trước · 请先上传', 'err'); return; }
  const d = await downloadDoc(id);
  out('P-07', `doc.download: ${d.ok ? '✓ ' + fmtNumber(Math.round(d.bytes / 1024)) + ' KB · ' + ms(d.ms) : code(d.res)}`);
  if (d.ok) {
    p07file = d.file;
    $('#p07-open').disabled = false;
    const prev = results['P-07'] ? results['P-07'].metrics : {};
    const m = { ...prev, download_ok: true, download_ms: d.ms, bytes: d.bytes };
    await rec('P-07', p07status(m), p07summary(m), m);
  }
}
function p07status(m) { return m.forbidden === false ? 'fail' : (m.download_ok && m.forbidden && m.share_ok ? 'pass' : 'info'); }
function p07summary(m) { return `tải về ${m.download_ok ? '✓' : '—'}, mở/lưu ${m.share_ok ? '✓' : '—'}, không quyền → FORBIDDEN ${m.forbidden ? '✓' : m.forbidden === false ? '✗' : '—'}`; }
function p07open() {
  if (!p07file) return;
  // Gọi share ngay trong trình xử lý chạm, không await trước đó (2.6)
  shareFileNow(p07file).then(async () => {
    const prev = results['P-07'] ? results['P-07'].metrics : {};
    const m = { ...prev, share_ok: true, can_share_files: !!(navigator.canShare && navigator.canShare({ files: [p07file] })) };
    await rec('P-07', p07status(m), p07summary(m), m);
  }).catch((e) => out('P-07', `Mở/Lưu: ${esc(e.name)}`));
}
async function p07forbidden() {
  const contract = await p07upload(null, 'CONTRACT');
  if (!contract) return;
  const pin = await askPin('pin6', 'PIN của tài khoản mẫu MAU-C1 (xem nhật ký Apps Script khi chạy pocSeedSampleData) · 示例账户MAU-C1的PIN');
  if (!pin) return;
  let lr = await rawPost(envelope('auth.login', { employee_code: 'MAU-C1', pin, device_label: 'PoC P-07' }, { token: null, epoch: null }), { timeoutMs: 30000 });
  if (lr.code === 'MUST_CHANGE_PIN' && lr.data && lr.data.token) {
    // PIN tạm (cấp bằng pocResetPin): đổi sang một PIN ngẫu nhiên để có phiên đầy đủ; tài khoản MẪU, cần thì cấp lại
    for (let i = 0; i < 3; i++) {
      const np = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      const cr = await rawPost(envelope('pin.change', { current_pin: pin, new_pin: np }, { token: lr.data.token, epoch: lr.dataset_epoch }), { timeoutMs: 30000 });
      if (cr.ok) { lr = cr; out('P-07', 'MAU-C1 dùng PIN tạm → đã đổi sang PIN ngẫu nhiên (cần thì chạy lại pocResetPin)'); break; }
      if (!(cr.errors && cr.errors[0] && cr.errors[0].code === 'PIN_WEAK')) { lr = cr; break; }
    }
  }
  if (!lr.ok) { out('P-07', `Đăng nhập MAU-C1: ${code(lr)}`); return; }
  const tok = lr.data.token;
  const r = await rawPost(envelope('doc.download', { document_id: contract.document_id }, { token: tok, epoch: lr.dataset_epoch }), { timeoutMs: 55000 });
  out('P-07', `MAU-C1 (cấp 1) tải hợp đồng (COST_VIEW): ${code(r)}`);
  await rawPost(envelope('auth.logout', {}, { token: tok, epoch: lr.dataset_epoch }), { timeoutMs: 30000 });
  const prev = results['P-07'] ? results['P-07'].metrics : {};
  const m = { ...prev, forbidden: r.code === 'FORBIDDEN' };
  await rec('P-07', p07status(m), p07summary(m), m);
}

async function p08() {
  const d = deviceInfo();
  const hasManifest = !!document.querySelector('link[rel=manifest]');
  const hasIcon = !!document.querySelector('link[rel=apple-touch-icon]');
  out('P-08', `standalone: ${d.standalone ? '✓' : '✗'} · manifest ${hasManifest ? '✓' : '✗'} · apple-touch-icon ${hasIcon ? '✓' : '✗'}`);
  await rec('P-08', d.standalone ? 'pass' : 'manual', d.standalone ? 'Đang chạy từ Màn hình chính' : 'Chưa mở từ Màn hình chính', { standalone: d.standalone });
}

async function p09render() {
  const list = $('#p09-list');
  if (!list) return;
  // Thiết bị mẫu theo mã tăng dần (TB-0001…): hai máy cùng thấy một danh sách, dễ chọn cùng thiết bị
  const eqs = (await getRecords('EQUIPMENT')).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code))).slice(0, 5);
  const last = await getMeta('last_sync');
  $('#p09-last').innerHTML = `${bi('last_sync')}: ${esc(fmtDateTime(last) || '—')}`;
  list.innerHTML = eqs.map((e) => `<li><strong>${esc(e.equipment_code)}</strong> ${esc(e.name_vi)}${e.i18n_meta && e.i18n_meta.name && e.i18n_meta.name.state === 'MACHINE' ? ` <span class="mt">${bi('machine_translated')}</span>` : ''}<br><span class="zh">${esc(e.name_zh || '')}</span> · v${e.record_version}
    <button type="button" class="btn tiny" data-edit="${esc(e.equipment_id)}">✎</button></li>`).join('');
  $$('[data-edit]', list).forEach((b) => b.addEventListener('click', () => p09edit(b.dataset.edit)));
}
async function p09edit(id) {
  const e = (await getRecords('EQUIPMENT')).find((x) => x.equipment_id === id);
  if (!e) return;
  const v = await dialog({
    title: `${esc(e.equipment_code)} · v${e.record_version}`,
    body: `<label>Model</label><input id="d-model" value="${esc(e.model || '')}"><label>${bi(['Tên tiếng Việt', '越南语名称'])}</label><input id="d-name" value="${esc(e.name_vi || '')}">`,
    actions: [{ label: bi('cancel'), value: null }, { label: bi('save'), kind: 'primary', read: (w) => ({ model: $('#d-model', w).value, name_vi: $('#d-name', w).value }) }]
  });
  if (!v) return;
  const r = await api('equipment.edit', { equipment_id: id, model: v.model, name_vi: v.name_vi }, { write: true, expected_version: e.record_version });
  out('P-09', `Sửa ${esc(e.equipment_code)} (v${e.record_version}): ${code(r)}${r.code === 'VERSION_CONFLICT' ? ' — bản máy chủ v' + r.data.server_version : ''}`);
  if (r.ok) await upsertLocal('EQUIPMENT', { ...r.data.record, qr_key: e.qr_key });
  if (r.code === 'VERSION_CONFLICT') {
    const prev = results['P-09'] ? results['P-09'].metrics : {};
    await rec('P-09', prev.seen_remote ? 'pass' : 'info', `xung đột ✓, thấy thay đổi máy khác ${prev.seen_remote ? '✓' : '—'}`, { ...prev, conflict: true });
  }
  p09render();
}
async function p09sync() {
  const before = JSON.stringify(await getRecords('EQUIPMENT'));
  const r = await pullChanges();
  const after = JSON.stringify(await getRecords('EQUIPMENT'));
  out('P-09', `${bi('sync_now')}: ${r.ok ? '✓ ' + (r.applied || 0) + ' thay đổi' : code(r)}`);
  await p09render();
  if (r.ok && r.applied && before !== after) {
    const prev = results['P-09'] ? results['P-09'].metrics : {};
    const m = { ...prev, seen_remote: true };
    await rec('P-09', m.conflict ? 'pass' : 'info', `thấy thay đổi máy khác ✓, xung đột ${m.conflict ? '✓' : '—'}`, m);
  }
}

async function p10run() {
  const tag = ($('#p10-tag').value || 'X').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'X';
  ls.set('p10_tag', tag);
  const counts = { ok: 0, busy: 0, retries: 0, other: 0 };
  const times = [], serverMs = [];
  let i = 0;
  const worker = async () => {
    while (i < 20) {
      const n = i++;
      // SERVER_BUSY hoặc lỗi đường truyền → chờ rồi gửi lại cùng operation_id (không tạo trùng)
      const r = await writeSure('equipment.create', { equipment_id: uuid(), name_vi: `P10-${tag}-${n}` }, { expected_version: 0 }, null, [2000, 4000, 8000, 12000, 16000, 20000, 0]);
      counts.retries += r.retries;
      if (typeof r.server_ms === 'number') serverMs.push(r.server_ms);
      if (r.ok) { counts.ok++; times.push(r.client_ms); } else if (r.code === 'SERVER_BUSY') counts.busy++; else counts.other++;
    }
  };
  // Mỗi máy gửi lần lượt như hàng chờ thật; 3 máy chạy cùng lúc thì máy chủ nhận 3 lệnh xen kẽ (P-10)
  await worker();
  out('P-10', `Máy ${esc(tag)}: thành công ${counts.ok}/20 · gửi lại ${counts.retries} · vẫn SERVER_BUSY ${counts.busy} · lỗi khác ${counts.other} · trung vị ${ms(median(times) || 0)} (máy chủ ${ms(median(serverMs) || 0)})`);
  await p10check(counts);
}
async function p10check(counts) {
  const s = await api('poc.stats', { name_prefix: 'P10-' });
  if (!s.ok) { out('P-10', code(s)); return; }
  out('P-10', `Tổng P10: ${s.data.tagged} · theo máy ${esc(JSON.stringify(s.data.by_device))} · trùng mã ${s.data.duplicate_codes.length} · trùng ID ${s.data.duplicate_ids.length}`);
  const prev = results['P-10'] ? results['P-10'].metrics : {};
  const m = { ...prev, ...(counts ? { last_device: counts } : {}), tagged: s.data.tagged, by_device: s.data.by_device, dup_codes: s.data.duplicate_codes.length };
  const full = Object.entries(s.data.by_device).filter(([, n]) => n >= 20).map(([k]) => k);
  const ok = full.length >= 3 && !s.data.duplicate_codes.length && !s.data.duplicate_ids.length;
  await rec('P-10', ok ? 'pass' : (s.data.duplicate_codes.length || s.data.duplicate_ids.length ? 'fail' : 'info'), `${s.data.tagged} dòng P10, máy đủ 20 lệnh: ${esc(full.join(', ') || '—')} (cần 3), trùng mã ${s.data.duplicate_codes.length}`, m);
}

async function p12() {
  const m1 = await api('poc.mail');
  out('P-12', `poc.mail: ${code(m1)} ${m1.ok ? 'quota ' + m1.data.quota_before + ' → ' + m1.data.quota_after : esc(resMsg(m1))}`);
  const t = await api('poc.triggers');
  const names = t.ok ? t.data.triggers.map((x) => x.handler).sort() : [];
  out('P-12', `Trigger: ${esc(names.join(', ') || '—')}`);
  const okTrig = ['backupData', 'runBackgroundJobs', 'sendExpiryDigest'].every((n) => names.includes(n));
  const m = { mail: m1.ok, quota: m1.ok ? m1.data.quota_after : null, triggers: names, trig_ok: okTrig };
  await rec('P-12', p12status(m), p12summary(m), m);
}
function p12status(m) { return !m.mail || !m.trig_ok || m.mail_received === false ? 'fail' : (m.mail_received ? 'pass' : 'manual'); }
function p12summary(m) {
  return `thư thử ${m.mail ? '✓' : '✗'}, nhận được ${m.mail_received ? '✓' : m.mail_received === false ? '✗' : '— (xem hộp thư M&E rồi bấm Đã nhận thư)'}, quota ${m.quota === null || m.quota === undefined ? '—' : m.quota}, 3 trigger ${m.trig_ok ? '✓' : '✗ — chạy installTriggers'}`;
}
async function p12received(yes) {
  const prev = results['P-12'] ? results['P-12'].metrics : null;
  if (!prev) { toast('Gửi thư thử trước · 请先发送测试邮件', 'err'); return; }
  if (prev.trig_ok === undefined) prev.trig_ok = ['backupData', 'runBackgroundJobs', 'sendExpiryDigest'].every((n) => (prev.triggers || []).includes(n));
  const m = { ...prev, mail_received: yes };
  await rec('P-12', p12status(m), p12summary(m), m);
}

async function p13() {
  clearOut('P-13');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const res = {};
  for (const it of [200000, 150000]) {
    await pbkdf2('049271', salt, 1000);
    const t0 = performance.now();
    await pbkdf2('049271', salt, it);
    res[it] = Math.round(performance.now() - t0);
    out('P-13', `PBKDF2-SHA256 ${fmtNumber(it)} vòng: ${ms(res[it])}`);
  }
  const chosen = res[200000] <= 1000 ? 200000 : 150000;
  await rec('P-13', res[150000] <= 1000 ? 'pass' : 'fail', `200 000 vòng ${ms(res[200000])}, 150 000 vòng ${ms(res[150000])} → đề xuất ${fmtNumber(chosen)}`, { ms_200k: res[200000], ms_150k: res[150000], suggest: chosen });
}

async function p14() {
  clearOut('P-14');
  out('P-14', 'Đang chạy (~20 giây) · 运行中…');
  const r = await api('poc.translate', {}, { timeoutMs: 55000 });
  if (!r.ok) { out('P-14', `${code(r)} ${esc(resMsg(r))}`); await rec('P-14', 'fail', 'poc.translate lỗi ' + r.code, {}); return; }
  const d = r.data;
  out('P-14', `Mã zh-CN ${d.codes['zh-CN'] && d.codes['zh-CN'].ok ? '✓' : '✗'} · zh ${d.codes.zh && d.codes.zh.ok ? '✓' : '✗'}`);
  out('P-14', `contentType text không ra thực thể HTML: ${d.entities && !d.entities.has_html_entity ? '✓' : '✗'} (${esc(d.entities ? d.entities.text : '')})`);
  Object.entries(d.tokens || {}).forEach(([k, v]) => out('P-14', `Token ${esc(k)}: ${v.kept ? '✓ giữ nguyên' : '✗'} — ${esc(v.text || v.error || '')}`));
  out('P-14', `Gộp 10 dòng: ${d.batch && d.batch.ok ? '✓' : '✗'} (${d.batch ? d.batch.out_lines : '?'} dòng, ${ms(d.batch ? d.batch.ms : 0)})`);
  out('P-14', `Dịch lẻ ${d.singles.length} chuỗi: trung vị ${ms(d.single_median_ms || 0)}, chậm nhất ${ms(d.single_max_ms || 0)} · tổng ${d.calls} lượt gọi`);
  d.singles.slice(0, 6).forEach((s) => out('P-14', `&nbsp;&nbsp;${esc(s.src)} → ${esc(s.text)}`));
  const keptTokens = Object.entries(d.tokens || {}).filter(([, v]) => v.kept).map(([k]) => k);
  await rec('P-14', d.codes['zh-CN'] && d.codes['zh-CN'].ok && d.entities && !d.entities.has_html_entity ? 'info' : 'fail',
    `zh-CN ${d.codes['zh-CN'] && d.codes['zh-CN'].ok ? '✓' : '✗'}, token giữ được: ${keptTokens.join(' ') || 'không'}, gộp dòng ${d.batch && d.batch.ok ? '✓' : '✗'}, trung vị ${ms(d.single_median_ms || 0)}`,
    { codes: Object.fromEntries(Object.entries(d.codes).map(([k, v]) => [k, v.ok])), html_entity: d.entities && d.entities.has_html_entity, tokens_kept: keptTokens, batch_ok: d.batch && d.batch.ok, median_ms: d.single_median_ms, max_ms: d.single_max_ms, calls: d.calls, errors: d.errors });
}

async function p15inventory() {
  clearOut('P-15');
  const csp = window.__meCsp || [];
  out('P-15', `Vi phạm CSP từ lúc mở app: ${csp.length}${csp.length ? ' — ' + esc(csp.slice(0, 3).map((v) => v.directive + ' ' + v.blocked).join('; ')) : ''}`);
  const lsKeys = [];
  try { for (let i = 0; i < localStorage.length; i++) lsKeys.push(localStorage.key(i)); } catch (e) { /* bỏ qua */ }
  const meLs = lsKeys.filter((k) => k.startsWith('me.'));
  out('P-15', `localStorage: ${lsKeys.length} khóa (M&E: ${meLs.length}; khác: ${esc(lsKeys.filter((k) => !k.startsWith('me.')).slice(0, 8).join(', ') || '—')})`);
  const caches_ = window.caches ? await caches.keys() : [];
  out('P-15', `Cache Storage: ${esc(caches_.join(', ') || '—')}`);
  let dbs = [];
  if (indexedDB.databases) { try { dbs = (await indexedDB.databases()).map((d) => d.name); } catch (e) { dbs = []; } }
  out('P-15', `IndexedDB: ${esc(dbs.join(', ') || '(trình duyệt không liệt kê)')}`);
  const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
  out('P-15', `Service Worker: ${esc(regs.map((r) => new URL(r.scope).pathname).join(', ') || '—')}`);
  const foreign = caches_.filter((c) => !c.startsWith('me-')).length + dbs.filter((d) => d && !d.startsWith('me_')).length;
  const prev = results['P-15'] ? results['P-15'].metrics : {};
  const m = { ...prev, csp_violations: csp.length, other_app_storage: foreign, sw_scopes: regs.map((r) => new URL(r.scope).pathname) };
  await rec('P-15', csp.length ? 'fail' : (m.marker_ok ? 'pass' : 'info'), `CSP ${csp.length ? '✗ ' + csp.length + ' vi phạm' : '✓'}, dữ liệu app khác trên cùng origin: ${foreign}, mốc sau khi đăng xuất Cơ Điện: ${m.marker_ok ? '✓' : m.marker_ok === false ? '✗' : '—'}`, m);
}
async function p15mark() {
  const v = uuid();
  ls.set('p15_marker', v);
  await idb.put('me_poc', 'meta', 'p15_marker', v);
  if (window.caches) { const c = await caches.open('me-p15'); await c.put('p15-marker', new Response(v)); }
  out('P-15', `Đã ghi mốc ${esc(v.slice(0, 8))}. Giờ mở app Cơ Điện trên cùng máy/trình duyệt, đăng xuất ở đó, rồi quay lại bấm "Kiểm tra mốc".`);
}
async function p15check() {
  const v = ls.get('p15_marker');
  const i = await idb.get('me_poc', 'meta', 'p15_marker').catch(() => null);
  let c = null;
  if (window.caches) { const cc = await caches.open('me-p15'); const r = await cc.match('p15-marker'); c = r ? await r.text() : null; }
  const ok = !!v && v === i && v === c;
  out('P-15', `Mốc: localStorage ${v ? '✓' : '✗'} · IndexedDB ${i === v && v ? '✓' : '✗'} · Cache ${c === v && v ? '✓' : '✗'}`);
  const prev = results['P-15'] ? results['P-15'].metrics : {};
  const m = { ...prev, marker_ok: ok };
  await rec('P-15', ok && !prev.csp_violations ? 'pass' : (ok ? 'info' : 'fail'), `mốc sau khi đăng xuất Cơ Điện ${ok ? '✓' : '✗'}`, m);
}

async function p16upload(mb = 1.5) {
  const eq = (await getRecords('EQUIPMENT'))[0];
  if (!eq) return;
  const blob = makeTestPdf([`M&E PoC P-16 upload ${mb} MB`], Math.round(mb * 1048576));
  const up = await uploadDoc({ entity_type: 'EQUIPMENT', entity_id: eq.equipment_id, kind: 'OTHER', blob, mime: 'application/pdf', title_vi: `Tệp thử ${mb} MB`, title_zh: `${mb} MB测试文件` });
  out('P-16', `Tải lên ${mb} MB: ${code(up)}${up.transport ? ' · ' + esc(up.transport) : ''}${up.http ? ' · HTTP ' + esc(up.http) : ''} ${up.upload_ms ? ms(up.upload_ms) : ''}${typeof up.server_ms === 'number' ? ' (máy chủ ' + ms(up.server_ms) + ')' : ''}${up.retries ? ' · gửi lại ' + up.retries : ''}`);
  if (!up.ok) await p16diag(up);
  const prev = results['P-16'] ? results['P-16'].metrics : {};
  const upload_ms = { ...(prev.upload_ms || {}), [mb + 'MB']: up.ok ? up.upload_ms : up.code + '/' + (up.transport || '') + (up.http ? '/' + up.http : '') };
  await p16rec({ ...prev, upload_ms, ...(mb === 1.5 ? { upload_15_ms: up.ok ? up.upload_ms : null } : {}) });
}
/** Lỗi đường truyền ở P-16: URL cuối sau chuyển hướng và các lần doGet không action gần đây (máy chủ ghi) */
async function p16diag(r) {
  if (r.final_url) out('P-16', `&nbsp;&nbsp;URL cuối: <code>${esc(r.final_url)}</code>`);
  const d = await rawPost(envelope('system.getPublicState', { probe_run: 'p16diag', probe_read: true }, { token: null, epoch: null }), { timeoutMs: 30000 });
  const gets = d.ok && d.data && d.data.probe ? d.data.probe.gets_without_action || [] : [];
  if (gets.length) out('P-16', `&nbsp;&nbsp;doGet không action gần nhất: ${esc(gets.slice(-3).join(', '))}`);
}
async function p16make() {
  const r = await api('poc.makeTestFiles', {}, { timeoutMs: 55000 });
  out('P-16', `Tạo tệp thử: ${code(r)} ${r.ok ? r.data.files.map((f) => f.size_mb + ' MB').join(', ') : esc(resMsg(r))}`);
  if (r.ok) ls.set('p16_files', JSON.stringify(r.data.files));
}
async function p16download() {
  const files = JSON.parse(ls.get('p16_files') || '[]');
  if (!files.length) { toast('Bấm "Tạo tệp 2/5/10 MB" trước', 'err'); return; }
  const prev = results['P-16'] ? results['P-16'].metrics : {};
  const m = { ...prev, download_ms: {} };
  for (const f of files) {
    const d = await downloadDoc(f.document_id);
    m.download_ms[f.size_mb + 'MB'] = d.ok ? d.ms : d.res.code + '/' + (d.res.transport || '');
    if (d.retried) m.download_retried = { ...(m.download_retried || {}), [f.size_mb + 'MB']: d.retried };
    out('P-16', `Tải xuống ${f.size_mb} MB: ${d.ok ? '✓ ' + ms(d.ms) + (typeof d.server_ms === 'number' ? ' (máy chủ ' + ms(d.server_ms) + ')' : '') : code(d.res) + (d.res.transport ? ' · ' + esc(d.res.transport) : '')}${d.retried ? ' (gửi lại sau lỗi ' + esc(d.retried) + ')' : ''}`);
    if (!d.ok) await p16diag(d.res);
    if (d.ok) URL.revokeObjectURL(d.url);
  }
  const dc = await api('poc.driveChecks');
  if (dc.ok) { m.copy_kept_sharing = dc.data.copy_kept_sharing; out('P-16', `makeCopy giữ chia sẻ: ${dc.data.copy_kept_sharing === undefined ? esc(dc.data.note) : dc.data.copy_kept_sharing ? 'CÓ (cần xử lý)' : 'KHÔNG ✓'}`); }
  await p16rec(m);
}
async function p16rec(m) {
  const dl = m.download_ms || {};
  const allOk = ['2MB', '5MB', '10MB'].every((k) => typeof dl[k] === 'number' && dl[k] < 55000);
  const status = allOk && m.upload_15_ms && m.copy_kept_sharing === false ? 'pass' : (Object.values(dl).some((v) => typeof v !== 'number') ? 'fail' : 'info');
  const ups = Object.entries(m.upload_ms || {}).filter(([k]) => k !== '1.5MB').map(([k, v]) => k + ' ' + (typeof v === 'number' ? ms(v) : v)).join(', ');
  await rec('P-16', status, `lên 1,5 MB ${m.upload_15_ms ? ms(m.upload_15_ms) : '—'}${ups ? ' (thêm: ' + ups + ')' : ''}; xuống ${Object.entries(dl).map(([k, v]) => k + ' ' + (typeof v === 'number' ? ms(v) : v)).join(', ') || '—'}; makeCopy giữ chia sẻ: ${m.copy_kept_sharing === undefined ? '—' : m.copy_kept_sharing ? 'có' : 'không'}`, m);
}

async function p17burst(n) {
  const t0 = performance.now();
  const rs = await Promise.all(Array.from({ length: n }, () => api('poc.echo', { n }, { bypassLimit: true })));
  const okN = rs.filter((r) => r.ok).length;
  const nonJson = rs.filter((r) => r.transport === 'NON_JSON').length;
  const other = {};
  rs.filter((r) => !r.ok).forEach((r) => { const k = r.code + (r.transport ? '/' + r.transport : ''); other[k] = (other[k] || 0) + 1; });
  const total = Math.round(performance.now() - t0);
  out('P-17', `${n} request đồng thời: thành công ${okN}/${n}, không phải JSON ${nonJson}, khác ${esc(JSON.stringify(other))}, tổng ${ms(total)}`);
  const prev = results['P-17'] ? results['P-17'].metrics : {};
  const m = { ...prev, ['burst_' + n]: { ok: okN, non_json: nonJson, other, total_ms: total } };
  await p17rec(m);
}
async function p17long() {
  out('P-17', 'Request 70 giây (poc.sleep) — app cắt ở 55 giây… · 正在测试长请求…');
  const opId = uuid();
  const t0 = performance.now();
  const r = await api('poc.sleep', { seconds: 70 }, { write: true, operation_id: opId, timeoutMs: (session.settings.client_long_timeout_seconds || 55) * 1000 });
  const cut = Math.round((performance.now() - t0) / 1000);
  out('P-17', `Kết quả sau ${cut} giây: ${code(r)} (${esc(r.transport || '')})`);
  let st = null;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    st = await api('sync.getOperationStatus', { operation_id: opId });
    if (st.ok && st.data.state === 'COMMITTED') break;
  }
  out('P-17', `getOperationStatus: ${esc(st && st.ok ? st.data.state : st ? st.code : '—')}`);
  const prev = results['P-17'] ? results['P-17'].metrics : {};
  const m = { ...prev, long_cut_s: cut, long_code: r.code, long_then: st && st.ok ? st.data.state : null };
  await p17rec(m);
}
async function p17rec(m) {
  let cs = [];
  try { cs = JSON.parse(ls.get('cold_starts') || '[]'); } catch (e) { cs = []; }
  m.cold_starts = cs;
  m.cold_start_ms = cs.length ? cs[cs.length - 1].ms : null;
  const longOk = m.long_code === 'UNKNOWN_RESULT' && m.long_cut_s <= 57 && m.long_then === 'COMMITTED';
  const bursts = ['burst_10', 'burst_20', 'burst_40'].filter((k) => m[k]);
  await rec('P-17', longOk && bursts.length === 3 ? 'info' : (m.long_code && !longOk ? 'fail' : 'info'),
    `mở app: ${cs.length ? cs.map((c) => (c.timed_out ? '>' : '') + ms(c.ms)).join(', ') : '—'}; ${bursts.map((k) => k.slice(6) + ': ' + m[k].ok + '/' + k.slice(6)).join(', ') || 'chưa thử đồng thời'}; request dài ${m.long_code ? (longOk ? '✓ cắt ở ' + m.long_cut_s + ' s → COMMITTED' : '✗ ' + m.long_code) : '—'}`, m);
}

async function p18ok(good) {
  const dv = $('#p18-date').value;
  await rec('P-18', good ? 'pass' : 'fail', `ký tự ${good ? 'hiện đúng' : 'lỗi'}; ô ngày: ${dv ? fmtDate(dv) : '—'}; Excel (SheetJS) kiểm ở Đợt 1`, { chars_ok: good, date_input: dv || null });
}

async function p19() {
  clearOut('P-19');
  const iosIn = ($('#p19-ios') && $('#p19-ios').value.trim()) || '';
  if (/^\d{2}(\.\d+){0,2}$/.test(iosIn)) ls.set('ios_manual', iosIn); else if (!iosIn) ls.del('ios_manual');
  const d = deviceInfo();
  let fmts = null;
  if ('BarcodeDetector' in window) { try { fmts = await window.BarcodeDetector.getSupportedFormats(); } catch (e) { fmts = []; } }
  let canShareFiles = false;
  try { canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })); } catch (e) { canShareFiles = false; }
  const cap = {
    randomUUID: !!crypto.randomUUID, getRandomValues: !!crypto.getRandomValues, subtle: !!(crypto.subtle && crypto.subtle.deriveBits),
    indexedDB: !!window.indexedDB, serviceWorker: 'serviceWorker' in navigator, sw_controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    canShareFiles, barcodeDetectorQr: !!(fmts && fmts.includes('qr_code')), storagePersist: !!(navigator.storage && navigator.storage.persist),
    createImageBitmap: 'createImageBitmap' in window, standalone: d.standalone, ios: d.ios_version, safari_version: d.safari_version
  };
  Object.entries(cap).forEach(([k, v]) => out('P-19', `${v === true ? '✓' : v === false ? '✗' : '·'} ${esc(k)}${typeof v === 'string' ? ': ' + esc(v) : ''}`));
  const must = cap.getRandomValues && cap.subtle && cap.indexedDB && cap.serviceWorker;
  await rec('P-19', must ? 'pass' : 'fail', `${d.platform}${d.ios_version ? ' iOS ' + d.ios_version : ''} · UUID ${cap.randomUUID ? 'randomUUID' : 'getRandomValues'} · chia sẻ tệp ${canShareFiles ? '✓' : '✗'} · BarcodeDetector ${cap.barcodeDetectorQr ? '✓' : '✗ (dùng jsQR)'}`, cap);
}

/* ================= Báo cáo ================= */
async function reportText() {
  const d = deviceInfo();
  const boot = await getMeta('bootstrap');
  const sh = await shellHash();
  const lines = [
    'M&E PoC — báo cáo · PoC报告',
    `Lúc: ${fmtDateTime(new Date())} · App ${BUILD_VERSION}${sh ? ' (' + sh.slice(0, 6) + ')' : ''} · Máy chủ ${serverVersion || (boot ? boot.server_version + ' (bản lưu)' : '?')} · Môi trường ${boot ? boot.env : '?'}`,
    `Máy: ${d.platform}${d.ios_version ? ' iOS ' + d.ios_version : ''} · ${d.standalone ? 'Màn hình chính' : d.browser} · ${d.screen}`,
    `UA: ${d.user_agent}`, ''
  ];
  for (const c of POC_ORDER) {
    const r = results[c];
    lines.push(`${c} ${r ? biText(ST[r.status]) : biText(ST.none)}${r ? ' — ' + r.summary + ' [' + fmtDateTime(r.at) + (r.ver ? ' · ' + r.ver : '') + ']' : ''}`);
  }
  lines.push('', 'Số đo chi tiết (JSON):', JSON.stringify(Object.fromEntries(POC_ORDER.filter((c) => results[c]).map((c) => [c, results[c].metrics]))));
  return lines.join('\n');
}

const POC_ORDER = ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07', 'P-08', 'P-09', 'P-10', 'P-12', 'P-13', 'P-14', 'P-15', 'P-16', 'P-17', 'P-18', 'P-19'];

/* ================= Vẽ trang ================= */
/** Mã băm vỏ app đang chạy (tên cache me-shell-<bản>-<mã băm>) để biết máy đã nhận bản mới chưa */
async function shellHash() {
  try { const k = (await caches.keys()).find((x) => x.startsWith('me-shell-')); return k ? k.split('-').pop() : ''; } catch (e) { return ''; }
}

export async function renderPoc(main, { isOwner, offline }) {
  await loadResults();
  const sh = await shellHash();
  const boot = await getMeta('bootstrap');
  const last = await getMeta('last_sync');
  const d = deviceInfo();
  const ownerOnly = (s) => (isOwner ? s : `<p class="muted">Chỉ tài khoản cấp 4 · 仅限4级账户</p>`);
  main.innerHTML = `
  <section class="card poc-head">
    <div class="kv"><span>${bi(['Máy', '设备'])}</span><strong>${esc(d.platform)}${d.ios_version ? ' iOS ' + esc(d.ios_version) : ''} · ${esc(d.standalone ? 'Màn hình chính' : d.browser)}</strong></div>
    <div class="kv"><span>App</span><strong>${esc(BUILD_VERSION)}${sh ? ' · ' + esc(sh.slice(0, 6)) : ''}</strong></div>
    <div class="kv"><span>${bi(['Máy chủ', '服务器'])}</span><strong><span id="srv-ver">${esc(serverVersion || (boot ? boot.server_version : '—'))}</span> · ${esc(boot ? boot.env : '—')} · epoch ${esc((session.epoch || '').slice(0, 8))}</strong></div>
    <div class="kv"><span>${bi('last_sync')}</span><strong>${esc(fmtDateTime(last) || '—')}</strong></div>
    <div class="row">${btn('rep-copy', bi(['Sao chép báo cáo', '复制报告']), 'primary')}${btn('rep-share', bi(['Chia sẻ', '分享']))}${btn('rep-sync', bi('sync_now'))}${btn('rep-backup', bi('export_backup'))}</div>
    <p class="muted">${bi(['Chạy từng mục trên iPhone (Safari và Màn hình chính) và máy tính, rồi sao chép báo cáo gửi lại.', '在iPhone（Safari和主屏幕）及电脑上逐项运行，然后复制报告发回。'])}</p>
  </section>
  ${card('P-01', bi(['Kết nối', '连接']), 'fetch POST tới /exec, không đặt header; 20 lần liên tiếp không lỗi. · 20次连续请求无错误',
    `<select id="p01-net" class="tiny-input" style="width:auto">${[['', 'Mạng?'], ['wifi', 'Wi-Fi'], ['4g', '4G/5G']].map(([v, t]) => `<option value="${v}"${ls.get('p01_net') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
     <select id="p01-relay" class="tiny-input" style="width:auto">${[['', 'Private Relay?'], ['bat', 'Relay bật'], ['tat', 'Relay tắt']].map(([v, t]) => `<option value="${v}"${ls.get('p01_relay') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>` +
    btn('p01', bi(['Chạy 20 lần', '运行20次']), 'primary'))}
  ${card('P-02', bi(['Đăng nhập PIN', 'PIN登录']), 'Test vector HMAC/base64url khớp; 012345, 000000 → PIN_WEAK; sai 5 lần thì khóa.', btn('p02v', 'Test vector', 'primary') + btn('p02w', bi(['Thử PIN yếu', '测试弱PIN'])) + btn('p02l', bi(['Thử khóa (MAU-KHOA)', '测试锁定'])))}
  ${card('P-03', bi(['Ghi có xác nhận', '确认写入']), 'COMMITTED + record_version; gửi lại → DUPLICATE_OPERATION; khác nội dung → OPERATION_ID_REUSED; bản cũ → VERSION_CONFLICT; mất phản hồi → UNKNOWN_RESULT rồi hỏi getOperationStatus.', btn('p03', bi(['Chạy P-03', '运行P-03']), 'primary'))}
  ${card('P-04', bi(['Mở lại khi offline', '离线重新打开']), 'Bật chế độ máy bay, tắt hẳn app, mở lại → màn Mở khóa ngoại tuyến; tạo 1 nháp kiểm định; có mạng lại thì gửi đúng 1 lần.',
    btn('p04d', bi(['Tạo nháp kiểm định', '创建检验草稿']), 'primary') + btn('p04s', bi('sync_now')) + `<ul class="list" id="p04-queue"></ul>`)}
  ${card('P-05', bi(['Quét bằng camera', '摄像头扫码']), 'Quét được tem in thử cả 2 cỡ trên Safari và Màn hình chính; máy tính không camera dùng ô nhập mã; mã lạ không báo thành công.',
    btn('p05s', bi('scan'), 'primary scan') + `<a class="btn small" href="#/labels">${bi(['In tem thử (máy tính)', '打印测试标签（电脑）'])}</a>`)}
  ${card('P-06', bi(['Ảnh xem bằng link', '链接查看照片']), 'Thu ảnh 1 600 px + ảnh nhỏ 400 px (thử ảnh 48 MP, HEIC); hiện bằng &lt;img&gt;; Đặt riêng tư → link cũ không mở khi chưa đăng nhập Google.',
    `<label class="btn small primary file">${bi(['Chụp ảnh', '拍照'])}<input type="file" accept="image/*" capture="environment" id="p06cap" hidden></label>
     <label class="btn small file">${bi(['Chọn ảnh', '选择照片'])}<input type="file" accept="image/*" id="p06pick" hidden></label>${btn('p06p', bi('set_private'))}${btn('p06c', bi(['Kiểm tra link cũ', '检查旧链接']))}
     <p class="muted small">${bi('photo_warning')}</p><div class="imgs" id="p06-imgs"></div>`)}
  ${card('P-07', bi(['Tài liệu riêng tư', '私有文件']), 'Tải qua máy chủ (doc.download); iPhone: Tải về rồi Mở / Lưu vào Tệp; không có quyền → FORBIDDEN.',
    `<label class="btn small file">${bi(['Chọn PDF/ảnh', '选择PDF/图片'])}<input type="file" accept="application/pdf,image/jpeg,image/png" id="p07pick" hidden></label>
     ${btn('p07t', bi(['Dùng PDF thử', '使用测试PDF']))}${btn('p07d', bi('download'), 'primary')}<button type="button" class="btn small" id="p07-open" disabled>${bi('open_save')}</button>
     ${btn('p07f', bi(['Thử không có quyền (MAU-C1)', '测试无权限']))}${btn('p07big', bi(['Tải PDF 5 MB', '下载5MB PDF']))}`)}
  ${card('P-08', bi(['Cài lên Màn hình chính', '添加到主屏幕']), 'Safari → Chia sẻ → Thêm vào MH chính; mở standalone, không có màn chào mang logo; bộ nhớ và phiên tách riêng với Safari.', btn('p08', bi(['Kiểm tra', '检查']), 'primary'))}
  ${card('P-09', bi(['Dùng chung web ↔ iPhone', '电脑与iPhone共用']), 'Cả hai máy Đồng bộ ngay → iPhone bấm ✎ TB-0001 (chưa Lưu) → máy tính ✎ TB-0001, Lưu → iPhone bấm Lưu: VERSION_CONFLICT → iPhone Đồng bộ ngay: thấy bản máy tính.',
    btn('p09s', bi('sync_now'), 'primary') + `<p class="muted" id="p09-last"></p><ul class="list" id="p09-list"></ul>`)}
  ${card('P-10', bi(['Ghi đồng thời', '并发写入']), '3 máy × 20 lệnh tạo gửi cùng lúc → đủ 60 dòng, không trùng mã. Mỗi máy đặt một nhãn riêng (vd. D, E, F) rồi bấm gần như cùng lúc.',
    `<input id="p10-tag" class="tiny-input" maxlength="6" value="${esc(ls.get('p10_tag') || '')}" placeholder="A">` + btn('p10', bi(['Gửi 20 lệnh tạo', '发送20个创建']), 'primary') + btn('p10c', bi(['Kiểm tra tổng', '检查总数'])))}
  ${card('P-12', bi(['Gmail và trigger', '邮件与触发器']), 'Gửi 1 thư thử tới địa chỉ M&E; đọc quota; đủ 3 trigger (chạy installTriggers trong trình soạn).', ownerOnly(btn('p12', bi(['Gửi thư thử + xem trigger', '发送测试邮件并查看触发器']), 'primary') + btn('p12y', bi(['Đã nhận thư', '已收到邮件'])) + btn('p12n', bi(['Không thấy thư', '未收到邮件']))))}
  ${card('P-13', 'PBKDF2', '200 000 vòng ≤ 1 giây trên iPhone cũ nhất; chậm hơn thì giảm, không dưới 150 000.', btn('p13', bi(['Đo', '测量']), 'primary'))}
  ${card('P-14', bi(['Dịch máy', '机器翻译']), 'Mã zh-CN/zh, contentType text, token giữ chỗ, gộp nhiều dòng, thời gian mỗi lần gọi.', ownerOnly(btn('p14', bi(['Chạy thử dịch', '运行翻译测试']), 'primary')))}
  ${card('P-15', bi(['CSP, origin chung với Cơ Điện', 'CSP与机电应用同源']), 'Không vi phạm CSP; đăng xuất app Cơ Điện trên cùng máy không xóa dữ liệu M&E.',
    btn('p15i', bi(['Kiểm kê bộ nhớ', '检查存储']), 'primary') + btn('p15m', bi(['Ghi mốc', '写入标记'])) + btn('p15c', bi(['Kiểm tra mốc', '检查标记'])))}
  ${card('P-16', bi(['Drive, cỡ tệp', 'Drive与文件大小']), 'Tải lên 1,5 MB; tải xuống 2, 5, 10 MB trên iPhone trong 55 giây; makeCopy không mang theo chia sẻ.',
    btn('p16u', bi(['Tải lên 1,5 MB', '上传1.5MB'])) + btn('p16u5', bi(['Tải lên 5 MB', '上传5MB'])) + btn('p16u9', bi(['Tải lên 9,5 MB', '上传9.5MB'])) + ownerOnly(btn('p16m', bi(['Tạo tệp 2/5/10 MB', '创建2/5/10MB文件']))) + btn('p16d', bi(['Tải xuống 2/5/10 MB', '下载2/5/10MB']), 'primary'))}
  ${card('P-17', bi(['Tải đồng thời, thời gian chờ', '并发与超时']), '10–40 request đồng thời; thời gian mở app lần đầu; request 70 giây bị cắt ở 55 giây → UNKNOWN_RESULT.',
    btn('p17a', '10') + btn('p17b', '20') + btn('p17c', '40') + btn('p17l', bi(['Request 70 giây', '70秒请求']), 'primary'))}
  ${card('P-18', bi(['Ký tự, định dạng', '字符与格式']), 'U+202F, U+00A0, ×, ², ³ hiện đúng; ô ngày dùng được.',
    `<div class="chars"><div>12 350 · 1 250 000 VND · -12 350.5</div><div>130 kWh · 4 × 6 mm² · 25 m³/h · 92.5%</div><div>07/10/2026 08:05 · 01/10/2026 – 05/10/2026 · T2 · 周一</div><div>Máy nén khí · 螺杆空压机 · Đạt có điều kiện · 有条件合格</div></div>
     <label>${bi(['Ô ngày', '日期'])} <input type="date" id="p18-date"></label>${btn('p18y', bi(['Hiện đúng', '显示正确']), 'primary')}${btn('p18n', bi(['Bị lỗi', '显示错误']))}`)}
  ${card('P-19', bi(['Khả năng trình duyệt', '浏览器能力']), 'randomUUID/getRandomValues, chia sẻ tệp, BarcodeDetector, lưu bền; chốt iOS tối thiểu. iPhone: gõ phiên bản iOS thật (Cài đặt → Cài đặt chung → Giới thiệu).',
    `<input id="p19-ios" class="tiny-input" style="width:96px" inputmode="decimal" placeholder="iOS" value="${esc(ls.get('ios_manual') || '')}">` + btn('p19', bi(['Kiểm tra', '检查']), 'primary'))}
  `;
  POC_ORDER.forEach(paintStatus);
  if (!offline) refreshServerVersion(main).catch(() => {});
  const on = (id, fn) => { const el = $('#' + id, main); if (el) el.addEventListener('click', async () => { el.disabled = true; try { await fn(); } catch (e) { toast(esc(e.message), 'err'); } finally { el.disabled = false; } }); };
  on('p01', p01); on('p02v', p02vectors); on('p02w', p02weak); on('p02l', p02lock); on('p03', p03);
  on('p04d', p04draft); on('p04s', p04flush); on('p05s', p05scan); on('p06p', p06private); on('p06c', p06check);
  on('p07t', async () => { p07doc = await p07upload(null); }); on('p07d', () => p07download()); on('p07f', p07forbidden);
  on('p07big', async () => { const f = JSON.parse(ls.get('p16_files') || '[]').find((x) => x.size_mb === 5); if (!f) { toast('Tạo tệp ở P-16 trước', 'err'); return; } await p07download(f.document_id); });
  $('#p07-open', main).addEventListener('click', p07open);
  on('p08', p08); on('p09s', p09sync); on('p10', p10run); on('p10c', () => p10check()); on('p12', p12); on('p12y', () => p12received(true)); on('p12n', () => p12received(false)); on('p13', p13); on('p14', p14);
  on('p15i', p15inventory); on('p15m', p15mark); on('p15c', p15check); on('p16u', () => p16upload(1.5)); on('p16u5', () => p16upload(5)); on('p16u9', () => p16upload(9.5)); on('p16m', p16make); on('p16d', p16download);
  on('p17a', () => p17burst(10)); on('p17b', () => p17burst(20)); on('p17c', () => p17burst(40)); on('p17l', p17long);
  on('p18y', () => p18ok(true)); on('p18n', () => p18ok(false)); on('p19', p19);
  $('#p06cap', main).addEventListener('change', (e) => p06file(e.target.files[0]));
  $('#p06pick', main).addEventListener('change', (e) => p06file(e.target.files[0]));
  $('#p07pick', main).addEventListener('change', async (e) => { if (e.target.files[0]) p07doc = await p07upload(e.target.files[0]); });
  on('rep-copy', async () => { const t = await reportText(); try { await navigator.clipboard.writeText(t); toast(bi(['Đã sao chép', '已复制']), 'ok'); } catch (e) { await dialog({ title: bi(['Báo cáo', '报告']), body: `<textarea class="report" readonly>${esc(t)}</textarea>`, actions: [{ label: 'OK', kind: 'primary' }] }); } });
  on('rep-share', async () => { const t = await reportText(); if (navigator.share) { try { await navigator.share({ title: 'M&E PoC', text: t }); } catch (e) { /* hủy */ } } else { await dialog({ title: bi(['Báo cáo', '报告']), body: `<textarea class="report" readonly>${esc(t)}</textarea>`, actions: [{ label: 'OK', kind: 'primary' }] }); } });
  on('rep-sync', async () => { const r = await pullChanges(); toast(r.ok ? bi('committed') : esc(resMsg(r)), r.ok ? 'ok' : 'err'); p09render(); });
  on('rep-backup', async () => { const b = await exportBackup(); shareFileNow(new File([b], `me-du-phong-${Date.now()}.json`, { type: 'application/json' })); });
  p04render();
  p09render();
  if (offline) { const det = document.querySelector('[data-poc="P-04"]'); if (det) det.open = true; }
}

/** Chọn thiết bị in tem thử — dùng chung cho trang in (máy tính) và P-05 (iPhone): 3 đầu cỡ nhỏ, 2 sau cỡ lớn */
export function labelSets(eqs) {
  const list = eqs.filter((e) => e.qr_key).sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  return { small: list.slice(0, 3), large: list.slice(3, 5) };
}

/** Trang tem thử (máy tính): 3 thiết bị cỡ nhỏ, 2 thiết bị cỡ lớn */
export async function renderLabels(root) {
  const { labelSheetHtml } = await import('./labels.js');
  const sets = labelSets(await getRecords('EQUIPMENT'));
  const locs = await getRecords('LOCATION');
  const locCode = (id) => (locs.find((l) => l.location_id === id) || {}).location_code || '';
  const toItem = (e) => ({ entity_type: 'EQUIPMENT', code: e.equipment_code, qr_key: e.qr_key, name_vi: e.name_vi, name_zh: e.name_zh, location_code: locCode(e.location_id) });
  const small = sets.small.map(toItem), large = sets.large.map(toItem);
  const items = small.concat(large);
  const smallSheet = small.concat(Array.from({ length: Math.max(0, 24 - small.length) }, (_, k) => small[k % Math.max(1, small.length)])).filter(Boolean);
  root.innerHTML = `<div class="labels-screen">
    <div class="no-print bar"><a class="btn small" href="#/">${bi('back')}</a><h1>${bi(['In tem thử', '打印测试标签'])}</h1>
      <span class="tag warn">${bi('sample_data')}</span>
      <label class="small">${bi(['Lệch lề (mm)', '边距偏移 (mm)'])} <input type="number" id="lb-off" value="${esc(ls.get('label_offset') || '0')}" step="0.5" class="tiny-input"></label>
      <button type="button" class="btn small primary" id="lb-print">${bi(['In', '打印'])}</button></div>
    <p class="no-print muted">${bi(['Trang 1: tem nhỏ 70 × 37 mm (3 thiết bị đầu). Trang 2: tem lớn 105 × 74 mm (2 thiết bị sau). Dùng In hoặc Lưu PDF của trình duyệt, tỉ lệ 100%.', '第1页：小标签70×37毫米；第2页：大标签105×74毫米。按100%比例打印或另存为PDF。'])}</p>
    <div id="lb-sheets">${smallSheet.length ? labelSheetHtml(smallSheet, 'SMALL') : ''}${large.length ? labelSheetHtml(large, 'LARGE') : ''}</div>
    ${items.length ? '' : `<p class="banner warn">${bi(['Chưa có thiết bị có QR. Đăng nhập, chạy pocSeedSampleData rồi Đồng bộ ngay.', '尚无带二维码的设备'])}</p>`}
  </div>`;
  const apply = () => { const v = Number($('#lb-off').value) || 0; ls.set('label_offset', String(v)); document.documentElement.style.setProperty('--label-offset', v + 'mm'); };
  $('#lb-off').addEventListener('change', apply);
  apply();
  $('#lb-print').addEventListener('click', () => window.print());
}

export { APP_BASE_URL, b64url };
