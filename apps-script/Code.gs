/**
 * M&E · 机电管理 — Code.gs 1.0.0-d1.3
 * TỆP TẠO TỰ ĐỘNG từ server/src/*.js bằng "npm run build". Không sửa tay.
 * Dán toàn bộ nội dung vào tệp Code.gs của dự án Apps Script M&E.
 * Không chứa ID, khóa bí mật hay dữ liệu: các giá trị đó nằm trong Thuộc tính tập lệnh.
 */

// ===== 00_config.js =====
/* =====================================================================
 * M&E · 机电管理 — máy chủ Google Apps Script
 * 00_config: hằng số, Settings mặc định, khóa SystemState
 * (phụ lục 1.5 mục 3.14, 3.15)
 * ===================================================================== */

var APP_ID = 'ME';
var SERVER_VERSION = '1.0.0-d1.3';
var API_CONTRACT_VERSION = '1.0';
var SCHEMA_VERSION = '1.5.0';
var TZ = 'Asia/Ho_Chi_Minh';
var TZ_OFFSET_MIN = 7 * 60; // Việt Nam không có giờ mùa hè
var RELEASED_DOT = 1;       // đợt đang phát hành
var NAME_PREFIX = 'ME_';    // tên spreadsheet, thư mục Drive

/** Bản ghi do máy chủ tạo thay mặt hệ thống (dịch nền, trigger). */
var SYSTEM_USER = 'SYSTEM';

/**
 * Settings mặc định — 50 khóa (3.14; thêm doc_mobile_upload_max_bytes sau PoC).
 * [khóa, kiểu, mặc định, gửi xuống client, đợt, mô tả Việt, mô tả Trung]
 */
var SETTINGS_DEFAULTS = [
  ['session_days', 'INT', 30, true, 1, 'Số ngày của phiên đăng nhập', '登录会话天数'],
  ['session_warn_days', 'INT', 3, true, 1, 'Cảnh báo trước khi phiên hết hạn (ngày)', '会话到期前提醒天数'],
  ['change_pin_session_minutes', 'INT', 10, false, 1, 'Hạn phiên đổi PIN (phút)', '修改PIN会话时限（分钟）'],
  ['reauth_window_minutes', 'INT', 5, true, 1, 'Hạn của lần nhập lại PIN (phút)', '重新输入PIN有效时间（分钟）'],
  ['temp_pin_hours', 'INT', 72, false, 1, 'Hạn PIN tạm (giờ)', '临时PIN有效期（小时）'],
  ['max_sessions_per_user', 'INT', 10, false, 1, 'Số phiên tối đa mỗi người', '每人最多会话数'],
  ['login_fail_limit', 'INT', 5, false, 1, 'Số lần sai PIN trước khi khóa', '锁定前允许输错PIN次数'],
  ['login_fail_window_minutes', 'INT', 15, false, 1, 'Cửa sổ đếm lần sai (phút)', '输错计数时间窗（分钟）'],
  ['login_lock_minutes', 'INT', 15, false, 1, 'Thời gian khóa (phút)', '锁定时长（分钟）'],
  ['login_global_fail_limit', 'INT', 30, false, 1, 'Số lần sai toàn hệ thống trước khi tạm dừng', '全系统暂停登录前的输错次数'],
  ['login_global_window_minutes', 'INT', 10, false, 1, 'Cửa sổ đếm sai toàn hệ thống (phút)', '全系统输错计数时间窗（分钟）'],
  ['login_global_pause_minutes', 'INT', 10, false, 1, 'Thời gian tạm dừng đăng nhập (phút)', '暂停登录时长（分钟）'],
  ['auth_attempts_retention_days', 'INT', 90, false, 1, 'Số ngày giữ nhật ký đăng nhập', '登录记录保留天数'],
  ['offline_unlock_attempts', 'INT', 5, true, 1, 'Số lần mở khóa ngoại tuyến sai trước khi khóa', '离线解锁锁定前允许输错次数'],
  ['offline_lock_minutes', 'INT', 15, true, 1, 'Thời gian khóa mở khóa ngoại tuyến (phút)', '离线解锁锁定时长（分钟）'],
  ['offline_max_lockouts', 'INT', 3, true, 1, 'Số lần bị khóa liên tiếp trước khi xóa dữ liệu đăng nhập trên máy', '连续锁定次数上限（超出则清除本机登录数据）'],
  ['offline_pbkdf2_iterations', 'INT', 200000, true, 1, 'Số vòng PBKDF2 cho mở khóa ngoại tuyến', '离线解锁PBKDF2迭代次数'],
  ['offline_probe_seconds', 'INT', 12, true, 1, 'Thời gian chờ máy chủ khi mở app (giây)', '打开应用时等待服务器时间（秒）'], // P-17: mở app 3–8,4 giây
  ['machine_translation_enabled', 'BOOL', true, false, 1, 'Bật dịch máy', '启用机器翻译'],
  ['mt_chunk_chars', 'INT', 1000, false, 1, 'Độ dài tối đa mỗi đoạn dịch', '每段翻译最大字符数'],
  ['mt_max_fields_per_request', 'INT', 20, false, 1, 'Số trường dịch tối đa mỗi lần lưu', '每次保存最多翻译字段数'],
  ['mt_sync_budget_seconds', 'INT', 4, false, 1, 'Thời gian dịch tối đa khi lưu (giây)', '保存时翻译最长时间（秒）'],
  ['mt_daily_budget', 'INT', 3000, false, 1, 'Số lượt dịch tối đa mỗi ngày', '每日最多翻译次数'],
  ['lead_days', 'INT', 40, true, 1, 'Số ngày nhắc trước hạn', '到期前提醒天数'],
  ['email_stages', 'STRING', '40,30,14,7,3,1,0', true, 1, 'Các mốc gửi email (chỉ đọc)', '邮件提醒节点（只读）'],
  ['overdue_repeat_days', 'INT', 7, true, 1, 'Nhắc quá hạn mỗi N ngày (chỉ đọc)', '逾期每N天提醒一次（只读）'],
  ['email_hour', 'INT', 7, false, 1, 'Giờ gửi email nhắc hạn', '到期提醒邮件发送时间'],
  ['email_max_attempts', 'INT', 3, false, 1, 'Số lần gửi lại email tối đa', '邮件最多重试次数'],
  ['gmail_enabled', 'BOOL', false, false, 1, 'Bật gửi Gmail', '启用Gmail发送'],
  ['app_base_url', 'STRING', '', false, 1, 'Địa chỉ app dùng trong link email', '邮件链接使用的应用地址'],
  ['min_client_version', 'STRING', '1.0.0', true, 1, 'Phiên bản app tối thiểu', '最低应用版本'],
  ['client_timeout_seconds', 'INT', 30, true, 1, 'Thời gian chờ request thường (giây)', '普通请求超时（秒）'],
  ['client_long_timeout_seconds', 'INT', 55, true, 1, 'Thời gian chờ request dài (giây)', '长请求超时（秒）'],
  ['list_page_size', 'INT', 50, true, 1, 'Số dòng mỗi trang danh sách', '列表每页行数'],
  ['sync_page_size', 'INT', 500, true, 1, 'Số dòng mỗi trang đồng bộ', '同步每页行数'],
  ['doc_max_bytes', 'INT', 10485760, true, 1, 'Dung lượng tối đa mỗi tệp (byte)', '单个文件最大字节数'],
  // P-16: tải lên từ điện thoại trên 5 MB dễ quá 55 giây → tệp lớn hơn tải lên từ máy tính (người dùng chốt 08/10/2026)
  ['doc_mobile_upload_max_bytes', 'INT', 5242880, true, 1, 'Dung lượng tối đa mỗi tệp khi tải lên từ điện thoại (byte)', '手机上传单个文件最大字节数'],
  ['offline_files_max_mb', 'INT', 100, true, 1, 'Dung lượng tệp ngoại tuyến tối đa (MB)', '离线文件最大容量（MB）'],
  ['photo_max_edge_px', 'INT', 1600, true, 1, 'Cạnh dài tối đa của ảnh (px)', '照片最长边（像素）'],
  ['photo_jpeg_quality', 'NUMBER', 0.8, true, 1, 'Chất lượng JPEG của ảnh', '照片JPEG质量'],
  ['photo_thumb_edge_px', 'INT', 400, true, 1, 'Cạnh dài của ảnh nhỏ (px)', '缩略图最长边（像素）'],
  ['warehouse_connected', 'BOOL', false, true, 1, 'Đã kết nối app Kho', '已连接仓库应用'],
  ['default_currency', 'STRING', 'VND', true, 1, 'Tiền tệ mặc định', '默认币种'],
  ['qr_label_size', 'ENUM', 'SMALL_70X37', true, 1, 'Cỡ tem QR mặc định', '默认二维码标签尺寸'],
  ['backup_weekday', 'ENUM', 'SUNDAY', false, 1, 'Ngày sao lưu trong tuần', '每周备份日'],
  ['backup_hour', 'INT', 1, false, 1, 'Giờ sao lưu', '备份时间'],
  ['backup_keep_count', 'INT', 8, false, 1, 'Số bản sao lưu giữ lại', '保留备份份数'],
  ['self_approval_exceptions', 'JSON', [], true, 1, 'Ngoại lệ tự duyệt', '自审批例外'],
  ['meter_boundary_window_hours', 'INT', 24, true, 3, 'Cửa sổ chốt chỉ số theo kỳ (giờ)', '抄表周期结算时间窗（小时）'],
  ['reading_self_edit_hours', 'INT', 24, true, 3, 'Thời gian tự sửa chỉ số của mình (giờ)', '本人修改读数时限（小时）']
];

/** Khóa SystemState ban đầu (3.14). Bộ đếm `code_seq.*`, `table_rev.*` thêm khi dùng. */
var SYSTEM_STATE_INITIAL = [
  ['dataset_epoch', 'STRING', ''],
  ['maintenance_mode', 'BOOL', false],
  ['sync_revision', 'INT', 0],
  ['schema_version', 'STRING', SCHEMA_VERSION],
  ['perm_version', 'INT', 1],
  ['login_paused_until', 'DATETIME', ''],
  ['mt_paused_until', 'DATETIME', ''],
  ['last_backup_at', 'DATETIME', ''],
  ['last_backup_ref', 'STRING', ''],
  ['last_backup_status', 'ENUM', ''],
  ['last_reset_at', 'DATETIME', ''],
  ['last_restore_at', 'DATETIME', ''],
  ['restored_from_ref', 'STRING', ''],
  ['restored_backup_at', 'DATETIME', ''],
  ['restored_by', 'STRING', '']
];

/** Mẫu mã hiển thị (3.3). yymm: true khi có phần năm-tháng. */
var CODE_PATTERNS = {
  LOCATION: { prefix: 'KV', digits: 3, yymm: false, manual: true },
  VENDOR: { prefix: 'NCC', digits: 4, yymm: false, manual: true },
  EQUIPMENT: { prefix: 'TB', digits: 4, yymm: false, manual: true },
  MATERIAL: { prefix: 'VT', digits: 4, yymm: false, manual: true },
  CONTRACT: { prefix: 'HD', digits: 4, yymm: false, manual: false },
  INSPECTION_REQUIREMENT: { prefix: 'KD', digits: 4, yymm: false, manual: false },
  INSPECTION: { prefix: 'LKD', digits: 3, yymm: true, manual: false }
};

/** Vai trò cấp 2 và module chính (4.1). */
var SUBROLES = {
  KY_THUAT: ['equipment', 'warehouse', 'maintenance', 'repairs', 'circuits'],
  DOC_DIEN_NUOC: ['utilities'],
  HD_KD: ['contracts', 'inspections'],
  THU_KHO: ['warehouse'],
  BAO_SU_CO: ['repairs']
};

/** 15 module của RolePermissions (4.8). */
var PERM_MODULES = ['equipment', 'maintenance', 'repairs', 'warehouse', 'utilities', 'reports', 'circuits',
  'contracts', 'inspections', 'catalog', 'users', 'notifications', 'audit', 'backup', 'system'];

/** Loại hồ sơ → module quyền và sheet. qr: có cấp qr_key. */
var ENTITY_TYPES = {
  EQUIPMENT: { module: 'equipment', sheet: 'Equipment', key: 'equipment_id', code: 'equipment_code', qr: true },
  MATERIAL: { module: 'warehouse', sheet: 'Materials', key: 'material_id', code: 'material_code', qr: true },
  CONTRACT: { module: 'contracts', sheet: 'Contracts', key: 'contract_id', code: 'contract_code', qr: true },
  INSPECTION_REQUIREMENT: { module: 'inspections', sheet: 'InspectionRequirements', key: 'requirement_id', code: 'requirement_code', qr: true },
  INSPECTION: { module: 'inspections', sheet: 'Inspections', key: 'inspection_id', code: 'inspection_code', qr: true },
  INSPECTION_TYPE: { module: 'inspections', sheet: 'InspectionTypes', key: 'inspection_type_id', code: 'code', qr: false },
  LOCATION: { module: 'catalog', sheet: 'Locations', key: 'location_id', code: 'location_code', qr: false },
  VENDOR: { module: 'catalog', sheet: 'Vendors', key: 'vendor_id', code: 'vendor_code', qr: false },
  DOCUMENT: { module: null, sheet: 'Documents', key: 'document_id', code: null, qr: false }
};

/** Loại tài liệu → phạm vi truy cập (3.10). */
var DOC_KIND_SCOPE = {
  PHOTO_EQUIPMENT: 'LINK_VIEW', PHOTO_MATERIAL: 'LINK_VIEW', PHOTO_SITE: 'LINK_VIEW', PHOTO_METER: 'LINK_VIEW',
  CERTIFICATE: 'MODULE_VIEW', DRAWING: 'MODULE_VIEW', MANUAL: 'MODULE_VIEW', IMPORT_FILE: 'MODULE_VIEW', OTHER: 'MODULE_VIEW',
  CONTRACT: 'COST_VIEW', INVOICE: 'COST_VIEW'
};

/** Trường giá (4.5). */
var COST_FIELDS = {
  Contracts: ['value', 'currency'],
  ContractEquipment: ['price', 'currency'],
  ContractServices: ['cost', 'currency'],
  Inspections: ['cost', 'currency']
};

/** Trường không dịch tự động (2.3). Tên trường gốc (không hậu tố _vi/_zh). */
var NO_MT_FIELDS = {
  Settings: ['description'],
  InspectionTypes: ['name', 'required_docs'],
  Inspections: ['restriction'],
  Contracts: ['scope', 'closed_reason'],
  ContractEquipment: ['service'],
  ContractServices: ['result']
};

// ===== 01_util.js =====
/* 01_util: thời gian, UUID, byte, băm, mã hóa (phụ lục 1.5 mục 3.1, 3.3, 3.5) */

function now_() {
  return new Date();
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Đổi Date sang các phần ngày giờ theo giờ Việt Nam (+07:00, không có giờ mùa hè). */
function vnParts_(d) {
  var t = new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
    hh: t.getUTCHours(), mi: t.getUTCMinutes(), ss: t.getUTCSeconds()
  };
}

/** ISO 8601 có múi giờ, vd 2026-10-07T08:00:00+07:00 */
function isoVN_(d) {
  if (!d) return '';
  var p = vnParts_(d);
  return p.y + '-' + pad2_(p.m) + '-' + pad2_(p.d) + 'T' + pad2_(p.hh) + ':' + pad2_(p.mi) + ':' + pad2_(p.ss) + '+07:00';
}

/** YYYY-MM-DD theo giờ Việt Nam */
function dateVN_(d) {
  var p = vnParts_(d);
  return p.y + '-' + pad2_(p.m) + '-' + pad2_(p.d);
}

/** yymm từ một ngày YYYY-MM-DD hoặc Date */
function yymm_(v) {
  var s = (v instanceof Date) ? dateVN_(v) : String(v);
  var m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return '';
  return m[1].slice(2) + m[2];
}

function parseTime_(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  var t = Date.parse(String(s));
  return isNaN(t) ? null : new Date(t);
}

function isDateStr_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  var d = new Date(String(s) + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === String(s);
}

function unixNow_() {
  return Math.floor(now_().getTime() / 1000);
}

/** UUID v4 chữ thường do máy chủ sinh (3.3) */
function uuid_() {
  return Utilities.getUuid().toLowerCase();
}

var UUID_V4_RE_ = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isUuidV4_(s) {
  return typeof s === 'string' && UUID_V4_RE_.test(s);
}

/* ---------- byte ---------- */

/** Chuỗi → byte UTF-8 (byte có dấu như Java) */
function utf8Bytes_(s) {
  return Utilities.newBlob(String(s)).getBytes();
}

/** Byte có dấu → 0..255 */
function u8_(b) {
  return b & 0xFF;
}

function sha256_(bytesOrString) {
  if (typeof bytesOrString === 'string') {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytesOrString, Utilities.Charset.UTF_8);
  }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytesOrString);
}

/** HMAC-SHA256(value, key) — dùng overload (byte[] value, byte[] key) */
function hmac256_(valueBytes, keyBytes) {
  return Utilities.computeHmacSha256Signature(valueBytes, keyBytes);
}

function b64_(bytes) {
  return Utilities.base64Encode(bytes);
}

function b64d_(s) {
  return Utilities.base64Decode(s);
}

/** Base64url không đệm (3.5) */
function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function b64urlDecode_(s) {
  var t = String(s);
  while (t.length % 4) t += '=';
  return Utilities.base64DecodeWebSafe(t);
}

/** So sánh hai mảng byte theo thời gian hằng: XOR cộng dồn, không dừng sớm. */
function ctEqualBytes_(a, b) {
  var n = Math.max(a.length, b.length);
  var diff = a.length ^ b.length;
  for (var i = 0; i < n; i++) {
    var x = i < a.length ? u8_(a[i]) : 0;
    var y = i < b.length ? u8_(b[i]) : 0;
    diff |= (x ^ y);
  }
  return diff === 0;
}

function ctEqualStr_(a, b) {
  return ctEqualBytes_(utf8Bytes_(a || ''), utf8Bytes_(b || ''));
}

/** 16 byte ngẫu nhiên = 16 byte đầu SHA-256(2 UUID) (3.5) */
function randomBytes16_() {
  return sha256_(Utilities.getUuid() + Utilities.getUuid()).slice(0, 16);
}

/** 32 byte bí mật = SHA-256(3 UUID) (3.14) */
function randomSecret32_() {
  return sha256_(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
}

var CROCKFORD_ = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Mã hóa nChars ký tự Crockford base32 từ các bit đầu của mảng byte */
function crockford_(bytes, nChars) {
  var out = '';
  var bitBuf = 0, bitLen = 0, i = 0;
  while (out.length < nChars) {
    if (bitLen < 5) {
      bitBuf = ((bitBuf << 8) | u8_(bytes[i++])) & 0xFFFF;
      bitLen += 8;
    }
    var idx = (bitBuf >> (bitLen - 5)) & 31;
    bitLen -= 5;
    out += CROCKFORD_.charAt(idx);
  }
  return out;
}

/** qr_key: 20 ký tự Crockford (100 bit) từ SHA-256(2 UUID) (2.8) */
function newQrKey_() {
  return crockford_(sha256_(Utilities.getUuid() + Utilities.getUuid()), 20);
}

var QR_KEY_RE_ = /^[0-9A-HJKMNP-TV-Z]{20}$/;

/** Chuẩn hóa chuỗi nhập tay: bỏ cách/gạch, chữ hoa, O→0, I/L→1 */
function normalizeQrKey_(s) {
  var t = String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return QR_KEY_RE_.test(t) ? t : null;
}

/** JSON ổn định (khóa sắp xếp) để băm payload */
function stableStringify_(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(stableStringify_).join(',') + ']';
  if (typeof v === 'object') {
    var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + stableStringify_(v[k]); }).join(',') + '}';
  }
  return JSON.stringify(v);
}

var SECRET_KEYS_ = ['pin', 'current_pin', 'new_pin', 'token', 'reauth_token', 'temp_pin'];

/** Bỏ khóa bí mật khỏi bản sao payload trước khi ghi log/Operations (3.15) */
function redact_(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact_);
  var out = {};
  Object.keys(obj).forEach(function (k) {
    if (SECRET_KEYS_.indexOf(k) >= 0) return;
    if (k === 'content_b64' || k === 'thumb_b64') { out[k] = '[' + String(obj[k] || '').length + ' chars]'; return; }
    out[k] = redact_(obj[k]);
  });
  return out;
}

function clone_(o) {
  return JSON.parse(JSON.stringify(o));
}

function trimStr_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** So sánh phiên bản dạng a.b.c (bỏ phần -poc...) */
function cmpVersion_(a, b) {
  var pa = String(a || '0').split('-')[0].split('.').map(Number);
  var pb = String(b || '0').split('-')[0].split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    var x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Trong một request (doPost/doGet) ScriptProperties chỉ đọc một lần; hàm chạy tay thì đọc trực tiếp */
var PROPS_MEMO_ = null, PROPS_MEMO_ON_ = false;

function propsReset_(on) {
  PROPS_MEMO_ = null;
  PROPS_MEMO_ON_ = !!on;
}

function prop_(key) {
  if (!PROPS_MEMO_ON_) return PropertiesService.getScriptProperties().getProperty(key);
  if (!PROPS_MEMO_) PROPS_MEMO_ = PropertiesService.getScriptProperties().getProperties() || {};
  var v = PROPS_MEMO_[key];
  return v === undefined ? null : v;
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
  if (PROPS_MEMO_) PROPS_MEMO_[key] = String(value);
}

function delProp_(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
  if (PROPS_MEMO_) delete PROPS_MEMO_[key];
}

function envName_() {
  return prop_('ENV') || 'THU';
}

function isTestEnv_() {
  return envName_() === 'THU';
}

function cache_() {
  return CacheService.getScriptCache();
}

// ===== 02_schema.js =====
/* 02_schema: sheet và cột của Đợt 1 (1.4 §10.2, §10.3.1; phụ lục 1.5 mục 3.1, 3.16, 6.4) */

/**
 * Bộ cột C (1.4 §10.1) cho bảng nghiệp vụ. Thêm `sync_revision` (mốc đồng bộ của dòng,
 * để `sync.changes` lấy được dòng đổi sau cursor; 3.15).
 */
var C_COLS = ['dataset_epoch', 'record_version', 'sync_revision', 'created_at', 'created_by', 'updated_at', 'updated_by', 'archived_at'];

/**
 * book: B = Nghiệp vụ, S = Bảo mật. c: thêm bộ C. i18n: thêm `i18n_meta`.
 * cols: tên cột cách nhau bằng dấu cách; kiểu suy theo tên (colType_), ghi đè bằng "ten:KIEU".
 */
var SHEETS = {
  // ---- Nghiệp vụ (26) ----
  Settings: { book: 'B', dot: 1, key: 'setting_key', i18n: true,
    cols: 'setting_key value:STRING value_type description_vi description_zh updated_at updated_by' },
  SystemState: { book: 'B', dot: 1, key: 'state_key',
    cols: 'state_key value:STRING value_type updated_at updated_by' },
  Locations: { book: 'B', dot: 1, key: 'location_id', c: true, i18n: true,
    cols: 'location_id location_code parent_location_id name_vi name_zh type active' },
  LookupValues: { book: 'B', dot: 1, key: 'value_id', c: true, i18n: true,
    cols: 'value_id group_key code name_vi name_zh parent_value_id active' },
  Vendors: { book: 'B', dot: 1, key: 'vendor_id', c: true, i18n: true,
    cols: 'vendor_id vendor_code name contact_name phone email address services_vi services_zh active' },
  Glossary: { book: 'B', dot: 1, key: 'glossary_id', c: true,
    cols: 'glossary_id term_vi term_zh note active approved_by approved_at' },
  Documents: { book: 'B', dot: 1, key: 'document_id', c: true, i18n: true,
    cols: 'document_id entity_type entity_id title_vi title_zh kind drive_file_id external_url mime_type file_version ' +
      'access_scope document_date active managed_folder_id storage_kind owned_by_app drive_sharing_state sharing_updated_at ' +
      'sharing_error_code size_bytes thumb_drive_file_id' },
  QrRegistry: { book: 'B', dot: 1, key: 'qr_key',
    cols: 'qr_key entity_type entity_id code label_vi label_zh active dataset_epoch' },
  Equipment: { book: 'B', dot: 1, key: 'equipment_id', c: true, i18n: true,
    cols: 'equipment_id equipment_code name_vi name_zh category_id location_id vendor_id manufacturer model serial ' +
      'manufacture_year install_date warranty_end status criticality owner_user_id' },
  EquipmentSpecs: { book: 'B', dot: 1, key: 'spec_id', c: true, i18n: true,
    cols: 'spec_id equipment_id spec_key label_vi label_zh value_num value_text unit sort_order' },
  Materials: { book: 'B', dot: 1, key: 'material_id', c: true, i18n: true,
    cols: 'material_id material_code name_vi name_zh part_number manufacturer model specification_vi specification_zh ' +
      'base_unit vendor_id lead_time_days reorder_level lot_tracking serial_tracking active group_key item_kind is_equipment_component' },
  EquipmentParts: { book: 'B', dot: 1, key: 'equipment_part_id', c: true, i18n: true,
    cols: 'equipment_part_id equipment_id material_id installed_qty unit function_vi function_zh alternate_part_id ' +
      'compatibility_note approved_by position_vi position_zh effective_from removed_at' },
  EquipmentPartEvents: { book: 'B', dot: 1, key: 'event_id', i18n: true,
    cols: 'event_id equipment_id equipment_part_id material_id event_type quantity unit position_vi position_zh occurred_at ' +
      'work_type work_id usage_line_id actor_user_id note_vi note_zh dataset_epoch sync_revision created_at created_by' },
  Contracts: { book: 'B', dot: 1, key: 'contract_id', c: true, i18n: true,
    cols: 'contract_id contract_code contract_number title_vi title_zh vendor_id start_date end_date renewal_notice_date ' +
      'value currency owner_user_id scope_vi scope_zh status revision previous_contract_id submitted_by submitted_at ' +
      'approved_by approved_at lifecycle_status closed_at closed_reason_vi closed_reason_zh due_revision' },
  ContractEquipment: { book: 'B', dot: 1, key: 'contract_equipment_id', c: true, i18n: true,
    cols: 'contract_equipment_id contract_id equipment_id service_vi service_zh interval_type interval_value next_service_date price currency' },
  ContractServices: { book: 'B', dot: 1, key: 'service_id', c: true, i18n: true,
    cols: 'service_id contract_id contract_equipment_id due_date performed_at result_vi result_zh vendor_contact cost currency ' +
      'status accepted_by accepted_at' },
  InspectionTypes: { book: 'B', dot: 1, key: 'inspection_type_id', c: true, i18n: true,
    cols: 'inspection_type_id code name_vi name_zh reference_basis default_interval_months required_docs_vi required_docs_zh active' },
  InspectionRequirements: { book: 'B', dot: 1, key: 'requirement_id', c: true,
    cols: 'requirement_id requirement_code equipment_id location_id inspection_type_id owner_user_id current_inspection_id ' +
      'current_due_date operational_status obligation_status active due_revision' },
  Inspections: { book: 'B', dot: 1, key: 'inspection_id', c: true, i18n: true,
    cols: 'inspection_id inspection_code requirement_id vendor_id inspection_date certificate_number valid_from valid_to ' +
      'next_due_date result restriction_vi restriction_zh cost currency status approved_by approved_at supersedes_inspection_id ' +
      'submitted_by submitted_at' },
  ImportBatches: { book: 'B', dot: 1, key: 'import_batch_id',
    cols: 'import_batch_id module schema_version imported_by imported_at file_document_id total_rows add_count update_count ' +
      'error_count status approved_by completed_at dataset_epoch source_sha256 committing_session_id commit_started_at ' +
      'record_version updated_at' },
  ImportRows: { book: 'B', dot: 1, key: 'import_row_id',
    cols: 'import_row_id import_batch_id row_number entity_type entity_id action expected_version validation_status error_text ' +
      'committed_at normalized_payload_json row_hash' },
  AuditLogs: { book: 'B', dot: 1, key: 'audit_id',
    cols: 'audit_id occurred_at user_id device_id action entity_type entity_id before_json after_json operation_id ' +
      'import_batch_id dataset_epoch reason auth_basis' },
  Operations: { book: 'B', dot: 1, key: 'operation_id',
    cols: 'operation_id user_id device_id entity_type entity_id expected_version received_at state result_code sync_revision ' +
      'committed_at dataset_epoch action payload_hash intent_json progress_json result_json' },
  Alerts: { book: 'B', dot: 1, key: 'alert_id',
    cols: 'alert_id entity_type entity_id due_revision due_date days_remaining alert_state owner_user_id acknowledged_at ' +
      'resolved_at refreshed_at dataset_epoch reference_date_kind stage sync_revision' },
  NotificationRecipients: { book: 'B', dot: 1, key: 'recipient_id', c: true,
    cols: 'recipient_id email user_id location_scope entity_scope active confirmed_by confirmed_at' },
  NotificationLogs: { book: 'B', dot: 1, key: 'notification_id',
    cols: 'notification_id dedupe_key run_date recipient_id entity_type entity_id due_revision due_date stage status ' +
      'attempt_at sent_at error_code dataset_epoch alert_id reference_date_kind days_remaining digest_id queued_at attempt_count' },

  // ---- Bảo mật (5) ----
  Users: { book: 'S', dot: 1, key: 'user_id',
    cols: 'user_id employee_code display_name email role_level active pin_hash salt pin_hash_version failed_attempts ' +
      'locked_until created_at updated_at auth_version is_system_owner must_change_pin temp_pin_expires_at pin_changed_at ' +
      'failed_window_started_at last_login_at record_version created_by updated_by' },
  RolePermissions: { book: 'S', dot: 1, key: 'permission_id',
    cols: 'permission_id role_level module can_view can_create can_edit can_approve can_import can_export can_view_cost ' +
      'can_reset_system updated_at updated_by' },
  UserScopes: { book: 'S', dot: 1, key: 'scope_id',
    cols: 'scope_id user_id location_id module subrole active created_at created_by updated_at updated_by' },
  Sessions: { book: 'S', dot: 1, key: 'session_id',
    cols: 'session_id token_hash user_id device_id issued_at expires_at revoked_at auth_version dataset_epoch app_id ' +
      'origin_key session_kind last_seen_at revoke_reason device_label' },
  AuthAttempts: { book: 'S', dot: 1, key: 'attempt_id',
    cols: 'attempt_id occurred_at employee_code_hash device_id outcome attempt_kind user_id' }
};

var TYPE_OVERRIDES_ = {
  drive_file_id: 'STRING', managed_folder_id: 'STRING', thumb_drive_file_id: 'STRING', external_url: 'STRING',
  employee_code_hash: 'STRING', token_hash: 'STRING', payload_hash: 'STRING', row_hash: 'STRING', source_sha256: 'STRING',
  pin_hash: 'STRING', salt: 'STRING', qr_key: 'STRING', dedupe_key: 'STRING', origin_key: 'STRING',
  valid_from: 'DATE', valid_to: 'DATE', effective_from: 'DATE', install_date: 'DATE', warranty_end: 'DATE', run_date: 'DATE',
  removed_at: 'DATETIME',
  value: 'NUMBER', price: 'NUMBER', cost: 'NUMBER', installed_qty: 'NUMBER', quantity: 'NUMBER', value_num: 'NUMBER',
  reorder_level: 'NUMBER',
  record_version: 'INT', sync_revision: 'INT', role_level: 'INT', auth_version: 'INT', failed_attempts: 'INT', file_version: 'INT',
  size_bytes: 'INT', total_rows: 'INT', add_count: 'INT', update_count: 'INT', error_count: 'INT', revision: 'INT',
  due_revision: 'STRING', days_remaining: 'INT', attempt_count: 'INT', row_number: 'INT', expected_version: 'INT',
  sort_order: 'INT', interval_value: 'INT', lead_time_days: 'INT', manufacture_year: 'INT', default_interval_months: 'INT',
  active: 'BOOL', owned_by_app: 'BOOL', must_change_pin: 'BOOL', lot_tracking: 'BOOL', serial_tracking: 'BOOL',
  is_equipment_component: 'BOOL', is_system_owner: 'BOOL', i18n_meta: 'JSON', code: 'CODE', schema_version: 'STRING',
  phone: 'STRING', email: 'STRING'
};

/** Kiểu cột (3.1) suy theo tên. */
function colType_(name) {
  if (TYPE_OVERRIDES_[name]) return TYPE_OVERRIDES_[name];
  if (/^can_/.test(name)) return 'BOOL';
  if (/_json$/.test(name)) return 'JSON';
  if (/_id$/.test(name)) return 'ID';
  if (/_code$/.test(name)) return 'CODE';
  if (/_at$/.test(name) || /_until$/.test(name)) return 'DATETIME';
  if (/_date$/.test(name)) return 'DATE';
  return 'STRING';
}

var TEXT_FORMAT_TYPES_ = { ID: 1, CODE: 1, DATE: 1, DATETIME: 1, JSON: 1, STRING: 1, ENUM: 1 };

var schemaCache_ = {};

/** Danh sách cột và kiểu của một sheet: {cols:[name], types:{name:type}} */
function sheetSchema_(name) {
  if (schemaCache_[name]) return schemaCache_[name];
  var def = SHEETS[name];
  if (!def) throw new Error('Unknown sheet ' + name);
  var cols = [], types = {};
  def.cols.split(/\s+/).filter(String).forEach(function (spec) {
    var p = spec.split(':');
    cols.push(p[0]);
    types[p[0]] = p[1] || colType_(p[0]);
  });
  if (def.c) C_COLS.forEach(function (c) { if (cols.indexOf(c) < 0) { cols.push(c); types[c] = colType_(c); } });
  if (def.i18n && cols.indexOf('i18n_meta') < 0) { cols.push('i18n_meta'); types.i18n_meta = 'JSON'; }
  schemaCache_[name] = { cols: cols, types: types, key: def.key, book: def.book, dot: def.dot };
  return schemaCache_[name];
}

/** Sheet thuộc đợt ≤ RELEASED_DOT */
function sheetsForDot_(dot) {
  return Object.keys(SHEETS).filter(function (n) { return SHEETS[n].dot <= dot; });
}

/** Giá trị JS → ô Sheet */
function toCell_(type, v) {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'BOOL': return v === true || v === 'TRUE' || v === 'true';
    case 'INT':
    case 'NUMBER':
      if (v === '') return '';
      var n = Number(v);
      return isNaN(n) ? '' : n;
    case 'JSON': {
      var s = typeof v === 'string' ? v : JSON.stringify(v);
      if (s.length > 50000) throw new Error('JSON cell too large');
      return s;
    }
    default: return String(v);
  }
}

/** Ô Sheet → giá trị JS */
function fromCell_(type, v) {
  switch (type) {
    case 'BOOL': return v === true || v === 'TRUE' || v === 'true';
    case 'INT':
    case 'NUMBER':
      if (v === '' || v === null || v === undefined) return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    case 'DATE':
      if (v instanceof Date) return dateVN_(v);
      return v === null || v === undefined ? '' : String(v);
    case 'DATETIME':
      if (v instanceof Date) return isoVN_(v);
      return v === null || v === undefined ? '' : String(v);
    case 'JSON':
      if (v === '' || v === null || v === undefined) return null;
      try { return JSON.parse(String(v)); } catch (e) { return null; }
    default:
      return v === null || v === undefined ? '' : String(v);
  }
}

// ===== 03_db.js =====
/* 03_db: đọc/ghi Sheet theo tên cột; SystemState; Settings */

var DB_ = { books: {}, sheets: {}, headers: {}, settings: null };

/** Xóa bộ nhớ đệm trong một lần chạy (dùng trong test và sau setup) */
function dbReset_() {
  DB_ = { books: {}, sheets: {}, headers: {}, settings: null };
  if (PROPS_MEMO_ON_) propsReset_(true);
}

function book_(b) {
  if (!DB_.books[b]) {
    var id = prop_(b === 'S' ? 'SECURITY_SPREADSHEET_ID' : 'BUSINESS_SPREADSHEET_ID');
    if (!id) throw apiError_('SYSTEM_NOT_READY');
    DB_.books[b] = SpreadsheetApp.openById(id);
  }
  return DB_.books[b];
}

function sh_(name) {
  if (!DB_.sheets[name]) {
    var s = sheetSchema_(name);
    var sheet = book_(s.book).getSheetByName(name);
    if (!sheet) throw apiError_('SYSTEM_NOT_READY', { missing_sheet: name });
    DB_.sheets[name] = sheet;
  }
  return DB_.sheets[name];
}

/** Hàng tiêu đề thực tế của sheet (có thể nhiều cột hơn schema sau migrate) */
function hdr_(name) {
  if (!DB_.headers[name]) {
    var sheet = sh_(name);
    var n = sheet.getLastColumn();
    var row = n > 0 ? sheet.getRange(1, 1, 1, n).getValues()[0] : [];
    var cols = row.map(function (v) { return String(v); });
    var idx = {};
    cols.forEach(function (c, i) { idx[c] = i; });
    DB_.headers[name] = { cols: cols, idx: idx };
  }
  return DB_.headers[name];
}

function rowToObj_(name, h, r, rowNum) {
  var types = sheetSchema_(name).types;
  var o = { __row: rowNum };
  for (var j = 0; j < h.cols.length; j++) {
    var c = h.cols[j];
    if (!c) continue;
    o[c] = fromCell_(types[c] || 'STRING', r[j]);
  }
  return o;
}

function objToRow_(name, h, o) {
  var types = sheetSchema_(name).types;
  return h.cols.map(function (c) { return toCell_(types[c] || 'STRING', o[c]); });
}

/** Đọc toàn bộ dòng dữ liệu */
function readRows_(name) {
  var sheet = sh_(name);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var h = hdr_(name);
  var vals = sheet.getRange(2, 1, last - 1, h.cols.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === '' || vals[i][0] === null) continue;
    out.push(rowToObj_(name, h, vals[i], i + 2));
  }
  return out;
}

/** Đọc các dòng từ dòng `fromRow` tới cuối (đọc phần đuôi, vd AuthAttempts) */
function readTail_(name, maxRows) {
  var sheet = sh_(name);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - maxRows + 1);
  var h = hdr_(name);
  var vals = sheet.getRange(start, 1, last - start + 1, h.cols.length).getValues();
  return vals.map(function (r, i) { return rowToObj_(name, h, r, start + i); });
}

function readRowAt_(name, rowNum) {
  var h = hdr_(name);
  var r = sh_(name).getRange(rowNum, 1, 1, h.cols.length).getValues()[0];
  return rowToObj_(name, h, r, rowNum);
}

/** Tìm các số dòng có ô `col` khớp nguyên ô `value` */
function findRowNums_(name, col, value) {
  if (value === null || value === undefined || value === '') return [];
  var sheet = sh_(name);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var h = hdr_(name);
  var ci = h.idx[col];
  if (ci === undefined) throw new Error('Unknown column ' + name + '.' + col);
  var found = sheet.getRange(2, ci + 1, last - 1, 1)
    .createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findAll();
  return found.map(function (r) { return r.getRow(); });
}

function findOne_(name, col, value) {
  var rows = findRowNums_(name, col, value);
  if (!rows.length) return null;
  return readRowAt_(name, rows[0]);
}

function findAll_(name, col, value) {
  return findRowNums_(name, col, value).map(function (r) { return readRowAt_(name, r); });
}

function ensureRows_(sheet, needLastRow, name) {
  var max = sheet.getMaxRows();
  if (needLastRow > max) {
    var add = needLastRow - max + 500;
    sheet.insertRowsAfter(max, add);
    applyColumnFormats_(sheet, name, max + 1, add);
  }
}

/** Thêm dòng ở cuối; trả số dòng đầu tiên */
function insertRows_(name, objs) {
  if (!objs.length) return 0;
  var sheet = sh_(name);
  var h = hdr_(name);
  var start = sheet.getLastRow() + 1;
  ensureRows_(sheet, start + objs.length - 1, name);
  var values = objs.map(function (o) { return objToRow_(name, h, o); });
  sheet.getRange(start, 1, values.length, h.cols.length).setValues(values);
  objs.forEach(function (o, i) { o.__row = start + i; });
  return start;
}

/** Ghi đè cả dòng */
function writeRow_(name, rowNum, obj) {
  var h = hdr_(name);
  sh_(name).getRange(rowNum, 1, 1, h.cols.length).setValues([objToRow_(name, h, obj)]);
}

/** Ghi một vài ô của một dòng */
function writeCells_(name, rowNum, partial) {
  var h = hdr_(name);
  var types = sheetSchema_(name).types;
  var sheet = sh_(name);
  Object.keys(partial).forEach(function (c) {
    if (c === '__row') return;
    var ci = h.idx[c];
    if (ci === undefined) throw new Error('Unknown column ' + name + '.' + c);
    sheet.getRange(rowNum, ci + 1).setValue(toCell_(types[c] || 'STRING', partial[c]));
  });
}

/** Định dạng ô Văn bản cho cột ID/CODE/DATE/DATETIME/JSON/STRING/ENUM (3.1) ở các dòng mới thêm */
function applyColumnFormats_(sheet, name, fromRow, numRows) {
  var types = sheetSchema_(name).types;
  var n = sheet.getLastColumn();
  var header = n > 0 ? sheet.getRange(1, 1, 1, n).getValues()[0] : [];
  header.forEach(function (c, i) {
    var t = types[String(c)] || 'STRING';
    if (TEXT_FORMAT_TYPES_[t]) sheet.getRange(fromRow, i + 1, numRows, 1).setNumberFormat('@');
  });
}

/* ---------------- SystemState ---------------- */

function parseStateValue_(type, v) {
  var s = v === null || v === undefined ? '' : String(v);
  if (type === 'INT' || type === 'NUMBER') return s === '' ? 0 : Number(s);
  if (type === 'BOOL') return s === 'true' || s === 'TRUE';
  if (type === 'JSON') { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  if (v instanceof Date) return isoVN_(v);
  return s;
}

function stateValueToCell_(type, v) {
  if (type === 'JSON') return JSON.stringify(v);
  if (type === 'BOOL') return v ? 'true' : 'false';
  return v === null || v === undefined ? '' : String(v);
}

/** Đọc SystemState (đọc thẳng Sheet; dùng dưới khóa ghi) */
function readState_() {
  var rows = readRows_('SystemState');
  var st = { map: {}, rows: {} };
  rows.forEach(function (r) {
    st.map[r.state_key] = parseStateValue_(r.value_type, r.value);
    st.rows[r.state_key] = { row: r.__row, type: r.value_type };
  });
  return st;
}

function stateGet_(st, key, def) {
  return Object.prototype.hasOwnProperty.call(st.map, key) ? st.map[key] : def;
}

/** Ghi nhiều khóa SystemState; khóa mới thêm dòng. updates: {key: [type, value]} */
function stateWrite_(st, updates, by) {
  var nowIso = isoVN_(now_());
  var inserts = [];
  Object.keys(updates).forEach(function (k) {
    var type = updates[k][0], val = updates[k][1];
    if (st.rows[k]) {
      writeCells_('SystemState', st.rows[k].row, { value: stateValueToCell_(type, val), updated_at: nowIso, updated_by: by || SYSTEM_USER });
    } else {
      inserts.push({ state_key: k, value: stateValueToCell_(type, val), value_type: type, updated_at: nowIso, updated_by: by || SYSTEM_USER });
    }
    st.map[k] = val;
  });
  if (inserts.length) {
    insertRows_('SystemState', inserts);
    inserts.forEach(function (o) { st.rows[o.state_key] = { row: o.__row, type: o.value_type }; });
  }
}

/** SystemState qua cache `sys:state` (TTL 60 giây, 3.7) */
function sysStateCached_() {
  var c = cache_().get('sys:state');
  if (c) return JSON.parse(c);
  var st = readState_().map;
  var small = {
    perm_version: st.perm_version || 1,
    login_paused_until: st.login_paused_until || '',
    mt_paused_until: st.mt_paused_until || '',
    last_reset_at: st.last_reset_at || '',
    last_restore_at: st.last_restore_at || '',
    restored_backup_at: st.restored_backup_at || '',
    schema_version: st.schema_version || ''
  };
  cache_().put('sys:state', JSON.stringify(small), 60);
  return small;
}

/** ScriptProperties không bí mật qua cache `sys:props` (TTL 30 giây) */
function sysProps_() {
  var c = cache_().get('sys:props');
  if (c) return JSON.parse(c);
  var props = {
    dataset_epoch: prop_('DATASET_EPOCH') || '',
    maintenance_mode: prop_('MAINTENANCE_MODE') === 'true',
    env: envName_()
  };
  cache_().put('sys:props', JSON.stringify(props), 30);
  return props;
}

/* ---------------- Settings ---------------- */

function parseSetting_(type, v) {
  if (type === 'INT' || type === 'NUMBER') return v === '' ? null : Number(v);
  if (type === 'BOOL') return String(v) === 'true' || String(v) === 'TRUE' || v === true;
  if (type === 'JSON') { try { return JSON.parse(String(v)); } catch (e) { return null; } }
  return String(v);
}

/** Settings: Sheet → cache 60 giây; thiếu khóa thì lấy mặc định */
function settings_() {
  if (DB_.settings) return DB_.settings;
  var c = cache_().get('cfg:settings');
  var map;
  if (c) {
    map = JSON.parse(c);
  } else {
    map = {};
    SETTINGS_DEFAULTS.forEach(function (d) { map[d[0]] = d[2]; });
    try {
      readRows_('Settings').forEach(function (r) { map[r.setting_key] = parseSetting_(r.value_type, r.value); });
    } catch (e) {
      // trước setup: dùng mặc định
    }
    cache_().put('cfg:settings', JSON.stringify(map), 60);
  }
  DB_.settings = map;
  return map;
}

function setting_(key) {
  var m = settings_();
  if (Object.prototype.hasOwnProperty.call(m, key)) return m[key];
  for (var i = 0; i < SETTINGS_DEFAULTS.length; i++) if (SETTINGS_DEFAULTS[i][0] === key) return SETTINGS_DEFAULTS[i][2];
  return null;
}

// ===== 04_i18n.js =====
/* 04_i18n: lời báo song ngữ cho mã kết quả (1.4 §16.2, phụ lục 1.5 mục 3.15, 5.3) */

var MSG = {
  OK: ['Thành công', '成功'],
  AUTH_REQUIRED: ['Cần đăng nhập lại', '需要重新登录'],
  AUTH_REQUIRED_REVOKED: ['Phiên đã bị thu hồi hoặc quyền đã thay đổi', '会话已撤销或权限已变更'],
  SESSION_EXPIRED: ['Phiên đăng nhập đã hết hạn', '登录会话已过期'],
  AUTH_FAILED: ['Mã nhân viên hoặc PIN không đúng', '工号或PIN错误'],
  PIN_LOCKED: ['Tạm khóa do nhập sai PIN nhiều lần, thử lại sau {n} phút', '因多次输错PIN已暂时锁定，请 {n} 分钟后重试'],
  LOGIN_PAUSED: ['Đăng nhập đang tạm dừng, thử lại sau {n} phút', '登录已暂停，请 {n} 分钟后重试'],
  ACCOUNT_DISABLED: ['Tài khoản đã bị khóa, liên hệ quản trị', '账户已被停用，请联系管理员'],
  MUST_CHANGE_PIN: ['Bạn đang dùng PIN tạm, hãy đặt PIN mới', '您正在使用临时PIN，请设置新PIN'],
  TEMP_PIN_EXPIRED: ['PIN tạm đã hết hạn, liên hệ quản trị để cấp lại', '临时PIN已过期，请联系管理员重新发放'],
  REAUTH_REQUIRED: ['Nhập lại PIN để tiếp tục', '请重新输入PIN以继续'],
  DATASET_RESET: ['Dữ liệu đã được đặt lại, cần tải lại', '数据已重置，需重新加载'],
  SYSTEM_MAINTENANCE: ['Hệ thống đang bảo trì', '系统维护中'],
  FORBIDDEN: ['Không có quyền', '无权限'],
  VALIDATION_ERROR: ['Dữ liệu chưa hợp lệ', '数据无效'],
  VERSION_CONFLICT: ['Xung đột, cần xử lý', '冲突，需处理'],
  DUPLICATE_OPERATION: ['Thao tác đã được ghi trước đó', '该操作此前已保存'],
  OPERATION_ID_REUSED: ['Mã thao tác bị dùng lại với nội dung khác', '操作编号被用于不同内容'],
  NOT_FOUND: ['Không tìm thấy', '未找到'],
  FEATURE_NOT_ENABLED: ['Chức năng chưa bật', '功能尚未启用'],
  CLIENT_UPDATE_REQUIRED: ['Cần cập nhật app, nháp vẫn được giữ', '需要更新应用，草稿仍会保留'],
  SERVER_BUSY: ['Máy chủ đang bận, thử lại sau ít giây', '服务器繁忙，请稍后重试'],
  QUOTA_EXCEEDED: ['Đã hết hạn mức của Google hôm nay', '今日谷歌配额已用尽'],
  INTERNAL_ERROR: ['Lỗi máy chủ', '服务器错误'],
  SYSTEM_NOT_READY: ['Máy chủ chưa được cài đặt', '服务器尚未初始化'],
  RECOVERY_REQUIRED: ['Thao tác ghi chưa hoàn tất, cần phục hồi', '写入未完成，需要恢复'],
  WAREHOUSE_NOT_CONNECTED: ['Chưa kết nối kho', '尚未连接仓库']
};

/** Lời báo cho mã con trong errors[] */
var SUB_MSG = {
  ID_INVALID: ['Mã định danh không hợp lệ', '标识无效'],
  ID_EXISTS: ['Mã định danh đã tồn tại', '标识已存在'],
  CODE_DUPLICATE: ['Mã đã được dùng', '编号已被使用'],
  CODE_INVALID: ['Mã chỉ gồm chữ hoa, số và . _ / -', '编号只能包含大写字母、数字及 . _ / -'],
  PIN_WEAK: ['PIN quá dễ đoán, hãy chọn PIN khác', 'PIN过于简单，请换一个'],
  PIN_FORMAT: ['PIN phải gồm đúng 6 chữ số', 'PIN必须为6位数字'],
  PIN_SAME: ['PIN mới phải khác PIN hiện tại', '新PIN不能与当前PIN相同'],
  REQUIRED: ['Bắt buộc nhập', '必填'],
  REQUIRED_ONE_LANGUAGE: ['Nhập ít nhất một thứ tiếng', '请至少填写一种语言'],
  INVALID_VALUE: ['Giá trị không hợp lệ', '值无效'],
  INVALID_DATE: ['Ngày không hợp lệ', '日期无效'],
  NOT_FOUND: ['Không tìm thấy hồ sơ liên quan', '未找到相关记录'],
  RENEWAL_NOTICE_AFTER_END: ['Hạn báo gia hạn phải trước hoặc bằng ngày hết hạn', '续约通知期限须早于或等于到期日'],
  COST_FIELD_FORBIDDEN: ['Không có quyền nhập giá', '无权填写价格'],
  SCOPE_NOT_SUPPORTED: ['Phạm vi khu vực chưa hỗ trợ', '暂不支持区域范围'],
  NEEDS_NETWORK: ['Cần kết nối mạng', '需要网络连接'],
  FILE_TOO_LARGE: ['Tệp quá lớn để mở trong app', '文件过大，无法在应用内打开'],
  FILE_TYPE: ['Loại tệp không được hỗ trợ', '不支持的文件类型'],
  WAREHOUSE_NOT_CONNECTED: ['Chưa kết nối kho: không nhận số tồn, giá kho', '尚未连接仓库：不接受库存和仓库价格'],
  NOT_COMPONENT: ['Vật tư này không gắn máy được', '该物料不可关联设备'],
  UNIT_NOT_ALLOWED: ['Đơn vị không thuộc danh sách cho phép', '单位不在允许范围内'],
  URL_INVALID: ['Liên kết phải bắt đầu bằng https://', '链接须以 https:// 开头'],
  SELF_ACTION: ['Không thao tác lên chính mình', '不能对自己执行此操作'],
  PERM_CEILING: ['Vượt trần quyền của cấp này', '超出该级别的权限上限'],
  PERM_LOCKED: ['Ô quyền này khóa, không sửa trong app', '该权限项已锁定，不能在应用中修改'],
  FORMULA: ['Ô có công thức — hãy chuyển thành giá trị', '单元格含公式——请改为数值'],
  VERSION_CONFLICT: ['Hồ sơ đã bị sửa sau khi xuất file — xuất lại rồi nhập', '导出后记录已被修改——请重新导出再导入'],
  SOURCE_CHANGED: ['Tệp đã đổi sau khi xem trước — chọn lại tệp để xem trước', '预览后文件已更改——请重新选择文件预览'],
  TEMPLATE_EPOCH: ['Mẫu thuộc thế hệ dữ liệu cũ — tải mẫu mới', '模板属于旧数据批次——请下载新模板'],
  TEMPLATE_MISMATCH: ['Tệp không đúng mẫu đã chọn', '文件与所选模板不符'],
  DEPENDENCY_FAILED: ['Dòng được tham chiếu bị lỗi nên dòng này không ghi', '所引用的行出错，本行未写入'],
  LAST_ADMIN: ['Phải còn ít nhất một tài khoản cấp 4 đang hoạt động', '必须保留至少一个启用的四级账号'],
  RESTRICTION_REQUIRED: ['Đạt có điều kiện cần ghi hạn chế', '有条件合格须填写限制条件']
};

function fmtMsg_(pair, vars) {
  if (!vars) return pair;
  return pair.map(function (s) {
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
  });
}

/** Lỗi API: ném ra ở mọi tầng, dispatcher đổi thành phản hồi */
function apiError_(code, data, errors, msgVars) {
  var e = new Error(code);
  e.apiCode = code;
  e.apiData = data || null;
  e.apiErrors = errors || [];
  e.msgVars = msgVars || null;
  return e;
}

/** Một dòng errors[] */
function fieldError_(field, subCode, row) {
  var m = SUB_MSG[subCode] || [subCode, subCode];
  return { row: row === undefined ? null : row, field: field || null, code: subCode, message_vi: m[0], message_zh: m[1] };
}

function validationError_(errs) {
  return apiError_('VALIDATION_ERROR', null, errs);
}

// ===== 05_lock.js =====
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

// ===== 06_auth.js =====
/* 06_auth: PIN, đăng nhập, token, phiên, hỏi lại PIN, đổi PIN
 * (phụ lục 1.5 mục 2.5, 3.5, 3.6, 3.7, 3.8) */

function pepperKey_() {
  var p = prop_('PIN_PEPPER_V1');
  if (!p) throw apiError_('SYSTEM_NOT_READY');
  return b64d_(p);
}

function tokenKey_() {
  var p = prop_('TOKEN_SECRET_V1');
  if (!p) throw apiError_('SYSTEM_NOT_READY');
  return b64d_(p);
}

/** pin_hash = Base64(HMAC-SHA256(key = pepper, message = salt ‖ PIN)) (3.5) */
function pinHash_(pin, saltBytes, keyBytes) {
  var msg = saltBytes.concat(utf8Bytes_(pin));
  return b64_(hmac256_(msg, keyBytes));
}

/** employee_code_hash = base64url(HMAC-SHA256(key, "emp:" + MÃ)) (3.5) */
function empHash_(code, keyBytes) {
  return b64url_(hmac256_(utf8Bytes_('emp:' + code), keyBytes || pepperKey_()));
}

function normEmpCode_(s) {
  return trimStr_(s).toUpperCase();
}

/** Lý do PIN yếu, hoặc null (3.5). */
function pinWeakReason_(pin, employeeCode, currentPin) {
  if (!/^\d{6}$/.test(String(pin))) return 'PIN_FORMAT';
  if (/^(\d)\1{5}$/.test(pin)) return 'PIN_WEAK';
  if ('0123456789'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0) return 'PIN_WEAK';
  var digits = String(employeeCode || '').replace(/\D/g, '');
  if (digits.length) {
    var last6 = digits.length >= 6 ? digits.slice(-6) : ('000000' + digits).slice(-6);
    if (pin === last6) return 'PIN_WEAK';
  }
  if (currentPin && pin === currentPin) return 'PIN_WEAK';
  return null;
}

/** Sinh PIN 6 số ngẫu nhiên không yếu (PIN tạm, 3.6) */
function randomPin_(employeeCode) {
  for (var i = 0; i < 50; i++) {
    var b = sha256_(Utilities.getUuid());
    var n = ((u8_(b[0]) << 16) | (u8_(b[1]) << 8) | u8_(b[2])) % 1000000;
    var pin = ('000000' + n).slice(-6);
    if (!pinWeakReason_(pin, employeeCode)) return pin;
  }
  throw new Error('Cannot generate PIN');
}

/** Salt và hash mới cho một PIN */
function newPinRecord_(pin) {
  var salt = randomBytes16_();
  return { salt: b64_(salt), pin_hash: pinHash_(pin, salt, pepperKey_()), pin_hash_version: 'HMAC256-v1' };
}

function verifyPinAgainst_(user, pin) {
  var key = pepperKey_();
  if (!user || !user.salt || !user.pin_hash) {
    pinHash_(pin, sha256_('fake-salt').slice(0, 16), key); // giữ thời gian tương đương
    return false;
  }
  return ctEqualStr_(pinHash_(pin, b64d_(user.salt), key), user.pin_hash);
}

/* ---------------- AuthAttempts ---------------- */

function logAttempt_(kind, outcome, empHash, user, req) {
  insertRows_('AuthAttempts', [{
    attempt_id: uuid_(), occurred_at: isoVN_(now_()), employee_code_hash: empHash || '',
    device_id: isUuidV4_(req.device_id) ? req.device_id : '', outcome: outcome, attempt_kind: kind,
    user_id: user ? user.user_id : ''
  }]);
}

/** Đếm lần sai LOGIN toàn hệ thống trong cửa sổ (đọc phần đuôi AuthAttempts) */
function countRecentGlobalFails_(windowMin) {
  var since = now_().getTime() - windowMin * 60000;
  var tail = readTail_('AuthAttempts', 600);
  var n = 0;
  for (var i = tail.length - 1; i >= 0; i--) {
    var t = parseTime_(tail[i].occurred_at);
    if (!t) continue;
    if (t.getTime() < since) break;
    if (tail[i].attempt_kind === 'LOGIN' && tail[i].outcome === 'FAILED') n++;
  }
  return n;
}

/**
 * Ghi một lần sai theo người (Users) hoặc theo mã không tồn tại (CacheService).
 * Trả {locked: bool, retry: giây}.
 */
function registerFailure_(user, empHash) {
  var lim = setting_('login_fail_limit'), win = setting_('login_fail_window_minutes'), lockMin = setting_('login_lock_minutes');
  var t = now_().getTime();
  if (user) {
    var ws = parseTime_(user.failed_window_started_at);
    var count;
    if (!ws || t - ws.getTime() > win * 60000) { count = 1; ws = new Date(t); } else { count = (user.failed_attempts || 0) + 1; }
    var upd = { failed_attempts: count, failed_window_started_at: isoVN_(ws) };
    var locked = false;
    if (count >= lim) {
      upd = { failed_attempts: 0, failed_window_started_at: '', locked_until: isoVN_(new Date(t + lockMin * 60000)) };
      locked = true;
    }
    writeCells_('Users', user.__row, upd);
    cache_().remove('us:' + user.user_id);
    return { locked: locked, retry: lockMin * 60 };
  }
  var c = cache_();
  var fc = c.get('fc:' + empHash);
  var st = fc ? JSON.parse(fc) : null;
  if (!st || t - st.ws > win * 60000) st = { n: 1, ws: t }; else st.n++;
  if (st.n >= lim) {
    c.put('lk:' + empHash, String(t + lockMin * 60000), lockMin * 60);
    c.remove('fc:' + empHash);
    return { locked: true, retry: lockMin * 60 };
  }
  c.put('fc:' + empHash, JSON.stringify(st), win * 60);
  return { locked: false, retry: 0 };
}

/** Thời gian còn khóa (giây) theo người hoặc theo mã không tồn tại; 0 nếu không khóa */
function lockedRemaining_(user, empHash) {
  var t = now_().getTime();
  if (user) {
    var lu = parseTime_(user.locked_until);
    return lu && lu.getTime() > t ? Math.ceil((lu.getTime() - t) / 1000) : 0;
  }
  var lk = cache_().get('lk:' + empHash);
  return lk && Number(lk) > t ? Math.ceil((Number(lk) - t) / 1000) : 0;
}

function lockedError_(retry) {
  return apiError_('PIN_LOCKED', { retry_after_seconds: retry }, null, { n: Math.max(1, Math.ceil(retry / 60)) });
}

/* ---------------- Token và Sessions ---------------- */

function signToken_(sid, exp) {
  return b64url_(hmac256_(utf8Bytes_('v1.' + sid + '.' + exp), tokenKey_()));
}

function tokenHash_(token) {
  return b64url_(sha256_(token));
}

function sessionSeconds_(kind) {
  if (kind === 'CHANGE_PIN') return setting_('change_pin_session_minutes') * 60;
  if (kind === 'RECOVERY') return 30 * 60;
  var testSec = isTestEnv_() ? Number(prop_('TEST_SESSION_SECONDS') || 0) : 0;
  if (testSec > 0) return testSec;
  return setting_('session_days') * 86400;
}

/** Tạo phiên mới (dưới khóa ghi). Trả {token, expires_at, session_id} */
function createSession_(user, kind, req) {
  var sid = uuid_();
  var exp = unixNow_() + sessionSeconds_(kind);
  var token = 'v1.' + sid + '.' + exp + '.' + signToken_(sid, exp);
  var nowIso = isoVN_(now_());
  var p = req.payload || {};
  insertRows_('Sessions', [{
    session_id: sid, token_hash: tokenHash_(token), user_id: user.user_id,
    device_id: isUuidV4_(req.device_id) ? req.device_id : '', issued_at: nowIso,
    expires_at: isoVN_(new Date(exp * 1000)), revoked_at: '', auth_version: user.auth_version || 0,
    dataset_epoch: sysProps_().dataset_epoch, app_id: APP_ID, origin_key: '', session_kind: kind,
    last_seen_at: nowIso, revoke_reason: '', device_label: trimStr_(p.device_label).slice(0, 60)
  }]);
  if (kind === 'FULL') enforceMaxSessions_(user.user_id);
  return { token: token, expires_at: isoVN_(new Date(exp * 1000)), session_id: sid };
}

function isSessionActive_(s, tMs) {
  if (s.revoked_at) return false;
  var e = parseTime_(s.expires_at);
  return !!e && e.getTime() > tMs;
}

function enforceMaxSessions_(userId) {
  var max = setting_('max_sessions_per_user');
  var t = now_().getTime();
  var act = findAll_('Sessions', 'user_id', userId).filter(function (s) {
    return s.session_kind === 'FULL' && isSessionActive_(s, t);
  });
  if (act.length <= max) return;
  act.sort(function (a, b) { return String(a.issued_at) < String(b.issued_at) ? -1 : 1; });
  act.slice(0, act.length - max).forEach(function (s) { revokeSessionRow_(s, 'LIMIT'); });
}

/** Thu hồi một phiên: ghi Sheet trước rồi mới ghi cache (3.7) */
function revokeSessionRow_(s, reason) {
  writeCells_('Sessions', s.__row, { revoked_at: isoVN_(now_()), revoke_reason: reason });
  cache_().put('rv:' + s.session_id, '1', 21600);
  cache_().remove('ss:' + s.session_id);
}

/** Tăng auth_version, thu hồi mọi phiên còn hiệu lực của người dùng (dưới khóa ghi) */
function bumpAuthVersion_(user, extraUserFields) {
  var oldV = user.auth_version || 0;
  var newV = oldV + 1;
  var upd = extraUserFields || {};
  upd.auth_version = newV;
  upd.updated_at = isoVN_(now_());
  writeCells_('Users', user.__row, upd);
  var t = now_().getTime();
  findAll_('Sessions', 'user_id', user.user_id).forEach(function (s) {
    if (isSessionActive_(s, t)) {
      writeCells_('Sessions', s.__row, { revoked_at: isoVN_(now_()), revoke_reason: 'AUTH_VERSION' });
      cache_().remove('ss:' + s.session_id);
    }
  });
  var c = cache_();
  c.put('av:' + user.user_id, String(newV), 21600);
  c.remove('us:' + user.user_id);
  c.remove('scope:' + user.user_id + ':' + oldV);
  user.auth_version = newV;
  return newV;
}

function publicUser_(u) {
  return {
    user_id: u.user_id, employee_code: u.employee_code, display_name: u.display_name,
    role_level: u.role_level, is_system_owner: !!u.is_system_owner
  };
}

/** Users không có pin_hash/salt, qua cache `us:` TTL 600 giây */
function userCached_(uid) {
  var c = cache_().get('us:' + uid);
  if (c) return JSON.parse(c);
  var u = findOne_('Users', 'user_id', uid);
  if (!u) return null;
  delete u.pin_hash; delete u.salt;
  cache_().put('us:' + uid, JSON.stringify(u), 600);
  return u;
}

/* ---------------- auth.login ---------------- */

function authLogin_(req) {
  var p = req.payload || {};
  var code = normEmpCode_(p.employee_code);
  var pin = String(p.pin === undefined || p.pin === null ? '' : p.pin);
  if (!code || code.length > 40) throw validationError_([fieldError_('employee_code', 'REQUIRED')]);
  if (!/^\d{6}$/.test(pin)) throw validationError_([fieldError_('pin', 'PIN_FORMAT')]);

  var key = pepperKey_();
  var eh = empHash_(code, key);
  var t = now_().getTime();

  // Tạm dừng toàn hệ thống: không kiểm PIN, không tính lượt
  var ss = sysStateCached_();
  var paused = parseTime_(ss.login_paused_until);
  if (paused && paused.getTime() > t) {
    var retryP = Math.ceil((paused.getTime() - t) / 1000);
    withWriteLock_(function () { logAttempt_('LOGIN', 'PAUSED', eh, null, req); });
    throw apiError_('LOGIN_PAUSED', { retry_after_seconds: retryP }, null, { n: Math.max(1, Math.ceil(retryP / 60)) });
  }

  var user = findOne_('Users', 'employee_code', code);
  var preLocked = lockedRemaining_(user, eh);
  if (preLocked > 0) {
    withWriteLock_(function () { logAttempt_('LOGIN', 'LOCKED', eh, user, req); });
    throw lockedError_(preLocked);
  }

  // HMAC ngoài khóa
  var okPin = verifyPinAgainst_(user, pin);

  return withWriteLock_(function () {
    if (user) {
      var pre = user;
      user = readRowAt_('Users', pre.__row);
      // PIN vừa bị đổi bởi request khác trong lúc tính HMAC: tính lại theo bản mới
      if (user.pin_hash !== pre.pin_hash || user.salt !== pre.salt) okPin = verifyPinAgainst_(user, pin);
    }
    var rem = lockedRemaining_(user, eh);
    if (rem > 0) {
      logAttempt_('LOGIN', 'LOCKED', eh, user, req);
      throw lockedError_(rem);
    }
    if (!okPin) {
      var f = registerFailure_(user, eh);
      logAttempt_('LOGIN', 'FAILED', eh, user, req);
      var gLim = setting_('login_global_fail_limit');
      if (countRecentGlobalFails_(setting_('login_global_window_minutes')) >= gLim) {
        var st = readState_();
        stateWrite_(st, { login_paused_until: ['DATETIME', isoVN_(new Date(t + setting_('login_global_pause_minutes') * 60000))] });
        cache_().remove('sys:state');
      }
      if (f.locked) throw lockedError_(f.retry);
      throw apiError_('AUTH_FAILED');
    }
    if (!user.active) {
      logAttempt_('LOGIN', 'DISABLED', eh, user, req);
      throw apiError_('ACCOUNT_DISABLED');
    }
    var upd = {};
    if (user.failed_attempts || user.failed_window_started_at || user.locked_until) {
      upd.failed_attempts = 0; upd.failed_window_started_at = ''; upd.locked_until = '';
    }
    if (user.must_change_pin) {
      var tExp = parseTime_(user.temp_pin_expires_at);
      if (!tExp || tExp.getTime() <= t) {
        if (Object.keys(upd).length) writeCells_('Users', user.__row, upd);
        logAttempt_('LOGIN', 'TEMP_PIN_EXPIRED', eh, user, req);
        throw apiError_('TEMP_PIN_EXPIRED');
      }
      if (Object.keys(upd).length) writeCells_('Users', user.__row, upd);
      var cs = createSession_(user, 'CHANGE_PIN', req);
      logAttempt_('LOGIN', 'MUST_CHANGE_PIN', eh, user, req);
      throw apiError_('MUST_CHANGE_PIN', { token: cs.token, expires_at: cs.expires_at, session_kind: 'CHANGE_PIN', user: publicUser_(user) });
    }
    upd.last_login_at = isoVN_(now_());
    writeCells_('Users', user.__row, upd);
    cache_().remove('us:' + user.user_id);
    var s = createSession_(user, 'FULL', req);
    logAttempt_('LOGIN', 'SUCCESS', eh, user, req);
    return { token: s.token, expires_at: s.expires_at, session_kind: 'FULL', user: publicUser_(user) };
  });
}

/* ---------------- Kiểm phiên ở mỗi request ---------------- */

function authRequired_(reason) {
  return apiError_('AUTH_REQUIRED', { reason: reason });
}

/** Các bước 1–7 của 3.7. Trả ctx {sid, session, user, req} */
function requireSession_(req, action) {
  var token = req.token;
  if (!token || typeof token !== 'string') throw authRequired_('INVALID');
  var parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !isUuidV4_(parts[1]) || !/^\d{1,12}$/.test(parts[2])) throw authRequired_('INVALID');
  var sid = parts[1], exp = Number(parts[2]);
  if (!ctEqualStr_(signToken_(sid, exp), parts[3])) throw authRequired_('INVALID');
  var nowSec = unixNow_();
  if (exp <= nowSec) throw apiError_('SESSION_EXPIRED');

  var c = cache_();
  var got = c.getAll(['ss:' + sid, 'rv:' + sid]);
  if (got['rv:' + sid]) throw authRequired_('REVOKED');
  var ss = got['ss:' + sid] ? JSON.parse(got['ss:' + sid]) : null;
  if (!ss) {
    var row = findOne_('Sessions', 'session_id', sid);
    if (!row) throw authRequired_('INVALID');
    ss = {
      row: row.__row, user_id: row.user_id, token_hash: row.token_hash, session_kind: row.session_kind,
      auth_version: row.auth_version || 0, dataset_epoch: row.dataset_epoch, revoked_at: row.revoked_at,
      revoke_reason: row.revoke_reason, last_seen_at: row.last_seen_at
    };
    c.put('ss:' + sid, JSON.stringify(ss), Math.max(1, Math.min(21600, exp - nowSec)));
  }
  if (!ctEqualStr_(ss.token_hash, tokenHash_(token))) throw authRequired_('INVALID');
  if (ss.revoked_at) throw authRequired_(ss.revoke_reason === 'AUTH_VERSION' ? 'AUTH_VERSION' : 'REVOKED');

  var u = userCached_(ss.user_id);
  if (!u || !u.active) throw authRequired_('REVOKED');
  var av = c.get('av:' + ss.user_id);
  if (Number(ss.auth_version) !== Number(u.auth_version || 0) || (av !== null && av !== undefined && Number(av) !== Number(ss.auth_version))) {
    throw authRequired_('AUTH_VERSION');
  }
  var props = sysProps_();
  if (ss.dataset_epoch !== props.dataset_epoch || req.dataset_epoch !== props.dataset_epoch) throw apiError_('DATASET_RESET');
  if (ss.session_kind === 'CHANGE_PIN' && action !== 'pin.change' && action !== 'auth.logout') {
    throw apiError_('MUST_CHANGE_PIN');
  }
  // last_seen_at tối đa 1 lần/60 phút
  var ls = parseTime_(ss.last_seen_at);
  if (!ls || nowSec * 1000 - ls.getTime() > 3600000) {
    try {
      var nowIso = isoVN_(now_());
      // Số dòng trong cache có thể đã lệch nếu trigger xóa bớt dòng Sessions: kiểm lại trước khi ghi
      var rn = ss.row;
      if (!rn || sh_('Sessions').getRange(rn, 1).getValue() !== sid) rn = (findOne_('Sessions', 'session_id', sid) || {}).__row;
      if (rn) { writeCells_('Sessions', rn, { last_seen_at: nowIso }); ss.row = rn; }
      ss.last_seen_at = nowIso;
      c.put('ss:' + sid, JSON.stringify(ss), Math.max(1, Math.min(21600, exp - nowSec)));
    } catch (e) { /* không chặn request */ }
  }
  return { sid: sid, session: ss, user: u, req: req, token: token };
}

/* ---------------- auth.reauth ---------------- */

function signReauth_(payloadB64) {
  return b64url_(hmac256_(utf8Bytes_('r1.' + payloadB64), tokenKey_()));
}

function makeReauthToken_(ctx) {
  var exp = unixNow_() + setting_('reauth_window_minutes') * 60;
  var payload = b64url_(utf8Bytes_(JSON.stringify({
    session_id: ctx.sid, user_id: ctx.user.user_id, auth_version: ctx.user.auth_version || 0, exp: exp
  })));
  return { reauth_token: 'r1.' + payload + '.' + signReauth_(payload), expires_at: isoVN_(new Date(exp * 1000)) };
}

function verifyReauth_(ctx, rt) {
  if (!rt || typeof rt !== 'string') return false;
  var parts = rt.split('.');
  if (parts.length !== 3 || parts[0] !== 'r1') return false;
  if (!ctEqualStr_(signReauth_(parts[1]), parts[2])) return false;
  var p;
  try { p = JSON.parse(Utilities.newBlob(b64urlDecode_(parts[1])).getDataAsString()); } catch (e) { return false; }
  return p.exp > unixNow_() && p.session_id === ctx.sid && p.user_id === ctx.user.user_id &&
    Number(p.auth_version) === Number(ctx.user.auth_version || 0);
}

/**
 * Kiểm PIN của người đang có phiên (reauth, đổi PIN): chung bộ đếm theo người.
 * HMAC tính ngoài khóa; trong khóa đọc lại dòng, kiểm khóa lần nữa và tính lại nếu PIN vừa đổi.
 * PIN đúng → onOk(user mới đọc, empHash) chạy trong cùng khóa.
 */
function checkOwnPin_(ctx, pin, kind, onOk) {
  pin = String(pin === undefined || pin === null ? '' : pin);
  if (!/^\d{6}$/.test(pin)) throw validationError_([fieldError_(kind === 'CHANGE_PIN' ? 'current_pin' : 'pin', 'PIN_FORMAT')]);
  var pre = findOne_('Users', 'user_id', ctx.user.user_id);
  var rem0 = lockedRemaining_(pre, null);
  if (rem0 > 0) throw lockedError_(rem0);
  var ok = verifyPinAgainst_(pre, pin);
  var eh = empHash_(pre.employee_code);
  return withWriteLock_(function () {
    var u = readRowAt_('Users', pre.__row);
    var rem = lockedRemaining_(u, null);
    if (rem > 0) throw lockedError_(rem);
    if (u.pin_hash !== pre.pin_hash || u.salt !== pre.salt) ok = verifyPinAgainst_(u, pin);
    if (!ok) {
      var f = registerFailure_(u, eh);
      logAttempt_(kind, 'FAILED', eh, u, ctx.req);
      if (f.locked) throw lockedError_(f.retry);
      throw apiError_('AUTH_FAILED');
    }
    return onOk(u, eh);
  });
}

function authReauth_(ctx) {
  checkOwnPin_(ctx, (ctx.req.payload || {}).pin, 'REAUTH', function (u, eh) {
    if (u.failed_attempts || u.failed_window_started_at) {
      writeCells_('Users', u.__row, { failed_attempts: 0, failed_window_started_at: '' });
      cache_().remove('us:' + u.user_id);
    }
    logAttempt_('REAUTH', 'SUCCESS', eh, u, ctx.req);
  });
  return makeReauthToken_(ctx);
}

/* ---------------- pin.change ---------------- */

function pinChange_(ctx) {
  var p = ctx.req.payload || {};
  var cur = String(p.current_pin || ''), nw = String(p.new_pin || '');
  var rec = /^\d{6}$/.test(nw) ? newPinRecord_(nw) : null; // HMAC ngoài khóa
  return checkOwnPin_(ctx, cur, 'CHANGE_PIN', function (u, eh) {
    var weak = pinWeakReason_(nw, u.employee_code, cur);
    if (weak) throw validationError_([fieldError_('new_pin', weak)]);
    var nowIso = isoVN_(now_());
    bumpAuthVersion_(u, {
      pin_hash: rec.pin_hash, salt: rec.salt, pin_hash_version: rec.pin_hash_version, must_change_pin: false,
      temp_pin_expires_at: '', pin_changed_at: nowIso, failed_attempts: 0, failed_window_started_at: '', locked_until: ''
    });
    logAttempt_('CHANGE_PIN', 'SUCCESS', eh, u, ctx.req);
    writeAudit_({
      user_id: u.user_id, device_id: ctx.req.device_id, action: 'pin.change', entity_type: 'USER', entity_id: u.user_id,
      before_json: null, after_json: { pin_changed_at: nowIso }, operation_id: '', auth_basis: 'ROLE_LEVEL'
    });
    var s = createSession_(u, 'FULL', ctx.req);
    return { token: s.token, expires_at: s.expires_at, session_kind: 'FULL', user: publicUser_(u) };
  });
}

/* ---------------- logout ---------------- */

function authLogout_(ctx) {
  withWriteLock_(function () {
    var row = findOne_('Sessions', 'session_id', ctx.sid);
    if (row && !row.revoked_at) revokeSessionRow_(row, 'LOGOUT');
  });
  return { logged_out: true };
}

function authLogoutAll_(ctx) {
  withWriteLock_(function () {
    var u = findOne_('Users', 'user_id', ctx.user.user_id);
    bumpAuthVersion_(u, {});
    writeAudit_({
      user_id: u.user_id, device_id: ctx.req.device_id, action: 'auth.logoutAll', entity_type: 'USER', entity_id: u.user_id,
      before_json: null, after_json: { auth_version: u.auth_version }, operation_id: ctx.req.operation_id || '', auth_basis: 'ROLE_LEVEL'
    });
  });
  return { logged_out_all: true };
}

function accountView_(ctx) {
  var u = ctx.user;
  var scopes = userScopes_(u).map(function (s) { return s.subrole; });
  return {
    user: publicUser_(u), subroles: scopes, session_kind: ctx.session.session_kind,
    last_login_at: u.last_login_at, pin_changed_at: u.pin_changed_at
  };
}

/* ---------------- Phiên của chính mình (4.4.14) ---------------- */

/** session.listOwn: các phiên FULL còn hiệu lực của người gọi; không trả token_hash */
function sessionListOwn_(ctx) {
  var t = now_().getTime();
  var items = findAll_('Sessions', 'user_id', ctx.user.user_id).filter(function (s) {
    return s.session_kind === 'FULL' && isSessionActive_(s, t);
  }).map(function (s) {
    return {
      session_id: s.session_id, device_label: s.device_label, issued_at: s.issued_at, last_seen_at: s.last_seen_at,
      expires_at: s.expires_at, current: s.session_id === ctx.sid
    };
  });
  items.sort(function (a, b) { return String(b.issued_at).localeCompare(String(a.issued_at)); });
  return { items: items };
}

/** session.revokeOwn {session_id}: thu hồi một phiên khác của chính mình (máy này dùng Đăng xuất) */
function sessionRevokeOwn_(ctx) {
  var id = (ctx.req.payload || {}).session_id;
  if (!isUuidV4_(id)) throw validationError_([fieldError_('session_id', 'ID_INVALID')]);
  return withWriteLock_(function () {
    var s = findOne_('Sessions', 'session_id', id);
    if (!s || s.user_id !== ctx.user.user_id) throw apiError_('NOT_FOUND');
    if (!s.revoked_at) {
      revokeSessionRow_(s, 'LOGOUT');
      writeAudit_({
        user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'session.revokeOwn', entity_type: 'SESSION', entity_id: id,
        before_json: null, after_json: { revoked: true }, operation_id: '', auth_basis: 'ROLE_LEVEL'
      });
    }
    return { revoked: true, session_id: id };
  });
}

/* ---------------- Danh sách người (chọn người phụ trách, hiện tên) ---------------- */

/** Bản đồ user_id → {employee_code, display_name, active} qua cache 10 phút (không có PIN, email).
 *  Thao tác sửa người dùng phải remove('users:dir'). */
function userDirectory_() {
  if (DB_.userDir) return DB_.userDir;
  var c = cache_().get('users:dir');
  var m;
  if (c) {
    m = JSON.parse(c);
  } else {
    m = {};
    readRows_('Users').forEach(function (u) { m[u.user_id] = { employee_code: u.employee_code, display_name: u.display_name, active: !!u.active }; });
    try { cache_().put('users:dir', JSON.stringify(m), 600); } catch (e) { /* quá cỡ cache: đọc lại lần sau */ }
  }
  DB_.userDir = m;
  return m;
}

var NAME_FIELDS_ = { owner_user_id: 'owner_name', updated_by: 'updated_by_name', submitted_by: 'submitted_by_name', approved_by: 'approved_by_name', created_by: 'created_by_name' };

/** Tên hiển thị của người phụ trách/người sửa gắn vào bản ghi gửi client */
function annotateNames_(o) {
  if (!o) return o;
  var dir = null;
  Object.keys(NAME_FIELDS_).forEach(function (f) {
    if (!o[f] || o[f] === SYSTEM_USER) return;
    if (!dir) dir = userDirectory_();
    var u = dir[o[f]];
    if (u) o[NAME_FIELDS_[f]] = u.display_name;
  });
  return o;
}

/** user.pickList: chỉ user_id, mã, tên hiển thị của người đang hoạt động */
function userPickList_() {
  var dir = userDirectory_();
  var items = Object.keys(dir).filter(function (id) { return dir[id].active; }).map(function (id) {
    return { user_id: id, employee_code: dir[id].employee_code, display_name: dir[id].display_name };
  });
  items.sort(function (a, b) { return String(a.employee_code).localeCompare(String(b.employee_code)); });
  return { items: items };
}

// ===== 07_perm.js =====
/* 07_perm: ACTION_REGISTRY, RolePermissions, tính quyền (phụ lục 1.5 mục 4) */

/*
 * Mỗi dòng: mã | module | cờ | ô C1 KT ĐN HĐ TK BS C3 C4 | mạng | đợt | R/W
 *  - module: tên module; '*' = theo hồ sơ (tài liệu, QR, nhập/xuất, dịch); '*work' = theo work_type;
 *    'contracts|inspections' = một trong hai.
 *  - cờ: V C E A I X $ R; 'C/E' = một trong hai (thao tác quyết định); 'I+A' = cả hai; '-' = không qua RolePermissions.
 *  - ô: Y được · N không · OWN của mình · ASG được giao · MC module chính · IFON nếu bật ·
 *       NS được nhưng không tự duyệt · OWNER chỉ owner · REC theo hồ sơ · SPEC quy tắc riêng trong thao tác.
 *  - mạng: cache · net · offline · pin · public (không cần phiên) · session (chỉ cần phiên) · internal.
 *  - đợt: 1–4; H = hoãn/chờ chốt; POC = chỉ ở môi trường THỬ khi chạy PoC.
 */
var ACTION_TABLE_ = [
  // 4.4.1 Thiết bị
  'equipment.view|equipment|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'equipment.create|equipment|C|N N N N N N Y Y|net|1|W',
  'equipment.edit|equipment|E|N N N N N N Y Y|net|1|W',
  'equipment.archive|equipment|E|N N N N N N Y Y|net|1|W',
  'equipment.unarchive|equipment|E|N N N N N N Y Y|net|1|W',
  'equipment.spec.edit|equipment|E|N N N N N N Y Y|net|1|W',
  // 4.4.2 Vật tư, linh kiện theo máy
  'material.view|warehouse|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'material.create|warehouse|C|N N N N IFON N Y Y|net|1|W',
  'material.edit|warehouse|E|N N N N IFON N Y Y|net|1|W',
  'material.archive|warehouse|E|N N N N N N Y Y|net|1|W',
  'part.link|equipment|E|N Y N N N N Y Y|net|1|W',
  'part.unlink|equipment|E|N OWN N N N N Y Y|net|1|W',
  'part.approve|equipment|A|N N N N N N NS NS|pin|1|W',
  'part.replace|equipment|E|N ASG N N N N Y Y|offline|2|W',
  // 4.4.3 Bảo trì
  'maintenance.view|maintenance|V|Y Y Y Y Y Y Y Y|cache|2|R',
  'maintenance.plan.edit|maintenance|C/E|N N N N N N Y Y|net|2|W',
  'maintenance.checklist.edit|maintenance|E|N N N N N N Y Y|net|2|W',
  'maintenance.wo.create|maintenance|C|N Y N N N N Y Y|offline|2|W',
  'maintenance.assign|maintenance|E|N N N N N N Y Y|net|2|W',
  'maintenance.execute|maintenance|E|N ASG N N N N Y Y|offline|2|W',
  'maintenance.submit|maintenance|E|N ASG N N N N Y Y|offline|2|W',
  'maintenance.accept|maintenance|A|N N N N N N NS NS|pin|2|W',
  'maintenance.cancel|maintenance|E|N OWN N N N N Y Y|net|2|W',
  // 4.4.4 Sửa chữa
  'repair.view|repairs|V|Y Y Y Y Y Y Y Y|cache|2|R',
  'repair.report|repairs|C|N Y Y Y Y Y Y Y|offline|2|W',
  'repair.editReport|repairs|E|N OWN OWN OWN OWN OWN Y Y|offline|2|W',
  'repair.assign|repairs|E|N N N N N N Y Y|net|2|W',
  'repair.process|repairs|E|N ASG N N N N Y Y|offline|2|W',
  'repair.submit|repairs|E|N ASG N N N N Y Y|offline|2|W',
  'repair.accept|repairs|A|N N N N N N NS NS|pin|2|W',
  'repair.cancel|repairs|E|N OWN OWN OWN OWN OWN Y Y|net|2|W',
  'repair.reopen|repairs|A|N N N N N N Y Y|pin|2|W',
  // 4.4.5 Đề nghị và lượng dùng vật tư
  'matreq.create|*work|C|N ASG N N N N Y Y|offline|2|W',
  'matreq.submit|*work|E|N OWN N N N N Y Y|offline|2|W',
  'matreq.approve|*work|A|N N N N N N NS NS|pin|2|W',
  'matreq.cancel|*work|E|N OWN N N N N Y Y|net|2|W',
  'usage.record|*work|C|N ASG N N N N Y Y|offline|2|W',
  'usage.confirm|*work|A|N N N N N N NS NS|pin|2|W',
  'work.cost.edit|*work|E+$|N N N N N N Y Y|net|2|W',
  // 4.4.6 Điện nước
  'utility.view|utilities|V|Y Y Y Y Y Y Y Y|cache|3|R',
  'meter.edit|utilities|C/E|N N N N N N Y Y|net|3|W',
  'reading.create|utilities|C|N N Y N N N Y Y|offline|3|W',
  'reading.editOwn|utilities|E|N N OWN N N N Y Y|net|3|W',
  'reading.editOthers|utilities|E|N N N N N N Y Y|net|3|W',
  'meter.event.create|utilities|C|N Y Y N N N Y Y|net|3|W',
  'meter.event.approve|utilities|A|N N N N N N NS NS|pin|3|W',
  'tariff.view|utilities|$|N N IFON N N N Y Y|cache|3|R',
  'tariff.edit|utilities|E+$|N N N N N N Y Y|net|3|W',
  'tariff.approve|utilities|A+$|N N N N N N NS NS|pin|3|W',
  // 4.4.7 Lộ điện
  'circuit.view|circuits|V|Y Y Y Y Y Y Y Y|cache|3|R',
  'circuit.edit|circuits|C/E|N N N N N N Y Y|net|3|W',
  'circuit.verify|circuits|A|N N N N N N NS NS|pin|3|W',
  'circuit.drawing.upload|circuits|C|N Y N N N N Y Y|net|3|W',
  'circuit.drawing.approve|circuits|A|N N N N N N NS NS|pin|3|W',
  // 4.4.8 Hợp đồng
  'contract.view|contracts|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'contract.create|contracts|C|N N N Y N N Y Y|net|1|W',
  'contract.edit|contracts|E|N N N Y N N Y Y|net|1|W',
  'contract.editTerms|contracts|A|N N N N N N NS NS|pin|1|W',
  'contract.archive|contracts|E|N N N N N N Y Y|net|1|W',
  'contract.close|contracts|A|N N N N N N Y Y|pin|1|W',
  'contract.renewal.create|contracts|C|N N N Y N N Y Y|net|1|W',
  'contract.renewal.submit|contracts|C|N N N Y N N Y Y|net|1|W',
  'contract.renewal.approve|contracts|A|N N N N N N NS NS|pin|1|W',
  'contract.service.record|contracts|C/E|N Y N Y N N Y Y|offline|1|W',
  'contract.service.accept|contracts|A|N N N N N N NS NS|pin|1|W',
  // 4.4.9 Kiểm định
  'inspection.view|inspections|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'inspection.type.edit|inspections|E|N N N N N N Y Y|net|1|W',
  'inspection.requirement.edit|inspections|C/E|N N N Y N N Y Y|net|1|W',
  'inspection.submit|inspections|C|N N N Y N N Y Y|offline|1|W',
  'inspection.approve|inspections|A|N N N N N N NS NS|pin|1|W',
  'inspection.revoke|inspections|A|N N N N N N Y Y|pin|1|W',
  'inspection.schedule|inspections|E|N N N Y N N Y Y|net|H|W',
  // 4.4.10 Báo cáo
  'report.run|reports|V|Y Y Y Y Y Y Y Y|net|3|R',
  'report.view|reports|V|Y Y Y Y Y Y Y Y|net|3|R',
  'report.save|reports|X|IFON IFON IFON IFON IFON N Y Y|net|3|W',
  'report.export|reports|X|IFON IFON IFON IFON IFON N Y Y|net|3|R',
  'report.definition.edit|reports|E|N N N N N N N Y|net|3|W',
  // 4.4.11 Nhập/xuất, QR
  'import.template|*|I|N MC MC MC MC N Y Y|net|1|R',
  'import.preview|*|I|N MC MC MC MC N Y Y|net|1|W',
  'import.errors|*|I|N MC MC MC MC N Y Y|net|1|R',
  'import.submit|*|I|N MC MC MC MC N Y Y|net|1|W',
  'import.commit|*|I+A|N N N N N N Y Y|pin|1|W',
  'import.cancel|*|I|N OWN OWN OWN OWN N Y Y|net|1|W',
  'export.xlsx|*|X|IFON IFON IFON IFON IFON N Y Y|net|1|R',
  'export.pdf|*|X|IFON IFON IFON IFON IFON N Y Y|net|3|R',
  'qr.resolve|*|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'qr.view|*|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'qr.print|*|V|N MC MC MC MC N Y Y|net|1|R',
  // 4.4.12 Tài liệu và ảnh
  'doc.view|*|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'doc.thumbs|*|V|Y Y Y Y Y Y Y Y|net|1|R',
  'doc.download|*|V|Y Y Y Y Y Y Y Y|net|1|R',
  'doc.upload|*|C|N SPEC SPEC MC IFON OWN Y Y|offline|1|W',
  'doc.setPrivate|*|E|N OWN OWN OWN OWN OWN Y Y|net|1|W',
  'doc.archive|*|E|N OWN OWN OWN OWN OWN Y Y|net|1|W',
  // 4.4.13 Danh mục chung
  'catalog.view|catalog|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'location.edit|catalog|E|N N N N N N N Y|net|1|W',
  'vendor.edit|catalog|C/E|N N N Y N N Y Y|net|1|W',
  'lookup.edit|catalog|E|N N N N N N Y Y|net|1|W',
  'glossary.edit|catalog|E|N N N N N N Y Y|net|1|W',
  // 4.4.14 Tài khoản và người dùng
  'auth.login|-|-|Y Y Y Y Y Y Y Y|public|1|R',
  'auth.reauth|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'auth.logout|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'account.view|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'pin.change|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'session.listOwn|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'session.revokeOwn|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'auth.logoutAll|-|-|Y Y Y Y Y Y Y Y|pin|1|R',
  'user.pickList|-|-|N N N Y N N Y Y|net|1|R',
  'user.view|users|V|N N N N N N Y Y|net|1|R',
  'user.create|users|C|N N N N N N N Y|pin|1|W',
  'user.setRole|users|E|N N N N N N N Y|pin|1|W',
  'user.lock|users|E|N N N N N N N Y|pin|1|W',
  'user.unlock|users|E|N N N N N N N Y|pin|1|W',
  'user.resetPin|users|E|N N N N N N N Y|pin|1|W',
  'user.revokeSessions|users|E|N N N N N N N Y|pin|1|W',
  // 4.4.15 Nhắc hạn và Gmail
  'alert.view|contracts|inspections|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'alert.acknowledge|contracts|inspections|E|N N N Y N N Y Y|net|1|W',
  'notify.log.view|notifications|V|N N N N N N Y Y|net|1|R',
  'notify.recipient.edit|notifications|E|N N N N N N N Y|pin|1|W',
  'notify.settings.edit|notifications|E|N N N N N N N Y|pin|1|W',
  'notify.resend|notifications|E|N N N N N N N Y|pin|1|W',
  // 4.4.16 Nhật ký, sao lưu, cấu hình, xóa sạch
  'audit.own|-|-|Y Y Y Y Y Y Y Y|cache|1|R',
  'audit.view|audit|V|N N N N N N Y Y|net|1|R',
  'audit.auth|audit|V|N N N N N N N Y|pin|1|R',
  'backup.view|backup|V|N N N N N N N Y|net|1|R',
  'backup.run|backup|E|N N N N N N N Y|pin|1|W',
  'settings.edit|system|E|N N N N N N N Y|pin|1|W',
  'permission.view|system|V|N N N N N N N Y|pin|1|R',
  'permission.edit|system|E|N N N N N N N Y|pin|1|W',
  // Bổ sung kỹ thuật: màn Trạng thái hệ thống đọc healthCheck + Settings (5.2)
  'system.status|system|V|N N N N N N N Y|net|1|R',
  'system.reset.preview|system|R|N N N N N N N OWNER|pin|4|R',
  'system.reset.request|system|R|N N N N N N N OWNER|pin|4|W',
  'system.reset.status|system|R|N N N N N N N OWNER|pin|4|R',
  'system.reset.resume|system|R|N N N N N N N OWNER|pin|4|W',
  'system.restore.preview|system|R|N N N N N N N OWNER|pin|H|R',
  'system.restore.request|system|R|N N N N N N N OWNER|pin|H|W',
  // 4.4.17 Hệ thống, đồng bộ, dịch
  'system.health|-|-|Y Y Y Y Y Y Y Y|public|1|R',
  'system.getPublicState|-|-|Y Y Y Y Y Y Y Y|public|1|R',
  'sync.bootstrap|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'sync.changes|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'sync.push|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'sync.getOperationStatus|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'i18n.suggest|*|C/E|N REC REC REC REC REC REC REC|net|1|R',
  'i18n.retranslate|*|E|N REC REC REC REC REC REC REC|net|1|W',
  'i18n.machineTranslate|-|-|N N N N N N N N|internal|1|W',
  // PoC (chỉ môi trường THỬ, gỡ sau PoC)
  'poc.vectors|-|-|Y Y Y Y Y Y Y Y|session|POC|R',
  'poc.echo|-|-|Y Y Y Y Y Y Y Y|session|POC|R',
  'poc.sleep|-|-|Y Y Y Y Y Y Y Y|session|POC|W',
  'poc.stats|-|-|Y Y Y Y Y Y Y Y|session|POC|R',
  'poc.mail|-|-|N N N N N N N Y|session|POC|R',
  'poc.translate|-|-|N N N N N N N Y|session|POC|R',
  'poc.makeTestFiles|-|-|N N N N N N N Y|session|POC|R',
  'poc.driveChecks|-|-|N N N N N N N Y|session|POC|R',
  'poc.triggers|-|-|N N N N N N N Y|session|POC|R'
];

var ACTION_REGISTRY = (function () {
  var reg = {};
  ACTION_TABLE_.forEach(function (line) {
    var p = line.split('|');
    // module có thể chứa '|' (contracts|inspections): 7 hoặc 8 phần
    var code = p[0], module, rest;
    if (p.length === 8) { module = p[1] + '|' + p[2]; rest = p.slice(3); } else { module = p[1]; rest = p.slice(2); }
    var flagStr = rest[0];
    var flags = [], flagMode = 'all';
    if (flagStr !== '-') {
      if (flagStr.indexOf('/') >= 0) { flags = flagStr.split('/'); flagMode = 'any'; }
      else flags = flagStr.split('+');
    }
    var dot = rest[3];
    reg[code] = {
      code: code, module: module, flags: flags, flagMode: flagMode, cells: rest[1].split(' '),
      net: rest[2], dot: dot === 'H' || dot === 'POC' ? dot : Number(dot), write: rest[4] === 'W'
    };
  });
  return reg;
})();

var FLAG_COL_ = { V: 'can_view', C: 'can_create', E: 'can_edit', A: 'can_approve', I: 'can_import', X: 'can_export', $: 'can_view_cost', R: 'can_reset_system' };

var BUSINESS_MODULES_ = ['equipment', 'maintenance', 'repairs', 'warehouse', 'utilities', 'reports', 'circuits', 'contracts', 'inspections', 'catalog'];

/** Ma trận mặc định 4.8: [C1, C2, C3, C4] */
var ROLE_DEFAULTS_ = {
  equipment: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  warehouse: ['V', 'VI', 'VCEAIX$', 'VCEAIX$'],
  maintenance: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  repairs: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  utilities: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  circuits: ['V', 'VCI', 'VCEAIX', 'VCEAIX'],
  contracts: ['V', 'VCEI$', 'VCEAIX$', 'VCEAIX$'],
  inspections: ['V', 'VCEI$', 'VCEAIX$', 'VCEAIX$'],
  reports: ['V', 'V', 'VX', 'VEX'],
  catalog: ['V', 'VCE', 'VCEIX', 'VCEIX'],
  users: ['', '', 'V', 'VCEA'],
  notifications: ['', '', 'V', 'VE'],
  audit: ['', '', 'V', 'V'],
  backup: ['', '', '', 'VE'],
  system: ['', '', '', 'VER']
};

/** Trần quyền 4.8 */
function roleCeiling_(level, module) {
  var biz = BUSINESS_MODULES_.indexOf(module) >= 0;
  if (level === 1) return biz ? 'VX$' : '';
  if (level === 2) return biz ? 'VCEIX$' : '';
  if (level === 3) return biz ? 'VCEAIX$' : ({ users: 'V', notifications: 'V', audit: 'V' }[module] || '');
  if (level === 4) return biz ? 'VCEAIX$' : ({ users: 'VCEA', notifications: 'VE', audit: 'V', backup: 'VE', system: 'VER' }[module] || '');
  return '';
}

/** 60 dòng mặc định RolePermissions */
function defaultRolePermissionRows_() {
  var rows = [];
  [1, 2, 3, 4].forEach(function (lvl) {
    PERM_MODULES.forEach(function (m) {
      var f = ROLE_DEFAULTS_[m][lvl - 1];
      var r = { permission_id: 'RP-' + lvl + '-' + m, role_level: lvl, module: m };
      Object.keys(FLAG_COL_).forEach(function (k) { r[FLAG_COL_[k]] = f.indexOf(k) >= 0; });
      rows.push(r);
    });
  });
  return rows;
}

/** RolePermissions qua cache perm:<perm_version>, kẹp theo trần */
function rolePerms_() {
  if (DB_.rolePerms) return DB_.rolePerms;
  var pv = sysStateCached_().perm_version || 1;
  var ck = 'perm:' + pv;
  var c = cache_().get(ck);
  var map;
  if (c) {
    map = JSON.parse(c);
  } else {
    map = {};
    readRows_('RolePermissions').forEach(function (r) {
      var ceil = roleCeiling_(Number(r.role_level), r.module);
      var flags = '';
      Object.keys(FLAG_COL_).forEach(function (k) { if (r[FLAG_COL_[k]] && ceil.indexOf(k) >= 0) flags += k; });
      if (r.module === 'system' && Number(r.role_level) === 4) {
        // R cố định theo dòng đã nạp; không sửa được trong app
        if (r.can_reset_system && flags.indexOf('R') < 0) flags += 'R';
      }
      map[r.role_level + '|' + r.module] = flags;
    });
    cache_().put(ck, JSON.stringify(map), 21600);
  }
  DB_.rolePerms = map;
  return map;
}

function hasFlag_(level, module, flag) {
  var f = rolePerms_()[level + '|' + module];
  return typeof f === 'string' && f.indexOf(flag) >= 0;
}

/** Subrole active của người dùng cấp 2, qua cache scope:<uid>:<auth_version> */
function userScopes_(u) {
  if (Number(u.role_level) !== 2) return [];
  var ck = 'scope:' + u.user_id + ':' + (u.auth_version || 0);
  var c = cache_().get(ck);
  if (c) return JSON.parse(c);
  var list = findAll_('UserScopes', 'user_id', u.user_id).filter(function (s) {
    return s.active && SUBROLES[s.subrole] && !s.location_id && !s.module;
  }).map(function (s) { return { subrole: s.subrole }; });
  cache_().put(ck, JSON.stringify(list), 21600);
  return list;
}

function ctxSubroles_(ctx) {
  if (!ctx.subroles) ctx.subroles = userScopes_(ctx.user).map(function (s) { return s.subrole; });
  return ctx.subroles;
}

var CELL_INDEX_ = { 1: 0, KY_THUAT: 1, DOC_DIEN_NUOC: 2, HD_KD: 3, THU_KHO: 4, BAO_SU_CO: 5, 3: 6, 4: 7 };

/** Ô của một action với người dùng: {allowed, conds[], ns} — bước 5 (4.2) */
function evalCells_(ctx, def, module) {
  var lvl = Number(ctx.user.role_level);
  var cellsToCheck = [];
  if (lvl === 2) {
    // Cấp 2 = quyền cấp 1 cộng quyền theo subrole (4.1)
    cellsToCheck.push({ cell: def.cells[0], sub: null });
    ctxSubroles_(ctx).forEach(function (s) { cellsToCheck.push({ cell: def.cells[CELL_INDEX_[s]], sub: s }); });
  } else if (CELL_INDEX_[lvl] !== undefined) {
    cellsToCheck.push({ cell: def.cells[CELL_INDEX_[lvl]], sub: null });
  }
  var uncond = false, conds = [], ns = false;
  cellsToCheck.forEach(function (x) {
    var c = x.cell;
    if (c === 'Y') uncond = true;
    else if (c === 'NS') { uncond = true; ns = true; }
    else if (c === 'MC' || c === 'IFON') {
      if (lvl !== 2 || !x.sub || (module && SUBROLES[x.sub].indexOf(module) >= 0)) uncond = true;
    } else if (c === 'OWNER') {
      if (ctx.user.is_system_owner && hasFlag_(4, 'system', 'R')) uncond = true;
    } else if (c === 'OWN' || c === 'ASG' || c === 'REC' || c === 'SPEC') {
      conds.push(x.sub ? c + ':' + x.sub : c);
    }
  });
  if (uncond) return { allowed: true, conds: [], ns: ns };
  return { allowed: conds.length > 0, conds: conds, ns: ns };
}

function resolveModule_(def, target) {
  if (def.module === '*' || def.module === '*work') return target && target.module ? target.module : null;
  if (def.module === 'contracts|inspections') return target && target.module ? target.module : 'contracts';
  if (def.module === '-') return null;
  return def.module;
}

/**
 * Bước 4–5 của 4.2. Ném FORBIDDEN nếu không được.
 * Trả {module, conds, ns}. Điều kiện hồ sơ (bước 6), không tự duyệt (bước 7) do thao tác kiểm tiếp.
 */
function authorize_(ctx, code, target) {
  var def = ACTION_REGISTRY[code];
  if (!def) throw apiError_('FORBIDDEN');
  var module = resolveModule_(def, target);
  var lvl = Number(ctx.user.role_level);
  if (def.flags.length) {
    if (!module) throw apiError_('FORBIDDEN');
    var have = def.flags.map(function (f) { return hasFlag_(lvl, module, f); });
    var ok = def.flagMode === 'any' ? have.some(Boolean) : have.every(Boolean);
    if (!ok) throw apiError_('FORBIDDEN');
  }
  var ev = evalCells_(ctx, def, module);
  if (!ev.allowed) throw apiError_('FORBIDDEN');
  return { module: module, conds: ev.conds, ns: ev.ns };
}

/** Thử quyền, không ném lỗi */
function can_(ctx, code, target) {
  try { authorize_(ctx, code, target); return true; } catch (e) { return false; }
}

/** Quyền xem giá theo module (4.5): cấp 2 chỉ trong module chính của subrole */
function canViewCost_(ctx, module) {
  var lvl = Number(ctx.user.role_level);
  if (!hasFlag_(lvl, module, '$')) return false;
  if (lvl === 2) return ctxSubroles_(ctx).some(function (s) { return SUBROLES[s].indexOf(module) >= 0; });
  return true;
}

/** Bước 7: không tự duyệt (4.6). people: danh sách user_id không được duyệt. */
function assertNotSelf_(ctx, code, people) {
  var uid = ctx.user.user_id;
  if (people.indexOf(uid) < 0) return 'ROLE_LEVEL';
  var ex = setting_('self_approval_exceptions') || [];
  var reason = trimStr_((ctx.req.payload || {}).self_approval_reason);
  var allowed = ex.some(function (e) { return e && e.action_code === code; });
  if (allowed && reason) return 'SELF_APPROVAL_EXCEPTION';
  throw apiError_('FORBIDDEN');
}

/** Cơ sở quyền ghi vào AuditLogs.auth_basis */
function authBasis_(ctx) {
  var lvl = Number(ctx.user.role_level);
  if (lvl === 2) return 'SUBROLE:' + ctxSubroles_(ctx).join(',');
  return 'ROLE_LEVEL';
}

function dotReleased_(dot) {
  if (dot === 'POC') return isTestEnv_();
  if (dot === 'H') return false;
  return dot <= RELEASED_DOT;
}

/** Khối permissions của bootstrap: action được phép theo cấp/subrole (chưa xét hồ sơ) */
function permissionSummary_(ctx) {
  var actions = [];
  Object.keys(ACTION_REGISTRY).forEach(function (code) {
    var def = ACTION_REGISTRY[code];
    if (!dotReleased_(def.dot) || def.net === 'internal') return;
    if (!HANDLERS_[code]) return;
    var mods = def.module === '*' || def.module === '*work' ? BUSINESS_MODULES_ :
      (def.module === 'contracts|inspections' ? ['contracts', 'inspections'] : [resolveModule_(def, null)]);
    var any = mods.some(function (m) {
      if (def.flags.length && !m) return false;
      return can_(ctx, code, { module: m });
    });
    if (any) actions.push(code);
  });
  var costModules = BUSINESS_MODULES_.filter(function (m) { return canViewCost_(ctx, m); });
  return { perm_version: sysStateCached_().perm_version || 1, actions: actions, cost_modules: costModules };
}

// ===== 08_ops.js =====
/* 08_ops: Operations (chống ghi trùng), mã hiển thị, qr_key, AuditLogs, dịch máy
 * (1.4 §10.3.1, §16.2; phụ lục 1.5 mục 2.3, 3.3, 3.4, 3.15) */

/** Băm payload chuẩn hóa: action, hồ sơ, expected_version, epoch, người dùng (1.4 §10.3.1) */
function payloadHash_(ctx) {
  var req = ctx.req;
  var norm = normalizeForHash_(req.payload || {});
  return b64url_(sha256_(stableStringify_({
    action: req.action, expected_version: req.expected_version === undefined ? null : req.expected_version,
    dataset_epoch: req.dataset_epoch, user_id: ctx.user.user_id, payload: norm
  })));
}

function normalizeForHash_(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(normalizeForHash_);
  var out = {};
  Object.keys(o).forEach(function (k) {
    if (SECRET_KEYS_.indexOf(k) >= 0) return;
    if ((k === 'content_b64' || k === 'thumb_b64') && typeof o[k] === 'string') { out[k] = 'sha:' + b64url_(sha256_(o[k])); return; }
    out[k] = normalizeForHash_(o[k]);
  });
  return out;
}

function writeAudit_(a) {
  var lim = function (v) {
    if (v === null || v === undefined) return '';
    var s = JSON.stringify(redact_(v));
    return s.length > 4000 ? JSON.stringify({ truncated: true, size: s.length }) : s;
  };
  insertRows_('AuditLogs', [{
    audit_id: uuid_(), occurred_at: isoVN_(now_()), user_id: a.user_id, device_id: isUuidV4_(a.device_id) ? a.device_id : '',
    action: a.action, entity_type: a.entity_type || '', entity_id: a.entity_id || '', before_json: lim(a.before_json),
    after_json: lim(a.after_json), operation_id: a.operation_id || '', import_batch_id: a.import_batch_id || '',
    dataset_epoch: sysProps_().dataset_epoch, reason: a.reason || '', auth_basis: a.auth_basis || ''
  }]);
}

/** Phản hồi khi operation_id đã có (3.15) */
function existingOpResponse_(ctx, ex, hash) {
  if (ex.user_id !== ctx.user.user_id || ex.payload_hash !== hash || ex.action !== ctx.req.action) {
    throw apiError_('OPERATION_ID_REUSED');
  }
  if (ex.state === 'COMMITTED') {
    var data = ex.result_json || null;
    return { ok: true, code: 'DUPLICATE_OPERATION', state: 'COMMITTED', data: data, record_version: data ? data.record_version : null };
  }
  if (ex.state === 'PREPARED') return replayPrepared_(ctx, ex);
  throw apiError_('RECOVERY_REQUIRED', { operation_state: ex.state });
}

/** Ghi các dòng của kế hoạch. Chế độ replay: bỏ qua dòng đã có/đã áp. */
function applyWrites_(writes, replay) {
  var inserts = {};
  writes.forEach(function (w) {
    if (w.mode === 'insert') {
      if (replay) {
        var key = sheetSchema_(w.sheet).key;
        if (findRowNums_(w.sheet, key, w.row[key]).length) return;
      }
      (inserts[w.sheet] = inserts[w.sheet] || []).push(w.row);
    } else if (w.mode === 'update') {
      var keyU = sheetSchema_(w.sheet).key;
      var rn = findRowNums_(w.sheet, keyU, w.row[keyU])[0];
      if (!rn) throw apiError_('RECOVERY_REQUIRED', { missing: w.sheet });
      if (replay && w.row.record_version !== undefined) {
        var cur = readRowAt_(w.sheet, rn);
        if ((cur.record_version || 0) >= w.row.record_version) return;
      }
      if (w.partial) writeCells_(w.sheet, rn, w.row); else writeRow_(w.sheet, rn, w.row);
    }
  });
  Object.keys(inserts).forEach(function (s) { insertRows_(s, inserts[s]); });
}

function replayPrepared_(ctx, ex) {
  var intent = ex.intent_json;
  if (!intent || !intent.writes) throw apiError_('RECOVERY_REQUIRED', { operation_state: 'PREPARED' });
  var st = readState_();
  applyWrites_(intent.writes, true);
  var su = {};
  Object.keys(intent.state || {}).forEach(function (k) {
    var v = intent.state[k];
    if (v[0] === 'INT' && Number(stateGet_(st, k, 0)) >= Number(v[1])) return;
    su[k] = v;
  });
  if (Object.keys(su).length) stateWrite_(st, su, ctx.user.user_id);
  if (intent.audit) writeAudit_(intent.audit);
  writeCells_('Operations', ex.__row, {
    state: 'COMMITTED', result_code: 'OK', committed_at: isoVN_(now_()), result_json: JSON.stringify(intent.result || null)
  });
  return { ok: true, code: 'DUPLICATE_OPERATION', state: 'COMMITTED', data: intent.result || null, record_version: intent.result ? intent.result.record_version : null };
}

/**
 * Thực hiện một thao tác ghi có xác nhận COMMITTED.
 * opts.build(st) chạy dưới khóa ghi, trả {writes, state, result, audit, record_version, noReplay}.
 *  - writes: [{sheet, mode:'insert'|'update', row, partial?}]
 *  - state: {khóa SystemState: [kiểu, giá trị]} (vd code_seq)
 *  - audit: {action, entity_type, entity_id, before_json, after_json, reason}
 */
function executeWrite_(ctx, opts) {
  var req = ctx.req;
  var hash = payloadHash_(ctx);
  return withWriteLock_(function () {
    var ex = findOne_('Operations', 'operation_id', req.operation_id);
    if (ex) return existingOpResponse_(ctx, ex, hash);
    var st = readState_();
    var plan = opts.build(st);
    var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
    var nowIso = isoVN_(now_());
    var touched = {};
    plan.writes.forEach(function (w) {
      if (sheetSchema_(w.sheet).cols.indexOf('sync_revision') >= 0) w.row.sync_revision = rev;
      touched[w.sheet] = true;
    });
    var su = plan.state || {};
    su.sync_revision = ['INT', rev];
    Object.keys(touched).forEach(function (s) { su['table_rev.' + s] = ['INT', rev]; });
    var audit = null;
    if (plan.audit) {
      audit = {
        user_id: ctx.user.user_id, device_id: req.device_id, action: req.action, entity_type: plan.audit.entity_type,
        entity_id: plan.audit.entity_id, before_json: plan.audit.before_json || null, after_json: plan.audit.after_json || null,
        operation_id: req.operation_id, reason: plan.audit.reason || '', auth_basis: plan.audit.auth_basis || authBasis_(ctx)
      };
    }
    var intent = plan.noReplay ? { no_replay: true } : { writes: plan.writes, state: su, audit: audit, result: plan.result };
    var intentStr = JSON.stringify(intent);
    if (intentStr.length > 40000) intentStr = JSON.stringify({ too_large: true });
    var opRow = {
      operation_id: req.operation_id, user_id: ctx.user.user_id, device_id: isUuidV4_(req.device_id) ? req.device_id : '',
      entity_type: opts.entity_type || '', entity_id: opts.entity_id || '',
      expected_version: req.expected_version === undefined ? '' : req.expected_version, received_at: nowIso,
      state: 'PREPARED', result_code: '', sync_revision: rev, committed_at: '', dataset_epoch: sysProps_().dataset_epoch,
      action: req.action, payload_hash: hash, intent_json: intentStr, progress_json: '', result_json: ''
    };
    insertRows_('Operations', [opRow]);
    applyWrites_(plan.writes, false);
    stateWrite_(st, su, ctx.user.user_id);
    if (audit) writeAudit_(audit);
    writeCells_('Operations', opRow.__row, {
      state: 'COMMITTED', result_code: 'OK', committed_at: isoVN_(now_()), result_json: JSON.stringify(plan.result || null)
    });
    return { ok: true, code: 'OK', state: 'COMMITTED', data: plan.result || null, record_version: plan.record_version };
  });
}

/* ---------------- Mã hiển thị (3.3) ---------------- */

var MANUAL_CODE_RE_ = /^[A-Z0-9][A-Z0-9._\/-]{0,31}$/;

function codeExists_(sheet, col, code) {
  return findRowNums_(sheet, col, code).length > 0;
}

/**
 * Cấp mã hiển thị dưới khóa ghi. Mã nhập tay: chuẩn hóa và kiểm trùng.
 * su: object state update để ghi bộ đếm. Trả mã hoặc ném VALIDATION_ERROR.
 */
function allocCode_(st, su, entityType, manual, bizDate) {
  var et = ENTITY_TYPES[entityType];
  var pat = CODE_PATTERNS[entityType];
  if (manual) {
    var m = trimStr_(manual).toUpperCase();
    if (!pat.manual) throw validationError_([fieldError_(et.code, 'INVALID_VALUE')]);
    if (!MANUAL_CODE_RE_.test(m)) throw validationError_([fieldError_(et.code, 'CODE_INVALID')]);
    if (codeExists_(et.sheet, et.code, m)) throw validationError_([fieldError_(et.code, 'CODE_DUPLICATE')]);
    return m;
  }
  var ym = pat.yymm ? yymm_(bizDate || now_()) : '';
  var key = 'code_seq.' + pat.prefix + (pat.yymm ? '.' + ym : '');
  var n = Number(stateGet_(st, key, 0));
  var code;
  for (var guard = 0; guard < 100000; guard++) {
    n++;
    var num = String(n);
    while (num.length < pat.digits) num = '0' + num;
    code = pat.prefix + '-' + (pat.yymm ? ym + '-' : '') + num;
    if (!codeExists_(et.sheet, et.code, code)) break;
  }
  st.map[key] = n;
  su[key] = ['INT', n];
  return code;
}

/** qr_key mới không trùng (2.8) */
function allocQrKey_() {
  for (var i = 0; i < 5; i++) {
    var k = newQrKey_();
    if (!findRowNums_('QrRegistry', 'qr_key', k).length) return k;
  }
  throw new Error('qr_key collision');
}

function qrRow_(qrKey, entityType, entityId, code, labelVi, labelZh) {
  return {
    qr_key: qrKey, entity_type: entityType, entity_id: entityId, code: code, label_vi: labelVi || '',
    label_zh: labelZh || '', active: true, dataset_epoch: sysProps_().dataset_epoch
  };
}

/** Bộ cột C cho dòng mới */
function cNew_(ctx, row) {
  var nowIso = isoVN_(now_());
  row.dataset_epoch = sysProps_().dataset_epoch;
  row.record_version = 1;
  row.created_at = nowIso; row.created_by = ctx.user.user_id;
  row.updated_at = nowIso; row.updated_by = ctx.user.user_id;
  row.archived_at = '';
  return row;
}

function cUpdate_(ctx, row) {
  row.record_version = (row.record_version || 0) + 1;
  row.updated_at = isoVN_(now_());
  row.updated_by = ctx.user.user_id;
  return row;
}

/** So expected_version với bản trên máy chủ (dưới khóa) */
function assertVersion_(ctx, current, entityType, sheet) {
  var ev = ctx.req.expected_version;
  if (ev === undefined || ev === null || Number(ev) !== Number(current.record_version || 0)) {
    var server = sheet === 'Documents' ? projectDoc_(ctx, current) : projectRow_(ctx, current, sheet);
    throw apiError_('VERSION_CONFLICT', { entity_type: entityType, server: server, server_version: current.record_version });
  }
}

/** Ghi lỗi validation cho ID client tạo (3.3) */
function assertNewId_(sheet, field, id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_(field, 'ID_INVALID')]);
  if (findRowNums_(sheet, sheetSchema_(sheet).key, id).length) throw validationError_([fieldError_(field, 'ID_EXISTS')]);
}

/* ---------------- Dịch máy (2.3) ---------------- */

/** Commit Excel không dịch (2.3 quy tắc 9): trường cần dịch đặt PENDING cho runBackgroundJobs */
var MT_DEFER_ = false;

function mtEnabled_() {
  if (!setting_('machine_translation_enabled')) return false;
  var paused = parseTime_(sysStateCached_().mt_paused_until);
  return !(paused && paused.getTime() > now_().getTime());
}

/** Dịch một chuỗi; lỗi thì trả null. Cache theo SHA-256(nguồn + chiều). */
function mtTranslate_(text, from, to) {
  if (!text) return '';
  if (isTestEnv_() && prop_('TEST_MT_FAIL') === 'true') return null;
  var ck = 'mt:' + b64url_(sha256_(from + '>' + to + ':' + text));
  var c = cache_().get(ck);
  if (c !== null && c !== undefined) return c;
  try {
    var out = LanguageApp.translate(text, from === 'zh' ? 'zh-CN' : from, to === 'zh' ? 'zh-CN' : to, { contentType: 'text' });
    if (out && out.length < 90000) cache_().put(ck, out, 21600);
    return out;
  } catch (e) {
    var msg = String(e && e.message || e);
    if (/quota|limit|too many/i.test(msg)) {
      try {
        withWriteLock_(function () {
          var st = readState_();
          stateWrite_(st, { mt_paused_until: ['DATETIME', isoVN_(new Date(now_().getTime() + 86400000))] });
        });
        cache_().remove('sys:state');
      } catch (e2) { /* bỏ qua */ }
    }
    return null;
  }
}

/**
 * Điền bên còn thiếu của các cặp trường *_vi/*_zh theo 2.3 (quy tắc 1, 5, 7).
 * fields: tên trường gốc (vd ['name']). current: bản ghi hiện có (khi sửa) hoặc null.
 * Trả {values: {name_vi, name_zh}, meta: i18n_meta mới}. Gọi NGOÀI khóa ghi.
 */
function applyTranslations_(sheet, fields, input, current) {
  var noMt = NO_MT_FIELDS[sheet] || [];
  var meta = current && current.i18n_meta ? clone_(current.i18n_meta) : {};
  var values = {};
  var budgetEnd = now_().getTime() + setting_('mt_sync_budget_seconds') * 1000;
  var nowIso = isoVN_(now_());
  var has = function (k) { return Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined && input[k] !== null; };

  function oneSide(f, src, text) {
    var kv = f + '_vi', kz = f + '_zh';
    values[kv] = src === 'vi' ? text : '';
    values[kz] = src === 'zh' ? text : '';
    if (noMt.indexOf(f) >= 0) { meta[f] = { src: src, state: 'MANUAL_REQUIRED', at: nowIso }; return; }
    var tgt = src === 'vi' ? 'zh' : 'vi';
    // Cả chuỗi trùng thuật ngữ đã duyệt: lấy từ điển, không cần dịch máy (2.3 quy tắc 4)
    var g = glossaryExact_(text, src, tgt);
    if (g) { values[tgt === 'zh' ? kz : kv] = g; meta[f] = { src: src, state: 'GLOSSARY', at: nowIso }; return; }
    if (MT_DEFER_ || !mtEnabled_() || now_().getTime() > budgetEnd) { meta[f] = { src: src, state: 'PENDING', at: nowIso }; return; }
    var out = translateText_(text, src, tgt);
    if (out) {
      values[tgt === 'zh' ? kz : kv] = out.text;
      meta[f] = { src: src, state: out.state, at: nowIso };
    } else {
      meta[f] = { src: src, state: 'PENDING', at: nowIso };
    }
  }

  fields.forEach(function (f) {
    var kv = f + '_vi', kz = f + '_zh';
    var curVi = current ? trimStr_(current[kv]) : '', curZh = current ? trimStr_(current[kz]) : '';
    var newVi = has(kv) ? trimStr_(input[kv]) : curVi;
    var newZh = has(kz) ? trimStr_(input[kz]) : curZh;
    var m = meta[f] || null;

    if (current && m && (m.state === 'MACHINE' || m.state === 'PENDING')) {
      var src = m.src, tgt = src === 'vi' ? 'zh' : 'vi';
      var srcNew = src === 'vi' ? newVi : newZh, srcCur = src === 'vi' ? curVi : curZh;
      var tgtNew = tgt === 'vi' ? newVi : newZh, tgtCur = tgt === 'vi' ? curVi : curZh;
      var tgtTouched = has(f + '_' + tgt) && tgtNew !== '' && tgtNew !== tgtCur;
      if (tgtTouched) {
        if (!srcNew) { oneSide(f, tgt, tgtNew); return; }
        values[kv] = newVi; values[kz] = newZh;
        meta[f] = { src: src, state: 'HUMAN', at: nowIso };
        return;
      }
      if (!srcNew) { values[kv] = ''; values[kz] = ''; delete meta[f]; return; }
      if (srcNew !== srcCur || m.state === 'PENDING') { oneSide(f, src, srcNew); return; }
      values[kv] = curVi; values[kz] = curZh;
      return;
    }

    if (newVi && newZh) {
      values[kv] = newVi; values[kz] = newZh;
      if (!current || newVi !== curVi || newZh !== curZh || !m) {
        meta[f] = { src: m ? m.src : (has(kv) ? 'vi' : 'zh'), state: 'HUMAN', at: nowIso };
      }
      return;
    }
    if (!newVi && !newZh) { values[kv] = ''; values[kz] = ''; delete meta[f]; return; }
    var s1 = newVi ? 'vi' : 'zh';
    var t1 = newVi || newZh;
    if (current && m && m.state === 'MANUAL_REQUIRED' && t1 === (s1 === 'vi' ? curVi : curZh)) {
      values[kv] = newVi; values[kz] = newZh;
      return;
    }
    oneSide(f, s1, t1);
  });
  // Đã dùng "Gợi ý dịch" và người dùng tick đã kiểm tra: HUMAN kèm assisted (2.3)
  (Array.isArray(input.i18n_assisted) ? input.i18n_assisted : []).forEach(function (f) {
    if (fields.indexOf(f) >= 0 && meta[f] && meta[f].state === 'HUMAN') meta[f].assisted = true;
  });
  return { values: values, meta: meta };
}

/** Kiểm bắt buộc một thứ tiếng (3.9) */
function requireOneLang_(errs, input, current, f) {
  var vi = input[f + '_vi'] !== undefined ? trimStr_(input[f + '_vi']) : (current ? trimStr_(current[f + '_vi']) : '');
  var zh = input[f + '_zh'] !== undefined ? trimStr_(input[f + '_zh']) : (current ? trimStr_(current[f + '_zh']) : '');
  if (!vi && !zh) errs.push(fieldError_(f, 'REQUIRED_ONE_LANGUAGE'));
}

/* ---------------- Chiếu dữ liệu ra client (4.5) ---------------- */

/** Bỏ khóa nội bộ, khóa giá khi không có quyền giá */
function projectRow_(ctx, row, sheet) {
  if (!row) return null;
  var out = {};
  Object.keys(row).forEach(function (k) { if (k !== '__row') out[k] = row[k]; });
  var s = sheet || row.__sheet;
  if (s && COST_FIELDS[s]) {
    var et = Object.keys(ENTITY_TYPES).filter(function (k) { return ENTITY_TYPES[k].sheet === s; })[0];
    // Dòng con của hợp đồng (ContractEquipment, ContractServices) theo quyền giá của module hợp đồng
    var mod = et ? ENTITY_TYPES[et].module : (s.indexOf('Contract') === 0 ? 'contracts' : null);
    if (!mod || !canViewCost_(ctx, mod)) {
      COST_FIELDS[s].forEach(function (f) { delete out[f]; });
      out.meta = { cost_hidden: true };
    }
  }
  return annotateNames_(out);
}

/** Trường giá trong payload ghi của người không có quyền giá → COST_FIELD_FORBIDDEN */
function assertNoCostFields_(ctx, sheet, module, payload) {
  var fields = COST_FIELDS[sheet] || [];
  if (canViewCost_(ctx, module)) return;
  var bad = fields.filter(function (f) { return payload[f] !== undefined && payload[f] !== null && payload[f] !== ''; });
  if (bad.length) throw validationError_(bad.map(function (f) { return fieldError_(f, 'COST_FIELD_FORBIDDEN'); }));
}

// ===== 09_api.js =====
/* 09_api: doPost, doGet, điều phối action (phụ lục 1.5 mục 3.15, 4.2) */

/** Bảng thao tác đã có mã. Action có trong registry mà chưa có ở đây → FEATURE_NOT_ENABLED. */
var HANDLERS_ = {
  'auth.login': function (req) { return authLogin_(req); },
  'auth.reauth': function (ctx) { return authReauth_(ctx); },
  'auth.logout': function (ctx) { return authLogout_(ctx); },
  'auth.logoutAll': function (ctx) { return authLogoutAll_(ctx); },
  'pin.change': function (ctx) { return pinChange_(ctx); },
  'account.view': function (ctx) { return accountView_(ctx); },
  'session.listOwn': function (ctx) { return sessionListOwn_(ctx); },
  'session.revokeOwn': function (ctx) { return sessionRevokeOwn_(ctx); },
  'user.pickList': function (ctx) { return userPickList_(ctx); },
  'user.view': function (ctx) { return userView_(ctx); },
  'user.create': function (ctx) { return userCreate_(ctx); },
  'user.setRole': function (ctx) { return userSetRole_(ctx); },
  'user.lock': function (ctx) { return userLock_(ctx); },
  'user.unlock': function (ctx) { return userUnlock_(ctx); },
  'user.resetPin': function (ctx) { return userResetPin_(ctx); },
  'user.revokeSessions': function (ctx) { return userRevokeSessions_(ctx); },
  'system.getPublicState': function (req) { return publicState_(req); },
  'system.health': function () { return { app_id: APP_ID }; },
  'sync.bootstrap': function (ctx) { return syncBootstrap_(ctx); },
  'sync.changes': function (ctx) { return syncChanges_(ctx); },
  'sync.push': function (ctx) { return syncPush_(ctx); },
  'sync.getOperationStatus': function (ctx) { return syncOpStatus_(ctx); },
  'equipment.view': function (ctx) { return equipmentView_(ctx); },
  'equipment.create': function (ctx) { return equipmentCreate_(ctx); },
  'equipment.edit': function (ctx) { return equipmentEdit_(ctx); },
  'equipment.archive': function (ctx) { return equipmentArchive_(ctx); },
  'equipment.unarchive': function (ctx) { return equipmentUnarchive_(ctx); },
  'equipment.spec.edit': function (ctx) { return equipmentSpecEdit_(ctx); },
  'material.view': function (ctx) { return materialView_(ctx); },
  'material.create': function (ctx) { return materialCreate_(ctx); },
  'material.edit': function (ctx) { return materialEdit_(ctx); },
  'material.archive': function (ctx) { return materialArchive_(ctx); },
  'part.link': function (ctx) { return partLink_(ctx); },
  'part.unlink': function (ctx) { return partUnlink_(ctx); },
  'part.approve': function (ctx) { return partApprove_(ctx); },
  'contract.view': function (ctx) { return contractView_(ctx); },
  'contract.create': function (ctx) { return contractCreate_(ctx); },
  'contract.edit': function (ctx) { return contractEdit_(ctx); },
  'contract.editTerms': function (ctx) { return contractEditTerms_(ctx); },
  'contract.archive': function (ctx) { return contractArchive_(ctx); },
  'contract.close': function (ctx) { return contractClose_(ctx); },
  'contract.renewal.create': function (ctx) { return contractRenewalCreate_(ctx); },
  'contract.renewal.submit': function (ctx) { return contractRenewalSubmit_(ctx); },
  'contract.renewal.approve': function (ctx) { return contractRenewalApprove_(ctx); },
  'contract.service.record': function (ctx) { return contractServiceRecord_(ctx); },
  'contract.service.accept': function (ctx) { return contractServiceAccept_(ctx); },
  'inspection.view': function (ctx) { return inspectionView_(ctx); },
  'inspection.submit': function (ctx) { return inspectionSubmit_(ctx); },
  'inspection.type.edit': function (ctx) { return inspectionTypeEdit_(ctx); },
  'inspection.requirement.edit': function (ctx) { return inspectionRequirementEdit_(ctx); },
  'inspection.approve': function (ctx) { return inspectionApprove_(ctx); },
  'inspection.revoke': function (ctx) { return inspectionRevoke_(ctx); },
  'alert.view': function (ctx) { return alertView_(ctx); },
  'alert.acknowledge': function (ctx) { return alertAcknowledge_(ctx); },
  'notify.log.view': function (ctx) { return notifyLogView_(ctx); },
  'notify.recipient.edit': function (ctx) { return notifyRecipientEdit_(ctx); },
  'notify.settings.edit': function (ctx) { return notifySettingsEdit_(ctx); },
  'notify.resend': function (ctx) { return notifyResend_(ctx); },
  'audit.own': function (ctx) { return auditOwn_(ctx); },
  'audit.view': function (ctx) { return auditView_(ctx); },
  'audit.auth': function (ctx) { return auditAuth_(ctx); },
  'backup.view': function (ctx) { return backupView_(ctx); },
  'backup.run': function (ctx) { return backupRun_(ctx); },
  'settings.edit': function (ctx) { return settingsEdit_(ctx); },
  'permission.view': function (ctx) { return permissionView_(ctx); },
  'permission.edit': function (ctx) { return permissionEdit_(ctx); },
  'system.status': function (ctx) { return systemStatus_(ctx); },
  'import.template': function (ctx) { return importTemplateAction_(ctx); },
  'import.preview': function (ctx) { return importPreview_(ctx); },
  'import.errors': function (ctx) { return importErrors_(ctx); },
  'import.submit': function (ctx) { return importSubmit_(ctx); },
  'import.commit': function (ctx) { return importCommit_(ctx); },
  'import.cancel': function (ctx) { return importCancel_(ctx); },
  'export.xlsx': function (ctx) { return exportXlsx_(ctx); },
  'catalog.view': function (ctx) { return catalogView_(ctx); },
  'location.edit': function (ctx) { return locationEdit_(ctx); },
  'vendor.edit': function (ctx) { return vendorEdit_(ctx); },
  'lookup.edit': function (ctx) { return lookupEdit_(ctx); },
  'glossary.edit': function (ctx) { return glossaryEdit_(ctx); },
  'i18n.suggest': function (ctx) { return i18nSuggest_(ctx); },
  'i18n.retranslate': function (ctx) { return i18nRetranslate_(ctx); },
  'doc.view': function (ctx) { return docView_(ctx); },
  'doc.upload': function (ctx) { return docUpload_(ctx); },
  'doc.download': function (ctx) { return docDownload_(ctx); },
  'doc.thumbs': function (ctx) { return docThumbs_(ctx); },
  'doc.setPrivate': function (ctx) { return docSetPrivate_(ctx); },
  'doc.archive': function (ctx) { return docArchive_(ctx); },
  'qr.resolve': function (ctx) { return qrResolve_(ctx); },
  'qr.print': function (ctx) { return qrPrint_(ctx); },
  'poc.vectors': function (ctx) { return pocVectors_(ctx); },
  'poc.echo': function (ctx) { return pocEcho_(ctx); },
  'poc.sleep': function (ctx) { return pocSleep_(ctx); },
  'poc.stats': function (ctx) { return pocStats_(ctx); },
  'poc.mail': function (ctx) { return pocMail_(ctx); },
  'poc.translate': function (ctx) { return pocTranslate_(ctx); },
  'poc.makeTestFiles': function (ctx) { return pocMakeTestFiles_(ctx); },
  'poc.driveChecks': function (ctx) { return pocDriveChecks_(ctx); },
  'poc.triggers': function (ctx) { return pocTriggers_(ctx); }
};

/** Khúc commit Excel tiếp theo không hỏi lại PIN (3.8) */
var PIN_WAIVERS_ = { 'import.commit': function (ctx) { return importCommitPinWaived_(ctx); } };

/** Thao tác làm đổi hạn: ghi xong thì tính lại Alerts ngay (không đợi trigger hằng ngày) */
var DUE_ACTIONS_ = {
  'inspection.approve': 1, 'inspection.revoke': 1, 'inspection.requirement.edit': 1,
  'contract.create': 1, 'contract.edit': 1, 'contract.editTerms': 1, 'contract.archive': 1, 'contract.close': 1, 'contract.renewal.approve': 1
};

/** Action không cần phiên (chỉ qua bước 1 và 3 của 4.2) */
var PUBLIC_ACTIONS_ = { 'auth.login': 1, 'system.getPublicState': 1, 'system.health': 1 };

/** Action được chạy khi bảo trì (Đợt 1–3) */
var MAINTENANCE_ALLOW_ = { 'system.health': 1, 'system.getPublicState': 1, 'auth.logout': 1 };

function doPost(e) {
  var t0 = Date.now();
  var res;
  propsReset_(true);
  try {
    var body = e && e.postData ? e.postData.contents : '';
    var req;
    try { req = JSON.parse(body); } catch (err) { req = null; }
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      res = envelope_({}, { ok: false, code: 'VALIDATION_ERROR', errors: [fieldError_('body', 'INVALID_VALUE')] });
    } else {
      res = apiDispatch_(req);
    }
  } catch (err2) {
    res = internalError_({}, err2);
  } finally {
    propsReset_(false);
  }
  res.server_ms = Date.now() - t0;
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  if (p.action === 'system.health') {
    out = { ok: true, code: 'OK', api_contract_version: API_CONTRACT_VERSION, app_id: APP_ID, server_time: isoVN_(now_()) };
  } else {
    // via:'GET' giúp app nhận ra một POST đã bị chuyển thành GET trên đường đi (P-01)
    if (!p.action) pocNoteGet_();
    out = { ok: false, code: 'NOT_FOUND', via: 'GET', api_contract_version: API_CONTRACT_VERSION, app_id: APP_ID, server_time: isoVN_(now_()) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function publicState_(req) {
  var props = sysProps_();
  var out = {
    app_id: APP_ID, api_contract_version: API_CONTRACT_VERSION, server_version: SERVER_VERSION,
    maintenance_mode: props.maintenance_mode, env: props.env, min_client_version: setting_('min_client_version'),
    ready: !!prop_('BUSINESS_SPREADSHEET_ID')
  };
  var p = (req && req.payload) || {};
  if (p.probe_run && isTestEnv_()) {
    var d = pocProbe_(p);
    if (d) out.probe = d;
  }
  return out;
}

/** Phong bì phản hồi chuẩn (3.15) */
function envelope_(req, r) {
  var props;
  try { props = sysProps_(); } catch (e) { props = { dataset_epoch: '', maintenance_mode: false }; }
  var pair = MSG[r.code] || MSG.INTERNAL_ERROR;
  if (r.code === 'AUTH_REQUIRED' && r.data && (r.data.reason === 'REVOKED' || r.data.reason === 'AUTH_VERSION')) pair = MSG.AUTH_REQUIRED_REVOKED;
  pair = fmtMsg_(pair, r.msgVars);
  return {
    ok: !!r.ok, code: r.code, message_vi: pair[0], message_zh: pair[1],
    data: r.data === undefined ? null : r.data,
    api_contract_version: API_CONTRACT_VERSION, dataset_epoch: props.dataset_epoch || '',
    maintenance_mode: !!props.maintenance_mode,
    operation_id: req && req.operation_id ? String(req.operation_id) : null,
    state: r.state || null, record_version: r.record_version === undefined ? null : r.record_version,
    sync_cursor: r.sync_cursor || null, server_time: isoVN_(now_()), errors: r.errors || []
  };
}

function internalError_(req, err) {
  var id = uuid_();
  console.error('INTERNAL_ERROR ' + id + ' ' + (req && req.action) + ' ' + (err && err.stack ? err.stack : err));
  return envelope_(req, { ok: false, code: 'INTERNAL_ERROR', data: { error_id: id } });
}

function errorToResponse_(req, e) {
  if (e && e.apiCode) {
    return envelope_(req, { ok: false, code: e.apiCode, data: e.apiData, errors: e.apiErrors, msgVars: e.msgVars });
  }
  return internalError_(req, e);
}

/** Điều phối một request (đã parse JSON). Luôn trả object phản hồi. */
function apiDispatch_(req) {
  DB_.rolePerms = null;
  try {
    return dispatchInner_(req, false);
  } catch (e) {
    return errorToResponse_(req, e);
  }
}

function dispatchInner_(req, viaPush) {
  if (typeof req.action !== 'string' || typeof req.payload !== 'object' || req.payload === null || Array.isArray(req.payload)) {
    throw validationError_([fieldError_('action', 'REQUIRED')]);
  }
  if (req.api_contract_version !== API_CONTRACT_VERSION) throw apiError_('CLIENT_UPDATE_REQUIRED');
  // 1. Registry
  var def = ACTION_REGISTRY[req.action];
  if (!def || def.net === 'internal') throw apiError_('FORBIDDEN');
  if (!dotReleased_(def.dot) || !HANDLERS_[req.action]) throw apiError_('FEATURE_NOT_ENABLED');
  if (req.action !== 'system.health' && req.action !== 'system.getPublicState') {
    if (cmpVersion_(req.app_version, setting_('min_client_version')) < 0) throw apiError_('CLIENT_UPDATE_REQUIRED');
    if (!isUuidV4_(req.device_id)) throw validationError_([fieldError_('device_id', 'ID_INVALID')]);
  }
  // 3. Bảo trì
  if (sysProps_().maintenance_mode && !MAINTENANCE_ALLOW_[req.action]) throw apiError_('SYSTEM_MAINTENANCE');
  if (PUBLIC_ACTIONS_[req.action]) {
    if (!prop_('BUSINESS_SPREADSHEET_ID') && req.action !== 'system.health' && req.action !== 'system.getPublicState') throw apiError_('SYSTEM_NOT_READY');
    return envelope_(req, { ok: true, code: 'OK', data: HANDLERS_[req.action](req) });
  }
  // 2. Phiên
  var ctx = requireSession_(req, req.action);
  if (def.write && !isUuidV4_(req.operation_id)) throw validationError_([fieldError_('operation_id', 'ID_INVALID')]);
  // Bước 4–5: module cố định thì kiểm ngay; module theo hồ sơ ('*', '*work', 'contracts|inspections')
  // thì thao tác gọi authorize_ với hồ sơ đích. Action '-' chỉ xét ô theo cấp/subrole.
  var dynamic = def.module === '*' || def.module === '*work' || def.module === 'contracts|inspections';
  if (def.module === '-') {
    if (!evalCells_(ctx, def, null).allowed) throw apiError_('FORBIDDEN');
  } else if (!dynamic) {
    ctx.auth = authorize_(ctx, req.action, null);
  }
  // Module theo hồ sơ: ô theo cấp/subrole không cho thì từ chối trước khi hỏi PIN
  if (dynamic && def.net === 'pin' && !evalCells_(ctx, def, null).allowed) throw apiError_('FORBIDDEN');
  // 8. Hỏi lại PIN — sau khi đã biết người dùng có quyền (không hỏi PIN người không có quyền)
  if (def.net === 'pin' && !verifyReauth_(ctx, req.reauth_token) && !(PIN_WAIVERS_[req.action] && PIN_WAIVERS_[req.action](ctx))) throw apiError_('REAUTH_REQUIRED');
  ctx.viaPush = !!viaPush;
  var out = HANDLERS_[req.action](ctx);
  if (DUE_ACTIONS_[req.action] && out && out.ok) afterDueChange_();
  if (out && out.__envelope) return out.__envelope; // sync.push: phản hồi giống action gốc
  if (out && out.state === 'COMMITTED' && out.ok) {
    return envelope_(req, out);
  }
  return envelope_(req, { ok: true, code: 'OK', data: out, sync_cursor: out && out.sync_cursor ? String(out.sync_cursor) : null });
}

// ===== 10_equipment.js =====
/* 10_equipment: Thiết bị (phần PoC: tạo, sửa, xem) và danh mục chung (xem) */

var EQUIPMENT_STATUS_ = ['RUNNING', 'STOPPED', 'UNDER_REPAIR', 'UNDER_MAINTENANCE', 'STANDBY', 'RETIRED'];
var CRITICALITY_ = ['HIGH', 'MEDIUM', 'LOW'];
var EQUIPMENT_FIELDS_ = ['category_id', 'location_id', 'vendor_id', 'manufacturer', 'model', 'serial',
  'manufacture_year', 'install_date', 'warranty_end', 'status', 'criticality', 'owner_user_id'];

/** Kiểm trường thiết bị (ngoài tên); đẩy lỗi vào errs */
function validateEquipmentFields_(p, errs) {
  if (p.status !== undefined && EQUIPMENT_STATUS_.indexOf(p.status) < 0) errs.push(fieldError_('status', 'INVALID_VALUE'));
  if (p.criticality !== undefined && p.criticality !== '' && CRITICALITY_.indexOf(p.criticality) < 0) errs.push(fieldError_('criticality', 'INVALID_VALUE'));
  ['install_date', 'warranty_end'].forEach(function (f) {
    if (p[f] !== undefined && p[f] !== '' && !isDateStr_(p[f])) errs.push(fieldError_(f, 'INVALID_DATE'));
  });
  if (p.manufacture_year !== undefined && p.manufacture_year !== '' && p.manufacture_year !== null) {
    var y = Number(p.manufacture_year);
    if (!(y >= 1900 && y <= 2100 && Math.floor(y) === y)) errs.push(fieldError_('manufacture_year', 'INVALID_VALUE'));
  }
  ['manufacturer', 'model', 'serial'].forEach(function (f) {
    if (p[f] !== undefined && String(p[f]).length > 120) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  ['name_vi', 'name_zh'].forEach(function (f) {
    if (p[f] !== undefined && String(p[f]).length > 200) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
}

/** Khóa ngoại phải tồn tại (dưới khóa ghi) */
function assertRefs_(p, errs) {
  var refs = { location_id: 'Locations', vendor_id: 'Vendors', category_id: 'LookupValues', owner_user_id: 'Users' };
  Object.keys(refs).forEach(function (f) {
    if (p[f]) {
      if (!isUuidV4_(p[f]) || !findRowNums_(refs[f], sheetSchema_(refs[f]).key, p[f]).length) errs.push(fieldError_(f, 'NOT_FOUND'));
    }
  });
}

function equipmentCreate_(ctx) {
  var p = ctx.req.payload;
  var errs = [];
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
  requireOneLang_(errs, p, null, 'name');
  validateEquipmentFields_(p, errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Equipment', ['name'], p, null);

  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Equipment', 'equipment_id', p.equipment_id).length) e2.push(fieldError_('equipment_id', 'ID_EXISTS'));
      assertRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'EQUIPMENT', p.equipment_code, null);
      var qrKey = allocQrKey_();
      var row = { equipment_id: p.equipment_id, equipment_code: code, name_vi: tr.values.name_vi, name_zh: tr.values.name_zh, i18n_meta: tr.meta };
      EQUIPMENT_FIELDS_.forEach(function (f) { row[f] = p[f] !== undefined ? p[f] : ''; });
      if (!row.status) row.status = 'RUNNING';
      if (row.manufacture_year !== '' && row.manufacture_year !== null) row.manufacture_year = Number(row.manufacture_year);
      cNew_(ctx, row);
      return {
        writes: [
          { sheet: 'Equipment', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'EQUIPMENT', p.equipment_id, code, row.name_vi, row.name_zh) }
        ],
        state: su,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Equipment') },
        record_version: 1,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: null, after_json: row }
      };
    }
  });
}

function equipmentEdit_(ctx) {
  var p = ctx.req.payload;
  if (!isUuidV4_(p.equipment_id)) throw validationError_([fieldError_('equipment_id', 'ID_INVALID')]);
  var cur0 = findOne_('Equipment', 'equipment_id', p.equipment_id);
  if (!cur0) throw apiError_('NOT_FOUND');
  var errs = [];
  requireOneLang_(errs, p, cur0, 'name');
  validateEquipmentFields_(p, errs);
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Equipment', ['name'], p, cur0);

  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function (st) {
      var cur = findOne_('Equipment', 'equipment_id', p.equipment_id);
      assertVersion_(ctx, cur, 'EQUIPMENT', 'Equipment');
      var e2 = [];
      assertRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur);
      var su = {};
      if (p.equipment_code !== undefined && trimStr_(p.equipment_code).toUpperCase() !== cur.equipment_code) {
        row.equipment_code = allocCode_(st, su, 'EQUIPMENT', p.equipment_code, null);
      }
      // Bản dịch tính ngoài khóa từ cur0; cur khác cur0 thì assertVersion_ ở trên đã báo xung đột
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh; row.i18n_meta = tr.meta;
      EQUIPMENT_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = p[f]; });
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Equipment', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.equipment_id);
      if (qr && (qr.code !== row.equipment_code || qr.label_vi !== row.name_vi || qr.label_zh !== row.name_zh)) {
        var q2 = clone_(qr); delete q2.__row;
        q2.code = row.equipment_code; q2.label_vi = row.name_vi; q2.label_zh = row.name_zh;
        writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
      }
      var after = clone_(row); delete after.__row;
      return {
        writes: writes, state: su,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: row.equipment_code, qr_key: qr ? qr.qr_key : null, record_version: row.record_version, record: projectRow_(ctx, row, 'Equipment') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/** Bản đồ entity_id → qr_key */
function qrMap_() {
  var m = {};
  readRows_('QrRegistry').forEach(function (q) { m[q.entity_id] = q.qr_key; });
  return m;
}

/**
 * equipment.view: một hồ sơ {equipment_id} (kèm thông số) hoặc danh sách
 * {filters: {q, status, location_id, category_id}, include_archived, page_size, page_token}
 */
function equipmentView_(ctx) {
  var p = ctx.req.payload || {};
  var qm = qrMap_();
  if (p.equipment_id) {
    var r = findOne_('Equipment', 'equipment_id', p.equipment_id);
    if (!r) throw apiError_('NOT_FOUND');
    var o = projectRow_(ctx, r, 'Equipment');
    o.qr_key = qm[r.equipment_id] || null;
    var specs = findAll_('EquipmentSpecs', 'equipment_id', r.equipment_id).filter(function (s) { return !s.archived_at; })
      .map(function (s) { return projectRow_(ctx, s, 'EquipmentSpecs'); });
    return { item: o, specs: specs };
  }
  var f = p.filters || {};
  var q = trimStr_(f.q).toLowerCase();
  var rows = readRows_('Equipment').filter(function (r) {
    if (r.archived_at && !p.include_archived) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.location_id && r.location_id !== f.location_id) return false;
    if (f.category_id && r.category_id !== f.category_id) return false;
    if (q) {
      var hay = [r.equipment_code, r.name_vi, r.name_zh, r.model, r.serial, r.manufacturer].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  rows.sort(function (a, b) { return String(a.equipment_code).localeCompare(String(b.equipment_code)); });
  var size = Math.min(200, Number(p.page_size) || setting_('list_page_size'));
  var start = Number(p.page_token || 0);
  var items = rows.slice(start, start + size).map(function (r) {
    var o = projectRow_(ctx, r, 'Equipment'); o.qr_key = qm[r.equipment_id] || null; return o;
  });
  return { items: items, total: rows.length, next_page_token: start + size < rows.length ? String(start + size) : null };
}

function catalogView_(ctx) {
  return {
    locations: readRows_('Locations').map(function (r) { return projectRow_(ctx, r, 'Locations'); }),
    vendors: readRows_('Vendors').map(function (r) { return projectRow_(ctx, r, 'Vendors'); }),
    lookups: readRows_('LookupValues').map(function (r) { return projectRow_(ctx, r, 'LookupValues'); }),
    glossary: readRows_('Glossary').filter(function (r) { return !r.archived_at; }).map(function (r) { return projectRow_(ctx, r, 'Glossary'); })
  };
}

/* ---------------- Lưu trữ / dùng lại (4.4.1) ---------------- */

/** Ảnh LINK_VIEW của hồ sơ bị lưu trữ → riêng tư (2.6). Gọi ngoài khóa ghi; lỗi thì FAILED kèm mã */
function revokeEntityPhotos_(ctx, entityType, entityId) {
  var docs = findAll_('Documents', 'entity_id', entityId).filter(function (d) {
    return d.entity_type === entityType && d.access_scope === 'LINK_VIEW' && d.drive_sharing_state === 'LINK_SHARED';
  });
  docs.forEach(function (d) {
    var ok = true, err = '';
    try {
      ok = makePrivate_(d.drive_file_id);
      if (d.thumb_drive_file_id) ok = makePrivate_(d.thumb_drive_file_id) && ok;
    } catch (e) { ok = false; err = String(e && e.message || e).slice(0, 80); }
    withWriteLock_(function () {
      var cur = findOne_('Documents', 'document_id', d.document_id);
      if (!cur) return;
      var st = readState_();
      var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
      writeCells_('Documents', cur.__row, {
        drive_sharing_state: ok ? 'REVOKED' : 'FAILED', sharing_updated_at: isoVN_(now_()),
        sharing_error_code: ok ? '' : (err || 'NOT_PRIVATE'), sync_revision: rev
      });
      stateWrite_(st, { sync_revision: ['INT', rev], 'table_rev.Documents': ['INT', rev] }, ctx.user.user_id);
    });
  });
}

function equipmentArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.equipment_id)) throw validationError_([fieldError_('equipment_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var res = executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function () {
      var cur = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'EQUIPMENT', 'Equipment');
      if (cur.archived_at) throw validationError_([fieldError_('equipment_id', 'INVALID_VALUE')]);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur);
      row.status = 'RETIRED';
      row.archived_at = isoVN_(now_());
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Equipment', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.equipment_id);
      if (qr && qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = false; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: row.equipment_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Equipment') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: { status: before.status, archived_at: '' }, after_json: { status: 'RETIRED', archived_at: row.archived_at }, reason: trimStr_(p.reason) }
      };
    }
  });
  if (res.ok && res.code === 'OK') revokeEntityPhotos_(ctx, 'EQUIPMENT', p.equipment_id);
  return res;
}

function equipmentUnarchive_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
  if (!trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (EQUIPMENT_STATUS_.indexOf(p.status) < 0 || p.status === 'RETIRED') errs.push(fieldError_('status', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT', entity_id: p.equipment_id,
    build: function () {
      var cur = findOne_('Equipment', 'equipment_id', p.equipment_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'EQUIPMENT', 'Equipment');
      if (!cur.archived_at) throw validationError_([fieldError_('equipment_id', 'INVALID_VALUE')]);
      var row = clone_(cur);
      row.status = p.status;
      row.archived_at = '';
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Equipment', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.equipment_id);
      if (qr && !qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = true; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes,
        result: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, display_code: row.equipment_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Equipment') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: p.equipment_id, before_json: { status: 'RETIRED', archived_at: cur.archived_at }, after_json: { status: p.status, archived_at: '' }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Thông số thiết bị (5.5) ---------------- */

/** Khóa chuẩn: [đơn vị mặc định, đơn vị cho phép, cột giá trị (num|text), thứ tự] */
var SPEC_STD_ = {
  voltage: ['V', ['V', 'kV'], 'num', 10],
  rated_current: ['A', ['A'], 'num', 20],
  electrical_power: ['kW', ['kW', 'W', 'HP'], 'num', 30],
  frequency: ['Hz', ['Hz'], 'num', 40],
  working_pressure: ['bar', ['bar', 'MPa', 'kPa'], 'num', 50],
  flow_rate: ['m³/h', ['m³/h', 'L/min', 'L/s'], 'num', 60],
  speed: ['rpm', ['rpm'], 'num', 70],
  dimensions: ['mm', ['mm', 'm'], 'text', 80],
  weight: ['kg', ['kg', 't'], 'num', 90],
  throughput: ['kg/h', ['kg/h', 't/h', 'm³/h'], 'num', 100],
  rated_capacity_kva: ['kVA', ['kVA'], 'num', 110]
};

/** Ký hiệu đơn vị chuẩn (5.4.4); bí danh chuẩn hóa không phân biệt hoa thường */
var UNITS_ = ['kWh', 'm³', 'kW', 'kVA', 'W', 'HP', 'V', 'kV', 'A', 'Hz', 'bar', 'MPa', 'kPa', 'm³/h', 'L/min', 'L/s', 'rpm',
  'kg/h', 't/h', 'mm²', 'mm', 'm', 'kg', 't', '°C', 'h', 'min', '%', 'cái', 'bộ', 'm²', 'L', 'cuộn', 'hộp'];
var UNIT_ALIAS_ = { 'm3': 'm³', 'mm2': 'mm²', 'm3/h': 'm³/h', 'm2': 'm²', 'r/min': 'rpm', 'v/ph': 'rpm', 'l': 'L', 'oc': '°C', 'độ c': '°C' };

function normUnit_(u) {
  var s = trimStr_(u);
  if (!s) return '';
  if (UNITS_.indexOf(s) >= 0) return s;
  var low = s.toLowerCase();
  if (UNIT_ALIAS_[low]) return UNIT_ALIAS_[low];
  for (var i = 0; i < UNITS_.length; i++) if (UNITS_[i].toLowerCase() === low) return UNITS_[i];
  return s;
}

/** Đơn vị hợp lệ cho một khóa: chuẩn theo bảng 5.5; khóa riêng: danh sách đơn vị + LookupValues UNIT */
function allowedUnits_(key, lookups) {
  if (SPEC_STD_[key]) return SPEC_STD_[key][1];
  var extra = lookups.filter(function (l) { return l.group_key === 'UNIT' && l.active !== false && !l.archived_at; }).map(function (l) { return l.code; });
  return UNITS_.concat(extra);
}

function specLabel_(key, lookups) {
  if (SPEC_STD_[key]) { var p = LABELS['spec.' + key]; return { vi: p[0], zh: p[1], sort: SPEC_STD_[key][3] }; }
  var l = lookups.filter(function (x) { return x.group_key === 'SPEC_KEY' && x.code === key && x.active !== false && !x.archived_at; })[0];
  return l ? { vi: l.name_vi || l.name_zh, zh: l.name_zh || l.name_vi, sort: 500 } : null;
}

/**
 * equipment.spec.edit: một dòng thông số mỗi request.
 * {spec_id, equipment_id, spec_key, value_num, value_text, unit, sort_order} — expected_version 0 khi thêm;
 * {spec_id, remove: true, reason?} — bỏ dòng (lưu trữ mềm).
 */
function equipmentSpecEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.spec_id)) errs.push(fieldError_('spec_id', 'ID_INVALID'));
  if (errs.length) throw validationError_(errs);
  var cur0 = findOne_('EquipmentSpecs', 'spec_id', p.spec_id);
  if (p.remove) {
    if (!cur0) throw apiError_('NOT_FOUND');
    return executeWrite_(ctx, {
      entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id,
      build: function () {
        var cur = findOne_('EquipmentSpecs', 'spec_id', p.spec_id);
        assertVersion_(ctx, cur, 'EQUIPMENT_SPEC', 'EquipmentSpecs');
        var row = clone_(cur);
        row.archived_at = isoVN_(now_());
        cUpdate_(ctx, row);
        return {
          writes: [{ sheet: 'EquipmentSpecs', mode: 'update', row: row }],
          result: { entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id, record_version: row.record_version, removed: true },
          record_version: row.record_version,
          audit: { entity_type: 'EQUIPMENT', entity_id: cur.equipment_id, before_json: { spec_key: cur.spec_key, value_num: cur.value_num, value_text: cur.value_text, unit: cur.unit }, after_json: null, reason: trimStr_(p.reason) }
        };
      }
    });
  }
  var lookups = readRows_('LookupValues');
  var key = trimStr_(p.spec_key);
  var lab = /^[a-z][a-z0-9_]{0,40}$/.test(key) ? specLabel_(key, lookups) : null;
  if (!lab) errs.push(fieldError_('spec_key', 'INVALID_VALUE'));
  if (!cur0 && !isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
  if (cur0 && p.equipment_id && p.equipment_id !== cur0.equipment_id) errs.push(fieldError_('equipment_id', 'INVALID_VALUE'));
  var num = p.value_num === '' || p.value_num === null || p.value_num === undefined ? null : Number(p.value_num);
  if (num !== null && !isFinite(num)) errs.push(fieldError_('value_num', 'INVALID_VALUE'));
  var text = trimStr_(p.value_text).slice(0, 200);
  if (key === 'dimensions' && text) text = text.replace(/\s*[xX*×]\s*/g, '×').replace(/\s+/g, '');
  if (num === null && !text) errs.push(fieldError_('value_num', 'REQUIRED'));
  var unit = normUnit_(p.unit);
  if (lab && !unit && SPEC_STD_[key]) unit = SPEC_STD_[key][0];
  if (lab && unit && allowedUnits_(key, lookups).indexOf(unit) < 0) errs.push(fieldError_('unit', 'UNIT_NOT_ALLOWED'));
  var sort = p.sort_order === undefined || p.sort_order === '' || p.sort_order === null ? (lab ? lab.sort : 500) : Number(p.sort_order);
  if (!(sort >= 0 && sort <= 100000)) errs.push(fieldError_('sort_order', 'INVALID_VALUE'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var eqId = cur0 ? cur0.equipment_id : p.equipment_id;
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id,
    build: function () {
      var eq = findOne_('Equipment', 'equipment_id', eqId);
      if (!eq || eq.archived_at) throw validationError_([fieldError_('equipment_id', 'NOT_FOUND')]);
      var cur = findOne_('EquipmentSpecs', 'spec_id', p.spec_id);
      if (cur) assertVersion_(ctx, cur, 'EQUIPMENT_SPEC', 'EquipmentSpecs');
      // Mỗi cặp (thiết bị, khóa) một dòng còn hiệu lực
      var dup = findAll_('EquipmentSpecs', 'equipment_id', eqId).filter(function (s) {
        return !s.archived_at && s.spec_key === key && s.spec_id !== p.spec_id;
      });
      if (dup.length) throw validationError_([fieldError_('spec_key', 'CODE_DUPLICATE')]);
      var row = cur ? clone_(cur) : { spec_id: p.spec_id, equipment_id: eqId };
      var before = cur ? { spec_key: cur.spec_key, value_num: cur.value_num, value_text: cur.value_text, unit: cur.unit } : null;
      row.spec_key = key; row.label_vi = lab.vi; row.label_zh = lab.zh;
      row.value_num = num === null ? '' : num; row.value_text = text; row.unit = unit; row.sort_order = sort;
      row.i18n_meta = { label: { src: 'vi', state: 'HUMAN', at: isoVN_(now_()) } };
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'EquipmentSpecs', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'EQUIPMENT_SPEC', entity_id: p.spec_id, record_version: row.record_version, record: projectRow_(ctx, row, 'EquipmentSpecs') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: eqId, before_json: before, after_json: { spec_key: key, value_num: row.value_num, value_text: text, unit: unit } }
      };
    }
  });
}

// ===== 11_inspection.js =====
/* 11_inspection: Kiểm định — 1.4 §5.9; phụ lục 1.5 mục 3.17, 4.4.9, 4.6, C10.
 * Hạn hiện hành chỉ đổi khi một lần PASS/CONDITIONAL_PASS được duyệt; lần FAIL được duyệt giữ hạn cũ;
 * thu hồi giữ hạn; lịch hẹn không đổi hạn (inspection.schedule chờ chốt). */

var INSPECTION_RESULT_ = ['PASS', 'FAIL', 'CONDITIONAL_PASS'];

/* ---------------- Loại kiểm định ---------------- */

/**
 * inspection.type.edit: tạo (expected_version 0) hoặc sửa loại kiểm định.
 * {inspection_type_id, code, name_vi/zh, reference_basis, default_interval_months, required_docs_vi/zh, active}
 * Tên và hồ sơ cần có là nội dung pháp lý: không dịch tự động (2.3).
 */
function inspectionTypeEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.inspection_type_id)) throw validationError_([fieldError_('inspection_type_id', 'ID_INVALID')]);
  var cur0 = findOne_('InspectionTypes', 'inspection_type_id', p.inspection_type_id);
  var errs = [];
  requireOneLang_(errs, p, cur0, 'name');
  var code = p.code !== undefined ? trimStr_(p.code).toUpperCase() : (cur0 ? cur0.code : '');
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,31}$/.test(code)) errs.push(fieldError_('code', code ? 'CODE_INVALID' : 'REQUIRED'));
  if (p.default_interval_months !== undefined && p.default_interval_months !== '' && p.default_interval_months !== null) {
    var m = Number(p.default_interval_months);
    if (!(m > 0 && m <= 240 && Math.floor(m) === m)) errs.push(fieldError_('default_interval_months', 'INVALID_VALUE'));
  }
  if (p.reference_basis !== undefined && String(p.reference_basis).length > 300) errs.push(fieldError_('reference_basis', 'INVALID_VALUE'));
  if (p.active !== undefined && typeof p.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('InspectionTypes', ['name', 'required_docs'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION_TYPE', entity_id: p.inspection_type_id,
    build: function () {
      var cur = findOne_('InspectionTypes', 'inspection_type_id', p.inspection_type_id);
      if (cur) assertVersion_(ctx, cur, 'INSPECTION_TYPE', 'InspectionTypes');
      var dup = findAll_('InspectionTypes', 'code', code).filter(function (t) { return t.inspection_type_id !== p.inspection_type_id; });
      if (dup.length) throw validationError_([fieldError_('code', 'CODE_DUPLICATE')]);
      var row = cur ? clone_(cur) : { inspection_type_id: p.inspection_type_id, active: true };
      var before = cur ? clone_(cur) : null; if (before) delete before.__row;
      row.code = code;
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh;
      row.required_docs_vi = tr.values.required_docs_vi; row.required_docs_zh = tr.values.required_docs_zh; row.i18n_meta = tr.meta;
      if (p.reference_basis !== undefined) row.reference_basis = trimStr_(p.reference_basis);
      if (p.default_interval_months !== undefined) row.default_interval_months = p.default_interval_months === '' || p.default_interval_months === null ? '' : Number(p.default_interval_months);
      if (p.active !== undefined) row.active = p.active;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'InspectionTypes', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'INSPECTION_TYPE', entity_id: p.inspection_type_id, record_version: row.record_version, record: projectRow_(ctx, row, 'InspectionTypes') },
        record_version: row.record_version,
        audit: { entity_type: 'INSPECTION_TYPE', entity_id: p.inspection_type_id, before_json: before, after_json: row }
      };
    }
  });
}

/* ---------------- Yêu cầu kiểm định ---------------- */

/**
 * inspection.requirement.edit: tạo/sửa/ngừng yêu cầu theo thiết bị hoặc khu vực.
 * {requirement_id, equipment_id | location_id, inspection_type_id, owner_user_id, obligation_status, active}
 * Hạn hiện hành (current_due_date) không sửa ở đây — chỉ đổi khi duyệt chứng nhận (3.17).
 */
function inspectionRequirementEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.requirement_id)) throw validationError_([fieldError_('requirement_id', 'ID_INVALID')]);
  var cur0 = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
  var errs = [];
  ['current_due_date', 'current_inspection_id', 'due_revision', 'operational_status'].forEach(function (f) {
    if (p[f] !== undefined) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  var eqId = p.equipment_id !== undefined ? p.equipment_id : (cur0 ? cur0.equipment_id : '');
  var locId = p.location_id !== undefined ? p.location_id : (cur0 ? cur0.location_id : '');
  if (!eqId && !locId) errs.push(fieldError_('equipment_id', 'REQUIRED'));
  var typeId = p.inspection_type_id !== undefined ? p.inspection_type_id : (cur0 ? cur0.inspection_type_id : '');
  if (!isUuidV4_(typeId)) errs.push(fieldError_('inspection_type_id', 'REQUIRED'));
  if (p.obligation_status !== undefined && ['REQUIRED', 'VOLUNTARY'].indexOf(p.obligation_status) < 0) errs.push(fieldError_('obligation_status', 'INVALID_VALUE'));
  if (p.active !== undefined && typeof p.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
  if (p.active === false && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id,
    build: function (st) {
      var cur = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
      if (cur) assertVersion_(ctx, cur, 'INSPECTION_REQUIREMENT', 'InspectionRequirements');
      var e2 = [];
      if (eqId) { var eq = findOne_('Equipment', 'equipment_id', eqId); if (!eq || eq.archived_at) e2.push(fieldError_('equipment_id', 'NOT_FOUND')); }
      if (locId && !findRowNums_('Locations', 'location_id', locId).length) e2.push(fieldError_('location_id', 'NOT_FOUND'));
      var ty = findOne_('InspectionTypes', 'inspection_type_id', typeId);
      if (!ty || ty.active === false) e2.push(fieldError_('inspection_type_id', 'NOT_FOUND'));
      if (p.owner_user_id && !findRowNums_('Users', 'user_id', p.owner_user_id).length) e2.push(fieldError_('owner_user_id', 'NOT_FOUND'));
      // Một thiết bị/khu vực không có hai yêu cầu đang hiệu lực cùng loại
      var same = readRows_('InspectionRequirements').filter(function (r) {
        return r.requirement_id !== p.requirement_id && r.active !== false && !r.archived_at && r.inspection_type_id === typeId &&
          (eqId ? r.equipment_id === eqId : (!r.equipment_id && r.location_id === locId));
      });
      if (same.length) e2.push(fieldError_('inspection_type_id', 'CODE_DUPLICATE'));
      if (e2.length) throw validationError_(e2);
      var su = {};
      var writes = [];
      var row, before = null, qrKey = null;
      if (cur) {
        before = clone_(cur); delete before.__row;
        row = clone_(cur);
      } else {
        row = {
          requirement_id: p.requirement_id, requirement_code: allocCode_(st, su, 'INSPECTION_REQUIREMENT', null, null),
          current_inspection_id: '', current_due_date: '', operational_status: 'ACTIVE', obligation_status: 'REQUIRED', active: true, due_revision: ''
        };
        qrKey = allocQrKey_();
      }
      row.equipment_id = eqId || ''; row.location_id = eqId ? (p.location_id !== undefined ? p.location_id || '' : row.location_id || '') : locId;
      row.inspection_type_id = typeId;
      if (p.owner_user_id !== undefined) row.owner_user_id = p.owner_user_id || '';
      if (p.obligation_status !== undefined) row.obligation_status = p.obligation_status;
      if (p.active !== undefined) row.active = p.active;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      writes.push({ sheet: 'InspectionRequirements', mode: cur ? 'update' : 'insert', row: row });
      var labelVi = ty.name_vi || ty.name_zh, labelZh = ty.name_zh || ty.name_vi;
      if (qrKey) {
        writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'INSPECTION_REQUIREMENT', p.requirement_id, row.requirement_code, labelVi, labelZh) });
      } else {
        var qr = findOne_('QrRegistry', 'entity_id', p.requirement_id);
        if (qr && (qr.active !== (row.active !== false) || qr.label_vi !== labelVi || qr.label_zh !== labelZh)) {
          var q2 = clone_(qr); delete q2.__row; q2.active = row.active !== false; q2.label_vi = labelVi; q2.label_zh = labelZh;
          writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
        }
      }
      return {
        writes: writes, state: su,
        result: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id, display_code: row.requirement_code, qr_key: qrKey, record_version: row.record_version, record: projectRow_(ctx, row, 'InspectionRequirements') },
        record_version: row.record_version,
        audit: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id, before_json: before, after_json: row, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Nộp chứng nhận (IN-03) ---------------- */

function inspectionSubmit_(ctx) {
  var p = ctx.req.payload;
  var errs = [];
  if (!isUuidV4_(p.inspection_id)) errs.push(fieldError_('inspection_id', 'ID_INVALID'));
  if (!isUuidV4_(p.requirement_id)) errs.push(fieldError_('requirement_id', 'REQUIRED'));
  if (!isDateStr_(p.inspection_date)) errs.push(fieldError_('inspection_date', 'INVALID_DATE'));
  if (INSPECTION_RESULT_.indexOf(p.result) < 0) errs.push(fieldError_('result', 'INVALID_VALUE'));
  ['valid_from', 'valid_to', 'next_due_date'].forEach(function (f) {
    if (p[f] && !isDateStr_(p[f])) errs.push(fieldError_(f, 'INVALID_DATE'));
  });
  // C10: PASS/CONDITIONAL_PASS bắt buộc có cả "Hiệu lực từ" và "Hiệu lực đến"; FAIL không bắt buộc
  if (p.result !== 'FAIL' && !p.valid_from) errs.push(fieldError_('valid_from', 'REQUIRED'));
  if (p.result !== 'FAIL' && !p.valid_to) errs.push(fieldError_('valid_to', 'REQUIRED'));
  if (p.valid_from && p.valid_to && p.valid_from > p.valid_to) errs.push(fieldError_('valid_to', 'INVALID_DATE'));
  if (p.result === 'CONDITIONAL_PASS' && !trimStr_(p.restriction_vi) && !trimStr_(p.restriction_zh)) {
    errs.push(fieldError_('restriction', 'RESTRICTION_REQUIRED'));
  }
  if (p.cost !== undefined && p.cost !== null && p.cost !== '' && !(Number(p.cost) >= 0)) errs.push(fieldError_('cost', 'INVALID_VALUE'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Inspections', 'inspections', p);
  // Kết luận kiểm định không dịch tự động (2.3): ghi MANUAL_REQUIRED khi thiếu một bên
  var tr = applyTranslations_('Inspections', ['restriction'], p, null);

  return executeWrite_(ctx, {
    entity_type: 'INSPECTION', entity_id: p.inspection_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Inspections', 'inspection_id', p.inspection_id).length) e2.push(fieldError_('inspection_id', 'ID_EXISTS'));
      var req0 = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
      if (!req0 || !req0.active || req0.archived_at) e2.push(fieldError_('requirement_id', 'NOT_FOUND'));
      if (p.vendor_id && !findRowNums_('Vendors', 'vendor_id', p.vendor_id).length) e2.push(fieldError_('vendor_id', 'NOT_FOUND'));
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'INSPECTION', null, p.inspection_date);
      var qrKey = allocQrKey_();
      var nowIso = isoVN_(now_());
      var row = {
        inspection_id: p.inspection_id, inspection_code: code, requirement_id: p.requirement_id, vendor_id: p.vendor_id || '',
        inspection_date: p.inspection_date, certificate_number: trimStr_(p.certificate_number).slice(0, 80),
        valid_from: p.valid_from || '', valid_to: p.valid_to || '', next_due_date: p.next_due_date || '', result: p.result,
        restriction_vi: tr.values.restriction_vi, restriction_zh: tr.values.restriction_zh, i18n_meta: tr.meta,
        cost: p.cost === undefined || p.cost === '' || p.cost === null ? '' : Number(p.cost), currency: p.cost ? (p.currency || setting_('default_currency')) : '',
        status: 'PENDING_APPROVAL', approved_by: '', approved_at: '', supersedes_inspection_id: '',
        submitted_by: ctx.user.user_id, submitted_at: nowIso
      };
      cNew_(ctx, row);
      return {
        writes: [
          { sheet: 'Inspections', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'INSPECTION', p.inspection_id, code, '', '') }
        ],
        state: su,
        result: { entity_type: 'INSPECTION', entity_id: p.inspection_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Inspections') },
        record_version: 1,
        audit: { entity_type: 'INSPECTION', entity_id: p.inspection_id, before_json: null, after_json: row }
      };
    }
  });
}

/** Hạn hiện hành từ một lần đạt: ngày sớm hơn giữa "Hiệu lực đến" và "hạn tiếp theo" (nếu có) */
function dueFromInspection_(i) {
  var a = i.valid_to || '', b = i.next_due_date || '';
  if (a && b) return a < b ? a : b;
  return a || b;
}

/* ---------------- Duyệt (IN-02) ---------------- */

/**
 * inspection.approve {inspection_id, decision: APPROVE | REJECT, reason}
 * Không tự duyệt: người tạo, người nộp (4.6). PASS/CONDITIONAL_PASS → cập nhật current_inspection_id,
 * current_due_date, due_revision mới, lần hiện hành cũ SUPERSEDED. FAIL → APPROVED, giữ hạn hiện hành (3.17).
 */
function inspectionApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.inspection_id)) errs.push(fieldError_('inspection_id', 'ID_INVALID'));
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION', entity_id: p.inspection_id,
    build: function () {
      var cur = findOne_('Inspections', 'inspection_id', p.inspection_id);
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'inspection.approve', [cur.created_by, cur.submitted_by]);
      assertVersion_(ctx, cur, 'INSPECTION', 'Inspections');
      if (cur.status !== 'PENDING_APPROVAL') throw validationError_([fieldError_('inspection_id', 'INVALID_VALUE')]);
      var nowIso = isoVN_(now_());
      var row = clone_(cur);
      var writes = [];
      var reqAfter = null;
      if (p.decision === 'REJECT') {
        row.status = 'REJECTED';
      } else {
        row.status = 'APPROVED';
        row.approved_by = ctx.user.user_id;
        row.approved_at = nowIso;
        if (row.result !== 'FAIL') {
          var req = findOne_('InspectionRequirements', 'requirement_id', row.requirement_id);
          if (!req) throw apiError_('NOT_FOUND');
          var prevId = req.current_inspection_id;
          // Chỉ thay hồ sơ hiện hành khi lần này mới hơn (không để lần cũ duyệt muộn đè lần mới)
          var prev = prevId ? findOne_('Inspections', 'inspection_id', prevId) : null;
          if (!prev || String(prev.inspection_date) <= String(row.inspection_date)) {
            if (prev && prev.status === 'APPROVED') {
              var pv = clone_(prev); delete pv.__row;
              pv.status = 'SUPERSEDED'; cUpdate_(ctx, pv);
              writes.push({ sheet: 'Inspections', mode: 'update', row: pv });
              row.supersedes_inspection_id = prev.inspection_id;
            }
            var r2 = clone_(req); delete r2.__row;
            var due = dueFromInspection_(row);
            r2.current_inspection_id = row.inspection_id;
            r2.current_due_date = due;
            r2.due_revision = due ? 'VALID_TO:' + due + ':' + row.inspection_id : '';
            cUpdate_(ctx, r2);
            writes.push({ sheet: 'InspectionRequirements', mode: 'update', row: r2 });
            reqAfter = r2;
          } else {
            row.status = 'SUPERSEDED';
          }
        }
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Inspections', mode: 'update', row: row });
      return {
        writes: writes,
        result: {
          entity_type: 'INSPECTION', entity_id: row.inspection_id, status: row.status, record_version: row.record_version,
          record: projectRow_(ctx, row, 'Inspections'), requirement: reqAfter ? projectRow_(ctx, reqAfter, 'InspectionRequirements') : null
        },
        record_version: row.record_version,
        audit: {
          entity_type: 'INSPECTION', entity_id: row.inspection_id, before_json: { status: cur.status },
          after_json: { status: row.status, current_due_date: reqAfter ? reqAfter.current_due_date : undefined },
          reason: trimStr_(p.reason || p.self_approval_reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined
        }
      };
    }
  });
}

/* ---------------- Thu hồi, tạm ngưng (3.17) ---------------- */

/**
 * inspection.revoke {requirement_id, op: REVOKE | SUSPEND | RESUME, reason}
 * REVOKE: lần hiện hành → REVOKED, giữ current_due_date. SUSPEND/RESUME: operational_status.
 */
function inspectionRevoke_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.requirement_id)) errs.push(fieldError_('requirement_id', 'ID_INVALID'));
  if (['REVOKE', 'SUSPEND', 'RESUME'].indexOf(p.op) < 0) errs.push(fieldError_('op', 'REQUIRED'));
  if (!trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'INSPECTION_REQUIREMENT', entity_id: p.requirement_id,
    build: function () {
      var req = findOne_('InspectionRequirements', 'requirement_id', p.requirement_id);
      if (!req) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, req, 'INSPECTION_REQUIREMENT', 'InspectionRequirements');
      var r2 = clone_(req); delete r2.__row;
      var writes = [];
      var after = {};
      if (p.op === 'REVOKE') {
        var ins = req.current_inspection_id ? findOne_('Inspections', 'inspection_id', req.current_inspection_id) : null;
        if (!ins || ins.status !== 'APPROVED') throw validationError_([fieldError_('requirement_id', 'INVALID_VALUE')]);
        var i2 = clone_(ins); delete i2.__row;
        i2.status = 'REVOKED'; cUpdate_(ctx, i2);
        writes.push({ sheet: 'Inspections', mode: 'update', row: i2 });
        after = { inspection_id: i2.inspection_id, status: 'REVOKED' };
      } else {
        var want = p.op === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
        if ((req.operational_status || 'ACTIVE') === want) throw validationError_([fieldError_('op', 'INVALID_VALUE')]);
        r2.operational_status = want;
        after = { operational_status: want };
      }
      // Ghi lại yêu cầu (tăng record_version) để máy khác thấy thay đổi và nhãn trạng thái tính lại
      cUpdate_(ctx, r2);
      writes.push({ sheet: 'InspectionRequirements', mode: 'update', row: r2 });
      return {
        writes: writes,
        result: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: r2.requirement_id, record_version: r2.record_version, record: projectRow_(ctx, r2, 'InspectionRequirements') },
        record_version: r2.record_version,
        audit: { entity_type: 'INSPECTION_REQUIREMENT', entity_id: r2.requirement_id, before_json: { operational_status: req.operational_status }, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/* ---------------- Xem ---------------- */

/** record_status (3.17) từ lần APPROVED/REVOKED có inspection_date mới nhất; SUSPENDED theo operational_status */
function requirementRecordStatus_(req, inspections) {
  if (req.operational_status === 'SUSPENDED') return 'SUSPENDED';
  var list = inspections.filter(function (i) { return i.requirement_id === req.requirement_id && (i.status === 'APPROVED' || i.status === 'REVOKED'); });
  list.sort(function (a, b) { return String(b.inspection_date).localeCompare(String(a.inspection_date)); });
  var last = list[0];
  if (!last) return 'INCOMPLETE';
  if (last.status === 'REVOKED') return 'REVOKED';
  if (last.result === 'FAIL') return 'FAILED';
  return 'VALID';
}

function inspectionView_(ctx) {
  var p = ctx.req.payload || {};
  var insp = readRows_('Inspections');
  var reqs = readRows_('InspectionRequirements').filter(function (r) { return p.include_inactive || r.active !== false; });
  if (p.requirement_id) reqs = reqs.filter(function (r) { return r.requirement_id === p.requirement_id; });
  return {
    types: readRows_('InspectionTypes').map(function (r) { return projectRow_(ctx, r, 'InspectionTypes'); }),
    requirements: reqs.map(function (r) {
      var o = projectRow_(ctx, r, 'InspectionRequirements');
      o.record_status = requirementRecordStatus_(r, insp);
      return o;
    }),
    inspections: insp.filter(function (i) { return !p.requirement_id || i.requirement_id === p.requirement_id; })
      .map(function (r) { return projectRow_(ctx, r, 'Inspections'); })
  };
}

// ===== 12_docs.js =====
/* 12_docs: ảnh và tài liệu trên Drive (phụ lục 1.5 mục 2.6, 3.10, 4.4.12) */

var DOC_MIME_ = {
  'image/jpeg': { magic: [0xFF, 0xD8, 0xFF], ext: 'jpg' },
  'image/png': { magic: [0x89, 0x50, 0x4E, 0x47], ext: 'png' },
  'application/pdf': { magic: [0x25, 0x50, 0x44, 0x46], ext: 'pdf' }
};

function magicOk_(bytes, mime) {
  var m = DOC_MIME_[mime];
  if (!m) return false;
  for (var i = 0; i < m.magic.length; i++) if (u8_(bytes[i]) !== m.magic[i]) return false;
  return true;
}

function docModule_(entityType) {
  var et = ENTITY_TYPES[entityType];
  return et && et.module ? et.module : null;
}

function appFolder_() {
  var id = prop_('DRIVE_ROOT_FOLDER_ID');
  if (!id) throw apiError_('SYSTEM_NOT_READY');
  return DriveApp.getFolderById(id);
}

/** Bỏ ID Drive của tài liệu riêng tư trước khi gửi cho client (2.6) */
function projectDoc_(ctx, d) {
  var o = projectRow_(ctx, d, 'Documents');
  delete o.managed_folder_id;
  var linkOk = d.access_scope === 'LINK_VIEW' && d.drive_sharing_state === 'LINK_SHARED';
  if (!linkOk) { delete o.drive_file_id; delete o.thumb_drive_file_id; }
  return o;
}

/** Điều kiện cấp 2 cho doc.upload (4.4.12 chú thích 8) */
function docUploadCondOk_(ctx, auth, module, kind, entity) {
  if (!auth.conds.length) return true;
  return auth.conds.some(function (c) {
    if (c === 'SPEC:KY_THUAT') {
      return (module === 'equipment' || module === 'circuits') &&
        ['PHOTO_EQUIPMENT', 'PHOTO_SITE', 'MANUAL', 'DRAWING', 'OTHER'].indexOf(kind) >= 0;
    }
    if (c === 'SPEC:DOC_DIEN_NUOC') return module === 'utilities' && kind === 'PHOTO_METER';
    if (c === 'OWN:BAO_SU_CO') return module === 'repairs' && entity && entity.reported_by === ctx.user.user_id;
    return false;
  });
}

function docUpload_(ctx) {
  var p = ctx.req.payload;
  if (p.external_url !== undefined && p.content_b64 === undefined) return docAddLink_(ctx);
  var errs = [];
  if (!isUuidV4_(p.document_id)) errs.push(fieldError_('document_id', 'ID_INVALID'));
  var et = ENTITY_TYPES[p.entity_type];
  if (!et || !et.module) errs.push(fieldError_('entity_type', 'INVALID_VALUE'));
  if (!isUuidV4_(p.entity_id)) errs.push(fieldError_('entity_id', 'ID_INVALID'));
  var scope = DOC_KIND_SCOPE[p.kind];
  if (!scope) errs.push(fieldError_('kind', 'INVALID_VALUE'));
  if (!DOC_MIME_[p.mime_type]) errs.push(fieldError_('mime_type', 'FILE_TYPE'));
  if (scope === 'LINK_VIEW' && p.mime_type !== 'image/jpeg' && p.mime_type !== 'image/png') errs.push(fieldError_('mime_type', 'FILE_TYPE'));
  if (typeof p.content_b64 !== 'string' || !p.content_b64) errs.push(fieldError_('content_b64', 'REQUIRED'));
  if (p.document_date && !isDateStr_(p.document_date)) errs.push(fieldError_('document_date', 'INVALID_DATE'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);

  var module = et.module;
  var auth = authorize_(ctx, 'doc.upload', { module: module });
  var entity = findOne_(et.sheet, et.key, p.entity_id);
  if (!entity || entity.archived_at) throw validationError_([fieldError_('entity_id', 'NOT_FOUND')]);
  if (!docUploadCondOk_(ctx, auth, module, p.kind, entity)) throw apiError_('FORBIDDEN');
  if (scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');

  // Đã có thao tác này → không tạo thêm file
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  if (findRowNums_('Documents', 'document_id', p.document_id).length) throw validationError_([fieldError_('document_id', 'ID_EXISTS')]);

  var bytes = b64d_(p.content_b64);
  var maxB = setting_('doc_max_bytes');
  if (bytes.length > maxB) throw validationError_([fieldError_('content_b64', 'FILE_TOO_LARGE')]);
  if (!magicOk_(bytes, p.mime_type)) throw validationError_([fieldError_('mime_type', 'FILE_TYPE')]);
  var thumbBytes = null;
  if (scope === 'LINK_VIEW' && typeof p.thumb_b64 === 'string' && p.thumb_b64) {
    thumbBytes = b64d_(p.thumb_b64);
    if (thumbBytes.length > 2000000 || !magicOk_(thumbBytes, 'image/jpeg')) throw validationError_([fieldError_('thumb_b64', 'FILE_TYPE')]);
  }

  // Drive: ngoài khóa ghi (3.15)
  var folder = appFolder_();
  var ext = DOC_MIME_[p.mime_type].ext;
  var file = folder.createFile(Utilities.newBlob(bytes, p.mime_type, p.document_id + '.' + ext));
  var thumb = thumbBytes ? folder.createFile(Utilities.newBlob(thumbBytes, 'image/jpeg', p.document_id + '_thumb.jpg')) : null;
  var sharing = 'NOT_SHARED', sharingErr = '';
  if (scope === 'LINK_VIEW') {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      if (thumb) thumb.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sharing = 'LINK_SHARED';
    } catch (e) {
      sharing = 'FAILED'; sharingErr = String(e && e.message || e).slice(0, 80);
    }
  }
  var nowIso = isoVN_(now_());
  var trTitle = applyTranslations_('Documents', ['title'], { title_vi: p.title_vi, title_zh: p.title_zh }, null);
  var res;
  try {
    res = executeWrite_(ctx, {
      entity_type: 'DOCUMENT', entity_id: p.document_id,
      build: function () {
        if (findRowNums_('Documents', 'document_id', p.document_id).length) throw validationError_([fieldError_('document_id', 'ID_EXISTS')]);
        var row = {
          document_id: p.document_id, entity_type: p.entity_type, entity_id: p.entity_id,
          title_vi: trTitle.values.title_vi, title_zh: trTitle.values.title_zh, i18n_meta: trTitle.meta,
          kind: p.kind, drive_file_id: file.getId(), external_url: '', mime_type: p.mime_type, file_version: 1,
          access_scope: scope, document_date: p.document_date || dateVN_(now_()), active: true,
          managed_folder_id: folder.getId(), storage_kind: 'DRIVE', owned_by_app: true,
          drive_sharing_state: sharing, sharing_updated_at: nowIso, sharing_error_code: sharingErr,
          size_bytes: bytes.length, thumb_drive_file_id: thumb ? thumb.getId() : ''
        };
        cNew_(ctx, row);
        return {
          writes: [{ sheet: 'Documents', mode: 'insert', row: row }],
          result: { entity_type: 'DOCUMENT', entity_id: p.document_id, document_id: p.document_id, record_version: 1, record: projectDoc_(ctx, row) },
          record_version: 1,
          audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: null, after_json: { kind: p.kind, entity_type: p.entity_type, entity_id: p.entity_id, size_bytes: bytes.length, access_scope: scope } }
        };
      }
    });
  } catch (e) {
    trashQuietly_(file); trashQuietly_(thumb);
    throw e;
  }
  if (res.code === 'DUPLICATE_OPERATION') { trashQuietly_(file); trashQuietly_(thumb); }
  return res;
}

function trashQuietly_(f) {
  if (!f) return;
  try { f.setTrashed(true); } catch (e) { /* bỏ qua */ }
}

function docForRead_(ctx, documentId, action) {
  if (!isUuidV4_(documentId)) throw validationError_([fieldError_('document_id', 'ID_INVALID')]);
  var d = findOne_('Documents', 'document_id', documentId);
  if (!d || !d.active || d.archived_at) throw apiError_('NOT_FOUND');
  var module = docModule_(d.entity_type);
  authorize_(ctx, action, { module: module });
  if (d.access_scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');
  return d;
}

function docDownload_(ctx) {
  var d = docForRead_(ctx, (ctx.req.payload || {}).document_id, 'doc.download');
  var maxB = setting_('doc_max_bytes');
  if (d.size_bytes && d.size_bytes > maxB) throw validationError_([fieldError_('document_id', 'FILE_TOO_LARGE')]);
  var blob = DriveApp.getFileById(d.drive_file_id).getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > maxB) throw validationError_([fieldError_('document_id', 'FILE_TOO_LARGE')]);
  var ext = DOC_MIME_[d.mime_type] ? DOC_MIME_[d.mime_type].ext : 'bin';
  return {
    document_id: d.document_id, file_name: d.document_id + '.' + ext, mime_type: d.mime_type,
    size_bytes: bytes.length, file_version: d.file_version, content_b64: b64_(bytes)
  };
}

function docThumbs_(ctx) {
  var ids = (ctx.req.payload || {}).document_ids;
  if (!Array.isArray(ids) || ids.length > 30) throw validationError_([fieldError_('document_ids', 'INVALID_VALUE')]);
  var out = {};
  ids.forEach(function (id) {
    try {
      var d = docForRead_(ctx, id, 'doc.thumbs');
      if (d.access_scope !== 'LINK_VIEW' && d.drive_sharing_state !== 'REVOKED') return;
      var fid = d.thumb_drive_file_id || d.drive_file_id;
      out[id] = b64_(DriveApp.getFileById(fid).getBlob().getBytes());
    } catch (e) { /* bỏ ảnh không xem được */ }
  });
  return { thumbs: out };
}

function docView_(ctx) {
  var p = ctx.req.payload || {};
  var module = docModule_(p.entity_type);
  if (!module || !isUuidV4_(p.entity_id)) throw validationError_([fieldError_('entity_id', 'INVALID_VALUE')]);
  authorize_(ctx, 'doc.view', { module: module });
  var cost = canViewCost_(ctx, module);
  var items = findAll_('Documents', 'entity_id', p.entity_id).filter(function (d) {
    return d.active && !d.archived_at && d.entity_type === p.entity_type && (d.access_scope !== 'COST_VIEW' || cost);
  }).map(function (d) { return projectDoc_(ctx, d); });
  return { items: items };
}

/** Đưa file về riêng tư, kiểm lại rồi mới báo REVOKED (2.6) */
function makePrivate_(fileId) {
  var f = DriveApp.getFileById(fileId);
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
  return f.getSharingAccess() === DriveApp.Access.PRIVATE;
}

function docSetPrivate_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.document_id)) throw validationError_([fieldError_('document_id', 'ID_INVALID')]);
  var d0 = findOne_('Documents', 'document_id', p.document_id);
  if (!d0 || !d0.active) throw apiError_('NOT_FOUND');
  var module = docModule_(d0.entity_type);
  var auth = authorize_(ctx, 'doc.setPrivate', { module: module });
  if (auth.conds.length && d0.created_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
  // Gửi lại cùng mã thao tác (sau khi đã REVOKED) → trả kết quả cũ trước khi kiểm điều kiện
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  if (d0.access_scope !== 'LINK_VIEW' || d0.drive_sharing_state === 'REVOKED') throw validationError_([fieldError_('document_id', 'INVALID_VALUE')]);
  var ok = true, errCode = '';
  try {
    ok = makePrivate_(d0.drive_file_id);
    if (d0.thumb_drive_file_id) ok = makePrivate_(d0.thumb_drive_file_id) && ok;
  } catch (e) { ok = false; errCode = String(e && e.message || e).slice(0, 80); }
  return executeWrite_(ctx, {
    entity_type: 'DOCUMENT', entity_id: p.document_id,
    build: function () {
      var cur = findOne_('Documents', 'document_id', p.document_id);
      assertVersion_(ctx, cur, 'DOCUMENT', 'Documents');
      var row = clone_(cur);
      row.drive_sharing_state = ok ? 'REVOKED' : 'FAILED';
      row.sharing_updated_at = isoVN_(now_());
      row.sharing_error_code = ok ? '' : (errCode || 'NOT_PRIVATE');
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Documents', mode: 'update', row: row }],
        result: { entity_type: 'DOCUMENT', entity_id: p.document_id, drive_sharing_state: row.drive_sharing_state, record_version: row.record_version, record: projectDoc_(ctx, row) },
        record_version: row.record_version,
        audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: { drive_sharing_state: cur.drive_sharing_state }, after_json: { drive_sharing_state: row.drive_sharing_state } }
      };
    }
  });
}

/** doc.upload kèm external_url (không có tệp): liên kết tài liệu ngoài, riêng tư theo loại (EQ-04) */
function docAddLink_(ctx) {
  var p = ctx.req.payload;
  var errs = [];
  if (!isUuidV4_(p.document_id)) errs.push(fieldError_('document_id', 'ID_INVALID'));
  var et = ENTITY_TYPES[p.entity_type];
  if (!et || !et.module) errs.push(fieldError_('entity_type', 'INVALID_VALUE'));
  if (!isUuidV4_(p.entity_id)) errs.push(fieldError_('entity_id', 'ID_INVALID'));
  var scope = DOC_KIND_SCOPE[p.kind];
  if (!scope || scope === 'LINK_VIEW') errs.push(fieldError_('kind', 'INVALID_VALUE'));
  var url = trimStr_(p.external_url);
  if (!/^https:\/\/[^\s<>"]{3,2000}$/.test(url)) errs.push(fieldError_('external_url', 'URL_INVALID'));
  if (p.document_date && !isDateStr_(p.document_date)) errs.push(fieldError_('document_date', 'INVALID_DATE'));
  requireOneLang_(errs, p, null, 'title');
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var module = et.module;
  var auth = authorize_(ctx, 'doc.upload', { module: module });
  var entity = findOne_(et.sheet, et.key, p.entity_id);
  if (!entity || entity.archived_at) throw validationError_([fieldError_('entity_id', 'NOT_FOUND')]);
  if (!docUploadCondOk_(ctx, auth, module, p.kind, entity)) throw apiError_('FORBIDDEN');
  if (scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');
  var tr = applyTranslations_('Documents', ['title'], { title_vi: p.title_vi, title_zh: p.title_zh }, null);
  return executeWrite_(ctx, {
    entity_type: 'DOCUMENT', entity_id: p.document_id,
    build: function () {
      if (findRowNums_('Documents', 'document_id', p.document_id).length) throw validationError_([fieldError_('document_id', 'ID_EXISTS')]);
      var row = {
        document_id: p.document_id, entity_type: p.entity_type, entity_id: p.entity_id,
        title_vi: tr.values.title_vi, title_zh: tr.values.title_zh, i18n_meta: tr.meta,
        kind: p.kind, drive_file_id: '', external_url: url, mime_type: '', file_version: 1, access_scope: scope,
        document_date: p.document_date || dateVN_(now_()), active: true, managed_folder_id: '', storage_kind: 'LINK',
        owned_by_app: false, drive_sharing_state: 'NOT_SHARED', sharing_updated_at: '', sharing_error_code: '', size_bytes: '', thumb_drive_file_id: ''
      };
      cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Documents', mode: 'insert', row: row }],
        result: { entity_type: 'DOCUMENT', entity_id: p.document_id, document_id: p.document_id, record_version: 1, record: projectDoc_(ctx, row) },
        record_version: 1,
        audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: null, after_json: { kind: p.kind, entity_type: p.entity_type, entity_id: p.entity_id, external_url: url } }
      };
    }
  });
}

/** doc.archive: gỡ tài liệu khỏi hồ sơ (không xóa file Drive); ảnh LINK_VIEW đưa về riêng tư (2.6) */
function docArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.document_id)) throw validationError_([fieldError_('document_id', 'ID_INVALID')]);
  var d0 = findOne_('Documents', 'document_id', p.document_id);
  if (!d0) throw apiError_('NOT_FOUND');
  var module = docModule_(d0.entity_type);
  var auth = authorize_(ctx, 'doc.archive', { module: module });
  if (auth.conds.length && d0.created_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
  if (d0.access_scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  if (!d0.active || d0.archived_at) throw validationError_([fieldError_('document_id', 'INVALID_VALUE')]);
  var share = null;
  if (d0.access_scope === 'LINK_VIEW' && d0.drive_sharing_state === 'LINK_SHARED') {
    var ok = true, err = '';
    try {
      ok = makePrivate_(d0.drive_file_id);
      if (d0.thumb_drive_file_id) ok = makePrivate_(d0.thumb_drive_file_id) && ok;
    } catch (e) { ok = false; err = String(e && e.message || e).slice(0, 80); }
    share = { state: ok ? 'REVOKED' : 'FAILED', err: ok ? '' : (err || 'NOT_PRIVATE') };
  }
  return executeWrite_(ctx, {
    entity_type: 'DOCUMENT', entity_id: p.document_id,
    build: function () {
      var cur = findOne_('Documents', 'document_id', p.document_id);
      assertVersion_(ctx, cur, 'DOCUMENT', 'Documents');
      var row = clone_(cur);
      row.active = false;
      row.archived_at = isoVN_(now_());
      if (share) { row.drive_sharing_state = share.state; row.sharing_error_code = share.err; row.sharing_updated_at = row.archived_at; }
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Documents', mode: 'update', row: row }],
        result: { entity_type: 'DOCUMENT', entity_id: p.document_id, record_version: row.record_version, archived: true },
        record_version: row.record_version,
        audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: { active: true }, after_json: { active: false, drive_sharing_state: row.drive_sharing_state }, reason: trimStr_(p.reason) }
      };
    }
  });
}

// ===== 13_sync.js =====
/* 13_sync: sync.bootstrap, sync.changes, sync.push, sync.getOperationStatus (phụ lục 1.5 mục 3.15) */

var SYNC_ENTITIES_ = [
  { type: 'LOCATION', sheet: 'Locations', action: 'catalog.view', module: 'catalog' },
  { type: 'VENDOR', sheet: 'Vendors', action: 'catalog.view', module: 'catalog' },
  { type: 'LOOKUP', sheet: 'LookupValues', action: 'catalog.view', module: 'catalog' },
  { type: 'EQUIPMENT', sheet: 'Equipment', action: 'equipment.view', module: 'equipment', qr: true },
  { type: 'EQUIPMENT_SPEC', sheet: 'EquipmentSpecs', action: 'equipment.view', module: 'equipment' },
  { type: 'MATERIAL', sheet: 'Materials', action: 'material.view', module: 'warehouse', qr: true },
  { type: 'EQUIPMENT_PART', sheet: 'EquipmentParts', action: 'equipment.view', module: 'equipment' },
  { type: 'EQUIPMENT_PART_EVENT', sheet: 'EquipmentPartEvents', action: 'equipment.view', module: 'equipment' },
  { type: 'CONTRACT', sheet: 'Contracts', action: 'contract.view', module: 'contracts', qr: true },
  { type: 'CONTRACT_EQUIPMENT', sheet: 'ContractEquipment', action: 'contract.view', module: 'contracts' },
  { type: 'CONTRACT_SERVICE', sheet: 'ContractServices', action: 'contract.view', module: 'contracts' },
  { type: 'INSPECTION_TYPE', sheet: 'InspectionTypes', action: 'inspection.view', module: 'inspections' },
  { type: 'INSPECTION_REQUIREMENT', sheet: 'InspectionRequirements', action: 'inspection.view', module: 'inspections', qr: true },
  { type: 'INSPECTION', sheet: 'Inspections', action: 'inspection.view', module: 'inspections', qr: true },
  { type: 'ALERT', sheet: 'Alerts', action: 'alert.view', module: '*alert' },
  { type: 'DOCUMENT', sheet: 'Documents', action: 'doc.view', module: null }
];

/** Dòng → bản ghi gửi client; null nếu không được xem */
function syncProject_(ctx, ent, row, qm, costCache) {
  if (ent.type === 'DOCUMENT') {
    var mod = docModule_(row.entity_type);
    if (!mod || !row.active) return null;
    if (!(mod in costCache)) {
      costCache[mod] = { view: can_(ctx, 'doc.view', { module: mod }), cost: canViewCost_(ctx, mod) };
    }
    if (!costCache[mod].view) return null;
    if (row.access_scope === 'COST_VIEW' && !costCache[mod].cost) return null;
    return projectDoc_(ctx, row);
  }
  if (ent.type === 'ALERT') {
    // Cảnh báo đã đóng → xóa ở máy; module theo loại hồ sơ
    if (row.alert_state === 'RESOLVED') return null;
    var am = alertModule_(row.entity_type);
    if (!(('alert:' + am) in costCache)) costCache['alert:' + am] = can_(ctx, 'alert.view', { module: am });
    if (!costCache['alert:' + am]) return null;
    return projectRow_(ctx, row, ent.sheet);
  }
  var o = projectRow_(ctx, row, ent.sheet);
  if (ent.qr) o.qr_key = qm[o[sheetSchema_(ent.sheet).key]] || null;
  return o;
}

function visibleEntities_(ctx) {
  return SYNC_ENTITIES_.filter(function (ent) {
    if (!ent.module) return true;
    if (ent.module === '*alert') return can_(ctx, ent.action, { module: 'inspections' }) || can_(ctx, ent.action, { module: 'contracts' });
    return can_(ctx, ent.action, { module: ent.module });
  });
}

function syncBootstrap_(ctx) {
  var p = ctx.req.payload || {};
  var pageSize = Math.min(2000, setting_('sync_page_size') || 500);
  var tok = String(p.page_token || '0:0').split(':');
  var ei = Number(tok[0]) || 0, off = Number(tok[1]) || 0;
  var cursor = p.page_token && p.sync_cursor ? Number(p.sync_cursor) : Number(stateGet_(readState_(), 'sync_revision', 0));
  var ents = visibleEntities_(ctx);
  var qm = qrMap_();
  var costCache = {};
  var records = {};
  var count = 0;
  var next = null;
  var t0 = Date.now();
  for (; ei < ents.length; ei++) {
    var ent = ents[ei];
    var rows = readRows_(ent.sheet);
    var list = records[ent.type] = records[ent.type] || [];
    for (var i = off; i < rows.length; i++) {
      if (count >= pageSize || Date.now() - t0 > 15000) { next = ei + ':' + i; break; }
      if (rows[i].archived_at) continue;
      var o = syncProject_(ctx, ent, rows[i], qm, costCache);
      if (o) { list.push(o); count++; }
    }
    off = 0;
    if (next) break;
  }
  var out = { records: records, next_page_token: next, sync_cursor: String(cursor) };
  if (!p.page_token) {
    out.user = publicUser_(ctx.user);
    out.subroles = ctxSubroles_(ctx);
    out.settings = clientSettings_();
    out.permissions = permissionSummary_(ctx);
    out.server_version = SERVER_VERSION;
    out.env = envName_();
    out.server_today = todayVN_();
  }
  return out;
}

function clientSettings_() {
  var s = settings_();
  var out = {};
  SETTINGS_DEFAULTS.forEach(function (d) { if (d[3]) out[d[0]] = s[d[0]]; });
  return out;
}

function syncChanges_(ctx) {
  var p = ctx.req.payload || {};
  var cursor = Number(p.cursor);
  if (!(cursor >= 0)) throw validationError_([fieldError_('cursor', 'INVALID_VALUE')]);
  var limit = Math.min(500, Number(p.limit) || 500);
  var st = readState_();
  var head = Number(stateGet_(st, 'sync_revision', 0));
  var qm = null, costCache = {};
  var changes = [];
  visibleEntities_(ctx).forEach(function (ent) {
    if (Number(stateGet_(st, 'table_rev.' + ent.sheet, 0)) <= cursor) return;
    if (ent.qr && !qm) qm = qrMap_();
    var key = sheetSchema_(ent.sheet).key;
    readRows_(ent.sheet).forEach(function (r) {
      if (!(Number(r.sync_revision || 0) > cursor)) return;
      var o = r.archived_at ? null : syncProject_(ctx, ent, r, qm || {}, costCache);
      changes.push({
        entity_type: ent.type, entity_id: r[key], op: o ? 'UPSERT' : 'TOMBSTONE',
        record_version: r.record_version, sync_revision: r.sync_revision, data: o
      });
    });
  });
  changes.sort(function (a, b) { return a.sync_revision - b.sync_revision; });
  var hasMore = false;
  if (changes.length > limit) {
    var cut = changes[limit - 1].sync_revision;
    var k = limit;
    while (k < changes.length && changes[k].sync_revision === cut) k++;
    hasMore = k < changes.length;
    changes = changes.slice(0, k);
  }
  var nextCursor = hasMore ? changes[changes.length - 1].sync_revision : head;
  return {
    changes: changes, next_cursor: String(nextCursor), has_more: hasMore,
    perm_version: sysStateCached_().perm_version || 1, sync_cursor: String(nextCursor), server_today: todayVN_(), server_version: SERVER_VERSION
  };
}

/** Một thao tác của hàng chờ offline (3.15) */
function syncPush_(ctx) {
  var op = (ctx.req.payload || {}).op;
  if (!op || typeof op !== 'object' || typeof op.action !== 'string') throw validationError_([fieldError_('op', 'REQUIRED')]);
  var def = ACTION_REGISTRY[op.action];
  if (!def || def.net === 'internal') throw apiError_('FORBIDDEN');
  if (def.net === 'pin') throw apiError_('REAUTH_REQUIRED');
  if (def.net !== 'offline') throw validationError_([fieldError_('op.action', 'NEEDS_NETWORK')]);
  var inner = {
    api_contract_version: ctx.req.api_contract_version, action: op.action, payload: op.payload || {},
    token: ctx.req.token, operation_id: op.operation_id, dataset_epoch: ctx.req.dataset_epoch,
    device_id: ctx.req.device_id, expected_version: op.expected_version, app_version: ctx.req.app_version,
    client_time: op.local_created_at
  };
  var env;
  try {
    env = dispatchInner_(inner, true);
  } catch (e) {
    env = errorToResponse_(inner, e);
  }
  return { __envelope: env };
}

function syncOpStatus_(ctx) {
  var id = (ctx.req.payload || {}).operation_id;
  if (!isUuidV4_(id)) throw validationError_([fieldError_('operation_id', 'ID_INVALID')]);
  var ex = findOne_('Operations', 'operation_id', id);
  if (!ex || ex.user_id !== ctx.user.user_id) return { operation_id: id, state: 'NOT_FOUND' };
  return {
    operation_id: id, state: ex.state, result_code: ex.result_code, action: ex.action,
    committed_at: ex.committed_at, result: ex.result_json || null,
    record_version: ex.result_json ? ex.result_json.record_version : null
  };
}

// ===== 14_qr.js =====
/* 14_qr: tra QR (phụ lục 1.5 mục 2.8, 3.4) */

var VIEW_ACTION_BY_MODULE_ = {
  equipment: 'equipment.view', warehouse: 'material.view', contracts: 'contract.view', inspections: 'inspection.view'
};

/**
 * qr.resolve {qr_key} hoặc {code}. Client đã lọc chuỗi lạ (qr.foreign).
 * data.qr_state: OK | INACTIVE | UNAVAILABLE | EXPIRED | NOT_IN_RESTORED
 */
function qrResolve_(ctx) {
  var p = ctx.req.payload || {};
  var row = null;
  if (p.qr_key) {
    var k = normalizeQrKey_(p.qr_key);
    if (k) row = findOne_('QrRegistry', 'qr_key', k);
  } else if (p.code) {
    var code = trimStr_(p.code).toUpperCase();
    var cands = findAll_('QrRegistry', 'code', code);
    row = cands.filter(function (r) { return can_(ctx, VIEW_ACTION_BY_MODULE_[ENTITY_TYPES[r.entity_type].module], { module: ENTITY_TYPES[r.entity_type].module }); })[0] || null;
  } else {
    throw validationError_([fieldError_('qr_key', 'REQUIRED')]);
  }
  if (!row) {
    var s = sysStateCached_();
    var reset = parseTime_(s.last_reset_at), restore = parseTime_(s.last_restore_at);
    if (restore && (!reset || restore.getTime() > reset.getTime())) return { qr_state: 'NOT_IN_RESTORED', restored_backup_at: s.restored_backup_at };
    if (reset) return { qr_state: 'EXPIRED', last_reset_at: s.last_reset_at };
    return { qr_state: 'UNAVAILABLE' };
  }
  var et = ENTITY_TYPES[row.entity_type];
  var viewAction = et ? VIEW_ACTION_BY_MODULE_[et.module] : null;
  if (!viewAction || !can_(ctx, 'qr.resolve', { module: et.module }) || !can_(ctx, viewAction, { module: et.module })) {
    return { qr_state: 'UNAVAILABLE' };
  }
  return {
    qr_state: row.active ? 'OK' : 'INACTIVE', entity_type: row.entity_type, entity_id: row.entity_id,
    code: row.code, qr_key: row.qr_key
  };
}

/**
 * qr.print {entity_type, ids}: dữ liệu tem (mã, tên, khu vực, qr_key) cho hồ sơ người in được xem; ghi AuditLogs số tem.
 * Tem không có logo, không giá, không PIN/token (6.5.2). Cần mạng (4.4.11).
 */
var PRINTABLE_ = { EQUIPMENT: 1, MATERIAL: 1, INSPECTION_REQUIREMENT: 1, CONTRACT: 1 };
function qrPrint_(ctx) {
  var p = ctx.req.payload || {};
  var et = ENTITY_TYPES[p.entity_type];
  if (!et || !PRINTABLE_[p.entity_type]) throw validationError_([fieldError_('entity_type', 'INVALID_VALUE')]);
  if (!Array.isArray(p.ids) || !p.ids.length || p.ids.length > 240) throw validationError_([fieldError_('ids', 'INVALID_VALUE')]);
  authorize_(ctx, 'qr.print', { module: et.module });
  if (!can_(ctx, VIEW_ACTION_BY_MODULE_[et.module], { module: et.module })) throw apiError_('FORBIDDEN');
  var want = {};
  p.ids.forEach(function (id) { if (isUuidV4_(id)) want[id] = true; });
  var items = [];
  readRows_('QrRegistry').forEach(function (q) {
    if (q.entity_type !== p.entity_type || !want[q.entity_id] || !q.active) return;
    items.push({ entity_type: q.entity_type, entity_id: q.entity_id, code: q.code, qr_key: q.qr_key, name_vi: q.label_vi, name_zh: q.label_zh });
  });
  if (p.entity_type === 'EQUIPMENT' && items.length) {
    var locs = {};
    readRows_('Locations').forEach(function (l) { locs[l.location_id] = l.location_code; });
    var eqLoc = {};
    readRows_('Equipment').forEach(function (e) { eqLoc[e.equipment_id] = locs[e.location_id] || ''; });
    items.forEach(function (it) { it.location_code = eqLoc[it.entity_id] || ''; });
  }
  withWriteLock_(function () {
    writeAudit_({
      user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'qr.print', entity_type: p.entity_type, entity_id: items.length === 1 ? items[0].entity_id : '',
      before_json: null, after_json: { count: items.length, codes: items.slice(0, 50).map(function (x) { return x.code; }) }, operation_id: '', auth_basis: authBasis_(ctx)
    });
  });
  return { items: items, env: envName_() };
}

// ===== 15_admin.js =====
/* 15_admin: hàm chạy từ trình soạn Apps Script và trigger (phụ lục 1.5 mục 3.14)
 * Tên không có hậu tố "_" để hiện trong menu Chạy; không có tham số. */

function log_(msg) {
  Logger.log(msg);
}

/** Tạo một sheet với hàng tiêu đề, cố định hàng 1, định dạng ô theo kiểu (3.1) */
function createSheet_(book, name) {
  var s = sheetSchema_(name);
  var sheet = book.insertSheet(name);
  var cols = s.cols;
  if (sheet.getMaxColumns() < cols.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  formatColumns_(sheet, name, cols, 0);
  return sheet;
}

/** Đặt định dạng Văn bản (@) cho các cột ID/CODE/DATE/DATETIME/JSON/STRING/ENUM từ vị trí fromIdx; gom cột liền nhau */
function formatColumns_(sheet, name, headerCols, fromIdx) {
  var types = sheetSchema_(name).types;
  var rows = Math.max(1, sheet.getMaxRows() - 1);
  var i = fromIdx;
  while (i < headerCols.length) {
    if (!TEXT_FORMAT_TYPES_[types[headerCols[i]] || 'STRING']) { i++; continue; }
    var j = i;
    while (j + 1 < headerCols.length && TEXT_FORMAT_TYPES_[types[headerCols[j + 1]] || 'STRING']) j++;
    sheet.getRange(2, i + 1, rows, j - i + 1).setNumberFormat('@');
    i = j + 1;
  }
}

function settingRow_(d) {
  var v = d[1] === 'JSON' ? JSON.stringify(d[2]) : (d[1] === 'BOOL' ? (d[2] ? 'true' : 'false') : String(d[2]));
  return { setting_key: d[0], value: v, value_type: d[1], description_vi: d[5], description_zh: d[6], updated_at: isoVN_(now_()), updated_by: SYSTEM_USER, i18n_meta: { description: { src: 'vi', state: 'HUMAN', at: isoVN_(now_()) } } };
}

/** Dựng môi trường mới (THỬ hoặc THẬT). Đã có BUSINESS_SPREADSHEET_ID thì dừng. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('BUSINESS_SPREADSHEET_ID')) {
    log_('Đã cài đặt trước đó — không làm gì. Muốn thêm sheet/cột thì chạy migrateSchema.');
    return;
  }
  if (!props.getProperty('ENV')) props.setProperty('ENV', 'THU');
  var env = props.getProperty('ENV');
  if (env !== 'THU' && env !== 'THAT') throw new Error('ENV phải là THU hoặc THAT');
  adminSetupSecrets();
  var suffix = env === 'THU' ? '_THU' : '';
  var parent = DriveApp.createFolder(NAME_PREFIX + 'HeThong' + suffix);
  var dataFolder = parent.createFolder(NAME_PREFIX + 'Data' + suffix);
  var backupFolder = parent.createFolder(NAME_PREFIX + 'Backups' + suffix);
  var biz = SpreadsheetApp.create(NAME_PREFIX + 'NghiepVu' + suffix);
  var sec = SpreadsheetApp.create(NAME_PREFIX + 'BaoMat' + suffix);
  biz.setSpreadsheetTimeZone(TZ);
  sec.setSpreadsheetTimeZone(TZ);
  DriveApp.getFileById(biz.getId()).moveTo(parent);
  DriveApp.getFileById(sec.getId()).moveTo(parent);
  props.setProperties({
    BUSINESS_SPREADSHEET_ID: biz.getId(), SECURITY_SPREADSHEET_ID: sec.getId(),
    DRIVE_ROOT_FOLDER_ID: dataFolder.getId(), DRIVE_BACKUP_FOLDER_ID: backupFolder.getId(),
    DATASET_EPOCH: uuid_(), MAINTENANCE_MODE: 'false'
  });
  dbReset_();
  sheetsForDot_(RELEASED_DOT).forEach(function (name) {
    createSheet_(sheetSchema_(name).book === 'S' ? sec : biz, name);
  });
  [biz, sec].forEach(function (b) {
    b.getSheets().forEach(function (s) { if (!SHEETS[s.getName()]) b.deleteSheet(s); });
  });
  dbReset_();
  seedBaseRows_();
  clearSysCaches_();
  log_('Xong setup. ENV=' + env + '. Đã tạo ' + sheetsForDot_(RELEASED_DOT).length + ' sheet trong thư mục ' + parent.getName() +
    '. Bước tiếp theo: đặt SETUP_OWNER_CODE, SETUP_OWNER_NAME, SETUP_OWNER_TEMP_PIN rồi chạy adminSetupOwner.');
}

/** Nạp Settings, SystemState, RolePermissions còn thiếu (dùng chung cho setup và migrateSchema) */
function seedBaseRows_() {
  withWriteLock_(function () {
    var have = {};
    readRows_('Settings').forEach(function (r) { have[r.setting_key] = true; });
    var add = SETTINGS_DEFAULTS.filter(function (d) { return d[4] <= RELEASED_DOT && !have[d[0]]; }).map(settingRow_);
    if (add.length) insertRows_('Settings', add);

    var st = readState_();
    var su = {};
    SYSTEM_STATE_INITIAL.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(st.map, k[0])) su[k[0]] = [k[1], k[2]];
    });
    su.dataset_epoch = ['STRING', prop_('DATASET_EPOCH')];
    su.maintenance_mode = ['BOOL', prop_('MAINTENANCE_MODE') === 'true'];
    su.schema_version = ['STRING', SCHEMA_VERSION];
    stateWrite_(st, su, SYSTEM_USER);
    seedRolePermissions_();
  });
}

/** Nạp đủ 60 dòng RolePermissions; chỉ thêm dòng còn thiếu (4.8) */
function seedRolePermissions_() {
  var have = {};
  readRows_('RolePermissions').forEach(function (r) { have[r.permission_id] = true; });
  var nowIso = isoVN_(now_());
  var add = defaultRolePermissionRows_().filter(function (r) { return !have[r.permission_id]; });
  add.forEach(function (r) { r.updated_at = nowIso; r.updated_by = SYSTEM_USER; });
  if (add.length) insertRows_('RolePermissions', add);
  return add.length;
}

/** Thêm sheet/cột/Settings/RolePermissions còn thiếu của đợt; chạy nhiều lần vẫn cùng kết quả */
function migrateSchema() {
  if (!prop_('BUSINESS_SPREADSHEET_ID')) throw new Error('Chưa setup');
  dbReset_();
  var added = [];
  sheetsForDot_(RELEASED_DOT).forEach(function (name) {
    var s = sheetSchema_(name);
    var book = book_(s.book);
    var sheet = book.getSheetByName(name);
    if (!sheet) { createSheet_(book, name); added.push(name); return; }
    var n = sheet.getLastColumn();
    var header = n ? sheet.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
    var missing = s.cols.filter(function (c) { return header.indexOf(c) < 0; });
    if (missing.length) {
      if (sheet.getMaxColumns() < header.length + missing.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length + missing.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
      added.push(name + '(' + missing.join(',') + ')');
    }
    // Định dạng Văn bản cho mọi cột kiểu chuỗi, kể cả cột cũ vừa đổi kiểu (vd. due_revision)
    formatColumns_(sheet, name, header.concat(missing), 0);
  });
  dbReset_();
  seedBaseRows_();
  clearSysCaches_();
  log_('migrateSchema xong. Thêm: ' + (added.length ? added.join('; ') : 'không có') + '. schema_version=' + SCHEMA_VERSION);
}

function clearSysCaches_() {
  cache_().removeAll(['sys:props', 'sys:state', 'cfg:settings']);
}

/** Sinh PIN_PEPPER_V1, TOKEN_SECRET_V1 nếu chưa có; không ghi đè */
function adminSetupSecrets() {
  var props = PropertiesService.getScriptProperties();
  ['PIN_PEPPER_V1', 'TOKEN_SECRET_V1'].forEach(function (k) {
    if (props.getProperty(k)) { log_(k + ': đã có, giữ nguyên.'); return; }
    props.setProperty(k, b64_(randomSecret32_()));
    log_(k + ': đã tạo.');
  });
}

/** Tạo owner đầu tiên từ SETUP_OWNER_CODE, SETUP_OWNER_NAME, SETUP_OWNER_TEMP_PIN; xóa ba khóa ngay sau khi dùng */
function adminSetupOwner() {
  if (!prop_('BUSINESS_SPREADSHEET_ID')) throw new Error('Chưa setup — chạy setup trước.');
  var code = normEmpCode_(prop_('SETUP_OWNER_CODE'));
  var name = trimStr_(prop_('SETUP_OWNER_NAME'));
  var pin = trimStr_(prop_('SETUP_OWNER_TEMP_PIN'));
  if (!code || !name || !pin) throw new Error('Thiếu SETUP_OWNER_CODE / SETUP_OWNER_NAME / SETUP_OWNER_TEMP_PIN trong Thuộc tính tập lệnh.');
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(code)) throw new Error('Mã nhân viên chỉ gồm chữ, số, dấu . _ -');
  var weak = pinWeakReason_(pin, code, null);
  if (weak) throw new Error('PIN tạm không hợp lệ hoặc quá dễ đoán (' + weak + '). Chọn 6 số khác.');
  dbReset_();
  var created = withWriteLock_(function () {
    var users = readRows_('Users');
    if (users.some(function (u) { return u.is_system_owner && u.active && Number(u.role_level) === 4; })) {
      return 'EXISTS';
    }
    if (users.some(function (u) { return u.employee_code === code; })) throw new Error('Mã nhân viên đã tồn tại: ' + code);
    var rec = newPinRecord_(pin);
    var nowIso = isoVN_(now_());
    insertRows_('Users', [{
      user_id: uuid_(), employee_code: code, display_name: name, email: '', role_level: 4, active: true,
      pin_hash: rec.pin_hash, salt: rec.salt, pin_hash_version: rec.pin_hash_version, failed_attempts: 0, locked_until: '',
      created_at: nowIso, updated_at: nowIso, auth_version: 1, is_system_owner: true, must_change_pin: true,
      temp_pin_expires_at: isoVN_(new Date(now_().getTime() + setting_('temp_pin_hours') * 3600000)), pin_changed_at: '',
      failed_window_started_at: '', last_login_at: '', record_version: 1, created_by: SYSTEM_USER, updated_by: SYSTEM_USER
    }]);
    return 'CREATED';
  });
  ['SETUP_OWNER_CODE', 'SETUP_OWNER_NAME', 'SETUP_OWNER_TEMP_PIN'].forEach(delProp_);
  if (created === 'EXISTS') log_('Đã có owner đang hoạt động — không tạo thêm. Đã xóa 3 khóa SETUP_OWNER_*.');
  else log_('Đã tạo owner ' + code + ' (cấp 4). Đăng nhập bằng PIN tạm trong 72 giờ, app sẽ bắt đổi PIN. Đã xóa 3 khóa SETUP_OWNER_*.');
}

var TRIGGER_FUNCS_ = ['sendExpiryDigest', 'runBackgroundJobs', 'backupData'];

/** Xóa trigger trùng tên rồi tạo lại đúng 3 trigger định kỳ */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_FUNCS_.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendExpiryDigest').timeBased().everyDays(1).atHour(Number(setting_('email_hour'))).inTimezone(TZ).create();
  ScriptApp.newTrigger('runBackgroundJobs').timeBased().everyHours(3).create();
  var wd = ScriptApp.WeekDay[String(setting_('backup_weekday') || 'SUNDAY')] || ScriptApp.WeekDay.SUNDAY;
  ScriptApp.newTrigger('backupData').timeBased().onWeekDay(wd).atHour(Number(setting_('backup_hour'))).inTimezone(TZ).create();
  var names = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  log_('Đã cài trigger: ' + names.join(', '));
}

function setMaintenance_(on) {
  setProp_('MAINTENANCE_MODE', on ? 'true' : 'false');
  withWriteLock_(function () {
    var st = readState_();
    stateWrite_(st, { maintenance_mode: ['BOOL', !!on] }, SYSTEM_USER);
  });
  cache_().removeAll(['sys:props', 'sys:state']);
}

function adminMaintenanceOn() { setMaintenance_(true); log_('Đã BẬT bảo trì.'); }
function adminMaintenanceOff() { setMaintenance_(false); log_('Đã TẮT bảo trì.'); }

function adminClearLoginPause() {
  withWriteLock_(function () {
    var st = readState_();
    stateWrite_(st, { login_paused_until: ['DATETIME', ''] }, SYSTEM_USER);
  });
  cache_().remove('sys:state');
  log_('Đã gỡ tạm dừng đăng nhập.');
}

function adminFlushAuthCache() {
  var keys = [];
  readRows_('Sessions').forEach(function (s) { keys.push('ss:' + s.session_id); });
  readRows_('Users').forEach(function (u) {
    keys.push('us:' + u.user_id);
    for (var v = 0; v <= (u.auth_version || 0) + 1; v++) keys.push('scope:' + u.user_id + ':' + v);
  });
  for (var i = 0; i < keys.length; i += 500) cache_().removeAll(keys.slice(i, i + 500));
  log_('Đã xóa ' + keys.length + ' khóa cache phiên/người dùng.');
}

/* adminFinalizeManualRestore (khôi phục thủ công) ở 23_backup.js */

/* ---------------- Trigger ---------------- */

/* sendExpiryDigest (trigger hằng ngày) ở 19_alerts.js */

/* runBackgroundJobs (dịch bù) ở 21_i18n.js */

/* backupData (sao lưu hằng tuần) ở 23_backup.js */

// ===== 16_poc.js =====
/* 16_poc: hàm thử của Bước 0 — PoC (phụ lục 1.5 mục 6.2). Chỉ chạy khi ENV = THU.
 * Gỡ bỏ sau khi PoC đạt. Không có dữ liệu thật. */

/** Test vector cố định (3.5): giá trị mong đợi tính độc lập bằng Node crypto */
var POC_VECTORS_ = {
  pepper_b64: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  salt_b64: 'EBESExQVFhcYGRobHB0eHw==',
  secret_b64: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=',
  pin: '049271',
  employee_code: 'NV-001',
  sid: '123e4567-e89b-42d3-a456-426614174000',
  exp: 1791331200,
  text: 'M&E · 机电管理 12 350 m³',
  expect: {
    pin_hash: 'BReBCRePhH+MbkyQq1hJPsdSpt4GE3jhRBc/qYy6+HU=',
    emp_hash: 'Tw8KXV5ZzmfwB9XszzN-ZSCiCD6t0jcmeNzTBuIEjFA',
    token_sig: 'JZkRevpOW9B2Te2BIsjcK0PRfZMpOVY3fmS0HfCIKpc',
    text_sha256: 'iTFTlPCv9PGpUG_YtDFpcVGUMOdI8N8IknEaQz_-co8',
    crockford: 'SG848JMCCX4SF8ZNVAET'
  }
};

function pocComputeVectors_() {
  var v = POC_VECTORS_;
  var pepper = b64d_(v.pepper_b64), salt = b64d_(v.salt_b64), secret = b64d_(v.secret_b64);
  var got = {
    pin_hash: pinHash_(v.pin, salt, pepper),
    emp_hash: empHash_(v.employee_code, pepper),
    token_sig: b64url_(hmac256_(utf8Bytes_('v1.' + v.sid + '.' + v.exp), secret)),
    text_sha256: b64url_(sha256_(v.text)),
    crockford: crockford_(sha256_('qr-test'), 20)
  };
  var pass = {};
  Object.keys(v.expect).forEach(function (k) { pass[k] = got[k] === v.expect[k]; });
  return { got: got, expect: v.expect, pass: pass, all_pass: Object.keys(pass).every(function (k) { return pass[k]; }) };
}

/**
 * P-01: ghi lại các request system.getPublicState thật sự chạy doPost (theo probe_run/probe_seq)
 * và các lần doGet bị gọi không có action (POST bị chuyển thành GET trên đường đi).
 */
function pocProbe_(p) {
  var run = String(p.probe_run || '');
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(run)) return null;
  var c = cache_();
  var key = 'diag:probe:' + run;
  if (p.probe_read) {
    var gets = c.get('diag:gets');
    return { run: run, seen: JSON.parse(c.get(key) || '[]'), gets_without_action: gets ? JSON.parse(gets) : [] };
  }
  var seq = Number(p.probe_seq);
  if (seq >= 0 && seq < 1000) {
    var seen = JSON.parse(c.get(key) || '[]');
    seen.push(seq);
    c.put(key, JSON.stringify(seen.slice(-200)), 3600);
  }
  return null;
}

/** Ghi thời điểm doGet bị gọi không có action (giữ 50 lần gần nhất, 6 giờ) */
function pocNoteGet_() {
  if (!isTestEnv_()) return;
  try {
    var c = cache_();
    var list = JSON.parse(c.get('diag:gets') || '[]');
    list.push(isoVN_(now_()));
    c.put('diag:gets', JSON.stringify(list.slice(-50)), 21600);
  } catch (e) { /* bỏ qua */ }
}

function pocVectors_() {
  return pocComputeVectors_();
}

function pocEcho_(ctx) {
  return { user_id: ctx.user.user_id, server_time: isoVN_(now_()), payload_size: JSON.stringify(ctx.req.payload || {}).length };
}

/** P-17: request chạy lâu; ghi một Operation sau khi ngủ để client kiểm UNKNOWN_RESULT → getOperationStatus */
function pocSleep_(ctx) {
  var sec = Math.max(0, Math.min(80, Number((ctx.req.payload || {}).seconds) || 0));
  if (sec) Utilities.sleep(sec * 1000);
  return executeWrite_(ctx, {
    entity_type: 'POC', entity_id: '',
    build: function () {
      return { writes: [], result: { slept_seconds: sec, finished_at: isoVN_(now_()) }, record_version: null };
    }
  });
}

/** P-10: đếm thiết bị thử và kiểm trùng mã */
function pocStats_(ctx) {
  var prefix = trimStr_((ctx.req.payload || {}).name_prefix) || 'P10-';
  var rows = readRows_('Equipment');
  var codes = {}, dupCodes = [], ids = {}, dupIds = [];
  rows.forEach(function (r) {
    if (codes[r.equipment_code]) dupCodes.push(r.equipment_code); else codes[r.equipment_code] = 1;
    if (ids[r.equipment_id]) dupIds.push(r.equipment_id); else ids[r.equipment_id] = 1;
  });
  var tagged = rows.filter(function (r) { return String(r.name_vi).indexOf(prefix) === 0; });
  var byDevice = {};
  tagged.forEach(function (r) { var d = String(r.name_vi).split('-')[1] || '?'; byDevice[d] = (byDevice[d] || 0) + 1; });
  return { total_equipment: rows.length, tagged: tagged.length, by_device: byDevice, duplicate_codes: dupCodes, duplicate_ids: dupIds };
}

/** P-12: gửi 1 thư thử tới địa chỉ tài khoản M&E, đọc quota */
function pocMailRun_() {
  var to = Session.getEffectiveUser().getEmail();
  var before = MailApp.getRemainingDailyQuota();
  var body = [
    'Thư thử của M&E (PoC, môi trường THỬ) · M&E测试邮件（PoC，测试环境）',
    '',
    'Kiểm ký tự (P-18) · 字符检查:',
    '  Số: 12 350 · 1 250 000 VND',
    '  Đơn vị: 130 kWh · 4 × 6 mm² · 25 m³/h',
    '  Ngày: 07/10/2026 08:05',
    '  Dải: 01/10/2026 – 05/10/2026',
    '',
    'Không trả lời thư này · 请勿回复此邮件'
  ].join('\n');
  MailApp.sendEmail({ to: to, subject: '[M&E] Thư thử PoC · PoC测试邮件', body: body });
  return { sent_to_self: true, quota_before: before, quota_after: MailApp.getRemainingDailyQuota() };
}

function pocMail_() {
  return pocMailRun_();
}

var POC_MT_VI_ = [
  'Máy nén khí trục vít', 'Bơm nước cấp lò hơi', 'Tủ điện phân phối tầng 2', 'Kiểm tra rò rỉ dầu và siết bu lông',
  'Thay vòng bi động cơ', 'Áp suất làm việc thấp hơn định mức', 'Quạt hút khói xưởng sơn', 'Máy biến áp 1000 kVA',
  'Vệ sinh lưới lọc gió', 'Đo điện trở cách điện', 'Hệ thống chữa cháy tự động', 'Thang máy chở hàng',
  'Nồi hơi đốt than', 'Kiểm định an toàn bình chịu áp lực', 'Hợp đồng bảo trì điều hòa trung tâm',
  'Dây đai bị mòn, cần thay', 'Nhiệt độ ổ trục tăng cao', 'Rơ le nhiệt bị nhảy', 'Đồng hồ nước tổng',
  'Kho vật tư cơ điện', 'Cầu trục 5 tấn', 'Máy phát điện dự phòng', 'Van an toàn', 'Ống dẫn khí nén', 'Đèn chiếu sáng khẩn cấp'
];
var POC_MT_ZH_ = [
  '螺杆空压机', '锅炉给水泵', '二楼配电柜', '检查漏油并紧固螺栓', '更换电机轴承', '工作压力低于额定值', '涂装车间排烟风机',
  '1000 kVA 变压器', '清洗空气滤网', '测量绝缘电阻', '自动灭火系统', '载货电梯', '燃煤锅炉', '压力容器安全检验',
  '中央空调维保合同', '皮带磨损，需要更换', '轴承温度升高', '热继电器跳闸', '总水表', '机电物料库', '5吨桥式起重机',
  '备用发电机', '安全阀', '压缩空气管道', '应急照明灯'
];

/** P-14: thử LanguageApp — mã zh-CN/zh, contentType text, token giữ chỗ, gộp nhiều dòng, thời gian */
function pocTranslateRun_(budgetMs) {
  var t0 = Date.now();
  var out = { codes: {}, entities: null, tokens: {}, batch: null, singles: [], errors: [], calls: 0 };
  function tr(text, from, to, opt) {
    out.calls++;
    var s = Date.now();
    var r = LanguageApp.translate(text, from, to, opt || { contentType: 'text' });
    return { text: r, ms: Date.now() - s };
  }
  try {
    ['zh-CN', 'zh'].forEach(function (code) {
      try { var r = tr('Máy nén khí trục vít', 'vi', code); out.codes[code] = { ok: true, text: r.text, ms: r.ms }; }
      catch (e) { out.codes[code] = { ok: false, error: String(e.message || e) }; }
    });
    var ent = tr('Kiểm tra "A" & <B> \'C\'', 'vi', 'zh-CN');
    out.entities = { text: ent.text, has_html_entity: /&(amp|quot|lt|gt|#39);/.test(ent.text) };
    ['{{0}}', '[[0]]', '⟦0⟧', '__T0__', 'ZQX0ZQX'].forEach(function (tok) {
      var src = 'Thay ' + tok + ' cho máy nén khí số 3';
      try {
        var r = tr(src, 'vi', 'zh-CN');
        out.tokens[tok] = { kept: r.text.indexOf(tok) >= 0, text: r.text };
      } catch (e) { out.tokens[tok] = { kept: false, error: String(e.message || e) }; }
    });
    var lines = POC_MT_VI_.slice(0, 10).map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n');
    var b = tr(lines, 'vi', 'zh-CN');
    var outLines = b.text.split('\n').filter(function (l) { return l.trim(); });
    out.batch = { in_lines: 10, out_lines: outLines.length, ms: b.ms, ok: outLines.length === 10, sample: outLines.slice(0, 3) };
    for (var i = 0; i < POC_MT_VI_.length && Date.now() - t0 < budgetMs; i++) {
      var a = tr(POC_MT_VI_[i], 'vi', 'zh-CN');
      out.singles.push({ dir: 'vi>zh', src: POC_MT_VI_[i], text: a.text, ms: a.ms });
      if (Date.now() - t0 >= budgetMs) break;
      var z = tr(POC_MT_ZH_[i], 'zh-CN', 'vi');
      out.singles.push({ dir: 'zh>vi', src: POC_MT_ZH_[i], text: z.text, ms: z.ms });
    }
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  var ms = out.singles.map(function (s) { return s.ms; }).sort(function (x, y) { return x - y; });
  out.single_median_ms = ms.length ? ms[Math.floor(ms.length / 2)] : null;
  out.single_max_ms = ms.length ? ms[ms.length - 1] : null;
  out.total_ms = Date.now() - t0;
  return out;
}

function pocTranslate_() {
  return pocTranslateRun_(18000);
}

/** P-16: tạo tệp thử riêng tư 2, 5, 10 MB gắn vào thiết bị mẫu đầu tiên */
function pocMakeTestFiles_(ctx) {
  var eq = readRows_('Equipment').filter(function (r) { return !r.archived_at; })[0];
  if (!eq) throw validationError_([fieldError_('equipment', 'NOT_FOUND')]);
  var sizes = [2, 5, 10];
  var chunk = [];
  for (var i = 0; chunk.length < 65536; i++) {
    var dg = sha256_(Utilities.getUuid() + i);
    for (var k = 0; k < dg.length; k++) chunk.push(dg[k]);
  }
  var folder = appFolder_();
  var made = [];
  sizes.forEach(function (mb) {
    var n = mb * 1048576 - 64; // dưới giới hạn 10 MB
    var bytes = new Array(n);
    var head = utf8Bytes_('%PDF-1.4\n% M&E PoC test file\n');
    for (var j = 0; j < n; j++) bytes[j] = j < head.length ? head[j] : chunk[j % 65536];
    var docId = uuid_();
    var f = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', docId + '.pdf'));
    var row = {
      document_id: docId, entity_type: 'EQUIPMENT', entity_id: eq.equipment_id,
      title_vi: 'Tệp thử ' + mb + ' MB (PoC, không mở được)', title_zh: '测试文件 ' + mb + ' MB（PoC，无法打开）',
      i18n_meta: { title: { src: 'vi', state: 'HUMAN', at: isoVN_(now_()) } },
      kind: 'OTHER', drive_file_id: f.getId(), external_url: '', mime_type: 'application/pdf', file_version: 1,
      access_scope: 'MODULE_VIEW', document_date: dateVN_(now_()), active: true, managed_folder_id: folder.getId(),
      storage_kind: 'DRIVE', owned_by_app: true, drive_sharing_state: 'NOT_SHARED', sharing_updated_at: isoVN_(now_()),
      sharing_error_code: '', size_bytes: n, thumb_drive_file_id: ''
    };
    cNew_(ctx, row);
    withWriteLock_(function () {
      var st = readState_();
      var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
      row.sync_revision = rev;
      insertRows_('Documents', [row]);
      stateWrite_(st, { sync_revision: ['INT', rev], 'table_rev.Documents': ['INT', rev] }, ctx.user.user_id);
    });
    made.push({ document_id: docId, size_mb: mb, size_bytes: n });
  });
  return { equipment_id: eq.equipment_id, files: made };
}

/** P-16: makeCopy có mang theo chia sẻ không; trạng thái chia sẻ của ảnh LINK_VIEW mới nhất */
function pocDriveChecks_() {
  var docs = readRows_('Documents').filter(function (d) { return d.access_scope === 'LINK_VIEW' && d.drive_sharing_state === 'LINK_SHARED'; });
  if (!docs.length) return { note: 'Chưa có ảnh LINK_VIEW — tải một ảnh ở P-06 trước' };
  var d = docs[docs.length - 1];
  var f = DriveApp.getFileById(d.drive_file_id);
  var copy = f.makeCopy('poc-copy-' + d.document_id, appFolder_());
  var res = {
    original_access: String(f.getSharingAccess()), original_permission: String(f.getSharingPermission()),
    copy_access: String(copy.getSharingAccess()), copy_permission: String(copy.getSharingPermission())
  };
  res.copy_kept_sharing = res.copy_access === res.original_access;
  copy.setTrashed(true);
  return res;
}

function pocTriggers_() {
  return {
    triggers: ScriptApp.getProjectTriggers().map(function (t) { return { handler: t.getHandlerFunction(), type: String(t.getEventType()) }; }),
    mail_quota: MailApp.getRemainingDailyQuota(),
    effective_user_is_owner: true
  };
}

/* ---------------- Hàm chạy từ trình soạn (chỉ THỬ) ---------------- */

function assertPocEnv_() {
  if (!isTestEnv_()) throw new Error('Chỉ chạy ở môi trường THỬ (ENV = THU).');
  if (!prop_('BUSINESS_SPREADSHEET_ID')) throw new Error('Chưa setup.');
}

/** Kiểm test vector HMAC/base64url/SHA-256/Crockford trên Apps Script thật */
function pocTestVectors() {
  var r = pocComputeVectors_();
  Object.keys(r.pass).forEach(function (k) { log_((r.pass[k] ? 'ĐẠT  ' : 'LỖI  ') + k + ' = ' + r.got[k]); });
  log_(r.all_pass ? 'Tất cả test vector ĐẠT.' : 'Có test vector KHÔNG ĐẠT — báo lại cho người viết code.');
}

function pocMailTest() {
  assertPocEnv_();
  log_(JSON.stringify(pocMailRun_()));
}

function pocTranslateTest() {
  assertPocEnv_();
  log_(JSON.stringify(pocTranslateRun_(240000), null, 1));
}

/** Tạo dữ liệu MẪU cho PoC; chạy lại không tạo trùng. In PIN của tài khoản mẫu ra nhật ký (chỉ THỬ). */
function pocSeedSampleData() {
  assertPocEnv_();
  dbReset_();
  if (findRowNums_('Locations', 'location_code', 'KV-MAU1').length) { log_('Đã có dữ liệu mẫu — không tạo thêm.'); return; }
  var owner = readRows_('Users').filter(function (u) { return u.is_system_owner; })[0];
  var by = owner ? owner.user_id : SYSTEM_USER;
  var fake = { user: { user_id: by, role_level: 4 } };
  var pins = {};
  withWriteLock_(function () {
    var st = readState_();
    var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
    var su = { sync_revision: ['INT', rev] };
    function c(row) { cNew_(fake, row); row.sync_revision = rev; return row; }
    var hm = function (f) { var m = {}; m[f] = { src: 'vi', state: 'HUMAN', at: isoVN_(now_()) }; return m; };
    var locs = [['KV-MAU1', 'Xưởng A (MẪU)', 'A车间（示例）'], ['KV-MAU2', 'Xưởng B (MẪU)', 'B车间（示例）'], ['KV-MAU3', 'Trạm điện (MẪU)', '配电站（示例）']]
      .map(function (x) { return c({ location_id: uuid_(), location_code: x[0], parent_location_id: '', name_vi: x[1], name_zh: x[2], type: 'AREA', active: true, i18n_meta: hm('name') }); });
    var vends = [['NCC-MAU1', 'Công ty Kiểm định MẪU', 'Kiểm định thiết bị', '设备检验'], ['NCC-MAU2', 'Công ty Bảo trì MẪU', 'Bảo trì điều hòa', '空调维保']]
      .map(function (x) { return c({ vendor_id: uuid_(), vendor_code: x[0], name: x[1], contact_name: '', phone: '', email: '', address: '', services_vi: x[2], services_zh: x[3], active: true, i18n_meta: hm('services') }); });
    var cats = [['EQ_COMPRESSOR', 'Máy nén khí', '空压机'], ['EQ_PUMP', 'Bơm', '泵'], ['EQ_BOILER', 'Nồi hơi', '锅炉']]
      .map(function (x) { return c({ value_id: uuid_(), group_key: 'EQUIPMENT_CATEGORY', code: x[0], name_vi: x[1], name_zh: x[2], parent_value_id: '', active: true, i18n_meta: hm('name') }); });
    var eqDefs = [
      ['Máy nén khí trục vít số 1 (MẪU)', '螺杆空压机1号（示例）', 0, 0, 'HIGH'], ['Bơm nước cấp lò hơi (MẪU)', '锅炉给水泵（示例）', 1, 0, 'HIGH'],
      ['Nồi hơi đốt than (MẪU)', '燃煤锅炉（示例）', 2, 1, 'HIGH'], ['Máy nén khí dự phòng (MẪU)', '备用空压机（示例）', 0, 1, 'MEDIUM'],
      ['Bơm tuần hoàn (MẪU)', '循环泵（示例）', 1, 2, 'LOW']
    ];
    var eqs = eqDefs.map(function (x) {
      var row = c({
        equipment_id: uuid_(), equipment_code: allocCode_(st, su, 'EQUIPMENT', null, null), name_vi: x[0], name_zh: x[1],
        category_id: cats[x[2]].value_id, location_id: locs[x[3]].location_id, vendor_id: '', manufacturer: 'MẪU', model: 'M-' + x[2],
        serial: 'SN-MAU-' + Math.floor(Math.random() * 9000 + 1000), manufacture_year: 2020, install_date: '2021-01-15', warranty_end: '',
        status: 'RUNNING', criticality: x[4], owner_user_id: '', i18n_meta: hm('name')
      });
      return row;
    });
    var types = [['AP_LUC', 'Kiểm định bình chịu áp lực', '压力容器检验', 12], ['NANG_HA', 'Kiểm định thiết bị nâng', '起重设备检验', 12]]
      .map(function (x) { return c({ inspection_type_id: uuid_(), code: x[0], name_vi: x[1], name_zh: x[2], reference_basis: 'MẪU', default_interval_months: x[3], required_docs_vi: 'Giấy chứng nhận (MẪU)', required_docs_zh: '证书（示例）', active: true, i18n_meta: hm('name') }); });
    var reqs = [[0, 0], [2, 0], [1, 0]].map(function (x) {
      return c({
        requirement_id: uuid_(), requirement_code: allocCode_(st, su, 'INSPECTION_REQUIREMENT', null, null), equipment_id: eqs[x[0]].equipment_id,
        location_id: '', inspection_type_id: types[x[1]].inspection_type_id, owner_user_id: by, current_inspection_id: '',
        current_due_date: '', operational_status: 'ACTIVE', obligation_status: 'REQUIRED', active: true, due_revision: ''
      });
    });
    insertRows_('Locations', locs); insertRows_('Vendors', vends); insertRows_('LookupValues', cats);
    insertRows_('Equipment', eqs); insertRows_('InspectionTypes', types); insertRows_('InspectionRequirements', reqs);
    var qrs = eqs.map(function (e) { return qrRow_(allocQrKey_(), 'EQUIPMENT', e.equipment_id, e.equipment_code, e.name_vi, e.name_zh); })
      .concat(reqs.map(function (r) { return qrRow_(allocQrKey_(), 'INSPECTION_REQUIREMENT', r.requirement_id, r.requirement_code, '', ''); }));
    insertRows_('QrRegistry', qrs);
    ['Locations', 'Vendors', 'LookupValues', 'Equipment', 'InspectionTypes', 'InspectionRequirements', 'QrRegistry'].forEach(function (s) { su['table_rev.' + s] = ['INT', rev]; });
    stateWrite_(st, su, by);

    var users = [['MAU-C1', 'Người tra cứu (MẪU)', 1, null], ['MAU-KT', 'Kỹ thuật viên (MẪU)', 2, 'KY_THUAT'],
      ['MAU-HD', 'Quản lý HĐ/KĐ (MẪU)', 2, 'HD_KD'], ['MAU-C3', 'Trưởng bộ phận (MẪU)', 3, null], ['MAU-KHOA', 'Thử khóa PIN (MẪU)', 2, 'KY_THUAT']];
    var nowIso = isoVN_(now_());
    users.forEach(function (x) {
      if (findRowNums_('Users', 'employee_code', x[0]).length) return;
      var pin = randomPin_(x[0]);
      pins[x[0]] = pin;
      var rec = newPinRecord_(pin);
      var uid = uuid_();
      insertRows_('Users', [{
        user_id: uid, employee_code: x[0], display_name: x[1], email: '', role_level: x[2], active: true,
        pin_hash: rec.pin_hash, salt: rec.salt, pin_hash_version: rec.pin_hash_version, failed_attempts: 0, locked_until: '',
        created_at: nowIso, updated_at: nowIso, auth_version: 1, is_system_owner: false, must_change_pin: false,
        temp_pin_expires_at: '', pin_changed_at: nowIso, failed_window_started_at: '', last_login_at: '', record_version: 1,
        created_by: by, updated_by: by
      }]);
      if (x[3]) insertRows_('UserScopes', [{ scope_id: uuid_(), user_id: uid, location_id: '', module: '', subrole: x[3], active: true, created_at: nowIso, created_by: by, updated_at: nowIso, updated_by: by }]);
    });
  });
  log_('Đã tạo dữ liệu MẪU: 3 khu vực, 2 nhà cung cấp, 5 thiết bị, 2 loại kiểm định, 3 yêu cầu kiểm định.');
  log_('Tài khoản MẪU (chỉ ở môi trường THỬ, ghi lại để thử P-07/P-02): ' +
    Object.keys(pins).map(function (k) { return k + ' / ' + pins[k]; }).join(' · '));
}

/**
 * Chỉ THỬ: cấp lại PIN tạm cho một người dùng khi quên PIN lúc chạy PoC.
 * Đặt POC_RESET_CODE (mã nhân viên) và POC_RESET_TEMP_PIN (6 số) trong Thuộc tính tập lệnh rồi chạy hàm này.
 * Hai khóa tự xóa sau khi dùng. Ở Đợt 1, quản trị dùng user.resetPin trong app.
 */
function pocResetPin() {
  assertPocEnv_();
  var code = normEmpCode_(prop_('POC_RESET_CODE'));
  var pin = trimStr_(prop_('POC_RESET_TEMP_PIN'));
  ['POC_RESET_CODE', 'POC_RESET_TEMP_PIN'].forEach(delProp_);
  if (!code || !pin) throw new Error('Thiếu POC_RESET_CODE hoặc POC_RESET_TEMP_PIN.');
  var weak = pinWeakReason_(pin, code, null);
  if (weak) throw new Error('PIN tạm không hợp lệ hoặc quá dễ đoán (' + weak + ').');
  dbReset_();
  var rec = newPinRecord_(pin);
  withWriteLock_(function () {
    var u = findOne_('Users', 'employee_code', code);
    if (!u) throw new Error('Không có mã nhân viên ' + code);
    bumpAuthVersion_(u, {
      pin_hash: rec.pin_hash, salt: rec.salt, pin_hash_version: rec.pin_hash_version, must_change_pin: true,
      temp_pin_expires_at: isoVN_(new Date(now_().getTime() + setting_('temp_pin_hours') * 3600000)),
      failed_attempts: 0, failed_window_started_at: '', locked_until: '', active: true
    });
    writeAudit_({ user_id: SYSTEM_USER, action: 'user.resetPin', entity_type: 'USER', entity_id: u.user_id, before_json: null, after_json: { temp_pin_issued: true }, auth_basis: 'OWNER' });
  });
  log_('Đã cấp PIN tạm cho ' + code + ' (hạn 72 giờ), mọi phiên cũ của người này đã bị thu hồi.');
}

// ===== 17_materials.js =====
/* 17_materials: Kho vật tư (danh mục) và linh kiện theo máy — 1.4 §5.1, §5.4; phụ lục 1.5 mục 4.4.2, 6.4.
 * M&E không chốt tồn: không có cột tồn, giá kho; gắn linh kiện không tạo phiếu xuất. */

var MATERIAL_GROUPS_ = ['EQUIPMENT_PART', 'ELECTRICAL', 'WATER', 'CONSUMABLE', 'TOOL', 'PPE'];
var ITEM_KINDS_ = ['COMPONENT', 'CONSUMABLE', 'REUSABLE_TOOL'];
var MATERIAL_FIELDS_ = ['part_number', 'manufacturer', 'model', 'base_unit', 'vendor_id', 'lead_time_days', 'group_key', 'item_kind', 'is_equipment_component'];

function validateMaterialFields_(p, errs, isNew) {
  if (p.group_key !== undefined && p.group_key !== '' && MATERIAL_GROUPS_.indexOf(p.group_key) < 0) errs.push(fieldError_('group_key', 'INVALID_VALUE'));
  if (p.item_kind !== undefined && p.item_kind !== '' && ITEM_KINDS_.indexOf(p.item_kind) < 0) errs.push(fieldError_('item_kind', 'INVALID_VALUE'));
  if (isNew && !trimStr_(p.base_unit)) errs.push(fieldError_('base_unit', 'REQUIRED'));
  if (p.base_unit !== undefined && String(p.base_unit).length > 20) errs.push(fieldError_('base_unit', 'INVALID_VALUE'));
  if (p.lead_time_days !== undefined && p.lead_time_days !== '' && p.lead_time_days !== null) {
    var d = Number(p.lead_time_days);
    if (!(d >= 0 && d <= 3650 && Math.floor(d) === d)) errs.push(fieldError_('lead_time_days', 'INVALID_VALUE'));
  }
  ['part_number', 'manufacturer', 'model'].forEach(function (f) {
    if (p[f] !== undefined && String(p[f]).length > 120) errs.push(fieldError_(f, 'INVALID_VALUE'));
  });
  // Kho làm sau (1.4 §22): cột tồn tối thiểu, lô, serial không nhận ở Đợt 1
  ['reorder_level', 'lot_tracking', 'serial_tracking', 'stock', 'unit_cost', 'price'].forEach(function (f) {
    if (p[f] !== undefined && p[f] !== '' && p[f] !== null) errs.push(fieldError_(f, 'WAREHOUSE_NOT_CONNECTED'));
  });
}

function materialRefs_(p, errs) {
  if (p.vendor_id && (!isUuidV4_(p.vendor_id) || !findRowNums_('Vendors', 'vendor_id', p.vendor_id).length)) errs.push(fieldError_('vendor_id', 'NOT_FOUND'));
}

/** Điều kiện "nếu bật" của Thủ kho: authorize_ đã kiểm cờ (2, warehouse) C/E */
function materialCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.material_id)) errs.push(fieldError_('material_id', 'ID_INVALID'));
  requireOneLang_(errs, p, null, 'name');
  validateMaterialFields_(p, errs, true);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Materials', ['name', 'specification'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL', entity_id: p.material_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Materials', 'material_id', p.material_id).length) e2.push(fieldError_('material_id', 'ID_EXISTS'));
      materialRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'MATERIAL', p.material_code, null);
      var qrKey = allocQrKey_();
      var row = {
        material_id: p.material_id, material_code: code, name_vi: tr.values.name_vi, name_zh: tr.values.name_zh,
        specification_vi: tr.values.specification_vi, specification_zh: tr.values.specification_zh, i18n_meta: tr.meta,
        reorder_level: '', lot_tracking: false, serial_tracking: false, active: true
      };
      MATERIAL_FIELDS_.forEach(function (f) { row[f] = p[f] !== undefined ? p[f] : ''; });
      row.base_unit = normUnit_(row.base_unit);
      row.is_equipment_component = p.is_equipment_component === true || p.is_equipment_component === 'true';
      if (!row.group_key) row.group_key = row.is_equipment_component ? 'EQUIPMENT_PART' : 'CONSUMABLE';
      if (!row.item_kind) row.item_kind = row.is_equipment_component ? 'COMPONENT' : 'CONSUMABLE';
      if (row.lead_time_days !== '' && row.lead_time_days !== null) row.lead_time_days = Number(row.lead_time_days);
      cNew_(ctx, row);
      return {
        writes: [
          { sheet: 'Materials', mode: 'insert', row: row },
          { sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'MATERIAL', p.material_id, code, row.name_vi, row.name_zh) }
        ],
        state: su,
        result: { entity_type: 'MATERIAL', entity_id: p.material_id, display_code: code, qr_key: qrKey, record_version: 1, record: projectRow_(ctx, row, 'Materials') },
        record_version: 1,
        audit: { entity_type: 'MATERIAL', entity_id: p.material_id, before_json: null, after_json: row }
      };
    }
  });
}

function materialEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.material_id)) throw validationError_([fieldError_('material_id', 'ID_INVALID')]);
  var cur0 = findOne_('Materials', 'material_id', p.material_id);
  if (!cur0) throw apiError_('NOT_FOUND');
  var errs = [];
  requireOneLang_(errs, p, cur0, 'name');
  validateMaterialFields_(p, errs, false);
  if (p.base_unit !== undefined && !trimStr_(p.base_unit)) errs.push(fieldError_('base_unit', 'REQUIRED'));
  if (p.active !== undefined && typeof p.active !== 'boolean') errs.push(fieldError_('active', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Materials', ['name', 'specification'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'MATERIAL', entity_id: p.material_id,
    build: function (st) {
      var cur = findOne_('Materials', 'material_id', p.material_id);
      assertVersion_(ctx, cur, 'MATERIAL', 'Materials');
      var e2 = [];
      materialRefs_(p, e2);
      if (e2.length) throw validationError_(e2);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur);
      var su = {};
      if (p.material_code !== undefined && trimStr_(p.material_code).toUpperCase() !== cur.material_code) {
        row.material_code = allocCode_(st, su, 'MATERIAL', p.material_code, null);
      }
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh;
      row.specification_vi = tr.values.specification_vi; row.specification_zh = tr.values.specification_zh; row.i18n_meta = tr.meta;
      MATERIAL_FIELDS_.forEach(function (f) { if (p[f] !== undefined) row[f] = p[f]; });
      if (p.base_unit !== undefined) row.base_unit = normUnit_(p.base_unit);
      if (p.is_equipment_component !== undefined) row.is_equipment_component = p.is_equipment_component === true || p.is_equipment_component === 'true';
      if (p.active !== undefined) row.active = p.active;
      if (row.lead_time_days !== '' && row.lead_time_days !== null) row.lead_time_days = Number(row.lead_time_days);
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Materials', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.material_id);
      if (qr && (qr.code !== row.material_code || qr.label_vi !== row.name_vi || qr.label_zh !== row.name_zh || qr.active !== !!row.active)) {
        var q2 = clone_(qr); delete q2.__row;
        q2.code = row.material_code; q2.label_vi = row.name_vi; q2.label_zh = row.name_zh; q2.active = !!row.active;
        writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
      }
      var after = clone_(row); delete after.__row;
      return {
        writes: writes, state: su,
        result: { entity_type: 'MATERIAL', entity_id: p.material_id, display_code: row.material_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Materials') },
        record_version: row.record_version,
        audit: { entity_type: 'MATERIAL', entity_id: p.material_id, before_json: before, after_json: after, reason: trimStr_(p.reason) }
      };
    }
  });
}

/**
 * material.archive: Ngừng dùng (active = false). Giữ dòng và quan hệ lịch sử; máy đang gắn vẫn hiện tên.
 * Không xóa khỏi danh mục khi máy khác còn liên kết (4.4.2).
 */
function materialArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.material_id)) throw validationError_([fieldError_('material_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var res = executeWrite_(ctx, {
    entity_type: 'MATERIAL', entity_id: p.material_id,
    build: function () {
      var cur = findOne_('Materials', 'material_id', p.material_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'MATERIAL', 'Materials');
      if (!cur.active) throw validationError_([fieldError_('material_id', 'INVALID_VALUE')]);
      var row = clone_(cur);
      row.active = false;
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Materials', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.material_id);
      if (qr && qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = false; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes,
        result: { entity_type: 'MATERIAL', entity_id: p.material_id, display_code: row.material_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Materials') },
        record_version: row.record_version,
        audit: { entity_type: 'MATERIAL', entity_id: p.material_id, before_json: { active: true }, after_json: { active: false }, reason: trimStr_(p.reason) }
      };
    }
  });
  if (res.ok && res.code === 'OK') revokeEntityPhotos_(ctx, 'MATERIAL', p.material_id);
  return res;
}

function materialView_(ctx) {
  var p = ctx.req.payload || {};
  var qm = qrMap_();
  if (p.material_id) {
    var r = findOne_('Materials', 'material_id', p.material_id);
    if (!r) throw apiError_('NOT_FOUND');
    var o = projectRow_(ctx, r, 'Materials');
    o.qr_key = qm[r.material_id] || null;
    var parts = findAll_('EquipmentParts', 'material_id', r.material_id).filter(function (x) { return !x.removed_at && !x.archived_at; })
      .map(function (x) { return projectRow_(ctx, x, 'EquipmentParts'); });
    return { item: o, used_on: parts, warehouse_connected: !!setting_('warehouse_connected') };
  }
  var f = p.filters || {};
  var q = trimStr_(f.q).toLowerCase();
  var rows = readRows_('Materials').filter(function (r) {
    if (!r.active && !p.include_inactive) return false;
    if (f.group_key && r.group_key !== f.group_key) return false;
    if (f.item_kind && r.item_kind !== f.item_kind) return false;
    if (f.is_equipment_component !== undefined && f.is_equipment_component !== '' && !!r.is_equipment_component !== !!f.is_equipment_component) return false;
    if (q && [r.material_code, r.name_vi, r.name_zh, r.part_number, r.model].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(a.material_code).localeCompare(String(b.material_code)); });
  var size = Math.min(200, Number(p.page_size) || setting_('list_page_size'));
  var start = Number(p.page_token || 0);
  return {
    items: rows.slice(start, start + size).map(function (r) { var o = projectRow_(ctx, r, 'Materials'); o.qr_key = qm[r.material_id] || null; return o; }),
    total: rows.length, next_page_token: start + size < rows.length ? String(start + size) : null,
    warehouse_connected: !!setting_('warehouse_connected')
  };
}

/* ---------------- Linh kiện theo máy (EquipmentParts) ---------------- */

function partEvent_(ctx, part, type, extra) {
  var nowIso = isoVN_(now_());
  var ev = {
    event_id: uuid_(), equipment_id: part.equipment_id, equipment_part_id: part.equipment_part_id, material_id: part.material_id,
    event_type: type, quantity: part.installed_qty, unit: part.unit, position_vi: part.position_vi || '', position_zh: part.position_zh || '',
    occurred_at: nowIso, work_type: '', work_id: '', usage_line_id: '', actor_user_id: ctx.user.user_id,
    note_vi: '', note_zh: '', dataset_epoch: sysProps_().dataset_epoch, created_at: nowIso, created_by: ctx.user.user_id,
    i18n_meta: {}
  };
  if (extra && extra.note) { ev.note_vi = extra.note; ev.i18n_meta = { note: { src: 'vi', state: 'MANUAL_REQUIRED', at: nowIso } }; }
  return ev;
}

/**
 * part.link: gắn vật tư có sẵn vào máy hoặc sửa liên kết (lượng lắp, vị trí, chức năng).
 * Cấp 2 (KT) gắn/sửa thì chưa xác nhận (approved_by trống); C3/C4 gắn thì tự ghi approved_by (4.4.2 ²).
 * Không tạo tồn hay phiếu xuất.
 */
function partLink_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.equipment_part_id)) errs.push(fieldError_('equipment_part_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.equipment_part_id) ? findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id) : null;
  if (!cur0) {
    if (!isUuidV4_(p.equipment_id)) errs.push(fieldError_('equipment_id', 'ID_INVALID'));
    if (!isUuidV4_(p.material_id)) errs.push(fieldError_('material_id', 'REQUIRED'));
    if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  }
  var qty = p.installed_qty === undefined ? (cur0 ? cur0.installed_qty : null) : (p.installed_qty === '' || p.installed_qty === null ? null : Number(p.installed_qty));
  if (qty === null || !(qty > 0) || !isFinite(qty)) errs.push(fieldError_('installed_qty', qty === null ? 'REQUIRED' : 'INVALID_VALUE'));
  if (p.effective_from && !isDateStr_(p.effective_from)) errs.push(fieldError_('effective_from', 'INVALID_DATE'));
  var lvl = Number(ctx.user.role_level);
  if (p.alternate_part_id !== undefined && p.alternate_part_id !== '' && lvl < 3) errs.push(fieldError_('alternate_part_id', 'INVALID_VALUE'));
  if (p.alternate_part_id && !isUuidV4_(p.alternate_part_id)) errs.push(fieldError_('alternate_part_id', 'ID_INVALID'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('EquipmentParts', ['function', 'position'], p, cur0);
  var entityId = cur0 ? cur0.equipment_part_id : p.equipment_part_id;
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_PART', entity_id: entityId,
    build: function () {
      var cur = findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id);
      if (cur) {
        assertVersion_(ctx, cur, 'EQUIPMENT_PART', 'EquipmentParts');
        if (cur.removed_at || cur.archived_at) throw validationError_([fieldError_('equipment_part_id', 'INVALID_VALUE')]);
      }
      var eqId = cur ? cur.equipment_id : p.equipment_id;
      var matId = cur ? cur.material_id : p.material_id;
      var eq = findOne_('Equipment', 'equipment_id', eqId);
      if (!eq || eq.archived_at) throw validationError_([fieldError_('equipment_id', 'NOT_FOUND')]);
      var mat = findOne_('Materials', 'material_id', matId);
      if (!mat || (!cur && !mat.active)) throw validationError_([fieldError_('material_id', 'NOT_FOUND')]);
      if (!cur && !mat.is_equipment_component) throw validationError_([fieldError_('material_id', 'NOT_COMPONENT')]);
      if (!cur) {
        var dup = findAll_('EquipmentParts', 'equipment_id', eqId).filter(function (x) { return x.material_id === matId && !x.removed_at && !x.archived_at; });
        if (dup.length) throw validationError_([fieldError_('material_id', 'CODE_DUPLICATE')]);
      }
      if (p.alternate_part_id && !findRowNums_('Materials', 'material_id', p.alternate_part_id).length) throw validationError_([fieldError_('alternate_part_id', 'NOT_FOUND')]);
      var nowIso = isoVN_(now_());
      var row = cur ? clone_(cur) : { equipment_part_id: p.equipment_part_id, equipment_id: eqId, material_id: matId, removed_at: '' };
      var before = cur ? { installed_qty: cur.installed_qty, function_vi: cur.function_vi, position_vi: cur.position_vi, approved_by: cur.approved_by } : null;
      row.installed_qty = qty;
      row.unit = mat.base_unit;
      row.function_vi = tr.values.function_vi; row.function_zh = tr.values.function_zh;
      row.position_vi = tr.values.position_vi; row.position_zh = tr.values.position_zh; row.i18n_meta = tr.meta;
      if (p.compatibility_note !== undefined) row.compatibility_note = trimStr_(p.compatibility_note).slice(0, 300);
      if (p.alternate_part_id !== undefined) row.alternate_part_id = p.alternate_part_id || '';
      if (p.effective_from !== undefined) row.effective_from = p.effective_from || '';
      if (!row.effective_from) row.effective_from = dateVN_(now_());
      // C3/C4 gắn hoặc sửa: tự xác nhận; cấp 2 gắn/sửa: chờ C3/C4 xác nhận
      row.approved_by = lvl >= 3 ? ctx.user.user_id : '';
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      var ev = partEvent_(ctx, row, cur ? 'EDITED' : 'LINKED');
      return {
        writes: [{ sheet: 'EquipmentParts', mode: cur ? 'update' : 'insert', row: row }, { sheet: 'EquipmentPartEvents', mode: 'insert', row: ev }],
        result: { entity_type: 'EQUIPMENT_PART', entity_id: row.equipment_part_id, record_version: row.record_version, record: projectRow_(ctx, row, 'EquipmentParts') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: eqId, before_json: before, after_json: { material_id: matId, installed_qty: qty, approved_by: row.approved_by } }
      };
    }
  });
}

/** part.unlink: kết thúc liên kết (removed_at); KT chỉ gỡ liên kết mình tạo chưa xác nhận; bắt lý do */
function partUnlink_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.equipment_part_id)) throw validationError_([fieldError_('equipment_part_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_PART', entity_id: p.equipment_part_id,
    build: function () {
      var cur = findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id);
      if (!cur) throw apiError_('NOT_FOUND');
      if (ctx.auth && ctx.auth.conds.length && (cur.created_by !== ctx.user.user_id || cur.approved_by)) throw apiError_('FORBIDDEN');
      assertVersion_(ctx, cur, 'EQUIPMENT_PART', 'EquipmentParts');
      if (cur.removed_at || cur.archived_at) throw validationError_([fieldError_('equipment_part_id', 'INVALID_VALUE')]);
      var row = clone_(cur);
      var nowIso = isoVN_(now_());
      row.removed_at = nowIso;
      row.archived_at = nowIso;
      cUpdate_(ctx, row);
      var ev = partEvent_(ctx, row, 'UNLINKED', { note: trimStr_(p.reason).slice(0, 300) });
      return {
        writes: [{ sheet: 'EquipmentParts', mode: 'update', row: row }, { sheet: 'EquipmentPartEvents', mode: 'insert', row: ev }],
        result: { entity_type: 'EQUIPMENT_PART', entity_id: row.equipment_part_id, record_version: row.record_version, removed: true },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: row.equipment_id, before_json: { material_id: row.material_id }, after_json: { removed_at: nowIso }, reason: trimStr_(p.reason) }
      };
    }
  });
}

/** part.approve: C3/C4 xác nhận liên kết do người khác gắn (không tự duyệt, 4.6); đặt alternate_part_id */
function partApprove_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.equipment_part_id)) throw validationError_([fieldError_('equipment_part_id', 'ID_INVALID')]);
  if (p.alternate_part_id && !isUuidV4_(p.alternate_part_id)) throw validationError_([fieldError_('alternate_part_id', 'ID_INVALID')]);
  return executeWrite_(ctx, {
    entity_type: 'EQUIPMENT_PART', entity_id: p.equipment_part_id,
    build: function () {
      var cur = findOne_('EquipmentParts', 'equipment_part_id', p.equipment_part_id);
      if (!cur || cur.removed_at || cur.archived_at) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'part.approve', [cur.created_by, cur.updated_by]);
      assertVersion_(ctx, cur, 'EQUIPMENT_PART', 'EquipmentParts');
      if (cur.approved_by) throw validationError_([fieldError_('equipment_part_id', 'INVALID_VALUE')]);
      if (p.alternate_part_id && !findRowNums_('Materials', 'material_id', p.alternate_part_id).length) throw validationError_([fieldError_('alternate_part_id', 'NOT_FOUND')]);
      var row = clone_(cur);
      row.approved_by = ctx.user.user_id;
      if (p.alternate_part_id !== undefined) row.alternate_part_id = p.alternate_part_id || '';
      cUpdate_(ctx, row);
      var ev = partEvent_(ctx, row, 'APPROVED');
      return {
        writes: [{ sheet: 'EquipmentParts', mode: 'update', row: row }, { sheet: 'EquipmentPartEvents', mode: 'insert', row: ev }],
        result: { entity_type: 'EQUIPMENT_PART', entity_id: row.equipment_part_id, record_version: row.record_version, record: projectRow_(ctx, row, 'EquipmentParts') },
        record_version: row.record_version,
        audit: { entity_type: 'EQUIPMENT', entity_id: row.equipment_id, before_json: { approved_by: '' }, after_json: { approved_by: row.approved_by, alternate_part_id: row.alternate_part_id }, auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined, reason: trimStr_(p.self_approval_reason) }
      };
    }
  });
}

// ===== 18_contracts.js =====
/* 18_contracts: Hợp đồng thuê ngoài — 1.4 §5.8; phụ lục 1.5 mục 2.7, 3.17, 4.4.8, 4.5, 4.6.
 * Mỗi phiên hợp đồng là một dòng Contracts (revision, previous_contract_id). Phiên đầu có hiệu lực ngay;
 * sau đó hạn/giá trị chỉ đổi qua dự thảo gia hạn được duyệt hoặc contract.editTerms (PIN, lý do).
 * Ngày hết hạn, hạn báo gia hạn và ngày dịch vụ là ba mốc riêng. */

var CONTRACT_TERMS_ = ['start_date', 'end_date', 'renewal_notice_date', 'value', 'currency'];
var CONTRACT_INFO_ = ['contract_number', 'vendor_id', 'owner_user_id'];
var INTERVAL_TYPES_ = ['DAY', 'WEEK', 'MONTH', 'YEAR'];

/** Ngày tham chiếu nhắc hạn (2.7): min(hạn báo gia hạn, ngày hết hạn) */
function contractRef_(c) {
  var end = c.end_date || '', rn = c.renewal_notice_date || '';
  if (rn && end && rn < end) return { date: rn, kind: 'RENEWAL_NOTICE' };
  return { date: end || rn || '', kind: 'END_DATE' };
}
function contractDueRevision_(c) {
  var r = contractRef_(c);
  return r.date ? r.kind + ':' + r.date + ':' + c.contract_id : '';
}

/** Kiểm ngày và giá trị của một phiên (3.17 c, 1.4 §10.3) */
function validateTerms_(t, errs) {
  ['start_date', 'end_date', 'renewal_notice_date'].forEach(function (f) {
    if (t[f] && !isDateStr_(t[f])) errs.push(fieldError_(f, 'INVALID_DATE'));
  });
  if (t.start_date && t.end_date && t.start_date > t.end_date) errs.push(fieldError_('end_date', 'INVALID_DATE'));
  if (t.renewal_notice_date && t.end_date && t.renewal_notice_date > t.end_date) errs.push(fieldError_('renewal_notice_date', 'RENEWAL_NOTICE_AFTER_END'));
  if (t.value !== undefined && t.value !== null && t.value !== '' && !(Number(t.value) >= 0)) errs.push(fieldError_('value', 'INVALID_VALUE'));
  if (t.currency !== undefined && t.currency !== '' && !/^[A-Z]{3}$/.test(String(t.currency))) errs.push(fieldError_('currency', 'INVALID_VALUE'));
}

function contractRefs_(p, errs) {
  if (p.vendor_id && (!isUuidV4_(p.vendor_id) || !findRowNums_('Vendors', 'vendor_id', p.vendor_id).length)) errs.push(fieldError_('vendor_id', 'NOT_FOUND'));
  if (p.owner_user_id && (!isUuidV4_(p.owner_user_id) || !findRowNums_('Users', 'user_id', p.owner_user_id).length)) errs.push(fieldError_('owner_user_id', 'NOT_FOUND'));
}

/** Kế hoạch ghi danh sách thiết bị trong phạm vi: [{contract_equipment_id, equipment_id, service_vi/zh, interval_type, interval_value, next_service_date, price, remove}] */
function planContractEquipment_(ctx, contractId, list, writes, errs) {
  if (!Array.isArray(list)) return;
  var existing = findAll_('ContractEquipment', 'contract_id', contractId);
  var seenEq = {};
  existing.forEach(function (x) { if (!x.archived_at) seenEq[x.equipment_id] = x.contract_equipment_id; });
  list.forEach(function (it, i) {
    var f = 'equipment[' + i + ']';
    if (!it || !isUuidV4_(it.contract_equipment_id)) { errs.push(fieldError_(f, 'ID_INVALID')); return; }
    var cur = existing.filter(function (x) { return x.contract_equipment_id === it.contract_equipment_id; })[0];
    if (it.remove) {
      if (cur && !cur.archived_at) {
        var rm = clone_(cur); delete rm.__row; rm.archived_at = isoVN_(now_()); cUpdate_(ctx, rm);
        writes.push({ sheet: 'ContractEquipment', mode: 'update', row: rm });
        delete seenEq[cur.equipment_id];
      }
      return;
    }
    var eqId = cur ? cur.equipment_id : it.equipment_id;
    var eq = isUuidV4_(eqId) ? findOne_('Equipment', 'equipment_id', eqId) : null;
    if (!eq || eq.archived_at) { errs.push(fieldError_(f, 'NOT_FOUND')); return; }
    if (!cur && seenEq[eqId]) { errs.push(fieldError_(f, 'CODE_DUPLICATE')); return; }
    if (it.interval_type && INTERVAL_TYPES_.indexOf(it.interval_type) < 0) errs.push(fieldError_(f + '.interval_type', 'INVALID_VALUE'));
    if (it.interval_value !== undefined && it.interval_value !== '' && it.interval_value !== null && !(Number(it.interval_value) > 0)) errs.push(fieldError_(f + '.interval_value', 'INVALID_VALUE'));
    if (it.next_service_date && !isDateStr_(it.next_service_date)) errs.push(fieldError_(f + '.next_service_date', 'INVALID_DATE'));
    if (it.price !== undefined && it.price !== '' && it.price !== null && !(Number(it.price) >= 0)) errs.push(fieldError_(f + '.price', 'INVALID_VALUE'));
    var tr = applyTranslations_('ContractEquipment', ['service'], it, cur);
    var row = cur ? clone_(cur) : { contract_equipment_id: it.contract_equipment_id, contract_id: contractId, equipment_id: eqId };
    delete row.__row;
    row.service_vi = tr.values.service_vi; row.service_zh = tr.values.service_zh; row.i18n_meta = tr.meta;
    if (it.interval_type !== undefined) row.interval_type = it.interval_type || '';
    if (it.interval_value !== undefined) row.interval_value = it.interval_value === '' || it.interval_value === null ? '' : Number(it.interval_value);
    if (it.next_service_date !== undefined) row.next_service_date = it.next_service_date || '';
    if (it.price !== undefined) { row.price = it.price === '' || it.price === null ? '' : Number(it.price); row.currency = row.price === '' ? '' : (it.currency || setting_('default_currency')); }
    if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
    seenEq[eqId] = row.contract_equipment_id;
    writes.push({ sheet: 'ContractEquipment', mode: cur ? 'update' : 'insert', row: row });
  });
}

/** Lịch dịch vụ dự kiến: [{service_id, contract_equipment_id, due_date, remove}] — chỉ dòng chưa làm */
function planContractServices_(ctx, contractId, list, writes, errs) {
  if (!Array.isArray(list)) return;
  list.forEach(function (it, i) {
    var f = 'services[' + i + ']';
    if (!it || !isUuidV4_(it.service_id)) { errs.push(fieldError_(f, 'ID_INVALID')); return; }
    var cur = findOne_('ContractServices', 'service_id', it.service_id);
    if (cur && cur.contract_id !== contractId) { errs.push(fieldError_(f, 'INVALID_VALUE')); return; }
    if (cur && cur.performed_at) { errs.push(fieldError_(f, 'INVALID_VALUE')); return; }
    if (it.remove) {
      if (cur && !cur.archived_at) { var rm = clone_(cur); delete rm.__row; rm.archived_at = isoVN_(now_()); cUpdate_(ctx, rm); writes.push({ sheet: 'ContractServices', mode: 'update', row: rm }); }
      return;
    }
    if (!isDateStr_(it.due_date)) { errs.push(fieldError_(f + '.due_date', 'INVALID_DATE')); return; }
    if (it.contract_equipment_id && !findRowNums_('ContractEquipment', 'contract_equipment_id', it.contract_equipment_id).length &&
      !writes.some(function (w) { return w.sheet === 'ContractEquipment' && w.row.contract_equipment_id === it.contract_equipment_id; })) {
      errs.push(fieldError_(f + '.contract_equipment_id', 'NOT_FOUND')); return;
    }
    var row = cur ? clone_(cur) : { service_id: it.service_id, contract_id: contractId, performed_at: '', result_vi: '', result_zh: '', vendor_contact: '', cost: '', currency: '', status: 'PLANNED', accepted_by: '', accepted_at: '', i18n_meta: {} };
    delete row.__row;
    row.contract_equipment_id = it.contract_equipment_id || '';
    row.due_date = it.due_date;
    if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
    writes.push({ sheet: 'ContractServices', mode: cur ? 'update' : 'insert', row: row });
  });
}

function contractResult_(ctx, row, extra) {
  var o = { entity_type: 'CONTRACT', entity_id: row.contract_id, display_code: row.contract_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Contracts') };
  Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
  return o;
}

/* ---------------- Tạo phiên đầu ---------------- */

function contractCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  requireOneLang_(errs, p, null, 'title');
  if (!p.end_date) errs.push(fieldError_('end_date', 'REQUIRED'));
  validateTerms_(p, errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  (p.equipment || []).forEach(function (it) { assertNoCostFields_(ctx, 'ContractEquipment', 'contracts', it || {}); });
  var tr = applyTranslations_('Contracts', ['title', 'scope'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function (st) {
      var e2 = [];
      if (findRowNums_('Contracts', 'contract_id', p.contract_id).length) e2.push(fieldError_('contract_id', 'ID_EXISTS'));
      contractRefs_(p, e2);
      var writes = [];
      planContractEquipment_(ctx, p.contract_id, p.equipment, writes, e2);
      planContractServices_(ctx, p.contract_id, p.services, writes, e2);
      if (e2.length) throw validationError_(e2);
      var su = {};
      var code = allocCode_(st, su, 'CONTRACT', null, null);
      var qrKey = allocQrKey_();
      var nowIso = isoVN_(now_());
      var row = {
        contract_id: p.contract_id, contract_code: code, contract_number: trimStr_(p.contract_number).slice(0, 80),
        title_vi: tr.values.title_vi, title_zh: tr.values.title_zh, scope_vi: tr.values.scope_vi, scope_zh: tr.values.scope_zh, i18n_meta: tr.meta,
        vendor_id: p.vendor_id || '', owner_user_id: p.owner_user_id || '', start_date: p.start_date || '', end_date: p.end_date,
        renewal_notice_date: p.renewal_notice_date || '', value: p.value === undefined || p.value === '' || p.value === null ? '' : Number(p.value),
        currency: p.value !== undefined && p.value !== '' && p.value !== null ? (p.currency || setting_('default_currency')) : '',
        // Phiên đầu có hiệu lực ngay để nhắc hạn chạy được (4.4.8 ⁵)
        status: 'APPROVED', revision: 1, previous_contract_id: '', submitted_by: ctx.user.user_id, submitted_at: nowIso,
        approved_by: ctx.user.user_id, approved_at: nowIso, lifecycle_status: 'ACTIVE', closed_at: '', closed_reason_vi: '', closed_reason_zh: ''
      };
      row.due_revision = contractDueRevision_(row);
      cNew_(ctx, row);
      writes.unshift({ sheet: 'Contracts', mode: 'insert', row: row });
      writes.push({ sheet: 'QrRegistry', mode: 'insert', row: qrRow_(qrKey, 'CONTRACT', p.contract_id, code, row.title_vi, row.title_zh) });
      return {
        writes: writes, state: su,
        result: contractResult_(ctx, row, { qr_key: qrKey }),
        record_version: 1,
        audit: { entity_type: 'CONTRACT', entity_id: p.contract_id, before_json: null, after_json: row }
      };
    }
  });
}

/* ---------------- Sửa thông tin ngoài hạn/giá trị ---------------- */

/** contract.edit: tên, số HĐ, nhà cung cấp, người phụ trách, phạm vi, thiết bị, lịch dịch vụ. Dự thảo sửa được cả hạn/giá trị */
function contractEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.contract_id)) throw validationError_([fieldError_('contract_id', 'ID_INVALID')]);
  var cur0 = findOne_('Contracts', 'contract_id', p.contract_id);
  if (!cur0) throw apiError_('NOT_FOUND');
  var isDraft = cur0.status === 'DRAFT' || cur0.status === 'REJECTED';
  var errs = [];
  if (!isDraft) CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  if (cur0.status === 'PENDING_APPROVAL') errs.push(fieldError_('contract_id', 'INVALID_VALUE'));
  if (cur0.lifecycle_status === 'SUPERSEDED' || cur0.lifecycle_status === 'ENDED' || cur0.lifecycle_status === 'NOT_RENEWED' || cur0.archived_at) errs.push(fieldError_('contract_id', 'INVALID_VALUE'));
  requireOneLang_(errs, p, cur0, 'title');
  var merged = {};
  CONTRACT_TERMS_.forEach(function (f) { merged[f] = p[f] !== undefined ? p[f] : cur0[f]; });
  if (isDraft) validateTerms_(merged, errs);
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  (p.equipment || []).forEach(function (it) { assertNoCostFields_(ctx, 'ContractEquipment', 'contracts', it || {}); });
  var tr = applyTranslations_('Contracts', ['title', 'scope'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      var e2 = [];
      contractRefs_(p, e2);
      var writes = [];
      planContractEquipment_(ctx, p.contract_id, p.equipment, writes, e2);
      planContractServices_(ctx, p.contract_id, p.services, writes, e2);
      if (e2.length) throw validationError_(e2);
      var before = clone_(cur); delete before.__row;
      var row = clone_(cur); delete row.__row;
      row.title_vi = tr.values.title_vi; row.title_zh = tr.values.title_zh; row.scope_vi = tr.values.scope_vi; row.scope_zh = tr.values.scope_zh; row.i18n_meta = tr.meta;
      CONTRACT_INFO_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'contract_number' ? trimStr_(p[f]).slice(0, 80) : (p[f] || ''); });
      if (isDraft) {
        CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'value' ? (p[f] === '' || p[f] === null ? '' : Number(p[f])) : (p[f] || ''); });
        if (row.value !== '' && !row.currency) row.currency = setting_('default_currency');
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Contracts', mode: 'update', row: row });
      var qr = findOne_('QrRegistry', 'entity_id', p.contract_id);
      if (qr && (qr.label_vi !== row.title_vi || qr.label_zh !== row.title_zh)) {
        var q2 = clone_(qr); delete q2.__row; q2.label_vi = row.title_vi; q2.label_zh = row.title_zh;
        writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 });
      }
      return {
        writes: writes,
        result: contractResult_(ctx, row),
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: p.contract_id, before_json: before, after_json: row }
      };
    }
  });
}

/* ---------------- Sửa hạn/giá trị phiên hiện hành (PIN) ---------------- */

function contractEditTerms_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (!trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (!CONTRACT_TERMS_.some(function (f) { return p[f] !== undefined; })) errs.push(fieldError_('end_date', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  if (!canViewCost_(ctx, 'contracts')) assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      // Commit lô Excel nhạy cảm là duyệt (người commit khác người nhập, 4.4.11 ⁷)
      var basis = ctx.importBatch ? 'IMPORT_COMMIT' : assertNotSelf_(ctx, 'contract.editTerms', [cur.created_by]);
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.lifecycle_status !== 'ACTIVE' || cur.archived_at) throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var merged = {};
      CONTRACT_TERMS_.forEach(function (f) { merged[f] = p[f] !== undefined ? p[f] : cur[f]; });
      if (!merged.end_date) throw validationError_([fieldError_('end_date', 'REQUIRED')]);
      var e2 = []; validateTerms_(merged, e2);
      if (e2.length) throw validationError_(e2);
      var before = {}; CONTRACT_TERMS_.forEach(function (f) { before[f] = cur[f]; });
      var row = clone_(cur); delete row.__row;
      CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'value' ? (p[f] === '' || p[f] === null ? '' : Number(p[f])) : (p[f] || ''); });
      if (row.value !== '' && !row.currency) row.currency = setting_('default_currency');
      row.due_revision = contractDueRevision_(row);
      cUpdate_(ctx, row);
      var after = {}; CONTRACT_TERMS_.forEach(function (f) { after[f] = row[f]; });
      return {
        writes: [{ sheet: 'Contracts', mode: 'update', row: row }],
        result: contractResult_(ctx, row),
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: before, after_json: after, reason: trimStr_(p.reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

/* ---------------- Lưu trữ, đóng ---------------- */

function contractArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.contract_id)) throw validationError_([fieldError_('contract_id', 'ID_INVALID')]);
  if (!trimStr_(p.reason)) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var res = executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.archived_at) throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      row.archived_at = isoVN_(now_());
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Contracts', mode: 'update', row: row }];
      var qr = findOne_('QrRegistry', 'entity_id', p.contract_id);
      if (qr && qr.active) { var q2 = clone_(qr); delete q2.__row; q2.active = false; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: p.contract_id, before_json: { archived_at: '' }, after_json: { archived_at: row.archived_at }, reason: trimStr_(p.reason) }
      };
    }
  });
  if (res.ok && res.code === 'OK') revokeEntityPhotos_(ctx, 'CONTRACT', p.contract_id);
  return res;
}

/** contract.close {contract_id, lifecycle_status: ENDED | NOT_RENEWED, closed_reason_vi/zh}: dừng nhắc hạn (3.17 b) */
function contractClose_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (['ENDED', 'NOT_RENEWED'].indexOf(p.lifecycle_status) < 0) errs.push(fieldError_('lifecycle_status', 'REQUIRED'));
  requireOneLang_(errs, p, null, 'closed_reason');
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Contracts', ['closed_reason'], p, null);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.lifecycle_status !== 'ACTIVE') throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      row.lifecycle_status = p.lifecycle_status;
      row.closed_at = isoVN_(now_());
      row.closed_reason_vi = tr.values.closed_reason_vi; row.closed_reason_zh = tr.values.closed_reason_zh;
      var meta = clone_(row.i18n_meta || {}); meta.closed_reason = tr.meta.closed_reason; row.i18n_meta = meta;
      cUpdate_(ctx, row);
      var writes = [{ sheet: 'Contracts', mode: 'update', row: row }];
      // Dự thảo đang mở của hợp đồng này không còn ý nghĩa
      readRows_('Contracts').forEach(function (d) {
        if (d.previous_contract_id === cur.contract_id && (d.status === 'DRAFT' || d.status === 'PENDING_APPROVAL') && !d.archived_at) {
          var d2 = clone_(d); delete d2.__row; d2.status = 'REJECTED'; cUpdate_(ctx, d2); writes.push({ sheet: 'Contracts', mode: 'update', row: d2 });
        }
      });
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { lifecycle_status: 'ACTIVE' }, after_json: { lifecycle_status: row.lifecycle_status }, reason: row.closed_reason_vi || row.closed_reason_zh }
      };
    }
  });
}

/* ---------------- Gia hạn (CO-03) ---------------- */

/** contract.renewal.create {contract_id (dự thảo mới), previous_contract_id, …điều khoản}: chép phiên hiện hành, thiết bị trong phạm vi */
function contractRenewalCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (!isUuidV4_(p.previous_contract_id)) errs.push(fieldError_('previous_contract_id', 'REQUIRED'));
  validateTerms_(p, errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'Contracts', 'contracts', p);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var prev = findOne_('Contracts', 'contract_id', p.previous_contract_id);
      if (!prev || prev.lifecycle_status !== 'ACTIVE' || prev.archived_at) throw validationError_([fieldError_('previous_contract_id', 'NOT_FOUND')]);
      if (findRowNums_('Contracts', 'contract_id', p.contract_id).length) throw validationError_([fieldError_('contract_id', 'ID_EXISTS')]);
      var open = readRows_('Contracts').filter(function (d) { return d.previous_contract_id === prev.contract_id && (d.status === 'DRAFT' || d.status === 'PENDING_APPROVAL') && !d.archived_at; });
      if (open.length) throw validationError_([fieldError_('previous_contract_id', 'CODE_DUPLICATE')]);
      var row = clone_(prev); delete row.__row;
      row.contract_id = p.contract_id;
      row.revision = Number(prev.revision || 1) + 1;
      row.previous_contract_id = prev.contract_id;
      row.status = 'DRAFT'; row.lifecycle_status = ''; row.submitted_by = ''; row.submitted_at = ''; row.approved_by = ''; row.approved_at = '';
      row.closed_at = ''; row.closed_reason_vi = ''; row.closed_reason_zh = ''; row.due_revision = '';
      CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'value' ? (p[f] === '' || p[f] === null ? '' : Number(p[f])) : (p[f] || ''); });
      if (!canViewCost_(ctx, 'contracts')) { row.value = prev.value; row.currency = prev.currency; }
      var merged = {}; CONTRACT_TERMS_.forEach(function (f) { merged[f] = row[f]; });
      var e2 = []; validateTerms_(merged, e2);
      if (e2.length) throw validationError_(e2);
      cNew_(ctx, row);
      var writes = [{ sheet: 'Contracts', mode: 'insert', row: row }];
      findAll_('ContractEquipment', 'contract_id', prev.contract_id).filter(function (x) { return !x.archived_at; }).forEach(function (x) {
        var c2 = clone_(x); delete c2.__row; c2.contract_equipment_id = uuid_(); c2.contract_id = row.contract_id; cNew_(ctx, c2);
        writes.push({ sheet: 'ContractEquipment', mode: 'insert', row: c2 });
      });
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: 1,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: null, after_json: { previous_contract_id: prev.contract_id, revision: row.revision, end_date: row.end_date } }
      };
    }
  });
}

function contractRenewalSubmit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.contract_id)) throw validationError_([fieldError_('contract_id', 'ID_INVALID')]);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.status !== 'DRAFT' && cur.status !== 'REJECTED') throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      if (!cur.end_date) throw validationError_([fieldError_('end_date', 'REQUIRED')]);
      var row = clone_(cur); delete row.__row;
      row.status = 'PENDING_APPROVAL'; row.submitted_by = ctx.user.user_id; row.submitted_at = isoVN_(now_());
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Contracts', mode: 'update', row: row }], result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { status: cur.status }, after_json: { status: 'PENDING_APPROVAL' } }
      };
    }
  });
}

/**
 * contract.renewal.approve {contract_id, decision, reason}: phiên mới thành hiện hành (ACTIVE, due_revision mới),
 * phiên cũ SUPERSEDED; tem QR giữ nguyên qr_key, trỏ sang phiên mới (A8). Người duyệt phải có quyền giá của contracts.
 */
function contractRenewalApprove_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'ID_INVALID'));
  if (['APPROVE', 'REJECT'].indexOf(p.decision) < 0) errs.push(fieldError_('decision', 'REQUIRED'));
  if (p.decision === 'REJECT' && !trimStr_(p.reason)) errs.push(fieldError_('reason', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  if (!canViewCost_(ctx, 'contracts')) throw apiError_('FORBIDDEN');
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT', entity_id: p.contract_id,
    build: function () {
      var cur = findOne_('Contracts', 'contract_id', p.contract_id);
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'contract.renewal.approve', [cur.created_by, cur.submitted_by]);
      assertVersion_(ctx, cur, 'CONTRACT', 'Contracts');
      if (cur.status !== 'PENDING_APPROVAL') throw validationError_([fieldError_('contract_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      var writes = [];
      if (p.decision === 'REJECT') {
        row.status = 'REJECTED';
      } else {
        var prev = findOne_('Contracts', 'contract_id', cur.previous_contract_id);
        if (!prev || prev.lifecycle_status !== 'ACTIVE') throw validationError_([fieldError_('previous_contract_id', 'INVALID_VALUE')]);
        var nowIso = isoVN_(now_());
        row.status = 'APPROVED'; row.lifecycle_status = 'ACTIVE'; row.approved_by = ctx.user.user_id; row.approved_at = nowIso;
        row.due_revision = contractDueRevision_(row);
        var pv = clone_(prev); delete pv.__row;
        pv.lifecycle_status = 'SUPERSEDED'; cUpdate_(ctx, pv);
        writes.push({ sheet: 'Contracts', mode: 'update', row: pv });
        var qr = findOne_('QrRegistry', 'entity_id', prev.contract_id);
        if (qr) { var q2 = clone_(qr); delete q2.__row; q2.entity_id = row.contract_id; q2.label_vi = row.title_vi; q2.label_zh = row.title_zh; writes.push({ sheet: 'QrRegistry', mode: 'update', row: q2 }); }
      }
      cUpdate_(ctx, row);
      writes.unshift({ sheet: 'Contracts', mode: 'update', row: row });
      return {
        writes: writes, result: contractResult_(ctx, row), record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { status: 'PENDING_APPROVAL' }, after_json: { status: row.status, end_date: row.end_date, due_revision: row.due_revision }, reason: trimStr_(p.reason), auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

/* ---------------- Dịch vụ hợp đồng ---------------- */

/**
 * contract.service.record (offline được): ghi lần dịch vụ — tạo mới (expected_version 0) hoặc ghi kết quả vào dòng dự kiến.
 * {service_id, contract_id, contract_equipment_id, due_date, performed_at, result_vi/zh, vendor_contact, cost}
 * Kết quả dịch vụ không dịch tự động (2.3).
 */
function contractServiceRecord_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.service_id)) errs.push(fieldError_('service_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.service_id) ? findOne_('ContractServices', 'service_id', p.service_id) : null;
  if (!cur0 && !isUuidV4_(p.contract_id)) errs.push(fieldError_('contract_id', 'REQUIRED'));
  if (!p.performed_at || !(isDateStr_(p.performed_at) || parseTime_(p.performed_at))) errs.push(fieldError_('performed_at', 'INVALID_DATE'));
  if (p.due_date && !isDateStr_(p.due_date)) errs.push(fieldError_('due_date', 'INVALID_DATE'));
  requireOneLang_(errs, p, cur0, 'result');
  if (p.cost !== undefined && p.cost !== null && p.cost !== '' && !(Number(p.cost) >= 0)) errs.push(fieldError_('cost', 'INVALID_VALUE'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  assertNoCostFields_(ctx, 'ContractServices', 'contracts', p);
  var tr = applyTranslations_('ContractServices', ['result'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT_SERVICE', entity_id: p.service_id,
    build: function () {
      var cur = findOne_('ContractServices', 'service_id', p.service_id);
      var contractId = cur ? cur.contract_id : p.contract_id;
      var c = findOne_('Contracts', 'contract_id', contractId);
      if (!c || c.archived_at || c.lifecycle_status !== 'ACTIVE') throw validationError_([fieldError_('contract_id', 'NOT_FOUND')]);
      if (cur) {
        assertVersion_(ctx, cur, 'CONTRACT_SERVICE', 'ContractServices');
        if (cur.status === 'ACCEPTED') throw validationError_([fieldError_('service_id', 'INVALID_VALUE')]);
      }
      if (p.contract_equipment_id) {
        var ce = findOne_('ContractEquipment', 'contract_equipment_id', p.contract_equipment_id);
        if (!ce || ce.contract_id !== contractId) throw validationError_([fieldError_('contract_equipment_id', 'NOT_FOUND')]);
      }
      var row = cur ? clone_(cur) : { service_id: p.service_id, contract_id: contractId, due_date: p.due_date || '', accepted_by: '', accepted_at: '' };
      delete row.__row;
      var before = cur ? { performed_at: cur.performed_at, status: cur.status } : null;
      if (p.contract_equipment_id !== undefined) row.contract_equipment_id = p.contract_equipment_id || '';
      if (!cur && !row.contract_equipment_id) row.contract_equipment_id = '';
      row.performed_at = String(p.performed_at);
      row.result_vi = tr.values.result_vi; row.result_zh = tr.values.result_zh; row.i18n_meta = tr.meta;
      if (p.vendor_contact !== undefined) row.vendor_contact = trimStr_(p.vendor_contact).slice(0, 120);
      if (p.cost !== undefined) { row.cost = p.cost === '' || p.cost === null ? '' : Number(p.cost); row.currency = row.cost === '' ? '' : (p.currency || setting_('default_currency')); }
      row.status = 'DONE';
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      var writes = [{ sheet: 'ContractServices', mode: cur ? 'update' : 'insert', row: row }];
      return {
        writes: writes,
        result: { entity_type: 'CONTRACT_SERVICE', entity_id: row.service_id, record_version: row.record_version, record: projectRow_(ctx, row, 'ContractServices') },
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: contractId, before_json: before, after_json: { service_id: row.service_id, performed_at: row.performed_at, status: 'DONE' } }
      };
    }
  });
}

/** contract.service.accept {service_id}: nghiệm thu dịch vụ (PIN, không phải người tạo/ghi kết quả) */
function contractServiceAccept_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.service_id)) throw validationError_([fieldError_('service_id', 'ID_INVALID')]);
  return executeWrite_(ctx, {
    entity_type: 'CONTRACT_SERVICE', entity_id: p.service_id,
    build: function () {
      var cur = findOne_('ContractServices', 'service_id', p.service_id);
      if (!cur) throw apiError_('NOT_FOUND');
      var basis = assertNotSelf_(ctx, 'contract.service.accept', [cur.created_by, cur.updated_by]);
      assertVersion_(ctx, cur, 'CONTRACT_SERVICE', 'ContractServices');
      if (cur.status !== 'DONE') throw validationError_([fieldError_('service_id', 'INVALID_VALUE')]);
      var row = clone_(cur); delete row.__row;
      row.status = 'ACCEPTED'; row.accepted_by = ctx.user.user_id; row.accepted_at = isoVN_(now_());
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'ContractServices', mode: 'update', row: row }],
        result: { entity_type: 'CONTRACT_SERVICE', entity_id: row.service_id, record_version: row.record_version, record: projectRow_(ctx, row, 'ContractServices') },
        record_version: row.record_version,
        audit: { entity_type: 'CONTRACT', entity_id: row.contract_id, before_json: { status: 'DONE' }, after_json: { status: 'ACCEPTED' }, auth_basis: basis === 'SELF_APPROVAL_EXCEPTION' ? basis : undefined }
      };
    }
  });
}

function contractView_(ctx) {
  var p = ctx.req.payload || {};
  var rows = readRows_('Contracts').filter(function (c) { return p.include_archived || !c.archived_at; });
  if (p.contract_id) rows = rows.filter(function (c) { return c.contract_id === p.contract_id; });
  var ids = {}; rows.forEach(function (c) { ids[c.contract_id] = true; });
  return {
    contracts: rows.map(function (c) { return projectRow_(ctx, c, 'Contracts'); }),
    equipment: readRows_('ContractEquipment').filter(function (x) { return ids[x.contract_id] && !x.archived_at; }).map(function (x) { return projectRow_(ctx, x, 'ContractEquipment'); }),
    services: readRows_('ContractServices').filter(function (x) { return ids[x.contract_id] && !x.archived_at; }).map(function (x) { return projectRow_(ctx, x, 'ContractServices'); })
  };
}

// ===== 19_alerts.js =====
/* 19_alerts: Nhắc hạn và Gmail theo mốc — 1.4 §12; phụ lục 1.5 mục 2.7 (A7), 3.11 (B8), 4.4.15, 6.5.3.
 * Alerts: một dòng mỗi (entity_type, entity_id, due_revision) trong cửa sổ lead_days hoặc quá hạn.
 * NotificationLogs là hàng chờ email: QUEUED → SENDING → SENT | FAILED | UNKNOWN; SKIPPED khi không gửi. */

/** "Hôm nay" theo ngày lịch Việt Nam; THỬ cho giả lập bằng ScriptProperties TEST_TODAY (6.8) */
function todayVN_() {
  if (isTestEnv_()) {
    var t = prop_('TEST_TODAY');
    if (t && isDateStr_(t)) return t;
  }
  return dateVN_(now_());
}

function dayNum_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
}

/** dr = ngày tham chiếu − hôm nay (ngày lịch) */
function daysRemaining_(due, today) {
  var a = dayNum_(today), b = dayNum_(due);
  return a === null || b === null ? null : b - a;
}

/** Mốc (2.7): null khi dr > lead_days */
function stageFor_(dr) {
  var lead = Number(setting_('lead_days') || 40);
  if (dr === null || dr > lead) return null;
  if (dr > 30) return 'D40';
  if (dr > 14) return 'D30';
  if (dr > 7) return 'D14';
  if (dr > 3) return 'D7';
  if (dr > 1) return 'D3';
  if (dr === 1) return 'D1';
  if (dr > -7) return 'D0';
  return 'OD' + Math.floor(-dr / 7);
}

/** Hồ sơ đang có hạn cần nhắc: [{entity_type, entity_id, due_date, due_revision, kind, owner_user_id}] */
function desiredAlerts_() {
  var out = [];
  readRows_('InspectionRequirements').forEach(function (r) {
    if (r.active === false || r.archived_at || r.operational_status === 'SUSPENDED' || !r.current_due_date) return;
    out.push({ entity_type: 'INSPECTION_REQUIREMENT', entity_id: r.requirement_id, due_date: r.current_due_date, kind: 'VALID_TO',
      due_revision: r.due_revision || ('VALID_TO:' + r.current_due_date + ':' + (r.current_inspection_id || r.requirement_id)), owner_user_id: r.owner_user_id || '' });
  });
  readRows_('Contracts').forEach(function (c) {
    if (c.lifecycle_status !== 'ACTIVE' || c.archived_at) return;
    var ref = contractRef_(c);
    if (!ref.date) return;
    out.push({ entity_type: 'CONTRACT', entity_id: c.contract_id, due_date: ref.date, kind: ref.kind,
      due_revision: c.due_revision || contractDueRevision_(c), owner_user_id: c.owner_user_id || '' });
  });
  return out;
}

/**
 * Tính lại Alerts (dưới khóa ghi, đoạn ngắn). Trả số dòng đổi.
 * Cảnh báo không còn khớp (hạn mới, hồ sơ lưu trữ, hợp đồng kết thúc) → RESOLVED; dòng email QUEUED của nó → SKIPPED.
 */
function refreshAlerts_() {
  var today = todayVN_();
  var nowIso = isoVN_(now_());
  return withWriteLock_(function () {
    var desired = desiredAlerts_();
    var alerts = readRows_('Alerts');
    var openByKey = {};
    alerts.forEach(function (a) { if (a.alert_state !== 'RESOLVED') openByKey[a.entity_type + '|' + a.entity_id + '|' + a.due_revision] = a; });
    var st = readState_();
    var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
    var changed = 0, inserts = [], keep = {};
    desired.forEach(function (d) {
      var dr = daysRemaining_(d.due_date, today);
      var stage = stageFor_(dr);
      if (!stage) return; // ngoài cửa sổ lead_days: chưa nhắc
      var key = d.entity_type + '|' + d.entity_id + '|' + d.due_revision;
      keep[key] = true;
      var a = openByKey[key];
      if (a) {
        if (a.days_remaining !== dr || a.stage !== stage || a.due_date !== d.due_date || a.owner_user_id !== d.owner_user_id) {
          writeCells_('Alerts', a.__row, { days_remaining: dr, stage: stage, due_date: d.due_date, owner_user_id: d.owner_user_id, refreshed_at: nowIso, sync_revision: rev });
          changed++;
        }
      } else {
        inserts.push({
          alert_id: uuid_(), entity_type: d.entity_type, entity_id: d.entity_id, due_revision: d.due_revision, due_date: d.due_date,
          days_remaining: dr, alert_state: 'OPEN', owner_user_id: d.owner_user_id, acknowledged_at: '', resolved_at: '',
          refreshed_at: nowIso, dataset_epoch: sysProps_().dataset_epoch, reference_date_kind: d.kind, stage: stage, sync_revision: rev
        });
      }
    });
    var resolvedIds = {};
    alerts.forEach(function (a) {
      if (a.alert_state === 'RESOLVED') return;
      if (keep[a.entity_type + '|' + a.entity_id + '|' + a.due_revision]) return;
      writeCells_('Alerts', a.__row, { alert_state: 'RESOLVED', resolved_at: nowIso, refreshed_at: nowIso, sync_revision: rev });
      resolvedIds[a.alert_id] = true;
      changed++;
    });
    if (inserts.length) { insertRows_('Alerts', inserts); changed += inserts.length; }
    if (Object.keys(resolvedIds).length) {
      readRows_('NotificationLogs').forEach(function (n) {
        if (n.status === 'QUEUED' && resolvedIds[n.alert_id]) writeCells_('NotificationLogs', n.__row, { status: 'SKIPPED', error_code: 'RESOLVED' });
      });
    }
    if (changed) stateWrite_(st, { sync_revision: ['INT', rev], 'table_rev.Alerts': ['INT', rev] }, SYSTEM_USER);
    return changed;
  });
}

/** Sau thao tác làm đổi hạn (duyệt, gia hạn, kết thúc, lưu trữ): tính lại ngay, lỗi thì để trigger tính sau */
function afterDueChange_() {
  try { refreshAlerts_(); } catch (e) { console.warn('refreshAlerts_ ' + (e && e.message)); }
}

/* ---------------- Action ---------------- */

function alertModule_(entityType) {
  return entityType === 'CONTRACT' ? 'contracts' : 'inspections';
}

function alertView_(ctx) {
  var mods = { contracts: can_(ctx, 'alert.view', { module: 'contracts' }), inspections: can_(ctx, 'alert.view', { module: 'inspections' }) };
  if (!mods.contracts && !mods.inspections) throw apiError_('FORBIDDEN');
  var items = readRows_('Alerts').filter(function (a) { return a.alert_state !== 'RESOLVED' && mods[alertModule_(a.entity_type)]; })
    .map(function (a) { return projectRow_(ctx, a, 'Alerts'); });
  return { items: items, today: todayVN_() };
}

/** alert.acknowledge {alert_id}: đánh dấu đã tiếp nhận — không đóng cảnh báo, không đổi hạn, vẫn gửi theo mốc */
function alertAcknowledge_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.alert_id)) throw validationError_([fieldError_('alert_id', 'ID_INVALID')]);
  var a0 = findOne_('Alerts', 'alert_id', p.alert_id);
  if (!a0 || a0.alert_state === 'RESOLVED') throw apiError_('NOT_FOUND');
  authorize_(ctx, 'alert.acknowledge', { module: alertModule_(a0.entity_type) });
  return executeWrite_(ctx, {
    entity_type: 'ALERT', entity_id: p.alert_id,
    build: function () {
      var a = findOne_('Alerts', 'alert_id', p.alert_id);
      var row = clone_(a); delete row.__row;
      row.alert_state = 'ACKNOWLEDGED'; row.acknowledged_at = isoVN_(now_());
      return {
        writes: [{ sheet: 'Alerts', mode: 'update', row: row }],
        result: { entity_type: 'ALERT', entity_id: row.alert_id, record: projectRow_(ctx, row, 'Alerts') },
        audit: { entity_type: row.entity_type, entity_id: row.entity_id, before_json: { alert_state: a.alert_state }, after_json: { alert_state: 'ACKNOWLEDGED' } }
      };
    }
  });
}

/* ---------------- Người nhận ---------------- */

var ENTITY_SCOPES_ = ['INSPECTION', 'CONTRACT', 'ALL'];

/** notify.recipient.edit {recipient_id, email, user_id, entity_scope, active, confirm} — C4, PIN */
function notifyRecipientEdit_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.recipient_id)) throw validationError_([fieldError_('recipient_id', 'ID_INVALID')]);
  var cur0 = findOne_('NotificationRecipients', 'recipient_id', p.recipient_id);
  var errs = [];
  var email = p.email !== undefined ? trimStr_(p.email).toLowerCase() : (cur0 ? cur0.email : '');
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) errs.push(fieldError_('email', 'INVALID_VALUE'));
  if (p.entity_scope !== undefined && ENTITY_SCOPES_.indexOf(p.entity_scope) < 0) errs.push(fieldError_('entity_scope', 'INVALID_VALUE'));
  if (p.user_id && (!isUuidV4_(p.user_id) || !findRowNums_('Users', 'user_id', p.user_id).length)) errs.push(fieldError_('user_id', 'NOT_FOUND'));
  if (p.location_scope) errs.push(fieldError_('location_scope', 'SCOPE_NOT_SUPPORTED'));
  if (!cur0 && Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  return executeWrite_(ctx, {
    entity_type: 'RECIPIENT', entity_id: p.recipient_id,
    build: function () {
      var cur = findOne_('NotificationRecipients', 'recipient_id', p.recipient_id);
      if (cur) assertVersion_(ctx, cur, 'RECIPIENT', 'NotificationRecipients');
      var dup = findAll_('NotificationRecipients', 'email', email).filter(function (r) { return r.recipient_id !== p.recipient_id && r.active !== false; });
      if (dup.length) throw validationError_([fieldError_('email', 'CODE_DUPLICATE')]);
      var row = cur ? clone_(cur) : { recipient_id: p.recipient_id, location_scope: '', entity_scope: 'ALL', active: true, confirmed_by: '', confirmed_at: '' };
      delete row.__row;
      var emailChanged = row.email !== email;
      row.email = email;
      if (p.user_id !== undefined) row.user_id = p.user_id || '';
      if (p.entity_scope !== undefined) row.entity_scope = p.entity_scope;
      if (p.active !== undefined) row.active = !!p.active;
      // Đổi địa chỉ thì phải xác nhận lại; xác nhận ghi người và thời điểm
      if (emailChanged) { row.confirmed_by = ''; row.confirmed_at = ''; }
      if (p.confirm === true) { row.confirmed_by = ctx.user.user_id; row.confirmed_at = isoVN_(now_()); }
      if (p.confirm === false) { row.confirmed_by = ''; row.confirmed_at = ''; }
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'NotificationRecipients', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'RECIPIENT', entity_id: row.recipient_id, record_version: row.record_version, record: projectRecipient_(ctx, row) },
        record_version: row.record_version,
        audit: { entity_type: 'RECIPIENT', entity_id: row.recipient_id, before_json: cur ? { email: cur.email, active: cur.active, confirmed: !!cur.confirmed_at } : null, after_json: { email: row.email, active: row.active, confirmed: !!row.confirmed_at, entity_scope: row.entity_scope } }
      };
    }
  });
}

/** C3 không thấy địa chỉ email (4.4.15) */
function projectRecipient_(ctx, r) {
  var o = projectRow_(ctx, r, 'NotificationRecipients');
  if (Number(ctx.user.role_level) < 4) { o.email = maskEmail_(r.email); }
  return o;
}
function maskEmail_(e) {
  var s = String(e || ''), i = s.indexOf('@');
  return i > 1 ? s.charAt(0) + '***' + s.slice(i) : '***';
}

/* ---------------- Cài đặt Gmail ---------------- */

/** Ghi một khóa Settings (dưới khóa ghi) và xóa cache */
function writeSetting_(key, value, by) {
  var row = findOne_('Settings', 'setting_key', key);
  var def = SETTINGS_DEFAULTS.filter(function (d) { return d[0] === key; })[0];
  var type = def ? def[1] : 'STRING';
  var v = type === 'BOOL' ? (value ? 'true' : 'false') : (type === 'JSON' ? JSON.stringify(value) : String(value));
  if (row) writeCells_('Settings', row.__row, { value: v, updated_at: isoVN_(now_()), updated_by: by });
  else { var r = settingRow_(def); r.value = v; r.updated_by = by; insertRows_('Settings', [r]); }
  cache_().remove('cfg:settings');
  DB_.settings = null;
}

/** notify.settings.edit {gmail_enabled, email_hour, test_send} — C4, PIN. Mốc A7 cố định, không sửa */
function notifySettingsEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (p.gmail_enabled !== undefined && typeof p.gmail_enabled !== 'boolean') errs.push(fieldError_('gmail_enabled', 'INVALID_VALUE'));
  if (p.email_hour !== undefined && !(Number(p.email_hour) >= 0 && Number(p.email_hour) <= 23 && Math.floor(p.email_hour) === Number(p.email_hour))) errs.push(fieldError_('email_hour', 'INVALID_VALUE'));
  ['email_stages', 'overdue_repeat_days', 'lead_days'].forEach(function (f) { if (p[f] !== undefined) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  if (errs.length) throw validationError_(errs);
  var before = { gmail_enabled: setting_('gmail_enabled'), email_hour: setting_('email_hour') };
  withWriteLock_(function () {
    if (p.gmail_enabled !== undefined) writeSetting_('gmail_enabled', p.gmail_enabled, ctx.user.user_id);
    if (p.email_hour !== undefined) writeSetting_('email_hour', Number(p.email_hour), ctx.user.user_id);
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'notify.settings.edit', entity_type: 'SETTINGS', entity_id: 'gmail',
      before_json: before, after_json: { gmail_enabled: setting_('gmail_enabled'), email_hour: setting_('email_hour') }, operation_id: '', auth_basis: 'ROLE_LEVEL' });
  });
  if (p.email_hour !== undefined && Number(p.email_hour) !== Number(before.email_hour)) {
    try { installTriggers(); } catch (e) { console.warn('installTriggers ' + (e && e.message)); }
  }
  var test = null;
  if (p.test_send) test = sendTestMail_(ctx);
  return { gmail_enabled: setting_('gmail_enabled'), email_hour: setting_('email_hour'), test: test };
}

/** Gửi thử: chỉ tới người nhận đã xác nhận (6.5.3) */
function sendTestMail_(ctx) {
  var list = readRows_('NotificationRecipients').filter(function (r) { return r.active !== false && r.confirmed_at; });
  var sent = 0;
  list.forEach(function (r) {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail({ to: r.email, subject: '[M&E] Gửi thử · 测试邮件 — ' + fmtDateVN_(todayVN_()),
      body: 'Thư thử từ app M&E. Không cần trả lời.\n来自M&E应用的测试邮件，无需回复。', name: 'M&E' });
    sent++;
  });
  return { sent: sent, quota: MailApp.getRemainingDailyQuota() };
}

function notifyLogView_(ctx) {
  var p = ctx.req.payload || {};
  var rec = {};
  readRows_('NotificationRecipients').forEach(function (r) { rec[r.recipient_id] = r; });
  var logs = readRows_('NotificationLogs').filter(function (n) { return !p.status || n.status === p.status; });
  logs.sort(function (a, b) { return String(b.queued_at || b.attempt_at).localeCompare(String(a.queued_at || a.attempt_at)); });
  var c4 = Number(ctx.user.role_level) >= 4;
  return {
    items: logs.slice(0, Math.min(500, Number(p.limit) || 200)).map(function (n) {
      var o = projectRow_(ctx, n, 'NotificationLogs');
      var r = rec[n.recipient_id];
      o.recipient = r ? (c4 ? r.email : maskEmail_(r.email)) : '';
      return o;
    }),
    recipients: readRows_('NotificationRecipients').map(function (r) { return projectRecipient_(ctx, r); }),
    quota: MailApp.getRemainingDailyQuota(), gmail_enabled: !!setting_('gmail_enabled'), email_hour: setting_('email_hour')
  };
}

/** notify.resend {notification_id}: chỉ dòng UNKNOWN; gửi lại đúng một thư (C4, PIN) */
function notifyResend_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.notification_id)) throw validationError_([fieldError_('notification_id', 'ID_INVALID')]);
  var n = findOne_('NotificationLogs', 'notification_id', p.notification_id);
  if (!n) throw apiError_('NOT_FOUND');
  if (n.status !== 'UNKNOWN') throw validationError_([fieldError_('notification_id', 'INVALID_VALUE')]);
  var r = findOne_('NotificationRecipients', 'recipient_id', n.recipient_id);
  if (!r || r.active === false || !r.confirmed_at) throw validationError_([fieldError_('recipient_id', 'NOT_FOUND')]);
  if (MailApp.getRemainingDailyQuota() < 1) throw apiError_('QUOTA_EXCEEDED');
  var mail = composeDigest_(r, [n], todayVN_());
  MailApp.sendEmail(mail);
  withWriteLock_(function () {
    var cur = findOne_('NotificationLogs', 'notification_id', n.notification_id);
    writeCells_('NotificationLogs', cur.__row, { status: 'SENT', sent_at: isoVN_(now_()), attempt_count: (cur.attempt_count || 0) + 1, error_code: 'RESENT' });
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'notify.resend', entity_type: n.entity_type, entity_id: n.entity_id,
      before_json: { status: 'UNKNOWN' }, after_json: { status: 'SENT' }, operation_id: ctx.req.operation_id || '', auth_basis: 'ROLE_LEVEL' });
  });
  return { notification_id: n.notification_id, status: 'SENT' };
}

/* ---------------- Gửi thư tổng hợp ---------------- */

function fmtDateVN_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}
function lab_(key, vars) {
  var p = LABELS[key] || [key, key];
  var vi = p[0], zh = p[1];
  if (vars) Object.keys(vars).forEach(function (k) { vi = vi.split('{' + k + '}').join(vars[k]); zh = zh.split('{' + k + '}').join(vars[k]); });
  return vi + ' · ' + zh;
}

/** Người nhận có được nhận hồ sơ này không: phạm vi + quyền xem của user gắn kèm (4.4.15) */
function recipientMay_(r, entityType) {
  var scope = r.entity_scope || 'ALL';
  if (scope !== 'ALL' && !(scope === 'INSPECTION' ? entityType === 'INSPECTION_REQUIREMENT' : entityType === 'CONTRACT')) return false;
  if (!r.user_id) return true;
  var u = findOne_('Users', 'user_id', r.user_id);
  if (!u || !u.active) return false;
  return can_({ user: u, req: { payload: {} } }, 'alert.view', { module: alertModule_(entityType) });
}

/** Nội dung một thư: ba nhóm Quá hạn / Đến hạn hôm nay / Sắp tới hạn; không giá, không PIN/token, không đính kèm */
function composeDigest_(rcpt, rows, today) {
  var base = String(setting_('app_base_url') || '').replace(/\/?$/, '/');
  var qrBy = {};
  readRows_('QrRegistry').forEach(function (q) { qrBy[q.entity_id] = q.qr_key; });
  var reqs = {}, types = {}, eqs = {}, locs = {}, contracts = {};
  readRows_('InspectionRequirements').forEach(function (x) { reqs[x.requirement_id] = x; });
  readRows_('InspectionTypes').forEach(function (x) { types[x.inspection_type_id] = x; });
  readRows_('Equipment').forEach(function (x) { eqs[x.equipment_id] = x; });
  readRows_('Locations').forEach(function (x) { locs[x.location_id] = x; });
  readRows_('Contracts').forEach(function (x) { contracts[x.contract_id] = x; });
  var insp = readRows_('Inspections');
  var dir = userDirectory_();
  var nm = function (o, f) {
    if (!o) return '';
    var vi = o[f + '_vi'] || '', zh = o[f + '_zh'] || '';
    var meta = o.i18n_meta && o.i18n_meta[f];
    var mt = meta && meta.state === 'MACHINE' ? ' (' + lab_('tag.machine_translated') + ')' : '';
    return vi && zh ? vi + ' · ' + zh + mt : (vi || zh);
  };
  function line(n) {
    var dr = daysRemaining_(n.due_date, today);
    var due = dr > 0 ? 'Còn ' + dr + ' ngày · 剩余' + dr + '天' : dr === 0 ? lab_('due_state.DUE_TODAY') : 'Quá hạn ' + (-dr) + ' ngày · 已逾期' + (-dr) + '天';
    var parts = [];
    if (n.entity_type === 'INSPECTION_REQUIREMENT') {
      var r = reqs[n.entity_id] || {};
      var e = eqs[r.equipment_id], l = locs[r.location_id || (e && e.location_id)];
      var rs = requirementRecordStatus_(r, insp);
      parts.push(lab_('module.inspections') + ' — ' + (r.requirement_code || ''));
      parts.push(nm(types[r.inspection_type_id], 'name'));
      if (e) parts.push(e.equipment_code + ' ' + nm(e, 'name'));
      if (l) parts.push(l.location_code);
      parts.push(lab_('field.valid_to') + ': ' + fmtDateVN_(n.due_date) + ' (' + due + ')');
      if (rs === 'FAILED' || rs === 'REVOKED') parts.push(lab_('record_status.' + rs));
      if (r.owner_user_id && dir[r.owner_user_id]) parts.push(lab_('col.owner') + ': ' + dir[r.owner_user_id].display_name);
    } else {
      var c = contracts[n.entity_id] || {};
      var ref = contractRef_(c);
      var drEnd = daysRemaining_(c.end_date, today);
      parts.push(lab_('module.contracts') + ' — ' + (c.contract_code || ''));
      parts.push(nm(c, 'title'));
      if (c.renewal_notice_date) parts.push(lab_('field.renewal_notice_date') + ': ' + fmtDateVN_(c.renewal_notice_date) + (ref.kind === 'RENEWAL_NOTICE' ? ' — đang nhắc · 本次提醒' : ''));
      parts.push(lab_('field.end_date') + ': ' + fmtDateVN_(c.end_date) + (drEnd !== null && drEnd >= 0 ? ' (còn ' + drEnd + ' ngày · 剩余' + drEnd + '天)' : '') + (ref.kind === 'END_DATE' ? ' — đang nhắc · 本次提醒' : ''));
      parts.push(due);
      if (c.owner_user_id && dir[c.owner_user_id]) parts.push(lab_('col.owner') + ': ' + dir[c.owner_user_id].display_name);
    }
    if (base && qrBy[n.entity_id]) parts.push(base + '#/r/' + qrBy[n.entity_id]);
    return '• ' + parts.filter(String).join('\n  ');
  }
  var groups = [['home.overdue', function (dr) { return dr < 0; }], ['due_state.DUE_TODAY', function (dr) { return dr === 0; }], ['home.due_soon', function (dr) { return dr > 0; }]];
  var body = [];
  groups.forEach(function (g) {
    var list = rows.filter(function (n) { return g[1](daysRemaining_(n.due_date, today)); });
    if (!list.length) return;
    body.push('== ' + lab_(g[0]) + ' ==');
    list.forEach(function (n) { body.push(line(n)); });
    body.push('');
  });
  // Số mục khác trong 40 ngày tới thuộc phạm vi người nhận (không có trong thư này)
  var sentIds = {}; rows.forEach(function (n) { sentIds[n.entity_id] = true; });
  var others = readRows_('Alerts').filter(function (a) { return a.alert_state !== 'RESOLVED' && !sentIds[a.entity_id] && recipientMay_(rcpt, a.entity_type); }).length;
  if (others) body.push('Còn ' + others + ' mục khác trong 40 ngày tới — xem trang Nhắc hạn trong app · 另有 ' + others + ' 项将在40天内到期，请在应用“到期提醒”页查看');
  body.push('Link mở bằng trình duyệt và cần đăng nhập; trên iPhone nên mở app M&E và vào Nhắc hạn. · 链接需在浏览器中登录后打开；在iPhone上建议打开M&E应用进入“到期提醒”。');
  return {
    to: rcpt.email, name: 'M&E',
    subject: '[M&E] Nhắc hạn kiểm định và hợp đồng · 检验与合同到期提醒 — ' + fmtDateVN_(today),
    body: body.join('\n')
  };
}

/**
 * Trigger hằng ngày (6.5.3): bảo trì → bỏ qua; tính lại Alerts; dọn nhật ký; gmail_enabled thì xếp hàng và gửi theo mốc.
 */
function sendExpiryDigest() {
  if (prop_('MAINTENANCE_MODE') === 'true') return;
  var t0 = Date.now();
  try { sendExpiryDigestRun_(); } finally { recordTriggerRun_('sendExpiryDigest', t0); }
}

function sendExpiryDigestRun_() {
  dbReset_();
  refreshAlerts_();
  housekeeping_();
  if (!setting_('gmail_enabled')) { log_('sendExpiryDigest: gmail_enabled = FALSE — chỉ tính lại Alerts.'); return; }
  var res = processMailQueue_();
  log_('sendExpiryDigest: xếp ' + res.queued + ', gửi ' + res.sent + ' thư, lỗi ' + res.failed + ', bỏ qua ' + res.skipped + '.');
}

/** Xếp hàng theo mốc rồi gửi thư tổng hợp mỗi người nhận. Trả số liệu */
function processMailQueue_() {
  var today = todayVN_();
  var nowIso = isoVN_(now_());
  var maxAttempts = Number(setting_('email_max_attempts') || 3);
  var out = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  var recipients = readRows_('NotificationRecipients').filter(function (r) { return r.active !== false && r.confirmed_at && r.email; });
  // 1. Xếp hàng + dọn dòng cũ (dưới khóa, đoạn ngắn)
  withWriteLock_(function () {
    var alerts = readRows_('Alerts').filter(function (a) { return a.alert_state !== 'RESOLVED' && a.stage; });
    var alertById = {}; alerts.forEach(function (a) { alertById[a.alert_id] = a; });
    var logs = readRows_('NotificationLogs');
    var byKey = {};
    logs.forEach(function (n) { if (n.status !== 'SKIPPED') byKey[n.dedupe_key] = n; });
    // SENDING quá 1 giờ → UNKNOWN (không tự gửi lại)
    logs.forEach(function (n) {
      if (n.status === 'SENDING') {
        var t = parseTime_(n.attempt_at);
        if (!t || now_().getTime() - t.getTime() > 3600000) writeCells_('NotificationLogs', n.__row, { status: 'UNKNOWN' });
      }
      // QUEUED/FAILED mà mốc đã qua hoặc cảnh báo đã đóng → SKIPPED (SUPERSEDED)
      if (n.status === 'QUEUED' || n.status === 'FAILED') {
        var a = alertById[n.alert_id];
        if (!a || a.stage !== n.stage || a.due_revision !== n.due_revision) { writeCells_('NotificationLogs', n.__row, { status: 'SKIPPED', error_code: 'SUPERSEDED' }); out.skipped++; delete byKey[n.dedupe_key]; }
      }
    });
    var inserts = [];
    alerts.forEach(function (a) {
      recipients.forEach(function (r) {
        if (!recipientMay_(r, a.entity_type)) return;
        var key = [r.recipient_id, a.entity_type, a.entity_id, a.due_revision, a.stage].join('|');
        if (byKey[key]) return;
        var row = {
          notification_id: uuid_(), dedupe_key: key, run_date: today, recipient_id: r.recipient_id, entity_type: a.entity_type, entity_id: a.entity_id,
          due_revision: a.due_revision, due_date: a.due_date, stage: a.stage, status: 'QUEUED', attempt_at: '', sent_at: '', error_code: '',
          dataset_epoch: sysProps_().dataset_epoch, alert_id: a.alert_id, reference_date_kind: a.reference_date_kind, days_remaining: a.days_remaining,
          digest_id: '', queued_at: nowIso, attempt_count: 0
        };
        byKey[key] = row;
        inserts.push(row);
      });
    });
    if (inserts.length) insertRows_('NotificationLogs', inserts);
    out.queued = inserts.length;
  });
  // 2. Gửi: mỗi người nhận một thư; khóa chỉ giữ lúc đổi trạng thái
  recipients.forEach(function (r) {
    if (prop_('MAINTENANCE_MODE') === 'true') return;
    var digestId = uuid_();
    var batch = withWriteLock_(function () {
      var rows = readRows_('NotificationLogs').filter(function (n) {
        return n.recipient_id === r.recipient_id && (n.status === 'QUEUED' || (n.status === 'FAILED' && (n.attempt_count || 0) < maxAttempts));
      });
      if (!rows.length || MailApp.getRemainingDailyQuota() < 1) return [];
      rows.forEach(function (n) { writeCells_('NotificationLogs', n.__row, { status: 'SENDING', digest_id: digestId, attempt_at: isoVN_(now_()), attempt_count: (n.attempt_count || 0) + 1 }); });
      return rows;
    });
    if (!batch.length) return;
    var ok = true, err = '';
    try { MailApp.sendEmail(composeDigest_(r, batch, today)); } catch (e) { ok = false; err = String(e && e.message || e).slice(0, 80); }
    withWriteLock_(function () {
      readRows_('NotificationLogs').forEach(function (n) {
        if (n.digest_id !== digestId || n.status !== 'SENDING') return;
        writeCells_('NotificationLogs', n.__row, ok ? { status: 'SENT', sent_at: isoVN_(now_()), error_code: '' } : { status: 'FAILED', error_code: err || 'SEND_FAILED' });
      });
    });
    if (ok) out.sent++; else out.failed++;
  });
  return out;
}

/** Dọn AuthAttempts quá hạn giữ, Sessions hết hạn > 30 ngày (3.14) */
function housekeeping_() {
  var keepDays = setting_('auth_attempts_retention_days');
  var cutoff = now_().getTime() - keepDays * 86400000;
  withWriteLock_(function () {
    var rows = readRows_('AuthAttempts');
    var n = 0;
    while (n < rows.length) {
      var t = parseTime_(rows[n].occurred_at);
      if (!t || t.getTime() >= cutoff) break;
      n++;
    }
    if (n > 0) sh_('AuthAttempts').deleteRows(2, n);
  });
  var sCut = now_().getTime() - 30 * 86400000;
  withWriteLock_(function () {
    var del = readRows_('Sessions').filter(function (s) {
      var end = parseTime_(s.revoked_at) || parseTime_(s.expires_at);
      return end && end.getTime() < sCut;
    }).map(function (s) { return s.__row; }).sort(function (a, b) { return b - a; });
    del.slice(0, 200).forEach(function (r) { sh_('Sessions').deleteRow(r); });
  });
}

// ===== 20_users.js =====
/* 20_users: quản trị người dùng — phụ lục 1.5 mục 3.6 (PIN tạm), 4.4.14 (user.*), 4.6.
 * Giới hạn (⁹): không thao tác lên chính mình; không thao tác lên owner trừ khi người làm là owner;
 * không hạ cấp/khóa cấp 4 cuối cùng còn active; mọi thay đổi tăng auth_version, trừ user.unlock.
 * PIN tạm chỉ trả một lần trong phản hồi: không ghi Operations.result_json/intent, AuditLogs, log. */

var EMP_CODE_RE_ = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;
var EMAIL_RE_ = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Bản ghi người dùng gửi client: không bao giờ có pin_hash/salt; C3 không thấy email, lịch sử đăng nhập */
function projectUser_(ctx, u, scopesByUser, sessionsByUser) {
  var t = now_().getTime();
  var lu = parseTime_(u.locked_until);
  var o = {
    user_id: u.user_id, employee_code: u.employee_code, display_name: u.display_name, role_level: Number(u.role_level),
    subroles: (scopesByUser[u.user_id] || []).slice(), active: !!u.active, is_system_owner: !!u.is_system_owner,
    pin_locked: !!(lu && lu.getTime() > t), locked_until: lu && lu.getTime() > t ? u.locked_until : '',
    must_change_pin: !!u.must_change_pin, temp_pin_expires_at: u.must_change_pin ? u.temp_pin_expires_at : '',
    record_version: u.record_version || 1, created_at: u.created_at, updated_at: u.updated_at
  };
  if (Number(ctx.user.role_level) >= 4) {
    o.email = u.email || '';
    o.last_login_at = u.last_login_at || '';
    o.pin_changed_at = u.pin_changed_at || '';
    o.active_sessions = sessionsByUser ? (sessionsByUser[u.user_id] || 0) : undefined;
  }
  return o;
}

function activeSubroles_() {
  var m = {};
  readRows_('UserScopes').forEach(function (s) {
    if (!s.active || !SUBROLES[s.subrole] || s.location_id || s.module) return;
    (m[s.user_id] = m[s.user_id] || []);
    if (m[s.user_id].indexOf(s.subrole) < 0) m[s.user_id].push(s.subrole);
  });
  return m;
}

function userView_(ctx) {
  var scopes = activeSubroles_();
  var sess = null;
  if (Number(ctx.user.role_level) >= 4) {
    sess = {};
    var t = now_().getTime();
    readRows_('Sessions').forEach(function (s) {
      if (s.session_kind === 'FULL' && isSessionActive_(s, t)) sess[s.user_id] = (sess[s.user_id] || 0) + 1;
    });
  }
  var items = readRows_('Users').map(function (u) { return projectUser_(ctx, u, scopes, sess); });
  items.sort(function (a, b) { return String(a.employee_code).localeCompare(String(b.employee_code)); });
  return { items: items, subroles: Object.keys(SUBROLES), me: ctx.user.user_id };
}

/** Kiểm cấp và subrole. Trả danh sách subrole đã chuẩn hóa */
function validateRole_(p, errs) {
  var lvl = Number(p.role_level);
  if (!(lvl >= 1 && lvl <= 4 && Math.floor(lvl) === lvl)) { errs.push(fieldError_('role_level', 'INVALID_VALUE')); return []; }
  var subs = Array.isArray(p.subroles) ? p.subroles.map(String) : [];
  var out = [];
  subs.forEach(function (s) {
    if (!SUBROLES[s]) errs.push(fieldError_('subroles', 'INVALID_VALUE'));
    else if (out.indexOf(s) < 0) out.push(s);
  });
  if (lvl !== 2 && out.length) errs.push(fieldError_('subroles', 'INVALID_VALUE'));
  if (lvl === 2 && !out.length) errs.push(fieldError_('subroles', 'REQUIRED'));
  return out;
}

/** Người đích của thao tác quản trị: tồn tại, không phải mình, owner chỉ owner thao tác */
function adminTarget_(ctx, userId) {
  if (!isUuidV4_(userId)) throw validationError_([fieldError_('user_id', 'ID_INVALID')]);
  var u = findOne_('Users', 'user_id', userId);
  if (!u) throw apiError_('NOT_FOUND');
  if (u.user_id === ctx.user.user_id) throw validationError_([fieldError_('user_id', 'SELF_ACTION')]);
  if (u.is_system_owner && !ctx.user.is_system_owner) throw apiError_('FORBIDDEN');
  return u;
}

/** Còn cấp 4 active nào khác ngoài người này không */
function otherActiveAdmin_(userId) {
  return readRows_('Users').some(function (u) { return u.user_id !== userId && u.active && Number(u.role_level) === 4; });
}

/** So expected_version (không lộ dòng Users ra phản hồi lỗi) */
function assertUserVersion_(ctx, u) {
  var ev = ctx.req.expected_version;
  if (ev === undefined || ev === null || Number(ev) !== Number(u.record_version || 1)) {
    throw apiError_('VERSION_CONFLICT', { entity_type: 'USER', server: projectUser_(ctx, u, activeSubroles_(), null), server_version: u.record_version || 1 });
  }
}

/** Thu hồi mọi phiên còn hiệu lực (dưới khóa; ghi Sheet trước, cache sau) */
function revokeUserSessions_(userId, reason) {
  var t = now_().getTime();
  findAll_('Sessions', 'user_id', userId).forEach(function (s) {
    if (isSessionActive_(s, t)) revokeSessionRow_(s, reason || 'AUTH_VERSION');
  });
}

/** Sau khi ghi Users: làm mới cache phiên/người dùng */
function afterUserWrite_(userId, oldAv, newAv) {
  var c = cache_();
  if (newAv !== undefined && newAv !== oldAv) c.put('av:' + userId, String(newAv), 21600);
  c.remove('us:' + userId);
  c.remove('users:dir');
  if (oldAv !== undefined) { c.remove('scope:' + userId + ':' + oldAv); c.remove('scope:' + userId + ':' + newAv); }
  DB_.userDir = null;
}

/** Ghi UserScopes theo danh sách subrole mới: ngừng dòng thừa, thêm dòng thiếu */
function planScopes_(ctx, userId, subs, writes) {
  var nowIso = isoVN_(now_());
  var have = {};
  findAll_('UserScopes', 'user_id', userId).forEach(function (s) {
    if (s.location_id || s.module) return;
    if (s.active && subs.indexOf(s.subrole) < 0) {
      var r = clone_(s); delete r.__row;
      r.active = false; r.updated_at = nowIso; r.updated_by = ctx.user.user_id;
      writes.push({ sheet: 'UserScopes', mode: 'update', row: r });
    }
    if (s.active) have[s.subrole] = true;
  });
  subs.forEach(function (sub) {
    if (have[sub]) return;
    writes.push({ sheet: 'UserScopes', mode: 'insert', row: { scope_id: uuid_(), user_id: userId, location_id: '', module: '', subrole: sub, active: true, created_at: nowIso, created_by: ctx.user.user_id, updated_at: nowIso, updated_by: ctx.user.user_id } });
  });
}

/** Trả PIN tạm một lần, chỉ ở lần ghi đầu (gửi lại cùng operation_id không trả lại) */
function withTempPin_(res, box) {
  if (!res || res.code !== 'OK' || !box.pin) return res;
  var out = clone_(res);
  out.data = out.data || {};
  out.data.temp_pin = box.pin;
  return out;
}

/** user.create {user_id, employee_code, display_name, email?, role_level, subroles[]} — C4, PIN */
function userCreate_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.user_id)) errs.push(fieldError_('user_id', 'ID_INVALID'));
  var code = normEmpCode_(p.employee_code);
  if (!code) errs.push(fieldError_('employee_code', 'REQUIRED'));
  else if (!EMP_CODE_RE_.test(code)) errs.push(fieldError_('employee_code', 'CODE_INVALID'));
  var name = trimStr_(p.display_name);
  if (!name) errs.push(fieldError_('display_name', 'REQUIRED'));
  if (name.length > 80) errs.push(fieldError_('display_name', 'INVALID_VALUE'));
  var email = trimStr_(p.email).toLowerCase();
  if (email && !EMAIL_RE_.test(email)) errs.push(fieldError_('email', 'INVALID_VALUE'));
  var subs = validateRole_(p, errs);
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var box = {};
  var res = executeWrite_(ctx, {
    entity_type: 'USER', entity_id: p.user_id,
    build: function () {
      if (findRowNums_('Users', 'user_id', p.user_id).length) throw validationError_([fieldError_('user_id', 'ID_EXISTS')]);
      if (findRowNums_('Users', 'employee_code', code).length) throw validationError_([fieldError_('employee_code', 'CODE_DUPLICATE')]);
      var pin = randomPin_(code);
      var rec = newPinRecord_(pin);
      var nowIso = isoVN_(now_());
      var exp = isoVN_(new Date(now_().getTime() + setting_('temp_pin_hours') * 3600000));
      var row = {
        user_id: p.user_id, employee_code: code, display_name: name, email: email, role_level: Number(p.role_level), active: true,
        pin_hash: rec.pin_hash, salt: rec.salt, pin_hash_version: rec.pin_hash_version, failed_attempts: 0, locked_until: '',
        created_at: nowIso, updated_at: nowIso, auth_version: 1, is_system_owner: false, must_change_pin: true,
        temp_pin_expires_at: exp, pin_changed_at: '', failed_window_started_at: '', last_login_at: '', record_version: 1,
        created_by: ctx.user.user_id, updated_by: ctx.user.user_id
      };
      var writes = [{ sheet: 'Users', mode: 'insert', row: row }];
      planScopes_(ctx, p.user_id, subs, writes);
      box.pin = pin;
      return {
        writes: writes, noReplay: true,
        result: { entity_type: 'USER', entity_id: p.user_id, employee_code: code, temp_pin_expires_at: exp, record_version: 1 },
        record_version: 1,
        audit: { entity_type: 'USER', entity_id: p.user_id, before_json: null, after_json: { employee_code: code, display_name: name, role_level: row.role_level, subroles: subs, temp_pin_issued: true } }
      };
    }
  });
  afterUserWrite_(p.user_id);
  return withTempPin_(res, box);
}

/** user.setRole {user_id, role_level, subroles[], display_name?, email?} — đổi cấp/subrole (tăng auth_version) */
function userSetRole_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  var subs = validateRole_(p, errs);
  var name = p.display_name !== undefined ? trimStr_(p.display_name) : null;
  if (name !== null && (!name || name.length > 80)) errs.push(fieldError_('display_name', name ? 'INVALID_VALUE' : 'REQUIRED'));
  var email = p.email !== undefined ? trimStr_(p.email).toLowerCase() : null;
  if (email && !EMAIL_RE_.test(email)) errs.push(fieldError_('email', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var av = {};
  var res = executeWrite_(ctx, {
    entity_type: 'USER', entity_id: p.user_id,
    build: function () {
      var u = adminTarget_(ctx, p.user_id);
      assertUserVersion_(ctx, u);
      var lvl = Number(p.role_level);
      if (Number(u.role_level) === 4 && lvl !== 4 && u.active && !otherActiveAdmin_(u.user_id)) throw validationError_([fieldError_('role_level', 'LAST_ADMIN')]);
      var before = { role_level: Number(u.role_level), subroles: (activeSubroles_()[u.user_id] || []), display_name: u.display_name, email: u.email ? 'set' : '' };
      var row = clone_(u); delete row.__row;
      row.role_level = lvl;
      if (name !== null) row.display_name = name;
      if (email !== null) row.email = email;
      av.old = u.auth_version || 0;
      row.auth_version = av.old + 1;
      av.new = row.auth_version;
      row.record_version = (u.record_version || 1) + 1;
      row.updated_at = isoVN_(now_()); row.updated_by = ctx.user.user_id;
      var writes = [{ sheet: 'Users', mode: 'update', row: row }];
      planScopes_(ctx, u.user_id, subs, writes);
      revokeUserSessions_(u.user_id, 'AUTH_VERSION');
      return {
        writes: writes, noReplay: true,
        result: { entity_type: 'USER', entity_id: u.user_id, record_version: row.record_version },
        record_version: row.record_version,
        audit: { entity_type: 'USER', entity_id: u.user_id, before_json: before, after_json: { role_level: lvl, subroles: subs, display_name: row.display_name, email: row.email ? 'set' : '' } }
      };
    }
  });
  afterUserWrite_(p.user_id, av.old, av.new);
  return res;
}

/** Khung chung cho lock/unlock/resetPin/revokeSessions */
function userAdminOp_(ctx, kind) {
  var p = ctx.req.payload || {};
  var reason = trimStr_(p.reason);
  if (kind === 'LOCK' && !reason) throw validationError_([fieldError_('reason', 'REQUIRED')]);
  var av = {}, box = {};
  var res = executeWrite_(ctx, {
    entity_type: 'USER', entity_id: p.user_id,
    build: function () {
      var u = adminTarget_(ctx, p.user_id);
      assertUserVersion_(ctx, u);
      var row = clone_(u); delete row.__row;
      var nowIso = isoVN_(now_());
      var before, after;
      av.old = u.auth_version || 0;
      if (kind === 'LOCK') {
        if (Number(u.role_level) === 4 && u.active && !otherActiveAdmin_(u.user_id)) throw validationError_([fieldError_('user_id', 'LAST_ADMIN')]);
        row.active = false;
        before = { active: !!u.active }; after = { active: false };
      } else if (kind === 'UNLOCK') {
        // Mở khóa: bật lại tài khoản và xóa khóa do nhập sai PIN; không tăng auth_version
        row.active = true; row.failed_attempts = 0; row.failed_window_started_at = ''; row.locked_until = '';
        before = { active: !!u.active, pin_locked: !!u.locked_until }; after = { active: true, pin_locked: false };
      } else if (kind === 'RESET_PIN') {
        var pin = randomPin_(u.employee_code);
        var rec = newPinRecord_(pin);
        row.pin_hash = rec.pin_hash; row.salt = rec.salt; row.pin_hash_version = rec.pin_hash_version;
        row.must_change_pin = true;
        row.temp_pin_expires_at = isoVN_(new Date(now_().getTime() + setting_('temp_pin_hours') * 3600000));
        row.failed_attempts = 0; row.failed_window_started_at = ''; row.locked_until = '';
        box.pin = pin;
        before = { must_change_pin: !!u.must_change_pin }; after = { must_change_pin: true, temp_pin_issued: true };
      } else {
        before = { auth_version: av.old }; after = { sessions_revoked: true };
      }
      if (kind !== 'UNLOCK') row.auth_version = av.old + 1;
      av.new = row.auth_version || 0;
      row.record_version = (u.record_version || 1) + 1;
      row.updated_at = nowIso; row.updated_by = ctx.user.user_id;
      if (kind !== 'UNLOCK') revokeUserSessions_(u.user_id, 'AUTH_VERSION');
      var result = { entity_type: 'USER', entity_id: u.user_id, record_version: row.record_version };
      if (kind === 'RESET_PIN') result.temp_pin_expires_at = row.temp_pin_expires_at;
      return {
        writes: [{ sheet: 'Users', mode: 'update', row: row }], noReplay: true,
        result: result, record_version: row.record_version,
        audit: { entity_type: 'USER', entity_id: u.user_id, before_json: before, after_json: after, reason: reason }
      };
    }
  });
  afterUserWrite_(p.user_id, av.old, av.new);
  return withTempPin_(res, box);
}

function userLock_(ctx) { return userAdminOp_(ctx, 'LOCK'); }
function userUnlock_(ctx) { return userAdminOp_(ctx, 'UNLOCK'); }
function userResetPin_(ctx) { return userAdminOp_(ctx, 'RESET_PIN'); }
function userRevokeSessions_(ctx) { return userAdminOp_(ctx, 'REVOKE'); }

// ===== 21_i18n.js =====
/* 21_i18n: từ điển thuật ngữ khi dịch, gợi ý dịch, dịch lại — phụ lục 1.5 mục 2.3 (quy tắc 4, 8), 3.9, 4.4.17.
 * Thuật ngữ chỉ dùng dòng active có approved_by; cả chuỗi trùng → GLOSSARY; chứa thuật ngữ → token ⟦n⟧ rồi dịch. */

/** Thuật ngữ đã duyệt, cache 600 giây (3.9) */
function glossaryTerms_() {
  if (DB_.glossary) return DB_.glossary;
  var c = cache_().get('glossary:approved');
  var list;
  if (c) {
    list = JSON.parse(c);
  } else {
    list = readRows_('Glossary').filter(function (g) {
      return g.active && g.approved_by && !g.archived_at && trimStr_(g.term_vi) && trimStr_(g.term_zh);
    }).map(function (g) { return { vi: trimStr_(g.term_vi), zh: trimStr_(g.term_zh) }; });
    try { cache_().put('glossary:approved', JSON.stringify(list), 600); } catch (e) { /* quá cỡ: đọc lại lần sau */ }
  }
  DB_.glossary = list;
  return list;
}

function normTerm_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function escapeRe_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cả chuỗi trùng một thuật ngữ: trả bản đích, không thì null */
function glossaryExact_(text, src, tgt) {
  var n = normTerm_(text);
  if (!n) return null;
  var terms = glossaryTerms_();
  for (var i = 0; i < terms.length; i++) if (normTerm_(terms[i][src]) === n) return terms[i][tgt];
  return null;
}

/** Mã hiển thị, model/serial dạng mã, số kèm đơn vị: giữ nguyên qua token */
var KEEP_RE_ = /\b[A-Z]{1,6}-[0-9A-Z]{2,}(?:-[0-9A-Z]+)*\b|\d+(?:[.,]\d+)?\s?(?:kVA|kWh|kW|kg\/h|t\/h|m³\/h|m3\/h|MPa|bar|°C|Hz|mm|kg|V|A)(?![A-Za-z])/g;

/**
 * Dịch có thuật ngữ (2.3 quy tắc 4). Trả {text, state: 'GLOSSARY'|'MACHINE'} hoặc null khi dịch lỗi.
 * Người gọi kiểm mtEnabled_ trước khi cần dịch máy.
 */
function translateText_(text, src, tgt) {
  var exact = glossaryExact_(text, src, tgt);
  if (exact) return { text: exact, state: 'GLOSSARY' };
  var tokens = [];
  var put = function (v) { tokens.push(v); return '⟦' + (tokens.length - 1) + '⟧'; };
  var work = String(text);
  glossaryTerms_().filter(function (t) { return t[src]; })
    .sort(function (a, b) { return b[src].length - a[src].length; })
    .forEach(function (t) {
      work = work.replace(new RegExp(escapeRe_(t[src]), 'gi'), function () { return put(t[tgt]); });
    });
  work = work.replace(KEEP_RE_, function (m) { return put(m); });
  var out = mtTranslate_(work, src, tgt);
  if (!out) return null;
  if (!tokens.length) return { text: out, state: 'MACHINE' };
  // Thiếu hoặc thừa token → coi như dịch lỗi
  var seen = {};
  var bad = false;
  var res = out.replace(/⟦\s*(\d+)\s*⟧/g, function (m, d) {
    var i = Number(d);
    if (i >= tokens.length || seen[i]) { bad = true; return m; }
    seen[i] = true;
    return tokens[i];
  });
  if (bad || Object.keys(seen).length !== tokens.length) return null;
  return { text: res, state: 'MACHINE' };
}

/** Bảng có dịch máy (dịch bù, dịch lại) — trường gốc */
var MT_SHEETS_ = {
  Equipment: ['name'], Documents: ['title'], Materials: ['name', 'specification'], EquipmentParts: ['function', 'position'],
  Contracts: ['title'], Locations: ['name'], LookupValues: ['name'], Vendors: ['services']
};

/**
 * Dịch một trường PENDING của một dòng và ghi (không tăng record_version, 2.3 quy tắc 8).
 * Gọi ngoài khóa ghi; ghi dưới khóa sau khi so lại bản gốc. Trả true nếu đã ghi.
 */
function fillPendingField_(sheet, r, f, actorId, opId) {
  var m = r.i18n_meta && r.i18n_meta[f];
  if (!m || m.state !== 'PENDING') return false;
  var tgt = m.src === 'vi' ? 'zh' : 'vi';
  var srcText = trimStr_(r[f + '_' + m.src]);
  if (!srcText) return false;
  var tr = translateText_(srcText, m.src, tgt);
  if (!tr) return false;
  var key = sheetSchema_(sheet).key;
  return withWriteLock_(function () {
    var rn = findRowNums_(sheet, key, r[key])[0];
    if (!rn) return false;
    var cur = readRowAt_(sheet, rn);
    if (trimStr_(cur[f + '_' + m.src]) !== srcText) return false;
    var meta = cur.i18n_meta || {};
    if (!meta[f] || meta[f].state !== 'PENDING') return false;
    meta[f] = { src: m.src, state: tr.state, at: isoVN_(now_()) };
    var st = readState_();
    var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
    var upd = { i18n_meta: meta };
    if (sheetSchema_(sheet).cols.indexOf('sync_revision') >= 0) upd.sync_revision = rev;
    upd[f + '_' + tgt] = tr.text;
    writeCells_(sheet, rn, upd);
    var su = { sync_revision: ['INT', rev] };
    su['table_rev.' + sheet] = ['INT', rev];
    stateWrite_(st, su, actorId);
    writeAudit_({ user_id: actorId, action: 'i18n.machineTranslate', entity_type: sheet, entity_id: r[key], before_json: null, after_json: { field: f, state: tr.state }, operation_id: opId || '', auth_basis: actorId === SYSTEM_USER ? 'SYSTEM' : 'ROLE_LEVEL' });
    return true;
  });
}

/** Mỗi 3 giờ: dịch bù trường PENDING (2.3); không tăng record_version */
function runBackgroundJobs() {
  if (prop_('MAINTENANCE_MODE') === 'true') return;
  if (!mtEnabled_()) return;
  var t0 = Date.now();
  var done = 0;
  Object.keys(MT_SHEETS_).forEach(function (sheet) {
    if (Date.now() - t0 > 150000) return;
    readRows_(sheet).forEach(function (r) {
      if (Date.now() - t0 > 150000 || !r.i18n_meta || !mtEnabled_()) return;
      MT_SHEETS_[sheet].forEach(function (f) {
        if (fillPendingField_(sheet, r, f, SYSTEM_USER)) done++;
      });
    });
  });
  recordTriggerRun_('runBackgroundJobs', t0);
  log_('runBackgroundJobs: dịch bù ' + done + ' trường.');
}

/* ---------------- Gợi ý dịch, dịch lại (4.4.17) ---------------- */

/** i18n.suggest {module, text, from}: trả bản dịch gợi ý, không lưu gì. Cần cờ C hoặc E của module hồ sơ */
function i18nSuggest_(ctx) {
  var p = ctx.req.payload || {};
  var mod = String(p.module || '');
  if (BUSINESS_MODULES_.indexOf(mod) < 0) throw validationError_([fieldError_('module', 'INVALID_VALUE')]);
  authorize_(ctx, 'i18n.suggest', { module: mod });
  var from = p.from === 'zh' ? 'zh' : 'vi', to = from === 'vi' ? 'zh' : 'vi';
  var text = trimStr_(p.text);
  if (!text) throw validationError_([fieldError_('text', 'REQUIRED')]);
  if (text.length > 2000) throw validationError_([fieldError_('text', 'INVALID_VALUE')]);
  if (!setting_('machine_translation_enabled')) throw apiError_('FEATURE_NOT_ENABLED');
  var tr = translateText_(text, from, to);
  if (!tr) throw apiError_('SERVER_BUSY');
  return { text: tr.text, from: from, to: to, state: tr.state };
}

/** Loại hồ sơ → sheet, action sửa (quyền "theo hồ sơ"), module */
var RETRANSLATE_ = {
  EQUIPMENT: { sheet: 'Equipment', edit: 'equipment.edit' },
  MATERIAL: { sheet: 'Materials', edit: 'material.edit' },
  EQUIPMENT_PART: { sheet: 'EquipmentParts', edit: 'part.link' },
  CONTRACT: { sheet: 'Contracts', edit: 'contract.edit' },
  LOCATION: { sheet: 'Locations', edit: 'location.edit' },
  VENDOR: { sheet: 'Vendors', edit: 'vendor.edit' },
  LOOKUP: { sheet: 'LookupValues', edit: 'lookup.edit' },
  DOCUMENT: { sheet: 'Documents', edit: 'doc.upload' }
};

/** i18n.retranslate {entity_type, entity_id}: dịch lại các trường PENDING của hồ sơ; chỉ người sửa được hồ sơ */
function i18nRetranslate_(ctx) {
  var p = ctx.req.payload || {};
  var cfg = RETRANSLATE_[p.entity_type];
  if (!cfg) throw validationError_([fieldError_('entity_type', 'INVALID_VALUE')]);
  if (!isUuidV4_(p.entity_id)) throw validationError_([fieldError_('entity_id', 'ID_INVALID')]);
  var row = findOne_(cfg.sheet, sheetSchema_(cfg.sheet).key, p.entity_id);
  if (!row) throw apiError_('NOT_FOUND');
  var mod = p.entity_type === 'DOCUMENT' ? docModule_(row.entity_type) : ENTITY_TYPES[p.entity_type] ? ENTITY_TYPES[p.entity_type].module :
    (p.entity_type === 'EQUIPMENT_PART' ? 'equipment' : 'catalog');
  if (!mod || !can_(ctx, cfg.edit, { module: mod }) || !can_(ctx, 'i18n.retranslate', { module: mod })) throw apiError_('FORBIDDEN');
  if (!mtEnabled_()) throw apiError_('FEATURE_NOT_ENABLED');
  var done = [], left = [];
  (MT_SHEETS_[cfg.sheet] || []).forEach(function (f) {
    var m = row.i18n_meta && row.i18n_meta[f];
    if (!m || m.state !== 'PENDING') return;
    if (fillPendingField_(cfg.sheet, row, f, ctx.user.user_id, ctx.req.operation_id)) done.push(f); else left.push(f);
  });
  dbReset_();
  var cur = findOne_(cfg.sheet, sheetSchema_(cfg.sheet).key, p.entity_id);
  return { entity_type: p.entity_type, entity_id: p.entity_id, translated: done, pending: left, record: cfg.sheet === 'Documents' ? projectDoc_(ctx, cur) : projectRow_(ctx, cur, cfg.sheet) };
}

// ===== 22_catalog.js =====
/* 22_catalog: Danh mục chung — phụ lục 1.5 mục 4.4.13, 3.9 (Glossary), 5.5 (SPEC_KEY, UNIT).
 * Mã khu vực/nhà cung cấp: nhập tay hoặc máy chủ cấp (KV-001, NCC-0001), không đổi sau khi tạo.
 * Ngừng dùng = active FALSE (hồ sơ cũ vẫn trỏ được, không chọn mới). */

var LOCATION_TYPES_ = ['AREA', 'BUILDING', 'WORKSHOP', 'ROOM', 'STATION', 'OTHER'];
var LOOKUP_GROUPS_ = ['EQUIPMENT_CATEGORY', 'UNIT', 'SPEC_KEY', 'CAUSE'];

/** Tạo hay sửa: tạo khi expected_version = 0 và chưa có dòng */
function catalogCurrent_(ctx, sheet, key, id) {
  var cur = findOne_(sheet, key, id);
  if (!cur && Number(ctx.req.expected_version || 0) !== 0) throw apiError_('NOT_FOUND');
  return cur;
}

function boolOr_(v, dflt) {
  return v === undefined || v === null ? dflt : v === true || v === 'true' || v === 1;
}

/** location.edit {location_id, location_code?, parent_location_id?, name_vi|name_zh, type, active} — C4 */
function locationEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.location_id)) errs.push(fieldError_('location_id', 'ID_INVALID'));
  if (p.type !== undefined && p.type !== '' && LOCATION_TYPES_.indexOf(p.type) < 0) errs.push(fieldError_('type', 'INVALID_VALUE'));
  if (p.parent_location_id && (!isUuidV4_(p.parent_location_id) || p.parent_location_id === p.location_id)) errs.push(fieldError_('parent_location_id', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var cur0 = findOne_('Locations', 'location_id', p.location_id);
  var e2 = [];
  requireOneLang_(e2, p, cur0, 'name');
  if (e2.length) throw validationError_(e2);
  var tr = applyTranslations_('Locations', ['name'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'LOCATION', entity_id: p.location_id,
    build: function (st) {
      var cur = catalogCurrent_(ctx, 'Locations', 'location_id', p.location_id);
      if (cur) assertVersion_(ctx, cur, 'LOCATION', 'Locations');
      var su = {};
      var row = cur ? clone_(cur) : { location_id: p.location_id, parent_location_id: '', type: 'AREA', active: true };
      delete row.__row;
      if (!cur) row.location_code = allocCode_(st, su, 'LOCATION', trimStr_(p.location_code) || null);
      else if (p.location_code !== undefined && trimStr_(p.location_code).toUpperCase() !== cur.location_code) throw validationError_([fieldError_('location_code', 'INVALID_VALUE')]);
      if (p.parent_location_id !== undefined) {
        var parent = p.parent_location_id || '';
        // Không tạo vòng cha–con
        for (var x = parent, guard = 0; x && guard < 50; guard++) {
          if (x === p.location_id) throw validationError_([fieldError_('parent_location_id', 'INVALID_VALUE')]);
          var px = findOne_('Locations', 'location_id', x);
          if (!px) throw validationError_([fieldError_('parent_location_id', 'NOT_FOUND')]);
          x = px.parent_location_id;
        }
        row.parent_location_id = parent;
      }
      if (p.type !== undefined && p.type !== '') row.type = p.type;
      row.active = boolOr_(p.active, row.active !== false);
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh; row.i18n_meta = tr.meta;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Locations', mode: cur ? 'update' : 'insert', row: row }], state: su,
        result: { entity_type: 'LOCATION', entity_id: row.location_id, display_code: row.location_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Locations') },
        record_version: row.record_version,
        audit: { entity_type: 'LOCATION', entity_id: row.location_id, before_json: cur ? { name_vi: cur.name_vi, active: cur.active, parent: cur.parent_location_id } : null, after_json: { location_code: row.location_code, name_vi: row.name_vi, active: row.active, parent: row.parent_location_id } }
      };
    }
  });
}

var VENDOR_PLAIN_ = ['name', 'contact_name', 'phone', 'email', 'address'];

/** vendor.edit {vendor_id, vendor_code?, name, contact_name, phone, email, address, services_vi|services_zh, active} — HĐ, C3, C4 */
function vendorEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.vendor_id)) errs.push(fieldError_('vendor_id', 'ID_INVALID'));
  if (p.email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(trimStr_(p.email))) errs.push(fieldError_('email', 'INVALID_VALUE'));
  VENDOR_PLAIN_.forEach(function (f) { if (p[f] !== undefined && trimStr_(p[f]).length > 200) errs.push(fieldError_(f, 'INVALID_VALUE')); });
  var cur0 = isUuidV4_(p.vendor_id) ? findOne_('Vendors', 'vendor_id', p.vendor_id) : null;
  if (!cur0 && !trimStr_(p.name)) errs.push(fieldError_('name', 'REQUIRED'));
  if (cur0 && p.name !== undefined && !trimStr_(p.name)) errs.push(fieldError_('name', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('Vendors', ['services'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'VENDOR', entity_id: p.vendor_id,
    build: function (st) {
      var cur = catalogCurrent_(ctx, 'Vendors', 'vendor_id', p.vendor_id);
      if (cur) assertVersion_(ctx, cur, 'VENDOR', 'Vendors');
      var su = {};
      var row = cur ? clone_(cur) : { vendor_id: p.vendor_id, contact_name: '', phone: '', email: '', address: '', active: true };
      delete row.__row;
      if (!cur) row.vendor_code = allocCode_(st, su, 'VENDOR', trimStr_(p.vendor_code) || null);
      else if (p.vendor_code !== undefined && trimStr_(p.vendor_code).toUpperCase() !== cur.vendor_code) throw validationError_([fieldError_('vendor_code', 'INVALID_VALUE')]);
      VENDOR_PLAIN_.forEach(function (f) { if (p[f] !== undefined) row[f] = f === 'email' ? trimStr_(p[f]).toLowerCase() : trimStr_(p[f]); });
      row.active = boolOr_(p.active, row.active !== false);
      row.services_vi = tr.values.services_vi; row.services_zh = tr.values.services_zh; row.i18n_meta = tr.meta;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Vendors', mode: cur ? 'update' : 'insert', row: row }], state: su,
        result: { entity_type: 'VENDOR', entity_id: row.vendor_id, display_code: row.vendor_code, record_version: row.record_version, record: projectRow_(ctx, row, 'Vendors') },
        record_version: row.record_version,
        audit: { entity_type: 'VENDOR', entity_id: row.vendor_id, before_json: cur ? { name: cur.name, active: cur.active } : null, after_json: { vendor_code: row.vendor_code, name: row.name, active: row.active } }
      };
    }
  });
}

/** Mã LookupValues: SPEC_KEY snake_case (5.5); nhóm khác chữ, số và ký hiệu đơn vị */
function lookupCodeOk_(group, code) {
  if (group === 'SPEC_KEY') return /^[a-z][a-z0-9_]{1,39}$/.test(code);
  return /^[A-Za-z0-9][A-Za-z0-9._\/³²°%-]{0,31}$/.test(code);
}

/** lookup.edit {value_id, group_key, code, name_vi|name_zh, parent_value_id?, active} — C3, C4 */
function lookupEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.value_id)) errs.push(fieldError_('value_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.value_id) ? findOne_('LookupValues', 'value_id', p.value_id) : null;
  var group = cur0 ? cur0.group_key : String(p.group_key || '');
  var code = cur0 ? cur0.code : trimStr_(p.code);
  if (!cur0) {
    if (LOOKUP_GROUPS_.indexOf(group) < 0) errs.push(fieldError_('group_key', 'INVALID_VALUE'));
    if (!code) errs.push(fieldError_('code', 'REQUIRED'));
    else if (!lookupCodeOk_(group, code)) errs.push(fieldError_('code', 'CODE_INVALID'));
    else if (group === 'SPEC_KEY' && SPEC_STD_[code]) errs.push(fieldError_('code', 'CODE_DUPLICATE'));
  } else {
    if (p.group_key !== undefined && p.group_key !== cur0.group_key) errs.push(fieldError_('group_key', 'INVALID_VALUE'));
    if (p.code !== undefined && trimStr_(p.code) !== cur0.code) errs.push(fieldError_('code', 'INVALID_VALUE'));
  }
  if (p.parent_value_id && !isUuidV4_(p.parent_value_id)) errs.push(fieldError_('parent_value_id', 'INVALID_VALUE'));
  requireOneLang_(errs, p, cur0, 'name');
  if (errs.length) throw validationError_(errs);
  var tr = applyTranslations_('LookupValues', ['name'], p, cur0);
  return executeWrite_(ctx, {
    entity_type: 'LOOKUP', entity_id: p.value_id,
    build: function () {
      var cur = catalogCurrent_(ctx, 'LookupValues', 'value_id', p.value_id);
      if (cur) assertVersion_(ctx, cur, 'LOOKUP', 'LookupValues');
      if (!cur) {
        var dup = readRows_('LookupValues').some(function (l) { return l.group_key === group && String(l.code).toLowerCase() === code.toLowerCase(); });
        if (dup) throw validationError_([fieldError_('code', 'CODE_DUPLICATE')]);
      }
      if (p.parent_value_id && !findRowNums_('LookupValues', 'value_id', p.parent_value_id).length) throw validationError_([fieldError_('parent_value_id', 'NOT_FOUND')]);
      var row = cur ? clone_(cur) : { value_id: p.value_id, group_key: group, code: code, parent_value_id: '', active: true };
      delete row.__row;
      if (p.parent_value_id !== undefined) row.parent_value_id = p.parent_value_id || '';
      row.active = boolOr_(p.active, row.active !== false);
      row.name_vi = tr.values.name_vi; row.name_zh = tr.values.name_zh; row.i18n_meta = tr.meta;
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'LookupValues', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'LOOKUP', entity_id: row.value_id, display_code: row.code, record_version: row.record_version, record: projectRow_(ctx, row, 'LookupValues') },
        record_version: row.record_version,
        audit: { entity_type: 'LOOKUP', entity_id: row.value_id, before_json: cur ? { name_vi: cur.name_vi, active: cur.active } : null, after_json: { group_key: row.group_key, code: row.code, name_vi: row.name_vi, active: row.active } }
      };
    }
  });
}

/**
 * glossary.edit {glossary_id, term_vi, term_zh, note, active, approve} — C3, C4.
 * Cả hai thuật ngữ bắt buộc, không trùng trong các dòng active (không phân biệt hoa thường).
 * Đổi thuật ngữ thì bỏ duyệt, trừ khi duyệt lại ngay (approve: true). Chỉ dòng đã duyệt được dùng khi dịch.
 */
function glossaryEdit_(ctx) {
  var p = ctx.req.payload || {};
  var errs = [];
  if (!isUuidV4_(p.glossary_id)) errs.push(fieldError_('glossary_id', 'ID_INVALID'));
  var cur0 = isUuidV4_(p.glossary_id) ? findOne_('Glossary', 'glossary_id', p.glossary_id) : null;
  var vi = p.term_vi !== undefined ? trimStr_(p.term_vi).replace(/\s+/g, ' ') : (cur0 ? cur0.term_vi : '');
  var zh = p.term_zh !== undefined ? trimStr_(p.term_zh).replace(/\s+/g, ' ') : (cur0 ? cur0.term_zh : '');
  if (!vi) errs.push(fieldError_('term_vi', 'REQUIRED'));
  if (!zh) errs.push(fieldError_('term_zh', 'REQUIRED'));
  if (vi.length > 120) errs.push(fieldError_('term_vi', 'INVALID_VALUE'));
  if (zh.length > 120) errs.push(fieldError_('term_zh', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var res = executeWrite_(ctx, {
    entity_type: 'GLOSSARY', entity_id: p.glossary_id,
    build: function () {
      var cur = catalogCurrent_(ctx, 'Glossary', 'glossary_id', p.glossary_id);
      if (cur) assertVersion_(ctx, cur, 'GLOSSARY', 'Glossary');
      var row = cur ? clone_(cur) : { glossary_id: p.glossary_id, note: '', active: true, approved_by: '', approved_at: '' };
      delete row.__row;
      var changed = !cur || row.term_vi !== vi || row.term_zh !== zh;
      row.term_vi = vi; row.term_zh = zh;
      if (p.note !== undefined) row.note = trimStr_(p.note).slice(0, 300);
      row.active = boolOr_(p.active, row.active !== false);
      if (row.active) {
        var dup = readRows_('Glossary').filter(function (g) {
          return g.glossary_id !== row.glossary_id && g.active && !g.archived_at;
        });
        var e3 = [];
        if (dup.some(function (g) { return normTerm_(g.term_vi) === normTerm_(vi); })) e3.push(fieldError_('term_vi', 'CODE_DUPLICATE'));
        if (dup.some(function (g) { return normTerm_(g.term_zh) === normTerm_(zh); })) e3.push(fieldError_('term_zh', 'CODE_DUPLICATE'));
        if (e3.length) throw validationError_(e3);
      }
      if (changed) { row.approved_by = ''; row.approved_at = ''; }
      if (p.approve === true) { row.approved_by = ctx.user.user_id; row.approved_at = isoVN_(now_()); }
      if (p.approve === false) { row.approved_by = ''; row.approved_at = ''; }
      if (cur) cUpdate_(ctx, row); else cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Glossary', mode: cur ? 'update' : 'insert', row: row }],
        result: { entity_type: 'GLOSSARY', entity_id: row.glossary_id, record_version: row.record_version, record: projectRow_(ctx, row, 'Glossary') },
        record_version: row.record_version,
        audit: { entity_type: 'GLOSSARY', entity_id: row.glossary_id, before_json: cur ? { term_vi: cur.term_vi, term_zh: cur.term_zh, approved: !!cur.approved_by, active: cur.active } : null, after_json: { term_vi: vi, term_zh: zh, approved: !!row.approved_by, active: row.active } }
      };
    }
  });
  cache_().remove('glossary:approved');
  DB_.glossary = null;
  return res;
}

// ===== 23_backup.js =====
/* 23_backup: sao lưu có kiểm chứng, Sao lưu ngay, khôi phục thủ công — phụ lục 1.5 mục 6.5.4, 3.14, 4.4.16.
 * Bản sao ở thư mục Backups riêng tư: <yyyy-mm-dd_HHmm>/ gồm 2 spreadsheet + manifest.json.
 * ScriptProperties không nằm trong bản sao. Không chép ảnh/tài liệu (Đợt 1–3). */

/** Sheet ghi không qua sync_revision (đăng nhập, phiên): không dùng để kiểm chứng số dòng */
var BACKUP_VOLATILE_ = { AuthAttempts: 1, Sessions: 1, AuditLogs: 1, Operations: 1 };

function backupRoot_() {
  var id = prop_('DRIVE_BACKUP_FOLDER_ID');
  if (!id) throw new Error('Chưa có DRIVE_BACKUP_FOLDER_ID');
  return DriveApp.getFolderById(id);
}

/** Số dòng dữ liệu (trừ tiêu đề) từng sheet đã biết của một spreadsheet */
function countRows_(ss, out) {
  ss.getSheets().forEach(function (sh) {
    if (SHEETS[sh.getName()]) out[sh.getName()] = Math.max(0, sh.getLastRow() - 1);
  });
  return out;
}

function backupStamp_(d) {
  var iso = isoVN_(d);
  return iso.slice(0, 10) + '_' + iso.slice(11, 13) + iso.slice(14, 16);
}

/** Đọc manifest.json của một thư mục sao lưu, null nếu không có/hỏng */
function readManifest_(folder) {
  var it = folder.getFilesByName('manifest.json');
  if (!it.hasNext()) return null;
  try { return JSON.parse(it.next().getBlob().getDataAsString()); } catch (e) { return null; }
}

/** Danh sách thư mục sao lưu, mới nhất trước: [{folder, name, manifest}] */
function listBackups_() {
  var out = [];
  var it = backupRoot_().getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (!/^\d{4}-\d{2}-\d{2}_\d{4}/.test(f.getName())) continue;
    out.push({ folder: f, name: f.getName(), manifest: readManifest_(f) });
  }
  out.sort(function (a, b) { return a.name < b.name ? 1 : a.name > b.name ? -1 : 0; });
  return out;
}

/** Trigger chạy một lần của backupData (Sao lưu ngay, chạy lại sau INCONSISTENT) */
function oneShotIds_() {
  try { return JSON.parse(prop_('BACKUP_ONESHOT_IDS') || '[]'); } catch (e) { return []; }
}
function scheduleBackupOnce_(afterMs) {
  var t = ScriptApp.newTrigger('backupData').timeBased().after(afterMs).create();
  var ids = oneShotIds_();
  ids.push(t.getUniqueId());
  setProp_('BACKUP_ONESHOT_IDS', JSON.stringify(ids));
  return t.getUniqueId();
}
function clearOneShotTriggers_() {
  var ids = oneShotIds_();
  if (!ids.length) return;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupData' && ids.indexOf(t.getUniqueId()) >= 0) ScriptApp.deleteTrigger(t);
  });
  setProp_('BACKUP_ONESHOT_IDS', '[]');
}

/**
 * Trigger hằng tuần và "Sao lưu ngay" (6.5.4). Chạy được cả khi bảo trì (thủ tục khôi phục bước 2).
 * VERIFIED: số dòng bản sao khớp và sync_revision không đổi; INCONSISTENT: có ghi trong lúc chép (chạy lại một lần sau 15 phút);
 * FAILED: lỗi hoặc số dòng lệch khi không có ghi.
 */
function backupData() {
  var t0 = Date.now();
  try { return backupDataRun_(); } finally { recordTriggerRun_('backupData', t0); }
}

function backupDataRun_() {
  clearOneShotTriggers_();
  var isRetry = prop_('BACKUP_RETRY_PENDING') === 'true';
  if (isRetry) delProp_('BACKUP_RETRY_PENDING');
  dbReset_();
  var started = now_();
  var stamp = backupStamp_(started);
  var root = backupRoot_();
  var folder = root.createFolder(stamp);
  // Mọi bước sau khi có thư mục đều trong try: lỗi gì cũng ghi được manifest FAILED kèm lý do
  var manifest = {
    app_id: APP_ID, created_at: isoVN_(started), folder: stamp, server_version: SERVER_VERSION, retry: isRetry,
    status: 'FAILED', consistent: false, counts: {}, copied_counts: {}, files: {}
  };
  try {
    var st0 = readState_();
    var rev0 = Number(stateGet_(st0, 'sync_revision', 0));
    var bizId = prop_('BUSINESS_SPREADSHEET_ID'), secId = prop_('SECURITY_SPREADSHEET_ID');
    manifest.env = envName_();
    manifest.schema_version = stateGet_(st0, 'schema_version', SCHEMA_VERSION);
    manifest.dataset_epoch = sysProps_().dataset_epoch;
    manifest.sync_revision = rev0;
    countRows_(SpreadsheetApp.openById(bizId), manifest.counts);
    countRows_(SpreadsheetApp.openById(secId), manifest.counts);
    manifest.documents = manifest.counts.Documents || 0;
    var bizCopy = DriveApp.getFileById(bizId).makeCopy(NAME_PREFIX + 'NghiepVu_' + stamp, folder);
    var secCopy = DriveApp.getFileById(secId).makeCopy(NAME_PREFIX + 'BaoMat_' + stamp, folder);
    manifest.files = { business: bizCopy.getId(), security: secCopy.getId() };
    countRows_(SpreadsheetApp.openById(bizCopy.getId()), manifest.copied_counts);
    countRows_(SpreadsheetApp.openById(secCopy.getId()), manifest.copied_counts);
    dbReset_();
    var rev1 = Number(stateGet_(readState_(), 'sync_revision', 0));
    manifest.sync_revision_end = rev1;
    var mismatch = Object.keys(manifest.counts).filter(function (k) {
      return !BACKUP_VOLATILE_[k] && manifest.counts[k] !== manifest.copied_counts[k];
    });
    manifest.mismatch = mismatch;
    if (rev1 !== rev0) manifest.status = 'INCONSISTENT';
    else manifest.status = mismatch.length ? 'FAILED' : 'VERIFIED';
    manifest.consistent = manifest.status === 'VERIFIED';
  } catch (e) {
    manifest.status = 'FAILED';
    manifest.error = String(e && e.message || e).slice(0, 200);
  }
  manifest.finished_at = isoVN_(now_());
  folder.createFile(Utilities.newBlob(JSON.stringify(manifest, null, 2), 'application/json', 'manifest.json'));
  withWriteLock_(function () {
    var st = readState_();
    stateWrite_(st, {
      last_backup_at: ['DATETIME', manifest.created_at], last_backup_ref: ['STRING', stamp], last_backup_status: ['ENUM', manifest.status]
    }, SYSTEM_USER);
  });
  cache_().remove('sys:state');
  if (manifest.status === 'INCONSISTENT' && !isRetry) {
    setProp_('BACKUP_RETRY_PENDING', 'true');
    scheduleBackupOnce_(15 * 60000);
  }
  var trashed = pruneBackups_();
  log_('backupData: ' + stamp + ' → ' + manifest.status + (trashed ? '; đã chuyển ' + trashed + ' bản cũ vào thùng rác' : '') + '.');
  return manifest;
}

/** Giữ backup_keep_count bản VERIFIED mới nhất; thư mục cũ hơn bản giữ cuối cùng vào thùng rác (chỉ trong Backups) */
function pruneBackups_() {
  var keep = Number(setting_('backup_keep_count') || 8);
  var list = listBackups_();
  var verified = list.filter(function (b) { return b.manifest && b.manifest.status === 'VERIFIED'; });
  if (verified.length <= keep) return 0;
  var cut = verified[keep - 1].name;
  var n = 0;
  list.forEach(function (b) {
    if (b.name >= cut) return;
    var it = b.folder.getFiles();
    while (it.hasNext()) it.next().setTrashed(true);
    b.folder.setTrashed(true);
    n++;
  });
  return n;
}

/* ---------------- Action ---------------- */

/** backup.view: danh sách bản, trạng thái kiểm chứng, lần gần nhất, đang chờ chạy (C4) */
/** Bản sao lưu mất bao lâu tối đa (thời hạn trigger 6 phút + dư) trước khi coi thư mục không manifest là thất bại */
var BACKUP_RUNNING_MS_ = 30 * 60000;

/** Thư mục chưa có manifest.json: đang chạy nếu tạo chưa quá 30 phút, quá thì thất bại (trigger bị dừng giữa chừng) */
function backupRunningRef_(b, nowMs) {
  if (b.manifest) return false;
  var n = b.name;
  var t = Date.parse(n.slice(0, 10) + 'T' + n.slice(11, 13) + ':' + n.slice(13, 15) + ':00+07:00');
  return !isNaN(t) && nowMs - t < BACKUP_RUNNING_MS_;
}

function backupView_(ctx) {
  var st = readState_();
  var nowMs = now_().getTime();
  var running = false;
  var items = listBackups_().slice(0, 30).map(function (b) {
    var m = b.manifest || {};
    var total = 0;
    Object.keys(m.counts || {}).forEach(function (k) { if (!BACKUP_VOLATILE_[k]) total += m.counts[k]; });
    var isRunning = backupRunningRef_(b, nowMs);
    if (isRunning) running = true;
    return {
      ref: b.name, created_at: m.created_at || '', finished_at: m.finished_at || '', status: isRunning ? 'RUNNING' : (m.status || 'FAILED'), consistent: !!m.consistent,
      schema_version: m.schema_version || '', rows: total, documents: m.documents || 0, retry: !!m.retry,
      error: m.error || (b.manifest || isRunning ? '' : 'NO_MANIFEST'), mismatch: m.mismatch || []
    };
  });
  return {
    items: items, queued: oneShotIds_().length > 0, running: running,
    last_backup_at: stateGet_(st, 'last_backup_at', ''), last_backup_ref: stateGet_(st, 'last_backup_ref', ''), last_backup_status: stateGet_(st, 'last_backup_status', ''),
    last_restore_at: stateGet_(st, 'last_restore_at', ''), restored_from_ref: stateGet_(st, 'restored_from_ref', ''),
    backup_weekday: setting_('backup_weekday'), backup_hour: setting_('backup_hour'), keep_count: setting_('backup_keep_count')
  };
}

/** backup.run: tạo trigger chạy một lần cho backupData, trả QUEUED (C4, PIN) */
function backupRun_(ctx) {
  if (oneShotIds_().length) return { status: 'QUEUED', already: true };
  var nowMs = now_().getTime();
  if (listBackups_().some(function (b) { return backupRunningRef_(b, nowMs); })) return { status: 'QUEUED', already: true };
  withWriteLock_(function () {
    scheduleBackupOnce_(1000);
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'backup.run', entity_type: 'BACKUP', entity_id: '',
      before_json: null, after_json: { status: 'QUEUED' }, operation_id: ctx.req.operation_id || '', auth_basis: 'ROLE_LEVEL' });
  });
  return { status: 'QUEUED', already: false };
}

/* ---------------- Khôi phục thủ công (6.5.4 bước 6) ---------------- */

/** Thao tác dở (PREPARED) của bản khôi phục: áp lại theo intent; không có intent thì đánh dấu cần xử lý */
function recoverOperations_() {
  var n = 0;
  readRows_('Operations').forEach(function (op) {
    if (op.state !== 'PREPARED') return;
    var intent = op.intent_json;
    if (intent && intent.writes) {
      applyWrites_(intent.writes, true);
      writeCells_('Operations', op.__row, { state: 'COMMITTED', result_code: 'OK', committed_at: isoVN_(now_()), result_json: JSON.stringify(intent.result || null) });
    } else {
      writeCells_('Operations', op.__row, { state: 'FAILED', result_code: 'RECOVERY_REQUIRED' });
    }
    n++;
  });
  return n;
}

/** Số lớn nhất của mã hiển thị theo tiền tố trong dữ liệu (để bộ đếm không cấp trùng) */
function maxCodeSeqs_() {
  var out = {};
  Object.keys(CODE_PATTERNS).forEach(function (t) {
    var et = ENTITY_TYPES[t], pat = CODE_PATTERNS[t];
    if (!et || !et.code) return;
    var re = pat.yymm ? new RegExp('^' + pat.prefix + '-(\\d{4})-(\\d+)$') : new RegExp('^' + pat.prefix + '-(\\d+)$');
    readRows_(et.sheet).forEach(function (r) {
      var m = re.exec(String(r[et.code] || ''));
      if (!m) return;
      var key = 'code_seq.' + pat.prefix + (pat.yymm ? '.' + m[1] : '');
      var v = Number(pat.yymm ? m[2] : m[1]);
      if (!(out[key] >= v)) out[key] = v;
    });
  });
  return out;
}

/**
 * Bước cuối của khôi phục thủ công. Chạy từ trình soạn (tài khoản M&E), khi đang bảo trì,
 * sau khi đặt RESTORE_SOURCE_ID = ID bản sao file Nghiệp vụ. Chạy lại nhiều lần không sai; lỗi thì dừng.
 */
function adminFinalizeManualRestore() {
  var srcId = prop_('RESTORE_SOURCE_ID');
  if (!srcId) throw new Error('Chưa đặt RESTORE_SOURCE_ID (ID bản sao file Nghiệp vụ cần khôi phục).');
  if (prop_('MAINTENANCE_MODE') !== 'true') throw new Error('Phải bật bảo trì trước: chạy adminMaintenanceOn.');
  var curId = prop_('BUSINESS_SPREADSHEET_ID');
  var switched = curId === srcId;
  var prevId = switched ? prop_('PREVIOUS_BUSINESS_SPREADSHEET_ID') : curId;
  if (!prevId) throw new Error('Không xác định được file Nghiệp vụ đang chạy trước khôi phục.');
  var src = SpreadsheetApp.openById(srcId);
  // 1. Kiểm schema: đủ sheet Nghiệp vụ của đợt hiện hành và cột khóa
  var missing = [];
  sheetsForDot_(RELEASED_DOT).forEach(function (name) {
    var s = sheetSchema_(name);
    if (s.book !== 'B') return;
    var sh = src.getSheetByName(name);
    if (!sh) { missing.push(name); return; }
    var hdr = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    if (hdr.indexOf(s.key) < 0) missing.push(name + '.' + s.key);
  });
  if (missing.length) throw new Error('File nguồn thiếu sheet/cột: ' + missing.join(', ') + '. Dừng — hỏi người code.');
  // 2. Đối chiếu số dòng với manifest (bỏ NotificationLogs và sheet ghi không qua sync_revision)
  var srcCounts = countRows_(src, {});
  var srcState = {};
  src.getSheetByName('SystemState').getDataRange().getValues().slice(1).forEach(function (r) { srcState[r[0]] = r[1]; });
  var match = null;
  var backups = listBackups_();
  // Chạy lại sau khi đã đổi file: dùng đúng bản đã ghi ở lần trước
  if (switched && srcState.restored_from_ref) match = backups.filter(function (b) { return b.name === srcState.restored_from_ref && b.manifest; })[0] || null;
  backups.forEach(function (b) {
    if (match || !b.manifest || b.manifest.status !== 'VERIFIED') return;
    var m = b.manifest;
    if (String(m.schema_version) !== String(srcState.schema_version || m.schema_version)) return;
    var ok = Object.keys(srcCounts).every(function (k) {
      if (k === 'NotificationLogs' || BACKUP_VOLATILE_[k] || k === 'SystemState') return true;
      return m.counts[k] === srcCounts[k];
    });
    if (ok) match = b;
  });
  if (!match) throw new Error('Không tìm thấy bản sao lưu VERIFIED khớp số dòng với file nguồn. Dừng — hỏi người code.');
  var schemaNow = SCHEMA_VERSION;
  if (String(match.manifest.schema_version) !== String(schemaNow)) throw new Error('schema_version của bản sao (' + match.manifest.schema_version + ') khác bản đang chạy (' + schemaNow + ').');
  // 3. Đọc trạng thái và NotificationLogs của bản đang chạy trước khôi phục
  var prev = SpreadsheetApp.openById(prevId);
  var prevState = {};
  prev.getSheetByName('SystemState').getDataRange().getValues().slice(1).forEach(function (r) { prevState[r[0]] = r; });
  var prevLogsSheet = prev.getSheetByName('NotificationLogs');
  var prevLogs = prevLogsSheet.getDataRange().getValues();
  // 4. Đổi file Nghiệp vụ, epoch mới
  if (!switched) {
    setProp_('PREVIOUS_BUSINESS_SPREADSHEET_ID', curId);
    setProp_('BUSINESS_SPREADSHEET_ID', srcId);
  }
  setProp_('DATASET_EPOCH', uuid_());
  cache_().remove('sys:props');
  cache_().remove('sys:state');
  dbReset_();
  var actor = 'ADMIN_RESTORE';
  withWriteLock_(function () {
    // 5. Thu hồi mọi phiên
    var t = now_().getTime();
    readRows_('Sessions').forEach(function (s) { if (isSessionActive_(s, t)) revokeSessionRow_(s, 'DATASET_RESET'); });
    // 6. NotificationLogs: chép từ bản đang chạy; QUEUED → SKIPPED, SENDING → UNKNOWN
    var dst = sh_('NotificationLogs');
    var hdr = prevLogs[0].map(String);
    if (dst.getLastRow() > 1) dst.deleteRows(2, dst.getLastRow() - 1);
    var rows = prevLogs.slice(1).filter(function (r) { return r.some(function (v) { return v !== ''; }); }).map(function (r) {
      var o = {};
      hdr.forEach(function (h, i) { o[h] = r[i] instanceof Date ? isoVN_(r[i]) : r[i]; });
      if (o.status === 'QUEUED') { o.status = 'SKIPPED'; o.error_code = 'CANCELLED_BY_RESTORE'; }
      else if (o.status === 'SENDING') o.status = 'UNKNOWN';
      return o;
    });
    DB_.sheets = {}; DB_.headers = {};
    if (rows.length) insertRows_('NotificationLogs', rows);
    // 7. SystemState: bộ đếm mã, perm_version, giữ khóa vận hành của bản đang chạy, ghi dấu khôi phục
    var st = readState_();
    var su = {};
    var seqs = maxCodeSeqs_();
    Object.keys(prevState).forEach(function (k) {
      if (k.indexOf('code_seq.') === 0) seqs[k] = Math.max(Number(seqs[k] || 0), Number(prevState[k][1] || 0));
    });
    Object.keys(st.map).forEach(function (k) {
      if (k.indexOf('code_seq.') === 0) seqs[k] = Math.max(Number(seqs[k] || 0), Number(st.map[k] || 0));
    });
    Object.keys(seqs).forEach(function (k) { su[k] = ['INT', seqs[k]]; });
    var pv = Math.max(Number(stateGet_(st, 'perm_version', 1)), Number(prevState.perm_version ? prevState.perm_version[1] : 1));
    su.perm_version = ['INT', pv + 1];
    var sr = Math.max(Number(stateGet_(st, 'sync_revision', 0)), Number(prevState.sync_revision ? prevState.sync_revision[1] : 0));
    su.sync_revision = ['INT', sr + 1];
    ['last_backup_at', 'last_backup_ref', 'last_backup_status', 'login_paused_until', 'mt_paused_until'].forEach(function (k) {
      if (prevState[k]) su[k] = [prevState[k][2] || 'STRING', prevState[k][1] instanceof Date ? isoVN_(prevState[k][1]) : prevState[k][1]];
    });
    su.dataset_epoch = ['STRING', prop_('DATASET_EPOCH')];
    su.last_restore_at = ['DATETIME', isoVN_(now_())];
    su.restored_from_ref = ['STRING', match.name];
    su.restored_backup_at = ['DATETIME', match.manifest.created_at || ''];
    su.restored_by = ['STRING', actor];
    stateWrite_(st, su, actor);
    // 8. Lô nhập dở → FAILED; thao tác PREPARED → áp lại
    readRows_('ImportBatches').forEach(function (b) {
      if (b.status !== 'COMMITTED' && b.status !== 'FAILED') writeCells_('ImportBatches', b.__row, { status: 'FAILED', updated_at: isoVN_(now_()) });
    });
    recoverOperations_();
    // 9. Người nhận gắn tài khoản không còn → ngừng
    var users = {};
    readRows_('Users').forEach(function (u) { users[u.user_id] = true; });
    readRows_('NotificationRecipients').forEach(function (r) {
      if (r.user_id && !users[r.user_id] && r.active !== false) writeCells_('NotificationRecipients', r.__row, { active: false });
    });
  });
  // 10. Tính lại Alerts; kiểm QrRegistry; đếm tài liệu hỏng
  dbReset_();
  refreshAlerts_();
  var qrBad = 0;
  readRows_('QrRegistry').forEach(function (q) {
    var et = ENTITY_TYPES[q.entity_type];
    if (et && !findRowNums_(et.sheet, et.key, q.entity_id).length) qrBad++;
  });
  var docBad = 0;
  readRows_('Documents').forEach(function (d) {
    if (!d.active || !d.drive_file_id) return;
    try { DriveApp.getFileById(d.drive_file_id); } catch (e) { docBad++; }
  });
  withWriteLock_(function () {
    writeAudit_({ user_id: 'ADMIN_RESTORE', action: 'system.manualRestore', entity_type: 'SYSTEM', entity_id: match.name,
      before_json: { business_spreadsheet: prevId }, after_json: { business_spreadsheet: srcId, backup: match.name, qr_missing: qrBad, documents_missing: docBad },
      operation_id: '', auth_basis: 'SYSTEM' });
  });
  delProp_('RESTORE_SOURCE_ID');
  cache_().remove('sys:state');
  clearSysCaches_();
  log_('Khôi phục xong từ bản ' + match.name + '. QR trỏ hồ sơ không còn: ' + qrBad + '; tài liệu không mở được: ' + docBad +
    '. Kiểm tra theo bước 7 rồi chạy adminMaintenanceOff. Bảo trì vẫn đang BẬT.');
}

// ===== 24_system.js =====
/* 24_system: nhật ký thao tác, cấu hình, bảng quyền, trạng thái hệ thống — phụ lục 1.5 mục 4.4.16, 4.8, 3.14, 5.2 (Trạng thái hệ thống).
 * system.status (C4) là bổ sung kỹ thuật: màn Trạng thái hệ thống chỉ đọc kết quả healthCheck và danh sách Settings. */

/* ---------------- Nhật ký thao tác ---------------- */

/** Module của một dòng AuditLogs theo action (để lọc quyền xem) */
function auditModule_(a) {
  var act = String(a.action || '');
  var pre = act.split('.')[0];
  var map = {
    equipment: 'equipment', part: 'equipment', material: 'warehouse', contract: 'contracts', inspection: 'inspections',
    notify: 'notifications', location: 'catalog', vendor: 'catalog', lookup: 'catalog', glossary: 'catalog',
    user: 'users', auth: 'users', session: 'users', pin: 'users', settings: 'system', permission: 'system', system: 'system', backup: 'system'
  };
  if (map[pre]) return map[pre];
  if (pre === 'alert') return a.entity_type === 'CONTRACT' ? 'contracts' : 'inspections';
  if (pre === 'doc' || pre === 'qr' || pre === 'i18n' || pre === 'import' || pre === 'export') {
    var et = ENTITY_TYPES[a.entity_type];
    if (et && et.module) return et.module;
    var sh = SHEETS[a.entity_type];
    if (sh) {
      var e2 = Object.keys(ENTITY_TYPES).filter(function (k) { return ENTITY_TYPES[k].sheet === a.entity_type; })[0];
      return e2 ? ENTITY_TYPES[e2].module : 'catalog';
    }
    return 'catalog';
  }
  return 'system';
}

/** Bỏ trường giá khỏi before/after khi người xem không có quyền giá của module */
function stripCost_(o) {
  if (!o || typeof o !== 'object') return o;
  var out = Array.isArray(o) ? [] : {};
  Object.keys(o).forEach(function (k) {
    if (['value', 'price', 'cost', 'currency', 'unit_price', 'amount'].indexOf(k) >= 0) return;
    out[k] = typeof o[k] === 'object' ? stripCost_(o[k]) : o[k];
  });
  return out;
}

function projectAudit_(ctx, a, costMods, dir) {
  var mod = auditModule_(a);
  var o = {
    audit_id: a.audit_id, occurred_at: a.occurred_at, user_id: a.user_id, action: a.action, entity_type: a.entity_type, entity_id: a.entity_id,
    before_json: a.before_json || null, after_json: a.after_json || null, reason: a.reason || '', operation_id: a.operation_id || '',
    auth_basis: a.auth_basis || '', module: mod
  };
  if (!costMods[mod]) { o.before_json = stripCost_(o.before_json); o.after_json = stripCost_(o.after_json); }
  var u = dir[a.user_id];
  o.user_name = u ? u.employee_code + ' · ' + u.display_name : a.user_id;
  return o;
}

/** audit.own: nhật ký thao tác và trạng thái đồng bộ (Operations) của chính mình */
function auditOwn_(ctx) {
  var uid = ctx.user.user_id;
  var costMods = {};
  BUSINESS_MODULES_.forEach(function (m) { costMods[m] = canViewCost_(ctx, m); });
  var dir = userDirectory_();
  var logs = findAll_('AuditLogs', 'user_id', uid).sort(function (a, b) { return String(b.occurred_at).localeCompare(String(a.occurred_at)); })
    .slice(0, 200).map(function (a) { return projectAudit_(ctx, a, costMods, dir); });
  var ops = findAll_('Operations', 'user_id', uid).sort(function (a, b) { return String(b.received_at).localeCompare(String(a.received_at)); })
    .slice(0, 100).map(function (o) {
      return { operation_id: o.operation_id, action: o.action, entity_type: o.entity_type, entity_id: o.entity_id, state: o.state, result_code: o.result_code, received_at: o.received_at, committed_at: o.committed_at };
    });
  return { items: logs, operations: ops };
}

/**
 * audit.view {module?, entity_id?, user_id?, action?, from?, to?, limit?}: C3, C4.
 * C3 không xem module users/system và nhật ký xác thực; giá ẩn khi thiếu quyền giá.
 */
function auditView_(ctx) {
  var p = ctx.req.payload || {};
  var lvl = Number(ctx.user.role_level);
  var costMods = {};
  BUSINESS_MODULES_.forEach(function (m) { costMods[m] = canViewCost_(ctx, m); });
  var dir = userDirectory_();
  var limit = Math.min(500, Number(p.limit) || 200);
  var from = p.from && isDateStr_(p.from) ? p.from : '', to = p.to && isDateStr_(p.to) ? p.to : '';
  var items = [];
  var rows = readRows_('AuditLogs');
  for (var i = rows.length - 1; i >= 0 && items.length < limit; i--) {
    var a = rows[i];
    var mod = auditModule_(a);
    if (lvl < 4 && (mod === 'users' || mod === 'system')) continue;
    if (p.module && mod !== p.module) continue;
    if (p.entity_id && a.entity_id !== p.entity_id) continue;
    if (p.user_id && a.user_id !== p.user_id) continue;
    if (p.action && String(a.action).indexOf(p.action) !== 0) continue;
    var day = String(a.occurred_at).slice(0, 10);
    if (from && day < from) continue;
    if (to && day > to) continue;
    items.push(projectAudit_(ctx, a, costMods, dir));
  }
  items.sort(function (x, y) { return String(y.occurred_at).localeCompare(String(x.occurred_at)); });
  return { items: items, more: items.length >= limit };
}

/** audit.auth (C4, PIN): nhật ký đăng nhập, phiên đang hiệu lực; không có token_hash, mã băm nhân viên */
function auditAuth_(ctx) {
  var dir = userDirectory_();
  var name = function (id) { var u = dir[id]; return u ? u.employee_code + ' · ' + u.display_name : ''; };
  var att = readRows_('AuthAttempts');
  var attempts = att.slice(Math.max(0, att.length - 300)).reverse().map(function (r) {
    return { occurred_at: r.occurred_at, outcome: r.outcome, attempt_kind: r.attempt_kind, user: r.user_id ? name(r.user_id) : '', device: String(r.device_id || '').slice(0, 8) };
  });
  var t = now_().getTime();
  var sessions = readRows_('Sessions').filter(function (s) { return isSessionActive_(s, t); }).map(function (s) {
    return { session_id: s.session_id, user: name(s.user_id), session_kind: s.session_kind, device_label: s.device_label, issued_at: s.issued_at, last_seen_at: s.last_seen_at, expires_at: s.expires_at };
  }).sort(function (a, b) { return String(b.last_seen_at).localeCompare(String(a.last_seen_at)); });
  return { attempts: attempts, sessions: sessions, login_paused_until: sysStateCached_().login_paused_until || '' };
}

/* ---------------- Cấu hình ---------------- */

/** Khóa không sửa trong app: mốc A7 cố định, kho làm sau, khóa của đợt sau */
var SETTINGS_READONLY_ = { email_stages: 1, overdue_repeat_days: 1, lead_days: 1, warehouse_connected: 1 };
var SETTINGS_BOUNDS_ = {
  session_days: [1, 90], session_warn_days: [0, 30], change_pin_session_minutes: [5, 60], reauth_window_minutes: [1, 30], temp_pin_hours: [1, 168],
  max_sessions_per_user: [1, 50], login_fail_limit: [3, 20], login_fail_window_minutes: [1, 120], login_lock_minutes: [1, 1440],
  login_global_fail_limit: [5, 1000], login_global_window_minutes: [1, 120], login_global_pause_minutes: [1, 1440], auth_attempts_retention_days: [7, 3650],
  offline_unlock_attempts: [3, 20], offline_lock_minutes: [1, 1440], offline_max_lockouts: [1, 10], offline_pbkdf2_iterations: [150000, 2000000],
  offline_probe_seconds: [3, 30], mt_chunk_chars: [200, 5000], mt_max_fields_per_request: [1, 100], mt_sync_budget_seconds: [1, 20], mt_daily_budget: [0, 100000],
  email_hour: [0, 23], email_max_attempts: [1, 10], client_timeout_seconds: [10, 60], client_long_timeout_seconds: [20, 300], list_page_size: [10, 200],
  sync_page_size: [100, 2000], doc_max_bytes: [1048576, 52428800], doc_mobile_upload_max_bytes: [1048576, 52428800], offline_files_max_mb: [10, 2000],
  photo_max_edge_px: [640, 4096], photo_jpeg_quality: [0.5, 0.95], photo_thumb_edge_px: [120, 1024], backup_hour: [0, 23], backup_keep_count: [2, 52],
  meter_boundary_window_hours: [1, 24], reading_self_edit_hours: [1, 168]
};
var SETTINGS_ENUMS_ = {
  backup_weekday: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
  qr_label_size: ['SMALL_70X37', 'LARGE_105X74']
};

function settingsList_() {
  var s = settings_();
  return SETTINGS_DEFAULTS.filter(function (d) { return d[4] <= RELEASED_DOT; }).map(function (d) {
    return {
      key: d[0], type: d[1], value: s[d[0]], default_value: d[2], client: !!d[3], description_vi: d[5], description_zh: d[6],
      readonly: !!SETTINGS_READONLY_[d[0]], bounds: SETTINGS_BOUNDS_[d[0]] || null, options: SETTINGS_ENUMS_[d[0]] || null
    };
  });
}

/** Chuẩn hóa và kiểm một giá trị Settings; ném VALIDATION_ERROR */
function parseSettingInput_(def, v) {
  var key = def[0], type = def[1];
  var bad = function () { return validationError_([fieldError_(key, 'INVALID_VALUE')]); };
  if (type === 'INT' || type === 'NUMBER') {
    var n = Number(v);
    if (v === '' || v === null || !isFinite(n) || (type === 'INT' && Math.floor(n) !== n)) throw bad();
    var b = SETTINGS_BOUNDS_[key];
    if (b && (n < b[0] || n > b[1])) throw bad();
    return n;
  }
  if (type === 'BOOL') { if (typeof v !== 'boolean') throw bad(); return v; }
  if (type === 'ENUM') { if ((SETTINGS_ENUMS_[key] || []).indexOf(v) < 0) throw bad(); return v; }
  if (type === 'JSON') {
    var arr = typeof v === 'string' ? JSON.parse(v) : v;
    if (!Array.isArray(arr)) throw bad();
    if (key === 'self_approval_exceptions') {
      arr.forEach(function (e) {
        var def2 = e && ACTION_REGISTRY[e.action_code];
        if (!def2 || def2.flags.indexOf('A') < 0) throw bad();
      });
    }
    return arr;
  }
  var s = trimStr_(v);
  if (key === 'app_base_url' && s && !/^https:\/\/[^\s]+\/$/.test(s)) throw bad();
  if (key === 'min_client_version' && !/^\d+\.\d+\.\d+$/.test(s)) throw bad();
  if (key === 'default_currency' && !/^[A-Z]{3}$/.test(s)) throw bad();
  if (s.length > 500) throw bad();
  return s;
}

/** settings.edit {changes: {key: value}, reason} — C4, PIN. Khóa chỉ đọc không sửa được */
function settingsEdit_(ctx) {
  var p = ctx.req.payload || {};
  var changes = p.changes && typeof p.changes === 'object' ? p.changes : null;
  if (!changes || !Object.keys(changes).length) throw validationError_([fieldError_('changes', 'REQUIRED')]);
  var parsed = {};
  var errs = [];
  Object.keys(changes).forEach(function (k) {
    var def = SETTINGS_DEFAULTS.filter(function (d) { return d[0] === k; })[0];
    if (!def || def[4] > RELEASED_DOT || SETTINGS_READONLY_[k]) { errs.push(fieldError_(k, 'INVALID_VALUE')); return; }
    try { parsed[k] = parseSettingInput_(def, changes[k]); } catch (e) { errs.push(fieldError_(k, 'INVALID_VALUE')); }
  });
  if (parsed.client_long_timeout_seconds !== undefined || parsed.client_timeout_seconds !== undefined) {
    var shortT = parsed.client_timeout_seconds !== undefined ? parsed.client_timeout_seconds : setting_('client_timeout_seconds');
    var longT = parsed.client_long_timeout_seconds !== undefined ? parsed.client_long_timeout_seconds : setting_('client_long_timeout_seconds');
    if (longT < shortT) errs.push(fieldError_('client_long_timeout_seconds', 'INVALID_VALUE'));
  }
  if (errs.length) throw validationError_(errs);
  var before = {};
  Object.keys(parsed).forEach(function (k) { before[k] = setting_(k); });
  withWriteLock_(function () {
    Object.keys(parsed).forEach(function (k) { writeSetting_(k, parsed[k], ctx.user.user_id); });
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'settings.edit', entity_type: 'SETTINGS', entity_id: Object.keys(parsed).join(','),
      before_json: before, after_json: parsed, operation_id: ctx.req.operation_id || '', reason: trimStr_(p.reason).slice(0, 300), auth_basis: 'ROLE_LEVEL' });
  });
  cache_().remove('cfg:settings');
  DB_.settings = null;
  if (['email_hour', 'backup_weekday', 'backup_hour'].some(function (k) { return parsed[k] !== undefined && parsed[k] !== before[k]; })) {
    try { installTriggers(); } catch (e) { console.warn('installTriggers ' + (e && e.message)); }
  }
  return { settings: settingsList_() };
}

/* ---------------- Bảng quyền (4.8) ---------------- */

/** Ô khóa: không sửa được trong app */
function permLocked_(level, module) {
  if (level === 4 && module === 'users') return 'VCEA';
  if (level === 4 && module === 'system') return 'VER';
  if (level === 4 && module === 'audit') return 'V';
  if (level === 4 && module === 'backup') return 'VE';
  return 'R';
}

function permissionMatrix_() {
  var rows = readRows_('RolePermissions');
  var out = [];
  [1, 2, 3, 4].forEach(function (lvl) {
    PERM_MODULES.forEach(function (m) {
      var r = rows.filter(function (x) { return Number(x.role_level) === lvl && x.module === m; })[0];
      var flags = '';
      if (r) Object.keys(FLAG_COL_).forEach(function (k) { if (r[FLAG_COL_[k]]) flags += k; });
      var ceil = roleCeiling_(lvl, m);
      out.push({ role_level: lvl, module: m, flags: flags, ceiling: ceil, locked: permLocked_(lvl, m), missing: !r,
        over_ceiling: flags.split('').filter(function (f) { return ceil.indexOf(f) < 0; }).join('') });
    });
  });
  return out;
}

/** permission.view (C4, PIN): ma trận 60 ô, trần, ô khóa */
function permissionView_(ctx) {
  return { rows: permissionMatrix_(), perm_version: sysStateCached_().perm_version || 1, flags: Object.keys(FLAG_COL_) };
}

/**
 * permission.edit {changes: [{role_level, module, flags}], reason} — C4, PIN, bắt nhập lý do.
 * Kiểm trần, không đổi ô khóa; ghi trước–sau; perm_version + 1 (có hiệu lực ở request kế tiếp).
 */
function permissionEdit_(ctx) {
  var p = ctx.req.payload || {};
  var reason = trimStr_(p.reason);
  var errs = [];
  if (!reason) errs.push(fieldError_('reason', 'REQUIRED'));
  var changes = Array.isArray(p.changes) ? p.changes : [];
  if (!changes.length) errs.push(fieldError_('changes', 'REQUIRED'));
  changes.forEach(function (c, i) {
    var lvl = Number(c.role_level);
    var f = String(c.flags || '');
    if (!(lvl >= 1 && lvl <= 4) || PERM_MODULES.indexOf(c.module) < 0 || !/^[VCEAIX$R]*$/.test(f)) { errs.push(fieldError_('changes', 'INVALID_VALUE', i)); return; }
    var ceil = roleCeiling_(lvl, c.module);
    if (f.split('').some(function (x) { return ceil.indexOf(x) < 0; })) errs.push(fieldError_('changes', 'PERM_CEILING', i));
  });
  if (errs.length) throw validationError_(errs);
  var before = [], after = [];
  withWriteLock_(function () {
    var rows = readRows_('RolePermissions');
    changes.forEach(function (c, i) {
      var lvl = Number(c.role_level);
      var r = rows.filter(function (x) { return Number(x.role_level) === lvl && x.module === c.module; })[0];
      if (!r) throw validationError_([fieldError_('changes', 'NOT_FOUND', i)]);
      var cur = '';
      Object.keys(FLAG_COL_).forEach(function (k) { if (r[FLAG_COL_[k]]) cur += k; });
      var want = String(c.flags || '');
      var locked = permLocked_(lvl, c.module);
      // Ô khóa giữ nguyên giá trị đang có
      var diffLocked = locked.split('').some(function (k) { return (cur.indexOf(k) >= 0) !== (want.indexOf(k) >= 0); });
      if (diffLocked) throw validationError_([fieldError_('changes', 'PERM_LOCKED', i)]);
      if (cur === want) return;
      var upd = { updated_at: isoVN_(now_()), updated_by: ctx.user.user_id };
      Object.keys(FLAG_COL_).forEach(function (k) { upd[FLAG_COL_[k]] = want.indexOf(k) >= 0; });
      writeCells_('RolePermissions', r.__row, upd);
      before.push({ role_level: lvl, module: c.module, flags: cur });
      after.push({ role_level: lvl, module: c.module, flags: want });
    });
    if (!after.length) return;
    var st = readState_();
    var pv = Number(stateGet_(st, 'perm_version', 1)) + 1;
    stateWrite_(st, { perm_version: ['INT', pv] }, ctx.user.user_id);
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'permission.edit', entity_type: 'PERMISSIONS', entity_id: 'RolePermissions',
      before_json: before, after_json: after, operation_id: ctx.req.operation_id || '', reason: reason.slice(0, 300), auth_basis: 'ROLE_LEVEL' });
  });
  SpreadsheetApp.flush();
  cache_().remove('sys:state');
  DB_.rolePerms = null;
  return { changed: after.length, rows: permissionMatrix_(), perm_version: sysStateCached_().perm_version };
}

/* ---------------- Trạng thái hệ thống (healthCheck) ---------------- */

/** Ghi thời gian chạy trigger (24 giờ gần nhất) để healthCheck báo tổng phút */
function recordTriggerRun_(fn, startMs) {
  try {
    var now = Date.now();
    var list = JSON.parse(prop_('TRIGGER_RUNS') || '[]').filter(function (r) { return now - r.s < 86400000; });
    list.push({ f: fn, s: startMs, ms: now - startMs });
    setProp_('TRIGGER_RUNS', JSON.stringify(list.slice(-60)));
  } catch (e) { /* không chặn trigger */ }
}

/** Kết quả kiểm tra: [{key, ok: 'OK'|'WARN', value, note}] */
function healthRows_() {
  var rows = [];
  var add = function (key, ok, value, note) { rows.push({ key: key, status: ok ? 'OK' : 'WARN', value: value === undefined ? '' : value, note: note || '' }); };
  dbReset_();
  var st = readState_();
  var props = sysProps_();
  add('schema_version', String(stateGet_(st, 'schema_version', '')) === SCHEMA_VERSION, stateGet_(st, 'schema_version', ''), SCHEMA_VERSION);
  add('server_version', true, SERVER_VERSION);
  add('dataset_epoch', !!props.dataset_epoch, String(props.dataset_epoch || '').slice(0, 8));
  add('env', true, envName_());
  add('maintenance', !props.maintenance_mode, props.maintenance_mode ? 'ON' : 'OFF');
  var trig = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var missing = TRIGGER_FUNCS_.filter(function (f) { return trig.indexOf(f) < 0; });
  add('triggers', !missing.length, trig.join(', '), missing.length ? 'Thiếu: ' + missing.join(', ') + ' — chạy installTriggers' : '');
  var runs = [];
  try { runs = JSON.parse(prop_('TRIGGER_RUNS') || '[]'); } catch (e) { runs = []; }
  var minutes = Math.round(runs.filter(function (r) { return Date.now() - r.s < 86400000; }).reduce(function (s, r) { return s + r.ms; }, 0) / 600) / 100;
  add('trigger_minutes_24h', minutes < 90, minutes);
  var lb = stateGet_(st, 'last_backup_at', ''), lbs = stateGet_(st, 'last_backup_status', '');
  var lbt = parseTime_(lb);
  add('last_backup', lbs === 'VERIFIED' && lbt && now_().getTime() - lbt.getTime() < 8 * 86400000, (lb ? lb.slice(0, 16).replace('T', ' ') : '') + (lbs ? ' · ' + lbs : ''), stateGet_(st, 'last_backup_ref', ''));
  var mtp = parseTime_(stateGet_(st, 'mt_paused_until', ''));
  add('mt_paused_until', !(mtp && mtp.getTime() > now_().getTime()), stateGet_(st, 'mt_paused_until', ''));
  var lpu = parseTime_(stateGet_(st, 'login_paused_until', ''));
  add('login_paused_until', !(lpu && lpu.getTime() > now_().getTime()), stateGet_(st, 'login_paused_until', ''));
  var quota = MailApp.getRemainingDailyQuota();
  add('mail_quota', quota > 10, quota);
  var lastSent = '';
  readRows_('NotificationLogs').forEach(function (n) { if (n.status === 'SENT' && String(n.sent_at) > lastSent) lastSent = String(n.sent_at); });
  add('last_mail_sent', true, lastSent ? lastSent.slice(0, 16).replace('T', ' ') : '', setting_('gmail_enabled') ? 'Gmail ON' : 'Gmail OFF');
  var base = String(setting_('app_base_url') || '');
  add('app_base_url', !!base, base, base ? '' : 'Chưa điền app_base_url (link trong email)');
  var over = permissionMatrix_().filter(function (r) { return r.over_ceiling || r.missing; });
  add('permissions_ceiling', !over.length, over.length, over.map(function (r) { return r.role_level + '|' + r.module; }).join(', '));
  var docBad = 0, checked = 0;
  readRows_('Documents').forEach(function (d) {
    if (!d.active || !d.drive_file_id || checked >= 300) return;
    checked++;
    try { DriveApp.getFileById(d.drive_file_id); } catch (e) { docBad++; }
  });
  add('documents_broken', !docBad, docBad, checked >= 300 ? 'Đã kiểm 300 tệp đầu' : '');
  var cells = 0;
  [prop_('BUSINESS_SPREADSHEET_ID'), prop_('SECURITY_SPREADSHEET_ID')].forEach(function (id) {
    if (!id) return;
    SpreadsheetApp.openById(id).getSheets().forEach(function (s) { cells += s.getMaxRows() * s.getMaxColumns(); });
  });
  add('spreadsheet_cells', cells < 5000000, cells);
  return rows;
}

/** Chạy từ trình soạn: in kết quả kiểm tra */
function healthCheck() {
  var rows = healthRows_();
  rows.forEach(function (r) { log_((r.status === 'OK' ? 'ĐẠT     ' : 'CẢNH BÁO') + '  ' + r.key + ': ' + r.value + (r.note ? ' (' + r.note + ')' : '')); });
  return rows;
}

/** system.status (C4): kết quả healthCheck + Settings để màn Trạng thái hệ thống hiển thị */
function systemStatus_(ctx) {
  return { checks: healthRows_(), settings: settingsList_(), checked_at: isoVN_(now_()) };
}

// ===== 25_import.js =====
/* 25_import: Nhập/xuất Excel Đợt 1 — 1.4 §11; phụ lục 1.5 mục 6.5.1, 3.15 (Nhập Excel), 4.4.11, 3.8.
 * File đọc ở trình duyệt (SheetJS), gửi theo khúc; máy chủ kiểm, ghi ImportBatches/ImportRows.
 * Dòng 1 là khóa cột, dòng 2 nhãn Việt · 中文, dữ liệu từ dòng 3. ID trống = ADD, có ID + record_version = UPDATE.
 * Commit: từng dòng chạy như action riêng (kiểm quyền người commit), operation_id = import_row_id (chống ghi lặp),
 * không dịch máy lúc commit (PENDING, dịch nền sau). Lô nhạy cảm: người commit khác người nhập, có PIN. */

var IMPORT_TEMPLATE_VERSION_ = '1';
var IMPORT_CHUNK_MAX_ = 200;
var IMPORT_COMMIT_MAX_ = 100;
var IMPORT_COMMIT_BUDGET_MS_ = 40000;

/** Một cột: [khóa, kiểu, Việt, 中文, tùy chọn] — kiểu: id ver key code text int num date bool enum ref */
function ic_(key, type, vi, zh, o) { var c = o || {}; c.key = key; c.type = type; c.vi = vi; c.zh = zh; return c; }

var LOOKUP_GROUP_ENUM_ = ['EQUIPMENT_CATEGORY', 'UNIT', 'SPEC_KEY', 'CAUSE'];

var IMPORT_TEMPLATES_ = {
  glossary: { module: 'catalog', sheets: [{ name: 'glossary', table: 'Glossary', entity: 'GLOSSARY', id: 'glossary_id', cols: [
    ic_('glossary_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('term_vi', 'text', 'Thuật ngữ tiếng Việt', '越南语术语', { req: 1, max: 120 }),
    ic_('term_zh', 'text', 'Thuật ngữ tiếng Trung', '中文术语', { req: 1, max: 120 }), ic_('note', 'text', 'Ghi chú', '备注', { max: 300 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  locations: { module: 'catalog', sheets: [{ name: 'locations', table: 'Locations', entity: 'LOCATION', id: 'location_id', code: 'location_code', cols: [
    ic_('location_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('location_code', 'code', 'Mã khu vực (trống = tự cấp)', '区域编号（空=自动）'),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('type', 'enum', 'Loại khu vực', '区域类型', { options: LOCATION_TYPES_ }),
    ic_('parent_location_code', 'ref', 'Mã khu vực cha', '上级区域编号', { ref: 'Locations', to: 'parent_location_id', self: 1 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  lookups: { module: 'catalog', sheets: [{ name: 'lookups', table: 'LookupValues', entity: 'LOOKUP', id: 'value_id', cols: [
    ic_('value_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('group_key', 'enum', 'Nhóm', '分组', { req: 1, options: LOOKUP_GROUP_ENUM_, fixed: 1 }),
    ic_('code', 'text', 'Mã', '编码', { req: 1, max: 40, fixed: 1, keep: 1 }),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  vendors: { module: 'catalog', sheets: [{ name: 'vendors', table: 'Vendors', entity: 'VENDOR', id: 'vendor_id', code: 'vendor_code', cols: [
    ic_('vendor_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('vendor_code', 'code', 'Mã nhà cung cấp (trống = tự cấp)', '供应商编号（空=自动）'),
    ic_('name', 'text', 'Tên nhà cung cấp', '供应商名称', { req: 1, max: 200 }), ic_('contact_name', 'text', 'Người liên hệ', '联系人', { max: 120 }),
    ic_('phone', 'text', 'Điện thoại', '电话', { max: 40, keep: 1 }), ic_('email', 'text', 'Email', '邮箱', { max: 120 }), ic_('address', 'text', 'Địa chỉ', '地址', { max: 200 }),
    ic_('services_vi', 'text', 'Dịch vụ (Việt)', '服务内容（越）', { pair: 'services', opt: 1, max: 500 }), ic_('services_zh', 'text', 'Dịch vụ (Trung)', '服务内容（中）', { pair: 'services', opt: 1, max: 500 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  materials: { module: 'warehouse', sheets: [{ name: 'materials', table: 'Materials', entity: 'MATERIAL', id: 'material_id', code: 'material_code', cols: [
    ic_('material_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('material_code', 'code', 'Mã vật tư (trống = tự cấp)', '物料编号（空=自动）'),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('specification_vi', 'text', 'Quy cách (Việt)', '规格（越）', { pair: 'specification', opt: 1, max: 500 }), ic_('specification_zh', 'text', 'Quy cách (Trung)', '规格（中）', { pair: 'specification', opt: 1, max: 500 }),
    ic_('group_key', 'enum', 'Nhóm vật tư', '物料分组', { options: MATERIAL_GROUPS_ }), ic_('item_kind', 'enum', 'Loại', '类型', { options: ITEM_KINDS_ }),
    ic_('is_equipment_component', 'bool', 'Gắn máy được', '可关联设备'), ic_('part_number', 'text', 'Part number', '零件号', { max: 120, keep: 1 }),
    ic_('manufacturer', 'text', 'Hãng', '品牌', { max: 120 }), ic_('model', 'text', 'Model', '型号', { max: 120, keep: 1 }),
    ic_('base_unit', 'text', 'Đơn vị cơ sở', '基本单位', { req: 'add', max: 20 }), ic_('vendor_code', 'ref', 'Mã nhà cung cấp', '供应商编号', { ref: 'Vendors', to: 'vendor_id' }),
    ic_('lead_time_days', 'int', 'Thời gian đặt hàng (ngày)', '采购周期（天）'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  equipment: { module: 'equipment', sheets: [
    { name: 'equipment', table: 'Equipment', entity: 'EQUIPMENT', id: 'equipment_id', code: 'equipment_code', cols: [
      ic_('equipment_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('row_key', 'key', 'Khóa dòng (để sheet thông số tham chiếu thiết bị mới)', '行键（供参数表引用新设备）'),
      ic_('equipment_code', 'code', 'Mã thiết bị (trống = tự cấp)', '设备编号（空=自动）'),
      ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
      ic_('category_code', 'ref', 'Mã loại thiết bị', '设备类别编码', { ref: 'LookupValues', group: 'EQUIPMENT_CATEGORY', to: 'category_id' }),
      ic_('location_code', 'ref', 'Mã khu vực', '区域编号', { ref: 'Locations', to: 'location_id' }), ic_('vendor_code', 'ref', 'Mã nhà cung cấp', '供应商编号', { ref: 'Vendors', to: 'vendor_id' }),
      ic_('manufacturer', 'text', 'Hãng', '品牌', { max: 120 }), ic_('model', 'text', 'Model', '型号', { max: 120, keep: 1 }), ic_('serial', 'text', 'Số serial', '序列号', { max: 120, keep: 1 }),
      ic_('manufacture_year', 'int', 'Năm sản xuất', '生产年份'), ic_('install_date', 'date', 'Ngày lắp đặt', '安装日期'), ic_('warranty_end', 'date', 'Hết bảo hành', '保修到期'),
      ic_('status', 'enum', 'Tình trạng', '状态', { options: EQUIPMENT_STATUS_ }), ic_('criticality', 'enum', 'Mức quan trọng', '重要程度', { options: CRITICALITY_ }),
      ic_('owner_code', 'ref', 'Mã NV phụ trách', '负责人员工编号', { ref: 'Users', to: 'owner_user_id' }), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
    { name: 'equipment_specs', table: 'EquipmentSpecs', entity: 'EQUIPMENT_SPEC', id: 'spec_id', cols: [
      ic_('spec_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
      ic_('equipment_key', 'ref', 'Mã thiết bị hoặc khóa dòng', '设备编号或行键', { req: 1, ref: 'Equipment', to: 'equipment_id', fileSheet: 'equipment', fixed: 1 }),
      ic_('spec_key', 'text', 'Khóa thông số (vd electrical_power)', '参数键（如 electrical_power）', { req: 1, max: 40, keep: 1 }),
      ic_('value_num', 'num', 'Giá trị số', '数值'), ic_('value_text', 'text', 'Giá trị chữ', '文字值', { max: 200 }), ic_('unit', 'text', 'Đơn vị', '单位', { max: 20, keep: 1 }),
      ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  equipment_parts: { module: 'equipment', sheets: [{ name: 'equipment_parts', table: 'EquipmentParts', entity: 'EQUIPMENT_PART', id: 'equipment_part_id', cols: [
    ic_('equipment_part_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { req: 1, ref: 'Equipment', to: 'equipment_id', fixed: 1 }),
    ic_('material_code', 'ref', 'Mã vật tư', '物料编号', { req: 1, ref: 'Materials', to: 'material_id', fixed: 1 }),
    ic_('installed_qty', 'num', 'Số lượng lắp', '安装数量', { req: 1 }),
    ic_('function_vi', 'text', 'Chức năng (Việt)', '功能（越）', { pair: 'function', opt: 1, max: 200 }), ic_('function_zh', 'text', 'Chức năng (Trung)', '功能（中）', { pair: 'function', opt: 1, max: 200 }),
    ic_('position_vi', 'text', 'Vị trí lắp (Việt)', '安装位置（越）', { pair: 'position', opt: 1, max: 200 }), ic_('position_zh', 'text', 'Vị trí lắp (Trung)', '安装位置（中）', { pair: 'position', opt: 1, max: 200 }),
    ic_('effective_from', 'date', 'Lắp từ ngày', '安装日期'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  inspection_types: { module: 'inspections', sheets: [{ name: 'inspection_types', table: 'InspectionTypes', entity: 'INSPECTION_TYPE', id: 'inspection_type_id', cols: [
    ic_('inspection_type_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('code', 'text', 'Mã loại', '类型编码', { req: 1, max: 32, upper: 1 }),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('required_docs_vi', 'text', 'Hồ sơ cần có (Việt)', '所需资料（越）', { pair: 'required_docs', opt: 1, max: 1000 }), ic_('required_docs_zh', 'text', 'Hồ sơ cần có (Trung)', '所需资料（中）', { pair: 'required_docs', opt: 1, max: 1000 }),
    ic_('reference_basis', 'text', 'Căn cứ', '依据', { max: 300 }), ic_('default_interval_months', 'int', 'Chu kỳ tham khảo (tháng)', '参考周期（月）'),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  inspection_requirements: { module: 'inspections', sheets: [{ name: 'inspection_requirements', table: 'InspectionRequirements', entity: 'INSPECTION_REQUIREMENT', id: 'requirement_id', cols: [
    ic_('requirement_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { ref: 'Equipment', to: 'equipment_id' }), ic_('location_code', 'ref', 'Mã khu vực', '区域编号', { ref: 'Locations', to: 'location_id' }),
    ic_('inspection_type_code', 'ref', 'Mã loại kiểm định', '检验类型编码', { req: 1, ref: 'InspectionTypes', to: 'inspection_type_id' }),
    ic_('owner_code', 'ref', 'Mã NV phụ trách', '负责人员工编号', { ref: 'Users', to: 'owner_user_id' }),
    ic_('obligation_status', 'enum', 'Bắt buộc/tự nguyện', '强制/自愿', { options: ['REQUIRED', 'VOLUNTARY'] }), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  inspections: { module: 'inspections', sensitive: true, sheets: [{ name: 'inspections', table: 'Inspections', entity: 'INSPECTION', id: 'inspection_id', addOnly: true, cols: [
    ic_('inspection_id', 'id', 'ID (để trống)', 'ID（留空）'),
    ic_('requirement_code', 'ref', 'Mã yêu cầu kiểm định', '检验要求编号', { req: 1, ref: 'InspectionRequirements', to: 'requirement_id' }),
    ic_('inspection_date', 'date', 'Ngày kiểm định', '检验日期', { req: 1 }), ic_('valid_from', 'date', 'Hiệu lực từ', '有效期自'), ic_('valid_to', 'date', 'Hiệu lực đến', '有效期至'),
    ic_('next_due_date', 'date', 'Hạn kiểm định tiếp theo', '下次检验期限'), ic_('result', 'enum', 'Kết quả', '结果', { req: 1, options: ['PASS', 'CONDITIONAL_PASS', 'FAIL'] }),
    ic_('certificate_number', 'text', 'Số chứng nhận', '证书编号', { max: 80, keep: 1 }),
    ic_('restriction_vi', 'text', 'Hạn chế/kết luận (Việt)', '限制/结论（越）', { pair: 'restriction', opt: 1, max: 1000 }), ic_('restriction_zh', 'text', 'Hạn chế/kết luận (Trung)', '限制/结论（中）', { pair: 'restriction', opt: 1, max: 1000 }),
    ic_('vendor_code', 'ref', 'Mã đơn vị kiểm định', '检验单位编号', { ref: 'Vendors', to: 'vendor_id' }), ic_('cost', 'num', 'Chi phí', '费用', { cost: 1 })] }] },
  contracts: { module: 'contracts', sheets: [
    { name: 'contracts', table: 'Contracts', entity: 'CONTRACT', id: 'contract_id', cols: [
      ic_('contract_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('row_key', 'key', 'Khóa dòng (để sheet thiết bị tham chiếu hợp đồng mới)', '行键（供设备表引用新合同）'),
      ic_('contract_code', 'code', 'Mã hợp đồng (máy chủ cấp)', '合同编号（系统分配）', { readonly: 1 }), ic_('contract_number', 'text', 'Số hợp đồng', '合同号', { max: 80, keep: 1 }),
      ic_('title_vi', 'text', 'Tên (Việt)', '名称（越）', { pair: 'title', max: 200 }), ic_('title_zh', 'text', 'Tên (Trung)', '名称（中）', { pair: 'title', max: 200 }),
      ic_('vendor_code', 'ref', 'Mã nhà cung cấp', '供应商编号', { ref: 'Vendors', to: 'vendor_id' }), ic_('owner_code', 'ref', 'Mã NV phụ trách', '负责人员工编号', { ref: 'Users', to: 'owner_user_id' }),
      ic_('start_date', 'date', 'Ngày bắt đầu', '开始日期', { term: 1 }), ic_('end_date', 'date', 'Ngày hết hạn', '到期日', { req: 'add', term: 1 }),
      ic_('renewal_notice_date', 'date', 'Hạn báo gia hạn', '续约通知期限', { term: 1 }), ic_('value', 'num', 'Giá trị', '金额', { cost: 1, term: 1 }), ic_('currency', 'text', 'Tiền tệ', '币种', { cost: 1, term: 1, max: 3, upper: 1 }),
      ic_('scope_vi', 'text', 'Phạm vi (Việt)', '范围（越）', { pair: 'scope', opt: 1, max: 2000 }), ic_('scope_zh', 'text', 'Phạm vi (Trung)', '范围（中）', { pair: 'scope', opt: 1, max: 2000 }),
      ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
    { name: 'contract_equipment', table: 'ContractEquipment', entity: 'CONTRACT_EQUIPMENT', id: 'contract_equipment_id', cols: [
      ic_('contract_equipment_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
      ic_('contract_key', 'ref', 'Mã hợp đồng hoặc khóa dòng', '合同编号或行键', { req: 1, ref: 'Contracts', to: 'contract_id', fileSheet: 'contracts', fixed: 1 }),
      ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { req: 1, ref: 'Equipment', to: 'equipment_id', fixed: 1 }),
      ic_('service_vi', 'text', 'Dịch vụ (Việt)', '服务（越）', { pair: 'service', opt: 1, max: 500 }), ic_('service_zh', 'text', 'Dịch vụ (Trung)', '服务（中）', { pair: 'service', opt: 1, max: 500 }),
      ic_('interval_type', 'enum', 'Chu kỳ theo', '周期单位', { options: INTERVAL_TYPES_ }), ic_('interval_value', 'int', 'Số chu kỳ', '周期数'),
      ic_('next_service_date', 'date', 'Ngày dịch vụ tiếp theo', '下次服务日期'), ic_('price', 'num', 'Đơn giá', '单价', { cost: 1 }), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] }
};

/** Bảng → cột mã dùng tra tham chiếu */
var REF_CODE_COL_ = {
  Locations: 'location_code', Vendors: 'vendor_code', LookupValues: 'code', Equipment: 'equipment_code', Materials: 'material_code',
  InspectionTypes: 'code', InspectionRequirements: 'requirement_code', Contracts: 'contract_code', Users: 'employee_code'
};

function importTemplate_(key) {
  var t = IMPORT_TEMPLATES_[key];
  if (!t) throw validationError_([fieldError_('template_key', 'INVALID_VALUE')]);
  return t;
}

/**
 * Quyền ghi lô (import.commit, cờ I + A). Danh mục chung không có cờ A ở bảng 4.8 → lô danh mục chỉ cần I
 * và ô C3/C4 của import.commit (quyết định kỹ thuật, ghi trong skill).
 */
function canImportCommit_(ctx, module) {
  if (module !== 'catalog') return can_(ctx, 'import.commit', { module: module });
  var def = ACTION_REGISTRY['import.commit'];
  return hasFlag_(Number(ctx.user.role_level), 'catalog', 'I') && evalCells_(ctx, def, 'catalog').allowed;
}
function assertImportCommit_(ctx, module) {
  if (!canImportCommit_(ctx, module)) throw apiError_('FORBIDDEN');
}

/** Cột giá ẩn với người không có quyền $ (4.5) */
function templateCols_(ctx, t, sh) {
  var cost = canViewCost_(ctx, t.module);
  return sh.cols.filter(function (c) { return !c.cost || cost; });
}

/* ---------------- Mẫu ---------------- */

/** import.template {template_key}: định nghĩa cột + danh mục mã để trình duyệt dựng file .xlsx */
function importTemplateAction_(ctx) {
  var p = ctx.req.payload || {};
  var t = importTemplate_(p.template_key);
  authorize_(ctx, 'import.template', { module: t.module });
  var lists = {};
  var addList = function (name, vals) { if (vals.length) lists[name] = vals.slice(0, 2000); };
  addList('locations', readRows_('Locations').filter(function (r) { return r.active !== false; }).map(function (r) { return [r.location_code, r.name_vi || r.name_zh]; }));
  addList('vendors', readRows_('Vendors').filter(function (r) { return r.active !== false; }).map(function (r) { return [r.vendor_code, r.name]; }));
  var lk = readRows_('LookupValues').filter(function (r) { return r.active !== false && !r.archived_at; });
  LOOKUP_GROUP_ENUM_.forEach(function (g) { addList('lookup_' + g, lk.filter(function (r) { return r.group_key === g; }).map(function (r) { return [r.code, r.name_vi || r.name_zh]; })); });
  if (t.module === 'inspections') addList('inspection_types', readRows_('InspectionTypes').filter(function (r) { return r.active !== false; }).map(function (r) { return [r.code, r.name_vi || r.name_zh]; }));
  addList('spec_keys', Object.keys(SPEC_STD_).map(function (k) { return [k, LABELS['spec.' + k] ? LABELS['spec.' + k][0] : k]; }));
  return {
    template_key: p.template_key, version: IMPORT_TEMPLATE_VERSION_, dataset_epoch: sysProps_().dataset_epoch, module: t.module, sensitive: !!t.sensitive,
    sheets: t.sheets.map(function (sh) {
      return { name: sh.name, cols: templateCols_(ctx, t, sh).map(function (c) {
        return { key: c.key, type: c.type, label_vi: c.vi, label_zh: c.zh, required: c.req === 1 || c.req === true, required_add: c.req === 'add', options: c.options || null, text: c.type === 'code' || c.type === 'ref' || c.type === 'key' || c.type === 'id' || !!c.keep };
      }) };
    }),
    lists: lists
  };
}

/* ---------------- Chuẩn hóa ô ---------------- */

/** dd/mm/yyyy hoặc yyyy-mm-dd → ISO; ngày không có thật → null */
function parseImportDate_(v) {
  var s = trimStr_(v);
  if (!s) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || null;
  var y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

/** Số trong ô chữ: bỏ khoảng trắng nghìn, một dấu thập phân (. hoặc ,) */
function parseImportNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = trimStr_(v).replace(/[\s  ]/g, '');
  if (!s) return '';
  if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
}

function parseImportBool_(v) {
  if (v === true || v === false) return v;
  var s = trimStr_(v).toLowerCase();
  if (!s) return '';
  if (['true', '1', 'x', 'có', 'co', 'yes', 'y', '是'].indexOf(s) >= 0) return true;
  if (['false', '0', 'không', 'khong', 'no', 'n', '否'].indexOf(s) >= 0) return false;
  return null;
}

/** Chuẩn hóa một ô theo kiểu cột; trả {v} hoặc {err} */
function normCell_(c, raw) {
  if (raw === undefined) return { skip: true };
  if (raw === null) raw = '';
  if (c.type === 'int' || c.type === 'num' || c.type === 'ver') {
    var n = parseImportNum_(raw);
    if (n === '') return { v: '' };
    if (isNaN(n) || ((c.type === 'int' || c.type === 'ver') && Math.floor(n) !== n)) return { err: 'INVALID_VALUE' };
    return { v: n };
  }
  if (c.type === 'date') {
    var d = parseImportDate_(raw);
    if (d === null) return { err: 'INVALID_DATE' };
    return { v: d };
  }
  if (c.type === 'bool') {
    var b = parseImportBool_(raw);
    if (b === null) return { err: 'INVALID_VALUE' };
    return { v: b };
  }
  var s = typeof raw === 'number' ? String(raw) : trimStr_(raw);
  if (c.type === 'enum') {
    if (!s) return { v: '' };
    s = s.toUpperCase();
    if ((c.options || []).indexOf(s) < 0) return { err: 'INVALID_VALUE' };
    return { v: s };
  }
  if (c.type === 'code' || c.upper) s = s.toUpperCase();
  if (c.type === 'id') s = s.toLowerCase();
  if (c.max && s.length > c.max) return { err: 'INVALID_VALUE' };
  return { v: s };
}

/* ---------------- Xem trước theo khúc ---------------- */

function batchById_(id) {
  return isUuidV4_(id) ? findOne_('ImportBatches', 'import_batch_id', id) : null;
}

/**
 * import.preview {import_batch_id, template_key, chunk_index, chunk_count, total_rows, source_sha256, meta,
 *   rows: [{sheet, row_number, values: {key: raw}, formulas: [key]}]}
 * Khúc 100–200 dòng; khúc cuối (đủ total_rows) thì kiểm cả lô và trả kết quả xem trước.
 */
function importPreview_(ctx) {
  var p = ctx.req.payload || {};
  var t = importTemplate_(p.template_key);
  authorize_(ctx, 'import.preview', { module: t.module });
  var errs = [];
  if (!isUuidV4_(p.import_batch_id)) errs.push(fieldError_('import_batch_id', 'ID_INVALID'));
  if (!/^[0-9a-f]{64}$/.test(String(p.source_sha256 || ''))) errs.push(fieldError_('source_sha256', 'INVALID_VALUE'));
  var rows = Array.isArray(p.rows) ? p.rows : [];
  if (rows.length > IMPORT_CHUNK_MAX_) errs.push(fieldError_('rows', 'INVALID_VALUE'));
  var total = Number(p.total_rows);
  if (!(total >= 0 && total <= 5000)) errs.push(fieldError_('total_rows', 'INVALID_VALUE'));
  if (p.meta && p.meta.dataset_epoch && p.meta.dataset_epoch !== sysProps_().dataset_epoch) errs.push(fieldError_('template', 'TEMPLATE_EPOCH'));
  if (p.meta && p.meta.template_key && p.meta.template_key !== p.template_key) errs.push(fieldError_('template', 'TEMPLATE_MISMATCH'));
  var sheetNames = t.sheets.map(function (s) { return s.name; });
  rows.forEach(function (r) { if (!r || sheetNames.indexOf(r.sheet) < 0 || !(Number(r.row_number) >= 3)) errs.push(fieldError_('rows', 'INVALID_VALUE')); });
  if (errs.length) throw validationError_(errs);
  var stored = withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var nowIso = isoVN_(now_());
    if (b) {
      if (b.imported_by !== ctx.user.user_id || b.module !== p.template_key) throw apiError_('FORBIDDEN');
      if (b.source_sha256 !== p.source_sha256) throw validationError_([fieldError_('source_sha256', 'SOURCE_CHANGED')]);
      if (b.status !== 'VALIDATING') return { batch: b, done: true };
    } else {
      b = {
        import_batch_id: p.import_batch_id, module: p.template_key, schema_version: IMPORT_TEMPLATE_VERSION_, imported_by: ctx.user.user_id, imported_at: nowIso,
        file_document_id: '', total_rows: total, add_count: 0, update_count: 0, error_count: 0, status: 'VALIDATING', approved_by: '', completed_at: '',
        dataset_epoch: sysProps_().dataset_epoch, source_sha256: p.source_sha256, committing_session_id: '', commit_started_at: '', record_version: 1, updated_at: nowIso
      };
      insertRows_('ImportBatches', [b]);
    }
    var have = {};
    findAll_('ImportRows', 'import_batch_id', p.import_batch_id).forEach(function (r) { have[(r.normalized_payload_json || {}).s + '|' + r.row_number] = true; });
    var ins = [];
    rows.forEach(function (r) {
      var k = r.sheet + '|' + Number(r.row_number);
      if (have[k]) return;
      have[k] = true;
      ins.push({
        import_row_id: uuid_(), import_batch_id: p.import_batch_id, row_number: Number(r.row_number), entity_type: '', entity_id: '', action: '',
        expected_version: '', validation_status: 'PENDING', error_text: '', committed_at: '',
        normalized_payload_json: JSON.stringify({ s: r.sheet, raw: r.values || {}, f: Array.isArray(r.formulas) ? r.formulas : [] }),
        row_hash: b64url_(sha256_(JSON.stringify(r.values || {})))
      });
    });
    if (ins.length) insertRows_('ImportRows', ins);
    return { batch: b, count: Object.keys(have).length };
  });
  if (stored.done) return importSummary_(ctx, stored.batch, true);
  if (stored.count < total) return { import_batch_id: p.import_batch_id, status: 'VALIDATING', received: stored.count, total_rows: total };
  return validateImportBatch_(ctx, t, p.import_batch_id);
}

/** Kiểm cả lô (khúc cuối). Ghi kết quả từng dòng, trạng thái READY/NEEDS_FIX */
function validateImportBatch_(ctx, t, batchId) {
  dbReset_();
  var rows = findAll_('ImportRows', 'import_batch_id', batchId);
  var costOk = canViewCost_(ctx, t.module);
  // Bảng mã → dòng hiện có
  var codeMaps = {};
  var codeMap = function (table, group) {
    var k = table + (group ? ':' + group : '');
    if (!codeMaps[k]) {
      var m = {};
      readRows_(table).forEach(function (r) {
        if (r.archived_at) return;
        if (group && r.group_key !== group) return;
        var code = String(r[REF_CODE_COL_[table]] || '');
        m[table === 'LookupValues' || table === 'Users' ? code.toUpperCase() : code] = r;
      });
      codeMaps[k] = m;
    }
    return codeMaps[k];
  };
  var byId = {};
  var rowById = function (table, id) {
    if (!byId[table]) { byId[table] = {}; readRows_(table).forEach(function (r) { byId[table][r[sheetSchema_(table).key]] = r; }); }
    return byId[table][id] || null;
  };
  var sensitive = !!t.sensitive;
  var addN = 0, updN = 0, errN = 0, mtN = 0;
  // Khóa trong file: mã/khóa dòng → entity_id đã cấp (cho tham chiếu tới dòng thêm mới cùng file)
  var fileKeys = {};
  var parsed = rows.map(function (ir) {
    var np = ir.normalized_payload_json || {};
    return { ir: ir, sheet: np.s, raw: np.raw || {}, formulas: np.f || [], vals: {}, errs: [] };
  });
  var sheetDef = {};
  t.sheets.forEach(function (sh) { sheetDef[sh.name] = sh; });
  var order = t.sheets.map(function (s) { return s.name; });
  parsed.sort(function (a, b) { return order.indexOf(a.sheet) - order.indexOf(b.sheet) || a.ir.row_number - b.ir.row_number; });
  // Lượt 1: chuẩn hóa, ADD/UPDATE, cấp ID, mã trùng trong file
  var seenCodes = {};
  parsed.forEach(function (x) {
    var sh = sheetDef[x.sheet];
    var cols = templateCols_(ctx, t, sh);
    x.sh = sh;
    sh.cols.forEach(function (c) {
      if (c.cost && !costOk && x.raw[c.key] !== undefined && x.raw[c.key] !== '' && x.raw[c.key] !== null) x.errs.push([c.key, 'COST_FIELD_FORBIDDEN']);
    });
    x.formulas.forEach(function (k) { x.errs.push([k, 'FORMULA']); });
    cols.forEach(function (c) {
      var n = normCell_(c, x.raw[c.key]);
      if (n.skip) return;
      if (n.err) { x.errs.push([c.key, n.err]); return; }
      x.vals[c.key] = n.v;
    });
    var id = x.vals[sh.id] || '';
    if (id) {
      if (sh.addOnly) { x.errs.push([sh.id, 'INVALID_VALUE']); return; }
      var cur = isUuidV4_(id) ? rowById(sh.table, id) : null;
      if (!cur || cur.archived_at) { x.errs.push([sh.id, 'NOT_FOUND']); return; }
      x.action = 'UPDATE'; x.entityId = id; x.cur = cur;
      if (x.vals.record_version === undefined || x.vals.record_version === '') x.errs.push(['record_version', 'REQUIRED']);
      else if (Number(x.vals.record_version) !== Number(cur.record_version || 1)) x.errs.push(['record_version', 'VERSION_CONFLICT']);
    } else {
      x.action = 'ADD'; x.entityId = uuid_(); x.cur = null;
    }
    // Cột không đổi được khi sửa (khóa, nhóm, mã máy chủ cấp)
    sh.cols.forEach(function (c) {
      if (x.action === 'UPDATE' && c.fixed && x.vals[c.key] !== undefined && c.type !== 'ref' && String(x.vals[c.key]) !== String(x.cur[c.key])) x.errs.push([c.key, 'INVALID_VALUE']);
      if (c.readonly && x.action === 'ADD' && x.vals[c.key]) x.errs.push([c.key, 'INVALID_VALUE']);
      if (c.readonly && x.action === 'UPDATE' && x.vals[c.key] && x.vals[c.key] !== x.cur[c.key]) x.errs.push([c.key, 'INVALID_VALUE']);
      var req = c.req === 1 || c.req === true || (c.req === 'add' && x.action === 'ADD');
      if (req && (x.vals[c.key] === undefined || x.vals[c.key] === '')) {
        if (x.action === 'ADD' || x.vals[c.key] === '') x.errs.push([c.key, 'REQUIRED']);
      }
    });
    // Cặp song ngữ bắt buộc một bên
    var pairs = {};
    sh.cols.forEach(function (c) { if (c.pair) pairs[c.pair] = c.opt ? 'opt' : 'req'; });
    Object.keys(pairs).forEach(function (base) {
      var vi = x.vals[base + '_vi'], zh = x.vals[base + '_zh'];
      var curVi = x.cur ? x.cur[base + '_vi'] : '', curZh = x.cur ? x.cur[base + '_zh'] : '';
      var fvi = vi !== undefined ? vi : curVi, fzh = zh !== undefined ? zh : curZh;
      if (pairs[base] === 'req' && !fvi && !fzh) x.errs.push([base, 'REQUIRED_ONE_LANGUAGE']);
      if ((fvi && !fzh) || (!fvi && fzh)) {
        if ((NO_MT_FIELDS[sh.table] || []).indexOf(base) < 0) mtN++;
      }
    });
    // Mã trùng: trong file, và dòng thêm mới trùng mã đang có
    var codeCol = sh.code || (sh.table === 'InspectionTypes' ? 'code' : null);
    if (codeCol && x.vals[codeCol]) {
      var code = String(x.vals[codeCol]);
      var dupKey = sh.name + '|' + code;
      if (seenCodes[dupKey]) x.errs.push([codeCol, 'CODE_DUPLICATE']);
      seenCodes[dupKey] = true;
      var existing = codeMap(sh.table)[code];
      if (existing && (x.action === 'ADD' || existing[sh.id] !== x.entityId)) x.errs.push([codeCol, 'CODE_DUPLICATE']);
      if (x.action === 'ADD') fileKeys[sh.name + '|' + code] = x.entityId;
    }
    if (sh.table === 'LookupValues' && x.action === 'ADD' && x.vals.code) {
      var g = x.vals.group_key, lc = String(x.vals.code);
      if (g === 'SPEC_KEY' && !/^[a-z][a-z0-9_]{1,39}$/.test(lc)) x.errs.push(['code', 'CODE_INVALID']);
      if (g === 'SPEC_KEY' && SPEC_STD_[lc]) x.errs.push(['code', 'CODE_DUPLICATE']);
      var lkKey = 'lk|' + g + '|' + lc.toLowerCase();
      if (seenCodes[lkKey] || readRowsCached_('LookupValues').some(function (l) { return l.group_key === g && String(l.code).toLowerCase() === lc.toLowerCase(); })) x.errs.push(['code', 'CODE_DUPLICATE']);
      seenCodes[lkKey] = true;
    }
    if (sh.table === 'Glossary') {
      ['term_vi', 'term_zh'].forEach(function (f) {
        var v = normTerm_(x.vals[f] !== undefined ? x.vals[f] : (x.cur ? x.cur[f] : ''));
        if (!v) return;
        var k2 = 'g|' + f + '|' + v;
        if (seenCodes[k2] || readRowsCached_('Glossary').some(function (g2) { return g2.glossary_id !== x.entityId && g2.active && !g2.archived_at && normTerm_(g2[f]) === v; })) x.errs.push([f, 'CODE_DUPLICATE']);
        seenCodes[k2] = true;
      });
    }
    if (x.vals.row_key) {
      var rk = sh.name + '|' + String(x.vals.row_key).toUpperCase();
      if (fileKeys['rk|' + rk]) x.errs.push(['row_key', 'CODE_DUPLICATE']);
      fileKeys['rk|' + rk] = x.entityId;
    }
    if (x.action === 'UPDATE' && sh.code && x.cur) fileKeys[sh.name + '|' + x.cur[sh.code]] = x.entityId;
    // Lô nhạy cảm: hợp đồng có hạn/giá trị (thêm mới, hoặc sửa làm đổi)
    if (sh.table === 'Contracts') {
      sh.cols.forEach(function (c) {
        if (!c.term || x.vals[c.key] === undefined) return;
        if (x.action === 'ADD' ? x.vals[c.key] !== '' : String(x.vals[c.key]) !== String(x.cur[c.key] === undefined ? '' : x.cur[c.key])) sensitive = true;
      });
    }
  });
  // Lượt 2: tham chiếu (mã đang có hoặc dòng thêm mới cùng file)
  parsed.forEach(function (x) {
    x.refs = {};
    x.deps = [];
    templateCols_(ctx, t, x.sh).forEach(function (c) {
      if (c.type !== 'ref' || x.vals[c.key] === undefined) return;
      var code = String(x.vals[c.key]);
      if (!code) { x.refs[c.to] = ''; return; }
      var up = c.ref === 'LookupValues' || c.ref === 'Users' ? code.toUpperCase() : code;
      var inFileSheet = c.fileSheet || (c.self ? x.sh.name : null) || t.sheets.filter(function (s) { return s.table === c.ref; }).map(function (s) { return s.name; })[0];
      var fid = inFileSheet ? (fileKeys[inFileSheet + '|' + code] || fileKeys['rk|' + inFileSheet + '|' + code.toUpperCase()]) : null;
      if (fid) { x.refs[c.to] = fid; if (fid !== x.entityId) x.deps.push(fid); else x.errs.push([c.key, 'INVALID_VALUE']); return; }
      var r = codeMap(c.ref, c.group)[up];
      if (!r || (c.ref === 'Users' && !r.active)) { x.errs.push([c.key, 'NOT_FOUND']); return; }
      x.refs[c.to] = r[sheetSchema_(c.ref).key];
    });
    if (x.sh.table === 'InspectionRequirements' && x.action === 'ADD' && !x.refs.equipment_id && !x.refs.location_id) x.errs.push(['equipment_code', 'REQUIRED']);
    if (x.sh.table === 'EquipmentSpecs' && x.vals.spec_key && !specLabel_(String(x.vals.spec_key), readRowsCached_('LookupValues'))) x.errs.push(['spec_key', 'INVALID_VALUE']);
    if (x.sh.table === 'Inspections') {
      var res = x.vals.result;
      if (res && res !== 'FAIL' && !x.vals.valid_from) x.errs.push(['valid_from', 'REQUIRED']);
      if (res && res !== 'FAIL' && !x.vals.valid_to) x.errs.push(['valid_to', 'REQUIRED']);
      if (x.vals.valid_from && x.vals.valid_to && x.vals.valid_from > x.vals.valid_to) x.errs.push(['valid_to', 'INVALID_DATE']);
      if (res === 'CONDITIONAL_PASS' && !x.vals.restriction_vi && !x.vals.restriction_zh) x.errs.push(['restriction', 'RESTRICTION_REQUIRED']);
    }
    if (x.sh.table === 'Contracts') {
      var m2 = {};
      ['start_date', 'end_date', 'renewal_notice_date'].forEach(function (f) { m2[f] = x.vals[f] !== undefined ? x.vals[f] : (x.cur ? x.cur[f] : ''); });
      if (m2.start_date && m2.end_date && m2.start_date > m2.end_date) x.errs.push(['end_date', 'INVALID_DATE']);
      if (m2.renewal_notice_date && m2.end_date && m2.renewal_notice_date > m2.end_date) x.errs.push(['renewal_notice_date', 'RENEWAL_NOTICE_AFTER_END']);
      if (x.cur && (x.cur.lifecycle_status !== 'ACTIVE' || x.cur.status !== 'APPROVED')) x.errs.push(['contract_id', 'INVALID_VALUE']);
    }
  });
  // Ghi kết quả (dưới khóa, ghi theo khối)
  var nowIso = isoVN_(now_());
  parsed.forEach(function (x) {
    var ok = !x.errs.length;
    if (ok) { if (x.action === 'ADD') addN++; else updN++; } else errN++;
    x.ir.entity_type = x.sh ? x.sh.entity : '';
    x.ir.entity_id = x.entityId || '';
    x.ir.action = x.action || '';
    x.ir.expected_version = x.action === 'UPDATE' ? Number(x.vals.record_version) : 0;
    x.ir.validation_status = ok ? 'OK' : 'ERROR';
    x.ir.error_text = ok ? '' : JSON.stringify(x.errs.map(function (e) { return { field: e[0], code: e[1] }; }));
    var np = x.ir.normalized_payload_json || {};
    np.v = x.vals; np.r = x.refs; np.d = x.deps;
    x.ir.normalized_payload_json = np;
  });
  var batch = withWriteLock_(function () {
    writeRowsBulk_('ImportRows', parsed.map(function (x) { return x.ir; }));
    var b = batchById_(batchId);
    var upd = { add_count: addN, update_count: updN, error_count: errN, status: errN ? 'NEEDS_FIX' : 'READY', updated_at: nowIso, record_version: (b.record_version || 1) + 1 };
    writeCells_('ImportBatches', b.__row, upd);
    Object.keys(upd).forEach(function (k) { b[k] = upd[k]; });
    return b;
  });
  return importSummary_(ctx, batch, false, { mt_fields: mtN, sensitive: sensitive, parsed: parsed });
}

var READ_CACHE_ = {};
function readRowsCached_(table) {
  if (DB_.__rc !== READ_CACHE_) { READ_CACHE_ = {}; DB_.__rc = READ_CACHE_; }
  if (!READ_CACHE_[table]) READ_CACHE_[table] = readRows_(table);
  return READ_CACHE_[table];
}

/** Ghi lại nhiều dòng đã có (gom dòng liền nhau thành một lần setValues) */
function writeRowsBulk_(name, objs) {
  var h = hdr_(name);
  var sorted = objs.filter(function (o) { return o.__row; }).sort(function (a, b) { return a.__row - b.__row; });
  var i = 0;
  while (i < sorted.length) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1].__row === sorted[j].__row + 1) j++;
    var block = sorted.slice(i, j + 1).map(function (o) { return objToRow_(name, h, o); });
    sh_(name).getRange(sorted[i].__row, 1, block.length, h.cols.length).setValues(block);
    i = j + 1;
  }
}

/** Lô có nhạy cảm không (tính lại từ dòng: mẫu nhạy cảm, hoặc hợp đồng có hạn/giá trị) */
function batchSensitive_(t, rows) {
  if (t.sensitive) return true;
  if (t.module !== 'contracts') return false;
  return rows.some(function (r) {
    var np = r.normalized_payload_json || {};
    if (np.s !== 'contracts' || r.validation_status === 'ERROR') return false;
    var v = np.v || {};
    if (r.action === 'ADD') return ['start_date', 'end_date', 'renewal_notice_date', 'value', 'currency'].some(function (f) { return v[f] !== undefined && v[f] !== ''; });
    var cur = findOne_('Contracts', 'contract_id', r.entity_id) || {};
    return ['start_date', 'end_date', 'renewal_notice_date', 'value', 'currency'].some(function (f) { return v[f] !== undefined && String(v[f]) !== String(cur[f] === undefined ? '' : cur[f]); });
  });
}

function importErrorsOf_(rows, limit) {
  var out = [];
  rows.forEach(function (r) {
    if (r.validation_status !== 'ERROR' && r.validation_status !== 'FAILED') return;
    var list = [];
    try { list = JSON.parse(r.error_text || '[]'); } catch (e) { list = [{ field: '', code: 'INVALID_VALUE' }]; }
    list.forEach(function (e) {
      if (out.length >= limit) return;
      var fe = fieldError_(e.field, e.code, r.row_number);
      fe.sheet = (r.normalized_payload_json || {}).s || '';
      out.push(fe);
    });
  });
  return out;
}

function projectBatch_(ctx, b) {
  var dir = userDirectory_();
  var u = dir[b.imported_by];
  var t = IMPORT_TEMPLATES_[b.module];
  return {
    import_batch_id: b.import_batch_id, template_key: b.module, status: b.status, total_rows: b.total_rows, add_count: b.add_count, update_count: b.update_count,
    error_count: b.error_count, imported_by: b.imported_by, imported_by_name: u ? u.employee_code + ' · ' + u.display_name : '', imported_at: b.imported_at,
    completed_at: b.completed_at, approved_by: b.approved_by, mine: b.imported_by === ctx.user.user_id, module: t ? t.module : '',
    can_commit: t ? canImportCommit_(ctx, t.module) : false, record_version: b.record_version
  };
}

/** Tóm tắt lô cho màn xem trước (CM-03) */
function importSummary_(ctx, b, reload, extra) {
  var t = importTemplate_(b.module);
  var rows = findAll_('ImportRows', 'import_batch_id', b.import_batch_id);
  var out = projectBatch_(ctx, b);
  out.errors = importErrorsOf_(rows, 200);
  out.sensitive = extra && extra.sensitive !== undefined ? extra.sensitive : batchSensitive_(t, rows);
  out.mt_fields = extra ? extra.mt_fields : undefined;
  // Trước–sau của tối đa 30 dòng sửa
  var changes = [];
  rows.forEach(function (r) {
    if (r.action !== 'UPDATE' || r.validation_status !== 'OK' || changes.length >= 30) return;
    var np = r.normalized_payload_json || {};
    var sh = t.sheets.filter(function (s) { return s.name === np.s; })[0];
    var cur = sh ? findOne_(sh.table, sh.id, r.entity_id) : null;
    if (!cur) return;
    var diff = {};
    Object.keys(np.v || {}).forEach(function (k) {
      if (k === 'record_version' || k === sh.id || k === 'row_key') return;
      var col = sh.cols.filter(function (c) { return c.key === k; })[0];
      if (!col || col.type === 'ref') return;
      var before = cur[k] === undefined ? '' : cur[k];
      if (String(before) !== String(np.v[k])) diff[k] = [before, np.v[k]];
    });
    Object.keys(np.r || {}).forEach(function (k) { if (String(cur[k] || '') !== String(np.r[k] || '')) diff[k] = [cur[k] || '', np.r[k] || '']; });
    if (Object.keys(diff).length) changes.push({ sheet: np.s, row_number: r.row_number, code: cur[sh.code || 'code'] || '', diff: diff });
  });
  out.changes = changes;
  return out;
}

/* ---------------- Lỗi, gửi duyệt, hủy ---------------- */

/** import.errors {import_batch_id}: toàn bộ lỗi theo dòng; không có id → danh sách lô gần đây (của mình + chờ duyệt mình duyệt được) */
function importErrors_(ctx) {
  var p = ctx.req.payload || {};
  if (!p.import_batch_id) {
    var mods = {};
    Object.keys(IMPORT_TEMPLATES_).forEach(function (k) { mods[IMPORT_TEMPLATES_[k].module] = true; });
    var okMods = Object.keys(mods).filter(function (m) { return can_(ctx, 'import.errors', { module: m }); });
    if (!okMods.length) throw apiError_('FORBIDDEN');
    var list = readRows_('ImportBatches').filter(function (b) {
      var t = IMPORT_TEMPLATES_[b.module];
      if (!t || okMods.indexOf(t.module) < 0) return false;
      if (b.imported_by === ctx.user.user_id) return true;
      return (b.status === 'PENDING_APPROVAL' || b.status === 'PARTIAL') && canImportCommit_(ctx, t.module);
    }).sort(function (a, b) { return String(b.imported_at).localeCompare(String(a.imported_at)); }).slice(0, 30);
    return { items: list.map(function (b) { return projectBatch_(ctx, b); }) };
  }
  var b = batchById_(p.import_batch_id);
  if (!b) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b.module);
  authorize_(ctx, 'import.errors', { module: t.module });
  if (b.imported_by !== ctx.user.user_id && !canImportCommit_(ctx, t.module)) throw apiError_('FORBIDDEN');
  return importSummary_(ctx, b, true);
}

/** import.submit {import_batch_id}: lô READY của mình → PENDING_APPROVAL (đề nghị, chờ C3/C4 commit) */
function importSubmit_(ctx) {
  var p = ctx.req.payload || {};
  var b0 = batchById_(p.import_batch_id);
  if (!b0) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b0.module);
  authorize_(ctx, 'import.submit', { module: t.module });
  return withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    if (b.imported_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
    if (b.status !== 'READY') throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
    writeCells_('ImportBatches', b.__row, { status: 'PENDING_APPROVAL', updated_at: isoVN_(now_()), record_version: (b.record_version || 1) + 1 });
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'import.submit', entity_type: 'IMPORT_BATCH', entity_id: b.import_batch_id,
      before_json: { status: b.status }, after_json: { status: 'PENDING_APPROVAL', template: b.module }, operation_id: ctx.req.operation_id || '', import_batch_id: b.import_batch_id, auth_basis: authBasis_(ctx) });
    b.status = 'PENDING_APPROVAL';
    return projectBatch_(ctx, b);
  });
}

/** import.cancel {import_batch_id}: hủy lô chưa ghi (của mình; C3/C4 hủy được lô chờ duyệt) */
function importCancel_(ctx) {
  var p = ctx.req.payload || {};
  var b0 = batchById_(p.import_batch_id);
  if (!b0) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b0.module);
  authorize_(ctx, 'import.cancel', { module: t.module });
  return withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var mine = b.imported_by === ctx.user.user_id;
    if (!mine && !(Number(ctx.user.role_level) >= 3 && canImportCommit_(ctx, t.module))) throw apiError_('FORBIDDEN');
    if (['VALIDATING', 'NEEDS_FIX', 'READY', 'PENDING_APPROVAL'].indexOf(b.status) < 0) throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
    writeCells_('ImportBatches', b.__row, { status: 'FAILED', completed_at: isoVN_(now_()), updated_at: isoVN_(now_()), record_version: (b.record_version || 1) + 1 });
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'import.cancel', entity_type: 'IMPORT_BATCH', entity_id: b.import_batch_id,
      before_json: { status: b.status }, after_json: { status: 'FAILED', cancelled: true }, operation_id: ctx.req.operation_id || '', import_batch_id: b.import_batch_id, auth_basis: authBasis_(ctx) });
    b.status = 'FAILED';
    return projectBatch_(ctx, b);
  });
}

/* ---------------- Ghi lô (commit) ---------------- */

/** Bỏ hỏi PIN cho khúc commit tiếp theo: cùng phiên, cùng người, lô đang ghi dở, chưa quá 30 phút (3.8) */
function importCommitPinWaived_(ctx) {
  var b = batchById_((ctx.req.payload || {}).import_batch_id);
  if (!b || (b.status !== 'COMMITTING' && b.status !== 'PARTIAL')) return false;
  if (b.committing_session_id !== ctx.sid) return false;
  var t0 = parseTime_(b.commit_started_at);
  return !!t0 && now_().getTime() - t0.getTime() < 30 * 60000;
}

/** UUID v4 cố định suy từ một chuỗi (operation_id phụ của cùng một dòng nhập) */
function uuidFrom_(s) {
  var h = sha256_(s).slice(0, 16).map(function (b) { return ('0' + u8_(b).toString(16)).slice(-2); });
  h[6] = '4' + h[6].charAt(1);
  h[8] = ['8', '9', 'a', 'b'][parseInt(h[8].charAt(0), 16) % 4] + h[8].charAt(1);
  var x = h.join('');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20, 32);
}

/** Gọi một action như request riêng (kiểm quyền người commit; thao tác ghi chống lặp theo operation_id) */
function runRowAction_(ctx, action, payload, opId, expectedVersion, module, user) {
  var u = user || ctx.user;
  var sub = {
    user: u, sid: ctx.sid, session: ctx.session, token: ctx.token, importBatch: true,
    req: { api_contract_version: ctx.req.api_contract_version, action: action, payload: payload, operation_id: opId, expected_version: expectedVersion,
      device_id: ctx.req.device_id, dataset_epoch: ctx.req.dataset_epoch, app_version: ctx.req.app_version }
  };
  var def = ACTION_REGISTRY[action];
  var mod = def.module === 'contracts|inspections' || def.module === '*' ? module : null;
  sub.auth = authorize_(sub, action, mod ? { module: mod } : null);
  if (sub.auth.conds && sub.auth.conds.length) throw apiError_('FORBIDDEN');
  return HANDLERS_[action](sub);
}

/** Dựng payload của một dòng (giá trị đã chuẩn hóa + ID tham chiếu) */
function rowPayload_(sh, r) {
  var np = r.normalized_payload_json || {};
  var v = np.v || {}, refs = np.r || {};
  var p = {};
  sh.cols.forEach(function (c) {
    if (c.type === 'id' || c.type === 'ver' || c.type === 'key' || c.type === 'ref' || c.readonly) return;
    if (v[c.key] === undefined) return;
    if (r.action === 'ADD' && v[c.key] === '') return;
    p[c.key] = v[c.key];
  });
  Object.keys(refs).forEach(function (k) { p[k] = refs[k]; });
  p[sh.id] = r.entity_id;
  return p;
}

/**
 * Ghi một dòng (hoặc một hợp đồng kèm thiết bị). Trả true nếu xong, ném lỗi nếu dòng hỏng.
 * group: các ImportRows contract_equipment thuộc hợp đồng này (ghi cùng contract.create/edit)
 */
function commitImportRow_(ctx, t, b, sh, r, importer, group) {
  var p = rowPayload_(sh, r);
  var ev = r.action === 'UPDATE' ? Number(r.expected_version) : 0;
  var add = r.action === 'ADD';
  var res;
  var run = function (action, payload, opId, ver, user) {
    var out = runRowAction_(ctx, action, payload, opId, ver, t.module, user);
    if (out && out.ok === false) throw apiError_(out.code || 'INTERNAL_ERROR');
    return out;
  };
  switch (sh.table) {
    case 'Glossary': res = run('glossary.edit', p, r.import_row_id, ev); break;
    case 'Locations': res = run('location.edit', p, r.import_row_id, ev); break;
    case 'LookupValues': if (!add) { delete p.group_key; delete p.code; } res = run('lookup.edit', p, r.import_row_id, ev); break;
    case 'Vendors': res = run('vendor.edit', p, r.import_row_id, ev); break;
    case 'Materials': res = run(add ? 'material.create' : 'material.edit', p, r.import_row_id, ev); break;
    case 'Equipment': res = run(add ? 'equipment.create' : 'equipment.edit', p, r.import_row_id, ev); break;
    case 'EquipmentSpecs': if (!add) delete p.equipment_id; res = run('equipment.spec.edit', p, r.import_row_id, ev); break;
    case 'EquipmentParts': if (!add) { delete p.equipment_id; delete p.material_id; } res = run('part.link', p, r.import_row_id, ev); break;
    case 'InspectionTypes': res = run('inspection.type.edit', p, r.import_row_id, ev); break;
    case 'InspectionRequirements': res = run('inspection.requirement.edit', p, r.import_row_id, ev); break;
    case 'Inspections': {
      // Người nhập là người nộp; người commit duyệt (commit lô nhạy cảm là duyệt, 4.4.11 ⁷)
      run('inspection.submit', p, r.import_row_id, 0, importer);
      var ins = findOne_('Inspections', 'inspection_id', r.entity_id);
      if (ins && ins.status === 'PENDING_APPROVAL') run('inspection.approve', { inspection_id: r.entity_id, decision: 'APPROVE' }, uuidFrom_(r.import_row_id + ':approve'), ins.record_version);
      res = true;
      break;
    }
    case 'Contracts': {
      var eqList = (group || []).map(function (g) { var q = rowPayload_(t.sheets[1], g); delete q.contract_id; if (g.action === 'UPDATE') delete q.equipment_id; return q; });
      var terms = {};
      CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) { terms[f] = p[f]; delete p[f]; } });
      if (add) {
        Object.keys(terms).forEach(function (f) { p[f] = terms[f]; });
        if (eqList.length) p.equipment = eqList;
        res = run('contract.create', p, r.import_row_id, 0);
      } else {
        var cur = findOne_('Contracts', 'contract_id', r.entity_id);
        var changed = {};
        Object.keys(terms).forEach(function (f) { if (String(terms[f]) !== String(cur[f] === undefined ? '' : cur[f])) changed[f] = terms[f]; });
        if (eqList.length) p.equipment = eqList;
        res = run('contract.edit', p, r.import_row_id, ev);
        if (Object.keys(changed).length) {
          var c2 = findOne_('Contracts', 'contract_id', r.entity_id);
          changed.contract_id = r.entity_id;
          changed.reason = 'Excel ' + b.import_batch_id.slice(0, 8);
          run('contract.editTerms', changed, uuidFrom_(r.import_row_id + ':terms'), c2.record_version);
        }
      }
      break;
    }
    case 'ContractEquipment': {
      // Thiết bị của hợp đồng không có trong file: contract.edit chỉ với danh sách thiết bị
      var cid = (r.normalized_payload_json.r || {}).contract_id;
      var cc = findOne_('Contracts', 'contract_id', cid);
      if (!cc) throw apiError_('NOT_FOUND');
      var q = rowPayload_(sh, r); delete q.contract_id; if (r.action === 'UPDATE') delete q.equipment_id;
      res = run('contract.edit', { contract_id: cid, equipment: [q] }, r.import_row_id, cc.record_version);
      break;
    }
    default: throw apiError_('INTERNAL_ERROR');
  }
  return res;
}

/**
 * import.commit {import_batch_id}: ghi lô theo khúc (≤ 100 dòng hoặc ~40 giây mỗi request).
 * Còn dòng → status PARTIAL, trả continue; gọi lại cùng import_batch_id. PIN chỉ hỏi ở khúc đầu (3.8).
 */
function importCommit_(ctx) {
  var p = ctx.req.payload || {};
  var b0 = batchById_(p.import_batch_id);
  if (!b0) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b0.module);
  assertImportCommit_(ctx, t.module);
  if (b0.dataset_epoch !== sysProps_().dataset_epoch) throw validationError_([fieldError_('import_batch_id', 'TEMPLATE_EPOCH')]);
  var rows0 = findAll_('ImportRows', 'import_batch_id', b0.import_batch_id);
  var sensitive = batchSensitive_(t, rows0);
  // Mở hoặc tiếp tục lô
  withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var nowIso = isoVN_(now_());
    if (b.status === 'READY' || b.status === 'PENDING_APPROVAL') {
      if (b.status === 'READY' && b.imported_by !== ctx.user.user_id) throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
      if (sensitive && b.imported_by === ctx.user.user_id) throw apiError_('FORBIDDEN');
      writeCells_('ImportBatches', b.__row, { status: 'COMMITTING', approved_by: ctx.user.user_id, committing_session_id: ctx.sid, commit_started_at: nowIso, updated_at: nowIso, record_version: (b.record_version || 1) + 1 });
    } else if (b.status === 'COMMITTING' || b.status === 'PARTIAL') {
      if (b.approved_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
      var fresh = importCommitPinWaived_(ctx);
      writeCells_('ImportBatches', b.__row, fresh ? { status: 'COMMITTING', updated_at: nowIso } : { status: 'COMMITTING', committing_session_id: ctx.sid, commit_started_at: nowIso, updated_at: nowIso });
    } else {
      throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
    }
  });
  var b1 = batchById_(p.import_batch_id);
  var importer = userCached_(b1.imported_by);
  var t0 = Date.now();
  var done = 0;
  var order = t.sheets.map(function (s) { return s.name; });
  var pending = rows0.filter(function (r) { return r.validation_status === 'OK'; });
  // Thứ tự: theo sheet; trong sheet dòng phụ thuộc (khu vực cha cùng file) sau dòng được tham chiếu
  pending.sort(function (a, b) { return order.indexOf(a.normalized_payload_json.s) - order.indexOf(b.normalized_payload_json.s) || a.row_number - b.row_number; });
  var byEntity = {};
  rows0.forEach(function (r) { byEntity[r.entity_id] = r; });
  var ready = function (r) { return (r.normalized_payload_json.d || []).every(function (id) { var dep = byEntity[id]; return !dep || dep.validation_status === 'COMMITTED' || dep.normalized_payload_json.s !== r.normalized_payload_json.s; }); };
  // Hợp đồng ghi cùng thiết bị của nó
  var ceByContract = {};
  if (t.module === 'contracts') pending.forEach(function (r) {
    if (r.normalized_payload_json.s !== 'contract_equipment') return;
    var cid = (r.normalized_payload_json.r || {}).contract_id;
    if (byEntity[cid] && byEntity[cid].normalized_payload_json.s === 'contracts') (ceByContract[cid] = ceByContract[cid] || []).push(r);
  });
  MT_DEFER_ = true;
  try {
    var progressed = true;
    while (progressed && done < IMPORT_COMMIT_MAX_ && Date.now() - t0 < IMPORT_COMMIT_BUDGET_MS_) {
      progressed = false;
      for (var i = 0; i < pending.length && done < IMPORT_COMMIT_MAX_ && Date.now() - t0 < IMPORT_COMMIT_BUDGET_MS_; i++) {
        var r = pending[i];
        var depBad = (r.normalized_payload_json.d || []).some(function (id) { return byEntity[id] && byEntity[id].validation_status === 'FAILED'; });
        if (r.validation_status !== 'OK' || (!depBad && !ready(r))) continue;
        if (r.normalized_payload_json.s === 'contract_equipment' && ceByContract[(r.normalized_payload_json.r || {}).contract_id]) continue;
        var sh = t.sheets.filter(function (s) { return s.name === r.normalized_payload_json.s; })[0];
        var group = sh.table === 'Contracts' ? (ceByContract[r.entity_id] || []) : null;
        var status, err = '';
        var depFailed = (r.normalized_payload_json.d || []).some(function (id) { return byEntity[id] && byEntity[id].validation_status === 'FAILED'; });
        if (depFailed) {
          status = 'FAILED';
          err = JSON.stringify([{ field: '', code: 'DEPENDENCY_FAILED' }]);
        } else try {
          dbReset_();
          commitImportRow_(ctx, t, b1, sh, r, importer, group);
          status = 'COMMITTED';
        } catch (e) {
          status = 'FAILED';
          var code = e && e.apiCode ? e.apiCode : 'INTERNAL_ERROR';
          var list = e && e.apiErrors && e.apiErrors.length ? e.apiErrors.map(function (x) { return { field: x.field, code: x.code }; }) : [{ field: '', code: code }];
          err = JSON.stringify(list);
          if (code === 'INTERNAL_ERROR') console.error('import row ' + r.import_row_id + ': ' + (e && e.message));
        }
        var nowIso = isoVN_(now_());
        var touched = [r].concat(group || []);
        withWriteLock_(function () {
          touched.forEach(function (x) {
            x.validation_status = status; x.error_text = err; x.committed_at = status === 'COMMITTED' ? nowIso : '';
            var cur = readRowAt_('ImportRows', x.__row);
            if (cur.import_row_id === x.import_row_id) writeCells_('ImportRows', x.__row, { validation_status: status, error_text: err, committed_at: x.committed_at });
            else { var rn = findRowNums_('ImportRows', 'import_row_id', x.import_row_id)[0]; if (rn) writeCells_('ImportRows', rn, { validation_status: status, error_text: err, committed_at: x.committed_at }); }
          });
        });
        done += touched.length;
        progressed = true;
      }
    }
  } finally {
    MT_DEFER_ = false;
  }
  dbReset_();
  var rows = findAll_('ImportRows', 'import_batch_id', p.import_batch_id);
  var left = rows.filter(function (r) { return r.validation_status === 'OK'; }).length;
  var failed = rows.filter(function (r) { return r.validation_status === 'FAILED'; }).length;
  var status = left ? 'PARTIAL' : (failed ? 'PARTIAL' : 'COMMITTED');
  var final = withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var nowIso = isoVN_(now_());
    var upd = { status: status, updated_at: nowIso, record_version: (b.record_version || 1) + 1 };
    if (!left) upd.completed_at = nowIso;
    writeCells_('ImportBatches', b.__row, upd);
    if (!left) writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'import.commit', entity_type: 'IMPORT_BATCH', entity_id: b.import_batch_id,
      before_json: { imported_by: b.imported_by, total_rows: b.total_rows }, after_json: { status: status, committed: rows.length - failed - left, failed: failed, sensitive: sensitive, template: b.module },
      operation_id: ctx.req.operation_id || '', import_batch_id: b.import_batch_id, auth_basis: authBasis_(ctx) });
    Object.keys(upd).forEach(function (k) { b[k] = upd[k]; });
    return b;
  });
  if (!left) afterDueChange_();
  var out = projectBatch_(ctx, final);
  out.committed = rows.filter(function (r) { return r.validation_status === 'COMMITTED'; }).length;
  out.failed = failed;
  out.remaining = left;
  out.continue_token = left ? final.import_batch_id : null;
  out.errors = importErrorsOf_(rows, 200);
  return out;
}

/* ---------------- Xuất Excel ---------------- */

/** Kiểu ô khi xuất (5.4.6): num (#,##0), date (ô ngày thật dd/mm/yyyy), bool, code (chữ @, giữ số 0), text */
function exportType_(c) {
  if (c.type === 'int' || c.type === 'num' || c.type === 'ver') return 'num';
  if (c.type === 'date') return 'date';
  if (c.type === 'bool') return 'bool';
  if (c.type === 'id' || c.type === 'code' || c.type === 'ref' || c.type === 'key' || c.keep) return 'code';
  return 'text';
}

/** Giá trị một cột khi xuất (mã thay cho ID tham chiếu) */
function exportCell_(c, row, codeOf) {
  if (c.type === 'ref') {
    var id = row[c.to];
    return id ? codeOf(c.ref, id) : '';
  }
  if (c.type === 'key') return '';
  var v = row[c.key];
  if (v === undefined || v === null) return '';
  if (c.type === 'bool') return v === true;
  return v;
}

/**
 * export.xlsx {template_key | list: 'alerts', due?: 'ALL'|'DUE40'|'OVERDUE'}: dòng đã lọc theo quyền,
 * bỏ cột giá khi thiếu quyền $, thêm cột i18n_machine_fields; trình duyệt dựng .xlsx (SheetJS). Ghi AuditLogs.
 */
function exportXlsx_(ctx) {
  var p = ctx.req.payload || {};
  var today = todayVN_();
  var dir = userDirectory_();
  var u = dir[ctx.user.user_id];
  var filters = [];
  var sheets = [];
  var module;
  if (p.list === 'alerts') {
    var okI = can_(ctx, 'export.xlsx', { module: 'inspections' }), okC = can_(ctx, 'export.xlsx', { module: 'contracts' });
    if (!okI && !okC) throw apiError_('FORBIDDEN');
    module = okI && okC ? 'contracts|inspections' : (okI ? 'inspections' : 'contracts');
    var reqs = {}, cons = {}, types = {}, eqs = {};
    readRows_('InspectionRequirements').forEach(function (x) { reqs[x.requirement_id] = x; });
    readRows_('Contracts').forEach(function (x) { cons[x.contract_id] = x; });
    readRows_('InspectionTypes').forEach(function (x) { types[x.inspection_type_id] = x; });
    readRows_('Equipment').forEach(function (x) { eqs[x.equipment_id] = x; });
    var rowsA = readRows_('Alerts').filter(function (a) { return a.alert_state !== 'RESOLVED' && (a.entity_type === 'CONTRACT' ? okC : okI); }).map(function (a) {
      var dr = daysRemaining_(a.due_date, today);
      var code = '', name = '', eqCode = '', owner = a.owner_user_id && dir[a.owner_user_id] ? dir[a.owner_user_id].display_name : '';
      if (a.entity_type === 'CONTRACT') { var c = cons[a.entity_id] || {}; code = c.contract_code; name = c.title_vi || c.title_zh; }
      else { var r = reqs[a.entity_id] || {}; var ty = types[r.inspection_type_id] || {}; var e = eqs[r.equipment_id] || {}; code = r.requirement_code; name = ty.name_vi || ty.name_zh; eqCode = e.equipment_code || ''; }
      return [a.entity_type === 'CONTRACT' ? 'CONTRACT' : 'INSPECTION', code || '', name || '', eqCode, a.due_date, a.reference_date_kind, dr, a.stage, a.alert_state, owner];
    }).sort(function (x, y) { return x[6] - y[6]; });
    sheets.push({ name: 'alerts', keys: ['kind', 'code', 'name', 'equipment_code', 'due_date', 'reference_date_kind', 'days_remaining', 'stage', 'alert_state', 'owner'],
      types: ['text', 'code', 'text', 'code', 'date', 'text', 'num', 'text', 'text', 'text'],
      labels: [['Loại', '类型'], ['Mã', '编号'], ['Tên', '名称'], ['Mã thiết bị', '设备编号'], ['Ngày tham chiếu', '参考日期'], ['Loại ngày', '日期类型'], ['Còn (ngày)', '剩余天数'], ['Mốc', '节点'], ['Trạng thái', '状态'], ['Phụ trách', '负责人']], rows: rowsA });
    filters.push(['list', 'alerts']);
  } else {
    var t = importTemplate_(p.template_key);
    module = t.module;
    authorize_(ctx, 'export.xlsx', { module: t.module });
    var codeCache = {};
    var codeOf = function (table, id) {
      if (!codeCache[table]) { codeCache[table] = {}; readRows_(table).forEach(function (r) { codeCache[table][r[sheetSchema_(table).key]] = r[REF_CODE_COL_[table]]; }); }
      return codeCache[table][id] || '';
    };
    var due = ['DUE40', 'OVERDUE'].indexOf(p.due) >= 0 ? p.due : 'ALL';
    var lead = Number(setting_('lead_days') || 40);
    var keepIds = null;
    t.sheets.forEach(function (sh, si) {
      var cols = templateCols_(ctx, t, sh);
      var data = readRows_(sh.table).filter(function (r) { return !r.archived_at && !r.removed_at; });
      if (sh.table === 'InspectionRequirements' || sh.table === 'Contracts') {
        if (sh.table === 'Contracts') data = data.filter(function (r) { return r.lifecycle_status === 'ACTIVE'; });
        if (due !== 'ALL') data = data.filter(function (r) {
          var d = sh.table === 'Contracts' ? contractRef_(r).date : r.current_due_date;
          var dr = daysRemaining_(d, today);
          return dr !== null && (due === 'OVERDUE' ? dr < 0 : dr <= lead);
        });
        if (si === 0) keepIds = {};
        if (keepIds) data.forEach(function (r) { keepIds[r[sh.id]] = true; });
      }
      if (sh.table === 'ContractEquipment' && keepIds) data = data.filter(function (r) { return keepIds[r.contract_id]; });
      if (sh.table === 'Inspections') data = data.filter(function (r) { return r.status === 'APPROVED'; });
      var keys = cols.map(function (c) { return c.key; }).concat(['i18n_machine_fields']);
      var labels = cols.map(function (c) { return [c.vi, c.zh]; }).concat([['Trường dịch máy', '机器翻译字段']]);
      var types = cols.map(function (c) { return exportType_(c); }).concat(['text']);
      var rows = data.map(function (r) {
        var line = cols.map(function (c) {
          if (sh.table === 'ContractEquipment' && c.key === 'contract_key') return codeOf('Contracts', r.contract_id);
          if (sh.table === 'EquipmentSpecs' && c.key === 'equipment_key') return codeOf('Equipment', r.equipment_id);
          return exportCell_(c, r, codeOf);
        });
        var mt = Object.keys(r.i18n_meta || {}).filter(function (f) { return r.i18n_meta[f] && r.i18n_meta[f].state === 'MACHINE'; });
        line.push(mt.join(','));
        return line;
      });
      sheets.push({ name: sh.name, keys: keys, labels: labels, types: types, rows: rows });
    });
    filters.push(['template_key', p.template_key]);
    if (due !== 'ALL') filters.push(['due', due]);
  }
  withWriteLock_(function () {
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'export.xlsx', entity_type: 'EXPORT', entity_id: p.template_key || p.list || '',
      before_json: null, after_json: { rows: sheets.reduce(function (s, x) { return s + x.rows.length; }, 0), filters: filters }, operation_id: '', auth_basis: authBasis_(ctx) });
  });
  return {
    sheets: sheets, filters: filters, generated_at: isoVN_(now_()), generated_by: u ? u.employee_code + ' · ' + u.display_name : '',
    scope: module, env: envName_(), template_version: IMPORT_TEMPLATE_VERSION_, dataset_epoch: sysProps_().dataset_epoch, cost_included: canViewCost_(ctx, module.split('|')[0])
  };
}

// ===== i18n/labels.json =====
/** Bản chép từ điển nhãn của app (5.3) cho email, Excel, lời báo */
var LABELS = {"nav.home":["Trang chủ","首页"],"nav.work":["Công việc","工单"],"nav.scan":["Quét QR","扫码"],"nav.alerts":["Nhắc hạn","到期提醒"],"nav.account":["Tài khoản","账户"],"menu.title":["Danh mục","功能菜单"],"module.equipment":["Thiết bị","设备"],"module.maintenance":["Bảo trì","保养"],"module.repairs":["Sửa chữa","维修"],"module.warehouse":["Kho vật tư","物料库"],"module.utilities":["Điện nước","水电"],"module.reports":["Báo cáo","报表"],"module.circuits":["Tra cứu lộ điện","电路查询"],"module.contracts":["Hợp đồng thuê ngoài","外包合同"],"module.inspections":["Kiểm định","检验"],"tab.specs":["Thông số","参数"],"tab.parts":["Linh kiện","配件"],"tab.documents":["Tài liệu","文件"],"tab.history":["Lịch sử","历史记录"],"tab.plans":["Kế hoạch","计划"],"tab.work_orders":["Phiếu thực hiện","执行工单"],"tab.calendar":["Lịch","日程"],"tab.catalog":["Danh mục","物料目录"],"tab.parts_by_equipment":["Vật tư theo máy","设备用料"],"tab.requests":["Đề nghị","物料申请"],"tab.usage":["Lượng dùng","物料用量"],"btn.import_excel":["Nhập Excel","导入Excel"],"btn.export_excel":["Xuất Excel","导出Excel"],"btn.report":["Báo cáo","报表"],"btn.qr":["QR","二维码"],"btn.view_qr":["Xem QR","查看二维码"],"btn.print_qr":["In QR","打印二维码"],"btn.save_draft":["Lưu nháp","保存草稿"],"btn.submit_review":["Gửi duyệt","提交审核"],"btn.submit_acceptance":["Gửi nghiệm thu","提交验收"],"btn.approve":["Duyệt","批准"],"btn.reject":["Từ chối","驳回"],"btn.accept_pass":["Nghiệm thu đạt","验收通过"],"btn.accept_fail":["Không đạt, trả lại","验收不通过"],"btn.add":["Thêm","新增"],"btn.edit":["Sửa","编辑"],"btn.save":["Lưu","保存"],"btn.cancel":["Hủy","取消"],"btn.back":["Quay lại","返回"],"btn.close":["Đóng","关闭"],"btn.ok":["Đồng ý","确定"],"btn.confirm":["Đúng","确认"],"btn.retry":["Thử lại","重试"],"btn.more":["Thêm thao tác","更多操作"],"btn.search":["Tìm","搜索"],"btn.filter":["Lọc","筛选"],"btn.clear_filter":["Bỏ lọc","清除筛选"],"btn.sync_now":["Đồng bộ ngay","立即同步"],"btn.export_backup":["Xuất dự phòng","导出备份"],"btn.keep_drafts":["Giữ nháp trên máy","保留本机草稿"],"btn.delete_drafts":["Xóa nháp","删除草稿"],"btn.delete_draft":["Xóa nháp","删除草稿"],"btn.change_pin":["Đổi PIN","修改PIN"],"btn.logout":["Đăng xuất","退出登录"],"btn.logout_all":["Đăng xuất mọi thiết bị","退出所有设备"],"btn.relogin":["Đăng nhập lại","重新登录"],"btn.download":["Tải về","下载"],"btn.open_save":["Mở / Lưu","打开/保存"],"btn.download_offline":["Tải để xem ngoại tuyến","下载以离线查看"],"btn.set_private":["Đặt riêng tư","设为私有"],"btn.suggest_translation":["Gợi ý dịch","翻译建议"],"btn.retranslate":["Dịch lại","重新翻译"],"btn.backup_now":["Sao lưu ngay","立即备份"],"btn.resend":["Gửi lại","重新发送"],"btn.archive":["Ngừng sử dụng","停用"],"btn.unarchive":["Dùng lại","恢复使用"],"btn.upload":["Tải lên","上传"],"btn.add_link":["Thêm liên kết","添加链接"],"btn.take_photo":["Chụp ảnh","拍照"],"btn.choose_file":["Chọn tệp","选择文件"],"btn.remove":["Bỏ","移除"],"btn.use_server":["Dùng bản máy chủ","采用服务器版本"],"btn.edit_on_server":["Sửa tiếp trên bản máy chủ","基于服务器版本修改"],"btn.copy_to_draft":["Chép thành nháp mới","复制为新草稿"],"btn.view":["Xem","查看"],"btn.open":["Mở","打开"],"btn.revoke":["Thu hồi","撤销"],"btn.replace_part":["Thay linh kiện","更换配件"],"btn.link_part":["Gắn linh kiện có sẵn","关联已有配件"],"btn.new_part":["Thêm linh kiện mới","新增配件"],"btn.edit_unlink":["Sửa/Gỡ liên kết","编辑或解除关联"],"btn.unlink":["Gỡ liên kết","解除关联"],"btn.schedule":["Lịch hẹn","预约"],"btn.month_calendar":["Lịch tháng","月历"],"btn.acknowledge":["Tiếp nhận","受理"],"wo_status.DRAFT":["Nháp","草稿","grey"],"wo_status.ASSIGNED":["Đã giao việc","已分配","navy"],"wo_status.IN_PROGRESS":["Đang làm","进行中","navy"],"wo_status.PENDING_ACCEPTANCE":["Chờ nghiệm thu","待验收","amber"],"wo_status.COMPLETED":["Hoàn thành","已完成","green"],"wo_status.CANCELLED":["Đã hủy","已取消","grey"],"repair_status.REPORTED":["Mới báo","新报告","amber"],"repair_status.ASSIGNED":["Đã phân công","已分配","navy"],"repair_status.IN_PROGRESS":["Đang xử lý","处理中","navy"],"repair_status.PENDING_ACCEPTANCE":["Chờ nghiệm thu","待验收","amber"],"repair_status.COMPLETED":["Hoàn thành","已完成","green"],"repair_status.CANCELLED":["Đã hủy","已取消","grey"],"mreq_status.DRAFT":["Nháp","草稿","grey"],"mreq_status.PENDING_APPROVAL":["Chờ duyệt","待审核","amber"],"mreq_status.APPROVED":["Đã duyệt","已批准","green"],"mreq_status.REJECTED":["Bị từ chối","已驳回","red"],"mreq_status.CANCELLED":["Đã hủy","已取消","grey"],"mreq_status.PENDING_WAREHOUSE":["Chờ chuyển kho","待转仓库","amber"],"mreq_status.SENT":["Đã gửi kho","已发送仓库","navy"],"mreq_status.PARTIALLY_ISSUED":["Đã xuất một phần","部分出库","amber"],"mreq_status.FULFILLED":["Đã xuất đủ","已全部出库","green"],"cert_status.DRAFT":["Nháp","草稿","grey"],"cert_status.PENDING_APPROVAL":["Chờ duyệt","待审核","amber"],"cert_status.APPROVED":["Đã duyệt","已批准","green"],"cert_status.REJECTED":["Bị từ chối","已驳回","red"],"cert_status.SUPERSEDED":["Đã thay thế","已被取代","grey"],"cert_status.REVOKED":["Đã thu hồi","已撤销","red"],"renewal_status.DRAFT":["Nháp","草稿","grey"],"renewal_status.PENDING_APPROVAL":["Chờ duyệt","待审核","amber"],"renewal_status.APPROVED":["Đã duyệt","已批准","green"],"renewal_status.REJECTED":["Bị từ chối","已驳回","red"],"stock_status.DRAFT":["Nháp","草稿","grey"],"stock_status.PENDING_APPROVAL":["Chờ duyệt","待审核","amber"],"stock_status.APPROVED":["Đã duyệt","已批准","green"],"stock_status.CANCELLED":["Đã hủy","已取消","grey"],"stock_status.POSTED":["Đã chốt","已过账","green"],"usage_status.DRAFT":["Nháp","草稿","grey"],"usage_status.PENDING_CONFIRMATION":["Chờ xác nhận","待确认","amber"],"usage_status.CONFIRMED":["Đã xác nhận","已确认","green"],"reset_status.PREVIEWED":["Đã xem trước","已预览","grey"],"reset_status.LOCKED":["Đã khóa vận hành","已锁定","amber"],"reset_status.BACKING_UP":["Đang sao lưu","正在备份","navy"],"reset_status.RESETTING":["Đang xóa","正在清除","navy"],"reset_status.VERIFYING":["Đang kiểm tra","正在校验","navy"],"reset_status.COMPLETED":["Hoàn tất","已完成","green"],"reset_status.FAILED_NEEDS_RECOVERY":["Lỗi, cần xử lý tiếp","失败，需恢复","red"],"import_status.VALIDATING":["Đang kiểm tra","校验中","navy"],"import_status.NEEDS_FIX":["Cần sửa lỗi","需修正","red"],"import_status.READY":["Sẵn sàng nhập","可导入","green"],"import_status.PENDING_APPROVAL":["Chờ duyệt","待审核","amber"],"import_status.COMMITTING":["Đang ghi","写入中","navy"],"import_status.COMMITTED":["Đã nhập","已导入","green"],"import_status.PARTIAL":["Nhập dở","部分导入","amber"],"import_status.FAILED":["Thất bại","失败","red"],"op_state.QUEUED":["Chờ gửi","待同步","amber"],"op_state.PREPARED":["Đang gửi","同步中","navy"],"op_state.SENDING":["Đang gửi","同步中","navy"],"op_state.COMMITTED":["Đã lưu máy chủ","已同步","green"],"op_state.FAILED":["Lỗi gửi","同步失败","red"],"op_state.REJECTED":["Bị từ chối","被拒","red"],"op_state.CONFLICT":["Xung đột","冲突","red"],"op_state.UNKNOWN":["Chưa rõ kết quả","结果未知","amber"],"op_state.UNKNOWN_RESULT":["Chưa rõ kết quả","结果未知","amber"],"email_status.QUEUED":["Chờ gửi","待发送","amber"],"email_status.SENDING":["Đang gửi","发送中","navy"],"email_status.SENT":["Đã gửi","已发送","green"],"email_status.FAILED":["Gửi lỗi","发送失败","red"],"email_status.UNKNOWN":["Chưa rõ kết quả","结果未知","amber"],"email_status.SKIPPED":["Bỏ qua","已跳过","grey"],"contract_lifecycle.ACTIVE":["Đang hiệu lực","生效中","green"],"contract_lifecycle.SUPERSEDED":["Đã thay thế","已被取代","grey"],"contract_lifecycle.ENDED":["Đã kết thúc","已终止","grey"],"contract_lifecycle.NOT_RENEWED":["Không gia hạn","不续约","grey"],"alert_state.OPEN":["Đang nhắc","提醒中","amber"],"alert_state.ACKNOWLEDGED":["Đã tiếp nhận","已受理","navy"],"alert_state.RESOLVED":["Đã đóng","已关闭","grey"],"user_status.ACTIVE":["Đang hoạt động","正常","green"],"user_status.LOCKED":["Tạm khóa","已锁定","red"],"user_status.MUST_CHANGE_PIN":["Phải đổi PIN","需修改PIN","amber"],"user_status.DISABLED":["Ngừng dùng","已停用","grey"],"backup_status.VERIFIED":["Đã kiểm chứng","已校验","green"],"backup_status.INCONSISTENT":["Không nhất quán","不一致","amber"],"backup_status.FAILED":["Thất bại","失败","red"],"backup_status.RUNNING":["Đang sao lưu","备份中","amber"],"doc_kind.PHOTO_EQUIPMENT":["Ảnh thiết bị","设备照片"],"doc_kind.PHOTO_MATERIAL":["Ảnh vật tư","物料照片"],"doc_kind.PHOTO_SITE":["Ảnh hiện trường","现场照片"],"doc_kind.PHOTO_METER":["Ảnh đồng hồ","表计照片"],"doc_kind.CERTIFICATE":["Chứng nhận, biên bản kiểm định","检验证书、报告"],"doc_kind.DRAWING":["Bản vẽ, sơ đồ","图纸、图表"],"doc_kind.MANUAL":["Hướng dẫn, datasheet","说明书、技术资料"],"doc_kind.IMPORT_FILE":["File Excel đã nhập","已导入文件"],"doc_kind.OTHER":["Khác","其他"],"doc_kind.CONTRACT":["Hợp đồng, phụ lục","合同、附件"],"doc_kind.INVOICE":["Hóa đơn, biên bản dịch vụ","发票、服务记录"],"doc_kind.REPORT_FILE":["File báo cáo đã tạo","已生成报表"],"doc_scope.LINK_VIEW":["Ai có link: xem","知道链接者可查看","grey"],"doc_scope.MODULE_VIEW":["Riêng tư","私有","navy"],"doc_scope.COST_VIEW":["Riêng tư, có giá","私有（含价格）","navy"],"sharing.NOT_SHARED":["Chưa chia sẻ","未共享","grey"],"sharing.LINK_SHARED":["Đã chia sẻ link","已共享链接","green"],"sharing.PENDING":["Đang chia sẻ","共享中","amber"],"sharing.FAILED":["Chia sẻ lỗi","共享失败","red"],"sharing.REVOKED":["Đã đưa về riêng tư","已设为私有","grey"],"due_state.NOT_DUE":["Còn hạn","未到期","green"],"due_state.DUE_SOON":["Sắp tới hạn — Còn {N} ngày","即将到期 — 剩余 {N} 天","amber"],"due_state.DUE_TODAY":["Đến hạn hôm nay","今日到期","red"],"due_state.OVERDUE":["Quá hạn {N} ngày","已逾期 {N} 天","red"],"due_state.MISSING":["Chưa đủ hồ sơ","资料不全","amber"],"due_filter.ALL":["Tất cả","全部"],"due_filter.DUE_SOON":["Sắp tới hạn","即将到期"],"due_filter.DUE_TODAY":["Đến hạn hôm nay","今日到期"],"due_filter.OVERDUE":["Quá hạn","已逾期"],"due_filter.MISSING":["Chưa đủ hồ sơ","资料不全"],"record_status.INCOMPLETE":["Chưa đủ hồ sơ","资料不全","amber"],"record_status.VALID":["Hợp lệ","有效","green"],"record_status.FAILED":["Không đạt","不合格","red"],"record_status.REVOKED":["Đã thu hồi","已撤销","red"],"record_status.SUSPENDED":["Tạm ngưng","暂停","grey"],"inspection_result.PASS":["Đạt","合格","green"],"inspection_result.FAIL":["Không đạt","不合格","red"],"inspection_result.CONDITIONAL_PASS":["Đạt có điều kiện","有条件合格","amber"],"equipment_status.RUNNING":["Đang hoạt động","运行中","green"],"equipment_status.STOPPED":["Dừng máy","停机","red"],"equipment_status.UNDER_REPAIR":["Đang sửa","维修中","amber"],"equipment_status.UNDER_MAINTENANCE":["Đang bảo trì","保养中","amber"],"equipment_status.STANDBY":["Dự phòng","备用","grey"],"equipment_status.RETIRED":["Ngừng sử dụng","停用","grey"],"criticality.HIGH":["Quan trọng cao","关键"],"criticality.MEDIUM":["Quan trọng","重要"],"criticality.LOW":["Thường","一般"],"severity.HIGH":["Cao","高","red"],"severity.MEDIUM":["Trung bình","中","amber"],"severity.LOW":["Thấp","低","grey"],"priority.URGENT":["Khẩn","紧急","red"],"priority.HIGH":["Cao","高","amber"],"priority.NORMAL":["Thường","普通","grey"],"priority.LOW":["Thấp","低","grey"],"check_result.PENDING":["Chưa có kết quả","未填写","grey"],"check_result.PASS":["Đạt","合格","green"],"check_result.FAIL":["Không đạt","不合格","red"],"check_result.NA":["Không áp dụng","不适用","grey"],"overall_result.PASS":["Đạt","合格","green"],"overall_result.FAIL":["Không đạt","不合格","red"],"result_type.PASS_FAIL":["Đạt/Không đạt","合格/不合格"],"result_type.NUMBER":["Số đo","测量值"],"result_type.TEXT":["Ghi nhận","记录"],"acceptance_result.PASS":["Nghiệm thu đạt","验收通过","green"],"acceptance_result.FAIL":["Nghiệm thu không đạt","验收不通过","red"],"material_group.EQUIPMENT_PART":["Linh kiện thiết bị","设备配件"],"material_group.ELECTRICAL":["Vật tư điện","电气物料"],"material_group.WATER":["Vật tư nước","给排水物料"],"material_group.CONSUMABLE":["Vật tư tiêu hao","耗材"],"material_group.TOOL":["Dụng cụ","工具"],"material_group.PPE":["Bảo hộ","劳保用品"],"item_kind.COMPONENT":["Linh kiện","配件"],"item_kind.CONSUMABLE":["Tiêu hao","消耗品"],"item_kind.REUSABLE_TOOL":["Dụng cụ dùng lại","可重复使用工具"],"equipment_component.TRUE":["Gắn máy được","可关联设备","navy"],"equipment_component.FALSE":["Không gắn máy","不关联设备","grey"],"material_active.TRUE":["Đang dùng","在用","green"],"material_active.FALSE":["Ngừng dùng","停用","grey"],"utility_type.ELECTRICITY":["Điện","电"],"utility_type.WATER":["Nước","水"],"cost_source.MANUAL_REFERENCE":["Tham khảo","参考"],"cost_source.WAREHOUSE_POSTED":["Kho đã chốt","仓库已过账"],"part.unconfirmed":["Chưa xác nhận","未确认","amber"],"part.confirmed":["Đã xác nhận","已确认","green"],"part_event.LINKED":["Gắn linh kiện","关联配件"],"part_event.EDITED":["Sửa liên kết","修改关联"],"part_event.UNLINKED":["Gỡ liên kết","解除关联"],"part_event.APPROVED":["Xác nhận liên kết","确认关联"],"part_event.REMOVED":["Tháo","拆下"],"part_event.INSTALLED":["Lắp","安装"],"part_event.REPLACED":["Thay","更换"],"sync.offline":["Ngoại tuyến","离线"],"sync.online":["Trực tuyến","在线"],"sync.local_saved":["Đã lưu trên máy","已保存在本机"],"sync.queued":["Chờ gửi","待同步"],"sync.queued_count":["{N} mục chờ gửi","待同步数据 {N} 条"],"sync.sending":["Đang gửi","同步中"],"sync.committed":["Đã lưu máy chủ","已同步"],"sync.conflict":["Xung đột, cần xử lý","冲突，需处理"],"sync.failed":["Lỗi gửi","同步失败"],"sync.last":["Lần đồng bộ cuối","上次同步"],"sync.offline_data":["Dữ liệu ngoại tuyến, cập nhật lúc {T}","离线数据，更新于 {T}"],"sync.need_network":["Cần kết nối mạng","需要网络连接"],"sync.dataset_reset":["Dữ liệu đã được đặt lại, cần tải lại","数据已重置，需重新加载"],"sync.safari_tab":["Đang chạy trong Safari: nháp có thể bị xóa sau 7 ngày không mở","在Safari中运行：7天未打开草稿可能被清除"],"sync.syncing":["Đang đồng bộ…","正在同步…"],"sync.done":["Đã đồng bộ","同步完成"],"sync.never":["Chưa đồng bộ","尚未同步"],"draft.rejected":["Nháp bị từ chối","被拒草稿"],"draft.old_epoch":["Nháp thế hệ dữ liệu cũ","旧数据草稿"],"draft.other_user":["Máy còn {N} nháp của người dùng khác","本机有 {N} 份其他用户的草稿"],"draft.title":["Nháp chờ đồng bộ","待同步草稿"],"draft.empty":["Không có mục nào","没有项目"],"draft.auto_delete":["Tự xóa sau {N} ngày","{N} 天后自动删除"],"draft.delete_confirm":["Xóa hẳn nháp này? Không lấy lại được.","确定删除此草稿？删除后无法恢复。"],"draft.delete_all_confirm":["Xóa hẳn {N} nháp chưa gửi? Không lấy lại được.","确定删除 {N} 份未同步草稿？删除后无法恢复。"],"draft.photos":["{N} ảnh","{N} 张照片"],"draft.created":["Tạo lúc","创建时间"],"draft.error_code":["Mã lỗi","错误代码"],"draft.size":["Dung lượng","大小"],"action.inspection.submit":["Nộp chứng nhận kiểm định","提交检验证书"],"action.contract.service.record":["Ghi dịch vụ hợp đồng","记录合同服务"],"action.doc.upload":["Tải tài liệu lên","上传文件"],"action.equipment.edit":["Sửa thiết bị","编辑设备"],"action.material.edit":["Sửa vật tư","编辑物料"],"conflict.title":["Xử lý xung đột","处理冲突"],"conflict.mine":["Bản của tôi","我的版本"],"conflict.server":["Bản máy chủ","服务器版本"],"conflict.diff":["Khác nhau","不同"],"conflict.by":["Người sửa","修改人"],"conflict.at":["Lúc","时间"],"conflict.use_server_confirm":["Bỏ thay đổi của bạn và dùng bản máy chủ? Có thể xuất dự phòng trước.","放弃您的修改并采用服务器版本？可先导出备份。"],"conflict.help":["Có người đã sửa hồ sơ này trước bạn. Không có nút ghi đè: chọn dùng bản máy chủ hoặc sửa tiếp trên bản máy chủ.","此记录已被他人先行修改。不提供覆盖：请采用服务器版本，或基于服务器版本继续修改。"],"auth.offline_unlock":["Mở khóa ngoại tuyến","离线解锁"],"auth.failed":["Mã nhân viên hoặc PIN không đúng","工号或PIN错误"],"auth.locked":["Tạm khóa do nhập sai PIN nhiều lần, thử lại sau {N} phút","因多次输错PIN已暂时锁定，请 {N} 分钟后重试"],"auth.paused":["Đăng nhập đang tạm dừng, thử lại sau {N} phút","登录已暂停，请 {N} 分钟后重试"],"auth.attempts_left":["Còn {N} lần thử","还可尝试 {N} 次"],"auth.temp_pin":["Bạn đang dùng PIN tạm, hãy đặt PIN mới","您正在使用临时PIN，请设置新PIN"],"auth.reauth":["Nhập lại PIN để tiếp tục","请重新输入PIN以继续"],"auth.revoked":["Phiên đã bị thu hồi hoặc quyền đã thay đổi","会话已撤销或权限已变更"],"auth.session_warn":["Phiên sắp hết hạn — {D}","会话即将到期 — {D}"],"auth.shared_device":["Máy dùng chung","公用设备"],"auth.switch_user":["Đăng nhập người khác","切换用户"],"auth.open_with_pin":["Mở bằng PIN","用PIN打开"],"auth.expired_offline":["Phiên đã hết hạn: chỉ xem nháp và xuất dự phòng","会话已过期：只能查看草稿和导出备份"],"auth.server_slow":["Máy chủ đang phản hồi chậm…","服务器响应较慢…"],"auth.need_online_login":["Cần đăng nhập trực tuyến","需在线登录"],"auth.others_relogin":["Các thiết bị khác phải đăng nhập lại","其他设备需重新登录"],"auth.logout_all_confirm":["Mọi phiên, kể cả máy đang dùng, sẽ hết hiệu lực. Dùng khi mất điện thoại.","所有会话（包括本机）将失效。用于手机丢失时。"],"auth.logout_has_drafts":["Còn {N} mục chưa gửi lên máy chủ. Chọn cách xử lý trước khi đăng xuất.","仍有 {N} 条未同步到服务器。退出前请选择处理方式。"],"level.1":["Tra cứu","查询"],"level.2":["Nhân viên","员工"],"level.3":["Trưởng bộ phận","部门主管"],"level.4":["Quản trị","管理员"],"level.owner":["Chủ hệ thống","系统所有者"],"subrole.KY_THUAT":["Kỹ thuật viên","技术员"],"subrole.DOC_DIEN_NUOC":["Đọc điện nước","抄表员"],"subrole.HD_KD":["Quản lý hợp đồng/kiểm định","合同/检验管理"],"subrole.THU_KHO":["Thủ kho","仓管员"],"subrole.BAO_SU_CO":["Báo sự cố","报修员"],"account.profile":["Hồ sơ","个人资料"],"account.display_name":["Tên hiển thị","显示名称"],"account.level":["Cấp","级别"],"account.subroles":["Vai trò","岗位"],"account.no_subrole":["Chưa được giao vai trò","未分配岗位"],"account.sync":["Đồng bộ","同步"],"account.security":["Bảo mật","安全"],"account.sessions":["Phiên đăng nhập","登录会话"],"account.this_device":["Máy này","本机"],"account.issued":["Đăng nhập lúc","登录时间"],"account.last_seen":["Hoạt động gần nhất","最近活动"],"account.expires":["Hết hạn","到期"],"account.guide":["Hướng dẫn","使用指南"],"account.add_home":["Thêm app vào Màn hình chính: trong Safari bấm Chia sẻ → Thêm vào MH chính","将应用添加到主屏幕：在Safari中点击分享→添加到主屏幕"],"account.info":["Thông tin","信息"],"account.app_version":["Phiên bản app","应用版本"],"account.api_version":["Phiên bản API","API版本"],"account.server_version":["Phiên bản máy chủ","服务器版本"],"account.admin":["Quản trị","管理"],"account.poc":["Bàn thử PoC","PoC测试台"],"admin.users":["Người dùng và PIN tạm","用户与临时PIN"],"admin.permissions":["Phân quyền","权限"],"admin.catalog":["Danh mục chung","基础数据"],"admin.gmail":["Người nhận Gmail và nhật ký gửi","邮件收件人与发送记录"],"admin.backup":["Sao lưu","备份"],"admin.audit":["Nhật ký thao tác","操作日志"],"admin.status":["Trạng thái hệ thống","系统状态"],"admin.system_data":["Dữ liệu hệ thống","系统数据"],"home.week":["Lịch tuần này","本周日程"],"home.deadlines":["Thời hạn quan trọng","重要期限"],"home.due_soon":["Sắp tới hạn","即将到期"],"home.overdue":["Quá hạn","已逾期"],"home.none":["Không có","无"],"home.today_work":["Công việc hôm nay","今日工作"],"home.no_work_today":["Không có việc hôm nay","今天没有任务"],"home.wo_coming":["Phiếu bảo trì/sửa chữa","保养/维修工单"],"home.item_inspection":["Kiểm định","检验"],"home.item_contract":["Hợp đồng","合同"],"home.item_service":["Dịch vụ HĐ","合同服务"],"home.records":["{N} hồ sơ","{N} 条"],"col.type":["Loại","类型"],"col.code":["Mã","编号"],"col.content":["Nội dung","内容"],"col.equipment_location":["Thiết bị/Khu vực","设备/区域"],"col.due":["Hạn","期限"],"col.status":["Trạng thái","状态"],"col.owner":["Phụ trách","负责人"],"col.name":["Tên","名称"],"col.actions":["Thao tác","操作"],"weekday.1":["T2","周一"],"weekday.2":["T3","周二"],"weekday.3":["T4","周三"],"weekday.4":["T5","周四"],"weekday.5":["T6","周五"],"weekday.6":["T7","周六"],"weekday.7":["CN","周日"],"screen.equipment_list":["Thiết bị","设备"],"screen.equipment":["Hồ sơ thiết bị","设备档案"],"screen.equipment_new":["Thêm thiết bị","新增设备"],"screen.equipment_edit":["Sửa thiết bị","编辑设备"],"screen.material":["Hồ sơ vật tư","物料档案"],"screen.material_new":["Thêm vật tư","新增物料"],"screen.material_edit":["Sửa vật tư","编辑物料"],"screen.spec_edit":["Thông số","参数"],"screen.part_link":["Gắn linh kiện","关联配件"],"screen.qr":["Mã QR","二维码"],"screen.labels":["In tem QR","打印二维码标签"],"field.valid_from":["Hiệu lực từ","有效期自"],"field.valid_to":["Hiệu lực đến","有效期至"],"field.end_date":["Ngày hết hạn","到期日"],"field.renewal_notice_date":["Hạn báo gia hạn","续约通知期限"],"field.not_set":["Chưa có","暂无"],"field.equipment_code":["Mã thiết bị","设备编号"],"field.code_auto":["Để trống để máy chủ tự cấp mã","留空则由服务器自动编号"],"field.name":["Tên","名称"],"field.name_vi":["Tên tiếng Việt","越南语名称"],"field.name_zh":["Tên tiếng Trung","中文名称"],"field.one_lang":["Chỉ cần nhập một thứ tiếng, máy chủ tự dịch bên kia","只需填写一种语言，服务器自动翻译另一种"],"field.category":["Loại thiết bị","设备类别"],"field.location":["Khu vực","区域"],"field.vendor":["Nhà cung cấp","供应商"],"field.manufacturer":["Hãng sản xuất","制造商"],"field.model":["Model","型号"],"field.serial":["Số serial","序列号"],"field.manufacture_year":["Năm sản xuất","制造年份"],"field.install_date":["Ngày lắp đặt","安装日期"],"field.warranty_end":["Hết bảo hành","保修到期"],"field.status":["Tình trạng","状态"],"field.criticality":["Mức quan trọng","重要程度"],"field.owner":["Người phụ trách","负责人"],"field.reason":["Lý do","原因"],"field.reason_required":["Bắt buộc nhập lý do","必须填写原因"],"field.choose":["— Chọn —","— 请选择 —"],"field.none":["— Không —","— 无 —"],"field.search_placeholder":["Tìm mã, tên, model, serial","搜索编号、名称、型号、序列号"],"field.include_retired":["Gồm thiết bị ngừng sử dụng","含停用设备"],"field.total":["Tổng {N}","共 {N} 条"],"field.new_status":["Tình trạng khi dùng lại","恢复后的状态"],"field.qr_key":["Mã tem","标签码"],"field.document_title":["Tên tài liệu","文件名称"],"field.document_kind":["Loại tài liệu","文件类型"],"field.document_date":["Ngày tài liệu","文件日期"],"field.file_version":["Phiên bản","版本"],"field.external_url":["Liên kết","链接"],"field.uploaded_by":["Người tải lên","上传人"],"field.material_code":["Mã vật tư","物料编号"],"field.part_number":["Part number","零件号"],"field.specification":["Thông số","规格"],"field.specification_vi":["Thông số tiếng Việt","越南语规格"],"field.specification_zh":["Thông số tiếng Trung","中文规格"],"field.base_unit":["Đơn vị cơ sở","基本单位"],"field.lead_time_days":["Thời gian đặt hàng (ngày)","订货周期（天）"],"field.group":["Nhóm","分组"],"field.item_kind":["Loại","类型"],"field.is_component":["Gắn máy được","可关联设备"],"field.installed_qty":["Lượng lắp","安装数量"],"field.unit":["Đơn vị","单位"],"field.function":["Chức năng","功能"],"field.function_vi":["Chức năng tiếng Việt","越南语功能"],"field.function_zh":["Chức năng tiếng Trung","中文功能"],"field.position":["Vị trí lắp","安装位置"],"field.position_vi":["Vị trí lắp tiếng Việt","越南语安装位置"],"field.position_zh":["Vị trí lắp tiếng Trung","中文安装位置"],"field.alternate":["Thay thế được duyệt","已批准替代件"],"field.compatibility_note":["Ghi chú tương thích","兼容性说明"],"field.effective_from":["Từ ngày","生效日期"],"field.material":["Vật tư","物料"],"field.spec_key":["Thông số","参数"],"field.spec_value":["Giá trị","数值"],"field.spec_text":["Giá trị dạng chữ","文字值"],"field.sort_order":["Thứ tự","排序"],"field.used_on":["Dùng cho thiết bị","适用设备"],"field.stock":["Tồn kho","库存"],"field.usage_history":["Lịch sử dùng","使用记录"],"field.photos":["Ảnh","照片"],"field.event":["Sự kiện","事件"],"field.date":["Ngày","日期"],"field.actor":["Người làm","执行人"],"field.note":["Ghi chú","备注"],"field.inspection_type":["Loại kiểm định","检验类型"],"field.certificate_number":["Số chứng nhận","证书编号"],"field.inspection_date":["Ngày kiểm định","检验日期"],"field.result":["Kết quả","结果"],"field.contract":["Hợp đồng","合同"],"field.service":["Dịch vụ","服务"],"field.required":["Bắt buộc nhập","必填"],"field.invalid":["Giá trị không hợp lệ","值无效"],"field.invalid_date":["Ngày không hợp lệ","日期无效"],"field.year_invalid":["Năm phải từ 1900 đến 2100","年份须在1900至2100之间"],"field.selected":["Đã chọn {N}","已选 {N} 项"],"field.custom_spec":["Thông số khác (danh mục)","其他参数（目录）"],"field.no_records":["Không có hồ sơ phù hợp","没有符合条件的记录"],"field.loading":["Đang tải…","加载中…"],"form.draft_restored":["Đã khôi phục nội dung chưa lưu trên máy","已恢复本机未保存的内容"],"form.discard_draft":["Bỏ nội dung chưa lưu","放弃未保存内容"],"form.saved":["Đã lưu máy chủ","已同步"],"form.my_value":["Bản của tôi","我的版本"],"form.server_loaded":["Đã nạp bản máy chủ. Chép lại thay đổi của bạn rồi Lưu","已载入服务器版本，请重新填写您的修改后保存"],"field.number_ambiguous":["Đã hiểu là {A}. Nếu là số hàng nghìn, gõ liền không dấu (vd 12350)","已识别为 {A}；如为千位数，请连续输入（如 12350）"],"field.number_bad_sep":["Không dùng dấu chấm/phẩy để tách hàng nghìn; gõ 1234567","请勿使用千位分隔符，请输入 1234567"],"field.unit_not_allowed":["Đơn vị không thuộc danh sách cho phép","单位不在允许范围内"],"spec.voltage":["Điện áp","电压"],"spec.rated_current":["Dòng điện định mức","额定电流"],"spec.electrical_power":["Công suất điện","电功率"],"spec.frequency":["Tần số","频率"],"spec.working_pressure":["Áp suất làm việc","工作压力"],"spec.flow_rate":["Lưu lượng","流量"],"spec.speed":["Tốc độ","转速"],"spec.dimensions":["Kích thước (D × R × C)","外形尺寸（长×宽×高）"],"spec.weight":["Trọng lượng","重量"],"spec.throughput":["Năng suất","产能"],"spec.rated_capacity_kva":["Dung lượng định mức (MBA)","额定容量"],"lookup_group.EQUIPMENT_CATEGORY":["Loại thiết bị","设备类别"],"lookup_group.UNIT":["Đơn vị tính","计量单位"],"lookup_group.SPEC_KEY":["Mẫu thông số","参数模板"],"lookup_group.CAUSE":["Nguyên nhân","原因"],"eq.summary":["Thông tin chung","基本信息"],"eq.archive_title":["Ngừng sử dụng thiết bị","停用设备"],"eq.archive_help":["Thiết bị chuyển sang Ngừng sử dụng và ẩn khỏi danh sách; tem QR báo hồ sơ đã ngừng; ảnh đang chia sẻ link được đưa về riêng tư","设备将标为停用并从列表隐藏；二维码提示记录已停用；已共享链接的照片将设为私有"],"eq.unarchive_title":["Dùng lại thiết bị","恢复使用设备"],"eq.no_specs":["Chưa có thông số","暂无参数"],"eq.add_spec":["Thêm thông số","新增参数"],"eq.remove_spec_confirm":["Bỏ dòng thông số này?","移除此参数？"],"eq.upload_photo":["Chụp/chọn ảnh thiết bị","拍摄/选择设备照片"],"eq.upload_file":["Tải tệp lên (PDF, ảnh)","上传文件（PDF、图片）"],"eq.archived_banner":["Thiết bị đã ngừng sử dụng","设备已停用"],"doc.archive_confirm":["Gỡ tài liệu này khỏi hồ sơ? Tệp trên Drive không bị xóa.","从档案中移除此文件？Drive中的文件不会被删除。"],"doc.set_private_confirm":["Đưa ảnh về riêng tư? Không có chiều ngược lại.","将照片设为私有？此操作不可撤销。"],"doc.link_open":["Mở liên kết","打开链接"],"doc.queued_offline":["Đã lưu trên máy, sẽ gửi khi có mạng","已保存在本机，联网后同步"],"mat.list":["Kho vật tư","物料库"],"mat.search_placeholder":["Tìm mã, tên, part number, model","搜索编号、名称、零件号、型号"],"mat.include_inactive":["Gồm vật tư ngừng dùng","含停用物料"],"mat.archive_title":["Ngừng dùng vật tư","停用物料"],"mat.archive_help":["Vật tư chuyển sang Ngừng dùng; máy đang gắn vẫn giữ liên kết và lịch sử","物料标为停用；已关联设备保留关联和历史"],"mat.reactivate":["Dùng lại vật tư","恢复使用物料"],"mat.no_parts":["Chưa gắn linh kiện","暂无配件"],"mat.pick":["Chọn vật tư gắn máy được","选择可关联设备的物料"],"mat.unlink_title":["Gỡ liên kết linh kiện","解除配件关联"],"mat.unlink_help":["Kết thúc liên kết với máy này; vật tư vẫn còn trong danh mục","结束与此设备的关联；物料仍保留在目录中"],"mat.approve_title":["Xác nhận liên kết","确认关联"],"mat.not_used":["Chưa dùng cho thiết bị nào","尚未用于任何设备"],"mat.tab_hint":["Thêm danh mục hoặc gắn linh kiện không tự trừ tồn kho","新增目录或关联配件不会自动扣减库存"],"in.list":["Kiểm định","检验"],"in.requirement":["Hồ sơ yêu cầu kiểm định","检验要求档案"],"in.new_requirement":["Thêm yêu cầu kiểm định","新增检验要求"],"in.edit_requirement":["Sửa yêu cầu kiểm định","编辑检验要求"],"in.types":["Loại kiểm định","检验类型"],"in.type_new":["Thêm loại kiểm định","新增检验类型"],"in.submit":["Nộp chứng nhận mới","提交新证书"],"in.record":["Lần kiểm định","检验记录"],"in.current":["Chứng nhận hiện hành","现行证书"],"in.no_current":["Chưa có chứng nhận được duyệt","暂无已批准证书"],"in.pending":["Chờ duyệt","待审核"],"in.target":["Áp dụng cho","适用对象"],"in.by_equipment":["Theo thiết bị","按设备"],"in.by_location":["Theo khu vực","按区域"],"in.obligation":["Nghĩa vụ","义务"],"in.operational":["Vận hành","运行状态"],"in.revoke":["Thu hồi chứng nhận","撤销证书"],"in.suspend":["Tạm ngưng","暂停"],"in.resume":["Bỏ tạm ngưng","取消暂停"],"in.revoke_help":["Chứng nhận hiện hành chuyển sang Đã thu hồi; hạn hiện hành giữ nguyên","现行证书将标为已撤销；现行期限保持不变"],"in.approve_help":["Duyệt lần Đạt cập nhật hạn hiện hành; lần Không đạt giữ hạn cũ","批准合格记录将更新现行期限；不合格记录保留原期限"],"in.reject_reason":["Lý do từ chối","驳回原因"],"in.reference_basis":["Căn cứ","依据"],"in.interval":["Chu kỳ tham khảo (tháng)","参考周期（月）"],"in.required_docs":["Hồ sơ cần có","所需资料"],"in.no_mt":["Nội dung pháp lý: không dịch tự động, nhập thủ công thứ tiếng còn lại","法规内容：不自动翻译，请手动填写另一种语言"],"in.cert_photos":["Ảnh/tệp chứng nhận (riêng tư)","证书照片/文件（私有）"],"in.equipment_photo":["Ảnh thiết bị (xem bằng link)","设备照片（链接查看）"],"in.attachments":["Tệp đính kèm","附件"],"in.restriction":["Hạn chế","限制条件"],"in.cost":["Chi phí","费用"],"in.next_due":["Hạn tiếp theo (nếu có)","下次期限（如有）"],"in.month":["Tháng","月份"],"in.no_requirements":["Chưa có yêu cầu kiểm định","暂无检验要求"],"obligation.REQUIRED":["Bắt buộc","强制"],"obligation.VOLUNTARY":["Tự nguyện","自愿"],"operational.ACTIVE":["Đang áp dụng","执行中","green"],"operational.SUSPENDED":["Tạm ngưng","暂停","grey"],"due_filter.NOT_DUE":["Còn hạn","未到期"],"co.list":["Hợp đồng thuê ngoài","外包合同"],"co.detail":["Hồ sơ hợp đồng","合同档案"],"co.new":["Thêm hợp đồng","新增合同"],"co.edit":["Sửa hợp đồng","编辑合同"],"co.edit_terms":["Sửa hạn/giá trị","修改期限/金额"],"co.edit_terms_help":["Chỉ để chữa sai nhập liệu của phiên hiện hành; bắt nhập lý do, cần PIN","仅用于更正现行版本的录入错误；须填写原因并输入PIN"],"co.renewal":["Gia hạn","续约"],"co.renewal_new":["Tạo dự thảo gia hạn","创建续约草稿"],"co.renewal_draft":["Dự thảo gia hạn","续约草稿"],"co.renewal_help":["Dự thảo không đổi hạn hiện hành; chỉ sau khi duyệt mới thành phiên hiện hành","草稿不改变现行期限；批准后才成为现行版本"],"co.close":["Kết thúc hợp đồng","终止合同"],"co.close_help":["Dừng nhắc hạn và không gửi Gmail cho hợp đồng này","停止该合同的到期提醒和邮件"],"co.archive":["Lưu trữ hợp đồng","归档合同"],"co.number":["Số hợp đồng","合同编号"],"co.title":["Dịch vụ bảo dưỡng","保养服务"],"co.start_date":["Ngày bắt đầu","开始日期"],"co.value":["Giá trị","金额"],"co.currency":["Tiền tệ","币种"],"co.scope":["Phạm vi","范围"],"co.revision":["Phiên","版本"],"co.equipment":["Thiết bị trong phạm vi","合同范围内设备"],"co.services":["Dịch vụ","服务"],"co.add_equipment":["Thêm thiết bị","添加设备"],"co.interval":["Chu kỳ","周期"],"co.next_service":["Ngày dịch vụ tới","下次服务日期"],"co.service_due":["Ngày dịch vụ","服务日期"],"co.performed_at":["Ngày làm","执行日期"],"co.result":["Kết quả","结果"],"co.vendor_contact":["Người liên hệ bên cung cấp","供应商联系人"],"co.record_service":["Ghi dịch vụ","记录服务"],"co.accept_service":["Nghiệm thu dịch vụ","验收服务"],"co.add_service":["Thêm lịch dịch vụ","新增服务计划"],"co.days_left":["Còn lại","剩余"],"co.history":["Các phiên","历次版本"],"co.reference_marker":["đang nhắc","本次提醒"],"co.no_contracts":["Chưa có hợp đồng","暂无合同"],"co.lifecycle_filter":["Hiệu lực","效力"],"co.close_kind":["Hình thức","方式"],"service_status.PLANNED":["Chờ thực hiện","待执行","amber"],"service_status.DONE":["Đã làm, chờ nghiệm thu","已执行，待验收","navy"],"service_status.ACCEPTED":["Đã nghiệm thu","已验收","green"],"interval.DAY":["ngày","天"],"interval.WEEK":["tuần","周"],"interval.MONTH":["tháng","月"],"interval.YEAR":["năm","年"],"history.part_events":["Linh kiện","配件"],"history.contracts":["Hợp đồng","合同"],"history.inspections":["Kiểm định","检验"],"history.created":["Tạo hồ sơ","创建档案"],"history.empty":["Chưa có lịch sử","暂无历史记录"],"tag.machine_translated":["dịch máy","机器翻译"],"tag.no_translation":["Chưa có bản dịch","暂无译文"],"tag.warehouse_not_connected":["Chưa kết nối kho","尚未连接仓库"],"tag.coming_soon":["Sắp có","即将推出"],"tag.coming_soon_hint":["Chức năng sẽ có ở đợt sau","该功能将在后续版本推出"],"tag.pending_code":["Chờ cấp mã","待分配编号"],"tag.sample_data":["Dữ liệu mẫu","示例数据"],"tag.env_test":["THỬ","测试"],"tag.archived":["Đã lưu trữ","已归档","grey"],"feature.not_enabled":["Chức năng chưa bật","功能尚未启用"],"sys.maintenance":["Hệ thống đang bảo trì","系统维护中"],"cost.hidden":["Không có quyền xem giá","无权查看价格"],"qr.foreign":["Mã này không thuộc M&E","此码不属于M&E"],"qr.unavailable":["Không tìm thấy hoặc không có quyền xem","未找到或无权查看"],"qr.inactive":["Hồ sơ đã ngừng sử dụng","记录已停用"],"qr.expired":["Tem đã hết hiệu lực","标签已失效"],"qr.not_in_restored":["Không có mã này trong dữ liệu hiện tại; dữ liệu đã khôi phục về bản sao lưu cũ, tem in sau thời điểm đó cần in lại","当前数据中无此码；数据已恢复至旧备份，此后打印的标签需重新打印"],"qr.scan_hint":["Dùng nút Quét trong app, không dùng app Camera","请使用应用内扫码，不要用相机应用"],"qr.label_small":["Nhỏ 70 × 37 mm (24 tem/A4)","小 70 × 37 mm（每张A4 24枚）"],"qr.label_large":["Lớn 105 × 74 mm (8 tem/A4)","大 105 × 74 mm（每张A4 8枚）"],"qr.offset":["Chỉnh lệch lề (mm)","边距微调（毫米）"],"qr.print_hint":["Dùng In của trình duyệt hoặc Lưu PDF; khổ A4, lề 0","请使用浏览器打印或另存为PDF；A4纸，边距0"],"qr.print_standalone":["Trên app Màn hình chính iPhone không in trực tiếp được: mở bằng Safari hoặc máy tính","iPhone主屏幕应用无法直接打印：请用Safari或电脑打开"],"misc.interim":["Màn đầy đủ đang được làm trong Đợt 1; tạm thời chỉ xem dữ liệu đã tải","完整页面正在第一阶段开发中，暂时只能查看已下载数据"],"qr.test_env_warning":["Môi trường THỬ: không in tem thật","测试环境：请勿打印正式标签"],"qr.entity.EQUIPMENT":["Thiết bị","设备"],"qr.entity.MATERIAL":["Vật tư","物料"],"qr.entity.INSPECTION_REQUIREMENT":["Yêu cầu kiểm định","检验要求"],"qr.entity.CONTRACT":["Hợp đồng thuê ngoài","外包合同"],"qr.entity.INSPECTION":["Lần kiểm định","检验记录"],"i18n.lang_vi":["Tiếng Việt","越南语"],"i18n.lang_zh":["Tiếng Trung","中文"],"i18n.checked":["Đã kiểm tra bản dịch","已核对译文"],"doc.too_large":["Tệp quá lớn để mở trong app","文件过大，无法在应用内打开"],"doc.photo_warning":["Không chụp hợp đồng/chứng nhận vào mục ảnh","请勿将合同或证书作为照片上传"],"doc.upload_too_large_mobile":["Tệp trên {N} MB: hãy tải lên từ máy tính","超过{N} MB的文件请在电脑上上传"],"doc.none":["Chưa có tài liệu","暂无文件"],"doc.uploading":["Đang tải lên…","正在上传…"],"doc.offline_saved":["Đã lưu để xem ngoại tuyến","已保存以便离线查看"],"err.network":["Không kết nối được máy chủ","无法连接服务器"],"err.unknown_result":["Chưa rõ kết quả, đang hỏi lại máy chủ","结果未知，正在向服务器确认"],"err.client":["Lỗi trên máy","本机错误"],"err.not_found":["Không tìm thấy","未找到"],"err.forbidden":["Không có quyền","无权限"],"login":["Đăng nhập","登录"],"employee_code":["Mã nhân viên","员工编号"],"pin6":["PIN 6 số","六位数字密码"],"forgot_pin":["Quên PIN","忘记PIN"],"forgot_pin_help":["Liên hệ quản trị để đặt lại PIN","请联系管理员重置密码"],"same_account":["Dùng cùng tài khoản với iPhone","与iPhone使用同一账户"],"shared_device":["Máy dùng chung","公用设备"],"switch_user":["Đăng nhập người khác","切换用户"],"show_pin":["Hiện PIN","显示PIN"],"change_pin":["Đổi PIN","修改PIN"],"temp_pin":["Bạn đang dùng PIN tạm, hãy đặt PIN mới","您正在使用临时PIN，请设置新PIN"],"current_pin":["PIN hiện tại","当前PIN"],"new_pin":["PIN mới","新PIN"],"new_pin_again":["Nhập lại PIN mới","确认新PIN"],"pin_mismatch":["Hai lần nhập PIN mới không khớp","两次输入的新PIN不一致"],"no_reuse_pin":["Không dùng lại PIN của app khác","请勿重复使用其他应用的PIN"],"pin_weak":["PIN quá dễ đoán, hãy chọn PIN khác","PIN过于简单，请换一个"],"pin_format":["PIN phải gồm đúng 6 chữ số","PIN必须为6位数字"],"offline_unlock":["Mở khóa ngoại tuyến","离线解锁"],"open_with_pin":["Mở bằng PIN","用PIN打开"],"attempts_left":["Còn {N} lần thử","还可尝试 {N} 次"],"locked":["Tạm khóa do nhập sai PIN nhiều lần, thử lại sau {N} phút","因多次输错PIN已暂时锁定，请 {N} 分钟后重试"],"revoked":["Phiên đã bị thu hồi hoặc quyền đã thay đổi","会话已撤销或权限已变更"],"session_warn":["Phiên sắp hết hạn","会话即将到期"],"relogin":["Đăng nhập lại","重新登录"],"logout":["Đăng xuất","退出登录"],"offline":["Ngoại tuyến","离线"],"local_saved":["Đã lưu trên máy","已保存在本机"],"queued":["Chờ gửi","待同步"],"sending":["Đang gửi","同步中"],"committed":["Đã lưu máy chủ","已同步"],"conflict":["Xung đột, cần xử lý","冲突，需处理"],"failed":["Lỗi gửi","同步失败"],"last_sync":["Lần đồng bộ cuối","上次同步"],"sync_now":["Đồng bộ ngay","立即同步"],"need_network":["Cần kết nối mạng","需要网络连接"],"safari_tab":["Đang chạy trong Safari: nháp có thể bị xóa sau 7 ngày không mở","在Safari中运行：7天未打开草稿可能被清除"],"dataset_reset":["Dữ liệu đã được đặt lại, cần tải lại","数据已重置，需重新加载"],"maintenance":["Hệ thống đang bảo trì","系统维护中"],"network_error":["Không kết nối được máy chủ","无法连接服务器"],"unknown_result":["Chưa rõ kết quả, đang hỏi lại máy chủ","结果未知，正在向服务器确认"],"server_url":["Địa chỉ máy chủ (/exec)","服务器地址 (/exec)"],"server_url_missing":["Chưa có địa chỉ máy chủ","尚未设置服务器地址"],"server_url_bad":["Link phải có dạng https://script.google.com/macros/s/…/exec","链接格式应为 https://script.google.com/macros/s/…/exec"],"save":["Lưu","保存"],"cancel":["Hủy","取消"],"back":["Quay lại","返回"],"download":["Tải về","下载"],"open_save":["Mở / Lưu","打开/保存"],"set_private":["Đặt riêng tư","设为私有"],"export_backup":["Xuất dự phòng","导出备份"],"pending_code":["Chờ cấp mã","待分配编号"],"machine_translated":["dịch máy","机器翻译"],"no_translation":["Chưa có bản dịch","暂无译文"],"sample_data":["Dữ liệu mẫu","示例数据"],"scan":["Quét QR","扫码"],"scan_hint":["Dùng nút Quét trong app, không dùng app Camera","请使用应用内扫码，不要用相机应用"],"open_in_app":["Mở app M&E và dùng nút Quét","请打开M&E应用并使用扫码按钮"],"continue_here":["Tiếp tục trong Safari","在Safari中继续"],"manual_code":["Nhập mã","输入编号"],"qr_foreign":["Mã này không thuộc M&E","此码不属于M&E"],"qr_unavailable":["Không tìm thấy hoặc không có quyền xem","未找到或无权查看"],"qr_inactive":["Hồ sơ đã ngừng sử dụng","记录已停用"],"qr_expired":["Tem đã hết hiệu lực","标签已失效"],"qr_not_in_restored":["Không có mã này trong dữ liệu hiện tại","当前数据中无此码"],"doc_too_large":["Tệp quá lớn để mở trong app","文件过大，无法在应用内打开"],"upload_too_large_mobile":["Tệp trên {N} MB: hãy tải lên từ máy tính","超过{N} MB的文件请在电脑上上传"],"photo_warning":["Không chụp hợp đồng/chứng nhận vào mục ảnh","请勿将合同或证书作为照片上传"],"coming_soon":["Sắp có","即将推出"],"env_test":["THỬ","测试"],"poc_title":["Kiểm thử PoC","PoC测试"],"equipment":["Thiết bị","设备"],"inspections":["Kiểm định","检验"],"gmail.settings":["Cài đặt gửi","发送设置"],"gmail.enabled":["Bật gửi Gmail nhắc hạn","启用Gmail到期提醒"],"gmail.enabled_on":["Đang bật","已启用","green"],"gmail.enabled_off":["Đang tắt","已关闭","grey"],"gmail.hour":["Giờ gửi hằng ngày","每日发送时间"],"gmail.stages":["Mốc gửi cố định: còn 40, 30, 14, 7, 3, 1 ngày, đến hạn; quá hạn nhắc mỗi 7 ngày","固定提醒节点：剩余40、30、14、7、3、1天及到期当天；逾期每7天提醒一次"],"gmail.quota":["Hạn mức gửi còn lại hôm nay: {N} thư","今日剩余发送额度：{N}封"],"gmail.test_send":["Gửi thử","发送测试邮件"],"gmail.test_sent":["Đã gửi thử tới {N} người nhận đã xác nhận","已向{N}位已确认收件人发送测试邮件"],"gmail.recipients":["Người nhận","收件人"],"gmail.recipient":["Người nhận","收件人"],"gmail.email":["Địa chỉ email","邮箱地址"],"gmail.scope":["Nhận nhắc","接收提醒"],"gmail.scope.ALL":["Kiểm định và hợp đồng","检验和合同"],"gmail.scope.INSPECTION":["Chỉ kiểm định","仅检验"],"gmail.scope.CONTRACT":["Chỉ hợp đồng","仅合同"],"gmail.user":["Tài khoản gắn kèm (không bắt buộc)","关联账号（可选）"],"gmail.user_hint":["Gắn tài khoản thì chỉ nhận hồ sơ tài khoản đó được xem; tài khoản bị khóa thì ngừng nhận","关联账号后仅接收该账号可查看的记录；账号停用后停止接收"],"gmail.confirmed":["Đã xác nhận","已确认","green"],"gmail.unconfirmed":["Chưa xác nhận — chưa gửi","未确认——不发送","amber"],"gmail.confirm":["Xác nhận địa chỉ này đúng và được phép nhận thư","确认该地址正确且可以接收邮件"],"gmail.confirm_hint":["Đổi địa chỉ email thì phải xác nhận lại","更改邮箱地址后需重新确认"],"gmail.active":["Đang dùng","使用中"],"gmail.inactive":["Ngừng gửi","停止发送","grey"],"gmail.add_recipient":["Thêm người nhận","新增收件人"],"gmail.log":["Nhật ký gửi","发送记录"],"gmail.log_empty":["Chưa có thư nào","暂无邮件"],"gmail.stage":["Mốc","节点"],"gmail.resend_confirm":["Thư này có thể đã tới người nhận. Gửi lại một lần nữa?","该邮件可能已送达。确定再发送一次？"],"gmail.c3_masked":["Cấp 3 chỉ xem, địa chỉ email được che","三级仅可查看，邮箱地址已隐藏"],"gmail.error":["Lỗi","错误"],"gmail.turn_on":["Bật gửi Gmail","开启Gmail发送"],"gmail.turn_off":["Tắt gửi Gmail","关闭Gmail发送"],"adm.user.add":["Thêm người dùng","新增用户"],"adm.user.code":["Mã nhân viên","员工编号"],"adm.user.email":["Email (không bắt buộc)","邮箱（可选）"],"adm.user.last_login":["Đăng nhập cuối","最近登录"],"adm.user.sessions":["Phiên đang mở","在线会话"],"adm.user.temp_pin_title":["PIN tạm","临时PIN"],"adm.user.temp_pin_once":["PIN tạm chỉ hiện một lần. Ghi lại và đưa tận tay người dùng; hạn {H} giờ, đăng nhập xong phải đổi PIN","临时PIN只显示一次。请记下并当面交给用户；有效期{H}小时，登录后必须修改PIN"],"adm.user.temp_pin_until":["Hạn PIN tạm","临时PIN到期"],"adm.user.self_note":["Tài khoản của bạn: đổi PIN ở trang Tài khoản","这是您的账号：请在账户页修改PIN"],"adm.user.owner_note":["Chủ hệ thống: chỉ chủ hệ thống thao tác được","系统所有者：仅系统所有者可操作"],"adm.user.confirm_lock":["Khóa tài khoản này? Mọi phiên sẽ bị thu hồi","锁定该账号？所有会话将被撤销"],"adm.user.confirm_reset":["Cấp PIN tạm mới? PIN cũ hết dùng, mọi phiên bị thu hồi","发放新的临时PIN？旧PIN失效，所有会话将被撤销"],"adm.user.confirm_revoke":["Thu hồi mọi phiên của người này? Họ phải đăng nhập lại","撤销该用户的所有会话？该用户需重新登录"],"adm.user.pin_locked":["Đang khóa do nhập sai PIN","因输错PIN被锁定","amber"],"adm.user.role_note":["Đổi cấp hoặc vai trò làm mọi phiên của người này hết hiệu lực","修改级别或岗位后，该用户所有会话失效"],"adm.user.total":["{N} tài khoản","共{N}个账号"],"btn.reset_pin":["Cấp PIN tạm","发放临时PIN"],"btn.lock":["Khóa","锁定"],"btn.unlock":["Mở khóa","解锁"],"btn.set_role":["Đổi cấp/vai trò","修改级别/岗位"],"btn.revoke_sessions":["Thu hồi phiên","撤销会话"],"btn.copied":["Đã chép","已复制"],"btn.copy":["Chép","复制"],"perm_flag.V":["Xem","查看"],"perm_flag.C":["Tạo","新建"],"perm_flag.E":["Sửa","编辑"],"perm_flag.A":["Duyệt","审批"],"perm_flag.I":["Nhập Excel","导入"],"perm_flag.X":["Xuất","导出"],"perm_flag.$":["Xem giá","查看价格"],"perm_flag.R":["Xóa sạch","清空"],"perm_module.catalog":["Danh mục chung","基础数据"],"perm_module.users":["Người dùng","用户"],"perm_module.notifications":["Nhắc hạn, Gmail","提醒与邮件"],"perm_module.audit":["Nhật ký","日志"],"perm_module.backup":["Sao lưu","备份"],"perm_module.system":["Hệ thống","系统"],"adm.perm.review_note":["Duyệt bảng quyền này trước khi nhập dữ liệu thật","录入真实数据前请先审核本权限表"],"adm.perm.locked":["Ô khóa: không sửa trong app","锁定项：不能在应用中修改"],"adm.perm.ceiling":["Vượt trần quyền của cấp này","超出该级别的权限上限"],"adm.perm.unsaved":["Đã đổi {N} ô, chưa lưu","已修改{N}项，未保存"],"adm.perm.saved":["Đã lưu, có hiệu lực ngay","已保存，立即生效"],"adm.perm.subrole_map":["Vai trò cấp 2 → module chính (cố định trong mã, chỉ đọc)","二级岗位→主模块（代码固定，只读）"],"adm.perm.legend":["V Xem · C Tạo · E Sửa · A Duyệt · I Nhập Excel · X Xuất · $ Xem giá · R Xóa sạch","V查看 · C新建 · E编辑 · A审批 · I导入 · X导出 · $查看价格 · R清空"],"adm.cat.locations":["Khu vực","区域"],"adm.cat.vendors":["Nhà cung cấp","供应商"],"adm.cat.lookups":["Danh mục tra cứu","查找值"],"adm.cat.glossary":["Thuật ngữ","术语表"],"location_type.AREA":["Khu vực","区域"],"location_type.BUILDING":["Tòa nhà","楼栋"],"location_type.WORKSHOP":["Xưởng","车间"],"location_type.ROOM":["Phòng","房间"],"location_type.STATION":["Trạm","站"],"location_type.OTHER":["Khác","其他"],"field.location_code":["Mã khu vực","区域编号"],"field.parent_location":["Khu vực cha","上级区域"],"field.location_type":["Loại khu vực","区域类型"],"field.vendor_code":["Mã nhà cung cấp","供应商编号"],"field.vendor_name":["Tên nhà cung cấp","供应商名称"],"field.contact_name":["Người liên hệ","联系人"],"field.phone":["Điện thoại","电话"],"field.email":["Email","邮箱"],"field.address":["Địa chỉ","地址"],"field.services":["Dịch vụ","服务内容"],"field.lookup_group":["Nhóm","分组"],"field.lookup_code":["Mã","编码"],"field.lookup_code_hint":["Mẫu thông số: chữ thường, số, gạch dưới (vd belt_speed). Mã không đổi sau khi tạo","参数模板：小写字母、数字、下划线（如 belt_speed）。创建后编码不可修改"],"field.term_vi":["Thuật ngữ tiếng Việt","越南语术语"],"field.term_zh":["Thuật ngữ tiếng Trung","中文术语"],"field.in_use":["Đang dùng","使用中"],"catalog.active":["Đang dùng","使用中","green"],"catalog.inactive":["Ngừng dùng","停用","grey"],"glossary.approved":["Đã duyệt","已审核","green"],"glossary.unapproved":["Chưa duyệt — chưa dùng khi dịch","未审核——翻译时不使用","amber"],"glossary.approve":["Duyệt để dùng khi dịch máy","审核后用于机器翻译"],"glossary.help":["Chỉ thuật ngữ đã duyệt mới được dùng khi dịch máy; đổi thuật ngữ phải duyệt lại","只有已审核的术语才会用于机器翻译；修改术语后需重新审核"],"adm.backup.note":["Tự động hằng tuần ({D}, {H}:00), giữ {N} bản đã kiểm chứng. Khôi phục làm thủ công theo hướng dẫn","每周自动备份（{D} {H}:00），保留{N}份已校验备份。恢复需按指南手动操作"],"adm.backup.queued":["Đang chờ sao lưu, màn tự cập nhật…","等待备份中，页面自动刷新…"],"adm.backup.rows":["Số dòng","行数"],"adm.backup.docs":["Tài liệu","文件"],"adm.backup.time":["Thời điểm","时间"],"adm.backup.retry":["Chạy lại sau ghi đồng thời","因同时写入而重跑"],"adm.backup.last":["Lần sao lưu gần nhất","最近一次备份"],"adm.backup.restored":["Đã khôi phục lúc {T} từ bản {R}","已于{T}从备份{R}恢复"],"adm.backup.none":["Chưa có bản sao lưu","暂无备份"],"adm.backup.running":["Đang sao lưu (thường 1–3 phút), màn tự cập nhật…","正在备份（通常1–3分钟），页面自动刷新…"],"adm.backup.no_manifest":["Không có manifest.json: lần chạy bị dừng giữa chừng, xem Lần thực thi trong Apps Script","缺少manifest.json：运行中途停止，请查看Apps Script执行记录"],"adm.audit.tab_ops":["Thao tác","操作"],"adm.audit.tab_auth":["Đăng nhập","登录记录"],"adm.audit.before":["Trước","修改前"],"adm.audit.after":["Sau","修改后"],"adm.audit.user":["Người làm","操作人"],"adm.audit.time":["Thời gian","时间"],"adm.audit.action":["Thao tác","操作"],"adm.audit.entity":["Hồ sơ","记录"],"adm.audit.from":["Từ ngày","从"],"adm.audit.to":["Đến ngày","至"],"adm.audit.more":["Còn nữa — thu hẹp bộ lọc để xem thêm","还有更多——请缩小筛选范围"],"adm.audit.module_all":["Mọi module","全部模块"],"adm.audit.sessions":["Phiên đang hiệu lực","有效会话"],"adm.audit.attempts":["Lần đăng nhập gần đây","最近登录尝试"],"auth_outcome.SUCCESS":["Thành công","成功","green"],"auth_outcome.FAILED":["Sai PIN","PIN错误","red"],"auth_outcome.LOCKED":["Đang khóa","已锁定","red"],"auth_outcome.PAUSED":["Tạm dừng đăng nhập","暂停登录","amber"],"auth_outcome.DISABLED":["Tài khoản ngừng dùng","账号已停用","grey"],"auth_outcome.TEMP_PIN_EXPIRED":["PIN tạm hết hạn","临时PIN已过期","amber"],"auth_outcome.MUST_CHANGE_PIN":["Đăng nhập bằng PIN tạm","使用临时PIN登录","amber"],"auth_kind.LOGIN":["Đăng nhập","登录"],"auth_kind.REAUTH":["Nhập lại PIN","重新输入PIN"],"auth_kind.CHANGE_PIN":["Đổi PIN","修改PIN"],"adm.status.ok":["Đạt","正常","green"],"adm.status.warn":["Cảnh báo","警告","amber"],"adm.status.checked_at":["Kiểm lúc {T}","检查于{T}"],"adm.status.settings":["Cấu hình","系统设置"],"adm.status.readonly":["Chỉ đọc","只读","grey"],"adm.status.default":["Mặc định","默认"],"adm.status.maint_note":["Bật/tắt bảo trì chạy từ trình soạn Apps Script (adminMaintenanceOn/Off)","维护模式在Apps Script编辑器中开关（adminMaintenanceOn/Off）"],"adm.status.base_mismatch":["Khác địa chỉ app đang dùng ({U})","与当前应用地址不同（{U}）"],"adm.status.edit_setting":["Sửa cấu hình","修改设置"],"health.schema_version":["Phiên bản schema","架构版本"],"health.server_version":["Phiên bản máy chủ","服务器版本"],"health.dataset_epoch":["Thế hệ dữ liệu","数据批次"],"health.env":["Môi trường","环境"],"health.maintenance":["Bảo trì","维护模式"],"health.triggers":["Trigger đã cài","已安装触发器"],"health.trigger_minutes_24h":["Phút chạy trigger trong 24 giờ","24小时触发器运行分钟数"],"health.last_backup":["Sao lưu gần nhất","最近备份"],"health.mt_paused_until":["Tạm dừng dịch máy đến","机器翻译暂停至"],"health.login_paused_until":["Tạm dừng đăng nhập đến","登录暂停至"],"health.mail_quota":["Hạn mức Gmail còn lại hôm nay","今日Gmail剩余额度"],"health.last_mail_sent":["Thư nhắc hạn gửi gần nhất","最近发送的提醒邮件"],"health.app_base_url":["Địa chỉ app trong email","邮件中的应用地址"],"health.permissions_ceiling":["Ô quyền vượt trần hoặc thiếu","超出上限或缺失的权限项"],"health.documents_broken":["Tài liệu không mở được","无法打开的文件"],"health.spreadsheet_cells":["Số ô bảng tính (giới hạn 5 triệu)","表格单元格数（上限500万）"],"adm.perm.module":["Module","模块"],"excel.title":["Nhập/xuất Excel","Excel导入导出"],"excel.tpl.glossary":["Thuật ngữ","术语表"],"excel.tpl.locations":["Khu vực","区域"],"excel.tpl.lookups":["Danh mục tra cứu","查找值"],"excel.tpl.vendors":["Nhà cung cấp","供应商"],"excel.tpl.materials":["Vật tư","物料"],"excel.tpl.equipment":["Thiết bị và thông số","设备及参数"],"excel.tpl.equipment_parts":["Linh kiện theo máy","设备配件"],"excel.tpl.inspection_types":["Loại kiểm định","检验类型"],"excel.tpl.inspection_requirements":["Yêu cầu kiểm định","检验要求"],"excel.tpl.inspections":["Chứng nhận kiểm định","检验证书"],"excel.tpl.contracts":["Hợp đồng và thiết bị","合同及设备"],"excel.tpl.alerts":["Nhắc hạn","到期提醒"],"excel.download_template":["Tải mẫu","下载模板"],"excel.choose_file":["Chọn tệp .xlsx để nhập","选择要导入的.xlsx文件"],"excel.reading":["Đang đọc tệp…","正在读取文件…"],"excel.sending":["Đang gửi kiểm tra {N}/{T} dòng…","正在提交校验 {N}/{T} 行…"],"excel.committing":["Đang ghi {N}/{T} dòng…","正在写入 {N}/{T} 行…"],"excel.summary":["Kết quả kiểm tra","校验结果"],"excel.add":["Thêm mới","新增"],"excel.update":["Cập nhật","更新"],"excel.errors":["Lỗi","错误"],"excel.mt_fields":["{N} trường sẽ được dịch máy sau khi nhập","导入后将机器翻译{N}个字段"],"excel.sensitive":["Lô nhạy cảm: người khác người nhập duyệt và ghi, có PIN; ghi là duyệt","敏感批次：须由导入人以外的人员审核写入（需PIN），写入即审核"],"excel.btn_commit":["Nhập dữ liệu","导入数据"],"excel.btn_submit":["Gửi duyệt","提交审核"],"excel.btn_cancel":["Hủy lô","取消批次"],"excel.btn_errors":["Tải danh sách lỗi","下载错误清单"],"excel.btn_open":["Mở lô","打开批次"],"excel.changes":["Trước – sau","修改前后"],"excel.sheet":["Sheet","工作表"],"excel.row":["Dòng","行"],"excel.field":["Cột","列"],"excel.batches":["Lô gần đây","最近批次"],"excel.committed":["Đã ghi {N} dòng","已写入{N}行"],"excel.failed_rows":["{N} dòng lỗi khi ghi","写入失败{N}行"],"excel.blocked":["Có lỗi: sửa tệp rồi chọn lại, nút Nhập dữ liệu bị khóa","有错误：请修改文件后重新选择，导入按钮已锁定"],"excel.wait_approval":["Đã gửi duyệt, chờ Trưởng bộ phận/Quản trị ghi","已提交审核，等待主管/管理员写入"],"excel.due":["Lọc hạn","期限筛选"],"excel.due.ALL":["Tất cả","全部"],"excel.due.DUE40":["Trong 40 ngày và quá hạn","40天内及已逾期"],"excel.due.OVERDUE":["Quá hạn","已逾期"],"excel.guide.title":["Hướng dẫn","使用说明"],"excel.guide.1":["Dòng 1 là khóa cột, không sửa; dòng 2 là nhãn; nhập dữ liệu từ dòng 3","第1行为列键，请勿修改；第2行为标签；从第3行开始填写"],"excel.guide.2":["Thêm mới: để trống cột ID. Sửa: giữ ID và record_version từ file xuất","新增：ID列留空。修改：保留导出文件中的ID和record_version"],"excel.guide.3":["Ngày ghi dd/mm/yyyy; mã là chữ (giữ số 0 đầu); không dùng công thức","日期格式dd/mm/yyyy；编号为文本（保留前导0）；不要使用公式"],"excel.guide.4":["Xóa một dòng trong file không xóa hồ sơ","在文件中删除行不会删除记录"],"excel.guide.5":["Chỉ cần nhập một thứ tiếng; máy chủ dịch sau khi nhập","只需填写一种语言；导入后服务器自动翻译"],"excel.guide.6":["Thứ tự nhập: thuật ngữ → khu vực → danh mục tra cứu → nhà cung cấp → vật tư → thiết bị → linh kiện → loại kiểm định → yêu cầu kiểm định → chứng nhận → hợp đồng","导入顺序：术语→区域→查找值→供应商→物料→设备→配件→检验类型→检验要求→证书→合同"],"excel.lists":["Danh mục mã","编码清单"],"excel.filters":["Điều kiện lọc","筛选条件"],"excel.generated_at":["Lúc tạo","生成时间"],"excel.generated_by":["Người tạo","生成人"],"excel.scope":["Phạm vi","范围"],"excel.required":["Bắt buộc","必填"],"excel.options":["Giá trị cho phép","允许值"],"excel.no_rows":["Tệp không có dòng dữ liệu (từ dòng 3)","文件没有数据行（从第3行起）"],"excel.bad_file":["Không đọc được tệp hoặc thiếu sheet {S}","无法读取文件或缺少工作表{S}"],"excel.exported":["Đã tạo tệp Excel","已生成Excel文件"],"i18n.suggest":["Gợi ý dịch","翻译建议"],"i18n.suggest_need_one":["Nhập một bên rồi bấm Gợi ý dịch","先填写一种语言再点翻译建议"],"i18n.check_required":["Tick \"Đã kiểm tra bản dịch\" trước khi lưu","保存前请勾选\"已核对译文\""],"i18n.retranslate":["Dịch lại","重新翻译"],"i18n.retranslated":["Đã dịch lại","已重新翻译"],"i18n.still_pending":["Dịch chưa được, thử lại sau","暂时无法翻译，请稍后再试"]};
