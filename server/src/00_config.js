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
