/* 43_bg: Ảnh nền màn đăng nhập (cả màn chờ lúc mở app) và trang chủ — Quản trị thay trong app (người dùng yêu cầu 12/11/2026,
 * chép cách làm của app ISO bản 1.0.0-d3.3, server/src/33_bg.js). Cách làm như logo báo cáo (35_report_pdf.js): tệp riêng tư trong
 * thư mục dữ liệu app trên Drive của tài khoản máy chủ, không vào repo công khai.
 * Settings giữ ID tệp (không gửi xuống app) và mã phiên bản `bg_<ô>_rev` (gửi xuống app; sync.changes cũng trả `bg_revs` để máy đang mở
 * nhận ảnh mới mà không phải tải lại toàn bộ): rev đổi → app tải ảnh một lần rồi giữ trong Cache Storage của máy, nên màn đăng nhập dùng
 * được cả khi chưa đăng nhập (máy đã đăng nhập ít nhất một lần). rev '' = ảnh mặc định trong app (assets/bg/factory.jpg, home.jpg).
 * Không cần migrateSchema: writeSetting_ tự thêm dòng Settings còn thiếu. */

var BG_SLOTS_ = { LOGIN: 'bg_login', HOME: 'bg_home' };
var BG_MAX_BYTES_ = 2 * 1048576;

function bgSlot_(p) {
  var s = String((p || {}).slot || '');
  if (!Object.prototype.hasOwnProperty.call(BG_SLOTS_, s)) throw validationError_([fieldError_('slot', s ? 'INVALID_VALUE' : 'REQUIRED')]);
  return s;
}

/** Ảnh đang dùng của một ô (Blob) hoặc null khi dùng ảnh mặc định / tệp đã mất */
function bgBlob_(slot) {
  var id = setting_(BG_SLOTS_[slot] + '_file_id');
  if (!id) return null;
  try {
    var f = DriveApp.getFileById(String(id));
    if (f.isTrashed()) return null;
    return f.getBlob();
  } catch (e) { return null; }
}

function bgRev_(slot) { return String(setting_(BG_SLOTS_[slot] + '_rev') || ''); }

/** Mã phiên bản ảnh của cả hai ô (sync.changes gửi kèm; '' = ảnh mặc định) */
function bgRevs_() { return { LOGIN: bgRev_('LOGIN'), HOME: bgRev_('HOME') }; }

/** bg.get {slot LOGIN | HOME}: ảnh riêng của ô ({slot, rev: ''} khi dùng ảnh mặc định) — mọi người đã đăng nhập */
function bgGet_(ctx) {
  var slot = bgSlot_(ctx.req.payload);
  var b = bgBlob_(slot);
  if (!b) return { slot: slot, rev: '' };
  return { slot: slot, rev: bgRev_(slot), mime_type: b.getContentType(), content_b64: b64_(b.getBytes()) };
}

/**
 * bg.set {slot, content_b64, mime_type: image/jpeg | image/png} hoặc {slot, remove: true} (dùng lại ảnh mặc định) — cấp 4, PIN.
 * Ảnh ≤ 2 MB (app thu nhỏ còn cạnh dài photo_max_edge_px trước khi gửi); cùng nội dung với ảnh đang dùng → trả luôn, không tạo tệp mới.
 */
function bgSet_(ctx) {
  var p = ctx.req.payload || {};
  var slot = bgSlot_(p);
  var key = BG_SLOTS_[slot];
  var by = ctx.user.user_id;
  var oldId = String(setting_(key + '_file_id') || '');
  var before = { rev: bgRev_(slot) };
  var audit = function (after) {
    writeAudit_({ user_id: by, device_id: ctx.req.device_id, action: 'bg.set', entity_type: 'SETTINGS', entity_id: key,
      before_json: before, after_json: after, operation_id: ctx.req.operation_id || '', auth_basis: authBasis_(ctx) });
  };
  if (p.remove === true) {
    if (!before.rev && !oldId) return { slot: slot, rev: '' };
    withWriteLock_(function () {
      writeSetting_(key + '_file_id', '', by);
      writeSetting_(key + '_rev', '', by);
      audit({ rev: '' });
    });
    if (oldId) { try { trashQuietly_(DriveApp.getFileById(oldId)); } catch (e) { /* bỏ qua */ } }
    return { slot: slot, rev: '' };
  }
  var errs = [];
  if (p.mime_type !== 'image/png' && p.mime_type !== 'image/jpeg') errs.push(fieldError_('mime_type', 'FILE_TYPE'));
  if (typeof p.content_b64 !== 'string' || !p.content_b64) errs.push(fieldError_('content_b64', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  var bytes;
  try { bytes = b64d_(p.content_b64); } catch (e) { throw validationError_([fieldError_('content_b64', 'INVALID_VALUE')]); }
  if (!bytes.length) throw validationError_([fieldError_('content_b64', 'REQUIRED')]);
  if (bytes.length > BG_MAX_BYTES_) throw validationError_([fieldError_('content_b64', 'FILE_TOO_LARGE')]);
  if (!magicOk_(bytes, p.mime_type)) throw validationError_([fieldError_('mime_type', 'FILE_TYPE')]);
  var rev = b64url_(sha256_(bytes)).slice(0, 16);
  if (rev === before.rev && bgBlob_(slot)) return { slot: slot, rev: rev };
  var file = appFolder_().createFile(Utilities.newBlob(bytes, p.mime_type, key + '.' + DOC_MIME_[p.mime_type].ext));
  try {
    withWriteLock_(function () {
      writeSetting_(key + '_file_id', file.getId(), by);
      writeSetting_(key + '_rev', rev, by);
      audit({ rev: rev, bytes: bytes.length, mime_type: p.mime_type });
    });
  } catch (e) {
    trashQuietly_(file);
    throw e;
  }
  if (oldId && oldId !== file.getId()) { try { trashQuietly_(DriveApp.getFileById(oldId)); } catch (e2) { /* bỏ qua */ } }
  return { slot: slot, rev: rev };
}
