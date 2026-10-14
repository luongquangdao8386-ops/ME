// Tài liệu xem ngoại tuyến (phụ lục 1.5 mục 2.6): chỉ lưu khi người dùng bấm "Tải để xem ngoại tuyến".
// IndexedDB me_files, gắn user_id, dataset_epoch, document_id, file_version, entity_type, entity_id; tổng ≤ offline_files_max_mb.
// Đăng xuất / đổi người dùng / DATASET_RESET xóa hết (auth.clearUserData); sau mỗi lần đồng bộ xóa tệp không còn quyền xem.
import { idb, session } from './core.js';
import { isSharedDevice } from './auth.js';

const DB = 'me_files';
const STORE = 'files';
const uid = () => (session.user && session.user.user_id) || '';
const mine = (v) => !!v && v.user_id === uid() && v.dataset_epoch === session.epoch;

/** Máy dùng chung không lưu tệp ngoại tuyến (2.5) */
export function offlineFilesAllowed() { return !isSharedDevice(); }

export function offlineLimitBytes() { return Number(session.settings && session.settings.offline_files_max_mb || 100) * 1024 * 1024; }

/** Các tệp đã lưu của người đang đăng nhập (đúng thế hệ dữ liệu) */
export async function offlineFiles() {
  const all = await idb.all(DB, STORE).catch(() => []);
  return all.map((x) => x.value).filter(mine);
}

export async function offlineFile(documentId) {
  const v = await idb.get(DB, STORE, documentId).catch(() => null);
  return mine(v) ? v : null;
}

/** Lưu tệp vừa tải; vượt tổng dung lượng → {ok:false, code:'OFFLINE_FULL'} */
export async function saveOfflineFile(doc, file, fileVersion) {
  if (!offlineFilesAllowed()) return { ok: false, code: 'SHARED_DEVICE' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const used = (await offlineFiles()).filter((x) => x.document_id !== doc.document_id).reduce((s, x) => s + (x.size || 0), 0);
  if (used + bytes.length > offlineLimitBytes()) return { ok: false, code: 'OFFLINE_FULL' };
  await idb.put(DB, STORE, doc.document_id, {
    document_id: doc.document_id, entity_type: doc.entity_type, entity_id: doc.entity_id, user_id: uid(), dataset_epoch: session.epoch,
    file_version: Number(fileVersion || doc.file_version || 1), file_name: file.name, mime_type: file.type, size: bytes.length, bytes,
    saved_at: new Date().toISOString(), stale: false
  });
  return { ok: true };
}

export async function removeOfflineFile(documentId) { await idb.del(DB, STORE, documentId).catch(() => {}); }

/** Bản ghi đã lưu → File để mở/chia sẻ */
export function fileOf(v) { return new File([v.bytes], v.file_name, { type: v.mime_type || 'application/octet-stream' }); }

/**
 * Sau bootstrap/đồng bộ (2.6, 1.4 §14.3): xóa tệp của người khác/thế hệ dữ liệu khác và tệp của tài liệu đã gỡ hoặc
 * không còn quyền xem (không còn trong danh sách tài liệu máy chủ trả về); file_version đổi thì đánh dấu bản cũ.
 * Trả số tệp đã xóa.
 */
export async function pruneOfflineFiles(docs) {
  const all = await idb.all(DB, STORE).catch(() => []);
  if (!all.length) return 0;
  const byId = new Map((docs || []).filter((d) => d && d.active !== false).map((d) => [d.document_id, d]));
  let removed = 0;
  for (const { key, value: v } of all) {
    const d = byId.get(key);
    if (!mine(v) || !d) { await idb.del(DB, STORE, key).catch(() => {}); removed++; continue; }
    const stale = Number(d.file_version || 1) !== Number(v.file_version || 1);
    if (stale !== !!v.stale) await idb.put(DB, STORE, key, { ...v, stale }).catch(() => {});
  }
  return removed;
}
