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
