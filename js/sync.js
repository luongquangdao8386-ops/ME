// Đồng bộ: bootstrap, changes, hàng chờ offline (phụ lục 1.5 mục 3.15, 1.4 §14)
import { api, session, idb, ls, uuid, isoNowVN, todayVN, applyEnvTitle } from './core.js';
import { pruneOfflineFiles } from './offline-files.js';

const STOP_CODES = new Set(['AUTH_REQUIRED', 'SESSION_EXPIRED', 'DATASET_RESET', 'SYSTEM_MAINTENANCE', 'MUST_CHANGE_PIN', 'CLIENT_UPDATE_REQUIRED', 'QUOTA_EXCEEDED']);
/** Không biết thao tác đã ghi hay chưa */
const UNSURE_CODES = new Set(['UNKNOWN_RESULT', 'INTERNAL_ERROR', 'RECOVERY_REQUIRED']);

export async function getMeta(k) { return idb.get('me_data', 'meta', k).catch(() => null); }
export async function setMeta(k, v) { return idb.put('me_data', 'meta', k, v); }
export async function getRecords(type) { return (await idb.get('me_data', 'records', type).catch(() => null)) || []; }

/** Tải dữ liệu ban đầu theo quyền, chia trang. onPage(n) trước mỗi trang (màn chờ hiện tiến độ) */
export async function bootstrap({ onPage } = {}) {
  let pageToken = null, cursor = null, first = null;
  const acc = {};
  for (let guard = 0; guard < 50; guard++) {
    if (onPage) { try { onPage(guard + 1); } catch (e) { /* bỏ qua */ } }
    const r = await api('sync.bootstrap', pageToken ? { page_token: pageToken, sync_cursor: cursor } : {}, { retry: true });
    if (!r.ok) return r;
    if (!first) first = r.data;
    cursor = r.data.sync_cursor;
    for (const [t, list] of Object.entries(r.data.records || {})) (acc[t] = acc[t] || []).push(...list);
    pageToken = r.data.next_page_token;
    if (!pageToken) break;
  }
  await idb.clear('me_data', 'records');
  for (const [t, list] of Object.entries(acc)) await idb.put('me_data', 'records', t, list);
  session.settings = first.settings || {};
  session.settings.__today_offset_days = todayOffset(first.server_today);
  await setMeta('bootstrap', { user: first.user, subroles: first.subroles, settings: first.settings, permissions: first.permissions, env: first.env, server_version: first.server_version, released_dot: first.released_dot || 0 });
  ls.set('env', first.env || '');
  applyEnvTitle(first.env);
  await setMeta('cursor', cursor);
  await setMeta('epoch', session.epoch);
  await setMeta('last_sync', isoNowVN());
  // Tệp ngoại tuyến của tài liệu không còn quyền xem / đã gỡ bị xóa (2.6)
  await pruneOfflineFiles(acc.DOCUMENT || []).catch(() => {});
  return { ok: true, data: first };
}

/** Khóa chính theo loại hồ sơ (khớp SYNC_ENTITIES_ của máy chủ) */
export const KEY = {
  EQUIPMENT: 'equipment_id', EQUIPMENT_SPEC: 'spec_id', MATERIAL: 'material_id', EQUIPMENT_PART: 'equipment_part_id',
  EQUIPMENT_PART_EVENT: 'event_id', DOCUMENT: 'document_id', INSPECTION: 'inspection_id',
  INSPECTION_REQUIREMENT: 'requirement_id', INSPECTION_TYPE: 'inspection_type_id', LOCATION: 'location_id', VENDOR: 'vendor_id',
  LOOKUP: 'value_id', CONTRACT: 'contract_id', CONTRACT_EQUIPMENT: 'contract_equipment_id', CONTRACT_SERVICE: 'service_id',
  ALERT: 'alert_id', USER_PICK: 'user_id',
  // Đợt 2
  MAINTENANCE_PLAN: 'plan_id', CHECKLIST_ITEM: 'template_item_id', WORK_ORDER: 'work_order_id', WO_RESULT: 'result_id',
  OPERATING_READING: 'operating_reading_id', REPAIR: 'repair_id', REPAIR_TASK: 'repair_task_id', MATERIAL_REQUEST: 'request_id',
  MATERIAL_REQUEST_LINE: 'request_line_id', MATERIAL_USAGE: 'usage_line_id'
};

function keyOf(type, rec) {
  return rec[KEY[type]];
}

/** Độ lệch ngày "hôm nay" của máy chủ (TEST_TODAY ở THỬ, hoặc đồng hồ máy sai) so với máy này */
function todayOffset(serverToday) {
  const re = /^(\d{4})-(\d{2})-(\d{2})/;
  const a = re.exec(todayVN()), b = re.exec(String(serverToday || ''));
  if (!a || !b) return 0;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
}

/** Áp một bản ghi máy chủ trả về (sau COMMITTED) vào cache cục bộ */
export async function upsertLocal(type, rec) {
  const list = await getRecords(type);
  const id = keyOf(type, rec);
  const i = list.findIndex((x) => keyOf(type, x) === id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  await idb.put('me_data', 'records', type, list);
}

/**
 * Lấy thay đổi theo cursor; perm_version đổi thì bootstrap lại.
 * first: kết quả sync.changes đã gọi sẵn từ đúng cursor đang lưu (lần hỏi máy chủ khi mở app) → không gọi lại trang đầu.
 */
export async function pullChanges({ first = null, onPage } = {}) {
  let cursor = await getMeta('cursor');
  if (cursor === null || cursor === undefined) return bootstrap({ onPage });
  const boot = await getMeta('bootstrap');
  let applied = 0, docsChanged = false;
  for (let guard = 0; guard < 20; guard++) {
    const r = guard === 0 && first && first.ok ? first : await api('sync.changes', { cursor, limit: 500 }, { retry: true });
    if (!r.ok) return r;
    if (boot && boot.permissions && r.data.perm_version !== boot.permissions.perm_version) return bootstrap({ onPage });
    // Máy chủ lên phiên bản mới: tải lại quyền và cài đặt (action mới có trong danh sách quyền)
    if (boot && r.data.server_version && boot.server_version && r.data.server_version !== boot.server_version) return bootstrap({ onPage });
    const byType = {};
    for (const ch of r.data.changes) (byType[ch.entity_type] = byType[ch.entity_type] || []).push(ch);
    if (byType.DOCUMENT) docsChanged = true;
    for (const [type, chs] of Object.entries(byType)) {
      const list = await getRecords(type);
      const map = new Map(list.map((x) => [keyOf(type, x), x]));
      for (const ch of chs) {
        if (ch.op === 'TOMBSTONE') map.delete(ch.entity_id); else map.set(ch.entity_id, ch.data);
        applied++;
      }
      await idb.put('me_data', 'records', type, [...map.values()]);
    }
    cursor = r.data.next_cursor;
    await setMeta('cursor', cursor);
    if (r.data.server_today && session.settings) {
      const off = todayOffset(r.data.server_today);
      if (off !== (session.settings.__today_offset_days || 0)) {
        session.settings.__today_offset_days = off;
        if (boot) { boot.settings = { ...(boot.settings || {}), __today_offset_days: off }; await setMeta('bootstrap', boot); }
      }
    }
    if (!r.data.has_more) break;
  }
  await setMeta('last_sync', isoNowVN());
  if (docsChanged) await pruneOfflineFiles(await getRecords('DOCUMENT')).catch(() => {});
  return { ok: true, applied };
}

/* ---------------- Hàng chờ offline ---------------- */

/**
 * Thêm một thao tác vào hàng chờ (chỉ action có cột Mạng = offline, 4.7).
 * parent_id: hồ sơ cha (vd phiếu của ảnh) — thao tác của một phiếu đi tuần tự; mục trước bị từ chối/xung đột thì mục sau chờ.
 * chain: thao tác sửa nối tiếp trên cùng hồ sơ — expected_version tính tiếp từ mục trước trong hàng chờ (mỗi lần ghi +1)
 *   và được chỉnh lại theo record_version máy chủ trả về khi gửi.
 * merge(oldPayload, newPayload): gộp vào mục cùng action, cùng hồ sơ còn Chờ gửi chưa gửi lần nào (một lần lưu = một mục).
 */
export async function enqueue(action, payload, { entity_type = '', entity_id = '', expected_version = 0, parent_id = '', chain = false, merge = null } = {}) {
  const uid = session.user ? session.user.user_id : null;
  const mine = (await queueItems()).filter((o) => o.user_id === uid && o.dataset_epoch === session.epoch);
  if (merge && entity_id) {
    const same = mine.filter((o) => o.action === action && o.entity_id === entity_id);
    const last = same[same.length - 1];
    const later = last && mine.some((o) => o.seq > last.seq && (o.entity_id === entity_id || o.parent_id === entity_id));
    if (last && last.state === 'QUEUED' && !last.attempts && !later) {
      last.payload = merge(last.payload, payload);
      last.local_updated_at = isoNowVN();
      await idb.put('me_data', 'queue', last.operation_id, last);
      return last;
    }
  }
  if (chain && entity_id) {
    const prev = mine.filter((o) => o.entity_id === entity_id && o.chain && o.state !== 'REJECTED' && o.state !== 'CONFLICT');
    if (prev.length) expected_version = Number(prev[prev.length - 1].expected_version || 0) + 1;
  }
  const op = {
    operation_id: uuid(), action, entity_type, entity_id, expected_version, payload, local_created_at: isoNowVN(),
    user_id: uid, dataset_epoch: session.epoch, state: 'QUEUED', attempts: 0, last_code: null,
    seq: Date.now() + (mine.length ? 0.001 * mine.length : 0), parent_id, chain: !!chain
  };
  await idb.put('me_data', 'queue', op.operation_id, op);
  return op;
}

/** Thao tác của tôi đang chờ gửi cho một hồ sơ (theo entity_id hoặc parent_id) */
export async function queuedFor(id) {
  const uid = session.user ? session.user.user_id : null;
  return (await queueItems()).filter((o) => o.user_id === uid && o.dataset_epoch === session.epoch && (o.entity_id === id || o.parent_id === id));
}

export async function queueItems() {
  return (await idb.all('me_data', 'queue')).map((x) => x.value).sort((a, b) => a.seq - b.seq);
}

export async function doneItems() {
  return (await idb.all('me_data', 'done')).map((x) => x.value).sort((a, b) => a.seq - b.seq);
}

const DONE_KEEP_DAYS = 7;
const DONE_KEEP_MAX = 50;

/** Mục đã lưu máy chủ của người đang đăng nhập (mới nhất trước), để CM-04 hiện nhãn "Đã lưu máy chủ" */
export async function recentDone() {
  const uid = session.user && session.user.user_id;
  return (await doneItems().catch(() => [])).filter((o) => o.user_id === uid && o.dataset_epoch === session.epoch)
    .sort((a, b) => String(b.committed_at).localeCompare(String(a.committed_at)));
}

async function markDone(op, res) {
  const p = op.payload || {};
  op.state = 'COMMITTED';
  op.last_code = res.code;
  op.result = res.data || null;
  op.committed_at = isoNowVN();
  // Máy chủ đã giữ nội dung: bỏ ảnh/tệp (base64) khỏi bản lưu trên máy, chỉ giữ cỡ và số ảnh để hiển thị
  op.size_kb = Math.ceil(JSON.stringify(p).length / 1024);
  op.photo_n = (p.mime_type && /^image\//.test(p.mime_type) ? 1 : 0) + (Array.isArray(p.photos) ? p.photos.length : 0);
  op.payload = Object.fromEntries(Object.entries(p).filter(([k]) => !/_b64$/.test(k)));
  await idb.put('me_data', 'done', op.operation_id, op);
  await idb.del('me_data', 'queue', op.operation_id);
  await pruneDone();
}

/** Giữ tối đa DONE_KEEP_MAX mục trong DONE_KEEP_DAYS ngày gần nhất */
async function pruneDone() {
  const all = await doneItems().catch(() => []);
  const cutoff = new Date(Date.now() - DONE_KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const keep = new Set(all.filter((o) => String(o.committed_at || '').slice(0, 10) >= cutoff)
    .sort((a, b) => String(b.committed_at).localeCompare(String(a.committed_at))).slice(0, DONE_KEEP_MAX).map((o) => o.operation_id));
  for (const o of all) {
    if (!keep.has(o.operation_id)) { await idb.del('me_data', 'done', o.operation_id).catch(() => {}); continue; }
    // Mục gửi từ bản cũ còn giữ ảnh: bỏ ảnh
    const p = o.payload || {};
    if (Object.keys(p).some((k) => /_b64$/.test(k))) {
      await idb.put('me_data', 'done', o.operation_id, { ...o, payload: Object.fromEntries(Object.entries(p).filter(([k]) => !/_b64$/.test(k))) }).catch(() => {});
    }
  }
}

/**
 * Gửi hàng chờ tuần tự, mỗi request một thao tác. Dừng khi gặp lỗi phiên/epoch/bảo trì.
 * Trả {sent, committed, stopped_code}
 */
export async function flushQueue(onProgress) {
  const all = (await queueItems()).filter((o) => o.user_id === (session.user && session.user.user_id) && o.dataset_epoch === session.epoch);
  const items = all.filter((o) => o.state !== 'REJECTED');
  let sent = 0, committed = 0;
  // Hồ sơ có mục bị từ chối/xung đột: các mục sau của cùng hồ sơ chờ người dùng xử lý (5.1.1 mục 2)
  const stuck = new Set();
  for (const o of all) if (o.state === 'REJECTED' || o.state === 'CONFLICT') { if (o.entity_id) stuck.add(o.entity_id); if (o.parent_id) stuck.add(o.parent_id); }
  const lastVer = new Map();
  for (const op of items) {
    if (op.state === 'CONFLICT') continue;
    const keys = [op.entity_id, op.parent_id].filter(Boolean);
    if (keys.some((k) => stuck.has(k))) {
      if (!op.blocked) { op.blocked = true; await idb.put('me_data', 'queue', op.operation_id, op); }
      continue;
    }
    if (op.blocked) op.blocked = false;
    // Sửa nối tiếp: chưa gửi lần nào thì lấy phiên bản máy chủ vừa trả về cho hồ sơ này
    if (op.chain && !op.attempts && lastVer.has(op.entity_id)) op.expected_version = lastVer.get(op.entity_id);
    const wasUnknown = op.state === 'UNKNOWN' || op.last_code === 'UNKNOWN_RESULT';
    op.state = 'SENDING'; op.attempts++;
    await idb.put('me_data', 'queue', op.operation_id, op);
    if (onProgress) onProgress(op);
    if (wasUnknown) {
      // Chưa rõ lần trước đã ghi chưa: hỏi máy chủ trước, gửi lại cùng mã thao tác nếu chưa COMMITTED
      const st = await api('sync.getOperationStatus', { operation_id: op.operation_id }, { retry: true });
      if (st.ok && st.data.state === 'COMMITTED') {
        if (op.chain && typeof st.data.record_version === 'number') lastVer.set(op.entity_id, st.data.record_version);
        await markDone(op, { code: 'DUPLICATE_OPERATION', data: st.data.result }); committed++; continue;
      }
      if (!st.ok && (st.code === 'NETWORK_ERROR' || st.code === 'SERVER_BUSY')) {
        op.state = 'UNKNOWN';
        await idb.put('me_data', 'queue', op.operation_id, op);
        return { sent, committed, stopped_code: st.code };
      }
    }
    const res = await api('sync.push', { op: { action: op.action, operation_id: op.operation_id, entity_type: op.entity_type, entity_id: op.entity_id, expected_version: op.expected_version, payload: op.payload, local_created_at: op.local_created_at } }, { timeoutMs: 55000, write: true, operation_id: op.operation_id, expected_version: op.expected_version });
    sent++;
    if (res.ok && res.state === 'COMMITTED') {
      if (op.chain && typeof res.record_version === 'number') lastVer.set(op.entity_id, res.record_version);
      await markDone(op, res); committed++; continue;
    }
    op.last_code = res.code;
    if (UNSURE_CODES.has(res.code) || res.code === 'NETWORK_ERROR' || res.code === 'SERVER_BUSY') {
      // Lỗi máy chủ giữa chừng cũng có thể đã ghi: giữ UNKNOWN, lần sau hỏi trạng thái trước (3.3)
      op.state = res.code === 'NETWORK_ERROR' || res.code === 'SERVER_BUSY' ? (wasUnknown ? 'UNKNOWN' : 'QUEUED') : 'UNKNOWN';
      await idb.put('me_data', 'queue', op.operation_id, op);
      return { sent, committed, stopped_code: res.code };
    }
    if (STOP_CODES.has(res.code) || res.code === 'REAUTH_REQUIRED') {
      op.state = 'QUEUED';
      await idb.put('me_data', 'queue', op.operation_id, op);
      return { sent, committed, stopped_code: res.code, response: res };
    }
    op.state = res.code === 'VERSION_CONFLICT' ? 'CONFLICT' : 'REJECTED';
    if (op.entity_id) stuck.add(op.entity_id);
    if (op.parent_id) stuck.add(op.parent_id);
    op.errors = res.errors || [];
    if (res.code === 'VERSION_CONFLICT') op.conflict = res.data || null; // bản máy chủ để màn Xử lý xung đột so sánh
    op.rejected_at = isoNowVN();
    await idb.put('me_data', 'queue', op.operation_id, op);
  }
  return { sent, committed, stopped_code: null };
}

/** Xuất dự phòng: nháp + hàng chờ ra file JSON */
/** Xóa một nháp khỏi hàng chờ (người dùng xác nhận hai lần ở CM-04) */
export async function deleteQueued(operationId) {
  await idb.del('me_data', 'queue', operationId);
}

/** Đặt lại một mục Lỗi gửi để gửi lại ở lần đồng bộ tới */
export async function requeue(operationId) {
  const op = await idb.get('me_data', 'queue', operationId);
  if (!op) return;
  op.state = op.last_code === 'UNKNOWN_RESULT' ? 'UNKNOWN' : 'QUEUED';
  await idb.put('me_data', 'queue', operationId, op);
}

export async function exportBackup() {
  const data = { app: 'M&E', exported_at: isoNowVN(), queue: await queueItems(), done: await doneItems() };
  return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
}
