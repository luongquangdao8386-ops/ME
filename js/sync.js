// Đồng bộ: bootstrap, changes, hàng chờ offline (phụ lục 1.5 mục 3.15, 1.4 §14)
import { api, session, idb, uuid, isoNowVN } from './core.js';

const STOP_CODES = new Set(['AUTH_REQUIRED', 'SESSION_EXPIRED', 'DATASET_RESET', 'SYSTEM_MAINTENANCE', 'MUST_CHANGE_PIN', 'CLIENT_UPDATE_REQUIRED', 'QUOTA_EXCEEDED']);
/** Không biết thao tác đã ghi hay chưa */
const UNSURE_CODES = new Set(['UNKNOWN_RESULT', 'INTERNAL_ERROR', 'RECOVERY_REQUIRED']);

export async function getMeta(k) { return idb.get('me_data', 'meta', k).catch(() => null); }
export async function setMeta(k, v) { return idb.put('me_data', 'meta', k, v); }
export async function getRecords(type) { return (await idb.get('me_data', 'records', type).catch(() => null)) || []; }

/** Tải dữ liệu ban đầu theo quyền, chia trang */
export async function bootstrap() {
  let pageToken = null, cursor = null, first = null;
  const acc = {};
  for (let guard = 0; guard < 50; guard++) {
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
  await setMeta('bootstrap', { user: first.user, subroles: first.subroles, settings: first.settings, permissions: first.permissions, env: first.env, server_version: first.server_version });
  await setMeta('cursor', cursor);
  await setMeta('epoch', session.epoch);
  await setMeta('last_sync', isoNowVN());
  return { ok: true, data: first };
}

function keyOf(type, rec) {
  const k = { EQUIPMENT: 'equipment_id', DOCUMENT: 'document_id', INSPECTION: 'inspection_id', INSPECTION_REQUIREMENT: 'requirement_id', INSPECTION_TYPE: 'inspection_type_id', LOCATION: 'location_id', VENDOR: 'vendor_id', LOOKUP: 'value_id' }[type];
  return rec[k];
}

/** Áp một bản ghi máy chủ trả về (sau COMMITTED) vào cache cục bộ */
export async function upsertLocal(type, rec) {
  const list = await getRecords(type);
  const id = keyOf(type, rec);
  const i = list.findIndex((x) => keyOf(type, x) === id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  await idb.put('me_data', 'records', type, list);
}

/** Lấy thay đổi theo cursor; perm_version đổi thì bootstrap lại */
export async function pullChanges() {
  let cursor = await getMeta('cursor');
  if (cursor === null || cursor === undefined) return bootstrap();
  const boot = await getMeta('bootstrap');
  let applied = 0;
  for (let guard = 0; guard < 20; guard++) {
    const r = await api('sync.changes', { cursor, limit: 500 }, { retry: true });
    if (!r.ok) return r;
    if (boot && boot.permissions && r.data.perm_version !== boot.permissions.perm_version) return bootstrap();
    const byType = {};
    for (const ch of r.data.changes) (byType[ch.entity_type] = byType[ch.entity_type] || []).push(ch);
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
    if (!r.data.has_more) break;
  }
  await setMeta('last_sync', isoNowVN());
  return { ok: true, applied };
}

/* ---------------- Hàng chờ offline ---------------- */

/** Thêm một thao tác vào hàng chờ (chỉ action offline: inspection.submit, contract.service.record, doc.upload) */
export async function enqueue(action, payload, { entity_type = '', entity_id = '', expected_version = 0 } = {}) {
  const op = {
    operation_id: uuid(), action, entity_type, entity_id, expected_version, payload, local_created_at: isoNowVN(),
    user_id: session.user ? session.user.user_id : null, dataset_epoch: session.epoch, state: 'QUEUED', attempts: 0, last_code: null,
    seq: Date.now()
  };
  await idb.put('me_data', 'queue', op.operation_id, op);
  return op;
}

export async function queueItems() {
  return (await idb.all('me_data', 'queue')).map((x) => x.value).sort((a, b) => a.seq - b.seq);
}

export async function doneItems() {
  return (await idb.all('me_data', 'done')).map((x) => x.value).sort((a, b) => a.seq - b.seq);
}

async function markDone(op, res) {
  op.state = 'COMMITTED';
  op.last_code = res.code;
  op.result = res.data || null;
  op.committed_at = isoNowVN();
  await idb.put('me_data', 'done', op.operation_id, op);
  await idb.del('me_data', 'queue', op.operation_id);
}

/**
 * Gửi hàng chờ tuần tự, mỗi request một thao tác. Dừng khi gặp lỗi phiên/epoch/bảo trì.
 * Trả {sent, committed, stopped_code}
 */
export async function flushQueue(onProgress) {
  const items = (await queueItems()).filter((o) => o.state !== 'REJECTED' && o.user_id === (session.user && session.user.user_id) && o.dataset_epoch === session.epoch);
  let sent = 0, committed = 0;
  for (const op of items) {
    const wasUnknown = op.state === 'UNKNOWN' || op.last_code === 'UNKNOWN_RESULT';
    op.state = 'SENDING'; op.attempts++;
    await idb.put('me_data', 'queue', op.operation_id, op);
    if (onProgress) onProgress(op);
    if (wasUnknown) {
      // Chưa rõ lần trước đã ghi chưa: hỏi máy chủ trước, gửi lại cùng mã thao tác nếu chưa COMMITTED
      const st = await api('sync.getOperationStatus', { operation_id: op.operation_id }, { retry: true });
      if (st.ok && st.data.state === 'COMMITTED') { await markDone(op, { code: 'DUPLICATE_OPERATION', data: st.data.result }); committed++; continue; }
      if (!st.ok && (st.code === 'NETWORK_ERROR' || st.code === 'SERVER_BUSY')) {
        op.state = 'UNKNOWN';
        await idb.put('me_data', 'queue', op.operation_id, op);
        return { sent, committed, stopped_code: st.code };
      }
    }
    const res = await api('sync.push', { op: { action: op.action, operation_id: op.operation_id, entity_type: op.entity_type, entity_id: op.entity_id, expected_version: op.expected_version, payload: op.payload, local_created_at: op.local_created_at } }, { timeoutMs: 55000, write: true, operation_id: op.operation_id, expected_version: op.expected_version });
    sent++;
    if (res.ok && res.state === 'COMMITTED') { await markDone(op, res); committed++; continue; }
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
    op.errors = res.errors || [];
    await idb.put('me_data', 'queue', op.operation_id, op);
  }
  return { sent, committed, stopped_code: null };
}

/** Xuất dự phòng: nháp + hàng chờ ra file JSON */
export async function exportBackup() {
  const data = { app: 'M&E', exported_at: isoNowVN(), queue: await queueItems(), done: await doneItems() };
  return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
}
