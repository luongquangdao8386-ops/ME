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
