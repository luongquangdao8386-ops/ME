/**
 * M&E · 机电管理 — Code.gs 1.0.0-poc.4
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
var SERVER_VERSION = '1.0.0-poc.4';
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
    cols: 'recipient_id email user_id location_scope entity_scope active' },
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
    if (!mtEnabled_() || now_().getTime() > budgetEnd) { meta[f] = { src: src, state: 'PENDING', at: nowIso }; return; }
    var out = mtTranslate_(text, src, src === 'vi' ? 'zh' : 'vi');
    if (out) {
      values[src === 'vi' ? kz : kv] = out;
      meta[f] = { src: src, state: 'MACHINE', at: nowIso };
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
  return out;
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
  'system.getPublicState': function (req) { return publicState_(req); },
  'system.health': function () { return { app_id: APP_ID }; },
  'sync.bootstrap': function (ctx) { return syncBootstrap_(ctx); },
  'sync.changes': function (ctx) { return syncChanges_(ctx); },
  'sync.push': function (ctx) { return syncPush_(ctx); },
  'sync.getOperationStatus': function (ctx) { return syncOpStatus_(ctx); },
  'equipment.view': function (ctx) { return equipmentView_(ctx); },
  'equipment.create': function (ctx) { return equipmentCreate_(ctx); },
  'equipment.edit': function (ctx) { return equipmentEdit_(ctx); },
  'inspection.view': function (ctx) { return inspectionView_(ctx); },
  'inspection.submit': function (ctx) { return inspectionSubmit_(ctx); },
  'catalog.view': function (ctx) { return catalogView_(ctx); },
  'doc.view': function (ctx) { return docView_(ctx); },
  'doc.upload': function (ctx) { return docUpload_(ctx); },
  'doc.download': function (ctx) { return docDownload_(ctx); },
  'doc.thumbs': function (ctx) { return docThumbs_(ctx); },
  'doc.setPrivate': function (ctx) { return docSetPrivate_(ctx); },
  'qr.resolve': function (ctx) { return qrResolve_(ctx); },
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
  // 8. Hỏi lại PIN
  if (def.net === 'pin' && !verifyReauth_(ctx, req.reauth_token)) throw apiError_('REAUTH_REQUIRED');
  // Bước 4–5: module cố định thì kiểm ngay; module theo hồ sơ ('*', '*work', 'contracts|inspections')
  // thì thao tác gọi authorize_ với hồ sơ đích. Action '-' chỉ xét ô theo cấp/subrole.
  var dynamic = def.module === '*' || def.module === '*work' || def.module === 'contracts|inspections';
  if (def.module === '-') {
    if (!evalCells_(ctx, def, null).allowed) throw apiError_('FORBIDDEN');
  } else if (!dynamic) {
    ctx.auth = authorize_(ctx, req.action, null);
  }
  ctx.viaPush = !!viaPush;
  var out = HANDLERS_[req.action](ctx);
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

function equipmentView_(ctx) {
  var p = ctx.req.payload;
  var qm = qrMap_();
  if (p.equipment_id) {
    var r = findOne_('Equipment', 'equipment_id', p.equipment_id);
    if (!r) throw apiError_('NOT_FOUND');
    var o = projectRow_(ctx, r, 'Equipment');
    o.qr_key = qm[r.equipment_id] || null;
    return { item: o };
  }
  var rows = readRows_('Equipment').filter(function (r) { return p.include_archived || !r.archived_at; });
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
    lookups: readRows_('LookupValues').map(function (r) { return projectRow_(ctx, r, 'LookupValues'); })
  };
}

// ===== 11_inspection.js =====
/* 11_inspection: Kiểm định (phần PoC: nộp kết quả, xem) — 1.4 §5.9, phụ lục 1.5 mục 3.17, 4.4.9 */

var INSPECTION_RESULT_ = ['PASS', 'FAIL', 'CONDITIONAL_PASS'];

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
        cost: p.cost === undefined || p.cost === '' ? '' : Number(p.cost), currency: p.cost ? (p.currency || setting_('default_currency')) : '',
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

function inspectionView_(ctx) {
  return {
    types: readRows_('InspectionTypes').map(function (r) { return projectRow_(ctx, r, 'InspectionTypes'); }),
    requirements: readRows_('InspectionRequirements').map(function (r) { return projectRow_(ctx, r, 'InspectionRequirements'); }),
    inspections: readRows_('Inspections').map(function (r) { return projectRow_(ctx, r, 'Inspections'); })
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

// ===== 13_sync.js =====
/* 13_sync: sync.bootstrap, sync.changes, sync.push, sync.getOperationStatus (phụ lục 1.5 mục 3.15) */

var SYNC_ENTITIES_ = [
  { type: 'LOCATION', sheet: 'Locations', action: 'catalog.view', module: 'catalog' },
  { type: 'VENDOR', sheet: 'Vendors', action: 'catalog.view', module: 'catalog' },
  { type: 'LOOKUP', sheet: 'LookupValues', action: 'catalog.view', module: 'catalog' },
  { type: 'EQUIPMENT', sheet: 'Equipment', action: 'equipment.view', module: 'equipment', qr: true },
  { type: 'INSPECTION_TYPE', sheet: 'InspectionTypes', action: 'inspection.view', module: 'inspections' },
  { type: 'INSPECTION_REQUIREMENT', sheet: 'InspectionRequirements', action: 'inspection.view', module: 'inspections', qr: true },
  { type: 'INSPECTION', sheet: 'Inspections', action: 'inspection.view', module: 'inspections', qr: true },
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
  var o = projectRow_(ctx, row, ent.sheet);
  if (ent.qr) o.qr_key = qm[o[sheetSchema_(ent.sheet).key]] || null;
  return o;
}

function visibleEntities_(ctx) {
  return SYNC_ENTITIES_.filter(function (ent) {
    if (!ent.module) return true;
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
    perm_version: sysStateCached_().perm_version || 1, sync_cursor: String(nextCursor)
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

function adminFinalizeManualRestore() {
  throw new Error('Khôi phục thủ công (6.5.4) làm ở Đợt 1 sau PoC.');
}

/* ---------------- Trigger ---------------- */

/** Hằng ngày: (Đợt 1) tính Alerts và gửi email; dọn AuthAttempts > 90 ngày và Sessions cũ */
function sendExpiryDigest() {
  if (prop_('MAINTENANCE_MODE') === 'true') return;
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
  log_('sendExpiryDigest: đã dọn nhật ký đăng nhập và phiên cũ. Nhắc hạn Gmail bật ở Đợt 1 (sau PoC).');
}

var MT_SHEETS_ = { Equipment: ['name'], Documents: ['title'] };

/** Mỗi 3 giờ: dịch bù trường PENDING (2.3); không tăng record_version */
function runBackgroundJobs() {
  if (prop_('MAINTENANCE_MODE') === 'true') return;
  if (!mtEnabled_()) return;
  var t0 = Date.now();
  var done = 0;
  Object.keys(MT_SHEETS_).forEach(function (sheet) {
    if (Date.now() - t0 > 150000) return;
    readRows_(sheet).forEach(function (r) {
      if (Date.now() - t0 > 150000 || !r.i18n_meta) return;
      MT_SHEETS_[sheet].forEach(function (f) {
        var m = r.i18n_meta[f];
        if (!m || m.state !== 'PENDING') return;
        var srcText = trimStr_(r[f + '_' + m.src]);
        var out = mtTranslate_(srcText, m.src, m.src === 'vi' ? 'zh' : 'vi');
        if (!out) return;
        withWriteLock_(function () {
          var cur = readRowAt_(sheet, r.__row);
          var key = sheetSchema_(sheet).key;
          if (cur[key] !== r[key] || trimStr_(cur[f + '_' + m.src]) !== srcText) return;
          var meta = cur.i18n_meta || {};
          if (!meta[f] || meta[f].state !== 'PENDING') return;
          meta[f] = { src: m.src, state: 'MACHINE', at: isoVN_(now_()) };
          var st = readState_();
          var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
          var upd = { i18n_meta: meta, sync_revision: rev };
          upd[f + '_' + (m.src === 'vi' ? 'zh' : 'vi')] = out;
          writeCells_(sheet, r.__row, upd);
          var su = { sync_revision: ['INT', rev] };
          su['table_rev.' + sheet] = ['INT', rev];
          stateWrite_(st, su, SYSTEM_USER);
          writeAudit_({ user_id: SYSTEM_USER, action: 'i18n.machineTranslate', entity_type: sheet, entity_id: r[key], before_json: null, after_json: { field: f }, auth_basis: 'SYSTEM' });
          done++;
        });
      });
    });
  });
  log_('runBackgroundJobs: dịch bù ' + done + ' trường.');
}

/** Hằng tuần: sao lưu có kiểm chứng (6.5.4) — làm ở Đợt 1 sau PoC */
function backupData() {
  log_('backupData: sao lưu tự động sẽ có ở Đợt 1 (sau PoC).');
}

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
