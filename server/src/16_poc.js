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
