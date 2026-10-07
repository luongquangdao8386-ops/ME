/* 05_lock: khóa ghi chung (phụ lục 1.5 mục 3.15) */

var LOCK_DEPTH_ = 0;

/**
 * Chạy fn dưới ScriptLock. Chờ quá 10 giây → SERVER_BUSY.
 * Gọi lồng nhau thì dùng lại khóa đang giữ. Luôn flush trước khi nhả khóa,
 * kể cả khi fn ném lỗi sau khi đã ghi (vd ghi lần sai PIN rồi báo AUTH_FAILED).
 */
function withWriteLock_(fn) {
  if (LOCK_DEPTH_ > 0) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw apiError_('SERVER_BUSY');
  LOCK_DEPTH_++;
  try {
    return fn();
  } finally {
    LOCK_DEPTH_--;
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}
